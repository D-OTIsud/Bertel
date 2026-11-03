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
 ASSERT r->>'enabled'='false' AND r->>'state'='unavailable' AND r->'assessment'='null'::jsonb;
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
 ASSERT r#>>'{operation,state}'='reserved' AND r#>>'{context,providerId}'='00000000-0000-4000-af00-000000000021';
 r:=api.reserve_portal_photo_analysis('HOTRUN999999C502','00000000-0000-4000-af00-000000000001','00000000-0000-4000-af00-000000000011');
 ASSERT r#>>'{operation,requestId}'='00000000-0000-4000-af00-000000000011';
 ASSERT r#>>'{context,path}' LIKE 'portal-photos/%','reserved retry lost its bounded dispatch context';
 r:=api.reserve_portal_photo_analysis('HOTRUN999999C502','00000000-0000-4000-af00-000000000001','00000000-0000-4000-af00-000000000099');
 ASSERT r#>>'{operation,requestId}'='00000000-0000-4000-af00-000000000011','new UUID duplicated an unchanged analysis';
 PERFORM api.reserve_portal_photo_analysis('HOTRUN999999C502','00000000-0000-4000-af00-000000000002','00000000-0000-4000-af00-000000000012');
 r:=api.reserve_portal_photo_analysis('HOTRUN999999C502','00000000-0000-4000-af00-000000000003','00000000-0000-4000-af00-000000000013');
 ASSERT r->>'state'='quota_reached' AND r->>'resetAt' IS NOT NULL;
END; $test$;
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
 BEGIN PERFORM api.finish_portal_photo_analysis('00000000-0000-4000-af00-000000000011','00000000-0000-4000-af00-000000000041',jsonb_set(v_outcome,'{assessment,score}','11'));
 EXCEPTION WHEN invalid_parameter_value THEN v_failed:=true; END; ASSERT v_failed;
 v_failed:=false; BEGIN PERFORM api.finish_portal_photo_analysis('00000000-0000-4000-af00-000000000011','00000000-0000-4000-af00-000000000041',v_outcome||'{"publish":true}');
 EXCEPTION WHEN invalid_parameter_value THEN v_failed:=true; END; ASSERT v_failed;
 r:=api.finish_portal_photo_analysis('00000000-0000-4000-af00-000000000011','00000000-0000-4000-af00-000000000041',v_outcome);
 ASSERT r->>'publication'='office_review' AND r#>>'{assessment,score}'='10';
 PERFORM api.finish_portal_photo_analysis('00000000-0000-4000-af00-000000000011','00000000-0000-4000-af00-000000000041',v_outcome);
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
DO $test$
DECLARE a uuid;b uuid;v_failed boolean:=false;
BEGIN
 a:=api.appeal_portal_photo_analysis('00000000-0000-4000-af00-000000000011','Je souhaite une relecture humaine.','00000000-0000-4000-af00-000000000051');
 b:=api.appeal_portal_photo_analysis('00000000-0000-4000-af00-000000000011','Je souhaite une relecture humaine.','00000000-0000-4000-af00-000000000051');
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
 ASSERT (SELECT count(*) FROM internal.portal_photo_analysis)=3,'appeal started another paid analysis';
END; $test$;

SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-00000000c513","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $test$ DECLARE v_failed boolean:=false; BEGIN
 BEGIN PERFORM api.get_portal_photo_analysis('00000000-0000-4000-af00-000000000011'); EXCEPTION WHEN insufficient_privilege THEN v_failed:=true; END; ASSERT v_failed;
 v_failed:=false;BEGIN PERFORM api.portal_photo_preview('00000000-0000-4000-af00-000000000001');EXCEPTION WHEN insufficient_privilege THEN v_failed:=true;END;ASSERT v_failed;
END; $test$;
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
UPDATE public.ref_document SET extra=jsonb_set(extra,'{upload_sha256}',to_jsonb(repeat('f',64))) WHERE id='00000000-0000-4000-af00-000000000001';
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-00000000c512","role":"authenticated","app_metadata":{"sandbox_discovery":true}}',true);
SET LOCAL ROLE authenticated;
DO $test$ DECLARE v_failed boolean:=false;BEGIN
 ASSERT api.get_portal_photo_analysis('00000000-0000-4000-af00-000000000011')->>'sourceCurrent'='false';
 BEGIN PERFORM api.portal_photo_preview('00000000-0000-4000-af00-000000000001');EXCEPTION WHEN insufficient_privilege THEN v_failed:=true;END;ASSERT v_failed;
END;$test$;
RESET ROLE;
ROLLBACK;
