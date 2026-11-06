-- Manual list mail: prepared permit, dispatch CAS, client result receipt.
-- No SMTP in prepare; no receipt creation in dispatch. No quota/retention change.
BEGIN;
DO $guard$
BEGIN
 IF to_regclass('public.object_list') IS NULL OR to_regclass('internal.sandbox_discovery_identity') IS NULL
  OR to_regprocedure('internal.list_sender_authorized(uuid,uuid)') IS NULL
  OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role' AND rolbypassrls)
 THEN RAISE EXCEPTION 'List mail service-role prerequisites are missing'; END IF;
END;
$guard$;
GRANT SELECT,UPDATE ON public.object_list TO service_role;
GRANT SELECT ON internal.sandbox_discovery_identity TO service_role;

-- A pre-existing name is a deployment drift, never silently repaired.
CREATE TABLE internal.list_email_scope (
 user_id uuid NOT NULL,
 list_id uuid NOT NULL REFERENCES public.object_list(id) ON DELETE CASCADE,
 recipient_fingerprint text NOT NULL CHECK(recipient_fingerprint ~ '^[0-9a-f]{64}$'),
 generation bigint NOT NULL DEFAULT 0 CHECK(generation>=0),
 PRIMARY KEY(user_id,list_id,recipient_fingerprint)
);
CREATE INDEX list_email_scope_list ON internal.list_email_scope(list_id);
CREATE TABLE internal.list_email_intent (
 user_id uuid NOT NULL, operation_id uuid NOT NULL,
 list_id uuid NOT NULL REFERENCES public.object_list(id) ON DELETE CASCADE,
 org_object_id text NOT NULL,
 fingerprint text CHECK(fingerprint ~ '^[0-9a-f]{64}$'),
 recipient_fingerprint text CHECK(recipient_fingerprint ~ '^[0-9a-f]{64}$'),
 generation bigint CHECK(generation>0),
 state text NOT NULL DEFAULT 'reserved' CHECK(state IN ('reserved','started','accepted','rejected','unknown','superseded')),
 attempt_token uuid NOT NULL DEFAULT gen_random_uuid(),
 result_token text CHECK(result_token ~ '^[0-9a-f]{64}$'),
 confirmed_previous_operation_ids uuid[] NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), started_at timestamptz,
 accepted_at timestamptz, rejected_at timestamptz, unknown_at timestamptz,
 superseded_at timestamptz, client_received_at timestamptz,
 rejection_code text CHECK(rejection_code IS NULL OR rejection_code IN ('EAUTH','EDNS','ENOTFOUND','EENVELOPE','NOT_CONFIGURED','CONFIG_CHANGED','CONFIG_UNAVAILABLE')),
 tracking_updated boolean NOT NULL DEFAULT false,
 PRIMARY KEY(user_id,operation_id),
 CHECK(state='superseded' OR (fingerprint IS NOT NULL AND recipient_fingerprint IS NOT NULL AND generation IS NOT NULL)),
 CHECK((state IN ('reserved','superseded') AND started_at IS NULL AND accepted_at IS NULL AND rejected_at IS NULL)
  OR (state IN ('started','unknown') AND started_at IS NOT NULL AND accepted_at IS NULL AND rejected_at IS NULL)
  OR (state='accepted' AND started_at IS NOT NULL AND accepted_at IS NOT NULL AND rejected_at IS NULL AND result_token IS NOT NULL)
  OR (state='rejected' AND started_at IS NOT NULL AND rejected_at IS NOT NULL AND accepted_at IS NULL)),
 CHECK(client_received_at IS NULL OR state='accepted')
);
CREATE INDEX list_email_intent_list ON internal.list_email_intent(list_id);
CREATE UNIQUE INDEX list_email_intent_result_token ON internal.list_email_intent(result_token) WHERE result_token IS NOT NULL;
CREATE INDEX list_email_intent_pending ON internal.list_email_intent(user_id,list_id,recipient_fingerprint)
 WHERE state IN ('reserved','started','unknown','accepted') AND client_received_at IS NULL;
CREATE INDEX list_email_intent_parents ON internal.list_email_intent USING gin(confirmed_previous_operation_ids);
CREATE TABLE internal.list_email_metric (
 minute_start timestamptz NOT NULL,user_id uuid NOT NULL,org_object_id text NOT NULL,
 admitted bigint NOT NULL DEFAULT 0 CHECK(admitted>=0),started bigint NOT NULL DEFAULT 0 CHECK(started>=0),
 accepted bigint NOT NULL DEFAULT 0 CHECK(accepted>=0),rejected bigint NOT NULL DEFAULT 0 CHECK(rejected>=0),
 uncertain bigint NOT NULL DEFAULT 0 CHECK(uncertain>=0),conflicts bigint NOT NULL DEFAULT 0 CHECK(conflicts>=0),
 PRIMARY KEY(minute_start,user_id,org_object_id)
);
ALTER TABLE internal.list_email_scope ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal.list_email_intent ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal.list_email_metric ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON internal.list_email_scope,internal.list_email_intent,internal.list_email_metric FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON internal.list_email_scope,internal.list_email_intent,internal.list_email_metric TO service_role;
GRANT USAGE ON SCHEMA internal TO service_role;
COMMENT ON TABLE internal.list_email_intent IS 'Minimal pseudonymous receipts until object_list DELETE; no mailbox, content, provider secret or raw SMTP response. Client ACK is not human reading or recipient delivery.';
COMMENT ON TABLE internal.list_email_metric IS 'Prospective UTC-minute user/ORG counters, not a quota. No list/op/hash/mailbox/content; no new purge or retention period.';

CREATE OR REPLACE FUNCTION internal.measure_list_email(p_user_id uuid,p_org_object_id text,p_event text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,pg_temp AS $fn$
BEGIN
  IF current_user<>'service_role' OR p_user_id IS NULL OR p_org_object_id IS NULL
    OR p_event IS NULL OR p_event NOT IN ('admitted','started','accepted','rejected','uncertain','conflicts') THEN
    RAISE EXCEPTION 'Invalid list mail measurement' USING ERRCODE='42501';
  END IF;
  INSERT INTO internal.list_email_metric(minute_start,user_id,org_object_id,admitted,started,accepted,rejected,uncertain,conflicts)
  VALUES(date_trunc('minute',clock_timestamp(),'UTC'),p_user_id,p_org_object_id,
    (p_event='admitted')::int,(p_event='started')::int,(p_event='accepted')::int,
    (p_event='rejected')::int,(p_event='uncertain')::int,(p_event='conflicts')::int)
  ON CONFLICT (minute_start,user_id,org_object_id) DO UPDATE SET
    admitted=internal.list_email_metric.admitted+EXCLUDED.admitted,
    started=internal.list_email_metric.started+EXCLUDED.started,
    accepted=internal.list_email_metric.accepted+EXCLUDED.accepted,
    rejected=internal.list_email_metric.rejected+EXCLUDED.rejected,
    uncertain=internal.list_email_metric.uncertain+EXCLUDED.uncertain,
    conflicts=internal.list_email_metric.conflicts+EXCLUDED.conflicts;
END;
$fn$;
REVOKE ALL ON FUNCTION internal.measure_list_email(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION internal.measure_list_email(uuid,text,text) TO service_role;

CREATE OR REPLACE FUNCTION api.get_list_email_context(p_user_id uuid,p_list_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE v_generations jsonb;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
 IF NOT COALESCE(internal.list_sender_authorized(p_list_id,p_user_id),false)
  OR EXISTS(SELECT 1 FROM internal.sandbox_discovery_identity WHERE user_id=p_user_id)
 THEN RETURN jsonb_build_object('state','forbidden'); END IF;
 SELECT COALESCE(jsonb_object_agg(s.recipient_fingerprint,s.generation::text),'{}'::jsonb) INTO v_generations
  FROM internal.list_email_scope s WHERE s.user_id=p_user_id AND s.list_id=p_list_id;
 RETURN jsonb_build_object('state','ready','generations',v_generations);
END;
$fn$;

CREATE OR REPLACE FUNCTION api.prepare_list_email(
 p_user_id uuid,p_list_id uuid,p_operation_id uuid,p_fingerprint text,p_recipient_fingerprint text,
 p_expected_generation bigint,p_confirm_resend boolean DEFAULT false,p_confirmed_previous_operation_ids uuid[] DEFAULT '{}'
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE
 v_org text;v_generation bigint;v_confirmed uuid[];v_visible uuid[]:='{}';v_parent uuid;
 r internal.list_email_intent%ROWTYPE;v_current internal.list_email_intent%ROWTYPE;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
 IF p_user_id IS NULL OR p_list_id IS NULL OR p_operation_id IS NULL OR p_expected_generation IS NULL OR p_expected_generation<0
  OR p_fingerprint IS NULL OR p_fingerprint !~ '^[0-9a-f]{64}$' OR p_recipient_fingerprint IS NULL OR p_recipient_fingerprint !~ '^[0-9a-f]{64}$'
  OR p_confirm_resend IS NULL OR p_confirmed_previous_operation_ids IS NULL OR array_ndims(p_confirmed_previous_operation_ids)>1
 THEN RAISE EXCEPTION 'Invalid prepared list mail' USING ERRCODE='22023'; END IF;
 IF array_position(p_confirmed_previous_operation_ids,NULL) IS NOT NULL OR p_operation_id=ANY(p_confirmed_previous_operation_ids)
  OR (cardinality(p_confirmed_previous_operation_ids)>0 AND NOT p_confirm_resend)
 THEN RAISE EXCEPTION 'Invalid predecessor confirmation' USING ERRCODE='22023'; END IF;
 SELECT COALESCE(array_agg(DISTINCT id ORDER BY id),'{}'::uuid[]) INTO v_confirmed FROM unnest(p_confirmed_previous_operation_ids) id;
 SELECT l.org_object_id INTO v_org FROM public.object_list l WHERE l.id=p_list_id FOR UPDATE;
 IF NOT FOUND OR NOT COALESCE(internal.list_sender_authorized(p_list_id,p_user_id),false)
  OR EXISTS(SELECT 1 FROM internal.sandbox_discovery_identity WHERE user_id=p_user_id)
 THEN RETURN jsonb_build_object('state','forbidden'); END IF;
 INSERT INTO internal.list_email_scope(user_id,list_id,recipient_fingerprint) VALUES(p_user_id,p_list_id,p_recipient_fingerprint) ON CONFLICT DO NOTHING;
 SELECT generation INTO v_generation FROM internal.list_email_scope
  WHERE user_id=p_user_id AND list_id=p_list_id AND recipient_fingerprint=p_recipient_fingerprint FOR UPDATE;
 SELECT * INTO v_current FROM internal.list_email_intent WHERE user_id=p_user_id AND operation_id=p_operation_id FOR UPDATE;
 IF FOUND THEN
  IF v_current.state='superseded' OR v_current.list_id<>p_list_id OR v_current.org_object_id<>v_org
   OR v_current.fingerprint IS DISTINCT FROM p_fingerprint OR v_current.recipient_fingerprint IS DISTINCT FROM p_recipient_fingerprint
   OR (v_current.generation-1) IS DISTINCT FROM p_expected_generation
   OR (cardinality(v_confirmed)>0 AND NOT v_current.confirmed_previous_operation_ids @> v_confirmed)
  THEN RETURN jsonb_build_object('state','conflict'); END IF;
  IF v_current.state='reserved' AND v_current.generation<>v_generation THEN RETURN jsonb_build_object('state','stale'); END IF;
  RETURN jsonb_build_object('state',CASE WHEN v_current.state='started' THEN 'unknown' ELSE v_current.state END,
   'operation_id',p_operation_id,'operation_ids',ARRAY[p_operation_id],
   'attempt_token',CASE WHEN v_current.state IN ('reserved','accepted') THEN v_current.attempt_token ELSE NULL END,
   'result_token',v_current.result_token,'tracking_updated',v_current.tracking_updated,'rejection_code',v_current.rejection_code);
 END IF;
 -- The expected counter came from a read-only context captured before the gesture's
 -- first await. An older live tab must never refresh/retry this value automatically.
 IF p_expected_generation<>v_generation THEN RETURN jsonb_build_object('state','stale'); END IF;
 FOR r IN SELECT i.* FROM internal.list_email_intent i WHERE i.user_id=p_user_id AND i.list_id=p_list_id
  AND i.recipient_fingerprint=p_recipient_fingerprint AND i.state IN ('reserved','started','unknown','accepted')
  AND i.client_received_at IS NULL AND NOT EXISTS(
   SELECT 1 FROM internal.list_email_intent replacement WHERE replacement.user_id=i.user_id AND replacement.list_id=i.list_id
    AND replacement.recipient_fingerprint=i.recipient_fingerprint AND replacement.state='accepted' AND replacement.client_received_at IS NOT NULL
    AND replacement.confirmed_previous_operation_ids @> ARRAY[i.operation_id])
  ORDER BY i.operation_id FOR UPDATE
 LOOP
  v_visible:=array_append(v_visible,r.operation_id);
  IF r.unknown_at IS NULL THEN
   UPDATE internal.list_email_intent SET unknown_at=clock_timestamp() WHERE user_id=p_user_id AND operation_id=r.operation_id;
   PERFORM internal.measure_list_email(p_user_id,v_org,'uncertain');
  END IF;
 END LOOP;
 IF cardinality(v_visible)>0 AND NOT p_confirm_resend THEN
  RETURN jsonb_build_object('state','unknown','operation_id',v_visible[1],'operation_ids',v_visible);
 END IF;
 IF p_confirm_resend THEN
  SELECT COALESCE(array_agg(DISTINCT id ORDER BY id),'{}'::uuid[]) INTO v_confirmed FROM unnest(v_confirmed||v_visible) id;
 END IF;
 -- Validate every parent before closing any. Confirmation with no IDs still
 -- closes all visible old reservations at this exact, unrefreshed generation.
 FOREACH v_parent IN ARRAY v_confirmed LOOP
  SELECT * INTO r FROM internal.list_email_intent WHERE user_id=p_user_id AND operation_id=v_parent FOR UPDATE;
  IF FOUND AND (r.list_id<>p_list_id OR (r.recipient_fingerprint IS NOT NULL AND r.recipient_fingerprint<>p_recipient_fingerprint))
  THEN RETURN jsonb_build_object('state','conflict'); END IF;
 END LOOP;
 FOREACH v_parent IN ARRAY v_confirmed LOOP
  UPDATE internal.list_email_intent SET state=CASE WHEN state='reserved' THEN 'superseded' ELSE state END,
   superseded_at=CASE WHEN state IN ('reserved','superseded') THEN COALESCE(superseded_at,clock_timestamp()) ELSE superseded_at END
   WHERE user_id=p_user_id AND operation_id=v_parent;
  IF NOT FOUND THEN
   INSERT INTO internal.list_email_intent(user_id,operation_id,list_id,org_object_id,state,superseded_at)
    VALUES(p_user_id,v_parent,p_list_id,v_org,'superseded',clock_timestamp());
  END IF;
 END LOOP;
 UPDATE internal.list_email_scope SET generation=generation+1
  WHERE user_id=p_user_id AND list_id=p_list_id AND recipient_fingerprint=p_recipient_fingerprint RETURNING generation INTO v_generation;
 INSERT INTO internal.list_email_intent(user_id,operation_id,list_id,org_object_id,fingerprint,recipient_fingerprint,generation,confirmed_previous_operation_ids)
  VALUES(p_user_id,p_operation_id,p_list_id,v_org,p_fingerprint,p_recipient_fingerprint,v_generation,v_confirmed) RETURNING * INTO v_current;
 PERFORM internal.measure_list_email(p_user_id,v_org,'admitted');
 RETURN jsonb_build_object('state','reserved','operation_id',p_operation_id,'attempt_token',v_current.attempt_token);
EXCEPTION WHEN unique_violation THEN
 -- An absent global user/key raced from another list: roll back the entire block.
 RETURN jsonb_build_object('state','conflict');
END;
$fn$;

CREATE OR REPLACE FUNCTION api.begin_list_email(p_user_id uuid,p_list_id uuid,p_operation_id uuid,p_attempt_token uuid,p_fingerprint text,p_recipient_fingerprint text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE v_org text;v_generation bigint;r internal.list_email_intent%ROWTYPE;v_other uuid;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
 SELECT l.org_object_id INTO v_org FROM public.object_list l WHERE l.id=p_list_id FOR UPDATE;
 IF NOT FOUND OR NOT COALESCE(internal.list_sender_authorized(p_list_id,p_user_id),false)
  OR EXISTS(SELECT 1 FROM internal.sandbox_discovery_identity WHERE user_id=p_user_id)
 THEN RETURN jsonb_build_object('started',false,'state','forbidden'); END IF;
 -- Dispatch never inserts a receipt or creates a permit.
 SELECT * INTO r FROM internal.list_email_intent WHERE user_id=p_user_id AND list_id=p_list_id AND operation_id=p_operation_id FOR UPDATE;
 IF NOT FOUND OR p_attempt_token IS NULL OR r.attempt_token<>p_attempt_token OR r.org_object_id<>v_org OR r.state='superseded'
  OR r.fingerprint IS DISTINCT FROM p_fingerprint OR r.recipient_fingerprint IS DISTINCT FROM p_recipient_fingerprint
 THEN RETURN jsonb_build_object('started',false,'state','conflict'); END IF;
 IF r.state<>'reserved' THEN RETURN jsonb_build_object('started',false,'state',CASE WHEN r.state='started' THEN 'unknown' ELSE r.state END,
  'operation_id',p_operation_id,'operation_ids',ARRAY[p_operation_id],'result_token',r.result_token,'tracking_updated',r.tracking_updated,'rejection_code',r.rejection_code); END IF;
 SELECT generation INTO v_generation FROM internal.list_email_scope
  WHERE user_id=p_user_id AND list_id=p_list_id AND recipient_fingerprint=r.recipient_fingerprint;
 IF v_generation IS DISTINCT FROM r.generation THEN RETURN jsonb_build_object('started',false,'state','stale'); END IF;
 SELECT i.operation_id INTO v_other FROM internal.list_email_intent i WHERE i.user_id=p_user_id AND i.list_id=p_list_id
  AND i.recipient_fingerprint=r.recipient_fingerprint AND i.operation_id<>p_operation_id AND i.state IN ('reserved','started','unknown','accepted')
  AND i.client_received_at IS NULL AND NOT(i.operation_id=ANY(r.confirmed_previous_operation_ids))
  AND NOT EXISTS(SELECT 1 FROM internal.list_email_intent replacement WHERE replacement.user_id=i.user_id AND replacement.list_id=i.list_id
    AND replacement.recipient_fingerprint=i.recipient_fingerprint AND replacement.state='accepted' AND replacement.client_received_at IS NOT NULL
    AND replacement.confirmed_previous_operation_ids @> ARRAY[i.operation_id])
  ORDER BY i.operation_id LIMIT 1 FOR UPDATE;
 IF FOUND THEN RETURN jsonb_build_object('started',false,'state','unknown','operation_id',v_other,'operation_ids',ARRAY[v_other]); END IF;
 UPDATE internal.list_email_intent SET state='started',started_at=clock_timestamp() WHERE user_id=p_user_id AND operation_id=p_operation_id;
 PERFORM internal.measure_list_email(p_user_id,v_org,'started');
 RETURN jsonb_build_object('started',true);
END;
$fn$;

CREATE OR REPLACE FUNCTION api.complete_list_email(p_user_id uuid,p_list_id uuid,p_operation_id uuid,p_attempt_token uuid,p_outcome text,
 p_tracking_updated boolean DEFAULT false,p_rejection_code text DEFAULT NULL,p_result_token text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE r internal.list_email_intent%ROWTYPE;v_now timestamptz;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
 IF p_outcome IS NULL OR p_outcome NOT IN ('accepted','rejected','unknown')
  OR (p_outcome='accepted' AND (p_result_token IS NULL OR p_result_token !~ '^[0-9a-f]{64}$'))
  OR (p_outcome='rejected' AND (p_rejection_code IS NULL OR p_rejection_code NOT IN ('EAUTH','EDNS','ENOTFOUND','EENVELOPE','NOT_CONFIGURED','CONFIG_CHANGED','CONFIG_UNAVAILABLE')))
 THEN RAISE EXCEPTION 'Invalid list mail outcome' USING ERRCODE='22023'; END IF;
 -- Exact pre-authorized permit records a real outcome even after revocation.
 SELECT * INTO r FROM internal.list_email_intent WHERE user_id=p_user_id AND list_id=p_list_id AND operation_id=p_operation_id FOR UPDATE;
 IF NOT FOUND OR p_attempt_token IS NULL OR r.attempt_token<>p_attempt_token THEN RETURN false; END IF;
 IF r.state IN ('accepted','rejected') THEN RETURN r.state=p_outcome AND (p_outcome<>'accepted' OR r.result_token=p_result_token); END IF;
 IF r.state NOT IN ('started','unknown') THEN RETURN false; END IF;
 v_now:=clock_timestamp();
 UPDATE internal.list_email_intent SET state=p_outcome,
  accepted_at=CASE WHEN p_outcome='accepted' THEN v_now ELSE NULL END,rejected_at=CASE WHEN p_outcome='rejected' THEN v_now ELSE NULL END,
  unknown_at=CASE WHEN p_outcome='unknown' THEN COALESCE(unknown_at,v_now) ELSE unknown_at END,
  result_token=CASE WHEN p_outcome='accepted' THEN p_result_token ELSE NULL END,
  rejection_code=CASE WHEN p_outcome='rejected' THEN p_rejection_code ELSE NULL END,
  tracking_updated=CASE WHEN p_outcome='accepted' THEN COALESCE(p_tracking_updated,false) ELSE false END
  WHERE user_id=p_user_id AND operation_id=p_operation_id;
 IF p_outcome='unknown' AND r.unknown_at IS NULL THEN PERFORM internal.measure_list_email(p_user_id,r.org_object_id,'uncertain');
 ELSIF p_outcome<>'unknown' THEN PERFORM internal.measure_list_email(p_user_id,r.org_object_id,p_outcome); END IF;
 RETURN true;
END;
$fn$;

CREATE OR REPLACE FUNCTION api.ack_list_email_client(p_user_id uuid,p_list_id uuid,p_operation_id uuid,p_result_token text)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE r internal.list_email_intent%ROWTYPE;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM internal.list_email_intent WHERE user_id=p_user_id AND list_id=p_list_id AND operation_id=p_operation_id FOR UPDATE;
 IF NOT FOUND OR r.state<>'accepted' OR p_result_token IS NULL OR p_result_token !~ '^[0-9a-f]{64}$' OR r.result_token IS DISTINCT FROM p_result_token THEN RETURN false; END IF;
 -- Result proof is HEX64 delivered only after SMTP success, never the UUID permit.
 -- ACK touches exactly this accepted receipt, no parent/other intent or generation.
 UPDATE internal.list_email_intent SET client_received_at=COALESCE(client_received_at,clock_timestamp())
  WHERE user_id=p_user_id AND operation_id=p_operation_id;
 RETURN true;
END;
$fn$;

CREATE OR REPLACE FUNCTION api.list_email_measurements(p_from timestamptz,p_until timestamptz)
RETURNS TABLE(minute_start timestamptz,user_id uuid,org_object_id text,admitted bigint,started bigint,accepted bigint,rejected bigint,uncertain bigint,conflicts bigint)
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $fn$
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
 IF p_from IS NULL OR p_until IS NULL OR NOT isfinite(p_from) OR NOT isfinite(p_until) OR p_from>=p_until
  OR p_from<>date_trunc('minute',p_from,'UTC') OR p_until<>date_trunc('minute',p_until,'UTC') THEN RAISE EXCEPTION 'Finite UTC-minute bounds required' USING ERRCODE='22023'; END IF;
 RETURN QUERY SELECT m.minute_start,m.user_id,m.org_object_id,m.admitted,m.started,m.accepted,m.rejected,m.uncertain,m.conflicts
  FROM internal.list_email_metric m WHERE m.minute_start>=p_from AND m.minute_start<p_until ORDER BY m.minute_start,m.org_object_id,m.user_id;
END;
$fn$;

REVOKE ALL ON FUNCTION api.get_list_email_context(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION api.get_list_email_context(uuid,uuid) TO service_role;
REVOKE ALL ON FUNCTION api.prepare_list_email(uuid,uuid,uuid,text,text,bigint,boolean,uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION api.prepare_list_email(uuid,uuid,uuid,text,text,bigint,boolean,uuid[]) TO service_role;
REVOKE ALL ON FUNCTION api.begin_list_email(uuid,uuid,uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION api.begin_list_email(uuid,uuid,uuid,uuid,text,text) TO service_role;
REVOKE ALL ON FUNCTION api.complete_list_email(uuid,uuid,uuid,uuid,text,boolean,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION api.complete_list_email(uuid,uuid,uuid,uuid,text,boolean,text,text) TO service_role;
REVOKE ALL ON FUNCTION api.ack_list_email_client(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION api.ack_list_email_client(uuid,uuid,uuid,text) TO service_role;
REVOKE ALL ON FUNCTION api.list_email_measurements(timestamptz,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION api.list_email_measurements(timestamptz,timestamptz) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
