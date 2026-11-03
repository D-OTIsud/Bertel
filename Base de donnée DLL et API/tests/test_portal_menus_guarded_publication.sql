-- Isolated CI database ONLY. No PDF, provider call, storage upload or production write.
\ir assert_partner_api_ephemeral.sql
-- Same R4 acceptance after extraction into the shared private writer: intention UUIDs,
-- allergen add/remove/add, bounded prices, rollback and current-state retry all remain required.
\ir test_object_menus_atomic_reconcile.sql
BEGIN;
DO $test$
DECLARE
  v_user uuid:='00000000-0000-4000-a000-000000009101'; v_actor uuid:='00000000-0000-4000-a000-000000009102';
  v_admin uuid:='00000000-0000-4000-a000-000000009103'; v_menu uuid:='00000000-0000-4000-a000-000000009104';
  v_item uuid:='00000000-0000-4000-a000-000000009105'; v_private uuid:='00000000-0000-4000-a000-000000009106';
  v_inactive uuid:='00000000-0000-4000-a000-000000009107'; v_partners uuid:='00000000-0000-4000-a000-000000009108';
  v_null uuid:='00000000-0000-4000-a000-000000009109'; v_photo uuid:='00000000-0000-4000-a000-000000009110';
  v_new uuid:='00000000-0000-4000-a000-000000009111'; v_type uuid; v_role uuid; v_org_role uuid;
  v_base jsonb; v_snapshot jsonb; v_raw jsonb; v_payload jsonb; v_result jsonb; v_patch jsonb; v_row jsonb;
  v_denied boolean; v_table text; v_columns text;
BEGIN
  ASSERT NOT has_function_privilege('authenticated','api.publish_portal_menus(text,jsonb,uuid)','execute'),'M must remain OFF in preparation';
  ASSERT NOT has_function_privilege('authenticated','internal.apply_object_menus_patch(text,jsonb)','execute');
  ASSERT NOT has_function_privilege('anon','api.get_portal_menus_snapshot(text)','execute');
  ASSERT NOT (SELECT enabled FROM internal.portal_menu_write_configuration WHERE singleton);
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  INSERT INTO auth.users(id,email) VALUES(v_user,'m-actor@example.test'),(v_admin,'m-office@example.test');
  INSERT INTO public.actor(id,display_name,extra) VALUES(v_actor,'M restaurant actor','{"test_corpus":true}');
  INSERT INTO public.app_user_profile(id,role,actor_id) VALUES(v_user,'actor',v_actor),(v_admin,'super_admin',NULL)
    ON CONFLICT(id) DO UPDATE SET role=EXCLUDED.role,actor_id=EXCLUDED.actor_id;
  INSERT INTO public.object(id,object_type,name,status,is_test) VALUES
    ('ORGRUN9999999101','ORG','M office','published',true),('RESRUN9999999102','RES','M restaurant','published',true),
    ('RESRUN9999999103','RES','M other restaurant','published',true),('HOTRUN9999999104','HOT','M hotel','published',true),('FMARUN9999999105','FMA','M event','published',true);
  INSERT INTO public.org_config(org_object_id,is_test_org) VALUES('ORGRUN9999999101',true);
  SELECT id INTO v_role FROM public.ref_actor_role WHERE code='operator';
  SELECT id INTO v_org_role FROM public.ref_org_role WHERE code='publisher';
  INSERT INTO public.object_org_link(object_id,org_object_id,role_id,is_primary) VALUES('RESRUN9999999102','ORGRUN9999999101',v_org_role,true);
  INSERT INTO public.actor_object_role(actor_id,object_id,role_id,is_primary) VALUES
    (v_actor,'RESRUN9999999102',v_role,true),(v_actor,'HOTRUN9999999104',v_role,true),(v_actor,'FMARUN9999999105',v_role,true);
  INSERT INTO public.object_menu(id,object_id,name,visibility,is_active,created_at) VALUES
    (v_menu,'RESRUN9999999102','Public','public',true,'2020-01-01'),(v_private,'RESRUN9999999102','Office secret','private',true,'2020-01-01'),
    (v_partners,'RESRUN9999999102','Partner-only','partners',true,'2020-01-01'),(v_null,'RESRUN9999999102','Legacy hidden',NULL,true,'2020-01-01'),
    (v_inactive,'RESRUN9999999102','Seasonal','public',false,'2020-01-01');
  SELECT id INTO v_type FROM public.ref_code_media_type WHERE code='photo';
  INSERT INTO public.media(id,object_id,media_type_id,url,visibility) VALUES(v_photo,'RESRUN9999999102',v_type,'https://example.test/office-private.jpg','private');
  INSERT INTO public.object_menu_item(id,menu_id,name,price,media_id,is_available,created_at) VALUES(v_item,v_menu,'Cari',18,v_photo,false,'2020-01-01');
  v_base:='{"write_contract":"menus-reconcile-v1","menus":[],"items":[],"deleted_menus":[],"deleted_items":[]}';
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_user,'role','authenticated')::text,true);
  v_denied:=false;
  BEGIN PERFORM api.get_portal_menus_snapshot('RESRUN9999999102'); EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
  ASSERT v_denied,'actor feature was enabled before cutover';
  -- Simulate the explicit cutover inside this disposable transaction only.
  FOREACH v_table IN ARRAY ARRAY['object_menu','object_menu_item','object_menu_item_media','object_menu_item_dietary_tag','object_menu_item_allergen','object_menu_item_cuisine_type'] LOOP
    EXECUTE format('REVOKE INSERT,UPDATE,DELETE ON public.%I FROM PUBLIC,anon,authenticated',v_table);
    SELECT string_agg(quote_ident(column_name),',') INTO v_columns FROM information_schema.columns WHERE table_schema='public' AND table_name=v_table;
    EXECUTE format('REVOKE INSERT(%s),UPDATE(%s) ON public.%I FROM PUBLIC,anon,authenticated',v_columns,v_columns,v_table);
  END LOOP;
  GRANT EXECUTE ON FUNCTION api.get_portal_menus_snapshot(text),api.get_portal_menu_write_receipt(text,jsonb),api.publish_portal_menus(text,jsonb,uuid) TO authenticated;
  UPDATE internal.portal_menu_write_configuration SET enabled=true WHERE singleton;
  v_snapshot:=api.get_portal_menus_snapshot('RESRUN9999999102');
  ASSERT jsonb_array_length(v_snapshot->'menus')=2,'private/partners/null menu disclosed';
  ASSERT EXISTS(SELECT 1 FROM jsonb_array_elements(v_snapshot->'menus') r WHERE r->>'id'=v_inactive::text AND r->>'is_active'='false'),'inactive public menu cannot be managed';
  ASSERT v_snapshot#>'{items,0,media_id}'='null'::jsonb AND v_snapshot->'media'='[]'::jsonb,'office media identifier disclosed';
  v_raw:=internal.object_menu_write_snapshot('RESRUN9999999102');
  v_raw:=jsonb_set(v_raw,'{items,0,future_office_metadata}','"secret"');
  ASSERT NOT ((internal.portal_menu_write_snapshot(v_raw)#>'{items,0}') ? 'future_office_metadata'),'unknown future metadata disclosed';
  v_denied:=false;
  BEGIN PERFORM api.get_portal_menus_snapshot('RESRUN9999999103'); EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
  ASSERT v_denied,'foreign restaurant accepted';
  v_denied:=false; BEGIN PERFORM api.get_portal_menus_snapshot('HOTRUN9999999104'); EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
  ASSERT v_denied,'hotel accepted';
  v_denied:=false; BEGIN PERFORM api.get_portal_menus_snapshot('FMARUN9999999105'); EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
  ASSERT v_denied,'event accepted';
  SELECT r INTO v_row FROM jsonb_array_elements(v_snapshot->'items') r WHERE r->>'id'=v_item::text;
  v_patch:=jsonb_build_object('id',v_item,'menu_id',v_menu,'expected',v_row,'changes','{"price":0}'::jsonb,'links','{}'::jsonb);
  v_payload:=jsonb_set(v_base||jsonb_build_object('request_id',gen_random_uuid()),'{items}',jsonb_build_array(v_patch));
  UPDATE public.object_menu_item SET name='Office correction' WHERE id=v_item;
  v_denied:=false; BEGIN PERFORM api.publish_portal_menus('RESRUN9999999102',v_payload,NULL); EXCEPTION WHEN SQLSTATE 'PT409' THEN v_denied:=true; END;
  ASSERT v_denied,'stale token overwrote office correction';
  v_snapshot:=api.get_portal_menus_snapshot('RESRUN9999999102');
  SELECT r INTO v_row FROM jsonb_array_elements(v_snapshot->'items') r WHERE r->>'id'=v_item::text;
  v_payload:=jsonb_set(v_payload,'{items,0,expected}',v_row);
  v_result:=api.publish_portal_menus('RESRUN9999999102',v_payload,NULL);
  ASSERT (SELECT price=0 AND name='Office correction' AND media_id=v_photo AND NOT is_available AND created_at='2020-01-01'::timestamptz FROM public.object_menu_item WHERE id=v_item),'zero or untouched metadata lost';
  ASSERT jsonb_array_length(v_result#>'{snapshot,menus}')=2;
  SELECT r INTO v_row FROM jsonb_array_elements(v_result#>'{snapshot,items}') r WHERE r->>'id'=v_item::text;
  v_payload:=jsonb_set(v_payload,'{items,0,expected}',v_row);
  v_denied:=false;
  BEGIN PERFORM api.publish_portal_menus('RESRUN9999999102',jsonb_set(v_payload||jsonb_build_object('request_id',gen_random_uuid()),'{items,0,changes}','{"media_id":null}'),NULL); EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
  ASSERT v_denied,'actor changed an office media field';
  v_payload:=jsonb_set(v_base||jsonb_build_object('request_id',gen_random_uuid()),'{menus}',jsonb_build_array(jsonb_build_object('id',v_private,'expected','null'::jsonb,'changes','{"name":"forged","visibility":"public"}'::jsonb)));
  v_denied:=false; BEGIN PERFORM api.publish_portal_menus('RESRUN9999999102',v_payload,NULL); EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
  ASSERT v_denied,'actor rewrote a hidden menu';
  -- Manual creation needs neither carte nor extraction, and retry cannot resurrect a later deletion.
  v_payload:=jsonb_set(v_base||jsonb_build_object('request_id',gen_random_uuid()),'{menus}',jsonb_build_array(jsonb_build_object('id',v_new,'expected','null'::jsonb,'changes','{"name":"Manual menu","visibility":"public","is_active":true,"position":3}'::jsonb)));
  v_result:=api.publish_portal_menus('RESRUN9999999102',v_payload,NULL);
  DELETE FROM public.object_menu WHERE id=v_new;
  v_result:=api.publish_portal_menus('RESRUN9999999102',v_payload,NULL);
  ASSERT v_result->>'replayed'='true' AND NOT EXISTS(SELECT 1 FROM public.object_menu WHERE id=v_new),'retry resurrected manual menu';
  v_result:=api.get_portal_menu_write_receipt('RESRUN9999999102',jsonb_build_object('request_id',v_payload->'request_id'));
  ASSERT v_result->>'known'='true' AND jsonb_array_length(v_result#>'{snapshot,menus}')=2;
  INSERT INTO public.org_actor_module_visibility(org_object_id,object_type,module_id,is_visible) VALUES('ORGRUN9999999101','RES','menus',false);
  v_denied:=false; BEGIN PERFORM api.publish_portal_menus('RESRUN9999999102',v_payload,NULL); EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
  ASSERT v_denied,'mask bypassed by receipt retry';
  DELETE FROM public.org_actor_module_visibility WHERE org_object_id='ORGRUN9999999101';
  -- The office façade still rejects the actor even though manual actor publication is enabled.
  v_denied:=false; BEGIN PERFORM api.save_object_menus('RESRUN9999999102',v_payload); EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
  ASSERT v_denied,'office writer became an alternate actor path';
  ASSERT (SELECT name='Office secret' AND visibility='private' FROM public.object_menu WHERE id=v_private);
  ASSERT (SELECT visibility='partners' FROM public.object_menu WHERE id=v_partners);
  ASSERT (SELECT visibility IS NULL FROM public.object_menu WHERE id=v_null);
  v_snapshot:=api.get_portal_menus_snapshot('RESRUN9999999102');
  SELECT r INTO v_row FROM jsonb_array_elements(v_snapshot->'items') r WHERE r->>'id'=v_item::text;
  v_payload:=jsonb_set(v_base||jsonb_build_object('request_id',gen_random_uuid()),'{items}',jsonb_build_array(jsonb_build_object('id',v_item,'menu_id',v_menu,'expected',v_row,'changes','{"price":null}'::jsonb,'links','{}'::jsonb)));
  PERFORM set_config('m.real_authenticated_payload',v_payload::text,true);
END $test$;
-- Execute the published RPC as the real database role, rather than an owner simulating claims.
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  PERFORM api.publish_portal_menus('RESRUN9999999102',current_setting('m.real_authenticated_payload')::jsonb,NULL);
END $$;
RESET ROLE;
DO $$ BEGIN
  ASSERT (SELECT price IS NULL AND media_id='00000000-0000-4000-a000-000000009110'::uuid FROM public.object_menu_item WHERE id='00000000-0000-4000-a000-000000009105'),'real actor RPC failed or changed hidden metadata';
END $$;
ROLLBACK;
