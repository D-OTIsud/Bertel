-- Retire seulement le lien CRM demandé. Le catalogue et le fichier peuvent
-- appartenir à un autre usage, y compris à un rattachement concurrent.
BEGIN;

-- Même prédicat CRM, mais la nouvelle mutation ne doit pas autoriser une
-- tâche à partir d'une relation temporaire portant le même nom.
DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    WHERE p.oid = pg_catalog.to_regprocedure('api.user_can_write_crm_task(uuid)')
      AND p.proowner = 'postgres'::pg_catalog.regrole
      AND pg_catalog.md5(pg_catalog.replace(p.prosrc, pg_catalog.chr(13), '')) = '5424245ffa2634e21aa0e7e66a2f7b21'
      AND pg_catalog.md5(pg_catalog.replace(pg_catalog.pg_get_functiondef(p.oid), pg_catalog.chr(13), '')) = '812d7395cf71a787f932e87334813b2d'
      AND pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
      AND pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE')
      AND NOT EXISTS (
        SELECT 1 FROM pg_catalog.aclexplode(p.proacl) a
        WHERE a.grantee NOT IN ('postgres'::pg_catalog.regrole, 'authenticated'::pg_catalog.regrole, 'service_role'::pg_catalog.regrole)
      )
  ) THEN
    RAISE EXCEPTION 'Unexpected predecessor for api.user_can_write_crm_task(uuid)';
  END IF;
END;
$guard$;

CREATE OR REPLACE FUNCTION api.user_can_write_crm_task(p_task_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $function$
  SELECT COALESCE(
    (SELECT api.user_can_write_crm(ct.object_id) FROM public.crm_task ct WHERE ct.id = p_task_id),
    false);
$function$;

CREATE FUNCTION api.unlink_crm_actor_document(p_actor_id uuid, p_document_id uuid)
RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_status text;
  v_bucket text;
  v_path text;
  v_source text;
  v_document_found boolean;
BEGIN
  IF v_user_id IS NULL OR auth.role() IS DISTINCT FROM 'authenticated' THEN
    RETURN 'forbidden';
  END IF;
  IF EXISTS (SELECT 1 FROM internal.sandbox_discovery_identity WHERE user_id = v_user_id)
    OR (auth.jwt()->'app_metadata') @> '{"sandbox_discovery":true}'::jsonb
    OR NOT EXISTS (
      SELECT 1 FROM auth.users u
      WHERE u.id = v_user_id
        AND NOT COALESCE(u.raw_app_meta_data @> '{"sandbox_discovery":true}'::jsonb, false)
    )
    OR api.user_can_write_crm_actor(p_actor_id) IS DISTINCT FROM true THEN
    RETURN 'forbidden';
  END IF;

  -- Ne verrouiller que le document déjà lié à la cible autorisée. Le verrou
  -- du catalogue précède celui du lien, comme lors d'une purge du catalogue.
  IF NOT EXISTS (
    SELECT 1 FROM public.actor_document
    WHERE actor_id = p_actor_id AND document_id = p_document_id
  ) THEN
    RETURN 'not_found';
  END IF;
  SELECT d.storage_bucket, d.storage_path, d.extra->>'source'
  INTO v_bucket, v_path, v_source
  FROM public.ref_document d WHERE d.id = p_document_id FOR SHARE;
  v_document_found := FOUND;

  SELECT a.status INTO v_status
  FROM public.actor_document a
  WHERE a.actor_id = p_actor_id AND a.document_id = p_document_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;
  IF v_status = 'promoted' THEN RETURN 'promoted_document'; END IF;
  IF NOT v_document_found THEN RETURN 'file_missing'; END IF;
  IF v_bucket IS DISTINCT FROM 'actor-documents' THEN RETURN 'unexpected_bucket'; END IF;
  IF v_source = 'portal_photo' OR starts_with(v_path, 'portal-photos/') THEN
    RETURN 'portal_photo';
  END IF;

  DELETE FROM public.actor_document
  WHERE actor_id = p_actor_id AND document_id = p_document_id;
  RETURN CASE WHEN FOUND THEN 'deleted' ELSE 'not_found' END;
END;
$function$;

CREATE FUNCTION api.unlink_crm_task_document(p_task_id uuid, p_document_id uuid)
RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_bucket text;
  v_path text;
BEGIN
  IF v_user_id IS NULL OR auth.role() IS DISTINCT FROM 'authenticated' THEN
    RETURN 'forbidden';
  END IF;
  IF EXISTS (SELECT 1 FROM internal.sandbox_discovery_identity WHERE user_id = v_user_id)
    OR (auth.jwt()->'app_metadata') @> '{"sandbox_discovery":true}'::jsonb
    OR NOT EXISTS (
      SELECT 1 FROM auth.users u
      WHERE u.id = v_user_id
        AND NOT COALESCE(u.raw_app_meta_data @> '{"sandbox_discovery":true}'::jsonb, false)
    )
    OR api.user_can_write_crm_task(p_task_id) IS DISTINCT FROM true THEN
    RETURN 'forbidden';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.crm_task_document
    WHERE task_id = p_task_id AND document_id = p_document_id
  ) THEN
    RETURN 'not_found';
  END IF;
  SELECT d.storage_bucket, d.storage_path INTO v_bucket, v_path
  FROM public.ref_document d WHERE d.id = p_document_id FOR SHARE;

  -- La route autorisait le retrait d'un lien dont le chemin est vide, même
  -- lorsque le bucket est absent ou différent.
  IF COALESCE(v_path, '') <> '' AND v_bucket IS DISTINCT FROM 'actor-documents' THEN
    RETURN 'unexpected_bucket';
  END IF;
  DELETE FROM public.crm_task_document
  WHERE task_id = p_task_id AND document_id = p_document_id;
  RETURN CASE WHEN FOUND THEN 'deleted' ELSE 'not_found' END;
END;
$function$;

REVOKE ALL ON FUNCTION api.unlink_crm_actor_document(uuid, uuid),
  api.unlink_crm_task_document(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION api.unlink_crm_actor_document(uuid, uuid),
  api.unlink_crm_task_document(uuid, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
