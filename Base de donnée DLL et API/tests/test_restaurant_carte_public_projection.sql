-- V18: real C publication -> real public reader. Run AFTER R1/R3a in both scenarios.
-- Storage rows are synthetic receipt fixtures; real bytes/HTTP are proved separately.
\set ON_ERROR_STOP on
\ir assert_partner_api_ephemeral.sql
BEGIN;
DO $test$
DECLARE
 u uuid:='00000000-0000-4000-a000-00000000c401'; a uuid:='00000000-0000-4000-a000-00000000c402';
 upload_id uuid:='00000000-0000-4000-a000-00000000c403'; menu_id uuid:='00000000-0000-4000-a000-00000000c404';
 actor_role uuid; carte_role uuid; doc uuid; receipt jsonb; payload jsonb; result jsonb; actual jsonb;
 expected jsonb; expected_public jsonb; menu_before jsonb; claims jsonb; public_url text;
BEGIN
 IF current_setting('bertel.ephemeral_ci',true) IS DISTINCT FROM 'on' THEN RAISE EXCEPTION 'Ephemeral CI database only'; END IF;
 -- A normal-realm synthetic fixture reaches the same public projection as the
 -- partner API service role. It exists ONLY inside this guarded rollback test.
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 INSERT INTO auth.users(id,email) VALUES(u,'carte-projection-c401@example.test');
 INSERT INTO public.actor(id,display_name,is_test) VALUES(a,'Carte projection actor',false);
 INSERT INTO public.app_user_profile(id,role,actor_id) VALUES(u,'actor',a)
 ON CONFLICT(id) DO UPDATE SET role='actor',actor_id=EXCLUDED.actor_id;
 INSERT INTO public.object(id,object_type,name,status,is_test) VALUES
  ('RESRUN999999C401','RES','C integrated public projection','published',false),
  ('RESRUN999999C402','RES','C independent shared reference','published',false);
 SELECT id INTO actor_role FROM public.ref_actor_role WHERE code='operator';
 SELECT id INTO carte_role FROM public.ref_code_document_type WHERE code='carte';
 INSERT INTO public.actor_object_role(actor_id,object_id,role_id,is_primary) VALUES(a,'RESRUN999999C401',actor_role,true);
 INSERT INTO public.object_menu(id,object_id,name,visibility) VALUES(menu_id,'RESRUN999999C401','Independent text menu','public');
 INSERT INTO public.object_menu_item(menu_id,name,price) VALUES(menu_id,'Independent dish',12.50);
 UPDATE internal.restaurant_carte_rollout SET partner_enabled=true WHERE singleton;
 SET LOCAL ROLE service_role;
 actual:=api.get_object_resource('RESRUN999999C401')::jsonb;
 RESET ROLE;
 ASSERT actual->>'id'='RESRUN999999C401','Published fixture missing from actual reader';
 ASSERT actual->'menu_documents'='[]'::jsonb,'Fixture must start with an empty document array';
 menu_before:=actual->'menus';
 ASSERT jsonb_array_length(menu_before)=1,'Independent menu fixture not returned';
 claims:=jsonb_build_object('sub',u,'role','authenticated');
 PERFORM set_config('request.jwt.claims',claims::text,true);
 SET LOCAL ROLE authenticated;
 receipt:=api.prepare_restaurant_carte_upload('RESRUN999999C401',upload_id,'carte.pdf',repeat('c',64),32,'application/pdf');
 RESET ROLE;
 doc:=(receipt->>'documentId')::uuid;
 public_url:='https://project.example/storage/v1/object/public/documents/'||(receipt->>'publicPath');
 INSERT INTO storage.objects(bucket_id,name) VALUES('restaurant-cartes-private',receipt->>'stagingPath'),('documents',receipt->>'publicPath');
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 SET LOCAL ROLE service_role;
 PERFORM api.record_restaurant_carte_staged(upload_id,repeat('c',64));
 PERFORM api.record_restaurant_carte_copied(upload_id,repeat('c',64),public_url);
 RESET ROLE;
 PERFORM set_config('request.jwt.claims',claims::text,true);
 payload:=jsonb_build_object('write_contract','restaurant-carte-v1','action','publish','upload_id',upload_id,'expected','null'::jsonb,
  'patch',jsonb_build_object('title','Carte du jour','valid_from',CURRENT_DATE::text,'valid_to',CURRENT_DATE::text,'position',1));
 SET LOCAL ROLE authenticated;
 PERFORM api.prepare_restaurant_carte_mutation('RESRUN999999C401','00000000-0000-4000-a000-00000000c410',payload);
 result:=api.finalize_restaurant_carte_mutation('00000000-0000-4000-a000-00000000c410');
 RESET ROLE;
 ASSERT result->>'requestId'='00000000-0000-4000-a000-00000000c410';
 ASSERT (SELECT access_scope='public' AND url=public_url AND valid_from IS NULL AND valid_to IS NULL FROM public.ref_document WHERE id=doc),
  'C did not finalize a public unbounded document';
 expected_public:=jsonb_build_array(jsonb_build_object('document_id',doc,'url',public_url,'title','Carte du jour',
  'valid_from',CURRENT_DATE,'valid_to',CURRENT_DATE,'position',1));
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 SET LOCAL ROLE service_role;
 actual:=api.get_object_resource('RESRUN999999C401')::jsonb;
 RESET ROLE;
 ASSERT actual->'menu_documents'=expected_public,'New C publication missing or public document keys/types/dates changed';
 ASSERT actual->'menus'=menu_before,'Publishing a file changed independent text menus';
 -- A future and an expired LINK are excluded, while the document is retained.
 FOR payload IN SELECT value FROM jsonb_array_elements(jsonb_build_array(
   jsonb_build_object('valid_from',(CURRENT_DATE+1)::text,'valid_to',(CURRENT_DATE+1)::text),
   jsonb_build_object('valid_from',(CURRENT_DATE-1)::text,'valid_to',(CURRENT_DATE-1)::text),
   jsonb_build_object('valid_from',CURRENT_DATE::text,'valid_to',CURRENT_DATE::text))) LOOP
  PERFORM set_config('request.jwt.claims',claims::text,true);
  SET LOCAL ROLE authenticated;
  SELECT value->'expected' INTO expected FROM jsonb_array_elements(api.read_restaurant_cartes('RESRUN999999C401')) WHERE value->>'documentId'=doc::text;
  result:=jsonb_build_object('write_contract','restaurant-carte-v1','action','metadata','document_id',doc,'expected',expected,'patch',payload);
  receipt:=jsonb_build_object('id',gen_random_uuid());
  PERFORM api.prepare_restaurant_carte_mutation('RESRUN999999C401',(receipt->>'id')::uuid,result);
  PERFORM api.finalize_restaurant_carte_mutation((receipt->>'id')::uuid);
  RESET ROLE;
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  SET LOCAL ROLE service_role;
  actual:=api.get_object_resource('RESRUN999999C401')::jsonb;
  RESET ROLE;
  ASSERT actual->'menu_documents'=CASE WHEN payload->>'valid_from'=CURRENT_DATE::text THEN expected_public ELSE '[]'::jsonb END,
   'Public projection ignored future/expired/inclusive link dates';
  ASSERT actual->'menus'=menu_before,'Changing card dates changed independent text menus';
 END LOOP;
 -- Document dates are an additional gate; they do not replace valid link dates.
 UPDATE public.ref_document SET valid_from=CURRENT_DATE+1,valid_to=CURRENT_DATE+1 WHERE id=doc;
 SET LOCAL ROLE service_role;
 actual:=api.get_object_resource('RESRUN999999C401')::jsonb;
 RESET ROLE;
 ASSERT actual->'menu_documents'='[]'::jsonb,'Future document leaked despite a current link';
 UPDATE public.ref_document SET valid_from=CURRENT_DATE-1,valid_to=CURRENT_DATE-1 WHERE id=doc;
 SET LOCAL ROLE service_role;
 actual:=api.get_object_resource('RESRUN999999C401')::jsonb;
 RESET ROLE;
 ASSERT actual->'menu_documents'='[]'::jsonb,'Expired document leaked despite a current link';
 UPDATE public.ref_document SET valid_from=CURRENT_DATE,valid_to=CURRENT_DATE WHERE id=doc;
 SET LOCAL ROLE service_role;
 actual:=api.get_object_resource('RESRUN999999C401')::jsonb;
 RESET ROLE;
 ASSERT actual->'menu_documents'=expected_public,'Inclusive document boundary hid a valid C publication';
 -- Shared reference is fixture setup, not an ordinary user bypass of C.
 INSERT INTO public.object_document(object_id,document_id,role_id,title,position) VALUES('RESRUN999999C402',doc,carte_role,'Shared carte',1);
 PERFORM set_config('request.jwt.claims',claims::text,true);
 SET LOCAL ROLE authenticated;
 SELECT value->'expected' INTO expected FROM jsonb_array_elements(api.read_restaurant_cartes('RESRUN999999C401')) WHERE value->>'documentId'=doc::text;
 payload:=jsonb_build_object('write_contract','restaurant-carte-v1','action','remove','document_id',doc,'expected',expected);
 PERFORM api.prepare_restaurant_carte_mutation('RESRUN999999C401','00000000-0000-4000-a000-00000000c411',payload);
 PERFORM api.finalize_restaurant_carte_mutation('00000000-0000-4000-a000-00000000c411');
 RESET ROLE;
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 SET LOCAL ROLE service_role;
 actual:=api.get_object_resource('RESRUN999999C401')::jsonb;
 result:=api.get_object_resource('RESRUN999999C402')::jsonb;
 RESET ROLE;
 ASSERT actual->'menu_documents'='[]'::jsonb,'C withdrawal remained in public API projection';
 ASSERT actual->'menus'=menu_before,'C withdrawal changed independent text menus';
 ASSERT result->'menu_documents'=jsonb_build_array(jsonb_build_object('document_id',doc,'url',public_url,'title','Shared carte',
  'valid_from',NULL,'valid_to',NULL,'position',1)),'C withdrawal changed another object shared reference';
 ASSERT EXISTS(SELECT 1 FROM public.ref_document WHERE id=doc AND url=public_url),'C withdrawal destroyed public/shared metadata';
 ASSERT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='documents' AND name='RESRUN999999C401/cartes/'||upload_id::text||'.pdf'),
  'C withdrawal destroyed immutable public Storage metadata';
 RAISE NOTICE 'V18: C published, dated and withdrew through real actor RPCs; service-role public reader preserved document JSON and unrelated menus';
END $test$;
ROLLBACK;
