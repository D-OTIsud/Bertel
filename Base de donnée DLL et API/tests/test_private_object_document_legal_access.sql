-- DB07 legal-only reader and direct metadata RLS; synthetic transaction only.
\set ON_ERROR_STOP on
BEGIN;
SELECT set_config('request.jwt.claims','{}',true);
INSERT INTO public.object(id,object_type,name,status) VALUES
 ('ORGRUN9970080001','ORG','DB07 legal synthetic A','published'),
 ('ORGRUN9970080002','ORG','DB07 legal synthetic B','published'),
 ('HOTRUN9970080001','HOT','DB07 legal object A','draft'),
 ('HOTRUN9970080002','HOT','DB07 legal object B','draft');
INSERT INTO public.org_config(org_object_id,access_scope) VALUES
 ('ORGRUN9970080001','own_objects_only'),('ORGRUN9970080002','own_objects_only');
INSERT INTO public.object_org_link(object_id,org_object_id,role_id,is_primary)
 SELECT x.object_id,x.org_id,r.id,true FROM (VALUES
 ('HOTRUN9970080001','ORGRUN9970080001'),('HOTRUN9970080002','ORGRUN9970080002'))x(object_id,org_id)
 CROSS JOIN public.ref_org_role r WHERE r.code='publisher';
INSERT INTO auth.users(id,email) VALUES
 ('00000000-0000-4000-a000-000000007801','db07-legal-a@example.invalid'),
 ('00000000-0000-4000-a000-000000007802','db07-legal-b@example.invalid');
INSERT INTO public.app_user_profile(id,role) VALUES
 ('00000000-0000-4000-a000-000000007801','tourism_agent'),
 ('00000000-0000-4000-a000-000000007802','tourism_agent') ON CONFLICT(id) DO UPDATE SET role=excluded.role;
INSERT INTO public.user_org_membership(user_id,org_object_id,is_active) VALUES
 ('00000000-0000-4000-a000-000000007801','ORGRUN9970080001',true),
 ('00000000-0000-4000-a000-000000007802','ORGRUN9970080002',true);
INSERT INTO public.user_org_business_role(membership_id,role_id,is_active)
 SELECT m.id,r.id,true FROM public.user_org_membership m CROSS JOIN public.ref_org_business_role r
 WHERE m.user_id IN ('00000000-0000-4000-a000-000000007801','00000000-0000-4000-a000-000000007802') AND r.code='viewer';
INSERT INTO public.user_permission(user_id,permission_id,is_active)
 SELECT u.id,p.id,true FROM auth.users u CROSS JOIN public.ref_permission p
 WHERE u.id IN ('00000000-0000-4000-a000-000000007801','00000000-0000-4000-a000-000000007802') AND p.code='manage_legal_compliance';
INSERT INTO public.ref_document(id,url,title,access_scope,storage_bucket,storage_path,extra) VALUES
 ('00000000-0000-4000-a000-000000007811','https://example.invalid/synthetic-legacy-a.pdf','DB07 legal A','legal_private','old_legal_media','synthetic-legal-a.pdf',
 '{"bertel_pj_import":{"mapped_object_id":"HOTRUN9970080001"}}'),
 ('00000000-0000-4000-a000-000000007812','private:00000000-0000-4000-a000-000000007812','DB07 legal B','legal_private','legal-documents','HOTRUN9970080002/synthetic.pdf','{}'),
 ('00000000-0000-4000-a000-000000007813','https://example.invalid/public-legal.pdf','DB07 public legal','public',NULL,NULL,'{}'),
 ('00000000-0000-4000-a000-000000007814','https://example.invalid/unlinked.pdf','DB07 unlinked private','legal_private','old_legal_media','synthetic-unlinked.pdf',
 '{"bertel_pj_import":{"mapped_object_id":"HOTRUN9970080001"}}');
INSERT INTO public.object_legal(object_id,type_id,value,document_id,validity_mode,valid_from)
 SELECT x.object_id,t.id,'{"value":"synthetic"}'::jsonb,x.doc::uuid,'forever',current_date+x.day_offset FROM (VALUES
 ('HOTRUN9970080001','00000000-0000-4000-a000-000000007811',-1),
 ('HOTRUN9970080002','00000000-0000-4000-a000-000000007812',-1),
 ('HOTRUN9970080002','00000000-0000-4000-a000-000000007811',-2))x(object_id,doc,day_offset)
 CROSS JOIN public.ref_legal_type t WHERE t.code='kbis';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-000000007802","role":"authenticated"}',true);
DO $test$ DECLARE r jsonb; BEGIN
 ASSERT api.user_can_manage_object_legal('HOTRUN9970080002') IS TRUE,'B has the real dedicated legal permission on B';
 ASSERT api.can_read_extended('HOTRUN9970080002') IS TRUE,'B preserves the existing legal-row read scope';
 ASSERT COALESCE(api.user_can_manage_object_legal('HOTRUN9970080001'),false)=false,'B has no legal right on A';
 ASSERT api.user_can_write_object_canonical('HOTRUN9970080002') IS FALSE,'legal-only B is not canonical';
 ASSERT api.user_can_attach_object_document('HOTRUN9970080002') IS FALSE,'legal-only B is not general attachment writer';
 ASSERT (SELECT count(*) FROM public.ref_document WHERE id='00000000-0000-4000-a000-000000007812')=1,'B metadata positive';
 ASSERT (SELECT count(*) FROM public.ref_document WHERE id='00000000-0000-4000-a000-000000007813')=1,'public metadata positive';
 ASSERT (SELECT count(*) FROM public.ref_document WHERE id='00000000-0000-4000-a000-000000007811')=0,'forged B legal link must not reveal A metadata or legacy URL';
 r:=api.get_legal_object_document_file('HOTRUN9970080002','00000000-0000-4000-a000-000000007812');
 ASSERT r->>'authorized'='true' AND r#>>'{file,path}'='HOTRUN9970080002/synthetic.pdf','existing legal-only B reader opens its exact native document';
 ASSERT api.get_legal_object_document_file('HOTRUN9970080002','00000000-0000-4000-a000-000000007811')->'file'='null'::jsonb,'legal signer refuses graft';
 ASSERT api.get_legal_object_document_file('HOTRUN9970080001','00000000-0000-4000-a000-000000007811')->>'authorized'='false','legal signer refuses foreign object';
 ASSERT api.get_object_document_file('HOTRUN9970080002','00000000-0000-4000-a000-000000007812')->>'authorized'='false','canonical/Classification signing gate remains closed';
 ASSERT api.get_active_object_documents('HOTRUN9970080002')->>'authorized'='false','canonical document card remains closed';
END; $test$;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-000000007801","role":"authenticated"}',true);
DO $test$ DECLARE r jsonb; BEGIN
 ASSERT api.user_can_write_object_canonical('HOTRUN9970080001') IS FALSE,'legal-only A remains non-canonical';
 ASSERT (SELECT count(*) FROM public.ref_document WHERE id='00000000-0000-4000-a000-000000007811')=1,'A metadata positive under real RLS';
 r:=api.get_legal_object_document_file('HOTRUN9970080001','00000000-0000-4000-a000-000000007811');
 ASSERT r->>'authorized'='true' AND r#>>'{file,path}'='synthetic-legal-a.pdf','legal-only A opens its exact imported document';
 ASSERT api.get_legal_object_document_file('HOTRUN9970080001','00000000-0000-4000-a000-000000007814')->'file'='null'::jsonb,'mapping alone never replaces the required legal association';
 ASSERT (SELECT count(*) FROM public.ref_document WHERE id='00000000-0000-4000-a000-000000007814')=0,'an unlinked private import is not exposed to a legal-only reader';
END; $test$;
RESET ROLE;
UPDATE public.user_permission SET is_active=false WHERE user_id='00000000-0000-4000-a000-000000007801' AND permission_id=(SELECT id FROM public.ref_permission WHERE code='manage_legal_compliance');
SET LOCAL ROLE authenticated;
DO $test$ BEGIN
 ASSERT (SELECT count(*) FROM public.ref_document WHERE id='00000000-0000-4000-a000-000000007811')=0,'same-JWT legal revocation hides metadata';
 ASSERT api.get_legal_object_document_file('HOTRUN9970080001','00000000-0000-4000-a000-000000007811')->>'authorized'='false','same-JWT legal revocation denies the next signature';
 ASSERT api.user_can_write_object_canonical('HOTRUN9970080001') IS FALSE,'revocation never grants canonical';
END; $test$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $test$ BEGIN
 ASSERT (SELECT count(*) FROM public.ref_document WHERE id='00000000-0000-4000-a000-000000007813')=1,'anonymous public metadata preserved';
 ASSERT (SELECT count(*) FROM public.ref_document WHERE id IN('00000000-0000-4000-a000-000000007811','00000000-0000-4000-a000-000000007812'))=0,'anonymous private metadata refused';
END; $test$;
ROLLBACK;
