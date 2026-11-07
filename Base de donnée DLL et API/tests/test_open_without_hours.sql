-- test_open_without_hours.sql
-- Proves migration_opening_open_without_hours.sql (§93, manifest step 14p):
-- api.get_opening_slots_by_day emits ONLY open days; an open day with no time frames ⇒ []
-- (= open without fixed hours, hôtel/location); closed/absent days are omitted.
-- Run AFTER the full manifest. Self-contained + transactional (ROLLBACK; nothing persists).
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_obj    text := 'OPNOHR9999990001';
  v_period uuid := gen_random_uuid();
  v_sched  uuid := gen_random_uuid();
  v_tp_mon uuid := gen_random_uuid();
  v_tp_wed uuid := gen_random_uuid();
  v_out    jsonb;
BEGIN
  INSERT INTO object (id, object_type, name, status)
    VALUES (v_obj, 'ACT', 'open-no-hours test', 'draft');
  INSERT INTO opening_period (id, object_id, name, all_years)
    VALUES (v_period, v_obj, 'Test', true);
  INSERT INTO opening_schedule (id, period_id, schedule_type_id)
    VALUES (v_sched, v_period,
            (SELECT id FROM ref_code_opening_schedule_type WHERE lower(code) = 'regular' LIMIT 1));

  -- monday: OPEN with hours
  INSERT INTO opening_time_period (id, schedule_id, closed) VALUES (v_tp_mon, v_sched, FALSE);
  INSERT INTO opening_time_period_weekday (time_period_id, weekday_id)
    VALUES (v_tp_mon, (SELECT id FROM ref_code_weekday WHERE lower(code) = 'monday'));
  INSERT INTO opening_time_frame (id, time_period_id, start_time, end_time)
    VALUES (gen_random_uuid(), v_tp_mon, '09:00', '12:00');

  -- wednesday: OPEN without hours (no time frame)
  INSERT INTO opening_time_period (id, schedule_id, closed) VALUES (v_tp_wed, v_sched, FALSE);
  INSERT INTO opening_time_period_weekday (time_period_id, weekday_id)
    VALUES (v_tp_wed, (SELECT id FROM ref_code_weekday WHERE lower(code) = 'wednesday'));

  -- tuesday: never added ⇒ closed / absent

  v_out := api.get_opening_slots_by_day(v_period);

  ASSERT v_out ? 'monday', 'monday (open with hours) must appear';
  ASSERT jsonb_array_length(v_out->'monday') = 1, 'monday must carry its single time frame';
  ASSERT v_out ? 'wednesday', 'wednesday (open without hours) must appear';
  ASSERT v_out->'wednesday' = '[]'::jsonb,
         'wednesday (open, no frames) must be [] = open without fixed hours';
  ASSERT NOT (v_out ? 'tuesday'), 'tuesday (closed/absent) must be omitted';

  RAISE NOTICE 'test_open_without_hours: OK';
END $$;
ROLLBACK;
