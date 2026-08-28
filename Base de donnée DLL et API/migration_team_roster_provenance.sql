-- migration_team_roster_provenance.sql
-- Manifeste 17d — lot de corrections 2026-08-28, chantier 1 sous-lot 1c (écran /team honnête).
--
-- CE QUE L'ÉCRAN NE DISAIT PAS. `api.rpc_list_org_members` n'agrège que `user_permission` :
-- l'écran /team ne connaît donc QUE les droits accordés individuellement. Deux conséquences
-- mesurées en production :
--
--   * **D1 — l'héritage d'ORG est invisible.** `org_permission` accorde des droits à TOUS les
--     membres actifs de l'ORG, mais l'écran affiche une case DÉCOCHÉE à côté d'un badge
--     « héritée de l'ORG » (calculé à part). Un administrateur qui coche « pour réparer » crée
--     un DOUBLON — un droit individuel redondant, que plus rien ne distinguera de l'héritage.
--   * **D4 — l'écran ne montre pas l'accès qui compte le plus.** Un rôle d'administration d'ORG
--     ouvre TOUTE l'écriture CRM, et le statut superuser ouvre tout : **5 des 7 Éditeurs de
--     production tiennent leurs droits CRM de leur rôle `team_lead`**, pas de leurs permissions.
--     L'écran ne le disait nulle part, et son compteur « N permissions » pouvait afficher 0 pour
--     quelqu'un qui peut tout faire.
--
-- CE QUE FAIT CETTE MIGRATION : deux colonnes de PROVENANCE, jamais fusionnées avec l'existant.
--   * `inherited_permission_codes text[]` — les droits venus de `org_permission`. **Colonne
--     SÉPARÉE de `permission_codes`, et c'est structurant** : la case à cocher pilote
--     `user_permission` et ne doit JAMAIS prétendre piloter l'héritage. Les fusionner rendrait
--     la case menteuse (décocher un droit hérité ne le retirerait pas).
--   * `is_platform_superuser boolean` — dérivé de `app_user_profile.role`, la même source que
--     `api.is_platform_superuser()`. (La chaîne `auth.role() IN ('service_role','admin')` de
--     cette fonction ne s'applique PAS ici : on décrit un COMPTE, pas la session courante.)
--
-- `adminRoleCode` était déjà rendu par le RPC — il n'était simplement pas AFFICHÉ. C'est le
-- frontend qui le montre désormais (rien à faire côté SQL).
--
-- ⚠️ CHANGEMENT DE TYPE DE RETOUR ⇒ `DROP` + `CREATE` obligatoire (`CREATE OR REPLACE` refuse
-- de modifier un `RETURNS TABLE`). Le DROP **efface les GRANT** : ils sont reposés ci-dessous,
-- à l'identique (`authenticated`, `service_role` ; jamais `anon`) et vérifiés par une garde qui
-- échoue fort. La garde d'autorisation d'entrée (rang admin dans l'ORG, sinon `42501`) est
-- reprise MOT POUR MOT du corps vif.
--
-- Fonction exposée modifiée ⇒ `NOTIFY pgrst, 'reload schema';` requis.
-- Après `rls_policies.sql` (is_platform_superuser) et `migration_sp4_list_org_members.sql`.

\set ON_ERROR_STOP on
BEGIN;

DROP FUNCTION IF EXISTS api.rpc_list_org_members(text);

CREATE FUNCTION api.rpc_list_org_members(p_org_object_id text)
RETURNS TABLE(
  membership_id uuid,
  user_id uuid,
  email text,
  display_name text,
  is_active boolean,
  business_role_code text,
  admin_role_code text,
  permission_codes text[],
  last_seen_at timestamptz,
  -- 17d — provenance. Ces deux colonnes s'AJOUTENT en fin de liste : un client qui ne les
  -- connaît pas encore continue de fonctionner.
  inherited_permission_codes text[],
  is_platform_superuser boolean
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, api, auth
AS $$
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
    -- Derniere activite : last_sign_in_at ne suffit pas (une session survit sans nouveau sign-in),
    -- le signal de presence est le refresh du jeton (auth.sessions.updated_at). GREATEST ignore les NULL.
    GREATEST(
      u.last_sign_in_at,
      (SELECT max(s.updated_at) FROM auth.sessions s WHERE s.user_id = m.user_id)
    ),
    -- 17d — héritage d'ORG. Identique pour tous les membres de l'ORG par construction ; on le
    -- rend par ligne pour que le client n'ait pas à recouper deux sources (c'est ce recoupement
    -- manquant qui produisait la case décochée sous un badge « héritée de l'ORG »).
    COALESCE((
      SELECT array_agg(rp2.code::text ORDER BY rp2.code)
      FROM org_permission op JOIN ref_permission rp2 ON rp2.id = op.permission_id
      WHERE op.org_object_id = m.org_object_id AND op.is_active = TRUE
    ), ARRAY[]::text[]),
    -- 17d — superuser plateforme. Même source que api.is_platform_superuser() côté profil ;
    -- le bras `auth.role()` de cette fonction décrit la SESSION, pas le compte listé.
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
$$;

-- Le DROP a effacé les GRANT : on les repose à l'identique.
REVOKE ALL ON FUNCTION api.rpc_list_org_members(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION api.rpc_list_org_members(text) TO authenticated, service_role;

DO $$
BEGIN
  IF has_function_privilege('anon', 'api.rpc_list_org_members(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'migration_team_roster_provenance: anon ne doit PAS pouvoir lister les membres.';
  END IF;
  IF NOT has_function_privilege('authenticated', 'api.rpc_list_org_members(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'migration_team_roster_provenance: le GRANT authenticated a ete perdu par le DROP.';
  END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
