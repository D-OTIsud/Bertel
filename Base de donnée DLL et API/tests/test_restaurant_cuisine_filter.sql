-- Complete-catalog local/CI regression. No menus; every fixture rolls back.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout='120s';
SET LOCAL plpgsql.check_asserts=on;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
DO $test$
DECLARE result_ids text[]; first_page jsonb; page jsonb; cursor_value text; ids text[] := '{}';
  baseline text[]; empty_result text[]; filters jsonb; rejected boolean; publisher uuid; iterations integer:=0;
BEGIN
  INSERT INTO public.object(id,object_type,name,status) VALUES
    ('RESRUNCUI0000001','RES','cuisinefilterfixture créole','published'),
    ('RESRUNCUI0000002','RES','cuisinefilterfixture indienne','published'),
    ('RESRUNCUI0000003','RES','cuisinefilterfixture mixte','published'),
    ('RESRUNCUI0000004','RES','cuisinefilterfixture sans cuisine','published'),
    ('RESRUNCUI0000005','RES','cuisinefilterfixture brouillon','draft'),
    ('RESRUNCUI0000006','RES','cuisinefilterfixture test','published'),
    ('ACTRUNCUI0000007','ACT','cuisinefilterfixture activité','published'),
    ('ORGRUNCUI0000008','ORG','cuisinefilterfixture org test','published');
  INSERT INTO public.org_config(org_object_id,access_scope,is_test_org)
    VALUES('ORGRUNCUI0000008','own_objects_only',true);
  SELECT id INTO STRICT publisher FROM public.ref_org_role WHERE code='publisher';
  INSERT INTO public.object_org_link(object_id,org_object_id,role_id,is_primary)
    VALUES('RESRUNCUI0000006','ORGRUNCUI0000008',publisher,true);
  ASSERT (SELECT is_test FROM public.object WHERE id='RESRUNCUI0000006'), 'Test fixture realm not established';
  INSERT INTO public.object_cuisine_type(object_id,cuisine_type_id)
  SELECT fixture.id,code.id FROM (VALUES
    ('RESRUNCUI0000001','creole'),('RESRUNCUI0000002','indian'),
    ('RESRUNCUI0000003','creole'),('RESRUNCUI0000003','indian'),
    ('RESRUNCUI0000005','creole'),('RESRUNCUI0000006','creole'),
    ('ACTRUNCUI0000007','creole')) fixture(id,cuisine)
    JOIN public.ref_code_cuisine_type code ON code.code=fixture.cuisine;
  INSERT INTO public.object_capacity(object_id,metric_id,value_integer)
    SELECT fixture.id,metric.id,fixture.seats FROM (VALUES('RESRUNCUI0000001',50),('RESRUNCUI0000002',20),
      ('RESRUNCUI0000003',80)) fixture(id,seats) JOIN public.ref_capacity_metric metric ON metric.code='seats';
  ASSERT NOT EXISTS (SELECT 1 FROM public.object_menu WHERE object_id LIKE 'RESRUNCUI%'), 'Fixture unexpectedly has a menu';
  SET LOCAL ROLE service_role;
  SELECT array_agg(object_id ORDER BY object_id) INTO result_ids FROM api.get_filtered_object_ids(
    '{"cuisine_types_any":["creole","indian"]}',ARRAY['RES']::public.object_type[],
    ARRAY['published']::public.object_status[],'cuisinefilterfixture');
  ASSERT result_ids=ARRAY['RESRUNCUI0000001','RESRUNCUI0000002','RESRUNCUI0000003'], 'Cuisine OR, deduplication or public realm failed';
  SELECT array_agg(object_id ORDER BY object_id) INTO result_ids FROM api.get_filtered_object_ids(
    '{"cuisine_types_any":["creole","indian"],"capacity_filters":[{"code":"seats","min":60}]}',
    ARRAY['RES']::public.object_type[],ARRAY['published']::public.object_status[],'cuisinefilterfixture');
  ASSERT result_ids=ARRAY['RESRUNCUI0000003'], 'Cuisine must AND with capacity';
  ASSERT NOT EXISTS (SELECT 1 FROM api.get_filtered_object_ids('{"cuisine_types_any":["creole"]}',
    ARRAY['ACT']::public.object_type[],ARRAY['published']::public.object_status[],'cuisinefilterfixture')), 'Cuisine must only constrain restaurants';
  SELECT array_agg(object_id ORDER BY object_id) INTO baseline FROM api.get_filtered_object_ids(
    '{"amenities_all":[]}',ARRAY['RES']::public.object_type[],ARRAY['published']::public.object_status[],'cuisinefilterfixture');
  SELECT array_agg(object_id ORDER BY object_id) INTO empty_result FROM api.get_filtered_object_ids(
    '{"amenities_all":[],"cuisine_types_any":[]}',ARRAY['RES']::public.object_type[],ARRAY['published']::public.object_status[],'cuisinefilterfixture');
  ASSERT baseline IS NOT DISTINCT FROM empty_result, 'An empty cuisine selection must not constrain results';
  -- Partner keyset pagination uses the exact same engine before page slicing.
  LOOP
    page := api.list_partner_selection_objects_with_vocabulary(
      '[{"types":["RES"],"filters":{"cuisine_types_any":["creole","indian"]},"search":"cuisinefilterfixture"}]',
      'cuisine-test','cuisine-test-v1','test-partner',p_cursor=>cursor_value,p_page_size=>1);
    ids:=ids||ARRAY(SELECT item->>'id' FROM jsonb_array_elements(page->'data') item);
    ASSERT (page#>>'{meta,total}')::integer=3, 'Partner total must include all cuisine matches';
    cursor_value:=page#>>'{meta,next_cursor}'; iterations:=iterations+1;
    EXIT WHEN cursor_value IS NULL;
    ASSERT iterations<4, 'Partner cuisine cursor did not terminate';
  END LOOP;
  ASSERT ids=ARRAY['RESRUNCUI0000001','RESRUNCUI0000002','RESRUNCUI0000003'], 'Cuisine pagination lost or duplicated members';
  FOREACH filters IN ARRAY ARRAY[
    '{"cuisine_types_any":["unknown_cuisine"]}'::jsonb,
    '{"cuisine_types_any":["creole","unknown_cuisine"]}'::jsonb,
    '{"cuisine_types_any":"creole"}'::jsonb,
    '{"cuisine_types_any":[null]}'::jsonb,
    '{"cuisine_types_any":[1]}'::jsonb] LOOP
    rejected:=false;
    BEGIN
      PERFORM * FROM api.get_filtered_object_ids(filters,ARRAY['RES']::public.object_type[],ARRAY['published']::public.object_status[],NULL);
    EXCEPTION WHEN SQLSTATE 'PT400' THEN rejected:=true;
    END;
    ASSERT rejected, 'Malformed or unknown cuisine must fail closed';
  END LOOP;
END;
$test$;
ROLLBACK;
