-- Platform branding: keep canonical profile roles and existing technical identities.
-- No data, organization permissions, RPC signatures, or table policies change.
-- The fresh-install definition is folded into ui_whitelabel_branding.sql.
BEGIN;
SET LOCAL lock_timeout = '500ms';
SET LOCAL statement_timeout = '10s';

CREATE OR REPLACE FUNCTION api.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, api, auth, pg_temp
AS $$
  -- Human platform authority comes only from the canonical server-managed profile.
  -- Auth metadata is not a second source of platform permissions.
  SELECT COALESCE(
    auth.role() IN ('service_role', 'admin')
    OR (auth.role() = 'authenticated' AND EXISTS (
      SELECT 1
      FROM public.app_user_profile p
      WHERE p.id = auth.uid()
        AND p.role IN ('owner', 'super_admin')
    )), false);
$$;

COMMENT ON FUNCTION api.is_platform_admin() IS
'Platform branding authority: authenticated owner/super_admin from app_user_profile, or the existing service_role/admin technical identity. Auth metadata never grants authority; missing auth context returns false.';

REVOKE ALL ON FUNCTION api.is_platform_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.is_platform_admin() TO authenticated, service_role;

DO $$ BEGIN
  IF has_function_privilege('anon', 'api.is_platform_admin()', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'api.is_platform_admin()', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'api.is_platform_admin()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Platform branding guard privileges differ from the expected contract';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
COMMIT;
