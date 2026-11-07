-- test_set_itinerary_track.sql
-- §111 Section 06 ITI — api.set_itinerary_track (GPX/KML trace ingestion + auto metrics).
-- Asserts: 3D LineString -> 2D geom stored (the column is geography(LineString,4326), no Z),
-- distance_km ≈ ST_Length, elevation_gain/loss from the Z deltas, object_iti_profile rebuilt,
-- the regenerate_iti_track_cache trigger no longer crashes (it invalidates the cache, ST_AsGPX
-- is not installed), geom serializes to GeoJSON for the map, and clearing nulls everything.
-- Also asserts the workspace_assert_can_write_object gate blocks an unauthorized caller.
-- Run AFTER the manifest (set_itinerary_track folded into api_views_functions.sql; trigger fix
-- folded into schema_unified.sql). Self-contained + transactional (ROLLBACK).
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_obj   text := 'ITIRUN9999999801';
  v_uid   uuid := '00000000-0000-4000-a000-0000000000d1';  -- platform super_admin
  v_other uuid := '00000000-0000-4000-a000-0000000000d2';  -- no write rights
  v_res   jsonb;
  v_geom_null boolean; v_ndims int; v_prof int; v_geojson text;
BEGIN
  -- ---------- Fixture ----------
  INSERT INTO object (id, object_type, name, status) VALUES (v_obj, 'ITI', 'set_track test', 'draft');
  INSERT INTO auth.users (id, email) VALUES (v_uid, 'settrack@test.local'), (v_other, 'other@test.local');
  INSERT INTO app_user_profile (id, role) VALUES (v_uid, 'super_admin'), (v_other, 'tourism_agent')
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;

  -- ---------- Authorized: ingest a 3D LineString (gain +130 / loss -30, ~3.1 km) ----------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role','authenticated')::text, true);
  v_res := api.set_itinerary_track(v_obj, jsonb_build_object('geojson', jsonb_build_object(
    'type', 'LineString',
    'coordinates', jsonb_build_array(
      jsonb_build_array(55.50, -21.00, 100),
      jsonb_build_array(55.51, -21.00, 150),
      jsonb_build_array(55.52, -21.00, 120),
      jsonb_build_array(55.53, -21.00, 200)
    ))));

  ASSERT (v_res->>'has_3d')::boolean = true, 'has_3d should be true; got ' || v_res::text;
  ASSERT (v_res->>'elevation_gain') = '130', 'elevation_gain expected 130, got ' || (v_res->>'elevation_gain');
  ASSERT (v_res->>'elevation_loss') = '30', 'elevation_loss expected 30, got ' || (v_res->>'elevation_loss');
  ASSERT (v_res->>'distance_km')::numeric BETWEEN 3.0 AND 3.3, 'distance_km ~3.1 expected, got ' || (v_res->>'distance_km');
  ASSERT (v_res->>'profile_points')::int = 4, 'profile_points expected 4, got ' || (v_res->>'profile_points');

  SELECT geom IS NULL, ST_NDims(geom::geometry), ST_AsGeoJSON(geom::geometry)
    INTO v_geom_null, v_ndims, v_geojson FROM object_iti WHERE object_id = v_obj;
  ASSERT NOT v_geom_null, 'geom must be written';
  ASSERT v_ndims = 2, 'stored geom must be 2D (column is geography(LineString,4326)), got ' || v_ndims;
  ASSERT v_geojson LIKE '%LineString%', 'geom must serialize to a GeoJSON LineString for the map';
  SELECT count(*) INTO v_prof FROM object_iti_profile WHERE object_id = v_obj;
  ASSERT v_prof = 4, 'object_iti_profile expected 4 rows, got ' || v_prof;

  -- ---------- 2D trace -> elevation NULL, no profile ----------
  v_res := api.set_itinerary_track(v_obj, jsonb_build_object('geojson', jsonb_build_object(
    'type', 'LineString',
    'coordinates', jsonb_build_array(
      jsonb_build_array(55.50, -21.00),
      jsonb_build_array(55.52, -21.00)
    ))));
  ASSERT (v_res->>'has_3d')::boolean = false, '2D trace should report has_3d=false';
  ASSERT (v_res->'elevation_gain') = 'null'::jsonb, '2D trace -> elevation_gain NULL';
  SELECT count(*) INTO v_prof FROM object_iti_profile WHERE object_id = v_obj;
  ASSERT v_prof = 0, '2D trace -> no profile rows, got ' || v_prof;

  -- ---------- Clear ----------
  v_res := api.set_itinerary_track(v_obj, '{"geojson": null}'::jsonb);
  SELECT geom IS NULL INTO v_geom_null FROM object_iti WHERE object_id = v_obj;
  ASSERT v_geom_null, 'geom must be cleared';
  SELECT count(*) INTO v_prof FROM object_iti_profile WHERE object_id = v_obj;
  ASSERT v_prof = 0, 'profile must be cleared';

  -- ---------- Unauthorized caller is blocked by the workspace gate ----------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_other, 'role','authenticated')::text, true);
  BEGIN
    PERFORM api.set_itinerary_track(v_obj, jsonb_build_object('geojson', jsonb_build_object(
      'type', 'LineString', 'coordinates', jsonb_build_array(
        jsonb_build_array(55.50, -21.00), jsonb_build_array(55.52, -21.00)))));
    RAISE EXCEPTION 'AUTHZ GUARD FAILED: unauthorized caller wrote the trace';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;  -- expected: 42501 from workspace_assert_can_write_object
  END;

  RAISE NOTICE 'set_itinerary_track assertions passed.';
END$$;
ROLLBACK;
