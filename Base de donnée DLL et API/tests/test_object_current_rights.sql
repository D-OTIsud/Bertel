-- Current authorization contracts; synthetic witnesses and grants are rolled back.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout='90s';
SET LOCAL lock_timeout='5s';
\ir fixtures/object_current_rights.sql
DO $current_rights$
DECLARE
  f jsonb:=pg_temp.setup_current_rights_fixture(); v_cases jsonb; c jsonb; v_sql text; v_rows integer; v_denied boolean;
  v_writer_claims text:='{"sub":"00000000-0000-4000-a000-00000000ae11","role":"authenticated","email":"current-rights-writer@example.invalid","app_metadata":{"role":"super_admin"}}';
  v_portal_claims text:='{"sub":"00000000-0000-4000-a000-00000000ae13","role":"authenticated","email":"current-rights-portal@example.invalid"}';
  v_admin_claims text:='{"sub":"00000000-0000-4000-a000-00000000ae15","role":"authenticated","app_metadata":{"role":"super_admin"}}';
BEGIN
  v_cases:=jsonb_build_array(
    jsonb_build_object('table','object_room_type',
      'ins','INSERT INTO public.object_room_type(id,object_id,code,name) VALUES(''00000000-0000-4000-a000-00000000ac02'',''HOTRUN999999AR01'',''CURRENT-CANDIDATE'',''Synthetic candidate room'')',
      'upd','UPDATE public.object_room_type SET name=name WHERE id=''00000000-0000-4000-a000-00000000ac02''',
      'del','DELETE FROM public.object_room_type WHERE id=''00000000-0000-4000-a000-00000000ac02''',
      'denied_upd','UPDATE public.object_room_type SET name=''Forbidden stale writer'' WHERE id=''00000000-0000-4000-a000-00000000ac01''',
      'denied_del','DELETE FROM public.object_room_type WHERE id=''00000000-0000-4000-a000-00000000ac01'''),
    jsonb_build_object('table','object_room_type_amenity',
      'ins',format('INSERT INTO public.object_room_type_amenity(room_type_id,amenity_id) VALUES(''00000000-0000-4000-a000-00000000ac01'',%L)',f->>'amenity2'),
      'upd',format('UPDATE public.object_room_type_amenity SET created_at=created_at WHERE room_type_id=''00000000-0000-4000-a000-00000000ac01'' AND amenity_id=%L',f->>'amenity2'),
      'del',format('DELETE FROM public.object_room_type_amenity WHERE room_type_id=''00000000-0000-4000-a000-00000000ac01'' AND amenity_id=%L',f->>'amenity2'),
      'denied_upd',format('UPDATE public.object_room_type_amenity SET created_at=now() WHERE room_type_id=''00000000-0000-4000-a000-00000000ac01'' AND amenity_id=%L',f->>'amenity1'),
      'denied_del',format('DELETE FROM public.object_room_type_amenity WHERE room_type_id=''00000000-0000-4000-a000-00000000ac01'' AND amenity_id=%L',f->>'amenity1')),
    jsonb_build_object('table','object_room_type_bed',
      'ins',format('INSERT INTO public.object_room_type_bed(room_type_id,bed_type_id,quantity) VALUES(''00000000-0000-4000-a000-00000000ac01'',%L,1)',f->>'bed2'),
      'upd',format('UPDATE public.object_room_type_bed SET quantity=2 WHERE room_type_id=''00000000-0000-4000-a000-00000000ac01'' AND bed_type_id=%L',f->>'bed2'),
      'del',format('DELETE FROM public.object_room_type_bed WHERE room_type_id=''00000000-0000-4000-a000-00000000ac01'' AND bed_type_id=%L',f->>'bed2'),
      'denied_upd',format('UPDATE public.object_room_type_bed SET quantity=99 WHERE room_type_id=''00000000-0000-4000-a000-00000000ac01'' AND bed_type_id=%L',f->>'bed1'),
      'denied_del',format('DELETE FROM public.object_room_type_bed WHERE room_type_id=''00000000-0000-4000-a000-00000000ac01'' AND bed_type_id=%L',f->>'bed1')),
    jsonb_build_object('table','object_room_type_media',
      'ins','INSERT INTO public.object_room_type_media(room_type_id,media_id) VALUES(''00000000-0000-4000-a000-00000000ac01'',''00000000-0000-4000-a000-00000000ad02'')',
      'upd','UPDATE public.object_room_type_media SET position=1 WHERE room_type_id=''00000000-0000-4000-a000-00000000ac01'' AND media_id=''00000000-0000-4000-a000-00000000ad02''',
      'del','DELETE FROM public.object_room_type_media WHERE room_type_id=''00000000-0000-4000-a000-00000000ac01'' AND media_id=''00000000-0000-4000-a000-00000000ad02''',
      'denied_upd','UPDATE public.object_room_type_media SET position=99 WHERE room_type_id=''00000000-0000-4000-a000-00000000ac01'' AND media_id=''00000000-0000-4000-a000-00000000ad01''',
      'denied_del','DELETE FROM public.object_room_type_media WHERE room_type_id=''00000000-0000-4000-a000-00000000ac01'' AND media_id=''00000000-0000-4000-a000-00000000ad01'''),
    jsonb_build_object('table','media_tag',
      'ins',format('INSERT INTO public.media_tag(media_id,tag_id) VALUES(''00000000-0000-4000-a000-00000000ad01'',%L)',f->>'tag2'),
      'upd',format('UPDATE public.media_tag SET created_at=created_at WHERE media_id=''00000000-0000-4000-a000-00000000ad01'' AND tag_id=%L',f->>'tag2'),
      'del',format('DELETE FROM public.media_tag WHERE media_id=''00000000-0000-4000-a000-00000000ad01'' AND tag_id=%L',f->>'tag2'),
      'denied_upd',format('UPDATE public.media_tag SET created_at=now() WHERE media_id=''00000000-0000-4000-a000-00000000ad01'' AND tag_id=%L',f->>'tag1'),
      'denied_del',format('DELETE FROM public.media_tag WHERE media_id=''00000000-0000-4000-a000-00000000ad01'' AND tag_id=%L',f->>'tag1')));

  -- A current editor can write even though the legacy owner helper grants no personal authority.
  PERFORM set_config('request.jwt.claims',v_writer_claims,true); SET LOCAL ROLE authenticated;
  ASSERT api.is_platform_superuser() IS FALSE, 'Old JWT app metadata must not supply platform authority';
  ASSERT api.is_object_owner('HOTRUN999999AR01') IS FALSE, 'A contact email was treated as personal object ownership';
  ASSERT api.user_can_write_object_canonical('HOTRUN999999AR01') IS TRUE;
  ASSERT api.user_can_publish_object('HOTRUN999999AR01') IS TRUE;
  ASSERT EXISTS(SELECT 1 FROM public.object WHERE id='HOTRUN999999AR01');
  ASSERT NOT EXISTS(SELECT 1 FROM public.object WHERE id='HOTRUN999999AR02'), 'Historical creator or legacy email-to-ORG bridge leaked another ORG';
  UPDATE public.object SET name='Current explicit edit' WHERE id='HOTRUN999999AR01'; GET DIAGNOSTICS v_rows=ROW_COUNT; ASSERT v_rows=1;
  PERFORM internal.workspace_assert_can_write_object('HOTRUN999999AR01');
  FOR c IN SELECT value FROM jsonb_array_elements(v_cases) LOOP
    FOREACH v_sql IN ARRAY ARRAY[c->>'ins',c->>'upd',c->>'del'] LOOP
      EXECUTE v_sql; GET DIAGNOSTICS v_rows=ROW_COUNT; ASSERT v_rows=1, format('Positive current %s writer was vacant',c->>'table');
    END LOOP;
  END LOOP;
  DELETE FROM public.object WHERE id='HOTRUN999999AR04'; GET DIAGNOSTICS v_rows=ROW_COUNT; ASSERT v_rows=1, 'Current DELETE permission had no positive witness';
  RESET ROLE;

  -- Same JWT, current editor role removed: ORG reading remains, editing does not.
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  UPDATE public.user_org_business_role SET is_active=false WHERE membership_id='00000000-0000-4000-a000-00000000ab11';
  PERFORM set_config('request.jwt.claims',v_writer_claims,true); SET LOCAL ROLE authenticated;
  ASSERT current_setting('request.jwt.claims')=v_writer_claims;
  ASSERT EXISTS(SELECT 1 FROM public.object WHERE id='HOTRUN999999AR01'), 'Current reader scope was lost with edit demotion';
  ASSERT EXISTS(SELECT 1 FROM public.object_room_type WHERE id='00000000-0000-4000-a000-00000000ac01');
  ASSERT api.user_can_write_object_canonical('HOTRUN999999AR01') IS FALSE;
  ASSERT api.user_can_publish_object('HOTRUN999999AR01') IS FALSE;
  UPDATE public.object SET status='published' WHERE id='HOTRUN999999AR01'; GET DIAGNOSTICS v_rows=ROW_COUNT; ASSERT v_rows=0;
  UPDATE public.object SET name='Forbidden stale writer' WHERE id='HOTRUN999999AR01'; GET DIAGNOSTICS v_rows=ROW_COUNT; ASSERT v_rows=0;
  DELETE FROM public.object WHERE id='HOTRUN999999AR01'; GET DIAGNOSTICS v_rows=ROW_COUNT; ASSERT v_rows=0;
  v_denied:=false; BEGIN PERFORM internal.workspace_assert_can_write_object('HOTRUN999999AR01'); EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END; ASSERT v_denied;
  FOR c IN SELECT value FROM jsonb_array_elements(v_cases) LOOP
    v_denied:=false; BEGIN EXECUTE c->>'ins'; EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
    ASSERT v_denied, format('Demoted historical creator inserted %s',c->>'table');
    FOREACH v_sql IN ARRAY ARRAY[c->>'denied_upd',c->>'denied_del'] LOOP
      EXECUTE v_sql; GET DIAGNOSTICS v_rows=ROW_COUNT; ASSERT v_rows=0, format('Demoted historical creator wrote %s',c->>'table');
    END LOOP;
  END LOOP;
  RESET ROLE;

  -- An active individual exception remains a real current grant, then disappears on revocation.
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  INSERT INTO public.user_permission(user_id,permission_id,is_active,granted_by)
    VALUES('00000000-0000-4000-a000-00000000ae11',(f->>'permission')::uuid,true,'00000000-0000-4000-a000-00000000ae15');
  PERFORM set_config('request.jwt.claims',v_writer_claims,true); SET LOCAL ROLE authenticated;
  ASSERT api.user_can_write_object_canonical('HOTRUN999999AR01') IS TRUE;
  UPDATE public.object SET name='Current individual exception edit' WHERE id='HOTRUN999999AR01'; GET DIAGNOSTICS v_rows=ROW_COUNT; ASSERT v_rows=1;
  RESET ROLE; PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  UPDATE public.user_permission SET is_active=false WHERE user_id='00000000-0000-4000-a000-00000000ae11';
  PERFORM set_config('request.jwt.claims',v_writer_claims,true); SET LOCAL ROLE authenticated;
  ASSERT api.user_can_write_object_canonical('HOTRUN999999AR01') IS FALSE;
  RESET ROLE; PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  UPDATE public.user_org_membership SET is_active=false WHERE id='00000000-0000-4000-a000-00000000ab11';
  PERFORM set_config('request.jwt.claims',v_writer_claims,true); SET LOCAL ROLE authenticated;
  ASSERT NOT EXISTS(SELECT 1 FROM public.object WHERE id IN('HOTRUN999999AR01','HOTRUN999999AR02'));
  ASSERT NOT EXISTS(SELECT 1 FROM public.object_room_type WHERE id='00000000-0000-4000-a000-00000000ac01');
  ASSERT EXISTS(SELECT 1 FROM public.object WHERE id='HOTRUN999999AR03'), 'Public positive witness vanished on departure';
  UPDATE public.object SET name='Forbidden published creator edit' WHERE id='HOTRUN999999AR03'; GET DIAGNOSTICS v_rows=ROW_COUNT; ASSERT v_rows=0;
  DELETE FROM public.object WHERE id='HOTRUN999999AR03'; GET DIAGNOSTICS v_rows=ROW_COUNT; ASSERT v_rows=0;
  v_denied:=false; BEGIN PERFORM internal.workspace_assert_can_write_object('HOTRUN999999AR01'); EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END; ASSERT v_denied;
  RESET ROLE;

  -- Contact email, including email-only identity, supplies neither object nor parent-ORG scope.
  FOREACH v_sql IN ARRAY ARRAY['{"sub":"00000000-0000-4000-a000-00000000ae12","role":"authenticated","email":"current-rights-email@example.invalid"}','{"role":"authenticated","email":"current-rights-writer@example.invalid"}'] LOOP
    PERFORM set_config('request.jwt.claims',v_sql,true); SET LOCAL ROLE authenticated;
    ASSERT NOT EXISTS(SELECT 1 FROM api.user_actor_ids());
    ASSERT NOT EXISTS(SELECT 1 FROM api.current_user_extended_object_ids());
    ASSERT NOT EXISTS(SELECT 1 FROM public.object WHERE id='HOTRUN999999AR01');
    ASSERT EXISTS(SELECT 1 FROM public.object WHERE id='HOTRUN999999AR03');
    ASSERT api.user_can_write_object_canonical('HOTRUN999999AR01') IS FALSE;
    RESET ROLE;
  END LOOP;

  -- Explicit portal remains current and bounded; it never becomes a canonical writer.
  PERFORM set_config('request.jwt.claims',v_portal_claims,true); SET LOCAL ROLE authenticated;
  ASSERT api.current_user_actor_id()='00000000-0000-4000-a000-00000000aa01'::uuid;
  ASSERT EXISTS(SELECT 1 FROM api.current_user_portal_object_ids() x WHERE x='HOTRUN999999AR01');
  ASSERT EXISTS(SELECT 1 FROM public.object WHERE id='HOTRUN999999AR01');
  ASSERT NOT EXISTS(SELECT 1 FROM public.object WHERE id='HOTRUN999999AR02');
  ASSERT api.user_can_write_object_canonical('HOTRUN999999AR01') IS FALSE;
  RESET ROLE; PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  ASSERT EXISTS(SELECT 1 FROM public.object WHERE id='HOTRUN999999AR05' AND is_test), 'Cross-realm witness must be a real test object';
  -- An active test ORG makes this request a test request; its still-real actor
  -- binding must not bypass the existing mismatch guard.
  INSERT INTO public.user_org_membership(id,user_id,org_object_id,is_active) VALUES
    ('00000000-0000-4000-a000-00000000ab13','00000000-0000-4000-a000-00000000ae13','ORGRUN999999AR03',true);
  PERFORM set_config('request.jwt.claims',v_portal_claims,true); SET LOCAL ROLE authenticated;
  ASSERT api.current_user_test_realm() IS TRUE;
  ASSERT api.current_user_actor_id() IS NULL, 'Explicit actor binding bypassed its existing realm gate';
  ASSERT NOT EXISTS(SELECT 1 FROM public.object WHERE id IN('HOTRUN999999AR01','HOTRUN999999AR05'));
  RESET ROLE; PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  UPDATE public.app_user_profile SET actor_id='00000000-0000-4000-a000-00000000aa03' WHERE id='00000000-0000-4000-a000-00000000ae13';
  PERFORM set_config('request.jwt.claims',v_portal_claims,true); SET LOCAL ROLE authenticated;
  ASSERT api.current_user_actor_id()='00000000-0000-4000-a000-00000000aa03'::uuid;
  ASSERT EXISTS(SELECT 1 FROM public.object WHERE id='HOTRUN999999AR05'), 'Current explicit test portal has no positive witness';
  ASSERT NOT EXISTS(SELECT 1 FROM public.object WHERE id='HOTRUN999999AR01');
  ASSERT api.user_can_write_object_canonical('HOTRUN999999AR05') IS FALSE;
  RESET ROLE; PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  UPDATE public.user_org_membership SET is_active=false WHERE id='00000000-0000-4000-a000-00000000ab13';
  PERFORM set_config('request.jwt.claims',v_portal_claims,true); SET LOCAL ROLE authenticated;
  ASSERT EXISTS(SELECT 1 FROM public.object WHERE id='HOTRUN999999AR05'), 'Explicit actor portal should not require a current ORG membership';
  RESET ROLE; PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  UPDATE public.app_user_profile SET actor_id='00000000-0000-4000-a000-00000000aa01' WHERE id='00000000-0000-4000-a000-00000000ae13';
  PERFORM set_config('request.jwt.claims',v_portal_claims,true); SET LOCAL ROLE authenticated;
  ASSERT EXISTS(SELECT 1 FROM public.object WHERE id='HOTRUN999999AR01');
  ASSERT NOT EXISTS(SELECT 1 FROM public.object WHERE id='HOTRUN999999AR05');
  RESET ROLE; PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  UPDATE public.actor_object_role SET valid_to=CURRENT_DATE-1 WHERE actor_id='00000000-0000-4000-a000-00000000aa01' AND object_id='HOTRUN999999AR01';
  PERFORM set_config('request.jwt.claims',v_portal_claims,true); SET LOCAL ROLE authenticated;
  ASSERT NOT EXISTS(SELECT 1 FROM public.object WHERE id='HOTRUN999999AR01');
  RESET ROLE; PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  UPDATE public.actor_object_role SET valid_to=NULL WHERE actor_id='00000000-0000-4000-a000-00000000aa01' AND object_id='HOTRUN999999AR01';
  UPDATE public.app_user_profile SET actor_id=NULL WHERE id='00000000-0000-4000-a000-00000000ae13';
  PERFORM set_config('request.jwt.claims',v_portal_claims,true); SET LOCAL ROLE authenticated;
  ASSERT api.current_user_actor_id() IS NULL; ASSERT NOT EXISTS(SELECT 1 FROM api.current_user_portal_object_ids());
  ASSERT NOT EXISTS(SELECT 1 FROM public.object WHERE id='HOTRUN999999AR01');
  RESET ROLE; PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  UPDATE public.app_user_profile SET actor_id='00000000-0000-4000-a000-00000000aa01',role='actor' WHERE id='00000000-0000-4000-a000-00000000ae13';
  PERFORM set_config('request.jwt.claims',v_portal_claims,true); SET LOCAL ROLE authenticated;
  ASSERT EXISTS(SELECT 1 FROM public.object WHERE id='HOTRUN999999AR01'); RESET ROLE;
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  UPDATE public.app_user_profile SET role='tourism_agent' WHERE id='00000000-0000-4000-a000-00000000ae13';
  PERFORM set_config('request.jwt.claims',v_portal_claims,true); SET LOCAL ROLE authenticated;
  ASSERT api.current_user_actor_id() IS NULL; ASSERT NOT EXISTS(SELECT 1 FROM api.user_actor_ids());
  ASSERT NOT EXISTS(SELECT 1 FROM public.object WHERE id='HOTRUN999999AR01'); RESET ROLE;

  -- Platform authority is current profile state too. Technical roles retain their existing exception.
  PERFORM set_config('request.jwt.claims',v_admin_claims,true); SET LOCAL ROLE authenticated;
  ASSERT api.is_object_owner('HOTRUN999999AR01') IS TRUE; RESET ROLE;
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  UPDATE public.app_user_profile SET role='tourism_agent' WHERE id='00000000-0000-4000-a000-00000000ae15';
  PERFORM set_config('request.jwt.claims',v_admin_claims,true); SET LOCAL ROLE authenticated;
  ASSERT api.is_platform_superuser() IS FALSE; ASSERT api.is_object_owner('HOTRUN999999AR01') IS FALSE; RESET ROLE;
  FOREACH v_sql IN ARRAY ARRAY['{"role":"service_role"}','{"role":"admin"}'] LOOP
    PERFORM set_config('request.jwt.claims',v_sql,true); ASSERT api.is_object_owner('HOTRUN999999AR01') IS TRUE;
  END LOOP;
  PERFORM set_config('request.jwt.claims','{}',true); ASSERT api.is_object_owner('HOTRUN999999AR01') IS FALSE;

  ASSERT (SELECT created_by FROM public.object WHERE id='HOTRUN999999AR01')='00000000-0000-4000-a000-00000000ae11'::uuid, 'Authorization changes rewrote provenance';
  ASSERT EXISTS(SELECT 1 FROM public.object WHERE id='HOTRUN999999AR01' AND name='Current individual exception edit');
  ASSERT EXISTS(SELECT 1 FROM public.object WHERE id='HOTRUN999999AR03' AND name='Synthetic public witness' AND created_by='00000000-0000-4000-a000-00000000ae11'::uuid);
  ASSERT (SELECT count(*) FROM public.object_room_type WHERE id='00000000-0000-4000-a000-00000000ac01')=1;
  ASSERT (SELECT count(*) FROM public.object_room_type_amenity WHERE room_type_id='00000000-0000-4000-a000-00000000ac01')=1;
  ASSERT (SELECT quantity FROM public.object_room_type_bed WHERE room_type_id='00000000-0000-4000-a000-00000000ac01')=1;
  ASSERT (SELECT count(*) FROM public.object_room_type_media WHERE room_type_id='00000000-0000-4000-a000-00000000ac01')=1;
  ASSERT (SELECT count(*) FROM public.media_tag WHERE media_id='00000000-0000-4000-a000-00000000ad01')=1;
  RAISE NOTICE 'Current rights passed: 17 DML policies, current role/individual grant, stale claims, departure, email denial, portal and platform transitions';
END;
$current_rights$;
ROLLBACK;
