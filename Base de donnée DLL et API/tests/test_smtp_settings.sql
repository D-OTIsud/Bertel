-- Run only on a local/test database. All mutations roll back; no SMTP connection is made.
BEGIN;
SELECT set_config('request.jwt.claims', '{"role":"service_role","sub":"00000000-0000-4000-8000-000000000099"}', true);

DO $test$
DECLARE v_secret uuid; v_value text;
BEGIN
  ASSERT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.app_smtp_config'::regclass), 'SMTP table must have RLS';
  ASSERT NOT has_table_privilege('anon', 'public.app_smtp_config', 'select'), 'No anonymous table read';
  ASSERT NOT has_table_privilege('authenticated', 'public.app_smtp_config', 'select'), 'No direct authenticated table read';
  ASSERT NOT has_function_privilege('anon', 'api.get_smtp_config()', 'execute'), 'No anonymous management read';
  ASSERT NOT has_function_privilege('anon', 'api.upsert_smtp_config(boolean,text,integer,boolean,text,text,text,text,text)', 'execute'), 'No anonymous write';
  ASSERT NOT has_function_privilege('authenticated', 'api.get_smtp_config_secret()', 'execute'), 'No client secret read';
  ASSERT NOT has_function_privilege('anon', 'api.get_smtp_config_secret()', 'execute'), 'No anonymous secret read';
  ASSERT has_function_privilege('service_role', 'api.get_smtp_config_secret()', 'execute'), 'Server secret read required';

  PERFORM api.upsert_smtp_config(true, 'smtp.example.com', 587, false, 'mail@example.com', 'Bertel', 'password', 'smtp-user', 'smtp-test-one');
  SELECT password_secret_id INTO v_secret FROM public.app_smtp_config WHERE id;
  ASSERT v_secret IS NOT NULL, 'Password must be stored in Vault';
  ASSERT (SELECT password = 'smtp-test-one' FROM api.get_smtp_config_secret()), 'Server reader must decrypt';
  ASSERT (SELECT has_password FROM api.get_smtp_config()), 'Management reader must indicate a saved password';
  ASSERT NOT EXISTS (SELECT 1 FROM api.get_smtp_config() r WHERE row_to_json(r)::text LIKE '%smtp-test-one%'), 'Management reader must not expose secret';

  PERFORM api.upsert_smtp_config(true, 'smtp.example.com', 465, true, 'mail@example.com', 'Renamed', 'password', 'smtp-user', NULL);
  ASSERT (SELECT password_secret_id = v_secret FROM public.app_smtp_config WHERE id), 'Blank keeps same Vault pointer';
  ASSERT (SELECT password = 'smtp-test-one' FROM api.get_smtp_config_secret()), 'Blank keeps password';
  BEGIN
    PERFORM api.upsert_smtp_config(true, 'other.example.com', 465, true, 'mail@example.com', 'Renamed', 'password', 'smtp-user', NULL);
    RAISE EXCEPTION 'Changed host must require a fresh password';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;
  PERFORM api.upsert_smtp_config(false, 'smtp.example.com', 465, true, 'mail@example.com', 'Renamed', 'password', 'smtp-user', 'smtp-test-two');
  ASSERT (SELECT password = 'smtp-test-two' AND NOT enabled FROM api.get_smtp_config_secret()), 'Rotation and disabled state must be saved';
  PERFORM api.upsert_smtp_config(true, 'smtp.example.com', 587, false, 'mail@example.com', 'Bertel', 'relay', NULL, NULL);
  ASSERT NOT EXISTS (SELECT 1 FROM vault.secrets WHERE id = v_secret), 'Relay mode removes the old secret';
  ASSERT (SELECT password IS NULL AND username IS NULL FROM api.get_smtp_config_secret()), 'Relay mode clears credentials';
  ASSERT (SELECT count(*) = 1 FROM public.app_smtp_config), 'Only one config';
END $test$;

-- Both no-user and non-admin contexts fail closed even though the function is executable.
SELECT set_config('request.jwt.claims', '{}', true);
DO $test$
BEGIN
  BEGIN PERFORM api.get_smtp_config(); RAISE EXCEPTION 'Missing uid was accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM api.upsert_smtp_config(true, 'smtp.example.com', 587, false, 'mail@example.com', 'Bertel', 'relay'); RAISE EXCEPTION 'Missing uid write accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $test$;
SELECT set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000099"}', true);
DO $test$
BEGIN
  BEGIN PERFORM api.get_smtp_config(); RAISE EXCEPTION 'Non-admin was accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM api.upsert_smtp_config(true, 'smtp.example.com', 587, false, 'mail@example.com', 'Bertel', 'relay'); RAISE EXCEPTION 'Non-admin write accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $test$;
ROLLBACK;
