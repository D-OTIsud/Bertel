-- §112 Markdown D2 phase F — object_iti_stage.description (inline tier).
-- Asserts: get_object_resource itinerary_details.stages strips the flat description + emits raw
-- description_md; the 4 flat exports (KML, GPX via build_iti_track, GPX via export_itinerary_gpx,
-- GeoJSON) carry the plain stage description and NEVER the markdown link URL.
--
-- Runs as superuser/service_role. It (a) temp-publishes the ITI object (the get_object_resource
-- authorize-once gate is published ∪ extended), and (b) disables a PRE-EXISTING broken object_iti
-- cache trigger for the txn — `regenerate_iti_track_cache()` calls a non-existent
-- ST_AsGPX(..., NULL, NULL) overload on a geom insert (42883), which blocks building a track
-- fixture. Both, plus every insert, roll back via the ROLLBACK_OK exception (no persisted change).
-- (The ST_AsGPX trigger bug is unrelated to §112 and is tracked separately.)
DO $$
DECLARE
  v_obj text; v_res jsonb; v_stage_j jsonb; v_kml text; v_gpx text; v_gpx2 text; v_geo json;
  v_md text := '## Sommet **panoramique** au [refuge](https://zorglubxyz.test)';
  v_plain text := 'Sommet panoramique au refuge';
BEGIN
  SELECT id INTO v_obj FROM object WHERE object_type='ITI' LIMIT 1;
  ASSERT v_obj IS NOT NULL, 'no ITI object on live to test against';
  EXECUTE 'ALTER TABLE object_iti DISABLE TRIGGER USER';
  INSERT INTO object_iti(object_id, geom)
  VALUES (v_obj, ST_SetSRID(ST_MakeLine(ARRAY[ST_MakePoint(55.5,-21.1), ST_MakePoint(55.6,-21.2)]),4326)::geography);
  INSERT INTO object_iti_stage(object_id, name, description, position, geom)
  VALUES (v_obj, 'ZZ Test stage', v_md, 9999, ST_SetSRID(ST_MakePoint(55.5,-21.1),4326)::geography);
  UPDATE object SET status='published' WHERE id=v_obj;

  -- Rich path: resource itinerary_details.stages
  v_res := api.get_object_resource(v_obj, ARRAY['fr'], 'none', '{}'::jsonb);
  SELECT s INTO v_stage_j FROM jsonb_array_elements(v_res->'itinerary_details'->'stages') s WHERE s->>'name'='ZZ Test stage';
  ASSERT v_stage_j IS NOT NULL, 'stage not in resource itinerary_details';
  ASSERT v_stage_j->>'description' = v_plain, format('resource flat not stripped: %s', v_stage_j->>'description');
  ASSERT v_stage_j->>'description_md' = v_md, 'resource description_md not raw';
  -- §112 I1: the stage editor is a plain string (never reads i18n) → the raw description_i18n
  -- must be subtracted from the resource block (no raw per-language Markdown in the payload/CSV).
  ASSERT NOT (v_stage_j ? 'description_i18n'), 'description_i18n leaked into resource stages block';

  -- Flat exports: plain text present, link URL never leaked
  v_kml := api.build_iti_track(v_obj, 'kml', TRUE);
  ASSERT v_kml IS NOT NULL AND position(v_plain IN v_kml) > 0 AND position('zorglubxyz' IN v_kml) = 0, 'KML stage description leak/absent';
  v_gpx := api.build_iti_track(v_obj, 'gpx', TRUE);
  ASSERT v_gpx IS NOT NULL AND position('zorglubxyz' IN v_gpx) = 0, 'GPX(build_iti_track) leak';
  v_gpx2 := api.export_itinerary_gpx(v_obj, TRUE, FALSE);
  ASSERT v_gpx2 IS NOT NULL AND position('zorglubxyz' IN v_gpx2) = 0, 'GPX(export_itinerary_gpx) leak';
  v_geo := api.get_itinerary_track_geojson(v_obj, FALSE, 0.0001);
  ASSERT v_geo IS NOT NULL AND position(v_plain IN v_geo::text) > 0 AND position('zorglubxyz' IN v_geo::text) = 0, 'GeoJSON stage description leak/absent';

  RAISE EXCEPTION 'ROLLBACK_OK';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'ROLLBACK_OK' THEN RAISE; END IF;
END $$;
