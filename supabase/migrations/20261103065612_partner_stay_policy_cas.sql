-- R2 preparation: additive contracts only. Apply the separate cutover after client conversion.
BEGIN;
SET LOCAL lock_timeout = '500ms';
SET LOCAL statement_timeout = '10s';

CREATE OR REPLACE FUNCTION internal.stay_policy_snapshot(p_object_id text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = pg_catalog, public AS $$
  SELECT jsonb_build_object('exists', s.object_id IS NOT NULL, 'values', jsonb_build_object(
    'check_in_from', s.check_in_from, 'check_in_until', s.check_in_until,
    'check_out_until', s.check_out_until, 'conditions', s.conditions))
  FROM (SELECT p_object_id AS id) k LEFT JOIN public.object_stay_policy s ON s.object_id=k.id;
$$;

CREATE OR REPLACE FUNCTION internal.patch_stay_policy(p_object_id text, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public, internal AS $$
DECLARE v_current jsonb; v_expected jsonb; v_changes jsonb; v_values jsonb;
  v_key text; v_value jsonb; v_same boolean := true;
BEGIN
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
    OR p_payload->>'write_contract' IS DISTINCT FROM 'stay-policy-patch-v1'
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_payload) k WHERE k NOT IN ('write_contract','expected','changes'))
    OR jsonb_typeof(p_payload->'expected') IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_payload#>'{expected,exists}') IS DISTINCT FROM 'boolean'
    OR jsonb_typeof(p_payload#>'{expected,values}') IS DISTINCT FROM 'object'
    OR NOT ((p_payload#>'{expected,values}') ?& ARRAY['check_in_from','check_in_until','check_out_until','conditions'])
    OR jsonb_typeof(p_payload->'changes') IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Rechargez la fiche avant d’enregistrer les heures. Votre saisie est conservée.' USING ERRCODE='22023';
  END IF;
  v_expected := p_payload->'expected'; v_changes := p_payload->'changes';
  FOR v_key,v_value IN SELECT key,value FROM jsonb_each(v_expected->'values') LOOP
    IF v_key NOT IN ('check_in_from','check_in_until','check_out_until','conditions')
      OR jsonb_typeof(v_value) NOT IN ('string','null') THEN
      RAISE EXCEPTION 'État de départ du séjour invalide.' USING ERRCODE='22023';
    END IF;
  END LOOP;
  FOR v_key,v_value IN SELECT key,value FROM jsonb_each(v_changes) LOOP
    IF v_key NOT IN ('check_in_from','check_in_until','check_out_until','conditions')
      OR jsonb_typeof(v_value) NOT IN ('string','null') THEN
      RAISE EXCEPTION 'Champ de séjour non autorisé.' USING ERRCODE='22023';
    END IF;
    IF v_key <> 'conditions' AND v_value <> 'null'::jsonb THEN
      IF (v_value#>>'{}') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
        RAISE EXCEPTION 'Saisissez une heure valide entre 00:00 et 23:59.' USING ERRCODE='22023';
      END IF;
      v_changes := jsonb_set(v_changes,ARRAY[v_key],to_jsonb((v_value#>>'{}')::time::text));
    END IF;
  END LOOP;
  -- One common lock also serializes first insertion, when there is no child row yet.
  PERFORM 1 FROM public.object WHERE id=p_object_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fiche inaccessible.' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.object_stay_policy WHERE object_id=p_object_id FOR UPDATE;
  v_current := internal.stay_policy_snapshot(p_object_id);
  FOR v_key,v_value IN SELECT key,value FROM jsonb_each(v_changes) LOOP
    IF (v_current->'values'->v_key) IS DISTINCT FROM v_value THEN v_same:=false; END IF;
  END LOOP;
  -- Empty patch preserves newer stay fields. Equal desired values confirm a lost response safely.
  IF v_same THEN RETURN v_current; END IF;
  IF v_current->'exists' IS DISTINCT FROM v_expected->'exists' THEN
    RAISE EXCEPTION 'Les informations de séjour ont changé. Rechargez la fiche pour les vérifier ; votre saisie est conservée.' USING ERRCODE='PT409';
  END IF;
  FOR v_key,v_value IN SELECT key,value FROM jsonb_each(v_changes) LOOP
    IF (v_current->'values'->v_key) IS DISTINCT FROM (v_expected->'values'->v_key)
      AND (v_current->'values'->v_key) IS DISTINCT FROM v_value THEN
      RAISE EXCEPTION 'Les informations de séjour ont changé. Rechargez la fiche pour les vérifier ; votre saisie est conservée.' USING ERRCODE='PT409';
    END IF;
  END LOOP;
  v_values := (v_current->'values') || v_changes;
  IF NOT EXISTS(SELECT 1 FROM jsonb_each(v_values) WHERE value <> 'null'::jsonb) THEN
    DELETE FROM public.object_stay_policy WHERE object_id=p_object_id;
  ELSE
    INSERT INTO public.object_stay_policy(object_id,check_in_from,check_in_until,check_out_until,conditions)
    VALUES(p_object_id,(v_values->>'check_in_from')::time,(v_values->>'check_in_until')::time,
      (v_values->>'check_out_until')::time,v_values->>'conditions')
    ON CONFLICT(object_id) DO UPDATE SET check_in_from=EXCLUDED.check_in_from,
      check_in_until=EXCLUDED.check_in_until,check_out_until=EXCLUDED.check_out_until,conditions=EXCLUDED.conditions;
  END IF;
  UPDATE public.object SET updated_at=now() WHERE id=p_object_id;
  RETURN internal.stay_policy_snapshot(p_object_id);
END;
$$;

-- Narrow privileged façade is deliberate: ordinary table DML is removed only during cutover.
-- Authorization still uses the caller's identity, not the function owner's privileges.
CREATE OR REPLACE FUNCTION api.save_object_capacity_policies(p_object_id text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,api,internal AS $$
DECLARE v_snapshot jsonb;
BEGIN
  IF COALESCE(api.is_actor_persona(),false) THEN RAISE EXCEPTION 'Écriture réservée à l’office.' USING ERRCODE='42501'; END IF;
  PERFORM internal.workspace_assert_can_write_object(p_object_id);
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_payload) k WHERE k NOT IN ('capacities','group_policy','pet_policy','stay_policy')) THEN
    RAISE EXCEPTION 'Champs de capacité ou séjour non autorisés.' USING ERRCODE='22023';
  END IF;
  IF p_payload ? 'stay_policy' THEN
    IF p_payload#>'{stay_policy,changes}' <> '{}'::jsonb AND NOT EXISTS(
      SELECT 1 FROM public.object WHERE id=p_object_id AND object_type IN ('HOT','HPA','HLO','CAMP','RVA')) THEN
      RAISE EXCEPTION 'Les heures de séjour concernent les hébergements.' USING ERRCODE='22023';
    END IF;
    v_snapshot := internal.patch_stay_policy(p_object_id,p_payload->'stay_policy');
  ELSE
    PERFORM 1 FROM public.object WHERE id=p_object_id FOR UPDATE;
    v_snapshot := internal.stay_policy_snapshot(p_object_id);
  END IF;
  PERFORM api.save_object_commercial(p_object_id,p_payload-'stay_policy');
  RETURN jsonb_build_object('success',true,'stay_policy',v_snapshot);
END;
$$;

CREATE OR REPLACE FUNCTION api.patch_portal_stay_times(p_object_id text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,api,internal AS $$
DECLARE v_visibility jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT COALESCE(api.is_actor_persona(),false)
    OR NOT EXISTS(SELECT 1 FROM api.current_user_portal_object_ids() id WHERE id=p_object_id) THEN
    RAISE EXCEPTION 'Fiche inaccessible.' USING ERRCODE='42501';
  END IF;
  v_visibility := api.get_portal_section_visibility(p_object_id);
  IF COALESCE(v_visibility->'masked_modules','[]'::jsonb) ? 'capacity-policies'
    OR COALESCE(v_visibility->'floor_modules','[]'::jsonb) ? 'capacity-policies' THEN
    RAISE EXCEPTION 'Les heures sont gérées par l’office.' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.object WHERE id=p_object_id AND object_type IN ('HOT','HPA','HLO','CAMP','RVA')) THEN
    RAISE EXCEPTION 'Les heures de séjour concernent les hébergements.' USING ERRCODE='22023';
  END IF;
  IF jsonb_typeof(p_payload->'changes')='object' AND (p_payload->'changes') ? 'conditions' THEN
    RAISE EXCEPTION 'Seules les trois heures peuvent être modifiées ici.' USING ERRCODE='42501';
  END IF;
  RETURN jsonb_build_object('success',true,'stay_policy',internal.patch_stay_policy(p_object_id,p_payload));
END;
$$;

REVOKE ALL ON FUNCTION internal.stay_policy_snapshot(text),internal.patch_stay_policy(text,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION api.save_object_capacity_policies(text,jsonb),api.patch_portal_stay_times(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION api.save_object_capacity_policies(text,jsonb) TO authenticated,service_role;
-- The prepared pre-CAS actor endpoint must not become an alternate bypass during transition.
DO $$ BEGIN
  IF to_regprocedure('api.save_portal_stay_times(text,text,text,text)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION api.save_portal_stay_times(text,text,text,text) FROM PUBLIC,anon,authenticated;
  END IF;
END $$;
-- Actor writes are deliberately not enabled by this preparation. Cutover grants after old DML closes.
COMMIT;
NOTIFY pgrst,'reload schema';
