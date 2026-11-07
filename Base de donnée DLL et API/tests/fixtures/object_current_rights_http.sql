-- Disposable CI only. Auth identities already exist as confirmed GoTrue users.
\set ON_ERROR_STOP on
\if :{?current_rights_http_disposable}
\else
\quit 3
\endif
\if :current_rights_http_disposable
\else
\quit 3
\endif
\ir object_current_rights.sql
BEGIN;
-- Keep one explicit current membership in each witness; Auth onboarding is a
-- separate contract and must not accidentally grant this matrix an extra scope.
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
UPDATE public.user_org_membership SET is_active=false WHERE user_id IN(
 '00000000-0000-4000-a000-00000000ae11','00000000-0000-4000-a000-00000000ae12',
 '00000000-0000-4000-a000-00000000ae13','00000000-0000-4000-a000-00000000ae14',
 '00000000-0000-4000-a000-00000000ae15','00000000-0000-4000-a000-00000000ae16');
DELETE FROM public.user_permission WHERE user_id IN(
 '00000000-0000-4000-a000-00000000ae11','00000000-0000-4000-a000-00000000ae12',
 '00000000-0000-4000-a000-00000000ae13','00000000-0000-4000-a000-00000000ae14',
 '00000000-0000-4000-a000-00000000ae15','00000000-0000-4000-a000-00000000ae16');
SELECT pg_temp.setup_current_rights_fixture(true) IS NOT NULL AS fixture_created;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
INSERT INTO public.user_org_membership(id,user_id,org_object_id,is_active) VALUES
 ('00000000-0000-4000-a000-00000000ab12','00000000-0000-4000-a000-00000000ae12','ORGRUN999999AR02',true),
 ('00000000-0000-4000-a000-00000000ab16','00000000-0000-4000-a000-00000000ae16','ORGRUN999999AR03',true);
INSERT INTO public.app_user_profile(id,role,actor_id) VALUES('00000000-0000-4000-a000-00000000ae16','tourism_agent',NULL)
 ON CONFLICT(id) DO UPDATE SET role=EXCLUDED.role,actor_id=NULL;
INSERT INTO public.user_org_business_role(membership_id,role_id,is_active)
 SELECT membership.id,roles.id,true FROM public.user_org_membership membership
 CROSS JOIN public.ref_org_business_role roles
 WHERE membership.id IN('00000000-0000-4000-a000-00000000ab12','00000000-0000-4000-a000-00000000ab16') AND roles.code='editor';
INSERT INTO public.org_role_permission(org_object_id,role_id,permission_id,is_active,granted_by)
 SELECT org,roles.id,permission.id,true,'00000000-0000-4000-a000-00000000ae15'
 FROM unnest(ARRAY['ORGRUN999999AR02','ORGRUN999999AR03']) AS orgs(org)
 CROSS JOIN public.ref_org_business_role roles CROSS JOIN public.ref_permission permission
 WHERE roles.code='editor' AND permission.code IN('edit_canonical_when_publisher','publish_object')
 ON CONFLICT ON CONSTRAINT org_role_permission_uniq DO UPDATE SET is_active=true;
UPDATE public.object SET status='published' WHERE id='HOTRUN999999AR05';
-- Produce genuine nonempty version history without changing publication semantics.
UPDATE public.object SET name=name||' history two' WHERE id IN('HOTRUN999999AR01','HOTRUN999999AR03');
INSERT INTO public.ref_document(id,url,title,storage_bucket,storage_path,access_scope,valid_from,extra) VALUES
 ('00000000-0000-4000-a000-00000000ae41','storage://old_legal_media/synthetic-http.pdf','Synthetic HTTP legal witness',
 'old_legal_media','synthetic-http.pdf','legal_private',CURRENT_DATE-1,
 jsonb_build_object('bertel_pj_import',jsonb_build_object('version','bertel_pj_reviewed_20260908_v1',
 'mapped_object_id','HOTRUN999999AR01','document_category','legal','document_type_code','juridique','display_status','active')));
INSERT INTO public.ref_document(id,url,title,storage_bucket,storage_path,access_scope,extra) VALUES
 ('00000000-0000-4000-a000-00000000ae42',
 'storage://actor-documents/portal-photos/00000000-0000-4000-a000-00000000aa01/00000000-0000-4000-a000-00000000ae42.jpg',
 'Synthetic HTTP photo locator','actor-documents',
 'portal-photos/00000000-0000-4000-a000-00000000aa01/00000000-0000-4000-a000-00000000ae42.jpg','crm_private',
 jsonb_build_object('source','portal_photo','object_id','HOTRUN999999AR01','upload_complete',true,'upload_sha256',repeat('a',64)));
INSERT INTO public.actor_document(actor_id,document_id,title,created_by) VALUES
 ('00000000-0000-4000-a000-00000000aa01','00000000-0000-4000-a000-00000000ae42','Synthetic HTTP photo locator','00000000-0000-4000-a000-00000000ae13');
COMMIT;
