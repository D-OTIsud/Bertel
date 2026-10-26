-- PREPARATION ONLY (2026-10-26). Nothing in this file has been applied to live.
-- api.save_object_places keeps its signature, canonical write guard, invoker RLS and ACL.
-- places-reconcile-v1: stable client UUIDs; omitted scalars/children are preserved;
-- deleted_ids alone authorizes parent deletion. Absent/empty deleted_ids deletes nothing.
-- Every supplied location/description is reconciled by ID. Media editing is rejected
-- before any mutation. Explicit parent deletion keeps existing FK cascade semantics.
-- zones-only callers retain the legacy payload and replacement semantics.
-- Do not replay object_workspace_safe_write_rpcs.sql or older helper definitions.
-- Release requires the coupled client, production preflight and explicit deploy approval.

BEGIN;
SET LOCAL lock_timeout = '500ms';
SET LOCAL statement_timeout = '5s';
SET LOCAL idle_in_transaction_session_timeout = '10s';

DO $p_source_guard$
DECLARE
  v_function pg_proc%ROWTYPE;
BEGIN
  SELECT * INTO STRICT v_function FROM pg_proc
    WHERE oid = 'api.save_object_places(text,jsonb)'::regprocedure;
  IF md5(v_function.prosrc) <> '97614555e2fb2026c346de5f71507bdd'
      OR md5(pg_get_functiondef(v_function.oid)) <> 'f24a28edaa3127a010a572be825a8884'
      OR v_function.prosecdef
      OR v_function.provolatile <> 'v'
      OR v_function.proconfig IS DISTINCT FROM ARRAY['search_path=public, api, internal']::text[]
      OR v_function.proacl::text IS DISTINCT FROM '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'
      OR pg_get_userbyid(v_function.proowner) <> 'postgres' THEN
    RAISE EXCEPTION 'save_object_places catalogue drift: refresh P capture before applying' USING ERRCODE = '55000';
  END IF;
END;
$p_source_guard$;

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
  v_payload_ids uuid[] := ARRAY[]::uuid[];
  v_deleted_ids uuid[] := ARRAY[]::uuid[];
  v_location_ids uuid[] := ARRAY[]::uuid[];
  v_description_ids uuid[] := ARRAY[]::uuid[];
  v_visibility text;
  v_has_lat boolean;
  v_has_lng boolean;
  v_field text;
  v_value jsonb;
  v_collection text;
  v_zone_ids uuid[] := ARRAY[]::uuid[];
  v_zone_codes text[] := ARRAY[]::text[];
  v_affected bigint;
  v_expected bigint;
BEGIN
  PERFORM internal.workspace_assert_can_write_object(p_object_id);
  p_payload := COALESCE(p_payload, '{}'::jsonb);
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'places payload must be a JSON object' USING ERRCODE = '22023';
  END IF;
  FOREACH v_field IN ARRAY ARRAY['places', 'zones', 'deleted_ids'] LOOP
    IF p_payload ? v_field AND jsonb_typeof(p_payload->v_field) IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION '% must be a JSON array when supplied', v_field USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF p_payload ? 'places'
      AND p_payload->>'write_contract' IS DISTINCT FROM 'places-reconcile-v1' THEN
    RAISE EXCEPTION 'Reload the editor: places-reconcile-v1 is required' USING ERRCODE = '22023';
  END IF;
  IF p_payload ? 'deleted_ids' AND NOT (p_payload ? 'places') THEN
    RAISE EXCEPTION 'deleted_ids requires the places branch' USING ERRCODE = '22023';
  END IF;
  IF p_payload ? 'places' OR p_payload ? 'zones' THEN
    PERFORM 1 FROM public.object WHERE id = p_object_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Object cannot be locked for writing' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Validate zones before either arm mutates anything; zones-only clients keep their contract.
  IF p_payload ? 'zones' THEN
    FOR v_row IN SELECT value FROM jsonb_array_elements(p_payload->'zones') AS t(value) LOOP
      IF jsonb_typeof(v_row) IS DISTINCT FROM 'object'
          OR jsonb_typeof(v_row->'insee_commune') IS DISTINCT FROM 'string' THEN
        RAISE EXCEPTION 'Each zone needs a JSON object and an INSEE string' USING ERRCODE = '22023';
      END IF;
      IF v_row ? 'position' AND jsonb_typeof(v_row->'position') NOT IN ('number', 'string', 'null') THEN
        RAISE EXCEPTION 'zone.position must be an integer or null' USING ERRCODE = '22023';
      END IF;
      PERFORM NULLIF(v_row->>'position', '')::integer;
      IF v_row ? 'id' AND jsonb_typeof(v_row->'id') NOT IN ('string', 'null') THEN
        RAISE EXCEPTION 'zone.id must be a UUID string or null' USING ERRCODE = '22023';
      END IF;
      v_id := internal.workspace_uuid(v_row->>'id');
      IF v_row->>'id' IS NOT NULL AND v_id IS NULL THEN
        RAISE EXCEPTION 'Invalid zone id' USING ERRCODE = '22P02';
      END IF;
      IF v_id IS NOT NULL THEN
        IF v_id = ANY(v_zone_ids) THEN
          RAISE EXCEPTION 'Duplicate zone id' USING ERRCODE = '23505';
        END IF;
        -- Legacy clients may supply new UUIDs. Existing IDs must belong to this object.
        IF EXISTS (SELECT 1 FROM public.object_zone z WHERE z.id = v_id AND z.object_id <> p_object_id) THEN
          RAISE EXCEPTION 'Zone id belongs to another object' USING ERRCODE = '23503';
        END IF;
        v_zone_ids := array_append(v_zone_ids, v_id);
      END IF;
      IF v_row->>'insee_commune' = ANY(v_zone_codes) THEN
        RAISE EXCEPTION 'Duplicate INSEE commune in zones' USING ERRCODE = '23505';
      END IF;
      v_zone_codes := array_append(v_zone_codes, v_row->>'insee_commune');
      IF NOT EXISTS (SELECT 1 FROM public.ref_commune rc WHERE rc.insee_code = v_row->>'insee_commune') THEN
        RAISE EXCEPTION 'Unknown INSEE commune in zones' USING ERRCODE = '23503';
      END IF;
    END LOOP;
  END IF;

  IF p_payload ? 'places' THEN
    -- Validate the complete request before any DELETE, INSERT or UPDATE.
    FOR v_value IN SELECT value FROM jsonb_array_elements(COALESCE(p_payload->'deleted_ids', '[]'::jsonb)) AS t(value) LOOP
      IF jsonb_typeof(v_value) IS DISTINCT FROM 'string' THEN
        RAISE EXCEPTION 'Each deleted_id must be a UUID string' USING ERRCODE = '22023';
      END IF;
      v_id := internal.workspace_uuid(v_value #>> '{}');
      IF v_id IS NULL THEN
        RAISE EXCEPTION 'Invalid deleted place id' USING ERRCODE = '22P02';
      END IF;
      IF v_id = ANY(v_deleted_ids) THEN
        RAISE EXCEPTION 'Duplicate deleted place id' USING ERRCODE = '23505';
      END IF;
      IF EXISTS (SELECT 1 FROM public.object_place p WHERE p.id = v_id AND p.object_id <> p_object_id) THEN
        RAISE EXCEPTION 'Deleted place id belongs to another object' USING ERRCODE = '23503';
      END IF;
      v_deleted_ids := array_append(v_deleted_ids, v_id);
    END LOOP;

    FOR v_place IN SELECT value FROM jsonb_array_elements(p_payload->'places') AS t(value) LOOP
      IF jsonb_typeof(v_place) IS DISTINCT FROM 'object' THEN
        RAISE EXCEPTION 'Each place must be a JSON object' USING ERRCODE = '22023';
      END IF;
      IF v_place ? 'media' THEN
        RAISE EXCEPTION 'Place media cannot be edited by places-reconcile-v1' USING ERRCODE = '22023';
      END IF;
      FOR v_field, v_value IN SELECT key, value FROM jsonb_each(v_place) LOOP
        IF v_field = ANY(ARRAY['id', 'label', 'slug', 'effective_from', 'effective_to'])
            AND jsonb_typeof(v_value) NOT IN ('string', 'null') THEN
          RAISE EXCEPTION 'place.% must be a string or null', v_field USING ERRCODE = '22023';
        ELSIF v_field = 'extra' AND jsonb_typeof(v_value) NOT IN ('object', 'null') THEN
          RAISE EXCEPTION 'place.extra must be an object or null' USING ERRCODE = '22023';
        ELSIF v_field = 'position' THEN
          IF jsonb_typeof(v_value) NOT IN ('number', 'string', 'null') THEN
            RAISE EXCEPTION 'place.position must be an integer or null' USING ERRCODE = '22023';
          END IF;
          PERFORM NULLIF(v_place->>'position', '')::integer;
        ELSIF v_field = 'is_primary' THEN
          IF jsonb_typeof(v_value) NOT IN ('boolean', 'string', 'null') THEN
            RAISE EXCEPTION 'place.is_primary must be a boolean or null' USING ERRCODE = '22023';
          END IF;
          PERFORM NULLIF(v_place->>'is_primary', '')::boolean;
        END IF;
      END LOOP;
      PERFORM NULLIF(v_place->>'effective_from', '')::date;
      PERFORM NULLIF(v_place->>'effective_to', '')::date;
      v_place_id := internal.workspace_uuid(v_place->>'id');
      IF v_place_id IS NULL THEN
        RAISE EXCEPTION 'Each place needs a stable UUID' USING ERRCODE = '22P02';
      END IF;
      IF v_place_id = ANY(v_payload_ids) OR v_place_id = ANY(v_deleted_ids) THEN
        RAISE EXCEPTION 'Duplicate or simultaneously deleted place id' USING ERRCODE = '23505';
      END IF;
      IF EXISTS (SELECT 1 FROM public.object_place p WHERE p.id = v_place_id AND p.object_id <> p_object_id) THEN
        RAISE EXCEPTION 'Place id belongs to another object' USING ERRCODE = '23503';
      END IF;
      v_payload_ids := array_append(v_payload_ids, v_place_id);

      FOREACH v_collection IN ARRAY ARRAY['locations', 'descriptions'] LOOP
        IF v_place ? v_collection THEN
          IF jsonb_typeof(v_place->v_collection) IS DISTINCT FROM 'array' THEN
            RAISE EXCEPTION 'place.% must be a JSON array when supplied', v_collection USING ERRCODE = '22023';
          END IF;
          FOR v_row IN SELECT value FROM jsonb_array_elements(v_place->v_collection) AS t(value) LOOP
            IF jsonb_typeof(v_row) IS DISTINCT FROM 'object' THEN
              RAISE EXCEPTION 'Each % row must be a JSON object', v_collection USING ERRCODE = '22023';
            END IF;
            FOR v_field, v_value IN SELECT key, value FROM jsonb_each(v_row) LOOP
              IF v_field = ANY(ARRAY['id', 'address1', 'address1_suite', 'address2', 'address3',
                  'postcode', 'city', 'code_insee', 'lieu_dit', 'direction', 'zone_touristique',
                  'description', 'description_chapo', 'description_mobile', 'description_edition',
                  'description_offre_hors_zone', 'sanitary_measures', 'description_adapted', 'visibility'])
                  AND jsonb_typeof(v_value) NOT IN ('string', 'null') THEN
                RAISE EXCEPTION '%.% must be a string or null', v_collection, v_field USING ERRCODE = '22023';
              ELSIF v_field = ANY(ARRAY['extra', 'description_i18n', 'description_chapo_i18n',
                  'description_mobile_i18n', 'description_edition_i18n',
                  'description_offre_hors_zone_i18n', 'sanitary_measures_i18n', 'description_adapted_i18n'])
                  AND jsonb_typeof(v_value) NOT IN ('object', 'null') THEN
                RAISE EXCEPTION '%.% must be an object or null', v_collection, v_field USING ERRCODE = '22023';
              ELSIF v_field IN ('position', 'altitude_m') THEN
                IF jsonb_typeof(v_value) NOT IN ('number', 'string', 'null') THEN
                  RAISE EXCEPTION '%.% must be an integer or null', v_collection, v_field USING ERRCODE = '22023';
                END IF;
                PERFORM NULLIF(v_row->>v_field, '')::integer;
              ELSIF v_field IN ('latitude', 'longitude') THEN
                IF jsonb_typeof(v_value) NOT IN ('number', 'string', 'null') THEN
                  RAISE EXCEPTION '%.% must be numeric or null', v_collection, v_field USING ERRCODE = '22023';
                END IF;
                PERFORM NULLIF(v_row->>v_field, '')::numeric;
              ELSIF v_field = 'is_main_location' THEN
                IF jsonb_typeof(v_value) NOT IN ('boolean', 'string', 'null') THEN
                  RAISE EXCEPTION '%.% must be boolean or null', v_collection, v_field USING ERRCODE = '22023';
                END IF;
                PERFORM NULLIF(v_row->>v_field, '')::boolean;
              END IF;
            END LOOP;
            v_id := internal.workspace_uuid(v_row->>'id');
            IF v_id IS NULL THEN
              RAISE EXCEPTION 'Each % row needs a stable UUID', v_collection USING ERRCODE = '22P02';
            END IF;
            IF v_collection = 'locations' THEN
              IF v_id = ANY(v_location_ids) THEN
                RAISE EXCEPTION 'Duplicate location id across places' USING ERRCODE = '23505';
              END IF;
              v_location_ids := array_append(v_location_ids, v_id);
              IF EXISTS (SELECT 1 FROM public.object_location ol WHERE ol.id = v_id AND ol.place_id IS DISTINCT FROM v_place_id) THEN
                RAISE EXCEPTION 'Location id belongs to another parent' USING ERRCODE = '23503';
              END IF;
            ELSE
              IF v_id = ANY(v_description_ids) THEN
                RAISE EXCEPTION 'Duplicate description id across places' USING ERRCODE = '23505';
              END IF;
              v_description_ids := array_append(v_description_ids, v_id);
              IF EXISTS (SELECT 1 FROM public.object_place_description pd WHERE pd.id = v_id AND pd.place_id IS DISTINCT FROM v_place_id) THEN
                RAISE EXCEPTION 'Description id belongs to another parent' USING ERRCODE = '23503';
              END IF;
            END IF;
          END LOOP;
        END IF;
      END LOOP;

      FOR v_row IN SELECT value FROM jsonb_array_elements(internal.workspace_jsonb_array(v_place->'locations')) AS t(value) LOOP
        IF (v_row ? 'latitude') <> (v_row ? 'longitude') THEN
          RAISE EXCEPTION 'Latitude and longitude keys must both be supplied or both be absent' USING ERRCODE = '23514';
        END IF;
        v_has_lat := NULLIF(v_row->>'latitude', '') IS NOT NULL;
        v_has_lng := NULLIF(v_row->>'longitude', '') IS NOT NULL;
        IF v_has_lat <> v_has_lng THEN
          RAISE EXCEPTION 'Latitude and longitude must both be set or both be empty' USING ERRCODE = '23514';
        END IF;
        IF v_has_lat AND ((v_row->>'latitude')::numeric < -90 OR (v_row->>'latitude')::numeric > 90
            OR (v_row->>'longitude')::numeric < -180 OR (v_row->>'longitude')::numeric > 180) THEN
          RAISE EXCEPTION 'Place coordinates out of range' USING ERRCODE = '23514';
        END IF;
        IF NULLIF(v_row->>'code_insee', '') IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM public.ref_commune rc WHERE rc.insee_code = v_row->>'code_insee') THEN
          RAISE EXCEPTION 'Unknown INSEE commune' USING ERRCODE = '23503';
        END IF;
      END LOOP;
      FOR v_row IN SELECT value FROM jsonb_array_elements(internal.workspace_jsonb_array(v_place->'descriptions')) AS t(value) LOOP
        v_visibility := v_row->>'visibility';
        IF v_visibility IS NOT NULL AND v_visibility NOT IN ('public', 'private', 'partners') THEN
          RAISE EXCEPTION 'Invalid place description visibility' USING ERRCODE = '23514';
        END IF;
      END LOOP;
      IF (SELECT count(*) FROM jsonb_array_elements(internal.workspace_jsonb_array(v_place->'locations')) AS t(value)
          WHERE NULLIF(value->>'is_main_location', '')::boolean) > 1 THEN
        RAISE EXCEPTION 'Only one main location per place is allowed' USING ERRCODE = '23505';
      END IF;
    END LOOP;
    IF (SELECT count(*) FROM jsonb_array_elements(p_payload->'places') AS t(value)
        WHERE NULLIF(value->>'is_primary', '')::boolean) > 1 THEN
      RAISE EXCEPTION 'Only one primary place per object is allowed' USING ERRCODE = '23505';
    END IF;

    -- Only explicitly listed parent IDs are deleted. Missing rows may be retries.
    SELECT count(*) INTO v_expected FROM public.object_place p
      WHERE p.object_id = p_object_id AND p.id = ANY(v_deleted_ids);
    DELETE FROM public.object_place p
      WHERE p.object_id = p_object_id AND p.id = ANY(v_deleted_ids);
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    IF v_deleted <> v_expected THEN
      RAISE EXCEPTION 'Incomplete place deletion; transaction cancelled' USING ERRCODE = '42501';
    END IF;
    v_inserted := 0;
    v_updated := 0;

    -- Process explicit demotions before promotions to respect the existing unique index.
    -- Unlisted rows and omitted flags are never changed to make room for a promotion.
    FOR v_place IN SELECT value FROM jsonb_array_elements(p_payload->'places') AS t(value)
      ORDER BY CASE WHEN NULLIF(value->>'is_primary', '')::boolean THEN 1 ELSE 0 END
    LOOP
      v_place_id := internal.workspace_uuid(v_place->>'id');
      IF EXISTS (SELECT 1 FROM public.object_place WHERE id = v_place_id AND object_id = p_object_id) THEN
        UPDATE public.object_place
          SET label = CASE WHEN v_place ? 'label' THEN v_place->>'label' ELSE label END,
              slug = CASE WHEN v_place ? 'slug' THEN v_place->>'slug' ELSE slug END,
              is_primary = CASE WHEN v_place ? 'is_primary' THEN NULLIF(v_place->>'is_primary', '')::boolean ELSE is_primary END,
              position = CASE WHEN v_place ? 'position' THEN NULLIF(v_place->>'position', '')::integer ELSE position END,
              effective_from = CASE WHEN v_place ? 'effective_from' THEN NULLIF(v_place->>'effective_from', '')::date ELSE effective_from END,
              effective_to = CASE WHEN v_place ? 'effective_to' THEN NULLIF(v_place->>'effective_to', '')::date ELSE effective_to END,
              extra = CASE WHEN v_place ? 'extra' THEN NULLIF(v_place->'extra', 'null'::jsonb) ELSE extra END,
              updated_at = now()
        WHERE id = v_place_id AND object_id = p_object_id;
        GET DIAGNOSTICS v_affected = ROW_COUNT;
        IF v_affected <> 1 THEN
          RAISE EXCEPTION 'Place update affected % rows; transaction cancelled', v_affected USING ERRCODE = '42501';
        END IF;
        v_updated := v_updated + v_affected;
      ELSE
        INSERT INTO public.object_place (id, object_id, label, slug, is_primary, position, effective_from, effective_to, extra)
        VALUES (
          v_place_id,
          p_object_id,
          v_place->>'label',
          v_place->>'slug',
          CASE WHEN v_place ? 'is_primary' THEN NULLIF(v_place->>'is_primary', '')::boolean ELSE false END,
          CASE WHEN v_place ? 'position' THEN NULLIF(v_place->>'position', '')::integer ELSE 0 END,
          NULLIF(v_place->>'effective_from', '')::date,
          NULLIF(v_place->>'effective_to', '')::date,
          NULLIF(v_place->'extra', 'null'::jsonb)
        );
        v_inserted := v_inserted + 1;
      END IF;

      -- Reconcile every supplied locations row; no implicit child deletions.
      FOR v_row IN SELECT value FROM jsonb_array_elements(internal.workspace_jsonb_array(v_place->'locations')) AS t(value)
        ORDER BY CASE WHEN NULLIF(value->>'is_main_location', '')::boolean THEN 1 ELSE 0 END
      LOOP
        v_loc_id := internal.workspace_uuid(v_row->>'id');
        IF EXISTS (SELECT 1 FROM public.object_location WHERE id = v_loc_id AND place_id = v_place_id) THEN
          UPDATE public.object_location
            SET address1 = CASE WHEN v_row ? 'address1' THEN v_row->>'address1' ELSE address1 END,
                address1_suite = CASE WHEN v_row ? 'address1_suite' THEN v_row->>'address1_suite' ELSE address1_suite END,
                address2 = CASE WHEN v_row ? 'address2' THEN v_row->>'address2' ELSE address2 END,
                address3 = CASE WHEN v_row ? 'address3' THEN v_row->>'address3' ELSE address3 END,
                postcode = CASE WHEN v_row ? 'postcode' THEN v_row->>'postcode' ELSE postcode END,
                city = CASE WHEN v_row ? 'city' THEN v_row->>'city' ELSE city END,
                code_insee = CASE WHEN v_row ? 'code_insee' THEN v_row->>'code_insee' ELSE code_insee END,
                lieu_dit = CASE WHEN v_row ? 'lieu_dit' THEN v_row->>'lieu_dit' ELSE lieu_dit END,
                direction = CASE WHEN v_row ? 'direction' THEN v_row->>'direction' ELSE direction END,
                zone_touristique = CASE WHEN v_row ? 'zone_touristique' THEN v_row->>'zone_touristique' ELSE zone_touristique END,
                latitude = CASE WHEN v_row ? 'latitude' THEN NULLIF(v_row->>'latitude', '')::numeric ELSE latitude END,
                longitude = CASE WHEN v_row ? 'longitude' THEN NULLIF(v_row->>'longitude', '')::numeric ELSE longitude END,
                altitude_m = CASE WHEN v_row ? 'altitude_m' THEN NULLIF(v_row->>'altitude_m', '')::integer ELSE altitude_m END,
                is_main_location = CASE WHEN v_row ? 'is_main_location' THEN NULLIF(v_row->>'is_main_location', '')::boolean ELSE is_main_location END,
                position = CASE WHEN v_row ? 'position' THEN NULLIF(v_row->>'position', '')::integer ELSE position END,
                updated_at = now()
          WHERE id = v_loc_id AND place_id = v_place_id;
          GET DIAGNOSTICS v_affected = ROW_COUNT;
          IF v_affected <> 1 THEN
            RAISE EXCEPTION 'Location update affected % rows; transaction cancelled', v_affected USING ERRCODE = '42501';
          END IF;
        ELSE
          INSERT INTO public.object_location (id, place_id, address1, address1_suite, address2, address3, postcode, city, code_insee, lieu_dit, direction, zone_touristique, latitude, longitude, altitude_m, is_main_location, position)
          VALUES (
            v_loc_id,
            v_place_id,
            v_row->>'address1',
            v_row->>'address1_suite',
            v_row->>'address2',
            v_row->>'address3',
            v_row->>'postcode',
            v_row->>'city',
            v_row->>'code_insee',
            v_row->>'lieu_dit',
            v_row->>'direction',
            v_row->>'zone_touristique',
            NULLIF(v_row->>'latitude', '')::numeric,
            NULLIF(v_row->>'longitude', '')::numeric,
            NULLIF(v_row->>'altitude_m', '')::integer,
            CASE WHEN v_row ? 'is_main_location' THEN NULLIF(v_row->>'is_main_location', '')::boolean ELSE false END,
            CASE WHEN v_row ? 'position' THEN NULLIF(v_row->>'position', '')::integer ELSE 0 END
          );
        END IF;
      END LOOP;

      -- Reconcile every supplied descriptions row; no implicit child deletions.
      FOR v_row IN SELECT value FROM jsonb_array_elements(internal.workspace_jsonb_array(v_place->'descriptions')) AS t(value)
      LOOP
        v_desc_id := internal.workspace_uuid(v_row->>'id');
        IF EXISTS (SELECT 1 FROM public.object_place_description WHERE id = v_desc_id AND place_id = v_place_id) THEN
          UPDATE public.object_place_description
            SET description = CASE WHEN v_row ? 'description' THEN v_row->>'description' ELSE description END,
                description_chapo = CASE WHEN v_row ? 'description_chapo' THEN v_row->>'description_chapo' ELSE description_chapo END,
                description_mobile = CASE WHEN v_row ? 'description_mobile' THEN v_row->>'description_mobile' ELSE description_mobile END,
                description_edition = CASE WHEN v_row ? 'description_edition' THEN v_row->>'description_edition' ELSE description_edition END,
                description_offre_hors_zone = CASE WHEN v_row ? 'description_offre_hors_zone' THEN v_row->>'description_offre_hors_zone' ELSE description_offre_hors_zone END,
                sanitary_measures = CASE WHEN v_row ? 'sanitary_measures' THEN v_row->>'sanitary_measures' ELSE sanitary_measures END,
                description_adapted = CASE WHEN v_row ? 'description_adapted' THEN v_row->>'description_adapted' ELSE description_adapted END,
                visibility = CASE WHEN v_row ? 'visibility' THEN v_row->>'visibility' ELSE visibility END,
                position = CASE WHEN v_row ? 'position' THEN NULLIF(v_row->>'position', '')::integer ELSE position END,
                extra = CASE WHEN v_row ? 'extra' THEN NULLIF(v_row->'extra', 'null'::jsonb) ELSE extra END,
                description_i18n = CASE WHEN v_row ? 'description_i18n' THEN NULLIF(v_row->'description_i18n', 'null'::jsonb) ELSE description_i18n END,
                description_chapo_i18n = CASE WHEN v_row ? 'description_chapo_i18n' THEN NULLIF(v_row->'description_chapo_i18n', 'null'::jsonb) ELSE description_chapo_i18n END,
                description_mobile_i18n = CASE WHEN v_row ? 'description_mobile_i18n' THEN NULLIF(v_row->'description_mobile_i18n', 'null'::jsonb) ELSE description_mobile_i18n END,
                description_edition_i18n = CASE WHEN v_row ? 'description_edition_i18n' THEN NULLIF(v_row->'description_edition_i18n', 'null'::jsonb) ELSE description_edition_i18n END,
                description_offre_hors_zone_i18n = CASE WHEN v_row ? 'description_offre_hors_zone_i18n' THEN NULLIF(v_row->'description_offre_hors_zone_i18n', 'null'::jsonb) ELSE description_offre_hors_zone_i18n END,
                sanitary_measures_i18n = CASE WHEN v_row ? 'sanitary_measures_i18n' THEN NULLIF(v_row->'sanitary_measures_i18n', 'null'::jsonb) ELSE sanitary_measures_i18n END,
                description_adapted_i18n = CASE WHEN v_row ? 'description_adapted_i18n' THEN NULLIF(v_row->'description_adapted_i18n', 'null'::jsonb) ELSE description_adapted_i18n END,
                updated_at = now()
          WHERE id = v_desc_id AND place_id = v_place_id;
          GET DIAGNOSTICS v_affected = ROW_COUNT;
          IF v_affected <> 1 THEN
            RAISE EXCEPTION 'Description update affected % rows; transaction cancelled', v_affected USING ERRCODE = '42501';
          END IF;
        ELSE
          INSERT INTO public.object_place_description (id, place_id, description, description_chapo, description_mobile, description_edition, description_offre_hors_zone, sanitary_measures, description_adapted, visibility, position, extra, description_i18n, description_chapo_i18n, description_mobile_i18n, description_edition_i18n, description_offre_hors_zone_i18n, sanitary_measures_i18n, description_adapted_i18n)
          VALUES (
            v_desc_id,
            v_place_id,
            v_row->>'description',
            v_row->>'description_chapo',
            v_row->>'description_mobile',
            v_row->>'description_edition',
            v_row->>'description_offre_hors_zone',
            v_row->>'sanitary_measures',
            v_row->>'description_adapted',
            v_row->>'visibility',
            CASE WHEN v_row ? 'position' THEN NULLIF(v_row->>'position', '')::integer ELSE 0 END,
            NULLIF(v_row->'extra', 'null'::jsonb),
            NULLIF(v_row->'description_i18n', 'null'::jsonb),
            NULLIF(v_row->'description_chapo_i18n', 'null'::jsonb),
            NULLIF(v_row->'description_mobile_i18n', 'null'::jsonb),
            NULLIF(v_row->'description_edition_i18n', 'null'::jsonb),
            NULLIF(v_row->'description_offre_hors_zone_i18n', 'null'::jsonb),
            NULLIF(v_row->'sanitary_measures_i18n', 'null'::jsonb),
            NULLIF(v_row->'description_adapted_i18n', 'null'::jsonb)
          );
        END IF;
      END LOOP;

    END LOOP;
    v_counts := v_counts || jsonb_build_object(
      'object_place_deleted', v_deleted,
      'object_place_inserted', v_inserted,
      'object_place_updated', v_updated,
      'place_media_inserted', 0
    );
  END IF;

  IF p_payload ? 'zones' THEN
    SELECT count(*) INTO v_expected FROM public.object_zone WHERE object_id = p_object_id;
    DELETE FROM public.object_zone WHERE object_id = p_object_id;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    IF v_deleted <> v_expected THEN
      RAISE EXCEPTION 'Incomplete zone deletion; transaction cancelled' USING ERRCODE = '42501';
    END IF;
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

COMMIT;
