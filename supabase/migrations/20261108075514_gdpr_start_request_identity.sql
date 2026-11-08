-- Stable START request identity around the unchanged 19a erasure journal.
-- Installation only: every new entry point remains owner-only.
BEGIN;
SET LOCAL search_path = pg_catalog, pg_temp;
SET LOCAL lock_timeout = '5s';

DO $preflight$
DECLARE
  v_erase pg_catalog.regprocedure := pg_catalog.to_regprocedure('api.rpc_gdpr_erase_subject(text,text,text,text)');
BEGIN
  IF v_erase IS NULL OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    WHERE p.oid = v_erase AND p.proowner = 'postgres'::pg_catalog.regrole
      AND p.prosecdef AND p.prokind = 'f' AND p.provolatile = 'v'
      AND p.prorettype = 'pg_catalog.jsonb'::pg_catalog.regtype
      AND p.prolang = (SELECT oid FROM pg_catalog.pg_language WHERE lanname = 'plpgsql')
      AND NOT p.proisstrict AND NOT p.proleakproof AND p.proparallel = 'u'
      AND p.proconfig = ARRAY['search_path=pg_catalog, public, api, auth, audit, internal, pg_temp']
      AND pg_catalog.md5(pg_catalog.replace(p.prosrc, pg_catalog.chr(13), '')) = '690e95cd8f9eee68300c38cec1414714'
  ) OR EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))) a
    WHERE p.oid = v_erase AND a.grantee <> p.proowner
  ) THEN
    RAISE EXCEPTION 'Unexpected closed GDPR erasure predecessor';
  END IF;
  IF pg_catalog.to_regclass('public.gdpr_erasure_log') IS NULL
     OR pg_catalog.to_regclass('internal.gdpr_cleanup_task') IS NULL
     OR pg_catalog.to_regprocedure('internal.gdpr_start_actor_identity()') IS NOT NULL
     OR pg_catalog.to_regprocedure('api.rpc_gdpr_start_erasure(uuid,text,text,text,text)') IS NOT NULL
     OR pg_catalog.to_regprocedure('api.rpc_gdpr_find_start_request(uuid)') IS NOT NULL
     OR pg_catalog.to_regclass('public.gdpr_erasure_log_start_request_key') IS NOT NULL THEN
    RAISE EXCEPTION 'Unexpected GDPR START installation state';
  END IF;
  IF (SELECT count(*) FROM pg_catalog.pg_class c
      WHERE c.oid IN ('public.gdpr_erasure_log'::pg_catalog.regclass, 'internal.gdpr_cleanup_task'::pg_catalog.regclass)
        AND c.relkind = 'r' AND c.relpersistence = 'p' AND c.relowner = 'postgres'::pg_catalog.regrole) <> 2 THEN
    RAISE EXCEPTION 'Unexpected GDPR START journal relations';
  END IF;
END;
$preflight$;

-- The request UUID is not the journal PK. Its exact JSON binding is written only
-- after erase4 returned the real operationId, in the same transaction.
CREATE UNIQUE INDEX gdpr_erasure_log_start_request_key
  ON public.gdpr_erasure_log ((report->>'startRequestId'))
  WHERE pg_catalog.jsonb_typeof(report->'startRequestId') = 'string';

CREATE FUNCTION internal.gdpr_start_actor_identity()
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  -- Same current authority as erase4; never reveal a request before this check.
  IF NOT (session_user IN ('postgres', 'supabase_admin')
          AND COALESCE(NULLIF(current_setting('role', true), ''), 'none') IN ('none', 'postgres', 'supabase_admin')
          AND NULLIF(current_setting('request.jwt.claims', true), '') IS NULL
          AND auth.role() IS NULL)
     AND api.is_platform_superuser() IS NOT TRUE THEN
    RAISE EXCEPTION 'GDPR START access denied' USING ERRCODE = '42501';
  END IF;
  RETURN CASE WHEN v_uid IS NOT NULL THEN 'uid:' || v_uid::text ELSE 'db:' || session_user END;
END;
$function$;

CREATE FUNCTION api.rpc_gdpr_start_erasure(
  p_request_id uuid,
  p_subject_kind text,
  p_subject_id text,
  p_mode text DEFAULT 'anonymize',
  p_reason text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
  v_actor text := internal.gdpr_start_actor_identity();
  v_subject uuid;
  v_existing public.gdpr_erasure_log%ROWTYPE;
  v_report jsonb;
  v_operation uuid;
BEGIN
  IF p_request_id IS NULL OR p_subject_kind IS NULL
     OR p_subject_kind NOT IN ('actor', 'incident', 'review', 'object_legal', 'contact_channel', 'user')
     OR p_mode IS NULL OR p_mode NOT IN ('anonymize', 'delete')
     OR p_subject_id IS NULL OR p_subject_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'Invalid GDPR START request' USING ERRCODE = '22023';
  END IF;
  v_subject := p_subject_id::uuid;

  -- Fixed order: request first, then canonical subject. No provider call occurs
  -- inside this transaction. Different requests cannot bypass unresolved work.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('gdpr-start-request:' || p_request_id::text, 0));
  SELECT * INTO v_existing FROM public.gdpr_erasure_log l
    WHERE l.report->'startRequestId' = pg_catalog.to_jsonb(p_request_id)
    FOR UPDATE;
  IF FOUND THEN
    IF v_existing.report->'startActor' IS DISTINCT FROM pg_catalog.to_jsonb(v_actor)
       OR v_existing.subject_kind IS DISTINCT FROM p_subject_kind
       OR v_existing.subject_id IS DISTINCT FROM v_subject::text
       OR v_existing.mode IS DISTINCT FROM p_mode
       OR v_existing.reason IS DISTINCT FROM p_reason
       OR v_existing.report->'operationId' IS DISTINCT FROM pg_catalog.to_jsonb(v_existing.id) THEN
      RAISE EXCEPTION 'GDPR START request binding mismatch' USING ERRCODE = 'PT409';
    END IF;
    RETURN v_existing.report;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('gdpr-start-subject:' || p_subject_kind || ':' || v_subject::text, 0));
  IF EXISTS (
    SELECT 1 FROM public.gdpr_erasure_log l
    WHERE l.subject_kind = p_subject_kind
      AND CASE WHEN pg_catalog.pg_input_is_valid(l.subject_id, 'uuid') THEN l.subject_id::uuid END = v_subject
      AND (l.report->'operationId' IS DISTINCT FROM pg_catalog.to_jsonb(l.id)
           OR l.report->'manualReviewRequired' IS DISTINCT FROM 'false'::jsonb
           OR EXISTS (SELECT 1 FROM internal.gdpr_cleanup_task t
                      WHERE t.operation_id = l.id AND t.status IS DISTINCT FROM 'succeeded'))
  ) THEN
    RAISE EXCEPTION 'GDPR operation for this subject is unresolved' USING ERRCODE = 'PT409';
  END IF;

  -- Original erasure function, original PK/FKs and original authority checks.
  v_report := api.rpc_gdpr_erase_subject(p_subject_kind, v_subject::text, p_mode, p_reason);
  IF pg_catalog.jsonb_typeof(v_report->'operationId') IS DISTINCT FROM 'string' THEN
    RAISE EXCEPTION 'Invalid GDPR operation receipt';
  END IF;
  v_operation := (v_report->>'operationId')::uuid;
  UPDATE public.gdpr_erasure_log l
    SET report = l.report || pg_catalog.jsonb_build_object('startRequestId', p_request_id, 'startActor', v_actor)
    WHERE l.id = v_operation AND l.report = v_report
      AND l.report->'operationId' = pg_catalog.to_jsonb(l.id)
      AND l.subject_kind = p_subject_kind AND l.subject_id = v_subject::text
      AND l.mode = p_mode AND l.reason IS NOT DISTINCT FROM p_reason
    RETURNING l.report INTO v_report;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'GDPR START receipt binding failed';
  END IF;
  RETURN v_report;
END;
$function$;

-- This lookup never calls START/erase4, claims a task or invokes a provider.
CREATE FUNCTION api.rpc_gdpr_find_start_request(p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
  v_actor text := internal.gdpr_start_actor_identity();
  v_operation uuid;
BEGIN
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'GDPR START request not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT l.id INTO v_operation FROM public.gdpr_erasure_log l
    WHERE l.report->'startRequestId' = pg_catalog.to_jsonb(p_request_id)
      AND l.report->'startActor' = pg_catalog.to_jsonb(v_actor)
      AND l.report->'operationId' = pg_catalog.to_jsonb(l.id);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'GDPR START request not found' USING ERRCODE = 'P0002';
  END IF;
  RETURN pg_catalog.jsonb_build_object('requestId', p_request_id, 'operationId', v_operation);
END;
$function$;

REVOKE ALL ON FUNCTION internal.gdpr_start_actor_identity(),
  api.rpc_gdpr_start_erasure(uuid,text,text,text,text),
  api.rpc_gdpr_find_start_request(uuid) FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION api.rpc_gdpr_start_erasure(uuid,text,text,text,text) IS
  'START idempotent par demande/auteur/snapshot, lie la demande au vrai journal 19a atomiquement. Propriétaire seul ; aucune activation.';
COMMENT ON FUNCTION api.rpc_gdpr_find_start_request(uuid) IS
  'Recherche seule d''une demande START connue par son auteur courant ; absence ne permet jamais un nouveau START automatique. Propriétaire seul.';

DO $postflight$
DECLARE
  v_function regprocedure;
  v_role text;
BEGIN
  FOREACH v_function IN ARRAY ARRAY[
    'internal.gdpr_start_actor_identity()'::regprocedure,
    'api.rpc_gdpr_start_erasure(uuid,text,text,text,text)'::regprocedure,
    'api.rpc_gdpr_find_start_request(uuid)'::regprocedure,
    'api.rpc_gdpr_erase_subject(text,text,text,text)'::regprocedure
  ] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = v_function AND p.proowner = 'postgres'::regrole)
       OR EXISTS (SELECT 1 FROM pg_proc p
      CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
      WHERE p.oid = v_function AND a.grantee <> p.proowner) THEN
      RAISE EXCEPTION 'GDPR START functions must remain owner-only';
    END IF;
    FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
      IF has_function_privilege(v_role, v_function, 'EXECUTE') THEN
        RAISE EXCEPTION 'GDPR START effective API execution must remain closed';
      END IF;
    END LOOP;
  END LOOP;
  IF (SELECT md5(replace(prosrc, chr(13), '')) FROM pg_proc
      WHERE oid = 'api.rpc_gdpr_erase_subject(text,text,text,text)'::regprocedure)
     IS DISTINCT FROM '690e95cd8f9eee68300c38cec1414714' THEN
    RAISE EXCEPTION 'Existing GDPR erasure body changed';
  END IF;
END;
$postflight$;

NOTIFY pgrst, 'reload schema';
COMMIT;
