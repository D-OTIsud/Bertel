-- test_iti_stage_geom_roundtrip.sql
-- §111 Section 06 ITI — Phase A3 (save_object_itinerary_nested now persists object_iti_stage.geom
-- from lng/lat instead of skipping it; extra.kind carries the stage type) + Phase A4
-- (get_object_resource.itinerary_details emits track_geojson + per-stage lng/lat, and drops the
-- raw geom hex). Asserts the full write -> read round-trip on a published ITI (so the read gate
-- admits it). Self-contained + transactional (ROLLBACK).
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_obj text := 'ITIRUN9999999811';
  v_uid uuid := '00000000-0000-4000-a000-00000000ab11';  -- platform super_admin
  v_res jsonb; v_resource jsonb; v_stage jsonb; v_track jsonb;
  v_geom_ndims int;
BEGIN
  -- ---------- Fixture (published so get_object_resource read gate admits it) ----------
  INSERT INTO object (id, object_type, name, status) VALUES (v_obj, 'ITI', 'stage geom roundtrip', 'published');
  INSERT INTO auth.users (id, email) VALUES (v_uid, 'stage_rt@test.local');
  INSERT INTO app_user_profile (id, role) VALUES (v_uid, 'super_admin')
    ON CONFLICT (id) DO UPDATE SET role = 'super_admin';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role','authenticated')::text, true);

  -- ---------- Trace (so track_geojson has something to emit) ----------
  PERFORM api.set_itinerary_track(v_obj, jsonb_build_object('geojson', jsonb_build_object(
    'type', 'LineString', 'coordinates', jsonb_build_array(
      jsonb_build_array(55.50, -21.00, 100), jsonb_build_array(55.53, -21.00, 200)))));

  -- ---------- Stage with a GPS point + a kind (A3) ----------
  v_res := api.save_object_itinerary_nested(v_obj, jsonb_build_object('stages', jsonb_build_array(
    jsonb_build_object('name', 'Panorama', 'position', '1',
                       'extra', jsonb_build_object('kind', 'panorama'),
                       'lng', 55.515, 'lat', -21.00))));
  -- geom is no longer in the skipped_fields list
  ASSERT NOT (COALESCE(v_res->'skipped_fields', '[]'::jsonb) @> '["object_iti_stage.geom"]'::jsonb),
    'object_iti_stage.geom must NOT be skipped anymore; skipped_fields=' || COALESCE((v_res->'skipped_fields')::text,'[]');

  SELECT ST_NDims(geom::extensions.geometry) INTO v_geom_ndims
    FROM object_iti_stage WHERE object_id = v_obj AND extra->>'kind' = 'panorama';
  ASSERT v_geom_ndims = 2, 'stage geom stored as a 2D POINT; got ndims=' || COALESCE(v_geom_ndims::text,'NULL');

  -- ---------- Read emission (A4) ----------
  v_resource := api.get_object_resource(v_obj)::jsonb;
  v_track := v_resource #> '{itinerary_details,track_geojson}';
  ASSERT v_track IS NOT NULL AND v_track->>'type' = 'LineString',
    'itinerary_details.track_geojson must be a LineString; got ' || COALESCE(v_track::text,'NULL');

  v_stage := (v_resource #> '{itinerary_details,stages}') -> 0;
  ASSERT v_stage IS NOT NULL, 'stage must be emitted in itinerary_details.stages';
  ASSERT (v_stage->>'lng')::numeric BETWEEN 55.51 AND 55.52,
    'stage lng must be emitted; got ' || COALESCE(v_stage->>'lng','NULL');
  ASSERT (v_stage->>'lat')::numeric BETWEEN -21.01 AND -20.99,
    'stage lat must be emitted; got ' || COALESCE(v_stage->>'lat','NULL');
  ASSERT (v_stage #>> '{extra,kind}') = 'panorama',
    'stage kind must round-trip via extra.kind; got ' || COALESCE(v_stage #>> '{extra,kind}','NULL');
  ASSERT NOT (v_stage ? 'geom'),
    'the raw geom hex must be dropped from the stage payload (lng/lat replace it)';

  -- ---------- A stage without a point stores NULL geom, no lng/lat ----------
  PERFORM api.save_object_itinerary_nested(v_obj, jsonb_build_object('stages', jsonb_build_array(
    jsonb_build_object('name', 'Sans point', 'position', '1'))));
  ASSERT EXISTS (SELECT 1 FROM object_iti_stage WHERE object_id = v_obj AND name = 'Sans point' AND geom IS NULL),
    'a stage without lng/lat stores NULL geom';

  RAISE NOTICE 'ITI stage geom + read-emission round-trip assertions passed.';
END$$;
ROLLBACK;
