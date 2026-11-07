-- test_contact_channel_read_gate.sql
-- Proves the §49 contact_channel read gate (migration_contact_channel_read_gate.sql, 8s):
--   * anon reads ZERO contact rows of a DRAFT object (the pre-§49 pub_contacts_public
--     leaked its is_public rows regardless of object status)
--   * anon reads ONLY the is_public rows of a PUBLISHED object (private rows stay hidden)
--   * a member of the owning ORG reads ALL rows (public + private) of both the draft and
--     the published object (extended arm — folded ext_contacts_org_actor semantics intact)
--   * a member of an unrelated ORG behaves exactly like anon (no extended leak)
-- Against a DB WITHOUT the migration the draft-leak assertion fails -> red.
-- Self-contained + transactional (ROLLBACK; nothing persists).
-- Mirrors test_read_gate_setbased.sql fixture mechanics.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_orgA   text := 'ORGRUN9999990301';
  v_orgB   text := 'ORGRUN9999990302';
  v_pubA   text := 'HOTRUN9999990311';  -- published, ORG-A scoped
  v_draftA text := 'HOTRUN9999990312';  -- draft, ORG-A scoped
  v_userA  uuid := '00000000-0000-4000-a000-0000000000c1';
  v_userB  uuid := '00000000-0000-4000-a000-0000000000c2';
  v_pub_role uuid;
  v_kind   uuid;
BEGIN
  -- ---------- Fixture (as the connecting superuser; RLS bypassed) ----------
  SELECT id INTO v_pub_role FROM ref_org_role WHERE code = 'publisher' LIMIT 1;
  IF v_pub_role IS NULL THEN RAISE EXCEPTION 'fixture: ref_org_role[publisher] missing (seeds not applied)'; END IF;
  -- any non-email kind (trg_contact_channel_email validates the value shape for kind=email)
  SELECT id INTO v_kind FROM ref_code_contact_kind WHERE lower(code) <> 'email' ORDER BY code LIMIT 1;
  IF v_kind IS NULL THEN RAISE EXCEPTION 'fixture: ref_code_contact_kind has no non-email kind (seeds not applied)'; END IF;

  INSERT INTO object (id, object_type, name, status) VALUES
    (v_orgA,   'ORG', 'Org A',   'published'),
    (v_orgB,   'ORG', 'Org B',   'published'),
    (v_pubA,   'HOT', 'Pub A',   'published'),
    (v_draftA, 'HOT', 'Draft A', 'draft');

  INSERT INTO object_org_link (object_id, org_object_id, role_id) VALUES
    (v_pubA,   v_orgA, v_pub_role),
    (v_draftA, v_orgA, v_pub_role);

  -- one public + one private contact row per object
  INSERT INTO contact_channel (object_id, kind_id, value, is_public) VALUES
    (v_pubA,   v_kind, 'pub-A-public',    TRUE),
    (v_pubA,   v_kind, 'pub-A-private',   FALSE),
    (v_draftA, v_kind, 'draft-A-public',  TRUE),
    (v_draftA, v_kind, 'draft-A-private', FALSE);

  INSERT INTO auth.users (id, email) VALUES
    (v_userA, 'ccgate_a@test.local'), (v_userB, 'ccgate_b@test.local')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO app_user_profile (id, role) VALUES
    (v_userA, 'tourism_agent'), (v_userB, 'tourism_agent')
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;
  INSERT INTO user_org_membership (user_id, org_object_id, is_active) VALUES
    (v_userA, v_orgA, TRUE), (v_userB, v_orgB, TRUE);

  -- ---------- ANON: draft contacts invisible; published = public rows only ----------
  PERFORM set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  SET LOCAL ROLE anon;
    ASSERT (SELECT count(*) FROM contact_channel WHERE object_id = v_draftA) = 0,
           'LEAK: anon reads contact rows of a DRAFT object (pub_contacts_public not replaced?)';
    ASSERT (SELECT count(*) FROM contact_channel WHERE object_id = v_pubA) = 1,
           'anon MUST read exactly the public contact row of a published object';
    ASSERT (SELECT count(*) FROM contact_channel WHERE object_id = v_pubA AND is_public IS NOT TRUE) = 0,
           'LEAK: anon reads a PRIVATE contact row of a published object';
  RESET ROLE;

  -- ---------- USER A (member of owning ORG A): all rows, both statuses ----------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_userA, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    ASSERT (SELECT count(*) FROM contact_channel WHERE object_id = v_draftA) = 2,
           'user A MUST read public+private contacts of own ORG draft (extended arm)';
    ASSERT (SELECT count(*) FROM contact_channel WHERE object_id = v_pubA) = 2,
           'user A MUST read public+private contacts of own ORG published object';
  RESET ROLE;

  -- ---------- USER B (unrelated ORG B): same visibility as anon ----------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_userB, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    ASSERT (SELECT count(*) FROM contact_channel WHERE object_id = v_draftA) = 0,
           'LEAK: user B reads contact rows of a foreign ORG draft';
    ASSERT (SELECT count(*) FROM contact_channel WHERE object_id = v_pubA) = 1,
           'user B MUST read only the public contact row of a published object';
  RESET ROLE;

  RAISE NOTICE 'contact_channel read-gate assertions passed.';
END$$;
ROLLBACK;
