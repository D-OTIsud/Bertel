-- Synthetic receipts only. No Storage API or bytes. Rollback every fixture row.
BEGIN;
SET LOCAL search_path=pg_catalog,pg_temp;
SET LOCAL plpgsql.check_asserts=on;
DO $test$
DECLARE
 u uuid := '00000000-0000-4000-8000-000000000501';
 v_id uuid := '00000000-0000-4000-8000-000000000601';
 path text := u::text||'/avatar-'||v_id::text||'.jpg';
 h text := repeat('a',64);
 receipt jsonb;
 finished timestamptz;
 role_name text;
 op uuid := gen_random_uuid();
 late_id uuid := '00000000-0000-4000-8000-000000000602';
 denied boolean;
BEGIN
 -- An invited Auth account can legitimately have no application profile.
 INSERT INTO auth.users(id,email,invited_at) VALUES(u,'avatar-invite@example.invalid',now());
 DELETE FROM public.app_user_profile WHERE id=u;
 ASSERT NOT EXISTS(SELECT 1 FROM public.app_user_profile WHERE id=u);
 receipt:=api.begin_avatar_upload(v_id,u,path,h,3);
 ASSERT receipt->>'state'='engaged' AND receipt->>'path'=path;
 BEGIN
  PERFORM api.begin_avatar_upload(v_id,u,path,h,3);
  RAISE EXCEPTION 'an engaged receipt admitted a second producer';
 EXCEPTION WHEN unique_violation THEN NULL;
 END;
 UPDATE internal.avatar_upload_intent SET created_at='2000-01-01Z' WHERE avatar_upload_intent.id=v_id;
 BEGIN
  PERFORM internal.gdpr_assert_no_avatar_upload(u);
  RAISE EXCEPTION 'old engaged intent expired';
 EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL;
 END;
 BEGIN
  PERFORM api.complete_avatar_upload(v_id,u,path,repeat('b',64),3);
  RAISE EXCEPTION 'wrong byte binding completed';
 EXCEPTION WHEN invalid_parameter_value THEN NULL;
 END;
 ASSERT (SELECT state='engaged' FROM internal.avatar_upload_intent WHERE avatar_upload_intent.id=v_id);
 receipt:=api.complete_avatar_upload(v_id,u,path,h,3);
 ASSERT receipt->>'state'='finished';
 SELECT finished_at INTO finished FROM internal.avatar_upload_intent WHERE avatar_upload_intent.id=v_id;
 ASSERT api.complete_avatar_upload(v_id,u,path,h,3)=receipt;
 ASSERT (SELECT finished_at=finished FROM internal.avatar_upload_intent WHERE avatar_upload_intent.id=v_id);
 PERFORM internal.gdpr_assert_no_avatar_upload(u);
 BEGIN
  PERFORM api.begin_avatar_upload(v_id,u,path,h,3);
  RAISE EXCEPTION 'finished receipt was rearmed';
 EXCEPTION WHEN unique_violation THEN NULL;
 END;
 -- Erasure is terminal and all tasks ACKed before an old HTTP request reaches begin.
 INSERT INTO public.gdpr_erasure_log(id,subject_kind,subject_id,mode,performed_by,report)
 VALUES(op,'user',u::text,'delete','synthetic',jsonb_build_object('operationId',op));
 INSERT INTO internal.gdpr_cleanup_task(operation_id,action,metadata,status,attempts) VALUES
  (op,'storage_remove',jsonb_build_object('bucket','avatars','path',path),'succeeded',1),
  (op,'auth_delete',jsonb_build_object('user_id',u::text),'succeeded',1);
 DELETE FROM auth.users WHERE id=u;
 ASSERT api.avatar_upload_allowed(u), 'terminal tasks alone no longer block admission';
 denied:=false;
 BEGIN
  PERFORM api.begin_avatar_upload(late_id,u,u::text||'/avatar-'||late_id::text||'.jpg',h,3);
 EXCEPTION WHEN object_not_in_prerequisite_state THEN denied:=true;
 END;
 ASSERT denied, 'a delayed begin must not admit a subject already deleted by Auth';
 ASSERT NOT EXISTS(SELECT 1 FROM internal.avatar_upload_intent WHERE id=late_id), 'no new intent';
 ASSERT (SELECT count(*)=2 AND bool_and(status='succeeded') FROM internal.gdpr_cleanup_task WHERE operation_id=op);
 -- Soft-deleted Auth rows are equally unavailable; neither condition needs a profile.
 INSERT INTO auth.users(id,email,deleted_at) VALUES(u,'avatar-soft-deleted@example.invalid',now());
 denied:=false;
 BEGIN
  PERFORM api.begin_avatar_upload(late_id,u,u::text||'/avatar-'||late_id::text||'.jpg',h,3);
 EXCEPTION WHEN object_not_in_prerequisite_state THEN denied:=true;
 END;
 ASSERT denied AND NOT EXISTS(SELECT 1 FROM internal.avatar_upload_intent WHERE id=late_id), 'soft-deleted account refused';
 ASSERT (SELECT relrowsecurity FROM pg_class WHERE oid='internal.avatar_upload_intent'::regclass);
 ASSERT NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='internal.avatar_upload_intent'::regclass);
 ASSERT NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='internal.avatar_upload_intent'::regclass AND contype='f');
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  ASSERT NOT has_table_privilege(role_name,'internal.avatar_upload_intent','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER');
  ASSERT NOT has_any_column_privilege(role_name,'internal.avatar_upload_intent','SELECT,INSERT,UPDATE,REFERENCES');
  ASSERT NOT has_function_privilege(role_name,'internal.gdpr_assert_no_avatar_upload(uuid)','EXECUTE');
  ASSERT NOT has_function_privilege(role_name,'internal.avatar_subject_lock(uuid)','EXECUTE');
 END LOOP;
 ASSERT NOT has_function_privilege('anon','api.begin_avatar_upload(uuid,uuid,text,text,bigint)','EXECUTE');
 ASSERT NOT has_function_privilege('authenticated','api.begin_avatar_upload(uuid,uuid,text,text,bigint)','EXECUTE');
 ASSERT NOT has_function_privilege('authenticated','api.complete_avatar_upload(uuid,uuid,text,text,bigint)','EXECUTE');
 ASSERT has_function_privilege('service_role','api.begin_avatar_upload(uuid,uuid,text,text,bigint)','EXECUTE');
 ASSERT has_function_privilege('service_role','api.complete_avatar_upload(uuid,uuid,text,text,bigint)','EXECUTE');
END;
$test$;
ROLLBACK;
