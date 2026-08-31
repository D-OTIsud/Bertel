-- migration_dashboard_crm_open.sql
-- §226 — Carte d'attention du dashboard : compteur GLOBAL des demandes CRM ouvertes.
-- Remplace le compteur pending_change (table vide depuis toujours) de la carte d'attention.
-- Après 8z (migration_crm_module.sql) et 16z (crm_task). Idempotent.
--
-- INVARIANT : open_interactions reprend MOT POUR MOT le prédicat de crm_backlog dans
-- api.capture_metric_snapshots — la carte du bandeau et la courbe de l'onglet Activité
-- doivent compter la même chose, sans quoi l'écran se contredit lui-même.
--
-- 2026-08-31, manifeste 17g : ce prédicat est passé d'une comparaison EN TEXTE (qui désarmait
-- le typage et survivait muette à tout renommage du vocabulaire, en se réduisant à
-- `resolved_at IS NULL`) à une LISTE POSITIVE TYPÉE des statuts ouverts. `migration_crm_lifecycle.sql`
-- redéploie la même définition APRÈS ce fichier au manifeste ; les deux doivent rester
-- identiques, l'indentation comprise (le test 17g compare les deux `prosrc` littéralement).
--
-- AUCUNE PII : trois entiers. La fonction n'émet ni sujet, ni corps, ni acteur, ni assigné,
-- ce qui la dispense de reproduire la doctrine de périmètre CRM (§61) tout en restant sûre.

CREATE OR REPLACE FUNCTION api.get_dashboard_crm_open()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
  WITH interactions AS (
    SELECT count(*)::int AS n
  -- ⚠ Bloc reproduit MOT POUR MOT — INDENTATION COMPRISE — depuis le point 5 de
  -- api.capture_metric_snapshots. L'indentation « plate » au milieu du CTE est DÉLIBÉRÉE :
  -- c'est ce qui rend l'identité des deux prédicats vérifiable par comparaison littérale des
  -- deux `prosrc` (test 17g, bloc B). Ne pas « ré-aligner ».
  FROM crm_interaction
  WHERE resolved_at IS NULL
    AND status = ANY (ARRAY['new','in_progress','awaiting_provider']::crm_status[])
  ),
  tasks AS (
    -- ⚠ VOCABULAIRE DES TÂCHES (crm_task_status), PAS celui des demandes. Ces cinq lignes ne
    -- bougent PAS avec le cycle de vie des demandes : `in_progress` est ici un statut de TÂCHE.
    SELECT count(*)::int AS n
    FROM   crm_task
    WHERE  status::text IN ('todo', 'in_progress', 'blocked')
  )
  SELECT jsonb_build_object(
    'open_interactions', i.n,
    'open_tasks',        t.n,
    'total',             i.n + t.n
  )
  FROM interactions i, tasks t;
$$;

COMMENT ON FUNCTION api.get_dashboard_crm_open IS
'Dashboard §1 : compteur GLOBAL des éléments CRM ouverts pour la carte d''attention du bandeau.
open_interactions reprend le prédicat exact de crm_backlog (api.capture_metric_snapshots) : la
liste positive TYPÉE des statuts ouverts (new, in_progress, awaiting_provider) et resolved_at
IS NULL. open_tasks = crm_task en todo/in_progress/blocked (les statuts terminaux de TÂCHE sont
exclus — une tâche annulée n''est pas du travail en attente ; vocabulaire crm_task_status,
distinct de celui des demandes). GLOBAL par décision produit (2026-08-30) : la carte est un
signal stable « ce qui m''attend aujourd''hui », elle n''obéit pas au panneau de filtres.
N''émet aucune PII (trois entiers). Manifeste 17g.';

-- §204 — EXECUTE est accordé à PUBLIC par défaut sur toute fonction neuve ; un GRANT ciblé
-- ne le retire pas. Le REVOKE est obligatoire, dans cet ordre.
REVOKE EXECUTE ON FUNCTION api.get_dashboard_crm_open() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.get_dashboard_crm_open() TO   authenticated, service_role;

-- Garde dure : un ré-apply par un rôle non-propriétaire ne rend qu'un WARNING sur le REVOKE,
-- que ON_ERROR_STOP ne rattrape pas. On échoue fort plutôt que de déployer une fonction ouverte.
DO $$
BEGIN
  IF has_function_privilege('public', 'api.get_dashboard_crm_open()', 'EXECUTE')
     OR has_function_privilege('anon', 'api.get_dashboard_crm_open()', 'EXECUTE') THEN
    RAISE EXCEPTION 'REVOKE n''a pas pris sur api.get_dashboard_crm_open — fonction ouverte, arrêt.';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
