-- Use the real predecessor definitions captured by the fresh manifest before ACC08.
-- Restore each predecessor separately and require the exact source mismatch.
\set ON_ERROR_STOP on
\set album_post_acc08 on
BEGIN;
\ir ../checks/assert_partner_photo_album_catalog.sql

SAVEPOINT old_body;
SELECT :'album_pre_acc08_submit' \gexec
\set ON_ERROR_STOP off
\ir ../checks/assert_partner_photo_album_catalog.sql
\set album_error_state :SQLSTATE
\set album_error_message :LAST_ERROR_MESSAGE
\set ON_ERROR_STOP on
ROLLBACK TO SAVEPOINT old_body;
RELEASE SAVEPOINT old_body;
SELECT :'album_error_state' = 'P0001'
   AND :'album_error_message' = 'Photo function source differs (api.submit_actor_fiche(text,jsonb,text))'
   AS album_expected_failure \gset
\if :album_expected_failure
\else
  \echo 'ERROR: post-ACC08 checker did not reject the predecessor of api.submit_actor_fiche(text,jsonb,text)'
  \quit 1
\endif

SAVEPOINT old_body;
SELECT :'album_pre_acc08_approve' \gexec
\set ON_ERROR_STOP off
\ir ../checks/assert_partner_photo_album_catalog.sql
\set album_error_state :SQLSTATE
\set album_error_message :LAST_ERROR_MESSAGE
\set ON_ERROR_STOP on
ROLLBACK TO SAVEPOINT old_body;
RELEASE SAVEPOINT old_body;
SELECT :'album_error_state' = 'P0001'
   AND :'album_error_message' = 'Photo function source differs (api.approve_pending_change(uuid,text,boolean))'
   AS album_expected_failure \gset
\if :album_expected_failure
\else
  \echo 'ERROR: post-ACC08 checker did not reject the predecessor of api.approve_pending_change(uuid,text,boolean)'
  \quit 1
\endif

ROLLBACK;
\unset album_post_acc08
\unset album_pre_acc08_submit
\unset album_pre_acc08_approve
