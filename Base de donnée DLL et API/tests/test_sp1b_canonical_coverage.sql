-- test_sp1b_canonical_coverage.sql
-- SP-1b coverage assertion: EVERY table the object editor writes must have at least one
-- write policy (ALL/INSERT/UPDATE) whose predicate references api.user_can_write_object_canonical.
-- Run AFTER the full manifest (incl. migration_permission_write_paths.sql + _b.sql).
-- This is the regression guard: if a new editor-write table is added without canonical coverage,
-- or an existing one regresses, CI goes red. (object_description is intentionally excluded — it uses
-- the §20 carve-out api.user_can_write_canonical + org_object_id IS NULL.)
\set ON_ERROR_STOP on
DO $$
DECLARE
  v_expected text[] := ARRAY[
    -- SP-1b (this migration)
    'object_amenity','object_capacity','object_environment_tag','object_language','object_payment_method',
    'object_zone','object_org_link','object_iti','object_iti_associated_object','object_iti_info',
    'object_iti_practice','object_iti_profile','object_iti_section','object_iti_stage','opening_period',
    'opening_schedule','opening_time_frame','object_place_description','object_relation','tag_link',
    'object_sustainability_action','object_sustainability_action_label','object_room_type',
    'object_room_type_amenity','object_room_type_media','object_classification','object_taxonomy',
    -- SP-1 (already covered)
    'object_location','object_place','contact_channel','media','object_legal','object_discount',
    'object_group_policy','object_price','object_price_period','object_menu','object_meeting_room',
    'meeting_room_equipment','object_pet_policy','object_fma_occurrence','object_iti_stage_media','object_membership'
  ];
  v_missing text[] := ARRAY[]::text[];
  v_t text;
BEGIN
  FOREACH v_t IN ARRAY v_expected LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename = v_t AND cmd IN ('ALL','INSERT','UPDATE')
        AND (COALESCE(qual,'')||COALESCE(with_check,'')) ILIKE '%user_can_write_object_canonical%'
    ) THEN
      v_missing := v_missing || v_t;
    END IF;
  END LOOP;

  IF array_length(v_missing, 1) > 0 THEN
    RAISE EXCEPTION 'SP-1b: editor-write tables WITHOUT a canonical-write policy: %', array_to_string(v_missing, ', ');
  END IF;

  RAISE NOTICE 'SP-1b coverage passed: % editor-write tables are canonical-covered.', array_length(v_expected, 1);
END$$;
