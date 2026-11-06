-- Prepared-publication kernel security and journal behavior. Every fixture rolls back.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout='60s';
SELECT thesaurus.assert_preparation_contract();

DO $acl$
BEGIN
 ASSERT(SELECT relrowsecurity FROM pg_class WHERE oid='thesaurus.mutation_journal'::regclass),'Mutation journal RLS is disabled';
 ASSERT NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='thesaurus.mutation_journal'::regclass AND contype='f'),'Journal must retain deleted owner IDs without an object FK';
 ASSERT has_table_privilege('bertel_thesaurus_publisher','thesaurus.mutation_journal','SELECT')
    AND has_table_privilege('bertel_thesaurus_publisher','thesaurus.mutation_journal','DELETE'),'Publisher cannot validate/clean journal';
 ASSERT NOT has_table_privilege('bertel_thesaurus_publisher','thesaurus.mutation_journal','INSERT,UPDATE,TRUNCATE'),'Publisher can forge writer journal receipts';
 ASSERT NOT has_table_privilege('anon','thesaurus.mutation_journal','SELECT,INSERT,UPDATE,DELETE')
    AND NOT has_table_privilege('authenticated','thesaurus.mutation_journal','SELECT,INSERT,UPDATE,DELETE')
    AND NOT has_table_privilege('service_role','thesaurus.mutation_journal','SELECT,INSERT,UPDATE,DELETE'),'Journal became an application read/write surface';
 ASSERT NOT(SELECT rolbypassrls OR rolsuper OR rolcanlogin FROM pg_roles WHERE rolname='bertel_thesaurus_publisher'),'Publisher authority broadened';
 ASSERT has_function_privilege('postgres','thesaurus.prune_mutation_journal(integer)','EXECUTE')
   AND NOT has_function_privilege('anon','thesaurus.prune_mutation_journal(integer)','EXECUTE')
   AND NOT has_function_privilege('authenticated','thesaurus.prune_mutation_journal(integer)','EXECUTE')
   AND NOT has_function_privilege('service_role','thesaurus.prune_mutation_journal(integer)','EXECUTE'),'Journal pruning is not private maintenance';
 ASSERT EXISTS(SELECT 1 FROM pg_proc WHERE oid='thesaurus.prune_mutation_journal(integer)'::regprocedure
   AND prosecdef AND pg_get_userbyid(proowner)='bertel_thesaurus_publisher'
   AND proconfig=ARRAY['search_path=pg_catalog, thesaurus']),'Journal pruning lost its restricted owner or search path';
END $acl$;

-- Deterministic snapshot fixtures for bounded pruning. This runs before any
-- bootstrap/publication can retain X1 in the outer transaction. The separate
-- multi-connection gate proves a real pending older XID versus higher commits.
DELETE FROM thesaurus.mutation_journal;
DO $pruning$
DECLARE older xid8;not_visible xid8;removed integer;
BEGIN
 older:=((pg_snapshot_xmin(pg_current_snapshot())::text::numeric)-1)::text::xid8;
 not_visible:=((pg_snapshot_xmax(pg_current_snapshot())::text::numeric)+1000000)::text::xid8;
 ASSERT pg_visible_in_snapshot(older,pg_current_snapshot()),'Pruning fixture must be snapshot-visible';
 ASSERT NOT pg_visible_in_snapshot(not_visible,pg_current_snapshot()),'Pruning fixture must be snapshot-invisible';
 INSERT INTO thesaurus.mutation_journal(top_xid,owner_id)
 SELECT older,'prepared-prune-visible-'||value FROM generate_series(1,3)value;
 INSERT INTO thesaurus.mutation_journal(top_xid,owner_id)VALUES(not_visible,'prepared-prune-not-visible');
 removed:=thesaurus.prune_mutation_journal(2);
 ASSERT removed=2,'Journal pruning did not honor its batch limit';
 ASSERT(SELECT count(*)FROM thesaurus.mutation_journal WHERE top_xid=older)=1,'Bounded pruning removed too many visible rows';
 ASSERT EXISTS(SELECT 1 FROM thesaurus.mutation_journal WHERE owner_id='prepared-prune-not-visible'),'Pruner removed a snapshot-invisible receipt';
 ASSERT thesaurus.prune_mutation_journal(10000)=1,'Pruner failed to clear the remaining visible batch';
 ASSERT EXISTS(SELECT 1 FROM thesaurus.mutation_journal WHERE owner_id='prepared-prune-not-visible'),'A later pruning snapshot removed a future receipt';
 ASSERT NOT EXISTS(SELECT 1 FROM pg_locks WHERE pid=pg_backend_pid()AND locktype='advisory'
   AND classid=741126 AND objid=1 AND objsubid=2 AND granted AND mode='ExclusiveLock'),'Journal maintenance acquired the K1 editor fence';
 BEGIN
   PERFORM thesaurus.prune_mutation_journal(100001);
   RAISE EXCEPTION 'Journal pruner accepted an unbounded batch';
 EXCEPTION WHEN invalid_parameter_value THEN NULL;END;
 BEGIN
   PERFORM thesaurus.prune_mutation_journal(0);
   RAISE EXCEPTION 'Journal pruner accepted an empty batch';
 EXCEPTION WHEN invalid_parameter_value THEN NULL;END;
END $pruning$;
DELETE FROM thesaurus.mutation_journal;

INSERT INTO public.object(id,object_type,name,status)VALUES
 ('HLORUNPREPARE001','HLO','Prepared journal owner A','draft'),
 ('HLORUNPREPARE002','HLO','Prepared journal owner B','draft');
INSERT INTO public.ref_tag(id,slug,name)VALUES('b73e9800-0000-4000-8000-000000000001','prepared-journal-fixture','Prepared tag');
DELETE FROM thesaurus.mutation_journal WHERE owner_id IN('HLORUNPREPARE001','HLORUNPREPARE002');
INSERT INTO public.tag_link(tag_id,target_table,target_pk)VALUES('b73e9800-0000-4000-8000-000000000001','object','HLORUNPREPARE001');
DO $journal$
BEGIN
 ASSERT(SELECT array_agg(owner_id ORDER BY owner_id)FROM thesaurus.mutation_journal
  WHERE top_xid=pg_current_xact_id()AND owner_id IN('HLORUNPREPARE001','HLORUNPREPARE002'))=ARRAY['HLORUNPREPARE001'],'Polymorphic tag insertion lost its owner';
END $journal$;

DELETE FROM thesaurus.mutation_journal WHERE owner_id IN('HLORUNPREPARE001','HLORUNPREPARE002');
UPDATE public.tag_link SET target_pk='HLORUNPREPARE002'
 WHERE tag_id='b73e9800-0000-4000-8000-000000000001'AND target_table='object'AND target_pk='HLORUNPREPARE001';
DO $journal$
BEGIN
 ASSERT(SELECT array_agg(owner_id ORDER BY owner_id)FROM thesaurus.mutation_journal
  WHERE top_xid=pg_current_xact_id()AND owner_id IN('HLORUNPREPARE001','HLORUNPREPARE002'))=ARRAY['HLORUNPREPARE001','HLORUNPREPARE002'],'Owner transfer must journal OLD and NEW';
END $journal$;

DELETE FROM thesaurus.mutation_journal WHERE owner_id IN('HLORUNPREPARE001','HLORUNPREPARE002');
UPDATE public.ref_tag SET name='Changed prepared tag'WHERE id='b73e9800-0000-4000-8000-000000000001';
DO $journal$
BEGIN
 ASSERT EXISTS(SELECT 1 FROM thesaurus.mutation_journal WHERE owner_id='HLORUNPREPARE002'AND top_xid=pg_current_xact_id()),'Reverse tag rename lost its owner';
END $journal$;

DELETE FROM thesaurus.mutation_journal WHERE owner_id IN('HLORUNPREPARE001','HLORUNPREPARE002');
DELETE FROM public.ref_tag WHERE id='b73e9800-0000-4000-8000-000000000001';
DO $journal$
BEGIN
 ASSERT NOT EXISTS(SELECT 1 FROM public.tag_link WHERE tag_id='b73e9800-0000-4000-8000-000000000001'),'Tag fixture did not cascade';
 ASSERT EXISTS(SELECT 1 FROM thesaurus.mutation_journal WHERE owner_id='HLORUNPREPARE002'AND top_xid=pg_current_xact_id()),'BEFORE parent/cascade journaling lost its owner';
END $journal$;

DELETE FROM thesaurus.mutation_journal WHERE owner_id IN('HLORUNPREPARE001','HLORUNPREPARE002');
UPDATE public.object SET cached_is_open_now=true WHERE id='HLORUNPREPARE001';
DO $clock$
BEGIN
 ASSERT NOT EXISTS(SELECT 1 FROM thesaurus.mutation_journal WHERE owner_id IN('HLORUNPREPARE001','HLORUNPREPARE002')),'A derived clock update created a spurious publication conflict';
END $clock$;

-- A real business rename still creates its ordinary version history. Neither
-- object.name nor its derived history is read by the nine cache expressions.
DO $name_only$
DECLARE versions_before bigint;
BEGIN
 SELECT count(*)INTO versions_before FROM public.object_version WHERE object_id='HLORUNPREPARE001';
 UPDATE public.object SET name='Prepared owner A renamed'WHERE id='HLORUNPREPARE001';
 ASSERT(SELECT count(*)FROM public.object_version WHERE object_id='HLORUNPREPARE001')=versions_before+1,'Name edit lost its ordinary version history';
 ASSERT NOT EXISTS(SELECT 1 FROM thesaurus.mutation_journal WHERE owner_id='HLORUNPREPARE001'),'Derived version history created a false name-only input conflict';
END $name_only$;

-- Failed edits must roll their receipts back with the same subtransaction.
DO $savepoint$
BEGIN
 BEGIN
  INSERT INTO public.ref_tag(id,slug,name)VALUES('b73e9800-0000-4000-8000-000000000002','prepared-rolled-back','Rolled-back tag');
  INSERT INTO public.tag_link(tag_id,target_table,target_pk)VALUES('b73e9800-0000-4000-8000-000000000002','object','HLORUNPREPARE001');
  RAISE EXCEPTION 'synthetic writer rollback' USING ERRCODE='PT499';
 EXCEPTION WHEN SQLSTATE 'PT499'THEN NULL;
 END;
 ASSERT NOT EXISTS(SELECT 1 FROM thesaurus.mutation_journal WHERE owner_id='HLORUNPREPARE001'),'Rolled-back writer left a committed-looking receipt';
END $savepoint$;

-- Supabase's migration runner is not a superuser. It retains role ADMIN but
-- production deliberately revokes SET. Borrow SET only inside this rolled-back
-- fixture so the negative publisher-authority checks exercise the actual role.
DO $publisher_fixture_membership$
BEGIN
 EXECUTE format('GRANT bertel_thesaurus_publisher TO %I WITH INHERIT FALSE, SET TRUE',current_user);
END $publisher_fixture_membership$;
SET LOCAL ROLE bertel_thesaurus_publisher;
SELECT set_config('bertel.thesaurus_publishing','true',true);
DO $authority$
BEGIN
 BEGIN
  UPDATE public.object SET updated_at=clock_timestamp()WHERE id='HLORUNPREPARE001';
  RAISE EXCEPTION 'Publisher role/GUC without X1 allowed a canonical write';
 EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN
  PERFORM pg_advisory_xact_lock(741126,2);
  UPDATE public.object SET updated_at=clock_timestamp()WHERE id='HLORUNPREPARE001';
  RAISE EXCEPTION 'A preparation source side effect wrote an owned row before X1';
 EXCEPTION WHEN SQLSTATE 'PT409'THEN NULL;END;
END $authority$;
RESET ROLE;

-- Own writes are visible to preparation even when pg_visible_in_snapshot does
-- not classify the current top-level xid as committed. This is a real cache
-- input mutation followed by publication, not a journal-only/no-op fixture.
SELECT set_config('request.jwt.claims','{}',true);
INSERT INTO auth.users(id,email)VALUES('b73e0000-0000-4000-8000-000000000601','prepared-own-writer@example.invalid')ON CONFLICT DO NOTHING;
INSERT INTO public.app_user_profile(id,role,display_name)VALUES('b73e0000-0000-4000-8000-000000000601','super_admin','Prepared own writer')ON CONFLICT(id)DO UPDATE SET role='super_admin';
SELECT set_config('request.jwt.claims','{"sub":"b73e0000-0000-4000-8000-000000000601","role":"authenticated"}',true);
INSERT INTO public.ref_code_domain_registry(domain,name,object_type,is_hierarchical,is_taxonomy)VALUES('taxonomy_hlo','Prepared own fixture','HLO',true,true)ON CONFLICT DO NOTHING;
INSERT INTO public.ref_code(id,domain,code,name,description)VALUES('b73e1000-0000-4000-8000-000000000601','taxonomy_hlo','prepared_own_term','Terme local initial','Définition locale');
INSERT INTO public.object_taxonomy(object_id,domain,ref_code_id)VALUES('HLORUNPREPARE001','taxonomy_hlo','b73e1000-0000-4000-8000-000000000601');
DO $own_writer$
DECLARE concept uuid;revision jsonb;before_version integer;
BEGIN
 PERFORM api.thesaurus_admin('configure_instance','{"base_uri":"https://example.invalid/api/public/thesaurus/concepts/","license":"fixture-only","attribution":"Own writer fixture"}');
 PERFORM api.thesaurus_admin('bootstrap','{"domains":["taxonomy_hlo"],"idempotency_key":"prepared-own-bootstrap"}');
 INSERT INTO public.ref_tag(id,slug,name)VALUES('b73e9800-0000-4000-8000-000000000003','prepared-own-tag','marqueur avant');
 INSERT INTO public.tag_link(tag_id,target_table,target_pk)VALUES('b73e9800-0000-4000-8000-000000000003','object','HLORUNPREPARE001');
 DELETE FROM thesaurus.mutation_journal WHERE owner_id='HLORUNPREPARE001';
 UPDATE public.ref_tag SET name='marqueur preparation locale finale'WHERE id='b73e9800-0000-4000-8000-000000000003';
 ASSERT EXISTS(SELECT 1 FROM thesaurus.mutation_journal WHERE owner_id='HLORUNPREPARE001'AND top_xid=pg_current_xact_id()),'Real own cache input did not create an own receipt';
 SELECT current_version INTO before_version FROM public.object WHERE id='HLORUNPREPARE001';
 SELECT concept_id INTO concept FROM thesaurus.concept WHERE domain='taxonomy_hlo'AND code='prepared_own_term';
 revision:=api.thesaurus_admin('save_draft',jsonb_build_object('concept_id',concept,'expected_version',0,'document',thesaurus.concept_document(concept)||'{"name":"Terme local publie"}'::jsonb));
 revision:=api.thesaurus_admin('validate_draft',jsonb_build_object('revision_id',revision->>'revision_id','expected_version',(revision->>'version')::integer));
 PERFORM api.thesaurus_admin('publish',jsonb_build_object('revision_ids',jsonb_build_array(revision->>'revision_id'),'expected_revision_versions',jsonb_build_object(revision->>'revision_id',(revision->>'version')::integer),'expected_release_id',api.thesaurus_generation(),'idempotency_key','prepared-own-input-publication'));
 ASSERT(SELECT search_document_text LIKE'%marqueur preparation locale finale%'AND search_document_text LIKE'%terme local publie%'AND current_version=before_version FROM public.object WHERE id='HLORUNPREPARE001'),'Own input was stale or publication fabricated a canonical version';
END $own_writer$;

-- Model an already active generation without opening any external route. The
-- metadata fixture and pointer are rolled back with the rest of this test.
DO $truncate$
DECLARE rid bigint;
BEGIN
 INSERT INTO thesaurus.release(idempotency_key,request_fingerprint)VALUES('prepared-kernel-active-fixture','fixture')RETURNING release_id INTO rid;
 UPDATE thesaurus.instance SET current_release_id=rid WHERE singleton;
 BEGIN
  TRUNCATE public.tag_link;
  RAISE EXCEPTION 'Active prepared input accepted TRUNCATE';
 EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $truncate$;

-- A changed support function or disabled gate is an explicit fail-closed
-- contract error. The local DDL is undone by each exception block.
DO $drift$
BEGIN
 BEGIN
  ALTER FUNCTION api.phonetic_document(text)COST 999;
  PERFORM thesaurus.assert_preparation_contract();
  RAISE EXCEPTION 'Support function drift passed the preparation contract';
 EXCEPTION WHEN SQLSTATE 'PT503'THEN NULL;END;
 BEGIN
  ALTER TABLE public.tag_link DISABLE TRIGGER thesaurus_mutation_journal;
  PERFORM thesaurus.assert_preparation_contract();
  RAISE EXCEPTION 'Missing owner journal passed the preparation contract';
 EXCEPTION WHEN SQLSTATE 'PT503'THEN NULL;END;
 BEGIN
  ALTER TABLE public.ref_code_payment_method DISABLE TRIGGER thesaurus_source_gate;
  PERFORM thesaurus.assert_preparation_contract();
  RAISE EXCEPTION 'Direct partition source writes lost their K2 gate';
 EXCEPTION WHEN SQLSTATE 'PT503'THEN NULL;END;
END $drift$;

SELECT thesaurus.assert_preparation_contract();
DO $done$BEGIN RAISE NOTICE 'Prepared journal ACLs, OLD/NEW tags, parent cascade, clock/name filters, bounded pruning, subtransaction, authority, TRUNCATE and fail-closed contract passed';END $done$;
ROLLBACK;
