-- Exception D7 approuvee le 31/10/2026 : seulement les trois heures, sur son hebergement.
BEGIN;
DO $test$
DECLARE
  v_user uuid := '00000000-0000-4000-a000-000000008101';
  v_actor uuid := '00000000-0000-4000-a000-000000008102';
  v_role uuid;
  v_org_role uuid;
  v_denied boolean;
  v_bad text;
  v_result jsonb;
  v_pending bigint;
BEGIN
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  ASSERT NOT has_function_privilege('anon', 'api.save_portal_stay_times(text,text,text,text)', 'execute');
  ASSERT has_function_privilege('authenticated', 'api.save_portal_stay_times(text,text,text,text)', 'execute');
  SELECT id INTO v_role FROM public.ref_actor_role WHERE code='operator';
  SELECT id INTO v_org_role FROM public.ref_org_role WHERE code='publisher';
  INSERT INTO auth.users(id,email) VALUES(v_user,'portal-stay-8101@example.test');
  INSERT INTO public.actor(id,display_name,extra) VALUES(v_actor,'Partenaire heures 8102','{"test_corpus":true}');
  INSERT INTO public.app_user_profile(id,role,actor_id) VALUES(v_user,'actor',v_actor)
    ON CONFLICT(id) DO UPDATE SET role='actor',actor_id=EXCLUDED.actor_id;
  INSERT INTO public.object(id,object_type,name,status,is_test) VALUES
    ('ORGRUN9999998101','ORG','Office heures test','published',true),
    ('HOTRUN9999998102','HOT','Hebergement heures test','published',true),
    ('HOTRUN9999998103','HOT','Hebergement autre partenaire','published',true),
    ('RESRUN9999998104','RES','Restaurant heures test','published',true),
    ('HOTRUN9999998105','HOT','Hebergement reel piege','published',false);
  INSERT INTO public.org_config(org_object_id,is_test_org) VALUES('ORGRUN9999998101',true);
  INSERT INTO public.object_org_link(object_id,org_object_id,role_id,is_primary)
    VALUES('HOTRUN9999998102','ORGRUN9999998101',v_org_role,true);
  INSERT INTO public.actor_object_role(actor_id,object_id,role_id,is_primary) VALUES
    (v_actor,'HOTRUN9999998102',v_role,true),(v_actor,'RESRUN9999998104',v_role,true);
  INSERT INTO public.object_stay_policy(object_id,conditions,check_in_from)
    VALUES('HOTRUN9999998102','Conditions conservees','14:00');
  SELECT count(*) INTO v_pending FROM public.pending_change;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_user,'role','authenticated')::text,true);
  ASSERT api.current_user_test_realm(), 'fixture: compte dans le perimetre de test';
  v_result := api.save_portal_stay_times('HOTRUN9999998102','15:30','23:00','10:00');
  ASSERT v_result->>'checkInFrom'='15:30' AND v_result->>'checkInUntil'='23:00' AND v_result->>'checkOutUntil'='10:00';
  ASSERT (SELECT conditions='Conditions conservees' AND check_in_from='15:30'::time AND check_in_until='23:00'::time AND check_out_until='10:00'::time FROM public.object_stay_policy WHERE object_id='HOTRUN9999998102');
  ASSERT (SELECT count(*) FROM public.pending_change)=v_pending, 'les heures ne creent pas de demande de relecture';
  FOREACH v_bad IN ARRAY ARRAY['24:00','12:60','09:00:01','2026-10-31','abc','12:00Z'] LOOP
    v_denied := false;
    BEGIN PERFORM api.save_portal_stay_times('HOTRUN9999998102',v_bad,'','10:00');
    EXCEPTION WHEN invalid_parameter_value THEN v_denied := true; END;
    ASSERT v_denied, 'format accepte a tort: '||v_bad;
  END LOOP;
  v_denied := false;
  BEGIN PERFORM api.save_portal_stay_times('HOTRUN9999998103','09:00','','10:00');
  EXCEPTION WHEN insufficient_privilege THEN v_denied := true; END;
  ASSERT v_denied, 'fiche du partenaire B accessible';
  v_denied := false;
  BEGIN PERFORM api.save_portal_stay_times('HOTRUN9999998105','09:00','','10:00');
  EXCEPTION WHEN insufficient_privilege THEN v_denied := true; END;
  ASSERT v_denied, 'sortie du perimetre de test';
  v_denied := false;
  BEGIN PERFORM api.save_portal_stay_times('RESRUN9999998104','09:00','','10:00');
  EXCEPTION WHEN invalid_parameter_value THEN v_denied := true; END;
  ASSERT v_denied, 'un restaurant ne recoit pas d heures de sejour';
  INSERT INTO public.org_actor_module_visibility(org_object_id,object_type,module_id,is_visible)
    VALUES('ORGRUN9999998101','HOT','capacity-policies',false);
  v_denied := false;
  BEGIN PERFORM api.save_portal_stay_times('HOTRUN9999998102','09:00','','10:00');
  EXCEPTION WHEN insufficient_privilege THEN v_denied := true; END;
  ASSERT v_denied, 'le masquage de l office doit rester respecte';
  DELETE FROM public.org_actor_module_visibility WHERE org_object_id='ORGRUN9999998101';
  PERFORM api.save_portal_stay_times('HOTRUN9999998102','','','');
  ASSERT (SELECT check_in_from IS NULL AND check_in_until IS NULL AND check_out_until IS NULL AND conditions='Conditions conservees' FROM public.object_stay_policy WHERE object_id='HOTRUN9999998102');
  PERFORM set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-000000008109","role":"authenticated"}',true);
  v_denied := false;
  BEGIN PERFORM api.save_portal_stay_times('HOTRUN9999998102','09:00','','10:00');
  EXCEPTION WHEN insufficient_privilege THEN v_denied := true; END;
  ASSERT v_denied, 'la nouvelle porte est reservee au partenaire';
END $test$;
ROLLBACK;
