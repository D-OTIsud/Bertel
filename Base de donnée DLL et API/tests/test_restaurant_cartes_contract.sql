-- C contract tests: ephemeral Supabase only; Storage rows below are receipt fixtures,
-- not proof of uploaded bytes. Route tests separately verify file bytes and copy/retry.
BEGIN;
DO $test$
DECLARE
 v_user uuid:='00000000-0000-4000-a000-00000000c201'; v_actor uuid:='00000000-0000-4000-a000-00000000c202';
 v_office uuid:='00000000-0000-4000-a000-00000000c203'; v_role uuid; v_carte uuid; v_brochure uuid;
 v_old uuid:='00000000-0000-4000-a000-00000000c204'; v_other uuid:='00000000-0000-4000-a000-00000000c205';
 v_private uuid:='00000000-0000-4000-a000-00000000c206'; v_upload uuid:='00000000-0000-4000-a000-00000000c207';
 v_request uuid:='00000000-0000-4000-a000-00000000c208'; v_edit uuid:='00000000-0000-4000-a000-00000000c209';
 v_rights uuid:='00000000-0000-4000-a000-00000000c20a'; v_result jsonb; v_payload jsonb; v_expected jsonb; v_receipt jsonb;
 v_rejected boolean; v_new uuid; v_count bigint;
BEGIN
 IF current_setting('bertel.ephemeral_ci',true) IS DISTINCT FROM 'on' THEN
   RAISE EXCEPTION 'Test restricted to the ephemeral CI database';
 END IF;
 ASSERT NOT has_function_privilege('anon','api.read_restaurant_cartes(text)','execute');
 ASSERT NOT has_function_privilege('authenticated','api.record_restaurant_carte_staged(uuid,text)','execute');
 ASSERT NOT has_function_privilege('authenticated','api.record_restaurant_carte_copied(uuid,text,text)','execute');
 ASSERT NOT has_table_privilege('authenticated','internal.restaurant_carte_upload','SELECT');
 ASSERT has_function_privilege('service_role','api.record_restaurant_carte_copied(uuid,text,text)','execute');
 ASSERT (SELECT NOT public AND file_size_limit=10485760 FROM storage.buckets WHERE id='restaurant-cartes-private');
 SELECT id INTO v_role FROM public.ref_actor_role WHERE code='operator';
 SELECT id INTO v_carte FROM public.ref_code_document_type WHERE code='carte';
 SELECT id INTO v_brochure FROM public.ref_code_document_type WHERE code='brochure';
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 INSERT INTO auth.users(id,email) VALUES(v_user,'carte-c201@example.test'),(v_office,'carte-office-c203@example.test');
 INSERT INTO public.actor(id,display_name,is_test,extra) VALUES(v_actor,'Carte test',true,'{"test_corpus":true}');
 INSERT INTO public.app_user_profile(id,role,actor_id) VALUES(v_user,'actor',v_actor)
 ON CONFLICT(id) DO UPDATE SET role='actor',actor_id=EXCLUDED.actor_id;
 INSERT INTO public.app_user_profile(id,role) VALUES(v_office,'super_admin')
 ON CONFLICT(id) DO UPDATE SET role='super_admin';
 INSERT INTO public.object(id,object_type,name,status,is_test) VALUES
 ('RESRUN999999C201','RES','Carte own','published',true),('RESRUN999999C202','RES','Other restaurant','published',true),
 ('HOTRUN999999C203','HOT','Not restaurant','published',true);
 INSERT INTO public.actor_object_role(actor_id,object_id,role_id,is_primary)
 VALUES(v_actor,'RESRUN999999C201',v_role,true),(v_actor,'HOTRUN999999C203',v_role,true);
 INSERT INTO public.ref_document(id,url,title,access_scope) VALUES
 (v_old,'https://example.test/old.pdf','Old carte','public'),(v_other,'https://example.test/other.pdf','Other carte','public'),
 (v_private,'storage://actor-documents/private-carte','Private office card','crm_private');
 INSERT INTO public.object_document(object_id,document_id,role_id,title,position) VALUES
 ('RESRUN999999C201',v_old,v_carte,'Old title',1),('RESRUN999999C201',v_other,v_carte,'Independent menu',2),
 ('RESRUN999999C202',v_old,v_carte,'Shared document',1),('RESRUN999999C201',v_private,v_carte,'Private',3);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_user,'role','authenticated','app_metadata',jsonb_build_object('sandbox_discovery',true))::text,true);
 v_rejected:=false;
 BEGIN PERFORM api.read_restaurant_cartes('RESRUN999999C201'); EXCEPTION WHEN insufficient_privilege THEN v_rejected:=true; END;
 ASSERT v_rejected,'actor route active before rollout';
 UPDATE internal.restaurant_carte_rollout SET partner_enabled=true WHERE singleton;
 ASSERT jsonb_array_length(api.read_restaurant_cartes('RESRUN999999C201'))=2,'private office document exposed';
 v_rejected:=false; BEGIN PERFORM api.read_restaurant_cartes('RESRUN999999C202'); EXCEPTION WHEN insufficient_privilege THEN v_rejected:=true; END;
 ASSERT v_rejected,'foreign restaurant readable';
 v_rejected:=false; BEGIN PERFORM api.read_restaurant_cartes('HOTRUN999999C203'); EXCEPTION WHEN insufficient_privilege THEN v_rejected:=true; END;
 ASSERT v_rejected,'accommodation accepted as restaurant';
 v_receipt:=api.prepare_restaurant_carte_upload('RESRUN999999C201',v_upload,'new.pdf',repeat('a',64),16,'application/pdf');
 ASSERT v_receipt->>'state'='reserved'; v_new:=(v_receipt->>'documentId')::uuid;
 ASSERT api.prepare_restaurant_carte_upload('RESRUN999999C201',v_upload,'new.pdf',repeat('a',64),16,'application/pdf')=v_receipt,'upload retry changed receipt';
 v_rejected:=false;
 BEGIN PERFORM api.prepare_restaurant_carte_upload('RESRUN999999C201',v_upload,'different.pdf',repeat('a',64),16,'application/pdf');
 EXCEPTION WHEN SQLSTATE 'PT409' THEN v_rejected:=true; END;
 ASSERT v_rejected,'request ID reused for another file';
 v_rejected:=false; BEGIN PERFORM api.record_restaurant_carte_staged(v_upload,repeat('a',64)); EXCEPTION WHEN insufficient_privilege THEN v_rejected:=true; END;
 ASSERT v_rejected,'actor forged server stage receipt';
 INSERT INTO storage.objects(bucket_id,name) VALUES('restaurant-cartes-private',v_receipt->>'stagingPath');
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 ASSERT api.record_restaurant_carte_staged(v_upload,repeat('a',64))->>'state'='staged';
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_user,'role','authenticated','app_metadata',jsonb_build_object('sandbox_discovery',true))::text,true);
 SELECT value->'expected' INTO v_expected FROM jsonb_array_elements(api.read_restaurant_cartes('RESRUN999999C201'))
 WHERE value->>'documentId'=v_old::text;
 v_payload:=jsonb_build_object('write_contract','restaurant-carte-v1','action','publish','upload_id',v_upload,
  'document_id',v_old,'expected',v_expected,'patch',jsonb_build_object('title','New carte','valid_from',CURRENT_DATE::text));
 ASSERT api.prepare_restaurant_carte_mutation('RESRUN999999C201',v_request,v_payload)->>'state'='prepared';
 v_rejected:=false; BEGIN PERFORM api.finalize_restaurant_carte_mutation(v_request); EXCEPTION WHEN SQLSTATE 'PT409' THEN v_rejected:=true; END;
 ASSERT v_rejected,'link finalized without public copy';
 ASSERT EXISTS(SELECT 1 FROM public.object_document WHERE object_id='RESRUN999999C201' AND document_id=v_old),'old link lost before copy';
 INSERT INTO storage.objects(bucket_id,name) VALUES('documents',v_receipt->>'publicPath');
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 PERFORM api.record_restaurant_carte_copied(v_upload,repeat('a',64),
   'https://project.example/storage/v1/object/public/documents/'||(v_receipt->>'publicPath'));
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_user,'role','authenticated','app_metadata',jsonb_build_object('sandbox_discovery',true))::text,true);
 v_result:=api.finalize_restaurant_carte_mutation(v_request);
 ASSERT api.finalize_restaurant_carte_mutation(v_request)=v_result,'lost response replay not idempotent';
 ASSERT NOT EXISTS(SELECT 1 FROM public.object_document WHERE object_id='RESRUN999999C201' AND document_id=v_old);
 ASSERT EXISTS(SELECT 1 FROM public.object_document WHERE object_id='RESRUN999999C201' AND document_id=v_new);
 ASSERT EXISTS(SELECT 1 FROM public.object_document WHERE object_id='RESRUN999999C201' AND document_id=v_other),'unrelated menu card deleted';
 ASSERT EXISTS(SELECT 1 FROM public.object_document WHERE object_id='RESRUN999999C202' AND document_id=v_old),'shared document detached elsewhere';
 ASSERT EXISTS(SELECT 1 FROM public.ref_document WHERE id=v_old),'old shared file metadata deleted';
 ASSERT (SELECT access_scope='public' AND storage_bucket='documents' FROM public.ref_document WHERE id=v_new);
 ASSERT (api.get_restaurant_carte_mutation(v_request)->>'state')='committed';
 SELECT value->'expected' INTO v_expected FROM jsonb_array_elements(api.read_restaurant_cartes('RESRUN999999C201'))
 WHERE value->>'documentId'=v_new::text;
 v_payload:=jsonb_build_object('write_contract','restaurant-carte-v1','action','metadata','document_id',v_new,'expected',v_expected,'patch',jsonb_build_object('title','Actor edit'));
 PERFORM api.prepare_restaurant_carte_mutation('RESRUN999999C201',v_edit,v_payload);
 -- Simulate an old office writer between prepare and finalization.
 UPDATE public.object_document SET title='Office correction' WHERE object_id='RESRUN999999C201' AND document_id=v_new;
 v_rejected:=false; BEGIN PERFORM api.finalize_restaurant_carte_mutation(v_edit); EXCEPTION WHEN SQLSTATE 'PT409' THEN v_rejected:=true; END;
 ASSERT v_rejected,'old baseline overwrote office correction';
 ASSERT (SELECT title='Office correction' FROM public.object_document WHERE object_id='RESRUN999999C201' AND document_id=v_new);
 SELECT value->'expected' INTO v_expected FROM jsonb_array_elements(api.read_restaurant_cartes('RESRUN999999C201'))
 WHERE value->>'documentId'=v_new::text;
 v_payload:=jsonb_build_object('write_contract','restaurant-carte-v1','action','remove','document_id',v_new,'expected',v_expected);
 PERFORM api.prepare_restaurant_carte_mutation('RESRUN999999C201',v_rights,v_payload);
 DELETE FROM public.actor_object_role WHERE actor_id=v_actor AND object_id='RESRUN999999C201';
 v_rejected:=false; BEGIN PERFORM api.finalize_restaurant_carte_mutation(v_rights); EXCEPTION WHEN insufficient_privilege THEN v_rejected:=true; END;
 ASSERT v_rejected,'revoked actor finalized operation';
 ASSERT EXISTS(SELECT 1 FROM public.object_document WHERE object_id='RESRUN999999C201' AND document_id=v_new);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_office,'role','authenticated','app_metadata',jsonb_build_object('sandbox_discovery',true))::text,true);
 ASSERT jsonb_array_length(api.read_restaurant_cartes('RESRUN999999C201'))=3,'office cannot inspect its private card';
 SELECT value->'expected' INTO v_expected FROM jsonb_array_elements(api.read_restaurant_cartes('RESRUN999999C201'))
 WHERE value->>'documentId'=v_new::text;
 v_payload:=jsonb_build_object('write_contract','restaurant-carte-v1','action','remove','document_id',v_new,'expected',v_expected);
 PERFORM api.prepare_restaurant_carte_mutation('RESRUN999999C201','00000000-0000-4000-a000-00000000c20b',v_payload);
 PERFORM api.finalize_restaurant_carte_mutation('00000000-0000-4000-a000-00000000c20b');
 ASSERT NOT EXISTS(SELECT 1 FROM public.object_document WHERE object_id='RESRUN999999C201' AND document_id=v_new),'office withdrawal failed';
 ASSERT EXISTS(SELECT 1 FROM public.ref_document WHERE id=v_new),'withdrawal destroyed public URL metadata';
END $test$;
ROLLBACK;
