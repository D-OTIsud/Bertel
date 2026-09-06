-- Autorisation réelle sous authenticated, avec octroi/retrait par le RPC du panneau Équipe.
-- Les fixtures et permissions de test sont intégralement annulées.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_admin uuid := '00000000-0000-4000-a000-00000000ee01';
  v_editor uuid := '00000000-0000-4000-a000-00000000ee02';
  v_viewer uuid := '00000000-0000-4000-a000-00000000ee03';
  v_other uuid := '00000000-0000-4000-a000-00000000ee04';
  v_org text := 'ORGRUN9999990811';
  v_other_org text := 'ORGRUN9999990812';
  v_permission uuid;
BEGIN
  SELECT id INTO STRICT v_permission FROM public.ref_permission
    WHERE code = 'manage_actor_portal_access' AND category = 'crm' AND is_active;
  ASSERT NOT has_function_privilege('anon', 'api.current_user_can_manage_actor_portal()', 'EXECUTE'),
    'Le prédicat ne doit pas être exposé anonymement';
  ASSERT has_function_privilege('authenticated', 'api.current_user_can_manage_actor_portal()', 'EXECUTE');

  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO public.object (id, object_type, name) VALUES
    (v_org, 'ORG', 'Portal permission test'), (v_other_org, 'ORG', 'Other permission test');
  INSERT INTO auth.users (id, email) VALUES
    (v_admin, 'portal-perm-admin@example.test'), (v_editor, 'portal-perm-editor@example.test'),
    (v_viewer, 'portal-perm-viewer@example.test'), (v_other, 'portal-perm-other@example.test');
  INSERT INTO public.app_user_profile (id, role) VALUES
    (v_admin, 'super_admin'), (v_editor, 'tourism_agent'),
    (v_viewer, 'tourism_agent'), (v_other, 'tourism_agent')
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;
  INSERT INTO public.user_org_membership (user_id, org_object_id, is_active) VALUES
    (v_editor, v_org, true), (v_viewer, v_org, true), (v_other, v_other_org, true);
  INSERT INTO public.user_org_business_role (membership_id, role_id, is_active)
    SELECT m.id, r.id, true FROM public.user_org_membership m
    JOIN public.ref_org_business_role r ON r.code = CASE WHEN m.user_id = v_viewer THEN 'viewer' ELSE 'editor' END
    WHERE m.user_id IN (v_editor, v_viewer, v_other);
  ASSERT NOT EXISTS (SELECT 1 FROM public.org_role_permission
    WHERE org_object_id IN (v_org, v_other_org) AND permission_id = v_permission AND is_active),
    'Aucun rôle ne doit recevoir la permission par défaut';

  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_editor,'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  ASSERT api.user_has_permission('write_crm_notes'), 'Fixture non vacu : éditeur avec droits CRM';
  ASSERT api.current_user_can_manage_actor_portal() IS FALSE, 'Les droits CRM ne suffisent pas';
  BEGIN
    PERFORM api.rpc_set_role_permission(v_org, 'editor', 'manage_actor_portal_access', true);
    RAISE EXCEPTION 'Un éditeur ne doit pas pouvoir s’accorder la permission';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'FORBIDDEN:%' THEN RAISE; END IF;
  END;

  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_admin,'role','authenticated')::text, true);
  ASSERT api.current_user_can_manage_actor_portal() IS TRUE, 'Super administrateur autorisé sans octroi';
  PERFORM api.rpc_set_role_permission(v_org, 'editor', 'manage_actor_portal_access', true);

  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_editor,'role','authenticated')::text, true);
  ASSERT api.current_user_can_manage_actor_portal() IS TRUE, 'La case Éditeur doit ouvrir le bloc';
  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_viewer,'role','authenticated')::text, true);
  ASSERT api.current_user_can_manage_actor_portal() IS FALSE, 'Le lecteur reste exclu';
  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_other,'role','authenticated')::text, true);
  ASSERT api.current_user_can_manage_actor_portal() IS FALSE, 'Les éditeurs des autres ORG restent exclus';

  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_admin,'role','authenticated')::text, true);
  PERFORM api.rpc_set_role_permission(v_org, 'editor', 'manage_actor_portal_access', false);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_editor,'role','authenticated')::text, true);
  ASSERT api.current_user_can_manage_actor_portal() IS FALSE, 'Décocher doit fermer le bloc';
  PERFORM set_config('request.jwt.claims', '{}', true);
  ASSERT api.current_user_can_manage_actor_portal() IS FALSE, 'Sans identité : refus explicite';
  RESET ROLE;
  RAISE NOTICE 'Portal access permission: default restriction, grant, isolation and revoke passed';
END $$;
ROLLBACK;
