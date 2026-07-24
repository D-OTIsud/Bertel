-- =============================================================================
-- migration_taxonomy_nature_forme.sql — §190 HLO nature before form
-- Cloud migration; idempotent fresh/live/post-live. No Docker/local DB required.
-- The transactional body is shared verbatim with the dry-run and rollback proof.
-- =============================================================================
\set ON_ERROR_STOP on

BEGIN;
\ir taxonomy_nature_forme_manifest_20260724.sql
\ir migration_taxonomy_nature_forme_body.sql
COMMIT;

-- Production-visible projections, deliberately outside the transaction.
REFRESH MATERIALIZED VIEW CONCURRENTLY internal.mv_filtered_objects;
REFRESH MATERIALIZED VIEW CONCURRENTLY internal.mv_ref_data_json;
