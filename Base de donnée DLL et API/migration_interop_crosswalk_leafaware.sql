-- §190 DATAtourisme: taxonomy-aware nearest-ancestor crosswalk.
\set ON_ERROR_STOP on

BEGIN;
\ir migration_interop_crosswalk_leafaware_body.sql
COMMIT;
