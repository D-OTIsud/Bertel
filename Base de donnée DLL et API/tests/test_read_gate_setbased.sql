-- test_read_gate_setbased.sql
-- Proves the set-based extended read gate (api.current_user_extended_object_ids() + the
-- `object` SELECT policy rewritten to `id IN (SELECT ...)`) preserves draft-ownership visibility:
--   * a member of ORG A sees ORG A's own draft (own_objects path, 2B)
--   * neither anon nor a member of unrelated ORG B sees ORG A's draft
--   * the new set function agrees with the per-persona visibility on the fixture
-- This is the correctness guard for migration_explorer_rls_setbased.sql (the Explorer
-- statement_timeout fix). Against a DB WITHOUT that migration the set function does not exist
-- -> the first call errors -> red. Self-contained + transactional (ROLLBACK; nothing persists).
-- Mirrors test_p03_read_gate_behavior.sql fixture mechanics.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_orgA   text := 'ORGRUN9999990001';
  v_orgB   text := 'ORGRUN9999990002';
  v_pubA   text := 'HOTRUN9999990011';  -- published, published-ORG-A scoped
  v_draftA text := 'HOTRUN9999990012';  -- draft, ORG-A scoped
  v_userA  uuid := '00000000-0000-4000-a000-0000000000a1';
  v_userB  uuid := '00000000-0000-4000-a000-0000000000b2';
  v_pub_role uuid;
BEGIN
  -- ---------- Fixture (as the connecting superuser; RLS bypassed) ----------
  SELECT id INTO v_pub_role FROM ref_org_role WHERE code = 'publisher' LIMIT 1;
  IF v_pub_role IS NULL THEN RAISE EXCEPTION 'fixture: ref_org_role[publisher] missing (seeds not applied)'; END IF;

  INSERT INTO object (id, object_type, name, status) VALUES
    (v_orgA,   'ORG', 'Org A',   'published'),
    (v_orgB,   'ORG', 'Org B',   'published'),
    (v_pubA,   'HOT', 'Pub A',   'published'),
    (v_draftA, 'HOT', 'Draft A', 'draft');

  -- link the two HOT objects to ORG A as publisher (own_objects path keys off object_org_link)
  INSERT INTO object_org_link (object_id, org_object_id, role_id) VALUES
    (v_pubA,   v_orgA, v_pub_role),
    (v_draftA, v_orgA, v_pub_role);

  -- users + profiles + active memberships (auth.users trigger auto-creates the profile; UPSERT role)
  INSERT INTO auth.users (id, email) VALUES
    (v_userA, 'setbased_a@test.local'), (v_userB, 'setbased_b@test.local')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO app_user_profile (id, role) VALUES
    (v_userA, 'tourism_agent'), (v_userB, 'tourism_agent')
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;
  INSERT INTO user_org_membership (user_id, org_object_id, is_active) VALUES
    (v_userA, v_orgA, TRUE), (v_userB, v_orgB, TRUE);

  -- ---------- USER A (member of ORG A): sees own ORG draft; set fn includes it ----------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_userA, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    ASSERT (SELECT count(*) FROM object WHERE id = v_draftA) = 1,
           'user A MUST see own ORG draft (direct object SELECT under the set-based policy)';
    ASSERT EXISTS (SELECT 1 FROM api.current_user_extended_object_ids() s WHERE s = v_draftA),
           'set fn MUST include own ORG draft for user A';
  RESET ROLE;

  -- ---------- USER B (member of unrelated ORG B): draft A hidden; published A visible ----------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_userB, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    ASSERT (SELECT count(*) FROM object WHERE id = v_draftA) = 0, 'LEAK: user B sees foreign ORG draft A';
    ASSERT (SELECT count(*) FROM object WHERE id = v_pubA)   = 1, 'user B MUST see published A';
    ASSERT NOT EXISTS (SELECT 1 FROM api.current_user_extended_object_ids() s WHERE s = v_draftA),
           'set fn MUST NOT include foreign ORG draft for user B';
  RESET ROLE;

  -- ---------- ANON: only published ----------
  PERFORM set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  SET LOCAL ROLE anon;
    ASSERT (SELECT count(*) FROM object WHERE id = v_pubA)   = 1, 'anon MUST see published A';
    ASSERT (SELECT count(*) FROM object WHERE id = v_draftA) = 0, 'LEAK: anon sees draft A';
  RESET ROLE;

  RAISE NOTICE 'set-based read gate assertions passed.';
END$$;
ROLLBACK;
