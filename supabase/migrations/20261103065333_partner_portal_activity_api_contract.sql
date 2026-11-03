-- R1: office activity detail; external JSON keys/types/values remain unchanged.
-- Source reviewed live 2026-11-03 06:51 UTC. Apply after historical reader patches.
-- Column and explicit JSON exclusion commit together. No privilege/API version change.
BEGIN;
SET LOCAL lock_timeout = '500ms';
SET LOCAL statement_timeout = '10s';
SET LOCAL idle_in_transaction_session_timeout = '15s';

DO $activity_column$
DECLARE v_constraint text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='public.object_act'::regclass
                 AND attname='equipment_provided_details' AND NOT attisdropped) THEN
    ALTER TABLE public.object_act ADD COLUMN equipment_provided_details text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='public.object_act'::regclass
                 AND attname='equipment_provided_details' AND atttypid='text'::regtype
                 AND NOT attnotnull AND NOT atthasdef AND NOT attisdropped) THEN
    RAISE EXCEPTION 'R1: detail column differs from nullable text without default';
  END IF;
  SELECT pg_get_constraintdef(oid) INTO v_constraint FROM pg_constraint
    WHERE conrelid='public.object_act'::regclass AND conname='chk_object_act_equipment_details';
  IF v_constraint IS NULL THEN
    ALTER TABLE public.object_act ADD CONSTRAINT chk_object_act_equipment_details
      CHECK (equipment_provided_details IS NULL OR equipment_provided);
  ELSIF regexp_replace(v_constraint,'[()[:space:]]','','g')<>'CHECKequipment_provided_detailsISNULLORequipment_provided' THEN
    RAISE EXCEPTION 'R1: detail constraint differs from reviewed contract';
  END IF;
END;
$activity_column$;

DO $activity_api_contract$
DECLARE
  v_function regprocedure := to_regprocedure('api.get_object_resource(text,text[],text,jsonb)');
  v_source_md5 text; v_definition text; v_metadata jsonb; v_before text; v_after text;
BEGIN
  IF v_function IS NULL THEN RAISE EXCEPTION 'activity_api_contract: reviewed reader missing'; END IF;
  SELECT md5(replace(p.prosrc,E'\r\n',E'\n')),pg_get_functiondef(p.oid),jsonb_build_object('owner',p.proowner,'acl',to_jsonb(p.proacl),'config',to_jsonb(p.proconfig),'definer',p.prosecdef,'strict',p.proisstrict,'volatility',p.provolatile,'parallel',p.proparallel,'returns',p.prorettype,'set',p.proretset,'args',p.proargtypes::text)
    INTO v_source_md5,v_definition,v_metadata FROM pg_proc p WHERE p.oid=v_function;
  IF v_source_md5='fc810940fc3fff5db7d3068563e924a2' THEN RETURN; END IF;
  IF v_source_md5 IS DISTINCT FROM '523b18abc402528c494e25f3895f2912' THEN
    RAISE EXCEPTION 'activity_api_contract: unexpected source %, compare live definition before applying',v_source_md5;
  END IF;
  v_definition := replace(v_definition,E'\r\n',E'\n');
  v_before := $before1$to_jsonb(a) - 'object_id'$before1$;
  v_after := $after1$to_jsonb(a) - 'object_id' - 'equipment_provided_details'$after1$;
  IF (length(v_definition)-length(replace(v_definition,v_before,'')))/length(v_before)<>1 THEN
    RAISE EXCEPTION 'activity_api_contract: expected exactly one reviewed patch anchor 1';
  END IF;
  v_definition:=replace(v_definition,v_before,v_after);
  EXECUTE v_definition;
  IF (SELECT md5(replace(prosrc,E'\r\n',E'\n')) FROM pg_proc WHERE oid=v_function) IS DISTINCT FROM 'fc810940fc3fff5db7d3068563e924a2' THEN
    RAISE EXCEPTION 'activity_api_contract: unexpected target definition';
  END IF;
  IF (SELECT jsonb_build_object('owner',p.proowner,'acl',to_jsonb(p.proacl),'config',to_jsonb(p.proconfig),'definer',p.prosecdef,'strict',p.proisstrict,'volatility',p.provolatile,'parallel',p.proparallel,'returns',p.prorettype,'set',p.proretset,'args',p.proargtypes::text) FROM pg_proc p WHERE p.oid=v_function) IS DISTINCT FROM v_metadata THEN
    RAISE EXCEPTION 'activity_api_contract: signature/owner/ACL/attributes changed';
  END IF;
END;
$activity_api_contract$;

NOTIFY pgrst,'reload schema';
COMMIT;
