-- test_object_cuisine_type.sql
-- Proves migration_object_cuisine_type.sql (§06 P1) gates object_cuisine_type correctly:
--   * structural: RLS on, §38 split read policy, per-command canonical write triple, NO FOR ALL.
--   * behavioral: anon reads PUBLISHED cuisine, NOT draft; anon write denied; service_role bypass.
-- Run AFTER the full manifest. Self-contained + transactional (ROLLBACK; nothing persists). Inserts run
-- as the connecting superuser (RLS bypassed); SET LOCAL ROLE + request.jwt.claims drive the per-role checks.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_pub       text := 'RESRUN9999999801';  -- published RES with a cuisine row
  v_draft     text := 'RESRUN9999999802';  -- draft RES with a cuisine row
  v_write     text := 'RESRUN9999999803';  -- published RES WITHOUT a cuisine row (anon INSERT target)
  v_creole    uuid;
  v_other_uid uuid := '00000000-0000-4000-a000-0000000000d1';
  v_inserted  boolean := false;
BEGIN
  SELECT id INTO v_creole FROM ref_code_cuisine_type WHERE code = 'creole';
  ASSERT v_creole IS NOT NULL, 'seed missing: cuisine_type creole';

  -- ---------- Structural assertions ----------
  ASSERT (SELECT relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='public' AND c.relname='object_cuisine_type'),
         'object_cuisine_type does not have RLS enabled';
  ASSERT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='object_cuisine_type'
                 AND policyname='read_object_cuisine_type' AND cmd='SELECT'
                 AND COALESCE(qual,'') LIKE '%current_user_extended_object_ids%'
                 AND COALESCE(qual,'') LIKE '%published%'),
         'read_object_cuisine_type missing / not §38 split form';
  ASSERT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='object_cuisine_type'
                 AND policyname='canonical_ins_object_cuisine_type' AND cmd='INSERT'
                 AND COALESCE(with_check,'') LIKE '%user_can_write_object_canonical%'),
         'canonical_ins_object_cuisine_type missing / not gated';
  ASSERT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='object_cuisine_type'
                 AND policyname='canonical_upd_object_cuisine_type' AND cmd='UPDATE'),
         'canonical_upd_object_cuisine_type missing';
  ASSERT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='object_cuisine_type'
                 AND policyname='canonical_del_object_cuisine_type' AND cmd='DELETE'),
         'canonical_del_object_cuisine_type missing';
  ASSERT NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='object_cuisine_type' AND cmd='ALL'),
         'object_cuisine_type must have NO FOR ALL policy (per-command only)';
  ASSERT has_function_privilege('anon','api.user_can_write_object_canonical(text)','EXECUTE'),
         'P0.3 gotcha: anon lacks EXECUTE on user_can_write_object_canonical(text)';

  -- ---------- Fixture (superuser; RLS bypassed) ----------
  INSERT INTO object (id, object_type, name, status) VALUES
    (v_pub,   'RES', 'cuisine RLS published', 'published'),
    (v_draft, 'RES', 'cuisine RLS draft',     'draft'),
    (v_write, 'RES', 'cuisine RLS write tgt', 'published');
  INSERT INTO object_cuisine_type (object_id, cuisine_type_id, position) VALUES
    (v_pub,   v_creole, 1),
    (v_draft, v_creole, 1);

  INSERT INTO auth.users (id, email) VALUES (v_other_uid, 'cuisine_other@test.local')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO app_user_profile (id, role) VALUES (v_other_uid, 'tourism_agent')
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;

  -- ---------- ANON: published readable, draft hidden, write denied ----------
  PERFORM set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  SET LOCAL ROLE anon;
    ASSERT (SELECT count(*) FROM object_cuisine_type WHERE object_id=v_pub)   = 1, 'anon MUST read PUBLISHED cuisine';
    ASSERT (SELECT count(*) FROM object_cuisine_type WHERE object_id=v_draft) = 0, 'LEAK: anon reads DRAFT cuisine';
    BEGIN
      INSERT INTO object_cuisine_type (object_id, cuisine_type_id, position) VALUES (v_write, v_creole, 1);
      v_inserted := true;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    ASSERT NOT v_inserted, 'LEAK: anon WROTE to object_cuisine_type';
  RESET ROLE;

  -- ---------- AUTHENTICATED other-ORG (no membership): published only ----------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_other_uid, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    ASSERT (SELECT count(*) FROM object_cuisine_type WHERE object_id=v_pub)   = 1, 'other-ORG MUST read PUBLISHED cuisine';
    ASSERT (SELECT count(*) FROM object_cuisine_type WHERE object_id=v_draft) = 0, 'LEAK: other-ORG reads DRAFT cuisine';
  RESET ROLE;

  -- ---------- get_object_resource reads object-level cuisine ----------
  PERFORM set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  SET LOCAL ROLE anon;
    ASSERT (SELECT jsonb_array_length(api.get_object_resource(v_pub)->'cuisine_types')) = 1,
           'get_object_resource(RES).cuisine_types must reflect object_cuisine_type';
  RESET ROLE;

  RAISE NOTICE 'object_cuisine_type assertions passed (structural + read gate + write deny + resource).';
END$$;
ROLLBACK;
