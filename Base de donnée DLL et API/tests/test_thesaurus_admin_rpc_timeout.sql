-- Disposable fresh database only; the upgrade exercise is rolled back.
-- This tests catalogue scope, not PostgREST's HTTP hoisting behaviour.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout = '60s';

-- Exercise replacement of a pre-existing setting rather than only reapplying 30s.
ALTER FUNCTION api.thesaurus_admin(text,jsonb) SET statement_timeout = '7s';
CREATE TEMP TABLE _thesaurus_rpc_timeout_functions_before ON COMMIT DROP AS
SELECT p.oid, to_jsonb(p) - 'proconfig' AS preserved,
  p.proconfig AS all_settings,
  ARRAY(SELECT setting FROM unnest(COALESCE(p.proconfig, '{}'::text[])) setting
    WHERE setting NOT LIKE 'statement_timeout=%' ORDER BY setting) AS other_settings
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname IN ('api', 'thesaurus');
CREATE TEMP TABLE _thesaurus_rpc_timeout_roles_before ON COMMIT DROP AS
SELECT oid, rolconfig FROM pg_roles;
CREATE TEMP TABLE _thesaurus_rpc_timeout_db_settings_before ON COMMIT DROP AS
SELECT * FROM pg_db_role_setting;

\ir ../thesaurus_admin_rpc_timeout.sql

DO $scoped_rpc_timeout$
DECLARE target oid := 'api.thesaurus_admin(text,jsonb)'::regprocedure;
BEGIN
  ASSERT (SELECT count(*) = 1 FROM pg_proc p, unnest(p.proconfig) setting
    WHERE p.oid = target AND setting = 'statement_timeout=30s'),
    'The exposed admin RPC must have exactly one bounded 30s timeout';
  ASSERT NOT EXISTS (
    SELECT 1 FROM _thesaurus_rpc_timeout_functions_before b
    LEFT JOIN pg_proc p ON p.oid = b.oid
    WHERE to_jsonb(p) - 'proconfig' IS DISTINCT FROM b.preserved
      OR CASE WHEN p.oid = target THEN
        ARRAY(SELECT setting FROM unnest(COALESCE(p.proconfig, '{}'::text[])) setting
          WHERE setting NOT LIKE 'statement_timeout=%' ORDER BY setting)
          IS DISTINCT FROM b.other_settings
        ELSE p.proconfig IS DISTINCT FROM b.all_settings END
  ), 'Function bodies, owner, ACL, security mode, search paths and other RPC settings must remain unchanged';
  ASSERT NOT EXISTS (
    (SELECT oid, rolconfig FROM pg_roles EXCEPT SELECT * FROM _thesaurus_rpc_timeout_roles_before)
    UNION ALL
    (SELECT * FROM _thesaurus_rpc_timeout_roles_before EXCEPT SELECT oid, rolconfig FROM pg_roles)
  ), 'The migration must not change any role-wide timeout or configuration';
  ASSERT NOT EXISTS (
    (SELECT * FROM pg_db_role_setting EXCEPT SELECT * FROM _thesaurus_rpc_timeout_db_settings_before)
    UNION ALL
    (SELECT * FROM _thesaurus_rpc_timeout_db_settings_before EXCEPT SELECT * FROM pg_db_role_setting)
  ), 'The migration must not change database-wide or per-database role settings';
  ASSERT current_setting('statement_timeout')::interval = interval '60 seconds',
    'Changing RPC metadata must not change the calling SQL session timeout';
END
$scoped_rpc_timeout$;

-- A second installation must preserve the same bounded setting and ACLs.
\ir ../thesaurus_admin_rpc_timeout.sql
DO $idempotent_rpc_timeout$
BEGIN
  ASSERT (SELECT count(*) = 1 FROM pg_proc p, unnest(p.proconfig) setting
    WHERE p.oid = 'api.thesaurus_admin(text,jsonb)'::regprocedure
      AND setting LIKE 'statement_timeout=%'),
    'Repeated installation must not duplicate the RPC timeout setting';
  ASSERT (SELECT to_jsonb(p) - 'proconfig' = b.preserved
    FROM pg_proc p JOIN _thesaurus_rpc_timeout_functions_before b USING(oid)
    WHERE p.oid = 'api.thesaurus_admin(text,jsonb)'::regprocedure),
    'Repeated installation must preserve authorization metadata and the function body';
END
$idempotent_rpc_timeout$;
ROLLBACK;
