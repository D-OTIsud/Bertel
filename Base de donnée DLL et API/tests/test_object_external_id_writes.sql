-- Base de donnée DLL et API/tests/test_object_external_id_writes.sql
-- Behavioral test for api.rpc_upsert_object_external_id / api.rpc_delete_object_external_id
-- + api.current_user_is_org_admin. Self-contained + transactional (ROLLBACK at end).
-- Run AFTER the full manifest INCLUDING migration_object_external_id_writes.sql.
\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_org        text := 'ORGRUN9999999931';
  v_obj        text := 'HOTRUN9999999931';
  v_admin_uid  uuid := '00000000-0000-4000-a000-0000000000c1';  -- ORG admin
  v_member_uid uuid := '00000000-0000-4000-a000-0000000000c2';  -- ORG member, NOT admin
  v_admin_role uuid;
  v_m_admin uuid; v_m_member uuid;
  v_id uuid;
  v_id2 uuid;
  v_ext text;
  v_org_col text;
  v_count int;
BEGIN
  -- ---------- Fixture (as postgres; RLS bypassed for setup) ----------
  INSERT INTO object (id, object_type, name, status) VALUES
    (v_org, 'ORG', 'ExtId Test Org', 'published'),
    (v_obj, 'HOT', 'ExtId Test Hotel', 'draft');

  INSERT INTO auth.users (id, email) VALUES
    (v_admin_uid,  'extid_admin@test.local'),
    (v_member_uid, 'extid_member@test.local');
  INSERT INTO app_user_profile (id, role) VALUES
    (v_admin_uid, 'tourism_agent'), (v_member_uid, 'tourism_agent')
  ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;

  INSERT INTO user_org_membership (user_id, org_object_id, is_active)
    VALUES (v_admin_uid, v_org, TRUE) RETURNING id INTO v_m_admin;
  INSERT INTO user_org_membership (user_id, org_object_id, is_active)
    VALUES (v_member_uid, v_org, TRUE) RETURNING id INTO v_m_member;

  -- Grant the admin an ORG admin role (any code makes current_user_admin_role_code() non-NULL).
  SELECT id INTO v_admin_role FROM ref_org_admin_role ORDER BY id LIMIT 1;
  INSERT INTO user_org_admin_role (membership_id, role_id, is_active)
    VALUES (v_m_admin, v_admin_role, TRUE);

  -- ---------- Helper reflects the admin gate ----------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin_uid, 'role','authenticated')::text, true);
  ASSERT api.current_user_is_org_admin() = TRUE, 'admin should be org admin';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_member_uid, 'role','authenticated')::text, true);
  ASSERT api.current_user_is_org_admin() = FALSE, 'plain member is not org admin';

  -- ---------- Admin: upsert inserts, derives org, returns id ----------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin_uid, 'role','authenticated')::text, true);
  v_id := api.rpc_upsert_object_external_id(v_obj, 'AT', 'recABC123', NULL);
  ASSERT v_id IS NOT NULL, 'upsert returns a row id';
  SELECT external_id, organization_object_id INTO v_ext, v_org_col
    FROM object_external_id WHERE id = v_id;
  ASSERT v_ext = 'recABC123', 'external_id stored';
  ASSERT v_org_col = v_org, 'organization_object_id derived from current_user_org_id (client cannot choose)';

  -- ---------- Admin: upsert again on same (object,org,source) UPDATES, same id ----------
  v_id2 := api.rpc_upsert_object_external_id(v_obj, 'AT', 'recXYZ999', '2026-06-17T08:00:00Z');
  ASSERT v_id2 = v_id, 'ON CONFLICT updates the existing row (uq_object_external_id_object_org_source)';
  SELECT external_id INTO v_ext FROM object_external_id WHERE id = v_id;
  ASSERT v_ext = 'recXYZ999', 'external_id updated on conflict';
  SELECT count(*) INTO v_count FROM object_external_id WHERE object_id = v_obj;
  ASSERT v_count = 1, 'no duplicate row created on conflict';

  -- ---------- Admin: canonical sources rejected ----------
  BEGIN
    PERFORM api.rpc_upsert_object_external_id(v_obj, 'OTI', 'oti-1', NULL);
    RAISE EXCEPTION 'CANONICAL GUARD FAILED: OTI accepted';
  EXCEPTION WHEN raise_exception THEN
    ASSERT POSITION('CANONICAL_SOURCE' IN SQLERRM) > 0, 'expected CANONICAL_SOURCE for OTI, got: ' || SQLERRM;
  END;
  BEGIN
    PERFORM api.rpc_upsert_object_external_id(v_obj, 'su', 'su-1', NULL);
    RAISE EXCEPTION 'CANONICAL GUARD FAILED: su accepted';
  EXCEPTION WHEN raise_exception THEN
    ASSERT POSITION('CANONICAL_SOURCE' IN SQLERRM) > 0, 'expected CANONICAL_SOURCE for su, got: ' || SQLERRM;
  END;
  BEGIN
    PERFORM api.rpc_upsert_object_external_id(v_obj, 'my_canonical_feed', 'c-1', NULL);
    RAISE EXCEPTION 'CANONICAL GUARD FAILED: *canonical* accepted';
  EXCEPTION WHEN raise_exception THEN
    ASSERT POSITION('CANONICAL_SOURCE' IN SQLERRM) > 0, 'expected CANONICAL_SOURCE for *canonical*, got: ' || SQLERRM;
  END;

  -- ---------- Non-admin member is blocked on upsert ----------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_member_uid, 'role','authenticated')::text, true);
  BEGIN
    PERFORM api.rpc_upsert_object_external_id(v_obj, 'DT', 'dt-1', NULL);
    RAISE EXCEPTION 'AUTHZ GUARD FAILED: non-admin upserted';
  EXCEPTION WHEN raise_exception THEN
    ASSERT POSITION('FORBIDDEN' IN SQLERRM) > 0, 'expected FORBIDDEN, got: ' || SQLERRM;
  END;

  -- ---------- Non-admin is blocked on delete ----------
  BEGIN
    PERFORM api.rpc_delete_object_external_id(v_id);
    RAISE EXCEPTION 'AUTHZ GUARD FAILED: non-admin deleted';
  EXCEPTION WHEN raise_exception THEN
    ASSERT POSITION('FORBIDDEN' IN SQLERRM) > 0, 'expected FORBIDDEN on delete, got: ' || SQLERRM;
  END;

  -- ---------- Admin deletes the row ----------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin_uid, 'role','authenticated')::text, true);
  PERFORM api.rpc_delete_object_external_id(v_id);
  SELECT count(*) INTO v_count FROM object_external_id WHERE id = v_id;
  ASSERT v_count = 0, 'admin delete removes the row';

  RAISE NOTICE 'object_external_id write RPC assertions passed.';
END$$;

ROLLBACK;
