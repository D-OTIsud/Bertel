-- Opt-in only. Real serializers/filter engine, service role, all writes rolled back.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout = '120s';
SET LOCAL plpgsql.check_asserts = on;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
CREATE TEMP TABLE membership_function_baseline AS
SELECT oid, pg_get_functiondef(oid) definition FROM pg_proc WHERE oid IN (
  'api.list_partner_objects_with_vocabulary(text,text[],integer,text[],text[],text,text,text,text,text,text[],boolean)'::regprocedure,
  'api.list_partner_selection_objects_with_vocabulary(jsonb,text,text,text,text,text[],integer,text,text,text,text,text[])'::regprocedure,
  'api.get_filtered_object_ids(jsonb,public.object_type[],public.object_status[],text)'::regprocedure
);

DO $test$
DECLARE
  signature text := 'api.list_partner_objects_with_selection_ids(text,text[],integer,text[],text[],text,text,text,text,text,text[],boolean)';
  org_a text := 'ORGRUNMEM0000001'; org_b text := 'ORGRUNMEM0000002';
  first_id text := 'PRDRUNMEM0000001'; second_id text := 'PRDRUNMEM0000002';
  draft_id text := 'PRDRUNMEM0000003'; test_id text := 'PRDRUNMEM0000004';
  bare_id text := 'COMRUNMEM0000001';
  baseline jsonb; enriched jsonb; stripped jsonb; memberships jsonb;
  reader jsonb; expected text[]; actual text[]; ids text[]; cursor_value text;
  branch jsonb; row_record record; format_value text; view_value text;
  rejected boolean; publisher uuid; practice uuid; id_value text;
BEGIN
  ASSERT NOT has_function_privilege('anon', signature, 'EXECUTE');
  ASSERT NOT has_function_privilege('authenticated', signature, 'EXECUTE');
  ASSERT has_function_privilege('service_role', signature, 'EXECUTE');
  ASSERT NOT has_function_privilege('anon', 'internal.partner_selection_memberships(text[])', 'EXECUTE');
  ASSERT NOT has_function_privilege('authenticated', 'internal.partner_selection_memberships(text[])', 'EXECUTE');
  ASSERT (SELECT NOT prosecdef AND provolatile='s' FROM pg_proc WHERE oid=signature::regprocedure),
    'Public membership wrapper must remain STABLE SECURITY INVOKER';
  ASSERT (SELECT NOT prosecdef AND provolatile='s' FROM pg_proc WHERE oid='internal.partner_selection_memberships(text[])'::regprocedure),
    'Membership lookup must reuse existing service privileges without a new definer';

  -- Existing local records must not affect this isolated fixture. Rolled back.
  UPDATE internal.partner_selection SET state='suspended';
  INSERT INTO public.object(id,object_type,name,status) VALUES
    (org_a,'ORG','Membership fixture A','published'),(org_b,'ORG','Membership fixture B','published'),
    (first_id,'PRD','membershipfixture panorama','published'),
    (second_id,'PRD','membershipfixture panoramaa','published'),
    (draft_id,'PRD','membershipfixture draft','draft'),
    (test_id,'PRD','membershipfixture sandbox','published'),
    (bare_id,'COM','membershipfixture unmatched','published'),
    ('ORGRUNMEM0000003','ORG','Membership fixture sandbox','published'),
    ('ITIRUNMEM0000001','ITI','membershipfixture walking','published'),
    ('ITIRUNMEM0000002','ITI','membershipfixture unqualified','published'),
    ('ITIRUNMEM0000003','ITI','membershipfixture cycling','published'),
    ('RESRUNMEM0000001','RES','membershipfixture restaurant one','published'),
    ('RESRUNMEM0000002','RES','membershipfixture restaurant two','published');
  INSERT INTO public.org_config(org_object_id,access_scope,is_test_org)
    VALUES('ORGRUNMEM0000003','own_objects_only',true);
  SELECT id INTO STRICT publisher FROM public.ref_org_role WHERE code='publisher';
  INSERT INTO public.object_org_link(object_id,org_object_id,role_id,is_primary)
    VALUES(test_id,'ORGRUNMEM0000003',publisher,true);
  ASSERT (SELECT is_test FROM public.object WHERE id=test_id), 'Sandbox fixture missing';
  INSERT INTO public.object_location(object_id,code_insee,city,is_main_location) VALUES
    (first_id,'97422','Le Tampon',true),(second_id,'97403','Entre-Deux',true),
    (second_id,'97422','Le Tampon',false);
  INSERT INTO public.object_iti(object_id) SELECT 'ITIRUNMEM' || lpad(n::text,7,'0') FROM generate_series(1,3) n;
  SELECT id INTO STRICT practice FROM public.ref_code_iti_practice WHERE code='randonnee_pedestre';
  INSERT INTO public.object_iti_practice(object_id,practice_id) VALUES('ITIRUNMEM0000001',practice);
  SELECT id INTO STRICT practice FROM public.ref_code_iti_practice WHERE code='velo_vtt';
  INSERT INTO public.object_iti_practice(object_id,practice_id) VALUES('ITIRUNMEM0000003',practice);
  INSERT INTO public.object_taxonomy(object_id,domain,ref_code_id)
    SELECT 'ITIRUNMEM' || lpad(n::text,7,'0'),'taxonomy_iti',r.id
    FROM generate_series(1,3) n JOIN public.ref_code r ON r.domain='taxonomy_iti' AND r.code='hiking';
  INSERT INTO public.object_cuisine_type(object_id,cuisine_type_id)
    SELECT 'RESRUNMEM0000001',id FROM public.ref_code_cuisine_type WHERE code='creole';
  INSERT INTO public.object_capacity(object_id,metric_id,value_integer)
    SELECT 'RESRUNMEM0000001',id,20 FROM public.ref_capacity_metric WHERE code='seats';

  branch := '[{"types":["PRD"],"filters":{"amenities_all":[]},"search":"membershipfixture"},
    {"types":["PRD"],"filters":{"amenities_all":[]},"search":"membershipfixture"}]';
  INSERT INTO internal.partner_selection(id,org_object_id,name,buckets,commune_insee,state) VALUES
    (90000002,org_a,'Duplicated branches',branch,NULL,'active'),
    (9000001,org_b,'Other organization',branch,NULL,'active'),
    (9000003,org_a,'Suspended selection',branch,NULL,'suspended'),
    (9000004,org_a,'Main commune only',branch,ARRAY['97422'],'active'),
    (9000005,org_a,'Walking union','[
      {"types":["ITI"],"filters":{"itinerary":{"practices_any":["randonnee_pedestre"]}},"search":"membershipfixture"},
      {"types":["ITI"],"filters":{"amenities_all":[],"taxonomy_any":[{"domain":"taxonomy_iti","code":"hiking"}]},"search":"membershipfixture","only_without_practices":true}
    ]',NULL,'active'),
    (9000006,org_a,'Global exact search','[{"types":["PRD"],"filters":{"amenities_all":[]},"search":"panorama"}]',NULL,'active'),
    (9000007,org_a,'Nested restaurant criteria','[{"types":["RES"],"filters":{"cuisine_types_any":["creole"],"capacity_filters":[{"code":"seats","min":10}]},"search":"membershipfixture"}]',NULL,'active');

  ids := ARRAY[first_id,second_id,draft_id,test_id,bare_id,'ITIRUNMEM0000001','ITIRUNMEM0000002','ITIRUNMEM0000003',
    'RESRUNMEM0000001','RESRUNMEM0000002'];
  SET LOCAL ROLE service_role;
  memberships := internal.partner_selection_memberships(ids);
  ASSERT memberships->first_id='["90000002","9000001","9000004","9000006"]', 'Membership IDs not sorted strings, unique, active and organization-global';
  ASSERT memberships->second_id='["90000002","9000001"]', 'Main commune or global fuzzy search changed semantics';
  ASSERT NOT (memberships ? draft_id) AND NOT (memberships ? test_id), 'Non-public realm leaked';
  ASSERT NOT (memberships ? bare_id), 'Unmatched object gained a selection';
  ASSERT memberships->'ITIRUNMEM0000001'='["9000005"]' AND memberships->'ITIRUNMEM0000002'='["9000005"]'
    AND NOT (memberships ? 'ITIRUNMEM0000003'), 'Practice/fallback union changed semantics';
  ASSERT memberships->'RESRUNMEM0000001'='["9000007"]' AND NOT (memberships ? 'RESRUNMEM0000002'), 'Nested cuisine/capacity not reused';
  ASSERT NOT (internal.partner_selection_memberships(ARRAY[second_id])->second_id @> '["9000006"]'),
    'Candidate page changed canonical global exact-to-fuzzy gate';
  ASSERT internal.partner_selection_memberships(ARRAY[]::text[])='{}' AND internal.partner_selection_memberships(NULL)='{}';

  RESET ROLE;
  FOR row_record IN SELECT * FROM internal.partner_selection WHERE state='active' LOOP
    SET LOCAL ROLE service_role;
    reader := api.list_partner_selection_objects_with_vocabulary(row_record.buckets,row_record.id::text,
      'membership-test','partner-test',p_page_size=>200,p_commune_insee=>row_record.commune_insee);
    SELECT COALESCE(array_agg(item->>'id' ORDER BY item->>'id'),ARRAY[]::text[]) INTO expected
      FROM jsonb_array_elements(reader->'data') item WHERE item->>'id'=ANY(ids);
    SELECT COALESCE(array_agg(id ORDER BY id),ARRAY[]::text[]) INTO actual
      FROM unnest(ids) id WHERE memberships->id @> jsonb_build_array(row_record.id::text);
    ASSERT actual=expected, 'Membership differs from canonical selection reader';
    RESET ROLE;
  END LOOP;

  SET LOCAL ROLE service_role;
  FOREACH view_value IN ARRAY ARRAY['card','full'] LOOP
    FOREACH format_value IN ARRAY ARRAY['','jsonld','apidae','tourinsoft'] LOOP
      baseline := api.list_partner_objects_with_vocabulary(p_types=>ARRAY['PRD','COM'],p_search=>'membershipfixture',
        p_page_size=>1,p_view=>view_value,p_format=>format_value);
      enriched := api.list_partner_objects_with_selection_ids(p_types=>ARRAY['PRD','COM'],p_search=>'membershipfixture',
        p_page_size=>1,p_view=>view_value,p_format=>format_value);
      SELECT COALESCE(jsonb_agg(item-'selection_ids' ORDER BY ord),'[]'::jsonb) INTO stripped
        FROM jsonb_array_elements(enriched->'data') WITH ORDINALITY payload(item,ord);
      ASSERT jsonb_set(enriched,'{data}',stripped)=baseline, 'Opt-in changed legacy page, metadata, cursor, order or pivot';
      ASSERT jsonb_typeof(enriched#>'{data,0,selection_ids}')='array', 'Missing root selection_ids array';
      cursor_value := COALESCE(baseline#>>'{info,next_cursor}',baseline#>>'{meta,next_cursor}');
      ASSERT cursor_value IS NOT NULL, 'Fixture must exercise real pagination';
      baseline := api.list_partner_objects_with_vocabulary(p_cursor=>cursor_value,p_types=>ARRAY['PRD','COM'],
        p_search=>'membershipfixture',p_page_size=>1,p_view=>view_value,p_format=>format_value);
      enriched := api.list_partner_objects_with_selection_ids(p_cursor=>cursor_value,p_types=>ARRAY['PRD','COM'],
        p_search=>'membershipfixture',p_page_size=>1,p_view=>view_value,p_format=>format_value);
      SELECT COALESCE(jsonb_agg(item-'selection_ids' ORDER BY ord),'[]'::jsonb) INTO stripped
        FROM jsonb_array_elements(enriched->'data') WITH ORDINALITY payload(item,ord);
      ASSERT jsonb_set(enriched,'{data}',stripped)=baseline, 'Opt-in changed cursor continuation';
    END LOOP;
  END LOOP;
  enriched := api.list_partner_objects_with_selection_ids(p_types=>ARRAY['COM'],p_search=>'membershipfixture');
  ASSERT enriched#>'{data,0,selection_ids}'='[]', 'An unmatched object must expose []';
  enriched := api.list_partner_objects_with_selection_ids(p_types=>ARRAY['COM'],p_search=>'noexistingmembershipfixture');
  ASSERT enriched->'data'='[]', 'Empty legacy page was changed';
  rejected := false;
  BEGIN PERFORM internal.partner_selection_memberships(ARRAY(SELECT first_id FROM generate_series(1,201)));
  EXCEPTION WHEN SQLSTATE 'PT503' THEN rejected := true; END;
  ASSERT rejected, 'Unbounded membership page was accepted';
  RESET ROLE;

  -- A corrupt active definition must fail closed, while the legacy reader keeps working.
  INSERT INTO internal.partner_selection(id,org_object_id,name,buckets) VALUES
    (9000008,org_a,'Malformed active selection','[{"types":["PRD"],"filters":{"unknown_criterion":true}}]');
  SET LOCAL ROLE service_role;
  rejected := false;
  BEGIN PERFORM api.list_partner_objects_with_selection_ids(p_types=>ARRAY['PRD'],p_search=>'membershipfixture');
  EXCEPTION WHEN SQLSTATE 'PT503' THEN rejected := true; END;
  ASSERT rejected, 'Broken registry was silently converted to empty memberships';
  baseline := api.list_partner_objects_with_vocabulary(p_types=>ARRAY['PRD'],p_search=>'membershipfixture');
  ASSERT jsonb_array_length(baseline->'data')=2 AND NOT (baseline#>'{data,0}' ? 'selection_ids'),
    'Historical endpoint became coupled to membership availability';
  RESET ROLE;
  ASSERT NOT EXISTS (SELECT 1 FROM membership_function_baseline b WHERE pg_get_functiondef(b.oid)<>b.definition),
    'Historical reader or shared filter engine was modified';
END
$test$;
ROLLBACK;
DO $$ BEGIN RAISE NOTICE 'test_partner_selection_memberships.sql: OK'; END $$;
