-- test_surface_base_front_fix.sql
-- Covers SURF1-3: activity contract, save_object_places reconcile (incl. coordinate range),
-- save_object_rooms full-column round-trip + atomicity.
-- Run after ci_fresh_apply (incl. SURF1/2/3). Transactional ROLLBACK fixture.

\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_owner uuid := '00000000-0000-4000-a000-000000000001';
  v_obj   text := 'SURFRUN9999999901';
  v_other text := 'SURFRUN9999999902';
  v_place uuid;
  v_media uuid;
  v_room  uuid;
  v_result jsonb;
  v_count integer;
BEGIN
  INSERT INTO auth.users (id, email) VALUES (v_owner, 'surface_fix_owner@test.local')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO app_user_profile (id, role) VALUES (v_owner, 'platform_superuser')
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;

  INSERT INTO object (id, object_type, name, status, created_by) VALUES
    (v_obj, 'ASC', 'Surface fix ASC', 'published', v_owner),
    (v_other, 'HEB', 'Surface fix HEB', 'published', v_owner);

  -- Activity: difficulty 1 and 5 accepted
  INSERT INTO object_act (object_id, duration_min, difficulty_level, guide_required, equipment_provided)
  VALUES (v_obj, 60, 1, true, false);
  UPDATE object_act SET difficulty_level = 5 WHERE object_id = v_obj;

  BEGIN
    UPDATE object_act SET difficulty_level = 0 WHERE object_id = v_obj;
    RAISE EXCEPTION 'difficulty 0 should have been rejected';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    UPDATE object_act SET difficulty_level = 6 WHERE object_id = v_obj;
    RAISE EXCEPTION 'difficulty 6 should have been rejected';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    UPDATE object_act SET equipment_provided_details = 'casque' WHERE object_id = v_obj AND equipment_provided = false;
    RAISE EXCEPTION 'equipment detail with false boolean should be rejected';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  UPDATE object_act SET equipment_provided = true, equipment_provided_details = 'Casque fourni' WHERE object_id = v_obj;

  -- Places: create place with media, save reconcile without media key preserves media
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  v_result := api.save_object_places(v_obj, jsonb_build_object('places', jsonb_build_array(
    jsonb_build_object('id', null, 'label', 'Depart', 'position', 0,
      'locations', jsonb_build_array(jsonb_build_object(
        'latitude', -21.0, 'longitude', 55.5, 'is_main_location', true, 'city', 'Saint-Denis'
      )),
      'descriptions', jsonb_build_array(jsonb_build_object(
        'description', 'Point de RDV', 'visibility', 'public', 'position', 0
      ))
    )
  )));
  ASSERT (v_result->>'success')::boolean, 'save_object_places insert failed';

  SELECT id INTO v_place FROM object_place WHERE object_id = v_obj AND label = 'Depart' LIMIT 1;
  ASSERT v_place IS NOT NULL, 'place not created';

  INSERT INTO media (id, place_id, media_type_id, url, is_published)
  SELECT gen_random_uuid(), v_place, id, 'https://example.test/place.jpg', true
    FROM ref_code_media_type WHERE code = 'photo' LIMIT 1
  RETURNING id INTO v_media;
  ASSERT v_media IS NOT NULL, 'fixture media not created';

  v_result := api.save_object_places(v_obj, jsonb_build_object('places', jsonb_build_array(
    jsonb_build_object('id', v_place, 'label', 'Depart renomme', 'position', 0,
      'locations', jsonb_build_array(jsonb_build_object(
        'latitude', -21.0, 'longitude', 55.5, 'is_main_location', true, 'city', 'Saint-Denis'
      )),
      'descriptions', jsonb_build_array(jsonb_build_object(
        'description', 'RDV maj', 'visibility', 'public', 'position', 0
      ))
    )
  )));
  SELECT count(*) INTO v_count FROM media WHERE place_id = v_place;
  ASSERT v_count = 1, 'place media must survive reconcile without media key';

  BEGIN
    v_result := api.save_object_places(v_obj, jsonb_build_object('places', jsonb_build_array(
      jsonb_build_object('id', v_place, 'label', 'Bad vis', 'position', 0,
        'descriptions', jsonb_build_array(jsonb_build_object('visibility', 'bogus'))
      )
    )));
    RAISE EXCEPTION 'invalid visibility should rollback';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  SELECT count(*) INTO v_count FROM object_place WHERE object_id = v_obj;
  ASSERT v_count = 1, 'invalid visibility must not delete places';

  -- Out-of-range coordinates must rollback (SURF2 hardening)
  BEGIN
    v_result := api.save_object_places(v_obj, jsonb_build_object('places', jsonb_build_array(
      jsonb_build_object('id', v_place, 'label', 'Bad coords', 'position', 0,
        'locations', jsonb_build_array(jsonb_build_object('latitude', 200, 'longitude', 55.5))
      )
    )));
    RAISE EXCEPTION 'out-of-range coordinates should rollback';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  SELECT count(*) INTO v_count FROM object_place WHERE object_id = v_obj;
  ASSERT v_count = 1, 'invalid coordinates must not delete places';
  ASSERT (SELECT label FROM object_place WHERE id = v_place) = 'Depart renomme',
         'invalid coordinates must not partially update the place';

  -- Rooms on HEB object: full column round-trip (SURF3)
  v_result := api.save_object_rooms(v_other, jsonb_build_object('rooms', jsonb_build_array(
    jsonb_build_object(
      'code', 'dbl-1', 'name', 'Double', 'name_i18n', jsonb_build_object('en', 'Double room'),
      'description', 'Chambre double avec vue mer', 'description_i18n', jsonb_build_object('en', 'Double room with sea view'),
      'room_type_code', 'double',
      'capacity_adults', 2, 'capacity_children', 1, 'capacity_total', 3,
      'size_sqm', 24.5, 'bed_config', '1 lit double', 'bed_config_i18n', jsonb_build_object('en', '1 double bed'),
      'total_rooms', 3, 'floor_level', 2, 'base_price', 89.90, 'currency', 'EUR',
      'is_accessible', true, 'is_published', false,
      'amenity_codes', jsonb_build_array(), 'media_ids', jsonb_build_array(),
      'beds', jsonb_build_array(jsonb_build_object('bed_type_code', 'queen', 'quantity', 1))
    )
  )));
  ASSERT (v_result->>'success')::boolean, 'save_object_rooms insert failed';

  SELECT id INTO v_room FROM object_room_type WHERE object_id = v_other AND code = 'dbl-1';
  ASSERT v_room IS NOT NULL, 'room not created';

  ASSERT (SELECT name_i18n->>'en' FROM object_room_type WHERE id = v_room) = 'Double room',
         'name_i18n must round-trip';
  ASSERT (SELECT description FROM object_room_type WHERE id = v_room) = 'Chambre double avec vue mer',
         'description must round-trip';
  ASSERT (SELECT description_i18n->>'en' FROM object_room_type WHERE id = v_room) = 'Double room with sea view',
         'description_i18n must round-trip';
  ASSERT (SELECT capacity_adults FROM object_room_type WHERE id = v_room) = 2,
         'capacity_adults must round-trip';
  ASSERT (SELECT capacity_children FROM object_room_type WHERE id = v_room) = 1,
         'capacity_children must round-trip';
  ASSERT (SELECT size_sqm FROM object_room_type WHERE id = v_room) = 24.5,
         'size_sqm must round-trip';
  ASSERT (SELECT bed_config FROM object_room_type WHERE id = v_room) = '1 lit double',
         'bed_config must round-trip';
  ASSERT (SELECT bed_config_i18n->>'en' FROM object_room_type WHERE id = v_room) = '1 double bed',
         'bed_config_i18n must round-trip';
  ASSERT (SELECT floor_level FROM object_room_type WHERE id = v_room) = 2,
         'floor_level must round-trip';
  ASSERT (SELECT base_price FROM object_room_type WHERE id = v_room) = 89.90,
         'base_price must round-trip';
  ASSERT (SELECT currency FROM object_room_type WHERE id = v_room) = 'EUR',
         'currency must round-trip';
  ASSERT (SELECT is_accessible FROM object_room_type WHERE id = v_room) = true,
         'is_accessible must round-trip';
  ASSERT (SELECT is_published FROM object_room_type WHERE id = v_room) = false,
         'is_published must round-trip';
  ASSERT (SELECT count(*) FROM object_room_type_bed WHERE room_type_id = v_room) = 1,
         'bed must round-trip';

  BEGIN
    v_result := api.save_object_rooms(v_other, jsonb_build_object('rooms', jsonb_build_array(
      jsonb_build_object(
        'id', v_room, 'code', 'dbl-1', 'name', 'Double',
        'beds', jsonb_build_array(jsonb_build_object('bed_type_code', 'nonexistent_bed', 'quantity', 1))
      )
    )));
    RAISE EXCEPTION 'invalid bed should rollback entire save_object_rooms';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%bed_type_code%' AND SQLERRM NOT LIKE '%Unknown bed_type_code%' THEN
      RAISE;
    END IF;
  END;

  SELECT count(*) INTO v_count FROM object_room_type WHERE object_id = v_other;
  ASSERT v_count = 1, 'failed room save must leave existing rooms intact';
  ASSERT (SELECT capacity_adults FROM object_room_type WHERE id = v_room) = 2,
         'failed room save must not partially overwrite the existing room';

  RESET ROLE;

  -- anon cannot execute write RPCs
  PERFORM set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  SET LOCAL ROLE anon;
  ASSERT NOT has_function_privilege('anon', 'api.save_object_rooms(text, jsonb)', 'EXECUTE'),
         'anon must not execute save_object_rooms';
  ASSERT NOT has_function_privilege('anon', 'api.save_object_places(text, jsonb)', 'EXECUTE'),
         'anon must not execute save_object_places';
  RESET ROLE;
END $$;

ROLLBACK;
