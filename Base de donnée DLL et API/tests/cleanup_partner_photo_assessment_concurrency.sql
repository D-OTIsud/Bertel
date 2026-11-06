\set ON_ERROR_STOP on
\ir assert_partner_api_ephemeral.sql
BEGIN;
DO $test$ BEGIN
 ASSERT EXISTS(SELECT 1 FROM internal.portal_photo_analysis_settings WHERE singleton AND provider_id='00000000-0000-4000-af00-000000000021'),'unexpected concurrency configuration';
END;$test$;
UPDATE internal.portal_photo_analysis_settings SET enabled=false,daily_analysis_limit=NULL,provider_id=NULL;
DELETE FROM public.app_ai_provider_config WHERE id='00000000-0000-4000-af00-000000000021';
COMMIT;
