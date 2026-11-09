\set ON_ERROR_STOP on
BEGIN;
SET LOCAL plpgsql.check_asserts=on;
SET LOCAL statement_timeout='60s';
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
CREATE TEMP TABLE selection_serializer_fixture(buckets jsonb);
\if :{?serialized_buckets}
INSERT INTO selection_serializer_fixture VALUES (:'serialized_buckets'::jsonb);
\else
INSERT INTO selection_serializer_fixture VALUES ('[{"types":["RES"],"filters":{"pet_accepted":true,"capacity_filters":[{"code":"seats","min":6}],"cuisine_types_any":["creole"]}}]');
\endif
GRANT SELECT ON selection_serializer_fixture TO authenticated;
-- Borrow the existing publisher identity only for the inactive reference
-- fixture. Role membership and table grants roll back with the entire test;
-- governed source triggers stay enabled throughout.
DO $publisher_fixture_membership$
BEGIN
  EXECUTE format('GRANT bertel_thesaurus_publisher TO %I WITH INHERIT FALSE, SET TRUE',current_user);
END;
$publisher_fixture_membership$;
GRANT SELECT,UPDATE ON public.ref_code_cuisine_type TO bertel_thesaurus_publisher;
DO $test$
DECLARE
  org_a text:='ORGRUN9999980801'; org_b text:='ORGRUN9999980802';
  user_a uuid:='00000000-0000-4000-a000-000000008801';
  user_b uuid:='00000000-0000-4000-a000-000000008802';
  super_id uuid:='00000000-0000-4000-a000-000000008803';
  member_a uuid; member_b uuid; admin_role uuid; editor_role uuid;
  payload jsonb; changed jsonb; sid text; denied boolean; bad jsonb; serialized jsonb;
  buckets jsonb:='[{"types":["PRD"],"filters":{"amenities_all":[]},"search":"selectionregistrysmoke"}]';
BEGIN
  ASSERT (SELECT relrowsecurity FROM pg_class WHERE oid='internal.partner_selection'::regclass);
  ASSERT NOT has_table_privilege('authenticated','internal.partner_selection','SELECT');
  ASSERT NOT has_function_privilege('authenticated','api.get_active_partner_selection_definition(text)','EXECUTE');
  ASSERT NOT has_function_privilege('anon','api.create_partner_selection(text,jsonb,text,jsonb,text[])','EXECUTE');
  ASSERT NOT has_function_privilege('authenticated','api.seed_beta_partner_selections(text)','EXECUTE');
  ASSERT (SELECT count(*) FROM pg_constraint WHERE conrelid='internal.partner_selection'::regclass
    AND confrelid='auth.users'::regclass AND confdeltype='n')=2,'Author references must become NULL on account deletion';
  INSERT INTO public.object(id,object_type,name,status) VALUES(org_a,'ORG','Selection smoke A','published'),(org_b,'ORG','Selection smoke B','published');
  INSERT INTO public.object(id,object_type,name,status) VALUES
    ('PRDRUN9999980801','PRD','selectionregistrysmoke one','published'),
    ('PRDRUN9999980802','PRD','selectionregistrysmoke two','published'),
    ('PRDRUN9999980803','PRD','selectionregistrysmoke draft','draft');
  INSERT INTO auth.users(id,email) VALUES(user_a,'selection-admin-a@test.invalid'),(user_b,'selection-admin-b@test.invalid'),(super_id,'selection-super@test.invalid');
  INSERT INTO public.app_user_profile(id,role) VALUES(user_a,'tourism_agent'),(user_b,'tourism_agent'),(super_id,'super_admin')
    ON CONFLICT(id) DO UPDATE SET role=EXCLUDED.role;
  SELECT id INTO STRICT admin_role FROM public.ref_org_admin_role WHERE code='org_admin';
  SELECT id INTO STRICT editor_role FROM public.ref_org_business_role WHERE code='editor';
  INSERT INTO public.user_org_membership(user_id,org_object_id,is_active) VALUES(user_a,org_a,true) RETURNING id INTO member_a;
  INSERT INTO public.user_org_membership(user_id,org_object_id,is_active) VALUES(user_b,org_b,true) RETURNING id INTO member_b;
  INSERT INTO public.user_org_business_role(membership_id,role_id,is_active) VALUES(member_a,editor_role,true),(member_b,editor_role,true);
  INSERT INTO public.user_org_admin_role(membership_id,role_id,is_active) VALUES(member_a,admin_role,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',user_b)::text,true);
  SET LOCAL ROLE authenticated;
  denied:=false;
  BEGIN PERFORM api.create_partner_selection('Denied',buckets,org_b); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  ASSERT denied,'Editor gained selection management';
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',user_a)::text,true);
  payload:=api.create_partner_selection('Saved selection',buckets,org_a,'{"selectedBuckets":["PRD"]}',NULL);
  sid:=payload->>'id';
  ASSERT payload->>'org_object_id'=org_a AND payload->>'revision'='1';
  ASSERT jsonb_array_length(api.list_partner_selections(org_a))=1;
  ASSERT api.prepare_partner_selection_preview(buckets,org_a)->>'id'='preview';
  SELECT f.buckets INTO serialized FROM selection_serializer_fixture f;
  payload:=api.create_partner_selection('Actual Explorer serializer',serialized,org_a);
  ASSERT payload->'buckets'=serialized,'Serializer criteria were dropped or rebuilt';
  FOR bad IN SELECT value FROM jsonb_array_elements('[
    {"status":["draft"]}, {"statuses":["published"]}, {"missing_essentials_any":["photo"]},
    {"misspelled_filter":true}, {"itinerary":{"practices_any":"velo_vtt"}},
    {"itinerary":{"unknown":true}}, {"capacity_filters":[{"metric":"seats","op":"gte","value":6}]},
    {"event":{"from":"2026-02-31"}}, {"pet_accepted":"true"}, {"open_now":false},
    {"cuisine_types_any":["unknown_cuisine"]}, {"cuisine_types_any":["creole","unknown_cuisine"]}
  ]'::jsonb) LOOP
    denied:=false;
    BEGIN
      PERFORM api.prepare_partner_selection_preview(jsonb_build_array(jsonb_build_object('types',jsonb_build_array('RES'),'filters',bad)),org_a);
    EXCEPTION WHEN SQLSTATE 'PT400' THEN denied:=true; END;
    ASSERT denied,'Unsupported or malformed public criterion was accepted';
  END LOOP;
  denied:=false;
  BEGIN
    PERFORM api.create_partner_selection('Wrong cuisine applicability',
      '[{"types":["ACT"],"filters":{"cuisine_types_any":["creole"]}}]',org_a);
  EXCEPTION WHEN SQLSTATE 'PT400' THEN denied:=true; END;
  ASSERT denied,'Cuisine was accepted on a non-restaurant branch';
  RESET ROLE;
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  SET LOCAL ROLE bertel_thesaurus_publisher;
  UPDATE public.ref_code_cuisine_type SET is_active=false WHERE code='creole';
  ASSERT EXISTS(SELECT 1 FROM public.ref_code_cuisine_type WHERE code='creole' AND NOT is_active),'Inactive reference fixture was not applied';
  RESET ROLE;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',user_a)::text,true);
  SET LOCAL ROLE authenticated;
  denied:=false;
  BEGIN
    PERFORM api.create_partner_selection('Inactive cuisine',
      '[{"types":["RES"],"filters":{"cuisine_types_any":["creole"]}}]',org_a);
  EXCEPTION WHEN SQLSTATE 'PT400' THEN denied:=true; END;
  ASSERT denied,'Inactive cuisine was saved';
  denied:=false;
  BEGIN
    PERFORM api.prepare_partner_selection_preview(
      '[{"types":["RES"],"filters":{"cuisine_types_any":["creole"]}}]',org_a);
  EXCEPTION WHEN SQLSTATE 'PT400' THEN denied:=true; END;
  ASSERT denied,'Inactive cuisine was previewed';
  RESET ROLE;
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  SET LOCAL ROLE bertel_thesaurus_publisher;
  UPDATE public.ref_code_cuisine_type SET is_active=true WHERE code='creole';
  RESET ROLE;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',user_a)::text,true);
  SET LOCAL ROLE authenticated;
  denied:=false;
  BEGIN PERFORM api.list_partner_selections(org_b); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  ASSERT denied,'Admin crossed organization boundary';
  changed:=api.update_partner_selection(sid,1,'Renamed',buckets,NULL,NULL);
  ASSERT changed->>'id'=sid AND changed->>'revision'='2';
  denied:=false;
  BEGIN PERFORM api.update_partner_selection(sid,1,'Stale',buckets); EXCEPTION WHEN SQLSTATE 'PT409' THEN denied:=true; END;
  ASSERT denied,'Stale update accepted';
  changed:=api.set_partner_selection_state(sid,2,'suspended');
  ASSERT changed->>'revision'='3';
  RESET ROLE;
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  SET LOCAL ROLE service_role;
  ASSERT api.get_active_partner_selection_definition(sid) IS NULL,'Suspended definition still visible';
  ASSERT api.get_active_partner_selection_definition('unknown') IS NULL,'Unknown selection widened';
  RESET ROLE;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',super_id)::text,true);
  SET LOCAL ROLE authenticated;
  changed:=api.set_partner_selection_state(sid,3,'active');
  ASSERT changed->>'id'=sid AND changed->>'revision'='4';
  ASSERT api.prepare_partner_selection_preview(buckets,org_b)->>'org_object_id'=org_b;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  SET LOCAL ROLE service_role;
  payload:=api.get_active_partner_selection_definition(sid);
  ASSERT payload->>'name'='Renamed' AND payload->>'revision'='4';
  changed:=api.list_partner_selection_objects_with_vocabulary(
    payload->'buckets',sid,'definition-before','registry-service-test',p_view=>'card');
  ASSERT changed#>>'{meta,total}'='2','Stored selection did not resolve both published members or leaked draft';
  RESET ROLE;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',user_a)::text,true);
  SET LOCAL ROLE authenticated;
  changed:=api.update_partner_selection(sid,4,'Narrowed',
    '[{"types":["PRD"],"filters":{"amenities_all":[]},"search":"selectionregistrysmoke one"}]');
  ASSERT changed->>'id'=sid AND changed->>'revision'='5';
  RESET ROLE;
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  SET LOCAL ROLE service_role;
  payload:=api.get_active_partner_selection_definition(sid);
  changed:=api.list_partner_selection_objects_with_vocabulary(
    payload->'buckets',sid,'definition-after','registry-service-test',p_view=>'card');
  ASSERT changed#>>'{meta,total}'='1','Updated stored criteria were not used by the public reader';
  RESET ROLE;
END;
$test$;
ROLLBACK;
\echo 'Selection registry transactional smoke passed; fixtures rolled back.'
