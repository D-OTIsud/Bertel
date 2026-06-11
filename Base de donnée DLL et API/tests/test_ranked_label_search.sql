-- test_ranked_label_search.sql
-- Ranked label search regression:
--   * api.get_filtered_object_ids emits rank + label_match metadata.
--   * api.list_object_resources_filtered_page preserves label_match on cards.
--   * LBL_TOURISME_HANDICAP evidence comes from accessibility amenities, not sustainability actions.
--   * Sustainability evidence comes from ref_classification_equivalent_action/group.
--   * api.search_objects_by_label keeps compatibility while comparing ref action ids to ref action ids.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_th_exact text := 'HOTRLSRANK000001';
  v_th_evidence text := 'HOTRLSRANK000002';
  v_sust_exact text := 'HOTRLSRANK000003';
  v_sust_evidence text := 'HOTRLSRANK000004';
  v_none text := 'HOTRLSRANK000005';
  v_th_scheme uuid;
  v_th_granted uuid;
  v_th_motor_subvalue uuid;
  v_access_amenity uuid;
  v_clef_scheme uuid;
  v_clef_granted uuid;
  v_clef_action uuid;
  v_rank integer;
  v_match jsonb;
  v_ids text[];
  v_page jsonb;
  v_search jsonb;
  v_family text[] := ARRAY['motor']::text[];
BEGIN
  SELECT id INTO v_th_scheme
  FROM ref_classification_scheme
  WHERE code = 'LBL_TOURISME_HANDICAP';
  ASSERT v_th_scheme IS NOT NULL, 'Missing LBL_TOURISME_HANDICAP scheme seed';

  SELECT id INTO v_th_granted
  FROM ref_classification_value
  WHERE scheme_id = v_th_scheme
    AND code = 'granted';
  ASSERT v_th_granted IS NOT NULL, 'Missing LBL_TOURISME_HANDICAP granted value seed';

  SELECT id INTO v_th_motor_subvalue
  FROM ref_classification_value
  WHERE scheme_id = v_th_scheme
    AND metadata->>'disability_type' = v_family[1]
  LIMIT 1;
  ASSERT v_th_motor_subvalue IS NOT NULL, 'Missing motor subvalue for LBL_TOURISME_HANDICAP';

  SELECT ra.id INTO v_access_amenity
  FROM ref_amenity ra
  JOIN ref_code_amenity_family fam ON fam.id = ra.family_id
  WHERE fam.code = 'accessibility'
    AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(COALESCE(ra.extra->'disability_types', '[]'::jsonb)) AS dt(val)
      WHERE dt.val = v_family[1]
    )
  LIMIT 1;
  ASSERT v_access_amenity IS NOT NULL, 'Missing accessibility amenity with motor disability_types evidence';

  SELECT id INTO v_clef_scheme
  FROM ref_classification_scheme
  WHERE code = 'LBL_CLEF_VERTE';
  ASSERT v_clef_scheme IS NOT NULL, 'Missing LBL_CLEF_VERTE scheme seed';

  SELECT id INTO v_clef_granted
  FROM ref_classification_value
  WHERE scheme_id = v_clef_scheme
    AND code = 'granted';
  ASSERT v_clef_granted IS NOT NULL, 'Missing LBL_CLEF_VERTE granted value seed';

  SELECT rcea.action_id INTO v_clef_action
  FROM ref_classification_equivalent_action rcea
  WHERE rcea.scheme_id = v_clef_scheme
    AND rcea.match_scope IN ('search_expansion', 'both')
  LIMIT 1;
  ASSERT v_clef_action IS NOT NULL, 'Missing LBL_CLEF_VERTE equivalent action seed';

  INSERT INTO object (id, object_type, name, status)
  VALUES
    (v_th_exact, 'HOT', 'rankedlabelregressionth certified', 'published'),
    (v_th_evidence, 'HOT', 'rankedlabelregressionth evidence', 'published'),
    (v_sust_exact, 'HOT', 'rankedlabelregressionsust certified', 'published'),
    (v_sust_evidence, 'HOT', 'rankedlabelregressionsust evidence', 'published'),
    (v_none, 'HOT', 'rankedlabelregression none', 'published');

  INSERT INTO object_classification (object_id, scheme_id, value_id, subvalue_ids, status)
  VALUES
    (v_th_exact, v_th_scheme, v_th_granted, ARRAY[v_th_motor_subvalue]::uuid[], 'granted'),
    (v_sust_exact, v_clef_scheme, v_clef_granted, NULL, 'granted');

  INSERT INTO object_amenity (object_id, amenity_id)
  VALUES (v_th_evidence, v_access_amenity);

  INSERT INTO object_sustainability_action (object_id, action_id)
  VALUES (v_sust_evidence, v_clef_action);

  -- Exact certified T&H with requested subfamily returns rank 0.
  v_rank := NULL;
  v_match := NULL;
  SELECT f.label_rank, f.label_match INTO v_rank, v_match
  FROM api.get_filtered_object_ids(
    jsonb_build_object(
      'label_scheme_ranked', 'LBL_TOURISME_HANDICAP',
      'label_disability_types_any', to_jsonb(v_family),
      'disability_types_any', to_jsonb(v_family)
    ),
    ARRAY['HOT']::object_type[],
    ARRAY['published']::object_status[],
    NULL
  ) f
  WHERE f.object_id = v_th_exact;
  ASSERT v_rank = 0, format('Expected certified T&H rank 0, got %s', v_rank);
  ASSERT v_match->>'source' = 'certified_label', format('Expected certified_label source, got %s', v_match);

  -- Evidence-only T&H amenity with requested family returns rank 1.
  v_rank := NULL;
  v_match := NULL;
  SELECT f.label_rank, f.label_match INTO v_rank, v_match
  FROM api.get_filtered_object_ids(
    jsonb_build_object(
      'label_scheme_ranked', 'LBL_TOURISME_HANDICAP',
      'label_disability_types_any', to_jsonb(v_family),
      'disability_types_any', to_jsonb(v_family)
    ),
    ARRAY['HOT']::object_type[],
    ARRAY['published']::object_status[],
    NULL
  ) f
  WHERE f.object_id = v_th_evidence;
  ASSERT v_rank = 1, format('Expected T&H evidence rank 1, got %s', v_rank);
  ASSERT v_match->>'source' = 'accessibility_amenity', format('Expected accessibility_amenity source, got %s', v_match);

  -- Objects with no requested label or evidence are excluded.
  ASSERT NOT EXISTS (
    SELECT 1
    FROM api.get_filtered_object_ids(
      jsonb_build_object('label_scheme_ranked', 'LBL_TOURISME_HANDICAP'),
      ARRAY['HOT']::object_type[],
      ARRAY['published']::object_status[],
      NULL
    ) f
    WHERE f.object_id = v_none
  ), 'Unlabeled object should be excluded from ranked T&H search';

  -- Sustainability exact label returns rank 0; equivalent action returns rank 1.
  v_rank := NULL;
  v_match := NULL;
  SELECT f.label_rank, f.label_match INTO v_rank, v_match
  FROM api.get_filtered_object_ids(
    jsonb_build_object('label_scheme_ranked', 'LBL_CLEF_VERTE'),
    ARRAY['HOT']::object_type[],
    ARRAY['published']::object_status[],
    NULL
  ) f
  WHERE f.object_id = v_sust_exact;
  ASSERT v_rank = 0, format('Expected certified sustainability rank 0, got %s', v_rank);
  ASSERT v_match->>'source' = 'certified_label', format('Expected certified_label sustainability source, got %s', v_match);

  v_rank := NULL;
  v_match := NULL;
  SELECT f.label_rank, f.label_match INTO v_rank, v_match
  FROM api.get_filtered_object_ids(
    jsonb_build_object('label_scheme_ranked', 'LBL_CLEF_VERTE'),
    ARRAY['HOT']::object_type[],
    ARRAY['published']::object_status[],
    NULL
  ) f
  WHERE f.object_id = v_sust_evidence;
  ASSERT v_rank = 1, format('Expected sustainability evidence rank 1, got %s', v_rank);
  ASSERT v_match->>'source' = 'sustainability_action', format('Expected sustainability_action source, got %s', v_match);

  SELECT array_agg(f.object_id ORDER BY f.label_rank, f.object_id) INTO v_ids
  FROM api.get_filtered_object_ids(
    jsonb_build_object('label_scheme_ranked', 'LBL_CLEF_VERTE'),
    ARRAY['HOT']::object_type[],
    ARRAY['published']::object_status[],
    NULL
  ) f
  WHERE f.object_id IN (v_sust_exact, v_sust_evidence);
  ASSERT v_ids = ARRAY[v_sust_exact, v_sust_evidence],
    format('Expected exact sustainability before evidence, got %s', v_ids);

  -- Main Explorer page endpoint preserves label_match on returned cards.
  v_page := api.list_object_resources_filtered_page(
    p_page_size := 10,
    p_filters := jsonb_build_object(
      'label_scheme_ranked', 'LBL_TOURISME_HANDICAP',
      'label_disability_types_any', to_jsonb(v_family),
      'disability_types_any', to_jsonb(v_family)
    ),
    p_types := ARRAY['HOT']::object_type[],
    p_status := ARRAY['published']::object_status[],
    p_search := 'rankedlabelregressionth',
    p_view := 'card'
  )::jsonb;

  SELECT array_agg(item.value->>'id' ORDER BY item.ordinality) INTO v_ids
  FROM jsonb_array_elements(v_page->'data') WITH ORDINALITY AS item(value, ordinality);
  ASSERT v_ids = ARRAY[v_th_exact, v_th_evidence],
    format('Expected Explorer cards exact T&H before evidence, got %s', v_ids);
  ASSERT (v_page->'data'->0->'label_match'->>'rank')::int = 0,
    'First Explorer card should carry rank 0 label_match';
  ASSERT (v_page->'data'->1->'label_match'->>'rank')::int = 1,
    'Second Explorer card should carry rank 1 label_match';

  v_page := api.list_object_resources_filtered_page(
    p_page_size := 10,
    p_filters := jsonb_build_object('label_scheme_ranked', 'LBL_CLEF_VERTE'),
    p_types := ARRAY['HOT']::object_type[],
    p_status := ARRAY['published']::object_status[],
    p_search := 'rankedlabelregressionsust',
    p_view := 'card'
  )::jsonb;
  SELECT array_agg(item.value->>'id' ORDER BY item.ordinality) INTO v_ids
  FROM jsonb_array_elements(v_page->'data') WITH ORDINALITY AS item(value, ordinality);
  ASSERT v_ids = ARRAY[v_sust_exact, v_sust_evidence],
    format('Expected Explorer cards exact sustainability before evidence, got %s', v_ids);

  -- Compatibility RPC still includes equivalent sustainability action matches.
  v_search := api.search_objects_by_label(
    p_label_value_id := v_clef_granted,
    p_include_partial := TRUE,
    p_lang_prefs := ARRAY['fr']::text[],
    p_limit := 10000,
    p_offset := 0
  )::jsonb;
  ASSERT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(v_search->'objects', '[]'::jsonb)) AS item(value)
    WHERE item.value->>'id' = v_sust_evidence
  ), 'search_objects_by_label should include equivalent sustainability action matches';

  RAISE NOTICE 'Ranked label search regression assertions passed.';
END$$;
ROLLBACK;
