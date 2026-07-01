-- tests/test_partner_rate_limit.sql
-- Pins the R2 partner rate-limiter (audit API) : internal.partner_rate_bucket +
-- api.partner_rate_check. Structural (table/RLS/grants) + behavioural fixed-window
-- (under limit → allowed, over → denied + retry_after). Self-cleaning (rolled back).
DO $$
DECLARE
  v_raw text := 'bk_live_' || encode(extensions.gen_random_bytes(24),'hex');
  v_id  uuid;
  r1 jsonb; r2 jsonb; r3 jsonb;
BEGIN
  -- 1. Table exists with RLS ON (schema internal).
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='internal' AND c.relname='partner_rate_bucket' AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'internal.partner_rate_bucket missing or RLS not enabled';
  END IF;

  -- 2. Function exists, SECURITY DEFINER, service_role-ONLY.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='api' AND p.proname='partner_rate_check' AND p.prosecdef
  ) THEN
    RAISE EXCEPTION 'api.partner_rate_check missing or not SECURITY DEFINER';
  END IF;
  IF has_function_privilege('anon','api.partner_rate_check(uuid,integer,integer)','EXECUTE')
     OR has_function_privilege('authenticated','api.partner_rate_check(uuid,integer,integer)','EXECUTE') THEN
    RAISE EXCEPTION 'partner_rate_check must be service_role-only';
  END IF;

  -- 3. Behavioural: with limit=2, the first two calls pass and the third is denied.
  INSERT INTO internal.partner_api_key(label, key_hash, key_prefix)
  VALUES ('__rate_test__', encode(extensions.digest(v_raw,'sha256'),'hex'), left(v_raw,16))
  RETURNING id INTO v_id;

  r1 := api.partner_rate_check(v_id, 2, 60);
  r2 := api.partner_rate_check(v_id, 2, 60);
  r3 := api.partner_rate_check(v_id, 2, 60);

  IF (r1->>'allowed')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'call1 should be allowed: %', r1; END IF;
  IF (r2->>'allowed')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'call2 should be allowed: %', r2; END IF;
  IF (r3->>'allowed')::boolean IS TRUE       THEN RAISE EXCEPTION 'call3 should be DENIED: %', r3; END IF;
  IF (r3->>'retry_after') IS NULL            THEN RAISE EXCEPTION 'denied response must carry retry_after: %', r3; END IF;

  RAISE NOTICE 'test_partner_rate_limit.sql: OK';
  RAISE EXCEPTION 'ROLLBACK_PROBE';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'ROLLBACK_PROBE' THEN RAISE; END IF;
END $$;
