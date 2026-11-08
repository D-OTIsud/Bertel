\set ON_ERROR_STOP on
BEGIN;
SET LOCAL plpgsql.check_asserts = on;
DO $test$
DECLARE
  v_legacy uuid := gen_random_uuid();
  v_mismatch uuid := gen_random_uuid();
  v_modern uuid := gen_random_uuid();
  v_empty uuid := gen_random_uuid();
  v_task uuid := gen_random_uuid();
  v_id uuid;
  v_denied boolean;
  v_result jsonb;
  v_logs jsonb;
  v_tasks jsonb;
BEGIN
  ASSERT has_function_privilege('service_role','api.rpc_gdpr_get_cleanup_status(uuid)','EXECUTE');
  ASSERT NOT has_function_privilege('authenticated','api.rpc_gdpr_get_cleanup_status(uuid)','EXECUTE');
  ASSERT NOT has_function_privilege('anon','api.rpc_gdpr_get_cleanup_status(uuid)','EXECUTE');
  INSERT INTO public.gdpr_erasure_log(id,subject_kind,subject_id,mode,report) VALUES
    (v_legacy,'actor',v_legacy::text,'anonymize','{"mode":"anonymize"}'),
    (v_mismatch,'actor',v_mismatch::text,'anonymize',jsonb_build_object('operationId',v_modern)),
    (v_modern,'actor',v_modern::text,'anonymize',jsonb_build_object('operationId',v_modern,'sentinel',true)),
    (v_empty,'actor',v_empty::text,'anonymize',jsonb_build_object('operationId',v_empty));
  INSERT INTO internal.gdpr_cleanup_task(id,operation_id,action,metadata)
    VALUES(v_task,v_modern,'storage_remove','{"bucket":"synthetic-no-provider","path":"status-only"}');
  SELECT jsonb_agg(to_jsonb(l) ORDER BY id) INTO v_logs FROM public.gdpr_erasure_log l
    WHERE id IN(v_legacy,v_mismatch,v_modern,v_empty);
  SELECT jsonb_agg(to_jsonb(t) ORDER BY id) INTO v_tasks FROM internal.gdpr_cleanup_task t WHERE id=v_task;

  SET LOCAL ROLE service_role;
  -- NULL retains the compatibility probe's explicit SQLSTATE P0002.
  FOREACH v_id IN ARRAY ARRAY[NULL::uuid,v_legacy,v_mismatch,gen_random_uuid()] LOOP
    v_denied := false;
    BEGIN
      PERFORM api.rpc_gdpr_get_cleanup_status(v_id);
    EXCEPTION WHEN no_data_found THEN
      v_denied := true;
    END;
    ASSERT v_denied, 'A missing matching durable report must not become a completed operation';
  END LOOP;
  v_result := api.rpc_gdpr_get_cleanup_status(v_modern);
  ASSERT v_result->'operationId'=to_jsonb(v_modern) AND v_result->'report'->'operationId'=to_jsonb(v_modern);
  ASSERT v_result->'report'->'sentinel'='true'::jsonb;
  ASSERT jsonb_array_length(v_result->'tasks')=1;
  ASSERT v_result->'tasks'->0->'id'=to_jsonb(v_task);
  ASSERT v_result->'tasks'->0->>'status'='pending';
  ASSERT v_result->'tasks'->0->'attempts'='0'::jsonb;
  ASSERT v_result->'tasks'->0->'lastError'='null'::jsonb;
  v_result := api.rpc_gdpr_get_cleanup_status(v_empty);
  ASSERT v_result->'operationId'=to_jsonb(v_empty) AND v_result->'tasks'='[]'::jsonb;
  RESET ROLE;

  ASSERT (SELECT jsonb_agg(to_jsonb(l) ORDER BY id)=v_logs FROM public.gdpr_erasure_log l
    WHERE id IN(v_legacy,v_mismatch,v_modern,v_empty));
  ASSERT (SELECT jsonb_agg(to_jsonb(t) ORDER BY id)=v_tasks FROM internal.gdpr_cleanup_task t WHERE id=v_task);
END;
$test$;
ROLLBACK;
