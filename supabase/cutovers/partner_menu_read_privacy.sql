-- R3b cutover: run only after R4 has closed old menu delete/reinsert clients.
-- Do not reopen private reads or raw menu DML during rollback.
BEGIN;
SET LOCAL lock_timeout='500ms';
SET LOCAL statement_timeout='10s';
DO $gate$
DECLARE v_table text; v_role text;
BEGIN
 IF to_regprocedure('api.can_read_object_for_correction(text)') IS NULL
   OR to_regprocedure('api.save_object_menus(text,jsonb)') IS NULL THEN
  RAISE EXCEPTION 'Install R3b correction reads and the R4 menu writer first';
 END IF;
 FOREACH v_table IN ARRAY ARRAY['object_menu','object_menu_item','object_menu_item_media','object_menu_item_dietary_tag','object_menu_item_allergen','object_menu_item_cuisine_type'] LOOP
  FOREACH v_role IN ARRAY ARRAY['anon','authenticated'] LOOP
   IF has_table_privilege(v_role,'public.'||v_table,'INSERT,UPDATE,DELETE')
    OR has_any_column_privilege(v_role,'public.'||v_table,'INSERT,UPDATE') THEN
    RAISE EXCEPTION 'Close legacy menu DML before read privacy: role %, table %',v_role,v_table;
   END IF;
  END LOOP;
 END LOOP;
END;
$gate$;

-- Visibility is authorization; is_active/is_available remain editorial data that
-- an office must still load and correct. The public JSON reader applies those flags.
DROP POLICY IF EXISTS menu_visibility_read ON public.object_menu;
CREATE POLICY menu_visibility_read ON public.object_menu AS RESTRICTIVE FOR SELECT TO anon,authenticated
 USING(visibility IS NULL OR visibility='public'
   OR object_id IN(SELECT api.current_user_extended_object_ids())
   OR api.can_read_object_for_correction(object_id));
DROP POLICY IF EXISTS menu_item_visibility_read ON public.object_menu_item;
CREATE POLICY menu_item_visibility_read ON public.object_menu_item AS RESTRICTIVE FOR SELECT TO anon,authenticated
 -- Items have no visibility column: their authorization follows the parent menu.
 -- Its SELECT policies above are evaluated with the calling reader's RLS scope.
 USING(EXISTS(SELECT 1 FROM public.object_menu m WHERE m.id=menu_id));

-- Bound each link to a visible item, even if another permissive policy is added later.
DO $links$
DECLARE v_table text;
BEGIN
 FOREACH v_table IN ARRAY ARRAY['object_menu_item_media','object_menu_item_dietary_tag','object_menu_item_allergen','object_menu_item_cuisine_type'] LOOP
  EXECUTE format('DROP POLICY IF EXISTS menu_link_visibility_read ON public.%I',v_table);
  EXECUTE format('CREATE POLICY menu_link_visibility_read ON public.%I AS RESTRICTIVE FOR SELECT TO anon,authenticated
    USING(EXISTS(SELECT 1 FROM public.object_menu_item i WHERE i.id=menu_item_id))',v_table);
 END LOOP;
END;
$links$;
NOTIFY pgrst,'reload schema';
COMMIT;
