-- Section A authorization contract: dedicated legal permission, document attach gate,
-- explicit object_legal RLS and protection against profile-role self elevation.
\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_org TEXT := 'ORGRUN00000000A1';
  v_other_org TEXT := 'ORGRUN00000000A2';
  v_object TEXT := 'HOTRUN00000000A1';
  v_pub_role UUID;
  v_legal_type UUID;
  v_legal_user UUID := '00000000-0000-4000-a000-00000000a101';
  v_editor_user UUID := '00000000-0000-4000-a000-00000000a102';
  v_outside_user UUID := '00000000-0000-4000-a000-00000000a103';
  v_no_membership_user UUID := '00000000-0000-4000-a000-00000000a104';
  v_membership UUID;
  v_record UUID;
  v_document UUID := '00000000-0000-4000-a000-00000000a199';
  v_count INTEGER;
BEGIN
  SELECT id INTO v_pub_role FROM ref_org_role WHERE code = 'publisher';
  SELECT id INTO v_legal_type FROM ref_legal_type WHERE code = 'siret';
  ASSERT v_pub_role IS NOT NULL, 'publisher role seed missing';
  ASSERT v_legal_type IS NOT NULL, 'siret legal type seed missing';

  INSERT INTO object (id, object_type, name) VALUES
    (v_org, 'ORG', 'Legal test org'),
    (v_other_org, 'ORG', 'Other legal test org'),
    (v_object, 'HOT', 'Legal permission test object');
  INSERT INTO object_org_link (object_id, org_object_id, role_id)
    VALUES (v_object, v_org, v_pub_role);

  INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
    (v_legal_user, 'legal-a@test.local', '{"role":"admin"}'::jsonb),
    (v_editor_user, 'legal-b@test.local', '{}'::jsonb),
    (v_outside_user, 'legal-c@test.local', '{}'::jsonb),
    (v_no_membership_user, 'legal-d@test.local', '{}'::jsonb);
  ASSERT (
    SELECT COUNT(*) = 4
    FROM app_user_profile
    WHERE id IN (v_legal_user, v_editor_user, v_outside_user, v_no_membership_user)
      AND role = 'tourism_agent'
  ), 'new auth users must receive tourism_agent and ignore raw_user_meta_data.role';
  INSERT INTO app_user_profile (id, role) VALUES
    (v_legal_user, 'tourism_agent'),
    (v_editor_user, 'tourism_agent'),
    (v_outside_user, 'tourism_agent'),
    (v_no_membership_user, 'tourism_agent')
  ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;

  INSERT INTO user_org_membership (user_id, org_object_id, is_active)
    VALUES (v_legal_user, v_org, TRUE) RETURNING id INTO v_membership;
  INSERT INTO user_org_business_role (membership_id, role_id, is_active)
    SELECT v_membership, id, TRUE FROM ref_org_business_role WHERE code = 'editor';
  INSERT INTO user_org_membership (user_id, org_object_id, is_active)
    VALUES (v_editor_user, v_org, TRUE) RETURNING id INTO v_membership;
  INSERT INTO user_org_business_role (membership_id, role_id, is_active)
    SELECT v_membership, id, TRUE FROM ref_org_business_role WHERE code = 'editor';
  INSERT INTO user_org_membership (user_id, org_object_id, is_active)
    VALUES (v_outside_user, v_other_org, TRUE) RETURNING id INTO v_membership;
  INSERT INTO user_org_business_role (membership_id, role_id, is_active)
    SELECT v_membership, id, TRUE FROM ref_org_business_role WHERE code = 'editor';

  INSERT INTO user_permission (user_id, permission_id, is_active, granted_by, granted_at, created_at, updated_at)
    SELECT target.user_id, permission.id, TRUE, v_legal_user, NOW(), NOW(), NOW()
    FROM (VALUES (v_legal_user), (v_outside_user), (v_no_membership_user)) AS target(user_id)
    CROSS JOIN LATERAL (
      SELECT id FROM ref_permission WHERE code = 'manage_legal_compliance'
    ) permission;

  ASSERT (SELECT role FROM app_user_profile WHERE id = v_legal_user) = 'tourism_agent',
    'raw_user_meta_data.role must not elevate the profile';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_legal_user, 'role', 'authenticated')::text, true);
  BEGIN
    SET LOCAL ROLE authenticated;
    UPDATE app_user_profile SET role = 'super_admin' WHERE id = v_legal_user;
    RAISE EXCEPTION 'ROLE GUARD FAILED: user self-elevated to super_admin';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;

  ASSERT api.user_can_manage_object_legal(v_object) = TRUE,
    'publisher member with legal permission must manage legal data';
  ASSERT api.user_can_write_canonical(v_object) = FALSE,
    'legal permission must not imply canonical editing';
  ASSERT api.user_can_attach_object_document(v_object) = FALSE,
    'legal permission must not imply general document attachment';

  INSERT INTO user_permission (user_id, permission_id, is_active, granted_by, granted_at, created_at, updated_at)
    SELECT v_legal_user, id, TRUE, v_legal_user, NOW(), NOW(), NOW()
    FROM ref_permission WHERE code = 'attach_documents';
  ASSERT api.user_can_attach_object_document(v_object) = TRUE,
    'publisher member with attach_documents must pass the general document gate';

  INSERT INTO ref_document (id, url, title, storage_bucket, storage_path, access_scope)
  VALUES (
    v_document,
    'private:00000000-0000-4000-a000-00000000a199',
    'Private legal test document',
    'legal-documents',
    v_object || '/test.pdf',
    'legal_private'
  );

  SET LOCAL ROLE authenticated;
  INSERT INTO object_legal (object_id, type_id, value, validity_mode, document_id)
    VALUES (v_object, v_legal_type, '{"value":"12345678901234"}'::jsonb, 'forever', v_document)
    RETURNING id INTO v_record;
  SELECT COUNT(*) INTO v_count FROM ref_document WHERE id = v_document;
  ASSERT v_count = 1, 'legal editor must read private document metadata';
  UPDATE object_legal SET note = 'updated by legal editor' WHERE id = v_record;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RESET ROLE;
  ASSERT v_count = 1, 'legal editor must update one visible row';

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_editor_user, 'role', 'authenticated')::text, true);
  ASSERT api.user_can_manage_object_legal(v_object) = FALSE,
    'editor role alone must not grant legal management';
  SET LOCAL ROLE authenticated;
  SELECT COUNT(*) INTO v_count FROM ref_document WHERE id = v_document;
  ASSERT v_count = 0, 'editor without legal permission must not read private document metadata';
  UPDATE object_legal SET note = 'must not write' WHERE id = v_record;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RESET ROLE;
  ASSERT v_count = 0, 'editor without legal permission must not update legal data';

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_outside_user, 'role', 'authenticated')::text, true);
  ASSERT api.user_can_manage_object_legal(v_object) = FALSE,
    'legal permission in another org must not cross object scope';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_no_membership_user, 'role', 'authenticated')::text, true);
  ASSERT api.user_can_manage_object_legal(v_object) = FALSE,
    'legal permission without membership must fail';

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_legal_user, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  DELETE FROM object_legal WHERE id = v_record;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RESET ROLE;
  ASSERT v_count = 1, 'legal editor must delete one visible row';

  UPDATE user_permission
  SET is_active = FALSE, updated_at = NOW()
  WHERE user_id = v_legal_user
    AND permission_id = (SELECT id FROM ref_permission WHERE code = 'manage_legal_compliance');
  ASSERT api.user_can_manage_object_legal(v_object) = FALSE,
    'revocation must take effect immediately';

  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  ASSERT api.user_can_manage_object_legal(v_object) = FALSE, 'anonymous legal helper must fail';
  ASSERT api.user_can_attach_object_document(v_object) = FALSE, 'anonymous document helper must fail';
  SET LOCAL ROLE anon;
  SELECT COUNT(*) INTO v_count FROM ref_document WHERE id = v_document;
  RESET ROLE;
  ASSERT v_count = 0, 'anonymous users must not read private document metadata';

  RAISE NOTICE 'Section A legal authorization assertions passed.';
END
$$;

ROLLBACK;
