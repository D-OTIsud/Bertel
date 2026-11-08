-- Manual list mail only: global rolling 60-second and 24-hour admission budgets.
-- One admitted mono-recipient send consumes one slot even if SMTP later rejects or is unknown.
-- Notifications, transport, business receipts and Vault are unchanged.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
SET LOCAL search_path=pg_catalog,pg_temp;

-- Refuse an unexpected existing management ACL before replacing its TABLE result type.
DO $guard$
DECLARE v_acl pg_catalog.jsonb;
BEGIN
 SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(
   CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee) END,
   pg_catalog.pg_get_userbyid(a.grantor),a.privilege_type,a.is_grantable)
   ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee) END COLLATE "C")
 INTO v_acl FROM pg_catalog.pg_proc p,
 LATERAL pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
 WHERE p.oid=pg_catalog.to_regprocedure('api.get_smtp_config()')
   AND pg_catalog.pg_get_userbyid(p.proowner)='postgres';
 IF v_acl IS DISTINCT FROM '[["authenticated","postgres","EXECUTE",false],["postgres","postgres","EXECUTE",false]]'::pg_catalog.jsonb
  OR pg_catalog.to_regprocedure('api.upsert_smtp_config(boolean,text,integer,boolean,text,text,text,text,text)') IS NULL
  OR pg_catalog.to_regprocedure('api.begin_list_email(uuid,uuid,uuid,uuid,text,text)') IS NULL THEN
  RAISE EXCEPTION 'Manual mail quota prerequisites drifted' USING ERRCODE='55000';
 END IF;
END;
$guard$;

ALTER TABLE public.app_smtp_config
 ADD COLUMN manual_max_per_minute integer NOT NULL DEFAULT 10 CHECK(manual_max_per_minute>0),
 ADD COLUMN manual_max_per_24h integer NOT NULL DEFAULT 1000 CHECK(manual_max_per_24h>0);

CREATE TABLE internal.manual_list_email_admission (
 user_id uuid NOT NULL,
 operation_id uuid NOT NULL,
 admitted_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
 PRIMARY KEY(user_id,operation_id)
);
ALTER TABLE internal.manual_list_email_admission OWNER TO postgres;
CREATE INDEX manual_list_email_admission_time ON internal.manual_list_email_admission(admitted_at);
ALTER TABLE internal.manual_list_email_admission ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON internal.manual_list_email_admission FROM PUBLIC,anon,authenticated,service_role;
COMMENT ON TABLE internal.manual_list_email_admission IS
 'Global manual-list admissions, one per existing (user_id,operation_id) intent key. No FK: list/receipt deletion or SMTP setting changes never reset the budget. No mailbox/content/secret. No business receipt retention change.';

CREATE FUNCTION internal.admit_manual_list_email(p_user_id uuid,p_operation_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE
 v_now pg_catalog.timestamptz;
 v_min pg_catalog.int4;
 v_day pg_catalog.int4;
 v_min_count pg_catalog.int8;
 v_day_count pg_catalog.int8;
 v_retry pg_catalog.timestamptz;
 v_release pg_catalog.timestamptz;
BEGIN
 IF p_user_id IS NULL OR p_operation_id IS NULL THEN
  RAISE EXCEPTION 'Invalid manual mail admission key' USING ERRCODE='22023';
 END IF;
 -- A fresh snapshot after a waiter gets the global lock is required.
 IF pg_catalog.current_setting('transaction_isolation') IS DISTINCT FROM 'read committed' THEN
  RAISE EXCEPTION 'Manual mail admission requires read committed' USING ERRCODE='55000';
 END IF;
 -- Same key as the existing SMTP upsert: quotas and settings serialize consistently.
 PERFORM pg_catalog.pg_advisory_xact_lock(728140026);
 v_now:=pg_catalog.clock_timestamp();
 SELECT c.manual_max_per_minute,c.manual_max_per_24h INTO v_min,v_day
 FROM public.app_smtp_config c WHERE c.id;
 -- Environment-backed installations with no singleton still use the approved defaults.
 v_min:=coalesce(v_min,10);v_day:=coalesce(v_day,1000);
 IF EXISTS(SELECT FROM internal.manual_list_email_admission
   WHERE user_id=p_user_id AND operation_id=p_operation_id) THEN
  RETURN pg_catalog.jsonb_build_object('state','conflict');
 END IF;
 SELECT count(*) FILTER(WHERE admitted_at>v_now-interval '60 seconds'),count(*)
 INTO v_min_count,v_day_count FROM internal.manual_list_email_admission
 WHERE admitted_at>v_now-interval '24 hours';
 IF v_min_count>=v_min THEN
  -- If a setting was lowered, enough admissions must expire, not only the oldest one.
  SELECT admitted_at+interval '60 seconds' INTO v_retry
  FROM internal.manual_list_email_admission WHERE admitted_at>v_now-interval '60 seconds'
  ORDER BY admitted_at DESC OFFSET(v_min-1) LIMIT 1;
 END IF;
 IF v_day_count>=v_day THEN
  SELECT admitted_at+interval '24 hours' INTO v_release
  FROM internal.manual_list_email_admission WHERE admitted_at>v_now-interval '24 hours'
  ORDER BY admitted_at DESC OFFSET(v_day-1) LIMIT 1;
  v_retry:=greatest(v_retry,v_release);
 END IF;
 IF v_retry IS NOT NULL THEN
  RETURN pg_catalog.jsonb_build_object('state','quota_exceeded',
   'retryAfterSeconds',greatest(1,ceil(extract(epoch FROM v_retry-v_now)))::integer);
 END IF;
 INSERT INTO internal.manual_list_email_admission(user_id,operation_id,admitted_at)
 VALUES(p_user_id,p_operation_id,v_now);
 RETURN pg_catalog.jsonb_build_object('state','admitted');
END;
$fn$;
ALTER FUNCTION internal.admit_manual_list_email(uuid,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION internal.admit_manual_list_email(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION internal.admit_manual_list_email(uuid,uuid) TO service_role;

-- Same management entry point/authorization; only two non-secret output columns added.
DROP FUNCTION api.get_smtp_config();
CREATE FUNCTION api.get_smtp_config()
RETURNS TABLE(enabled boolean,host text,port integer,secure boolean,from_email text,
 from_name text,auth_mode text,username text,has_password boolean,updated_at timestamptz,
 manual_max_per_minute integer,manual_max_per_24h integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
 IF auth.uid() IS NULL OR api.is_platform_superuser() IS NOT TRUE THEN
  RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
 END IF;
 RETURN QUERY SELECT c.enabled,c.host,c.port,c.secure,c.from_email,c.from_name,
  c.auth_mode,c.username,c.password_secret_id IS NOT NULL,c.updated_at,
  c.manual_max_per_minute,c.manual_max_per_24h
 FROM public.app_smtp_config c WHERE c.id;
END;
$fn$;
ALTER FUNCTION api.get_smtp_config() OWNER TO postgres;
REVOKE ALL ON FUNCTION api.get_smtp_config() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION api.get_smtp_config() TO authenticated;

-- All eleven args are required: no ambiguous overlap with the unchanged legacy overload.
-- New HTTP code passes NULL for omitted quota inputs; old nine-argument clients retain values.
CREATE FUNCTION api.upsert_smtp_config(
 p_enabled boolean,p_host text,p_port integer,p_secure boolean,
 p_from_email text,p_from_name text,p_auth_mode text,p_username text,p_password text,
 p_manual_max_per_minute integer,p_manual_max_per_24h integer
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
 IF auth.uid() IS NULL OR api.is_platform_superuser() IS NOT TRUE THEN
  RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
 END IF;
 IF (p_manual_max_per_minute IS NOT NULL AND p_manual_max_per_minute<=0)
  OR (p_manual_max_per_24h IS NOT NULL AND p_manual_max_per_24h<=0) THEN
  RAISE EXCEPTION 'INVALID_SMTP_SETTINGS' USING ERRCODE='22023';
 END IF;
 -- This unchanged function handles Vault and takes lock728140026 in this same transaction.
 PERFORM api.upsert_smtp_config(p_enabled,p_host,p_port,p_secure,p_from_email,p_from_name,
  p_auth_mode,p_username,p_password);
 UPDATE public.app_smtp_config SET
  manual_max_per_minute=coalesce(p_manual_max_per_minute,manual_max_per_minute),
  manual_max_per_24h=coalesce(p_manual_max_per_24h,manual_max_per_24h)
 WHERE id;
END;
$fn$;
ALTER FUNCTION api.upsert_smtp_config(boolean,text,integer,boolean,text,text,text,text,text,integer,integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION api.upsert_smtp_config(boolean,text,integer,boolean,text,text,text,text,text,integer,integer)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION api.upsert_smtp_config(boolean,text,integer,boolean,text,text,text,text,text,integer,integer)
 TO authenticated;

CREATE OR REPLACE FUNCTION api.begin_list_email(p_user_id uuid,p_list_id uuid,p_operation_id uuid,p_attempt_token uuid,p_fingerprint text,p_recipient_fingerprint text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE v_org text;v_generation bigint;r internal.list_email_intent%ROWTYPE;v_other uuid;v_quota jsonb;
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
 THEN
  PERFORM internal.measure_list_email(p_user_id,v_org,'conflicts');
  RETURN jsonb_build_object('started',false,'state','conflict'); END IF;
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
 -- Quota reservation and dispatch CAS commit or roll back together.
 v_quota:=internal.admit_manual_list_email(p_user_id,p_operation_id);
 IF v_quota->>'state' IS DISTINCT FROM 'admitted' THEN
  IF v_quota->>'state'='quota_exceeded' THEN
   -- A known refusal before SMTP revokes only this unused permit. It must not
   -- become an uncertain predecessor on the next explicit user gesture.
   UPDATE internal.list_email_intent SET state='superseded',superseded_at=clock_timestamp()
   WHERE user_id=p_user_id AND operation_id=p_operation_id AND state='reserved';
  END IF;
  RETURN jsonb_build_object('started',false)||v_quota;
 END IF;
 UPDATE internal.list_email_intent SET state='started',started_at=clock_timestamp() WHERE user_id=p_user_id AND operation_id=p_operation_id;
 PERFORM internal.measure_list_email(p_user_id,v_org,'started');
 RETURN jsonb_build_object('started',true);
END;
$fn$;

NOTIFY pgrst, 'reload schema';
COMMIT;
