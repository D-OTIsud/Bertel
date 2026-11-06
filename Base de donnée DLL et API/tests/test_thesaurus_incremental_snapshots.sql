-- Incremental snapshots must equal a complete render, including their exact diff.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout='120s';
SELECT set_config('request.jwt.claims','{}',true);
INSERT INTO auth.users(id,email)VALUES('b73e0000-0000-4000-8000-000000000501','thesaurus-incremental@example.invalid')ON CONFLICT DO NOTHING;
INSERT INTO public.app_user_profile(id,role,display_name)VALUES('b73e0000-0000-4000-8000-000000000501','super_admin','Incremental snapshot fixture')ON CONFLICT(id)DO UPDATE SET role='super_admin';
SELECT set_config('request.jwt.claims','{"sub":"b73e0000-0000-4000-8000-000000000501","role":"authenticated"}',true);
INSERT INTO public.ref_code_domain_registry(domain,name,object_type,is_hierarchical,is_taxonomy)VALUES('taxonomy_hlo','Incremental fixture','HLO',true,true)ON CONFLICT DO NOTHING;
INSERT INTO public.ref_code(id,domain,code,name,description)VALUES
('b73e1000-0000-4000-8000-000000000501','taxonomy_hlo','inc_a','Parent A','Définition A'),
('b73e1000-0000-4000-8000-000000000502','taxonomy_hlo','inc_b','Parent B','Définition B'),
('b73e1000-0000-4000-8000-000000000503','taxonomy_hlo','inc_c','Parent C','Définition C'),
('b73e1000-0000-4000-8000-000000000507','taxonomy_hlo','inc_q','Terme associé','Définition Q'),
('b73e1000-0000-4000-8000-000000000510','amenity_family','inc_family','Famille incrémentale','Définition famille');
INSERT INTO public.ref_code(id,domain,code,name,description,parent_id)VALUES
('b73e1000-0000-4000-8000-000000000504','taxonomy_hlo','inc_x','Enfant mobile','Définition X','b73e1000-0000-4000-8000-000000000501'),
('b73e1000-0000-4000-8000-000000000505','taxonomy_hlo','inc_y','Petit-enfant stable','Définition Y','b73e1000-0000-4000-8000-000000000504'),
('b73e1000-0000-4000-8000-000000000506','taxonomy_hlo','inc_z','Enfant B stable','Définition Z','b73e1000-0000-4000-8000-000000000502'),
('b73e1000-0000-4000-8000-000000000509','taxonomy_hlo','inc_p','Enfant A stable','Définition P','b73e1000-0000-4000-8000-000000000501');
INSERT INTO public.ref_classification_scheme(id,code,name,description)VALUES('b73e3000-0000-4000-8000-000000000501','inc_scheme','Schéma incrémental','Définition schéma');
INSERT INTO public.ref_classification_value(id,scheme_id,code,name)VALUES('b73e3000-0000-4000-8000-000000000502','b73e3000-0000-4000-8000-000000000501','inc_value','Valeur publiée ultérieurement');
INSERT INTO public.ref_amenity(id,code,name,family_id,description)VALUES('b73e2000-0000-4000-8000-000000000501','inc_amenity','Équipement publié ultérieurement','b73e1000-0000-4000-8000-000000000510','Définition équipement');

CREATE FUNCTION pg_temp.assert_incremental_oracle(p_stage text)RETURNS void LANGUAGE plpgsql AS $oracle$
DECLARE current_id bigint:=api.thesaurus_generation();previous_id bigint;
BEGIN
  SELECT previous_release_id INTO previous_id FROM thesaurus.release WHERE release_id=current_id;
  ASSERT(SELECT count(*)FROM thesaurus.release_concept WHERE release_id=current_id)>0,'Oracle fixture must not be empty';
  ASSERT NOT EXISTS(
    WITH expected AS MATERIALIZED(SELECT * FROM thesaurus.publication_documents()),
    actual AS(SELECT * FROM thesaurus.release_concept WHERE release_id=current_id)
    SELECT 1 FROM expected FULL JOIN actual USING(concept_id)
    WHERE expected.concept_id IS NULL OR actual.concept_id IS NULL
      OR(expected.domain,expected.is_public,expected.document,md5(expected.document::text))
        IS DISTINCT FROM(actual.domain,actual.is_public,actual.document,actual.checksum)
  ),format('Incremental/full-render document mismatch at %s',p_stage);
  ASSERT NOT EXISTS(
    WITH expected AS(
      SELECT fresh.concept_id,old.document before_document,fresh.document after_document,
       CASE WHEN old.concept_id IS NULL THEN'added'
         WHEN fresh.document->>'lifecycle'IS DISTINCT FROM old.document->>'lifecycle'
           AND fresh.document->>'lifecycle'IN('deprecated','retired')THEN fresh.document->>'lifecycle'
         ELSE'modified'END change_type
      FROM thesaurus.publication_documents()fresh
      LEFT JOIN thesaurus.release_concept old ON old.release_id=previous_id AND old.concept_id=fresh.concept_id
      WHERE old.concept_id IS NULL OR old.checksum<>md5(fresh.document::text)
    ),actual AS(SELECT * FROM thesaurus.release_change WHERE release_id=current_id)
    SELECT 1 FROM expected FULL JOIN actual USING(concept_id)
    WHERE expected.concept_id IS NULL OR actual.concept_id IS NULL
      OR(expected.change_type,expected.before_document,expected.after_document)
        IS DISTINCT FROM(actual.change_type,actual.before_document,actual.after_document)
  ),format('Incremental/full-render changeset mismatch at %s',p_stage);
END $oracle$;

CREATE FUNCTION pg_temp.publish_incremental(p_items jsonb,p_key text)RETURNS jsonb LANGUAGE plpgsql AS $publish$
DECLARE item jsonb;revision jsonb;document jsonb;revisions jsonb:='[]';versions jsonb:='{}';
BEGIN
  FOR item IN SELECT value FROM jsonb_array_elements(p_items)LOOP
    document:=CASE WHEN item->>'concept_id'IS NULL THEN item->'changes'ELSE thesaurus.concept_document((item->>'concept_id')::uuid)||item->'changes'END;
    revision:=api.thesaurus_admin('save_draft',jsonb_build_object('concept_id',item->>'concept_id','domain',COALESCE(item->>'domain',document->>'domain'),'expected_version',0,'document',document));
    revision:=api.thesaurus_admin('validate_draft',jsonb_build_object('revision_id',revision->>'revision_id','expected_version',(revision->>'version')::integer));
    ASSERT revision->>'status'='validated',format('Incremental fixture revision did not validate: %s',revision);
    revisions:=revisions||jsonb_build_array(revision->>'revision_id');versions:=versions||jsonb_build_object(revision->>'revision_id',(revision->>'version')::integer);
  END LOOP;
  RETURN api.thesaurus_admin('publish',jsonb_build_object('revision_ids',revisions,'expected_revision_versions',versions,'expected_release_id',api.thesaurus_generation(),'idempotency_key',p_key));
END $publish$;

DO $incremental$
DECLARE a uuid;b uuid;c uuid;x uuid;y uuid;z uuid;q uuid;p uuid;scheme uuid;family uuid;value_id uuid;amenity uuid;first_id bigint;first_export jsonb;stable_checksum text;guard_oid oid;maintenance_ids uuid[];maintenance_items jsonb;
BEGIN
  PERFORM api.thesaurus_admin('configure_instance','{"base_uri":"https://example.invalid/api/public/thesaurus/concepts/","license":"fixture-only","attribution":"Incremental fixture"}');
  PERFORM api.thesaurus_admin('workspace','{}');
  SELECT concept_id INTO a FROM thesaurus.concept WHERE domain='taxonomy_hlo'AND code='inc_a';
  SELECT concept_id INTO b FROM thesaurus.concept WHERE domain='taxonomy_hlo'AND code='inc_b';
  SELECT concept_id INTO c FROM thesaurus.concept WHERE domain='taxonomy_hlo'AND code='inc_c';
  SELECT concept_id INTO x FROM thesaurus.concept WHERE domain='taxonomy_hlo'AND code='inc_x';
  SELECT concept_id INTO y FROM thesaurus.concept WHERE domain='taxonomy_hlo'AND code='inc_y';
  SELECT concept_id INTO z FROM thesaurus.concept WHERE domain='taxonomy_hlo'AND code='inc_z';
  SELECT concept_id INTO q FROM thesaurus.concept WHERE domain='taxonomy_hlo'AND code='inc_q';
  SELECT concept_id INTO p FROM thesaurus.concept WHERE domain='taxonomy_hlo'AND code='inc_p';
  SELECT concept_id INTO scheme FROM thesaurus.concept WHERE source_id='b73e3000-0000-4000-8000-000000000501'AND source_kind='classification_scheme';
  SELECT concept_id INTO family FROM thesaurus.concept WHERE source_id='b73e1000-0000-4000-8000-000000000510'AND domain='amenity_family';
  SELECT concept_id INTO value_id FROM thesaurus.concept WHERE source_id='b73e3000-0000-4000-8000-000000000502'AND source_kind='classification_value';
  SELECT concept_id INTO amenity FROM thesaurus.concept WHERE source_id='b73e2000-0000-4000-8000-000000000501'AND source_kind='amenity';
  PERFORM api.thesaurus_admin('bootstrap','{"domains":["taxonomy_hlo","classification_scheme","amenity_family"],"idempotency_key":"inc-initial-bootstrap"}');
  PERFORM pg_temp.assert_incremental_oracle('initial domains');
  first_id:=api.thesaurus_generation();first_export:=api.thesaurus_public('export',first_id);
  SELECT checksum INTO stable_checksum FROM thesaurus.release_concept WHERE release_id=first_id AND concept_id=y;
  PERFORM pg_temp.publish_incremental(jsonb_build_array(
    jsonb_build_object('concept_id',x,'changes',jsonb_build_object('name','Enfant déplacé et renommé','parent_concept_id',b,'labels',jsonb_build_array(jsonb_build_object('lang','fr','kind','alt','value','Alias incrémental')))),
    jsonb_build_object('concept_id',q,'changes',jsonb_build_object('name','Associé renommé','relations',jsonb_build_array(jsonb_build_object('type','related','target_id',x),jsonb_build_object('type','exact_equivalent','target_id',z))))
  ),'inc-mixed-reparent-symmetric');
  PERFORM pg_temp.assert_incremental_oracle('mixed reparent, rename, synonym and symmetric additions');
  ASSERT(SELECT document->'narrower'FROM thesaurus.release_concept WHERE release_id=api.thesaurus_generation()AND concept_id=a)=jsonb_build_array(p),'Old parent lost an unchanged child';
  ASSERT(SELECT document->'narrower'FROM thesaurus.release_concept WHERE release_id=api.thesaurus_generation()AND concept_id=b)@>jsonb_build_array(x,z),'New parent omitted the unchanged sibling';
  ASSERT(SELECT checksum FROM thesaurus.release_concept WHERE release_id=api.thesaurus_generation()AND concept_id=y)=stable_checksum,'Ancestor rename/reparent needlessly changed a descendant document';
  PERFORM pg_temp.publish_incremental(jsonb_build_array(
    jsonb_build_object('concept_id',x,'changes',jsonb_build_object('parent_concept_id',a,'relations','[]'::jsonb)),
    jsonb_build_object('concept_id',z,'changes',jsonb_build_object('relations','[]'::jsonb)),
    jsonb_build_object('concept_id',b,'changes',jsonb_build_object('name','Parent B renommé'))
  ),'inc-remove-incoming-symmetric');
  PERFORM pg_temp.assert_incremental_oracle('mixed reparent and incoming symmetric removals');
  ASSERT(SELECT document->'relations'FROM thesaurus.release_concept WHERE release_id=api.thesaurus_generation()AND concept_id=q)='[]'::jsonb,'Unrevised other endpoint kept removed symmetric edges';
  PERFORM api.thesaurus_admin('bootstrap','{"domains":["classification_value","amenity"],"idempotency_key":"inc-standalone-scope-bootstrap"}');
  PERFORM pg_temp.assert_incremental_oracle('new standalone domains update existing parent narrower lists');
  ASSERT(SELECT document->'narrower'FROM thesaurus.release_concept WHERE release_id=api.thesaurus_generation()AND concept_id=scheme)@>jsonb_build_array(value_id),'Existing classification parent missed the newly published value';
  ASSERT(SELECT document->'narrower'FROM thesaurus.release_concept WHERE release_id=api.thesaurus_generation()AND concept_id=family)@>jsonb_build_array(amenity),'Existing family missed the newly published amenity';
  PERFORM pg_temp.publish_incremental(jsonb_build_array(
    jsonb_build_object('domain','taxonomy_hlo','changes',jsonb_build_object('code','inc_new','name','Nouveau concept incrémental','description','Définition nouvelle','parent_concept_id',b)),
    jsonb_build_object('concept_id',c,'changes',jsonb_build_object('lifecycle','deprecated','replaced_by',jsonb_build_array(q)))
  ),'inc-new-concept-and-deprecation');
  PERFORM pg_temp.assert_incremental_oracle('new native concept, parent update and deprecation');
  -- A reviewed schema migration may change exposure; the application cannot.
  UPDATE thesaurus.vocabulary SET is_public=false WHERE domain='classification_value';
  PERFORM pg_temp.publish_incremental(jsonb_build_array(jsonb_build_object('concept_id',b,'changes',jsonb_build_object('name','Parent B après migration de périmètre'))),'inc-reviewed-exposure-removal');
  PERFORM pg_temp.assert_incremental_oracle('reviewed exposure removal and old parent narrower list');
  ASSERT NOT((SELECT document->'narrower'FROM thesaurus.release_concept WHERE release_id=api.thesaurus_generation()AND concept_id=scheme)@>jsonb_build_array(value_id)),'Parent leaked a now-private child identity';
  UPDATE thesaurus.vocabulary SET is_public=true WHERE domain='classification_value';
  PERFORM pg_temp.publish_incremental(jsonb_build_array(jsonb_build_object('concept_id',b,'changes',jsonb_build_object('name','Parent B après réouverture du périmètre'))),'inc-reviewed-exposure-return');
  PERFORM pg_temp.assert_incremental_oracle('reviewed exposure restoration');
  -- A controlled maintenance window can bypass a native guard. Reconciliation
  -- must draft every full-render difference, including both unedited parents.
  SELECT oid INTO guard_oid FROM pg_trigger WHERE tgrelid='public.ref_code'::regclass AND tgname='zz_thesaurus_source_guard';
  ASSERT guard_oid IS NOT NULL,'The actual native guard must exist before the maintenance fixture';
  ALTER TABLE public.ref_code DISABLE TRIGGER zz_thesaurus_source_guard;
  ASSERT NOT EXISTS(
    WITH RECURSIVE guards AS(SELECT oid,tgenabled FROM pg_trigger WHERE oid=guard_oid
      UNION ALL SELECT child.oid,child.tgenabled FROM pg_trigger child JOIN guards parent ON child.tgparentid=parent.oid)
    SELECT 1 FROM guards WHERE tgenabled<>'D'
  ),'Guard disabling did not propagate to every actual partition clone';
  UPDATE public.ref_code SET parent_id='b73e1000-0000-4000-8000-000000000502',name='Feuille révisée en maintenance'
    WHERE id='b73e1000-0000-4000-8000-000000000509'AND domain='taxonomy_hlo';
  ALTER TABLE public.ref_code ENABLE TRIGGER zz_thesaurus_source_guard;
  ASSERT NOT EXISTS(
    WITH RECURSIVE guards AS(SELECT oid,tgenabled FROM pg_trigger WHERE oid=guard_oid
      UNION ALL SELECT child.oid,child.tgenabled FROM pg_trigger child JOIN guards parent ON child.tgparentid=parent.oid)
    SELECT 1 FROM guards WHERE tgenabled<>'O'
  ),'Native source guards must all be restored before reconciliation';
  BEGIN
    UPDATE public.ref_code SET name='Forbidden after maintenance'WHERE id='b73e1000-0000-4000-8000-000000000509'AND domain='taxonomy_hlo';
    RAISE EXCEPTION 'Reenabled native source guard did not reject a direct write';
  EXCEPTION WHEN insufficient_privilege THEN NULL;END;
  SELECT array_agg(fresh.concept_id ORDER BY fresh.concept_id)INTO maintenance_ids
  FROM thesaurus.publication_documents()fresh
  FULL JOIN(SELECT * FROM thesaurus.release_concept WHERE release_id=api.thesaurus_generation())published USING(concept_id)
  WHERE fresh.document IS DISTINCT FROM published.document OR fresh.is_public IS DISTINCT FROM published.is_public;
  ASSERT maintenance_ids=ARRAY(SELECT id FROM unnest(ARRAY[a,b,p])id ORDER BY id),'Maintenance differences must identify the changed leaf and both old/new parents';
  ASSERT NOT EXISTS(SELECT 1 FROM thesaurus.revision WHERE concept_id=ANY(maintenance_ids)AND status<>'published'),'Reconciliation must not overwrite a local revision';
  SELECT jsonb_agg(jsonb_build_object('concept_id',id,'changes','{}'::jsonb)ORDER BY id)INTO maintenance_items FROM unnest(maintenance_ids)id;
  PERFORM pg_temp.publish_incremental(maintenance_items,'inc-current-canonical-maintenance-reconciliation');
  PERFORM pg_temp.assert_incremental_oracle('reconciliation of every maintenance difference with restored guards');
  ASSERT api.thesaurus_public('export',first_id)=first_export,'Incremental publications mutated the original export';
  RAISE NOTICE 'Incremental snapshots match full documents and exact changesets for mixed revisions, both parents, symmetric edges, new native concepts and scope changes.';
END $incremental$;
ROLLBACK;
