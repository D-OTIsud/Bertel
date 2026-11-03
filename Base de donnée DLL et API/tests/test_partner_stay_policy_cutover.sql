-- Isolated database only; apply supabase/cutovers/partner_stay_policy_cas.sql first.
BEGIN;
DO $$ BEGIN
  ASSERT NOT has_table_privilege('authenticated','public.object_stay_policy','INSERT');
  ASSERT NOT has_table_privilege('authenticated','public.object_stay_policy','UPDATE');
  ASSERT NOT has_table_privilege('authenticated','public.object_stay_policy','DELETE');
  ASSERT NOT has_function_privilege('authenticated','api.save_portal_stay_times(text,text,text,text)','EXECUTE');
  ASSERT has_function_privilege('authenticated','api.patch_portal_stay_times(text,jsonb)','EXECUTE');
END $$;
SET LOCAL ROLE authenticated;
DO $$ DECLARE v_denied boolean; BEGIN
  v_denied:=false;
  BEGIN INSERT INTO public.object_stay_policy(object_id,check_in_from) VALUES('HOTRUN9999998602','12:00');
  EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
  ASSERT v_denied,'old client INSERT still allowed';
  v_denied:=false;
  BEGIN UPDATE public.object_stay_policy SET check_in_from='12:00' WHERE false;
  EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
  ASSERT v_denied,'old client UPDATE still allowed';
  v_denied:=false;
  BEGIN DELETE FROM public.object_stay_policy WHERE false;
  EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
  ASSERT v_denied,'old client DELETE still allowed';
END $$;
RESET ROLE;
ROLLBACK;
