BEGIN;
DO $test$
DECLARE
 v_user uuid:='00000000-0000-4000-a000-000000008401'; v_actor uuid:='00000000-0000-4000-a000-000000008402';
 v_office uuid:='00000000-0000-4000-a000-000000008403'; v_doc uuid:='00000000-0000-4000-a000-000000008404';
 v_first uuid:='00000000-0000-4000-a000-000000008405'; v_second uuid:='00000000-0000-4000-a000-000000008406';
 v_foreign uuid:='00000000-0000-4000-a000-000000008407'; v_private uuid:='00000000-0000-4000-a000-000000008408';
 v_claim uuid:='00000000-0000-4000-a000-000000008409'; v_role uuid; v_type uuid; v_payload jsonb; v_envelope jsonb;
 v_sub uuid; v_res jsonb; v_rejected boolean; v_before bigint;
BEGIN
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 ASSERT NOT has_function_privilege('anon','api.withdraw_portal_photo(text,uuid)','execute');
 ASSERT NOT has_function_privilege('authenticated','api.portal_photo_failed_approval(uuid)','execute');
 ASSERT NOT has_function_privilege('authenticated','api.publish_portal_photo_additions(text,jsonb)','execute');
 ASSERT has_function_privilege('service_role','api.portal_photo_failed_approval(uuid)','execute');
 SELECT id INTO v_role FROM public.ref_actor_role WHERE code='operator';
 SELECT id INTO v_type FROM public.ref_code_media_type WHERE code='photo';
 INSERT INTO auth.users(id,email) VALUES(v_user,'portal-photo-8401@example.test'),(v_office,'office-photo-8403@example.test');
 INSERT INTO public.actor(id,display_name,extra) VALUES(v_actor,'Partenaire photo 8402','{"test_corpus":true}');
 INSERT INTO public.app_user_profile(id,role,actor_id) VALUES(v_user,'actor',v_actor) ON CONFLICT(id) DO UPDATE SET role='actor',actor_id=EXCLUDED.actor_id;
 INSERT INTO public.app_user_profile(id,role) VALUES(v_office,'super_admin') ON CONFLICT(id) DO UPDATE SET role='super_admin';
 INSERT INTO public.object(id,object_type,name,status,is_test) VALUES('HOTRUN9999998401','HOT','Photos test','published',true),('HOTRUN9999998402','HOT','Autre partenaire photos','published',true);
 INSERT INTO public.actor_object_role(actor_id,object_id,role_id,is_primary) VALUES(v_actor,'HOTRUN9999998401',v_role,true);
 INSERT INTO public.media(id,object_id,media_type_id,url,position,is_main,visibility) VALUES
   (v_first,'HOTRUN9999998401',v_type,'https://example.test/first.jpg',1,true,'public'),
   (v_second,'HOTRUN9999998401',v_type,'https://example.test/second.jpg',2,false,'public'),
   (v_foreign,'HOTRUN9999998402',v_type,'https://example.test/foreign.jpg',1,true,'public'),
   (v_private,'HOTRUN9999998401',v_type,'https://example.test/private.jpg',90,false,'private');
 INSERT INTO public.ref_document(id,title,url,storage_bucket,storage_path,access_scope,extra) VALUES(v_doc,'Nouvelle photo','storage://actor-documents/private','actor-documents','portal-photos/'||v_actor||'/test.jpg','crm_private',jsonb_build_object('source','portal_photo','object_id','HOTRUN9999998401','rights_confirmed',true,'width',1800,'height',1200));
 INSERT INTO public.actor_document(actor_id,document_id,created_by) VALUES(v_actor,v_doc,v_user);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_user,'role','authenticated')::text,true);
 ASSERT NOT ('media'=ANY(api.actor_portal_floor_modules()));
 ASSERT jsonb_array_length(api.list_my_portal_photos('HOTRUN9999998401'))=2,'photo privée exposée';
 SELECT count(*) INTO v_before FROM public.pending_change;
 PERFORM api.reorder_portal_photos('HOTRUN9999998401',jsonb_build_array(v_second,v_first));
 ASSERT (SELECT is_main AND position=1 FROM public.media WHERE id=v_second),'ordre non appliqué immédiatement';
 ASSERT (SELECT count(*) FROM public.pending_change)=v_before,'ordre soumis à relecture';
 v_rejected:=false; BEGIN PERFORM api.reorder_portal_photos('HOTRUN9999998401',jsonb_build_array(v_second,v_foreign)); EXCEPTION WHEN SQLSTATE 'PT409' THEN v_rejected:=true; END; ASSERT v_rejected,'photo étrangère ordonnée';
 v_rejected:=false; BEGIN PERFORM api.withdraw_portal_photo('HOTRUN9999998401',v_private); EXCEPTION WHEN insufficient_privilege THEN v_rejected:=true; END; ASSERT v_rejected,'photo privée office retirée';
 v_rejected:=false; BEGIN PERFORM api.withdraw_portal_photo('HOTRUN9999998401',v_foreign); EXCEPTION WHEN insufficient_privilege THEN v_rejected:=true; END; ASSERT v_rejected,'photo étrangère retirée';
 v_payload:=jsonb_build_object('additions',jsonb_build_array(jsonb_build_object('upload_id',v_doc,'credit','Photographe test')));
 v_envelope:=jsonb_build_object('target_table','media','action','update','payload',v_payload,'metadata',jsonb_build_object('section','media','rpc','publish_portal_photo_additions','field','Vos photos'));
 v_rejected:=false; BEGIN PERFORM api.submit_actor_fiche('HOTRUN9999998401',jsonb_build_array(jsonb_set(v_envelope,'{metadata,rpc}','null')),NULL); EXCEPTION WHEN invalid_parameter_value THEN v_rejected:=true; END; ASSERT v_rejected,'module média sans writer accepté';
 v_rejected:=false; BEGIN PERFORM api.submit_actor_fiche('HOTRUN9999998401',jsonb_build_array(jsonb_set(v_envelope,'{metadata,section}','"characteristics"')),NULL); EXCEPTION WHEN invalid_parameter_value THEN v_rejected:=true; END; ASSERT v_rejected,'writer média détourné';
 v_rejected:=false; BEGIN PERFORM api.publish_portal_photo_additions('HOTRUN9999998401',v_payload); EXCEPTION WHEN insufficient_privilege THEN v_rejected:=true; END; ASSERT v_rejected,'partenaire publie sans office';
 v_res:=api.submit_actor_fiche('HOTRUN9999998401',jsonb_build_array(v_envelope),NULL);v_sub:=(v_res->>'submission_id')::uuid;
 ASSERT v_sub IS NOT NULL;
 ASSERT (SELECT count(*) FROM public.media WHERE object_id='HOTRUN9999998401')=3,'ajout publié avant relecture';
 -- Le retrait reste immédiat même pendant la relecture d'un ajout.
 PERFORM api.withdraw_portal_photo('HOTRUN9999998401',v_first);
 ASSERT (SELECT NOT is_published FROM public.media WHERE id=v_first);
 ASSERT (SELECT is_published AND position=90 FROM public.media WHERE id=v_private),'média masqué altéré';
 ASSERT api.portal_photo_preview(v_doc)->>'bucket'='actor-documents';
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_office,'role','authenticated','app_metadata',jsonb_build_object('sandbox_discovery',true))::text,true);
 v_rejected:=false; BEGIN PERFORM api.approve_fiche_submission(v_sub); EXCEPTION WHEN invalid_parameter_value THEN v_rejected:=true; END; ASSERT v_rejected,'approbation sans copie contrôlée acceptée';
 v_res:=api.prepare_portal_photo_approval(v_sub,true,v_claim);
 ASSERT jsonb_array_length(api.get_portal_photo_review((SELECT id FROM public.pending_change WHERE submission_id=v_sub)))=1;
 ASSERT jsonb_array_length(v_res->'documents')=1;
 ASSERT api.portal_photo_preview(v_doc)->>'path' LIKE 'portal-photos/%';
 -- Simulation de la preuve écrite par le serveur après la copie Storage (la
 -- route fait l'objet de tests séparés ; aucun fichier réel n'est déposé ici).
 UPDATE public.ref_document SET extra=extra||jsonb_build_object('publication_ready',true,'public_url','https://example.test/approved.jpg') WHERE id=v_doc;
 v_res:=api.approve_fiche_submission(v_sub);
 ASSERT (v_res->>'applied_count')::integer=1,'lot non appliqué';
 ASSERT EXISTS(SELECT 1 FROM public.media WHERE object_id='HOTRUN9999998401' AND url='https://example.test/approved.jpg' AND credit='Photographe test' AND is_published);
 ASSERT api.portal_photo_failed_approval(v_claim)='[]'::jsonb,'compensation détruit une photo déjà publiée';
 ASSERT EXISTS(SELECT 1 FROM public.media WHERE id=v_foreign AND is_published),'photo étrangère modifiée';
END $test$;
ROLLBACK;
