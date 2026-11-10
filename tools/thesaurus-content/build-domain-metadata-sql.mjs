import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// The reviewed dictionary is the single source for both upgrade and fresh apply.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const labels = JSON.parse(await readFile(path.join(root, 'tools/thesaurus-content/domain-labels.i18n.json'), 'utf8'));
const migration = process.argv[2];
if (!migration || !/^supabase\/migrations\/\d{14}_thesaurus_domain_metadata_localization\.sql$/.test(migration)) {
  throw new Error('Pass the relative migration path created by supabase migration new.');
}
const sql = `-- Frozen multilingual vocabulary metadata; no historical manifest or concept is rewritten.
-- Generated from tools/thesaurus-content/domain-labels.i18n.json.
DO $domain_metadata$
DECLARE
  names CONSTANT jsonb := $reviewed_names$
${JSON.stringify(labels, null, 2)}
$reviewed_names$::jsonb;
  original text; body text; prior_owner oid; prior_acl aclitem[]; prior_config text[];
  executor oid; executor_name text; had_executor_grant boolean;
  prior_admin boolean; prior_inherit boolean; prior_set boolean;
  memberships_before jsonb; memberships_after jsonb;
  prior_function jsonb;
  old_fields CONSTANT text := $old$'domain',v.domain,'name',v.name,'source_kind',v.source_kind$old$;
  new_fields CONSTANT text := $new$'domain',v.domain,'name',v.name,'name_i18n',v.name_i18n,'source_kind',v.source_kind$new$;
  old_update CONSTANT text := $old$  UPDATE thesaurus.release SET manifest=v_manifest,checksum=v_manifest->>'checksum' WHERE release_id=rid;$old$;
  new_update CONSTANT text := $new$  v_manifest:=v_manifest||jsonb_build_object('metadata_scope','release_snapshot','metadata_checksum',md5((v_manifest->'domains')::text));
  UPDATE thesaurus.release SET manifest=v_manifest,checksum=v_manifest->>'checksum' WHERE release_id=rid;$new$;
  old_meta CONSTANT text := $old$  meta:=jsonb_build_object('contract_version','1.0.0','release_id',rid,'previous_release_id',r.previous_release_id,'as_of',r.manifest->'as_of','checksum',r.checksum,'next_after',NULL);$old$;
  new_meta CONSTANT text := $new$  meta:=jsonb_build_object('contract_version','1.0.0','release_id',rid,'previous_release_id',r.previous_release_id,'as_of',r.manifest->'as_of','checksum',r.checksum,'next_after',NULL);
  IF r.manifest ? 'metadata_checksum' THEN
    meta:=meta||jsonb_build_object('metadata_checksum',r.manifest->'metadata_checksum');
  END IF;$new$;
BEGIN
  IF current_setting('transaction_isolation')<>'read committed' THEN
    RAISE EXCEPTION 'Thesaurus metadata upgrade requires READ COMMITTED' USING ERRCODE='PT409';
  END IF;
  PERFORM set_config('lock_timeout','5s',true);
  PERFORM thesaurus.take_source_gate();
  -- S2 -> X1 matches source configuration ordering. Wait for in-flight draft
  -- saves before checking; hold off new saves until their fingerprints are fresh.
  PERFORM pg_advisory_xact_lock(741126,1);
  -- Vocabulary metadata participates in optimistic draft fingerprints. Never
  -- bless or silently rebase an outstanding draft across this schema change.
  IF EXISTS(SELECT 1 FROM thesaurus.revision WHERE status<>'published') THEN
    RAISE EXCEPTION 'Publish or explicitly discard outstanding thesaurus drafts before metadata upgrade' USING ERRCODE='PT409';
  END IF;
  IF EXISTS(SELECT 1 FROM thesaurus.vocabulary v WHERE NOT names ? v.domain)
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(names) d WHERE NOT EXISTS(SELECT 1 FROM thesaurus.vocabulary v WHERE v.domain=d)) THEN
    RAISE EXCEPTION 'Review multilingual names against the complete vocabulary set before applying';
  END IF;

  ALTER TABLE thesaurus.vocabulary ADD COLUMN IF NOT EXISTS name_i18n jsonb;
  UPDATE thesaurus.vocabulary v SET name=n.value->>'fr',name_i18n=n.value,updated_at=now()
  FROM jsonb_each(names) n WHERE v.domain=n.key
    AND (v.name IS DISTINCT FROM n.value->>'fr' OR v.name_i18n IS DISTINCT FROM n.value);
  ALTER TABLE thesaurus.vocabulary ALTER COLUMN name_i18n SET NOT NULL;
  -- New domains require explicit reviewed translations; do not fabricate them.
  ALTER TABLE thesaurus.vocabulary ALTER COLUMN name_i18n DROP DEFAULT;
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='thesaurus.vocabulary'::regclass AND conname='thesaurus_vocabulary_name_languages') THEN
    ALTER TABLE thesaurus.vocabulary ADD CONSTRAINT thesaurus_vocabulary_name_languages CHECK (
      jsonb_typeof(name_i18n)='object' AND name=name_i18n->>'fr'
      AND thesaurus.has_editorial_text(name_i18n->'fr')
      AND thesaurus.has_editorial_text(name_i18n->'en')
      AND thesaurus.has_editorial_text(name_i18n->'es')
      AND thesaurus.has_editorial_text(name_i18n->'de'));
  END IF;
  UPDATE public.ref_code_domain_registry r
  SET name=n.value->>'fr',name_i18n=COALESCE(r.name_i18n,'{}'::jsonb)||n.value,updated_at=now()
  FROM jsonb_each(names)n WHERE r.domain=n.key AND (
    r.name IS DISTINCT FROM n.value->>'fr'
    OR r.name_i18n IS DISTINCT FROM COALESCE(r.name_i18n,'{}'::jsonb)||n.value);
  UPDATE public.ref_catalog_registry r SET label=v.name,updated_at=now()
  FROM thesaurus.vocabulary v WHERE r.catalog_key=CASE v.source_kind
    WHEN 'ref_code' THEN 'ref_code:'||v.domain WHEN 'amenity' THEN 'ref_amenity'
    WHEN 'classification_scheme' THEN 'ref_classification_scheme'
    WHEN 'classification_value' THEN 'ref_classification_value'
    WHEN 'language' THEN 'ref_language' WHEN 'commune' THEN 'ref_commune'
    WHEN 'sustainability_action' THEN 'ref_sustainability_action'
    WHEN 'sustainability_category' THEN 'ref_sustainability_action_category' END
    AND r.label IS DISTINCT FROM v.name;

  SELECT prosrc,proowner,proacl,proconfig INTO STRICT original,prior_owner,prior_acl,prior_config
  FROM pg_proc WHERE oid='thesaurus.activate(uuid[],text[],text,bigint,jsonb)'::regprocedure;
  body:=replace(original,E'\\r','');
  -- Exact predecessor, or the exact same already-applied patch. No authority,
  -- source gates, publication rules, concept checksum or privileges may drift.
  IF strpos(body,new_fields)>0 THEN
    IF (length(body)-length(replace(body,new_fields,'')))/length(new_fields)<>1
      OR (length(body)-length(replace(body,new_update,'')))/length(new_update)<>1
      OR md5(replace(replace(body,new_fields,old_fields),new_update,old_update))<>'985839358c6e0d68eb7db280f42bb6ed' THEN
      RAISE EXCEPTION 'Multilingual publication metadata patch drift';
    END IF;
  ELSE
    IF md5(body)<>'985839358c6e0d68eb7db280f42bb6ed'
      OR (length(body)-length(replace(body,old_fields,'')))/length(old_fields)<>1
      OR (length(body)-length(replace(body,old_update,'')))/length(old_update)<>1 THEN
      RAISE EXCEPTION 'Reviewed publication kernel changed before metadata patch';
    END IF;
    body:=replace(replace(body,old_fields,new_fields),old_update,new_update);
    -- Hosted postgres is not a superuser. Temporarily inherit the existing
    -- publisher ownership capability solely for this reviewed replacement.
    -- Preserve each grantor's row: never alter another grantor's membership.
    executor_name:=current_user;
    executor:=executor_name::regrole::oid;
    SELECT COALESCE(jsonb_agg(to_jsonb(m) ORDER BY m.member,m.grantor),'[]')
    INTO memberships_before FROM pg_auth_members m
    WHERE m.roleid='bertel_thesaurus_publisher'::regrole;
    SELECT admin_option,inherit_option,set_option
    INTO prior_admin,prior_inherit,prior_set FROM pg_auth_members
    WHERE roleid='bertel_thesaurus_publisher'::regrole
      AND member=executor AND grantor=executor;
    had_executor_grant:=FOUND;
    EXECUTE format('GRANT bertel_thesaurus_publisher TO %I WITH ADMIN %s, INHERIT TRUE, SET FALSE GRANTED BY %I',
      executor_name,CASE WHEN prior_admin THEN 'TRUE' ELSE 'FALSE' END,executor_name);
    EXECUTE replace(pg_get_functiondef('thesaurus.activate(uuid[],text[],text,bigint,jsonb)'::regprocedure),original,body);
    IF had_executor_grant THEN
      EXECUTE format('GRANT bertel_thesaurus_publisher TO %I WITH ADMIN %s, INHERIT %s, SET %s GRANTED BY %I',
        executor_name,CASE WHEN prior_admin THEN 'TRUE' ELSE 'FALSE' END,
        CASE WHEN prior_inherit THEN 'TRUE' ELSE 'FALSE' END,
        CASE WHEN prior_set THEN 'TRUE' ELSE 'FALSE' END,executor_name);
    ELSE
      EXECUTE format('REVOKE bertel_thesaurus_publisher FROM %I GRANTED BY %I',executor_name,executor_name);
    END IF;
    SELECT COALESCE(jsonb_agg(to_jsonb(m) ORDER BY m.member,m.grantor),'[]')
    INTO memberships_after FROM pg_auth_members m
    WHERE m.roleid='bertel_thesaurus_publisher'::regrole;
    IF memberships_after IS DISTINCT FROM memberships_before THEN
      RAISE EXCEPTION 'Publisher role memberships were not restored exactly';
    END IF;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_proc WHERE oid='thesaurus.activate(uuid[],text[],text,bigint,jsonb)'::regprocedure
    AND (proowner IS DISTINCT FROM prior_owner OR proacl IS DISTINCT FROM prior_acl OR proconfig IS DISTINCT FROM prior_config OR NOT prosecdef)) THEN
    RAISE EXCEPTION 'Publication ownership, ACL, security mode or settings changed';
  END IF;

  -- Every endpoint receives the checksum from its pinned immutable manifest.
  -- Legacy snapshots keep the key absent; no live vocabulary lookup is added.
  SELECT prosrc,to_jsonb(p)-'prosrc' INTO STRICT original,prior_function
  FROM pg_proc p WHERE oid='thesaurus.public_dispatch(text,bigint,jsonb)'::regprocedure;
  body:=replace(original,E'\\r','');
  IF strpos(body,new_meta)>0 THEN
    IF (length(body)-length(replace(body,new_meta,'')))/length(new_meta)<>1
      OR md5(replace(body,new_meta,old_meta))<>'03fb8e96e1b55d8ed42ce2df19301942' THEN
      RAISE EXCEPTION 'Frozen metadata reader patch drift';
    END IF;
  ELSE
    IF md5(body)<>'03fb8e96e1b55d8ed42ce2df19301942'
      OR (length(body)-length(replace(body,old_meta,'')))/length(old_meta)<>1 THEN
      RAISE EXCEPTION 'Reviewed public reader changed before metadata patch';
    END IF;
    body:=replace(body,old_meta,new_meta);
    EXECUTE replace(pg_get_functiondef('thesaurus.public_dispatch(text,bigint,jsonb)'::regprocedure),original,body);
  END IF;
  IF (SELECT to_jsonb(p)-'prosrc' FROM pg_proc p
    WHERE oid='thesaurus.public_dispatch(text,bigint,jsonb)'::regprocedure) IS DISTINCT FROM prior_function THEN
    RAISE EXCEPTION 'Public reader identity, ACL, owner, signature or execution settings changed';
  END IF;
END $domain_metadata$;
`;
await writeFile(path.join(root, migration), sql);
await writeFile(path.join(root, 'Base de donnée DLL et API/thesaurus_domain_metadata_localization.sql'), sql);
console.log(`Generated identical upgrade and fresh-apply metadata SQL for ${Object.keys(labels).length} domains.`);
