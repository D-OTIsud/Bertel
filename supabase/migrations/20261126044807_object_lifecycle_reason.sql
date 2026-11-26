-- A justification belongs to the status transition, not the last object editor.
-- Apply after the lifecycle/version readers and prepared thesaurus publication.
-- No existing history is backfilled or relabelled. Both signatures remain explicit
-- (no default third argument, so PostgREST can resolve legacy requests).
BEGIN;

CREATE OR REPLACE FUNCTION api.rpc_set_object_status(
  p_object_id text,
  p_status text,
  p_reason text
)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, api, auth, pg_temp
AS $lifecycle$
DECLARE
  v_caller_id uuid := auth.uid();
  v_current public.object_status;
  v_target public.object_status;
  v_published timestamptz;
  v_previous_version integer;
  v_new_version integer;
  v_reason text := NULLIF(regexp_replace(p_reason, '^[[:space:]]+|[[:space:]]+$', '', 'g'), '');
  v_requires_reason boolean;
  v_rows integer;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'NO_AUTH_CONTEXT: rpc_set_object_status requires an authenticated user';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('draft', 'published', 'hidden', 'archived') THEN
    RAISE EXCEPTION 'INVALID_STATUS: unknown status %', p_status;
  END IF;
  v_target := p_status::public.object_status;

  -- Match the canonical statement guards before taking any object row lock.
  -- Otherwise publication could own the source fence while waiting on our row.
  PERFORM thesaurus.take_source_gate();
  PERFORM thesaurus.take_writer_gate();

  SELECT o.status, o.published_at, o.current_version
    INTO v_current, v_published, v_previous_version
    FROM public.object o
   WHERE o.id = p_object_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: object % does not exist', p_object_id;
  END IF;
  IF NOT COALESCE(api.user_can_publish_object(p_object_id), false) THEN
    RAISE EXCEPTION 'FORBIDDEN: status change requires publish_object and the current publisher organisation';
  END IF;

  -- A retried request cannot amend the comment or author of a past action.
  IF v_target = v_current THEN
    RETURN v_current::text;
  END IF;
  IF NOT (
       (v_current = 'draft' AND v_target IN ('published', 'archived'))
    OR (v_current = 'published' AND v_target IN ('hidden', 'archived'))
    OR (v_current = 'hidden' AND v_target IN ('published', 'archived'))
    OR (v_current = 'archived' AND v_target = 'hidden' AND v_published IS NOT NULL)
    OR (v_current = 'archived' AND v_target = 'draft' AND v_published IS NULL)
  ) THEN
    RAISE EXCEPTION 'INVALID_TRANSITION: % -> % is not allowed', v_current, v_target;
  END IF;

  -- Restoring an ever-published archive also targets hidden; it is not a
  -- depublication and must remain possible without a justification.
  v_requires_reason := v_target = 'archived'
    OR (v_current = 'published' AND v_target = 'hidden');
  IF v_requires_reason AND v_reason IS NULL THEN
    RAISE EXCEPTION 'REASON_REQUIRED: a justification is required to archive or unpublish';
  END IF;

  UPDATE public.object
     SET status = v_target, updated_by = v_caller_id, updated_at = now()
   WHERE id = p_object_id
   RETURNING current_version INTO v_new_version;

  IF v_requires_reason THEN
    -- The normal status UPDATE just appended this snapshot. Complete only its
    -- metadata in this transaction; never search for or modify an older event.
    UPDATE public.object_version v
       SET change_reason = v_reason
     WHERE v.object_id = p_object_id
       AND v.version_number = v_new_version
       AND v.version_number > COALESCE(v_previous_version, 0)
       AND v.change_type = 'update'
       AND v.created_by = v_caller_id
       AND v.data ->> 'status' = p_status
       AND v.change_reason IS NULL;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 1 THEN
      RAISE EXCEPTION 'LIFECYCLE_HISTORY_MISSING: status and justification could not be recorded atomically';
    END IF;
  END IF;
  RETURN v_target::text;
END;
$lifecycle$;

-- Old publication/restoration callers keep their signature. Destructive legacy
-- calls now fail explicitly instead of silently creating an unexplained action.
CREATE OR REPLACE FUNCTION api.rpc_set_object_status(p_object_id text, p_status text)
RETURNS text
LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public, api, auth, pg_temp
AS $legacy$
  SELECT api.rpc_set_object_status(p_object_id, p_status, NULL::text);
$legacy$;

REVOKE ALL ON FUNCTION api.rpc_set_object_status(text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION api.rpc_set_object_status(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.rpc_set_object_status(text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION api.rpc_set_object_status(text, text) TO authenticated, service_role;

COMMENT ON FUNCTION api.rpc_set_object_status(text, text, text) IS
  'Canonical status transition; archive and published-to-hidden require a nonblank reason stored on their newly created object_version.';

NOTIFY pgrst, 'reload schema';
COMMIT;
