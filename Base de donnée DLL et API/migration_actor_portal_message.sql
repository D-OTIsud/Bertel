-- Portail partenaire, lot 3. Pièces privées dans la bibliothèque acteur existante :
-- même stockage, mêmes droits CRM et même parcours RGPD, jamais d'URL publique.
BEGIN;

INSERT INTO public.ref_code(domain,code,name) VALUES
  ('demand_topic','conseils','Conseils'),
  ('demand_topic','evenement_nouveaute','Événement ou nouveauté')
ON CONFLICT (domain,code) DO NOTHING;

ALTER TABLE public.app_notification DROP CONSTRAINT chk_app_notification_kind;
ALTER TABLE public.app_notification ADD CONSTRAINT chk_app_notification_kind CHECK
  (kind IN ('crm_task_assigned','fiche_submission_reviewed','list_feature_requested','pending_change_submitted','portal_message'));

CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_portal_client_message
  ON public.crm_interaction(actor_id,(extra->>'portal_client_id'))
  WHERE source='portal' AND extra->>'portal_client_id' IS NOT NULL;

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

REVOKE ALL ON FUNCTION api.portal_message_upload_context(text),api.send_portal_message(text,text,text,jsonb,text,uuid),
  api.portal_message_document(uuid),api.list_portal_message_documents(uuid),api.list_my_portal_messages(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION api.portal_message_upload_context(text),api.send_portal_message(text,text,text,jsonb,text,uuid),
  api.portal_message_document(uuid),api.list_portal_message_documents(uuid),api.list_my_portal_messages(text) TO authenticated;

-- Les deux fonctions d'outbox ci-dessous sont basées sur la version vive de septembre,
-- empreintes avant modification : claim 44089157dd6aa1c659175001817c8440,
-- ack 748c4e5dec488f1d46f5a548983ab575. Aucun changement aux trois genres existants.

CREATE OR REPLACE FUNCTION api.claim_unmailed_notifications(p_limit integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'api', 'internal', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_rows jsonb;
BEGIN
  WITH claimable AS (
    SELECT n.id
    FROM app_notification n
    WHERE n.kind IN ('crm_task_assigned', 'fiche_submission_reviewed', 'pending_change_submitted', 'portal_message')
      AND (n.kind <> 'pending_change_submitted' OR (
        n.recipient_id IS DISTINCT FROM n.created_by
        AND internal.user_can_moderate_pending_object(n.recipient_id, n.payload->>'object_id')
        AND internal.pending_change_notification_is_open(n.payload->>'object_id', n.created_by)
      ))
      AND n.email_sent_at IS NULL
      AND n.email_attempts < 5
      AND (n.email_claimed_at IS NULL OR n.email_claimed_at < now() - interval '10 minutes')
    ORDER BY n.created_at
    LIMIT GREATEST(COALESCE(p_limit, 20), 1)
    FOR UPDATE SKIP LOCKED
  ), claimed AS (
    UPDATE app_notification n SET email_claimed_at = now()
    FROM claimable c WHERE n.id = c.id
    RETURNING n.id, n.recipient_id, n.task_id, n.created_by, n.created_at, n.kind, n.payload
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'notification_id', cl.id,
           'kind', cl.kind,
           'recipient_email', NULLIF(u.email, ''),
           'recipient_name', api.crm_user_label(cl.recipient_id, rp.display_name),
           'task_title', ct.title,
           'object_name', o.name,
           'object_id', CASE WHEN cl.kind IN ('pending_change_submitted','portal_message') THEN cl.payload->>'object_id' ELSE ct.object_id END,
           'due_at', ct.due_at,
           'assigner_name', api.crm_user_label(cl.created_by, ap.display_name),
           -- ct.created_by is the immutable task author. cl.created_by is instead
           -- the latest assigner/reviewer and must never determine this sender.
           'creator_email', CASE WHEN cl.kind = 'crm_task_assigned'
             THEN NULLIF(btrim(cu.email), '') END,
           'creator_name', CASE WHEN cl.kind = 'crm_task_assigned'
             THEN api.crm_user_label(ct.created_by, cp.display_name) END,
           'outcome', (cl.payload->>'outcome'),
           'submission_id', (cl.payload->>'submission_id'),
           'pending_change_id', (cl.payload->>'pending_change_id'),
           'interaction_id', (cl.payload->>'interaction_id'),
           'actor_id', (cl.payload->>'actor_id')
         ) ORDER BY cl.created_at, cl.id), '[]'::jsonb)
  INTO v_rows
  FROM claimed cl
  LEFT JOIN auth.users u        ON u.id  = cl.recipient_id
  LEFT JOIN app_user_profile rp ON rp.id = cl.recipient_id
  LEFT JOIN crm_task ct         ON ct.id = cl.task_id
  LEFT JOIN object o            ON o.id  = CASE WHEN cl.kind IN ('pending_change_submitted','portal_message') THEN cl.payload->>'object_id' ELSE ct.object_id END
  LEFT JOIN app_user_profile ap ON ap.id = cl.created_by
  LEFT JOIN auth.users cu       ON cu.id = ct.created_by
  LEFT JOIN app_user_profile cp ON cp.id = ct.created_by;

  -- Destinataire sans e-mail : terminée, pas retournée.
  UPDATE app_notification n
  SET email_sent_at = now(), email_error = 'no_recipient_email'
  WHERE n.id IN (
    SELECT (item->>'notification_id')::uuid
    FROM jsonb_array_elements(v_rows) item
    WHERE item->>'recipient_email' IS NULL
  );

  RETURN COALESCE((
    SELECT jsonb_agg(item)
    FROM jsonb_array_elements(v_rows) item
    WHERE item->>'recipient_email' IS NOT NULL
  ), '[]'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION api.mark_notifications_emailed(p_sent uuid[], p_failed jsonb DEFAULT '[]'::jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'api', 'internal', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_n integer := 0;
BEGIN
  UPDATE app_notification SET email_sent_at = now(), email_error = NULL
  WHERE id = ANY(COALESCE(p_sent, ARRAY[]::uuid[]))
    AND kind IN ('crm_task_assigned', 'fiche_submission_reviewed', 'pending_change_submitted', 'portal_message') AND email_sent_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  UPDATE app_notification n
  SET email_error = f.err, email_claimed_at = NULL, email_attempts = n.email_attempts + 1
  FROM (
    SELECT (item->>'id')::uuid AS id, COALESCE(item->>'error', 'send_failed') AS err
    FROM jsonb_array_elements(COALESCE(p_failed, '[]'::jsonb)) item
    WHERE item->>'id' IS NOT NULL
  ) f
  WHERE n.id = f.id
    AND n.kind IN ('crm_task_assigned', 'fiche_submission_reviewed', 'pending_change_submitted', 'portal_message')
    AND n.email_sent_at IS NULL;

  RETURN v_n;
END;
$function$;
REVOKE ALL ON FUNCTION api.claim_unmailed_notifications(integer),api.mark_notifications_emailed(uuid[],jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION api.claim_unmailed_notifications(integer),api.mark_notifications_emailed(uuid[],jsonb) TO service_role;

COMMIT;
NOTIFY pgrst,'reload schema';
