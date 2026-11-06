-- PREPARATION ONLY. No application authorized by this artifact.
-- Marker: BERTEL_IA_R100_PREP_20261106
-- One DO statement; source comments and internal SQL preserved exactly.
-- Management API receipt atomicity is NOT established by this wrapper.
DO $guarded_ia_migration$
DECLARE
  v_count bigint; v_fingerprint text; v_roles jsonb; v_fn oid; v_table oid;
BEGIN
  PERFORM pg_catalog.set_config('lock_timeout','500ms',true);
  IF current_user <> 'postgres' OR session_user <> 'postgres' THEN
    RAISE EXCEPTION 'IA preflight: execution identity differs from reviewed metadata';
  END IF;
  LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
  SELECT count(*),md5(string_agg(version||chr(31)||coalesce(name,'')||chr(31)||coalesce(md5(array_to_string(statements,E'\n')),''),chr(30) ORDER BY version))
    INTO v_count,v_fingerprint FROM supabase_migrations.schema_migrations;
  IF v_count <> 191 OR v_fingerprint IS DISTINCT FROM 'e1d54dd4e3e8ef05c05ef71194b91d91' THEN
    RAISE EXCEPTION 'IA preflight: migration ledger drifted';
  END IF;
  IF EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261106145451' OR name='distributed_ai_request_admission')
    OR to_regclass('internal.ai_request_rate_state') IS NOT NULL
    OR EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='api' AND p.proname='admit_ai_request') THEN
    RAISE EXCEPTION 'IA preflight: admission is already present or partially installed; reconcile without replay';
  END IF;
  SELECT jsonb_agg(jsonb_build_object('name',rolname,'superuser',rolsuper,'inherit',rolinherit,'create_role',rolcreaterole,'create_db',rolcreatedb,'login',rolcanlogin,'replication',rolreplication,'bypass_rls',rolbypassrls)ORDER BY rolname)
    INTO v_roles FROM pg_roles WHERE rolname IN('postgres','supabase_admin','anon','authenticated','service_role');
  IF v_roles IS DISTINCT FROM '[{"name":"anon","login":false,"inherit":true,"create_db":false,"superuser":false,"bypass_rls":false,"create_role":false,"replication":false},{"name":"authenticated","login":false,"inherit":true,"create_db":false,"superuser":false,"bypass_rls":false,"create_role":false,"replication":false},{"name":"postgres","login":true,"inherit":true,"create_db":true,"superuser":false,"bypass_rls":true,"create_role":true,"replication":true},{"name":"service_role","login":false,"inherit":true,"create_db":false,"superuser":false,"bypass_rls":true,"create_role":false,"replication":false},{"name":"supabase_admin","login":true,"inherit":true,"create_db":true,"superuser":true,"bypass_rls":true,"create_role":true,"replication":true}]'::jsonb THEN RAISE EXCEPTION 'IA preflight: managed role attributes drifted';END IF;
  IF NOT has_schema_privilege(current_user,'internal','CREATE') OR NOT has_schema_privilege(current_user,'api','CREATE')
    OR NOT has_schema_privilege('service_role','internal','USAGE')
    OR NOT has_column_privilege(current_user,'auth.users','id','REFERENCES')
    OR NOT EXISTS(SELECT 1 FROM pg_language WHERE lanname='plpgsql'AND has_language_privilege(current_user,oid,'USAGE'))
    OR EXISTS(SELECT 1 FROM pg_default_acl WHERE defaclrole=(SELECT oid FROM pg_roles WHERE rolname=current_user)AND(defaclnamespace=0 OR defaclnamespace IN('internal'::regnamespace,'api'::regnamespace))) THEN
    RAISE EXCEPTION 'IA preflight: reviewed prerequisites/default privileges differ';
  END IF;
  -- Exactly the reviewed source, with only its two outer transaction lines removed.
  EXECUTE $reviewed_ia_body$
-- Preserve the existing per-route 12 requests / sliding 60 seconds rule across
-- replicas/restarts. Identity is verified by the server before this service-only
-- RPC; callers cannot choose a limit, window, or a third budget namespace.

CREATE SCHEMA IF NOT EXISTS internal;
CREATE TABLE IF NOT EXISTS internal.ai_request_rate_state (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  route text NOT NULL CHECK (route IN ('translate', 'menu_extract')),
  hits timestamptz[] NOT NULL DEFAULT ARRAY[]::timestamptz[],
  PRIMARY KEY (user_id, route),
  CONSTRAINT ai_request_rate_state_bounded CHECK (
    cardinality(hits) <= 12 AND array_position(hits, NULL) IS NULL
  )
);
ALTER TABLE internal.ai_request_rate_state ENABLE ROW LEVEL SECURITY;
-- Override inherited default table grants too; the RPC does not need DELETE.
REVOKE ALL ON TABLE internal.ai_request_rate_state FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA internal TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE internal.ai_request_rate_state TO service_role;

CREATE OR REPLACE FUNCTION api.admit_ai_request(p_user_id uuid, p_route text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $fn$
DECLARE
  v_now timestamptz;
  v_hits timestamptz[];
  v_count integer;
  v_retry integer;
BEGIN
  IF p_user_id IS NULL OR p_route IS NULL OR p_route NOT IN ('translate', 'menu_extract') THEN
    RAISE EXCEPTION 'Invalid AI admission identity or route' USING ERRCODE = '22023';
  END IF;

  INSERT INTO internal.ai_request_rate_state (user_id, route)
  VALUES (p_user_id, p_route)
  ON CONFLICT (user_id, route) DO NOTHING;

  SELECT s.hits INTO v_hits
  FROM internal.ai_request_rate_state AS s
  WHERE s.user_id = p_user_id AND s.route = p_route
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'AI admission identity unavailable' USING ERRCODE = '42501';
  END IF;

  -- Take time after obtaining the key's lock, not before waiting for a competing
  -- admission. Equality at 60s expires, matching both former JS predicates.
  v_now := clock_timestamp();
  SELECT COALESCE(array_agg(h.at ORDER BY h.at), ARRAY[]::timestamptz[])
  INTO v_hits FROM unnest(v_hits) AS h(at)
  WHERE h.at > v_now - interval '60 seconds';
  v_count := cardinality(v_hits);
  IF v_count >= 12 THEN
    v_retry := LEAST(60, GREATEST(1, ceil(extract(epoch FROM (v_hits[1] + interval '60 seconds' - v_now)))::integer));
    RETURN jsonb_build_object('allowed', false, 'remaining', 0, 'retry_after', v_retry);
  END IF;

  UPDATE internal.ai_request_rate_state
  SET hits = array_append(v_hits, v_now)
  WHERE user_id = p_user_id AND route = p_route;
  RETURN jsonb_build_object('allowed', true, 'remaining', 11 - v_count, 'retry_after', 0);
END;
$fn$;
REVOKE ALL ON FUNCTION api.admit_ai_request(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION api.admit_ai_request(uuid, text) TO service_role;
COMMENT ON FUNCTION api.admit_ai_request(uuid, text) IS
  'Service-only atomic 12/60s sliding AI request admission per verified user and route. No provider text/key stored. Local CPU leases remain separate.';

NOTIFY pgrst, 'reload schema';
$reviewed_ia_body$;

  v_fn:=to_regprocedure('api.admit_ai_request(uuid,text)');v_table:=to_regclass('internal.ai_request_rate_state');
  IF v_fn IS NULL OR v_table IS NULL OR NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=v_fn
      AND md5(replace(prosrc,E'\r',''))='e1d162dce1e5e78db99a005b6773fd96'
      AND NOT prosecdef AND NOT proretset AND NOT proisstrict AND NOT proleakproof
      AND prokind='f'AND provolatile='v'AND proparallel='u'AND pronargs=2 AND pronargdefaults=0
      AND prorettype='jsonb'::regtype AND prolang=(SELECT oid FROM pg_language WHERE lanname='plpgsql')
      AND proowner=(SELECT oid FROM pg_roles WHERE rolname='postgres')
      AND proconfig=ARRAY['search_path=pg_catalog, pg_temp'])THEN
    RAISE EXCEPTION 'IA postcondition: function identity/body/security differs';
  END IF;
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='api'AND p.proname='admit_ai_request')<>1
    OR NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=v_table AND relkind='r'AND relrowsecurity AND NOT relforcerowsecurity AND relowner=(SELECT oid FROM pg_roles WHERE rolname='postgres'))
    OR (SELECT count(*)FROM pg_attribute WHERE attrelid=v_table AND attnum>0 AND NOT attisdropped)<>3
    OR (SELECT count(*)FROM pg_attribute WHERE attrelid=v_table AND NOT attisdropped AND attnotnull AND ((attname='user_id'AND atttypid='uuid'::regtype)OR(attname='route'AND atttypid='text'::regtype)OR(attname='hits'AND atttypid='timestamptz[]'::regtype)))<>3
    OR (SELECT count(*)FROM pg_constraint WHERE conrelid=v_table)<>4
    OR NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=v_table AND contype='p'AND conkey=ARRAY[1,2]::smallint[])
    OR NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=v_table AND contype='f'AND confrelid='auth.users'::regclass AND confdeltype='c'AND conkey=ARRAY[1]::smallint[])
    OR NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=v_table AND conname='ai_request_rate_state_bounded'AND contype='c'AND convalidated)
    OR EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='internal'AND tablename='ai_request_rate_state')THEN
    RAISE EXCEPTION 'IA postcondition: registry schema/constraints/RLS differ';
  END IF;
  IF NOT has_function_privilege('service_role',v_fn,'EXECUTE')
    OR NOT has_table_privilege('service_role',v_table,'SELECT')OR NOT has_table_privilege('service_role',v_table,'INSERT')OR NOT has_table_privilege('service_role',v_table,'UPDATE')
    OR has_table_privilege('service_role',v_table,'DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
    OR EXISTS(SELECT 1 FROM unnest(ARRAY['anon','authenticated','bertel_thesaurus_publisher'])role_name
      WHERE has_function_privilege(role_name,v_fn,'EXECUTE')OR has_table_privilege(role_name,v_table,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'))
    OR EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl)a WHERE c.oid=v_table AND a.grantee NOT IN(c.relowner,(SELECT oid FROM pg_roles WHERE rolname='service_role')))
    OR EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl)a WHERE p.oid=v_fn AND a.grantee NOT IN(p.proowner,(SELECT oid FROM pg_roles WHERE rolname='service_role')))THEN
    RAISE EXCEPTION 'IA postcondition: exact service-only permissions differ';
  END IF;
END
$guarded_ia_migration$;
