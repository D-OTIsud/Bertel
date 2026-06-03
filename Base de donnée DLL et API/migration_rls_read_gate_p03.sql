-- migration_rls_read_gate_p03.sql
-- P0.3 — close the anon/cross-ORG draft-read leak on object-child tables.
-- 40 tables shipped a permissive `FOR SELECT USING (true)` policy while anon holds SELECT,
-- so anon could read draft/hidden objects' coordinates, pricing, openings, menus, relations,
-- owning-ORG, capacity, etc. via direct PostgREST. This replaces each USING(true) SELECT policy
-- with the same rule the gated siblings (object/media/contact_channel) already use:
--   published  -> anyone (incl. anon)   |   draft/hidden/archived -> only api.can_read_extended.
-- Centralized in api.can_read_object (READ mirror of api.user_can_write_object_canonical / SP-1).
--
-- PREREQUISITES: schema_unified.sql (tables), rls_policies.sql (defines api.can_read_extended
--   + the USING(true) policies this drops). APPLY AFTER rls_policies.sql; slotted after
--   migration_permission_write_paths_b.sql in the manifest (grouped with the permission work).
-- IDEMPOTENT: DROP POLICY IF EXISTS (old name + new name) + CREATE; CREATE OR REPLACE; CREATE INDEX IF NOT EXISTS.
-- REVERSIBLE: drop the read_* policies and re-CREATE the originals as `FOR SELECT USING (true)`.
-- The app is unaffected: public reads go through SECURITY DEFINER RPCs; the editor reads as
-- `authenticated` and holds can_read_extended on its own objects. RLS only gates direct PostgREST.

BEGIN;

-- 1) Single source of truth for "is this object's data readable by the current caller".
CREATE OR REPLACE FUNCTION api.can_read_object(p_object_id text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, api, auth
AS $fn$
  SELECT EXISTS (SELECT 1 FROM object o WHERE o.id = p_object_id AND o.status = 'published')
      OR api.can_read_extended(p_object_id);
$fn$;
REVOKE EXECUTE ON FUNCTION api.can_read_object(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION api.can_read_object(text) TO anon, authenticated, service_role;

-- 1b) Let anon evaluate the SP-1/SP-1b write predicate during SELECT.
--     These 40 tables also carry `owner_*`/`canonical_write_*` FOR ALL write policies, which apply
--     to SELECT too. Until now the `USING(true)` read policy constant-folded to TRUE and short-circuited
--     the permissive-policy OR, so anon SELECT never evaluated the write predicate. With the gated read
--     policy below, anon SELECT on a draft row evaluates the write policy's USING ->
--     api.user_can_write_object_canonical, which SP-1 REVOKE'd from anon -> "permission denied for function".
--     The function returns FALSE for anon (no uid/actor/membership), so granting EXECUTE is safe (no row is
--     exposed; the OR collapses to api.can_read_object) and necessary for anon direct reads to work instead
--     of erroring. (api.is_object_owner and api.can_read_extended are already anon-executable.)
GRANT EXECUTE ON FUNCTION api.user_can_write_object_canonical(text) TO anon;

-- ── Family A — direct object key (24) ───────────────────────────────────────
DROP POLICY IF EXISTS "Lecture publique des places" ON object_place;
DROP POLICY IF EXISTS "read_object_place" ON object_place;
CREATE POLICY "read_object_place" ON object_place FOR SELECT USING (api.can_read_object(object_id));

DROP POLICY IF EXISTS "pub_price_read" ON object_price;
DROP POLICY IF EXISTS "read_object_price" ON object_price;
CREATE POLICY "read_object_price" ON object_price FOR SELECT USING (api.can_read_object(object_id));

DROP POLICY IF EXISTS "pub_capacity_read" ON object_capacity;
DROP POLICY IF EXISTS "read_object_capacity" ON object_capacity;
CREATE POLICY "read_object_capacity" ON object_capacity FOR SELECT USING (api.can_read_object(object_id));

DROP POLICY IF EXISTS "pub_zone_read" ON object_zone;
DROP POLICY IF EXISTS "read_object_zone" ON object_zone;
CREATE POLICY "read_object_zone" ON object_zone FOR SELECT USING (api.can_read_object(object_id));

DROP POLICY IF EXISTS "pub_org_link_read" ON object_org_link;
DROP POLICY IF EXISTS "read_object_org_link" ON object_org_link;
CREATE POLICY "read_object_org_link" ON object_org_link FOR SELECT USING (api.can_read_object(object_id));

DROP POLICY IF EXISTS "pub_origin_read" ON object_origin;
DROP POLICY IF EXISTS "read_object_origin" ON object_origin;
CREATE POLICY "read_object_origin" ON object_origin FOR SELECT USING (api.can_read_object(object_id));

DROP POLICY IF EXISTS "pub_fma_occurrence_read" ON object_fma_occurrence;
DROP POLICY IF EXISTS "read_object_fma_occurrence" ON object_fma_occurrence;
CREATE POLICY "read_object_fma_occurrence" ON object_fma_occurrence FOR SELECT USING (api.can_read_object(object_id));

DROP POLICY IF EXISTS "pub_pet_policy_read" ON object_pet_policy;
DROP POLICY IF EXISTS "read_object_pet_policy" ON object_pet_policy;
CREATE POLICY "read_object_pet_policy" ON object_pet_policy FOR SELECT USING (api.can_read_object(object_id));

DROP POLICY IF EXISTS "pub_menu_read" ON object_menu;
DROP POLICY IF EXISTS "read_object_menu" ON object_menu;
CREATE POLICY "read_object_menu" ON object_menu FOR SELECT USING (api.can_read_object(object_id));

DROP POLICY IF EXISTS "pub_meeting_room_read" ON object_meeting_room;
DROP POLICY IF EXISTS "read_object_meeting_room" ON object_meeting_room;
CREATE POLICY "read_object_meeting_room" ON object_meeting_room FOR SELECT USING (api.can_read_object(object_id));

DROP POLICY IF EXISTS "pub_iti_practice_read" ON object_iti_practice;
DROP POLICY IF EXISTS "read_object_iti_practice" ON object_iti_practice;
CREATE POLICY "read_object_iti_practice" ON object_iti_practice FOR SELECT USING (api.can_read_object(object_id));

DROP POLICY IF EXISTS "pub_iti_stage_read" ON object_iti_stage;
DROP POLICY IF EXISTS "read_object_iti_stage" ON object_iti_stage;
CREATE POLICY "read_object_iti_stage" ON object_iti_stage FOR SELECT USING (api.can_read_object(object_id));

DROP POLICY IF EXISTS "pub_iti_info_read" ON object_iti_info;
DROP POLICY IF EXISTS "read_object_iti_info" ON object_iti_info;
CREATE POLICY "read_object_iti_info" ON object_iti_info FOR SELECT USING (api.can_read_object(object_id));

DROP POLICY IF EXISTS "pub_iti_associated_read" ON object_iti_associated_object;
DROP POLICY IF EXISTS "read_object_iti_associated_object" ON object_iti_associated_object;
CREATE POLICY "read_object_iti_associated_object" ON object_iti_associated_object FOR SELECT USING (api.can_read_object(object_id));

DROP POLICY IF EXISTS "Lecture publique des profils ITI" ON object_iti_profile;
DROP POLICY IF EXISTS "read_object_iti_profile" ON object_iti_profile;
CREATE POLICY "read_object_iti_profile" ON object_iti_profile FOR SELECT USING (api.can_read_object(object_id));

DROP POLICY IF EXISTS "pub_opening_period_read" ON opening_period;
DROP POLICY IF EXISTS "read_opening_period" ON opening_period;
CREATE POLICY "read_opening_period" ON opening_period FOR SELECT USING (api.can_read_object(object_id));

DROP POLICY IF EXISTS "pub_classification_read" ON object_classification;
DROP POLICY IF EXISTS "read_object_classification" ON object_classification;
CREATE POLICY "read_object_classification" ON object_classification FOR SELECT USING (api.can_read_object(object_id));

DROP POLICY IF EXISTS "pub_amenity_read" ON object_amenity;
DROP POLICY IF EXISTS "read_object_amenity" ON object_amenity;
CREATE POLICY "read_object_amenity" ON object_amenity FOR SELECT USING (api.can_read_object(object_id));

DROP POLICY IF EXISTS "pub_environment_tag_read" ON object_environment_tag;
DROP POLICY IF EXISTS "read_object_environment_tag" ON object_environment_tag;
CREATE POLICY "read_object_environment_tag" ON object_environment_tag FOR SELECT USING (api.can_read_object(object_id));

DROP POLICY IF EXISTS "pub_object_language_read" ON object_language;
DROP POLICY IF EXISTS "read_object_language" ON object_language;
CREATE POLICY "read_object_language" ON object_language FOR SELECT USING (api.can_read_object(object_id));

DROP POLICY IF EXISTS "pub_payment_method_read" ON object_payment_method;
DROP POLICY IF EXISTS "read_object_payment_method" ON object_payment_method;
CREATE POLICY "read_object_payment_method" ON object_payment_method FOR SELECT USING (api.can_read_object(object_id));

DROP POLICY IF EXISTS "Lecture publique des liaisons promotions" ON promotion_object;
DROP POLICY IF EXISTS "read_promotion_object" ON promotion_object;
CREATE POLICY "read_promotion_object" ON promotion_object FOR SELECT USING (api.can_read_object(object_id));

DROP POLICY IF EXISTS "pub_relation_read" ON object_relation;
DROP POLICY IF EXISTS "read_object_relation" ON object_relation;
CREATE POLICY "read_object_relation" ON object_relation FOR SELECT USING (api.can_read_object(source_object_id));

DROP POLICY IF EXISTS "pub_iti_section_read" ON object_iti_section;
DROP POLICY IF EXISTS "read_object_iti_section" ON object_iti_section;
CREATE POLICY "read_object_iti_section" ON object_iti_section FOR SELECT USING (api.can_read_object(parent_object_id));

-- ── Family B — object_location (nullable object_id; resolve via place) ───────
DROP POLICY IF EXISTS "Lecture publique des localisations" ON object_location;
DROP POLICY IF EXISTS "read_object_location" ON object_location;
CREATE POLICY "read_object_location" ON object_location FOR SELECT USING (
  api.can_read_object(
    COALESCE(object_location.object_id,
             (SELECT op.object_id FROM object_place op WHERE op.id = object_location.place_id))));

-- ── Family C — reach the object via a parent (EXISTS); join uses parent PK ───
DROP POLICY IF EXISTS "pub_price_period_read" ON object_price_period;
DROP POLICY IF EXISTS "read_object_price_period" ON object_price_period;
CREATE POLICY "read_object_price_period" ON object_price_period FOR SELECT USING (
  EXISTS (SELECT 1 FROM object_price op
          WHERE op.id = object_price_period.price_id AND api.can_read_object(op.object_id)));

DROP POLICY IF EXISTS "pub_menu_item_read" ON object_menu_item;
DROP POLICY IF EXISTS "read_object_menu_item" ON object_menu_item;
CREATE POLICY "read_object_menu_item" ON object_menu_item FOR SELECT USING (
  EXISTS (SELECT 1 FROM object_menu om
          WHERE om.id = object_menu_item.menu_id AND api.can_read_object(om.object_id)));

DROP POLICY IF EXISTS "pub_menu_item_dietary_read" ON object_menu_item_dietary_tag;
DROP POLICY IF EXISTS "read_object_menu_item_dietary_tag" ON object_menu_item_dietary_tag;
CREATE POLICY "read_object_menu_item_dietary_tag" ON object_menu_item_dietary_tag FOR SELECT USING (
  EXISTS (SELECT 1 FROM object_menu_item omi JOIN object_menu om ON om.id = omi.menu_id
          WHERE omi.id = object_menu_item_dietary_tag.menu_item_id AND api.can_read_object(om.object_id)));

DROP POLICY IF EXISTS "pub_menu_item_allergen_read" ON object_menu_item_allergen;
DROP POLICY IF EXISTS "read_object_menu_item_allergen" ON object_menu_item_allergen;
CREATE POLICY "read_object_menu_item_allergen" ON object_menu_item_allergen FOR SELECT USING (
  EXISTS (SELECT 1 FROM object_menu_item omi JOIN object_menu om ON om.id = omi.menu_id
          WHERE omi.id = object_menu_item_allergen.menu_item_id AND api.can_read_object(om.object_id)));

DROP POLICY IF EXISTS "pub_menu_item_cuisine_read" ON object_menu_item_cuisine_type;
DROP POLICY IF EXISTS "read_object_menu_item_cuisine_type" ON object_menu_item_cuisine_type;
CREATE POLICY "read_object_menu_item_cuisine_type" ON object_menu_item_cuisine_type FOR SELECT USING (
  EXISTS (SELECT 1 FROM object_menu_item omi JOIN object_menu om ON om.id = omi.menu_id
          WHERE omi.id = object_menu_item_cuisine_type.menu_item_id AND api.can_read_object(om.object_id)));

DROP POLICY IF EXISTS "pub_menu_item_media_read" ON object_menu_item_media;
DROP POLICY IF EXISTS "read_object_menu_item_media" ON object_menu_item_media;
CREATE POLICY "read_object_menu_item_media" ON object_menu_item_media FOR SELECT USING (
  EXISTS (SELECT 1 FROM object_menu_item omi JOIN object_menu om ON om.id = omi.menu_id
          WHERE omi.id = object_menu_item_media.menu_item_id AND api.can_read_object(om.object_id)));

DROP POLICY IF EXISTS "pub_meeting_room_equipment_read" ON meeting_room_equipment;
DROP POLICY IF EXISTS "read_meeting_room_equipment" ON meeting_room_equipment;
CREATE POLICY "read_meeting_room_equipment" ON meeting_room_equipment FOR SELECT USING (
  EXISTS (SELECT 1 FROM object_meeting_room omr
          WHERE omr.id = meeting_room_equipment.room_id AND api.can_read_object(omr.object_id)));

DROP POLICY IF EXISTS "pub_iti_stage_media_read" ON object_iti_stage_media;
DROP POLICY IF EXISTS "read_object_iti_stage_media" ON object_iti_stage_media;
CREATE POLICY "read_object_iti_stage_media" ON object_iti_stage_media FOR SELECT USING (
  EXISTS (SELECT 1 FROM object_iti_stage ois
          WHERE ois.id = object_iti_stage_media.stage_id AND api.can_read_object(ois.object_id)));

DROP POLICY IF EXISTS "pub_place_description_read" ON object_place_description;
DROP POLICY IF EXISTS "read_object_place_description" ON object_place_description;
CREATE POLICY "read_object_place_description" ON object_place_description FOR SELECT USING (
  EXISTS (SELECT 1 FROM object_place p
          WHERE p.id = object_place_description.place_id AND api.can_read_object(p.object_id)));

DROP POLICY IF EXISTS "pub_opening_schedule_read" ON opening_schedule;
DROP POLICY IF EXISTS "read_opening_schedule" ON opening_schedule;
CREATE POLICY "read_opening_schedule" ON opening_schedule FOR SELECT USING (
  EXISTS (SELECT 1 FROM opening_period p
          WHERE p.id = opening_schedule.period_id AND api.can_read_object(p.object_id)));

DROP POLICY IF EXISTS "pub_opening_time_period_read" ON opening_time_period;
DROP POLICY IF EXISTS "read_opening_time_period" ON opening_time_period;
CREATE POLICY "read_opening_time_period" ON opening_time_period FOR SELECT USING (
  EXISTS (SELECT 1 FROM opening_schedule s JOIN opening_period p ON p.id = s.period_id
          WHERE s.id = opening_time_period.schedule_id AND api.can_read_object(p.object_id)));

DROP POLICY IF EXISTS "pub_opening_time_period_weekday_read" ON opening_time_period_weekday;
DROP POLICY IF EXISTS "read_opening_time_period_weekday" ON opening_time_period_weekday;
CREATE POLICY "read_opening_time_period_weekday" ON opening_time_period_weekday FOR SELECT USING (
  EXISTS (SELECT 1 FROM opening_time_period tp
          JOIN opening_schedule s ON s.id = tp.schedule_id
          JOIN opening_period p ON p.id = s.period_id
          WHERE tp.id = opening_time_period_weekday.time_period_id AND api.can_read_object(p.object_id)));

DROP POLICY IF EXISTS "pub_opening_time_frame_read" ON opening_time_frame;
DROP POLICY IF EXISTS "read_opening_time_frame" ON opening_time_frame;
CREATE POLICY "read_opening_time_frame" ON opening_time_frame FOR SELECT USING (
  EXISTS (SELECT 1 FROM opening_time_period tp
          JOIN opening_schedule s ON s.id = tp.schedule_id
          JOIN opening_period p ON p.id = s.period_id
          WHERE tp.id = opening_time_frame.time_period_id AND api.can_read_object(p.object_id)));

-- ── Family D — polymorphic tag_link (gate object tags; leave other targets) ─
DROP POLICY IF EXISTS "pub_tag_link_read" ON tag_link;
DROP POLICY IF EXISTS "read_tag_link" ON tag_link;
CREATE POLICY "read_tag_link" ON tag_link FOR SELECT USING (
  (target_table = 'object' AND api.can_read_object(target_pk)) OR target_table <> 'object');

-- ── Family E — media_tag (media visibility keys off media.is_published) ──────
DROP POLICY IF EXISTS "Lecture publique des media_tag" ON media_tag;
DROP POLICY IF EXISTS "read_media_tag" ON media_tag;
CREATE POLICY "read_media_tag" ON media_tag FOR SELECT USING (
  EXISTS (SELECT 1 FROM media m
          WHERE m.id = media_tag.media_id
            AND (m.is_published IS TRUE OR api.can_read_extended(m.object_id))));

-- ── FK indexes for the two nested paths missing one (cascade + filter reads;
--     the RLS EXISTS itself probes the parent PK). Empty/tiny tables => instant. ──
CREATE INDEX IF NOT EXISTS idx_object_price_period_price_id     ON object_price_period(price_id);
CREATE INDEX IF NOT EXISTS idx_object_place_description_place_id ON object_place_description(place_id);

COMMIT;
