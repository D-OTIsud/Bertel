-- Private document drawer for the reviewed Bertel v2 attachment import.
--
-- The import already records the exact ETAB -> object mapping in
-- ref_document.extra.  Keep that association private instead of adding rows to
-- object_document, whose link metadata is readable on published objects.

BEGIN;

-- Give the two broad families a stable, UI-facing category.  A document is
-- considered classification evidence when the normalized source reading
-- contains at least one classification; everything else remains legal/admin.
WITH imported AS (
  SELECT d.id,
         COALESCE(d.extra, '{}'::jsonb) AS extra,
         COALESCE(
           NULLIF(d.extra #>> '{bertel_pj_import,reviewed_draft_json}', 'null'),
           NULLIF(d.extra #>> '{bertel_pj_import,normalized_model_draft_json}', 'null'),
           ''
         ) AS draft
  FROM public.ref_document AS d
  WHERE d.access_scope = 'legal_private'
    AND d.extra #>> '{bertel_pj_import,version}' = 'bertel_pj_reviewed_20260908_v1'
    AND NULLIF(d.extra #>> '{bertel_pj_import,mapped_object_id}', '') IS NOT NULL
), classified AS (
  SELECT i.*,
         i.draft LIKE '%"classifications":[{%' AS is_classification,
         COALESCE(
           substring(i.draft FROM '"awarded_at":"([0-9]{4}-[0-9]{2}-[0-9]{2})"'),
           substring(i.draft FROM '"valid_from":"([0-9]{4}-[0-9]{2}-[0-9]{2})"')
         ) AS display_valid_from,
         COALESCE(
           substring(i.draft FROM '"valid_until":"([0-9]{4}-[0-9]{2}-[0-9]{2})"'),
           substring(i.draft FROM '"valid_to":"([0-9]{4}-[0-9]{2}-[0-9]{2})"')
         ) AS display_valid_to,
         COALESCE(
           substring(i.draft FROM '"stated_status":"([^"\\]+)"'),
           substring(i.draft FROM '"status":"([^"\\]+)"')
         ) AS display_status
  FROM imported AS i
)
UPDATE public.ref_document AS d
SET extra = jsonb_strip_nulls(
  jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(c.extra,
            '{bertel_pj_import,document_category}',
            to_jsonb(CASE WHEN c.is_classification THEN 'classification' ELSE 'legal' END::text), true),
          '{bertel_pj_import,document_type_code}',
          to_jsonb(CASE WHEN c.is_classification THEN 'label_justificatif' ELSE 'juridique' END::text), true),
        '{bertel_pj_import,display_valid_from}', COALESCE(to_jsonb(c.display_valid_from), 'null'::jsonb), true),
      '{bertel_pj_import,display_valid_to}', COALESCE(to_jsonb(c.display_valid_to), 'null'::jsonb), true),
    '{bertel_pj_import,display_status}', COALESCE(to_jsonb(c.display_status), 'null'::jsonb), true)
)
FROM classified AS c
WHERE c.id = d.id;

-- The imported classification readings have no exact catalog scheme/value
-- codes.  Keep them grouped as private classification evidence in the modal;
-- do not guess an object_classification.document_id association.

-- The partial index keeps the modal lookup cheap without affecting unrelated
-- document families.
CREATE INDEX IF NOT EXISTS idx_ref_document_bertel_pj_mapped_object
  ON public.ref_document ((extra #>> '{bertel_pj_import,mapped_object_id}'))
  WHERE access_scope = 'legal_private'
    AND extra #>> '{bertel_pj_import,version}' = 'bertel_pj_reviewed_20260908_v1';

CREATE OR REPLACE FUNCTION api.get_active_object_documents(p_object_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, api, auth
AS $function$
DECLARE
  v_authorized boolean := false;
  v_documents jsonb := '[]'::jsonb;
BEGIN
  IF p_object_id IS NULL OR btrim(p_object_id) = '' OR (SELECT auth.uid()) IS NULL THEN
    RETURN jsonb_build_object('authorized', false, 'documents', '[]'::jsonb);
  END IF;

  v_authorized := COALESCE(api.user_can_write_object_canonical(p_object_id), false);
  IF NOT v_authorized THEN
    RETURN jsonb_build_object('authorized', false, 'documents', '[]'::jsonb);
  END IF;

  WITH candidates AS (
    SELECT d.id AS document_id,
           COALESCE(NULLIF(d.title, ''), d.extra #>> '{bertel_pj_import,source_id}', 'Document') AS title,
           d.url,
           COALESCE(d.extra #>> '{bertel_pj_import,document_category}', 'legal') AS category,
           COALESCE(d.extra #>> '{bertel_pj_import,document_type_code}', 'juridique') AS type_code,
           d.issuer,
           COALESCE(
             CASE WHEN COALESCE(d.extra #>> '{bertel_pj_import,display_valid_from}', '') ~ '^\d{4}-\d{2}-\d{2}$'
                  THEN (d.extra #>> '{bertel_pj_import,display_valid_from}')::date END,
             d.valid_from
           ) AS valid_from,
           COALESCE(
             CASE WHEN COALESCE(d.extra #>> '{bertel_pj_import,display_valid_to}', '') ~ '^\d{4}-\d{2}-\d{2}$'
                  THEN (d.extra #>> '{bertel_pj_import,display_valid_to}')::date END,
             d.valid_to
           ) AS valid_to,
           d.created_at,
           2 AS source_priority
    FROM public.ref_document AS d
    WHERE d.access_scope = 'legal_private'
      AND d.extra #>> '{bertel_pj_import,version}' = 'bertel_pj_reviewed_20260908_v1'
      AND d.extra #>> '{bertel_pj_import,mapped_object_id}' = p_object_id
      AND (COALESCE(d.extra #>> '{bertel_pj_import,display_valid_from}', '') !~ '^\d{4}-\d{2}-\d{2}$'
           OR (d.extra #>> '{bertel_pj_import,display_valid_from}')::date <= CURRENT_DATE)
      AND (COALESCE(d.extra #>> '{bertel_pj_import,display_valid_to}', '') !~ '^\d{4}-\d{2}-\d{2}$'
           OR (d.extra #>> '{bertel_pj_import,display_valid_to}')::date >= CURRENT_DATE)
      AND lower(COALESCE(d.extra #>> '{bertel_pj_import,display_status}', 'active'))
            NOT IN ('expired', 'suspended', 'revoked', 'requested')
      AND (NOT EXISTS (SELECT 1 FROM public.object_legal AS x WHERE x.document_id = d.id)
           OR EXISTS (
             SELECT 1 FROM public.object_legal AS x
             WHERE x.document_id = d.id
               AND COALESCE(x.status, 'active') = 'active'
               AND x.valid_from <= CURRENT_DATE
               AND (x.valid_to IS NULL OR x.valid_to >= CURRENT_DATE)
           ))

    UNION ALL

    SELECT d.id, COALESCE(NULLIF(d.title, ''), lt.name, 'Document juridique'), d.url,
           'legal', lt.code, d.issuer, ol.valid_from, ol.valid_to, d.created_at, 0
    FROM public.object_legal AS ol
    JOIN public.ref_document AS d ON d.id = ol.document_id
    JOIN public.ref_legal_type AS lt ON lt.id = ol.type_id
    WHERE ol.object_id = p_object_id
      AND COALESCE(ol.status, 'active') = 'active'
      AND ol.valid_from <= CURRENT_DATE
      AND (ol.valid_to IS NULL OR ol.valid_to >= CURRENT_DATE)

    UNION ALL

    SELECT d.id, COALESCE(NULLIF(d.title, ''), cs.name, 'Justificatif de classement'), d.url,
           'classification', cs.code, d.issuer, oc.awarded_at, oc.valid_until, d.created_at, 0
    FROM public.object_classification AS oc
    JOIN public.ref_document AS d ON d.id = oc.document_id
    JOIN public.ref_classification_scheme AS cs ON cs.id = oc.scheme_id
    WHERE oc.object_id = p_object_id
      AND COALESCE(oc.status, 'granted') = 'granted'
      AND (oc.awarded_at IS NULL OR oc.awarded_at <= CURRENT_DATE)
      AND (oc.valid_until IS NULL OR oc.valid_until >= CURRENT_DATE)
  ), deduplicated AS (
    SELECT DISTINCT ON (c.document_id) c.*
    FROM candidates AS c
    ORDER BY c.document_id, c.source_priority, c.valid_to DESC NULLS FIRST
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'document_id', d.document_id, 'title', d.title, 'url', d.url,
        'category', d.category, 'type_code', d.type_code, 'issuer', d.issuer,
        'valid_from', d.valid_from, 'valid_to', d.valid_to, 'created_at', d.created_at
      )
      ORDER BY CASE WHEN d.category = 'classification' THEN 1 ELSE 0 END,
               d.valid_to DESC NULLS FIRST, d.created_at DESC, d.document_id
    ),
    '[]'::jsonb
  )
  INTO v_documents
  FROM deduplicated AS d;

  RETURN jsonb_build_object('authorized', true, 'documents', v_documents);
END;
$function$;

COMMENT ON FUNCTION api.get_active_object_documents(text) IS
  'Returns active private Bertel attachment documents for one object. Authorization is object-scoped through user_can_write_object_canonical; unauthorized callers receive {authorized:false,documents:[]}.';

REVOKE ALL ON FUNCTION api.get_active_object_documents(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.get_active_object_documents(text) TO authenticated, service_role;

COMMIT;
