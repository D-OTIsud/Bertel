-- Disposable database only. No publication, authorization or canonical content
-- is changed: representative data and semantic guard probes use a temp table.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout='120s';

DO $index_contract$
DECLARE idx pg_index%ROWTYPE; expression text; predicate text;
BEGIN
  SELECT * INTO STRICT idx FROM pg_index
  WHERE indexrelid='thesaurus.thesaurus_public_target_lookup_idx'::regclass;
  ASSERT idx.indrelid='thesaurus.release_concept'::regclass,
    'The index must cover the immutable release snapshot';
  ASSERT idx.indisvalid AND idx.indisready AND NOT idx.indisunique,
    'The target index must be ready, valid and nonunique (the PK owns uniqueness)';
  ASSERT idx.indnkeyatts=2 AND idx.indnatts=3,
    'Two lookup keys and the included UUID are required';
  ASSERT pg_get_indexdef(idx.indexrelid,1,true)='release_id'
     AND pg_get_indexdef(idx.indexrelid,3,true)='concept_id',
    'Lookup starts with release_id and includes the original concept_id';
  expression:=regexp_replace(pg_get_expr(idx.indexprs,idx.indrelid),'[()[:space:]]','','g');
  predicate:=regexp_replace(pg_get_expr(idx.indpred,idx.indrelid),'[()[:space:]]','','g');
  ASSERT expression='concept_id::text' AND predicate='is_public',
    'Use the exact canonical UUID-text expression and public-snapshot predicate';
  ASSERT (SELECT bool_and(provolatile='i') FROM pg_proc
    WHERE oid IN ('pg_catalog.uuid_out(uuid)'::regprocedure,'pg_catalog.textin(cstring)'::regprocedure)),
    'The built-in UUID-to-text cast must remain immutable';
END $index_contract$;

CREATE TEMP TABLE release_scope_fixture (
  release_id bigint NOT NULL, concept_id uuid NOT NULL, domain text NOT NULL,
  is_public boolean NOT NULL, document jsonb NOT NULL,
  PRIMARY KEY(release_id,concept_id)
) ON COMMIT DROP;
CREATE INDEX release_scope_fixture_domain_idx
  ON release_scope_fixture(release_id,domain,concept_id) WHERE is_public;
CREATE INDEX release_scope_fixture_target_idx
  ON release_scope_fixture(release_id,(concept_id::text)) INCLUDE(concept_id) WHERE is_public;

-- Match the diagnosed snapshot's cardinality: 1362 public documents and 3422
-- expanded references, with multilingual document payloads rather than tiny rows.
INSERT INTO release_scope_fixture
SELECT 1,md5('scope-'||n)::uuid,'fixture_public',true,
  jsonb_build_object(
    'name','Concept de test '||n,
    'name_i18n',jsonb_build_object('fr','Concept de test '||n,'en','Test concept '||n,
      'es','Concepto de prueba '||n,'de','Testbegriff '||n),
    'description_i18n',jsonb_build_object(
      'fr',repeat('Définition métier du concept utilisé dans la fiche touristique. ',5),
      'en',repeat('Business definition of the concept used in a tourism listing. ',5),
      'es',repeat('Definición del concepto utilizado en una ficha turística. ',5),
      'de',repeat('Fachliche Definition des Begriffs im touristischen Eintrag. ',5)),
    'broader','[]'::jsonb,'narrower','[]'::jsonb,'replaced_by','[]'::jsonb,'relations','[]'::jsonb,
    'related',jsonb_build_array(md5('scope-'||((n%1362)+1))::uuid,
      md5('scope-'||(((n+1)%1362)+1))::uuid)||
      CASE WHEN n<=698 THEN jsonb_build_array(md5('scope-'||(((n+2)%1362)+1))::uuid)
           ELSE '[]'::jsonb END)
FROM generate_series(1,1362) AS series(n);
ANALYZE release_scope_fixture;

DO $scope_contract$
DECLARE guard text; original jsonb; field text; bad_id uuid; found_bad boolean;
  plan jsonb; node_count integer; reference_count integer;
BEGIN
  -- Execute the exact guard extracted from the installed publication kernel.
  -- Only its relation name and release variable are redirected to the fixture.
  SELECT substr(split_part(btrim(line),'THEN RAISE EXCEPTION',1),4)
  INTO STRICT guard
  FROM pg_proc p CROSS JOIN LATERAL regexp_split_to_table(p.prosrc,E'\n') AS lines(line)
  WHERE p.oid='thesaurus.activate(uuid[],text[],text,bigint,jsonb)'::regprocedure
    AND starts_with(btrim(line),'IF EXISTS(SELECT 1 FROM thesaurus.release_concept rc CROSS JOIN LATERAL');
  ASSERT guard LIKE '%dst.concept_id::text=target.value AND dst.is_public))',
    'The fixture must still exercise the reviewed public semantic scope guard';
  guard:=replace(replace(guard,'thesaurus.release_concept','pg_temp.release_scope_fixture'),
    'release_id=rid','release_id=1');
  SELECT count(*),sum(jsonb_array_length(document->'related'))
    INTO node_count,reference_count FROM release_scope_fixture WHERE is_public;
  ASSERT node_count=1362 AND reference_count=3422,'Representative public snapshot size must be exact';
  EXECUTE 'SELECT '||guard INTO found_bad;
  ASSERT NOT found_bad,'All representative references resolve inside their public release';
  EXECUTE 'EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) SELECT '||guard INTO plan;
  RAISE NOTICE 'Exact semantic guard, representative fixture: planning % ms, execution % ms',
    plan->0->>'Planning Time',plan->0->>'Execution Time';
  -- Planner timings are diagnostic, not a machine-specific performance threshold.

  SELECT document INTO STRICT original FROM release_scope_fixture
    WHERE release_id=1 AND concept_id=md5('scope-1')::uuid;
  bad_id:=md5('missing-target')::uuid;
  FOREACH field IN ARRAY ARRAY['broader','narrower','related','replaced_by','relations'] LOOP
    UPDATE release_scope_fixture SET document=jsonb_set(original,ARRAY[field],
      CASE WHEN field='relations' THEN jsonb_build_array(jsonb_build_object('target_id',bad_id,'kind','related'))
           ELSE jsonb_build_array(bad_id) END)
    WHERE release_id=1 AND concept_id=md5('scope-1')::uuid;
    EXECUTE 'SELECT '||guard INTO found_bad;
    ASSERT found_bad,format('Missing %s targets must still fail the scope guard',field);
  END LOOP;

  INSERT INTO release_scope_fixture VALUES(1,bad_id,'fixture_private',false,'{}');
  EXECUTE 'SELECT '||guard INTO found_bad;
  ASSERT found_bad,'A private target in the same release must remain forbidden';
  DELETE FROM release_scope_fixture WHERE release_id=1 AND concept_id=bad_id;
  INSERT INTO release_scope_fixture VALUES(2,bad_id,'fixture_public',true,'{}');
  EXECUTE 'SELECT '||guard INTO found_bad;
  ASSERT found_bad,'A public target from a different release must remain forbidden';
  INSERT INTO release_scope_fixture VALUES(1,bad_id,'fixture_public',true,'{}');
  EXECUTE 'SELECT '||guard INTO found_bad;
  ASSERT NOT found_bad,'A public target in the same release must be accepted';
  UPDATE release_scope_fixture SET document=original
    WHERE release_id=1 AND concept_id=md5('scope-1')::uuid;
END $scope_contract$;
ROLLBACK;
