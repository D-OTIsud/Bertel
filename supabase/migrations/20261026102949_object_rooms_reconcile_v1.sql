-- migration_save_object_rooms.sql
-- Atomic reconcile writer for object_room_type + amenity/bed/media links.
-- SECURITY INVOKER, gated workspace_assert_can_write_object, full rollback on any error.
-- PREPARATION ONLY (2026-10-26): finalized local migration, not applied to live.
-- The contract marker rejects old tabs; it does NOT prove complete reads or prevent stale saves.
-- Install this one functional migration only after its coupled client and release checks.
-- Only explicit deleted_ids remove rooms; omitted rooms are never inferred deletions.
-- Do not replay the helpers source or the fresh-apply manifest against live.

BEGIN;
SET LOCAL lock_timeout = '500ms';
SET LOCAL statement_timeout = '5s';
SET LOCAL idle_in_transaction_session_timeout = '10s';

-- The read-only catalogue capture of 2026-10-26 confirms that this RPC is absent.
-- Do not overwrite a writer introduced since that capture without reviewing its source.
DO $rooms_source_guard$
BEGIN
  IF to_regprocedure('api.save_object_rooms(text,jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION 'save_object_rooms already exists: review its live definition before installing R'
      USING ERRCODE = '55000';
  END IF;
END;
$rooms_source_guard$;

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
  v_deleted_ids uuid[] := ARRAY[]::uuid[];
  v_code text;
  v_codes text[] := ARRAY[]::text[];
  v_amenity_id uuid;
  v_bed_type_id uuid;
  v_view_type_id uuid;
  v_room_type_ref_id uuid;
  v_media_id uuid;
  v_qty integer;
  v_pos integer;
  v_field text;
  v_value jsonb;
  v_child_ids uuid[];
  v_child_codes text[];
  v_affected bigint;
  v_expected bigint;
BEGIN
  PERFORM internal.workspace_assert_can_write_object(p_object_id);
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'rooms payload must be a JSON object' USING ERRCODE = '22023';
  END IF;
  IF p_payload->>'write_contract' IS DISTINCT FROM 'rooms-reconcile-v1' THEN
    RAISE EXCEPTION 'Unsupported rooms write contract; reload the editor' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_payload->'rooms') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'rooms must be an explicit JSON array' USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM public.object WHERE id = p_object_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Object cannot be locked for writing' USING ERRCODE = '42501';
  END IF;

  -- ---------- Phase 1: validate ----------
  FOR v_room IN SELECT value FROM jsonb_array_elements(internal.workspace_jsonb_array(p_payload->'rooms')) AS t(value) LOOP
    IF jsonb_typeof(v_room) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Each room must be a JSON object' USING ERRCODE = '22023';
    END IF;
    -- Required keys describe the proposed v1 snapshot, not proof that a loader read every row.
    IF NOT (v_room ?& ARRAY['id', 'code', 'name', 'name_i18n', 'description', 'description_i18n',
        'room_type_code', 'view_type_code', 'capacity_adults', 'capacity_children', 'capacity_total',
        'size_sqm', 'bed_config', 'bed_config_i18n', 'total_rooms', 'floor_level', 'base_price',
        'currency', 'is_accessible', 'is_published', 'position', 'amenity_codes', 'media_ids', 'beds']) THEN
      RAISE EXCEPTION 'Incomplete rooms-reconcile-v1 row' USING ERRCODE = '22023';
    END IF;
    FOREACH v_field IN ARRAY ARRAY['amenity_codes', 'media_ids', 'beds'] LOOP
      IF jsonb_typeof(v_room->v_field) IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'room.% must be a JSON array', v_field USING ERRCODE = '22023';
      END IF;
    END LOOP;
    FOR v_field, v_value IN SELECT key, value FROM jsonb_each(v_room) LOOP
      IF v_field = ANY(ARRAY['id', 'code', 'name', 'description', 'room_type_code', 'view_type_code',
                            'bed_config', 'currency']) AND jsonb_typeof(v_value) NOT IN ('string', 'null') THEN
        RAISE EXCEPTION 'room.% must be a string or null', v_field USING ERRCODE = '22023';
      ELSIF v_field = ANY(ARRAY['name_i18n', 'description_i18n', 'bed_config_i18n', 'extra'])
          AND jsonb_typeof(v_value) NOT IN ('object', 'null') THEN
        RAISE EXCEPTION 'room.% must be an object or null', v_field USING ERRCODE = '22023';
      ELSIF v_field = ANY(ARRAY['capacity_adults', 'capacity_children', 'capacity_total', 'total_rooms',
                              'floor_level', 'position']) THEN
        IF jsonb_typeof(v_value) NOT IN ('number', 'null') THEN
          RAISE EXCEPTION 'room.% must be an integer or null', v_field USING ERRCODE = '22023';
        END IF;
        PERFORM (v_room->>v_field)::integer;
      ELSIF v_field = ANY(ARRAY['size_sqm', 'base_price']) AND jsonb_typeof(v_value) NOT IN ('number', 'null') THEN
        RAISE EXCEPTION 'room.% must be a number or null', v_field USING ERRCODE = '22023';
      ELSIF v_field = ANY(ARRAY['is_accessible', 'is_published']) AND jsonb_typeof(v_value) NOT IN ('boolean', 'null') THEN
        RAISE EXCEPTION 'room.% must be a boolean or null', v_field USING ERRCODE = '22023';
      END IF;
    END LOOP;
    IF v_room->>'id' IS NOT NULL AND internal.workspace_uuid(v_room->>'id') IS NULL THEN
      RAISE EXCEPTION 'Invalid room id' USING ERRCODE = '22P02';
    END IF;
    v_room_id := internal.workspace_uuid(v_room->>'id');
    IF v_room_id IS NOT NULL THEN
      IF v_room_id = ANY(v_payload_ids) THEN
        RAISE EXCEPTION 'Duplicate room id' USING ERRCODE = '23505';
      END IF;
      -- A new draft may supply its stable UUID. Existing IDs cannot be moved to another object.
      IF EXISTS (
        SELECT 1 FROM public.object_room_type rt WHERE rt.id = v_room_id AND rt.object_id <> p_object_id
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

    v_child_codes := ARRAY[]::text[];
    FOR v_child IN SELECT value FROM jsonb_array_elements(internal.workspace_jsonb_array(v_room->'amenity_codes')) AS t(value) LOOP
      IF jsonb_typeof(v_child) IS DISTINCT FROM 'string' THEN
        RAISE EXCEPTION 'amenity_codes must contain strings' USING ERRCODE = '22023';
      END IF;
      v_code := lower(v_child #>> '{}');
      IF v_code = ANY(v_child_codes) THEN
        RAISE EXCEPTION 'Duplicate amenity code' USING ERRCODE = '23505';
      END IF;
      v_child_codes := array_append(v_child_codes, v_code);
      SELECT id INTO v_amenity_id FROM public.ref_amenity WHERE lower(code) = lower(trim(both '"' from v_child::text));
      IF v_amenity_id IS NULL THEN
        RAISE EXCEPTION 'Unknown amenity_code: %', v_child USING ERRCODE = '23503';
      END IF;
    END LOOP;

    v_child_ids := ARRAY[]::uuid[];
    FOR v_child IN SELECT value FROM jsonb_array_elements(internal.workspace_jsonb_array(v_room->'media_ids')) AS t(value) LOOP
      IF jsonb_typeof(v_child) IS DISTINCT FROM 'string' THEN
        RAISE EXCEPTION 'media_ids must contain UUID strings' USING ERRCODE = '22023';
      END IF;
      v_media_id := internal.workspace_uuid(trim(both '"' from v_child::text));
      IF v_media_id IS NULL THEN
        RAISE EXCEPTION 'Invalid media_id UUID: %', v_child USING ERRCODE = '22P02';
      END IF;
      IF v_media_id = ANY(v_child_ids) THEN
        RAISE EXCEPTION 'Duplicate room media id' USING ERRCODE = '23505';
      END IF;
      v_child_ids := array_append(v_child_ids, v_media_id);
      IF NOT EXISTS (
        SELECT 1 FROM public.media m
        WHERE m.id = v_media_id AND m.object_id = p_object_id
      ) THEN
        RAISE EXCEPTION 'Media % is not linked to object %', v_media_id, p_object_id USING ERRCODE = '23503';
      END IF;
    END LOOP;

    v_child_codes := ARRAY[]::text[];
    FOR v_child IN SELECT value FROM jsonb_array_elements(internal.workspace_jsonb_array(v_room->'beds')) AS t(value) LOOP
      IF jsonb_typeof(v_child) IS DISTINCT FROM 'object'
          OR jsonb_typeof(v_child->'bed_type_code') IS DISTINCT FROM 'string'
          OR jsonb_typeof(v_child->'quantity') IS DISTINCT FROM 'number'
          OR jsonb_typeof(v_child->'position') IS DISTINCT FROM 'number' THEN
        RAISE EXCEPTION 'Each bed needs a string type, integer quantity and integer position' USING ERRCODE = '22023';
      END IF;
      PERFORM (v_child->>'position')::integer;
      v_code := lower(v_child->>'bed_type_code');
      IF v_code = ANY(v_child_codes) THEN
        RAISE EXCEPTION 'Duplicate bed type' USING ERRCODE = '23505';
      END IF;
      v_child_codes := array_append(v_child_codes, v_code);
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

  -- Deletions are explicit. A missing/empty list does not delete another room,
  -- including one created after the client loaded its snapshot.
  IF p_payload ? 'deleted_ids' THEN
    IF jsonb_typeof(p_payload->'deleted_ids') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'deleted_ids must be a JSON array' USING ERRCODE = '22023';
    END IF;
    FOR v_child IN SELECT value FROM jsonb_array_elements(p_payload->'deleted_ids') AS t(value) LOOP
      IF jsonb_typeof(v_child) IS DISTINCT FROM 'string' THEN
        RAISE EXCEPTION 'deleted_ids must contain UUID strings' USING ERRCODE = '22023';
      END IF;
      v_id := internal.workspace_uuid(v_child #>> '{}');
      IF v_id IS NULL THEN
        RAISE EXCEPTION 'Invalid deleted room id' USING ERRCODE = '22P02';
      END IF;
      IF v_id = ANY(v_deleted_ids) THEN
        RAISE EXCEPTION 'Duplicate deleted room id' USING ERRCODE = '23505';
      END IF;
      IF v_id = ANY(v_payload_ids) THEN
        RAISE EXCEPTION 'Room cannot be kept and deleted in the same payload' USING ERRCODE = '22023';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM public.object_room_type rt WHERE rt.id = v_id AND rt.object_id = p_object_id
      ) THEN
        RAISE EXCEPTION 'Deleted room does not belong to object' USING ERRCODE = '23503';
      END IF;
      v_deleted_ids := array_append(v_deleted_ids, v_id);
    END LOOP;
  END IF;

  -- ---------- Phase 2: delete only explicitly requested rooms ----------
  v_expected := cardinality(v_deleted_ids);
  DELETE FROM public.object_room_type rt
   WHERE rt.object_id = p_object_id
     AND rt.id = ANY(v_deleted_ids);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted <> v_expected THEN
    RAISE EXCEPTION 'Incomplete room deletion; transaction cancelled' USING ERRCODE = '42501';
  END IF;

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

    IF v_room_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.object_room_type rt WHERE rt.id = v_room_id AND rt.object_id = p_object_id
    ) THEN
      UPDATE public.object_room_type
         SET code = NULLIF(v_room->>'code', ''),
             name = COALESCE(v_room->>'name', name),
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
             total_rooms = NULLIF(v_room->>'total_rooms', '')::integer,
             floor_level = NULLIF(v_room->>'floor_level', '')::integer,
             base_price = NULLIF(v_room->>'base_price', '')::numeric,
             currency = COALESCE(NULLIF(v_room->>'currency', ''), currency),
             is_accessible = NULLIF(v_room->>'is_accessible', '')::boolean,
             is_published = NULLIF(v_room->>'is_published', '')::boolean,
             position = NULLIF(v_room->>'position', '')::integer,
             extra = CASE WHEN v_room ? 'extra' THEN NULLIF(v_room->'extra', 'null'::jsonb) ELSE extra END,
             updated_at = now()
       WHERE id = v_room_id AND object_id = p_object_id;
      GET DIAGNOSTICS v_affected = ROW_COUNT;
      IF v_affected <> 1 THEN
        RAISE EXCEPTION 'Room update affected % rows; transaction cancelled', v_affected USING ERRCODE = '42501';
      END IF;
      v_updated := v_updated + v_affected;
    ELSE
      INSERT INTO public.object_room_type (
        id, object_id, code, name, name_i18n, description, description_i18n,
        room_type_id, view_type_id, capacity_adults, capacity_children, capacity_total,
        size_sqm, bed_config, bed_config_i18n, total_rooms, floor_level, base_price,
        currency, is_accessible, is_published, position, extra
      )
      VALUES (
        COALESCE(v_room_id, gen_random_uuid()),
        p_object_id,
        NULLIF(v_room->>'code', ''),
        COALESCE(v_room->>'name', ''),
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
        NULLIF(v_room->>'is_accessible', '')::boolean,
        NULLIF(v_room->>'is_published', '')::boolean,
        COALESCE(NULLIF(v_room->>'position', '')::integer, v_inserted + v_updated),
        NULLIF(v_room->'extra', 'null'::jsonb)
      )
      RETURNING id INTO v_room_id;
      v_inserted := v_inserted + 1;
    END IF;

    SELECT count(*) INTO v_expected FROM public.object_room_type_amenity WHERE room_type_id = v_room_id;
    DELETE FROM public.object_room_type_amenity WHERE room_type_id = v_room_id;
    GET DIAGNOSTICS v_affected = ROW_COUNT;
    IF v_affected <> v_expected THEN
      RAISE EXCEPTION 'Incomplete room amenity deletion; transaction cancelled' USING ERRCODE = '42501';
    END IF;
    SELECT count(*) INTO v_expected FROM public.object_room_type_bed WHERE room_type_id = v_room_id;
    DELETE FROM public.object_room_type_bed WHERE room_type_id = v_room_id;
    GET DIAGNOSTICS v_affected = ROW_COUNT;
    IF v_affected <> v_expected THEN
      RAISE EXCEPTION 'Incomplete room bed deletion; transaction cancelled' USING ERRCODE = '42501';
    END IF;
    SELECT count(*) INTO v_expected FROM public.object_room_type_media WHERE room_type_id = v_room_id;
    DELETE FROM public.object_room_type_media WHERE room_type_id = v_room_id;
    GET DIAGNOSTICS v_affected = ROW_COUNT;
    IF v_affected <> v_expected THEN
      RAISE EXCEPTION 'Incomplete room media deletion; transaction cancelled' USING ERRCODE = '42501';
    END IF;

    FOR v_child IN SELECT value
                   FROM jsonb_array_elements(v_room->'amenity_codes') AS t(value) LOOP
      SELECT id INTO v_amenity_id FROM public.ref_amenity WHERE lower(code) = lower(v_child #>> '{}');
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
    FOR v_child IN SELECT value FROM jsonb_array_elements(v_room->'media_ids') AS t(value) LOOP
      v_pos := v_pos + 1;
      INSERT INTO public.object_room_type_media (room_type_id, media_id, position)
      VALUES (v_room_id, internal.workspace_uuid(v_child #>> '{}'), v_pos);
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
