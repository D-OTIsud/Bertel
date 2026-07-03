-- branding_assets_bucket.sql
-- Creates the public `branding-assets` bucket used for the white-label brand logo.
-- Write access is restricted to `service_role` so all uploads go through the
-- Next.js route /api/branding/logo/upload: the caller must be a platform admin
-- (api.is_platform_admin, the same predicate that gates api.upsert_app_branding),
-- the image is resized down + EXIF/GPS stripped (process-image.ts, outputFormat
-- 'preserve' so PNG/WebP transparency survives), then written service-role. This
-- mirrors the media/avatars single-writer + metadata-strip invariant (CLAUDE.md
-- §59): no browser client ever writes to a bucket directly.
-- Read access is anonymous (the login page loads the logo pre-auth via
-- api.get_public_branding -> logo_public_url -> public CDN URL). Path is
-- global/{timestamp}-{safe-name}.{png|jpg|webp}.
-- Idempotent: safe to apply multiple times.

BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'branding-assets',
  'branding-assets',
  true,
  5242880, -- 5 MB output ceiling; process-image.ts re-encodes far smaller (resize-down + strip)
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- RLS read: NONE by design (same rationale as avatars_bucket.sql / media_bucket.sql).
-- The bucket is public=true, so objects are served by the public CDN URL
-- (getPublicUrl) WITHOUT any SELECT policy. A SELECT policy would only enable the
-- .list() enumeration API (advisor public_bucket_allows_listing), which the app
-- never calls. The DROP stays (no CREATE) so re-applying removes any previously
-- created listing policy.
DROP POLICY IF EXISTS "branding_assets_public_read" ON storage.objects;

-- service_role bypasses RLS entirely in Supabase; this policy is intent
-- documentation rather than the enforcement mechanism.
DROP POLICY IF EXISTS "branding_assets_service_role_write" ON storage.objects;
CREATE POLICY "branding_assets_service_role_write"
  ON storage.objects FOR ALL
  TO service_role
  USING (bucket_id = 'branding-assets')
  WITH CHECK (bucket_id = 'branding-assets');

-- Defense in depth: a RESTRICTIVE policy is ANDed with permissive policies, so this
-- guarantees anon/authenticated can never write into the branding-assets bucket
-- regardless of other permissive policies on storage.objects. (Combined with
-- media/avatars/documents no_anon_write, anon/authenticated writes require
-- bucket_id NOT IN ('media','avatars','documents','branding-assets').)
DROP POLICY IF EXISTS "branding_assets_no_anon_write" ON storage.objects;
CREATE POLICY "branding_assets_no_anon_write"
  ON storage.objects AS RESTRICTIVE FOR ALL
  TO anon, authenticated
  USING (bucket_id <> 'branding-assets')
  WITH CHECK (bucket_id <> 'branding-assets');

COMMIT;
