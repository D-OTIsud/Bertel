-- Close new caller/server admissions without changing code, claims or receipts.
-- Already admitted/in-flight requests are not cancelled by an EXECUTE revocation.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';
SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('bertel:gdpr:activation', 0));
DO $guard$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'GDPR closure requires the reviewed postgres operator' USING ERRCODE='42501';
  END IF;
END;
$guard$;
REVOKE ALL ON FUNCTION
  api.rpc_gdpr_start_erasure(uuid,text,text,text,text),
  api.rpc_gdpr_find_start_request(uuid),
  api.rpc_gdpr_get_cleanup_status(uuid),
  api.rpc_gdpr_claim_cleanup_task(uuid,uuid,uuid,text,jsonb,text),
  api.rpc_gdpr_ack_cleanup_attempt(uuid,uuid,uuid,boolean,boolean,text),
  api.rpc_gdpr_refuse_cleanup_task(uuid,uuid,text,jsonb,text)
FROM PUBLIC, anon, authenticated, service_role;
DO $postcheck$
DECLARE f text; api_role text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'api.rpc_gdpr_start_erasure(uuid,text,text,text,text)',
    'api.rpc_gdpr_find_start_request(uuid)',
    'api.rpc_gdpr_get_cleanup_status(uuid)',
    'api.rpc_gdpr_claim_cleanup_task(uuid,uuid,uuid,text,jsonb,text)',
    'api.rpc_gdpr_ack_cleanup_attempt(uuid,uuid,uuid,boolean,boolean,text)',
    'api.rpc_gdpr_refuse_cleanup_task(uuid,uuid,text,jsonb,text)'] LOOP
    FOREACH api_role IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
      IF pg_catalog.has_function_privilege(api_role,f,'EXECUTE') THEN
        RAISE EXCEPTION 'GDPR closure ACL postcheck failed: % / %',f,api_role USING ERRCODE='55000';
      END IF;
    END LOOP;
  END LOOP;
END;
$postcheck$;
NOTIFY pgrst, 'reload schema';
COMMIT;
