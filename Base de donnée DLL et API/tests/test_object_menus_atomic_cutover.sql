-- Run ONLY after the R4 cutover in an isolated database.
BEGIN;
DO $$
DECLARE v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['object_menu','object_menu_item','object_menu_item_media','object_menu_item_dietary_tag','object_menu_item_allergen','object_menu_item_cuisine_type'] LOOP
    ASSERT NOT has_table_privilege('authenticated','public.'||v_table,'INSERT,UPDATE,DELETE'),v_table||' retains ordinary table writes';
    ASSERT NOT has_any_column_privilege('authenticated','public.'||v_table,'INSERT,UPDATE'),v_table||' retains ordinary column writes';
  END LOOP;
  ASSERT has_function_privilege('authenticated','api.save_object_menus(text,jsonb)','execute');
END $$;
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_table text; v_denied boolean;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['object_menu','object_menu_item','object_menu_item_media','object_menu_item_dietary_tag','object_menu_item_allergen','object_menu_item_cuisine_type'] LOOP
    v_denied:=false;
    BEGIN EXECUTE format('DELETE FROM public.%I WHERE false',v_table); EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
    ASSERT v_denied,v_table||' still accepts DELETE';
    v_denied:=false;
    BEGIN EXECUTE format('INSERT INTO public.%I DEFAULT VALUES',v_table); EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
    ASSERT v_denied,v_table||' still accepts INSERT';
  END LOOP;
END $$;
RESET ROLE;
ROLLBACK;
