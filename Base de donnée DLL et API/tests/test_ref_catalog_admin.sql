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

-- ----------------------------------------------------------------------------
-- Tâche 3 — RPC de lecture + helpers dérivés.
-- ----------------------------------------------------------------------------
DO $$
DECLARE v_list jsonb; v_cat jsonb; r record;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  v_list := api.list_ref_catalogs();
  ASSERT jsonb_array_length(v_list) = (SELECT count(*) FROM internal.v_ref_catalog),
         'le maître doit lister TOUS les catalogues découverts';

  -- Le maître et le détail ne doivent JAMAIS diverger sur l'accès.
  FOR r IN SELECT catalog_key FROM internal.v_ref_catalog LOOP
    ASSERT (SELECT c->>'access' FROM jsonb_array_elements(v_list) c
            WHERE c->>'catalog_key' = r.catalog_key)
           = (api.get_ref_catalog(r.catalog_key)->>'access'),
           format('accès divergent entre maître et détail sur %s', r.catalog_key);
  END LOOP;

  -- LE PIÈGE : un domaine plat doit être ÉDITABLE.
  ASSERT api.get_ref_catalog('ref_code:cuisine_type')->>'access' = 'editable',
         'un domaine ref_code plat doit rester éditable — is_identifiable synthétisé';
  -- … et un domaine structurel verrouillé PAR DÉRIVATION.
  ASSERT api.get_ref_catalog('ref_code:taxonomy_hlo')->>'access' = 'readonly',
         'un domaine non éditable selon api.ref_code_domain_is_editable est verrouillé';
  ASSERT api.get_ref_catalog('ref_interop_crosswalk')->>'access' = 'readonly',
         'une relation sans clé primaire est verrouillée d''office';

  -- outgoing_fk émis ET normalisé : sans lui, saisie d'UUID à la main.
  ASSERT (SELECT f->>'target'
          FROM jsonb_array_elements(api.get_ref_catalog('ref_amenity')->'outgoing_fk') f
          WHERE f->>'column' = 'family_id') = 'ref_code:amenity_family',
         'la cible de FK doit être un catalog_key exploitable par le front';

  -- Cascade de libellé.
  ASSERT api.get_ref_catalog('ref_sustainability_action')->>'label_column' = 'label',
         'la cascade doit trouver `label` quand `name` est absente';
  ASSERT api.get_ref_catalog('ref_capacity_applicability')->>'label_column' IS NULL,
         'une matrice n''a pas de colonne de libellé : le front compose depuis la clé';

  -- BALAYAGE EXHAUSTIF : chaque catalogue doit se décrire sans erreur.
  FOR r IN SELECT catalog_key FROM internal.v_ref_catalog LOOP
    BEGIN
      PERFORM api.get_ref_catalog(r.catalog_key);
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'get_ref_catalog casse sur % : % (%)', r.catalog_key, SQLERRM, SQLSTATE;
    END;
  END LOOP;

  v_cat := api.get_ref_catalog('ref_legal_type');
  ASSERT jsonb_array_length(v_cat->'rows') = 20,
         format('ref_legal_type porte 20 valeurs ; obtenu %s', jsonb_array_length(v_cat->'rows'));

  RAISE NOTICE 'lecture assertions passed';
END$$;

-- Compteur d'usage : NON VACANT, et sur DEUX tables consommatrices DISTINCTES.
-- ref_language est référencée par object_language ET object_review : c'est la FUSION
-- entre deux FK entrantes qu'on teste ici, pas deux lignes dans la même table.
DO $$
DECLARE
  v_lang uuid; v_key text; v_before bigint; v_after bigint; v_source uuid;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SELECT id INTO v_lang FROM ref_language WHERE code = 'fr';
  v_key := v_lang::text;

  v_before := COALESCE((api.get_ref_catalog('ref_language')->'usage'->>v_key)::bigint, 0);

  INSERT INTO object (id, object_type, name, status)
    VALUES ('CATMFK9999999901', 'HLO', 'Témoin multi-FK', 'draft');
  INSERT INTO object_language (object_id, language_id) VALUES ('CATMFK9999999901', v_lang);
  -- object_review.source_id est NOT NULL (FK ref_review_source) : ref_legal_type était
  -- le seul champ obligatoire cité par le brief, mais le schéma réel exige aussi une
  -- source d'avis. On prend une source seedée existante — l'intention du test (deux
  -- tables DISTINCTES référençant ref_language) n'en est pas changée.
  SELECT id INTO v_source FROM ref_review_source LIMIT 1;
  INSERT INTO object_review (object_id, source_id, language_id, rating)
    VALUES ('CATMFK9999999901', v_source, v_lang, 5);

  v_after := COALESCE((api.get_ref_catalog('ref_language')->'usage'->>v_key)::bigint, 0);

  ASSERT v_after = v_before + 2,
         format('le compteur doit FUSIONNER deux FK entrantes distinctes ; avant %s, après %s',
                v_before, v_after);

  RAISE NOTICE 'compteur multi-FK assertion passed';
END$$;

ROLLBACK;
