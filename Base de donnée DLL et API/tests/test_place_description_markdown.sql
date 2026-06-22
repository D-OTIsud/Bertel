DO $$
DECLARE v_obj text; v_place uuid; v_res jsonb; v_desc jsonb;
BEGIN
  SELECT id INTO v_obj FROM object WHERE status='published' AND object_type <> 'ORG' ORDER BY created_at LIMIT 1;
  INSERT INTO object_place (object_id, label, position) VALUES (v_obj, 'ZZ Point de RDV', 0) RETURNING id INTO v_place;
  -- Two-language fixture: FR base scalar + an EN translation map. The EN i18n map is the
  -- editor's per-language leg — §110 C1 asserts it survives RAW (the prior subtract-*_i18n
  -- form NULLed it on the next §16 save).
  -- i18n maps carry an explicit 'fr' (so the FR flat resolution is deterministic — api.i18n_pick
  -- otherwise falls back to any available language) PLUS an 'en' translation = the editor leg.
  INSERT INTO object_place_description (place_id, description, description_i18n, description_chapo, description_chapo_i18n, visibility)
  VALUES (v_place, 'Voir le **volcan** actif.',
          jsonb_build_object('fr', 'Voir le **volcan** actif.', 'en', 'See the **active** volcano.'),
          'Accroche *vive*',
          jsonb_build_object('fr', 'Accroche *vive*', 'en', 'A *lively* hook'), 'public');

  v_res := api.get_object_resource(v_obj, ARRAY['fr'], 'none', '{}'::jsonb);
  SELECT d INTO v_desc
  FROM jsonb_array_elements(v_res->'places') p, jsonb_array_elements(p->'descriptions') d
  WHERE p->>'id' = v_place::text;

  ASSERT v_desc IS NOT NULL, 'test place description not found';
  -- public flat key (FR resolved) is stripped; *_md / *_raw carry raw Markdown
  ASSERT v_desc->>'description' = 'Voir le volcan actif.', format('flat not stripped: %s', v_desc->>'description');
  ASSERT v_desc->>'description_md' = 'Voir le **volcan** actif.', 'description_md not raw';
  ASSERT v_desc->>'description_raw' = 'Voir le **volcan** actif.', 'description_raw not raw';
  -- editor leg: the raw *_i18n map MUST survive (round-trip), not be stripped/dropped
  ASSERT (v_desc->'description_i18n'->>'en') = 'See the **active** volcano.', 'description_i18n editor leg lost/stripped';
  ASSERT (v_desc->'description_chapo_i18n'->>'en') = 'A *lively* hook', 'description_chapo_i18n editor leg lost/stripped';
  ASSERT v_desc->>'description_chapo' = 'Accroche vive', 'chapo not stripped';
  ASSERT v_desc->>'description_chapo_md' = 'Accroche *vive*', 'chapo_md not raw';
  ASSERT v_desc->>'visibility' = 'public', 'visibility passthrough broken';

  RAISE EXCEPTION 'ROLLBACK_OK';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'ROLLBACK_OK' THEN RAISE; END IF;
END $$;
