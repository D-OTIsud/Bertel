-- =====================================================================
-- migration_opening_period_type.sql  (manifest step 14i)
-- §81 — Explicit, admin-extensible opening-period type.
--
-- Replaces the frontend label-inference of a period's "kind" with a real,
-- admin-managed vocabulary (Haute saison / Mi-saison / Hors saison / Annuelle,
-- extensible) + a typed FK column on opening_period, wired through the save RPC
-- and the read helper. Additive, idempotent, reversible.
--
-- The selected type DRIVES the date UI: a type flagged metadata.all_year = true
-- (Annuelle) means "open all year, no dates"; the others are dated. The flag —
-- not a hardcoded code — gates the date inputs, so an admin-added year-round type
-- behaves correctly without a frontend change.
-- =====================================================================

-- 1) Dedicated vocabulary partition of the partitioned ref_code table.
--    It is an FK target, so it carries the uq(id)/uq(code) the house pattern
--    requires (mirrors ref_code_opening_schedule_type) plus the ref_* RLS pair.
CREATE TABLE IF NOT EXISTS public.ref_code_opening_period_type
  PARTITION OF public.ref_code FOR VALUES IN ('opening_period_type');

CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_opening_period_type_id
  ON public.ref_code_opening_period_type (id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_opening_period_type_code
  ON public.ref_code_opening_period_type (code);
CREATE UNIQUE INDEX IF NOT EXISTS ref_code_opening_period_type_domain_code_idx
  ON public.ref_code_opening_period_type (domain, code);
CREATE INDEX IF NOT EXISTS ref_code_opening_period_type_domain_parent_id_idx
  ON public.ref_code_opening_period_type (domain, parent_id);

ALTER TABLE public.ref_code_opening_period_type ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pub_ref_code_read ON public.ref_code_opening_period_type;
CREATE POLICY pub_ref_code_read ON public.ref_code_opening_period_type
  FOR SELECT USING (true);
DROP POLICY IF EXISTS admin_ref_code_write ON public.ref_code_opening_period_type;
CREATE POLICY admin_ref_code_write ON public.ref_code_opening_period_type
  FOR ALL USING (auth.role() = ANY (ARRAY['service_role'::text, 'admin'::text]));

-- 2) Seed the four canonical types. Colour drives the ribbon/stripe; metadata.all_year
--    marks the "no dates" (year-round) types. Codes are lowercase-unaccented (chk_ref_code_code_normalized).
INSERT INTO public.ref_code (id, domain, code, name, name_i18n, position, is_active, is_assignable, metadata)
VALUES
  (gen_random_uuid(), 'opening_period_type', 'high_season', 'Haute saison',
     '{"en":"High season","es":"Temporada alta"}'::jsonb, 1, true, true, '{"color":"#176b6a"}'::jsonb),
  (gen_random_uuid(), 'opening_period_type', 'mid_season', 'Mi-saison',
     '{"en":"Mid season","es":"Media temporada"}'::jsonb, 2, true, true, '{"color":"#c08a3e"}'::jsonb),
  (gen_random_uuid(), 'opening_period_type', 'off_season', 'Hors saison',
     '{"en":"Off season","es":"Temporada baja"}'::jsonb, 3, true, true, '{"color":"#8a8f99"}'::jsonb),
  (gen_random_uuid(), 'opening_period_type', 'year_round', 'Annuelle',
     '{"en":"Year-round","es":"Todo el año"}'::jsonb, 4, true, true, '{"color":"#2f8f6b","all_year":true}'::jsonb)
ON CONFLICT (domain, code) DO NOTHING;

-- 3) Typed FK column on opening_period. Nullable: the 191 legacy periods stay valid
--    and the UI falls back to label-inference until they are edited (which requires a type).
ALTER TABLE public.opening_period
  ADD COLUMN IF NOT EXISTS period_type_id uuid
  REFERENCES public.ref_code_opening_period_type(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_opening_period_period_type_id
  ON public.opening_period (period_type_id);

-- 4) Write path: resolve period_type_code -> id and persist it (mirrors schedule_type).
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

  DELETE FROM public.opening_period WHERE object_id = p_object_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  FOR v_period IN SELECT value FROM jsonb_array_elements(internal.workspace_jsonb_array(p_payload->'periods')) AS t(value) LOOP
    -- Resolve the season/period type (nullable: legacy/optional; the editor requires it).
    v_period_type_id := COALESCE(
      internal.workspace_uuid(v_period->>'period_type_id'),
      (SELECT id FROM public.ref_code_opening_period_type WHERE lower(code) = lower(v_period->>'period_type_code') LIMIT 1)
    );

    INSERT INTO public.opening_period (
      id, object_id, name, date_start, date_end, source_period_id, all_years, name_i18n, extra, period_type_id
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
      v_period_type_id
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

-- 5) Read path: emit the period type code (+ all_years) so the editor round-trips.
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
BEGIN
  -- Unlimited slots per weekday (normalized model)
  v_weekday_slots := api.get_opening_slots_by_day(p_period_id);

  SELECT rc.code, op.all_years
    INTO v_period_type_code, v_all_years
    FROM public.opening_period op
    LEFT JOIN public.ref_code_opening_period_type rc ON rc.id = op.period_type_id
    WHERE op.id = p_period_id;

  -- Build the complete JSON in one go
  RETURN json_build_object(
    'id', p_period_id::text,
    'order', p_order,
    'object_id', p_object_id,
    'date_start', p_date_start,
    'date_end', p_date_end,
    'all_years', v_all_years,
    'period_type_code', v_period_type_code,
    'closed_days', '[]'::json,  -- No closed days in rich opening system
    'weekday_slots', COALESCE(v_weekday_slots, '{}'::jsonb)::json
  );
END;
$$;
