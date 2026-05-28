-- media_bucket.sql
-- Creates the public `media` bucket used for editor uploads.
-- Write access is restricted to `service_role` so all uploads go through
-- the Next.js route /api/media/upload (which enforces resize ≤ 2000 px
-- and EXIF stripping). Read access is anonymous (public API).
-- Idempotent: safe to apply multiple times.

BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'media',
  'media',
  true,
  10485760, -- 10 MB cap on already-processed objects (safety net; post-resize objects are far smaller)
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- RLS: anyone reads, only service_role writes.
DROP POLICY IF EXISTS "media_public_read" ON storage.objects;
CREATE POLICY "media_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'media');

-- Note: in Supabase, service_role bypasses RLS entirely. This policy is
-- intent documentation rather than the actual enforcement mechanism.
DROP POLICY IF EXISTS "media_service_role_write" ON storage.objects;
CREATE POLICY "media_service_role_write"
  ON storage.objects FOR ALL
  TO service_role
  USING (bucket_id = 'media')
  WITH CHECK (bucket_id = 'media');

-- Defense in depth: a RESTRICTIVE policy is ANDed with permissive policies,
-- so this guarantees anon/authenticated can never write into the media bucket
-- regardless of what other permissive policies exist on storage.objects.
DROP POLICY IF EXISTS "media_no_anon_write" ON storage.objects;
CREATE POLICY "media_no_anon_write"
  ON storage.objects AS RESTRICTIVE FOR ALL
  TO anon, authenticated
  USING (bucket_id <> 'media')
  WITH CHECK (bucket_id <> 'media');

COMMIT;
