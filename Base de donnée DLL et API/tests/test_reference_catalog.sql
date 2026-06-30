-- tests/test_reference_catalog.sql
-- Pins the I1 reference-catalog contract (audit API, Phase 1) :
--   api.public_catalog_domains() / api.list_catalog() / api.list_reference_bundle().
-- Asserts the public contract structurally + behaviourally (whitelist default-deny,
-- uniform shape, i18n fallback, parent resolution, anon-executable). Runs as the CI
-- role; read-only (no rows created). Depends on api.i18n_pick + ref_* tables + seeds.
DO $$
DECLARE
  v_def      text;
  v_secdef   boolean;
  v_n        int;
  v_row      jsonb;
  v_bundle   jsonb;
BEGIN
  -- 1. The 3 functions exist with the expected signatures + are SECURITY INVOKER + anon-granted.
  FOR v_def, v_secdef IN
    SELECT p.proname, p.prosecdef
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'api'
      AND p.proname IN ('public_catalog_domains','list_catalog','list_reference_bundle')
  LOOP
    IF v_secdef THEN
      RAISE EXCEPTION 'api.% must be SECURITY INVOKER (ref_* are publicly readable; no DEFINER)', v_def;
    END IF;
  END LOOP;

  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='api' AND p.proname IN ('public_catalog_domains','list_catalog','list_reference_bundle')) <> 3 THEN
    RAISE EXCEPTION 'reference-catalog functions missing (expected 3 in schema api)';
  END IF;

  -- anon must be able to call all three (public read surface).
  IF NOT has_function_privilege('anon', 'api.public_catalog_domains()', 'EXECUTE')
     OR NOT has_function_privilege('anon', 'api.list_catalog(text,text)', 'EXECUTE')
     OR NOT has_function_privilege('anon', 'api.list_reference_bundle(text[],text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'reference-catalog functions must be EXECUTE-able by anon';
  END IF;

  -- 2. The whitelist exposes a meaningful number of domains and EXCLUDES internal/CRM vocab.
  v_n := array_length(api.public_catalog_domains(), 1);
  IF v_n < 60 THEN
    RAISE EXCEPTION 'public_catalog_domains too small: % (expected >= 60)', v_n;
  END IF;
  IF 'crm_sentiment' = ANY(api.public_catalog_domains())
     OR 'demand_topic' = ANY(api.public_catalog_domains())
     OR 'mood' = ANY(api.public_catalog_domains()) THEN
    RAISE EXCEPTION 'internal/CRM domain leaked into the public catalog whitelist';
  END IF;

  -- 3. Uniform shape: every element carries exactly the 5 contract keys, names never null.
  v_n := jsonb_array_length(api.list_catalog('payment_method'));
  IF v_n < 1 THEN RAISE EXCEPTION 'payment_method catalog empty'; END IF;
  v_row := api.list_catalog('payment_method') -> 0;
  IF NOT (v_row ? 'code' AND v_row ? 'name' AND v_row ? 'icon_url' AND v_row ? 'parent_code' AND v_row ? 'domain') THEN
    RAISE EXCEPTION 'catalog row missing a contract key: %', v_row;
  END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(api.list_catalog('payment_method')) e WHERE e->>'name' IS NULL) <> 0 THEN
    RAISE EXCEPTION 'payment_method has null names (i18n fallback to plain name failed)';
  END IF;

  -- 4. Hierarchy resolved: a taxonomy domain has parent_code on its child nodes.
  IF (SELECT count(*) FROM jsonb_array_elements(api.list_catalog('taxonomy_res')) e WHERE e->>'parent_code' IS NOT NULL) < 1 THEN
    RAISE EXCEPTION 'taxonomy_res parent_code never resolved (hierarchy broken)';
  END IF;

  -- 5. Separate ref_* tables covered: amenity resolves its family; sustainability_action
  --    resolves a name from the `label` column; commune/language present.
  IF (SELECT count(*) FROM jsonb_array_elements(api.list_catalog('amenity')) e WHERE e->>'parent_code' IS NOT NULL) < 1 THEN
    RAISE EXCEPTION 'amenity family (parent_code) never resolved';
  END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(api.list_catalog('sustainability_action')) e WHERE e->>'name' IS NULL) <> 0 THEN
    RAISE EXCEPTION 'sustainability_action names null (label/label_i18n mapping failed)';
  END IF;
  IF jsonb_array_length(api.list_catalog('commune')) < 1 THEN RAISE EXCEPTION 'commune catalog empty'; END IF;
  IF jsonb_array_length(api.list_catalog('language')) < 1 THEN RAISE EXCEPTION 'language catalog empty'; END IF;
  IF jsonb_array_length(api.list_catalog('classification_scheme')) < 1 THEN RAISE EXCEPTION 'classification_scheme (labels) empty'; END IF;

  -- 6. Non-public / internal domain is REJECTED (whitelist default-deny, behavioural).
  BEGIN
    PERFORM api.list_catalog('crm_sentiment');
    RAISE EXCEPTION 'expected rejection of non-public domain crm_sentiment, none raised';
  EXCEPTION WHEN OTHERS THEN
    IF position('non-public' IN SQLERRM) = 0 THEN
      RAISE EXCEPTION 'wrong error for non-public domain: %', SQLERRM;
    END IF;
  END;

  -- 7. Bundle: NULL = all whitelisted domains; explicit list filters out non-whitelisted.
  IF (SELECT count(*) FROM jsonb_object_keys(api.list_reference_bundle(NULL))) <> array_length(api.public_catalog_domains(),1) THEN
    RAISE EXCEPTION 'bundle(NULL) key count must equal the whitelist size';
  END IF;
  v_bundle := api.list_reference_bundle(ARRAY['payment_method','language','crm_sentiment']);
  IF (SELECT count(*) FROM jsonb_object_keys(v_bundle)) <> 2 THEN
    RAISE EXCEPTION 'bundle must drop non-whitelisted domains (expected 2 keys, got %)',
      (SELECT count(*) FROM jsonb_object_keys(v_bundle));
  END IF;
  IF NOT (v_bundle ? 'payment_method' AND v_bundle ? 'language') OR (v_bundle ? 'crm_sentiment') THEN
    RAISE EXCEPTION 'bundle filtered the wrong keys: %', (SELECT array_agg(k) FROM jsonb_object_keys(v_bundle) k);
  END IF;

  RAISE NOTICE 'test_reference_catalog.sql: OK';
END $$;
