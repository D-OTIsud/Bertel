\set ON_ERROR_STOP on
\ir assert_partner_api_ephemeral.sql
-- Run after R3b preparation + privacy cutover. This disposable transaction captures
-- the pre-privacy INVOKER behavior by removing only the six new SELECT restrictions,
-- then restores their EXACT catalog definitions. All fixtures/DDL roll back.
BEGIN;
SET LOCAL statement_timeout='30s';
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
CREATE TEMP TABLE r3b_cuisine_reader_guard AS
 SELECT p.oid,pg_get_functiondef(p.oid) AS definition,to_jsonb(p) AS metadata FROM pg_proc p WHERE p.oid IN(
 'api.search_restaurants_by_cuisine(text[],text[],integer,integer)'::regprocedure,
 'api.search_events_by_restaurant_cuisine(text[],text[],integer,integer)'::regprocedure);
DO $test$ BEGIN
 ASSERT (SELECT count(*) FROM r3b_cuisine_reader_guard)=2;
 ASSERT NOT EXISTS(SELECT 1 FROM pg_proc p JOIN r3b_cuisine_reader_guard g ON g.oid=p.oid WHERE p.prosecdef),'cuisine searches must remain INVOKER';
END;$test$;

INSERT INTO auth.users(id,email) VALUES
 ('00000000-0000-4000-a000-00000000d811','cuisine-corrector@example.test'),
 ('00000000-0000-4000-a000-00000000d812','cuisine-other-office@example.test');
INSERT INTO public.app_user_profile(id,role) VALUES
 ('00000000-0000-4000-a000-00000000d811','super_admin'),
 ('00000000-0000-4000-a000-00000000d812','tourism_agent')
 ON CONFLICT(id) DO UPDATE SET role=EXCLUDED.role;
INSERT INTO public.ref_code(id,domain,code,name,position) VALUES
 ('00000000-0000-4000-a000-00000000d831','cuisine_type','ci_r3b_public','CI public cuisine',1),
 ('00000000-0000-4000-a000-00000000d832','cuisine_type','ci_r3b_private','CI private cuisine',2),
 ('00000000-0000-4000-a000-00000000d833','cuisine_type','ci_r3b_partners','CI partners cuisine',3);
INSERT INTO public.object(id,object_type,name,status,is_test) VALUES
 ('RESRUN999999D811','RES','CI cuisine mixed','published',false),
 ('RESRUN999999D812','RES','CI cuisine private only','published',false),
 ('RESRUN999999D813','RES','CI cuisine partners only','published',false),
 ('RESRUN999999D814','RES','CI cuisine inactive only','published',false),
 ('FMARUN999999D821','FMA','CI cuisine all restaurants','published',false),
 ('FMARUN999999D822','FMA','CI cuisine private restaurant','published',false),
 ('FMARUN999999D823','FMA','CI cuisine partners restaurant','published',false);
INSERT INTO public.object_location(object_id,city,is_main_location)
 SELECT id,'CI cuisine fixture',true FROM public.object WHERE id IN('RESRUN999999D811','RESRUN999999D812','RESRUN999999D813','RESRUN999999D814','FMARUN999999D821','FMARUN999999D822','FMARUN999999D823');
INSERT INTO public.object_relation(source_object_id,target_object_id,relation_type_id)
 SELECT x.event_id,x.restaurant_id,t.id FROM (VALUES
 ('FMARUN999999D821','RESRUN999999D811'),('FMARUN999999D821','RESRUN999999D812'),('FMARUN999999D821','RESRUN999999D813'),
 ('FMARUN999999D822','RESRUN999999D812'),('FMARUN999999D823','RESRUN999999D813')) x(event_id,restaurant_id)
 CROSS JOIN LATERAL(SELECT id FROM public.ref_object_relation_type WHERE code='recommended_with')t;
INSERT INTO public.object_menu(id,object_id,name,visibility,is_active) VALUES
 ('00000000-0000-4000-a000-00000000d841','RESRUN999999D811','CI public menu','public',true),
 ('00000000-0000-4000-a000-00000000d842','RESRUN999999D811','CI private menu','private',true),
 ('00000000-0000-4000-a000-00000000d843','RESRUN999999D811','CI partners menu','partners',true),
 ('00000000-0000-4000-a000-00000000d844','RESRUN999999D812','CI private-only menu','private',true),
 ('00000000-0000-4000-a000-00000000d845','RESRUN999999D813','CI partners-only menu','partners',true),
 ('00000000-0000-4000-a000-00000000d846','RESRUN999999D814','CI inactive public menu','public',false);
CREATE TEMP TABLE r3b_cuisine_items AS SELECT
 md5('ci-r3b-cuisine-'||m.id::text||'-'||n)::uuid AS id,m.id AS menu_id,n,
 CASE m.visibility WHEN 'private' THEN '00000000-0000-4000-a000-00000000d832'::uuid
  WHEN 'partners' THEN '00000000-0000-4000-a000-00000000d833'::uuid ELSE '00000000-0000-4000-a000-00000000d831'::uuid END AS cuisine_type_id
 FROM public.object_menu m CROSS JOIN LATERAL generate_series(1,CASE m.visibility WHEN 'private' THEN 2 WHEN 'partners' THEN 3 ELSE 1 END)n
 WHERE m.id IN('00000000-0000-4000-a000-00000000d841','00000000-0000-4000-a000-00000000d842','00000000-0000-4000-a000-00000000d843','00000000-0000-4000-a000-00000000d844','00000000-0000-4000-a000-00000000d845','00000000-0000-4000-a000-00000000d846');
INSERT INTO public.object_menu_item(id,menu_id,name,is_available,position)
 SELECT id,menu_id,'CI dish '||n,true,n FROM r3b_cuisine_items;
INSERT INTO public.object_menu_item_cuisine_type(menu_item_id,cuisine_type_id) SELECT id,cuisine_type_id FROM r3b_cuisine_items;
-- Existing availability filtering remains a reader concern, not a new RLS flag.
INSERT INTO public.object_menu_item(id,menu_id,name,is_available) VALUES
 ('00000000-0000-4000-a000-00000000d851','00000000-0000-4000-a000-00000000d841','CI unavailable public dish',false);
INSERT INTO public.object_menu_item_cuisine_type(menu_item_id,cuisine_type_id) VALUES
 ('00000000-0000-4000-a000-00000000d851','00000000-0000-4000-a000-00000000d831');

CREATE TEMP TABLE r3b_cuisine_policies AS
 SELECT p.polrelid,p.polname,p.polcmd,p.polpermissive,
 p.polroles,pg_get_expr(p.polqual,p.polrelid) AS qualification,
 format('CREATE POLICY %I ON %I.%I AS RESTRICTIVE FOR SELECT TO %s USING (%s)',p.polname,n.nspname,c.relname,
   (SELECT string_agg(CASE WHEN role_id=0 THEN 'PUBLIC' ELSE quote_ident(r.rolname) END,',' ORDER BY role_id)
    FROM unnest(p.polroles) role_id LEFT JOIN pg_roles r ON r.oid=role_id),pg_get_expr(p.polqual,p.polrelid)) AS restore_sql
 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND ((c.relname='object_menu' AND p.polname='menu_visibility_read')
  OR(c.relname='object_menu_item' AND p.polname='menu_item_visibility_read')
  OR(c.relname IN('object_menu_item_media','object_menu_item_dietary_tag','object_menu_item_allergen','object_menu_item_cuisine_type') AND p.polname='menu_link_visibility_read'));
DO $policies$ DECLARE p record;BEGIN
 ASSERT (SELECT count(*) FROM r3b_cuisine_policies)=6,'install the complete R3b cutover before its cuisine test';
 ASSERT (SELECT count(*) FROM public.object_relation WHERE source_object_id IN('FMARUN999999D821','FMARUN999999D822','FMARUN999999D823'))=5,'missing fixture relations';
 ASSERT NOT EXISTS(SELECT 1 FROM r3b_cuisine_policies WHERE polpermissive OR polcmd<>'r'),'unexpected policy family';
 FOR p IN SELECT * FROM r3b_cuisine_policies LOOP EXECUTE format('DROP POLICY %I ON %s',p.polname,p.polrelid::regclass);END LOOP;
END;$policies$;
CREATE TEMP TABLE r3b_cuisine_results(phase text,principal text,query text,rpc text,result jsonb,PRIMARY KEY(phase,principal,query,rpc));
GRANT INSERT ON r3b_cuisine_results TO anon,authenticated,service_role;

DO $capture$
DECLARE phase text;principal text;role_name text;claims text;q text;codes text[];p record;
BEGIN
 FOREACH phase IN ARRAY ARRAY['before','after'] LOOP
  IF phase='after' THEN FOR p IN SELECT restore_sql FROM r3b_cuisine_policies LOOP EXECUTE p.restore_sql;END LOOP;END IF;
  FOREACH principal IN ARRAY ARRAY['anon','other_office','corrector','service_role'] LOOP
   role_name:=CASE WHEN principal IN('other_office','corrector') THEN 'authenticated' ELSE principal END;
   claims:=CASE principal WHEN 'corrector' THEN '{"sub":"00000000-0000-4000-a000-00000000d811","role":"authenticated"}'
    WHEN 'other_office' THEN '{"sub":"00000000-0000-4000-a000-00000000d812","role":"authenticated"}'
    ELSE jsonb_build_object('role',role_name)::text END;
   PERFORM set_config('request.jwt.claims',claims,true);
   EXECUTE format('SET LOCAL ROLE %I',role_name);
   FOREACH q IN ARRAY ARRAY['all','public','private','partners','none'] LOOP
    codes:=CASE q WHEN 'all' THEN ARRAY['ci_r3b_public','ci_r3b_private','ci_r3b_partners'] ELSE ARRAY['ci_r3b_'||q] END;
    INSERT INTO r3b_cuisine_results VALUES(phase,principal,q,'restaurants',api.search_restaurants_by_cuisine(codes)::jsonb);
    INSERT INTO r3b_cuisine_results VALUES(phase,principal,q,'events',api.search_events_by_restaurant_cuisine(codes)::jsonb);
   END LOOP;
   RESET ROLE;
  END LOOP;
 END LOOP;
END;$capture$;

DO $assertions$
DECLARE r jsonb;e jsonb;v_principal text;
BEGIN
 ASSERT (SELECT count(*) FROM r3b_cuisine_results)=80,'incomplete actual-role capture';
 -- Full JSON equality, with definitions/attributes unchanged, proves privileged
 -- callers keep their existing data/labels/types/counts rather than assuming it.
 ASSERT NOT EXISTS(SELECT 1 FROM r3b_cuisine_results b JOIN r3b_cuisine_results a USING(principal,query,rpc)
   WHERE b.phase='before' AND a.phase='after' AND b.principal IN('corrector','service_role') AND b.result IS DISTINCT FROM a.result),
  'R3b changed a canonical/service cuisine response';
 FOREACH v_principal IN ARRAY ARRAY['anon','other_office'] LOOP
  SELECT result INTO r FROM r3b_cuisine_results WHERE phase='before' AND r3b_cuisine_results.principal=v_principal AND query='all' AND rpc='restaurants';
  ASSERT r->>'total'='3','pre-privacy fixture did not expose all active restaurant menus';
  SELECT result INTO r FROM r3b_cuisine_results WHERE phase='after' AND r3b_cuisine_results.principal=v_principal AND query='all' AND rpc='restaurants';
  ASSERT r->>'total'='1' AND r#>>'{restaurants,0,id}'='RESRUN999999D811','private/partners-only restaurant leaked';
  ASSERT r#>>'{restaurants,0,menu_summary,total_menus}'='1' AND r#>>'{restaurants,0,menu_summary,total_items}'='1','private counts leaked';
  ASSERT r#>>'{restaurants,0,cuisine_counts,ci_r3b_public}'='1';
  ASSERT jsonb_array_length(r#>'{restaurants,0,cuisine_types}')=1 AND r#>>'{restaurants,0,cuisine_types,0,code}'='ci_r3b_public';
  SELECT result INTO e FROM r3b_cuisine_results WHERE phase='after' AND r3b_cuisine_results.principal=v_principal AND query='all' AND rpc='events';
  ASSERT e->>'total'='1' AND e#>>'{events,0,id}'='FMARUN999999D821','event matched only by private/partners cuisine leaked';
  ASSERT e#>>'{events,0,cuisine_counts,ci_r3b_public}'='1' AND jsonb_array_length(e#>'{events,0,associated_restaurants}')=1;
  -- Public-only request previously included hidden cuisines in a nested restaurant.
  SELECT result INTO e FROM r3b_cuisine_results WHERE phase='before' AND r3b_cuisine_results.principal=v_principal AND query='public' AND rpc='events';
  ASSERT jsonb_array_length(e#>'{events,0,associated_restaurants,0,cuisine_types}')=6;
  SELECT result INTO e FROM r3b_cuisine_results WHERE phase='after' AND r3b_cuisine_results.principal=v_principal AND query='public' AND rpc='events';
  ASSERT jsonb_array_length(e#>'{events,0,associated_restaurants,0,cuisine_types}')=1
    AND e#>>'{events,0,associated_restaurants,0,cuisine_types,0,code}'='ci_r3b_public','nested hidden cuisine leaked';
  ASSERT NOT EXISTS(SELECT 1 FROM r3b_cuisine_results x WHERE x.phase='after' AND x.principal=v_principal AND x.query IN('private','partners') AND x.result->>'total'<>'0');
 END LOOP;
 FOREACH v_principal IN ARRAY ARRAY['corrector','service_role'] LOOP
  SELECT result INTO r FROM r3b_cuisine_results WHERE phase='after' AND r3b_cuisine_results.principal=v_principal AND query='all' AND rpc='restaurants';
  ASSERT r->>'total'='3';
  ASSERT EXISTS(SELECT 1 FROM jsonb_array_elements(r->'restaurants') x WHERE x->>'id'='RESRUN999999D811'
    AND x#>>'{menu_summary,total_menus}'='3' AND x#>>'{menu_summary,total_items}'='6'
    AND x#>>'{cuisine_counts,ci_r3b_private}'='2' AND x#>>'{cuisine_counts,ci_r3b_partners}'='3');
  SELECT result INTO e FROM r3b_cuisine_results WHERE phase='after' AND r3b_cuisine_results.principal=v_principal AND query='all' AND rpc='events';
  ASSERT e->>'total'='3';
  ASSERT EXISTS(SELECT 1 FROM jsonb_array_elements(e->'events') x WHERE x->>'id'='FMARUN999999D821'
    AND x#>>'{cuisine_counts,ci_r3b_private}'='2' AND x#>>'{cuisine_counts,ci_r3b_partners}'='2');
 END LOOP;
 -- Preserve the existing empty serializer shape (null collection, total zero).
 ASSERT NOT EXISTS(SELECT 1 FROM r3b_cuisine_results WHERE query='none' AND (result->>'total'<>'0' OR result->rpc IS DISTINCT FROM 'null'::jsonb));
 ASSERT NOT EXISTS(SELECT 1 FROM pg_proc p JOIN r3b_cuisine_reader_guard g ON g.oid=p.oid
   WHERE pg_get_functiondef(p.oid) IS DISTINCT FROM g.definition OR to_jsonb(p) IS DISTINCT FROM g.metadata),'reader source/attributes changed';
 ASSERT (SELECT count(*) FROM pg_policy p JOIN r3b_cuisine_policies b ON b.polrelid=p.polrelid AND b.polname=p.polname
   WHERE p.polcmd=b.polcmd AND p.polpermissive=b.polpermissive AND p.polroles=b.polroles
     AND pg_get_expr(p.polqual,p.polrelid)=b.qualification)=6,'R3b SELECT policies were not restored exactly';
END;$assertions$;
SELECT principal,query,rpc,result->>'total' AS total FROM r3b_cuisine_results WHERE phase='after' ORDER BY principal,query,rpc;
ROLLBACK;
