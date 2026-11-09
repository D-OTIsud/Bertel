-- Additive partner selection reader. Definitions are supplied by the trusted
-- server registry, never by a public query parameter. Existing readers keep
-- their signatures and serialization contract.
BEGIN;

CREATE OR REPLACE FUNCTION api.list_partner_selection_objects_with_vocabulary(
  p_buckets jsonb,
  p_selection_id text,
  p_definition_hash text,
  p_partner_key_id text,
  p_cursor text DEFAULT NULL,
  p_lang_prefs text[] DEFAULT ARRAY['fr'],
  p_page_size integer DEFAULT 50,
  p_track_format text DEFAULT 'none',
  p_view text DEFAULT 'card',
  p_format text DEFAULT '',
  p_variant text DEFAULT 'legacy-v1',
  p_commune_insee text[] DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = pg_catalog, public, api, internal, extensions, pg_temp
AS $fn$
DECLARE
  buckets jsonb := CASE WHEN jsonb_typeof(p_buckets) = 'array' THEN p_buckets
    WHEN jsonb_typeof(p_buckets) = 'object' THEN p_buckets->'buckets' END;
  bucket jsonb;
  all_ids text[];
  ids text[];
  items jsonb;
  batch jsonb;
  cur jsonb;
  last_id text;
  next_cur text;
  binding text;
  total bigint;
  page_count integer;
  view_mode text := CASE WHEN p_view = 'full' THEN 'full' ELSE 'card' END;
  limit_n integer := LEAST(GREATEST(COALESCE(p_page_size, 50), 1),
    CASE WHEN p_view = 'full' THEN 100 ELSE 200 END);
BEGIN
  IF COALESCE(btrim(p_selection_id), '') = ''
    OR COALESCE(btrim(p_definition_hash), '') = ''
    OR COALESCE(btrim(p_partner_key_id), '') = ''
    OR jsonb_typeof(buckets) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'invalid_selection_definition' USING ERRCODE = 'PT400';
  END IF;

  -- A malformed trusted definition must fail closed instead of widening a
  -- missing type/filter to the whole published corpus.
  FOR bucket IN SELECT value FROM jsonb_array_elements(buckets) LOOP
    IF jsonb_typeof(bucket) IS DISTINCT FROM 'object'
      OR jsonb_typeof(bucket->'types') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'invalid_selection_bucket' USING ERRCODE = 'PT400';
    END IF;
    IF jsonb_array_length(bucket->'types') = 0
      OR (bucket ? 'filters' AND jsonb_typeof(bucket->'filters') IS DISTINCT FROM 'object')
      OR (bucket ? 'search' AND jsonb_typeof(bucket->'search') NOT IN ('string', 'null'))
      OR (bucket ? 'only_without_practices'
          AND jsonb_typeof(bucket->'only_without_practices') IS DISTINCT FROM 'boolean')
      OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(bucket->'types') t(code)
        WHERE jsonb_typeof(t.code) IS DISTINCT FROM 'string'
          OR NOT (t.code #>> '{}') = ANY(enum_range(NULL::public.object_type)::text[])
      ) THEN
      RAISE EXCEPTION 'invalid_selection_bucket' USING ERRCODE = 'PT400';
    END IF;
  END LOOP;

  binding := md5(jsonb_build_object(
    'selection_id', p_selection_id, 'definition_hash', p_definition_hash,
    'partner_key_id', p_partner_key_id, 'buckets', buckets,
    'lang', p_lang_prefs, 'size', limit_n, 'view', view_mode,
    'track', p_track_format, 'format', p_format, 'variant', p_variant,
    'commune_insee', p_commune_insee
  )::text);
  IF p_cursor IS NOT NULL THEN
    BEGIN
      cur := api.cursor_unpack(p_cursor);
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'invalid_partner_cursor' USING ERRCODE = 'PT400';
    END;
    IF jsonb_typeof(cur) IS DISTINCT FROM 'object'
      OR cur->>'kind' IS DISTINCT FROM 'partner_selection'
      OR cur->>'binding' IS DISTINCT FROM binding
      OR jsonb_typeof(cur->'last_id') IS DISTINCT FROM 'string'
      OR COALESCE(cur->>'last_id', '') = '' THEN
      RAISE EXCEPTION 'invalid_partner_cursor' USING ERRCODE = 'PT400';
    END IF;
    last_id := cur->>'last_id';
  END IF;

  -- Resolve every branch before slicing a page. Do not call the UI list
  -- resolver: its 200/2001 ceilings would truncate a partner selection.
  WITH matches AS (
    SELECT matched.object_id
    FROM jsonb_array_elements(buckets) b(definition)
    CROSS JOIN LATERAL api.get_filtered_object_ids(
      COALESCE(b.definition->'filters', '{}'::jsonb),
      ARRAY(SELECT jsonb_array_elements_text(b.definition->'types'))::public.object_type[],
      ARRAY['published']::public.object_status[],
      NULLIF(b.definition->>'search', '')
    ) matched
    WHERE NOT COALESCE((b.definition->>'only_without_practices')::boolean, false)
      OR NOT EXISTS (
        SELECT 1 FROM public.object_iti_practice practice
        WHERE practice.object_id = matched.object_id
      )
  )
  SELECT ARRAY(
    SELECT DISTINCT o.id
    FROM matches m JOIN public.object o ON o.id = m.object_id
    WHERE o.status = 'published' AND NOT o.is_test
      AND (p_commune_insee IS NULL OR EXISTS (
        SELECT 1 FROM public.object_location location
        WHERE location.object_id = o.id AND location.is_main_location IS TRUE
          AND location.code_insee = ANY(p_commune_insee)
      ))
    ORDER BY o.id
  ) INTO all_ids;
  total := cardinality(all_ids);
  SELECT ARRAY(
    SELECT id FROM unnest(all_ids) id
    WHERE last_id IS NULL OR id > last_id ORDER BY id LIMIT limit_n
  ) INTO ids;
  page_count := cardinality(ids);
  IF page_count = limit_n
    AND EXISTS (SELECT 1 FROM unnest(all_ids) id WHERE id > ids[page_count]) THEN
    next_cur := api.cursor_pack(jsonb_build_object(
      'kind', 'partner_selection', 'binding', binding, 'last_id', ids[page_count]
    ));
  END IF;

  IF view_mode = 'full' THEN
    items := api.get_object_resources_batch(ids, p_lang_prefs, p_track_format, '{}'::jsonb)::jsonb;
  ELSE
    items := api.get_object_cards_batch(ids, p_lang_prefs)::jsonb;
  END IF;
  IF jsonb_typeof(items) IS DISTINCT FROM 'array' THEN items := '[]'::jsonb; END IF;
  IF p_format IN ('jsonld', 'datatourisme', 'apidae', 'tourinsoft') AND page_count > 0 THEN
    BEGIN
      IF p_format = 'tourinsoft' AND p_variant <> 'legacy-v1' THEN
        batch := api.get_objects_tourinsoft_batch(ids, p_variant)::jsonb;
      ELSE
        batch := api.get_objects_interop_batch(ids, p_format)::jsonb;
      END IF;
    EXCEPTION WHEN OTHERS THEN batch := NULL;
    END;
  END IF;
  SELECT COALESCE(jsonb_agg(
    (CASE WHEN view_mode = 'full' THEN item - 'canonical_description' - 'org_description' ELSE item END)
      || CASE WHEN batch->(item->>'id') IS NOT NULL
        THEN jsonb_build_object(p_format, batch->(item->>'id')) ELSE '{}'::jsonb END
    ORDER BY ord
  ), '[]'::jsonb) INTO items
  FROM jsonb_array_elements(items) WITH ORDINALITY payload(item, ord);

  RETURN jsonb_build_object('meta', jsonb_build_object(
    'selection_id', p_selection_id, 'total', total, 'page_size', limit_n,
    'next_cursor', next_cur, 'vocabulary_release', api.thesaurus_object_release()
  ), 'data', items);
END
$fn$;

REVOKE ALL ON FUNCTION api.list_partner_selection_objects_with_vocabulary(
  jsonb,text,text,text,text,text[],integer,text,text,text,text,text[]
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION api.list_partner_selection_objects_with_vocabulary(
  jsonb,text,text,text,text,text[],integer,text,text,text,text,text[]
) TO service_role;
COMMENT ON FUNCTION api.list_partner_selection_objects_with_vocabulary(
  jsonb,text,text,text,text,text[],integer,text,text,text,text,text[]
) IS 'Server-registry selection: union before keyset pagination, real published objects only, public serializers and vocabulary from one statement snapshot. Cursor bound to definition, partner and representation. Service-role only.';
NOTIFY pgrst, 'reload schema';
COMMIT;
