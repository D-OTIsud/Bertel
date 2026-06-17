-- =====================================================================
-- migration_opening_period_recurrence.sql  (manifest step 14n)
-- Périodes d'ouverture : récurrence explicite + cascade de priorité.
--
-- Modèle (dérivé du triplet existant + 1 booléen is_closure) :
--   base   = all_years=TRUE,  dates NULL,     is_closure=FALSE
--   cyclic = all_years=TRUE,  dates présentes, is_closure=FALSE   (année-sentinelle 2000 ; wrap → 2001)
--   fixed  = all_years=FALSE, dates présentes, is_closure=FALSE
--   closure= is_closure=TRUE  (cyclique ou fixe)
-- Cascade de priorité : closure(4) > fixed(3) > cyclic(2) > base(1) ; à rang égal la
-- fenêtre la plus étroite gagne. refresh_open_status retient la période active la plus
-- spécifique ; une fermeture active force fermé.
--
-- Additif, idempotent, réversible. Voir docs/specs/2026-06-17-opening-periods-recurrence-design.md
-- =====================================================================

-- 1) Couche "fermeture" : un seul booléen. Une fermeture (cyclique ou fixe)
--    surcharge toute période ouverte pour les dates qu'elle couvre.
ALTER TABLE public.opening_period
  ADD COLUMN IF NOT EXISTS is_closure BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_opening_period_is_closure
  ON public.opening_period (object_id) WHERE is_closure;

-- 2) Rang de priorité (closure 4 > fixe 3 > cyclique 2 > base 1).
CREATE OR REPLACE FUNCTION api.opening_period_rank(
  p_is_closure BOOLEAN,
  p_all_years  BOOLEAN,
  p_date_start DATE,
  p_date_end   DATE
)
RETURNS INTEGER
LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog, public, api
AS $$
  SELECT CASE
    WHEN COALESCE(p_is_closure, FALSE) THEN 4
    WHEN COALESCE(p_all_years, FALSE) = FALSE AND (p_date_start IS NOT NULL OR p_date_end IS NOT NULL) THEN 3
    WHEN COALESCE(p_all_years, FALSE) = TRUE  AND (p_date_start IS NOT NULL OR p_date_end IS NOT NULL) THEN 2
    ELSE 1
  END;
$$;

-- 3) Largeur de fenêtre en "jours" (à rang égal, la plus étroite gagne).
--    Cyclique : durée MM-JJ (approx. mois*31+jour, monotone) avec wrap. Fixe : date_end - date_start.
--    Base / sans dates : 100000 (∞, la plus large).
CREATE OR REPLACE FUNCTION api.opening_period_width(
  p_all_years  BOOLEAN,
  p_date_start DATE,
  p_date_end   DATE
)
RETURNS INTEGER
LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog, public, api
AS $$
  SELECT CASE
    WHEN p_date_start IS NULL OR p_date_end IS NULL THEN 100000
    WHEN COALESCE(p_all_years, FALSE) THEN
      ((to_char(p_date_end,'MM')::int - 1) * 31 + to_char(p_date_end,'DD')::int)
      - ((to_char(p_date_start,'MM')::int - 1) * 31 + to_char(p_date_start,'DD')::int)
      + CASE WHEN to_char(p_date_end,'MMDD') < to_char(p_date_start,'MMDD') THEN 372 ELSE 0 END
    ELSE (p_date_end - p_date_start)
  END;
$$;

-- 4) Validation anti-chevauchement (même rang : croisement partiel interdit, imbrication tolérée).
--    Fermetures exclues, périodes sans dates ignorées. Miroir SQL EXACT de la fonction pure
--    TS periodsPartialOverlap : intersection ensembliste des jours couverts.
CREATE OR REPLACE FUNCTION api._covered_days(p_all_years BOOLEAN, p_s DATE, p_e DATE)
RETURNS int[]
LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog, public, api
AS $$
  -- Cyclique (p_all_years=TRUE) : jour-de-l'an MM*31+JJ sur 1..372, wrap (>372) replié.
  -- Fixe : jours epoch (date - 2000-01-01). Même rang ⇒ même p_all_years des deux côtés.
  WITH bounds AS (
    SELECT
      CASE WHEN p_all_years THEN (to_char(p_s,'MM')::int-1)*31 + to_char(p_s,'DD')::int
           ELSE (p_s - DATE '2000-01-01') END AS lo,
      CASE WHEN p_all_years THEN (to_char(p_e,'MM')::int-1)*31 + to_char(p_e,'DD')::int
                  + CASE WHEN to_char(p_e,'MMDD') < to_char(p_s,'MMDD') THEN 372 ELSE 0 END
           ELSE (p_e - DATE '2000-01-01') END AS hi
  )
  SELECT array_agg(DISTINCT CASE WHEN p_all_years AND d > 372 THEN d - 372 ELSE d END)
  FROM bounds, generate_series(bounds.lo, bounds.hi) AS d;
$$;

CREATE OR REPLACE FUNCTION api.periods_partial_overlap(
  p_all_years BOOLEAN, a_s DATE, a_e DATE, b_s DATE, b_e DATE
)
RETURNS boolean
LANGUAGE plpgsql IMMUTABLE
SET search_path = pg_catalog, public, api
AS $$
DECLARE
  a_days int[] := api._covered_days(p_all_years, a_s, a_e);
  b_days int[] := api._covered_days(p_all_years, b_s, b_e);
  inter int;
BEGIN
  IF array_length(a_days,1) IS NULL OR array_length(b_days,1) IS NULL THEN RETURN false; END IF;
  SELECT count(*) INTO inter FROM unnest(a_days) AS d WHERE d = ANY (b_days);
  IF inter = 0 THEN RETURN false; END IF;                               -- disjointes
  -- STRICTE containment tolérée (la plus étroite gagne) ; fenêtres identiques = conflit.
  IF (inter = array_length(a_days,1) AND array_length(a_days,1) < array_length(b_days,1))
     OR (inter = array_length(b_days,1) AND array_length(b_days,1) < array_length(a_days,1)) THEN
    RETURN false;
  END IF;
  RETURN true;                                                          -- croisement partiel OU fenêtres identiques
END;
$$;

CREATE OR REPLACE FUNCTION api.assert_no_period_overlap(p_periods jsonb)
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public, api
AS $$
DECLARE
  r record;
BEGIN
  -- Self-join sur les périodes datées non-fermeture de même rang ; pas de table temp.
  FOR r IN
    WITH np AS (
      SELECT
        row_number() OVER () AS idx,
        api.opening_period_rank(COALESCE((e->>'is_closure')::boolean,false), COALESCE((e->>'all_years')::boolean,false),
                                NULLIF(e->>'date_start','')::date, NULLIF(e->>'date_end','')::date) AS rank,
        COALESCE((e->>'all_years')::boolean,false) AS all_years,
        NULLIF(e->>'date_start','')::date AS ds,
        NULLIF(e->>'date_end','')::date AS de
      FROM jsonb_array_elements(COALESCE(p_periods,'[]'::jsonb)) AS e
      WHERE COALESCE((e->>'is_closure')::boolean,false) = false
        AND NULLIF(e->>'date_start','') IS NOT NULL
        AND NULLIF(e->>'date_end','')   IS NOT NULL
    )
    SELECT a.rank AS rank
    FROM np a JOIN np b ON b.idx > a.idx AND b.rank = a.rank
    WHERE api.periods_partial_overlap(a.all_years, a.ds, a.de, b.ds, b.de)
    LIMIT 1
  LOOP
    RAISE EXCEPTION 'opening_period overlap (rank %)', r.rank USING ERRCODE = '23514';
  END LOOP;
END;
$$;

-- 5) Moteur de statut : la période active la PLUS SPÉCIFIQUE gagne ; une fermeture active force fermé.
CREATE OR REPLACE FUNCTION api.refresh_open_status()
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
BEGIN
  WITH obj_now AS (
    SELECT o.id, ln.local_date, ln.local_time, ln.local_isodow
    FROM object o
    CROSS JOIN LATERAL api.get_local_now_for_timezone(o.business_timezone) ln
    WHERE o.status = 'published'
  ),
  active AS (
    SELECT n.id AS object_id, n.local_time, n.local_isodow,
           p.id AS period_id, p.is_closure,
           api.opening_period_rank(p.is_closure, p.all_years, p.date_start, p.date_end) AS rank,
           api.opening_period_width(p.all_years, p.date_start, p.date_end) AS width
    FROM obj_now n
    JOIN opening_period p ON p.object_id = n.id
    WHERE api.is_opening_period_active_on_date(p.all_years, p.date_start, p.date_end, n.local_date)
  ),
  closed_today AS (
    SELECT DISTINCT object_id FROM active WHERE is_closure
  ),
  winner AS (
    SELECT DISTINCT ON (object_id) object_id, period_id, local_time, local_isodow
    FROM active
    WHERE NOT is_closure
    ORDER BY object_id, rank DESC, width ASC, period_id
  ),
  open_state AS (
    SELECT o.id,
      CASE
        WHEN EXISTS (SELECT 1 FROM closed_today c WHERE c.object_id = o.id) THEN FALSE
        ELSE COALESCE((
          SELECT
            EXISTS (
              SELECT 1
              FROM opening_schedule s
              JOIN opening_time_period tp ON tp.schedule_id = s.id
              JOIN opening_time_period_weekday tpw ON tpw.time_period_id = tp.id
              JOIN ref_code_weekday wd ON wd.id = tpw.weekday_id
              JOIN opening_time_frame tf ON tf.time_period_id = tp.id
              WHERE s.period_id = w.period_id
                AND tp.closed = FALSE
                AND COALESCE(wd.dow_number, CASE wd.code
                  WHEN 'monday' THEN 1 WHEN 'tuesday' THEN 2 WHEN 'wednesday' THEN 3
                  WHEN 'thursday' THEN 4 WHEN 'friday' THEN 5 WHEN 'saturday' THEN 6
                  WHEN 'sunday' THEN 7 ELSE NULL END) = w.local_isodow
                AND (tf.start_time IS NULL OR tf.start_time <= w.local_time)
                AND (tf.end_time   IS NULL OR tf.end_time   >  w.local_time)
            )
            OR EXISTS (
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
                  WHEN 'sunday' THEN 7 ELSE NULL END) = w.local_isodow
                AND NOT EXISTS (SELECT 1 FROM opening_time_frame tf WHERE tf.time_period_id = tp.id)
            )
          FROM winner w WHERE w.object_id = o.id
        ), FALSE)
      END AS new_is_open_now
    FROM object o
    WHERE o.status = 'published'
  )
  UPDATE object o
  SET cached_is_open_now = s.new_is_open_now
  FROM open_state s
  WHERE o.id = s.id
    AND o.cached_is_open_now IS DISTINCT FROM s.new_is_open_now;
END;
$$;

-- 6) Écriture : valider l'absence de chevauchement + persister is_closure.
--    (Reprend api.save_object_openings de migration_opening_period_type.sql avec 2 changements.)
CREATE OR REPLACE FUNCTION api.save_object_openings(p_object_id text, p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, api, internal
AS $$
DECLARE
  v_counts jsonb := '{}'::jsonb;
  v_warnings text[] := ARRAY[]::text[];
  v_skipped text[] := ARRAY[]::text[];
  v_period jsonb;
  v_schedule jsonb;
  v_time_period jsonb;
  v_weekday jsonb;
  v_frame jsonb;
  v_period_id uuid;
  v_period_type_id uuid;
  v_schedule_id uuid;
  v_time_period_id uuid;
  v_schedule_type_id uuid;
  v_weekday_id uuid;
  v_deleted integer;
  v_inserted_periods integer := 0;
  v_inserted_schedules integer := 0;
  v_inserted_time_periods integer := 0;
  v_inserted_weekdays integer := 0;
  v_inserted_frames integer := 0;
BEGIN
  PERFORM internal.workspace_assert_can_write_object(p_object_id);
  p_payload := COALESCE(p_payload, '{}'::jsonb);

  IF NOT (p_payload ? 'periods') THEN
    RETURN internal.workspace_result(true, v_counts, v_skipped, v_warnings);
  END IF;

  -- Garde anti-chevauchement (rejette les croisements partiels de même couche).
  PERFORM api.assert_no_period_overlap(p_payload->'periods');

  DELETE FROM public.opening_period WHERE object_id = p_object_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  FOR v_period IN SELECT value FROM jsonb_array_elements(internal.workspace_jsonb_array(p_payload->'periods')) AS t(value) LOOP
    v_period_type_id := COALESCE(
      internal.workspace_uuid(v_period->>'period_type_id'),
      (SELECT id FROM public.ref_code_opening_period_type WHERE lower(code) = lower(v_period->>'period_type_code') LIMIT 1)
    );

    INSERT INTO public.opening_period (
      id, object_id, name, date_start, date_end, source_period_id, all_years, name_i18n, extra, period_type_id, is_closure
    )
    VALUES (
      COALESCE(internal.workspace_uuid(v_period->>'id'), gen_random_uuid()),
      p_object_id,
      NULLIF(v_period->>'name', ''),
      NULLIF(v_period->>'date_start', '')::date,
      NULLIF(v_period->>'date_end', '')::date,
      NULLIF(v_period->>'source_period_id', ''),
      COALESCE(NULLIF(v_period->>'all_years', '')::boolean, false),
      CASE WHEN jsonb_typeof(v_period->'name_i18n') = 'object' THEN v_period->'name_i18n' ELSE NULL END,
      internal.workspace_jsonb_object(v_period->'extra'),
      v_period_type_id,
      COALESCE(NULLIF(v_period->>'is_closure', '')::boolean, false)
    )
    RETURNING id INTO v_period_id;
    v_inserted_periods := v_inserted_periods + 1;

    FOR v_schedule IN SELECT value FROM jsonb_array_elements(internal.workspace_jsonb_array(v_period->'schedules')) AS t(value) LOOP
      v_schedule_type_id := COALESCE(
        internal.workspace_uuid(v_schedule->>'schedule_type_id'),
        (SELECT id FROM public.ref_code_opening_schedule_type WHERE lower(code) = lower(v_schedule->>'schedule_type_code') LIMIT 1),
        (SELECT id FROM public.ref_code_opening_schedule_type WHERE lower(code) = 'regular' LIMIT 1)
      );
      IF v_schedule_type_id IS NULL THEN
        RAISE EXCEPTION 'Unknown opening schedule type: %', v_schedule USING ERRCODE = '23503';
      END IF;

      INSERT INTO public.opening_schedule (
        id, period_id, schedule_type_id, name, note, name_i18n, note_i18n, extra
      )
      VALUES (
        COALESCE(internal.workspace_uuid(v_schedule->>'id'), gen_random_uuid()),
        v_period_id,
        v_schedule_type_id,
        NULLIF(v_schedule->>'name', ''),
        NULLIF(v_schedule->>'note', ''),
        CASE WHEN jsonb_typeof(v_schedule->'name_i18n') = 'object' THEN v_schedule->'name_i18n' ELSE NULL END,
        CASE WHEN jsonb_typeof(v_schedule->'note_i18n') = 'object' THEN v_schedule->'note_i18n' ELSE NULL END,
        internal.workspace_jsonb_object(v_schedule->'extra')
      )
      RETURNING id INTO v_schedule_id;
      v_inserted_schedules := v_inserted_schedules + 1;

      FOR v_time_period IN SELECT value FROM jsonb_array_elements(internal.workspace_jsonb_array(v_schedule->'time_periods')) AS t(value) LOOP
        INSERT INTO public.opening_time_period (id, schedule_id, closed, note)
        VALUES (
          COALESCE(internal.workspace_uuid(v_time_period->>'id'), gen_random_uuid()),
          v_schedule_id,
          COALESCE(NULLIF(v_time_period->>'closed', '')::boolean, false),
          NULLIF(v_time_period->>'note', '')
        )
        RETURNING id INTO v_time_period_id;
        v_inserted_time_periods := v_inserted_time_periods + 1;

        FOR v_weekday IN SELECT value FROM jsonb_array_elements(internal.workspace_jsonb_array(v_time_period->'weekdays')) AS t(value) LOOP
          v_weekday_id := COALESCE(
            internal.workspace_uuid(v_weekday->>'weekday_id'),
            (SELECT id FROM public.ref_code_weekday WHERE lower(code) = lower(v_weekday->>'weekday_code') LIMIT 1),
            (SELECT id FROM public.ref_code_weekday WHERE lower(code) = lower(v_weekday->>'code') LIMIT 1)
          );
          IF v_weekday_id IS NULL THEN
            RAISE EXCEPTION 'Unknown weekday reference: %', v_weekday USING ERRCODE = '23503';
          END IF;
          INSERT INTO public.opening_time_period_weekday (time_period_id, weekday_id)
          VALUES (v_time_period_id, v_weekday_id)
          ON CONFLICT (time_period_id, weekday_id) DO NOTHING;
          v_inserted_weekdays := v_inserted_weekdays + 1;
        END LOOP;

        FOR v_frame IN SELECT value FROM jsonb_array_elements(internal.workspace_jsonb_array(v_time_period->'time_frames')) AS t(value) LOOP
          INSERT INTO public.opening_time_frame (id, time_period_id, start_time, end_time, recurrence)
          VALUES (
            COALESCE(internal.workspace_uuid(v_frame->>'id'), gen_random_uuid()),
            v_time_period_id,
            NULLIF(v_frame->>'start_time', '')::time,
            NULLIF(v_frame->>'end_time', '')::time,
            NULLIF(v_frame->>'recurrence', '')::interval
          );
          v_inserted_frames := v_inserted_frames + 1;
        END LOOP;
      END LOOP;
    END LOOP;
  END LOOP;

  v_counts := jsonb_build_object(
    'opening_period_deleted', v_deleted,
    'opening_period_inserted', v_inserted_periods,
    'opening_schedule_inserted', v_inserted_schedules,
    'opening_time_period_inserted', v_inserted_time_periods,
    'opening_time_period_weekday_inserted', v_inserted_weekdays,
    'opening_time_frame_inserted', v_inserted_frames
  );

  RETURN internal.workspace_result(true, v_counts, v_skipped, v_warnings);
END;
$$;

-- 7) Lecture : émettre is_closure (+ all_years, period_type_code) pour le round-trip éditeur.
CREATE OR REPLACE FUNCTION api.build_opening_period_json(
  p_period_id UUID,
  p_object_id TEXT,
  p_date_start DATE,
  p_date_end DATE,
  p_order INTEGER DEFAULT 1
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
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
    'weekday_slots', COALESCE(v_weekday_slots, '{}'::jsonb)::json
  );
END;
$$;

-- 8) Retrait du type "Annuelle" : redondant avec le mode "Toute l'année".
--    Sûr : aucun opening_period.period_type_id ne le référence (vérifié live 2026-06-17 : 0 typé).
DELETE FROM public.ref_code rc
WHERE rc.domain = 'opening_period_type' AND rc.code = 'year_round'
  AND NOT EXISTS (SELECT 1 FROM public.opening_period op WHERE op.period_type_id = rc.id);
