-- Actor album integration. No object/photo is normalized by installing this file.
-- Apply AFTER R5, R6 and P. New writes stay closed until the explicit actor cutover.
-- This is a private portal contract; the prestataire JSON readers are unchanged.
BEGIN;
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

-- One domain-only gate also closes the media branch of the shared B submission
-- without denying other fiche changes or CRM. Only reviewed cutover SQL changes it.
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

-- The caller can only edit two French texts. All file/proof/claim/status fields
-- and translations in other languages stay server-owned and untouched.
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

-- Human B refusals must remain appealable when P is OFF or has no receipt.
-- Keep the free text only in the existing CRM conversation; no photo/P copy.
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

-- AFTER INSERT must compare with the real stock before insertion, including an
-- already reserved replacement whose old public version has just been withdrawn.
-- Capture is server-owned and serialized by the same object lock as R5. A client
-- supplied ceiling is always overwritten; the existing AFTER trigger still checks
-- the actual state after the proposal/receipt binding has been written.
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
-- New writers deliberately remain closed. The explicit cutover also closes the
-- older order RPC which cannot distinguish two concurrent permutations.

-- Source-aligned changes to B text transport / actor gate follow below.
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

-- The previous writer has no expected order; it cannot be left open beside CAS.
-- Historical tests run against its historical contract BEFORE this migration.
REVOKE ALL ON FUNCTION api.reorder_portal_photos(text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION api.withdraw_portal_photo(text,uuid),api.reserve_portal_photo_upload(text,uuid,uuid),
 api.cancel_portal_photo_upload(text,uuid),api.complete_portal_photo_upload(uuid,uuid,text,text,integer,integer),
 api.reserve_portal_photo_analysis(text,uuid,uuid),api.start_portal_photo_analysis(uuid,uuid),
 api.appeal_portal_photo_analysis(uuid,text,uuid) FROM PUBLIC,anon,authenticated,service_role;

NOTIFY pgrst,'reload schema';
COMMIT;
