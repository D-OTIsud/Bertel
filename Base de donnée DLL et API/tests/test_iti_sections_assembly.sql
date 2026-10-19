-- Local-only integration audit. Requires genuine cloned schema/functions, no production data.
-- Enable explicitly in the local session: SET bertel.local_sections_audit = 'on';
-- No triggers are disabled and no function is replaced. Any failure aborts the transaction.
\set ON_ERROR_STOP on
BEGIN;
DO $guard$
BEGIN
  IF current_setting('bertel.local_sections_audit', true) IS DISTINCT FROM 'on'
     OR current_database() <> 'bertel_iti_sections_audit'
     OR inet_server_addr() IS NULL
     OR NOT (inet_server_addr() <<= '127.0.0.0/8'::inet
             OR inet_server_addr() = '::1'::inet) THEN
    RAISE EXCEPTION 'Local sections audit refused: explicit opt-in, audit database and TCP loopback required';
  END IF;
END
$guard$;
SET LOCAL search_path = public, api, extensions, auth;
SET LOCAL request.jwt.claims = '{"role":"service_role"}';
DO $audit$
DECLARE
  populated constant text := 'ITIRUN9999999801';
  witness constant text := 'ITIRUN9999999802';
  empty_parent constant text := 'ITIRUN9999999803';
  expected jsonb;
  actual jsonb;
  resource jsonb;
  batch jsonb;
  opts jsonb;
  language_code text;
  format_code text;
  include_stages boolean;
  checks integer := 0;
  expected_ids text[] := ARRAY[
    '00000000-0000-0000-0000-000000000006',
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000004',
    '00000000-0000-0000-0000-000000000005',
    '00000000-0000-0000-0000-000000000001'];
BEGIN
  INSERT INTO object(id,object_type,name,status,is_test) VALUES
    (populated,'ITI','Local sections populated','published',false),
    (witness,'ITI','Local sections witness','published',false),
    (empty_parent,'ITI','Local sections empty','published',false);

  -- Deliberately insert out of output order. position/created_at cannot be NULL.
  -- UUID is unique, so ctid cannot be independently exercised as the final tie breaker.
  INSERT INTO object_iti_section(id,parent_object_id,position,name,created_at,name_i18n,extra,geom) VALUES
    (expected_ids[6]::uuid,populated,1,NULL,'2026-01-04 UTC',NULL,NULL,NULL),
    (expected_ids[5]::uuid,populated,1,'','2026-01-03 UTC','{}','{}',NULL),
    (expected_ids[4]::uuid,populated,1,'Alpha','2026-01-02 UTC',NULL,'{"nested":{"items":[null,{},[],"x"]}}',NULL),
    (expected_ids[3]::uuid,populated,1,'Alpha','2026-01-01 UTC','{"fr":"Nom FR","en":"Name EN"}','{"raw":true}',NULL),
    (expected_ids[2]::uuid,populated,1,'Alpha','2026-01-01 UTC',NULL,NULL,NULL),
    (expected_ids[1]::uuid,populated,0,'Zulu','2026-01-05 UTC','{"en":"Translated Zulu"}',
      '{"nested":{"sections":[{"name":"opaque child"}]}}',
      ST_GeogFromText('SRID=4326;LINESTRING(55.40 -21.10,55.41 -21.11)')),
    ('00000000-0000-0000-0000-000000000099',witness,0,'Witness only','2026-01-01 UTC',NULL,NULL,NULL);

  -- Independent expected order: explicit UUID ordinality, not the builder ORDER BY.
  SELECT jsonb_agg(to_jsonb(s)-'parent_object_id' ORDER BY ids.ordinality)
  INTO expected
  FROM unnest(expected_ids) WITH ORDINALITY ids(id,ordinality)
  JOIN object_iti_section s ON s.id=ids.id::uuid;
  IF jsonb_array_length(expected) IS DISTINCT FROM 6 THEN RAISE EXCEPTION 'Incomplete expected fixture'; END IF;
  checks := checks+1;

  -- Fixture setup runs as the local owner; all consumer reads use the platform role.
  EXECUTE 'SET LOCAL ROLE service_role';
  FOREACH language_code IN ARRAY ARRAY['fr','en','zz'] LOOP
    FOR opts IN SELECT value FROM jsonb_array_elements('[{}, {"render":false},
      {"render":false,"include":["render"]}, {"fields":[]}, {"fields":["name"]},
      {"omit_empty":true}, {"fields":[],"render":false,"omit_empty":true}]'::jsonb) LOOP
      resource := api.get_object_resource(populated,ARRAY[language_code],'none',opts)::jsonb;
      actual := resource#>'{itinerary_details,sections}';
      IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Sections mismatch: language %, options %',language_code,opts; END IF;
      checks := checks+1;
      IF api.compose_object_resource_blocks(resource) IS DISTINCT FROM resource THEN RAISE EXCEPTION 'Composition changed resource'; END IF;
      checks := checks+1;
      actual := api.get_object_resource(empty_parent,ARRAY[language_code],'none',opts)::jsonb#>'{itinerary_details,sections}';
      IF actual IS DISTINCT FROM '[]'::jsonb THEN RAISE EXCEPTION 'Empty nested sections lost'; END IF;
      checks := checks+1;
      actual := api.get_object_with_deep_data(populated,ARRAY[language_code],opts)::jsonb#>'{object,itinerary_details,sections}';
      IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Single deep data mismatch'; END IF;
      checks := checks+1;
      batch := api.get_objects_with_deep_data(ARRAY[witness,populated,empty_parent],ARRAY[language_code],'none',opts)::jsonb;
      IF jsonb_array_length(batch) <> 3
         OR batch#>'{1,object,itinerary_details,sections}' IS DISTINCT FROM expected
         OR jsonb_array_length(batch#>'{0,object,itinerary_details,sections}') <> 1
         OR batch#>>'{0,object,itinerary_details,sections,0,name}' IS DISTINCT FROM 'Witness only'
         OR batch#>'{2,object,itinerary_details,sections}' IS DISTINCT FROM '[]'::jsonb THEN
        RAISE EXCEPTION 'Batch sections/order/isolation mismatch';
      END IF;
      checks := checks+1;
      IF (resource ? 'render') IS DISTINCT FROM
         (COALESCE((opts->>'render')::boolean,true) OR COALESCE(opts->'include' ? 'render',false)) THEN
        RAISE EXCEPTION 'Render enablement mismatch';
      END IF;
      checks := checks+1;
    END LOOP;
  END LOOP;

  -- Real track fixture; genuine trigger/serializer failures must fail, never silently skip.
  EXECUTE 'RESET ROLE';
  INSERT INTO object_iti(object_id,distance_km,duration_min,geom)
  VALUES(populated,1.5,30,ST_GeogFromText('SRID=4326;LINESTRING(55.40 -21.10,55.41 -21.11)'));
  EXECUTE 'SET LOCAL ROLE service_role';
  FOREACH format_code IN ARRAY ARRAY['gpx','kml'] LOOP
    FOREACH include_stages IN ARRAY ARRAY[false,true] LOOP
      resource := api.get_object_resource(populated,ARRAY['fr'],format_code,
        jsonb_build_object('include_stages',include_stages,'stage_color','red'))::jsonb;
      IF resource#>'{itinerary_details,sections}' IS DISTINCT FROM expected
         OR resource#>>'{itinerary,track_format}' IS DISTINCT FROM format_code
         OR NULLIF(resource#>>'{itinerary,track}','') IS NULL THEN
        RAISE EXCEPTION 'Track/sections mismatch: format %, stages %',format_code,include_stages;
      END IF;
      checks := checks+1;
    END LOOP;
  END LOOP;
  RAISE NOTICE 'PASS local ITI sections assembly: % checks (21 option/language combinations; exact sections, composition, empty/isolation, deep-data single/batch, render, four track cases)',checks;
END
$audit$;
ROLLBACK;
