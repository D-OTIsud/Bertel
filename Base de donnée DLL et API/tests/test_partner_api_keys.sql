-- tests/test_partner_api_keys.sql
-- Pins the R1a partner-API-key foundation (audit API, Phase 1) :
--   internal.partner_api_key / partner_api_call + api.rpc_issue/revoke/list_partner_keys
--   + api.partner_authenticate / partner_log_call.
-- Structural (existence, RLS, grants, fail-closed gate) + behavioural round-trip
-- (auth by hash, scopes, revoke, log). Runs as the CI role (no JWT →
-- is_platform_superuser() is NULL), so the management gate must FAIL-CLOSED.
-- Self-cleaning: the round-trip runs in a sub-transaction always rolled back.
DO $$
DECLARE
  v_raw  text := 'bk_live_' || encode(extensions.gen_random_bytes(24),'hex');
  v_hash text := encode(extensions.digest(v_raw,'sha256'),'hex');
  v_id   uuid;
  v_auth jsonb;
BEGIN
  -- 1. Tables exist with RLS ON (schema internal, not PostgREST-exposed).
  IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='internal' AND c.relname IN ('partner_api_key','partner_api_call') AND c.relrowsecurity) <> 2 THEN
    RAISE EXCEPTION 'partner_api_key/partner_api_call missing or RLS not enabled';
  END IF;

  -- 2. The 6 functions exist and are SECURITY DEFINER.
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='api' AND p.prosecdef
        AND p.proname IN ('rpc_issue_partner_key','rpc_revoke_partner_key','list_partner_keys',
                          'partner_authenticate','partner_log_call')) <> 5 THEN
    RAISE EXCEPTION 'partner-key RPCs missing or not SECURITY DEFINER';
  END IF;

  -- 3. Grants: auth/log are service_role-ONLY; management is not anon-callable.
  IF has_function_privilege('anon','api.partner_authenticate(text)','EXECUTE')
     OR has_function_privilege('authenticated','api.partner_authenticate(text)','EXECUTE') THEN
    RAISE EXCEPTION 'partner_authenticate must be service_role-only (anon/authenticated denied)';
  END IF;
  IF NOT has_function_privilege('service_role','api.partner_authenticate(text)','EXECUTE') THEN
    RAISE EXCEPTION 'partner_authenticate must be EXECUTE-able by service_role';
  END IF;
  IF has_function_privilege('anon','api.rpc_issue_partner_key(text,text[],timestamptz)','EXECUTE') THEN
    RAISE EXCEPTION 'rpc_issue_partner_key must not be anon-callable';
  END IF;

  -- 4. GATE fail-closed: with no auth context (is_platform_superuser() = NULL), issuing MUST be refused.
  --    (Regression guard for the fail-open `IF NOT fn()` bug on a NULL result.)
  BEGIN
    PERFORM api.rpc_issue_partner_key('__should_fail__');
    RAISE EXCEPTION 'expected FORBIDDEN from rpc_issue_partner_key without superuser, none raised';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL; -- 42501 expected
  END;

  -- 5. Behavioural round-trip (direct insert bypasses the gate, which #4 covered).
  INSERT INTO internal.partner_api_key(label, key_hash, key_prefix, scopes)
  VALUES ('__test_partner__', v_hash, left(v_raw,16), ARRAY['read'])
  RETURNING id INTO v_id;

  v_auth := api.partner_authenticate(v_hash);
  IF (v_auth->>'ok')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'auth by hash should succeed: %', v_auth; END IF;
  IF v_auth->'scopes' <> to_jsonb(ARRAY['read']) THEN RAISE EXCEPTION 'auth scopes wrong: %', v_auth; END IF;
  IF (v_auth->>'id') <> v_id::text THEN RAISE EXCEPTION 'auth id mismatch'; END IF;
  IF (SELECT last_used_at FROM internal.partner_api_key WHERE id=v_id) IS NULL THEN
    RAISE EXCEPTION 'last_used_at not stamped on auth';
  END IF;
  IF (api.partner_authenticate('deadbeef')->>'ok')::boolean IS TRUE THEN RAISE EXCEPTION 'unknown hash accepted'; END IF;
  IF (api.partner_authenticate('')->>'ok')::boolean IS TRUE THEN RAISE EXCEPTION 'empty hash accepted'; END IF;

  -- revoke → auth refused
  UPDATE internal.partner_api_key SET is_active=false, revoked_at=now() WHERE id=v_id;
  IF (api.partner_authenticate(v_hash)->>'ok')::boolean IS TRUE THEN RAISE EXCEPTION 'revoked key still authenticates'; END IF;

  -- log
  PERFORM api.partner_log_call(v_id, '/api/public/objects', 200);
  IF (SELECT count(*) FROM internal.partner_api_call WHERE key_id=v_id) <> 1 THEN RAISE EXCEPTION 'call not logged'; END IF;

  RAISE EXCEPTION 'ROLLBACK_PROBE'; -- leave no partner rows behind
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'ROLLBACK_PROBE' THEN RAISE; END IF;
END $$;

DO $$ BEGIN RAISE NOTICE 'test_partner_api_keys.sql: OK'; END $$;
