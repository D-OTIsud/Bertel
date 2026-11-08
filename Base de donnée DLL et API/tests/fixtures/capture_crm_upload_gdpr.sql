\set ON_ERROR_STOP on
-- Disposable fresh-only proof, before the provenance migration closes old entry points.
CREATE TEMP TABLE crm_upload_gdpr_before(admin_authorized boolean,erase_allowed boolean,status_allowed boolean,definitions jsonb);
BEGIN;
\ir object_current_rights.sql
SELECT pg_temp.setup_current_rights_fixture() AS fixture \gset crm_upload_
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-00000000ae15","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT api.is_platform_superuser() AS admin_authorized,
 has_function_privilege('authenticated','api.rpc_gdpr_erase_subject(text,text,text,text)','EXECUTE') AS erase_allowed,
 has_function_privilege('service_role','api.rpc_gdpr_get_cleanup_status(uuid)','EXECUTE') AS status_allowed
\gset crm_upload_before_
RESET ROLE;
ROLLBACK;
INSERT INTO crm_upload_gdpr_before
SELECT :'crm_upload_before_admin_authorized'::boolean,:'crm_upload_before_erase_allowed'::boolean,
 :'crm_upload_before_status_allowed'::boolean,jsonb_agg(jsonb_build_object(
 'signature',signature,'oid',p.oid,'owner',p.proowner,'definition',pg_get_functiondef(p.oid)) ORDER BY signature)
FROM (VALUES('api.rpc_gdpr_erase_subject(text,text,text,text)'),('api.rpc_gdpr_get_cleanup_status(uuid)')) f(signature)
JOIN pg_catalog.pg_proc p ON p.oid=to_regprocedure(signature);
DO $capture$
BEGIN
 IF (SELECT admin_authorized AND erase_allowed AND status_allowed
     AND jsonb_array_length(definitions)=2 FROM crm_upload_gdpr_before) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Fresh administrative authority and both old entry grants must be positive before the hold';
 END IF;
END;
$capture$;
