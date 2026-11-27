-- Run against the full local/fresh-apply catalogue after the partial-name patch.
-- Real filter/card/marker functions and real read-scope/realm helpers are used.
-- Both JWT claims and SET ROLE matter: a database-owner-only test could hide leaks.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout = '90s';
SET LOCAL lock_timeout = '5s';
SET LOCAL plpgsql.check_asserts = on;

DO $partial_names$
DECLARE
  v_org text := 'ORGRUN999999PN01';
  v_foreign_org text := 'ORGRUN999999PN02';
  v_test_org text := 'ORGRUN999999PN03';
  v_pub text := 'HLORUN999999PN01';
  v_draft text := 'HLORUN999999PN02';
  v_hidden text := 'HLORUN999999PN03';
  v_archived text := 'HLORUN999999PN04';
  v_foreign text := 'HLORUN999999PN05';
  v_test text := 'HLORUN999999PN06';
  v_noise text := 'HLORUN999999PN07';
  v_literal text := 'HLORUN999999PN08';
  v_impostor text := 'HLORUN999999PN09';
  v_member uuid := '00000000-0000-4000-a000-00000000fa71';
  v_other_member uuid := '00000000-0000-4000-a000-00000000fa72';
  v_test_member uuid := '00000000-0000-4000-a000-00000000fa73';
  v_publisher uuid;
  v_all object_status[] := ARRAY['published','draft','hidden','archived']::object_status[];
  v_types object_type[] := ARRAY['HLO']::object_type[];
  v_filters jsonb := '{"search_mode":"global","city_any":["Partial Name PN27"]}';
  v_own text[];
  v_fixtures text[];
  v_ids text[];
  v_term text;
  v_name_score real;
  v_noise_score real;
  v_page jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SELECT id INTO STRICT v_publisher FROM public.ref_org_role WHERE code = 'publisher';
  INSERT INTO auth.users(id,email) VALUES
    (v_member, 'partial-name-member@example.invalid'),
    (v_other_member, 'partial-name-other@example.invalid'),
    (v_test_member, 'partial-name-sandbox@example.invalid');
  INSERT INTO public.app_user_profile(id,role) VALUES
    (v_member,'tourism_agent'),(v_other_member,'tourism_agent'),(v_test_member,'tourism_agent')
    ON CONFLICT(id) DO UPDATE SET role = EXCLUDED.role;
  INSERT INTO public.object(id,object_type,name,status) VALUES
    (v_org,'ORG','Partial-name organisation','published'),
    (v_foreign_org,'ORG','Partial-name other organisation','published'),
    (v_test_org,'ORG','Partial-name sandbox organisation','published'),
    (v_pub,'HLO','Jardin Créole PN27 Publié','published'),
    (v_draft,'HLO','Jardin Créole PN27 Brouillon','draft'),
    (v_hidden,'HLO','Jardin Créole PN27 Hors ligne','hidden'),
    (v_archived,'HLO','Jardin Créole PN27 Archive','archived'),
    (v_foreign,'HLO','Jardin Créole PN27 Etranger','hidden'),
    (v_test,'HLO','Jardin Créole PN27 Test','published'),
    (v_noise,'HLO','Autre établissement PN27','published'),
    (v_literal,'HLO','Literal_%ouvrage PN27','published'),
    (v_impostor,'HLO','Literal-ouvrage PN27','published');
  INSERT INTO public.org_config(org_object_id,access_scope,is_test_org) VALUES
    (v_org,'own_objects_only',false),(v_foreign_org,'own_objects_only',false),
    (v_test_org,'own_objects_only',true);
  INSERT INTO public.object_org_link(object_id,org_object_id,role_id,is_primary) VALUES
    (v_pub,v_org,v_publisher,true),(v_draft,v_org,v_publisher,true),
    (v_hidden,v_org,v_publisher,true),(v_archived,v_org,v_publisher,true),
    (v_foreign,v_foreign_org,v_publisher,true),(v_test,v_test_org,v_publisher,true),
    (v_noise,v_org,v_publisher,true),(v_literal,v_org,v_publisher,true),
    (v_impostor,v_org,v_publisher,true);
  INSERT INTO public.user_org_membership(user_id,org_object_id,is_active) VALUES
    (v_member,v_org,true),(v_other_member,v_foreign_org,true),(v_test_member,v_test_org,true);
  v_own := ARRAY[v_pub,v_draft,v_hidden,v_archived];
  v_fixtures := v_own || ARRAY[v_foreign,v_test,v_noise,v_literal,v_impostor];
  INSERT INTO public.object_location(object_id,is_main_location,latitude,longitude,city)
    SELECT id,true,-21.10,55.50,'Partial Name PN27'
    FROM public.object WHERE id = ANY(v_fixtures);
  -- This exact-lexeme content hit would previously suppress incomplete name hits.
  INSERT INTO public.object_description(object_id,description,visibility)
    VALUES(v_noise,repeat('jardin cré ',8),'public');
  ASSERT (SELECT name_normalized = 'jardin creole pn27 publie' FROM public.object WHERE id=v_pub),
    'Fixture must exercise the real name-normalization trigger';
  ASSERT (SELECT is_test FROM public.object WHERE id=v_test),
    'Sandbox fixture must derive its realm from its publisher organisation';
  REFRESH MATERIALIZED VIEW internal.mv_filtered_objects;

  PERFORM set_config('request.jwt.claims',json_build_object('sub',v_member,'role','authenticated')::text,true);
  SET LOCAL ROLE authenticated;
  FOREACH v_term IN ARRAY ARRAY['ja','jardin cré','JARDIN CRÉ',E'  jardin \t cré  '] LOOP
    SELECT array_agg(object_id) INTO v_ids
    FROM api.get_filtered_object_ids(v_filters,v_types,v_all,v_term)
    WHERE object_id = ANY(v_fixtures);
    ASSERT v_ids @> v_own,
      format('Partial name %L must find all four readable statuses, got %s',v_term,v_ids);
    ASSERT NOT v_ids && ARRAY[v_foreign,v_test],
      format('Partial name %L crossed an organisation or realm boundary',v_term);
  END LOOP;

  SELECT max(relevance) FILTER(WHERE object_id=v_pub), max(relevance) FILTER(WHERE object_id=v_noise)
    INTO v_name_score,v_noise_score
  FROM api.get_filtered_object_ids(v_filters,v_types,v_all,'jardin cré');
  ASSERT v_name_score >= 4 AND v_name_score < 5 AND v_noise_score >= 2 AND v_noise_score < 3,
    format('Incomplete name must outrank dense exact content: name=%s, content=%s',v_name_score,v_noise_score);
  SELECT array_agg(object_id) INTO v_ids
  FROM api.get_filtered_object_ids(v_filters,v_types,v_all,'literal_%ouvr')
  WHERE object_id = ANY(v_fixtures);
  ASSERT v_ids IS NOT DISTINCT FROM ARRAY[v_literal],
    format('Percent and underscore must be literal characters, got %s',v_ids);
  SELECT array_agg(object_id) INTO v_ids
  FROM api.get_filtered_object_ids(v_filters,v_types,ARRAY['hidden']::object_status[],'jardin cré')
  WHERE object_id = ANY(v_fixtures);
  ASSERT v_ids IS NOT DISTINCT FROM ARRAY[v_hidden], 'Explicit hidden filter must stay exact and scoped';
  SELECT array_agg(object_id ORDER BY object_id) INTO v_ids
  FROM api.get_filtered_object_ids(v_filters,v_types,ARRAY['published']::object_status[],'jardin cré')
  WHERE object_id = ANY(v_fixtures);
  ASSERT v_ids IS NOT DISTINCT FROM ARRAY[v_pub,v_noise],
    'Published-only MV path must find partial names without adding other statuses';

  v_page := api.list_object_resources_filtered_page(
    p_page_size=>50,p_filters=>v_filters,p_types=>v_types,p_status=>v_all,p_search=>'jardin cré',p_view=>'card')::jsonb;
  SELECT array_agg(e->>'id') INTO v_ids FROM jsonb_array_elements(v_page->'data') e;
  ASSERT v_ids @> v_own AND NOT v_ids && ARRAY[v_foreign,v_test],
    format('Card pagination lost an incomplete name or bypassed scope: %s',v_ids);
  SELECT array_agg(e->>'id') INTO v_ids
  FROM jsonb_array_elements(api.list_object_markers(v_types,v_all,v_filters,'jardin cré')::jsonb) e;
  ASSERT v_ids @> v_own AND NOT v_ids && ARRAY[v_foreign,v_test],
    format('Map markers must share the partial-name result and visibility: %s',v_ids);
  RESET ROLE;

  PERFORM set_config('request.jwt.claims',json_build_object('sub',v_other_member,'role','authenticated')::text,true);
  SET LOCAL ROLE authenticated;
  SELECT array_agg(object_id ORDER BY object_id) INTO v_ids
  FROM api.get_filtered_object_ids(v_filters,v_types,v_all,'jardin cré')
  WHERE object_id = ANY(v_fixtures);
  ASSERT v_ids IS NOT DISTINCT FROM ARRAY[v_pub,v_foreign,v_noise],
    format('Other organisation must see its own hidden object and public witnesses only: %s',v_ids);
  RESET ROLE;

  PERFORM set_config('request.jwt.claims','{"role":"anon"}',true);
  SET LOCAL ROLE anon;
  SELECT array_agg(object_id ORDER BY object_id) INTO v_ids
  FROM api.get_filtered_object_ids(v_filters,v_types,v_all,'jardin cré')
  WHERE object_id = ANY(v_fixtures);
  ASSERT v_ids IS NOT DISTINCT FROM ARRAY[v_pub,v_noise],
    format('Anonymous partial names must not expose non-public or test objects: %s',v_ids);
  RESET ROLE;

  PERFORM set_config('request.jwt.claims',json_build_object('sub',v_test_member,'role','authenticated')::text,true);
  SET LOCAL ROLE authenticated;
  ASSERT api.current_user_test_realm(), 'Test persona must actually be in the sandbox realm';
  SELECT array_agg(object_id) INTO v_ids
  FROM api.get_filtered_object_ids(v_filters,v_types,v_all,'jardin cré')
  WHERE object_id = ANY(v_fixtures);
  ASSERT v_ids IS NOT DISTINCT FROM ARRAY[v_test],
    format('Sandbox partial-name search must not expose production objects: %s',v_ids);
  RESET ROLE;
  RAISE NOTICE 'Partial names: fragments, accents, spaces, ranking, literal symbols, statuses, cards, markers, roles and realms passed';
END
$partial_names$;

ROLLBACK;
