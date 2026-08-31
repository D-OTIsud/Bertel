-- rollback_role_permission_matrix.sql
-- Annule migration_role_permission_matrix.sql (manifeste 17i, §227).
--
-- CE QUE CE ROLLBACK RESTAURE
--   1. `api.user_has_permission` dans sa forme d'AVANT le 2026-08-31 : chemin individuel OU
--      héritage `org_permission`. (Définition recopiée telle quelle depuis la base vive avant
--      migration — ne pas la « moderniser » ici : un rollback doit rendre l'état antérieur,
--      pas une variante.)
--   2. `api.rpc_grant_org_permission` / `api.rpc_revoke_org_permission`.
--   3. Supprime la matrice et ses RPC.
--
-- ⚠️ APRÈS ROLLBACK, LES DROITS CHANGENT.
--   Les membres qui tenaient un droit PAR LEUR RÔLE le perdent instantanément : la table qui
--   le portait n'existe plus. Si `migration_role_permission_cleanup.sql` a déjà tourné, les
--   droits individuels correspondants ont été désactivés — il faut alors rejouer
--   `rollback_role_permission_cleanup.sql` AVANT celui-ci, sinon les Éditeurs se retrouvent
--   à zéro droit. Ordre de rollback : cleanup, PUIS matrix.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Garde : ne pas laisser l'équipe sans droits.
-- ─────────────────────────────────────────────────────────────────────────────
DO $guard$
DECLARE
  v_sans_droit integer;
BEGIN
  -- Après suppression de la matrice, un membre n'aura plus que ses droits INDIVIDUELS.
  -- On compte ceux qui n'en ont aucun alors qu'ils portent un rôle censé en donner.
  SELECT count(*) INTO v_sans_droit
  FROM user_org_membership uom
  JOIN user_org_business_role ubr ON ubr.membership_id = uom.id AND ubr.is_active
  JOIN ref_org_business_role  r   ON r.id = ubr.role_id
  WHERE uom.is_active
    AND r.code IN ('contributor', 'editor')
    AND NOT EXISTS (
      SELECT 1 FROM user_permission up WHERE up.user_id = uom.user_id AND up.is_active
    );

  IF v_sans_droit > 0 THEN
    RAISE EXCEPTION
      'STOP: % membre(s) Contributeur/Éditeur se retrouveraient à 0 droit. '
      'Rejouez d''abord rollback_role_permission_cleanup.sql, qui réactive leurs droits individuels.',
      v_sans_droit;
  END IF;
END
$guard$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Restaurer la fonction d'origine (chemin individuel OU héritage ORG).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION api.user_has_permission(p_permission_code text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'api', 'auth'
AS $function$
  WITH perm AS (
    SELECT id
    FROM ref_permission
    WHERE code = p_permission_code
      AND is_active = TRUE
    LIMIT 1
  )
  SELECT
    EXISTS (
      SELECT 1
      FROM user_permission up
      JOIN perm p ON p.id = up.permission_id
      WHERE up.user_id   = auth.uid()
        AND up.is_active = TRUE
    )
    OR
    EXISTS (
      SELECT 1
      FROM org_permission op
      JOIN perm p ON p.id = op.permission_id
      JOIN user_org_membership uom ON uom.org_object_id = op.org_object_id
      WHERE uom.user_id   = auth.uid()
        AND uom.is_active = TRUE
        AND op.is_active  = TRUE
    );
$function$;

COMMENT ON FUNCTION api.user_has_permission(text) IS NULL;
COMMENT ON TABLE public.org_permission IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Restaurer les deux RPC d'octroi ORG.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION api.rpc_grant_org_permission(p_org_object_id text, p_permission_code text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'api', 'auth'
AS $function$
DECLARE
  v_caller_id     uuid := auth.uid();
  v_caller_rank   integer;
  v_permission_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM object WHERE id = p_org_object_id AND object_type = 'ORG'
  ) THEN
    RAISE EXCEPTION 'INVALID_ORG: p_org_object_id doit référencer un objet de type ORG (valeur reçue : %)', p_org_object_id;
  END IF;

  SELECT id INTO v_permission_id
  FROM ref_permission WHERE code = p_permission_code AND is_active = TRUE;
  IF v_permission_id IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND: code permission inconnu ou inactif : %', p_permission_code;
  END IF;

  IF NOT api.is_platform_superuser() THEN
    SELECT r.rank INTO v_caller_rank
    FROM user_org_membership uom
    JOIN user_org_admin_role uar ON uar.membership_id = uom.id AND uar.is_active = TRUE
    JOIN ref_org_admin_role  r   ON r.id = uar.role_id
    WHERE uom.user_id       = v_caller_id
      AND uom.org_object_id = p_org_object_id
      AND uom.is_active     = TRUE;

    IF v_caller_rank IS NULL THEN
      RAISE EXCEPTION 'FORBIDDEN: vous n''avez pas de rôle d''administration dans cette ORG';
    END IF;
    IF v_caller_rank < 30 THEN
      RAISE EXCEPTION 'INSUFFICIENT_RANK: rang minimum requis 30 (org_admin) pour modifier les permissions de l''ORG';
    END IF;
  END IF;

  INSERT INTO org_permission (org_object_id, permission_id, is_active, granted_by, granted_at, created_at, updated_at)
  VALUES (p_org_object_id, v_permission_id, TRUE, v_caller_id, NOW(), NOW(), NOW())
  ON CONFLICT (org_object_id, permission_id) DO UPDATE
    SET is_active  = TRUE,
        granted_by = EXCLUDED.granted_by,
        granted_at = EXCLUDED.granted_at,
        updated_at = NOW();
END;
$function$;

CREATE OR REPLACE FUNCTION api.rpc_revoke_org_permission(p_org_object_id text, p_permission_code text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'api', 'auth'
AS $function$
DECLARE
  v_caller_id     uuid := auth.uid();
  v_caller_rank   integer;
  v_permission_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM object WHERE id = p_org_object_id AND object_type = 'ORG'
  ) THEN
    RAISE EXCEPTION 'INVALID_ORG: p_org_object_id doit référencer un objet de type ORG (valeur reçue : %)', p_org_object_id;
  END IF;

  SELECT id INTO v_permission_id
  FROM ref_permission WHERE code = p_permission_code;
  IF v_permission_id IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND: code permission inconnu : %', p_permission_code;
  END IF;

  IF NOT api.is_platform_superuser() THEN
    SELECT r.rank INTO v_caller_rank
    FROM user_org_membership uom
    JOIN user_org_admin_role uar ON uar.membership_id = uom.id AND uar.is_active = TRUE
    JOIN ref_org_admin_role  r   ON r.id = uar.role_id
    WHERE uom.user_id       = v_caller_id
      AND uom.org_object_id = p_org_object_id
      AND uom.is_active     = TRUE;

    IF v_caller_rank IS NULL THEN
      RAISE EXCEPTION 'FORBIDDEN: vous n''avez pas de rôle d''administration dans cette ORG';
    END IF;
    IF v_caller_rank < 30 THEN
      RAISE EXCEPTION 'INSUFFICIENT_RANK: rang minimum requis 30 (org_admin) pour modifier les permissions de l''ORG';
    END IF;
  END IF;

  UPDATE org_permission
     SET is_active  = FALSE,
         updated_at = NOW()
   WHERE org_object_id = p_org_object_id
     AND permission_id = v_permission_id
     AND is_active     = TRUE;
END;
$function$;

REVOKE ALL ON FUNCTION api.rpc_grant_org_permission(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION api.rpc_revoke_org_permission(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION api.rpc_grant_org_permission(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION api.rpc_revoke_org_permission(text, text) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Restaurer le roster dans sa forme 17d (colonne `inherited_permission_codes`,
--    alimentée par `org_permission`). DROP + CREATE : le nom de colonne change.
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS api.rpc_list_org_members(text);

CREATE FUNCTION api.rpc_list_org_members(p_org_object_id text)
 RETURNS TABLE(
   membership_id uuid, user_id uuid, email text, display_name text, is_active boolean,
   business_role_code text, admin_role_code text, permission_codes text[],
   last_seen_at timestamptz, inherited_permission_codes text[], is_platform_superuser boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'api', 'auth'
AS $function$
BEGIN
  IF NOT (
    api.is_platform_superuser()
    OR EXISTS (
      SELECT 1 FROM user_org_membership m
      JOIN user_org_admin_role uar ON uar.membership_id = m.id AND uar.is_active = TRUE
      WHERE m.user_id = auth.uid() AND m.is_active = TRUE AND m.org_object_id = p_org_object_id
    )
  ) THEN
    RAISE EXCEPTION 'INSUFFICIENT_RANK: an active admin role in this org is required to list its members'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    m.id, m.user_id, u.email::text, p.display_name, m.is_active,
    br.code::text, ar.code::text,
    COALESCE((
      SELECT array_agg(rp.code::text ORDER BY rp.code)
      FROM user_permission up JOIN ref_permission rp ON rp.id = up.permission_id
      WHERE up.user_id = m.user_id AND up.is_active = TRUE
    ), ARRAY[]::text[]),
    GREATEST(
      u.last_sign_in_at,
      (SELECT max(s.updated_at) FROM auth.sessions s WHERE s.user_id = m.user_id)
    ),
    COALESCE((
      SELECT array_agg(rp2.code::text ORDER BY rp2.code)
      FROM org_permission op JOIN ref_permission rp2 ON rp2.id = op.permission_id
      WHERE op.org_object_id = m.org_object_id AND op.is_active = TRUE
    ), ARRAY[]::text[]),
    COALESCE(p.role IN ('owner', 'super_admin'), FALSE)
  FROM user_org_membership m
  LEFT JOIN auth.users u                ON u.id = m.user_id
  LEFT JOIN app_user_profile p          ON p.id = m.user_id
  LEFT JOIN user_org_business_role ubr  ON ubr.membership_id = m.id AND ubr.is_active = TRUE
  LEFT JOIN ref_org_business_role br    ON br.id = ubr.role_id
  LEFT JOIN user_org_admin_role uar2    ON uar2.membership_id = m.id AND uar2.is_active = TRUE
  LEFT JOIN ref_org_admin_role ar       ON ar.id = uar2.role_id
  WHERE m.org_object_id = p_org_object_id AND m.is_active = TRUE
  ORDER BY p.display_name NULLS LAST, u.email;
END;
$function$;

REVOKE ALL ON FUNCTION api.rpc_list_org_members(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION api.rpc_list_org_members(text) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Supprimer la matrice et ses RPC.
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS api.rpc_set_role_permission(text, text, text, boolean);
DROP FUNCTION IF EXISTS api.rpc_list_role_permissions(text);
DROP TABLE IF EXISTS public.org_role_permission CASCADE;

COMMIT;
