-- migration_sp4_list_org_members.sql
-- SP-4 — roster read with member IDENTITIES (email in auth.users is not client-readable;
-- app_user_profile.display_name is own-or-owner). One SECURITY DEFINER read RPC returns the
-- full team roster for an ORG, gated to platform superuser OR an active admin (any rank) of that ORG.
-- PREREQUISITES: schema_unified.sql, rls_policies.sql (is_platform_superuser). APPLY after rls_policies.sql.
-- IDEMPOTENT: DROP + CREATE (the DROP is required — adding a column to a RETURNS TABLE changes the
-- return type, which CREATE OR REPLACE refuses). REVERSIBLE: DROP FUNCTION api.rpc_list_org_members(text).
BEGIN;

-- `last_seen_at` (added 2026-07-29) changed the return type ⇒ the old signature must go first.
DROP FUNCTION IF EXISTS api.rpc_list_org_members(text);

CREATE OR REPLACE FUNCTION api.rpc_list_org_members(p_org_object_id text)
RETURNS TABLE(
  membership_id uuid,
  user_id uuid,
  email text,
  display_name text,
  is_active boolean,
  business_role_code text,
  admin_role_code text,
  permission_codes text[],
  last_seen_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, api, auth
AS $fn$
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
    -- Dernière activité. `auth.users.last_sign_in_at` NE SUFFIT PAS : une session Supabase survit
    -- des semaines sans nouveau sign-in (mesuré sur live : un compte actif le jour même affichait
    -- un last_sign_in_at vieux de 16 jours). Le vrai signal de présence est le rafraîchissement du
    -- jeton — `auth.sessions.updated_at`, touché à chaque refresh (~1 h) et à chaque connexion.
    -- Les deux sont combinés car la session DISPARAÎT à la déconnexion / expiration : il ne reste
    -- alors que le sign-in. GREATEST ignore les NULL en PostgreSQL ⇒ pas de COALESCE nécessaire.
    -- Granularité assumée : ~1 h (période de refresh du JWT), pas la seconde.
    GREATEST(
      u.last_sign_in_at,
      (SELECT max(s.updated_at) FROM auth.sessions s WHERE s.user_id = m.user_id)
    )
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
$fn$;
REVOKE EXECUTE ON FUNCTION api.rpc_list_org_members(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.rpc_list_org_members(text) TO authenticated, service_role;

COMMIT;
