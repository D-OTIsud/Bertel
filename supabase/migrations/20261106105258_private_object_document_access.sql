-- DB07: authorize the exact object/document pair; private locations are never public links.
-- Storage object bytes/metadata are not moved by SQL. See the separately reviewed cutover.
BEGIN;

CREATE OR REPLACE FUNCTION internal.object_document_matches_object(p_document_id uuid, p_object_id text)
RETURNS boolean LANGUAGE sql STABLE
SET search_path = pg_catalog, public, internal, pg_temp
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.ref_document d
    WHERE d.id = p_document_id AND d.access_scope = 'legal_private'
      AND (
        NULLIF(d.extra #>> '{bertel_pj_import,mapped_object_id}', '') = p_object_id
        OR (
          NULLIF(d.extra #>> '{bertel_pj_import,mapped_object_id}', '') IS NULL
          AND d.storage_bucket = 'legal-documents'
          AND (starts_with(d.storage_path, p_object_id || '/') OR starts_with(d.storage_path, 'objects/' || p_object_id || '/'))
          AND (EXISTS (SELECT 1 FROM public.object_legal l WHERE l.object_id = p_object_id AND l.document_id = d.id)
            OR EXISTS (SELECT 1 FROM public.object_classification c WHERE c.object_id = p_object_id AND c.document_id = d.id))
        )
      )
  );
$function$;
REVOKE ALL ON FUNCTION internal.object_document_matches_object(uuid, text) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION api.get_active_object_documents(p_object_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, api, internal, auth, pg_temp
AS $function$
DECLARE
  v_base jsonb;
  v_documents jsonb;
BEGIN
  v_base := internal.get_active_object_documents_unfiltered_20260908(p_object_id);
  IF NOT COALESCE((v_base ->> 'authorized')::boolean, false) THEN
    RETURN jsonb_build_object('authorized', false, 'documents', '[]'::jsonb);
  END IF;

  SELECT COALESCE(jsonb_agg(CASE WHEN d.access_scope = 'public' THEN j.item || jsonb_build_object('requires_signing', false) ELSE (j.item - 'url') || jsonb_build_object('requires_signing', true) END ORDER BY j.ordinality), '[]'::jsonb)
  INTO v_documents
  FROM jsonb_array_elements(COALESCE(v_base -> 'documents', '[]'::jsonb))
       WITH ORDINALITY AS j(item, ordinality)
  JOIN public.ref_document AS d ON d.id = (j.item ->> 'document_id')::uuid
  WHERE (d.access_scope = 'public' OR internal.object_document_matches_object(d.id, p_object_id))
    AND (d.valid_from IS NULL OR d.valid_from <= CURRENT_DATE)
    AND (d.valid_to IS NULL OR d.valid_to >= CURRENT_DATE)
    AND (COALESCE(d.extra #>> '{bertel_pj_import,display_valid_from}', '') !~ '^\d{4}-\d{2}-\d{2}$'
         OR (d.extra #>> '{bertel_pj_import,display_valid_from}')::date <= CURRENT_DATE)
    AND (COALESCE(d.extra #>> '{bertel_pj_import,display_valid_to}', '') !~ '^\d{4}-\d{2}-\d{2}$'
         OR (d.extra #>> '{bertel_pj_import,display_valid_to}')::date >= CURRENT_DATE)
    AND lower(COALESCE(d.extra #>> '{bertel_pj_import,display_status}', 'active'))
          NOT IN ('expired', 'suspended', 'revoked', 'requested')
    AND (NOT EXISTS (SELECT 1 FROM public.object_legal x WHERE x.document_id = d.id)
         OR EXISTS (SELECT 1 FROM public.object_legal x WHERE x.document_id = d.id
                    AND COALESCE(x.status, 'active') = 'active'
                    AND x.valid_from <= CURRENT_DATE
                    AND (x.valid_to IS NULL OR x.valid_to >= CURRENT_DATE)))
    AND (NOT EXISTS (SELECT 1 FROM public.object_classification x WHERE x.document_id = d.id)
         OR EXISTS (SELECT 1 FROM public.object_classification x WHERE x.document_id = d.id
                    AND COALESCE(x.status, 'granted') = 'granted'
                    AND (x.awarded_at IS NULL OR x.awarded_at <= CURRENT_DATE)
                    AND (x.valid_until IS NULL OR x.valid_until >= CURRENT_DATE)));

  RETURN jsonb_build_object('authorized', true, 'documents', v_documents);
END;
$function$;

REVOKE ALL ON FUNCTION api.get_active_object_documents(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.get_active_object_documents(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION api.get_object_document_file(p_object_id text, p_document_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, api, auth, pg_temp
AS $function$
DECLARE
  v_file jsonb;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR p_document_id IS NULL THEN
    RETURN jsonb_build_object('authorized', false, 'file', NULL);
  END IF;
  -- Keep the card's existing canonical gate. Expiry controls the active list,
  -- not an authorized editor's consultation of an archived attachment.
  -- DB02 can tighten its shared helper without a second permission model here.
  IF NOT COALESCE(api.user_can_write_object_canonical(p_object_id), false) THEN
    RETURN jsonb_build_object('authorized', false, 'file', NULL);
  END IF;

  SELECT jsonb_build_object('bucket', d.storage_bucket, 'path', d.storage_path)
  INTO v_file
  FROM public.ref_document d
  WHERE d.id = p_document_id
    AND d.access_scope = 'legal_private'
    -- The reviewed import mapping is authoritative. Adding someone else's UUID
    -- to a legal/classification row must never grant access to their attachment.
    AND internal.object_document_matches_object(d.id, p_object_id)
    AND d.storage_bucket IN ('old_legal_media', 'legal-documents')
    AND NULLIF(d.storage_path, '') IS NOT NULL;
  RETURN jsonb_build_object('authorized', true, 'file', v_file);
END;
$function$;
REVOKE ALL ON FUNCTION api.get_object_document_file(text, uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION api.get_object_document_file(text, uuid) TO authenticated;

-- The destination is private and intentionally server-mediated. A permissive
-- legacy policy must not let clients mint their own durable signed URLs there.
-- This changes policies only, never storage.objects or storage.buckets rows.
DROP POLICY IF EXISTS legal_documents_server_only ON storage.objects;
CREATE POLICY legal_documents_server_only ON storage.objects
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (bucket_id <> 'legal-documents')
  WITH CHECK (bucket_id <> 'legal-documents');

NOTIFY pgrst, 'reload schema';
COMMIT;
