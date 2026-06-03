-- ci_fresh_apply.sql
-- Executable form of the canonical fresh-install manifest documented in
-- docs/SQL_ROLLOUT_RUNBOOK.md ("Fresh Database — Complete Ordered Manifest").
-- Applies every schema file to a BLANK database in dependency order and ABORTS
-- on the first error (\set ON_ERROR_STOP on).
--
-- Used by .github/workflows/sql-fresh-apply.yml — the CI gate that enforces the
-- "Deploy integrity (no PROD-only DDL)" invariant in CLAUDE.md. Also runnable
-- locally against a `supabase start` database:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f "Base de donnée DLL et API/ci_fresh_apply.sql"
--
-- REQUIRES a Supabase-flavoured Postgres: the files reference the `auth` and
-- `storage` schemas, auth.uid()/auth.role(), and the roles anon / authenticated
-- / service_role. A vanilla Postgres will fail at the RLS and media_bucket steps.
--
-- Paths use \ir (include relative to THIS file), so the current working
-- directory does not matter.

\set ON_ERROR_STOP on

-- 0. Extensions. pg_cron is intentionally OMITTED: schema_unified.sql references
--    it only in comments (freshness-strategy docs), never as executed DDL.
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

\echo '== 1/13  schema_unified.sql =='
\ir schema_unified.sql
\echo '== 2/13  migration_sustainability_v5.sql  (prereq for V5 seeds) =='
\ir migration_sustainability_v5.sql
\echo '== 3/13  migration_room_type_ref.sql =='
\ir migration_room_type_ref.sql
\echo '== 4/13  migration_tag_link_position.sql =='
\ir migration_tag_link_position.sql
\echo '== 5/13  api_views_functions.sql =='
\ir api_views_functions.sql
\echo '== 6/13  rls_policies.sql  (defines api.is_object_owner) =='
\ir rls_policies.sql
\echo '== 7/13  object_workspace_safe_write_rpcs.sql  (schema internal + write gate) =='
\ir object_workspace_safe_write_rpcs.sql
\echo '== 8/13  object_workspace_gap_rpcs.sql =='
\ir object_workspace_gap_rpcs.sql
\echo '== 8b     migration_permission_write_paths.sql  (SP-1 canonical-write auth; after RLS + workspace RPCs) =='
\ir migration_permission_write_paths.sql
\echo '== 8c     migration_permission_write_paths_b.sql  (SP-1b — complete canonical-write coverage) =='
\ir migration_permission_write_paths_b.sql
\echo '== 8d     migration_rls_read_gate_p03.sql  (P0.3 — gate object-child reads behind can_read_object) =='
\ir migration_rls_read_gate_p03.sql
\echo '== 9/13  ui_whitelabel_branding.sql  (defines api.is_platform_admin) =='
\ir ui_whitelabel_branding.sql
\echo '== 10/13 media_bucket.sql  (storage bucket + RESTRICTIVE write RLS) =='
\ir media_bucket.sql
\echo '== 11/13 seeds_data.sql  (needs ref_sustainability_action_group from step 2) =='
\ir seeds_data.sql
\echo '== 12/13 migration_legal_siret_canonical.sql  (data fixup; AFTER seeds) =='
\ir migration_legal_siret_canonical.sql
\echo '== 13/13 migration_object_location_address1_dedupe.sql  (post-import hygiene; no-op fresh) =='
\ir migration_object_location_address1_dedupe.sql

-- Materialized views are created WITH DATA in schema_unified.sql; refresh
-- NON-concurrently here so this also works on a never-yet-populated MV.
-- (Production scheduling uses REFRESH ... CONCURRENTLY via pg_cron — see runbook.)
\echo '== MV refresh (non-concurrent) =='
REFRESH MATERIALIZED VIEW internal.mv_ref_data_json;
REFRESH MATERIALIZED VIEW internal.mv_filtered_objects;

\echo '== Fresh apply complete =='
