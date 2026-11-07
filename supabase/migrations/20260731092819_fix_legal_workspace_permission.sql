-- Expose the dedicated, object-scoped legal authorization probe to the editor.
-- The previous aggregate omitted it, so the UI fell back to platform-wide
-- `directWrite` and rendered legal fields/documents read-only for normal editors.
CREATE OR REPLACE FUNCTION api.get_object_workspace_permissions(p_object_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, api
AS $$
DECLARE
  v_canonical           boolean := false;
  v_enrichment          boolean := false;
  v_publish             boolean := false;
  v_private_notes       boolean := false;
  v_owner               boolean := false;
  v_crm                 boolean := false;
  v_legal               boolean := false;
  v_org_admin           boolean := false;
  v_platform_superuser  boolean := false;
BEGIN
  BEGIN v_canonical := COALESCE(api.user_can_write_canonical(p_object_id), false);
  EXCEPTION WHEN OTHERS THEN v_canonical := false; END;

  BEGIN v_enrichment := COALESCE(api.user_can_write_enrichment(p_object_id), false);
  EXCEPTION WHEN OTHERS THEN v_enrichment := false; END;

  BEGIN v_publish := COALESCE(api.user_can_publish_object(p_object_id), false);
  EXCEPTION WHEN OTHERS THEN v_publish := false; END;

  BEGIN v_private_notes := COALESCE(api.can_write_object_private_notes(p_object_id), false);
  EXCEPTION WHEN OTHERS THEN v_private_notes := false; END;

  BEGIN v_owner := COALESCE(api.is_object_owner(p_object_id), false);
  EXCEPTION WHEN OTHERS THEN v_owner := false; END;

  BEGIN v_crm := COALESCE(api.user_can_write_crm(p_object_id), false);
  EXCEPTION WHEN OTHERS THEN v_crm := false; END;

  BEGIN v_legal := COALESCE(api.user_can_manage_object_legal(p_object_id), false);
  EXCEPTION WHEN OTHERS THEN v_legal := false; END;

  BEGIN v_org_admin := COALESCE(api.current_user_is_org_admin(), false);
  EXCEPTION WHEN OTHERS THEN v_org_admin := false; END;

  BEGIN v_platform_superuser := COALESCE(api.is_platform_superuser(), false);
  EXCEPTION WHEN OTHERS THEN v_platform_superuser := false; END;

  RETURN jsonb_build_object(
    'canonical',          v_canonical,
    'enrichment',         v_enrichment,
    'publish',            v_publish,
    'private_notes',      v_private_notes,
    'owner',              v_owner,
    'crm',                v_crm,
    'legal',              v_legal,
    'org_admin',          v_org_admin,
    'platform_superuser', v_platform_superuser
  );
END;
$$;

COMMENT ON FUNCTION api.get_object_workspace_permissions(text) IS
  'Agrège en un appel les 9 sondes de permission de l''éditeur pour un objet, '
  'dont la permission juridique dédiée. SECURITY INVOKER volontairement ; '
  'chaque sonde échoue fermée et indépendamment.';

REVOKE ALL ON FUNCTION api.get_object_workspace_permissions(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION api.get_object_workspace_permissions(text) FROM anon;
GRANT EXECUTE ON FUNCTION api.get_object_workspace_permissions(text) TO authenticated, service_role;

DO $$
DECLARE
  v_keys text[];
BEGIN
  SELECT array_agg(k ORDER BY k)
    INTO v_keys
    FROM jsonb_object_keys(api.get_object_workspace_permissions('__objet_inexistant__')) AS k;

  IF v_keys IS DISTINCT FROM ARRAY[
    'canonical','crm','enrichment','legal','org_admin','owner','platform_superuser','private_notes','publish'
  ] THEN
    RAISE EXCEPTION 'get_object_workspace_permissions : clés inattendues %', v_keys;
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
