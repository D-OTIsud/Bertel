-- Behavioral regression for the real branding helper, RPC and RLS policy.
-- Run as postgres on a disposable test database. All fixtures/grants roll back.
\set ON_ERROR_STOP on
BEGIN;

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
INSERT INTO auth.users (id, email, raw_app_meta_data, raw_user_meta_data) VALUES
  ('00000000-0000-4000-a000-00000000bd01', 'branding-agent@example.invalid', '{}', '{}'),
  ('00000000-0000-4000-a000-00000000bd02', 'branding-superadmin@example.invalid', '{}', '{}'),
  ('00000000-0000-4000-a000-00000000bd03', 'branding-owner@example.invalid', '{}', '{}'),
  ('00000000-0000-4000-a000-00000000bd04', 'branding-no-profile@example.invalid', '{}', '{}'),
  ('00000000-0000-4000-a000-00000000bd05', 'branding-null-role@example.invalid', '{}', '{}');
INSERT INTO public.app_user_profile (id, role) VALUES
  ('00000000-0000-4000-a000-00000000bd01', 'tourism_agent'),
  ('00000000-0000-4000-a000-00000000bd02', 'super_admin'),
  ('00000000-0000-4000-a000-00000000bd03', 'owner'),
  ('00000000-0000-4000-a000-00000000bd05', NULL)
ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;
DELETE FROM public.app_user_profile WHERE id = '00000000-0000-4000-a000-00000000bd04';

-- Change metadata AFTER profile creation so it cannot seed a legitimate profile role.
-- Both stored auth metadata and JWT metadata must be irrelevant to this guard.
UPDATE auth.users SET raw_user_meta_data = '{"role":"admin"}', raw_app_meta_data = '{}'
  WHERE id = '00000000-0000-4000-a000-00000000bd01';
UPDATE auth.users SET raw_app_meta_data = '{"role":"super_admin"}', raw_user_meta_data = '{}'
  WHERE id IN ('00000000-0000-4000-a000-00000000bd04', '00000000-0000-4000-a000-00000000bd05');

-- The write grants exist only within this rolled-back test. This proves the RLS
-- predicate itself, instead of passing solely because a table grant was absent.
GRANT UPDATE ON public.app_branding_settings TO authenticated;

DO $test$
DECLARE
  v_uid uuid;
  v_claims jsonb;
  v_rows bigint;
  v_before jsonb;
  v_result jsonb;
  v_denied boolean;
BEGIN
  ASSERT NOT has_function_privilege('anon', 'api.is_platform_admin()', 'EXECUTE'),
    'Anonymous callers must not execute the private branding helper';
  ASSERT has_function_privilege('authenticated', 'api.is_platform_admin()', 'EXECUTE');
  ASSERT has_function_privilege('service_role', 'api.is_platform_admin()', 'EXECUTE');
  SELECT to_jsonb(s) INTO v_before FROM public.app_branding_settings s WHERE setting_key = 'default';
  ASSERT v_before IS NOT NULL, 'The singleton fixture must exist';

  FOREACH v_uid IN ARRAY ARRAY[
    '00000000-0000-4000-a000-00000000bd01'::uuid,
    '00000000-0000-4000-a000-00000000bd04'::uuid,
    '00000000-0000-4000-a000-00000000bd05'::uuid
  ] LOOP
    v_claims := jsonb_build_object('sub', v_uid, 'role', 'authenticated',
      'user_metadata', jsonb_build_object('role', 'admin'),
      'app_metadata', jsonb_build_object('role', 'super_admin'));
    PERFORM set_config('request.jwt.claims', v_claims::text, true);
    SET LOCAL ROLE authenticated;
    ASSERT api.is_platform_admin() IS FALSE, 'Metadata or a missing/nonprivileged profile granted platform authority';
    v_denied := false;
    BEGIN
      PERFORM api.upsert_app_branding(p_brand_name => 'must not persist');
    EXCEPTION WHEN insufficient_privilege THEN v_denied := true;
    END;
    ASSERT v_denied, 'Nonprivileged caller reached the real SECURITY DEFINER writer';
    UPDATE public.app_branding_settings SET brand_name = 'must not persist' WHERE setting_key = 'default';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    ASSERT v_rows = 0, 'Nonprivileged caller passed the direct-write RLS predicate';
    RESET ROLE;
    ASSERT (SELECT to_jsonb(s) FROM public.app_branding_settings s WHERE setting_key = 'default') = v_before,
      'A rejected attempt changed branding';
  END LOOP;

  -- No identity and no authentication context must return FALSE, never NULL.
  FOREACH v_claims IN ARRAY ARRAY[
    '{}'::jsonb,
    '{"role":"authenticated"}'::jsonb,
    '{"role":"authenticated","sub":null}'::jsonb,
    '{"role":"anon"}'::jsonb,
    '{"sub":"00000000-0000-4000-a000-00000000bd02"}'::jsonb
  ] LOOP
    PERFORM set_config('request.jwt.claims', v_claims::text, true);
    SET LOCAL ROLE authenticated;
    ASSERT api.is_platform_admin() IS FALSE, 'Missing auth context or uid must fail closed';
    v_denied := false;
    BEGIN
      PERFORM api.upsert_app_branding(p_brand_name => 'must not persist');
    EXCEPTION WHEN insufficient_privilege THEN v_denied := true;
    END;
    ASSERT v_denied, 'An identity-free call passed the SECURITY DEFINER writer';
    RESET ROLE;
  END LOOP;

  -- Canonical platform roles work even with no metadata role: no admin lockout.
  FOREACH v_uid IN ARRAY ARRAY[
    '00000000-0000-4000-a000-00000000bd02'::uuid,
    '00000000-0000-4000-a000-00000000bd03'::uuid
  ] LOOP
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    ASSERT api.is_platform_admin() IS TRUE, 'Canonical owner/super_admin lost authority';
    v_result := api.upsert_app_branding(p_brand_name => 'canonical platform role');
    ASSERT v_result->>'brandName' = 'canonical platform role', 'Real writer did not persist the authorized change';
    UPDATE public.app_branding_settings SET brand_name = 'canonical direct write' WHERE setting_key = 'default';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    ASSERT v_rows = 1, 'Canonical platform role failed the direct-write RLS predicate';
    RESET ROLE;
    ASSERT (SELECT brand_name FROM public.app_branding_settings WHERE setting_key = 'default') = 'canonical direct write';
    ASSERT (SELECT updated_by FROM public.app_branding_settings WHERE setting_key = 'default') = v_uid;
  END LOOP;

  -- Retain the existing technical identities, independent of human profiles.
  FOREACH v_claims IN ARRAY ARRAY['{"role":"service_role"}'::jsonb, '{"role":"admin"}'::jsonb] LOOP
    PERFORM set_config('request.jwt.claims', v_claims::text, true);
    SET LOCAL ROLE service_role;
    ASSERT api.is_platform_admin() IS TRUE, 'Existing technical branding authority changed';
    v_result := api.upsert_app_branding(p_brand_name => 'technical platform identity');
    ASSERT v_result->>'brandName' = 'technical platform identity';
    RESET ROLE;
  END LOOP;

  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  SET LOCAL ROLE anon;
  v_result := api.get_public_branding();
  ASSERT v_result->>'brandName' = 'technical platform identity',
    'Anonymous login branding must still return the nonempty public singleton';
  v_denied := false;
  BEGIN
    PERFORM api.upsert_app_branding(p_brand_name => 'anonymous must not persist');
  EXCEPTION WHEN insufficient_privilege THEN v_denied := true;
  END;
  ASSERT v_denied, 'Anonymous caller reached the branding writer';
  RESET ROLE;
  RAISE NOTICE 'Branding authorization passed: metadata denied, real platform roles retained, missing identities closed, real writer and RLS exercised';
END;
$test$;
ROLLBACK;
