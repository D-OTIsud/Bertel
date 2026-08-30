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
  v_backlog    int;
  v_has_public boolean;
BEGIN
  -- (A) contrat de sortie
  v := api.get_dashboard_crm_open();
  ASSERT v ? 'open_interactions', 'clé open_interactions présente';
  ASSERT v ? 'open_tasks',        'clé open_tasks présente';
  ASSERT v ? 'total',             'clé total présente';

  -- (B) open_interactions == le prédicat exact de crm_backlog
  SELECT count(*) INTO v_int_live
  FROM   crm_interaction
  WHERE  resolved_at IS NULL AND status::text <> 'done';
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

  -- (E) cohérence avec le KPI historisé : la carte et la courbe disent la même chose
  SELECT count(*) INTO v_backlog
  FROM   crm_interaction WHERE resolved_at IS NULL AND status::text <> 'done';
  ASSERT (v->>'open_interactions')::int = v_backlog,
         'open_interactions suit le même prédicat que crm_backlog (capture_metric_snapshots)';

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
