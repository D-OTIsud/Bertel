-- test_object_fma_rls.sql
-- Proves migration_object_fma_write_policy.sql (§47, manifest 8n): object_fma gains a per-command
-- canonical write triple (canonical_ins/upd/del_object_fma) -- before it, RLS was enabled with ONLY
-- SELECT policies, so the editor's direct upsert was denied for every non-service role.
-- Owner persona is ACTOR-LINK based (api.is_object_owner = actor_object_role.is_primary on an actor
-- whose actor_channel email matches the JWT 'email' claim -- rls_policies.sql:202-213 / :110-118),
-- NOT created_by; the email claim is in the owner JWT so api.current_user_email() resolves it.
-- Fixture object is type FMA (the 8m trigger enforces object_fma only accepts FMA).
-- Run AFTER the full manifest. Self-contained + transactional (ROLLBACK). Against a DB WITHOUT 8n,
-- the structural per-command asserts go red (and the owner INSERT would be denied).
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_owner_obj    text := 'FMARUN9999999801';  -- draft FMA, owned by the owner persona
  v_pub          text := 'FMARUN9999999802';  -- published FMA (has an object_fma row) -- anon read
  v_stranger_obj text := 'FMARUN9999999803';  -- draft FMA, no owner link -- stranger/anon write target
  v_uid          uuid := '00000000-0000-4000-a000-0000000000f1';
  v_email        text := 'fma_owner_test@test.local';
  v_actor        uuid := '00000000-0000-4000-a000-0000000000f2';
  v_stranger_uid uuid := '00000000-0000-4000-a000-0000000000f9';
  v_kind uuid;
  v_role uuid;
  v_ok   boolean;
BEGIN
  -- ---------- Structural: per-command write triple, NO FOR ALL, read pair intact ----------
  ASSERT (SELECT relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='public' AND c.relname='object_fma'), 'object_fma RLS not enabled';
  ASSERT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='object_fma'
                 AND policyname='canonical_ins_object_fma' AND cmd='INSERT'
                 AND COALESCE(with_check,'') LIKE '%user_can_write_object_canonical%'),
         'canonical_ins_object_fma missing / not gated';
  ASSERT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='object_fma'
                 AND policyname='canonical_upd_object_fma' AND cmd='UPDATE'
                 AND COALESCE(qual,'') LIKE '%user_can_write_object_canonical%'
                 AND COALESCE(with_check,'') LIKE '%user_can_write_object_canonical%'),
         'canonical_upd_object_fma missing / not gated (USING + WITH CHECK)';
  ASSERT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='object_fma'
                 AND policyname='canonical_del_object_fma' AND cmd='DELETE'
                 AND COALESCE(qual,'') LIKE '%user_can_write_object_canonical%'),
         'canonical_del_object_fma missing / not gated';
  ASSERT NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='object_fma' AND cmd='ALL'),
         'object_fma must have NO FOR ALL write policy (per-command only -- §47)';
  ASSERT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='object_fma' AND cmd='SELECT'),
         'object_fma read policy pair must remain';
  ASSERT has_function_privilege('anon','api.user_can_write_object_canonical(text)','EXECUTE'),
         'P0.3: anon needs EXECUTE on user_can_write_object_canonical for object_fma SELECT';

  -- ---------- Fixtures (connecting superuser; RLS bypassed) ----------
  SELECT id INTO v_kind FROM ref_code_contact_kind WHERE code='email';
  SELECT id INTO v_role FROM ref_actor_role WHERE code='operator' LIMIT 1;
  ASSERT v_kind IS NOT NULL AND v_role IS NOT NULL, 'fixture refs missing (email kind / operator role -- seeds not applied)';
  INSERT INTO object (id, object_type, name, status) VALUES
    (v_owner_obj,    'FMA','fma RLS owner',     'draft'),
    (v_pub,          'FMA','fma RLS published', 'published'),
    (v_stranger_obj, 'FMA','fma RLS stranger',  'draft');
  INSERT INTO object_fma (object_id) VALUES (v_pub);  -- published row for the anon read test
  -- owner persona = actor linked by email + primary role on v_owner_obj
  INSERT INTO auth.users (id,email) VALUES (v_uid,v_email) ON CONFLICT (id) DO NOTHING;
  INSERT INTO app_user_profile (id,role) VALUES (v_uid,'tourism_agent') ON CONFLICT (id) DO UPDATE SET role=EXCLUDED.role;
  INSERT INTO actor (id,display_name) VALUES (v_actor,'FMA Owner');
  INSERT INTO actor_channel (actor_id,kind_id,value) VALUES (v_actor,v_kind,v_email);
  INSERT INTO actor_object_role (actor_id,object_id,role_id,is_primary) VALUES (v_actor,v_owner_obj,v_role,TRUE);
  -- stranger persona = authenticated, no actor link, no membership
  INSERT INTO auth.users (id,email) VALUES (v_stranger_uid,'fma_stranger@test.local') ON CONFLICT (id) DO NOTHING;
  INSERT INTO app_user_profile (id,role) VALUES (v_stranger_uid,'tourism_agent') ON CONFLICT (id) DO UPDATE SET role=EXCLUDED.role;

  -- ---------- OWNER: INSERT / UPDATE / DELETE allowed ----------
  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_uid,'role','authenticated','email',v_email)::text, true);
  SET LOCAL ROLE authenticated;
    INSERT INTO object_fma (object_id) VALUES (v_owner_obj);
    ASSERT EXISTS (SELECT 1 FROM object_fma WHERE object_id=v_owner_obj), 'owner INSERT object_fma failed (canonical_ins denies the owner)';
    UPDATE object_fma SET is_recurring = TRUE WHERE object_id=v_owner_obj;
    ASSERT (SELECT is_recurring FROM object_fma WHERE object_id=v_owner_obj) = TRUE, 'owner UPDATE object_fma failed';
    DELETE FROM object_fma WHERE object_id=v_owner_obj;
    ASSERT NOT EXISTS (SELECT 1 FROM object_fma WHERE object_id=v_owner_obj), 'owner DELETE object_fma failed';
  RESET ROLE;

  -- ---------- STRANGER (authenticated, no link): INSERT denied ----------
  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_stranger_uid,'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    v_ok := false;
    BEGIN
      INSERT INTO object_fma (object_id) VALUES (v_stranger_obj);
      v_ok := true;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    ASSERT NOT v_ok, 'stranger WROTE object_fma (canonical_ins gate not enforced)';
  RESET ROLE;

  -- ---------- ANON: published readable, draft hidden, write denied ----------
  PERFORM set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  SET LOCAL ROLE anon;
    ASSERT (SELECT count(*) FROM object_fma WHERE object_id=v_pub)=1, 'anon MUST read PUBLISHED object_fma';
    ASSERT (SELECT count(*) FROM object_fma WHERE object_id=v_stranger_obj)=0, 'LEAK: anon reads DRAFT object_fma';
    v_ok := false;
    BEGIN
      INSERT INTO object_fma (object_id) VALUES (v_stranger_obj);
      v_ok := true;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    ASSERT NOT v_ok, 'LEAK: anon WROTE object_fma';
  RESET ROLE;

  RAISE NOTICE 'object_fma RLS assertions passed (per-command structural + owner write + stranger/anon deny + anon read gate).';
END$$;
ROLLBACK;
