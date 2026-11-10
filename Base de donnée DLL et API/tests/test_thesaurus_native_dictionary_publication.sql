-- Fresh-apply behavioral test for the native dictionary adapter extension.
-- Every fixture, publication and native write is rolled back at the end.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout='240s';

INSERT INTO auth.users(id,email) VALUES
 ('b91a0000-0000-4000-8000-000000000001','native-adapters@example.invalid') ON CONFLICT DO NOTHING;
INSERT INTO public.app_user_profile(id,role,display_name) VALUES
 ('b91a0000-0000-4000-8000-000000000001','super_admin','Native adapter test')
ON CONFLICT(id) DO UPDATE SET role='super_admin';
SELECT set_config('request.jwt.claims','{"sub":"b91a0000-0000-4000-8000-000000000001","role":"authenticated"}',true);

-- Do not encode live catalog counts in a disposable fresh database. Assert one
-- typed row per current native source identity, then prove stable sync identity.
SELECT thesaurus.sync_sources(NULL);
CREATE TEMP TABLE _native_ids_before ON COMMIT DROP AS
SELECT c.source_kind,c.source_id,c.domain,c.concept_id FROM thesaurus.concept c
WHERE c.domain=ANY(ARRAY['iti_assoc_role','object_relation_type','capacity_metric','legal_type','review_source',
 'sustainability_group','actor_role','contact_role','org_role']);
DO $adapter_identity$
BEGIN
  ASSERT (SELECT count(*)=count(DISTINCT (source_kind,source_id,domain)) FROM _native_ids_before),
    'Each native source tuple must map to one canonical identity';
  ASSERT NOT EXISTS(SELECT 1 FROM _native_ids_before i
    JOIN thesaurus.source_link sl USING(concept_id)
    JOIN thesaurus.concept c USING(concept_id)
    WHERE num_nonnulls(sl.ref_code_id,sl.amenity_id,sl.classification_scheme_id,sl.classification_value_id,
      sl.language_id,sl.commune_code,sl.sustainability_action_id,sl.sustainability_category_id,
      sl.iti_assoc_role_id,sl.object_relation_type_id,sl.capacity_metric_id,sl.legal_type_id,
      sl.review_source_id,sl.sustainability_group_id,sl.actor_role_id,sl.contact_role_id,sl.org_role_id)<>1
      OR CASE c.source_kind WHEN 'iti_assoc_role' THEN sl.iti_assoc_role_id::text
        WHEN 'object_relation_type' THEN sl.object_relation_type_id::text WHEN 'capacity_metric' THEN sl.capacity_metric_id::text
        WHEN 'legal_type' THEN sl.legal_type_id::text WHEN 'review_source' THEN sl.review_source_id::text
        WHEN 'sustainability_group' THEN sl.sustainability_group_id::text WHEN 'actor_role' THEN sl.actor_role_id::text
        WHEN 'contact_role' THEN sl.contact_role_id::text WHEN 'org_role' THEN sl.org_role_id::text END IS DISTINCT FROM c.source_id),
    'Typed source links must point to the exact native UUID and satisfy the one-of constraint';
  PERFORM thesaurus.sync_sources(NULL);
  ASSERT NOT EXISTS(SELECT 1 FROM _native_ids_before prior FULL JOIN
    (SELECT c.source_kind,c.source_id,c.domain,c.concept_id FROM thesaurus.concept c
     WHERE c.domain=ANY(ARRAY['iti_assoc_role','object_relation_type','capacity_metric','legal_type','review_source',
       'sustainability_group','actor_role','contact_role','org_role'])) current
    USING(source_kind,source_id,domain)
    WHERE prior.concept_id IS DISTINCT FROM current.concept_id OR prior.concept_id IS NULL OR current.concept_id IS NULL),
    'Repeated sync must preserve canonical IDs for all nine adapters';
END $adapter_identity$;

-- Guaranteed cross-category membership fixture. Category/action/group source
-- values are created before governance, with the required four-language text.
INSERT INTO public.ref_sustainability_action_category(id,code,name,description,position,name_i18n,description_i18n)
VALUES
 ('b91a0000-0000-4000-8000-000000000010','native_test_action_category','Catégorie action témoin','Définition catégorie témoin.',901,
  '{"fr":"Catégorie action témoin","en":"Test action category","es":"Categoría de acción de prueba","de":"Testaktionskategorie"}',
  '{"fr":"Catégorie témoin pour le test des groupes.","en":"Test category for group publication.","es":"Categoría de prueba para publicar grupos.","de":"Testkategorie für Gruppenveröffentlichungen."}'),
 ('b91a0000-0000-4000-8000-000000000011','native_test_group_category','Catégorie groupe témoin','Définition catégorie groupe témoin.',902,
  '{"fr":"Catégorie groupe témoin","en":"Test group category","es":"Categoría de grupo de prueba","de":"Testgruppenkategorie"}',
  '{"fr":"Catégorie témoin distincte pour un groupe.","en":"Distinct test category for a group.","es":"Categoría de prueba distinta para un grupo.","de":"Separate Testkategorie für eine Gruppe."}');
INSERT INTO public.ref_sustainability_action_group(id,category_id,code,name,description,position,name_i18n,description_i18n,extra)
VALUES('b91a0000-0000-4000-8000-000000000012','b91a0000-0000-4000-8000-000000000011',
 'native_test_group','Groupe natif témoin','Définition du groupe témoin.',903,
 '{"fr":"Groupe natif témoin","en":"Native test group","es":"Grupo nativo de prueba","de":"Native Testgruppe"}',
 '{"fr":"Groupe témoin du test des adhésions.","en":"Test group for membership publication.","es":"Grupo de prueba para publicar pertenencias.","de":"Testgruppe für Mitgliedschaftsveröffentlichung."}',
 '{"preserved":"yes"}');
INSERT INTO public.ref_sustainability_action(id,category_id,group_id,code,label,description,position,label_i18n,description_i18n,extra)
VALUES('b91a0000-0000-4000-8000-000000000013','b91a0000-0000-4000-8000-000000000010',
 'b91a0000-0000-4000-8000-000000000012','native_test_grouped_action','Action native témoin','Définition action témoin.',904,
 '{"fr":"Action native témoin","en":"Native test action","es":"Acción nativa de prueba","de":"Native Testaktion"}',
 '{"fr":"Action témoin dans une catégorie distincte de son groupe.","en":"Test action in a category distinct from its group.","es":"Acción de prueba en una categoría distinta de su grupo.","de":"Testaktion in einer anderen Kategorie als ihre Gruppe."}',
 '{"preserved":"yes"}');
INSERT INTO public.ref_iti_assoc_role(id,code,name,description,position)
VALUES('b91a0000-0000-4000-8000-000000000020','native_test_iti_role','Rôle itinéraire témoin','Description du rôle.',905);
INSERT INTO public.ref_object_relation_type(id,code,name,description,position)
VALUES('b91a0000-0000-4000-8000-000000000021','native_test_relation','Relation témoin','Description de la relation.',906);
INSERT INTO public.ref_capacity_metric(id,code,name,unit,icon_url,position,description)
VALUES('b91a0000-0000-4000-8000-000000000022','native_test_capacity','Capacité témoin','places','capacity.svg',907,'Description de la capacité.');
INSERT INTO public.ref_legal_type(id,code,name,description,category,is_required,is_public,review_interval_days)
VALUES('b91a0000-0000-4000-8000-000000000023','native_test_legal','Justificatif témoin','Description juridique.','business',true,false,31);
INSERT INTO public.ref_review_source(id,code,name,icon_url,base_url)
VALUES('b91a0000-0000-4000-8000-000000000024','native_test_review','Source d’avis témoin','review.svg','https://reviews.example.invalid/source');
INSERT INTO public.ref_actor_role(id,code,name,description,position)
VALUES('b91a0000-0000-4000-8000-000000000025','native_test_actor','Rôle acteur témoin','Description acteur.',908);
INSERT INTO public.ref_contact_role(id,code,name,description,position)
VALUES('b91a0000-0000-4000-8000-000000000026','native_test_contact','Rôle contact témoin','Description contact.',909);
INSERT INTO public.ref_org_role(id,code,name,description,position)
VALUES('b91a0000-0000-4000-8000-000000000027','native_test_org','Rôle organisation témoin','Description organisation.',910);
SELECT thesaurus.sync_sources(NULL);

CREATE TEMP TABLE _native_fixture_ids ON COMMIT DROP AS
SELECT c.source_kind,c.source_id,c.domain,c.concept_id
FROM thesaurus.concept c
WHERE c.source_id IN('b91a0000-0000-4000-8000-000000000020','b91a0000-0000-4000-8000-000000000021',
 'b91a0000-0000-4000-8000-000000000022','b91a0000-0000-4000-8000-000000000023',
 'b91a0000-0000-4000-8000-000000000024','b91a0000-0000-4000-8000-000000000025',
 'b91a0000-0000-4000-8000-000000000026','b91a0000-0000-4000-8000-000000000027',
 'b91a0000-0000-4000-8000-000000000012','b91a0000-0000-4000-8000-000000000013');
DO $synthetic_adapter_identity$
BEGIN
  ASSERT (SELECT count(DISTINCT domain)=9 FROM _native_fixture_ids
    WHERE domain=ANY(ARRAY['iti_assoc_role','object_relation_type','capacity_metric','legal_type','review_source',
      'sustainability_group','actor_role','contact_role','org_role'])),
    'Disposable fixtures must exercise every new native adapter domain';
  ASSERT NOT EXISTS(SELECT 1 FROM _native_fixture_ids i JOIN thesaurus.source_link sl USING(concept_id)
    WHERE i.domain=ANY(ARRAY['iti_assoc_role','object_relation_type','capacity_metric','legal_type','review_source',
      'sustainability_group','actor_role','contact_role','org_role'])
      AND num_nonnulls(sl.iti_assoc_role_id,sl.object_relation_type_id,sl.capacity_metric_id,sl.legal_type_id,
      sl.review_source_id,sl.sustainability_group_id,sl.actor_role_id,sl.contact_role_id,sl.org_role_id)<>1),
    'Every synthetic native adapter fixture must have exactly one new typed source link';
END $synthetic_adapter_identity$;

-- Complete only the three selected domains before governance; the fresh seed may
-- contain French-only records. Operational membership/context fields stay intact.
UPDATE public.ref_sustainability_action_category c
SET name_i18n=jsonb_build_object('fr',c.name,'en',COALESCE(NULLIF(c.name_i18n->>'en',''),'Test category '||c.code),
      'es',COALESCE(NULLIF(c.name_i18n->>'es',''),'Categoría de prueba '||c.code),
      'de',COALESCE(NULLIF(c.name_i18n->>'de',''),'Testkategorie '||c.code)),
    description='Définition témoin de la catégorie « '||c.name||' ».',
    description_i18n=jsonb_build_object('fr','Définition témoin de la catégorie « '||c.name||' ».',
      'en','Test definition for category '||c.code||'.','es','Definición de prueba para categoría '||c.code||'.',
      'de','Testdefinition für Kategorie '||c.code||'.');
UPDATE public.ref_sustainability_action a
SET label_i18n=jsonb_build_object('fr',a.label,'en',COALESCE(NULLIF(a.label_i18n->>'en',''),'Test action '||a.code),
      'es',COALESCE(NULLIF(a.label_i18n->>'es',''),'Acción de prueba '||a.code),
      'de',COALESCE(NULLIF(a.label_i18n->>'de',''),'Testaktion '||a.code)),
    description='Définition témoin de l’action « '||a.label||' ».',
    description_i18n=jsonb_build_object('fr','Définition témoin de l’action « '||a.label||' ».',
      'en','Test definition for action '||a.code||'.','es','Definición de prueba para acción '||a.code||'.',
      'de','Testdefinition für Aktion '||a.code||'.');
UPDATE public.ref_sustainability_action_group g
SET name_i18n=jsonb_build_object('fr',g.name,'en',COALESCE(NULLIF(g.name_i18n->>'en',''),'Test group '||g.code),
      'es',COALESCE(NULLIF(g.name_i18n->>'es',''),'Grupo de prueba '||g.code),
      'de',COALESCE(NULLIF(g.name_i18n->>'de',''),'Testgruppe '||g.code)),
    description='Définition témoin du groupe « '||g.name||' ».',
    description_i18n=jsonb_build_object('fr','Définition témoin du groupe « '||g.name||' ».',
      'en','Test definition for group '||g.code||'.','es','Definición de prueba para grupo '||g.code||'.',
      'de','Testdefinition für Gruppe '||g.code||'.');

CREATE TEMP TABLE _native_group_base(release_id bigint,concept_id uuid PRIMARY KEY,domain text,document jsonb) ON COMMIT DROP;

DO $native_publication_setup$
DECLARE activation jsonb;rid bigint;base_release bigint;group_id uuid;action_id uuid;group_doc jsonb;action_doc jsonb;expected jsonb;again jsonb;
BEGIN
  ASSERT NOT EXISTS(SELECT 1 FROM thesaurus.release), 'Fresh-apply test starts without a committed release';
  ASSERT NOT EXISTS(SELECT 1 FROM thesaurus.vocabulary WHERE domain IN('sustainability_category','sustainability_action','sustainability_group') AND is_governed),
    'Selected source domains must still be ungoverned before the scoped bootstrap';
  PERFORM api.thesaurus_admin('configure_instance',
    '{"base_uri":"https://example.invalid/thesaurus/concepts/","license":"test-only","attribution":"Native adapter test"}');
  activation:=api.thesaurus_admin('bootstrap',jsonb_build_object('domains',
    jsonb_build_array('sustainability_category','sustainability_action'),
    'expected_release_id',NULL,'idempotency_key','native-adapter-base-bootstrap'));
  rid:=(activation->>'release_id')::bigint;
  base_release:=rid;
  ASSERT rid IS NOT NULL, 'Scoped public category/action release must be created through the protected bootstrap API';
  ASSERT NOT EXISTS(SELECT 1 FROM thesaurus.release_concept WHERE release_id=rid AND domain='sustainability_group'),
    'Group concepts stay unpublished before their explicit bootstrap';
  INSERT INTO _native_group_base(release_id,concept_id,domain,document)
    SELECT rid,concept_id,domain,document FROM thesaurus.release_concept WHERE release_id=rid;
  ASSERT NOT EXISTS(SELECT 1 FROM thesaurus.release_concept WHERE release_id=rid AND domain='sustainability_action' AND document?'member_of'),
    'Action membership must be hidden until the group vocabulary is public and governed';

  activation:=api.thesaurus_admin('bootstrap',jsonb_build_object('domains',jsonb_build_array('sustainability_group'),
    'expected_release_id',rid,'idempotency_key','native-adapter-group-bootstrap'));
  rid:=(activation->>'release_id')::bigint;
  SELECT c.concept_id INTO STRICT group_id FROM thesaurus.concept c WHERE c.domain='sustainability_group'
    AND c.source_id='b91a0000-0000-4000-8000-000000000012';
  SELECT c.concept_id INTO STRICT action_id FROM thesaurus.concept c WHERE c.domain='sustainability_action'
    AND c.source_id='b91a0000-0000-4000-8000-000000000013';
  SELECT document INTO STRICT group_doc FROM thesaurus.release_concept WHERE release_id=rid AND concept_id=group_id;
  SELECT document INTO STRICT action_doc FROM thesaurus.release_concept WHERE release_id=rid AND concept_id=action_id;
  ASSERT group_doc->'members'=jsonb_build_array(action_id)
    AND action_doc->'member_of'=jsonb_build_array(group_id),
    'Initial group bootstrap must dirty and snapshot both native membership endpoints';
  ASSERT NOT EXISTS(SELECT 1 FROM thesaurus.native_membership_edges() e
    JOIN thesaurus.release_concept a ON a.release_id=rid AND a.concept_id=e.action_concept_id
    JOIN thesaurus.release_concept g ON g.release_id=rid AND g.concept_id=e.group_concept_id
    WHERE NOT a.is_public OR NOT g.is_public
      OR a.document->'member_of' IS DISTINCT FROM jsonb_build_array(e.group_concept_id)
      OR g.document->'members' IS DISTINCT FROM(SELECT jsonb_agg(edge.action_concept_id ORDER BY edge.action_concept_id)
        FROM thesaurus.native_membership_edges() edge WHERE edge.group_concept_id=e.group_concept_id)),
    'Every current native membership edge must appear symmetrically in both public snapshot endpoints';
  ASSERT group_doc->'broader'=jsonb_build_array((SELECT concept_id FROM thesaurus.concept
    WHERE domain='sustainability_category' AND source_id='b91a0000-0000-4000-8000-000000000011'))
    AND action_doc->'broader'=jsonb_build_array((SELECT concept_id FROM thesaurus.concept
      WHERE domain='sustainability_category' AND source_id='b91a0000-0000-4000-8000-000000000010')),
    'Group and action category contexts must remain distinct from membership';
  ASSERT NOT EXISTS(SELECT 1 FROM thesaurus.release_change rc JOIN thesaurus.concept c USING(concept_id)
    WHERE rc.release_id=rid AND c.domain NOT IN('sustainability_group','sustainability_action','sustainability_category')),
    'Group bootstrap must not dirty unrelated domain documents';
  ASSERT NOT EXISTS(
    (SELECT c.concept_id FROM thesaurus.concept c WHERE c.domain='sustainability_group'
     UNION SELECT ac.concept_id FROM thesaurus.concept ac
       JOIN public.ref_sustainability_action a ON a.id=ac.source_id::uuid
       WHERE ac.domain='sustainability_action' AND a.group_id IS NOT NULL
     UNION SELECT cc.concept_id FROM thesaurus.concept cc
       JOIN public.ref_sustainability_action_group g ON g.category_id=cc.source_id::uuid
       WHERE cc.domain='sustainability_category')
    EXCEPT (SELECT concept_id FROM thesaurus.release_change WHERE release_id=rid))
    AND NOT EXISTS((SELECT concept_id FROM thesaurus.release_change WHERE release_id=rid)
    EXCEPT (SELECT c.concept_id FROM thesaurus.concept c WHERE c.domain='sustainability_group'
     UNION SELECT ac.concept_id FROM thesaurus.concept ac
       JOIN public.ref_sustainability_action a ON a.id=ac.source_id::uuid
       WHERE ac.domain='sustainability_action' AND a.group_id IS NOT NULL
     UNION SELECT cc.concept_id FROM thesaurus.concept cc
       JOIN public.ref_sustainability_action_group g ON g.category_id=cc.source_id::uuid
       WHERE cc.domain='sustainability_category')),
    'Initial group bootstrap must dirty exactly groups, member actions and their category parents';
  ASSERT NOT EXISTS(SELECT 1 FROM _native_group_base b JOIN thesaurus.release_concept r USING(concept_id)
    JOIN thesaurus.concept c USING(concept_id)
    JOIN public.ref_sustainability_action a ON a.id=c.source_id::uuid
    WHERE r.release_id=rid AND b.document IS DISTINCT FROM r.document
      AND b.domain='sustainability_action' AND a.group_id IS NULL),
    'Nonmember action documents must copy byte-for-byte from the earlier snapshot';
  ASSERT NOT EXISTS(SELECT 1 FROM _native_group_base b JOIN thesaurus.release_concept r USING(concept_id)
    JOIN thesaurus.concept c USING(concept_id)
    WHERE r.release_id=rid AND b.domain='sustainability_category'
      AND NOT EXISTS(SELECT 1 FROM public.ref_sustainability_action_group g WHERE g.category_id=c.source_id::uuid)
      AND b.document IS DISTINCT FROM r.document),
    'Categories unrelated to any native group must copy byte-for-byte';
  ASSERT NOT EXISTS(SELECT 1 FROM thesaurus.publication_documents() d
    WHERE d.document IS DISTINCT FROM(thesaurus.concept_document(d.concept_id,false)
      -'source_kind'-'source_key'-'source_fields'-'source_fingerprint'-'name_i18n'-'description_i18n'-'legacy_search_terms')),
    'Per-concept and set-based public renderers must agree on membership fields';
  expected:=api.thesaurus_public('concept',rid,jsonb_build_object('concept_id',action_id));
  ASSERT expected#>'{data,member_of}'=jsonb_build_array(group_id),
    'Public API must return the frozen membership projection';
  again:=api.thesaurus_admin('bootstrap',jsonb_build_object('domains',jsonb_build_array('sustainability_group'),
    'expected_release_id',base_release,'idempotency_key','native-adapter-group-bootstrap'));
  ASSERT again->>'idempotent'='true' AND (again->>'release_id')::bigint=rid,
    'Repeated group bootstrap must be idempotent';
END $native_publication_setup$;

CREATE TEMP TABLE _native_group_release ON COMMIT DROP AS
SELECT r.release_id,r.manifest,r.checksum,rc.concept_id,rc.document
FROM thesaurus.release r JOIN thesaurus.release_concept rc USING(release_id)
WHERE r.release_id=api.thesaurus_generation();
CREATE TEMP TABLE _native_group_action_response ON COMMIT DROP AS
SELECT api.thesaurus_public('concept',api.thesaurus_generation(),
  jsonb_build_object('concept_id',(SELECT concept_id FROM thesaurus.concept
    WHERE domain='sustainability_action' AND source_id='b91a0000-0000-4000-8000-000000000013'))) AS response;

DO $native_protected_edits$
DECLARE cid uuid;doc jsonb;bad jsonb;other_id uuid;
BEGIN
  SELECT concept_id INTO STRICT cid FROM thesaurus.concept WHERE domain='capacity_metric'
    AND source_id='b91a0000-0000-4000-8000-000000000022';
  doc:=thesaurus.concept_document(cid);
  bad:=jsonb_set(doc,'{source_fields,unit}',to_jsonb((doc#>>'{source_fields,unit}')||'-changed'),true);
  BEGIN PERFORM api.thesaurus_admin('save_draft',jsonb_build_object('concept_id',cid,'expected_version',0,'document',bad));
    RAISE EXCEPTION 'Capacity unit edit was accepted'; EXCEPTION WHEN SQLSTATE 'PT400' THEN NULL; END;
  ASSERT NOT EXISTS(SELECT 1 FROM thesaurus.revision WHERE concept_id=cid),'Rejected capacity unit edit must not create a draft';

  SELECT concept_id INTO STRICT cid FROM thesaurus.concept WHERE domain='legal_type'
    AND source_id='b91a0000-0000-4000-8000-000000000023';
  doc:=thesaurus.concept_document(cid);
  bad:=jsonb_set(doc,'{source_fields,is_public}',to_jsonb(NOT (doc#>>'{source_fields,is_public}')::boolean),true);
  BEGIN PERFORM api.thesaurus_admin('save_draft',jsonb_build_object('concept_id',cid,'expected_version',0,'document',bad));
    RAISE EXCEPTION 'Legal visibility edit was accepted'; EXCEPTION WHEN SQLSTATE 'PT400' THEN NULL; END;
  ASSERT NOT EXISTS(SELECT 1 FROM thesaurus.revision WHERE concept_id=cid),'Rejected legal visibility edit must not create a draft';

  SELECT concept_id INTO STRICT cid FROM thesaurus.concept WHERE domain='review_source'
    AND source_id='b91a0000-0000-4000-8000-000000000024';
  doc:=thesaurus.concept_document(cid);
  bad:=jsonb_set(doc,'{source_fields,base_url}',to_jsonb('https://forbidden.example.invalid'::text),true);
  BEGIN PERFORM api.thesaurus_admin('save_draft',jsonb_build_object('concept_id',cid,'expected_version',0,'document',bad));
    RAISE EXCEPTION 'Review-source base URL edit was accepted'; EXCEPTION WHEN SQLSTATE 'PT400' THEN NULL; END;
  ASSERT NOT EXISTS(SELECT 1 FROM thesaurus.revision WHERE concept_id=cid),'Rejected review URL edit must not create a draft';

  SELECT concept_id INTO STRICT cid FROM thesaurus.concept WHERE domain='sustainability_group'
    AND source_id='b91a0000-0000-4000-8000-000000000012';
  doc:=thesaurus.concept_document(cid);
  bad:=jsonb_set(doc,'{source_fields,category_id}',to_jsonb('b91a0000-0000-4000-8000-000000000010'::text),true);
  BEGIN PERFORM api.thesaurus_admin('save_draft',jsonb_build_object('concept_id',cid,'expected_version',0,'document',bad));
    RAISE EXCEPTION 'Group category context edit was accepted'; EXCEPTION WHEN SQLSTATE 'PT400' THEN NULL; END;
  ASSERT NOT EXISTS(SELECT 1 FROM thesaurus.revision WHERE concept_id=cid),'Rejected group context edit must not create a draft';

  SELECT concept_id INTO STRICT cid FROM thesaurus.concept WHERE domain='sustainability_action'
    AND source_id='b91a0000-0000-4000-8000-000000000013';
  doc:=thesaurus.concept_document(cid);
  SELECT id INTO STRICT other_id FROM public.ref_sustainability_action_group
    WHERE id<>'b91a0000-0000-4000-8000-000000000012' ORDER BY id LIMIT 1;
  bad:=jsonb_set(doc,'{source_fields,group_id}',to_jsonb(other_id::text),true);
  BEGIN PERFORM api.thesaurus_admin('save_draft',jsonb_build_object('concept_id',cid,'expected_version',0,'document',bad));
    RAISE EXCEPTION 'Action membership edit was accepted'; EXCEPTION WHEN SQLSTATE 'PT400' THEN NULL; END;
  ASSERT NOT EXISTS(SELECT 1 FROM thesaurus.revision WHERE concept_id=cid),'Rejected action membership edit must not create a draft';
END $native_protected_edits$;

CREATE TEMP TABLE _review_source_before ON COMMIT DROP AS
SELECT id,to_jsonb(r) row_image FROM public.ref_review_source r;
CREATE TEMP TABLE _review_source_expected ON COMMIT DROP AS
SELECT id,'Source d’avis revue '||code AS name FROM public.ref_review_source;

DO $review_source_editorial_publication$
DECLARE items jsonb:='[]';saved jsonb;checks jsonb;validated jsonb;revision_ids jsonb;versions jsonb;preview jsonb;published jsonb;
  r record;doc jsonb;rid bigint;cid uuid;api_doc jsonb;expected_name text;
BEGIN
  FOR r IN SELECT c.concept_id,c.domain,c.code FROM thesaurus.concept c
    WHERE c.domain='review_source' ORDER BY c.code LOOP
    doc:=thesaurus.concept_document(r.concept_id)||jsonb_build_object(
      'name','Source d’avis revue '||r.code,
      'description','Définition de test pour la source d’avis « '||r.code||' ».',
      'name_i18n',jsonb_build_object('fr','Source d’avis revue '||r.code,'en','Reviewed source '||r.code,
        'es','Fuente revisada '||r.code,'de','Geprüfte Quelle '||r.code),
      'description_i18n',jsonb_build_object('fr','Définition de test pour la source d’avis « '||r.code||' ».',
        'en','Test definition for review source '||r.code||'.','es','Definición de prueba para fuente de opiniones '||r.code||'.',
        'de','Testdefinition für Bewertungsquelle '||r.code||'.'));
    items:=items||jsonb_build_array(jsonb_build_object('concept_id',r.concept_id,'domain',r.domain,
      'expected_version',0,'expected_source_fingerprint',thesaurus.source_fingerprint(r.concept_id),
      'only_if_no_revision',true,'document',doc));
  END LOOP;
  ASSERT jsonb_array_length(items)>0 AND jsonb_array_length(items)<=100,
    'Review-source fixtures must fit the existing bounded editorial batch';
  saved:=api.thesaurus_admin('save_drafts',jsonb_build_object('items',items));
  ASSERT jsonb_array_length(saved->'items')=jsonb_array_length(items),'Every review-source draft must be saved';
  ASSERT NOT EXISTS(SELECT 1 FROM _review_source_before b JOIN public.ref_review_source r USING(id)
    WHERE b.row_image IS DISTINCT FROM to_jsonb(r)),'Draft saves must leave all native review-source rows unchanged';
  SELECT jsonb_agg(jsonb_build_object('revision_id',x->>'revision_id','expected_version',(x->>'version')::integer))
    INTO checks FROM jsonb_array_elements(saved->'items') x;
  validated:=api.thesaurus_admin('validate_drafts',jsonb_build_object('items',checks));
  ASSERT NOT EXISTS(SELECT 1 FROM jsonb_array_elements(validated->'items') x
    WHERE x->>'status'<>'validated' OR jsonb_array_length(x->'errors')<>0),
    'Review-source overlay-only definitions must validate in all four locales';
  ASSERT NOT EXISTS(SELECT 1 FROM _review_source_before b JOIN public.ref_review_source r USING(id)
    WHERE b.row_image IS DISTINCT FROM to_jsonb(r)),'Validation must leave native review-source rows unchanged';
  SELECT jsonb_agg(x->>'revision_id'),jsonb_object_agg(x->>'revision_id',(x->>'version')::integer)
    INTO revision_ids,versions FROM jsonb_array_elements(validated->'items') x;
  preview:=api.thesaurus_admin('preview',jsonb_build_object('revision_ids',revision_ids));
  ASSERT jsonb_array_length(preview->'errors')=0,'Review-source preview must pass before publication';
  ASSERT NOT EXISTS(SELECT 1 FROM _review_source_before b JOIN public.ref_review_source r USING(id)
    WHERE b.row_image IS DISTINCT FROM to_jsonb(r)),'Preview must leave native review-source rows unchanged';
  published:=api.thesaurus_admin('publish',jsonb_build_object('revision_ids',revision_ids,
    'expected_revision_versions',versions,'expected_release_id',api.thesaurus_generation(),
    'preview_fingerprint',preview->>'preview_fingerprint','idempotency_key','native-adapter-review-source-publish'));
  rid:=(published->>'release_id')::bigint;
  ASSERT (published->>'changed_count')::integer=jsonb_array_length(items),
    'Review-source edits must use normal validated publication';
  ASSERT NOT EXISTS(SELECT 1 FROM _review_source_expected e JOIN public.ref_review_source r USING(id)
    JOIN _review_source_before b USING(id)
    WHERE r.name IS DISTINCT FROM e.name OR (to_jsonb(r)-'name'-'updated_at') IS DISTINCT FROM (b.row_image-'name'-'updated_at')),
    'Review-source publisher may change native French name only and must preserve provider URL/icon/code';
  SELECT concept_id INTO STRICT cid FROM thesaurus.concept WHERE domain='review_source'
    AND source_id=(SELECT id::text FROM public.ref_review_source ORDER BY id LIMIT 1);
  api_doc:=api.thesaurus_public('concept',rid,jsonb_build_object('concept_id',cid));
  ASSERT api_doc#>>'{data,definitions,fr}' IS NOT NULL AND api_doc#>>'{data,definitions,en}' IS NOT NULL
    AND api_doc#>>'{data,definitions,es}' IS NOT NULL AND api_doc#>>'{data,definitions,de}' IS NOT NULL,
    'Review-source definitions must be served from frozen localized_field overlays';
  ASSERT (SELECT count(*)=4 FROM thesaurus.localized_field WHERE concept_id=cid AND field='description'
    AND lang=ANY(ARRAY['fr','en','es','de'])),
    'Review-source French and translated definitions must all use overlay storage';
  BEGIN
    UPDATE public.ref_review_source SET name='DML direct interdite'
    WHERE id=(SELECT id FROM public.ref_review_source ORDER BY id LIMIT 1);
    RAISE EXCEPTION 'Governed review-source table accepted direct DML';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $review_source_editorial_publication$;

CREATE TEMP TABLE _actor_role_before ON COMMIT DROP AS
SELECT id,to_jsonb(r) row_image FROM public.ref_actor_role r;

DO $private_actor_role_publication$
DECLARE items jsonb:='[]';saved jsonb;checks jsonb;validated jsonb;revision_ids jsonb;versions jsonb;
  preview jsonb;published jsonb;r record;doc jsonb;rid bigint;cid uuid;private_id uuid;public_result jsonb;
BEGIN
  FOR r IN SELECT c.concept_id,c.domain,c.code,c.source_id FROM thesaurus.concept c
    WHERE c.domain='actor_role' ORDER BY c.code LOOP
    doc:=thesaurus.concept_document(r.concept_id);
    doc:=doc||jsonb_build_object(
      'name',CASE WHEN r.source_id='b91a0000-0000-4000-8000-000000000025' THEN 'Rôle acteur privé publié' ELSE doc->>'name' END,
      'description','Définition de test du rôle acteur « '||r.code||' ».',
      'name_i18n',jsonb_build_object('fr',CASE WHEN r.source_id='b91a0000-0000-4000-8000-000000000025'
        THEN 'Rôle acteur privé publié' ELSE doc->>'name' END,'en','Reviewed actor role '||r.code,
        'es','Función de actor revisada '||r.code,'de','Geprüfte Akteursrolle '||r.code),
      'description_i18n',jsonb_build_object('fr','Définition de test du rôle acteur « '||r.code||' ».',
        'en','Test definition for actor role '||r.code||'.','es','Definición de prueba para función de actor '||r.code||'.',
        'de','Testdefinition für Akteursrolle '||r.code||'.'));
    items:=items||jsonb_build_array(jsonb_build_object('concept_id',r.concept_id,'domain',r.domain,
      'expected_version',0,'expected_source_fingerprint',thesaurus.source_fingerprint(r.concept_id),
      'only_if_no_revision',true,'document',doc));
  END LOOP;
  ASSERT jsonb_array_length(items)>0 AND jsonb_array_length(items)<=100,
    'Private actor-role concepts must fit one ordinary bounded editorial batch';
  saved:=api.thesaurus_admin('save_drafts',jsonb_build_object('items',items));
  ASSERT NOT EXISTS(SELECT 1 FROM _actor_role_before b JOIN public.ref_actor_role r USING(id)
    WHERE b.row_image IS DISTINCT FROM to_jsonb(r)),'Private draft saves must not mutate native actor-role rows';
  SELECT jsonb_agg(jsonb_build_object('revision_id',x->>'revision_id','expected_version',(x->>'version')::integer))
    INTO checks FROM jsonb_array_elements(saved->'items') x;
  validated:=api.thesaurus_admin('validate_drafts',jsonb_build_object('items',checks));
  ASSERT NOT EXISTS(SELECT 1 FROM jsonb_array_elements(validated->'items') x
    WHERE x->>'status'<>'validated' OR jsonb_array_length(x->'errors')<>0),
    'Existing private canonical IDs must validate with complete definitions';
  ASSERT NOT EXISTS(SELECT 1 FROM _actor_role_before b JOIN public.ref_actor_role r USING(id)
    WHERE b.row_image IS DISTINCT FROM to_jsonb(r)),'Private validation must not mutate native actor-role rows';
  SELECT jsonb_agg(x->>'revision_id'),jsonb_object_agg(x->>'revision_id',(x->>'version')::integer)
    INTO revision_ids,versions FROM jsonb_array_elements(validated->'items') x;
  preview:=api.thesaurus_admin('preview',jsonb_build_object('revision_ids',revision_ids));
  ASSERT jsonb_array_length(preview->'errors')=0,'Private actor-role preview must be valid';
  published:=api.thesaurus_admin('publish',jsonb_build_object('revision_ids',revision_ids,
    'expected_revision_versions',versions,'expected_release_id',api.thesaurus_generation(),
    'preview_fingerprint',preview->>'preview_fingerprint','idempotency_key','native-adapter-private-actor-roles-publish'));
  rid:=(published->>'release_id')::bigint;
  ASSERT rid IS NOT NULL AND (published->>'changed_count')::integer=jsonb_array_length(items),
    'Private actor-role concepts must complete the normal save/validate/preview/publish circuit';
  ASSERT NOT EXISTS(SELECT 1 FROM _actor_role_before b JOIN public.ref_actor_role r USING(id)
    WHERE (b.row_image-'name'-'description'-'updated_at') IS DISTINCT FROM(to_jsonb(r)-'name'-'description'-'updated_at')),
    'Private actor-role publication must preserve non-descriptive source fields';
  SELECT concept_id INTO STRICT cid FROM thesaurus.concept WHERE domain='actor_role'
    AND source_id='b91a0000-0000-4000-8000-000000000025';
  private_id:=cid;
  ASSERT EXISTS(SELECT 1 FROM thesaurus.release_concept WHERE release_id=rid AND concept_id=private_id AND NOT is_public)
    AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements((SELECT manifest->'domains' FROM thesaurus.release WHERE release_id=rid)) d
      WHERE d->>'domain'='actor_role'),
    'Private actor-role IDs may be frozen privately but must remain absent from the public manifest';
  ASSERT (SELECT name='Rôle acteur privé publié' FROM public.ref_actor_role
    WHERE id='b91a0000-0000-4000-8000-000000000025'),
    'Private native French name must be written through the protected publisher path';
  BEGIN
    PERFORM api.thesaurus_public('concept',rid,jsonb_build_object('concept_id',private_id));
    RAISE EXCEPTION 'Private actor-role concept became publicly readable';
  EXCEPTION WHEN SQLSTATE 'PT404' THEN NULL; END;
  public_result:=api.thesaurus_public('concept',(SELECT min(release_id) FROM _native_group_release),
    jsonb_build_object('concept_id',(SELECT concept_id FROM thesaurus.concept WHERE domain='sustainability_action'
      AND source_id='b91a0000-0000-4000-8000-000000000013')));
  ASSERT public_result=(SELECT response FROM _native_group_action_response),
    'Later public and private publications must not alter older membership payloads';
  ASSERT NOT EXISTS(SELECT 1 FROM _native_group_release old
    LEFT JOIN thesaurus.release r USING(release_id)
    LEFT JOIN thesaurus.release_concept current ON current.release_id=old.release_id AND current.concept_id=old.concept_id
    WHERE r.release_id IS NULL OR r.manifest IS DISTINCT FROM old.manifest OR r.checksum IS DISTINCT FROM old.checksum
      OR current.concept_id IS NULL OR current.document IS DISTINCT FROM old.document),
    'Every concept document and manifest in the earlier group snapshot must stay immutable';
END $private_actor_role_publication$;

ROLLBACK;
