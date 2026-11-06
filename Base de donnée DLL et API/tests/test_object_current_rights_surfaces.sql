-- Full Supabase surface contracts. All metadata fixtures/proposals/receipts roll back.
-- No blob, provider call, e-mail dispatch or signed URL is created here.
\set ON_ERROR_STOP on
BEGIN; SET LOCAL statement_timeout='90s'; SET LOCAL lock_timeout='5s';
\ir fixtures/object_current_rights.sql
DO $surfaces$
DECLARE
  f jsonb:=pg_temp.setup_current_rights_fixture(); v_min integer; v_public_min integer; v_result jsonb; v_payload jsonb; v_proposal jsonb;
  v_denied boolean; v_sql text; v_before text; v_after text; v_submission uuid; v_rows integer;
  v_writer text:='{"sub":"00000000-0000-4000-a000-00000000ae11","role":"authenticated","email":"current-rights-writer@example.invalid"}';
  v_portal text:='{"sub":"00000000-0000-4000-a000-00000000ae13","role":"authenticated","email":"current-rights-portal@example.invalid"}';
BEGIN
  -- Legal metadata retains its specialist permission; canonical editing alone
  -- must not grant it. The same current business-role removal revokes both.
  INSERT INTO public.org_role_permission(org_object_id,role_id,permission_id,is_active,granted_by)
    SELECT 'ORGRUN999999AR01',r.id,p.id,true,'00000000-0000-4000-a000-00000000ae15'
    FROM public.ref_org_business_role r CROSS JOIN public.ref_permission p
    WHERE r.code='editor' AND p.code='manage_legal_compliance' AND p.is_active
    ON CONFLICT ON CONSTRAINT org_role_permission_uniq DO UPDATE SET is_active=true;
  GET DIAGNOSTICS v_rows=ROW_COUNT;
  ASSERT v_rows=1, 'Legal positive requires a real current specialist permission';
  UPDATE public.object SET name='Synthetic private history version two' WHERE id='HOTRUN999999AR01';
  UPDATE public.object SET name='Synthetic public history version two' WHERE id='HOTRUN999999AR03';
  SELECT min(version_number) INTO v_min FROM public.object_version WHERE object_id='HOTRUN999999AR01';
  SELECT min(version_number) INTO v_public_min FROM public.object_version WHERE object_id='HOTRUN999999AR03';
  ASSERT v_min IS NOT NULL AND v_public_min IS NOT NULL, 'History denial needs real private and public versions';
  INSERT INTO public.ref_document(id,url,title,access_scope,valid_from,extra) VALUES
    ('00000000-0000-4000-a000-00000000ae41','https://example.invalid/current-rights/legal.pdf',
      'Synthetic private legal witness','legal_private',CURRENT_DATE-1,
      jsonb_build_object('bertel_pj_import',jsonb_build_object('version','bertel_pj_reviewed_20260908_v1',
        'mapped_object_id','HOTRUN999999AR01','document_category','legal','document_type_code','juridique','display_status','active')));
  INSERT INTO public.ref_document(id,url,title,storage_bucket,storage_path,access_scope,extra) VALUES
    ('00000000-0000-4000-a000-00000000ae42',
      'storage://actor-documents/portal-photos/00000000-0000-4000-a000-00000000aa01/00000000-0000-4000-a000-00000000ae42.jpg',
      'Synthetic private photo preview','actor-documents',
      'portal-photos/00000000-0000-4000-a000-00000000aa01/00000000-0000-4000-a000-00000000ae42.jpg','crm_private',
      jsonb_build_object('source','portal_photo','object_id','HOTRUN999999AR01','upload_complete',true,'upload_sha256',repeat('a',64)));
  INSERT INTO public.actor_document(actor_id,document_id,title,created_by) VALUES
    ('00000000-0000-4000-a000-00000000aa01','00000000-0000-4000-a000-00000000ae42','Synthetic private photo preview','00000000-0000-4000-a000-00000000ae13');
  SELECT jsonb_build_object('write_contract','gallery-patch-v1','request_id','00000000-0000-4000-a000-00000000ae51',
    'rows',jsonb_build_array(jsonb_build_object('id',m.id,'expected',jsonb_build_object('id',m.id,'title',m.title),
      'changes',jsonb_build_object('title','Current explicit gallery edit'))),'deleted','[]'::jsonb) INTO v_payload
    FROM public.media m WHERE m.id='00000000-0000-4000-a000-00000000ad01';
  ASSERT v_payload IS NOT NULL;

  PERFORM set_config('request.jwt.claims',v_writer,true); SET LOCAL ROLE authenticated;
  ASSERT (SELECT count(*) FROM api.get_object_versions('HOTRUN999999AR01',50,0))>0;
  ASSERT api.get_object_version_snapshot('HOTRUN999999AR01',v_min) ? 'name';
  PERFORM api.rpc_restore_object_version('HOTRUN999999AR01',v_min);
  v_result:=api.get_active_object_documents('HOTRUN999999AR01');
  ASSERT (v_result->>'authorized')::boolean AND jsonb_array_length(v_result->'documents')=1, 'Private legal positive witness is empty';
  v_result:=api.list_object_crm('HOTRUN999999AR01');
  ASSERT jsonb_array_length(v_result->'actors')>0, 'Private CRM positive witness is empty';
  ASSERT api.can_read_object_for_correction('HOTRUN999999AR01') IS TRUE;
  v_result:=api.save_object_gallery('HOTRUN999999AR01',v_payload);
  ASSERT (v_result->>'success')::boolean AND jsonb_array_length(v_result->'snapshot')=2;
  v_result:=api.get_gallery_write_receipt('HOTRUN999999AR01','00000000-0000-4000-a000-00000000ae51');
  ASSERT (v_result->>'success')::boolean AND jsonb_array_length(v_result->'snapshot')=2, 'Receipt denial needs a real prior receipt';
  RESET ROLE;

  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  UPDATE public.user_org_business_role SET is_active=false WHERE membership_id='00000000-0000-4000-a000-00000000ab11';
  PERFORM set_config('request.jwt.claims',v_writer,true); SET LOCAL ROLE authenticated;
  ASSERT (SELECT count(*) FROM api.get_object_versions('HOTRUN999999AR01',50,0))>0, 'Current ORG reader lost private history';
  v_result:=api.list_object_crm('HOTRUN999999AR01'); ASSERT jsonb_array_length(v_result->'actors')>0;
  v_result:=api.get_active_object_documents('HOTRUN999999AR01'); ASSERT (v_result->>'authorized')::boolean IS FALSE AND v_result->'documents'='[]'::jsonb;
  ASSERT api.can_read_object_for_correction('HOTRUN999999AR01') IS FALSE;
  FOR v_sql IN SELECT * FROM unnest(ARRAY[
    format('SELECT api.rpc_restore_object_version(%L,%s)','HOTRUN999999AR01',v_min),
    format('SELECT api.save_object_gallery(%L,%L::jsonb)','HOTRUN999999AR01',v_payload::text),
    'SELECT api.get_gallery_write_receipt(''HOTRUN999999AR01'',''00000000-0000-4000-a000-00000000ae51''::uuid)'
  ]) LOOP
    v_denied:=false; BEGIN EXECUTE v_sql; EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
    ASSERT v_denied, 'Demotion left an old restore/gallery/receipt authority';
  END LOOP;
  RESET ROLE; PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  UPDATE public.user_org_membership SET is_active=false WHERE id='00000000-0000-4000-a000-00000000ab11';
  PERFORM set_config('request.jwt.claims',v_writer,true); SET LOCAL ROLE authenticated;
  FOR v_sql IN SELECT * FROM unnest(ARRAY[
    'SELECT * FROM api.get_object_versions(''HOTRUN999999AR01'',50,0)',
    format('SELECT api.get_object_version_snapshot(%L,%s)','HOTRUN999999AR01',v_min),
    format('SELECT api.rpc_restore_object_version(%L,%s)','HOTRUN999999AR01',v_min),
    format('SELECT api.rpc_restore_object_version(%L,%s)','HOTRUN999999AR03',v_public_min),
    'SELECT api.list_object_crm(''HOTRUN999999AR01'')'
  ]) LOOP
    v_denied:=false; BEGIN EXECUTE v_sql; EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
    ASSERT v_denied, 'Departure left access to a private history/restore/CRM witness';
  END LOOP;
  -- Published history follows the existing published-readable rule in this lot.
  ASSERT (SELECT count(*) FROM api.get_object_versions('HOTRUN999999AR03',50,0))>0;
  ASSERT api.get_object_version_snapshot('HOTRUN999999AR03',v_public_min) ? 'name';
  RESET ROLE;

  v_proposal:=jsonb_build_array(jsonb_build_object('target_table','object_description','target_pk',NULL,'action','update',
    'payload',jsonb_build_object('chapo','Synthetic current portal proposal'),
    'metadata',jsonb_build_object('rpc',NULL,'section','contacts','manual_apply',true,'field','Contacts','before','a','after','b')));
  PERFORM set_config('request.jwt.claims',v_portal,true); SET LOCAL ROLE authenticated;
  ASSERT api.user_can_write_object_canonical('HOTRUN999999AR01') IS FALSE;
  v_result:=api.portal_photo_preview('00000000-0000-4000-a000-00000000ae42');
  ASSERT v_result->>'bucket'='actor-documents' AND v_result->>'path' LIKE 'portal-photos/%', 'Private preview positive witness is empty';
  v_result:=api.get_my_portal_photo_workspace('HOTRUN999999AR01');
  ASSERT jsonb_array_length(v_result->'published')=2 AND v_result->'writesEnabled'='false'::jsonb
    AND v_result->'analysisEnabled'='false'::jsonb, 'Portal workspace requires two real photos and closed write/AI flags';
  v_result:=api.submit_actor_fiche('HOTRUN999999AR01',v_proposal,'Synthetic current portal request');
  ASSERT v_result IS NOT NULL; RESET ROLE;
  SELECT id INTO v_submission FROM public.fiche_submission WHERE object_id='HOTRUN999999AR01' AND submitted_by='00000000-0000-4000-a000-00000000ae13' AND status='pending';
  ASSERT v_submission IS NOT NULL;
  SELECT md5(jsonb_agg(jsonb_build_object('id',id,'payload',payload,'metadata',metadata,'status',status) ORDER BY id)::text)
    INTO v_before FROM public.pending_change WHERE submission_id=v_submission;
  ASSERT v_before IS NOT NULL;

  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  UPDATE public.actor_object_role SET valid_to=CURRENT_DATE-1 WHERE actor_id='00000000-0000-4000-a000-00000000aa01' AND object_id='HOTRUN999999AR01';
  PERFORM set_config('request.jwt.claims',v_portal,true); SET LOCAL ROLE authenticated;
  FOR v_sql IN SELECT * FROM unnest(ARRAY[
    'SELECT api.portal_photo_preview(''00000000-0000-4000-a000-00000000ae42''::uuid)',
    'SELECT api.get_my_portal_photo_workspace(''HOTRUN999999AR01'')',
    format('SELECT api.submit_actor_fiche(%L,%L::jsonb,NULL)','HOTRUN999999AR01',v_proposal::text)
  ]) LOOP
    v_denied:=false; BEGIN EXECUTE v_sql; EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
    ASSERT v_denied, 'Removed portal object scope still issued a new proposal or private locator';
  END LOOP; RESET ROLE;
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  UPDATE public.actor_object_role SET valid_to=NULL WHERE actor_id='00000000-0000-4000-a000-00000000aa01' AND object_id='HOTRUN999999AR01';
  UPDATE public.app_user_profile SET actor_id=NULL WHERE id='00000000-0000-4000-a000-00000000ae13';
  PERFORM set_config('request.jwt.claims',v_portal,true); SET LOCAL ROLE authenticated;
  v_denied:=false; BEGIN PERFORM api.portal_photo_preview('00000000-0000-4000-a000-00000000ae42'); EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END; ASSERT v_denied;
  v_denied:=false; BEGIN PERFORM api.submit_actor_fiche('HOTRUN999999AR01',v_proposal,NULL); EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END; ASSERT v_denied;
  RESET ROLE;

  SELECT md5(jsonb_agg(jsonb_build_object('id',id,'payload',payload,'metadata',metadata,'status',status) ORDER BY id)::text)
    INTO v_after FROM public.pending_change WHERE submission_id=v_submission;
  ASSERT v_after=v_before, 'A denied request changed the existing proposal';
  ASSERT (SELECT title FROM public.media WHERE id='00000000-0000-4000-a000-00000000ad01')='Current explicit gallery edit';
  ASSERT (SELECT count(*) FROM internal.gallery_write_receipt WHERE object_id='HOTRUN999999AR01' AND user_id='00000000-0000-4000-a000-00000000ae11')=1;
  ASSERT (SELECT created_by FROM public.object WHERE id='HOTRUN999999AR01')='00000000-0000-4000-a000-00000000ae11'::uuid;
  RAISE NOTICE 'Current-rights surfaces passed: private history/restore, legal/CRM, correction/gallery/receipt and portal proposal/preview gates';
END; $surfaces$;
ROLLBACK;
