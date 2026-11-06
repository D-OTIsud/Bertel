\set ON_ERROR_STOP on
\ir assert_partner_api_ephemeral.sql
-- Not executed by this integration task. Reuses the pre-existing guarded test
-- environment only; never run as a production fixture or create a new database.
DO $test$
BEGIN
 ASSERT NOT internal.portal_photo_actor_writes_enabled();
 ASSERT has_function_privilege('authenticated','api.get_my_portal_photo_workspace(text)','EXECUTE');
 ASSERT NOT has_function_privilege('anon','api.get_my_portal_photo_workspace(text)','EXECUTE');
 ASSERT NOT has_function_privilege('authenticated','api.update_portal_photo_texts(text,uuid,jsonb,text,text)','EXECUTE');
 ASSERT NOT has_function_privilege('authenticated','api.update_portal_photo_proposal_texts(text,uuid,jsonb,text,text)','EXECUTE');
 ASSERT NOT has_function_privilege('authenticated','api.reconcile_portal_photo_order(text,jsonb,jsonb)','EXECUTE');
 ASSERT NOT has_function_privilege('authenticated','api.reorder_portal_photos(text,jsonb)','EXECUTE');
 ASSERT NOT has_function_privilege('authenticated','api.appeal_portal_photo_review(text,uuid,uuid,text,uuid)','EXECUTE');
 ASSERT NOT has_function_privilege('authenticated','api.reserve_portal_photo_upload(text,uuid,uuid)','EXECUTE');
 ASSERT NOT has_function_privilege('service_role','api.complete_portal_photo_upload(uuid,uuid,text,text,integer,integer)','EXECUTE');
END;
$test$;
