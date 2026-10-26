-- Prepared, not applied. Source: live catalogue read-only, 2026-10-26 08:01:09 UTC.
-- Keep cursor-only continuations; restore caller status authority and effective page bounds.
-- This patch does not change the route's handling of raw descriptions in cursor-selected full views.
BEGIN;
SET LOCAL lock_timeout = '500ms';
SET LOCAL statement_timeout = '5s';
SET LOCAL idle_in_transaction_session_timeout = '10s';

DO $page_cursor_bounds$
DECLARE
  v_function regprocedure := 'api.list_object_resources_page(text,text[],integer,object_type[],object_status[],text,text,boolean,text,boolean,text)'::regprocedure;
  v_definition text;
  v_body_md5 text;
  v_before text := $before$  IF v_status IS NULL THEN
    v_status := ARRAY['published']::object_status[];
  END IF;

  IF v_view NOT IN ('card', 'full') THEN
    v_view := 'card';
  END IF;$before$;
  v_after text := $after$  -- The caller owns the status filter; an unsigned cursor cannot expand it.
  v_status := COALESCE(p_status, ARRAY['published']::object_status[]);

  -- Preserve cursor-only continuations, then bound the effective projection.
  v_view := CASE WHEN v_view = 'full' THEN 'full' ELSE 'card' END;
  v_limit := LEAST(GREATEST(COALESCE(v_limit, 50), 1), CASE WHEN v_view = 'full' THEN 100 ELSE 200 END);
  v_offset := GREATEST(COALESCE(v_offset, 0), 0);$after$;
BEGIN
  SELECT md5(prosrc), pg_get_functiondef(oid)
    INTO v_body_md5, v_definition
    FROM pg_proc WHERE oid = v_function;
  IF v_body_md5 = 'f2b6dd62f6c0b41764469f7f9a1f373f' THEN
    RETURN;
  END IF;
  IF v_body_md5 IS DISTINCT FROM 'e1ed90babe8e8ee2ab6c0c259841ea6d' THEN
    RAISE EXCEPTION 'page cursor bounds: source changed; refresh and review the live definition';
  END IF;
  IF (length(v_definition) - length(replace(v_definition, v_before, ''))) / length(v_before) <> 1 THEN
    RAISE EXCEPTION 'page cursor bounds: expected exactly one cursor post-processing block';
  END IF;
  EXECUTE replace(v_definition, v_before, v_after);
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = v_function) IS DISTINCT FROM 'f2b6dd62f6c0b41764469f7f9a1f373f' THEN
    RAISE EXCEPTION 'page cursor bounds: unexpected result';
  END IF;
END;
$page_cursor_bounds$;
COMMIT;
