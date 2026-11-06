SET LOCAL lock_timeout='500ms';
SET LOCAL statement_timeout='10s';
CREATE OR REPLACE FUNCTION internal.portal_photo_actor_writes_enabled() RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $fn$
 SELECT false;
$fn$;
REVOKE ALL ON FUNCTION internal.portal_photo_actor_writes_enabled() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION api.update_portal_photo_texts(text,uuid,jsonb,text,text),
 api.update_portal_photo_proposal_texts(text,uuid,jsonb,text,text),api.reconcile_portal_photo_order(text,jsonb,jsonb),
 api.appeal_portal_photo_review(text,uuid,uuid,text,uuid),api.withdraw_portal_photo(text,uuid),
 api.reorder_portal_photos(text,jsonb),api.reserve_portal_photo_upload(text,uuid,uuid),api.cancel_portal_photo_upload(text,uuid),
 api.complete_portal_photo_upload(uuid,uuid,text,text,integer,integer),api.reserve_portal_photo_analysis(text,uuid,uuid),
 api.start_portal_photo_analysis(uuid,uuid),api.appeal_portal_photo_analysis(uuid,text,uuid)
 FROM PUBLIC,anon,authenticated,service_role;