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

COMMIT;
