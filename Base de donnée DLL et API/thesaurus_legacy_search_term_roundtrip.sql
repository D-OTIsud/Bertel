-- Complete the existing private legacy-search-term editing contract.
-- Draft saves never write canonical terms. Only the existing activation call to
-- apply_source persists them; activate/auth/ACLs/public projections stay intact.
DO $legacy_search_roundtrip$
DECLARE original text; body text; needle text; replacement text;
 contract jsonb; expected text; activation_hash text;
BEGIN
  contract:=thesaurus.preparation_contract_registry();
  expected:=contract->'functions'->>'thesaurus.apply_source(uuid,jsonb)';
  IF expected IS NULL OR expected<>md5(pg_get_functiondef('thesaurus.apply_source(uuid,jsonb)'::regprocedure)) THEN
    RAISE EXCEPTION 'Reviewed prepared-publication source writer changed';
  END IF;
  activation_hash:=md5(pg_get_functiondef('thesaurus.activate(uuid[],text[],text,bigint,jsonb)'::regprocedure));

  SELECT prosrc INTO STRICT original FROM pg_proc
  WHERE oid='thesaurus.concept_document(uuid,boolean)'::regprocedure;
  body:=replace(original,E'\r','');
  needle:=$old$'assignable',c.assignable,'source_kind',c.source_kind);$old$;
  replacement:=$new$'assignable',c.assignable,'source_kind',c.source_kind,
      'legacy_search_terms',COALESCE(j->'legacy_search_terms',to_jsonb(c.legacy_search_terms)));$new$;
  IF strpos(body,needle)=0 THEN RAISE EXCEPTION 'Reviewed staged concept document changed';END IF;
  body:=replace(body,needle,replacement);
  needle:=$old$'assignable',c.assignable AND c.lifecycle='active'$old$;
  replacement:=$new$'legacy_search_terms',to_jsonb(c.legacy_search_terms),
    'assignable',c.assignable AND c.lifecycle='active'$new$;
  IF strpos(body,needle)=0 THEN RAISE EXCEPTION 'Reviewed canonical concept document changed';END IF;
  body:=replace(body,needle,replacement);
  EXECUTE replace(pg_get_functiondef('thesaurus.concept_document(uuid,boolean)'::regprocedure),original,body);

  SELECT prosrc INTO STRICT original FROM pg_proc
  WHERE oid='thesaurus.validate_document(uuid,jsonb)'::regprocedure;
  body:=replace(original,E'\r','');
  needle:=$old$ARRAY['labels','notes','relations','mappings','replaced_by']$old$;
  replacement:=$new$ARRAY['labels','notes','relations','mappings','replaced_by','legacy_search_terms']$new$;
  IF strpos(body,needle)=0 THEN RAISE EXCEPTION 'Reviewed document array validation changed';END IF;
  body:=replace(body,needle,replacement);
  needle:=$old$  IF p_doc?'source_fields'AND jsonb_typeof(p_doc->'source_fields')<>'object'THEN$old$;
  replacement:=$new$  IF p_doc?'legacy_search_terms' AND EXISTS(
    SELECT 1 FROM jsonb_array_elements(p_doc->'legacy_search_terms') term
    WHERE NOT thesaurus.has_editorial_text(term)) THEN
    errors:=errors||jsonb_build_array('Les termes de recherche hérités doivent être des textes non vides.');
  END IF;
  IF p_doc?'source_fields'AND jsonb_typeof(p_doc->'source_fields')<>'object'THEN$new$;
  IF strpos(body,needle)=0 THEN RAISE EXCEPTION 'Reviewed document property validation changed';END IF;
  body:=replace(body,needle,replacement);
  EXECUTE replace(pg_get_functiondef('thesaurus.validate_document(uuid,jsonb)'::regprocedure),original,body);

  SELECT prosrc INTO STRICT original FROM pg_proc
  WHERE oid='thesaurus.apply_source(uuid,jsonb)'::regprocedure;
  body:=replace(original,E'\r','');
  needle:=$old$  SELECT * INTO c FROM thesaurus.concept WHERE concept_id=p_id;$old$;
  replacement:=$new$  IF p_doc?'legacy_search_terms' THEN
    IF jsonb_typeof(p_doc->'legacy_search_terms') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Les termes de recherche hérités doivent être une liste de textes.' USING ERRCODE='PT400';
    END IF;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_doc->'legacy_search_terms') term
      WHERE NOT thesaurus.has_editorial_text(term)) THEN
      RAISE EXCEPTION 'Les termes de recherche hérités doivent être des textes non vides.' USING ERRCODE='PT400';
    END IF;
    UPDATE thesaurus.concept SET legacy_search_terms=ARRAY(
      SELECT jsonb_array_elements_text(p_doc->'legacy_search_terms')) WHERE concept_id=p_id;
  END IF;
  -- Omission preserves existing terms; [] explicitly clears them. Read c only
  -- after this update so metadata.aliases uses the exact newly published terms.
  SELECT * INTO c FROM thesaurus.concept WHERE concept_id=p_id;$new$;
  IF strpos(body,needle)=0 THEN RAISE EXCEPTION 'Reviewed native source writer entry changed';END IF;
  body:=replace(body,needle,replacement);
  EXECUTE replace(pg_get_functiondef('thesaurus.apply_source(uuid,jsonb)'::regprocedure),original,body);

  -- Only this reviewed writer's signature changes. Preserve every other support
  -- hash and source key contract instead of blessing unrelated function drift.
  contract:=jsonb_set(contract,ARRAY['functions','thesaurus.apply_source(uuid,jsonb)'],
    to_jsonb(md5(pg_get_functiondef('thesaurus.apply_source(uuid,jsonb)'::regprocedure))),false);
  EXECUTE format('CREATE OR REPLACE FUNCTION thesaurus.preparation_contract_registry()RETURNS jsonb LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog AS %L',
    'SELECT '||quote_literal(contract::text)||'::jsonb');
  PERFORM thesaurus.assert_preparation_contract();
  IF activation_hash<>md5(pg_get_functiondef('thesaurus.activate(uuid[],text[],text,bigint,jsonb)'::regprocedure)) THEN
    RAISE EXCEPTION 'Activation kernel unexpectedly changed';
  END IF;
END $legacy_search_roundtrip$;
