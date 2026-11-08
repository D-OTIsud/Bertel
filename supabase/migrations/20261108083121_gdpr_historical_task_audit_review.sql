-- Report-only forward overlay. No audit redaction, task, provider effect or grant.
-- A hypothetical old audit trace can outlive both its task and catalogue document.
BEGIN;
SET LOCAL search_path = pg_catalog, pg_temp;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15s';
DO $guard$
DECLARE
  v_target oid := to_regprocedure('api.rpc_gdpr_erase_subject(text,text,text,text)');
  v_before jsonb;
  v_after jsonb;
  v_body text;
  v_definition text;
  v_next text;
  v_role text;
  v_signature text;
  v_oid oid;
  anchor1 constant text := $a1$      'receiptOnlyDocumentIds', to_jsonb(v_receipt_only_doc_ids)$a1$;
  replacement1 constant text := $r1$      'receiptOnlyDocumentIds', to_jsonb(v_receipt_only_doc_ids),
      -- These task IDs were historically linked, but their audit was not broadly redacted.
      'historicalTaskAuditReviewIds', COALESCE((
        SELECT jsonb_agg(DISTINCT d.parent_id ORDER BY d.parent_id)
        FROM internal.crm_document_detachment d
        WHERE d.id = ANY(v_detachment_ids) AND d.parent_kind = 'task'
          AND NOT (d.parent_id = ANY(v_crm_task_ids))
      ), '[]'::jsonb)$r1$;
  anchor2 constant text := $a2$      OR cardinality(v_unattached_uploads) > 0 OR cardinality(v_receipt_only_doc_ids) > 0,$a2$;
  replacement2 constant text := $r2$      OR cardinality(v_unattached_uploads) > 0 OR cardinality(v_receipt_only_doc_ids) > 0
      OR COALESCE(jsonb_array_length(v_report->'crmProvenance'->'historicalTaskAuditReviewIds'), 0) > 0,$r2$;
BEGIN
  IF v_target IS NULL OR to_regclass('internal.crm_document_detachment') IS NULL THEN
    RAISE EXCEPTION 'Historical task audit review requires the closed provenance RPC';
  END IF;
  SELECT to_jsonb(p), replace(p.prosrc, chr(13), ''),
         replace(pg_get_functiondef(p.oid), chr(13), '')
    INTO STRICT v_before, v_body, v_definition FROM pg_proc p WHERE p.oid=v_target;
  IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang
    WHERE p.oid=v_target AND p.proowner='postgres'::regrole AND l.lanname='plpgsql'
      AND p.prokind='f' AND p.prosecdef AND p.provolatile='v' AND NOT p.proisstrict
      AND NOT p.proleakproof AND p.proparallel='u' AND p.prorettype='jsonb'::regtype
      AND p.proconfig=ARRAY['search_path=pg_catalog, public, api, auth, audit, internal, pg_temp'])
    OR md5(v_body) NOT IN ('690e95cd8f9eee68300c38cec1414714','d67b20a6d3b634ee01397008a4b6a2e3') THEN
    RAISE EXCEPTION 'Unknown historical task audit report predecessor';
  END IF;
  -- This overlay is not an activation path, including on a previously applied state.
  FOREACH v_signature IN ARRAY ARRAY[
    'api.rpc_gdpr_erase_subject(text,text,text,text)',
    'api.rpc_gdpr_get_cleanup_status(uuid)',
    'api.rpc_gdpr_ack_cleanup_task(uuid,uuid,boolean,text)'
  ] LOOP
    v_oid:=to_regprocedure(v_signature);
    IF v_oid IS NULL OR EXISTS(SELECT 1 FROM pg_proc p
      CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a
      WHERE p.oid=v_oid AND a.grantee<>p.proowner) THEN
      RAISE EXCEPTION 'Historical task audit review requires owner-only GDPR RPCs';
    END IF;
    FOREACH v_role IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
      IF has_function_privilege(v_role,v_oid,'EXECUTE') THEN
        RAISE EXCEPTION 'Historical task audit review must not activate GDPR';
      END IF;
    END LOOP;
  END LOOP;
  IF md5(v_body)='d67b20a6d3b634ee01397008a4b6a2e3' THEN RETURN; END IF;
  IF (length(v_body)-length(replace(v_body,anchor1,'')))/length(anchor1)<>1
    OR (length(v_body)-length(replace(v_body,anchor2,'')))/length(anchor2)<>1
    OR strpos(v_definition,v_body)=0 THEN
    RAISE EXCEPTION 'Historical task audit report anchors changed';
  END IF;
  v_next:=replace(replace(v_body,anchor1,replacement1),anchor2,replacement2);
  EXECUTE replace(v_definition,v_body,v_next);
  SELECT to_jsonb(p) INTO STRICT v_after FROM pg_proc p WHERE p.oid=v_target;
  IF md5(replace(v_after->>'prosrc',chr(13),''))<>'d67b20a6d3b634ee01397008a4b6a2e3'
    OR (v_after-'prosrc') IS DISTINCT FROM (v_before-'prosrc') THEN
    RAISE EXCEPTION 'Historical task audit report changed unrelated attributes';
  END IF;
END;
$guard$;
NOTIFY pgrst, 'reload schema';
COMMIT;
