-- ============================================================================
-- test_ref_code_admin_rpcs.sql — Phase 7.5 (éditeur de référentiels)
-- Vérifie les RPC d'écriture ref_code (gated super-admin) + le helper d'éditabilité.
-- Tout se déroule dans UNE transaction forcée au ROLLBACK (RAISE final) ⇒ live intouché.
-- Exécution : psql -f tests/test_ref_code_admin_rpcs.sql (ou via le harnais CI).
-- ============================================================================
DO $$
DECLARE
  r jsonb; v_id uuid; v_name text; v_code text; v_active boolean; v_refused boolean;
BEGIN
  -- 0) Helper d'éditabilité : domaine plat éditable, taxonomie structurelle non éditable.
  IF api.ref_code_domain_is_editable('price_type') IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL: price_type devrait être éditable';
  END IF;
  IF api.ref_code_domain_is_editable('taxonomy_res') IS NOT FALSE THEN
    RAISE EXCEPTION 'FAIL: taxonomy_res (structurel) ne devrait PAS être éditable';
  END IF;

  -- 1) Fail-CLOSED : sans contexte super-admin, toute écriture refuse (42501).
  v_refused := false;
  BEGIN
    PERFORM api.rpc_set_ref_code_active(gen_random_uuid(), 'price_type', false);
  EXCEPTION WHEN sqlstate '42501' THEN v_refused := true;
  END;
  IF NOT v_refused THEN RAISE EXCEPTION 'FAIL: gate FAIL-OPEN sans super-admin'; END IF;

  -- Contexte super-admin transaction-local (réversible au ROLLBACK).
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  IF api.is_platform_superuser() IS NOT TRUE THEN
    RAISE EXCEPTION 'SETUP FAIL: contexte super-admin non établi';
  END IF;

  -- 2) CREATE : code normalisé + verrouillé, actif par défaut.
  r := api.rpc_upsert_ref_code('price_type', 'TEST 7p5', NULL, 'test_7p5_ci');
  v_id := (r->>'id')::uuid;
  SELECT name, code, is_active INTO v_name, v_code, v_active FROM ref_code WHERE id = v_id AND domain = 'price_type';
  IF v_name <> 'TEST 7p5' OR v_code <> 'test_7p5_ci' OR v_active IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL CREATE: % / % / %', v_name, v_code, v_active;
  END IF;

  -- 3) EDIT : libellé change, code reste VERROUILLÉ.
  PERFORM api.rpc_upsert_ref_code('price_type', 'TEST EDIT 7p5', v_id);
  SELECT name, code INTO v_name, v_code FROM ref_code WHERE id = v_id;
  IF v_name <> 'TEST EDIT 7p5' OR v_code <> 'test_7p5_ci' THEN
    RAISE EXCEPTION 'FAIL EDIT: name=% code=% (code doit rester verrouillé)', v_name, v_code;
  END IF;

  -- 4) DEACTIVATE.
  PERFORM api.rpc_set_ref_code_active(v_id, 'price_type', false);
  SELECT is_active INTO v_active FROM ref_code WHERE id = v_id;
  IF v_active IS NOT FALSE THEN RAISE EXCEPTION 'FAIL DEACTIVATE'; END IF;

  -- 5) STRUCTURAL : écrire dans un domaine taxonomie refuse (42501).
  v_refused := false;
  BEGIN
    PERFORM api.rpc_upsert_ref_code('taxonomy_res', 'X', NULL, 'x_ci_7p5');
  EXCEPTION WHEN sqlstate '42501' THEN v_refused := true;
  END;
  IF NOT v_refused THEN RAISE EXCEPTION 'FAIL: domaine structurel writable'; END IF;

  -- 6) list_ref_code_domains : ne retourne QUE des domaines éditables (price_type oui, taxonomy_res non).
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(api.list_ref_code_domains()) e WHERE e->>'domain' = 'price_type'
  ) THEN RAISE EXCEPTION 'FAIL: price_type absent de list_ref_code_domains'; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(api.list_ref_code_domains()) e WHERE e->>'domain' = 'taxonomy_res'
  ) THEN RAISE EXCEPTION 'FAIL: taxonomy_res (structurel) présent dans list_ref_code_domains'; END IF;

  -- Tout passe → ROLLBACK forcé (aucune donnée de test ne persiste).
  RAISE EXCEPTION 'TEST_OK_ROLLBACK: ref_code admin RPCs (editable/fail-closed/create/edit-locked/deactivate/structural/list) OK';
END $$;
