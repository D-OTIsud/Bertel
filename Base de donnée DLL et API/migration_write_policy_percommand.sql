-- migration_write_policy_percommand.sql
-- §47 — Write-path convergence: collapse the 4 overlapping FOR ALL write-policy families
-- (owner_* [SP-1], workspace_* [object_workspace_safe_write_rpcs], canonical_write_* [SP-1b],
-- legacy admin) into ONE per-command triple per object-child table:
--   canonical_ins/upd/del_<table>  (admin-only tables use admin_ins/upd/del_<table>).
-- Per-command policies NEVER apply to SELECT ⇒ ends the P0.3 "write-predicate-pollutes-read"
-- gotcha class and unblocks the §38-form set-based read gates (8p). Also closes the SP-1b holes
-- (opening_time_period / opening_time_period_weekday carried ONLY an is_object_owner workspace
-- policy ⇒ a permission-based, non-owner canonical writer passed the RPC gate but died mid-write).
--
-- PREDICATE NOTE: api.user_can_write_object_canonical(obj) = is_object_owner(obj) OR
--   user_can_write_canonical(obj). is_object_owner already ORs in
--   auth.role() IN ('service_role','admin') AND api.is_platform_superuser(), so CANON SUBSUMES the
--   legacy admin/superuser blankets on relation/place_description/sustainability/room-type — dropping
--   them loses nothing. The ONLY genuinely-additive legacy legs are:
--     +CREATEDBY (object_room_type trio + media_tag): an object.created_by writer with no actor link
--                 and no canonical permission — preserved verbatim (the additive principle exists
--                 because removing it would brick the only seeded user; retire once actor links /
--                 permission grants cover those users).
--     T (tag_link): the admin arm covers NON-object target tables (CANON not evaluated there).
--     M (object_membership): explicit admin arm kept (plan §47 class M).
--   media / object_location keep the object-XOR-place dual path (a naive CANON(object_id) would
--   silently drop §40 sub-place media/location writes). object_description keeps the §20 carve-out.
--
-- PREREQUISITES: rls_policies.sql (step 6), migration_permission_write_paths.sql + _b.sql (8b/8c),
--   migration_object_act_rls.sql (8g), migration_object_fma_write_policy.sql (8n). Manifest step 8o.
-- IDEMPOTENT: DROP POLICY IF EXISTS + CREATE POLICY (re-runnable).
-- REVERSIBLE: re-run migration_permission_write_paths.sql + _b.sql + the workspace policy block of
--   object_workspace_safe_write_rpcs.sql (~198-384) + migration_object_act_rls.sql
--   + migration_object_fma_write_policy.sql (recreates the per-table families this collapses).
-- FRONTEND IMPACT: none. Effective permissions unchanged (canonical ⊇ owner; admin/createdby arms
--   preserved). The RPC paths (SECURITY INVOKER + workspace_assert_can_write_object) now rely on the
--   canonical per-command policies — same predicate as the gate — closing the latent failure where a
--   non-owner canonical writer passed the gate then died on an is_object_owner workspace policy.
-- ⚠ RE-APPLY CAVEAT: rls_policies.sql / object_workspace_safe_write_rpcs.sql STILL create the retired
--   FOR ALL families; after re-applying either to a live DB, re-run THIS migration (see runbook).
BEGIN;

-- ============ 1. opening_period (class D) ============
DROP POLICY IF EXISTS "workspace_opening_period_write" ON opening_period;
DROP POLICY IF EXISTS "canonical_write_opening_period" ON opening_period;
DROP POLICY IF EXISTS "canonical_ins_opening_period" ON opening_period;
CREATE POLICY "canonical_ins_opening_period" ON opening_period FOR INSERT WITH CHECK (api.user_can_write_object_canonical(object_id));
DROP POLICY IF EXISTS "canonical_upd_opening_period" ON opening_period;
CREATE POLICY "canonical_upd_opening_period" ON opening_period FOR UPDATE USING (api.user_can_write_object_canonical(object_id)) WITH CHECK (api.user_can_write_object_canonical(object_id));
DROP POLICY IF EXISTS "canonical_del_opening_period" ON opening_period;
CREATE POLICY "canonical_del_opening_period" ON opening_period FOR DELETE USING (api.user_can_write_object_canonical(object_id));

-- ============ 2. opening_schedule (class E: period_id -> opening_period) ============
DROP POLICY IF EXISTS "workspace_opening_schedule_write" ON opening_schedule;
DROP POLICY IF EXISTS "canonical_write_opening_schedule" ON opening_schedule;
DROP POLICY IF EXISTS "canonical_ins_opening_schedule" ON opening_schedule;
CREATE POLICY "canonical_ins_opening_schedule" ON opening_schedule FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM opening_period p WHERE p.id = period_id AND api.user_can_write_object_canonical(p.object_id)));
DROP POLICY IF EXISTS "canonical_upd_opening_schedule" ON opening_schedule;
CREATE POLICY "canonical_upd_opening_schedule" ON opening_schedule FOR UPDATE USING (EXISTS (SELECT 1 FROM opening_period p WHERE p.id = period_id AND api.user_can_write_object_canonical(p.object_id))) WITH CHECK (EXISTS (SELECT 1 FROM opening_period p WHERE p.id = period_id AND api.user_can_write_object_canonical(p.object_id)));
DROP POLICY IF EXISTS "canonical_del_opening_schedule" ON opening_schedule;
CREATE POLICY "canonical_del_opening_schedule" ON opening_schedule FOR DELETE USING (EXISTS (SELECT 1 FROM opening_period p WHERE p.id = period_id AND api.user_can_write_object_canonical(p.object_id)));

-- ============ 3. opening_time_period (class E: schedule_id -> schedule -> period) [closes SP-1b hole] ============
DROP POLICY IF EXISTS "workspace_opening_time_period_write" ON opening_time_period;
DROP POLICY IF EXISTS "canonical_ins_opening_time_period" ON opening_time_period;
CREATE POLICY "canonical_ins_opening_time_period" ON opening_time_period FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM opening_schedule s JOIN opening_period p ON p.id = s.period_id WHERE s.id = schedule_id AND api.user_can_write_object_canonical(p.object_id)));
DROP POLICY IF EXISTS "canonical_upd_opening_time_period" ON opening_time_period;
CREATE POLICY "canonical_upd_opening_time_period" ON opening_time_period FOR UPDATE USING (EXISTS (SELECT 1 FROM opening_schedule s JOIN opening_period p ON p.id = s.period_id WHERE s.id = schedule_id AND api.user_can_write_object_canonical(p.object_id))) WITH CHECK (EXISTS (SELECT 1 FROM opening_schedule s JOIN opening_period p ON p.id = s.period_id WHERE s.id = schedule_id AND api.user_can_write_object_canonical(p.object_id)));
DROP POLICY IF EXISTS "canonical_del_opening_time_period" ON opening_time_period;
CREATE POLICY "canonical_del_opening_time_period" ON opening_time_period FOR DELETE USING (EXISTS (SELECT 1 FROM opening_schedule s JOIN opening_period p ON p.id = s.period_id WHERE s.id = schedule_id AND api.user_can_write_object_canonical(p.object_id)));

-- ============ 4. opening_time_period_weekday (class E: time_period_id -> tp -> schedule -> period) [closes SP-1b hole] ============
DROP POLICY IF EXISTS "workspace_opening_weekday_write" ON opening_time_period_weekday;
DROP POLICY IF EXISTS "canonical_ins_opening_time_period_weekday" ON opening_time_period_weekday;
CREATE POLICY "canonical_ins_opening_time_period_weekday" ON opening_time_period_weekday FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM opening_time_period tp JOIN opening_schedule s ON s.id = tp.schedule_id JOIN opening_period p ON p.id = s.period_id WHERE tp.id = time_period_id AND api.user_can_write_object_canonical(p.object_id)));
DROP POLICY IF EXISTS "canonical_upd_opening_time_period_weekday" ON opening_time_period_weekday;
CREATE POLICY "canonical_upd_opening_time_period_weekday" ON opening_time_period_weekday FOR UPDATE USING (EXISTS (SELECT 1 FROM opening_time_period tp JOIN opening_schedule s ON s.id = tp.schedule_id JOIN opening_period p ON p.id = s.period_id WHERE tp.id = time_period_id AND api.user_can_write_object_canonical(p.object_id))) WITH CHECK (EXISTS (SELECT 1 FROM opening_time_period tp JOIN opening_schedule s ON s.id = tp.schedule_id JOIN opening_period p ON p.id = s.period_id WHERE tp.id = time_period_id AND api.user_can_write_object_canonical(p.object_id)));
DROP POLICY IF EXISTS "canonical_del_opening_time_period_weekday" ON opening_time_period_weekday;
CREATE POLICY "canonical_del_opening_time_period_weekday" ON opening_time_period_weekday FOR DELETE USING (EXISTS (SELECT 1 FROM opening_time_period tp JOIN opening_schedule s ON s.id = tp.schedule_id JOIN opening_period p ON p.id = s.period_id WHERE tp.id = time_period_id AND api.user_can_write_object_canonical(p.object_id)));

-- ============ 5. opening_time_frame (class E: time_period_id -> tp -> schedule -> period) ============
DROP POLICY IF EXISTS "workspace_opening_frame_write" ON opening_time_frame;
DROP POLICY IF EXISTS "canonical_write_opening_time_frame" ON opening_time_frame;
DROP POLICY IF EXISTS "canonical_ins_opening_time_frame" ON opening_time_frame;
CREATE POLICY "canonical_ins_opening_time_frame" ON opening_time_frame FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM opening_time_period tp JOIN opening_schedule s ON s.id = tp.schedule_id JOIN opening_period p ON p.id = s.period_id WHERE tp.id = time_period_id AND api.user_can_write_object_canonical(p.object_id)));
DROP POLICY IF EXISTS "canonical_upd_opening_time_frame" ON opening_time_frame;
CREATE POLICY "canonical_upd_opening_time_frame" ON opening_time_frame FOR UPDATE USING (EXISTS (SELECT 1 FROM opening_time_period tp JOIN opening_schedule s ON s.id = tp.schedule_id JOIN opening_period p ON p.id = s.period_id WHERE tp.id = time_period_id AND api.user_can_write_object_canonical(p.object_id))) WITH CHECK (EXISTS (SELECT 1 FROM opening_time_period tp JOIN opening_schedule s ON s.id = tp.schedule_id JOIN opening_period p ON p.id = s.period_id WHERE tp.id = time_period_id AND api.user_can_write_object_canonical(p.object_id)));
DROP POLICY IF EXISTS "canonical_del_opening_time_frame" ON opening_time_frame;
CREATE POLICY "canonical_del_opening_time_frame" ON opening_time_frame FOR DELETE USING (EXISTS (SELECT 1 FROM opening_time_period tp JOIN opening_schedule s ON s.id = tp.schedule_id JOIN opening_period p ON p.id = s.period_id WHERE tp.id = time_period_id AND api.user_can_write_object_canonical(p.object_id)));

-- ============ 6. object_language (class D) ============
DROP POLICY IF EXISTS "workspace_direct_object_language_write" ON object_language;
DROP POLICY IF EXISTS "canonical_write_object_language" ON object_language;
DROP POLICY IF EXISTS "canonical_ins_object_language" ON object_language;
CREATE POLICY "canonical_ins_object_language" ON object_language FOR INSERT WITH CHECK (api.user_can_write_object_canonical(object_id));
DROP POLICY IF EXISTS "canonical_upd_object_language" ON object_language;
CREATE POLICY "canonical_upd_object_language" ON object_language FOR UPDATE USING (api.user_can_write_object_canonical(object_id)) WITH CHECK (api.user_can_write_object_canonical(object_id));
DROP POLICY IF EXISTS "canonical_del_object_language" ON object_language;
CREATE POLICY "canonical_del_object_language" ON object_language FOR DELETE USING (api.user_can_write_object_canonical(object_id));

-- ============ 7. object_payment_method (class D) ============
DROP POLICY IF EXISTS "workspace_direct_object_payment_write" ON object_payment_method;
DROP POLICY IF EXISTS "canonical_write_object_payment_method" ON object_payment_method;
DROP POLICY IF EXISTS "canonical_ins_object_payment_method" ON object_payment_method;
CREATE POLICY "canonical_ins_object_payment_method" ON object_payment_method FOR INSERT WITH CHECK (api.user_can_write_object_canonical(object_id));
DROP POLICY IF EXISTS "canonical_upd_object_payment_method" ON object_payment_method;
CREATE POLICY "canonical_upd_object_payment_method" ON object_payment_method FOR UPDATE USING (api.user_can_write_object_canonical(object_id)) WITH CHECK (api.user_can_write_object_canonical(object_id));
DROP POLICY IF EXISTS "canonical_del_object_payment_method" ON object_payment_method;
CREATE POLICY "canonical_del_object_payment_method" ON object_payment_method FOR DELETE USING (api.user_can_write_object_canonical(object_id));

-- ============ 8. object_environment_tag (class D) ============
DROP POLICY IF EXISTS "workspace_direct_object_environment_write" ON object_environment_tag;
DROP POLICY IF EXISTS "canonical_write_object_environment_tag" ON object_environment_tag;
DROP POLICY IF EXISTS "canonical_ins_object_environment_tag" ON object_environment_tag;
CREATE POLICY "canonical_ins_object_environment_tag" ON object_environment_tag FOR INSERT WITH CHECK (api.user_can_write_object_canonical(object_id));
DROP POLICY IF EXISTS "canonical_upd_object_environment_tag" ON object_environment_tag;
CREATE POLICY "canonical_upd_object_environment_tag" ON object_environment_tag FOR UPDATE USING (api.user_can_write_object_canonical(object_id)) WITH CHECK (api.user_can_write_object_canonical(object_id));
DROP POLICY IF EXISTS "canonical_del_object_environment_tag" ON object_environment_tag;
CREATE POLICY "canonical_del_object_environment_tag" ON object_environment_tag FOR DELETE USING (api.user_can_write_object_canonical(object_id));

-- ============ 9. object_amenity (class D) ============
DROP POLICY IF EXISTS "workspace_direct_object_amenity_write" ON object_amenity;
DROP POLICY IF EXISTS "canonical_write_object_amenity" ON object_amenity;
DROP POLICY IF EXISTS "canonical_ins_object_amenity" ON object_amenity;
CREATE POLICY "canonical_ins_object_amenity" ON object_amenity FOR INSERT WITH CHECK (api.user_can_write_object_canonical(object_id));
DROP POLICY IF EXISTS "canonical_upd_object_amenity" ON object_amenity;
CREATE POLICY "canonical_upd_object_amenity" ON object_amenity FOR UPDATE USING (api.user_can_write_object_canonical(object_id)) WITH CHECK (api.user_can_write_object_canonical(object_id));
DROP POLICY IF EXISTS "canonical_del_object_amenity" ON object_amenity;
CREATE POLICY "canonical_del_object_amenity" ON object_amenity FOR DELETE USING (api.user_can_write_object_canonical(object_id));

-- ============ 10. object_capacity (class D) ============
DROP POLICY IF EXISTS "workspace_direct_object_capacity_write" ON object_capacity;
DROP POLICY IF EXISTS "canonical_write_object_capacity" ON object_capacity;
DROP POLICY IF EXISTS "canonical_ins_object_capacity" ON object_capacity;
CREATE POLICY "canonical_ins_object_capacity" ON object_capacity FOR INSERT WITH CHECK (api.user_can_write_object_canonical(object_id));
DROP POLICY IF EXISTS "canonical_upd_object_capacity" ON object_capacity;
CREATE POLICY "canonical_upd_object_capacity" ON object_capacity FOR UPDATE USING (api.user_can_write_object_canonical(object_id)) WITH CHECK (api.user_can_write_object_canonical(object_id));
DROP POLICY IF EXISTS "canonical_del_object_capacity" ON object_capacity;
CREATE POLICY "canonical_del_object_capacity" ON object_capacity FOR DELETE USING (api.user_can_write_object_canonical(object_id));

-- ============ 11. object_group_policy (class D) ============
DROP POLICY IF EXISTS "workspace_direct_group_policy_write" ON object_group_policy;
DROP POLICY IF EXISTS "owner_write_group_policy" ON object_group_policy;
DROP POLICY IF EXISTS "canonical_ins_object_group_policy" ON object_group_policy;
CREATE POLICY "canonical_ins_object_group_policy" ON object_group_policy FOR INSERT WITH CHECK (api.user_can_write_object_canonical(object_id));
DROP POLICY IF EXISTS "canonical_upd_object_group_policy" ON object_group_policy;
CREATE POLICY "canonical_upd_object_group_policy" ON object_group_policy FOR UPDATE USING (api.user_can_write_object_canonical(object_id)) WITH CHECK (api.user_can_write_object_canonical(object_id));
DROP POLICY IF EXISTS "canonical_del_object_group_policy" ON object_group_policy;
CREATE POLICY "canonical_del_object_group_policy" ON object_group_policy FOR DELETE USING (api.user_can_write_object_canonical(object_id));

-- ============ 12. object_pet_policy (class D) ============
DROP POLICY IF EXISTS "workspace_direct_pet_policy_write" ON object_pet_policy;
DROP POLICY IF EXISTS "owner_pet_policy_write" ON object_pet_policy;
DROP POLICY IF EXISTS "canonical_ins_object_pet_policy" ON object_pet_policy;
CREATE POLICY "canonical_ins_object_pet_policy" ON object_pet_policy FOR INSERT WITH CHECK (api.user_can_write_object_canonical(object_id));
DROP POLICY IF EXISTS "canonical_upd_object_pet_policy" ON object_pet_policy;
CREATE POLICY "canonical_upd_object_pet_policy" ON object_pet_policy FOR UPDATE USING (api.user_can_write_object_canonical(object_id)) WITH CHECK (api.user_can_write_object_canonical(object_id));
DROP POLICY IF EXISTS "canonical_del_object_pet_policy" ON object_pet_policy;
CREATE POLICY "canonical_del_object_pet_policy" ON object_pet_policy FOR DELETE USING (api.user_can_write_object_canonical(object_id));

-- ============ 13. object_price (class D) ============
DROP POLICY IF EXISTS "workspace_direct_price_write" ON object_price;
DROP POLICY IF EXISTS "owner_price_write" ON object_price;
DROP POLICY IF EXISTS "canonical_ins_object_price" ON object_price;
CREATE POLICY "canonical_ins_object_price" ON object_price FOR INSERT WITH CHECK (api.user_can_write_object_canonical(object_id));
DROP POLICY IF EXISTS "canonical_upd_object_price" ON object_price;
CREATE POLICY "canonical_upd_object_price" ON object_price FOR UPDATE USING (api.user_can_write_object_canonical(object_id)) WITH CHECK (api.user_can_write_object_canonical(object_id));
DROP POLICY IF EXISTS "canonical_del_object_price" ON object_price;
CREATE POLICY "canonical_del_object_price" ON object_price FOR DELETE USING (api.user_can_write_object_canonical(object_id));

-- ============ 14. object_discount (class D) ============
DROP POLICY IF EXISTS "workspace_direct_discount_write" ON object_discount;
DROP POLICY IF EXISTS "owner_write_discount" ON object_discount;
DROP POLICY IF EXISTS "canonical_ins_object_discount" ON object_discount;
CREATE POLICY "canonical_ins_object_discount" ON object_discount FOR INSERT WITH CHECK (api.user_can_write_object_canonical(object_id));
DROP POLICY IF EXISTS "canonical_upd_object_discount" ON object_discount;
CREATE POLICY "canonical_upd_object_discount" ON object_discount FOR UPDATE USING (api.user_can_write_object_canonical(object_id)) WITH CHECK (api.user_can_write_object_canonical(object_id));
DROP POLICY IF EXISTS "canonical_del_object_discount" ON object_discount;
CREATE POLICY "canonical_del_object_discount" ON object_discount FOR DELETE USING (api.user_can_write_object_canonical(object_id));

-- ============ 15. object_price_period (class E: price_id -> object_price) ============
DROP POLICY IF EXISTS "workspace_direct_price_period_write" ON object_price_period;
DROP POLICY IF EXISTS "owner_price_period_write" ON object_price_period;
DROP POLICY IF EXISTS "canonical_ins_object_price_period" ON object_price_period;
CREATE POLICY "canonical_ins_object_price_period" ON object_price_period FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM object_price op WHERE op.id = price_id AND api.user_can_write_object_canonical(op.object_id)));
DROP POLICY IF EXISTS "canonical_upd_object_price_period" ON object_price_period;
CREATE POLICY "canonical_upd_object_price_period" ON object_price_period FOR UPDATE USING (EXISTS (SELECT 1 FROM object_price op WHERE op.id = price_id AND api.user_can_write_object_canonical(op.object_id))) WITH CHECK (EXISTS (SELECT 1 FROM object_price op WHERE op.id = price_id AND api.user_can_write_object_canonical(op.object_id)));
DROP POLICY IF EXISTS "canonical_del_object_price_period" ON object_price_period;
CREATE POLICY "canonical_del_object_price_period" ON object_price_period FOR DELETE USING (EXISTS (SELECT 1 FROM object_price op WHERE op.id = price_id AND api.user_can_write_object_canonical(op.object_id)));

-- ============ 16. object_iti (class D) ============
DROP POLICY IF EXISTS "workspace_iti_write" ON object_iti;
DROP POLICY IF EXISTS "canonical_write_object_iti" ON object_iti;
DROP POLICY IF EXISTS "canonical_ins_object_iti" ON object_iti;
CREATE POLICY "canonical_ins_object_iti" ON object_iti FOR INSERT WITH CHECK (api.user_can_write_object_canonical(object_id));
DROP POLICY IF EXISTS "canonical_upd_object_iti" ON object_iti;
CREATE POLICY "canonical_upd_object_iti" ON object_iti FOR UPDATE USING (api.user_can_write_object_canonical(object_id)) WITH CHECK (api.user_can_write_object_canonical(object_id));
DROP POLICY IF EXISTS "canonical_del_object_iti" ON object_iti;
CREATE POLICY "canonical_del_object_iti" ON object_iti FOR DELETE USING (api.user_can_write_object_canonical(object_id));

-- ============ 17. object_iti_practice (class D) ============
DROP POLICY IF EXISTS "workspace_iti_practice_write" ON object_iti_practice;
DROP POLICY IF EXISTS "canonical_write_object_iti_practice" ON object_iti_practice;
DROP POLICY IF EXISTS "canonical_ins_object_iti_practice" ON object_iti_practice;
CREATE POLICY "canonical_ins_object_iti_practice" ON object_iti_practice FOR INSERT WITH CHECK (api.user_can_write_object_canonical(object_id));
DROP POLICY IF EXISTS "canonical_upd_object_iti_practice" ON object_iti_practice;
CREATE POLICY "canonical_upd_object_iti_practice" ON object_iti_practice FOR UPDATE USING (api.user_can_write_object_canonical(object_id)) WITH CHECK (api.user_can_write_object_canonical(object_id));
DROP POLICY IF EXISTS "canonical_del_object_iti_practice" ON object_iti_practice;
CREATE POLICY "canonical_del_object_iti_practice" ON object_iti_practice FOR DELETE USING (api.user_can_write_object_canonical(object_id));

-- ============ 18. object_iti_info (class D) ============
DROP POLICY IF EXISTS "workspace_iti_info_write" ON object_iti_info;
DROP POLICY IF EXISTS "canonical_write_object_iti_info" ON object_iti_info;
DROP POLICY IF EXISTS "canonical_ins_object_iti_info" ON object_iti_info;
CREATE POLICY "canonical_ins_object_iti_info" ON object_iti_info FOR INSERT WITH CHECK (api.user_can_write_object_canonical(object_id));
DROP POLICY IF EXISTS "canonical_upd_object_iti_info" ON object_iti_info;
CREATE POLICY "canonical_upd_object_iti_info" ON object_iti_info FOR UPDATE USING (api.user_can_write_object_canonical(object_id)) WITH CHECK (api.user_can_write_object_canonical(object_id));
DROP POLICY IF EXISTS "canonical_del_object_iti_info" ON object_iti_info;
CREATE POLICY "canonical_del_object_iti_info" ON object_iti_info FOR DELETE USING (api.user_can_write_object_canonical(object_id));

-- ============ 19. object_iti_stage (class D) ============
DROP POLICY IF EXISTS "workspace_iti_stage_write" ON object_iti_stage;
DROP POLICY IF EXISTS "canonical_write_object_iti_stage" ON object_iti_stage;
DROP POLICY IF EXISTS "canonical_ins_object_iti_stage" ON object_iti_stage;
CREATE POLICY "canonical_ins_object_iti_stage" ON object_iti_stage FOR INSERT WITH CHECK (api.user_can_write_object_canonical(object_id));
DROP POLICY IF EXISTS "canonical_upd_object_iti_stage" ON object_iti_stage;
CREATE POLICY "canonical_upd_object_iti_stage" ON object_iti_stage FOR UPDATE USING (api.user_can_write_object_canonical(object_id)) WITH CHECK (api.user_can_write_object_canonical(object_id));
DROP POLICY IF EXISTS "canonical_del_object_iti_stage" ON object_iti_stage;
CREATE POLICY "canonical_del_object_iti_stage" ON object_iti_stage FOR DELETE USING (api.user_can_write_object_canonical(object_id));

-- ============ 20. object_iti_section (class P: parent_object_id) ============
DROP POLICY IF EXISTS "workspace_iti_section_write" ON object_iti_section;
DROP POLICY IF EXISTS "canonical_write_object_iti_section" ON object_iti_section;
DROP POLICY IF EXISTS "canonical_ins_object_iti_section" ON object_iti_section;
CREATE POLICY "canonical_ins_object_iti_section" ON object_iti_section FOR INSERT WITH CHECK (api.user_can_write_object_canonical(parent_object_id));
DROP POLICY IF EXISTS "canonical_upd_object_iti_section" ON object_iti_section;
CREATE POLICY "canonical_upd_object_iti_section" ON object_iti_section FOR UPDATE USING (api.user_can_write_object_canonical(parent_object_id)) WITH CHECK (api.user_can_write_object_canonical(parent_object_id));
DROP POLICY IF EXISTS "canonical_del_object_iti_section" ON object_iti_section;
CREATE POLICY "canonical_del_object_iti_section" ON object_iti_section FOR DELETE USING (api.user_can_write_object_canonical(parent_object_id));

-- ============ 21. object_iti_profile (class D) ============
DROP POLICY IF EXISTS "workspace_iti_profile_write" ON object_iti_profile;
DROP POLICY IF EXISTS "canonical_write_object_iti_profile" ON object_iti_profile;
DROP POLICY IF EXISTS "canonical_ins_object_iti_profile" ON object_iti_profile;
CREATE POLICY "canonical_ins_object_iti_profile" ON object_iti_profile FOR INSERT WITH CHECK (api.user_can_write_object_canonical(object_id));
DROP POLICY IF EXISTS "canonical_upd_object_iti_profile" ON object_iti_profile;
CREATE POLICY "canonical_upd_object_iti_profile" ON object_iti_profile FOR UPDATE USING (api.user_can_write_object_canonical(object_id)) WITH CHECK (api.user_can_write_object_canonical(object_id));
DROP POLICY IF EXISTS "canonical_del_object_iti_profile" ON object_iti_profile;
CREATE POLICY "canonical_del_object_iti_profile" ON object_iti_profile FOR DELETE USING (api.user_can_write_object_canonical(object_id));

-- ============ 22. object_iti_associated_object (class D) ============
DROP POLICY IF EXISTS "workspace_iti_assoc_write" ON object_iti_associated_object;
DROP POLICY IF EXISTS "canonical_write_object_iti_associated_object" ON object_iti_associated_object;
DROP POLICY IF EXISTS "canonical_ins_object_iti_associated_object" ON object_iti_associated_object;
CREATE POLICY "canonical_ins_object_iti_associated_object" ON object_iti_associated_object FOR INSERT WITH CHECK (api.user_can_write_object_canonical(object_id));
DROP POLICY IF EXISTS "canonical_upd_object_iti_associated_object" ON object_iti_associated_object;
CREATE POLICY "canonical_upd_object_iti_associated_object" ON object_iti_associated_object FOR UPDATE USING (api.user_can_write_object_canonical(object_id)) WITH CHECK (api.user_can_write_object_canonical(object_id));
DROP POLICY IF EXISTS "canonical_del_object_iti_associated_object" ON object_iti_associated_object;
CREATE POLICY "canonical_del_object_iti_associated_object" ON object_iti_associated_object FOR DELETE USING (api.user_can_write_object_canonical(object_id));

-- ============ 23. object_iti_stage_media (class E: stage_id -> object_iti_stage) ============
DROP POLICY IF EXISTS "workspace_iti_stage_media_write" ON object_iti_stage_media;
DROP POLICY IF EXISTS "owner_iti_stage_media_write" ON object_iti_stage_media;
DROP POLICY IF EXISTS "canonical_ins_object_iti_stage_media" ON object_iti_stage_media;
CREATE POLICY "canonical_ins_object_iti_stage_media" ON object_iti_stage_media FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM object_iti_stage ois WHERE ois.id = stage_id AND api.user_can_write_object_canonical(ois.object_id)));
DROP POLICY IF EXISTS "canonical_upd_object_iti_stage_media" ON object_iti_stage_media;
CREATE POLICY "canonical_upd_object_iti_stage_media" ON object_iti_stage_media FOR UPDATE USING (EXISTS (SELECT 1 FROM object_iti_stage ois WHERE ois.id = stage_id AND api.user_can_write_object_canonical(ois.object_id))) WITH CHECK (EXISTS (SELECT 1 FROM object_iti_stage ois WHERE ois.id = stage_id AND api.user_can_write_object_canonical(ois.object_id)));
DROP POLICY IF EXISTS "canonical_del_object_iti_stage_media" ON object_iti_stage_media;
CREATE POLICY "canonical_del_object_iti_stage_media" ON object_iti_stage_media FOR DELETE USING (EXISTS (SELECT 1 FROM object_iti_stage ois WHERE ois.id = stage_id AND api.user_can_write_object_canonical(ois.object_id)));

-- ============ 24. object_relation (class S: source_object_id) [admin arm subsumed by CANON's is_object_owner] ============
DROP POLICY IF EXISTS "workspace_object_relation_write" ON object_relation;
DROP POLICY IF EXISTS "canonical_write_object_relation" ON object_relation;
DROP POLICY IF EXISTS "admin_relation_write" ON object_relation;
DROP POLICY IF EXISTS "canonical_ins_object_relation" ON object_relation;
CREATE POLICY "canonical_ins_object_relation" ON object_relation FOR INSERT WITH CHECK (api.user_can_write_object_canonical(source_object_id));
DROP POLICY IF EXISTS "canonical_upd_object_relation" ON object_relation;
CREATE POLICY "canonical_upd_object_relation" ON object_relation FOR UPDATE USING (api.user_can_write_object_canonical(source_object_id)) WITH CHECK (api.user_can_write_object_canonical(source_object_id));
DROP POLICY IF EXISTS "canonical_del_object_relation" ON object_relation;
CREATE POLICY "canonical_del_object_relation" ON object_relation FOR DELETE USING (api.user_can_write_object_canonical(source_object_id));

-- ============ 25. object_org_link (class D) ============
DROP POLICY IF EXISTS "workspace_org_link_write" ON object_org_link;
DROP POLICY IF EXISTS "canonical_write_object_org_link" ON object_org_link;
DROP POLICY IF EXISTS "canonical_ins_object_org_link" ON object_org_link;
CREATE POLICY "canonical_ins_object_org_link" ON object_org_link FOR INSERT WITH CHECK (api.user_can_write_object_canonical(object_id));
DROP POLICY IF EXISTS "canonical_upd_object_org_link" ON object_org_link;
CREATE POLICY "canonical_upd_object_org_link" ON object_org_link FOR UPDATE USING (api.user_can_write_object_canonical(object_id)) WITH CHECK (api.user_can_write_object_canonical(object_id));
DROP POLICY IF EXISTS "canonical_del_object_org_link" ON object_org_link;
CREATE POLICY "canonical_del_object_org_link" ON object_org_link FOR DELETE USING (api.user_can_write_object_canonical(object_id));

-- ============ 26. object_place (class D) ============
DROP POLICY IF EXISTS "workspace_place_write" ON object_place;
DROP POLICY IF EXISTS "owner_write_place" ON object_place;
DROP POLICY IF EXISTS "canonical_ins_object_place" ON object_place;
CREATE POLICY "canonical_ins_object_place" ON object_place FOR INSERT WITH CHECK (api.user_can_write_object_canonical(object_id));
DROP POLICY IF EXISTS "canonical_upd_object_place" ON object_place;
CREATE POLICY "canonical_upd_object_place" ON object_place FOR UPDATE USING (api.user_can_write_object_canonical(object_id)) WITH CHECK (api.user_can_write_object_canonical(object_id));
DROP POLICY IF EXISTS "canonical_del_object_place" ON object_place;
CREATE POLICY "canonical_del_object_place" ON object_place FOR DELETE USING (api.user_can_write_object_canonical(object_id));

-- ============ 27. object_zone (class D) ============
DROP POLICY IF EXISTS "workspace_zone_write" ON object_zone;
DROP POLICY IF EXISTS "canonical_write_object_zone" ON object_zone;
DROP POLICY IF EXISTS "canonical_ins_object_zone" ON object_zone;
CREATE POLICY "canonical_ins_object_zone" ON object_zone FOR INSERT WITH CHECK (api.user_can_write_object_canonical(object_id));
DROP POLICY IF EXISTS "canonical_upd_object_zone" ON object_zone;
CREATE POLICY "canonical_upd_object_zone" ON object_zone FOR UPDATE USING (api.user_can_write_object_canonical(object_id)) WITH CHECK (api.user_can_write_object_canonical(object_id));
DROP POLICY IF EXISTS "canonical_del_object_zone" ON object_zone;
CREATE POLICY "canonical_del_object_zone" ON object_zone FOR DELETE USING (api.user_can_write_object_canonical(object_id));

-- ============ 28. object_location (class X: object XOR place) [preserves §40 sub-place location] ============
DROP POLICY IF EXISTS "workspace_location_write" ON object_location;
DROP POLICY IF EXISTS "owner_write_location" ON object_location;
DROP POLICY IF EXISTS "canonical_ins_object_location" ON object_location;
CREATE POLICY "canonical_ins_object_location" ON object_location FOR INSERT WITH CHECK ((object_id IS NOT NULL AND api.user_can_write_object_canonical(object_id)) OR (place_id IS NOT NULL AND EXISTS (SELECT 1 FROM object_place p WHERE p.id = place_id AND api.user_can_write_object_canonical(p.object_id))));
DROP POLICY IF EXISTS "canonical_upd_object_location" ON object_location;
CREATE POLICY "canonical_upd_object_location" ON object_location FOR UPDATE USING ((object_id IS NOT NULL AND api.user_can_write_object_canonical(object_id)) OR (place_id IS NOT NULL AND EXISTS (SELECT 1 FROM object_place p WHERE p.id = place_id AND api.user_can_write_object_canonical(p.object_id)))) WITH CHECK ((object_id IS NOT NULL AND api.user_can_write_object_canonical(object_id)) OR (place_id IS NOT NULL AND EXISTS (SELECT 1 FROM object_place p WHERE p.id = place_id AND api.user_can_write_object_canonical(p.object_id))));
DROP POLICY IF EXISTS "canonical_del_object_location" ON object_location;
CREATE POLICY "canonical_del_object_location" ON object_location FOR DELETE USING ((object_id IS NOT NULL AND api.user_can_write_object_canonical(object_id)) OR (place_id IS NOT NULL AND EXISTS (SELECT 1 FROM object_place p WHERE p.id = place_id AND api.user_can_write_object_canonical(p.object_id))));

-- ============ 29. object_place_description (class E: place_id -> object_place) [admin blanket subsumed by CANON] ============
DROP POLICY IF EXISTS "workspace_place_description_write" ON object_place_description;
DROP POLICY IF EXISTS "canonical_write_object_place_description" ON object_place_description;
DROP POLICY IF EXISTS "admin_place_description_write" ON object_place_description;
DROP POLICY IF EXISTS "canonical_ins_object_place_description" ON object_place_description;
CREATE POLICY "canonical_ins_object_place_description" ON object_place_description FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM object_place p WHERE p.id = place_id AND api.user_can_write_object_canonical(p.object_id)));
DROP POLICY IF EXISTS "canonical_upd_object_place_description" ON object_place_description;
CREATE POLICY "canonical_upd_object_place_description" ON object_place_description FOR UPDATE USING (EXISTS (SELECT 1 FROM object_place p WHERE p.id = place_id AND api.user_can_write_object_canonical(p.object_id))) WITH CHECK (EXISTS (SELECT 1 FROM object_place p WHERE p.id = place_id AND api.user_can_write_object_canonical(p.object_id)));
DROP POLICY IF EXISTS "canonical_del_object_place_description" ON object_place_description;
CREATE POLICY "canonical_del_object_place_description" ON object_place_description FOR DELETE USING (EXISTS (SELECT 1 FROM object_place p WHERE p.id = place_id AND api.user_can_write_object_canonical(p.object_id)));

-- ============ 30. media (class X: object XOR place) [preserves §40 sub-place media] ============
DROP POLICY IF EXISTS "workspace_media_write" ON media;
DROP POLICY IF EXISTS "owner_write_media" ON media;
DROP POLICY IF EXISTS "canonical_ins_media" ON media;
CREATE POLICY "canonical_ins_media" ON media FOR INSERT WITH CHECK ((object_id IS NOT NULL AND api.user_can_write_object_canonical(object_id)) OR (place_id IS NOT NULL AND EXISTS (SELECT 1 FROM object_place p WHERE p.id = place_id AND api.user_can_write_object_canonical(p.object_id))));
DROP POLICY IF EXISTS "canonical_upd_media" ON media;
CREATE POLICY "canonical_upd_media" ON media FOR UPDATE USING ((object_id IS NOT NULL AND api.user_can_write_object_canonical(object_id)) OR (place_id IS NOT NULL AND EXISTS (SELECT 1 FROM object_place p WHERE p.id = place_id AND api.user_can_write_object_canonical(p.object_id)))) WITH CHECK ((object_id IS NOT NULL AND api.user_can_write_object_canonical(object_id)) OR (place_id IS NOT NULL AND EXISTS (SELECT 1 FROM object_place p WHERE p.id = place_id AND api.user_can_write_object_canonical(p.object_id))));
DROP POLICY IF EXISTS "canonical_del_media" ON media;
CREATE POLICY "canonical_del_media" ON media FOR DELETE USING ((object_id IS NOT NULL AND api.user_can_write_object_canonical(object_id)) OR (place_id IS NOT NULL AND EXISTS (SELECT 1 FROM object_place p WHERE p.id = place_id AND api.user_can_write_object_canonical(p.object_id))));

-- ============ 31. media_tag (class E: media_id -> media X-path) +CREATEDBY ============
DROP POLICY IF EXISTS "Écriture media_tag par propriétaire" ON media_tag;
DROP POLICY IF EXISTS "canonical_ins_media_tag" ON media_tag;
CREATE POLICY "canonical_ins_media_tag" ON media_tag FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM media m WHERE m.id = media_id AND ((m.object_id IS NOT NULL AND api.user_can_write_object_canonical(m.object_id)) OR (m.place_id IS NOT NULL AND EXISTS (SELECT 1 FROM object_place p WHERE p.id = m.place_id AND api.user_can_write_object_canonical(p.object_id))))) OR EXISTS (SELECT 1 FROM media m JOIN object o ON o.id = m.object_id WHERE m.id = media_id AND o.created_by = (select auth.uid())));
DROP POLICY IF EXISTS "canonical_upd_media_tag" ON media_tag;
CREATE POLICY "canonical_upd_media_tag" ON media_tag FOR UPDATE USING (EXISTS (SELECT 1 FROM media m WHERE m.id = media_id AND ((m.object_id IS NOT NULL AND api.user_can_write_object_canonical(m.object_id)) OR (m.place_id IS NOT NULL AND EXISTS (SELECT 1 FROM object_place p WHERE p.id = m.place_id AND api.user_can_write_object_canonical(p.object_id))))) OR EXISTS (SELECT 1 FROM media m JOIN object o ON o.id = m.object_id WHERE m.id = media_id AND o.created_by = (select auth.uid()))) WITH CHECK (EXISTS (SELECT 1 FROM media m WHERE m.id = media_id AND ((m.object_id IS NOT NULL AND api.user_can_write_object_canonical(m.object_id)) OR (m.place_id IS NOT NULL AND EXISTS (SELECT 1 FROM object_place p WHERE p.id = m.place_id AND api.user_can_write_object_canonical(p.object_id))))) OR EXISTS (SELECT 1 FROM media m JOIN object o ON o.id = m.object_id WHERE m.id = media_id AND o.created_by = (select auth.uid())));
DROP POLICY IF EXISTS "canonical_del_media_tag" ON media_tag;
CREATE POLICY "canonical_del_media_tag" ON media_tag FOR DELETE USING (EXISTS (SELECT 1 FROM media m WHERE m.id = media_id AND ((m.object_id IS NOT NULL AND api.user_can_write_object_canonical(m.object_id)) OR (m.place_id IS NOT NULL AND EXISTS (SELECT 1 FROM object_place p WHERE p.id = m.place_id AND api.user_can_write_object_canonical(p.object_id))))) OR EXISTS (SELECT 1 FROM media m JOIN object o ON o.id = m.object_id WHERE m.id = media_id AND o.created_by = (select auth.uid())));

-- ============ 32. contact_channel (class D) ============
DROP POLICY IF EXISTS "owner_write_contact" ON contact_channel;
DROP POLICY IF EXISTS "canonical_ins_contact_channel" ON contact_channel;
CREATE POLICY "canonical_ins_contact_channel" ON contact_channel FOR INSERT WITH CHECK (api.user_can_write_object_canonical(object_id));
DROP POLICY IF EXISTS "canonical_upd_contact_channel" ON contact_channel;
CREATE POLICY "canonical_upd_contact_channel" ON contact_channel FOR UPDATE USING (api.user_can_write_object_canonical(object_id)) WITH CHECK (api.user_can_write_object_canonical(object_id));
DROP POLICY IF EXISTS "canonical_del_contact_channel" ON contact_channel;
CREATE POLICY "canonical_del_contact_channel" ON contact_channel FOR DELETE USING (api.user_can_write_object_canonical(object_id));

-- ============ 33. object_legal (class D) ============
DROP POLICY IF EXISTS "owner_write_legal" ON object_legal;
DROP POLICY IF EXISTS "canonical_ins_object_legal" ON object_legal;
CREATE POLICY "canonical_ins_object_legal" ON object_legal FOR INSERT WITH CHECK (api.user_can_write_object_canonical(object_id));
DROP POLICY IF EXISTS "canonical_upd_object_legal" ON object_legal;
CREATE POLICY "canonical_upd_object_legal" ON object_legal FOR UPDATE USING (api.user_can_write_object_canonical(object_id)) WITH CHECK (api.user_can_write_object_canonical(object_id));
DROP POLICY IF EXISTS "canonical_del_object_legal" ON object_legal;
CREATE POLICY "canonical_del_object_legal" ON object_legal FOR DELETE USING (api.user_can_write_object_canonical(object_id));

-- ============ 34. object_menu (class D) ============
DROP POLICY IF EXISTS "owner_menu_write" ON object_menu;
DROP POLICY IF EXISTS "canonical_ins_object_menu" ON object_menu;
CREATE POLICY "canonical_ins_object_menu" ON object_menu FOR INSERT WITH CHECK (api.user_can_write_object_canonical(object_id));
DROP POLICY IF EXISTS "canonical_upd_object_menu" ON object_menu;
CREATE POLICY "canonical_upd_object_menu" ON object_menu FOR UPDATE USING (api.user_can_write_object_canonical(object_id)) WITH CHECK (api.user_can_write_object_canonical(object_id));
DROP POLICY IF EXISTS "canonical_del_object_menu" ON object_menu;
CREATE POLICY "canonical_del_object_menu" ON object_menu FOR DELETE USING (api.user_can_write_object_canonical(object_id));

-- ============ 35. object_menu_item (class E: menu_id -> object_menu) ============
DROP POLICY IF EXISTS "owner_menu_item_write" ON object_menu_item;
DROP POLICY IF EXISTS "canonical_ins_object_menu_item" ON object_menu_item;
CREATE POLICY "canonical_ins_object_menu_item" ON object_menu_item FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM object_menu om WHERE om.id = menu_id AND api.user_can_write_object_canonical(om.object_id)));
DROP POLICY IF EXISTS "canonical_upd_object_menu_item" ON object_menu_item;
CREATE POLICY "canonical_upd_object_menu_item" ON object_menu_item FOR UPDATE USING (EXISTS (SELECT 1 FROM object_menu om WHERE om.id = menu_id AND api.user_can_write_object_canonical(om.object_id))) WITH CHECK (EXISTS (SELECT 1 FROM object_menu om WHERE om.id = menu_id AND api.user_can_write_object_canonical(om.object_id)));
DROP POLICY IF EXISTS "canonical_del_object_menu_item" ON object_menu_item;
CREATE POLICY "canonical_del_object_menu_item" ON object_menu_item FOR DELETE USING (EXISTS (SELECT 1 FROM object_menu om WHERE om.id = menu_id AND api.user_can_write_object_canonical(om.object_id)));

-- ============ 36. object_menu_item_dietary_tag (class E: menu_item_id -> item -> menu) ============
DROP POLICY IF EXISTS "owner_menu_item_dietary_write" ON object_menu_item_dietary_tag;
DROP POLICY IF EXISTS "canonical_ins_object_menu_item_dietary_tag" ON object_menu_item_dietary_tag;
CREATE POLICY "canonical_ins_object_menu_item_dietary_tag" ON object_menu_item_dietary_tag FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM object_menu_item omi JOIN object_menu om ON om.id = omi.menu_id WHERE omi.id = menu_item_id AND api.user_can_write_object_canonical(om.object_id)));
DROP POLICY IF EXISTS "canonical_upd_object_menu_item_dietary_tag" ON object_menu_item_dietary_tag;
CREATE POLICY "canonical_upd_object_menu_item_dietary_tag" ON object_menu_item_dietary_tag FOR UPDATE USING (EXISTS (SELECT 1 FROM object_menu_item omi JOIN object_menu om ON om.id = omi.menu_id WHERE omi.id = menu_item_id AND api.user_can_write_object_canonical(om.object_id))) WITH CHECK (EXISTS (SELECT 1 FROM object_menu_item omi JOIN object_menu om ON om.id = omi.menu_id WHERE omi.id = menu_item_id AND api.user_can_write_object_canonical(om.object_id)));
DROP POLICY IF EXISTS "canonical_del_object_menu_item_dietary_tag" ON object_menu_item_dietary_tag;
CREATE POLICY "canonical_del_object_menu_item_dietary_tag" ON object_menu_item_dietary_tag FOR DELETE USING (EXISTS (SELECT 1 FROM object_menu_item omi JOIN object_menu om ON om.id = omi.menu_id WHERE omi.id = menu_item_id AND api.user_can_write_object_canonical(om.object_id)));

-- ============ 37. object_menu_item_allergen (class E: menu_item_id -> item -> menu) ============
DROP POLICY IF EXISTS "owner_menu_item_allergen_write" ON object_menu_item_allergen;
DROP POLICY IF EXISTS "canonical_ins_object_menu_item_allergen" ON object_menu_item_allergen;
CREATE POLICY "canonical_ins_object_menu_item_allergen" ON object_menu_item_allergen FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM object_menu_item omi JOIN object_menu om ON om.id = omi.menu_id WHERE omi.id = menu_item_id AND api.user_can_write_object_canonical(om.object_id)));
DROP POLICY IF EXISTS "canonical_upd_object_menu_item_allergen" ON object_menu_item_allergen;
CREATE POLICY "canonical_upd_object_menu_item_allergen" ON object_menu_item_allergen FOR UPDATE USING (EXISTS (SELECT 1 FROM object_menu_item omi JOIN object_menu om ON om.id = omi.menu_id WHERE omi.id = menu_item_id AND api.user_can_write_object_canonical(om.object_id))) WITH CHECK (EXISTS (SELECT 1 FROM object_menu_item omi JOIN object_menu om ON om.id = omi.menu_id WHERE omi.id = menu_item_id AND api.user_can_write_object_canonical(om.object_id)));
DROP POLICY IF EXISTS "canonical_del_object_menu_item_allergen" ON object_menu_item_allergen;
CREATE POLICY "canonical_del_object_menu_item_allergen" ON object_menu_item_allergen FOR DELETE USING (EXISTS (SELECT 1 FROM object_menu_item omi JOIN object_menu om ON om.id = omi.menu_id WHERE omi.id = menu_item_id AND api.user_can_write_object_canonical(om.object_id)));

-- ============ 38. object_menu_item_cuisine_type (class E: menu_item_id -> item -> menu) ============
DROP POLICY IF EXISTS "owner_menu_item_cuisine_write" ON object_menu_item_cuisine_type;
DROP POLICY IF EXISTS "canonical_ins_object_menu_item_cuisine_type" ON object_menu_item_cuisine_type;
CREATE POLICY "canonical_ins_object_menu_item_cuisine_type" ON object_menu_item_cuisine_type FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM object_menu_item omi JOIN object_menu om ON om.id = omi.menu_id WHERE omi.id = menu_item_id AND api.user_can_write_object_canonical(om.object_id)));
DROP POLICY IF EXISTS "canonical_upd_object_menu_item_cuisine_type" ON object_menu_item_cuisine_type;
CREATE POLICY "canonical_upd_object_menu_item_cuisine_type" ON object_menu_item_cuisine_type FOR UPDATE USING (EXISTS (SELECT 1 FROM object_menu_item omi JOIN object_menu om ON om.id = omi.menu_id WHERE omi.id = menu_item_id AND api.user_can_write_object_canonical(om.object_id))) WITH CHECK (EXISTS (SELECT 1 FROM object_menu_item omi JOIN object_menu om ON om.id = omi.menu_id WHERE omi.id = menu_item_id AND api.user_can_write_object_canonical(om.object_id)));
DROP POLICY IF EXISTS "canonical_del_object_menu_item_cuisine_type" ON object_menu_item_cuisine_type;
CREATE POLICY "canonical_del_object_menu_item_cuisine_type" ON object_menu_item_cuisine_type FOR DELETE USING (EXISTS (SELECT 1 FROM object_menu_item omi JOIN object_menu om ON om.id = omi.menu_id WHERE omi.id = menu_item_id AND api.user_can_write_object_canonical(om.object_id)));

-- ============ 39. object_menu_item_media (class E: menu_item_id -> item -> menu) ============
DROP POLICY IF EXISTS "owner_menu_item_media_write" ON object_menu_item_media;
DROP POLICY IF EXISTS "canonical_ins_object_menu_item_media" ON object_menu_item_media;
CREATE POLICY "canonical_ins_object_menu_item_media" ON object_menu_item_media FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM object_menu_item omi JOIN object_menu om ON om.id = omi.menu_id WHERE omi.id = menu_item_id AND api.user_can_write_object_canonical(om.object_id)));
DROP POLICY IF EXISTS "canonical_upd_object_menu_item_media" ON object_menu_item_media;
CREATE POLICY "canonical_upd_object_menu_item_media" ON object_menu_item_media FOR UPDATE USING (EXISTS (SELECT 1 FROM object_menu_item omi JOIN object_menu om ON om.id = omi.menu_id WHERE omi.id = menu_item_id AND api.user_can_write_object_canonical(om.object_id))) WITH CHECK (EXISTS (SELECT 1 FROM object_menu_item omi JOIN object_menu om ON om.id = omi.menu_id WHERE omi.id = menu_item_id AND api.user_can_write_object_canonical(om.object_id)));
DROP POLICY IF EXISTS "canonical_del_object_menu_item_media" ON object_menu_item_media;
CREATE POLICY "canonical_del_object_menu_item_media" ON object_menu_item_media FOR DELETE USING (EXISTS (SELECT 1 FROM object_menu_item omi JOIN object_menu om ON om.id = omi.menu_id WHERE omi.id = menu_item_id AND api.user_can_write_object_canonical(om.object_id)));

-- ============ 40. object_meeting_room (class D) ============
DROP POLICY IF EXISTS "owner_meeting_room_write" ON object_meeting_room;
DROP POLICY IF EXISTS "canonical_ins_object_meeting_room" ON object_meeting_room;
CREATE POLICY "canonical_ins_object_meeting_room" ON object_meeting_room FOR INSERT WITH CHECK (api.user_can_write_object_canonical(object_id));
DROP POLICY IF EXISTS "canonical_upd_object_meeting_room" ON object_meeting_room;
CREATE POLICY "canonical_upd_object_meeting_room" ON object_meeting_room FOR UPDATE USING (api.user_can_write_object_canonical(object_id)) WITH CHECK (api.user_can_write_object_canonical(object_id));
DROP POLICY IF EXISTS "canonical_del_object_meeting_room" ON object_meeting_room;
CREATE POLICY "canonical_del_object_meeting_room" ON object_meeting_room FOR DELETE USING (api.user_can_write_object_canonical(object_id));

-- ============ 41. meeting_room_equipment (class E: room_id -> object_meeting_room) ============
DROP POLICY IF EXISTS "owner_meeting_room_equipment_write" ON meeting_room_equipment;
DROP POLICY IF EXISTS "canonical_ins_meeting_room_equipment" ON meeting_room_equipment;
CREATE POLICY "canonical_ins_meeting_room_equipment" ON meeting_room_equipment FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM object_meeting_room omr WHERE omr.id = room_id AND api.user_can_write_object_canonical(omr.object_id)));
DROP POLICY IF EXISTS "canonical_upd_meeting_room_equipment" ON meeting_room_equipment;
CREATE POLICY "canonical_upd_meeting_room_equipment" ON meeting_room_equipment FOR UPDATE USING (EXISTS (SELECT 1 FROM object_meeting_room omr WHERE omr.id = room_id AND api.user_can_write_object_canonical(omr.object_id))) WITH CHECK (EXISTS (SELECT 1 FROM object_meeting_room omr WHERE omr.id = room_id AND api.user_can_write_object_canonical(omr.object_id)));
DROP POLICY IF EXISTS "canonical_del_meeting_room_equipment" ON meeting_room_equipment;
CREATE POLICY "canonical_del_meeting_room_equipment" ON meeting_room_equipment FOR DELETE USING (EXISTS (SELECT 1 FROM object_meeting_room omr WHERE omr.id = room_id AND api.user_can_write_object_canonical(omr.object_id)));

-- ============ 42. object_room_type (class D) +CREATEDBY ============
DROP POLICY IF EXISTS "canonical_write_object_room_type" ON object_room_type;
DROP POLICY IF EXISTS "Écriture types de chambre par propriétaire" ON object_room_type;
DROP POLICY IF EXISTS "canonical_ins_object_room_type" ON object_room_type;
CREATE POLICY "canonical_ins_object_room_type" ON object_room_type FOR INSERT WITH CHECK (api.user_can_write_object_canonical(object_id) OR EXISTS (SELECT 1 FROM object o WHERE o.id = object_id AND o.created_by = (select auth.uid())));
DROP POLICY IF EXISTS "canonical_upd_object_room_type" ON object_room_type;
CREATE POLICY "canonical_upd_object_room_type" ON object_room_type FOR UPDATE USING (api.user_can_write_object_canonical(object_id) OR EXISTS (SELECT 1 FROM object o WHERE o.id = object_id AND o.created_by = (select auth.uid()))) WITH CHECK (api.user_can_write_object_canonical(object_id) OR EXISTS (SELECT 1 FROM object o WHERE o.id = object_id AND o.created_by = (select auth.uid())));
DROP POLICY IF EXISTS "canonical_del_object_room_type" ON object_room_type;
CREATE POLICY "canonical_del_object_room_type" ON object_room_type FOR DELETE USING (api.user_can_write_object_canonical(object_id) OR EXISTS (SELECT 1 FROM object o WHERE o.id = object_id AND o.created_by = (select auth.uid())));

-- ============ 43. object_room_type_amenity (class E: room_type_id -> object_room_type) +CREATEDBY ============
-- NOTE (§54 / 8v): the outer column MUST be qualified (object_room_type_amenity.room_type_id).
-- object_room_type has its OWN room_type_id column (migration_room_type_ref.sql, step 3), so an
-- unqualified `room_type_id` binds to the INNER rt and the predicate becomes rt.id = rt.room_type_id
-- (never true ⇒ deny-all). The original 8v live repair is migration_room_type_read_gate.sql §B.
DROP POLICY IF EXISTS "canonical_write_object_room_type_amenity" ON object_room_type_amenity;
DROP POLICY IF EXISTS "Écriture amenities chambre par propriétaire" ON object_room_type_amenity;
DROP POLICY IF EXISTS "canonical_ins_object_room_type_amenity" ON object_room_type_amenity;
CREATE POLICY "canonical_ins_object_room_type_amenity" ON object_room_type_amenity FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM object_room_type rt WHERE rt.id = object_room_type_amenity.room_type_id AND api.user_can_write_object_canonical(rt.object_id)) OR EXISTS (SELECT 1 FROM object_room_type rt JOIN object o ON o.id = rt.object_id WHERE rt.id = object_room_type_amenity.room_type_id AND o.created_by = (select auth.uid())));
DROP POLICY IF EXISTS "canonical_upd_object_room_type_amenity" ON object_room_type_amenity;
CREATE POLICY "canonical_upd_object_room_type_amenity" ON object_room_type_amenity FOR UPDATE USING (EXISTS (SELECT 1 FROM object_room_type rt WHERE rt.id = object_room_type_amenity.room_type_id AND api.user_can_write_object_canonical(rt.object_id)) OR EXISTS (SELECT 1 FROM object_room_type rt JOIN object o ON o.id = rt.object_id WHERE rt.id = object_room_type_amenity.room_type_id AND o.created_by = (select auth.uid()))) WITH CHECK (EXISTS (SELECT 1 FROM object_room_type rt WHERE rt.id = object_room_type_amenity.room_type_id AND api.user_can_write_object_canonical(rt.object_id)) OR EXISTS (SELECT 1 FROM object_room_type rt JOIN object o ON o.id = rt.object_id WHERE rt.id = object_room_type_amenity.room_type_id AND o.created_by = (select auth.uid())));
DROP POLICY IF EXISTS "canonical_del_object_room_type_amenity" ON object_room_type_amenity;
CREATE POLICY "canonical_del_object_room_type_amenity" ON object_room_type_amenity FOR DELETE USING (EXISTS (SELECT 1 FROM object_room_type rt WHERE rt.id = object_room_type_amenity.room_type_id AND api.user_can_write_object_canonical(rt.object_id)) OR EXISTS (SELECT 1 FROM object_room_type rt JOIN object o ON o.id = rt.object_id WHERE rt.id = object_room_type_amenity.room_type_id AND o.created_by = (select auth.uid())));

-- ============ 44. object_room_type_media (class E: room_type_id -> object_room_type) +CREATEDBY ============
-- NOTE (§54 / 8v): outer column qualified — see the §43 note above.
DROP POLICY IF EXISTS "canonical_write_object_room_type_media" ON object_room_type_media;
DROP POLICY IF EXISTS "Écriture médias chambre par propriétaire" ON object_room_type_media;
DROP POLICY IF EXISTS "canonical_ins_object_room_type_media" ON object_room_type_media;
CREATE POLICY "canonical_ins_object_room_type_media" ON object_room_type_media FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM object_room_type rt WHERE rt.id = object_room_type_media.room_type_id AND api.user_can_write_object_canonical(rt.object_id)) OR EXISTS (SELECT 1 FROM object_room_type rt JOIN object o ON o.id = rt.object_id WHERE rt.id = object_room_type_media.room_type_id AND o.created_by = (select auth.uid())));
DROP POLICY IF EXISTS "canonical_upd_object_room_type_media" ON object_room_type_media;
CREATE POLICY "canonical_upd_object_room_type_media" ON object_room_type_media FOR UPDATE USING (EXISTS (SELECT 1 FROM object_room_type rt WHERE rt.id = object_room_type_media.room_type_id AND api.user_can_write_object_canonical(rt.object_id)) OR EXISTS (SELECT 1 FROM object_room_type rt JOIN object o ON o.id = rt.object_id WHERE rt.id = object_room_type_media.room_type_id AND o.created_by = (select auth.uid()))) WITH CHECK (EXISTS (SELECT 1 FROM object_room_type rt WHERE rt.id = object_room_type_media.room_type_id AND api.user_can_write_object_canonical(rt.object_id)) OR EXISTS (SELECT 1 FROM object_room_type rt JOIN object o ON o.id = rt.object_id WHERE rt.id = object_room_type_media.room_type_id AND o.created_by = (select auth.uid())));
DROP POLICY IF EXISTS "canonical_del_object_room_type_media" ON object_room_type_media;
CREATE POLICY "canonical_del_object_room_type_media" ON object_room_type_media FOR DELETE USING (EXISTS (SELECT 1 FROM object_room_type rt WHERE rt.id = object_room_type_media.room_type_id AND api.user_can_write_object_canonical(rt.object_id)) OR EXISTS (SELECT 1 FROM object_room_type rt JOIN object o ON o.id = rt.object_id WHERE rt.id = object_room_type_media.room_type_id AND o.created_by = (select auth.uid())));

-- ============ 45. object_fma_occurrence (class D) ============
DROP POLICY IF EXISTS "owner_fma_occurrence_write" ON object_fma_occurrence;
DROP POLICY IF EXISTS "canonical_ins_object_fma_occurrence" ON object_fma_occurrence;
CREATE POLICY "canonical_ins_object_fma_occurrence" ON object_fma_occurrence FOR INSERT WITH CHECK (api.user_can_write_object_canonical(object_id));
DROP POLICY IF EXISTS "canonical_upd_object_fma_occurrence" ON object_fma_occurrence;
CREATE POLICY "canonical_upd_object_fma_occurrence" ON object_fma_occurrence FOR UPDATE USING (api.user_can_write_object_canonical(object_id)) WITH CHECK (api.user_can_write_object_canonical(object_id));
DROP POLICY IF EXISTS "canonical_del_object_fma_occurrence" ON object_fma_occurrence;
CREATE POLICY "canonical_del_object_fma_occurrence" ON object_fma_occurrence FOR DELETE USING (api.user_can_write_object_canonical(object_id));

-- ============ 46. object_membership (class M: COALESCE(object_id, org_object_id) + admin arm) ============
DROP POLICY IF EXISTS "owner_object_membership_write" ON object_membership;
DROP POLICY IF EXISTS "canonical_ins_object_membership" ON object_membership;
CREATE POLICY "canonical_ins_object_membership" ON object_membership FOR INSERT WITH CHECK ((select auth.role()) = ANY (ARRAY['service_role','admin']) OR api.user_can_write_object_canonical(COALESCE(object_id, org_object_id)));
DROP POLICY IF EXISTS "canonical_upd_object_membership" ON object_membership;
CREATE POLICY "canonical_upd_object_membership" ON object_membership FOR UPDATE USING ((select auth.role()) = ANY (ARRAY['service_role','admin']) OR api.user_can_write_object_canonical(COALESCE(object_id, org_object_id))) WITH CHECK ((select auth.role()) = ANY (ARRAY['service_role','admin']) OR api.user_can_write_object_canonical(COALESCE(object_id, org_object_id)));
DROP POLICY IF EXISTS "canonical_del_object_membership" ON object_membership;
CREATE POLICY "canonical_del_object_membership" ON object_membership FOR DELETE USING ((select auth.role()) = ANY (ARRAY['service_role','admin']) OR api.user_can_write_object_canonical(COALESCE(object_id, org_object_id)));

-- ============ 47. object_description (class CARVE: §20 org-scope carve-out) ============
DROP POLICY IF EXISTS "owner_write_description" ON object_description;
DROP POLICY IF EXISTS "canonical_ins_object_description" ON object_description;
CREATE POLICY "canonical_ins_object_description" ON object_description FOR INSERT WITH CHECK (api.is_object_owner(object_id) OR (api.user_can_write_canonical(object_id) AND org_object_id IS NULL));
DROP POLICY IF EXISTS "canonical_upd_object_description" ON object_description;
CREATE POLICY "canonical_upd_object_description" ON object_description FOR UPDATE USING (api.is_object_owner(object_id) OR (api.user_can_write_canonical(object_id) AND org_object_id IS NULL)) WITH CHECK (api.is_object_owner(object_id) OR (api.user_can_write_canonical(object_id) AND org_object_id IS NULL));
DROP POLICY IF EXISTS "canonical_del_object_description" ON object_description;
CREATE POLICY "canonical_del_object_description" ON object_description FOR DELETE USING (api.is_object_owner(object_id) OR (api.user_can_write_canonical(object_id) AND org_object_id IS NULL));

-- ============ 48. object_sustainability_action (class D) +ADMIN ============
DROP POLICY IF EXISTS "canonical_write_object_sustainability_action" ON object_sustainability_action;
DROP POLICY IF EXISTS "Accès admin/service_role (object_sustainability_action)" ON object_sustainability_action;
DROP POLICY IF EXISTS "canonical_ins_object_sustainability_action" ON object_sustainability_action;
CREATE POLICY "canonical_ins_object_sustainability_action" ON object_sustainability_action FOR INSERT WITH CHECK (api.user_can_write_object_canonical(object_id) OR (select auth.role()) = ANY (ARRAY['service_role','admin']) OR api.is_platform_superuser());
DROP POLICY IF EXISTS "canonical_upd_object_sustainability_action" ON object_sustainability_action;
CREATE POLICY "canonical_upd_object_sustainability_action" ON object_sustainability_action FOR UPDATE USING (api.user_can_write_object_canonical(object_id) OR (select auth.role()) = ANY (ARRAY['service_role','admin']) OR api.is_platform_superuser()) WITH CHECK (api.user_can_write_object_canonical(object_id) OR (select auth.role()) = ANY (ARRAY['service_role','admin']) OR api.is_platform_superuser());
DROP POLICY IF EXISTS "canonical_del_object_sustainability_action" ON object_sustainability_action;
CREATE POLICY "canonical_del_object_sustainability_action" ON object_sustainability_action FOR DELETE USING (api.user_can_write_object_canonical(object_id) OR (select auth.role()) = ANY (ARRAY['service_role','admin']) OR api.is_platform_superuser());

-- ============ 49. object_sustainability_action_label (class E: object_sustainability_action_id) +ADMIN ============
DROP POLICY IF EXISTS "canonical_write_object_sustainability_action_label" ON object_sustainability_action_label;
DROP POLICY IF EXISTS "Accès admin/service_role (object_sustainability_action_label)" ON object_sustainability_action_label;
DROP POLICY IF EXISTS "canonical_ins_object_sustainability_action_label" ON object_sustainability_action_label;
CREATE POLICY "canonical_ins_object_sustainability_action_label" ON object_sustainability_action_label FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM object_sustainability_action osa WHERE osa.id = object_sustainability_action_id AND api.user_can_write_object_canonical(osa.object_id)) OR (select auth.role()) = ANY (ARRAY['service_role','admin']) OR api.is_platform_superuser());
DROP POLICY IF EXISTS "canonical_upd_object_sustainability_action_label" ON object_sustainability_action_label;
CREATE POLICY "canonical_upd_object_sustainability_action_label" ON object_sustainability_action_label FOR UPDATE USING (EXISTS (SELECT 1 FROM object_sustainability_action osa WHERE osa.id = object_sustainability_action_id AND api.user_can_write_object_canonical(osa.object_id)) OR (select auth.role()) = ANY (ARRAY['service_role','admin']) OR api.is_platform_superuser()) WITH CHECK (EXISTS (SELECT 1 FROM object_sustainability_action osa WHERE osa.id = object_sustainability_action_id AND api.user_can_write_object_canonical(osa.object_id)) OR (select auth.role()) = ANY (ARRAY['service_role','admin']) OR api.is_platform_superuser());
DROP POLICY IF EXISTS "canonical_del_object_sustainability_action_label" ON object_sustainability_action_label;
CREATE POLICY "canonical_del_object_sustainability_action_label" ON object_sustainability_action_label FOR DELETE USING (EXISTS (SELECT 1 FROM object_sustainability_action osa WHERE osa.id = object_sustainability_action_id AND api.user_can_write_object_canonical(osa.object_id)) OR (select auth.role()) = ANY (ARRAY['service_role','admin']) OR api.is_platform_superuser());

-- ============ 50. object_classification (class D) ============
DROP POLICY IF EXISTS "canonical_write_object_classification" ON object_classification;
DROP POLICY IF EXISTS "canonical_ins_object_classification" ON object_classification;
CREATE POLICY "canonical_ins_object_classification" ON object_classification FOR INSERT WITH CHECK (api.user_can_write_object_canonical(object_id));
DROP POLICY IF EXISTS "canonical_upd_object_classification" ON object_classification;
CREATE POLICY "canonical_upd_object_classification" ON object_classification FOR UPDATE USING (api.user_can_write_object_canonical(object_id)) WITH CHECK (api.user_can_write_object_canonical(object_id));
DROP POLICY IF EXISTS "canonical_del_object_classification" ON object_classification;
CREATE POLICY "canonical_del_object_classification" ON object_classification FOR DELETE USING (api.user_can_write_object_canonical(object_id));

-- ============ 51. object_taxonomy (class D) ============
DROP POLICY IF EXISTS "canonical_write_object_taxonomy" ON object_taxonomy;
DROP POLICY IF EXISTS "canonical_ins_object_taxonomy" ON object_taxonomy;
CREATE POLICY "canonical_ins_object_taxonomy" ON object_taxonomy FOR INSERT WITH CHECK (api.user_can_write_object_canonical(object_id));
DROP POLICY IF EXISTS "canonical_upd_object_taxonomy" ON object_taxonomy;
CREATE POLICY "canonical_upd_object_taxonomy" ON object_taxonomy FOR UPDATE USING (api.user_can_write_object_canonical(object_id)) WITH CHECK (api.user_can_write_object_canonical(object_id));
DROP POLICY IF EXISTS "canonical_del_object_taxonomy" ON object_taxonomy;
CREATE POLICY "canonical_del_object_taxonomy" ON object_taxonomy FOR DELETE USING (api.user_can_write_object_canonical(object_id));

-- ============ 52. tag_link (class T: object target via CANON, non-object target via admin arm) ============
DROP POLICY IF EXISTS "canonical_write_tag_link" ON tag_link;
DROP POLICY IF EXISTS "admin_tag_link_write" ON tag_link;
DROP POLICY IF EXISTS "canonical_ins_tag_link" ON tag_link;
CREATE POLICY "canonical_ins_tag_link" ON tag_link FOR INSERT WITH CHECK ((target_table = 'object' AND api.user_can_write_object_canonical(target_pk)) OR (select auth.role()) = ANY (ARRAY['service_role','admin']));
DROP POLICY IF EXISTS "canonical_upd_tag_link" ON tag_link;
CREATE POLICY "canonical_upd_tag_link" ON tag_link FOR UPDATE USING ((target_table = 'object' AND api.user_can_write_object_canonical(target_pk)) OR (select auth.role()) = ANY (ARRAY['service_role','admin'])) WITH CHECK ((target_table = 'object' AND api.user_can_write_object_canonical(target_pk)) OR (select auth.role()) = ANY (ARRAY['service_role','admin']));
DROP POLICY IF EXISTS "canonical_del_tag_link" ON tag_link;
CREATE POLICY "canonical_del_tag_link" ON tag_link FOR DELETE USING ((target_table = 'object' AND api.user_can_write_object_canonical(target_pk)) OR (select auth.role()) = ANY (ARRAY['service_role','admin']));

-- ============ 53. object_review (class A — admin_* naming) ============
DROP POLICY IF EXISTS "Écriture admin des avis" ON object_review;
DROP POLICY IF EXISTS "admin_ins_object_review" ON object_review;
CREATE POLICY "admin_ins_object_review" ON object_review FOR INSERT WITH CHECK ((select auth.role()) = ANY (ARRAY['service_role','admin']) OR api.is_platform_superuser());
DROP POLICY IF EXISTS "admin_upd_object_review" ON object_review;
CREATE POLICY "admin_upd_object_review" ON object_review FOR UPDATE USING ((select auth.role()) = ANY (ARRAY['service_role','admin']) OR api.is_platform_superuser()) WITH CHECK ((select auth.role()) = ANY (ARRAY['service_role','admin']) OR api.is_platform_superuser());
DROP POLICY IF EXISTS "admin_del_object_review" ON object_review;
CREATE POLICY "admin_del_object_review" ON object_review FOR DELETE USING ((select auth.role()) = ANY (ARRAY['service_role','admin']) OR api.is_platform_superuser());

-- ============ 54. object_origin (class A — admin_* naming) ============
DROP POLICY IF EXISTS "admin_origin_write" ON object_origin;
DROP POLICY IF EXISTS "admin_ins_object_origin" ON object_origin;
CREATE POLICY "admin_ins_object_origin" ON object_origin FOR INSERT WITH CHECK ((select auth.role()) = ANY (ARRAY['service_role','admin']) OR api.is_platform_superuser());
DROP POLICY IF EXISTS "admin_upd_object_origin" ON object_origin;
CREATE POLICY "admin_upd_object_origin" ON object_origin FOR UPDATE USING ((select auth.role()) = ANY (ARRAY['service_role','admin']) OR api.is_platform_superuser()) WITH CHECK ((select auth.role()) = ANY (ARRAY['service_role','admin']) OR api.is_platform_superuser());
DROP POLICY IF EXISTS "admin_del_object_origin" ON object_origin;
CREATE POLICY "admin_del_object_origin" ON object_origin FOR DELETE USING ((select auth.role()) = ANY (ARRAY['service_role','admin']) OR api.is_platform_superuser());

-- ============ 55. object_act (class D) ============
DROP POLICY IF EXISTS "canonical_write_object_act" ON object_act;
DROP POLICY IF EXISTS "canonical_ins_object_act" ON object_act;
CREATE POLICY "canonical_ins_object_act" ON object_act FOR INSERT WITH CHECK (api.user_can_write_object_canonical(object_id));
DROP POLICY IF EXISTS "canonical_upd_object_act" ON object_act;
CREATE POLICY "canonical_upd_object_act" ON object_act FOR UPDATE USING (api.user_can_write_object_canonical(object_id)) WITH CHECK (api.user_can_write_object_canonical(object_id));
DROP POLICY IF EXISTS "canonical_del_object_act" ON object_act;
CREATE POLICY "canonical_del_object_act" ON object_act FOR DELETE USING (api.user_can_write_object_canonical(object_id));

-- ============ 56. object_external_id (class A — admin_* naming) ============
DROP POLICY IF EXISTS "Accès admin/service_role (object_external_id)" ON object_external_id;
DROP POLICY IF EXISTS "admin_ins_object_external_id" ON object_external_id;
CREATE POLICY "admin_ins_object_external_id" ON object_external_id FOR INSERT WITH CHECK ((select auth.role()) = ANY (ARRAY['service_role','admin']) OR api.is_platform_superuser());
DROP POLICY IF EXISTS "admin_upd_object_external_id" ON object_external_id;
CREATE POLICY "admin_upd_object_external_id" ON object_external_id FOR UPDATE USING ((select auth.role()) = ANY (ARRAY['service_role','admin']) OR api.is_platform_superuser()) WITH CHECK ((select auth.role()) = ANY (ARRAY['service_role','admin']) OR api.is_platform_superuser());
DROP POLICY IF EXISTS "admin_del_object_external_id" ON object_external_id;
CREATE POLICY "admin_del_object_external_id" ON object_external_id FOR DELETE USING ((select auth.role()) = ANY (ARRAY['service_role','admin']) OR api.is_platform_superuser());

-- ============ 57. promotion_object (class A — admin_* naming) ============
DROP POLICY IF EXISTS "Écriture admin des liaisons promotions" ON promotion_object;
DROP POLICY IF EXISTS "admin_ins_promotion_object" ON promotion_object;
CREATE POLICY "admin_ins_promotion_object" ON promotion_object FOR INSERT WITH CHECK ((select auth.role()) = ANY (ARRAY['service_role','admin']) OR api.is_platform_superuser());
DROP POLICY IF EXISTS "admin_upd_promotion_object" ON promotion_object;
CREATE POLICY "admin_upd_promotion_object" ON promotion_object FOR UPDATE USING ((select auth.role()) = ANY (ARRAY['service_role','admin']) OR api.is_platform_superuser()) WITH CHECK ((select auth.role()) = ANY (ARRAY['service_role','admin']) OR api.is_platform_superuser());
DROP POLICY IF EXISTS "admin_del_promotion_object" ON promotion_object;
CREATE POLICY "admin_del_promotion_object" ON promotion_object FOR DELETE USING ((select auth.role()) = ANY (ARRAY['service_role','admin']) OR api.is_platform_superuser());

-- ============ Safety net: fail the transaction if any FOR ALL write policy survived ============
DO $$
DECLARE v_leftover text;
BEGIN
  SELECT string_agg(tablename || '.' || policyname, ', ')
  INTO v_leftover
  FROM pg_policies
  WHERE schemaname='public' AND cmd='ALL'
    AND tablename IN (
      'opening_period','opening_schedule','opening_time_period','opening_time_period_weekday',
      'opening_time_frame','object_language','object_payment_method','object_environment_tag',
      'object_amenity','object_capacity','object_group_policy','object_pet_policy','object_price',
      'object_discount','object_price_period','object_iti','object_iti_practice','object_iti_info',
      'object_iti_stage','object_iti_section','object_iti_profile','object_iti_associated_object',
      'object_iti_stage_media','object_relation','object_org_link','object_place','object_zone',
      'object_location','object_place_description','media','media_tag','contact_channel',
      'object_legal','object_menu','object_menu_item','object_menu_item_dietary_tag',
      'object_menu_item_allergen','object_menu_item_cuisine_type','object_menu_item_media',
      'object_meeting_room','meeting_room_equipment','object_room_type','object_room_type_amenity',
      'object_room_type_media','object_fma','object_fma_occurrence','object_membership',
      'object_description','object_sustainability_action','object_sustainability_action_label',
      'object_classification','object_taxonomy','tag_link','object_review','object_origin','object_act',
      'object_external_id','promotion_object');
  IF v_leftover IS NOT NULL THEN
    RAISE EXCEPTION '§47 restructure incomplete -- FOR ALL policies remain: %', v_leftover;
  END IF;
END$$;

COMMIT;
