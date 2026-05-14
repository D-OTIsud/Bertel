-- =====================================================
-- Patch: allow app_user_profile platform roles to manage UI branding
-- Created on 2026-05-14
--
-- Apply this on databases where ui_whitelabel_branding.sql was already run
-- before the branding admin guard checked app_user_profile.role.
-- =====================================================

BEGIN;

CREATE SCHEMA IF NOT EXISTS api;

CREATE OR REPLACE FUNCTION api.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, api, auth
AS $$
  SELECT
    auth.role() IN ('service_role', 'admin')
    OR EXISTS (
      SELECT 1
      FROM public.app_user_profile p
      WHERE p.id = auth.uid()
        AND p.role IN ('owner', 'super_admin')
    )
    OR EXISTS (
      SELECT 1
      FROM auth.users u
      WHERE u.id = auth.uid()
        AND COALESCE(
          NULLIF(lower(u.raw_app_meta_data ->> 'role'), ''),
          NULLIF(lower(u.raw_user_meta_data ->> 'role'), ''),
          ''
        ) IN ('admin', 'owner', 'super_admin')
    );
$$;

COMMENT ON FUNCTION api.is_platform_admin() IS
'Returns true when the current user can manage platform-level branding and UI theme settings, using app_user_profile or auth metadata.';

GRANT EXECUTE ON FUNCTION api.is_platform_admin() TO authenticated, service_role;

COMMIT;
