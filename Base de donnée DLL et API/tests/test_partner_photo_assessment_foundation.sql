\set ON_ERROR_STOP on
\ir assert_partner_api_ephemeral.sql
-- Run setup_partner_photo_stock first; fixtures below roll back. No actual provider call.
BEGIN;
SET LOCAL statement_timeout='30s';
DO $test$ BEGIN
 ASSERT EXISTS(SELECT 1 FROM internal.portal_photo_analysis_settings WHERE singleton AND NOT enabled AND daily_analysis_limit IS NULL AND provider_id IS NULL),'foundation enabled a provider/budget';
 ASSERT NOT has_table_privilege('authenticated','internal.portal_photo_analysis','SELECT,INSERT,UPDATE,DELETE');
 ASSERT NOT has_function_privilege('authenticated','api.finish_portal_photo_analysis(uuid,uuid,jsonb)','execute');
 ASSERT NOT has_function_privilege('anon','api.get_portal_photo_analysis(uuid)','execute');
 ASSERT NOT EXISTS(SELECT 1 FROM pg_constraint c WHERE c.conrelid='internal.portal_photo_analysis'::regclass AND c.contype='f'
  AND NOT EXISTS(SELECT 1 FROM pg_index i WHERE i.indrelid=c.conrelid AND i.indisvalid AND i.indpred IS NULL AND i.indkey[0]=c.conkey[1])),
  'photo analysis FK lacks a complete leading-column index for cascade/SET NULL';
 ASSERT internal.photo_analysis_local_day('2026-11-03 19:59:59+00')='2026-11-03'::date;
 ASSERT internal.photo_analysis_local_day('2026-11-03 20:00:00+00')='2026-11-04'::date;
 ASSERT internal.photo_analysis_reset_at('2026-11-03')='2026-11-03 20:00:00+00'::timestamptz;
END; $test$;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-00000000c511","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $test$ DECLARE n integer; BEGIN
 FOR n IN 1..3 LOOP PERFORM api.reserve_portal_photo_upload('HOTRUN999999C502',('00000000-0000-4000-af00-'||lpad(n::text,12,'0'))::uuid); END LOOP;
END; $test$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
DO $test$ DECLARE n integer; BEGIN
 FOR n IN 1..3 LOOP PERFORM api.complete_portal_photo_upload('00000000-0000-4000-a000-00000000c511',('00000000-0000-4000-af00-'||lpad(n::text,12,'0'))::uuid,repeat(n::text,64),'Assessment fixture '||n,1800,1200); END LOOP;
END; $test$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-00000000c511","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $test$ DECLARE r jsonb; BEGIN
 r:=api.reserve_portal_photo_analysis('HOTRUN999999C502','00000000-0000-4000-af00-000000000001','00000000-0000-4000-af00-000000000011');
 ASSERT r->>'enabled'='false' AND r->>'created'='false' AND r->>'state'='unavailable' AND r->'assessment'='null'::jsonb
  AND NOT(r ? 'context') AND NOT(r ? 'operation');
END; $test$;
RESET ROLE;
DO $test$ BEGIN
 ASSERT (SELECT count(*) FROM internal.portal_photo_analysis)=0,'OFF reserved or consumed analysis budget';
 ASSERT internal.gallery_photo_usage('HOTRUN999999C502')=3,'analysis disabled photo stock';
END; $test$;

-- Isolated fixture activation only, rolled back. Not an actual provider configuration.
UPDATE public.app_ai_provider_config SET is_active=false WHERE is_active;
INSERT INTO public.app_ai_provider_config(id,label,api_kind,base_url,model,max_output_tokens,is_active)
 VALUES('00000000-0000-4000-af00-000000000021','Disposable photo fixture','openai_compatible','https://provider.invalid/v1','fixture-vision',1024,true);
UPDATE internal.portal_photo_analysis_settings SET enabled=true,daily_analysis_limit=2,provider_id='00000000-0000-4000-af00-000000000021';
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-00000000c511","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $test$ DECLARE r jsonb; BEGIN
 r:=api.reserve_portal_photo_analysis('HOTRUN999999C502','00000000-0000-4000-af00-000000000001','00000000-0000-4000-af00-000000000011');
 ASSERT r->>'created'='true' AND r#>>'{operation,state}'='reserved' AND r#>>'{context,providerId}'='00000000-0000-4000-af00-000000000021';
 r:=api.reserve_portal_photo_analysis('HOTRUN999999C502','00000000-0000-4000-af00-000000000001','00000000-0000-4000-af00-000000000011');
 ASSERT r->>'created'='false' AND r#>>'{operation,requestId}'='00000000-0000-4000-af00-000000000011';
 ASSERT r#>>'{context,path}' LIKE 'portal-photos/%','reserved retry lost its bounded dispatch context';
 r:=api.reserve_portal_photo_analysis('HOTRUN999999C502','00000000-0000-4000-af00-000000000001','00000000-0000-4000-af00-000000000099');
 ASSERT r->>'created'='false' AND r#>>'{operation,requestId}'='00000000-0000-4000-af00-000000000011','new UUID duplicated an unchanged analysis';
 PERFORM api.reserve_portal_photo_analysis('HOTRUN999999C502','00000000-0000-4000-af00-000000000002','00000000-0000-4000-af00-000000000012');
 r:=api.reserve_portal_photo_analysis('HOTRUN999999C502','00000000-0000-4000-af00-000000000003','00000000-0000-4000-af00-000000000013');
 ASSERT r->>'created'='false' AND r->>'state'='quota_reached' AND r->>'resetAt' IS NOT NULL;
END; $test$;
RESET ROLE;

-- OFF also hides an earlier reservation's context. It does not mutate that receipt.
SAVEPOINT p_off_existing;
UPDATE internal.portal_photo_analysis_settings SET enabled=false;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-00000000c511","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $test$ DECLARE r jsonb;BEGIN
 r:=api.reserve_portal_photo_analysis('HOTRUN999999C502','00000000-0000-4000-af00-000000000001','00000000-0000-4000-af00-000000000011');
 ASSERT r->>'enabled'='false' AND r->>'created'='false' AND NOT(r ? 'context') AND NOT(r ? 'operation');
END;$test$;
RESET ROLE;
DO $test$ BEGIN ASSERT (SELECT state='reserved' FROM internal.portal_photo_analysis WHERE id='00000000-0000-4000-af00-000000000011');END;$test$;
ROLLBACK TO SAVEPOINT p_off_existing;
RELEASE SAVEPOINT p_off_existing;

-- A stale provider revision is cancelled before any provider start, even on replay.
SAVEPOINT p_provider_revision;
UPDATE internal.portal_photo_analysis SET provider_revision=provider_revision-interval '1 second' WHERE id='00000000-0000-4000-af00-000000000011';
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-00000000c511","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $test$ DECLARE r jsonb;BEGIN
 r:=api.reserve_portal_photo_analysis('HOTRUN999999C502','00000000-0000-4000-af00-000000000001','00000000-0000-4000-af00-000000000011');
 ASSERT r->>'created'='false' AND r#>>'{operation,state}'='unavailable' AND NOT(r ? 'context');
END;$test$;
RESET ROLE;
DO $test$ BEGIN ASSERT (SELECT started_at IS NULL FROM internal.portal_photo_analysis WHERE id='00000000-0000-4000-af00-000000000011');END;$test$;
ROLLBACK TO SAVEPOINT p_provider_revision;
RELEASE SAVEPOINT p_provider_revision;

-- Yesterday's preparation must not dispatch when today's complete budget is used.
SAVEPOINT p_midnight_full;
INSERT INTO internal.portal_photo_analysis(id,object_id,document_id,actor_id,created_by,source_sha256,local_day,provider_id,provider_revision)
 SELECT '00000000-0000-4000-af00-000000000014','HOTRUN999999C502','00000000-0000-4000-af00-000000000003',
 '00000000-0000-4000-a000-00000000c521','00000000-0000-4000-a000-00000000c511',repeat('3',64),internal.photo_analysis_local_day(now())-1,id,updated_at
 FROM public.app_ai_provider_config WHERE id='00000000-0000-4000-af00-000000000021';
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-00000000c511","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $test$ DECLARE r jsonb;BEGIN
 r:=api.start_portal_photo_analysis('00000000-0000-4000-af00-000000000014','00000000-0000-4000-af00-000000000044');
 ASSERT r->>'started'='false' AND r->>'quotaReached'='true' AND r#>>'{operation,state}'='unavailable';
END;$test$;
RESET ROLE;
DO $test$ BEGIN ASSERT (SELECT started_at IS NULL FROM internal.portal_photo_analysis WHERE id='00000000-0000-4000-af00-000000000014');END;$test$;
ROLLBACK TO SAVEPOINT p_midnight_full;
RELEASE SAVEPOINT p_midnight_full;
RESET ROLE;
DO $test$ BEGIN
 ASSERT (SELECT count(*) FROM internal.portal_photo_analysis)=2;
 ASSERT internal.gallery_photo_usage('HOTRUN999999C502')=3,'analysis quota prevented a private upload';
END; $test$;

-- Move a preparation across midnight, without changing the system clock. Dispatch
-- must debit the current day atomically under the same actor lock.
UPDATE internal.portal_photo_analysis SET local_day=local_day-1 WHERE id='00000000-0000-4000-af00-000000000011';
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-00000000c511","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $test$ DECLARE r jsonb; BEGIN
 r:=api.start_portal_photo_analysis('00000000-0000-4000-af00-000000000011','00000000-0000-4000-af00-000000000041'); ASSERT r->>'started'='true';
 r:=api.start_portal_photo_analysis('00000000-0000-4000-af00-000000000011','00000000-0000-4000-af00-000000000042'); ASSERT r->>'started'='false','duplicate provider dispatch';
END; $test$;
DO $test$ DECLARE v_failed boolean:=false;BEGIN
 BEGIN PERFORM api.appeal_portal_photo_analysis('00000000-0000-4000-af00-000000000011','Too early','00000000-0000-4000-af00-000000000061');EXCEPTION WHEN SQLSTATE 'PT409' THEN v_failed:=true;END;
 ASSERT v_failed,'recent running attempt accepted an appeal';
END;$test$;
RESET ROLE;
DO $test$ BEGIN
 ASSERT (SELECT local_day=internal.photo_analysis_local_day(now()) FROM internal.portal_photo_analysis WHERE id='00000000-0000-4000-af00-000000000011');
END; $test$;

-- A score, including ten, is never a publication decision. Strict SQL validates the
-- same bounded result as TypeScript; unknown decision fields cannot be persisted.
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
DO $test$
DECLARE r jsonb; v_failed boolean:=false;v_outcome jsonb:='{"state":"assessed","assessment":{"score":10,"summary":"Photo nette","strengths":["Le sujet est lisible"],"issues":[]},"publication":"office_review"}';
BEGIN
 BEGIN PERFORM api.finish_portal_photo_analysis('00000000-0000-4000-af00-000000000011','00000000-0000-4000-af00-000000000042',v_outcome);
 EXCEPTION WHEN SQLSTATE 'PT409' THEN v_failed:=true;END;ASSERT v_failed,'wrong provider claim accepted';
 v_failed:=false;
 BEGIN PERFORM api.finish_portal_photo_analysis('00000000-0000-4000-af00-000000000011','00000000-0000-4000-af00-000000000041','{"state":"unavailable","assessment":null,"publication":"office_review"}');
 EXCEPTION WHEN SQLSTATE 'PT409' THEN v_failed:=true;END;ASSERT v_failed,'started attempt released its budget as unavailable';
 v_failed:=false;
 BEGIN PERFORM api.finish_portal_photo_analysis('00000000-0000-4000-af00-000000000011','00000000-0000-4000-af00-000000000041',jsonb_set(v_outcome,'{assessment,score}','11'));
 EXCEPTION WHEN invalid_parameter_value THEN v_failed:=true; END; ASSERT v_failed;
 v_failed:=false; BEGIN PERFORM api.finish_portal_photo_analysis('00000000-0000-4000-af00-000000000011','00000000-0000-4000-af00-000000000041',v_outcome||'{"publish":true}');
 EXCEPTION WHEN invalid_parameter_value THEN v_failed:=true; END; ASSERT v_failed;
 r:=api.finish_portal_photo_analysis('00000000-0000-4000-af00-000000000011','00000000-0000-4000-af00-000000000041',v_outcome);
 ASSERT r->>'publication'='office_review' AND r#>>'{assessment,score}'='10';
 PERFORM api.finish_portal_photo_analysis('00000000-0000-4000-af00-000000000011','00000000-0000-4000-af00-000000000041',v_outcome);
 v_failed:=false;BEGIN PERFORM api.finish_portal_photo_analysis('00000000-0000-4000-af00-000000000011','00000000-0000-4000-af00-000000000042',v_outcome);
 EXCEPTION WHEN SQLSTATE 'PT409' THEN v_failed:=true;END;ASSERT v_failed,'terminal receipt accepted a wrong claim';
 -- Preparation failure is safely not billed; no provider attempt exists for op 12.
 PERFORM api.finish_portal_photo_analysis('00000000-0000-4000-af00-000000000012',NULL,'{"state":"unavailable","assessment":null,"publication":"office_review"}');
END; $test$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-00000000c511","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT api.reserve_portal_photo_analysis('HOTRUN999999C502','00000000-0000-4000-af00-000000000003','00000000-0000-4000-af00-000000000013');
SELECT api.start_portal_photo_analysis('00000000-0000-4000-af00-000000000013','00000000-0000-4000-af00-000000000043');
RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
SELECT api.finish_portal_photo_analysis('00000000-0000-4000-af00-000000000013','00000000-0000-4000-af00-000000000043','{"state":"uncertain","assessment":null,"publication":"office_review"}');
RESET ROLE;
DO $test$ BEGIN
 ASSERT (SELECT count(*) FROM public.media WHERE object_id='HOTRUN999999C502')=0,'assessment auto-published a photo';
 ASSERT (SELECT count(*) FROM internal.portal_photo_analysis WHERE state<>'unavailable')=2,'uncertain provider spend released its budget';
END; $test$;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-00000000c512","role":"authenticated","app_metadata":{"sandbox_discovery":true}}',true);
SET LOCAL ROLE authenticated;
DO $test$ DECLARE v_failed boolean:=false;BEGIN
 BEGIN PERFORM api.get_portal_photo_analysis('00000000-0000-4000-af00-000000000011');EXCEPTION WHEN insufficient_privilege THEN v_failed:=true;END;
 ASSERT v_failed,'office read an assessment without a concrete appeal';v_failed:=false;
 BEGIN PERFORM api.portal_photo_preview('00000000-0000-4000-af00-000000000001');EXCEPTION WHEN insufficient_privilege THEN v_failed:=true;END;
 ASSERT v_failed,'private photo accessible to office before a concrete appeal or B proposal';
END; $test$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-00000000c511","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $test$ DECLARE r jsonb; BEGIN
 r:=api.reserve_portal_photo_analysis('HOTRUN999999C502','00000000-0000-4000-af00-000000000003','00000000-0000-4000-af00-000000000098');
 ASSERT r#>>'{operation,requestId}'='00000000-0000-4000-af00-000000000013' AND r#>>'{operation,state}'='uncertain';
END; $test$;

-- Human appeal is a single existing portal-message conversation, with typed
-- document/assessment association; no incompatible attachment or paid analysis.
-- The office fixture is a real verifier, so notification assertions cannot pass
-- merely because the recipient set was empty.
DO $test$ BEGIN
 ASSERT EXISTS(SELECT 1 FROM api.list_object_verifier_ids('HOTRUN999999C502') reviewer
  WHERE reviewer='00000000-0000-4000-a000-00000000c512'::uuid),'missing appeal reviewer fixture';
END; $test$;
DO $test$
DECLARE a uuid;b uuid;v_failed boolean:=false;
BEGIN
 a:=api.appeal_portal_photo_analysis('00000000-0000-4000-af00-000000000011','Message privé CI : recours-photo@example.test','00000000-0000-4000-af00-000000000051');
 b:=api.appeal_portal_photo_analysis('00000000-0000-4000-af00-000000000011','Message privé CI : recours-photo@example.test','00000000-0000-4000-af00-000000000051');
 ASSERT a=b;
 BEGIN PERFORM api.appeal_portal_photo_analysis('00000000-0000-4000-af00-000000000011','Autre demande','00000000-0000-4000-af00-000000000051'); EXCEPTION WHEN SQLSTATE 'PT409' THEN v_failed:=true; END;ASSERT v_failed;
 ASSERT api.get_portal_photo_analysis('00000000-0000-4000-af00-000000000011')->>'appealInteractionId'=a::text;
 ASSERT EXISTS(SELECT 1 FROM jsonb_array_elements(api.list_my_portal_messages('HOTRUN999999C502')) x WHERE x->>'id'=a::text),'appeal absent from existing follow-up';
END; $test$;
RESET ROLE;
DO $test$ BEGIN
 ASSERT (SELECT count(*) FROM public.crm_interaction WHERE extra->>'portal_photo_analysis_id'='00000000-0000-4000-af00-000000000011')=1;
 ASSERT EXISTS(SELECT 1 FROM public.crm_interaction WHERE extra->>'portal_photo_analysis_id'='00000000-0000-4000-af00-000000000011'
  AND extra->>'portal_photo_document_id'='00000000-0000-4000-af00-000000000001' AND extra->'attachment_ids'='[]'::jsonb AND source='portal');
 ASSERT EXISTS(SELECT 1 FROM public.crm_interaction WHERE extra->>'portal_photo_analysis_id'='00000000-0000-4000-af00-000000000011'
  AND extra->>'portal_subject'='correction'),'appeal changed the existing message subject contract';
 ASSERT EXISTS(SELECT 1 FROM public.app_notification n JOIN internal.portal_photo_analysis p ON n.payload->>'interaction_id'=p.appeal_interaction_id::text
  WHERE p.id='00000000-0000-4000-af00-000000000011' AND n.kind='portal_message'
   AND n.recipient_id='00000000-0000-4000-a000-00000000c512'),'appeal failed to emit the existing reviewer notification';
 ASSERT NOT EXISTS(SELECT 1 FROM public.app_notification n JOIN internal.portal_photo_analysis p ON n.payload->>'interaction_id'=p.appeal_interaction_id::text
  WHERE p.id='00000000-0000-4000-af00-000000000011' AND n.kind<>'portal_message'),'appeal invented a notification kind';
 ASSERT (SELECT count(*) FROM internal.portal_photo_analysis)=3,'appeal started another paid analysis';
 ASSERT EXISTS(SELECT 1 FROM internal.portal_photo_analysis WHERE id='00000000-0000-4000-af00-000000000011'
  AND appeal_intent_hash=encode(sha256(convert_to(jsonb_build_array('00000000-0000-4000-af00-000000000011'::uuid,
   '00000000-0000-4000-af00-000000000051'::uuid,'Message privé CI : recours-photo@example.test')::text,'UTF8')),'hex')),
  'appeal intent receipt does not match the exact confirmed request';
 ASSERT NOT EXISTS(SELECT 1 FROM internal.portal_photo_analysis p WHERE to_jsonb(p)::text LIKE '%recours-photo@example.test%'),'P duplicates the free text outside CRM';
END; $test$;

SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-00000000c513","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $test$ DECLARE v_failed boolean:=false; BEGIN
 BEGIN PERFORM api.get_portal_photo_analysis('00000000-0000-4000-af00-000000000011'); EXCEPTION WHEN insufficient_privilege THEN v_failed:=true; END; ASSERT v_failed;
 v_failed:=false;BEGIN PERFORM api.portal_photo_preview('00000000-0000-4000-af00-000000000001');EXCEPTION WHEN insufficient_privilege THEN v_failed:=true;END;ASSERT v_failed;
END; $test$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-00000000c512","role":"authenticated","app_metadata":{"sandbox_discovery":false}}',true);
SET LOCAL ROLE authenticated;
DO $test$ DECLARE v_failed boolean:=false;BEGIN
 BEGIN PERFORM api.get_portal_photo_analysis('00000000-0000-4000-af00-000000000011');EXCEPTION WHEN insufficient_privilege THEN v_failed:=true;END;
 ASSERT v_failed,'assessment crossed the corrector test realm';
END;$test$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-00000000c512","role":"authenticated","app_metadata":{"sandbox_discovery":true}}',true);
SET LOCAL ROLE authenticated;
DO $test$ BEGIN
 ASSERT api.get_portal_photo_analysis('00000000-0000-4000-af00-000000000011')->>'publication'='office_review';
 ASSERT api.get_portal_photo_analysis('00000000-0000-4000-af00-000000000011')->>'sourceCurrent'='true';
 ASSERT api.portal_photo_preview('00000000-0000-4000-af00-000000000001')->>'bucket'='actor-documents','office cannot inspect the appealed photo through existing private preview';
END; $test$;
RESET ROLE;
-- If a privileged repair changes the source, the old analysis is labelled stale
-- and the appeal does not silently sign different bytes as its original photo.
SAVEPOINT p_changed_photo_source;
UPDATE public.ref_document SET extra=jsonb_set(extra,'{upload_sha256}',to_jsonb(repeat('f',64))) WHERE id='00000000-0000-4000-af00-000000000001';
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-00000000c512","role":"authenticated","app_metadata":{"sandbox_discovery":true}}',true);
SET LOCAL ROLE authenticated;
DO $test$ DECLARE v_failed boolean:=false;BEGIN
 ASSERT api.get_portal_photo_analysis('00000000-0000-4000-af00-000000000011')->>'sourceCurrent'='false';
 BEGIN PERFORM api.portal_photo_preview('00000000-0000-4000-af00-000000000001');EXCEPTION WHEN insufficient_privilege THEN v_failed:=true;END;ASSERT v_failed;
END;$test$;
RESET ROLE;
ROLLBACK TO SAVEPOINT p_changed_photo_source;
RELEASE SAVEPOINT p_changed_photo_source;
-- The existing anonymize RPC deliberately retains a document linked to another
-- actor. Its CASCADE therefore cannot be used to erase a duplicated P message.
INSERT INTO public.actor_document(actor_id,document_id,created_by,title) VALUES
 ('00000000-0000-4000-a000-00000000c523','00000000-0000-4000-af00-000000000001','00000000-0000-4000-a000-00000000c513','Shared retained fixture');
CREATE TEMP TABLE p_erasure_receipt AS SELECT id,appeal_interaction_id,appeal_client_id,appeal_intent_hash FROM internal.portal_photo_analysis WHERE id='00000000-0000-4000-af00-000000000011';
DO $test$ BEGIN
 ASSERT EXISTS(SELECT 1 FROM public.crm_interaction c JOIN p_erasure_receipt p ON p.appeal_interaction_id=c.id WHERE c.body LIKE '%recours-photo@example.test%'),'missing pre-erasure message marker';
END;$test$;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-00000000c512","role":"authenticated","app_metadata":{"sandbox_discovery":true}}',true);
SET LOCAL ROLE authenticated;
DO $test$ BEGIN
 ASSERT api.get_portal_photo_analysis('00000000-0000-4000-af00-000000000011')->>'sourceCurrent'='true','erasure fixture did not restore the original source hash';
 ASSERT api.portal_photo_preview('00000000-0000-4000-af00-000000000001')->>'bucket'='actor-documents','office access must exist immediately before anonymize';
END;$test$;
SELECT api.rpc_gdpr_erase_subject('actor','00000000-0000-4000-a000-00000000c521','anonymize','Disposable photo-appeal erasure fixture');
RESET ROLE;
DO $test$ BEGIN
 ASSERT EXISTS(SELECT 1 FROM public.ref_document WHERE id='00000000-0000-4000-af00-000000000001'),'shared document was unexpectedly removed';
 ASSERT EXISTS(SELECT 1 FROM public.crm_interaction c JOIN p_erasure_receipt p ON p.appeal_interaction_id=c.id WHERE c.body IS NULL AND c.actor_id IS NULL AND c.extra IS NULL),'CRM text was not erased';
 ASSERT EXISTS(SELECT 1 FROM internal.portal_photo_analysis a JOIN p_erasure_receipt p ON p.id=a.id
  WHERE a.appeal_interaction_id=p.appeal_interaction_id AND a.appeal_client_id=p.appeal_client_id AND a.appeal_intent_hash=p.appeal_intent_hash),'retained analysis lost its coherent appeal receipt';
 ASSERT EXISTS(SELECT 1 FROM public.ref_document d JOIN internal.portal_photo_analysis a ON a.document_id=d.id
  WHERE a.id='00000000-0000-4000-af00-000000000011' AND d.extra->>'upload_sha256'=a.source_sha256),'anonymize changed the source hash, masking the appeal-access revocation';
 ASSERT NOT EXISTS(SELECT 1 FROM internal.portal_photo_analysis p WHERE to_jsonb(p)::text LIKE '%recours-photo@example.test%'),'free-text appeal survived anonymize in P';
 ASSERT NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='internal' AND table_name='portal_photo_analysis' AND column_name='appeal_body'),'P still has a duplicate appeal body column';
 ASSERT (SELECT actor_id IS NULL FROM public.app_user_profile WHERE id='00000000-0000-4000-a000-00000000c511');
END;$test$;
SET LOCAL ROLE authenticated;
DO $test$ DECLARE v_failed boolean:=false;BEGIN
 BEGIN PERFORM api.get_portal_photo_analysis('00000000-0000-4000-af00-000000000011');EXCEPTION WHEN insufficient_privilege THEN v_failed:=true;END;
 ASSERT v_failed,'office read an assessment after its CRM appeal association was erased';
 v_failed:=false;
 BEGIN PERFORM api.portal_photo_preview('00000000-0000-4000-af00-000000000001');EXCEPTION WHEN insufficient_privilege THEN v_failed:=true;END;
 ASSERT v_failed,'office preview survived erasure of its CRM appeal association with an unchanged source';
END;$test$;
RESET ROLE;
ROLLBACK;
