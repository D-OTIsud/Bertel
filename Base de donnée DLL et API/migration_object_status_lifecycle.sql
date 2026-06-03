-- migration_object_status_lifecycle.sql
-- Editor "Save + status + publish lifecycle" tranche (B2 / §24 P1.2, §25 audit).
-- Adds api.rpc_set_object_status — ONE RPC for the whole object status state
-- machine — and rewrites api.rpc_publish_object as a thin wrapper over it.
-- Idempotent + transaction-wrapped. Depends on api.user_can_publish_object
-- (rls_policies.sql) + trg_guard_object_status_change (migration_permission_write_paths.sql).
-- Apply order: AFTER migration_permission_write_paths_b.sql (manifest step 8f).
\set ON_ERROR_STOP on
BEGIN;

CREATE OR REPLACE FUNCTION api.rpc_set_object_status(p_object_id text, p_status text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, api, auth
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_current   object_status;
  v_published timestamptz;
  v_target    object_status;
BEGIN
  -- 0. Auth context required (mirrors rpc_create_object / rpc_publish_object).
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'NO_AUTH_CONTEXT: rpc_set_object_status requires an authenticated user (auth.uid() is NULL)';
  END IF;

  -- 1. Validate the requested status against the enum.
  IF p_status NOT IN ('draft','published','hidden','archived') THEN
    RAISE EXCEPTION 'INVALID_STATUS: unknown status %, valid: draft, published, hidden, archived', p_status;
  END IF;
  v_target := p_status::object_status;

  -- 2. Load current state.
  SELECT status, published_at INTO v_current, v_published FROM object WHERE id = p_object_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: object % does not exist', p_object_id;
  END IF;

  -- 3. No-op (idempotent): same status -> return unchanged.
  IF v_target = v_current THEN
    RETURN v_current::text;
  END IF;

  -- 4. Authorize — same predicate as rpc_publish_object + the status guard trigger.
  --    No superuser bypass: the OTI superuser is granted publish_object via /team.
  IF NOT api.user_can_publish_object(p_object_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: status change requires the publish_object permission and an ORG that publishes this object';
  END IF;

  -- 5. Validate the transition. "draft = pre-publication only" (no published->draft).
  --    Restore from archived lands in the correct pre-archive lane via published_at.
  IF NOT (
       (v_current = 'draft'     AND v_target IN ('published','archived'))
    OR (v_current = 'published' AND v_target IN ('hidden','archived'))
    OR (v_current = 'hidden'    AND v_target IN ('published','archived'))
    OR (v_current = 'archived'  AND v_target = 'hidden' AND v_published IS NOT NULL)
    OR (v_current = 'archived'  AND v_target = 'draft'  AND v_published IS NULL)
  ) THEN
    RAISE EXCEPTION 'INVALID_TRANSITION: % -> % is not allowed', v_current, v_target;
  END IF;

  -- 6. Apply. trg_guard_object_status_change re-checks (passes via user_can_publish_object).
  --    published_at is managed by trg_manage_object_published_at on first publish.
  UPDATE object
     SET status = v_target, updated_by = v_caller_id, updated_at = NOW()
   WHERE id = p_object_id;

  RETURN v_target::text;
END;
$$;

REVOKE EXECUTE ON FUNCTION api.rpc_set_object_status(text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.rpc_set_object_status(text, text) TO   authenticated, service_role;

-- rpc_publish_object becomes a thin wrapper (signature unchanged -> existing grants/callers intact).
-- Behaviour change (intentional, more correct): publish(false) on a never-published draft now
-- raises INVALID_TRANSITION instead of forcing 'hidden' (unpublish only applies to published objects).
CREATE OR REPLACE FUNCTION api.rpc_publish_object(p_object_id text, p_publish boolean DEFAULT TRUE)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, api, auth
AS $$
BEGIN
  PERFORM api.rpc_set_object_status(p_object_id, CASE WHEN p_publish THEN 'published' ELSE 'hidden' END);
END;
$$;

REVOKE EXECUTE ON FUNCTION api.rpc_publish_object(text, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.rpc_publish_object(text, boolean) TO   authenticated, service_role;

COMMIT;
