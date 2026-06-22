-- test_ai_provider_config.sql — Phase 1 (manifest 16a) AI provider config + Vault key.
-- Run inside a txn that ROLLBACKs. Verifies the security invariants of the design
-- (docs/superpowers/specs/2026-06-22-ai-menu-extraction-design.md §4, §8):
--   · the key NEVER leaks through list_ai_providers
--   · the decrypting reader (get_active_ai_provider_secret) is service_role-only
--   · upsert/list/activate are super-admin gated and keep exactly one active provider
BEGIN;

-- Pass the super-admin gate the way PostgREST would for service_role.
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- 1. Table exists with RLS enabled.
DO $$
BEGIN
  ASSERT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='app_ai_provider_config'),
    'table public.app_ai_provider_config is missing';
  ASSERT (SELECT relrowsecurity FROM pg_class WHERE oid='public.app_ai_provider_config'::regclass),
    'RLS must be enabled on app_ai_provider_config';
END$$;

-- 2. The decrypting reader is service_role-only (anon/authenticated cannot execute).
DO $$
BEGIN
  ASSERT NOT has_function_privilege('anon', 'api.get_active_ai_provider_secret()', 'execute'),
    'anon must NOT execute get_active_ai_provider_secret';
  ASSERT NOT has_function_privilege('authenticated', 'api.get_active_ai_provider_secret()', 'execute'),
    'authenticated must NOT execute get_active_ai_provider_secret';
  ASSERT has_function_privilege('service_role', 'api.get_active_ai_provider_secret()', 'execute'),
    'service_role must execute get_active_ai_provider_secret';
END$$;

-- 3. Full lifecycle: upsert (with key) → key in Vault but never in list → one active at a time.
DO $$
DECLARE
  v_id1 uuid; v_id2 uuid; v_key text; v_active int; v_has_key boolean; v_model text;
BEGIN
  -- create provider 1 with a key, requested active
  v_id1 := api.upsert_ai_provider(NULL, 'TestProv1', 'openai_compatible',
                                  'https://api.example.com/v1', 'gpt-test-1', 4096, true,
                                  '{}'::jsonb, 'sk-secret-AAA');
  ASSERT v_id1 IS NOT NULL, 'upsert returned NULL id';
  ASSERT (SELECT key_secret_id IS NOT NULL FROM app_ai_provider_config WHERE id=v_id1),
    'a provided key must produce a Vault pointer (key_secret_id)';

  -- the key round-trips ONLY through the service_role reader
  SELECT api_key INTO v_key FROM api.get_active_ai_provider_secret();
  ASSERT v_key = 'sk-secret-AAA', 'get_active_ai_provider_secret must return the decrypted key, got '||coalesce(v_key,'NULL');

  -- list NEVER exposes the key (string must not appear anywhere in the rows)
  ASSERT NOT EXISTS (SELECT 1 FROM api.list_ai_providers() r WHERE r::text LIKE '%sk-secret-AAA%'),
    'list_ai_providers leaked the API key';
  SELECT has_key INTO v_has_key FROM api.list_ai_providers() WHERE id=v_id1;
  ASSERT v_has_key, 'list_ai_providers must report has_key=true when a key is set';

  -- create provider 2 active → exactly one active, provider 1 deactivated
  v_id2 := api.upsert_ai_provider(NULL, 'TestProv2', 'openai_compatible',
                                  'https://api2.example.com/v1', 'gpt-test-2', 2048, true,
                                  '{}'::jsonb, NULL);
  SELECT count(*) INTO v_active FROM app_ai_provider_config WHERE is_active;
  ASSERT v_active = 1, 'exactly one provider must be active, got '||v_active;
  ASSERT (SELECT is_active FROM app_ai_provider_config WHERE id=v_id2), 'provider 2 must be active';
  ASSERT NOT (SELECT is_active FROM app_ai_provider_config WHERE id=v_id1), 'provider 1 must be deactivated';

  -- get_active now reflects provider 2 (keyless → NULL api_key, no error)
  SELECT model, api_key INTO v_model, v_key FROM api.get_active_ai_provider_secret();
  ASSERT v_model = 'gpt-test-2', 'active provider must be provider 2, got '||coalesce(v_model,'NULL');
  ASSERT v_key IS NULL, 'a keyless active provider must yield NULL api_key';

  -- re-activate provider 1 via set_active_ai_provider
  PERFORM api.set_active_ai_provider(v_id1);
  SELECT count(*) INTO v_active FROM app_ai_provider_config WHERE is_active;
  ASSERT v_active = 1, 'set_active must keep exactly one active, got '||v_active;
  ASSERT (SELECT is_active FROM app_ai_provider_config WHERE id=v_id1), 'set_active(provider1) must activate it';

  RAISE NOTICE 'AI PROVIDER CONFIG TEST OK';
END$$;

ROLLBACK;
