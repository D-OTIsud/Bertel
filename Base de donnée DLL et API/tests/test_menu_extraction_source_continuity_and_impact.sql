-- Real C -> E publication; historical impact is read-only. No provider or real Storage bytes.
\set ON_ERROR_STOP on
\ir assert_partner_api_ephemeral.sql
BEGIN;
DO $test$
DECLARE
 u uuid:='00000000-0000-4000-a000-00000000e401'; actor uuid:='00000000-0000-4000-a000-00000000e402';
 upload1 uuid:='00000000-0000-4000-a000-00000000e403'; op uuid:='00000000-0000-4000-a000-00000000e404';
 target uuid:='00000000-0000-4000-a000-00000000e405'; upload2 uuid:='00000000-0000-4000-a000-00000000e406';
 manual_menu uuid:='00000000-0000-4000-a000-00000000e407'; new_source_menu uuid:='00000000-0000-4000-a000-00000000e408';
 foreign_user uuid:='00000000-0000-4000-a000-00000000e409'; foreign_actor uuid:='00000000-0000-4000-a000-00000000e40a';
 office uuid:='00000000-0000-4000-a000-00000000e40b'; hidden_menu uuid:='00000000-0000-4000-a000-00000000e40c';
 foreign_menu uuid:='00000000-0000-4000-a000-00000000e40d'; other_office uuid:='00000000-0000-4000-a000-00000000e40e';
 old_author_menu uuid:='00000000-0000-4000-a000-00000000e40f'; role_id uuid; carte_role uuid; publisher_role uuid; old_doc uuid; new_doc uuid;
 claims jsonb; receipt jsonb; refs jsonb; ctx jsonb; current_ctx jsonb; stats jsonb; expected jsonb; payload jsonb; impact jsonb; ids jsonb;
 claim uuid:=gen_random_uuid(); rejected boolean; row_value jsonb;
BEGIN
 IF current_setting('bertel.ephemeral_ci',true) IS DISTINCT FROM 'on' THEN RAISE EXCEPTION 'Ephemeral CI database only'; END IF;
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 INSERT INTO auth.users(id,email) VALUES(u,'e-continuity@example.test'),(foreign_user,'e-foreign@example.test'),(office,'e-office@example.test'),(other_office,'e-other-office@example.test');
 INSERT INTO public.actor(id,display_name,is_test,extra) VALUES(actor,'E continuity',true,'{"test_corpus":true}'),(foreign_actor,'E foreign',true,'{"test_corpus":true}');
 INSERT INTO public.app_user_profile(id,role,actor_id) VALUES(u,'actor',actor),(foreign_user,'actor',foreign_actor),(office,'super_admin',NULL),(other_office,'tourism_agent',NULL)
 ON CONFLICT(id) DO UPDATE SET role=EXCLUDED.role,actor_id=EXCLUDED.actor_id;
 INSERT INTO public.object(id,object_type,name,status,is_test) VALUES('RESRUN999999E401','RES','E continuity','published',true),('RESRUN999999E402','RES','E foreign','published',true),('RESRUN999999E403','RES','E other realm','published',false),('ORGRUN999999E404','ORG','E office scope','published',true);
 -- A primary publisher recomputes the object realm from org_config, not the
 -- ORG object's initial is_test flag. Stamp the test office before linking it.
 INSERT INTO public.org_config(org_object_id,is_test_org) VALUES('ORGRUN999999E404',true)
 ON CONFLICT(org_object_id) DO UPDATE SET is_test_org=true;
 SELECT id INTO role_id FROM public.ref_actor_role WHERE code='operator';
 SELECT id INTO carte_role FROM public.ref_code_document_type WHERE code='carte';
 SELECT id INTO publisher_role FROM public.ref_org_role WHERE code='publisher';
 INSERT INTO public.object_org_link(object_id,org_object_id,role_id,is_primary) VALUES('RESRUN999999E401','ORGRUN999999E404',publisher_role,true);
 ASSERT (SELECT is_test FROM public.object WHERE id='RESRUN999999E401'),'fixture publisher unexpectedly changed object realm';
 INSERT INTO public.actor_object_role(actor_id,object_id,role_id,is_primary) VALUES(actor,'RESRUN999999E401',role_id,true),(foreign_actor,'RESRUN999999E402',role_id,true);
 INSERT INTO public.object_menu(id,object_id,name,visibility) VALUES(target,'RESRUN999999E401','A extracted','public'),(manual_menu,'RESRUN999999E401','Manual independent','public'),
 (new_source_menu,'RESRUN999999E401','New source only','public'),(old_author_menu,'RESRUN999999E401','B previous author','public'),(hidden_menu,'RESRUN999999E401','Hidden history','private'),(foreign_menu,'RESRUN999999E402','Foreign object','public');
 UPDATE internal.restaurant_carte_rollout SET partner_enabled=true WHERE singleton;
 UPDATE internal.portal_menu_write_configuration SET enabled=true WHERE singleton;
 EXECUTE 'GRANT EXECUTE ON FUNCTION api.publish_portal_menus(text,jsonb,uuid) TO authenticated';
 UPDATE internal.menu_extraction_settings SET enabled=true,daily_page_limit=10 WHERE singleton;
 claims:=jsonb_build_object('sub',u,'role','authenticated','app_metadata',jsonb_build_object('sandbox_discovery',true));
 PERFORM set_config('request.jwt.claims',claims::text,true);
 receipt:=api.prepare_restaurant_carte_upload('RESRUN999999E401',upload1,'source.pdf',repeat('a',64),32,'application/pdf');old_doc:=(receipt->>'documentId')::uuid;
 INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('restaurant-cartes-private',receipt->>'stagingPath','{"size":32,"mimetype":"application/pdf"}');
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 PERFORM api.record_restaurant_carte_staged(upload1,repeat('a',64));
 PERFORM set_config('request.jwt.claims',claims::text,true);
 refs:=jsonb_build_array(jsonb_build_object('kind','upload','id',upload1));
 ctx:=api.menu_extraction_context('RESRUN999999E401',refs,target)->'context';
 stats:=jsonb_build_array(jsonb_build_object('id',upload1,'bucket','restaurant-cartes-private','path',receipt->>'stagingPath','sha256',repeat('a',64),
  'mimeType','application/pdf','pageCount',1,'selectedPages',jsonb_build_array(1),'storageExpected',internal.menu_extraction_storage_snapshot('restaurant-cartes-private',receipt->>'stagingPath')));
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 PERFORM api.seal_menu_extraction(op,u,'RESRUN999999E401',refs,target,ctx,stats,1,'{}');
 PERFORM set_config('request.jwt.claims',claims::text,true);
 PERFORM api.reserve_menu_extraction(op);PERFORM api.claim_menu_extraction(op,claim);PERFORM api.mark_menu_extraction_started(op,claim);
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 PERFORM api.finish_menu_extraction(op,claim,jsonb_build_object('menu',jsonb_build_object('recordId',target,'name','Extracted','items','[]'::jsonb)),NULL);
 -- Publishing the exact private source is not a byte/source change.
 INSERT INTO storage.objects(bucket_id,name) VALUES('documents',receipt->>'publicPath');
 PERFORM api.record_restaurant_carte_copied(upload1,repeat('a',64),'https://project.example/storage/v1/object/public/documents/'||(receipt->>'publicPath'));
 PERFORM set_config('request.jwt.claims',claims::text,true);
 payload:=jsonb_build_object('write_contract','restaurant-carte-v1','action','publish','upload_id',upload1,'expected','null'::jsonb);
 PERFORM api.prepare_restaurant_carte_mutation('RESRUN999999E401','00000000-0000-4000-a000-00000000e410',payload);PERFORM api.finalize_restaurant_carte_mutation('00000000-0000-4000-a000-00000000e410');
 current_ctx:=api.menu_extraction_context('RESRUN999999E401',refs,target)->'context';
 ASSERT internal.menu_extraction_context_matches(ctx,current_ctx),'canonical staged-to-copied publication invalidated identical source';
 ASSERT NOT internal.menu_extraction_context_matches(ctx,jsonb_set(current_ctx,'{sources,0,upload,sha256}',to_jsonb(repeat('b',64)))),'changed hash accepted';
 ASSERT NOT internal.menu_extraction_context_matches(ctx,jsonb_set(current_ctx,'{sources,0,upload,stagingPath}','"wrong/path"')),'changed private path accepted';
 ASSERT NOT internal.menu_extraction_context_matches(ctx,jsonb_set(current_ctx,'{sources,0,linked,document,access_scope}','"crm_private"')),'non-public publication accepted';
 ASSERT NOT internal.menu_extraction_context_matches(ctx,jsonb_set(current_ctx,'{targetFingerprint}','"changed"')),'changed target accepted';
 ASSERT NOT internal.menu_extraction_context_matches(current_ctx,jsonb_set(current_ctx,'{sources,0,linked,title}','"Changed existing link"')),'existing link edits became version-neutral';
 SELECT r INTO expected FROM jsonb_array_elements(internal.portal_menu_write_snapshot(internal.object_menu_write_snapshot('RESRUN999999E401'))->'menus') r WHERE r->>'id'=target::text;
 payload:=jsonb_build_object('write_contract','menus-reconcile-v1','request_id','00000000-0000-4000-a000-00000000e411','extraction_draft_version',0,
  'menus',jsonb_build_array(jsonb_build_object('id',target,'expected',expected,'changes',jsonb_build_object('description','Reviewed from private source'))),'items','[]'::jsonb,'deleted_items','[]'::jsonb,'deleted_menus','[]'::jsonb);
 ASSERT api.publish_portal_menus('RESRUN999999E401',payload,op)->>'success'='true','real C publication prevented real E publication';
 ASSERT (SELECT published_menu_ids=ARRAY[target] FROM internal.menu_extraction_operation WHERE id=op);
 -- Replace the C link with another real upload. Old provenance must remain readable.
 receipt:=api.prepare_restaurant_carte_upload('RESRUN999999E401',upload2,'replacement.pdf',repeat('c',64),32,'application/pdf');new_doc:=(receipt->>'documentId')::uuid;
 INSERT INTO storage.objects(bucket_id,name) VALUES('restaurant-cartes-private',receipt->>'stagingPath'),('documents',receipt->>'publicPath');
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 PERFORM api.record_restaurant_carte_staged(upload2,repeat('c',64));PERFORM api.record_restaurant_carte_copied(upload2,repeat('c',64),'https://project.example/storage/v1/object/public/documents/'||(receipt->>'publicPath'));
 PERFORM set_config('request.jwt.claims',claims::text,true);
 SELECT value->'expected' INTO expected FROM jsonb_array_elements(api.read_restaurant_cartes('RESRUN999999E401')) WHERE value->>'documentId'=old_doc::text;
 payload:=jsonb_build_object('write_contract','restaurant-carte-v1','action','publish','upload_id',upload2,'document_id',old_doc,'expected',expected);
 PERFORM api.prepare_restaurant_carte_mutation('RESRUN999999E401','00000000-0000-4000-a000-00000000e412',payload);PERFORM api.finalize_restaurant_carte_mutation('00000000-0000-4000-a000-00000000e412');
 ASSERT NOT EXISTS(SELECT 1 FROM public.object_document WHERE object_id='RESRUN999999E401' AND document_id=old_doc);
 ASSERT api.get_menu_extraction_source_impact('RESRUN999999E401','carte',new_doc)->'menus'='[]'::jsonb,'new source inherited an old extraction';
 UPDATE internal.menu_extraction_operation SET created_at=now()-interval '50 days' WHERE id=op;
 -- Historical read fixtures, not dispatch/expense fixtures: previous authors,
 -- since-hidden/deleted menus, other sources and another object sharing the file.
 INSERT INTO internal.menu_extraction_operation(id,object_id,created_by,source_refs,context,source_stats,request_meta,page_count,state,result,published_result,published_menu_ids,published_at,created_at)
 SELECT gen_random_uuid(),'RESRUN999999E401',u,jsonb_build_array(jsonb_build_object('kind','carte','id',new_doc)),'{}','[]','{}',1,'succeeded','{}','{}',ARRAY[new_source_menu],now(),now()-n*interval '1 minute' FROM generate_series(1,35) n;
 INSERT INTO internal.menu_extraction_operation(id,object_id,created_by,source_refs,context,source_stats,request_meta,page_count,state,result,published_result,published_menu_ids,published_at,created_at)
 SELECT gen_random_uuid(),'RESRUN999999E401',foreign_user,jsonb_build_array(jsonb_build_object('kind','carte','id',old_doc)),'{}','[]','{}',1,'succeeded','{"secret":"DO_NOT_PROJECT"}','{}',ARRAY[x],now(),now()-interval '45 days'
 FROM unnest(ARRAY[old_author_menu,hidden_menu,'00000000-0000-4000-a000-00000000e499'::uuid]) x;
 INSERT INTO public.object_document(object_id,document_id,role_id,title) VALUES('RESRUN999999E402',old_doc,carte_role,'Shared source');
 INSERT INTO internal.menu_extraction_operation(id,object_id,created_by,source_refs,context,source_stats,request_meta,page_count,state,result,published_result,published_menu_ids,published_at)
 VALUES(gen_random_uuid(),'RESRUN999999E402',foreign_user,jsonb_build_array(jsonb_build_object('kind','carte','id',old_doc)),'{}','[]','{}',1,'succeeded','{}','{}',ARRAY[foreign_menu],now());
 ASSERT jsonb_array_length(api.list_menu_extractions('RESRUN999999E401'))=30;
 ASSERT NOT EXISTS(SELECT 1 FROM jsonb_array_elements(api.list_menu_extractions('RESRUN999999E401')) o WHERE o->>'id'=op::text),'fixture did not exceed personal history window';
 SET LOCAL ROLE authenticated;
 impact:=api.get_menu_extraction_source_impact('RESRUN999999E401','carte',old_doc);
 RESET ROLE;
 ASSERT impact=jsonb_build_object('menus',jsonb_build_array(jsonb_build_object('id',target,'name','A extracted'),jsonb_build_object('id',old_author_menu,'name','B previous author'))),
  'impact leaked foreign/private/deleted/manual menus or lost old/other-author history';
 ASSERT api.get_menu_extraction_source_impact('RESRUN999999E401','upload',upload1)=impact,'upload receipt and canonical document did not resolve same source';
 ASSERT impact::text NOT LIKE '%DO_NOT_PROJECT%','raw AI result leaked';
 UPDATE public.ref_document SET access_scope='crm_private' WHERE id=old_doc;
 rejected:=false;BEGIN PERFORM api.get_menu_extraction_source_impact('RESRUN999999E401','carte',old_doc);EXCEPTION WHEN insufficient_privilege THEN rejected:=true;END;
 ASSERT rejected,'actor impact read accepted a non-public card';
 UPDATE public.ref_document SET access_scope='public' WHERE id=old_doc;
 UPDATE internal.restaurant_carte_upload SET created_by=foreign_user WHERE id=upload2;
 rejected:=false;BEGIN PERFORM api.get_menu_extraction_source_impact('RESRUN999999E401','upload',upload2);EXCEPTION WHEN insufficient_privilege THEN rejected:=true;END;
 ASSERT rejected,'private receipt of another author exposed';
 INSERT INTO public.org_actor_module_visibility(org_object_id,object_type,module_id,is_visible) VALUES('ORGRUN999999E404','RES','menus',false);
 rejected:=false;BEGIN PERFORM api.get_menu_extraction_source_impact('RESRUN999999E401','carte',old_doc);EXCEPTION WHEN insufficient_privilege THEN rejected:=true;END;
 ASSERT rejected,'masked menus source impact exposed to actor';
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',foreign_user,'role','authenticated','app_metadata',jsonb_build_object('sandbox_discovery',true))::text,true);
 rejected:=false;BEGIN PERFORM api.get_menu_extraction_source_impact('RESRUN999999E401','carte',old_doc);EXCEPTION WHEN insufficient_privilege THEN rejected:=true;END;
 ASSERT rejected,'foreign actor read source impact';
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',other_office,'role','authenticated','app_metadata',jsonb_build_object('sandbox_discovery',true))::text,true);
 rejected:=false;BEGIN PERFORM api.get_menu_extraction_source_impact('RESRUN999999E401','carte',old_doc);EXCEPTION WHEN insufficient_privilege THEN rejected:=true;END;
 ASSERT rejected,'unrelated office read source impact';
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',office,'role','authenticated','app_metadata',jsonb_build_object('sandbox_discovery',true))::text,true);
 impact:=api.get_menu_extraction_source_impact('RESRUN999999E401','upload',upload1);
 ASSERT jsonb_array_length(impact->'menus')=3 AND EXISTS(SELECT 1 FROM jsonb_array_elements(impact->'menus') m WHERE m->>'id'=hidden_menu::text),'canonical R3b corrector lost hidden associated menu';
 rejected:=false;BEGIN PERFORM api.get_menu_extraction_source_impact('RESRUN999999E403','carte',old_doc);EXCEPTION WHEN insufficient_privilege THEN rejected:=true;END;
 ASSERT rejected,'corrector crossed realm';
 ASSERT NOT has_function_privilege('anon','api.get_menu_extraction_source_impact(text,text,uuid)','EXECUTE');
 ASSERT (SELECT name='Manual independent' FROM public.object_menu WHERE id=manual_menu),'read impact mutated manual menu';
END $test$;
ROLLBACK;
