\set ON_ERROR_STOP on
\ir assert_partner_api_ephemeral.sql
-- Not run by the integration task. Recipe order: album activation -> close ->
-- replay the actual R5 cutover (which regrants reserve/cancel) -> this test.
BEGIN;
SET LOCAL lock_timeout='5s';
DO $test$ BEGIN
 ASSERT NOT internal.portal_photo_actor_writes_enabled();
 ASSERT has_function_privilege('authenticated','api.reserve_portal_photo_upload(text,uuid,uuid)','EXECUTE');
 ASSERT has_function_privilege('authenticated','api.cancel_portal_photo_upload(text,uuid)','EXECUTE');
 ASSERT NOT has_function_privilege('authenticated','api.withdraw_portal_photo(text,uuid)','EXECUTE');
 ASSERT has_function_privilege('authenticated','api.get_my_portal_photo_workspace(text)','EXECUTE');
 ASSERT has_function_privilege('authenticated','api.send_portal_message(text,text,text,jsonb,text,uuid)','EXECUTE');
END; $test$;
-- Guarded fixture only, transaction-local: a valid receipt would let completion
-- succeed if closure relied only on the EXECUTE grant. No Storage bytes uploaded.
INSERT INTO public.ref_document(id,url,title,storage_bucket,storage_path,access_scope,extra)
 VALUES('00000000-0000-4000-a000-00000000a791',
 'storage://actor-documents/portal-photos/00000000-0000-4000-a000-00000000c521/00000000-0000-4000-a000-00000000a791.jpg','Closure fixture',
 'actor-documents','portal-photos/00000000-0000-4000-a000-00000000c521/00000000-0000-4000-a000-00000000a791.jpg','crm_private',
 '{"source":"portal_photo","object_id":"HOTRUN999999C501","rights_confirmed":true,"slot_contract":"photo-stock-v1","slot_state":"reserved","upload_complete":false}');
INSERT INTO public.actor_document(actor_id,document_id,title,created_by) VALUES(
 '00000000-0000-4000-a000-00000000c521','00000000-0000-4000-a000-00000000a791','Closure fixture','00000000-0000-4000-a000-00000000c511');
GRANT EXECUTE ON FUNCTION api.complete_portal_photo_upload(uuid,uuid,text,text,integer,integer) TO service_role;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-00000000c511","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE failed boolean:=false;detail text;w jsonb;
BEGIN
 w:=api.get_my_portal_photo_workspace('HOTRUN999999C501');
 ASSERT w->'writesEnabled'='false' AND w->'analysisEnabled'='false';
 BEGIN PERFORM api.reserve_portal_photo_upload('HOTRUN999999C501','00000000-0000-4000-a000-00000000a792');
 EXCEPTION WHEN SQLSTATE 'PT409' THEN GET STACKED DIAGNOSTICS detail=PG_EXCEPTION_DETAIL;failed:=detail='photo_writes_closed';END;ASSERT failed;
 failed:=false;
 BEGIN PERFORM api.cancel_portal_photo_upload('HOTRUN999999C501','00000000-0000-4000-a000-00000000a791');
 EXCEPTION WHEN SQLSTATE 'PT409' THEN GET STACKED DIAGNOSTICS detail=PG_EXCEPTION_DETAIL;failed:=detail='photo_writes_closed';END;ASSERT failed;
 failed:=false;
 BEGIN PERFORM api.submit_actor_fiche('HOTRUN999999C501',jsonb_build_array(jsonb_build_object('target_table','media','action','update',
  'payload',jsonb_build_object('additions',jsonb_build_array(jsonb_build_object('upload_id','00000000-0000-4000-a000-00000000a791','credit','Fixture'))),
  'metadata',jsonb_build_object('section','media','rpc','publish_portal_photo_additions','field','Vos photos'))),NULL);
 EXCEPTION WHEN SQLSTATE 'PT409' THEN GET STACKED DIAGNOSTICS detail=PG_EXCEPTION_DETAIL;failed:=detail='photo_writes_closed';END;ASSERT failed,'shared B photo branch reopened';
END;
$test$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
DO $test$ DECLARE failed boolean:=false;detail text;BEGIN
 BEGIN PERFORM api.complete_portal_photo_upload('00000000-0000-4000-a000-00000000c511','00000000-0000-4000-a000-00000000a791',repeat('a',64),'Closure fixture',1800,1200);
 EXCEPTION WHEN SQLSTATE 'PT409' THEN GET STACKED DIAGNOSTICS detail=PG_EXCEPTION_DETAIL;failed:=detail='photo_writes_closed';END;ASSERT failed;
END; $test$;
RESET ROLE;
DO $test$ BEGIN
 ASSERT NOT EXISTS(SELECT 1 FROM public.ref_document WHERE id='00000000-0000-4000-a000-00000000a792');
 ASSERT (SELECT extra->>'upload_complete'='false' AND extra->>'slot_state'='reserved' FROM public.ref_document WHERE id='00000000-0000-4000-a000-00000000a791');
END; $test$;
ROLLBACK;
