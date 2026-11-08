\set ON_ERROR_STOP on
BEGIN;
SET LOCAL plpgsql.check_asserts=on;
\ir fixtures/object_current_rights.sql
DO $test$
DECLARE
 v_writer uuid:='00000000-0000-4000-a000-00000000ae11';
 v_other uuid:='00000000-0000-4000-a000-00000000ae12';
 v_admin uuid:='00000000-0000-4000-a000-00000000ae15';
 v_actor uuid:='00000000-0000-4000-a000-00000000aa01';
 v_other_actor uuid:='00000000-0000-4000-a000-00000000aa02';
 v_task uuid:=gen_random_uuid(); v_actor_upload uuid:=gen_random_uuid();
 v_image_upload uuid:=gen_random_uuid(); v_task_upload uuid:=gen_random_uuid(); v_failed_upload uuid:=gen_random_uuid();
 v_permission uuid; v_result jsonb; v_again jsonb; v_snapshot jsonb; v_denied boolean;
 v_constraint text; v_gdpr_before jsonb; v_logs bigint; v_role text; v_function regprocedure;
 v_hash text:=repeat('a',64); v_path text;
BEGIN
 ASSERT (SELECT admin_authorized AND erase_allowed AND status_allowed FROM pg_temp.crm_upload_gdpr_before);
 SELECT definitions INTO v_gdpr_before FROM pg_temp.crm_upload_gdpr_before;
 ASSERT (SELECT jsonb_agg(jsonb_build_object('signature',signature,'oid',p.oid,'owner',p.proowner,
  'definition',pg_get_functiondef(p.oid)) ORDER BY signature)=v_gdpr_before
  FROM (VALUES('api.rpc_gdpr_erase_subject(text,text,text,text)'),('api.rpc_gdpr_get_cleanup_status(uuid)')) f(signature)
  JOIN pg_catalog.pg_proc p ON p.oid=to_regprocedure(signature));
 FOREACH v_role IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  ASSERT NOT has_function_privilege(v_role,'api.rpc_gdpr_erase_subject(text,text,text,text)','EXECUTE');
  ASSERT NOT has_function_privilege(v_role,'api.rpc_gdpr_get_cleanup_status(uuid)','EXECUTE');
 END LOOP;
 FOREACH v_role IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  ASSERT NOT has_table_privilege(v_role,'internal.crm_document_upload','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER');
 END LOOP;
 ASSERT (SELECT relowner='postgres'::regrole AND relrowsecurity FROM pg_class WHERE oid='internal.crm_document_upload'::regclass);
 ASSERT NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='internal.crm_document_upload'::regclass);
 ASSERT NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='internal.crm_document_upload'::regclass AND contype='f');
 FOREACH v_function IN ARRAY ARRAY[
  'api.prepare_crm_document_upload(uuid,text,uuid,text,text,text,bigint,text)'::regprocedure,
  'api.attach_crm_document_upload(uuid)'::regprocedure
 ] LOOP
  ASSERT has_function_privilege('authenticated',v_function,'EXECUTE');
  ASSERT NOT has_function_privilege('anon',v_function,'EXECUTE');
  ASSERT NOT has_function_privilege('service_role',v_function,'EXECUTE');
 END LOOP;
 ASSERT has_function_privilege('service_role','api.confirm_crm_document_upload(uuid,uuid,text,text,bigint,text)','EXECUTE');
 ASSERT NOT has_function_privilege('authenticated','api.confirm_crm_document_upload(uuid,uuid,text,text,bigint,text)','EXECUTE');
 ASSERT NOT has_function_privilege('anon','api.confirm_crm_document_upload(uuid,uuid,text,text,bigint,text)','EXECUTE');
 PERFORM pg_temp.setup_current_rights_fixture();
 SELECT id INTO STRICT v_permission FROM public.ref_permission WHERE code='write_crm_notes';
 INSERT INTO public.user_permission(user_id,permission_id,is_active,granted_by) VALUES(v_writer,v_permission,true,v_admin);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_admin,'role','authenticated')::text,true);
 SELECT count(*) INTO v_logs FROM public.gdpr_erasure_log;
 SET LOCAL ROLE authenticated;
 ASSERT api.is_platform_superuser();
 v_denied:=false;
 BEGIN PERFORM api.rpc_gdpr_erase_subject('actor',v_actor::text,'anonymize','Synthetic closed entry witness');
 EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
 ASSERT v_denied,'Even an authorized platform admin must hit the temporary API hold';
 RESET ROLE;
 ASSERT (SELECT count(*)=v_logs FROM public.gdpr_erasure_log);
 ASSERT (SELECT display_name='Synthetic current rights actor A' FROM public.actor WHERE id=v_actor);
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 SET LOCAL ROLE service_role;
 v_denied:=false;
 BEGIN PERFORM api.rpc_gdpr_get_cleanup_status(NULL);
 EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
 ASSERT v_denied;
 v_denied:=false;
 BEGIN PERFORM api.rpc_gdpr_get_cleanup_status(gen_random_uuid());
 EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
 ASSERT v_denied;
 RESET ROLE;
 INSERT INTO public.crm_task(id,object_id,actor_id,title) VALUES(v_task,'HOTRUN999999AR01',v_actor,'Synthetic upload task');
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_writer,'role','authenticated')::text,true);
 SET LOCAL ROLE authenticated;
 v_result:=api.prepare_crm_document_upload(v_actor_upload,'actor',v_actor,'Synthetic.pdf','application/pdf','pdf',3,v_hash);
 ASSERT v_result->>'path'='actors/'||v_actor||'/'||v_actor_upload||'.pdf';
 ASSERT v_result->>'state'='prepared';
 v_denied:=false;
 BEGIN PERFORM api.attach_crm_document_upload(v_actor_upload);
 EXCEPTION WHEN object_not_in_prerequisite_state THEN v_denied:=true; END;
 ASSERT v_denied,'A caller cannot claim an unconfirmed upload';
 RESET ROLE;
 ASSERT NOT EXISTS(SELECT 1 FROM public.ref_document WHERE id=v_actor_upload);
 SELECT to_jsonb(u)-ARRAY['state','uploaded_at','attached_at','attached_actor_id'] INTO v_snapshot
  FROM internal.crm_document_upload u WHERE id=v_actor_upload;
 v_path:=v_result->>'path';
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 SET LOCAL ROLE service_role;
 v_denied:=false;
 BEGIN PERFORM api.confirm_crm_document_upload(v_actor_upload,v_writer,v_path,repeat('b',64),3,'application/pdf');
 EXCEPTION WHEN invalid_parameter_value THEN v_denied:=true; END;
 ASSERT v_denied,'Confirmation must bind the prepared fingerprint';
 PERFORM api.confirm_crm_document_upload(v_actor_upload,v_writer,v_path,v_hash,3,'application/pdf');
 RESET ROLE;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_other,'role','authenticated')::text,true);
 SET LOCAL ROLE authenticated;
 v_denied:=false;
 BEGIN PERFORM api.attach_crm_document_upload(v_actor_upload);
 EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
 ASSERT v_denied;
 RESET ROLE;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_writer,'role','authenticated')::text,true);
 SET LOCAL ROLE authenticated;
 v_result:=api.attach_crm_document_upload(v_actor_upload);
 v_again:=api.attach_crm_document_upload(v_actor_upload);
 ASSERT v_again=v_result AND v_result=jsonb_build_object('documentId',v_actor_upload,'title','Synthetic.pdf');
 ASSERT api.unlink_crm_actor_document(v_actor,v_actor_upload)='deleted';
 ASSERT api.attach_crm_document_upload(v_actor_upload)=v_result;
 RESET ROLE;
 ASSERT NOT EXISTS(SELECT 1 FROM public.actor_document WHERE actor_id=v_actor AND document_id=v_actor_upload),'Replay must not revive an unlinked edge';
 ASSERT EXISTS(SELECT 1 FROM public.ref_document WHERE id=v_actor_upload);
 ASSERT (SELECT extra=jsonb_build_object('mime_type','application/pdf','size_bytes',3)
  AND storage_bucket='actor-documents' AND storage_path=v_path AND access_scope='crm_private'
  FROM public.ref_document WHERE id=v_actor_upload);
 ASSERT (SELECT to_jsonb(u)-ARRAY['state','uploaded_at','attached_at','attached_actor_id']=v_snapshot
  FROM internal.crm_document_upload u WHERE id=v_actor_upload),'Prepared provenance is immutable';
 SET LOCAL ROLE authenticated;
 v_result:=api.prepare_crm_document_upload(v_image_upload,'actor',v_actor,'Synthetic.jpg','image/jpeg','jpg',1024,v_hash);
 ASSERT right(v_result->>'path',4)='.jpg';
 RESET ROLE;
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 SET LOCAL ROLE service_role;
 PERFORM api.confirm_crm_document_upload(v_image_upload,v_writer,v_result->>'path',v_hash,1024,'image/jpeg');
 RESET ROLE;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_writer,'role','authenticated')::text,true);
 SET LOCAL ROLE authenticated;
 PERFORM api.attach_crm_document_upload(v_image_upload);
 RESET ROLE;
 ASSERT (SELECT extra=jsonb_build_object('mime_type','image/jpeg','size_bytes',1024)
  AND right(storage_path,4)='.jpg' FROM public.ref_document WHERE id=v_image_upload);
 UPDATE public.user_org_membership SET is_active=false WHERE user_id=v_writer;
 SET LOCAL ROLE authenticated;
 ASSERT api.user_can_write_crm_actor(v_actor) IS FALSE;
 v_denied:=false;
 BEGIN PERFORM api.attach_crm_document_upload(v_actor_upload);
 EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
 ASSERT v_denied,'Even a completed receipt requires current authority';
 RESET ROLE;
 UPDATE public.user_org_membership SET is_active=true WHERE user_id=v_writer;
 SET LOCAL ROLE authenticated;
 v_result:=api.prepare_crm_document_upload(v_task_upload,'task',v_task,'Synthetic task.pdf','application/pdf','pdf',3,v_hash);
 RESET ROLE;
 UPDATE public.crm_task SET actor_id=v_other_actor WHERE id=v_task;
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 SET LOCAL ROLE service_role;
 PERFORM api.confirm_crm_document_upload(v_task_upload,v_writer,v_result->>'path',v_hash,3,'application/pdf');
 RESET ROLE;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_writer,'role','authenticated')::text,true);
 SET LOCAL ROLE authenticated;
 PERFORM api.attach_crm_document_upload(v_task_upload);
 v_result:=api.prepare_crm_document_upload(v_failed_upload,'task',v_task,'Failure.pdf','application/pdf','pdf',3,v_hash);
 RESET ROLE;
 ASSERT (SELECT prepared_actor_id=v_actor AND attached_actor_id=v_other_actor FROM internal.crm_document_upload WHERE id=v_task_upload);
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 SET LOCAL ROLE service_role;
 PERFORM api.confirm_crm_document_upload(v_failed_upload,v_writer,v_result->>'path',v_hash,3,'application/pdf');
 RESET ROLE;
 EXECUTE format('ALTER TABLE public.crm_task_document ADD CONSTRAINT upload_fixture_refusal CHECK(document_id<>%L::uuid) NOT VALID',v_failed_upload);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_writer,'role','authenticated')::text,true);
 SET LOCAL ROLE authenticated;
 v_denied:=false;
 BEGIN PERFORM api.attach_crm_document_upload(v_failed_upload);
 EXCEPTION WHEN check_violation THEN
  GET STACKED DIAGNOSTICS v_constraint=CONSTRAINT_NAME;
  ASSERT v_constraint='upload_fixture_refusal'; v_denied:=true;
 END;
 ASSERT v_denied;
 RESET ROLE;
 ASSERT NOT EXISTS(SELECT 1 FROM public.ref_document WHERE id=v_failed_upload);
 ASSERT NOT EXISTS(SELECT 1 FROM public.crm_task_document WHERE document_id=v_failed_upload);
 ASSERT (SELECT state='uploaded' AND attached_at IS NULL FROM internal.crm_document_upload WHERE id=v_failed_upload);
 ALTER TABLE public.crm_task_document DROP CONSTRAINT upload_fixture_refusal;
END;
$test$;
ROLLBACK;
