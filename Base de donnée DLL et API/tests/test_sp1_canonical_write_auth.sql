-- test_sp1_canonical_write_auth.sql
-- SP-1 structural assertions. Run AFTER the base manifest + migration_permission_write_paths.sql.
-- Deterministic (catalog-only): asserts the helper + status trigger exist, the workspace gate
-- is wired to the helper, and every targeted write policy now references the helper.
-- Behavioral (granted-contributor can write / cannot publish) tests are SP-2.
\set ON_ERROR_STOP on
DO $$
DECLARE
  v_missing text[] := ARRAY[]::text[];
  v_legacy  text[];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname='api' AND p.proname='user_can_write_object_canonical') THEN
    v_missing := v_missing || 'api.user_can_write_object_canonical';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                 WHERE tgname='trg_guard_object_status_change' AND NOT tgisinternal) THEN
    v_missing := v_missing || 'trg_guard_object_status_change';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname='internal' AND p.proname='workspace_assert_can_write_object'
                   AND pg_get_functiondef(p.oid) LIKE '%user_can_write_object_canonical%') THEN
    v_missing := v_missing || 'workspace gate not wired to helper';
  END IF;

  IF array_length(v_missing, 1) > 0 THEN
    RAISE EXCEPTION 'SP-1 objects missing: %', array_to_string(v_missing, ', ');
  END IF;

  -- Every targeted write policy must reference the helper in its USING (qual).
  -- object_description is intentionally excluded (carve-out keeps is_object_owner OR
  -- (user_can_write_canonical AND org_object_id IS NULL)).
  SELECT array_agg(policyname) INTO v_legacy
  FROM pg_policies
  WHERE schemaname='public'
    AND policyname IN (
      'owner_write_location','owner_write_place','owner_write_contact','owner_write_media',
      'owner_write_legal','owner_write_discount','owner_write_group_policy',
      'owner_price_write','owner_price_period_write','owner_menu_write','owner_menu_item_write',
      'owner_menu_item_dietary_write','owner_menu_item_allergen_write','owner_menu_item_cuisine_write',
      'owner_menu_item_media_write','owner_meeting_room_write','owner_meeting_room_equipment_write',
      'owner_pet_policy_write','owner_fma_occurrence_write','owner_iti_stage_media_write',
      'owner_object_membership_write','owner_update_object','owner_delete_object'
    )
    AND COALESCE(qual,'') NOT LIKE '%user_can_write_object_canonical%';
  IF v_legacy IS NOT NULL THEN
    RAISE EXCEPTION 'Policies still on legacy predicate (not wired to helper): %', array_to_string(v_legacy, ', ');
  END IF;

  -- object_description carve-out: must reference BOTH the canonical helper and the overlay guard.
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname='public' AND policyname='owner_write_description'
                   AND qual LIKE '%user_can_write_canonical%' AND qual LIKE '%org_object_id%') THEN
    RAISE EXCEPTION 'owner_write_description carve-out (canonical + org_object_id IS NULL) not in place';
  END IF;

  RAISE NOTICE 'SP-1 structural assertions passed.';
END$$;
