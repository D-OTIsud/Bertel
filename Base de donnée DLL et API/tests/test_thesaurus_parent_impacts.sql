-- A typed source parent changes public child representations without a direct object FK.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout='120s';
INSERT INTO auth.users(id,email)VALUES('b73e0000-0000-4000-8000-000000000401','thesaurus-parents@example.invalid')ON CONFLICT DO NOTHING;
INSERT INTO public.app_user_profile(id,role,display_name)VALUES('b73e0000-0000-4000-8000-000000000401','super_admin','Typed parent impact test')ON CONFLICT(id)DO UPDATE SET role='super_admin';
SELECT set_config('request.jwt.claims','{"sub":"b73e0000-0000-4000-8000-000000000401","role":"authenticated"}',true);
INSERT INTO public.ref_code(id,domain,code,name,description)VALUES
('b73e1000-0000-4000-8000-000000000401','amenity_family','parent_impact_family','Famille avant renommage','Définition de famille');
INSERT INTO public.ref_amenity(id,code,name,family_id,description)VALUES
('b73e2000-0000-4000-8000-000000000401','parent_impact_amenity','Équipement témoin','b73e1000-0000-4000-8000-000000000401','Définition de l’équipement');
INSERT INTO public.ref_sustainability_action_category(id,code,name,description)VALUES
('b73e4000-0000-4000-8000-000000000401','parent_impact_category','Catégorie avant renommage','Définition de catégorie');
INSERT INTO public.ref_sustainability_action(id,category_id,code,label,description)VALUES
('b73e4000-0000-4000-8000-000000000402','b73e4000-0000-4000-8000-000000000401','parent_impact_action','Action témoin','Définition de l’action');
INSERT INTO public.object(id,object_type,name,status)VALUES
('HLORUNPARENT0001','HLO','Usage équipement','draft'),('HLORUNPARENT0002','HLO','Usage durabilité','draft');
INSERT INTO public.object_amenity(object_id,amenity_id)VALUES('HLORUNPARENT0001','b73e2000-0000-4000-8000-000000000401');
INSERT INTO public.object_sustainability_action(object_id,action_id)VALUES('HLORUNPARENT0002','b73e4000-0000-4000-8000-000000000402');
UPDATE public.object SET status='published'WHERE id IN('HLORUNPARENT0001','HLORUNPARENT0002');

DO $parent_impacts$
DECLARE parent_id uuid;revision jsonb;revisions jsonb:='[]';versions jsonb:='{}';publication jsonb;preview jsonb;
  before_hot timestamptz;before_sust timestamptz;hot_version integer;sust_version integer;before_hot_resource jsonb;before_sust_resource jsonb;after_resource jsonb;
  before_generation bigint;before_native jsonb;before_objects jsonb;before_revisions jsonb;before_outbox bigint;before_releases bigint;
BEGIN
  PERFORM api.thesaurus_admin('configure_instance','{"base_uri":"https://example.invalid/api/public/thesaurus/concepts/","license":"fixture-only","attribution":"Typed parents fixture"}');
  PERFORM api.thesaurus_admin('workspace','{}');
  PERFORM api.thesaurus_admin('bootstrap','{"domains":["amenity","sustainability_action"],"idempotency_key":"parent-impact-bootstrap"}');
  SELECT updated_at,current_version INTO before_hot,hot_version FROM public.object WHERE id='HLORUNPARENT0001';
  SELECT updated_at,current_version INTO before_sust,sust_version FROM public.object WHERE id='HLORUNPARENT0002';
  before_hot_resource:=api.get_object_resource('HLORUNPARENT0001',ARRAY['fr'],'none','{}')::jsonb;
  before_sust_resource:=api.get_object_resource('HLORUNPARENT0002',ARRAY['fr'],'none','{}')::jsonb;
  ASSERT before_hot_resource#>>'{amenities,0,family,name}'='Famille avant renommage','Amenity parent fixture is not rendered';
  ASSERT position('Catégorie avant renommage'IN before_sust_resource::text)>0,'Sustainability parent fixture is not rendered';
  FOR parent_id IN SELECT concept_id FROM thesaurus.concept WHERE source_id IN('b73e1000-0000-4000-8000-000000000401','b73e4000-0000-4000-8000-000000000401')LOOP
    revision:=api.thesaurus_admin('save_draft',jsonb_build_object('concept_id',parent_id,'expected_version',0,'document',jsonb_build_object('name',CASE WHEN thesaurus.concept_document(parent_id)->>'domain'='amenity_family'THEN'Famille après renommage'ELSE'Catégorie après renommage'END)));
    revision:=api.thesaurus_admin('validate_draft',jsonb_build_object('revision_id',revision->>'revision_id','expected_version',(revision->>'version')::integer));
    revisions:=revisions||jsonb_build_array(revision->>'revision_id');versions:=versions||jsonb_build_object(revision->>'revision_id',(revision->>'version')::integer);
  END LOOP;
  ASSERT jsonb_array_length(revisions)=2,'Typed parent revisions are missing';
  preview:=api.thesaurus_admin('preview',jsonb_build_object('revision_ids',revisions));
  ASSERT(preview->>'affected_objects')::integer=2,'Preview omitted objects reached through typed source children';
  -- Sabotage the mandatory second projection after canonical/source/cache writes have
  -- started. The failed publish must roll every earlier effect back, including its
  -- first MV refresh, and leave the exact validated drafts ready for a safe retry.
  before_generation:=api.thesaurus_generation();
  SELECT jsonb_agg(to_jsonb(s)ORDER BY s.source_id)INTO before_native FROM thesaurus.source_rows s
    WHERE s.source_id IN('b73e1000-0000-4000-8000-000000000401','b73e4000-0000-4000-8000-000000000401');
  SELECT jsonb_agg(to_jsonb(o)ORDER BY id)INTO before_objects FROM public.object o WHERE id IN('HLORUNPARENT0001','HLORUNPARENT0002');
  SELECT jsonb_agg(to_jsonb(r)ORDER BY revision_id)INTO before_revisions FROM thesaurus.revision r WHERE revision_id IN(SELECT value::uuid FROM jsonb_array_elements_text(revisions));
  SELECT count(*)INTO before_outbox FROM thesaurus.outbox;SELECT count(*)INTO before_releases FROM thesaurus.release;
  REVOKE MAINTAIN ON internal.mv_filtered_objects FROM bertel_thesaurus_publisher;
  BEGIN
    PERFORM api.thesaurus_admin('publish',jsonb_build_object('revision_ids',revisions,'expected_revision_versions',versions,'expected_release_id',before_generation,'idempotency_key','parent-impact-rename'));
    RAISE EXCEPTION 'Publication succeeded with a mandatory projection disabled';
  EXCEPTION WHEN insufficient_privilege THEN NULL;END;
  ASSERT api.thesaurus_generation()=before_generation,'Failed projection activated a new generation';
  ASSERT(SELECT jsonb_agg(to_jsonb(s)ORDER BY s.source_id)FROM thesaurus.source_rows s WHERE s.source_id IN('b73e1000-0000-4000-8000-000000000401','b73e4000-0000-4000-8000-000000000401'))=before_native,'Failed projection changed native sources';
  ASSERT(SELECT jsonb_agg(to_jsonb(o)ORDER BY id)FROM public.object o WHERE id IN('HLORUNPARENT0001','HLORUNPARENT0002'))=before_objects,'Failed projection changed object caches or synchronization markers';
  ASSERT(SELECT jsonb_agg(to_jsonb(r)ORDER BY revision_id)FROM thesaurus.revision r WHERE revision_id IN(SELECT value::uuid FROM jsonb_array_elements_text(revisions)))=before_revisions,'Failed projection changed validated revisions';
  ASSERT(SELECT count(*)FROM thesaurus.outbox)=before_outbox AND(SELECT count(*)FROM thesaurus.release)=before_releases,'Failed projection left a release or outbox event';
  GRANT MAINTAIN ON internal.mv_filtered_objects TO bertel_thesaurus_publisher;
  publication:=api.thesaurus_admin('publish',jsonb_build_object('revision_ids',revisions,'expected_revision_versions',versions,'expected_release_id',api.thesaurus_generation(),'idempotency_key','parent-impact-rename'));
  ASSERT(publication->>'affected_objects')::integer=2,'Publication omitted objects reached through typed source children';
  ASSERT(SELECT updated_at>before_hot AND current_version=hot_version FROM public.object WHERE id='HLORUNPARENT0001'),'Amenity-family rename did not advance synchronization without changing canonical version';
  ASSERT(SELECT updated_at>before_sust AND current_version=sust_version FROM public.object WHERE id='HLORUNPARENT0002'),'Sustainability-category rename did not advance synchronization without changing canonical version';
  after_resource:=api.get_object_resource('HLORUNPARENT0001',ARRAY['fr'],'none','{}')::jsonb;
  ASSERT after_resource#>>'{amenities,0,family,name}'='Famille après renommage','Published amenity family label is stale';
  ASSERT after_resource->'amenities'IS DISTINCT FROM before_hot_resource->'amenities','The test did not actually change the public amenity representation';
  after_resource:=api.get_object_resource('HLORUNPARENT0002',ARRAY['fr'],'none','{}')::jsonb;
  ASSERT position('Catégorie après renommage'IN after_resource::text)>0,'Published sustainability category label is stale';
  ASSERT after_resource IS DISTINCT FROM before_sust_resource,'The test did not actually change the public sustainability representation';
  RAISE NOTICE 'Typed parent publication impacts and mandatory-projection failure atomicity passed.';
END $parent_impacts$;
ROLLBACK;
