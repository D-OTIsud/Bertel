BEGIN;
DO $test$
DECLARE
 v_user uuid:='00000000-0000-4000-a000-000000008301'; v_json jsonb; v_period uuid;v_days jsonb;v_schedules jsonb;v_type text;
 v_private uuid;v_public uuid;
BEGIN
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 ASSERT EXISTS(SELECT 1 FROM public.ref_code_opening_schedule_type WHERE code='reception' AND name='Accueil');
 ASSERT EXISTS(SELECT 1 FROM public.ref_code_opening_schedule_type WHERE code='service' AND name_i18n->>'en'='Service');
 ASSERT NOT has_function_privilege('anon','api.save_object_openings(text,jsonb)','EXECUTE');
 INSERT INTO auth.users(id,email) VALUES(v_user,'named-schedules-8301@example.test');
 INSERT INTO public.app_user_profile(id,role) VALUES(v_user,'super_admin') ON CONFLICT(id) DO UPDATE SET role='super_admin';
 INSERT INTO public.object(id,object_type,name,status,is_test,business_timezone) VALUES('ACTRUN9999998301','ACT','Plannings nommés test','published',true,'Indian/Reunion');
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_user,'role','authenticated','app_metadata',jsonb_build_object('sandbox_discovery',true))::text,true);
 PERFORM api.save_object_openings('ACTRUN9999998301','{"periods":[{"name":"Ouverture annuelle","all_years":true,"schedules":[{"schedule_type_code":"regular","name":"Ouverture","time_periods":[{"weekdays":[{"weekday_code":"monday"}],"time_frames":[{"start_time":"09:00","end_time":"12:00"}]}]},{"schedule_type_code":"reception","name":"Accueil sur place","time_periods":[{"weekdays":[{"weekday_code":"monday"}],"time_frames":[{"start_time":"07:00","end_time":"20:00"}]}]},{"schedule_type_code":"service","name":"Nourrissage des animaux","time_periods":[{"weekdays":[{"weekday_code":"monday"}],"time_frames":[{"start_time":"15:00","end_time":"15:30"}]}]}]}]}'::jsonb);
 SELECT id INTO v_period FROM public.opening_period WHERE object_id='ACTRUN9999998301';
 ASSERT (SELECT count(*) FROM public.opening_schedule WHERE period_id=v_period)=3;
 v_json:=api.build_opening_period_json(v_period,'ACTRUN9999998301',NULL,NULL,1)::jsonb;
 ASSERT jsonb_array_length(v_json->'schedules')=3,'un planning manque dans la lecture publique';
 ASSERT v_json#>>'{weekday_slots,monday,0,start}'='09:00:00';
 ASSERT jsonb_array_length(v_json#>'{weekday_slots,monday}')=1,'accueil/service mélangés avec l’ouverture';
 ASSERT EXISTS(SELECT 1 FROM jsonb_array_elements(v_json->'schedules') s WHERE s->>'name'='Nourrissage des animaux' AND s->>'schedule_type_code'='service' AND s#>>'{time_periods,0,time_frames,0,start_time}'='15:00:00');
 ASSERT EXISTS(SELECT 1 FROM jsonb_array_elements(v_json->'schedules') s WHERE s->>'name'='Accueil sur place' AND s->>'schedule_type_code'='reception');
 v_json:=api.get_object_resource('ACTRUN9999998301',ARRAY['fr'],'geojson','{}'::jsonb)::jsonb;
 ASSERT v_json::text LIKE '%Nourrissage des animaux%' AND v_json::text LIKE '%Accueil sur place%','les plannings ne sortent pas dans /objects/{id}';
 ASSERT (SELECT is_open FROM internal.compute_open_status('2026-11-02 05:30:00+00') WHERE object_id='ACTRUN9999998301'),'ouverture principale à 09:30 perdue';
 ASSERT NOT (SELECT is_open FROM internal.compute_open_status('2026-11-02 08:00:00+00') WHERE object_id='ACTRUN9999998301'),'fin de plage non exclusive';
 ASSERT NOT (SELECT is_open FROM internal.compute_open_status('2026-11-02 03:30:00+00') WHERE object_id='ACTRUN9999998301'),'accueil ouvre la fiche avant le planning principal';
 ASSERT NOT (SELECT is_open FROM internal.compute_open_status('2026-11-02 11:10:00+00') WHERE object_id='ACTRUN9999998301'),'service ouvre la fiche après fermeture principale';

 SELECT jsonb_agg(jsonb_build_object('weekday_code',code) ORDER BY position) INTO v_days FROM public.ref_code_weekday;
 -- Le principal est fermé alors que l’accueil et le service sont ouverts sans
 -- horaire fixe : le calcul courant doit rester fermé.
 v_schedules:=jsonb_build_array(
  jsonb_build_object('schedule_type_code','regular','name','Ouverture','time_periods',jsonb_build_array(jsonb_build_object('closed',true,'weekdays',v_days,'time_frames','[]'::jsonb))),
  jsonb_build_object('schedule_type_code','reception','name','Accueil','time_periods',jsonb_build_array(jsonb_build_object('weekdays',v_days,'time_frames','[]'::jsonb))),
  jsonb_build_object('schedule_type_code','service','name','Service','time_periods',jsonb_build_array(jsonb_build_object('weekdays',v_days,'time_frames','[]'::jsonb))));
 PERFORM api.save_object_openings('ACTRUN9999998301',jsonb_build_object('periods',jsonb_build_array(jsonb_build_object('all_years',true,'schedules',v_schedules))));
 ASSERT NOT api.is_object_open_now('ACTRUN9999998301'),'les plannings secondaires ouvrent la fiche maintenant';
 ASSERT NOT (SELECT is_open FROM internal.compute_open_status(now()) WHERE object_id='ACTRUN9999998301');
 -- Le mode sans horaire reste disponible dans le planning principal.
 v_schedules:=jsonb_set(v_schedules,'{0,time_periods,0,closed}','false');
 PERFORM api.save_object_openings('ACTRUN9999998301',jsonb_build_object('periods',jsonb_build_array(jsonb_build_object('all_years',true,'schedules',v_schedules))));
 ASSERT api.is_object_open_now('ACTRUN9999998301'),'ouvert sans horaire principal perdu';
 ASSERT (SELECT is_open FROM internal.compute_open_status(now()) WHERE object_id='ACTRUN9999998301');
 SELECT id INTO v_period FROM public.opening_period WHERE object_id='ACTRUN9999998301';
 ASSERT (SELECT count(*) FROM jsonb_object_keys(api.get_opening_slots_by_day(v_period)))=7;

 -- Connaître l’identifiant ne doit pas permettre une lecture anonyme du privé
 -- ou du corpus de test. Contrôle positif sur une fiche publique réelle.
 INSERT INTO public.object(id,object_type,name,status,is_test) VALUES('ACTRUN9999998302','ACT','Privé nommé','draft',false),('ACTRUN9999998303','ACT','Public nommé','published',false);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_user,'role','authenticated')::text,true);
 FOREACH v_type IN ARRAY ARRAY['ACTRUN9999998302','ACTRUN9999998303'] LOOP
  PERFORM api.save_object_openings(v_type,jsonb_build_object('periods',jsonb_build_array(jsonb_build_object('all_years',true,'schedules',v_schedules))));
 END LOOP;
 SELECT id INTO v_private FROM public.opening_period WHERE object_id='ACTRUN9999998302';
 SELECT id INTO v_public FROM public.opening_period WHERE object_id='ACTRUN9999998303';
 ASSERT v_private IS NOT NULL AND v_public IS NOT NULL;
 PERFORM set_config('request.jwt.claims','{"role":"anon"}',true);
 SET LOCAL ROLE anon;
 ASSERT api.portal_opening_schedules_json(v_period)='[]'::jsonb,'le corpus de test sort vers anon';
 ASSERT api.portal_opening_schedules_json(v_private)='[]'::jsonb,'un planning privé sort vers anon';
 ASSERT jsonb_array_length(api.portal_opening_schedules_json(v_public))=3,'contrôle positif public manquant';
 RESET ROLE;
END $test$;
ROLLBACK;
