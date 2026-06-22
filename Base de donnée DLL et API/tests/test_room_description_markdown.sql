DO $$
DECLARE
  v_obj text; v_room uuid; v_res jsonb; v_rt jsonb;
  v_md text := E'## Suite\n\nVue **mer** avec *balcon*.';
  v_plain text := E'Suite\n\nVue mer avec balcon.';
BEGIN
  SELECT o.id INTO v_obj FROM object o WHERE o.object_type = 'HLO' AND o.status='published' LIMIT 1;
  INSERT INTO object_room_type(object_id, code, name, description, description_i18n, is_published)
  VALUES (v_obj, 'ZZTEST', 'Test room', v_md, jsonb_build_object('fr', v_md), TRUE) RETURNING id INTO v_room;

  v_res := api.get_object_resource(v_obj, ARRAY['fr'], NULL);
  SELECT e INTO v_rt FROM jsonb_array_elements(v_res->'room_types') e WHERE e->>'code'='ZZTEST';
  ASSERT (v_rt->>'description') = v_plain, format('flat not stripped: %L', v_rt->>'description');
  ASSERT (v_rt->>'description_md') = v_md, format('description_md not raw: %L', v_rt->>'description_md');
  ASSERT NOT (v_rt ? 'description_i18n'), 'description_i18n leaked';

  SELECT e INTO v_rt FROM jsonb_array_elements(api.get_object_room_types(v_obj)::jsonb) e WHERE e->>'code'='ZZTEST';
  ASSERT (v_rt->>'description') = v_plain, 'getter flat not stripped';
  ASSERT (v_rt->>'description_md') = v_md, 'getter description_md not raw';

  RAISE EXCEPTION 'ROLLBACK_TEST';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'ROLLBACK_TEST' THEN RAISE; END IF;
END $$;
