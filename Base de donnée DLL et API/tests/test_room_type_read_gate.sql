-- test_room_type_read_gate.sql
-- Proves the §54 object_room_type trio gates (migration_room_type_read_gate.sql, 8v):
-- A) READ (§38 split form):
--   * anon reads ZERO room types of a DRAFT object (pre-8v the bare is_published flag —
--     which DEFAULTS TRUE — leaked them, incl. base_price)
--   * anon reads ONLY the is_published room types of a PUBLISHED object; the amenity/media
--     link tables follow through the parent room
--   * a member of the owning ORG reads ALL rows of both objects — including
--     is_published=FALSE rooms AND their links (the link tables had NO extended arm before)
--   * a member of an unrelated ORG behaves exactly like anon
--   * api.get_object_room_types (SECURITY INVOKER) returns [] to anon for the draft object
-- B) WRITE-BINDING REPAIR: the 8o link-table policies bound the unqualified room_type_id to
--    the INNER object_room_type.room_type_id ref-code column (rt.id = rt.room_type_id —
--    never true ⇒ deny-all). Post-8v a +CREATEDBY writer can INSERT/DELETE link rows; a
--    foreign member still cannot; and no policy text carries the self-binding anymore.
-- Against a DB without 8v: the draft-leak assertions and the link-write probes fail -> red.
-- Self-contained + transactional (ROLLBACK; nothing persists).
-- Mirrors test_media_description_read_gate.sql fixture mechanics.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_orgA    text := 'ORGRUN9999990501';
  v_orgB    text := 'ORGRUN9999990502';
  v_pubA    text := 'HOTRUN9999990511';  -- published, ORG-A scoped, created_by user A
  v_draftA  text := 'HOTRUN9999990512';  -- draft, ORG-A scoped, created_by user A
  v_userA   uuid := '00000000-0000-4000-a000-0000000000e1';
  v_userB   uuid := '00000000-0000-4000-a000-0000000000e2';
  v_pub_role uuid;
  v_amenity  uuid;
  v_amenity2 uuid;
  v_mt       uuid;
  v_media    uuid;
  v_rt_pub_on   uuid;  -- pubA,   is_published TRUE  (the only anon-visible room)
  v_rt_pub_off  uuid;  -- pubA,   is_published FALSE
  v_rt_dr_on    uuid;  -- draftA, is_published TRUE  (the pre-8v leak row)
  v_rt_dr_off   uuid;  -- draftA, is_published FALSE
  v_rt_new      uuid;
  v_denied      boolean;
BEGIN
  -- ---------- Fixture (as the connecting superuser/owner; RLS bypassed) ----------
  SELECT id INTO v_pub_role FROM ref_org_role WHERE code = 'publisher' LIMIT 1;
  IF v_pub_role IS NULL THEN RAISE EXCEPTION 'fixture: ref_org_role[publisher] missing (seeds not applied)'; END IF;
  SELECT id INTO v_amenity FROM ref_amenity ORDER BY code LIMIT 1;
  SELECT id INTO v_amenity2 FROM ref_amenity ORDER BY code OFFSET 1 LIMIT 1;
  IF v_amenity IS NULL OR v_amenity2 IS NULL THEN RAISE EXCEPTION 'fixture: ref_amenity needs >= 2 rows (seeds not applied)'; END IF;
  SELECT id INTO v_mt FROM ref_code_media_type ORDER BY code LIMIT 1;
  IF v_mt IS NULL THEN RAISE EXCEPTION 'fixture: ref_code_media_type empty (seeds not applied)'; END IF;

  -- users first: object.created_by has an FK to auth.users
  INSERT INTO auth.users (id, email) VALUES
    (v_userA, 'rtgate_a@test.local'), (v_userB, 'rtgate_b@test.local')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO app_user_profile (id, role) VALUES
    (v_userA, 'tourism_agent'), (v_userB, 'tourism_agent')
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;

  -- created_by = user A so the +CREATEDBY write leg is probeable without permission grants
  INSERT INTO object (id, object_type, name, status, created_by) VALUES
    (v_orgA,   'ORG', 'Org A',   'published', NULL),
    (v_orgB,   'ORG', 'Org B',   'published', NULL),
    (v_pubA,   'HOT', 'Pub A',   'published', v_userA),
    (v_draftA, 'HOT', 'Draft A', 'draft',     v_userA);

  INSERT INTO object_org_link (object_id, org_object_id, role_id) VALUES
    (v_pubA,   v_orgA, v_pub_role),
    (v_draftA, v_orgA, v_pub_role);

  INSERT INTO object_room_type (object_id, code, name, base_price, is_published) VALUES
    (v_pubA,   'RT-ON',  'Pub room on',    100, TRUE)  RETURNING id INTO v_rt_pub_on;
  INSERT INTO object_room_type (object_id, code, name, base_price, is_published) VALUES
    (v_pubA,   'RT-OFF', 'Pub room off',   110, FALSE) RETURNING id INTO v_rt_pub_off;
  INSERT INTO object_room_type (object_id, code, name, base_price, is_published) VALUES
    (v_draftA, 'RT-ON',  'Draft room on',  120, TRUE)  RETURNING id INTO v_rt_dr_on;
  INSERT INTO object_room_type (object_id, code, name, base_price, is_published) VALUES
    (v_draftA, 'RT-OFF', 'Draft room off', 130, FALSE) RETURNING id INTO v_rt_dr_off;

  INSERT INTO media (object_id, media_type_id, url, title, is_published) VALUES
    (v_pubA, v_mt, 'https://test.local/rtgate.jpg', 'rt-gate', TRUE) RETURNING id INTO v_media;

  INSERT INTO object_room_type_amenity (room_type_id, amenity_id) VALUES
    (v_rt_pub_on, v_amenity), (v_rt_pub_off, v_amenity),
    (v_rt_dr_on,  v_amenity), (v_rt_dr_off,  v_amenity);
  INSERT INTO object_room_type_media (room_type_id, media_id) VALUES
    (v_rt_pub_on, v_media), (v_rt_pub_off, v_media),
    (v_rt_dr_on,  v_media), (v_rt_dr_off,  v_media);

  INSERT INTO user_org_membership (user_id, org_object_id, is_active) VALUES
    (v_userA, v_orgA, TRUE), (v_userB, v_orgB, TRUE);

  -- ---------- Structural: no 8o self-binding left on the link tables ----------
  ASSERT NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('object_room_type_amenity','object_room_type_media')
      AND (coalesce(qual,'') || ' ' || coalesce(with_check,'')) LIKE '%rt.room_type_id%'
  ), '8o self-binding (rt.id = rt.room_type_id) still present on a link-table policy';
  ASSERT (SELECT count(*) FROM pg_policies WHERE schemaname='public'
          AND tablename='object_room_type' AND cmd='SELECT') = 1,
         'object_room_type must carry exactly ONE SELECT policy (read_object_room_type)';

  -- ---------- ANON: draft rooms invisible; published = is_published rooms only ----------
  PERFORM set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  SET LOCAL ROLE anon;
    ASSERT (SELECT count(*) FROM object_room_type WHERE object_id = v_draftA) = 0,
           'LEAK: anon reads room types of a DRAFT object (bare is_published flag not replaced?)';
    ASSERT (SELECT count(*) FROM object_room_type WHERE object_id = v_pubA) = 1,
           'anon MUST read exactly the is_published room type of a published object';
    ASSERT (SELECT count(*) FROM object_room_type WHERE object_id = v_pubA AND is_published IS NOT TRUE) = 0,
           'LEAK: anon reads an UNPUBLISHED room type of a published object';
    ASSERT (SELECT count(*) FROM object_room_type_amenity
            WHERE room_type_id IN (v_rt_dr_on, v_rt_dr_off)) = 0,
           'LEAK: anon reads amenity links of DRAFT-object rooms';
    ASSERT (SELECT count(*) FROM object_room_type_amenity
            WHERE room_type_id IN (v_rt_pub_on, v_rt_pub_off)) = 1,
           'anon MUST read exactly the amenity link of the is_published room';
    ASSERT (SELECT count(*) FROM object_room_type_media
            WHERE room_type_id IN (v_rt_dr_on, v_rt_dr_off)) = 0,
           'LEAK: anon reads media links of DRAFT-object rooms';
    ASSERT (SELECT count(*) FROM object_room_type_media
            WHERE room_type_id IN (v_rt_pub_on, v_rt_pub_off)) = 1,
           'anon MUST read exactly the media link of the is_published room';
    -- the standalone RPC (SECURITY INVOKER) rides the same gate
    ASSERT jsonb_array_length(api.get_object_room_types(v_draftA)::jsonb) = 0,
           'LEAK: api.get_object_room_types returns DRAFT-object rooms to anon';
    ASSERT jsonb_array_length(api.get_object_room_types(v_pubA)::jsonb) = 1,
           'api.get_object_room_types MUST return the is_published room of a published object to anon';
  RESET ROLE;

  -- ---------- USER A (member of owning ORG A): everything, incl. unpublished flags ----------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_userA, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    ASSERT (SELECT count(*) FROM object_room_type WHERE object_id = v_draftA) = 2,
           'user A MUST read both room types of own ORG draft (extended arm)';
    ASSERT (SELECT count(*) FROM object_room_type WHERE object_id = v_pubA) = 2,
           'user A MUST read both room types of own ORG published object';
    ASSERT (SELECT count(*) FROM object_room_type_amenity WHERE room_type_id IN
            (v_rt_pub_on, v_rt_pub_off, v_rt_dr_on, v_rt_dr_off)) = 4,
           'user A MUST read ALL amenity links incl. unpublished rooms (link ext arm — §05 loader)';
    ASSERT (SELECT count(*) FROM object_room_type_media WHERE room_type_id IN
            (v_rt_pub_on, v_rt_pub_off, v_rt_dr_on, v_rt_dr_off)) = 4,
           'user A MUST read ALL media links incl. unpublished rooms (link ext arm — §05 loader)';

    -- WRITE probe (the 8v §B repair): +CREATEDBY room insert, then LINK insert/delete —
    -- pre-8v the link WITH CHECK was rt.id = rt.room_type_id ⇒ deny-all and this raised 42501.
    INSERT INTO object_room_type (object_id, code, name, is_published)
      VALUES (v_draftA, 'RT-W', 'Write probe', FALSE) RETURNING id INTO v_rt_new;
    INSERT INTO object_room_type_amenity (room_type_id, amenity_id) VALUES (v_rt_new, v_amenity);
    INSERT INTO object_room_type_media   (room_type_id, media_id)   VALUES (v_rt_new, v_media);
    DELETE FROM object_room_type_amenity WHERE room_type_id = v_rt_new;
    ASSERT (SELECT count(*) FROM object_room_type_amenity WHERE room_type_id = v_rt_new) = 0,
           'creator DELETE of own amenity link must actually delete (deny-all USING would no-op)';
    DELETE FROM object_room_type_media WHERE room_type_id = v_rt_new;
    DELETE FROM object_room_type WHERE id = v_rt_new;
  RESET ROLE;

  -- ---------- USER B (unrelated ORG B): same visibility as anon; no link writes ----------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_userB, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    ASSERT (SELECT count(*) FROM object_room_type WHERE object_id = v_draftA) = 0,
           'LEAK: user B reads room types of a foreign ORG draft';
    ASSERT (SELECT count(*) FROM object_room_type WHERE object_id = v_pubA) = 1,
           'user B MUST read only the is_published room type of a published object';
    ASSERT (SELECT count(*) FROM object_room_type_amenity
            WHERE room_type_id IN (v_rt_dr_on, v_rt_dr_off)) = 0,
           'LEAK: user B reads amenity links of a foreign ORG draft';
    -- fresh PK pair so a unique violation cannot mask the RLS verdict
    v_denied := false;
    BEGIN
      INSERT INTO object_room_type_amenity (room_type_id, amenity_id)
        VALUES (v_rt_pub_on, v_amenity2);
    EXCEPTION WHEN insufficient_privilege THEN
      v_denied := true;
    END;
    ASSERT v_denied, 'HOLE: user B inserted an amenity link on a foreign ORG room (8v §B opened the gate too wide?)';
    -- deny-all DELETE manifests as a silent 0-row no-op — assert the row survives
    DELETE FROM object_room_type_media WHERE room_type_id = v_rt_pub_on;
    ASSERT (SELECT count(*) FROM object_room_type_media WHERE room_type_id = v_rt_pub_on) = 1,
           'HOLE: user B deleted a media link on a foreign ORG room';
  RESET ROLE;

  RAISE NOTICE 'object_room_type trio read-gate + link write-binding assertions passed.';
END$$;
ROLLBACK;
