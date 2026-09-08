-- Active document date/status filtering.
-- The private evidence assignment payload was applied separately and is not versioned.
BEGIN;

-- Keep the original producer private, then filter its envelope globally. This
-- covers imported documents and present/future canonical legal/classification
-- evidence without exposing menu or brochure document roles.
ALTER FUNCTION api.get_active_object_documents(text)
  SET SCHEMA internal;
ALTER FUNCTION internal.get_active_object_documents(text)
  RENAME TO get_active_object_documents_unfiltered_20260908;
REVOKE ALL ON FUNCTION internal.get_active_object_documents_unfiltered_20260908(text)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION api.get_active_object_documents(p_object_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, api, internal, auth
AS $function$
DECLARE
  v_base jsonb;
  v_documents jsonb;
BEGIN
  v_base := internal.get_active_object_documents_unfiltered_20260908(p_object_id);
  IF NOT COALESCE((v_base ->> 'authorized')::boolean, false) THEN
    RETURN jsonb_build_object('authorized', false, 'documents', '[]'::jsonb);
  END IF;

  SELECT COALESCE(jsonb_agg(j.item ORDER BY j.ordinality), '[]'::jsonb)
  INTO v_documents
  FROM jsonb_array_elements(COALESCE(v_base -> 'documents', '[]'::jsonb))
       WITH ORDINALITY AS j(item, ordinality)
  JOIN public.ref_document AS d ON d.id = (j.item ->> 'document_id')::uuid
  WHERE (d.valid_from IS NULL OR d.valid_from <= CURRENT_DATE)
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

COMMIT;
