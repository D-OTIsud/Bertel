-- migration_permission_write_paths.sql
-- SP-1 of P0.2 — canonical-write authorization wired into the editor write paths.
-- Substitutes the legacy `api.is_object_owner(...)` predicate with the ADDITIVE
-- `api.user_can_write_object_canonical(...)` (= is_object_owner OR user_can_write_canonical)
-- across the workspace gate + the 23 object/child-table write policies, and adds a
-- status-change guard so edit_canonical_when_publisher != publish_object.
--
-- PREREQUISITES: schema_unified.sql, rls_policies.sql (defines is_object_owner,
--   user_can_write_canonical, user_can_publish_object, is_platform_superuser),
--   object_workspace_safe_write_rpcs.sql (the gate). APPLY AFTER object_workspace_gap_rpcs.sql.
-- IDEMPOTENT: CREATE OR REPLACE + DROP POLICY/TRIGGER IF EXISTS. TRANSACTION-WRAPPED.
-- REVERSIBLE: see docs/superpowers/specs/2026-06-02-sp1-canonical-write-auth-design.md §7.
-- INERT until SP-2 grants permissions (0 grants on live today); additive => no regression.

BEGIN;

-- 1) Single source of truth for canonical-write authorization (additive OR).
CREATE OR REPLACE FUNCTION api.user_can_write_object_canonical(p_object_id text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, api, auth
AS $fn$
  SELECT api.is_object_owner(p_object_id)            -- legacy actor-owner + service_role/admin + platform superuser
      OR api.user_can_write_canonical(p_object_id);  -- publisher ORG member holding edit_canonical_when_publisher
$fn$;
REVOKE EXECUTE ON FUNCTION api.user_can_write_object_canonical(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.user_can_write_object_canonical(text) TO authenticated, service_role;

-- 2) Workspace gate (was: is_object_owner only).
CREATE OR REPLACE FUNCTION internal.workspace_assert_can_write_object(p_object_id text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, api, internal, auth
AS $fn$
BEGIN
  IF p_object_id IS NULL OR btrim(p_object_id) = '' THEN
    RAISE EXCEPTION 'object_id is required' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.object WHERE id = p_object_id) THEN
    RAISE EXCEPTION 'Unknown object_id: %', p_object_id USING ERRCODE = 'P0002';
  END IF;
  IF NOT api.user_can_write_object_canonical(p_object_id) THEN
    RAISE EXCEPTION 'Current user cannot write object %', p_object_id USING ERRCODE = '42501';
  END IF;
END;
$fn$;

-- 3) object UPDATE / DELETE: created_by OR canonical writer.
DROP POLICY IF EXISTS "owner_update_object" ON object;
CREATE POLICY "owner_update_object" ON object
  FOR UPDATE
  USING      (auth.uid() = created_by OR api.user_can_write_object_canonical(id))
  WITH CHECK (auth.uid() = created_by OR api.user_can_write_object_canonical(id));

DROP POLICY IF EXISTS "owner_delete_object" ON object;
CREATE POLICY "owner_delete_object" ON object
  FOR DELETE
  USING (auth.uid() = created_by OR api.user_can_write_object_canonical(id));

-- 4) Simple child-table write policies (FOR ALL USING object_id).
DROP POLICY IF EXISTS "owner_write_location" ON object_location;
CREATE POLICY "owner_write_location" ON object_location
  FOR ALL USING (api.user_can_write_object_canonical(object_id));

DROP POLICY IF EXISTS "owner_write_place" ON object_place;
CREATE POLICY "owner_write_place" ON object_place
  FOR ALL USING (api.user_can_write_object_canonical(object_id));

DROP POLICY IF EXISTS "owner_write_contact" ON contact_channel;
CREATE POLICY "owner_write_contact" ON contact_channel
  FOR ALL USING (api.user_can_write_object_canonical(object_id));

DROP POLICY IF EXISTS "owner_write_media" ON media;
CREATE POLICY "owner_write_media" ON media
  FOR ALL USING (api.user_can_write_object_canonical(object_id));

DROP POLICY IF EXISTS "owner_write_legal" ON object_legal;
CREATE POLICY "owner_write_legal" ON object_legal
  FOR ALL USING (api.user_can_write_object_canonical(object_id));

DROP POLICY IF EXISTS "owner_write_discount" ON object_discount;
CREATE POLICY "owner_write_discount" ON object_discount
  FOR ALL USING (api.user_can_write_object_canonical(object_id));

DROP POLICY IF EXISTS "owner_write_group_policy" ON object_group_policy;
CREATE POLICY "owner_write_group_policy" ON object_group_policy
  FOR ALL USING (api.user_can_write_object_canonical(object_id));

DROP POLICY IF EXISTS "owner_price_write" ON object_price;
CREATE POLICY "owner_price_write" ON object_price
  FOR ALL USING (api.user_can_write_object_canonical(object_id));

DROP POLICY IF EXISTS "owner_menu_write" ON object_menu;
CREATE POLICY "owner_menu_write" ON object_menu
  FOR ALL USING (api.user_can_write_object_canonical(object_id));

DROP POLICY IF EXISTS "owner_meeting_room_write" ON object_meeting_room;
CREATE POLICY "owner_meeting_room_write" ON object_meeting_room
  FOR ALL USING (api.user_can_write_object_canonical(object_id));

DROP POLICY IF EXISTS "owner_pet_policy_write" ON object_pet_policy;
CREATE POLICY "owner_pet_policy_write" ON object_pet_policy
  FOR ALL USING (api.user_can_write_object_canonical(object_id));

DROP POLICY IF EXISTS "owner_fma_occurrence_write" ON object_fma_occurrence;
CREATE POLICY "owner_fma_occurrence_write" ON object_fma_occurrence
  FOR ALL USING (api.user_can_write_object_canonical(object_id));

-- 5) object_description carve-out: new canonical path is restricted to canonical rows
--    (org_object_id IS NULL); per-org overlays stay the sole domain of rpc_write_org_description (§20).
DROP POLICY IF EXISTS "owner_write_description" ON object_description;
CREATE POLICY "owner_write_description" ON object_description
  FOR ALL USING (
    api.is_object_owner(object_id)
    OR (api.user_can_write_canonical(object_id) AND org_object_id IS NULL)
  );

-- 6) Nested child policies (EXISTS via parent — substitute the inner is_object_owner).
DROP POLICY IF EXISTS "owner_price_period_write" ON object_price_period;
CREATE POLICY "owner_price_period_write" ON object_price_period
  FOR ALL USING (
    EXISTS (SELECT 1 FROM object_price op
            WHERE op.id = object_price_period.price_id
              AND api.user_can_write_object_canonical(op.object_id))
  );

DROP POLICY IF EXISTS "owner_menu_item_write" ON object_menu_item;
CREATE POLICY "owner_menu_item_write" ON object_menu_item
  FOR ALL USING (
    EXISTS (SELECT 1 FROM object_menu om
            WHERE om.id = object_menu_item.menu_id
              AND api.user_can_write_object_canonical(om.object_id))
  );

DROP POLICY IF EXISTS "owner_menu_item_dietary_write" ON object_menu_item_dietary_tag;
CREATE POLICY "owner_menu_item_dietary_write" ON object_menu_item_dietary_tag
  FOR ALL USING (
    EXISTS (SELECT 1 FROM object_menu_item omi
            JOIN object_menu om ON om.id = omi.menu_id
            WHERE omi.id = object_menu_item_dietary_tag.menu_item_id
              AND api.user_can_write_object_canonical(om.object_id))
  );

DROP POLICY IF EXISTS "owner_menu_item_allergen_write" ON object_menu_item_allergen;
CREATE POLICY "owner_menu_item_allergen_write" ON object_menu_item_allergen
  FOR ALL USING (
    EXISTS (SELECT 1 FROM object_menu_item omi
            JOIN object_menu om ON om.id = omi.menu_id
            WHERE omi.id = object_menu_item_allergen.menu_item_id
              AND api.user_can_write_object_canonical(om.object_id))
  );

DROP POLICY IF EXISTS "owner_menu_item_cuisine_write" ON object_menu_item_cuisine_type;
CREATE POLICY "owner_menu_item_cuisine_write" ON object_menu_item_cuisine_type
  FOR ALL USING (
    EXISTS (SELECT 1 FROM object_menu_item omi
            JOIN object_menu om ON om.id = omi.menu_id
            WHERE omi.id = object_menu_item_cuisine_type.menu_item_id
              AND api.user_can_write_object_canonical(om.object_id))
  );

DROP POLICY IF EXISTS "owner_menu_item_media_write" ON object_menu_item_media;
CREATE POLICY "owner_menu_item_media_write" ON object_menu_item_media
  FOR ALL USING (
    EXISTS (SELECT 1 FROM object_menu_item omi
            JOIN object_menu om ON om.id = omi.menu_id
            WHERE omi.id = object_menu_item_media.menu_item_id
              AND api.user_can_write_object_canonical(om.object_id))
  );

DROP POLICY IF EXISTS "owner_meeting_room_equipment_write" ON meeting_room_equipment;
CREATE POLICY "owner_meeting_room_equipment_write" ON meeting_room_equipment
  FOR ALL USING (
    EXISTS (SELECT 1 FROM object_meeting_room omr
            WHERE omr.id = meeting_room_equipment.room_id
              AND api.user_can_write_object_canonical(omr.object_id))
  );

DROP POLICY IF EXISTS "owner_iti_stage_media_write" ON object_iti_stage_media;
CREATE POLICY "owner_iti_stage_media_write" ON object_iti_stage_media
  FOR ALL USING (
    EXISTS (SELECT 1 FROM object_iti_stage ois
            WHERE ois.id = object_iti_stage_media.stage_id
              AND api.user_can_write_object_canonical(ois.object_id))
  );

-- 7) object_membership (keeps the admin branch; COALESCE handles ORG-scoped memberships).
DROP POLICY IF EXISTS "owner_object_membership_write" ON object_membership;
CREATE POLICY "owner_object_membership_write" ON object_membership
  FOR ALL USING (
    auth.role() IN ('service_role','admin')
    OR api.user_can_write_object_canonical(COALESCE(object_id, org_object_id))
  );

-- 8) Status guard: status changes require publish_object (rpc_publish_object), not edit_canonical.
--    service_role/admin and platform superuser are exempt. rpc_publish_object verifies the
--    caller's publish right before its UPDATE, so the trigger re-check passes for it
--    (auth.uid() is preserved under SECURITY DEFINER). Fires only when `status` is in the SET list.
CREATE OR REPLACE FUNCTION api.guard_object_status_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, api, auth
AS $fn$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND auth.role() NOT IN ('service_role','admin')
     AND NOT api.is_platform_superuser()
     AND NOT api.user_can_publish_object(NEW.id)
  THEN
    RAISE EXCEPTION
      'Object status changes require the publish_object permission (use api.rpc_publish_object); edit_canonical_when_publisher does not grant publishing'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION api.guard_object_status_change() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_guard_object_status_change ON object;
CREATE TRIGGER trg_guard_object_status_change
  BEFORE UPDATE OF status ON object
  FOR EACH ROW EXECUTE FUNCTION api.guard_object_status_change();

-- 9) Versioning trigger must run as OWNER so it can write the admin-only object_version
--    history table on behalf of a permission-holding (non-superuser) editor. object_version
--    RLS allows only service_role/admin; the trigger function save_object_version was
--    SECURITY INVOKER, so ANY authenticated `UPDATE object` failed with
--    "new row violates row-level security policy for table object_version" — which would
--    block every multi-role canonical write this migration is meant to enable. The sibling
--    audit trigger (log_row_changes) is already SECURITY DEFINER; save_object_version already
--    pins SET search_path, so DEFINER is safe. (Found by the SP-2 behavioral test via the CI gate.)
ALTER FUNCTION public.save_object_version() SECURITY DEFINER;

COMMIT;
