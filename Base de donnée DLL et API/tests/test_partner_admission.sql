-- Run as migration owner. All fixtures, triggers and writes are rolled back.
BEGIN;
DO $$
DECLARE
  v_id uuid;
  v_hash text := encode(extensions.digest(gen_random_uuid()::text, 'sha256'), 'hex');
  r jsonb;
  i integer;
BEGIN
  IF (SELECT prosecdef FROM pg_proc WHERE oid='api.partner_admit(text,integer,integer)'::regprocedure) THEN
    RAISE EXCEPTION 'partner_admit wrapper must use SECURITY INVOKER';
  END IF;
  IF has_function_privilege('anon', 'api.partner_admit(text,integer,integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'api.partner_admit(text,integer,integer)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'api.partner_admit(text,integer,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'partner_admit must be service_role-only';
  END IF;
  INSERT INTO internal.partner_api_key(label, key_hash, key_prefix, scopes)
  VALUES ('__admission_test__', v_hash, '__admission__', ARRAY['read']) RETURNING id INTO v_id;
  PERFORM set_config('test.partner_admission_id', v_id::text, true);
  PERFORM set_config('test.partner_admission_hash', v_hash, true);
  IF api.partner_admit(NULL)->>'ok' <> 'false'
     OR api.partner_admit('malformed')->>'ok' <> 'false' THEN
    RAISE EXCEPTION 'invalid keys must fail closed';
  END IF;
  -- A single large window prevents a boundary crossing during this fixture.
  FOR i IN 1..3 LOOP
    r := api.partner_admit(v_hash, 2, 2147483647);
    IF r->>'id' <> v_id::text OR r->'scopes' <> '["read"]'::jsonb
       OR (r->'rate'->>'allowed')::boolean IS DISTINCT FROM (i <= 2)
       OR (r->'rate'->>'remaining')::integer <> greatest(0, 2-i)
       OR (r->'rate'->>'limit')::integer <> 2 THEN
      RAISE EXCEPTION 'incorrect admission verdict %: %', i, r;
    END IF;
    IF i = 3 AND (r->'rate'->>'retry_after')::integer <= 0 THEN
      RAISE EXCEPTION 'denied quota must provide a positive Retry-After';
    END IF;
  END LOOP;
  IF (SELECT sum(count) FROM internal.partner_rate_bucket WHERE key_id=v_id) <> 3 THEN
    RAISE EXCEPTION 'each admitted request must consume exactly one quota count';
  END IF;
  IF (SELECT last_used_at FROM internal.partner_api_key WHERE id=v_id) IS DISTINCT FROM now() THEN
    RAISE EXCEPTION 'authentication must retain last_used_at precision';
  END IF;
  UPDATE internal.partner_api_key SET revoked_at=now() WHERE id=v_id;
  IF api.partner_admit(v_hash)->>'ok' <> 'false' THEN RAISE EXCEPTION 'revoked key accepted'; END IF;
  UPDATE internal.partner_api_key SET revoked_at=NULL, expires_at=now()-interval '1 second' WHERE id=v_id;
  IF api.partner_admit(v_hash)->>'ok' <> 'false' THEN RAISE EXCEPTION 'expired key accepted'; END IF;
  UPDATE internal.partner_api_key SET expires_at=NULL, is_active=false WHERE id=v_id;
  IF api.partner_admit(v_hash)->>'ok' <> 'false' THEN RAISE EXCEPTION 'inactive key accepted'; END IF;
  IF (SELECT sum(count) FROM internal.partner_rate_bucket WHERE key_id=v_id) <> 3 THEN
    RAISE EXCEPTION 'rejected identities must not consume quota';
  END IF;
  UPDATE internal.partner_api_key SET is_active=true WHERE id=v_id;
END $$;

SET LOCAL ROLE service_role;
DO $$
BEGIN
  IF api.partner_admit(current_setting('test.partner_admission_hash'))->>'ok' <> 'true' THEN
    RAISE EXCEPTION 'service_role must be able to invoke admission and its protected helpers';
  END IF;
END $$;
RESET ROLE;

CREATE FUNCTION pg_temp.partner_admission_fault() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('test.partner_admission_cancel', true) = 'true' THEN
    RAISE EXCEPTION 'admission test injected timeout' USING ERRCODE = '57014';
  END IF;
  RAISE EXCEPTION 'admission test injected fault';
END $$;
CREATE TRIGGER partner_admission_test_fault BEFORE INSERT OR UPDATE ON internal.partner_rate_bucket
FOR EACH ROW EXECUTE FUNCTION pg_temp.partner_admission_fault();
DO $$
DECLARE r jsonb;
BEGIN
  r := api.partner_admit(current_setting('test.partner_admission_hash'), 2, 60);
  IF r->>'ok' <> 'true' OR r->'rate' <> '{"allowed":true,"retry_after":0,"limit":2,"remaining":2}'::jsonb THEN
    RAISE EXCEPTION 'limiter failure must fail open after authentication: %', r;
  END IF;
  IF api.partner_admit('invalid')->>'ok' <> 'false' THEN
    RAISE EXCEPTION 'limiter failure bypassed authentication';
  END IF;
  PERFORM set_config('test.partner_admission_cancel', 'true', true);
  r := api.partner_admit(current_setting('test.partner_admission_hash'), 2, 60);
  IF r->>'ok' <> 'true' OR r->'rate' <> '{"allowed":true,"retry_after":0,"limit":2,"remaining":2}'::jsonb THEN
    RAISE EXCEPTION 'limiter timeout must fail open after authentication: %', r;
  END IF;
  PERFORM set_config('test.partner_admission_cancel', 'false', true);
END $$;
CREATE TRIGGER partner_admission_auth_fault BEFORE UPDATE ON internal.partner_api_key
FOR EACH ROW EXECUTE FUNCTION pg_temp.partner_admission_fault();
DO $$
BEGIN
  BEGIN
    PERFORM api.partner_admit(current_setting('test.partner_admission_hash'));
    RAISE EXCEPTION 'authentication error was swallowed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'admission test injected fault' THEN RAISE; END IF;
  END;
  PERFORM set_config('test.partner_admission_cancel', 'true', true);
  BEGIN
    PERFORM api.partner_admit(current_setting('test.partner_admission_hash'));
    RAISE EXCEPTION 'authentication timeout was swallowed';
  EXCEPTION WHEN query_canceled THEN
    IF SQLERRM <> 'admission test injected timeout' THEN RAISE; END IF;
  END;
END $$;
ROLLBACK;
