-- Hypothetical historical trace only: no current audit trigger is assumed.
-- Metadata fixtures roll back; no Storage/Auth API or bytes are accessed.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL search_path=pg_catalog,pg_temp;
SET LOCAL plpgsql.check_asserts=on;
DO $test$
DECLARE
 a uuid:=gen_random_uuid();
 t uuid:=gen_random_uuid();
 d uuid:=gen_random_uuid();
 receipt uuid:=gen_random_uuid();
 audit_id uuid:=gen_random_uuid();
 report jsonb;
 role_name text;
BEGIN
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 INSERT INTO public.object(id,object_type,name,status) VALUES
  ('HOTRUN999999HR01','HOT','Synthetic historical audit review','draft');
 INSERT INTO public.actor(id,display_name,is_test) VALUES(a,'Synthetic historical subject',false);
 INSERT INTO public.crm_task(id,object_id,actor_id,title)
  VALUES(t,'HOTRUN999999HR01',a,'Synthetic former task');
 INSERT INTO public.ref_document(id,url,title,storage_bucket,storage_path,access_scope,extra)
  VALUES(d,'storage://actor-documents/historical/synthetic.pdf','Synthetic former document',
    'actor-documents','historical/synthetic.pdf','private','{}');
 INSERT INTO internal.crm_document_detachment(id,parent_kind,parent_id,document_id,
  subject_actor_id,storage_bucket,storage_path,detached_by)
  VALUES(receipt,'task',t,d,a,'actor-documents','historical/synthetic.pdf',a);
 DELETE FROM public.crm_task WHERE id=t;
 DELETE FROM public.ref_document WHERE id=d;
 INSERT INTO audit.audit_log(table_name,operation,row_pk,before_data,after_data,changed_by)
  VALUES('crm_task_document','DELETE',jsonb_build_object('id',audit_id),NULL,
    jsonb_build_object('task_id',t,'title','Synthetic historical title'),'fixture');
 ASSERT EXISTS(SELECT 1 FROM audit.audit_log WHERE row_pk->>'id'=audit_id::text
   AND after_data->>'title'='Synthetic historical title'), 'nonempty hypothetical history';
 PERFORM set_config('request.jwt.claims','',true);
 report:=api.rpc_gdpr_erase_subject('actor',a::text,'anonymize','historical receipt review');
 ASSERT report->'manualReviewRequired'='true'::jsonb, 'history cannot silently complete';
 ASSERT report->'crmProvenance'->'historicalTaskAuditReviewIds' ? t::text;
 ASSERT jsonb_array_length(report->'crmProvenance'->'historicalTaskAuditReviewIds')=1;
 ASSERT report->'crmProvenance'->>'detachmentReceipts'='1';
 ASSERT NOT EXISTS(SELECT 1 FROM public.crm_task WHERE id=t);
 ASSERT NOT EXISTS(SELECT 1 FROM public.ref_document WHERE id=d);
 ASSERT EXISTS(SELECT 1 FROM internal.crm_document_detachment WHERE id=receipt AND subject_actor_id IS NULL);
 ASSERT EXISTS(SELECT 1 FROM audit.audit_log WHERE row_pk->>'id'=audit_id::text
   AND after_data->>'title'='Synthetic historical title'), 'no broad historical redaction';
 ASSERT NOT EXISTS(SELECT 1 FROM internal.gdpr_cleanup_task
   WHERE operation_id=(report->>'operationId')::uuid), 'receipt never authorizes provider work';
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  ASSERT NOT has_function_privilege(role_name,'api.rpc_gdpr_erase_subject(text,text,text,text)','EXECUTE');
  ASSERT NOT has_function_privilege(role_name,'api.rpc_gdpr_get_cleanup_status(uuid)','EXECUTE');
  ASSERT NOT has_function_privilege(role_name,'api.rpc_gdpr_ack_cleanup_task(uuid,uuid,boolean,text)','EXECUTE');
 END LOOP;
END;
$test$;
ROLLBACK;
