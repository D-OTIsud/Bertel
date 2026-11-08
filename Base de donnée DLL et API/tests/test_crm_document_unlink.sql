\set ON_ERROR_STOP on
BEGIN;
SET LOCAL plpgsql.check_asserts = on;
\ir fixtures/object_current_rights.sql

DO $test$
DECLARE
  v_writer uuid := '00000000-0000-4000-a000-00000000ae11';
  v_other uuid := '00000000-0000-4000-a000-00000000ae12';
  v_admin uuid := '00000000-0000-4000-a000-00000000ae15';
  v_actor uuid := '00000000-0000-4000-a000-00000000aa01';
  v_other_actor uuid := '00000000-0000-4000-a000-00000000aa02';
  v_test_actor uuid := '00000000-0000-4000-a000-00000000aa03';
  v_task uuid := gen_random_uuid();
  v_other_task uuid := gen_random_uuid();
  v_test_task uuid := gen_random_uuid();
  v_shared uuid := gen_random_uuid();
  v_foreign uuid := gen_random_uuid();
  v_wrong_bucket uuid := gen_random_uuid();
  v_empty_path uuid := gen_random_uuid();
  v_promoted uuid := gen_random_uuid();
  v_portal uuid := gen_random_uuid();
  v_portal_path uuid := gen_random_uuid();
  v_test_doc uuid := gen_random_uuid();
  v_claims text := jsonb_build_object('sub',v_writer,'role','authenticated')::text;
  v_snapshot jsonb;
  v_permission uuid;
  v_function regprocedure;
BEGIN
  FOREACH v_function IN ARRAY ARRAY[
    'api.unlink_crm_actor_document(uuid,uuid)'::regprocedure,
    'api.unlink_crm_task_document(uuid,uuid)'::regprocedure
  ] LOOP
    ASSERT has_function_privilege('authenticated',v_function,'EXECUTE');
    ASSERT NOT has_function_privilege('anon',v_function,'EXECUTE');
    ASSERT NOT has_function_privilege('service_role',v_function,'EXECUTE');
    ASSERT NOT EXISTS (SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a
      WHERE p.oid=v_function AND a.grantee=0 AND a.privilege_type='EXECUTE');
  END LOOP;

  PERFORM pg_temp.setup_current_rights_fixture();
  SELECT id INTO STRICT v_permission FROM public.ref_permission WHERE code='write_crm_notes';
  INSERT INTO public.user_permission(user_id,permission_id,is_active,granted_by)
    VALUES(v_writer,v_permission,true,v_admin),(v_other,v_permission,true,v_admin);
  INSERT INTO public.crm_task(id,object_id,title) VALUES
    (v_task,'HOTRUN999999AR01','Synthetic task A'),(v_other_task,'HOTRUN999999AR02','Synthetic task B'),
    (v_test_task,'HOTRUN999999AR05','Synthetic test task');
  INSERT INTO public.ref_document(id,url,storage_bucket,storage_path,access_scope,extra) VALUES
    (v_shared,'storage://actor-documents/unlink/shared.pdf','actor-documents','unlink/shared.pdf','crm_private','{"sentinel":true}'),
    (v_foreign,'storage://actor-documents/unlink/foreign.pdf','actor-documents','unlink/foreign.pdf','crm_private','{}'),
    (v_wrong_bucket,'https://example.invalid/unlink/wrong.pdf','documents','unlink/wrong.pdf','public','{}'),
    (v_empty_path,'https://example.invalid/unlink/empty.pdf','documents','','public','{}'),
    (v_promoted,'https://example.invalid/unlink/promoted.pdf','documents','unlink/promoted.pdf','public','{}'),
    (v_portal,'storage://actor-documents/unlink/portal.jpg','actor-documents','unlink/portal.jpg','crm_private','{"source":"portal_photo"}'),
    (v_portal_path,'storage://actor-documents/portal-photos/unlink/portal.jpg','actor-documents','portal-photos/unlink/portal.jpg','crm_private','{}'),
    (v_test_doc,'storage://actor-documents/unlink/test.pdf','actor-documents','unlink/test.pdf','crm_private','{}');
  SELECT to_jsonb(d) INTO STRICT v_snapshot FROM public.ref_document d WHERE d.id=v_shared;
  INSERT INTO public.actor_document(actor_id,document_id) VALUES
    (v_actor,v_shared),(v_other_actor,v_shared),(v_other_actor,v_foreign),(v_actor,v_wrong_bucket),
    (v_actor,v_portal),(v_actor,v_portal_path),(v_test_actor,v_test_doc);
  INSERT INTO public.actor_document(actor_id,document_id,status,promoted_to_object_id,promoted_document_id,promoted_at)
    VALUES(v_actor,v_promoted,'promoted','HOTRUN999999AR01',v_promoted,now());
  INSERT INTO public.crm_task_document(task_id,document_id,title) VALUES
    (v_task,v_shared,'Shared'),(v_other_task,v_shared,'Shared elsewhere'),(v_other_task,v_foreign,'Foreign'),
    (v_task,v_wrong_bucket,'Wrong bucket'),(v_task,v_empty_path,'Empty path'),(v_task,v_portal,'Separate task link'),
    (v_test_task,v_test_doc,'Sandbox witness');
  INSERT INTO public.actor_consent(actor_id,channel,consent_given,document_id)
    VALUES(v_other_actor,'email',true,v_shared);

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_other,'role','authenticated')::text,true);
  SET LOCAL ROLE authenticated;
  ASSERT api.user_has_permission('write_crm_notes');
  ASSERT api.unlink_crm_actor_document(v_actor,v_shared)='forbidden';
  ASSERT api.unlink_crm_task_document(v_task,v_shared)='forbidden';
  PERFORM set_config('request.jwt.claims','{"role":"authenticated"}',true);
  ASSERT api.unlink_crm_actor_document(v_actor,v_shared)='forbidden';
  ASSERT api.unlink_crm_task_document(v_task,v_shared)='forbidden';
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_admin,'role','authenticated',
    'app_metadata',jsonb_build_object('sandbox_discovery',true))::text,true);
  ASSERT api.user_can_write_crm_actor(v_test_actor) AND api.user_can_write_crm_task(v_test_task);
  ASSERT api.unlink_crm_actor_document(v_test_actor,v_test_doc)='forbidden';
  ASSERT api.unlink_crm_task_document(v_test_task,v_test_doc)='forbidden';
  RESET ROLE;

  -- A current marker and the registry independently defeat an older claim.
  UPDATE auth.users SET raw_app_meta_data='{"sandbox_discovery":true}' WHERE id=v_writer;
  PERFORM set_config('request.jwt.claims',v_claims,true);
  SET LOCAL ROLE authenticated;
  ASSERT api.user_can_write_crm_actor(v_actor) AND api.user_can_write_crm_task(v_task);
  ASSERT api.unlink_crm_actor_document(v_actor,v_shared)='forbidden';
  ASSERT api.unlink_crm_task_document(v_task,v_shared)='forbidden';
  RESET ROLE;
  UPDATE auth.users SET raw_app_meta_data='{}' WHERE id=v_writer;
  INSERT INTO internal.sandbox_discovery_identity(singleton,user_id) VALUES(true,v_writer)
    ON CONFLICT(singleton) DO UPDATE SET user_id=EXCLUDED.user_id;
  SET LOCAL ROLE authenticated;
  ASSERT api.unlink_crm_actor_document(v_actor,v_shared)='forbidden';
  ASSERT api.unlink_crm_task_document(v_task,v_shared)='forbidden';
  RESET ROLE;
  DELETE FROM internal.sandbox_discovery_identity WHERE user_id=v_writer;

  -- A local table cannot redirect the CRM gate to a different object.
  CREATE TEMP TABLE crm_task (id uuid, object_id text) ON COMMIT DROP;
  INSERT INTO pg_temp.crm_task VALUES(v_other_task,'HOTRUN999999AR01');
  SET LOCAL ROLE authenticated;
  ASSERT api.user_can_write_crm_task(v_task);
  ASSERT NOT api.user_can_write_crm_task(v_other_task);
  ASSERT api.unlink_crm_task_document(v_other_task,v_shared)='forbidden';
  RESET ROLE;
  DROP TABLE pg_temp.crm_task;

  -- A user-editable claim is not the sandbox identity. Both real CRM gates remain authoritative.
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_writer,'role','authenticated',
    'user_metadata',jsonb_build_object('sandbox_discovery',true))::text,true);
  SET LOCAL ROLE authenticated;
  ASSERT api.unlink_crm_actor_document(v_actor,v_foreign)='not_found';
  ASSERT api.unlink_crm_task_document(v_task,v_foreign)='not_found';
  ASSERT api.unlink_crm_actor_document(v_actor,v_wrong_bucket)='unexpected_bucket';
  ASSERT api.unlink_crm_task_document(v_task,v_wrong_bucket)='unexpected_bucket';
  ASSERT api.unlink_crm_actor_document(v_actor,v_promoted)='promoted_document';
  ASSERT api.unlink_crm_actor_document(v_actor,v_portal)='portal_photo';
  ASSERT api.unlink_crm_actor_document(v_actor,v_portal_path)='portal_photo';
  ASSERT api.unlink_crm_task_document(v_task,v_portal)='deleted';
  ASSERT api.unlink_crm_task_document(v_task,v_empty_path)='deleted';
  ASSERT api.unlink_crm_actor_document(v_actor,v_shared)='deleted';
  ASSERT api.unlink_crm_actor_document(v_actor,v_shared)='not_found';
  ASSERT api.unlink_crm_task_document(v_task,v_shared)='deleted';
  ASSERT api.unlink_crm_task_document(v_task,v_shared)='not_found';
  RESET ROLE;

  ASSERT (SELECT to_jsonb(d)=v_snapshot FROM public.ref_document d WHERE d.id=v_shared);
  ASSERT EXISTS (SELECT 1 FROM public.actor_document WHERE actor_id=v_other_actor AND document_id=v_shared);
  ASSERT EXISTS (SELECT 1 FROM public.crm_task_document WHERE task_id=v_other_task AND document_id=v_shared);
  ASSERT EXISTS (SELECT 1 FROM public.actor_consent WHERE actor_id=v_other_actor AND document_id=v_shared);
  ASSERT (SELECT count(*) FROM public.ref_document WHERE id IN
    (v_shared,v_foreign,v_wrong_bucket,v_empty_path,v_promoted,v_portal,v_portal_path,v_test_doc))=8;
  ASSERT EXISTS (SELECT 1 FROM public.actor_document WHERE actor_id=v_actor AND document_id=v_portal);
  ASSERT EXISTS (SELECT 1 FROM public.actor_document WHERE actor_id=v_actor AND document_id=v_portal_path);
  ASSERT EXISTS (SELECT 1 FROM public.actor_document WHERE actor_id=v_actor AND document_id=v_promoted AND status='promoted');
  ASSERT EXISTS (SELECT 1 FROM public.actor_document WHERE actor_id=v_test_actor AND document_id=v_test_doc);
  ASSERT EXISTS (SELECT 1 FROM public.crm_task_document WHERE task_id=v_test_task AND document_id=v_test_doc);
END;
$test$;
ROLLBACK;
