-- =============================================================================
-- OPENING PERIODS — REPAIR DRAFT  (phase 1: structural collapse)
-- =============================================================================
-- STATUS  : *** NOT EXECUTED ***  *** DO NOT RUN AS-IS ***
-- DATE    : 2026-05-19
-- AUTHOR  : schema-workbench audit
-- PURPOSE : collapse the 257 broken `opening_period` rows imported from
--           `staging.opening_period_temp` (source sheet `form_j_h`) into 191
--           canonical periods, one per (object_id × source horaires_id), while
--           preserving every AM/PM slot as a sub-`opening_time_period` of a
--           single shared `opening_schedule`.
--
-- WHY     : the original migration created one full chain (period -> schedule
--           -> time_period -> time_frame) per source row. AM and PM slots that
--           share the same horaires_id ended up as separate periods with
--           placeholder names (`Berta v2 AM` / `Berta v2 PM`) and NULL dates.
--           See `opening-periods-migration-diagnostic.md` for details.
--
-- BEFORE EXECUTING:
--   1. Read `opening-periods-repair-plan.md`.
--   2. Run on a STAGING environment first with ROLLBACK in place.
--   3. Take a `pg_dump --data-only --table='public.opening_*'` backup.
--   4. Lock writes on opening_* tables for the duration of the transaction.
--
-- IDEMPOTENCY: re-running this script after a successful repair is a no-op
--              because the WHERE clauses filter on the legacy markers
--              (`name LIKE 'Berta v2 %%'`, `source_period_id LIKE '%%:am'/'%%:pm'`).
--
-- The transaction below uses ROLLBACK at the end. Switch to COMMIT only after
-- staging validation and explicit sign-off.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- Step 0 — pre-snapshot (read-only assertions)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_n_period    int;
  v_n_sched     int;
  v_n_tp        int;
  v_n_tf        int;
  v_n_tpw       int;
  v_n_horaires  int;
BEGIN
  SELECT COUNT(*) INTO v_n_period   FROM public.opening_period;
  SELECT COUNT(*) INTO v_n_sched    FROM public.opening_schedule;
  SELECT COUNT(*) INTO v_n_tp       FROM public.opening_time_period;
  SELECT COUNT(*) INTO v_n_tf       FROM public.opening_time_frame;
  SELECT COUNT(*) INTO v_n_tpw      FROM public.opening_time_period_weekday;
  SELECT COUNT(DISTINCT split_part(source_period_id,':',1)||'-'||object_id)
    INTO v_n_horaires
    FROM public.opening_period;

  RAISE NOTICE 'BEFORE: period=%, sched=%, tp=%, tf=%, tpw=%, horaires=%',
               v_n_period, v_n_sched, v_n_tp, v_n_tf, v_n_tpw, v_n_horaires;

  IF v_n_period <> 257 THEN
    RAISE EXCEPTION 'Expected 257 opening_period rows before repair, found %', v_n_period;
  END IF;
  IF v_n_tpw <> 1051 THEN
    RAISE EXCEPTION 'Expected 1051 opening_time_period_weekday rows before repair, found %', v_n_tpw;
  END IF;
END$$;

-- -----------------------------------------------------------------------------
-- Step 1 — lock target tables to block concurrent writes during repair
-- -----------------------------------------------------------------------------
LOCK TABLE public.opening_period                IN EXCLUSIVE MODE;
LOCK TABLE public.opening_schedule              IN EXCLUSIVE MODE;
LOCK TABLE public.opening_time_period           IN EXCLUSIVE MODE;
LOCK TABLE public.opening_time_frame            IN EXCLUSIVE MODE;
LOCK TABLE public.opening_time_period_weekday   IN EXCLUSIVE MODE;

-- -----------------------------------------------------------------------------
-- Step 2 — capture current legacy rows in a temp working set
-- -----------------------------------------------------------------------------
CREATE TEMP TABLE _legacy_rows ON COMMIT DROP AS
SELECT
  p.id              AS old_period_id,
  p.object_id,
  p.source_period_id,
  split_part(p.source_period_id, ':', 1) AS horaires_id,
  CASE
    WHEN p.source_period_id LIKE '%:am' THEN 'AM'
    WHEN p.source_period_id LIKE '%:pm' THEN 'PM'
    ELSE 'OTHER'
  END               AS slot_label,
  p.name            AS old_period_name,
  s.id              AS old_schedule_id,
  s.schedule_type_id,
  s.name            AS old_schedule_name,
  tp.id             AS old_time_period_id,
  tp.closed         AS tp_closed,
  tp.note           AS tp_note,
  tf.id             AS old_time_frame_id,
  tf.start_time,
  tf.end_time,
  tf.recurrence,
  p.all_years,
  p.date_start,
  p.date_end
FROM public.opening_period p
JOIN public.opening_schedule s    ON s.period_id    = p.id
JOIN public.opening_time_period tp ON tp.schedule_id = s.id
LEFT JOIN public.opening_time_frame tf ON tf.time_period_id = tp.id
WHERE p.name LIKE 'Berta v2 %'
   OR p.source_period_id LIKE '%:am'
   OR p.source_period_id LIKE '%:pm';

-- Sanity: should be 257 rows (one per legacy slot chain)
DO $$
DECLARE v_n int;
BEGIN
  SELECT COUNT(*) INTO v_n FROM _legacy_rows;
  RAISE NOTICE '_legacy_rows: %', v_n;
  IF v_n <> 257 THEN
    RAISE EXCEPTION 'Expected 257 legacy slot chains, found %', v_n;
  END IF;
END$$;

-- -----------------------------------------------------------------------------
-- Step 3 — build the new canonical periods (1 per object × horaires_id)
-- -----------------------------------------------------------------------------
CREATE TEMP TABLE _new_periods ON COMMIT DROP AS
SELECT
  uuid_generate_v4() AS new_period_id,
  lr.object_id,
  lr.horaires_id     AS new_source_period_id,
  -- schedule_type derived from the first slot (AM/PM jumeaux always share it)
  (SELECT lr2.schedule_type_id
     FROM _legacy_rows lr2
    WHERE lr2.object_id = lr.object_id
      AND lr2.horaires_id = lr.horaires_id
    ORDER BY lr2.slot_label  -- AM before PM, deterministic
    LIMIT 1) AS schedule_type_id
FROM _legacy_rows lr
GROUP BY lr.object_id, lr.horaires_id;

-- Sanity: should be 191 canonical periods
DO $$
DECLARE v_n int;
BEGIN
  SELECT COUNT(*) INTO v_n FROM _new_periods;
  RAISE NOTICE '_new_periods: %', v_n;
  IF v_n <> 191 THEN
    RAISE EXCEPTION 'Expected 191 canonical periods, found %', v_n;
  END IF;
END$$;

-- -----------------------------------------------------------------------------
-- Step 4 — insert canonical opening_period rows
-- -----------------------------------------------------------------------------
INSERT INTO public.opening_period
  (id, object_id, name, date_start, date_end, source_period_id,
   all_years, name_i18n, extra, created_at, updated_at)
SELECT
  np.new_period_id,
  np.object_id,
  NULL                        AS name,            -- canonical: no fake name
  NULL                        AS date_start,      -- source had none
  NULL                        AS date_end,
  np.new_source_period_id     AS source_period_id,
  true                        AS all_years,       -- source flagged all_years
  NULL                        AS name_i18n,
  jsonb_build_object(
    'legacy_repair', 'opening-periods-repair-2026-05-19',
    'source_sheet',  'form_j_h',
    'origin',        'berta_v2_csv_export'
  )                           AS extra,
  now(), now()
FROM _new_periods np;

-- -----------------------------------------------------------------------------
-- Step 5 — insert canonical opening_schedule rows (1 per new period)
-- -----------------------------------------------------------------------------
CREATE TEMP TABLE _new_schedules ON COMMIT DROP AS
SELECT
  uuid_generate_v4() AS new_schedule_id,
  np.new_period_id,
  np.schedule_type_id
FROM _new_periods np;

INSERT INTO public.opening_schedule
  (id, period_id, schedule_type_id, name, note, name_i18n, note_i18n, extra,
   created_at, updated_at)
SELECT
  ns.new_schedule_id,
  ns.new_period_id,
  ns.schedule_type_id,
  NULL, NULL, NULL, NULL,
  jsonb_build_object('legacy_repair', 'opening-periods-repair-2026-05-19'),
  now(), now()
FROM _new_schedules ns;

-- -----------------------------------------------------------------------------
-- Step 6 — for each legacy slot, create a new opening_time_period under the
--          shared new schedule, then a matching opening_time_frame and
--          recopy the opening_time_period_weekday associations.
-- -----------------------------------------------------------------------------
CREATE TEMP TABLE _slot_remap ON COMMIT DROP AS
SELECT
  lr.old_period_id,
  lr.old_schedule_id,
  lr.old_time_period_id,
  lr.old_time_frame_id,
  ns.new_schedule_id,
  uuid_generate_v4() AS new_time_period_id,
  uuid_generate_v4() AS new_time_frame_id,
  lr.slot_label,
  lr.tp_closed,
  lr.start_time,
  lr.end_time,
  lr.recurrence
FROM _legacy_rows lr
JOIN _new_periods np
  ON np.object_id          = lr.object_id
 AND np.new_source_period_id = lr.horaires_id
JOIN _new_schedules ns
  ON ns.new_period_id      = np.new_period_id;

-- Sanity: should be 257 (one per original slot)
DO $$
DECLARE v_n int;
BEGIN
  SELECT COUNT(*) INTO v_n FROM _slot_remap;
  RAISE NOTICE '_slot_remap: %', v_n;
  IF v_n <> 257 THEN
    RAISE EXCEPTION 'Expected 257 slot remaps, found %', v_n;
  END IF;
END$$;

-- 6a — new opening_time_period
INSERT INTO public.opening_time_period
  (id, schedule_id, closed, note, created_at, updated_at)
SELECT
  sr.new_time_period_id,
  sr.new_schedule_id,
  COALESCE(sr.tp_closed, false),
  sr.slot_label,             -- 'AM' or 'PM'
  now(), now()
FROM _slot_remap sr;

-- 6b — new opening_time_frame (only when the legacy slot had one)
INSERT INTO public.opening_time_frame
  (id, time_period_id, start_time, end_time, recurrence, created_at, updated_at)
SELECT
  sr.new_time_frame_id,
  sr.new_time_period_id,
  sr.start_time,
  sr.end_time,
  sr.recurrence,
  now(), now()
FROM _slot_remap sr
WHERE sr.old_time_frame_id IS NOT NULL;

-- 6c — recopy weekday associations to the NEW time_period_id
INSERT INTO public.opening_time_period_weekday
  (time_period_id, weekday_id, created_at, updated_at)
SELECT
  sr.new_time_period_id,
  tpw.weekday_id,
  now(), now()
FROM _slot_remap sr
JOIN public.opening_time_period_weekday tpw
  ON tpw.time_period_id = sr.old_time_period_id;

-- -----------------------------------------------------------------------------
-- Step 7 — delete legacy chains (CASCADE removes schedules / time_periods /
--          time_frames / weekday associations attached to the old periods)
-- -----------------------------------------------------------------------------
DELETE FROM public.opening_period
WHERE id IN (SELECT old_period_id FROM _legacy_rows);

-- -----------------------------------------------------------------------------
-- Step 8 — post-snapshot assertions
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_n_period    int;
  v_n_sched     int;
  v_n_tp        int;
  v_n_tf        int;
  v_n_tpw       int;
  v_n_legacy    int;
BEGIN
  SELECT COUNT(*) INTO v_n_period FROM public.opening_period;
  SELECT COUNT(*) INTO v_n_sched  FROM public.opening_schedule;
  SELECT COUNT(*) INTO v_n_tp     FROM public.opening_time_period;
  SELECT COUNT(*) INTO v_n_tf     FROM public.opening_time_frame;
  SELECT COUNT(*) INTO v_n_tpw    FROM public.opening_time_period_weekday;
  SELECT COUNT(*) INTO v_n_legacy FROM public.opening_period
    WHERE name LIKE 'Berta v2 %'
       OR source_period_id LIKE '%:am'
       OR source_period_id LIKE '%:pm';

  RAISE NOTICE 'AFTER : period=%, sched=%, tp=%, tf=%, tpw=%, legacy_remaining=%',
               v_n_period, v_n_sched, v_n_tp, v_n_tf, v_n_tpw, v_n_legacy;

  IF v_n_period <> 191 THEN
    RAISE EXCEPTION 'Expected 191 opening_period rows after repair, found %', v_n_period;
  END IF;
  IF v_n_sched <> 191 THEN
    RAISE EXCEPTION 'Expected 191 opening_schedule rows after repair, found %', v_n_sched;
  END IF;
  IF v_n_tp <> 257 THEN
    RAISE EXCEPTION 'Expected 257 opening_time_period rows after repair, found %', v_n_tp;
  END IF;
  IF v_n_tf <> 257 THEN
    RAISE EXCEPTION 'Expected 257 opening_time_frame rows after repair, found %', v_n_tf;
  END IF;
  IF v_n_tpw <> 1051 THEN
    RAISE EXCEPTION 'Expected 1051 opening_time_period_weekday rows after repair, found %', v_n_tpw;
  END IF;
  IF v_n_legacy <> 0 THEN
    RAISE EXCEPTION 'Expected 0 legacy rows after repair, found %', v_n_legacy;
  END IF;
END$$;

-- -----------------------------------------------------------------------------
-- Step 9 — finalize.
-- -----------------------------------------------------------------------------
-- For the staging dry-run leave ROLLBACK below.
-- For the real run, replace ROLLBACK with COMMIT (after explicit sign-off).
ROLLBACK;
-- COMMIT;

-- =============================================================================
-- END OF DRAFT — NOT EXECUTED
-- =============================================================================
