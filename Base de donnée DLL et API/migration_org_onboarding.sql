-- migration_org_onboarding.sql
-- Création d'organisation (ORG) par un superadmin plateforme — voie UNIQUE de création d'ORG.
--
-- Pourquoi une RPC dédiée (et pas api.rpc_create_object) : rpc_create_object force
-- status='draft' et rpc_publish_object exige une ORG *publisher* sur l'objet pour publier —
-- une ORG n'en a pas ⇒ un draft ORG serait à jamais impubliable. On crée donc l'ORG
-- directement 'published'.
--
-- L'INSERT direct en 'published' est licite :
--   - trg_guard_object_status_change est BEFORE UPDATE OF status (il ne gate PAS l'INSERT) ;
--   - trg_manage_object_published_at ne gère que le PASSAGE à published lors d'un UPDATE, donc
--     on pose published_at explicitement à l'INSERT ;
--   - trg_auto_attach_object_to_creator_org (AFTER INSERT) retourne NEW immédiatement pour une
--     ORG (schema_unified.sql:6297 « une ORG ne s'auto-rattache pas ») — aucun object_org_link.
-- Une ORG naît publiée : la lisibilité RLS pour ses membres (memberships, /team, branding) en
-- dépend, et l'Explorer exclut le type ORG de toute façon.
--
-- Apply order : APRÈS rls_policies.sql (dépend de api.is_platform_superuser) et schema_unified.sql
-- (dépend de org_config + les triggers object). Non foldé dans schema_unified.sql (référence
-- api.is_platform_superuser de rls_policies.sql). Voir docs/SQL_ROLLOUT_RUNBOOK.md.
\set ON_ERROR_STOP on
BEGIN;

-- -------------------------------------------------------
-- api.rpc_create_org(p_name, p_region_code, p_access_scope)
-- Crée une organisation (objet ORG published + org_config) en une transaction.
-- Superadmin plateforme uniquement. Retourne l'id TEXT généré (format ORGRUN…).
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION api.rpc_create_org(
  p_name         text,
  p_region_code  text DEFAULT 'RUN',
  p_access_scope text DEFAULT 'own_objects_only'
)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, api, auth
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_name      text := trim(coalesce(p_name, ''));
  v_new_id    text;
BEGIN
  -- 0. Contexte utilisateur requis (auth.uid() NULL en appel service_role pur).
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION
      'NO_AUTH_CONTEXT: rpc_create_org requiert un utilisateur authentifié (auth.uid() est NULL)';
  END IF;

  -- 1. Autorisation : superadmin plateforme uniquement (pas d'admin d'ORG).
  IF NOT api.is_platform_superuser() THEN
    RAISE EXCEPTION
      'FORBIDDEN: la création d''organisation est réservée au superadmin plateforme';
  END IF;

  -- 2. Nom obligatoire.
  IF v_name = '' THEN
    RAISE EXCEPTION 'MISSING_REQUIRED_FIELD: le nom de l''organisation est obligatoire';
  END IF;

  -- 3. Périmètre d'accès valide (mêmes valeurs que le CHECK de org_config).
  IF p_access_scope NOT IN ('own_objects_only', 'all_published') THEN
    RAISE EXCEPTION
      'INVALID_ACCESS_SCOPE: % (attendu: own_objects_only | all_published)', p_access_scope;
  END IF;

  -- 4. Doublon : nom identique (casse-insensible) dans la même région.
  IF EXISTS (
    SELECT 1 FROM object o
    WHERE o.object_type = 'ORG'
      AND lower(o.name) = lower(v_name)
      AND o.region_code IS NOT DISTINCT FROM p_region_code
  ) THEN
    RAISE EXCEPTION
      'DUPLICATE_ORG: une organisation « % » existe déjà pour la région %', v_name, p_region_code;
  END IF;

  -- 5. Insertion : id NULL → généré par trg_before_insert_object_generate_id (ORGRUN…).
  --    published_at posé explicitement (aucun UPDATE ⇒ trg_manage_object_published_at ne fire pas).
  INSERT INTO object (object_type, name, region_code, status, published_at,
                      created_by, updated_by, created_at, updated_at)
  VALUES ('ORG', v_name, p_region_code, 'published', NOW(),
          v_caller_id, v_caller_id, NOW(), NOW())
  RETURNING id INTO v_new_id;

  -- 6. Configuration ORG (périmètre d'accès des membres).
  INSERT INTO org_config (org_object_id, access_scope)
  VALUES (v_new_id, p_access_scope);

  RETURN v_new_id;
END;
$$;

COMMENT ON FUNCTION api.rpc_create_org(text, text, text) IS
'Crée une organisation (objet ORG published + org_config) en une transaction. Superadmin plateforme uniquement — voie UNIQUE de création d''ORG (jamais rpc_create_object ni le dialog B1).';

REVOKE EXECUTE ON FUNCTION api.rpc_create_org(text, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.rpc_create_org(text, text, text) TO authenticated, service_role;

-- -------------------------------------------------------
-- api.rpc_list_orgs()
-- Liste des ORG avec périmètre d'accès + effectif actif (memberships is_active).
-- Alimente le module « Organisations » de la console admin ET le sélecteur d'ORG /team
-- du superadmin. Superadmin plateforme uniquement.
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION api.rpc_list_orgs()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, api, auth
AS $$
DECLARE
  v_out jsonb;
BEGIN
  IF NOT api.is_platform_superuser() THEN
    RAISE EXCEPTION
      'FORBIDDEN: la liste des organisations est réservée au superadmin plateforme';
  END IF;

  SELECT COALESCE(jsonb_agg(row_json ORDER BY created_at), '[]'::jsonb)
    INTO v_out
    FROM (
      SELECT o.created_at,
             jsonb_build_object(
               'id',          o.id,
               'name',        o.name,
               'status',      o.status::text,
               'regionCode',  o.region_code,
               'accessScope', oc.access_scope,
               'memberCount', COALESCE(m.cnt, 0),
               'createdAt',   o.created_at
             ) AS row_json
        FROM object o
        LEFT JOIN org_config oc ON oc.org_object_id = o.id
        LEFT JOIN (
          SELECT uom.org_object_id, count(*) AS cnt
          FROM user_org_membership uom
          WHERE uom.is_active
          GROUP BY uom.org_object_id
        ) m ON m.org_object_id = o.id
       WHERE o.object_type = 'ORG'
    ) s;

  RETURN v_out;
END;
$$;

COMMENT ON FUNCTION api.rpc_list_orgs() IS
'Liste des organisations (ORG) avec périmètre d''accès et effectif actif. Superadmin plateforme uniquement.';

REVOKE EXECUTE ON FUNCTION api.rpc_list_orgs() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.rpc_list_orgs() TO authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
