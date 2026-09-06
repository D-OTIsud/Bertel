\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_guest uuid := '00000000-0000-4000-a000-00000000dc01';
  v_staff uuid := '00000000-0000-4000-a000-00000000dc02';
  v_prod text := 'HOTRUN9999990821';
  v_org text := 'ORGRUN9999990821';
BEGIN
  ASSERT NOT has_function_privilege('anon', 'api.configure_sandbox_discovery_user(uuid)', 'EXECUTE');
  ASSERT NOT has_function_privilege('authenticated', 'api.configure_sandbox_discovery_user(uuid)', 'EXECUTE');
  ASSERT NOT has_function_privilege('authenticated', 'api.get_sandbox_discovery_user()', 'EXECUTE');
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  -- Fixture indépendante d’une éventuelle identité de découverte déjà en service.
  DELETE FROM internal.sandbox_discovery_identity;
  INSERT INTO auth.users (id, email, raw_app_meta_data) VALUES
    (v_guest, 'discovery-fixture@sandbox.bertel.invalid', '{"sandbox_discovery":true}'),
    (v_staff, 'ordinary-fixture@example.test', '{}');
  BEGIN
    PERFORM api.configure_sandbox_discovery_user(v_staff);
    RAISE EXCEPTION 'Un compte ordinaire ne doit jamais être converti';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'INVALID_DISCOVERY_USER' THEN RAISE; END IF;
  END;
  ASSERT api.configure_sandbox_discovery_user(v_guest) = v_guest;
  ASSERT api.configure_sandbox_discovery_user(v_guest) = v_guest, 'Préparation idempotente';
  ASSERT api.get_sandbox_discovery_user() = v_guest;
  ASSERT (SELECT count(*) FROM user_org_membership WHERE user_id=v_guest) = 1;
  INSERT INTO public.object (id, object_type, name, status) VALUES
    (v_org, 'ORG', 'Private production org', 'published'), (v_prod, 'HOT', 'Real production hotel', 'published');
  INSERT INTO public.object_org_link (object_id, org_object_id, role_id, is_primary)
    SELECT v_prod, v_org, id, true FROM public.ref_org_role WHERE code='publisher';

  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_guest,'role','authenticated','app_metadata',json_build_object('sandbox_discovery',true))::text, true);
  SET LOCAL ROLE authenticated;
  ASSERT api.current_user_test_realm() IS TRUE;
  ASSERT api.is_platform_superuser() IS FALSE;
  ASSERT api.current_user_admin_rank() IS NULL;
  ASSERT api.current_user_can_manage_actor_portal() IS FALSE;
  ASSERT api.user_has_permission('write_crm_notes') IS FALSE;
  ASSERT NOT EXISTS (SELECT 1 FROM public.object WHERE id=v_prod), 'Aucune lecture production';
  ASSERT api.user_can_write_object_canonical(v_prod) IS FALSE, 'Aucune écriture production';
  ASSERT api.user_can_read_crm(v_prod) IS FALSE, 'Aucun CRM production';
  ASSERT EXISTS (SELECT 1 FROM public.object WHERE id='HOTTST0000000001'), 'Le corpus de test est visible';
  ASSERT api.user_can_write_object_canonical('HOTTST0000000001') IS TRUE, 'Les fiches fictives sont modifiables';
  BEGIN
    PERFORM api.rpc_reset_test_data();
    RAISE EXCEPTION 'Le visiteur ne doit pas pouvoir effacer le corpus partagé';
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN
    IF SQLERRM NOT LIKE '%FORBIDDEN%' AND SQLERRM NOT LIKE '%super%' THEN RAISE; END IF;
  END;
  RESET ROLE;

  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  UPDATE public.user_org_membership SET is_active=false WHERE user_id=v_guest;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_guest,'role','authenticated','app_metadata',json_build_object('sandbox_discovery',true))::text, true);
  SET LOCAL ROLE authenticated;
  ASSERT api.current_user_test_realm() IS TRUE, 'Révocation ne signifie jamais retour en production';
  ASSERT NOT EXISTS (SELECT 1 FROM public.object WHERE id=v_prod);
  ASSERT api.user_can_write_object_canonical('HOTTST0000000001') IS FALSE;
  -- Un marqueur modifiable par l’utilisateur ne doit pas choisir le realm.
  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_staff,'role','authenticated','user_metadata',json_build_object('sandbox_discovery',true))::text, true);
  ASSERT api.current_user_test_realm() IS FALSE;
  RESET ROLE;
  RAISE NOTICE 'Public sandbox: server-only provisioning, isolated read/write, no admin/CRM/portal rights, revocation safe';
END $$;
ROLLBACK;
