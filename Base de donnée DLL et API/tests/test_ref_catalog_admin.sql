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

  -- Angle mort de la première revue : l'espèce 'table' (ref_legal_type ci-dessus) a un
  -- reloid direct et « marchait déjà » ; l'espèce 'ref_code_domain' pose reloid=NULL dans le
  -- CTE cat, donc `k.confrelid = cat.reloid` n'était jamais vrai et incoming_fk valait '[]'
  -- pour LES 71 DOMAINES, quelles que soient leurs FK entrantes réelles. object_cuisine_type
  -- référence bien ref_code_cuisine_type(id) (schema_unified.sql) : nommer cette table précise
  -- rend l'assertion non vacante (un simple compte > 0 aurait pu passer par accident).
  ASSERT EXISTS (SELECT 1 FROM internal.v_ref_catalog v, jsonb_array_elements(v.incoming_fk) f
                 WHERE v.catalog_key = 'ref_code:cuisine_type' AND f->>'table' = 'object_cuisine_type'),
         'object_cuisine_type référence ref_code_cuisine_type : un domaine ref_code doit '
         'découvrir ses FK entrantes via sa partition, pas rester vide faute de reloid';

  RAISE NOTICE 'v_ref_catalog assertions passed';
END$$;

DO $$
BEGIN
  -- Un verrouillage sans motif est refusé : un écran qui dit « lecture seule » sans
  -- dire pourquoi transforme une décision en mystère.
  BEGIN
    INSERT INTO ref_catalog_registry (catalog_key, label, family, access)
    VALUES ('ref_legal_type', 'Test', 'Juridique', 'readonly');
    RAISE EXCEPTION 'GARDE VACANTE : access=readonly sans readonly_reason accepté';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  ASSERT (SELECT access FROM ref_catalog_registry WHERE catalog_key = 'ref_permission') = 'readonly',
         'ref_permission : ses codes sont lus en dur par le contrôle d''accès';
  ASSERT (SELECT length(readonly_reason) FROM ref_catalog_registry
          WHERE catalog_key = 'ref_permission') > 20,
         'le motif doit être une phrase affichable, pas un mot';

  -- Les verrouillages DÉRIVÉS ne doivent PAS être seedés : les dupliquer ferait croire
  -- que le seed est la garde, et un oubli deviendrait une ouverture.
  ASSERT NOT EXISTS (SELECT 1 FROM ref_catalog_registry WHERE catalog_key = 'ref_interop_crosswalk'),
         'sans clé primaire = verrouillage DÉRIVÉ, pas une ligne de registre';
  ASSERT NOT EXISTS (SELECT 1 FROM ref_catalog_registry WHERE catalog_key LIKE 'ref_code:taxonomy%'),
         'domaine non éditable = verrouillage DÉRIVÉ via api.ref_code_domain_is_editable';

  -- Le registre ne référence QUE des catalogues réels.
  ASSERT NOT EXISTS (
    SELECT 1 FROM ref_catalog_registry r
    WHERE NOT EXISTS (SELECT 1 FROM internal.v_ref_catalog v WHERE v.catalog_key = r.catalog_key)),
    'le registre contient une clé qui ne correspond à aucun catalogue découvert';

  RAISE NOTICE 'ref_catalog_registry assertions passed';
END$$;
ROLLBACK;
