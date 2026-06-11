-- test_capacity_applicability_seed.sql
-- Proves migration_capacity_applicability_seed.sql (§46 companion): ref_capacity_applicability
-- is populated. Run AFTER the full manifest. Transactional (ROLLBACK).
\set ON_ERROR_STOP on
BEGIN;
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM ref_capacity_applicability) >= 30,
         'ref_capacity_applicability still (nearly) empty -- seed missing';
  ASSERT EXISTS (SELECT 1 FROM ref_capacity_applicability a JOIN ref_capacity_metric m ON m.id=a.metric_id
                 WHERE m.code='beds' AND a.object_type='HOT'), 'beds must apply to HOT';
  ASSERT NOT EXISTS (SELECT 1 FROM ref_capacity_applicability a JOIN ref_capacity_metric m ON m.id=a.metric_id
                 WHERE m.code='beds' AND a.object_type='RES'), 'beds must NOT apply to RES';
  ASSERT (SELECT count(DISTINCT a.object_type) FROM ref_capacity_applicability a
          JOIN ref_capacity_metric m ON m.id=a.metric_id WHERE m.code='max_capacity') >= 17,
         'max_capacity must apply to every enum value';
  ASSERT EXISTS (SELECT 1 FROM ref_capacity_applicability a JOIN ref_capacity_metric m ON m.id=a.metric_id
                 WHERE m.code='seats' AND a.object_type='RES'), 'seats must apply to RES (RES bucket facet)';
  ASSERT EXISTS (SELECT 1 FROM ref_capacity_applicability a JOIN ref_capacity_metric m ON m.id=a.metric_id
                 WHERE m.code='standing_places' AND a.object_type='RES'), 'standing_places must apply to RES (RES bucket fallback)';
  -- §07 review (2026-06-11): the post-13c types PRD/SPU must be covered too — max_capacity via
  -- the cross-join (order 8u/8x < 13c on fresh; live backfilled by re-running 13c) + their extras.
  ASSERT EXISTS (SELECT 1 FROM ref_capacity_applicability a JOIN ref_capacity_metric m ON m.id=a.metric_id
                 WHERE m.code='max_capacity' AND a.object_type='PRD'), 'max_capacity must apply to PRD';
  ASSERT EXISTS (SELECT 1 FROM ref_capacity_applicability a JOIN ref_capacity_metric m ON m.id=a.metric_id
                 WHERE m.code='max_capacity' AND a.object_type='SPU'), 'max_capacity must apply to SPU';
  ASSERT EXISTS (SELECT 1 FROM ref_capacity_applicability a JOIN ref_capacity_metric m ON m.id=a.metric_id
                 WHERE m.code='seats' AND a.object_type='PRD'), 'seats must apply to PRD (degustation)';
  ASSERT EXISTS (SELECT 1 FROM ref_capacity_applicability a JOIN ref_capacity_metric m ON m.id=a.metric_id
                 WHERE m.code='vehicles' AND a.object_type='SPU'), 'vehicles must apply to SPU (parkings/aires)';
  RAISE NOTICE 'capacity applicability seed assertions passed.';
END$$;
ROLLBACK;
