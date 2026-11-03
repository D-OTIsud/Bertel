-- Isolated database only; apply supabase/cutovers/partner_stay_policy_cas.sql first.
BEGIN;
DO $$ BEGIN
  ASSERT NOT has_table_privilege('authenticated','public.object_stay_policy','INSERT');
  ASSERT NOT has_table_privilege('authenticated','public.object_stay_policy','UPDATE');
  ASSERT NOT has_table_privilege('authenticated','public.object_stay_policy','DELETE');
  ASSERT NOT has_any_column_privilege('authenticated','public.object_stay_policy','INSERT');
  ASSERT NOT has_any_column_privilege('authenticated','public.object_stay_policy','UPDATE');
  ASSERT NOT has_function_privilege('authenticated','api.save_portal_stay_times(text,text,text,text)','EXECUTE');
  ASSERT has_function_privilege('authenticated','api.patch_portal_stay_times(text,jsonb)','EXECUTE');
END $$;
-- The same caller passes the canonical gate. Denial must come from closed DML,
-- not a missing identity, absent row, or a row-level rule unrelated to cutover.
INSERT INTO auth.users(id,email) VALUES('00000000-0000-4000-a000-000000008699','r2-cutover@example.test');
INSERT INTO public.app_user_profile(id,role) VALUES('00000000-0000-4000-a000-000000008699','super_admin');
INSERT INTO public.object(id,object_type,name,status,is_test) VALUES
  ('HOTRUN9999998698','HOT','R2 cutover existing','published',true),('HOTRUN9999998699','HOT','R2 cutover insert','published',true);
INSERT INTO public.object_stay_policy(object_id,check_in_from,conditions) VALUES('HOTRUN9999998698','14:00:30','Office');
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-000000008699","role":"authenticated"}',true);
DO $$ BEGIN ASSERT api.user_can_write_object_canonical('HOTRUN9999998698'),'fixture must be a real canonical writer'; END $$;
SELECT set_config('r2.cutover_baseline',internal.stay_policy_snapshot('HOTRUN9999998698')::text,true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE v_denied boolean; BEGIN
  v_denied:=false;
  BEGIN INSERT INTO public.object_stay_policy(object_id,check_in_from) VALUES('HOTRUN9999998699','12:00');
  EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
  ASSERT v_denied,'old client INSERT still allowed';
  v_denied:=false;
  BEGIN UPDATE public.object_stay_policy SET check_in_from='12:00' WHERE object_id='HOTRUN9999998698';
  EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
  ASSERT v_denied,'old client UPDATE still allowed';
  v_denied:=false;
  BEGIN DELETE FROM public.object_stay_policy WHERE object_id='HOTRUN9999998698';
  EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
  ASSERT v_denied,'old client DELETE still allowed';
  PERFORM api.save_object_capacity_policies('HOTRUN9999998698',jsonb_build_object('stay_policy',
    jsonb_build_object('write_contract','stay-policy-patch-v1','expected',current_setting('r2.cutover_baseline')::jsonb,'changes','{"check_out_until":"11:00"}'::jsonb)));
END $$;
RESET ROLE;
DO $$ BEGIN
  ASSERT (SELECT check_in_from='14:00:30'::time AND conditions='Office' AND check_out_until='11:00'::time FROM public.object_stay_policy WHERE object_id='HOTRUN9999998698'),'narrow office RPC failed after DML closure';
  ASSERT NOT EXISTS(SELECT 1 FROM public.object_stay_policy WHERE object_id='HOTRUN9999998699');
END $$;
ROLLBACK;
