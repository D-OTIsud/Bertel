-- test_object_act_rls.sql
-- Proves migration_object_act_rls.sql closed the object_act anon read/write leak.
-- Run AFTER the full manifest (incl. migration_object_act_rls.sql + seeds).
-- Self-contained + transactional (ROLLBACK; nothing persists). Mirrors test_p03_read_gate_behavior.sql
-- fixture mechanics: inserts run as the connecting superuser (RLS bypassed); SET LOCAL ROLE +
-- request.jwt.claims drive the per-role checks. Against a DB WITHOUT the migration (RLS off), the draft
-- row is visible to anon and the anon INSERT succeeds -> both assertions go red.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_pub       text := 'ACTRUN9999999801';  -- published ACT (has an object_act row)
  v_draft     text := 'ACTRUN9999999802';  -- draft ACT     (has an object_act row)
  v_write     text := 'ACTRUN9999999803';  -- published ACT WITHOUT an object_act row (anon INSERT target)
  v_other_uid uuid := '00000000-0000-4000-a000-0000000000c1';
  v_inserted  boolean := false;
BEGIN
  -- ---------- Structural assertions (catalog) ----------
  ASSERT (SELECT relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relname = 'object_act'),
         'object_act does not have RLS enabled (migration_object_act_rls.sql not applied)';
  ASSERT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='object_act'
                 AND policyname='read_object_act' AND cmd='SELECT'
                 AND COALESCE(qual,'') LIKE '%can_read_object%'),
         'read_object_act policy missing / not gated on api.can_read_object';
  ASSERT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='object_act'
                 AND policyname='canonical_write_object_act' AND cmd='ALL'
                 AND COALESCE(qual,'') LIKE '%user_can_write_object_canonical%'
                 AND COALESCE(with_check,'') LIKE '%user_can_write_object_canonical%'),
         'canonical_write_object_act policy missing / not gated on api.user_can_write_object_canonical (USING + WITH CHECK)';
  ASSERT has_function_privilege('anon', 'api.user_can_write_object_canonical(text)', 'EXECUTE'),
         'P0.3 gotcha: anon lacks EXECUTE on api.user_can_write_object_canonical(text) -> anon SELECT on object_act would error';

  -- ---------- Fixture (as superuser; RLS bypassed) ----------
  INSERT INTO object (id, object_type, name, status) VALUES
    (v_pub,   'ACT', 'object_act RLS published', 'published'),
    (v_draft, 'ACT', 'object_act RLS draft',     'draft'),
    (v_write, 'ACT', 'object_act RLS write tgt',  'published');

  INSERT INTO object_act (object_id, duration_min, guide_required) VALUES
    (v_pub,   60, true),
    (v_draft, 90, true);
  -- v_write intentionally has NO object_act row (clean anon-INSERT target; no PK conflict to mask RLS).

  -- an authenticated user with NO membership/actor on any object (mirrors the P0.3 test fixture).
  INSERT INTO auth.users (id, email) VALUES (v_other_uid, 'object_act_other_org@test.local')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO app_user_profile (id, role) VALUES (v_other_uid, 'tourism_agent')
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;

  -- ---------- ANON: published readable, draft hidden, write denied ----------
  PERFORM set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  SET LOCAL ROLE anon;
    ASSERT (SELECT count(*) FROM object_act WHERE object_id = v_pub)   = 1, 'anon MUST read PUBLISHED object_act';
    ASSERT (SELECT count(*) FROM object_act WHERE object_id = v_draft) = 0, 'LEAK: anon reads DRAFT object_act';

    -- write must be denied: anon INSERT trips the canonical_write WITH CHECK -> 42501 (insufficient_privilege).
    BEGIN
      INSERT INTO object_act (object_id, duration_min) VALUES (v_write, 45);
      v_inserted := true;  -- only reached if RLS let the write through (the bug)
    EXCEPTION
      WHEN insufficient_privilege THEN NULL;  -- expected: new row violates row-level security policy
    END;
    ASSERT NOT v_inserted, 'LEAK: anon WROTE to object_act (canonical_write gate not enforced)';
  RESET ROLE;

  -- ---------- AUTHENTICATED other-ORG (no membership/actor): published readable, draft hidden ----------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_other_uid, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    ASSERT (SELECT count(*) FROM object_act WHERE object_id = v_pub)   = 1, 'other-ORG user MUST read PUBLISHED object_act';
    ASSERT (SELECT count(*) FROM object_act WHERE object_id = v_draft) = 0, 'LEAK: other-ORG user reads DRAFT object_act';
  RESET ROLE;

  -- ---------- SERVICE_ROLE: bypasses RLS, sees all (sanity) ----------
  SET LOCAL ROLE service_role;
    ASSERT (SELECT count(*) FROM object_act WHERE object_id = v_draft) = 1, 'service_role MUST see draft object_act (bypass)';
  RESET ROLE;

  RAISE NOTICE 'object_act RLS assertions passed (structural + anon/other-ORG read gate + anon write deny).';
END$$;
ROLLBACK;
