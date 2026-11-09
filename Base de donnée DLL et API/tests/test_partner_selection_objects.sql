-- Run after the complete manifest. Fixtures and every write roll back.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout = '120s';
SET LOCAL plpgsql.check_asserts = on;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

DO $selection_test$
DECLARE
  function_signature text := 'api.list_partner_selection_objects_with_vocabulary(jsonb,text,text,text,text,text[],integer,text,text,text,text,text[])';
  buckets jsonb := '[
    {"types":["PRD"],"filters":{"amenities_all":[]},"search":"partnerselectionfixture"},
    {"types":["COM"],"filters":{"amenities_all":[]},"search":"partnerselectionfixture"},
    {"types":["PRD"],"filters":{"amenities_all":[]},"search":"partnerselectionfixture"}
  ]';
  first_page jsonb;
  last_page jsonb;
  page jsonb;
  direct jsonb;
  cursor_value text;
  actual_ids text[];
  main_id text := 'PRDRUNSEL0000001';
  test_id text := 'PRDRUNSEL9999998';
  draft_id text := 'PRDRUNSEL9999999';
  test_org text := 'ORGRUNSEL9999998';
  practice_id uuid;
  publisher_id uuid;
BEGIN
  ASSERT NOT has_function_privilege('anon', function_signature, 'EXECUTE'), 'Anonymous selection RPC access';
  ASSERT NOT has_function_privilege('authenticated', function_signature, 'EXECUTE'), 'Application selection RPC access';
  ASSERT has_function_privilege('service_role', function_signature, 'EXECUTE'), 'Partner server cannot execute selection RPC';
  ASSERT (SELECT NOT prosecdef AND provolatile = 's' FROM pg_proc WHERE oid = function_signature::regprocedure),
    'Selection reader must stay STABLE SECURITY INVOKER';

  -- Empty amenities_all deliberately uses the live reader without restricting
  -- amenities. No materialized-view refresh is needed for these fixtures.
  INSERT INTO public.object(id, object_type, name, status)
  SELECT 'PRDRUNSEL' || lpad(n::text, 7, '0'), 'PRD',
    'partnerselectionfixture producer ' || n, 'published'
  FROM generate_series(1, 201) n;
  INSERT INTO public.object(id, object_type, name, status) VALUES
    ('COMRUNSEL0000001', 'COM', 'partnerselectionfixture artisan one', 'published'),
    ('COMRUNSEL0000002', 'COM', 'partnerselectionfixture artisan two', 'published'),
    (draft_id, 'PRD', 'partnerselectionfixture draft', 'draft'),
    (test_id, 'PRD', 'partnerselectionfixture test', 'published'),
    (test_org, 'ORG', 'Partner selection fixture sandbox', 'published'),
    ('ITIRUNSEL0000001', 'ITI', 'partnerselectionfixture walking', 'published'),
    ('ITIRUNSEL0000002', 'ITI', 'partnerselectionfixture unqualified', 'published'),
    ('ITIRUNSEL0000003', 'ITI', 'partnerselectionfixture cycling with walking taxonomy', 'published'),
    ('ITIRUNSEL0000004', 'ITI', 'partnerselectionfixture cycling fallback', 'published'),
    ('ITIRUNSEL0000005', 'ITI', 'partnerselectionfixture scenic drive', 'published');
  INSERT INTO public.org_config(org_object_id, access_scope, is_test_org)
  VALUES(test_org, 'own_objects_only', true);
  SELECT id INTO STRICT publisher_id FROM public.ref_org_role WHERE code = 'publisher';
  INSERT INTO public.object_org_link(object_id, org_object_id, role_id, is_primary)
  VALUES(test_id, test_org, publisher_id, true);
  ASSERT (SELECT is_test FROM public.object WHERE id = test_id), 'Test fixture did not enter sandbox';

  INSERT INTO public.object_location(object_id, code_insee, city, is_main_location) VALUES
    (main_id, '97422', 'Le Tampon', true),
    ('COMRUNSEL0000001', '97403', 'Entre-Deux', true);
  SELECT id INTO STRICT practice_id FROM public.ref_code_iti_practice WHERE code = 'randonnee_pedestre';
  INSERT INTO public.object_iti(object_id)
  SELECT 'ITIRUNSEL' || lpad(n::text, 7, '0') FROM generate_series(1, 5) n;
  INSERT INTO public.object_iti_practice(object_id, practice_id)
  VALUES('ITIRUNSEL0000001', practice_id);
  SELECT id INTO STRICT practice_id FROM public.ref_code_iti_practice WHERE code = 'velo_vtt';
  INSERT INTO public.object_iti_practice(object_id, practice_id)
  VALUES('ITIRUNSEL0000003', practice_id);
  INSERT INTO public.object_taxonomy(object_id, domain, ref_code_id)
  SELECT fixture.id, 'taxonomy_iti', code.id
  FROM (VALUES
    ('ITIRUNSEL0000001', 'hiking'), ('ITIRUNSEL0000002', 'hiking'),
    ('ITIRUNSEL0000003', 'hiking'), ('ITIRUNSEL0000004', 'mountain_biking'),
    ('ITIRUNSEL0000005', 'scenic_drive')
  ) fixture(id, taxonomy_code)
  JOIN public.ref_code code ON code.domain = 'taxonomy_iti' AND code.code = fixture.taxonomy_code;

  -- Exercise the real partner database role, not merely postgres privileges.
  SET LOCAL ROLE service_role;
  first_page := api.list_partner_selection_objects_with_vocabulary(
    buckets, 'terroir-fixture', 'definition-1', 'partner-one', p_page_size => 200
  );
  ASSERT (first_page#>>'{meta,total}')::integer = 203, 'Union was truncated or includes drafts/test objects';
  ASSERT jsonb_array_length(first_page->'data') = 200, 'First page must contain 200 of 203 members';
  ASSERT first_page#>>'{meta,selection_id}' = 'terroir-fixture', 'Selection metadata missing';
  ASSERT (first_page->'meta') ? 'vocabulary_release', 'Vocabulary generation omitted';
  cursor_value := first_page#>>'{meta,next_cursor}';
  ASSERT cursor_value IS NOT NULL, 'Union pagination stopped at the UI 200 ceiling';
  last_page := api.list_partner_selection_objects_with_vocabulary(
    buckets, 'terroir-fixture', 'definition-1', 'partner-one',
    p_cursor => cursor_value, p_page_size => 200
  );
  ASSERT jsonb_array_length(last_page->'data') = 3, 'Second page lost union members';
  ASSERT last_page#>>'{meta,next_cursor}' IS NULL, 'Final page emits another cursor';
  SELECT array_agg(item->>'id' ORDER BY item->>'id') INTO actual_ids
  FROM jsonb_array_elements((first_page->'data') || (last_page->'data')) item;
  ASSERT cardinality(actual_ids) = 203
    AND (SELECT count(DISTINCT id) FROM unnest(actual_ids) id) = 203, 'Duplicate bucket duplicated members';
  ASSERT NOT actual_ids && ARRAY[draft_id, test_id], 'Unpublished or test fixture leaked';

  page := api.list_partner_selection_objects_with_vocabulary(
    buckets, 'terroir-fixture', 'definition-1', 'partner-one', p_commune_insee => ARRAY['97422']
  );
  ASSERT (page#>>'{meta,total}')::integer = 1 AND page#>>'{data,0,id}' = main_id,
    'Canonical main-location INSEE restriction failed';
  page := api.list_partner_selection_objects_with_vocabulary(
    buckets, 'terroir-fixture', 'definition-1', 'partner-one', p_commune_insee => ARRAY[]::text[]
  );
  ASSERT page->'data' = '[]'::jsonb AND (page#>>'{meta,total}')::integer = 0,
    'Explicit empty commune restriction widened selection';
  page := api.list_partner_selection_objects_with_vocabulary(
    '[]', 'empty-fixture', 'definition-1', 'partner-one'
  );
  ASSERT page->'data' = '[]'::jsonb AND page#>>'{meta,next_cursor}' IS NULL
    AND (page#>>'{meta,total}')::integer = 0, 'Empty selection is not a successful empty page';

  page := api.list_partner_selection_objects_with_vocabulary(
    '[{"types":["ITI"],"filters":{"amenities_all":[],"taxonomy_any":[{"domain":"taxonomy_iti","code":"hiking"}]},"search":"partnerselectionfixture","only_without_practices":true}]',
    'walking-fallback', 'definition-1', 'partner-one'
  );
  ASSERT (page#>>'{meta,total}')::integer = 1 AND page#>>'{data,0,id}' = 'ITIRUNSEL0000002',
    'Fallback must apply only to itineraries without a declared practice';
  page := api.list_partner_selection_objects_with_vocabulary(
    '[{"types":["ITI"],"filters":{"itinerary":{"practices_any":["randonnee_pedestre"]}},"search":"partnerselectionfixture"}]',
    'walking-practice', 'definition-1', 'partner-one'
  );
  ASSERT (page#>>'{meta,total}')::integer = 1 AND page#>>'{data,0,id}' = 'ITIRUNSEL0000001',
    'Practice criterion included an unqualified or cycling itinerary';
  page := api.list_partner_selection_objects_with_vocabulary(
    '[
      {"types":["ITI"],"filters":{"itinerary":{"practices_any":["randonnee_pedestre"]}},"search":"partnerselectionfixture"},
      {"types":["ITI"],"filters":{"amenities_all":[],"taxonomy_any":[{"domain":"taxonomy_iti","code":"hiking"}]},"search":"partnerselectionfixture","only_without_practices":true}
    ]', 'walking-complete', 'definition-1', 'partner-one'
  );
  SELECT array_agg(item->>'id' ORDER BY item->>'id') INTO actual_ids
  FROM jsonb_array_elements(page->'data') item;
  ASSERT actual_ids = ARRAY['ITIRUNSEL0000001', 'ITIRUNSEL0000002'],
    'Walking union included a contrary practice or an unrelated taxonomy';

  page := api.list_partner_selection_objects_with_vocabulary(
    buckets, 'terroir-fixture', 'definition-1', 'partner-one', p_view => 'full',
    p_format => 'jsonld', p_commune_insee => ARRAY['97422']
  );
  direct := api.get_object_resource(main_id, ARRAY['fr'], 'none', '{}'::jsonb)::jsonb
    - 'canonical_description' - 'org_description';
  ASSERT (page#>'{data,0}') - 'jsonld' = direct, 'Full selection serialization differs from the public resource';
  ASSERT NOT ((page#>'{data,0}') ? 'canonical_description')
    AND NOT ((page#>'{data,0}') ? 'org_description'), 'Editor translation legs leaked';
  direct := api.get_objects_interop_batch(ARRAY[main_id], 'jsonld')::jsonb;
  ASSERT page#>'{data,0,jsonld}' IS NOT DISTINCT FROM direct->main_id, 'Selection lost the public pivot';

  BEGIN
    PERFORM api.list_partner_selection_objects_with_vocabulary(
      buckets, 'another-selection', 'definition-1', 'partner-one', p_cursor => cursor_value, p_page_size => 200);
    RAISE EXCEPTION 'Cursor crossed selection';
  EXCEPTION WHEN SQLSTATE 'PT400' THEN NULL; END;
  BEGIN
    PERFORM api.list_partner_selection_objects_with_vocabulary(
      buckets, 'terroir-fixture', 'definition-2', 'partner-one', p_cursor => cursor_value, p_page_size => 200);
    RAISE EXCEPTION 'Cursor crossed definition';
  EXCEPTION WHEN SQLSTATE 'PT400' THEN NULL; END;
  BEGIN
    PERFORM api.list_partner_selection_objects_with_vocabulary(
      buckets, 'terroir-fixture', 'definition-1', 'partner-two', p_cursor => cursor_value, p_page_size => 200);
    RAISE EXCEPTION 'Cursor crossed partner';
  EXCEPTION WHEN SQLSTATE 'PT400' THEN NULL; END;
  BEGIN
    PERFORM api.list_partner_selection_objects_with_vocabulary(
      buckets, 'terroir-fixture', 'definition-1', 'partner-one', p_cursor => cursor_value, p_page_size => 200,
      p_commune_insee => ARRAY['97422']);
    RAISE EXCEPTION 'Cursor crossed commune scope';
  EXCEPTION WHEN SQLSTATE 'PT400' THEN NULL; END;
  BEGIN
    PERFORM api.list_partner_selection_objects_with_vocabulary(
      buckets, 'terroir-fixture', 'definition-1', 'partner-one', p_cursor => 'invalid-base64');
    RAISE EXCEPTION 'Malformed cursor accepted';
  EXCEPTION WHEN SQLSTATE 'PT400' THEN NULL; END;
  BEGIN
    PERFORM api.list_partner_selection_objects_with_vocabulary(
      '[{"filters":{}}]', 'bad-fixture', 'definition-1', 'partner-one');
    RAISE EXCEPTION 'Missing bucket types widened the selection';
  EXCEPTION WHEN SQLSTATE 'PT400' THEN NULL; END;
  RESET ROLE;
  RAISE NOTICE 'Partner selection union, visibility, INSEE, practices, paging, serialization and grants passed.';
END
$selection_test$;
ROLLBACK;
