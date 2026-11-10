-- Disposable database only: real single-item editorial dispatch reused by batches.
-- Synthetic test identities are confined to this transaction and always roll back.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout='120s';
INSERT INTO auth.users(id,email) VALUES
 ('b7ba0000-0000-4000-8000-000000000001','thesaurus-batches@example.invalid') ON CONFLICT DO NOTHING;
INSERT INTO public.app_user_profile(id,role,display_name) VALUES
 ('b7ba0000-0000-4000-8000-000000000001','super_admin','Admin batch test')
ON CONFLICT(id) DO UPDATE SET role='super_admin';
SELECT set_config('request.jwt.claims',
 '{"sub":"b7ba0000-0000-4000-8000-000000000001","role":"authenticated"}',true);
INSERT INTO thesaurus.vocabulary(domain,name,source_kind,is_governed,is_public)
VALUES ('test_admin_batch_private','Domaine privé témoin','ref_code',true,false);
INSERT INTO thesaurus.concept(concept_id,domain,code,source_kind,source_id) VALUES
 ('b7ba0000-0000-4000-8000-000000000002','test_admin_batch_private','first','ref_code','b7ba1000-0000-4000-8000-000000000002'),
 ('b7ba0000-0000-4000-8000-000000000003','test_admin_batch_private','second','ref_code','b7ba1000-0000-4000-8000-000000000003');

DO $bounded_atomic_batches$
DECLARE doc jsonb:='{"name":"Une étoile","description":"Niveau une étoile du classement officiel des hôtels.","name_i18n":{"en":"One star","es":"Una estrella","de":"Ein Stern"},"description_i18n":{"en":"One-star level in the official hotel classification.","es":"Nivel de una estrella en la clasificación oficial de hoteles.","de":"Ein-Stern-Stufe der offiziellen Hotelklassifizierung."}}';
 first_id uuid:='b7ba0000-0000-4000-8000-000000000002'; second_id uuid:='b7ba0000-0000-4000-8000-000000000003';
 first_item jsonb; second_item jsonb; items jsonb; saved jsonb; validated jsonb; bad jsonb; revision_id uuid;
BEGIN
  first_item:=jsonb_build_object('concept_id',first_id,'domain','test_admin_batch_private',
    'expected_version',0,'expected_source_fingerprint',thesaurus.source_fingerprint(first_id),
    'only_if_no_revision',true,'document',doc);
  second_item:=jsonb_build_object('concept_id',second_id,'domain','test_admin_batch_private',
    'expected_version',0,'expected_source_fingerprint',thesaurus.source_fingerprint(second_id),
    'only_if_no_revision',true,'document',doc);
  BEGIN
    PERFORM api.thesaurus_admin('save_drafts',jsonb_build_object('items',
      jsonb_build_array(first_item,second_item||'{"expected_source_fingerprint":"stale"}')));
    RAISE EXCEPTION 'A stale second item was accepted';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;END;
  ASSERT NOT EXISTS(SELECT 1 FROM thesaurus.revision WHERE concept_id IN(first_id,second_id)),
    'A failed save batch must roll back its earlier successful items';

  saved:=api.thesaurus_admin('save_drafts',jsonb_build_object('items',jsonb_build_array(first_item,second_item)));
  ASSERT jsonb_array_length(saved->'items')=2, 'Save batch must return both full single-item results';
  ASSERT saved#>>'{items,0,concept_id}'=first_id::text AND saved#>>'{items,1,concept_id}'=second_id::text,
    'Batch response must preserve input order';
  items:=jsonb_build_array(
    jsonb_build_object('revision_id',saved#>>'{items,0,revision_id}','expected_version',1),
    jsonb_build_object('revision_id',saved#>>'{items,1,revision_id}','expected_version',999));
  BEGIN
    PERFORM api.thesaurus_admin('validate_drafts',jsonb_build_object('items',items));
    RAISE EXCEPTION 'A stale validation version was accepted';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;END;
  ASSERT (SELECT count(*)=2 FROM thesaurus.revision
    WHERE concept_id IN(first_id,second_id) AND status='draft' AND version=1),
    'A failed validation batch must preserve the earlier draft status and version';
  items:=jsonb_set(items,'{1,expected_version}','1'::jsonb);
  validated:=api.thesaurus_admin('validate_drafts',jsonb_build_object('items',items));
  ASSERT (SELECT bool_and(value->>'status'='validated' AND (value->>'version')::integer=2)
    FROM jsonb_array_elements(validated->'items')), 'Validation results must retain normal version semantics';
  ASSERT (SELECT count(*)=2 FROM thesaurus.revision WHERE concept_id IN(first_id,second_id) AND status='validated'),
    'Batch validation must not publish';
  BEGIN
    PERFORM api.thesaurus_admin('save_drafts',jsonb_build_object('items',jsonb_build_array(first_item)));
    RAISE EXCEPTION 'Batch overwrite ignored only_if_no_revision';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;END;

  FOREACH bad IN ARRAY ARRAY['{}'::jsonb,'{"items":null}'::jsonb,'{"items":[]}'::jsonb,'{"items":[null]}'::jsonb] LOOP
    BEGIN
      PERFORM api.thesaurus_admin('save_drafts',bad);
      RAISE EXCEPTION 'Malformed batch was accepted';
    EXCEPTION WHEN SQLSTATE 'PT400' THEN NULL;END;
  END LOOP;
  SELECT jsonb_agg('{}'::jsonb) INTO items FROM generate_series(1,101);
  BEGIN
    PERFORM api.thesaurus_admin('validate_drafts',jsonb_build_object('items',items));
    RAISE EXCEPTION 'Oversized batch was accepted';
  EXCEPTION WHEN SQLSTATE 'PT400' THEN NULL;END;

  -- Normal creation remains available after an internal vocabulary is governed.
  saved:=api.thesaurus_admin('save_draft',jsonb_build_object('domain','test_admin_batch_private',
    'document',doc||'{"code":"new_private_concept"}'));
  ASSERT saved->>'status'='draft', 'A governed private vocabulary must retain normal draft creation';
  ASSERT NOT (SELECT is_public FROM thesaurus.vocabulary WHERE domain='test_admin_batch_private'),
    'Private creation must never change public exposure';
END $bounded_atomic_batches$;

-- More than 200 pending revisions makes pagination and omission non-vacuous.
INSERT INTO thesaurus.concept(domain,code,source_kind,source_id)
SELECT 'test_admin_batch_private','page_'||n,'ref_code',gen_random_uuid()::text
FROM generate_series(1,205)n;
INSERT INTO thesaurus.revision(concept_id,document,base_fingerprint)
SELECT concept_id,'{"name":"Témoin de pagination","description":"Concept privé réservé au contrôle de la liste des brouillons."}',
 thesaurus.source_fingerprint(concept_id) FROM thesaurus.concept
WHERE domain='test_admin_batch_private' AND code LIKE 'page\_%' ESCAPE '\';

DO $workspace_scope_and_pagination$
DECLARE legacy jsonb; complete jsonb; omitted jsonb; page jsonb; selected uuid[];
BEGIN
  legacy:=api.thesaurus_admin('workspace','{"read_only":true,"domain":"test_admin_batch_private"}');
  ASSERT jsonb_array_length(legacy->'concepts')=0, 'Default workspace scope must preserve legacy public-only behavior';
  ASSERT NOT EXISTS(SELECT 1 FROM jsonb_array_elements(legacy->'domains')d WHERE d->>'domain'='test_admin_batch_private'),
    'Default domain list must retain legacy scope';
  ASSERT jsonb_array_length(legacy->'revisions')=200, 'Default pending revision cap must remain 200';
  complete:=api.thesaurus_admin('workspace',
    '{"read_only":true,"include_internal":true,"domain":"test_admin_batch_private","page_size":200,"revision_page_size":2000}');
  ASSERT jsonb_array_length(complete->'concepts')=200, 'Internal concepts must use the ordinary concept pagination';
  ASSERT EXISTS(SELECT 1 FROM jsonb_array_elements(complete->'domains')d WHERE d->>'domain'='test_admin_batch_private'),
    'Explicit internal workspace must include private vocabularies';
  ASSERT (complete#>>'{stats,matching_concepts}')::integer=208,
    'Internal matching stats must use the same scope as the concept list';
  ASSERT jsonb_array_length(complete->'revisions')>=208, 'Expanded revision page must cover the complete pending batch';
  page:=api.thesaurus_admin('workspace',
    '{"read_only":true,"include_internal":true,"domain":"test_admin_batch_private","offset":200,"page_size":200,"revision_offset":200,"revision_page_size":2000}');
  ASSERT jsonb_array_length(page->'concepts')=8, 'The next concept page must retain every remaining private concept';
  ASSERT NOT EXISTS(SELECT 1 FROM jsonb_array_elements(legacy->'revisions')a
    JOIN jsonb_array_elements(page->'revisions')b ON a->>'revision_id'=b->>'revision_id'),
    'Revision offsets need a stable order with no overlap';
  selected:=ARRAY['b7ba0000-0000-4000-8000-000000000002'::uuid,'b7ba0000-0000-4000-8000-000000000003'::uuid];
  omitted:=api.thesaurus_admin('workspace',jsonb_build_object('read_only',true,'include_internal',true,
    'include_revisions',false,'concept_ids',to_jsonb(selected)));
  ASSERT jsonb_array_length(omitted->'revisions')=0, 'Bulk lookup can omit the global revision list';
  ASSERT jsonb_array_length(omitted->'concepts')=2 AND
    (SELECT bool_and(jsonb_typeof(c->'revision')='object') FROM jsonb_array_elements(omitted->'concepts')c),
    'Bulk lookup must still retain each concept revision for overwrite conflicts';
  ASSERT complete#>>'{capabilities,admin_batch_operations}'='1' AND
    complete#>>'{capabilities,internal_workspace}'='1', 'Batch clients need explicit capability detection';
END $workspace_scope_and_pagination$;

SELECT set_config('request.jwt.claims','{}',true);
DO $authenticated_scope_only$
BEGIN
  BEGIN
    PERFORM api.thesaurus_admin('save_drafts','{"items":[{}]}');
    RAISE EXCEPTION 'Anonymous caller entered a batch';
  EXCEPTION WHEN insufficient_privilege THEN NULL;END;
  BEGIN
    PERFORM api.thesaurus_admin('workspace','{"include_internal":true}');
    RAISE EXCEPTION 'Anonymous caller read the internal workspace';
  EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $authenticated_scope_only$;

-- Public readers continue to filter the immutable row's is_public flag.
CREATE TEMP TABLE _admin_batch_release(release_id bigint) ON COMMIT DROP;
WITH added AS (
 INSERT INTO thesaurus.release(idempotency_key,manifest) VALUES('test-private-batch-exposure','{"domains":[]}')
 RETURNING release_id
) INSERT INTO _admin_batch_release SELECT release_id FROM added;
GRANT SELECT ON _admin_batch_release TO bertel_thesaurus_publisher;
SET LOCAL ROLE bertel_thesaurus_publisher;
INSERT INTO thesaurus.release_concept(release_id,concept_id,domain,is_public,document,checksum)
SELECT release_id,'b7ba0000-0000-4000-8000-000000000002','test_admin_batch_private',false,
 '{"preferred_labels":{"fr":"Une étoile","en":"One star","es":"Una estrella","de":"Ein Stern"},"definitions":{"fr":"Niveau une étoile du classement officiel des hôtels.","en":"One-star level in the official hotel classification.","es":"Nivel de una estrella en la clasificación oficial de hoteles.","de":"Ein-Stern-Stufe der offiziellen Hotelklassifizierung."}}','fixture'
FROM _admin_batch_release;
UPDATE thesaurus.release SET checksum='private-batch-complete'
WHERE release_id=(SELECT release_id FROM _admin_batch_release);
RESET ROLE;
DO $private_stays_private$
DECLARE rid bigint; response jsonb;
BEGIN
  SELECT release_id INTO rid FROM _admin_batch_release;
  response:=api.thesaurus_public('export',rid,'{}');
  ASSERT jsonb_array_length(response->'data')=0, 'Private concepts must remain absent from public export';
  response:=api.thesaurus_public('concepts',rid,'{}');
  ASSERT jsonb_array_length(response->'data')=0, 'Private concepts must remain absent from public concept lists';
  BEGIN
    PERFORM api.thesaurus_public('concept',rid,'{"concept_id":"b7ba0000-0000-4000-8000-000000000002"}');
    RAISE EXCEPTION 'Private concept was readable through the public API';
  EXCEPTION WHEN SQLSTATE 'PT404' THEN NULL;END;
END $private_stays_private$;
ROLLBACK;
