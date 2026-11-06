-- Lot 4. Référence vive et éditeur validés par le responsable produit le 31/10/2026.
-- Les deux empreintes avant correspondent au catalogue vif et au manifeste historique.
-- Aucune autre divergence n’est acceptée. save_object_openings reste inchangée.
-- Les signatures, attributs et ACL vifs sont conservés. Le nouveau lecteur est INVOKER : RLS s’applique.
BEGIN;

DO $preflight$ DECLARE v_current text; BEGIN
 SELECT md5(replace(prosrc,E'\r\n',E'\n')) INTO v_current FROM pg_proc WHERE oid=to_regprocedure('api.get_opening_slots_by_day(uuid)');
 IF v_current IS NULL OR v_current NOT IN ('ec068871a985ff7e38a5f671f6160f30','25503d9cd19b95f4c66179f1dee471ae','47ce778ad208be7ff87c57e30cd9f683') THEN RAISE EXCEPTION 'Unexpected source for api.get_opening_slots_by_day(uuid): %',v_current; END IF;
 SELECT md5(replace(prosrc,E'\r\n',E'\n')) INTO v_current FROM pg_proc WHERE oid=to_regprocedure('api.build_opening_period_json(uuid, text, date, date, integer)');
 IF v_current IS NULL OR v_current NOT IN ('c531f4dc7d173ccd7b1ac167755178d3','8f3c3fe32ac51997cd5cebbe045751db','f49480441b2bf7c0ae94171d2fdf551b') THEN RAISE EXCEPTION 'Unexpected source for api.build_opening_period_json(uuid, text, date, date, integer): %',v_current; END IF;
 SELECT md5(replace(prosrc,E'\r\n',E'\n')) INTO v_current FROM pg_proc WHERE oid=to_regprocedure('internal.compute_open_status(timestamp with time zone)');
 IF v_current IS NULL OR v_current NOT IN ('29dabf5a8c6d921814fd288f5cc412c8','aa9f821df464af48ce0838c5b0c9b833','8b7742ead1f426f48b58431fc3231c4c') THEN RAISE EXCEPTION 'Unexpected source for internal.compute_open_status(timestamp with time zone): %',v_current; END IF;
 SELECT md5(replace(prosrc,E'\r\n',E'\n')) INTO v_current FROM pg_proc WHERE oid=to_regprocedure('api.is_object_open_now(text)');
 IF v_current IS NULL OR v_current NOT IN ('1d65bee9cde71bf13824b658d949aa17','93c5f267e493dc40c2fc77fb1a7fad20','fc82231403d838db123a16e6e6c0f764') THEN RAISE EXCEPTION 'Unexpected source for api.is_object_open_now(text): %',v_current; END IF;
END $preflight$;


INSERT INTO public.ref_code(domain,code,name,name_i18n) VALUES
 ('opening_schedule_type','reception','Accueil','{"en":"Reception","es":"Recepción"}'),
 ('opening_schedule_type','service','Service','{"en":"Service","es":"Servicio"}')
ON CONFLICT(domain,code) DO NOTHING;

CREATE OR REPLACE FUNCTION api.portal_opening_schedules_json(p_period_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER
SET search_path=pg_catalog,public AS $function$
 SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'id',s.id,'name',s.name,'name_i18n',s.name_i18n,'note',s.note,
  'schedule_type_code',kind.code,
  'schedule_type',jsonb_build_object('id',kind.id,'code',kind.code,'name',kind.name,'name_i18n',kind.name_i18n),
  'time_periods',(SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',tp.id,'closed',tp.closed,'note',tp.note,
    'weekdays',(SELECT COALESCE(jsonb_agg(jsonb_build_object('weekday_code',w.code,'weekday_name',w.name) ORDER BY w.position),'[]')
      FROM public.opening_time_period_weekday tw JOIN public.ref_code_weekday w ON w.id=tw.weekday_id WHERE tw.time_period_id=tp.id),
    'time_frames',(SELECT COALESCE(jsonb_agg(jsonb_build_object('start_time',tf.start_time,'end_time',tf.end_time,'recurrence',tf.recurrence::text) ORDER BY tf.start_time,tf.id),'[]')
      FROM public.opening_time_frame tf WHERE tf.time_period_id=tp.id)) ORDER BY tp.created_at,tp.id),'[]')
    FROM public.opening_time_period tp WHERE tp.schedule_id=s.id))
  ORDER BY CASE kind.code WHEN 'reception' THEN 1 WHEN 'service' THEN 2 ELSE 0 END,s.created_at,s.id),'[]')
 FROM public.opening_schedule s LEFT JOIN public.ref_code_opening_schedule_type kind ON kind.id=s.schedule_type_id
 WHERE s.period_id=p_period_id;
$function$;
REVOKE ALL ON FUNCTION api.portal_opening_schedules_json(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION api.portal_opening_schedules_json(uuid) TO anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION api.get_opening_slots_by_day(p_period_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'api', 'extensions', 'auth', 'audit', 'crm', 'ref'
AS $function$
  WITH day_state AS (
    SELECT
      w.code,
      w.position,
      -- A day is OPEN when it has at least one non-closed time_period in this period.
      EXISTS (
        SELECT 1
        FROM opening_schedule s
        JOIN opening_time_period tp          ON tp.schedule_id = s.id
        JOIN opening_time_period_weekday tpw ON tpw.time_period_id = tp.id
        WHERE s.period_id = p_period_id
          AND NOT EXISTS(SELECT 1 FROM public.ref_code_opening_schedule_type named_type WHERE named_type.id=s.schedule_type_id AND named_type.code IN ('reception','service'))
          AND tpw.weekday_id = w.id
          AND tp.closed = FALSE
      ) AS is_open,
      -- Its timed frames (NULL when none ⇒ rendered as [] = open without fixed hours).
      (
        SELECT jsonb_agg(
                 jsonb_build_object('start', tf.start_time::text, 'end', tf.end_time::text)
                 ORDER BY tf.start_time
               )
        FROM opening_schedule s
        JOIN opening_time_period tp          ON tp.schedule_id = s.id
        JOIN opening_time_period_weekday tpw ON tpw.time_period_id = tp.id
        JOIN opening_time_frame tf           ON tf.time_period_id = tp.id
        WHERE s.period_id = p_period_id
          AND NOT EXISTS(SELECT 1 FROM public.ref_code_opening_schedule_type named_type WHERE named_type.id=s.schedule_type_id AND named_type.code IN ('reception','service'))
          AND tpw.weekday_id = w.id
          AND tp.closed = FALSE
          AND tf.start_time IS NOT NULL
      ) AS frames
    FROM ref_code_weekday w
  )
  SELECT COALESCE(
    jsonb_object_agg(code, COALESCE(frames, '[]'::jsonb) ORDER BY position)
      FILTER (WHERE is_open),
    '{}'::jsonb
  )
  FROM day_state;
$function$;


CREATE OR REPLACE FUNCTION api.build_opening_period_json(p_period_id uuid, p_object_id text, p_date_start date, p_date_end date, p_order integer DEFAULT 1)
 RETURNS json
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'api', 'extensions', 'auth', 'audit', 'crm', 'ref'
AS $function$
DECLARE
  v_weekday_slots JSONB;
  v_period_type_code TEXT;
  v_all_years BOOLEAN;
  v_is_closure BOOLEAN;
BEGIN
  v_weekday_slots := api.get_opening_slots_by_day(p_period_id);
  SELECT rc.code, op.all_years, op.is_closure
    INTO v_period_type_code, v_all_years, v_is_closure
    FROM public.opening_period op
    LEFT JOIN public.ref_code_opening_period_type rc ON rc.id = op.period_type_id
    WHERE op.id = p_period_id;
  RETURN json_build_object(
    'id', p_period_id::text,
    'order', p_order,
    'object_id', p_object_id,
    'date_start', p_date_start,
    'date_end', p_date_end,
    'all_years', v_all_years,
    'is_closure', v_is_closure,
    'period_type_code', v_period_type_code,
    'closed_days', '[]'::json,
    'schedules', api.portal_opening_schedules_json(p_period_id),
    'weekday_slots', COALESCE(v_weekday_slots, '{}'::jsonb)::json
  );
END;
$function$;


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
        AND NOT EXISTS(SELECT 1 FROM public.ref_code_opening_schedule_type named_type WHERE named_type.id=s.schedule_type_id AND named_type.code IN ('reception','service'))
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
          AND NOT EXISTS(SELECT 1 FROM public.ref_code_opening_schedule_type named_type WHERE named_type.id=s.schedule_type_id AND named_type.code IN ('reception','service'))
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
        AND NOT EXISTS(SELECT 1 FROM public.ref_code_opening_schedule_type named_type WHERE named_type.id=s.schedule_type_id AND named_type.code IN ('reception','service'))
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


COMMIT;
NOTIFY pgrst,'reload schema';
