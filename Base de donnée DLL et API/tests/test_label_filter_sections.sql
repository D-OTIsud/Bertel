-- test_label_filter_sections.sql
-- Label filter sectioning regression (decision log §173):
--   * label_scheme_ranked_exact_only=true restricts api.get_filtered_object_ids to rank-0 (certified label).
--   * api.list_object_resources_filtered_page sorts label_rank first when the label filter is active (even with search).
--   * meta.label_rank_counts = {labelled, equivalent} is correct.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_labelled text := 'HOTLBLSECT000001';   -- holds LBL_CLEF_VERTE (granted)
  v_equiv    text := 'HOTLBLSECT000002';   -- equivalent sustainability action, no label
  v_scheme   uuid;
  v_value    uuid;
  v_action   uuid;
  v_rows     int;
BEGIN
  SELECT id INTO v_scheme FROM ref_classification_scheme WHERE code = 'LBL_CLEF_VERTE';
  ASSERT v_scheme IS NOT NULL, 'Missing LBL_CLEF_VERTE scheme seed';
  SELECT id INTO v_value FROM ref_classification_value WHERE scheme_id = v_scheme AND code = 'granted';
  ASSERT v_value IS NOT NULL, 'Missing LBL_CLEF_VERTE granted value seed';
  SELECT rcea.action_id INTO v_action
  FROM ref_classification_equivalent_action rcea
  WHERE rcea.scheme_id = v_scheme AND rcea.match_scope IN ('search_expansion','both')
  LIMIT 1;
  ASSERT v_action IS NOT NULL, 'Missing equivalent action seed for LBL_CLEF_VERTE';

  INSERT INTO object (id, object_type, status, name) VALUES
    (v_labelled, 'HOT', 'published', 'Labelled Sect Test'),
    (v_equiv,    'HOT', 'published', 'Equivalent Sect Test');
  INSERT INTO object_classification (object_id, scheme_id, value_id, subvalue_ids, status)
    VALUES (v_labelled, v_scheme, v_value, NULL, 'granted');
  INSERT INTO object_sustainability_action (object_id, action_id)
    VALUES (v_equiv, v_action);

  -- exact_only=true ⇒ only the labelled object survives; the equivalent one is excluded.
  SELECT COUNT(*) INTO v_rows
  FROM api.get_filtered_object_ids(
    jsonb_build_object('label_scheme_ranked','LBL_CLEF_VERTE','label_scheme_ranked_exact_only',true),
    ARRAY['HOT']::object_type[], ARRAY['published']::object_status[], NULL
  ) f WHERE f.object_id IN (v_labelled, v_equiv);
  ASSERT v_rows = 1, format('exact_only should return only the labelled object, got %s rows', v_rows);

  SELECT COUNT(*) INTO v_rows
  FROM api.get_filtered_object_ids(
    jsonb_build_object('label_scheme_ranked','LBL_CLEF_VERTE','label_scheme_ranked_exact_only',true),
    ARRAY['HOT']::object_type[], ARRAY['published']::object_status[], NULL
  ) f WHERE f.object_id = v_equiv;
  ASSERT v_rows = 0, 'exact_only must exclude equivalent-evidence objects';

  -- default (no exact_only) still returns BOTH (rank-0 + rank-1).
  SELECT COUNT(*) INTO v_rows
  FROM api.get_filtered_object_ids(
    jsonb_build_object('label_scheme_ranked','LBL_CLEF_VERTE'),
    ARRAY['HOT']::object_type[], ARRAY['published']::object_status[], NULL
  ) f WHERE f.object_id IN (v_labelled, v_equiv);
  ASSERT v_rows = 2, format('default should return both objects, got %s', v_rows);

  -- Sort: with a search term that matches BOTH, the labelled (rank-0) card must come FIRST.
  DECLARE
    v_page   jsonb;
    v_first  text;
    v_counts jsonb;
  BEGIN
    v_page := api.list_object_resources_filtered_page(
      NULL, ARRAY['fr']::text[], 50,
      jsonb_build_object('label_scheme_ranked','LBL_CLEF_VERTE'),
      ARRAY['HOT']::object_type[], ARRAY['published']::object_status[],
      'Sect Test'
    )::jsonb;
    SELECT (elem->>'id') INTO v_first
    FROM jsonb_array_elements(v_page->'data') WITH ORDINALITY AS t(elem, ord)
    WHERE (elem->>'id') IN (v_labelled, v_equiv)
    ORDER BY ord LIMIT 1;
    ASSERT v_first = v_labelled, format('labelled card must sort first under search, got %s', v_first);

    v_counts := v_page->'meta'->'label_rank_counts';
    ASSERT v_counts IS NOT NULL, 'meta.label_rank_counts must be present when label filter active';
    ASSERT (v_counts->>'labelled')::int >= 1, format('labelled count wrong: %s', v_counts);
    ASSERT (v_counts->>'equivalent')::int >= 1, format('equivalent count wrong: %s', v_counts);
  END;

  RAISE NOTICE 'Label filter sectioning (exact_only + sort + counts) assertions passed.';
END$$;
ROLLBACK;
