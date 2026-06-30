-- media_bucket.sql
-- Creates the public `media` bucket used for editor uploads (photos + videos).
-- Write access is restricted to `service_role` so all uploads go through
-- the Next.js route /api/media/upload: images are resized ≤ 2000 px + EXIF
-- stripped (process-image.ts); videos are validation-only and stored as-is
-- (process-video.ts — no server-side transcoder in the runtime).
-- `allowed_mime_types` and `file_size_limit` below MUST stay in sync with those
-- two pipelines (CLAUDE.md §59). Read access is anonymous (public API).
-- Idempotent: safe to apply multiple times.

BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'media',
  'media',
  true,
  104857600, -- 100 MB — must cover the largest accepted object: videos are stored as-is
             -- (process-video.ts MAX_VIDEO_INPUT_BYTES = 100*1024*1024). Images are
             -- validated ≤ 20 MB then re-encoded far smaller (process-image.ts), so this
             -- ceiling does not weaken image handling.
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime']
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
