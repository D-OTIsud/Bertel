-- test_p03_read_gate_behavior.sql
-- P0.3 behavioral proof. Run AFTER the full manifest (incl. migration_rls_read_gate_p03.sql + seeds).
-- Self-contained + transactional (ROLLBACK; nothing persists). Mirrors test_sp2 fixture mechanics:
-- inserts run as the connecting superuser (RLS bypassed); SET LOCAL ROLE + request.jwt.claims drive
-- the per-role checks. Against a DB without the migration, the draft rows are visible to anon -> red.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_pub       text := 'HOTRUN9999999801';
  v_draft     text := 'HOTRUN9999999802';
  v_kind      uuid;
  v_pub_price uuid; v_draft_price uuid;
  v_pub_pp    uuid; v_draft_pp    uuid;
  v_other_uid uuid := '00000000-0000-4000-a000-0000000000b1';
BEGIN
  -- ---------- Fixture (as superuser; RLS bypassed) ----------
  SELECT id INTO v_kind FROM ref_code_price_kind LIMIT 1;
  IF v_kind IS NULL THEN RAISE EXCEPTION 'fixture: ref_code_price_kind empty (seeds not applied)'; END IF;

  INSERT INTO object (id, object_type, name, status) VALUES
    (v_pub,   'HOT', 'P03 published', 'published'),
    (v_draft, 'HOT', 'P03 draft',     'draft');

  INSERT INTO object_location (object_id, latitude, longitude) VALUES
    (v_pub, 1.111111, 1.111111), (v_draft, 2.222222, 2.222222);

  INSERT INTO object_price (object_id, kind_id, amount) VALUES (v_pub,   v_kind, 10) RETURNING id INTO v_pub_price;
  INSERT INTO object_price (object_id, kind_id, amount) VALUES (v_draft, v_kind, 20) RETURNING id INTO v_draft_price;
  INSERT INTO object_price_period (price_id, note) VALUES (v_pub_price,   'pub pp')   RETURNING id INTO v_pub_pp;
  INSERT INTO object_price_period (price_id, note) VALUES (v_draft_price, 'draft pp') RETURNING id INTO v_draft_pp;

  -- an authenticated user with NO membership/actor on either object (auth.users trigger auto-creates
  -- the profile; UPSERT to a non-superuser role).
  INSERT INTO auth.users (id, email) VALUES (v_other_uid, 'p03_other_org@test.local')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO app_user_profile (id, role) VALUES (v_other_uid, 'tourism_agent')
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;

  -- ---------- ANON: published visible, draft hidden (direct + nested) ----------
  PERFORM set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  SET LOCAL ROLE anon;
    ASSERT (SELECT count(*) FROM object_location     WHERE object_id = v_pub)   = 1, 'anon MUST see published location';
    ASSERT (SELECT count(*) FROM object_location     WHERE object_id = v_draft) = 0, 'P0.3 LEAK: anon sees DRAFT location';
    ASSERT (SELECT count(*) FROM object_price_period WHERE id = v_pub_pp)       = 1, 'anon MUST see published price period (nested)';
    ASSERT (SELECT count(*) FROM object_price_period WHERE id = v_draft_pp)     = 0, 'P0.3 LEAK: anon sees DRAFT price period (nested)';
  RESET ROLE;

  -- ---------- AUTHENTICATED other-ORG (no membership/actor): draft hidden ----------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_other_uid, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    ASSERT (SELECT count(*) FROM object_location     WHERE object_id = v_pub)   = 1, 'other-ORG user MUST see published location';
    ASSERT (SELECT count(*) FROM object_location     WHERE object_id = v_draft) = 0, 'P0.3 LEAK: other-ORG user sees DRAFT location';
    ASSERT (SELECT count(*) FROM object_price_period WHERE id = v_draft_pp)     = 0, 'P0.3 LEAK: other-ORG user sees DRAFT price period';
  RESET ROLE;

  -- ---------- SERVICE_ROLE: bypasses RLS, sees all (sanity) ----------
  SET LOCAL ROLE service_role;
    ASSERT (SELECT count(*) FROM object_location     WHERE object_id = v_draft) = 1, 'service_role MUST see draft location (bypass)';
    ASSERT (SELECT count(*) FROM object_price_period WHERE id = v_draft_pp)     = 1, 'service_role MUST see draft price period (bypass)';
  RESET ROLE;

  RAISE NOTICE 'P0.3 behavioral assertions passed.';
END$$;
ROLLBACK;
