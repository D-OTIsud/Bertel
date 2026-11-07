-- =====================================================
-- Performance Testing Script
-- Tests database performance with various data sizes
-- =====================================================

-- Enable query timing
\timing on

-- Keep planner defaults for realistic plans
SET work_mem = '256MB';     -- Increase work memory for large queries

-- =====================================================
-- Test 1: Count objects by type and status
-- =====================================================
\echo 'Test 1: Count objects by type and status'
EXPLAIN ANALYZE
SELECT object_type, status, COUNT(*) 
FROM object 
GROUP BY object_type, status;

-- =====================================================
-- Test 2: Search by name (full-text search)
-- =====================================================
\echo 'Test 2: Search by name using full-text search'
EXPLAIN ANALYZE
SELECT id, name, object_type, status
FROM object
WHERE name_search_vector @@ plainto_tsquery('french', 'restaurant')
  AND status = 'published'
LIMIT 20;

-- =====================================================
-- Test 3: Search by city (full-text search)
-- =====================================================
\echo 'Test 3: Search by city using full-text search'
EXPLAIN ANALYZE
SELECT o.id, o.name, ol.city
FROM object o
JOIN object_location ol ON ol.object_id = o.id AND ol.is_main_location = TRUE
WHERE ol.city_search_vector @@ plainto_tsquery('french', 'paris')
  AND o.status = 'published'
LIMIT 20;

-- =====================================================
-- Test 4: Get objects with deep data (N+1 fix test)
-- =====================================================
\echo 'Test 4: Get objects with deep data (batch)'
EXPLAIN ANALYZE
SELECT api.get_objects_with_deep_data(
  ARRAY(SELECT id FROM object WHERE status = 'published' LIMIT 10),
  ARRAY['fr', 'en']
);

-- =====================================================
-- Test 5: List objects with filters and pagination
-- =====================================================
\echo 'Test 5: List objects with filters'
EXPLAIN ANALYZE
SELECT api.list_object_resources_page_text(
  p_page_size := 20,
  p_types := ARRAY['RES', 'HOT']::text[],
  p_status := ARRAY['published']::text[],
  p_search := 'restaurant',
  p_track_format := 'none'
);

-- =====================================================
-- Test 6: Search by label with partial matches
-- =====================================================
\echo 'Test 6: Search by label with partial matches'
-- Note: Replace with actual label_value_id from your database
EXPLAIN ANALYZE
SELECT api.search_objects_by_label(
  p_label_value_id := (SELECT id FROM ref_classification_value LIMIT 1),
  p_include_partial := TRUE,
  p_limit := 20,
  p_offset := 0
);

-- =====================================================
-- Test 7: Get object resource with org-specific fallback
-- =====================================================
\echo 'Test 7: Get object resource with org-specific fallback'
EXPLAIN ANALYZE
SELECT api.get_object_resource(
  (SELECT id FROM object WHERE status = 'published' LIMIT 1),
  ARRAY['fr'],
  'none',
  jsonb_build_object('org_object_id', (SELECT org_object_id FROM object_org_link WHERE is_primary = TRUE LIMIT 1))
);

-- =====================================================
-- Test 8: Complex filter query (with amenities, location, etc.)
-- =====================================================
\echo 'Test 8: Complex filter query'
EXPLAIN ANALYZE
SELECT api.list_object_resources_filtered_page(
  p_page_size := 20,
  p_types := ARRAY['RES', 'HOT']::object_type[],
  p_status := ARRAY['published']::object_status[],
  p_filters := jsonb_build_object(
    'amenities_any', jsonb_build_array('wifi', 'parking'),
    'within_radius', jsonb_build_object(
      'lat', 48.8566,
      'lon', 2.3522,
      'radius_m', 5000
    )
  ),
  p_track_format := 'none'
);

-- =====================================================
-- Test 9: Index usage verification
-- =====================================================
\echo 'Test 9: Verify index usage on object table'
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT id, name, object_type, status, updated_at
FROM object
WHERE object_type = 'RES'
  AND status = 'published'
  AND updated_at > NOW() - INTERVAL '30 days'
ORDER BY updated_at DESC
LIMIT 100;

-- =====================================================
-- Test 10: Media fallback query
-- =====================================================
\echo 'Test 10: Media fallback query performance'
EXPLAIN ANALYZE
SELECT 
  m.id,
  m.object_id,
  m.org_object_id,
  m.url,
  m.is_main
FROM media m
WHERE m.object_id = (SELECT id FROM object WHERE status = 'published' LIMIT 1)
  AND m.is_published = TRUE
ORDER BY 
  CASE WHEN m.org_object_id IS NOT NULL THEN 0 ELSE 1 END,
  m.is_main DESC,
  m.position NULLS LAST;

-- =====================================================
-- Performance Summary Queries
-- =====================================================

\echo 'Performance Summary: Table sizes'
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
  pg_total_relation_size(schemaname||'.'||tablename) AS size_bytes
FROM pg_tables
WHERE schemaname IN ('public', 'api')
  AND tablename IN ('object', 'object_location', 'object_description', 'media', 'object_sustainability_action', 'object_classification')
ORDER BY size_bytes DESC;

\echo 'Performance Summary: Index sizes'
SELECT
  schemaname,
  tablename,
  indexname,
  pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
WHERE schemaname IN ('public', 'api')
  AND tablename IN ('object', 'object_location')
  AND (
    indexname LIKE '%search%'
    OR indexname LIKE '%name%'
    OR indexname LIKE '%city%'
  )
ORDER BY pg_relation_size(indexrelid) DESC;

\echo 'Performance Summary: Index usage statistics'
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan as index_scans,
  idx_tup_read as tuples_read,
  idx_tup_fetch as tuples_fetched
FROM pg_stat_user_indexes
WHERE schemaname IN ('public', 'api')
  AND tablename IN ('object', 'object_location')
ORDER BY idx_scan DESC;

-- =====================================================
-- Test 11: Map view performance
-- =====================================================
\echo 'Test 11: Map view with 500 objects in bbox'
EXPLAIN ANALYZE
SELECT api.list_objects_map_view(
  p_types := ARRAY['RES', 'HOT', 'VIL'],
  p_filters := jsonb_build_object(
    'bbox', jsonb_build_array(2.0, 48.5, 3.0, 49.0)
  ),
  p_limit := 500
);

-- =====================================================
-- Test 12: Batch operation optimization
-- =====================================================
\echo 'Test 12: Batch fetch 100 objects (optimized with LATERAL)'
EXPLAIN ANALYZE
SELECT api.get_objects_with_deep_data(
  ARRAY(SELECT id FROM object WHERE status = 'published' LIMIT 100),
  ARRAY['fr', 'en']
);

-- =====================================================
-- Test 13: GPX export with cache
-- =====================================================
\echo 'Test 13: GPX export (cached)'
EXPLAIN ANALYZE
SELECT api.export_itinerary_gpx(
  (SELECT object_id FROM object_iti LIMIT 1),
  TRUE,
  TRUE
);

-- =====================================================
-- Test 14: Simplified track for map display
-- =====================================================
\echo 'Test 14: Simplified track (10m tolerance)'
EXPLAIN ANALYZE
SELECT api.get_itinerary_track_simplified(
  (SELECT object_id FROM object_iti LIMIT 1),
  0.0001
);

-- =====================================================
-- Test 15: GeoJSON track with stages
-- =====================================================
\echo 'Test 15: GeoJSON FeatureCollection (track + stages)'
EXPLAIN ANALYZE
SELECT api.get_itinerary_track_geojson(
  (SELECT object_id FROM object_iti LIMIT 1),
  TRUE,
  0.0001
);

-- =====================================================
-- Test 16: Validated changes endpoint
-- =====================================================
\echo 'Test 16: Validated changes endpoint'
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT api.list_objects_with_validated_changes_since(
  NOW() - INTERVAL '30 days'
);

-- =====================================================
-- Test 17: Filtered IDs hot path (cache arrays + MV route eligibility)
-- =====================================================
\echo 'Test 17: Filtered IDs hot path'
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT object_id
FROM api.get_filtered_object_ids(
  p_filters := jsonb_build_object(
    'amenities_any', jsonb_build_array('wifi', 'parking'),
    'within_radius', jsonb_build_object(
      'lat', 48.8566,
      'lon', 2.3522,
      'radius_m', 5000
    )
  ),
  p_types := ARRAY['RES', 'HOT']::object_type[],
  p_status := ARRAY['published']::object_status[],
  p_search := 'restaurant'
)
LIMIT 200;

-- =====================================================
-- Test 18: Materialized view health baseline
-- =====================================================
\echo 'Test 18: MV health baseline'
EXPLAIN ANALYZE
SELECT COUNT(*) FROM internal.mv_filtered_objects;

EXPLAIN ANALYZE
SELECT COUNT(*)
FROM object o
JOIN object_location ol ON ol.object_id = o.id AND ol.is_main_location = TRUE
WHERE o.status = 'published';

-- =====================================================
-- Data Size Comparisons
-- =====================================================
\echo 'Data size comparison: Full API vs Map View'
SELECT 
  'Full API (100 objects)' as version,
  pg_size_pretty(LENGTH(api.list_object_resources_page_text(p_page_size := 100)::text)::bigint) as size
UNION ALL
SELECT 
  'Map View (100 objects)',
  pg_size_pretty(LENGTH(api.list_objects_map_view(p_limit := 100)::text)::bigint);

\echo 'Track size comparison: Full GPX vs Simplified GeoJSON'
SELECT 
  o.id,
  o.name,
  pg_size_pretty(LENGTH(api.export_itinerary_gpx(o.object_id, TRUE, TRUE))::bigint) as full_gpx_size,
  pg_size_pretty(LENGTH(api.get_itinerary_track_simplified(o.object_id)::text)::bigint) as simplified_size,
  pg_size_pretty(LENGTH(api.get_itinerary_track_geojson(o.object_id, TRUE)::text)::bigint) as geojson_size
FROM object o
JOIN object_iti oi ON oi.object_id = o.id
WHERE o.object_type = 'ITI' 
LIMIT 5;

-- Reset settings
SET work_mem = DEFAULT;
\timing off

