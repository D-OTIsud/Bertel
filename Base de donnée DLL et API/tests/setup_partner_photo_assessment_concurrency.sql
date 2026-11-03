\set ON_ERROR_STOP on
\ir assert_partner_api_ephemeral.sql
-- Use after setup_partner_photo_stock, in disposable CI only. No network provider.
BEGIN;
DO $test$ BEGIN
 ASSERT NOT EXISTS(SELECT 1 FROM public.app_ai_provider_config WHERE is_active),'do not replace another provider fixture';
 ASSERT EXISTS(SELECT 1 FROM internal.portal_photo_analysis_settings WHERE singleton AND NOT enabled AND provider_id IS NULL AND daily_analysis_limit IS NULL),'unexpected analysis fixture configuration';
END;$test$;
INSERT INTO public.app_ai_provider_config(id,label,api_kind,base_url,model,max_output_tokens,is_active)
 VALUES('00000000-0000-4000-af00-000000000021','Disposable concurrency fixture','openai_compatible','https://provider.invalid/v1','fixture-vision',1024,true);
UPDATE internal.portal_photo_analysis_settings SET enabled=true,daily_analysis_limit=1,provider_id='00000000-0000-4000-af00-000000000021';
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-00000000c511","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT api.reserve_portal_photo_upload('HOTRUN999999C502','00000000-0000-4000-af00-000000000101');
SELECT api.reserve_portal_photo_upload('HOTRUN999999C501','00000000-0000-4000-af00-000000000102');
RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
SELECT api.complete_portal_photo_upload('00000000-0000-4000-a000-00000000c511','00000000-0000-4000-af00-000000000101',repeat('a',64),'Race photo one',1800,1200);
SELECT api.complete_portal_photo_upload('00000000-0000-4000-a000-00000000c511','00000000-0000-4000-af00-000000000102',repeat('b',64),'Race photo two',1800,1200);
RESET ROLE;
COMMIT;
