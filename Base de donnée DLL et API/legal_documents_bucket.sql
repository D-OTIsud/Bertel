-- legal_documents_bucket.sql
-- Private storage for legal/administrative supporting documents.
-- All application access goes through server routes that authorize the caller
-- against api.user_can_manage_object_legal before using service_role Storage.

BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'legal-documents',
  'legal-documents',
  false,
  10485760,
  ARRAY['application/pdf', 'image/jpeg']
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "legal_documents_service_role_all" ON storage.objects;
CREATE POLICY "legal_documents_service_role_all"
  ON storage.objects
  FOR ALL
  TO service_role
  USING (bucket_id = 'legal-documents')
  WITH CHECK (bucket_id = 'legal-documents');

-- Defense in depth: no direct browser access. Signed URLs are minted only by
-- the authenticated Next.js route after the object-level legal permission check.
DROP POLICY IF EXISTS "legal_documents_no_direct_access" ON storage.objects;
CREATE POLICY "legal_documents_no_direct_access"
  ON storage.objects
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (bucket_id <> 'legal-documents')
  WITH CHECK (bucket_id <> 'legal-documents');

COMMIT;
