\set ON_ERROR_STOP on
\ir assert_partner_api_ephemeral.sql
-- Run after setup_partner_photo_stock + R5 cutover. All mutations below roll back.
BEGIN;
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='5s';
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-00000000c511","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT api.reserve_portal_photo_upload('HOTRUN999999C501','00000000-0000-4000-a000-00000000c531');
-- Same intention is idempotent and does not consume a second slot.
SELECT api.reserve_portal_photo_upload('HOTRUN999999C501','00000000-0000-4000-a000-00000000c531');
DO $test$
DECLARE v_failed boolean:=false; v_detail text;
BEGIN
 BEGIN PERFORM api.reserve_portal_photo_upload('HOTRUN999999C501','00000000-0000-4000-a000-00000000c532');
 EXCEPTION WHEN SQLSTATE 'PT409' THEN GET STACKED DIAGNOSTICS v_detail=PG_EXCEPTION_DETAIL; v_failed:=v_detail='photo_limit'; END;
 ASSERT v_failed,'twenty-first reservation not refused by total quota';
END;
$test$;
RESET ROLE;
DO $test$ BEGIN
 ASSERT internal.gallery_photo_usage('HOTRUN999999C501')=20;
 ASSERT (SELECT count(*) FROM public.ref_document WHERE id='00000000-0000-4000-a000-00000000c531')=1;
 ASSERT NOT EXISTS(SELECT 1 FROM public.ref_document WHERE id='00000000-0000-4000-a000-00000000c532'),'failed reservation left a receipt';
END; $test$;

-- A concurrent office intention cannot consume a reserved slot.
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-00000000c512","role":"authenticated","app_metadata":{"sandbox_discovery":true}}',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE v_failed boolean:=false; v_type uuid;
BEGIN
 SELECT id INTO v_type FROM public.ref_code_media_type WHERE code='photo';
 BEGIN PERFORM api.save_object_gallery('HOTRUN999999C501',jsonb_build_object('write_contract','gallery-patch-v1','request_id','00000000-0000-4000-a000-00000000c601',
  'rows',jsonb_build_array(jsonb_build_object('id','00000000-0000-4000-a000-00000000c541','expected',NULL,
   'changes',jsonb_build_object('media_type_id',v_type,'url','https://example.test/office-quota.jpg','visibility','public','is_published',true))), 'deleted','[]'::jsonb));
 EXCEPTION WHEN SQLSTATE 'PT409' THEN v_failed:=true; END;
 ASSERT v_failed,'office writer ignored a partner reservation';
 -- Old office DML is closed only for root photo writes.
 v_failed:=false;
 BEGIN INSERT INTO public.media(object_id,media_type_id,url,visibility) VALUES('HOTRUN999999C501',v_type,'https://example.test/raw-bypass.jpg','public');
 EXCEPTION WHEN insufficient_privilege THEN v_failed:=true; END;
 ASSERT v_failed,'old root-photo INSERT remains open';
 UPDATE public.media SET title='forged' WHERE id='00000000-0000-4000-a501-000000000001';
 DELETE FROM public.media WHERE id='00000000-0000-4000-a501-000000000002';
 v_failed:=false;
 BEGIN INSERT INTO public.ref_document(url,extra) VALUES('storage://actor-documents/forged','{"source":"portal_photo","object_id":"HOTRUN999999C501"}');
 EXCEPTION WHEN insufficient_privilege THEN v_failed:=true; END;
 ASSERT v_failed,'slot proof can be forged through ordinary document DML';
END;
$test$;
RESET ROLE;
DO $test$ BEGIN
 ASSERT (SELECT count(*) FROM public.media WHERE object_id='HOTRUN999999C501')=19;
 ASSERT (SELECT title IS DISTINCT FROM 'forged' FROM public.media WHERE id='00000000-0000-4000-a501-000000000001');
 ASSERT NOT EXISTS(SELECT 1 FROM internal.gallery_write_receipt WHERE request_id='00000000-0000-4000-a000-00000000c601'),'failed office request persisted';
END; $test$;

-- A different partner cannot reserve/cancel on the fiche; the owner can release the slot.
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-00000000c513","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $test$ DECLARE v_failed boolean:=false; BEGIN
 BEGIN PERFORM api.cancel_portal_photo_upload('HOTRUN999999C501','00000000-0000-4000-a000-00000000c531'); EXCEPTION WHEN insufficient_privilege THEN v_failed:=true; END;
 ASSERT v_failed;
END; $test$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-00000000c511","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $test$ BEGIN
 ASSERT api.cancel_portal_photo_upload('HOTRUN999999C501','00000000-0000-4000-a000-00000000c531')->>'cancelled'='true';
 ASSERT api.cancel_portal_photo_upload('HOTRUN999999C501','00000000-0000-4000-a000-00000000c531')->>'cancelled'='true';
 ASSERT api.cancel_portal_photo_upload('HOTRUN999999C501','00000000-0000-4000-a000-00000000c599')->>'cancelled'='true';
END; $test$;
RESET ROLE;
DO $test$ BEGIN ASSERT internal.gallery_photo_usage('HOTRUN999999C501')=19; END; $test$;

-- Twenty first uploads on an empty fiche are allowed without an AI assessment.
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-00000000c511","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE n integer; v_failed boolean:=false;
BEGIN
 FOR n IN 1..20 LOOP
  PERFORM api.reserve_portal_photo_upload('HOTRUN999999C502',('00000000-0000-4000-a502-'||lpad(n::text,12,'0'))::uuid);
 END LOOP;
 BEGIN PERFORM api.reserve_portal_photo_upload('HOTRUN999999C502','00000000-0000-4000-a502-000000000021'); EXCEPTION WHEN SQLSTATE 'PT409' THEN v_failed:=true; END;
 ASSERT v_failed;
END;
$test$;
RESET ROLE;
DO $test$ BEGIN ASSERT internal.gallery_photo_usage('HOTRUN999999C502')=20; END; $test$;

-- Replacement at twenty has delta zero, duplicate target is rejected.
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-00000000c511","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT api.reserve_portal_photo_upload('HOTRUN999999C503','00000000-0000-4000-a000-00000000c551','00000000-0000-4000-a503-000000000001');
DO $test$ DECLARE v_failed boolean:=false; BEGIN
 BEGIN PERFORM api.reserve_portal_photo_upload('HOTRUN999999C503','00000000-0000-4000-a000-00000000c552','00000000-0000-4000-a503-000000000001'); EXCEPTION WHEN SQLSTATE 'PT409' THEN v_failed:=true; END;
 ASSERT v_failed;
END; $test$;
RESET ROLE;
DO $test$ BEGIN ASSERT internal.gallery_photo_usage('HOTRUN999999C503')=20; ASSERT internal.gallery_published_photo_count('HOTRUN999999C503')=20; END; $test$;

-- Only trusted server finalization attests processed bytes. It rechecks the registered person.
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
DO $test$ DECLARE v_failed boolean:=false; BEGIN
 BEGIN PERFORM api.complete_portal_photo_upload('00000000-0000-4000-a000-00000000c513','00000000-0000-4000-a000-00000000c551',repeat('a',64),'Wrong',1800,1200); EXCEPTION WHEN insufficient_privilege THEN v_failed:=true; END;
 ASSERT v_failed,'service transport substituted for the uploader';
 PERFORM api.complete_portal_photo_upload('00000000-0000-4000-a000-00000000c511','00000000-0000-4000-a000-00000000c551',repeat('a',64),'Replacement',1800,1200);
 PERFORM api.complete_portal_photo_upload('00000000-0000-4000-a000-00000000c511','00000000-0000-4000-a000-00000000c551',repeat('a',64),'Replacement',1800,1200);
 v_failed:=false;
 BEGIN PERFORM api.complete_portal_photo_upload('00000000-0000-4000-a000-00000000c511','00000000-0000-4000-a000-00000000c551',repeat('b',64),'Changed bytes',1800,1200); EXCEPTION WHEN SQLSTATE 'PT409' THEN v_failed:=true; END;
 ASSERT v_failed,'retry overwrote another file';
END; $test$;
RESET ROLE;

-- The real B submission/approval still applies; the public copy proof is simulated only here.
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-00000000c511","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT api.submit_actor_fiche('HOTRUN999999C503',jsonb_build_array(jsonb_build_object('target_table','media','action','update',
 'payload',jsonb_build_object('additions',jsonb_build_array(jsonb_build_object('upload_id','00000000-0000-4000-a000-00000000c551','credit','CI author','replace_media_id','00000000-0000-4000-a503-000000000001'))),
 'metadata',jsonb_build_object('section','media','rpc','publish_portal_photo_additions','field','Vos photos'))),NULL);
RESET ROLE;
DO $test$ BEGIN
 ASSERT (SELECT is_published FROM public.media WHERE id='00000000-0000-4000-a503-000000000001'),'old photo withdrawn before B approval';
END; $test$;
SELECT set_config('bertel.r5_submission_c503',(SELECT id::text FROM public.fiche_submission WHERE object_id='HOTRUN999999C503' AND status='pending'),true);
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-00000000c512","role":"authenticated","app_metadata":{"sandbox_discovery":true}}',true);
SET LOCAL ROLE authenticated;
SELECT api.prepare_portal_photo_approval(current_setting('bertel.r5_submission_c503')::uuid,true,'00000000-0000-4000-a000-00000000c561');
RESET ROLE;
UPDATE public.ref_document SET extra=extra||'{"publication_ready":true,"public_url":"https://example.test/photo-stock/approved.jpg"}'::jsonb WHERE id='00000000-0000-4000-a000-00000000c551';
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-00000000c512","role":"authenticated","app_metadata":{"sandbox_discovery":true}}',true);
SET LOCAL ROLE authenticated;
SELECT api.approve_fiche_submission(current_setting('bertel.r5_submission_c503')::uuid);
RESET ROLE;
DO $test$ BEGIN
 ASSERT NOT (SELECT is_published FROM public.media WHERE id='00000000-0000-4000-a503-000000000001');
 ASSERT internal.gallery_published_photo_count('HOTRUN999999C503')=20;
 ASSERT internal.gallery_photo_usage('HOTRUN999999C503')=20;
 ASSERT (SELECT extra->>'slot_state'='consumed' FROM public.ref_document WHERE id='00000000-0000-4000-a000-00000000c551');
END; $test$;

-- Office success, removal, delayed retry: an earlier intention never restores a withdrawn photo.
CREATE TEMP TABLE r5_gallery_request(request jsonb);
INSERT INTO r5_gallery_request SELECT jsonb_build_object('write_contract','gallery-patch-v1','request_id','00000000-0000-4000-a000-00000000c611',
 'rows',jsonb_build_array(jsonb_build_object('id','00000000-0000-4000-a000-00000000c541','expected',NULL,'changes',jsonb_build_object('media_type_id',t.id,
 'url','https://example.test/office-twenty.jpg','visibility','public','is_published',true))), 'deleted','[]'::jsonb)
 FROM public.ref_code_media_type t WHERE t.code='photo';
GRANT SELECT ON r5_gallery_request TO authenticated;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-00000000c512","role":"authenticated","app_metadata":{"sandbox_discovery":true}}',true);
SET LOCAL ROLE authenticated;
SELECT api.save_object_gallery('HOTRUN999999C501',(SELECT request FROM r5_gallery_request));
RESET ROLE;
DO $test$ BEGIN ASSERT internal.gallery_published_photo_count('HOTRUN999999C501')=20; END; $test$;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-00000000c511","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT api.withdraw_portal_photo('HOTRUN999999C501','00000000-0000-4000-a000-00000000c541');
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-00000000c512","role":"authenticated","app_metadata":{"sandbox_discovery":true}}',true);
SET LOCAL ROLE authenticated;
DO $test$ DECLARE v_response jsonb; BEGIN
 v_response:=api.save_object_gallery('HOTRUN999999C501',(SELECT request FROM r5_gallery_request));
 ASSERT v_response->>'replayed'='true';
 ASSERT EXISTS(SELECT 1 FROM jsonb_array_elements(v_response->'snapshot') x WHERE x->>'id'='00000000-0000-4000-a000-00000000c541' AND x->'is_published'='false'::jsonb);
 ASSERT api.get_gallery_write_receipt('HOTRUN999999C501','00000000-0000-4000-a000-00000000c611')->>'replayed'='true';
END; $test$;
RESET ROLE;
DO $test$ BEGIN ASSERT internal.gallery_published_photo_count('HOTRUN999999C501')=19; END; $test$;

-- Expired unsubmitted reservations release capacity; pending ones remain counted until resolution.
UPDATE public.ref_document SET extra=extra||jsonb_build_object('slot_first_reserved_at',now()-interval '25 hours','slot_reserved_at',now()-interval '25 hours','slot_reserved_until',now()-interval '1 hour') WHERE extra->>'object_id'='HOTRUN999999C502';
DO $test$ BEGIN ASSERT internal.gallery_photo_usage('HOTRUN999999C502')=0; END; $test$;

-- A pending B proposal keeps its slot even when the unsubmitted TTL has elapsed.
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-00000000c511","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT api.reserve_portal_photo_upload('HOTRUN999999C502','00000000-0000-4000-a502-000000000022');
RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
SELECT api.complete_portal_photo_upload('00000000-0000-4000-a000-00000000c511','00000000-0000-4000-a502-000000000022',repeat('c',64),'Pending photo',1800,1200);
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-00000000c511","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT api.submit_actor_fiche('HOTRUN999999C502',jsonb_build_array(jsonb_build_object('target_table','media','action','update',
 'payload',jsonb_build_object('additions',jsonb_build_array(jsonb_build_object('upload_id','00000000-0000-4000-a502-000000000022','credit','CI author'))),
 'metadata',jsonb_build_object('section','media','rpc','publish_portal_photo_additions','field','Vos photos'))),NULL);
RESET ROLE;
UPDATE public.ref_document SET extra=extra||jsonb_build_object('slot_reserved_until',now()-interval '1 second') WHERE id='00000000-0000-4000-a502-000000000022';
DO $test$ BEGIN ASSERT internal.gallery_photo_usage('HOTRUN999999C502')=1,'pending slot expired while awaiting office'; END; $test$;
SELECT set_config('bertel.r5_submission_c502',(SELECT id::text FROM public.fiche_submission WHERE object_id='HOTRUN999999C502' AND status='pending'),true);
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-00000000c512","role":"authenticated","app_metadata":{"sandbox_discovery":true}}',true);
SET LOCAL ROLE authenticated;
SELECT api.reject_fiche_submission(current_setting('bertel.r5_submission_c502')::uuid,'CI refusal');
RESET ROLE;
DO $test$ BEGIN
 ASSERT internal.gallery_photo_usage('HOTRUN999999C502')=0,'resolved slot still held';
 ASSERT NOT EXISTS(SELECT 1 FROM public.media WHERE object_id='HOTRUN999999C502'),'rejected proposal published';
END; $test$;

-- Unrelated videos keep the existing office DML path; private photos are preserved.
INSERT INTO public.media(id,object_id,media_type_id,url,is_published,visibility,extra)
 SELECT '00000000-0000-4000-a000-00000000c581','HOTRUN999999C501',id,'https://example.test/private.jpg',true,'private','{"preserve":"hidden"}'
 FROM public.ref_code_media_type WHERE code='photo';
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-00000000c512","role":"authenticated","app_metadata":{"sandbox_discovery":true}}',true);
SET LOCAL ROLE authenticated;
INSERT INTO public.media(id,object_id,media_type_id,url,is_published,visibility)
 SELECT '00000000-0000-4000-a000-00000000c582','HOTRUN999999C501',id,'https://example.test/video.mp4',true,'public'
 FROM public.ref_code_media_type WHERE code='video';
UPDATE public.media SET title='Video still editable' WHERE id='00000000-0000-4000-a000-00000000c582';
RESET ROLE;
DO $test$ BEGIN
 ASSERT EXISTS(SELECT 1 FROM public.media WHERE id='00000000-0000-4000-a000-00000000c582' AND title='Video still editable'),'unrelated video DML closed';
 ASSERT EXISTS(SELECT 1 FROM public.media WHERE id='00000000-0000-4000-a000-00000000c581' AND extra->>'preserve'='hidden' AND visibility='private');
END; $test$;

-- A historical gallery above twenty is preserved but cannot grow.
INSERT INTO public.media(id,object_id,media_type_id,url,visibility)
 SELECT '00000000-0000-4000-a000-00000000c591','HOTRUN999999C503',id,'https://example.test/historical-twenty-one.jpg','public'
 FROM public.ref_code_media_type WHERE code='photo';
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-00000000c512","role":"authenticated","app_metadata":{"sandbox_discovery":true}}',true);
SET LOCAL ROLE authenticated;
DO $test$ DECLARE v_failed boolean:=false; v_type uuid; BEGIN
 SELECT id INTO v_type FROM public.ref_code_media_type WHERE code='photo';
 BEGIN PERFORM api.save_object_gallery('HOTRUN999999C503',jsonb_build_object('write_contract','gallery-patch-v1','request_id','00000000-0000-4000-a000-00000000c621',
  'rows',jsonb_build_array(jsonb_build_object('id','00000000-0000-4000-a000-00000000c592','expected',NULL,'changes',jsonb_build_object('media_type_id',v_type,'url','https://example.test/historical-twenty-two.jpg','visibility','public'))),'deleted','[]'::jsonb));
 EXCEPTION WHEN SQLSTATE 'PT409' THEN v_failed:=true; END;
 ASSERT v_failed,'historical overflow grew';
END; $test$;
RESET ROLE;
DO $test$ BEGIN ASSERT internal.gallery_published_photo_count('HOTRUN999999C503')=21,'historical photos removed'; END; $test$;
ROLLBACK;
