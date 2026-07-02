-- avatars_bucket.sql
-- Creates the public `avatars` bucket used for user profile pictures.
-- Write access is restricted to `service_role` so all uploads go through the
-- Next.js route /api/avatar/upload: images are resized ≤ 512 px + EXIF/GPS
-- stripped (process-image.ts, reused with a smaller maxDimension). This mirrors
-- the media single-writer + metadata-strip invariant (CLAUDE.md §59) — a user's
-- selfie can carry GPS/device EXIF, so avatars go through the same pipeline.
-- Read access is anonymous (public API); paths are {user_id}/avatar.jpg and the
-- app cache-busts via a ?v= query param stored in app_user_profile.avatar_url.
-- Idempotent: safe to apply multiple times.

BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  5242880, -- 5 MB input ceiling; process-image.ts re-encodes far smaller (≤512px JPEG q85)
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- RLS read: NONE by design (same rationale as media_bucket.sql). The bucket is
-- public=true, so objects are served by the public CDN URL (getPublicUrl) WITHOUT
-- any SELECT policy. A SELECT policy would only enable the .list() enumeration API
-- (advisor public_bucket_allows_listing), which the app never calls. The DROP stays
-- (no CREATE) so re-applying removes any previously-created listing policy.
DROP POLICY IF EXISTS "avatars_public_read" ON storage.objects;

-- service_role bypasses RLS entirely in Supabase; this policy is intent
-- documentation rather than the enforcement mechanism.
DROP POLICY IF EXISTS "avatars_service_role_write" ON storage.objects;
CREATE POLICY "avatars_service_role_write"
  ON storage.objects FOR ALL
  TO service_role
  USING (bucket_id = 'avatars')
  WITH CHECK (bucket_id = 'avatars');

-- Defense in depth: a RESTRICTIVE policy is ANDed with permissive policies, so this
-- guarantees anon/authenticated can never write into the avatars bucket regardless of
-- other permissive policies on storage.objects. (Combined with media_no_anon_write,
-- anon/authenticated writes require bucket_id NOT IN ('media','avatars').)
DROP POLICY IF EXISTS "avatars_no_anon_write" ON storage.objects;
CREATE POLICY "avatars_no_anon_write"
  ON storage.objects AS RESTRICTIVE FOR ALL
  TO anon, authenticated
  USING (bucket_id <> 'avatars')
  WITH CHECK (bucket_id <> 'avatars');

COMMIT;
