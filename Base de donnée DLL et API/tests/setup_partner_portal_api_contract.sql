-- Disposable Supabase only. Persists shared fixtures/oracles for SQL and real HTTP routes.
-- Run once before R1/R3a for upgrade, or after them for a fresh final-schema check.
-- PGOPTIONS='-c bertel.ephemeral_ci=on' is required; never run on production.
\set ON_ERROR_STOP on
DO $$ BEGIN
 IF current_setting('bertel.ephemeral_ci',true) IS DISTINCT FROM 'on' THEN
  RAISE EXCEPTION 'Disposable Supabase required: bertel.ephemeral_ci=on';
 END IF;
END $$;
BEGIN;
SET LOCAL statement_timeout='30s';
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);

-- Fixture UUIDs deliberately have a fixed b prefix and example.test addresses.
INSERT INTO auth.users(id,email) VALUES
 ('00000000-0000-4000-a000-00000000b911','portal-office-b911@example.test'),
 ('00000000-0000-4000-a000-00000000b912','portal-other-b912@example.test'),
 ('00000000-0000-4000-a000-00000000b913','portal-actor-b913@example.test'),
 ('00000000-0000-4000-a000-00000000b914','portal-super-b914@example.test');
INSERT INTO public.actor(id,display_name,is_test)
 VALUES('00000000-0000-4000-a000-00000000b921','Portal API fixture actor',false);
INSERT INTO public.app_user_profile(id,role,actor_id) VALUES
 ('00000000-0000-4000-a000-00000000b911','tourism_agent',NULL),
 ('00000000-0000-4000-a000-00000000b912','tourism_agent',NULL),
 ('00000000-0000-4000-a000-00000000b913','actor','00000000-0000-4000-a000-00000000b921'),
 ('00000000-0000-4000-a000-00000000b914','super_admin',NULL)
 ON CONFLICT(id) DO UPDATE SET role=EXCLUDED.role,actor_id=EXCLUDED.actor_id;
INSERT INTO public.object(id,object_type,name,status,is_test) VALUES
 ('ORGRUN999999B901','ORG','Portal fixture office','published',false),
 ('ORGRUN999999B902','ORG','Portal other office','published',false),
 ('ACTRUN999999B101','ACT','Portal activity populated','published',false),
 ('ACTRUN999999B102','ACT','Portal activity absent','published',false),
 ('ASCRUN999999B103','ASC','Portal ASC populated','published',false),
 ('ASCRUN999999B104','ASC','Portal ASC absent','published',false),
 ('RESRUN999999B201','RES','Portal restaurant complete','published',false),
 ('RESRUN999999B202','RES','Portal restaurant empty','published',false),
 ('FMARUN999999B203','FMA','Portal event shared reader','published',false);
INSERT INTO public.user_org_membership(user_id,org_object_id,is_active) VALUES
 ('00000000-0000-4000-a000-00000000b911','ORGRUN999999B901',true),
 ('00000000-0000-4000-a000-00000000b912','ORGRUN999999B902',true);
INSERT INTO public.object_org_link(object_id,org_object_id,role_id,is_primary)
 SELECT o.id,'ORGRUN999999B901',r.id,true FROM public.object o
 CROSS JOIN public.ref_org_role r WHERE r.code='publisher'
 AND o.id IN ('ACTRUN999999B101','ACTRUN999999B102','ASCRUN999999B103','ASCRUN999999B104',
              'RESRUN999999B201','RESRUN999999B202','FMARUN999999B203');
INSERT INTO public.actor_object_role(actor_id,object_id,role_id,is_primary)
 SELECT '00000000-0000-4000-a000-00000000b921',o.id,r.id,true FROM public.object o
 CROSS JOIN LATERAL (SELECT id FROM public.ref_actor_role ORDER BY code LIMIT 1) r
 WHERE o.id IN ('ACTRUN999999B101','ACTRUN999999B102','ASCRUN999999B103','ASCRUN999999B104',
               'RESRUN999999B201','RESRUN999999B202','FMARUN999999B203');

-- No reference to the new column: setup also works against the live pre-R1 schema.
INSERT INTO public.object_act(object_id,duration_min,min_participants,max_participants,
 difficulty_level,guide_required,min_age,equipment_provided) VALUES
 ('ACTRUN999999B101',90,1,12,2,true,0,true),
 ('ASCRUN999999B103',45,2,8,1,false,NULL,false);
INSERT INTO public.object_description(object_id,description,description_i18n,visibility)
 VALUES('RESRUN999999B201','**Restaurant** description',
        '{"fr":"**Restaurant** description","en":"**Restaurant** English description"}','public');
INSERT INTO public.object_menu(id,object_id,name,description,is_active,visibility,position) VALUES
 ('00000000-0000-4000-a000-00000000b211','RESRUN999999B201','Visible menu','**Original** description',true,'public',1),
 ('00000000-0000-4000-a000-00000000b212','RESRUN999999B201','Inactive menu','Retained for office',false,'public',2),
 ('00000000-0000-4000-a000-00000000b213','RESRUN999999B201','Private menu',NULL,true,'private',3),
 ('00000000-0000-4000-a000-00000000b214','RESRUN999999B201','Partners menu',NULL,true,'partners',4),
 ('00000000-0000-4000-a000-00000000b215','RESRUN999999B201','Legacy public menu',NULL,true,NULL,5);
INSERT INTO public.object_menu_item(id,menu_id,name,description,price,currency,is_available,position) VALUES
 ('00000000-0000-4000-a000-00000000b221','00000000-0000-4000-a000-00000000b211','Visible dish B221','**Dish** description',12.50,'EUR',true,1),
 ('00000000-0000-4000-a000-00000000b222','00000000-0000-4000-a000-00000000b211','Unavailable dish B222',NULL,0,'EUR',false,2),
 ('00000000-0000-4000-a000-00000000b223','00000000-0000-4000-a000-00000000b212','Inactive dish B223',NULL,19,'EUR',true,1),
 ('00000000-0000-4000-a000-00000000b224','00000000-0000-4000-a000-00000000b213','Private dish B224',NULL,NULL,'EUR',true,1),
 ('00000000-0000-4000-a000-00000000b225','00000000-0000-4000-a000-00000000b214','Partners dish B225',NULL,5,'EUR',true,1),
 ('00000000-0000-4000-a000-00000000b226','00000000-0000-4000-a000-00000000b215','Legacy dish B226',NULL,7.25,'EUR',true,1);
INSERT INTO public.object_menu_item_allergen(menu_item_id,allergen_id)
 SELECT '00000000-0000-4000-a000-00000000b221',id FROM public.ref_code_allergen ORDER BY code LIMIT 1;
INSERT INTO public.object_menu_item_dietary_tag(menu_item_id,dietary_tag_id)
 SELECT '00000000-0000-4000-a000-00000000b221',id FROM public.ref_code_dietary_tag ORDER BY code LIMIT 1;
INSERT INTO public.object_menu_item_cuisine_type(menu_item_id,cuisine_type_id)
 SELECT '00000000-0000-4000-a000-00000000b221',id FROM public.ref_code_cuisine_type ORDER BY code LIMIT 1;

INSERT INTO public.ref_document(id,url,title,access_scope,valid_from,valid_to) VALUES
 ('00000000-0000-4000-a000-00000000b231','https://files.example.test/cards/b231.pdf','Valid document','public',NULL,NULL),
 ('00000000-0000-4000-a000-00000000b232','https://files.example.test/cards/b232.pdf','Future link','public',NULL,NULL),
 ('00000000-0000-4000-a000-00000000b233','https://files.example.test/cards/b233.pdf','Expired link','public',NULL,NULL),
 ('00000000-0000-4000-a000-00000000b234','https://files.example.test/cards/b234.pdf','Future document','public',CURRENT_DATE+1,NULL),
 ('00000000-0000-4000-a000-00000000b235','https://files.example.test/cards/b235.pdf','Expired document','public',NULL,CURRENT_DATE-1),
 ('00000000-0000-4000-a000-00000000b236','https://files.example.test/cards/b236.pdf','Private document','crm_private',NULL,NULL),
 ('00000000-0000-4000-a000-00000000b237','https://files.example.test/cards/b237.jpg','Inclusive boundary document','public',CURRENT_DATE,CURRENT_DATE);
INSERT INTO public.object_document(object_id,document_id,role_id,title,position,valid_from,valid_to)
 SELECT 'RESRUN999999B201',d.id,r.id,'Link title '||right(d.id::text,4),
        row_number() OVER(ORDER BY d.id)::integer,
        CASE right(d.id::text,4) WHEN 'b232' THEN CURRENT_DATE+1 WHEN 'b237' THEN CURRENT_DATE END,
        CASE right(d.id::text,4) WHEN 'b233' THEN CURRENT_DATE-1 WHEN 'b237' THEN CURRENT_DATE END
 FROM public.ref_document d CROSS JOIN public.ref_code_document_type r
 WHERE r.code='carte' AND d.id IN (
 '00000000-0000-4000-a000-00000000b231','00000000-0000-4000-a000-00000000b232',
 '00000000-0000-4000-a000-00000000b233','00000000-0000-4000-a000-00000000b234',
 '00000000-0000-4000-a000-00000000b235','00000000-0000-4000-a000-00000000b236','00000000-0000-4000-a000-00000000b237');
-- The valid source is also shared: no visibility patch may unlink or delete it.
INSERT INTO public.object_document(object_id,document_id,role_id)
 SELECT 'ORGRUN999999B901','00000000-0000-4000-a000-00000000b231',id
 FROM public.ref_code_document_type WHERE code='carte';

CREATE TABLE internal.portal_api_contract_reader_before AS
 SELECT pg_get_functiondef(p.oid) AS definition,md5(replace(p.prosrc,E'\r\n',E'\n')) AS source_md5,
 jsonb_build_object('owner',p.proowner,'acl',to_jsonb(p.proacl),'config',to_jsonb(p.proconfig),
  'definer',p.prosecdef,'strict',p.proisstrict,'volatility',p.provolatile,
  'parallel',p.proparallel,'returns',p.prorettype,'set',p.proretset,'args',p.proargtypes::text) AS metadata
 FROM pg_proc p WHERE p.oid='api.get_object_resource(text,text[],text,jsonb)'::regprocedure;
CREATE TABLE internal.portal_api_contract_baseline(
 principal text NOT NULL, db_role text NOT NULL, claims jsonb NOT NULL,
 object_id text NOT NULL, variant text NOT NULL, lang_prefs text[] NOT NULL,
 options jsonb NOT NULL, extended boolean NOT NULL, original jsonb NOT NULL, expected jsonb NOT NULL,
 PRIMARY KEY(principal,object_id,variant));
REVOKE ALL ON internal.portal_api_contract_reader_before,internal.portal_api_contract_baseline FROM PUBLIC,anon,authenticated;

DO $capture$
DECLARE p record; f record; v record; actual jsonb; expected jsonb; menus jsonb; menu jsonb; items jsonb;
BEGIN
 FOR p IN SELECT * FROM (VALUES
   ('anon','anon','{"role":"anon"}'::jsonb,false),
   ('service','service_role','{"role":"service_role"}'::jsonb,false),
   ('other_office','authenticated','{"role":"authenticated","sub":"00000000-0000-4000-a000-00000000b912"}'::jsonb,false),
   ('office','authenticated','{"role":"authenticated","sub":"00000000-0000-4000-a000-00000000b911"}'::jsonb,true),
   ('actor','authenticated','{"role":"authenticated","sub":"00000000-0000-4000-a000-00000000b913"}'::jsonb,true),
   ('super_no_membership','authenticated','{"role":"authenticated","sub":"00000000-0000-4000-a000-00000000b914"}'::jsonb,false)
 ) roles(principal,db_role,claims,extended) LOOP
  FOR f IN SELECT unnest(ARRAY['ACTRUN999999B101','ACTRUN999999B102','ASCRUN999999B103','ASCRUN999999B104',
           'RESRUN999999B201','RESRUN999999B202','FMARUN999999B203']) AS object_id LOOP
   FOR v IN SELECT * FROM (VALUES ('fr',ARRAY['fr'],'{}'::jsonb),
     ('en',ARRAY['en','fr'],'{}'::jsonb),('no_render',ARRAY['fr'],'{"render":false}'::jsonb)
   ) variants(variant,langs,options) LOOP
    PERFORM set_config('request.jwt.claims',p.claims::text,true);
    ASSERT api.can_read_extended(f.object_id)=p.extended,'Fixture scope does not match the intended principal';
    EXECUTE format('SET LOCAL ROLE %I',p.db_role);
    actual:=api.get_object_resource(f.object_id,v.langs,'none',v.options)::jsonb;
    RESET ROLE;
    ASSERT actual IS NOT NULL,'Published fixture not returned';
    -- Explicit R1-only normalization: old fresh-apply already added the undeployed
    -- column. A true upgrade baseline omits it naturally; no other key is exempted.
    expected:=actual #- '{activity,equipment_provided_details}';
    IF NOT p.extended THEN
     IF expected ? 'menus' THEN
      menus:='[]'::jsonb;
      FOR menu IN SELECT value FROM jsonb_array_elements(expected->'menus') LOOP
       IF menu->>'id' IN ('00000000-0000-4000-a000-00000000b212',
                         '00000000-0000-4000-a000-00000000b213','00000000-0000-4000-a000-00000000b214') THEN CONTINUE; END IF;
       SELECT COALESCE(jsonb_agg(x.value ORDER BY x.ordinality),'[]') INTO items
        FROM jsonb_array_elements(menu->'items') WITH ORDINALITY x(value,ordinality)
        WHERE x.value->>'id'<>'00000000-0000-4000-a000-00000000b222';
       menus:=menus||jsonb_build_array(jsonb_set(menu,'{items}',items));
      END LOOP;
      expected:=jsonb_set(expected,'{menus}',menus);
     END IF;
     IF expected ? 'menu_documents' THEN
      SELECT COALESCE(jsonb_agg(x.value ORDER BY x.ordinality),'[]') INTO items
       FROM jsonb_array_elements(expected->'menu_documents') WITH ORDINALITY x(value,ordinality)
       WHERE x.value->>'document_id' IN ('00000000-0000-4000-a000-00000000b231','00000000-0000-4000-a000-00000000b237');
      expected:=jsonb_set(expected,'{menu_documents}',items);
     END IF;
     IF expected#>'{render,menu_item_lines}' IS NOT NULL THEN
      SELECT COALESCE(jsonb_agg(x.value ORDER BY x.ordinality),'[]') INTO items
       FROM jsonb_array_elements(expected#>'{render,menu_item_lines}') WITH ORDINALITY x(value,ordinality)
       WHERE x.value#>>'{}' NOT LIKE 'Inactive dish B223%';
      expected:=jsonb_set(expected,'{render,menu_item_lines}',items);
     END IF;
    END IF;
    INSERT INTO internal.portal_api_contract_baseline VALUES
     (p.principal,p.db_role,p.claims,f.object_id,v.variant,v.langs,v.options,p.extended,actual,expected);
   END LOOP;
  END LOOP;
 END LOOP;
END;
$capture$;
COMMIT;
