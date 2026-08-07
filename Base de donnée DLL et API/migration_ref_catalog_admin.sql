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

COMMIT;
