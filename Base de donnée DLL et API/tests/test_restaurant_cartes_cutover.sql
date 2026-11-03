-- Run only AFTER supabase/cutovers/restaurant_cartes_atomic.sql in ephemeral CI.
BEGIN;
DO $test$
DECLARE v_office uuid:='00000000-0000-4000-a000-00000000c301'; v_carte uuid; v_brochure uuid;
 v_doc uuid:='00000000-0000-4000-a000-00000000c302'; v_other uuid:='00000000-0000-4000-a000-00000000c303';
 v_count integer; v_rejected boolean; v_expected jsonb; v_payload jsonb;
BEGIN
 IF current_setting('bertel.ephemeral_ci',true) IS DISTINCT FROM 'on' THEN RAISE EXCEPTION 'Ephemeral CI only'; END IF;
 SELECT id INTO v_carte FROM public.ref_code_document_type WHERE code='carte';
 SELECT id INTO v_brochure FROM public.ref_code_document_type WHERE code='brochure';
 INSERT INTO auth.users(id,email) VALUES(v_office,'carte-cutover@example.test');
 INSERT INTO public.app_user_profile(id,role) VALUES(v_office,'super_admin') ON CONFLICT(id) DO UPDATE SET role='super_admin';
 INSERT INTO public.object(id,object_type,name,status,is_test) VALUES('RESRUN999999C301','RES','Cutover card','published',true);
 INSERT INTO public.ref_document(id,url,access_scope) VALUES(v_doc,'https://example.test/cutover-card.pdf','public'),(v_other,'https://example.test/cutover-brochure.pdf','public');
 INSERT INTO public.object_document(object_id,document_id,role_id,title) VALUES('RESRUN999999C301',v_doc,v_carte,'Safe title');
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_office,'role','authenticated','app_metadata',jsonb_build_object('sandbox_discovery',true))::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 UPDATE public.object_document SET title='Stale client' WHERE object_id='RESRUN999999C301' AND document_id=v_doc;
 GET DIAGNOSTICS v_count=ROW_COUNT; ASSERT v_count=0,'old UPDATE still writes carte';
 DELETE FROM public.object_document WHERE object_id='RESRUN999999C301' AND document_id=v_doc;
 GET DIAGNOSTICS v_count=ROW_COUNT; ASSERT v_count=0,'old DELETE still removes carte';
 v_rejected:=false;
 BEGIN INSERT INTO public.object_document(object_id,document_id,role_id) VALUES('RESRUN999999C301',v_other,v_carte);
 EXCEPTION WHEN insufficient_privilege THEN v_rejected:=true; END;
 ASSERT v_rejected,'old INSERT still creates carte';
 INSERT INTO public.object_document(object_id,document_id,role_id) VALUES('RESRUN999999C301',v_other,v_brochure);
 v_rejected:=false;
 BEGIN UPDATE public.object_document SET role_id=v_carte WHERE object_id='RESRUN999999C301' AND document_id=v_other;
 EXCEPTION WHEN insufficient_privilege THEN v_rejected:=true; END;
 ASSERT v_rejected,'brochure role changed to carte around restrictive policy';
 SELECT value->'expected' INTO v_expected FROM jsonb_array_elements(api.read_restaurant_cartes('RESRUN999999C301')) WHERE value->>'documentId'=v_doc::text;
 v_payload:=jsonb_build_object('write_contract','restaurant-carte-v1','action','metadata','document_id',v_doc,'expected',v_expected,'patch',jsonb_build_object('title','Safe RPC edit'));
 PERFORM api.prepare_restaurant_carte_mutation('RESRUN999999C301','00000000-0000-4000-a000-00000000c304',v_payload);
 PERFORM api.finalize_restaurant_carte_mutation('00000000-0000-4000-a000-00000000c304');
 ASSERT (SELECT title='Safe RPC edit' FROM public.object_document WHERE object_id='RESRUN999999C301' AND document_id=v_doc),'safe RPC blocked by cutover';
 ASSERT EXISTS(SELECT 1 FROM public.object_document WHERE object_id='RESRUN999999C301' AND document_id=v_other AND role_id=v_brochure),'unrelated document role blocked';
 EXECUTE 'RESET ROLE';
END $test$;
ROLLBACK;
