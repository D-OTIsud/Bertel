-- X1: exclude reception/service from primary regional opening slots.
-- Opt-in reader absent in production: do not create or activate that export.
-- Fresh installs use the corrected canonical source; upgrade only the reviewed source.
BEGIN;
SET LOCAL lock_timeout = '500ms';
SET LOCAL statement_timeout = '10s';
SET LOCAL idle_in_transaction_session_timeout = '15s';

DO $regional_primary_openings$
DECLARE
  v_function regprocedure := to_regprocedure('api.tourinsoft_reunion_regional_documents(text[])');
  v_source_md5 text; v_definition text; v_metadata jsonb; v_before text; v_after text;
BEGIN
  IF v_function IS NULL THEN RAISE NOTICE 'regional_primary_openings: optional reader absent; export not activated'; RETURN; END IF;
  SELECT md5(replace(p.prosrc,E'\r\n',E'\n')),pg_get_functiondef(p.oid),jsonb_build_object('owner',p.proowner,'acl',to_jsonb(p.proacl),'config',to_jsonb(p.proconfig),'definer',p.prosecdef,'strict',p.proisstrict,'volatility',p.provolatile,'parallel',p.proparallel,'returns',p.prorettype,'set',p.proretset,'args',p.proargtypes::text)
    INTO v_source_md5,v_definition,v_metadata FROM pg_proc p WHERE p.oid=v_function;
  IF v_source_md5='e4d112b4f34528f2412065d3802cbe0d' THEN RETURN; END IF;
  IF v_source_md5 IS DISTINCT FROM 'f124fc6099dc2373bcf3a32aaead4fc5' THEN
    RAISE EXCEPTION 'regional_primary_openings: unexpected source %, compare live definition before applying',v_source_md5;
  END IF;
  v_definition := replace(v_definition,E'\r\n',E'\n');
  v_before := $before1$  LEFT JOIN public.opening_schedule schedule ON schedule.period_id = op.id$before1$;
  v_after := $after1$  LEFT JOIN public.opening_schedule schedule ON schedule.period_id = op.id
    AND NOT EXISTS (
      SELECT 1 FROM public.ref_code_opening_schedule_type schedule_type
      WHERE schedule_type.id = schedule.schedule_type_id
        AND schedule_type.code IN ('reception', 'service')
    )$after1$;
  IF (length(v_definition)-length(replace(v_definition,v_before,'')))/length(v_before)<>1 THEN
    RAISE EXCEPTION 'regional_primary_openings: expected exactly one reviewed patch anchor 1';
  END IF;
  v_definition:=replace(v_definition,v_before,v_after);
  EXECUTE v_definition;
  IF (SELECT md5(replace(prosrc,E'\r\n',E'\n')) FROM pg_proc WHERE oid=v_function) IS DISTINCT FROM 'e4d112b4f34528f2412065d3802cbe0d' THEN
    RAISE EXCEPTION 'regional_primary_openings: unexpected target definition';
  END IF;
  IF (SELECT jsonb_build_object('owner',p.proowner,'acl',to_jsonb(p.proacl),'config',to_jsonb(p.proconfig),'definer',p.prosecdef,'strict',p.proisstrict,'volatility',p.provolatile,'parallel',p.proparallel,'returns',p.prorettype,'set',p.proretset,'args',p.proargtypes::text) FROM pg_proc p WHERE p.oid=v_function) IS DISTINCT FROM v_metadata THEN
    RAISE EXCEPTION 'regional_primary_openings: signature/owner/ACL/attributes changed';
  END IF;
END;
$regional_primary_openings$;

COMMIT;
