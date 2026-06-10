-- migration_child_read_gate_setbased.sql
-- §47 / §38 — Set-based child read gates. With write policies out of SELECT (8o), the 25 FLAT
-- child read policies (read_<t> USING api.can_read_object(<col>)) can adopt the §38 split form:
--   EXISTS(published object with that id)  OR  <col> IN (SELECT api.current_user_extended_object_ids())
-- which is SET-EQUIVALENT to can_read_object = published OR can_read_extended (§36/§38 established
-- the equivalence) but lets the planner hoist the per-user extended scope to ONE InitPlan instead of
-- evaluating a per-row api.can_read_object() SECURITY DEFINER scalar over the full child scan (§35).
-- Scope: ONLY the flat-keyed policies. NOT object_iti (separate pub_iti_published/ext_iti_org_actor
-- pair) and NOT the nested-EXISTS policies (menu items, opening sub-tree, media_tag, place_description,
-- tag_link, location) -- their leaf already probes through a parent; logged as deferred remainder.
-- PREREQUISITES: migration_rls_read_gate_p03.sql (8d -- the 24 flat read policies) +
--   migration_object_act_rls.sql (8g -- read_object_act) + migration_write_policy_percommand.sql
--   (8o -- write policies no longer apply to SELECT). Manifest step 8p.
--   api.current_user_extended_object_ids() already EXECUTE-granted to anon/authenticated (returns the
--   empty set for anon -- same §35 logic as the `object` policy).
-- IDEMPOTENT: DROP POLICY IF EXISTS + CREATE POLICY.
-- REVERSIBLE: re-create the p03/8g form, e.g. CREATE POLICY "read_<t>" ON <t> FOR SELECT
--   USING (api.can_read_object(<col>));
BEGIN;

-- column = object_id unless noted (object_iti_section -> parent_object_id; object_relation -> source_object_id)
DROP POLICY IF EXISTS "read_object_place" ON object_place;
CREATE POLICY "read_object_place" ON object_place FOR SELECT USING (EXISTS (SELECT 1 FROM object o WHERE o.id = object_id AND o.status = 'published') OR object_id IN (SELECT api.current_user_extended_object_ids()));

DROP POLICY IF EXISTS "read_object_price" ON object_price;
CREATE POLICY "read_object_price" ON object_price FOR SELECT USING (EXISTS (SELECT 1 FROM object o WHERE o.id = object_id AND o.status = 'published') OR object_id IN (SELECT api.current_user_extended_object_ids()));

DROP POLICY IF EXISTS "read_object_capacity" ON object_capacity;
CREATE POLICY "read_object_capacity" ON object_capacity FOR SELECT USING (EXISTS (SELECT 1 FROM object o WHERE o.id = object_id AND o.status = 'published') OR object_id IN (SELECT api.current_user_extended_object_ids()));

DROP POLICY IF EXISTS "read_object_zone" ON object_zone;
CREATE POLICY "read_object_zone" ON object_zone FOR SELECT USING (EXISTS (SELECT 1 FROM object o WHERE o.id = object_id AND o.status = 'published') OR object_id IN (SELECT api.current_user_extended_object_ids()));

DROP POLICY IF EXISTS "read_object_org_link" ON object_org_link;
CREATE POLICY "read_object_org_link" ON object_org_link FOR SELECT USING (EXISTS (SELECT 1 FROM object o WHERE o.id = object_id AND o.status = 'published') OR object_id IN (SELECT api.current_user_extended_object_ids()));

DROP POLICY IF EXISTS "read_object_origin" ON object_origin;
CREATE POLICY "read_object_origin" ON object_origin FOR SELECT USING (EXISTS (SELECT 1 FROM object o WHERE o.id = object_id AND o.status = 'published') OR object_id IN (SELECT api.current_user_extended_object_ids()));

DROP POLICY IF EXISTS "read_object_fma_occurrence" ON object_fma_occurrence;
CREATE POLICY "read_object_fma_occurrence" ON object_fma_occurrence FOR SELECT USING (EXISTS (SELECT 1 FROM object o WHERE o.id = object_id AND o.status = 'published') OR object_id IN (SELECT api.current_user_extended_object_ids()));

DROP POLICY IF EXISTS "read_object_pet_policy" ON object_pet_policy;
CREATE POLICY "read_object_pet_policy" ON object_pet_policy FOR SELECT USING (EXISTS (SELECT 1 FROM object o WHERE o.id = object_id AND o.status = 'published') OR object_id IN (SELECT api.current_user_extended_object_ids()));

DROP POLICY IF EXISTS "read_object_menu" ON object_menu;
CREATE POLICY "read_object_menu" ON object_menu FOR SELECT USING (EXISTS (SELECT 1 FROM object o WHERE o.id = object_id AND o.status = 'published') OR object_id IN (SELECT api.current_user_extended_object_ids()));

DROP POLICY IF EXISTS "read_object_meeting_room" ON object_meeting_room;
CREATE POLICY "read_object_meeting_room" ON object_meeting_room FOR SELECT USING (EXISTS (SELECT 1 FROM object o WHERE o.id = object_id AND o.status = 'published') OR object_id IN (SELECT api.current_user_extended_object_ids()));

DROP POLICY IF EXISTS "read_object_iti_practice" ON object_iti_practice;
CREATE POLICY "read_object_iti_practice" ON object_iti_practice FOR SELECT USING (EXISTS (SELECT 1 FROM object o WHERE o.id = object_id AND o.status = 'published') OR object_id IN (SELECT api.current_user_extended_object_ids()));

DROP POLICY IF EXISTS "read_object_iti_stage" ON object_iti_stage;
CREATE POLICY "read_object_iti_stage" ON object_iti_stage FOR SELECT USING (EXISTS (SELECT 1 FROM object o WHERE o.id = object_id AND o.status = 'published') OR object_id IN (SELECT api.current_user_extended_object_ids()));

DROP POLICY IF EXISTS "read_object_iti_info" ON object_iti_info;
CREATE POLICY "read_object_iti_info" ON object_iti_info FOR SELECT USING (EXISTS (SELECT 1 FROM object o WHERE o.id = object_id AND o.status = 'published') OR object_id IN (SELECT api.current_user_extended_object_ids()));

DROP POLICY IF EXISTS "read_object_iti_associated_object" ON object_iti_associated_object;
CREATE POLICY "read_object_iti_associated_object" ON object_iti_associated_object FOR SELECT USING (EXISTS (SELECT 1 FROM object o WHERE o.id = object_id AND o.status = 'published') OR object_id IN (SELECT api.current_user_extended_object_ids()));

DROP POLICY IF EXISTS "read_object_iti_profile" ON object_iti_profile;
CREATE POLICY "read_object_iti_profile" ON object_iti_profile FOR SELECT USING (EXISTS (SELECT 1 FROM object o WHERE o.id = object_id AND o.status = 'published') OR object_id IN (SELECT api.current_user_extended_object_ids()));

DROP POLICY IF EXISTS "read_opening_period" ON opening_period;
CREATE POLICY "read_opening_period" ON opening_period FOR SELECT USING (EXISTS (SELECT 1 FROM object o WHERE o.id = object_id AND o.status = 'published') OR object_id IN (SELECT api.current_user_extended_object_ids()));

DROP POLICY IF EXISTS "read_object_classification" ON object_classification;
CREATE POLICY "read_object_classification" ON object_classification FOR SELECT USING (EXISTS (SELECT 1 FROM object o WHERE o.id = object_id AND o.status = 'published') OR object_id IN (SELECT api.current_user_extended_object_ids()));

DROP POLICY IF EXISTS "read_object_amenity" ON object_amenity;
CREATE POLICY "read_object_amenity" ON object_amenity FOR SELECT USING (EXISTS (SELECT 1 FROM object o WHERE o.id = object_id AND o.status = 'published') OR object_id IN (SELECT api.current_user_extended_object_ids()));

DROP POLICY IF EXISTS "read_object_environment_tag" ON object_environment_tag;
CREATE POLICY "read_object_environment_tag" ON object_environment_tag FOR SELECT USING (EXISTS (SELECT 1 FROM object o WHERE o.id = object_id AND o.status = 'published') OR object_id IN (SELECT api.current_user_extended_object_ids()));

DROP POLICY IF EXISTS "read_object_language" ON object_language;
CREATE POLICY "read_object_language" ON object_language FOR SELECT USING (EXISTS (SELECT 1 FROM object o WHERE o.id = object_id AND o.status = 'published') OR object_id IN (SELECT api.current_user_extended_object_ids()));

DROP POLICY IF EXISTS "read_object_payment_method" ON object_payment_method;
CREATE POLICY "read_object_payment_method" ON object_payment_method FOR SELECT USING (EXISTS (SELECT 1 FROM object o WHERE o.id = object_id AND o.status = 'published') OR object_id IN (SELECT api.current_user_extended_object_ids()));

DROP POLICY IF EXISTS "read_promotion_object" ON promotion_object;
CREATE POLICY "read_promotion_object" ON promotion_object FOR SELECT USING (EXISTS (SELECT 1 FROM object o WHERE o.id = object_id AND o.status = 'published') OR object_id IN (SELECT api.current_user_extended_object_ids()));

-- object_relation: keyed on source_object_id
DROP POLICY IF EXISTS "read_object_relation" ON object_relation;
CREATE POLICY "read_object_relation" ON object_relation FOR SELECT USING (EXISTS (SELECT 1 FROM object o WHERE o.id = source_object_id AND o.status = 'published') OR source_object_id IN (SELECT api.current_user_extended_object_ids()));

-- object_iti_section: keyed on parent_object_id
DROP POLICY IF EXISTS "read_object_iti_section" ON object_iti_section;
CREATE POLICY "read_object_iti_section" ON object_iti_section FOR SELECT USING (EXISTS (SELECT 1 FROM object o WHERE o.id = parent_object_id AND o.status = 'published') OR parent_object_id IN (SELECT api.current_user_extended_object_ids()));

-- object_act: read_object_act (from migration_object_act_rls.sql / 8g)
DROP POLICY IF EXISTS "read_object_act" ON object_act;
CREATE POLICY "read_object_act" ON object_act FOR SELECT USING (EXISTS (SELECT 1 FROM object o WHERE o.id = object_id AND o.status = 'published') OR object_id IN (SELECT api.current_user_extended_object_ids()));

COMMIT;
