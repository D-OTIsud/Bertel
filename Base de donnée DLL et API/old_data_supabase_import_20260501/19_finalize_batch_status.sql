-- ===========================================================================
-- Old_data import - Stage 1 staging load - Finalize batch status (file 19)
-- Batch id: old-data-berta2-all-20260501-01
--
-- Stamps staging.import_batches.updated_at to mark the staging phase as
-- fully loaded. Run after every other stage 1 file has succeeded; then
-- proceed with 20_promotion.sql.
-- ===========================================================================

BEGIN;
UPDATE staging.import_batches SET updated_at = NOW() WHERE batch_id = 'old-data-berta2-all-20260501-01';
COMMIT;
