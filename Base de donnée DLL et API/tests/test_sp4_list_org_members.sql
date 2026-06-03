-- test_sp4_list_org_members.sql — SP-4 roster RPC. Run AFTER the full manifest (+ this migration + seeds).
-- Self-contained + transactional. Asserts: function exists; an org-admin sees their org's members with
-- email; a non-admin/other-ORG user is rejected (42501).
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_org   text := 'ORGRUN9999999951';
  v_admin uuid := '00000000-0000-4000-a000-0000000000c1';
  v_member uuid := '00000000-0000-4000-a000-0000000000c2';
  v_outsider uuid := '00000000-0000-4000-a000-0000000000c3';
  v_pub_role uuid; v_admin_role uuid;
  v_m_admin uuid; v_m_member uuid;
  v_rc integer;
BEGIN
  SELECT id INTO v_pub_role   FROM ref_org_business_role WHERE code='editor';
  SELECT id INTO v_admin_role FROM ref_org_admin_role    WHERE code='org_admin';

  INSERT INTO object (id, object_type, name, status) VALUES (v_org, 'ORG', 'SP4 Org', 'published');
  INSERT INTO auth.users (id, email) VALUES
    (v_admin, 'sp4_admin@test.local'), (v_member, 'sp4_member@test.local'), (v_outsider, 'sp4_out@test.local');
  INSERT INTO app_user_profile (id, role, display_name) VALUES
    (v_admin,'tourism_agent','SP4 Admin'), (v_member,'tourism_agent','SP4 Member'), (v_outsider,'tourism_agent','SP4 Out')
    ON CONFLICT (id) DO UPDATE SET role=EXCLUDED.role, display_name=EXCLUDED.display_name;

  INSERT INTO user_org_membership (user_id, org_object_id, is_active) VALUES (v_admin, v_org, TRUE) RETURNING id INTO v_m_admin;
  INSERT INTO user_org_membership (user_id, org_object_id, is_active) VALUES (v_member, v_org, TRUE) RETURNING id INTO v_m_member;
  INSERT INTO user_org_business_role (membership_id, role_id, is_active) VALUES (v_m_admin, v_pub_role, TRUE), (v_m_member, v_pub_role, TRUE);
  INSERT INTO user_org_admin_role (membership_id, role_id, is_active) VALUES (v_m_admin, v_admin_role, TRUE);

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    SELECT count(*) INTO v_rc FROM api.rpc_list_org_members(v_org);
    ASSERT v_rc = 2, 'admin must see 2 members';
    ASSERT (SELECT bool_and(email IS NOT NULL) FROM api.rpc_list_org_members(v_org)), 'roster must include emails';
  RESET ROLE;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_outsider, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    BEGIN
      PERFORM count(*) FROM api.rpc_list_org_members(v_org);
      RAISE EXCEPTION 'SP4 GUARD FAILED: outsider listed members';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  RESET ROLE;

  RAISE NOTICE 'SP-4 rpc_list_org_members test passed.';
END$$;
ROLLBACK;
