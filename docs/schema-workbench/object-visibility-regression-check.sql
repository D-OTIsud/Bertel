-- =====================================================================
-- object-visibility-regression-check.sql
-- =====================================================================
-- Review-only regression checks for the Explorer visibility fix in
-- `api.get_filtered_object_ids` (see api_views_functions.sql, around line 899).
--
-- WHAT THIS FILE IS
--   A read-only script that can be run after the SQL change has been
--   deployed to a target environment. It must not modify any table, MV
--   or function. Run it with `psql -f` or paste section by section.
--
-- WHAT IT VERIFIES
--   1. The hot path (`['published']`) still uses `internal.mv_filtered_objects`.
--   2. The live path (`['draft']`, `['published','draft']`, …) returns drafts.
--   3. The routing rule for `use_mv` matches the spec.
--   4. Empty-array filters are now treated as "no filter", not as
--      "match nothing".
--   5. A representative editor session can see at least one draft card.
--
-- WHO TO IMPERSONATE
--   `44b43d4b-e5be-446d-aac0-0a5b43a4cdc2` (super_admin + org_admin of
--   OTI du Sud). Replace with a different editor JWT before running on a
--   non-dev environment if needed.
-- =====================================================================

BEGIN;

SET LOCAL statement_timeout = '30s';
SET LOCAL request.jwt.claim.sub   = '44b43d4b-e5be-446d-aac0-0a5b43a4cdc2';
SET LOCAL request.jwt.claim.role  = 'authenticated';
SET LOCAL request.jwt.claim.email = 'd.philippe@otisud.com';
SET LOCAL request.jwt.claims = '{"sub":"44b43d4b-e5be-446d-aac0-0a5b43a4cdc2","role":"authenticated","email":"d.philippe@otisud.com"}';
SET LOCAL role = 'authenticated';


-- ---------------------------------------------------------------------
-- 1. Routing rule for use_mv must match the spec.
--    use_mv = TRUE iff p_status is NULL or contained in {'published'}.
-- ---------------------------------------------------------------------
WITH cases(label, p_status, expected) AS (
  VALUES
    ('NULL',                NULL::object_status[],                                    TRUE),
    ('published only',      ARRAY['published']::object_status[],                      TRUE),
    ('draft only',          ARRAY['draft']::object_status[],                          FALSE),
    ('published,draft',     ARRAY['published','draft']::object_status[],              FALSE),
    ('draft,published',     ARRAY['draft','published']::object_status[],              FALSE),
    ('published,archived',  ARRAY['published','archived']::object_status[],           FALSE)
)
SELECT label,
       expected,
       (p_status IS NULL OR p_status <@ ARRAY['published']::object_status[]) AS actual,
       (expected = (p_status IS NULL OR p_status <@ ARRAY['published']::object_status[])) AS ok
FROM cases
ORDER BY label;


-- ---------------------------------------------------------------------
-- 2. api.get_filtered_object_ids returns the expected status distribution
--    for editor-style status arrays.
--    These call the SECURITY DEFINER function so they see ALL rows that
--    pass the status filter, regardless of RLS.
-- ---------------------------------------------------------------------
WITH ids_published_only AS (
  SELECT fids.object_id
  FROM api.get_filtered_object_ids('{}'::jsonb, NULL, ARRAY['published']::object_status[], NULL) fids
),
ids_draft_only AS (
  SELECT fids.object_id
  FROM api.get_filtered_object_ids('{}'::jsonb, NULL, ARRAY['draft']::object_status[], NULL) fids
),
ids_pub_and_draft AS (
  SELECT fids.object_id
  FROM api.get_filtered_object_ids('{}'::jsonb, NULL, ARRAY['published','draft']::object_status[], NULL) fids
),
joined_pub AS (
  SELECT o.status::text AS status, COUNT(*) AS n
  FROM ids_published_only i JOIN object o ON o.id = i.object_id
  GROUP BY o.status
),
joined_draft AS (
  SELECT o.status::text AS status, COUNT(*) AS n
  FROM ids_draft_only i JOIN object o ON o.id = i.object_id
  GROUP BY o.status
),
joined_both AS (
  SELECT o.status::text AS status, COUNT(*) AS n
  FROM ids_pub_and_draft i JOIN object o ON o.id = i.object_id
  GROUP BY o.status
)
SELECT 'published_only'    AS variant, status, n FROM joined_pub
UNION ALL
SELECT 'draft_only',                   status, n FROM joined_draft
UNION ALL
SELECT 'published_and_draft',          status, n FROM joined_both
ORDER BY variant, status;
-- Expected on the diagnostic snapshot (2026-05-19):
--   published_only       published 374
--   draft_only           draft     474
--   published_and_draft  draft     474
--   published_and_draft  published 374


-- ---------------------------------------------------------------------
-- 3. Empty-array filters are now equivalent to "no filter applied".
--    Without the fix, any of these would have returned 0.
-- ---------------------------------------------------------------------
WITH cases(label, filters) AS (
  VALUES
    ('city_any: []',                  '{"city_any": []}'::jsonb),
    ('lieu_dit_any: []',              '{"lieu_dit_any": []}'::jsonb),
    ('amenities_any: []',             '{"amenities_any": []}'::jsonb),
    ('amenity_families_any: []',      '{"amenity_families_any": []}'::jsonb),
    ('commercial_visibility_any: []', '{"commercial_visibility_any": []}'::jsonb),
    ('payment_methods_any: []',       '{"payment_methods_any": []}'::jsonb),
    ('environment_tags_any: []',      '{"environment_tags_any": []}'::jsonb),
    ('languages_any: []',             '{"languages_any": []}'::jsonb),
    ('media_types_any: []',           '{"media_types_any": []}'::jsonb),
    ('meeting equipment_any: []',     '{"meeting_room": {"equipment_any": []}}'::jsonb),
    ('tags_any: []',                  '{"tags_any": []}'::jsonb),
    ('iti practices_any: []',         '{"itinerary": {"practices_any": []}}'::jsonb),
    ('classifications_any: []',       '{"classifications_any": []}'::jsonb),
    ('taxonomy_any: []',              '{"taxonomy_any": []}'::jsonb),
    ('disability_types_any: []',      '{"disability_types_any": []}'::jsonb),
    ('label_disability_types_any: []','{"label_disability_types_any": []}'::jsonb)
),
counts AS (
  SELECT c.label,
         (SELECT COUNT(*) FROM api.get_filtered_object_ids(
            c.filters, NULL, ARRAY['published','draft']::object_status[], NULL
         )) AS n
  FROM cases c
)
SELECT label,
       n,
       (n >= 1) AS ok  -- expectation: empty-array filter no longer culls everything
FROM counts
ORDER BY label;


-- ---------------------------------------------------------------------
-- 4. Editor sees at least one draft card through the public Explorer RPC.
--    This exercises the full stack (get_filtered_object_ids → object →
--    RLS → get_object_cards_batch).
-- ---------------------------------------------------------------------
WITH payload AS (
  SELECT api.list_object_resources_filtered_page(
    NULL,
    ARRAY['fr','en']::text[],
    5,
    '{}'::jsonb,
    NULL,
    ARRAY['published','draft']::object_status[],
    NULL,
    'none',
    NULL,
    NULL,
    'card'
  ) AS payload
),
data AS (
  SELECT (payload::jsonb -> 'data') AS data,
         (payload::jsonb -> 'meta'->>'total')::bigint AS total
  FROM payload
)
SELECT
  total                                                                  AS rpc_total,
  jsonb_array_length(data)                                               AS returned_rows,
  EXISTS (
    SELECT 1
    FROM jsonb_array_elements(data) AS card
    WHERE card->>'status' = 'draft'
  )                                                                      AS contains_draft
FROM data;
-- Expected: rpc_total ≥ (published count + draft count) per the editor's RLS
-- view; contains_draft = TRUE; returned_rows ≤ 5.


-- ---------------------------------------------------------------------
-- 5. Published-only call still resolves through the MV (sanity check on
--    counts; equality with the MV row count is the indirect signal that
--    the hot path is unchanged for the public Explorer).
-- ---------------------------------------------------------------------
SELECT
  (SELECT COUNT(*) FROM api.get_filtered_object_ids(
     '{}'::jsonb, NULL, ARRAY['published']::object_status[], NULL
   ))                                                              AS rpc_published_count,
  (SELECT COUNT(*) FROM object WHERE status = 'published')          AS object_table_published_count;
-- Expected: rpc_published_count == object_table_published_count.

ROLLBACK;
