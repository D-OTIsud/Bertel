-- Real consumer integration: reference snapshots, object visibility, filters and generation.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout='120s';
INSERT INTO auth.users(id,email) VALUES('b73e0000-0000-4000-8000-000000000101','thesaurus-consumer@example.invalid') ON CONFLICT DO NOTHING;
INSERT INTO public.app_user_profile(id,role,display_name) VALUES('b73e0000-0000-4000-8000-000000000101','super_admin','Thesaurus consumer test')
ON CONFLICT(id) DO UPDATE SET role='super_admin';
SELECT set_config('request.jwt.claims','{"sub":"b73e0000-0000-4000-8000-000000000101","role":"authenticated"}',true);
INSERT INTO public.ref_code_domain_registry(domain,name,object_type,is_hierarchical,is_taxonomy)
VALUES('taxonomy_hlo','Hébergement témoin','HLO',true,true) ON CONFLICT(domain) DO NOTHING;
INSERT INTO public.ref_code(id,domain,code,name,description,is_assignable) VALUES
('b73e1000-0000-4000-8000-000000000101','taxonomy_hlo','consumer_root','Racine consommateur','Définition témoin',true);
INSERT INTO public.ref_code(id,domain,code,name,description,parent_id,is_assignable) VALUES
('b73e1000-0000-4000-8000-000000000102','taxonomy_hlo','consumer_child','Enfant consommateur','Définition témoin','b73e1000-0000-4000-8000-000000000101',true);
INSERT INTO public.ref_code(id,domain,code,name,description,is_assignable)VALUES
('b73e1000-0000-4000-8000-000000000103','taxonomy_hlo','consumer_heading','Catégorie structurelle','Définition de catégorie',false),
('b73e1000-0000-4000-8000-000000000104','amenity_family','consumer_amenity_family','Famille du catalogue','Définition de famille',true);
INSERT INTO public.ref_amenity(id,code,name,family_id,description)VALUES
('b73e2000-0000-4000-8000-000000000101','consumer_retired_amenity','Équipement à retirer','b73e1000-0000-4000-8000-000000000104','Définition du témoin');
INSERT INTO public.object(id,object_type,name,status) VALUES
('HLORUNTHESAUR101','HLO','Fiche publiée témoin','draft'),
('HLORUNTHESAUR102','HLO','Fiche brouillon témoin','draft');
INSERT INTO public.object_taxonomy(object_id,domain,ref_code_id) VALUES
('HLORUNTHESAUR101','taxonomy_hlo','b73e1000-0000-4000-8000-000000000102');
UPDATE public.object SET status='published' WHERE id='HLORUNTHESAUR101';
-- The fresh manifest intentionally leaves these WITH NO DATA until its final step.
-- Populate the real fixture before exercising the canonical filtered-object reader.
REFRESH MATERIALIZED VIEW internal.mv_ref_data_json;
REFRESH MATERIALIZED VIEW internal.mv_filtered_objects;

DO $test$
DECLARE config jsonb; activation jsonb; snapshot jsonb; resource jsonb; page jsonb; rid bigint; legacy jsonb; direct jsonb;cid uuid;revision jsonb;catalog jsonb;
BEGIN
  config:=api.thesaurus_admin('configure_instance','{"base_uri":"https://example.invalid/api/public/thesaurus/concepts/","license":"test-fixture-only","attribution":"Fixture"}');
  legacy:=api.list_reference_bundle();
  activation:=api.thesaurus_admin('bootstrap','{"domains":["taxonomy_hlo","amenity"],"idempotency_key":"consumer-test-bootstrap"}');
  rid:=(activation->>'release_id')::bigint;
  ASSERT rid IS NOT NULL,'Non-vacuous published release required';
  ASSERT api.list_reference_bundle()=legacy,'Legacy catalogue contract changed during bootstrap';
  ASSERT EXISTS(SELECT 1 FROM jsonb_array_elements(api.list_catalog('taxonomy_hlo'))x WHERE x->>'code'='consumer_heading'),'Active structural category disappeared merely because it is not assignable';
  snapshot:=api.thesaurus_reference_snapshot(ARRAY['taxonomy_hlo']);
  ASSERT (snapshot#>>'{meta,vocabulary_release}')::bigint=rid,'Reference values lack their snapshot generation';
  ASSERT jsonb_array_length(snapshot#>'{refCodeByDomain,taxonomy_hlo}')>=2,'Reference snapshot omitted the fixture';
  ASSERT NOT(snapshot->'refCodeByDomain' ? 'crm_sentiment'),'Requested reference domains were not respected';

  ASSERT api.get_partner_object_with_vocabulary('HLORUNTHESAUR102') IS NULL,'Draft object leaked through atomic consumer';
  ASSERT api.get_partner_object_with_vocabulary('HLORUNTHESAUR199') IS NULL,'Unknown object must not resolve';
  resource:=api.get_partner_object_with_vocabulary('HLORUNTHESAUR101');
  ASSERT resource#>>'{data,id}'='HLORUNTHESAUR101','Published fixture missing from detail';
  ASSERT (resource#>>'{meta,vocabulary_release}')::bigint=rid,'Object content and vocabulary generation missing';
  ASSERT NOT(resource->'data' ? 'canonical_description') AND NOT(resource->'data' ? 'org_description'),'Private editor translation legs leaked';

  direct:=api.list_object_resources_page_text(NULL,ARRAY['fr'],50,ARRAY['HLO'],ARRAY['published'],NULL,'none',NULL,NULL,NULL,'card')::jsonb;
  page:=api.list_partner_objects_with_vocabulary(p_types=>ARRAY['HLO']);
  ASSERT page->'data'=direct->'data','Default object card contract changed';
  ASSERT (COALESCE(page->'info',page->'meta')->>'vocabulary_release')::bigint=rid,'Object page lacks coherent generation';

  page:=api.list_partner_objects_with_vocabulary(p_types=>ARRAY['HLO'],p_taxonomy_codes=>ARRAY['taxonomy_hlo:consumer_root']);
  ASSERT jsonb_array_length(page->'data')=1,'Real hierarchy filter must find child fixture';
  ASSERT page#>>'{data,0,id}'='HLORUNTHESAUR101','Wrong taxonomy-filtered fixture';
  ASSERT (page#>>'{meta,total}')::integer=1,'Filtered pagination must count before page slicing';
  ASSERT api.thesaurus_taxonomy_matches(ARRAY['taxonomy_hlo:consumer_root'],ARRAY['taxonomy_hlo:consumer_root'],'{}'), 'Default exact taxonomy comparison changed';
  ASSERT NOT api.thesaurus_taxonomy_matches(ARRAY['taxonomy_hlo:consumer_child'],ARRAY['taxonomy_hlo:unrelated'],'{"include_equivalent_predecessors":true}'), 'Equivalence bypassed actual relation validation';
  BEGIN
    PERFORM api.list_partner_objects_with_vocabulary(p_cursor=>api.cursor_pack('{"status":["draft"]}'));
    RAISE EXCEPTION 'Tampered cursor introduced draft visibility';
  EXCEPTION WHEN SQLSTATE 'PT400' THEN NULL; END;
  ASSERT NOT has_function_privilege('authenticated','api.get_partner_object_with_vocabulary(text,text[],text,text,boolean)','EXECUTE'),'Service-only object wrapper opened to app users';
  ASSERT NOT has_function_privilege('anon','api.list_partner_objects_with_vocabulary(text,text[],integer,text[],text[],text,text,text,text,text,text[],boolean)','EXECUTE'),'Service-only object list opened to anonymous users';
  SELECT concept_id INTO cid FROM thesaurus.concept WHERE source_kind='amenity'AND source_id='b73e2000-0000-4000-8000-000000000101';
  ASSERT cid IS NOT NULL,'Standalone catalog fixture lacks a concept';
  ASSERT EXISTS(SELECT 1 FROM jsonb_array_elements(api.list_catalog('amenity'))x WHERE x->>'code'='consumer_retired_amenity'),'Active amenity missing before retirement';
  revision:=api.thesaurus_admin('save_draft',jsonb_build_object('concept_id',cid,'expected_version',0,'document',thesaurus.concept_document(cid)||'{"lifecycle":"retired"}'::jsonb));
  revision:=api.thesaurus_admin('validate_draft',jsonb_build_object('revision_id',revision->>'revision_id','expected_version',(revision->>'version')::integer));
  PERFORM api.thesaurus_admin('publish',jsonb_build_object('revision_ids',jsonb_build_array(revision->>'revision_id'),'expected_revision_versions',jsonb_build_object(revision->>'revision_id',(revision->>'version')::integer),'expected_release_id',rid,'idempotency_key','consumer-retire-amenity'));
  ASSERT EXISTS(SELECT 1 FROM public.ref_amenity WHERE id='b73e2000-0000-4000-8000-000000000101'),'Retirement physically deleted the source';
  catalog:=api.list_reference_bundle(ARRAY['amenity','taxonomy_hlo','crm_sentiment']);
  ASSERT NOT EXISTS(SELECT 1 FROM jsonb_array_elements(catalog->'amenity')x WHERE x->>'code'='consumer_retired_amenity'),'Retired standalone amenity remained newly selectable through /catalog';
  ASSERT EXISTS(SELECT 1 FROM jsonb_array_elements(catalog->'taxonomy_hlo')x WHERE x->>'code'='consumer_heading'),'Retirement filtering removed an unrelated active structural category';
  ASSERT NOT(catalog?'crm_sentiment'),'Catalog wrapper widened the public allowlist';
  ASSERT NOT EXISTS(SELECT 1 FROM jsonb_each(catalog)d CROSS JOIN LATERAL jsonb_array_elements(d.value)x WHERE(SELECT array_agg(k ORDER BY k)FROM jsonb_object_keys(x)k)<>ARRAY['code','domain','icon_url','name','parent_code']),'Catalog wrapper changed its exact five-field shape';
  ASSERT api.thesaurus_public('concept',NULL,jsonb_build_object('concept_id',cid))#>>'{data,lifecycle}'='retired','Historical amenity is no longer resolvable through the rich thesaurus';
  RAISE NOTICE 'Thesaurus reference snapshot, atomic object contract, visibility and taxonomy consumer tests passed.';
END
$test$;
-- Exercise the actual invoker permission chain after moving the legacy serializer
-- into the private schema: a postgres-only test would miss a missing EXECUTE grant.
-- Isolated minimal test databases may omit the canonical bootstrap's public-reference
-- grants; restore only those read prerequisites inside this rolled-back transaction.
GRANT USAGE ON SCHEMA api,public TO anon;
GRANT SELECT ON public.ref_code,public.ref_amenity TO anon;
SET LOCAL ROLE anon;
DO $catalog_anon$
BEGIN
  ASSERT NOT EXISTS(SELECT 1 FROM jsonb_array_elements(api.list_catalog('amenity'))x WHERE x->>'code'='consumer_retired_amenity'),'Anonymous catalog lost retirement filtering';
  ASSERT EXISTS(SELECT 1 FROM jsonb_array_elements(api.list_catalog('taxonomy_hlo'))x WHERE x->>'code'='consumer_heading'),'Anonymous catalog lost active structural headings';
END
$catalog_anon$;
RESET ROLE;
ROLLBACK;
