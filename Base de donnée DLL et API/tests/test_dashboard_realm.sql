-- Run after dashboard_realm_consistency. Uses live rows; all captures roll back.
-- Proves both modes, every activity aggregate, snapshot idempotence and RLS.
BEGIN;

DO $test$
DECLARE
  realm boolean;
  counter jsonb;
  activity jsonb;
  team jsonb;
  expected_interactions integer;
  expected_tasks integer;
  expected_recent integer;
  expected_corpus integer;
  expected_score numeric;
  snapshot_score numeric;
  n integer;
BEGIN
  PERFORM api.capture_metric_snapshots(current_date);
  PERFORM api.capture_metric_snapshots(current_date);

  FOREACH realm IN ARRAY ARRAY[false, true] LOOP
    PERFORM set_config('request.jwt.claims', jsonb_build_object(
      'role', 'service_role', 'app_metadata', jsonb_build_object('sandbox_discovery', realm))::text, true);
    ASSERT api.current_user_test_realm() = realm, 'Real/test context must be effective';

    -- Independent oracle: both anchors must belong to the chosen realm.
    SELECT count(*), count(*) FILTER (WHERE ci.occurred_at >= now() - interval '90 days')
      INTO expected_interactions, expected_recent
    FROM public.crm_interaction ci
    LEFT JOIN public.object o ON o.id = ci.object_id
    LEFT JOIN public.actor a ON a.id = ci.actor_id
    WHERE ci.resolved_at IS NULL
      AND ci.status = ANY (ARRAY['new','in_progress','awaiting_provider']::public.crm_status[])
      AND COALESCE(o.is_test, a.is_test) = realm
      AND (ci.object_id IS NULL OR o.is_test = realm)
      AND (ci.actor_id IS NULL OR a.is_test = realm);

    SELECT count(*) INTO expected_tasks
    FROM public.crm_task ct
    LEFT JOIN public.object o ON o.id = ct.object_id
    LEFT JOIN public.actor a ON a.id = ct.actor_id
    WHERE ct.status::text IN ('todo','in_progress','blocked')
      AND COALESCE(o.is_test, a.is_test) = realm
      AND (ct.object_id IS NULL OR o.is_test = realm)
      AND (ct.actor_id IS NULL OR a.is_test = realm);

    counter := api.get_dashboard_crm_open();
    ASSERT (counter->>'open_interactions')::int = expected_interactions, 'CRM counter must match realm';
    ASSERT (counter->>'recent_interactions')::int = expected_recent, 'Recent CRM count must match realm';
    ASSERT (counter->>'open_tasks')::int = expected_tasks, 'Task counter must match realm';
    ASSERT (counter->>'total')::int = expected_interactions + expected_tasks, 'Total preserves formula';
    ASSERT (counter->>'backlog_interactions')::int = expected_interactions - expected_recent, 'Ages preserve total';

    activity := api.get_dashboard_crm_activity();
    ASSERT (SELECT sum((b->>'count')::int) FROM jsonb_array_elements(activity->'open_by_age') b)
      = expected_interactions, 'CRM age buckets and open counter must agree';
    ASSERT COALESCE((SELECT sum((b->>'count')::int) FROM jsonb_array_elements(activity->'open_by_topic') b), 0)
      = expected_interactions, 'CRM topics and open counter must agree';
    ASSERT jsonb_array_length(activity->'monthly_flow') = 12, 'Twelve months are always emitted';
    ASSERT NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(activity->'monthly_flow') m
      WHERE (m->>'created')::int <> (
        SELECT count(*) FROM public.crm_interaction ci
        LEFT JOIN public.object o ON o.id = ci.object_id
        LEFT JOIN public.actor a ON a.id = ci.actor_id
        WHERE COALESCE(o.is_test, a.is_test) = realm
          AND (ci.object_id IS NULL OR o.is_test = realm)
          AND (ci.actor_id IS NULL OR a.is_test = realm)
          AND ci.occurred_at >= (m->>'month')::date
          AND ci.occurred_at < (m->>'month')::date + interval '1 month')
      OR (m->>'resolved')::int <> (
        SELECT count(*) FROM public.crm_interaction ci
        LEFT JOIN public.object o ON o.id = ci.object_id
        LEFT JOIN public.actor a ON a.id = ci.actor_id
        WHERE COALESCE(o.is_test, a.is_test) = realm
          AND (ci.object_id IS NULL OR o.is_test = realm)
          AND (ci.actor_id IS NULL OR a.is_test = realm)
          AND ci.resolved_at >= (m->>'month')::date
          AND ci.resolved_at < (m->>'month')::date + interval '1 month')
    ), 'Every monthly CRM flow must match its realm';

    team := api.get_dashboard_team_activity();
    ASSERT jsonb_array_length(team->'weeks') = 12, 'Twelve weeks are always emitted';
    ASSERT NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(team->'weeks') w
      WHERE (w->>'objects_touched')::int <> (
        SELECT count(DISTINCT ov.object_id) FROM public.object_version ov
        JOIN public.object o ON o.id = ov.object_id
        WHERE o.object_type <> 'ORG' AND o.is_test = realm AND ov.created_by IS NOT NULL
          AND ov.created_at >= (w->>'week_start')::date
          AND ov.created_at < (w->>'week_start')::date + interval '1 week')
    ), 'Every team activity week must match its realm';

    counter := api.get_dashboard_provider_crm_open();
    ASSERT (counter->>'open_interactions')::int <= expected_interactions, 'Provider mode is a subset of the same realm';
    ASSERT (counter->>'open_tasks')::int <= expected_tasks, 'Provider tasks are a subset of the same realm';
    activity := api.get_dashboard_provider_crm_activity();
    ASSERT (SELECT sum((b->>'count')::int) FROM jsonb_array_elements(activity->'open_by_age') b)
      = (counter->>'open_interactions')::int, 'Provider age buckets and counter must agree';

    SELECT count(*) INTO expected_corpus FROM public.object WHERE object_type <> 'ORG' AND is_test = realm;
    ASSERT (SELECT value FROM api.get_metric_snapshot_series(
      'corpus_count','global','',current_date,current_date,'day')) = expected_corpus,
      'Historical corpus must use the caller realm';
    ASSERT (SELECT value FROM api.get_metric_snapshot_series(
      'crm_backlog','global','',current_date,current_date,'day')) = expected_interactions,
      'Historical CRM and current CRM must agree in each realm';
    ASSERT (SELECT value FROM api.get_metric_snapshot_yoy('crm_backlog')
      WHERE yr = EXTRACT(YEAR FROM current_date)::int AND mon = EXTRACT(MONTH FROM current_date)::int)
      = expected_interactions, 'YoY must use the same realm as the daily series';

    SELECT round(sum((r->>'avg_score')::numeric * (r->>'total')::numeric)
      / nullif(sum((r->>'total')::numeric), 0), 1) INTO expected_score
    FROM jsonb_array_elements(api.get_dashboard_completeness(p_below_limit => 0)->'rows') r;
    SELECT value INTO snapshot_score FROM api.get_metric_snapshot_series(
      'completeness_avg','global','',current_date,current_date,'day');
    ASSERT snapshot_score IS NOT DISTINCT FROM expected_score, 'Historical completeness preserves the live formula';

    SELECT count(*) INTO n FROM public.metric_snapshot
      WHERE snapshot_date = current_date AND scope = 'global' AND is_test = realm AND metric_key = 'crm_backlog';
    ASSERT n = 1, 'Repeated captures must upsert without duplicate realm snapshots';
  END LOOP;

  ASSERT NOT has_function_privilege('authenticated', 'internal.dashboard_crm_interactions()', 'execute'), 'Raw CRM helper remains private';
  ASSERT NOT has_function_privilege('authenticated', 'internal.capture_dashboard_realm_snapshots(date,boolean)', 'execute'), 'Snapshot writer remains private';
  ASSERT NOT has_function_privilege('authenticated', 'api.capture_metric_snapshots(date)', 'execute'), 'Users cannot rewrite history';
  ASSERT NOT has_function_privilege('anon', 'api.get_dashboard_crm_open()', 'execute'), 'Anonymous clients cannot read CRM';
  RAISE NOTICE 'Dashboard realm counters, flows, team activity and snapshots: OK';
END $test$;

SELECT set_config('request.jwt.claims', '{"role":"authenticated","app_metadata":{"sandbox_discovery":true}}', true);
SET LOCAL ROLE authenticated;
DO $test$
BEGIN
  ASSERT NOT EXISTS (SELECT 1 FROM public.metric_snapshot WHERE is_test IS DISTINCT FROM true),
    'Snapshot RLS must hide real and legacy aggregates in test mode';
  ASSERT EXISTS (SELECT 1 FROM public.metric_snapshot WHERE is_test), 'Test snapshots must remain readable';
END $test$;
RESET ROLE;

SELECT set_config('request.jwt.claims', '{"role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $test$
BEGIN
  ASSERT NOT EXISTS (SELECT 1 FROM public.metric_snapshot WHERE is_test IS DISTINCT FROM false),
    'Snapshot RLS must hide test and legacy aggregates in real mode';
  ASSERT EXISTS (SELECT 1 FROM public.metric_snapshot WHERE NOT is_test), 'Real snapshots must remain readable';
END $test$;
RESET ROLE;

SELECT set_config('request.jwt.claims', '{}', true);
DO $test$
BEGIN
  BEGIN
    PERFORM api.get_dashboard_crm_open();
    RAISE EXCEPTION 'Unauthenticated CRM access was accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $test$;
ROLLBACK;
