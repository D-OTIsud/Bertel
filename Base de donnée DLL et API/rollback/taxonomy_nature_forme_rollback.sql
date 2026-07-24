-- =============================================================================
-- Emergency rollback wrapper for §190. Apply with psql from any directory;
-- \ir paths are relative to this file. Idempotent on the original live corpus.
-- =============================================================================
\set ON_ERROR_STOP on

BEGIN;
\ir taxonomy_nature_forme_before_state.sql
\ir taxonomy_nature_forme_rollback_body.sql
COMMIT;

REFRESH MATERIALIZED VIEW CONCURRENTLY internal.mv_filtered_objects;
REFRESH MATERIALIZED VIEW CONCURRENTLY internal.mv_ref_data_json;
