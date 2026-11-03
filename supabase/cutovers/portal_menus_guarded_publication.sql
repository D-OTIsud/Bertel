-- M activation only after isolated acceptance, converted consumers, and R4 DML closure.
-- No UI is activated by this script. Do not run from a production CI fixture.
BEGIN;
SET LOCAL lock_timeout='5s';
DO $$
DECLARE v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['object_menu','object_menu_item','object_menu_item_media','object_menu_item_dietary_tag','object_menu_item_allergen','object_menu_item_cuisine_type'] LOOP
    IF has_table_privilege('authenticated','public.'||v_table,'INSERT,UPDATE,DELETE')
      OR has_any_column_privilege('authenticated','public.'||v_table,'INSERT,UPDATE') THEN
      RAISE EXCEPTION 'Fermer d’abord les anciens droits menus (%).',v_table USING ERRCODE='55000';
    END IF;
  END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION api.get_portal_menus_snapshot(text),api.get_portal_menu_write_receipt(text,jsonb),api.publish_portal_menus(text,jsonb,uuid) TO authenticated;
UPDATE internal.portal_menu_write_configuration SET enabled=true WHERE singleton;
COMMIT;
NOTIFY pgrst,'reload schema';
