-- =====================================================
-- UI / White-label branding settings for Bertel 3.0
-- Separate migration file for the main Supabase/PostgreSQL database
-- Created on 2026-03-12
--
-- Purpose
--   - Persist global brand/theme settings used by the front-end
--   - Expose a public-safe branding payload for the login page
--   - Expose an authenticated payload with marker styles
--   - Restrict theme writes to platform admins only
--
-- Notes
--   - This file is intentionally separate from schema_unified.sql so you can
--     review/apply it independently.
--   - It assumes the helper function update_updated_at_column() already exists
--     in the main schema, as defined in schema_unified.sql.
--   - It stores marker styles as JSONB so the front-end can persist the
--     per-object-type color/icon configuration added in Settings.
-- =====================================================

BEGIN;

CREATE SCHEMA IF NOT EXISTS api;

-- -----------------------------------------------------
-- 1) Helper: identify platform admins allowed to edit branding
-- -----------------------------------------------------
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
      FROM auth.users u
      WHERE u.id = auth.uid()
        AND COALESCE(
          NULLIF(lower(u.raw_app_meta_data ->> 'role'), ''),
          NULLIF(lower(u.raw_user_meta_data ->> 'role'), ''),
          ''
        ) IN ('admin', 'super_admin')
    );
$$;

COMMENT ON FUNCTION api.is_platform_admin() IS
'Returns true when the current user can manage platform-level branding and UI theme settings.';

-- -----------------------------------------------------
-- 2) Global branding settings (singleton row)
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_branding_settings (
  setting_key TEXT PRIMARY KEY DEFAULT 'default',
  brand_name TEXT NOT NULL DEFAULT 'Tourism UI',
  logo_storage_path TEXT,
  logo_public_url TEXT,
  logo_mime_type TEXT,
  primary_color TEXT NOT NULL DEFAULT '#0C7D75',
  accent_color TEXT NOT NULL DEFAULT '#E4703C',
  text_color TEXT NOT NULL DEFAULT '#2B1F18',
  background_color TEXT NOT NULL DEFAULT '#F7F0E8',
  surface_color TEXT NOT NULL DEFAULT '#FFFAF4',
  marker_styles JSONB NOT NULL DEFAULT '{}'::jsonb,
  extra JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT chk_app_branding_singleton
    CHECK (setting_key = 'default'),
  CONSTRAINT chk_app_branding_logo_mime
    CHECK (
      logo_mime_type IS NULL
      OR lower(logo_mime_type) IN ('image/png', 'image/jpeg', 'image/webp', 'image/svg+xml')
    ),
  CONSTRAINT chk_app_branding_logo_url
    CHECK (
      logo_public_url IS NULL
      OR logo_public_url ~* '^(https?://|/storage/v1/object/public/)'
    ),
  CONSTRAINT chk_app_branding_primary_color
    CHECK (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  CONSTRAINT chk_app_branding_accent_color
    CHECK (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  CONSTRAINT chk_app_branding_text_color
    CHECK (text_color ~ '^#[0-9A-Fa-f]{6}$'),
  CONSTRAINT chk_app_branding_background_color
    CHECK (background_color ~ '^#[0-9A-Fa-f]{6}$'),
  CONSTRAINT chk_app_branding_surface_color
    CHECK (surface_color ~ '^#[0-9A-Fa-f]{6}$'),
  CONSTRAINT chk_app_branding_marker_styles_object
    CHECK (jsonb_typeof(marker_styles) = 'object'),
  CONSTRAINT chk_app_branding_extra_object
    CHECK (jsonb_typeof(extra) = 'object')
);

COMMENT ON TABLE public.app_branding_settings IS
'Singleton table storing white-label branding, colors, logo reference, and map marker styles for the UI.';

COMMENT ON COLUMN public.app_branding_settings.marker_styles IS
'JSONB object keyed by object type (RES, ITI, FMA, etc.) containing marker color/icon/custom SVG settings.';

INSERT INTO public.app_branding_settings (
  setting_key,
  brand_name,
  primary_color,
  accent_color,
  text_color,
  background_color,
  surface_color,
  marker_styles,
  extra
)
VALUES (
  'default',
  'Tourism UI',
  '#0C7D75',
  '#E4703C',
  '#2B1F18',
  '#F7F0E8',
  '#FFFAF4',
  '{}'::jsonb,
  '{}'::jsonb
)
ON CONFLICT (setting_key) DO NOTHING;

DROP TRIGGER IF EXISTS update_app_branding_settings_updated_at ON public.app_branding_settings;
CREATE TRIGGER update_app_branding_settings_updated_at
  BEFORE UPDATE ON public.app_branding_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- -----------------------------------------------------
-- 3) RLS policies
-- -----------------------------------------------------
ALTER TABLE public.app_branding_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "branding_settings_read_authenticated" ON public.app_branding_settings;
CREATE POLICY "branding_settings_read_authenticated"
  ON public.app_branding_settings
  FOR SELECT
  USING (auth.role() IN ('authenticated', 'service_role', 'admin'));

DROP POLICY IF EXISTS "branding_settings_write_platform_admin" ON public.app_branding_settings;
CREATE POLICY "branding_settings_write_platform_admin"
  ON public.app_branding_settings
  FOR ALL
  USING (api.is_platform_admin())
  WITH CHECK (api.is_platform_admin());

-- -----------------------------------------------------
-- 4) Public-safe RPC for login page / pre-auth shell
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION api.get_public_branding()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, api, auth
AS $$
  SELECT jsonb_build_object(
    'brandName', s.brand_name,
    'logoPublicUrl', s.logo_public_url,
    'primaryColor', s.primary_color,
    'accentColor', s.accent_color,
    'textColor', s.text_color,
    'backgroundColor', s.background_color,
    'surfaceColor', s.surface_color,
    'updatedAt', s.updated_at
  )
  FROM public.app_branding_settings s
  WHERE s.setting_key = 'default';
$$;

COMMENT ON FUNCTION api.get_public_branding() IS
'Returns public-safe brand settings for anonymous contexts such as the login page.';

-- -----------------------------------------------------
-- 5) Authenticated RPC with marker styles and extra payload
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION api.get_app_branding()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, api, auth
AS $$
  SELECT jsonb_build_object(
    'brandName', s.brand_name,
    'logoStoragePath', s.logo_storage_path,
    'logoPublicUrl', s.logo_public_url,
    'logoMimeType', s.logo_mime_type,
    'primaryColor', s.primary_color,
    'accentColor', s.accent_color,
    'textColor', s.text_color,
    'backgroundColor', s.background_color,
    'surfaceColor', s.surface_color,
    'markerStyles', s.marker_styles,
    'extra', s.extra,
    'updatedAt', s.updated_at,
    'updatedBy', s.updated_by
  )
  FROM public.app_branding_settings s
  WHERE s.setting_key = 'default';
$$;

COMMENT ON FUNCTION api.get_app_branding() IS
'Returns the full branding payload used by the authenticated SPA, including marker styles.';

-- -----------------------------------------------------
-- 6) Upsert RPC for admin settings page
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION api.upsert_app_branding(
  p_brand_name TEXT DEFAULT NULL,
  p_logo_storage_path TEXT DEFAULT NULL,
  p_logo_public_url TEXT DEFAULT NULL,
  p_logo_mime_type TEXT DEFAULT NULL,
  p_primary_color TEXT DEFAULT NULL,
  p_accent_color TEXT DEFAULT NULL,
  p_text_color TEXT DEFAULT NULL,
  p_background_color TEXT DEFAULT NULL,
  p_surface_color TEXT DEFAULT NULL,
  p_marker_styles JSONB DEFAULT NULL,
  p_extra JSONB DEFAULT NULL,
  p_clear_logo BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, api, auth
AS $$
DECLARE
  v_brand_name TEXT;
BEGIN
  IF NOT api.is_platform_admin() THEN
    RAISE EXCEPTION 'Only platform admins can update branding settings.'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.app_branding_settings (setting_key, created_by, updated_by)
  VALUES ('default', auth.uid(), auth.uid())
  ON CONFLICT (setting_key) DO NOTHING;

  v_brand_name := NULLIF(btrim(COALESCE(p_brand_name, '')), '');

  UPDATE public.app_branding_settings s
  SET
    brand_name = COALESCE(v_brand_name, s.brand_name),
    logo_storage_path = CASE
      WHEN p_clear_logo THEN NULL
      WHEN p_logo_storage_path IS NOT NULL THEN NULLIF(btrim(p_logo_storage_path), '')
      ELSE s.logo_storage_path
    END,
    logo_public_url = CASE
      WHEN p_clear_logo THEN NULL
      WHEN p_logo_public_url IS NOT NULL THEN NULLIF(btrim(p_logo_public_url), '')
      ELSE s.logo_public_url
    END,
    logo_mime_type = CASE
      WHEN p_clear_logo THEN NULL
      WHEN p_logo_mime_type IS NOT NULL THEN lower(NULLIF(btrim(p_logo_mime_type), ''))
      ELSE s.logo_mime_type
    END,
    primary_color = COALESCE(upper(NULLIF(p_primary_color, '')), s.primary_color),
    accent_color = COALESCE(upper(NULLIF(p_accent_color, '')), s.accent_color),
    text_color = COALESCE(upper(NULLIF(p_text_color, '')), s.text_color),
    background_color = COALESCE(upper(NULLIF(p_background_color, '')), s.background_color),
    surface_color = COALESCE(upper(NULLIF(p_surface_color, '')), s.surface_color),
    marker_styles = COALESCE(p_marker_styles, s.marker_styles),
    extra = COALESCE(p_extra, s.extra),
    updated_by = auth.uid()
  WHERE s.setting_key = 'default';

  RETURN api.get_app_branding();
END;
$$;

COMMENT ON FUNCTION api.upsert_app_branding(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB, BOOLEAN) IS
'Creates or updates the global branding/theme settings used by the UI. Restricted to platform admins.';

-- -----------------------------------------------------
-- 7) Grants for Supabase RPC usage
-- -----------------------------------------------------
GRANT SELECT ON public.app_branding_settings TO authenticated;
GRANT ALL ON public.app_branding_settings TO service_role;

GRANT EXECUTE ON FUNCTION api.is_platform_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION api.get_public_branding() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION api.get_app_branding() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION api.upsert_app_branding(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB, BOOLEAN)
  TO authenticated, service_role;

-- -----------------------------------------------------
-- 8) Optional: Supabase Storage bucket for logo files
-- -----------------------------------------------------
-- Recommended usage:
--   - upload the brand logo to a dedicated public bucket
--   - store the resulting public URL in app_branding_settings.logo_public_url
--   - store the storage path in app_branding_settings.logo_storage_path
--
-- If you want the database to create the bucket too, uncomment and adapt the
-- block below after checking your Supabase Storage policies.
--
-- INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
-- VALUES (
--   'branding-assets',
--   'branding-assets',
--   true,
--   5242880,
--   ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
-- )
-- ON CONFLICT (id) DO UPDATE
-- SET
--   public = EXCLUDED.public,
--   file_size_limit = EXCLUDED.file_size_limit,
--   allowed_mime_types = EXCLUDED.allowed_mime_types;

COMMIT;
