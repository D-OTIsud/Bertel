-- test_object_document.sql
-- Proves migration_object_document.sql (§06 P3) gates object_document correctly + get_object_resource
-- emits the menu_documents key from the object_document→ref_document join (role 'carte').
--   * structural: RLS on, §38 split read policy, per-command canonical write triple, NO FOR ALL.
--   * behavioral: anon reads a PUBLISHED object's carte, NOT a draft's; anon write denied.
-- Run AFTER the full manifest. Self-contained + transactional (ROLLBACK; nothing persists).
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_pub       text := 'RESRUN9999999811';  -- published RES with a carte
  v_draft     text := 'RESRUN9999999812';  -- draft RES with a carte
  v_write     text := 'RESRUN9999999813';  -- published RES, anon INSERT target
  v_role      uuid;
  v_doc_pub   uuid;
  v_doc_draft uuid;
  v_other_uid uuid := '00000000-0000-4000-a000-0000000000d2';
  v_inserted  boolean := false;
BEGIN
  SELECT id INTO v_role FROM ref_code_document_type WHERE code = 'carte';
  ASSERT v_role IS NOT NULL, 'seed missing: document_type carte';

  -- ---------- Structural assertions ----------
  ASSERT (SELECT relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='public' AND c.relname='object_document'),
         'object_document does not have RLS enabled';
  ASSERT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='object_document'
                 AND policyname='read_object_document' AND cmd='SELECT'
                 AND COALESCE(qual,'') LIKE '%current_user_extended_object_ids%'
                 AND COALESCE(qual,'') LIKE '%published%'),
         'read_object_document missing / not §38 split form';
  ASSERT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='object_document'
                 AND policyname='canonical_ins_object_document' AND cmd='INSERT'
                 AND COALESCE(with_check,'') LIKE '%user_can_write_object_canonical%'),
         'canonical_ins_object_document missing / not gated';
  ASSERT NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='object_document' AND cmd='ALL'),
         'object_document must have NO FOR ALL policy (per-command only)';
  ASSERT has_function_privilege('anon','api.user_can_write_object_canonical(text)','EXECUTE'),
         'P0.3 gotcha: anon lacks EXECUTE on user_can_write_object_canonical(text)';

  -- ---------- Fixture (superuser; RLS bypassed) ----------
  INSERT INTO object (id, object_type, name, status) VALUES
    (v_pub,   'RES', 'doc RLS published', 'published'),
    (v_draft, 'RES', 'doc RLS draft',     'draft'),
    (v_write, 'RES', 'doc RLS write tgt', 'published');
  INSERT INTO ref_document (url, title) VALUES ('https://x.test/pub.pdf','Carte pub') RETURNING id INTO v_doc_pub;
  INSERT INTO ref_document (url, title) VALUES ('https://x.test/draft.pdf','Carte draft') RETURNING id INTO v_doc_draft;
  INSERT INTO object_document (object_id, document_id, role_id, title, position) VALUES
    (v_pub,   v_doc_pub,   v_role, 'Carte midi', 1),
    (v_draft, v_doc_draft, v_role, 'Carte midi', 1);

  INSERT INTO auth.users (id, email) VALUES (v_other_uid, 'doc_other@test.local')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO app_user_profile (id, role) VALUES (v_other_uid, 'tourism_agent')
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;

  -- ---------- ANON: published readable, draft hidden, write denied ----------
  PERFORM set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  SET LOCAL ROLE anon;
    ASSERT (SELECT count(*) FROM object_document WHERE object_id=v_pub)   = 1, 'anon MUST read PUBLISHED carte';
    ASSERT (SELECT count(*) FROM object_document WHERE object_id=v_draft) = 0, 'LEAK: anon reads DRAFT carte';
    BEGIN
      INSERT INTO object_document (object_id, document_id, role_id, position) VALUES (v_write, v_doc_pub, v_role, 1);
      v_inserted := true;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    ASSERT NOT v_inserted, 'LEAK: anon WROTE to object_document';
    -- get_object_resource emits menu_documents for the published object.
    ASSERT (SELECT jsonb_array_length((api.get_object_resource(v_pub))::jsonb -> 'menu_documents')) = 1,
           'get_object_resource(RES).menu_documents must reflect object_document';
  RESET ROLE;

  RAISE NOTICE 'object_document assertions passed (structural + read gate + write deny + menu_documents).';
END$$;
ROLLBACK;
