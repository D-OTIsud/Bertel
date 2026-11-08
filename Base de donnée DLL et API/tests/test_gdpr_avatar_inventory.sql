-- Synthetic metadata only. No Storage bytes/API. Everything is rolled back.
BEGIN;
SET LOCAL search_path = pg_catalog, pg_temp;
SET LOCAL plpgsql.check_asserts = on;
DO $test$
DECLARE
  u uuid := '00000000-0000-4000-8000-000000000101';
  other_u uuid := '00000000-0000-4000-8000-000000000102';
  op uuid := '00000000-0000-4000-8000-000000000201';
  g1 text := 'avatar-00000000-0000-4000-8000-000000000301.jpg';
  g2 text := 'avatar-00000000-0000-4000-8000-000000000302.jpg';
  n integer;
BEGIN
  ASSERT api.avatar_upload_allowed(u);
  ASSERT NOT api.avatar_upload_allowed(NULL);
  INSERT INTO storage.buckets(id,name,public) VALUES ('avatars','avatars',true),('avatar-fixture-other','avatar-fixture-other',false)
    ON CONFLICT(id) DO NOTHING;
  INSERT INTO public.gdpr_erasure_log(id,subject_kind,subject_id,mode,report)
  VALUES(op,'user',upper(u::text),'anonymize',jsonb_build_object('operationId',op));
  -- g2 is an orphan: no profile/ref row refers to it, modelling a lost profile ACK.
  INSERT INTO storage.objects(bucket_id,name) VALUES
    ('avatars',u::text||'/avatar.jpg'),('avatars',u::text||'/'||g1),('avatars',u::text||'/'||g2),
    ('avatars',other_u::text||'/'||g1),('avatars',u::text||'/nested/'||g1),
    ('avatars',u::text||'/arbitrary.jpg'),('avatar-fixture-other',u::text||'/'||g1);
  INSERT INTO storage.objects(bucket_id,name,archived_at) VALUES ('avatars',u::text||'/avatar-00000000-0000-4000-8000-000000000303.jpg',now());
  INSERT INTO storage.objects(bucket_id,name,is_delete_marker) VALUES ('avatars',u::text||'/avatar-00000000-0000-4000-8000-000000000304.jpg',true);
  -- Existing historical canonical task must not be duplicated.
  INSERT INTO internal.gdpr_cleanup_task(operation_id,action,metadata)
  VALUES(op,'storage_remove',jsonb_build_object('bucket','avatars','path',u::text||'/avatar.jpg'));
  n := internal.gdpr_enqueue_avatar_inventory(op,u);
  ASSERT n=2, 'only two unrecorded live generations are queued';
  ASSERT internal.gdpr_enqueue_avatar_inventory(op,u)=0, 'same operation is deduplicated';
  ASSERT (SELECT count(*)=3 FROM internal.gdpr_cleanup_task WHERE operation_id=op);
  ASSERT (SELECT count(*)=2 FROM internal.gdpr_cleanup_task WHERE operation_id=op AND metadata ? 'storage_object_id');
  ASSERT (SELECT bool_and(metadata->>'path' IN(u::text||'/avatar.jpg',u::text||'/'||g1,u::text||'/'||g2)) FROM internal.gdpr_cleanup_task WHERE operation_id=op);
  BEGIN
    PERFORM internal.gdpr_enqueue_avatar_inventory(op,other_u);
    RAISE EXCEPTION 'different subject was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  ASSERT NOT api.avatar_upload_allowed(u), 'pending task blocks a new request';
  ASSERT api.avatar_upload_allowed(other_u), 'unrelated user remains allowed';
  UPDATE internal.gdpr_cleanup_task SET status='failed' WHERE operation_id=op;
  ASSERT NOT api.avatar_upload_allowed(u), 'failed cleanup still blocks';
  UPDATE internal.gdpr_cleanup_task SET status='succeeded' WHERE operation_id=op;
  ASSERT api.avatar_upload_allowed(u), 'completed cleanup allows a fresh generation';
  ASSERT NOT has_function_privilege('authenticated','api.avatar_upload_allowed(uuid)','EXECUTE');
  ASSERT NOT has_function_privilege('anon','api.avatar_upload_allowed(uuid)','EXECUTE');
  ASSERT has_function_privilege('service_role','api.avatar_upload_allowed(uuid)','EXECUTE');
  ASSERT NOT has_function_privilege('service_role','internal.gdpr_enqueue_avatar_inventory(uuid,uuid)','EXECUTE');
  ASSERT NOT has_function_privilege('authenticated','internal.gdpr_enqueue_avatar_inventory(uuid,uuid)','EXECUTE');
END;
$test$;
ROLLBACK;
