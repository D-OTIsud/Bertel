-- Opt-in partner membership projection. Historical readers and the shared
-- filter engine are deliberately unchanged; no work is added without opt-in.
BEGIN;

CREATE FUNCTION internal.partner_selection_memberships(p_object_ids text[])
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = pg_catalog, public, api, internal, extensions, pg_temp
AS $fn$
DECLARE
  selection internal.partner_selection;
  bucket jsonb;
  page_ids text[];
  page_types public.object_type[];
  matched_ids text[];
  branch_ids text[];
  object_id text;
  memberships jsonb := '{}'::jsonb;
BEGIN
  -- Reuse the registry's existing service-role privileges; do not widen table
  -- grants or enter a new definer context. Check the actual database role.
  IF current_user <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF cardinality(COALESCE(p_object_ids, ARRAY[]::text[])) > 200
    OR EXISTS (SELECT 1 FROM unnest(p_object_ids) id WHERE id IS NULL OR btrim(id) = '') THEN
    RAISE EXCEPTION 'invalid_membership_page' USING ERRCODE = 'PT503';
  END IF;
  SELECT COALESCE(array_agg(o.id ORDER BY o.id), ARRAY[]::text[]),
         COALESCE(array_agg(DISTINCT o.object_type), ARRAY[]::public.object_type[])
    INTO page_ids, page_types
  FROM public.object o
  WHERE o.id = ANY(COALESCE(p_object_ids, ARRAY[]::text[]))
    AND o.status = 'published' AND NOT o.is_test;
  IF cardinality(page_ids) = 0 THEN RETURN memberships; END IF;

  -- A selection is public by active state, as in get_active_partner_selection_definition.
  -- Partner keys currently have no organization restriction. Never expose the
  -- private definition, editor state, name, organization or authors here.
  FOR selection IN SELECT * FROM internal.partner_selection s
    WHERE s.state = 'active' ORDER BY s.id::text COLLATE "C"
  LOOP
    PERFORM internal.partner_selection_validate(selection.org_object_id,
      selection.name, selection.buckets, selection.explorer_state, selection.commune_insee);
    matched_ids := ARRAY[]::text[];
    FOR bucket IN SELECT value FROM jsonb_array_elements(selection.buckets) LOOP
      -- Resolve each relevant branch once per page, never once per object.
      -- A filter-engine call still evaluates its canonical global search gate;
      -- restricting its input would change exact-to-fuzzy fallback semantics.
      IF NOT (ARRAY(SELECT jsonb_array_elements_text(bucket->'types'))::public.object_type[] && page_types) THEN
        CONTINUE;
      END IF;
      SELECT ARRAY(
        SELECT DISTINCT matched.object_id
        FROM api.get_filtered_object_ids(
          COALESCE(bucket->'filters', '{}'::jsonb),
          ARRAY(SELECT jsonb_array_elements_text(bucket->'types'))::public.object_type[],
          ARRAY['published']::public.object_status[], NULLIF(bucket->>'search', '')
        ) matched
        JOIN public.object o ON o.id = matched.object_id
        WHERE o.id = ANY(page_ids) AND o.status = 'published' AND NOT o.is_test
          AND (NOT COALESCE((bucket->>'only_without_practices')::boolean, false)
            OR NOT EXISTS (SELECT 1 FROM public.object_iti_practice p WHERE p.object_id = o.id))
          AND (selection.commune_insee IS NULL OR EXISTS (
            SELECT 1 FROM public.object_location location
            WHERE location.object_id = o.id AND location.is_main_location IS TRUE
              AND location.code_insee = ANY(selection.commune_insee)
          ))
        ORDER BY matched.object_id
      ) INTO branch_ids;
      matched_ids := matched_ids || branch_ids;
    END LOOP;
    FOR object_id IN SELECT DISTINCT id FROM unnest(matched_ids) id LOOP
      memberships := jsonb_set(memberships, ARRAY[object_id],
        COALESCE(memberships->object_id, '[]'::jsonb) || jsonb_build_array(selection.id::text));
    END LOOP;
  END LOOP;
  RETURN memberships;
EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE = '42501' THEN RAISE; END IF;
  -- Do not report a broken registry as an empty membership set: consumers
  -- would interpret that as valid removals during reconciliation.
  RAISE EXCEPTION 'selection_memberships_unavailable' USING ERRCODE = 'PT503';
END
$fn$;
REVOKE ALL ON FUNCTION internal.partner_selection_memberships(text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION internal.partner_selection_memberships(text[]) TO service_role;

CREATE FUNCTION api.list_partner_objects_with_selection_ids(
  p_cursor text DEFAULT NULL, p_lang_prefs text[] DEFAULT ARRAY['fr'],
  p_page_size integer DEFAULT 50, p_types text[] DEFAULT NULL,
  p_status text[] DEFAULT ARRAY['published'], p_search text DEFAULT NULL,
  p_track_format text DEFAULT 'none', p_view text DEFAULT 'card',
  p_format text DEFAULT '', p_variant text DEFAULT 'legacy-v1',
  p_taxonomy_codes text[] DEFAULT NULL, p_include_equivalent_predecessors boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = pg_catalog, public, api, internal, extensions, pg_temp
AS $fn$
DECLARE result jsonb; items jsonb; ids text[]; memberships jsonb;
BEGIN
  IF current_user <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  -- Exactly one call preserves the existing result, representation, order,
  -- cursor, totals, vocabulary snapshot and optional pivot payloads.
  result := api.list_partner_objects_with_vocabulary(p_cursor, p_lang_prefs,
    p_page_size, p_types, p_status, p_search, p_track_format, p_view,
    p_format, p_variant, p_taxonomy_codes, p_include_equivalent_predecessors);
  items := result->'data';
  IF jsonb_typeof(items) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'invalid_partner_page' USING ERRCODE = 'PT503';
  END IF;
  SELECT COALESCE(array_agg(item->>'id'), ARRAY[]::text[]) INTO ids
    FROM jsonb_array_elements(items) item;
  memberships := internal.partner_selection_memberships(ids);
  SELECT COALESCE(jsonb_agg(item || jsonb_build_object('selection_ids',
    COALESCE(memberships->(item->>'id'), '[]'::jsonb)) ORDER BY ord), '[]'::jsonb)
    INTO items FROM jsonb_array_elements(items) WITH ORDINALITY payload(item, ord);
  RETURN jsonb_set(result, '{data}', items);
END
$fn$;
REVOKE ALL ON FUNCTION api.list_partner_objects_with_selection_ids(
  text,text[],integer,text[],text[],text,text,text,text,text,text[],boolean
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION api.list_partner_objects_with_selection_ids(
  text,text[],integer,text[],text[],text,text,text,text,text,text[],boolean
) TO service_role;
COMMENT ON FUNCTION api.list_partner_objects_with_selection_ids(
  text,text[],integer,text[],text[],text,text,text,text,text,text[],boolean
) IS 'Opt-in general partner page: unchanged legacy page plus root selection_ids strings from active dynamic definitions. Service-role only; no work added to historical readers.';
COMMENT ON FUNCTION internal.partner_selection_memberships(text[]) IS
  'Private active-selection membership for at most 200 page objects. Shared filter engine per relevant branch, canonical global search gate, published real objects only; errors fail closed.';
NOTIFY pgrst, 'reload schema';
COMMIT;
