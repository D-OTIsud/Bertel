-- Run after the full manifest. The real status/version triggers fire; all
-- synthetic fixtures and history are rolled back. No production calls needed.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout = '90s';
SET LOCAL lock_timeout = '5s';
SET LOCAL plpgsql.check_asserts = on;

CREATE FUNCTION pg_temp.assert_lifecycle_error(p_statement text, p_expected text)
RETURNS void LANGUAGE plpgsql AS $assert_error$
DECLARE v_raised boolean := false;
BEGIN
  BEGIN
    EXECUTE p_statement;
  EXCEPTION WHEN OTHERS THEN
    v_raised := true;
    ASSERT position(p_expected IN SQLERRM) > 0,
      format('Expected %s, got %s', p_expected, SQLERRM);
  END;
  ASSERT v_raised, format('Expected %s for %s', p_expected, p_statement);
END;
$assert_error$;

DO $lifecycle_test$
DECLARE
  v_org text := 'ORGRUN999999LR01';
  v_obj text := 'HOTRUN999999LR01';
  v_other text := 'HOTRUN999999LR02';
  v_editor uuid := '00000000-0000-4000-a000-00000000fb01';
  v_reader uuid := '00000000-0000-4000-a000-00000000fb02';
  v_membership uuid;
  v_publisher_role uuid;
  v_business_role uuid;
  v_archive_version integer;
  v_current_version integer;
  v_count integer;
  v_reason text;
  v_name text;
  v_fields text[];
  v_claims text;
  v_signature text := 'api.rpc_set_object_status(text,text,text)';
BEGIN
  ASSERT NOT has_function_privilege('anon', v_signature, 'EXECUTE');
  ASSERT has_function_privilege('authenticated', v_signature, 'EXECUTE');
  ASSERT has_function_privilege('service_role', v_signature, 'EXECUTE');
  ASSERT NOT has_function_privilege('anon', 'api.rpc_set_object_status(text,text)', 'EXECUTE');
  ASSERT (SELECT pronargdefaults = 0 FROM pg_proc WHERE oid = v_signature::regprocedure),
    'Default third argument would make old PostgREST calls ambiguous';
  ASSERT (SELECT prosecdef AND proconfig @> ARRAY['search_path=pg_catalog, public, api, auth, pg_temp']
    FROM pg_proc WHERE oid = v_signature::regprocedure), 'Bounded definer search_path is required';

  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SELECT id INTO STRICT v_publisher_role FROM public.ref_org_role WHERE code = 'publisher';
  SELECT id INTO STRICT v_business_role FROM public.ref_org_business_role WHERE code = 'editor';
  INSERT INTO auth.users(id, email) VALUES
    (v_editor, 'lifecycle-reason-editor@example.invalid'),
    (v_reader, 'lifecycle-reason-reader@example.invalid');
  INSERT INTO public.app_user_profile(id, role, display_name) VALUES
    (v_editor, 'tourism_agent', 'Marie Exemple'),
    (v_reader, 'tourism_agent', 'Jean Lecteur')
  ON CONFLICT(id) DO UPDATE SET role = EXCLUDED.role, display_name = EXCLUDED.display_name;
  INSERT INTO public.object(id, object_type, name, status) VALUES
    (v_org, 'ORG', 'Synthetic lifecycle reason organisation', 'published'),
    (v_obj, 'HOT', 'Synthetic lifecycle reason object', 'draft'),
    (v_other, 'HOT', 'Synthetic lifecycle reason other object', 'draft');
  INSERT INTO public.org_config(org_object_id, access_scope, is_test_org)
    VALUES(v_org, 'own_objects_only', false);
  INSERT INTO public.object_org_link(object_id, org_object_id, role_id, is_primary)
    VALUES(v_obj, v_org, v_publisher_role, true), (v_other, v_org, v_publisher_role, true);
  INSERT INTO public.user_org_membership(user_id, org_object_id, is_active)
    VALUES(v_editor, v_org, true) RETURNING id INTO v_membership;
  INSERT INTO public.user_org_business_role(membership_id, role_id, is_active)
    VALUES(v_membership, v_business_role, true);
  INSERT INTO public.org_role_permission(org_object_id, role_id, permission_id, is_active, granted_by)
    SELECT v_org, v_business_role, p.id, true, v_editor
    FROM public.ref_permission p WHERE p.code IN ('publish_object', 'edit_canonical_when_publisher')
    ON CONFLICT ON CONSTRAINT org_role_permission_uniq DO UPDATE SET is_active = true;
  v_claims := json_build_object('sub', v_editor, 'role', 'authenticated')::text;
  PERFORM set_config('request.jwt.claims', v_claims, true);

  SET LOCAL ROLE authenticated;
  -- A legacy archive and a whitespace-only new request both fail atomically.
  PERFORM pg_temp.assert_lifecycle_error(
    format('SELECT api.rpc_set_object_status(%L, ''archived'')', v_obj), 'REASON_REQUIRED');
  PERFORM pg_temp.assert_lifecycle_error(
    format('SELECT api.rpc_set_object_status(%L, ''archived'', %L)', v_obj, E' \t\n\r '), 'REASON_REQUIRED');
  PERFORM pg_temp.assert_lifecycle_error(
    format('SELECT api.rpc_set_object_status(%L, ''hidden'', ''Reason'')', v_obj), 'INVALID_TRANSITION');
  RESET ROLE;
  ASSERT (SELECT status = 'draft' FROM public.object WHERE id = v_obj);
  ASSERT NOT EXISTS(SELECT 1 FROM public.object_version WHERE object_id = v_obj AND change_reason IS NOT NULL);

  SET LOCAL ROLE authenticated;
  ASSERT api.rpc_set_object_status(v_obj, 'archived', E'  Fermeture temporaire.\nRéouverture prévue en janvier.  ') = 'archived';
  RESET ROLE;
  SELECT current_version INTO v_archive_version FROM public.object WHERE id = v_obj;
  SELECT change_reason INTO v_reason FROM public.object_version
    WHERE object_id = v_obj AND version_number = v_archive_version;
  ASSERT v_reason = E'Fermeture temporaire.\nRéouverture prévue en janvier.', 'Multiline justification was lost';
  ASSERT (SELECT created_by = v_editor AND data->>'status' = 'archived' FROM public.object_version
    WHERE object_id = v_obj AND version_number = v_archive_version), 'Wrong action author or status';

  SET LOCAL ROLE authenticated;
  SELECT created_by_name, change_reason, changed_fields INTO v_name, v_reason, v_fields
    FROM api.get_object_versions(v_obj, 50, 0) WHERE version_number = v_archive_version;
  ASSERT v_name = 'Marie Exemple' AND v_reason LIKE 'Fermeture temporaire.%' AND 'status' = ANY(v_fields),
    'Existing reader must expose action author and justification to the authorised account';
  -- Retries cannot rewrite the comment or append a second archive event.
  ASSERT api.rpc_set_object_status(v_obj, 'archived', 'Replacement text') = 'archived';
  ASSERT api.rpc_set_object_status(v_obj, 'archived') = 'archived';
  RESET ROLE;
  ASSERT (SELECT current_version = v_archive_version FROM public.object WHERE id = v_obj);
  ASSERT (SELECT change_reason = E'Fermeture temporaire.\nRéouverture prévue en janvier.'
    FROM public.object_version WHERE object_id = v_obj AND version_number = v_archive_version);

  -- A later edit and another object's version must not inherit the justification.
  SET LOCAL ROLE authenticated;
  UPDATE public.object SET name = name || ' edited', updated_by = v_editor WHERE id = v_obj;
  UPDATE public.object SET name = name || ' edited', updated_by = v_editor WHERE id = v_other;
  RESET ROLE;
  ASSERT NOT EXISTS(SELECT 1 FROM public.object_version WHERE object_id IN (v_obj, v_other)
    AND (object_id <> v_obj OR version_number <> v_archive_version) AND change_reason IS NOT NULL);

  SET LOCAL ROLE authenticated;
  -- Never-published restore is draft; first publication remains legacy-compatible.
  ASSERT api.rpc_set_object_status(v_obj, 'draft') = 'draft';
  PERFORM api.rpc_publish_object(v_obj, true);
  PERFORM pg_temp.assert_lifecycle_error(
    format('SELECT api.rpc_publish_object(%L, false)', v_obj), 'REASON_REQUIRED');
  ASSERT api.rpc_set_object_status(v_obj, 'hidden', 'Données à corriger avant remise en ligne.') = 'hidden';
  RESET ROLE;
  SELECT current_version INTO v_current_version FROM public.object WHERE id = v_obj;
  ASSERT (SELECT change_reason = 'Données à corriger avant remise en ligne.' AND created_by = v_editor
    FROM public.object_version WHERE object_id = v_obj AND version_number = v_current_version);

  SET LOCAL ROLE authenticated;
  -- Multiple archive/restore episodes preserve each independent explanation.
  ASSERT api.rpc_set_object_status(v_obj, 'archived', 'Nouvelle fermeture.') = 'archived';
  ASSERT api.rpc_set_object_status(v_obj, 'hidden') = 'hidden';
  RESET ROLE;
  SELECT current_version INTO v_current_version FROM public.object WHERE id = v_obj;
  ASSERT (SELECT change_reason IS NULL FROM public.object_version
    WHERE object_id = v_obj AND version_number = v_current_version), 'Restore was mislabelled as a depublication';
  SELECT count(*) INTO v_count FROM public.object_version WHERE object_id = v_obj AND change_reason IS NOT NULL;
  ASSERT v_count = 3, 'Each destructive action needs its own preserved comment';

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_reader, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.assert_lifecycle_error(
    format('SELECT api.rpc_set_object_status(%L, ''archived'', ''Unauthorised'')', v_obj), 'FORBIDDEN');
  PERFORM set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  PERFORM pg_temp.assert_lifecycle_error(
    format('SELECT api.rpc_set_object_status(%L, ''archived'', ''No session'')', v_obj), 'NO_AUTH_CONTEXT');
  RESET ROLE;
  SET LOCAL ROLE anon;
  PERFORM pg_temp.assert_lifecycle_error(
    format('SELECT api.rpc_set_object_status(%L, ''archived'', ''Anonymous'')', v_obj), 'permission denied');
  RESET ROLE;
  ASSERT (SELECT status = 'hidden' FROM public.object WHERE id = v_obj), 'Rejected request changed the object';
  RAISE NOTICE 'Lifecycle reason assertions passed (required input, atomic history, author, retries, restore, permissions).';
END;
$lifecycle_test$;

ROLLBACK;
