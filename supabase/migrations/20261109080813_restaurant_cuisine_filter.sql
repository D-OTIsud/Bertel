-- Structured restaurant cuisine, independent of menus. Shared Explorer/partner engine.
BEGIN;
SET LOCAL lock_timeout = '500ms';
SET LOCAL statement_timeout = '15s';

CREATE OR REPLACE FUNCTION internal.cuisine_filter_codes(p_filters jsonb)
RETURNS text[] LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp AS $cuisine$
DECLARE codes text[];
BEGIN
  IF NOT COALESCE(p_filters ? 'cuisine_types_any', false) THEN RETURN NULL; END IF;
  IF jsonb_typeof(p_filters->'cuisine_types_any') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'invalid_cuisine_types' USING ERRCODE='PT400';
  END IF;
  IF jsonb_array_length(p_filters->'cuisine_types_any') > 100
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_filters->'cuisine_types_any') c
      WHERE jsonb_typeof(c) IS DISTINCT FROM 'string') THEN
    RAISE EXCEPTION 'invalid_cuisine_types' USING ERRCODE='PT400';
  END IF;
  SELECT array_agg(DISTINCT code ORDER BY code) INTO codes
  FROM jsonb_array_elements_text(p_filters->'cuisine_types_any') c(code);
  IF EXISTS (SELECT 1 FROM unnest(codes) c(code)
    WHERE NOT EXISTS (SELECT 1 FROM public.ref_code_cuisine_type r
      WHERE r.code=c.code AND r.is_active)) THEN
    RAISE EXCEPTION 'unknown_cuisine_type' USING ERRCODE='PT400';
  END IF;
  RETURN codes;
END;
$cuisine$;
REVOKE ALL ON FUNCTION internal.cuisine_filter_codes(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION internal.cuisine_filter_codes(jsonb) TO service_role;

DO $patch$
DECLARE
  target constant regprocedure := 'api.get_filtered_object_ids(jsonb,public.object_type[],public.object_status[],text)'::regprocedure;
  prior_body text; prior_definition text; prior_owner oid; prior_acl aclitem[];
  next_body text; reconstructed text; anchor text;
  before_hashes constant text[] := ARRAY['c4c23634e4b4e6f6608814a90710b829','9096646958ca9b9d31dd026dfb1d090c'];
  param_anchor constant text := E'      n.search_norm,\n';
  param_next constant text := E'      n.search_norm,\n      (SELECT internal.cuisine_filter_codes(p_filters)) AS cuisine_types_any,\n';
  mv_anchor constant text := E'        OR n.filters ? ''capacity_filters''\n';
  mv_next constant text := E'        OR n.filters ? ''capacity_filters''\n        OR (SELECT internal.cuisine_filter_codes(p_filters)) IS NOT NULL\n';
  predicate_anchor constant text := E'    AND (NOT (params.filters ? ''capacity_filters'') OR NOT EXISTS (\n';
  predicate_next constant text := $predicate$    AND (params.cuisine_types_any IS NULL OR (
      src.object_type = 'RES' AND EXISTS (
        SELECT 1 FROM public.object_cuisine_type cuisine
        JOIN public.ref_code_cuisine_type code ON code.id=cuisine.cuisine_type_id
        WHERE cuisine.object_id=src.object_id AND code.code=ANY(params.cuisine_types_any)
      )
    ))
    AND (NOT (params.filters ? 'capacity_filters') OR NOT EXISTS (
$predicate$;
BEGIN
  SELECT replace(p.prosrc,chr(13),''),replace(pg_get_functiondef(p.oid),chr(13),''),
    p.proowner,p.proacl INTO STRICT prior_body,prior_definition,prior_owner,prior_acl
  FROM pg_proc p WHERE p.oid=target AND p.prosecdef AND p.provolatile='s';
  IF strpos(prior_body,'internal.cuisine_filter_codes(p_filters)')>0 THEN
    reconstructed := replace(replace(replace(prior_body,param_next,param_anchor),mv_next,mv_anchor),predicate_next,predicate_anchor);
    IF NOT md5(reconstructed)=ANY(before_hashes) THEN
      RAISE EXCEPTION 'Unexpected cuisine filter successor' USING ERRCODE='55000';
    END IF;
    RETURN;
  END IF;
  IF NOT md5(prior_body)=ANY(before_hashes) THEN
    RAISE EXCEPTION 'Unexpected cuisine filter predecessor: %',md5(prior_body) USING ERRCODE='55000';
  END IF;
  FOREACH anchor IN ARRAY ARRAY[param_anchor,mv_anchor,predicate_anchor] LOOP
    IF (length(prior_body)-length(replace(prior_body,anchor,'')))/length(anchor)<>1 THEN
      RAISE EXCEPTION 'Cuisine filter anchor is not unique' USING ERRCODE='55000';
    END IF;
  END LOOP;
  next_body := replace(replace(replace(prior_body,param_anchor,param_next),mv_anchor,mv_next),predicate_anchor,predicate_next);
  IF strpos(prior_definition,prior_body)=0 THEN RAISE EXCEPTION 'Cuisine filter body not found'; END IF;
  EXECUTE replace(prior_definition,prior_body,next_body);
  IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=target
    AND md5(replace(p.prosrc,chr(13),''))=md5(next_body)
    AND p.proowner=prior_owner AND p.proacl IS NOT DISTINCT FROM prior_acl
    AND p.prosecdef AND p.provolatile='s') THEN
    RAISE EXCEPTION 'Cuisine filter patch did not preserve attributes and privileges';
  END IF;
END;
$patch$;
NOTIFY pgrst, 'reload schema';
COMMIT;
