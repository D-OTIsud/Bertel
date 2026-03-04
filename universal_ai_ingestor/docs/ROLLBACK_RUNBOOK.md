# Compensating Rollback Runbook

## Scope

Use this procedure only for committed ingestion batches that must be reverted quickly without full database restore.

## Preconditions

- Batch exists in `staging.import_batches` and is `committed`.
- Batch has a ledger row in `staging.batch_commit_ledger`.
- RCA ticket is opened and stakeholder approval is recorded.

## Procedure

1. Pause ingest traffic (API writes) for the target tenant/environment.
2. Capture diagnostics:
   - `SELECT * FROM staging.import_events WHERE import_batch_id = '<batch_id>' ORDER BY created_at DESC;`
   - `SELECT * FROM staging.batch_commit_ledger WHERE batch_id = '<batch_id>';`
3. Execute rollback endpoint:
   - `POST /api/v1/ingest/{batch_id}/rollback`
4. Verify outcome:
   - ledger status = `rolled_back`
   - `staging.import_batches.status` returned to `staging_loaded`
   - created media/object counts from response match expectation.

## Safety rules

- Do not run purge before rollback evidence is archived.
- Do not run rollback twice unless `force=true` is explicitly approved.
- If rollback returns error, stop and escalate (DBA + data owner).

## Post-rollback checks

- Run integrity endpoint for the batch.
- Compare object/media diffs on target scope.
- Decide next action: reprocess fixed batch, keep in staging, or purge.
