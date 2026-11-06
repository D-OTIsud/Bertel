-- Synthetic, transaction-local fixtures; no provider calls.
BEGIN;
INSERT INTO auth.users(id, email, raw_app_meta_data, raw_user_meta_data) VALUES
  ('4b84b8f0-2752-4d17-b2d9-000000000001', 'ai-quota-one@example.invalid', '{}', '{}'),
  ('4b84b8f0-2752-4d17-b2d9-000000000002', 'ai-quota-two@example.invalid', '{}', '{}');

DO $test$
BEGIN
  IF has_function_privilege('anon', 'api.admit_ai_request(uuid,text)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'api.admit_ai_request(uuid,text)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'api.admit_ai_request(uuid,text)', 'EXECUTE')
    OR has_table_privilege('authenticated', 'internal.ai_request_rate_state', 'SELECT,INSERT,UPDATE,DELETE')
    OR has_table_privilege('anon', 'internal.ai_request_rate_state', 'SELECT,INSERT,UPDATE,DELETE')
    OR has_table_privilege('service_role', 'internal.ai_request_rate_state', 'DELETE')
    OR EXISTS (
      SELECT 1 FROM pg_class c,
        LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) AS a
      WHERE c.oid = 'internal.ai_request_rate_state'::regclass AND a.grantee = 0
    )
    OR EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = 'api.admit_ai_request(uuid,text)'::regprocedure AND p.prosecdef)
  THEN RAISE EXCEPTION 'AI admission privileges or invoker contract changed'; END IF;
END;
$test$;

SET LOCAL ROLE authenticated;
DO $test$
BEGIN
  BEGIN
    PERFORM api.admit_ai_request('4b84b8f0-2752-4d17-b2d9-000000000001', 'translate');
    RAISE EXCEPTION 'authenticated must not choose another admission identity';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$test$;
RESET ROLE;

SET LOCAL ROLE service_role;
DO $test$
DECLARE
  u uuid := '4b84b8f0-2752-4d17-b2d9-000000000001';
  result jsonb;
  before_deny timestamptz[];
BEGIN
  IF current_user <> 'service_role' THEN RAISE EXCEPTION 'non-vacuity: expected service_role'; END IF;
  IF NOT (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) THEN
    RAISE EXCEPTION 'Expected the actual Supabase service-role RLS contract';
  END IF;
  FOR i IN 1..12 LOOP
    result := api.admit_ai_request(u, 'translate');
    IF result->'allowed' <> 'true'::jsonb OR (result->>'remaining')::integer <> 12-i
      OR result->>'retry_after' <> '0' THEN RAISE EXCEPTION 'legitimate request % refused: %', i, result; END IF;
  END LOOP;
  SELECT hits INTO before_deny FROM internal.ai_request_rate_state WHERE user_id=u AND route='translate';
  result := api.admit_ai_request(u, 'translate');
  IF result->'allowed' <> 'false'::jsonb OR result->>'remaining' <> '0'
    OR (result->>'retry_after')::integer NOT BETWEEN 1 AND 60
    OR (SELECT hits FROM internal.ai_request_rate_state WHERE user_id=u AND route='translate') IS DISTINCT FROM before_deny
  THEN RAISE EXCEPTION 'denial must not append, reset or consume another slot'; END IF;

  IF api.admit_ai_request(u, 'menu_extract')->'allowed' <> 'true'::jsonb
    OR api.admit_ai_request('4b84b8f0-2752-4d17-b2d9-000000000002', 'translate')->'allowed' <> 'true'::jsonb
  THEN RAISE EXCEPTION 'user and route budgets must remain separate'; END IF;

  -- Eleven recent hits and one already at the strict 60s boundary: only one
  -- slot expires, rather than resetting a fixed minute or the whole window.
  UPDATE internal.ai_request_rate_state SET hits =
    array_fill(clock_timestamp() - interval '30 seconds', ARRAY[11]) || ARRAY[clock_timestamp() - interval '60 seconds']
  WHERE user_id=u AND route='translate';
  result := api.admit_ai_request(u, 'translate');
  IF result->'allowed' <> 'true'::jsonb OR result->>'remaining' <> '0'
    OR (SELECT cardinality(hits) FROM internal.ai_request_rate_state WHERE user_id=u AND route='translate') <> 12
    OR api.admit_ai_request(u, 'translate')->'allowed' <> 'false'::jsonb
  THEN RAISE EXCEPTION 'sliding window must expire exactly the old slot'; END IF;

  UPDATE internal.ai_request_rate_state SET hits = array_fill(clock_timestamp() - interval '60 seconds', ARRAY[12])
  WHERE user_id=u AND route='translate';
  result := api.admit_ai_request(u, 'translate');
  IF result->'allowed' <> 'true'::jsonb OR result->>'remaining' <> '11' THEN RAISE EXCEPTION 'expired window not recoverable'; END IF;

  BEGIN
    PERFORM api.admit_ai_request(u, 'arbitrary_route');
    RAISE EXCEPTION 'unexpected route accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM api.admit_ai_request(NULL, 'translate');
    RAISE EXCEPTION 'missing verified identity accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
END;
$test$;
RESET ROLE;
ROLLBACK;
\echo 'Distributed AI admission: service identity, 12/60 sliding window, route/user isolation and denials passed'
