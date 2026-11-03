\set ON_ERROR_STOP on
\ir assert_partner_api_ephemeral.sql
-- Same persistent C5 fixture; every change below is rolled back. Real caller roles.
BEGIN;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-00000000c511","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT api.reserve_portal_photo_upload('HOTRUN999999C501','00000000-0000-4000-a000-00000000c571');
SELECT api.reserve_portal_photo_upload('HOTRUN999999C501','00000000-0000-4000-a000-00000000c571');
RESET ROLE;
DO $test$ BEGIN
 ASSERT (SELECT extra->>'upload_complete' IS DISTINCT FROM 'true' FROM public.ref_document WHERE id='00000000-0000-4000-a000-00000000c571'),'rearming an incomplete receipt forged completion';
END; $test$;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
SELECT api.complete_portal_photo_upload('00000000-0000-4000-a000-00000000c511','00000000-0000-4000-a000-00000000c571',repeat('d',64),'Photo A',1800,1200);
RESET ROLE;
CREATE TEMP TABLE r5_reactivation_payload(value jsonb);
INSERT INTO r5_reactivation_payload VALUES(jsonb_build_array(jsonb_build_object('target_table','media','action','update',
 'payload',jsonb_build_object('additions',jsonb_build_array(jsonb_build_object('upload_id','00000000-0000-4000-a000-00000000c571','credit','CI author'))),
 'metadata',jsonb_build_object('section','media','rpc','publish_portal_photo_additions','field','Vos photos'))));
GRANT SELECT ON r5_reactivation_payload TO authenticated;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-00000000c511","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT api.submit_actor_fiche('HOTRUN999999C501',(SELECT value FROM r5_reactivation_payload),NULL);
RESET ROLE;
SELECT set_config('bertel.r5_rejected_a',(SELECT id::text FROM public.fiche_submission WHERE object_id='HOTRUN999999C501' AND status='pending'),true);
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-00000000c512","role":"authenticated","app_metadata":{"sandbox_discovery":true}}',true);
SET LOCAL ROLE authenticated;
SELECT api.reject_fiche_submission(current_setting('bertel.r5_rejected_a')::uuid,'CI rejected A');
RESET ROLE;
DO $test$ BEGIN ASSERT internal.gallery_photo_usage('HOTRUN999999C501')=19; END; $test$;

-- Exact regression: nineteen published, A resolved, B now owns the twentieth slot.
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-00000000c511","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT api.reserve_portal_photo_upload('HOTRUN999999C501','00000000-0000-4000-a000-00000000c572');
DO $test$ DECLARE v_failed boolean:=false; BEGIN
 BEGIN PERFORM api.submit_actor_fiche('HOTRUN999999C501',(SELECT value FROM r5_reactivation_payload),NULL);
 EXCEPTION WHEN SQLSTATE 'PT409' THEN v_failed:=true; END;
 ASSERT v_failed,'reproposing rejected A exceeded B reservation after pending INSERT';
 v_failed:=false;
 BEGIN PERFORM api.reserve_portal_photo_upload('HOTRUN999999C501','00000000-0000-4000-a000-00000000c571');
 EXCEPTION WHEN SQLSTATE 'PT409' THEN v_failed:=true; END;
 ASSERT v_failed,'rearming rejected A returned an uncounted reservation';
END; $test$;
RESET ROLE;
DO $test$ BEGIN
 ASSERT internal.gallery_photo_usage('HOTRUN999999C501')=20;
 ASSERT NOT EXISTS(SELECT 1 FROM public.pending_change WHERE object_id='HOTRUN999999C501' AND status='pending'),'failed reactivation left a pending proposal';
 ASSERT (SELECT count(*) FROM public.media WHERE object_id='HOTRUN999999C501')=19;
END; $test$;

-- Same UUID cannot move its original deadline. After twenty-four hours a new
-- deposit is required; a pending proposal (tested separately) does not expire.
CREATE TEMP TABLE r5_deadline AS SELECT extra->'slot_first_reserved_at' AS first_at,extra->'slot_reserved_until' AS until_at FROM public.ref_document WHERE id='00000000-0000-4000-a000-00000000c572';
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-00000000c511","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT api.reserve_portal_photo_upload('HOTRUN999999C501','00000000-0000-4000-a000-00000000c572');
SELECT api.cancel_portal_photo_upload('HOTRUN999999C501','00000000-0000-4000-a000-00000000c572');
RESET ROLE;
DO $test$ BEGIN
 ASSERT EXISTS(SELECT 1 FROM public.ref_document d CROSS JOIN r5_deadline x WHERE d.id='00000000-0000-4000-a000-00000000c572'
   AND d.extra->'slot_first_reserved_at'=x.first_at AND d.extra->'slot_reserved_until'=x.until_at),'retry renewed the twenty-four-hour deadline';
END; $test$;
UPDATE public.ref_document SET extra=extra||jsonb_build_object('slot_first_reserved_at',now()-interval '25 hours','slot_reserved_at',now()-interval '25 hours','slot_reserved_until',now()-interval '1 hour') WHERE id='00000000-0000-4000-a000-00000000c572';
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-00000000c511","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $test$ DECLARE v_failed boolean:=false;v_detail text; BEGIN
 BEGIN PERFORM api.reserve_portal_photo_upload('HOTRUN999999C501','00000000-0000-4000-a000-00000000c572');
 EXCEPTION WHEN SQLSTATE 'PT409' THEN GET STACKED DIAGNOSTICS v_detail=PG_EXCEPTION_DETAIL;v_failed:=v_detail='reservation_expired';END;
 ASSERT v_failed,'same UUID renewed an expired slot';
END; $test$;
-- Once B has released its slot, the still-current A can be explicitly reproposed.
SELECT api.submit_actor_fiche('HOTRUN999999C501',(SELECT value FROM r5_reactivation_payload),NULL);
RESET ROLE;
SELECT set_config('bertel.r5_reproposed_a',(SELECT id::text FROM public.fiche_submission WHERE object_id='HOTRUN999999C501' AND status='pending'),true);
DO $test$ BEGIN
 ASSERT internal.gallery_photo_usage('HOTRUN999999C501')=20;
 ASSERT (SELECT extra->>'slot_pending_change_id'=(SELECT id::text FROM public.pending_change WHERE submission_id=current_setting('bertel.r5_reproposed_a')::uuid)
  FROM public.ref_document WHERE id='00000000-0000-4000-a000-00000000c571'),'receipt not bound to current proposal';
END; $test$;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-00000000c512","role":"authenticated","app_metadata":{"sandbox_discovery":true}}',true);
SET LOCAL ROLE authenticated;
SELECT api.prepare_portal_photo_approval(current_setting('bertel.r5_reproposed_a')::uuid,true,'00000000-0000-4000-a000-00000000c573');
RESET ROLE;
UPDATE public.ref_document SET extra=extra||'{"publication_ready":true,"public_url":"https://example.test/reproposed-A.jpg"}' WHERE id='00000000-0000-4000-a000-00000000c571';
-- Simulate an out-of-protocol privileged import in the disposable fixture only.
INSERT INTO public.media(id,object_id,media_type_id,url,visibility)
 SELECT '00000000-0000-4000-a000-00000000c574','HOTRUN999999C501',id,'https://example.test/privileged-overbook.jpg','public' FROM public.ref_code_media_type WHERE code='photo';
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-00000000c512","role":"authenticated","app_metadata":{"sandbox_discovery":true}}',true);
SET LOCAL ROLE authenticated;
DO $test$ DECLARE v_failed boolean:=false;BEGIN
 BEGIN PERFORM api.approve_fiche_submission(current_setting('bertel.r5_reproposed_a')::uuid);EXCEPTION WHEN SQLSTATE 'PT409' THEN v_failed:=true;END;
 ASSERT v_failed,'approval did not roll back when published count exceeded twenty';
END; $test$;
RESET ROLE;
DO $test$ BEGIN
 ASSERT (SELECT status='pending' FROM public.fiche_submission WHERE id=current_setting('bertel.r5_reproposed_a')::uuid);
 ASSERT NOT EXISTS(SELECT 1 FROM public.media WHERE object_id='HOTRUN999999C501' AND url='https://example.test/reproposed-A.jpg');
 ASSERT (SELECT extra->>'published_media_id' IS NULL FROM public.ref_document WHERE id='00000000-0000-4000-a000-00000000c571');
END; $test$;
DELETE FROM public.media WHERE id='00000000-0000-4000-a000-00000000c574';
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-00000000c512","role":"authenticated","app_metadata":{"sandbox_discovery":true}}',true);
SET LOCAL ROLE authenticated;
SELECT api.approve_fiche_submission(current_setting('bertel.r5_reproposed_a')::uuid);
RESET ROLE;
DO $test$ BEGIN ASSERT internal.gallery_photo_usage('HOTRUN999999C501')=20 AND internal.gallery_published_photo_count('HOTRUN999999C501')=20;END;$test$;
ROLLBACK;
