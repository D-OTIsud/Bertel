-- E uses synthetic Storage metadata and model output here, never paid AI or production.
-- The actual PDF parser and actual Storage HTTP have separate transport/native proofs.
\set ON_ERROR_STOP on
\ir assert_partner_api_ephemeral.sql
BEGIN;
DO $test$
DECLARE
 u uuid:='00000000-0000-4000-a000-00000000e201'; a uuid:='00000000-0000-4000-a000-00000000e202'; role_id uuid; carte_id uuid;
 doc uuid:='00000000-0000-4000-a000-00000000e203'; menu uuid:='00000000-0000-4000-a000-00000000e204';
 private_menu uuid:='00000000-0000-4000-a000-00000000e205'; child uuid:='00000000-0000-4000-a000-00000000e206'; other_menu uuid:='00000000-0000-4000-a000-00000000e213';
 op uuid:='00000000-0000-4000-a000-00000000e207'; op2 uuid:='00000000-0000-4000-a000-00000000e208';
 op3 uuid:='00000000-0000-4000-a000-00000000e209'; op4 uuid:='00000000-0000-4000-a000-00000000e20a';
 claim uuid:='00000000-0000-4000-a000-00000000e20b'; claim2 uuid:='00000000-0000-4000-a000-00000000e20c';
 refs jsonb; ctx jsonb; stats jsonb; expected jsonb; result jsonb; payload jsonb; before_state jsonb;
 target_item uuid:='00000000-0000-4000-a000-00000000e216'; other_item uuid:='00000000-0000-4000-a000-00000000e217'; item_expected jsonb; delete_expected jsonb;
 rejected boolean; day date:=(now() AT TIME ZONE 'Indian/Reunion')::date; claims jsonb;
BEGIN
 IF current_setting('bertel.ephemeral_ci',true) IS DISTINCT FROM 'on' THEN RAISE EXCEPTION 'Ephemeral CI database only'; END IF;
 ASSERT (SELECT NOT enabled AND daily_page_limit IS NULL FROM internal.menu_extraction_settings WHERE singleton),'E activated without approved quota';
 ASSERT NOT has_function_privilege('authenticated','api.seal_menu_extraction(uuid,uuid,text,jsonb,uuid,jsonb,jsonb,integer,jsonb)','EXECUTE');
 ASSERT NOT has_function_privilege('authenticated','api.finish_menu_extraction(uuid,uuid,jsonb,text)','EXECUTE');
 ASSERT NOT has_function_privilege('authenticated','internal.record_menu_extraction_publication(uuid,text,jsonb,uuid[])','EXECUTE');
 ASSERT NOT has_table_privilege('authenticated','internal.menu_extraction_operation','SELECT');
 ASSERT has_function_privilege('authenticated','api.mark_menu_extraction_started(uuid,uuid)','EXECUTE');
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 INSERT INTO auth.users(id,email) VALUES(u,'e-operations@example.test');
 INSERT INTO public.actor(id,display_name,is_test,extra) VALUES(a,'E test actor',true,'{"test_corpus":true}');
 INSERT INTO public.app_user_profile(id,role,actor_id) VALUES(u,'actor',a) ON CONFLICT(id) DO UPDATE SET role='actor',actor_id=EXCLUDED.actor_id;
 INSERT INTO public.object(id,object_type,name,status,is_test) VALUES('RESRUN999999E201','RES','E own','published',true),('RESRUN999999E202','RES','E foreign','published',true);
 SELECT id INTO role_id FROM public.ref_actor_role WHERE code='operator';
 SELECT id INTO carte_id FROM public.ref_code_document_type WHERE code='carte';
 INSERT INTO public.actor_object_role(actor_id,object_id,role_id,is_primary) VALUES(a,'RESRUN999999E201',role_id,true);
 INSERT INTO public.ref_document(id,url,title,access_scope,storage_bucket,storage_path) VALUES(doc,
  'https://project.example/storage/v1/object/public/documents/RESRUN999999E201/cartes/e-fixture.pdf','Source','public','documents','RESRUN999999E201/cartes/e-fixture.pdf');
 INSERT INTO public.object_document(object_id,document_id,role_id,title,position) VALUES('RESRUN999999E201',doc,carte_id,'Source carte',1);
 INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('documents','RESRUN999999E201/cartes/e-fixture.pdf','{"size":128,"mimetype":"application/pdf"}');
 INSERT INTO public.object_menu(id,object_id,name,visibility) VALUES(menu,'RESRUN999999E201','Carte','public'),(private_menu,'RESRUN999999E201','Hidden office','private'),(other_menu,'RESRUN999999E201','Other public','public');
 INSERT INTO public.object_menu_item(id,menu_id,name) VALUES(target_item,menu,'Target dish'),(other_item,other_menu,'Independent dish');
 claims:=jsonb_build_object('sub',u,'role','authenticated','app_metadata',jsonb_build_object('sandbox_discovery',true));
 PERFORM set_config('request.jwt.claims',claims::text,true);
 refs:=jsonb_build_array(jsonb_build_object('kind','carte','id',doc,'pages',jsonb_build_array(1),'expected',internal.restaurant_carte_link_snapshot('RESRUN999999E201',doc)));
 rejected:=false;BEGIN PERFORM api.menu_extraction_context('RESRUN999999E201',refs,menu);EXCEPTION WHEN insufficient_privilege THEN rejected:=true;END;
 ASSERT rejected,'E bypassed closed M gate';
 UPDATE internal.portal_menu_write_configuration SET enabled=true WHERE singleton;
 EXECUTE 'GRANT EXECUTE ON FUNCTION api.publish_portal_menus(text,jsonb,uuid) TO authenticated';
 rejected:=false;BEGIN PERFORM api.menu_extraction_context('RESRUN999999E201',refs,menu);EXCEPTION WHEN SQLSTATE 'PT503' THEN rejected:=true;END;
 ASSERT rejected,'E active before quota configured';
 -- The number 2 is a test boundary, never a product setting (the transaction rolls back).
 UPDATE internal.menu_extraction_settings SET enabled=true,daily_page_limit=2 WHERE singleton;
 rejected:=false;BEGIN PERFORM api.menu_extraction_context('RESRUN999999E202',refs,NULL);EXCEPTION WHEN insufficient_privilege THEN rejected:=true;END;
 ASSERT rejected,'foreign object inspected';
 rejected:=false;BEGIN PERFORM api.menu_extraction_context('RESRUN999999E201',refs,private_menu);EXCEPTION WHEN insufficient_privilege THEN rejected:=true;END;
 ASSERT rejected,'private office target accepted';
 ctx:=api.menu_extraction_context('RESRUN999999E201',refs,menu)->'context';
 stats:=jsonb_build_array(jsonb_build_object('id',doc,'bucket','documents','path','RESRUN999999E201/cartes/e-fixture.pdf',
  'sha256',repeat('b',64),'mimeType','application/pdf','pageCount',1,'selectedPages',jsonb_build_array(1),
  'storageExpected',internal.menu_extraction_storage_snapshot('documents','RESRUN999999E201/cartes/e-fixture.pdf')));
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 PERFORM api.seal_menu_extraction(op,u,'RESRUN999999E201',refs,menu,ctx,stats,1,'{"menuTitle":"Carte","lang":"fr"}');
 ASSERT api.seal_menu_extraction(op,u,'RESRUN999999E201',refs,menu,ctx,stats,1,'{"menuTitle":"Carte","lang":"fr"}')->>'state'='inspected','seal retry changed intention';
 rejected:=false;BEGIN PERFORM api.seal_menu_extraction(op,u,'RESRUN999999E201',refs,menu,ctx,stats,1,'{"menuTitle":"Other","lang":"fr"}');EXCEPTION WHEN SQLSTATE 'PT409' THEN rejected:=true;END;
 ASSERT rejected,'same UUID accepted different metadata';
 PERFORM set_config('request.jwt.claims',claims::text,true);
 PERFORM api.reserve_menu_extraction(op);PERFORM api.reserve_menu_extraction(op);
 ASSERT (SELECT reserved_pages=1 AND consumed_pages=0 FROM internal.menu_extraction_day WHERE user_id=u AND local_day=day),'retry reserved twice';
 ASSERT api.claim_menu_extraction(op,claim)->>'claimed'='true';
 ASSERT api.claim_menu_extraction(op,claim2)->>'claimed'='false','concurrent worker claimed same operation';
 ASSERT api.assert_menu_extraction_dispatch(op,claim)->>'ready'='true';
 rejected:=false;BEGIN PERFORM api.mark_menu_extraction_started(op,claim2);EXCEPTION WHEN SQLSTATE 'PT409' THEN rejected:=true;END;
 ASSERT rejected,'wrong worker consumed quota';
 ASSERT api.mark_menu_extraction_started(op,claim)->>'started'='true';
 ASSERT (SELECT reserved_pages=0 AND consumed_pages=1 FROM internal.menu_extraction_day WHERE user_id=u AND local_day=day);
 rejected:=false;BEGIN PERFORM api.mark_menu_extraction_started(op,claim);EXCEPTION WHEN SQLSTATE 'PT409' THEN rejected:=true;END;
 ASSERT rejected,'same paid operation started twice';
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 PERFORM api.finish_menu_extraction(op,claim,'{"menu":{"title":"Extracted","items":[]},"suggestedDietaryByDish":[]}',NULL);
 PERFORM set_config('request.jwt.claims',claims::text,true);
 ASSERT api.get_menu_extraction(op)->>'state'='succeeded';
 ASSERT api.save_menu_extraction_draft(op,0,'{"menu":{"title":"Reviewed","items":[]}}')->>'draftVersion'='1';
 ASSERT api.save_menu_extraction_draft(op,0,'{"menu":{"title":"Reviewed","items":[]}}')->>'draftVersion'='1','lost draft response duplicated revision';
 rejected:=false;BEGIN PERFORM api.save_menu_extraction_draft(op,0,'{"menu":{"title":"Stale"}}');EXCEPTION WHEN SQLSTATE 'PT409' THEN rejected:=true;END;
 ASSERT rejected,'stale tab overwrote draft';
 ASSERT api.get_menu_extraction(op)#>>'{draft,menu,title}'='Reviewed';
 ASSERT api.get_menu_extraction(op)#>>'{result,menu,title}'='Extracted','draft overwrote model audit result';
 ASSERT jsonb_array_length(api.list_menu_extractions('RESRUN999999E201'))=1,'server recovery lost operation list';
 -- Two tabs share version 1; tab B saves version 2 while menus stay unchanged.
 -- Tab A cannot publish its obsolete content simply because its menu CAS matches.
 before_state:=internal.object_menu_write_snapshot('RESRUN999999E201');
 SELECT r INTO expected FROM jsonb_array_elements(internal.portal_menu_write_snapshot(before_state)->'menus') r WHERE r->>'id'=menu::text;
 PERFORM api.save_menu_extraction_draft(op,1,'{"menu":{"title":"Newer tab correction","items":[]}}');
 payload:=jsonb_build_object('write_contract','menus-reconcile-v1','request_id','00000000-0000-4000-a000-00000000e215',
  'extraction_draft_version',1,'menus',jsonb_build_array(jsonb_build_object('id',menu,'expected',expected,'changes',jsonb_build_object('description','Stale tab content'))),
  'items','[]'::jsonb,'deleted_items','[]'::jsonb,'deleted_menus','[]'::jsonb);
 rejected:=false;BEGIN PERFORM api.publish_portal_menus('RESRUN999999E201',payload,op);EXCEPTION WHEN SQLSTATE 'PT409' THEN rejected:=true;END;
 ASSERT rejected,'stale draft version published over a newer tab correction';
 ASSERT internal.object_menu_write_snapshot('RESRUN999999E201')=before_state,'stale draft changed menus';
 ASSERT api.get_menu_extraction(op)#>>'{draft,menu,title}'='Newer tab correction','newer draft was lost';
 ASSERT (SELECT published_result IS NULL FROM internal.menu_extraction_operation WHERE id=op),'stale draft left publication receipt';
 -- A later child conflicts against the E target bundle, with no mutation.
 INSERT INTO public.object_menu_item(id,menu_id,name) VALUES(child,menu,'Concurrent child');
 rejected:=false;BEGIN PERFORM internal.assert_menu_extraction_publication(op,'RESRUN999999E201',2);EXCEPTION WHEN SQLSTATE 'PT409' THEN rejected:=true;END;
 ASSERT rejected,'late target child was ignored';
 DELETE FROM public.object_menu_item WHERE id=child;
 ASSERT internal.assert_menu_extraction_publication(op,'RESRUN999999E201',2) IS NULL;
 -- Real M/E transaction: deleting the sole target leaves no published menu IDs;
 -- E record rejects and PostgreSQL rolls back BOTH menu deletion and receipts.
 expected:=internal.portal_menu_write_snapshot(internal.object_menu_write_snapshot('RESRUN999999E201'));
 SELECT r INTO expected FROM jsonb_array_elements(expected->'menus') r WHERE r->>'id'=menu::text;
 payload:=jsonb_build_object('write_contract','menus-reconcile-v1','request_id','00000000-0000-4000-a000-00000000e210',
  'extraction_draft_version',2,
  'menus','[]'::jsonb,'items','[]'::jsonb,'deleted_items','[]'::jsonb,
  'deleted_menus',jsonb_build_array(jsonb_build_object('id',menu,'expected',jsonb_build_object('row',expected))));
 before_state:=internal.object_menu_write_snapshot('RESRUN999999E201');
 rejected:=false;BEGIN PERFORM api.publish_portal_menus('RESRUN999999E201',payload,op);EXCEPTION WHEN invalid_parameter_value THEN rejected:=true;END;
 ASSERT rejected,'E menu deletion was accepted';
 ASSERT internal.object_menu_write_snapshot('RESRUN999999E201')=before_state,'record failure left partial menus';
 ASSERT (SELECT published_result IS NULL FROM internal.menu_extraction_operation WHERE id=op),'record failure left E receipt';
 -- Target updates cannot smuggle independent deletions into an E publication.
 SELECT r INTO delete_expected FROM jsonb_array_elements(internal.portal_menu_write_snapshot(before_state)->'menus') r WHERE r->>'id'=other_menu::text;
 payload:=jsonb_build_object('write_contract','menus-reconcile-v1','request_id','00000000-0000-4000-a000-00000000e218','extraction_draft_version',2,
  'menus',jsonb_build_array(jsonb_build_object('id',menu,'expected',expected,'changes',jsonb_build_object('description','Must roll back'))),
  'items','[]'::jsonb,'deleted_items','[]'::jsonb,'deleted_menus',jsonb_build_array(jsonb_build_object('id',other_menu,'expected',jsonb_build_object('row',delete_expected))));
 rejected:=false;BEGIN PERFORM api.publish_portal_menus('RESRUN999999E201',payload,op);EXCEPTION WHEN invalid_parameter_value THEN rejected:=true;END;
 ASSERT rejected AND internal.object_menu_write_snapshot('RESRUN999999E201')=before_state,'target edit deleted an independent menu';
 SELECT r INTO item_expected FROM jsonb_array_elements(internal.portal_menu_write_snapshot(before_state)->'items') r WHERE r->>'id'=target_item::text;
 SELECT r INTO delete_expected FROM jsonb_array_elements(internal.portal_menu_write_snapshot(before_state)->'items') r WHERE r->>'id'=other_item::text;
 payload:=jsonb_build_object('write_contract','menus-reconcile-v1','request_id','00000000-0000-4000-a000-00000000e219','extraction_draft_version',2,
  'menus','[]'::jsonb,'items',jsonb_build_array(jsonb_build_object('id',target_item,'menu_id',menu,'expected',item_expected,'changes',jsonb_build_object('description','Must roll back'),'links','{}'::jsonb)),
  'deleted_items',jsonb_build_array(jsonb_build_object('id',other_item,'menu_id',other_menu,'expected',jsonb_build_object('row',delete_expected))),'deleted_menus','[]'::jsonb);
 rejected:=false;BEGIN PERFORM api.publish_portal_menus('RESRUN999999E201',payload,op);EXCEPTION WHEN invalid_parameter_value THEN rejected:=true;END;
 ASSERT rejected AND internal.object_menu_write_snapshot('RESRUN999999E201')=before_state,'target dish edit deleted an independent dish';
 ASSERT (SELECT published_result IS NULL FROM internal.menu_extraction_operation WHERE id=op),'rejected independent deletions left E receipt';
 ASSERT NOT EXISTS(SELECT 1 FROM internal.object_menu_write_receipt WHERE request_id IN('00000000-0000-4000-a000-00000000e218','00000000-0000-4000-a000-00000000e219')),'rejected independent deletions left menu receipt';
 SELECT r INTO expected FROM jsonb_array_elements(internal.portal_menu_write_snapshot(before_state)->'menus') r WHERE r->>'id'=other_menu::text;
 payload:=jsonb_build_object('write_contract','menus-reconcile-v1','request_id','00000000-0000-4000-a000-00000000e214',
  'extraction_draft_version',2,
  'menus',jsonb_build_array(jsonb_build_object('id',other_menu,'expected',expected,'changes',jsonb_build_object('description','Wrong target'))),
  'items','[]'::jsonb,'deleted_items','[]'::jsonb,'deleted_menus','[]'::jsonb);
 rejected:=false;BEGIN PERFORM api.publish_portal_menus('RESRUN999999E201',payload,op);EXCEPTION WHEN invalid_parameter_value THEN rejected:=true;END;
 ASSERT rejected,'E targeted to A associated with a different public menu B';
 ASSERT internal.object_menu_write_snapshot('RESRUN999999E201')=before_state,'wrong-target association left a menu write';
 SELECT r INTO expected FROM jsonb_array_elements(internal.portal_menu_write_snapshot(before_state)->'menus') r WHERE r->>'id'=menu::text;
 payload:=jsonb_build_object('write_contract','menus-reconcile-v1','request_id','00000000-0000-4000-a000-00000000e211',
  'extraction_draft_version',2,
  'menus',jsonb_build_array(jsonb_build_object('id',menu,'expected',expected,'changes',jsonb_build_object('description','Reviewed extraction'))),
  'items','[]'::jsonb,'deleted_items','[]'::jsonb,'deleted_menus','[]'::jsonb);
 result:=api.publish_portal_menus('RESRUN999999E201',payload,op);
 ASSERT result->>'success'='true';
 rejected:=false;BEGIN PERFORM api.save_menu_extraction_draft(op,2,'{"menu":{"title":"Already published"}}');EXCEPTION WHEN SQLSTATE 'PT409' THEN rejected:=true;END;
 ASSERT rejected,'saving a published extraction did not return conflict';
 ASSERT (SELECT description='Reviewed extraction' FROM public.object_menu WHERE id=menu);
 ASSERT (SELECT published_menu_ids=ARRAY[menu] AND published_result->>'request_id'='00000000-0000-4000-a000-00000000e211' AND source_refs=refs AND page_count=1 FROM internal.menu_extraction_operation WHERE id=op),'source/pages/menu IDs not associated atomically';
 ASSERT EXISTS(SELECT 1 FROM public.object_menu WHERE id=private_menu AND visibility='private'),'office menu was changed';
 UPDATE public.ref_document SET title='Source changed after publication' WHERE id=doc;
 ASSERT api.publish_portal_menus('RESRUN999999E201',payload,op)->>'replayed'='true','lost publication response revalidated obsolete source';
 rejected:=false;BEGIN PERFORM api.publish_portal_menus('RESRUN999999E201',payload||jsonb_build_object('request_id','00000000-0000-4000-a000-00000000e212'),op);EXCEPTION WHEN SQLSTATE 'PT409' THEN rejected:=true;END;
 ASSERT rejected,'published extraction reused for new intention';
 -- Use a fresh source baseline for quota/uncertain/day-boundary tests.
 refs:=jsonb_set(refs,'{0,expected}',internal.restaurant_carte_link_snapshot('RESRUN999999E201',doc));
 ctx:=api.menu_extraction_context('RESRUN999999E201',refs,NULL)->'context';
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 PERFORM api.seal_menu_extraction(op2,u,'RESRUN999999E201',refs,NULL,ctx,jsonb_set(stats,'{0,selectedPages}','[1,2]'),2,'{}');
 PERFORM set_config('request.jwt.claims',claims::text,true);
 rejected:=false;BEGIN PERFORM api.reserve_menu_extraction(op2);EXCEPTION WHEN SQLSTATE 'PT429' THEN rejected:=true;END;
 ASSERT rejected,'quota overspend accepted';
 ASSERT (SELECT reserved_pages=0 AND consumed_pages=1 FROM internal.menu_extraction_day WHERE user_id=u AND local_day=day),'failed reserve charged quota';
 UPDATE internal.menu_extraction_settings SET daily_page_limit=3 WHERE singleton;
 PERFORM api.reserve_menu_extraction(op2);
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 PERFORM api.cancel_menu_extraction_before_dispatch(op2,claim,'synthetic_preparation_failure');
 ASSERT (SELECT reserved_pages=0 AND consumed_pages=1 FROM internal.menu_extraction_day WHERE user_id=u AND local_day=day),'unspent reservation not released';
 PERFORM api.seal_menu_extraction(op3,u,'RESRUN999999E201',refs,NULL,ctx,stats,1,'{}');
 PERFORM set_config('request.jwt.claims',claims::text,true);
 PERFORM api.reserve_menu_extraction(op3);PERFORM api.claim_menu_extraction(op3,claim);
 ASSERT api.mark_menu_extraction_started(op3,claim)->>'started'='true';
 UPDATE internal.menu_extraction_operation SET started_at=now()-interval '3 minutes' WHERE id=op3;
 ASSERT api.get_menu_extraction(op3)->>'state'='uncertain';
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 PERFORM api.cancel_menu_extraction_before_dispatch(op3,claim,'timeout');
 ASSERT (SELECT consumed_pages=2 AND reserved_pages=0 FROM internal.menu_extraction_day WHERE user_id=u AND local_day=day),'uncertain paid request refunded';
 PERFORM api.finish_menu_extraction(op3,claim,NULL,'provider_timeout');
 ASSERT (SELECT state='failed' FROM internal.menu_extraction_operation WHERE id=op3),'late completion was lost';
 PERFORM api.seal_menu_extraction(op4,u,'RESRUN999999E201',refs,NULL,ctx,stats,1,'{}');
 PERFORM set_config('request.jwt.claims',claims::text,true);
 PERFORM api.reserve_menu_extraction(op4);PERFORM api.claim_menu_extraction(op4,claim);
 UPDATE internal.menu_extraction_day SET reserved_pages=reserved_pages-1 WHERE user_id=u AND local_day=day;
 INSERT INTO internal.menu_extraction_day(user_id,local_day,reserved_pages) VALUES(u,day-1,1);
 UPDATE internal.menu_extraction_operation SET local_day=day-1 WHERE id=op4;
 ASSERT api.mark_menu_extraction_started(op4,claim)->>'started'='false','old-day reservation bypassed current-day quota';
 ASSERT (SELECT reserved_pages=0 FROM internal.menu_extraction_day WHERE user_id=u AND local_day=day-1);
 ASSERT (SELECT consumed_pages=2 AND reserved_pages=0 FROM internal.menu_extraction_day WHERE user_id=u AND local_day=day);
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 PERFORM api.seal_menu_extraction('00000000-0000-4000-a000-00000000e220',u,'RESRUN999999E201',refs,NULL,ctx,stats,1,'{}');
 PERFORM set_config('request.jwt.claims',claims::text,true);
 PERFORM api.reserve_menu_extraction('00000000-0000-4000-a000-00000000e220');PERFORM api.claim_menu_extraction('00000000-0000-4000-a000-00000000e220',claim);
 PERFORM api.mark_menu_extraction_started('00000000-0000-4000-a000-00000000e220',claim);
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 PERFORM api.finish_menu_extraction('00000000-0000-4000-a000-00000000e220',claim,NULL,'non_dispatch');
 ASSERT (SELECT state='failed' AND error_code='non_dispatch' FROM internal.menu_extraction_operation WHERE id='00000000-0000-4000-a000-00000000e220'),'lost-start acknowledgement not terminal';
 ASSERT (SELECT consumed_pages=3 AND reserved_pages=0 FROM internal.menu_extraction_day WHERE user_id=u AND local_day=day),'non_dispatch silently refunded quota';
 PERFORM set_config('request.jwt.claims',claims::text,true);
 DELETE FROM public.actor_object_role WHERE actor_id=a;
 rejected:=false;BEGIN PERFORM api.get_menu_extraction(op);EXCEPTION WHEN insufficient_privilege THEN rejected:=true;END;
 ASSERT rejected,'revoked actor read persisted draft';
END $test$;
ROLLBACK;
