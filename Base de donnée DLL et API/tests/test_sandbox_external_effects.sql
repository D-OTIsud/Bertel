\set ON_ERROR_STOP on
BEGIN;
SET LOCAL request.jwt.claims='{}';
DO $test$
DECLARE
 v_office uuid:='00000000-0000-4000-a000-000000003801';
 v_discovery uuid:='00000000-0000-4000-a000-000000003802';
 v_recipient uuid:='00000000-0000-4000-a000-000000003803';
 v_real text:='HOTRUN9999993801'; v_test text:='ORGRUN9999993801';
 v_task uuid:=gen_random_uuid(); v_test_task uuid:=gen_random_uuid(); v_discovery_task uuid:=gen_random_uuid();
 v_removed_task uuid:=gen_random_uuid(); v_removed_notification uuid;
 v_ids uuid[]:=ARRAY[]::uuid[]; v_id uuid; v_real_notification uuid; v_blocked uuid[]; v_claim jsonb; v_denied boolean;
BEGIN
 INSERT INTO auth.users(id,email,raw_app_meta_data,raw_user_meta_data) VALUES
  (v_office,'office-3801@example.invalid','{}','{"sandbox_discovery":true}'),
  (v_discovery,'discovery-3802@example.invalid','{"sandbox_discovery":true}','{"sandbox_discovery":false}'),
  (v_recipient,'recipient-3803@example.invalid','{}','{}');
 INSERT INTO public.object(id,object_type,name,status) VALUES
  (v_real,'HOT','Real notification fixture','draft'),(v_test,'ORG','Test notification fixture','draft');
 INSERT INTO public.org_config(org_object_id,is_test_org) VALUES(v_test,true);
 ASSERT (SELECT is_test FROM public.object WHERE id=v_test),'nonempty test realm prerequisite';
 INSERT INTO public.crm_task(id,object_id,title,created_by) VALUES
  (v_task,v_real,'Real task',v_office),(v_test_task,v_test,'Test task',v_office),
  (v_discovery_task,v_real,'Discovery task',v_discovery);
 INSERT INTO public.crm_task(id,object_id,title,created_by) VALUES(v_removed_task,v_real,'Removed source',v_office);

 INSERT INTO public.app_notification(recipient_id,created_by,task_id,kind)
  VALUES(v_recipient,v_discovery,v_task,'crm_task_assigned') RETURNING id INTO v_id;
 v_ids:=array_append(v_ids,v_id);
 INSERT INTO public.app_notification(recipient_id,created_by,task_id,kind)
  VALUES(v_discovery,v_office,v_task,'crm_task_assigned') RETURNING id INTO v_id;
 v_ids:=array_append(v_ids,v_id);
 INSERT INTO public.app_notification(recipient_id,created_by,task_id,kind)
  VALUES(v_recipient,v_office,v_test_task,'crm_task_assigned') RETURNING id INTO v_id;
 v_ids:=array_append(v_ids,v_id);
 INSERT INTO public.app_notification(recipient_id,created_by,payload,kind)
  VALUES(v_recipient,v_office,jsonb_build_object('object_id',v_test),'pending_change_submitted') RETURNING id INTO v_id;
 v_ids:=array_append(v_ids,v_id);
 INSERT INTO public.app_notification(recipient_id,created_by,task_id,kind)
  VALUES(v_recipient,v_office,v_discovery_task,'crm_task_assigned') RETURNING id INTO v_id;
 v_ids:=array_append(v_ids,v_id);
 INSERT INTO public.app_notification(recipient_id,created_by,task_id,payload,kind)
  VALUES(v_recipient,v_office,v_task,'{"sandbox_discovery":true}','crm_task_assigned') RETURNING id INTO v_real_notification;
 INSERT INTO public.app_notification(recipient_id,created_by,task_id,kind)
  VALUES(v_recipient,v_office,v_removed_task,'crm_task_assigned') RETURNING id INTO v_removed_notification;
 ASSERT cardinality(v_ids)=5 AND (SELECT count(*) FROM public.app_notification WHERE id=ANY(v_ids))=5;
 ASSERT (SELECT bool_and(email_effects_blocked AND email_sent_at IS NOT NULL
   AND email_error='sandbox_external_effects_disabled' AND email_claimed_at IS NULL)
   FROM public.app_notification WHERE id=ANY(v_ids)), 'all five trusted contexts must suppress email';
 ASSERT (SELECT NOT email_effects_blocked AND email_sent_at IS NULL FROM public.app_notification WHERE id=v_real_notification),
   'user metadata and arbitrary payload markers must not replace trusted provenance';

 PERFORM set_config('request.jwt.claims',json_build_object('role','service_role')::text,true);
 SET LOCAL ROLE service_role;
 v_blocked:=api.suppress_sandbox_notification_emails(v_ids||v_real_notification);
 ASSERT cardinality(v_blocked)=5 AND v_blocked @> v_ids AND NOT v_real_notification=ANY(v_blocked),
   'final service check returns all blocked IDs, including already terminated envelopes';
 v_claim:=api.claim_unmailed_notifications(100);
 ASSERT v_claim @> jsonb_build_array(jsonb_build_object('notification_id',v_real_notification)),
   'ordinary real email remains claimable: positive control';
 ASSERT v_claim @> jsonb_build_array(jsonb_build_object('notification_id',v_removed_notification));
 ASSERT NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_claim) item
   WHERE (item->>'notification_id')::uuid=ANY(v_ids)), 'blocked discovery events must never be claimed';
 RESET ROLE;

 -- The application may still hold an envelope after its notification/source
 -- disappear. Missing provenance must fail closed, rather than mean "real".
 DELETE FROM public.app_notification WHERE id=v_removed_notification;
 DELETE FROM public.crm_task WHERE id=v_removed_task;
 PERFORM set_config('request.jwt.claims',json_build_object('role','service_role')::text,true);
 SET LOCAL ROLE service_role;
 v_blocked:=api.suppress_sandbox_notification_emails(ARRAY[v_removed_notification]);
 ASSERT v_blocked=ARRAY[v_removed_notification], 'deleted notification/source must suppress an already buffered envelope';
 RESET ROLE;

 -- A genuine pending envelope can become discovery-context AFTER it was claimed.
 -- The final check must catch that change without depending on the triggering caller.
 UPDATE auth.users SET raw_app_meta_data='{"sandbox_discovery":true}' WHERE id=v_office;
 PERFORM set_config('request.jwt.claims',json_build_object('role','service_role')::text,true);
 SET LOCAL ROLE service_role;
 v_blocked:=api.suppress_sandbox_notification_emails(ARRAY[v_real_notification]);
 ASSERT v_blocked=ARRAY[v_real_notification], 'final check suppresses an already buffered envelope after a trusted context change';
 RESET ROLE;
 ASSERT (SELECT email_effects_blocked AND email_sent_at IS NOT NULL AND email_claimed_at IS NULL
   FROM public.app_notification WHERE id=v_real_notification);

 -- Source disappearance and an attempted flag reset cannot revive old demo mail.
 PERFORM set_config('request.jwt.claims','{}',true);
 UPDATE auth.users SET raw_app_meta_data='{}' WHERE id IN(v_discovery,v_office);
 DELETE FROM public.org_config WHERE org_object_id=v_test;
 UPDATE public.app_notification SET email_effects_blocked=false,email_sent_at=NULL,email_error=NULL WHERE id=ANY(v_ids);
 ASSERT (SELECT bool_and(email_effects_blocked AND email_sent_at IS NOT NULL) FROM public.app_notification WHERE id=ANY(v_ids)),
   'suppression provenance is durable and monotonic';
 ASSERT (SELECT count(*) FROM public.app_notification WHERE id=ANY(v_ids))=5,'in-app notifications are preserved';

 ASSERT NOT has_function_privilege('anon','api.suppress_sandbox_notification_emails(uuid[])','EXECUTE');
 ASSERT NOT has_function_privilege('authenticated','api.suppress_sandbox_notification_emails(uuid[])','EXECUTE');
 ASSERT has_function_privilege('service_role','api.suppress_sandbox_notification_emails(uuid[])','EXECUTE');
 PERFORM set_config('request.jwt.claims',json_build_object('sub',v_office,'role','authenticated')::text,true);
 SET LOCAL ROLE authenticated;
 v_denied:=false;
 BEGIN PERFORM api.suppress_sandbox_notification_emails(v_ids); EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
 ASSERT v_denied,'ordinary users cannot invoke the service-only email policy';
 RESET ROLE;
 RAISE NOTICE 'sandbox external effects: trusted contexts, positive claim, replay, durable provenance and client denial passed';
END;
$test$;
ROLLBACK;
