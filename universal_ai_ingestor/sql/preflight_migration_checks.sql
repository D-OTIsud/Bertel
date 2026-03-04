-- Universal AI Ingestor migration preflight/post-apply checks
-- Execute in SQL Editor after applying sql/staging_ingestor.sql

-- 1) Required staging objects exist.
SELECT
    n.nspname AS schema_name,
    p.proname AS function_name
FROM pg_proc p
JOIN pg_namespace n
  ON n.oid = p.pronamespace
WHERE n.nspname = 'api'
  AND p.proname IN (
      'run_staging_dedup',
      'resolve_staging_dependencies',
      'assert_staging_batch_integrity',
      'commit_staging_to_public',
      'rollback_staging_batch_compensate',
      'purge_staging_batch',
      'retry_failed_media_downloads',
      'watchdog_mark_stale_batches',
      'get_ingestor_metrics',
      'get_ingestor_scheduler_health',
      'purge_expired_staging_batches'
  )
ORDER BY function_name;

-- 2) Required staging tables exist.
SELECT
    table_schema,
    table_name
FROM information_schema.tables
WHERE table_schema = 'staging'
  AND table_name IN (
      'import_batches',
      'import_events',
      'object_temp',
      'org_temp',
      'ref_code_temp',
      'media_temp',
      'batch_commit_ledger',
      'batch_commit_ledger_item',
      'mapping_contract',
      'mapping_contract_sheet',
      'mapping_contract_field',
      'mapping_relation_hypothesis',
      'mapping_review_decision'
  )
ORDER BY table_name;

-- 3) Recommended dependencies and extensions health.
SELECT extname
FROM pg_extension
WHERE extname IN ('uuid-ossp', 'pg_trgm', 'postgis')
ORDER BY extname;

SELECT
    to_regprocedure('public.immutable_unaccent(text)') IS NOT NULL AS has_immutable_unaccent;

-- 4) Retention and idempotency indexes.
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'staging'
  AND indexname IN ('uq_import_batches_idempotency_key', 'idx_import_batches_retention_until')
ORDER BY indexname;
