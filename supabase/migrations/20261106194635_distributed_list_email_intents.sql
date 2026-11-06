-- Manual list mail: distributed intention receipts and measurement, not a quota.
-- No mailbox, subject, body, provider secret or arbitrary retention period.
BEGIN;

DO $guard$
BEGIN
  IF to_regclass('public.object_list') IS NULL
    OR to_regclass('internal.sandbox_discovery_identity') IS NULL
    OR to_regprocedure('internal.list_sender_authorized(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'List mail prerequisites are missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role' AND rolbypassrls) THEN
    RAISE EXCEPTION 'List mail requires the real service role with BYPASSRLS';
  END IF;
END;
$guard$;

-- These invoker RPCs never run as an ordinary caller. Explicit table privileges
-- are prerequisites for their row locks/current sandbox check; no app role gains access.
GRANT SELECT,UPDATE ON public.object_list TO service_role;
GRANT SELECT ON internal.sandbox_discovery_identity TO service_role;

-- A pre-existing name is a deployment drift, not a schema to silently accept/repair.
CREATE TABLE internal.list_email_intent (
  user_id uuid NOT NULL,
  operation_id uuid NOT NULL,
  list_id uuid NOT NULL REFERENCES public.object_list(id) ON DELETE CASCADE,
  org_object_id text NOT NULL,
  fingerprint text CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
  recipient_fingerprint text CHECK (recipient_fingerprint ~ '^[0-9a-f]{64}$'),
  state text NOT NULL DEFAULT 'reserved' CHECK (state IN ('reserved','started','accepted','rejected','unknown','superseded')),
  attempt_token uuid NOT NULL DEFAULT gen_random_uuid(),
  confirmed_previous_operation_id uuid,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  started_at timestamptz,
  accepted_at timestamptz,
  rejected_at timestamptz,
  unknown_at timestamptz,
  resend_acknowledged_at timestamptz,
  rejection_code text CHECK (rejection_code IS NULL OR rejection_code IN ('EAUTH','EDNS','ENOTFOUND','EENVELOPE','NOT_CONFIGURED','CONFIG_CHANGED','CONFIG_UNAVAILABLE')),
  tracking_updated boolean NOT NULL DEFAULT false,
  PRIMARY KEY (user_id, operation_id),
  CHECK (state='superseded' OR (fingerprint IS NOT NULL AND recipient_fingerprint IS NOT NULL)),
  CHECK ((state IN ('reserved','superseded') AND started_at IS NULL AND accepted_at IS NULL AND rejected_at IS NULL)
    OR (state IN ('started','unknown') AND started_at IS NOT NULL AND accepted_at IS NULL AND rejected_at IS NULL)
    OR (state='accepted' AND started_at IS NOT NULL AND accepted_at IS NOT NULL AND rejected_at IS NULL)
    OR (state='rejected' AND started_at IS NOT NULL AND rejected_at IS NOT NULL AND accepted_at IS NULL))
);
CREATE INDEX list_email_intent_list ON internal.list_email_intent(list_id);
CREATE INDEX list_email_intent_uncertain ON internal.list_email_intent
  (list_id,user_id,recipient_fingerprint,created_at DESC,operation_id)
  WHERE state IN ('started','unknown') AND resend_acknowledged_at IS NULL;
ALTER TABLE internal.list_email_intent ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON internal.list_email_intent FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON internal.list_email_intent TO service_role;
COMMENT ON TABLE internal.list_email_intent IS
  'Minimal pseudonymized manual-mail receipts until the referenced object_list is physically deleted. Archive, logout and owner departure do not remove them. No automatic retry of started/unknown.';

CREATE TABLE internal.list_email_metric (
  minute_start timestamptz NOT NULL,
  user_id uuid NOT NULL,
  org_object_id text NOT NULL,
  admitted bigint NOT NULL DEFAULT 0 CHECK (admitted>=0),
  started bigint NOT NULL DEFAULT 0 CHECK (started>=0),
  accepted bigint NOT NULL DEFAULT 0 CHECK (accepted>=0),
  rejected bigint NOT NULL DEFAULT 0 CHECK (rejected>=0),
  uncertain bigint NOT NULL DEFAULT 0 CHECK (uncertain>=0),
  conflicts bigint NOT NULL DEFAULT 0 CHECK (conflicts>=0),
  PRIMARY KEY (minute_start,user_id,org_object_id)
);
ALTER TABLE internal.list_email_metric ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON internal.list_email_metric FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON internal.list_email_metric TO service_role;
GRANT USAGE ON SCHEMA internal TO service_role;
COMMENT ON TABLE internal.list_email_metric IS
  'UTC-minute aggregate measurement only, no limit. User/ORG/counts only: no list, operation, fingerprint, mailbox or content. No new purge or retention period is introduced. Relay acceptance is not end-recipient delivery.';

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

CREATE OR REPLACE FUNCTION api.claim_list_email(
  p_user_id uuid,p_list_id uuid,p_operation_id uuid,p_fingerprint text,p_recipient_fingerprint text,
  p_confirmed_previous_operation_id uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE
  v_org text;
  v_receipt internal.list_email_intent%ROWTYPE;
  v_previous internal.list_email_intent%ROWTYPE;
BEGIN
  IF current_user<>'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
  IF p_user_id IS NULL OR p_list_id IS NULL OR p_operation_id IS NULL
    OR p_fingerprint IS NULL OR p_fingerprint !~ '^[0-9a-f]{64}$'
    OR p_recipient_fingerprint IS NULL OR p_recipient_fingerprint !~ '^[0-9a-f]{64}$'
    OR p_confirmed_previous_operation_id=p_operation_id THEN
    RAISE EXCEPTION 'Invalid list mail intention' USING ERRCODE='22023';
  END IF;

  -- List first, receipt second: same order as list deletion/cascade. This also
  -- serializes the outstanding-uncertainty check across different operation IDs.
  SELECT l.org_object_id INTO v_org FROM public.object_list l WHERE l.id=p_list_id FOR UPDATE;
  IF NOT FOUND OR NOT COALESCE(internal.list_sender_authorized(p_list_id,p_user_id),false)
    OR EXISTS(SELECT 1 FROM internal.sandbox_discovery_identity d WHERE d.user_id=p_user_id) THEN
    RETURN jsonb_build_object('state','forbidden');
  END IF;
  SELECT r.* INTO v_receipt FROM internal.list_email_intent r
    WHERE r.user_id=p_user_id AND r.operation_id=p_operation_id FOR UPDATE;
  IF FOUND THEN
    IF v_receipt.state='superseded' THEN RETURN jsonb_build_object('state','conflict'); END IF;
    IF v_receipt.list_id<>p_list_id OR v_receipt.org_object_id<>v_org
      OR v_receipt.fingerprint<>p_fingerprint OR v_receipt.recipient_fingerprint<>p_recipient_fingerprint THEN
      PERFORM internal.measure_list_email(p_user_id,v_org,'conflicts');
      RETURN jsonb_build_object('state','conflict');
    END IF;
    IF v_receipt.state='started' THEN
      UPDATE internal.list_email_intent SET state='unknown',unknown_at=COALESCE(unknown_at,clock_timestamp())
        WHERE user_id=p_user_id AND operation_id=p_operation_id;
      IF v_receipt.unknown_at IS NULL THEN PERFORM internal.measure_list_email(p_user_id,v_org,'uncertain'); END IF;
      v_receipt.state:='unknown';
    END IF;
    RETURN jsonb_build_object('state',v_receipt.state,'operation_id',p_operation_id,
      'attempt_token',CASE WHEN v_receipt.state='reserved' THEN v_receipt.attempt_token ELSE NULL END,
      'tracking_updated',v_receipt.tracking_updated,'rejection_code',v_receipt.rejection_code);
  END IF;

  SELECT r.* INTO v_previous FROM internal.list_email_intent r
    WHERE r.user_id=p_user_id AND r.list_id=p_list_id AND r.recipient_fingerprint=p_recipient_fingerprint
      AND r.state IN ('started','unknown') AND r.resend_acknowledged_at IS NULL
    ORDER BY r.created_at DESC,r.operation_id LIMIT 1 FOR UPDATE;
  IF FOUND AND p_confirmed_previous_operation_id IS DISTINCT FROM v_previous.operation_id THEN
    RETURN jsonb_build_object('state','unknown','operation_id',v_previous.operation_id);
  END IF;
  IF p_confirmed_previous_operation_id IS NOT NULL THEN
    SELECT r.* INTO v_previous FROM internal.list_email_intent r
      WHERE r.user_id=p_user_id AND r.operation_id=p_confirmed_previous_operation_id FOR UPDATE;
    IF FOUND THEN
      IF v_previous.list_id<>p_list_id OR v_previous.recipient_fingerprint<>p_recipient_fingerprint
        OR v_previous.state='superseded' THEN RETURN jsonb_build_object('state','conflict'); END IF;
      -- A lost HTTP reply may precede SMTP. Under the same list lock, close an
      -- earlier reservation before its delayed worker can dispatch.
      UPDATE internal.list_email_intent SET
        state=CASE WHEN state='reserved' THEN 'superseded' ELSE state END,
        resend_acknowledged_at=COALESCE(resend_acknowledged_at,clock_timestamp())
        WHERE user_id=p_user_id AND operation_id=p_confirmed_previous_operation_id;
    ELSE
      -- Absence is not cancellation: Auth/snapshot work can still be in flight.
      -- Close the old key durably before permitting the confirmed replacement.
      -- Its unknown snapshot hashes stay NULL; this is a tombstone, not evidence
      -- that the old message was prepared, admitted or submitted.
      INSERT INTO internal.list_email_intent(user_id,operation_id,list_id,org_object_id,state,resend_acknowledged_at)
        VALUES(p_user_id,p_confirmed_previous_operation_id,p_list_id,v_org,'superseded',clock_timestamp());
    END IF;
  END IF;
  INSERT INTO internal.list_email_intent(user_id,operation_id,list_id,org_object_id,fingerprint,recipient_fingerprint,confirmed_previous_operation_id)
    VALUES(p_user_id,p_operation_id,p_list_id,v_org,p_fingerprint,p_recipient_fingerprint,p_confirmed_previous_operation_id)
    RETURNING * INTO v_receipt;
  PERFORM internal.measure_list_email(p_user_id,v_org,'admitted');
  RETURN jsonb_build_object('state','reserved','operation_id',p_operation_id,'attempt_token',v_receipt.attempt_token);
END;
$fn$;

CREATE OR REPLACE FUNCTION api.begin_list_email(p_user_id uuid,p_list_id uuid,p_operation_id uuid,p_attempt_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE v_org text; v_receipt internal.list_email_intent%ROWTYPE; v_previous uuid;
BEGIN
  IF current_user<>'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
  SELECT l.org_object_id INTO v_org FROM public.object_list l WHERE l.id=p_list_id FOR UPDATE;
  IF NOT FOUND OR NOT COALESCE(internal.list_sender_authorized(p_list_id,p_user_id),false)
    OR EXISTS(SELECT 1 FROM internal.sandbox_discovery_identity d WHERE d.user_id=p_user_id) THEN
    RETURN jsonb_build_object('started',false,'state','forbidden');
  END IF;
  SELECT r.* INTO v_receipt FROM internal.list_email_intent r WHERE r.user_id=p_user_id
    AND r.operation_id=p_operation_id AND r.list_id=p_list_id AND r.org_object_id=v_org FOR UPDATE;
  IF NOT FOUND OR p_attempt_token IS NULL OR v_receipt.attempt_token<>p_attempt_token THEN
    RETURN jsonb_build_object('started',false,'state','conflict');
  END IF;
  IF v_receipt.state<>'reserved' THEN
    RETURN jsonb_build_object('started',false,'state',CASE WHEN v_receipt.state='started' THEN 'unknown' WHEN v_receipt.state='superseded' THEN 'conflict' ELSE v_receipt.state END,
      'operation_id',p_operation_id,'tracking_updated',v_receipt.tracking_updated);
  END IF;
  SELECT r.operation_id INTO v_previous FROM internal.list_email_intent r
    WHERE r.user_id=p_user_id AND r.list_id=p_list_id AND r.operation_id<>p_operation_id
      AND r.recipient_fingerprint=v_receipt.recipient_fingerprint
      AND r.state IN ('started','unknown') AND r.resend_acknowledged_at IS NULL
    ORDER BY r.created_at DESC,r.operation_id LIMIT 1 FOR UPDATE;
  IF FOUND THEN RETURN jsonb_build_object('started',false,'state','unknown','operation_id',v_previous); END IF;
  UPDATE internal.list_email_intent SET state='started',started_at=clock_timestamp()
    WHERE user_id=p_user_id AND operation_id=p_operation_id;
  PERFORM internal.measure_list_email(p_user_id,v_org,'started');
  RETURN jsonb_build_object('started',true);
END;
$fn$;

CREATE OR REPLACE FUNCTION api.complete_list_email(
  p_user_id uuid,p_list_id uuid,p_operation_id uuid,p_attempt_token uuid,p_outcome text,
  p_tracking_updated boolean DEFAULT false,p_rejection_code text DEFAULT NULL
)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE v_receipt internal.list_email_intent%ROWTYPE; v_now timestamptz;
BEGIN
  IF current_user<>'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
  IF p_outcome IS NULL OR p_outcome NOT IN ('accepted','rejected','unknown')
    OR (p_outcome='rejected' AND (p_rejection_code IS NULL OR p_rejection_code NOT IN ('EAUTH','EDNS','ENOTFOUND','EENVELOPE','NOT_CONFIGURED','CONFIG_CHANGED','CONFIG_UNAVAILABLE'))) THEN
    RAISE EXCEPTION 'Invalid list mail outcome' USING ERRCODE='22023';
  END IF;
  -- Do not re-authorize after the external effect: a real acceptance must remain
  -- recordable after revocation. Only the exact pre-authorized token can ACK.
  SELECT r.* INTO v_receipt FROM internal.list_email_intent r WHERE r.user_id=p_user_id
    AND r.operation_id=p_operation_id AND r.list_id=p_list_id FOR UPDATE;
  IF NOT FOUND OR p_attempt_token IS NULL OR v_receipt.attempt_token<>p_attempt_token THEN RETURN false; END IF;
  IF v_receipt.state IN ('accepted','rejected') THEN RETURN v_receipt.state=p_outcome; END IF;
  IF v_receipt.state NOT IN ('started','unknown') THEN RETURN false; END IF;
  v_now:=clock_timestamp();
  UPDATE internal.list_email_intent SET state=p_outcome,
    accepted_at=CASE WHEN p_outcome='accepted' THEN v_now ELSE NULL END,
    rejected_at=CASE WHEN p_outcome='rejected' THEN v_now ELSE NULL END,
    unknown_at=CASE WHEN p_outcome='unknown' THEN COALESCE(unknown_at,v_now) ELSE unknown_at END,
    rejection_code=CASE WHEN p_outcome='rejected' THEN p_rejection_code ELSE NULL END,
    tracking_updated=CASE WHEN p_outcome='accepted' THEN COALESCE(p_tracking_updated,false) ELSE false END
    WHERE user_id=p_user_id AND operation_id=p_operation_id;
  IF p_outcome='unknown' AND v_receipt.unknown_at IS NULL THEN
    PERFORM internal.measure_list_email(p_user_id,v_receipt.org_object_id,'uncertain');
  ELSIF p_outcome<>'unknown' THEN
    PERFORM internal.measure_list_email(p_user_id,v_receipt.org_object_id,p_outcome);
  END IF;
  RETURN true;
END;
$fn$;

CREATE OR REPLACE FUNCTION api.list_email_measurements(p_from timestamptz,p_until timestamptz)
RETURNS TABLE(minute_start timestamptz,user_id uuid,org_object_id text,admitted bigint,started bigint,accepted bigint,rejected bigint,uncertain bigint,conflicts bigint)
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $fn$
BEGIN
  IF current_user<>'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
  IF p_from IS NULL OR p_until IS NULL OR NOT isfinite(p_from) OR NOT isfinite(p_until) OR p_from>=p_until
    OR p_from<>date_trunc('minute',p_from,'UTC') OR p_until<>date_trunc('minute',p_until,'UTC') THEN
    RAISE EXCEPTION 'Finite UTC-minute measurement bounds required' USING ERRCODE='22023';
  END IF;
  RETURN QUERY SELECT m.minute_start,m.user_id,m.org_object_id,m.admitted,m.started,m.accepted,m.rejected,m.uncertain,m.conflicts
    FROM internal.list_email_metric m WHERE m.minute_start>=p_from AND m.minute_start<p_until
    ORDER BY m.minute_start,m.org_object_id,m.user_id;
END;
$fn$;

REVOKE ALL ON FUNCTION api.claim_list_email(uuid,uuid,uuid,text,text,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION api.begin_list_email(uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION api.complete_list_email(uuid,uuid,uuid,uuid,text,boolean,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION api.list_email_measurements(timestamptz,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION api.claim_list_email(uuid,uuid,uuid,text,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION api.begin_list_email(uuid,uuid,uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION api.complete_list_email(uuid,uuid,uuid,uuid,text,boolean,text) TO service_role;
GRANT EXECUTE ON FUNCTION api.list_email_measurements(timestamptz,timestamptz) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
