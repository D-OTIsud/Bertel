-- Owned disposable CI only (executed by tools/list-email/sql-fixture.mjs).
-- Synthetic transactional fixtures; no SMTP/provider and no retained business data.
\set ON_ERROR_STOP on
BEGIN;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
INSERT INTO public.object(id,object_type,name,status) VALUES('ORGMAILINTENT001','ORG','Synthetic mail ORG','draft');
INSERT INTO auth.users(id,email) VALUES
 ('d2000000-0000-4000-8000-000000000010','mail-intent-synthetic@example.invalid'),
 ('d2000000-0000-4000-8000-000000000011','mail-intent-other@example.invalid');
-- Real onboarding may already have created this profile.
INSERT INTO public.app_user_profile(id,role) VALUES('d2000000-0000-4000-8000-000000000010','tourism_agent')
 ON CONFLICT(id) DO UPDATE SET role=EXCLUDED.role;
INSERT INTO public.user_org_membership(user_id,org_object_id,is_active) VALUES('d2000000-0000-4000-8000-000000000010','ORGMAILINTENT001',true);
INSERT INTO public.object_list(id,org_object_id,created_by,kind,name)
 VALUES('d2000000-0000-4000-8000-000000000020','ORGMAILINTENT001','d2000000-0000-4000-8000-000000000010','static','Synthetic mail list');
DO $test$
DECLARE f regprocedure;t regclass;
BEGIN
 FOR f IN SELECT unnest(ARRAY[
  'api.get_list_email_context(uuid,uuid)'::regprocedure,
  'api.prepare_list_email(uuid,uuid,uuid,text,text,bigint,boolean,uuid[])'::regprocedure,
  'api.begin_list_email(uuid,uuid,uuid,uuid,text,text)'::regprocedure,
  'api.complete_list_email(uuid,uuid,uuid,uuid,text,boolean,text,text)'::regprocedure,
  'api.ack_list_email_client(uuid,uuid,uuid,text)'::regprocedure,
  'api.list_email_measurements(timestamptz,timestamptz)'::regprocedure,
  'internal.measure_list_email(uuid,text,text)'::regprocedure]) LOOP
  IF has_function_privilege('anon',f,'EXECUTE') OR has_function_privilege('authenticated',f,'EXECUTE')
   OR NOT has_function_privilege('service_role',f,'EXECUTE') OR (SELECT prosecdef FROM pg_proc WHERE oid=f)
  THEN RAISE EXCEPTION 'Service-only INVOKER contract changed'; END IF;
 END LOOP;
 FOR t IN SELECT unnest(ARRAY['internal.list_email_scope'::regclass,'internal.list_email_intent'::regclass,'internal.list_email_metric'::regclass]) LOOP
  IF has_table_privilege('anon',t,'SELECT,INSERT,UPDATE,DELETE') OR has_table_privilege('authenticated',t,'SELECT,INSERT,UPDATE,DELETE')
   OR has_table_privilege('service_role',t,'DELETE') OR NOT(SELECT relrowsecurity FROM pg_class WHERE oid=t)
   OR EXISTS(SELECT 1 FROM pg_class c,LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a WHERE c.oid=t AND a.grantee=0)
  THEN RAISE EXCEPTION 'Private receipt/context/metric table ACL changed'; END IF;
 END LOOP;
END; $test$;
SET LOCAL ROLE authenticated;
DO $test$ BEGIN
 BEGIN
  PERFORM api.get_list_email_context('d2000000-0000-4000-8000-000000000010','d2000000-0000-4000-8000-000000000020');
  RAISE EXCEPTION 'Forged claims selected another context';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END; $test$;
RESET ROLE;
SET LOCAL ROLE service_role;
DO $test$
DECLARE
 u uuid:='d2000000-0000-4000-8000-000000000010';l uuid:='d2000000-0000-4000-8000-000000000020';
 a uuid:='d2000000-0000-4000-8000-000000000001';b uuid:='d2000000-0000-4000-8000-000000000002';
 c uuid:='d2000000-0000-4000-8000-000000000003';d uuid:='d2000000-0000-4000-8000-000000000004';
 e uuid:='d2000000-0000-4000-8000-000000000005';old uuid:=gen_random_uuid();fresh uuid:=gen_random_uuid();
 r jsonb;token_a uuid;token_b uuid;token_c uuid;
BEGIN
 IF current_user IS DISTINCT FROM 'service_role' OR NOT(SELECT rolbypassrls FROM pg_roles WHERE rolname=current_user)
 THEN RAISE EXCEPTION 'Real service-role witness missing'; END IF;
 r:=api.get_list_email_context(u,l);
 IF r->>'state' IS DISTINCT FROM 'ready' OR r->'generations' IS DISTINCT FROM '{}'::jsonb
  OR EXISTS(SELECT 1 FROM internal.list_email_scope WHERE user_id=u) THEN RAISE EXCEPTION 'Context was not a pure read'; END IF;
 IF api.get_list_email_context('d2000000-0000-4000-8000-000000000011',l)->>'state' IS DISTINCT FROM 'forbidden'
 THEN RAISE EXCEPTION 'Foreign identity read a context'; END IF;
 r:=api.prepare_list_email(u,l,a,repeat('a',64),repeat('b',64),0);token_a:=(r->>'attempt_token')::uuid;
 IF r->>'state' IS DISTINCT FROM 'reserved' OR token_a IS NULL
  OR api.prepare_list_email(u,l,a,repeat('a',64),repeat('b',64),0)->>'attempt_token' IS DISTINCT FROM token_a::text
  OR (SELECT sum(started) FROM internal.list_email_metric WHERE user_id=u) IS DISTINCT FROM 0::numeric
 THEN RAISE EXCEPTION 'Prepare did not reserve one non-dispatched permit'; END IF;
 IF api.begin_list_email(u,l,gen_random_uuid(),token_a,repeat('a',64),repeat('b',64))->>'state' IS DISTINCT FROM 'conflict'
  OR api.begin_list_email(u,l,a,gen_random_uuid(),repeat('a',64),repeat('b',64))->>'state' IS DISTINCT FROM 'conflict'
  OR api.ack_list_email_client(u,l,a,token_a::text) IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'Nonce created a dispatch/accepted ACK'; END IF;
 IF api.prepare_list_email(u,l,b,repeat('a',64),repeat('b',64),0)->>'state' IS DISTINCT FROM 'stale'
  OR api.get_list_email_context(u,l)->'generations'->>repeat('b',64) IS DISTINCT FROM '1'
 THEN RAISE EXCEPTION 'An old gesture refreshed its generation'; END IF;
 IF api.begin_list_email(u,l,a,token_a,repeat('a',64),repeat('b',64))->'started' IS DISTINCT FROM 'true'::jsonb
  OR api.begin_list_email(u,l,a,token_a,repeat('a',64),repeat('b',64))->'started' IS DISTINCT FROM 'false'::jsonb
 THEN RAISE EXCEPTION 'A permit did not admit exactly one attempt'; END IF;
 IF api.ack_list_email_client(u,l,a,repeat('a',64)) IS DISTINCT FROM false
  OR (SELECT state FROM internal.list_email_intent WHERE user_id=u AND operation_id=a) IS DISTINCT FROM 'started'
 THEN RAISE EXCEPTION 'Client assertion promoted started to accepted'; END IF;
 IF api.complete_list_email(u,l,a,token_a,'accepted',false,NULL,repeat('a',64)) IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'Known acceptance not durable'; END IF;
 -- Reload has lost all client IDs: accepted but no result ACK still requires consent.
 r:=api.prepare_list_email(u,l,b,repeat('a',64),repeat('b',64),1);
 IF r->>'state' IS DISTINCT FROM 'unknown' OR NOT(r->'operation_ids' @> jsonb_build_array(a))
  OR EXISTS(SELECT 1 FROM internal.list_email_intent WHERE user_id=u AND operation_id=b)
 THEN RAISE EXCEPTION 'Lost HTTP acceptance after reload silently resent'; END IF;
 -- Confirmation WITHOUT explicit IDs captures all visible unresolved records.
 r:=api.prepare_list_email(u,l,b,repeat('a',64),repeat('b',64),1,true);token_b:=(r->>'attempt_token')::uuid;
 IF r->>'state' IS DISTINCT FROM 'reserved' OR token_b IS NULL
  OR (SELECT confirmed_previous_operation_ids FROM internal.list_email_intent WHERE user_id=u AND operation_id=b) IS DISTINCT FROM ARRAY[a]
  OR api.begin_list_email(u,l,b,token_b,repeat('a',64),repeat('b',64))->'started' IS DISTINCT FROM 'true'::jsonb
  OR api.complete_list_email(u,l,b,token_b,'accepted',true,NULL,repeat('b',64)) IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'Confirmed replacement failed'; END IF;
 IF api.ack_list_email_client(u,l,b,repeat('a',64)) IS DISTINCT FROM false
  OR EXISTS(SELECT 1 FROM internal.list_email_intent WHERE user_id=u AND client_received_at IS NOT NULL)
 THEN RAISE EXCEPTION 'A predecessor proof ACKed another intent'; END IF;
 IF api.ack_list_email_client(u,l,b,repeat('b',64)) IS DISTINCT FROM true
  OR api.ack_list_email_client(u,l,b,repeat('b',64)) IS DISTINCT FROM true
  OR (SELECT client_received_at IS NULL FROM internal.list_email_intent WHERE user_id=u AND operation_id=a) IS DISTINCT FROM true
  OR (SELECT state FROM internal.list_email_intent WHERE user_id=u AND operation_id=a) IS DISTINCT FROM 'accepted'
 THEN RAISE EXCEPTION 'ACK rewrote another receipt or was not idempotent'; END IF;
 r:=api.prepare_list_email(u,l,c,repeat('a',64),repeat('b',64),2);token_c:=(r->>'attempt_token')::uuid;
 IF r->>'state' IS DISTINCT FROM 'reserved' OR token_c IS NULL THEN RAISE EXCEPTION 'Positive new gesture blocked after acknowledged replacement'; END IF;
 IF api.ack_list_email_client(u,l,a,repeat('a',64)) IS DISTINCT FROM true
  OR (SELECT client_received_at IS NULL FROM internal.list_email_intent WHERE user_id=u AND operation_id=c) IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'Late old ACK settled the newer gesture'; END IF;
 -- An old live document had read generation0 before its first wait. C finishes
 -- and ACKs on that destination before old reaches prepare: old stays stale.
 r:=api.prepare_list_email(u,l,fresh,repeat('f',64),repeat('f',64),0);
 token_c:=(r->>'attempt_token')::uuid;
 IF r->>'state' IS DISTINCT FROM 'reserved'
  OR api.begin_list_email(u,l,fresh,token_c,repeat('f',64),repeat('f',64))->'started' IS DISTINCT FROM 'true'::jsonb
  OR api.complete_list_email(u,l,fresh,token_c,'accepted',true,NULL,repeat('f',64)) IS DISTINCT FROM true
  OR api.ack_list_email_client(u,l,fresh,repeat('f',64)) IS DISTINCT FROM true
  OR api.prepare_list_email(u,l,old,repeat('f',64),repeat('f',64),0,true)->>'state' IS DISTINCT FROM 'stale'
  OR EXISTS(SELECT 1 FROM internal.list_email_intent WHERE user_id=u AND operation_id=old)
 THEN RAISE EXCEPTION 'Delayed live gesture revived after newer complete ACK'; END IF;
 -- A different recipient has its own generation, not a business mail cap.
 r:=api.prepare_list_email(u,l,d,repeat('d',64),repeat('d',64),0);
 IF r->>'state' IS DISTINCT FROM 'reserved'
  OR api.begin_list_email(u,l,d,(r->>'attempt_token')::uuid,repeat('d',64),repeat('d',64))->'started' IS DISTINCT FROM 'true'::jsonb
 THEN RAISE EXCEPTION 'Independent legitimate recipient denied'; END IF;
 r:=api.prepare_list_email(u,l,e,repeat('e',64),repeat('e',64),0);
 IF r->>'state' IS DISTINCT FROM 'reserved' THEN RAISE EXCEPTION 'Revocation setup was vacant'; END IF;
 IF NOT EXISTS(SELECT 1 FROM api.list_email_measurements(date_trunc('minute',clock_timestamp(),'UTC')-interval '1 minute',date_trunc('minute',clock_timestamp(),'UTC')+interval '1 minute') WHERE user_id=u AND org_object_id='ORGMAILINTENT001')
 THEN RAISE EXCEPTION 'Measurement positive is empty'; END IF;
END; $test$;
RESET ROLE;
SAVEPOINT sandbox_case;
INSERT INTO internal.sandbox_discovery_identity(singleton,user_id)
 VALUES(true,'d2000000-0000-4000-8000-000000000010') ON CONFLICT(singleton) DO UPDATE SET user_id=EXCLUDED.user_id;
SET LOCAL ROLE service_role;
DO $test$
DECLARE u uuid:='d2000000-0000-4000-8000-000000000010';l uuid:='d2000000-0000-4000-8000-000000000020';t uuid;
BEGIN
 SELECT attempt_token INTO t FROM internal.list_email_intent WHERE user_id=u AND operation_id='d2000000-0000-4000-8000-000000000005';
 IF api.get_list_email_context(u,l)->>'state' IS DISTINCT FROM 'forbidden'
  OR api.prepare_list_email(u,l,gen_random_uuid(),repeat('a',64),repeat('a',64),0)->>'state' IS DISTINCT FROM 'forbidden'
  OR api.begin_list_email(u,l,'d2000000-0000-4000-8000-000000000005',t,repeat('e',64),repeat('e',64))->>'state' IS DISTINCT FROM 'forbidden'
 THEN RAISE EXCEPTION 'Sandbox identity gained context/reservation/dispatch'; END IF;
END; $test$;
RESET ROLE;
ROLLBACK TO sandbox_case;
UPDATE public.user_org_membership SET is_active=false WHERE user_id='d2000000-0000-4000-8000-000000000010';
SET LOCAL ROLE service_role;
DO $test$
DECLARE u uuid:='d2000000-0000-4000-8000-000000000010';l uuid:='d2000000-0000-4000-8000-000000000020';t uuid;
BEGIN
 SELECT attempt_token INTO t FROM internal.list_email_intent WHERE user_id=u AND operation_id='d2000000-0000-4000-8000-000000000005';
 IF api.get_list_email_context(u,l)->>'state' IS DISTINCT FROM 'forbidden'
  OR api.begin_list_email(u,l,'d2000000-0000-4000-8000-000000000005',t,repeat('e',64),repeat('e',64))->>'state' IS DISTINCT FROM 'forbidden'
  OR api.prepare_list_email(u,l,gen_random_uuid(),repeat('a',64),repeat('a',64),0)->>'state' IS DISTINCT FROM 'forbidden'
 THEN RAISE EXCEPTION 'Revoked sender dispatched/prepared/read context'; END IF;
 SELECT attempt_token INTO t FROM internal.list_email_intent WHERE user_id=u AND operation_id='d2000000-0000-4000-8000-000000000004';
 IF api.complete_list_email(u,l,'d2000000-0000-4000-8000-000000000004',t,'accepted',false,NULL,repeat('d',64)) IS DISTINCT FROM true
  OR api.ack_list_email_client(u,l,'d2000000-0000-4000-8000-000000000004',repeat('d',64)) IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'Actual earlier acceptance could not record its exact result after revocation'; END IF;
END; $test$;
RESET ROLE;
DELETE FROM auth.users WHERE id='d2000000-0000-4000-8000-000000000010';
DO $test$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM internal.list_email_intent WHERE list_id='d2000000-0000-4000-8000-000000000020') THEN RAISE EXCEPTION 'Creator deletion shortened list-life receipts'; END IF;
END; $test$;
DELETE FROM public.object_list WHERE id='d2000000-0000-4000-8000-000000000020';
DO $test$ BEGIN
 IF EXISTS(SELECT 1 FROM internal.list_email_intent WHERE list_id='d2000000-0000-4000-8000-000000000020')
  OR EXISTS(SELECT 1 FROM internal.list_email_scope WHERE list_id='d2000000-0000-4000-8000-000000000020')
  OR NOT EXISTS(SELECT 1 FROM internal.list_email_metric WHERE user_id='d2000000-0000-4000-8000-000000000010')
 THEN RAISE EXCEPTION 'List-life cascade or aggregate separation changed'; END IF;
END; $test$;
ROLLBACK;
\echo 'Manual list-mail: read-only context, captured generation, no implicit dispatch, result proof/ACK, reload, revocation and list lifetime passed'
