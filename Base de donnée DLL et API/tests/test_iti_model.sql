-- test_iti_model.sql
-- Regression test for the greenfield ITI model (object_iti has 0 rows in prod — verified 2026-06-04):
--   * duration_hours DECIMAL  ->  duration_min INTEGER (minutes)
--   * elevation_loss INTEGER added alongside the existing elevation_gain
-- Asserts the schema shape, that api.get_object_resource emits `duration_min` + `elevation_loss`
-- (and NOT `duration_hours`), and that the explorer itinerary filter keeps its PUBLIC contract in
-- HOURS (`duration_min_h` / `duration_max_h`) while converting to minutes internally (h * 60).
-- Run AFTER the full manifest (incl. migration_iti_duration_elevation.sql + updated api_views_functions.sql).
-- Self-contained + transactional (ROLLBACK; nothing persists). Against the OLD model it goes red on the schema shape.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_obj text := 'ITIRUN9999999901';
  v_iti jsonb;
  v_ids text[];
BEGIN
  -- ---------- Schema shape ----------
  ASSERT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='object_iti'
                   AND column_name='duration_min' AND data_type='integer'),
    'object_iti.duration_min (integer) is missing';
  ASSERT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='object_iti'
                   AND column_name='elevation_loss' AND data_type='integer'),
    'object_iti.elevation_loss (integer) is missing';
  ASSERT NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_schema='public' AND table_name='object_iti'
                       AND column_name='duration_hours'),
    'object_iti.duration_hours should have been dropped (greenfield retype to duration_min)';

  -- ---------- Fixture (connecting superuser; RLS bypassed) ----------
  INSERT INTO object (id, object_type, name, status)
    VALUES (v_obj, 'ITI', 'ITI model regression', 'published');
  INSERT INTO object_iti (object_id, distance_km, duration_min, difficulty_level,
                          elevation_gain, elevation_loss, is_loop)
    VALUES (v_obj, 8.5, 120, 3, 500, 480, false);

  -- ---------- get_object_resource emits duration_min + elevation_loss, never duration_hours ----------
  v_iti := (api.get_object_resource(v_obj))::jsonb -> 'itinerary';
  ASSERT v_iti IS NOT NULL, 'get_object_resource returned no itinerary block for an ITI object';
  ASSERT (v_iti->>'duration_min') = '120',
    format('itinerary.duration_min expected 120, got %s', v_iti->>'duration_min');
  ASSERT (v_iti->>'elevation_gain') = '500', 'itinerary.elevation_gain expected 500';
  ASSERT (v_iti->>'elevation_loss') = '480', 'itinerary.elevation_loss expected 480';
  ASSERT NOT (v_iti ? 'duration_hours'), 'itinerary must NOT expose duration_hours';

  -- ---------- Filter contract stays in HOURS, converts to minutes (120 min = 2 h) ----------
  SELECT array_agg(object_id) INTO v_ids
  FROM api.get_filtered_object_ids(
    p_filters := jsonb_build_object('itinerary', jsonb_build_object('duration_max_h', 1)),
    p_types   := ARRAY['ITI']::object_type[],
    p_status  := ARRAY['published']::object_status[]);
  ASSERT NOT (v_obj = ANY(COALESCE(v_ids, ARRAY[]::text[]))),
    'duration_max_h=1 (=60 min) must EXCLUDE a 120-min itinerary';

  SELECT array_agg(object_id) INTO v_ids
  FROM api.get_filtered_object_ids(
    p_filters := jsonb_build_object('itinerary', jsonb_build_object('duration_min_h', 1)),
    p_types   := ARRAY['ITI']::object_type[],
    p_status  := ARRAY['published']::object_status[]);
  ASSERT v_obj = ANY(COALESCE(v_ids, ARRAY[]::text[])),
    'duration_min_h=1 (=60 min) must INCLUDE a 120-min itinerary';

  RAISE NOTICE 'ITI model regression assertions passed.';
END$$;
ROLLBACK;
