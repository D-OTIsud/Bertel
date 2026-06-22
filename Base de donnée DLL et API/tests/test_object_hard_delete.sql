-- test_object_hard_delete.sql
-- Behavioral test for api.rpc_delete_object (§108). Transactionnel, ROLLBACK final.
-- Run APRÈS le manifest complet INCLUANT migration_object_hard_delete.sql.
\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_org       text := 'ORGRUN9999999971';
  v_obj       text := 'HOTRUN9999999971';
  v_su_uid    uuid := '00000000-0000-4000-a000-0000000000c1';  -- super_admin
  v_plain_uid uuid := '00000000-0000-4000-a000-0000000000c2';  -- tourism_agent (PAS superuser)
  v_pub_role  uuid;
  v_media_type uuid;
  v_doc_id    uuid := gen_random_uuid();
  v_result    jsonb;
  v_obj_left  int;
  v_media_left int;
  v_link_left int;
  v_doc_left  int;
  v_log_count int;
BEGIN
  -- ---------- Users ----------
  INSERT INTO auth.users (id, email) VALUES
    (v_su_uid,    'hd_superadmin@test.local'),
    (v_plain_uid, 'hd_plain@test.local');
  INSERT INTO app_user_profile (id, role) VALUES
    (v_su_uid, 'super_admin'), (v_plain_uid, 'tourism_agent')
  ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;

  -- ---------- Fixture : objet archivé + enfants témoins (cascade) + document orphelin ----------
  SELECT id INTO v_pub_role FROM ref_org_role WHERE code = 'publisher';
  SELECT id INTO v_media_type FROM ref_code_media_type ORDER BY code LIMIT 1;
  ASSERT v_media_type IS NOT NULL, 'fixture: no ref_code_media_type seeded';
  INSERT INTO object (id, object_type, name, status) VALUES
    (v_org, 'ORG', 'HardDelete Test Org',   'published'),
    (v_obj, 'HOT', 'HardDelete Test Hotel', 'archived');
  INSERT INTO object_org_link (object_id, org_object_id, role_id) VALUES (v_obj, v_org, v_pub_role);
  INSERT INTO media (object_id, media_type_id, url)
    VALUES (v_obj, v_media_type, 'https://x/storage/v1/object/public/media/'||v_obj||'/a.jpg');
  INSERT INTO ref_document (id, url)
    VALUES (v_doc_id, 'https://x/storage/v1/object/public/documents/'||v_obj||'/d.pdf');
  INSERT INTO object_document (object_id, document_id) VALUES (v_obj, v_doc_id);

  -- ========== 1. Non-superuser => FORBIDDEN ==========
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_plain_uid, 'role','authenticated')::text, true);
  BEGIN
    v_result := api.rpc_delete_object(v_obj, 'HardDelete Test Hotel');
    RAISE EXCEPTION 'GUARD FAILED: non-superuser deleted an object';
  EXCEPTION WHEN raise_exception THEN
    ASSERT POSITION('FORBIDDEN' IN SQLERRM) > 0, 'expected FORBIDDEN, got: '||SQLERRM;
  END;

  -- ========== superuser pour la suite ==========
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_su_uid, 'role','authenticated')::text, true);

  -- ========== 2. ORG rejeté ==========
  BEGIN
    v_result := api.rpc_delete_object(v_org, 'HardDelete Test Org');
    RAISE EXCEPTION 'GUARD FAILED: ORG was deleted';
  EXCEPTION WHEN raise_exception THEN
    ASSERT POSITION('FORBIDDEN_ORG' IN SQLERRM) > 0, 'expected FORBIDDEN_ORG, got: '||SQLERRM;
  END;

  -- ========== 3. nom de confirmation erroné ==========
  BEGIN
    v_result := api.rpc_delete_object(v_obj, 'Wrong Name');
    RAISE EXCEPTION 'GUARD FAILED: name mismatch accepted';
  EXCEPTION WHEN raise_exception THEN
    ASSERT POSITION('NAME_MISMATCH' IN SQLERRM) > 0, 'expected NAME_MISMATCH, got: '||SQLERRM;
  END;

  -- ========== 4. fiche non archivée bloquée ==========
  UPDATE object SET status = 'published' WHERE id = v_obj;
  BEGIN
    v_result := api.rpc_delete_object(v_obj, 'HardDelete Test Hotel');
    RAISE EXCEPTION 'GUARD FAILED: non-archived deleted';
  EXCEPTION WHEN raise_exception THEN
    ASSERT POSITION('MUST_ARCHIVE_FIRST' IN SQLERRM) > 0, 'expected MUST_ARCHIVE_FIRST, got: '||SQLERRM;
  END;
  UPDATE object SET status = 'archived' WHERE id = v_obj;

  -- ========== 5. happy path ==========
  v_result := api.rpc_delete_object(v_obj, 'HardDelete Test Hotel');
  ASSERT (v_result->>'deleted')::boolean,                          'expected deleted=true';
  ASSERT jsonb_array_length(v_result->'media_to_delete') = 1,      'expected 1 media url';
  ASSERT jsonb_array_length(v_result->'documents_to_delete') = 1,  'expected 1 document url';

  SELECT count(*) INTO v_obj_left   FROM object          WHERE id = v_obj;        ASSERT v_obj_left   = 0, 'object gone';
  SELECT count(*) INTO v_media_left FROM media           WHERE object_id = v_obj; ASSERT v_media_left = 0, 'media cascade-gone';
  SELECT count(*) INTO v_link_left  FROM object_org_link WHERE object_id = v_obj; ASSERT v_link_left  = 0, 'org_link cascade-gone';
  SELECT count(*) INTO v_doc_left   FROM ref_document    WHERE id = v_doc_id;     ASSERT v_doc_left   = 0, 'orphan ref_document deleted';
  SELECT count(*) INTO v_log_count  FROM object_deletion_log WHERE object_id = v_obj; ASSERT v_log_count = 1, 'one deletion log row';

  RAISE NOTICE 'Object hard-delete assertions passed.';
END$$;

ROLLBACK;
