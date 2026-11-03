-- R1+R3a actual SQL. Full recursive JSONB equality except named, fixture-specific exclusions.
-- Fixtures persist for the separate real Next-route integration; this test rolls back its reads/context.
\set ON_ERROR_STOP on
DO $$ BEGIN
 IF current_setting('bertel.ephemeral_ci',true) IS DISTINCT FROM 'on' THEN
  RAISE EXCEPTION 'Disposable Supabase required: bertel.ephemeral_ci=on';
 END IF;
END $$;
BEGIN;
DO $test$
DECLARE b record; actual jsonb; meta jsonb; checked integer:=0;
 regional jsonb; reader_ids jsonb; regional_ids jsonb;
BEGIN
 SELECT jsonb_build_object('owner',p.proowner,'acl',to_jsonb(p.proacl),'config',to_jsonb(p.proconfig),
   'definer',p.prosecdef,'strict',p.proisstrict,'volatility',p.provolatile,
   'parallel',p.proparallel,'returns',p.prorettype,'set',p.proretset,'args',p.proargtypes::text)
 INTO meta FROM pg_proc p WHERE p.oid='api.get_object_resource(text,text[],text,jsonb)'::regprocedure;
 ASSERT meta=(SELECT metadata FROM internal.portal_api_contract_reader_before),'Reader signature/ACL/attributes changed';
 FOR b IN SELECT * FROM internal.portal_api_contract_baseline ORDER BY principal,object_id,variant LOOP
  PERFORM set_config('request.jwt.claims',b.claims::text,true);
  EXECUTE format('SET LOCAL ROLE %I',b.db_role);
  actual:=api.get_object_resource(b.object_id,b.lang_prefs,'none',b.options)::jsonb;
  RESET ROLE;
  IF actual IS DISTINCT FROM b.expected THEN
   RAISE EXCEPTION 'API contract mismatch principal=% object=% variant=% expected-md5=% actual-md5=%',
      b.principal,b.object_id,b.variant,md5(b.expected::text),md5(actual::text);
  END IF;
  IF b.object_id IN ('ACTRUN999999B101','ASCRUN999999B103') THEN
   ASSERT NOT (actual->'activity' ? 'equipment_provided_details'),'New R1 key leaked';
  END IF;
  IF b.object_id='RESRUN999999B201' THEN
   ASSERT jsonb_array_length(actual->'menus')=CASE WHEN b.extended THEN 5 ELSE 2 END,'Wrong menu count';
   ASSERT jsonb_array_length(actual->'menu_documents')=CASE WHEN b.extended THEN 8 ELSE 2 END,'Wrong card count';
   ASSERT jsonb_array_length(actual#>'{menus,0,items}')=CASE WHEN b.extended THEN 2 ELSE 1 END,'Unavailable dish filtering or extended read broken';
   ASSERT actual#>>'{menus,0,items,0,name}'='Visible dish B221','Dish name/type/order changed';
   ASSERT actual#>>'{menus,0,items,0,currency}'='EUR','Currency label changed';
   ASSERT jsonb_typeof(actual#>'{menus,0,items,0,price}')='number','Price type changed';
   ASSERT actual#>>'{menu_documents,0,title}'='Link title b231','Document link title fallback changed';
  ELSIF b.object_id='RESRUN999999B202' THEN
   ASSERT actual->'menus'='[]'::jsonb AND actual->'menu_documents'='[]'::jsonb,'Empty arrays changed';
  ELSIF b.object_id='FMARUN999999B203' THEN
   ASSERT actual->'menus'='[]'::jsonb,'FMA shared SQL reader changed';
  END IF;
  checked:=checked+1;
 END LOOP;
 ASSERT checked=126,'Expected six real database principals, seven objects and three variants';
 ASSERT (SELECT count(*) FROM public.object_menu WHERE object_id='RESRUN999999B201')=5,'Read correction deleted a menu';
 ASSERT (SELECT count(*) FROM public.object_document WHERE document_id='00000000-0000-4000-a000-00000000b231')=2,'Shared document link changed';
 ASSERT to_regprocedure('api.tourinsoft_reunion_regional_documents(text[])') IS NOT NULL,
   'The CI manifest must provide the actual regional serializer for card parity';
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 SET LOCAL ROLE service_role;
 actual:=api.get_object_resource('RESRUN999999B201')::jsonb;
 SELECT document INTO regional FROM api.tourinsoft_reunion_regional_documents(ARRAY['RESRUN999999B201']);
 RESET ROLE;
 ASSERT regional IS NOT NULL,'No published regional document for the positive card fixture';
 SELECT jsonb_agg(d->>'document_id' ORDER BY d->>'document_id') INTO reader_ids
   FROM jsonb_array_elements(actual->'menu_documents') d;
 SELECT jsonb_agg(f#>>'{DocumentFichier,MediaID}' ORDER BY f#>>'{DocumentFichier,MediaID}') INTO regional_ids
   FROM jsonb_array_elements(regional->'Fichiers') f;
 ASSERT reader_ids=regional_ids,'Public card IDs differ between object reader and real regional export';
 ASSERT reader_ids='["00000000-0000-4000-a000-00000000b231","00000000-0000-4000-a000-00000000b237"]'::jsonb,
   'Expected only the valid HTTP(S) card and inclusive date-boundary card';
 RAISE NOTICE 'R1/R3a: % complete JSON responses checked with real SQL/roles; no RLS mutation',checked;
END;
$test$;
ROLLBACK;
