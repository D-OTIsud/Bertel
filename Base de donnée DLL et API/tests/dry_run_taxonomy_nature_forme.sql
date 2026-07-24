-- Cloud dry-run proof: target migration + assertions + exact rollback + assertions,
-- all inside one transaction and always rolled back. No Docker/local DB.
\set ON_ERROR_STOP on

BEGIN;

\ir ../taxonomy_nature_forme_manifest_20260724.sql
\ir ../migration_taxonomy_nature_forme_body.sql
\ir test_taxonomy_nature_forme_target.sql

\ir ../rollback/taxonomy_nature_forme_before_state.sql
\ir ../rollback/taxonomy_nature_forme_rollback_body.sql
\ir test_taxonomy_nature_forme_initial.sql

ROLLBACK;
