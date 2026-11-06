-- Real SQL contracts in a disposable fresh-apply database. Synthetic identities
-- only; every fixture, temporary actor grant and activation rolls back.
\set ON_ERROR_STOP on
CREATE TEMP TABLE album_fresh_function_state AS
  SELECT p.oid, p.prosrc, p.proacl::text AS acl, p.proconfig
  FROM pg_proc p WHERE p.oid IN (
    'internal.portal_photo_actor_writes_enabled()'::regprocedure,
    'api.reserve_portal_photo_upload(text,uuid,uuid)'::regprocedure,
    'api.cancel_portal_photo_upload(text,uuid)'::regprocedure,
    'api.withdraw_portal_photo(text,uuid)'::regprocedure,
    'api.update_portal_photo_texts(text,uuid,jsonb,text,text)'::regprocedure,
    'api.appeal_portal_photo_review(text,uuid,uuid,text,uuid)'::regprocedure
  );
BEGIN;
SET LOCAL statement_timeout='60s';
SET LOCAL lock_timeout='5s';
\ir ../checks/assert_partner_photo_album_catalog.sql
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);

DO $structure$
DECLARE v record; v_oid regprocedure;
BEGIN
  ASSERT internal.portal_photo_actor_writes_enabled() IS FALSE, 'Fresh actor writes must be closed';
  ASSERT (SELECT count(*) FROM internal.portal_photo_analysis_settings)=1;
  ASSERT EXISTS(SELECT 1 FROM internal.portal_photo_analysis_settings
    WHERE singleton AND NOT enabled AND daily_analysis_limit IS NULL AND provider_id IS NULL),
    'Fresh photo AI must be disabled and unconfigured';
  FOREACH v_oid IN ARRAY ARRAY[
    'internal.portal_photo_actor_writes_enabled()'::regprocedure,
    'internal.portal_photo_assert_writes_open()'::regprocedure,
    'internal.portal_photo_text_snapshot(text,text,jsonb,jsonb,text)'::regprocedure,
    'internal.portal_photo_order_snapshot(text)'::regprocedure,
    'internal.portal_photo_workspace_json(text,uuid)'::regprocedure,
    'internal.update_portal_photo_texts(text,uuid,boolean,jsonb,text,text)'::regprocedure,
    'internal.portal_photo_appeal_document(uuid)'::regprocedure
  ] LOOP
    ASSERT NOT has_function_privilege('anon',v_oid,'EXECUTE');
    ASSERT NOT has_function_privilege('authenticated',v_oid,'EXECUTE'), 'Internal album helpers must stay private';
  END LOOP;
  FOR v IN SELECT * FROM (VALUES
    ('api.get_my_portal_photo_workspace(text)',true,false),
    ('api.save_object_gallery(text,jsonb)',true,false),
    ('api.get_gallery_write_receipt(text,uuid)',true,false),
    ('api.portal_photo_preview(uuid)',true,false),
    ('api.get_portal_photo_review(uuid)',true,false),
    ('api.list_my_portal_photos(text)',true,false),
    ('api.can_read_object_for_correction(text)',true,false),
    ('api.get_portal_photo_analysis(uuid)',true,false),
    ('api.update_portal_photo_texts(text,uuid,jsonb,text,text)',false,false),
    ('api.update_portal_photo_proposal_texts(text,uuid,jsonb,text,text)',false,false),
    ('api.reconcile_portal_photo_order(text,jsonb,jsonb)',false,false),
    ('api.appeal_portal_photo_review(text,uuid,uuid,text,uuid)',false,false),
    ('api.withdraw_portal_photo(text,uuid)',false,false),
    ('api.reserve_portal_photo_upload(text,uuid,uuid)',false,false),
    ('api.cancel_portal_photo_upload(text,uuid)',false,false),
    ('api.complete_portal_photo_upload(uuid,uuid,text,text,integer,integer)',false,false),
    ('api.reserve_portal_photo_analysis(text,uuid,uuid)',false,false),
    ('api.start_portal_photo_analysis(uuid,uuid)',false,false),
    ('api.appeal_portal_photo_analysis(uuid,text,uuid)',false,false),
    ('api.reorder_portal_photos(text,jsonb)',false,false),
    ('api.send_portal_message(text,text,text,jsonb,text,uuid)',false,false),
    ('api.finish_portal_photo_analysis(uuid,uuid,jsonb)',false,true)
  ) x(signature,authenticated_execute,service_execute) LOOP
    v_oid:=to_regprocedure(v.signature);
    ASSERT v_oid IS NOT NULL, format('Missing exact signature %s',v.signature);
    ASSERT NOT has_function_privilege('anon',v_oid,'EXECUTE'), format('Anonymous grant on %s',v.signature);
    ASSERT has_function_privilege('authenticated',v_oid,'EXECUTE')=v.authenticated_execute,
      format('Unexpected fresh authenticated grant on %s',v.signature);
    -- Service_role is checked on the deliberately closed actor mutations and
    -- on its dedicated analysis finalizer, rather than assuming default ACLs.
    IF NOT v.authenticated_execute THEN
      ASSERT has_function_privilege('service_role',v_oid,'EXECUTE')=v.service_execute,
        format('Unexpected fresh service grant on %s',v.signature);
    END IF;
    ASSERT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=v_oid AND p.prosecdef
      AND pg_get_userbyid(p.proowner)='postgres'), format('Unreviewed owner/definer on %s',v.signature);
  END LOOP;
  FOR v IN SELECT * FROM (VALUES
    ('internal.gallery_write_receipt'),('internal.portal_photo_analysis_settings'),('internal.portal_photo_analysis')
  ) x(table_name) LOOP
    ASSERT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=to_regclass(v.table_name) AND c.relrowsecurity),
      format('Missing or unprotected table %s',v.table_name);
    ASSERT NOT has_table_privilege('authenticated',v.table_name,'SELECT,INSERT,UPDATE,DELETE');
    ASSERT NOT has_table_privilege('anon',v.table_name,'SELECT,INSERT,UPDATE,DELETE');
  END LOOP;
  ASSERT (SELECT count(*) FROM pg_policy WHERE polrelid IN ('public.media'::regclass,'public.ref_document'::regclass)
    AND polname IN ('gallery_photo_no_direct_insert','gallery_photo_no_direct_update','gallery_photo_no_direct_delete',
      'portal_photo_receipt_no_direct_insert','portal_photo_receipt_no_direct_update','portal_photo_receipt_no_direct_delete')
    AND NOT polpermissive AND polroles @> ARRAY['anon'::regrole::oid,'authenticated'::regrole::oid]
    AND cardinality(polroles)=2)=6, 'The six exact-role restrictive boundaries must exist';
  ASSERT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.pending_change'::regclass
    AND tgname='gallery_bind_photo_proposal' AND NOT tgisinternal);
  ASSERT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.pending_change'::regclass
    AND tgname='gallery_capture_photo_proposal_usage' AND NOT tgisinternal);
  ASSERT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.pending_change'::regclass
    AND tgname='trg_pending_change_notifications' AND NOT tgisinternal), 'Ordinary contributor notification trigger was removed';
END; $structure$;

INSERT INTO public.object(id,object_type,name,status,is_test) VALUES
  ('ORGRUN999999AF01','ORG','Album fixture office one','published',false),
  ('ORGRUN999999AF02','ORG','Album fixture office two','published',false),
  ('HOTRUN999999AF01','HOT','Album fixture hotel one','published',false),
  ('HOTRUN999999AF02','HOT','Album fixture hotel two','published',false);
INSERT INTO public.object_org_link(object_id,org_object_id,role_id,is_primary)
  SELECT o.id,CASE o.id WHEN 'HOTRUN999999AF01' THEN 'ORGRUN999999AF01' ELSE 'ORGRUN999999AF02' END,r.id,true
  FROM public.object o CROSS JOIN public.ref_org_role r
  WHERE o.id IN ('HOTRUN999999AF01','HOTRUN999999AF02') AND r.code='publisher';
INSERT INTO public.actor(id,display_name,is_test) VALUES
  ('00000000-0000-4000-a000-00000000ad21','Album fixture actor one',false),
  ('00000000-0000-4000-a000-00000000ad22','Album fixture actor two',false);
INSERT INTO auth.users(id,email) VALUES
  ('00000000-0000-4000-a000-00000000ad11','album-office-one@example.invalid'),
  ('00000000-0000-4000-a000-00000000ad12','album-office-two@example.invalid'),
  ('00000000-0000-4000-a000-00000000ad13','album-actor-one@example.invalid'),
  ('00000000-0000-4000-a000-00000000ad14','album-actor-two@example.invalid');
INSERT INTO public.app_user_profile(id,role,actor_id) VALUES
  ('00000000-0000-4000-a000-00000000ad11','tourism_agent',NULL),
  ('00000000-0000-4000-a000-00000000ad12','tourism_agent',NULL),
  ('00000000-0000-4000-a000-00000000ad13','actor','00000000-0000-4000-a000-00000000ad21'),
  ('00000000-0000-4000-a000-00000000ad14','actor','00000000-0000-4000-a000-00000000ad22')
ON CONFLICT(id) DO UPDATE SET role=EXCLUDED.role,actor_id=EXCLUDED.actor_id;
INSERT INTO public.user_org_membership(user_id,org_object_id,is_active) VALUES
  ('00000000-0000-4000-a000-00000000ad11','ORGRUN999999AF01',true),
  ('00000000-0000-4000-a000-00000000ad12','ORGRUN999999AF02',true);
INSERT INTO public.user_org_business_role(membership_id,role_id,is_active)
  SELECT m.id,r.id,true FROM public.user_org_membership m CROSS JOIN public.ref_org_business_role r
  WHERE m.user_id IN ('00000000-0000-4000-a000-00000000ad11','00000000-0000-4000-a000-00000000ad12') AND r.code='editor';
INSERT INTO public.user_permission(user_id,permission_id,is_active,granted_by)
  SELECT u.id,p.id,true,'00000000-0000-4000-a000-00000000ad11'::uuid
  FROM auth.users u CROSS JOIN public.ref_permission p
  WHERE u.id IN ('00000000-0000-4000-a000-00000000ad11','00000000-0000-4000-a000-00000000ad12')
    AND p.code='edit_canonical_when_publisher';
INSERT INTO public.actor_object_role(actor_id,object_id,role_id,is_primary)
  SELECT CASE o.id WHEN 'HOTRUN999999AF01' THEN '00000000-0000-4000-a000-00000000ad21'::uuid ELSE '00000000-0000-4000-a000-00000000ad22'::uuid END,
    o.id,r.id,true FROM public.object o CROSS JOIN public.ref_actor_role r
  WHERE o.id IN ('HOTRUN999999AF01','HOTRUN999999AF02') AND r.code='operator';
INSERT INTO public.media(id,object_id,media_type_id,url,title,position,is_main,is_published,visibility)
  SELECT ('00000000-0000-4000-a000-00000000ad3'||n)::uuid,'HOTRUN999999AF01',t.id,
    'https://example.invalid/album-fresh/'||n||'.jpg','Initial photo '||n,n,n=1,true,CASE WHEN n=3 THEN 'private' ELSE 'public' END
  FROM generate_series(1,3) n CROSS JOIN public.ref_code_media_type t WHERE t.code='photo';
INSERT INTO public.media(id,object_id,media_type_id,url,title,position,is_main,is_published,visibility)
  SELECT '00000000-0000-4000-a000-00000000ad34','HOTRUN999999AF02',id,
    'https://example.invalid/album-fresh/foreign.jpg','Foreign photo',1,true,true,'public'
  FROM public.ref_code_media_type WHERE code='photo';

DO $office$
DECLARE v_request jsonb; v_next jsonb; v_result jsonb; v_expected jsonb; v_current jsonb; v_other jsonb; v_private jsonb;
  v_type uuid; v_rows integer; v_denied boolean; v_stale boolean;
BEGIN
  SELECT id INTO STRICT v_type FROM public.ref_code_media_type WHERE code='photo';
  SELECT to_jsonb(m) INTO STRICT v_expected FROM public.media m WHERE id='00000000-0000-4000-a000-00000000ad31';
  v_request:=jsonb_build_object('write_contract','gallery-patch-v1','request_id','00000000-0000-4000-a000-00000000ad41',
    'rows',jsonb_build_array(jsonb_build_object('id','00000000-0000-4000-a000-00000000ad31','expected',v_expected,
      'changes',jsonb_build_object('title','First office edit'))),'deleted','[]'::jsonb);
  PERFORM set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-00000000ad11","role":"authenticated"}',true);
  SET LOCAL ROLE authenticated;
  ASSERT api.user_can_write_object_canonical('HOTRUN999999AF01') IS TRUE,
    'The positive office fixture needs actual canonical publisher authority';
  ASSERT api.is_platform_superuser() IS FALSE, 'Office coverage must not bypass scope through superuser';
  v_result:=api.save_object_gallery('HOTRUN999999AF01',v_request);
  ASSERT EXISTS(SELECT 1 FROM jsonb_array_elements(v_result->'snapshot') p
    WHERE p->>'id'='00000000-0000-4000-a000-00000000ad31' AND p->>'title'='First office edit'),
    'Office writes must work while the actor flag is closed';
  v_stale:=false;
  BEGIN
    PERFORM api.save_object_gallery('HOTRUN999999AF01',jsonb_set(
      jsonb_set(v_request,'{request_id}','"00000000-0000-4000-a000-00000000ad42"'),
      '{rows,0,changes,title}','"Stale office edit"'));
  EXCEPTION WHEN SQLSTATE 'PT409' THEN v_stale:=true;
  END;
  ASSERT v_stale, 'A stale expected snapshot overwrote an office edit';
  RESET ROLE;
  ASSERT EXISTS(SELECT 1 FROM internal.gallery_write_receipt WHERE object_id='HOTRUN999999AF01'
    AND user_id='00000000-0000-4000-a000-00000000ad11' AND request_id='00000000-0000-4000-a000-00000000ad41' AND request=v_request);
  ASSERT NOT EXISTS(SELECT 1 FROM internal.gallery_write_receipt WHERE request_id='00000000-0000-4000-a000-00000000ad42');
  SELECT to_jsonb(m) INTO v_current FROM public.media m WHERE id='00000000-0000-4000-a000-00000000ad31';
  v_next:=jsonb_set(jsonb_set(v_request,'{request_id}','"00000000-0000-4000-a000-00000000ad43"'),'{rows,0,expected}',v_current);
  v_next:=jsonb_set(v_next,'{rows,0,changes,title}','"Later office edit"');
  SET LOCAL ROLE authenticated;
  PERFORM api.save_object_gallery('HOTRUN999999AF01',v_next);
  v_result:=api.save_object_gallery('HOTRUN999999AF01',v_request);
  ASSERT v_result->'replayed'='true'::jsonb;
  ASSERT EXISTS(SELECT 1 FROM jsonb_array_elements(v_result->'snapshot') p
    WHERE p->>'id'='00000000-0000-4000-a000-00000000ad31' AND p->>'title'='Later office edit'),
    'Delayed replay returned or restored the earlier state';
  ASSERT api.get_gallery_write_receipt('HOTRUN999999AF01','00000000-0000-4000-a000-00000000ad41')->'snapshot'=v_result->'snapshot';
  v_denied:=false;
  BEGIN
    PERFORM api.save_object_gallery('HOTRUN999999AF01',jsonb_set(v_request,'{rows,0,changes,title}','"Different reused intent"'));
  EXCEPTION WHEN invalid_parameter_value THEN v_denied:=true;
  END;
  ASSERT v_denied, 'A reused request id accepted a different intention';
  RESET ROLE;

  -- Promotion arrives first; the real writer must demote the current main first.
  SELECT to_jsonb(m) INTO v_current FROM public.media m WHERE id='00000000-0000-4000-a000-00000000ad31';
  SELECT to_jsonb(m) INTO v_other FROM public.media m WHERE id='00000000-0000-4000-a000-00000000ad32';
  v_next:=jsonb_build_object('write_contract','gallery-patch-v1','request_id','00000000-0000-4000-a000-00000000ad44',
    'rows',jsonb_build_array(
      jsonb_build_object('id','00000000-0000-4000-a000-00000000ad32','expected',v_other,'changes',jsonb_build_object('is_main',true)),
      jsonb_build_object('id','00000000-0000-4000-a000-00000000ad31','expected',v_current,'changes',jsonb_build_object('is_main',false))),
    'deleted','[]'::jsonb);
  SET LOCAL ROLE authenticated;
  PERFORM api.save_object_gallery('HOTRUN999999AF01',v_next);
  RESET ROLE;
  ASSERT (SELECT count(*) FROM public.media WHERE object_id='HOTRUN999999AF01' AND is_main)=1;
  ASSERT (SELECT is_main FROM public.media WHERE id='00000000-0000-4000-a000-00000000ad32');

  -- A deletion followed by a stale row must roll back both data and its receipt.
  SELECT to_jsonb(m) INTO v_private FROM public.media m WHERE id='00000000-0000-4000-a000-00000000ad33';
  v_next:=jsonb_set(v_request,'{request_id}','"00000000-0000-4000-a000-00000000ad45"');
  v_next:=jsonb_set(v_next,'{deleted}',jsonb_build_array(jsonb_build_object('id','00000000-0000-4000-a000-00000000ad33','expected',v_private)));
  SET LOCAL ROLE authenticated;
  v_stale:=false;
  BEGIN PERFORM api.save_object_gallery('HOTRUN999999AF01',v_next);
  EXCEPTION WHEN SQLSTATE 'PT409' THEN v_stale:=true; END;
  ASSERT v_stale;
  RESET ROLE;
  ASSERT EXISTS(SELECT 1 FROM public.media WHERE id='00000000-0000-4000-a000-00000000ad33');
  ASSERT NOT EXISTS(SELECT 1 FROM internal.gallery_write_receipt WHERE request_id='00000000-0000-4000-a000-00000000ad45');

  -- Actual office create/delete also work without opening the actor switch.
  v_next:=jsonb_build_object('write_contract','gallery-patch-v1','request_id','00000000-0000-4000-a000-00000000ad47',
    'rows',jsonb_build_array(jsonb_build_object('id','00000000-0000-4000-a000-00000000ad38','expected',NULL,
      'changes',jsonb_build_object('media_type_id',v_type,'url','https://example.invalid/album-fresh/office-added.jpg',
        'visibility','public','is_published',true,'is_main',false,'position',4))), 'deleted','[]'::jsonb);
  SET LOCAL ROLE authenticated;
  v_result:=api.save_object_gallery('HOTRUN999999AF01',v_next);
  ASSERT EXISTS(SELECT 1 FROM jsonb_array_elements(v_result->'snapshot') p WHERE p->>'id'='00000000-0000-4000-a000-00000000ad38');
  RESET ROLE;
  SELECT to_jsonb(m) INTO STRICT v_current FROM public.media m WHERE id='00000000-0000-4000-a000-00000000ad38';
  v_next:=jsonb_build_object('write_contract','gallery-patch-v1','request_id','00000000-0000-4000-a000-00000000ad48',
    'rows','[]'::jsonb,'deleted',jsonb_build_array(jsonb_build_object('id','00000000-0000-4000-a000-00000000ad38','expected',v_current)));
  SET LOCAL ROLE authenticated;
  v_result:=api.save_object_gallery('HOTRUN999999AF01',v_next);
  ASSERT NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_result->'snapshot') p WHERE p->>'id'='00000000-0000-4000-a000-00000000ad38');
  RESET ROLE;
  ASSERT NOT EXISTS(SELECT 1 FROM public.media WHERE id='00000000-0000-4000-a000-00000000ad38');

  SET LOCAL ROLE authenticated;
  v_denied:=false;
  BEGIN INSERT INTO public.media(object_id,media_type_id,url,visibility)
    VALUES('HOTRUN999999AF01',v_type,'https://example.invalid/album-fresh/raw-bypass.jpg','public');
  EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
  ASSERT v_denied, 'Direct root-photo INSERT bypassed the CAS writer';
  UPDATE public.media SET title='Direct bypass' WHERE id='00000000-0000-4000-a000-00000000ad32';
  GET DIAGNOSTICS v_rows=ROW_COUNT;
  ASSERT v_rows=0, 'Direct root-photo UPDATE was not blocked';
  DELETE FROM public.media WHERE id='00000000-0000-4000-a000-00000000ad32';
  GET DIAGNOSTICS v_rows=ROW_COUNT;
  ASSERT v_rows=0, 'Direct root-photo DELETE was not blocked';
  -- The boundary is photo-specific: an unrelated video still uses canonical DML.
  INSERT INTO public.media(id,object_id,media_type_id,url,is_published,visibility)
    SELECT '00000000-0000-4000-a000-00000000ad39','HOTRUN999999AF01',id,
      'https://example.invalid/album-fresh/video.mp4',true,'public' FROM public.ref_code_media_type WHERE code='video';
  RESET ROLE;
  ASSERT EXISTS(SELECT 1 FROM public.media WHERE id='00000000-0000-4000-a000-00000000ad39');
  ASSERT EXISTS(SELECT 1 FROM public.media WHERE id='00000000-0000-4000-a000-00000000ad32' AND title<>'Direct bypass');

  PERFORM set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-00000000ad12","role":"authenticated"}',true);
  SET LOCAL ROLE authenticated;
  ASSERT api.user_can_write_object_canonical('HOTRUN999999AF02') IS TRUE, 'Other-ORG positive control is empty';
  ASSERT api.user_can_write_object_canonical('HOTRUN999999AF01') IS FALSE;
  v_denied:=false;
  BEGIN PERFORM api.save_object_gallery('HOTRUN999999AF01',v_request);
  EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
  ASSERT v_denied, 'A different ORG wrote the gallery';
  v_denied:=false;
  BEGIN PERFORM api.get_gallery_write_receipt('HOTRUN999999AF01','00000000-0000-4000-a000-00000000ad41');
  EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
  ASSERT v_denied, 'A different ORG read an office receipt';
  -- A valid writer of the OTHER fiche cannot target a row from this fiche.
  v_denied:=false;
  BEGIN PERFORM api.save_object_gallery('HOTRUN999999AF02',jsonb_set(v_request,'{request_id}','"00000000-0000-4000-a000-00000000ad46"'));
  EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
  ASSERT v_denied, 'Cross-fiche row substitution passed the writer';
  RESET ROLE;
END; $office$;

-- A resolved proposal is a real private read/appeal witness, but consumes no
-- reservation. It must remain readable while actor writes are closed.
INSERT INTO public.ref_document(id,url,title,storage_bucket,storage_path,access_scope,extra)
VALUES('00000000-0000-4000-a000-00000000ad70',
 'storage://actor-documents/portal-photos/00000000-0000-4000-a000-00000000ad21/00000000-0000-4000-a000-00000000ad70.jpg',
 'Private refused fixture','actor-documents',
 'portal-photos/00000000-0000-4000-a000-00000000ad21/00000000-0000-4000-a000-00000000ad70.jpg','crm_private',
 jsonb_build_object('source','portal_photo','object_id','HOTRUN999999AF01','upload_complete',true,
  'upload_sha256',repeat('a',64),'slot_contract','photo-stock-v1','slot_state','uploaded',
  'slot_pending_change_id','00000000-0000-4000-a000-00000000ad72'));
INSERT INTO public.actor_document(actor_id,document_id,title,created_by)
VALUES('00000000-0000-4000-a000-00000000ad21','00000000-0000-4000-a000-00000000ad70',
 'Private refused fixture','00000000-0000-4000-a000-00000000ad13');
INSERT INTO public.fiche_submission(id,object_id,actor_id,submitted_by,status,resolved_at)
VALUES('00000000-0000-4000-a000-00000000ad71','HOTRUN999999AF01',
 '00000000-0000-4000-a000-00000000ad21','00000000-0000-4000-a000-00000000ad13','rejected',now());
INSERT INTO public.pending_change(id,object_id,target_table,action,payload,submitted_by,status,
 submission_id,metadata,review_note,reviewed_at)
VALUES('00000000-0000-4000-a000-00000000ad72','HOTRUN999999AF01','media','insert',
 '{"additions":[{"upload_id":"00000000-0000-4000-a000-00000000ad70"}]}',
 '00000000-0000-4000-a000-00000000ad13','rejected','00000000-0000-4000-a000-00000000ad71',
 '{"rpc":"publish_portal_photo_additions"}','Synthetic refusal',now());

DO $personas$
DECLARE v_workspace jsonb; v_photo jsonb; v_proposal jsonb; v_result jsonb; v_interaction uuid;
  v_denied boolean; v_detail text; v_n integer;
BEGIN
  PERFORM set_config('request.jwt.claims','{"role":"anon"}',true);
  SET LOCAL ROLE anon;
  v_denied:=false;
  BEGIN PERFORM api.get_my_portal_photo_workspace('HOTRUN999999AF01');
  EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
  ASSERT v_denied;
  v_denied:=false;
  BEGIN PERFORM api.save_object_gallery('HOTRUN999999AF01','{}'::jsonb);
  EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
  ASSERT v_denied;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-00000000ad13","role":"authenticated"}',true);
  SET LOCAL ROLE authenticated;
  v_workspace:=api.get_my_portal_photo_workspace('HOTRUN999999AF01');
  ASSERT jsonb_array_length(v_workspace->'published')=2, 'Actor positive read witness is empty or includes private media';
  ASSERT v_workspace->'writesEnabled'='false'::jsonb AND v_workspace->'analysisEnabled'='false'::jsonb;
  v_photo:=v_workspace->'published'->0;
  ASSERT (v_photo->'textSnapshot') ?& ARRAY['title','description','title_i18n','description_i18n','revision'],
    'The text snapshot must retain nullable keys as well as its revision';
  ASSERT COALESCE(v_photo->'textSnapshot'->>'revision','')<>'', 'A populated photo needs a nonempty optimistic revision';
  ASSERT v_photo ? 'portalDocumentId' AND v_photo->'portalDocumentId'='null'::jsonb,
    'A public office photo retains the nullable portal document key';
  SELECT p INTO STRICT v_proposal FROM jsonb_array_elements(v_workspace->'proposals') p
    WHERE p->>'documentId'='00000000-0000-4000-a000-00000000ad70';
  ASSERT v_proposal->>'status'='refused' AND v_proposal->'canAppeal'='false'::jsonb,
    'A populated refused proposal must explicitly disable appeal in the closed state';
  ASSERT (v_proposal->'textSnapshot') ?& ARRAY['title','description','title_i18n','description_i18n','revision']
    AND COALESCE(v_proposal->'textSnapshot'->>'revision','')<>''
    AND v_proposal->'textSnapshot'->'description'='null'::jsonb,
    'A private proposal snapshot must preserve nullable fields and a nonempty revision';
  v_result:=api.portal_photo_preview('00000000-0000-4000-a000-00000000ad70');
  ASSERT v_result->>'bucket'='actor-documents'
    AND v_result->>'path'='portal-photos/00000000-0000-4000-a000-00000000ad21/00000000-0000-4000-a000-00000000ad70.jpg';
  v_denied:=false;
  BEGIN PERFORM api.get_my_portal_photo_workspace('HOTRUN999999AF02');
  EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
  ASSERT v_denied, 'Actor read another actor fiche';
  v_denied:=false;
  BEGIN PERFORM api.save_object_gallery('HOTRUN999999AF01','{}'::jsonb);
  EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
  ASSERT v_denied, 'Actor reached the office writer';
  RESET ROLE;

  PERFORM set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-00000000ad11","role":"authenticated"}',true);
  SET LOCAL ROLE authenticated;
  ASSERT api.can_read_object_for_correction('HOTRUN999999AF01')
    AND api.user_can_read_crm_actor('00000000-0000-4000-a000-00000000ad21'), 'Office read witness lacks its real scopes';
  v_denied:=false;
  BEGIN PERFORM api.portal_photo_preview('00000000-0000-4000-a000-00000000ad70');
  EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
  ASSERT v_denied, 'A resolved private photo without a linked appeal leaked to an office';
  RESET ROLE;
  PERFORM set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-00000000ad13","role":"authenticated"}',true);

  -- Temporarily grant the route to exercise its CLOSED runtime guard as well.
  GRANT EXECUTE ON FUNCTION api.reserve_portal_photo_upload(text,uuid,uuid),
    api.cancel_portal_photo_upload(text,uuid),api.withdraw_portal_photo(text,uuid),
    api.update_portal_photo_texts(text,uuid,jsonb,text,text),
    api.appeal_portal_photo_review(text,uuid,uuid,text,uuid) TO authenticated;
  SET LOCAL ROLE authenticated;
  v_denied:=false;
  BEGIN PERFORM api.reserve_portal_photo_upload('HOTRUN999999AF01','00000000-0000-4000-a000-00000000ad61');
  EXCEPTION WHEN SQLSTATE 'PT409' THEN GET STACKED DIAGNOSTICS v_detail=PG_EXCEPTION_DETAIL; v_denied:=v_detail='photo_writes_closed'; END;
  ASSERT v_denied, 'Runtime closure depended only on the EXECUTE grant';
  v_denied:=false;
  BEGIN PERFORM api.appeal_portal_photo_review('HOTRUN999999AF01','00000000-0000-4000-a000-00000000ad70',
    '00000000-0000-4000-a000-00000000ad72','Please review this synthetic refusal','00000000-0000-4000-a000-00000000ad73');
  EXCEPTION WHEN SQLSTATE 'PT409' THEN GET STACKED DIAGNOSTICS v_detail=PG_EXCEPTION_DETAIL; v_denied:=v_detail='photo_writes_closed'; END;
  ASSERT v_denied, 'The closed appeal route depended only on its EXECUTE grant';
  RESET ROLE;
  -- Local test activation only: this CREATE OR REPLACE and every grant roll back.
  CREATE OR REPLACE FUNCTION internal.portal_photo_actor_writes_enabled() RETURNS boolean
    LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $enabled$ SELECT true; $enabled$;
  SET LOCAL ROLE authenticated;
  v_workspace:=api.get_my_portal_photo_workspace('HOTRUN999999AF01');
  ASSERT v_workspace->'writesEnabled'='true'::jsonb AND v_workspace->'analysisEnabled'='false'::jsonb;
  SELECT p INTO STRICT v_proposal FROM jsonb_array_elements(v_workspace->'proposals') p
    WHERE p->>'documentId'='00000000-0000-4000-a000-00000000ad70';
  ASSERT v_proposal->'canAppeal'='true'::jsonb, 'Activated refusal fixture is not actually appealable';
  ASSERT NOT has_function_privilege('authenticated','api.send_portal_message(text,text,text,jsonb,text,uuid)','EXECUTE'),
    'The internal generic sender must remain closed throughout the appeal test';
  v_interaction:=api.appeal_portal_photo_review('HOTRUN999999AF01','00000000-0000-4000-a000-00000000ad70',
    '00000000-0000-4000-a000-00000000ad72','Please review this synthetic refusal','00000000-0000-4000-a000-00000000ad73');
  ASSERT v_interaction IS NOT NULL AND v_interaction=api.appeal_portal_photo_review('HOTRUN999999AF01',
    '00000000-0000-4000-a000-00000000ad70','00000000-0000-4000-a000-00000000ad72',
    'Please review this synthetic refusal','00000000-0000-4000-a000-00000000ad73'), 'The specialized appeal must replay idempotently';
  v_workspace:=api.get_my_portal_photo_workspace('HOTRUN999999AF01');
  SELECT p INTO STRICT v_proposal FROM jsonb_array_elements(v_workspace->'proposals') p
    WHERE p->>'documentId'='00000000-0000-4000-a000-00000000ad70';
  ASSERT v_proposal->'reviewAppeal'->>'interactionId'=v_interaction::text
    AND v_proposal->'canAppeal'='false'::jsonb, 'The real appeal receipt was not reflected in the workspace';
  v_photo:=v_workspace->'published'->0;
  v_result:=api.update_portal_photo_texts('HOTRUN999999AF01',(v_photo->>'id')::uuid,v_photo->'textSnapshot',
    'Actor text fixture','Actor description fixture');
  ASSERT EXISTS(SELECT 1 FROM jsonb_array_elements(v_result->'published') p WHERE p->>'title'='Actor text fixture');
  PERFORM api.reserve_portal_photo_upload('HOTRUN999999AF01','00000000-0000-4000-a000-00000000ad61');
  PERFORM api.reserve_portal_photo_upload('HOTRUN999999AF01','00000000-0000-4000-a000-00000000ad61');
  v_denied:=false;
  BEGIN PERFORM api.reserve_portal_photo_upload('HOTRUN999999AF02','00000000-0000-4000-a000-00000000ad62');
  EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
  ASSERT v_denied, 'Activated actor bypassed fiche scope';
  ASSERT api.cancel_portal_photo_upload('HOTRUN999999AF01','00000000-0000-4000-a000-00000000ad61')->>'cancelled'='true';
  -- Two published photos plus eighteen reservations fill exactly twenty slots.
  FOR v_n IN 1..18 LOOP
    PERFORM api.reserve_portal_photo_upload('HOTRUN999999AF01',
      ('00000000-0000-4000-a610-'||lpad(v_n::text,12,'0'))::uuid);
  END LOOP;
  v_denied:=false;
  BEGIN PERFORM api.reserve_portal_photo_upload('HOTRUN999999AF01','00000000-0000-4000-a610-000000000019');
  EXCEPTION WHEN SQLSTATE 'PT409' THEN GET STACKED DIAGNOSTICS v_detail=PG_EXCEPTION_DETAIL; v_denied:=v_detail='photo_limit'; END;
  ASSERT v_denied, 'Twenty-first combined published/reserved slot was accepted';
  RESET ROLE;
  ASSERT internal.gallery_photo_usage('HOTRUN999999AF01')=20, 'Quota negative control did not actually fill twenty slots';
  ASSERT NOT EXISTS(SELECT 1 FROM public.ref_document WHERE id='00000000-0000-4000-a610-000000000019'),
    'Failed quota reservation left a receipt';
  ASSERT (SELECT count(*) FROM public.ref_document WHERE id='00000000-0000-4000-a000-00000000ad61')=1,
    'Idempotent reservation created duplicate receipts';
  ASSERT NOT EXISTS(SELECT 1 FROM public.ref_document WHERE id='00000000-0000-4000-a000-00000000ad62');
  ASSERT NOT EXISTS(SELECT 1 FROM internal.portal_photo_analysis), 'Disabled IA unexpectedly started an operation';

  -- The photo appeal and a CRM attachment use separate private document paths.
  INSERT INTO public.ref_document(id,url,title,storage_bucket,storage_path,access_scope,extra)
  VALUES('00000000-0000-4000-a000-00000000ad74',
    'storage://actor-documents/portal-messages/00000000-0000-4000-a000-00000000ad21/00000000-0000-4000-a000-00000000ad74.pdf',
    'Private message attachment','actor-documents',
    'portal-messages/00000000-0000-4000-a000-00000000ad21/00000000-0000-4000-a000-00000000ad74.pdf','crm_private',
    jsonb_build_object('source','portal_message','object_id','HOTRUN999999AF01','interaction_id',v_interaction));
  INSERT INTO public.actor_document(actor_id,document_id,title,created_by)
  VALUES('00000000-0000-4000-a000-00000000ad21','00000000-0000-4000-a000-00000000ad74',
    'Private message attachment','00000000-0000-4000-a000-00000000ad13');
  SET LOCAL ROLE authenticated;
  v_result:=api.list_portal_message_documents(v_interaction);
  ASSERT v_result ?& ARRAY['documents','replyTo','photoReview'] AND v_result->'replyTo'='null'::jsonb
    AND v_result->'photoReview'='null'::jsonb AND jsonb_array_length(v_result->'documents')=1,
    'The actor message response must retain all keys without exposing the office review capability';
  ASSERT api.portal_message_document('00000000-0000-4000-a000-00000000ad74')->>'path'
    LIKE 'portal-messages/%';
  RESET ROLE;
  PERFORM set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-00000000ad11","role":"authenticated"}',true);
  SET LOCAL ROLE authenticated;
  v_result:=api.list_portal_message_documents(v_interaction);
  ASSERT v_result->'photoReview'->>'documentId'='00000000-0000-4000-a000-00000000ad70'
    AND jsonb_array_length(v_result->'documents')=1, 'The linked office appeal read was lost';
  ASSERT api.portal_photo_preview('00000000-0000-4000-a000-00000000ad70')->>'path'
    ='portal-photos/00000000-0000-4000-a000-00000000ad21/00000000-0000-4000-a000-00000000ad70.jpg';
  ASSERT api.portal_message_document('00000000-0000-4000-a000-00000000ad74')->>'path' LIKE 'portal-messages/%';
  v_denied:=false;
  BEGIN PERFORM api.portal_message_document('00000000-0000-4000-a000-00000000ad70');
  EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
  ASSERT v_denied, 'A private photo was accepted as a generic CRM attachment';
  v_denied:=false;
  BEGIN PERFORM api.portal_photo_preview('00000000-0000-4000-a000-00000000ad74');
  EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
  ASSERT v_denied, 'A CRM attachment was accepted by the photo preview';
  RESET ROLE;
  FOR v_n IN 1..2 LOOP
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',CASE v_n
      WHEN 1 THEN '00000000-0000-4000-a000-00000000ad12' ELSE '00000000-0000-4000-a000-00000000ad14' END,
      'role','authenticated')::text,true);
    SET LOCAL ROLE authenticated;
    v_denied:=false;
    BEGIN PERFORM api.list_portal_message_documents(v_interaction);
    EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
    ASSERT v_denied, 'A foreign office or actor read the appeal conversation';
    v_denied:=false;
    BEGIN PERFORM api.portal_photo_preview('00000000-0000-4000-a000-00000000ad70');
    EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
    ASSERT v_denied, 'A foreign office or actor obtained the private photo preview';
    v_denied:=false;
    BEGIN PERFORM api.portal_message_document('00000000-0000-4000-a000-00000000ad74');
    EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
    ASSERT v_denied, 'A foreign office or actor obtained the CRM attachment';
    RESET ROLE;
  END LOOP;
END; $personas$;
ROLLBACK;

DO $rolled_back$
DECLARE v_row record;
BEGIN
  ASSERT internal.portal_photo_actor_writes_enabled() IS FALSE, 'Test activation escaped its transaction';
  FOR v_row IN SELECT * FROM album_fresh_function_state LOOP
    ASSERT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=v_row.oid AND p.prosrc=v_row.prosrc
      AND p.proacl::text IS NOT DISTINCT FROM v_row.acl AND p.proconfig IS NOT DISTINCT FROM v_row.proconfig),
      'A temporary test grant or helper definition survived rollback';
  END LOOP;
  ASSERT NOT EXISTS(SELECT 1 FROM auth.users WHERE id IN (
    '00000000-0000-4000-a000-00000000ad11','00000000-0000-4000-a000-00000000ad12',
    '00000000-0000-4000-a000-00000000ad13','00000000-0000-4000-a000-00000000ad14'));
  ASSERT NOT EXISTS(SELECT 1 FROM public.object WHERE id IN (
    'ORGRUN999999AF01','ORGRUN999999AF02','HOTRUN999999AF01','HOTRUN999999AF02'));
  RAISE NOTICE 'Fresh photo-only album: closed grants/AI, real publisher office CAS/receipts/replay, cross-ORG/anonymous denial and rolled-back actor activation passed';
END; $rolled_back$;
DROP TABLE album_fresh_function_state;
