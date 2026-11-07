BEGIN;

-- Each claim owns a distinct public Storage key. Existing media URLs are untouched.
CREATE OR REPLACE FUNCTION api.prepare_portal_photo_approval(p_id uuid,p_batch boolean,p_claim_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,api,internal AS $function$
DECLARE v_object text; v_submission uuid; v_pc public.pending_change%ROWTYPE; v_item jsonb; v_doc public.ref_document%ROWTYPE; v_docs jsonb:='[]';
BEGIN
  IF p_claim_id IS NULL THEN RAISE EXCEPTION 'Réservation manquante' USING ERRCODE='22023'; END IF;
  IF p_batch THEN SELECT object_id INTO v_object FROM public.fiche_submission WHERE id=p_id;
  ELSE SELECT object_id INTO v_object FROM public.pending_change WHERE id=p_id; END IF;
  IF v_object IS NULL OR api.is_actor_persona() OR NOT COALESCE(api.user_can_moderate_object(v_object),false) THEN
    RAISE EXCEPTION 'Droits de relecture insuffisants' USING ERRCODE='42501';
  END IF;
  -- Submission -> all selected proposal rows -> object -> receipts.
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
  PERFORM 1 FROM public.object WHERE id=v_object FOR UPDATE;
  FOR v_pc IN SELECT * FROM public.pending_change WHERE object_id=v_object AND status='pending'
      AND ((p_batch AND submission_id=p_id) OR (NOT p_batch AND id=p_id))
      AND metadata->>'rpc'='publish_portal_photo_additions' AND submission_id IS NOT NULL ORDER BY submitted_at,id LOOP
    PERFORM internal.validate_portal_photo_additions(v_object,v_pc.payload,v_pc.submitted_by);
    FOR v_item IN SELECT value FROM jsonb_array_elements(v_pc.payload->'additions') LOOP
      SELECT * INTO v_doc FROM public.ref_document WHERE id=(v_item->>'upload_id')::uuid FOR UPDATE;
      IF NULLIF(v_doc.extra->>'approval_claim_id','') IS NOT NULL AND (v_doc.extra->>'approval_claim_until')::timestamptz>now() THEN
        RAISE EXCEPTION 'Une validation est déjà en cours. Réessayez dans quelques minutes.' USING ERRCODE='PT409';
      END IF;
      UPDATE public.ref_document SET extra=extra||jsonb_build_object('approval_claim_id',p_claim_id,'approval_claim_by',auth.uid(),
        'approval_claim_until',now()+interval '15 minutes','publication_ready',false) WHERE id=v_doc.id;
      v_docs:=v_docs||jsonb_build_array(jsonb_build_object('id',v_doc.id,'bucket',v_doc.storage_bucket,'path',v_doc.storage_path,'publicPath','portal-approved/'||v_doc.id::text||'/'||p_claim_id::text||'.jpg'));
    END LOOP;
  END LOOP;
  IF jsonb_array_length(v_docs)=0 AND NOT EXISTS(SELECT 1 FROM public.pending_change pc WHERE pc.object_id=v_object
    AND ((p_batch AND pc.submission_id=p_id) OR (NOT p_batch AND pc.id=p_id)) AND pc.metadata->>'rpc'='publish_portal_photo_additions' AND pc.status='applied') THEN
    RAISE EXCEPTION 'Aucune photo à valider' USING ERRCODE='22023';
  END IF;
  RETURN jsonb_build_object('objectId',v_object,'documents',v_docs,'alreadyApplied',jsonb_array_length(v_docs)=0);
END $function$;

CREATE OR REPLACE FUNCTION api.portal_photo_failed_approval(p_claim_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE v_paths jsonb;
BEGIN
  -- A candidate read before a publisher commits is insufficient. Only the
  -- claim invalidated by this statement can authorize a Storage DELETE.
  WITH invalidated AS (
    UPDATE public.ref_document d
      SET extra=extra-ARRAY['approval_claim_id','approval_claim_by','approval_claim_until','public_url']::text[]
        ||'{"publication_ready":false}'::jsonb
      WHERE d.extra->>'approval_claim_id'=p_claim_id::text AND d.extra->>'source'='portal_photo'
        AND d.extra->>'published_media_id' IS NULL
        AND NOT EXISTS(SELECT 1 FROM public.media m WHERE m.extra->>'portal_document_id'=d.id::text)
      RETURNING d.id
  )
  SELECT COALESCE(jsonb_agg('portal-approved/'||id::text||'/'||p_claim_id::text||'.jpg' ORDER BY id),'[]'::jsonb)
    INTO v_paths FROM invalidated;
  RETURN v_paths;
END $function$;

COMMIT;
