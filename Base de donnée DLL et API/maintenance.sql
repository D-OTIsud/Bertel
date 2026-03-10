-- =====================================================
-- Database Maintenance Script
-- Run daily via cron or as needed
-- =====================================================

-- =====================================================
-- Refresh Materialized Views
-- =====================================================
\echo 'Refreshing materialized views...'

-- Refresh reference data cache (concurrently to allow reads during refresh)
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_ref_data_json;
-- Refresh hot-path filtered object projection
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_filtered_objects;

-- =====================================================
-- Update Statistics
-- =====================================================
\echo 'Updating statistics...'

ANALYZE object;
ANALYZE object_location;
ANALYZE media;
ANALYZE object_price;
ANALYZE object_description;
ANALYZE object_org_link;
ANALYZE object_iti;
ANALYZE object_iti_stage;
ANALYZE object_sustainability_action;
ANALYZE object_classification;
ANALYZE actor;
ANALYZE actor_object_role;
ANALYZE contact_channel;

-- =====================================================
-- Vacuum Tables
-- =====================================================
\echo 'Vacuuming tables...'

VACUUM (ANALYZE, VERBOSE) object;
VACUUM (ANALYZE, VERBOSE) object_location;
VACUUM (ANALYZE, VERBOSE) media;
VACUUM (ANALYZE, VERBOSE) object_price;

-- =====================================================
-- Rebuild Indexes (if fragmented)
-- =====================================================
-- Uncomment if indexes are fragmented (check with pg_stat_user_indexes)
-- REINDEX TABLE CONCURRENTLY object;
-- REINDEX TABLE CONCURRENTLY object_location;

-- =====================================================
-- Update Cached Aggregates (if needed)
-- =====================================================
\echo 'Updating cached aggregates...'

-- Update cached prices for all objects
UPDATE object o
SET cached_min_price = subq.min_price
FROM (
  SELECT 
    object_id,
    MIN(amount) as min_price
  FROM object_price
  WHERE (valid_from IS NULL OR valid_from <= CURRENT_DATE)
    AND (valid_to IS NULL OR valid_to >= CURRENT_DATE)
  GROUP BY object_id
) subq
WHERE o.id = subq.object_id
  AND (o.cached_min_price IS DISTINCT FROM subq.min_price OR o.cached_min_price IS NULL);

-- Update cached main images for all objects
UPDATE object o
SET cached_main_image_url = subq.main_image_url
FROM (
  SELECT DISTINCT ON (object_id)
    object_id,
    url as main_image_url
  FROM media
  WHERE is_published = TRUE
    AND is_main = TRUE
    AND (kind IS NULL OR kind = 'illustration')
  ORDER BY object_id, position NULLS LAST
) subq
WHERE o.id = subq.object_id
  AND (o.cached_main_image_url IS DISTINCT FROM subq.main_image_url OR o.cached_main_image_url IS NULL);

-- =====================================================
-- Regenerate GPX Cache (if needed)
-- =====================================================
\echo 'Checking GPX cache...'

-- Update any itineraries where GPX cache is missing
UPDATE object_iti
SET updated_at = updated_at  -- Trigger will regenerate cache
WHERE geom IS NOT NULL 
  AND cached_gpx IS NULL;

-- =====================================================
-- Check Database Health
-- =====================================================
\echo 'Database health check...'

-- Table sizes
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS total_size,
  pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) AS table_size,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) AS index_size
FROM pg_tables
WHERE schemaname IN ('public', 'api')
  AND tablename IN ('object', 'object_location', 'media', 'object_iti', 'object_price')
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Index usage statistics
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan as scans,
  idx_tup_read as tuples_read,
  idx_tup_fetch as tuples_fetched,
  pg_size_pretty(pg_relation_size(indexrelid)) as index_size
FROM pg_stat_user_indexes
WHERE schemaname IN ('public', 'api')
  AND tablename IN ('object', 'object_location')
ORDER BY idx_scan DESC
LIMIT 20;

-- Materialized view status
SELECT 
  schemaname,
  matviewname,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||matviewname)) as size,
  last_vacuum,
  last_analyze
FROM pg_matviews
WHERE schemaname IN ('public', 'api');

-- =====================================================
-- Ensure pg_cron schedules are present (idempotent)
-- =====================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh-mv-filtered-objects') THEN
      PERFORM cron.schedule(
        'refresh-mv-filtered-objects',
        '*/5 * * * *',
        $$REFRESH MATERIALIZED VIEW CONCURRENTLY mv_filtered_objects$$
      );
    END IF;

    -- Enforce 5-minute cadence for open-now cache freshness.
    PERFORM cron.unschedule(j.jobid)
    FROM cron.job j
    WHERE j.jobname = 'refresh-open-status'
      AND j.schedule <> '*/5 * * * *';

    IF NOT EXISTS (
      SELECT 1
      FROM cron.job
      WHERE jobname = 'refresh-open-status'
        AND schedule = '*/5 * * * *'
    ) THEN
      PERFORM cron.schedule(
        'refresh-open-status',
        '*/5 * * * *',
        $$SELECT api.refresh_open_status()$$
      );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'maintain-partitions') THEN
      PERFORM cron.schedule(
        'maintain-partitions',
        '0 2 * * *',
        $$SELECT audit.maintain_partitions()$$
      );
    END IF;
  ELSE
    RAISE NOTICE 'pg_cron extension is not installed; skipping schedule creation.';
  END IF;
EXCEPTION
  WHEN undefined_table THEN
    RAISE NOTICE 'cron.job table is unavailable; skipping schedule creation.';
END $$;

\echo 'Maintenance complete!'

