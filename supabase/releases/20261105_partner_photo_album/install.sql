-- GENERATED REVIEW CANDIDATE. No pilot IDs. apply_migration only after root/Claude approval.
SELECT set_config('bertel.album_xid',txid_current()::text,true);
DO $atomicity$ BEGIN
 IF current_setting('bertel.album_xid',true) IS DISTINCT FROM txid_current()::text THEN
  RAISE EXCEPTION 'The complete album installation requires one managed transaction';
 END IF;
END; $atomicity$;
SET LOCAL lock_timeout='500ms';
SET LOCAL statement_timeout='60s';

-- Observed live sources must still match before any preparation
DO $baseline$ BEGIN
 IF (SELECT md5(replace(prosrc,E'\r\n',E'\n')) FROM pg_proc WHERE oid=to_regprocedure('api.actor_portal_floor_modules()')) IS DISTINCT FROM '2bbe58646c2d56dc402bbede946e1511' THEN RAISE EXCEPTION 'Live source changed: actor_portal_floor_modules'; END IF;
 IF (SELECT md5(replace(prosrc,E'\r\n',E'\n')) FROM pg_proc WHERE oid=to_regprocedure('api.submit_actor_fiche(text,jsonb,text)')) IS DISTINCT FROM '0861011392137effc9c7cb97bef6beab' THEN RAISE EXCEPTION 'Live source changed: submit_actor_fiche'; END IF;
 IF (SELECT md5(replace(prosrc,E'\r\n',E'\n')) FROM pg_proc WHERE oid=to_regprocedure('api.approve_pending_change(uuid,text,boolean)')) IS DISTINCT FROM '78b171f997cd630da118ecc81382448d' THEN RAISE EXCEPTION 'Live source changed: approve_pending_change'; END IF;
 IF (SELECT md5(replace(prosrc,E'\r\n',E'\n')) FROM pg_proc WHERE oid=to_regprocedure('api.reject_pending_change(uuid,text)')) IS DISTINCT FROM 'c125ebd25849243cf45f1b7a114960ed' THEN RAISE EXCEPTION 'Live source changed: reject_pending_change'; END IF;
 IF (SELECT md5(replace(prosrc,E'\r\n',E'\n')) FROM pg_proc WHERE oid=to_regprocedure('api.get_object_resource(text,text[],text,jsonb)')) IS DISTINCT FROM '523b18abc402528c494e25f3895f2912' THEN RAISE EXCEPTION 'Live source changed: get_object_resource'; END IF;
 IF (SELECT md5(pg_get_constraintdef(oid)) FROM pg_constraint WHERE conrelid='public.app_notification'::regclass AND conname='chk_app_notification_kind') IS DISTINCT FROM '7422d4daf1c99e1767e91a0ce5abcfa9' THEN RAISE EXCEPTION 'Notification kind constraint changed'; END IF;
 IF to_regprocedure('api.get_my_portal_photo_workspace(text)') IS NOT NULL OR to_regclass('internal.portal_photo_analysis') IS NOT NULL
  OR to_regprocedure('api.send_portal_message(text,text,text,jsonb,text,uuid)') IS NOT NULL THEN RAISE EXCEPTION 'Unexpected partial photo installation; compare before continuing'; END IF;
 IF NOT EXISTS(SELECT 1 FROM storage.buckets WHERE id='actor-documents' AND NOT public)
  OR NOT EXISTS(SELECT 1 FROM storage.buckets WHERE id='media' AND public) THEN RAISE EXCEPTION 'Existing photo buckets must match reviewed configuration'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.ref_code_demand_topic WHERE code='modification_infos_bdd' AND is_active) THEN RAISE EXCEPTION 'Existing correction topic must be active'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.app_user_profile'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%''actor''%') THEN RAISE EXCEPTION 'Actor profile role prerequisite missing'; END IF;

END; $baseline$;

-- Shared private messaging only: keep existing mail claimant/acknowledger UNCHANGED
ALTER TABLE public.app_notification DROP CONSTRAINT chk_app_notification_kind;
ALTER TABLE public.app_notification ADD CONSTRAINT chk_app_notification_kind CHECK(kind IN('crm_task_assigned','fiche_submission_reviewed','list_feature_requested','pending_change_submitted','portal_message'));
CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_portal_client_message ON public.crm_interaction(actor_id,(extra->>'portal_client_id')) WHERE source='portal' AND extra->>'portal_client_id' IS NOT NULL;

-- portal_message_upload_context
CREATE OR REPLACE FUNCTION api.portal_message_upload_context(p_object_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,api AS $function$
DECLARE v_actor uuid := api.current_user_actor_id();
BEGIN
  IF NOT COALESCE(api.is_actor_persona(),false) OR v_actor IS NULL
    OR NOT EXISTS(SELECT 1 FROM api.current_user_portal_object_ids() id WHERE id=p_object_id) THEN
    RAISE EXCEPTION 'Fiche inaccessible' USING ERRCODE='42501';
  END IF;
  IF (SELECT count(*) FROM public.actor_document a JOIN public.ref_document d ON d.id=a.document_id
      WHERE a.actor_id=v_actor AND a.created_at>=CURRENT_DATE
        AND d.extra->>'source'='portal_message')>=30 THEN
    RAISE EXCEPTION 'Limite quotidienne atteinte. Réessayez demain.' USING ERRCODE='P0001';
  END IF;
  RETURN jsonb_build_object('actorId',v_actor);
END $function$;
REVOKE ALL ON FUNCTION api.portal_message_upload_context(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION api.portal_message_upload_context(text) TO authenticated;

-- send_portal_message
CREATE OR REPLACE FUNCTION api.send_portal_message(
  p_object_id text,p_subject text,p_body text,p_attachments jsonb DEFAULT '[]',
  p_reply_to text DEFAULT NULL,p_client_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,api AS $function$
DECLARE
  v_actor uuid := api.current_user_actor_id(); v_id uuid; v_topic text; v_label text;
  v_doc uuid; v_docs uuid[] := ARRAY[]::uuid[]; v_recipient uuid; v_reply text;
  v_attachment jsonb; v_existing public.crm_interaction%ROWTYPE;
BEGIN
  IF NOT COALESCE(api.is_actor_persona(),false) OR v_actor IS NULL
    OR NOT EXISTS(SELECT 1 FROM api.current_user_portal_object_ids() id WHERE id=p_object_id) THEN
    RAISE EXCEPTION 'Fiche inaccessible' USING ERRCODE='42501';
  END IF;
  -- Sérialise quota et idempotence pour cet acteur, y compris entre ses fiches.
  PERFORM pg_advisory_xact_lock(hashtextextended('portal-message:'||v_actor::text,0));
  SELECT code,label INTO v_topic,v_label FROM (VALUES
    ('correction','modification_infos_bdd','Une erreur ou une modification'),
    ('fermeture','fermeture_provisoire','Une fermeture temporaire'),
    ('label','labels_classements_etoiles','Un label ou un classement'),
    ('evenement','evenement_nouveaute','Un événement ou une nouveauté'),
    ('conseil','conseils','Des conseils'),
    ('promo','partenaire_b2c','Me faire connaître'),
    ('autre','autres','Autre chose')) t(subject,code,label) WHERE subject=p_subject;
  IF v_topic IS NULL OR length(btrim(COALESCE(p_body,''))) NOT BETWEEN 1 AND 4000
    OR jsonb_typeof(p_attachments) IS DISTINCT FROM 'array' OR jsonb_array_length(p_attachments)>3 THEN
    RAISE EXCEPTION 'Sujet, message ou pièces jointes invalides' USING ERRCODE='22023';
  END IF;
  v_reply := NULLIF(btrim(p_reply_to),'');
  IF v_reply IS NOT NULL AND (length(v_reply)>254 OR v_reply!~'^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$') THEN
    RAISE EXCEPTION 'Adresse de réponse invalide' USING ERRCODE='22023';
  END IF;
  IF p_client_id IS NOT NULL THEN
    SELECT * INTO v_existing FROM public.crm_interaction WHERE actor_id=v_actor AND source='portal'
      AND extra->>'portal_client_id'=p_client_id::text;
    IF FOUND THEN
      IF v_existing.object_id<>p_object_id OR v_existing.subject<>v_label OR v_existing.body<>btrim(p_body)
        OR v_existing.extra->>'reply_to' IS DISTINCT FROM v_reply
        OR v_existing.extra->'attachment_ids' IS DISTINCT FROM p_attachments THEN
        RAISE EXCEPTION 'Ce message a déjà été envoyé. Rechargez vos échanges.' USING ERRCODE='PT409';
      END IF;
      RETURN v_existing.id;
    END IF;
  END IF;
  IF (SELECT count(*) FROM public.crm_interaction WHERE actor_id=v_actor AND source='portal' AND created_at>=CURRENT_DATE)>=10 THEN
    RAISE EXCEPTION 'Limite quotidienne atteinte. Réessayez demain.' USING ERRCODE='P0001';
  END IF;
  FOR v_attachment IN SELECT value FROM jsonb_array_elements(p_attachments) LOOP
    IF jsonb_typeof(v_attachment)<>'string' OR v_attachment#>>'{}'!~*'^[0-9a-f-]{36}$' THEN
      RAISE EXCEPTION 'Pièce jointe invalide' USING ERRCODE='22023';
    END IF;
    v_doc := (v_attachment#>>'{}')::uuid;
    IF v_doc=ANY(v_docs) THEN RAISE EXCEPTION 'Pièce jointe répétée' USING ERRCODE='22023'; END IF;
    PERFORM 1 FROM public.ref_document d JOIN public.actor_document a ON a.document_id=d.id
      WHERE d.id=v_doc AND a.actor_id=v_actor AND a.created_by=auth.uid()
        AND d.access_scope='crm_private' AND d.storage_bucket='actor-documents'
        AND d.storage_path LIKE 'portal-messages/'||v_actor::text||'/%'
        AND d.extra->>'object_id'=p_object_id AND d.extra->>'source'='portal_message'
        AND d.extra->>'interaction_id' IS NULL FOR UPDATE OF d;
    IF NOT FOUND THEN RAISE EXCEPTION 'Pièce jointe inaccessible' USING ERRCODE='42501'; END IF;
    v_docs := array_append(v_docs,v_doc);
  END LOOP;
  INSERT INTO public.crm_interaction(object_id,actor_id,interaction_type,direction,status,source,
    subject,body,occurred_at,demand_topic_id,extra)
  SELECT p_object_id,v_actor,'other','inbound','new','portal',v_label,btrim(p_body),now(),r.id,
    jsonb_build_object('portal_subject',p_subject,'portal_client_id',p_client_id,'reply_to',v_reply,'attachment_ids',to_jsonb(v_docs))
  FROM public.ref_code_demand_topic r WHERE r.code=v_topic AND r.is_active RETURNING id INTO v_id;
  IF v_id IS NULL THEN RAISE EXCEPTION 'Sujet indisponible' USING ERRCODE='22023'; END IF;
  UPDATE public.ref_document SET extra=extra||jsonb_build_object('interaction_id',v_id) WHERE id=ANY(v_docs);
  FOR v_recipient IN SELECT api.list_object_verifier_ids(p_object_id) LOOP
    IF v_recipient IS DISTINCT FROM auth.uid() THEN
      INSERT INTO public.app_notification(recipient_id,kind,created_by,payload)
      VALUES(v_recipient,'portal_message',auth.uid(),jsonb_build_object('object_id',p_object_id,'interaction_id',v_id,'actor_id',v_actor));
    END IF;
  END LOOP;
  RETURN v_id;
END $function$;
REVOKE ALL ON FUNCTION api.send_portal_message(text,text,text,jsonb,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION api.send_portal_message(text,text,text,jsonb,text,uuid) TO authenticated;

-- portal_message_document
CREATE OR REPLACE FUNCTION api.portal_message_document(p_document_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,api AS $function$
DECLARE v_doc public.ref_document%ROWTYPE; v_actor uuid; v_owner uuid;
BEGIN
  SELECT a.actor_id,a.created_by INTO v_actor,v_owner FROM public.actor_document a WHERE a.document_id=p_document_id;
  SELECT * INTO v_doc FROM public.ref_document d WHERE d.id=p_document_id AND d.extra->>'source'='portal_message';
  IF NOT FOUND OR v_actor IS NULL OR v_doc.storage_bucket IS DISTINCT FROM 'actor-documents' OR v_doc.access_scope IS DISTINCT FROM 'crm_private'
    OR NOT COALESCE((api.is_actor_persona() AND v_actor=api.current_user_actor_id() AND v_owner=auth.uid()
        AND EXISTS(SELECT 1 FROM api.current_user_portal_object_ids() id WHERE id=v_doc.extra->>'object_id'))
      OR (NOT api.is_actor_persona() AND api.user_can_read_crm_actor(v_actor) AND api.can_read_object(v_doc.extra->>'object_id')),false) THEN
    RAISE EXCEPTION 'Pièce jointe inaccessible' USING ERRCODE='42501';
  END IF;
  RETURN jsonb_build_object('id',v_doc.id,'title',v_doc.title,'bucket',v_doc.storage_bucket,'path',v_doc.storage_path);
END $function$;
REVOKE ALL ON FUNCTION api.portal_message_document(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION api.portal_message_document(uuid) TO authenticated;

-- list_portal_message_documents
CREATE OR REPLACE FUNCTION api.list_portal_message_documents(p_interaction_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,api AS $function$
DECLARE v_root public.crm_interaction%ROWTYPE;
BEGIN
  SELECT * INTO v_root FROM public.crm_interaction WHERE id=p_interaction_id AND source='portal';
  IF NOT FOUND OR NOT COALESCE((api.is_actor_persona() AND v_root.actor_id=api.current_user_actor_id()
      AND EXISTS(SELECT 1 FROM api.current_user_portal_object_ids() id WHERE id=v_root.object_id))
    OR (NOT api.is_actor_persona() AND api.user_can_read_crm_actor(v_root.actor_id) AND api.can_read_object(v_root.object_id)),false) THEN
    RAISE EXCEPTION 'Message inaccessible' USING ERRCODE='42501';
  END IF;
  RETURN jsonb_build_object('replyTo',v_root.extra->>'reply_to','documents',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',d.id,'title',d.title)) FROM public.ref_document d
    WHERE d.extra->>'interaction_id'=v_root.id::text AND d.extra->>'source'='portal_message'),'[]'));
END $function$;
REVOKE ALL ON FUNCTION api.list_portal_message_documents(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION api.list_portal_message_documents(uuid) TO authenticated;

-- list_my_portal_messages
CREATE OR REPLACE FUNCTION api.list_my_portal_messages(p_object_id text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,api AS $function$
BEGIN
  IF NOT COALESCE(api.is_actor_persona(),false)
    OR NOT EXISTS(SELECT 1 FROM api.current_user_portal_object_ids() id WHERE id=p_object_id) THEN
    RAISE EXCEPTION 'Fiche inaccessible' USING ERRCODE='42501';
  END IF;
  -- Aucune note interne : seuls les messages reçus du portail et les réponses
  -- explicitement marquées sortantes sont visibles au partenaire.
  RETURN COALESCE((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.created_at DESC) FROM (
    SELECT c.id,c.subject,c.body,c.created_at,c.status,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('id',r.id,'body',r.body,'created_at',r.created_at) ORDER BY r.created_at)
        FROM public.crm_interaction r WHERE r.parent_interaction_id=c.id AND r.direction='outbound'),'[]') replies
    FROM public.crm_interaction c WHERE c.source='portal' AND c.parent_interaction_id IS NULL
      AND c.actor_id=api.current_user_actor_id() AND c.object_id=p_object_id
    ORDER BY c.created_at DESC LIMIT 50) m),'[]');
END $function$;
REVOKE ALL ON FUNCTION api.list_my_portal_messages(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION api.list_my_portal_messages(text) TO authenticated;

-- Photo B contract; later stages close actor mutations in the SAME transaction
ALTER TABLE public.media ADD COLUMN IF NOT EXISTS extra jsonb;
CREATE OR REPLACE FUNCTION internal.portal_photo_assert_actor(p_object_id text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,api AS $function$
DECLARE v_actor uuid:=api.current_user_actor_id(); v_visibility jsonb;
BEGIN
  IF NOT COALESCE(api.is_actor_persona(),false) OR v_actor IS NULL
    OR NOT EXISTS(SELECT 1 FROM api.current_user_portal_object_ids() id WHERE id=p_object_id) THEN
    RAISE EXCEPTION 'Fiche inaccessible' USING ERRCODE='42501';
  END IF;
  v_visibility:=api.get_portal_section_visibility(p_object_id);
  IF COALESCE(v_visibility->'floor_modules','[]') ? 'media' OR COALESCE(v_visibility->'masked_modules','[]') ? 'media' THEN
    RAISE EXCEPTION 'Les photos sont gérées par l’office' USING ERRCODE='42501';
  END IF;
  RETURN v_actor;
END $function$;
CREATE OR REPLACE FUNCTION internal.portal_photos_json(p_object_id text)
RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $function$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',m.id,'url',m.url,'title',COALESCE(m.title,''),
    'credit',COALESCE(m.credit,''),'position',m.position,'isMain',COALESCE(m.is_main,false),'portalDocumentId',m.extra->>'portal_document_id') ORDER BY m.position,m.created_at,m.id),'[]')
  FROM public.media m JOIN public.ref_code_media_type t ON t.id=m.media_type_id
  WHERE m.object_id=p_object_id AND m.place_id IS NULL AND t.code='photo'
    AND m.is_published AND COALESCE(m.visibility,'public')='public';
$function$;
CREATE OR REPLACE FUNCTION api.portal_photo_upload_context(p_object_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,api,internal AS $function$
DECLARE v_actor uuid:=internal.portal_photo_assert_actor(p_object_id);
BEGIN
  IF (SELECT count(*) FROM public.actor_document a JOIN public.ref_document d ON d.id=a.document_id
    WHERE a.actor_id=v_actor AND a.created_at>=CURRENT_DATE AND d.extra->>'source'='portal_photo')>=30 THEN
    RAISE EXCEPTION 'Limite quotidienne atteinte. Réessayez demain.' USING ERRCODE='P0001';
  END IF;
  RETURN jsonb_build_object('actorId',v_actor);
END $function$;
CREATE OR REPLACE FUNCTION api.list_my_portal_photos(p_object_id text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,api,internal AS $function$
BEGIN
  PERFORM internal.portal_photo_assert_actor(p_object_id);
  RETURN internal.portal_photos_json(p_object_id);
END $function$;
CREATE OR REPLACE FUNCTION api.withdraw_portal_photo(p_object_id text,p_media_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,api,internal AS $function$
DECLARE v_main boolean; v_next uuid;
BEGIN
  PERFORM internal.portal_photo_assert_actor(p_object_id);
  PERFORM 1 FROM public.object WHERE id=p_object_id FOR UPDATE;
  SELECT m.is_main INTO v_main FROM public.media m JOIN public.ref_code_media_type t ON t.id=m.media_type_id
    WHERE m.id=p_media_id AND m.object_id=p_object_id AND m.place_id IS NULL
      AND t.code='photo' AND COALESCE(m.visibility,'public')='public' FOR UPDATE OF m;
  IF NOT FOUND THEN RAISE EXCEPTION 'Photo inaccessible' USING ERRCODE='42501'; END IF;
  -- Retrait immédiat de la galerie publiée ; l'office conserve l'historique et
  -- peut restaurer le média depuis son éditeur. Aucun fichier n'est détruit.
  UPDATE public.media SET is_published=false,is_main=false WHERE id=p_media_id;
  IF v_main THEN
    SELECT m.id INTO v_next FROM public.media m JOIN public.ref_code_media_type t ON t.id=m.media_type_id
      WHERE m.object_id=p_object_id AND m.place_id IS NULL AND m.is_published
        AND t.code='photo' AND COALESCE(m.visibility,'public')='public' ORDER BY m.position,m.created_at,m.id LIMIT 1;
    IF v_next IS NOT NULL THEN UPDATE public.media SET is_main=true WHERE id=v_next; END IF;
  END IF;
  RETURN internal.portal_photos_json(p_object_id);
END $function$;
CREATE OR REPLACE FUNCTION api.reorder_portal_photos(p_object_id text,p_media_ids jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,api,internal AS $function$
DECLARE v_ids uuid[]; v_count integer; v_total integer; v_i integer;
BEGIN
  PERFORM internal.portal_photo_assert_actor(p_object_id);
  IF jsonb_typeof(p_media_ids) IS DISTINCT FROM 'array' OR jsonb_array_length(p_media_ids)>100
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_media_ids) id WHERE jsonb_typeof(id)<>'string' OR id#>>'{}'!~*'^[0-9a-f-]{36}$') THEN
    RAISE EXCEPTION 'Ordre des photos invalide' USING ERRCODE='22023';
  END IF;
  v_ids:=ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(p_media_ids));
  PERFORM 1 FROM public.object WHERE id=p_object_id FOR UPDATE;
  SELECT count(*),count(*) FILTER(WHERE m.id=ANY(v_ids)) INTO v_total,v_count
    FROM public.media m JOIN public.ref_code_media_type t ON t.id=m.media_type_id
    WHERE m.object_id=p_object_id AND m.place_id IS NULL AND m.is_published AND t.code='photo' AND COALESCE(m.visibility,'public')='public';
  IF v_count<>cardinality(v_ids) OR v_count<>v_total OR cardinality(v_ids)<>(SELECT count(DISTINCT id) FROM unnest(v_ids) id) THEN
    RAISE EXCEPTION 'Les photos ont changé. Rechargez la fiche avant de les réordonner.' USING ERRCODE='PT409';
  END IF;
  UPDATE public.media SET is_main=false WHERE id=ANY(v_ids);
  FOR v_i IN 1..COALESCE(cardinality(v_ids),0) LOOP
    UPDATE public.media SET position=v_i,is_main=(v_i=1) WHERE id=v_ids[v_i];
  END LOOP;
  RETURN internal.portal_photos_json(p_object_id);
END $function$;
CREATE OR REPLACE FUNCTION internal.validate_portal_photo_additions(p_object_id text,p_payload jsonb,p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,api AS $function$
DECLARE v_item jsonb; v_id uuid; v_ids uuid[]:=ARRAY[]::uuid[]; v_replace uuid;
BEGIN
  IF p_user_id IS NULL OR jsonb_typeof(p_payload->'additions') IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_payload->'additions') NOT BETWEEN 1 AND 20 THEN
    RAISE EXCEPTION 'Ajouts de photos invalides' USING ERRCODE='22023';
  END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_payload->'additions') LOOP
    IF jsonb_typeof(v_item)<>'object' OR COALESCE(v_item->>'upload_id','')!~*'^[0-9a-f-]{36}$'
      OR length(COALESCE(v_item->>'credit',''))>200
      OR EXISTS(SELECT 1 FROM jsonb_object_keys(v_item) k WHERE k NOT IN ('upload_id','credit','replace_media_id')) THEN
      RAISE EXCEPTION 'Photo proposée invalide' USING ERRCODE='22023';
    END IF;
    v_id:=(v_item->>'upload_id')::uuid;
    IF v_id=ANY(v_ids) THEN RAISE EXCEPTION 'Photo répétée' USING ERRCODE='22023'; END IF;
    v_ids:=array_append(v_ids,v_id);
    PERFORM 1 FROM public.ref_document d JOIN public.actor_document a ON a.document_id=d.id
      WHERE d.id=v_id AND a.created_by=p_user_id AND d.extra->>'source'='portal_photo'
        AND d.extra->>'object_id'=p_object_id AND d.extra->>'rights_confirmed'='true'
        AND d.extra->>'published_media_id' IS NULL AND d.access_scope='crm_private'
        AND d.storage_bucket='actor-documents' AND d.storage_path LIKE 'portal-photos/'||a.actor_id::text||'/%';
    IF NOT FOUND THEN RAISE EXCEPTION 'Photo privée inaccessible' USING ERRCODE='42501'; END IF;
    v_replace:=NULLIF(v_item->>'replace_media_id','')::uuid;
    IF v_replace IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.media m JOIN public.ref_code_media_type t ON t.id=m.media_type_id
      WHERE m.id=v_replace AND m.object_id=p_object_id AND m.place_id IS NULL AND t.code='photo' AND COALESCE(m.visibility,'public')='public') THEN
      RAISE EXCEPTION 'La photo à remplacer est inaccessible' USING ERRCODE='42501';
    END IF;
  END LOOP;
END $function$;
CREATE OR REPLACE FUNCTION api.portal_photo_preview(p_document_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,api AS $function$
DECLARE v_doc public.ref_document%ROWTYPE; v_owner uuid;
BEGIN
  SELECT * INTO v_doc FROM public.ref_document WHERE id=p_document_id AND extra->>'source'='portal_photo';
  SELECT created_by INTO v_owner FROM public.actor_document WHERE document_id=p_document_id;
  IF v_doc.id IS NULL OR v_doc.storage_bucket IS DISTINCT FROM 'actor-documents' OR v_doc.access_scope IS DISTINCT FROM 'crm_private'
    OR NOT COALESCE((api.is_actor_persona() AND v_owner=auth.uid()
      AND EXISTS(SELECT 1 FROM api.current_user_portal_object_ids() id WHERE id=v_doc.extra->>'object_id'))
      OR (NOT api.is_actor_persona() AND api.user_can_moderate_object(v_doc.extra->>'object_id')
        AND EXISTS(SELECT 1 FROM public.pending_change pc WHERE pc.object_id=v_doc.extra->>'object_id' AND pc.status='pending'
          AND pc.submission_id IS NOT NULL AND pc.submitted_by=v_owner AND pc.metadata->>'rpc'='publish_portal_photo_additions'
          AND EXISTS(SELECT 1 FROM jsonb_array_elements(pc.payload->'additions') item WHERE item->>'upload_id'=v_doc.id::text))),false) THEN
    RAISE EXCEPTION 'Photo privée inaccessible' USING ERRCODE='42501';
  END IF;
  RETURN jsonb_build_object('bucket',v_doc.storage_bucket,'path',v_doc.storage_path,'title',v_doc.title);
END $function$;
CREATE OR REPLACE FUNCTION api.prepare_portal_photo_approval(p_id uuid,p_batch boolean,p_claim_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,api,internal AS $function$
DECLARE v_object text; v_pc public.pending_change%ROWTYPE; v_item jsonb; v_doc public.ref_document%ROWTYPE; v_docs jsonb:='[]';
BEGIN
  IF p_claim_id IS NULL THEN RAISE EXCEPTION 'Réservation manquante' USING ERRCODE='22023'; END IF;
  IF p_batch THEN SELECT object_id INTO v_object FROM public.fiche_submission WHERE id=p_id;
  ELSE SELECT object_id INTO v_object FROM public.pending_change WHERE id=p_id; END IF;
  IF v_object IS NULL OR api.is_actor_persona() OR NOT COALESCE(api.user_can_moderate_object(v_object),false) THEN
    RAISE EXCEPTION 'Droits de relecture insuffisants' USING ERRCODE='42501';
  END IF;
  -- Only reserve proposal rows here, in the same order as bulk approval. Taking
  -- an object lock first would invert approve_pending_change's row-lock order.
  FOR v_pc IN SELECT * FROM public.pending_change WHERE object_id=v_object AND status='pending'
      AND ((p_batch AND submission_id=p_id) OR (NOT p_batch AND id=p_id))
      AND metadata->>'rpc'='publish_portal_photo_additions' AND submission_id IS NOT NULL ORDER BY submitted_at,id FOR UPDATE LOOP
    PERFORM internal.validate_portal_photo_additions(v_object,v_pc.payload,v_pc.submitted_by);
    FOR v_item IN SELECT value FROM jsonb_array_elements(v_pc.payload->'additions') LOOP
      SELECT * INTO v_doc FROM public.ref_document WHERE id=(v_item->>'upload_id')::uuid FOR UPDATE;
      IF NULLIF(v_doc.extra->>'approval_claim_id','') IS NOT NULL AND (v_doc.extra->>'approval_claim_until')::timestamptz>now() THEN
        RAISE EXCEPTION 'Une validation est déjà en cours. Réessayez dans quelques minutes.' USING ERRCODE='PT409';
      END IF;
      UPDATE public.ref_document SET extra=extra||jsonb_build_object('approval_claim_id',p_claim_id,'approval_claim_by',auth.uid(),
        'approval_claim_until',now()+interval '15 minutes','publication_ready',false) WHERE id=v_doc.id;
      v_docs:=v_docs||jsonb_build_array(jsonb_build_object('id',v_doc.id,'bucket',v_doc.storage_bucket,'path',v_doc.storage_path,'publicPath','portal-approved/'||v_doc.id::text||'.jpg'));
    END LOOP;
  END LOOP;
  IF jsonb_array_length(v_docs)=0 AND NOT EXISTS(SELECT 1 FROM public.pending_change pc WHERE pc.object_id=v_object
    AND ((p_batch AND pc.submission_id=p_id) OR (NOT p_batch AND pc.id=p_id)) AND pc.metadata->>'rpc'='publish_portal_photo_additions' AND pc.status='applied') THEN
    RAISE EXCEPTION 'Aucune photo à valider' USING ERRCODE='22023';
  END IF;
  RETURN jsonb_build_object('objectId',v_object,'documents',v_docs,'alreadyApplied',jsonb_array_length(v_docs)=0);
END $function$;
CREATE OR REPLACE FUNCTION api.get_portal_photo_review(p_change_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,api AS $function$
DECLARE v_pc public.pending_change%ROWTYPE;
BEGIN
  SELECT * INTO v_pc FROM public.pending_change WHERE id=p_change_id;
  IF v_pc.object_id IS NULL OR api.is_actor_persona() OR NOT COALESCE(api.user_can_moderate_object(v_pc.object_id),false) THEN
    RAISE EXCEPTION 'Relecture inaccessible' USING ERRCODE='42501';
  END IF;
  IF v_pc.status<>'pending' OR v_pc.submission_id IS NULL OR v_pc.metadata->>'rpc' IS DISTINCT FROM 'publish_portal_photo_additions' THEN RETURN '[]'; END IF;
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('id',d.id,'title',d.title,'credit',item->>'credit','replacement',NULLIF(item->>'replace_media_id','') IS NOT NULL))
    FROM jsonb_array_elements(v_pc.payload->'additions') item JOIN public.ref_document d ON d.id=(item->>'upload_id')::uuid
    JOIN public.actor_document a ON a.document_id=d.id AND a.created_by=v_pc.submitted_by
    WHERE d.extra->>'source'='portal_photo' AND d.extra->>'object_id'=v_pc.object_id),'[]');
END $function$;
CREATE OR REPLACE FUNCTION api.publish_portal_photo_additions(p_object_id text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,api,internal AS $function$
DECLARE v_pc public.pending_change%ROWTYPE; v_item jsonb; v_doc public.ref_document%ROWTYPE;
  v_type uuid; v_replace uuid; v_position integer; v_main boolean; v_new uuid;
BEGIN
  IF api.is_actor_persona() OR NOT COALESCE(api.user_can_moderate_object(p_object_id),false) THEN
    RAISE EXCEPTION 'Publication réservée à l’office' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_pc FROM public.pending_change WHERE object_id=p_object_id AND status='pending' AND submission_id IS NOT NULL
    AND metadata->>'rpc'='publish_portal_photo_additions' AND metadata->>'section'='media' AND payload=p_payload LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Demande de relecture introuvable' USING ERRCODE='42501'; END IF;
  PERFORM internal.validate_portal_photo_additions(p_object_id,p_payload,v_pc.submitted_by);
  PERFORM 1 FROM public.object WHERE id=p_object_id FOR UPDATE;
  SELECT id INTO v_type FROM public.ref_code_media_type WHERE code='photo';
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_payload->'additions') LOOP
    SELECT * INTO v_doc FROM public.ref_document WHERE id=(v_item->>'upload_id')::uuid FOR UPDATE;
    IF v_doc.extra->>'publication_ready' IS DISTINCT FROM 'true' OR v_doc.extra->>'approval_claim_by' IS DISTINCT FROM auth.uid()::text
      OR NOT COALESCE((v_doc.extra->>'approval_claim_until')::timestamptz>now(),false) OR NULLIF(v_doc.extra->>'public_url','') IS NULL THEN
      RAISE EXCEPTION 'Ouvrez la relecture des photos pour les publier après vérification.' USING ERRCODE='22023';
    END IF;
    v_replace:=NULLIF(v_item->>'replace_media_id','')::uuid;v_main:=false;
    IF v_replace IS NOT NULL THEN
      SELECT position,is_main INTO v_position,v_main FROM public.media WHERE id=v_replace AND object_id=p_object_id;
      UPDATE public.media SET is_published=false,is_main=false WHERE id=v_replace AND object_id=p_object_id;
    ELSE SELECT COALESCE(max(position),0)+1 INTO v_position FROM public.media WHERE object_id=p_object_id AND place_id IS NULL; END IF;
    v_main:=COALESCE(v_main,false) OR NOT EXISTS(SELECT 1 FROM public.media WHERE object_id=p_object_id AND place_id IS NULL AND media_type_id=v_type AND is_published AND is_main);
    INSERT INTO public.media(object_id,media_type_id,title,credit,url,width,height,kind,visibility,position,is_main,is_published,extra)
      VALUES(p_object_id,v_type,v_doc.title,NULLIF(btrim(v_item->>'credit'),''),v_doc.extra->>'public_url',(v_doc.extra->>'width')::integer,
        (v_doc.extra->>'height')::integer,'illustration','public',COALESCE(v_position,1),v_main,true,jsonb_build_object('portal_document_id',v_doc.id,'source','portal')) RETURNING id INTO v_new;
    UPDATE public.ref_document SET extra=extra||jsonb_build_object('published_media_id',v_new,'published_at',now()) WHERE id=v_doc.id;
    -- L'original reste privé dans le dossier de l'acteur. Le statut « promoted »
    -- de cette bibliothèque concerne un transfert vers object_document, tandis
    -- qu'ici une COPIE autonome devient un média de la fiche.
  END LOOP;
  RETURN internal.portal_photos_json(p_object_id);
END $function$;
CREATE OR REPLACE FUNCTION api.portal_photo_failed_approval(p_claim_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE v_paths jsonb;
BEGIN
  -- Service-only compensation. Never remove a public copy if SQL committed, even
  -- when the HTTP response was lost and the route initially believed it failed.
  SELECT COALESCE(jsonb_agg('portal-approved/'||d.id::text||'.jpg'),'[]') INTO v_paths FROM public.ref_document d
    WHERE d.extra->>'approval_claim_id'=p_claim_id::text AND d.extra->>'source'='portal_photo'
      AND d.extra->>'published_media_id' IS NULL AND NOT EXISTS(SELECT 1 FROM public.media m WHERE m.extra->>'portal_document_id'=d.id::text);
  UPDATE public.ref_document d SET extra=extra-ARRAY['approval_claim_id','approval_claim_by','approval_claim_until','public_url']::text[]||'{"publication_ready":false}'::jsonb
    WHERE d.extra->>'approval_claim_id'=p_claim_id::text AND d.extra->>'source'='portal_photo' AND d.extra->>'published_media_id' IS NULL
      AND NOT EXISTS(SELECT 1 FROM public.media m WHERE m.extra->>'portal_document_id'=d.id::text);
  RETURN v_paths;
END $function$;
REVOKE ALL ON FUNCTION internal.portal_photo_assert_actor(text),internal.portal_photos_json(text),internal.validate_portal_photo_additions(text,jsonb,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION api.portal_photo_upload_context(text),api.list_my_portal_photos(text),api.withdraw_portal_photo(text,uuid),api.reorder_portal_photos(text,jsonb),
  api.portal_photo_preview(uuid),api.get_portal_photo_review(uuid),api.prepare_portal_photo_approval(uuid,boolean,uuid),api.publish_portal_photo_additions(text,jsonb),api.portal_photo_failed_approval(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION api.portal_photo_upload_context(text),api.list_my_portal_photos(text),api.withdraw_portal_photo(text,uuid),api.reorder_portal_photos(text,jsonb),
  api.portal_photo_preview(uuid),api.get_portal_photo_review(uuid),api.prepare_portal_photo_approval(uuid,boolean,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION api.portal_photo_failed_approval(uuid) TO service_role;
DO $preflight$ BEGIN
  IF (SELECT md5(replace(prosrc,E'\r\n',E'\n')) FROM pg_proc WHERE oid='api.actor_portal_floor_modules()'::regprocedure) <> '2bbe58646c2d56dc402bbede946e1511' THEN RAISE EXCEPTION 'Source vive divergente : actor_portal_floor_modules. Comparer avant de poursuivre.'; END IF;
  IF (SELECT md5(replace(prosrc,E'\r\n',E'\n')) FROM pg_proc WHERE oid='api.submit_actor_fiche(text,jsonb,text)'::regprocedure) <> '0861011392137effc9c7cb97bef6beab' THEN RAISE EXCEPTION 'Source vive divergente : submit_actor_fiche. Comparer avant de poursuivre.'; END IF;
  IF (SELECT md5(replace(prosrc,E'\r\n',E'\n')) FROM pg_proc WHERE oid='api.approve_pending_change(uuid,text,boolean)'::regprocedure) <> '78b171f997cd630da118ecc81382448d' THEN RAISE EXCEPTION 'Source vive divergente : approve_pending_change. Comparer avant de poursuivre.'; END IF;
END $preflight$;
CREATE OR REPLACE FUNCTION api.actor_portal_floor_modules()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT ARRAY['legal','provider-follow-up','publication','sync-identifiers','distribution','provider',
               'relationships','places'];
$function$;
CREATE OR REPLACE FUNCTION api.submit_actor_fiche(p_object_id text, p_changes jsonb, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'api', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_uid       uuid := auth.uid();
  v_actor     uuid;
  v_masked    text[];
  v_floor     text[] := api.actor_portal_floor_modules();
  -- CORRECTION CONTRÔLEUR (revue task-5) : le brief listait HUIT writers (avec
  -- save_object_rooms). Le prosrc VIF de api.approve_pending_change (§120) —
  -- re-vérifié en base juste avant cette écriture, md5(prosrc)=3cf2a45631df18e22e0b4c5cd81d9e2e,
  -- IDENTIQUE à l'archive .superpowers/sdd/2026-09-01-portail-acteur/live/approve_pending_change.LIVE.sql —
  -- n'en porte que SEPT : SANS save_object_rooms. Cette liste DOIT rester un
  -- SOUS-ENSEMBLE (depuis la revue du 2026-09-04 : STRICT — voir plus bas) de celle
  -- d'approve_pending_change, JAMAIS un
  -- sur-ensemble : si submit_actor_fiche acceptait un writer qu'approve_pending_change
  -- refuse, ce changement entrerait en base à la soumission puis ne pourrait plus
  -- JAMAIS être approuvé (22023 côté approve) — et comme uq_fiche_submission_open
  -- n'autorise qu'UNE vérification ouverte par fiche, celle-ci resterait bloquée
  -- POUR TOUJOURS (aucun mécanisme ne libère le verrou sans résolution). N'AJOUTE
  -- JAMAIS une entrée ici sans l'avoir d'abord ajoutée, vérifiée et déployée côté
  -- approve_pending_change — et sans mettre à jour l'assertion miroir de
  -- tests/test_actor_portal.sql (bloc D2, « épinglé save_object_rooms ») qui
  -- proteste explicitement contre cette divergence.
  --
  -- RÉDUCTION (revue sécurité 2026-09-04) — le défaut que ces DEUX entrées ferment :
  -- le plancher dur est contrôlé sur `metadata.section`, le ré-dispatch d'écriture est
  -- décidé sur `metadata.rpc`, et RIEN dans cette fonction ne COUPLE les deux clés. Une
  -- enveloppe qui déclare une section anodine ('contacts', ni plancher ni masquée) et un
  -- writer de la liste franchissait donc le plancher, entrait en base, puis se faisait
  -- ré-dispatcher pour de bon à l'approbation. Trois des sept entrées étaient par ailleurs
  -- explicitement interdites AILLEURS dans ce même fichier : `relationships`, `places` et
  -- `media` sont dans api.actor_portal_floor_modules() (§4.1), dont le commentaire dit
  -- pourquoi — save_object_relations « réécrit object_org_link ET actor_object_role, le
  -- périmètre même de l'acteur », save_object_places « supprime les médias des sous-lieux
  -- absents du payload ». Le plancher les fermait par la section ; la whitelist les
  -- rouvrait par le rpc.
  -- La liste est donc ramenée aux SEULS writers que le portail ÉMET réellement. Les cinq
  -- autres n'ont aucun émetteur : les retirer ne retire aucune capacité existante.
  -- L'invariant du §7 tient toujours, et plus largement qu'avant : cette liste reste un
  -- SOUS-ENSEMBLE (ici STRICT) de celle d'api.approve_pending_change — donc aucun
  -- changement accepté ici ne peut être refusé là-bas, et aucune fiche ne peut rester
  -- bloquée à vie sur uq_fiche_submission_open. C'est le sens de l'inclusion qui compte :
  -- rétrécir est TOUJOURS sûr, élargir ne l'est jamais.
  -- Épinglé au test, bloc D2 : les cinq writers retirés y sont refusés UN PAR UN, et
  -- save_object_commercial y a son contrôle positif (une whitelist vidée serait sinon
  -- verte partout et le portail muet).
  v_allowed   text[] := ARRAY['save_object_commercial','save_object_openings','publish_portal_photo_additions'];
  v_change    jsonb;
  v_section   text;
  v_rpc       text;
  v_action    text;
  v_count     int := 0;
  v_sub_id    uuid;
  v_task_id   uuid;
  v_name      text;
  v_sections  text[] := ARRAY[]::text[];
  v_assignees uuid[];
BEGIN
  IF v_uid IS NULL OR NOT api.is_actor_persona() THEN
    RAISE EXCEPTION 'Réservé aux comptes du portail acteur' USING ERRCODE = '42501';
  END IF;
  IF p_object_id IS NULL OR p_object_id NOT IN (SELECT api.current_user_portal_object_ids()) THEN
    RAISE EXCEPTION 'Fiche hors de votre périmètre' USING ERRCODE = '42501';
  END IF;
  IF p_changes IS NULL OR jsonb_typeof(p_changes) <> 'array'
     OR jsonb_array_length(p_changes) = 0 OR jsonb_array_length(p_changes) > 40 THEN
    RAISE EXCEPTION 'p_changes doit être un tableau de 1 à 40 changements' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM fiche_submission fs
              WHERE fs.object_id = p_object_id AND fs.status = 'pending') THEN
    -- PT409 (PostgREST ⇒ HTTP 409, SQLSTATE exposé dans error.code) et PAS 23505 : le front
    -- traduit 23505 en « Cette valeur existe déjà (doublon). » (db-error-message.ts) et
    -- mapDatabaseError applique le SQLSTATE AVANT le message — le prestataire lirait « doublon ».
    RAISE EXCEPTION USING ERRCODE = 'PT409',
      MESSAGE = 'Une vérification est déjà en cours pour cette fiche';
  END IF;

  v_actor := api.current_user_actor_id();
  v_masked := ARRAY(SELECT jsonb_array_elements_text(
    api.get_portal_section_visibility(p_object_id)->'masked_modules'));

  -- Validation de CHAQUE enveloppe avant la moindre écriture.
  FOR v_change IN SELECT * FROM jsonb_array_elements(p_changes) LOOP
    v_section := v_change->'metadata'->>'section';
    v_rpc     := v_change->'metadata'->>'rpc';
    v_action  := v_change->>'action';
    IF v_section IS NULL OR btrim(v_section) = '' THEN
      RAISE EXCEPTION 'metadata.section requis sur chaque changement' USING ERRCODE = '22023';
    END IF;
    IF v_section = ANY (v_floor) THEN
      RAISE EXCEPTION 'La section « % » n''est pas ouverte aux acteurs', v_section USING ERRCODE = '22023';
    END IF;
    IF v_section = ANY (v_masked) THEN
      RAISE EXCEPTION 'La section « % » est masquée par votre organisation', v_section USING ERRCODE = '22023';
    END IF;
    IF v_rpc IS NOT NULL AND NOT (v_rpc = ANY (v_allowed)) THEN
      RAISE EXCEPTION 'Writer non autorisé: %', v_rpc USING ERRCODE = '22023';
    END IF;
    IF COALESCE(v_action, '') NOT IN ('insert','update','delete') THEN
      RAISE EXCEPTION 'action invalide: %', v_action USING ERRCODE = '22023';
    END IF;
    IF v_change->'payload' IS NULL OR (v_change->>'target_table') IS NULL
       OR btrim(v_change->>'target_table') = '' THEN
      RAISE EXCEPTION 'payload et target_table requis' USING ERRCODE = '22023';
    END IF;
    IF v_section = 'media' THEN
      IF v_rpc IS DISTINCT FROM 'publish_portal_photo_additions' OR v_action <> 'update'
        OR v_change->>'target_table' IS DISTINCT FROM 'media' THEN
        RAISE EXCEPTION 'Les photos se transmettent uniquement comme ajouts à relire' USING ERRCODE='22023';
      END IF;
      PERFORM internal.validate_portal_photo_additions(p_object_id,v_change->'payload',v_uid);
    ELSIF v_rpc = 'publish_portal_photo_additions' THEN
      RAISE EXCEPTION 'Writer de photos hors de sa rubrique' USING ERRCODE='22023';
    END IF;
    v_sections := array_append(v_sections, v_change->'metadata'->>'field');
  END LOOP;

  -- La soumission. Le pré-check EXISTS plus haut n'est qu'un check-then-act : il rend
  -- le cas courant lisible sans lever d'exception coûteuse, mais entre lui et CET
  -- INSERT, rien ne l'empêche d'être doublé (double-clic avant que le bouton se
  -- désactive côté front, deux onglets) — les deux appels peuvent lire EXISTS=FALSE
  -- et arriver ici ensemble ; uq_fiche_submission_open (index unique partiel)
  -- départage alors les deux à l'ÉCRITURE, pas au pré-check. Sans ce blindage, le
  -- perdant de la course remonterait un 23505 NU — exactement le message
  -- « doublon » (db-error-message.ts) que le pré-check ci-dessus prétend déjà
  -- fermer, et le piège nommé par le PO pour ce chantier. Le code d'erreur est la
  -- SEULE chose que voit le prestataire : on rattrape donc ICI, à l'écriture réelle,
  -- avec le MÊME message et le MÊME SQLSTATE que le pré-check — le front n'a
  -- jamais qu'un seul cas PT409 à traiter. Motif identique à 4 précédents du dépôt
  -- (SELECT optimiste + écriture blindée) : api.create_tag et
  -- api.create_membership_campaign (api_views_functions.sql), et leur miroir dans
  -- migration_tags_create_and_order.sql.
  BEGIN
    INSERT INTO fiche_submission (object_id, actor_id, submitted_by, note)
    VALUES (p_object_id, v_actor, v_uid, NULLIF(btrim(COALESCE(p_note, '')), ''))
    RETURNING id INTO v_sub_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409',
      MESSAGE = 'Une vérification est déjà en cours pour cette fiche';
  END;

  -- Les changements (mêmes colonnes que submit_pending_change + submission_id ;
  -- le trigger after-insert flippe object.is_editing).
  FOR v_change IN SELECT * FROM jsonb_array_elements(p_changes) LOOP
    INSERT INTO pending_change (object_id, target_table, target_pk, action, payload,
                                submitted_by, status, metadata, submission_id)
    VALUES (p_object_id, v_change->>'target_table', v_change->>'target_pk',
            v_change->>'action', v_change->'payload', v_uid, 'pending',
            -- Les trois clés d'ATTESTATION sont retirées de l'enveloppe : elles n'appartiennent
            -- qu'à api.approve_pending_change (§7), qui seule les écrit, et seulement sur sa
            -- branche attestée. Sans ce filtre, un acteur les poserait lui-même — au nom du
            -- modérateur de son choix — et elles survivraient sur les deux issues que §7 ne
            -- réécrit pas : un REFUS (reject_pending_change ne touche pas metadata) et la voie
            -- AUTO (`applied`, aucune réécriture). La ligne porterait alors « untel déclare
            -- l'avoir reportée à la main » sans que personne n'ait rien signé. `-` sur jsonb est
            -- NULL-safe, et metadata est nécessairement un objet ici (un scalaire est abattu par
            -- le contrôle d'enveloppe plus haut). Les clés déclaratives — section, rpc,
            -- manual_apply, field, before, after — passent intactes.
            (v_change->'metadata') - ARRAY['applied_manually','attested_by','attested_at']::text[],
            v_sub_id);
    v_count := v_count + 1;
  END LOOP;

  -- La tâche de vérification, typée par extra (crm_task n'a pas de colonne kind).
  SELECT o.name INTO v_name FROM object o WHERE o.id = p_object_id;
  v_task_id := gen_random_uuid();
  INSERT INTO crm_task (id, object_id, actor_id, title, description, status, priority, created_by, extra)
  VALUES (v_task_id, p_object_id, v_actor,
          'Vérifier la fiche « ' || COALESCE(v_name, p_object_id) || ' »',
          COALESCE('Message du prestataire : ' || NULLIF(btrim(COALESCE(p_note, '')), '') || E'\n', '')
            -- array_to_string (forme à 2 arguments) ignore silencieusement les NULL : si
            -- tous les metadata.field valent NULL, la liste serait vide et la phrase
            -- finirait tronquée (« Sections modifiées : » suivi de rien) — l'office lit
            -- cette description, un repli lisible vaut mieux qu'une phrase coupée.
            || 'Sections modifiées : ' || COALESCE(NULLIF(array_to_string(v_sections, ', '), ''), '(non précisées)'),
          'todo', 'medium', v_uid,
          jsonb_build_object('kind', 'fiche_verification', 'submission_id', v_sub_id));
  UPDATE fiche_submission SET task_id = v_task_id WHERE id = v_sub_id;

  -- Assignation multi (D3) + notifications (kind crm_task_assigned réutilisé — l'outbox
  -- e-mail existante part sans aucun nouveau rail).
  v_assignees := ARRAY(SELECT api.list_object_verifier_ids(p_object_id));
  IF COALESCE(array_length(v_assignees, 1), 0) > 0 THEN
    INSERT INTO crm_task_assignee (task_id, user_id, assigned_by)
    SELECT v_task_id, u.u, v_uid FROM unnest(v_assignees) AS u(u)
    ON CONFLICT (task_id, user_id) DO NOTHING;
    -- owner de compat = plus petit uuid (même règle que save_crm_task, migration_crm_task_
    -- multi_assignee_notifications.sql L378). PAS min(u.u) : uuid n'a pas d'agrégat MIN/MAX
    -- sur cette version de Postgres (constaté à l'exécution : « function min(uuid) does not
    -- exist ») — uuid n'a qu'un opclass btree (ORDER BY fonctionne), pas d'agrégat dédié.
    UPDATE crm_task SET owner = (SELECT u.u FROM unnest(v_assignees) u(u) ORDER BY u.u LIMIT 1)
      WHERE id = v_task_id;
    PERFORM api.notify_task_assignees(v_task_id, v_assignees, v_uid);
  END IF;

  RETURN jsonb_build_object(
    'submission_id', v_sub_id, 'task_id', v_task_id,
    'change_count', v_count,
    'assignee_count', COALESCE(array_length(v_assignees, 1), 0));
END;
$function$;
CREATE OR REPLACE FUNCTION api.approve_pending_change(p_id uuid, p_review_note text DEFAULT NULL::text, p_applied_manually boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'api', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_row pending_change%ROWTYPE;
  v_rpc text;
  v_uid uuid := auth.uid();
  -- SEPT entrées — cf. l'avertissement ci-dessus. Miroir exact de api.submit_actor_fiche.
  v_allowed text[] := ARRAY[
    'publish_portal_photo_additions',
    'save_object_commercial',
    'save_object_workspace_sustainability',
    'save_object_workspace_tags',
    'save_object_itinerary_nested',
    'save_object_openings',
    'save_object_places',
    'save_object_relations'
  ];
  v_now timestamptz := now();
BEGIN
  SELECT * INTO v_row FROM pending_change WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Suggestion introuvable: %', p_id USING ERRCODE = 'no_data_found';
  END IF;
  IF v_row.status <> 'pending' THEN
    RAISE EXCEPTION 'Suggestion déjà résolue (statut=%)', v_row.status USING ERRCODE = '22023';
  END IF;
  -- La garde d'autorisation reste AVANT toute branche : l'attestation est un geste de
  -- modération de plus, pas un chemin parallèle. Elle s'évalue sur auth.uid() — SECURITY
  -- DEFINER change le propriétaire des droits Postgres, jamais l'identité applicative.
  -- Le bras `object_id IS NULL` est EXPLICITE, et il est indispensable :
  -- user_can_moderate_object rend NULL (et non FALSE) sur un object_id NULL, parce que
  -- `NULL IN (<ensemble non vide>)` vaut NULL — `IF NOT NULL THEN` n'est alors pas pris, et
  -- la garde laisse passer. pending_change.object_id EST nullable, et api.submit_pending_change
  -- (exécutable par tout `authenticated`) accepte p_object_id NULL en sautant son propre
  -- contrôle de lisibilité : une ligne orpheline est donc fabricable. Tant que rpc NULL était
  -- refusé avant toute écriture, ce trou était inerte ; la branche attestée est la PREMIÈRE
  -- écriture atteignable derrière cette garde — un agent sans aucun droit sur la ligne y
  -- signerait une attestation nominative. La fonction sœur list_pending_changes filtre déjà
  -- `pc.object_id IS NOT NULL` : l'asymétrie était un oubli. Les gardes jumelles de §7.2
  -- n'en ont pas besoin — elles portent sur fiche_submission.object_id, déclaré NOT NULL.
  IF v_row.object_id IS NULL OR NOT api.user_can_moderate_object(v_row.object_id) THEN
    RAISE EXCEPTION 'Droits de modération insuffisants sur cet objet' USING ERRCODE = '42501';
  END IF;

  v_rpc := v_row.metadata->>'rpc';

  IF v_rpc IS NULL THEN
    -- 18a/D9 : un changement manual_apply devient APPROUVABLE — à la seule condition que le
    -- modérateur ATTESTE l'avoir reporté à la main dans l'éditeur. Aucun SQL ne peut vérifier
    -- ce report ; ce que la base peut faire, et fait ici, c'est le rendre ATTESTABLE.
    IF NOT COALESCE(p_applied_manually, FALSE) THEN
      -- Message ADRESSÉ au conseiller, pas au développeur : c'est le refus le plus courant du
      -- nouveau flux (5 rubriques sur 7 sont manual_apply), et il doit dire le REMÈDE. Le
      -- jargon précédent (« RPC de re-dispatch absent… ») n'indiquait rien : le conseiller
      -- appelait le support, ou refusait la soumission par dépit — et le prestataire recevait
      -- un refus injustifié. Il doit surtout être DISTINCT de celui du writer non autorisé
      -- ci-dessous, qui demande l'action INVERSE (ne surtout pas valider).
      RAISE EXCEPTION 'Cette rubrique n''a pas de report automatique : reportez la modification dans l''éditeur, puis cochez « j''ai reporté ces modifications » pour la valider'
        USING ERRCODE = '22023';
    END IF;
    UPDATE pending_change
       SET status      = 'approved',   -- approved ≠ applied : attesté par un humain, pas écrit par la machine
           reviewed_by = v_uid,
           reviewed_at = v_now,
           review_note = p_review_note,
           -- Trace EXPLICITE, et non dérivée. « status='approved' AND applied_at IS NULL »
           -- dit la même chose aujourd'hui, mais c'est une inférence : le premier remaniement
           -- des statuts l'efface sans bruit. reviewed_by seul ne suffit pas non plus — un
           -- REJET en pose un aussi. On écrit donc le fait lui-même, avec son auteur et sa
           -- date. Clé distincte de metadata.manual_apply, qui est la DÉCLARATION du
           -- soumetteur (« cette rubrique n'a pas de writer ») : ici c'est l'ATTESTATION du
           -- modérateur (« je l'ai reportée »). Deux faits, deux clés, deux responsables.
           metadata    = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                           'applied_manually', TRUE,
                           'attested_by', v_uid,
                           'attested_at', v_now),
           updated_at  = v_now
     WHERE id = p_id;
    RETURN jsonb_build_object('success', true, 'id', p_id, 'status', 'approved', 'reviewed_at', v_now);
  END IF;

  -- Un writer PRÉSENT mais hors whitelist reste refusé, attestation ou pas : l'attestation
  -- ne couvre que l'ABSENCE de route automatique. Sans cette branche distincte du bras
  -- « v_rpc IS NULL », p_applied_manually deviendrait un interrupteur d'approbation
  -- universel, capable d'ouvrir n'importe quelle enveloppe déposée par un autre chemin.
  IF NOT (v_rpc = ANY(v_allowed)) THEN
    -- Ici l'enveloppe porte un writer RÉEL hors whitelist : ce n'est pas une rubrique à
    -- reporter, c'est une anomalie. Le conseiller ne doit surtout pas « valider quand même ».
    RAISE EXCEPTION 'Anomalie sur cette suggestion (writer « % » non autorisé) : ne la validez pas, signalez-la à l''administrateur', v_rpc
      USING ERRCODE = '22023';
  END IF;

  -- Re-dispatch vers le writer structuré (signature uniforme (p_object_id, p_payload)).
  -- %I quote l'identifiant ; le nom est en outre whitelisté ci-dessus. AS THE CALLER : le
  -- writer re-vérifie ses propres gates d'écriture canonique contre auth.uid().
  EXECUTE format('SELECT api.%I($1, $2)', v_rpc) USING v_row.object_id, v_row.payload;

  UPDATE pending_change
     SET status      = 'applied',
         reviewed_by = v_uid,
         reviewed_at = v_now,
         applied_at  = v_now,
         review_note = p_review_note,
         updated_at  = v_now
   WHERE id = p_id;

  RETURN jsonb_build_object('success', true, 'id', p_id, 'status', 'applied', 'applied_at', v_now);
END;
$function$;
REVOKE ALL ON FUNCTION api.actor_portal_floor_modules() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION api.actor_portal_floor_modules() TO authenticated,service_role;

-- Canonical gallery read helper ONLY: no menu/stay RLS rollout
CREATE OR REPLACE FUNCTION api.can_read_object_for_correction(p_object_id text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,api,auth,pg_temp AS $function$
BEGIN
 IF auth.uid() IS NULL OR COALESCE(api.is_actor_persona(),false) THEN RETURN false; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.object o WHERE o.id=p_object_id AND o.is_test=(SELECT api.current_user_test_realm())) THEN RETURN false; END IF;
 RETURN COALESCE(api.user_can_write_object_canonical(p_object_id),false);
END;
$function$;
REVOKE ALL ON FUNCTION api.can_read_object_for_correction(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION api.can_read_object_for_correction(text) TO authenticated;
DROP POLICY IF EXISTS correction_read_root_gallery ON public.media;
CREATE POLICY correction_read_root_gallery ON public.media FOR SELECT TO authenticated USING(place_id IS NULL AND api.can_read_object_for_correction(object_id));

-- Moderation lock order ONLY: no collection baselines or commercial/opening writer changes
DO $photo_lock_patch$
DECLARE v_oid regprocedure:='api.approve_pending_change(uuid,text,boolean)'::regprocedure;v_raw text;v_def text;v_pair jsonb;v_meta jsonb;
BEGIN
 SELECT replace(p.prosrc,E'\r\n',E'\n'),pg_get_functiondef(p.oid),
  jsonb_build_object('owner',p.proowner,'acl',to_jsonb(p.proacl),'config',to_jsonb(p.proconfig),'definer',p.prosecdef)
 INTO v_raw,v_def,v_meta FROM pg_proc p WHERE p.oid=v_oid AND p.prosecdef AND pg_get_userbyid(p.proowner)='postgres';
 IF md5(v_raw)='6b397ae9bf5c169c2d84f923b331966e' THEN RETURN; END IF;
 IF md5(v_raw) IS DISTINCT FROM 'e6130617c05459dccd63d23814160f60' THEN RAISE EXCEPTION 'Unreviewed photo moderation source: %',v_oid; END IF;
 v_def:=replace(v_def,E'\r\n',E'\n');
 FOR v_pair IN SELECT value FROM jsonb_array_elements(jsonb_build_array(jsonb_build_array($old$  v_now timestamptz := now();$old$,$new$  v_now timestamptz := now();
  v_sub_id uuid;$new$),
jsonb_build_array($old$  SELECT * INTO v_row FROM pending_change WHERE id = p_id FOR UPDATE;$old$,$new$  -- /* album-photo-lock-order */ Submission -> proposal -> object, same order as the batch.
  SELECT submission_id INTO v_sub_id FROM pending_change WHERE id=p_id;
  IF v_sub_id IS NOT NULL THEN PERFORM 1 FROM fiche_submission WHERE id=v_sub_id FOR UPDATE; END IF;
  SELECT * INTO v_row FROM pending_change WHERE id = p_id FOR UPDATE;$new$))) LOOP
  IF (length(v_def)-length(replace(v_def,v_pair->>0,'')))/length(v_pair->>0)<>1 THEN RAISE EXCEPTION 'Photo moderation anchor differs: %',v_oid; END IF;
  v_def:=replace(v_def,v_pair->>0,v_pair->>1);
 END LOOP;
 EXECUTE v_def;
 IF (SELECT md5(replace(prosrc,E'\r\n',E'\n')) FROM pg_proc WHERE oid=v_oid) IS DISTINCT FROM '6b397ae9bf5c169c2d84f923b331966e'
  OR (SELECT jsonb_build_object('owner',p.proowner,'acl',to_jsonb(p.proacl),'config',to_jsonb(p.proconfig),'definer',p.prosecdef) FROM pg_proc p WHERE p.oid=v_oid) IS DISTINCT FROM v_meta THEN
  RAISE EXCEPTION 'Photo moderation target/attributes differ';
 END IF;
END;
$photo_lock_patch$;
ALTER FUNCTION api.approve_pending_change(uuid,text,boolean) SET lock_timeout='5s';
DO $photo_lock_patch$
DECLARE v_oid regprocedure:='api.reject_pending_change(uuid,text)'::regprocedure;v_raw text;v_def text;v_pair jsonb;v_meta jsonb;
BEGIN
 SELECT replace(p.prosrc,E'\r\n',E'\n'),pg_get_functiondef(p.oid),
  jsonb_build_object('owner',p.proowner,'acl',to_jsonb(p.proacl),'config',to_jsonb(p.proconfig),'definer',p.prosecdef)
 INTO v_raw,v_def,v_meta FROM pg_proc p WHERE p.oid=v_oid AND p.prosecdef AND pg_get_userbyid(p.proowner)='postgres';
 IF md5(v_raw)='3326541c58555fc8c19b0463d50abc11' THEN RETURN; END IF;
 IF md5(v_raw) IS DISTINCT FROM 'c125ebd25849243cf45f1b7a114960ed' THEN RAISE EXCEPTION 'Unreviewed photo moderation source: %',v_oid; END IF;
 v_def:=replace(v_def,E'\r\n',E'\n');
 FOR v_pair IN SELECT value FROM jsonb_array_elements(jsonb_build_array(jsonb_build_array($old$  v_now timestamptz := now();$old$,$new$  v_now timestamptz := now();
  v_sub_id uuid;$new$),
jsonb_build_array($old$  SELECT * INTO v_row FROM pending_change WHERE id = p_id FOR UPDATE;$old$,$new$  -- /* album-photo-lock-order */ Submission -> proposal -> object, same order as the batch.
  SELECT submission_id INTO v_sub_id FROM pending_change WHERE id=p_id;
  IF v_sub_id IS NOT NULL THEN PERFORM 1 FROM fiche_submission WHERE id=v_sub_id FOR UPDATE; END IF;
  SELECT * INTO v_row FROM pending_change WHERE id = p_id FOR UPDATE;$new$),
jsonb_build_array($old$IF NOT api.user_can_moderate_object(v_row.object_id) THEN$old$,$new$IF v_row.object_id IS NULL OR NOT api.user_can_moderate_object(v_row.object_id) THEN$new$))) LOOP
  IF (length(v_def)-length(replace(v_def,v_pair->>0,'')))/length(v_pair->>0)<>1 THEN RAISE EXCEPTION 'Photo moderation anchor differs: %',v_oid; END IF;
  v_def:=replace(v_def,v_pair->>0,v_pair->>1);
 END LOOP;
 EXECUTE v_def;
 IF (SELECT md5(replace(prosrc,E'\r\n',E'\n')) FROM pg_proc WHERE oid=v_oid) IS DISTINCT FROM '3326541c58555fc8c19b0463d50abc11'
  OR (SELECT jsonb_build_object('owner',p.proowner,'acl',to_jsonb(p.proacl),'config',to_jsonb(p.proconfig),'definer',p.prosecdef) FROM pg_proc p WHERE p.oid=v_oid) IS DISTINCT FROM v_meta THEN
  RAISE EXCEPTION 'Photo moderation target/attributes differ';
 END IF;
END;
$photo_lock_patch$;
ALTER FUNCTION api.reject_pending_change(uuid,text) SET lock_timeout='5s';

-- supabase/migrations/20261103072105_partner_portal_photo_stock_and_gallery_contract.sql
SET LOCAL lock_timeout='500ms';
SET LOCAL statement_timeout='15s';
SET LOCAL idle_in_transaction_session_timeout='20s';
CREATE INDEX IF NOT EXISTS idx_ref_document_portal_photo_object
 ON public.ref_document ((extra->>'object_id')) WHERE extra->>'source'='portal_photo';
CREATE TABLE IF NOT EXISTS internal.gallery_write_receipt(
 object_id text NOT NULL REFERENCES public.object(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 request_id uuid NOT NULL,
 request jsonb NOT NULL,
 completed_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(object_id,user_id,request_id)
);
ALTER TABLE internal.gallery_write_receipt ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON internal.gallery_write_receipt FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION internal.gallery_published_photo_count(p_object_id text)
RETURNS integer LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $function$
 SELECT count(*)::integer FROM public.media m JOIN public.ref_code_media_type t ON t.id=m.media_type_id
 WHERE m.object_id=p_object_id AND m.place_id IS NULL AND t.code='photo'
   AND m.is_published AND COALESCE(m.visibility,'public')='public';
$function$;
CREATE OR REPLACE FUNCTION internal.gallery_photo_reservations(p_object_id text)
RETURNS TABLE(document_id uuid,replace_media_id uuid)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $function$
 SELECT d.id, CASE WHEN d.extra->>'slot_replace_media_id' ~* '^[0-9a-f-]{36}$'
                  THEN (d.extra->>'slot_replace_media_id')::uuid END
 FROM public.ref_document d
 CROSS JOIN LATERAL (
   SELECT COALESCE(bool_or(pc.status='pending'),false) AS pending,
          COALESCE(bool_or(pc.status<>'pending' AND CASE
            WHEN d.extra->>'slot_contract'='photo-stock-v1' THEN pc.id::text=d.extra->>'slot_pending_change_id'
            ELSE pc.submitted_at>=COALESCE(NULLIF(d.extra->>'slot_reserved_at','')::timestamptz,d.created_at) END),false) AS resolved
   FROM public.pending_change pc
   WHERE pc.object_id=p_object_id AND pc.metadata->>'rpc'='publish_portal_photo_additions'
     AND EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(pc.payload->'additions','[]')) a
                WHERE a->>'upload_id'=d.id::text)
 ) proposal
 WHERE d.extra->>'source'='portal_photo' AND d.extra->>'object_id'=p_object_id
   AND d.extra->>'published_media_id' IS NULL
   AND COALESCE(d.extra->>'slot_state','uploaded') NOT IN ('cancelled','consumed')
   AND (proposal.pending OR (NOT proposal.resolved AND
       COALESCE(NULLIF(d.extra->>'slot_reserved_until','')::timestamptz,d.created_at+interval '24 hours')>now()));
$function$;
CREATE OR REPLACE FUNCTION internal.gallery_photo_usage(p_object_id text)
RETURNS integer LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public,internal AS $function$
 SELECT internal.gallery_published_photo_count(p_object_id)+COALESCE(sum(
   CASE WHEN r.replace_media_id IS NOT NULL AND EXISTS(
     SELECT 1 FROM public.media m JOIN public.ref_code_media_type t ON t.id=m.media_type_id
     WHERE m.id=r.replace_media_id AND m.object_id=p_object_id AND m.place_id IS NULL
       AND t.code='photo' AND m.is_published AND COALESCE(m.visibility,'public')='public')
   THEN 0 ELSE 1 END),0)::integer
 FROM internal.gallery_photo_reservations(p_object_id) r;
$function$;
CREATE OR REPLACE FUNCTION internal.gallery_assert_photo_capacity(
 p_object_id text,p_previous_usage integer,p_previous_published integer)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public,internal AS $function$
BEGIN
 -- Historical galleries above twenty are preserved, but cannot grow.
 IF internal.gallery_photo_usage(p_object_id)>greatest(20,p_previous_usage)
    OR internal.gallery_published_photo_count(p_object_id)>greatest(20,p_previous_published) THEN
  RAISE EXCEPTION 'Votre galerie peut contenir vingt photos. Retirez une photo ou choisissez un remplacement.' USING ERRCODE='PT409',DETAIL='photo_limit';
 END IF;
END;
$function$;
CREATE OR REPLACE FUNCTION internal.gallery_arm_photo_reservation(p_object_id text,p_document_id uuid,p_replace_media_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public,internal AS $function$
DECLARE v_doc public.ref_document%ROWTYPE;v_first timestamptz;
BEGIN
 -- Callers already hold object -> receipt, or submission -> proposal -> object -> receipt.
 SELECT * INTO v_doc FROM public.ref_document WHERE id=p_document_id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.pending_change pc WHERE pc.object_id=p_object_id AND pc.status='pending'
   AND pc.metadata->>'rpc'='publish_portal_photo_additions' AND EXISTS(
    SELECT 1 FROM jsonb_array_elements(COALESCE(pc.payload->'additions','[]')) a WHERE a->>'upload_id'=p_document_id::text)) THEN RETURN; END IF;
 v_first:=COALESCE(NULLIF(v_doc.extra->>'slot_first_reserved_at','')::timestamptz,
   NULLIF(v_doc.extra->>'slot_reserved_at','')::timestamptz,v_doc.created_at);
 IF v_first+interval '24 hours'<=now() THEN
  RAISE EXCEPTION 'Ce dépôt a expiré. Choisissez à nouveau la photo pour la déposer.' USING ERRCODE='PT409',DETAIL='reservation_expired';
 END IF;
 UPDATE public.ref_document SET extra=COALESCE(extra,'{}')||jsonb_build_object(
  'slot_contract','photo-stock-v1','slot_state',CASE WHEN extra->>'upload_complete'='true' OR extra->>'slot_contract' IS DISTINCT FROM 'photo-stock-v1' THEN 'uploaded' ELSE 'reserved' END,
  'upload_complete',CASE WHEN extra->>'slot_contract'='photo-stock-v1' THEN COALESCE(extra->'upload_complete','false'::jsonb)
    ELSE COALESCE(extra->'upload_complete','true'::jsonb) END,
  'slot_replace_media_id',p_replace_media_id,'slot_first_reserved_at',v_first,'slot_reserved_at',v_first,
  'slot_reserved_until',v_first+interval '24 hours','slot_pending_change_id',NULL) WHERE id=p_document_id;
END;
$function$;
CREATE OR REPLACE FUNCTION internal.gallery_bind_photo_proposal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,internal,pg_temp AS $function$
DECLARE v_item jsonb;v_id uuid;v_published integer;
BEGIN
 IF NEW.status<>'pending' OR NEW.metadata->>'rpc' IS DISTINCT FROM 'publish_portal_photo_additions' THEN RETURN NEW; END IF;
 PERFORM 1 FROM public.object WHERE id=NEW.object_id FOR UPDATE;
 FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(NEW.payload->'additions','[]')) LOOP
  v_id:=(v_item->>'upload_id')::uuid;
  IF EXISTS(SELECT 1 FROM public.pending_change pc WHERE pc.id<>NEW.id AND pc.object_id=NEW.object_id AND pc.status='pending'
    AND pc.metadata->>'rpc'='publish_portal_photo_additions' AND EXISTS(
      SELECT 1 FROM jsonb_array_elements(COALESCE(pc.payload->'additions','[]')) a WHERE a->>'upload_id'=v_id::text)) THEN
   RAISE EXCEPTION 'Cette photo est déjà en relecture.' USING ERRCODE='PT409';
  END IF;
  UPDATE public.ref_document d SET extra=COALESCE(d.extra,'{}')||jsonb_build_object('slot_pending_change_id',NEW.id)
   WHERE d.id=v_id AND d.extra->>'source'='portal_photo' AND d.extra->>'object_id'=NEW.object_id
    AND EXISTS(SELECT 1 FROM public.actor_document a WHERE a.document_id=d.id AND a.created_by=NEW.submitted_by);
  IF NOT FOUND THEN RAISE EXCEPTION 'Photo proposée inaccessible' USING ERRCODE='42501'; END IF;
 END LOOP;
 -- Check the state AFTER the actual proposal exists, not just the earlier validator.
 -- A pre-existing gallery above twenty may be retained, never increased by a proposal.
 v_published:=internal.gallery_published_photo_count(NEW.object_id);
 PERFORM internal.gallery_assert_photo_capacity(NEW.object_id,greatest(20,v_published),v_published);
 RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS gallery_bind_photo_proposal ON public.pending_change;
CREATE TRIGGER gallery_bind_photo_proposal AFTER INSERT ON public.pending_change FOR EACH ROW EXECUTE FUNCTION internal.gallery_bind_photo_proposal();
CREATE OR REPLACE FUNCTION api.reserve_portal_photo_upload(
 p_object_id text,p_upload_id uuid,p_replace_media_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,api,internal,auth,pg_temp AS $function$
DECLARE v_actor uuid;v_doc public.ref_document%ROWTYPE;v_before integer;v_published integer;v_path text;v_pending boolean;
BEGIN
 v_actor:=internal.portal_photo_assert_actor(p_object_id);
 IF auth.uid() IS NULL OR p_upload_id IS NULL THEN RAISE EXCEPTION 'Dépôt invalide' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM public.object WHERE id=p_object_id FOR UPDATE;
 v_before:=internal.gallery_photo_usage(p_object_id);
 v_published:=internal.gallery_published_photo_count(p_object_id);
 SELECT * INTO v_doc FROM public.ref_document WHERE id=p_upload_id FOR UPDATE;
 IF FOUND THEN
  IF v_doc.extra->>'source' IS DISTINCT FROM 'portal_photo' OR v_doc.extra->>'object_id' IS DISTINCT FROM p_object_id
    OR v_doc.extra->>'published_media_id' IS NOT NULL OR v_doc.access_scope IS DISTINCT FROM 'crm_private'
    OR v_doc.storage_bucket IS DISTINCT FROM 'actor-documents'
    OR v_doc.storage_path IS DISTINCT FROM 'portal-photos/'||v_actor::text||'/'||p_upload_id::text||'.jpg' OR NOT EXISTS(
      SELECT 1 FROM public.actor_document a WHERE a.document_id=p_upload_id AND a.actor_id=v_actor AND a.created_by=auth.uid())
    OR (v_doc.extra ? 'slot_replace_media_id' AND v_doc.extra->>'slot_replace_media_id' IS DISTINCT FROM p_replace_media_id::text) THEN
   RAISE EXCEPTION 'Dépôt inaccessible' USING ERRCODE='42501';
  END IF;
  SELECT EXISTS(SELECT 1 FROM public.pending_change pc WHERE pc.object_id=p_object_id AND pc.status='pending'
   AND pc.metadata->>'rpc'='publish_portal_photo_additions'
   AND EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(pc.payload->'additions','[]')) a WHERE a->>'upload_id'=p_upload_id::text)) INTO v_pending;
  IF v_pending THEN
   RETURN jsonb_build_object('id',v_doc.id,'actorId',v_actor,'path',v_doc.storage_path,
     'ready',v_doc.extra->>'upload_complete'='true','title',v_doc.title,'width',v_doc.extra->'width',
     'height',v_doc.extra->'height','sha256',v_doc.extra->>'upload_sha256');
  END IF;
 ELSE
  -- Reuse the existing upload-abuse ceiling. It is not an AI budget and permits the first twenty files.
  IF (SELECT count(*) FROM public.actor_document a JOIN public.ref_document d ON d.id=a.document_id
      WHERE a.actor_id=v_actor AND a.created_at>=CURRENT_DATE AND d.extra->>'source'='portal_photo')>=30 THEN
   RAISE EXCEPTION 'Limite quotidienne de dépôts atteinte' USING ERRCODE='PT429';
  END IF;
 END IF;
 IF p_replace_media_id IS NOT NULL AND NOT EXISTS(
   SELECT 1 FROM public.media m JOIN public.ref_code_media_type t ON t.id=m.media_type_id
   WHERE m.id=p_replace_media_id AND m.object_id=p_object_id AND m.place_id IS NULL
     AND t.code='photo' AND m.is_published AND COALESCE(m.visibility,'public')='public') THEN
  RAISE EXCEPTION 'La photo à remplacer a changé. Actualisez la galerie.' USING ERRCODE='PT409';
 END IF;
 IF p_replace_media_id IS NOT NULL AND EXISTS(SELECT 1 FROM internal.gallery_photo_reservations(p_object_id) r
     WHERE r.replace_media_id=p_replace_media_id AND r.document_id<>p_upload_id) THEN
  RAISE EXCEPTION 'Un remplacement de cette photo est déjà en cours.' USING ERRCODE='PT409';
 END IF;
 v_path:='portal-photos/'||v_actor::text||'/'||p_upload_id::text||'.jpg';
 IF v_doc.id IS NULL THEN
  INSERT INTO public.ref_document(id,url,title,storage_bucket,storage_path,access_scope,extra)
   VALUES(p_upload_id,'storage://actor-documents/'||v_path,'Photo','actor-documents',v_path,'crm_private',
    jsonb_build_object('source','portal_photo','object_id',p_object_id,'rights_confirmed',true,
      'rights_confirmed_at',now(),'slot_contract','photo-stock-v1','slot_state','reserved',
      'slot_replace_media_id',p_replace_media_id,'slot_first_reserved_at',now(),'slot_reserved_at',now(),'slot_reserved_until',now()+interval '24 hours'));
  INSERT INTO public.actor_document(actor_id,document_id,title,created_by) VALUES(v_actor,p_upload_id,'Photo',auth.uid());
 ELSE
  PERFORM internal.gallery_arm_photo_reservation(p_object_id,p_upload_id,p_replace_media_id);
 END IF;
 PERFORM internal.gallery_assert_photo_capacity(p_object_id,v_before,v_published);
 SELECT * INTO v_doc FROM public.ref_document WHERE id=p_upload_id;
 RETURN jsonb_build_object('id',v_doc.id,'actorId',v_actor,'path',v_doc.storage_path,
   'ready',v_doc.extra->>'upload_complete'='true','title',v_doc.title,'width',v_doc.extra->'width',
   'height',v_doc.extra->'height','sha256',v_doc.extra->>'upload_sha256');
END;
$function$;
CREATE OR REPLACE FUNCTION api.complete_portal_photo_upload(
 p_user_id uuid,p_document_id uuid,p_sha256 text,p_title text,p_width integer,p_height integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,api,internal,auth,pg_temp AS $function$
DECLARE v_object text;v_doc public.ref_document%ROWTYPE;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' OR p_user_id IS NULL OR p_sha256 IS NULL OR p_title IS NULL
   OR p_width IS NULL OR p_height IS NULL OR p_sha256!~'^[0-9a-f]{64}$' OR p_width<1 OR p_height<1 OR length(p_title)>180 THEN
  RAISE EXCEPTION 'Dépôt invalide' USING ERRCODE='42501';
 END IF;
 SELECT extra->>'object_id' INTO v_object FROM public.ref_document WHERE id=p_document_id;
 IF v_object IS NULL THEN RAISE EXCEPTION 'Dépôt inaccessible' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.object WHERE id=v_object FOR UPDATE;
 SELECT * INTO v_doc FROM public.ref_document WHERE id=p_document_id FOR UPDATE;
 IF v_doc.extra->>'source' IS DISTINCT FROM 'portal_photo' OR v_doc.access_scope IS DISTINCT FROM 'crm_private'
  OR v_doc.extra->>'published_media_id' IS NOT NULL OR v_doc.extra->>'slot_state'='cancelled'
  OR NOT EXISTS(SELECT 1 FROM public.actor_document a WHERE a.document_id=p_document_id AND a.created_by=p_user_id) THEN
  RAISE EXCEPTION 'Dépôt inaccessible' USING ERRCODE='42501';
 END IF;
 -- Recheck the registered account/link/realm and module mask at finalization.
 -- A service key is trusted transport, never a substitute for the partner's rights.
 IF NOT EXISTS(SELECT 1 FROM public.app_user_profile u JOIN public.actor a ON a.id=u.actor_id
    JOIN public.actor_object_role aor ON aor.actor_id=a.id JOIN public.object o ON o.id=aor.object_id
    WHERE u.id=p_user_id AND u.role='actor' AND o.id=v_object AND o.object_type<>'ORG'
      AND a.is_test=o.is_test AND (aor.valid_from IS NULL OR aor.valid_from<=CURRENT_DATE)
      AND (aor.valid_to IS NULL OR aor.valid_to>=CURRENT_DATE))
   OR 'media'=ANY(api.actor_portal_floor_modules())
   OR EXISTS(SELECT 1 FROM public.org_actor_module_visibility v JOIN public.object o ON o.id=v_object
     WHERE v.object_type=o.object_type::text AND v.module_id='media' AND NOT v.is_visible
      AND v.org_object_id=(SELECT l.org_object_id FROM public.object_org_link l JOIN public.ref_org_role r ON r.id=l.role_id
        WHERE l.object_id=v_object AND r.code='publisher' ORDER BY l.is_primary DESC NULLS LAST,l.org_object_id LIMIT 1)) THEN
  RAISE EXCEPTION 'La fiche n’est plus disponible dans votre espace.' USING ERRCODE='42501';
 END IF;
 IF v_doc.extra->>'upload_complete'='true' AND v_doc.extra->>'upload_sha256' IS DISTINCT FROM p_sha256 THEN
  RAISE EXCEPTION 'Identifiant de dépôt réutilisé avec un autre fichier' USING ERRCODE='PT409';
 END IF;
 UPDATE public.ref_document SET title=p_title,extra=extra||jsonb_build_object(
   'upload_complete',true,'upload_sha256',p_sha256,'slot_state','uploaded','width',p_width,'height',p_height)
  WHERE id=p_document_id;
 UPDATE public.actor_document SET title=p_title WHERE document_id=p_document_id AND created_by=p_user_id;
 RETURN jsonb_build_object('id',p_document_id,'title',p_title,'width',p_width,'height',p_height);
END;
$function$;
CREATE OR REPLACE FUNCTION api.cancel_portal_photo_upload(p_object_id text,p_document_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,api,internal,auth,pg_temp AS $function$
DECLARE v_doc public.ref_document%ROWTYPE;
BEGIN
 PERFORM internal.portal_photo_assert_actor(p_object_id);
 PERFORM 1 FROM public.object WHERE id=p_object_id FOR UPDATE;
 SELECT * INTO v_doc FROM public.ref_document WHERE id=p_document_id FOR UPDATE;
 -- Cancelling a queued file which never reached reservation is an idempotent no-op.
 IF v_doc.id IS NULL THEN RETURN jsonb_build_object('cancelled',true,'canRemovePrivate',false); END IF;
 IF v_doc.extra->>'source' IS DISTINCT FROM 'portal_photo'
  OR v_doc.extra->>'object_id' IS DISTINCT FROM p_object_id OR NOT EXISTS(
    SELECT 1 FROM public.actor_document a WHERE a.document_id=p_document_id AND a.created_by=auth.uid()) THEN
  RAISE EXCEPTION 'Dépôt inaccessible' USING ERRCODE='42501';
 END IF;
 IF v_doc.extra->>'published_media_id' IS NOT NULL OR EXISTS(
   SELECT 1 FROM public.pending_change pc WHERE pc.object_id=p_object_id AND pc.status='pending'
     AND pc.metadata->>'rpc'='publish_portal_photo_additions' AND EXISTS(
       SELECT 1 FROM jsonb_array_elements(COALESCE(pc.payload->'additions','[]')) a WHERE a->>'upload_id'=p_document_id::text)) THEN
  RETURN jsonb_build_object('cancelled',false);
 END IF;
 UPDATE public.ref_document SET extra=extra||'{"slot_state":"cancelled"}'::jsonb WHERE id=p_document_id;
 RETURN jsonb_build_object('cancelled',true,'canRemovePrivate',v_doc.extra->>'upload_complete' IS DISTINCT FROM 'true',
   'path',v_doc.storage_path);
END;
$function$;
REVOKE ALL ON FUNCTION internal.gallery_published_photo_count(text),internal.gallery_photo_reservations(text),
 internal.gallery_photo_usage(text),internal.gallery_assert_photo_capacity(text,integer,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION internal.gallery_arm_photo_reservation(text,uuid,uuid),internal.gallery_bind_photo_proposal() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION api.reserve_portal_photo_upload(text,uuid,uuid),
 api.complete_portal_photo_upload(uuid,uuid,text,text,integer,integer),api.cancel_portal_photo_upload(text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION api.complete_portal_photo_upload(uuid,uuid,text,text,integer,integer) TO service_role;
CREATE OR REPLACE FUNCTION api.save_object_gallery(p_object_id text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,api,internal,auth,pg_temp AS $function$
DECLARE v_row jsonb;v_changes jsonb;v_expected jsonb;v_id uuid;v_seen uuid[]:=ARRAY[]::uuid[];
 v_current public.media%ROWTYPE;v_next public.media%ROWTYPE;v_json jsonb;v_key text;
 v_before integer;v_published integer;v_rows jsonb;v_request_id uuid;v_receipt internal.gallery_write_receipt%ROWTYPE;v_main public.media%ROWTYPE;
 v_allowed text[]:=ARRAY['media_type_id','title','title_i18n','description','description_i18n','credit','url',
   'is_main','is_published','position','rights_expires_at','visibility','width','height','kind'];
BEGIN
 IF auth.uid() IS NULL OR api.is_actor_persona() OR NOT COALESCE(api.user_can_write_object_canonical(p_object_id),false) THEN
  RAISE EXCEPTION 'Droits de gestion de galerie insuffisants' USING ERRCODE='42501';
 END IF;
 IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR p_payload->>'write_contract' IS DISTINCT FROM 'gallery-patch-v1'
   OR jsonb_typeof(p_payload->'rows') IS DISTINCT FROM 'array' OR jsonb_typeof(p_payload->'deleted') IS DISTINCT FROM 'array'
   OR COALESCE(p_payload->>'request_id','')!~*'^[0-9a-f-]{36}$'
   OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_payload) k WHERE k NOT IN ('write_contract','request_id','rows','deleted')) THEN
  RAISE EXCEPTION 'Rechargez la galerie avant de l’enregistrer.' USING ERRCODE='22023';
 END IF;
 PERFORM 1 FROM public.object WHERE id=p_object_id AND is_test=(SELECT api.current_user_test_realm()) FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Fiche introuvable dans cet espace' USING ERRCODE='42501'; END IF;
 v_request_id:=(p_payload->>'request_id')::uuid;
 SELECT * INTO v_receipt FROM internal.gallery_write_receipt
  WHERE object_id=p_object_id AND user_id=auth.uid() AND request_id=v_request_id;
 IF FOUND THEN
  IF v_receipt.request IS DISTINCT FROM p_payload THEN
   RAISE EXCEPTION 'Identifiant de requête réutilisé avec une autre modification' USING ERRCODE='22023';
  END IF;
  -- Return CURRENT state: a delayed retry must not undo a later withdrawal/edit.
  SELECT COALESCE(jsonb_agg(to_jsonb(m) ORDER BY m.position,m.created_at,m.id),'[]') INTO v_rows
   FROM public.media m WHERE m.object_id=p_object_id AND m.place_id IS NULL;
  RETURN jsonb_build_object('success',true,'snapshot',v_rows,'replayed',true);
 END IF;
 v_before:=internal.gallery_photo_usage(p_object_id);
 v_published:=internal.gallery_published_photo_count(p_object_id);
 FOR v_row IN SELECT value FROM jsonb_array_elements(p_payload->'rows') LOOP
  IF jsonb_typeof(v_row) IS DISTINCT FROM 'object' OR COALESCE(v_row->>'id','')!~*'^[0-9a-f-]{36}$'
    OR jsonb_typeof(v_row->'changes') IS DISTINCT FROM 'object'
    OR NOT (v_row ? 'expected') OR EXISTS(SELECT 1 FROM jsonb_object_keys(v_row) k WHERE k NOT IN ('id','expected','changes')) THEN
   RAISE EXCEPTION 'Modification de média invalide' USING ERRCODE='22023';
  END IF;
  v_id:=(v_row->>'id')::uuid;
  IF v_id=ANY(v_seen) THEN RAISE EXCEPTION 'Média répété' USING ERRCODE='22023'; END IF;
  v_seen:=array_append(v_seen,v_id);v_changes:=v_row->'changes';v_expected:=v_row->'expected';
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(v_changes) k WHERE NOT (k=ANY(v_allowed))) THEN
   RAISE EXCEPTION 'Champ média non autorisé' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_current FROM public.media WHERE id=v_id FOR UPDATE;
  IF FOUND THEN
   IF v_current.object_id IS DISTINCT FROM p_object_id OR v_current.place_id IS NOT NULL THEN
    RAISE EXCEPTION 'Média hors de la galerie' USING ERRCODE='42501';
   END IF;
   v_json:=to_jsonb(v_current);
   -- A lost acknowledgement may be retried, without touching another field changed meanwhile.
   IF NOT EXISTS(SELECT 1 FROM jsonb_each(v_changes) x WHERE v_json->x.key IS DISTINCT FROM x.value) THEN CONTINUE; END IF;
   IF v_changes ? 'url' AND v_changes->'url' IS DISTINCT FROM v_json->'url'
      AND (jsonb_typeof(v_changes->'url') IS DISTINCT FROM 'string' OR COALESCE(v_changes->>'url','')!~*'^https?://[^[:space:]/?#]+([/?#][^[:space:]]*)?$') THEN
    RAISE EXCEPTION 'Saisissez une URL HTTP ou HTTPS absolue.' USING ERRCODE='22023';
   END IF;
   IF jsonb_typeof(v_expected) IS DISTINCT FROM 'object' OR v_expected->>'id' IS DISTINCT FROM v_id::text
     OR EXISTS(SELECT 1 FROM jsonb_object_keys(v_changes) k WHERE NOT (v_expected ? k))
     OR EXISTS(SELECT 1 FROM jsonb_each(v_expected) x WHERE v_json->x.key IS DISTINCT FROM x.value) THEN
    RAISE EXCEPTION 'La galerie a changé. Rechargez-la avant de réessayer.' USING ERRCODE='PT409';
   END IF;
   v_next:=jsonb_populate_record(v_current,v_changes);
   IF v_next.is_main AND (NOT v_current.is_main OR v_current.media_type_id IS DISTINCT FROM v_next.media_type_id) THEN
    FOR v_main IN SELECT * FROM public.media WHERE object_id=p_object_id AND place_id IS NULL
       AND media_type_id=v_next.media_type_id AND is_main AND id<>v_id LOOP
     IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->'rows') x
        WHERE x->>'id'=v_main.id::text AND x->'changes'->'is_main'='false'::jsonb
        AND jsonb_typeof(x->'expected')='object' AND x->'expected'->>'id'=v_main.id::text
        AND NOT EXISTS(SELECT 1 FROM jsonb_each(x->'expected') e WHERE to_jsonb(v_main)->e.key IS DISTINCT FROM e.value)) THEN
      RAISE EXCEPTION 'Le média principal a changé. Rechargez la galerie.' USING ERRCODE='PT409';
     END IF;
    END LOOP;
   END IF;
   UPDATE public.media SET media_type_id=v_next.media_type_id,title=v_next.title,title_i18n=v_next.title_i18n,
    description=v_next.description,description_i18n=v_next.description_i18n,credit=v_next.credit,url=v_next.url,
    is_main=v_next.is_main,is_published=v_next.is_published,position=v_next.position,rights_expires_at=v_next.rights_expires_at,
    visibility=v_next.visibility,width=v_next.width,height=v_next.height,kind=v_next.kind WHERE id=v_id;
  ELSE
   IF jsonb_typeof(v_expected) IS DISTINCT FROM 'null' OR NOT (v_changes ?& ARRAY['media_type_id','url']) THEN
    RAISE EXCEPTION 'Le média a changé. Rechargez la galerie.' USING ERRCODE='PT409';
   END IF;
   IF jsonb_typeof(v_changes->'url') IS DISTINCT FROM 'string' OR COALESCE(v_changes->>'url','')!~*'^https?://[^[:space:]/?#]+([/?#][^[:space:]]*)?$' THEN
    RAISE EXCEPTION 'Saisissez une URL HTTP ou HTTPS absolue.' USING ERRCODE='22023';
   END IF;
   v_next:=jsonb_populate_record(NULL::public.media,v_changes);
   IF v_next.is_main AND EXISTS(SELECT 1 FROM public.media m WHERE m.object_id=p_object_id AND m.place_id IS NULL
       AND m.media_type_id=v_next.media_type_id AND m.is_main AND NOT EXISTS(
        SELECT 1 FROM jsonb_array_elements(p_payload->'rows') x WHERE x->>'id'=m.id::text
         AND x->'changes'->'is_main'='false'::jsonb AND jsonb_typeof(x->'expected')='object'
         AND x->'expected'->>'id'=m.id::text AND NOT EXISTS(
          SELECT 1 FROM jsonb_each(x->'expected') e WHERE to_jsonb(m)->e.key IS DISTINCT FROM e.value))) THEN
    RAISE EXCEPTION 'Le média principal a changé. Rechargez la galerie.' USING ERRCODE='PT409';
   END IF;
   INSERT INTO public.media(id,object_id,media_type_id,title,title_i18n,description,description_i18n,credit,url,
      is_main,is_published,position,rights_expires_at,visibility,width,height,kind)
    VALUES(v_id,p_object_id,v_next.media_type_id,v_next.title,v_next.title_i18n,v_next.description,v_next.description_i18n,
      v_next.credit,v_next.url,COALESCE(v_next.is_main,false),COALESCE(v_next.is_published,true),COALESCE(v_next.position,0),
      v_next.rights_expires_at,v_next.visibility,v_next.width,v_next.height,v_next.kind);
  END IF;
 END LOOP;
 FOR v_row IN SELECT value FROM jsonb_array_elements(p_payload->'deleted') LOOP
  IF jsonb_typeof(v_row) IS DISTINCT FROM 'object' OR COALESCE(v_row->>'id','')!~*'^[0-9a-f-]{36}$'
    OR jsonb_typeof(v_row->'expected') IS DISTINCT FROM 'object'
    OR NOT (v_row->'expected' ?& ARRAY['id','updated_at'])
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(v_row) k WHERE k NOT IN ('id','expected')) THEN
   RAISE EXCEPTION 'Suppression de média invalide' USING ERRCODE='22023';
  END IF;
  v_id:=(v_row->>'id')::uuid;
  IF v_id=ANY(v_seen) THEN RAISE EXCEPTION 'Média modifié et supprimé' USING ERRCODE='22023'; END IF;
  v_seen:=array_append(v_seen,v_id);
  SELECT * INTO v_current FROM public.media WHERE id=v_id FOR UPDATE;
  IF NOT FOUND THEN CONTINUE; END IF;
  IF v_current.object_id IS DISTINCT FROM p_object_id OR v_current.place_id IS NOT NULL THEN
   RAISE EXCEPTION 'Média hors de la galerie' USING ERRCODE='42501';
  END IF;
  v_json:=to_jsonb(v_current);
  IF v_row->'expected'->>'id' IS DISTINCT FROM v_id::text OR EXISTS(
     SELECT 1 FROM jsonb_each(v_row->'expected') x WHERE v_json->x.key IS DISTINCT FROM x.value) THEN
   RAISE EXCEPTION 'La galerie a changé. Rechargez-la avant de retirer le média.' USING ERRCODE='PT409';
  END IF;
  DELETE FROM public.media WHERE id=v_id;
 END LOOP;
 PERFORM internal.gallery_assert_photo_capacity(p_object_id,v_before,v_published);
 SELECT COALESCE(jsonb_agg(to_jsonb(m) ORDER BY m.position,m.created_at,m.id),'[]') INTO v_rows
  FROM public.media m WHERE m.object_id=p_object_id AND m.place_id IS NULL;
 INSERT INTO internal.gallery_write_receipt(object_id,user_id,request_id,request)
  VALUES(p_object_id,auth.uid(),v_request_id,p_payload);
 RETURN jsonb_build_object('success',true,'snapshot',v_rows,'replayed',false);
END;
$function$;
REVOKE ALL ON FUNCTION api.save_object_gallery(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION api.save_object_gallery(text,jsonb) TO authenticated;
CREATE OR REPLACE FUNCTION api.get_gallery_write_receipt(p_object_id text,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,api,internal,auth,pg_temp AS $function$
DECLARE v_rows jsonb;
BEGIN
 IF auth.uid() IS NULL OR api.is_actor_persona() OR NOT COALESCE(api.user_can_write_object_canonical(p_object_id),false)
   OR NOT EXISTS(SELECT 1 FROM public.object WHERE id=p_object_id AND is_test=(SELECT api.current_user_test_realm())) THEN
  RAISE EXCEPTION 'Droits de gestion de galerie insuffisants' USING ERRCODE='42501';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM internal.gallery_write_receipt WHERE object_id=p_object_id AND user_id=auth.uid() AND request_id=p_request_id) THEN RETURN NULL; END IF;
 SELECT COALESCE(jsonb_agg(to_jsonb(m) ORDER BY m.position,m.created_at,m.id),'[]') INTO v_rows
  FROM public.media m WHERE m.object_id=p_object_id AND m.place_id IS NULL;
 RETURN jsonb_build_object('success',true,'snapshot',v_rows,'replayed',true);
END;
$function$;
REVOKE ALL ON FUNCTION api.get_gallery_write_receipt(text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION api.get_gallery_write_receipt(text,uuid) TO authenticated;
DO $validate_portal_photo_additions_stock$
DECLARE v_function regprocedure:='internal.validate_portal_photo_additions(text,jsonb,uuid)'::regprocedure;v_md5 text;v_definition text;v_meta jsonb;v_before text;v_after text;
BEGIN
 SELECT md5(replace(p.prosrc,E'\r\n',E'\n')),pg_get_functiondef(p.oid),jsonb_build_object('owner',p.proowner,'acl',to_jsonb(p.proacl),'config',to_jsonb(p.proconfig),'definer',p.prosecdef,'strict',p.proisstrict,'volatility',p.provolatile,'parallel',p.proparallel,'returns',p.prorettype,'set',p.proretset,'args',p.proargtypes::text)
 INTO v_md5,v_definition,v_meta FROM pg_proc p WHERE p.oid=v_function;
 IF v_md5='f2141450982dafb04be58f5967913aca' THEN RETURN; END IF;
 IF v_md5 IS DISTINCT FROM 'b30da0642a74f33f2625eb7d38d3a239' THEN RAISE EXCEPTION 'R5: unreviewed internal.validate_portal_photo_additions source %',v_md5; END IF;
 v_definition:=replace(v_definition,E'\r\n',E'\n');
 v_before:=$r5_before_1$v_replace uuid;$r5_before_1$;
 v_after:=$r5_after_1$v_replace uuid; v_previous_usage integer; v_previous_published integer;$r5_after_1$;
 IF (length(v_definition)-length(replace(v_definition,v_before,'')))/length(v_before)<>1 THEN RAISE EXCEPTION 'R5: internal.validate_portal_photo_additions anchor 1 differs'; END IF;
 v_definition:=replace(v_definition,v_before,v_after);
 v_before:=$r5_before_2$  FOR v_item IN SELECT value FROM jsonb_array_elements(p_payload->'additions') LOOP$r5_before_2$;
 v_after:=$r5_after_2$  -- Submission/approval callers already hold any submission/proposal locks.
  -- Upload and office paths never acquire a proposal after this object lock.
  PERFORM 1 FROM public.object WHERE id=p_object_id FOR UPDATE;
  v_previous_usage:=internal.gallery_photo_usage(p_object_id);
  v_previous_published:=internal.gallery_published_photo_count(p_object_id);
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_payload->'additions') LOOP$r5_after_2$;
 IF (length(v_definition)-length(replace(v_definition,v_before,'')))/length(v_before)<>1 THEN RAISE EXCEPTION 'R5: internal.validate_portal_photo_additions anchor 2 differs'; END IF;
 v_definition:=replace(v_definition,v_before,v_after);
 v_before:=$r5_before_3$AND d.storage_bucket='actor-documents' AND d.storage_path LIKE 'portal-photos/'||a.actor_id::text||'/%';$r5_before_3$;
 v_after:=$r5_after_3$AND (d.extra->>'slot_contract' IS DISTINCT FROM 'photo-stock-v1' OR d.extra->>'upload_complete'='true')
        AND d.storage_bucket='actor-documents' AND d.storage_path LIKE 'portal-photos/'||a.actor_id::text||'/%' FOR UPDATE OF d;$r5_after_3$;
 IF (length(v_definition)-length(replace(v_definition,v_before,'')))/length(v_before)<>1 THEN RAISE EXCEPTION 'R5: internal.validate_portal_photo_additions anchor 3 differs'; END IF;
 v_definition:=replace(v_definition,v_before,v_after);
 v_before:=$r5_before_4$    v_replace:=NULLIF(v_item->>'replace_media_id','')::uuid;$r5_before_4$;
 v_after:=$r5_after_4$    v_replace:=NULLIF(v_item->>'replace_media_id','')::uuid;
    IF EXISTS(SELECT 1 FROM public.ref_document d WHERE d.id=v_id AND (d.extra->>'slot_state'='cancelled'
      OR (d.extra ? 'slot_replace_media_id' AND d.extra->>'slot_replace_media_id' IS DISTINCT FROM v_replace::text))) THEN
      RAISE EXCEPTION 'La réservation de remplacement a changé.' USING ERRCODE='PT409';
    END IF;
    IF v_replace IS NOT NULL AND EXISTS(SELECT 1 FROM internal.gallery_photo_reservations(p_object_id) r
      WHERE r.replace_media_id=v_replace AND r.document_id<>v_id) THEN
      RAISE EXCEPTION 'Un remplacement de cette photo est déjà en cours.' USING ERRCODE='PT409';
    END IF;$r5_after_4$;
 IF (length(v_definition)-length(replace(v_definition,v_before,'')))/length(v_before)<>1 THEN RAISE EXCEPTION 'R5: internal.validate_portal_photo_additions anchor 4 differs'; END IF;
 v_definition:=replace(v_definition,v_before,v_after);
 v_before:=$r5_before_5$    END IF;
  END LOOP;
END $r5_before_5$;
 v_after:=$r5_after_5$    END IF;
    -- Rearm a resolved receipt under the same object lock; the first reservation
    -- deadline never moves. The AFTER INSERT trigger binds the actual proposal.
    PERFORM internal.gallery_arm_photo_reservation(p_object_id,v_id,v_replace);
  END LOOP;
  PERFORM internal.gallery_assert_photo_capacity(p_object_id,v_previous_usage,v_previous_published);
END $r5_after_5$;
 IF (length(v_definition)-length(replace(v_definition,v_before,'')))/length(v_before)<>1 THEN RAISE EXCEPTION 'R5: internal.validate_portal_photo_additions anchor 5 differs'; END IF;
 v_definition:=replace(v_definition,v_before,v_after);
 EXECUTE v_definition;
 IF (SELECT md5(replace(prosrc,E'\r\n',E'\n')) FROM pg_proc WHERE oid=v_function) IS DISTINCT FROM 'f2141450982dafb04be58f5967913aca' OR (SELECT jsonb_build_object('owner',p.proowner,'acl',to_jsonb(p.proacl),'config',to_jsonb(p.proconfig),'definer',p.prosecdef,'strict',p.proisstrict,'volatility',p.provolatile,'parallel',p.proparallel,'returns',p.prorettype,'set',p.proretset,'args',p.proargtypes::text) FROM pg_proc p WHERE p.oid=v_function) IS DISTINCT FROM v_meta THEN RAISE EXCEPTION 'R5: internal.validate_portal_photo_additions target or attributes differ'; END IF;
END;
$validate_portal_photo_additions_stock$;
DO $prepare_portal_photo_approval_stock$
DECLARE v_function regprocedure:='api.prepare_portal_photo_approval(uuid,boolean,uuid)'::regprocedure;v_md5 text;v_definition text;v_meta jsonb;v_before text;v_after text;
BEGIN
 SELECT md5(replace(p.prosrc,E'\r\n',E'\n')),pg_get_functiondef(p.oid),jsonb_build_object('owner',p.proowner,'acl',to_jsonb(p.proacl),'config',to_jsonb(p.proconfig),'definer',p.prosecdef,'strict',p.proisstrict,'volatility',p.provolatile,'parallel',p.proparallel,'returns',p.prorettype,'set',p.proretset,'args',p.proargtypes::text)
 INTO v_md5,v_definition,v_meta FROM pg_proc p WHERE p.oid=v_function;
 IF v_md5='34b7086ba27afbf3e3b4249c8204cadd' THEN RETURN; END IF;
 IF v_md5 IS DISTINCT FROM '34ac0036562489d2231c6e1e9fb79532' THEN RAISE EXCEPTION 'R5: unreviewed api.prepare_portal_photo_approval source %',v_md5; END IF;
 v_definition:=replace(v_definition,E'\r\n',E'\n');
 v_before:=$r5_before_1$DECLARE v_object text;$r5_before_1$;
 v_after:=$r5_after_1$DECLARE v_object text; v_submission uuid;$r5_after_1$;
 IF (length(v_definition)-length(replace(v_definition,v_before,'')))/length(v_before)<>1 THEN RAISE EXCEPTION 'R5: api.prepare_portal_photo_approval anchor 1 differs'; END IF;
 v_definition:=replace(v_definition,v_before,v_after);
 v_before:=$r5_before_2$  -- Only reserve proposal rows here, in the same order as bulk approval. Taking
  -- an object lock first would invert approve_pending_change's row-lock order.$r5_before_2$;
 v_after:=$r5_after_2$  -- Submission -> all selected proposal rows -> object -> receipts.
  -- Never take another proposal lock after the object, including a batch.
  IF p_batch THEN
    PERFORM 1 FROM public.fiche_submission WHERE id=p_id FOR UPDATE;
  ELSE
    SELECT submission_id INTO v_submission FROM public.pending_change WHERE id=p_id;
    IF v_submission IS NOT NULL THEN PERFORM 1 FROM public.fiche_submission WHERE id=v_submission FOR UPDATE; END IF;
  END IF;
  PERFORM 1 FROM public.pending_change WHERE object_id=v_object AND status='pending'
    AND ((p_batch AND submission_id=p_id) OR (NOT p_batch AND id=p_id))
    AND metadata->>'rpc'='publish_portal_photo_additions' AND submission_id IS NOT NULL ORDER BY submitted_at,id FOR UPDATE;
  PERFORM 1 FROM public.object WHERE id=v_object FOR UPDATE;$r5_after_2$;
 IF (length(v_definition)-length(replace(v_definition,v_before,'')))/length(v_before)<>1 THEN RAISE EXCEPTION 'R5: api.prepare_portal_photo_approval anchor 2 differs'; END IF;
 v_definition:=replace(v_definition,v_before,v_after);
 v_before:=$r5_before_3$AND metadata->>'rpc'='publish_portal_photo_additions' AND submission_id IS NOT NULL ORDER BY submitted_at,id FOR UPDATE LOOP$r5_before_3$;
 v_after:=$r5_after_3$AND metadata->>'rpc'='publish_portal_photo_additions' AND submission_id IS NOT NULL ORDER BY submitted_at,id LOOP$r5_after_3$;
 IF (length(v_definition)-length(replace(v_definition,v_before,'')))/length(v_before)<>1 THEN RAISE EXCEPTION 'R5: api.prepare_portal_photo_approval anchor 3 differs'; END IF;
 v_definition:=replace(v_definition,v_before,v_after);
 EXECUTE v_definition;
 IF (SELECT md5(replace(prosrc,E'\r\n',E'\n')) FROM pg_proc WHERE oid=v_function) IS DISTINCT FROM '34b7086ba27afbf3e3b4249c8204cadd' OR (SELECT jsonb_build_object('owner',p.proowner,'acl',to_jsonb(p.proacl),'config',to_jsonb(p.proconfig),'definer',p.prosecdef,'strict',p.proisstrict,'volatility',p.provolatile,'parallel',p.proparallel,'returns',p.prorettype,'set',p.proretset,'args',p.proargtypes::text) FROM pg_proc p WHERE p.oid=v_function) IS DISTINCT FROM v_meta THEN RAISE EXCEPTION 'R5: api.prepare_portal_photo_approval target or attributes differ'; END IF;
END;
$prepare_portal_photo_approval_stock$;
DO $publish_portal_photo_additions_stock$
DECLARE v_function regprocedure:='api.publish_portal_photo_additions(text,jsonb)'::regprocedure;v_md5 text;v_definition text;v_meta jsonb;v_before text;v_after text;
BEGIN
 SELECT md5(replace(p.prosrc,E'\r\n',E'\n')),pg_get_functiondef(p.oid),jsonb_build_object('owner',p.proowner,'acl',to_jsonb(p.proacl),'config',to_jsonb(p.proconfig),'definer',p.prosecdef,'strict',p.proisstrict,'volatility',p.provolatile,'parallel',p.proparallel,'returns',p.prorettype,'set',p.proretset,'args',p.proargtypes::text)
 INTO v_md5,v_definition,v_meta FROM pg_proc p WHERE p.oid=v_function;
 IF v_md5='6f678c3f978cb836d0521c1727fe2846' THEN RETURN; END IF;
 IF v_md5 IS DISTINCT FROM '7445fdf5da38ded3bcfedbf0b6c9e47e' THEN RAISE EXCEPTION 'R5: unreviewed api.publish_portal_photo_additions source %',v_md5; END IF;
 v_definition:=replace(v_definition,E'\r\n',E'\n');
 v_before:=$r5_before_1$v_type uuid; v_replace uuid; v_position integer; v_main boolean; v_new uuid;$r5_before_1$;
 v_after:=$r5_after_1$v_type uuid; v_replace uuid; v_position integer; v_main boolean; v_new uuid; v_previous_usage integer; v_previous_published integer;$r5_after_1$;
 IF (length(v_definition)-length(replace(v_definition,v_before,'')))/length(v_before)<>1 THEN RAISE EXCEPTION 'R5: api.publish_portal_photo_additions anchor 1 differs'; END IF;
 v_definition:=replace(v_definition,v_before,v_after);
 v_before:=$r5_before_2$  PERFORM 1 FROM public.object WHERE id=p_object_id FOR UPDATE;$r5_before_2$;
 v_after:=$r5_after_2$  PERFORM 1 FROM public.object WHERE id=p_object_id FOR UPDATE;
  v_previous_usage:=internal.gallery_photo_usage(p_object_id);
  v_previous_published:=internal.gallery_published_photo_count(p_object_id);$r5_after_2$;
 IF (length(v_definition)-length(replace(v_definition,v_before,'')))/length(v_before)<>1 THEN RAISE EXCEPTION 'R5: api.publish_portal_photo_additions anchor 2 differs'; END IF;
 v_definition:=replace(v_definition,v_before,v_after);
 v_before:=$r5_before_3$jsonb_build_object('published_media_id',v_new,'published_at',now())$r5_before_3$;
 v_after:=$r5_after_3$jsonb_build_object('published_media_id',v_new,'published_at',now(),'slot_state','consumed')$r5_after_3$;
 IF (length(v_definition)-length(replace(v_definition,v_before,'')))/length(v_before)<>1 THEN RAISE EXCEPTION 'R5: api.publish_portal_photo_additions anchor 3 differs'; END IF;
 v_definition:=replace(v_definition,v_before,v_after);
 v_before:=$r5_before_4$  RETURN internal.portal_photos_json(p_object_id);$r5_before_4$;
 v_after:=$r5_after_4$  PERFORM internal.gallery_assert_photo_capacity(p_object_id,v_previous_usage,v_previous_published);
  RETURN internal.portal_photos_json(p_object_id);$r5_after_4$;
 IF (length(v_definition)-length(replace(v_definition,v_before,'')))/length(v_before)<>1 THEN RAISE EXCEPTION 'R5: api.publish_portal_photo_additions anchor 4 differs'; END IF;
 v_definition:=replace(v_definition,v_before,v_after);
 EXECUTE v_definition;
 IF (SELECT md5(replace(prosrc,E'\r\n',E'\n')) FROM pg_proc WHERE oid=v_function) IS DISTINCT FROM '6f678c3f978cb836d0521c1727fe2846' OR (SELECT jsonb_build_object('owner',p.proowner,'acl',to_jsonb(p.proacl),'config',to_jsonb(p.proconfig),'definer',p.prosecdef,'strict',p.proisstrict,'volatility',p.provolatile,'parallel',p.proparallel,'returns',p.prorettype,'set',p.proretset,'args',p.proargtypes::text) FROM pg_proc p WHERE p.oid=v_function) IS DISTINCT FROM v_meta THEN RAISE EXCEPTION 'R5: api.publish_portal_photo_additions target or attributes differ'; END IF;
END;
$publish_portal_photo_additions_stock$;

-- supabase/migrations/20261103084816_partner_portal_photo_assessment_foundation_off.sql
SET LOCAL lock_timeout='500ms';
SET LOCAL statement_timeout='15s';
DO $dependencies$
BEGIN
 IF to_regprocedure('internal.portal_photo_assert_actor(text)') IS NULL
    OR to_regprocedure('api.can_read_object_for_correction(text)') IS NULL THEN
  RAISE EXCEPTION 'Install R5 photo rights and R3b correction reads before P';
 END IF;
END;
$dependencies$;
CREATE TABLE internal.portal_photo_analysis_settings(
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), enabled boolean NOT NULL DEFAULT false,
 daily_analysis_limit integer CHECK(daily_analysis_limit>0),
 provider_id uuid REFERENCES public.app_ai_provider_config(id),
 CHECK(NOT enabled OR (daily_analysis_limit IS NOT NULL AND provider_id IS NOT NULL))
);
INSERT INTO internal.portal_photo_analysis_settings(singleton,enabled) VALUES(true,false);
CREATE TABLE internal.portal_photo_analysis(
 id uuid PRIMARY KEY, object_id text NOT NULL REFERENCES public.object(id) ON DELETE CASCADE,
 document_id uuid NOT NULL REFERENCES public.ref_document(id) ON DELETE CASCADE,
 actor_id uuid NOT NULL REFERENCES public.actor(id) ON DELETE CASCADE,
 created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 source_sha256 text NOT NULL CHECK(source_sha256 ~ '^[0-9a-f]{64}$'),
 contract_version text NOT NULL DEFAULT 'photo-quality-v1' CHECK(contract_version='photo-quality-v1'),
 local_day date NOT NULL, provider_id uuid REFERENCES public.app_ai_provider_config(id) ON DELETE SET NULL,
 provider_revision timestamptz NOT NULL,
 state text NOT NULL DEFAULT 'reserved' CHECK(state IN('reserved','started','assessed','unavailable','uncertain')),
 claim_id uuid, started_at timestamptz, finished_at timestamptz, outcome jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 appeal_interaction_id uuid REFERENCES public.crm_interaction(id) ON DELETE SET NULL,
 appeal_client_id uuid UNIQUE,
 appeal_intent_hash text CHECK(appeal_intent_hash IS NULL OR appeal_intent_hash ~ '^[0-9a-f]{64}$'),
 CHECK((state IN('assessed','unavailable','uncertain'))=(outcome IS NOT NULL))
);
CREATE INDEX portal_photo_analysis_actor_day ON internal.portal_photo_analysis(actor_id,local_day,state);
CREATE INDEX portal_photo_analysis_object ON internal.portal_photo_analysis(object_id);
CREATE INDEX portal_photo_analysis_document ON internal.portal_photo_analysis(document_id);
CREATE INDEX portal_photo_analysis_creator ON internal.portal_photo_analysis(created_by);
CREATE INDEX portal_photo_analysis_provider ON internal.portal_photo_analysis(provider_id);
CREATE INDEX portal_photo_analysis_appeal ON internal.portal_photo_analysis(appeal_interaction_id);
CREATE UNIQUE INDEX portal_photo_analysis_one_attempt ON internal.portal_photo_analysis(created_by,document_id,source_sha256,contract_version)
 WHERE state IN('reserved','started','assessed','uncertain');
ALTER TABLE internal.portal_photo_analysis_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal.portal_photo_analysis ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON internal.portal_photo_analysis_settings,internal.portal_photo_analysis FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION internal.photo_analysis_local_day(p_at timestamptz) RETURNS date
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog AS $fn$
 SELECT (p_at AT TIME ZONE 'Indian/Reunion')::date;
$fn$;
CREATE FUNCTION internal.photo_analysis_reset_at(p_day date) RETURNS timestamptz
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog AS $fn$
 SELECT (p_day+1)::timestamp AT TIME ZONE 'Indian/Reunion';
$fn$;
CREATE FUNCTION internal.photo_analysis_assert_owner(p_object_id text,p_document_id uuid)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,api,internal,auth,pg_temp AS $fn$
DECLARE v_actor uuid;
BEGIN
 v_actor:=internal.portal_photo_assert_actor(p_object_id);
 IF NOT EXISTS(SELECT 1 FROM public.ref_document d JOIN public.actor_document a ON a.document_id=d.id
  WHERE d.id=p_document_id AND a.actor_id=v_actor AND a.created_by=auth.uid()
    AND d.extra->>'source'='portal_photo' AND d.extra->>'object_id'=p_object_id
    AND d.access_scope='crm_private' AND d.storage_bucket='actor-documents'
    AND d.storage_path='portal-photos/'||v_actor::text||'/'||p_document_id::text||'.jpg') THEN
  RAISE EXCEPTION 'Photo inaccessible' USING ERRCODE='42501';
 END IF;
 RETURN v_actor;
END;
$fn$;
CREATE FUNCTION internal.photo_analysis_json(p_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,internal AS $fn$
 SELECT jsonb_build_object('requestId',a.id,'objectId',a.object_id,'documentId',a.document_id,
  'state',CASE WHEN a.state='started' AND a.started_at<now()-interval '60 seconds' THEN 'uncertain' ELSE a.state END,
  'assessment',a.outcome->'assessment','publication','office_review','providerAttempted',a.started_at IS NOT NULL,
  'sourceCurrent',EXISTS(SELECT 1 FROM public.ref_document d WHERE d.id=a.document_id AND d.extra->>'upload_sha256'=a.source_sha256),
  'createdAt',a.created_at,'resetAt',internal.photo_analysis_reset_at(a.local_day),'appealInteractionId',a.appeal_interaction_id,
  'appealStatus',(SELECT c.status FROM public.crm_interaction c WHERE c.id=a.appeal_interaction_id))
 FROM internal.portal_photo_analysis a WHERE a.id=p_id;
$fn$;
CREATE FUNCTION internal.photo_analysis_envelope(p_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public,internal AS $fn$
 SELECT jsonb_build_object('operation',internal.photo_analysis_json(a.id))
  ||CASE WHEN a.state='reserved' THEN jsonb_build_object('context',jsonb_build_object(
   'bucket',d.storage_bucket,'path',d.storage_path,'sha256',a.source_sha256,'providerId',a.provider_id)) ELSE '{}'::jsonb END
 FROM internal.portal_photo_analysis a JOIN public.ref_document d ON d.id=a.document_id WHERE a.id=p_id;
$fn$;
CREATE FUNCTION internal.photo_assessment_valid(p_value jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog AS $fn$
DECLARE v jsonb;
BEGIN
 IF jsonb_typeof(p_value) IS DISTINCT FROM 'object' OR length(p_value::text)>16384
  OR NOT(p_value ?& ARRAY['score','summary','strengths','issues'])
  OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_value) k WHERE k NOT IN('score','summary','strengths','issues'))
  OR jsonb_typeof(p_value->'score') IS DISTINCT FROM 'number'
  OR jsonb_typeof(p_value->'summary') IS DISTINCT FROM 'string'
  OR jsonb_typeof(p_value->'strengths') IS DISTINCT FROM 'array'
  OR jsonb_typeof(p_value->'issues') IS DISTINCT FROM 'array' THEN RETURN false; END IF;
 IF (p_value->>'score')::numeric NOT BETWEEN 0 AND 10 OR length(btrim(p_value->>'summary')) NOT BETWEEN 1 AND 500
   OR jsonb_array_length(p_value->'strengths')>5 OR jsonb_array_length(p_value->'issues')>8 THEN RETURN false; END IF;
 FOR v IN SELECT value FROM jsonb_array_elements(p_value->'strengths') LOOP
  IF jsonb_typeof(v) IS DISTINCT FROM 'string' OR length(btrim(v#>>'{}')) NOT BETWEEN 1 AND 500 THEN RETURN false; END IF;
 END LOOP;
 FOR v IN SELECT value FROM jsonb_array_elements(p_value->'issues') LOOP
  IF jsonb_typeof(v) IS DISTINCT FROM 'object' OR NOT(v ?& ARRAY['code','explanation','suggestion'])
   OR EXISTS(SELECT 1 FROM jsonb_object_keys(v) k WHERE k NOT IN('code','explanation','suggestion'))
   OR v->>'code' NOT IN('blur','exposure','resolution','framing','obstruction','text_overlay','subject_unclear','other_quality')
   OR jsonb_typeof(v->'code') IS DISTINCT FROM 'string' OR jsonb_typeof(v->'explanation') IS DISTINCT FROM 'string'
   OR jsonb_typeof(v->'suggestion') IS DISTINCT FROM 'string' THEN RETURN false; END IF;
  IF length(btrim(v->>'explanation')) NOT BETWEEN 1 AND 500 OR length(btrim(v->>'suggestion')) NOT BETWEEN 1 AND 500 THEN RETURN false; END IF;
 END LOOP;
 RETURN true;
END;
$fn$;
CREATE FUNCTION api.reserve_portal_photo_analysis(p_object_id text,p_document_id uuid,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,api,internal,auth,pg_temp SET lock_timeout='5s' AS $fn$
DECLARE v_actor uuid;v_doc public.ref_document%ROWTYPE;v_op internal.portal_photo_analysis%ROWTYPE;
 v_settings internal.portal_photo_analysis_settings%ROWTYPE;v_provider public.app_ai_provider_config%ROWTYPE;
 v_day date:=internal.photo_analysis_local_day(now());v_used integer;
BEGIN
 IF p_request_id IS NULL THEN RAISE EXCEPTION 'Identifiant requis' USING ERRCODE='22023'; END IF;
 v_actor:=internal.photo_analysis_assert_owner(p_object_id,p_document_id);
 SELECT * INTO v_settings FROM internal.portal_photo_analysis_settings WHERE singleton;
 SELECT * INTO v_provider FROM public.app_ai_provider_config WHERE id=v_settings.provider_id AND is_active AND api_kind='openai_compatible';
 IF NOT COALESCE(v_settings.enabled,false) OR v_settings.daily_analysis_limit IS NULL OR v_provider.id IS NULL THEN
  RETURN jsonb_build_object('created',false,'enabled',false,'state','unavailable','assessment',NULL,'publication','office_review');
 END IF;
 -- This domain's actor/day lock is separate from menu extraction and photo stock.
 PERFORM pg_advisory_xact_lock(hashtextextended('portal-photo-analysis:'||v_actor::text,0));
 PERFORM 1 FROM public.object WHERE id=p_object_id FOR UPDATE;
 SELECT * INTO v_doc FROM public.ref_document WHERE id=p_document_id FOR UPDATE;
 -- Permissions may have changed while waiting for the actor/object/receipt locks.
 PERFORM internal.photo_analysis_assert_owner(p_object_id,p_document_id);
 -- Activation/provider may also have changed during the wait. OFF never returns
 -- a dispatch context, including for a pre-existing reserved operation.
 SELECT * INTO v_settings FROM internal.portal_photo_analysis_settings WHERE singleton;
 SELECT * INTO v_provider FROM public.app_ai_provider_config WHERE id=v_settings.provider_id AND is_active AND api_kind='openai_compatible';
 IF NOT COALESCE(v_settings.enabled,false) OR v_settings.daily_analysis_limit IS NULL OR v_provider.id IS NULL THEN
  RETURN jsonb_build_object('created',false,'enabled',false,'state','unavailable','assessment',NULL,'publication','office_review');
 END IF;
 IF v_doc.extra->>'upload_complete' IS DISTINCT FROM 'true' OR v_doc.extra->>'slot_state'='cancelled'
    OR COALESCE(v_doc.extra->>'upload_sha256','')!~'^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Dépôt non finalisé' USING ERRCODE='PT409'; END IF;
 SELECT * INTO v_op FROM internal.portal_photo_analysis WHERE id=p_request_id FOR UPDATE;
 IF FOUND THEN
  IF v_op.created_by IS DISTINCT FROM auth.uid() OR v_op.object_id IS DISTINCT FROM p_object_id
    OR v_op.document_id IS DISTINCT FROM p_document_id OR v_op.source_sha256 IS DISTINCT FROM v_doc.extra->>'upload_sha256' THEN
   RAISE EXCEPTION 'Requête différente sous le même identifiant' USING ERRCODE='PT409'; END IF;
  IF v_op.state='reserved' AND (v_op.provider_id IS DISTINCT FROM v_provider.id OR v_op.provider_revision IS DISTINCT FROM v_provider.updated_at) THEN
   UPDATE internal.portal_photo_analysis SET state='unavailable',finished_at=now(),outcome='{"state":"unavailable","assessment":null,"publication":"office_review"}' WHERE id=v_op.id;
  END IF;
  RETURN internal.photo_analysis_envelope(v_op.id)||jsonb_build_object('created',false);
 END IF;
 SELECT * INTO v_op FROM internal.portal_photo_analysis WHERE created_by=auth.uid() AND document_id=p_document_id
  AND source_sha256=v_doc.extra->>'upload_sha256' AND state IN('reserved','started','assessed','uncertain') FOR UPDATE;
 IF FOUND THEN
  IF v_op.state='reserved' AND (v_op.provider_id IS DISTINCT FROM v_provider.id OR v_op.provider_revision IS DISTINCT FROM v_provider.updated_at) THEN
   UPDATE internal.portal_photo_analysis SET state='unavailable',finished_at=now(),outcome='{"state":"unavailable","assessment":null,"publication":"office_review"}' WHERE id=v_op.id;
  END IF;
  RETURN internal.photo_analysis_envelope(v_op.id)||jsonb_build_object('created',false);
 END IF;
 SELECT count(*) INTO v_used FROM internal.portal_photo_analysis WHERE actor_id=v_actor AND local_day=v_day AND state<>'unavailable';
 IF v_used>=v_settings.daily_analysis_limit THEN
  RETURN jsonb_build_object('created',false,'enabled',true,'state','quota_reached','assessment',NULL,'publication','office_review','resetAt',internal.photo_analysis_reset_at(v_day));
 END IF;
 INSERT INTO internal.portal_photo_analysis(id,object_id,document_id,actor_id,created_by,source_sha256,local_day,provider_id,provider_revision)
 VALUES(p_request_id,p_object_id,p_document_id,v_actor,auth.uid(),v_doc.extra->>'upload_sha256',v_day,v_provider.id,v_provider.updated_at);
 RETURN internal.photo_analysis_envelope(p_request_id)||jsonb_build_object('created',true);
END;
$fn$;
CREATE FUNCTION api.get_portal_photo_analysis(p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,api,internal,auth,pg_temp AS $fn$
DECLARE v_op internal.portal_photo_analysis%ROWTYPE;
BEGIN
 SELECT * INTO v_op FROM internal.portal_photo_analysis WHERE id=p_request_id;
 IF v_op.id IS NULL THEN RAISE EXCEPTION 'Analyse inaccessible' USING ERRCODE='42501'; END IF;
 IF COALESCE(api.is_actor_persona(),false) THEN
  IF v_op.created_by IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Analyse inaccessible' USING ERRCODE='42501'; END IF;
  PERFORM internal.photo_analysis_assert_owner(v_op.object_id,v_op.document_id);
 ELSIF NOT api.can_read_object_for_correction(v_op.object_id)
   OR NOT EXISTS(SELECT 1 FROM public.crm_interaction c WHERE c.id=v_op.appeal_interaction_id
     AND c.extra->>'portal_photo_analysis_id'=v_op.id::text
     AND c.extra->>'portal_photo_document_id'=v_op.document_id::text
     AND c.extra->>'portal_photo_source_sha256'=v_op.source_sha256) THEN
  RAISE EXCEPTION 'Analyse inaccessible' USING ERRCODE='42501'; END IF;
 RETURN internal.photo_analysis_json(p_request_id);
END;
$fn$;
CREATE FUNCTION api.start_portal_photo_analysis(p_request_id uuid,p_claim_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,api,internal,auth,pg_temp SET lock_timeout='5s' AS $fn$
DECLARE v_op internal.portal_photo_analysis%ROWTYPE;v_actor uuid;v_doc public.ref_document%ROWTYPE;
 v_day date:=internal.photo_analysis_local_day(now());v_limit integer;v_used integer;
BEGIN
 SELECT * INTO v_op FROM internal.portal_photo_analysis WHERE id=p_request_id;
 IF v_op.id IS NULL OR v_op.created_by IS DISTINCT FROM auth.uid() OR p_claim_id IS NULL THEN RAISE EXCEPTION 'Analyse inaccessible' USING ERRCODE='42501'; END IF;
 v_actor:=internal.photo_analysis_assert_owner(v_op.object_id,v_op.document_id);
 PERFORM pg_advisory_xact_lock(hashtextextended('portal-photo-analysis:'||v_actor::text,0));
 PERFORM 1 FROM public.object WHERE id=v_op.object_id FOR UPDATE;
 SELECT * INTO v_doc FROM public.ref_document WHERE id=v_op.document_id FOR UPDATE;
 SELECT * INTO v_op FROM internal.portal_photo_analysis WHERE id=p_request_id FOR UPDATE;
 -- Recheck the current profile, realm and module mask after every lock wait,
 -- immediately before permitting a provider dispatch.
 PERFORM internal.photo_analysis_assert_owner(v_op.object_id,v_op.document_id);
 IF v_op.state<>'reserved' THEN RETURN jsonb_build_object('started',false,'operation',internal.photo_analysis_json(p_request_id)); END IF;
 IF v_doc.extra->>'upload_sha256' IS DISTINCT FROM v_op.source_sha256 OR v_doc.extra->>'slot_state'='cancelled'
  OR NOT EXISTS(SELECT 1 FROM internal.portal_photo_analysis_settings s JOIN public.app_ai_provider_config p ON p.id=s.provider_id
   WHERE s.singleton AND s.enabled AND s.daily_analysis_limit IS NOT NULL AND p.is_active AND p.api_kind='openai_compatible'
    AND p.id=v_op.provider_id AND p.updated_at=v_op.provider_revision) THEN
  UPDATE internal.portal_photo_analysis SET state='unavailable',finished_at=now(),outcome='{"state":"unavailable","assessment":null,"publication":"office_review"}' WHERE id=p_request_id;
  RETURN jsonb_build_object('started',false,'operation',internal.photo_analysis_json(p_request_id));
 END IF;
 -- A preparation which crosses local midnight must compete in the NEW day's
 -- budget before dispatch, rather than spending yesterday's unused reservation.
 IF v_op.local_day<>v_day THEN
  SELECT daily_analysis_limit INTO v_limit FROM internal.portal_photo_analysis_settings WHERE singleton;
  SELECT count(*) INTO v_used FROM internal.portal_photo_analysis WHERE actor_id=v_actor AND local_day=v_day AND state<>'unavailable';
  IF v_used>=v_limit THEN
   UPDATE internal.portal_photo_analysis SET state='unavailable',finished_at=now(),outcome='{"state":"unavailable","assessment":null,"publication":"office_review"}' WHERE id=p_request_id;
   RETURN jsonb_build_object('started',false,'operation',internal.photo_analysis_json(p_request_id),'quotaReached',true,'resetAt',internal.photo_analysis_reset_at(v_day));
  END IF;
  UPDATE internal.portal_photo_analysis SET local_day=v_day WHERE id=p_request_id;
 END IF;
 UPDATE internal.portal_photo_analysis SET state='started',claim_id=p_claim_id,started_at=now() WHERE id=p_request_id;
 RETURN jsonb_build_object('started',true,'operation',internal.photo_analysis_json(p_request_id));
END;
$fn$;
CREATE FUNCTION api.finish_portal_photo_analysis(p_request_id uuid,p_claim_id uuid,p_outcome jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,api,internal,auth,pg_temp SET lock_timeout='5s' AS $fn$
DECLARE v_op internal.portal_photo_analysis%ROWTYPE;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Serveur requis' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p_outcome) IS DISTINCT FROM 'object' OR NOT(p_outcome ?& ARRAY['state','assessment','publication'])
  OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_outcome) k WHERE k NOT IN('state','assessment','publication'))
  OR p_outcome->>'publication' IS DISTINCT FROM 'office_review' OR COALESCE(p_outcome->>'state','') NOT IN('assessed','unavailable','uncertain') THEN
  RAISE EXCEPTION 'Résultat invalide' USING ERRCODE='22023'; END IF;
 IF (p_outcome->>'state'='assessed' AND NOT internal.photo_assessment_valid(p_outcome->'assessment'))
   OR (p_outcome->>'state'<>'assessed' AND p_outcome->'assessment' IS DISTINCT FROM 'null'::jsonb) THEN
  RAISE EXCEPTION 'Évaluation invalide' USING ERRCODE='22023'; END IF;
 SELECT * INTO v_op FROM internal.portal_photo_analysis WHERE id=p_request_id FOR UPDATE;
 IF v_op.id IS NULL THEN RAISE EXCEPTION 'Analyse inaccessible' USING ERRCODE='42501'; END IF;
 -- A paid outcome only needs its operation row. Waiting for an unrelated gallery
 -- or receipt lock here can discard a known result after provider dispatch.
 IF p_claim_id IS DISTINCT FROM v_op.claim_id THEN RAISE EXCEPTION 'Reçu de traitement invalide' USING ERRCODE='PT409'; END IF;
 IF v_op.state IN('assessed','unavailable','uncertain') THEN
  IF v_op.outcome IS DISTINCT FROM p_outcome THEN RAISE EXCEPTION 'Résultat déjà confirmé' USING ERRCODE='PT409'; END IF;
  RETURN internal.photo_analysis_json(p_request_id);
 END IF;
 IF (v_op.state='reserved' AND (p_outcome->>'state'<>'unavailable' OR p_claim_id IS NOT NULL))
   OR (v_op.state='started' AND (p_claim_id IS DISTINCT FROM v_op.claim_id OR p_outcome->>'state'='unavailable')) THEN
  RAISE EXCEPTION 'Reçu de traitement invalide' USING ERRCODE='PT409'; END IF;
 UPDATE internal.portal_photo_analysis SET state=p_outcome->>'state',outcome=p_outcome,finished_at=now() WHERE id=p_request_id;
 RETURN internal.photo_analysis_json(p_request_id);
END;
$fn$;
CREATE FUNCTION api.appeal_portal_photo_analysis(p_request_id uuid,p_body text,p_client_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,api,internal,auth,pg_temp SET lock_timeout='5s' AS $fn$
DECLARE v_op internal.portal_photo_analysis%ROWTYPE;v_actor uuid;v_title text;v_body text;v_id uuid;v_intent_hash text;
BEGIN
 SELECT * INTO v_op FROM internal.portal_photo_analysis WHERE id=p_request_id;
 IF p_client_id IS NULL OR length(btrim(COALESCE(p_body,''))) NOT BETWEEN 1 AND 3000 THEN RAISE EXCEPTION 'Recours invalide' USING ERRCODE='22023'; END IF;
 IF v_op.id IS NULL OR v_op.created_by IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Analyse inaccessible' USING ERRCODE='42501'; END IF;
 v_actor:=internal.photo_analysis_assert_owner(v_op.object_id,v_op.document_id);
 v_intent_hash:=encode(sha256(convert_to(jsonb_build_array(p_request_id,p_client_id,btrim(p_body))::text,'UTF8')),'hex');
 -- Take the existing message actor lock BEFORE object/operation. send_portal_message
 -- uses this same lock, then its CRM FK; never acquire it after an object lock.
 PERFORM pg_advisory_xact_lock(hashtextextended('portal-message:'||v_actor::text,0));
 PERFORM 1 FROM public.object WHERE id=v_op.object_id FOR UPDATE;
 SELECT * INTO v_op FROM internal.portal_photo_analysis WHERE id=p_request_id FOR UPDATE;
 PERFORM internal.photo_analysis_assert_owner(v_op.object_id,v_op.document_id);
 IF v_op.state NOT IN('assessed','unavailable','uncertain') AND NOT(v_op.state='started' AND v_op.started_at<now()-interval '60 seconds') THEN
  RAISE EXCEPTION 'Analyse encore en cours' USING ERRCODE='PT409'; END IF;
 IF v_op.appeal_interaction_id IS NOT NULL THEN
  IF v_op.appeal_intent_hash IS DISTINCT FROM v_intent_hash OR v_op.appeal_client_id IS DISTINCT FROM p_client_id THEN
   RAISE EXCEPTION 'Un recours existe déjà pour cette analyse' USING ERRCODE='PT409'; END IF;
  RETURN v_op.appeal_interaction_id;
 END IF;
 SELECT title INTO v_title FROM public.ref_document WHERE id=v_op.document_id;
 v_body:='Je demande une relecture humaine de la photo «'||left(COALESCE(v_title,'Photo'),180)||'».'||E'\n\n'||btrim(p_body);
 -- Photo documents are NOT portal_message attachments. Keep that existing contract
 -- unchanged and persist the typed association on the CRM interaction instead.
 v_id:=api.send_portal_message(v_op.object_id,'correction',v_body,'[]'::jsonb,NULL,p_client_id);
 UPDATE public.crm_interaction SET extra=COALESCE(extra,'{}')||jsonb_build_object('portal_photo_analysis_id',p_request_id,
   'portal_photo_document_id',v_op.document_id,'portal_photo_source_sha256',v_op.source_sha256) WHERE id=v_id;
 -- The existing CRM conversation is the single copy of the free text. Retain only
 -- the request-bound intent digest so a retry can be checked without duplicating PII.
 UPDATE internal.portal_photo_analysis SET appeal_interaction_id=v_id,appeal_client_id=p_client_id,appeal_intent_hash=v_intent_hash WHERE id=p_request_id;
 RETURN v_id;
END;
$fn$;
DO $photo_analysis_appeal_preview$
DECLARE v_function regprocedure:='api.portal_photo_preview(uuid)'::regprocedure;v_hash text;v_definition text;v_meta jsonb;
 v_before text:=$preview_before$      OR (NOT api.is_actor_persona() AND api.user_can_moderate_object(v_doc.extra->>'object_id')$preview_before$;
 v_after text:=$preview_after$      OR (api.can_read_object_for_correction(v_doc.extra->>'object_id')
        AND EXISTS(SELECT 1 FROM internal.portal_photo_analysis a WHERE a.document_id=v_doc.id
           AND a.object_id=v_doc.extra->>'object_id' AND a.source_sha256=v_doc.extra->>'upload_sha256'
           AND EXISTS(SELECT 1 FROM public.crm_interaction c WHERE c.id=a.appeal_interaction_id
             AND c.extra->>'portal_photo_analysis_id'=a.id::text
             AND c.extra->>'portal_photo_document_id'=a.document_id::text
             AND c.extra->>'portal_photo_source_sha256'=a.source_sha256)))
      OR (NOT api.is_actor_persona() AND api.user_can_moderate_object(v_doc.extra->>'object_id')$preview_after$;
BEGIN
 SELECT md5(replace(p.prosrc,E'\r\n',E'\n')),pg_get_functiondef(p.oid),jsonb_build_object('owner',p.proowner,'acl',to_jsonb(p.proacl),'config',to_jsonb(p.proconfig),'definer',p.prosecdef,'strict',p.proisstrict,'volatility',p.provolatile,'parallel',p.proparallel,'returns',p.prorettype,'set',p.proretset,'args',p.proargtypes::text)
 INTO v_hash,v_definition,v_meta FROM pg_proc p WHERE p.oid=v_function;
 IF v_hash='177a6144c5303763d48207b109f1ea3b' THEN RETURN; END IF;
 IF v_hash IS DISTINCT FROM 'a4f9168e03b8821e0bbf240675576727' THEN RAISE EXCEPTION 'P: unreviewed private photo preview source %',v_hash; END IF;
 v_definition:=replace(v_definition,E'\r\n',E'\n');
 IF (length(v_definition)-length(replace(v_definition,v_before,'')))/length(v_before)<>1 THEN RAISE EXCEPTION 'P: preview authorization anchor differs'; END IF;
 EXECUTE replace(v_definition,v_before,v_after);
 IF (SELECT md5(replace(prosrc,E'\r\n',E'\n')) FROM pg_proc WHERE oid=v_function) IS DISTINCT FROM '177a6144c5303763d48207b109f1ea3b'
   OR (SELECT jsonb_build_object('owner',p.proowner,'acl',to_jsonb(p.proacl),'config',to_jsonb(p.proconfig),'definer',p.prosecdef,'strict',p.proisstrict,'volatility',p.provolatile,'parallel',p.proparallel,'returns',p.prorettype,'set',p.proretset,'args',p.proargtypes::text) FROM pg_proc p WHERE p.oid=v_function) IS DISTINCT FROM v_meta THEN
  RAISE EXCEPTION 'P: preview target or attributes differ'; END IF;
END;
$photo_analysis_appeal_preview$;
REVOKE ALL ON FUNCTION internal.photo_analysis_local_day(timestamptz),internal.photo_analysis_reset_at(date),
 internal.photo_analysis_assert_owner(text,uuid),internal.photo_analysis_json(uuid),internal.photo_analysis_envelope(uuid),internal.photo_assessment_valid(jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION api.reserve_portal_photo_analysis(text,uuid,uuid),api.get_portal_photo_analysis(uuid),
 api.start_portal_photo_analysis(uuid,uuid),api.appeal_portal_photo_analysis(uuid,text,uuid),api.finish_portal_photo_analysis(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION api.reserve_portal_photo_analysis(text,uuid,uuid),api.get_portal_photo_analysis(uuid),
 api.start_portal_photo_analysis(uuid,uuid),api.appeal_portal_photo_analysis(uuid,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION api.finish_portal_photo_analysis(uuid,uuid,jsonb) TO service_role;

-- supabase/migrations/20261104151051_partner_photo_actor_workspace_texts.sql
SET LOCAL lock_timeout='500ms';
SET LOCAL statement_timeout='15s';
DO $dependencies$
BEGIN
 IF to_regprocedure('internal.portal_photo_assert_actor(text)') IS NULL
  OR to_regprocedure('internal.gallery_photo_usage(text)') IS NULL
  OR to_regprocedure('internal.photo_analysis_json(uuid)') IS NULL
  OR to_regprocedure('api.send_portal_message(text,text,text,jsonb,text,uuid)') IS NULL
  OR to_regclass('internal.portal_photo_analysis_settings') IS NULL
  OR to_regprocedure('api.i18n_pick_strict(jsonb,text,text)') IS NULL THEN
  RAISE EXCEPTION 'Install R5, R6 and P before the actor album contract';
 END IF;
END;
$dependencies$;
CREATE FUNCTION internal.portal_photo_actor_writes_enabled() RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $fn$
 SELECT false;
$fn$;
CREATE FUNCTION internal.portal_photo_assert_writes_open() RETURNS void
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog,internal AS $fn$
BEGIN
 IF NOT internal.portal_photo_actor_writes_enabled() THEN
  RAISE EXCEPTION 'La gestion des photos est temporairement indisponible. Votre saisie est conservée.' USING ERRCODE='PT409',DETAIL='photo_writes_closed';
 END IF;
END;
$fn$;
CREATE FUNCTION internal.portal_photo_text_snapshot(p_title text,p_description text,p_title_i18n jsonb,p_description_i18n jsonb,p_revision text)
RETURNS jsonb LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog AS $fn$
 SELECT jsonb_build_object('title',p_title,'description',p_description,
  'title_i18n',p_title_i18n,'description_i18n',p_description_i18n,'revision',p_revision);
$fn$;
CREATE FUNCTION internal.portal_photo_order_snapshot(p_object_id text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $fn$
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',m.id,'position',m.position,'isMain',m.is_main,'revision',m.xmin::text||':'||m.ctid::text)
  ORDER BY m.position NULLS LAST,m.created_at,m.id),'[]'::jsonb)
 FROM public.media m JOIN public.ref_code_media_type t ON t.id=m.media_type_id
 WHERE m.object_id=p_object_id AND m.place_id IS NULL AND t.code='photo'
  AND m.is_published AND COALESCE(m.visibility,'public')='public';
$fn$;
CREATE FUNCTION internal.portal_photo_workspace_json(p_object_id text,p_actor_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public,api,internal,auth AS $fn$
 WITH published AS (
  SELECT m.*,m.xmin::text||':'||m.ctid::text AS revision,row_number() OVER(ORDER BY m.position NULLS LAST,m.created_at,m.id) AS raw_index
  FROM public.media m JOIN public.ref_code_media_type t ON t.id=m.media_type_id
  WHERE m.object_id=p_object_id AND m.place_id IS NULL AND t.code='photo'
   AND m.is_published AND COALESCE(m.visibility,'public')='public'
 ), proposals AS (
  SELECT d.*,d.xmin::text||':'||d.ctid::text AS revision,pc.id AS change_id,pc.status AS change_status,pc.submitted_at,pc.review_note,
   CASE WHEN EXISTS(SELECT 1 FROM published m WHERE m.id::text=d.extra->>'slot_replace_media_id')
    THEN d.extra->>'slot_replace_media_id' END AS replacement,
   a.id AS analysis_id,a.state AS analysis_state,a.started_at,a.appeal_interaction_id,
   a.source_sha256 AS analysis_sha256,
   d.extra->'photo_review_appeals'->pc.id::text AS review_appeal
  FROM public.ref_document d
  JOIN public.actor_document ad ON ad.document_id=d.id AND ad.actor_id=p_actor_id AND ad.created_by=auth.uid()
  LEFT JOIN LATERAL (
   SELECT pc.* FROM public.pending_change pc
   WHERE pc.object_id=p_object_id AND pc.submitted_by=auth.uid()
    AND pc.metadata->>'rpc'='publish_portal_photo_additions'
    AND (d.extra->>'slot_contract' IS DISTINCT FROM 'photo-stock-v1'
      OR pc.id::text=d.extra->>'slot_pending_change_id' OR pc.status='pending')
    AND EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(pc.payload->'additions','[]')) item
      WHERE item->>'upload_id'=d.id::text)
   ORDER BY (pc.status='pending') DESC,pc.submitted_at DESC,pc.id DESC LIMIT 1
  ) pc ON true
  LEFT JOIN LATERAL (
   SELECT a.* FROM internal.portal_photo_analysis a
   WHERE a.document_id=d.id AND a.object_id=p_object_id AND a.actor_id=p_actor_id
    AND a.created_by=auth.uid() AND a.source_sha256=d.extra->>'upload_sha256'
   ORDER BY (a.appeal_interaction_id IS NOT NULL) DESC,a.created_at DESC,a.id DESC LIMIT 1
  ) a ON true
  WHERE d.extra->>'source'='portal_photo' AND d.extra->>'object_id'=p_object_id
   AND d.extra->>'published_media_id' IS NULL
   AND COALESCE(d.extra->>'slot_state','uploaded') NOT IN('cancelled','consumed')
   AND (d.extra->>'upload_complete'='true' OR d.extra->>'slot_contract' IS DISTINCT FROM 'photo-stock-v1')
   AND d.access_scope='crm_private' AND d.storage_bucket='actor-documents'
   AND d.storage_path='portal-photos/'||p_actor_id::text||'/'||d.id::text||'.jpg'
 ), counts AS (
  SELECT internal.gallery_published_photo_count(p_object_id) AS published,
   internal.gallery_photo_usage(p_object_id) AS used
 )
 SELECT jsonb_build_object(
  'published',COALESCE((SELECT jsonb_agg(jsonb_build_object(
   'id',m.id,'url',m.url,
   'title',COALESCE(api.i18n_pick_strict(m.title_i18n,'fr','fr'),m.title,''),
   'description',COALESCE(api.i18n_pick_strict(m.description_i18n,'fr','fr'),m.description,''),
   'credit',COALESCE(m.credit,''),'position',m.position,'isMain',COALESCE(m.is_main,false),
   'portalDocumentId',m.extra->>'portal_document_id',
   'textSnapshot',internal.portal_photo_text_snapshot(m.title,m.description,m.title_i18n,m.description_i18n,m.revision))
   ORDER BY (m.is_main IS TRUE) DESC,m.position NULLS LAST,m.created_at,m.id) FROM published m),'[]'::jsonb),
  'orderSnapshot',internal.portal_photo_order_snapshot(p_object_id),
  'orderNeedsNormalization',COALESCE((SELECT bool_or(
    (m.is_main IS TRUE) IS DISTINCT FROM (m.raw_index=1) OR m.position IS DISTINCT FROM m.raw_index::integer)
   FROM published m),false),
  'proposals',COALESCE((SELECT jsonb_agg(jsonb_build_object(
   'documentId',d.id,
   'title',COALESCE(api.i18n_pick_strict(d.title_i18n,'fr','fr'),d.title,''),
   'description',COALESCE(api.i18n_pick_strict(d.description_i18n,'fr','fr'),d.description,''),
   'status',CASE WHEN d.change_status IN('pending','approved') THEN 'pending'
    WHEN d.change_status='rejected' THEN 'refused' ELSE 'draft' END,
   'replaceMediaId',d.replacement,'changeId',d.change_id,'submittedAt',d.submitted_at,'reviewNote',d.review_note,
   'textSnapshot',internal.portal_photo_text_snapshot(d.title,d.description,d.title_i18n,d.description_i18n,d.revision),
   'analysis',CASE WHEN d.analysis_id IS NOT NULL THEN internal.photo_analysis_json(d.analysis_id) END,
   'reviewAppeal',(SELECT jsonb_build_object('interactionId',c.id,'status',c.status)
    FROM public.crm_interaction c WHERE c.id::text=d.review_appeal->>'interactionId'
     AND c.extra->>'portal_photo_change_id'=d.change_id::text AND c.extra->>'portal_photo_document_id'=d.id::text),
   'canAppeal',internal.portal_photo_actor_writes_enabled() AND COALESCE(d.review_appeal IS NULL AND d.appeal_interaction_id IS NULL AND (
     (d.analysis_id IS NOT NULL
      AND (d.analysis_state IN('assessed','unavailable','uncertain')
       OR (d.analysis_state='started' AND d.started_at<now()-interval '60 seconds')))
     OR d.change_status='rejected')
    AND EXISTS(SELECT 1 FROM public.ref_code_demand_topic t WHERE t.code='modification_infos_bdd' AND t.is_active),false))
   ORDER BY d.created_at,d.id) FROM proposals d),'[]'::jsonb),
  'capacity',jsonb_build_object('limit',20,'published',c.published,'reserved',greatest(0,c.used-c.published),
   'used',c.used,'remaining',greatest(0,20-c.used)),
  'writesEnabled',internal.portal_photo_actor_writes_enabled(),
  'analysisEnabled',internal.portal_photo_actor_writes_enabled() AND EXISTS(SELECT 1 FROM internal.portal_photo_analysis_settings s
   JOIN public.app_ai_provider_config p ON p.id=s.provider_id
   WHERE s.singleton AND s.enabled AND s.daily_analysis_limit IS NOT NULL AND p.is_active AND p.api_kind='openai_compatible'))
 FROM counts c;
$fn$;
CREATE FUNCTION api.get_my_portal_photo_workspace(p_object_id text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,api,internal,auth,pg_temp AS $fn$
DECLARE v_actor uuid;
BEGIN
 v_actor:=internal.portal_photo_assert_actor(p_object_id);
 RETURN internal.portal_photo_workspace_json(p_object_id,v_actor);
END;
$fn$;
CREATE FUNCTION internal.update_portal_photo_texts(
 p_object_id text,p_id uuid,p_private boolean,p_expected jsonb,p_title text,p_description text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public,api,internal,auth,pg_temp AS $fn$
DECLARE v_actor uuid;v_title text;v_description text;v_title_i18n jsonb;v_description_i18n jsonb;
 v_snapshot jsonb;v_display_title text;v_display_description text;v_revision text;
BEGIN
 v_actor:=internal.portal_photo_assert_actor(p_object_id);
 PERFORM internal.portal_photo_assert_writes_open();
 PERFORM 1 FROM public.object WHERE id=p_object_id FOR UPDATE;
 IF p_private THEN
  SELECT d.title,d.description,d.title_i18n,d.description_i18n,d.xmin::text||':'||d.ctid::text
   INTO v_title,v_description,v_title_i18n,v_description_i18n,v_revision
  FROM public.ref_document d JOIN public.actor_document ad ON ad.document_id=d.id
  WHERE d.id=p_id AND ad.actor_id=v_actor AND ad.created_by=auth.uid()
   AND d.extra->>'source'='portal_photo' AND d.extra->>'object_id'=p_object_id
   AND d.access_scope='crm_private' AND d.storage_bucket='actor-documents'
   AND d.storage_path='portal-photos/'||v_actor::text||'/'||d.id::text||'.jpg'
   AND d.extra->>'published_media_id' IS NULL AND COALESCE(d.extra->>'slot_state','uploaded') NOT IN('cancelled','consumed')
   AND (d.extra->>'upload_complete'='true' OR d.extra->>'slot_contract' IS DISTINCT FROM 'photo-stock-v1')
  FOR UPDATE OF d;
 ELSE
  SELECT m.title,m.description,m.title_i18n,m.description_i18n,m.xmin::text||':'||m.ctid::text
   INTO v_title,v_description,v_title_i18n,v_description_i18n,v_revision
  FROM public.media m JOIN public.ref_code_media_type t ON t.id=m.media_type_id
  WHERE m.id=p_id AND m.object_id=p_object_id AND m.place_id IS NULL AND t.code='photo'
   AND m.is_published AND COALESCE(m.visibility,'public')='public' FOR UPDATE OF m;
 END IF;
 IF NOT FOUND THEN RAISE EXCEPTION 'Photo inaccessible' USING ERRCODE='42501'; END IF;
 -- A valid scope for another actor after a wait is not the original identity.
 IF internal.portal_photo_assert_actor(p_object_id) IS DISTINCT FROM v_actor THEN
  RAISE EXCEPTION 'Votre accès a changé. Rechargez la fiche.' USING ERRCODE='42501';
 END IF;
 PERFORM internal.portal_photo_assert_writes_open();
 IF jsonb_typeof(p_expected) IS DISTINCT FROM 'object'
  OR NOT(p_expected ?& ARRAY['title','description','title_i18n','description_i18n','revision'])
  OR jsonb_typeof(p_expected->'revision') IS DISTINCT FROM 'string'
  OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_expected) k WHERE k NOT IN('title','description','title_i18n','description_i18n','revision'))
  OR (v_title_i18n IS NOT NULL AND jsonb_typeof(v_title_i18n) NOT IN('object','null'))
  OR (v_description_i18n IS NOT NULL AND jsonb_typeof(v_description_i18n) NOT IN('object','null')) THEN
  RAISE EXCEPTION 'État des textes invalide. Rechargez la photo.' USING ERRCODE='22023';
 END IF;
 v_snapshot:=internal.portal_photo_text_snapshot(v_title,v_description,v_title_i18n,v_description_i18n,v_revision);
 v_display_title:=COALESCE(api.i18n_pick_strict(v_title_i18n,'fr','fr'),v_title,'');
 v_display_description:=COALESCE(api.i18n_pick_strict(v_description_i18n,'fr','fr'),v_description,'');
 -- Trim/limit only a changed value. A historical long/untrimmed field submitted
 -- exactly unchanged must not block or be normalized by editing the other one.
 IF COALESCE(p_title,'') IS DISTINCT FROM v_display_title THEN
  p_title:=btrim(COALESCE(p_title,''));
  IF char_length(p_title)>180 THEN RAISE EXCEPTION 'Le titre est limité à 180 caractères.' USING ERRCODE='22023',DETAIL='photo_title_too_long'; END IF;
 END IF;
 IF COALESCE(p_description,'') IS DISTINCT FROM v_display_description THEN
  p_description:=btrim(COALESCE(p_description,''));
  IF char_length(p_description)>5000 THEN RAISE EXCEPTION 'La description est limitée à 5000 caractères.' USING ERRCODE='22023',DETAIL='photo_description_too_long'; END IF;
 END IF;
 -- A lost response may be retried, but a fresh state is never silently rebased.
 IF v_snapshot IS DISTINCT FROM p_expected THEN
  IF v_display_title=COALESCE(p_title,'') AND v_display_description=COALESCE(p_description,'') THEN
   RETURN internal.portal_photo_workspace_json(p_object_id,v_actor);
  END IF;
  RAISE EXCEPTION 'Les textes ont changé. Comparez les valeurs actuelles avant de réessayer.' USING ERRCODE='PT409',DETAIL='photo_text_conflict';
 END IF;
 IF v_display_title=COALESCE(p_title,'') AND v_display_description=COALESCE(p_description,'') THEN
  RETURN internal.portal_photo_workspace_json(p_object_id,v_actor);
 END IF;
 IF p_private THEN
  UPDATE public.ref_document SET
   title=CASE WHEN v_display_title=COALESCE(p_title,'') THEN v_title ELSE NULLIF(p_title,'') END,
   description=CASE WHEN v_display_description=COALESCE(p_description,'') THEN v_description ELSE NULLIF(p_description,'') END,
   title_i18n=CASE WHEN v_display_title=COALESCE(p_title,'') THEN v_title_i18n
    ELSE jsonb_set(CASE WHEN jsonb_typeof(v_title_i18n)='object' THEN v_title_i18n ELSE '{}'::jsonb END,'{fr}',to_jsonb(COALESCE(p_title,'')),true) END,
   description_i18n=CASE WHEN v_display_description=COALESCE(p_description,'') THEN v_description_i18n
    ELSE jsonb_set(CASE WHEN jsonb_typeof(v_description_i18n)='object' THEN v_description_i18n ELSE '{}'::jsonb END,'{fr}',to_jsonb(COALESCE(p_description,'')),true) END
  WHERE id=p_id;
  IF v_display_title IS DISTINCT FROM COALESCE(p_title,'') THEN
   UPDATE public.actor_document SET title=NULLIF(p_title,'') WHERE document_id=p_id AND actor_id=v_actor AND created_by=auth.uid();
  END IF;
 ELSE
  UPDATE public.media SET
   title=CASE WHEN v_display_title=COALESCE(p_title,'') THEN v_title ELSE NULLIF(p_title,'') END,
   description=CASE WHEN v_display_description=COALESCE(p_description,'') THEN v_description ELSE NULLIF(p_description,'') END,
   title_i18n=CASE WHEN v_display_title=COALESCE(p_title,'') THEN v_title_i18n
    ELSE jsonb_set(CASE WHEN jsonb_typeof(v_title_i18n)='object' THEN v_title_i18n ELSE '{}'::jsonb END,'{fr}',to_jsonb(COALESCE(p_title,'')),true) END,
   description_i18n=CASE WHEN v_display_description=COALESCE(p_description,'') THEN v_description_i18n
    ELSE jsonb_set(CASE WHEN jsonb_typeof(v_description_i18n)='object' THEN v_description_i18n ELSE '{}'::jsonb END,'{fr}',to_jsonb(COALESCE(p_description,'')),true) END
  WHERE id=p_id;
 END IF;
 RETURN internal.portal_photo_workspace_json(p_object_id,v_actor);
END;
$fn$;
CREATE FUNCTION api.update_portal_photo_texts(p_object_id text,p_media_id uuid,p_expected jsonb,p_title text,p_description text)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,api,internal,auth,pg_temp SET lock_timeout='5s' AS $fn$
 SELECT internal.update_portal_photo_texts(p_object_id,p_media_id,false,p_expected,p_title,p_description);
$fn$;
CREATE FUNCTION api.update_portal_photo_proposal_texts(p_object_id text,p_document_id uuid,p_expected jsonb,p_title text,p_description text)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,api,internal,auth,pg_temp SET lock_timeout='5s' AS $fn$
 SELECT internal.update_portal_photo_texts(p_object_id,p_document_id,true,p_expected,p_title,p_description);
$fn$;
CREATE FUNCTION api.reconcile_portal_photo_order(p_object_id text,p_expected jsonb,p_media_ids jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,api,internal,auth,pg_temp SET lock_timeout='5s' AS $fn$
DECLARE v_actor uuid;v_current jsonb;v_ids uuid[];v_current_ids uuid[];v_i integer;
BEGIN
 v_actor:=internal.portal_photo_assert_actor(p_object_id);
 PERFORM internal.portal_photo_assert_writes_open();
 IF jsonb_typeof(p_expected) IS DISTINCT FROM 'array' OR jsonb_typeof(p_media_ids) IS DISTINCT FROM 'array'
  OR jsonb_array_length(p_media_ids)>100 OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_media_ids) v
    WHERE jsonb_typeof(v)<>'string' OR v#>>'{}'!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') THEN
  RAISE EXCEPTION 'Ordre des photos invalide' USING ERRCODE='22023';
 END IF;
 v_ids:=ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(p_media_ids));
 IF cardinality(v_ids)<>(SELECT count(DISTINCT v) FROM unnest(v_ids) v) THEN
  RAISE EXCEPTION 'Photo répétée dans le classement' USING ERRCODE='22023';
 END IF;
 PERFORM 1 FROM public.object WHERE id=p_object_id FOR UPDATE;
 -- Never acquire a proposal/submission lock after this object lock.
 PERFORM 1 FROM public.media m JOIN public.ref_code_media_type t ON t.id=m.media_type_id
  WHERE m.object_id=p_object_id AND t.code='photo' ORDER BY m.id FOR UPDATE OF m;
 IF internal.portal_photo_assert_actor(p_object_id) IS DISTINCT FROM v_actor THEN
  RAISE EXCEPTION 'Votre accès a changé. Rechargez la fiche.' USING ERRCODE='42501';
 END IF;
 PERFORM internal.portal_photo_assert_writes_open();
 v_current:=internal.portal_photo_order_snapshot(p_object_id);
 v_current_ids:=ARRAY(SELECT (v->>'id')::uuid FROM jsonb_array_elements(v_current) v);
 IF NOT(v_ids @> v_current_ids AND v_current_ids @> v_ids) THEN
  RAISE EXCEPTION 'Les photos ont changé. Rechargez la galerie avant de la réordonner.' USING ERRCODE='PT409',DETAIL='photo_order_conflict';
 END IF;
 -- The legacy unique index also covers hidden/unpublished/place rows sharing
 -- object_id. Preserve them; do not leak or clear their identity to make room.
 IF cardinality(v_ids)>0 AND EXISTS(SELECT 1 FROM public.media m JOIN public.ref_code_media_type t ON t.id=m.media_type_id
  WHERE m.object_id=p_object_id AND t.code='photo' AND m.is_main IS TRUE
   AND NOT(m.id=ANY(v_ids))) THEN
  RAISE EXCEPTION 'La principale de cette fiche doit être vérifiée par l’office.' USING ERRCODE='PT409',DETAIL='photo_main_conflict';
 END IF;
 IF v_current IS DISTINCT FROM p_expected THEN
  IF v_ids=v_current_ids AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_current) WITH ORDINALITY e(v,n)
    WHERE (v->>'position')::integer IS DISTINCT FROM n::integer OR (v->>'isMain')::boolean IS DISTINCT FROM (n=1)) THEN
   RETURN internal.portal_photo_workspace_json(p_object_id,v_actor);
  END IF;
  RAISE EXCEPTION 'Le classement a changé. Comparez le nouvel ordre avant de réessayer.' USING ERRCODE='PT409',DETAIL='photo_order_conflict';
 END IF;
 UPDATE public.media SET is_main=false WHERE id=ANY(v_ids);
 FOR v_i IN 1..cardinality(v_ids) LOOP
  UPDATE public.media SET position=v_i,is_main=(v_i=1) WHERE id=v_ids[v_i];
 END LOOP;
 RETURN internal.portal_photo_workspace_json(p_object_id,v_actor);
EXCEPTION WHEN unique_violation THEN
 RAISE EXCEPTION 'La principale de cette fiche doit être vérifiée par l’office.' USING ERRCODE='PT409',DETAIL='photo_main_conflict';
END;
$fn$;
CREATE FUNCTION api.appeal_portal_photo_review(
 p_object_id text,p_document_id uuid,p_change_id uuid,p_body text,p_client_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,api,internal,auth,pg_temp SET lock_timeout='5s' AS $fn$
DECLARE v_actor uuid;v_doc public.ref_document%ROWTYPE;v_pc public.pending_change%ROWTYPE;
 v_receipt jsonb;v_hash text;v_id uuid;
BEGIN
 v_actor:=internal.portal_photo_assert_actor(p_object_id);
 PERFORM internal.portal_photo_assert_writes_open();
 IF p_document_id IS NULL OR p_change_id IS NULL OR p_client_id IS NULL
  OR length(btrim(COALESCE(p_body,''))) NOT BETWEEN 1 AND 3000 THEN
  RAISE EXCEPTION 'Recours invalide' USING ERRCODE='22023';
 END IF;
 v_hash:=encode(sha256(convert_to(jsonb_build_array(p_object_id,p_document_id,p_change_id,p_client_id,btrim(p_body))::text,'UTF8')),'hex');
 -- Same order as send_portal_message / P appeal. Do not lock a proposal after object.
 PERFORM pg_advisory_xact_lock(hashtextextended('portal-message:'||v_actor::text,0));
 PERFORM 1 FROM public.object WHERE id=p_object_id FOR UPDATE;
 SELECT d.* INTO v_doc FROM public.ref_document d JOIN public.actor_document ad ON ad.document_id=d.id
 WHERE d.id=p_document_id AND ad.actor_id=v_actor AND ad.created_by=auth.uid()
  AND d.extra->>'source'='portal_photo' AND d.extra->>'object_id'=p_object_id
  AND d.access_scope='crm_private' AND d.storage_bucket='actor-documents'
  AND d.storage_path='portal-photos/'||v_actor::text||'/'||d.id::text||'.jpg'
  AND d.extra->>'published_media_id' IS NULL AND COALESCE(d.extra->>'slot_state','uploaded') NOT IN('cancelled','consumed')
 FOR UPDATE OF d;
 IF NOT FOUND OR internal.portal_photo_assert_actor(p_object_id) IS DISTINCT FROM v_actor THEN
  RAISE EXCEPTION 'Photo inaccessible' USING ERRCODE='42501';
 END IF;
 PERFORM internal.portal_photo_assert_writes_open();
 SELECT * INTO v_pc FROM public.pending_change pc
 WHERE pc.id=p_change_id AND pc.object_id=p_object_id AND pc.submitted_by=auth.uid()
  AND pc.metadata->>'rpc'='publish_portal_photo_additions'
  AND EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(pc.payload->'additions','[]')) item WHERE item->>'upload_id'=p_document_id::text);
 IF v_pc.id IS NULL THEN RAISE EXCEPTION 'Relecture inaccessible' USING ERRCODE='42501'; END IF;
 v_receipt:=v_doc.extra->'photo_review_appeals'->p_change_id::text;
 IF v_receipt IS NOT NULL THEN
  IF v_receipt->>'intentHash' IS DISTINCT FROM v_hash OR v_receipt->>'clientId' IS DISTINCT FROM p_client_id::text THEN
   RAISE EXCEPTION 'Un recours existe déjà pour cette relecture' USING ERRCODE='PT409';
  END IF;
  SELECT c.id INTO v_id FROM public.crm_interaction c
   WHERE c.id::text=v_receipt->>'interactionId' AND c.actor_id=v_actor AND c.object_id=p_object_id
    AND c.extra->>'portal_photo_change_id'=p_change_id::text AND c.extra->>'portal_photo_document_id'=p_document_id::text;
  IF v_id IS NULL THEN RAISE EXCEPTION 'Recours inaccessible' USING ERRCODE='42501'; END IF;
  RETURN v_id;
 END IF;
 -- P and B appeals share the actor-message lock. Whichever commits first wins;
 -- an old tab cannot create a second conversation through the other RPC.
 IF EXISTS(SELECT 1 FROM internal.portal_photo_analysis a WHERE a.document_id=p_document_id
  AND a.object_id=p_object_id AND a.actor_id=v_actor AND a.created_by=auth.uid()
  AND a.source_sha256=v_doc.extra->>'upload_sha256' AND a.appeal_interaction_id IS NOT NULL) THEN
  RAISE EXCEPTION 'Une demande de révision existe déjà pour cette photo.' USING ERRCODE='PT409';
 END IF;
 IF v_pc.status IS DISTINCT FROM 'rejected'
  OR (v_doc.extra->>'slot_pending_change_id' IS NOT NULL AND v_doc.extra->>'slot_pending_change_id'<>p_change_id::text)
  OR EXISTS(SELECT 1 FROM public.pending_change pc WHERE pc.object_id=p_object_id AND pc.submitted_by=auth.uid()
    AND pc.metadata->>'rpc'='publish_portal_photo_additions'
    AND (pc.submitted_at,pc.id)>(v_pc.submitted_at,v_pc.id)
    AND EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(pc.payload->'additions','[]')) item WHERE item->>'upload_id'=p_document_id::text)) THEN
  RAISE EXCEPTION 'La relecture a changé. Actualisez le suivi de cette photo.' USING ERRCODE='PT409';
 END IF;
 IF EXISTS(SELECT 1 FROM public.crm_interaction c WHERE c.actor_id=v_actor AND c.source='portal'
  AND c.extra->>'portal_client_id'=p_client_id::text
  AND (c.extra->>'portal_photo_change_id' IS DISTINCT FROM p_change_id::text
   OR c.extra->>'portal_photo_document_id' IS DISTINCT FROM p_document_id::text)) THEN
  RAISE EXCEPTION 'Identifiant de recours déjà utilisé pour une autre demande.' USING ERRCODE='PT409';
 END IF;
 v_id:=api.send_portal_message(p_object_id,'correction',
  'Je demande une révision du refus de la photo «'||left(COALESCE(api.i18n_pick_strict(v_doc.title_i18n,'fr','fr'),v_doc.title,'Photo'),180)||'».'||E'\n\n'||btrim(p_body),
  '[]'::jsonb,NULL,p_client_id);
 UPDATE public.crm_interaction SET extra=COALESCE(extra,'{}')||jsonb_build_object(
  'portal_photo_change_id',p_change_id,'portal_photo_document_id',p_document_id) WHERE id=v_id;
 UPDATE public.ref_document SET extra=jsonb_set(COALESCE(extra,'{}'),'{photo_review_appeals}',
  COALESCE(extra->'photo_review_appeals','{}')||jsonb_build_object(p_change_id::text,jsonb_build_object(
   'interactionId',v_id,'clientId',p_client_id,'intentHash',v_hash)),true) WHERE id=p_document_id;
 RETURN v_id;
END;
$fn$;
CREATE FUNCTION internal.gallery_capture_photo_proposal_usage() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,internal,pg_temp AS $fn$
BEGIN
 IF NEW.status<>'pending' OR NEW.metadata->>'rpc' IS DISTINCT FROM 'publish_portal_photo_additions' THEN RETURN NEW; END IF;
 PERFORM internal.portal_photo_assert_writes_open();
 PERFORM 1 FROM public.object WHERE id=NEW.object_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Fiche inaccessible' USING ERRCODE='42501'; END IF;
 PERFORM internal.portal_photo_assert_writes_open();
 NEW.metadata:=COALESCE(NEW.metadata,'{}')||jsonb_build_object(
  'album_stock_usage_before',internal.gallery_photo_usage(NEW.object_id),
  'album_stock_published_before',internal.gallery_published_photo_count(NEW.object_id));
 RETURN NEW;
END;
$fn$;
CREATE TRIGGER gallery_capture_photo_proposal_usage BEFORE INSERT ON public.pending_change
 FOR EACH ROW EXECUTE FUNCTION internal.gallery_capture_photo_proposal_usage();
REVOKE ALL ON FUNCTION internal.portal_photo_actor_writes_enabled(),internal.portal_photo_assert_writes_open(),
 internal.portal_photo_text_snapshot(text,text,jsonb,jsonb,text),internal.portal_photo_order_snapshot(text),
 internal.portal_photo_workspace_json(text,uuid),internal.update_portal_photo_texts(text,uuid,boolean,jsonb,text,text),
 internal.gallery_capture_photo_proposal_usage()
 FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION api.get_my_portal_photo_workspace(text),
 api.update_portal_photo_texts(text,uuid,jsonb,text,text),api.update_portal_photo_proposal_texts(text,uuid,jsonb,text,text),
 api.reconcile_portal_photo_order(text,jsonb,jsonb),api.appeal_portal_photo_review(text,uuid,uuid,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION api.get_my_portal_photo_workspace(text) TO authenticated;
DO $photo_album_sources$
DECLARE v_target record;v_function regprocedure;v_definition text;v_md5 text;v_meta jsonb;v_pair jsonb;v_old text;v_new text;
BEGIN
 FOR v_target IN SELECT * FROM (VALUES
 ('internal.validate_portal_photo_additions(text,jsonb,uuid)','f2141450982dafb04be58f5967913aca','a3fdd6bae9f521258c7481df06c4b7f5',jsonb_build_array(
  jsonb_build_array($album_validator_before_1$v_previous_published integer;$album_validator_before_1$,
   $album_validator_after_1$v_previous_published integer; v_actor uuid;$album_validator_after_1$),
  jsonb_build_array($album_validator_before_2$  PERFORM 1 FROM public.object WHERE id=p_object_id FOR UPDATE;$album_validator_before_2$,
   $album_validator_after_2$  IF COALESCE(api.is_actor_persona(),false) THEN
    v_actor:=internal.portal_photo_assert_actor(p_object_id);
    IF auth.uid() IS DISTINCT FROM p_user_id THEN RAISE EXCEPTION 'Photo inaccessible' USING ERRCODE='42501'; END IF;
  END IF;
  PERFORM internal.portal_photo_assert_writes_open();
  PERFORM 1 FROM public.object WHERE id=p_object_id FOR UPDATE;
  PERFORM internal.portal_photo_assert_writes_open();
  IF v_actor IS NOT NULL AND internal.portal_photo_assert_actor(p_object_id) IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'Votre accès a changé. Rechargez la fiche.' USING ERRCODE='42501';
  END IF;$album_validator_after_2$),
  jsonb_build_array($album_validator_before_3$WHERE d.id=v_id AND a.created_by=p_user_id$album_validator_before_3$,
   $album_validator_after_3$WHERE d.id=v_id AND a.created_by=p_user_id AND (v_actor IS NULL OR a.actor_id=v_actor)$album_validator_after_3$),
  jsonb_build_array($album_validator_before_4$    v_replace:=NULLIF(v_item->>'replace_media_id','')::uuid;
    IF EXISTS$album_validator_before_4$,
   $album_validator_after_4$    v_replace:=NULLIF(v_item->>'replace_media_id','')::uuid;
    -- Once the old public version is withdrawn, a not-yet-submitted replacement
    -- becomes an ordinary addition. Its existing reservation already counts one.
    -- Never rewrite a queued B payload or its reservation binding.
    IF v_replace IS NULL AND NOT EXISTS(SELECT 1 FROM public.pending_change pc
      WHERE pc.object_id=p_object_id AND pc.status='pending' AND pc.metadata->>'rpc'='publish_portal_photo_additions'
       AND EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(pc.payload->'additions','[]')) a WHERE a->>'upload_id'=v_id::text)) THEN
      UPDATE public.ref_document d SET extra=extra||jsonb_build_object('slot_replace_media_id',NULL)
      WHERE d.id=v_id AND d.extra->>'slot_replace_media_id' IS NOT NULL AND NOT EXISTS(
        SELECT 1 FROM public.media m JOIN public.ref_code_media_type t ON t.id=m.media_type_id
        WHERE m.id::text=d.extra->>'slot_replace_media_id' AND m.object_id=p_object_id AND m.place_id IS NULL
          AND t.code='photo' AND m.is_published AND COALESCE(m.visibility,'public')='public');
    END IF;
    IF EXISTS$album_validator_after_4$)
  )),
 ('api.publish_portal_photo_additions(text,jsonb)','6f678c3f978cb836d0521c1727fe2846','2cb3dff0a63010819e3a25dfc18fdaa0',jsonb_build_array(
  jsonb_build_array($album_publish_before_1$INSERT INTO public.media(object_id,media_type_id,title,credit,url,width,height,kind,visibility,position,is_main,is_published,extra)
      VALUES(p_object_id,v_type,v_doc.title,NULLIF$album_publish_before_1$,
   $album_publish_after_1$INSERT INTO public.media(object_id,media_type_id,title,description,title_i18n,description_i18n,credit,url,width,height,kind,visibility,position,is_main,is_published,extra)
      VALUES(p_object_id,v_type,v_doc.title,v_doc.description,v_doc.title_i18n,v_doc.description_i18n,NULLIF$album_publish_after_1$),
  jsonb_build_array($album_publish_before_2$  PERFORM internal.gallery_assert_photo_capacity(p_object_id,v_previous_usage,v_previous_published);$album_publish_before_2$,
   $album_publish_after_2$  -- Approval transfers an already occupied slot to the public gallery. In a
  -- historical gallery above twenty the total stock may stay constant, including
  -- when the replaced old version was withdrawn while B was pending.
  PERFORM internal.gallery_assert_photo_capacity(p_object_id,v_previous_usage,greatest(v_previous_published,v_previous_usage));$album_publish_after_2$)
  )),
 ('api.appeal_portal_photo_analysis(uuid,text,uuid)','b4629ccd868f501b2d7006e4b87669b7','9d27522cdf3fb6dd1a54bdff2261ff80',jsonb_build_array(
  jsonb_build_array($album_appeal_before_1$ PERFORM internal.photo_analysis_assert_owner(v_op.object_id,v_op.document_id);
 IF v_op.state NOT IN$album_appeal_before_1$,
   $album_appeal_after_1$ PERFORM internal.photo_analysis_assert_owner(v_op.object_id,v_op.document_id);
 -- The B-only review writer uses this same actor-message -> object order.
 -- A committed appeal through either route wins over a stale tab on the other.
 IF EXISTS(SELECT 1 FROM public.ref_document d
   CROSS JOIN LATERAL jsonb_each(COALESCE(d.extra->'photo_review_appeals','{}')) r
   JOIN public.pending_change pc ON pc.id::text=r.key
   WHERE d.id=v_op.document_id AND pc.object_id=v_op.object_id AND pc.submitted_by=auth.uid()
    AND pc.status='rejected' AND pc.metadata->>'rpc'='publish_portal_photo_additions'
    AND (d.extra->>'slot_pending_change_id' IS NULL OR pc.id::text=d.extra->>'slot_pending_change_id')) THEN
  RAISE EXCEPTION 'Une demande de révision existe déjà pour cette photo.' USING ERRCODE='PT409';
 END IF;
 IF v_op.state NOT IN$album_appeal_after_1$),
  jsonb_build_array($album_appeal_before_2$ v_id:=api.send_portal_message(v_op.object_id,'correction',v_body,'[]'::jsonb,NULL,p_client_id);$album_appeal_before_2$,
   $album_appeal_after_2$ IF EXISTS(SELECT 1 FROM public.crm_interaction c WHERE c.actor_id=v_actor AND c.source='portal'
   AND c.extra->>'portal_client_id'=p_client_id::text
   AND (c.extra->>'portal_photo_analysis_id' IS DISTINCT FROM p_request_id::text
    OR c.extra->>'portal_photo_document_id' IS DISTINCT FROM v_op.document_id::text
    OR c.extra->>'portal_photo_source_sha256' IS DISTINCT FROM v_op.source_sha256)) THEN
  RAISE EXCEPTION 'Identifiant de recours déjà utilisé pour une autre demande.' USING ERRCODE='PT409';
 END IF;
 v_id:=api.send_portal_message(v_op.object_id,'correction',v_body,'[]'::jsonb,NULL,p_client_id);$album_appeal_after_2$)
  )),
 ('api.withdraw_portal_photo(text,uuid)','7a0df026730eec468b58cf13679cd747','a5bc065728bf99e755a77208f40d2eca',jsonb_build_array(
  jsonb_build_array($album_withdraw_before_1$DECLARE v_main boolean; v_next uuid;$album_withdraw_before_1$,
   $album_withdraw_after_1$DECLARE v_main boolean; v_next uuid; v_actor uuid;$album_withdraw_after_1$),
  jsonb_build_array($album_withdraw_before_2$  PERFORM internal.portal_photo_assert_actor(p_object_id);
  PERFORM 1 FROM public.object WHERE id=p_object_id FOR UPDATE;$album_withdraw_before_2$,
   $album_withdraw_after_2$  v_actor:=internal.portal_photo_assert_actor(p_object_id);
  PERFORM internal.portal_photo_assert_writes_open();
  PERFORM 1 FROM public.object WHERE id=p_object_id FOR UPDATE;
  IF internal.portal_photo_assert_actor(p_object_id) IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'Votre accès a changé. Rechargez la fiche.' USING ERRCODE='42501';
  END IF;
  PERFORM internal.portal_photo_assert_writes_open();$album_withdraw_after_2$),
  jsonb_build_array($album_withdraw_before_3$  IF NOT FOUND THEN RAISE EXCEPTION 'Photo inaccessible' USING ERRCODE='42501'; END IF;$album_withdraw_before_3$,
   $album_withdraw_after_3$  IF NOT FOUND THEN RAISE EXCEPTION 'Photo inaccessible' USING ERRCODE='42501'; END IF;
  IF internal.portal_photo_assert_actor(p_object_id) IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'Votre accès a changé. Rechargez la fiche.' USING ERRCODE='42501';
  END IF;$album_withdraw_after_3$)
  )),
 ('internal.gallery_bind_photo_proposal()','d0604c05d4a7dfb454f7d6d5eee2cdbe','0f97bc881ed306ae32fd225655bc719a',jsonb_build_array(
  jsonb_build_array($album_bind_before_1$ v_published:=internal.gallery_published_photo_count(NEW.object_id);
 PERFORM internal.gallery_assert_photo_capacity(NEW.object_id,greatest(20,v_published),v_published);$album_bind_before_1$,
   $album_bind_after_1$ IF COALESCE(NEW.metadata->>'album_stock_usage_before','')!~'^[0-9]+$'
   OR COALESCE(NEW.metadata->>'album_stock_published_before','')!~'^[0-9]+$' THEN
  RAISE EXCEPTION 'Photo stock baseline missing' USING ERRCODE='PT409';
 END IF;
 v_published:=(NEW.metadata->>'album_stock_published_before')::integer;
 PERFORM internal.gallery_assert_photo_capacity(NEW.object_id,(NEW.metadata->>'album_stock_usage_before')::integer,v_published);$album_bind_after_1$)
  )),
 ('api.reserve_portal_photo_upload(text,uuid,uuid)','eeaca66c9f4ad2db53e424fd3e61bfcf','a5fce4c520cbde65eba79ad79606f1b8',jsonb_build_array(
  jsonb_build_array($album_reserve_before_1$ v_actor:=internal.portal_photo_assert_actor(p_object_id);$album_reserve_before_1$,
   $album_reserve_after_1$ v_actor:=internal.portal_photo_assert_actor(p_object_id);
 PERFORM internal.portal_photo_assert_writes_open();$album_reserve_after_1$),
  jsonb_build_array($album_reserve_before_2$ SELECT * INTO v_doc FROM public.ref_document WHERE id=p_upload_id FOR UPDATE;
 IF FOUND THEN$album_reserve_before_2$,
   $album_reserve_after_2$ SELECT * INTO v_doc FROM public.ref_document WHERE id=p_upload_id FOR UPDATE;
 IF internal.portal_photo_assert_actor(p_object_id) IS DISTINCT FROM v_actor THEN
  RAISE EXCEPTION 'Votre accès a changé. Rechargez la fiche.' USING ERRCODE='42501';
 END IF;
 PERFORM internal.portal_photo_assert_writes_open();
 IF v_doc.id IS NOT NULL THEN$album_reserve_after_2$)
  )),
 ('api.cancel_portal_photo_upload(text,uuid)','539a385635e3149c88c5c4359d28fdb6','7e3c23242d2facfa131986db2c6908c7',jsonb_build_array(
  jsonb_build_array($album_cancel_before_1$DECLARE v_doc public.ref_document%ROWTYPE;$album_cancel_before_1$,
   $album_cancel_after_1$DECLARE v_doc public.ref_document%ROWTYPE;v_actor uuid;$album_cancel_after_1$),
  jsonb_build_array($album_cancel_before_2$ PERFORM internal.portal_photo_assert_actor(p_object_id);$album_cancel_before_2$,
   $album_cancel_after_2$ v_actor:=internal.portal_photo_assert_actor(p_object_id);
 PERFORM internal.portal_photo_assert_writes_open();$album_cancel_after_2$),
  jsonb_build_array($album_cancel_before_3$ SELECT * INTO v_doc FROM public.ref_document WHERE id=p_document_id FOR UPDATE;$album_cancel_before_3$,
   $album_cancel_after_3$ SELECT * INTO v_doc FROM public.ref_document WHERE id=p_document_id FOR UPDATE;
 IF internal.portal_photo_assert_actor(p_object_id) IS DISTINCT FROM v_actor THEN
  RAISE EXCEPTION 'Votre accès a changé. Rechargez la fiche.' USING ERRCODE='42501';
 END IF;
 PERFORM internal.portal_photo_assert_writes_open();$album_cancel_after_3$),
  jsonb_build_array($album_cancel_before_4$WHERE a.document_id=p_document_id AND a.created_by=auth.uid())$album_cancel_before_4$,
   $album_cancel_after_4$WHERE a.document_id=p_document_id AND a.created_by=auth.uid() AND a.actor_id=v_actor)$album_cancel_after_4$)
  )),
 ('api.complete_portal_photo_upload(uuid,uuid,text,text,integer,integer)','3162c273e5dbb9a1a5cc473584c0adc8','9547ed89070d14006643207c3b68ab91',jsonb_build_array(
  jsonb_build_array($album_complete_before_1$ PERFORM 1 FROM public.object WHERE id=v_object FOR UPDATE;
 SELECT * INTO v_doc FROM public.ref_document WHERE id=p_document_id FOR UPDATE;$album_complete_before_1$,
   $album_complete_after_1$ PERFORM internal.portal_photo_assert_writes_open();
 PERFORM 1 FROM public.object WHERE id=v_object FOR UPDATE;
 SELECT * INTO v_doc FROM public.ref_document WHERE id=p_document_id FOR UPDATE;
 PERFORM internal.portal_photo_assert_writes_open();$album_complete_after_1$),
  jsonb_build_array($album_complete_before_2$WHERE u.id=p_user_id AND u.role='actor' AND o.id=v_object AND o.object_type<>'ORG'$album_complete_before_2$,
   $album_complete_after_2$WHERE u.id=p_user_id AND u.role='actor' AND o.id=v_object AND o.object_type<>'ORG'
      AND v_doc.storage_bucket='actor-documents'
      AND v_doc.storage_path='portal-photos/'||a.id::text||'/'||p_document_id::text||'.jpg'
      AND EXISTS(SELECT 1 FROM public.actor_document ad WHERE ad.document_id=p_document_id AND ad.actor_id=a.id AND ad.created_by=p_user_id)$album_complete_after_2$),
  jsonb_build_array($album_complete_before_3$ UPDATE public.ref_document SET title=p_title,extra=extra||jsonb_build_object($album_complete_before_3$,
   $album_complete_after_3$ -- A second completion may have passed ready=false before the first committed.
 -- It must not restore the filename over texts edited after that first receipt.
 IF v_doc.extra->>'upload_complete'='true' THEN
  RETURN jsonb_build_object('id',p_document_id,'title',v_doc.title,'width',v_doc.extra->'width','height',v_doc.extra->'height');
 END IF;
 UPDATE public.ref_document SET title=p_title,extra=extra||jsonb_build_object($album_complete_after_3$)
  ))
 ) t(signature,before_hash,target_hash,patches) LOOP
  v_function:=to_regprocedure(v_target.signature);
  IF v_function IS NULL THEN RAISE EXCEPTION 'Actor album: missing %',v_target.signature; END IF;
  SELECT md5(replace(p.prosrc,E'\r\n',E'\n')),replace(pg_get_functiondef(p.oid),E'\r\n',E'\n'),
   jsonb_build_object('owner',p.proowner,'ownerName',pg_get_userbyid(p.proowner),'acl',to_jsonb(p.proacl),
    'config',to_jsonb(p.proconfig),'definer',p.prosecdef,'strict',p.proisstrict,'volatility',p.provolatile,
    'parallel',p.proparallel,'returns',p.prorettype,'set',p.proretset,'args',p.proargtypes::text)
   INTO v_md5,v_definition,v_meta FROM pg_proc p WHERE p.oid=v_function;
  IF v_md5=v_target.target_hash THEN CONTINUE; END IF;
  IF v_md5 IS DISTINCT FROM v_target.before_hash OR v_meta->>'ownerName' IS DISTINCT FROM 'postgres'
    OR v_meta->'definer' IS DISTINCT FROM 'true'::jsonb THEN
   RAISE EXCEPTION 'Actor album: unreviewed source/owner/rights for % (%)',v_target.signature,v_md5;
  END IF;
  FOR v_pair IN SELECT value FROM jsonb_array_elements(v_target.patches) LOOP
   v_old:=v_pair->>0;v_new:=v_pair->>1;
   IF (length(v_definition)-length(replace(v_definition,v_old,'')))/length(v_old)<>1 THEN
    RAISE EXCEPTION 'Actor album: source anchor differs for %',v_target.signature;
   END IF;
   v_definition:=replace(v_definition,v_old,v_new);
  END LOOP;
  EXECUTE v_definition;
  IF (SELECT md5(replace(p.prosrc,E'\r\n',E'\n')) FROM pg_proc p WHERE p.oid=v_function) IS DISTINCT FROM v_target.target_hash
   OR (SELECT jsonb_build_object('owner',p.proowner,'ownerName',pg_get_userbyid(p.proowner),'acl',to_jsonb(p.proacl),
    'config',to_jsonb(p.proconfig),'definer',p.prosecdef,'strict',p.proisstrict,'volatility',p.provolatile,
    'parallel',p.proparallel,'returns',p.prorettype,'set',p.proretset,'args',p.proargtypes::text) FROM pg_proc p WHERE p.oid=v_function)
     IS DISTINCT FROM v_meta THEN
   RAISE EXCEPTION 'Actor album: target source or function attributes differ for %',v_target.signature;
  END IF;
 END LOOP;
END;
$photo_album_sources$;
REVOKE ALL ON FUNCTION api.reorder_portal_photos(text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION api.withdraw_portal_photo(text,uuid),api.reserve_portal_photo_upload(text,uuid,uuid),
 api.cancel_portal_photo_upload(text,uuid),api.complete_portal_photo_upload(uuid,uuid,text,text,integer,integer),
 api.reserve_portal_photo_analysis(text,uuid,uuid),api.start_portal_photo_analysis(uuid,uuid),
 api.appeal_portal_photo_analysis(uuid,text,uuid) FROM PUBLIC,anon,authenticated,service_role;

-- supabase/migrations/20261104161843_partner_photo_refusal_office_private_preview.sql
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

-- Office principal row order: demote before promote, same CAS and receipt
DO $office_main_order$
DECLARE v_oid regprocedure:='api.save_object_gallery(text,jsonb)'::regprocedure;v_def text;v_source text;v_meta jsonb;v_pair jsonb;
BEGIN
 SELECT replace(prosrc,E'\r\n',E'\n'),pg_get_functiondef(oid),
  jsonb_build_object('owner',proowner,'acl',to_jsonb(proacl),'config',to_jsonb(proconfig),'definer',prosecdef)
 INTO v_source,v_def,v_meta FROM pg_proc WHERE oid=v_oid AND prosecdef AND pg_get_userbyid(proowner)='postgres';
 IF md5(v_source)='408ea171ef9ec6c76e0afaaddbb23495' THEN RETURN; END IF;
 IF md5(v_source) IS DISTINCT FROM '9debe21f65823fe57b3d1a5ed3818a5f' THEN RAISE EXCEPTION 'Office gallery source differs'; END IF;
 v_def:=replace(v_def,E'\r\n',E'\n');
 FOR v_pair IN SELECT value FROM jsonb_array_elements(jsonb_build_array(
  jsonb_build_array($old_delete$ FOR v_row IN SELECT value FROM jsonb_array_elements(p_payload->'deleted') LOOP
  IF jsonb_typeof(v_row) IS DISTINCT FROM 'object' OR COALESCE(v_row->>'id','')!~*'^[0-9a-f-]{36}$'
    OR jsonb_typeof(v_row->'expected') IS DISTINCT FROM 'object'
    OR NOT (v_row->'expected' ?& ARRAY['id','updated_at'])
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(v_row) k WHERE k NOT IN ('id','expected')) THEN
   RAISE EXCEPTION 'Suppression de média invalide' USING ERRCODE='22023';
  END IF;
  v_id:=(v_row->>'id')::uuid;
  IF v_id=ANY(v_seen) THEN RAISE EXCEPTION 'Média modifié et supprimé' USING ERRCODE='22023'; END IF;
  v_seen:=array_append(v_seen,v_id);
  SELECT * INTO v_current FROM public.media WHERE id=v_id FOR UPDATE;
  IF NOT FOUND THEN CONTINUE; END IF;
  IF v_current.object_id IS DISTINCT FROM p_object_id OR v_current.place_id IS NOT NULL THEN
   RAISE EXCEPTION 'Média hors de la galerie' USING ERRCODE='42501';
  END IF;
  v_json:=to_jsonb(v_current);
  IF v_row->'expected'->>'id' IS DISTINCT FROM v_id::text OR EXISTS(
     SELECT 1 FROM jsonb_each(v_row->'expected') x WHERE v_json->x.key IS DISTINCT FROM x.value) THEN
   RAISE EXCEPTION 'La galerie a changé. Rechargez-la avant de retirer le média.' USING ERRCODE='PT409';
  END IF;
  DELETE FROM public.media WHERE id=v_id;
 END LOOP;
$old_delete$,''),
  jsonb_build_array($old_rows$ FOR v_row IN SELECT value FROM jsonb_array_elements(p_payload->'rows') LOOP$old_rows$,$new_rows$ FOR v_row IN SELECT value FROM jsonb_array_elements(p_payload->'deleted') LOOP
  IF jsonb_typeof(v_row) IS DISTINCT FROM 'object' OR COALESCE(v_row->>'id','')!~*'^[0-9a-f-]{36}$'
    OR jsonb_typeof(v_row->'expected') IS DISTINCT FROM 'object'
    OR NOT (v_row->'expected' ?& ARRAY['id','updated_at'])
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(v_row) k WHERE k NOT IN ('id','expected')) THEN
   RAISE EXCEPTION 'Suppression de média invalide' USING ERRCODE='22023';
  END IF;
  v_id:=(v_row->>'id')::uuid;
  IF v_id=ANY(v_seen) THEN RAISE EXCEPTION 'Média modifié et supprimé' USING ERRCODE='22023'; END IF;
  v_seen:=array_append(v_seen,v_id);
  SELECT * INTO v_current FROM public.media WHERE id=v_id FOR UPDATE;
  IF NOT FOUND THEN CONTINUE; END IF;
  IF v_current.object_id IS DISTINCT FROM p_object_id OR v_current.place_id IS NOT NULL THEN
   RAISE EXCEPTION 'Média hors de la galerie' USING ERRCODE='42501';
  END IF;
  v_json:=to_jsonb(v_current);
  IF v_row->'expected'->>'id' IS DISTINCT FROM v_id::text OR EXISTS(
     SELECT 1 FROM jsonb_each(v_row->'expected') x WHERE v_json->x.key IS DISTINCT FROM x.value) THEN
   RAISE EXCEPTION 'La galerie a changé. Rechargez-la avant de retirer le média.' USING ERRCODE='PT409';
  END IF;
  DELETE FROM public.media WHERE id=v_id;
 END LOOP;
 -- Explicit demotions must happen before promotions, regardless of client row order.
 -- Keep the original request/receipt unchanged and preserve order within each group.
 FOR v_row IN SELECT item FROM jsonb_array_elements(p_payload->'rows') WITH ORDINALITY incoming(item,n)
  ORDER BY CASE WHEN item->'changes'->'is_main'='false'::jsonb THEN 0 ELSE 1 END,n LOOP$new_rows$))) LOOP
  IF (length(v_def)-length(replace(v_def,v_pair->>0,'')))/length(v_pair->>0)<>1 THEN RAISE EXCEPTION 'Office gallery ordering anchor differs'; END IF;
  v_def:=replace(v_def,v_pair->>0,v_pair->>1);
 END LOOP;
 EXECUTE v_def;
 IF (SELECT md5(replace(prosrc,E'\r\n',E'\n')) FROM pg_proc WHERE oid=v_oid) IS DISTINCT FROM '408ea171ef9ec6c76e0afaaddbb23495'
 OR (SELECT jsonb_build_object('owner',proowner,'acl',to_jsonb(proacl),'config',to_jsonb(proconfig),'definer',prosecdef) FROM pg_proc WHERE oid=v_oid) IS DISTINCT FROM v_meta THEN RAISE EXCEPTION 'Office gallery target/attributes differ'; END IF;
END; $office_main_order$;

REVOKE ALL ON FUNCTION api.send_portal_message(text,text,text,jsonb,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
DO $closed$ BEGIN
 IF internal.portal_photo_actor_writes_enabled() THEN RAISE EXCEPTION 'Actor photo writes must stay closed'; END IF;
 IF (SELECT enabled FROM internal.portal_photo_analysis_settings WHERE singleton) THEN RAISE EXCEPTION 'Photo AI must stay OFF'; END IF;
END; $closed$;
NOTIFY pgrst,'reload schema';

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
  EXECUTE $album_activation_payload$DO $office_writer_pin$ BEGIN
 IF (SELECT md5(replace(prosrc,E'\r\n',E'\n')) FROM pg_proc WHERE oid=to_regprocedure('api.save_object_gallery(text,jsonb)')) IS DISTINCT FROM '408ea171ef9ec6c76e0afaaddbb23495' THEN
  RAISE EXCEPTION 'Install the reviewed office principal-order fix before activation';
 END IF;
END; $office_writer_pin$;
-- GENERATED PHOTO-ONLY LOCK PINS. Requires root coordination and compatible office fallback.
SET LOCAL lock_timeout='500ms';
SET LOCAL statement_timeout='10s';
DO $gate$
BEGIN
 IF to_regprocedure('api.save_object_gallery(text,jsonb)') IS NULL
  OR to_regprocedure('api.reserve_portal_photo_upload(text,uuid,uuid)') IS NULL
  OR to_regprocedure('api.complete_portal_photo_upload(uuid,uuid,text,text,integer,integer)') IS NULL THEN
  RAISE EXCEPTION 'Install the R5 contract before its gallery cutover';
 END IF;
 -- R6 removes the submission/proposal row-lock inversion before photo quota activation.
 IF (SELECT md5(replace(prosrc,E'\r\n',E'\n')) FROM pg_proc
      WHERE oid='api.approve_pending_change(uuid,text,boolean)'::regprocedure) IS DISTINCT FROM '6b397ae9bf5c169c2d84f923b331966e'
   OR (SELECT md5(replace(prosrc,E'\r\n',E'\n')) FROM pg_proc
      WHERE oid='api.reject_pending_change(uuid,text)'::regprocedure) IS DISTINCT FROM '3326541c58555fc8c19b0463d50abc11' THEN
  RAISE EXCEPTION 'R6 submission-first approve/reject paths are required before R5 cutover';
 END IF;
END;
$gate$;
DROP POLICY IF EXISTS gallery_photo_no_direct_insert ON public.media;
CREATE POLICY gallery_photo_no_direct_insert ON public.media AS RESTRICTIVE FOR INSERT TO anon,authenticated
 WITH CHECK(NOT (object_id IS NOT NULL AND place_id IS NULL AND media_type_id IN (
   SELECT id FROM public.ref_code_media_type WHERE code='photo')));
DROP POLICY IF EXISTS gallery_photo_no_direct_update ON public.media;
CREATE POLICY gallery_photo_no_direct_update ON public.media AS RESTRICTIVE FOR UPDATE TO anon,authenticated
 USING(NOT (object_id IS NOT NULL AND place_id IS NULL AND media_type_id IN (
   SELECT id FROM public.ref_code_media_type WHERE code='photo')))
 WITH CHECK(NOT (object_id IS NOT NULL AND place_id IS NULL AND media_type_id IN (
   SELECT id FROM public.ref_code_media_type WHERE code='photo')));
DROP POLICY IF EXISTS gallery_photo_no_direct_delete ON public.media;
CREATE POLICY gallery_photo_no_direct_delete ON public.media AS RESTRICTIVE FOR DELETE TO anon,authenticated
 USING(NOT (object_id IS NOT NULL AND place_id IS NULL AND media_type_id IN (
   SELECT id FROM public.ref_code_media_type WHERE code='photo')));
DROP POLICY IF EXISTS portal_photo_receipt_no_direct_insert ON public.ref_document;
CREATE POLICY portal_photo_receipt_no_direct_insert ON public.ref_document AS RESTRICTIVE FOR INSERT TO anon,authenticated
 WITH CHECK(COALESCE(extra->>'source','')<>'portal_photo');
DROP POLICY IF EXISTS portal_photo_receipt_no_direct_update ON public.ref_document;
CREATE POLICY portal_photo_receipt_no_direct_update ON public.ref_document AS RESTRICTIVE FOR UPDATE TO anon,authenticated
 USING(COALESCE(extra->>'source','')<>'portal_photo') WITH CHECK(COALESCE(extra->>'source','')<>'portal_photo');
DROP POLICY IF EXISTS portal_photo_receipt_no_direct_delete ON public.ref_document;
CREATE POLICY portal_photo_receipt_no_direct_delete ON public.ref_document AS RESTRICTIVE FOR DELETE TO anon,authenticated
 USING(COALESCE(extra->>'source','')<>'portal_photo');
GRANT EXECUTE ON FUNCTION api.reserve_portal_photo_upload(text,uuid,uuid),api.cancel_portal_photo_upload(text,uuid) TO authenticated;
SET LOCAL lock_timeout='500ms';
SET LOCAL statement_timeout='10s';
DO $gate$
DECLARE v record;
BEGIN
 FOR v IN SELECT * FROM (VALUES
  ('api.approve_pending_change(uuid,text,boolean)','6b397ae9bf5c169c2d84f923b331966e'),
  ('api.reject_pending_change(uuid,text)','3326541c58555fc8c19b0463d50abc11'),
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
REVOKE ALL ON FUNCTION internal.portal_photo_actor_writes_enabled() FROM PUBLIC,anon,authenticated,service_role;$album_activation_payload$;
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
