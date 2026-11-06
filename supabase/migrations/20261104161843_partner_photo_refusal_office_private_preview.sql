-- Follow-up to the actor album: an office can review the private photo of a
-- real human B appeal even when P is OFF. Private CRM/preview contracts only.
BEGIN;
SET LOCAL lock_timeout='500ms';
SET LOCAL statement_timeout='15s';
DO $dependencies$
BEGIN
 IF to_regprocedure('api.appeal_portal_photo_review(text,uuid,uuid,text,uuid)') IS NULL
  OR to_regprocedure('api.can_read_object_for_correction(text)') IS NULL
  OR to_regprocedure('api.list_portal_message_documents(uuid)') IS NULL
  OR to_regprocedure('api.portal_photo_preview(uuid)') IS NULL
  OR to_regclass('internal.portal_photo_analysis') IS NULL THEN
  RAISE EXCEPTION 'Install messaging, P and the actor album before its office appeal reader';
 END IF;
END;
$dependencies$;

-- A free-form CRM extra is not an authorization. Require the immutable personal
-- document/version and the server receipt linking this exact interaction to B/P.
CREATE FUNCTION internal.portal_photo_appeal_document(p_interaction_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public,api,internal AS $fn$
 SELECT jsonb_build_object('documentId',d.id,
  'title',COALESCE(api.i18n_pick_strict(d.title_i18n,'fr','fr'),d.title,''))
 FROM public.crm_interaction c
 JOIN public.ref_document d ON d.id::text=c.extra->>'portal_photo_document_id'
 JOIN public.actor_document ad ON ad.document_id=d.id AND ad.actor_id=c.actor_id
 WHERE c.id=p_interaction_id AND c.source='portal' AND c.parent_interaction_id IS NULL
  AND d.extra->>'source'='portal_photo' AND d.extra->>'object_id'=c.object_id
  AND d.access_scope='crm_private' AND d.storage_bucket='actor-documents'
  AND d.storage_path='portal-photos/'||ad.actor_id::text||'/'||d.id::text||'.jpg'
  AND (
   EXISTS(SELECT 1 FROM public.pending_change pc JOIN public.fiche_submission fs ON fs.id=pc.submission_id AND fs.object_id=pc.object_id
      AND fs.actor_id=ad.actor_id AND fs.submitted_by=ad.created_by
    WHERE pc.id::text=c.extra->>'portal_photo_change_id' AND pc.object_id=c.object_id
     AND pc.submitted_by=ad.created_by AND pc.status='rejected' AND pc.metadata->>'rpc'='publish_portal_photo_additions'
     AND EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(pc.payload->'additions','[]')) item WHERE item->>'upload_id'=d.id::text)
     AND d.extra->'photo_review_appeals'->pc.id::text->>'interactionId'=c.id::text
     AND d.extra->'photo_review_appeals'->pc.id::text->>'clientId'=c.extra->>'portal_client_id'
     AND d.extra->'photo_review_appeals'->pc.id::text->>'intentHash' ~ '^[0-9a-f]{64}$')
   OR EXISTS(SELECT 1 FROM internal.portal_photo_analysis a
    WHERE a.id::text=c.extra->>'portal_photo_analysis_id' AND a.document_id=d.id AND a.object_id=c.object_id
     AND a.actor_id=ad.actor_id AND a.created_by=ad.created_by AND a.appeal_interaction_id=c.id
     AND a.appeal_client_id::text=c.extra->>'portal_client_id'
     AND a.source_sha256=d.extra->>'upload_sha256' AND a.source_sha256=c.extra->>'portal_photo_source_sha256')
  );
$fn$;
REVOKE ALL ON FUNCTION internal.portal_photo_appeal_document(uuid) FROM PUBLIC,anon,authenticated,service_role;

DO $office_photo_appeal_sources$
DECLARE v_target record;v_function regprocedure;v_definition text;v_hash text;v_meta jsonb;v_old text;v_new text;v_pair jsonb;
BEGIN
 FOR v_target IN SELECT * FROM (VALUES
  ('api.portal_photo_preview(uuid)','177a6144c5303763d48207b109f1ea3b','6a616a0f060a8026ce6398c4159222ee',jsonb_build_array(jsonb_build_array(
   $office_preview_before$      OR (NOT api.is_actor_persona() AND api.user_can_moderate_object(v_doc.extra->>'object_id')$office_preview_before$,
   $office_preview_after$      OR (NOT COALESCE(api.is_actor_persona(),false)
        AND api.can_read_object_for_correction(v_doc.extra->>'object_id')
        AND EXISTS(SELECT 1 FROM public.crm_interaction c WHERE c.object_id=v_doc.extra->>'object_id' AND c.source='portal'
          AND c.extra->>'portal_photo_document_id'=v_doc.id::text
          AND api.user_can_read_crm_actor(c.actor_id) AND api.can_read_object(c.object_id)
          AND internal.portal_photo_appeal_document(c.id)->>'documentId'=v_doc.id::text))
      OR (NOT api.is_actor_persona() AND api.user_can_moderate_object(v_doc.extra->>'object_id')$office_preview_after$),
   jsonb_build_array($office_p_before$FROM public.crm_interaction c WHERE c.id=a.appeal_interaction_id$office_p_before$,
    $office_p_after$FROM public.crm_interaction c WHERE c.id=a.appeal_interaction_id
             AND c.source='portal' AND c.object_id=a.object_id AND c.actor_id=a.actor_id
             AND api.user_can_read_crm_actor(c.actor_id) AND api.can_read_object(c.object_id)$office_p_after$))),
  ('api.list_portal_message_documents(uuid)','4e283c8ce1567bfe35c51ffe6e953c1b','6f6940df421ddb25985f4c0ce0887236',jsonb_build_array(jsonb_build_array(
   $office_message_before$  RETURN jsonb_build_object('replyTo',v_root.extra->>'reply_to','documents',$office_message_before$,
   $office_message_after$  RETURN jsonb_build_object('replyTo',v_root.extra->>'reply_to',
    'photoReview',CASE WHEN NOT COALESCE(api.is_actor_persona(),false) AND api.can_read_object_for_correction(v_root.object_id)
      THEN internal.portal_photo_appeal_document(v_root.id) END,'documents',$office_message_after$)))
 ) t(signature,before_hash,target_hash,patches) LOOP
  v_function:=to_regprocedure(v_target.signature);
  SELECT md5(replace(p.prosrc,E'\r\n',E'\n')),replace(pg_get_functiondef(p.oid),E'\r\n',E'\n'),
   jsonb_build_object('owner',p.proowner,'acl',to_jsonb(p.proacl),'config',to_jsonb(p.proconfig),'definer',p.prosecdef,
    'strict',p.proisstrict,'volatility',p.provolatile,'parallel',p.proparallel,'returns',p.prorettype,'set',p.proretset,'args',p.proargtypes::text)
   INTO v_hash,v_definition,v_meta FROM pg_proc p WHERE p.oid=v_function AND pg_get_userbyid(p.proowner)='postgres' AND p.prosecdef;
  IF v_hash=v_target.target_hash THEN CONTINUE; END IF;
  IF v_hash IS DISTINCT FROM v_target.before_hash THEN RAISE EXCEPTION 'Photo appeal: unreviewed source/attributes % (%)',v_target.signature,v_hash; END IF;
  FOR v_pair IN SELECT value FROM jsonb_array_elements(v_target.patches) LOOP
   v_old:=v_pair->>0;v_new:=v_pair->>1;
   IF (length(v_definition)-length(replace(v_definition,v_old,'')))/length(v_old)<>1 THEN
    RAISE EXCEPTION 'Photo appeal: exact authorization anchor differs (%)',v_target.signature;
   END IF;
   v_definition:=replace(v_definition,v_old,v_new);
  END LOOP;
  EXECUTE v_definition;
  IF (SELECT md5(replace(p.prosrc,E'\r\n',E'\n')) FROM pg_proc p WHERE p.oid=v_function) IS DISTINCT FROM v_target.target_hash
   OR (SELECT jsonb_build_object('owner',p.proowner,'acl',to_jsonb(p.proacl),'config',to_jsonb(p.proconfig),'definer',p.prosecdef,
    'strict',p.proisstrict,'volatility',p.provolatile,'parallel',p.proparallel,'returns',p.prorettype,'set',p.proretset,'args',p.proargtypes::text)
    FROM pg_proc p WHERE p.oid=v_function) IS DISTINCT FROM v_meta THEN
   RAISE EXCEPTION 'Photo appeal: target source or function attributes differ (%)',v_target.signature;
  END IF;
 END LOOP;
END;
$office_photo_appeal_sources$;
NOTIFY pgrst,'reload schema';
COMMIT;
