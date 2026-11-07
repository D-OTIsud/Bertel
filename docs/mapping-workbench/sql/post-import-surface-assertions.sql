-- Bertel post-import surface assertions.
-- Run after Base de donnée DLL et API/old_data_supabase_import_20260501/20_promotion.sql.
-- This complements the embedded import assertions by checking UI/detail surface readiness.

DO $bertel_surface_assertions$
DECLARE
  v_batch_id TEXT := 'old-data-berta2-all-20260501-01';
  n INTEGER;
BEGIN
  SELECT COUNT(*) INTO n
  FROM staging.object_temp
  WHERE import_batch_id = v_batch_id
    AND is_approved IS TRUE
    AND resolved_object_id IS NULL;
  IF n <> 0 THEN
    RAISE EXCEPTION 'Surface assertion failed: % approved object rows have no resolved_object_id', n;
  END IF;

  SELECT COUNT(*) INTO n
  FROM staging.object_location_temp l
  JOIN staging.object_temp t
    ON t.import_batch_id = l.import_batch_id
   AND t.staging_object_key = l.staging_object_key
  WHERE l.import_batch_id = v_batch_id
    AND l.is_approved IS TRUE
    AND t.resolved_object_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM object_location ol
      WHERE ol.object_id = t.resolved_object_id
        AND ol.is_main_location IS TRUE
    );
  IF n <> 0 THEN
    RAISE EXCEPTION 'Surface assertion failed: % approved location rows did not produce a main object_location', n;
  END IF;

  SELECT COUNT(*) INTO n
  FROM staging.object_description_temp d
  JOIN staging.object_temp t
    ON t.import_batch_id = d.import_batch_id
   AND t.staging_object_key = d.staging_object_key
  WHERE d.import_batch_id = v_batch_id
    AND d.is_approved IS TRUE
    AND t.resolved_object_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM object_description od
      WHERE od.object_id = t.resolved_object_id
    );
  IF n <> 0 THEN
    RAISE EXCEPTION 'Surface assertion failed: % approved description rows did not produce object_description', n;
  END IF;

  SELECT COUNT(*) INTO n
  FROM object o
  WHERE o.extra->>'import_batch_id' = v_batch_id
    AND NOT EXISTS (
      SELECT 1
      FROM object_external_id oei
      WHERE oei.object_id = o.id
        AND oei.source_system = 'berta_v2_csv_export'
    );
  IF n <> 0 THEN
    RAISE EXCEPTION 'Surface assertion failed: % imported objects are missing berta_v2_csv_export external id', n;
  END IF;

  SELECT COUNT(*) INTO n
  FROM (
    SELECT object_id
    FROM contact_channel
    GROUP BY object_id, kind_id, lower(trim(value))
    HAVING COUNT(*) > 1
  ) duplicate_contacts;
  IF n <> 0 THEN
    RAISE EXCEPTION 'Surface assertion failed: % duplicate object contact groups exist after import', n;
  END IF;

  SELECT COUNT(*) INTO n
  FROM (
    SELECT m.object_id
    FROM media m
    WHERE m.extra->>'import_batch_id' = v_batch_id
      AND m.is_main IS TRUE
    GROUP BY m.object_id
    HAVING COUNT(*) > 1
  ) duplicate_main_media;
  IF n <> 0 THEN
    RAISE EXCEPTION 'Surface assertion failed: % imported objects have more than one main media', n;
  END IF;

  RAISE NOTICE 'Bertel post-import surface assertions passed for batch %', v_batch_id;
END
$bertel_surface_assertions$;

WITH imported_objects AS (
  SELECT
    o.id,
    o.object_type::text AS object_type,
    o.status::text AS status,
    o.commercial_visibility,
    o.name
  FROM object o
  WHERE o.extra->>'import_batch_id' = 'old-data-berta2-all-20260501-01'
)
SELECT 'imported_object_counts' AS report, object_type, status, commercial_visibility, COUNT(*) AS rows
FROM imported_objects
GROUP BY object_type, status, commercial_visibility
ORDER BY rows DESC, object_type, status;

WITH imported_objects AS (
  SELECT o.id, o.object_type::text AS object_type, o.name
  FROM object o
  WHERE o.extra->>'import_batch_id' = 'old-data-berta2-all-20260501-01'
)
SELECT
  'surface_module_coverage' AS report,
  io.object_type,
  COUNT(DISTINCT io.id) AS objects,
  COUNT(DISTINCT ol.id) FILTER (WHERE ol.is_main_location IS TRUE) AS with_main_location,
  COUNT(DISTINCT od.id) AS with_description,
  COUNT(DISTINCT cc.id) AS contact_rows,
  COUNT(DISTINCT m.id) AS media_rows,
  COUNT(DISTINCT op.id) AS opening_period_rows,
  COUNT(DISTINCT price.id) AS price_rows
FROM imported_objects io
LEFT JOIN object_location ol ON ol.object_id = io.id
LEFT JOIN object_description od ON od.object_id = io.id
LEFT JOIN contact_channel cc ON cc.object_id = io.id
LEFT JOIN media m ON m.object_id = io.id
LEFT JOIN opening_period op ON op.object_id = io.id
LEFT JOIN object_price price ON price.object_id = io.id
GROUP BY io.object_type
ORDER BY io.object_type;

WITH imported_objects AS (
  SELECT o.id, o.object_type::text AS object_type, o.name
  FROM object o
  WHERE o.extra->>'import_batch_id' = 'old-data-berta2-all-20260501-01'
),
surface_flags AS (
  SELECT
    io.id,
    io.object_type,
    io.name,
    EXISTS (SELECT 1 FROM object_location ol WHERE ol.object_id = io.id AND ol.is_main_location IS TRUE) AS has_main_location,
    EXISTS (SELECT 1 FROM object_description od WHERE od.object_id = io.id) AS has_description,
    EXISTS (SELECT 1 FROM contact_channel cc WHERE cc.object_id = io.id) AS has_contact,
    EXISTS (SELECT 1 FROM media m WHERE m.object_id = io.id) AS has_media
  FROM imported_objects io
)
SELECT 'surface_gaps_sample' AS report, *
FROM surface_flags
WHERE NOT (has_main_location AND has_description AND has_contact AND has_media)
ORDER BY object_type, name
LIMIT 100;

SELECT
  'review_mapped_promoted' AS report,
  t.object_type::text AS promoted_type,
  COUNT(*) AS rows
FROM staging.object_temp t
WHERE t.import_batch_id = 'old-data-berta2-all-20260501-01'
  AND t.extra->>'mapping_review_required' = 'true'
GROUP BY t.object_type
ORDER BY rows DESC, promoted_type;
