-- ============================================================================
-- migration_ref_catalog_admin.sql — §211 Administration générée des catalogues
--
-- Spec : docs/superpowers/specs/2026-08-07-admin-catalogues-reference-design.md
--
-- DEUX SOURCES, UNE LISTE. internal.v_ref_catalog DÉCOUVRE (zéro configuration) ;
-- ref_catalog_registry porte l'ÉDITORIAL (nom lisible, famille, verrouillage motivé).
--
-- INVARIANT DE SÉCURITÉ : la liste blanche du RPC d'écriture est la VUE, jamais le
-- registre. Un registre vide laisse le système fonctionnel (dégradé) ; un registre
-- corrompu ne peut PAS ouvrir une écriture hors public.ref_*. Inverser les deux
-- transformerait une erreur de seed en élargissement de privilège.
--
-- Manifeste 16u. NON foldé dans schema_unified.sql. Idempotent.
-- ============================================================================

BEGIN;

CREATE OR REPLACE VIEW internal.v_ref_catalog AS
WITH cat AS (
  -- Espèce 'table' : relation ordinaire public.ref_* qui n'est PAS une partition.
  -- Le test pg_inherits est ce qui écarte les 55 partitions ref_code_<domain> TOUT EN
  -- GARDANT ref_code_domain_registry et ref_code_taxonomy_closure, qui portent le même
  -- préfixe sans être des partitions. Un filtre par nom les perdrait en silence.
  SELECT 'table'::text AS kind, c.relname::text AS catalog_key,
         c.relname::text AS table_name, NULL::text AS domain, c.oid AS reloid
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
    AND c.relname LIKE 'ref\_%' AND c.relname <> 'ref_code'
    AND NOT EXISTS (SELECT 1 FROM pg_inherits i WHERE i.inhrelid = c.oid)
  UNION ALL
  SELECT 'ref_code_domain'::text, 'ref_code:' || d.domain, 'ref_code'::text, d.domain, NULL::oid
  FROM (SELECT DISTINCT domain FROM public.ref_code) d
)
SELECT
  cat.kind, cat.catalog_key, cat.table_name, cat.domain,

  -- Un domaine n'est PAS une relation : reloid est NULL et pg_attribute ne rendrait rien.
  -- On synthétise la forme ÉDITABLE de ref_code (celle que la phase 7.5 sait écrire) :
  -- code, name, name_i18n, position, is_active (spec §"Modèle de découverte", 5 champs).
  -- `id` N'EST PAS répété ici : il vit dans primary_key_columns, pas dans le formulaire
  -- éditable — le dupliquer ferait dériver ce littéral synthétisé de son propre design.
  CASE WHEN cat.kind = 'ref_code_domain' THEN
    '[{"name":"code","type":"text","is_required":true,"has_default":false,"position":1,"enum_values":null},
      {"name":"name","type":"text","is_required":true,"has_default":false,"position":2,"enum_values":null},
      {"name":"name_i18n","type":"jsonb","is_required":false,"has_default":true,"position":3,"enum_values":null},
      {"name":"position","type":"integer","is_required":false,"has_default":true,"position":4,"enum_values":null},
      {"name":"is_active","type":"boolean","is_required":false,"has_default":true,"position":5,"enum_values":null}]'::jsonb
  ELSE COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'name', a.attname,
             'type', format_type(a.atttypid, a.atttypmod),
             'is_required', a.attnotnull,
             'has_default', (a.atthasdef OR a.attidentity <> ''),
             'position', a.attnum,
             'enum_values', CASE WHEN t.typtype = 'e' THEN (
                              SELECT jsonb_agg(e.enumlabel ORDER BY e.enumsortorder)
                              FROM pg_enum e WHERE e.enumtypid = t.oid)
                            ELSE NULL END) ORDER BY a.attnum)
    FROM pg_attribute a JOIN pg_type t ON t.oid = a.atttypid
    WHERE a.attrelid = cat.reloid AND a.attnum > 0 AND NOT a.attisdropped
  ), '[]'::jsonb) END AS columns,

  -- SYNTHÈSE OBLIGATOIRE pour les domaines : sans elle, primary_key_columns vaut [] et
  -- is_identifiable vaut false, donc le helper d'accès de la tâche 3 verrouille les
  -- 71 domaines SANS AUCUNE ERREUR. C'est le défaut le plus silencieux de ce chantier.
  CASE WHEN cat.kind = 'ref_code_domain'
    THEN '[{"name":"id","type":"uuid"}]'::jsonb
    ELSE COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'name', a.attname, 'type', format_type(a.atttypid, a.atttypmod)) ORDER BY x.ord)
      FROM pg_constraint k
      CROSS JOIN LATERAL unnest(k.conkey) WITH ORDINALITY AS x(attnum, ord)
      JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = x.attnum
      WHERE k.conrelid = cat.reloid AND k.contype = 'p'
    ), '[]'::jsonb) END AS primary_key_columns,

  CASE WHEN cat.kind = 'ref_code_domain' THEN true
       ELSE EXISTS (SELECT 1 FROM pg_constraint k
                    WHERE k.conrelid = cat.reloid AND k.contype = 'p') END AS is_identifiable,

  -- Cible NORMALISÉE en catalog_key : une FK vers une partition de ref_code doit rendre
  -- 'ref_code:<domaine>', sinon le front interroge un catalogue absent de la vue.
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'column', a.attname,
             'target', CASE
               WHEN EXISTS (SELECT 1 FROM pg_inherits i
                            WHERE i.inhrelid = pt.oid AND i.inhparent = 'public.ref_code'::regclass)
                 THEN 'ref_code:' || substring(pt.relname from length('ref_code_') + 1)
               ELSE pt.relname END))
    FROM pg_constraint k
    JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = k.conkey[1]
    JOIN pg_class pt ON pt.oid = k.confrelid
    WHERE k.conrelid = cat.reloid AND k.contype = 'f' AND array_length(k.conkey, 1) = 1
  ), '[]'::jsonb) AS outgoing_fk,

  -- Un domaine (espèce 'ref_code_domain') n'a pas de reloid propre : cat.reloid est NULL
  -- CAR CE N'EST PAS UNE RELATION, c'est une valeur distincte de la colonne ref_code.domain
  -- (cf. le CTE cat ci-dessus). Comparer k.confrelid à un reloid NULL n'est jamais vrai, donc
  -- SANS ce COALESCE incoming_fk valait '[]' pour LES 71 DOMAINES quelles que soient leurs FK
  -- entrantes réelles (ex. object_cuisine_type/object_menu_item_cuisine_type → ref_code_cuisine_type).
  -- On résout ici, seulement pour ce champ, l'OID de la PARTITION ref_code_<domaine> qui porte
  -- ces FK ; to_regclass rend NULL sans erreur si la partition n'existe pas (incoming_fk reste
  -- alors '[]' à bon droit). outgoing_fk/columns/primary_key_columns/is_identifiable ne sont
  -- volontairement PAS touchés : ils branchent déjà sur cat.kind et se synthétisent pour un
  -- domaine, un changement de cat.reloid global les aurait fait dériver sans rapport avec ce défaut.
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object('table', ct.relname, 'column', a.attname))
    FROM pg_constraint k
    JOIN pg_class ct ON ct.oid = k.conrelid
    JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = k.conkey[1]
    WHERE k.confrelid = COALESCE(cat.reloid, to_regclass('public.ref_code_' || cat.domain)::oid)
      AND k.contype = 'f' AND array_length(k.conkey, 1) = 1
  ), '[]'::jsonb) AS incoming_fk
FROM cat;

COMMENT ON VIEW internal.v_ref_catalog IS
'§211 — découverte automatique des catalogues de référence et de leur forme. Liste blanche des RPC d''écriture : une relation absente d''ici n''est PAS écrivable.';

-- ============================================================================
-- ref_catalog_registry — le REGISTRE ÉDITORIAL. Porte ce que la base ne peut pas
-- deviner (nom lisible, famille de rangement, verrouillage MÉTIER motivé).
--
-- Ne seede QUE les verrouillages métier. Les verrouillages STRUCTURELS (relation
-- sans clé primaire, domaine ref_code non éditable) sont DÉRIVÉS par les helpers
-- de la tâche 3 : aucune ligne ici pour ref_interop_crosswalk ni les domaines
-- taxonomy_* — une future table sans PK ne peut donc pas passer entre les mailles
-- d'un seed qu'on aurait oublié de mettre à jour.
--
-- Une table ABSENTE du registre reste visible et éditable, rangée en « À classer » :
-- le registre ne peut que RESTREINDRE (cf. design §3.2/§3.3).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ref_catalog_registry (
  catalog_key     text PRIMARY KEY,
  label           text NOT NULL,
  family          text NOT NULL,
  used_in         text,
  label_column    text,
  access          text NOT NULL DEFAULT 'editable',
  readonly_reason text,
  position        integer,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_ref_catalog_access CHECK (access IN ('editable', 'readonly')),
  CONSTRAINT chk_ref_catalog_readonly_reason
    CHECK (access <> 'readonly' OR NULLIF(TRIM(readonly_reason), '') IS NOT NULL)
);

COMMENT ON TABLE public.ref_catalog_registry IS
'§211 — registre éditorial des catalogues de référence : nom lisible, famille, verrouillage MÉTIER motivé. Les verrouillages STRUCTURELS (pas de PK, domaine ref_code non éditable) sont dérivés à la tâche 3, jamais seedés ici.';

ALTER TABLE public.ref_catalog_registry ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pub_ref_catalog_registry_read ON public.ref_catalog_registry;
CREATE POLICY pub_ref_catalog_registry_read ON public.ref_catalog_registry
  FOR SELECT USING (true);

DROP POLICY IF EXISTS admin_ref_catalog_registry_write ON public.ref_catalog_registry;
CREATE POLICY admin_ref_catalog_registry_write ON public.ref_catalog_registry
  FOR ALL USING ((SELECT api.is_platform_superuser()) IS TRUE)
           WITH CHECK ((SELECT api.is_platform_superuser()) IS TRUE);

GRANT SELECT ON public.ref_catalog_registry TO anon, authenticated;

DROP TRIGGER IF EXISTS update_ref_catalog_registry_updated_at ON public.ref_catalog_registry;
CREATE TRIGGER update_ref_catalog_registry_updated_at
  BEFORE UPDATE ON public.ref_catalog_registry
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Verrouillages MÉTIER uniquement. Les verrouillages structurels sont dérivés (tâche 3).
INSERT INTO public.ref_catalog_registry (catalog_key, label, family, used_in, access, readonly_reason) VALUES
  ('ref_permission', 'Permissions', 'Personnes et organisations', 'Administration de l''équipe', 'readonly',
   'Chaque code est lu en dur par le contrôle d''accès : en retirer un ferme des droits sans qu''aucun test ne rougisse.'),
  ('ref_facet_registry', 'Registre des facettes par type', 'Structure', NULL, 'readonly',
   'Source de vérité du trigger trg_assert_facet_applicable : la modifier ici ferait diverger l''écran et la contrainte en base.'),
  ('ref_facet_applicability', 'Applicabilité type → facette', 'Structure', NULL, 'readonly',
   'Source de vérité du trigger trg_assert_facet_applicable : la modifier ici ferait diverger l''écran et la contrainte en base.'),
  ('ref_code_domain_registry', 'Registre des domaines ref_code', 'Structure', NULL, 'readonly',
   'Décrit les domaines eux-mêmes (taxonomie, hiérarchie, type d''objet couplé) : se modifie par migration.'),
  ('ref_code_taxonomy_closure', 'Closure des taxonomies', 'Structure', NULL, 'readonly',
   'Table de fermeture reconstruite par trigger depuis parent_id : toute écriture manuelle serait écrasée.'),
  ('ref_document', 'Documents déposés', 'Juridique et conformité', '§08 Classements, §18 Juridique', 'readonly',
   'Ce ne sont pas des valeurs de vocabulaire mais les fichiers déposés par les rédacteurs.')
ON CONFLICT (catalog_key) DO UPDATE SET
  label = EXCLUDED.label, family = EXCLUDED.family, used_in = EXCLUDED.used_in,
  access = EXCLUDED.access, readonly_reason = EXCLUDED.readonly_reason, updated_at = now();

-- Surcharge de libellé : ref_sustainability_action porte `label` (pas `name`, pas `title`).
-- La cascade de la tâche 3 la trouverait seule ; la ligne existe pour le nom lisible.
INSERT INTO public.ref_catalog_registry (catalog_key, label, family) VALUES
  ('ref_sustainability_action', 'Actions de durabilité', 'Labels, classements, durabilité')
ON CONFLICT (catalog_key) DO UPDATE SET
  label = EXCLUDED.label, family = EXCLUDED.family, updated_at = now();

-- ----------------------------------------------------------------------------
-- Seed des 13 familles de l'annexe A (docs/superpowers/specs/2026-08-07-admin-
-- catalogues-reference-design.md). Couvre les 24 tables et 52 domaines plats
-- restants (les 7 lignes ci-dessus — 6 verrouillages métier + ref_sustainability_action
-- — sont déjà seedées). Un domaine ref_code plat se range par sa clé de registre
-- 'ref_code:<domaine>' (§3.1 bis).
--
-- Tout catalogue non listé ici (et non seedé ci-dessus) reste dans « À classer »
-- PAR CONSTRUCTION — c'est voulu, pas un oubli à combler.
--
-- Volontairement ABSENTS : ref_interop_crosswalk (aucune clé primaire) et les 19
-- domaines taxonomy_* — verrouillage STRUCTUREL dérivé à la tâche 3, jamais seedé.
-- ----------------------------------------------------------------------------
INSERT INTO public.ref_catalog_registry (catalog_key, label, family, used_in) VALUES
  -- Hébergement
  ('ref_code:accommodation_family', 'Familles d''hébergement', 'Hébergement', NULL),
  ('ref_code:accommodation_type', 'Types d''hébergement', 'Hébergement', NULL),
  ('ref_code:accommodation_unit_type', 'Types d''unité d''hébergement', 'Hébergement', NULL),
  ('ref_code:bed_type', 'Types de lit', 'Hébergement', NULL),
  ('ref_code:room_type', 'Types de chambre', 'Hébergement', NULL),
  ('ref_capacity_metric', 'Indicateurs de capacité', 'Hébergement', NULL),
  ('ref_capacity_applicability', 'Capacité applicable par type', 'Hébergement', NULL),
  -- Restauration
  ('ref_code:cuisine_type', 'Types de cuisine', 'Restauration', NULL),
  ('ref_code:menu_category', 'Catégories de menu', 'Restauration', NULL),
  ('ref_code:dietary_tag', 'Régimes alimentaires', 'Restauration', NULL),
  ('ref_code:allergen', 'Allergènes', 'Restauration', NULL),
  -- Activités et itinéraires
  ('ref_code:activity_type', 'Types d''activité', 'Activités et itinéraires', NULL),
  ('ref_code:event_type', 'Types d''événement', 'Activités et itinéraires', NULL),
  ('ref_code:iti_difficulty', 'Niveaux de difficulté', 'Activités et itinéraires', NULL),
  ('ref_code:iti_practice', 'Pratiques d''itinéraire', 'Activités et itinéraires', NULL),
  ('ref_code:iti_stage_kind', 'Types d''étape', 'Activités et itinéraires', NULL),
  ('ref_code:iti_open_status', 'Statuts d''ouverture de sentier', 'Activités et itinéraires', NULL),
  ('ref_code:trail_link_role', 'Rôles de liaison de sentier', 'Activités et itinéraires', NULL),
  ('ref_iti_assoc_role', 'Rôles d''association d''itinéraire', 'Activités et itinéraires', NULL),
  ('ref_trail_manager', 'Gestionnaires de sentier', 'Activités et itinéraires', NULL),
  ('ref_trail_source', 'Sources de référentiel sentier', 'Activités et itinéraires', NULL),
  ('ref_object_relation_type', 'Types de relation entre fiches', 'Activités et itinéraires', NULL),
  -- Équipements et cadre
  ('ref_amenity', 'Équipements et services', 'Équipements et cadre', NULL),
  ('ref_code:amenity_family', 'Familles d''équipement', 'Équipements et cadre', NULL),
  ('ref_code:meeting_equipment', 'Équipements de réunion', 'Équipements et cadre', NULL),
  ('ref_code:service_type', 'Types de service', 'Équipements et cadre', NULL),
  ('ref_code:view_type', 'Types de vue', 'Équipements et cadre', NULL),
  ('ref_code:environment_tag', 'Cadre et environnement', 'Équipements et cadre', NULL),
  ('ref_code:assistance_type', 'Types d''assistance', 'Équipements et cadre', NULL),
  ('ref_tag', 'Tags libres', 'Équipements et cadre', NULL),
  -- Labels, classements, durabilité
  ('ref_classification_scheme', 'Référentiels de classement', 'Labels, classements, durabilité', NULL),
  ('ref_classification_value', 'Niveaux de classement', 'Labels, classements, durabilité', NULL),
  ('ref_classification_scheme_applicability', 'Classements applicables par type', 'Labels, classements, durabilité', NULL),
  ('ref_classification_equivalent_group', 'Groupes d''équivalence de classement', 'Labels, classements, durabilité', NULL),
  ('ref_classification_equivalent_action', 'Actions d''équivalence de classement', 'Labels, classements, durabilité', NULL),
  ('ref_sustainability_action_category', 'Catégories d''actions de durabilité', 'Labels, classements, durabilité', NULL),
  ('ref_sustainability_action_group', 'Groupes d''actions de durabilité', 'Labels, classements, durabilité', NULL),
  -- Juridique et conformité
  ('ref_legal_type', 'Types de documents juridiques', 'Juridique et conformité', NULL),
  ('ref_code:insurance_type', 'Types d''assurance', 'Juridique et conformité', NULL),
  ('ref_code:document_type', 'Types de document', 'Juridique et conformité', NULL),
  -- Personnes et organisations
  ('ref_contact_role', 'Rôles de contact', 'Personnes et organisations', NULL),
  ('ref_actor_role', 'Rôles d''acteur', 'Personnes et organisations', NULL),
  ('ref_org_role', 'Rôles d''organisation', 'Personnes et organisations', NULL),
  ('ref_org_admin_role', 'Rôles d''administration d''ORG', 'Personnes et organisations', NULL),
  ('ref_org_business_role', 'Rôles métier d''ORG', 'Personnes et organisations', NULL),
  ('ref_language', 'Langues', 'Personnes et organisations', NULL),
  ('ref_code:contact_kind', 'Types de contact', 'Personnes et organisations', NULL),
  ('ref_code:client_type', 'Types de clientèle', 'Personnes et organisations', NULL),
  ('ref_code:language_level', 'Niveaux de langue', 'Personnes et organisations', NULL),
  -- Tarifs et commercial
  ('ref_code:price_kind', 'Natures de tarif', 'Tarifs et commercial', NULL),
  ('ref_code:price_type', 'Types de tarif', 'Tarifs et commercial', NULL),
  ('ref_code:price_unit', 'Unités de tarif', 'Tarifs et commercial', NULL),
  ('ref_code:payment_method', 'Moyens de paiement', 'Tarifs et commercial', NULL),
  ('ref_code:promotion_type', 'Types de promotion', 'Tarifs et commercial', NULL),
  ('ref_code:package_type', 'Types de forfait', 'Tarifs et commercial', NULL),
  ('ref_code:season_type', 'Types de saison tarifaire', 'Tarifs et commercial', NULL),
  ('ref_code:membership_tier', 'Paliers d''adhésion', 'Tarifs et commercial', NULL),
  ('ref_code:membership_campaign', 'Campagnes d''adhésion', 'Tarifs et commercial', NULL),
  ('ref_code:partnership_type', 'Types de partenariat', 'Tarifs et commercial', NULL),
  ('ref_code:distribution_channel', 'Canaux de distribution', 'Tarifs et commercial', NULL),
  ('ref_code:booking_status', 'Statuts de réservation', 'Tarifs et commercial', NULL),
  -- Relation client
  ('ref_code:demand_topic', 'Sujets de demande', 'Relation client', NULL),
  ('ref_code:crm_sentiment', 'Sentiment relationnel', 'Relation client', NULL),
  ('ref_code:mood', 'Humeur', 'Relation client', NULL),
  ('ref_code:feedback_type', 'Types de retour', 'Relation client', NULL),
  ('ref_review_source', 'Sources d''avis', 'Relation client', NULL),
  -- Ouverture et temps
  ('ref_code:opening_period_type', 'Types de période d''ouverture', 'Ouverture et temps', NULL),
  ('ref_code:opening_schedule_type', 'Types d''horaire', 'Ouverture et temps', NULL),
  ('ref_code:weekday', 'Jours de la semaine', 'Ouverture et temps', NULL),
  -- Médias et contenus
  ('ref_code:media_type', 'Types de média', 'Médias et contenus', NULL),
  ('ref_code:media_tag', 'Tags de média', 'Médias et contenus', NULL),
  ('ref_code:social_network', 'Réseaux sociaux', 'Médias et contenus', NULL),
  -- Territoire
  ('ref_commune', 'Communes', 'Territoire', 'Filtre Commune de l''Exploreur, §16 zones desservies'),
  ('ref_code:destination_type', 'Types de destination', 'Territoire', NULL),
  ('ref_code:tourism_type', 'Types de tourisme', 'Territoire', NULL),
  ('ref_code:transport_type', 'Types de transport', 'Territoire', NULL)
ON CONFLICT (catalog_key) DO UPDATE SET
  label = EXCLUDED.label, family = EXCLUDED.family, used_in = EXCLUDED.used_in, updated_at = now();

-- ============================================================================
-- Tâche 3 — helpers dérivés + RPC de lecture.
--
-- Le maître (api.list_ref_catalogs) ET le détail (api.get_ref_catalog) lisent le
-- MÊME accès via les helpers dérivés internal.ref_catalog_access /
-- internal.ref_catalog_readonly_reason. Les verrouillages STRUCTURELS (pas de PK,
-- domaine ref_code non éditable) sont dérivés d'abord ; le registre ne fait que
-- restreindre ensuite. Sans cette discipline, une table sans clé primaire
-- s'afficherait éditable dans la liste puis verrouillée à l'ouverture.
-- ============================================================================

-- Cascade de libellé. Une déclaration par table serait la RÈGLE et non l'exception
-- (12 des 32 tables n'ont pas de `name`), et chaque oubli produirait une ligne muette.
-- Rend NULL pour les matrices : leur libellé se compose depuis la clé, côté front.
CREATE OR REPLACE FUNCTION internal.ref_catalog_label_column(p_catalog_key text)
RETURNS text LANGUAGE sql STABLE
SET search_path = pg_catalog, public, internal
AS $$
  SELECT COALESCE(
    (SELECT r.label_column FROM public.ref_catalog_registry r
     WHERE r.catalog_key = p_catalog_key AND NULLIF(TRIM(r.label_column), '') IS NOT NULL),
    (SELECT c->>'name' FROM internal.v_ref_catalog v, jsonb_array_elements(v.columns) c
     WHERE v.catalog_key = p_catalog_key
       AND c->>'name' = ANY (ARRAY['name','label','title','libelle'])
     ORDER BY array_position(ARRAY['name','label','title','libelle'], c->>'name') LIMIT 1),
    (SELECT 'code' FROM internal.v_ref_catalog v, jsonb_array_elements(v.columns) c
     WHERE v.catalog_key = p_catalog_key AND c->>'name' = 'code' LIMIT 1));
$$;

-- Accès EFFECTIF : DÉRIVÉ d'abord, registre ensuite. Les dérivés ne peuvent pas être
-- oubliés au seed. Consommé par le maître ET par le détail — sans quoi une table sans
-- clé primaire s'afficherait éditable dans la liste puis verrouillée à l'ouverture.
CREATE OR REPLACE FUNCTION internal.ref_catalog_access(p_catalog_key text)
RETURNS text LANGUAGE sql STABLE
SET search_path = pg_catalog, public, api, internal
AS $$
  SELECT CASE
    WHEN NOT v.is_identifiable THEN 'readonly'
    WHEN v.kind = 'ref_code_domain'
         AND api.ref_code_domain_is_editable(v.domain) IS NOT TRUE THEN 'readonly'
    ELSE COALESCE((SELECT r.access FROM public.ref_catalog_registry r
                   WHERE r.catalog_key = p_catalog_key), 'editable')
  END
  FROM internal.v_ref_catalog v WHERE v.catalog_key = p_catalog_key;
$$;

CREATE OR REPLACE FUNCTION internal.ref_catalog_readonly_reason(p_catalog_key text)
RETURNS text LANGUAGE sql STABLE
SET search_path = pg_catalog, public, api, internal
AS $$
  SELECT CASE
    WHEN NOT v.is_identifiable
      THEN 'Aucune clé primaire : une ligne n''y est pas identifiable.'
    WHEN v.kind = 'ref_code_domain' AND api.ref_code_domain_is_editable(v.domain) IS NOT TRUE
      THEN 'Domaine structurel (taxonomie, hiérarchie ou couplage à un type d''objet). S''édite par migration.'
    ELSE (SELECT r.readonly_reason FROM public.ref_catalog_registry r
          WHERE r.catalog_key = p_catalog_key AND r.access = 'readonly')
  END
  FROM internal.v_ref_catalog v WHERE v.catalog_key = p_catalog_key;
$$;

-- NOTE sur la CLÉ CANONIQUE d'une ligne. Le front et le serveur doivent l'écrire à
-- l'identique pour joindre `rows` et `usage`. Ce n'est délibérément PAS du JSON sérialisé :
-- jsonb::text rend {"id": "x"} (avec une espace) là où JSON.stringify rend {"id":"x"}, et
-- les deux ne se rejoindraient jamais. La règle est : joindre les valeurs de clé primaire,
-- dans l'ordre de primary_key_columns, par le séparateur d'unité U+001F. Or `usage` n'existe
-- que pour les catalogues à clé SIMPLE (une matrice n'est référencée par personne), donc la
-- clé s'y réduit à la valeur en texte — c'est ce qu'écrivent les requêtes ci-dessous.

-- Valeur castée au type découvert, réutilisée par l'INSERT, le SET et le WHERE.
-- Sans cast, (p_values->>'is_required') rend du texte et une colonne booléenne le refuse.
-- Le type vient de la VUE, jamais de l'appelant : un type fourni par le client serait une injection.
CREATE OR REPLACE FUNCTION internal.ref_catalog_cast_expr(p_columns jsonb, p_name text, p_src text)
RETURNS text LANGUAGE sql IMMUTABLE
AS $$
  SELECT format('(%s->>%L)::%s', p_src, p_name,
                COALESCE((SELECT c->>'type' FROM jsonb_array_elements(p_columns) c
                          WHERE c->>'name' = p_name), 'text'));
$$;

CREATE OR REPLACE FUNCTION internal.ref_catalog_row_count(p_table text)
RETURNS bigint LANGUAGE plpgsql STABLE
SET search_path = pg_catalog, public, internal
AS $$
DECLARE v_n bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM internal.v_ref_catalog
                 WHERE table_name = p_table AND kind = 'table') THEN
    RETURN 0;
  END IF;
  EXECUTE format('SELECT count(*) FROM public.%I', p_table) INTO v_n;
  RETURN v_n;
END $$;

CREATE OR REPLACE FUNCTION api.list_ref_catalogs()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, api, internal
AS $$
DECLARE v_out jsonb;
BEGIN
  IF api.is_platform_superuser() IS NOT TRUE THEN
    RAISE EXCEPTION 'FORBIDDEN: réservé aux super-administrateurs' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'family', x->>'label'), '[]'::jsonb) INTO v_out
  FROM (
    SELECT jsonb_build_object(
      'catalog_key',     v.catalog_key,
      'kind',            v.kind,
      'label',           COALESCE(r.label, v.catalog_key),
      'family',          COALESCE(r.family, 'À classer'),
      'used_in',         r.used_in,
      -- Helpers DÉRIVÉS, comme le détail : sinon le maître et le détail divergent.
      'access',          internal.ref_catalog_access(v.catalog_key),
      'readonly_reason', internal.ref_catalog_readonly_reason(v.catalog_key),
      'n_values',        CASE WHEN v.kind = 'ref_code_domain'
                           THEN (SELECT count(*) FROM public.ref_code rc WHERE rc.domain = v.domain)
                           ELSE internal.ref_catalog_row_count(v.table_name) END
    ) AS x
    FROM internal.v_ref_catalog v
    LEFT JOIN public.ref_catalog_registry r ON r.catalog_key = v.catalog_key
  ) s;
  RETURN v_out;
END $$;

CREATE OR REPLACE FUNCTION api.get_ref_catalog(p_catalog_key text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, api, internal
AS $$
DECLARE
  v      record;
  v_reg  record;
  v_rows jsonb := '[]'::jsonb;
  v_use  jsonb := '{}'::jsonb;
  v_part jsonb;
  v_order text;
  f      record;
BEGIN
  IF api.is_platform_superuser() IS NOT TRUE THEN
    RAISE EXCEPTION 'FORBIDDEN: réservé aux super-administrateurs' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v FROM internal.v_ref_catalog WHERE catalog_key = p_catalog_key;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'UNKNOWN_CATALOG: %', p_catalog_key USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_reg FROM public.ref_catalog_registry WHERE catalog_key = p_catalog_key;

  IF v.kind = 'ref_code_domain' THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(rc) ORDER BY rc.position NULLS LAST, rc.name), '[]'::jsonb)
      INTO v_rows FROM public.ref_code rc WHERE rc.domain = v.domain;
    -- Comptage délégué à la phase 7.5 (balayage de catalogue déjà mesuré). Sa sortie est
    -- déjà indexée par ref_code.id, ce qui EST la clé canonique d'une clé primaire à une
    -- colonne : aucune re-clé n'est nécessaire.
    v_use := api.ref_code_usage_counts(v.domain);
  ELSE
    -- ORDER BY EXPLICITE. Sans lui, jsonb_agg rend l'ordre physique du heap : l'écran
    -- afficherait un ordre qui n'est pas celui de `position`, et les flèches
    -- monter/descendre enverraient une permutation fondée sur un ordre faux.
    --
    -- CORRECTIF (revue en cours de tâche) : la concaténation littérale du brief
    -- (CASE ... || string_agg(...)) rend NULL dès que primary_key_columns est vide
    -- (string_agg sur zéro ligne = NULL, et texte || NULL = NULL en SQL) — exactement
    -- le cas de ref_interop_crosswalk (0 colonne de clé primaire, is_identifiable=false
    -- mais toujours listé). Le %s de format() reçoit alors une chaîne vide et produit
    -- « ORDER BY  FROM ... » : erreur de syntaxe 42601, qui casse le balayage exhaustif.
    -- On construit donc les fragments d'ORDER BY comme un ENSEMBLE (UNION ALL) agrégé par
    -- string_agg, jamais par concaténation directe : un ensemble vide donne proprement
    -- NULL, qu'on retombe alors sur un ORDER BY constant (ordre non signifiant, mais SQL
    -- valide — ce catalogue est de toute façon verrouillé en lecture par is_identifiable).
    SELECT string_agg(frag, ', ') INTO v_order FROM (
      SELECT 't.position NULLS LAST' AS frag
      WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(v.columns) c WHERE c->>'name' = 'position')
      UNION ALL
      SELECT format('t.%I', k->>'name') FROM jsonb_array_elements(v.primary_key_columns) k
    ) frags;
    IF v_order IS NULL THEN
      v_order := '(SELECT 1)';
    END IF;

    EXECUTE format('SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY %s), ''[]''::jsonb) FROM public.%I t',
                   v_order, v.table_name) INTO v_rows;

    -- Compteur : FUSION ADDITIVE de toutes les FK entrantes. L'écraser à chaque tour de
    -- boucle est l'erreur naturelle ici — d'où l'accumulateur v_use et la variable v_part.
    --
    -- CORRECTIF (revue en cours de tâche) : internal.v_ref_catalog (tâche 1) sérialise
    -- incoming_fk avec les clés JSON 'table'/'column' (jsonb_build_object('table', ...,
    -- 'column', ...)). Le brief lisait AS y(tbl text, col text) — noms de colonnes SANS
    -- rapport avec les clés JSON réelles — donc jsonb_to_recordset rendait f.tbl et f.col
    -- NULL sur CHAQUE ligne, et format('%I', NULL) échouait (22004) sur 27 catalogues à
    -- clé simple (ref_language, ref_legal_type, ref_amenity, ref_permission, etc.). On
    -- nomme l'enregistrement d'après les clés JSON réelles, entre guillemets (mots réservés).
    IF jsonb_array_length(v.primary_key_columns) = 1 THEN
      FOR f IN SELECT * FROM jsonb_to_recordset(v.incoming_fk) AS y("table" text, "column" text) LOOP
        EXECUTE format(
          'SELECT COALESCE(jsonb_object_agg(k, n), ''{}''::jsonb) FROM ('
          '  SELECT x.%I::text AS k, count(*) AS n'
          '  FROM public.%I x WHERE x.%I IS NOT NULL GROUP BY 1) s',
          f."column", f."table", f."column")
          INTO v_part;
        SELECT COALESCE(jsonb_object_agg(key, total), '{}'::jsonb) INTO v_use
        FROM (SELECT key, SUM(value::bigint) AS total
              FROM (SELECT * FROM jsonb_each_text(v_use)
                    UNION ALL SELECT * FROM jsonb_each_text(v_part)) u
              GROUP BY key) m;
      END LOOP;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'catalog_key',         v.catalog_key,
    'kind',                v.kind,
    'label',               COALESCE(v_reg.label, v.catalog_key),
    'family',              COALESCE(v_reg.family, 'À classer'),
    'used_in',             v_reg.used_in,
    'access',              internal.ref_catalog_access(v.catalog_key),
    'readonly_reason',     internal.ref_catalog_readonly_reason(v.catalog_key),
    'is_identifiable',     v.is_identifiable,
    'primary_key_columns', v.primary_key_columns,
    'label_column',        internal.ref_catalog_label_column(v.catalog_key),
    'columns',             v.columns,
    'outgoing_fk',         v.outgoing_fk,
    'rows',                v_rows,
    'usage',               v_use);
END $$;

REVOKE ALL ON FUNCTION internal.ref_catalog_label_column(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION internal.ref_catalog_access(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION internal.ref_catalog_readonly_reason(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION internal.ref_catalog_cast_expr(jsonb, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION internal.ref_catalog_row_count(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION api.list_ref_catalogs() FROM PUBLIC;
REVOKE ALL ON FUNCTION api.get_ref_catalog(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION api.list_ref_catalogs() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION api.get_ref_catalog(text) TO authenticated, service_role;

COMMIT;
