BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL search_path = pg_catalog, pg_temp;

DO $guard$
DECLARE
  v_erase regprocedure := to_regprocedure('api.rpc_gdpr_erase_subject(text,text,text,text)');
  v_status regprocedure := to_regprocedure('api.rpc_gdpr_get_cleanup_status(uuid)');
  v_ack regprocedure := to_regprocedure('api.rpc_gdpr_ack_cleanup_task(uuid,uuid,boolean,text)');
  v_tasks regclass := to_regclass('internal.gdpr_cleanup_task');
  v_erase_body text;
BEGIN
  SELECT prosrc INTO v_erase_body FROM pg_proc WHERE oid = v_erase;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'GDPR erasure predecessor missing';
  END IF;

  IF v_status IS NOT NULL AND v_ack IS NOT NULL AND v_tasks IS NOT NULL THEN
    IF strpos(v_erase_body, 'operationId') = 0
       OR strpos(v_erase_body, 'internal.gdpr_cleanup_task') = 0 THEN
      RAISE EXCEPTION 'GDPR durable cleanup contract is inconsistent';
    END IF;
    -- A complete durable installation keeps its existing grants.
    RETURN;
  END IF;

  IF v_status IS NOT NULL OR v_ack IS NOT NULL OR v_tasks IS NOT NULL THEN
    RAISE EXCEPTION 'GDPR durable cleanup contract is partially installed';
  END IF;

  -- The installed legacy body can commit an erasure without a durable cleanup receipt.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
     WHERE oid = v_erase
       AND proowner = 'postgres'::regrole
       AND prosecdef
       AND proconfig = ARRAY['search_path=pg_catalog, public, api, auth, audit']
       AND md5(prosrc) = 'e2105031945db1ef4efd383e6493a9b0'
  ) THEN
    RAISE EXCEPTION 'Unrecognized legacy GDPR erasure predecessor';
  END IF;

  REVOKE EXECUTE ON FUNCTION api.rpc_gdpr_erase_subject(text,text,text,text)
    FROM PUBLIC, anon, authenticated, service_role;

  IF has_function_privilege('anon', v_erase::oid, 'EXECUTE')
     OR has_function_privilege('authenticated', v_erase::oid, 'EXECUTE')
     OR has_function_privilege('service_role', v_erase::oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'Legacy GDPR erasure still grants API execution';
  END IF;
END
$guard$;

NOTIFY pgrst, 'reload schema';
COMMIT;
