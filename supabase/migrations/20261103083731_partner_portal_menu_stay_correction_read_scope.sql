-- R3b preparation: complete reads for the existing canonical office corrector.
-- Privacy tightening is a separate cutover AFTER the R4 raw-menu-DML closure.
-- No public JSON, table shape, publication/availability predicate or DML right changes.
BEGIN;
SET LOCAL lock_timeout='500ms';
SET LOCAL statement_timeout='10s';

CREATE OR REPLACE FUNCTION api.can_read_object_for_correction(p_object_id text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,api,auth,pg_temp AS $function$
BEGIN
 IF auth.uid() IS NULL OR COALESCE(api.is_actor_persona(),false) THEN RETURN false; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.object o WHERE o.id=p_object_id AND o.is_test=(SELECT api.current_user_test_realm())) THEN RETURN false; END IF;
 RETURN COALESCE(api.user_can_write_object_canonical(p_object_id),false);
END;
$function$;
REVOKE ALL ON FUNCTION api.can_read_object_for_correction(text) FROM PUBLIC,anon,authenticated;
-- The SELECT policies execute as the reader; anonymous callers only receive false.
GRANT EXECUTE ON FUNCTION api.can_read_object_for_correction(text) TO anon,authenticated;

DROP POLICY IF EXISTS correction_read_object_menu ON public.object_menu;
CREATE POLICY correction_read_object_menu ON public.object_menu FOR SELECT TO authenticated
 USING(api.can_read_object_for_correction(object_id));
DROP POLICY IF EXISTS correction_read_object_menu_item ON public.object_menu_item;
CREATE POLICY correction_read_object_menu_item ON public.object_menu_item FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.object_menu m WHERE m.id=menu_id AND api.can_read_object_for_correction(m.object_id)));

DO $links$
DECLARE v_table text;
BEGIN
 FOREACH v_table IN ARRAY ARRAY['object_menu_item_media','object_menu_item_dietary_tag','object_menu_item_allergen','object_menu_item_cuisine_type'] LOOP
  EXECUTE format('DROP POLICY IF EXISTS correction_read_menu_links ON public.%I',v_table);
  EXECUTE format('CREATE POLICY correction_read_menu_links ON public.%I FOR SELECT TO authenticated USING(EXISTS(
    SELECT 1 FROM public.object_menu_item i JOIN public.object_menu m ON m.id=i.menu_id
    WHERE i.id=menu_item_id AND api.can_read_object_for_correction(m.object_id)))',v_table);
 END LOOP;
END;
$links$;

DROP POLICY IF EXISTS correction_read_object_stay_policy ON public.object_stay_policy;
CREATE POLICY correction_read_object_stay_policy ON public.object_stay_policy FOR SELECT TO authenticated
 USING(api.can_read_object_for_correction(object_id));
-- R5 needs the same complete root-gallery baseline on draft fiches. Place media
-- keep their existing scope; this policy never changes public JSON authorization.
DROP POLICY IF EXISTS correction_read_root_gallery ON public.media;
CREATE POLICY correction_read_root_gallery ON public.media FOR SELECT TO authenticated
 USING(place_id IS NULL AND api.can_read_object_for_correction(object_id));
NOTIFY pgrst,'reload schema';
COMMIT;
