-- Automatic commune INSEE resolution and database integrity.
-- Run after the complete manifest and the location INSEE migration, as postgres.
-- Both direct object locations and locations belonging to a place are exercised.
-- Everything, including fixtures and failed-write probes, is rolled back.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout = '120s';
SET LOCAL plpgsql.check_asserts = on;

DO $insee_resolution_test$
BEGIN
  ASSERT internal.normalize_commune_name('  SAINT-BENOÎT  ')
      = internal.normalize_commune_name('St. Benoit'),
    'Commune normalization must handle accents, punctuation and St abbreviations';
  ASSERT internal.normalize_commune_name('Sainte-Suzanne')
      = internal.normalize_commune_name('Ste Suzanne'),
    'Commune normalization must handle Ste abbreviations';

  ASSERT internal.resolve_location_insee('Entre-Deux', '97414') = '97403',
    'A postal code is not an INSEE code: Entre-Deux 97414 must resolve to 97403';
  ASSERT internal.resolve_location_insee(' L’Entre Deux ', '97414') = '97403',
    'A legacy commune article and typographic apostrophe must be tolerated';
  ASSERT internal.resolve_location_insee('ST. BENOIT', '97437') = '97410',
    'Saint-Benoit must resolve from its secondary postal code';
  ASSERT internal.resolve_location_insee('STE SUZANNE', '97441') = '97420',
    'Sainte-Suzanne abbreviation must resolve';
  ASSERT internal.resolve_location_insee('L''Etang Sale', '97427') = '97404',
    'Unaccented Etang-Sale must resolve';
  ASSERT internal.resolve_location_insee('La Plaine des Cafres', '97418') = '97422',
    'A locality must resolve through its known postal code';
  ASSERT internal.resolve_location_insee(NULL, '97490') = '97411',
    'Postal-code-only input must resolve to Saint-Denis';
  ASSERT internal.resolve_location_insee('Petite Ile', NULL) = '97405',
    'Commune-name-only input must resolve';
  ASSERT internal.resolve_location_insee(NULL, NULL) IS NULL,
    'Empty input must stay unresolved';
  ASSERT internal.resolve_location_insee('Commune introuvable', '99999') IS NULL,
    'Unknown input must stay unresolved instead of inventing a code';

  BEGIN
    PERFORM internal.resolve_location_insee('Entre-Deux', '97480');
    RAISE EXCEPTION 'INSEE_TEST_FAIL: contradictory known commune and postal code accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  ASSERT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'public.object_location'::regclass
      AND attname = 'code_insee' AND attnotnull AND NOT attisdropped
  ), 'object_location.code_insee must be NOT NULL';
  ASSERT EXISTS (
    SELECT 1 FROM pg_constraint constraint_row
    JOIN pg_attribute column_row
      ON column_row.attrelid = constraint_row.conrelid
     AND column_row.attnum = ANY(constraint_row.conkey)
    WHERE constraint_row.conrelid = 'public.object_location'::regclass
      AND constraint_row.confrelid = 'public.ref_commune'::regclass
      AND constraint_row.contype = 'f' AND constraint_row.convalidated
      AND column_row.attname = 'code_insee'
  ), 'object_location.code_insee must have a validated FK to ref_commune';
  ASSERT (SELECT relrowsecurity FROM pg_class
    WHERE oid = 'public.ref_commune_postcode'::regclass),
    'Postal-code lookup must have RLS enabled';
  ASSERT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.object_location'::regclass
      AND tgname = 'thesaurus_assignment_guard' AND NOT tgisinternal
      AND tgenabled = 'O' AND tgfoid = 'thesaurus.guard_assignment()'::regprocedure
      AND position('code_insee' IN pg_get_triggerdef(oid)) > 0
  ), 'The resolved commune must pass the governed thesaurus assignment guard';
END;
$insee_resolution_test$;

DO $insee_privileges_test$
BEGIN
  ASSERT NOT has_function_privilege('anon', 'internal.resolve_location_insee(text,text)', 'EXECUTE'),
    'Anonymous clients must not execute the internal INSEE resolver';
  ASSERT NOT has_function_privilege('anon', 'internal.normalize_commune_name(text)', 'EXECUTE'),
    'Anonymous clients must not execute the internal commune normalizer';
  ASSERT has_function_privilege('authenticated', 'internal.resolve_location_insee(text,text)', 'EXECUTE')
     AND has_function_privilege('service_role', 'internal.resolve_location_insee(text,text)', 'EXECUTE'),
    'Authoring roles need EXECUTE for the SECURITY INVOKER trigger lookup';
  ASSERT (SELECT NOT prosecdef FROM pg_proc
    WHERE oid = 'internal.resolve_location_insee(text,text)'::regprocedure),
    'The resolver must remain SECURITY INVOKER';

  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  SET LOCAL ROLE anon;
  ASSERT EXISTS (SELECT 1 FROM public.ref_commune_postcode
    WHERE postcode = '97414' AND insee_code = '97403'),
    'Anonymous clients must be able to read the public postcode reference';
  BEGIN
    PERFORM internal.resolve_location_insee('Entre-Deux', '97414');
    RAISE EXCEPTION 'INSEE_TEST_FAIL: anonymous client executed the internal resolver';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.ref_commune_postcode(postcode, insee_code) VALUES ('99999', '97403');
    RAISE EXCEPTION 'INSEE_TEST_FAIL: anonymous client wrote the postcode reference';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;

  PERFORM set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  SET LOCAL ROLE authenticated;
  ASSERT internal.resolve_location_insee('Entre-Deux', '97414') = '97403',
    'Authenticated resolver must work with real reference-table permissions';
  BEGIN
    INSERT INTO public.ref_commune_postcode(postcode, insee_code) VALUES ('99999', '97403');
    RAISE EXCEPTION 'INSEE_TEST_FAIL: authenticated client wrote the postcode reference';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '{}', true);
END;
$insee_privileges_test$;

INSERT INTO public.object(id, object_type, name, status) VALUES
  ('HOTRUNINSEE00001', 'HOT', 'INSEE resolution transactional fixture', 'draft');

DO $insee_location_write_test$
DECLARE
  location_id uuid;
  place_location_id uuid;
  fixture_place_id uuid;
  resolved_code text;
BEGIN
  -- The ordinary editor/import payload does not have to supply an INSEE code.
  INSERT INTO public.object_location(object_id, city, postcode, is_main_location)
  VALUES ('HOTRUNINSEE00001', 'Entre-Deux', '97414', true)
  RETURNING id, code_insee INTO location_id, resolved_code;
  ASSERT resolved_code = '97403', 'Missing INSEE code must be filled before NOT NULL is checked';

  -- Postal code changes between communes must not retain the prior code.
  UPDATE public.object_location
  SET city = 'Saint-Joseph', postcode = '97480'
  WHERE id = location_id
  RETURNING code_insee INTO resolved_code;
  ASSERT resolved_code = '97412', 'Changing commune/postal code must replace the stale INSEE code';

  -- A payload may echo the code loaded before the commune changed.
  UPDATE public.object_location
  SET city = 'Le Tampon', postcode = '97418', code_insee = '97412'
  WHERE id = location_id
  RETURNING code_insee INTO resolved_code;
  ASSERT resolved_code = '97422', 'Changed address must resolve even when the payload echoes the old INSEE code';

  UPDATE public.object_location SET code_insee = NULL WHERE id = location_id
  RETURNING code_insee INTO resolved_code;
  ASSERT resolved_code = '97422', 'Clearing the code must recompute it from the stored address';

  BEGIN
    UPDATE public.object_location SET code_insee = '97403' WHERE id = location_id;
    RAISE EXCEPTION 'INSEE_TEST_FAIL: code contradicting an unchanged address accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  ASSERT (SELECT code_insee FROM public.object_location WHERE id = location_id) = '97422',
    'Rejected code edit must preserve the previous valid row';

  BEGIN
    UPDATE public.object_location SET city = 'Entre-Deux' WHERE id = location_id;
    RAISE EXCEPTION 'INSEE_TEST_FAIL: update contradicting the existing postal code accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  ASSERT (SELECT city FROM public.object_location WHERE id = location_id) = 'Le Tampon',
    'Rejected commune edit must roll back the entire row change';

  BEGIN
    INSERT INTO public.object_location(object_id, city, postcode)
    VALUES ('HOTRUNINSEE00001', 'Saint-Pierre', '97480');
    RAISE EXCEPTION 'INSEE_TEST_FAIL: contradictory address inserted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.object_location(object_id, city, postcode, code_insee)
    VALUES ('HOTRUNINSEE00001', 'Entre-Deux', '97414', '97412');
    RAISE EXCEPTION 'INSEE_TEST_FAIL: explicit code contradicting a new address accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.object_location(object_id, code_insee)
    VALUES ('HOTRUNINSEE00001', '99999');
    RAISE EXCEPTION 'INSEE_TEST_FAIL: unknown explicit INSEE code accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.object_location(object_id, city, postcode)
    VALUES ('HOTRUNINSEE00001', 'Commune introuvable', '99999');
    RAISE EXCEPTION 'INSEE_TEST_FAIL: unresolved location inserted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.object_location(object_id, city, postcode, code_insee)
    VALUES ('HOTRUNINSEE00001', ' ', ' ', ' ');
    RAISE EXCEPTION 'INSEE_TEST_FAIL: blank location inserted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.object_location(object_id)
    VALUES ('HOTRUNINSEE00001');
    RAISE EXCEPTION 'INSEE_TEST_FAIL: empty location inserted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  INSERT INTO public.object_location(object_id, code_insee)
  VALUES ('HOTRUNINSEE00001', '97417')
  RETURNING code_insee INTO resolved_code;
  ASSERT resolved_code = '97417', 'A known explicit commune code must work without address text';

  -- Secondary place addresses use the same table and need the same protection.
  INSERT INTO public.object_place(object_id, label)
  VALUES ('HOTRUNINSEE00001', 'INSEE secondary place fixture')
  RETURNING id INTO fixture_place_id;
  INSERT INTO public.object_location(place_id, city, postcode, is_main_location)
  VALUES (fixture_place_id, 'La Plaine des Cafres', '97418', true)
  RETURNING id, code_insee INTO place_location_id, resolved_code;
  ASSERT resolved_code = '97422', 'Place location must resolve its INSEE code too';
  UPDATE public.object_location
  SET city = 'St Pierre', postcode = '97432'
  WHERE id = place_location_id
  RETURNING code_insee INTO resolved_code;
  ASSERT resolved_code = '97416', 'Place location update must replace the stale INSEE code';

  RAISE NOTICE 'Location INSEE assertions passed: normalization, postal mapping, auto-fill, stale-code correction, invalid-write rejection and secondary places.';
END;
$insee_location_write_test$;

DO $insee_shared_postcode_test$
DECLARE resolved_code text;
BEGIN
  -- Simulate a shared postal code; no arbitrary first commune is acceptable.
  INSERT INTO public.ref_commune_postcode(postcode, insee_code) VALUES ('97414', '97422');
  ASSERT internal.resolve_location_insee(NULL, '97414') IS NULL,
    'A shared postal code without a commune must remain ambiguous';
  ASSERT internal.resolve_location_insee('Entre-Deux', '97414') = '97403',
    'A known commune must disambiguate a shared postal code';
  BEGIN
    INSERT INTO public.object_location(object_id, postcode)
    VALUES ('HOTRUNINSEE00001', '97414');
    RAISE EXCEPTION 'INSEE_TEST_FAIL: shared postal code selected an arbitrary commune';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.object_location(object_id, postcode, code_insee)
    VALUES ('HOTRUNINSEE00001', '97414', '97412');
    RAISE EXCEPTION 'INSEE_TEST_FAIL: explicit commune outside a shared postal code accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  INSERT INTO public.object_location(object_id, postcode, code_insee)
  VALUES ('HOTRUNINSEE00001', '97414', '97403')
  RETURNING code_insee INTO resolved_code;
  ASSERT resolved_code = '97403', 'A matching explicit code must disambiguate a shared postal code';
  DELETE FROM public.ref_commune_postcode WHERE postcode = '97414' AND insee_code = '97422';
END;
$insee_shared_postcode_test$;

-- Prove the invoker trigger under a real current canonical author, not postgres
-- with an authenticated-shaped claim or an unconstrained service-role bypass.
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
INSERT INTO auth.users(id, email) VALUES
  ('00000000-0000-4000-a000-0000001e5ee1', 'insee-writer@example.invalid');
INSERT INTO public.app_user_profile(id, role) VALUES
  ('00000000-0000-4000-a000-0000001e5ee1', 'tourism_agent')
ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;
INSERT INTO public.object(id, object_type, name, status) VALUES
  ('ORGRUNINSEE00001', 'ORG', 'INSEE authoring organization fixture', 'published');
INSERT INTO public.org_config(org_object_id, access_scope)
VALUES ('ORGRUNINSEE00001', 'own_objects_only');
INSERT INTO public.object_org_link(object_id, org_object_id, role_id, is_primary)
SELECT 'HOTRUNINSEE00001', 'ORGRUNINSEE00001', id, true
FROM public.ref_org_role WHERE code = 'publisher';
INSERT INTO public.user_org_membership(id, user_id, org_object_id, is_active)
VALUES ('00000000-0000-4000-a000-0000001e5ee2',
  '00000000-0000-4000-a000-0000001e5ee1', 'ORGRUNINSEE00001', true);
INSERT INTO public.user_org_business_role(membership_id, role_id, is_active)
SELECT '00000000-0000-4000-a000-0000001e5ee2', id, true
FROM public.ref_org_business_role WHERE code = 'editor';
INSERT INTO public.org_role_permission(org_object_id, role_id, permission_id, is_active, granted_by)
SELECT 'ORGRUNINSEE00001', r.id, p.id, true, '00000000-0000-4000-a000-0000001e5ee1'
FROM public.ref_org_business_role r CROSS JOIN public.ref_permission p
WHERE r.code = 'editor' AND p.code = 'edit_canonical_when_publisher'
ON CONFLICT ON CONSTRAINT org_role_permission_uniq DO UPDATE SET is_active = true;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-0000001e5ee1","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $insee_authenticated_write_test$
DECLARE location_id uuid; resolved_code text;
BEGIN
  ASSERT current_user = 'authenticated'
     AND api.user_can_write_object_canonical('HOTRUNINSEE00001') IS TRUE,
    'Fixture must exercise a real authenticated author with current canonical rights';
  INSERT INTO public.object_location(object_id, city, postcode)
  VALUES ('HOTRUNINSEE00001', 'St. Benoit', '97437')
  RETURNING id, code_insee INTO location_id, resolved_code;
  ASSERT resolved_code = '97410', 'Canonical author INSERT must resolve without privileged helper execution';
  UPDATE public.object_location SET city = 'Ste Suzanne', postcode = '97441'
  WHERE id = location_id
  RETURNING code_insee INTO resolved_code;
  ASSERT resolved_code = '97420', 'Canonical author UPDATE must replace the stale code';
END;
$insee_authenticated_write_test$;
RESET ROLE;
SELECT set_config('request.jwt.claims', '{}', true);

DO $insee_governed_assignment_test$
DECLARE commune_concept_id uuid; historical_location_id uuid; resolved_code text;
BEGIN
  -- Fresh-manifest runs have not activated a vocabulary yet. Activate the real
  -- commune domain transactionally, so refusal is tested against publication.
  IF api.thesaurus_generation() IS NULL OR NOT thesaurus.is_governed('commune') THEN
    UPDATE public.app_user_profile SET role = 'super_admin'
    WHERE id = '00000000-0000-4000-a000-0000001e5ee1';
    PERFORM set_config('request.jwt.claims',
      '{"sub":"00000000-0000-4000-a000-0000001e5ee1","role":"authenticated"}', true);
    IF NOT EXISTS (SELECT 1 FROM thesaurus.instance WHERE singleton
      AND base_uri ~ '^https?://[^/ ]+/.+'
      AND nullif(btrim(license), '') IS NOT NULL
      AND nullif(btrim(attribution), '') IS NOT NULL) THEN
      PERFORM api.thesaurus_admin('configure_instance',
        '{"base_uri":"https://example.invalid/insee-test/concepts/","license":"test-fixture-only","attribution":"INSEE transactional test"}');
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
      '{"domains":["commune"],"idempotency_key":"insee-test-commune-bootstrap"}');
    PERFORM set_config('request.jwt.claims', '{}', true);
  END IF;
  SELECT concept_id INTO STRICT commune_concept_id FROM thesaurus.concept
  WHERE source_kind = 'commune' AND source_id = '97403' AND domain = 'commune';
  ASSERT EXISTS (SELECT 1 FROM public.ref_commune WHERE insee_code = '97403' AND is_active)
     AND EXISTS (SELECT 1 FROM thesaurus.concept
       WHERE concept_id = commune_concept_id AND assignable AND lifecycle = 'active')
     AND EXISTS (SELECT 1 FROM thesaurus.release_concept
       WHERE release_id = api.thesaurus_generation() AND concept_id = commune_concept_id),
    'Commune fixture must initially be active, assignable and published';
  INSERT INTO public.object_location(object_id, city, postcode)
  VALUES ('HOTRUNINSEE00001', 'Entre-Deux', '97414')
  RETURNING id INTO historical_location_id;

  -- Deliberately keep the native reference active: the new assignment guard
  -- must enforce governed non-assignability in addition to native is_active.
  UPDATE thesaurus.concept SET assignable = false WHERE concept_id = commune_concept_id;
  BEGIN
    INSERT INTO public.object_location(object_id, city, postcode)
    VALUES ('HOTRUNINSEE00001', 'Entre-Deux', '97414');
    RAISE EXCEPTION 'INSEE_TEST_FAIL: native-active but governed-nonassignable commune newly assigned';
  EXCEPTION WHEN check_violation THEN
    ASSERT position('Concept is historical' IN SQLERRM) > 0,
      'Refusal must come from the governed assignment guard';
  END;
  UPDATE public.object_location SET address1 = 'Historical assignment retained', code_insee = code_insee
  WHERE id = historical_location_id
  RETURNING code_insee INTO resolved_code;
  ASSERT resolved_code = '97403', 'An unchanged historical assignment must survive unrelated address edits';
END;
$insee_governed_assignment_test$;

ROLLBACK;
