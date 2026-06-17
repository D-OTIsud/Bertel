-- Base de donnée DLL et API/migration_object_version_read_restore.sql
-- §3.C — Editor "Versions / historique" tool: read history + canonical restore over the existing
-- append-only object_version table (snapshot JSONB of the object row, captured by save_object_version()).
-- Three SECURITY DEFINER RPCs:
--   (1) api.get_object_versions     — authorize-once (§36) timeline; resolves the author via
--       app_user_profile.display_name; computes changed_fields = the keys whose value differs from the
--       previous version (LAG(data) OVER version_number), MINUS the cache/updated_at/current_version
--       columns (mirrors save_object_version's own ignore-list ⇒ no noise rows in the diff).
--   (2) api.get_object_version_snapshot — same authorize-once; returns the data jsonb of one version.
--   (3) api.rpc_restore_object_version — gated by api.user_can_write_object_canonical; UPDATE object SET
--       only the WRITABLE CANONICAL columns from the snapshot. EXCLUDES id, current_version, created_at,
--       created_by, updated_at, is_editing, every cached_* column, the generated columns
--       (name_normalized/name_search_vector are GENERATED ALWAYS ⇒ cannot be assigned), and STATUS.
--       Status is excluded ON PURPOSE: status changes go through rpc_set_object_status / rpc_publish_object,
--       enforced by trg_guard_object_status_change (BEFORE UPDATE OF status) — by NOT listing status in the
--       SET clause that trigger never fires, so a restore can never silently un/re-publish a fiche.
--       The existing save_object_version trigger auto-captures a NEW version for this UPDATE: history is
--       append-only; restore = a new version forward, never a rewrite of the past.
-- AUTHORIZE-ONCE (§36): the read RPCs are PostgREST-executable (authenticated). They self-authorize their
--   p_object_id against api.current_user_readable_object_ids() (published ∪ extended = the object table's
--   own SELECT visibility) — never trust the caller's id. The 0028/0029 SECURITY-DEFINER advisor on these
--   RPCs is EXPECTED (§36 precedent).
-- DIFF IGNORE-LIST LOCKSTEP: the `ignore_keys` array below MUST stay byte-identical to DIFF_IGNORE_KEYS in
--   bertel-tourism-ui/src/services/object-versions.ts (the TS mirror used by computeVersionDiff in the
--   modal). It is the save_object_version() ignore-set (15 keys) PLUS the never-meaningful identity/audit
--   keys (id/created_at/created_by/updated_by) and the GENERATED columns (name_normalized/name_search_vector).
-- PREREQUISITES: migration_cards_batch_authorize_definer.sql (api.current_user_readable_object_ids),
--   migration_permission_write_paths.sql (api.user_can_write_object_canonical), schema_unified.sql
--   (object, object_version, save_object_version, app_user_profile). Manifest step 14r.
-- IDEMPOTENT: CREATE OR REPLACE FUNCTION + guarded grants. REVERSIBLE: DROP the three functions.
\set ON_ERROR_STOP on
BEGIN;

-- (1) Timeline + per-version changed_fields. The cache/meta ignore-list is the SAME set
--     save_object_version() strips (plus identity/audit/generated keys), so a captured version never
--     differs only on noise. Kept byte-identical to DIFF_IGNORE_KEYS in object-versions.ts.
CREATE OR REPLACE FUNCTION api.get_object_versions(
  p_object_id text,
  p_limit     int DEFAULT 50,
  p_offset    int DEFAULT 0
)
RETURNS TABLE(
  version_number int,
  created_at     timestamptz,
  created_by_name text,
  change_type    text,
  change_reason  text,
  changed_fields text[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, api, auth
AS $$
BEGIN
  -- authorize-once: never trust the caller's id (PostgREST-executable).
  IF p_object_id NOT IN (SELECT api.current_user_readable_object_ids()) THEN
    RAISE EXCEPTION 'FORBIDDEN: object % is not readable by the current user', p_object_id
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH ignore_keys AS (
    SELECT ARRAY[
      'updated_at','is_editing','commercial_visibility',
      'cached_min_price','cached_main_image_url','cached_rating','cached_review_count',
      'cached_is_open_now','cached_amenity_codes','cached_payment_codes','cached_environment_tags',
      'cached_language_codes','cached_classification_codes','cached_taxonomy_codes',
      'current_version','updated_by','created_at','created_by','id',
      'name_normalized','name_search_vector'
    ]::text[] AS keys
  ), ordered AS (
    SELECT
      ov.version_number,
      ov.created_at,
      ov.created_by,
      ov.change_type,
      ov.change_reason,
      ov.data,
      LAG(ov.data) OVER (ORDER BY ov.version_number) AS prev_data
    FROM object_version ov
    WHERE ov.object_id = p_object_id
  )
  SELECT
    o.version_number,
    o.created_at,
    COALESCE(p.display_name, '') AS created_by_name,
    o.change_type,
    o.change_reason,
    COALESCE(
      (
        SELECT array_agg(k ORDER BY k)
        FROM jsonb_object_keys(o.data) AS k
        CROSS JOIN ignore_keys ik
        WHERE o.prev_data IS NOT NULL  -- the first version has no "changed" set (full snapshot)
          AND NOT (k = ANY(ik.keys))   -- ik.keys is an array VALUE (cross-joined CTE) ⇒ text = ANY(text[]); ANY((SELECT …)) would be text = text[]
          AND (o.data -> k) IS DISTINCT FROM (o.prev_data -> k)
      ),
      '{}'::text[]
    ) AS changed_fields
  FROM ordered o
  LEFT JOIN app_user_profile p ON p.id = o.created_by
  ORDER BY o.version_number DESC
  LIMIT GREATEST(COALESCE(p_limit, 50), 0)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;

REVOKE EXECUTE ON FUNCTION api.get_object_versions(text, int, int) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.get_object_versions(text, int, int) TO authenticated, service_role;

-- (2) Single-version snapshot (the full data jsonb) for the detailed diff.
CREATE OR REPLACE FUNCTION api.get_object_version_snapshot(
  p_object_id      text,
  p_version_number int
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, api, auth
AS $$
DECLARE
  v_data jsonb;
BEGIN
  IF p_object_id NOT IN (SELECT api.current_user_readable_object_ids()) THEN
    RAISE EXCEPTION 'FORBIDDEN: object % is not readable by the current user', p_object_id
      USING ERRCODE = '42501';
  END IF;

  SELECT ov.data INTO v_data
  FROM object_version ov
  WHERE ov.object_id = p_object_id AND ov.version_number = p_version_number
  ORDER BY ov.created_at DESC
  LIMIT 1;

  RETURN v_data;  -- NULL if the version does not exist (the client renders an empty diff)
END;
$$;

REVOKE EXECUTE ON FUNCTION api.get_object_version_snapshot(text, int) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.get_object_version_snapshot(text, int) TO authenticated, service_role;

-- (3) Restore: apply ONLY writable canonical columns from the snapshot. EXCLUDES id, current_version,
--     created_at/by, updated_at, is_editing, all cached_*, the generated columns, and STATUS.
CREATE OR REPLACE FUNCTION api.rpc_restore_object_version(
  p_object_id      text,
  p_version_number int
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, api, auth
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_data   jsonb;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'NO_AUTH_CONTEXT: rpc_restore_object_version requires an authenticated user';
  END IF;
  IF NOT api.user_can_write_object_canonical(p_object_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: restoring a version requires canonical-write rights on object %', p_object_id
      USING ERRCODE = '42501';
  END IF;

  SELECT ov.data INTO v_data
  FROM object_version ov
  WHERE ov.object_id = p_object_id AND ov.version_number = p_version_number
  ORDER BY ov.created_at DESC
  LIMIT 1;
  IF v_data IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND: version % of object % does not exist', p_version_number, p_object_id;
  END IF;

  -- Writable canonical columns only. Explicit list (NOT a generic jsonb_populate) so a future column
  -- is opt-in and status/caches/identity/generated columns can never be reached by a restore.
  UPDATE object SET
    object_type       = COALESCE((v_data ->> 'object_type'), object_type::text)::object_type,
    name              = COALESCE((v_data ->> 'name'), name),
    business_timezone = COALESCE((v_data ->> 'business_timezone'), business_timezone),
    commercial_visibility = COALESCE((v_data ->> 'commercial_visibility'), commercial_visibility),
    region_code       = NULLIF(v_data ->> 'region_code', ''),
    updated_at_source = CASE WHEN v_data ? 'updated_at_source'
                             THEN (v_data ->> 'updated_at_source')::timestamptz ELSE updated_at_source END,
    secondary_types   = CASE WHEN v_data ? 'secondary_types'
                             THEN ARRAY(SELECT jsonb_array_elements_text(v_data -> 'secondary_types'))::object_type[]
                             ELSE secondary_types END,
    extra             = CASE WHEN v_data ? 'extra' THEN (v_data -> 'extra') ELSE extra END,
    name_i18n         = CASE WHEN v_data ? 'name_i18n' THEN (v_data -> 'name_i18n') ELSE name_i18n END,
    updated_by        = v_caller,
    updated_at        = NOW()
  WHERE id = p_object_id;
  -- The trg_object_version trigger fires on this UPDATE and appends a new version (append-only).
END;
$$;

REVOKE EXECUTE ON FUNCTION api.rpc_restore_object_version(text, int) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.rpc_restore_object_version(text, int) TO authenticated, service_role;

COMMIT;

-- After applying to a live database: NOTIFY pgrst, 'reload schema';
