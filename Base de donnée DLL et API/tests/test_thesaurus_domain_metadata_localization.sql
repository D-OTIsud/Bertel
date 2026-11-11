-- Disposable fresh-apply regression. The synthetic vocabulary and all publications
-- are created through this test transaction and always roll back.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout='120s';

INSERT INTO auth.users(id,email) VALUES
 ('b8d00000-0000-4000-8000-000000000001','thesaurus-domain-metadata@example.invalid')
ON CONFLICT DO NOTHING;
INSERT INTO public.app_user_profile(id,role,display_name) VALUES
 ('b8d00000-0000-4000-8000-000000000001','super_admin','Domain metadata test')
ON CONFLICT(id) DO UPDATE SET role='super_admin';

DO $localized_domain_metadata_preflight$
DECLARE locales CONSTANT text[]:=ARRAY['fr','en','es','de'];
BEGIN
  ASSERT (SELECT count(*)=78 FROM thesaurus.vocabulary),
    'Fresh install must contain all 78 governed-domain candidates before the synthetic fixture';
  ASSERT (SELECT count(*)=66 FROM thesaurus.vocabulary WHERE is_public)
    AND (SELECT count(*)=12 FROM thesaurus.vocabulary WHERE NOT is_public),
    'Existing public exposure must remain 66 public and 12 internal domains';
  ASSERT NOT EXISTS(SELECT 1 FROM thesaurus.release),
    'Fresh-apply test suite must begin with no committed release';
  ASSERT NOT EXISTS(
    SELECT 1 FROM thesaurus.vocabulary v
    WHERE jsonb_typeof(v.name_i18n)<>'object'
      OR v.name_i18n->>'fr' IS DISTINCT FROM v.name
      OR EXISTS(SELECT 1 FROM unnest(locales) lang
        WHERE NOT thesaurus.has_editorial_text(v.name_i18n->lang))
  ), 'Every installed domain name must have nonblank FR/EN/ES/DE text with French matching name';
  ASSERT NOT EXISTS(
    SELECT 1 FROM thesaurus.vocabulary v
    JOIN public.ref_code_domain_registry r USING(domain)
    WHERE r.name IS DISTINCT FROM v.name
      OR EXISTS(SELECT 1 FROM unnest(locales) lang
        WHERE r.name_i18n->lang IS DISTINCT FROM v.name_i18n->lang)
  ), 'Vocabulary and ref-code domain registry metadata must be synchronized';
  ASSERT NOT EXISTS(
    SELECT 1 FROM thesaurus.vocabulary v
    JOIN public.ref_catalog_registry c ON c.catalog_key=CASE v.source_kind
      WHEN 'ref_code' THEN 'ref_code:'||v.domain
      WHEN 'amenity' THEN 'ref_amenity'
      WHEN 'classification_scheme' THEN 'ref_classification_scheme'
      WHEN 'classification_value' THEN 'ref_classification_value'
      WHEN 'language' THEN 'ref_language'
      WHEN 'commune' THEN 'ref_commune'
      WHEN 'sustainability_action' THEN 'ref_sustainability_action'
      WHEN 'sustainability_category' THEN 'ref_sustainability_action_category' END
    WHERE c.label IS DISTINCT FROM v.name
  ), 'Catalogue labels must remain synchronized with French domain names';
  ASSERT (SELECT column_default IS NULL FROM information_schema.columns
    WHERE table_schema='thesaurus' AND table_name='vocabulary' AND column_name='name_i18n'),
    'New domains must provide reviewed translations explicitly';
  ASSERT EXISTS(SELECT 1 FROM pg_constraint
    WHERE conrelid='thesaurus.vocabulary'::regclass
      AND conname='thesaurus_vocabulary_name_languages' AND convalidated),
    'Four-language domain-name check must be validated';
  ASSERT has_function_privilege('authenticated','api.thesaurus_admin(text,jsonb)','EXECUTE'),
    'Authenticated users must retain the existing admin wrapper entry point';
  ASSERT NOT has_function_privilege('anon','api.thesaurus_admin(text,jsonb)','EXECUTE')
    AND NOT has_function_privilege('service_role','api.thesaurus_admin(text,jsonb)','EXECUTE'),
    'The admin wrapper ACL must remain restricted to authenticated';
  ASSERT NOT has_table_privilege('authenticated','thesaurus.vocabulary','SELECT')
    AND NOT has_column_privilege('authenticated','thesaurus.vocabulary','name_i18n','SELECT'),
    'Application roles must not read localized domain metadata directly';
  ASSERT NOT has_table_privilege('service_role','thesaurus.vocabulary','SELECT')
    AND NOT has_column_privilege('service_role','thesaurus.vocabulary','name_i18n','SELECT'),
    'Service role must not read localized domain metadata directly';
  ASSERT has_function_privilege('bertel_thesaurus_publisher',
      'thesaurus.activate(uuid[],text[],text,bigint,jsonb)','EXECUTE')
    AND NOT has_function_privilege('authenticated',
      'thesaurus.activate(uuid[],text[],text,bigint,jsonb)','EXECUTE')
    AND NOT has_function_privilege('service_role',
      'thesaurus.activate(uuid[],text[],text,bigint,jsonb)','EXECUTE'),
    'Publisher activation must remain private to its existing publisher role';
END
$localized_domain_metadata_preflight$;

-- Use an isolated one-concept public domain so its four-language definitions are
-- real fixture source data before governance is enabled. Do not weaken policy or
-- alter the existing source catalogs to force a production-sized bootstrap.
INSERT INTO public.ref_code_domain_registry(domain,name,is_active,name_i18n)
VALUES('thesaurus_test_domain_metadata','Metadata test domain',true,
  '{"fr":"Domaine témoin des métadonnées","en":"Metadata test domain","es":"Dominio de prueba de metadatos","de":"Metadaten-Testbereich"}');
INSERT INTO thesaurus.vocabulary(domain,name,source_kind,is_public,is_governed,
  require_definition,required_languages,name_i18n)
VALUES('thesaurus_test_domain_metadata','Domaine témoin des métadonnées','ref_code',true,false,
  true,ARRAY['fr','en','es','de'],
  '{"fr":"Domaine témoin des métadonnées","en":"Metadata test domain","es":"Dominio de prueba de metadatos","de":"Metadaten-Testbereich"}');
INSERT INTO public.ref_code(id,domain,code,name,description,is_active,name_i18n,description_i18n)
VALUES('b8d00000-0000-4000-8000-000000000002','thesaurus_test_domain_metadata','test_entry',
  'Entrée témoin','Définition du terme témoin',true,
  '{"fr":"Entrée témoin","en":"Test entry","es":"Entrada de prueba","de":"Testeintrag"}',
  '{"fr":"Terme de démonstration pour le test des métadonnées.","en":"Demonstration term for metadata testing.","es":"Término de demostración para probar los metadatos.","de":"Begriff zur Demonstration und Prüfung der Metadaten."}');

DO $localized_domain_metadata_contract$
DECLARE
  locales CONSTANT text[]:=ARRAY['fr','en','es','de'];
  test_domains CONSTANT text[]:=ARRAY['thesaurus_test_domain_metadata'];
  initial_result jsonb;
  first_result jsonb;
  second_result jsonb;
  initial_manifest jsonb;
  first_manifest jsonb;
  second_manifest jsonb;
  edition_result jsonb;
  first_cursor_snapshot text;
  initial_release bigint;
  first_release bigint;
  second_release bigint;
  initial_checksum text;
  concept_checksum text;
  initial_metadata_checksum text;
  first_metadata_checksum text;
  initial_change_count bigint;
  first_change_count bigint;
  initial_revision_count bigint;
  bad jsonb;
BEGIN
  ASSERT (SELECT count(*)=1 FROM thesaurus.vocabulary
    WHERE domain=ANY(test_domains) AND is_public AND NOT is_governed),
    'The isolated test vocabulary must be the only public domain selected for the initial publication';
  ASSERT (SELECT count(*)=1 FROM public.ref_code WHERE domain=test_domains[1]),
    'Initial bootstrap must contain exactly one synthetic source concept';
  ASSERT NOT EXISTS(SELECT 1 FROM public.ref_code WHERE domain=test_domains[1]
    AND (name_i18n->>'fr' IS DISTINCT FROM name
      OR EXISTS(SELECT 1 FROM unnest(locales) lang
        WHERE NOT thesaurus.has_editorial_text(name_i18n->lang)
          OR NOT thesaurus.has_editorial_text(description_i18n->lang)))),
    'Synthetic source concept must have complete four-language labels and definitions before governance';

  PERFORM set_config('request.jwt.claims',
    '{"sub":"b8d00000-0000-4000-8000-000000000001","role":"authenticated"}',true);
  PERFORM api.thesaurus_admin('configure_instance',
    '{"base_uri":"https://example.invalid/api/public/thesaurus/concepts/","license":"test-fixture-only","attribution":"Domain metadata test"}');
  initial_result:=api.thesaurus_admin('bootstrap',jsonb_build_object(
    'domains',to_jsonb(test_domains),
    'expected_release_id',NULL,
    'idempotency_key','localized-domain-metadata-initial-bootstrap'));
  initial_release:=(initial_result->>'release_id')::bigint;
  SELECT manifest,checksum INTO initial_manifest,initial_checksum
  FROM thesaurus.release WHERE release_id=initial_release;
  ASSERT initial_release IS NOT NULL AND initial_result->>'idempotent'='false'
    AND (initial_result->>'changed_count')::integer=1,
    'Fresh metadata test must create a real first release and one actual source-concept addition';
  ASSERT jsonb_array_length(initial_manifest->'domains')=1
    AND (initial_manifest#>>'{domains,0,domain}')=test_domains[1]
    AND initial_manifest->>'metadata_scope'='release_snapshot'
    AND initial_manifest->>'metadata_checksum'=md5((initial_manifest->'domains')::text),
    'Initial release must snapshot exactly the selected public domain and its metadata';
  ASSERT (SELECT count(*)=1 FROM thesaurus.release_concept
    WHERE release_id=initial_release AND is_public
      AND document#>>'{definitions,en}'='Demonstration term for metadata testing.'
      AND document#>>'{definitions,es}'='Término de demostración para probar los metadatos.'
      AND document#>>'{definitions,de}'='Begriff zur Demonstration und Prüfung der Metadaten.'),
    'Initial published source snapshot must preserve the fixture definitions in all required languages';
  SELECT count(*) INTO initial_change_count FROM thesaurus.release_change;
  SELECT count(*) INTO initial_revision_count FROM thesaurus.revision;

  -- Change only domain metadata at its private source. The protected API call
  -- must produce a fresh manifest without creating a content revision/change.
  UPDATE thesaurus.vocabulary SET name_i18n=name_i18n||'{"en":"Metadata domain labels"}'::jsonb
  WHERE domain=test_domains[1];
  first_result:=api.thesaurus_admin('bootstrap',jsonb_build_object(
    'domains',to_jsonb(test_domains),
    'expected_release_id',initial_release,
    'idempotency_key','localized-domain-metadata-first-republish'));
  first_release:=(first_result->>'release_id')::bigint;
  SELECT manifest,checksum INTO first_manifest,concept_checksum
  FROM thesaurus.release WHERE release_id=first_release;
  ASSERT first_release IS NOT NULL AND first_release<>initial_release
    AND first_result->>'idempotent'='false'
    AND (first_result->>'changed_count')::integer=0,
    'Governed bootstrap must publish metadata-only updates without fake concept revisions';
  ASSERT first_manifest->>'metadata_scope'='release_snapshot'
    AND first_manifest->>'metadata_checksum'=md5((first_manifest->'domains')::text)
    AND first_manifest->>'metadata_checksum'<>initial_manifest->>'metadata_checksum'
    AND first_manifest->>'checksum'=initial_manifest->>'checksum'
    AND concept_checksum=initial_checksum,
    'Metadata checksum must change independently while the concept checksum remains stable';
  ASSERT jsonb_array_length(first_manifest->'domains')=1
    AND first_manifest#>>'{domains,0,name_i18n,en}'='Metadata domain labels',
    'Republished manifest must contain the corrected localized domain name';
  ASSERT NOT EXISTS(SELECT 1 FROM thesaurus.release_change WHERE release_id=first_release)
    AND (SELECT count(*) FROM thesaurus.release_change)=initial_change_count,
    'Metadata-only publication must not create release changes';
  ASSERT (SELECT count(*) FROM thesaurus.revision)=initial_revision_count,
    'Metadata-only publication must not create or rewrite revisions';
  ASSERT (SELECT manifest=initial_manifest AND checksum=initial_checksum
    FROM thesaurus.release WHERE release_id=initial_release),
    'First immutable release manifest and checksum must remain unchanged';

  first_metadata_checksum:=first_manifest->>'metadata_checksum';
  ASSERT NOT has_table_privilege('service_role','thesaurus.public_launch','INSERT')
    AND NOT has_function_privilege('authenticated','api.thesaurus_public_edition(text,bigint,jsonb)','EXECUTE')
    AND has_function_privilege('service_role','api.thesaurus_public_edition(text,bigint,jsonb)','EXECUTE'),
    'Only the server reader may request official editions; application roles cannot establish the launch';
  BEGIN
    PERFORM api.thesaurus_public_edition('manifest',NULL,'{}');
    RAISE EXCEPTION 'Official editions were served before the launch anchor was established';
  EXCEPTION WHEN SQLSTATE 'PT503' THEN NULL; END;
  INSERT INTO thesaurus.public_launch DEFAULT VALUES;
  edition_result:=api.thesaurus_public_edition('manifest',NULL,'{}');
  first_cursor_snapshot:=edition_result#>>'{meta,cursor_snapshot}';
  ASSERT edition_result#>>'{meta,release_id}'='1'
    AND edition_result#>'{meta,previous_release_id}'='null'
    AND jsonb_array_length(edition_result#>'{data,releases}')=1
    AND edition_result#>>'{data,releases,0,release_id}'='1'
    AND edition_result#>>'{data,metadata_checksum}'=first_metadata_checksum
    AND first_cursor_snapshot ~ '^[a-f0-9]{32}$'
    AND api.thesaurus_object_release()=1
    AND edition_result#>>'{data,changed_count}'='1',
    'First official discovery must project the selected release as edition 1 with no prelaunch history';
  edition_result:=api.thesaurus_public_edition('changes',1,'{"page_size":1}');
  ASSERT edition_result#>>'{meta,total}'='1'
    AND edition_result#>>'{data,0,change_type}'='added'
    AND edition_result#>'{data,0,before}'='null',
    'The baseline edition must expose its public concept as an initial addition';

  -- A technical sequence gap must not consume an official edition number.
  PERFORM nextval(pg_get_serial_sequence('thesaurus.release','release_id'));
  UPDATE thesaurus.vocabulary SET name_i18n=name_i18n||'{"en":"Reviewed metadata domain labels"}'::jsonb
  WHERE domain=test_domains[1];
  second_result:=api.thesaurus_admin('bootstrap',jsonb_build_object(
    'domains',to_jsonb(test_domains),
    'expected_release_id',first_release,
    'idempotency_key','localized-domain-metadata-second-republish'));
  second_release:=(second_result->>'release_id')::bigint;
  SELECT manifest INTO second_manifest FROM thesaurus.release WHERE release_id=second_release;
  ASSERT second_release IS NOT NULL AND second_release<>first_release
    AND second_result->>'idempotent'='false'
    AND (second_result->>'changed_count')::integer=0,
    'A second metadata-only bootstrap must create a fresh snapshot with no content changes';
  ASSERT second_manifest->>'metadata_checksum'=md5((second_manifest->'domains')::text)
    AND second_manifest->>'metadata_checksum'<>first_metadata_checksum
    AND second_manifest->>'checksum'=concept_checksum,
    'Second metadata republish must update only the separate metadata checksum';
  ASSERT second_manifest#>>'{domains,0,name_i18n,en}'='Reviewed metadata domain labels',
    'Second release must snapshot the latest localized domain name';
  ASSERT (SELECT manifest=first_manifest FROM thesaurus.release WHERE release_id=first_release)
    AND (SELECT manifest=initial_manifest AND checksum=initial_checksum
      FROM thesaurus.release WHERE release_id=initial_release),
    'Older release manifests must remain immutable after repeated metadata edits';
  edition_result:=api.thesaurus_public_edition('manifest',NULL,'{}');
  ASSERT second_release>first_release+1
    AND edition_result#>>'{meta,release_id}'='1'
    AND edition_result#>'{meta,previous_release_id}'='null'
    AND jsonb_array_length(edition_result#>'{data,releases}')=1
    AND edition_result#>>'{data,releases,0,metadata_checksum}'=second_manifest->>'metadata_checksum'
    AND edition_result#>>'{meta,cursor_snapshot}'<>first_cursor_snapshot
    AND api.thesaurus_object_release()=1
    AND api.thesaurus_generation()=second_release,
    'A retouch and internal sequence gap must leave public discovery and object metadata at edition 1';
  edition_result:=api.thesaurus_public_edition('release',1,'{}');
  ASSERT edition_result#>>'{data,metadata_checksum}'=second_manifest->>'metadata_checksum'
    AND edition_result#>>'{data,checksum}'=concept_checksum
    AND (api.thesaurus_public('release',initial_release,'{}')->'data')=initial_manifest,
    'During preparation edition 1 must follow the current content without changing technical history';
  BEGIN
    PERFORM api.thesaurus_public_edition('release',2,'{}');
    RAISE EXCEPTION 'Unpublished official edition was readable';
  EXCEPTION WHEN SQLSTATE 'PT404' THEN NULL; END;
  BEGIN
    PERFORM api.thesaurus_public_edition('concepts',1,jsonb_build_object('cursor_snapshot',first_cursor_snapshot));
    RAISE EXCEPTION 'Pagination continued against a different technical snapshot';
  EXCEPTION WHEN SQLSTATE 'PT400' THEN
    ASSERT SQLERRM='invalid_cursor', 'A stale edition cursor must be rejected explicitly';
  END;

  -- CHECK rejects malformed, missing, blank and French-mismatched translations.
  FOR bad IN SELECT value FROM jsonb_array_elements(jsonb_build_array(
    '{}'::jsonb,
    '{"fr":"Domaine","en":"Domain","es":"Dominio"}'::jsonb,
    '{"fr":"Domaine","en":" ","es":"Dominio","de":"Bereich"}'::jsonb,
    '{"fr":null,"en":"Domain","es":"Dominio","de":"Bereich"}'::jsonb,
    '{"fr":"Autre domaine","en":"Domain","es":"Dominio","de":"Bereich"}'::jsonb,
    'null'::jsonb
  )) LOOP
    BEGIN
      UPDATE thesaurus.vocabulary SET name_i18n=bad
      WHERE domain=test_domains[1];
      RAISE EXCEPTION 'Malformed domain translations were accepted: %',bad;
    EXCEPTION WHEN check_violation THEN NULL; END;
  END LOOP;
  ASSERT (SELECT name_i18n->>'en'='Reviewed metadata domain labels'
    FROM thesaurus.vocabulary WHERE domain=test_domains[1]),
    'Rejected invalid updates must leave the current valid translation untouched';

  PERFORM set_config('request.jwt.claims',
    '{"sub":"b8d00000-0000-4000-8000-000000000002","role":"authenticated"}',true);
  BEGIN
    PERFORM api.thesaurus_admin('bootstrap',jsonb_build_object(
      'domains',to_jsonb(test_domains),'expected_release_id',second_release,
      'idempotency_key','localized-domain-metadata-denied'));
    RAISE EXCEPTION 'Ordinary authenticated user entered the metadata bootstrap';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  PERFORM set_config('request.jwt.claims',
    '{"sub":"b8d00000-0000-4000-8000-000000000001","role":"authenticated"}',true);
  BEGIN
    PERFORM api.thesaurus_admin('bootstrap',jsonb_build_object(
      'domains',jsonb_build_array('crm_sentiment'),
      'expected_release_id',second_release,
      'idempotency_key','localized-domain-metadata-private-denied'));
    RAISE EXCEPTION 'Private domain entered a public metadata snapshot';
  EXCEPTION WHEN SQLSTATE 'PT400' THEN NULL; END;

  ASSERT NOT EXISTS(SELECT 1 FROM thesaurus.release_change WHERE release_id IN(initial_release,first_release,second_release)
    AND release_id<>initial_release),
    'The two metadata-only releases must contain no concept release changes';
  ASSERT (SELECT count(*)=initial_revision_count FROM thesaurus.revision),
    'Metadata bootstrap must leave the revision count unchanged';

  UPDATE thesaurus.public_launch SET first_release_id=second_release WHERE singleton;
  PERFORM nextval(pg_get_serial_sequence('thesaurus.release','release_id'));
  PERFORM api.thesaurus_admin('bootstrap',jsonb_build_object('domains',to_jsonb(test_domains),
    'expected_release_id',second_release,'idempotency_key','localized-domain-metadata-after-freeze'));
  edition_result:=api.thesaurus_public_edition('manifest',NULL,'{}');
  ASSERT edition_result#>>'{meta,release_id}'='2'
    AND edition_result#>>'{meta,previous_release_id}'='1'
    AND jsonb_array_length(edition_result#>'{data,releases}')=2
    AND edition_result#>>'{data,releases,1,metadata_checksum}'=second_manifest->>'metadata_checksum'
    AND api.thesaurus_object_release()=2,
    'Only a publication after explicit freeze may become edition 2, even when the technical sequence has gaps';
  RAISE NOTICE 'Localized domain metadata: fresh protected bootstrap, metadata-only republish, checksum separation, immutable history, translation validation, exposure and ACL passed';
END
$localized_domain_metadata_contract$;

ROLLBACK;


