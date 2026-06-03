-- test_object_status_lifecycle.sql
-- Behavioral test for api.rpc_set_object_status + the rpc_publish_object wrapper.
-- Self-contained + transactional (ROLLBACK at end). Run AFTER the full manifest
-- INCLUDING migration_object_status_lifecycle.sql.
\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_org        text := 'ORGRUN9999999992';
  v_obj        text := 'HOTRUN9999999992';
  v_pub_role   uuid;
  v_contrib_uid uuid := '00000000-0000-4000-a000-0000000000b1';  -- canonical, NO publish
  v_editor_uid  uuid := '00000000-0000-4000-a000-0000000000b2';  -- has publish_object
  v_m_contrib uuid; v_m_editor uuid;
  v_result text;
  v_status object_status;
BEGIN
  -- ---------- Fixture (as postgres; RLS bypassed for setup) ----------
  SELECT id INTO v_pub_role FROM ref_org_role WHERE code = 'publisher';
  INSERT INTO object (id, object_type, name, status) VALUES
    (v_org, 'ORG', 'Lifecycle Test Org', 'published'),
    (v_obj, 'HOT', 'Lifecycle Test Hotel', 'draft');
  INSERT INTO object_org_link (object_id, org_object_id, role_id) VALUES (v_obj, v_org, v_pub_role);

  INSERT INTO auth.users (id, email) VALUES
    (v_contrib_uid, 'lifecycle_contrib@test.local'),
    (v_editor_uid,  'lifecycle_editor@test.local');
  INSERT INTO app_user_profile (id, role) VALUES
    (v_contrib_uid, 'tourism_agent'), (v_editor_uid, 'tourism_agent')
  ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;

  INSERT INTO user_org_membership (user_id, org_object_id, is_active) VALUES (v_contrib_uid, v_org, TRUE) RETURNING id INTO v_m_contrib;
  INSERT INTO user_org_membership (user_id, org_object_id, is_active) VALUES (v_editor_uid,  v_org, TRUE) RETURNING id INTO v_m_editor;
  INSERT INTO user_org_business_role (membership_id, role_id, is_active)
    SELECT v_m_contrib, id, TRUE FROM ref_org_business_role WHERE code = 'contributor';
  INSERT INTO user_org_business_role (membership_id, role_id, is_active)
    SELECT v_m_editor,  id, TRUE FROM ref_org_business_role WHERE code = 'editor';

  INSERT INTO user_permission (user_id, permission_id, is_active, granted_by, granted_at, created_at, updated_at)
    SELECT v_contrib_uid, id, TRUE, v_editor_uid, NOW(), NOW(), NOW()
    FROM ref_permission WHERE code = 'edit_canonical_when_publisher';
  INSERT INTO user_permission (user_id, permission_id, is_active, granted_by, granted_at, created_at, updated_at)
    SELECT v_editor_uid, id, TRUE, v_editor_uid, NOW(), NOW(), NOW()
    FROM ref_permission WHERE code IN ('edit_canonical_when_publisher','publish_object');

  -- ---------- Editor (publish_object) drives the full state machine ----------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_editor_uid, 'role','authenticated')::text, true);

  v_result := api.rpc_set_object_status(v_obj, 'published');  ASSERT v_result = 'published', 'draft->published';
  v_result := api.rpc_set_object_status(v_obj, 'hidden');     ASSERT v_result = 'hidden',    'published->hidden';
  v_result := api.rpc_set_object_status(v_obj, 'published');  ASSERT v_result = 'published', 'hidden->published';
  v_result := api.rpc_set_object_status(v_obj, 'archived');   ASSERT v_result = 'archived',  'published->archived';
  -- restore: object was published (published_at set) -> archived restores to 'hidden'
  v_result := api.rpc_set_object_status(v_obj, 'hidden');     ASSERT v_result = 'hidden',    'archived->hidden (ever-published)';
  SELECT status INTO v_status FROM object WHERE id = v_obj;   ASSERT v_status = 'hidden',    'row reflects hidden';

  -- wrapper still works
  PERFORM api.rpc_publish_object(v_obj, TRUE);
  SELECT status INTO v_status FROM object WHERE id = v_obj;   ASSERT v_status = 'published', 'rpc_publish_object(true) wrapper';

  -- invalid transition: published -> draft is rejected
  BEGIN
    v_result := api.rpc_set_object_status(v_obj, 'draft');
    RAISE EXCEPTION 'TRANSITION GUARD FAILED: published->draft allowed';
  EXCEPTION WHEN raise_exception THEN
    ASSERT POSITION('INVALID_TRANSITION' IN SQLERRM) > 0, 'expected INVALID_TRANSITION, got: ' || SQLERRM;
  END;

  -- ---------- Contributor (canonical, NO publish) is blocked on status ----------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_contrib_uid, 'role','authenticated')::text, true);
  BEGIN
    v_result := api.rpc_set_object_status(v_obj, 'archived');
    RAISE EXCEPTION 'AUTHZ GUARD FAILED: contributor changed status without publish_object';
  EXCEPTION WHEN raise_exception THEN
    ASSERT POSITION('FORBIDDEN' IN SQLERRM) > 0, 'expected FORBIDDEN, got: ' || SQLERRM;
  END;

  RAISE NOTICE 'Object status lifecycle assertions passed.';
END$$;

ROLLBACK;
