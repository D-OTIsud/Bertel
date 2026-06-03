-- migration_permission_write_paths_b.sql
-- SP-1b of P0.2 — COMPLETE the canonical-write coverage SP-1 started.
-- SP-1 relaxed the ~24 `owner_*` write policies. This audit (CI-gate-driven) found the editor
-- also writes ~25 more tables whose only write policy was `is_object_owner` (the `workspace_*`
-- family), admin/service-only, or — for object_classification (§08) and object_taxonomy (§01) —
-- NO write policy at all (RLS on ⇒ all authenticated writes denied).
--
-- APPROACH: purely ADDITIVE companion policies. RLS policies are OR'd, so adding a permissive
-- `canonical_write_*` policy grants canonical writers (publisher-ORG members with
-- edit_canonical_when_publisher, via api.user_can_write_object_canonical) without touching the
-- existing owner/admin policies — no regression. Mirrors the owner_/workspace_ duplication already
-- present on the covered tables.
--
-- PREREQUISITES: schema_unified.sql, rls_policies.sql, migration_permission_write_paths.sql
--   (defines api.user_can_write_object_canonical). APPLY AFTER migration_permission_write_paths.sql.
-- IDEMPOTENT: DROP POLICY IF EXISTS + CREATE. REVERSIBLE: DROP the canonical_write_* policies.

BEGIN;

-- ── Family A.1 — tables with a direct object_id column ──────────────────────
DROP POLICY IF EXISTS "canonical_write_object_amenity" ON object_amenity;
CREATE POLICY "canonical_write_object_amenity" ON object_amenity FOR ALL USING (api.user_can_write_object_canonical(object_id));
DROP POLICY IF EXISTS "canonical_write_object_capacity" ON object_capacity;
CREATE POLICY "canonical_write_object_capacity" ON object_capacity FOR ALL USING (api.user_can_write_object_canonical(object_id));
DROP POLICY IF EXISTS "canonical_write_object_environment_tag" ON object_environment_tag;
CREATE POLICY "canonical_write_object_environment_tag" ON object_environment_tag FOR ALL USING (api.user_can_write_object_canonical(object_id));
DROP POLICY IF EXISTS "canonical_write_object_language" ON object_language;
CREATE POLICY "canonical_write_object_language" ON object_language FOR ALL USING (api.user_can_write_object_canonical(object_id));
DROP POLICY IF EXISTS "canonical_write_object_payment_method" ON object_payment_method;
CREATE POLICY "canonical_write_object_payment_method" ON object_payment_method FOR ALL USING (api.user_can_write_object_canonical(object_id));
DROP POLICY IF EXISTS "canonical_write_object_zone" ON object_zone;
CREATE POLICY "canonical_write_object_zone" ON object_zone FOR ALL USING (api.user_can_write_object_canonical(object_id));
DROP POLICY IF EXISTS "canonical_write_object_org_link" ON object_org_link;
CREATE POLICY "canonical_write_object_org_link" ON object_org_link FOR ALL USING (api.user_can_write_object_canonical(object_id));
DROP POLICY IF EXISTS "canonical_write_object_iti" ON object_iti;
CREATE POLICY "canonical_write_object_iti" ON object_iti FOR ALL USING (api.user_can_write_object_canonical(object_id));
DROP POLICY IF EXISTS "canonical_write_object_iti_associated_object" ON object_iti_associated_object;
CREATE POLICY "canonical_write_object_iti_associated_object" ON object_iti_associated_object FOR ALL USING (api.user_can_write_object_canonical(object_id));
DROP POLICY IF EXISTS "canonical_write_object_iti_info" ON object_iti_info;
CREATE POLICY "canonical_write_object_iti_info" ON object_iti_info FOR ALL USING (api.user_can_write_object_canonical(object_id));
DROP POLICY IF EXISTS "canonical_write_object_iti_practice" ON object_iti_practice;
CREATE POLICY "canonical_write_object_iti_practice" ON object_iti_practice FOR ALL USING (api.user_can_write_object_canonical(object_id));
DROP POLICY IF EXISTS "canonical_write_object_iti_profile" ON object_iti_profile;
CREATE POLICY "canonical_write_object_iti_profile" ON object_iti_profile FOR ALL USING (api.user_can_write_object_canonical(object_id));
DROP POLICY IF EXISTS "canonical_write_object_iti_stage" ON object_iti_stage;
CREATE POLICY "canonical_write_object_iti_stage" ON object_iti_stage FOR ALL USING (api.user_can_write_object_canonical(object_id));
DROP POLICY IF EXISTS "canonical_write_opening_period" ON opening_period;
CREATE POLICY "canonical_write_opening_period" ON opening_period FOR ALL USING (api.user_can_write_object_canonical(object_id));
DROP POLICY IF EXISTS "canonical_write_object_sustainability_action" ON object_sustainability_action;
CREATE POLICY "canonical_write_object_sustainability_action" ON object_sustainability_action FOR ALL USING (api.user_can_write_object_canonical(object_id));
-- §08/§01 — these had NO write policy at all (RLS on ⇒ everything denied). Add one.
DROP POLICY IF EXISTS "canonical_write_object_classification" ON object_classification;
CREATE POLICY "canonical_write_object_classification" ON object_classification FOR ALL USING (api.user_can_write_object_canonical(object_id));
DROP POLICY IF EXISTS "canonical_write_object_taxonomy" ON object_taxonomy;
CREATE POLICY "canonical_write_object_taxonomy" ON object_taxonomy FOR ALL USING (api.user_can_write_object_canonical(object_id));

-- ── Family A.2 — non-object_id key columns ──────────────────────────────────
DROP POLICY IF EXISTS "canonical_write_object_relation" ON object_relation;
CREATE POLICY "canonical_write_object_relation" ON object_relation FOR ALL USING (api.user_can_write_object_canonical(source_object_id));
DROP POLICY IF EXISTS "canonical_write_object_iti_section" ON object_iti_section;
CREATE POLICY "canonical_write_object_iti_section" ON object_iti_section FOR ALL USING (api.user_can_write_object_canonical(parent_object_id));
-- object_room_type has a direct object_id column (the existing policy joined to object only for created_by).
DROP POLICY IF EXISTS "canonical_write_object_room_type" ON object_room_type;
CREATE POLICY "canonical_write_object_room_type" ON object_room_type FOR ALL USING (api.user_can_write_object_canonical(object_id));

-- ── Family A.3 — reach the object via a parent table (EXISTS) ───────────────
DROP POLICY IF EXISTS "canonical_write_opening_schedule" ON opening_schedule;
CREATE POLICY "canonical_write_opening_schedule" ON opening_schedule FOR ALL USING (
  EXISTS (SELECT 1 FROM opening_period p WHERE p.id = opening_schedule.period_id
          AND api.user_can_write_object_canonical(p.object_id)));
DROP POLICY IF EXISTS "canonical_write_opening_time_frame" ON opening_time_frame;
CREATE POLICY "canonical_write_opening_time_frame" ON opening_time_frame FOR ALL USING (
  EXISTS (SELECT 1 FROM opening_time_period tp
          JOIN opening_schedule s ON s.id = tp.schedule_id
          JOIN opening_period p ON p.id = s.period_id
          WHERE tp.id = opening_time_frame.time_period_id
          AND api.user_can_write_object_canonical(p.object_id)));
DROP POLICY IF EXISTS "canonical_write_object_place_description" ON object_place_description;
CREATE POLICY "canonical_write_object_place_description" ON object_place_description FOR ALL USING (
  EXISTS (SELECT 1 FROM object_place p WHERE p.id = object_place_description.place_id
          AND api.user_can_write_object_canonical(p.object_id)));
DROP POLICY IF EXISTS "canonical_write_object_room_type_amenity" ON object_room_type_amenity;
CREATE POLICY "canonical_write_object_room_type_amenity" ON object_room_type_amenity FOR ALL USING (
  EXISTS (SELECT 1 FROM object_room_type rt WHERE rt.id = object_room_type_amenity.room_type_id
          AND api.user_can_write_object_canonical(rt.object_id)));
DROP POLICY IF EXISTS "canonical_write_object_room_type_media" ON object_room_type_media;
CREATE POLICY "canonical_write_object_room_type_media" ON object_room_type_media FOR ALL USING (
  EXISTS (SELECT 1 FROM object_room_type rt WHERE rt.id = object_room_type_media.room_type_id
          AND api.user_can_write_object_canonical(rt.object_id)));
DROP POLICY IF EXISTS "canonical_write_object_sustainability_action_label" ON object_sustainability_action_label;
CREATE POLICY "canonical_write_object_sustainability_action_label" ON object_sustainability_action_label FOR ALL USING (
  EXISTS (SELECT 1 FROM object_sustainability_action osa WHERE osa.id = object_sustainability_action_label.object_sustainability_action_id
          AND api.user_can_write_object_canonical(osa.object_id)));

-- ── Family B — polymorphic key (tag_link: object tags only) ─────────────────
DROP POLICY IF EXISTS "canonical_write_tag_link" ON tag_link;
CREATE POLICY "canonical_write_tag_link" ON tag_link FOR ALL USING (
  target_table = 'object' AND api.user_can_write_object_canonical(target_pk));

COMMIT;
