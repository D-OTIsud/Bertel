-- Disposable database only. All identities, role membership, source fixtures,
-- normal publications and their outbox events roll back with this transaction.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout='120s';
INSERT INTO auth.users(id,email) VALUES
 ('b71e0000-0000-4000-8000-000000000001','thesaurus-legacy@example.invalid') ON CONFLICT DO NOTHING;
INSERT INTO public.app_user_profile(id,role,display_name) VALUES
 ('b71e0000-0000-4000-8000-000000000001','super_admin','Legacy search test')
ON CONFLICT(id) DO UPDATE SET role='super_admin';
SELECT set_config('request.jwt.claims',
 '{"sub":"b71e0000-0000-4000-8000-000000000001","role":"authenticated"}',true);
DO $publisher_fixture_membership$
BEGIN
  EXECUTE format('GRANT bertel_thesaurus_publisher TO %I WITH INHERIT FALSE, SET TRUE',current_user);
END $publisher_fixture_membership$;

-- The three document types are a small real adapter corpus. Make all its source
-- definitions complete in the disposable fixture before activating its domain.
SET LOCAL ROLE bertel_thesaurus_publisher;
UPDATE public.ref_code SET
 description='Document de présentation ou de justification lié à une fiche touristique.',
 name_i18n=jsonb_build_object('fr',name,'en','Test document '||code,'es','Documento de prueba '||code,'de','Testdokument '||code),
 description_i18n='{"fr":"Document de présentation ou de justification lié à une fiche touristique.","en":"Presentation or supporting document linked to a tourism listing.","es":"Documento de presentación o justificación vinculado a una ficha turística.","de":"Vorstellungs- oder Nachweisdokument zu einem touristischen Eintrag."}'
WHERE domain='document_type';
UPDATE public.ref_code SET metadata=COALESCE(metadata,'{}')||'{"aliases":["Ancien terme témoin"]}'
WHERE domain='document_type' AND code='brochure';
RESET ROLE;
SELECT thesaurus.sync_sources(NULL);
UPDATE thesaurus.concept SET legacy_search_terms=ARRAY['Ancien terme témoin']
WHERE domain='document_type' AND code='brochure';

-- Reuse the genuine RPC save -> validate -> preview -> publish sequence.
CREATE FUNCTION pg_temp.publish_legacy_test_revision(p_revision jsonb,p_key text)
RETURNS jsonb LANGUAGE plpgsql AS $publish$
DECLARE revision jsonb; preview jsonb;
BEGIN
 revision:=api.thesaurus_admin('validate_draft',jsonb_build_object(
   'revision_id',p_revision->>'revision_id','expected_version',(p_revision->>'version')::integer));
 preview:=api.thesaurus_admin('preview',jsonb_build_object('revision_ids',jsonb_build_array(revision->>'revision_id')));
 ASSERT jsonb_array_length(preview->'errors')=0,'Test publication preview must be valid';
 RETURN api.thesaurus_admin('publish',jsonb_build_object(
   'revision_ids',jsonb_build_array(revision->>'revision_id'),'idempotency_key',p_key,
   'expected_release_id',api.thesaurus_generation(),
   'expected_revision_versions',jsonb_build_object(revision->>'revision_id',(revision->>'version')::integer),
   'preview_fingerprint',preview->>'preview_fingerprint'));
END $publish$;

DO $legacy_roundtrip$
DECLARE cid uuid; source_id uuid; doc jsonb; revision jsonb; publication jsonb;
 result jsonb; bad jsonb; old_fp text; rid bigint; contract jsonb; staged jsonb;
BEGIN
  SELECT concept_id,c.source_id::uuid INTO cid,source_id FROM thesaurus.concept c
  WHERE domain='document_type' AND code='brochure';
  ASSERT cid IS NOT NULL,'Document-type fixture must exist';
  PERFORM api.thesaurus_admin('configure_instance',
    '{"base_uri":"https://example.invalid/api/public/thesaurus/concepts/","license":"fixture-only","attribution":"Disposable legacy-search contract fixture"}');
  doc:=thesaurus.concept_document(cid);
  ASSERT doc->'legacy_search_terms'='["Ancien terme témoin"]'::jsonb,
    'Admin document must expose canonical legacy search terms';
  ASSERT (api.thesaurus_admin('workspace',jsonb_build_object('read_only',true,'concept_ids',jsonb_build_array(cid)))
    #>'{concepts,0,legacy_search_terms}')='["Ancien terme témoin"]'::jsonb,
    'The workspace must retain terms for optimistic field comparison';
  staged:=api.thesaurus_admin('save_draft',jsonb_build_object('domain','document_type','document',
    jsonb_build_object('code','test_staged_legacy','name','Document inédit témoin',
      'description','Document de présentation lié à une offre touristique.',
      'name_i18n','{"en":"New test document","es":"Documento nuevo de prueba","de":"Neues Testdokument"}'::jsonb,
      'description_i18n','{"en":"Presentation document linked to a tourism offer.","es":"Documento de presentación vinculado a una oferta turística.","de":"Vorstellungsdokument zu einem touristischen Angebot."}'::jsonb,
      'legacy_search_terms',jsonb_build_array('Recherche du brouillon inédit'))));
  ASSERT thesaurus.concept_document((staged->>'concept_id')::uuid)->'legacy_search_terms'=
    '["Recherche du brouillon inédit"]'::jsonb,'Staged document must retain proposed terms before its first native source exists';
  ASSERT (SELECT legacy_search_terms='{}'::text[] FROM thesaurus.concept
    WHERE concept_id=(staged->>'concept_id')::uuid),'Staged draft must not persist canonical terms early';
  PERFORM api.thesaurus_admin('discard_draft',jsonb_build_object('revision_id',staged->>'revision_id',
    'expected_version',(staged->>'version')::integer));
  ASSERT NOT EXISTS(SELECT 1 FROM thesaurus.concept WHERE concept_id=(staged->>'concept_id')::uuid),
    'Discarding an unpublished source-less fixture must remove its staged concept';
  staged:=api.thesaurus_admin('save_draft',jsonb_build_object('domain','document_type','document',
    jsonb_build_object('code','test_new_published_legacy','name','Document publié inédit témoin',
      'description','Document de présentation lié à une offre touristique.',
      'name_i18n','{"en":"New published test document","es":"Documento nuevo publicado de prueba","de":"Neues veröffentlichtes Testdokument"}'::jsonb,
      'description_i18n','{"en":"Presentation document linked to a tourism offer.","es":"Documento de presentación vinculado a una oferta turística.","de":"Vorstellungsdokument zu einem touristischen Angebot."}'::jsonb,
      'legacy_search_terms',jsonb_build_array('Recherche de la première publication'))));
  PERFORM pg_temp.publish_legacy_test_revision(staged,'test-legacy-first-native-publication');
  ASSERT (SELECT legacy_search_terms=ARRAY['Recherche de la première publication'] FROM thesaurus.concept
    WHERE concept_id=(staged->>'concept_id')::uuid),'First normal publication must persist new-concept terms';
  ASSERT EXISTS(SELECT 1 FROM public.ref_code
    WHERE domain='document_type' AND code='test_new_published_legacy'
      AND metadata->'aliases' @> '["Recherche de la première publication"]'::jsonb),
    'First publication must create the native source with its proposed search alias';
  old_fp:=thesaurus.source_fingerprint(cid);
  revision:=api.thesaurus_admin('save_draft',jsonb_build_object('concept_id',cid,
    'expected_version',0,'expected_source_fingerprint',old_fp,'only_if_no_revision',true,
    'document',jsonb_build_object('legacy_search_terms',jsonb_build_array('Nouveau terme témoin'),
      'labels',COALESCE(doc->'labels','[]')||'[{"lang":"fr","kind":"alt","value":"Synonyme témoin conservé"}]'::jsonb)));
  ASSERT (SELECT legacy_search_terms=ARRAY['Ancien terme témoin'] FROM thesaurus.concept WHERE concept_id=cid),
    'Saving a draft must not change canonical legacy terms';
  ASSERT (SELECT metadata->'aliases'='["Ancien terme témoin"]'::jsonb
    FROM public.ref_code WHERE id=source_id AND domain='document_type'),
    'Saving a draft must not update native search aliases';
  publication:=pg_temp.publish_legacy_test_revision(revision,'test-legacy-publish-update');
  rid:=(publication->>'release_id')::bigint;
  ASSERT (SELECT legacy_search_terms=ARRAY['Nouveau terme témoin'] FROM thesaurus.concept WHERE concept_id=cid),
    'Normal publication must persist the proposed terms';
  ASSERT (SELECT metadata->'aliases' @> '["Nouveau terme témoin","Synonyme témoin conservé"]'::jsonb
    AND NOT metadata->'aliases' @> '["Ancien terme témoin"]'::jsonb
    FROM public.ref_code WHERE id=source_id AND domain='document_type'),
    'Native aliases must use newly published legacy terms plus editorial labels';
  result:=api.thesaurus_public('concept',rid,jsonb_build_object('concept_id',cid));
  ASSERT NOT (result->'data')?'legacy_search_terms','Private legacy terms must not enter public concept documents';
  ASSERT NOT EXISTS(SELECT 1 FROM jsonb_array_elements(api.thesaurus_public('export',rid,'{}')->'data') item
    WHERE item?'legacy_search_terms'),'Private legacy terms must not enter public exports';

  -- A client editing another field without sending legacy_search_terms preserves
  -- the canonical array through the same normal editorial circuit.
  revision:=api.thesaurus_admin('save_draft',jsonb_build_object('concept_id',cid,'expected_version',0,
    'document','{"description":"Document présentant une offre touristique dans la version relue de cette fiche."}'::jsonb));
  PERFORM pg_temp.publish_legacy_test_revision(revision,'test-legacy-publish-omission');
  ASSERT (SELECT legacy_search_terms=ARRAY['Nouveau terme témoin'] FROM thesaurus.concept WHERE concept_id=cid),
    'Omitted terms must remain unchanged';

  FOREACH bad IN ARRAY ARRAY['null'::jsonb,'{}'::jsonb,'[42]'::jsonb,'[null]'::jsonb,
    '[""]'::jsonb,jsonb_build_array(E'\t\n'::text),jsonb_build_array(U&'\2060'::text),
    jsonb_build_array(U&'\200D'::text)] LOOP
    BEGIN
      PERFORM api.thesaurus_admin('save_draft',jsonb_build_object('concept_id',cid,'expected_version',0,
        'document',jsonb_build_object('legacy_search_terms',bad)));
      RAISE EXCEPTION 'Invalid legacy terms were accepted';
    EXCEPTION WHEN SQLSTATE 'PT400' THEN NULL;END;
  END LOOP;
  BEGIN
    PERFORM api.thesaurus_admin('save_draft',jsonb_build_object('concept_id',cid,'expected_version',0,
      'expected_source_fingerprint','stale','document','{"legacy_search_terms":[]}'::jsonb));
    RAISE EXCEPTION 'Stale source fingerprint was accepted';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;END;

  revision:=api.thesaurus_admin('save_draft',jsonb_build_object('concept_id',cid,'expected_version',0,
    'document','{"legacy_search_terms":[]}'::jsonb));
  ASSERT (SELECT legacy_search_terms=ARRAY['Nouveau terme témoin'] FROM thesaurus.concept WHERE concept_id=cid),
    'Clearing a draft must not clear published terms';
  PERFORM pg_temp.publish_legacy_test_revision(revision,'test-legacy-publish-clear');
  ASSERT (SELECT legacy_search_terms='{}'::text[] FROM thesaurus.concept WHERE concept_id=cid),
    'An explicit empty array must really clear canonical terms after publication';
  ASSERT (SELECT NOT metadata->'aliases' @> '["Nouveau terme témoin"]'::jsonb
    AND metadata->'aliases' @> '["Synonyme témoin conservé"]'::jsonb
    FROM public.ref_code WHERE id=source_id AND domain='document_type'),
    'Clearing legacy terms must preserve editorial aliases';

  old_fp:=thesaurus.source_fingerprint(cid);
  revision:=api.thesaurus_admin('save_draft',jsonb_build_object('concept_id',cid,'expected_version',0,
    'document','{"legacy_search_terms":["Proposition locale"]}'::jsonb));
  -- Simulate an external canonical change only in this disposable conflict fixture.
  UPDATE thesaurus.concept SET legacy_search_terms=ARRAY['Changement concurrent'] WHERE concept_id=cid;
  ASSERT thesaurus.source_fingerprint(cid)<>old_fp,'Legacy terms must participate in source fingerprints';
  BEGIN
    PERFORM api.thesaurus_admin('validate_draft',jsonb_build_object('revision_id',revision->>'revision_id',
      'expected_version',(revision->>'version')::integer));
    RAISE EXCEPTION 'Validation ignored a concurrent legacy-term change';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;END;
  BEGIN
    PERFORM api.thesaurus_admin('rebase_draft',jsonb_build_object('revision_id',revision->>'revision_id',
      'expected_version',(revision->>'version')::integer));
    RAISE EXCEPTION 'Rebase silently overwrote conflicting legacy terms';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;END;
  contract:=thesaurus.preparation_contract_registry();
  ASSERT contract->'functions'->>'thesaurus.apply_source(uuid,jsonb)'=
    md5(pg_get_functiondef('thesaurus.apply_source(uuid,jsonb)'::regprocedure)),
    'Prepared publication registry must contain the reviewed writer hash';
  PERFORM thesaurus.assert_preparation_contract();
END $legacy_roundtrip$;
ROLLBACK;
