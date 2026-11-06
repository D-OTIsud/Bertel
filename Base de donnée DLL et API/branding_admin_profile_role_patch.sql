-- =====================================================
-- Patch: allow app_user_profile platform roles to manage UI branding
-- Created on 2026-05-14
--
-- Apply this on databases where ui_whitelabel_branding.sql was already run
-- before the branding admin guard checked app_user_profile.role.
-- Kept aligned with the canonical guard; the current incremental upgrade is
-- supabase/migrations/20261106053951_branding_admin_authorization.sql.
-- =====================================================

BEGIN;

CREATE SCHEMA IF NOT EXISTS api;

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

COMMIT;
