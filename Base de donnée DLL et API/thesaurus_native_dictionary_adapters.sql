-- Add nine explicitly reviewed, native source dictionaries to the private
-- thesaurus adapters. This migration installs metadata and guards only: it does
-- not create concepts, edit source rows, enable governance, or publish a release.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

DO $preflight$
DECLARE native_table text;executor_name text;executor_oid oid;had_executor_grant boolean;
  prior_admin boolean;prior_inherit boolean;prior_set boolean;memberships_before jsonb;memberships_after jsonb;
BEGIN
  IF current_setting('transaction_isolation')<>'read committed' THEN
    RAISE EXCEPTION 'Native dictionary adapter upgrade requires READ COMMITTED' USING ERRCODE='PT409';
  END IF;
  PERFORM thesaurus.take_source_gate();
  -- These nine dictionaries did not participate in the old source gate.
  -- Drain their native writers before checking/installing the new gates.
  FOR native_table IN SELECT unnest(ARRAY[
    'public.ref_actor_role','public.ref_capacity_metric','public.ref_contact_role','public.ref_iti_assoc_role',
    'public.ref_legal_type','public.ref_object_relation_type','public.ref_org_role','public.ref_review_source',
    'public.ref_sustainability_action_group','public.ref_catalog_registry']) ORDER BY 1 LOOP
    EXECUTE format('LOCK TABLE %s IN SHARE ROW EXCLUSIVE MODE',native_table::regclass);
  END LOOP;
  -- S2 -> X1 exactly matches the metadata migration and waits out editorial
  -- writes before inspecting drafts, source identities, or frozen vocabulary.
  PERFORM pg_advisory_xact_lock(741126,1);
  -- Fail closed on any prior prepared-publication drift before changing the
  -- reviewed registry. Temporarily inherit only the existing publisher role,
  -- restoring every grantor's exact membership row before continuing.
  executor_name:=current_user;executor_oid:=executor_name::regrole::oid;
  -- Pin production predecessor bodies and capture complete function/view
  -- metadata before any schema object is touched. OIDs are intentionally
  -- captured from this database rather than copied from another cluster.
  IF (SELECT md5(replace(prosrc,chr(13),'')) FROM pg_proc WHERE oid='thesaurus.guard_source()'::regprocedure)<>'019744a91ecedeadc998b911cf9ab778'
    OR (SELECT md5(replace(prosrc,chr(13),'')) FROM pg_proc WHERE oid='thesaurus.sync_sources(text[])'::regprocedure)<>'19f8b5120bf090539baa60bf67f82100'
    OR (SELECT md5(replace(prosrc,chr(13),'')) FROM pg_proc WHERE oid='thesaurus.usage_objects(uuid[])'::regprocedure)<>'c86b54135a58ac0d70ad059a0833c193'
    OR (SELECT md5(replace(prosrc,chr(13),'')) FROM pg_proc WHERE oid='thesaurus.concept_document(uuid,boolean)'::regprocedure)<>'d701242b717044c27cb25ec63ad3ca8d'
    OR (SELECT md5(replace(prosrc,chr(13),'')) FROM pg_proc WHERE oid='thesaurus.publication_documents(uuid[])'::regprocedure)<>'1302cfff941a16e4c1d0220ffba99a85'
    OR (SELECT md5(replace(prosrc,chr(13),'')) FROM pg_proc WHERE oid='thesaurus.validate_document(uuid,jsonb)'::regprocedure)<>'215c245b6b3334049de9ede7c5a44416'
    OR (SELECT md5(replace(prosrc,chr(13),'')) FROM pg_proc WHERE oid='thesaurus.apply_source(uuid,jsonb)'::regprocedure)<>'6bb8e65e21cf5d437be1d82eefc435cf'
    OR (SELECT md5(replace(prosrc,chr(13),'')) FROM pg_proc WHERE oid='thesaurus.admin_dispatch(text,jsonb)'::regprocedure)<>'32f1b1b3cfedd47dd338e8713fdf6437'
    OR (SELECT md5(replace(prosrc,chr(13),'')) FROM pg_proc WHERE oid='thesaurus.row_has_historical_reference(oid,jsonb,oid[],integer)'::regprocedure)<>'78a1c2d56f14fb5611992e6b808d4b12'
    OR (SELECT md5(replace(prosrc,chr(13),'')) FROM pg_proc WHERE oid='thesaurus.guard_assignment()'::regprocedure)<>'9e7bc848a0b4f5168380108bc511ee30'
    OR (SELECT md5(replace(prosrc,chr(13),'')) FROM pg_proc WHERE oid='thesaurus.preparation_sources()'::regprocedure)<>'e47f98f26bc9b82bd677f766e4fc088d'
    OR (SELECT md5(replace(pg_get_viewdef('thesaurus.source_rows'::regclass,true),chr(13),'')))<>'fbcb3685b4ede2c6a572f19d677acbf6' THEN
    RAISE EXCEPTION 'Reviewed native adapter predecessor body contract changed';
  END IF;
  CREATE TEMP TABLE thesaurus_native_adapter_function_metadata_before ON COMMIT DROP AS
    SELECT p.oid::regprocedure::text signature,to_jsonb(p)-'prosrc' metadata FROM pg_proc p
    WHERE p.oid=ANY(ARRAY['thesaurus.guard_source()'::regprocedure,'thesaurus.sync_sources(text[])'::regprocedure,
      'thesaurus.usage_objects(uuid[])'::regprocedure,'thesaurus.concept_document(uuid,boolean)'::regprocedure,
      'thesaurus.publication_documents(uuid[])'::regprocedure,'thesaurus.validate_document(uuid,jsonb)'::regprocedure,
      'thesaurus.apply_source(uuid,jsonb)'::regprocedure,'thesaurus.admin_dispatch(text,jsonb)'::regprocedure,
      'thesaurus.row_has_historical_reference(oid,jsonb,oid[],integer)'::regprocedure,
      'thesaurus.guard_assignment()'::regprocedure,'thesaurus.preparation_sources()'::regprocedure,
      'thesaurus.activate(uuid[],text[],text,bigint,jsonb)'::regprocedure]::oid[]);
  CREATE TEMP TABLE thesaurus_native_adapter_view_metadata_before ON COMMIT DROP AS
    SELECT c.oid,c.relowner,c.relacl,c.reloptions FROM pg_class c WHERE c.oid='thesaurus.source_rows'::regclass;
  SELECT COALESCE(jsonb_agg(to_jsonb(m) ORDER BY m.member,m.grantor),'[]') INTO memberships_before
    FROM pg_auth_members m WHERE m.roleid='bertel_thesaurus_publisher'::regrole;
  SELECT admin_option,inherit_option,set_option INTO prior_admin,prior_inherit,prior_set
    FROM pg_auth_members WHERE roleid='bertel_thesaurus_publisher'::regrole AND member=executor_oid AND grantor=executor_oid;
  had_executor_grant:=FOUND;
  EXECUTE format('GRANT bertel_thesaurus_publisher TO %I WITH ADMIN %s, INHERIT TRUE, SET FALSE GRANTED BY %I',
    executor_name,CASE WHEN prior_admin THEN 'TRUE' ELSE 'FALSE' END,executor_name);
  PERFORM thesaurus.assert_preparation_contract();
  CREATE TEMP TABLE thesaurus_native_adapter_contract_before ON COMMIT DROP AS
    SELECT thesaurus.preparation_contract_registry() contract;
  IF had_executor_grant THEN
    EXECUTE format('GRANT bertel_thesaurus_publisher TO %I WITH ADMIN %s, INHERIT %s, SET %s GRANTED BY %I',
      executor_name,CASE WHEN prior_admin THEN 'TRUE' ELSE 'FALSE' END,
      CASE WHEN prior_inherit THEN 'TRUE' ELSE 'FALSE' END,
      CASE WHEN prior_set THEN 'TRUE' ELSE 'FALSE' END,executor_name);
  ELSE
    EXECUTE format('REVOKE bertel_thesaurus_publisher FROM %I GRANTED BY %I',executor_name,executor_name);
  END IF;
  SELECT COALESCE(jsonb_agg(to_jsonb(m) ORDER BY m.member,m.grantor),'[]') INTO memberships_after
    FROM pg_auth_members m WHERE m.roleid='bertel_thesaurus_publisher'::regrole;
  IF memberships_after IS DISTINCT FROM memberships_before THEN RAISE EXCEPTION 'Publisher membership was not restored after source-contract preflight';END IF;
  IF (SELECT count(*) FROM thesaurus.vocabulary)<>78 THEN
    RAISE EXCEPTION 'Expected the exact 78-domain metadata predecessor';
  END IF;
  CREATE TEMP TABLE thesaurus_native_adapter_vocab_before ON COMMIT DROP AS
    SELECT domain,to_jsonb(v) row_image FROM thesaurus.vocabulary v;
  IF EXISTS(SELECT 1 FROM thesaurus.revision WHERE status<>'published') THEN
    RAISE EXCEPTION 'Resolve open editorial drafts before installing native adapters' USING ERRCODE='PT409';
  END IF;
END
$preflight$;

-- Typed source IDs remain independent across native tables and UUIDs.
ALTER TABLE thesaurus.source_link
  ADD COLUMN iti_assoc_role_id uuid,
  ADD COLUMN object_relation_type_id uuid,
  ADD COLUMN capacity_metric_id uuid,
  ADD COLUMN legal_type_id uuid,
  ADD COLUMN review_source_id uuid,
  ADD COLUMN sustainability_group_id uuid,
  ADD COLUMN actor_role_id uuid,
  ADD COLUMN contact_role_id uuid,
  ADD COLUMN org_role_id uuid;

DO $link_constraints$
DECLARE old_check record;old_def text;
BEGIN
  SELECT oid,pg_get_constraintdef(oid) definition INTO STRICT old_check
  FROM pg_constraint WHERE conrelid='thesaurus.source_link'::regclass AND contype='c'
    AND conname='source_link_check';
  old_def:=old_check.definition;
  IF old_def IS DISTINCT FROM 'CHECK ((num_nonnulls(ref_code_id, amenity_id, classification_scheme_id, classification_value_id, language_id, commune_code, sustainability_action_id, sustainability_category_id) = 1))'
    OR (SELECT count(*) FROM pg_constraint WHERE conrelid='thesaurus.source_link'::regclass AND contype='c'
      AND conname='source_link_check')<>1 THEN
    RAISE EXCEPTION 'Source-link one-of predecessor changed';
  END IF;
  EXECUTE format('ALTER TABLE thesaurus.source_link DROP CONSTRAINT %I',
    (SELECT conname FROM pg_constraint WHERE oid=old_check.oid));
  ALTER TABLE thesaurus.source_link
    ADD CONSTRAINT thesaurus_source_link_one_adapter CHECK(num_nonnulls(
      ref_code_id,amenity_id,classification_scheme_id,classification_value_id,language_id,
      commune_code,sustainability_action_id,sustainability_category_id,iti_assoc_role_id,
      object_relation_type_id,capacity_metric_id,legal_type_id,review_source_id,
      sustainability_group_id,actor_role_id,contact_role_id,org_role_id)=1),
    ADD CONSTRAINT thesaurus_source_link_iti_assoc_role_fk FOREIGN KEY(iti_assoc_role_id) REFERENCES public.ref_iti_assoc_role(id) ON DELETE RESTRICT,
    ADD CONSTRAINT thesaurus_source_link_object_relation_type_fk FOREIGN KEY(object_relation_type_id) REFERENCES public.ref_object_relation_type(id) ON DELETE RESTRICT,
    ADD CONSTRAINT thesaurus_source_link_capacity_metric_fk FOREIGN KEY(capacity_metric_id) REFERENCES public.ref_capacity_metric(id) ON DELETE RESTRICT,
    ADD CONSTRAINT thesaurus_source_link_legal_type_fk FOREIGN KEY(legal_type_id) REFERENCES public.ref_legal_type(id) ON DELETE RESTRICT,
    ADD CONSTRAINT thesaurus_source_link_review_source_fk FOREIGN KEY(review_source_id) REFERENCES public.ref_review_source(id) ON DELETE RESTRICT,
    ADD CONSTRAINT thesaurus_source_link_sustainability_group_fk FOREIGN KEY(sustainability_group_id) REFERENCES public.ref_sustainability_action_group(id) ON DELETE RESTRICT,
    ADD CONSTRAINT thesaurus_source_link_actor_role_fk FOREIGN KEY(actor_role_id) REFERENCES public.ref_actor_role(id) ON DELETE RESTRICT,
    ADD CONSTRAINT thesaurus_source_link_contact_role_fk FOREIGN KEY(contact_role_id) REFERENCES public.ref_contact_role(id) ON DELETE RESTRICT,
    ADD CONSTRAINT thesaurus_source_link_org_role_fk FOREIGN KEY(org_role_id) REFERENCES public.ref_org_role(id) ON DELETE RESTRICT;
  CREATE UNIQUE INDEX thesaurus_source_iti_assoc_role_idx ON thesaurus.source_link(iti_assoc_role_id) WHERE iti_assoc_role_id IS NOT NULL;
  CREATE UNIQUE INDEX thesaurus_source_object_relation_type_idx ON thesaurus.source_link(object_relation_type_id) WHERE object_relation_type_id IS NOT NULL;
  CREATE UNIQUE INDEX thesaurus_source_capacity_metric_idx ON thesaurus.source_link(capacity_metric_id) WHERE capacity_metric_id IS NOT NULL;
  CREATE UNIQUE INDEX thesaurus_source_legal_type_idx ON thesaurus.source_link(legal_type_id) WHERE legal_type_id IS NOT NULL;
  CREATE UNIQUE INDEX thesaurus_source_review_source_idx ON thesaurus.source_link(review_source_id) WHERE review_source_id IS NOT NULL;
  CREATE UNIQUE INDEX thesaurus_source_sustainability_group_idx ON thesaurus.source_link(sustainability_group_id) WHERE sustainability_group_id IS NOT NULL;
  CREATE UNIQUE INDEX thesaurus_source_actor_role_idx ON thesaurus.source_link(actor_role_id) WHERE actor_role_id IS NOT NULL;
  CREATE UNIQUE INDEX thesaurus_source_contact_role_idx ON thesaurus.source_link(contact_role_id) WHERE contact_role_id IS NOT NULL;
  CREATE UNIQUE INDEX thesaurus_source_org_role_idx ON thesaurus.source_link(org_role_id) WHERE org_role_id IS NOT NULL;
END
$link_constraints$;

INSERT INTO thesaurus.vocabulary(domain,name,source_kind,is_public,is_governed,legacy_public,
  require_definition,required_languages,name_i18n) VALUES
 ('iti_assoc_role','Rôles d’association d’itinéraire','iti_assoc_role',true,false,false,true,ARRAY['fr','en','es','de'],'{"fr":"Rôles d’association d’itinéraire","en":"Itinerary association roles","es":"Funciones de asociación a itinerarios","de":"Rollen der Zuordnung zu Routen"}'),
 ('object_relation_type','Types de relation entre fiches','object_relation_type',true,false,false,true,ARRAY['fr','en','es','de'],'{"fr":"Types de relation entre fiches","en":"Listing relationship types","es":"Tipos de relación entre fichas","de":"Beziehungstypen zwischen Einträgen"}'),
 ('capacity_metric','Indicateurs de capacité','capacity_metric',true,false,false,true,ARRAY['fr','en','es','de'],'{"fr":"Indicateurs de capacité","en":"Capacity indicators","es":"Indicadores de capacidad","de":"Kapazitätskennzahlen"}'),
 ('legal_type','Informations et justificatifs administratifs','legal_type',true,false,false,true,ARRAY['fr','en','es','de'],'{"fr":"Informations et justificatifs administratifs","en":"Administrative information and supporting documents","es":"Datos y justificantes administrativos","de":"Verwaltungsangaben und Nachweise"}'),
 ('review_source','Sources d’avis','review_source',true,false,false,true,ARRAY['fr','en','es','de'],'{"fr":"Sources d’avis","en":"Review sources","es":"Fuentes de opiniones","de":"Bewertungsquellen"}'),
 ('sustainability_group','Groupes d’actions de durabilité','sustainability_group',true,false,false,true,ARRAY['fr','en','es','de'],'{"fr":"Groupes d’actions de durabilité","en":"Sustainability action groups","es":"Grupos de acciones de sostenibilidad","de":"Gruppen von Nachhaltigkeitsmaßnahmen"}'),
 ('actor_role','Rôles des acteurs','actor_role',false,false,false,true,ARRAY['fr','en','es','de'],'{"fr":"Rôles des acteurs","en":"Actor relationship roles","es":"Funciones de relación de los actores","de":"Beziehungsrollen der Akteure"}'),
 ('contact_role','Rôles des contacts','contact_role',false,false,false,true,ARRAY['fr','en','es','de'],'{"fr":"Rôles des contacts","en":"Contact roles","es":"Funciones de contacto","de":"Kontaktrollen"}'),
 ('org_role','Rôles des organisations liées','org_role',false,false,false,true,ARRAY['fr','en','es','de'],'{"fr":"Rôles des organisations liées","en":"Linked organization roles","es":"Funciones de las organizaciones vinculadas","de":"Rollen verknüpfter Organisationen"}');

CREATE TEMP TABLE thesaurus_native_catalog_before ON COMMIT DROP AS
SELECT r.catalog_key,to_jsonb(r)-'label'-'updated_at' row_image FROM public.ref_catalog_registry r
WHERE r.catalog_key=ANY(ARRAY['ref_iti_assoc_role','ref_object_relation_type','ref_capacity_metric','ref_legal_type','ref_review_source','ref_sustainability_action_group','ref_actor_role','ref_contact_role','ref_org_role']);
UPDATE public.ref_catalog_registry r SET label=v.name
FROM (VALUES
  ('iti_assoc_role','ref_iti_assoc_role'),('object_relation_type','ref_object_relation_type'),
  ('capacity_metric','ref_capacity_metric'),('legal_type','ref_legal_type'),('review_source','ref_review_source'),
  ('sustainability_group','ref_sustainability_action_group'),('actor_role','ref_actor_role'),
  ('contact_role','ref_contact_role'),('org_role','ref_org_role')) mapping(domain,catalog_key)
JOIN thesaurus.vocabulary v ON v.domain=mapping.domain
WHERE r.catalog_key=mapping.catalog_key AND r.label IS DISTINCT FROM v.name;
DO $native_catalog_labels$
BEGIN
  IF (SELECT count(*) FROM thesaurus_native_catalog_before)<>9
    OR EXISTS(SELECT 1 FROM thesaurus_native_catalog_before prior_catalog
      JOIN public.ref_catalog_registry observed_registry USING(catalog_key)
      WHERE prior_catalog.row_image IS DISTINCT FROM to_jsonb(observed_registry)-'label'-'updated_at')
    OR EXISTS(SELECT 1 FROM (VALUES
      ('iti_assoc_role','ref_iti_assoc_role'),('object_relation_type','ref_object_relation_type'),
      ('capacity_metric','ref_capacity_metric'),('legal_type','ref_legal_type'),('review_source','ref_review_source'),
      ('sustainability_group','ref_sustainability_action_group'),('actor_role','ref_actor_role'),
      ('contact_role','ref_contact_role'),('org_role','ref_org_role')) mapping(domain,catalog_key)
      JOIN thesaurus.vocabulary v ON v.domain=mapping.domain
      LEFT JOIN public.ref_catalog_registry r ON r.catalog_key=mapping.catalog_key
      WHERE r.catalog_key IS NULL OR r.label IS DISTINCT FROM v.name) THEN
    RAISE EXCEPTION 'Reviewed native catalog labels missing or unrelated catalog metadata changed';
  END IF;
END
$native_catalog_labels$;

DO $preserved_vocabulary$
BEGIN
  IF EXISTS(SELECT 1 FROM thesaurus_native_adapter_vocab_before prior_vocab
    JOIN thesaurus.vocabulary current_vocab USING(domain) WHERE prior_vocab.row_image IS DISTINCT FROM to_jsonb(current_vocab))
    OR EXISTS(SELECT 1 FROM thesaurus_native_adapter_vocab_before prior_vocab
      WHERE NOT EXISTS(SELECT 1 FROM thesaurus.vocabulary current_vocab WHERE current_vocab.domain=prior_vocab.domain)) THEN
    RAISE EXCEPTION 'One of the pre-existing 78 vocabulary rows changed or disappeared';
  END IF;
END
$preserved_vocabulary$;

CREATE OR REPLACE VIEW thesaurus.source_rows AS
SELECT 'ref_code'::text source_kind,r.domain,r.id::text source_id,r.code::text code,''::text context_key,
       jsonb_build_object('id',r.id,'domain',r.domain) source_key,to_jsonb(r) payload,
       'ref_code'::text parent_kind,r.parent_id::text parent_source_id,r.domain parent_domain FROM public.ref_code r
UNION ALL SELECT 'amenity','amenity',r.id::text,r.code::text,'',jsonb_build_object('id',r.id),to_jsonb(r),'ref_code',r.family_id::text,'amenity_family' FROM public.ref_amenity r
UNION ALL SELECT 'classification_scheme','classification_scheme',r.id::text,r.code::text,'',jsonb_build_object('id',r.id),to_jsonb(r),NULL,NULL,NULL FROM public.ref_classification_scheme r
UNION ALL SELECT 'classification_value','classification_value',r.id::text,r.code::text,r.scheme_id::text,jsonb_build_object('id',r.id),to_jsonb(r),CASE WHEN r.parent_id IS NOT NULL THEN 'classification_value' ELSE 'classification_scheme' END,COALESCE(r.parent_id,r.scheme_id)::text,CASE WHEN r.parent_id IS NOT NULL THEN 'classification_value' ELSE 'classification_scheme' END FROM public.ref_classification_value r
UNION ALL SELECT 'language','language',r.id::text,r.code::text,'',jsonb_build_object('id',r.id),to_jsonb(r),NULL,NULL,NULL FROM public.ref_language r
UNION ALL SELECT 'commune','commune',r.insee_code::text,r.insee_code::text,'',jsonb_build_object('insee_code',r.insee_code),to_jsonb(r),NULL,NULL,NULL FROM public.ref_commune r
UNION ALL SELECT 'sustainability_category','sustainability_category',r.id::text,r.code::text,'',jsonb_build_object('id',r.id),to_jsonb(r),NULL,NULL,NULL FROM public.ref_sustainability_action_category r
UNION ALL SELECT 'sustainability_action','sustainability_action',r.id::text,r.code::text,r.category_id::text,jsonb_build_object('id',r.id),to_jsonb(r),'sustainability_category',r.category_id::text,'sustainability_category' FROM public.ref_sustainability_action r
UNION ALL SELECT 'iti_assoc_role','iti_assoc_role',r.id::text,r.code::text,'',jsonb_build_object('id',r.id),to_jsonb(r),NULL,NULL,NULL FROM public.ref_iti_assoc_role r
UNION ALL SELECT 'object_relation_type','object_relation_type',r.id::text,r.code::text,'',jsonb_build_object('id',r.id),to_jsonb(r),NULL,NULL,NULL FROM public.ref_object_relation_type r
UNION ALL SELECT 'capacity_metric','capacity_metric',r.id::text,r.code::text,'',jsonb_build_object('id',r.id),to_jsonb(r),NULL,NULL,NULL FROM public.ref_capacity_metric r
UNION ALL SELECT 'legal_type','legal_type',r.id::text,r.code::text,'',jsonb_build_object('id',r.id),to_jsonb(r),NULL,NULL,NULL FROM public.ref_legal_type r
UNION ALL SELECT 'review_source','review_source',r.id::text,r.code::text,'',jsonb_build_object('id',r.id),to_jsonb(r),NULL,NULL,NULL FROM public.ref_review_source r
UNION ALL SELECT 'sustainability_group','sustainability_group',r.id::text,r.code::text,r.category_id::text,jsonb_build_object('id',r.id),to_jsonb(r),'sustainability_category',r.category_id::text,'sustainability_category' FROM public.ref_sustainability_action_group r
UNION ALL SELECT 'actor_role','actor_role',r.id::text,r.code::text,'',jsonb_build_object('id',r.id),to_jsonb(r),NULL,NULL,NULL FROM public.ref_actor_role r
UNION ALL SELECT 'contact_role','contact_role',r.id::text,r.code::text,'',jsonb_build_object('id',r.id),to_jsonb(r),NULL,NULL,NULL FROM public.ref_contact_role r
UNION ALL SELECT 'org_role','org_role',r.id::text,r.code::text,'',jsonb_build_object('id',r.id),to_jsonb(r),NULL,NULL,NULL FROM public.ref_org_role r;

DO $source_identity$
DECLARE native_rows bigint;adapter_rows bigint;
BEGIN
  SELECT (SELECT count(*) FROM public.ref_iti_assoc_role)
    +(SELECT count(*) FROM public.ref_object_relation_type)
    +(SELECT count(*) FROM public.ref_capacity_metric)
    +(SELECT count(*) FROM public.ref_legal_type)
    +(SELECT count(*) FROM public.ref_review_source)
    +(SELECT count(*) FROM public.ref_sustainability_action_group)
    +(SELECT count(*) FROM public.ref_actor_role)
    +(SELECT count(*) FROM public.ref_contact_role)
    +(SELECT count(*) FROM public.ref_org_role) INTO native_rows;
  SELECT count(*) INTO adapter_rows FROM thesaurus.source_rows
    WHERE domain=ANY(ARRAY['iti_assoc_role','object_relation_type','capacity_metric','legal_type','review_source','sustainability_group','actor_role','contact_role','org_role']);
  IF adapter_rows<>native_rows
    OR (SELECT count(DISTINCT (source_kind,source_id,domain)) FROM thesaurus.source_rows WHERE domain=ANY(ARRAY['iti_assoc_role','object_relation_type','capacity_metric','legal_type','review_source','sustainability_group','actor_role','contact_role','org_role']))<>native_rows
    OR EXISTS(SELECT 1 FROM thesaurus.source_rows s WHERE s.domain=ANY(ARRAY['iti_assoc_role','object_relation_type','capacity_metric','legal_type','review_source','sustainability_group','actor_role','contact_role','org_role']) AND (s.source_key<>jsonb_build_object('id',s.source_id::uuid) OR s.payload->>'id' IS NULL)) THEN
    RAISE EXCEPTION 'Native source projection does not cover the exact current nine-table identity set';
  END IF;
END
$source_identity$;

-- Stable source-key synchronization; no native writes and no governance changes.
CREATE OR REPLACE FUNCTION thesaurus.sync_sources(p_domains text[] DEFAULT NULL) RETURNS integer LANGUAGE plpgsql
SET search_path=pg_catalog,thesaurus,public AS $$
#variable_conflict use_column
DECLARE n integer;
BEGIN
  INSERT INTO thesaurus.concept(domain,code,context_key,source_kind,source_id,lifecycle,assignable,legacy_search_terms)
  SELECT s.domain,s.code,s.context_key,s.source_kind,s.source_id,
    CASE WHEN COALESCE((s.payload->>'is_active')::boolean,true) THEN 'active' ELSE 'deprecated' END,
    COALESCE((s.payload->>'is_assignable')::boolean,true),
    CASE WHEN jsonb_typeof(s.payload#>'{metadata,aliases}')='array' THEN ARRAY(SELECT jsonb_array_elements_text(s.payload#>'{metadata,aliases}')) ELSE '{}'::text[] END
  FROM thesaurus.source_rows s JOIN thesaurus.vocabulary v ON v.domain=s.domain
  WHERE p_domains IS NULL OR s.domain=ANY(p_domains) ON CONFLICT(source_kind,source_id,domain) DO NOTHING;
  GET DIAGNOSTICS n=ROW_COUNT;
  INSERT INTO thesaurus.source_link(concept_id,ref_code_id,ref_code_domain,amenity_id,classification_scheme_id,classification_value_id,language_id,commune_code,sustainability_action_id,sustainability_category_id,iti_assoc_role_id,object_relation_type_id,capacity_metric_id,legal_type_id,review_source_id,sustainability_group_id,actor_role_id,contact_role_id,org_role_id)
  SELECT c.concept_id,
    CASE WHEN c.source_kind='ref_code' THEN c.source_id::uuid END,CASE WHEN c.source_kind='ref_code' THEN c.domain END,
    CASE WHEN c.source_kind='amenity' THEN c.source_id::uuid END,
    CASE WHEN c.source_kind='classification_scheme' THEN c.source_id::uuid END,
    CASE WHEN c.source_kind='classification_value' THEN c.source_id::uuid END,
    CASE WHEN c.source_kind='language' THEN c.source_id::uuid END,
    CASE WHEN c.source_kind='commune' THEN c.source_id END,
    CASE WHEN c.source_kind='sustainability_action' THEN c.source_id::uuid END,
    CASE WHEN c.source_kind='sustainability_category' THEN c.source_id::uuid END,
    CASE WHEN c.source_kind='iti_assoc_role' THEN c.source_id::uuid END,
    CASE WHEN c.source_kind='object_relation_type' THEN c.source_id::uuid END,
    CASE WHEN c.source_kind='capacity_metric' THEN c.source_id::uuid END,
    CASE WHEN c.source_kind='legal_type' THEN c.source_id::uuid END,
    CASE WHEN c.source_kind='review_source' THEN c.source_id::uuid END,
    CASE WHEN c.source_kind='sustainability_group' THEN c.source_id::uuid END,
    CASE WHEN c.source_kind='actor_role' THEN c.source_id::uuid END,
    CASE WHEN c.source_kind='contact_role' THEN c.source_id::uuid END,
    CASE WHEN c.source_kind='org_role' THEN c.source_id::uuid END
  FROM thesaurus.concept c JOIN thesaurus.source_rows s USING(source_kind,source_id,domain)
  WHERE p_domains IS NULL OR c.domain=ANY(p_domains) ON CONFLICT DO NOTHING;
  RETURN n;
END $$;

-- Native source guards are additive. Existing per-source policies and grants are untouched.
DO $source_guards$
DECLARE s record;
BEGIN
  FOR s IN SELECT * FROM (VALUES
    ('ref_iti_assoc_role','iti_assoc_role'),('ref_object_relation_type','object_relation_type'),
    ('ref_capacity_metric','capacity_metric'),('ref_legal_type','legal_type'),
    ('ref_review_source','review_source'),('ref_sustainability_action_group','sustainability_group'),
    ('ref_actor_role','actor_role'),('ref_contact_role','contact_role'),('ref_org_role','org_role'))x(tbl,domain)
  LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=s.tbl AND c.relrowsecurity) THEN
      RAISE EXCEPTION 'RLS must already be enabled on %',s.tbl;
    END IF;
    EXECUTE format('CREATE TRIGGER zz_thesaurus_source_guard BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION thesaurus.guard_source(%L)',s.tbl,s.domain);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO bertel_thesaurus_publisher',s.tbl);
    EXECUTE format('CREATE POLICY thesaurus_publisher ON public.%I FOR ALL TO bertel_thesaurus_publisher USING(true) WITH CHECK(true)',s.tbl);
  END LOOP;
END
$source_guards$;

-- Keep the original recursive source list and add only the nine reviewed tables.
CREATE OR REPLACE FUNCTION thesaurus.preparation_sources()RETURNS TABLE(table_oid oid)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
 WITH RECURSIVE sources(id)AS(
   SELECT unnest(ARRAY[
     'public.ref_code'::regclass,'public.ref_amenity'::regclass,'public.ref_classification_scheme'::regclass,
     'public.ref_classification_value'::regclass,'public.ref_language'::regclass,'public.ref_commune'::regclass,
     'public.ref_sustainability_action'::regclass,'public.ref_sustainability_action_category'::regclass,
     'public.ref_iti_assoc_role'::regclass,'public.ref_object_relation_type'::regclass,'public.ref_capacity_metric'::regclass,
     'public.ref_legal_type'::regclass,'public.ref_review_source'::regclass,'public.ref_sustainability_action_group'::regclass,
     'public.ref_actor_role'::regclass,'public.ref_contact_role'::regclass,'public.ref_org_role'::regclass,
     'public.ref_code_taxonomy_closure'::regclass,'public.ref_code_domain_registry'::regclass,'public.ref_catalog_registry'::regclass,
     'thesaurus.instance'::regclass,'thesaurus.vocabulary'::regclass,'thesaurus.concept'::regclass,
     'thesaurus.source_link'::regclass,'thesaurus.localized_field'::regclass,'thesaurus.label'::regclass,
     'thesaurus.note'::regclass,'thesaurus.mapping'::regclass,'thesaurus.relation'::regclass])::oid
   UNION SELECT i.inhrelid FROM pg_inherits i JOIN sources s ON s.id=i.inhparent)
 SELECT DISTINCT id FROM sources
$$;

DO $native_source_gates$
DECLARE t record;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'public.ref_iti_assoc_role'::regclass,'public.ref_object_relation_type'::regclass,
    'public.ref_capacity_metric'::regclass,'public.ref_legal_type'::regclass,
    'public.ref_review_source'::regclass,'public.ref_sustainability_action_group'::regclass,
    'public.ref_actor_role'::regclass,'public.ref_contact_role'::regclass,'public.ref_org_role'::regclass]) oid
  LOOP
    IF EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=t.oid AND tgname IN('thesaurus_source_gate','thesaurus_prepared_truncate') AND NOT tgisinternal) THEN
      RAISE EXCEPTION 'Prepared source gates already exist on %',t.oid::regclass;
    END IF;
    EXECUTE format('CREATE TRIGGER thesaurus_source_gate BEFORE INSERT OR UPDATE OR DELETE ON %s FOR EACH STATEMENT EXECUTE FUNCTION thesaurus.source_write_gate()',t.oid::regclass);
    EXECUTE format('CREATE TRIGGER thesaurus_prepared_truncate BEFORE TRUNCATE ON %s FOR EACH STATEMENT EXECUTE FUNCTION thesaurus.guard_prepared_truncate()',t.oid::regclass);
  END LOOP;
END
$native_source_gates$;

-- Literal adapters only. Preserve existing typed comparison and search-term roundtrip.
DO $native_writer$
DECLARE definition text;body text;old text;new text;
BEGIN
  SELECT pg_get_functiondef(oid),prosrc INTO STRICT definition,body FROM pg_proc WHERE oid='thesaurus.apply_source(uuid,jsonb)'::regprocedure;
  old:=$old$tbl:=CASE c.source_kind WHEN 'ref_code' THEN 'ref_code' WHEN 'amenity' THEN 'ref_amenity' WHEN 'classification_scheme' THEN 'ref_classification_scheme' WHEN 'classification_value' THEN 'ref_classification_value' WHEN 'language' THEN 'ref_language' WHEN 'commune' THEN 'ref_commune' WHEN 'sustainability_action' THEN 'ref_sustainability_action' WHEN 'sustainability_category' THEN 'ref_sustainability_action_category' END;$old$;
  new:=$new$tbl:=CASE c.source_kind WHEN 'ref_code' THEN 'ref_code' WHEN 'amenity' THEN 'ref_amenity' WHEN 'classification_scheme' THEN 'ref_classification_scheme' WHEN 'classification_value' THEN 'ref_classification_value' WHEN 'language' THEN 'ref_language' WHEN 'commune' THEN 'ref_commune' WHEN 'sustainability_action' THEN 'ref_sustainability_action' WHEN 'sustainability_category' THEN 'ref_sustainability_action_category' WHEN 'iti_assoc_role' THEN 'ref_iti_assoc_role' WHEN 'object_relation_type' THEN 'ref_object_relation_type' WHEN 'capacity_metric' THEN 'ref_capacity_metric' WHEN 'legal_type' THEN 'ref_legal_type' WHEN 'review_source' THEN 'ref_review_source' WHEN 'sustainability_group' THEN 'ref_sustainability_action_group' WHEN 'actor_role' THEN 'ref_actor_role' WHEN 'contact_role' THEN 'ref_contact_role' WHEN 'org_role' THEN 'ref_org_role' END;$new$;
  IF strpos(body,new)>0 THEN
    IF length(body)-length(replace(body,new,''))<>length(new) THEN RAISE EXCEPTION 'Native writer adapter patch drift';END IF;
  ELSE
    IF length(body)-length(replace(body,old,''))<>length(old) THEN RAISE EXCEPTION 'Native writer predecessor changed';END IF;
    body:=replace(body,old,new);
    old:=$old$WHEN 'sustainability_category' THEN ARRAY['name','description','name_i18n','description_i18n','position','icon_url','extra'] END;$old$;
    new:=$new$WHEN 'sustainability_category' THEN ARRAY['name','description','name_i18n','description_i18n','position','icon_url','extra']
    WHEN 'iti_assoc_role' THEN ARRAY['name','description','position']
    WHEN 'object_relation_type' THEN ARRAY['name','description','position']
    WHEN 'capacity_metric' THEN ARRAY['name','description','position','icon_url']
    WHEN 'legal_type' THEN ARRAY['name','description']
    WHEN 'review_source' THEN ARRAY['name','icon_url']
    WHEN 'sustainability_group' THEN ARRAY['name','description','name_i18n','description_i18n','position','icon_url','category_id']
    WHEN 'actor_role' THEN ARRAY['name','description','position']
    WHEN 'contact_role' THEN ARRAY['name','description','position']
    WHEN 'org_role' THEN ARRAY['name','description','position'] END;$new$;
    IF length(body)-length(replace(body,old,''))<>length(old) THEN RAISE EXCEPTION 'Native writer allowlist predecessor changed';END IF;
    body:=replace(body,old,new);
    EXECUTE replace(definition,(SELECT prosrc FROM pg_proc WHERE oid='thesaurus.apply_source(uuid,jsonb)'::regprocedure),body);
  END IF;
END
$native_writer$;

-- New groups have immutable category context. Native action membership remains immutable.
CREATE OR REPLACE FUNCTION thesaurus.native_source_fields_valid(p_concept uuid,p_fields jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog,thesaurus AS $$
DECLARE c thesaurus.concept%ROWTYPE;s record;allowed text[];item record;
BEGIN
  SELECT * INTO c FROM thesaurus.concept WHERE concept_id=p_concept;
  SELECT * INTO s FROM thesaurus.source_rows WHERE(source_kind,source_id,domain)=(c.source_kind,c.source_id,c.domain);
  allowed:=CASE c.source_kind
    WHEN 'iti_assoc_role' THEN ARRAY['name','description','position']
    WHEN 'object_relation_type' THEN ARRAY['name','description','position']
    WHEN 'capacity_metric' THEN ARRAY['name','description','position','icon_url']
    WHEN 'legal_type' THEN ARRAY['name','description']
    WHEN 'review_source' THEN ARRAY['name','icon_url']
    WHEN 'sustainability_group' THEN ARRAY['name','description','name_i18n','description_i18n','position','icon_url','category_id']
    WHEN 'actor_role' THEN ARRAY['name','description','position']
    WHEN 'contact_role' THEN ARRAY['name','description','position']
    WHEN 'org_role' THEN ARRAY['name','description','position']
    ELSE ARRAY[]::text[] END;
  IF c.source_kind='sustainability_action' THEN
    IF COALESCE(p_fields,'{}')?'group_id' AND s.payload->'group_id' IS DISTINCT FROM p_fields->'group_id' THEN RETURN false;END IF;
    RETURN true;
  END IF;
  IF c.source_kind NOT IN('iti_assoc_role','object_relation_type','capacity_metric','legal_type','review_source','sustainability_group','actor_role','contact_role','org_role') THEN RETURN true;END IF;
  FOR item IN SELECT key,value FROM jsonb_each(COALESCE(p_fields,'{}')) LOOP
    IF item.key=ANY(allowed) THEN CONTINUE;END IF;
    IF s.payload IS NULL OR item.value IS DISTINCT FROM s.payload->item.key THEN RETURN false;END IF;
  END LOOP;
  IF c.source_kind='capacity_metric' AND COALESCE(p_fields,'{}')?'unit'
    AND s.payload->'unit' IS DISTINCT FROM p_fields->'unit' THEN RETURN false;END IF;
  IF c.source_kind='legal_type' AND EXISTS(SELECT 1 FROM unnest(ARRAY['category','is_required','is_public','review_interval_days']) k WHERE COALESCE(p_fields,'{}')?k AND s.payload->k IS DISTINCT FROM p_fields->k) THEN RETURN false;END IF;
  IF c.source_kind='review_source' AND COALESCE(p_fields,'{}')?'base_url' AND s.payload->'base_url' IS DISTINCT FROM p_fields->'base_url' THEN RETURN false;END IF;
  IF c.source_kind='sustainability_group' AND COALESCE(p_fields,'{}')?'extra' AND s.payload->'extra' IS DISTINCT FROM p_fields->'extra' THEN RETURN false;END IF;
  IF c.source_kind='sustainability_group' AND s.payload IS NOT NULL AND COALESCE(p_fields,'{}')?'category_id'
    AND p_fields->>'category_id' IS DISTINCT FROM c.context_key THEN RETURN false;END IF;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION thesaurus.native_source_fields_valid(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION thesaurus.native_source_fields_valid(uuid,jsonb) TO bertel_thesaurus_publisher;

-- Add the group category arm and explicit operational-field refusals to validation.
DO $native_validation$
DECLARE definition text;body text;old text;new text;
BEGIN
  SELECT pg_get_functiondef(oid),prosrc INTO STRICT definition,body FROM pg_proc WHERE oid='thesaurus.validate_document(uuid,jsonb)'::regprocedure;
  old:=$old$IF EXISTS(SELECT 1 FROM thesaurus.concept me WHERE me.concept_id=p_concept AND((me.source_kind='classification_value'AND p_doc#>>'{source_fields,scheme_id}'IS NOT NULL AND p_doc#>>'{source_fields,scheme_id}'<>me.context_key)OR(me.source_kind='sustainability_action'AND p_doc#>>'{source_fields,category_id}'IS NOT NULL AND p_doc#>>'{source_fields,category_id}'<>me.context_key)))THEN errors:=errors||jsonb_build_array('Le contexte du code est immuable : créer un nouveau concept pour changer de schéma ou catégorie.');END IF;$old$;
  new:=old||$new$
  IF NOT thesaurus.native_source_fields_valid(p_concept,COALESCE(p_doc->'source_fields','{}')) THEN errors:=errors||jsonb_build_array('Un champ source opérationnel ou structurel ne peut pas être modifié par cet adaptateur.');END IF;
  IF EXISTS(SELECT 1 FROM thesaurus.concept me WHERE me.concept_id=p_concept AND me.source_kind='sustainability_group' AND p_doc#>>'{source_fields,category_id}' IS NOT NULL AND p_doc#>>'{source_fields,category_id}'<>me.context_key) THEN errors:=errors||jsonb_build_array('La catégorie native du groupe est immuable.');END IF;$new$;
  IF strpos(body,new)>0 THEN RETURN;END IF;
  IF length(body)-length(replace(body,old,''))<>length(old) THEN RAISE EXCEPTION 'Native validation predecessor changed';END IF;
  body:=replace(body,old,new);
  old:=$old$OR(me.source_kind='sustainability_action' AND pc.source_kind='sustainability_category' AND pc.source_id=me.context_key)$old$;
  new:=old||$new$ OR (me.source_kind='sustainability_group' AND pc.source_kind='sustainability_category' AND pc.source_id=me.context_key)$new$;
  IF length(body)-length(replace(body,old,''))<>length(old) THEN RAISE EXCEPTION 'Native parent contract predecessor changed';END IF;
  body:=replace(body,old,new);
  EXECUTE replace(definition,(SELECT prosrc FROM pg_proc WHERE oid='thesaurus.validate_document(uuid,jsonb)'::regprocedure),body);
END
$native_validation$;

DO $native_admin_creation$
DECLARE definition text;body text;old text;new text;
BEGIN
  SELECT pg_get_functiondef(oid),prosrc INTO STRICT definition,body FROM pg_proc WHERE oid='thesaurus.admin_dispatch(text,jsonb)'::regprocedure;
  old:=$old$CASE v.source_kind WHEN'classification_value'THEN COALESCE(doc#>>'{source_fields,scheme_id}','')WHEN'sustainability_action'THEN COALESCE(doc#>>'{source_fields,category_id}','')ELSE''END,v.source_kind$old$;
  new:=$new$CASE v.source_kind WHEN'classification_value'THEN COALESCE(doc#>>'{source_fields,scheme_id}','')WHEN'sustainability_action'THEN COALESCE(doc#>>'{source_fields,category_id}','')WHEN'sustainability_group'THEN COALESCE(doc#>>'{source_fields,category_id}','')ELSE''END,v.source_kind$new$;
  IF strpos(body,new)=0 THEN
    IF length(body)-length(replace(body,old,''))<>length(old) THEN RAISE EXCEPTION 'Native concept context creation predecessor changed';END IF;
    body:=replace(body,old,new);
  END IF;
  old:=$old$      IF NOT FOUND OR NOT (v.is_public OR v.is_governed) THEN RAISE EXCEPTION 'Unknown vocabulary or private vocabulary not yet governed' USING ERRCODE='PT400';END IF;$old$;
  new:=$new$      IF NOT FOUND OR NOT (v.is_public OR v.is_governed OR v.domain IN('actor_role','contact_role','org_role')) THEN RAISE EXCEPTION 'Unknown vocabulary or private vocabulary not yet governed' USING ERRCODE='PT400';END IF;$new$;
  IF strpos(body,new)=0 THEN
    IF length(body)-length(replace(body,old,''))<>length(old) THEN RAISE EXCEPTION 'Private authoring guard predecessor changed';END IF;
    body:=replace(body,old,new);
  END IF;
  EXECUTE replace(definition,(SELECT prosrc FROM pg_proc WHERE oid='thesaurus.admin_dispatch(text,jsonb)'::regprocedure),body);
END
$native_admin_creation$;

-- One typed edge source for editorial rendering and incremental dirty closure.
CREATE OR REPLACE FUNCTION thesaurus.native_membership_edges()
RETURNS TABLE(group_concept_id uuid,action_concept_id uuid)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,thesaurus,public AS $$
  SELECT group_concept.concept_id,action_concept.concept_id
  FROM public.ref_sustainability_action action
  JOIN public.ref_sustainability_action_group native_group ON native_group.id=action.group_id
  JOIN thesaurus.concept group_concept ON group_concept.source_kind='sustainability_group'
    AND group_concept.source_id=native_group.id::text AND group_concept.domain='sustainability_group'
  JOIN thesaurus.concept action_concept ON action_concept.source_kind='sustainability_action'
    AND action_concept.source_id=action.id::text AND action_concept.domain='sustainability_action'
  WHERE action.group_id IS NOT NULL
$$;
REVOKE ALL ON FUNCTION thesaurus.native_membership_edges() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION thesaurus.native_membership_edges() TO bertel_thesaurus_publisher;

CREATE OR REPLACE FUNCTION thesaurus.native_membership_fields(p_concept uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,thesaurus AS $$
WITH current AS(SELECT c.source_kind FROM thesaurus.concept c WHERE c.concept_id=p_concept),
eligible AS MATERIALIZED(SELECT e.group_concept_id,e.action_concept_id FROM thesaurus.native_membership_edges()e
  JOIN thesaurus.concept gc ON gc.concept_id=e.group_concept_id JOIN thesaurus.vocabulary gv ON gv.domain=gc.domain AND gv.is_public AND gv.is_governed
  JOIN thesaurus.concept ac ON ac.concept_id=e.action_concept_id JOIN thesaurus.vocabulary av ON av.domain=ac.domain AND av.is_public AND av.is_governed)
SELECT CASE current.source_kind
  WHEN 'sustainability_action' THEN COALESCE((SELECT jsonb_build_object('member_of',jsonb_build_array(group_concept_id)) FROM eligible WHERE action_concept_id=p_concept),'{}'::jsonb)
  WHEN 'sustainability_group' THEN jsonb_build_object('members',COALESCE((SELECT jsonb_agg(action_concept_id ORDER BY action_concept_id) FROM eligible WHERE group_concept_id=p_concept),'[]'::jsonb))
  ELSE '{}'::jsonb END FROM current
$$;
REVOKE ALL ON FUNCTION thesaurus.native_membership_fields(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION thesaurus.native_membership_fields(uuid) TO bertel_thesaurus_publisher;

DO $native_renderers$
DECLARE definition text;body text;old text;new text;
BEGIN
  SELECT pg_get_functiondef(oid),prosrc INTO STRICT definition,body FROM pg_proc WHERE oid='thesaurus.concept_document(uuid,boolean)'::regprocedure;
  old:=$old$'relations',COALESCE((SELECT jsonb_agg(jsonb_build_object('type',x.type,'target_id',x.target_id)ORDER BY x.type,x.target_id)FROM(SELECT type,target_id FROM thesaurus.relation WHERE concept_id=p_id UNION SELECT type,concept_id FROM thesaurus.relation WHERE target_id=p_id AND type IN('related','exact_equivalent'))x),'[]'));$old$;
  new:=$new$'relations',COALESCE((SELECT jsonb_agg(jsonb_build_object('type',x.type,'target_id',x.target_id)ORDER BY x.type,x.target_id)FROM(SELECT type,target_id FROM thesaurus.relation WHERE concept_id=p_id UNION SELECT type,concept_id FROM thesaurus.relation WHERE target_id=p_id AND type IN('related','exact_equivalent'))x),'[]'))||thesaurus.native_membership_fields(p_id);$new$;
  IF strpos(body,new)=0 THEN
    IF length(body)-length(replace(body,old,''))<>length(old) THEN RAISE EXCEPTION 'Editorial membership renderer predecessor changed';END IF;
    body:=replace(body,old,new);
    EXECUTE replace(definition,(SELECT prosrc FROM pg_proc WHERE oid='thesaurus.concept_document(uuid,boolean)'::regprocedure),body);
  END IF;
  SELECT pg_get_functiondef(oid),prosrc INTO STRICT definition,body FROM pg_proc WHERE oid='thesaurus.publication_documents(uuid[])'::regprocedure;
  old:=$old$'replaced_by',COALESCE(relations.replaced_by,'[]'),'relations',COALESCE(relations.items,'[]'))$old$;
  new:=$new$'replaced_by',COALESCE(relations.replaced_by,'[]'),'relations',COALESCE(relations.items,'[]'))||thesaurus.native_membership_fields(d.concept_id)$new$;
  IF strpos(body,new)=0 THEN
    IF length(body)-length(replace(body,old,''))<>length(old) THEN RAISE EXCEPTION 'Set publication membership renderer predecessor changed';END IF;
    body:=replace(body,old,new);
    EXECUTE replace(definition,(SELECT prosrc FROM pg_proc WHERE oid='thesaurus.publication_documents(uuid[])'::regprocedure),body);
  END IF;
END
$native_renderers$;

-- Validate the category required by a new sustainability group.
DO $native_group_context$
DECLARE definition text;body text;old text;new text;
BEGIN
  SELECT pg_get_functiondef(oid),prosrc INTO STRICT definition,body FROM pg_proc WHERE oid='thesaurus.validate_document(uuid,jsonb)'::regprocedure;
  old:=$old$  IF p_doc->>'parent_concept_id' IS NOT NULL THEN$old$;
  new:=$new$  IF EXISTS(SELECT 1 FROM thesaurus.concept c WHERE c.concept_id=p_concept AND c.source_kind='sustainability_group'
    AND (NULLIF(p_doc#>>'{source_fields,category_id}','') IS NULL OR p_doc->>'parent_concept_id' IS NULL)) THEN
    errors:=errors||jsonb_build_array('Un groupe exige sa catégorie native et la révision de son concept parent.');
  END IF;
  IF p_doc->>'parent_concept_id' IS NOT NULL THEN$new$;
  IF strpos(body,new)=0 THEN
    IF length(body)-length(replace(body,old,''))<>length(old) THEN RAISE EXCEPTION 'Group context validation predecessor changed';END IF;
    body:=replace(body,old,new);
    EXECUTE replace(definition,(SELECT prosrc FROM pg_proc WHERE oid='thesaurus.validate_document(uuid,jsonb)'::regprocedure),body);
  END IF;
END
$native_group_context$;

-- Extend typed source consumers by native FK target, never by caller-selected names.
DO $native_consumers$
DECLARE definition text;body text;old text;new text;
BEGIN
  SELECT pg_get_functiondef(oid),prosrc INTO STRICT definition,body FROM pg_proc WHERE oid='thesaurus.usage_objects(uuid[])'::regprocedure;
  old:=$old$WHEN 'ref_sustainability_action_category' THEN 'sustainability_category' ELSE 'ref_code' END kind$old$;
  new:=$new$WHEN 'ref_sustainability_action_category' THEN 'sustainability_category'
       WHEN 'ref_iti_assoc_role' THEN 'iti_assoc_role' WHEN 'ref_object_relation_type' THEN 'object_relation_type'
       WHEN 'ref_capacity_metric' THEN 'capacity_metric' WHEN 'ref_legal_type' THEN 'legal_type'
       WHEN 'ref_review_source' THEN 'review_source' WHEN 'ref_sustainability_action_group' THEN 'sustainability_group'
       WHEN 'ref_actor_role' THEN 'actor_role' WHEN 'ref_contact_role' THEN 'contact_role' WHEN 'ref_org_role' THEN 'org_role' ELSE 'ref_code' END kind$new$;
  IF strpos(body,new)=0 THEN
    IF length(body)-length(replace(body,old,''))<>length(old) THEN RAISE EXCEPTION 'usage_objects source-kind predecessor changed';END IF;
    body:=replace(body,old,new);
  END IF;
  old:=$old$'ref_sustainability_action','ref_sustainability_action_category')$old$;
  new:=$new$'ref_sustainability_action','ref_sustainability_action_category','ref_iti_assoc_role','ref_object_relation_type','ref_capacity_metric','ref_legal_type','ref_review_source','ref_sustainability_action_group','ref_actor_role','ref_contact_role','ref_org_role')$new$;
  IF strpos(body,new)=0 THEN
    IF length(body)-length(replace(body,old,''))<>length(old) THEN RAISE EXCEPTION 'usage_objects native-target allowlist predecessor changed';END IF;
    body:=replace(body,old,new);
  END IF;
  old:=$old$  RETURN QUERY SELECT DISTINCT oc.object_id::text FROM public.object_classification oc CROSS JOIN LATERAL unnest(oc.subvalue_ids)sub_id JOIN thesaurus.concept c ON c.source_kind='classification_value'AND c.source_id=sub_id::text WHERE c.concept_id=ANY(p_concepts);$old$;
  new:=$new$  IF EXISTS(SELECT 1 FROM thesaurus.native_membership_edges() edge WHERE edge.group_concept_id=ANY(p_concepts)) THEN
    RETURN QUERY SELECT DISTINCT owners.object_id FROM thesaurus.usage_objects(ARRAY(SELECT edge.action_concept_id FROM thesaurus.native_membership_edges() edge WHERE edge.group_concept_id=ANY(p_concepts))) owners;
  END IF;
  RETURN QUERY SELECT DISTINCT oc.object_id::text FROM public.object_classification oc CROSS JOIN LATERAL unnest(oc.subvalue_ids)sub_id JOIN thesaurus.concept c ON c.source_kind='classification_value'AND c.source_id=sub_id::text WHERE c.concept_id=ANY(p_concepts);$new$;
  IF strpos(body,new)=0 THEN
    IF length(body)-length(replace(body,old,''))<>length(old) THEN RAISE EXCEPTION 'usage_objects group dependency predecessor changed';END IF;
    body:=replace(body,old,new);
  END IF;
  EXECUTE replace(definition,(SELECT prosrc FROM pg_proc WHERE oid='thesaurus.usage_objects(uuid[])'::regprocedure),body);

  SELECT pg_get_functiondef(oid),prosrc INTO STRICT definition,body FROM pg_proc WHERE oid='thesaurus.row_has_historical_reference(oid,jsonb,oid[],integer)'::regprocedure;
  old:=$old$'ref_sustainability_action_category')OR EXISTS($old$;
  new:=$new$'ref_sustainability_action_category','ref_iti_assoc_role','ref_object_relation_type','ref_capacity_metric','ref_legal_type','ref_review_source','ref_sustainability_action_group','ref_actor_role','ref_contact_role','ref_org_role')OR EXISTS($new$;
  IF strpos(body,new)=0 THEN
    IF length(body)-length(replace(body,old,''))<>length(old) THEN RAISE EXCEPTION 'historical source target allowlist predecessor changed';END IF;
    body:=replace(body,old,new);
  END IF;
  old:=$old$WHEN'ref_sustainability_action_category'THEN'sustainability_category'ELSE'ref_code'END;$old$;
  new:=$new$WHEN'ref_sustainability_action_category'THEN'sustainability_category'WHEN'ref_iti_assoc_role'THEN'iti_assoc_role'WHEN'ref_object_relation_type'THEN'object_relation_type'WHEN'ref_capacity_metric'THEN'capacity_metric'WHEN'ref_legal_type'THEN'legal_type'WHEN'ref_review_source'THEN'review_source'WHEN'ref_sustainability_action_group'THEN'sustainability_group'WHEN'ref_actor_role'THEN'actor_role'WHEN'ref_contact_role'THEN'contact_role'WHEN'ref_org_role'THEN'org_role'ELSE'ref_code'END;$new$;
  IF strpos(body,new)=0 THEN
    IF length(body)-length(replace(body,old,''))<>length(old) THEN RAISE EXCEPTION 'historical source-kind predecessor changed';END IF;
    body:=replace(body,old,new);
  END IF;
  old:=$old$  FOR f IN SELECT con.conrelid,con.conkey,con.confkey FROM pg_constraint con JOIN pg_class child_tbl ON child_tbl.oid=con.conrelid JOIN pg_namespace ns ON ns.oid=child_tbl.relnamespace WHERE con.contype='f'AND con.confrelid=p_table$old$;
  new:=$new$  IF p_table='public.ref_sustainability_action_group'::regclass THEN
    FOR child IN SELECT to_jsonb(a) FROM public.ref_sustainability_action a WHERE a.group_id=(p_row->>'id')::uuid LOOP
      IF thesaurus.row_has_historical_reference('public.ref_sustainability_action'::regclass,child,p_visited||p_table,p_depth+1) THEN RETURN true;END IF;
    END LOOP;
  END IF;
  FOR f IN SELECT con.conrelid,con.conkey,con.confkey FROM pg_constraint con JOIN pg_class child_tbl ON child_tbl.oid=con.conrelid JOIN pg_namespace ns ON ns.oid=child_tbl.relnamespace WHERE con.contype='f'AND con.confrelid=p_table$new$;
  IF strpos(body,new)=0 THEN
    IF length(body)-length(replace(body,old,''))<>length(old) THEN RAISE EXCEPTION 'Historical group dependency predecessor changed';END IF;
    body:=replace(body,old,new);
  END IF;
  EXECUTE replace(definition,(SELECT prosrc FROM pg_proc WHERE oid='thesaurus.row_has_historical_reference(oid,jsonb,oid[],integer)'::regprocedure),body);
END
$native_consumers$;

-- Regenerate each affected assignment trigger from the complete actual FK set.
DO $native_assignment_triggers$
DECLARE t record;spec jsonb;
BEGIN
  FOR t IN SELECT DISTINCT con.conrelid,n.nspname,c.relname FROM pg_constraint con
    JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_class target ON target.oid=con.confrelid
    WHERE con.contype='f' AND n.nspname='public' AND (
      target.relname IN('ref_code','ref_amenity','ref_classification_scheme','ref_classification_value','ref_language','ref_commune','ref_sustainability_action','ref_sustainability_action_category','ref_iti_assoc_role','ref_object_relation_type','ref_capacity_metric','ref_legal_type','ref_review_source','ref_sustainability_action_group','ref_actor_role','ref_contact_role','ref_org_role')
      OR EXISTS(SELECT 1 FROM pg_inherits i WHERE i.inhrelid=target.oid AND i.inhparent='public.ref_code'::regclass))
  LOOP
    SELECT jsonb_agg(DISTINCT jsonb_build_object('kind',CASE target.relname
      WHEN 'ref_amenity' THEN 'amenity' WHEN 'ref_classification_scheme' THEN 'classification_scheme'
      WHEN 'ref_classification_value' THEN 'classification_value' WHEN 'ref_language' THEN 'language'
      WHEN 'ref_commune' THEN 'commune' WHEN 'ref_sustainability_action' THEN 'sustainability_action'
      WHEN 'ref_sustainability_action_category' THEN 'sustainability_category'
      WHEN 'ref_iti_assoc_role' THEN 'iti_assoc_role' WHEN 'ref_object_relation_type' THEN 'object_relation_type'
      WHEN 'ref_capacity_metric' THEN 'capacity_metric' WHEN 'ref_legal_type' THEN 'legal_type'
      WHEN 'ref_review_source' THEN 'review_source' WHEN 'ref_sustainability_action_group' THEN 'sustainability_group'
      WHEN 'ref_actor_role' THEN 'actor_role' WHEN 'ref_contact_role' THEN 'contact_role' WHEN 'ref_org_role' THEN 'org_role'
      ELSE 'ref_code' END,
      'domain',CASE WHEN target.relispartition THEN substring(pg_get_expr(target.relpartbound,target.oid) FROM '''([^'']+)''') END,
      'keys',(SELECT jsonb_agg(jsonb_build_object('local',la.attname,'target',ra.attname) ORDER BY u.ord)
        FROM unnest(con.conkey,con.confkey) WITH ORDINALITY u(l,r,ord)
        JOIN pg_attribute la ON la.attrelid=con.conrelid AND la.attnum=u.l
        JOIN pg_attribute ra ON ra.attrelid=con.confrelid AND ra.attnum=u.r))) INTO spec
    FROM pg_constraint con JOIN pg_class target ON target.oid=con.confrelid
    WHERE con.conrelid=t.conrelid AND con.contype='f' AND (
      target.relname IN('ref_code','ref_amenity','ref_classification_scheme','ref_classification_value','ref_language','ref_commune','ref_sustainability_action','ref_sustainability_action_category','ref_iti_assoc_role','ref_object_relation_type','ref_capacity_metric','ref_legal_type','ref_review_source','ref_sustainability_action_group','ref_actor_role','ref_contact_role','ref_org_role')
      OR EXISTS(SELECT 1 FROM pg_inherits i WHERE i.inhrelid=target.oid AND i.inhparent='public.ref_code'::regclass));
    EXECUTE format('DROP TRIGGER IF EXISTS thesaurus_assignment_guard ON %I.%I',t.nspname,t.relname);
    EXECUTE format('CREATE TRIGGER thesaurus_assignment_guard BEFORE INSERT OR UPDATE OR DELETE ON %I.%I FOR EACH ROW EXECUTE FUNCTION thesaurus.guard_assignment(%L)',t.nspname,t.relname,spec::text);
  END LOOP;
END
$native_assignment_triggers$;

-- Narrowly extend the source key/hash registry and keep every older entry intact.
DO $native_preparation_contract$
DECLARE contract jsonb;name text;keys text[];expected text[]:=ARRAY['code','id'];
BEGIN
  SELECT before_install.contract INTO STRICT contract FROM thesaurus_native_adapter_contract_before before_install;
  IF thesaurus.preparation_contract_registry() IS DISTINCT FROM contract THEN
    RAISE EXCEPTION 'Preparation contract changed after adapter preflight; refusing to bless drift';
  END IF;
  FOR name IN SELECT unnest(ARRAY['public.ref_iti_assoc_role','public.ref_object_relation_type','public.ref_capacity_metric','public.ref_legal_type','public.ref_review_source','public.ref_sustainability_action_group','public.ref_actor_role','public.ref_contact_role','public.ref_org_role']) LOOP
    keys:=thesaurus.preparation_plain_key_columns(name::regclass);
    IF keys IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Unexpected plain immediate unique-key contract for %: %',name,keys;END IF;
    contract:=jsonb_set(contract,ARRAY['keys',name],to_jsonb(keys),true);
  END LOOP;
  contract:=jsonb_set(contract,ARRAY['functions','thesaurus.apply_source(uuid,jsonb)'],to_jsonb(md5(pg_get_functiondef('thesaurus.apply_source(uuid,jsonb)'::regprocedure))),true);
  contract:=jsonb_set(contract,ARRAY['functions','thesaurus.native_membership_edges()'],to_jsonb(md5(pg_get_functiondef('thesaurus.native_membership_edges()'::regprocedure))),true);
  contract:=jsonb_set(contract,ARRAY['functions','thesaurus.native_membership_fields(uuid)'],to_jsonb(md5(pg_get_functiondef('thesaurus.native_membership_fields(uuid)'::regprocedure))),true);
  EXECUTE format('CREATE OR REPLACE FUNCTION thesaurus.preparation_contract_registry()RETURNS jsonb LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog AS %L',
    'SELECT '||quote_literal(contract::text)||'::jsonb');
END
$native_preparation_contract$;

-- The existing RLS-policy helper verification also covers all new source tables.
DO $native_policy_helpers$
DECLARE missing text;
BEGIN
  WITH RECURSIVE rels(oid) AS(
    SELECT unnest(ARRAY['public.ref_iti_assoc_role'::regclass,'public.ref_object_relation_type'::regclass,
      'public.ref_capacity_metric'::regclass,'public.ref_legal_type'::regclass,'public.ref_review_source'::regclass,
      'public.ref_sustainability_action_group'::regclass,'public.ref_actor_role'::regclass,
      'public.ref_contact_role'::regclass,'public.ref_org_role'::regclass])::oid
    UNION SELECT i.inhrelid FROM pg_inherits i JOIN rels r ON r.oid=i.inhparent)
  SELECT string_agg(DISTINCT d.refobjid::regprocedure::text,', ' ORDER BY d.refobjid::regprocedure::text) INTO missing
  FROM pg_policy p JOIN pg_depend d ON d.classid='pg_policy'::regclass AND d.objid=p.oid AND d.refclassid='pg_proc'::regclass
  WHERE (0=ANY(p.polroles) OR 'bertel_thesaurus_publisher'::regrole::oid=ANY(p.polroles))
    AND p.polrelid IN(SELECT oid FROM rels)
    AND NOT has_function_privilege('bertel_thesaurus_publisher',d.refobjid,'EXECUTE');
  IF missing IS NOT NULL THEN RAISE EXCEPTION 'Publisher lacks EXECUTE on a native dictionary RLS helper: %',missing;END IF;
END
$native_policy_helpers$;

-- Add group endpoints to the exact same-snapshot dirty set, then require every
-- emitted membership target to be present and public in the new release.
DO $native_activation$
DECLARE definition text;body text;old_dirty text;new_dirty text;old_targets text;new_targets text;
  original text;prior_owner oid;prior_acl aclitem[];prior_config text[];executor_name text;executor_oid oid;
  had_executor_grant boolean;prior_admin boolean;prior_inherit boolean;prior_set boolean;
  memberships_before jsonb;memberships_after jsonb;changed boolean:=false;
BEGIN
  SELECT pg_get_functiondef(oid),prosrc INTO STRICT definition,body FROM pg_proc WHERE oid='thesaurus.activate(uuid[],text[],text,bigint,jsonb)'::regprocedure;
  original:=body;
  SELECT proowner,proacl,proconfig INTO STRICT prior_owner,prior_acl,prior_config
    FROM pg_proc WHERE oid='thesaurus.activate(uuid[],text[],text,bigint,jsonb)'::regprocedure;
  body:=replace(body,E'\r','');
  old_dirty:=$old$document_dirty:=document_dirty||scope_dirty;$old$;
  new_dirty:=$new$document_dirty:=document_dirty||scope_dirty;
  document_dirty:=document_dirty||ARRAY(
    SELECT DISTINCT endpoint FROM (
      SELECT edge.group_concept_id endpoint FROM thesaurus.native_membership_edges() edge
        WHERE edge.group_concept_id=ANY(scope_dirty) OR edge.action_concept_id=ANY(scope_dirty)
      UNION SELECT edge.action_concept_id FROM thesaurus.native_membership_edges() edge
        WHERE edge.group_concept_id=ANY(scope_dirty) OR edge.action_concept_id=ANY(scope_dirty)
    ) endpoints);
  $new$;
  old_targets:=$old$COALESCE(rc.document->'broader','[]')||COALESCE(rc.document->'narrower','[]')||COALESCE(rc.document->'related','[]')||COALESCE(rc.document->'replaced_by','[]')||COALESCE((SELECT jsonb_agg(x->>'target_id')FROM jsonb_array_elements(COALESCE(rc.document->'relations','[]'))x),'[]')$old$;
  new_targets:=$new$COALESCE(rc.document->'broader','[]')||COALESCE(rc.document->'narrower','[]')||COALESCE(rc.document->'related','[]')||COALESCE(rc.document->'replaced_by','[]')||COALESCE(rc.document->'member_of','[]')||COALESCE(rc.document->'members','[]')||COALESCE((SELECT jsonb_agg(x->>'target_id')FROM jsonb_array_elements(COALESCE(rc.document->'relations','[]'))x),'[]')$new$;
  IF strpos(body,new_dirty)>0 OR strpos(body,new_targets)>0 THEN
    IF length(body)-length(replace(body,new_dirty,''))<>length(new_dirty)
      OR length(body)-length(replace(body,new_targets,''))<>length(new_targets)
      OR md5(replace(replace(body,new_dirty,old_dirty),new_targets,old_targets))<>'5f62e21e531d4de49c8931f0456f5051' THEN
      RAISE EXCEPTION 'Incremental membership patch drift or partial replay';
    END IF;
  ELSE
    IF md5(body)<>'5f62e21e531d4de49c8931f0456f5051'
      OR length(body)-length(replace(body,old_dirty,''))<>length(old_dirty)
      OR length(body)-length(replace(body,old_targets,''))<>length(old_targets) THEN
      RAISE EXCEPTION 'Reviewed post-metadata activation predecessor changed';
    END IF;
    body:=replace(replace(body,old_dirty,new_dirty),old_targets,new_targets);
    changed:=true;
  END IF;
  IF changed THEN
    -- Hosted PostgreSQL runs migrations as a non-superuser. Temporarily inherit
    -- only the existing publisher capability and restore every grantor row.
    executor_name:=current_user;executor_oid:=executor_name::regrole::oid;
    SELECT COALESCE(jsonb_agg(to_jsonb(m) ORDER BY m.member,m.grantor),'[]') INTO memberships_before
      FROM pg_auth_members m WHERE m.roleid='bertel_thesaurus_publisher'::regrole;
    SELECT admin_option,inherit_option,set_option INTO prior_admin,prior_inherit,prior_set
      FROM pg_auth_members WHERE roleid='bertel_thesaurus_publisher'::regrole AND member=executor_oid AND grantor=executor_oid;
    had_executor_grant:=FOUND;
    EXECUTE format('GRANT bertel_thesaurus_publisher TO %I WITH ADMIN %s, INHERIT TRUE, SET FALSE GRANTED BY %I',
      executor_name,CASE WHEN prior_admin THEN 'TRUE' ELSE 'FALSE' END,executor_name);
    EXECUTE replace(definition,original,body);
    IF had_executor_grant THEN
      EXECUTE format('GRANT bertel_thesaurus_publisher TO %I WITH ADMIN %s, INHERIT %s, SET %s GRANTED BY %I',
        executor_name,CASE WHEN prior_admin THEN 'TRUE' ELSE 'FALSE' END,
        CASE WHEN prior_inherit THEN 'TRUE' ELSE 'FALSE' END,
        CASE WHEN prior_set THEN 'TRUE' ELSE 'FALSE' END,executor_name);
    ELSE
      EXECUTE format('REVOKE bertel_thesaurus_publisher FROM %I GRANTED BY %I',executor_name,executor_name);
    END IF;
    SELECT COALESCE(jsonb_agg(to_jsonb(m) ORDER BY m.member,m.grantor),'[]') INTO memberships_after
      FROM pg_auth_members m WHERE m.roleid='bertel_thesaurus_publisher'::regrole;
    IF memberships_after IS DISTINCT FROM memberships_before THEN
      RAISE EXCEPTION 'Publisher role memberships were not restored exactly after activation patch';
    END IF;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_proc WHERE oid='thesaurus.activate(uuid[],text[],text,bigint,jsonb)'::regprocedure
    AND (proowner IS DISTINCT FROM prior_owner OR proacl IS DISTINCT FROM prior_acl OR proconfig IS DISTINCT FROM prior_config OR NOT prosecdef)) THEN
    RAISE EXCEPTION 'Activation identity, owner, ACL, security mode or execution settings changed';
  END IF;
END
$native_activation$;

DO $native_adapter_metadata$
BEGIN
  IF EXISTS(SELECT 1 FROM thesaurus_native_adapter_function_metadata_before prior
    LEFT JOIN pg_proc current ON current.oid=prior.signature::regprocedure
    WHERE current.oid IS NULL OR (to_jsonb(current)-'prosrc') IS DISTINCT FROM prior.metadata)
    OR EXISTS(SELECT 1 FROM thesaurus_native_adapter_view_metadata_before prior
      LEFT JOIN pg_class current ON current.oid='thesaurus.source_rows'::regclass
      WHERE current.oid IS NULL OR current.oid IS DISTINCT FROM prior.oid
        OR current.relowner IS DISTINCT FROM prior.relowner OR current.relacl IS DISTINCT FROM prior.relacl
        OR current.reloptions IS DISTINCT FROM prior.reloptions)
    OR (SELECT md5(replace(prosrc,chr(13),'')) FROM pg_proc WHERE oid='thesaurus.guard_source()'::regprocedure)<>'019744a91ecedeadc998b911cf9ab778'
    OR (SELECT md5(replace(prosrc,chr(13),'')) FROM pg_proc WHERE oid='thesaurus.guard_assignment()'::regprocedure)<>'9e7bc848a0b4f5168380108bc511ee30' THEN
    RAISE EXCEPTION 'Existing function or source_rows view identity/metadata changed during adapter install';
  END IF;
END
$native_adapter_metadata$;

DO $native_contract_final$
DECLARE executor_name text;executor_oid oid;had_executor_grant boolean;prior_admin boolean;prior_inherit boolean;prior_set boolean;
  memberships_before jsonb;memberships_after jsonb;
BEGIN
  executor_name:=current_user;executor_oid:=executor_name::regrole::oid;
  SELECT COALESCE(jsonb_agg(to_jsonb(m) ORDER BY m.member,m.grantor),'[]') INTO memberships_before
    FROM pg_auth_members m WHERE m.roleid='bertel_thesaurus_publisher'::regrole;
  SELECT admin_option,inherit_option,set_option INTO prior_admin,prior_inherit,prior_set
    FROM pg_auth_members WHERE roleid='bertel_thesaurus_publisher'::regrole AND member=executor_oid AND grantor=executor_oid;
  had_executor_grant:=FOUND;
  EXECUTE format('GRANT bertel_thesaurus_publisher TO %I WITH ADMIN %s, INHERIT TRUE, SET FALSE GRANTED BY %I',
    executor_name,CASE WHEN prior_admin THEN 'TRUE' ELSE 'FALSE' END,executor_name);
  PERFORM thesaurus.assert_preparation_contract();
  IF had_executor_grant THEN
    EXECUTE format('GRANT bertel_thesaurus_publisher TO %I WITH ADMIN %s, INHERIT %s, SET %s GRANTED BY %I',
      executor_name,CASE WHEN prior_admin THEN 'TRUE' ELSE 'FALSE' END,
      CASE WHEN prior_inherit THEN 'TRUE' ELSE 'FALSE' END,
      CASE WHEN prior_set THEN 'TRUE' ELSE 'FALSE' END,executor_name);
  ELSE
    EXECUTE format('REVOKE bertel_thesaurus_publisher FROM %I GRANTED BY %I',executor_name,executor_name);
  END IF;
  SELECT COALESCE(jsonb_agg(to_jsonb(m) ORDER BY m.member,m.grantor),'[]') INTO memberships_after
    FROM pg_auth_members m WHERE m.roleid='bertel_thesaurus_publisher'::regrole;
  IF memberships_after IS DISTINCT FROM memberships_before THEN
    RAISE EXCEPTION 'Publisher memberships were not restored after final preparation-contract assertion';
  END IF;
END
$native_contract_final$;

COMMIT;
