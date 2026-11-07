-- migration_capacity_applicability_seed.sql
-- §46 (companion) — seeds ref_capacity_applicability (metric -> object_type), which existed since
-- the base schema but had 0 rows: the Explorer's bucketCapacityOptions filtered capacity facets
-- against an empty set (dead facets), and the documented purpose of the table (data dictionary
-- §5.7) was unrealised. Editor §07 does NOT yet filter by this table (deferred -- decision log).
-- PREREQUISITES: seeds_data.sql (step 11 -- ref_capacity_metric rows). Manifest step 13c.
-- IDEMPOTENT: INSERT ... ON CONFLICT DO NOTHING.
-- REVERSIBLE: DELETE FROM ref_capacity_applicability;
-- LIVE PRE-FLIGHT (2026-06-10): ref_capacity_metric has all 12 codes referenced below; the table
--   had 0 rows. Explorer buckets that surface capacity facets: HOT (HOT/HPA/HLO/CAMP/RVA) and RES.
--   Step-1 extension vs the plan's proposed matrix: standing_places->RES added so the RES bucket
--   surfaces "Places debout" (its static fallback expects it; RES family = {RES} only).
-- AMENDED 2026-06-11 (§07 review): PRD/SPU extras added below. The max_capacity cross-join
--   self-heals for enum values added later on a FRESH build (8u/8x run before 13c), but LIVE ran
--   13c before PRD/SPU existed -> re-run this file on live (idempotent) to backfill them.
--   PRD (producteur ouvert au public): seats (degustation assise), standing_places (visite).
--   SPU (equipement public): vehicles (parkings/aires/bornes), seats (aires de pique-nique).
BEGIN;

-- max_capacity applies to every object type (cross join with the enum -- 17 types incl. ORG/ACT).
INSERT INTO ref_capacity_applicability (metric_id, object_type)
SELECT m.id, e.enumlabel::object_type
FROM ref_capacity_metric m
CROSS JOIN pg_enum e
WHERE m.code = 'max_capacity' AND e.enumtypid = 'object_type'::regtype
ON CONFLICT DO NOTHING;

INSERT INTO ref_capacity_applicability (metric_id, object_type)
SELECT m.id, v.object_type::object_type
FROM ref_capacity_metric m
JOIN (VALUES
  ('beds','HOT'),('beds','HPA'),('beds','HLO'),('beds','CAMP'),('beds','RVA'),
  ('bedrooms','HOT'),('bedrooms','HLO'),('bedrooms','RVA'),
  ('seats','RES'),('seats','LOI'),('seats','PCU'),('seats','FMA'),('seats','ASC'),
  ('standing_places','FMA'),('standing_places','LOI'),('standing_places','PCU'),('standing_places','RES'),
  ('pitches','HPA'),('pitches','CAMP'),
  ('campers','HPA'),('campers','CAMP'),
  ('tents','HPA'),('tents','CAMP'),
  ('vehicles','HPA'),('vehicles','CAMP'),('vehicles','PSV'),
  ('bikes','PSV'),('bikes','ITI'),('bikes','LOI'),
  ('seats','PRD'),('standing_places','PRD'),
  ('seats','SPU'),('vehicles','SPU'),
  ('meeting_rooms','HOT'),('meeting_rooms','HPA'),('meeting_rooms','HLO'),('meeting_rooms','CAMP'),('meeting_rooms','RVA'),
  ('floor_area_m2','HOT'),('floor_area_m2','COM'),('floor_area_m2','LOI')
) AS v(code, object_type) ON v.code = m.code
ON CONFLICT DO NOTHING;

COMMIT;
