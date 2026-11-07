-- Exact source dates, old reader compatibility and realm isolation.
-- Fixtures are aggregate-only and are always rolled back.
BEGIN;
SET LOCAL plpgsql.check_asserts = on;
INSERT INTO public.metric_snapshot(snapshot_date,scope,scope_key,metric_key,value,is_test) VALUES
  ('2025-01-01','global','','__history_bounds__',999,NULL),
  ('2025-01-03','global','','__history_bounds__',10,false),
  ('2025-01-10','global','','__history_bounds__',20,false),
  ('2025-01-06','global','','__history_bounds__',50,true);

SELECT set_config('request.jwt.claims', '{"role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE series jsonb; old_points jsonb;
BEGIN
  series := api.get_metric_snapshot_series_with_bounds('__history_bounds__','global','',NULL,NULL,'week');
  ASSERT series->>'first_snapshot_date' = '2025-01-03', 'Start is actual Friday, not bucket Monday';
  ASSERT series->>'last_snapshot_date' = '2025-01-10', 'End is last measured day, not today';
  ASSERT jsonb_array_length(series->'points') = 2, 'Only real observations are visible';
  ASSERT series->'points'->0->>'bucket' = '2024-12-30', 'Existing weekly bucket semantics are preserved';
  SELECT jsonb_agg(to_jsonb(p) ORDER BY bucket) INTO old_points
    FROM api.get_metric_snapshot_series('__history_bounds__','global','',NULL,NULL,'week') p;
  ASSERT series->'points' = old_points, 'Old tabular RPC remains the source of points';

  series := api.get_metric_snapshot_series_with_bounds('__history_bounds__','global','','2025-01-05','2025-01-31','month');
  ASSERT series->>'first_snapshot_date' = '2025-01-10', 'Requested range also constrains source dates';
  ASSERT series->>'last_snapshot_date' = '2025-01-10', 'One source day stays one day regardless of monthly buckets';
  ASSERT jsonb_array_length(series->'points') = 1, 'Monthly stock grouping remains intact';

  series := api.get_metric_snapshot_series_with_bounds('__history_bounds__','global','','2024-01-01','2024-12-31','week');
  ASSERT series = '{"points":[],"first_snapshot_date":null,"last_snapshot_date":null}'::jsonb,
    'Empty source range returns no invented history dates';
END $test$;
RESET ROLE;

SELECT set_config('request.jwt.claims', '{"role":"authenticated","app_metadata":{"sandbox_discovery":true}}', true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE series jsonb;
BEGIN
  series := api.get_metric_snapshot_series_with_bounds('__history_bounds__','global','',NULL,NULL,'week');
  ASSERT series->>'first_snapshot_date' = '2025-01-06' AND series->>'last_snapshot_date' = '2025-01-06',
    'Real and unknown history never supplies test bounds';
  ASSERT jsonb_array_length(series->'points') = 1 AND (series->'points'->0->>'value')::int = 50,
    'Test points never include real or unknown aggregates';
END $test$;
RESET ROLE;

DO $test$
BEGIN
  ASSERT NOT has_function_privilege('anon', 'api.get_metric_snapshot_series_with_bounds(text,text,text,date,date,text)', 'EXECUTE'),
    'Anonymous clients cannot read metric history';
  ASSERT NOT (SELECT prosecdef FROM pg_proc WHERE oid='api.get_metric_snapshot_series_with_bounds(text,text,text,date,date,text)'::regprocedure),
    'New reader keeps metric_snapshot RLS active';
END $test$;
ROLLBACK;
