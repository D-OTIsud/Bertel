-- Retire seulement le lien CRM demandé. Le catalogue et le fichier peuvent
-- appartenir à un autre usage, y compris à un rattachement concurrent.
BEGIN;

-- Trace privée de l'edge retiré. Aucune FK ne doit effacer cette provenance
-- lors du retrait ultérieur d'un parent, du document ou du compte appelant.
CREATE TABLE internal.crm_document_detachment (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  parent_kind text NOT NULL CHECK (parent_kind IN ('actor', 'task')),
  parent_id uuid NOT NULL,
  document_id uuid NOT NULL,
  subject_actor_id uuid,
  storage_bucket text,
  storage_path text,
  detached_by uuid NOT NULL,
  detached_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  CONSTRAINT crm_document_detachment_locator_pair CHECK (
    (storage_bucket IS NULL AND storage_path IS NULL)
    OR (storage_bucket IS NOT NULL AND storage_bucket = 'actor-documents'
      AND storage_path IS NOT NULL AND storage_path <> ''
      AND storage_path !~ '(^/|^[A-Za-z][A-Za-z0-9+.-]*:|[?#[:cntrl:]])')
  )
);
ALTER TABLE internal.crm_document_detachment OWNER TO postgres;
ALTER TABLE internal.crm_document_detachment ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE internal.crm_document_detachment FROM PUBLIC, anon, authenticated, service_role;
CREATE INDEX crm_document_detachment_subject_idx
  ON internal.crm_document_detachment (subject_actor_id) WHERE subject_actor_id IS NOT NULL;
COMMENT ON TABLE internal.crm_document_detachment IS
  'Provenance privée des liens CRM retirés. Ne confère aucun droit de supprimer une référence ou un fichier. À consulter par le futur inventaire RGPD avant son activation.';

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
    ) THEN
    RETURN 'forbidden';
  END IF;
  PERFORM 1 FROM public.actor WHERE id = p_actor_id FOR SHARE;
  IF NOT FOUND OR api.user_can_write_crm_actor(p_actor_id) IS DISTINCT FROM true THEN
    RETURN 'forbidden';
  END IF;

  -- Ne verrouiller que le document déjà lié à la cible autorisée. Le verrou
  -- du parent puis du catalogue précède celui du lien.
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

  -- Ne recopier aucun URL, même si un ancien storage_path est mal formé.
  IF COALESCE(v_path, '') = '' OR v_path ~ '(^/|^[A-Za-z][A-Za-z0-9+.-]*:|[?#[:cntrl:]])' THEN
    v_bucket := NULL;
    v_path := NULL;
  END IF;
  WITH removed AS (
    DELETE FROM public.actor_document
    WHERE actor_id = p_actor_id AND document_id = p_document_id
    RETURNING actor_id, document_id
  )
  INSERT INTO internal.crm_document_detachment (
    parent_kind, parent_id, document_id, subject_actor_id, storage_bucket, storage_path, detached_by
  )
  SELECT 'actor', actor_id, document_id, actor_id, v_bucket, v_path, v_user_id FROM removed;
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
  v_actor_id uuid;
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
    ) THEN
    RETURN 'forbidden';
  END IF;
  SELECT t.actor_id INTO v_actor_id
  FROM public.crm_task t WHERE t.id = p_task_id FOR SHARE;
  IF NOT FOUND OR api.user_can_write_crm_task(p_task_id) IS DISTINCT FROM true THEN
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
  PERFORM 1 FROM public.crm_task_document
  WHERE task_id = p_task_id AND document_id = p_document_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;

  -- La route autorisait le retrait d'un lien dont le chemin est vide, même
  -- lorsque le bucket est absent ou différent.
  IF COALESCE(v_path, '') <> '' AND v_bucket IS DISTINCT FROM 'actor-documents' THEN
    RETURN 'unexpected_bucket';
  END IF;
  IF v_bucket IS DISTINCT FROM 'actor-documents' OR COALESCE(v_path, '') = ''
    OR v_path ~ '(^/|^[A-Za-z][A-Za-z0-9+.-]*:|[?#[:cntrl:]])' THEN
    v_bucket := NULL;
    v_path := NULL;
  END IF;
  WITH removed AS (
    DELETE FROM public.crm_task_document
    WHERE task_id = p_task_id AND document_id = p_document_id
    RETURNING task_id, document_id
  )
  INSERT INTO internal.crm_document_detachment (
    parent_kind, parent_id, document_id, subject_actor_id, storage_bucket, storage_path, detached_by
  )
  SELECT 'task', task_id, document_id, v_actor_id, v_bucket, v_path, v_user_id FROM removed;
  RETURN CASE WHEN FOUND THEN 'deleted' ELSE 'not_found' END;
END;
$function$;

REVOKE ALL ON FUNCTION api.unlink_crm_actor_document(uuid, uuid),
  api.unlink_crm_task_document(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION api.unlink_crm_actor_document(uuid, uuid),
  api.unlink_crm_task_document(uuid, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
