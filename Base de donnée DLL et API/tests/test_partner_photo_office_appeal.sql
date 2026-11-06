\set ON_ERROR_STOP on
\ir assert_partner_api_ephemeral.sql
-- Reviewable, NOT EXECUTED by this task. Uses the existing guarded stock fixture
-- and album cutover. No provider/Storage/email call; all mutations roll back.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='40s';
DO $preflight$ BEGIN
 ASSERT internal.portal_photo_actor_writes_enabled();
 ASSERT NOT EXISTS(SELECT 1 FROM public.pending_change WHERE object_id='HOTRUN999999C502' AND status='pending');
 ASSERT NOT has_function_privilege('authenticated','internal.portal_photo_appeal_document(uuid)','EXECUTE');
END; $preflight$;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-00000000c511","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT api.reserve_portal_photo_upload('HOTRUN999999C502','00000000-0000-4000-a000-00000000a811');
SELECT api.reserve_portal_photo_upload('HOTRUN999999C502','00000000-0000-4000-a000-00000000a812');
RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
SELECT api.complete_portal_photo_upload('00000000-0000-4000-a000-00000000c511','00000000-0000-4000-a000-00000000a811',repeat('a',64),'Office B fixture',1800,1200);
SELECT api.complete_portal_photo_upload('00000000-0000-4000-a000-00000000c511','00000000-0000-4000-a000-00000000a812',repeat('b',64),'Office P fixture',1800,1200);
RESET ROLE;
UPDATE public.ref_document SET title_i18n='{"fr":"Titre B diffusé","en":"Kept English"}' WHERE id='00000000-0000-4000-a000-00000000a811';
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-00000000c511","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT api.submit_actor_fiche('HOTRUN999999C502',jsonb_build_array(jsonb_build_object('target_table','media','action','update',
 'payload',jsonb_build_object('additions',jsonb_build_array(
  jsonb_build_object('upload_id','00000000-0000-4000-a000-00000000a811','credit','Fixture'),
  jsonb_build_object('upload_id','00000000-0000-4000-a000-00000000a812','credit','Fixture'))),
 'metadata',jsonb_build_object('section','media','rpc','publish_portal_photo_additions','field','Vos photos'))),NULL);
RESET ROLE;
SELECT set_config('bertel.office_appeal_submission',(SELECT id::text FROM public.fiche_submission WHERE object_id='HOTRUN999999C502' AND status='pending'),true);
SELECT set_config('bertel.office_appeal_change',(SELECT id::text FROM public.pending_change WHERE object_id='HOTRUN999999C502' AND status='pending' AND metadata->>'rpc'='publish_portal_photo_additions'),true);
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-00000000c512","role":"authenticated","app_metadata":{"sandbox_discovery":true}}',true);
SET LOCAL ROLE authenticated;
SELECT api.reject_fiche_submission(current_setting('bertel.office_appeal_submission')::uuid,'Refus de recette');
DO $test$ DECLARE denied boolean:=false;BEGIN
 ASSERT api.can_read_object_for_correction('HOTRUN999999C502');
 BEGIN PERFORM api.portal_photo_preview('00000000-0000-4000-a000-00000000a811');EXCEPTION WHEN insufficient_privilege THEN denied:=true;END;
 ASSERT denied,'a refusal without an appeal opened a private office preview';
END; $test$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-00000000c511","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT set_config('bertel.office_appeal_interaction',api.appeal_portal_photo_review('HOTRUN999999C502',
 '00000000-0000-4000-a000-00000000a811',current_setting('bertel.office_appeal_change')::uuid,
 'Relecture humaine fixture','00000000-0000-4000-a000-00000000a813')::text,true);
RESET ROLE;

-- A forged/free-form CRM association has no receipt on the actual private doc.
INSERT INTO public.crm_interaction(id,object_id,actor_id,interaction_type,direction,status,source,subject,body,occurred_at,extra)
 VALUES('00000000-0000-4000-a000-00000000a814','HOTRUN999999C502','00000000-0000-4000-a000-00000000c521',
 'other','inbound','new','portal','Forged fixture','No server receipt',now(),
 jsonb_build_object('portal_photo_change_id',current_setting('bertel.office_appeal_change'),
 'portal_photo_document_id','00000000-0000-4000-a000-00000000a812','portal_client_id','00000000-0000-4000-a000-00000000a814'));
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-00000000c512","role":"authenticated","app_metadata":{"sandbox_discovery":true}}',true);
SET LOCAL ROLE authenticated;
DO $test$ DECLARE result jsonb;denied boolean:=false;BEGIN
 result:=api.list_portal_message_documents(current_setting('bertel.office_appeal_interaction')::uuid);
 ASSERT result->'photoReview'->>'documentId'='00000000-0000-4000-a000-00000000a811';
 ASSERT result->'photoReview'->>'title'='Titre B diffusé';
 ASSERT NOT(result->'photoReview' ? 'path') AND NOT(result->'photoReview' ? 'bucket') AND NOT(result->'photoReview' ? 'url');
 ASSERT result->'documents'='[]'::jsonb AND result->'replyTo'='null'::jsonb;
 ASSERT api.portal_photo_preview('00000000-0000-4000-a000-00000000a811')->>'bucket'='actor-documents';
 ASSERT api.list_portal_message_documents('00000000-0000-4000-a000-00000000a814')->'photoReview'='null'::jsonb;
 BEGIN PERFORM api.portal_photo_preview('00000000-0000-4000-a000-00000000a812');EXCEPTION WHEN insufficient_privilege THEN denied:=true;END;
 ASSERT denied,'free CRM extra replaced a server photo receipt';
END; $test$;
RESET ROLE;

-- Discriminating scope case: a legacy email-owner is a canonical corrector for
-- the public fiche, in the SAME test realm, but has NO CRM actor scope. Knowing a
-- documentId must not bypass the existing CRM reader's actor/object gates.
INSERT INTO auth.users(id,email) VALUES('00000000-0000-4000-a000-00000000a798','photo-office-outsider@example.test');
INSERT INTO public.app_user_profile(id,role) VALUES('00000000-0000-4000-a000-00000000a798','tourism_agent')
 ON CONFLICT(id) DO UPDATE SET role=EXCLUDED.role;
INSERT INTO public.object(id,object_type,name,status,is_test) VALUES('ORGRUN999999A801','ORG','Foreign office fixture','published',true);
INSERT INTO public.user_org_membership(user_id,org_object_id,is_active) VALUES('00000000-0000-4000-a000-00000000a798','ORGRUN999999A801',true);
INSERT INTO public.actor_channel(actor_id,kind_id,value)
 SELECT '00000000-0000-4000-a000-00000000c521',id,'photo-office-outsider@example.test' FROM public.ref_code_contact_kind WHERE code='email';
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-00000000a798","role":"authenticated","email":"photo-office-outsider@example.test","app_metadata":{"sandbox_discovery":true}}',true);
SET LOCAL ROLE authenticated;
DO $test$ DECLARE denied boolean:=false;BEGIN
 ASSERT api.current_user_test_realm(),'scope test would be vacuous in another realm';
 ASSERT api.can_read_object_for_correction('HOTRUN999999C502'),'scope test needs canonical rights';
 ASSERT api.can_read_object('HOTRUN999999C502');
 ASSERT NOT api.user_can_read_crm_actor('00000000-0000-4000-a000-00000000c521'),'scope test needs missing CRM actor rights';
 BEGIN PERFORM api.list_portal_message_documents(current_setting('bertel.office_appeal_interaction')::uuid);EXCEPTION WHEN insufficient_privilege THEN denied:=true;END;ASSERT denied;
 denied:=false;
 BEGIN PERFORM api.portal_photo_preview('00000000-0000-4000-a000-00000000a811');EXCEPTION WHEN insufficient_privilege THEN denied:=true;END;ASSERT denied,'documentId bypassed CRM actor scope';
END; $test$;
RESET ROLE;

-- Revoke the typed CRM association, keeping the same document/path/hash. This
-- isolates the association guard (as erasure does); it is not a GDPR RPC recipe.
UPDATE public.crm_interaction SET extra='{}',body='' WHERE id=current_setting('bertel.office_appeal_interaction')::uuid;
DO $test$ BEGIN
 ASSERT (SELECT extra->>'upload_sha256'=repeat('a',64) AND storage_path='portal-photos/00000000-0000-4000-a000-00000000c521/00000000-0000-4000-a000-00000000a811.jpg'
  FROM public.ref_document WHERE id='00000000-0000-4000-a000-00000000a811');
END; $test$;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-00000000c512","role":"authenticated","app_metadata":{"sandbox_discovery":true}}',true);
SET LOCAL ROLE authenticated;
DO $test$ DECLARE denied boolean:=false;BEGIN
 ASSERT api.list_portal_message_documents(current_setting('bertel.office_appeal_interaction')::uuid)->'photoReview'='null'::jsonb;
 BEGIN PERFORM api.portal_photo_preview('00000000-0000-4000-a000-00000000a811');EXCEPTION WHEN insufficient_privilege THEN denied:=true;END;
 ASSERT denied,'erased CRM association kept B preview access';
END; $test$;
RESET ROLE;

-- Existing P reception remains usable through the same attachment block, with
-- its real operation/hash/CRM receipt. Isolated unavailable receipt: no AI call.
INSERT INTO internal.portal_photo_analysis(id,object_id,document_id,actor_id,created_by,source_sha256,local_day,provider_revision,state,outcome)
 VALUES('00000000-0000-4000-a000-00000000a815','HOTRUN999999C502','00000000-0000-4000-a000-00000000a812',
 '00000000-0000-4000-a000-00000000c521','00000000-0000-4000-a000-00000000c511',repeat('b',64),
 internal.photo_analysis_local_day(now()),now(),'unavailable','{"state":"unavailable","assessment":null,"publication":"office_review"}');
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-00000000c511","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT set_config('bertel.office_p_interaction',api.appeal_portal_photo_analysis('00000000-0000-4000-a000-00000000a815','P reception fixture','00000000-0000-4000-a000-00000000a816')::text,true);
-- The personal actor path is unchanged, including after the B CRM association
-- was revoked. This is its own private document, not an office scope bypass.
DO $test$ BEGIN
 ASSERT api.portal_photo_preview('00000000-0000-4000-a000-00000000a811')->>'bucket'='actor-documents';
 ASSERT api.portal_photo_preview('00000000-0000-4000-a000-00000000a812')->>'bucket'='actor-documents';
END; $test$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-00000000c512","role":"authenticated","app_metadata":{"sandbox_discovery":true}}',true);
SET LOCAL ROLE authenticated;
DO $test$ BEGIN
 ASSERT api.list_portal_message_documents(current_setting('bertel.office_p_interaction')::uuid)->'photoReview'->>'documentId'='00000000-0000-4000-a000-00000000a812';
 ASSERT api.portal_photo_preview('00000000-0000-4000-a000-00000000a812')->>'bucket'='actor-documents';
END; $test$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-00000000a798","role":"authenticated","email":"photo-office-outsider@example.test","app_metadata":{"sandbox_discovery":true}}',true);
SET LOCAL ROLE authenticated;
DO $test$ DECLARE denied boolean:=false;BEGIN
 ASSERT api.can_read_object_for_correction('HOTRUN999999C502') AND api.can_read_object('HOTRUN999999C502');
 ASSERT NOT api.user_can_read_crm_actor('00000000-0000-4000-a000-00000000c521');
 BEGIN PERFORM api.portal_photo_preview('00000000-0000-4000-a000-00000000a812');EXCEPTION WHEN insufficient_privilege THEN denied:=true;END;
 ASSERT denied,'old P appeal branch bypassed CRM actor scope';
END; $test$;
RESET ROLE;
ROLLBACK;
