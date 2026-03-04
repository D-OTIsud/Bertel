# Universal AI Ingestor - Go Live Runbook

## 1) Preflight

- Apply SQL migration:
  - `sql/staging_ingestor.sql`
- Run migration checks:
  - `sql/preflight_migration_checks.sql`
- Verify required env:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_KEY`
  - `OPENAI_API_KEY`
  - `API_BEARER_TOKEN`
- Ensure Storage bucket exists:
  - `RAW_IMPORT_BUCKET` (default `raw_imports`)
- Optional automated preflight:
  - `python scripts/preflight_check.py`

## 2) Security checks

- Confirm privileged RPCs are service-role only:
  - `api.run_staging_dedup`
  - `api.resolve_staging_dependencies`
  - `api.commit_staging_to_public`
  - `api.rollback_staging_batch_compensate`
  - `api.purge_staging_batch`
  - `api.retry_failed_media_downloads`
  - `api.watchdog_mark_stale_batches`
  - `api.get_ingestor_metrics`
  - `api.get_ingestor_scheduler_health`
  - `api.purge_expired_staging_batches`
- Confirm staging schema is not exposed to `anon/authenticated`.
- Run:
  - `sql/security_audit_checks.sql`

## 3) Integrity checks

- For a candidate batch:
  - call `GET /api/v1/ingest/{batch_id}/discovery`
  - call `POST /api/v1/ingest/{batch_id}/mapping/approve` (after human review)
  - call `POST /api/v1/ingest/{batch_id}/run-etl`
  - call `POST /api/v1/ingest/{batch_id}/resolve-dependencies`
  - call `GET /api/v1/ingest/{batch_id}/integrity`
- Commit must stop when blockers exist.

## 4) Dry run protocol

1. Ingest representative CSV/JSON/XML sample.
2. Ingest representative XLSX workbook (multi-sheets + implicit relations + media URLs).
3. Validate discovery contract; reject/approve low confidence mappings.
4. Run ETL only after mapping approval.
5. Resolve dependencies and verify review/block counts.
6. Deduplicate.
7. Approve rows in UI.
8. Process media queue (`POST /api/v1/ingest/{batch_id}/media/process`), puis review manuelle si nécessaire.
9. Commit.
10. Re-run same payload with same idempotency key and verify no duplicates.
11. Vérifier qu’une 2e tentative commit retourne bien un conflit.
12. Exécuter un rollback compensatoire drill puis revalidation intégrité.
8. Optionally run automated dry-run:
   - `python scripts/dry_run_ingestor.py --base-url http://localhost:8000 --token "$API_BEARER_TOKEN" --file ./samples/import.csv --idempotency-key dryrun-001 --auto-commit --rollback-after-commit`

## 5) Performance benchmark

Use:

```bash
python scripts/benchmark_ingestor.py --base-url http://localhost:8000 --token "$API_BEARER_TOKEN" --file ./samples/import.csv --idempotency-key bench-001 --max-ingest-accept-s 2 --max-etl-until-terminal-s 180 --max-resolve-s 30 --max-dedup-s 45 --max-commit-s 45
```

Track:
- ingest accept latency
- ETL completion duration
- resolve/dedup/commit durations
- Threshold policy: `docs/GO_NO_GO_THRESHOLDS.md`

## 6) Monitoring and alerts

Use `GET /api/v1/metrics` for status snapshots.

Alert thresholds (suggested):
- `failed_permanent` batches > 0 for 15 min
- blocked dependencies > 20 per hour
- commit errors spike > baseline
- ETL in-progress older than SLA
- media download failures > threshold
- media review backlog growth > threshold

Operational setup guide:
- `docs/MONITORING_ALERTS.md`

## 7) Rollback

- If migration-level issue: restore backup and revert application release.
- If data-level issue in a committed batch:
  - stop ingestion traffic
  - diagnose via `staging.import_events` + `staging.batch_commit_ledger`
  - execute `POST /api/v1/ingest/{batch_id}/rollback`
  - verify object/media deltas then decide purge policy

## 8) Cutover checklist

- Staging environment dry run passed
- Backup completed
- On-call handover done
- Stakeholder sign-off for policy defaults (`allow_auto`, `require_review`, `deny_auto`)
- Sign-off template:
  - `docs/CUTOVER_SIGNOFF_TEMPLATE.md`

## 9) Retention purge schedule

- Configure periodic run of:
  - `SELECT api.purge_expired_staging_batches(500);`
- Recommended additional jobs:
  - `SELECT api.retry_failed_media_downloads(200);`
  - `SELECT api.watchdog_mark_stale_batches(30, 200);`
- Scheduler health endpoint:
  - `GET /api/v1/ops/cron-health`
- Reference script:
  - `sql/scheduled_purge_job.sql`
- Safety rule:
  - never automate `force=true` purge; keep it manual and RCA-gated.
