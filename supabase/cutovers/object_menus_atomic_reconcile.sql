-- R4 cutover ONLY after all ordinary office/import writers use api.save_object_menus.
-- Test only in an isolated database; do not run this script in production from CI.
BEGIN;
DO $$
DECLARE v_table text; v_columns text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['object_menu','object_menu_item','object_menu_item_media','object_menu_item_dietary_tag','object_menu_item_allergen','object_menu_item_cuisine_type'] LOOP
    EXECUTE format('REVOKE INSERT,UPDATE,DELETE ON public.%I FROM PUBLIC,anon,authenticated',v_table);
    SELECT string_agg(quote_ident(column_name),',') INTO v_columns FROM information_schema.columns WHERE table_schema='public' AND table_name=v_table;
    EXECUTE format('REVOKE INSERT(%s),UPDATE(%s) ON public.%I FROM PUBLIC,anon,authenticated',v_columns,v_columns,v_table);
  END LOOP;
END $$;
COMMIT;
NOTIFY pgrst,'reload schema';
