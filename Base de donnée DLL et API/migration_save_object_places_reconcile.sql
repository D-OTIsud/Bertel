-- migration_save_object_places_reconcile.sql
-- Replaces the destructive delete-all places arm of api.save_object_places with reconcile semantics:
-- update existing places by id, insert new ones, delete only absent ids; preserve place media unless
-- an explicit media array is supplied. Keeps the zones arm unchanged.
-- IDEMPOTENT (CREATE OR REPLACE). Depends on object_workspace_safe_write_rpcs.sql helpers.

BEGIN;

CREATE OR REPLACE FUNCTION api.save_object_places(p_object_id text, p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, api, internal
AS $$
DECLARE
  v_counts jsonb := '{}'::jsonb;
  v_warnings text[] := ARRAY[]::text[];
  v_skipped text[] := ARRAY[]::text[];
  v_place jsonb;
  v_row jsonb;
  v_place_id uuid;
  v_loc_id uuid;
  v_desc_id uuid;
  v_id uuid;
  v_deleted integer;
  v_inserted integer;
  v_updated integer;
  v_media_count integer;
  v_payload_ids uuid[] := ARRAY[]::uuid[];
  v_existing_ids uuid[];
  v_visibility text;
  v_lat numeric;
  v_lng numeric;
  v_has_lat boolean;
  v_has_lng boolean;
BEGIN
  PERFORM internal.workspace_assert_can_write_object(p_object_id);
  p_payload := COALESCE(p_payload, '{}'::jsonb);

  IF p_payload ? 'places' THEN
    -- Lock the object row for the duration of the reconcile.
    PERFORM 1 FROM public.object WHERE id = p_object_id FOR UPDATE;

    -- ---------- Phase 1: validate entire payload before any mutation ----------
    FOR v_place IN SELECT value FROM jsonb_array_elements(internal.workspace_jsonb_array(p_payload->'places')) AS t(value) LOOP
      v_id := internal.workspace_uuid(v_place->>'id');
      IF v_id IS NOT NULL THEN
        IF NOT EXISTS (
          SELECT 1 FROM public.object_place p
          WHERE p.id = v_id AND p.object_id = p_object_id
        ) THEN
          RAISE EXCEPTION 'Place % does not belong to object %', v_id, p_object_id USING ERRCODE = '23503';
        END IF;
        v_payload_ids := array_append(v_payload_ids, v_id);
      END IF;

      FOR v_row IN SELECT value FROM jsonb_array_elements(internal.workspace_jsonb_array(v_place->'locations')) AS t(value) LOOP
        v_id := internal.workspace_uuid(v_row->>'id');
        IF v_id IS NOT NULL AND v_place->>'id' IS NOT NULL THEN
          IF NOT EXISTS (
            SELECT 1 FROM public.object_location ol
            JOIN public.object_place p ON p.id = ol.place_id
            WHERE ol.id = v_id AND p.id = internal.workspace_uuid(v_place->>'id') AND p.object_id = p_object_id
          ) THEN
            RAISE EXCEPTION 'Location % does not belong to place on object %', v_id, p_object_id USING ERRCODE = '23503';
          END IF;
        END IF;
        v_has_lat := NULLIF(v_row->>'latitude', '') IS NOT NULL;
        v_has_lng := NULLIF(v_row->>'longitude', '') IS NOT NULL;
        IF v_has_lat <> v_has_lng THEN
          RAISE EXCEPTION 'Latitude and longitude must both be set or both be empty for place location'
            USING ERRCODE = '23514';
        END IF;
        IF v_has_lat AND (
             (v_row->>'latitude')::numeric < -90 OR (v_row->>'latitude')::numeric > 90 OR
             (v_row->>'longitude')::numeric < -180 OR (v_row->>'longitude')::numeric > 180
           ) THEN
          RAISE EXCEPTION 'Coordinates out of range: lat=%, lng=%', v_row->>'latitude', v_row->>'longitude'
            USING ERRCODE = '23514';
        END IF;
        IF NULLIF(v_row->>'code_insee', '') IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM public.ref_commune rc WHERE rc.insee_code = v_row->>'code_insee') THEN
          RAISE EXCEPTION 'Unknown INSEE commune: %', v_row->>'code_insee' USING ERRCODE = '23503';
        END IF;
      END LOOP;

      FOR v_row IN SELECT value FROM jsonb_array_elements(internal.workspace_jsonb_array(v_place->'descriptions')) AS t(value) LOOP
        v_visibility := NULLIF(v_row->>'visibility', '');
        IF v_visibility IS NOT NULL AND v_visibility NOT IN ('public', 'private', 'partners') THEN
          RAISE EXCEPTION 'Invalid place description visibility: %', v_visibility USING ERRCODE = '23514';
        END IF;
        v_id := internal.workspace_uuid(v_row->>'id');
        IF v_id IS NOT NULL AND v_place->>'id' IS NOT NULL THEN
          IF NOT EXISTS (
            SELECT 1 FROM public.object_place_description pd
            JOIN public.object_place p ON p.id = pd.place_id
            WHERE pd.id = v_id AND p.id = internal.workspace_uuid(v_place->>'id') AND p.object_id = p_object_id
          ) THEN
            RAISE EXCEPTION 'Place description % does not belong to object %', v_id, p_object_id USING ERRCODE = '23503';
          END IF;
        END IF;
      END LOOP;

      IF v_place ? 'media' THEN
        FOR v_row IN SELECT value FROM jsonb_array_elements(internal.workspace_jsonb_array(v_place->'media')) AS t(value) LOOP
          v_id := internal.workspace_uuid(v_row->>'media_type_id');
          IF v_id IS NULL THEN
            SELECT id INTO v_id FROM public.ref_code_media_type WHERE lower(code) = lower(v_row->>'media_type_code');
          END IF;
          IF v_id IS NULL THEN
            RAISE EXCEPTION 'Unknown media type reference: %', v_row USING ERRCODE = '23503';
          END IF;
        END LOOP;
      END IF;
    END LOOP;

    -- ---------- Phase 2: delete places absent from payload ----------
    SELECT coalesce(array_agg(p.id), ARRAY[]::uuid[])
      INTO v_existing_ids
      FROM public.object_place p
     WHERE p.object_id = p_object_id;

    DELETE FROM public.object_place p
     WHERE p.object_id = p_object_id
       AND (cardinality(v_payload_ids) = 0 OR NOT (p.id = ANY(v_payload_ids)));
    GET DIAGNOSTICS v_deleted = ROW_COUNT;

    v_inserted := 0;
    v_updated := 0;
    v_media_count := 0;

    -- ---------- Phase 3: upsert each place ----------
    FOR v_place IN SELECT value FROM jsonb_array_elements(internal.workspace_jsonb_array(p_payload->'places')) AS t(value) LOOP
      v_place_id := internal.workspace_uuid(v_place->>'id');

      IF v_place_id IS NOT NULL THEN
        UPDATE public.object_place
           SET label = NULLIF(v_place->>'label', ''),
               slug = NULLIF(v_place->>'slug', ''),
               is_primary = COALESCE(NULLIF(v_place->>'is_primary', '')::boolean, false),
               position = COALESCE(NULLIF(v_place->>'position', '')::integer, 0),
               effective_from = NULLIF(v_place->>'effective_from', '')::date,
               effective_to = NULLIF(v_place->>'effective_to', '')::date,
               extra = internal.workspace_jsonb_object(v_place->'extra'),
               updated_at = now()
         WHERE id = v_place_id AND object_id = p_object_id;
        v_updated := v_updated + 1;
      ELSE
        INSERT INTO public.object_place (id, object_id, label, slug, is_primary, position, effective_from, effective_to, extra)
        VALUES (
          gen_random_uuid(),
          p_object_id,
          NULLIF(v_place->>'label', ''),
          NULLIF(v_place->>'slug', ''),
          COALESCE(NULLIF(v_place->>'is_primary', '')::boolean, false),
          COALESCE(NULLIF(v_place->>'position', '')::integer, v_inserted + v_updated),
          NULLIF(v_place->>'effective_from', '')::date,
          NULLIF(v_place->>'effective_to', '')::date,
          internal.workspace_jsonb_object(v_place->'extra')
        )
        RETURNING id INTO v_place_id;
        v_inserted := v_inserted + 1;
      END IF;

      -- Main location for the place (first is_main_location=true, else first row)
      v_loc_id := NULL;
      FOR v_row IN
        SELECT value FROM jsonb_array_elements(internal.workspace_jsonb_array(v_place->'locations')) AS t(value)
        ORDER BY CASE WHEN COALESCE(NULLIF(value->>'is_main_location', '')::boolean, false) THEN 0 ELSE 1 END,
                 COALESCE(NULLIF(value->>'position', '')::integer, 0)
        LIMIT 1
      LOOP
        v_loc_id := internal.workspace_uuid(v_row->>'id');
        IF v_loc_id IS NULL THEN
          SELECT ol.id
            INTO v_loc_id
            FROM public.object_location ol
           WHERE ol.place_id = v_place_id
           ORDER BY ol.is_main_location DESC NULLS LAST, ol.position NULLS LAST, ol.id
           LIMIT 1;
        END IF;

        IF v_loc_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.object_location ol
           WHERE ol.id = v_loc_id AND ol.place_id = v_place_id
        ) THEN
          UPDATE public.object_location
             SET is_main_location = false,
                 updated_at = now()
           WHERE place_id = v_place_id
             AND id <> v_loc_id
             AND is_main_location;

          UPDATE public.object_location
             SET address1 = NULLIF(v_row->>'address1', ''),
                 address1_suite = NULLIF(v_row->>'address1_suite', ''),
                 address2 = NULLIF(v_row->>'address2', ''),
                 address3 = NULLIF(v_row->>'address3', ''),
                 postcode = NULLIF(v_row->>'postcode', ''),
                 city = NULLIF(v_row->>'city', ''),
                 code_insee = NULLIF(v_row->>'code_insee', ''),
                 lieu_dit = NULLIF(v_row->>'lieu_dit', ''),
                 direction = NULLIF(v_row->>'direction', ''),
                 latitude = NULLIF(v_row->>'latitude', '')::numeric,
                 longitude = NULLIF(v_row->>'longitude', '')::numeric,
                 altitude_m = NULLIF(v_row->>'altitude_m', '')::integer,
                 is_main_location = true,
                 position = COALESCE(NULLIF(v_row->>'position', '')::integer, 0),
                 updated_at = now()
           WHERE id = v_loc_id AND place_id = v_place_id;
        ELSE
          INSERT INTO public.object_location (
            id, place_id, address1, address1_suite, address2, address3, postcode, city, code_insee,
            lieu_dit, direction, latitude, longitude, altitude_m, is_main_location, position
          )
          VALUES (
            COALESCE(v_loc_id, gen_random_uuid()),
            v_place_id,
            NULLIF(v_row->>'address1', ''),
            NULLIF(v_row->>'address1_suite', ''),
            NULLIF(v_row->>'address2', ''),
            NULLIF(v_row->>'address3', ''),
            NULLIF(v_row->>'postcode', ''),
            NULLIF(v_row->>'city', ''),
            NULLIF(v_row->>'code_insee', ''),
            NULLIF(v_row->>'lieu_dit', ''),
            NULLIF(v_row->>'direction', ''),
            NULLIF(v_row->>'latitude', '')::numeric,
            NULLIF(v_row->>'longitude', '')::numeric,
            NULLIF(v_row->>'altitude_m', '')::integer,
            true,
            COALESCE(NULLIF(v_row->>'position', '')::integer, 0)
          );
        END IF;
      END LOOP;

      -- First description row (position 0 or first in array)
      FOR v_row IN
        SELECT value FROM jsonb_array_elements(internal.workspace_jsonb_array(v_place->'descriptions')) AS t(value)
        ORDER BY COALESCE(NULLIF(value->>'position', '')::integer, 0)
        LIMIT 1
      LOOP
        v_desc_id := internal.workspace_uuid(v_row->>'id');
        IF v_desc_id IS NULL THEN
          SELECT pd.id
            INTO v_desc_id
            FROM public.object_place_description pd
           WHERE pd.place_id = v_place_id
           ORDER BY pd.position NULLS LAST, pd.id
           LIMIT 1;
        END IF;

        IF v_desc_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.object_place_description pd
           WHERE pd.id = v_desc_id AND pd.place_id = v_place_id
        ) THEN
          UPDATE public.object_place_description
             SET description = NULLIF(v_row->>'description', ''),
                 visibility = NULLIF(v_row->>'visibility', ''),
                 position = COALESCE(NULLIF(v_row->>'position', '')::integer, 0),
                 description_i18n = CASE WHEN jsonb_typeof(v_row->'description_i18n') = 'object' THEN v_row->'description_i18n' ELSE description_i18n END,
                 extra = internal.workspace_jsonb_object(v_row->'extra'),
                 updated_at = now()
           WHERE id = v_desc_id AND place_id = v_place_id;
        ELSE
          INSERT INTO public.object_place_description (
            id, place_id, description, visibility, position, description_i18n, extra
          )
          VALUES (
            COALESCE(v_desc_id, gen_random_uuid()),
            v_place_id,
            NULLIF(v_row->>'description', ''),
            NULLIF(v_row->>'visibility', ''),
            COALESCE(NULLIF(v_row->>'position', '')::integer, 0),
            CASE WHEN jsonb_typeof(v_row->'description_i18n') = 'object' THEN v_row->'description_i18n' ELSE NULL END,
            internal.workspace_jsonb_object(v_row->'extra')
          );
        END IF;
      END LOOP;

      -- Media: only when explicitly provided (replace media set for this place)
      IF v_place ? 'media' THEN
        DELETE FROM public.media WHERE place_id = v_place_id;
        FOR v_row IN SELECT value FROM jsonb_array_elements(internal.workspace_jsonb_array(v_place->'media')) AS t(value) LOOP
          v_id := internal.workspace_uuid(v_row->>'media_type_id');
          IF v_id IS NULL THEN
            SELECT id INTO v_id FROM public.ref_code_media_type WHERE lower(code) = lower(v_row->>'media_type_code');
          END IF;
          INSERT INTO public.media (
            id, place_id, media_type_id, title, credit, url, description, analyse_data, width, height,
            is_main, is_published, position, rights_expires_at, visibility, kind, title_i18n, description_i18n, org_object_id
          )
          VALUES (
            COALESCE(internal.workspace_uuid(v_row->>'id'), gen_random_uuid()),
            v_place_id,
            v_id,
            NULLIF(v_row->>'title', ''),
            NULLIF(v_row->>'credit', ''),
            NULLIF(v_row->>'url', ''),
            NULLIF(v_row->>'description', ''),
            CASE WHEN jsonb_typeof(v_row->'analyse_data') = 'object' THEN v_row->'analyse_data' ELSE NULL END,
            NULLIF(v_row->>'width', '')::integer,
            NULLIF(v_row->>'height', '')::integer,
            COALESCE(NULLIF(v_row->>'is_main', '')::boolean, false),
            COALESCE(NULLIF(v_row->>'is_published', '')::boolean, true),
            COALESCE(NULLIF(v_row->>'position', '')::integer, 0),
            NULLIF(v_row->>'rights_expires_at', '')::date,
            NULLIF(v_row->>'visibility', ''),
            NULLIF(v_row->>'kind', ''),
            CASE WHEN jsonb_typeof(v_row->'title_i18n') = 'object' THEN v_row->'title_i18n' ELSE NULL END,
            CASE WHEN jsonb_typeof(v_row->'description_i18n') = 'object' THEN v_row->'description_i18n' ELSE NULL END,
            NULLIF(v_row->>'org_object_id', '')
          );
          v_media_count := v_media_count + 1;
        END LOOP;
      END IF;
    END LOOP;

    v_counts := v_counts || jsonb_build_object(
      'object_place_deleted', v_deleted,
      'object_place_inserted', v_inserted,
      'object_place_updated', v_updated,
      'place_media_inserted', v_media_count
    );
  END IF;

  IF p_payload ? 'zones' THEN
    DELETE FROM public.object_zone WHERE object_id = p_object_id;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    v_inserted := 0;
    FOR v_row IN SELECT value FROM jsonb_array_elements(internal.workspace_jsonb_array(p_payload->'zones')) AS t(value) LOOP
      INSERT INTO public.object_zone (id, object_id, insee_commune, position)
      VALUES (
        COALESCE(internal.workspace_uuid(v_row->>'id'), gen_random_uuid()),
        p_object_id,
        v_row->>'insee_commune',
        COALESCE(NULLIF(v_row->>'position', '')::integer, v_inserted)
      );
      v_inserted := v_inserted + 1;
    END LOOP;
    v_counts := v_counts || jsonb_build_object('object_zone_deleted', v_deleted, 'object_zone_inserted', v_inserted);
  END IF;

  RETURN internal.workspace_result(true, v_counts, v_skipped, v_warnings);
END;
$$;

REVOKE ALL ON FUNCTION api.save_object_places(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.save_object_places(text, jsonb) TO authenticated, service_role;

COMMIT;
