# Dry-Run Checklist (Pre-Production)

## Dataset
- [ ] One historical CSV with unknown references
- [ ] One JSON payload with exact updates
- [ ] One XML payload with mixed create/update/conflict
- [ ] One XLSX workbook with multiple sheets and implicit relation columns (IDs list)

## Functional validation
- [ ] Ingest accepted with `202`
- [ ] Discovery contract generated (`GET /api/v1/ingest/{batch_id}/discovery`)
- [ ] Mapping review performed; contract status becomes `approved`
- [ ] ETL starts only after `POST /api/v1/ingest/{batch_id}/run-etl`
- [ ] Raw payload present in Storage bucket
- [ ] ETL reaches `staging_loaded` without terminal failure
- [ ] `sheet_progress` populated for workbook imports
- [ ] Dependency resolution returns expected blocker/review counts
- [ ] Dedup identifies exact updates and conflicts
- [ ] Manual approvals in UI persist correctly
- [ ] Commit succeeds when blockers are cleared
- [ ] Optional automation passes: `python scripts/dry_run_ingestor.py ...`

## Determinism / idempotency
- [ ] Replay same payload with same idempotency key returns same `batch_id`
- [ ] Reuse same idempotency key with different payload returns `409`
- [ ] Replay commit does not create duplicates
- [ ] Re-commit same batch returns `409`
- [ ] `assert_staging_batch_integrity` returns `ok=true` pre-commit

## Security
- [ ] Privileged RPCs fail with anon/authenticated token
- [ ] Privileged RPCs succeed with service role credentials
- [ ] `sql/security_audit_checks.sql` returns `PASS` for RPC exposure

## Operations
- [ ] `GET /api/v1/metrics` returns non-empty status counters
- [ ] `GET /api/v1/metrics` exposes media backlog + governance counters
- [ ] `GET /api/v1/metrics` exposes discovery backlog and approval latency
- [ ] Media pipeline processing endpoint succeeds (`/media/process`)
- [ ] Manual media review endpoint persists decisions
- [ ] Events are written in `staging.import_events`
- [ ] Purge endpoint works for committed/failed_permanent batches
- [ ] Rollback endpoint works on committed batch drill (`/rollback`)
- [ ] Cron health endpoint reports scheduler state (`/api/v1/ops/cron-health`)
- [ ] Scheduled retention purge configured (`sql/scheduled_purge_job.sql`)

## Sign-off
- [ ] Product owner approves import outcomes
- [ ] Data owner approves taxonomy/policy behavior
- [ ] On-call validates rollback and purge procedures
