\set ON_ERROR_STOP on
\ir assert_partner_api_ephemeral.sql
-- Rehearse restoration of the reviewed POST-R1/R3a checkpoint, never the older
-- reader that disclosed private/inactive restaurant data. Disposable catalogue only.
BEGIN;
DO $test$
DECLARE
 v_oid oid:='api.get_object_resource(text,text[],text,jsonb)'::regprocedure;
 v_definition text;v_source text;v_metadata jsonb;v_hash text;b record;actual jsonb;checked integer:=0;
BEGIN
 SELECT pg_get_functiondef(p.oid),p.prosrc,to_jsonb(p)-'oid'-'prosrc',md5(replace(p.prosrc,E'\r\n',E'\n'))
 INTO v_definition,v_source,v_metadata,v_hash FROM pg_proc p WHERE p.oid=v_oid;
 ASSERT v_hash='f37390c0e22123cdfa378626b0ded7f9','Only the reviewed safe R1/R3a checkpoint may be rehearsed';
 ASSERT (length(v_definition)-length(replace(v_definition,v_source,'')))/length(v_source)=1,'Ambiguous backup definition';

 -- A synthetic later edit changes the body and an attribute. No old public
 -- predicate, data write, or privilege broadening is introduced even transiently.
 EXECUTE replace(v_definition,v_source,v_source||E'\n-- disposable restoration rehearsal\n');
 ALTER FUNCTION api.get_object_resource(text,text[],text,jsonb) COST 777;
 ASSERT (SELECT md5(replace(prosrc,E'\r\n',E'\n'))<>v_hash FROM pg_proc WHERE oid=v_oid),'Synthetic edit was not applied';
 EXECUTE v_definition;
 ASSERT (SELECT md5(replace(prosrc,E'\r\n',E'\n'))=v_hash FROM pg_proc WHERE oid=v_oid),'Restored reader source differs';
 ASSERT (SELECT to_jsonb(p)-'oid'-'prosrc'=v_metadata FROM pg_proc p WHERE oid=v_oid),'Restored signature/owner/ACL/config/cost differs';

 -- Compare while the restored definition is active, before the final ROLLBACK.
 FOR b IN SELECT * FROM internal.portal_api_contract_baseline ORDER BY principal,object_id,variant LOOP
  PERFORM set_config('request.jwt.claims',b.claims::text,true);
  EXECUTE format('SET LOCAL ROLE %I',b.db_role);
  actual:=api.get_object_resource(b.object_id,b.lang_prefs,'none',b.options)::jsonb;
  RESET ROLE;
  IF actual IS DISTINCT FROM b.expected THEN
   RAISE EXCEPTION 'Restored API response differs principal=% object=% variant=%',b.principal,b.object_id,b.variant;
  END IF;
  checked:=checked+1;
 END LOOP;
 ASSERT checked=126,'Expected all six principals, seven objects and three variants after restoration';
 RAISE NOTICE 'Safe post-R1/R3a checkpoint restored with exact attributes and % unchanged responses',checked;
END;
$test$;
ROLLBACK;
