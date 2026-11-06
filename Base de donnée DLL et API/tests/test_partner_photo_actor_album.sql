\set ON_ERROR_STOP on
\ir assert_partner_api_ephemeral.sql
-- REVIEWABLE RECIPE, not run during the 4 November integration. No database is
-- created by it. Requires setup_partner_photo_stock + R5/R6/P + album cutover in
-- the pre-existing guarded fixture environment. All changes below roll back.
BEGIN;
SET LOCAL statement_timeout='45s';
SET LOCAL lock_timeout='5s';
DO $fixtures$ BEGIN
 ASSERT internal.portal_photo_actor_writes_enabled();
 ASSERT EXISTS(SELECT 1 FROM public.actor WHERE id='00000000-0000-4000-a000-00000000c521' AND is_test);
 ASSERT (SELECT count(*) FROM public.media WHERE object_id='HOTRUN999999C501')=19;
 ASSERT (SELECT count(*) FROM public.media WHERE object_id='HOTRUN999999C503')=20;
END; $fixtures$;
CREATE TEMP TABLE album_state(key text PRIMARY KEY,value jsonb);
GRANT SELECT,INSERT,UPDATE ON album_state TO authenticated;

-- Historical main in rank two: display the real main, compare the raw order.
UPDATE public.media SET is_main=false WHERE object_id='HOTRUN999999C501';
UPDATE public.media SET is_main=true WHERE id='00000000-0000-4000-a501-000000000002';
UPDATE public.media SET title='Base',title_i18n='{"fr":"Titre diffusé","en":"English title"}',
 description='Base description',description_i18n='{"fr":"Description diffusée","en":"English description"}'
 WHERE id='00000000-0000-4000-a501-000000000001';
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-00000000c511","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE w jsonb;s jsonb;r jsonb;failed boolean:=false;
BEGIN
 w:=api.get_my_portal_photo_workspace('HOTRUN999999C501');
 ASSERT w->'published'->0->>'id'='00000000-0000-4000-a501-000000000002';
 ASSERT w->'published'->0->'isMain'='true';
 ASSERT w->'orderSnapshot'->0->>'id'='00000000-0000-4000-a501-000000000001';
 ASSERT w->'orderSnapshot'->0->'isMain'='false';
 ASSERT w->'orderSnapshot'->0->>'revision' IS NOT NULL;
 ASSERT w->'orderNeedsNormalization'='true';
 SELECT p->'textSnapshot' INTO s FROM jsonb_array_elements(w->'published') p WHERE p->>'id'='00000000-0000-4000-a501-000000000001';
 INSERT INTO album_state VALUES('original_text',s),('original_order',w->'orderSnapshot');
 r:=api.update_portal_photo_texts('HOTRUN999999C501','00000000-0000-4000-a501-000000000001',s,'Titre diffusé','Nouvelle description');
 ASSERT EXISTS(SELECT 1 FROM jsonb_array_elements(r->'published') p WHERE p->>'id'='00000000-0000-4000-a501-000000000001'
  AND p->'textSnapshot'->>'title'='Base' AND p->'textSnapshot'->'title_i18n'->>'en'='English title');
 INSERT INTO album_state SELECT 'before_aba',p->'textSnapshot' FROM jsonb_array_elements(r->'published') p WHERE p->>'id'='00000000-0000-4000-a501-000000000001';
 PERFORM api.update_portal_photo_texts('HOTRUN999999C501','00000000-0000-4000-a501-000000000001',
  (SELECT value FROM album_state WHERE key='before_aba'),'Y','Nouvelle description');
 BEGIN PERFORM api.update_portal_photo_texts('HOTRUN999999C501','00000000-0000-4000-a501-000000000099',s,'x','y');
 EXCEPTION WHEN insufficient_privilege THEN failed:=true; END;
 ASSERT failed,'absent photo must be 42501';
END;
$test$;
RESET ROLE;
DO $test$ BEGIN
 ASSERT (SELECT title_i18n->>'en'='English title' AND description_i18n->>'en'='English description'
  FROM public.media WHERE id='00000000-0000-4000-a501-000000000001');
END; $test$;
-- A saved Y is undone to X by another transaction/writer. ctid makes this same-
-- transaction recipe discriminate too; xmin alone would not prove the ABA case.
UPDATE public.media SET title='Base',title_i18n='{"fr":"Titre diffusé","en":"English title"}'
 WHERE id='00000000-0000-4000-a501-000000000001';
SET LOCAL ROLE authenticated;
DO $test$ DECLARE failed boolean:=false;BEGIN
 BEGIN PERFORM api.update_portal_photo_texts('HOTRUN999999C501','00000000-0000-4000-a501-000000000001',
  (SELECT value FROM album_state WHERE key='before_aba'),'Y','Nouvelle description');
 EXCEPTION WHEN SQLSTATE 'PT409' THEN failed:=true;END;
 ASSERT failed,'old text intention overwrote an undo';
END; $test$;
RESET ROLE;
-- Grandfather unchanged legacy values, bound only a changed French value.
UPDATE public.media SET title=repeat('x',181),title_i18n=jsonb_build_object('fr',repeat('x',181),'en','English title'),
 description=repeat('d',5001),description_i18n=jsonb_build_object('fr',repeat('d',5001),'en','English description')
 WHERE id='00000000-0000-4000-a501-000000000001';
SET LOCAL ROLE authenticated;
DO $test$ DECLARE w jsonb;p jsonb;failed boolean:=false;detail text;BEGIN
 w:=api.get_my_portal_photo_workspace('HOTRUN999999C501');
 SELECT v INTO p FROM jsonb_array_elements(w->'published') v WHERE v->>'id'='00000000-0000-4000-a501-000000000001';
 w:=api.update_portal_photo_texts('HOTRUN999999C501','00000000-0000-4000-a501-000000000001',p->'textSnapshot',repeat('x',181),'  Description bornée  ');
 SELECT v INTO p FROM jsonb_array_elements(w->'published') v WHERE v->>'id'='00000000-0000-4000-a501-000000000001';
 ASSERT p->>'title'=repeat('x',181) AND p->>'description'='Description bornée';
 BEGIN PERFORM api.update_portal_photo_texts('HOTRUN999999C501','00000000-0000-4000-a501-000000000001',p->'textSnapshot',repeat('y',181),p->>'description');
 EXCEPTION WHEN SQLSTATE '22023' THEN GET STACKED DIAGNOSTICS detail=PG_EXCEPTION_DETAIL;failed:=detail='photo_title_too_long';END;ASSERT failed;
 failed:=false;
 BEGIN PERFORM api.update_portal_photo_texts('HOTRUN999999C501','00000000-0000-4000-a501-000000000001',p->'textSnapshot',p->>'title',repeat('z',5001));
 EXCEPTION WHEN SQLSTATE '22023' THEN GET STACKED DIAGNOSTICS detail=PG_EXCEPTION_DETAIL;failed:=detail='photo_description_too_long';END;ASSERT failed;
 -- 180 supplementary-plane Unicode characters are 180 PostgreSQL characters,
 -- even though a UTF-16 maxlength would count 360 code units.
 w:=api.update_portal_photo_texts('HOTRUN999999C501','00000000-0000-4000-a501-000000000001',p->'textSnapshot',repeat(chr(128247),180),p->>'description');
 SELECT v INTO p FROM jsonb_array_elements(w->'published') v WHERE v->>'id'='00000000-0000-4000-a501-000000000001';
 w:=api.update_portal_photo_texts('HOTRUN999999C501','00000000-0000-4000-a501-000000000001',p->'textSnapshot','   ','   ');
 ASSERT EXISTS(SELECT 1 FROM jsonb_array_elements(w->'published') v WHERE v->>'id'='00000000-0000-4000-a501-000000000001'
  AND v->>'title'='' AND v->>'description'='' AND v->'textSnapshot'->'title_i18n'->>'en'='English title');
END; $test$;

-- Same set, new order: normalize only when Save is explicitly invoked.
DO $test$
DECLARE w jsonb;ids jsonb;failed boolean:=false;
BEGIN
 w:=api.get_my_portal_photo_workspace('HOTRUN999999C501');
 SELECT jsonb_agg(e->'id' ORDER BY (e->>'id'='00000000-0000-4000-a501-000000000004') DESC,n)
  INTO ids FROM jsonb_array_elements(w->'orderSnapshot') WITH ORDINALITY a(e,n);
 INSERT INTO album_state VALUES('order_intention',ids),('order_before',w->'orderSnapshot');
 w:=api.reconcile_portal_photo_order('HOTRUN999999C501',w->'orderSnapshot',ids);
 ASSERT w->'published'->0->>'id'='00000000-0000-4000-a501-000000000004';
 ASSERT w->'published'->0->'isMain'='true' AND w->'orderNeedsNormalization'='false';
 -- Same request after lost response is a read-only success.
 PERFORM api.reconcile_portal_photo_order('HOTRUN999999C501',(SELECT value FROM album_state WHERE key='order_before'),ids);
 BEGIN PERFORM api.reorder_portal_photos('HOTRUN999999C501',ids);
 EXCEPTION WHEN insufficient_privilege THEN failed:=true; END;
 ASSERT failed,'legacy baseline-less writer is still open';
END; $test$;
RESET ROLE;
UPDATE public.media SET is_main=false WHERE object_id='HOTRUN999999C501';
UPDATE public.media SET position=right(id::text,12)::integer,is_main=(id='00000000-0000-4000-a501-000000000002')
 WHERE object_id='HOTRUN999999C501';
SET LOCAL ROLE authenticated;
DO $test$ DECLARE failed boolean:=false; BEGIN
 BEGIN PERFORM api.reconcile_portal_photo_order('HOTRUN999999C501',(SELECT value FROM album_state WHERE key='order_before'),(SELECT value FROM album_state WHERE key='order_intention'));
 EXCEPTION WHEN SQLSTATE 'PT409' THEN failed:=true; END;
 ASSERT failed,'same-set concurrent permutation/undo was overwritten';
END; $test$;
RESET ROLE;
UPDATE public.media SET is_main=false WHERE object_id='HOTRUN999999C501';
SET LOCAL ROLE authenticated;
DO $test$ DECLARE w jsonb;BEGIN
 w:=api.get_my_portal_photo_workspace('HOTRUN999999C501');
 ASSERT w->'orderNeedsNormalization'='true';
 ASSERT NOT EXISTS(SELECT 1 FROM jsonb_array_elements(w->'published') p WHERE p->'isMain'='true');
END; $test$;
RESET ROLE;
-- Hidden main occupies the old global unique index. Do not touch it or expose ID.
UPDATE public.media SET is_main=true,visibility='private' WHERE id='00000000-0000-4000-a501-000000000019';
INSERT INTO album_state SELECT 'hidden_main',to_jsonb(m) FROM public.media m WHERE id='00000000-0000-4000-a501-000000000019';
SET LOCAL ROLE authenticated;
DO $test$ DECLARE w jsonb;ids jsonb;failed boolean:=false;detail text;BEGIN
 w:=api.get_my_portal_photo_workspace('HOTRUN999999C501');
 ASSERT NOT EXISTS(SELECT 1 FROM jsonb_array_elements(w->'published') p WHERE p->>'id'='00000000-0000-4000-a501-000000000019');
 SELECT jsonb_agg(p->'id' ORDER BY n) INTO ids FROM jsonb_array_elements(w->'orderSnapshot') WITH ORDINALITY a(p,n);
 BEGIN PERFORM api.reconcile_portal_photo_order('HOTRUN999999C501',w->'orderSnapshot',ids);
 EXCEPTION WHEN SQLSTATE 'PT409' THEN GET STACKED DIAGNOSTICS detail=PG_EXCEPTION_DETAIL;failed:=detail='photo_main_conflict'; END;
 ASSERT failed;
END; $test$;
RESET ROLE;
DO $test$ BEGIN
 ASSERT (SELECT to_jsonb(m) FROM public.media m WHERE id='00000000-0000-4000-a501-000000000019')=(SELECT value FROM album_state WHERE key='hidden_main');
END; $test$;

-- Private draft metadata remains private and carries all translations through B.
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-00000000c511","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT api.reserve_portal_photo_upload('HOTRUN999999C502','00000000-0000-4000-a000-00000000a741');
RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
SELECT api.complete_portal_photo_upload('00000000-0000-4000-a000-00000000c511','00000000-0000-4000-a000-00000000a741',repeat('a',64),'Private upload',1800,1200);
RESET ROLE;
UPDATE public.ref_document SET title_i18n='{"en":"Kept private English"}',description_i18n='{"en":"Kept private alt"}' WHERE id='00000000-0000-4000-a000-00000000a741';
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-00000000c511","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $test$ DECLARE w jsonb;p jsonb;BEGIN
 w:=api.get_my_portal_photo_workspace('HOTRUN999999C502');p:=w->'proposals'->0;
 ASSERT jsonb_array_length(w->'published')=0 AND p->>'status'='draft';
 ASSERT NOT(p ? 'url') AND NOT(p ? 'storage_path');
 PERFORM api.update_portal_photo_proposal_texts('HOTRUN999999C502','00000000-0000-4000-a000-00000000a741',p->'textSnapshot','Titre privé','Description privée');
 PERFORM api.submit_actor_fiche('HOTRUN999999C502',jsonb_build_array(jsonb_build_object('target_table','media','action','update',
  'payload',jsonb_build_object('additions',jsonb_build_array(jsonb_build_object('upload_id','00000000-0000-4000-a000-00000000a741','credit','Fixture author'))),
  'metadata',jsonb_build_object('section','media','rpc','publish_portal_photo_additions','field','Vos photos'))),NULL);
 w:=api.get_my_portal_photo_workspace('HOTRUN999999C502');p:=w->'proposals'->0;
 ASSERT p->>'status'='pending';
 PERFORM api.update_portal_photo_proposal_texts('HOTRUN999999C502','00000000-0000-4000-a000-00000000a741',p->'textSnapshot','Titre privé','Description privée après envoi');
 w:=api.get_my_portal_photo_workspace('HOTRUN999999C502');
 INSERT INTO album_state VALUES('completed_text_revision',w->'proposals'->0->'textSnapshot');
END; $test$;
RESET ROLE;
-- A parallel upload completion that was already in flight cannot restore the
-- filename or touch the document revision after the partner edited the texts.
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
SELECT api.complete_portal_photo_upload('00000000-0000-4000-a000-00000000c511','00000000-0000-4000-a000-00000000a741',repeat('a',64),'Private upload',1800,1200);
RESET ROLE;
DO $test$ BEGIN
 ASSERT (SELECT title='Titre privé' AND description='Description privée après envoi'
  AND xmin::text||':'||ctid::text=(SELECT value->>'revision' FROM album_state WHERE key='completed_text_revision')
  FROM public.ref_document WHERE id='00000000-0000-4000-a000-00000000a741');
END; $test$;
SELECT set_config('bertel.album_submission',(SELECT id::text FROM public.fiche_submission WHERE object_id='HOTRUN999999C502' AND status='pending'),true);
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-00000000c512","role":"authenticated","app_metadata":{"sandbox_discovery":true}}',true);
SET LOCAL ROLE authenticated;
SELECT api.prepare_portal_photo_approval(current_setting('bertel.album_submission')::uuid,true,'00000000-0000-4000-a000-00000000a742');
RESET ROLE;
UPDATE public.ref_document SET extra=extra||'{"publication_ready":true,"public_url":"https://example.test/album-approved.jpg"}'::jsonb WHERE id='00000000-0000-4000-a000-00000000a741';
SET LOCAL ROLE authenticated;
SELECT api.approve_fiche_submission(current_setting('bertel.album_submission')::uuid);
RESET ROLE;
DO $test$ BEGIN
 ASSERT EXISTS(SELECT 1 FROM public.media WHERE object_id='HOTRUN999999C502' AND title='Titre privé' AND description='Description privée après envoi'
  AND title_i18n->>'en'='Kept private English' AND description_i18n->>'en'='Kept private alt' AND is_published);
END; $test$;

-- Real authenticated foreign actor cannot borrow a fiche, private text or row ID.
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-00000000c513","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $test$ DECLARE failed boolean:=false;BEGIN
 BEGIN PERFORM api.get_my_portal_photo_workspace('HOTRUN999999C501');EXCEPTION WHEN insufficient_privilege THEN failed:=true;END;ASSERT failed;
 failed:=false;
 BEGIN PERFORM api.update_portal_photo_proposal_texts('HOTRUN999999C502','00000000-0000-4000-a000-00000000a741','{}','x','y');EXCEPTION WHEN insufficient_privilege THEN failed:=true;END;ASSERT failed;
END; $test$;
RESET ROLE;

-- Historical stock 22: no increase, even across replacement -> withdrawal -> B
-- approval. This goes through both the BEFORE/AFTER guards and the publisher.
INSERT INTO public.media(id,object_id,media_type_id,url,position,is_main,is_published,visibility)
 SELECT ('00000000-0000-4000-a503-'||lpad(n::text,12,'0'))::uuid,'HOTRUN999999C503',t.id,
  'https://example.test/album-history/'||n||'.jpg',n,false,true,'public'
 FROM generate_series(21,22) n CROSS JOIN public.ref_code_media_type t WHERE t.code='photo';
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-00000000c511","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT api.reserve_portal_photo_upload('HOTRUN999999C503','00000000-0000-4000-a000-00000000a751','00000000-0000-4000-a503-000000000001');
DO $test$ DECLARE w jsonb;ids jsonb;failed boolean:=false;BEGIN
 w:=api.get_my_portal_photo_workspace('HOTRUN999999C503');ASSERT w->'capacity'->>'used'='22';
 SELECT jsonb_agg(p->'id' ORDER BY n DESC) INTO ids FROM jsonb_array_elements(w->'orderSnapshot') WITH ORDINALITY a(p,n);
 PERFORM api.reconcile_portal_photo_order('HOTRUN999999C503',w->'orderSnapshot',ids);
 BEGIN PERFORM api.reserve_portal_photo_upload('HOTRUN999999C503','00000000-0000-4000-a000-00000000a752');
 EXCEPTION WHEN SQLSTATE 'PT409' THEN failed:=true;END;ASSERT failed,'historical stock grew';
 PERFORM api.withdraw_portal_photo('HOTRUN999999C503','00000000-0000-4000-a503-000000000001');
END; $test$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
SELECT api.complete_portal_photo_upload('00000000-0000-4000-a000-00000000c511','00000000-0000-4000-a000-00000000a751',repeat('b',64),'Replacement',1800,1200);
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-00000000c511","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $test$ DECLARE w jsonb;BEGIN
 w:=api.get_my_portal_photo_workspace('HOTRUN999999C503');
 ASSERT w->'capacity'->>'used'='22' AND w->'capacity'->>'published'='21';
 ASSERT w->'proposals'->0->'replaceMediaId'='null'::jsonb;
 PERFORM api.submit_actor_fiche('HOTRUN999999C503',jsonb_build_array(jsonb_build_object('target_table','media','action','update',
  'payload',jsonb_build_object('additions',jsonb_build_array(jsonb_build_object('upload_id','00000000-0000-4000-a000-00000000a751','credit','Fixture author'))),
  'metadata',jsonb_build_object('section','media','rpc','publish_portal_photo_additions','field','Vos photos','album_stock_usage_before',9999))),NULL);
END; $test$;
RESET ROLE;
SELECT set_config('bertel.album_history_submission',(SELECT id::text FROM public.fiche_submission WHERE object_id='HOTRUN999999C503' AND status='pending'),true);
DO $test$ BEGIN
 ASSERT EXISTS(SELECT 1 FROM public.pending_change WHERE object_id='HOTRUN999999C503'
  AND status='pending' AND metadata->>'album_stock_usage_before'='22'),'client ceiling was not overwritten';
END; $test$;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-00000000c512","role":"authenticated","app_metadata":{"sandbox_discovery":true}}',true);
SET LOCAL ROLE authenticated;
SELECT api.prepare_portal_photo_approval(current_setting('bertel.album_history_submission')::uuid,true,'00000000-0000-4000-a000-00000000a753');
RESET ROLE;
UPDATE public.ref_document SET extra=extra||'{"publication_ready":true,"public_url":"https://example.test/album-history-approved.jpg"}'::jsonb WHERE id='00000000-0000-4000-a000-00000000a751';
SET LOCAL ROLE authenticated;
SELECT api.approve_fiche_submission(current_setting('bertel.album_history_submission')::uuid);
RESET ROLE;
DO $test$ BEGIN ASSERT internal.gallery_photo_usage('HOTRUN999999C503')=22 AND internal.gallery_published_photo_count('HOTRUN999999C503')=22;END; $test$;

-- B refusal without P/provider: exactly one typed CRM conversation, no text copy.
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-00000000c511","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT api.reserve_portal_photo_upload('HOTRUN999999C502','00000000-0000-4000-a000-00000000a761');
SELECT api.reserve_portal_photo_upload('HOTRUN999999C502','00000000-0000-4000-a000-00000000a762');
RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
SELECT api.complete_portal_photo_upload('00000000-0000-4000-a000-00000000c511','00000000-0000-4000-a000-00000000a761',repeat('c',64),'Same title',1800,1200);
SELECT api.complete_portal_photo_upload('00000000-0000-4000-a000-00000000c511','00000000-0000-4000-a000-00000000a762',repeat('d',64),'Same title',1800,1200);
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-00000000c511","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT api.submit_actor_fiche('HOTRUN999999C502',jsonb_build_array(jsonb_build_object('target_table','media','action','update',
 'payload',jsonb_build_object('additions',jsonb_build_array(jsonb_build_object('upload_id','00000000-0000-4000-a000-00000000a761','credit','Fixture author'),
  jsonb_build_object('upload_id','00000000-0000-4000-a000-00000000a762','credit','Fixture author'))),
 'metadata',jsonb_build_object('section','media','rpc','publish_portal_photo_additions','field','Vos photos'))),NULL);
RESET ROLE;
SELECT set_config('bertel.album_refused_submission',(SELECT id::text FROM public.fiche_submission WHERE object_id='HOTRUN999999C502' AND status='pending'),true);
SELECT set_config('bertel.album_refused_change',(SELECT id::text FROM public.pending_change WHERE object_id='HOTRUN999999C502' AND status='pending' AND metadata->>'rpc'='publish_portal_photo_additions'),true);
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-00000000c512","role":"authenticated","app_metadata":{"sandbox_discovery":true}}',true);
SET LOCAL ROLE authenticated;
SELECT api.reject_fiche_submission(current_setting('bertel.album_refused_submission')::uuid,'Photo à reprendre');
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-00000000c511","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $test$ DECLARE w jsonb;id uuid;failed boolean:=false;BEGIN
 w:=api.get_my_portal_photo_workspace('HOTRUN999999C502');
 ASSERT w->'analysisEnabled'='false';
 ASSERT EXISTS(SELECT 1 FROM jsonb_array_elements(w->'proposals') p WHERE p->>'documentId'='00000000-0000-4000-a000-00000000a761' AND p->'canAppeal'='true');
 id:=api.appeal_portal_photo_review('HOTRUN999999C502','00000000-0000-4000-a000-00000000a761',current_setting('bertel.album_refused_change')::uuid,'Recours humain fixture','00000000-0000-4000-a000-00000000a763');
 ASSERT id=api.appeal_portal_photo_review('HOTRUN999999C502','00000000-0000-4000-a000-00000000a761',current_setting('bertel.album_refused_change')::uuid,'Recours humain fixture','00000000-0000-4000-a000-00000000a763');
 BEGIN PERFORM api.appeal_portal_photo_review('HOTRUN999999C502','00000000-0000-4000-a000-00000000a761',current_setting('bertel.album_refused_change')::uuid,'Autre texte','00000000-0000-4000-a000-00000000a763');
 EXCEPTION WHEN SQLSTATE 'PT409' THEN failed:=true;END;ASSERT failed;
 -- Equal titles/body must not let a client ID migrate to a neighbouring photo.
 failed:=false;
 BEGIN PERFORM api.appeal_portal_photo_review('HOTRUN999999C502','00000000-0000-4000-a000-00000000a762',current_setting('bertel.album_refused_change')::uuid,'Recours humain fixture','00000000-0000-4000-a000-00000000a763');
 EXCEPTION WHEN SQLSTATE 'PT409' THEN failed:=true;END;ASSERT failed;
 w:=api.get_my_portal_photo_workspace('HOTRUN999999C502');
 ASSERT EXISTS(SELECT 1 FROM jsonb_array_elements(w->'proposals') p WHERE p->>'documentId'='00000000-0000-4000-a000-00000000a761'
  AND p->'canAppeal'='false' AND p->'reviewAppeal'->>'interactionId'=id::text);
END; $test$;
RESET ROLE;
DO $test$ BEGIN
 ASSERT (SELECT count(*) FROM public.crm_interaction WHERE extra->>'portal_photo_document_id'='00000000-0000-4000-a000-00000000a761')=1;
 ASSERT NOT EXISTS(SELECT 1 FROM internal.portal_photo_analysis WHERE document_id IN('00000000-0000-4000-a000-00000000a761','00000000-0000-4000-a000-00000000a762'));
 ASSERT NOT EXISTS(SELECT 1 FROM public.ref_document WHERE id='00000000-0000-4000-a000-00000000a761' AND extra::text LIKE '%Recours humain fixture%');
END; $test$;
-- Isolated receipt fixtures only, no provider/config/quota call. Both serial
-- orders of B/P arbitration must reject a second conversation. A two-connection
-- wait/race remains a separate runtime check; this is not a concurrency proof.
INSERT INTO internal.portal_photo_analysis(id,object_id,document_id,actor_id,created_by,source_sha256,local_day,provider_revision,state,started_at,outcome)
 SELECT ('00000000-0000-4000-a000-00000000a77'||n)::uuid,'HOTRUN999999C502',
  ('00000000-0000-4000-a000-00000000a76'||n)::uuid,'00000000-0000-4000-a000-00000000c521','00000000-0000-4000-a000-00000000c511',
  repeat(CASE WHEN n=1 THEN 'c' ELSE 'd' END,64),internal.photo_analysis_local_day(now()),now(),'assessed',now(),
  '{"assessment":{"score":7,"summary":"Fixture only","strengths":[],"issues":[]}}'::jsonb
 FROM generate_series(1,2) n;
SET LOCAL ROLE authenticated;
DO $test$ DECLARE failed boolean:=false;id uuid;BEGIN
 BEGIN PERFORM api.appeal_portal_photo_analysis('00000000-0000-4000-a000-00000000a771','Second route','00000000-0000-4000-a000-00000000a773');
 EXCEPTION WHEN SQLSTATE 'PT409' THEN failed:=true;END;ASSERT failed,'P duplicated a committed B appeal';
 id:=api.appeal_portal_photo_analysis('00000000-0000-4000-a000-00000000a772','P-first fixture','00000000-0000-4000-a000-00000000a774');
 ASSERT id IS NOT NULL;
 failed:=false;
 BEGIN PERFORM api.appeal_portal_photo_review('HOTRUN999999C502','00000000-0000-4000-a000-00000000a762',current_setting('bertel.album_refused_change')::uuid,'B second','00000000-0000-4000-a000-00000000a775');
 EXCEPTION WHEN SQLSTATE 'PT409' THEN failed:=true;END;ASSERT failed,'B duplicated a committed P appeal';
END; $test$;
RESET ROLE;
ROLLBACK;
