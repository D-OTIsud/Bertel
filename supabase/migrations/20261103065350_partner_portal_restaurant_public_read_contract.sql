-- R3a: public restaurant rows filtered, exact JSON shape/order/labels/types retained.
-- Requires R1. Existing extended object scope is unchanged; a service key is not a person.
-- No RLS change here: R3b follows the atomic office writer and direct-DML closure.
BEGIN;
SET LOCAL lock_timeout = '500ms';
SET LOCAL statement_timeout = '10s';
SET LOCAL idle_in_transaction_session_timeout = '15s';

DO $restaurant_public_read_contract$
DECLARE
  v_function regprocedure := to_regprocedure('api.get_object_resource(text,text[],text,jsonb)');
  v_source_md5 text; v_definition text; v_metadata jsonb; v_before text; v_after text;
BEGIN
  IF v_function IS NULL THEN RAISE EXCEPTION 'restaurant_public_read_contract: reviewed reader missing'; END IF;
  SELECT md5(replace(p.prosrc,E'\r\n',E'\n')),pg_get_functiondef(p.oid),jsonb_build_object('owner',p.proowner,'acl',to_jsonb(p.proacl),'config',to_jsonb(p.proconfig),'definer',p.prosecdef,'strict',p.proisstrict,'volatility',p.provolatile,'parallel',p.proparallel,'returns',p.prorettype,'set',p.proretset,'args',p.proargtypes::text)
    INTO v_source_md5,v_definition,v_metadata FROM pg_proc p WHERE p.oid=v_function;
  IF v_source_md5='f37390c0e22123cdfa378626b0ded7f9' THEN RETURN; END IF;
  IF v_source_md5 IS DISTINCT FROM 'fc810940fc3fff5db7d3068563e924a2' THEN
    RAISE EXCEPTION 'restaurant_public_read_contract: unexpected source %, compare live definition before applying',v_source_md5;
  END IF;
  v_definition := replace(v_definition,E'\r\n',E'\n');
  v_before := $before1$WHERE mi.menu_id = m.id$before1$;
  v_after := $after1$WHERE mi.menu_id = m.id
                       AND (v_can_read_extended OR mi.is_available = TRUE)$after1$;
  IF (length(v_definition)-length(replace(v_definition,v_before,'')))/length(v_before)<>1 THEN
    RAISE EXCEPTION 'restaurant_public_read_contract: expected exactly one reviewed patch anchor 1';
  END IF;
  v_definition:=replace(v_definition,v_before,v_after);
  v_before := $before2$WHERE m.object_id = obj.id
          AND (v_can_read_extended OR m.visibility IS NULL OR m.visibility = 'public')$before2$;
  v_after := $after2$WHERE m.object_id = obj.id
          AND (v_can_read_extended OR m.is_active = TRUE)
          AND (v_can_read_extended OR m.visibility IS NULL OR m.visibility = 'public')$after2$;
  IF (length(v_definition)-length(replace(v_definition,v_before,'')))/length(v_before)<>1 THEN
    RAISE EXCEPTION 'restaurant_public_read_contract: expected exactly one reviewed patch anchor 2';
  END IF;
  v_definition:=replace(v_definition,v_before,v_after);
  v_before := $before3$AND rt.code = 'carte'
      ), '[]'::jsonb)$before3$;
  v_after := $after3$AND rt.code = 'carte'
          AND (v_can_read_extended OR (
            d.access_scope = 'public'
            AND d.url ~* '^https?://'
            AND (od.valid_from IS NULL OR od.valid_from <= CURRENT_DATE)
            AND (od.valid_to IS NULL OR od.valid_to >= CURRENT_DATE)
            AND (d.valid_from IS NULL OR d.valid_from <= CURRENT_DATE)
            AND (d.valid_to IS NULL OR d.valid_to >= CURRENT_DATE)
          ))
      ), '[]'::jsonb)$after3$;
  IF (length(v_definition)-length(replace(v_definition,v_before,'')))/length(v_before)<>1 THEN
    RAISE EXCEPTION 'restaurant_public_read_contract: expected exactly one reviewed patch anchor 3';
  END IF;
  v_definition:=replace(v_definition,v_before,v_after);
  v_before := $before4$AND mi.is_available = TRUE
          AND (v_can_read_extended OR m.visibility IS NULL OR m.visibility = 'public')$before4$;
  v_after := $after4$AND mi.is_available = TRUE
          AND (v_can_read_extended OR m.is_active = TRUE)
          AND (v_can_read_extended OR m.visibility IS NULL OR m.visibility = 'public')$after4$;
  IF (length(v_definition)-length(replace(v_definition,v_before,'')))/length(v_before)<>1 THEN
    RAISE EXCEPTION 'restaurant_public_read_contract: expected exactly one reviewed patch anchor 4';
  END IF;
  v_definition:=replace(v_definition,v_before,v_after);
  EXECUTE v_definition;
  IF (SELECT md5(replace(prosrc,E'\r\n',E'\n')) FROM pg_proc WHERE oid=v_function) IS DISTINCT FROM 'f37390c0e22123cdfa378626b0ded7f9' THEN
    RAISE EXCEPTION 'restaurant_public_read_contract: unexpected target definition';
  END IF;
  IF (SELECT jsonb_build_object('owner',p.proowner,'acl',to_jsonb(p.proacl),'config',to_jsonb(p.proconfig),'definer',p.prosecdef,'strict',p.proisstrict,'volatility',p.provolatile,'parallel',p.proparallel,'returns',p.prorettype,'set',p.proretset,'args',p.proargtypes::text) FROM pg_proc p WHERE p.oid=v_function) IS DISTINCT FROM v_metadata THEN
    RAISE EXCEPTION 'restaurant_public_read_contract: signature/owner/ACL/attributes changed';
  END IF;
END;
$restaurant_public_read_contract$;

NOTIFY pgrst,'reload schema';
COMMIT;
