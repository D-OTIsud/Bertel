# Monitoring and Alerts (Production)

## Source

- API endpoint: `GET /api/v1/metrics`
- Forensics source: `staging.import_events`

## Minimum dashboards

- Batches by status (`received`, `profiling`, `mapping`, `transforming`, `staging_loaded`, `deduplicated`, `committed`, `failed`, `failed_permanent`)
- Errors in last 24h (`errors_24h`)
- Total events in last 24h (`events_24h`)
- ETL age distribution from `staging.import_batches.updated_at`
- Discovery queue (`mapping_review_required`) and approval latency
- Media pipeline status (`pending_download`, `download_failed`, `review_required`, `ready_for_commit`, `committed`)
- AI governance counters (`auto_ready`, `review_required`, `blocked_low_confidence`)

## Recommended alerts

- `failed_permanent > 0` for 15 minutes
- Blocked dependencies growth > 20/hour
- Commit errors > baseline for 15 minutes
- Any in-progress ETL older than SLA (example: 20 minutes)
- Workbook relation ambiguity growth (rows with `raw_relation_token` + blocked/review states) > threshold
- Media review backlog age > SLA
- Scheduler unhealthy (`pg_cron_available=false` or no recent successful run)
- Discovery review backlog growth or stagnation (`discovery_review_backlog`)

## SQL probes (if needed)

```sql
-- Terminal failures
SELECT COUNT(*) AS failed_permanent_count
FROM staging.import_batches
WHERE status = 'failed_permanent';
```

```sql
-- Old in-progress jobs
SELECT batch_id, status, updated_at
FROM staging.import_batches
WHERE status IN ('received', 'profiling', 'mapping', 'transforming')
  AND updated_at < NOW() - INTERVAL '20 minutes'
ORDER BY updated_at ASC;
```

```sql
-- Commit-related errors in 15 minutes
SELECT COUNT(*) AS commit_errors_15m
FROM staging.import_events
WHERE phase = 'commit'
  AND level = 'error'
  AND created_at >= NOW() - INTERVAL '15 minutes';
```

```sql
-- Media review backlog
SELECT COUNT(*) AS media_review_required
FROM staging.media_temp
WHERE processing_status = 'review_required';
```

```sql
-- Scheduler health (via RPC)
SELECT api.get_ingestor_scheduler_health();
```

## Ownership

- Ops owns dashboard uptime and alert routing.
- On-call owns first response and escalation.
- Data owner validates policy behavior (`allow_auto`, `require_review`, `deny_auto`) during incidents.
