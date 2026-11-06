-- Bertel thesaurus: isolated editorial workspace, typed source identity and immutable releases.
-- Application roles never receive the publisher role or direct workspace writes.
BEGIN;
CREATE SCHEMA IF NOT EXISTS thesaurus;
REVOKE ALL ON SCHEMA thesaurus FROM PUBLIC;
DO $roles$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='bertel_thesaurus_publisher') THEN
    CREATE ROLE bertel_thesaurus_publisher NOLOGIN NOINHERIT;
  END IF;
END $roles$;
GRANT USAGE ON SCHEMA thesaurus,public,api,extensions,auth,internal,audit TO bertel_thesaurus_publisher;

CREATE TABLE IF NOT EXISTS thesaurus.instance (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  base_uri text NOT NULL DEFAULT '', license text, attribution text,
  current_release_id bigint, updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO thesaurus.instance(singleton) VALUES(true) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS thesaurus.vocabulary (
  domain text PRIMARY KEY, name text NOT NULL, source_kind text NOT NULL,
  legacy_public boolean NOT NULL DEFAULT false, is_public boolean NOT NULL DEFAULT false,
  is_governed boolean NOT NULL DEFAULT false, require_definition boolean NOT NULL DEFAULT false,
  required_languages text[] NOT NULL DEFAULT ARRAY['fr']::text[],
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- Capture the pre-existing allowlist once, before replacing its function below.
INSERT INTO thesaurus.vocabulary(domain,name,source_kind,legacy_public,is_public)
SELECT d,COALESCE(r.name,d),CASE WHEN d IN ('amenity','classification_scheme','classification_value','language','commune','sustainability_action','sustainability_category') THEN d ELSE 'ref_code' END,true,true
FROM unnest(api.public_catalog_domains()) d LEFT JOIN public.ref_code_domain_registry r ON r.domain=d
ON CONFLICT DO NOTHING;
INSERT INTO thesaurus.vocabulary(domain,name,source_kind)
SELECT DISTINCT r.domain,r.domain,'ref_code' FROM public.ref_code r ON CONFLICT DO NOTHING;
INSERT INTO thesaurus.vocabulary(domain,name,source_kind) VALUES('classification_value','Valeurs de classification','classification_value') ON CONFLICT DO NOTHING;
-- Explicit rich-API policy for this descriptive adapter; legacy /catalog stays unchanged.
UPDATE thesaurus.vocabulary SET is_public=true WHERE domain='classification_value'AND source_kind='classification_value'AND NOT is_governed;

CREATE TABLE IF NOT EXISTS thesaurus.concept (
  concept_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), domain text NOT NULL REFERENCES thesaurus.vocabulary(domain),
  code text NOT NULL, context_key text NOT NULL DEFAULT '', source_kind text NOT NULL,
  source_id text NOT NULL, lifecycle text NOT NULL DEFAULT 'active' CHECK(lifecycle IN ('active','deprecated','retired')),
  assignable boolean NOT NULL DEFAULT true, legacy_search_terms text[] NOT NULL DEFAULT '{}',
  first_release_id bigint, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(domain,code,context_key), UNIQUE(source_kind,source_id,domain)
);
CREATE INDEX IF NOT EXISTS thesaurus_concept_domain_idx ON thesaurus.concept(domain,concept_id);
CREATE TABLE IF NOT EXISTS thesaurus.source_link (
  concept_id uuid PRIMARY KEY REFERENCES thesaurus.concept(concept_id) ON DELETE RESTRICT,
  ref_code_id uuid,ref_code_domain text,amenity_id uuid REFERENCES public.ref_amenity(id) ON DELETE RESTRICT,
  classification_scheme_id uuid REFERENCES public.ref_classification_scheme(id) ON DELETE RESTRICT,
  classification_value_id uuid REFERENCES public.ref_classification_value(id) ON DELETE RESTRICT,
  language_id uuid REFERENCES public.ref_language(id) ON DELETE RESTRICT,
  commune_code varchar(5) REFERENCES public.ref_commune(insee_code) ON DELETE RESTRICT,
  sustainability_action_id uuid REFERENCES public.ref_sustainability_action(id) ON DELETE RESTRICT,
  sustainability_category_id uuid REFERENCES public.ref_sustainability_action_category(id) ON DELETE RESTRICT,
  FOREIGN KEY(ref_code_id,ref_code_domain) REFERENCES public.ref_code(id,domain) ON DELETE RESTRICT,
  CHECK(num_nonnulls(ref_code_id,amenity_id,classification_scheme_id,classification_value_id,language_id,commune_code,sustainability_action_id,sustainability_category_id)=1),
  CHECK((ref_code_id IS NULL)=(ref_code_domain IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS thesaurus_source_ref_code_idx ON thesaurus.source_link(ref_code_id,ref_code_domain) WHERE ref_code_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS thesaurus_source_amenity_idx ON thesaurus.source_link(amenity_id) WHERE amenity_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS thesaurus_source_classification_scheme_idx ON thesaurus.source_link(classification_scheme_id) WHERE classification_scheme_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS thesaurus_source_classification_value_idx ON thesaurus.source_link(classification_value_id) WHERE classification_value_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS thesaurus_source_language_idx ON thesaurus.source_link(language_id) WHERE language_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS thesaurus_source_commune_idx ON thesaurus.source_link(commune_code) WHERE commune_code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS thesaurus_source_action_idx ON thesaurus.source_link(sustainability_action_id) WHERE sustainability_action_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS thesaurus_source_category_idx ON thesaurus.source_link(sustainability_category_id) WHERE sustainability_category_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS thesaurus.label (
  concept_id uuid NOT NULL REFERENCES thesaurus.concept ON DELETE RESTRICT,
  lang text NOT NULL CHECK(lang ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$'),
  kind text NOT NULL CHECK(kind IN ('alt','hidden')),value text NOT NULL CHECK(btrim(value)<>''),
  PRIMARY KEY(concept_id,lang,kind,value)
);
-- Only fields unsupported by a native source column live here; native values stay authoritative.
CREATE TABLE IF NOT EXISTS thesaurus.localized_field (
  concept_id uuid NOT NULL REFERENCES thesaurus.concept,lang text NOT NULL CHECK(lang ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$'),
  field text NOT NULL CHECK(field IN('name','description')),value text NOT NULL,
  PRIMARY KEY(concept_id,lang,field)
);
CREATE TABLE IF NOT EXISTS thesaurus.note (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, concept_id uuid NOT NULL REFERENCES thesaurus.concept,
  lang text NOT NULL DEFAULT 'fr',type text NOT NULL CHECK(type IN ('scope','definition','history','source')),
  value text NOT NULL CHECK(btrim(value)<>''),source text
);
CREATE INDEX IF NOT EXISTS thesaurus_note_concept_idx ON thesaurus.note(concept_id);
CREATE TABLE IF NOT EXISTS thesaurus.relation (
  concept_id uuid NOT NULL REFERENCES thesaurus.concept,
  type text NOT NULL CHECK(type IN ('related','exact_equivalent','replaced_by')),
  target_id uuid NOT NULL REFERENCES thesaurus.concept,
  PRIMARY KEY(concept_id,type,target_id),CHECK(concept_id<>target_id)
);
CREATE INDEX IF NOT EXISTS thesaurus_relation_target_idx ON thesaurus.relation(target_id,type,concept_id);
CREATE TABLE IF NOT EXISTS thesaurus.mapping (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, concept_id uuid NOT NULL REFERENCES thesaurus.concept,
  type text NOT NULL CHECK(type IN ('exactMatch','closeMatch','broadMatch','narrowMatch','relatedMatch')),
  target_uri text NOT NULL CHECK(target_uri ~ '^(https?://|urn:)'), vocabulary text NOT NULL,
  version text,source text NOT NULL,validated_by uuid,validated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(concept_id,type,target_uri)
);
CREATE INDEX IF NOT EXISTS thesaurus_mapping_concept_idx ON thesaurus.mapping(concept_id);
CREATE TABLE IF NOT EXISTS thesaurus.revision (
  revision_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),concept_id uuid NOT NULL REFERENCES thesaurus.concept,
  version integer NOT NULL DEFAULT 1 CHECK(version>0),status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','validated','published')),
  document jsonb NOT NULL,base_document jsonb NOT NULL DEFAULT '{}',base_fingerprint text NOT NULL,base_release_id bigint,
  errors jsonb NOT NULL DEFAULT '[]',warnings jsonb NOT NULL DEFAULT '[]',
  created_by uuid,validated_by uuid,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),published_release_id bigint
);
ALTER TABLE thesaurus.revision ADD COLUMN IF NOT EXISTS base_document jsonb NOT NULL DEFAULT '{}';
CREATE UNIQUE INDEX IF NOT EXISTS thesaurus_revision_pending_idx ON thesaurus.revision(concept_id) WHERE status<>'published';
CREATE TABLE IF NOT EXISTS thesaurus.release (
  release_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,previous_release_id bigint REFERENCES thesaurus.release,
  as_of timestamptz NOT NULL DEFAULT now(),created_by uuid,idempotency_key text NOT NULL UNIQUE,
  manifest jsonb NOT NULL DEFAULT '{}',checksum text NOT NULL DEFAULT '',affected_objects integer NOT NULL DEFAULT 0,request_fingerprint text NOT NULL DEFAULT ''
);
ALTER TABLE thesaurus.release ADD COLUMN IF NOT EXISTS request_fingerprint text NOT NULL DEFAULT '';
CREATE TABLE IF NOT EXISTS thesaurus.release_concept (
  release_id bigint NOT NULL REFERENCES thesaurus.release,concept_id uuid NOT NULL REFERENCES thesaurus.concept,
  domain text NOT NULL,is_public boolean NOT NULL,document jsonb NOT NULL,checksum text NOT NULL,
  PRIMARY KEY(release_id,concept_id)
);
CREATE INDEX IF NOT EXISTS thesaurus_release_domain_idx ON thesaurus.release_concept(release_id,domain,concept_id) WHERE is_public;
CREATE TABLE IF NOT EXISTS thesaurus.release_change (
  release_id bigint NOT NULL REFERENCES thesaurus.release,concept_id uuid NOT NULL REFERENCES thesaurus.concept,
  change_type text NOT NULL CHECK(change_type IN ('added','modified','deprecated','retired')),
  before_document jsonb,after_document jsonb NOT NULL,PRIMARY KEY(release_id,concept_id)
);
CREATE TABLE IF NOT EXISTS thesaurus.outbox (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,release_id bigint NOT NULL REFERENCES thesaurus.release,
  type text NOT NULL DEFAULT 'invalidate_reference_generation',status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','completed','failed')),
  attempts integer NOT NULL DEFAULT 0,last_error text,created_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz,
  UNIQUE(release_id,type)
);
CREATE TABLE IF NOT EXISTS thesaurus.assignment_retention (
  transaction_id bigint NOT NULL,table_oid oid NOT NULL,object_id text NOT NULL,concept_id uuid NOT NULL REFERENCES thesaurus.concept,
  PRIMARY KEY(transaction_id,table_oid,object_id,concept_id)
);
CREATE TABLE IF NOT EXISTS thesaurus.ownership_retention (
  transaction_id bigint NOT NULL,table_oid oid NOT NULL,row_key jsonb NOT NULL,object_ids text[] NOT NULL,
  PRIMARY KEY(transaction_id,table_oid,row_key)
);

CREATE OR REPLACE VIEW thesaurus.source_rows AS
SELECT 'ref_code'::text source_kind,r.domain,r.id::text source_id,r.code::text code,''::text context_key,
       jsonb_build_object('id',r.id,'domain',r.domain) source_key,to_jsonb(r) payload,
       'ref_code'::text parent_kind,r.parent_id::text parent_source_id,r.domain parent_domain
FROM public.ref_code r
UNION ALL SELECT 'amenity','amenity',r.id::text,r.code::text,'',jsonb_build_object('id',r.id),to_jsonb(r),'ref_code',r.family_id::text,'amenity_family' FROM public.ref_amenity r
UNION ALL SELECT 'classification_scheme','classification_scheme',r.id::text,r.code::text,'',jsonb_build_object('id',r.id),to_jsonb(r),NULL,NULL,NULL FROM public.ref_classification_scheme r
UNION ALL SELECT 'classification_value','classification_value',r.id::text,r.code::text,r.scheme_id::text,jsonb_build_object('id',r.id),to_jsonb(r),CASE WHEN r.parent_id IS NOT NULL THEN 'classification_value' ELSE 'classification_scheme' END,COALESCE(r.parent_id,r.scheme_id)::text,CASE WHEN r.parent_id IS NOT NULL THEN 'classification_value' ELSE 'classification_scheme' END FROM public.ref_classification_value r
UNION ALL SELECT 'language','language',r.id::text,r.code::text,'',jsonb_build_object('id',r.id),to_jsonb(r),NULL,NULL,NULL FROM public.ref_language r
UNION ALL SELECT 'commune','commune',r.insee_code::text,r.insee_code::text,'',jsonb_build_object('insee_code',r.insee_code),to_jsonb(r),NULL,NULL,NULL FROM public.ref_commune r
UNION ALL SELECT 'sustainability_category','sustainability_category',r.id::text,r.code::text,'',jsonb_build_object('id',r.id),to_jsonb(r),NULL,NULL,NULL FROM public.ref_sustainability_action_category r
UNION ALL SELECT 'sustainability_action','sustainability_action',r.id::text,r.code::text,r.category_id::text,jsonb_build_object('id',r.id),to_jsonb(r),'sustainability_category',r.category_id::text,'sustainability_category' FROM public.ref_sustainability_action r;

CREATE OR REPLACE FUNCTION thesaurus.is_governed(p_domain text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,thesaurus AS $$ SELECT COALESCE((SELECT is_governed FROM vocabulary WHERE domain=p_domain),false) $$;
REVOKE ALL ON FUNCTION thesaurus.is_governed(text) FROM PUBLIC;
GRANT USAGE ON SCHEMA thesaurus TO anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION thesaurus.is_governed(text) TO anon,authenticated,service_role,bertel_thesaurus_publisher;

CREATE OR REPLACE FUNCTION thesaurus.guard_source() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,thesaurus AS $$
#variable_conflict use_column
DECLARE d text; oldj jsonb;newj jsonb;
BEGIN
  oldj:=CASE WHEN TG_OP<>'INSERT' THEN to_jsonb(OLD) END;newj:=CASE WHEN TG_OP<>'DELETE' THEN to_jsonb(NEW) END;
  d:=CASE WHEN TG_ARGV[0]='ref_code' THEN COALESCE(newj->>'domain',oldj->>'domain') ELSE TG_ARGV[0] END;
  IF current_user<>'bertel_thesaurus_publisher' AND (thesaurus.is_governed(d) OR (TG_ARGV[0]='ref_code' AND thesaurus.is_governed(oldj->>'domain'))) AND
     (TG_OP<>'UPDATE' OR (oldj-'updated_at'-'created_at') IS DISTINCT FROM (newj-'updated_at'-'created_at')) THEN
    RAISE EXCEPTION 'Governed vocabulary: submit a thesaurus revision' USING ERRCODE='42501';
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;

DO $guards$ DECLARE s record; BEGIN
  FOR s IN SELECT * FROM (VALUES('ref_code','ref_code'),('ref_amenity','amenity'),('ref_classification_scheme','classification_scheme'),('ref_classification_value','classification_value'),('ref_language','language'),('ref_commune','commune'),('ref_sustainability_action_category','sustainability_category'),('ref_sustainability_action','sustainability_action'))x(tbl,domain) LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS zz_thesaurus_source_guard ON public.%I',s.tbl);
    EXECUTE format('CREATE TRIGGER zz_thesaurus_source_guard BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION thesaurus.guard_source(%L)',s.tbl,s.domain);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO bertel_thesaurus_publisher',s.tbl);
    EXECUTE format('DROP POLICY IF EXISTS thesaurus_publisher ON public.%I',s.tbl);
    EXECUTE format('CREATE POLICY thesaurus_publisher ON public.%I FOR ALL TO bertel_thesaurus_publisher USING(true) WITH CHECK(true)',s.tbl);
  END LOOP;
END $guards$;

-- The existing AFTER trigger maintains derived object caches. Run that tightly scoped
-- trigger as its existing owner, rather than granting the publisher arbitrary object writes.
ALTER FUNCTION api.trg_refresh_ref_code_taxonomy_closure()SECURITY DEFINER;
ALTER FUNCTION api.trg_refresh_ref_code_taxonomy_closure()SET search_path=pg_catalog,public,api;
REVOKE ALL ON FUNCTION api.trg_refresh_ref_code_taxonomy_closure()FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION api.trg_refresh_ref_code_taxonomy_closure()TO postgres,bertel_thesaurus_publisher;

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
  WHERE p_domains IS NULL OR s.domain=ANY(p_domains)
  ON CONFLICT(source_kind,source_id,domain) DO NOTHING;
  GET DIAGNOSTICS n=ROW_COUNT;
  INSERT INTO thesaurus.source_link(concept_id,ref_code_id,ref_code_domain,amenity_id,classification_scheme_id,classification_value_id,language_id,commune_code,sustainability_action_id,sustainability_category_id)
  SELECT c.concept_id,
    CASE WHEN c.source_kind='ref_code' THEN c.source_id::uuid END,CASE WHEN c.source_kind='ref_code' THEN c.domain END,
    CASE WHEN c.source_kind='amenity' THEN c.source_id::uuid END,
    CASE WHEN c.source_kind='classification_scheme' THEN c.source_id::uuid END,
    CASE WHEN c.source_kind='classification_value' THEN c.source_id::uuid END,
    CASE WHEN c.source_kind='language' THEN c.source_id::uuid END,
    CASE WHEN c.source_kind='commune' THEN c.source_id END,
    CASE WHEN c.source_kind='sustainability_action' THEN c.source_id::uuid END,
    CASE WHEN c.source_kind='sustainability_category' THEN c.source_id::uuid END
  FROM thesaurus.concept c JOIN thesaurus.source_rows s ON(s.source_kind,s.source_id,s.domain)=(c.source_kind,c.source_id,c.domain)
  WHERE p_domains IS NULL OR c.domain=ANY(p_domains) ON CONFLICT DO NOTHING;
  RETURN n;
END $$;

CREATE OR REPLACE FUNCTION thesaurus.source_fingerprint(p_concept uuid) RETURNS text LANGUAGE sql STABLE
SET search_path=pg_catalog,thesaurus AS $$
SELECT md5(jsonb_build_object('source',(SELECT s.payload-'updated_at'-'created_at'FROM thesaurus.source_rows s WHERE(s.source_kind,s.source_id,s.domain)=(c.source_kind,c.source_id,c.domain)),
  'lifecycle',c.lifecycle,'assignable',c.assignable,'legacy_search_terms',c.legacy_search_terms,
  'labels',(SELECT jsonb_agg(jsonb_build_array(lang,kind,value)ORDER BY lang,kind,value)FROM thesaurus.label WHERE concept_id=p_concept),
  'localized',(SELECT jsonb_agg(jsonb_build_array(lang,field,value)ORDER BY lang,field)FROM thesaurus.localized_field WHERE concept_id=p_concept),
  'notes',(SELECT jsonb_agg(jsonb_build_array(lang,type,value,source)ORDER BY lang,type,value,source)FROM thesaurus.note WHERE concept_id=p_concept),
  'relations',(SELECT jsonb_agg(jsonb_build_array(type,target)ORDER BY type,target)FROM(SELECT type,target_id target FROM thesaurus.relation WHERE concept_id=p_concept UNION SELECT type,concept_id FROM thesaurus.relation WHERE target_id=p_concept AND type IN('related','exact_equivalent'))x),
  'mappings',(SELECT jsonb_agg(jsonb_build_array(type,target_uri,vocabulary,version,source)ORDER BY type,target_uri)FROM thesaurus.mapping WHERE concept_id=p_concept),
  'policy',(SELECT to_jsonb(v)-'updated_at'-'is_governed'FROM thesaurus.vocabulary v WHERE v.domain=c.domain),
  'base_uri',(SELECT base_uri FROM thesaurus.instance WHERE singleton))::text)FROM thesaurus.concept c WHERE c.concept_id=p_concept $$;

CREATE OR REPLACE FUNCTION thesaurus.object_ids_for_row(p_table oid,p_row jsonb,p_visited oid[]DEFAULT '{}',p_depth integer DEFAULT 0)RETURNS text[]LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,thesaurus,public AS $$
#variable_conflict use_column
DECLARE ids text[]:='{}';nested text[];f record;k record;keyj jsonb;cond text;parentrow jsonb;
BEGIN
  IF p_row IS NULL OR p_depth>8 OR p_table=ANY(p_visited)THEN RETURN ids;END IF;
  IF p_table='public.object'::regclass THEN RETURN ARRAY[p_row->>'id'];END IF;
  IF NULLIF(p_row->>'object_id','')IS NOT NULL THEN RETURN ARRAY[p_row->>'object_id'];END IF;
  IF p_table='public.actor'::regclass THEN SELECT COALESCE(array_agg(DISTINCT object_id),'{}')INTO ids FROM public.actor_object_role WHERE actor_id=(p_row->>'id')::uuid;RETURN ids;END IF;
  FOR f IN SELECT con.confrelid,con.conkey,con.confkey FROM pg_constraint con JOIN pg_class parent ON parent.oid=con.confrelid JOIN pg_namespace ns ON ns.oid=parent.relnamespace WHERE con.conrelid=p_table AND con.contype='f'AND ns.nspname='public'AND parent.relname NOT LIKE'ref\_%'AND NOT con.confrelid=ANY(p_visited||p_table)LOOP
    keyj:='{}';cond:='';
    FOR k IN SELECT la.attname l,ra.attname r FROM unnest(f.conkey,f.confkey)WITH ORDINALITY u(l,r,ord)JOIN pg_attribute la ON la.attrelid=p_table AND la.attnum=u.l JOIN pg_attribute ra ON ra.attrelid=f.confrelid AND ra.attnum=u.r ORDER BY u.ord LOOP
      keyj:=keyj||jsonb_build_object(k.r,p_row->k.l);cond:=cond||CASE WHEN cond=''THEN''ELSE' AND 'END||format('p.%1$I=x.%1$I',k.r);
    END LOOP;
    IF EXISTS(SELECT 1 FROM jsonb_each(keyj)x WHERE x.value='null'::jsonb)THEN CONTINUE;END IF;
    FOR parentrow IN EXECUTE format('SELECT to_jsonb(p)FROM %1$s p CROSS JOIN LATERAL jsonb_populate_record(NULL::%1$s,$1)x WHERE %2$s',f.confrelid::regclass,cond)USING keyj LOOP
      nested:=thesaurus.object_ids_for_row(f.confrelid,parentrow,p_visited||p_table,p_depth+1);ids:=ids||nested;
    END LOOP;
    -- A cascading parent delete can make its row invisible before child DELETE triggers.
    SELECT COALESCE(array_agg(DISTINCT x),'{}')INTO nested FROM thesaurus.ownership_retention own CROSS JOIN LATERAL unnest(own.object_ids)x WHERE own.transaction_id=txid_current()AND own.table_oid=f.confrelid AND own.row_key@>keyj;
    ids:=ids||nested;
  END LOOP;
  RETURN ARRAY(SELECT DISTINCT x FROM unnest(ids)x WHERE x IS NOT NULL ORDER BY x);
END $$;

CREATE OR REPLACE FUNCTION thesaurus.usage_objects(p_concepts uuid[]) RETURNS TABLE(object_id text) LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,thesaurus AS $$
#variable_conflict use_column
DECLARE f record;cond text;sql text;
BEGIN
  -- Follow actual foreign keys, including composite ref_code and every standalone adapter.
  FOR f IN
    SELECT DISTINCT con.conrelid,ns.nspname,cl.relname,con.conkey,con.confkey,con.confrelid,CASE WHEN target.relispartition THEN substring(pg_get_expr(target.relpartbound,target.oid)FROM'''([^'']+)''')END source_domain,
      CASE target.relname WHEN 'ref_amenity' THEN 'amenity' WHEN 'ref_classification_scheme' THEN 'classification_scheme'
       WHEN 'ref_classification_value' THEN 'classification_value' WHEN 'ref_language' THEN 'language'
       WHEN 'ref_commune' THEN 'commune' WHEN 'ref_sustainability_action' THEN 'sustainability_action'
       WHEN 'ref_sustainability_action_category' THEN 'sustainability_category' ELSE 'ref_code' END kind
    FROM pg_constraint con JOIN pg_class cl ON cl.oid=con.conrelid JOIN pg_namespace ns ON ns.oid=cl.relnamespace
    JOIN pg_class target ON target.oid=con.confrelid
    WHERE con.contype='f' AND ns.nspname='public'
      AND (target.relname IN ('ref_code','ref_amenity','ref_classification_scheme','ref_classification_value','ref_language','ref_commune','ref_sustainability_action','ref_sustainability_action_category')
        OR EXISTS(SELECT 1 FROM pg_inherits i WHERE i.inhrelid=target.oid AND i.inhparent='public.ref_code'::regclass))
  LOOP
    SELECT string_agg(format('to_jsonb(t)->%L = s.source_key->%L',la.attname,ra.attname),' AND ' ORDER BY u.ord)
    INTO cond FROM unnest(f.conkey,f.confkey)WITH ORDINALITY u(l,r,ord)
      JOIN pg_attribute la ON la.attrelid=f.conrelid AND la.attnum=u.l JOIN pg_attribute ra ON ra.attrelid=f.confrelid AND ra.attnum=u.r;
    sql:=format('SELECT DISTINCT unnest(thesaurus.object_ids_for_row(%s,to_jsonb(t)))FROM %I.%I t JOIN thesaurus.source_rows s ON s.source_kind=%L AND %s %s JOIN thesaurus.concept c ON(c.source_kind,c.source_id,c.domain)=(s.source_kind,s.source_id,s.domain) WHERE c.concept_id=ANY($1)',f.conrelid,f.nspname,f.relname,f.kind,cond,CASE WHEN f.source_domain IS NULL THEN''ELSE format('AND s.domain=%L',f.source_domain)END);
    RETURN QUERY EXECUTE sql USING p_concepts;
  END LOOP;
  RETURN QUERY SELECT DISTINCT oc.object_id::text FROM public.object_classification oc CROSS JOIN LATERAL unnest(oc.subvalue_ids)sub_id JOIN thesaurus.concept c ON c.source_kind='classification_value'AND c.source_id=sub_id::text WHERE c.concept_id=ANY(p_concepts);
END $$;

CREATE OR REPLACE FUNCTION thesaurus.concept_document(p_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE
SET search_path=pg_catalog,thesaurus AS $$
#variable_conflict use_column
DECLARE c thesaurus.concept%ROWTYPE;s record;j jsonb;pref jsonb;defs jsonb;parent uuid;inst thesaurus.instance%ROWTYPE;
BEGIN
  SELECT * INTO c FROM thesaurus.concept WHERE concept_id=p_id; IF NOT FOUND THEN RETURN NULL;END IF;
  SELECT * INTO s FROM thesaurus.source_rows WHERE(source_kind,source_id,domain)=(c.source_kind,c.source_id,c.domain);
  SELECT * INTO inst FROM thesaurus.instance WHERE singleton;
  IF s.payload IS NULL THEN
    SELECT document INTO j FROM thesaurus.revision WHERE concept_id=p_id AND status<>'published' ORDER BY updated_at DESC LIMIT 1;
    RETURN COALESCE(j,'{}')||jsonb_build_object('concept_id',c.concept_id,'domain',c.domain,'code',c.code,'source_fingerprint',thesaurus.source_fingerprint(p_id),'lifecycle',c.lifecycle,'assignable',c.assignable,'source_kind',c.source_kind);
  END IF;
  pref:=COALESCE((SELECT jsonb_object_agg(lang,value)FROM thesaurus.localized_field WHERE concept_id=p_id AND field='name'),'{}')||COALESCE(NULLIF(s.payload->'name_i18n','null'::jsonb),NULLIF(s.payload->'label_i18n','null'::jsonb),'{}')||jsonb_build_object('fr',COALESCE(s.payload->>'name',s.payload->>'label',c.code));
  defs:=COALESCE((SELECT jsonb_object_agg(lang,value)FROM thesaurus.localized_field WHERE concept_id=p_id AND field='description'),'{}')||COALESCE(NULLIF(s.payload->'description_i18n','null'::jsonb),'{}')||CASE WHEN NULLIF(s.payload->>'description','') IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('fr',s.payload->>'description') END;
  SELECT concept_id INTO parent FROM thesaurus.concept WHERE(source_kind,source_id,domain)=(s.parent_kind,s.parent_source_id,s.parent_domain);
  j:=jsonb_build_object('concept_id',c.concept_id,'uri',rtrim(inst.base_uri,'/')||'/'||c.concept_id::text,
    'domain',c.domain,'code',c.code,'context_key',c.context_key,'qualified_code',c.domain||':'||CASE WHEN c.context_key<>''THEN c.context_key||':'ELSE''END||c.code,'name',pref->>'fr','description',defs->>'fr',
    'preferred_labels',pref,'definitions',defs,'name_i18n',pref,'description_i18n',defs,
    'source_kind',c.source_kind,'source_key',s.source_key,'source_fields',s.payload-'id'-'domain'-'code'-'created_at'-'updated_at'-'name'-'label'-'name_i18n'-'label_i18n'-'description'-'description_i18n',
    'source_fingerprint',thesaurus.source_fingerprint(p_id),'parent_concept_id',parent,'lifecycle',c.lifecycle,
    'assignable',c.assignable AND c.lifecycle='active' AND COALESCE((s.payload->>'is_active')::boolean,true),
    'valid_from',s.payload->'valid_from','valid_to',s.payload->'valid_to',
    'labels',COALESCE((SELECT jsonb_agg(jsonb_build_object('lang',l.lang,'kind',l.kind,'value',l.value)ORDER BY l.lang,l.kind,l.value)FROM thesaurus.label l WHERE l.concept_id=p_id),'[]'),
    'notes',COALESCE((SELECT jsonb_agg(jsonb_build_object('lang',n.lang,'type',n.type,'value',n.value,'source',n.source)ORDER BY n.id)FROM thesaurus.note n WHERE n.concept_id=p_id),'[]'),
    'mappings',COALESCE((SELECT jsonb_agg(jsonb_build_object('type',m.type,'target_uri',m.target_uri,'vocabulary',m.vocabulary,'version',m.version,'source',m.source)ORDER BY m.type,m.target_uri)FROM thesaurus.mapping m WHERE m.concept_id=p_id),'[]'));
  RETURN j||jsonb_build_object(
    'broader',CASE WHEN parent IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(parent) END,
    'narrower',COALESCE((SELECT jsonb_agg(cc.concept_id ORDER BY cc.concept_id)FROM thesaurus.source_rows ss JOIN thesaurus.concept cc ON(cc.source_kind,cc.source_id,cc.domain)=(ss.source_kind,ss.source_id,ss.domain)JOIN thesaurus.vocabulary child_v ON child_v.domain=cc.domain AND child_v.is_governed AND child_v.is_public WHERE(ss.parent_kind,ss.parent_source_id,ss.parent_domain)=(c.source_kind,c.source_id,c.domain)),'[]'),
    'related',COALESCE((SELECT jsonb_agg(x.target ORDER BY x.target)FROM(SELECT target_id target FROM thesaurus.relation WHERE concept_id=p_id AND type='related' UNION SELECT concept_id FROM thesaurus.relation WHERE target_id=p_id AND type='related')x),'[]'),
    'replaced_by',COALESCE((SELECT jsonb_agg(target_id ORDER BY target_id)FROM thesaurus.relation WHERE concept_id=p_id AND type='replaced_by'),'[]'),
    'relations',COALESCE((SELECT jsonb_agg(jsonb_build_object('type',x.type,'target_id',x.target_id)ORDER BY x.type,x.target_id)FROM(SELECT type,target_id FROM thesaurus.relation WHERE concept_id=p_id UNION SELECT type,concept_id FROM thesaurus.relation WHERE target_id=p_id AND type IN('related','exact_equivalent'))x),'[]'));
END $$;

CREATE OR REPLACE FUNCTION thesaurus.is_ancestor(p_parent uuid,p_child uuid)RETURNS boolean LANGUAGE sql STABLE
SET search_path=pg_catalog,thesaurus AS $$
WITH RECURSIVE chain(id,kind,sid,domain,path)AS(
 SELECT c.concept_id,c.source_kind,c.source_id,c.domain,ARRAY[c.concept_id]FROM thesaurus.concept c WHERE c.concept_id=p_child
 UNION ALL SELECT parent.concept_id,parent.source_kind,parent.source_id,parent.domain,x.path||parent.concept_id FROM chain x JOIN thesaurus.source_rows s ON(s.source_kind,s.source_id,s.domain)=(x.kind,x.sid,x.domain)JOIN thesaurus.concept parent ON(parent.source_kind,parent.source_id,parent.domain)=(s.parent_kind,s.parent_source_id,s.parent_domain)WHERE NOT parent.concept_id=ANY(x.path))
SELECT EXISTS(SELECT 1 FROM chain WHERE id=p_parent AND id<>p_child)$$;

CREATE OR REPLACE FUNCTION thesaurus.validate_document(p_concept uuid,p_doc jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE
SET search_path=pg_catalog,thesaurus AS $$
#variable_conflict use_column
DECLARE errors jsonb:='[]';warnings jsonb:='[]';req boolean;required_langs text[];lang text;l jsonb;n jsonb;target uuid;langs jsonb;d text;cid uuid;
BEGIN
  SELECT c.domain,vv.require_definition,vv.required_languages INTO d,req,required_langs FROM thesaurus.concept c JOIN thesaurus.vocabulary vv USING(domain) WHERE c.concept_id=p_concept;
  IF NULLIF(btrim(p_doc->>'name'),'') IS NULL THEN errors:=errors||jsonb_build_array('Le libellé français est requis.');END IF;
  IF COALESCE(p_doc->>'lifecycle','active') NOT IN('active','deprecated','retired') THEN errors:=errors||jsonb_build_array('État du concept invalide.');END IF;
  IF EXISTS(SELECT 1 FROM thesaurus.concept me WHERE me.concept_id=p_concept AND((me.source_kind='classification_value'AND p_doc#>>'{source_fields,scheme_id}'IS NOT NULL AND p_doc#>>'{source_fields,scheme_id}'<>me.context_key)OR(me.source_kind='sustainability_action'AND p_doc#>>'{source_fields,category_id}'IS NOT NULL AND p_doc#>>'{source_fields,category_id}'<>me.context_key)))THEN errors:=errors||jsonb_build_array('Le contexte du code est immuable : créer un nouveau concept pour changer de schéma ou catégorie.');END IF;
  IF COALESCE(req,false) AND NULLIF(btrim(p_doc->>'description'),'') IS NULL THEN errors:=errors||jsonb_build_array('La définition est obligatoire pour ce domaine.'); END IF;
  IF NULLIF(btrim(p_doc->>'description'),'') IS NULL THEN warnings:=warnings||jsonb_build_array('Définition absente : corpus non déclaré complet.');END IF;
  FOREACH d IN ARRAY ARRAY['name_i18n','description_i18n']LOOP
    IF p_doc?d AND p_doc->d<>'null'::jsonb AND jsonb_typeof(p_doc->d)<>'object'THEN errors:=errors||jsonb_build_array('Les traductions doivent être un objet langue/texte.');
    ELSIF jsonb_typeof(p_doc->d)='object'THEN
      IF EXISTS(SELECT 1 FROM jsonb_each(p_doc->d)x WHERE x.key!~'^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$'OR jsonb_typeof(x.value)<>'string')THEN errors:=errors||jsonb_build_array('Langue ou texte de traduction invalide.');END IF;
    END IF;
  END LOOP;
  SELECT domain INTO d FROM thesaurus.concept WHERE concept_id=p_concept;
  FOREACH lang IN ARRAY required_langs LOOP
    IF NULLIF(btrim(CASE WHEN lang='fr'THEN p_doc->>'name'ELSE p_doc->'name_i18n'->>lang END),'')IS NULL THEN errors:=errors||jsonb_build_array('Libellé obligatoire manquant pour la langue '||lang);END IF;
    IF req AND NULLIF(btrim(CASE WHEN lang='fr'THEN p_doc->>'description'ELSE p_doc->'description_i18n'->>lang END),'')IS NULL THEN errors:=errors||jsonb_build_array('Définition obligatoire manquante pour la langue '||lang);END IF;
  END LOOP;
  IF jsonb_typeof(COALESCE(p_doc->'notes','[]'))<>'array'THEN errors:=errors||jsonb_build_array('Liste de notes invalide.');
  ELSE FOR n IN SELECT * FROM jsonb_array_elements(COALESCE(p_doc->'notes','[]'))LOOP
    IF COALESCE(n->>'lang','fr')!~'^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$'OR COALESCE(n->>'type','')NOT IN('scope','definition','history','source')OR NULLIF(btrim(n->>'value'),'')IS NULL THEN errors:=errors||jsonb_build_array('Une note exige une langue, un type autorisé et un texte.');END IF;
  END LOOP;END IF;
  IF jsonb_typeof(COALESCE(p_doc->'labels','[]'))<>'array' THEN errors:=errors||jsonb_build_array('Liste de libellés invalide.');
  ELSE FOR l IN SELECT * FROM jsonb_array_elements(COALESCE(p_doc->'labels','[]')) LOOP
    IF COALESCE(l->>'lang','') !~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$' OR l->>'kind' NOT IN('alt','hidden') OR NULLIF(btrim(l->>'value'),'') IS NULL THEN errors:=errors||jsonb_build_array('Libellé alternatif/caché invalide.');END IF;
    IF lower(btrim(l->>'value'))=lower(btrim(CASE WHEN l->>'lang'='fr' THEN p_doc->>'name' ELSE p_doc->'name_i18n'->>(l->>'lang') END)) THEN errors:=errors||jsonb_build_array('Un synonyme ne peut être le libellé préféré de la même langue.');END IF;
  END LOOP; END IF;
  IF p_doc->>'parent_concept_id' IS NOT NULL THEN
    target:=(p_doc->>'parent_concept_id')::uuid;
    IF target=p_concept OR NOT EXISTS(SELECT 1 FROM thesaurus.concept pc JOIN thesaurus.concept me ON me.concept_id=p_concept WHERE pc.concept_id=target AND ((me.source_kind='ref_code' AND pc.domain=me.domain) OR(me.source_kind='amenity' AND pc.source_kind='ref_code' AND pc.domain='amenity_family') OR(me.source_kind='classification_value' AND ((pc.source_kind='classification_value' AND pc.context_key=me.context_key)OR(pc.source_kind='classification_scheme' AND pc.source_id=me.context_key))) OR(me.source_kind='sustainability_action' AND pc.source_kind='sustainability_category' AND pc.source_id=me.context_key))) THEN errors:=errors||jsonb_build_array('Le parent est incompatible avec le catalogue source.');END IF;
    IF EXISTS(WITH RECURSIVE parents AS(SELECT target id,ARRAY[target]path UNION ALL SELECT (thesaurus.concept_document(p.id)->>'parent_concept_id')::uuid,p.path||(thesaurus.concept_document(p.id)->>'parent_concept_id')::uuid FROM parents p WHERE thesaurus.concept_document(p.id)->>'parent_concept_id' IS NOT NULL AND NOT((thesaurus.concept_document(p.id)->>'parent_concept_id')::uuid=ANY(p.path)))SELECT 1 FROM parents WHERE id=p_concept) THEN errors:=errors||jsonb_build_array('Cycle de hiérarchie interdit.');END IF;
  END IF;
  FOR l IN SELECT * FROM jsonb_array_elements(COALESCE(p_doc->'relations','[]')||COALESCE((SELECT jsonb_agg(jsonb_build_object('type','replaced_by','target_id',x))FROM jsonb_array_elements_text(COALESCE(p_doc->'replaced_by','[]'))x),'[]')) LOOP
    IF l->>'type' NOT IN('related','exact_equivalent','replaced_by') THEN errors:=errors||jsonb_build_array('Relation invalide : la hiérarchie utilise le parent.');CONTINUE;END IF;
    target:=(l->>'target_id')::uuid;
    IF target=p_concept OR NOT EXISTS(SELECT 1 FROM thesaurus.concept WHERE concept_id=target)THEN errors:=errors||jsonb_build_array('Cible de relation absente ou identique.');END IF;
    IF l->>'type'='related'AND(thesaurus.is_ancestor(target,p_concept)OR thesaurus.is_ancestor(p_concept,target)OR target=(p_doc->>'parent_concept_id')::uuid OR thesaurus.is_ancestor(target,(p_doc->>'parent_concept_id')::uuid))THEN errors:=errors||jsonb_build_array('Un terme associé ne peut pas être un ancêtre ou descendant hiérarchique.');END IF;
    IF l->>'type'='replaced_by'AND EXISTS(WITH RECURSIVE path(id,visited)AS(SELECT target,ARRAY[target]UNION ALL SELECT r.target_id,p.visited||r.target_id FROM path p JOIN thesaurus.relation r ON r.concept_id=p.id AND r.type='replaced_by'WHERE NOT r.target_id=ANY(p.visited))SELECT 1 FROM path WHERE id=p_concept)THEN errors:=errors||jsonb_build_array('Cycle de remplacement interdit.');END IF;
  END LOOP;
  FOR l IN SELECT * FROM jsonb_array_elements(COALESCE(p_doc->'mappings','[]'))LOOP
    IF l->>'type' NOT IN('exactMatch','closeMatch','broadMatch','narrowMatch','relatedMatch') OR COALESCE(l->>'target_uri','') !~ '^(https?://|urn:)' OR NULLIF(btrim(l->>'source'),'') IS NULL OR NULLIF(btrim(l->>'vocabulary'),'') IS NULL THEN errors:=errors||jsonb_build_array('Une correspondance exige type, URI, vocabulaire et source.');END IF;
  END LOOP;
  RETURN jsonb_build_object('errors',errors,'warnings',warnings);
EXCEPTION WHEN invalid_text_representation THEN RETURN jsonb_build_object('errors',jsonb_build_array('Identifiant de relation invalide.'),'warnings',warnings);
END $$;

CREATE OR REPLACE FUNCTION thesaurus.refresh_affected_object(p_object_id text)RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,api AS $$
#variable_conflict use_column
BEGIN
  PERFORM api.refresh_object_filter_caches(p_object_id);
  UPDATE public.object SET updated_at=clock_timestamp()WHERE id=p_object_id;
END $$;

CREATE OR REPLACE FUNCTION thesaurus.apply_source(p_id uuid,p_doc jsonb) RETURNS void LANGUAGE plpgsql
SET search_path=pg_catalog,thesaurus,public AS $$
#variable_conflict use_column
DECLARE c thesaurus.concept%ROWTYPE;s record;tbl text;pk text;allowed text[];cols text;merged jsonb;parent_source text;exists_row boolean;
BEGIN
  SELECT * INTO c FROM thesaurus.concept WHERE concept_id=p_id;
  SELECT * INTO s FROM thesaurus.source_rows WHERE(source_kind,source_id,domain)=(c.source_kind,c.source_id,c.domain);
  exists_row:=s.payload IS NOT NULL;
  SELECT source_id INTO parent_source FROM thesaurus.concept WHERE concept_id=(p_doc->>'parent_concept_id')::uuid;
  tbl:=CASE c.source_kind WHEN 'ref_code' THEN 'ref_code' WHEN 'amenity' THEN 'ref_amenity' WHEN 'classification_scheme' THEN 'ref_classification_scheme' WHEN 'classification_value' THEN 'ref_classification_value' WHEN 'language' THEN 'ref_language' WHEN 'commune' THEN 'ref_commune' WHEN 'sustainability_action' THEN 'ref_sustainability_action' WHEN 'sustainability_category' THEN 'ref_sustainability_action_category' END;
  IF tbl IS NULL THEN RAISE EXCEPTION 'Unknown adapter' USING ERRCODE='PT400';END IF;
  pk:=CASE WHEN c.source_kind='commune' THEN 'insee_code' ELSE 'id' END;
  allowed:=CASE c.source_kind
    WHEN 'ref_code' THEN ARRAY['name','description','name_i18n','description_i18n','position','icon_url','is_active','valid_from','valid_to','parent_id','metadata','is_assignable']
    WHEN 'amenity' THEN ARRAY['name','description','name_i18n','description_i18n','position','icon_url','family_id','scope','extra']
    WHEN 'classification_scheme' THEN ARRAY['name','description','name_i18n','position','icon_url','selection','is_distinction','display_group']
    WHEN 'classification_value' THEN ARRAY['name','name_i18n','position','icon_url','ordinal','scheme_id','parent_id','metadata']
    WHEN 'language' THEN ARRAY['name','native_name','position','icon_url']
    WHEN 'commune' THEN ARRAY['name','region_code','position','is_active']
    WHEN 'sustainability_action' THEN ARRAY['label','description','label_i18n','description_i18n','position','icon_url','category_id','extra','applicable_scheme_ids']
    WHEN 'sustainability_category' THEN ARRAY['name','description','name_i18n','description_i18n','position','icon_url','extra'] END;
  merged:=COALESCE(s.payload,'{}')||COALESCE(p_doc->'source_fields','{}')||jsonb_build_object(pk,c.source_id,'code',c.code,'name',p_doc->>'name','label',p_doc->>'name','description',p_doc->>'description','name_i18n',COALESCE(p_doc->'name_i18n','{}'),'label_i18n',COALESCE(p_doc->'name_i18n','{}'),'description_i18n',COALESCE(p_doc->'description_i18n','{}'),'is_active',COALESCE(p_doc->>'lifecycle','active')='active');
  IF c.source_kind='ref_code' THEN
    merged:=merged||jsonb_build_object('domain',c.domain,'parent_id',parent_source,
      'metadata',COALESCE(NULLIF(merged->'metadata','null'::jsonb),'{}')||jsonb_build_object('aliases',to_jsonb(ARRAY(SELECT DISTINCT term FROM(SELECT unnest(c.legacy_search_terms)term UNION ALL SELECT value->>'value' FROM jsonb_array_elements(COALESCE(p_doc->'labels','[]'))WHERE value->>'lang'='fr')a WHERE term IS NOT NULL ORDER BY term))));
  ELSIF c.source_kind='classification_value' THEN
    merged:=merged||jsonb_build_object('scheme_id',COALESCE(merged->>'scheme_id',NULLIF(c.context_key,'')));
    IF parent_source IS NOT NULL AND EXISTS(SELECT 1 FROM thesaurus.concept WHERE concept_id=(p_doc->>'parent_concept_id')::uuid AND source_kind='classification_value')THEN merged:=merged||jsonb_build_object('parent_id',parent_source);ELSE merged:=merged||jsonb_build_object('parent_id',NULL,'scheme_id',COALESCE(parent_source,c.context_key));END IF;
  ELSIF c.source_kind='amenity'AND parent_source IS NOT NULL THEN merged:=merged||jsonb_build_object('family_id',parent_source);
  ELSIF c.source_kind='sustainability_action' THEN merged:=merged||jsonb_build_object('category_id',COALESCE(parent_source,merged->>'category_id',NULLIF(c.context_key,'')));
  END IF;
  IF exists_row THEN
    SELECT string_agg(format('%1$I=x.%1$I',a.attname),','ORDER BY a.attnum)INTO cols FROM pg_attribute a WHERE a.attrelid=format('public.%I',tbl)::regclass AND a.attnum>0 AND NOT a.attisdropped AND a.attgenerated='' AND a.attname=ANY(allowed);
    EXECUTE format('UPDATE public.%1$I t SET %2$s FROM jsonb_populate_record(NULL::public.%1$I,$1)x WHERE t.%3$I::text=$2 %4$s',tbl,cols,pk,CASE WHEN c.source_kind='ref_code' THEN 'AND t.domain=$3' ELSE '' END)USING merged,c.source_id,c.domain;
  ELSE
    SELECT string_agg(format('%I',a.attname),','ORDER BY a.attnum)INTO cols FROM pg_attribute a WHERE a.attrelid=format('public.%I',tbl)::regclass AND a.attnum>0 AND NOT a.attisdropped AND a.attgenerated='' AND (a.attname=ANY(allowed)OR a.attname IN(pk,'code')OR(c.source_kind='ref_code' AND a.attname='domain')) AND merged?a.attname;
    EXECUTE format('INSERT INTO public.%1$I(%2$s)SELECT %2$s FROM jsonb_populate_record(NULL::public.%1$I,$1)',tbl,cols)USING merged;
  END IF;
END $$;

-- These helpers deliberately expose only the generation, never private editorial data.
CREATE OR REPLACE FUNCTION api.thesaurus_generation() RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,thesaurus AS $$ SELECT current_release_id FROM instance WHERE singleton $$;
CREATE OR REPLACE FUNCTION api.thesaurus_object_release() RETURNS bigint LANGUAGE sql STABLE SECURITY INVOKER
SET search_path=pg_catalog,api AS $$ SELECT api.thesaurus_generation() $$;
REVOKE ALL ON FUNCTION api.thesaurus_generation(),api.thesaurus_object_release() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION api.thesaurus_generation(),api.thesaurus_object_release() TO anon,authenticated,service_role,bertel_thesaurus_publisher;

CREATE OR REPLACE FUNCTION thesaurus.requalification() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,thesaurus,public AS $$
WITH affected AS(SELECT c.concept_id,c.domain,c.code,c.lifecycle,thesaurus.concept_document(c.concept_id)doc FROM thesaurus.concept c WHERE c.lifecycle IN('deprecated','retired')),
items AS(SELECT DISTINCT jsonb_build_object('object_id',u.object_id,'object_name',o.name,'concept_id',a.concept_id,'domain',a.domain,'code',a.code,'name',a.doc->>'name','lifecycle',a.lifecycle,'reason',CASE WHEN a.lifecycle='retired' THEN 'Requalification requise' ELSE 'Remplacement recommandé' END,'replaced_by',a.doc->'replaced_by')item FROM affected a CROSS JOIN LATERAL thesaurus.usage_objects(ARRAY[a.concept_id])u JOIN public.object o ON o.id=u.object_id)
SELECT jsonb_build_object('items',COALESCE(jsonb_agg(item ORDER BY item->>'object_id',item->>'concept_id'),'[]'),'total',count(*))FROM items $$;

CREATE OR REPLACE FUNCTION thesaurus.guard_immutable() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,thesaurus AS $$
#variable_conflict use_column
DECLARE rid bigint;
BEGIN
  IF TG_TABLE_NAME='release' THEN
    IF TG_OP='UPDATE' AND current_user='bertel_thesaurus_publisher' AND OLD.checksum='' THEN RETURN NEW;END IF;
  ELSIF TG_OP='INSERT' AND current_user='bertel_thesaurus_publisher' THEN
    rid:=NEW.release_id;
    IF EXISTS(SELECT 1 FROM thesaurus.release WHERE release_id=rid AND checksum='')THEN RETURN NEW;END IF;
  END IF;
  RAISE EXCEPTION 'Published thesaurus releases are immutable' USING ERRCODE='42501';
END $$;
DROP TRIGGER IF EXISTS thesaurus_immutable ON thesaurus.release;
CREATE TRIGGER thesaurus_immutable BEFORE UPDATE OR DELETE ON thesaurus.release FOR EACH ROW EXECUTE FUNCTION thesaurus.guard_immutable();
DROP TRIGGER IF EXISTS thesaurus_immutable ON thesaurus.release_concept;
CREATE TRIGGER thesaurus_immutable BEFORE INSERT OR UPDATE OR DELETE ON thesaurus.release_concept FOR EACH ROW EXECUTE FUNCTION thesaurus.guard_immutable();
DROP TRIGGER IF EXISTS thesaurus_immutable ON thesaurus.release_change;
CREATE TRIGGER thesaurus_immutable BEFORE INSERT OR UPDATE OR DELETE ON thesaurus.release_change FOR EACH ROW EXECUTE FUNCTION thesaurus.guard_immutable();

CREATE OR REPLACE FUNCTION thesaurus.ensure_parent_dependencies()RETURNS void LANGUAGE plpgsql
SET search_path=pg_catalog,thesaurus AS $$
#variable_conflict use_column
DECLARE d text;n integer;
BEGIN
  LOOP
    n:=0;
    FOR d IN SELECT DISTINCT s.parent_domain FROM thesaurus.source_rows s JOIN thesaurus.vocabulary child ON child.domain=s.domain AND child.is_governed AND child.is_public WHERE s.parent_source_id IS NOT NULL AND s.parent_domain IS NOT NULL AND NOT EXISTS(SELECT 1 FROM thesaurus.vocabulary parent WHERE parent.domain=s.parent_domain AND parent.is_governed AND parent.is_public)LOOP
      IF NOT EXISTS(SELECT 1 FROM thesaurus.vocabulary parent WHERE parent.domain=d AND parent.is_public)THEN RAISE EXCEPTION 'Typed parent vocabulary is not approved for public publication' USING ERRCODE='PT400';END IF;
      UPDATE thesaurus.vocabulary SET is_governed=true,updated_at=now()WHERE domain=d;n:=n+1;
    END LOOP;
    EXIT WHEN n=0;
  END LOOP;
  PERFORM thesaurus.sync_sources(NULL);
END $$;

CREATE OR REPLACE FUNCTION thesaurus.activate(p_revision_ids uuid[],p_bootstrap_domains text[],p_key text,p_expected bigint DEFAULT NULL,p_versions jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,thesaurus,public,api,internal,extensions,auth AS $$
#variable_conflict use_column
DECLARE prev bigint;rid bigint;r record;doc jsonb;quality jsonb;affected text[]:='{}';a text;ids uuid[]:='{}';n integer;v_manifest jsonb;checksum text;inst thesaurus.instance%ROWTYPE;d text;parent uuid;rec jsonb;count_changes integer;request_fp text;
BEGIN
  IF NULLIF(btrim(p_key),'')IS NULL OR length(p_key)>200 THEN RAISE EXCEPTION 'Idempotency key required' USING ERRCODE='PT400';END IF;
  PERFORM pg_advisory_xact_lock(741126,1);
  request_fp:=md5(jsonb_build_object('revisions',COALESCE((SELECT jsonb_agg(x ORDER BY x)FROM unnest(COALESCE(p_revision_ids,'{}'))x),'[]'),'domains',COALESCE((SELECT jsonb_agg(x ORDER BY x)FROM unnest(COALESCE(p_bootstrap_domains,'{}'))x),'[]'),'versions',COALESCE(p_versions,'{}'),'expected_release_id',p_expected)::text);
  SELECT * INTO r FROM thesaurus.release WHERE idempotency_key=p_key;
  IF FOUND THEN
    IF r.request_fingerprint<>request_fp THEN RAISE EXCEPTION 'Idempotency key was already used for a different request' USING ERRCODE='PT409';END IF;
    RETURN jsonb_build_object('release_id',r.release_id,'previous_release_id',r.previous_release_id,'changed_count',(SELECT count(*)FROM thesaurus.release_change WHERE release_id=r.release_id),'affected_objects',r.affected_objects,'idempotent',true);
  END IF;
  SELECT * INTO inst FROM thesaurus.instance WHERE singleton FOR UPDATE;prev:=inst.current_release_id;
  IF p_expected IS NOT NULL AND p_expected IS DISTINCT FROM prev THEN RAISE EXCEPTION 'Publication base changed; reload before publishing' USING ERRCODE='PT409';END IF;
  IF inst.base_uri !~ '^https?://[^/ ]+/.+' THEN RAISE EXCEPTION 'Configure a stable HTTP(S) concept URI before publication' USING ERRCODE='PT400';END IF;
  IF NULLIF(btrim(inst.license),'')IS NULL OR NULLIF(btrim(inst.attribution),'')IS NULL THEN RAISE EXCEPTION 'License and attribution required before publication' USING ERRCODE='PT400';END IF;
  IF COALESCE(cardinality(p_revision_ids),0)=0 AND COALESCE(cardinality(p_bootstrap_domains),0)=0 THEN RAISE EXCEPTION 'Select revisions or bootstrap domains' USING ERRCODE='PT400';END IF;
  IF p_bootstrap_domains IS NOT NULL THEN
    IF EXISTS(SELECT 1 FROM unnest(p_bootstrap_domains)x WHERE NOT EXISTS(SELECT 1 FROM thesaurus.vocabulary v WHERE v.domain=x AND v.is_public))THEN RAISE EXCEPTION 'Unknown or non-public vocabulary' USING ERRCODE='PT400';END IF;
    PERFORM thesaurus.sync_sources(p_bootstrap_domains);
    UPDATE thesaurus.vocabulary SET is_governed=true,updated_at=now()WHERE domain=ANY(p_bootstrap_domains);
  END IF;
  FOR r IN SELECT * FROM thesaurus.revision WHERE revision_id=ANY(COALESCE(p_revision_ids,'{}')) ORDER BY concept_id FOR UPDATE LOOP
    IF r.status<>'validated' THEN RAISE EXCEPTION 'Every revision must be validated' USING ERRCODE='PT409';END IF;
    IF (p_versions->>r.revision_id::text)::integer IS DISTINCT FROM r.version THEN RAISE EXCEPTION 'Revision changed since preview; review again' USING ERRCODE='PT409';END IF;
    IF r.base_fingerprint<>thesaurus.source_fingerprint(r.concept_id)THEN RAISE EXCEPTION 'Source changed since revision preparation' USING ERRCODE='PT409';END IF;
    quality:=thesaurus.validate_document(r.concept_id,r.document);
    IF jsonb_array_length(quality->'errors')>0 THEN RAISE EXCEPTION 'Revision validation failed: %',quality->'errors' USING ERRCODE='PT400';END IF;
    ids:=array_append(ids,r.concept_id);
  END LOOP;
  IF cardinality(ids)<>COALESCE(cardinality(p_revision_ids),0)THEN RAISE EXCEPTION 'Unknown revision' USING ERRCODE='PT404';END IF;
  UPDATE thesaurus.vocabulary SET is_governed=true,updated_at=now() WHERE domain IN(SELECT c.domain FROM thesaurus.revision r JOIN thesaurus.concept c USING(concept_id)WHERE r.revision_id=ANY(COALESCE(p_revision_ids,'{}')));
  PERFORM thesaurus.ensure_parent_dependencies();
  -- Include descendants before AND after a re-parenting, so no old path is missed.
  SELECT COALESCE(array_agg(DISTINCT x.concept_id),'{}')INTO ids FROM(
    SELECT unnest(ids)concept_id UNION SELECT cc.concept_id FROM thesaurus.concept c JOIN public.ref_code_taxonomy_closure cl ON cl.ancestor_id::text=c.source_id AND cl.domain=c.domain JOIN thesaurus.concept cc ON cc.source_kind='ref_code' AND cc.source_id=cl.descendant_id::text AND cc.domain=cl.domain WHERE c.concept_id=ANY(ids))x;
  SELECT COALESCE(array_agg(DISTINCT object_id),'{}')INTO affected FROM thesaurus.usage_objects(ids);
  FOR r IN SELECT * FROM thesaurus.revision WHERE revision_id=ANY(COALESCE(p_revision_ids,'{}')) ORDER BY concept_id LOOP
    doc:=r.document;
    UPDATE thesaurus.concept SET lifecycle=COALESCE(doc->>'lifecycle','active'),assignable=COALESCE((doc#>>'{source_fields,is_assignable}')::boolean,assignable)WHERE concept_id=r.concept_id;
    PERFORM thesaurus.apply_source(r.concept_id,doc);
    -- Persist only translations/definitions for which the native adapter has no column.
    DELETE FROM thesaurus.localized_field WHERE concept_id=r.concept_id;
    INSERT INTO thesaurus.localized_field(concept_id,lang,field,value)
    SELECT r.concept_id,x.key,'name',x.value#>>'{}'FROM jsonb_each(COALESCE(doc->'name_i18n','{}'))x WHERE x.key<>'fr'AND NOT EXISTS(SELECT 1 FROM thesaurus.concept c JOIN thesaurus.source_rows sr ON(sr.source_kind,sr.source_id,sr.domain)=(c.source_kind,c.source_id,c.domain)WHERE c.concept_id=r.concept_id AND(sr.payload?'name_i18n'OR sr.payload?'label_i18n'));
    INSERT INTO thesaurus.localized_field(concept_id,lang,field,value)
    SELECT r.concept_id,x.key,'description',x.value#>>'{}'FROM jsonb_each(COALESCE(doc->'description_i18n','{}')||CASE WHEN doc->>'description'IS NULL THEN'{}'::jsonb ELSE jsonb_build_object('fr',doc->>'description')END)x
    WHERE NOT EXISTS(SELECT 1 FROM thesaurus.concept c JOIN thesaurus.source_rows sr ON(sr.source_kind,sr.source_id,sr.domain)=(c.source_kind,c.source_id,c.domain)WHERE c.concept_id=r.concept_id AND CASE WHEN x.key='fr'THEN sr.payload?'description'ELSE sr.payload?'description_i18n'END);
    DELETE FROM thesaurus.label WHERE concept_id=r.concept_id;
    INSERT INTO thesaurus.label(concept_id,lang,kind,value)SELECT r.concept_id,x->>'lang',x->>'kind',btrim(x->>'value')FROM jsonb_array_elements(COALESCE(doc->'labels','[]'))x ON CONFLICT DO NOTHING;
    DELETE FROM thesaurus.note WHERE concept_id=r.concept_id;
    INSERT INTO thesaurus.note(concept_id,lang,type,value,source)SELECT r.concept_id,COALESCE(x->>'lang','fr'),COALESCE(x->>'type','scope'),x->>'value',x->>'source' FROM jsonb_array_elements(COALESCE(doc->'notes','[]'))x;
    DELETE FROM thesaurus.mapping WHERE concept_id=r.concept_id;
    INSERT INTO thesaurus.mapping(concept_id,type,target_uri,vocabulary,version,source,validated_by)SELECT r.concept_id,x->>'type',x->>'target_uri',x->>'vocabulary',x->>'version',x->>'source',auth.uid()FROM jsonb_array_elements(COALESCE(doc->'mappings','[]'))x ON CONFLICT DO NOTHING;
    DELETE FROM thesaurus.relation existing WHERE(existing.concept_id=r.concept_id OR(existing.target_id=r.concept_id AND existing.type IN('related','exact_equivalent')))
      AND EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(r.base_document->'relations','[]')||COALESCE((SELECT jsonb_agg(jsonb_build_object('type','replaced_by','target_id',x))FROM jsonb_array_elements_text(COALESCE(r.base_document->'replaced_by','[]'))x),'[]'))oldrel WHERE oldrel->>'type'=existing.type AND oldrel->>'target_id'=CASE WHEN existing.concept_id=r.concept_id THEN existing.target_id ELSE existing.concept_id END::text)
      AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(doc->'relations','[]')||COALESCE((SELECT jsonb_agg(jsonb_build_object('type','replaced_by','target_id',x))FROM jsonb_array_elements_text(COALESCE(doc->'replaced_by','[]'))x),'[]'))newrel WHERE newrel->>'type'=existing.type AND newrel->>'target_id'=CASE WHEN existing.concept_id=r.concept_id THEN existing.target_id ELSE existing.concept_id END::text);
    INSERT INTO thesaurus.relation(concept_id,type,target_id)
    SELECT r.concept_id,newrel->>'type',(newrel->>'target_id')::uuid FROM jsonb_array_elements(COALESCE(doc->'relations','[]')||COALESCE((SELECT jsonb_agg(jsonb_build_object('type','replaced_by','target_id',x))FROM jsonb_array_elements_text(COALESCE(doc->'replaced_by','[]'))x),'[]'))newrel
    WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(r.base_document->'relations','[]')||COALESCE((SELECT jsonb_agg(jsonb_build_object('type','replaced_by','target_id',x))FROM jsonb_array_elements_text(COALESCE(r.base_document->'replaced_by','[]'))x),'[]'))oldrel WHERE oldrel->>'type'=newrel->>'type'AND oldrel->>'target_id'=newrel->>'target_id')ON CONFLICT DO NOTHING;
  END LOOP;
  PERFORM thesaurus.sync_sources(NULL);
  PERFORM thesaurus.ensure_parent_dependencies();
  IF EXISTS(SELECT 1 FROM thesaurus.relation r WHERE r.type='related'AND(thesaurus.is_ancestor(r.concept_id,r.target_id)OR thesaurus.is_ancestor(r.target_id,r.concept_id)))THEN RAISE EXCEPTION 'Associative and hierarchical relations must be disjoint' USING ERRCODE='PT400';END IF;
  IF EXISTS(WITH RECURSIVE chain AS(SELECT concept_id,target_id,ARRAY[concept_id,target_id]path,concept_id=target_id cycle FROM thesaurus.relation WHERE type='replaced_by' UNION ALL SELECT c.concept_id,r.target_id,c.path||r.target_id,r.target_id=ANY(c.path)FROM chain c JOIN thesaurus.relation r ON r.concept_id=c.target_id AND r.type='replaced_by' WHERE NOT c.cycle)SELECT 1 FROM chain WHERE cycle)THEN RAISE EXCEPTION 'Replacement cycle forbidden' USING ERRCODE='PT400';END IF;
  FOR d IN SELECT DISTINCT c.domain FROM thesaurus.concept c WHERE c.concept_id=ANY(ids)AND c.source_kind='ref_code' LOOP
    IF EXISTS(SELECT 1 FROM public.ref_code_domain_registry WHERE domain=d AND is_taxonomy)THEN PERFORM api.refresh_ref_code_taxonomy_closure(d);END IF;
  END LOOP;
  SELECT COALESCE(array_agg(DISTINCT x.concept_id),'{}')INTO ids FROM(SELECT unnest(ids)concept_id UNION SELECT cc.concept_id FROM thesaurus.concept c JOIN public.ref_code_taxonomy_closure cl ON cl.ancestor_id::text=c.source_id AND cl.domain=c.domain JOIN thesaurus.concept cc ON cc.source_kind='ref_code' AND cc.source_id=cl.descendant_id::text AND cc.domain=cl.domain WHERE c.concept_id=ANY(ids))x;
  SELECT COALESCE(array_agg(DISTINCT x),'{}')INTO affected FROM(SELECT unnest(affected)x UNION SELECT object_id FROM thesaurus.usage_objects(ids))a;
  FOREACH a IN ARRAY affected LOOP
    PERFORM thesaurus.refresh_affected_object(a);
  END LOOP;
  IF COALESCE(cardinality(p_revision_ids),0)>0 THEN
    IF to_regclass('internal.mv_ref_data_json')IS NOT NULL THEN REFRESH MATERIALIZED VIEW internal.mv_ref_data_json;END IF;
    IF to_regclass('internal.mv_filtered_objects')IS NOT NULL THEN REFRESH MATERIALIZED VIEW internal.mv_filtered_objects;END IF;
  END IF;
  INSERT INTO thesaurus.release(previous_release_id,created_by,idempotency_key,affected_objects,request_fingerprint)VALUES(prev,auth.uid(),p_key,cardinality(affected),request_fp)RETURNING release_id INTO rid;
  INSERT INTO thesaurus.release_concept(release_id,concept_id,domain,is_public,document,checksum)
  SELECT rid,c.concept_id,c.domain,v.is_public,
    doc.d-'source_kind'-'source_key'-'source_fields'-'source_fingerprint'-'name_i18n'-'description_i18n',
    md5((doc.d-'source_kind'-'source_key'-'source_fields'-'source_fingerprint'-'name_i18n'-'description_i18n')::text)
  FROM thesaurus.concept c JOIN thesaurus.vocabulary v USING(domain)JOIN thesaurus.source_link sl USING(concept_id)
  CROSS JOIN LATERAL(SELECT thesaurus.concept_document(c.concept_id)d)doc WHERE v.is_governed;
  -- Monotonic historical identity, including tombstones of no-longer-public vocabularies.
  INSERT INTO thesaurus.release_concept(release_id,concept_id,domain,is_public,document,checksum)
  SELECT rid,p.concept_id,p.domain,p.is_public,p.document,p.checksum FROM thesaurus.release_concept p WHERE p.release_id=prev AND NOT EXISTS(SELECT 1 FROM thesaurus.release_concept n WHERE n.release_id=rid AND n.concept_id=p.concept_id);
  IF EXISTS(SELECT 1 FROM thesaurus.release_concept rc JOIN thesaurus.vocabulary v USING(domain)WHERE rc.release_id=rid AND v.require_definition AND NULLIF(btrim(rc.document#>>'{definitions,fr}'),'')IS NULL)THEN RAISE EXCEPTION 'A required concept definition is missing' USING ERRCODE='PT400';END IF;
  IF EXISTS(SELECT 1 FROM thesaurus.release_concept rc CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(rc.document->'broader','[]')||COALESCE(rc.document->'narrower','[]')||COALESCE(rc.document->'related','[]')||COALESCE(rc.document->'replaced_by','[]')||COALESCE((SELECT jsonb_agg(x->>'target_id')FROM jsonb_array_elements(COALESCE(rc.document->'relations','[]'))x),'[]'))target WHERE rc.release_id=rid AND rc.is_public AND NOT EXISTS(SELECT 1 FROM thesaurus.release_concept dst WHERE dst.release_id=rid AND dst.concept_id::text=target.value AND dst.is_public))THEN RAISE EXCEPTION 'A semantic target is outside the approved publication scope; bootstrap its public vocabulary first' USING ERRCODE='PT400';END IF;
  INSERT INTO thesaurus.release_change(release_id,concept_id,change_type,before_document,after_document)
  SELECT rid,n.concept_id,CASE WHEN p.concept_id IS NULL THEN 'added' WHEN n.document->>'lifecycle' IS DISTINCT FROM p.document->>'lifecycle' AND n.document->>'lifecycle' IN('deprecated','retired')THEN n.document->>'lifecycle' ELSE 'modified'END,p.document,n.document
  FROM thesaurus.release_concept n LEFT JOIN thesaurus.release_concept p ON p.release_id=prev AND p.concept_id=n.concept_id WHERE n.release_id=rid AND(p.concept_id IS NULL OR p.checksum<>n.checksum);
  SELECT md5(COALESCE(string_agg(concept_id::text||':'||rc.checksum,','ORDER BY concept_id),''))INTO checksum FROM thesaurus.release_concept rc WHERE release_id=rid;
  SELECT count(*)INTO count_changes FROM thesaurus.release_change WHERE release_id=rid;
  SELECT jsonb_build_object('release_id',rid,'previous_release_id',prev,'as_of',(SELECT as_of FROM thesaurus.release WHERE release_id=rid),'contract_version','1.0.0','checksum',checksum,'license',inst.license,'attribution',inst.attribution,'base_uri',inst.base_uri,'total_concepts',(SELECT count(*)FROM thesaurus.release_concept WHERE release_id=rid AND is_public),'changed_count',count_changes,'affected_objects',cardinality(affected),'domains',COALESCE((SELECT jsonb_agg(jsonb_build_object('domain',v.domain,'name',v.name,'source_kind',v.source_kind,'require_definition',v.require_definition,'required_languages',v.required_languages)ORDER BY v.domain)FROM thesaurus.vocabulary v WHERE v.is_governed AND v.is_public),'[]'))INTO v_manifest;
  UPDATE thesaurus.release SET manifest=v_manifest,checksum=v_manifest->>'checksum' WHERE release_id=rid;
  UPDATE thesaurus.concept SET first_release_id=rid WHERE first_release_id IS NULL AND concept_id IN(SELECT concept_id FROM thesaurus.release_concept WHERE release_id=rid);
  UPDATE thesaurus.revision SET status='published',published_release_id=rid,updated_at=now()WHERE revision_id=ANY(COALESCE(p_revision_ids,'{}'));
  UPDATE thesaurus.instance SET current_release_id=rid,updated_at=now()WHERE singleton;
  INSERT INTO thesaurus.outbox(release_id)VALUES(rid)ON CONFLICT DO NOTHING;
  DELETE FROM thesaurus.assignment_retention WHERE transaction_id<txid_snapshot_xmin(txid_current_snapshot());
  DELETE FROM thesaurus.ownership_retention WHERE transaction_id<txid_snapshot_xmin(txid_current_snapshot());
  RETURN jsonb_build_object('release_id',rid,'previous_release_id',prev,'changed_count',count_changes,'affected_objects',cardinality(affected),'idempotent',false);
END $$;

CREATE OR REPLACE FUNCTION thesaurus.preview(p_ids uuid[]) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,thesaurus AS $$
#variable_conflict use_column
DECLARE r record;q jsonb;errs jsonb:='[]';warns jsonb:='[]';changes jsonb:='[]';ids uuid[]:='{}';fp text;
BEGIN
  IF COALESCE(cardinality(p_ids),0)=0 THEN RAISE EXCEPTION 'Select at least one revision' USING ERRCODE='PT400';END IF;
  FOR r IN SELECT r.*,c.domain,c.code FROM thesaurus.revision r JOIN thesaurus.concept c USING(concept_id)WHERE revision_id=ANY(p_ids)ORDER BY r.revision_id LOOP
    q:=thesaurus.validate_document(r.concept_id,r.document);errs:=errs||(q->'errors');warns:=warns||(q->'warnings');
    IF r.status<>'validated' THEN errs:=errs||jsonb_build_array('Toutes les révisions doivent être validées.');END IF;
    IF r.base_fingerprint<>thesaurus.source_fingerprint(r.concept_id)THEN errs:=errs||jsonb_build_array('La source a changé : recréer et valider la révision.');END IF;
    ids:=array_append(ids,r.concept_id);
    changes:=changes||jsonb_build_array(jsonb_build_object('revision_id',r.revision_id,'version',r.version,'concept_id',r.concept_id,'domain',r.domain,'code',r.code,'before',thesaurus.concept_document(r.concept_id),'after',r.document));
  END LOOP;
  IF cardinality(ids)<>cardinality(p_ids)THEN RAISE EXCEPTION 'Unknown revision' USING ERRCODE='PT404';END IF;
  SELECT md5(COALESCE(string_agg(revision_id::text||':'||version||':'||base_fingerprint,','ORDER BY revision_id),''))INTO fp FROM thesaurus.revision WHERE revision_id=ANY(p_ids);
  SELECT COALESCE(array_agg(DISTINCT x.concept_id),'{}')INTO ids FROM(SELECT unnest(ids)concept_id UNION SELECT cc.concept_id FROM thesaurus.concept c JOIN public.ref_code_taxonomy_closure cl ON cl.ancestor_id::text=c.source_id AND cl.domain=c.domain JOIN thesaurus.concept cc ON cc.source_kind='ref_code' AND cc.source_id=cl.descendant_id::text AND cc.domain=cl.domain WHERE c.concept_id=ANY(ids))x;
  RETURN jsonb_build_object('errors',errs,'warnings',warns,'changed_count',cardinality(p_ids),'affected_objects',(SELECT count(DISTINCT object_id)FROM thesaurus.usage_objects(ids)),'changes',changes,'preview_fingerprint',fp,'expected_revision_versions',(SELECT jsonb_object_agg(revision_id::text,version)FROM thesaurus.revision WHERE revision_id=ANY(p_ids)));
END $$;

CREATE OR REPLACE FUNCTION thesaurus.admin_dispatch(p_action text,p_payload jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,thesaurus,public,api,auth AS $$
#variable_conflict use_column
DECLARE cid uuid;rid uuid;r thesaurus.revision%ROWTYPE;c thesaurus.concept%ROWTYPE;v thesaurus.vocabulary%ROWTYPE;doc jsonb;base jsonb;quality jsonb;domains text[];ids uuid[];lim integer;off integer;result jsonb;current_fp text;k text;delta jsonb;conflicts text[]:='{}';
BEGIN
  IF auth.uid()IS NULL OR api.is_platform_superuser()IS NOT TRUE THEN RAISE EXCEPTION 'Platform superuser required' USING ERRCODE='42501';END IF;
  IF jsonb_typeof(COALESCE(p_payload,'{}'))<>'object' THEN RAISE EXCEPTION 'Object payload required' USING ERRCODE='PT400';END IF;
  IF p_action='configure_instance' THEN
    IF p_payload?'base_uri' AND COALESCE(p_payload->>'base_uri','')!~'^https?://[^/ ]+/.+' THEN RAISE EXCEPTION 'Stable HTTP(S) URI prefix required' USING ERRCODE='PT400';END IF;
    IF EXISTS(SELECT 1 FROM thesaurus.release)AND p_payload?'base_uri' AND p_payload->>'base_uri'<>(SELECT base_uri FROM thesaurus.instance WHERE singleton)THEN RAISE EXCEPTION 'Published concept URI prefix is immutable' USING ERRCODE='PT409';END IF;
    UPDATE thesaurus.instance SET base_uri=COALESCE(p_payload->>'base_uri',base_uri),license=COALESCE(p_payload->>'license',license),attribution=COALESCE(p_payload->>'attribution',attribution),updated_at=now()WHERE singleton RETURNING to_jsonb(thesaurus.instance.*)INTO result;RETURN result;
  ELSIF p_action='configure_domain' THEN
    SELECT * INTO v FROM thesaurus.vocabulary WHERE domain=p_payload->>'domain'FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Unknown vocabulary' USING ERRCODE='PT404';END IF;
    IF p_payload?'is_public' AND(p_payload->>'is_public')::boolean IS DISTINCT FROM v.is_public THEN RAISE EXCEPTION 'Public exposure requires an explicit migration and policy review' USING ERRCODE='42501';END IF;
    IF p_payload?'is_governed' AND(p_payload->>'is_governed')::boolean IS DISTINCT FROM v.is_governed THEN RAISE EXCEPTION 'Activate governance through bootstrap/publication' USING ERRCODE='PT400';END IF;
    UPDATE thesaurus.vocabulary SET require_definition=COALESCE((p_payload->>'require_definition')::boolean,require_definition),updated_at=now()WHERE domain=v.domain RETURNING to_jsonb(thesaurus.vocabulary.*)INTO result;RETURN result;
  ELSIF p_action='bootstrap' THEN
    SELECT array_agg(x)INTO domains FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(p_payload->'domains')='array' THEN p_payload->'domains' ELSE '[]'END)x;
    IF COALESCE(cardinality(domains),0)=0 THEN RAISE EXCEPTION 'Select public vocabularies to bootstrap' USING ERRCODE='PT400';END IF;
    RETURN thesaurus.activate('{}',domains,COALESCE(p_payload->>'idempotency_key','bootstrap:'||md5(array_to_string(domains,','))),(p_payload->>'expected_release_id')::bigint,'{}');
  ELSIF p_action='save_draft' THEN
    PERFORM thesaurus.sync_sources(NULL);
    cid:=(p_payload->>'concept_id')::uuid;
    IF cid IS NULL THEN
      SELECT * INTO v FROM thesaurus.vocabulary WHERE domain=p_payload->>'domain';
      IF NOT FOUND OR NOT v.is_public THEN RAISE EXCEPTION 'Unknown or non-public vocabulary' USING ERRCODE='PT400';END IF;
      doc:=COALESCE(p_payload->'document','{}');
      IF NULLIF(btrim(doc->>'code'),'')IS NULL THEN RAISE EXCEPTION 'Code required for a new concept' USING ERRCODE='PT400';END IF;
      INSERT INTO thesaurus.concept(domain,code,context_key,source_kind,source_id)
      VALUES(v.domain,public.immutable_unaccent(lower(btrim(doc->>'code'))),CASE v.source_kind WHEN'classification_value'THEN COALESCE(doc#>>'{source_fields,scheme_id}','')WHEN'sustainability_action'THEN COALESCE(doc#>>'{source_fields,category_id}','')ELSE''END,v.source_kind,CASE WHEN v.source_kind='commune'THEN doc->>'code'ELSE gen_random_uuid()::text END)RETURNING concept_id INTO cid;
      base:='{}';
    ELSE
      SELECT * INTO c FROM thesaurus.concept WHERE concept_id=cid;
      IF NOT FOUND THEN RAISE EXCEPTION 'Unknown concept' USING ERRCODE='PT404';END IF;
      IF p_payload->>'domain' IS NOT NULL AND p_payload->>'domain'<>c.domain THEN RAISE EXCEPTION 'Concept domain is immutable' USING ERRCODE='PT400';END IF;
      IF p_payload#>>'{document,code}' IS NOT NULL AND p_payload#>>'{document,code}'<>c.code THEN RAISE EXCEPTION 'Code is immutable; create a new concept' USING ERRCODE='PT400';END IF;
      base:=thesaurus.concept_document(cid);
    END IF;
    SELECT * INTO r FROM thesaurus.revision WHERE concept_id=cid AND status<>'published'FOR UPDATE;
    IF FOUND AND COALESCE((p_payload->>'expected_version')::integer,-1)<>r.version THEN RAISE EXCEPTION 'Revision changed; reload before saving' USING ERRCODE='PT409';END IF;
    doc:=COALESCE(base,'{}')||COALESCE(p_payload->'document','{}');
    doc:=doc||jsonb_build_object('source_fields',COALESCE(base->'source_fields','{}')||COALESCE(p_payload#>'{document,source_fields}','{}'));
    -- French native fields are authoritative; keep legacy i18n consumers consistent on rename/clear.
    doc:=doc||jsonb_build_object('name_i18n',(COALESCE(NULLIF(doc->'name_i18n','null'::jsonb),'{}')-'fr')||jsonb_build_object('fr',doc->>'name'),
      'description_i18n',(COALESCE(NULLIF(doc->'description_i18n','null'::jsonb),'{}')-'fr')||CASE WHEN NULLIF(doc->>'description','')IS NULL THEN'{}'::jsonb ELSE jsonb_build_object('fr',doc->>'description')END);
    quality:=thesaurus.validate_document(cid,doc);
    IF jsonb_array_length(quality->'errors')>0 THEN RAISE EXCEPTION 'Invalid draft: %',quality->'errors' USING ERRCODE='PT400';END IF;
    IF r.revision_id IS NULL THEN
      INSERT INTO thesaurus.revision(concept_id,document,base_document,base_fingerprint,base_release_id,created_by,errors,warnings)VALUES(cid,doc,COALESCE(base,'{}'),thesaurus.source_fingerprint(cid),api.thesaurus_generation(),auth.uid(),quality->'errors',quality->'warnings')RETURNING * INTO r;
    ELSE
      UPDATE thesaurus.revision SET document=doc,version=version+1,status='draft',validated_by=NULL,errors=quality->'errors',warnings=quality->'warnings',updated_at=now()WHERE revision_id=r.revision_id RETURNING * INTO r;
    END IF;
    RETURN to_jsonb(r)||(SELECT jsonb_build_object('domain',domain)FROM thesaurus.concept WHERE concept_id=cid);
  ELSIF p_action IN('discard_draft','rebase_draft')THEN
    SELECT * INTO r FROM thesaurus.revision WHERE revision_id=(p_payload->>'revision_id')::uuid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Unknown revision' USING ERRCODE='PT404';END IF;
    IF r.status='published'OR COALESCE((p_payload->>'expected_version')::integer,-1)<>r.version THEN RAISE EXCEPTION 'Revision changed; reload before recovery' USING ERRCODE='PT409';END IF;
    IF p_action='discard_draft'THEN
      DELETE FROM thesaurus.revision WHERE revision_id=r.revision_id;
      DELETE FROM thesaurus.concept c WHERE c.concept_id=r.concept_id AND c.first_release_id IS NULL AND NOT EXISTS(SELECT 1 FROM thesaurus.source_link sl WHERE sl.concept_id=c.concept_id)AND NOT EXISTS(SELECT 1 FROM thesaurus.relation rel WHERE rel.concept_id=c.concept_id OR rel.target_id=c.concept_id);
      RETURN jsonb_build_object('discarded',true,'revision_id',r.revision_id);
    END IF;
    base:=thesaurus.concept_document(r.concept_id);doc:=base;delta:='{}';
    FOR k IN SELECT jsonb_object_keys(r.document)LOOP
      IF k IN('concept_id','uri','source_fingerprint','source_key','source_kind','broader','narrower','preferred_labels','definitions','usage_count')THEN CONTINUE;END IF;
      IF r.document->k IS DISTINCT FROM r.base_document->k THEN
        IF base->k IS DISTINCT FROM r.base_document->k AND base->k IS DISTINCT FROM r.document->k THEN conflicts:=array_append(conflicts,k);ELSE delta:=delta||jsonb_build_object(k,r.document->k);END IF;
      END IF;
    END LOOP;
    IF cardinality(conflicts)>0 THEN RAISE EXCEPTION 'Conflicting fields require explicit review: %',array_to_string(conflicts,', ')USING ERRCODE='PT409';END IF;
    doc:=base||delta;quality:=thesaurus.validate_document(r.concept_id,doc);
    UPDATE thesaurus.revision SET document=doc,base_document=base,base_fingerprint=thesaurus.source_fingerprint(r.concept_id),base_release_id=api.thesaurus_generation(),version=version+1,status='draft',validated_by=NULL,errors=quality->'errors',warnings=quality->'warnings',updated_at=now()WHERE revision_id=r.revision_id RETURNING * INTO r;
    RETURN to_jsonb(r)||(SELECT jsonb_build_object('domain',domain)FROM thesaurus.concept WHERE concept_id=r.concept_id);
  ELSIF p_action='validate_draft' THEN
    SELECT * INTO r FROM thesaurus.revision WHERE revision_id=(p_payload->>'revision_id')::uuid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Unknown revision' USING ERRCODE='PT404';END IF;
    IF r.status='published'OR COALESCE((p_payload->>'expected_version')::integer,-1)<>r.version THEN RAISE EXCEPTION 'Revision changed; reload before validating' USING ERRCODE='PT409';END IF;
    IF r.base_fingerprint<>thesaurus.source_fingerprint(r.concept_id)THEN RAISE EXCEPTION 'Canonical source changed' USING ERRCODE='PT409';END IF;
    quality:=thesaurus.validate_document(r.concept_id,r.document);
    UPDATE thesaurus.revision SET status=CASE WHEN jsonb_array_length(quality->'errors')=0 THEN'validated'ELSE'draft'END,validated_by=CASE WHEN jsonb_array_length(quality->'errors')=0 THEN auth.uid()END,version=version+1,errors=quality->'errors',warnings=quality->'warnings',updated_at=now()WHERE revision_id=r.revision_id RETURNING * INTO r;
    RETURN to_jsonb(r)||(SELECT jsonb_build_object('domain',domain)FROM thesaurus.concept WHERE concept_id=r.concept_id);
  ELSIF p_action IN('preview','publish')THEN
    SELECT array_agg(x::uuid)INTO ids FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(p_payload->'revision_ids')='array'THEN p_payload->'revision_ids'ELSE'[]'END)x;
    result:=thesaurus.preview(ids);
    IF p_action='preview'THEN RETURN result;END IF;
    IF p_payload?'preview_fingerprint'AND p_payload->>'preview_fingerprint'<>result->>'preview_fingerprint'THEN RAISE EXCEPTION 'Preview changed; review again' USING ERRCODE='PT409';END IF;
    RETURN thesaurus.activate(ids,NULL,p_payload->>'idempotency_key',(p_payload->>'expected_release_id')::bigint,COALESCE(p_payload->'expected_revision_versions','{}'));
  ELSIF p_action='requalification'THEN RETURN thesaurus.requalification();
  ELSIF p_action='retry_outbox'THEN
    UPDATE thesaurus.outbox SET status='pending',last_error=NULL WHERE id=(p_payload->>'id')::bigint AND status IN('failed','pending')RETURNING to_jsonb(thesaurus.outbox.*)INTO result;
    IF result IS NULL THEN RAISE EXCEPTION 'Unknown or completed event' USING ERRCODE='PT404';END IF;RETURN result;
  ELSIF p_action='ack_outbox'THEN
    UPDATE thesaurus.outbox SET status=CASE WHEN p_payload->>'error'IS NULL THEN'completed'ELSE'failed'END,attempts=attempts+1,last_error=left(p_payload->>'error',500),completed_at=CASE WHEN p_payload->>'error'IS NULL THEN now()END WHERE id=(p_payload->>'id')::bigint AND status<>'completed'RETURNING to_jsonb(thesaurus.outbox.*)INTO result;RETURN result;
  ELSIF p_action<>'workspace'THEN RAISE EXCEPTION 'Unknown editorial action' USING ERRCODE='PT400';END IF;
  PERFORM thesaurus.sync_sources(NULL);
  lim:=LEAST(200,GREATEST(1,COALESCE((p_payload->>'page_size')::integer,100)));off:=GREATEST(0,COALESCE((p_payload->>'offset')::integer,0));
  IF jsonb_typeof(p_payload->'concept_ids')='array'THEN SELECT array_agg(x::uuid)INTO ids FROM jsonb_array_elements_text(p_payload->'concept_ids')x;END IF;
  SELECT jsonb_build_object(
    'instance',(SELECT to_jsonb(i)FROM thesaurus.instance i WHERE singleton),
    'domains',COALESCE((SELECT jsonb_agg(to_jsonb(v)||jsonb_build_object('concept_count',(SELECT count(*)FROM thesaurus.concept c WHERE c.domain=v.domain))ORDER BY name,domain)FROM thesaurus.vocabulary v WHERE v.is_public),'[]'),
    'concepts',COALESCE((SELECT jsonb_agg(x.doc ORDER BY x.domain,x.code,x.concept_id)FROM(SELECT c.domain,c.code,c.concept_id,thesaurus.concept_document(c.concept_id)||jsonb_build_object('usage_count',(SELECT count(DISTINCT u.object_id)FROM thesaurus.usage_objects(ARRAY[c.concept_id])u),'revision',(SELECT to_jsonb(r)FROM thesaurus.revision r WHERE r.concept_id=c.concept_id AND status<>'published'))doc FROM thesaurus.concept c JOIN thesaurus.vocabulary v USING(domain) WHERE v.is_public AND(ids IS NULL OR c.concept_id=ANY(ids))AND(NULLIF(p_payload->>'domain','')IS NULL OR c.domain=p_payload->>'domain')AND(NULLIF(p_payload->>'query','')IS NULL OR(thesaurus.concept_document(c.concept_id)::text)ILIKE'%'||(p_payload->>'query')||'%')ORDER BY c.domain,c.code,c.concept_id LIMIT lim OFFSET off)x),'[]'),
    'revisions',COALESCE((SELECT jsonb_agg(to_jsonb(r)ORDER BY updated_at DESC)FROM(SELECT r.*,c.domain FROM thesaurus.revision r JOIN thesaurus.concept c USING(concept_id)WHERE status<>'published'ORDER BY updated_at DESC LIMIT 200)r),'[]'),
    'releases',COALESCE((SELECT jsonb_agg(to_jsonb(r)ORDER BY release_id DESC)FROM(SELECT * FROM thesaurus.release ORDER BY release_id DESC LIMIT 50)r),'[]'),
    'outbox',COALESCE((SELECT jsonb_agg(to_jsonb(o)ORDER BY id DESC)FROM(SELECT * FROM thesaurus.outbox ORDER BY id DESC LIMIT 100)o),'[]'),
    'requalification',thesaurus.requalification(),'latest_release_id',api.thesaurus_generation(),
    'stats',jsonb_build_object('total_concepts',(SELECT count(*)FROM thesaurus.concept c JOIN thesaurus.vocabulary v USING(domain)WHERE v.is_public),'matching_concepts',(SELECT count(*)FROM thesaurus.concept c JOIN thesaurus.vocabulary v USING(domain)WHERE v.is_public AND(ids IS NULL OR c.concept_id=ANY(ids))AND(NULLIF(p_payload->>'domain','')IS NULL OR c.domain=p_payload->>'domain')AND(NULLIF(p_payload->>'query','')IS NULL OR thesaurus.concept_document(c.concept_id)::text ILIKE'%'||(p_payload->>'query')||'%')),'pending_revisions',(SELECT count(*)FROM thesaurus.revision WHERE status<>'published'),'published_releases',(SELECT count(*)FROM thesaurus.release),'retired_usages',(thesaurus.requalification()->>'total')::integer))
  INTO result;RETURN result;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RAISE EXCEPTION 'Invalid identifier or numeric value' USING ERRCODE='PT400';
END $$;

CREATE OR REPLACE FUNCTION api.thesaurus_admin(p_action text,p_payload jsonb DEFAULT '{}')RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER
SET search_path=pg_catalog,thesaurus AS $$ SELECT thesaurus.admin_dispatch(p_action,p_payload) $$;
REVOKE ALL ON FUNCTION api.thesaurus_admin(text,jsonb),thesaurus.admin_dispatch(text,jsonb)FROM PUBLIC;
GRANT EXECUTE ON FUNCTION api.thesaurus_admin(text,jsonb),thesaurus.admin_dispatch(text,jsonb)TO authenticated;

CREATE OR REPLACE FUNCTION thesaurus.localized_document(p_doc jsonb,p_lang text)RETURNS jsonb LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog AS $$
WITH lang AS(SELECT CASE WHEN NULLIF(p_doc->'preferred_labels'->>p_lang,'')IS NOT NULL THEN p_lang WHEN NULLIF(p_doc->'preferred_labels'->>split_part(p_lang,'-',1),'')IS NOT NULL THEN split_part(p_lang,'-',1)ELSE'fr'END effective)
SELECT p_doc||jsonb_build_object('effective_lang',effective,'name',COALESCE(p_doc->'preferred_labels'->>effective,p_doc->>'name'),'description',COALESCE(p_doc->'definitions'->>effective,p_doc->'definitions'->>'fr',p_doc->>'description'))FROM lang $$;

CREATE OR REPLACE FUNCTION thesaurus.public_dispatch(p_action text,p_release_id bigint DEFAULT NULL,p_params jsonb DEFAULT '{}')RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,thesaurus AS $$
#variable_conflict use_column
DECLARE rid bigint;r thesaurus.release%ROWTYPE;domains text[];statuses text[];lim integer;afterid uuid;lang text;data jsonb;meta jsonb;n bigint;next_id uuid;q text;visible integer;
BEGIN
  rid:=COALESCE(p_release_id,(SELECT current_release_id FROM thesaurus.instance WHERE singleton));
  IF rid IS NULL THEN RAISE EXCEPTION 'No thesaurus release is activated' USING ERRCODE='PT503';END IF;
  SELECT * INTO r FROM thesaurus.release WHERE release_id=rid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown release' USING ERRCODE='PT404';END IF;
  IF jsonb_typeof(p_params->'domains')='array'THEN SELECT array_agg(x)INTO domains FROM jsonb_array_elements_text(p_params->'domains')x;END IF;
  IF jsonb_typeof(p_params->'status')='array'THEN SELECT array_agg(x)INTO statuses FROM jsonb_array_elements_text(p_params->'status')x;END IF;
  IF EXISTS(SELECT 1 FROM unnest(domains)d WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(r.manifest->'domains')v WHERE v->>'domain'=d))THEN RAISE EXCEPTION 'Unknown or unavailable vocabulary' USING ERRCODE='PT400';END IF;
  IF EXISTS(SELECT 1 FROM unnest(statuses)s WHERE s NOT IN('active','deprecated','retired'))THEN RAISE EXCEPTION 'Invalid lifecycle filter' USING ERRCODE='PT400';END IF;
  lim:=LEAST(200,GREATEST(1,COALESCE((p_params->>'limit')::integer,(p_params->>'page_size')::integer,100)));
  afterid:=NULLIF(p_params->>'after','')::uuid;lang:=COALESCE(NULLIF(p_params->>'lang',''),'fr');q:=NULLIF(p_params->>'query','');
  meta:=jsonb_build_object('contract_version','1.0.0','release_id',rid,'previous_release_id',r.previous_release_id,'as_of',r.as_of,'checksum',r.checksum,'next_after',NULL);
  IF p_action IN('manifest','release')THEN
    data:=r.manifest;
    IF p_action='manifest'THEN data:=data||jsonb_build_object('releases',COALESCE((SELECT jsonb_agg(rr.manifest ORDER BY release_id DESC)FROM(SELECT release_id,manifest FROM thesaurus.release ORDER BY release_id DESC LIMIT 100)rr),'[]'));END IF;
  ELSIF p_action='releases'THEN SELECT COALESCE(jsonb_agg(x.manifest ORDER BY release_id DESC),'[]')INTO data FROM(SELECT release_id,manifest FROM thesaurus.release ORDER BY release_id DESC LIMIT 100)x;
  ELSIF p_action IN('concept','resolve')THEN
    SELECT thesaurus.localized_document(document,lang)INTO data FROM thesaurus.release_concept WHERE release_id=rid AND concept_id=(p_params->>'concept_id')::uuid AND is_public;
    IF data IS NULL THEN RAISE EXCEPTION 'Unknown concept' USING ERRCODE='PT404';END IF;
  ELSIF p_action IN('concepts','export')THEN
    SELECT count(*)INTO n FROM thesaurus.release_concept rc WHERE rc.release_id=rid AND rc.is_public AND(domains IS NULL OR rc.domain=ANY(domains))AND(statuses IS NULL OR rc.document->>'lifecycle'=ANY(statuses))AND(q IS NULL OR rc.document::text ILIKE'%'||q||'%');
    SELECT COALESCE(jsonb_agg(thesaurus.localized_document(x.document,lang)ORDER BY x.concept_id),'[]')INTO data FROM(SELECT concept_id,document FROM thesaurus.release_concept rc WHERE rc.release_id=rid AND rc.is_public AND(domains IS NULL OR rc.domain=ANY(domains))AND(statuses IS NULL OR rc.document->>'lifecycle'=ANY(statuses))AND(q IS NULL OR rc.document::text ILIKE'%'||q||'%')AND(p_action='export'OR afterid IS NULL OR rc.concept_id>afterid)ORDER BY concept_id LIMIT CASE WHEN p_action='export'THEN NULL ELSE lim END)x;
    IF p_action<>'export'AND jsonb_array_length(data)=lim THEN
      next_id:=(data->(lim-1)->>'concept_id')::uuid;
      IF NOT EXISTS(SELECT 1 FROM thesaurus.release_concept rc WHERE rc.release_id=rid AND rc.is_public AND(domains IS NULL OR rc.domain=ANY(domains))AND(statuses IS NULL OR rc.document->>'lifecycle'=ANY(statuses))AND(q IS NULL OR rc.document::text ILIKE'%'||q||'%')AND rc.concept_id>next_id)THEN next_id:=NULL;END IF;
    END IF;
    meta:=meta||jsonb_build_object('total',n,'next_after',next_id);
  ELSIF p_action='changes'THEN
    SELECT count(*)INTO n FROM thesaurus.release_change ch JOIN thesaurus.release_concept rc USING(release_id,concept_id)WHERE ch.release_id=rid AND rc.is_public AND(domains IS NULL OR rc.domain=ANY(domains))AND(statuses IS NULL OR rc.document->>'lifecycle'=ANY(statuses))AND(q IS NULL OR rc.document::text ILIKE'%'||q||'%');
    SELECT COALESCE(jsonb_agg(jsonb_build_object('concept_id',x.concept_id,'change_type',x.change_type,'before',CASE WHEN x.before_document IS NULL THEN NULL ELSE thesaurus.localized_document(x.before_document,lang)END,'after',thesaurus.localized_document(x.after_document,lang))ORDER BY x.concept_id),'[]')INTO data FROM(SELECT ch.* FROM thesaurus.release_change ch JOIN thesaurus.release_concept rc USING(release_id,concept_id)WHERE ch.release_id=rid AND rc.is_public AND(domains IS NULL OR rc.domain=ANY(domains))AND(statuses IS NULL OR rc.document->>'lifecycle'=ANY(statuses))AND(q IS NULL OR rc.document::text ILIKE'%'||q||'%')AND(afterid IS NULL OR ch.concept_id>afterid)ORDER BY ch.concept_id LIMIT lim)x;
    IF jsonb_array_length(data)=lim THEN next_id:=(data->(lim-1)->>'concept_id')::uuid;
      IF NOT EXISTS(SELECT 1 FROM thesaurus.release_change ch JOIN thesaurus.release_concept rc USING(release_id,concept_id)WHERE ch.release_id=rid AND rc.is_public AND(domains IS NULL OR rc.domain=ANY(domains))AND(statuses IS NULL OR rc.document->>'lifecycle'=ANY(statuses))AND(q IS NULL OR rc.document::text ILIKE'%'||q||'%')AND ch.concept_id>next_id)THEN next_id:=NULL;END IF;
    END IF;
    meta:=meta||jsonb_build_object('total',n,'next_after',next_id);
  ELSE RAISE EXCEPTION 'Unknown public action' USING ERRCODE='PT400';END IF;
  RETURN jsonb_build_object('meta',meta,'data',data);
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RAISE EXCEPTION 'Invalid identifier or parameter' USING ERRCODE='PT400';
END $$;
CREATE OR REPLACE FUNCTION api.thesaurus_public(p_action text,p_release_id bigint DEFAULT NULL,p_params jsonb DEFAULT '{}')RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER
SET search_path=pg_catalog,thesaurus AS $$SELECT thesaurus.public_dispatch(p_action,p_release_id,p_params)$$;
REVOKE ALL ON FUNCTION api.thesaurus_public(text,bigint,jsonb),thesaurus.public_dispatch(text,bigint,jsonb)FROM PUBLIC;
GRANT EXECUTE ON FUNCTION api.thesaurus_public(text,bigint,jsonb),thesaurus.public_dispatch(text,bigint,jsonb)TO service_role;

CREATE OR REPLACE FUNCTION api.thesaurus_expand_taxonomy_codes(p_codes text[])RETURNS text[]LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,thesaurus AS $$
WITH RECURSIVE pinned AS MATERIALIZED(SELECT * FROM thesaurus.release_concept WHERE release_id=api.thesaurus_generation()AND is_public),connected(id,domain)AS(
  SELECT rc.concept_id,rc.domain FROM pinned rc WHERE rc.domain||':'||(rc.document->>'code')=ANY(p_codes)
  UNION SELECT target.concept_id,target.domain FROM connected x JOIN pinned current_doc ON current_doc.concept_id=x.id CROSS JOIN LATERAL jsonb_array_elements(COALESCE(current_doc.document->'relations','[]'))rel JOIN pinned target ON target.concept_id::text=rel->>'target_id'AND target.domain=x.domain WHERE rel->>'type'='exact_equivalent')
SELECT COALESCE(array_agg(DISTINCT token ORDER BY token),'{}')FROM(SELECT unnest(COALESCE(p_codes,'{}'))token UNION SELECT rc.domain||':'||(rc.document->>'code')FROM connected x JOIN pinned rc ON rc.concept_id=x.id WHERE rc.document->>'lifecycle'IN('deprecated','retired'))s $$;
REVOKE ALL ON FUNCTION api.thesaurus_expand_taxonomy_codes(text[])FROM PUBLIC;
GRANT EXECUTE ON FUNCTION api.thesaurus_expand_taxonomy_codes(text[])TO anon,authenticated,service_role;

-- Capture the original allowlist and keep the legacy endpoint's exact domain set.
CREATE OR REPLACE FUNCTION api.public_catalog_domains()RETURNS text[]LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,thesaurus AS $$SELECT COALESCE(array_agg(domain ORDER BY domain),'{}')FROM thesaurus.vocabulary WHERE legacy_public$$;
REVOKE ALL ON FUNCTION api.public_catalog_domains()FROM PUBLIC;
GRANT EXECUTE ON FUNCTION api.public_catalog_domains()TO anon,authenticated,service_role,bertel_thesaurus_publisher;

CREATE OR REPLACE FUNCTION thesaurus.write_fence()RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog AS $$
BEGIN PERFORM pg_advisory_xact_lock_shared(741126,1);RETURN NULL;END $$;

CREATE OR REPLACE FUNCTION thesaurus.remember_ownership()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,thesaurus AS $$
#variable_conflict use_column
DECLARE keyj jsonb;objects text[];
BEGIN
  objects:=thesaurus.object_ids_for_row(TG_RELID,to_jsonb(OLD));
  IF cardinality(objects)>0 THEN
    SELECT jsonb_object_agg(a.attname,to_jsonb(OLD)->a.attname)INTO keyj FROM pg_index i JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=ANY(i.indkey)WHERE i.indrelid=TG_RELID AND i.indisprimary;
    IF keyj IS NOT NULL THEN INSERT INTO thesaurus.ownership_retention(transaction_id,table_oid,row_key,object_ids)VALUES(txid_current(),TG_RELID,keyj,objects)ON CONFLICT(transaction_id,table_oid,row_key)DO UPDATE SET object_ids=EXCLUDED.object_ids;END IF;
  END IF;
  RETURN OLD;
END $$;

DO $object_fences$DECLARE t record;BEGIN
  FOR t IN WITH RECURSIVE owned(id)AS(
    SELECT c.oid FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace WHERE ns.nspname='public'AND c.relkind IN('r','p')AND(c.relname IN('object','actor')OR EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attname='object_id'AND NOT a.attisdropped))
    UNION SELECT con.conrelid FROM pg_constraint con JOIN owned parent ON parent.id=con.confrelid JOIN pg_class child ON child.oid=con.conrelid JOIN pg_namespace ns ON ns.oid=child.relnamespace WHERE con.contype='f'AND ns.nspname='public'AND child.relkind IN('r','p')AND child.relname NOT LIKE'ref\_%')SELECT DISTINCT id::regclass rel FROM owned WHERE NOT EXISTS(SELECT 1 FROM pg_inherits i WHERE i.inhrelid=owned.id)
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS thesaurus_write_fence ON %s',t.rel);
    EXECUTE format('CREATE TRIGGER thesaurus_write_fence BEFORE INSERT OR UPDATE OR DELETE ON %s FOR EACH STATEMENT EXECUTE FUNCTION thesaurus.write_fence()',t.rel);
    EXECUTE format('DROP TRIGGER IF EXISTS thesaurus_remember_ownership ON %s',t.rel);
    EXECUTE format('CREATE TRIGGER thesaurus_remember_ownership BEFORE DELETE ON %s FOR EACH ROW EXECUTE FUNCTION thesaurus.remember_ownership()',t.rel);
  END LOOP;
END $object_fences$;

CREATE OR REPLACE FUNCTION thesaurus.guard_classification_subvalues()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,thesaurus AS $$
#variable_conflict use_column
DECLARE oldids uuid[];newids uuid[];id uuid;c thesaurus.concept%ROWTYPE;obj text;gen bigint;
BEGIN
  oldids:=CASE WHEN TG_OP<>'INSERT'THEN COALESCE(OLD.subvalue_ids,'{}')ELSE'{}'END;
  newids:=CASE WHEN TG_OP<>'DELETE'THEN COALESCE(NEW.subvalue_ids,'{}')ELSE'{}'END;
  obj:=CASE WHEN TG_OP='DELETE'THEN OLD.object_id ELSE NEW.object_id END;
  IF NOT thesaurus.is_governed('classification_value')THEN RETURN CASE WHEN TG_OP='DELETE'THEN OLD ELSE NEW END;END IF;
  PERFORM pg_advisory_xact_lock_shared(741126,1);gen:=api.thesaurus_generation();
  IF TG_OP='DELETE'THEN
    INSERT INTO thesaurus.assignment_retention(transaction_id,table_oid,object_id,concept_id)SELECT txid_current(),TG_RELID,obj,c.concept_id FROM thesaurus.concept c WHERE c.source_kind='classification_value'AND c.source_id=ANY(ARRAY(SELECT x::text FROM unnest(oldids)x))ON CONFLICT DO NOTHING;RETURN OLD;
  END IF;
  FOREACH id IN ARRAY newids LOOP
    IF id=ANY(oldids)THEN CONTINUE;END IF;
    SELECT * INTO c FROM thesaurus.concept WHERE source_kind='classification_value'AND source_id=id::text;
    IF NOT FOUND THEN RAISE EXCEPTION 'Unknown classification subvalue' USING ERRCODE='23503';END IF;
    IF NOT EXISTS(SELECT 1 FROM thesaurus.assignment_retention ar WHERE ar.transaction_id=txid_current()AND ar.table_oid=TG_RELID AND ar.object_id=obj AND ar.concept_id=c.concept_id)
      AND(c.lifecycle<>'active'OR NOT c.assignable OR NOT EXISTS(SELECT 1 FROM thesaurus.release_concept rc WHERE rc.release_id=gen AND rc.concept_id=c.concept_id))THEN RAISE EXCEPTION 'Historical classification subvalue cannot be newly assigned' USING ERRCODE='23514';END IF;
  END LOOP;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS thesaurus_subvalues_guard ON public.object_classification;
CREATE TRIGGER thesaurus_subvalues_guard BEFORE INSERT OR UPDATE OR DELETE ON public.object_classification FOR EACH ROW EXECUTE FUNCTION thesaurus.guard_classification_subvalues();

CREATE OR REPLACE FUNCTION thesaurus.guard_assignment()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,thesaurus AS $$
#variable_conflict use_column
DECLARE f jsonb;j jsonb;oldj jsonb;keyj jsonb;oldkey jsonb;k jsonb;c record;obj text;objects text[];gen bigint;
BEGIN
  j:=CASE WHEN TG_OP<>'DELETE'THEN to_jsonb(NEW)ELSE to_jsonb(OLD)END;
  oldj:=CASE WHEN TG_OP<>'INSERT'THEN to_jsonb(OLD)ELSE NULL END;objects:=thesaurus.object_ids_for_row(TG_RELID,j);
  IF COALESCE(cardinality(objects),0)=0 THEN RETURN CASE WHEN TG_OP='DELETE'THEN OLD ELSE NEW END;END IF;
  -- Even DELETE takes the shared fence before existing child triggers touch object rows.
  -- This preserves delete/reinsert semantics without reversing publication lock order.
  PERFORM pg_advisory_xact_lock_shared(741126,1);gen:=api.thesaurus_generation();
  FOR f IN SELECT * FROM jsonb_array_elements(TG_ARGV[0]::jsonb)LOOP
    keyj:='{}';oldkey:='{}';
    FOR k IN SELECT * FROM jsonb_array_elements(f->'keys')LOOP
      keyj:=keyj||jsonb_build_object(k->>'target',j->(k->>'local'));oldkey:=oldkey||jsonb_build_object(k->>'target',oldj->(k->>'local'));
    END LOOP;
    IF EXISTS(SELECT 1 FROM jsonb_each(keyj)x WHERE x.value='null'::jsonb)THEN CONTINUE;END IF;
    IF TG_OP='UPDATE'AND keyj=oldkey THEN CONTINUE;END IF;
    FOR c IN SELECT c.*,s.payload FROM thesaurus.concept c JOIN thesaurus.source_rows s ON(s.source_kind,s.source_id,s.domain)=(c.source_kind,c.source_id,c.domain)JOIN thesaurus.vocabulary v ON v.domain=c.domain AND v.is_governed WHERE c.source_kind=f->>'kind'AND(f->>'domain'IS NULL OR c.domain=f->>'domain')AND s.source_key@>keyj LOOP
      FOREACH obj IN ARRAY objects LOOP
      IF TG_OP='DELETE'THEN
        INSERT INTO thesaurus.assignment_retention(transaction_id,table_oid,object_id,concept_id)VALUES(txid_current(),TG_RELID,obj,c.concept_id)ON CONFLICT DO NOTHING;
      ELSIF NOT EXISTS(SELECT 1 FROM thesaurus.assignment_retention ar WHERE ar.transaction_id=txid_current()AND ar.table_oid=TG_RELID AND ar.object_id=obj AND ar.concept_id=c.concept_id)THEN
        PERFORM pg_advisory_xact_lock_shared(741126,1);
        IF c.lifecycle<>'active'OR NOT c.assignable OR NOT COALESCE((c.payload->>'is_active')::boolean,true)
          OR COALESCE((c.payload->>'valid_from')::date,current_date)>current_date OR COALESCE((c.payload->>'valid_to')::date,current_date)<current_date
          OR NOT EXISTS(SELECT 1 FROM thesaurus.release_concept rc WHERE rc.release_id=gen AND rc.concept_id=c.concept_id)THEN
          RAISE EXCEPTION 'Concept is historical or not yet published; keep its existing assignment or choose an active concept' USING ERRCODE='23514';
        END IF;
      END IF;
      END LOOP;
    END LOOP;
  END LOOP;
  RETURN CASE WHEN TG_OP='DELETE'THEN OLD ELSE NEW END;
END $$;

DO $assignment_triggers$ DECLARE t record;spec jsonb;BEGIN
  FOR t IN SELECT DISTINCT con.conrelid,ns.nspname,cl.relname FROM pg_constraint con JOIN pg_class cl ON cl.oid=con.conrelid JOIN pg_namespace ns ON ns.oid=cl.relnamespace JOIN pg_class target ON target.oid=con.confrelid
    WHERE con.contype='f'AND ns.nspname='public'
    AND(target.relname IN('ref_code','ref_amenity','ref_classification_scheme','ref_classification_value','ref_language','ref_commune','ref_sustainability_action','ref_sustainability_action_category')OR EXISTS(SELECT 1 FROM pg_inherits i WHERE i.inhrelid=target.oid AND i.inhparent='public.ref_code'::regclass))
  LOOP
    SELECT jsonb_agg(DISTINCT jsonb_build_object('kind',CASE target.relname WHEN'ref_amenity'THEN'amenity'WHEN'ref_classification_scheme'THEN'classification_scheme'WHEN'ref_classification_value'THEN'classification_value'WHEN'ref_language'THEN'language'WHEN'ref_commune'THEN'commune'WHEN'ref_sustainability_action'THEN'sustainability_action'WHEN'ref_sustainability_action_category'THEN'sustainability_category'ELSE'ref_code'END,
      'domain',CASE WHEN target.relispartition THEN substring(pg_get_expr(target.relpartbound,target.oid)FROM'''([^'']+)''')END,
      'keys',(SELECT jsonb_agg(jsonb_build_object('local',la.attname,'target',ra.attname)ORDER BY u.ord)FROM unnest(con.conkey,con.confkey)WITH ORDINALITY u(l,r,ord)JOIN pg_attribute la ON la.attrelid=con.conrelid AND la.attnum=u.l JOIN pg_attribute ra ON ra.attrelid=con.confrelid AND ra.attnum=u.r)))INTO spec
    FROM pg_constraint con JOIN pg_class target ON target.oid=con.confrelid WHERE con.conrelid=t.conrelid AND con.contype='f'
      AND(target.relname IN('ref_code','ref_amenity','ref_classification_scheme','ref_classification_value','ref_language','ref_commune','ref_sustainability_action','ref_sustainability_action_category')OR EXISTS(SELECT 1 FROM pg_inherits i WHERE i.inhrelid=target.oid AND i.inhparent='public.ref_code'::regclass));
    EXECUTE format('DROP TRIGGER IF EXISTS thesaurus_assignment_guard ON %I.%I',t.nspname,t.relname);
    EXECUTE format('CREATE TRIGGER thesaurus_assignment_guard BEFORE INSERT OR UPDATE OR DELETE ON %I.%I FOR EACH ROW EXECUTE FUNCTION thesaurus.guard_assignment(%L)',t.nspname,t.relname,spec::text);
  END LOOP;
END $assignment_triggers$;

-- Private workspace: explicit publisher-only RLS; application access is through gated RPCs.
DO $private_rls$DECLARE t record;BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='thesaurus'LOOP
    EXECUTE format('ALTER TABLE thesaurus.%I ENABLE ROW LEVEL SECURITY',t.tablename);
    EXECUTE format('DROP POLICY IF EXISTS publisher_only ON thesaurus.%I',t.tablename);
    EXECUTE format('CREATE POLICY publisher_only ON thesaurus.%I FOR ALL TO bertel_thesaurus_publisher USING(true)WITH CHECK(true)',t.tablename);
  END LOOP;
END $private_rls$;
REVOKE ALL ON ALL TABLES IN SCHEMA thesaurus FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA thesaurus FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA thesaurus TO bertel_thesaurus_publisher;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA thesaurus TO bertel_thesaurus_publisher;
GRANT SELECT ON public.ref_code_domain_registry TO bertel_thesaurus_publisher;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.ref_code_taxonomy_closure TO bertel_thesaurus_publisher;
DROP POLICY IF EXISTS thesaurus_publisher ON public.ref_code_taxonomy_closure;
CREATE POLICY thesaurus_publisher ON public.ref_code_taxonomy_closure FOR ALL TO bertel_thesaurus_publisher USING(true)WITH CHECK(true);
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA api TO bertel_thesaurus_publisher;
DO $maintain$BEGIN
  IF to_regclass('internal.mv_ref_data_json')IS NOT NULL THEN GRANT MAINTAIN ON TABLE internal.mv_ref_data_json TO bertel_thesaurus_publisher;END IF;
  IF to_regclass('internal.mv_filtered_objects')IS NOT NULL THEN GRANT MAINTAIN ON TABLE internal.mv_filtered_objects TO bertel_thesaurus_publisher;END IF;
END $maintain$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA thesaurus FROM PUBLIC;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA thesaurus TO bertel_thesaurus_publisher;
GRANT EXECUTE ON FUNCTION thesaurus.is_governed(text)TO anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION thesaurus.admin_dispatch(text,jsonb)TO authenticated;
GRANT EXECUTE ON FUNCTION thesaurus.public_dispatch(text,bigint,jsonb)TO service_role;
GRANT CREATE ON SCHEMA thesaurus TO bertel_thesaurus_publisher;
ALTER FUNCTION thesaurus.activate(uuid[],text[],text,bigint,jsonb)OWNER TO bertel_thesaurus_publisher;
REVOKE CREATE ON SCHEMA thesaurus FROM bertel_thesaurus_publisher;
GRANT EXECUTE ON FUNCTION thesaurus.activate(uuid[],text[],text,bigint,jsonb)TO postgres;
COMMENT ON FUNCTION api.thesaurus_admin(text,jsonb)IS'Thesaurus editorial actions, gated platform superuser, optimistic revisions and atomic publisher-role release.';
COMMENT ON FUNCTION api.thesaurus_public(text,bigint,jsonb)IS'Partner-only immutable thesaurus release reader. No direct editorial table access.';
NOTIFY pgrst,'reload schema';
COMMIT;

