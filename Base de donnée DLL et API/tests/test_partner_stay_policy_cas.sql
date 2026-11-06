-- R2 isolated fixture only. Never run against production, even with ROLLBACK.
BEGIN;
DO $test$
DECLARE
  v_user uuid:='00000000-0000-4000-a000-000000008601';
  v_actor uuid:='00000000-0000-4000-a000-000000008602';
  v_admin uuid:='00000000-0000-4000-a000-000000008603';
  v_role uuid; v_org_role uuid; v_old jsonb; v_new jsonb; v_payload jsonb; v_result jsonb; v_denied boolean;
BEGIN
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  ASSERT NOT has_function_privilege('anon','api.save_object_capacity_policies(text,jsonb)','execute');
  ASSERT NOT has_function_privilege('authenticated','api.patch_portal_stay_times(text,jsonb)','execute'), 'actor activation must wait for cutover';
  ASSERT NOT has_function_privilege('authenticated','internal.patch_stay_policy(text,jsonb)','execute');
  INSERT INTO auth.users(id,email) VALUES(v_user,'r2-actor@example.test'),(v_admin,'r2-admin@example.test');
  INSERT INTO public.actor(id,display_name,extra) VALUES(v_actor,'R2 actor','{"test_corpus":true}');
  INSERT INTO public.app_user_profile(id,role,actor_id) VALUES(v_user,'actor',v_actor),(v_admin,'super_admin',NULL)
    ON CONFLICT(id) DO UPDATE SET role=EXCLUDED.role,actor_id=EXCLUDED.actor_id;
  SELECT id INTO v_role FROM public.ref_actor_role WHERE code='operator';
  SELECT id INTO v_org_role FROM public.ref_org_role WHERE code='publisher';
  INSERT INTO public.object(id,object_type,name,status,is_test) VALUES
    ('ORGRUN9999998601','ORG','R2 office','published',true),
    ('HOTRUN9999998602','HOT','R2 accommodation','published',true),
    ('HOTRUN9999998603','HOT','R2 other','published',true),
    ('RESRUN9999998604','RES','R2 restaurant','published',true);
  INSERT INTO public.org_config(org_object_id,is_test_org) VALUES('ORGRUN9999998601',true);
  INSERT INTO public.object_org_link(object_id,org_object_id,role_id,is_primary)
    VALUES('HOTRUN9999998602','ORGRUN9999998601',v_org_role,true);
  INSERT INTO public.actor_object_role(actor_id,object_id,role_id,is_primary)
    VALUES(v_actor,'HOTRUN9999998602',v_role,true),(v_actor,'RESRUN9999998604',v_role,true);
  INSERT INTO public.object_stay_policy(object_id,check_in_from,conditions)
    VALUES('HOTRUN9999998602','14:00:30','Office condition');
  v_old:=internal.stay_policy_snapshot('HOTRUN9999998602');
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_user,'role','authenticated')::text,true);
  v_payload:=jsonb_build_object('write_contract','stay-policy-patch-v1','expected',v_old,'changes',jsonb_build_object('check_in_from','15:00'));
  v_result:=api.patch_portal_stay_times('HOTRUN9999998602',v_payload);
  ASSERT v_result#>>'{stay_policy,values,check_in_from}'='15:00:00';
  ASSERT v_result#>>'{stay_policy,values,conditions}'='Office condition';
  ASSERT api.patch_portal_stay_times('HOTRUN9999998602',v_payload)=v_result,'lost-response retry must confirm without another change';
  v_denied:=false;
  BEGIN PERFORM api.patch_portal_stay_times('HOTRUN9999998602',jsonb_set(v_payload,'{changes,check_in_from}','"16:00"'));
  EXCEPTION WHEN SQLSTATE 'PT409' THEN v_denied:=true; END;
  ASSERT v_denied,'stale change overwrote newer hour';
  v_denied:=false;
  BEGIN PERFORM api.patch_portal_stay_times('HOTRUN9999998603',v_payload); EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
  ASSERT v_denied,'foreign object accepted';
  v_denied:=false;
  BEGIN PERFORM api.patch_portal_stay_times('RESRUN9999998604',v_payload); EXCEPTION WHEN invalid_parameter_value THEN v_denied:=true; END;
  ASSERT v_denied,'restaurant accepted stay hours';
  v_denied:=false;
  BEGIN PERFORM api.patch_portal_stay_times('HOTRUN9999998602',jsonb_set(v_payload,'{changes,conditions}','"forged"'));
  EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
  ASSERT v_denied,'actor changed conditions';
  v_denied:=false;
  BEGIN PERFORM api.save_object_capacity_policies('HOTRUN9999998602','{}'); EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
  ASSERT v_denied,'actor called office contract';

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_admin,'role','authenticated')::text,true);
  -- Office snapshot is older, but a capacity-only save has no stay patch and preserves 15:00.
  v_result:=api.save_object_capacity_policies('HOTRUN9999998602',jsonb_build_object('stay_policy',
    jsonb_build_object('write_contract','stay-policy-patch-v1','expected',v_old,'changes','{}'::jsonb),'capacities','[]'::jsonb));
  ASSERT v_result#>>'{stay_policy,values,check_in_from}'='15:00:00','capacity-only save clobbered actor hour';
  -- Office conditions patch is disjoint and must preserve actor hours.
  v_result:=api.save_object_capacity_policies('HOTRUN9999998602',jsonb_build_object('stay_policy',
    jsonb_build_object('write_contract','stay-policy-patch-v1','expected',v_old,'changes',jsonb_build_object('conditions','Office revised'))));
  ASSERT v_result#>>'{stay_policy,values,check_in_from}'='15:00:00';
  ASSERT v_result#>>'{stay_policy,values,conditions}'='Office revised';
  v_new:=internal.stay_policy_snapshot('HOTRUN9999998602');
  -- Error after the stay patch (invalid capacity reference) rolls the patch back as well.
  v_denied:=false;
  BEGIN
    PERFORM api.save_object_capacity_policies('HOTRUN9999998602',jsonb_build_object('stay_policy',
      jsonb_build_object('write_contract','stay-policy-patch-v1','expected',v_new,'changes',jsonb_build_object('check_out_until','11:00')),
      'capacities',jsonb_build_array(jsonb_build_object('metric_code','r2_unknown_metric','value_integer',5))));
  EXCEPTION WHEN foreign_key_violation THEN v_denied:=true; END;
  ASSERT v_denied,'fixture must fail at commercial validation';
  ASSERT internal.stay_policy_snapshot('HOTRUN9999998602')=v_new,'partial stay write survived failed transaction';
  -- First insertion distinguishes no row from an all-null row and does not need a fake fixture row.
  v_old:=internal.stay_policy_snapshot('HOTRUN9999998603');
  ASSERT v_old->>'exists'='false';
  PERFORM api.save_object_capacity_policies('HOTRUN9999998603',jsonb_build_object('stay_policy',
    jsonb_build_object('write_contract','stay-policy-patch-v1','expected',v_old,'changes',jsonb_build_object('check_in_from','14:00'))));
  ASSERT internal.stay_policy_snapshot('HOTRUN9999998603')#>>'{values,check_in_from}'='14:00:00';
  v_denied:=false;
  BEGIN PERFORM api.save_object_capacity_policies('HOTRUN9999998603','{"stay_policy":{"write_contract":"stay-policy-patch-v1","changes":{}}}');
  EXCEPTION WHEN invalid_parameter_value THEN v_denied:=true; END;
  ASSERT v_denied,'missing baseline accepted';
END $test$;
ROLLBACK;
