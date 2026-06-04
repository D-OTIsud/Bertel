-- migration_cards_batch_authorize_definer.sql
-- Explorer cards-batch perf fix (2026-06-04) — §36, the residual left by §35.
--
-- SYMPTOM: the editor list RPCs (api.list_object_resources_*; status ['published','draft'],
--   card view) spend ~1.4s of their runtime inside api.get_object_cards_batch(ids, langs).
--   Measured on live, identical 20-draft page: 1290 ms authenticated (RLS on) vs 57.7 ms RLS-off.
-- ROOT CAUSE: cards_batch is SECURITY INVOKER, so each child-table read (object_location,
--   object_amenity, object_classification, object_environment_tag, object_description, tag_link)
--   runs under the caller's RLS. Those tables' SELECT is gated by the per-row OR of THREE
--   SECURITY DEFINER predicates — the read policy PLUS the two `FOR ALL` write policies, which
--   also apply to SELECT (the P0.3 gotcha):
--       is_object_owner(object_id) OR can_read_object(object_id) OR user_can_write_object_canonical(object_id)
--   For the editor persona (a platform superuser), is_object_owner short-circuits TRUE *first*
--   (via is_platform_superuser()) on every one of the ~200+ child rows of a page. So a set-based
--   rewrite of only the READ policies (cf. §35) would NOT help here — the write policies dominate.
--   Hoisting the whole OR-soup would mean restructuring `FOR ALL` write policies to per-command
--   across ~40 tables (high-risk; deferred).
-- FIX (Approach 2): make cards_batch SECURITY DEFINER and AUTHORIZE-ONCE. It filters its input ids
--   to the caller's readable set a single time (one InitPlan), then reads child data RLS-free for
--   only those ids. The readable set = published ∪ api.current_user_extended_object_ids() = exactly
--   the `object` table's own SELECT visibility (policies public_objects_published OR
--   extended_objects_org_actor — no is_object_owner term), so the visible card set is UNCHANGED
--   per persona. Measured: 57.7 ms (RLS-free child reads) + 17.6 ms (authorize-once) ≈ ~75 ms.
-- SECURITY: get_object_cards_batch is PUBLIC-executable (anon/authenticated via PostgREST). Self-
--   authorization is therefore mandatory: a direct call with arbitrary draft ids returns nothing
--   for the ids outside the caller's readable set — no leak. (tests/test_cards_batch_authorize.sql.)
--
-- PREREQUISITES: §35 migration_explorer_rls_setbased.sql / rls_policies.sql — defines
--   api.current_user_extended_object_ids(). Slotted as manifest step 8j (after 8i). NOT folded
--   into api_views_functions.sql: cards_batch is manifest step 5, but the visibility helper is
--   created later (step 6/8i), and a SQL-function body is parse-checked at creation — the step-5
--   definition cannot forward-reference it. This migration carries the live/fresh form; the step-5
--   definition is the SECURITY INVOKER baseline that this CREATE OR REPLACE overrides.
--   ⚠ Keep the cards_batch body BELOW in sync with api_views_functions.sql (see the pointer note there).
-- IDEMPOTENT: CREATE OR REPLACE (re-runnable). REVERSIBLE: re-create cards_batch as the SECURITY
--   INVOKER form from api_views_functions.sql and DROP api.current_user_readable_object_ids().

BEGIN;

-- 1) "Objects visible to me" = published ∪ my extended scope. Single source of truth for the
--    object-level read visibility (the `object` table's own SELECT predicate, as a SET). SECURITY
--    DEFINER so the published scan bypasses RLS; returns only object ids. Reuses §35's set fn.
CREATE OR REPLACE FUNCTION api.current_user_readable_object_ids()
RETURNS SETOF text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, api, auth
AS $fn$
  SELECT o.id FROM object o WHERE o.status = 'published'
  UNION
  SELECT api.current_user_extended_object_ids();
$fn$;
REVOKE EXECUTE ON FUNCTION api.current_user_readable_object_ids() FROM PUBLIC;
-- Only cards_batch (SECURITY DEFINER) calls this, as its owner — no anon/role grant is required for
-- the cards path. Granted to authenticated/service_role for parity with current_user_extended_object_ids.
GRANT  EXECUTE ON FUNCTION api.current_user_readable_object_ids() TO authenticated, service_role;

-- 2) cards_batch -> SECURITY DEFINER + authorize-once. Body is byte-identical to the step-5
--    definition in api_views_functions.sql EXCEPT THREE changes: (a) the SECURITY DEFINER clause
--    below; (b) the `distinct_ids` CTE gains `WHERE id IN (SELECT api.current_user_readable_object_ids())`
--    (the single authorize-once point — every downstream child CTE joins distinct_ids); and
--    (c) `main_description` re-applies the object_description visibility RLS this DEFINER body
--    bypasses (see the inline note there — the only field-level read gate among the tables read).
CREATE OR REPLACE FUNCTION api.get_object_cards_batch(
  p_ids TEXT[],
  p_lang_prefs TEXT[] DEFAULT ARRAY['fr']::text[]
)
RETURNS JSON
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
  WITH lang AS (
    SELECT api.pick_lang(p_lang_prefs) AS code
  ), input_ids AS (
    SELECT t.id, t.ord
    FROM unnest(COALESCE(p_ids, ARRAY[]::text[])) WITH ORDINALITY AS t(id, ord)
    WHERE t.id IS NOT NULL
  ), distinct_ids AS (
    -- AUTHORIZE-ONCE: gate the page to objects the caller may actually see
    -- (published ∪ extended = the `object` table's own SELECT visibility). Uncorrelated
    -- subquery ⇒ the planner hoists it to a single InitPlan. Because this function is
    -- SECURITY DEFINER, every child read below runs RLS-free — safe ONLY because distinct_ids
    -- is already filtered to authorized ids here. Do NOT trust the caller's id list.
    SELECT DISTINCT id
    FROM input_ids
    WHERE id IN (SELECT api.current_user_readable_object_ids())
  ), main_location AS (
    SELECT DISTINCT ON (ol.object_id)
      ol.object_id,
      ol.latitude,
      ol.longitude,
      ol.city,
      ol.postcode,
      ol.lieu_dit,
      ol.address1
    FROM object_location ol
    JOIN distinct_ids di ON di.id = ol.object_id
    WHERE ol.is_main_location IS TRUE
    ORDER BY ol.object_id, ol.position NULLS LAST, ol.updated_at DESC, ol.id
  ), main_description AS (
    SELECT DISTINCT ON (d.object_id)
      d.object_id,
      d.description,
      d.description_chapo,
      d.description_chapo_i18n
    FROM object_description d
    JOIN distinct_ids di ON di.id = d.object_id
    WHERE d.org_object_id IS NULL
      -- FIELD-LEVEL GATE (3rd change vs the step-5 INVOKER body): object_description is the ONLY
      -- child table cards_batch reads that RLS gates BELOW object level (on its `visibility`
      -- column). Since this function is SECURITY DEFINER (RLS-bypassed), replicate that table's
      -- SELECT predicate here verbatim so a non-public canonical description can never leak to a
      -- caller who can see the object but not its private enrichment:
      --   visible iff visibility='public' OR can_read_extended OR is_object_owner OR user_can_write_canonical.
      -- (All other child tables are object-level only ⇒ already covered by the distinct_ids
      -- authorize-once.) `visibility='public'` is the common case and short-circuits the rest.
      AND ( d.visibility = 'public'
            OR d.object_id IN (SELECT api.current_user_extended_object_ids())
            OR api.is_object_owner(d.object_id)
            OR api.user_can_write_canonical(d.object_id) )
    ORDER BY d.object_id, d.position NULLS LAST, d.updated_at DESC, d.id
  ), base AS (
    SELECT
      o.id,
      o.object_type::text AS object_type,
      o.name,
      o.status::text AS status,
      o.commercial_visibility,
      o.cached_main_image_url,
      o.cached_rating,
      o.cached_review_count,
      o.cached_min_price,
      o.cached_is_open_now,
      o.cached_amenity_codes,
      o.updated_at,
      ol.latitude,
      ol.longitude,
      ol.city,
      ol.postcode,
      ol.lieu_dit,
      ol.address1,
      d.description,
      d.description_chapo,
      d.description_chapo_i18n
    FROM object o
    JOIN distinct_ids di ON di.id = o.id
    LEFT JOIN main_location ol ON ol.object_id = o.id
    LEFT JOIN main_description d ON d.object_id = o.id
  ), distinct_taxonomy_assignments AS (
    -- Unique (domain, descendant_id) pairs across the whole page.
    -- Computing the closure path once per pair (instead of once per row of
    -- taxonomy_items) collapses N per-row correlated subqueries into a single
    -- batched join — historically the heaviest cost of this function on large
    -- pages and the trigger for statement-timeout errors on the Explorer.
    SELECT DISTINCT
      ot.domain,
      ot.ref_code_id AS descendant_id
    FROM object_taxonomy ot
    JOIN distinct_ids di ON di.id = ot.object_id
  ), taxonomy_path_steps AS (
    SELECT
      dta.domain,
      dta.descendant_id,
      anc.code,
      COALESCE(api.i18n_pick_strict(anc.name_i18n, lang.code, 'fr'), anc.name) AS name,
      row_number() OVER (
        PARTITION BY dta.domain, dta.descendant_id
        ORDER BY cl.depth DESC
      ) - 1 AS public_depth
    FROM distinct_taxonomy_assignments dta
    JOIN ref_code_taxonomy_closure cl
      ON cl.domain = dta.domain
     AND cl.descendant_id = dta.descendant_id
    JOIN ref_code anc
      ON anc.id = cl.ancestor_id
     AND anc.domain = cl.domain
    CROSS JOIN lang
    WHERE anc.is_assignable IS TRUE
  ), taxonomy_paths AS (
    SELECT
      tps.domain,
      tps.descendant_id,
      jsonb_agg(
        jsonb_build_object(
          'code', tps.code,
          'name', tps.name
        )
        ORDER BY tps.public_depth
      ) AS path
    FROM taxonomy_path_steps tps
    GROUP BY tps.domain, tps.descendant_id
  ), taxonomy_items AS (
    SELECT
      ot.object_id,
      ot.domain,
      assigned.code,
      COALESCE(api.i18n_pick_strict(assigned.name_i18n, lang.code, 'fr'), assigned.name) AS name,
      COALESCE(reg.position, 999999) AS domain_position,
      COALESCE(tp.path, '[]'::jsonb) AS path
    FROM object_taxonomy ot
    JOIN distinct_ids di ON di.id = ot.object_id
    JOIN ref_code_domain_registry reg ON reg.domain = ot.domain
    JOIN ref_code assigned ON assigned.id = ot.ref_code_id AND assigned.domain = ot.domain
    LEFT JOIN taxonomy_paths tp
      ON tp.domain = ot.domain
     AND tp.descendant_id = ot.ref_code_id
    CROSS JOIN lang
  ), taxonomy AS (
    SELECT
      object_id,
      jsonb_agg(
        jsonb_build_object(
          'domain', domain,
          'code', code,
          'name', name,
          'path', path
        )
        ORDER BY domain_position, name, code
      ) AS payload
    FROM taxonomy_items
    GROUP BY object_id
  ), tags AS (
    SELECT
      tl.target_pk AS object_id,
      jsonb_agg(
        jsonb_build_object(
          'slug', t.slug,
          'name', t.name,
          'color', t.color,
          'icon', t.icon,
          'icon_url', t.icon_url
        )
        ORDER BY COALESCE(t.position, 999999), t.name, t.slug
      ) AS payload
    FROM tag_link tl
    JOIN distinct_ids di ON di.id = tl.target_pk
    JOIN ref_tag t ON t.id = tl.tag_id
    WHERE tl.target_table = 'object'
    GROUP BY tl.target_pk
  ), environment_tags AS (
    SELECT
      oet.object_id,
      jsonb_agg(
        jsonb_build_object(
          'code', et.code,
          'name', COALESCE(api.i18n_pick_strict(et.name_i18n, lang.code, 'fr'), et.name)
        )
        ORDER BY COALESCE(et.position, 999999), et.name, et.code
      ) AS payload
    FROM object_environment_tag oet
    JOIN distinct_ids di ON di.id = oet.object_id
    JOIN ref_code_environment_tag et ON et.id = oet.environment_tag_id
    CROSS JOIN lang
    GROUP BY oet.object_id
  ), classification_badges AS (
    SELECT
      oc.object_id,
      CASE
        WHEN s.display_group = 'sustainability_labels' THEN 'sustainability_label'
        WHEN s.display_group = 'accessibility_labels' THEN 'accessibility_label'
        WHEN s.display_group IS NOT NULL THEN s.display_group
        ELSE 'classification'
      END AS kind,
      s.code || ':' || v.code AS code,
      concat_ws(' · ',
        COALESCE(api.i18n_pick_strict(s.name_i18n, lang.code, 'fr'), s.name),
        COALESCE(api.i18n_pick_strict(v.name_i18n, lang.code, 'fr'), v.name)
      ) AS label,
      COALESCE(s.position, 999999) AS position
    FROM object_classification oc
    JOIN distinct_ids di ON di.id = oc.object_id
    JOIN ref_classification_scheme s ON s.id = oc.scheme_id
    JOIN ref_classification_value v ON v.id = oc.value_id
    CROSS JOIN lang
    WHERE COALESCE(s.is_distinction, FALSE) IS TRUE
      AND COALESCE(oc.status, 'granted') IN ('granted','requested')
  ), sustainability_badges AS (
    SELECT
      osa.object_id,
      'sustainability_action' AS kind,
      a.code::text AS code,
      COALESCE(api.i18n_pick_strict(a.label_i18n, lang.code, 'fr'), a.label) AS label,
      COALESCE(a.position, 999999) AS position
    FROM object_sustainability_action osa
    JOIN distinct_ids di ON di.id = osa.object_id
    JOIN ref_sustainability_action a ON a.id = osa.action_id
    CROSS JOIN lang
  ), accessibility_badges AS (
    SELECT
      oa.object_id,
      'accessibility_amenity' AS kind,
      ra.code::text AS code,
      COALESCE(api.i18n_pick_strict(ra.name_i18n, lang.code, 'fr'), ra.name) AS label,
      COALESCE(ra.position, 999999) AS position
    FROM object_amenity oa
    JOIN distinct_ids di ON di.id = oa.object_id
    JOIN ref_amenity ra ON ra.id = oa.amenity_id
    LEFT JOIN ref_code_amenity_family fam ON fam.id = ra.family_id
    CROSS JOIN lang
    WHERE ra.code LIKE 'acc_%' OR fam.code = 'accessibility'
  ), all_badges AS (
    SELECT * FROM classification_badges
    UNION ALL
    SELECT * FROM sustainability_badges
    UNION ALL
    SELECT * FROM accessibility_badges
  ), deduped_badges AS (
    SELECT DISTINCT ON (object_id, kind, code)
      object_id,
      kind,
      code,
      label,
      position
    FROM all_badges
    ORDER BY object_id, kind, code, position, label
  ), badges AS (
    SELECT
      object_id,
      jsonb_agg(
        jsonb_build_object(
          'kind', kind,
          'code', code,
          'label', label
        )
        ORDER BY kind, position, label, code
      ) AS payload
    FROM deduped_badges
    GROUP BY object_id
  ), cards AS (
    SELECT
      b.id,
      jsonb_build_object(
        'id', b.id,
        'type', b.object_type,
        'name', b.name,
        'status', b.status,
        'commercial_visibility', b.commercial_visibility,
        'image', b.cached_main_image_url,
        'rating', b.cached_rating,
        'review_count', b.cached_review_count,
        'min_price', b.cached_min_price,
        'open_now', b.cached_is_open_now,
        'location', jsonb_build_object(
          'lat', b.latitude,
          'lon', b.longitude,
          'city', b.city,
          'postcode', b.postcode,
          'lieu_dit', b.lieu_dit,
          'address', CONCAT_WS(', ',
            NULLIF(b.address1, ''),
            NULLIF(b.lieu_dit, ''),
            NULLIF(b.postcode, ''),
            NULLIF(b.city, '')
          )
        ),
        'description', LEFT(COALESCE(
          api.i18n_pick(b.description_chapo_i18n, lang.code, 'fr'),
          b.description_chapo,
          LEFT(b.description, 200)
        ), 200),
        'taxonomy', COALESCE(taxonomy.payload, '[]'::jsonb),
        'tags', COALESCE(tags.payload, '[]'::jsonb),
        'amenity_codes', COALESCE(to_jsonb(b.cached_amenity_codes), '[]'::jsonb),
        'environment_tags', COALESCE(environment_tags.payload, '[]'::jsonb),
        'badges', COALESCE(badges.payload, '[]'::jsonb),
        'updated_at', b.updated_at
      ) AS card
    FROM base b
    CROSS JOIN lang
    LEFT JOIN taxonomy ON taxonomy.object_id = b.id
    LEFT JOIN tags ON tags.object_id = b.id
    LEFT JOIN environment_tags ON environment_tags.object_id = b.id
    LEFT JOIN badges ON badges.object_id = b.id
  )
  SELECT COALESCE(json_agg(cards.card ORDER BY input_ids.ord), '[]'::json)
  FROM input_ids
  JOIN cards ON cards.id = input_ids.id;
$$;

COMMIT;

-- After applying to a live database: NOTIFY pgrst, 'reload schema';
