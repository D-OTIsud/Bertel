-- Run BEFORE the candidate migration, in the SAME session as test_render_reuse.sql.
-- pg_temp is session-local and outside PostgREST's exposed schemas. Preserve the
-- original body, volatility, SECURITY DEFINER and search_path, changing only name.
DO $capture$
DECLARE
  ddl text := pg_get_functiondef('api.get_object_resource(text,text[],text,jsonb)'::regprocedure);
BEGIN
  IF ddl LIKE '%api.get_object_resource(%api.get_object_resource(%' THEN
    RAISE EXCEPTION 'Baseline references itself: review clone before running';
  END IF;
  ddl := regexp_replace(ddl, 'FUNCTION api\.get_object_resource\(',
                        'FUNCTION pg_temp.render_reuse_baseline(');
  IF ddl NOT LIKE '%FUNCTION pg_temp.render_reuse_baseline(%' THEN
    RAISE EXCEPTION 'Could not rename baseline function';
  END IF;
  EXECUTE ddl;
  REVOKE ALL ON FUNCTION pg_temp.render_reuse_baseline(text,text[],text,jsonb) FROM PUBLIC;
END;
$capture$;
