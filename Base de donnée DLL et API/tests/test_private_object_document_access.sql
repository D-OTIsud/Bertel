-- DB07. Synthetic fixtures only; actual client roles, shared authorization,
-- imported mapping and active-document producer. No Storage blob operations.
\set ON_ERROR_STOP on
BEGIN;
SELECT set_config('request.jwt.claims', '{}', true);
INSERT INTO public.object(id,object_type,name,status) VALUES
  ('ORGRUN9970070001','ORG','DB07 synthetic ORG A','published'),
  ('ORGRUN9970070002','ORG','DB07 synthetic ORG B','published'),
  ('HOTRUN9970070001','HOT','DB07 synthetic object A','draft'),
  ('HOTRUN9970070002','HOT','DB07 synthetic object B','draft');
INSERT INTO public.org_config(org_object_id,access_scope) VALUES
  ('ORGRUN9970070001','own_objects_only'),('ORGRUN9970070002','own_objects_only');
INSERT INTO public.object_org_link(object_id,org_object_id,role_id,is_primary)
SELECT x.object_id,x.org_id,r.id,true FROM (VALUES
 ('HOTRUN9970070001','ORGRUN9970070001'),('HOTRUN9970070002','ORGRUN9970070002')) x(object_id,org_id)
CROSS JOIN public.ref_org_role r WHERE r.code='publisher';
INSERT INTO auth.users(id,email) VALUES
 ('00000000-0000-4000-a000-000000007701','db07-a@example.invalid'),
 ('00000000-0000-4000-a000-000000007702','db07-b@example.invalid'),
 ('00000000-0000-4000-a000-000000007703','db07-reader@example.invalid');
INSERT INTO public.app_user_profile(id,role) VALUES
 ('00000000-0000-4000-a000-000000007701','tourism_agent'),
 ('00000000-0000-4000-a000-000000007702','tourism_agent'),
 ('00000000-0000-4000-a000-000000007703','tourism_agent')
ON CONFLICT(id) DO UPDATE SET role=excluded.role;
INSERT INTO public.user_org_membership(user_id,org_object_id,is_active) VALUES
 ('00000000-0000-4000-a000-000000007701','ORGRUN9970070001',true),
 ('00000000-0000-4000-a000-000000007702','ORGRUN9970070002',true),
 ('00000000-0000-4000-a000-000000007703','ORGRUN9970070001',true);
INSERT INTO public.user_org_business_role(membership_id,role_id,is_active)
SELECT m.id,r.id,true FROM public.user_org_membership m CROSS JOIN public.ref_org_business_role r
WHERE m.user_id IN ('00000000-0000-4000-a000-000000007701','00000000-0000-4000-a000-000000007702') AND r.code='editor';

INSERT INTO public.ref_document(id,url,title,access_scope,storage_bucket,storage_path,valid_from,valid_to,extra) VALUES
 ('00000000-0000-4000-a000-000000007711','https://example.invalid/legacy-active.pdf','DB07 mapped active','legal_private','old_legal_media','synthetic-active.pdf',current_date-10,current_date+10,
  '{"bertel_pj_import":{"mapped_object_id":"HOTRUN9970070001","version":"bertel_pj_reviewed_20260908_v1"}}'),
 ('00000000-0000-4000-a000-000000007712','https://example.invalid/legacy-expired.pdf','DB07 mapped archive','legal_private','old_legal_media','synthetic-expired.pdf',current_date-20,current_date-1,
  '{"bertel_pj_import":{"mapped_object_id":"HOTRUN9970070001","version":"bertel_pj_reviewed_20260908_v1"}}'),
 ('00000000-0000-4000-a000-000000007713','storage://legal-documents/objects/HOTRUN9970070002/own','DB07 destination private','legal_private','legal-documents','objects/HOTRUN9970070002/own',current_date-10,current_date+10,
  '{"bertel_pj_import":{"mapped_object_id":"HOTRUN9970070002","version":"bertel_pj_reviewed_20260908_v1"}}'),
 ('00000000-0000-4000-a000-000000007714','https://example.invalid/public.pdf','DB07 public evidence','public',NULL,NULL,NULL,NULL,'{}'),
 ('00000000-0000-4000-a000-000000007715','private:00000000-0000-4000-a000-000000007715','DB07 native private evidence','legal_private','legal-documents','HOTRUN9970070001/native.pdf',NULL,NULL,'{}'),
 ('00000000-0000-4000-a000-000000007716','private:00000000-0000-4000-a000-000000007716','DB07 unrelated CRM document','crm_private','actor-documents','actors/synthetic/private.pdf',NULL,NULL,'{}');

-- Real links include deliberate cross-object UUID grafts. A legitimate writer
-- of B must not acquire A's imported or native attachment through either graft.
INSERT INTO public.object_legal(object_id,type_id,value,document_id,validity_mode,valid_from)
SELECT x.object_id,t.id,'{"value":"synthetic"}'::jsonb,x.document_id::uuid,'forever',current_date+x.day_offset
FROM (VALUES
 ('HOTRUN9970070001','00000000-0000-4000-a000-000000007714',0),
 ('HOTRUN9970070001','00000000-0000-4000-a000-000000007715',-1),
 ('HOTRUN9970070001','00000000-0000-4000-a000-000000007716',-2),
 ('HOTRUN9970070002','00000000-0000-4000-a000-000000007711',0),
 ('HOTRUN9970070002','00000000-0000-4000-a000-000000007715',-1)
) x(object_id,document_id,day_offset)
CROSS JOIN public.ref_legal_type t WHERE t.code='kbis';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-000000007701","role":"authenticated"}',true);
DO $test$
DECLARE result jsonb; listing jsonb;
BEGIN
 ASSERT current_user='authenticated' AND auth.uid()='00000000-0000-4000-a000-000000007701'::uuid,'real authenticated A';
 ASSERT api.user_can_write_object_canonical('HOTRUN9970070001') IS TRUE,'non-vacuous canonical right';
 result:=api.get_object_document_file('HOTRUN9970070001','00000000-0000-4000-a000-000000007711');
 ASSERT result->>'authorized'='true' AND result#>>'{file,path}'='synthetic-active.pdf','mapped-only import resolves without a legal link';
 result:=api.get_object_document_file('HOTRUN9970070001','00000000-0000-4000-a000-000000007712');
 ASSERT result#>>'{file,path}'='synthetic-expired.pdf','expiry is not a revocation of editor archive consultation';
 result:=api.get_object_document_file('HOTRUN9970070001','00000000-0000-4000-a000-000000007715');
 ASSERT result#>>'{file,path}'='HOTRUN9970070001/native.pdf','native private namespace and exact legal link retained';
 listing:=api.get_active_object_documents('HOTRUN9970070001');
 ASSERT jsonb_array_length(listing->'documents')=3,'active mapped/native/private and public witnesses are present';
 ASSERT NOT EXISTS(SELECT 1 FROM jsonb_array_elements(listing->'documents') d WHERE d->>'document_id' IN
  ('00000000-0000-4000-a000-000000007712','00000000-0000-4000-a000-000000007716')),'expired/CRM files are not added to the active card';
 ASSERT NOT EXISTS(SELECT 1 FROM jsonb_array_elements(listing->'documents') d WHERE (d->>'requires_signing')::boolean AND d?'url'),'private list never returns a permanent URL';
 ASSERT EXISTS(SELECT 1 FROM jsonb_array_elements(listing->'documents') d WHERE d->>'url'='https://example.invalid/public.pdf'),'public evidence link unchanged';
END;
$test$;

SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-000000007702","role":"authenticated"}',true);
DO $test$
DECLARE result jsonb;
BEGIN
 ASSERT api.user_can_write_object_canonical('HOTRUN9970070002') IS TRUE,'B is a real canonical writer of B';
 result:=api.get_object_document_file('HOTRUN9970070002','00000000-0000-4000-a000-000000007713');
 ASSERT result#>>'{file,bucket}'='legal-documents' AND result#>>'{file,path}'='objects/HOTRUN9970070002/own','B positive destination file';
 result:=api.get_object_document_file('HOTRUN9970070001','00000000-0000-4000-a000-000000007711');
 ASSERT result->>'authorized'='false' AND result->'file'='null'::jsonb,'foreign ORG denied';
 result:=api.get_object_document_file('HOTRUN9970070002','00000000-0000-4000-a000-000000007711');
 ASSERT result->>'authorized'='true' AND result->'file'='null'::jsonb,'forged imported UUID link grants no A file';
 result:=api.get_object_document_file('HOTRUN9970070002','00000000-0000-4000-a000-000000007715');
 ASSERT result->'file'='null'::jsonb,'forged native UUID link grants no A namespace';
 ASSERT jsonb_array_length(api.get_active_object_documents('HOTRUN9970070002')->'documents')=1,'forged links do not leak card metadata';
END;
$test$;

SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-000000007703","role":"authenticated"}',true);
DO $test$
BEGIN
 ASSERT COALESCE(api.user_can_write_object_canonical('HOTRUN9970070001'),false)=false,'reader lacks canonical right';
 ASSERT api.get_object_document_file('HOTRUN9970070001','00000000-0000-4000-a000-000000007711')->>'authorized'='false','membership alone grants no file';
END;
$test$;
SELECT set_config('request.jwt.claims','{}',true);
DO $test$ BEGIN
 ASSERT api.get_object_document_file('HOTRUN9970070001','00000000-0000-4000-a000-000000007711')->>'authorized'='false','missing uid denied';
END; $test$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $test$ BEGIN
 BEGIN
  PERFORM api.get_object_document_file('HOTRUN9970070001','00000000-0000-4000-a000-000000007711');
  RAISE EXCEPTION 'DB07_FAIL anonymous function execution';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END; $test$;
RESET ROLE;

-- Same JWT, current membership revoked. No page reload/token renewal required.
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-000000007701","role":"authenticated"}',true);
UPDATE public.user_org_membership SET is_active=false WHERE user_id='00000000-0000-4000-a000-000000007701';
SET LOCAL ROLE authenticated;
DO $test$ BEGIN
 ASSERT api.get_object_document_file('HOTRUN9970070001','00000000-0000-4000-a000-000000007711')->>'authorized'='false','membership revocation denies the next URL request';
END; $test$;
RESET ROLE;
DO $test$ BEGIN
 ASSERT EXISTS(SELECT 1 FROM pg_policy WHERE polname='legal_documents_server_only' AND polrelid='storage.objects'::regclass AND NOT polpermissive AND polcmd='*'),'destination has the restrictive client gate';
 ASSERT NOT has_function_privilege('anon','api.get_object_document_file(text,uuid)','EXECUTE'),'anon execution revoked';
 ASSERT NOT has_function_privilege('authenticated','internal.object_document_matches_object(uuid,text)','EXECUTE'),'private ownership helper not exposed';
 RAISE NOTICE 'DB07 private document authorization assertions passed; no Storage bytes moved.';
END; $test$;
ROLLBACK;
