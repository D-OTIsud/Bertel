-- Disposable cross-corpus links make the realm check independently observable.
\set ON_ERROR_STOP on
BEGIN;
\ir fixtures/object_current_rights.sql

DO $test$
DECLARE
  prod_user constant uuid := '00000000-0000-4000-a000-00000000ae12';
  test_user constant uuid := '00000000-0000-4000-a000-00000000ae16';
  admin_user constant uuid := '00000000-0000-4000-a000-00000000ae15';
  prod_org constant text := 'ORGRUN999999AR02';
  test_org constant text := 'ORGRUN999999AR03';
  prod_object constant text := 'HOTRUN999999AR03';
  test_object constant text := 'HOTRUN999999AR05';
  permission_code constant text := 'edit_org_enrichment';
  caller record;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM pg_temp.setup_current_rights_fixture();
  INSERT INTO auth.users(id,email) VALUES(test_user,'current-rights-enrichment@example.invalid');
  INSERT INTO public.app_user_profile(id,role) VALUES(test_user,'tourism_agent')
    ON CONFLICT(id) DO UPDATE SET role=EXCLUDED.role;
  INSERT INTO public.user_org_membership(user_id,org_object_id,is_active)
    VALUES(prod_user,prod_org,true),(test_user,test_org,true);
  INSERT INTO public.user_permission(user_id,permission_id,is_active,granted_by)
    SELECT u.id,p.id,true,admin_user
    FROM unnest(ARRAY[prod_user,test_user]) u(id)
    CROSS JOIN public.ref_permission p WHERE p.code=permission_code;
  INSERT INTO public.object_org_link(object_id,org_object_id,role_id,is_primary)
    SELECT l.object_id,l.org_id,r.id,false
    FROM (VALUES(prod_object,prod_org),(test_object,prod_org),(prod_object,test_org)) l(object_id,org_id)
    CROSS JOIN public.ref_org_role r WHERE r.code='contributor';
  ASSERT (SELECT count(*) FROM public.object_org_link l
    JOIN public.ref_org_role r ON r.id=l.role_id
    WHERE l.object_id IN (prod_object,test_object) AND l.org_object_id IN (prod_org,test_org)
      AND r.code IN ('publisher','contributor')) = 4, 'The four eligible ORG links must exist';
  ASSERT (SELECT o.is_test IS FALSE FROM public.object o WHERE o.id=prod_object)
    AND (SELECT o.is_test IS TRUE FROM public.object o WHERE o.id=test_object),
    'Non-primary links must leave both fixture realms intact';

  FOR caller IN SELECT * FROM (VALUES
    (prod_user,prod_org,false,prod_object,test_object),
    (test_user,test_org,true,test_object,prod_object)
  ) v(uid,org_id,is_test,own_object,foreign_object) LOOP
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',caller.uid,'role','authenticated')::text,true);
    PERFORM set_config('request.jwt.claim.sub',caller.uid::text,true);
    PERFORM set_config('request.jwt.claim.role','authenticated',true);
    SET LOCAL ROLE authenticated;
    ASSERT api.current_user_org_id() IS NOT DISTINCT FROM caller.org_id;
    ASSERT api.current_user_test_realm() IS NOT DISTINCT FROM caller.is_test;
    ASSERT api.user_has_permission(permission_code) IS TRUE;
    ASSERT api.user_can_write_enrichment(caller.own_object) IS TRUE, 'Legitimate same-realm enrichment is missing';
    ASSERT api.user_can_write_enrichment(caller.foreign_object) IS FALSE, 'An otherwise eligible link crossed realms';
    RESET ROLE;
  END LOOP;

  PERFORM set_config('request.jwt.claims','{"role":"authenticated"}',true);
  PERFORM set_config('request.jwt.claim.sub','',true);
  SET LOCAL ROLE authenticated;
  ASSERT auth.uid() IS NULL AND api.current_user_org_id() IS NULL;
  ASSERT api.user_can_write_enrichment(prod_object) IS FALSE
    AND api.user_can_write_enrichment(test_object) IS FALSE, 'Missing identity permitted enrichment';
  RESET ROLE;
END;
$test$;
ROLLBACK;
