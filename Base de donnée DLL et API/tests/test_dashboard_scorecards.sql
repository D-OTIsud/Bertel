-- test_dashboard_scorecards.sql
-- Dashboard §1 hero scorecards: avg_completeness (real, was NULL) + distinctions/_pct.
-- Run AFTER api_views_functions.sql. Self-contained + transactional (ROLLBACK).
\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v   jsonb;
  v_total       int;
  v_dist        int;
  v_dist_live   int;
  v_comp        numeric;
  v_comp_live   numeric;
BEGIN
  v := api.get_dashboard_scorecards();

  -- new keys present
  ASSERT v ? 'avg_completeness', 'avg_completeness key present';
  ASSERT v ? 'distinctions',     'distinctions key present';
  ASSERT v ? 'distinctions_pct', 'distinctions_pct key present';
  -- legacy keys preserved (additive change, no consumer break)
  ASSERT v ? 'total' AND v ? 'published' AND v ? 'pending_changes'
         AND v ? 'delta_30d' AND v ? 'avg_processing_days',
         'legacy scorecard keys preserved';

  v_total := (v->>'total')::int;
  v_dist  := (v->>'distinctions')::int;

  -- distinctions = objects with >=1 granted is_distinction classement/label,
  -- over the same published, non-ORG pool.
  SELECT COUNT(DISTINCT oc.object_id) INTO v_dist_live
  FROM   object_classification oc
  JOIN   ref_classification_scheme s ON s.id = oc.scheme_id
  JOIN   object o ON o.id = oc.object_id
  WHERE  oc.status = 'granted' AND s.is_distinction = TRUE
    AND  o.object_type <> 'ORG' AND o.status = 'published';
  ASSERT v_dist = v_dist_live,
         format('distinctions (%s) must match live count (%s)', v_dist, v_dist_live);

  -- distinctions_pct = round(distinctions*100/total, 1)
  IF v_total > 0 THEN
    ASSERT (v->>'distinctions_pct')::numeric = ROUND(v_dist * 100.0 / v_total, 1),
           'distinctions_pct = round(distinctions*100/total,1)';
  END IF;

  -- avg_completeness: real number in [0,100] when the pool is non-empty,
  -- and equal to the weighted mean of get_dashboard_completeness (single source of truth).
  IF v_total > 0 THEN
    ASSERT v->>'avg_completeness' IS NOT NULL, 'avg_completeness not null for non-empty pool';
    v_comp := (v->>'avg_completeness')::numeric;
    ASSERT v_comp >= 0 AND v_comp <= 100, 'avg_completeness within 0..100';

    SELECT ROUND(SUM((r.value->>'avg_score')::numeric * (r.value->>'total')::int)
                 / NULLIF(SUM((r.value->>'total')::int), 0), 1)
    INTO   v_comp_live
    FROM   jsonb_array_elements(api.get_dashboard_completeness(NULL,NULL,'{}'::jsonb,NULL,NULL,0)->'rows') AS r(value);
    ASSERT v_comp = v_comp_live,
           format('avg_completeness (%s) must equal weighted completeness mean (%s)', v_comp, v_comp_live);
  END IF;

  RAISE NOTICE 'get_dashboard_scorecards: avg_completeness + distinctions assertions passed.';
END$$;

-- avg_completeness IS NULL when the filtered pool is empty (impossible city filter).
DO $$
DECLARE v jsonb;
BEGIN
  v := api.get_dashboard_scorecards(NULL, NULL, '{"city_any":["__no_such_city__"]}'::jsonb);
  ASSERT (v->>'total')::int = 0, 'impossible filter yields empty pool';
  ASSERT v->>'avg_completeness' IS NULL, 'avg_completeness NULL on empty pool';
  ASSERT (v->>'distinctions')::int = 0, 'distinctions 0 on empty pool';
  ASSERT (v->>'distinctions_pct')::numeric = 0.0, 'distinctions_pct 0.0 on empty pool';
  RAISE NOTICE 'get_dashboard_scorecards: empty-pool assertions passed.';
END$$;

ROLLBACK;
