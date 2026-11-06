-- Thesaurus consumers: each content/generation pair comes from one SQL snapshot.
-- Depends on 20261106112948_thesaurus_publication.sql. Existing RPC signatures stay intact.
BEGIN;

CREATE OR REPLACE FUNCTION api.thesaurus_reference_snapshot(p_domains text[] DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = pg_catalog, public, api, internal, extensions
AS $fn$
DECLARE
  refs jsonb;
  catalogs jsonb := '{}'::jsonb;
  rows jsonb;
  table_name text;
BEGIN
  SELECT COALESCE(jsonb_object_agg(domain, items), '{}'::jsonb) INTO refs
  FROM (
    SELECT r.domain, jsonb_agg(to_jsonb(r) ORDER BY r.position NULLS LAST, r.code) items
    FROM public.ref_code r
    WHERE p_domains IS NULL OR r.domain = ANY(p_domains)
    GROUP BY r.domain
  ) q;

  -- Hard-coded reference relations only. Never accept a relation name from the caller.
  FOREACH table_name IN ARRAY ARRAY[
    'ref_language','ref_contact_role','ref_org_role','ref_actor_role','ref_iti_assoc_role',
    'ref_tag','ref_legal_type','ref_capacity_metric','ref_capacity_applicability',
    'ref_classification_scheme','ref_classification_scheme_applicability',
    'ref_sustainability_action','ref_sustainability_action_category',
    'ref_code_domain_registry','ref_facet_applicability'
  ] LOOP
    EXECUTE format('SELECT COALESCE(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) FROM public.%I t', table_name)
      INTO rows;
    catalogs := catalogs || jsonb_build_object(table_name, rows);
  END LOOP;
  SELECT COALESCE(jsonb_agg(to_jsonb(a) || jsonb_build_object('family',
    CASE WHEN f.id IS NULL THEN NULL ELSE jsonb_build_object('code', f.code, 'name', f.name, 'position', f.position) END)
    ORDER BY a.position NULLS LAST, a.code), '[]'::jsonb)
    INTO rows FROM public.ref_amenity a
    LEFT JOIN public.ref_code f ON f.id = a.family_id AND f.domain = 'amenity_family';
  catalogs := catalogs || jsonb_build_object('ref_amenity', rows);
  SELECT COALESCE(jsonb_agg(to_jsonb(v) || jsonb_build_object('scheme',
    jsonb_build_object('code',s.code,'is_distinction',s.is_distinction))
    ORDER BY v.position NULLS LAST, v.code), '[]'::jsonb)
    INTO rows FROM public.ref_classification_value v
    JOIN public.ref_classification_scheme s ON s.id = v.scheme_id;
  catalogs := catalogs || jsonb_build_object('ref_classification_value', rows);
  IF to_regclass('public.v_capacity_metric_bounds') IS NOT NULL THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(b)), '[]'::jsonb) INTO rows FROM public.v_capacity_metric_bounds b;
    catalogs := catalogs || jsonb_build_object('v_capacity_metric_bounds', rows);
  END IF;
  RETURN jsonb_build_object('meta', jsonb_build_object('vocabulary_release',api.thesaurus_generation()),
    'refCodeByDomain',refs,'tables',catalogs,
    'locationOptions',api.get_dashboard_filter_options());
END
$fn$;
REVOKE ALL ON FUNCTION api.thesaurus_reference_snapshot(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION api.thesaurus_reference_snapshot(text[]) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION api.thesaurus_taxonomy_matches(p_cached text[], p_selected text[], p_filters jsonb)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = pg_catalog, api
AS $fn$
  SELECT p_selected IS NULL OR COALESCE(p_cached,ARRAY[]::text[]) &&
    CASE WHEN p_filters @> '{"include_equivalent_predecessors":true}'::jsonb
      THEN api.thesaurus_expand_taxonomy_codes(p_selected) ELSE p_selected END
$fn$;
REVOKE ALL ON FUNCTION api.thesaurus_taxonomy_matches(text[],text[],jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION api.thesaurus_taxonomy_matches(text[],text[],jsonb) TO anon,authenticated,service_role;

-- Adapt only the taxonomy predicate of the authoritative visibility/filter engine.
-- Verify the exact predecessor before replacement; preserve every other clause,
-- role, security attribute and signature already installed by earlier migrations.
DO $adapt_filter$
DECLARE definition text; old_clause text := 'AND (params.taxonomy_any_codes IS NULL OR COALESCE(src.cached_taxonomy_codes, ARRAY[]::TEXT[]) && params.taxonomy_any_codes)';
BEGIN
  definition := pg_get_functiondef('api.get_filtered_object_ids(jsonb,public.object_type[],public.object_status[],text)'::regprocedure);
  IF position('api.thesaurus_taxonomy_matches(src.cached_taxonomy_codes' IN definition)>0 THEN RETURN; END IF;
  IF position(old_clause IN definition)=0 THEN
    RAISE EXCEPTION 'Unsupported taxonomy filter predecessor; inspect before migrating';
  END IF;
  EXECUTE replace(definition,old_clause,'AND api.thesaurus_taxonomy_matches(src.cached_taxonomy_codes, params.taxonomy_any_codes, p_filters)');
END
$adapt_filter$;

CREATE OR REPLACE FUNCTION api.get_partner_object_with_vocabulary(
  p_object_id text, p_lang_prefs text[] DEFAULT ARRAY['fr'],
  p_format text DEFAULT '', p_variant text DEFAULT 'legacy-v1', p_i18n_all boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = pg_catalog, public, api, internal, extensions
AS $fn$
DECLARE resource jsonb; extra jsonb;
BEGIN
  -- This gate and every serialization below share the same statement snapshot.
  IF NOT EXISTS (SELECT 1 FROM public.object o WHERE o.id=p_object_id AND o.status='published' AND NOT o.is_test) THEN
    RETURN NULL;
  END IF;
  resource := api.get_object_resource(p_object_id,p_lang_prefs,'none','{}'::jsonb)::jsonb;
  IF resource IS NULL THEN RETURN NULL; END IF;
  resource := resource - 'canonical_description' - 'org_description';
  IF p_i18n_all THEN
    BEGIN
      extra := api.get_object_i18n_all(p_object_id)::jsonb;
      resource := resource || jsonb_build_object('i18n',COALESCE(extra,'{}'::jsonb));
    EXCEPTION WHEN OTHERS THEN NULL; -- retain the existing best-effort enrichment contract
    END;
  END IF;
  IF p_format = 'jsonld' THEN
    BEGIN
      extra := api.get_object_jsonld(p_object_id)::jsonb;
      IF extra IS NOT NULL THEN resource := resource || jsonb_build_object('jsonld',extra); END IF;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  ELSIF p_format IN ('datatourisme','apidae','tourinsoft') THEN
    BEGIN
      IF p_format='tourinsoft' AND p_variant <> 'legacy-v1' THEN
        extra := api.get_object_tourinsoft(p_object_id,p_variant)::jsonb;
      ELSE
        extra := api.get_object_interop(p_object_id,p_format)::jsonb;
      END IF;
      IF extra IS NOT NULL THEN resource := resource || jsonb_build_object(p_format,extra); END IF;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
  RETURN jsonb_build_object('meta',jsonb_build_object('vocabulary_release',api.thesaurus_object_release()),'data',resource);
END
$fn$;
REVOKE ALL ON FUNCTION api.get_partner_object_with_vocabulary(text,text[],text,text,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION api.get_partner_object_with_vocabulary(text,text[],text,text,boolean) TO service_role;

CREATE OR REPLACE FUNCTION api.list_partner_objects_with_vocabulary(
  p_cursor text DEFAULT NULL, p_lang_prefs text[] DEFAULT ARRAY['fr'],
  p_page_size integer DEFAULT 50, p_types text[] DEFAULT NULL,
  p_status text[] DEFAULT ARRAY['published'], p_search text DEFAULT NULL,
  p_track_format text DEFAULT 'none', p_view text DEFAULT 'card',
  p_format text DEFAULT '', p_variant text DEFAULT 'legacy-v1',
  p_taxonomy_codes text[] DEFAULT NULL, p_include_equivalent_predecessors boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = pg_catalog, public, api, internal, extensions
AS $fn$
DECLARE
  result jsonb; items jsonb; batch jsonb; ids text[]; all_ids text[];
  expanded text[]; filters jsonb; cur jsonb; next_cur text;
  last_id text; total bigint; limit_n integer := LEAST(GREATEST(COALESCE(p_page_size,50),1),CASE WHEN p_view='full' THEN 100 ELSE 200 END);
  binding text; page_count integer;
BEGIN
  -- An encoded legacy cursor is never allowed to reintroduce non-published statuses.
  IF p_cursor IS NOT NULL AND COALESCE(cardinality(p_taxonomy_codes),0)=0 THEN
    cur := api.cursor_unpack(p_cursor);
    IF cur ? 'status' AND cur->'status' <> '["published"]'::jsonb THEN
      RAISE EXCEPTION 'invalid_partner_cursor' USING ERRCODE='PT400';
    END IF;
  END IF;
  IF COALESCE(cardinality(p_taxonomy_codes),0)>0 THEN
    IF EXISTS (SELECT 1 FROM unnest(p_taxonomy_codes) c WHERE c !~ '^taxonomy_[a-z_]+:[a-z0-9_-]+$') THEN
      RAISE EXCEPTION 'invalid_taxonomy_filter' USING ERRCODE='PT400';
    END IF;
    binding := md5(jsonb_build_object('codes',p_taxonomy_codes,'equivalent',p_include_equivalent_predecessors,
      'types',p_types,'search',p_search,'lang',p_lang_prefs,'view',p_view,'size',limit_n,'format',p_format,'variant',p_variant)::text);
    IF p_cursor IS NOT NULL THEN
      cur := api.cursor_unpack(p_cursor);
      IF cur->>'kind' IS DISTINCT FROM 'thesaurus_objects' OR cur->>'binding' IS DISTINCT FROM binding THEN
        RAISE EXCEPTION 'invalid_partner_cursor' USING ERRCODE='PT400';
      END IF;
      last_id := cur->>'last_id';
    END IF;
    expanded := CASE WHEN p_include_equivalent_predecessors THEN api.thesaurus_expand_taxonomy_codes(p_taxonomy_codes) ELSE p_taxonomy_codes END;
    SELECT jsonb_build_object('taxonomy_any',jsonb_agg(jsonb_build_object('domain',split_part(c,':',1),'code',split_part(c,':',2))))
      INTO filters FROM unnest(expanded) c;
    SELECT ARRAY(SELECT f.object_id FROM api.get_filtered_object_ids(filters,
      CASE WHEN p_types IS NULL THEN NULL ELSE p_types::public.object_type[] END,
      ARRAY['published']::public.object_status[],p_search) f
      JOIN public.object o ON o.id=f.object_id WHERE o.status='published' AND NOT o.is_test ORDER BY f.object_id)
      INTO all_ids;
    total := cardinality(all_ids);
    SELECT ARRAY(SELECT id FROM unnest(all_ids) id WHERE last_id IS NULL OR id>last_id ORDER BY id LIMIT limit_n) INTO ids;
    page_count := cardinality(ids);
    IF page_count=limit_n AND EXISTS (SELECT 1 FROM unnest(all_ids) id WHERE id>ids[page_count]) THEN
      next_cur := api.cursor_pack(jsonb_build_object('kind','thesaurus_objects','binding',binding,'last_id',ids[page_count]));
    END IF;
    IF p_view='full' THEN
      items := api.get_object_resources_batch(ids,p_lang_prefs,p_track_format,'{}'::jsonb)::jsonb;
    ELSE
      items := api.get_object_cards_batch(ids,p_lang_prefs)::jsonb;
    END IF;
    result := jsonb_build_object('meta',jsonb_build_object('total',total,'page_size',limit_n,'next_cursor',next_cur),'data',COALESCE(items,'[]'::jsonb));
  ELSE
    result := api.list_object_resources_page_text(p_cursor,p_lang_prefs,limit_n,p_types,
      ARRAY['published'],p_search,p_track_format,NULL,NULL,NULL,p_view)::jsonb;
  END IF;
  items := COALESCE(result->'data','[]'::jsonb);
  IF jsonb_typeof(items) <> 'array' THEN items := '[]'::jsonb; END IF;
  SELECT COALESCE(array_agg(x->>'id'),ARRAY[]::text[]) INTO ids FROM jsonb_array_elements(items) x WHERE x ? 'id';
  IF p_format IN ('jsonld','datatourisme','apidae','tourinsoft') AND cardinality(ids)>0 THEN
    BEGIN
      IF p_format='tourinsoft' AND p_variant<>'legacy-v1' THEN
        batch := api.get_objects_tourinsoft_batch(ids,p_variant)::jsonb;
      ELSE
        batch := api.get_objects_interop_batch(ids,p_format)::jsonb;
      END IF;
    EXCEPTION WHEN OTHERS THEN batch := NULL;
    END;
  END IF;
  SELECT COALESCE(jsonb_agg((CASE WHEN p_view='full' THEN x-'canonical_description'-'org_description' ELSE x END)
    || CASE WHEN batch->(x->>'id') IS NOT NULL THEN jsonb_build_object(p_format,batch->(x->>'id')) ELSE '{}'::jsonb END ORDER BY ord),'[]'::jsonb)
    INTO items FROM jsonb_array_elements(items) WITH ORDINALITY a(x,ord);
  result := jsonb_set(result,'{data}',items);
  IF result ? 'info' THEN
    result := jsonb_set(result,'{info}',(result->'info')||jsonb_build_object('vocabulary_release',api.thesaurus_object_release()));
  ELSE
    result := jsonb_set(result,'{meta}',COALESCE(result->'meta','{}'::jsonb)||jsonb_build_object('vocabulary_release',api.thesaurus_object_release()));
  END IF;
  RETURN result;
END
$fn$;
REVOKE ALL ON FUNCTION api.list_partner_objects_with_vocabulary(text,text[],integer,text[],text[],text,text,text,text,text,text[],boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION api.list_partner_objects_with_vocabulary(text,text[],integer,text[],text[],text,text,text,text,text,text[],boolean) TO service_role;

COMMENT ON FUNCTION api.thesaurus_reference_snapshot(text[]) IS 'Reference values and vocabulary generation from one statement snapshot; fixed reference allowlist, invoker RLS.';
COMMENT ON FUNCTION api.get_partner_object_with_vocabulary(text,text[],text,text,boolean) IS 'Published real object, optional pivot and vocabulary release from one statement snapshot; service_role only.';
COMMENT ON FUNCTION api.list_partner_objects_with_vocabulary(text,text[],integer,text[],text[],text,text,text,text,text,text[],boolean) IS 'Published real object page and vocabulary release from one snapshot; opt-in exact-equivalence taxonomy filters.';
NOTIFY pgrst, 'reload schema';
COMMIT;
