-- test_sp2_permission_behavior.sql
-- SP-2 behavioral test: proves SP-1 canonical-write authorization + status guard + the
-- membership-based team-note rule, end-to-end, against a seeded multi-user fixture.
-- Self-contained + transactional: everything is ROLLBACK'd, nothing persists.
-- Run AFTER the full manifest INCLUDING migration_permission_write_paths.sql (SP-1).
-- Against a DB without SP-1, it fails fast (api.user_can_write_object_canonical missing) — that is the red state.
--
-- WATCH-POINTS (may need a tweak on first CI run; the assertions' intent is stable):
--   * auth.users minimal insert (only id is NOT NULL/no-default on this DB);
--   * app_user_profile.role value 'tourism_agent' must be a non-superuser role;
--   * plpgsql SET LOCAL ROLE + subtransaction exception mechanics;
--   * object id format if a CHECK constraint exists (explicit test ids used).
\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_org         text := 'ORGRUN9999999991';
  v_obj         text := 'HOTRUN9999999991';
  v_pub_role    uuid;
  v_view_uid    uuid := '00000000-0000-4000-a000-0000000000a1';
  v_contrib_uid uuid := '00000000-0000-4000-a000-0000000000a2';
  v_editor_uid  uuid := '00000000-0000-4000-a000-0000000000a3';
  v_m_view uuid; v_m_contrib uuid; v_m_editor uuid;
  v_note_view uuid;
  v_rc integer;
BEGIN
  -- ---------- Fixture (as postgres; RLS bypassed for setup) ----------
  SELECT id INTO v_pub_role FROM ref_org_role WHERE code = 'publisher';

  INSERT INTO object (id, object_type, name) VALUES
    (v_org, 'ORG', 'SP2 Test Org'),
    (v_obj, 'HOT', 'SP2 Test Hotel');
  INSERT INTO object_org_link (object_id, org_object_id, role_id) VALUES (v_obj, v_org, v_pub_role);

  -- auth.users has trigger `on_auth_user_created_app_user_profile` which AUTO-CREATES the
  -- app_user_profile row. So we insert the users (with unique emails), then UPSERT the profile
  -- role to a non-superuser value — ON CONFLICT absorbs the trigger-created rows (verified:
  -- is_platform_superuser() is only owner/super_admin/service_role, so 'tourism_agent' is non-super).
  INSERT INTO auth.users (id, email) VALUES
    (v_view_uid,    'sp2_viewer@test.local'),
    (v_contrib_uid, 'sp2_contributor@test.local'),
    (v_editor_uid,  'sp2_editor@test.local');
  INSERT INTO app_user_profile (id, role) VALUES
    (v_view_uid, 'tourism_agent'), (v_contrib_uid, 'tourism_agent'), (v_editor_uid, 'tourism_agent')
  ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;

  INSERT INTO user_org_membership (user_id, org_object_id, is_active) VALUES (v_view_uid,    v_org, TRUE) RETURNING id INTO v_m_view;
  INSERT INTO user_org_membership (user_id, org_object_id, is_active) VALUES (v_contrib_uid, v_org, TRUE) RETURNING id INTO v_m_contrib;
  INSERT INTO user_org_membership (user_id, org_object_id, is_active) VALUES (v_editor_uid,  v_org, TRUE) RETURNING id INTO v_m_editor;

  INSERT INTO user_org_business_role (membership_id, role_id, is_active)
    SELECT v_m_view,    id, TRUE FROM ref_org_business_role WHERE code = 'viewer';
  INSERT INTO user_org_business_role (membership_id, role_id, is_active)
    SELECT v_m_contrib, id, TRUE FROM ref_org_business_role WHERE code = 'contributor';
  INSERT INTO user_org_business_role (membership_id, role_id, is_active)
    SELECT v_m_editor,  id, TRUE FROM ref_org_business_role WHERE code = 'editor';

  -- editor also holds an org_admin admin role (to edit/archive ANY team note)
  INSERT INTO user_org_admin_role (membership_id, role_id, is_active)
    SELECT v_m_editor, id, TRUE FROM ref_org_admin_role WHERE code = 'org_admin';

  -- per-convention user_permission grants (direct insert; bypasses the anti-self RPC checks)
  INSERT INTO user_permission (user_id, permission_id, is_active, granted_by, granted_at, created_at, updated_at)
    SELECT v_contrib_uid, id, TRUE, v_editor_uid, NOW(), NOW(), NOW()
    FROM ref_permission WHERE code IN
      ('create_object','edit_canonical_when_publisher','edit_org_enrichment','edit_hours','edit_pricing','edit_gallery','attach_documents');
  INSERT INTO user_permission (user_id, permission_id, is_active, granted_by, granted_at, created_at, updated_at)
    SELECT v_editor_uid, id, TRUE, v_editor_uid, NOW(), NOW(), NOW()
    FROM ref_permission WHERE code IN
      ('create_object','edit_canonical_when_publisher','edit_org_enrichment','edit_hours','edit_pricing','edit_gallery','attach_documents','publish_object','validate_changes','manage_team_messages');

  -- a note authored by the viewer (set up as postgres so we can test edit-by-others)
  INSERT INTO object_private_description (object_id, org_object_id, created_by_user_id, audience, body)
    VALUES (v_obj, v_org, v_view_uid, 'private', 'viewer note') RETURNING id INTO v_note_view;

  -- ---------- Assertions: authorization helpers (SECURITY DEFINER read auth.uid() from the GUC) ----------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_view_uid,    'role','authenticated')::text, true);
  ASSERT api.user_can_write_object_canonical(v_obj) = FALSE, 'viewer must NOT write canonical';

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_contrib_uid, 'role','authenticated')::text, true);
  ASSERT api.user_can_write_object_canonical(v_obj) = TRUE,  'contributor MUST write canonical';
  ASSERT api.user_can_publish_object(v_obj)        = FALSE,  'contributor must NOT publish';

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_editor_uid,  'role','authenticated')::text, true);
  ASSERT api.user_can_write_object_canonical(v_obj) = TRUE,  'editor MUST write canonical';
  ASSERT api.user_can_publish_object(v_obj)        = TRUE,   'editor MUST publish';

  -- ---------- Status guard: contributor (canonical, no publish) cannot change status ----------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_contrib_uid, 'role','authenticated')::text, true);
  BEGIN
    SET LOCAL ROLE authenticated;
    UPDATE object SET status = 'published' WHERE id = v_obj;
    RAISE EXCEPTION 'STATUS GUARD FAILED: contributor changed status without publish_object';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;  -- expected: SQLSTATE 42501 from trg_guard_object_status_change
  END;
  RESET ROLE;

  -- editor CAN publish (has publish_object): RLS allows + guard passes
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_editor_uid, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  UPDATE object SET status = 'published' WHERE id = v_obj;
  GET DIAGNOSTICS v_rc = ROW_COUNT;
  RESET ROLE;
  ASSERT v_rc = 1, 'editor MUST be able to publish (1 row)';

  -- ---------- Team notes: membership create, edit-own, admin-edit-any ----------
  -- viewer creates a note (membership) and edits OWN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_view_uid, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO object_private_description (object_id, org_object_id, created_by_user_id, audience, body)
    VALUES (v_obj, v_org, v_view_uid, 'private', 'viewer second note');
  UPDATE object_private_description SET body = 'viewer edited own' WHERE id = v_note_view;
  GET DIAGNOSTICS v_rc = ROW_COUNT;
  RESET ROLE;
  ASSERT v_rc = 1, 'viewer MUST edit own note';

  -- contributor cannot edit the viewer's note (not author, not admin) -> RLS denies (0 rows)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_contrib_uid, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  UPDATE object_private_description SET body = 'contrib tries' WHERE id = v_note_view;
  GET DIAGNOSTICS v_rc = ROW_COUNT;
  RESET ROLE;
  ASSERT v_rc = 0, 'contributor must NOT edit another members note';

  -- editor (org_admin) edits ANY note
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_editor_uid, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  UPDATE object_private_description SET body = 'admin edited' WHERE id = v_note_view;
  GET DIAGNOSTICS v_rc = ROW_COUNT;
  RESET ROLE;
  ASSERT v_rc = 1, 'org_admin editor MUST edit any note';

  RAISE NOTICE 'SP-2 behavioral assertions passed.';
END$$;

ROLLBACK;
