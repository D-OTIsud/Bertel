-- CRM POST uploads retain private provenance before any Storage effect.
BEGIN;
-- The privileged task attachment must use the qualified task gate from CRM unlink.
DO $guard$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc p
    WHERE p.oid=pg_catalog.to_regprocedure('api.user_can_write_crm_task(uuid)')
      AND p.proowner='postgres'::pg_catalog.regrole AND p.prosecdef
      AND p.proconfig=ARRAY['search_path=pg_catalog, pg_temp']
      AND md5(replace(p.prosrc,chr(13),''))='88aab566d045a8b02b7f2cfb6f718cd4') THEN
    RAISE EXCEPTION 'CRM document uploads require the qualified current task gate';
  END IF;
END;
$guard$;
-- Both fresh and upgraded databases must keep erasure closed until its reader
-- includes upload/detachment provenance and safe shared-file handling.
DO $gdpr_hold$
DECLARE
  v_tuple_count integer;
  v_signature text;
  v_oid oid;
  v_owner oid;
  v_definition text;
  v_role text;
BEGIN
  SELECT count(*) INTO v_tuple_count FROM (VALUES
    (to_regclass('internal.gdpr_cleanup_task') IS NOT NULL),
    (to_regprocedure('api.rpc_gdpr_get_cleanup_status(uuid)') IS NOT NULL),
    (to_regprocedure('api.rpc_gdpr_ack_cleanup_task(uuid,uuid,boolean,text)') IS NOT NULL)
  ) members(present) WHERE present;
  IF v_tuple_count NOT IN (0,3) THEN
    RAISE EXCEPTION 'Incomplete GDPR cleanup tuple before CRM upload provenance';
  END IF;
  IF to_regprocedure('api.rpc_gdpr_erase_subject(text,text,text,text)') IS NULL THEN
    RAISE EXCEPTION 'Missing GDPR erasure entry point';
  END IF;
  FOREACH v_signature IN ARRAY ARRAY[
    'api.rpc_gdpr_erase_subject(text,text,text,text)',
    'api.rpc_gdpr_get_cleanup_status(uuid)'
  ] LOOP
    v_oid:=to_regprocedure(v_signature);
    IF v_oid IS NULL THEN CONTINUE; END IF;
    SELECT p.proowner,pg_get_functiondef(p.oid) INTO STRICT v_owner,v_definition
      FROM pg_catalog.pg_proc p WHERE p.oid=v_oid;
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',v_signature);
    IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc p
      WHERE p.oid=v_oid AND p.proowner=v_owner AND pg_get_functiondef(p.oid)=v_definition) THEN
      RAISE EXCEPTION 'GDPR hold changed function identity or definition';
    END IF;
    IF EXISTS(SELECT 1 FROM pg_catalog.pg_proc p
      CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
      WHERE p.oid=v_oid AND a.grantee<>p.proowner) THEN
      RAISE EXCEPTION 'GDPR hold retains a non-owner function grant';
    END IF;
    FOREACH v_role IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
      IF has_function_privilege(v_role,v_oid,'EXECUTE') THEN
        RAISE EXCEPTION 'GDPR hold retains API execution';
      END IF;
    END LOOP;
  END LOOP;
END;
$gdpr_hold$;

CREATE TABLE internal.crm_document_upload (
  id uuid PRIMARY KEY,
  parent_kind text NOT NULL CHECK (parent_kind IN ('actor','task')),
  parent_id uuid NOT NULL,
  prepared_actor_id uuid,
  uploaded_by uuid NOT NULL,
  storage_bucket text NOT NULL CHECK (storage_bucket='actor-documents'),
  storage_path text NOT NULL UNIQUE,
  title text NOT NULL CHECK (btrim(title)<>''),
  mime_type text NOT NULL CHECK (mime_type IN ('application/pdf','image/jpeg')),
  size_bytes bigint NOT NULL CHECK (size_bytes>0),
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  state text NOT NULL DEFAULT 'prepared' CHECK (state IN ('prepared','uploaded','attached')),
  prepared_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  uploaded_at timestamptz,
  attached_at timestamptz,
  attached_actor_id uuid,
  CHECK ((state='prepared')=(uploaded_at IS NULL)),
  CHECK ((state='attached')=(attached_at IS NOT NULL))
);
ALTER TABLE internal.crm_document_upload OWNER TO postgres;
ALTER TABLE internal.crm_document_upload ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE internal.crm_document_upload FROM PUBLIC,anon,authenticated,service_role;
CREATE INDEX crm_document_upload_prepared_actor_idx ON internal.crm_document_upload(prepared_actor_id) WHERE prepared_actor_id IS NOT NULL;
CREATE INDEX crm_document_upload_attached_actor_idx ON internal.crm_document_upload(attached_actor_id) WHERE attached_actor_id IS NOT NULL;
CREATE INDEX crm_document_upload_parent_idx ON internal.crm_document_upload(parent_kind,parent_id);
CREATE INDEX crm_document_upload_user_idx ON internal.crm_document_upload(uploaded_by);
COMMENT ON TABLE internal.crm_document_upload IS
 'Private immutable upload intent and attachment receipt. No cascade FK. Prepared and attached actor snapshots and the filename title require future GDPR discovery/redaction. No receipt authorizes physical cleanup.';

-- Reuse the current CRM predicates and the trusted sandbox exclusion of CRM unlink.
CREATE FUNCTION internal.crm_document_upload_actor(p_parent_kind text,p_parent_id uuid)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path=pg_catalog,pg_temp AS $function$
DECLARE v_user uuid:=auth.uid(); v_actor uuid;
BEGIN
  IF v_user IS NULL OR auth.role() IS DISTINCT FROM 'authenticated'
    OR EXISTS(SELECT 1 FROM internal.sandbox_discovery_identity WHERE user_id=v_user)
    OR (auth.jwt()->'app_metadata') @> '{"sandbox_discovery":true}'::jsonb
    OR NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=v_user
      AND NOT COALESCE(u.raw_app_meta_data @> '{"sandbox_discovery":true}'::jsonb,false)) THEN
    RAISE EXCEPTION 'CRM document upload forbidden' USING ERRCODE='42501';
  END IF;
  IF p_parent_kind='actor' THEN
    PERFORM 1 FROM public.actor WHERE id=p_parent_id FOR SHARE;
    IF NOT FOUND OR api.user_can_write_crm_actor(p_parent_id) IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'CRM document upload forbidden' USING ERRCODE='42501';
    END IF;
    v_actor:=p_parent_id;
  ELSIF p_parent_kind='task' THEN
    SELECT actor_id INTO v_actor FROM public.crm_task WHERE id=p_parent_id FOR SHARE;
    IF NOT FOUND OR api.user_can_write_crm_task(p_parent_id) IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'CRM document upload forbidden' USING ERRCODE='42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'Invalid CRM upload parent' USING ERRCODE='22023';
  END IF;
  RETURN v_actor;
END;
$function$;
REVOKE ALL ON FUNCTION internal.crm_document_upload_actor(text,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION api.prepare_crm_document_upload(
 p_upload_id uuid,p_parent_kind text,p_parent_id uuid,p_title text,
 p_mime_type text,p_extension text,p_size_bytes bigint,p_sha256 text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $function$
DECLARE v_actor uuid; v_path text; v_upload internal.crm_document_upload;
BEGIN
  v_actor:=internal.crm_document_upload_actor(p_parent_kind,p_parent_id);
  IF p_upload_id IS NULL OR p_title IS NULL OR btrim(p_title)='' OR p_sha256 IS NULL
    OR p_sha256 !~ '^[0-9a-f]{64}$' OR p_size_bytes IS NULL OR p_size_bytes<=0
    OR NOT COALESCE((p_mime_type='application/pdf' AND p_extension='pdf' AND p_size_bytes<=5242880)
      OR (p_mime_type='image/jpeg' AND p_extension='jpg' AND p_size_bytes<=20971520),false) THEN
    RAISE EXCEPTION 'Invalid CRM upload metadata' USING ERRCODE='22023';
  END IF;
  v_path:=CASE p_parent_kind WHEN 'actor' THEN 'actors/' ELSE 'tasks/' END
    ||p_parent_id::text||'/'||p_upload_id::text||'.'||p_extension;
  INSERT INTO internal.crm_document_upload(id,parent_kind,parent_id,prepared_actor_id,uploaded_by,
    storage_bucket,storage_path,title,mime_type,size_bytes,sha256)
  VALUES(p_upload_id,p_parent_kind,p_parent_id,v_actor,auth.uid(),'actor-documents',v_path,
    p_title,p_mime_type,p_size_bytes,p_sha256) ON CONFLICT(id) DO NOTHING;
  SELECT * INTO STRICT v_upload FROM internal.crm_document_upload WHERE id=p_upload_id FOR UPDATE;
  PERFORM internal.crm_document_upload_actor(p_parent_kind,p_parent_id);
  IF v_upload.uploaded_by IS DISTINCT FROM auth.uid() OR v_upload.parent_kind IS DISTINCT FROM p_parent_kind
    OR v_upload.parent_id IS DISTINCT FROM p_parent_id OR v_upload.storage_path IS DISTINCT FROM v_path
    OR v_upload.title IS DISTINCT FROM p_title OR v_upload.mime_type IS DISTINCT FROM p_mime_type
    OR v_upload.size_bytes IS DISTINCT FROM p_size_bytes OR v_upload.sha256 IS DISTINCT FROM p_sha256 THEN
    RAISE EXCEPTION 'CRM upload intent mismatch' USING ERRCODE='22023';
  END IF;
  IF v_upload.state='prepared' AND EXISTS(SELECT 1 FROM public.ref_document WHERE id=v_upload.id) THEN
    RAISE EXCEPTION 'CRM upload document identity already exists' USING ERRCODE='22023';
  END IF;
  RETURN jsonb_build_object('uploadId',v_upload.id,'documentId',v_upload.id,
    'bucket',v_upload.storage_bucket,'path',v_upload.storage_path,'state',v_upload.state);
END;
$function$;

-- Only the trusted uploader can acknowledge the exact prepared bytes and locator.
CREATE FUNCTION api.confirm_crm_document_upload(
 p_upload_id uuid,p_user_id uuid,p_storage_path text,p_sha256 text,p_size_bytes bigint,p_mime_type text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $function$
DECLARE v_upload internal.crm_document_upload;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'CRM upload confirmation forbidden' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_upload FROM internal.crm_document_upload WHERE id=p_upload_id FOR UPDATE;
  IF NOT FOUND OR v_upload.uploaded_by IS DISTINCT FROM p_user_id
    OR v_upload.storage_path IS DISTINCT FROM p_storage_path OR v_upload.sha256 IS DISTINCT FROM p_sha256
    OR v_upload.size_bytes IS DISTINCT FROM p_size_bytes OR v_upload.mime_type IS DISTINCT FROM p_mime_type THEN
    RAISE EXCEPTION 'CRM upload confirmation mismatch' USING ERRCODE='22023';
  END IF;
  IF v_upload.state='prepared' THEN
    UPDATE internal.crm_document_upload SET state='uploaded',uploaded_at=clock_timestamp() WHERE id=p_upload_id;
  END IF;
  RETURN jsonb_build_object('uploadId',v_upload.id,'state',CASE WHEN v_upload.state='attached' THEN 'attached' ELSE 'uploaded' END);
END;
$function$;

CREATE FUNCTION api.attach_crm_document_upload(p_upload_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $function$
DECLARE v_upload internal.crm_document_upload; v_actor uuid;
BEGIN
  -- Read only the routing identity before the parent lock. Never return a prior
  -- result until the caller's CURRENT authority and ownership have been checked.
  SELECT * INTO v_upload FROM internal.crm_document_upload WHERE id=p_upload_id;
  IF NOT FOUND OR v_upload.uploaded_by IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'CRM document upload forbidden' USING ERRCODE='42501';
  END IF;
  v_actor:=internal.crm_document_upload_actor(v_upload.parent_kind,v_upload.parent_id);
  SELECT * INTO STRICT v_upload FROM internal.crm_document_upload WHERE id=p_upload_id FOR UPDATE;
  v_actor:=internal.crm_document_upload_actor(v_upload.parent_kind,v_upload.parent_id);
  IF v_upload.state='prepared' THEN
    RAISE EXCEPTION 'CRM upload is not confirmed' USING ERRCODE='55000';
  END IF;
  IF v_upload.state='uploaded' THEN
    BEGIN
      INSERT INTO public.ref_document(id,url,title,storage_bucket,storage_path,access_scope,extra)
    VALUES(v_upload.id,'storage://'||v_upload.storage_bucket||'/'||v_upload.storage_path,
      v_upload.title,v_upload.storage_bucket,v_upload.storage_path,'crm_private',
      jsonb_build_object('mime_type',v_upload.mime_type,'size_bytes',v_upload.size_bytes));
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'document_create_failed' USING ERRCODE='PT500';
    END;
    IF v_upload.parent_kind='actor' THEN
      INSERT INTO public.actor_document(actor_id,document_id,title,created_by)
      VALUES(v_upload.parent_id,v_upload.id,v_upload.title,v_upload.uploaded_by);
    ELSE
      INSERT INTO public.crm_task_document(task_id,document_id,title,created_by)
      VALUES(v_upload.parent_id,v_upload.id,v_upload.title,v_upload.uploaded_by);
    END IF;
    UPDATE internal.crm_document_upload SET state='attached',attached_at=clock_timestamp(),attached_actor_id=v_actor
      WHERE id=p_upload_id;
  END IF;
  RETURN jsonb_build_object('documentId',v_upload.id,'title',v_upload.title);
END;
$function$;

ALTER FUNCTION internal.crm_document_upload_actor(text,uuid) OWNER TO postgres;
ALTER FUNCTION api.prepare_crm_document_upload(uuid,text,uuid,text,text,text,bigint,text) OWNER TO postgres;
ALTER FUNCTION api.confirm_crm_document_upload(uuid,uuid,text,text,bigint,text) OWNER TO postgres;
ALTER FUNCTION api.attach_crm_document_upload(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION api.prepare_crm_document_upload(uuid,text,uuid,text,text,text,bigint,text),
 api.confirm_crm_document_upload(uuid,uuid,text,text,bigint,text),api.attach_crm_document_upload(uuid)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION api.prepare_crm_document_upload(uuid,text,uuid,text,text,text,bigint,text),
 api.attach_crm_document_upload(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION api.confirm_crm_document_upload(uuid,uuid,text,text,bigint,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
