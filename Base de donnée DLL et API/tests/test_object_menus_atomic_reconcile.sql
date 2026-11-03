-- R4 isolated fixtures only. Never run in production, even with ROLLBACK.
BEGIN;
DO $test$
DECLARE
  v_admin uuid:='00000000-0000-4000-a000-000000008710';
  v_menu uuid:='00000000-0000-4000-a000-000000008711';
  v_item uuid:='00000000-0000-4000-a000-000000008712';
  v_added uuid:='00000000-0000-4000-a000-000000008713';
  v_new uuid:='00000000-0000-4000-a000-000000008714';
  v_other uuid:='00000000-0000-4000-a000-000000008715';
  v_photo uuid:='00000000-0000-4000-a000-000000008716';
  v_photo2 uuid:='00000000-0000-4000-a000-000000008717';
  v_type uuid; v_base jsonb; v_payload jsonb; v_create_payload jsonb; v_patch jsonb; v_before jsonb; v_after jsonb; v_result jsonb; v_denied boolean;
BEGIN
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  ASSERT NOT has_function_privilege('anon','api.save_object_menus(text,jsonb)','execute');
  ASSERT NOT has_function_privilege('authenticated','internal.object_menu_write_snapshot(text)','execute');
  INSERT INTO auth.users(id,email) VALUES(v_admin,'r4-admin@example.test');
  INSERT INTO public.app_user_profile(id,role) VALUES(v_admin,'super_admin') ON CONFLICT(id) DO UPDATE SET role=EXCLUDED.role;
  INSERT INTO public.object(id,object_type,name,status,is_test) VALUES
    ('RESRUN9999998711','RES','R4 restaurant','published',true),('RESRUN9999998712','RES','R4 other','published',true),('HOTRUN9999998713','HOT','R4 hotel','published',true);
  INSERT INTO public.object_menu(id,object_id,name,visibility,created_at) VALUES(v_menu,'RESRUN9999998711','Carte',NULL,'2020-01-01'),(v_other,'RESRUN9999998712','Other','public','2020-01-01');
  INSERT INTO public.object_menu_item(id,menu_id,name,price) VALUES(v_item,v_menu,'Cari',18);
  SELECT id INTO v_type FROM public.ref_code_media_type WHERE code='photo';
  INSERT INTO public.media(id,object_id,media_type_id,url) VALUES(v_photo,'RESRUN9999998711',v_type,'https://example.test/r4-one.jpg'),(v_photo2,'RESRUN9999998711',v_type,'https://example.test/r4-two.jpg');
  INSERT INTO public.object_menu_item_media(menu_item_id,media_id,position,created_at) VALUES(v_item,v_photo,1,'2020-01-01');
  v_base:='{"write_contract":"menus-reconcile-v1","menus":[],"items":[],"deleted_menus":[],"deleted_items":[]}';
  v_before:=internal.object_menu_write_snapshot('RESRUN9999998711');
  -- Another writer adds a menu after the office loaded its baseline. A price patch cannot delete it.
  INSERT INTO public.object_menu(id,object_id,name,is_active,visibility) VALUES(v_added,'RESRUN9999998711','Concurrent',false,'private');
  v_patch:=jsonb_build_object('id',v_item,'menu_id',v_menu,'expected',v_before->'items'->0,'changes',jsonb_build_object('price',19),'links','{}'::jsonb);
  v_payload:=jsonb_set(v_base,'{items}',jsonb_build_array(v_patch));
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_admin,'role','authenticated')::text,true);
  v_result:=api.save_object_menus('RESRUN9999998711',v_payload);
  ASSERT (SELECT price=19 FROM public.object_menu_item WHERE id=v_item),'price not saved with stable ID';
  ASSERT EXISTS(SELECT 1 FROM public.object_menu WHERE id=v_added AND NOT is_active AND visibility='private'),'off-screen menu was lost';
  ASSERT (SELECT visibility IS NULL AND created_at='2020-01-01'::timestamptz FROM public.object_menu WHERE id=v_menu),'untouched menu metadata changed';
  v_after:=internal.object_menu_write_snapshot('RESRUN9999998711');
  ASSERT api.save_object_menus('RESRUN9999998711',v_payload)=v_result,'lost-response retry changed rows';
  v_denied:=false;
  BEGIN PERFORM api.save_object_menus('RESRUN9999998711',jsonb_set(v_payload,'{items,0,changes,price}','20')); EXCEPTION WHEN SQLSTATE 'PT409' THEN v_denied:=true; END;
  ASSERT v_denied,'stale same-field edit overwrote newer price';
  -- Disjoint edit can retain that newer price.
  v_payload:=jsonb_set(v_base,'{items}',jsonb_build_array(jsonb_set(v_patch,'{changes}','{"description":"Office description"}')));
  PERFORM api.save_object_menus('RESRUN9999998711',v_payload);
  ASSERT (SELECT price=19 AND description='Office description' FROM public.object_menu_item WHERE id=v_item);
  -- Link reconciliation retains metadata on an unchanged member.
  v_before:=internal.object_menu_write_snapshot('RESRUN9999998711');
  v_patch:=jsonb_build_object('id',v_item,'menu_id',v_menu,'expected',v_before->'items'->0,'changes','{}'::jsonb,'links',
    jsonb_build_object('media',jsonb_build_object('expected',v_before->'media','values',jsonb_build_array(jsonb_build_object('media_id',v_photo,'position',1),jsonb_build_object('media_id',v_photo2,'position',2)))));
  v_payload:=jsonb_set(v_base,'{items}',jsonb_build_array(v_patch));
  PERFORM api.save_object_menus('RESRUN9999998711',v_payload);
  ASSERT (SELECT created_at='2020-01-01'::timestamptz FROM public.object_menu_item_media WHERE menu_item_id=v_item AND media_id=v_photo),'retained link was recreated';
  v_result:=api.save_object_menus('RESRUN9999998711',v_payload);
  ASSERT jsonb_array_length(v_result#>'{snapshot,media}')=2;
  -- A late FK failure after the scalar write rolls back the whole transaction.
  v_before:=internal.object_menu_write_snapshot('RESRUN9999998711');
  v_patch:=jsonb_build_object('id',v_item,'menu_id',v_menu,'expected',v_before->'items'->0,'changes','{"price":30}'::jsonb,'links',
    jsonb_build_object('allergens',jsonb_build_object('expected','[]'::jsonb,'values','[{"allergen_id":"00000000-0000-4000-a000-000000009999"}]'::jsonb)));
  v_denied:=false;
  BEGIN PERFORM api.save_object_menus('RESRUN9999998711',jsonb_set(v_base,'{items}',jsonb_build_array(v_patch))); EXCEPTION WHEN foreign_key_violation THEN v_denied:=true; END;
  ASSERT v_denied,'fixture must fail at link FK';
  ASSERT internal.object_menu_write_snapshot('RESRUN9999998711')=v_before,'partial write survived failure';
  -- Stable client-generated ID makes a newly inserted menu retryable.
  v_payload:=jsonb_set(v_base,'{menus}',jsonb_build_array(jsonb_build_object('id',v_new,'expected','null'::jsonb,'changes','{"name":"Desserts","is_active":true,"visibility":"public","position":3}'::jsonb)));
  v_create_payload:=v_payload;
  v_result:=api.save_object_menus('RESRUN9999998711',v_payload);
  ASSERT api.save_object_menus('RESRUN9999998711',v_payload)=v_result,'new menu retry duplicated or changed it';
  -- Full expected bundle catches an item added after the deletion was prepared.
  v_before:=internal.object_menu_write_snapshot('RESRUN9999998711');
  v_payload:=jsonb_set(v_base,'{deleted_menus}',jsonb_build_array(jsonb_build_object('id',v_new,'expected',internal.object_menu_delete_bundle(v_before,v_new,true))));
  INSERT INTO public.object_menu_item(menu_id,name) VALUES(v_new,'New child');
  v_denied:=false;
  BEGIN PERFORM api.save_object_menus('RESRUN9999998711',v_payload); EXCEPTION WHEN SQLSTATE 'PT409' THEN v_denied:=true; END;
  ASSERT v_denied,'menu deletion silently removed an unseen item';
  v_before:=internal.object_menu_write_snapshot('RESRUN9999998711');
  v_payload:=jsonb_set(v_base,'{deleted_items}',jsonb_build_array(jsonb_build_object('id',v_item,'menu_id',v_menu,'expected',internal.object_menu_delete_bundle(v_before,v_item,false))));
  PERFORM api.save_object_menus('RESRUN9999998711',v_payload);
  PERFORM api.save_object_menus('RESRUN9999998711',v_payload);
  ASSERT NOT EXISTS(SELECT 1 FROM public.object_menu_item WHERE id=v_item),'explicit deletion not applied';
  ASSERT EXISTS(SELECT 1 FROM public.object_menu WHERE id=v_menu),'deleting item deleted its menu';
  v_denied:=false;
  BEGIN PERFORM api.save_object_menus('RESRUN9999998711',jsonb_set(v_base,'{deleted_menus}',jsonb_build_array(jsonb_build_object('id',v_other,'expected','{}'::jsonb)))); EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
  ASSERT v_denied,'foreign menu accepted';
  -- A lost creation response followed by another writer's deletion must never resurrect it.
  DELETE FROM public.object_menu WHERE id=v_new;
  PERFORM api.save_object_menus('RESRUN9999998711',v_create_payload);
  ASSERT NOT EXISTS(SELECT 1 FROM public.object_menu WHERE id=v_new),'retry resurrected a subsequently deleted menu';
  v_denied:=false;
  BEGIN
    PERFORM api.save_object_menus('RESRUN9999998711',jsonb_set(v_base,'{menus}',jsonb_build_array(jsonb_build_object('id',v_added,
      'expected',(SELECT to_jsonb(m) FROM public.object_menu m WHERE id=v_added),'changes','{"is_active":"true"}'::jsonb))));
  EXCEPTION WHEN invalid_parameter_value THEN v_denied:=true; END;
  ASSERT v_denied,'string boolean accepted';
  v_denied:=false; BEGIN PERFORM api.save_object_menus('HOTRUN9999998713',v_base); EXCEPTION WHEN invalid_parameter_value THEN v_denied:=true; END;
  ASSERT v_denied,'non-RES write accepted';
END $test$;
ROLLBACK;
