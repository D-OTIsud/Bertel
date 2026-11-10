-- Authenticated platform-superuser workspace and bounded editorial batches.
-- Reuses existing single-item validation/conflict/auth logic. Never publishes.
DO $admin_batches$
DECLARE original text; body text; head text; workspace text; needle text; replacement text;
BEGIN
  SELECT prosrc INTO STRICT original FROM pg_proc
  WHERE oid='thesaurus.admin_dispatch(text,jsonb)'::regprocedure;
  body:=replace(original,E'\r','');
  needle:=$old$  IF p_action IN('configure_instance','configure_domain')THEN$old$;
  replacement:=$new$  IF p_action IN('save_drafts','validate_drafts') THEN
    IF jsonb_typeof(p_payload->'items') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Un lot doit contenir une liste items de 1 à 100 éléments.' USING ERRCODE='PT400';
    END IF;
    IF jsonb_array_length(p_payload->'items') NOT BETWEEN 1 AND 100 THEN
      RAISE EXCEPTION 'Un lot doit contenir de 1 à 100 éléments.' USING ERRCODE='PT400';
    END IF;
    result:='[]'::jsonb;
    FOR doc IN SELECT value FROM jsonb_array_elements(p_payload->'items') LOOP
      IF jsonb_typeof(doc) IS DISTINCT FROM 'object' THEN
        RAISE EXCEPTION 'Chaque élément du lot doit être un objet.' USING ERRCODE='PT400';
      END IF;
      -- One SQL function invocation is one transaction: any failed item rolls
      -- back the earlier items of this request, including newly created concepts.
      result:=result||jsonb_build_array(thesaurus.admin_dispatch(
        CASE p_action WHEN 'save_drafts' THEN 'save_draft' ELSE 'validate_draft' END,doc));
    END LOOP;
    RETURN jsonb_build_object('items',result);
  END IF;
  IF p_action IN('configure_instance','configure_domain')THEN$new$;
  IF strpos(body,needle)=0 THEN RAISE EXCEPTION 'Reviewed admin auth/action dispatch changed';END IF;
  body:=replace(body,needle,replacement);

  -- Normal private governance must retain a creation path once legacy source
  -- writes are protected. This remains inside the existing superuser RPC.
  needle:=$old$      IF NOT FOUND OR NOT v.is_public THEN RAISE EXCEPTION 'Unknown or non-public vocabulary' USING ERRCODE='PT400';END IF;$old$;
  replacement:=$new$      IF NOT FOUND OR NOT (v.is_public OR v.is_governed) THEN RAISE EXCEPTION 'Unknown vocabulary or private vocabulary not yet governed' USING ERRCODE='PT400';END IF;$new$;
  IF strpos(body,needle)=0 THEN RAISE EXCEPTION 'Reviewed new-concept vocabulary policy changed';END IF;
  body:=replace(body,needle,replacement);

  needle:=$old$  lim:=LEAST(200,GREATEST(1,COALESCE((p_payload->>'page_size')::integer,100)));$old$;
  IF strpos(body,needle)=0 THEN RAISE EXCEPTION 'Reviewed workspace boundary changed';END IF;
  head:=substring(body FROM 1 FOR strpos(body,needle)-1);
  workspace:=substring(body FROM strpos(body,needle));
  IF (length(workspace)-length(replace(workspace,'WHERE v.is_public','')))/length('WHERE v.is_public')<>4 THEN
    RAISE EXCEPTION 'Reviewed workspace public filters changed';
  END IF;
  workspace:=replace(workspace,'WHERE v.is_public',
    $filter$WHERE (v.is_public OR COALESCE((p_payload->>'include_internal')::boolean,false))$filter$);
  needle:=$old$    'capabilities',jsonb_build_object('content_proposal_preconditions',1,'read_only_workspace',1),$old$;
  replacement:=$new$    'capabilities',jsonb_build_object('content_proposal_preconditions',1,'read_only_workspace',1,
      'admin_batch_operations',1,'internal_workspace',1,'revision_pagination',1,'omit_revisions',1),$new$;
  IF strpos(workspace,needle)=0 THEN RAISE EXCEPTION 'Reviewed workspace capabilities changed';END IF;
  workspace:=replace(workspace,needle,replacement);
  needle:=$old$    'revisions',COALESCE((SELECT jsonb_agg(to_jsonb(r)ORDER BY updated_at DESC)FROM(SELECT r.*,c.domain FROM thesaurus.revision r JOIN thesaurus.concept c USING(concept_id)WHERE status<>'published'ORDER BY updated_at DESC LIMIT 200)r),'[]'),$old$;
  replacement:=$new$    'revisions',CASE WHEN COALESCE((p_payload->>'include_revisions')::boolean,true) THEN
      COALESCE((SELECT jsonb_agg(to_jsonb(r)ORDER BY updated_at DESC,revision_id)
        FROM(SELECT r.*,c.domain FROM thesaurus.revision r JOIN thesaurus.concept c USING(concept_id)
          WHERE status<>'published' ORDER BY updated_at DESC,revision_id
          LIMIT LEAST(2000,GREATEST(1,COALESCE((p_payload->>'revision_page_size')::integer,200)))
          OFFSET GREATEST(0,COALESCE((p_payload->>'revision_offset')::integer,0)))r),'[]')
      ELSE '[]'::jsonb END,$new$;
  IF strpos(workspace,needle)=0 THEN RAISE EXCEPTION 'Reviewed workspace revision list changed';END IF;
  workspace:=replace(workspace,needle,replacement);
  EXECUTE replace(pg_get_functiondef('thesaurus.admin_dispatch(text,jsonb)'::regprocedure),original,head||workspace);
END $admin_batches$;
