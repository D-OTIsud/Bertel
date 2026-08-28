-- migration_crm_assignee_eligibility.sql
-- Manifeste 17c — lot de corrections 2026-08-28, chantier 6 (signalement PO).
--
-- SYMPTÔME SIGNALÉ : « seuls les utilisateurs ayant accès au CRM — éditeur et plus — devraient
-- se retrouver dans le filtre par personne des tâches et parmi les gens à qui on peut affecter
-- une tâche ».
--
-- MESURÉ EN PRODUCTION, PAS DÉDUIT (2026-08-28). Sur les 9 membres actifs d'OTI du Sud,
-- TROIS n'ont ni rôle admin ni la moindre permission : `isabelle@inativel.fr`,
-- `msmarcel@casud.re`, `nicolas@coq-trotteur.com`. `api.current_user_can_edit_objects()` rend
-- donc FALSE pour eux, et `/crm` les REDIRIGE (voir `src/app/(main)/crm/page.tsx`). Or
-- `api.list_crm_assignees` les proposait, et `api.user_can_assign_crm` les acceptait : sa
-- chaîne ne vérifiait QUE le partage d'une organisation, aucune permission. Leur assigner une
-- tâche les notifiait (16z) au sujet d'un écran qu'ils ne peuvent pas ouvrir.
--
-- POURQUOI LE FILTRE FRONT NE SUFFIT PAS. Un `<select>` restreint n'est pas une garde : le RPC
-- est `SECURITY DEFINER` et exposé à `authenticated`. Tant que `user_can_assign_crm` accepte,
-- l'assignation reste possible en PostgREST direct. La restriction doit vivre côté serveur ;
-- l'UI ne fait que cesser de proposer une impasse.
--
-- LE PRÉDICAT — et pourquoi PAS `write_crm_notes` seul.
-- `api.user_can_write_crm` autorise déjà l'écriture CRM par TROIS chemins : superuser
-- plateforme, OU rang admin d'ORG, OU permission `write_crm_notes`. Se limiter à la seule
-- permission exclurait le compte du PO lui-même (`David Philippe` : rang admin, PAS de
-- `write_crm_notes` directe) — vérifié. Le nouveau prédicat REPREND les trois chemins, pour
-- que « qui peut être assigné » ne puisse pas diverger de « qui peut écrire ».
--
-- Il ajoute une condition que la seule permission ne dit pas : l'ORG doit avoir un PÉRIMÈTRE
-- CRM, c'est-à-dire être `publisher` d'au moins une fiche (`api.current_user_crm_object_ids`
-- ne rend rien sinon, et `api.list_crm_tasks` retourne alors `[]`). Cas réel : le « Comité
-- Régional de Tourisme » n'est publisher d'AUCUNE fiche — son unique membre est admin, donc
-- « autorisé » au sens des permissions, mais son CRM est structurellement vide. Sans cette
-- condition, un superuser aurait pu lui assigner une tâche invisible pour lui.
--
-- CE QUI N'EST PAS FAIT, DÉLIBÉRÉMENT
--   * Aucune ligne `crm_task_assignee` existante n'est supprimée. Les 3 assignés actuels
--     passent tous le nouveau prédicat (vérifié), mais la règle vaut pour toujours : une
--     assignation historique est une DONNÉE, pas une autorisation courante. La retirer
--     effacerait de l'histoire. Le filtre par personne du kanban continue d'unir les
--     assignables aux personnes réellement porteuses d'une tâche — une tâche assignée à
--     quelqu'un devenu inéligible reste donc atteignable et lisible.
--   * `api.user_can_write_crm` n'est PAS touchée : ce chantier restreint qui l'on peut
--     DÉSIGNER, pas ce que chacun peut faire.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- (A) « Cette personne peut-elle agir dans le CRM ? » — indépendant de l'appelant.
--     Miroir par-utilisateur des trois chemins de `api.user_can_write_crm`, plus la
--     condition de périmètre. SECURITY DEFINER : lit des tables gatées en RLS
--     (user_org_membership, user_permission, org_permission).
-- ─────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION api.user_can_act_in_crm(p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, api, auth, pg_temp
AS $$
  SELECT p_user IS NOT NULL AND (
    -- Chemin 1 — superuser plateforme : périmètre CRM total, aucune ORG requise.
    EXISTS (
      SELECT 1 FROM app_user_profile p
      WHERE p.id = p_user AND p.role IN ('owner', 'super_admin')
    )
    OR EXISTS (
      SELECT 1
      FROM user_org_membership m
      WHERE m.user_id = p_user
        AND m.is_active
        -- (a) l'ORG a un périmètre CRM (elle publie au moins une fiche) — sinon
        --     `current_user_crm_object_ids()` est vide et le CRM est inerte pour elle.
        AND EXISTS (
          SELECT 1
          FROM object_org_link ool
          JOIN ref_org_role r ON r.id = ool.role_id AND r.code = 'publisher'
          WHERE ool.org_object_id = m.org_object_id
        )
        -- (b) la personne peut y écrire — mêmes chemins que `api.user_can_write_crm`.
        AND (
          -- Chemin 2 — rang admin d'ORG.
          EXISTS (
            SELECT 1 FROM user_org_admin_role uar
            WHERE uar.membership_id = m.id AND uar.is_active
          )
          -- Chemin 3a — permission directe.
          OR EXISTS (
            SELECT 1 FROM user_permission up
            JOIN ref_permission rp ON rp.id = up.permission_id
            WHERE up.user_id = p_user AND up.is_active
              AND rp.is_active AND rp.code = 'write_crm_notes'
          )
          -- Chemin 3b — permission héritée de l'ORG.
          OR EXISTS (
            SELECT 1 FROM org_permission op
            JOIN ref_permission rp ON rp.id = op.permission_id
            WHERE op.org_object_id = m.org_object_id AND op.is_active
              AND rp.is_active AND rp.code = 'write_crm_notes'
          )
        )
    )
  );
$$;

COMMENT ON FUNCTION api.user_can_act_in_crm(uuid) IS
  'Cette personne peut-elle agir dans le CRM ? Miroir par-utilisateur des trois chemins de '
  'api.user_can_write_crm (superuser / rang admin / write_crm_notes directe ou héritée), plus '
  'la condition de périmètre (l''ORG doit publier au moins une fiche). Sert à ne proposer comme '
  'assignable que quelqu''un qui pourra réellement ouvrir et traiter la tâche. Manifeste 17c.';

-- PostgreSQL accorde EXECUTE à PUBLIC par défaut sur toute fonction neuve (§204).
REVOKE ALL ON FUNCTION api.user_can_act_in_crm(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION api.user_can_act_in_crm(uuid) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- (B) La garde d'assignation. Inchangée sur le partage d'organisation ; elle exige DÉSORMAIS
--     que la personne désignée puisse agir dans le CRM.
-- ─────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION api.user_can_assign_crm(p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, api, auth, pg_temp
AS $$
  -- COALESCE(…, FALSE) OBLIGATOIRE (§204) : `api.is_platform_superuser()` passe par
  -- `auth.role()`, NULL hors contexte HTTP (psql, pooler, service_role). Sans lui la fonction
  -- rend NULL — pas FALSE — et son consommateur `IF NOT api.user_can_assign_crm(…) THEN RAISE`
  -- de `api.save_crm_task` n'emprunte alors PAS la branche : la garde devient FAIL-OPEN.
  -- Ce défaut préexistait à 17c (même chaîne de OR) ; il se referme ici parce qu'on réécrit
  -- déjà le corps. Conséquence assumée : une session sans JWT ne peut plus désigner
  -- d'assigné explicitement — c'est le sens fail-closed, et aucune voie applicative ne le fait
  -- (sans `auth.uid()`, `save_crm_task` laisse la tâche sans assigné plutôt que d'en inventer).
  SELECT COALESCE(
    api.user_can_act_in_crm(p_user)
    AND (
      -- Portée de l'appelant : ses co-membres, ou tout le monde s'il est superuser.
      -- `(select auth.uid())` en forme hoistée (§39).
      EXISTS (
        SELECT 1
        FROM user_org_membership me
        JOIN user_org_membership m
          ON m.org_object_id = me.org_object_id AND m.is_active
        WHERE me.user_id = (select auth.uid()) AND me.is_active
          AND m.user_id = p_user
      )
      OR api.is_platform_superuser()
    ),
    FALSE);
$$;

COMMENT ON FUNCTION api.user_can_assign_crm(uuid) IS
  'Peut-on confier une tâche CRM à cette personne ? = api.user_can_act_in_crm(p_user) ET '
  '(co-membre d''une ORG de l''appelant OU appelant superuser). Avant le manifeste 17c, seul le '
  'partage d''organisation était vérifié : on pouvait assigner une tâche à un lecteur seul, que '
  '/crm redirige — il était notifié pour un écran inaccessible.';

REVOKE ALL ON FUNCTION api.user_can_assign_crm(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION api.user_can_assign_crm(uuid) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- (C) La liste proposée par l'interface. MÊME prédicat que la garde : une liste plus large que
--     la garde offrirait un choix systématiquement refusé (22023) — un piège d'écriture.
-- ─────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION api.list_crm_assignees()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, api, auth, pg_temp
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'user_id', s.user_id,
           'display_name', COALESCE(p.display_name, 'Utilisateur ' || left(s.user_id::text, 8)))
         ORDER BY COALESCE(p.display_name, 'Utilisateur ' || left(s.user_id::text, 8))), '[]'::jsonb)
  FROM (
    SELECT DISTINCT m.user_id
    FROM user_org_membership me
    JOIN user_org_membership m
      ON m.org_object_id = me.org_object_id AND m.is_active
    WHERE me.user_id = (select auth.uid()) AND me.is_active
      -- 17c — ne proposer que des personnes qui pourront ouvrir et traiter la tâche.
      AND api.user_can_act_in_crm(m.user_id)
  ) s
  LEFT JOIN app_user_profile p ON p.id = s.user_id;
$$;

COMMENT ON FUNCTION api.list_crm_assignees() IS
  'Membres actifs des ORG de l''appelant QUI peuvent agir dans le CRM (api.user_can_act_in_crm) '
  '— même prédicat que api.user_can_assign_crm, pour qu''aucun choix proposé ne soit refusé à '
  'l''enregistrement. Manifeste 17c.';

REVOKE ALL ON FUNCTION api.list_crm_assignees() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION api.list_crm_assignees() TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- (D) Garde fail-closed d'application. On ne vérifie PAS « la fonction existe » (elle vient
--     d'être créée, l'assertion serait tautologique) mais que le prédicat SÉPARE réellement :
--     au moins une personne éligible ET au moins une inéligible parmi les membres actifs.
--     Sur une base fraîche (aucune ORG publisher, aucun membre) les deux comptes valent 0 et
--     la garde ne peut rien dire : elle est alors explicitement neutralisée plutôt que de
--     rougir sur du vide.
-- ─────────────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_total integer;
  v_eligibles integer;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE api.user_can_act_in_crm(m.user_id))
    INTO v_total, v_eligibles
  FROM (SELECT DISTINCT user_id FROM user_org_membership WHERE is_active) m;

  IF v_total = 0 THEN
    RAISE NOTICE '17c — aucun membre actif : garde de séparation non applicable (base fraîche).';
    RETURN;
  END IF;

  -- Fail-closed : un prédicat qui rendrait TRUE pour tout le monde n'aurait rien restreint ;
  -- un prédicat qui rendrait FALSE pour tout le monde couperait l'assignation à tous.
  IF v_eligibles = 0 THEN
    RAISE EXCEPTION '17c — aucun membre éligible sur % : le prédicat couperait toute assignation.', v_total;
  END IF;

  RAISE NOTICE '17c — % membre(s) actif(s), % éligible(s) au CRM, % écarté(s).',
    v_total, v_eligibles, v_total - v_eligibles;
END;
$$;

COMMIT;

-- Les trois fonctions vivent dans le schéma `api` (exposé PostgREST) ⇒ après application :
--   NOTIFY pgrst, 'reload schema';
