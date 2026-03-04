# Go/No-Go Thresholds

Use these initial thresholds for the first production cutover, then recalibrate with real traffic.

## Performance thresholds

- ingest accept latency (`ingest_accept_s`) <= 2s
- ETL completion (`etl_until_terminal_s`) <= 180s
- dependency resolution (`resolve_s`) <= 30s
- dedup (`dedup_s`) <= 45s
- commit (`commit_s`) <= 45s

## Reliability thresholds

- `failed_permanent` batches: must be 0 during cutover window
- integrity check (`assert_staging_batch_integrity`): must return `ok=true` for candidate batches
- idempotent replay with same `x-idempotency-key`: must return same `batch_id` and no duplicate writes

## Security thresholds

- Sensitive RPC exposure to `anon`/`authenticated`: 0 unexpected grants
- `staging` schema/table privileges for public roles: no write/read grants

## Decision rule

- **Go**: all thresholds pass
- **No-Go**: any hard threshold fails, or unresolved blocker remains
