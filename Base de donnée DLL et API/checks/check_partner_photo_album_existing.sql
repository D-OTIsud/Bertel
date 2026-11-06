-- Read-only adoption preflight for an EXISTING, ACTIVATED photo-only contract.
-- It writes no schema, data, flags or migration history and is repeatable.
-- It does not upgrade divergent/partial installations: review a separate delta.
\set ON_ERROR_STOP on
BEGIN READ ONLY;
SET LOCAL statement_timeout='15s';
DO $active$ BEGIN
 IF internal.portal_photo_actor_writes_enabled() IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Adoption requires the reviewed already-ACTIVATED state; no flag was changed';
 END IF;
END; $active$;
\ir assert_partner_photo_album_catalog.sql
ROLLBACK;
