-- Synthetic SP4 authorization matrix. All membership writes roll back.
BEGIN;
DO $test$
DECLARE
  v_org text := 'ORGRUN9999999961';
  v_other_org text := 'ORGRUN9999999962';
  v_manager uuid := '00000000-0000-4000-a000-00000000af01';
  v_owner uuid := '00000000-0000-4000-a000-00000000af02';
  v_super uuid := '00000000-0000-4000-a000-00000000af03';
  v_new uuid := '00000000-0000-4000-a000-00000000af04';
  v_legacy uuid := '00000000-0000-4000-a000-00000000af05';
  v_missing uuid := '00000000-0000-4000-a000-00000000af06';
  v_foreign uuid := '00000000-0000-4000-a000-00000000af07';
  v_target uuid;
  v_manager_membership uuid;
  v_super_membership uuid;
  v_legacy_membership uuid;
  v_added_owner uuid;
  v_added_new uuid;
  v_added_missing uuid;
  v_denied boolean;
  v_receipt jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  INSERT INTO public.object(id,object_type,name,status)
    VALUES (v_org,'ORG','SP4 scope fixture','published'),(v_other_org,'ORG','SP4 other fixture','published');
  INSERT INTO auth.users(id,email,raw_user_meta_data)
    SELECT id, id::text||'@example.invalid',
      CASE WHEN id=v_new THEN '{"role":"owner"}'::jsonb ELSE '{"role":"tourism_agent"}'::jsonb END
    FROM unnest(ARRAY[v_manager,v_owner,v_super,v_new,v_legacy,v_missing,v_foreign]) a(id);
  INSERT INTO public.app_user_profile(id,role)
    VALUES (v_manager,'tourism_agent'),(v_owner,'owner'),(v_super,'super_admin'),
           (v_legacy,NULL),(v_foreign,'tourism_agent')
    ON CONFLICT (id) DO UPDATE SET role=EXCLUDED.role;
  ASSERT (SELECT role FROM public.app_user_profile WHERE id=v_new)='tourism_agent',
    'Auth provisioning must keep the new target ordinary despite user metadata';
  DELETE FROM public.app_user_profile WHERE id=v_missing;

  INSERT INTO public.user_org_membership(user_id,org_object_id)
    VALUES (v_manager,v_org) RETURNING id INTO v_manager_membership;
  INSERT INTO public.user_org_business_role(membership_id,role_id,is_active)
    VALUES (v_manager_membership,(SELECT id FROM public.ref_org_business_role WHERE code='editor'),TRUE);
  INSERT INTO public.user_org_admin_role(membership_id,role_id,is_active)
    VALUES (v_manager_membership,(SELECT id FROM public.ref_org_admin_role WHERE code='org_manager' AND rank=20),TRUE);
  INSERT INTO public.user_org_membership(user_id,org_object_id)
    VALUES (v_owner,v_other_org),(v_super,v_other_org),(v_foreign,v_other_org);
  INSERT INTO public.user_org_membership(user_id,org_object_id,is_active)
    VALUES (v_super,v_org,FALSE) RETURNING id INTO v_super_membership;
  INSERT INTO public.user_org_membership(user_id,org_object_id,is_active)
    VALUES (v_legacy,v_org,FALSE) RETURNING id INTO v_legacy_membership;

  PERFORM set_config('request.jwt.claims',json_build_object('sub',v_manager,'role','authenticated')::text,true);
  SET LOCAL ROLE authenticated;
    FOREACH v_target IN ARRAY ARRAY[v_owner,v_super] LOOP
      v_denied := FALSE;
      BEGIN
        PERFORM api.rpc_upsert_membership(v_target,v_org,'contributor');
      EXCEPTION WHEN insufficient_privilege THEN
        v_denied := SQLERRM='FORBIDDEN: rattachement indisponible pour ce compte';
      END;
      ASSERT v_denied, 'A local manager must not expand scope over a platform account';
    END LOOP;
    v_added_new := api.rpc_upsert_membership(v_new,v_org,'contributor');
    v_added_missing := api.rpc_upsert_membership(v_missing,v_org,'contributor');
    ASSERT api.rpc_upsert_membership(v_legacy,v_org,'contributor')=v_legacy_membership,
      'An existing ordinary inactive membership remains attachable';
    v_denied := FALSE;
    BEGIN
      PERFORM api.rpc_upsert_membership(v_foreign,v_org,'contributor');
    EXCEPTION WHEN raise_exception THEN
      v_denied := SQLERRM LIKE 'Un utilisateur tourism_agent ne peut avoir qu%';
    END;
    ASSERT v_denied, 'The existing one-ORG guard must still reject ordinary cross-ORG activation';
  RESET ROLE;
  ASSERT NOT EXISTS (SELECT 1 FROM public.user_org_membership
    WHERE user_id IN (v_owner,v_foreign) AND org_object_id=v_org);
  ASSERT EXISTS (SELECT 1 FROM public.user_org_membership WHERE id=v_super_membership AND NOT is_active);
  ASSERT NOT EXISTS (SELECT 1 FROM public.user_org_business_role WHERE membership_id=v_super_membership);
  ASSERT EXISTS (SELECT 1 FROM public.user_org_membership WHERE id=v_added_new AND user_id=v_new AND is_active);
  ASSERT EXISTS (SELECT 1 FROM public.user_org_membership WHERE id=v_added_missing AND user_id=v_missing AND is_active),
    'An existing Auth account without a profile remains attachable';

  PERFORM set_config('request.jwt.claims',json_build_object('sub',v_owner,'role','authenticated')::text,true);
  SET LOCAL ROLE authenticated;
    ASSERT api.rpc_upsert_membership(v_super,v_org,'contributor')=v_super_membership,
      'An owner must still be able to activate a platform membership';
  RESET ROLE;
  PERFORM set_config('request.jwt.claims',json_build_object('sub',v_super,'role','authenticated')::text,true);
  SET LOCAL ROLE authenticated;
    v_added_owner := api.rpc_upsert_membership(v_owner,v_org,'contributor');
  RESET ROLE;
  ASSERT EXISTS (SELECT 1 FROM public.user_org_membership WHERE id=v_added_owner AND user_id=v_owner AND is_active);

  PERFORM set_config('request.jwt.claims',json_build_object('sub',v_manager,'role','authenticated')::text,true);
  SET LOCAL ROLE authenticated;
    ASSERT api.rpc_upsert_membership(v_super,v_org,'editor')=v_super_membership,
      'An existing active platform member stays in the local manager scope';
  RESET ROLE;
  ASSERT EXISTS (SELECT 1 FROM public.user_org_business_role b
    JOIN public.ref_org_business_role r ON r.id=b.role_id
    WHERE b.membership_id=v_super_membership AND b.is_active AND r.code='editor');

  ASSERT NOT has_function_privilege('anon','api.rpc_attach_invite_membership(uuid,text,text)','EXECUTE');
  ASSERT has_function_privilege('authenticated','api.rpc_attach_invite_membership(uuid,text,text)','EXECUTE');
  ASSERT NOT has_function_privilege('authenticated','internal.upsert_org_membership(uuid,text,text,boolean)','EXECUTE');
  SET LOCAL ROLE authenticated;
    v_denied := FALSE;
    BEGIN
      PERFORM api.rpc_attach_invite_membership(v_new,v_org,'editor');
    EXCEPTION WHEN insufficient_privilege THEN
      v_denied := TRUE;
    END;
    ASSERT v_denied, 'A manager can still use the legacy RPC but cannot attach an invitation';
  RESET ROLE;

  UPDATE public.user_org_admin_role SET role_id=(
    SELECT id FROM public.ref_org_admin_role WHERE code='org_admin' AND rank=30
  ) WHERE membership_id=v_manager_membership AND is_active;
  UPDATE public.user_org_membership SET is_active=FALSE WHERE id=v_legacy_membership;
  SET LOCAL ROLE authenticated;
    v_receipt := api.rpc_attach_invite_membership(v_legacy,v_org,'contributor');
    ASSERT v_receipt=jsonb_build_object('membership_id',v_legacy_membership,'already_active',FALSE),
      'An inactive membership is reactivated with a distinct receipt';
    v_receipt := api.rpc_attach_invite_membership(v_legacy,v_org,'editor');
    ASSERT v_receipt=jsonb_build_object('membership_id',v_legacy_membership,'already_active',TRUE),
      'An invitation cannot rotate the business role of an active membership';
  RESET ROLE;
  ASSERT EXISTS (SELECT 1 FROM public.user_org_business_role b
    JOIN public.ref_org_business_role r ON r.id=b.role_id
    WHERE b.membership_id=v_legacy_membership AND b.is_active AND r.code='contributor');
END;
$test$;
ROLLBACK;
