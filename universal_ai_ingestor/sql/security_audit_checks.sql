-- Universal AI Ingestor security audit checks
-- Execute with an admin/service connection in the target Supabase database.

-- 1) Sensitive API RPC privileges by role.
SELECT
    r.routine_schema,
    r.routine_name,
    grantee,
    privilege_type
FROM information_schema.routine_privileges rp
JOIN information_schema.routines r
  ON r.specific_name = rp.specific_name
WHERE r.routine_schema = 'api'
  AND r.routine_name IN (
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
ORDER BY r.routine_name, grantee, privilege_type;

-- 2) Staging schema/table privileges for public-facing roles.
SELECT
    table_schema,
    table_name,
    grantee,
    privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'staging'
  AND grantee IN ('anon', 'authenticated', 'public')
ORDER BY table_name, grantee, privilege_type;

-- 3) Quick pass/fail summary for sensitive RPC exposure.
WITH sensitive_rpcs AS (
    SELECT unnest(ARRAY[
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
    ]) AS routine_name
),
unexpected AS (
    SELECT
        r.routine_name,
        rp.grantee,
        rp.privilege_type
    FROM sensitive_rpcs s
    JOIN information_schema.routines r
      ON r.routine_schema = 'api'
     AND r.routine_name = s.routine_name
    JOIN information_schema.routine_privileges rp
      ON rp.specific_name = r.specific_name
    WHERE rp.grantee IN ('anon', 'authenticated', 'public')
)
SELECT
    CASE WHEN EXISTS (SELECT 1 FROM unexpected) THEN 'FAIL' ELSE 'PASS' END AS rpc_exposure_check,
    COALESCE(jsonb_agg(to_jsonb(unexpected)) FILTER (WHERE routine_name IS NOT NULL), '[]'::jsonb) AS unexpected_grants
FROM unexpected;
