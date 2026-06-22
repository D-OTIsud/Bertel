DO $$
DECLARE
  v_obj text; v_menu uuid; v_item uuid; v_res jsonb; v_dish jsonb; v_doc tsvector;
  v_md text := 'Poulet **mariné** au [gingembre](https://zorglubxyz.test) et *combava*';
  v_plain text := 'Poulet mariné au gingembre et combava';
BEGIN
  SELECT id INTO v_obj FROM object WHERE object_type='RES' AND status='published' LIMIT 1;
  INSERT INTO object_menu(object_id, name, is_active) VALUES (v_obj, 'Carte ZZ test', TRUE) RETURNING id INTO v_menu;
  INSERT INTO object_menu_item(menu_id, name, description, is_available)
    VALUES (v_menu, 'Cari poulet ZZ', v_md, TRUE) RETURNING id INTO v_item;
  PERFORM api.refresh_object_filter_caches(v_obj);

  v_res := api.get_object_resource(v_obj, ARRAY['fr'], NULL);
  SELECT it INTO v_dish
  FROM jsonb_array_elements(v_res->'menus') m, jsonb_array_elements(m->'items') it
  WHERE it->>'id' = v_item::text;
  ASSERT v_dish IS NOT NULL, 'test dish not found in resource menus';
  ASSERT v_dish->>'description' = v_plain, format('flat not stripped: %s', v_dish->>'description');
  ASSERT v_dish->>'description_md' = v_md, format('description_md not raw: %s', v_dish->>'description_md');

  SELECT search_document INTO v_doc FROM object WHERE id = v_obj;
  ASSERT v_doc::text NOT LIKE '%zorglubxyz%', 'URL token leaked into search_document (link not stripped)';
  ASSERT v_doc @@ to_tsquery('french','poulet'), 'dish text not indexed';

  RAISE EXCEPTION 'ROLLBACK_TEST';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'ROLLBACK_TEST' THEN RAISE; END IF;
END $$;
