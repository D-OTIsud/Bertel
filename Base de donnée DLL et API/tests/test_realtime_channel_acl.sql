-- Disposable fresh stack. Exercise SELECT/INSERT under the same role and
-- topic context as the Realtime authorization probe. All fixture rows roll back.
\set ON_ERROR_STOP on
BEGIN;
\ir fixtures/object_current_rights.sql

CREATE FUNCTION pg_temp.expect_realtime_acl(
  p_uid uuid, p_topic text, p_expected boolean[], p_anon boolean DEFAULT false,
  p_context_topic text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql AS $test$
DECLARE
  actor_role text := CASE WHEN p_anon THEN 'anon' ELSE 'authenticated' END;
  extension_name text;
  can_read boolean;
  can_write boolean;
  observed boolean[] := ARRAY[]::boolean[];
BEGIN
  -- Include editable metadata and leave out app metadata to simulate the same
  -- already-issued claims before and after an authoritative Auth change.
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', actor_role,
    'user_metadata', COALESCE((SELECT raw_user_meta_data FROM auth.users WHERE id = p_uid), '{}'::jsonb))::text, true);
  PERFORM set_config('request.jwt.claim.sub', COALESCE(p_uid::text, ''), true);
  PERFORM set_config('request.jwt.claim.role', actor_role, true);
  PERFORM set_config('realtime.topic', COALESCE(p_context_topic, p_topic), true);
  IF p_anon THEN SET LOCAL ROLE anon; ELSE SET LOCAL ROLE authenticated; END IF;

  FOREACH extension_name IN ARRAY ARRAY['presence', 'broadcast'] LOOP
    BEGIN
      SELECT EXISTS (
        SELECT 1 FROM realtime.messages
        WHERE topic = p_topic AND extension = extension_name
          AND event = 'bertel-synthetic-acl-read'
      ) INTO can_read;
    EXCEPTION WHEN insufficient_privilege THEN can_read := false;
    END;
    BEGIN
      INSERT INTO realtime.messages(topic, extension) VALUES (p_topic, extension_name);
      can_write := true;
    EXCEPTION WHEN insufficient_privilege THEN can_write := false;
    END;
    observed := observed || ARRAY[can_read, can_write];
  END LOOP;
  RESET ROLE;
  ASSERT observed = p_expected, format('Realtime ACL mismatch for %s (%s): expected %s, got %s',
    p_topic, actor_role, p_expected, observed);
END;
$test$;

DO $matrix$
DECLARE
  writer_id constant uuid := '00000000-0000-4000-a000-00000000ae11';
  other_id constant uuid := '00000000-0000-4000-a000-00000000ae12';
  partner_id constant uuid := '00000000-0000-4000-a000-00000000ae13';
  admin_id constant uuid := '00000000-0000-4000-a000-00000000ae15';
  tester_id constant uuid := '00000000-0000-4000-a000-00000000ae16';
  other_membership constant uuid := '00000000-0000-4000-a000-00000000ab12';
  test_membership constant uuid := '00000000-0000-4000-a000-00000000ab16';
  room_a constant text := 'room:HOTRUN999999AR01';
  published_room constant text := 'room:HOTRUN999999AR03';
  test_room constant text := 'room:HOTRUN999999AR05';
  denied constant boolean[] := ARRAY[false, false, false, false];
  -- Presence read/write and broadcast read. v2.78.10 requires broadcast read
  -- to join a private presence topic. There is no client broadcast writer.
  receive constant boolean[] := ARRAY[true, true, true, false];
  write_all constant boolean[] := ARRAY[true, true, true, true];
  topics constant text[] := ARRAY['presence:global:prod','presence:global:test','crm:tasks:prod','crm:tasks:test',
    'presence:global','crm:tasks','room:bad',room_a,published_room,test_room];
BEGIN
  PERFORM pg_temp.setup_current_rights_fixture();
  INSERT INTO auth.users(id,email,raw_user_meta_data)
    VALUES(tester_id,'current-rights-realtime-test@example.invalid','{"sandbox_discovery":true}');
  INSERT INTO public.app_user_profile(id,role) VALUES(tester_id,'tourism_agent')
    ON CONFLICT(id) DO UPDATE SET role=EXCLUDED.role;
  INSERT INTO public.user_org_membership(id,user_id,org_object_id,is_active) VALUES
    (other_membership,other_id,'ORGRUN999999AR02',true),
    (test_membership,tester_id,'ORGRUN999999AR03',true);
  INSERT INTO public.user_org_business_role(membership_id,role_id,is_active)
    SELECT test_membership,id,true FROM public.ref_org_business_role WHERE code='editor';
  INSERT INTO public.org_role_permission(org_object_id,role_id,permission_id,is_active,granted_by)
    SELECT 'ORGRUN999999AR03',r.id,p.id,true,admin_id
    FROM public.ref_org_business_role r CROSS JOIN public.ref_permission p
    WHERE r.code='editor' AND p.code='edit_canonical_when_publisher'
    ON CONFLICT ON CONSTRAINT org_role_permission_uniq DO UPDATE SET is_active=true;

  INSERT INTO realtime.messages(topic,extension,event)
    SELECT t,e,'bertel-synthetic-acl-read'
    FROM unnest(topics) AS t CROSS JOIN unnest(ARRAY['presence','broadcast']) AS e;
  ASSERT (SELECT count(*) FROM realtime.messages WHERE event='bertel-synthetic-acl-read') = 2 * cardinality(topics);

  PERFORM pg_temp.expect_realtime_acl(writer_id,'presence:global:prod',receive);
  PERFORM pg_temp.expect_realtime_acl(other_id,'presence:global:prod',receive); -- second production ORG
  PERFORM pg_temp.expect_realtime_acl(writer_id,'presence:global:test',denied);
  PERFORM pg_temp.expect_realtime_acl(tester_id,'presence:global:test',receive);
  PERFORM pg_temp.expect_realtime_acl(tester_id,'presence:global:prod',denied);
  PERFORM pg_temp.expect_realtime_acl(partner_id,'presence:global:prod',denied);
  PERFORM pg_temp.expect_realtime_acl(NULL,'presence:global:prod',denied,true);
  PERFORM pg_temp.expect_realtime_acl(NULL,'presence:global:prod',denied);

  PERFORM pg_temp.expect_realtime_acl(writer_id,'crm:tasks:prod',receive);
  PERFORM pg_temp.expect_realtime_acl(other_id,'crm:tasks:prod',denied);
  PERFORM pg_temp.expect_realtime_acl(admin_id,'crm:tasks:prod',receive);
  PERFORM pg_temp.expect_realtime_acl(partner_id,'crm:tasks:prod',denied);
  PERFORM pg_temp.expect_realtime_acl(tester_id,'crm:tasks:test',receive);
  PERFORM pg_temp.expect_realtime_acl(tester_id,'crm:tasks:prod',denied);
  PERFORM pg_temp.expect_realtime_acl(writer_id,'crm:tasks:test',denied);

  PERFORM pg_temp.expect_realtime_acl(writer_id,room_a,write_all);
  PERFORM pg_temp.expect_realtime_acl(other_id,room_a,denied);
  PERFORM pg_temp.expect_realtime_acl(other_id,published_room,receive);
  PERFORM pg_temp.expect_realtime_acl(partner_id,published_room,denied);
  SET LOCAL ROLE authenticated;
  ASSERT EXISTS (SELECT 1 FROM public.object WHERE id='HOTRUN999999AR03'), 'partner still reads the published fixture';
  RESET ROLE;
  PERFORM pg_temp.expect_realtime_acl(tester_id,test_room,write_all);
  PERFORM pg_temp.expect_realtime_acl(tester_id,room_a,denied);
  PERFORM pg_temp.expect_realtime_acl(writer_id,test_room,denied);
  PERFORM pg_temp.expect_realtime_acl(NULL,published_room,denied,true);
  PERFORM pg_temp.expect_realtime_acl(writer_id,'room:bad',denied);
  PERFORM pg_temp.expect_realtime_acl(writer_id,room_a,denied,false,published_room);
  PERFORM pg_temp.expect_realtime_acl(writer_id,'presence:global',denied);
  PERFORM pg_temp.expect_realtime_acl(writer_id,'crm:tasks',denied);

  -- The named tester above joined all three test topics even with an editable
  -- discovery marker. Only the stored server marker changes here.
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  PERFORM set_config('request.jwt.claim.sub','',true);
  UPDATE auth.users SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || '{"sandbox_discovery":true}'::jsonb
    WHERE id=tester_id;
  ASSERT FOUND, 'fixture Auth provenance must have been updated';
  PERFORM pg_temp.expect_realtime_acl(tester_id,'presence:global:test',denied);
  PERFORM pg_temp.expect_realtime_acl(tester_id,'crm:tasks:test',denied);
  PERFORM pg_temp.expect_realtime_acl(tester_id,test_room,denied);
  SET LOCAL ROLE authenticated;
  ASSERT api.current_user_test_realm() IS TRUE AND api.current_user_can_edit_objects() IS TRUE;
  ASSERT EXISTS (SELECT 1 FROM public.object WHERE id='HOTRUN999999AR05'), 'discovery fixture retains test-object read';
  ASSERT api.user_can_write_object_canonical('HOTRUN999999AR05') IS TRUE;
  RESET ROLE;

  -- A legal-only publisher member can read this draft and track Presence. Its
  -- specialist permission remains insufficient to send a room broadcast.
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  PERFORM set_config('request.jwt.claim.sub','',true);
  UPDATE public.user_org_membership SET org_object_id='ORGRUN999999AR01' WHERE id=other_membership;
  INSERT INTO public.user_permission(user_id,permission_id,is_active,granted_by)
    SELECT other_id,id,true,admin_id FROM public.ref_permission WHERE code='manage_legal_compliance';
  UPDATE public.app_user_profile SET role='owner' WHERE id=admin_id;
  PERFORM pg_temp.expect_realtime_acl(admin_id,'presence:global:prod',receive);
  PERFORM pg_temp.expect_realtime_acl(admin_id,'crm:tasks:prod',denied);
  PERFORM pg_temp.expect_realtime_acl(other_id,room_a,receive);
  ASSERT api.user_can_manage_object_legal('HOTRUN999999AR01') IS TRUE;
  ASSERT api.user_can_write_object_canonical('HOTRUN999999AR01') IS FALSE;

  -- A tourism profile with an individual permission and an inactive membership
  -- still passes the broad edit probe and can read a published object.
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  PERFORM set_config('request.jwt.claim.sub','',true);
  UPDATE public.user_org_membership SET is_active=false WHERE id=other_membership;
  ASSERT FOUND, 'fixture membership must have been deactivated';
  INSERT INTO public.user_permission(user_id,permission_id,is_active,granted_by)
    SELECT other_id,id,true,admin_id FROM public.ref_permission WHERE code='create_object';
  PERFORM pg_temp.expect_realtime_acl(other_id,'presence:global:prod',denied);
  PERFORM pg_temp.expect_realtime_acl(other_id,'crm:tasks:prod',denied);
  PERFORM pg_temp.expect_realtime_acl(other_id,published_room,denied);
  SET LOCAL ROLE authenticated;
  ASSERT api.current_user_org_id() IS NULL AND api.current_user_can_edit_objects() IS TRUE;
  ASSERT EXISTS (SELECT 1 FROM public.object WHERE id='HOTRUN999999AR03'), 'unaffiliated account still reads published data';
  RESET ROLE;

  -- Simulate profile removal while the previous authenticated claims still
  -- exist. Published data remains readable and private Realtime is refused.
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  PERFORM set_config('request.jwt.claim.sub','',true);
  DELETE FROM public.app_user_profile WHERE id=other_id;
  ASSERT FOUND, 'fixture profile must have been removed';
  PERFORM pg_temp.expect_realtime_acl(other_id,published_room,denied);
  PERFORM pg_temp.expect_realtime_acl(other_id,'presence:global:prod',denied);
  SET LOCAL ROLE authenticated;
  ASSERT EXISTS (SELECT 1 FROM public.object WHERE id='HOTRUN999999AR03'), 'published data remains readable after profile removal';
  RESET ROLE;
END;
$matrix$;

ROLLBACK;
