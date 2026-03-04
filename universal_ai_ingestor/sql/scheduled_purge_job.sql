-- Scheduled purge for expired terminal batches.
-- This script is optional and depends on scheduler capabilities in your environment.

-- Manual execution (safe baseline):
SELECT api.purge_expired_staging_batches(500);
SELECT api.retry_failed_media_downloads(200);
SELECT api.watchdog_mark_stale_batches(30, 200);

-- If pg_cron is available in your environment, schedule once per day at 02:30 UTC.
-- SELECT cron.schedule(
--   'ingestor_purge_expired_batches_daily',
--   '30 2 * * *',
--   $$SELECT api.purge_expired_staging_batches(500);$$
-- );

-- To inspect jobs:
-- SELECT * FROM cron.job WHERE jobname = 'ingestor_purge_expired_batches_daily';
-- SELECT api.get_ingestor_scheduler_health();
