-- Bounded authority chain: current publisher and current platform authority.
-- Hostile temp names/grants/profiles cannot replace the real authority tables.
-- All witnesses are synthetic and rolled back; no REST exploit is claimed.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout='60s';
\ir fixtures/object_current_rights.sql
SELECT pg_temp.setup_current_rights_fixture() IS NOT NULL AS fixture_created;
UPDATE public.object SET status='published' WHERE id='HOTRUN999999AR02';
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-00000000ae11","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $baseline$ BEGIN
  ASSERT api.current_user_org_id()='ORGRUN999999AR01';
  ASSERT api.user_has_permission('edit_canonical_when_publisher') IS TRUE;
  ASSERT api.is_platform_superuser() IS FALSE;
  ASSERT api.user_can_write_canonical('HOTRUN999999AR01') IS TRUE;
  ASSERT api.user_can_write_canonical('HOTRUN999999AR02') IS FALSE;
  ASSERT EXISTS(SELECT 1 FROM public.object WHERE id='HOTRUN999999AR02');
END; $baseline$;
RESET ROLE;

-- Deliberately malformed shadows: retain the original DB03 witness unchanged too.
CREATE TEMP TABLE object_org_link(object_id text,org_object_id text);
CREATE TEMP TABLE ref_org_role(id uuid);
CREATE TEMP TABLE ref_permission(id uuid);
CREATE TEMP TABLE user_permission(user_id uuid);
CREATE TEMP TABLE org_role_permission(org_object_id text);
CREATE TEMP TABLE user_org_membership(id uuid);
CREATE TEMP TABLE user_org_business_role(membership_id uuid);
CREATE TEMP TABLE app_user_profile(id uuid);
SET LOCAL ROLE authenticated;
DO $malformed$
DECLARE n integer;
BEGIN
  ASSERT api.current_user_org_id()='ORGRUN999999AR01', 'Malformed shadow displaced current ORG';
  ASSERT api.user_has_permission('edit_canonical_when_publisher') IS TRUE,
    'Malformed shadow displaced current permission';
  ASSERT api.is_platform_superuser() IS FALSE, 'Malformed shadow displaced real platform profile';
  ASSERT api.user_can_write_canonical('HOTRUN999999AR01') IS TRUE,
    'Malformed temp names denied the real current publisher';
  UPDATE public.object SET name='Secure current publisher edit' WHERE id='HOTRUN999999AR01';
  GET DIAGNOSTICS n=ROW_COUNT;
  ASSERT n=1, 'Real authorized edit was vacant under temp shadows';
  ASSERT api.user_can_write_canonical('HOTRUN999999AR02') IS FALSE;
END; $malformed$;
RESET ROLE;
DROP TABLE pg_temp.object_org_link,pg_temp.ref_org_role,pg_temp.ref_permission,
  pg_temp.user_permission,pg_temp.org_role_permission,pg_temp.user_org_membership,
  pg_temp.user_org_business_role,pg_temp.app_user_profile;

-- Nonempty counterfeit publisher/membership, individual/business grants and profiles.
CREATE TEMP TABLE object_org_link(object_id text,org_object_id text,role_id uuid);
CREATE TEMP TABLE ref_org_role(id uuid,code text);
CREATE TEMP TABLE ref_permission(id uuid,code text,is_active boolean);
CREATE TEMP TABLE user_permission(user_id uuid,permission_id uuid,is_active boolean);
CREATE TEMP TABLE org_role_permission(org_object_id text,role_id uuid,permission_id uuid,is_active boolean);
CREATE TEMP TABLE user_org_membership(id uuid,user_id uuid,org_object_id text,is_active boolean);
CREATE TEMP TABLE user_org_business_role(membership_id uuid,role_id uuid,is_active boolean);
CREATE TEMP TABLE app_user_profile(id uuid,role text,actor_id uuid);
INSERT INTO pg_temp.ref_org_role SELECT id,code FROM public.ref_org_role WHERE code='publisher';
INSERT INTO pg_temp.object_org_link
  SELECT x.object_id,'ORGRUN999999AR01',r.id FROM pg_temp.ref_org_role r
  CROSS JOIN (VALUES('HOTRUN999999AR01'),('HOTRUN999999AR02')) x(object_id);
INSERT INTO pg_temp.ref_permission
  SELECT id,code,true FROM public.ref_permission WHERE code='edit_canonical_when_publisher'
  UNION ALL
  SELECT id,'counterfeit_authority_permission',true FROM public.ref_permission WHERE code='edit_canonical_when_publisher';
INSERT INTO pg_temp.user_permission SELECT u.id,p.id,true FROM
  (VALUES('00000000-0000-4000-a000-00000000ae11'::uuid),
         ('00000000-0000-4000-a000-00000000ae12'::uuid)) u(id)
  CROSS JOIN pg_temp.ref_permission p;
INSERT INTO pg_temp.user_org_membership VALUES
  ('00000000-0000-4000-a000-00000000af01','00000000-0000-4000-a000-00000000ae11','ORGRUN999999AR02',true),
  ('00000000-0000-4000-a000-00000000af02','00000000-0000-4000-a000-00000000ae12','ORGRUN999999AR01',true);
INSERT INTO pg_temp.org_role_permission
  SELECT 'ORGRUN999999AR01',r.id,p.id,true
  FROM public.ref_org_business_role r CROSS JOIN pg_temp.ref_permission p WHERE r.code='editor';
INSERT INTO pg_temp.user_org_business_role
  SELECT '00000000-0000-4000-a000-00000000af02',id,true FROM public.ref_org_business_role WHERE code='editor';
INSERT INTO pg_temp.app_user_profile(id,role) VALUES
  ('00000000-0000-4000-a000-00000000ae11','super_admin'),
  ('00000000-0000-4000-a000-00000000ae12','super_admin'),
  ('00000000-0000-4000-a000-00000000ae15','tourism_agent');
DO $nonempty$ BEGIN
  ASSERT EXISTS(SELECT 1 FROM pg_temp.object_org_link l JOIN pg_temp.ref_org_role r ON r.id=l.role_id
    WHERE l.object_id='HOTRUN999999AR02' AND l.org_object_id='ORGRUN999999AR01' AND r.code='publisher');
  ASSERT EXISTS(SELECT 1 FROM pg_temp.ref_permission p JOIN pg_temp.user_permission up ON up.permission_id=p.id
    WHERE p.code='counterfeit_authority_permission' AND up.user_id='00000000-0000-4000-a000-00000000ae12' AND up.is_active);
  ASSERT EXISTS(SELECT 1 FROM pg_temp.user_org_membership m
    JOIN pg_temp.user_org_business_role br ON br.membership_id=m.id
    JOIN pg_temp.org_role_permission rp ON rp.org_object_id=m.org_object_id AND rp.role_id=br.role_id
    WHERE m.user_id='00000000-0000-4000-a000-00000000ae12' AND m.is_active AND br.is_active AND rp.is_active);
  ASSERT EXISTS(SELECT 1 FROM pg_temp.app_user_profile WHERE id='00000000-0000-4000-a000-00000000ae11' AND role='super_admin');
END; $nonempty$;
SET LOCAL ROLE authenticated;
DO $counterfeit_writer$
DECLARE n integer;
BEGIN
  ASSERT api.current_user_org_id()='ORGRUN999999AR01', 'Counterfeit membership changed current ORG';
  ASSERT api.user_has_permission('edit_canonical_when_publisher') IS TRUE, 'Real current role grant disappeared';
  ASSERT api.user_has_permission('counterfeit_authority_permission') IS FALSE, 'Counterfeit permission became real';
  ASSERT api.is_platform_superuser() IS FALSE, 'Counterfeit profile supplied platform authority';
  ASSERT api.user_can_write_canonical('HOTRUN999999AR01') IS TRUE;
  ASSERT api.user_can_write_canonical('HOTRUN999999AR02') IS FALSE, 'Counterfeit publisher supplied authority';
  ASSERT EXISTS(SELECT 1 FROM public.object WHERE id='HOTRUN999999AR02');
  UPDATE public.object SET name='Counterfeit publisher intrusion' WHERE id='HOTRUN999999AR02';
  GET DIAGNOSTICS n=ROW_COUNT; ASSERT n=0;
END; $counterfeit_writer$;
RESET ROLE;

SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-00000000ae12","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $counterfeit_stranger$ BEGIN
  ASSERT api.current_user_org_id() IS NULL, 'Counterfeit stranger membership became current';
  ASSERT api.user_has_permission('edit_canonical_when_publisher') IS FALSE;
  ASSERT api.user_has_permission('counterfeit_authority_permission') IS FALSE;
  ASSERT api.is_platform_superuser() IS FALSE;
  ASSERT api.user_can_write_object_canonical('HOTRUN999999AR01') IS FALSE;
END; $counterfeit_stranger$;
RESET ROLE;

-- Revoke real role then real individual exception; fake active grants remain present.
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
UPDATE public.user_org_business_role SET is_active=false
  WHERE membership_id='00000000-0000-4000-a000-00000000ab11';
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-00000000ae11","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $revoked_role$ BEGIN
  ASSERT api.current_user_org_id()='ORGRUN999999AR01';
  ASSERT api.user_has_permission('edit_canonical_when_publisher') IS FALSE;
  ASSERT api.user_can_write_object_canonical('HOTRUN999999AR01') IS FALSE;
END; $revoked_role$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
INSERT INTO public.user_permission(user_id,permission_id,is_active,granted_by)
  SELECT '00000000-0000-4000-a000-00000000ae11',id,true,'00000000-0000-4000-a000-00000000ae15'
  FROM public.ref_permission WHERE code='edit_canonical_when_publisher';
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-00000000ae11","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $current_exception$ BEGIN ASSERT api.user_can_write_canonical('HOTRUN999999AR01') IS TRUE; END; $current_exception$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
UPDATE public.user_permission SET is_active=false WHERE user_id='00000000-0000-4000-a000-00000000ae11';
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-00000000ae11","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $revoked_exception$ BEGIN
  ASSERT api.user_has_permission('edit_canonical_when_publisher') IS FALSE;
  ASSERT api.user_can_write_object_canonical('HOTRUN999999AR01') IS FALSE;
END; $revoked_exception$;
RESET ROLE;

-- Real platform authority succeeds despite a fake lower profile, then fails on demotion.
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-00000000ae15","role":"authenticated","app_metadata":{"role":"super_admin"}}',true);
SET LOCAL ROLE authenticated;
DO $platform_positive$ BEGIN ASSERT api.is_platform_superuser() IS TRUE; END; $platform_positive$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
UPDATE public.app_user_profile SET role='tourism_agent' WHERE id='00000000-0000-4000-a000-00000000ae15';
UPDATE pg_temp.app_user_profile SET role='super_admin' WHERE id='00000000-0000-4000-a000-00000000ae15';
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-00000000ae15","role":"authenticated","app_metadata":{"role":"super_admin"}}',true);
SET LOCAL ROLE authenticated;
DO $platform_revoked$ BEGIN ASSERT api.is_platform_superuser() IS FALSE; END; $platform_revoked$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
UPDATE public.app_user_profile SET role='owner' WHERE id='00000000-0000-4000-a000-00000000ae15';
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-00000000ae15","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $owner_positive$ BEGIN
  ASSERT api.is_platform_superuser() IS TRUE;
  ASSERT api.is_object_owner('HOTRUN999999AR01') IS TRUE;
END; $owner_positive$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
UPDATE public.app_user_profile SET role='tourism_agent' WHERE id='00000000-0000-4000-a000-00000000ae15';
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-00000000ae15","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $owner_revoked$ BEGIN ASSERT api.is_platform_superuser() IS FALSE; END; $owner_revoked$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
DO $service$ BEGIN ASSERT api.is_platform_superuser() IS TRUE; END; $service$;
SELECT set_config('request.jwt.claims','{"role":"admin"}',true);
DO $admin$ BEGIN ASSERT api.is_platform_superuser() IS TRUE; END; $admin$;
SELECT set_config('request.jwt.claims','{}',true);
DO $null_semantics$ BEGIN
  ASSERT api.current_user_org_id() IS NULL;
  ASSERT api.is_platform_superuser() IS NULL;
  ASSERT api.user_has_permission('edit_canonical_when_publisher') IS FALSE;
  ASSERT api.user_can_write_canonical('HOTRUN999999AR01') IS FALSE;
END; $null_semantics$;
DO $postconditions$ BEGIN
  ASSERT (SELECT name FROM public.object WHERE id='HOTRUN999999AR01')='Secure current publisher edit';
  ASSERT (SELECT name FROM public.object WHERE id='HOTRUN999999AR02')='Synthetic private object B';
  ASSERT (SELECT count(*) FROM pg_catalog.pg_proc WHERE oid IN
    ('api.current_user_org_id()'::regprocedure,'api.user_has_permission(text)'::regprocedure,
     'api.is_platform_superuser()'::regprocedure,'api.user_can_write_canonical(text)'::regprocedure)
    AND proconfig=ARRAY['search_path=pg_catalog, public, api, auth, pg_temp']::text[])=4;
  RAISE NOTICE 'Authority sources passed: four functions, malformed/counterfeit sources, current rights and revoked real grants/profiles';
END; $postconditions$;
ROLLBACK;
