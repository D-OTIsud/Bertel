-- Base de donnée DLL et API/migration_object_external_id_writes.sql  (manifest step 14q; decision log §A1)
-- Tranche A — §22 « Identifiants externes » CTA fonctionnel.
-- Adds the two admin-gated write RPCs for object_external_id (the table shipped admin_*
-- per-command RLS but NO write RPC) + a tiny front-facing admin-gate helper.
-- All three are SECURITY DEFINER (they bypass the table's admin_* RLS — the IN-FUNCTION
-- gate IS the boundary). UUID via gen_random_uuid(); SET search_path = public, api, internal.
-- Idempotent (CREATE OR REPLACE) + transaction-wrapped.
-- Apply order: AFTER step 1 (object_external_id table) and step 6 (rls_policies.sql:
-- api.is_platform_superuser / api.current_user_admin_role_code / api.current_user_org_id).
\set ON_ERROR_STOP on
BEGIN;

-- 1. Admin-gate helper — single source for the §22 front gate (mirrors the write gate exactly).
CREATE OR REPLACE FUNCTION api.current_user_is_org_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, api, internal
AS $$
  SELECT api.is_platform_superuser() OR api.current_user_admin_role_code() IS NOT NULL;
$$;

REVOKE EXECUTE ON FUNCTION api.current_user_is_org_admin() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.current_user_is_org_admin() TO   authenticated, service_role;

-- 2. Upsert one external identifier on the CURRENT USER'S ORG (server-derived org; admin-only;
--    canonical sources rejected). ON CONFLICT respects uq_object_external_id_object_org_source.
CREATE OR REPLACE FUNCTION api.rpc_upsert_object_external_id(
  p_object_id text,
  p_source_system text,
  p_external_id text,
  p_last_synced_at timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, api, internal
AS $$
DECLARE
  v_org text;
  v_src text := btrim(coalesce(p_source_system, ''));
  v_ext text := btrim(coalesce(p_external_id, ''));
  v_id  uuid;
BEGIN
  -- Auth context required.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'NO_AUTH_CONTEXT: rpc_upsert_object_external_id requires an authenticated user';
  END IF;

  -- Admin gate (platform superuser OR ORG admin). Fail-closed.
  IF NOT api.current_user_is_org_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: managing external identifiers requires a platform superuser or an ORG admin role';
  END IF;

  -- Required inputs.
  IF v_src = '' OR v_ext = '' THEN
    RAISE EXCEPTION 'INVALID_INPUT: source_system and external_id are required';
  END IF;

  -- Reject canonical sources (OTI / SU / anything *canonical*) — those are platform-owned.
  IF upper(v_src) IN ('OTI','SU') OR lower(v_src) LIKE '%canonical%' THEN
    RAISE EXCEPTION 'CANONICAL_SOURCE: % is a canonical source and cannot be edited here', v_src;
  END IF;

  -- The client never chooses the org — derive it from the active membership.
  v_org := api.current_user_org_id();
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'NO_ORG: the current user has no active ORG membership';
  END IF;

  -- Object must exist (FK would catch it, but give a clean error).
  IF NOT EXISTS (SELECT 1 FROM object WHERE id = p_object_id) THEN
    RAISE EXCEPTION 'NOT_FOUND: object % does not exist', p_object_id;
  END IF;

  INSERT INTO object_external_id (id, object_id, organization_object_id, source_system, external_id, last_synced_at)
  VALUES (gen_random_uuid(), p_object_id, v_org, v_src, v_ext, p_last_synced_at)
  ON CONFLICT (object_id, organization_object_id, source_system) DO UPDATE
    SET external_id    = EXCLUDED.external_id,
        last_synced_at = EXCLUDED.last_synced_at,
        updated_at     = NOW()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION api.rpc_upsert_object_external_id(text, text, text, timestamptz) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.rpc_upsert_object_external_id(text, text, text, timestamptz) TO   authenticated, service_role;

-- 3. Delete one external identifier owned by the current user's ORG (admin-only, non-canonical).
CREATE OR REPLACE FUNCTION api.rpc_delete_object_external_id(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, api, internal
AS $$
DECLARE
  v_org text;
  v_src text;
  v_row_org text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'NO_AUTH_CONTEXT: rpc_delete_object_external_id requires an authenticated user';
  END IF;

  IF NOT api.current_user_is_org_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: managing external identifiers requires a platform superuser or an ORG admin role';
  END IF;

  v_org := api.current_user_org_id();
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'NO_ORG: the current user has no active ORG membership';
  END IF;

  SELECT source_system, organization_object_id INTO v_src, v_row_org
    FROM object_external_id WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: external identifier % does not exist', p_id;
  END IF;

  -- Row must belong to the caller's ORG (platform superuser may delete any non-canonical row).
  IF v_row_org IS DISTINCT FROM v_org AND NOT api.is_platform_superuser() THEN
    RAISE EXCEPTION 'FORBIDDEN: external identifier % does not belong to your organisation', p_id;
  END IF;

  -- Never delete a canonical-source row through this path.
  IF upper(v_src) IN ('OTI','SU') OR lower(v_src) LIKE '%canonical%' THEN
    RAISE EXCEPTION 'CANONICAL_SOURCE: % is a canonical source and cannot be deleted here', v_src;
  END IF;

  DELETE FROM object_external_id WHERE id = p_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION api.rpc_delete_object_external_id(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.rpc_delete_object_external_id(uuid) TO   authenticated, service_role;

COMMIT;
