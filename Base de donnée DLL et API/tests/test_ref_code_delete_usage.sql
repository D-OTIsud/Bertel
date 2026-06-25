-- ============================================================================
-- test_ref_code_delete_usage.sql — Phase 7.5 (delivery 2)
-- Vérifie api.ref_code_usage_counts / ref_code_usage_count / rpc_delete_ref_code :
--   fail-closed sans super-admin · comptage exact (modèle d'unicité UUID) ·
--   suppression bloquée si référencée (23503) · suppression OK à 0 référence ·
--   domaine structurel refusé (42501).
-- UNE transaction forcée au ROLLBACK (RAISE final) ⇒ live intouché.
-- Exécution : psql -f tests/test_ref_code_delete_usage.sql (ou via le harnais CI).
-- ============================================================================
DO $$
DECLARE
  v_counts jsonb; v_n int; v_refused boolean; r jsonb; v_id uuid; v_exists boolean;
  -- Une valeur de domaine plat connue pour être référencée (media_type/Photo, ~3966 médias).
  v_photo uuid;
BEGIN
  -- 0) FAIL-CLOSED : sans contexte super-admin, le comptage ET la suppression refusent (42501).
  v_refused := false;
  BEGIN PERFORM api.ref_code_usage_counts('media_type');
  EXCEPTION WHEN sqlstate '42501' THEN v_refused := true; END;
  IF NOT v_refused THEN RAISE EXCEPTION 'FAIL: usage_counts FAIL-OPEN sans super-admin'; END IF;

  v_refused := false;
  BEGIN PERFORM api.rpc_delete_ref_code('media_type', gen_random_uuid());
  EXCEPTION WHEN sqlstate '42501' THEN v_refused := true; END;
  IF NOT v_refused THEN RAISE EXCEPTION 'FAIL: delete FAIL-OPEN sans super-admin'; END IF;

  -- Contexte super-admin transaction-local (réversible au ROLLBACK).
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  IF api.is_platform_superuser() IS NOT TRUE THEN
    RAISE EXCEPTION 'SETUP FAIL: contexte super-admin non établi';
  END IF;

  -- 1) Comptage : la valeur media_type la plus référencée a un compte > 0 cohérent avec media.
  SELECT rc.id INTO v_photo
  FROM ref_code rc
  WHERE rc.domain = 'media_type'
  ORDER BY (SELECT count(*) FROM media m WHERE m.media_type_id = rc.id) DESC
  LIMIT 1;
  v_counts := api.ref_code_usage_counts('media_type');
  IF NOT (v_counts ? v_photo::text) THEN
    RAISE EXCEPTION 'FAIL: la valeur media_type référencée est absente de la carte d''usage';
  END IF;
  IF (v_counts->>v_photo::text)::int <> (SELECT count(*) FROM media WHERE media_type_id = v_photo) THEN
    RAISE EXCEPTION 'FAIL: compte d''usage incohérent avec media (% vs %)',
      v_counts->>v_photo::text, (SELECT count(*) FROM media WHERE media_type_id = v_photo);
  END IF;

  -- 2) Compte mono-valeur cohérent avec la carte.
  v_n := api.ref_code_usage_count('media_type', v_photo);
  IF v_n <> (v_counts->>v_photo::text)::int THEN
    RAISE EXCEPTION 'FAIL: usage_count (%) != carte (%)', v_n, v_counts->>v_photo::text;
  END IF;

  -- 3) Suppression d'une valeur RÉFÉRENCÉE ⇒ bloquée (23503).
  v_refused := false;
  BEGIN PERFORM api.rpc_delete_ref_code('media_type', v_photo);
  EXCEPTION WHEN sqlstate '23503' THEN v_refused := true; END;
  IF NOT v_refused THEN RAISE EXCEPTION 'FAIL: suppression d''une valeur référencée non bloquée'; END IF;

  -- 4) Création d'une valeur neuve (0 référence) ⇒ usage 0 ⇒ suppression réussit.
  r := api.rpc_upsert_ref_code('price_type', 'TEST DEL USAGE 7p5', NULL, 'test_del_usage_7p5_ci');
  v_id := (r->>'id')::uuid;
  IF api.ref_code_usage_count('price_type', v_id) <> 0 THEN
    RAISE EXCEPTION 'FAIL: une valeur fraîchement créée devrait avoir 0 référence';
  END IF;
  PERFORM api.rpc_delete_ref_code('price_type', v_id);
  SELECT EXISTS(SELECT 1 FROM ref_code WHERE id = v_id) INTO v_exists;
  IF v_exists THEN RAISE EXCEPTION 'FAIL: la valeur 0-référence n''a pas été supprimée'; END IF;

  -- 5) Domaine STRUCTUREL ⇒ suppression refusée (42501).
  v_refused := false;
  BEGIN PERFORM api.rpc_delete_ref_code('taxonomy_res', gen_random_uuid());
  EXCEPTION WHEN sqlstate '42501' THEN v_refused := true; END;
  IF NOT v_refused THEN RAISE EXCEPTION 'FAIL: suppression dans un domaine structurel non refusée'; END IF;

  -- Tout passe → ROLLBACK forcé (aucune donnée de test ne persiste).
  RAISE EXCEPTION 'TEST_OK_ROLLBACK: ref_code usage/delete (fail-closed/count/blocked-when-refd/delete-at-0/structural-refused) OK';
END $$;
