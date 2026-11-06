-- Prepare canonical projections outside the editor fence; validate every concurrent owner mutation before the atomic release.
BEGIN;
DO $publisher_membership$BEGIN
  EXECUTE format('GRANT bertel_thesaurus_publisher TO %I WITH INHERIT TRUE,SET TRUE',current_user);
END $publisher_membership$;
GRANT CREATE ON SCHEMA thesaurus TO bertel_thesaurus_publisher;
-- Prepared-publication kernel. Assembled by the release migration; no transaction boundary here.
CREATE TABLE IF NOT EXISTS thesaurus.mutation_journal(
  top_xid xid8 NOT NULL,
  owner_id text NOT NULL CHECK(owner_id<>''),
  PRIMARY KEY(top_xid,owner_id)
);
CREATE INDEX IF NOT EXISTS mutation_journal_owner_xid_idx ON thesaurus.mutation_journal(owner_id,top_xid);
ALTER TABLE thesaurus.mutation_journal ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON thesaurus.mutation_journal FROM PUBLIC,anon,authenticated,service_role,bertel_thesaurus_publisher;
GRANT SELECT,DELETE ON thesaurus.mutation_journal TO bertel_thesaurus_publisher;
DROP POLICY IF EXISTS publisher_read ON thesaurus.mutation_journal;
CREATE POLICY publisher_read ON thesaurus.mutation_journal FOR SELECT TO bertel_thesaurus_publisher USING(current_user='bertel_thesaurus_publisher');
DROP POLICY IF EXISTS publisher_delete ON thesaurus.mutation_journal;
CREATE POLICY publisher_delete ON thesaurus.mutation_journal FOR DELETE TO bertel_thesaurus_publisher USING(current_user='bertel_thesaurus_publisher');

CREATE OR REPLACE FUNCTION thesaurus.owns_preparation_lock(p_key integer,p_exclusive boolean DEFAULT true)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory'AND pid=pg_backend_pid()
   AND classid=741126 AND objid=p_key AND objsubid=2 AND granted
   AND (NOT p_exclusive OR mode='ExclusiveLock'))
$$;

CREATE OR REPLACE FUNCTION thesaurus.take_source_gate()RETURNS void LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,thesaurus AS $$
BEGIN
  -- A canonical writer already holding S1 must never wait for S2 behind a
  -- publisher which holds X2 and is about to request X1.
  IF thesaurus.owns_preparation_lock(1,false)THEN
    IF NOT pg_try_advisory_xact_lock_shared(741126,2)THEN
      RAISE EXCEPTION 'Vocabulary preparation changed; retry the complete transaction' USING ERRCODE='PT409';
    END IF;
  ELSE
    PERFORM pg_advisory_xact_lock_shared(741126,2);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION thesaurus.take_writer_gate()RETURNS void LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,thesaurus AS $$
BEGIN
  -- The backend lock test survives a SECURITY DEFINER source callback: changing
  -- current_user cannot authorize an early write to an owned canonical row.
  IF thesaurus.owns_preparation_lock(2)AND NOT thesaurus.owns_preparation_lock(1)THEN
    RAISE EXCEPTION 'Owned source side effect is forbidden during publication preparation' USING ERRCODE='PT409';
  END IF;
  IF current_user='bertel_thesaurus_publisher'THEN
    IF NOT thesaurus.owns_preparation_lock(1)THEN
      RAISE EXCEPTION 'Publisher object writes require the exclusive publication fence' USING ERRCODE='42501';
    END IF;
  ELSE
    PERFORM pg_advisory_xact_lock_shared(741126,1);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION thesaurus.write_fence()RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,thesaurus AS $$
BEGIN PERFORM thesaurus.take_writer_gate();RETURN NULL;END $$;

CREATE OR REPLACE FUNCTION thesaurus.source_write_gate()RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,thesaurus AS $$
BEGIN PERFORM thesaurus.take_source_gate();RETURN NULL;END $$;

-- Extend the existing, reviewed recursive walker in-place: preserve its OID and
-- all direct/nested/FK/cascade/actor retention behavior.
DO $walker$
DECLARE definition text;body text;marker text;extra text;
BEGIN
 SELECT pg_get_functiondef(oid),prosrc INTO definition,body FROM pg_proc
 WHERE oid='thesaurus.object_ids_for_row(oid,jsonb,oid[],integer)'::regprocedure;
 IF position('prepared polymorphic owners'IN body)=0 THEN
   marker:='  IF p_row IS NULL OR p_depth>8 OR p_table=ANY(p_visited)THEN RETURN ids;END IF;';
   IF position(marker IN body)=0 THEN RAISE EXCEPTION 'Reviewed ownership walker shape changed';END IF;
   extra:=$extra$
  -- prepared polymorphic owners
  IF p_table='public.tag_link'::regclass THEN
    IF p_row->>'target_table'='object'AND NULLIF(p_row->>'target_pk','')IS NOT NULL THEN RETURN ARRAY[p_row->>'target_pk'];END IF;
    RETURN ids;
  END IF;
  IF p_table='public.ref_tag'::regclass THEN
    SELECT COALESCE(array_agg(DISTINCT tl.target_pk ORDER BY tl.target_pk),'{}')INTO ids
    FROM public.tag_link tl WHERE tl.tag_id=(p_row->>'id')::uuid AND tl.target_table='object'AND NULLIF(tl.target_pk,'')IS NOT NULL;
    RETURN ids;
  END IF;
$extra$;
   EXECUTE replace(definition,body,replace(body,marker,marker||extra));
 END IF;
END $walker$;

CREATE OR REPLACE FUNCTION thesaurus.record_owner_mutation()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,thesaurus,public AS $$
DECLARE oldj jsonb;newj jsonb;owners text[]:='{}';owner text;
BEGIN
 -- Version snapshots are derived history, never an input to the nine canonical
 -- projections. Keep their K1 fence and installed receipt trigger, but avoid
 -- turning an otherwise irrelevant object-name edit into a false conflict.
 -- Match the native OID and genuine partitions, never a table-name pattern.
 IF TG_RELID='public.object_version'::regclass
   OR pg_partition_root(TG_RELID)='public.object_version'::regclass THEN
   RETURN CASE WHEN TG_OP='DELETE'THEN OLD ELSE NEW END;
 END IF;
 oldj:=CASE WHEN TG_OP<>'INSERT'THEN to_jsonb(OLD)END;
 newj:=CASE WHEN TG_OP<>'DELETE'THEN to_jsonb(NEW)END;
 IF TG_OP='UPDATE'THEN
   -- The nine canonical projection expressions read object only via w.id.
   -- This exception is guarded by assert_preparation_contract, including the
   -- source SQL and support UDFs; cron/cache/name/status updates are not inputs.
   IF TG_RELID='public.object'::regclass AND oldj->'id'IS NOT DISTINCT FROM newj->'id'THEN RETURN NEW;END IF;
   IF TG_RELID<>'public.object'::regclass AND(oldj-'created_at'-'updated_at')IS NOT DISTINCT FROM(newj-'created_at'-'updated_at')THEN RETURN NEW;END IF;
 END IF;
 IF oldj IS NOT NULL THEN owners:=owners||thesaurus.object_ids_for_row(TG_RELID,oldj);END IF;
 IF newj IS NOT NULL THEN owners:=owners||thesaurus.object_ids_for_row(TG_RELID,newj);END IF;
 FOR owner IN SELECT DISTINCT x FROM unnest(owners)x WHERE NULLIF(x,'')IS NOT NULL LOOP
   INSERT INTO thesaurus.mutation_journal(top_xid,owner_id)VALUES(pg_current_xact_id(),owner)ON CONFLICT DO NOTHING;
 END LOOP;
 RETURN CASE WHEN TG_OP='DELETE'THEN OLD ELSE NEW END;
END $$;
ALTER FUNCTION thesaurus.record_owner_mutation()OWNER TO postgres;

CREATE OR REPLACE FUNCTION thesaurus.guard_prepared_truncate()RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,thesaurus,api AS $$
BEGIN
 -- TRUNCATE already holds relation locks when this trigger runs. Never block
 -- waiting for X2: a preparer could need the relation we currently lock.
 IF NOT pg_try_advisory_xact_lock_shared(741126,2)THEN
   RAISE EXCEPTION 'TRUNCATE is forbidden during publication preparation' USING ERRCODE='PT409';
 END IF;
 IF api.thesaurus_generation()IS NOT NULL THEN
   RAISE EXCEPTION 'TRUNCATE is forbidden after vocabulary activation' USING ERRCODE='42501';
 END IF;
 PERFORM thesaurus.take_writer_gate();
 RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION thesaurus.preparation_sources()RETURNS TABLE(table_oid oid)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
 WITH RECURSIVE sources(id)AS(
   SELECT unnest(ARRAY[
     'public.ref_code'::regclass,'public.ref_amenity'::regclass,
     'public.ref_classification_scheme'::regclass,'public.ref_classification_value'::regclass,
     'public.ref_language'::regclass,'public.ref_commune'::regclass,
     'public.ref_sustainability_action'::regclass,'public.ref_sustainability_action_category'::regclass,
     'public.ref_code_taxonomy_closure'::regclass,'public.ref_code_domain_registry'::regclass,'public.ref_catalog_registry'::regclass,
     'thesaurus.instance'::regclass,'thesaurus.vocabulary'::regclass,'thesaurus.concept'::regclass,
     'thesaurus.source_link'::regclass,'thesaurus.localized_field'::regclass,'thesaurus.label'::regclass,
     'thesaurus.note'::regclass,'thesaurus.mapping'::regclass,'thesaurus.relation'::regclass])::oid
   UNION SELECT i.inhrelid FROM pg_inherits i JOIN sources s ON s.id=i.inhparent)
 SELECT DISTINCT id FROM sources
$$;

CREATE OR REPLACE FUNCTION thesaurus.preparation_owned_tables()RETURNS TABLE(table_oid oid)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
 WITH RECURSIVE owned(id)AS(
   SELECT c.oid FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
   WHERE ns.nspname='public'AND c.relkind IN('r','p')
     AND(c.relname IN('object','actor','tag_link','ref_tag')
       OR EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attname='object_id'AND NOT a.attisdropped))
   UNION SELECT edge.child FROM owned parent JOIN(
     SELECT con.conrelid child,con.confrelid parent FROM pg_constraint con
       JOIN pg_class child ON child.oid=con.conrelid JOIN pg_namespace ns ON ns.oid=child.relnamespace
       WHERE con.contype='f'AND ns.nspname='public'AND child.relkind IN('r','p')AND child.relname NOT LIKE'ref\_%'
     UNION SELECT i.inhrelid,i.inhparent FROM pg_inherits i
   )edge ON edge.parent=parent.id)
 SELECT DISTINCT id FROM owned
$$;

-- Restrict UPDATE SET to values which really change after conversion to the
-- native row type. Setting an unchanged referenced UNIQUE column still requests
-- FOR UPDATE and would needlessly block ordinary FK writers during preparation.
DO $changed_source_set$
DECLARE definition text;body text;old_line text;new_line text;
BEGIN
 SELECT pg_get_functiondef(oid),prosrc INTO definition,body FROM pg_proc WHERE oid='thesaurus.apply_source(uuid,jsonb)'::regprocedure;
 IF position('typed_source_update'IN body)=0 THEN
   old_line:='DECLARE c thesaurus.concept%ROWTYPE;s record;tbl text;pk text;allowed text[];cols text;merged jsonb;parent_source text;exists_row boolean;';
   IF position(old_line IN body)=0 THEN RAISE EXCEPTION 'Reviewed native source writer declaration changed';END IF;
   body:=replace(body,old_line,replace(old_line,'exists_row boolean;','exists_row boolean;typed_source_update jsonb;'));
   old_line:='    SELECT string_agg(format(''%1$I=x.%1$I'',a.attname),'',''ORDER BY a.attnum)INTO cols FROM pg_attribute a WHERE a.attrelid=format(''public.%I'',tbl)::regclass AND a.attnum>0 AND NOT a.attisdropped AND a.attgenerated='''' AND a.attname=ANY(allowed);';
   IF position(old_line IN body)=0 THEN RAISE EXCEPTION 'Reviewed native source UPDATE shape changed';END IF;
   new_line:=$line$
    EXECUTE format('SELECT to_jsonb(x)FROM jsonb_populate_record(NULL::public.%I,$1)x',tbl)INTO typed_source_update USING merged;
    SELECT string_agg(format('%1$I=x.%1$I',a.attname),','ORDER BY a.attnum)INTO cols FROM pg_attribute a
      WHERE a.attrelid=format('public.%I',tbl)::regclass AND a.attnum>0 AND NOT a.attisdropped AND a.attgenerated=''
        AND a.attname=ANY(allowed)AND s.payload->a.attname IS DISTINCT FROM typed_source_update->a.attname;
    IF cols IS NULL THEN RETURN;END IF;
$line$;
   body:=replace(body,old_line,new_line);
   SELECT replace(pg_get_functiondef(oid),prosrc,body)INTO definition FROM pg_proc WHERE oid='thesaurus.apply_source(uuid,jsonb)'::regprocedure;
   EXECUTE definition;
 END IF;
END $changed_source_set$;

DO $kernel_triggers$
DECLARE t record;parent_trigger oid;
BEGIN
 FOR t IN SELECT p.table_oid,c.relkind FROM thesaurus.preparation_owned_tables()p JOIN pg_class c ON c.oid=p.table_oid ORDER BY c.relispartition,c.oid LOOP
   EXECUTE format('DROP TRIGGER IF EXISTS thesaurus_write_fence ON %s',t.table_oid::regclass);
   EXECUTE format('CREATE TRIGGER thesaurus_write_fence BEFORE INSERT OR UPDATE OR DELETE ON %s FOR EACH STATEMENT EXECUTE FUNCTION thesaurus.write_fence()',t.table_oid::regclass);
   SELECT tgparentid INTO parent_trigger FROM pg_trigger WHERE tgrelid=t.table_oid AND tgname='thesaurus_mutation_journal'AND NOT tgisinternal;
   IF COALESCE(parent_trigger,0)=0 THEN
     EXECUTE format('DROP TRIGGER IF EXISTS thesaurus_mutation_journal ON %s',t.table_oid::regclass);
     EXECUTE format('CREATE TRIGGER thesaurus_mutation_journal BEFORE INSERT OR UPDATE OR DELETE ON %s FOR EACH ROW WHEN(current_user<>''bertel_thesaurus_publisher'')EXECUTE FUNCTION thesaurus.record_owner_mutation()',t.table_oid::regclass);
   END IF;
   EXECUTE format('DROP TRIGGER IF EXISTS thesaurus_prepared_truncate ON %s',t.table_oid::regclass);
   EXECUTE format('CREATE TRIGGER thesaurus_prepared_truncate BEFORE TRUNCATE ON %s FOR EACH STATEMENT EXECUTE FUNCTION thesaurus.guard_prepared_truncate()',t.table_oid::regclass);
 END LOOP;
 FOR t IN SELECT table_oid FROM thesaurus.preparation_sources()LOOP
   EXECUTE format('DROP TRIGGER IF EXISTS thesaurus_source_gate ON %s',t.table_oid::regclass);
   EXECUTE format('CREATE TRIGGER thesaurus_source_gate BEFORE INSERT OR UPDATE OR DELETE ON %s FOR EACH STATEMENT EXECUTE FUNCTION thesaurus.source_write_gate()',t.table_oid::regclass);
   EXECUTE format('DROP TRIGGER IF EXISTS thesaurus_prepared_truncate ON %s',t.table_oid::regclass);
   EXECUTE format('CREATE TRIGGER thesaurus_prepared_truncate BEFORE TRUNCATE ON %s FOR EACH STATEMENT EXECUTE FUNCTION thesaurus.guard_prepared_truncate()',t.table_oid::regclass);
 END LOOP;
END $kernel_triggers$;

-- The immutable registry is source-controlled SQL, not editable application data.
-- A future function, view, partition or ownership shape change fails closed until
-- a migration reviews and reinstalls the preparation contract.
CREATE OR REPLACE FUNCTION thesaurus.preparation_projection_dependencies()RETURNS TABLE(table_oid oid)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
 SELECT unnest(ARRAY[
 'public.object'::regclass,'public.object_amenity'::regclass,'public.ref_amenity'::regclass,
 'public.object_payment_method'::regclass,'public.ref_code_payment_method'::regclass,
 'public.object_environment_tag'::regclass,'public.ref_code_environment_tag'::regclass,
 'public.object_language'::regclass,'public.ref_language'::regclass,'public.object_classification'::regclass,
 'public.ref_classification_scheme'::regclass,'public.ref_classification_value'::regclass,
 'public.object_taxonomy'::regclass,'public.ref_code_taxonomy_closure'::regclass,'public.ref_code'::regclass,
 'public.tag_link'::regclass,'public.ref_tag'::regclass,'public.object_cuisine_type'::regclass,'public.ref_code_cuisine_type'::regclass,
 'public.object_menu'::regclass,'public.object_menu_item'::regclass,'public.object_menu_item_dietary_tag'::regclass,
 'public.ref_code_dietary_tag'::regclass,'public.object_menu_item_allergen'::regclass,'public.ref_code_allergen'::regclass,
 'public.object_description'::regclass])::oid
$$;

CREATE OR REPLACE FUNCTION thesaurus.preparation_plain_key_columns(p_table oid)RETURNS text[]
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
 SELECT COALESCE(array_agg(DISTINCT a.attname::text ORDER BY a.attname::text),'{}')
 FROM pg_index i CROSS JOIN LATERAL unnest(i.indkey)WITH ORDINALITY k(attnum,position)
 JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.attnum
 WHERE i.indrelid=p_table AND i.indisunique AND i.indimmediate AND i.indisvalid
   AND i.indpred IS NULL AND i.indexprs IS NULL AND k.position<=i.indnkeyatts
$$;

DO $contract_registry$
DECLARE value jsonb;keys jsonb;
BEGIN
 SELECT jsonb_object_agg(signature,md5(pg_get_functiondef(signature::regprocedure)))INTO value FROM unnest(ARRAY[
   'api.refresh_object_filter_caches(text)','api.strip_markdown(text)','api.phonetic_document(text)','public.immutable_unaccent(text)',
   'thesaurus.object_ids_for_row(oid,jsonb,oid[],integer)','thesaurus.apply_source(uuid,jsonb)',
   'thesaurus.owns_preparation_lock(integer,boolean)','thesaurus.take_source_gate()','thesaurus.take_writer_gate()',
   'thesaurus.write_fence()','thesaurus.source_write_gate()','thesaurus.record_owner_mutation()','thesaurus.guard_prepared_truncate()'
 ])signature;
 SELECT jsonb_object_agg(name,to_jsonb(thesaurus.preparation_plain_key_columns(name::regclass)))INTO keys
 FROM unnest(ARRAY['public.ref_code','public.ref_amenity','public.ref_classification_scheme','public.ref_classification_value','public.ref_language','public.ref_commune','public.ref_sustainability_action','public.ref_sustainability_action_category'])name;
 IF EXISTS(SELECT 1 FROM jsonb_each(keys)t CROSS JOIN LATERAL jsonb_array_elements_text(t.value)k WHERE k.value<>ALL(ARRAY['id','code','domain','insee_code','scheme_id','category_id']))THEN
   RAISE EXCEPTION 'A native source has an unreviewed plain UNIQUE key column';
 END IF;
 EXECUTE format('CREATE OR REPLACE FUNCTION thesaurus.preparation_contract_registry()RETURNS jsonb LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog AS %L',
   'SELECT '||quote_literal(jsonb_build_object('functions',value,'keys',keys)::text)||'::jsonb');
END $contract_registry$;

CREATE OR REPLACE FUNCTION thesaurus.assert_preparation_contract()RETURNS void LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,thesaurus,public AS $$
DECLARE contract jsonb;item record;t record;body text;core text;part text[];read_relation text;
BEGIN
 contract:=thesaurus.preparation_contract_registry();
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid='thesaurus.record_owner_mutation()'::regprocedure
   AND prosecdef AND pg_get_userbyid(proowner)='postgres'AND proconfig=ARRAY['search_path=pg_catalog, thesaurus, public'])THEN
   RAISE EXCEPTION 'Mutation journal trigger must retain its trusted owner and search path' USING ERRCODE='PT503';
 END IF;
 FOR item IN SELECT key,value#>>'{}' expected FROM jsonb_each(contract->'functions')LOOP
   IF to_regprocedure(item.key)IS NULL OR md5(pg_get_functiondef(item.key::regprocedure))IS DISTINCT FROM item.expected THEN
     RAISE EXCEPTION 'Prepared publication support function changed: %',item.key USING ERRCODE='PT503';
   END IF;
 END LOOP;
 FOR item IN SELECT key,value FROM jsonb_each(contract->'keys')LOOP
   IF to_jsonb(thesaurus.preparation_plain_key_columns(item.key::regclass))IS DISTINCT FROM item.value THEN
     RAISE EXCEPTION 'Prepared publication source key contract changed: %',item.key USING ERRCODE='PT503';
   END IF;
 END LOOP;
 SELECT replace(prosrc,E'\r','')INTO body FROM pg_proc WHERE oid='api.refresh_object_filter_caches(text)'::regprocedure;
 core:='';
 FOR part IN SELECT regexp_matches(body,E'  SELECT (COALESCE\\(\\(.*?)\\n  INTO v_(cached_[a-z_]+);','gs')LOOP core:=core||part[1];END LOOP;
 core:=core||substring(body FROM strpos(body,'  WITH doc AS (')FOR strpos(body,'  FROM norm doc;')+length('  FROM norm doc')-strpos(body,'  WITH doc AS ('));
 core:=regexp_replace(core,'--[^\n]*','','g');
 IF core=''OR core~*'(^|[^a-z_])(FROM|JOIN)[[:space:]]+("?public"?[.])?"?object"?([[:space:]]|[,)]|$)'THEN
   RAISE EXCEPTION 'Prepared projection may read object only through its supplied owner id' USING ERRCODE='PT503';
 END IF;
 -- Every actual native relation token must occur in the 26 reviewed bindings.
 FOR part IN SELECT regexp_matches(core,'(?:FROM|JOIN)[[:space:]]+([a-z_][a-z_0-9.]*)','gi')LOOP
   read_relation:=part[1];
   IF read_relation IN('doc','norm','jsonb_array_elements')THEN CONTINUE;END IF;
   IF to_regclass(CASE WHEN position('.'IN read_relation)>0 THEN read_relation ELSE 'public.'||read_relation END)IS NULL
     OR NOT EXISTS(SELECT 1 FROM thesaurus.preparation_projection_dependencies()d WHERE d.table_oid=to_regclass(CASE WHEN position('.'IN read_relation)>0 THEN read_relation ELSE 'public.'||read_relation END))THEN
     RAISE EXCEPTION 'Unreviewed prepared projection relation: %',read_relation USING ERRCODE='PT503';
   END IF;
 END LOOP;
 FOR t IN SELECT d.table_oid,c.relkind FROM thesaurus.preparation_projection_dependencies()d JOIN pg_class c ON c.oid=d.table_oid LOOP
   IF t.relkind NOT IN('r','p')OR NOT EXISTS(
     SELECT 1 FROM thesaurus.preparation_sources()s WHERE s.table_oid=t.table_oid
     UNION ALL SELECT 1 FROM thesaurus.preparation_owned_tables()w WHERE w.table_oid=t.table_oid
   )THEN
     RAISE EXCEPTION 'Projection input is outside the reviewed native/owned registry: %',t.table_oid::regclass USING ERRCODE='PT503';
   END IF;
 END LOOP;
 FOR t IN SELECT table_oid FROM thesaurus.preparation_owned_tables()LOOP
   IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=t.table_oid AND tgname='thesaurus_write_fence'AND tgfoid='thesaurus.write_fence()'::regprocedure AND tgtype=30 AND tgenabled='O'AND NOT tgisinternal)
    OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=t.table_oid AND tgname='thesaurus_mutation_journal'AND tgfoid='thesaurus.record_owner_mutation()'::regprocedure AND tgtype=31 AND tgenabled='O'AND NOT tgisinternal AND pg_get_expr(tgqual,tgrelid)=$guard$(CURRENT_USER <> 'bertel_thesaurus_publisher'::name)$guard$)THEN
     RAISE EXCEPTION 'Owned input gate/journal is missing or changed: %',t.table_oid::regclass USING ERRCODE='PT503';
   END IF;
 END LOOP;
 FOR t IN SELECT table_oid FROM thesaurus.preparation_sources()LOOP
   IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=t.table_oid AND tgname='thesaurus_source_gate'AND tgfoid='thesaurus.source_write_gate()'::regprocedure AND tgtype=30 AND tgenabled='O'AND NOT tgisinternal)THEN
     RAISE EXCEPTION 'Source preparation gate is missing or changed: %',t.table_oid::regclass USING ERRCODE='PT503';
   END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM(
   SELECT table_oid FROM thesaurus.preparation_owned_tables()UNION SELECT table_oid FROM thesaurus.preparation_sources()
 )inputs WHERE NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=inputs.table_oid
   AND tgname='thesaurus_prepared_truncate'AND tgfoid='thesaurus.guard_prepared_truncate()'::regprocedure
   AND tgtype=34 AND tgenabled='O'AND NOT tgisinternal))THEN
   RAISE EXCEPTION 'Prepared input TRUNCATE guard is missing or changed' USING ERRCODE='PT503';
 END IF;
 IF has_table_privilege('anon','thesaurus.mutation_journal','SELECT')OR has_table_privilege('authenticated','thesaurus.mutation_journal','SELECT')
   OR has_table_privilege('bertel_thesaurus_publisher','thesaurus.mutation_journal','INSERT,UPDATE')THEN
   RAISE EXCEPTION 'Mutation journal privileges changed' USING ERRCODE='PT503';
 END IF;
END $$;

REVOKE ALL ON FUNCTION thesaurus.owns_preparation_lock(integer,boolean),thesaurus.take_source_gate(),thesaurus.take_writer_gate(),thesaurus.write_fence(),thesaurus.source_write_gate(),thesaurus.record_owner_mutation(),thesaurus.guard_prepared_truncate(),thesaurus.preparation_sources(),thesaurus.preparation_owned_tables(),thesaurus.preparation_projection_dependencies(),thesaurus.preparation_plain_key_columns(oid),thesaurus.preparation_contract_registry(),thesaurus.assert_preparation_contract()FROM PUBLIC;
GRANT EXECUTE ON FUNCTION thesaurus.owns_preparation_lock(integer,boolean),thesaurus.take_source_gate(),thesaurus.take_writer_gate()TO anon,authenticated,service_role,bertel_thesaurus_publisher;
GRANT EXECUTE ON FUNCTION thesaurus.preparation_sources(),thesaurus.preparation_owned_tables(),thesaurus.preparation_projection_dependencies(),thesaurus.preparation_plain_key_columns(oid),thesaurus.preparation_contract_registry(),thesaurus.assert_preparation_contract()TO bertel_thesaurus_publisher;

-- Component: pure prepared projections and atomic late activation.
-- The assembling migration owns the transaction and publisher ownership grants.

DO $prepare_projection$
DECLARE source text;normalized text;part text[];expressions text:='';columns text[]:='{}';search_sql text;query text;
BEGIN
  SELECT prosrc INTO STRICT source FROM pg_proc WHERE oid='api.refresh_object_filter_caches(text)'::regprocedure;
  normalized:=replace(source,E'\r','');
  FOR part IN SELECT regexp_matches(normalized,E'  SELECT (COALESCE\\(\\(.*?)\\n  INTO v_(cached_[a-z_]+);','gs')LOOP
    expressions:=expressions||CASE WHEN expressions=''THEN''ELSE','END||'('||replace(part[1],'p_object_id','w.id')||') AS '||quote_ident(part[2]);
    columns:=array_append(columns,part[2]);
  END LOOP;
  IF columns IS DISTINCT FROM ARRAY['cached_amenity_codes','cached_payment_codes','cached_environment_tags','cached_language_codes','cached_classification_codes','cached_taxonomy_codes']THEN
    RAISE EXCEPTION 'Canonical cache helper shape changed: review pure projection extraction';
  END IF;
  IF strpos(normalized,'  WITH doc AS (')=0 OR strpos(normalized,'  FROM norm doc;')=0 THEN
    RAISE EXCEPTION 'Canonical search CTE changed: review pure projection extraction';
  END IF;
  search_sql:=substring(normalized FROM strpos(normalized,'  WITH doc AS (')FOR strpos(normalized,'  FROM norm doc;')+length('  FROM norm doc')-strpos(normalized,'  WITH doc AS ('));
  search_sql:=replace(search_sql,E'  INTO v_search_document, v_search_document_text, v_search_document_phonetic\n','');
  IF strpos(search_sql,'INTO v_')>0 THEN RAISE EXCEPTION 'Canonical projection output changed';END IF;
  search_sql:=replace(replace(replace(search_sql,'p_object_id','w.id'),'WITH doc AS (','WITH doc AS MATERIALIZED ('),'norm AS (','norm AS MATERIALIZED (');
  query:='WITH projected AS MATERIALIZED(SELECT w.id,'||expressions||',d.* FROM unnest(p_object_ids)w(id)CROSS JOIN LATERAL('||search_sql||')d(search_document,search_document_text,search_document_phonetic))'
    ||'SELECT jsonb_build_object(''snapshot'',pg_current_snapshot()::text,''objects'',COALESCE(jsonb_agg(to_jsonb(projected)ORDER BY projected.id),''[]''::jsonb))INTO result FROM projected;';
  -- Both the MVCC snapshot and the nine-column objects are captured by this ONE
  -- SQL statement. No public.object read, UPDATE, temporary table or FK is used.
  EXECUTE format('CREATE OR REPLACE FUNCTION thesaurus.prepare_affected_objects(p_object_ids text[])RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,api,extensions SET jit=off SET plan_cache_mode=force_generic_plan AS %L',
    'DECLARE result jsonb;BEGIN '||query||'RETURN result;END');
END $prepare_projection$;

CREATE OR REPLACE FUNCTION thesaurus.apply_prepared_objects(p_stage jsonb,p_live_ids text[])
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,public,thesaurus SET jit=off SET plan_cache_mode=force_generic_plan
AS $apply_prepared$
BEGIN
  UPDATE public.object object SET
    cached_amenity_codes=prepared.cached_amenity_codes,
    cached_payment_codes=prepared.cached_payment_codes,
    cached_environment_tags=prepared.cached_environment_tags,
    cached_language_codes=prepared.cached_language_codes,
    cached_classification_codes=prepared.cached_classification_codes,
    cached_taxonomy_codes=prepared.cached_taxonomy_codes,
    search_document=prepared.search_document,
    search_document_text=prepared.search_document_text,
    search_document_phonetic=prepared.search_document_phonetic,
    updated_at=clock_timestamp()
  FROM jsonb_to_recordset(p_stage->'objects')AS prepared(
    id text,cached_amenity_codes text[],cached_payment_codes text[],
    cached_environment_tags text[],cached_language_codes text[],
    cached_classification_codes text[],cached_taxonomy_codes text[],
    search_document tsvector,search_document_text text,search_document_phonetic tsvector)
  WHERE object.id=prepared.id AND object.id=ANY(p_live_ids);
END $apply_prepared$;

CREATE OR REPLACE FUNCTION thesaurus.assert_current_authority()
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,public,api,auth,pg_temp
AS $authority$
DECLARE v_user_id uuid:=auth.uid();
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Platform superuser required' USING ERRCODE='42501';END IF;
  BEGIN
    PERFORM profile.id FROM public.app_user_profile profile WHERE profile.id=v_user_id FOR SHARE NOWAIT;
    IF NOT FOUND THEN RAISE EXCEPTION 'Platform superuser required' USING ERRCODE='42501';END IF;
  EXCEPTION WHEN lock_not_available THEN
    RAISE EXCEPTION 'Authorization is changing; retry publication' USING ERRCODE='PT409';
  END;
  -- A separate fresh SPI statement in this VOLATILE trusted function; no actor
  -- argument or JWT metadata can select a different profile for authorization.
  IF api.is_platform_superuser()IS NOT TRUE THEN
    RAISE EXCEPTION 'Platform superuser required' USING ERRCODE='42501';
  END IF;
END $authority$;
REVOKE ALL ON FUNCTION thesaurus.prepare_affected_objects(text[]),thesaurus.apply_prepared_objects(jsonb,text[]),thesaurus.assert_current_authority()FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION thesaurus.prepare_affected_objects(text[]),thesaurus.apply_prepared_objects(jsonb,text[]),thesaurus.assert_current_authority()TO bertel_thesaurus_publisher;

-- Preserve the reviewed activation algorithm. Every replacement is pinned to an
-- exact predecessor fragment; an unsupported deployment stops this migration.
DO $prepared_activation$
DECLARE original text;body text;definition text;needle text;replacement text;mv_block text;mv_start integer;mv_end integer;
BEGIN
  SELECT prosrc INTO STRICT original FROM pg_proc WHERE oid='thesaurus.activate(uuid[],text[],text,bigint,jsonb)'::regprocedure;
  body:=replace(original,E'\r','');
  IF strpos(body,'stage:=thesaurus.prepare_affected_objects(affected)')>0 THEN
    -- Repair the reviewed first draft on local/replayed installs as well.
    IF strpos(body,'journal.top_xid<>pg_current_xact_id()')=0 THEN
      needle:='WHERE journal.owner_id=ANY(stage_ids||late_ids)';
      IF length(body)-length(replace(body,needle,''))<>length(needle)THEN RAISE EXCEPTION 'Prepared journal predecessor changed';END IF;
      body:=replace(body,needle,needle||E'\n      AND journal.top_xid<>pg_current_xact_id()');
    END IF;
    needle:='  DELETE FROM thesaurus.mutation_journal WHERE pg_visible_in_snapshot(top_xid,prepared_snapshot);';
    replacement:='  wait_until:=clock_timestamp()+interval ''2 seconds'';';
    IF strpos(body,needle)>strpos(body,replacement)THEN
      IF strpos(body,replacement)=0 OR length(body)-length(replace(body,needle,''))<>length(needle)THEN RAISE EXCEPTION 'Prepared cleanup predecessor changed';END IF;
      body:=replace(body,needle,'');
      body:=replace(body,replacement,E'  -- Prune only snapshot-visible receipts under serialized X2, before K1.\n'||needle||E'\n'||replacement);
    END IF;
    IF body IS DISTINCT FROM original THEN
      definition:=pg_get_functiondef('thesaurus.activate(uuid[],text[],text,bigint,jsonb)'::regprocedure);
      EXECUTE replace(definition,original,body);
    END IF;
    RETURN;
  END IF;
  IF strpos(body,'thesaurus.publication_documents(document_dirty)')=0 THEN RAISE EXCEPTION 'Incremental activation predecessor required';END IF;

  needle:='count_changes integer;request_fp text;';
  IF length(body)-length(replace(body,needle,''))<>length(needle)THEN RAISE EXCEPTION 'Activation declaration predecessor changed';END IF;
  body:=replace(body,needle,needle||'stage jsonb;prepared_snapshot pg_snapshot;stage_ids text[];late_ids text[];wait_until timestamptz;');

  needle:=E'BEGIN\n  IF NULLIF(btrim(p_key)';
  IF length(body)-length(replace(body,needle,''))<>length(needle)THEN RAISE EXCEPTION 'Activation entry predecessor changed';END IF;
  replacement:=E'BEGIN\n  IF current_setting(''transaction_isolation'')<>''read committed''THEN RAISE EXCEPTION ''Thesaurus publication requires READ COMMITTED'' USING ERRCODE=''PT409'';END IF;\n  IF NULLIF(btrim(p_key)';
  body:=replace(body,needle,replacement);

  needle:='PERFORM thesaurus.refresh_affected_objects(''{}'');';
  IF length(body)-length(replace(body,needle,''))<>length(needle)THEN RAISE EXCEPTION 'Activation prewarm predecessor changed';END IF;
  body:=replace(body,needle,'PERFORM thesaurus.prepare_affected_objects(''{}'');');
  body:=replace(body,E'  -- The empty projection UPDATE touches no row and only its private publisher\n  -- skips the statement fence. It cannot update canonical object columns.\n',E'  -- Pure plan prewarming takes no object row lock or writer fence.\n');

  needle:='PERFORM pg_advisory_xact_lock(741126,1);';
  IF length(body)-length(replace(body,needle,''))<>length(needle)THEN RAISE EXCEPTION 'Activation early fence predecessor changed';END IF;
  replacement:=$early_gate$
IF EXISTS(SELECT 1 FROM pg_locks WHERE pid=pg_backend_pid()AND locktype='advisory'AND classid=741126 AND objid=1 AND objsubid=2 AND granted)THEN
    IF NOT pg_try_advisory_xact_lock(741126,2)THEN
      RAISE EXCEPTION 'Publication source gate conflicts with this writer transaction; retry' USING ERRCODE='PT409';
    END IF;
  ELSE
    PERFORM pg_advisory_xact_lock(741126,2);
  END IF;$early_gate$;
  body:=replace(body,needle,replacement);

  needle:='  SELECT * INTO inst FROM thesaurus.instance WHERE singleton FOR UPDATE;';
  IF length(body)-length(replace(body,needle,''))<>length(needle)THEN RAISE EXCEPTION 'Activation instance predecessor changed';END IF;
  body:=replace(body,needle,E'  PERFORM thesaurus.assert_preparation_contract();\n'||needle);

  needle:='PERFORM thesaurus.refresh_affected_objects(affected);';
  IF length(body)-length(replace(body,needle,''))<>length(needle)THEN RAISE EXCEPTION 'Activation projection predecessor changed';END IF;
  replacement:=$prepare_stage$
stage:=thesaurus.prepare_affected_objects(affected);
  prepared_snapshot:=(stage->>'snapshot')::pg_snapshot;
  SELECT COALESCE(array_agg(item->>'id'),'{}')INTO stage_ids FROM jsonb_array_elements(stage->'objects')item;$prepare_stage$;
  body:=replace(body,needle,replacement);

  mv_start:=strpos(body,'  IF COALESCE(cardinality(p_revision_ids),0)>0 THEN');
  mv_end:=strpos(body,'  INSERT INTO thesaurus.release(');
  IF mv_start=0 OR mv_end<=mv_start THEN RAISE EXCEPTION 'Activation materialized projection predecessor changed';END IF;
  mv_block:=substring(body FROM mv_start FOR mv_end-mv_start);
  IF strpos(mv_block,'REFRESH MATERIALIZED VIEW CONCURRENTLY internal.mv_ref_data_json')=0
    OR strpos(mv_block,'REFRESH MATERIALIZED VIEW CONCURRENTLY internal.mv_filtered_objects')=0 THEN
    RAISE EXCEPTION 'Both mandatory materialized projections must be retained';
  END IF;
  body:=overlay(body PLACING '' FROM mv_start FOR mv_end-mv_start);

  needle:='  SELECT count(*)INTO count_changes FROM thesaurus.release_change WHERE release_id=rid;';
  IF length(body)-length(replace(body,needle,''))<>length(needle)THEN RAISE EXCEPTION 'Activation finalization predecessor changed';END IF;
  replacement:=needle||$late_gate$

  -- All expensive source, cache, immutable-document, diff and checksum work is
  -- complete. Never queue an exclusive request that blocks arriving editors.
  -- X2 serializes prepared publications. Remove only receipts already visible
  -- in the stage snapshot; other in-progress/recent transactions remain intact.
  DELETE FROM thesaurus.mutation_journal WHERE pg_visible_in_snapshot(top_xid,prepared_snapshot);
  wait_until:=clock_timestamp()+interval '2 seconds';
  WHILE NOT pg_try_advisory_xact_lock(741126,1)LOOP
    IF clock_timestamp()>=wait_until THEN
      RAISE EXCEPTION 'Object writers are active; retry publication' USING ERRCODE='PT409';
    END IF;
    PERFORM pg_sleep(0.005);
  END LOOP;
  PERFORM thesaurus.assert_current_authority();
  PERFORM thesaurus.assert_preparation_contract();
  SELECT COALESCE(array_agg(DISTINCT owners.object_id),'{}')INTO late_ids
  FROM thesaurus.usage_objects(ids)owners JOIN public.object live ON live.id=owners.object_id;
  IF EXISTS(SELECT 1 FROM unnest(late_ids)owner_id WHERE NOT(owner_id=ANY(stage_ids)))THEN
    RAISE EXCEPTION 'A new affected object appeared during preparation; review and retry' USING ERRCODE='PT409';
  END IF;
  IF EXISTS(SELECT 1 FROM thesaurus.mutation_journal journal
    WHERE journal.owner_id=ANY(stage_ids||late_ids)
      -- Local mutations are already in preparation; later owned DML from this
      -- backend is prohibited while it holds X2 without X1.
      AND journal.top_xid<>pg_current_xact_id()
      AND NOT pg_visible_in_snapshot(journal.top_xid,prepared_snapshot))THEN
    RAISE EXCEPTION 'Affected object inputs changed during preparation; review and retry' USING ERRCODE='PT409';
  END IF;
  affected:=late_ids;
  UPDATE thesaurus.release SET affected_objects=cardinality(affected)WHERE release_id=rid;
  PERFORM thesaurus.apply_prepared_objects(stage,affected);
$late_gate$||mv_block;
  body:=replace(body,needle,replacement);

  definition:=pg_get_functiondef('thesaurus.activate(uuid[],text[],text,bigint,jsonb)'::regprocedure);
  IF strpos(definition,original)=0 THEN RAISE EXCEPTION 'Activation source could not be reconstructed';END IF;
  EXECUTE replace(definition,original,body);
END $prepared_activation$;

-- Source configuration observes the same K2 -> K1 ordering as native source DML.
DO $source_configuration$
DECLARE original text;definition text;needle text;
BEGIN
  SELECT prosrc INTO STRICT original FROM pg_proc WHERE oid='thesaurus.admin_dispatch(text,jsonb)'::regprocedure;
  IF strpos(original,E'IF p_action IN(''configure_instance'',''configure_domain'')THEN\n    PERFORM thesaurus.take_source_gate();')>0 THEN RETURN;END IF;
  needle:=E'IF p_action IN(''configure_instance'',''configure_domain'')THEN\n    PERFORM pg_advisory_xact_lock_shared(741126,1);';
  IF strpos(replace(original,E'\r',''),needle)=0 THEN RAISE EXCEPTION 'Source configuration fence predecessor changed';END IF;
  definition:=pg_get_functiondef('thesaurus.admin_dispatch(text,jsonb)'::regprocedure);
  EXECUTE replace(definition,original,replace(replace(original,E'\r',''),needle,
    E'IF p_action IN(''configure_instance'',''configure_domain'')THEN\n    PERFORM thesaurus.take_source_gate();\n    PERFORM pg_advisory_xact_lock_shared(741126,1);'));
END $source_configuration$;

-- Private bounded journal maintenance. The assembling migration owns BEGIN/COMMIT.
CREATE OR REPLACE FUNCTION thesaurus.prune_mutation_journal(p_limit integer DEFAULT 10000)
RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,thesaurus
AS $prune$
DECLARE visible_snapshot pg_snapshot;deleted integer;
BEGIN
  IF p_limit IS NULL OR p_limit<1 OR p_limit>100000 THEN
    RAISE EXCEPTION 'Journal pruning limit must be between 1 and 100000' USING ERRCODE='22023';
  END IF;
  -- A publication wins immediately. Shared K2 remains compatible with source
  -- writers, and this worker never queues a lock or takes the editor fence K1.
  IF NOT pg_try_advisory_xact_lock_shared(741126,2)THEN RETURN 0;END IF;
  visible_snapshot:=pg_current_snapshot();
  WITH obsolete AS MATERIALIZED(
    SELECT journal.ctid FROM thesaurus.mutation_journal journal
    WHERE pg_visible_in_snapshot(journal.top_xid,visible_snapshot)
    ORDER BY journal.top_xid,journal.owner_id LIMIT p_limit
  )
  DELETE FROM thesaurus.mutation_journal journal USING obsolete
  WHERE journal.ctid=obsolete.ctid;
  GET DIAGNOSTICS deleted=ROW_COUNT;
  RETURN deleted;
END $prune$;
ALTER FUNCTION thesaurus.prune_mutation_journal(integer)OWNER TO bertel_thesaurus_publisher;
REVOKE ALL ON FUNCTION thesaurus.prune_mutation_journal(integer)FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION thesaurus.prune_mutation_journal(integer)TO postgres;
COMMENT ON FUNCTION thesaurus.prune_mutation_journal(integer)IS
  'Private maintenance: nonblocking transaction shared K2, bounded deletion of snapshot-visible owner receipts; never locks the K1 editor fence.';

DO $schedule_pruning$
DECLARE existing_job bigint;
BEGIN
  IF EXISTS(SELECT 1 FROM pg_extension WHERE extname='pg_cron')THEN
    SELECT jobid INTO existing_job FROM cron.job WHERE jobname='bertel-thesaurus-journal-prune';
    IF existing_job IS NULL THEN
      PERFORM cron.schedule('bertel-thesaurus-journal-prune','*/15 * * * *',
        'SELECT thesaurus.prune_mutation_journal(10000)');
    ELSE
      PERFORM cron.alter_job(existing_job,schedule:='*/15 * * * *',
        command:='SELECT thesaurus.prune_mutation_journal(10000)',active:=true);
    END IF;
  ELSE
    RAISE NOTICE 'pg_cron unavailable locally; journal pruning requires the documented local maintenance worker';
  END IF;
END $schedule_pruning$;

ALTER FUNCTION thesaurus.prepare_affected_objects(text[])OWNER TO bertel_thesaurus_publisher;
ALTER FUNCTION thesaurus.apply_prepared_objects(jsonb,text[])OWNER TO bertel_thesaurus_publisher;
ALTER FUNCTION thesaurus.assert_current_authority()OWNER TO postgres;
REVOKE CREATE ON SCHEMA thesaurus FROM bertel_thesaurus_publisher;
SELECT thesaurus.assert_preparation_contract();
SET LOCAL ROLE bertel_thesaurus_publisher;
SELECT thesaurus.assert_preparation_contract();
RESET ROLE;
DO $publisher_invariants$BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='bertel_thesaurus_publisher'AND(rolcanlogin OR rolsuper OR rolbypassrls OR rolinherit))THEN
    RAISE EXCEPTION 'Publisher role must remain NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_auth_members membership JOIN pg_roles member ON member.oid=membership.member
    WHERE membership.roleid='bertel_thesaurus_publisher'::regrole AND member.rolname IN('anon','authenticated','service_role'))THEN
    RAISE EXCEPTION 'Application roles must never be publisher members';
  END IF;
END $publisher_invariants$;
DO $publisher_membership$BEGIN
  EXECUTE format('REVOKE INHERIT OPTION FOR bertel_thesaurus_publisher FROM %I',current_user);
  EXECUTE format('REVOKE SET OPTION FOR bertel_thesaurus_publisher FROM %I',current_user);
END $publisher_membership$;
COMMENT ON TABLE thesaurus.mutation_journal IS 'Private owner mutations keyed by top-level xid8; visible-snapshot pruning only under serialized publication. No FK to canonical objects.';
NOTIFY pgrst,'reload schema';
COMMIT;
