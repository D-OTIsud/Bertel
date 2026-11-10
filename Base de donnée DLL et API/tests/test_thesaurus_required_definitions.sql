-- Disposable database only. Synthetic auth fixtures and every write roll back.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout='60s';

INSERT INTO auth.users(id,email) VALUES
 ('b7df0000-0000-4000-8000-000000000001','thesaurus-definitions@example.invalid') ON CONFLICT DO NOTHING;
INSERT INTO public.app_user_profile(id,role,display_name) VALUES
 ('b7df0000-0000-4000-8000-000000000001','super_admin','Definition policy test')
ON CONFLICT(id) DO UPDATE SET role='super_admin';
SELECT set_config('request.jwt.claims',
 '{"sub":"b7df0000-0000-4000-8000-000000000001","role":"authenticated"}',true);

-- Private and ungoverned vocabularies obey the same editorial invariant.
INSERT INTO thesaurus.vocabulary(domain,name,source_kind)
VALUES ('test_definition_policy','Domaine privé témoin','ref_code');
INSERT INTO thesaurus.concept(concept_id,domain,code,source_kind,source_id)
VALUES ('b7df0000-0000-4000-8000-000000000002','test_definition_policy',
 'test_definition','ref_code','b7df0000-0000-4000-8000-000000000003');

DO $draft_checks$
DECLARE cid uuid:='b7df0000-0000-4000-8000-000000000002';
 doc jsonb:='{"name":"Une étoile","description":"Niveau une étoile du classement officiel des hôtels."}';
 bad jsonb; quality jsonb;
BEGIN
  ASSERT NOT EXISTS(SELECT 1 FROM thesaurus.vocabulary WHERE require_definition IS NOT TRUE),
    'Definitions must be mandatory for every public and private vocabulary';
  ASSERT (SELECT require_definition FROM thesaurus.vocabulary WHERE domain='test_definition_policy'),
    'New vocabularies must default to mandatory definitions';
  BEGIN
    UPDATE thesaurus.vocabulary SET require_definition=false WHERE domain='test_definition_policy';
    RAISE EXCEPTION 'Direct policy weakening was accepted';
  EXCEPTION WHEN check_violation THEN NULL;END;
  BEGIN
    PERFORM api.thesaurus_admin('configure_domain',
      '{"domain":"test_definition_policy","require_definition":false}');
    RAISE EXCEPTION 'Configuration disabled mandatory definitions';
  EXCEPTION WHEN SQLSTATE 'PT400' THEN
    ASSERT SQLERRM LIKE '%ne peut pas être désactivée%', 'The refusal must explain the invariant';
  END;
  PERFORM api.thesaurus_admin('configure_domain',
    '{"domain":"test_definition_policy","require_definition":true}');
  ASSERT NOT (SELECT is_public OR is_governed FROM thesaurus.vocabulary WHERE domain='test_definition_policy'),
    'Changing definition policy must not change publication or governance';

  quality:=thesaurus.validate_document(cid,doc);
  ASSERT jsonb_array_length(quality->'errors')=0, 'A concise contextual definition is valid';
  FOREACH bad IN ARRAY ARRAY['null'::jsonb,'42'::jsonb,'true'::jsonb,'{}'::jsonb,'[]'::jsonb,
    to_jsonb(''::text),to_jsonb(E'\t\n\r'::text),to_jsonb(U&'\00A0\200B\202F\FEFF'::text)] LOOP
    quality:=thesaurus.validate_document(cid,jsonb_set(doc,'{description}',bad));
    ASSERT jsonb_array_length(quality->'errors')>0,
      format('Non-text or invisible definition must be rejected: %s',bad);
  END LOOP;
  ASSERT jsonb_array_length(thesaurus.validate_document(cid,
    (doc-'description')||'{"description_i18n":{"fr":"Traduction française de secours"}}')->'errors')>0,
    'Missing authoritative French definition cannot hide behind description_i18n.fr';

  UPDATE thesaurus.vocabulary SET required_languages=ARRAY['fr','en'] WHERE domain='test_definition_policy';
  quality:=thesaurus.validate_document(cid,doc||'{"name_i18n":{"en":"One star"}}');
  ASSERT (quality->'errors')::text LIKE '%en%', 'Required translated definitions must be checked';
  quality:=thesaurus.validate_document(cid,doc||
    '{"name_i18n":{"en":"One star"},"description_i18n":{"en":"One-star level in the official hotel classification."}}');
  ASSERT jsonb_array_length(quality->'errors')=0, 'Complete required languages must pass';

  ASSERT NOT has_function_privilege('authenticated','thesaurus.definition_errors(jsonb,jsonb,text[])','EXECUTE'),
    'Editorial helper is private';
  ASSERT NOT has_function_privilege('anon','thesaurus.assert_release_definitions(bigint)','EXECUTE'),
    'Snapshot guard is private';
  ASSERT NOT (SELECT prosecdef FROM pg_proc WHERE oid='thesaurus.assert_release_definitions(bigint)'::regprocedure),
    'New snapshot guard must not introduce a privileged entrypoint';
END $draft_checks$;

SELECT set_config('request.jwt.claims','{}',true);
DO $auth_still_required$
BEGIN
  BEGIN
    PERFORM api.thesaurus_admin('configure_domain','{"domain":"test_definition_policy","require_definition":true}');
    RAISE EXCEPTION 'Anonymous configuration unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $auth_still_required$;

CREATE TEMP TABLE _definition_policy_releases(kind text PRIMARY KEY,release_id bigint) ON COMMIT DROP;
WITH added AS (
 INSERT INTO thesaurus.release(idempotency_key) VALUES('test-definition-policy-invalid') RETURNING release_id
) INSERT INTO _definition_policy_releases SELECT 'invalid',release_id FROM added;
WITH added AS (
 INSERT INTO thesaurus.release(idempotency_key) VALUES('test-definition-policy-valid') RETURNING release_id
) INSERT INTO _definition_policy_releases SELECT 'valid',release_id FROM added;
GRANT SELECT ON _definition_policy_releases TO bertel_thesaurus_publisher;

-- Exercise the actual immutable-release trigger, not just its assertion helper.
-- The first row models a copied older snapshot with its missing EN definition.
SET LOCAL ROLE bertel_thesaurus_publisher;
INSERT INTO thesaurus.release_concept(release_id,concept_id,domain,is_public,document,checksum)
SELECT release_id,'b7df0000-0000-4000-8000-000000000002','test_definition_policy',false,
 '{"preferred_labels":{"fr":"Une étoile","en":"One star"},"definitions":{"fr":"Niveau une étoile du classement officiel des hôtels."}}','fixture'
FROM _definition_policy_releases WHERE kind='invalid';
DO $final_guard_rejects_copied_gap$
BEGIN
  BEGIN
    UPDATE thesaurus.release SET checksum='final-invalid'
    WHERE release_id=(SELECT release_id FROM _definition_policy_releases WHERE kind='invalid');
    RAISE EXCEPTION 'Finalization accepted a copied snapshot missing a required EN definition';
  EXCEPTION WHEN SQLSTATE 'PT400' THEN
    ASSERT SQLERRM LIKE '%en%', 'Final guard must identify the missing required language';
  END;
  ASSERT (SELECT checksum='' FROM thesaurus.release
    WHERE release_id=(SELECT release_id FROM _definition_policy_releases WHERE kind='invalid')),
    'Failed finalization must leave the release unpublished';
END $final_guard_rejects_copied_gap$;
INSERT INTO thesaurus.release_concept(release_id,concept_id,domain,is_public,document,checksum)
SELECT release_id,'b7df0000-0000-4000-8000-000000000002','test_definition_policy',false,
 '{"preferred_labels":{"fr":"Une étoile","en":"One star"},"definitions":{"fr":"Niveau une étoile du classement officiel des hôtels.","en":"One-star level in the official hotel classification."}}','fixture'
FROM _definition_policy_releases WHERE kind='valid';
UPDATE thesaurus.release SET checksum='final-valid'
WHERE release_id=(SELECT release_id FROM _definition_policy_releases WHERE kind='valid');
DO $history_still_immutable$
BEGIN
  BEGIN
    UPDATE thesaurus.release SET checksum='rewritten'
    WHERE release_id=(SELECT release_id FROM _definition_policy_releases WHERE kind='valid');
    RAISE EXCEPTION 'Published release was mutable';
  EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $history_still_immutable$;
RESET ROLE;
ROLLBACK;
