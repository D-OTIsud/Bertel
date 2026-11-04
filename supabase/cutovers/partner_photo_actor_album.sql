-- Explicit actor album activation, AFTER compatible client + R5/R6 cutovers.
-- Not part of migration history. Review/apply this file separately; no db push.
BEGIN;
SET LOCAL lock_timeout='500ms';
SET LOCAL statement_timeout='10s';
DO $gate$
DECLARE v record;
BEGIN
 FOR v IN SELECT * FROM (VALUES
  ('api.approve_pending_change(uuid,text,boolean)','ed555f983ff336577c0b87be090a7bfa'),
  ('api.reject_pending_change(uuid,text)','4a7f66b8c90990e479b7d0dbde720e71'),
  ('internal.validate_portal_photo_additions(text,jsonb,uuid)','a3fdd6bae9f521258c7481df06c4b7f5'),
  ('api.publish_portal_photo_additions(text,jsonb)','2cb3dff0a63010819e3a25dfc18fdaa0'),
  ('api.withdraw_portal_photo(text,uuid)','a5bc065728bf99e755a77208f40d2eca'),
  ('api.appeal_portal_photo_analysis(uuid,text,uuid)','9d27522cdf3fb6dd1a54bdff2261ff80'),
  ('api.reconcile_portal_photo_order(text,jsonb,jsonb)','5f56f93a5500abae1b0eee6ca5a081d8'),
  ('internal.update_portal_photo_texts(text,uuid,boolean,jsonb,text,text)','38657a2ee2fb384ba845e56e62643f51'),
  ('api.appeal_portal_photo_review(text,uuid,uuid,text,uuid)','afaeffe50e20a79ebf04532a4f4fad0f'),
  ('internal.gallery_bind_photo_proposal()','0f97bc881ed306ae32fd225655bc719a'),
  ('internal.gallery_capture_photo_proposal_usage()','360ab28205c9a79e000292d0bec340d0'),
  ('api.update_portal_photo_texts(text,uuid,jsonb,text,text)','7e8199850c1fa78dd07b2f6b79158528'),
  ('api.update_portal_photo_proposal_texts(text,uuid,jsonb,text,text)','3607ea1821107f8bb864a990e546cac6'),
  ('api.get_my_portal_photo_workspace(text)','3c0ebe6838a87eb01ac48004d787d785'),
  ('internal.portal_photo_workspace_json(text,uuid)','8dfdc1baa12f0f1ce3160a1ff33a1302'),
  ('api.reserve_portal_photo_upload(text,uuid,uuid)','a5fce4c520cbde65eba79ad79606f1b8'),
  ('api.cancel_portal_photo_upload(text,uuid)','7e3c23242d2facfa131986db2c6908c7'),
  ('api.complete_portal_photo_upload(uuid,uuid,text,text,integer,integer)','9547ed89070d14006643207c3b68ab91'),
  ('api.portal_photo_preview(uuid)','6a616a0f060a8026ce6398c4159222ee'),
  ('api.list_portal_message_documents(uuid)','6f6940df421ddb25985f4c0ce0887236'),
  ('internal.portal_photo_appeal_document(uuid)','07845634e2fc3240ae127f63adf39617')
 ) t(signature,hash) LOOP
  IF to_regprocedure(v.signature) IS NULL OR (SELECT md5(replace(p.prosrc,E'\r\n',E'\n'))
   FROM pg_proc p WHERE p.oid=to_regprocedure(v.signature)) IS DISTINCT FROM v.hash
   OR NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure(v.signature)
    AND pg_get_userbyid(p.proowner)='postgres'
    AND p.prosecdef=(v.signature NOT IN('internal.update_portal_photo_texts(text,uuid,boolean,jsonb,text,text)',
     'internal.portal_photo_workspace_json(text,uuid)','internal.portal_photo_appeal_document(uuid)'))) THEN
   RAISE EXCEPTION 'Actor album: install the reviewed R5/R6/album source before activation (%)',v.signature;
  END IF;
 END LOOP;
 FOR v IN SELECT * FROM (VALUES
  ('api.update_portal_photo_texts(text,uuid,jsonb,text,text)',true,'search_path=pg_catalog,public,api,internal,auth,pg_temp;lock_timeout=5s'),
  ('api.update_portal_photo_proposal_texts(text,uuid,jsonb,text,text)',true,'search_path=pg_catalog,public,api,internal,auth,pg_temp;lock_timeout=5s'),
  ('api.reconcile_portal_photo_order(text,jsonb,jsonb)',true,'search_path=pg_catalog,public,api,internal,auth,pg_temp;lock_timeout=5s'),
  ('api.appeal_portal_photo_review(text,uuid,uuid,text,uuid)',true,'search_path=pg_catalog,public,api,internal,auth,pg_temp;lock_timeout=5s'),
  ('api.get_my_portal_photo_workspace(text)',true,'search_path=pg_catalog,public,api,internal,auth,pg_temp'),
  ('internal.update_portal_photo_texts(text,uuid,boolean,jsonb,text,text)',false,'search_path=pg_catalog,public,api,internal,auth,pg_temp'),
  ('internal.portal_photo_workspace_json(text,uuid)',false,'search_path=pg_catalog,public,api,internal,auth'),
  ('internal.portal_photo_appeal_document(uuid)',false,'search_path=pg_catalog,public,api,internal'),
  ('internal.gallery_capture_photo_proposal_usage()',true,'search_path=pg_catalog,public,internal,pg_temp')
 ) t(signature,definer,config) LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure(v.signature)
   AND pg_get_userbyid(p.proowner)='postgres' AND p.prosecdef=v.definer
   AND regexp_replace(array_to_string(p.proconfig,';'),'[[:space:]]','','g')=v.config
   AND NOT EXISTS(SELECT 1 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a
    WHERE NOT(a.grantee=p.proowner OR (v.signature LIKE 'api.%' AND a.grantee='authenticated'::regrole))
     OR (a.grantee<>p.proowner AND a.is_grantable))) THEN
   RAISE EXCEPTION 'Actor album: unreviewed function attributes or grants (%)',v.signature;
  END IF;
 END LOOP;
 -- Exact targeted restrictions are supplied by the separate R5 cutover. New
 -- RPCs must not coexist with an old root-photo/table writer that bypasses CAS.
 IF EXISTS(SELECT 1 FROM (VALUES
   ('media','gallery_photo_no_direct_insert'),('media','gallery_photo_no_direct_update'),('media','gallery_photo_no_direct_delete'),
   ('ref_document','portal_photo_receipt_no_direct_insert'),('ref_document','portal_photo_receipt_no_direct_update'),('ref_document','portal_photo_receipt_no_direct_delete')
  ) expected(table_name,policy_name) WHERE NOT EXISTS(
   SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname=expected.table_name AND p.polname=expected.policy_name
      AND NOT p.polpermissive AND c.relrowsecurity)) THEN
  RAISE EXCEPTION 'Apply the reviewed R5 targeted DML cutover before actor album activation';
 END IF;
END;
$gate$;

-- Reassert exactly the reviewed R5 predicates, roles and commands in this same
-- transaction. A similarly named permissive/incorrect policy is insufficient.
DROP POLICY gallery_photo_no_direct_insert ON public.media;
CREATE POLICY gallery_photo_no_direct_insert ON public.media AS RESTRICTIVE FOR INSERT TO anon,authenticated
 WITH CHECK(NOT(object_id IS NOT NULL AND place_id IS NULL AND media_type_id IN(SELECT id FROM public.ref_code_media_type WHERE code='photo')));
DROP POLICY gallery_photo_no_direct_update ON public.media;
CREATE POLICY gallery_photo_no_direct_update ON public.media AS RESTRICTIVE FOR UPDATE TO anon,authenticated
 USING(NOT(object_id IS NOT NULL AND place_id IS NULL AND media_type_id IN(SELECT id FROM public.ref_code_media_type WHERE code='photo')))
 WITH CHECK(NOT(object_id IS NOT NULL AND place_id IS NULL AND media_type_id IN(SELECT id FROM public.ref_code_media_type WHERE code='photo')));
DROP POLICY gallery_photo_no_direct_delete ON public.media;
CREATE POLICY gallery_photo_no_direct_delete ON public.media AS RESTRICTIVE FOR DELETE TO anon,authenticated
 USING(NOT(object_id IS NOT NULL AND place_id IS NULL AND media_type_id IN(SELECT id FROM public.ref_code_media_type WHERE code='photo')));
DROP POLICY portal_photo_receipt_no_direct_insert ON public.ref_document;
CREATE POLICY portal_photo_receipt_no_direct_insert ON public.ref_document AS RESTRICTIVE FOR INSERT TO anon,authenticated
 WITH CHECK(COALESCE(extra->>'source','')<>'portal_photo');
DROP POLICY portal_photo_receipt_no_direct_update ON public.ref_document;
CREATE POLICY portal_photo_receipt_no_direct_update ON public.ref_document AS RESTRICTIVE FOR UPDATE TO anon,authenticated
 USING(COALESCE(extra->>'source','')<>'portal_photo') WITH CHECK(COALESCE(extra->>'source','')<>'portal_photo');
DROP POLICY portal_photo_receipt_no_direct_delete ON public.ref_document;
CREATE POLICY portal_photo_receipt_no_direct_delete ON public.ref_document AS RESTRICTIVE FOR DELETE TO anon,authenticated
 USING(COALESCE(extra->>'source','')<>'portal_photo');

-- Baseline-less writes from an older tab stay closed, even after activation.
REVOKE ALL ON FUNCTION api.reorder_portal_photos(text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION api.update_portal_photo_texts(text,uuid,jsonb,text,text),
 api.update_portal_photo_proposal_texts(text,uuid,jsonb,text,text),api.reconcile_portal_photo_order(text,jsonb,jsonb),
 api.appeal_portal_photo_review(text,uuid,uuid,text,uuid),api.withdraw_portal_photo(text,uuid),
 api.reserve_portal_photo_upload(text,uuid,uuid),api.cancel_portal_photo_upload(text,uuid),
 api.reserve_portal_photo_analysis(text,uuid,uuid),api.start_portal_photo_analysis(uuid,uuid),api.appeal_portal_photo_analysis(uuid,text,uuid)
 TO authenticated;
GRANT EXECUTE ON FUNCTION api.complete_portal_photo_upload(uuid,uuid,text,text,integer,integer) TO service_role;
CREATE OR REPLACE FUNCTION internal.portal_photo_actor_writes_enabled() RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $fn$
 SELECT true;
$fn$;
REVOKE ALL ON FUNCTION internal.portal_photo_actor_writes_enabled() FROM PUBLIC,anon,authenticated,service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
