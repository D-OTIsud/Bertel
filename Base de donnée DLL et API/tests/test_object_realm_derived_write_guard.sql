-- DB-03: real direct-write/RLS and canonical realm maintenance contracts.
-- Disposable database; all synthetic fixtures and temporary grants roll back.
-- Creator/revocation and publication authorization decisions are unchanged.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout='60s';
SET LOCAL lock_timeout='5s';
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
GRANT INSERT,UPDATE ON public.object TO authenticated;

INSERT INTO auth.users(id,email) VALUES
  ('00000000-0000-4000-a000-00000000de11','realm-writer-a@example.invalid'),
  ('00000000-0000-4000-a000-00000000de12','realm-writer-b@example.invalid'),
  ('00000000-0000-4000-a000-00000000de13','realm-writer-test@example.invalid'),
  ('00000000-0000-4000-a000-00000000de14','realm-admin@example.invalid');
INSERT INTO public.app_user_profile(id,role) VALUES
  ('00000000-0000-4000-a000-00000000de11','tourism_agent'),
  ('00000000-0000-4000-a000-00000000de12','tourism_agent'),
  ('00000000-0000-4000-a000-00000000de13','tourism_agent'),
  ('00000000-0000-4000-a000-00000000de14','super_admin')
ON CONFLICT(id) DO UPDATE SET role=EXCLUDED.role;
INSERT INTO public.object(id,object_type,name,status,created_by) VALUES
  ('ORGRUN999999RW01','ORG','Realm fixture organization A','published',NULL),
  ('ORGRUN999999RW02','ORG','Realm fixture organization B','published',NULL),
  ('ORGRUN999999RW03','ORG','Realm fixture test organization','published',NULL),
  ('HOTRUN999999RW01','HOT','Realm fixture real A','published',NULL),
  ('HOTRUN999999RW02','HOT','Realm fixture real B','published',NULL),
  ('HOTRUN999999RW03','HOT','Realm fixture test','published',NULL),
  ('HOTRUN999999RW04','HOT','Realm fixture orphan','draft',NULL);
INSERT INTO public.org_config(org_object_id,access_scope,is_test_org) VALUES
  ('ORGRUN999999RW01','all_published',false),
  ('ORGRUN999999RW02','all_published',false),
  ('ORGRUN999999RW03','own_objects_only',true);
INSERT INTO public.object_org_link(object_id,org_object_id,role_id,is_primary)
  SELECT x.object_id,x.org_id,r.id,true FROM (VALUES
    ('HOTRUN999999RW01','ORGRUN999999RW01'),('HOTRUN999999RW02','ORGRUN999999RW02'),
    ('HOTRUN999999RW03','ORGRUN999999RW03')) x(object_id,org_id)
  CROSS JOIN public.ref_org_role r WHERE r.code='publisher';
UPDATE public.object SET created_by=CASE id
  WHEN 'HOTRUN999999RW01' THEN '00000000-0000-4000-a000-00000000de11'::uuid
  WHEN 'HOTRUN999999RW02' THEN '00000000-0000-4000-a000-00000000de12'::uuid
  WHEN 'HOTRUN999999RW03' THEN '00000000-0000-4000-a000-00000000de13'::uuid END
  WHERE id IN ('HOTRUN999999RW01','HOTRUN999999RW02','HOTRUN999999RW03');
INSERT INTO public.user_org_membership(user_id,org_object_id,is_active) VALUES
  ('00000000-0000-4000-a000-00000000de11','ORGRUN999999RW01',true),
  ('00000000-0000-4000-a000-00000000de12','ORGRUN999999RW02',true),
  ('00000000-0000-4000-a000-00000000de13','ORGRUN999999RW03',true);
INSERT INTO public.user_permission(user_id,permission_id,is_active,granted_by)
  SELECT u.id,p.id,true,'00000000-0000-4000-a000-00000000de14'::uuid
  FROM auth.users u CROSS JOIN public.ref_permission p
  WHERE u.id IN ('00000000-0000-4000-a000-00000000de11','00000000-0000-4000-a000-00000000de12',
    '00000000-0000-4000-a000-00000000de13') AND p.code IN ('create_object','edit_canonical_when_publisher');

DO $direct_writes$
DECLARE v_uid uuid; v_id text; v_expected boolean; v_denied boolean; v_detail text; v_rows integer;
BEGIN
  ASSERT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.object'::regclass
    AND tgname='trg_guard_object_is_test' AND NOT tgisinternal), 'The column invariant trigger is missing';
  ASSERT NOT EXISTS(SELECT 1 FROM (VALUES('anon'),('authenticated'),('service_role')) r(role_name)
    WHERE has_function_privilege(r.role_name,'api.guard_object_is_test()','EXECUTE')
       OR has_function_privilege(r.role_name,'internal.lock_object_realm_sources(text[])','EXECUTE')),
    'Private invariant helpers must not become client RPCs';
  ASSERT api.object_expected_is_test('ORGRUN999999RW03') IS TRUE, 'An ORG must follow its own configuration';
  ASSERT api.object_expected_is_test('HOTRUN999999RW04') IS FALSE, 'An orphan retains the existing production default';

  FOR v_uid,v_id,v_expected IN SELECT * FROM (VALUES
    ('00000000-0000-4000-a000-00000000de11'::uuid,'HOTRUN999999RW01',false),
    ('00000000-0000-4000-a000-00000000de13'::uuid,'HOTRUN999999RW03',true)) x(uid,id,expected)
  LOOP
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_uid,'role','authenticated')::text,true);
    SET LOCAL ROLE authenticated;
    ASSERT api.is_platform_superuser() IS FALSE;
    ASSERT api.user_can_write_object_canonical(v_id) IS TRUE, 'The attempted realm write needs a real authorized writer';
    ASSERT EXISTS(SELECT 1 FROM public.object WHERE id=v_id AND is_test=v_expected), 'Positive read witness missing';
    UPDATE public.object SET name='Legitimate ordinary edit' WHERE id=v_id;
    GET DIAGNOSTICS v_rows=ROW_COUNT;
    ASSERT v_rows=1, 'Normal object edits must still work';
    v_denied:=false;
    BEGIN
      UPDATE public.object SET name='Must roll back with illegal realm',is_test=NOT v_expected WHERE id=v_id;
    EXCEPTION WHEN insufficient_privilege THEN
      GET STACKED DIAGNOSTICS v_detail=PG_EXCEPTION_DETAIL;
      v_denied:=v_detail='object_realm_is_derived';
    END;
    ASSERT v_denied, 'A visible authorized writer forged the derived realm or failed for the wrong reason';
    UPDATE public.object SET is_test=v_expected WHERE id=v_id;
    GET DIAGNOSTICS v_rows=ROW_COUNT;
    ASSERT v_rows=1, 'A consistent no-op must not break ordinary updates';
    RESET ROLE;
    ASSERT EXISTS(SELECT 1 FROM public.object WHERE id=v_id AND is_test=v_expected AND name='Legitimate ordinary edit'),
      'Rejected realm update partially committed or changed classification';
  END LOOP;

  PERFORM set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-00000000de12","role":"authenticated"}',true);
  SET LOCAL ROLE authenticated;
  ASSERT api.user_can_write_object_canonical('HOTRUN999999RW02') IS TRUE, 'Other-ORG positive control is empty';
  UPDATE public.object SET name='Other organization ordinary edit' WHERE id='HOTRUN999999RW02';
  GET DIAGNOSTICS v_rows=ROW_COUNT;
  ASSERT v_rows=1;
  UPDATE public.object SET name='Other organization intrusion' WHERE id='HOTRUN999999RW01';
  GET DIAGNOSTICS v_rows=ROW_COUNT;
  ASSERT v_rows=0, 'Realm protection must not broaden existing cross-ORG authorization';
  RESET ROLE;
END; $direct_writes$;

-- A caller's temporary objects must never become a privileged source of realm.
CREATE TEMP TABLE org_config(org_object_id text,is_test_org boolean);
CREATE TEMP TABLE object_org_link(object_id text,org_object_id text,is_primary boolean,updated_at timestamptz);
INSERT INTO pg_temp.org_config VALUES('ORGRUN999999RW03',false);
INSERT INTO pg_temp.object_org_link VALUES('HOTRUN999999RW03','ORGRUN999999RW03',true,now());
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-00000000de13","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $shadow$ DECLARE v_denied boolean:=false; v_detail text; BEGIN
  BEGIN UPDATE public.object SET is_test=false WHERE id='HOTRUN999999RW03';
  EXCEPTION WHEN insufficient_privilege THEN GET STACKED DIAGNOSTICS v_detail=PG_EXCEPTION_DETAIL; v_denied:=v_detail='object_realm_is_derived'; END;
  ASSERT v_denied, 'Temporary shadow relations altered the canonical realm check';
END; $shadow$;
RESET ROLE;
DROP TABLE pg_temp.org_config,pg_temp.object_org_link;

-- INSERT cannot assert an independent realm. The established auto-attachment
-- remains responsible for a new test member's draft; publication is not tested here.
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-00000000de13","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $creation$ DECLARE v_denied boolean:=false; v_detail text; BEGIN
  ASSERT api.user_can_create_object() IS TRUE, 'Creation denial needs an otherwise authorized caller';
  BEGIN INSERT INTO public.object(id,object_type,name,status,created_by,is_test) VALUES(
    'HOTRUN999999RW05','HOT','Forged initial realm','draft',auth.uid(),true);
  EXCEPTION WHEN insufficient_privilege THEN GET STACKED DIAGNOSTICS v_detail=PG_EXCEPTION_DETAIL; v_denied:=v_detail='object_realm_is_derived'; END;
  ASSERT v_denied, 'INSERT accepted an independent test flag before any canonical attachment';
  INSERT INTO public.object(id,object_type,name,status,created_by) VALUES(
    'HOTRUN999999RW06','HOT','Legitimate test member draft','draft',auth.uid());
END; $creation$;
RESET ROLE;
DO $created$ BEGIN
  ASSERT NOT EXISTS(SELECT 1 FROM public.object WHERE id='HOTRUN999999RW05');
  ASSERT EXISTS(SELECT 1 FROM public.object WHERE id='HOTRUN999999RW06' AND is_test),
    'The existing auto-attachment must still stamp a test creator draft atomically';
END; $created$;

-- Public and partner witnesses use both a rejected escape and a real readable
-- object; absence alone is not evidence that the fixtures exercised the readers.
SELECT set_config('request.jwt.claims','{"role":"anon"}',true);
SET LOCAL ROLE anon;
DO $anonymous$ BEGIN
  ASSERT NOT EXISTS(SELECT 1 FROM public.object WHERE id='HOTRUN999999RW03');
  ASSERT EXISTS(SELECT 1 FROM public.object WHERE id='HOTRUN999999RW01');
END; $anonymous$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
DO $technical$ DECLARE v_denied boolean:=false; v_detail text; BEGIN
  ASSERT EXISTS(SELECT 1 FROM public.object WHERE id='HOTRUN999999RW03' AND is_test),
    'Technical invariant denial needs a visible test object';
  BEGIN UPDATE public.object SET is_test=false WHERE id='HOTRUN999999RW03';
  EXCEPTION WHEN insufficient_privilege THEN GET STACKED DIAGNOSTICS v_detail=PG_EXCEPTION_DETAIL; v_denied:=v_detail='object_realm_is_derived'; END;
  ASSERT v_denied, 'Technical privileges must not bypass the derived invariant';
END; $technical$;
DO $partner$ BEGIN
  ASSERT api.get_object_resource('HOTRUN999999RW03',ARRAY['fr']) IS NULL;
  ASSERT api.get_object_resource('HOTRUN999999RW01',ARRAY['fr']) IS NOT NULL;
END; $partner$;
RESET ROLE;

-- Historical tombstones keep the source realm at deletion time, even if their
-- former organization later changes realm. No existing tombstone is rewritten.
INSERT INTO public.object_deletion_log(object_id,object_name,object_type,status_at_deletion) VALUES
  ('HOTRUN999999RW03','Synthetic test tombstone','HOT','published'),
  ('HOTRUN999999RW01','Synthetic public tombstone','HOT','published');
DO $maintenance$
DECLARE v_role uuid;
BEGIN
  ASSERT (SELECT is_test FROM public.object_deletion_log WHERE object_id='HOTRUN999999RW03');
  ASSERT NOT (SELECT is_test FROM public.object_deletion_log WHERE object_id='HOTRUN999999RW01');
  PERFORM set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-00000000de14","role":"authenticated"}',true);
  SET LOCAL ROLE authenticated;
  UPDATE public.org_config SET is_test_org=false WHERE org_object_id='ORGRUN999999RW03';
  RESET ROLE;
  ASSERT NOT EXISTS(SELECT 1 FROM public.object WHERE id IN('ORGRUN999999RW03','HOTRUN999999RW03','HOTRUN999999RW06') AND is_test),
    'A legitimate config flip must update the organization and all derived rows';
  ASSERT (SELECT is_test FROM public.object_deletion_log WHERE object_id='HOTRUN999999RW03'), 'Config maintenance rewrote a historical tombstone';
  SET LOCAL ROLE authenticated;
  UPDATE public.org_config SET is_test_org=true WHERE org_object_id='ORGRUN999999RW03';
  RESET ROLE;
  ASSERT NOT EXISTS(SELECT 1 FROM public.object WHERE id IN('ORGRUN999999RW03','HOTRUN999999RW03','HOTRUN999999RW06') AND NOT is_test);

  -- Config removal and key movement are existing administrative operations.
  -- Both sides must follow the same derivation, with no stale classification.
  SET LOCAL ROLE authenticated;
  DELETE FROM public.org_config WHERE org_object_id='ORGRUN999999RW03';
  RESET ROLE;
  ASSERT NOT EXISTS(SELECT 1 FROM public.object WHERE id IN('ORGRUN999999RW03','HOTRUN999999RW03','HOTRUN999999RW06') AND is_test),
    'Removing a source left its former organization or primary children stale';
  BEGIN
    UPDATE public.object SET is_test=true WHERE id='HOTRUN999999RW03';
    RAISE EXCEPTION 'A removed source still allowed an independent realm';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM <> 'Object realm is derived from its organization' THEN RAISE; END IF;
  END;
  SET LOCAL ROLE authenticated;
  INSERT INTO public.org_config(org_object_id,access_scope,is_test_org) VALUES('ORGRUN999999RW03','own_objects_only',true);
  DELETE FROM public.org_config WHERE org_object_id='ORGRUN999999RW02';
  UPDATE public.org_config SET org_object_id='ORGRUN999999RW02' WHERE org_object_id='ORGRUN999999RW03';
  RESET ROLE;
  ASSERT NOT EXISTS(SELECT 1 FROM public.object WHERE id IN('ORGRUN999999RW03','HOTRUN999999RW03','HOTRUN999999RW06') AND is_test),
    'The old config key retained its former classification';
  ASSERT NOT EXISTS(SELECT 1 FROM public.object WHERE id IN('ORGRUN999999RW02','HOTRUN999999RW02') AND NOT is_test),
    'The new config key did not classify its own organization and primary children';
  BEGIN
    UPDATE public.object SET is_test=false WHERE id='HOTRUN999999RW02';
    RAISE EXCEPTION 'A moved source allowed an independent realm';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM <> 'Object realm is derived from its organization' THEN RAISE; END IF;
  END;
  SET LOCAL ROLE authenticated;
  UPDATE public.org_config SET org_object_id='ORGRUN999999RW03' WHERE org_object_id='ORGRUN999999RW02';
  INSERT INTO public.org_config(org_object_id,access_scope,is_test_org) VALUES('ORGRUN999999RW02','all_published',false);
  RESET ROLE;
  ASSERT (SELECT is_test FROM public.object WHERE id='HOTRUN999999RW03');
  ASSERT NOT (SELECT is_test FROM public.object WHERE id='HOTRUN999999RW02');
  ASSERT (SELECT is_test FROM public.object_deletion_log WHERE object_id='HOTRUN999999RW03'),
    'Source delete/key movement rewrote a historical tombstone';

  -- Owner-side maintenance used by authorized DEFINER writers drives the flag
  -- in both ways. This test does not grant a new cross-ORG link permission.
  UPDATE public.object_org_link SET org_object_id='ORGRUN999999RW02'
    WHERE object_id='HOTRUN999999RW03' AND is_primary;
  ASSERT NOT (SELECT is_test FROM public.object WHERE id='HOTRUN999999RW03');
  UPDATE public.object_org_link SET org_object_id='ORGRUN999999RW03'
    WHERE object_id='HOTRUN999999RW03' AND is_primary;
  ASSERT (SELECT is_test FROM public.object WHERE id='HOTRUN999999RW03');

  -- Changing a link's object key must update BOTH its old and new derived rows.
  UPDATE public.object_org_link SET object_id='HOTRUN999999RW04' WHERE object_id='HOTRUN999999RW03' AND is_primary;
  ASSERT NOT (SELECT is_test FROM public.object WHERE id='HOTRUN999999RW03');
  ASSERT (SELECT is_test FROM public.object WHERE id='HOTRUN999999RW04');
  UPDATE public.object_org_link SET object_id='HOTRUN999999RW03' WHERE object_id='HOTRUN999999RW04' AND is_primary;
  ASSERT (SELECT is_test FROM public.object WHERE id='HOTRUN999999RW03');
  ASSERT NOT (SELECT is_test FROM public.object WHERE id='HOTRUN999999RW04');
  SELECT role_id INTO v_role FROM public.object_org_link WHERE object_id='HOTRUN999999RW03' AND is_primary;
  DELETE FROM public.object_org_link WHERE object_id='HOTRUN999999RW03' AND is_primary;
  ASSERT NOT (SELECT is_test FROM public.object WHERE id='HOTRUN999999RW03');
  INSERT INTO public.object_org_link(object_id,org_object_id,role_id,is_primary)
    VALUES('HOTRUN999999RW03','ORGRUN999999RW03',v_role,true);
  ASSERT (SELECT is_test FROM public.object WHERE id='HOTRUN999999RW03');
END; $maintenance$;

-- Owner-side ORG deletion exercises the actual FK cascades. This does not open
-- the application hard-delete RPC to ORGs. Historical test tombstones stay test;
-- surviving children follow the established absent-source=false rule.
INSERT INTO public.object(id,object_type,name,status) VALUES
  ('ORGRUN999999RW04','ORG','Disposable source organization','published'),
  ('HOTRUN999999RW07','HOT','Surviving former primary child','published');
INSERT INTO public.org_config(org_object_id,access_scope,is_test_org) VALUES('ORGRUN999999RW04','own_objects_only',true);
INSERT INTO public.object_org_link(object_id,org_object_id,role_id,is_primary)
  SELECT 'HOTRUN999999RW07','ORGRUN999999RW04',id,true FROM public.ref_org_role WHERE code='publisher';
INSERT INTO public.object_deletion_log(object_id,object_name,object_type,status_at_deletion) VALUES
  ('ORGRUN999999RW04','Synthetic deleted ORG','ORG','published'),
  ('HOTRUN999999RW07','Synthetic historical child tombstone','HOT','published');
DO $cascade$ BEGIN
  ASSERT (SELECT is_test FROM public.object WHERE id='HOTRUN999999RW07');
  ASSERT (SELECT is_test FROM public.object_deletion_log WHERE object_id='ORGRUN999999RW04');
  DELETE FROM public.object WHERE id='ORGRUN999999RW04';
  ASSERT NOT EXISTS(SELECT 1 FROM public.org_config WHERE org_object_id='ORGRUN999999RW04');
  ASSERT NOT EXISTS(SELECT 1 FROM public.object_org_link WHERE org_object_id='ORGRUN999999RW04');
  ASSERT EXISTS(SELECT 1 FROM public.object WHERE id='HOTRUN999999RW07' AND NOT is_test),
    'ORG cascades left a surviving primary child inconsistent';
  ASSERT NOT EXISTS(SELECT 1 FROM public.object_deletion_log WHERE object_id IN('ORGRUN999999RW04','HOTRUN999999RW07') AND NOT is_test),
    'ORG cascades changed historical test tombstones';
END; $cascade$;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
DO $tombstones$ DECLARE v_result jsonb; BEGIN
  v_result:=api.list_deleted_objects_since(NULL,1000);
  ASSERT NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_result->'tombstones') t
    WHERE t->>'object_id' IN('HOTRUN999999RW03','ORGRUN999999RW04','HOTRUN999999RW07'));
  ASSERT EXISTS(SELECT 1 FROM jsonb_array_elements(v_result->'tombstones') t WHERE t->>'object_id'='HOTRUN999999RW01');
END; $tombstones$;
RESET ROLE;
DO $consistent$ BEGIN
  ASSERT NOT EXISTS(SELECT 1 FROM public.object WHERE id IN (
    'ORGRUN999999RW01','ORGRUN999999RW02','ORGRUN999999RW03',
    'HOTRUN999999RW01','HOTRUN999999RW02','HOTRUN999999RW03','HOTRUN999999RW04','HOTRUN999999RW06','HOTRUN999999RW07')
    AND is_test IS DISTINCT FROM api.object_expected_is_test(id));
  RAISE NOTICE 'Derived realm guard: authorized direct contradictions rejected, normal creation/config/link changes retained, public/test/tombstone witnesses passed';
END; $consistent$;
ROLLBACK;
