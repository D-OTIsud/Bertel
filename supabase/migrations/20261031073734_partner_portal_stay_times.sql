-- Decision produit du 31/10/2026 : exception D7 etroite, les heures de sejour
-- du partenaire sont appliquees sans relecture. Aucun autre champ n'est expose.
BEGIN;
CREATE OR REPLACE FUNCTION api.save_portal_stay_times(
  p_object_id text,
  p_check_in_from text,
  p_check_in_until text,
  p_check_out_until text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, api
AS $function$
DECLARE
  v_value text;
  v_from time;
  v_until time;
  v_out time;
  v_visibility jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT api.is_actor_persona() THEN
    RAISE EXCEPTION 'Partner account required' USING ERRCODE='42501';
  END IF;
  IF p_object_id IS NULL OR p_object_id NOT IN (SELECT api.current_user_portal_object_ids()) THEN
    RAISE EXCEPTION 'Object outside partner scope' USING ERRCODE='42501';
  END IF;
  v_visibility := api.get_portal_section_visibility(p_object_id);
  IF COALESCE(v_visibility->'masked_modules','[]'::jsonb) ? 'capacity-policies'
    OR 'capacity-policies'=ANY(api.actor_portal_floor_modules()) THEN
    RAISE EXCEPTION 'Stay hours unavailable' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM public.object WHERE id=p_object_id AND object_type IN ('HOT','HPA','HLO','CAMP','RVA') FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Accommodation required' USING ERRCODE='22023';
  END IF;
  FOREACH v_value IN ARRAY ARRAY[p_check_in_from,p_check_in_until,p_check_out_until] LOOP
    IF nullif(v_value,'') IS NOT NULL AND v_value !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
      RAISE EXCEPTION 'Expected HH:MM' USING ERRCODE='22023';
    END IF;
  END LOOP;
  v_from := nullif(p_check_in_from,'')::time;
  v_until := nullif(p_check_in_until,'')::time;
  v_out := nullif(p_check_out_until,'')::time;
  INSERT INTO public.object_stay_policy(object_id,check_in_from,check_in_until,check_out_until)
    VALUES(p_object_id,v_from,v_until,v_out)
    ON CONFLICT(object_id) DO UPDATE SET check_in_from=EXCLUDED.check_in_from,
      check_in_until=EXCLUDED.check_in_until,check_out_until=EXCLUDED.check_out_until
    WHERE (object_stay_policy.check_in_from,object_stay_policy.check_in_until,object_stay_policy.check_out_until)
      IS DISTINCT FROM (EXCLUDED.check_in_from,EXCLUDED.check_in_until,EXCLUDED.check_out_until);
  IF FOUND THEN UPDATE public.object SET updated_at=now() WHERE id=p_object_id; END IF;
  RETURN jsonb_build_object('checkInFrom',coalesce(left(v_from::text,5),''),
    'checkInUntil',coalesce(left(v_until::text,5),''),'checkOutUntil',coalesce(left(v_out::text,5),''));
END
$function$;
REVOKE ALL ON FUNCTION api.save_portal_stay_times(text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION api.save_portal_stay_times(text,text,text,text) TO authenticated;
COMMENT ON FUNCTION api.save_portal_stay_times(text,text,text,text) IS 'Portail : exception D7 pour trois heures seulement. Persona acteur, propre hebergement, perimetre et masquage verifies ; conditions preservees.';
COMMIT;
NOTIFY pgrst, 'reload schema';
