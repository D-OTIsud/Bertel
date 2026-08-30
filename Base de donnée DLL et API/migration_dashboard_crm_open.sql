-- migration_dashboard_crm_open.sql
-- §226 — Carte d'attention du dashboard : compteur GLOBAL des demandes CRM ouvertes.
-- Remplace le compteur pending_change (table vide depuis toujours) de la carte d'attention.
-- Après 8z (migration_crm_module.sql) et 16z (crm_task). Idempotent.
--
-- INVARIANT : open_interactions reprend MOT POUR MOT le prédicat de crm_backlog dans
-- api.capture_metric_snapshots — la carte du bandeau et la courbe de l'onglet Activité
-- doivent compter la même chose, sans quoi l'écran se contredit lui-même.
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
    FROM   crm_interaction
    WHERE  resolved_at IS NULL
      AND  status::text <> 'done'
  ),
  tasks AS (
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
open_interactions reprend le prédicat exact de crm_backlog (api.capture_metric_snapshots) :
resolved_at IS NULL AND status <> ''done''. open_tasks = crm_task en todo/in_progress/blocked
(canceled et done exclus — une tâche annulée n''est pas du travail en attente).
GLOBAL par décision produit (2026-08-30) : la carte est un signal stable « ce qui m''attend
aujourd''hui », elle n''obéit pas au panneau de filtres. N''émet aucune PII (trois entiers).';

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
