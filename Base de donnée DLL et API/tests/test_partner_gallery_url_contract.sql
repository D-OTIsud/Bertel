\set ON_ERROR_STOP on
\ir assert_partner_api_ephemeral.sql
BEGIN;
-- Historical malformed HTTP URL accepted by the existing prefix-only CHECK.
-- The CHECK already rejects javascript:. A title edit must preserve this old value
-- while the RPC rejects newly supplied malformed URLs and unsupported schemes.
UPDATE public.media SET url='https://legacy.example/image with space.jpg' WHERE id='00000000-0000-4000-a501-000000000001';
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-00000000c512","role":"authenticated","app_metadata":{"sandbox_discovery":true}}',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE v_url text;v_type uuid;v_failed boolean;v_expected jsonb;v_res jsonb;
BEGIN
 SELECT id INTO v_type FROM public.ref_code_media_type WHERE code='photo';
 SELECT to_jsonb(m) INTO v_expected FROM public.media m WHERE m.id='00000000-0000-4000-a501-000000000001';
 PERFORM api.save_object_gallery('HOTRUN999999C501',jsonb_build_object('write_contract','gallery-patch-v1','request_id',gen_random_uuid(),
  'rows',jsonb_build_array(jsonb_build_object('id','00000000-0000-4000-a501-000000000001','expected',v_expected,'changes',jsonb_build_object('title','Title only'))),'deleted','[]'::jsonb));
 FOREACH v_url IN ARRAY ARRAY['javascript:alert(1)','data:image/svg+xml,<svg/>','//example.test/image.jpg','https://'] LOOP
  v_failed:=false;
  BEGIN PERFORM api.save_object_gallery('HOTRUN999999C501',jsonb_build_object('write_contract','gallery-patch-v1','request_id',gen_random_uuid(),
   'rows',jsonb_build_array(jsonb_build_object('id','00000000-0000-4000-a000-00000000c5e1','expected',NULL,'changes',jsonb_build_object('media_type_id',v_type,'url',v_url,'visibility','public'))),'deleted','[]'::jsonb));
  EXCEPTION WHEN invalid_parameter_value THEN v_failed:=true;END;ASSERT v_failed,'new unsafe URL accepted: '||v_url;
  SELECT to_jsonb(m) INTO v_expected FROM public.media m WHERE m.id='00000000-0000-4000-a501-000000000001';
  v_failed:=false;
  BEGIN PERFORM api.save_object_gallery('HOTRUN999999C501',jsonb_build_object('write_contract','gallery-patch-v1','request_id',gen_random_uuid(),
   'rows',jsonb_build_array(jsonb_build_object('id','00000000-0000-4000-a501-000000000001','expected',v_expected,'changes',jsonb_build_object('url',v_url))),'deleted','[]'::jsonb));
  EXCEPTION WHEN invalid_parameter_value THEN v_failed:=true;END;ASSERT v_failed,'changed unsafe URL accepted: '||v_url;
 END LOOP;
 SELECT to_jsonb(m) INTO v_expected FROM public.media m WHERE m.id='00000000-0000-4000-a501-000000000001';
 ASSERT v_expected->>'url'='https://legacy.example/image with space.jpg' AND v_expected->>'title'='Title only';
 PERFORM api.save_object_gallery('HOTRUN999999C501',jsonb_build_object('write_contract','gallery-patch-v1','request_id',gen_random_uuid(),
  'rows',jsonb_build_array(jsonb_build_object('id','00000000-0000-4000-a501-000000000001','expected',v_expected,'changes',jsonb_build_object('url','http://example.test/new.jpg'))),'deleted','[]'::jsonb));
END;
$test$;
RESET ROLE;
DO $test$ BEGIN ASSERT (SELECT url='http://example.test/new.jpg' FROM public.media WHERE id='00000000-0000-4000-a501-000000000001');END;$test$;
ROLLBACK;
