-- test_cards_batch_authorize.sql
-- Proves the authorize-once + SECURITY DEFINER form of api.get_object_cards_batch
-- (migration_cards_batch_authorize_definer.sql, §36) self-authorizes its p_ids so a
-- DIRECT call cannot leak a foreign/anon-invisible draft, while preserving the visible
-- card set for every persona:
--   * a member of ORG A sees ORG A's published object AND its own draft;
--   * a member of unrelated ORG B sees the published object AND its own draft B, NOT draft A;
--   * anon sees ONLY the published object — drafts must not leak through a direct call.
-- Two assertion layers:
--   * STRUCTURAL — cards_batch is SECURITY DEFINER and api.current_user_readable_object_ids()
--     exists. Against a DB WITHOUT the migration this is FALSE -> red.
--   * BEHAVIOURAL — a direct get_object_cards_batch([pub, draftA, draftB]) returns exactly the
--     caller-visible ids (the authorize-once gate == the `object` table's own SELECT visibility).
-- This is the correctness + no-leak guard for the §36 migration. Self-contained + transactional
-- (ROLLBACK; nothing persists). Mirrors test_read_gate_setbased.sql fixture mechanics.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_orgA   text := 'ORGRUN9999990001';
  v_orgB   text := 'ORGRUN9999990002';
  v_pubA   text := 'HOTRUN9999990011';  -- published, ORG-A scoped
  v_draftA text := 'HOTRUN9999990012';  -- draft,     ORG-A scoped
  v_draftB text := 'HOTRUN9999990013';  -- draft,     ORG-B scoped
  v_userA  uuid := '00000000-0000-4000-a000-0000000000a1';
  v_userB  uuid := '00000000-0000-4000-a000-0000000000b2';
  v_pub_role uuid;
  v_ids    text[];
  v_page   text[];
BEGIN
  -- ---------- STRUCTURAL: the §36 migration is applied ----------
  ASSERT (SELECT p.prosecdef FROM pg_proc p
            WHERE p.proname = 'get_object_cards_batch' AND p.pronamespace = 'api'::regnamespace),
         'get_object_cards_batch MUST be SECURITY DEFINER (§36 migration not applied)';
  ASSERT EXISTS (SELECT 1 FROM pg_proc p
            WHERE p.proname = 'current_user_readable_object_ids' AND p.pronamespace = 'api'::regnamespace),
         'api.current_user_readable_object_ids() MUST exist (§36 migration not applied)';

  -- ---------- Fixture (as the connecting superuser; RLS bypassed) ----------
  SELECT id INTO v_pub_role FROM ref_org_role WHERE code = 'publisher' LIMIT 1;
  IF v_pub_role IS NULL THEN RAISE EXCEPTION 'fixture: ref_org_role[publisher] missing (seeds not applied)'; END IF;

  INSERT INTO object (id, object_type, name, status) VALUES
    (v_orgA,   'ORG', 'Org A',   'published'),
    (v_orgB,   'ORG', 'Org B',   'published'),
    (v_pubA,   'HOT', 'Pub A',   'published'),
    (v_draftA, 'HOT', 'Draft A', 'draft'),
    (v_draftB, 'HOT', 'Draft B', 'draft');

  -- link each HOT object to its publisher ORG (own_objects path keys off object_org_link)
  INSERT INTO object_org_link (object_id, org_object_id, role_id) VALUES
    (v_pubA,   v_orgA, v_pub_role),
    (v_draftA, v_orgA, v_pub_role),
    (v_draftB, v_orgB, v_pub_role);

  -- users + profiles + active memberships (auth.users trigger auto-creates the profile; UPSERT role)
  INSERT INTO auth.users (id, email) VALUES
    (v_userA, 'cards_a@test.local'), (v_userB, 'cards_b@test.local')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO app_user_profile (id, role) VALUES
    (v_userA, 'tourism_agent'), (v_userB, 'tourism_agent')
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;
  INSERT INTO user_org_membership (user_id, org_object_id, is_active) VALUES
    (v_userA, v_orgA, TRUE), (v_userB, v_orgB, TRUE);

  -- the same arbitrary page handed to every persona (incl. both drafts) — the function must
  -- self-authorize it, not trust the caller's id list.
  v_page := ARRAY[v_pubA, v_draftA, v_draftB];

  -- ---------- USER A (member of ORG A): pub + own draft A, NOT draft B ----------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_userA, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    SELECT array_agg(e->>'id' ORDER BY e->>'id') INTO v_ids
      FROM jsonb_array_elements(api.get_object_cards_batch(v_page, ARRAY['fr'])::jsonb) e;
    ASSERT v_ids = ARRAY[v_pubA, v_draftA],
           format('user A expected [pubA, draftA], got %s', v_ids);
  RESET ROLE;

  -- ---------- USER B (member of unrelated ORG B): pub + own draft B, NOT draft A ----------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_userB, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    SELECT array_agg(e->>'id' ORDER BY e->>'id') INTO v_ids
      FROM jsonb_array_elements(api.get_object_cards_batch(v_page, ARRAY['fr'])::jsonb) e;
    ASSERT v_ids = ARRAY[v_pubA, v_draftB],
           format('LEAK or loss: user B expected [pubA, draftB], got %s', v_ids);
  RESET ROLE;

  -- ---------- ANON: only the published object; a direct call must NOT leak any draft ----------
  PERFORM set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  SET LOCAL ROLE anon;
    SELECT array_agg(e->>'id' ORDER BY e->>'id') INTO v_ids
      FROM jsonb_array_elements(api.get_object_cards_batch(v_page, ARRAY['fr'])::jsonb) e;
    ASSERT v_ids = ARRAY[v_pubA],
           format('LEAK: anon expected [pubA] only, got %s', v_ids);
  RESET ROLE;

  RAISE NOTICE 'cards-batch authorize-once assertions passed.';
END$$;
ROLLBACK;
