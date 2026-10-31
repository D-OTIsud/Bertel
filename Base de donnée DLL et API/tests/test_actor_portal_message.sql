BEGIN;
DO $test$
DECLARE
  v_user uuid := '00000000-0000-4000-a000-000000008201';
  v_actor uuid := '00000000-0000-4000-a000-000000008202';
  v_officer uuid := '00000000-0000-4000-a000-000000008203';
  v_doc uuid := '00000000-0000-4000-a000-000000008204';
  v_client uuid := '00000000-0000-4000-a000-000000008205';
  v_role uuid; v_id uuid; v_again uuid; v_rejected boolean; v_count bigint; v_result jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  ASSERT NOT has_function_privilege('anon','api.send_portal_message(text,text,text,jsonb,text,uuid)','execute');
  SELECT id INTO v_role FROM public.ref_actor_role WHERE code='operator';
  INSERT INTO auth.users(id,email) VALUES(v_user,'portal-message-8201@example.test'),(v_officer,'portal-office-8203@example.test');
  INSERT INTO public.actor(id,display_name,extra) VALUES(v_actor,'Partenaire message 8202','{"test_corpus":true}');
  INSERT INTO public.app_user_profile(id,role,actor_id) VALUES(v_user,'actor',v_actor)
    ON CONFLICT(id) DO UPDATE SET role='actor',actor_id=EXCLUDED.actor_id;
  INSERT INTO public.app_user_profile(id,role) VALUES(v_officer,'super_admin') ON CONFLICT(id) DO UPDATE SET role='super_admin';
  INSERT INTO public.object(id,object_type,name,status,is_test) VALUES
    ('HOTRUN9999998202','HOT','Message test','published',true),
    ('HOTRUN9999998203','HOT','Autre partenaire message','published',true),
    ('HOTRUN9999998204','HOT','Piege reel message','published',false);
  INSERT INTO public.actor_object_role(actor_id,object_id,role_id,is_primary) VALUES(v_actor,'HOTRUN9999998202',v_role,true);
  INSERT INTO public.ref_document(id,title,url,storage_bucket,storage_path,access_scope,extra)
    VALUES(v_doc,'Certificat.pdf','storage://actor-documents/test','actor-documents','portal-messages/'||v_actor||'/test.pdf','crm_private',
      jsonb_build_object('source','portal_message','object_id','HOTRUN9999998202','mime_type','application/pdf','size_bytes',50));
  INSERT INTO public.actor_document(actor_id,document_id,created_by) VALUES(v_actor,v_doc,v_user);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_user,'role','authenticated')::text,true);
  v_id := api.send_portal_message('HOTRUN9999998202','fermeture','Fermé pour travaux.',jsonb_build_array(v_doc),'reponse@example.test',v_client);
  ASSERT EXISTS(SELECT 1 FROM public.crm_interaction c JOIN public.ref_code_demand_topic t ON t.id=c.demand_topic_id
    WHERE c.id=v_id AND c.actor_id=v_actor AND c.status='new' AND c.direction='inbound' AND c.interaction_type='other'
      AND c.source='portal' AND t.code='fermeture_provisoire' AND c.extra->>'reply_to'='reponse@example.test');
  ASSERT EXISTS(SELECT 1 FROM public.app_notification WHERE kind='portal_message' AND recipient_id=v_officer AND payload->>'interaction_id'=v_id::text);
  ASSERT api.portal_message_document(v_doc)->>'bucket'='actor-documents';
  ASSERT jsonb_array_length(api.list_portal_message_documents(v_id)->'documents')=1;
  ASSERT api.list_portal_message_documents(v_id)->>'replyTo'='reponse@example.test';
  v_again := api.send_portal_message('HOTRUN9999998202','fermeture','Fermé pour travaux.',jsonb_build_array(v_doc),'reponse@example.test',v_client);
  ASSERT v_again=v_id,'réessai réseau duplique le message';
  v_rejected:=false;
  BEGIN PERFORM api.send_portal_message('HOTRUN9999998203','autre','Fiche interdite'); EXCEPTION WHEN insufficient_privilege THEN v_rejected:=true; END;
  ASSERT v_rejected,'écriture chez un autre partenaire';
  v_rejected:=false;
  BEGIN PERFORM api.send_portal_message('HOTRUN9999998204','autre','Realm interdit'); EXCEPTION WHEN insufficient_privilege THEN v_rejected:=true; END;
  ASSERT v_rejected,'écriture hors realm';
  v_rejected:=false;
  BEGIN PERFORM api.send_portal_message('HOTRUN9999998202','inconnu','Message'); EXCEPTION WHEN invalid_parameter_value THEN v_rejected:=true; END;
  ASSERT v_rejected,'sujet libre accepté';
  v_rejected:=false;
  BEGIN PERFORM api.send_portal_message('HOTRUN9999998202','autre',''); EXCEPTION WHEN invalid_parameter_value THEN v_rejected:=true; END;
  ASSERT v_rejected,'corps vide';
  v_rejected:=false;
  BEGIN PERFORM api.send_portal_message('HOTRUN9999998202','autre','Pièce déjà liée',jsonb_build_array(v_doc)); EXCEPTION WHEN insufficient_privilege THEN v_rejected:=true; END;
  ASSERT v_rejected,'réutilisation d une pièce liée';
  v_rejected:=false;
  BEGIN PERFORM api.send_portal_message('HOTRUN9999998202','autre','Pièce forgée','["00000000-0000-4000-a000-000000008299"]'); EXCEPTION WHEN insufficient_privilege THEN v_rejected:=true; END;
  ASSERT v_rejected,'pièce d un autre acteur';
  ASSERT jsonb_array_length(api.list_my_portal_messages('HOTRUN9999998202'))=1;
  -- Les commentaires internes ne sortent jamais dans l'espace partenaire.
  INSERT INTO public.crm_interaction(parent_interaction_id,object_id,actor_id,body,direction,status,source)
    VALUES(v_id,'HOTRUN9999998202',v_actor,'Note confidentielle','internal','resolved','bertel_ui');
  ASSERT jsonb_array_length(api.list_my_portal_messages('HOTRUN9999998202')->0->'replies')=0;
  FOR i IN 1..9 LOOP PERFORM api.send_portal_message('HOTRUN9999998202','conseil','Conseil '||i); END LOOP;
  v_rejected:=false;
  BEGIN PERFORM api.send_portal_message('HOTRUN9999998202','autre','Au delà du quota'); EXCEPTION WHEN raise_exception THEN v_rejected:=true; END;
  ASSERT v_rejected,'quota absent';
  PERFORM set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-000000008299","role":"authenticated"}',true);
  v_rejected:=false;
  BEGIN PERFORM api.send_portal_message('HOTRUN9999998202','autre','Hors persona'); EXCEPTION WHEN insufficient_privilege THEN v_rejected:=true; END;
  ASSERT v_rejected,'non partenaire autorisé';
  v_rejected:=false;
  BEGIN PERFORM api.portal_message_document(v_doc); EXCEPTION WHEN insufficient_privilege THEN v_rejected:=true; END;
  ASSERT v_rejected,'signature de pièce non autorisée';
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  v_result := api.claim_unmailed_notifications(10000);
  ASSERT EXISTS(SELECT 1 FROM jsonb_array_elements(v_result) n WHERE n->>'kind'='portal_message' AND n->>'object_id'='HOTRUN9999998202');
  PERFORM api.mark_notifications_emailed(ARRAY(SELECT id FROM public.app_notification WHERE kind='portal_message' AND payload->>'object_id'='HOTRUN9999998202'));
  ASSERT NOT EXISTS(SELECT 1 FROM public.app_notification WHERE kind='portal_message' AND payload->>'object_id'='HOTRUN9999998202' AND email_sent_at IS NULL);
END $test$;
ROLLBACK;
