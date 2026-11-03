-- Isolated database ONLY; requires setup_actor_collection_history.sql BEFORE migration R6.
\ir assert_partner_api_ephemeral.sql
BEGIN;
DO $test$
DECLARE
  v_user uuid:='00000000-0000-4000-a000-000000008811';
  v_actor uuid:='00000000-0000-4000-a000-000000008812';
  v_admin uuid:='00000000-0000-4000-a000-000000008801';
  v_role uuid; v_org_role uuid; v_method uuid; v_token jsonb; v_envelope jsonb; v_result jsonb;
  v_metadata jsonb; v_payload jsonb; v_id uuid; v_sub uuid; v_denied boolean; v_count bigint; v_period uuid;
  v_schedule uuid; v_time uuid; v_frame uuid;
BEGIN
  ASSERT NOT has_function_privilege('anon','api.get_object_proposal_baseline(text,text)','execute');
  ASSERT NOT has_table_privilege('authenticated','internal.pending_collection_baseline','INSERT,UPDATE,DELETE');
  ASSERT NOT EXISTS(SELECT 1 FROM internal.pending_collection_baseline WHERE pending_change_id IN('00000000-0000-4000-a000-000000008802','00000000-0000-4000-a000-000000008803')),'historical metadata was silently backfilled';
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  INSERT INTO auth.users(id,email) VALUES(v_user,'r6-actor@example.test');
  INSERT INTO public.actor(id,display_name,extra) VALUES(v_actor,'R6 actor','{"test_corpus":true}');
  INSERT INTO public.app_user_profile(id,role,actor_id) VALUES(v_user,'actor',v_actor) ON CONFLICT(id) DO UPDATE SET role=EXCLUDED.role,actor_id=EXCLUDED.actor_id;
  INSERT INTO public.object(id,object_type,name,status,is_test) VALUES
    ('ORGRUN9999998811','ORG','R6 office','published',true),('HOTRUN9999998812','HOT','R6 collection','published',true),('HOTRUN9999998813','HOT','R6 foreign','published',true);
  INSERT INTO public.org_config(org_object_id,is_test_org) VALUES('ORGRUN9999998811',true);
  SELECT id INTO v_role FROM public.ref_actor_role WHERE code='operator';
  SELECT id INTO v_org_role FROM public.ref_org_role WHERE code='publisher';
  INSERT INTO public.object_org_link(object_id,org_object_id,role_id,is_primary) VALUES('HOTRUN9999998812','ORGRUN9999998811',v_org_role,true);
  INSERT INTO public.actor_object_role(actor_id,object_id,role_id,is_primary) VALUES(v_actor,'HOTRUN9999998812',v_role,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_user,'role','authenticated')::text,true);
  v_denied:=false;
  BEGIN PERFORM api.get_object_proposal_baseline('HOTRUN9999998813','characteristics'); EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
  ASSERT v_denied,'baseline leaked across actor scope';
  v_token:=api.get_object_proposal_baseline('HOTRUN9999998812','characteristics');
  v_metadata:=jsonb_build_object('rpc','save_object_commercial','section','characteristics','field','Équipements','collection_baseline',v_token,'before','display-only');
  v_payload:='{"languages":[],"payment_methods":[],"environment_tags":[],"amenities":[]}';
  v_envelope:=jsonb_build_object('target_table','object_amenity','action','update','payload',v_payload,'metadata',v_metadata);
  SELECT id INTO v_method FROM public.ref_code_payment_method ORDER BY id LIMIT 1;
  INSERT INTO public.object_payment_method(object_id,payment_method_id) VALUES('HOTRUN9999998812',v_method);
  SELECT count(*) INTO v_count FROM public.fiche_submission;
  v_denied:=false;
  BEGIN PERFORM api.submit_actor_fiche('HOTRUN9999998812',jsonb_build_array(v_envelope),NULL); EXCEPTION WHEN SQLSTATE 'PT412' THEN v_denied:=true; END;
  ASSERT v_denied,'stale submission accepted';
  ASSERT (SELECT count(*) FROM public.fiche_submission)=v_count,'failed submission left a partial batch';
  ASSERT (SELECT count(*) FROM public.pending_change WHERE object_id='HOTRUN9999998812')=0;
  DELETE FROM public.object_payment_method WHERE object_id='HOTRUN9999998812';
  v_token:=api.get_object_proposal_baseline('HOTRUN9999998812','characteristics');
  v_envelope:=jsonb_set(v_envelope,'{metadata,collection_baseline}',v_token);
  v_result:=api.submit_actor_fiche('HOTRUN9999998812',jsonb_build_array(v_envelope),NULL);
  v_sub:=(v_result->>'submission_id')::uuid;
  SELECT id INTO v_id FROM public.pending_change WHERE submission_id=v_sub;
  ASSERT EXISTS(SELECT 1 FROM internal.pending_collection_baseline WHERE pending_change_id=v_id),'accepted baseline was not captured privately';
  INSERT INTO public.object_payment_method(object_id,payment_method_id) VALUES('HOTRUN9999998812',v_method);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_admin,'role','authenticated')::text,true);
  v_denied:=false;
  BEGIN PERFORM api.approve_pending_change(v_id,NULL,false); EXCEPTION WHEN SQLSTATE 'PT412' THEN v_denied:=true; END;
  ASSERT v_denied,'approval overwrote a newer collection';
  v_denied:=false;
  BEGIN PERFORM api.approve_pending_change(v_id,'Attestation cannot bypass a stale new proposal',true); EXCEPTION WHEN SQLSTATE 'PT412' THEN v_denied:=true; END;
  ASSERT v_denied,'manual flag bypassed a newer proposal precondition';
  ASSERT (SELECT status='pending' AND payload=v_payload AND applied_at IS NULL FROM public.pending_change WHERE id=v_id),'stale proposal was rewritten';
  ASSERT EXISTS(SELECT 1 FROM public.object_payment_method WHERE object_id='HOTRUN9999998812'),'new office equipment was lost';
  PERFORM api.reject_pending_change(v_id,'Nouvelle proposition nécessaire');
  -- Fresh baseline auto-applies; another domain does not invalidate it.
  DELETE FROM public.object_payment_method WHERE object_id='HOTRUN9999998812';
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_user,'role','authenticated')::text,true);
  v_envelope:=jsonb_set(v_envelope,'{metadata,collection_baseline}',api.get_object_proposal_baseline('HOTRUN9999998812','characteristics'));
  v_result:=api.submit_actor_fiche('HOTRUN9999998812',jsonb_build_array(v_envelope),NULL);
  SELECT id INTO v_id FROM public.pending_change WHERE submission_id=(v_result->>'submission_id')::uuid;
  INSERT INTO public.opening_period(object_id,name) VALUES('HOTRUN9999998812','Other domain') RETURNING id INTO v_period;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_admin,'role','authenticated')::text,true);
  PERFORM api.approve_pending_change(v_id,NULL,false);
  ASSERT (SELECT status='applied' FROM public.pending_change WHERE id=v_id),'fresh proposal did not apply';
  -- Opening metadata and all descendants belong to its own baseline.
  INSERT INTO public.opening_schedule(period_id,schedule_type_id,name) VALUES(v_period,
    (SELECT id FROM public.ref_code_opening_schedule_type WHERE code='regular' LIMIT 1),'Regular') RETURNING id INTO v_schedule;
  INSERT INTO public.opening_time_period(schedule_id,closed) VALUES(v_schedule,false) RETURNING id INTO v_time;
  INSERT INTO public.opening_time_frame(time_period_id,start_time,end_time) VALUES(v_time,'09:00:30','12:00') RETURNING id INTO v_frame;
  v_token:=api.get_object_proposal_baseline('HOTRUN9999998812','openings');
  v_id:=api.submit_pending_change('HOTRUN9999998812','opening_period',NULL,'update','{"periods":[]}',
    jsonb_build_object('rpc','save_object_openings','section','openings','collection_baseline',v_token));
  UPDATE public.opening_time_frame SET start_time='10:00:30' WHERE id=v_frame;
  v_denied:=false;
  BEGIN PERFORM api.approve_pending_change(v_id,NULL,false); EXCEPTION WHEN SQLSTATE 'PT412' THEN v_denied:=true; END;
  ASSERT v_denied,'stale opening snapshot deleted newer periods';
  ASSERT (SELECT start_time='10:00:30'::time FROM public.opening_time_frame WHERE id=v_frame),'newer child frame lost';
  ASSERT (SELECT name='Other domain' FROM public.opening_period WHERE id=v_period);
  -- Fake metadata on an old row is never proof. Historical bulk is explicit and audited.
  SELECT payload INTO v_payload FROM public.pending_change WHERE id='00000000-0000-4000-a000-000000008802';
  ASSERT EXISTS(SELECT 1 FROM api.list_pending_changes('pending','HOTRUN9999998801',50,0) WHERE id='00000000-0000-4000-a000-000000008802' AND manual_apply);
  v_denied:=false;
  BEGIN PERFORM api.approve_pending_change('00000000-0000-4000-a000-000000008802',NULL,false); EXCEPTION WHEN SQLSTATE 'PT428' THEN v_denied:=true; END;
  ASSERT v_denied,'historical envelope auto-applied';
  v_denied:=false;
  BEGIN PERFORM api.approve_pending_change('00000000-0000-4000-a000-000000008802','',true); EXCEPTION WHEN SQLSTATE 'P0001' THEN v_denied:=true; END;
  ASSERT v_denied,'historical report accepted without reason';
  INSERT INTO public.fiche_submission(object_id,actor_id,submitted_by,status) VALUES('HOTRUN9999998801',v_actor,v_admin,'pending') RETURNING id INTO v_sub;
  UPDATE public.pending_change SET submission_id=v_sub WHERE id IN('00000000-0000-4000-a000-000000008802','00000000-0000-4000-a000-000000008803');
  v_result:=api.approve_fiche_submission(v_sub,NULL,false);
  ASSERT v_result->>'skipped_manual_count'='2' AND v_result->>'applied_count'='0';
  v_result:=api.approve_fiche_submission(v_sub,'Report vérifié dans l’éditeur',true);
  ASSERT v_result->>'approved_manual_count'='2' AND v_result->>'applied_count'='0';
  ASSERT (SELECT status='approved' AND applied_at IS NULL AND payload=v_payload AND metadata->>'rpc'='save_object_commercial'
    AND metadata->>'historical_manual_report'='true' AND metadata->>'attested_by'=v_admin::text FROM public.pending_change WHERE id='00000000-0000-4000-a000-000000008802');
  ASSERT NOT EXISTS(SELECT 1 FROM public.object_capacity WHERE object_id='HOTRUN9999998801'),'historical payload was redispatched';
END $test$;
ROLLBACK;
