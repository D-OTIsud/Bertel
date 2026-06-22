-- Object workspace safe-write RPC layer
-- DB-first payloads. UI payloads should adapt to this surface, not the reverse.
-- Apply after schema_unified.sql and rls_policies.sql.

CREATE SCHEMA IF NOT EXISTS internal;

CREATE OR REPLACE FUNCTION internal.workspace_uuid(p_value text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $$
BEGIN
  IF p_value IS NULL OR btrim(p_value) = '' THEN
    RETURN NULL;
  END IF;

  RETURN p_value::uuid;
EXCEPTION
  WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'Invalid UUID: %', p_value USING ERRCODE = '22P02';
END;
$$;

CREATE OR REPLACE FUNCTION internal.workspace_jsonb_array(p_value jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT CASE WHEN jsonb_typeof(p_value) = 'array' THEN p_value ELSE '[]'::jsonb END;
$$;

CREATE OR REPLACE FUNCTION internal.workspace_jsonb_object(p_value jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT CASE WHEN jsonb_typeof(p_value) = 'object' THEN p_value ELSE '{}'::jsonb END;
$$;

CREATE OR REPLACE FUNCTION internal.workspace_result(
  p_success boolean DEFAULT true,
  p_changed_counts jsonb DEFAULT '{}'::jsonb,
  p_skipped_fields text[] DEFAULT ARRAY[]::text[],
  p_warnings text[] DEFAULT ARRAY[]::text[]
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT jsonb_build_object(
    'success', p_success,
    'changed_counts', COALESCE(p_changed_counts, '{}'::jsonb),
    'skipped_fields', COALESCE(to_jsonb(p_skipped_fields), '[]'::jsonb),
    'warnings', COALESCE(to_jsonb(p_warnings), '[]'::jsonb)
  );
$$;

CREATE OR REPLACE FUNCTION internal.workspace_assert_can_write_object(p_object_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, api, internal, auth
AS $$
BEGIN
  IF p_object_id IS NULL OR btrim(p_object_id) = '' THEN
    RAISE EXCEPTION 'object_id is required' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.object WHERE id = p_object_id) THEN
    RAISE EXCEPTION 'Unknown object_id: %', p_object_id USING ERRCODE = 'P0002';
  END IF;

  IF NOT api.is_object_owner(p_object_id) THEN
    RAISE EXCEPTION 'Current user cannot write object %', p_object_id USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION internal.workspace_assert_can_write_object(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION internal.workspace_result(boolean, jsonb, text[], text[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION internal.workspace_uuid(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION internal.workspace_jsonb_array(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION internal.workspace_jsonb_object(jsonb) FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA internal TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION internal.workspace_assert_can_write_object(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION internal.workspace_result(boolean, jsonb, text[], text[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION internal.workspace_uuid(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION internal.workspace_jsonb_array(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION internal.workspace_jsonb_object(jsonb) TO authenticated, service_role;

-- Grants and RLS rules for DB-first object workspace writes.
GRANT SELECT ON public.object TO anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.opening_period,
  public.opening_schedule,
  public.opening_time_period,
  public.opening_time_period_weekday,
  public.opening_time_frame,
  public.object_language,
  public.object_payment_method,
  public.object_environment_tag,
  public.object_amenity,
  public.object_capacity,
  public.object_group_policy,
  public.object_pet_policy,
  public.object_price,
  public.object_price_period,
  public.object_discount,
  public.object_iti,
  public.object_iti_practice,
  public.object_iti_info,
  public.object_iti_stage,
  public.object_iti_stage_media,
  public.object_iti_section,
  public.object_iti_profile,
  public.object_iti_associated_object,
  public.object_relation,
  public.object_org_link,
  public.object_place,
  public.object_location,
  public.object_place_description,
  public.media,
  public.object_zone
TO authenticated, service_role;

ALTER TABLE public.opening_period ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opening_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opening_time_period ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opening_time_period_weekday ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opening_time_frame ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.object_language ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.object_payment_method ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.object_environment_tag ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.object_amenity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.object_capacity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.object_group_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.object_pet_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.object_price ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.object_price_period ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.object_discount ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.object_iti ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.object_iti_practice ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.object_iti_info ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.object_iti_stage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.object_iti_stage_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.object_iti_section ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.object_iti_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.object_iti_associated_object ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.object_relation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.object_org_link ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.object_place ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.object_location ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.object_place_description ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.object_zone ENABLE ROW LEVEL SECURITY;

-- Additional DB rules used by the RPC layer when the base schema does not already
-- carry the validation intent.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.object_price'::regclass
      AND conname = 'chk_workspace_object_price_valid_dates'
  ) THEN
    ALTER TABLE public.object_price
      ADD CONSTRAINT chk_workspace_object_price_valid_dates
      CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.object_discount'::regclass
      AND conname = 'chk_workspace_object_discount_valid_dates'
  ) THEN
    ALTER TABLE public.object_discount
      ADD CONSTRAINT chk_workspace_object_discount_valid_dates
      CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.object_place'::regclass
      AND conname = 'chk_workspace_object_place_effective_dates'
  ) THEN
    ALTER TABLE public.object_place
      ADD CONSTRAINT chk_workspace_object_place_effective_dates
      CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from);
  END IF;
END;
$$;

DROP POLICY IF EXISTS "workspace_opening_period_write" ON public.opening_period;
CREATE POLICY "workspace_opening_period_write" ON public.opening_period
  FOR ALL TO authenticated
  USING (api.is_object_owner(object_id))
  WITH CHECK (api.is_object_owner(object_id));

DROP POLICY IF EXISTS "workspace_opening_schedule_write" ON public.opening_schedule;
CREATE POLICY "workspace_opening_schedule_write" ON public.opening_schedule
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.opening_period p
    WHERE p.id = opening_schedule.period_id AND api.is_object_owner(p.object_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.opening_period p
    WHERE p.id = opening_schedule.period_id AND api.is_object_owner(p.object_id)
  ));

DROP POLICY IF EXISTS "workspace_opening_time_period_write" ON public.opening_time_period;
CREATE POLICY "workspace_opening_time_period_write" ON public.opening_time_period
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.opening_schedule s
    JOIN public.opening_period p ON p.id = s.period_id
    WHERE s.id = opening_time_period.schedule_id AND api.is_object_owner(p.object_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1
    FROM public.opening_schedule s
    JOIN public.opening_period p ON p.id = s.period_id
    WHERE s.id = opening_time_period.schedule_id AND api.is_object_owner(p.object_id)
  ));

DROP POLICY IF EXISTS "workspace_opening_weekday_write" ON public.opening_time_period_weekday;
CREATE POLICY "workspace_opening_weekday_write" ON public.opening_time_period_weekday
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.opening_time_period tp
    JOIN public.opening_schedule s ON s.id = tp.schedule_id
    JOIN public.opening_period p ON p.id = s.period_id
    WHERE tp.id = opening_time_period_weekday.time_period_id AND api.is_object_owner(p.object_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1
    FROM public.opening_time_period tp
    JOIN public.opening_schedule s ON s.id = tp.schedule_id
    JOIN public.opening_period p ON p.id = s.period_id
    WHERE tp.id = opening_time_period_weekday.time_period_id AND api.is_object_owner(p.object_id)
  ));

DROP POLICY IF EXISTS "workspace_opening_frame_write" ON public.opening_time_frame;
CREATE POLICY "workspace_opening_frame_write" ON public.opening_time_frame
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.opening_time_period tp
    JOIN public.opening_schedule s ON s.id = tp.schedule_id
    JOIN public.opening_period p ON p.id = s.period_id
    WHERE tp.id = opening_time_frame.time_period_id AND api.is_object_owner(p.object_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1
    FROM public.opening_time_period tp
    JOIN public.opening_schedule s ON s.id = tp.schedule_id
    JOIN public.opening_period p ON p.id = s.period_id
    WHERE tp.id = opening_time_frame.time_period_id AND api.is_object_owner(p.object_id)
  ));

DROP POLICY IF EXISTS "workspace_direct_object_language_write" ON public.object_language;
CREATE POLICY "workspace_direct_object_language_write" ON public.object_language
  FOR ALL TO authenticated USING (api.is_object_owner(object_id)) WITH CHECK (api.is_object_owner(object_id));
DROP POLICY IF EXISTS "workspace_direct_object_payment_write" ON public.object_payment_method;
CREATE POLICY "workspace_direct_object_payment_write" ON public.object_payment_method
  FOR ALL TO authenticated USING (api.is_object_owner(object_id)) WITH CHECK (api.is_object_owner(object_id));
DROP POLICY IF EXISTS "workspace_direct_object_environment_write" ON public.object_environment_tag;
CREATE POLICY "workspace_direct_object_environment_write" ON public.object_environment_tag
  FOR ALL TO authenticated USING (api.is_object_owner(object_id)) WITH CHECK (api.is_object_owner(object_id));
DROP POLICY IF EXISTS "workspace_direct_object_amenity_write" ON public.object_amenity;
CREATE POLICY "workspace_direct_object_amenity_write" ON public.object_amenity
  FOR ALL TO authenticated USING (api.is_object_owner(object_id)) WITH CHECK (api.is_object_owner(object_id));
DROP POLICY IF EXISTS "workspace_direct_object_capacity_write" ON public.object_capacity;
CREATE POLICY "workspace_direct_object_capacity_write" ON public.object_capacity
  FOR ALL TO authenticated USING (api.is_object_owner(object_id)) WITH CHECK (api.is_object_owner(object_id));
DROP POLICY IF EXISTS "workspace_direct_group_policy_write" ON public.object_group_policy;
CREATE POLICY "workspace_direct_group_policy_write" ON public.object_group_policy
  FOR ALL TO authenticated USING (api.is_object_owner(object_id)) WITH CHECK (api.is_object_owner(object_id));
DROP POLICY IF EXISTS "workspace_direct_pet_policy_write" ON public.object_pet_policy;
CREATE POLICY "workspace_direct_pet_policy_write" ON public.object_pet_policy
  FOR ALL TO authenticated USING (api.is_object_owner(object_id)) WITH CHECK (api.is_object_owner(object_id));
DROP POLICY IF EXISTS "workspace_direct_price_write" ON public.object_price;
CREATE POLICY "workspace_direct_price_write" ON public.object_price
  FOR ALL TO authenticated USING (api.is_object_owner(object_id)) WITH CHECK (api.is_object_owner(object_id));
DROP POLICY IF EXISTS "workspace_direct_discount_write" ON public.object_discount;
CREATE POLICY "workspace_direct_discount_write" ON public.object_discount
  FOR ALL TO authenticated USING (api.is_object_owner(object_id)) WITH CHECK (api.is_object_owner(object_id));

DROP POLICY IF EXISTS "workspace_direct_price_period_write" ON public.object_price_period;
CREATE POLICY "workspace_direct_price_period_write" ON public.object_price_period
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.object_price p
    WHERE p.id = object_price_period.price_id AND api.is_object_owner(p.object_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.object_price p
    WHERE p.id = object_price_period.price_id AND api.is_object_owner(p.object_id)
  ));

DROP POLICY IF EXISTS "workspace_iti_write" ON public.object_iti;
CREATE POLICY "workspace_iti_write" ON public.object_iti
  FOR ALL TO authenticated USING (api.is_object_owner(object_id)) WITH CHECK (api.is_object_owner(object_id));
DROP POLICY IF EXISTS "workspace_iti_practice_write" ON public.object_iti_practice;
CREATE POLICY "workspace_iti_practice_write" ON public.object_iti_practice
  FOR ALL TO authenticated USING (api.is_object_owner(object_id)) WITH CHECK (api.is_object_owner(object_id));
DROP POLICY IF EXISTS "workspace_iti_info_write" ON public.object_iti_info;
CREATE POLICY "workspace_iti_info_write" ON public.object_iti_info
  FOR ALL TO authenticated USING (api.is_object_owner(object_id)) WITH CHECK (api.is_object_owner(object_id));
DROP POLICY IF EXISTS "workspace_iti_stage_write" ON public.object_iti_stage;
CREATE POLICY "workspace_iti_stage_write" ON public.object_iti_stage
  FOR ALL TO authenticated USING (api.is_object_owner(object_id)) WITH CHECK (api.is_object_owner(object_id));
DROP POLICY IF EXISTS "workspace_iti_section_write" ON public.object_iti_section;
CREATE POLICY "workspace_iti_section_write" ON public.object_iti_section
  FOR ALL TO authenticated USING (api.is_object_owner(parent_object_id)) WITH CHECK (api.is_object_owner(parent_object_id));
DROP POLICY IF EXISTS "workspace_iti_profile_write" ON public.object_iti_profile;
CREATE POLICY "workspace_iti_profile_write" ON public.object_iti_profile
  FOR ALL TO authenticated USING (api.is_object_owner(object_id)) WITH CHECK (api.is_object_owner(object_id));
DROP POLICY IF EXISTS "workspace_iti_assoc_write" ON public.object_iti_associated_object;
CREATE POLICY "workspace_iti_assoc_write" ON public.object_iti_associated_object
  FOR ALL TO authenticated USING (api.is_object_owner(object_id)) WITH CHECK (api.is_object_owner(object_id));

DROP POLICY IF EXISTS "workspace_iti_stage_media_write" ON public.object_iti_stage_media;
CREATE POLICY "workspace_iti_stage_media_write" ON public.object_iti_stage_media
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.object_iti_stage s
    WHERE s.id = object_iti_stage_media.stage_id AND api.is_object_owner(s.object_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.object_iti_stage s
    WHERE s.id = object_iti_stage_media.stage_id AND api.is_object_owner(s.object_id)
  ));

DROP POLICY IF EXISTS "workspace_object_relation_write" ON public.object_relation;
CREATE POLICY "workspace_object_relation_write" ON public.object_relation
  FOR ALL TO authenticated USING (api.is_object_owner(source_object_id)) WITH CHECK (api.is_object_owner(source_object_id));
DROP POLICY IF EXISTS "workspace_org_link_write" ON public.object_org_link;
CREATE POLICY "workspace_org_link_write" ON public.object_org_link
  FOR ALL TO authenticated USING (api.is_object_owner(object_id)) WITH CHECK (api.is_object_owner(object_id));

DROP POLICY IF EXISTS "workspace_place_write" ON public.object_place;
CREATE POLICY "workspace_place_write" ON public.object_place
  FOR ALL TO authenticated USING (api.is_object_owner(object_id)) WITH CHECK (api.is_object_owner(object_id));
DROP POLICY IF EXISTS "workspace_zone_write" ON public.object_zone;
CREATE POLICY "workspace_zone_write" ON public.object_zone
  FOR ALL TO authenticated USING (api.is_object_owner(object_id)) WITH CHECK (api.is_object_owner(object_id));

DROP POLICY IF EXISTS "workspace_location_write" ON public.object_location;
CREATE POLICY "workspace_location_write" ON public.object_location
  FOR ALL TO authenticated
  USING (
    (object_id IS NOT NULL AND api.is_object_owner(object_id))
    OR EXISTS (SELECT 1 FROM public.object_place p WHERE p.id = object_location.place_id AND api.is_object_owner(p.object_id))
  )
  WITH CHECK (
    (object_id IS NOT NULL AND api.is_object_owner(object_id))
    OR EXISTS (SELECT 1 FROM public.object_place p WHERE p.id = object_location.place_id AND api.is_object_owner(p.object_id))
  );

DROP POLICY IF EXISTS "workspace_place_description_write" ON public.object_place_description;
CREATE POLICY "workspace_place_description_write" ON public.object_place_description
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.object_place p WHERE p.id = object_place_description.place_id AND api.is_object_owner(p.object_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.object_place p WHERE p.id = object_place_description.place_id AND api.is_object_owner(p.object_id)));

DROP POLICY IF EXISTS "workspace_media_write" ON public.media;
CREATE POLICY "workspace_media_write" ON public.media
  FOR ALL TO authenticated
  USING (
    (object_id IS NOT NULL AND api.is_object_owner(object_id))
    OR EXISTS (SELECT 1 FROM public.object_place p WHERE p.id = media.place_id AND api.is_object_owner(p.object_id))
  )
  WITH CHECK (
    (object_id IS NOT NULL AND api.is_object_owner(object_id))
    OR EXISTS (SELECT 1 FROM public.object_place p WHERE p.id = media.place_id AND api.is_object_owner(p.object_id))
  );

CREATE OR REPLACE FUNCTION api.save_object_commercial(p_object_id text, p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, api, internal
AS $$
DECLARE
  v_counts jsonb := '{}'::jsonb;
  v_warnings text[] := ARRAY[]::text[];
  v_skipped text[] := ARRAY[]::text[];
  v_row jsonb;
  v_child jsonb;
  v_count integer;
  v_inserted integer;
  v_id uuid;
  v_parent_id uuid;
BEGIN
  PERFORM internal.workspace_assert_can_write_object(p_object_id);
  p_payload := COALESCE(p_payload, '{}'::jsonb);

  IF p_payload ? 'languages' THEN
    DELETE FROM public.object_language WHERE object_id = p_object_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_inserted := 0;
    FOR v_row IN SELECT value FROM jsonb_array_elements(internal.workspace_jsonb_array(p_payload->'languages')) AS t(value) LOOP
      v_id := internal.workspace_uuid(v_row->>'language_id');
      IF v_id IS NULL THEN
        SELECT id INTO v_id FROM public.ref_language WHERE lower(code) = lower(v_row->>'language_code');
      END IF;
      IF v_id IS NULL THEN
        RAISE EXCEPTION 'Unknown language reference: %', v_row USING ERRCODE = '23503';
      END IF;
      INSERT INTO public.object_language (object_id, language_id, level_id, extra)
      VALUES (
        p_object_id,
        v_id,
        COALESCE(
          internal.workspace_uuid(v_row->>'level_id'),
          (SELECT id FROM public.ref_code_language_level WHERE lower(code) = lower(v_row->>'level_code') LIMIT 1)
        ),
        internal.workspace_jsonb_object(v_row->'extra')
      );
      v_inserted := v_inserted + 1;
    END LOOP;
    v_counts := v_counts || jsonb_build_object('object_language_deleted', v_count, 'object_language_inserted', v_inserted);
  END IF;

  IF p_payload ? 'payment_methods' THEN
    DELETE FROM public.object_payment_method WHERE object_id = p_object_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_inserted := 0;
    FOR v_row IN SELECT value FROM jsonb_array_elements(internal.workspace_jsonb_array(p_payload->'payment_methods')) AS t(value) LOOP
      v_id := internal.workspace_uuid(v_row->>'payment_method_id');
      IF v_id IS NULL THEN
        SELECT id INTO v_id FROM public.ref_code_payment_method WHERE lower(code) = lower(v_row->>'payment_method_code');
      END IF;
      IF v_id IS NULL THEN
        RAISE EXCEPTION 'Unknown payment_method reference: %', v_row USING ERRCODE = '23503';
      END IF;
      INSERT INTO public.object_payment_method (object_id, payment_method_id) VALUES (p_object_id, v_id);
      v_inserted := v_inserted + 1;
    END LOOP;
    v_counts := v_counts || jsonb_build_object('object_payment_method_deleted', v_count, 'object_payment_method_inserted', v_inserted);
  END IF;

  IF p_payload ? 'environment_tags' THEN
    DELETE FROM public.object_environment_tag WHERE object_id = p_object_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_inserted := 0;
    FOR v_row IN SELECT value FROM jsonb_array_elements(internal.workspace_jsonb_array(p_payload->'environment_tags')) AS t(value) LOOP
      v_id := internal.workspace_uuid(v_row->>'environment_tag_id');
      IF v_id IS NULL THEN
        SELECT id INTO v_id FROM public.ref_code_environment_tag WHERE lower(code) = lower(v_row->>'environment_tag_code');
      END IF;
      IF v_id IS NULL THEN
        RAISE EXCEPTION 'Unknown environment_tag reference: %', v_row USING ERRCODE = '23503';
      END IF;
      INSERT INTO public.object_environment_tag (object_id, environment_tag_id) VALUES (p_object_id, v_id);
      v_inserted := v_inserted + 1;
    END LOOP;
    v_counts := v_counts || jsonb_build_object('object_environment_tag_deleted', v_count, 'object_environment_tag_inserted', v_inserted);
  END IF;

  IF p_payload ? 'amenities' THEN
    DELETE FROM public.object_amenity WHERE object_id = p_object_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_inserted := 0;
    FOR v_row IN SELECT value FROM jsonb_array_elements(internal.workspace_jsonb_array(p_payload->'amenities')) AS t(value) LOOP
      v_id := internal.workspace_uuid(v_row->>'amenity_id');
      IF v_id IS NULL THEN
        SELECT id INTO v_id FROM public.ref_amenity WHERE lower(code) = lower(v_row->>'amenity_code');
      END IF;
      IF v_id IS NULL THEN
        RAISE EXCEPTION 'Unknown amenity reference: %', v_row USING ERRCODE = '23503';
      END IF;
      INSERT INTO public.object_amenity (object_id, amenity_id) VALUES (p_object_id, v_id);
      v_inserted := v_inserted + 1;
    END LOOP;
    v_counts := v_counts || jsonb_build_object('object_amenity_deleted', v_count, 'object_amenity_inserted', v_inserted);
  END IF;

  IF p_payload ? 'capacities' THEN
    DELETE FROM public.object_capacity WHERE object_id = p_object_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_inserted := 0;
    FOR v_row IN SELECT value FROM jsonb_array_elements(internal.workspace_jsonb_array(p_payload->'capacities')) AS t(value) LOOP
      v_id := internal.workspace_uuid(v_row->>'metric_id');
      IF v_id IS NULL THEN
        SELECT id INTO v_id FROM public.ref_capacity_metric WHERE lower(code) = lower(v_row->>'metric_code');
      END IF;
      IF v_id IS NULL THEN
        RAISE EXCEPTION 'Unknown capacity metric reference: %', v_row USING ERRCODE = '23503';
      END IF;
      INSERT INTO public.object_capacity (id, object_id, metric_id, value_integer, effective_from, effective_to)
      VALUES (
        COALESCE(internal.workspace_uuid(v_row->>'id'), gen_random_uuid()),
        p_object_id,
        v_id,
        NULLIF(v_row->>'value_integer', '')::integer,
        NULLIF(v_row->>'effective_from', '')::date,
        NULLIF(v_row->>'effective_to', '')::date
      );
      v_inserted := v_inserted + 1;
    END LOOP;
    v_counts := v_counts || jsonb_build_object('object_capacity_deleted', v_count, 'object_capacity_inserted', v_inserted);
  END IF;

  IF p_payload ? 'group_policy' THEN
    IF p_payload->'group_policy' = 'null'::jsonb THEN
      DELETE FROM public.object_group_policy WHERE object_id = p_object_id;
      GET DIAGNOSTICS v_count = ROW_COUNT;
      v_counts := v_counts || jsonb_build_object('object_group_policy_deleted', v_count);
    ELSE
      v_row := internal.workspace_jsonb_object(p_payload->'group_policy');
      INSERT INTO public.object_group_policy (object_id, min_size, max_size, group_only, notes)
      VALUES (
        p_object_id,
        NULLIF(v_row->>'min_size', '')::integer,
        NULLIF(v_row->>'max_size', '')::integer,
        COALESCE(NULLIF(v_row->>'group_only', '')::boolean, false),
        NULLIF(v_row->>'notes', '')
      )
      ON CONFLICT (object_id) DO UPDATE SET
        min_size = EXCLUDED.min_size,
        max_size = EXCLUDED.max_size,
        group_only = EXCLUDED.group_only,
        notes = EXCLUDED.notes,
        updated_at = now();
      v_counts := v_counts || jsonb_build_object('object_group_policy_upserted', 1);
    END IF;
  END IF;

  IF p_payload ? 'pet_policy' THEN
    IF p_payload->'pet_policy' = 'null'::jsonb THEN
      DELETE FROM public.object_pet_policy WHERE object_id = p_object_id;
      GET DIAGNOSTICS v_count = ROW_COUNT;
      v_counts := v_counts || jsonb_build_object('object_pet_policy_deleted', v_count);
    ELSE
      v_row := internal.workspace_jsonb_object(p_payload->'pet_policy');
      INSERT INTO public.object_pet_policy (object_id, accepted, conditions)
      VALUES (p_object_id, COALESCE(NULLIF(v_row->>'accepted', '')::boolean, false), NULLIF(v_row->>'conditions', ''))
      ON CONFLICT (object_id) DO UPDATE SET
        accepted = EXCLUDED.accepted,
        conditions = EXCLUDED.conditions,
        updated_at = now();
      v_counts := v_counts || jsonb_build_object('object_pet_policy_upserted', 1);
    END IF;
  END IF;

  IF p_payload ? 'discounts' THEN
    DELETE FROM public.object_discount WHERE object_id = p_object_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_inserted := 0;
    FOR v_row IN SELECT value FROM jsonb_array_elements(internal.workspace_jsonb_array(p_payload->'discounts')) AS t(value) LOOP
      INSERT INTO public.object_discount (
        id, object_id, conditions, discount_percent, discount_amount, currency,
        min_group_size, max_group_size, valid_from, valid_to, source
      )
      VALUES (
        COALESCE(internal.workspace_uuid(v_row->>'id'), gen_random_uuid()),
        p_object_id,
        NULLIF(v_row->>'conditions', ''),
        NULLIF(v_row->>'discount_percent', '')::numeric,
        NULLIF(v_row->>'discount_amount', '')::numeric,
        NULLIF(v_row->>'currency', ''),
        NULLIF(v_row->>'min_group_size', '')::integer,
        NULLIF(v_row->>'max_group_size', '')::integer,
        NULLIF(v_row->>'valid_from', '')::date,
        NULLIF(v_row->>'valid_to', '')::date,
        NULLIF(v_row->>'source', '')
      );
      v_inserted := v_inserted + 1;
    END LOOP;
    v_counts := v_counts || jsonb_build_object('object_discount_deleted', v_count, 'object_discount_inserted', v_inserted);
  END IF;

  IF p_payload ? 'prices' THEN
    DELETE FROM public.object_price WHERE object_id = p_object_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_inserted := 0;
    FOR v_row IN SELECT value FROM jsonb_array_elements(internal.workspace_jsonb_array(p_payload->'prices')) AS t(value) LOOP
      v_id := internal.workspace_uuid(v_row->>'kind_id');
      IF v_id IS NULL THEN
        SELECT id INTO v_id FROM public.ref_code_price_kind WHERE lower(code) = lower(v_row->>'kind_code');
      END IF;
      IF v_id IS NULL THEN
        RAISE EXCEPTION 'Unknown price kind reference: %', v_row USING ERRCODE = '23503';
      END IF;

      INSERT INTO public.object_price (
        id, object_id, kind_id, unit_id, amount, amount_max, currency, season_code, indication_code,
        age_min_enfant, age_max_enfant, age_min_junior, age_max_junior, valid_from, valid_to, conditions, source
      )
      VALUES (
        COALESCE(internal.workspace_uuid(v_row->>'id'), gen_random_uuid()),
        p_object_id,
        v_id,
        COALESCE(
          internal.workspace_uuid(v_row->>'unit_id'),
          (SELECT id FROM public.ref_code_price_unit WHERE lower(code) = lower(v_row->>'unit_code') LIMIT 1)
        ),
        NULLIF(v_row->>'amount', '')::numeric,
        NULLIF(v_row->>'amount_max', '')::numeric,
        COALESCE(NULLIF(v_row->>'currency', ''), 'EUR'),
        NULLIF(v_row->>'season_code', ''),
        NULLIF(v_row->>'indication_code', ''),
        NULLIF(v_row->>'age_min_enfant', '')::smallint,
        NULLIF(v_row->>'age_max_enfant', '')::smallint,
        NULLIF(v_row->>'age_min_junior', '')::smallint,
        NULLIF(v_row->>'age_max_junior', '')::smallint,
        NULLIF(v_row->>'valid_from', '')::date,
        NULLIF(v_row->>'valid_to', '')::date,
        NULLIF(v_row->>'conditions', ''),
        NULLIF(v_row->>'source', '')
      )
      RETURNING id INTO v_parent_id;

      FOR v_child IN SELECT value FROM jsonb_array_elements(internal.workspace_jsonb_array(v_row->'periods')) AS t(value) LOOP
        INSERT INTO public.object_price_period (id, price_id, start_date, end_date, start_time, end_time, note)
        VALUES (
          COALESCE(internal.workspace_uuid(v_child->>'id'), gen_random_uuid()),
          v_parent_id,
          NULLIF(v_child->>'start_date', '')::date,
          NULLIF(v_child->>'end_date', '')::date,
          NULLIF(v_child->>'start_time', '')::time,
          NULLIF(v_child->>'end_time', '')::time,
          NULLIF(v_child->>'note', '')
        );
      END LOOP;
      v_inserted := v_inserted + 1;
    END LOOP;
    v_counts := v_counts || jsonb_build_object('object_price_deleted', v_count, 'object_price_inserted', v_inserted);
  END IF;

  IF p_payload ? 'promotions' THEN
    v_skipped := array_append(v_skipped, 'promotions');
    v_warnings := array_append(v_warnings, 'Promotions are not writable by this RPC; ownership/publication rules are not part of the DB contract yet.');
  END IF;

  RETURN internal.workspace_result(true, v_counts, v_skipped, v_warnings);
END;
$$;

CREATE OR REPLACE FUNCTION api.save_object_openings(p_object_id text, p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, api, internal
AS $$
DECLARE
  v_counts jsonb := '{}'::jsonb;
  v_warnings text[] := ARRAY[]::text[];
  v_skipped text[] := ARRAY[]::text[];
  v_period jsonb;
  v_schedule jsonb;
  v_time_period jsonb;
  v_weekday jsonb;
  v_frame jsonb;
  v_period_id uuid;
  v_schedule_id uuid;
  v_time_period_id uuid;
  v_schedule_type_id uuid;
  v_weekday_id uuid;
  v_deleted integer;
  v_inserted_periods integer := 0;
  v_inserted_schedules integer := 0;
  v_inserted_time_periods integer := 0;
  v_inserted_weekdays integer := 0;
  v_inserted_frames integer := 0;
BEGIN
  PERFORM internal.workspace_assert_can_write_object(p_object_id);
  p_payload := COALESCE(p_payload, '{}'::jsonb);

  IF NOT (p_payload ? 'periods') THEN
    RETURN internal.workspace_result(true, v_counts, v_skipped, v_warnings);
  END IF;

  DELETE FROM public.opening_period WHERE object_id = p_object_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  FOR v_period IN SELECT value FROM jsonb_array_elements(internal.workspace_jsonb_array(p_payload->'periods')) AS t(value) LOOP
    INSERT INTO public.opening_period (
      id, object_id, name, date_start, date_end, source_period_id, all_years, name_i18n, extra
    )
    VALUES (
      COALESCE(internal.workspace_uuid(v_period->>'id'), gen_random_uuid()),
      p_object_id,
      NULLIF(v_period->>'name', ''),
      NULLIF(v_period->>'date_start', '')::date,
      NULLIF(v_period->>'date_end', '')::date,
      NULLIF(v_period->>'source_period_id', ''),
      COALESCE(NULLIF(v_period->>'all_years', '')::boolean, false),
      CASE WHEN jsonb_typeof(v_period->'name_i18n') = 'object' THEN v_period->'name_i18n' ELSE NULL END,
      internal.workspace_jsonb_object(v_period->'extra')
    )
    RETURNING id INTO v_period_id;
    v_inserted_periods := v_inserted_periods + 1;

    FOR v_schedule IN SELECT value FROM jsonb_array_elements(internal.workspace_jsonb_array(v_period->'schedules')) AS t(value) LOOP
      v_schedule_type_id := COALESCE(
        internal.workspace_uuid(v_schedule->>'schedule_type_id'),
        (SELECT id FROM public.ref_code_opening_schedule_type WHERE lower(code) = lower(v_schedule->>'schedule_type_code') LIMIT 1),
        (SELECT id FROM public.ref_code_opening_schedule_type WHERE lower(code) = 'regular' LIMIT 1)
      );
      IF v_schedule_type_id IS NULL THEN
        RAISE EXCEPTION 'Unknown opening schedule type: %', v_schedule USING ERRCODE = '23503';
      END IF;

      INSERT INTO public.opening_schedule (
        id, period_id, schedule_type_id, name, note, name_i18n, note_i18n, extra
      )
      VALUES (
        COALESCE(internal.workspace_uuid(v_schedule->>'id'), gen_random_uuid()),
        v_period_id,
        v_schedule_type_id,
        NULLIF(v_schedule->>'name', ''),
        NULLIF(v_schedule->>'note', ''),
        CASE WHEN jsonb_typeof(v_schedule->'name_i18n') = 'object' THEN v_schedule->'name_i18n' ELSE NULL END,
        CASE WHEN jsonb_typeof(v_schedule->'note_i18n') = 'object' THEN v_schedule->'note_i18n' ELSE NULL END,
        internal.workspace_jsonb_object(v_schedule->'extra')
      )
      RETURNING id INTO v_schedule_id;
      v_inserted_schedules := v_inserted_schedules + 1;

      FOR v_time_period IN SELECT value FROM jsonb_array_elements(internal.workspace_jsonb_array(v_schedule->'time_periods')) AS t(value) LOOP
        INSERT INTO public.opening_time_period (id, schedule_id, closed, note)
        VALUES (
          COALESCE(internal.workspace_uuid(v_time_period->>'id'), gen_random_uuid()),
          v_schedule_id,
          COALESCE(NULLIF(v_time_period->>'closed', '')::boolean, false),
          NULLIF(v_time_period->>'note', '')
        )
        RETURNING id INTO v_time_period_id;
        v_inserted_time_periods := v_inserted_time_periods + 1;

        FOR v_weekday IN SELECT value FROM jsonb_array_elements(internal.workspace_jsonb_array(v_time_period->'weekdays')) AS t(value) LOOP
          v_weekday_id := COALESCE(
            internal.workspace_uuid(v_weekday->>'weekday_id'),
            (SELECT id FROM public.ref_code_weekday WHERE lower(code) = lower(v_weekday->>'weekday_code') LIMIT 1),
            (SELECT id FROM public.ref_code_weekday WHERE lower(code) = lower(v_weekday->>'code') LIMIT 1)
          );
          IF v_weekday_id IS NULL THEN
            RAISE EXCEPTION 'Unknown weekday reference: %', v_weekday USING ERRCODE = '23503';
          END IF;
          INSERT INTO public.opening_time_period_weekday (time_period_id, weekday_id)
          VALUES (v_time_period_id, v_weekday_id)
          ON CONFLICT (time_period_id, weekday_id) DO NOTHING;
          v_inserted_weekdays := v_inserted_weekdays + 1;
        END LOOP;

        FOR v_frame IN SELECT value FROM jsonb_array_elements(internal.workspace_jsonb_array(v_time_period->'time_frames')) AS t(value) LOOP
          INSERT INTO public.opening_time_frame (id, time_period_id, start_time, end_time, recurrence)
          VALUES (
            COALESCE(internal.workspace_uuid(v_frame->>'id'), gen_random_uuid()),
            v_time_period_id,
            NULLIF(v_frame->>'start_time', '')::time,
            NULLIF(v_frame->>'end_time', '')::time,
            NULLIF(v_frame->>'recurrence', '')::interval
          );
          v_inserted_frames := v_inserted_frames + 1;
        END LOOP;
      END LOOP;
    END LOOP;
  END LOOP;

  v_counts := jsonb_build_object(
    'opening_period_deleted', v_deleted,
    'opening_period_inserted', v_inserted_periods,
    'opening_schedule_inserted', v_inserted_schedules,
    'opening_time_period_inserted', v_inserted_time_periods,
    'opening_time_period_weekday_inserted', v_inserted_weekdays,
    'opening_time_frame_inserted', v_inserted_frames
  );

  RETURN internal.workspace_result(true, v_counts, v_skipped, v_warnings);
END;
$$;

CREATE OR REPLACE FUNCTION api.save_object_itinerary_nested(p_object_id text, p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, api, internal, extensions  -- extensions: PostGIS ST_MakePoint/ST_SetSRID for stage geom (§111)
AS $$
DECLARE
  v_counts jsonb := '{}'::jsonb;
  v_warnings text[] := ARRAY[]::text[];
  v_skipped text[] := ARRAY[]::text[];
  v_row jsonb;
  v_child jsonb;
  v_id uuid;
  v_stage_id uuid;
  v_deleted integer;
  v_inserted integer;
BEGIN
  PERFORM internal.workspace_assert_can_write_object(p_object_id);
  p_payload := COALESCE(p_payload, '{}'::jsonb);

  IF p_payload ? 'info' THEN
    IF p_payload->'info' = 'null'::jsonb THEN
      DELETE FROM public.object_iti_info WHERE object_id = p_object_id;
      GET DIAGNOSTICS v_deleted = ROW_COUNT;
      v_counts := v_counts || jsonb_build_object('object_iti_info_deleted', v_deleted);
    ELSE
      v_row := internal.workspace_jsonb_object(p_payload->'info');
      INSERT INTO public.object_iti_info (
        object_id, access, ambiance, recommended_parking, required_equipment, info_places, is_child_friendly,
        access_i18n, ambiance_i18n, recommended_parking_i18n, required_equipment_i18n, info_places_i18n
      )
      VALUES (
        p_object_id,
        NULLIF(v_row->>'access', ''),
        NULLIF(v_row->>'ambiance', ''),
        NULLIF(v_row->>'recommended_parking', ''),
        NULLIF(v_row->>'required_equipment', ''),
        NULLIF(v_row->>'info_places', ''),
        NULLIF(v_row->>'is_child_friendly', '')::boolean,
        CASE WHEN jsonb_typeof(v_row->'access_i18n') = 'object' THEN v_row->'access_i18n' ELSE NULL END,
        CASE WHEN jsonb_typeof(v_row->'ambiance_i18n') = 'object' THEN v_row->'ambiance_i18n' ELSE NULL END,
        CASE WHEN jsonb_typeof(v_row->'recommended_parking_i18n') = 'object' THEN v_row->'recommended_parking_i18n' ELSE NULL END,
        CASE WHEN jsonb_typeof(v_row->'required_equipment_i18n') = 'object' THEN v_row->'required_equipment_i18n' ELSE NULL END,
        CASE WHEN jsonb_typeof(v_row->'info_places_i18n') = 'object' THEN v_row->'info_places_i18n' ELSE NULL END
      )
      ON CONFLICT (object_id) DO UPDATE SET
        access = EXCLUDED.access,
        ambiance = EXCLUDED.ambiance,
        recommended_parking = EXCLUDED.recommended_parking,
        required_equipment = EXCLUDED.required_equipment,
        info_places = EXCLUDED.info_places,
        is_child_friendly = EXCLUDED.is_child_friendly,
        access_i18n = EXCLUDED.access_i18n,
        ambiance_i18n = EXCLUDED.ambiance_i18n,
        recommended_parking_i18n = EXCLUDED.recommended_parking_i18n,
        required_equipment_i18n = EXCLUDED.required_equipment_i18n,
        info_places_i18n = EXCLUDED.info_places_i18n,
        updated_at = now();
      v_counts := v_counts || jsonb_build_object('object_iti_info_upserted', 1);
    END IF;
  END IF;

  IF p_payload ? 'stages' THEN
    -- §111 Section 06 ITI: the stage GPS point is now persisted (was skipped). The editor
    -- sends lng/lat (a point inside the trace corridor); extra.kind carries the stage type.
    DELETE FROM public.object_iti_stage WHERE object_id = p_object_id;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    v_inserted := 0;
    FOR v_row IN SELECT value FROM jsonb_array_elements(internal.workspace_jsonb_array(p_payload->'stages')) AS t(value) LOOP
      INSERT INTO public.object_iti_stage (
        id, object_id, name, description, position, name_i18n, description_i18n, extra, geom
      )
      VALUES (
        COALESCE(internal.workspace_uuid(v_row->>'id'), gen_random_uuid()),
        p_object_id,
        NULLIF(v_row->>'name', ''),
        NULLIF(v_row->>'description', ''),
        COALESCE(NULLIF(v_row->>'position', '')::integer, v_inserted),
        CASE WHEN jsonb_typeof(v_row->'name_i18n') = 'object' THEN v_row->'name_i18n' ELSE NULL END,
        CASE WHEN jsonb_typeof(v_row->'description_i18n') = 'object' THEN v_row->'description_i18n' ELSE NULL END,
        internal.workspace_jsonb_object(v_row->'extra'),
        CASE WHEN NULLIF(v_row->>'lng', '') IS NOT NULL AND NULLIF(v_row->>'lat', '') IS NOT NULL
             THEN ST_SetSRID(ST_MakePoint((v_row->>'lng')::float8, (v_row->>'lat')::float8), 4326)::geography
             ELSE NULL END
      )
      RETURNING id INTO v_stage_id;

      FOR v_child IN SELECT value FROM jsonb_array_elements(internal.workspace_jsonb_array(v_row->'media')) AS t(value) LOOP
        v_id := internal.workspace_uuid(v_child->>'media_id');
        IF v_id IS NULL THEN
          RAISE EXCEPTION 'Stage media requires media_id: %', v_child USING ERRCODE = '23503';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM public.media WHERE id = v_id AND (object_id = p_object_id OR place_id IN (SELECT id FROM public.object_place WHERE object_id = p_object_id))) THEN
          RAISE EXCEPTION 'Media % is not scoped to object %', v_id, p_object_id USING ERRCODE = '23503';
        END IF;
        INSERT INTO public.object_iti_stage_media (id, stage_id, media_id, position)
        VALUES (
          COALESCE(internal.workspace_uuid(v_child->>'id'), gen_random_uuid()),
          v_stage_id,
          v_id,
          COALESCE(NULLIF(v_child->>'position', '')::integer, 0)
        );
      END LOOP;
      v_inserted := v_inserted + 1;
    END LOOP;
    v_counts := v_counts || jsonb_build_object('object_iti_stage_deleted', v_deleted, 'object_iti_stage_inserted', v_inserted);
  END IF;

  IF p_payload ? 'sections' THEN
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(internal.workspace_jsonb_array(p_payload->'sections')) AS t(value)
      WHERE value ? 'geom'
    ) THEN
      v_skipped := array_append(v_skipped, 'object_iti_section.geom');
      v_warnings := array_append(v_warnings, 'Section geometry was skipped; geometry validation is not enabled for this RPC.');
    END IF;
    DELETE FROM public.object_iti_section WHERE parent_object_id = p_object_id;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    v_inserted := 0;
    FOR v_row IN SELECT value FROM jsonb_array_elements(internal.workspace_jsonb_array(p_payload->'sections')) AS t(value) LOOP
      INSERT INTO public.object_iti_section (id, parent_object_id, name, position, name_i18n, extra)
      VALUES (
        COALESCE(internal.workspace_uuid(v_row->>'id'), gen_random_uuid()),
        p_object_id,
        NULLIF(v_row->>'name', ''),
        COALESCE(NULLIF(v_row->>'position', '')::integer, v_inserted),
        CASE WHEN jsonb_typeof(v_row->'name_i18n') = 'object' THEN v_row->'name_i18n' ELSE NULL END,
        internal.workspace_jsonb_object(v_row->'extra')
      );
      v_inserted := v_inserted + 1;
    END LOOP;
    v_counts := v_counts || jsonb_build_object('object_iti_section_deleted', v_deleted, 'object_iti_section_inserted', v_inserted);
  END IF;

  IF p_payload ? 'profiles' THEN
    DELETE FROM public.object_iti_profile WHERE object_id = p_object_id;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    v_inserted := 0;
    FOR v_row IN SELECT value FROM jsonb_array_elements(internal.workspace_jsonb_array(p_payload->'profiles')) AS t(value) LOOP
      INSERT INTO public.object_iti_profile (id, object_id, position_m, elevation_m)
      VALUES (
        COALESCE(internal.workspace_uuid(v_row->>'id'), gen_random_uuid()),
        p_object_id,
        NULLIF(v_row->>'position_m', '')::numeric,
        NULLIF(v_row->>'elevation_m', '')::numeric
      );
      v_inserted := v_inserted + 1;
    END LOOP;
    v_counts := v_counts || jsonb_build_object('object_iti_profile_deleted', v_deleted, 'object_iti_profile_inserted', v_inserted);
  END IF;

  IF p_payload ? 'associated_objects' THEN
    DELETE FROM public.object_iti_associated_object WHERE object_id = p_object_id;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    v_inserted := 0;
    FOR v_row IN SELECT value FROM jsonb_array_elements(internal.workspace_jsonb_array(p_payload->'associated_objects')) AS t(value) LOOP
      v_id := internal.workspace_uuid(v_row->>'role_id');
      IF v_id IS NULL THEN
        SELECT id INTO v_id FROM public.ref_iti_assoc_role WHERE lower(code) = lower(v_row->>'role_code');
      END IF;
      IF v_id IS NULL THEN
        RAISE EXCEPTION 'Unknown itinerary association role: %', v_row USING ERRCODE = '23503';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM public.object WHERE id = v_row->>'associated_object_id') THEN
        RAISE EXCEPTION 'Unknown associated object: %', v_row->>'associated_object_id' USING ERRCODE = '23503';
      END IF;
      INSERT INTO public.object_iti_associated_object (object_id, associated_object_id, role_id, note)
      VALUES (p_object_id, v_row->>'associated_object_id', v_id, NULLIF(v_row->>'note', ''));
      v_inserted := v_inserted + 1;
    END LOOP;
    v_counts := v_counts || jsonb_build_object('object_iti_associated_object_deleted', v_deleted, 'object_iti_associated_object_inserted', v_inserted);
  END IF;

  IF p_payload ? 'geom' THEN
    v_skipped := array_append(v_skipped, 'object_iti.geom');
    v_warnings := array_append(v_warnings, 'Itinerary trace geometry was skipped; geometry validation is not enabled for this RPC.');
  END IF;

  RETURN internal.workspace_result(true, v_counts, v_skipped, v_warnings);
END;
$$;

-- ⚠ BODY SYNC: this function body must stay byte-identical to the copy in migration_actor_links_editor.sql (8r re-applies it after this file on fresh installs). Edit BOTH or fresh ≠ live.
CREATE OR REPLACE FUNCTION api.save_object_relations(p_object_id text, p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, api, internal
AS $$
DECLARE
  v_counts jsonb := '{}'::jsonb;
  v_warnings text[] := ARRAY[]::text[];
  v_skipped text[] := ARRAY[]::text[];
  v_row jsonb;
  v_id uuid;
  v_deleted integer;
  v_inserted integer;
BEGIN
  PERFORM internal.workspace_assert_can_write_object(p_object_id);
  p_payload := COALESCE(p_payload, '{}'::jsonb);

  IF p_payload ? 'object_relations' THEN
    DELETE FROM public.object_relation WHERE source_object_id = p_object_id;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    v_inserted := 0;
    FOR v_row IN SELECT value FROM jsonb_array_elements(internal.workspace_jsonb_array(p_payload->'object_relations')) AS t(value) LOOP
      IF COALESCE(NULLIF(v_row->>'source_object_id', ''), p_object_id) <> p_object_id THEN
        RAISE EXCEPTION 'object_relations source_object_id must match p_object_id' USING ERRCODE = '22023';
      END IF;
      IF v_row->>'target_object_id' = p_object_id THEN
        RAISE EXCEPTION 'object_relation cannot target itself' USING ERRCODE = '23514';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM public.object WHERE id = v_row->>'target_object_id') THEN
        RAISE EXCEPTION 'Unknown target_object_id: %', v_row->>'target_object_id' USING ERRCODE = '23503';
      END IF;
      v_id := internal.workspace_uuid(v_row->>'relation_type_id');
      IF v_id IS NULL THEN
        SELECT id INTO v_id FROM public.ref_object_relation_type WHERE lower(code) = lower(v_row->>'relation_type_code');
      END IF;
      IF v_id IS NULL THEN
        RAISE EXCEPTION 'Unknown relation_type reference: %', v_row USING ERRCODE = '23503';
      END IF;
      INSERT INTO public.object_relation (id, source_object_id, target_object_id, relation_type_id, distance_m, note, position)
      VALUES (
        COALESCE(internal.workspace_uuid(v_row->>'id'), gen_random_uuid()),
        p_object_id,
        v_row->>'target_object_id',
        v_id,
        NULLIF(v_row->>'distance_m', '')::numeric,
        NULLIF(v_row->>'note', ''),
        COALESCE(NULLIF(v_row->>'position', '')::integer, v_inserted)
      );
      v_inserted := v_inserted + 1;
    END LOOP;
    v_counts := v_counts || jsonb_build_object('object_relation_deleted', v_deleted, 'object_relation_inserted', v_inserted);
  END IF;

  IF p_payload ? 'org_links' THEN
    IF (
      SELECT count(*)
      FROM jsonb_array_elements(internal.workspace_jsonb_array(p_payload->'org_links')) AS t(value)
      WHERE COALESCE(NULLIF(value->>'is_primary', '')::boolean, false)
    ) > 1 THEN
      RAISE EXCEPTION 'Only one primary organization link is allowed per object' USING ERRCODE = '23505';
    END IF;

    DELETE FROM public.object_org_link WHERE object_id = p_object_id;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    v_inserted := 0;
    FOR v_row IN SELECT value FROM jsonb_array_elements(internal.workspace_jsonb_array(p_payload->'org_links')) AS t(value) LOOP
      IF NOT EXISTS (SELECT 1 FROM public.object WHERE id = v_row->>'org_object_id') THEN
        RAISE EXCEPTION 'Unknown org_object_id: %', v_row->>'org_object_id' USING ERRCODE = '23503';
      END IF;
      v_id := internal.workspace_uuid(v_row->>'role_id');
      IF v_id IS NULL THEN
        SELECT id INTO v_id FROM public.ref_org_role WHERE lower(code) = lower(v_row->>'role_code');
      END IF;
      IF v_id IS NULL THEN
        RAISE EXCEPTION 'Unknown org role reference: %', v_row USING ERRCODE = '23503';
      END IF;
      INSERT INTO public.object_org_link (object_id, org_object_id, role_id, is_primary, note)
      VALUES (
        p_object_id,
        v_row->>'org_object_id',
        v_id,
        COALESCE(NULLIF(v_row->>'is_primary', '')::boolean, false),
        NULLIF(v_row->>'note', '')
      );
      v_inserted := v_inserted + 1;
    END LOOP;
    v_counts := v_counts || jsonb_build_object('object_org_link_deleted', v_deleted, 'object_org_link_inserted', v_inserted);
  END IF;

  IF p_payload ? 'incoming_relations' THEN
    v_skipped := array_append(v_skipped, 'incoming_relations');
    v_warnings := array_append(v_warnings, 'Incoming relations are read-only here because their source object owns the write.');
  END IF;
  -- §48/§95: actor links (actor_object_role only — actor_channel/actor_consent stay out of contract).
  IF p_payload ? 'actors' THEN
    DELETE FROM public.actor_object_role WHERE object_id = p_object_id;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    v_inserted := 0;
    FOR v_row IN SELECT value FROM jsonb_array_elements(internal.workspace_jsonb_array(p_payload->'actors')) AS t(value) LOOP
      -- §95: existence is FK-enforced (actor_object_role.actor_id -> actor(id)). Do NOT add an EXISTS
      -- over public.actor here: this fn is SECURITY INVOKER, so that probe is filtered by ext_actor_read
      -- and would HIDE actors the caller cannot READ (e.g. a not-yet-linked prestataire), failing the
      -- save for any non-admin editor even though they may WRITE the object. Authorization is
      -- workspace_assert_can_write_object; api.search_actors bounds the offered set. Unknown id -> FK 23503.
      IF internal.workspace_uuid(v_row->>'actor_id') IS NULL THEN
        RAISE EXCEPTION 'Invalid or missing actor_id: %', COALESCE(v_row->>'actor_id', '(null)') USING ERRCODE = '22023';
      END IF;
      v_id := internal.workspace_uuid(v_row->>'role_id');
      IF v_id IS NULL THEN
        SELECT ref.id INTO v_id FROM public.ref_actor_role ref WHERE lower(ref.code) = lower(v_row->>'role_code');
      END IF;
      IF v_id IS NULL THEN
        RAISE EXCEPTION 'Unknown actor role reference: %', v_row USING ERRCODE = '23503';
      END IF;
      IF COALESCE(NULLIF(v_row->>'visibility', ''), 'public') NOT IN ('public', 'private', 'partners') THEN
        RAISE EXCEPTION 'Invalid actor link visibility: %', v_row->>'visibility' USING ERRCODE = '22023';
      END IF;
      -- ≤1 primary per (object, role) is enforced by uq_actor_object_role_primary (unique partial index).
      INSERT INTO public.actor_object_role (actor_id, object_id, role_id, is_primary, valid_from, valid_to, visibility, note)
      VALUES (
        internal.workspace_uuid(v_row->>'actor_id'),
        p_object_id,
        v_id,
        COALESCE(NULLIF(v_row->>'is_primary', '')::boolean, false),
        NULLIF(v_row->>'valid_from', '')::date,
        NULLIF(v_row->>'valid_to', '')::date,
        COALESCE(NULLIF(v_row->>'visibility', ''), 'public'),
        NULLIF(v_row->>'note', '')
      );
      v_inserted := v_inserted + 1;
    END LOOP;
    v_counts := v_counts || jsonb_build_object('actor_object_role_deleted', v_deleted, 'actor_object_role_inserted', v_inserted);
  END IF;

  RETURN internal.workspace_result(true, v_counts, v_skipped, v_warnings);
END;
$$;

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
  v_id uuid;
  v_deleted integer;
  v_inserted integer;
  v_media_count integer;
BEGIN
  PERFORM internal.workspace_assert_can_write_object(p_object_id);
  p_payload := COALESCE(p_payload, '{}'::jsonb);

  IF p_payload ? 'places' THEN
    IF (
      SELECT count(*)
      FROM jsonb_array_elements(internal.workspace_jsonb_array(p_payload->'places')) AS t(value)
      WHERE COALESCE(NULLIF(value->>'is_primary', '')::boolean, false)
    ) > 1 THEN
      RAISE EXCEPTION 'Only one primary place is allowed per object' USING ERRCODE = '23505';
    END IF;

    DELETE FROM public.object_place WHERE object_id = p_object_id;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    v_inserted := 0;
    v_media_count := 0;
    FOR v_place IN SELECT value FROM jsonb_array_elements(internal.workspace_jsonb_array(p_payload->'places')) AS t(value) LOOP
      INSERT INTO public.object_place (id, object_id, label, slug, is_primary, position, effective_from, effective_to, extra)
      VALUES (
        COALESCE(internal.workspace_uuid(v_place->>'id'), gen_random_uuid()),
        p_object_id,
        NULLIF(v_place->>'label', ''),
        NULLIF(v_place->>'slug', ''),
        COALESCE(NULLIF(v_place->>'is_primary', '')::boolean, false),
        COALESCE(NULLIF(v_place->>'position', '')::integer, v_inserted),
        NULLIF(v_place->>'effective_from', '')::date,
        NULLIF(v_place->>'effective_to', '')::date,
        internal.workspace_jsonb_object(v_place->'extra')
      )
      RETURNING id INTO v_place_id;
      v_inserted := v_inserted + 1;

      FOR v_row IN SELECT value FROM jsonb_array_elements(internal.workspace_jsonb_array(v_place->'locations')) AS t(value) LOOP
        INSERT INTO public.object_location (
          id, place_id, address1, address1_suite, address2, address3, postcode, city, code_insee,
          lieu_dit, direction, latitude, longitude, altitude_m, is_main_location, position
        )
        VALUES (
          COALESCE(internal.workspace_uuid(v_row->>'id'), gen_random_uuid()),
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
          COALESCE(NULLIF(v_row->>'is_main_location', '')::boolean, false),
          COALESCE(NULLIF(v_row->>'position', '')::integer, 0)
        );
      END LOOP;

      FOR v_row IN SELECT value FROM jsonb_array_elements(internal.workspace_jsonb_array(v_place->'descriptions')) AS t(value) LOOP
        INSERT INTO public.object_place_description (
          id, place_id, description, description_chapo, description_mobile, description_edition,
          description_offre_hors_zone, sanitary_measures, description_adapted, visibility, position, extra,
          description_i18n, description_chapo_i18n, description_mobile_i18n, description_edition_i18n,
          description_offre_hors_zone_i18n, sanitary_measures_i18n, description_adapted_i18n
        )
        VALUES (
          COALESCE(internal.workspace_uuid(v_row->>'id'), gen_random_uuid()),
          v_place_id,
          NULLIF(v_row->>'description', ''),
          NULLIF(v_row->>'description_chapo', ''),
          NULLIF(v_row->>'description_mobile', ''),
          NULLIF(v_row->>'description_edition', ''),
          NULLIF(v_row->>'description_offre_hors_zone', ''),
          NULLIF(v_row->>'sanitary_measures', ''),
          NULLIF(v_row->>'description_adapted', ''),
          NULLIF(v_row->>'visibility', ''),
          COALESCE(NULLIF(v_row->>'position', '')::integer, 0),
          internal.workspace_jsonb_object(v_row->'extra'),
          CASE WHEN jsonb_typeof(v_row->'description_i18n') = 'object' THEN v_row->'description_i18n' ELSE NULL END,
          CASE WHEN jsonb_typeof(v_row->'description_chapo_i18n') = 'object' THEN v_row->'description_chapo_i18n' ELSE NULL END,
          CASE WHEN jsonb_typeof(v_row->'description_mobile_i18n') = 'object' THEN v_row->'description_mobile_i18n' ELSE NULL END,
          CASE WHEN jsonb_typeof(v_row->'description_edition_i18n') = 'object' THEN v_row->'description_edition_i18n' ELSE NULL END,
          CASE WHEN jsonb_typeof(v_row->'description_offre_hors_zone_i18n') = 'object' THEN v_row->'description_offre_hors_zone_i18n' ELSE NULL END,
          CASE WHEN jsonb_typeof(v_row->'sanitary_measures_i18n') = 'object' THEN v_row->'sanitary_measures_i18n' ELSE NULL END,
          CASE WHEN jsonb_typeof(v_row->'description_adapted_i18n') = 'object' THEN v_row->'description_adapted_i18n' ELSE NULL END
        );
      END LOOP;

      FOR v_row IN SELECT value FROM jsonb_array_elements(internal.workspace_jsonb_array(v_place->'media')) AS t(value) LOOP
        v_id := internal.workspace_uuid(v_row->>'media_type_id');
        IF v_id IS NULL THEN
          SELECT id INTO v_id FROM public.ref_code_media_type WHERE lower(code) = lower(v_row->>'media_type_code');
        END IF;
        IF v_id IS NULL THEN
          RAISE EXCEPTION 'Unknown media type reference: %', v_row USING ERRCODE = '23503';
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
    END LOOP;
    v_counts := v_counts || jsonb_build_object('object_place_deleted', v_deleted, 'object_place_inserted', v_inserted, 'place_media_inserted', v_media_count);
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

REVOKE ALL ON FUNCTION api.save_object_commercial(text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION api.save_object_openings(text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION api.save_object_itinerary_nested(text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION api.save_object_relations(text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION api.save_object_places(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.save_object_commercial(text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION api.save_object_openings(text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION api.save_object_itinerary_nested(text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION api.save_object_relations(text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION api.save_object_places(text, jsonb) TO authenticated, service_role;
