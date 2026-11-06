-- Synthetic fixture, rolled back. No SMTP and no quota/retention change.
\set ON_ERROR_STOP on
BEGIN;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
INSERT INTO public.object(id,object_type,name,status) VALUES ('ORGMAILINTENT001','ORG','Synthetic mail ORG','draft');
INSERT INTO auth.users(id,email) VALUES
 ('d2000000-0000-4000-8000-000000000010','mail-intent-synthetic@example.invalid'),
 ('d2000000-0000-4000-8000-000000000011','mail-intent-other@example.invalid');
INSERT INTO public.app_user_profile(id,role) VALUES ('d2000000-0000-4000-8000-000000000010','tourism_agent');
INSERT INTO public.user_org_membership(user_id,org_object_id,is_active)
 VALUES ('d2000000-0000-4000-8000-000000000010','ORGMAILINTENT001',true);
INSERT INTO public.object_list(id,org_object_id,created_by,kind,name)
 VALUES ('d2000000-0000-4000-8000-000000000020','ORGMAILINTENT001','d2000000-0000-4000-8000-000000000010','static','Synthetic mail list');
DO $test$
DECLARE f regprocedure;
BEGIN
 FOR f IN SELECT unnest(ARRAY[
  'api.claim_list_email(uuid,uuid,uuid,text,text,uuid)'::regprocedure,
  'api.begin_list_email(uuid,uuid,uuid,uuid)'::regprocedure,
  'api.complete_list_email(uuid,uuid,uuid,uuid,text,boolean,text)'::regprocedure,
  'api.list_email_measurements(timestamptz,timestamptz)'::regprocedure,
  'internal.measure_list_email(uuid,text,text)'::regprocedure]) LOOP
  IF has_function_privilege('anon',f,'EXECUTE') OR has_function_privilege('authenticated',f,'EXECUTE')
   OR NOT has_function_privilege('service_role',f,'EXECUTE')
   OR (SELECT prosecdef FROM pg_proc WHERE oid=f) THEN RAISE EXCEPTION 'Invoker/service-only contract changed'; END IF;
 END LOOP;
 IF has_table_privilege('anon','internal.list_email_intent','SELECT,INSERT,UPDATE,DELETE')
  OR has_table_privilege('authenticated','internal.list_email_intent','SELECT,INSERT,UPDATE,DELETE')
  OR has_table_privilege('anon','internal.list_email_metric','SELECT,INSERT,UPDATE,DELETE')
  OR has_table_privilege('authenticated','internal.list_email_metric','SELECT,INSERT,UPDATE,DELETE')
  OR has_table_privilege('service_role','internal.list_email_intent','DELETE')
  OR has_table_privilege('service_role','internal.list_email_metric','DELETE')
  OR EXISTS (SELECT 1 FROM pg_class c,LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a
    WHERE c.oid IN ('internal.list_email_intent'::regclass,'internal.list_email_metric'::regclass) AND a.grantee=0)
 THEN RAISE EXCEPTION 'Private receipt/measurement ACL changed'; END IF;
END;
$test$;
-- Forged claim text must never turn authenticated into the real service role.
SET LOCAL ROLE authenticated;
DO $test$ BEGIN
 BEGIN
  PERFORM api.claim_list_email('d2000000-0000-4000-8000-000000000010','d2000000-0000-4000-8000-000000000020',gen_random_uuid(),repeat('a',64),repeat('b',64));
  RAISE EXCEPTION 'Ordinary caller chose an admission identity';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END; $test$;
RESET ROLE;
SAVEPOINT discovery_guard;
INSERT INTO internal.sandbox_discovery_identity(singleton,user_id)
 VALUES(true,'d2000000-0000-4000-8000-000000000010') ON CONFLICT(singleton) DO UPDATE SET user_id=EXCLUDED.user_id;
SET LOCAL ROLE service_role;
DO $test$ BEGIN
 IF NOT internal.list_sender_authorized('d2000000-0000-4000-8000-000000000020','d2000000-0000-4000-8000-000000000010')
  OR api.claim_list_email('d2000000-0000-4000-8000-000000000010','d2000000-0000-4000-8000-000000000020',gen_random_uuid(),repeat('a',64),repeat('b',64))->>'state'<>'forbidden'
  OR EXISTS(SELECT 1 FROM internal.list_email_intent WHERE user_id='d2000000-0000-4000-8000-000000000010')
 THEN RAISE EXCEPTION 'Configured discovery identity bypassed durable no-effect gate'; END IF;
END; $test$;
RESET ROLE;
ROLLBACK TO SAVEPOINT discovery_guard;
RELEASE SAVEPOINT discovery_guard;
SET LOCAL ROLE service_role;
DO $test$
DECLARE
 u uuid:='d2000000-0000-4000-8000-000000000010'; l uuid:='d2000000-0000-4000-8000-000000000020';
 a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); denied uuid:=gen_random_uuid();
 r jsonb; token uuid; token_b uuid;
BEGIN
 IF current_user<>'service_role' OR NOT (SELECT rolbypassrls FROM pg_roles WHERE rolname=current_user)
 THEN RAISE EXCEPTION 'Real service-role witness missing'; END IF;
 IF api.claim_list_email('d2000000-0000-4000-8000-000000000011',l,denied,repeat('a',64),repeat('b',64))->>'state'<>'forbidden'
 THEN RAISE EXCEPTION 'Foreign user admitted'; END IF;
 IF EXISTS(SELECT 1 FROM internal.list_email_intent WHERE operation_id=denied) THEN RAISE EXCEPTION 'Denial stored an intent'; END IF;
 BEGIN
  PERFORM api.claim_list_email(u,l,NULL,repeat('a',64),repeat('b',64)); RAISE EXCEPTION 'Null key admitted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL;
 END;
 r:=api.claim_list_email(u,l,a,repeat('a',64),repeat('b',64)); token:=(r->>'attempt_token')::uuid;
 IF r->>'state'<>'reserved' OR token IS NULL OR api.claim_list_email(u,l,a,repeat('a',64),repeat('b',64))->>'attempt_token'<>token::text
 THEN RAISE EXCEPTION 'Reserved replay changed the exact attempt'; END IF;
 IF api.claim_list_email(u,l,a,repeat('c',64),repeat('b',64))->>'state'<>'conflict'
  OR api.claim_list_email(u,l,a,repeat('a',64),repeat('c',64))->>'state'<>'conflict'
 THEN RAISE EXCEPTION 'Changed prepared content/recipient reused a key'; END IF;
 IF api.begin_list_email(u,l,a,gen_random_uuid())->>'state'<>'conflict'
  OR api.begin_list_email(u,l,a,token)->'started'<>'true'::jsonb
  OR api.begin_list_email(u,l,a,token)->'started'<>'false'::jsonb
 THEN RAISE EXCEPTION 'Exact token did not admit exactly one attempt'; END IF;
 IF NOT api.complete_list_email(u,l,a,token,'unknown') OR NOT api.complete_list_email(u,l,a,token,'unknown')
  OR api.claim_list_email(u,l,a,repeat('a',64),repeat('b',64))->>'state'<>'unknown'
  OR api.claim_list_email(u,l,b,repeat('a',64),repeat('b',64))->>'operation_id'<>a::text
  OR EXISTS(SELECT 1 FROM internal.list_email_intent WHERE operation_id=b)
 THEN RAISE EXCEPTION 'Uncertain send retried without confirmation'; END IF;
 r:=api.claim_list_email(u,l,b,repeat('a',64),repeat('b',64),a); token_b:=(r->>'attempt_token')::uuid;
 IF r->>'state'<>'reserved' OR token_b IS NULL OR api.begin_list_email(u,l,b,token_b)->'started'<>'true'::jsonb
 THEN RAISE EXCEPTION 'Explicit confirmed new intention refused'; END IF;
 -- A delayed known acceptance is still recordable, never an automatic resend.
 IF NOT api.complete_list_email(u,l,a,token,'accepted',false)
  OR NOT api.complete_list_email(u,l,b,token_b,'accepted',true)
  OR NOT api.complete_list_email(u,l,b,token_b,'accepted',true)
  OR api.complete_list_email(u,l,b,token_b,'unknown')
  OR api.claim_list_email(u,l,b,repeat('a',64),repeat('b',64))->'tracking_updated'<>'true'::jsonb
 THEN RAISE EXCEPTION 'Terminal acceptance regressed or replay lost tracking'; END IF;
 IF (SELECT sum(admitted) FROM internal.list_email_metric WHERE user_id=u)<>2
  OR (SELECT sum(started) FROM internal.list_email_metric WHERE user_id=u)<>2
  OR (SELECT sum(accepted) FROM internal.list_email_metric WHERE user_id=u)<>2
  OR (SELECT sum(uncertain) FROM internal.list_email_metric WHERE user_id=u)<>1
 THEN RAISE EXCEPTION 'Replay inflated actual aggregate effects'; END IF;
 IF NOT EXISTS(SELECT 1 FROM api.list_email_measurements(date_trunc('minute',clock_timestamp(),'UTC')-interval '1 minute',date_trunc('minute',clock_timestamp(),'UTC')+interval '1 minute') WHERE user_id=u AND org_object_id='ORGMAILINTENT001')
 THEN RAISE EXCEPTION 'Useful aggregate measurement is empty'; END IF;
END;
$test$;
RESET ROLE;
-- An archive/creator deletion is not list deletion. Receipt remains until the real FK cascade.
UPDATE public.object_list SET last_activity_at=clock_timestamp()-interval '2 years' WHERE id='d2000000-0000-4000-8000-000000000020';
DELETE FROM auth.users WHERE id='d2000000-0000-4000-8000-000000000010';
DO $test$ BEGIN
 IF (SELECT count(*) FROM internal.list_email_intent WHERE list_id='d2000000-0000-4000-8000-000000000020')<>2 THEN RAISE EXCEPTION 'List-life receipts disappeared with creator/archive'; END IF;
END; $test$;
DELETE FROM public.object_list WHERE id='d2000000-0000-4000-8000-000000000020';
DO $test$ BEGIN
 IF EXISTS(SELECT 1 FROM internal.list_email_intent WHERE list_id='d2000000-0000-4000-8000-000000000020')
  OR NOT EXISTS(SELECT 1 FROM internal.list_email_metric WHERE user_id='d2000000-0000-4000-8000-000000000010')
 THEN RAISE EXCEPTION 'Receipt list-life cascade/aggregate separation changed'; END IF;
END; $test$;
ROLLBACK;
\echo 'Manual list-mail: service identity, one attempt, durable uncertainty, explicit confirmation, terminal ACK, private aggregate and list lifetime passed'
