-- documents_bucket.sql
-- §71 C — Creates the public `documents` bucket for §08 classification/label
-- justificatifs (attestations PDF + scanned certificates as images).
-- Write access is restricted to `service_role` so all uploads go through the
-- Next.js route /api/document/upload (which validates MIME/size, EXIF-strips
-- image scans via the shared image pipeline, and creates the ref_document row).
-- Read access is anonymous (a justificatif can be linked from a published label).
-- Idempotent: safe to apply multiple times. Mirrors media_bucket.sql.

BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documents',
  'documents',
  true,
  10485760, -- 10 MB cap (PDFs + a single processed JPG page)
  ARRAY['application/pdf', 'image/jpeg'] -- PDFs as-is; images are re-encoded to jpg by process-image
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- RLS: anyone reads, only service_role writes.
DROP POLICY IF EXISTS "documents_public_read" ON storage.objects;
CREATE POLICY "documents_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'documents');

-- Intent documentation (service_role bypasses RLS in Supabase).
DROP POLICY IF EXISTS "documents_service_role_write" ON storage.objects;
CREATE POLICY "documents_service_role_write"
  ON storage.objects FOR ALL
  TO service_role
  USING (bucket_id = 'documents')
  WITH CHECK (bucket_id = 'documents');

-- Defense in depth: RESTRICTIVE policies are ANDed, so anon/authenticated can
-- never write into the documents bucket regardless of other permissive policies.
-- (Composes with media_no_anon_write — both buckets stay closed to direct writes.)
DROP POLICY IF EXISTS "documents_no_anon_write" ON storage.objects;
CREATE POLICY "documents_no_anon_write"
  ON storage.objects AS RESTRICTIVE FOR ALL
  TO anon, authenticated
  USING (bucket_id <> 'documents')
  WITH CHECK (bucket_id <> 'documents');

COMMIT;
