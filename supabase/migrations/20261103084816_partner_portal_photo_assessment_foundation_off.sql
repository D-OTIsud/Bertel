-- P foundation OFF. No provider, budget, threshold or automatic publication is enabled.
BEGIN;
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
-- Full FK indexes support erasure/cascades/SET NULL, including unavailable rows.
-- actor_id is already the leading key of actor_day. Settings has at most one row.
CREATE INDEX portal_photo_analysis_object ON internal.portal_photo_analysis(object_id);
CREATE INDEX portal_photo_analysis_document ON internal.portal_photo_analysis(document_id);
CREATE INDEX portal_photo_analysis_creator ON internal.portal_photo_analysis(created_by);
CREATE INDEX portal_photo_analysis_provider ON internal.portal_photo_analysis(provider_id);
CREATE INDEX portal_photo_analysis_appeal ON internal.portal_photo_analysis(appeal_interaction_id);
-- One result or unconfirmed provider attempt per unchanged private photo/version.
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
 ELSIF v_op.appeal_interaction_id IS NULL OR NOT api.can_read_object_for_correction(v_op.object_id) THEN RAISE EXCEPTION 'Analyse inaccessible' USING ERRCODE='42501'; END IF;
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


-- Extend the existing private preview only for a concrete human appeal. Keep all
-- actor/B rights and the prepared function's attributes exactly as reviewed.
DO $photo_analysis_appeal_preview$
DECLARE v_function regprocedure:='api.portal_photo_preview(uuid)'::regprocedure;v_hash text;v_definition text;v_meta jsonb;
 v_before text:=$preview_before$      OR (NOT api.is_actor_persona() AND api.user_can_moderate_object(v_doc.extra->>'object_id')$preview_before$;
 v_after text:=$preview_after$      OR (api.can_read_object_for_correction(v_doc.extra->>'object_id')
        AND EXISTS(SELECT 1 FROM internal.portal_photo_analysis a WHERE a.document_id=v_doc.id
          AND a.object_id=v_doc.extra->>'object_id' AND a.source_sha256=v_doc.extra->>'upload_sha256' AND a.appeal_interaction_id IS NOT NULL))
      OR (NOT api.is_actor_persona() AND api.user_can_moderate_object(v_doc.extra->>'object_id')$preview_after$;
BEGIN
 SELECT md5(replace(p.prosrc,E'\r\n',E'\n')),pg_get_functiondef(p.oid),jsonb_build_object('owner',p.proowner,'acl',to_jsonb(p.proacl),'config',to_jsonb(p.proconfig),'definer',p.prosecdef,'strict',p.proisstrict,'volatility',p.provolatile,'parallel',p.proparallel,'returns',p.prorettype,'set',p.proretset,'args',p.proargtypes::text)
 INTO v_hash,v_definition,v_meta FROM pg_proc p WHERE p.oid=v_function;
 IF v_hash='3b9fef4e878d9886d935a3edae319739' THEN RETURN; END IF;
 IF v_hash IS DISTINCT FROM 'a4f9168e03b8821e0bbf240675576727' THEN RAISE EXCEPTION 'P: unreviewed private photo preview source %',v_hash; END IF;
 v_definition:=replace(v_definition,E'\r\n',E'\n');
 IF (length(v_definition)-length(replace(v_definition,v_before,'')))/length(v_before)<>1 THEN RAISE EXCEPTION 'P: preview authorization anchor differs'; END IF;
 EXECUTE replace(v_definition,v_before,v_after);
 IF (SELECT md5(replace(prosrc,E'\r\n',E'\n')) FROM pg_proc WHERE oid=v_function) IS DISTINCT FROM '3b9fef4e878d9886d935a3edae319739'
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
NOTIFY pgrst,'reload schema';
COMMIT;
