-- Disposable database ONLY: intentionally commits between simulated requests.
-- CI supplies a loopback DB_URL and current_rights_disposable=true.
-- The same request claims are reused after each authority change is committed.
\set ON_ERROR_STOP on
\if :{?current_rights_disposable}
\else
\echo 'Refusing committed fixture test without current_rights_disposable=true'
\quit 3
\endif
\if :current_rights_disposable
\else
\quit 3
\endif
\ir fixtures/object_current_rights.sql
\set writer_claims '{"sub":"00000000-0000-4000-a000-00000000ae11","role":"authenticated","email":"current-rights-writer@example.invalid","app_metadata":{"role":"super_admin"}}'
\set portal_claims '{"sub":"00000000-0000-4000-a000-00000000ae13","role":"authenticated","email":"current-rights-portal@example.invalid"}'

BEGIN;
SELECT pg_temp.setup_current_rights_fixture() IS NOT NULL AS fixture_created;
COMMIT;

BEGIN; SELECT set_config('request.jwt.claims',:'writer_claims',true); SET LOCAL ROLE authenticated;
DO $request$ BEGIN
  ASSERT EXISTS(SELECT 1 FROM public.object WHERE id='HOTRUN999999AR01');
  ASSERT api.user_can_write_object_canonical('HOTRUN999999AR01') IS TRUE;
  UPDATE public.object SET name='Committed current writer witness' WHERE id='HOTRUN999999AR01';
  ASSERT EXISTS(SELECT 1 FROM public.object WHERE id='HOTRUN999999AR01' AND name='Committed current writer witness');
END; $request$; COMMIT;

BEGIN; SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
UPDATE public.user_org_business_role SET is_active=false WHERE membership_id='00000000-0000-4000-a000-00000000ab11';
COMMIT;
-- New transaction/request, byte-identical claims and no refresh.
BEGIN; SELECT set_config('request.jwt.claims',:'writer_claims',true); SET LOCAL ROLE authenticated;
DO $request$ DECLARE v_rows integer; v_denied boolean:=false; BEGIN
  ASSERT EXISTS(SELECT 1 FROM public.object WHERE id='HOTRUN999999AR01'), 'Demotion must retain current ORG reading';
  ASSERT api.user_can_write_object_canonical('HOTRUN999999AR01') IS FALSE;
  UPDATE public.object SET name='Forbidden after committed demotion' WHERE id='HOTRUN999999AR01'; GET DIAGNOSTICS v_rows=ROW_COUNT; ASSERT v_rows=0;
  DELETE FROM public.object WHERE id='HOTRUN999999AR01'; GET DIAGNOSTICS v_rows=ROW_COUNT; ASSERT v_rows=0;
  BEGIN PERFORM internal.workspace_assert_can_write_object('HOTRUN999999AR01'); EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END; ASSERT v_denied;
END; $request$; COMMIT;

BEGIN; SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
INSERT INTO public.user_permission(user_id,permission_id,is_active,granted_by)
  SELECT '00000000-0000-4000-a000-00000000ae11',id,true,'00000000-0000-4000-a000-00000000ae15' FROM public.ref_permission WHERE code='edit_canonical_when_publisher';
COMMIT;
BEGIN; SELECT set_config('request.jwt.claims',:'writer_claims',true); SET LOCAL ROLE authenticated;
DO $request$ BEGIN ASSERT api.user_can_write_object_canonical('HOTRUN999999AR01') IS TRUE, 'Current individual exception lost its positive witness'; END; $request$; COMMIT;
BEGIN; SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
UPDATE public.user_permission SET is_active=false WHERE user_id='00000000-0000-4000-a000-00000000ae11';
COMMIT;
BEGIN; SELECT set_config('request.jwt.claims',:'writer_claims',true); SET LOCAL ROLE authenticated;
DO $request$ BEGIN ASSERT api.user_can_write_object_canonical('HOTRUN999999AR01') IS FALSE, 'Revoked individual exception survived a new request'; END; $request$; COMMIT;

BEGIN; SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
UPDATE public.user_org_membership SET is_active=false WHERE id='00000000-0000-4000-a000-00000000ab11';
-- A still-active individual permission cannot invent an object scope after departure.
UPDATE public.user_permission SET is_active=true WHERE user_id='00000000-0000-4000-a000-00000000ae11';
COMMIT;
BEGIN; SELECT set_config('request.jwt.claims',:'writer_claims',true); SET LOCAL ROLE authenticated;
DO $request$ DECLARE v_denied boolean:=false; v_rows integer; BEGIN
  ASSERT NOT EXISTS(SELECT 1 FROM public.object WHERE id='HOTRUN999999AR01');
  ASSERT NOT EXISTS(SELECT 1 FROM public.object_room_type WHERE id='00000000-0000-4000-a000-00000000ac01');
  ASSERT EXISTS(SELECT 1 FROM public.object WHERE id='HOTRUN999999AR03'), 'Public witness disappeared after departure';
  UPDATE public.object SET name='Forbidden published creator edit' WHERE id='HOTRUN999999AR03'; GET DIAGNOSTICS v_rows=ROW_COUNT; ASSERT v_rows=0;
  DELETE FROM public.object WHERE id='HOTRUN999999AR03'; GET DIAGNOSTICS v_rows=ROW_COUNT; ASSERT v_rows=0;
  ASSERT api.user_can_write_object_canonical('HOTRUN999999AR01') IS FALSE;
  BEGIN PERFORM internal.workspace_assert_can_write_object('HOTRUN999999AR01'); EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END; ASSERT v_denied;
END; $request$; COMMIT;

BEGIN; SELECT set_config('request.jwt.claims',:'portal_claims',true); SET LOCAL ROLE authenticated;
DO $request$ BEGIN
  ASSERT api.current_user_actor_id()='00000000-0000-4000-a000-00000000aa01'::uuid;
  ASSERT EXISTS(SELECT 1 FROM public.object WHERE id='HOTRUN999999AR01');
  ASSERT api.user_can_write_object_canonical('HOTRUN999999AR01') IS FALSE;
END; $request$; COMMIT;
BEGIN; SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
UPDATE public.actor_object_role SET valid_to=CURRENT_DATE-1 WHERE actor_id='00000000-0000-4000-a000-00000000aa01' AND object_id='HOTRUN999999AR01';
COMMIT;
BEGIN; SELECT set_config('request.jwt.claims',:'portal_claims',true); SET LOCAL ROLE authenticated;
DO $request$ BEGIN ASSERT NOT EXISTS(SELECT 1 FROM public.object WHERE id='HOTRUN999999AR01'), 'Removed portal object link survived a new request'; END; $request$; COMMIT;
BEGIN; SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
UPDATE public.actor_object_role SET valid_to=NULL WHERE actor_id='00000000-0000-4000-a000-00000000aa01' AND object_id='HOTRUN999999AR01';
UPDATE public.app_user_profile SET actor_id=NULL WHERE id='00000000-0000-4000-a000-00000000ae13';
COMMIT;
BEGIN; SELECT set_config('request.jwt.claims',:'portal_claims',true); SET LOCAL ROLE authenticated;
DO $request$ BEGIN
  ASSERT api.current_user_actor_id() IS NULL;
  ASSERT NOT EXISTS(SELECT 1 FROM public.object WHERE id='HOTRUN999999AR01'), 'Removed account binding survived a new request';
END; $request$; COMMIT;

BEGIN; SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
DO $unchanged$ BEGIN
  ASSERT EXISTS(SELECT 1 FROM public.object WHERE id='HOTRUN999999AR01' AND name='Committed current writer witness'
    AND created_by='00000000-0000-4000-a000-00000000ae11'::uuid), 'A refused request changed state or provenance';
END; $unchanged$;
-- Exact synthetic identifiers only; no content or Storage object has been created.
DELETE FROM public.object_room_type_amenity WHERE room_type_id IN('00000000-0000-4000-a000-00000000ac01','00000000-0000-4000-a000-00000000ac02');
DELETE FROM public.object_room_type_bed WHERE room_type_id IN('00000000-0000-4000-a000-00000000ac01','00000000-0000-4000-a000-00000000ac02');
DELETE FROM public.object_room_type_media WHERE room_type_id IN('00000000-0000-4000-a000-00000000ac01','00000000-0000-4000-a000-00000000ac02');
DELETE FROM public.media_tag WHERE media_id IN('00000000-0000-4000-a000-00000000ad01','00000000-0000-4000-a000-00000000ad02');
DELETE FROM public.object_room_type WHERE id IN('00000000-0000-4000-a000-00000000ac01','00000000-0000-4000-a000-00000000ac02');
DELETE FROM public.media WHERE id IN('00000000-0000-4000-a000-00000000ad01','00000000-0000-4000-a000-00000000ad02');
DELETE FROM public.actor_object_role WHERE actor_id IN('00000000-0000-4000-a000-00000000aa01','00000000-0000-4000-a000-00000000aa02','00000000-0000-4000-a000-00000000aa03');
DELETE FROM public.actor_channel WHERE actor_id IN('00000000-0000-4000-a000-00000000aa01','00000000-0000-4000-a000-00000000aa02','00000000-0000-4000-a000-00000000aa03');
DELETE FROM public.org_role_permission WHERE org_object_id IN('ORGRUN999999AR01','ORGRUN999999AR02','ORGRUN999999AR03');
DELETE FROM public.user_org_business_role WHERE membership_id='00000000-0000-4000-a000-00000000ab11';
DELETE FROM public.user_org_membership WHERE id='00000000-0000-4000-a000-00000000ab11';
DELETE FROM public.org_config WHERE org_object_id IN('ORGRUN999999AR01','ORGRUN999999AR02','ORGRUN999999AR03');
DELETE FROM public.object_org_link WHERE org_object_id IN('ORGRUN999999AR01','ORGRUN999999AR02','ORGRUN999999AR03');
DELETE FROM public.object WHERE id IN('HOTRUN999999AR01','HOTRUN999999AR02','HOTRUN999999AR03','HOTRUN999999AR04','HOTRUN999999AR05');
DELETE FROM public.object WHERE id IN('ORGRUN999999AR01','ORGRUN999999AR02','ORGRUN999999AR03');
DELETE FROM public.user_permission WHERE user_id IN('00000000-0000-4000-a000-00000000ae11','00000000-0000-4000-a000-00000000ae12','00000000-0000-4000-a000-00000000ae13','00000000-0000-4000-a000-00000000ae14','00000000-0000-4000-a000-00000000ae15');
DELETE FROM public.app_user_profile WHERE id IN('00000000-0000-4000-a000-00000000ae11','00000000-0000-4000-a000-00000000ae12','00000000-0000-4000-a000-00000000ae13','00000000-0000-4000-a000-00000000ae14','00000000-0000-4000-a000-00000000ae15');
DELETE FROM auth.users WHERE id IN('00000000-0000-4000-a000-00000000ae11','00000000-0000-4000-a000-00000000ae12','00000000-0000-4000-a000-00000000ae13','00000000-0000-4000-a000-00000000ae14','00000000-0000-4000-a000-00000000ae15');
DELETE FROM public.actor WHERE id IN('00000000-0000-4000-a000-00000000aa01','00000000-0000-4000-a000-00000000aa02','00000000-0000-4000-a000-00000000aa03');
COMMIT;
