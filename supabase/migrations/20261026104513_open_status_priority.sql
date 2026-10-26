-- PREPARATION ONLY. No live application, refresh, data mutation or UI activation.
-- Source: catalog_current.json, READ ONLY 2026-10-26T10:28:21.993Z.
-- Only these two function bodies change; captured signatures/settings/ACL stay intact.
BEGIN;
SET LOCAL lock_timeout = '500ms';
SET LOCAL statement_timeout = '5s';
SET LOCAL idle_in_transaction_session_timeout = '10s';

DO $opening_source_guard$
DECLARE
  v_expected record;
  v_current record;
BEGIN
  FOR v_expected IN SELECT * FROM (VALUES
    ('internal.compute_open_status(timestamp with time zone)', 'aa9f821df464af48ce0838c5b0c9b833', '8c8067ac3bdacc4087e5ec6bac9b4812'),
    ('api.is_object_open_now(text)', 'e03a0a020722c66776a166f84b8d4176', 'd4df9655e2ab6771fbc493d55e436afd'),
    ('api.opening_period_rank(boolean,boolean,date,date)', 'f07023d7b39e3c1acd3e7304a5638ec9', '2cc0a7bfd632672d788bd2d3165358bc'),
    ('api.opening_period_width(boolean,date,date)', '89ca7bbea9e1b220af988d45560fd4ab', '163c2be192dcab4ad2c0e966c8ef16ed'),
    ('api.is_opening_period_active_on_date(boolean,date,date,date)', '90109998816f13c520fcbb7e0bea9483', 'd385c87853dbebb8a60bc8046d8a9af7'),
    ('api.get_local_time_for_timezone(text,timestamp with time zone)', 'f2c50ca49c2b54c035efbcef6e5a8daf', '71a1f64af574d99dff4ac56578cf1fd9'),
    ('api.get_local_now_for_timezone(text)', 'b419f08480f077f4db29cc9c2845dd39', '6255e4712cfae96de92820e7685d5de6'),
    ('api.get_object_local_now(text)', '8057d63cbbaa2ab55f290b481dc9f1a9', '1b2850dca9e5a2e624ca68f2141622bb'),
    ('api.refresh_open_status()', '0ec74e6ad82f8afb06f03cfa45669a56', 'debb033743b53088613d3763ef605acb'),
    ('api.get_filtered_object_ids(jsonb,public.object_type[],public.object_status[],text)', '3d46f26d568ec24804b69ff3916abd87', '562fac42e68b370404b3977272ac4d89')
  ) AS expected(identity, body_md5, definition_md5) LOOP
    SELECT p.oid, p.prosrc, p.proacl, p.proowner INTO v_current
      FROM pg_proc p WHERE p.oid = to_regprocedure(v_expected.identity);
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Opening source missing: %', v_expected.identity USING ERRCODE = '55000';
    END IF;
    -- Function definition includes language, stability, security, search_path and signature.
    IF md5(v_current.prosrc) <> v_expected.body_md5
        OR md5(pg_get_functiondef(v_current.oid)) <> v_expected.definition_md5
        OR v_current.proacl::text IS DISTINCT FROM (CASE
          WHEN v_expected.identity = 'api.refresh_open_status()'
            THEN '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'
          ELSE NULL END)
        OR pg_get_userbyid(v_current.proowner) <> 'postgres' THEN
      RAISE EXCEPTION 'Opening catalogue drift: %; refresh capture before applying', v_expected.identity
        USING ERRCODE = '55000';
    END IF;
  END LOOP;
END;
$opening_source_guard$;

CREATE OR REPLACE FUNCTION internal.compute_open_status(p_at timestamp with time zone)
 RETURNS TABLE(object_id text, is_open boolean)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'api', 'extensions', 'auth', 'audit', 'crm', 'ref'
AS $function$
BEGIN
  IF p_at IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  -- <open-status-core>
  WITH tz_local AS MATERIALIZED (
    SELECT z.tz, ln.local_date, ln.local_time, ln.local_isodow
    FROM (SELECT DISTINCT o.business_timezone AS tz FROM object o WHERE o.status = 'published') z
    CROSS JOIN LATERAL api.get_local_time_for_timezone(z.tz, p_at) ln
  ),
  obj AS MATERIALIZED (
    SELECT o.id, t.local_date, t.local_time, t.local_isodow
    FROM object o
    JOIN tz_local t ON t.tz IS NOT DISTINCT FROM o.business_timezone
    WHERE o.status = 'published'
  ),
  eligible_obj AS MATERIALIZED (
    SELECT obj.*
    FROM obj
    WHERE EXISTS (
      SELECT 1
      FROM opening_period p
      JOIN opening_schedule s ON s.period_id = p.id
      JOIN opening_time_period tp ON tp.schedule_id = s.id
      WHERE p.object_id = obj.id AND tp.closed = FALSE
    )
  ),
  active AS (
    SELECT p.object_id, p.id AS period_id, p.is_closure,
      rank() OVER (
        PARTITION BY p.object_id
        ORDER BY api.opening_period_rank(p.is_closure, p.all_years, p.date_start, p.date_end) DESC,
                 api.opening_period_width(p.all_years, p.date_start, p.date_end) ASC
      ) AS pos
    FROM eligible_obj obj
    JOIN opening_period p ON p.object_id = obj.id
    WHERE api.is_opening_period_active_on_date(p.all_years, p.date_start, p.date_end, obj.local_date)
  ),
  winner AS (
    SELECT a.object_id, a.period_id, a.is_closure FROM active a WHERE a.pos = 1
  ),
  winner_state AS (
    SELECT w.object_id, bool_or(w.is_closure) AS is_closed,
      bool_or(EXISTS (
        SELECT 1
        FROM opening_schedule s
        JOIN opening_time_period tp ON tp.schedule_id = s.id
        JOIN opening_time_period_weekday tpw ON tpw.time_period_id = tp.id
        JOIN ref_code_weekday wd ON wd.id = tpw.weekday_id
        WHERE s.period_id = w.period_id
          AND tp.closed = FALSE
          AND COALESCE(wd.dow_number, CASE wd.code
            WHEN 'monday' THEN 1 WHEN 'tuesday' THEN 2 WHEN 'wednesday' THEN 3
            WHEN 'thursday' THEN 4 WHEN 'friday' THEN 5 WHEN 'saturday' THEN 6
            WHEN 'sunday' THEN 7 ELSE NULL END) = obj.local_isodow
          AND (
            NOT EXISTS (SELECT 1 FROM opening_time_frame tf0 WHERE tf0.time_period_id = tp.id)
            OR EXISTS (
              SELECT 1 FROM opening_time_frame tf
              WHERE tf.time_period_id = tp.id
                AND (tf.start_time IS NULL OR tf.start_time <= obj.local_time)
                AND (tf.end_time IS NULL OR tf.end_time > obj.local_time)
            )
          )
      )) AS is_open
    FROM winner w
    JOIN obj ON obj.id = w.object_id
    GROUP BY w.object_id
  )
  SELECT obj.id AS object_id,
    CASE
      WHEN NOT EXISTS (SELECT 1 FROM opening_period p2 WHERE p2.object_id = obj.id)
        THEN NULL::boolean
      WHEN state.is_closed THEN FALSE
      ELSE COALESCE(state.is_open, FALSE)
    END AS is_open
  FROM obj
  LEFT JOIN winner_state state ON state.object_id = obj.id;
  -- </open-status-core>
END;
$function$;

CREATE OR REPLACE FUNCTION api.is_object_open_now(p_object_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'api', 'extensions', 'auth', 'audit', 'crm', 'ref'
AS $function$
  -- <object-open-now-core>
  WITH obj AS MATERIALIZED (
    SELECT ln.local_date, ln.local_time, ln.local_isodow
    FROM api.get_object_local_now(p_object_id) ln
  ),
  active AS (
    SELECT p.id AS period_id, p.is_closure,
      rank() OVER (
        ORDER BY api.opening_period_rank(p.is_closure, p.all_years, p.date_start, p.date_end) DESC,
                 api.opening_period_width(p.all_years, p.date_start, p.date_end) ASC
      ) AS pos
    FROM obj
    JOIN opening_period p ON p.object_id = p_object_id
    WHERE api.is_opening_period_active_on_date(p.all_years, p.date_start, p.date_end, obj.local_date)
  ),
  winner AS (
    SELECT a.period_id, a.is_closure FROM active a WHERE a.pos = 1
  )
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM winner w WHERE w.is_closure) THEN FALSE
    ELSE EXISTS (
      SELECT 1
      FROM obj
      JOIN winner w ON TRUE
      JOIN opening_schedule s ON s.period_id = w.period_id
      JOIN opening_time_period tp ON tp.schedule_id = s.id
      JOIN opening_time_period_weekday tpw ON tpw.time_period_id = tp.id
      JOIN ref_code_weekday wd ON wd.id = tpw.weekday_id
      WHERE tp.closed = FALSE
        AND COALESCE(wd.dow_number, CASE wd.code
          WHEN 'monday' THEN 1 WHEN 'tuesday' THEN 2 WHEN 'wednesday' THEN 3
          WHEN 'thursday' THEN 4 WHEN 'friday' THEN 5 WHEN 'saturday' THEN 6
          WHEN 'sunday' THEN 7 ELSE NULL END) = obj.local_isodow
        AND (
          NOT EXISTS (SELECT 1 FROM opening_time_frame tf0 WHERE tf0.time_period_id = tp.id)
          OR EXISTS (
            SELECT 1 FROM opening_time_frame tf
            WHERE tf.time_period_id = tp.id
              AND (tf.start_time IS NULL OR tf.start_time <= obj.local_time)
              AND (tf.end_time IS NULL OR tf.end_time > obj.local_time)
          )
        )
    )
  END;
  -- </object-open-now-core>
$function$;

DO $opening_result_guard$
DECLARE
  v_expected record;
  v_current record;
BEGIN
  FOR v_expected IN SELECT * FROM (VALUES
    ('internal.compute_open_status(timestamp with time zone)', '29dabf5a8c6d921814fd288f5cc412c8', '484a498f6fcdc01748bdb94e51c42f69'),
    ('api.is_object_open_now(text)', '1d65bee9cde71bf13824b658d949aa17', '57640f689654c6f1104a617879b627cf'),
    ('api.refresh_open_status()', '0ec74e6ad82f8afb06f03cfa45669a56', 'debb033743b53088613d3763ef605acb'),
    ('api.get_filtered_object_ids(jsonb,public.object_type[],public.object_status[],text)', '3d46f26d568ec24804b69ff3916abd87', '562fac42e68b370404b3977272ac4d89')
  ) AS expected(identity, body_md5, definition_md5) LOOP
    SELECT p.oid, p.prosrc, p.proacl, p.proowner INTO v_current
      FROM pg_proc p WHERE p.oid = to_regprocedure(v_expected.identity);
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Opening result missing: %', v_expected.identity USING ERRCODE = '55000';
    END IF;
    IF md5(v_current.prosrc) <> v_expected.body_md5
        OR md5(pg_get_functiondef(v_current.oid)) <> v_expected.definition_md5
        OR v_current.proacl::text IS DISTINCT FROM (CASE
          WHEN v_expected.identity = 'api.refresh_open_status()'
            THEN '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'
          ELSE NULL END)
        OR pg_get_userbyid(v_current.proowner) <> 'postgres' THEN
      RAISE EXCEPTION 'Opening result mismatch: %; transaction cancelled', v_expected.identity
        USING ERRCODE = '55000';
    END IF;
  END LOOP;
END;
$opening_result_guard$;

COMMIT;
