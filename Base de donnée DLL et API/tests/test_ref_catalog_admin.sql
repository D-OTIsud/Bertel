-- test_ref_catalog_admin.sql
-- Garde permanente §211 — administration générée des catalogues de référence.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE v_n integer; v_cols jsonb;
BEGIN
  -- Compte EXACT, calculé : un « >= 80 » masquerait la disparition de vingt catalogues.
  SELECT count(*) INTO v_n FROM internal.v_ref_catalog;
  ASSERT v_n = (
      (SELECT count(*) FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
       WHERE ns.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE 'ref\_%'
         AND c.relname <> 'ref_code'
         AND NOT EXISTS (SELECT 1 FROM pg_inherits i WHERE i.inhrelid = c.oid))
    + (SELECT count(DISTINCT domain) FROM public.ref_code)),
    format('une entrée par table et par domaine ; obtenu %s', v_n);

  -- ref_code et ses partitions ne sont pas des catalogues autonomes…
  ASSERT NOT EXISTS (SELECT 1 FROM internal.v_ref_catalog WHERE catalog_key = 'ref_code'),
         'ref_code est servi domaine par domaine, pas comme table';
  ASSERT NOT EXISTS (SELECT 1 FROM internal.v_ref_catalog WHERE catalog_key = 'ref_code_media_type'),
         'les partitions de ref_code ne sont pas des catalogues autonomes';
  -- … mais ces deux-là en sont, malgré leur préfixe : c'est pg_inherits qui tranche, pas le nom.
  ASSERT EXISTS (SELECT 1 FROM internal.v_ref_catalog WHERE catalog_key = 'ref_code_domain_registry'),
         'ref_code_domain_registry porte le préfixe sans être une partition';
  ASSERT EXISTS (SELECT 1 FROM internal.v_ref_catalog WHERE catalog_key = 'ref_code_taxonomy_closure'),
         'ref_code_taxonomy_closure porte le préfixe sans être une partition';

  -- LE PIÈGE : un domaine DOIT être identifiable et décrit, sinon il est verrouillé en silence.
  ASSERT (SELECT is_identifiable FROM internal.v_ref_catalog WHERE catalog_key = 'ref_code:cuisine_type'),
         'un domaine ref_code doit être identifiable : sinon le helper d''accès le verrouille';
  ASSERT (SELECT primary_key_columns->0->>'name' FROM internal.v_ref_catalog
          WHERE catalog_key = 'ref_code:cuisine_type') = 'id',
         'un domaine ref_code s''identifie par ref_code.id';
  ASSERT jsonb_array_length(
           (SELECT columns FROM internal.v_ref_catalog WHERE catalog_key = 'ref_code:cuisine_type')) = 5,
         'un domaine ref_code doit porter la forme éditable synthétisée de ref_code';

  -- Formes de clé primaire réelles.
  ASSERT jsonb_array_length((SELECT primary_key_columns FROM internal.v_ref_catalog
          WHERE catalog_key = 'ref_capacity_applicability')) = 2,
         'une PK composite doit être décrite en entier';
  ASSERT (SELECT primary_key_columns->0->>'name' FROM internal.v_ref_catalog
          WHERE catalog_key = 'ref_commune') = 'insee_code',
         'ref_commune s''identifie par insee_code, pas par un uuid';
  ASSERT (SELECT is_identifiable FROM internal.v_ref_catalog
          WHERE catalog_key = 'ref_interop_crosswalk') = false,
         'une relation sans clé primaire doit être marquée non identifiable';

  -- Description des colonnes d'une table.
  SELECT columns INTO v_cols FROM internal.v_ref_catalog WHERE catalog_key = 'ref_legal_type';
  ASSERT EXISTS (SELECT 1 FROM jsonb_array_elements(v_cols) c
                 WHERE c->>'name' = 'review_interval_days' AND c->>'type' = 'integer'),
         'le type PostgreSQL doit remonter tel quel (il sert au cast du SQL dynamique)';

  -- Cible de FK NORMALISÉE en catalog_key, pas en nom de partition.
  ASSERT (SELECT f->>'target' FROM internal.v_ref_catalog v, jsonb_array_elements(v.outgoing_fk) f
          WHERE v.catalog_key = 'ref_amenity' AND f->>'column' = 'family_id')
         = 'ref_code:amenity_family',
         'une FK vers une partition de ref_code doit être normalisée en ref_code:<domaine>, '
         'sinon la liste déroulante interroge un catalogue qui n''existe pas';

  -- FK entrantes : elles portent le compteur d'usage.
  ASSERT EXISTS (SELECT 1 FROM internal.v_ref_catalog v, jsonb_array_elements(v.incoming_fk) f
                 WHERE v.catalog_key = 'ref_legal_type' AND f->>'table' = 'object_legal'),
         'object_legal référence ref_legal_type : la FK entrante doit être découverte';

  RAISE NOTICE 'v_ref_catalog assertions passed';
END$$;
ROLLBACK;
