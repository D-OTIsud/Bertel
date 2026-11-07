-- migration_save_object_rooms.sql
-- Atomic reconcile writer for object_room_type + amenity/bed/media links.
-- SECURITY INVOKER, gated workspace_assert_can_write_object, full rollback on any error.

BEGIN;

CREATE OR REPLACE FUNCTION api.save_object_rooms(p_object_id text, p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, api, internal
AS $$
DECLARE
  v_counts jsonb := '{}'::jsonb;
  v_warnings text[] := ARRAY[]::text[];
  v_skipped text[] := ARRAY[]::text[];
  v_room jsonb;
  v_child jsonb;
  v_room_id uuid;
  v_id uuid;
  v_deleted integer := 0;
  v_inserted integer := 0;
  v_updated integer := 0;
  v_payload_ids uuid[] := ARRAY[]::uuid[];
  v_code text;
  v_codes text[] := ARRAY[]::text[];
  v_amenity_id uuid;
  v_bed_type_id uuid;
  v_view_type_id uuid;
  v_room_type_ref_id uuid;
  v_media_id uuid;
  v_qty integer;
  v_pos integer;
BEGIN
  PERFORM internal.workspace_assert_can_write_object(p_object_id);
  p_payload := COALESCE(p_payload, '{}'::jsonb);

  IF NOT (p_payload ? 'rooms') THEN
    RETURN internal.workspace_result(true, v_counts, v_skipped, v_warnings);
  END IF;

  PERFORM 1 FROM public.object WHERE id = p_object_id FOR UPDATE;

  -- ---------- Phase 1: validate ----------
  FOR v_room IN SELECT value FROM jsonb_array_elements(internal.workspace_jsonb_array(p_payload->'rooms')) AS t(value) LOOP
    v_room_id := internal.workspace_uuid(v_room->>'id');
    IF v_room_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.object_room_type rt WHERE rt.id = v_room_id AND rt.object_id = p_object_id
      ) THEN
        RAISE EXCEPTION 'Room % does not belong to object %', v_room_id, p_object_id USING ERRCODE = '23503';
      END IF;
      v_payload_ids := array_append(v_payload_ids, v_room_id);
    END IF;

    v_code := lower(NULLIF(v_room->>'code', ''));
    IF v_code IS NULL THEN
      RAISE EXCEPTION 'Room code is required' USING ERRCODE = '23502';
    END IF;
    IF v_code = ANY(v_codes) THEN
      RAISE EXCEPTION 'Duplicate room code in payload: %', v_room->>'code' USING ERRCODE = '23505';
    END IF;
    v_codes := array_append(v_codes, v_code);

    IF NULLIF(v_room->>'room_type_code', '') IS NOT NULL THEN
      SELECT id INTO v_room_type_ref_id FROM public.ref_code_room_type WHERE lower(code) = lower(v_room->>'room_type_code');
      IF v_room_type_ref_id IS NULL THEN
        RAISE EXCEPTION 'Unknown room_type_code: %', v_room->>'room_type_code' USING ERRCODE = '23503';
      END IF;
    END IF;

    IF NULLIF(v_room->>'view_type_code', '') IS NOT NULL THEN
      SELECT id INTO v_view_type_id FROM public.ref_code_view_type WHERE lower(code) = lower(v_room->>'view_type_code');
      IF v_view_type_id IS NULL THEN
        RAISE EXCEPTION 'Unknown view_type_code: %', v_room->>'view_type_code' USING ERRCODE = '23503';
      END IF;
    END IF;

    IF NULLIF(v_room->>'capacity_total', '') IS NOT NULL AND (v_room->>'capacity_total')::integer < 0 THEN
      RAISE EXCEPTION 'capacity_total must be >= 0' USING ERRCODE = '23514';
    END IF;
    IF NULLIF(v_room->>'total_rooms', '') IS NOT NULL AND (v_room->>'total_rooms')::integer < 0 THEN
      RAISE EXCEPTION 'total_rooms must be >= 0' USING ERRCODE = '23514';
    END IF;
    IF NULLIF(v_room->>'capacity_adults', '') IS NOT NULL AND (v_room->>'capacity_adults')::integer < 0 THEN
      RAISE EXCEPTION 'capacity_adults must be >= 0' USING ERRCODE = '23514';
    END IF;
    IF NULLIF(v_room->>'capacity_children', '') IS NOT NULL AND (v_room->>'capacity_children')::integer < 0 THEN
      RAISE EXCEPTION 'capacity_children must be >= 0' USING ERRCODE = '23514';
    END IF;
    IF NULLIF(v_room->>'size_sqm', '') IS NOT NULL AND (v_room->>'size_sqm')::numeric < 0 THEN
      RAISE EXCEPTION 'size_sqm must be >= 0' USING ERRCODE = '23514';
    END IF;
    IF NULLIF(v_room->>'base_price', '') IS NOT NULL AND (v_room->>'base_price')::numeric < 0 THEN
      RAISE EXCEPTION 'base_price must be >= 0' USING ERRCODE = '23514';
    END IF;

    FOR v_child IN SELECT value FROM jsonb_array_elements(internal.workspace_jsonb_array(v_room->'amenity_codes')) AS t(value) LOOP
      SELECT id INTO v_amenity_id FROM public.ref_amenity WHERE lower(code) = lower(trim(both '"' from v_child::text));
      IF v_amenity_id IS NULL THEN
        RAISE EXCEPTION 'Unknown amenity_code: %', v_child USING ERRCODE = '23503';
      END IF;
    END LOOP;

    FOR v_child IN SELECT value FROM jsonb_array_elements(internal.workspace_jsonb_array(v_room->'media_ids')) AS t(value) LOOP
      v_media_id := internal.workspace_uuid(trim(both '"' from v_child::text));
      IF v_media_id IS NULL THEN
        RAISE EXCEPTION 'Invalid media_id UUID: %', v_child USING ERRCODE = '22P02';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM public.media m
        WHERE m.id = v_media_id AND m.object_id = p_object_id
      ) THEN
        RAISE EXCEPTION 'Media % is not linked to object %', v_media_id, p_object_id USING ERRCODE = '23503';
      END IF;
    END LOOP;

    FOR v_child IN SELECT value FROM jsonb_array_elements(internal.workspace_jsonb_array(v_room->'beds')) AS t(value) LOOP
      SELECT id INTO v_bed_type_id FROM public.ref_code_bed_type WHERE lower(code) = lower(v_child->>'bed_type_code');
      IF v_bed_type_id IS NULL THEN
        RAISE EXCEPTION 'Unknown bed_type_code: %', v_child->>'bed_type_code' USING ERRCODE = '23503';
      END IF;
      v_qty := COALESCE(NULLIF(v_child->>'quantity', '')::integer, 1);
      IF v_qty <= 0 THEN
        RAISE EXCEPTION 'Bed quantity must be > 0' USING ERRCODE = '23514';
      END IF;
    END LOOP;
  END LOOP;

  -- ---------- Phase 2: delete rooms absent from payload ----------
  DELETE FROM public.object_room_type rt
   WHERE rt.object_id = p_object_id
     AND (cardinality(v_payload_ids) = 0 OR NOT (rt.id = ANY(v_payload_ids)));
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  -- ---------- Phase 3: upsert each room + replace children ----------
  FOR v_room IN SELECT value FROM jsonb_array_elements(internal.workspace_jsonb_array(p_payload->'rooms')) AS t(value) LOOP
    v_room_id := internal.workspace_uuid(v_room->>'id');

    SELECT id INTO v_room_type_ref_id
      FROM public.ref_code_room_type
     WHERE lower(code) = lower(NULLIF(v_room->>'room_type_code', ''))
     LIMIT 1;

    SELECT id INTO v_view_type_id
      FROM public.ref_code_view_type
     WHERE lower(code) = lower(NULLIF(v_room->>'view_type_code', ''))
     LIMIT 1;

    IF v_room_id IS NOT NULL THEN
      UPDATE public.object_room_type
         SET code = NULLIF(v_room->>'code', ''),
             name = COALESCE(NULLIF(v_room->>'name', ''), name),
             name_i18n = CASE WHEN jsonb_typeof(v_room->'name_i18n') = 'object' THEN v_room->'name_i18n' ELSE name_i18n END,
             description = NULLIF(v_room->>'description', ''),
             description_i18n = CASE WHEN jsonb_typeof(v_room->'description_i18n') = 'object' THEN v_room->'description_i18n' ELSE description_i18n END,
             room_type_id = v_room_type_ref_id,
             view_type_id = v_view_type_id,
             capacity_adults = NULLIF(v_room->>'capacity_adults', '')::integer,
             capacity_children = NULLIF(v_room->>'capacity_children', '')::integer,
             capacity_total = NULLIF(v_room->>'capacity_total', '')::integer,
             size_sqm = NULLIF(v_room->>'size_sqm', '')::numeric,
             bed_config = NULLIF(v_room->>'bed_config', ''),
             bed_config_i18n = CASE WHEN jsonb_typeof(v_room->'bed_config_i18n') = 'object' THEN v_room->'bed_config_i18n' ELSE bed_config_i18n END,
             total_rooms = COALESCE(NULLIF(v_room->>'total_rooms', '')::integer, total_rooms),
             floor_level = NULLIF(v_room->>'floor_level', '')::integer,
             base_price = NULLIF(v_room->>'base_price', '')::numeric,
             currency = COALESCE(NULLIF(v_room->>'currency', ''), currency),
             is_accessible = COALESCE(NULLIF(v_room->>'is_accessible', '')::boolean, false),
             is_published = COALESCE(NULLIF(v_room->>'is_published', '')::boolean, true),
             position = COALESCE(NULLIF(v_room->>'position', '')::integer, position),
             updated_at = now()
       WHERE id = v_room_id AND object_id = p_object_id;
      v_updated := v_updated + 1;
    ELSE
      INSERT INTO public.object_room_type (
        id, object_id, code, name, name_i18n, description, description_i18n,
        room_type_id, view_type_id, capacity_adults, capacity_children, capacity_total,
        size_sqm, bed_config, bed_config_i18n, total_rooms, floor_level, base_price,
        currency, is_accessible, is_published, position
      )
      VALUES (
        gen_random_uuid(),
        p_object_id,
        NULLIF(v_room->>'code', ''),
        COALESCE(NULLIF(v_room->>'name', ''), 'Unite'),
        CASE WHEN jsonb_typeof(v_room->'name_i18n') = 'object' THEN v_room->'name_i18n' ELSE NULL END,
        NULLIF(v_room->>'description', ''),
        CASE WHEN jsonb_typeof(v_room->'description_i18n') = 'object' THEN v_room->'description_i18n' ELSE NULL END,
        v_room_type_ref_id,
        v_view_type_id,
        NULLIF(v_room->>'capacity_adults', '')::integer,
        NULLIF(v_room->>'capacity_children', '')::integer,
        NULLIF(v_room->>'capacity_total', '')::integer,
        NULLIF(v_room->>'size_sqm', '')::numeric,
        NULLIF(v_room->>'bed_config', ''),
        CASE WHEN jsonb_typeof(v_room->'bed_config_i18n') = 'object' THEN v_room->'bed_config_i18n' ELSE NULL END,
        COALESCE(NULLIF(v_room->>'total_rooms', '')::integer, 1),
        NULLIF(v_room->>'floor_level', '')::integer,
        NULLIF(v_room->>'base_price', '')::numeric,
        COALESCE(NULLIF(v_room->>'currency', ''), 'EUR'),
        COALESCE(NULLIF(v_room->>'is_accessible', '')::boolean, false),
        COALESCE(NULLIF(v_room->>'is_published', '')::boolean, true),
        COALESCE(NULLIF(v_room->>'position', '')::integer, v_inserted + v_updated)
      )
      RETURNING id INTO v_room_id;
      v_inserted := v_inserted + 1;
    END IF;

    DELETE FROM public.object_room_type_amenity WHERE room_type_id = v_room_id;
    DELETE FROM public.object_room_type_bed WHERE room_type_id = v_room_id;
    DELETE FROM public.object_room_type_media WHERE room_type_id = v_room_id;

    FOR v_child IN SELECT DISTINCT lower(trim(both '"' from value::text)) AS code
                   FROM jsonb_array_elements(internal.workspace_jsonb_array(v_room->'amenity_codes')) AS t(value) LOOP
      SELECT id INTO v_amenity_id FROM public.ref_amenity WHERE lower(code) = v_child.code;
      INSERT INTO public.object_room_type_amenity (room_type_id, amenity_id)
      VALUES (v_room_id, v_amenity_id);
    END LOOP;

    v_pos := 0;
    FOR v_child IN SELECT value FROM jsonb_array_elements(internal.workspace_jsonb_array(v_room->'beds')) AS t(value) LOOP
      SELECT id INTO v_bed_type_id FROM public.ref_code_bed_type WHERE lower(code) = lower(v_child->>'bed_type_code');
      v_pos := COALESCE(NULLIF(v_child->>'position', '')::integer, v_pos + 1);
      INSERT INTO public.object_room_type_bed (room_type_id, bed_type_id, quantity, position)
      VALUES (
        v_room_id,
        v_bed_type_id,
        COALESCE(NULLIF(v_child->>'quantity', '')::integer, 1),
        v_pos
      );
    END LOOP;

    v_pos := 0;
    FOR v_child IN SELECT DISTINCT internal.workspace_uuid(trim(both '"' from value::text)) AS mid
                   FROM jsonb_array_elements(internal.workspace_jsonb_array(v_room->'media_ids')) AS t(value)
                   WHERE internal.workspace_uuid(trim(both '"' from value::text)) IS NOT NULL LOOP
      v_pos := v_pos + 1;
      INSERT INTO public.object_room_type_media (room_type_id, media_id, position)
      VALUES (v_room_id, v_child.mid, v_pos);
    END LOOP;
  END LOOP;

  v_counts := jsonb_build_object(
    'object_room_type_deleted', v_deleted,
    'object_room_type_inserted', v_inserted,
    'object_room_type_updated', v_updated
  );

  RETURN internal.workspace_result(true, v_counts, v_skipped, v_warnings);
END;
$$;

REVOKE ALL ON FUNCTION api.save_object_rooms(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.save_object_rooms(text, jsonb) TO authenticated, service_role;

COMMIT;
