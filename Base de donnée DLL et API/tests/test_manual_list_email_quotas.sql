-- Owned fresh/disposable database only. All synthetic changes roll back; no SMTP.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL search_path=pg_catalog,pg_temp;
DO $test$ BEGIN
 IF EXISTS(SELECT FROM internal.manual_list_email_admission) THEN
  RAISE EXCEPTION 'Manual quota fixture requires an empty fresh admission table';
 END IF;
 IF EXISTS(SELECT FROM pg_constraint WHERE conrelid='internal.manual_list_email_admission'::regclass AND contype='f')
  OR EXISTS(SELECT FROM pg_policy WHERE polrelid='internal.manual_list_email_admission'::regclass)
  OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid='internal.manual_list_email_admission'::regclass)
  OR EXISTS(SELECT FROM (VALUES('anon'),('authenticated'),('service_role')) r(name)
    WHERE has_table_privilege(r.name,'internal.manual_list_email_admission','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))
  OR has_function_privilege('anon','internal.admit_manual_list_email(uuid,uuid)','EXECUTE')
  OR has_function_privilege('authenticated','internal.admit_manual_list_email(uuid,uuid)','EXECUTE')
  OR NOT has_function_privilege('service_role','internal.admit_manual_list_email(uuid,uuid)','EXECUTE') THEN
  RAISE EXCEPTION 'Quota table/helper must stay private and independent of deleted business rows';
 END IF;
 IF (SELECT pronargdefaults FROM pg_proc WHERE oid='api.upsert_smtp_config(boolean,text,integer,boolean,text,text,text,text,text,integer,integer)'::regprocedure) IS DISTINCT FROM 0
  OR has_function_privilege('service_role','api.get_smtp_config()','EXECUTE')
  OR has_function_privilege('anon','api.get_smtp_config()','EXECUTE')
  OR has_function_privilege('authenticated','api.get_smtp_config_secret()','EXECUTE') THEN
  RAISE EXCEPTION 'Management overload or existing secret ACL changed';
 END IF;
END; $test$;

INSERT INTO public.object(id,object_type,name,status) VALUES
 ('ORGMAILQUOTA0001','ORG','Synthetic quota ORG A','draft'),
 ('ORGMAILQUOTA0002','ORG','Synthetic quota ORG B','draft');
INSERT INTO auth.users(id,email) VALUES
 ('d2100000-0000-4000-8000-000000000001','quota-a@example.invalid'),
 ('d2100000-0000-4000-8000-000000000002','quota-b@example.invalid'),
 ('d2100000-0000-4000-8000-000000000003','quota-admin@example.invalid');
INSERT INTO public.app_user_profile(id,role) VALUES
 ('d2100000-0000-4000-8000-000000000001','tourism_agent'),
 ('d2100000-0000-4000-8000-000000000002','tourism_agent'),
 ('d2100000-0000-4000-8000-000000000003','super_admin') ON CONFLICT(id) DO UPDATE SET role=EXCLUDED.role;
INSERT INTO public.user_org_membership(user_id,org_object_id,is_active) VALUES
 ('d2100000-0000-4000-8000-000000000001','ORGMAILQUOTA0001',true),
 ('d2100000-0000-4000-8000-000000000002','ORGMAILQUOTA0002',true);
INSERT INTO public.object_list(id,org_object_id,created_by,kind,name) VALUES
 ('d2100000-0000-4000-8000-000000000011','ORGMAILQUOTA0001','d2100000-0000-4000-8000-000000000001','static','Synthetic quota list A'),
 ('d2100000-0000-4000-8000-000000000012','ORGMAILQUOTA0002','d2100000-0000-4000-8000-000000000002','static','Synthetic quota list B');

SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"d2100000-0000-4000-8000-000000000003"}',true);
SET LOCAL ROLE authenticated;
SELECT api.upsert_smtp_config(true,'smtp.example.invalid',587,false,'quota@example.invalid','Synthetic quota','relay',NULL,NULL);
DO $test$ BEGIN
 IF (SELECT manual_max_per_minute=10 AND manual_max_per_24h=1000 FROM api.get_smtp_config()) IS NOT TRUE THEN
  RAISE EXCEPTION 'Approved defaults are not visible through the existing public read';
 END IF;
 PERFORM api.upsert_smtp_config(true,'smtp.example.invalid',587,false,'quota@example.invalid','Synthetic quota','relay',NULL,NULL,2,3);
 PERFORM api.upsert_smtp_config(true,'smtp.example.invalid',587,false,'quota@example.invalid','Legacy save','relay');
 PERFORM api.upsert_smtp_config(true,'smtp.example.invalid',587,false,'quota@example.invalid','Omitted limits','relay',NULL,NULL,NULL,NULL);
 IF (SELECT manual_max_per_minute=2 AND manual_max_per_24h=3 FROM api.get_smtp_config()) IS NOT TRUE THEN
  RAISE EXCEPTION 'Old clients or missing fields reset limits';
 END IF;
 BEGIN
  PERFORM api.upsert_smtp_config(true,'smtp.example.invalid',587,false,'quota@example.invalid','Invalid','relay',NULL,NULL,0,3);
  RAISE EXCEPTION 'Non-positive limit accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END; $test$;
RESET ROLE;

-- Real prepare and begin; distinct fingerprint per operation keeps unrelated receipts independent.
CREATE FUNCTION internal.test_manual_quota_dispatch(p_user uuid,p_list uuid,p_operation uuid) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE r jsonb;fingerprint text:=md5(p_operation::text)||md5(p_operation::text);
BEGIN
 r:=api.prepare_list_email(p_user,p_list,p_operation,fingerprint,fingerprint,0);
 IF r->>'state' IS DISTINCT FROM 'reserved' THEN RAISE EXCEPTION 'Nonempty prepare positive required'; END IF;
 RETURN api.begin_list_email(p_user,p_list,p_operation,(r->>'attempt_token')::uuid,fingerprint,fingerprint);
END; $fn$;
REVOKE ALL ON FUNCTION internal.test_manual_quota_dispatch(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION internal.test_manual_quota_dispatch(uuid,uuid,uuid) TO service_role;
SET LOCAL ROLE service_role;
DO $test$
DECLARE a uuid:='d2100000-0000-4000-8000-000000000001';b uuid:='d2100000-0000-4000-8000-000000000002';
 la uuid:='d2100000-0000-4000-8000-000000000011';lb uuid:='d2100000-0000-4000-8000-000000000012';
 op uuid:='d2100000-0000-4000-8000-000000000021';r jsonb;token uuid;f text:=md5(op::text)||md5(op::text);
BEGIN
 IF internal.test_manual_quota_dispatch(a,la,op)->'started' IS DISTINCT FROM 'true'::jsonb
  OR internal.test_manual_quota_dispatch(b,lb,op)->'started' IS DISTINCT FROM 'true'::jsonb THEN
  RAISE EXCEPTION 'One operation UUID under two different users must admit twice';
 END IF;
 SELECT attempt_token INTO token FROM internal.list_email_intent WHERE user_id=a AND operation_id=op;
 r:=api.begin_list_email(a,la,op,token,f,f);
 IF r->>'state' IS DISTINCT FROM 'unknown' OR r->'started' IS DISTINCT FROM 'false'::jsonb THEN
  RAISE EXCEPTION 'Started replay was rearmed';
 END IF;
 r:=internal.test_manual_quota_dispatch(b,lb,'d2100000-0000-4000-8000-000000000022');
 IF r->>'state' IS DISTINCT FROM 'quota_exceeded' OR r->'started' IS DISTINCT FROM 'false'::jsonb
  OR ((r->>'retryAfterSeconds')::integer BETWEEN 1 AND 60) IS NOT TRUE THEN
  RAISE EXCEPTION 'Global minute quota must reject before SMTP with a bounded retry';
 END IF;
END; $test$;
RESET ROLE;
DO $test$ BEGIN
 IF (SELECT count(*) FROM internal.manual_list_email_admission) IS DISTINCT FROM 2::bigint
  OR NOT EXISTS(SELECT FROM internal.list_email_intent WHERE operation_id='d2100000-0000-4000-8000-000000000022'
   AND state='superseded' AND superseded_at IS NOT NULL AND started_at IS NULL AND unknown_at IS NULL) THEN
  RAISE EXCEPTION 'Quota denial consumed a slot or remained an uncertain reservation';
 END IF;
END; $test$;

-- Age only these synthetic admissions, then the same recipient can make a fresh explicit gesture.
UPDATE internal.manual_list_email_admission SET admitted_at=clock_timestamp()-interval '61 seconds';
SET LOCAL ROLE service_role;
DO $test$
DECLARE b uuid:='d2100000-0000-4000-8000-000000000002';lb uuid:='d2100000-0000-4000-8000-000000000012';
 old uuid:='d2100000-0000-4000-8000-000000000022';fresh uuid:='d2100000-0000-4000-8000-000000000023';
 f text:=md5(old::text)||md5(old::text);r jsonb;t uuid;
BEGIN
 SELECT attempt_token INTO t FROM internal.list_email_intent WHERE user_id=b AND operation_id=old;
 IF api.begin_list_email(b,lb,old,t,f,f)->'started' IS DISTINCT FROM 'false'::jsonb THEN
  RAISE EXCEPTION 'A quota-refused permit was rearmed after the window';
 END IF;
 r:=api.prepare_list_email(b,lb,fresh,f,f,1);
 IF r->>'state' IS DISTINCT FROM 'reserved' THEN RAISE EXCEPTION 'Known quota refusal falsely requires resend confirmation'; END IF;
 IF api.begin_list_email(b,lb,fresh,(r->>'attempt_token')::uuid,f,f)->'started' IS DISTINCT FROM 'true'::jsonb THEN
  RAISE EXCEPTION 'Fresh explicit gesture did not work after minute release';
 END IF;
 r:=internal.test_manual_quota_dispatch(b,lb,'d2100000-0000-4000-8000-000000000024');
 IF r->>'state' IS DISTINCT FROM 'quota_exceeded' OR ((r->>'retryAfterSeconds')::integer BETWEEN 86000 AND 86400) IS NOT TRUE THEN
  RAISE EXCEPTION 'Day quota or longest retry window was ignored';
 END IF;
END; $test$;
RESET ROLE;

-- Changing settings/host and deleting the original list/receipts cannot release global budget.
UPDATE public.app_smtp_config SET host='changed.example.invalid',manual_max_per_minute=1,manual_max_per_24h=1 WHERE id;
DELETE FROM public.object_list WHERE id='d2100000-0000-4000-8000-000000000011';
DO $test$ BEGIN
 IF (SELECT count(*) FROM internal.manual_list_email_admission) IS DISTINCT FROM 3::bigint THEN
  RAISE EXCEPTION 'Settings/list deletion reset quota';
 END IF;
END; $test$;
SET LOCAL ROLE service_role;
DO $test$ DECLARE r jsonb; BEGIN
 r:=internal.test_manual_quota_dispatch('d2100000-0000-4000-8000-000000000002','d2100000-0000-4000-8000-000000000012','d2100000-0000-4000-8000-000000000025');
 -- With day limit lowered to 1, the newest admission, not the oldest, must expire.
 IF r->>'state' IS DISTINCT FROM 'quota_exceeded' OR ((r->>'retryAfterSeconds')::integer BETWEEN 86390 AND 86400) IS NOT TRUE THEN
  RAISE EXCEPTION 'Lowered limit retry was based on the oldest admission';
 END IF;
END; $test$;
RESET ROLE;
UPDATE internal.manual_list_email_admission SET admitted_at=clock_timestamp()-interval '24 hours 1 second';
SET LOCAL ROLE service_role;
DO $test$ BEGIN
 IF internal.test_manual_quota_dispatch('d2100000-0000-4000-8000-000000000002','d2100000-0000-4000-8000-000000000012','d2100000-0000-4000-8000-000000000026')->'started'
  IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'Rolling day did not release a fresh explicit send'; END IF;
END; $test$;
RESET ROLE;
SELECT 'manual-list-email-quotas SQL PASS: exact settings compatibility, global windows, independent budget, no rearm, known quota refusal' AS result;
ROLLBACK;
