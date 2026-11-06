-- Synthetic catalog mutations only, against the disposable fresh CI database.
-- Every mutation is rolled back; the actual read-only checker must reject it.
\set ON_ERROR_STOP on
\set VERBOSITY terse
BEGIN;
\ir ../checks/assert_partner_photo_album_catalog.sql
SAVEPOINT required_workspace_grant;
REVOKE EXECUTE ON FUNCTION api.get_my_portal_photo_workspace(text) FROM authenticated;
\echo 'Expected refusal: required_workspace_grant'
\set ON_ERROR_STOP off
\ir ../checks/assert_partner_photo_album_catalog.sql
\set album_error_state :SQLSTATE
\if :ERROR
\else
  \echo 'ERROR: catalog mismatch was accepted: required_workspace_grant'
  \quit 1
\endif
\set ON_ERROR_STOP on
ROLLBACK TO SAVEPOINT required_workspace_grant;
SELECT :'album_error_state'='P0001' AS album_expected_failure \gset
\if :album_expected_failure
\else
  \echo 'ERROR: failure was unrelated to the contract assertion'
  \quit 1
\endif
SAVEPOINT anonymous_grant;
GRANT EXECUTE ON FUNCTION api.get_my_portal_photo_workspace(text) TO anon;
\echo 'Expected refusal: anonymous_grant'
\set ON_ERROR_STOP off
\ir ../checks/assert_partner_photo_album_catalog.sql
\set album_error_state :SQLSTATE
\if :ERROR
\else
  \echo 'ERROR: catalog mismatch was accepted: anonymous_grant'
  \quit 1
\endif
\set ON_ERROR_STOP on
ROLLBACK TO SAVEPOINT anonymous_grant;
SELECT :'album_error_state'='P0001' AS album_expected_failure \gset
\if :album_expected_failure
\else
  \echo 'ERROR: failure was unrelated to the contract assertion'
  \quit 1
\endif
SAVEPOINT service_grant;
GRANT EXECUTE ON FUNCTION api.get_my_portal_photo_workspace(text) TO service_role;
\echo 'Expected refusal: service_grant'
\set ON_ERROR_STOP off
\ir ../checks/assert_partner_photo_album_catalog.sql
\set album_error_state :SQLSTATE
\if :ERROR
\else
  \echo 'ERROR: catalog mismatch was accepted: service_grant'
  \quit 1
\endif
\set ON_ERROR_STOP on
ROLLBACK TO SAVEPOINT service_grant;
SELECT :'album_error_state'='P0001' AS album_expected_failure \gset
\if :album_expected_failure
\else
  \echo 'ERROR: failure was unrelated to the contract assertion'
  \quit 1
\endif
SAVEPOINT changed_config;
ALTER FUNCTION api.get_my_portal_photo_workspace(text) SET search_path=public;
\echo 'Expected refusal: changed_config'
\set ON_ERROR_STOP off
\ir ../checks/assert_partner_photo_album_catalog.sql
\set album_error_state :SQLSTATE
\if :ERROR
\else
  \echo 'ERROR: catalog mismatch was accepted: changed_config'
  \quit 1
\endif
\set ON_ERROR_STOP on
ROLLBACK TO SAVEPOINT changed_config;
SELECT :'album_error_state'='P0001' AS album_expected_failure \gset
\if :album_expected_failure
\else
  \echo 'ERROR: failure was unrelated to the contract assertion'
  \quit 1
\endif
SAVEPOINT permissive_homonym;
DROP POLICY gallery_photo_no_direct_insert ON public.media;
CREATE POLICY gallery_photo_no_direct_insert ON public.media AS PERMISSIVE FOR INSERT TO anon,authenticated WITH CHECK(false);
\echo 'Expected refusal: permissive_homonym'
\set ON_ERROR_STOP off
\ir ../checks/assert_partner_photo_album_catalog.sql
\set album_error_state :SQLSTATE
\if :ERROR
\else
  \echo 'ERROR: catalog mismatch was accepted: permissive_homonym'
  \quit 1
\endif
\set ON_ERROR_STOP on
ROLLBACK TO SAVEPOINT permissive_homonym;
SELECT :'album_error_state'='P0001' AS album_expected_failure \gset
\if :album_expected_failure
\else
  \echo 'ERROR: failure was unrelated to the contract assertion'
  \quit 1
\endif
SAVEPOINT weakened_policy;
ALTER POLICY gallery_photo_no_direct_update ON public.media TO authenticated USING(true) WITH CHECK(true);
\echo 'Expected refusal: weakened_policy'
\set ON_ERROR_STOP off
\ir ../checks/assert_partner_photo_album_catalog.sql
\set album_error_state :SQLSTATE
\if :ERROR
\else
  \echo 'ERROR: catalog mismatch was accepted: weakened_policy'
  \quit 1
\endif
\set ON_ERROR_STOP on
ROLLBACK TO SAVEPOINT weakened_policy;
SELECT :'album_error_state'='P0001' AS album_expected_failure \gset
\if :album_expected_failure
\else
  \echo 'ERROR: failure was unrelated to the contract assertion'
  \quit 1
\endif
SAVEPOINT missing_fk;
ALTER TABLE internal.gallery_write_receipt DROP CONSTRAINT gallery_write_receipt_user_id_fkey;
\echo 'Expected refusal: missing_fk'
\set ON_ERROR_STOP off
\ir ../checks/assert_partner_photo_album_catalog.sql
\set album_error_state :SQLSTATE
\if :ERROR
\else
  \echo 'ERROR: catalog mismatch was accepted: missing_fk'
  \quit 1
\endif
\set ON_ERROR_STOP on
ROLLBACK TO SAVEPOINT missing_fk;
SELECT :'album_error_state'='P0001' AS album_expected_failure \gset
\if :album_expected_failure
\else
  \echo 'ERROR: failure was unrelated to the contract assertion'
  \quit 1
\endif
SAVEPOINT missing_check;
ALTER TABLE internal.portal_photo_analysis DROP CONSTRAINT portal_photo_analysis_source_sha256_check;
\echo 'Expected refusal: missing_check'
\set ON_ERROR_STOP off
\ir ../checks/assert_partner_photo_album_catalog.sql
\set album_error_state :SQLSTATE
\if :ERROR
\else
  \echo 'ERROR: catalog mismatch was accepted: missing_check'
  \quit 1
\endif
\set ON_ERROR_STOP on
ROLLBACK TO SAVEPOINT missing_check;
SELECT :'album_error_state'='P0001' AS album_expected_failure \gset
\if :album_expected_failure
\else
  \echo 'ERROR: failure was unrelated to the contract assertion'
  \quit 1
\endif
SAVEPOINT missing_unique_index;
DROP INDEX internal.portal_photo_analysis_one_attempt;
\echo 'Expected refusal: missing_unique_index'
\set ON_ERROR_STOP off
\ir ../checks/assert_partner_photo_album_catalog.sql
\set album_error_state :SQLSTATE
\if :ERROR
\else
  \echo 'ERROR: catalog mismatch was accepted: missing_unique_index'
  \quit 1
\endif
\set ON_ERROR_STOP on
ROLLBACK TO SAVEPOINT missing_unique_index;
SELECT :'album_error_state'='P0001' AS album_expected_failure \gset
\if :album_expected_failure
\else
  \echo 'ERROR: failure was unrelated to the contract assertion'
  \quit 1
\endif
SAVEPOINT changed_column_type;
ALTER TABLE internal.portal_photo_analysis ALTER COLUMN source_sha256 TYPE varchar(64);
\echo 'Expected refusal: changed_column_type'
\set ON_ERROR_STOP off
\ir ../checks/assert_partner_photo_album_catalog.sql
\set album_error_state :SQLSTATE
\if :ERROR
\else
  \echo 'ERROR: catalog mismatch was accepted: changed_column_type'
  \quit 1
\endif
\set ON_ERROR_STOP on
ROLLBACK TO SAVEPOINT changed_column_type;
SELECT :'album_error_state'='P0001' AS album_expected_failure \gset
\if :album_expected_failure
\else
  \echo 'ERROR: failure was unrelated to the contract assertion'
  \quit 1
\endif
-- Positive activated-state metadata witness. This is NOT a deployment cutover.
CREATE OR REPLACE FUNCTION internal.portal_photo_actor_writes_enabled() RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $fn$
 SELECT true;
$fn$;
GRANT EXECUTE ON FUNCTION api.update_portal_photo_texts(text,uuid,jsonb,text,text),
 api.update_portal_photo_proposal_texts(text,uuid,jsonb,text,text),api.reconcile_portal_photo_order(text,jsonb,jsonb),
 api.appeal_portal_photo_review(text,uuid,uuid,text,uuid),api.withdraw_portal_photo(text,uuid),
 api.reserve_portal_photo_upload(text,uuid,uuid),api.cancel_portal_photo_upload(text,uuid),
 api.reserve_portal_photo_analysis(text,uuid,uuid),api.start_portal_photo_analysis(uuid,uuid),
 api.appeal_portal_photo_analysis(uuid,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION api.complete_portal_photo_upload(uuid,uuid,text,text,integer,integer) TO service_role;
\ir ../checks/assert_partner_photo_album_catalog.sql
ROLLBACK;
BEGIN READ ONLY;
\ir ../checks/assert_partner_photo_album_catalog.sql
ROLLBACK;
\set VERBOSITY default
