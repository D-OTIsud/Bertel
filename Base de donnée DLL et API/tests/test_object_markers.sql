-- test_object_markers.sql
-- Proves api.list_object_markers (§125) is the lightweight Explorer map data source:
--   * structural: function exists, SECURITY DEFINER, RETURNS json, anon+authenticated EXECUTE.
--   * behavioral (anon): a published geolocated object appears; a DRAFT geolocated object is hidden
--     (authorize-once readable gate); a published object WITHOUT a main geolocation is excluded; a
--     published row with NULL coords is excluded; the p_types filter narrows; the payload shape is stable.
-- Run AFTER the full manifest. Self-contained + transactional (ROLLBACK; nothing persists). Inserts run
-- as the connecting superuser (RLS bypassed); SET LOCAL ROLE + request.jwt.claims drive the per-role checks.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_pub_geo    text := 'RESRUN9999999901';  -- published RES, geolocated   → visible to anon
  v_draft_geo  text := 'RESRUN9999999902';  -- draft RES, geolocated        → hidden from anon
  v_pub_nogeo  text := 'RESRUN9999999903';  -- published RES, NO location   → excluded (not geolocated)
  v_pub_nulll  text := 'RESRUN9999999904';  -- published RES, location with NULL coords → excluded
  v_pub_hot    text := 'HOTRUN9999999905';  -- published HOT, geolocated    → excluded by p_types=RES
  v_markers    json;
  v_ids        text[];
  v_sample     jsonb;
BEGIN
  -- ---------- Structural assertions ----------
  ASSERT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                 WHERE n.nspname='api' AND p.proname='list_object_markers' AND p.prosecdef IS TRUE),
         'api.list_object_markers missing or not SECURITY DEFINER';
  ASSERT (SELECT pg_get_function_result(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE n.nspname='api' AND p.proname='list_object_markers') = 'json',
         'api.list_object_markers must RETURN json';
  ASSERT has_function_privilege('anon',
           'api.list_object_markers(object_type[],object_status[],jsonb,text)','EXECUTE'),
         'anon lacks EXECUTE on api.list_object_markers';
  ASSERT has_function_privilege('authenticated',
           'api.list_object_markers(object_type[],object_status[],jsonb,text)','EXECUTE'),
         'authenticated lacks EXECUTE on api.list_object_markers';

  -- ---------- Fixture (superuser; RLS bypassed) ----------
  INSERT INTO object (id, object_type, name, status) VALUES
    (v_pub_geo,   'RES', 'marker pub geo',     'published'),
    (v_draft_geo, 'RES', 'marker draft geo',   'draft'),
    (v_pub_nogeo, 'RES', 'marker pub no-geo',  'published'),
    (v_pub_nulll, 'RES', 'marker pub null-lat','published'),
    (v_pub_hot,   'HOT', 'marker pub hot',     'published');
  INSERT INTO object_location (object_id, is_main_location, latitude, longitude, city) VALUES
    (v_pub_geo,   TRUE, -21.10, 55.50, 'Saint-Denis'),
    (v_draft_geo, TRUE, -21.20, 55.60, 'Saint-Pierre'),
    (v_pub_nulll, TRUE, NULL,   NULL,  'Le Tampon'),   -- both coords NULL (chk_latlon_both_or_none) ⇒ excluded
    (v_pub_hot,   TRUE, -21.30, 55.40, 'Saint-Paul');
  -- v_pub_nogeo intentionally has NO object_location row.

  -- ---------- ANON ----------
  -- NB: we pass status ['published','draft'] on purpose. Empty-filter published-ONLY hits the
  -- MV fast path (get_filtered_object_ids use_mv=TRUE), which reads the cron-refreshed
  -- internal.mv_filtered_objects — it will NOT contain these uncommitted fixture rows. Adding 'draft'
  -- forces the live (non-MV) path. Draft is then hidden NOT by the status arg but by the §36
  -- authorize-once readable-set gate (anon readable = published only) — the real security boundary.
  PERFORM set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  SET LOCAL ROLE anon;

  v_markers := api.list_object_markers(NULL, ARRAY['published','draft']::object_status[], '{}'::jsonb, NULL);
  SELECT array_agg(elem->>'id') INTO v_ids FROM json_array_elements(v_markers) elem;

  ASSERT v_pub_geo  = ANY(v_ids),       'published geolocated object must appear in markers';
  ASSERT NOT (v_draft_geo = ANY(v_ids)),'draft object must NOT appear for anon (readable-set gate)';
  ASSERT NOT (v_pub_nogeo = ANY(v_ids)),'published object without a main location must be excluded';
  ASSERT NOT (v_pub_nulll = ANY(v_ids)),'published object with NULL coords must be excluded';
  ASSERT v_pub_hot  = ANY(v_ids),       'published HOT object must appear when no type filter';

  -- ---------- Payload shape (the fields MapPanel consumes) ----------
  SELECT elem::jsonb INTO v_sample
  FROM json_array_elements(v_markers) elem WHERE elem->>'id' = v_pub_geo;
  ASSERT v_sample->>'type' = 'RES',                       'marker.type wrong';
  ASSERT v_sample->>'name' = 'marker pub geo',            'marker.name wrong';
  ASSERT (v_sample->'location'->>'lat')::float = -21.10,  'marker.location.lat wrong';
  ASSERT (v_sample->'location'->>'lon')::float = 55.50,   'marker.location.lon wrong';
  ASSERT v_sample->'location'->>'city' = 'Saint-Denis',   'marker.location.city wrong';
  ASSERT v_sample ? 'image' AND v_sample ? 'open_now',    'marker must carry image + open_now keys';

  -- ---------- p_types filter narrows ----------
  v_markers := api.list_object_markers(ARRAY['RES']::object_type[], ARRAY['published','draft']::object_status[], '{}'::jsonb, NULL);
  SELECT array_agg(elem->>'id') INTO v_ids FROM json_array_elements(v_markers) elem;
  ASSERT v_pub_geo = ANY(v_ids),        'RES filter must include the published RES marker';
  ASSERT NOT (v_pub_hot = ANY(v_ids)),  'RES filter must exclude the HOT marker';

  RESET ROLE;
  RAISE NOTICE 'test_object_markers: PASSED';
END $$;
ROLLBACK;
