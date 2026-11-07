-- migration_amenity_popularity_order.sql
-- §73: seed ref_amenity.position + ref_code_amenity_family.position from REAL usage
-- (count of object_amenity per amenity) so amenity pickers can default to the
-- « most common in the industry » order instead of alphabetical. The room equipment
-- picker (object-editor) consumes this order to group/sort its catalog; §10/§05 keep
-- their own alphabetical grouping (buildAmenityGroups re-sorts), so they are unaffected.
--
-- DATA fixup, IDEMPOTENT (recomputes the full ranking on each run), REVERSIBLE
-- (UPDATE ... SET position = 0). USAGE-DERIVED ⇒ a fresh DB (no objects, no usage) ranks
-- deterministically by id, not by usage — a cosmetic ordering divergence vs live, not a
-- schema one (the fresh-apply gate does not assert position values). After step 11
-- (seeds_data.sql — needs ref_amenity + ref_code_amenity_family) + any amenity import.

WITH amenity_usage AS (
  SELECT a.id, COUNT(oa.object_id) AS uses
  FROM public.ref_amenity a
  LEFT JOIN public.object_amenity oa ON oa.amenity_id = a.id
  GROUP BY a.id
),
amenity_rank AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY uses DESC, id) AS rnk FROM amenity_usage
)
UPDATE public.ref_amenity a
SET position = r.rnk
FROM amenity_rank r
WHERE r.id = a.id;

WITH family_usage AS (
  SELECT a.family_id, COUNT(oa.object_id) AS uses
  FROM public.ref_amenity a
  LEFT JOIN public.object_amenity oa ON oa.amenity_id = a.id
  WHERE a.family_id IS NOT NULL
  GROUP BY a.family_id
),
family_rank AS (
  SELECT family_id, ROW_NUMBER() OVER (ORDER BY uses DESC, family_id) AS rnk FROM family_usage
)
UPDATE public.ref_code_amenity_family f
SET position = r.rnk
FROM family_rank r
WHERE f.id = r.family_id;
