-- test_write_policy_percommand.sql
-- Proves migration_write_policy_percommand.sql (§47, manifest 8o): every object-child write table
-- carries a per-command triple (canonical_ins/upd/del_<t> -- class A tables use admin_ins/upd/del_<t>)
-- and NO FOR ALL write policy, while the effective write permissions are unchanged (owner can write,
-- stranger cannot, anon read gate intact). Owner persona is ACTOR-LINK based (api.is_object_owner;
-- rls_policies.sql:202-213) -- NOT created_by -- with the email JWT claim.
-- DO #2 (personas) tests behaviour that is INVARIANT across the restructure ⇒ it must pass BOTH
-- before and after 8o (it is the Task 12 pre/post probe). DO #1 (structural) is RED before 8o.
-- Run AFTER the full manifest. Self-contained + transactional (ROLLBACK).
\set ON_ERROR_STOP on
BEGIN;

-- ============ DO #1 — structural: per-command coverage, zero FOR ALL, anon EXECUTE ============
DO $$
DECLARE
  t text;
  v_missing text := '';
  tables text[] := ARRAY[
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
    'object_external_id','promotion_object'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND cmd='ALL') THEN
      v_missing := v_missing || t || ':FORALL ';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND cmd='INSERT'
                   AND (policyname LIKE 'canonical_ins_%' OR policyname LIKE 'admin_ins_%')) THEN
      v_missing := v_missing || t || ':noINS ';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND cmd='UPDATE'
                   AND (policyname LIKE 'canonical_upd_%' OR policyname LIKE 'admin_upd_%')) THEN
      v_missing := v_missing || t || ':noUPD ';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND cmd='DELETE'
                   AND (policyname LIKE 'canonical_del_%' OR policyname LIKE 'admin_del_%')) THEN
      v_missing := v_missing || t || ':noDEL ';
    END IF;
  END LOOP;
  ASSERT v_missing = '', 'per-command coverage gaps (§47 8o not applied / incomplete): ' || v_missing;
  ASSERT has_function_privilege('anon','api.user_can_write_object_canonical(text)','EXECUTE'),
         'P0.3 heritage: anon must keep EXECUTE on api.user_can_write_object_canonical(text)';
  RAISE NOTICE 'structural per-command coverage OK (58 tables, 0 FOR ALL).';
END$$;

-- ============ DO #2 — personas (INVARIANT behaviour; the Task 12 pre/post probe) ============
DO $$
DECLARE
  v_owner_obj    text := 'HOTRUN9999999701';  -- draft HOT, owned (actor link)
  v_pub          text := 'HOTRUN9999999702';  -- published HOT
  v_stranger_obj text := 'HOTRUN9999999703';  -- draft HOT, NOT owned
  v_uid          uuid := '00000000-0000-4000-a000-0000000000e1';
  v_email        text := 'pcmd_owner@test.local';
  v_actor        uuid := '00000000-0000-4000-a000-0000000000e2';
  v_stranger_uid uuid := '00000000-0000-4000-a000-0000000000e9';
  v_kind uuid; v_role uuid; v_mt uuid; v_place uuid; v_ok boolean;
BEGIN
  SELECT id INTO v_kind FROM ref_code_contact_kind WHERE code='email';
  SELECT id INTO v_role FROM ref_actor_role WHERE code='operator' LIMIT 1;
  SELECT id INTO v_mt   FROM ref_code_media_type LIMIT 1;
  ASSERT v_kind IS NOT NULL AND v_role IS NOT NULL AND v_mt IS NOT NULL, 'fixture refs missing (email kind / operator role / media type)';
  INSERT INTO object (id, object_type, name, status) VALUES
    (v_owner_obj,'HOT','pcmd owner','draft'),(v_pub,'HOT','pcmd published','published'),(v_stranger_obj,'HOT','pcmd stranger','draft');
  -- published + draft opening_period for the anon read gate
  INSERT INTO opening_period (object_id, name) VALUES (v_pub,'pub period');
  INSERT INTO opening_period (object_id, name) VALUES (v_owner_obj,'draft period (owner)');
  -- owner persona (actor-link)
  INSERT INTO auth.users (id,email) VALUES (v_uid,v_email) ON CONFLICT (id) DO NOTHING;
  INSERT INTO app_user_profile (id,role) VALUES (v_uid,'tourism_agent') ON CONFLICT (id) DO UPDATE SET role=EXCLUDED.role;
  INSERT INTO actor (id,display_name) VALUES (v_actor,'Pcmd Owner');
  INSERT INTO actor_channel (actor_id,kind_id,value) VALUES (v_actor,v_kind,v_email);
  INSERT INTO actor_object_role (actor_id,object_id,role_id,is_primary) VALUES (v_actor,v_owner_obj,v_role,TRUE);
  -- stranger persona (no link)
  INSERT INTO auth.users (id,email) VALUES (v_stranger_uid,'pcmd_stranger@test.local') ON CONFLICT (id) DO NOTHING;
  INSERT INTO app_user_profile (id,role) VALUES (v_stranger_uid,'tourism_agent') ON CONFLICT (id) DO UPDATE SET role=EXCLUDED.role;

  -- ---------- OWNER: class-D (opening_period) ins+upd, contact_channel ins+upd+del, X-path media ----------
  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_uid,'role','authenticated','email',v_email)::text, true);
  SET LOCAL ROLE authenticated;
    INSERT INTO opening_period (object_id, name) VALUES (v_owner_obj,'owner-created period');
    ASSERT (SELECT count(*) FROM opening_period WHERE object_id=v_owner_obj) >= 2, 'owner INSERT opening_period failed';
    UPDATE opening_period SET name='owner-updated' WHERE object_id=v_owner_obj AND name='owner-created period';
    ASSERT EXISTS (SELECT 1 FROM opening_period WHERE object_id=v_owner_obj AND name='owner-updated'), 'owner UPDATE opening_period failed';
    INSERT INTO contact_channel (object_id,kind_id,value) VALUES (v_owner_obj,v_kind,'owner@contact.test');
    UPDATE contact_channel SET value='owner2@contact.test' WHERE object_id=v_owner_obj;
    ASSERT EXISTS (SELECT 1 FROM contact_channel WHERE object_id=v_owner_obj AND value='owner2@contact.test'), 'owner UPDATE contact_channel failed';
    DELETE FROM contact_channel WHERE object_id=v_owner_obj;
    ASSERT NOT EXISTS (SELECT 1 FROM contact_channel WHERE object_id=v_owner_obj), 'owner DELETE contact_channel failed';
    -- §40 regression: a place-scoped media (object_id NULL, place_id set) must be writable via the X place path
    INSERT INTO object_place (object_id) VALUES (v_owner_obj) RETURNING id INTO v_place;
    INSERT INTO media (place_id, media_type_id, url) VALUES (v_place, v_mt, 'https://example.test/p.jpg');
    ASSERT EXISTS (SELECT 1 FROM media WHERE place_id=v_place), 'owner INSERT place-scoped media failed (X place path lost -- §40 regression)';
  RESET ROLE;

  -- ---------- STRANGER: class-D INSERT denied ----------
  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_stranger_uid,'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    v_ok := false;
    BEGIN INSERT INTO opening_period (object_id,name) VALUES (v_stranger_obj,'stranger'); v_ok := true; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    ASSERT NOT v_ok, 'stranger WROTE opening_period (canonical gate not enforced)';
  RESET ROLE;

  -- ---------- ANON: published opening_period readable, draft hidden (read gate unchanged by 8o) ----------
  PERFORM set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  SET LOCAL ROLE anon;
    ASSERT (SELECT count(*) FROM opening_period WHERE object_id=v_pub) = 1, 'anon MUST read PUBLISHED opening_period';
    ASSERT (SELECT count(*) FROM opening_period WHERE object_id=v_owner_obj) = 0, 'LEAK: anon reads DRAFT opening_period';
  RESET ROLE;

  RAISE NOTICE 'persona probe OK (owner D-write + contact upd/del + X-path media §40 + stranger deny + anon read gate).';
END$$;

ROLLBACK;
