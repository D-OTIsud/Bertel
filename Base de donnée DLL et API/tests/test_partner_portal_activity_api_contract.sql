-- R1 actual SQL test. Requires the shared disposable fixtures, before or after R3a.
\set ON_ERROR_STOP on
DO $$ BEGIN
 IF current_setting('bertel.ephemeral_ci',true) IS DISTINCT FROM 'on' THEN
  RAISE EXCEPTION 'Disposable Supabase required: bertel.ephemeral_ci=on';
 END IF;
END $$;
BEGIN;
DO $test$
DECLARE f text; r jsonb; row_before jsonb; rejected boolean:=false;
BEGIN
 ASSERT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public'
   AND table_name='object_act' AND column_name='equipment_provided_details'
   AND data_type='text' AND is_nullable='YES');
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 FOREACH f IN ARRAY ARRAY['ACTRUN999999B101','ASCRUN999999B103'] LOOP
  SELECT to_jsonb(a)-'equipment_provided_details' INTO row_before FROM public.object_act a WHERE object_id=f;
  UPDATE public.object_act SET equipment_provided=true,equipment_provided_details='Helmet and harness' WHERE object_id=f;
  ASSERT (SELECT equipment_provided_details='Helmet and harness' FROM public.object_act WHERE object_id=f), 'Office detail not persisted';
  r:=api.get_object_resource(f)::jsonb;
  ASSERT r ? 'activity' AND NOT (r->'activity' ? 'equipment_provided_details'),'R1 new key must be ABSENT, not JSON null';
  ASSERT (r->'activity'->>'duration_min')=row_before->>'duration_min','R1 changed an existing scalar';
 END LOOP;
 BEGIN
  UPDATE public.object_act SET equipment_provided=false WHERE object_id='ACTRUN999999B101';
 EXCEPTION WHEN check_violation THEN rejected:=true;
 END;
 ASSERT rejected,'Text without provided equipment must fail the real CHECK';
 FOREACH f IN ARRAY ARRAY['ACTRUN999999B102','ASCRUN999999B104'] LOOP
  ASSERT NOT (api.get_object_resource(f)::jsonb ? 'activity'),'Absent activity row became an activity/null block';
 END LOOP;
END;
$test$;
ROLLBACK;
