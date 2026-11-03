-- R5 cutover ONLY after the compatible office/portal routes are deployed and R6 is applied.
-- Keeps unrelated documents, videos and place media on their existing permission paths.
BEGIN;
SET LOCAL lock_timeout='500ms';
SET LOCAL statement_timeout='10s';
DO $gate$
BEGIN
 IF to_regprocedure('api.save_object_gallery(text,jsonb)') IS NULL
  OR to_regprocedure('api.reserve_portal_photo_upload(text,uuid,uuid)') IS NULL
  OR to_regprocedure('api.complete_portal_photo_upload(uuid,uuid,text,text,integer,integer)') IS NULL THEN
  RAISE EXCEPTION 'Install the R5 contract before its gallery cutover';
 END IF;
 -- R6 removes the submission/proposal row-lock inversion before photo quota activation.
 IF (SELECT md5(replace(prosrc,E'\r\n',E'\n')) FROM pg_proc
      WHERE oid='api.approve_pending_change(uuid,text,boolean)'::regprocedure) IS DISTINCT FROM 'ed555f983ff336577c0b87be090a7bfa'
   OR (SELECT md5(replace(prosrc,E'\r\n',E'\n')) FROM pg_proc
      WHERE oid='api.reject_pending_change(uuid,text)'::regprocedure) IS DISTINCT FROM '4a7f66b8c90990e479b7d0dbde720e71' THEN
  RAISE EXCEPTION 'R6 submission-first approve/reject paths are required before R5 cutover';
 END IF;
END;
$gate$;

DROP POLICY IF EXISTS gallery_photo_no_direct_insert ON public.media;
CREATE POLICY gallery_photo_no_direct_insert ON public.media AS RESTRICTIVE FOR INSERT TO anon,authenticated
 WITH CHECK(NOT (object_id IS NOT NULL AND place_id IS NULL AND media_type_id IN (
   SELECT id FROM public.ref_code_media_type WHERE code='photo')));
DROP POLICY IF EXISTS gallery_photo_no_direct_update ON public.media;
CREATE POLICY gallery_photo_no_direct_update ON public.media AS RESTRICTIVE FOR UPDATE TO anon,authenticated
 USING(NOT (object_id IS NOT NULL AND place_id IS NULL AND media_type_id IN (
   SELECT id FROM public.ref_code_media_type WHERE code='photo')))
 WITH CHECK(NOT (object_id IS NOT NULL AND place_id IS NULL AND media_type_id IN (
   SELECT id FROM public.ref_code_media_type WHERE code='photo')));
DROP POLICY IF EXISTS gallery_photo_no_direct_delete ON public.media;
CREATE POLICY gallery_photo_no_direct_delete ON public.media AS RESTRICTIVE FOR DELETE TO anon,authenticated
 USING(NOT (object_id IS NOT NULL AND place_id IS NULL AND media_type_id IN (
   SELECT id FROM public.ref_code_media_type WHERE code='photo')));

-- Slot/proof metadata cannot be forged through an ordinary document-admin request.
DROP POLICY IF EXISTS portal_photo_receipt_no_direct_insert ON public.ref_document;
CREATE POLICY portal_photo_receipt_no_direct_insert ON public.ref_document AS RESTRICTIVE FOR INSERT TO anon,authenticated
 WITH CHECK(COALESCE(extra->>'source','')<>'portal_photo');
DROP POLICY IF EXISTS portal_photo_receipt_no_direct_update ON public.ref_document;
CREATE POLICY portal_photo_receipt_no_direct_update ON public.ref_document AS RESTRICTIVE FOR UPDATE TO anon,authenticated
 USING(COALESCE(extra->>'source','')<>'portal_photo') WITH CHECK(COALESCE(extra->>'source','')<>'portal_photo');
DROP POLICY IF EXISTS portal_photo_receipt_no_direct_delete ON public.ref_document;
CREATE POLICY portal_photo_receipt_no_direct_delete ON public.ref_document AS RESTRICTIVE FOR DELETE TO anon,authenticated
 USING(COALESCE(extra->>'source','')<>'portal_photo');

GRANT EXECUTE ON FUNCTION api.reserve_portal_photo_upload(text,uuid,uuid),api.cancel_portal_photo_upload(text,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
