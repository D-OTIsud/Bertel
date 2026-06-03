-- test_p03_read_gate_coverage.sql
-- P0.3 regression guard. Run AFTER the full manifest (incl. migration_rls_read_gate_p03.sql).
-- Asserts: (1) none of the 40 object-child tables still has a permissive SELECT/ALL policy with
-- qual = 'true'; (2) every one has a SELECT-capable policy referencing the read gate
-- (can_read_object, or can_read_extended for media_tag); (3) every nested-path (Family C) FK
-- column has a leading-column index (so a dropped index can't silently restore seq-scan risk).
\set ON_ERROR_STOP on
DO $$
DECLARE
  v_tables text[] := ARRAY[
    'object_place','object_price','object_capacity','object_zone','object_org_link','object_origin',
    'object_fma_occurrence','object_pet_policy','object_menu','object_meeting_room','object_iti_practice',
    'object_iti_stage','object_iti_info','object_iti_associated_object','object_iti_profile','opening_period',
    'object_classification','object_amenity','object_environment_tag','object_language','object_payment_method',
    'promotion_object','object_relation','object_iti_section','object_location','object_price_period',
    'object_menu_item','object_menu_item_dietary_tag','object_menu_item_allergen','object_menu_item_cuisine_type',
    'object_menu_item_media','meeting_room_equipment','object_iti_stage_media','object_place_description',
    'opening_schedule','opening_time_period','opening_time_period_weekday','opening_time_frame','tag_link','media_tag'
  ];
  v_bad text;
BEGIN
  -- 1) No residual USING(true) read policy.
  SELECT string_agg(tablename || '.' || policyname, ', ') INTO v_bad
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = ANY(v_tables)
    AND cmd IN ('SELECT','ALL') AND qual = 'true';
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'P0.3 LEAK OPEN: residual USING(true) read policy on %', v_bad;
  END IF;

  -- 2) Every table has a SELECT-capable policy referencing the read gate.
  SELECT string_agg(t, ', ') INTO v_bad
  FROM unnest(v_tables) AS t
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_policies p
    WHERE p.schemaname = 'public' AND p.tablename = t AND p.cmd IN ('SELECT','ALL')
      AND COALESCE(p.qual,'') ILIKE ANY (ARRAY['%can_read_object%','%can_read_extended%'])
  );
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'P0.3: tables missing a read-gate policy: %', v_bad;
  END IF;

  -- 3) Nested-path FK columns must each have a leading-column index.
  SELECT string_agg(x.tbl || '.' || x.col, ', ') INTO v_bad
  FROM (VALUES
    ('object_price_period','price_id'), ('object_place_description','place_id'),
    ('object_menu_item','menu_id'),
    ('object_menu_item_dietary_tag','menu_item_id'), ('object_menu_item_allergen','menu_item_id'),
    ('object_menu_item_cuisine_type','menu_item_id'), ('object_menu_item_media','menu_item_id'),
    ('meeting_room_equipment','room_id'), ('object_iti_stage_media','stage_id'),
    ('opening_schedule','period_id'), ('opening_time_period','schedule_id'),
    ('opening_time_period_weekday','time_period_id'), ('opening_time_frame','time_period_id'),
    ('object_location','place_id')
  ) AS x(tbl,col)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_index i
    JOIN pg_class c ON c.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = i.indkey[0]
    WHERE n.nspname = 'public' AND c.relname = x.tbl AND a.attname = x.col
  );
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'P0.3: nested-path FK column without a leading-column index: %', v_bad;
  END IF;

  RAISE NOTICE 'P0.3 coverage passed: 40 tables gated, nested-path FKs indexed.';
END$$;
