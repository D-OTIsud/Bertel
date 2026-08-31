-- test_dashboard_crm_open.sql
-- Dashboard §1 : compteur global des demandes CRM ouvertes (carte d'attention).
-- Run AFTER api_views_functions.sql. Self-contained + transactional (ROLLBACK).
\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v            jsonb;
  v_int_live   int;
  v_task_live  int;
  v_backlog    numeric;
  v_has_public boolean;
BEGIN
  -- (A) contrat de sortie
  v := api.get_dashboard_crm_open();
  ASSERT v ? 'open_interactions', 'clé open_interactions présente';
  ASSERT v ? 'open_tasks',        'clé open_tasks présente';
  ASSERT v ? 'total',             'clé total présente';

  -- (B) open_interactions == le prédicat exact de crm_backlog.
  -- Manifeste 17g : liste positive TYPÉE des statuts OUVERTS (cycle de vie §6.1) et non plus
  -- `status::text <> 'done'` — une comparaison en texte désarme le typage et survit muette à
  -- tout renommage du vocabulaire, en se réduisant à `resolved_at IS NULL`.
  SELECT count(*) INTO v_int_live
  FROM   crm_interaction
  WHERE  resolved_at IS NULL
    AND  status = ANY (ARRAY['new','in_progress','awaiting_provider']::crm_status[]);
  ASSERT (v->>'open_interactions')::int = v_int_live,
         format('open_interactions (%s) doit égaler le comptage live (%s)',
                v->>'open_interactions', v_int_live);

  -- (C) open_tasks exclut canceled ET done
  SELECT count(*) INTO v_task_live
  FROM   crm_task
  WHERE  status::text IN ('todo','in_progress','blocked');
  ASSERT (v->>'open_tasks')::int = v_task_live,
         format('open_tasks (%s) doit égaler le comptage live (%s)',
                v->>'open_tasks', v_task_live);

  -- (D) total = somme des deux
  ASSERT (v->>'total')::int = (v->>'open_interactions')::int + (v->>'open_tasks')::int,
         'total = open_interactions + open_tasks';

  -- (E) cohérence avec le KPI historisé : la carte et la courbe disent la même chose.
  -- Ce bloc appelle RÉELLEMENT api.capture_metric_snapshots plutôt que de recopier son
  -- prédicat (resolved_at IS NULL + liste positive des statuts ouverts) en dur ici : une copie ne peut
  -- JAMAIS échouer si (B) est déjà passé — les deux expressions seraient alors le même
  -- texte évalué deux fois, donc l'invariant que le runbook, le COMMENT de la fonction et
  -- l'en-tête de migration présentent tous comme la raison d'être de la fonction ne serait
  -- gardé par rien. Seule l'exécution de la fonction qui écrit le KPI historisé, suivie
  -- d'une relecture de ce qu'elle a écrit, prouve que la carte et la courbe restent
  -- alignées si l'une des deux définitions dérive un jour. Ne PAS « simplifier » en
  -- revenant à une copie du prédicat.
  PERFORM api.capture_metric_snapshots(current_date);
  SELECT value INTO v_backlog
  FROM   public.metric_snapshot
  WHERE  metric_key    = 'crm_backlog'
    AND  scope         = 'global'
    AND  scope_key     = ''
    AND  snapshot_date = current_date;
  ASSERT v_backlog IS NOT NULL,
         'capture_metric_snapshots doit écrire une ligne crm_backlog (global) pour aujourd hui';
  ASSERT (v->>'open_interactions')::numeric = v_backlog,
         format('la carte du bandeau (open_interactions=%s) et le KPI historisé crm_backlog de la courbe Activité (%s) doivent afficher le MÊME chiffre — sinon la carte et la courbe se contredisent pour la même réalité',
                v->>'open_interactions', v_backlog);

  -- (F) §204 — EXECUTE retiré de PUBLIC et anon
  SELECT bool_or(has_function_privilege(r, 'api.get_dashboard_crm_open()', 'EXECUTE'))
  INTO   v_has_public
  FROM   unnest(ARRAY['public','anon']) AS r;
  ASSERT NOT COALESCE(v_has_public, FALSE),
         'EXECUTE doit être révoqué de PUBLIC et anon (§204)';

  -- (G) …mais accordé aux rôles applicatifs
  ASSERT has_function_privilege('authenticated', 'api.get_dashboard_crm_open()', 'EXECUTE'),
         'authenticated doit pouvoir exécuter';
  ASSERT has_function_privilege('service_role', 'api.get_dashboard_crm_open()', 'EXECUTE'),
         'service_role doit pouvoir exécuter';

  RAISE NOTICE 'test_dashboard_crm_open: OK (interactions=%, tasks=%)',
               v->>'open_interactions', v->>'open_tasks';
END $$;

ROLLBACK;
