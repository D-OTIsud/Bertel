-- Avatar-only companion to the closed GDPR durable/provenance migration.
-- Apply after the complete 19a tuple has been installed. No activation grant.
-- The user erasure branch must call:
--   PERFORM internal.gdpr_enqueue_avatar_inventory(v_operation_id, v_user_id);
-- after its historical avatar tasks and before auth_delete/final report.
-- This is a snapshot of known live metadata, not a drain of an upload in flight.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL search_path = pg_catalog, pg_temp;

DO $prerequisites$
BEGIN
  IF pg_catalog.to_regclass('public.gdpr_erasure_log') IS NULL
     OR pg_catalog.to_regclass('internal.gdpr_cleanup_task') IS NULL
     OR pg_catalog.to_regprocedure('api.rpc_gdpr_get_cleanup_status(uuid)') IS NULL
     OR pg_catalog.to_regprocedure('api.rpc_gdpr_ack_cleanup_task(uuid,uuid,boolean,text)') IS NULL
     OR pg_catalog.to_regclass('storage.objects') IS NULL THEN
    RAISE EXCEPTION 'Avatar cleanup requires the complete durable GDPR tuple';
  END IF;
END;
$prerequisites$;

CREATE FUNCTION internal.gdpr_enqueue_avatar_inventory(p_operation_id uuid, p_user_id uuid)
RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE v_count integer;
BEGIN
  -- Lock the operation so repeated inventory calls cannot duplicate its tasks.
  PERFORM 1 FROM public.gdpr_erasure_log e
   WHERE e.id = p_operation_id AND e.subject_kind = 'user'
     AND pg_catalog.lower(e.subject_id) COLLATE pg_catalog."C" = p_user_id::text COLLATE pg_catalog."C"
     AND e.mode IN ('anonymize', 'delete')
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Avatar cleanup operation mismatch' USING ERRCODE = '22023';
  END IF;

  INSERT INTO internal.gdpr_cleanup_task(operation_id, action, metadata)
  SELECT p_operation_id, 'storage_remove', pg_catalog.jsonb_build_object(
    'bucket', 'avatars', 'path', o.name, 'storage_object_id', o.id)
    FROM storage.objects o
   WHERE o.bucket_id COLLATE pg_catalog."C" = 'avatars'
     -- Classic Storage has neither optional field; hosted Storage can have both.
     -- Project the actual row so absent columns never become lazy SQL references.
     AND (pg_catalog.to_jsonb(o)->>'archived_at') IS NULL
     AND (NOT (pg_catalog.to_jsonb(o) ? 'is_delete_marker')
       OR pg_catalog.to_jsonb(o)->'is_delete_marker' = 'false'::jsonb)
     AND (o.name COLLATE pg_catalog."C" = (p_user_id::text || '/avatar.jpg') COLLATE pg_catalog."C"
       OR (pg_catalog.starts_with(o.name, p_user_id::text || '/')
         AND o.name COLLATE pg_catalog."C" ~
           ('^' || p_user_id::text || '/avatar-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.jpg$')))
     AND NOT EXISTS (
       SELECT 1 FROM internal.gdpr_cleanup_task t
        WHERE t.operation_id = p_operation_id AND t.action = 'storage_remove'
          AND t.metadata->>'bucket' = 'avatars' AND t.metadata->>'path' = o.name
     );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;
ALTER FUNCTION internal.gdpr_enqueue_avatar_inventory(uuid,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION internal.gdpr_enqueue_avatar_inventory(uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- This read prevents NEW route requests while an existing durable user operation
-- has outstanding tasks. It does not reserve or drain an already admitted HTTP
-- upload, and it cannot fence external service-role writers or old instances.
CREATE FUNCTION api.avatar_upload_allowed(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $function$
  SELECT p_user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.gdpr_erasure_log e
    JOIN internal.gdpr_cleanup_task t ON t.operation_id = e.id
     WHERE e.subject_kind = 'user'
       AND pg_catalog.lower(e.subject_id) COLLATE pg_catalog."C" = p_user_id::text COLLATE pg_catalog."C"
       AND t.status <> 'succeeded'
  );
$function$;
ALTER FUNCTION api.avatar_upload_allowed(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION api.avatar_upload_allowed(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION api.avatar_upload_allowed(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
