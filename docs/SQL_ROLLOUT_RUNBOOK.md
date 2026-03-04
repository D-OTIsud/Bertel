# SQL Rollout Runbook (Bertel3.0)

## Scope

This runbook covers phased rollout and verification for SQL updates in:
- `Base de donnée DLL et API/schema_unified.sql`
- `Base de donnée DLL et API/api_views_functions.sql`
- `Base de donnée DLL et API/rls_policies.sql`
- `Base de donnée DLL et API/test_performance.sql`

## Pre-Deployment Checklist

1. Confirm backup/restore path is valid for the target Supabase project.
2. Confirm migration window and rollback owner.
3. Confirm expected API compatibility (no signature or JSON shape breaks).
4. Confirm required extensions are enabled (`postgis`, `pgcrypto`, `uuid-ossp`, `pg_cron` if used).

## Deployment Order

1. `schema_unified.sql` (indexes and schema-level changes)
2. `api_views_functions.sql` (function updates)
3. `rls_policies.sql` (policy refresh/hardening)
4. Refresh materialized views introduced by this rollout:
   - `REFRESH MATERIALIZED VIEW CONCURRENTLY mv_ref_data_json;`
   - `REFRESH MATERIALIZED VIEW CONCURRENTLY mv_filtered_objects;`
5. Smoke tests on key endpoints

## Verification (Before/After)

Run on staging and compare before/after metrics:

```sql
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT api.list_object_resources_since_fast(
  p_since := NOW() - INTERVAL '7 days',
  p_limit := 100,
  p_status := ARRAY['published']::object_status[]
);
```

```sql
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT api.list_object_resources_filtered_since_fast(
  p_since := NOW() - INTERVAL '7 days',
  p_limit := 100,
  p_filters := '{"bbox":[2.0,48.5,3.0,49.0]}'::jsonb
);
```

```sql
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT api.list_objects_with_validated_changes_since(
  NOW() - INTERVAL '30 days'
);
```

Also run the curated benchmark script:

```sql
\i 'Base de donnée DLL et API/test_performance.sql'
```

When using the new filtered MV path, run one direct plan check:

```sql
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT object_id
FROM api.get_filtered_object_ids(
  p_filters := '{"within_radius":{"lat":48.8566,"lon":2.3522,"radius_m":5000},"amenities_any":["wifi"]}'::jsonb,
  p_types := ARRAY['RES','HOT']::object_type[],
  p_status := ARRAY['published']::object_status[],
  p_search := 'restaurant'
)
LIMIT 100;
```

## Success Criteria

- API responses remain contract-compatible for existing clients.
- Key endpoints show stable or improved execution time.
- No permission regressions on protected data paths.
- No migration rerun failures for policy creation.

## Rollback Plan

1. Re-deploy previous SQL revisions for modified files.
2. If index operations were introduced and need removal, drop newly added indexes:
   - `idx_pending_change_validated_effective_ts`
   - `idx_object_updated_at_id`
   - `idx_object_updated_at_source_id`
   - `idx_object_published_updated_at_id`
   - `idx_object_published_updated_at_source_id`
3. Re-run smoke tests and confirm endpoint behavior matches pre-deploy baseline.

## Post-Deployment Monitoring (24h)

- Track P95/P99 latency of list/filter endpoints.
- Track database CPU and buffer/cache pressure during peak periods.
- Check for permission-denied errors on RPC calls.
- Confirm no unexpected policy drift after reruns.
- Confirm `mv_filtered_objects` freshness remains within target SLA (5-15 minutes).
- Alert if refresh fails repeatedly or row-count drifts unexpectedly from published main-location baseline.

## MV Refresh Scheduling (Supabase pg_cron)

Use a cadence aligned with your accepted staleness budget:

```sql
SELECT cron.schedule(
  'refresh-mv-filtered-objects',
  '*/10 * * * *',
  $$REFRESH MATERIALIZED VIEW CONCURRENTLY mv_filtered_objects;$$
);
```

Health checks:

```sql
SELECT COUNT(*) AS mv_rows FROM mv_filtered_objects;
SELECT COUNT(*) AS baseline_rows
FROM object o
JOIN object_location ol ON ol.object_id = o.id AND ol.is_main_location IS TRUE
WHERE o.status = 'published';
```
