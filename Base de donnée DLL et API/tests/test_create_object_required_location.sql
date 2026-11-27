-- Atomic creation with a required commune/postal pair and database-derived INSEE.
-- Run after the complete manifest. All fixtures and governance changes roll back.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout = '120s';
SET LOCAL plpgsql.check_asserts = on;

DO $contract$
BEGIN
  ASSERT (SELECT count(*) FROM pg_proc
    WHERE pronamespace = 'api'::regnamespace AND proname = 'rpc_create_object') = 2,
    'Creation must expose only the explicit five-argument and legacy signatures';
  ASSERT (SELECT pronargdefaults = 0 AND prosecdef AND proargnames =
    ARRAY['p_object_type','p_name','p_region_code','p_city','p_postcode']
    FROM pg_proc WHERE oid = 'api.rpc_create_object(text,text,text,text,text)'::regprocedure),
    'Five required named arguments must resolve unambiguously through PostgREST';
  ASSERT NOT has_function_privilege('anon', 'api.rpc_create_object(text,text,text,text,text)', 'EXECUTE')
     AND NOT has_function_privilege('anon', 'api.rpc_create_object(text,text,text)', 'EXECUTE'),
    'Anonymous clients must not execute either creation signature';
  ASSERT has_function_privilege('authenticated', 'api.rpc_create_object(text,text,text,text,text)', 'EXECUTE')
     AND has_function_privilege('service_role', 'api.rpc_create_object(text,text,text,text,text)', 'EXECUTE'),
    'Existing application creation roles must retain the new RPC';
END;
$contract$;

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
INSERT INTO auth.users(id, email) VALUES
  ('00000000-0000-4000-a000-00000c1ea7e1', 'create-location-writer@example.invalid'),
  ('00000000-0000-4000-a000-00000c1ea7e2', 'create-location-stranger@example.invalid'),
  ('00000000-0000-4000-a000-00000c1ea7e3', 'create-location-admin@example.invalid');
INSERT INTO public.app_user_profile(id, role) VALUES
  ('00000000-0000-4000-a000-00000c1ea7e1', 'tourism_agent'),
  ('00000000-0000-4000-a000-00000c1ea7e2', 'tourism_agent'),
  ('00000000-0000-4000-a000-00000c1ea7e3', 'super_admin')
ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;
INSERT INTO public.object(id, object_type, name, status)
VALUES ('ORGRUNCRLOC00001', 'ORG', 'Creation location publisher fixture', 'published');
INSERT INTO public.org_config(org_object_id, access_scope)
VALUES ('ORGRUNCRLOC00001', 'own_objects_only');
INSERT INTO public.user_org_membership(id, user_id, org_object_id, is_active)
VALUES ('00000000-0000-4000-a000-00000c1ea7e4',
  '00000000-0000-4000-a000-00000c1ea7e1', 'ORGRUNCRLOC00001', true);
INSERT INTO public.user_org_business_role(membership_id, role_id, is_active)
SELECT '00000000-0000-4000-a000-00000c1ea7e4', id, true
FROM public.ref_org_business_role WHERE code = 'editor';
INSERT INTO public.org_role_permission(org_object_id, role_id, permission_id, is_active, granted_by)
SELECT 'ORGRUNCRLOC00001', r.id, p.id, true, '00000000-0000-4000-a000-00000c1ea7e3'
FROM public.ref_org_business_role r CROSS JOIN public.ref_permission p
WHERE r.code = 'editor' AND p.code IN ('create_object', 'edit_canonical_when_publisher')
ON CONFLICT ON CONSTRAINT org_role_permission_uniq DO UPDATE SET is_active = true;

-- A fresh manifest is unactivated; publish the real commune domain transactionally
-- so successful creation and the later negative assignment witness are non-vacuous.
DO $commune_governance$
BEGIN
  IF api.thesaurus_generation() IS NULL OR NOT thesaurus.is_governed('commune') THEN
    PERFORM set_config('request.jwt.claims',
      '{"sub":"00000000-0000-4000-a000-00000c1ea7e3","role":"authenticated"}', true);
    IF NOT EXISTS (SELECT 1 FROM thesaurus.instance WHERE singleton
      AND base_uri ~ '^https?://[^/ ]+/.+'
      AND nullif(btrim(license), '') IS NOT NULL
      AND nullif(btrim(attribution), '') IS NOT NULL) THEN
      PERFORM api.thesaurus_admin('configure_instance',
        '{"base_uri":"https://example.invalid/create-location/concepts/","license":"test-fixture-only","attribution":"Transactional creation test"}');
    END IF;
    -- Bootstrap real commune assignments without weakening the current editorial
    -- policy. These contextual definitions and proper-name translations are
    -- synthetic fixture data; the enclosing test transaction rolls them back.
    PERFORM thesaurus.sync_sources(ARRAY['commune']);
    INSERT INTO thesaurus.localized_field(concept_id, lang, field, value)
    SELECT c.concept_id, locale.lang, field.name,
      CASE WHEN field.name = 'name' THEN commune.name ELSE
        CASE locale.lang
          WHEN 'fr' THEN format('Commune administrative de La Réunion utilisée pour vérifier la localisation des fiches : %s, code INSEE %s.', commune.name, commune.insee_code)
          WHEN 'en' THEN format('Administrative municipality of Reunion used to verify record locations: %s, INSEE code %s.', commune.name, commune.insee_code)
          WHEN 'es' THEN format('Municipio administrativo de Reunión utilizado para verificar la localización de las fichas: %s, código INSEE %s.', commune.name, commune.insee_code)
          WHEN 'de' THEN format('Verwaltungsgemeinde auf Reunion zur Prüfung der Ortszuordnung von Datensätzen: %s, INSEE-Code %s.', commune.name, commune.insee_code)
        END
      END
    FROM thesaurus.concept c
    JOIN public.ref_commune commune ON c.source_kind = 'commune'
      AND c.source_id = commune.insee_code AND c.domain = 'commune'
    CROSS JOIN (VALUES ('fr'), ('en'), ('es'), ('de')) AS locale(lang)
    CROSS JOIN (VALUES ('name'), ('description')) AS field(name)
    ON CONFLICT (concept_id, lang, field) DO NOTHING;
    IF to_regprocedure('thesaurus.definition_errors(jsonb,jsonb,text[])') IS NOT NULL THEN
      ASSERT NOT EXISTS (
        SELECT 1 FROM thesaurus.concept c
        JOIN thesaurus.vocabulary v ON v.domain = c.domain
        CROSS JOIN LATERAL (SELECT thesaurus.concept_document(c.concept_id, false) AS doc) canonical
        WHERE c.domain = 'commune' AND jsonb_array_length(thesaurus.definition_errors(
          canonical.doc->'preferred_labels', canonical.doc->'definitions', v.required_languages)) > 0
      ), 'Commune fixtures must satisfy the installed editorial definition policy';
    END IF;
    PERFORM api.thesaurus_admin('bootstrap',
      '{"domains":["commune"],"idempotency_key":"create-location-commune-bootstrap"}');
  END IF;
END;
$commune_governance$;

SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-00000c1ea7e1","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $authenticated_creation$
DECLARE
  v_id text;
  v_case record;
  v_state text;
  v_message text;
  v_count_before bigint;
BEGIN
  ASSERT current_user = 'authenticated' AND api.user_can_create_object() IS TRUE,
    'Fixture must exercise a current authorized creator under the real application role';
  v_id := api.rpc_create_object(
    p_object_type => 'HOT', p_name => '  Required location successful creation  ',
    p_region_code => 'RUN', p_city => '  Entre-Deux  ', p_postcode => '  97414  '
  );
  ASSERT EXISTS (SELECT 1 FROM public.object WHERE id = v_id
    AND name = 'Required location successful creation' AND status = 'draft'
    AND created_by = auth.uid() AND updated_by = auth.uid() AND NOT is_test),
    'New RPC must preserve draft status, trimmed name, author and real realm';
  ASSERT (SELECT count(*) FROM public.object_location WHERE object_id = v_id
    AND is_main_location IS TRUE AND city = 'Entre-Deux' AND postcode = '97414'
    AND code_insee = '97403') = 1,
    'Creation must return only after its main address and correct INSEE exist';
  ASSERT EXISTS (SELECT 1 FROM public.object_org_link l
    JOIN public.ref_org_role r ON r.id = l.role_id
    WHERE l.object_id = v_id AND l.org_object_id = 'ORGRUNCRLOC00001'
      AND l.is_primary AND r.code = 'publisher'),
    'Existing creator-organization publisher attachment must remain intact';
  SET CONSTRAINTS object_creation_main_location_required IMMEDIATE;
  SET CONSTRAINTS object_creation_main_location_required DEFERRED;

  SELECT count(*) INTO v_count_before FROM public.object WHERE created_by = auth.uid();
  FOR v_case IN SELECT * FROM (VALUES
    (NULL::text, '97414', 'P0001', 'MISSING_REQUIRED_FIELD'),
    ('  ', '97414', 'P0001', 'MISSING_REQUIRED_FIELD'),
    ('Entre-Deux', NULL, 'P0001', 'MISSING_REQUIRED_FIELD'),
    ('Entre-Deux', ' ', 'P0001', 'MISSING_REQUIRED_FIELD'),
    ('Entre-Deux', '9741', '23514', 'INVALID_POSTCODE'),
    ('Entre-Deux', 'ABCDE', '23514', 'INVALID_POSTCODE'),
    ('Entre-Deux', '99999', '23514', 'INVALID_POSTCODE'),
    ('Entre-Deux', '97480', '23514', 'INSEE_COMMUNE_CONFLICT'),
    ('Commune inconnue', '99999', '23514', 'INSEE_REQUIRED')
  ) AS cases(city, postcode, expected_state, expected_message) LOOP
    BEGIN
      PERFORM api.rpc_create_object('HOT', 'Required location refused creation', 'RUN',
        v_case.city, v_case.postcode);
      RAISE EXCEPTION 'CREATE_LOCATION_TEST_FAIL: invalid location accepted';
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_message = MESSAGE_TEXT;
      ASSERT v_state = v_case.expected_state
        AND position(v_case.expected_message IN v_message) > 0,
        format('Expected %s / %s, got %s / %s', v_case.expected_state,
          v_case.expected_message, v_state, v_message);
    END;
  END LOOP;
  BEGIN
    PERFORM api.rpc_create_object('HOT', 'Required location legacy refused', 'RUN');
    RAISE EXCEPTION 'CREATE_LOCATION_TEST_FAIL: legacy three-argument creation bypassed required location';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    ASSERT position('MISSING_REQUIRED_FIELD' IN SQLERRM) > 0;
  END;
  BEGIN
    PERFORM api.rpc_create_object('HOT', 'Required location legacy two-key refused');
    RAISE EXCEPTION 'CREATE_LOCATION_TEST_FAIL: legacy two-argument creation bypassed required location';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    ASSERT position('MISSING_REQUIRED_FIELD' IN SQLERRM) > 0;
  END;
  BEGIN
    PERFORM api.rpc_create_object('INVALID', 'Required location invalid type', 'RUN', 'Entre-Deux', '97414');
    RAISE EXCEPTION 'CREATE_LOCATION_TEST_FAIL: invalid type accepted';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    ASSERT position('INVALID_OBJECT_TYPE' IN SQLERRM) > 0;
  END;
  BEGIN
    PERFORM api.rpc_create_object('HOT', ' ', 'RUN', 'Entre-Deux', '97414');
    RAISE EXCEPTION 'CREATE_LOCATION_TEST_FAIL: blank name accepted';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    ASSERT position('MISSING_REQUIRED_FIELD' IN SQLERRM) > 0;
  END;
  BEGIN
    PERFORM api.rpc_create_object('ORG', 'Required location generic ORG refused', 'RUN', 'Entre-Deux', '97414');
    RAISE EXCEPTION 'CREATE_LOCATION_TEST_FAIL: generic creation bypassed institutional ORG gate';
  EXCEPTION WHEN insufficient_privilege THEN
    ASSERT position('Organization creation' IN SQLERRM) > 0;
  END;
  ASSERT (SELECT count(*) FROM public.object WHERE created_by = auth.uid()) = v_count_before,
    'Refused creation attempts must not leave draft objects';
END;
$authenticated_creation$;
RESET ROLE;

-- Failure happens after INSERT object, in the existing governed address trigger.
-- Prove the statement also removes the new links and versions, not just location.
DO $late_failure_rollback$
DECLARE v_before jsonb; v_after jsonb; v_concept uuid;
BEGIN
  SELECT concept_id INTO STRICT v_concept FROM thesaurus.concept
  WHERE source_kind = 'commune' AND source_id = '97403' AND domain = 'commune';
  ASSERT EXISTS (SELECT 1 FROM thesaurus.concept WHERE concept_id = v_concept AND assignable);
  UPDATE thesaurus.concept SET assignable = false WHERE concept_id = v_concept;
  SELECT jsonb_build_array(
    (SELECT count(*) FROM public.object), (SELECT count(*) FROM public.object_location),
    (SELECT count(*) FROM public.object_org_link), (SELECT count(*) FROM public.object_version)
  ) INTO v_before;
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM api.rpc_create_object('HOT', 'Required location late failure', 'RUN', 'Entre-Deux', '97414');
    RAISE EXCEPTION 'CREATE_LOCATION_TEST_FAIL: unpublished/nonassignable commune accepted';
  EXCEPTION WHEN check_violation THEN
    ASSERT position('Concept is historical' IN SQLERRM) > 0,
      'Late failure must reach the real governed assignment guard';
  END;
  RESET ROLE;
  SELECT jsonb_build_array(
    (SELECT count(*) FROM public.object), (SELECT count(*) FROM public.object_location),
    (SELECT count(*) FROM public.object_org_link), (SELECT count(*) FROM public.object_version)
  ) INTO v_after;
  ASSERT v_after = v_before, 'Late address failure must atomically roll back object, location, links and history';
  UPDATE thesaurus.concept SET assignable = true WHERE concept_id = v_concept;
END;
$late_failure_rollback$;

-- The same creation path must continue deriving sandbox membership from its ORG.
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
UPDATE public.org_config SET is_test_org = true WHERE org_object_id = 'ORGRUNCRLOC00001';
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-00000c1ea7e1","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $sandbox_creation$
DECLARE v_id text;
BEGIN
  v_id := api.rpc_create_object('HOT', 'Required location sandbox creation', 'RUN', 'Le Tampon', '97418');
  ASSERT (SELECT is_test FROM public.object WHERE id = v_id) IS TRUE,
    'Creation must retain the creator organization sandbox realm';
  ASSERT EXISTS (SELECT 1 FROM public.object_location
    WHERE object_id = v_id AND is_main_location IS TRUE AND code_insee = '97422'),
    'Sandbox creation must also receive a valid main INSEE location';
END;
$sandbox_creation$;

SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-00000c1ea7e2","role":"authenticated"}', true);
DO $unauthorized_creator$
BEGIN
  ASSERT api.user_can_create_object() IS FALSE, 'Stranger must lack a current organization creation scope';
  BEGIN
    PERFORM api.rpc_create_object('HOT', 'Required location forbidden creator', 'RUN', 'Entre-Deux', '97414');
    RAISE EXCEPTION 'CREATE_LOCATION_TEST_FAIL: stranger created an object';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN ASSERT position('FORBIDDEN' IN SQLERRM) > 0;
  END;
END;
$unauthorized_creator$;
RESET ROLE;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SET LOCAL ROLE service_role;
DO $missing_session$
BEGIN
  BEGIN
    PERFORM api.rpc_create_object('HOT', 'Required location missing session', 'RUN', 'Entre-Deux', '97414');
    RAISE EXCEPTION 'CREATE_LOCATION_TEST_FAIL: missing application session accepted';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN ASSERT position('NO_AUTH_CONTEXT' IN SQLERRM) > 0;
  END;
END;
$missing_session$;
RESET ROLE;
SET CONSTRAINTS object_creation_main_location_required IMMEDIATE;
ROLLBACK;
