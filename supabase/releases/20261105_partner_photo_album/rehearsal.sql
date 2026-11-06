-- GENERIC REVIEW CANDIDATE. Execution requires root review and coordination.
-- Appended to prepare.sql inside ONE apply_migration transaction. The inner block
-- always rolls back fixtures/ACLs/profile/activation; unexpected errors propagate
-- and abort the entire schema migration. No explicit transaction is left open.
-- Inputs are private operator GUCs set in the same migration call, never Git IDs.
DO $album_pilot_rehearsal$
DECLARE
 v_object text:=current_setting('bertel.album_pilot_object',true);
 v_actor uuid:=NULLIF(current_setting('bertel.album_pilot_actor',true),'')::uuid;
 v_user uuid:=NULLIF(current_setting('bertel.album_pilot_user',true),'')::uuid;
 v_profile_before text;v_media_before text;v_docs_before integer;v_pending_before integer;
 v_workspace jsonb;v_photo jsonb;v_old_order jsonb;v_ids jsonb;v_stale jsonb;v_current jsonb;
 v_request jsonb;v_result jsonb;v_submission uuid;v_change uuid;v_interaction uuid;
 v_old_main jsonb;v_new_main jsonb;v_bad_request uuid;
 v_upload uuid:=gen_random_uuid();v_client uuid:=gen_random_uuid();v_replace uuid:=gen_random_uuid();
 v_main uuid;v_count integer;v_n integer;v_denied boolean;v_detail text;v_passed boolean:=false;
 v_foreign text;v_foreign_photo uuid;
 v_crm_before jsonb;v_acl_before jsonb;v_policy_before jsonb;v_after jsonb;
 v_public_before jsonb:=NULLIF(current_setting('bertel.album_public_baseline',true),'')::jsonb;
 v_sample jsonb;v_payload jsonb;v_raw_payload jsonb;
BEGIN
 IF v_user IS NULL THEN
  IF (SELECT count(*) FROM public.app_user_profile WHERE role='super_admin')<>1 THEN RAISE EXCEPTION 'Operator user selection must be unique or explicitly supplied'; END IF;
  SELECT id INTO v_user FROM public.app_user_profile WHERE role='super_admin' ORDER BY id LIMIT 1;
 END IF;
 IF v_object IS NULL THEN
  SELECT o.id,aor.actor_id INTO v_object,v_actor FROM public.object o
   JOIN public.actor_object_role aor ON aor.object_id=o.id JOIN public.actor a ON a.id=aor.actor_id
   WHERE o.is_test AND a.is_test AND o.object_type<>'ORG'
    AND (aor.valid_from IS NULL OR aor.valid_from<=CURRENT_DATE) AND (aor.valid_to IS NULL OR aor.valid_to>=CURRENT_DATE)
    AND (SELECT count(*) FROM public.media m JOIN public.ref_code_media_type t ON t.id=m.media_type_id
      WHERE m.object_id=o.id AND m.place_id IS NULL AND t.code='photo' AND m.is_published AND COALESCE(m.visibility,'public')='public') BETWEEN 2 AND 19
   ORDER BY o.id,aor.is_primary DESC NULLS LAST,aor.actor_id LIMIT 1;
 END IF;
 IF current_user<>'postgres' OR current_setting('bertel.album_rehearsal_enabled',true) IS DISTINCT FROM 'yes'
  OR v_object IS NULL OR v_actor IS NULL OR v_user IS NULL THEN
  RAISE EXCEPTION 'Explicit reviewed operator inputs and postgres owner required';
 END IF;
 IF encode(sha256(convert_to(v_object||'|'||v_actor::text||'|'||v_user::text,'UTF8')),'hex') IS DISTINCT FROM current_setting('bertel.album_pilot_selection_sha256',true) THEN
  RAISE EXCEPTION 'Resolved pilot differs from the privately reviewed selection';
 END IF;
 -- Seed valid empty claims outside the rollback block: a never-set custom GUC
 -- may otherwise revert to an empty string, which legacy current_user_email casts.
 IF auth.uid() IS NOT NULL THEN RAISE EXCEPTION 'Managed schema owner context required'; END IF;
 PERFORM set_config('request.jwt.claims',COALESCE(NULLIF(current_setting('request.jwt.claims',true),''),'{}'),true);
 IF NOT EXISTS(SELECT 1 FROM public.object o JOIN public.actor_object_role aor ON aor.object_id=o.id
   JOIN public.actor a ON a.id=aor.actor_id WHERE o.id=v_object AND o.is_test AND o.object_type<>'ORG' AND a.id=v_actor AND a.is_test
    AND (aor.valid_from IS NULL OR aor.valid_from<=CURRENT_DATE) AND (aor.valid_to IS NULL OR aor.valid_to>=CURRENT_DATE)) THEN
  RAISE EXCEPTION 'Pilot must be an existing is_test object already linked to its existing test actor';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.app_user_profile WHERE id=v_user AND role='super_admin') THEN
  RAISE EXCEPTION 'Existing authorized superadmin account required; no account is created';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=v_user AND deleted_at IS NULL AND (banned_until IS NULL OR banned_until<now())) THEN RAISE EXCEPTION 'Pilot operator account is inactive'; END IF;
 SELECT o.id,m.id INTO v_foreign,v_foreign_photo FROM public.object o
  JOIN public.media m ON m.object_id=o.id AND m.place_id IS NULL JOIN public.ref_code_media_type t ON t.id=m.media_type_id
  WHERE o.is_test AND o.id<>v_object AND t.code='photo' AND m.is_published AND COALESCE(m.visibility,'public')='public'
   AND NOT EXISTS(SELECT 1 FROM public.actor_object_role aor WHERE aor.object_id=o.id AND aor.actor_id=v_actor
     AND (aor.valid_from IS NULL OR aor.valid_from<=CURRENT_DATE) AND (aor.valid_to IS NULL OR aor.valid_to>=CURRENT_DATE))
  ORDER BY o.id,m.id LIMIT 1;
 IF v_foreign IS NULL THEN RAISE EXCEPTION 'Need an existing foreign test fiche for the negative scope test'; END IF;
 IF EXISTS(SELECT 1 FROM public.pending_change WHERE object_id=v_object AND status='pending') THEN RAISE EXCEPTION 'Pilot has an existing pending proposal'; END IF;
 SELECT md5(to_jsonb(p)::text) INTO v_profile_before FROM public.app_user_profile p WHERE p.id=v_user;
 SELECT md5(COALESCE(jsonb_agg(to_jsonb(m) ORDER BY m.id),'[]')::text) INTO v_media_before FROM public.media m WHERE m.object_id=v_object;
 SELECT count(*) INTO v_docs_before FROM public.ref_document WHERE extra->>'source'='portal_photo' AND extra->>'object_id'=v_object;
 SELECT count(*) INTO v_pending_before FROM public.pending_change WHERE object_id=v_object;
 SELECT jsonb_build_object('interactions',(SELECT count(*) FROM public.crm_interaction),'tasks',(SELECT count(*) FROM public.crm_task),
  'assignees',(SELECT count(*) FROM public.crm_task_assignee),'notifications',(SELECT count(*) FROM public.app_notification)) INTO v_crm_before;
 SELECT jsonb_agg(jsonb_build_object('oid',p.oid,'owner',p.proowner,'acl',p.proacl::text,'config',p.proconfig,
  'source',md5(replace(p.prosrc,E'\r\n',E'\n'))) ORDER BY p.oid) INTO v_acl_before
  FROM pg_proc p WHERE p.pronamespace IN('api'::regnamespace,'internal'::regnamespace);
 SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) INTO v_policy_before FROM pg_policy p WHERE p.polrelid IN('public.media'::regclass,'public.ref_document'::regclass);
 IF jsonb_typeof(v_public_before->'functions') IS DISTINCT FROM 'array' OR jsonb_typeof(v_public_before->'resources') IS DISTINCT FROM 'array'
  OR jsonb_array_length(v_public_before->'resources')=0 THEN RAISE EXCEPTION 'Actual public before-snapshot required'; END IF;
 BEGIN
  -- Generated file replaces this token with the reviewed activation SQL. Its
  -- restrictive policies and grants stay uncommitted and are rolled back below.
  EXECUTE $album_activation_payload$__ACTIVATION_SQL__$album_activation_payload$;
  IF has_function_privilege('authenticated','api.send_portal_message(text,text,text,jsonb,text,uuid)','EXECUTE') THEN RAISE EXCEPTION 'Generic CRM sender must remain closed'; END IF;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_user,'role','service_role')::text,true);
  UPDATE public.app_user_profile SET role='actor',actor_id=v_actor WHERE id=v_user;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_user,'role','authenticated')::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_workspace:=api.get_my_portal_photo_workspace(v_object);
  v_count:=jsonb_array_length(v_workspace->'published');
  IF v_count<2 OR v_count>19 OR (v_workspace->'capacity'->>'used')::integer<>v_count THEN RAISE EXCEPTION 'Pilot needs 2..19 public photos and no active reservation'; END IF;
  IF v_workspace->'analysisEnabled' IS DISTINCT FROM 'false'::jsonb THEN RAISE EXCEPTION 'Photo AI must stay OFF'; END IF;
  v_photo:=v_workspace->'published'->0;v_main:=(v_photo->>'id')::uuid;
  -- Real authenticated role + actual profile/actor scope, not an HTTP login.
  v_denied:=false;
  BEGIN PERFORM api.get_my_portal_photo_workspace(v_object||'-not-existing'); EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'Actor scope accepted an absent/foreign fiche'; END IF;
  v_denied:=false;
  BEGIN PERFORM api.get_my_portal_photo_workspace(v_foreign); EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'Actor read an actual foreign test fiche'; END IF;
  v_denied:=false;
  BEGIN PERFORM api.update_portal_photo_texts(v_object,v_foreign_photo,'{}','Forbidden','Forbidden'); EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'Cross-fiche row write accepted'; END IF;
  v_workspace:=api.update_portal_photo_texts(v_object,v_main,v_photo->'textSnapshot','Recette album annulée','Description de recette annulée');
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_workspace->'published') p WHERE p->>'id'=v_main::text
   AND p->>'title'='Recette album annulée' AND p->>'description'='Description de recette annulée') THEN RAISE EXCEPTION 'Caption did not persist'; END IF;
  EXECUTE 'RESET ROLE';
  SELECT to_jsonb(m) INTO v_stale FROM public.media m WHERE id=v_main AND object_id=v_object;
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_old_order:=v_workspace->'orderSnapshot';
  SELECT jsonb_agg(p->'id' ORDER BY CASE n WHEN 1 THEN 2 WHEN 2 THEN 1 ELSE n END) INTO v_ids
   FROM jsonb_array_elements(v_workspace->'published') WITH ORDINALITY a(p,n);
  v_workspace:=api.reconcile_portal_photo_order(v_object,v_old_order,v_ids);
  IF v_workspace->'published'->0->'id' IS DISTINCT FROM v_ids->0 OR v_workspace->'published'->0->'isMain'<>'true'::jsonb THEN RAISE EXCEPTION 'Complete order/main did not persist'; END IF;
  PERFORM api.reconcile_portal_photo_order(v_object,v_old_order,v_ids);

  -- Existing account returns to its office persona only inside this subtransaction.
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_user,'role','service_role')::text,true);
  UPDATE public.app_user_profile SET role='super_admin',actor_id=NULL WHERE id=v_user;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_user,'role','authenticated','app_metadata',jsonb_build_object('sandbox_discovery',true))::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_denied:=false;
  BEGIN PERFORM api.save_object_gallery(v_object,jsonb_build_object('write_contract','gallery-patch-v1','request_id',gen_random_uuid(),
   'rows',jsonb_build_array(jsonb_build_object('id',v_main,'expected',v_stale,'changes',jsonb_build_object('description','Must conflict'))),'deleted','[]'::jsonb));
  EXCEPTION WHEN SQLSTATE 'PT409' THEN v_denied:=true;END;
  IF NOT v_denied THEN RAISE EXCEPTION 'Stale office writer overwrote actor order'; END IF;
  EXECUTE 'RESET ROLE';
  SELECT to_jsonb(m) INTO v_current FROM public.media m WHERE id=v_main AND object_id=v_object;
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_request:=jsonb_build_object('write_contract','gallery-patch-v1','request_id',gen_random_uuid(),
   'rows',jsonb_build_array(jsonb_build_object('id',v_main,'expected',v_current,'changes',jsonb_build_object('description','Office recette annulée'))),'deleted','[]'::jsonb);
  v_result:=api.save_object_gallery(v_object,v_request);
  IF v_result->'success'<>'true'::jsonb THEN RAISE EXCEPTION 'Compatible office writer failed'; END IF;
  IF api.save_object_gallery(v_object,v_request)->'replayed'<>'true'::jsonb THEN RAISE EXCEPTION 'Office retry was not idempotent'; END IF;
  EXECUTE 'RESET ROLE';
  SELECT to_jsonb(m) INTO v_old_main FROM public.media m WHERE object_id=v_object AND place_id IS NULL AND is_main IS TRUE AND is_published
   AND media_type_id=(SELECT media_type_id FROM public.media WHERE id=v_main) LIMIT 1;
  SELECT to_jsonb(m) INTO v_new_main FROM public.media m WHERE id=v_main AND object_id=v_object;
  IF v_old_main->>'id'=v_new_main->>'id' THEN RAISE EXCEPTION 'Ordering regression test needs two different principal candidates'; END IF;
  EXECUTE 'SET LOCAL ROLE authenticated';
  -- Deliberately send the promotion FIRST. The old R5 loop raises 23505 here.
  v_request:=jsonb_build_object('write_contract','gallery-patch-v1','request_id',gen_random_uuid(),'deleted','[]'::jsonb,
   'rows',jsonb_build_array(jsonb_build_object('id',v_main,'expected',v_new_main,'changes',jsonb_build_object('is_main',true)),
     jsonb_build_object('id',v_old_main->>'id','expected',v_old_main,'changes',jsonb_build_object('is_main',false))));
  v_result:=api.save_object_gallery(v_object,v_request);
  IF v_result->'success'<>'true'::jsonb OR NOT EXISTS(SELECT 1 FROM public.media WHERE id=v_main AND is_main IS TRUE) THEN RAISE EXCEPTION 'Office new-main-first request failed'; END IF;
  EXECUTE 'RESET ROLE';
  SELECT to_jsonb(m) INTO v_old_main FROM public.media m WHERE id=v_main AND object_id=v_object;
  SELECT to_jsonb(m) INTO v_new_main FROM public.media m WHERE object_id=v_object AND place_id IS NULL AND is_published
    AND id<>v_main AND media_type_id=(v_old_main->>'media_type_id')::uuid ORDER BY position,id LIMIT 1;
  IF v_new_main IS NULL THEN RAISE EXCEPTION 'Main deletion test needs another public photo'; END IF;
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_bad_request:=gen_random_uuid();v_denied:=false;
  BEGIN
   PERFORM api.save_object_gallery(v_object,jsonb_build_object('write_contract','gallery-patch-v1','request_id',v_bad_request,
    'rows',jsonb_build_array(jsonb_build_object('id',v_new_main->>'id','expected',v_new_main||jsonb_build_object('updated_at','1900-01-01T00:00:00Z'),'changes',jsonb_build_object('is_main',true))),
    'deleted',jsonb_build_array(jsonb_build_object('id',v_main,'expected',v_old_main))));
  EXCEPTION WHEN SQLSTATE 'PT409' THEN v_denied:=true; END;
  IF NOT v_denied OR NOT EXISTS(SELECT 1 FROM public.media WHERE id=v_main AND is_main IS TRUE) THEN RAISE EXCEPTION 'Invalid row snapshot left an earlier deletion committed'; END IF;
  EXECUTE 'RESET ROLE';
  IF EXISTS(SELECT 1 FROM internal.gallery_write_receipt WHERE object_id=v_object AND user_id=v_user AND request_id=v_bad_request) THEN RAISE EXCEPTION 'Failed request left a gallery receipt'; END IF;
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_request:=jsonb_build_object('write_contract','gallery-patch-v1','request_id',gen_random_uuid(),
   'rows',jsonb_build_array(jsonb_build_object('id',v_new_main->>'id','expected',v_new_main,'changes',jsonb_build_object('is_main',true))),
   'deleted',jsonb_build_array(jsonb_build_object('id',v_main,'expected',v_old_main)));
  PERFORM api.save_object_gallery(v_object,v_request);
  IF EXISTS(SELECT 1 FROM public.media WHERE id=v_main) OR NOT EXISTS(SELECT 1 FROM public.media WHERE id=(v_new_main->>'id')::uuid AND is_main IS TRUE) THEN RAISE EXCEPTION 'Delete old main + promote new main failed'; END IF;
  IF api.save_object_gallery(v_object,v_request)->'replayed'<>'true'::jsonb THEN RAISE EXCEPTION 'Main deletion retry was not idempotent'; END IF;
  IF (SELECT count(*) FROM public.media WHERE object_id=v_object AND place_id IS NULL AND media_type_id=(v_new_main->>'media_type_id')::uuid AND is_main IS TRUE)<>1 THEN RAISE EXCEPTION 'Final principal invariant failed'; END IF;
  v_main:=(v_new_main->>'id')::uuid;v_count:=v_count-1;

  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_user,'role','service_role')::text,true);
  UPDATE public.app_user_profile SET role='actor',actor_id=v_actor WHERE id=v_user;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_user,'role','authenticated')::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM api.reserve_portal_photo_upload(v_object,v_upload);
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  EXECUTE 'SET LOCAL ROLE service_role';
  -- SQL contract only: synthetic receipt; NO bytes are put in Storage.
  PERFORM api.complete_portal_photo_upload(v_user,v_upload,repeat('a',64),'Dépôt SQL annulé',1800,1200);
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_user,'role','authenticated')::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_result:=api.submit_actor_fiche(v_object,jsonb_build_array(jsonb_build_object('target_table','media','action','update',
   'payload',jsonb_build_object('additions',jsonb_build_array(jsonb_build_object('upload_id',v_upload,'credit','Recette annulée'))),
   'metadata',jsonb_build_object('section','media','rpc','publish_portal_photo_additions','field','Vos photos'))),NULL);
  v_submission:=(v_result->>'submission_id')::uuid;
  EXECUTE 'RESET ROLE';
  SELECT id INTO v_change FROM public.pending_change WHERE object_id=v_object AND submission_id=v_submission AND metadata->>'rpc'='publish_portal_photo_additions';
  IF v_change IS NULL THEN RAISE EXCEPTION 'Photo proposal missing'; END IF;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_user,'role','service_role')::text,true);
  UPDATE public.app_user_profile SET role='super_admin',actor_id=NULL WHERE id=v_user;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_user,'role','authenticated','app_metadata',jsonb_build_object('sandbox_discovery',true))::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM api.reject_fiche_submission(v_submission,'Refus de recette annulée');
  v_denied:=false;
  BEGIN PERFORM api.portal_photo_preview(v_upload);EXCEPTION WHEN insufficient_privilege THEN v_denied:=true;END;
  IF NOT v_denied THEN RAISE EXCEPTION 'Refusal without appeal opened office preview'; END IF;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_user,'role','service_role')::text,true);
  UPDATE public.app_user_profile SET role='actor',actor_id=v_actor WHERE id=v_user;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_user,'role','authenticated')::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_interaction:=api.appeal_portal_photo_review(v_object,v_upload,v_change,'Recours SQL annulé',v_client);
  IF v_interaction IS DISTINCT FROM api.appeal_portal_photo_review(v_object,v_upload,v_change,'Recours SQL annulé',v_client) THEN RAISE EXCEPTION 'Appeal retry duplicated CRM'; END IF;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_user,'role','service_role')::text,true);
  UPDATE public.app_user_profile SET role='super_admin',actor_id=NULL WHERE id=v_user;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_user,'role','authenticated','app_metadata',jsonb_build_object('sandbox_discovery',true))::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  IF api.list_portal_message_documents(v_interaction)->'photoReview'->>'documentId' IS DISTINCT FROM v_upload::text THEN RAISE EXCEPTION 'CRM receipt does not resolve the appealed photo'; END IF;
  IF api.portal_photo_preview(v_upload)->>'bucket' IS DISTINCT FROM 'actor-documents' THEN RAISE EXCEPTION 'Office preview authorization failed'; END IF;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_user,'role','service_role')::text,true);
  UPDATE public.app_user_profile SET role='actor',actor_id=v_actor WHERE id=v_user;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_user,'role','authenticated')::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  FOR v_n IN 1..(20-v_count) LOOP PERFORM api.reserve_portal_photo_upload(v_object,gen_random_uuid()); END LOOP;
  v_denied:=false;
  BEGIN PERFORM api.reserve_portal_photo_upload(v_object,gen_random_uuid());
  EXCEPTION WHEN SQLSTATE 'PT409' THEN GET STACKED DIAGNOSTICS v_detail=PG_EXCEPTION_DETAIL;v_denied:=v_detail='photo_limit';END;
  IF NOT v_denied THEN RAISE EXCEPTION 'Photo twenty-one was not refused'; END IF;
  PERFORM api.reserve_portal_photo_upload(v_object,v_replace,v_main);
  PERFORM api.withdraw_portal_photo(v_object,v_main);
  IF api.get_my_portal_photo_workspace(v_object)->'capacity'->>'used' IS DISTINCT FROM '20' THEN RAISE EXCEPTION 'Replacement/withdrawal freed or consumed an extra slot'; END IF;
  EXECUTE 'RESET ROLE';
  v_passed:=true;
  RAISE EXCEPTION 'Intentional rollback of all pilot/profile/activation changes' USING ERRCODE='PZA01';
 EXCEPTION WHEN SQLSTATE 'PZA01' THEN
  IF NOT v_passed THEN RAISE; END IF;
 END;
 -- An unexpected error was NOT swallowed: it aborts the enclosing migration.
 IF internal.portal_photo_actor_writes_enabled() OR (SELECT enabled FROM internal.portal_photo_analysis_settings WHERE singleton) THEN RAISE EXCEPTION 'Preparation must remain closed and AI OFF'; END IF;
 IF (SELECT md5(to_jsonb(p)::text) FROM public.app_user_profile p WHERE p.id=v_user) IS DISTINCT FROM v_profile_before THEN RAISE EXCEPTION 'Pilot profile not restored'; END IF;
 IF (SELECT md5(COALESCE(jsonb_agg(to_jsonb(m) ORDER BY m.id),'[]')::text) FROM public.media m WHERE m.object_id=v_object) IS DISTINCT FROM v_media_before THEN RAISE EXCEPTION 'Pilot photos not restored'; END IF;
 IF (SELECT count(*) FROM public.ref_document WHERE extra->>'source'='portal_photo' AND extra->>'object_id'=v_object)<>v_docs_before
  OR (SELECT count(*) FROM public.pending_change WHERE object_id=v_object)<>v_pending_before THEN RAISE EXCEPTION 'Transient photo/proposal rows remain'; END IF;
 SELECT jsonb_build_object('interactions',(SELECT count(*) FROM public.crm_interaction),'tasks',(SELECT count(*) FROM public.crm_task),
  'assignees',(SELECT count(*) FROM public.crm_task_assignee),'notifications',(SELECT count(*) FROM public.app_notification)) INTO v_after;
 IF v_after IS DISTINCT FROM v_crm_before THEN RAISE EXCEPTION 'CRM/notification counts differ after rollback'; END IF;
 SELECT jsonb_agg(jsonb_build_object('oid',p.oid,'owner',p.proowner,'acl',p.proacl::text,'config',p.proconfig,
  'source',md5(replace(p.prosrc,E'\r\n',E'\n'))) ORDER BY p.oid) INTO v_after
  FROM pg_proc p WHERE p.pronamespace IN('api'::regnamespace,'internal'::regnamespace);
 IF v_after IS DISTINCT FROM v_acl_before THEN RAISE EXCEPTION 'Function/ACL state differs after rollback'; END IF;
 SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) INTO v_after FROM pg_policy p WHERE p.polrelid IN('public.media'::regclass,'public.ref_document'::regclass);
 IF v_after IS DISTINCT FROM v_policy_before THEN RAISE EXCEPTION 'R5 policy state differs after rollback'; END IF;
 IF auth.uid() IS NOT NULL OR api.current_user_test_realm() THEN RAISE EXCEPTION 'Public comparison context changed'; END IF;
 FOR v_sample IN SELECT value FROM jsonb_array_elements(v_public_before->'resources') LOOP
  IF NOT EXISTS(SELECT 1 FROM public.object WHERE id=v_sample->>'id' AND status='published' AND NOT is_test)
   OR COALESCE(api.can_read_extended(v_sample->>'id'),false) THEN RAISE EXCEPTION 'Public sample/context changed'; END IF;
  v_raw_payload:=api.get_object_resource(v_sample->>'id',ARRAY['fr'],'none','{}')::jsonb;
  v_payload:=v_raw_payload-'canonical_description'-'org_description';
  IF md5(v_raw_payload::text) IS DISTINCT FROM v_sample->>'raw_sql_payload_md5'
   OR md5(v_payload::text) IS DISTINCT FROM v_sample->>'sql_payload_md5' THEN RAISE EXCEPTION 'Public raw/projected JSON differs after preparation/rollback'; END IF;
 END LOOP;
 WITH expected(name) AS (SELECT value->>'name' FROM jsonb_array_elements(v_public_before->'functions')),
  readers AS (SELECT e.name,pg_get_function_identity_arguments(p.oid) AS args,md5(replace(p.prosrc,E'\r\n',E'\n')) AS source_md5,
   pg_get_userbyid(p.proowner) AS owner,p.prosecdef AS security_definer,p.proconfig AS config,p.proacl::text AS acl,p.prorettype::regtype::text AS returns
   FROM expected e LEFT JOIN pg_proc p ON p.proname=e.name AND p.pronamespace='api'::regnamespace)
 SELECT jsonb_agg(to_jsonb(r) ORDER BY r.name,r.args) INTO v_after FROM readers r;
 IF v_after IS DISTINCT FROM v_public_before->'functions' THEN RAISE EXCEPTION 'Public reader metadata changed'; END IF;
 RAISE NOTICE 'SQL pilot passed and intentionally rolled back; closed schema preparation only remains. No HTTP login, Storage bytes, email or AI dispatch tested.';
END;
$album_pilot_rehearsal$;
