\set ON_ERROR_STOP on

-- End-to-end cloud rehearsal over the real 8-object basket. All DDL/DML and
-- assertions are rolled back; the production database is left unchanged.
BEGIN;
\ir ../taxonomy_nature_forme_manifest_20260724.sql
\ir ../migration_taxonomy_nature_forme_body.sql
\ir ../migration_interop_crosswalk_leafaware_body.sql
\ir test_taxonomy_nature_forme_target.sql
\ir test_interop_crosswalk_leafaware.sql
\ir test_taxonomy_nature_forme_live_api.sql
ROLLBACK;

