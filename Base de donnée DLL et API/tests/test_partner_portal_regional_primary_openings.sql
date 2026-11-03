-- X1 real opt-in serializer, only on disposable Supabase. Never activates an absent export.
\set ON_ERROR_STOP on
DO $$ BEGIN
 IF current_setting('bertel.ephemeral_ci',true) IS DISTINCT FROM 'on' THEN
  RAISE EXCEPTION 'Disposable Supabase required: bertel.ephemeral_ci=on';
 END IF;
END $$;
BEGIN;
DO $test$
DECLARE v_main jsonb; v_reception jsonb; v_service jsonb; v_before jsonb; v_after jsonb;
BEGIN
 ASSERT to_regprocedure('api.tourinsoft_reunion_regional_documents(text[])') IS NOT NULL,
   'CI manifest must install the real regional serializer; absence is not a passing X1 test';
 ASSERT NOT has_function_privilege('anon','api.tourinsoft_reunion_regional_documents(text[])','EXECUTE');
 ASSERT NOT has_function_privilege('authenticated','api.tourinsoft_reunion_regional_documents(text[])','EXECUTE');
 ASSERT has_function_privilege('service_role','api.tourinsoft_reunion_regional_documents(text[])','EXECUTE');
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 INSERT INTO public.object(id,object_type,name,status,is_test,commercial_visibility)
 VALUES('RESRUN999999B301','RES','Regional primary opening fixture','published',false,'active');
 v_main:='{"schedule_type_code":"regular","name":"Main opening","time_periods":[{"weekdays":[{"weekday_code":"monday"}],"time_frames":[{"start_time":"09:00","end_time":"12:00"},{"start_time":"14:00","end_time":"18:00"}]}]}'::jsonb;
 v_reception:='{"schedule_type_code":"reception","name":"Reception only","time_periods":[{"weekdays":[{"weekday_code":"monday"}],"time_frames":[{"start_time":"08:00","end_time":"09:00"}]}]}'::jsonb;
 v_service:='{"schedule_type_code":"service","name":"Late service only","time_periods":[{"weekdays":[{"weekday_code":"sunday"}],"time_frames":[{"start_time":"20:00","end_time":"22:00"}]}]}'::jsonb;
 PERFORM api.save_object_openings('RESRUN999999B301',jsonb_build_object('periods',jsonb_build_array(
   jsonb_build_object('name','Annual period','all_years',true,'schedules',jsonb_build_array(v_main)))));
 SELECT document INTO v_before FROM api.tourinsoft_reunion_regional_documents(ARRAY['RESRUN999999B301']);
 ASSERT v_before IS NOT NULL,'Regional positive fixture did not resolve';
 ASSERT v_before#>>'{PeriodeOuvertures,0,lundiheuredebut1}'='09:00';
 ASSERT v_before#>>'{PeriodeOuvertures,0,lundiheurefin1}'='12:00';
 ASSERT v_before#>>'{PeriodeOuvertures,0,lundiheuredebut2}'='14:00';
 ASSERT v_before#>>'{PeriodeOuvertures,0,lundiheurefin2}'='18:00';
 PERFORM api.save_object_openings('RESRUN999999B301',jsonb_build_object('periods',jsonb_build_array(
   jsonb_build_object('name','Annual period','all_years',true,'schedules',jsonb_build_array(v_main,v_reception,v_service)))));
 SELECT document INTO v_after FROM api.tourinsoft_reunion_regional_documents(ARRAY['RESRUN999999B301']);
 ASSERT v_before=v_after,'Reception/service changed the complete regional primary document';
 ASSERT v_after->>'Ouvertdimanchesoir' IS DISTINCT FROM 'true','Late service made the restaurant open Sunday evening';

 -- Principal without fixed hours remains unchanged by secondary schedules.
 v_main:=jsonb_set(v_main,'{time_periods,0,time_frames}','[]'::jsonb);
 PERFORM api.save_object_openings('RESRUN999999B301',jsonb_build_object('periods',jsonb_build_array(
   jsonb_build_object('name','No fixed hours','all_years',true,'schedules',jsonb_build_array(v_main)))));
 SELECT document INTO v_before FROM api.tourinsoft_reunion_regional_documents(ARRAY['RESRUN999999B301']);
 PERFORM api.save_object_openings('RESRUN999999B301',jsonb_build_object('periods',jsonb_build_array(
   jsonb_build_object('name','No fixed hours','all_years',true,'schedules',jsonb_build_array(v_main,v_reception,v_service)))));
 SELECT document INTO v_after FROM api.tourinsoft_reunion_regional_documents(ARRAY['RESRUN999999B301']);
 ASSERT v_before=v_after,'Secondary schedules manufactured fixed hours';
 ASSERT NOT jsonb_path_exists(v_after,'$.PeriodeOuvertures[*].lundiheuredebut1');

 -- A closure is never exported as a regular opening.
 PERFORM api.save_object_openings('RESRUN999999B301',jsonb_build_object('periods',jsonb_build_array(
   jsonb_build_object('name','Closure','all_years',true,'is_closure',true,'schedules',jsonb_build_array(v_reception,v_service)))));
 SELECT document INTO v_after FROM api.tourinsoft_reunion_regional_documents(ARRAY['RESRUN999999B301']);
 ASSERT NOT jsonb_path_exists(v_after,'$.PeriodeOuvertures[*].lundiheuredebut1');
 ASSERT v_after->>'Ouvertdimanchesoir' IS DISTINCT FROM 'true';
 RAISE NOTICE 'X1 regional primary opening: two slots, secondary schedules, no fixed hours and closure passed';
END;
$test$;
ROLLBACK;
