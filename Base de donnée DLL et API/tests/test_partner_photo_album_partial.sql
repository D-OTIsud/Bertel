-- Disposable fresh database only. The REAL shared preflight is exercised
-- before any album DDL, including an otherwise orphaned single RPC.
\set ON_ERROR_STOP on
BEGIN;
\ir ../checks/check_partner_photo_album_fresh_preconditions.sql
CREATE FUNCTION api.portal_message_document(uuid) RETURNS jsonb LANGUAGE sql AS $orphan$ SELECT '{"partial":true}'::jsonb; $orphan$;
SAVEPOINT partial_album;
\echo 'Expected refusal: orphaned portal_message_document(uuid)'
\set ON_ERROR_STOP off
\ir ../checks/check_partner_photo_album_fresh_preconditions.sql
\set album_error_state :SQLSTATE
\if :ERROR
\else
  \echo 'ERROR: catalog mismatch was accepted: orphaned portal_message_document(uuid)'
  \quit 1
\endif
\set ON_ERROR_STOP on
ROLLBACK TO SAVEPOINT partial_album;
SELECT :'album_error_state'='P0001' AS album_expected_failure \gset
\if :album_expected_failure
\else
  \echo 'ERROR: failure was unrelated to the contract assertion'
  \quit 1
\endif
DO $unchanged$ BEGIN
 ASSERT to_regclass('internal.gallery_write_receipt') IS NULL
   AND to_regclass('internal.portal_photo_analysis_settings') IS NULL
   AND to_regclass('internal.portal_photo_analysis') IS NULL;
 ASSERT (SELECT prosrc FROM pg_proc WHERE oid='api.portal_message_document(uuid)'::regprocedure)
   = ' SELECT ''{"partial":true}''::jsonb; ', 'The orphaned function was overwritten';
 ASSERT (SELECT md5(pg_get_constraintdef(oid)) FROM pg_constraint WHERE conrelid='public.app_notification'::regclass
   AND conname='chk_app_notification_kind')='7422d4daf1c99e1767e91a0ce5abcfa9', 'Notification contract was changed before refusal';
END; $unchanged$;
ROLLBACK;
\ir ../checks/check_partner_photo_album_fresh_preconditions.sql
