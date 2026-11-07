-- =====================================================================
-- migration_filters_accessibility_label.sql  (manifest step 16j; decision log §162)
-- Explorer : le filtre PMR remonte les objets labellisés Tourisme & Handicap
-- même sans équipement accessibilité saisi.
--
-- BESOIN PO (2026-07-03) : « Même s'il n'y a pas d'équipement T&H décrit, s'il y a
--   un label, il faut quand même afficher. » — Constat live : 0 objet (tous statuts)
--   ne porte d'équipement famille `accessibility` (catalogue 43 acc_* inutilisé) ⇒
--   le toggle PMR (amenity_families_any=['accessibility']) renvoyait TOUJOURS 0 ;
--   les 4 grants LBL_TOURISME_HANDICAP (2 publiés, dont Dimitile Hôtel) ont tous
--   subvalue_ids NULL ⇒ les chips types de handicap renvoyaient 0 aussi.
--
-- DESIGN (une seule fonction touchée : api.get_filtered_object_ids) :
--   1. Nouvelle clé `accessibility_any` (boolean) = équipement famille accessibility
--      OU LBL_TOURISME_HANDICAP `granted`. Clé DÉDIÉE et non un bras magique dans
--      amenity_families_any : ce dernier reste équipement-pur (filtre transverse
--      Services & équipements §159) et le payload PMR ne peut plus être clobbé par
--      lui (facets.ts posait les deux sur la même clé — collision réelle).
--   2. `disability_types_any` gagne un bras label : subvalue_ids couvrant un type
--      demandé, OU subvalue_ids vides = couverture inconnue ⇒ le label seul suffit
--      (état de l'import ; à affiner via la saisie éditeur §10). `label_disability_
--      types_any` (mode label classé) est inchangé : lui exige les subvalues.
--   3. use_mv : `accessibility_any` bypasse le MV (labels non cachés) — vérifié par
--      le test (les fixtures en transaction sont invisibles du MV).
--
-- BLAST RADIUS : get_filtered_object_ids (Explorer + listes dynamiques + markers +
--   dashboard). Signature inchangée ⇒ pas de NOTIFY pgrst requis (clé jsonb additive).
-- IDEMPOTENT : CREATE OR REPLACE. FOLDED : api_views_functions.sql — fresh == live.
-- REVERSIBLE : git checkout api_views_functions.sql + ré-application de l'ancienne
--   définition.
-- TEST CI : tests/test_accessibility_label_filter.sql (fresh-apply gate).
-- =====================================================================

BEGIN;

CREATE OR REPLACE FUNCTION api.get_filtered_object_ids(
  p_filters JSONB,
  p_types object_type[],
  p_status object_status[],
  p_search TEXT DEFAULT NULL
)
RETURNS TABLE(object_id TEXT, label_rank INTEGER, label_match JSONB, relevance REAL)
LANGUAGE sql
STABLE
-- SECURITY DEFINER: required because this function accesses internal.mv_filtered_objects
-- (a materialized view used as a hot-path cache). The `authenticated` role has no USAGE
-- on schema `internal` by design — the internal schema is a private performance layer.
-- Running as the function owner (postgres) is safe here: the function is read-only
-- (STABLE), returns only filtered object IDs, and has a fixed search_path.
SECURITY DEFINER
SET search_path = pg_catalog, public, api, internal, extensions, auth, audit, crm, ref
AS $$
  -- Extract JSON arrays once into SQL arrays to avoid per-row JSON parsing.
  WITH normalized AS (
    SELECT COALESCE(p_filters, '{}'::jsonb) AS filters
  ),
  params AS (
    -- Each *_any array is normalized so that an empty parse (either an empty
    -- JSON array or all entries discarded by inner filters) collapses to NULL.
    -- Downstream WHERE clauses short-circuit on `IS NULL`, so:
    --   key absent      → NULL → no filter applied
    --   key present []  → NULL → no filter applied
    --   key present [x] → ARRAY['x'] → filter applied
    -- This avoids the previous "match nothing" trap where an empty array was
    -- compared with `= ANY()` / `&&` and dropped every row.
    SELECT
      n.filters,
      CASE WHEN n.filters ? 'commercial_visibility_any'
        THEN NULLIF(
          ARRAY(SELECT jsonb_array_elements_text(n.filters->'commercial_visibility_any')),
          ARRAY[]::text[]
        )
      END AS commercial_visibility_any,
      CASE WHEN n.filters ? 'amenities_any'
        THEN NULLIF(
          ARRAY(SELECT jsonb_array_elements_text(n.filters->'amenities_any')),
          ARRAY[]::text[]
        )
      END AS amenities_any,
      CASE WHEN n.filters ? 'amenities_all'
        THEN NULLIF(
          ARRAY(SELECT jsonb_array_elements_text(n.filters->'amenities_all')),
          ARRAY[]::text[]
        )
      END AS amenities_all,
      CASE WHEN n.filters ? 'amenity_families_any'
        THEN NULLIF(
          ARRAY(SELECT jsonb_array_elements_text(n.filters->'amenity_families_any')),
          ARRAY[]::text[]
        )
      END AS amenity_families_any,
      CASE WHEN n.filters ? 'payment_methods_any'
        THEN NULLIF(
          ARRAY(SELECT jsonb_array_elements_text(n.filters->'payment_methods_any')),
          ARRAY[]::text[]
        )
      END AS payment_methods_any,
      CASE WHEN n.filters ? 'environment_tags_any'
        THEN NULLIF(
          ARRAY(SELECT jsonb_array_elements_text(n.filters->'environment_tags_any')),
          ARRAY[]::text[]
        )
      END AS environment_tags_any,
      CASE WHEN n.filters ? 'languages_any'
        THEN NULLIF(
          ARRAY(SELECT jsonb_array_elements_text(n.filters->'languages_any')),
          ARRAY[]::text[]
        )
      END AS languages_any,
      CASE WHEN n.filters ? 'city_any'
        THEN NULLIF(
          ARRAY(
            SELECT immutable_unaccent(lower(jsonb_array_elements_text(n.filters->'city_any')))
          ),
          ARRAY[]::text[]
        )
      END AS city_any,
      CASE WHEN n.filters ? 'lieu_dit_any'
        THEN NULLIF(
          ARRAY(
            SELECT immutable_unaccent(lower(jsonb_array_elements_text(n.filters->'lieu_dit_any')))
          ),
          ARRAY[]::text[]
        )
      END AS lieu_dit_any,
      CASE WHEN n.filters ? 'media_types_any'
        THEN NULLIF(
          ARRAY(SELECT jsonb_array_elements_text(n.filters->'media_types_any')),
          ARRAY[]::text[]
        )
      END AS media_types_any,
      CASE WHEN n.filters->'meeting_room' ? 'equipment_any'
        THEN NULLIF(
          ARRAY(SELECT jsonb_array_elements_text(n.filters->'meeting_room'->'equipment_any')),
          ARRAY[]::text[]
        )
      END AS meeting_equipment_any,
      CASE WHEN n.filters->'meeting_room' ? 'equipment_all'
        THEN NULLIF(
          ARRAY(SELECT jsonb_array_elements_text(n.filters->'meeting_room'->'equipment_all')),
          ARRAY[]::text[]
        )
      END AS meeting_equipment_all,
      CASE WHEN n.filters ? 'tags_any'
        THEN NULLIF(
          ARRAY(SELECT jsonb_array_elements_text(n.filters->'tags_any')),
          ARRAY[]::text[]
        )
      END AS tags_any,
      CASE WHEN n.filters->'itinerary' ? 'practices_any'
        THEN NULLIF(
          ARRAY(SELECT jsonb_array_elements_text(n.filters->'itinerary'->'practices_any')),
          ARRAY[]::text[]
        )
      END AS iti_practices_any,
      CASE WHEN n.filters ? 'classifications_any'
        THEN NULLIF(
          ARRAY(
            SELECT ((j->>'scheme_code') || ':' || (j->>'value_code'))
            FROM jsonb_array_elements(n.filters->'classifications_any') AS j
            WHERE COALESCE(j->>'scheme_code', '') <> ''
              AND COALESCE(j->>'value_code', '') <> ''
          ),
          ARRAY[]::text[]
        )
      END AS classifications_any_codes,
      CASE WHEN n.filters ? 'taxonomy_any'
        THEN NULLIF(
          ARRAY(
            SELECT ((j->>'domain') || ':' || (j->>'code'))
            FROM jsonb_array_elements(n.filters->'taxonomy_any') AS j
            WHERE COALESCE(j->>'domain', '') <> ''
              AND COALESCE(j->>'code', '') <> ''
          ),
          ARRAY[]::text[]
        )
      END AS taxonomy_any_codes,
      -- accessibility type filters (2026-03-22)
      -- disability_types_any: TEXT[] of canonical disability types (motor/hearing/visual/cognitive).
      -- label_disability_types_any: TEXT[] of canonical disability types matched against LBL_TOURISME_HANDICAP subvalue_ids.
      CASE WHEN n.filters ? 'disability_types_any'
        THEN NULLIF(
          ARRAY(SELECT jsonb_array_elements_text(n.filters->'disability_types_any')),
          ARRAY[]::text[]
        )
      END AS disability_types_any,
      CASE WHEN n.filters ? 'label_disability_types_any'
        THEN NULLIF(
          ARRAY(SELECT jsonb_array_elements_text(n.filters->'label_disability_types_any')),
          ARRAY[]::text[]
        )
      END AS label_disability_types_any,
      -- §157 — « ouvert à … » : instant demandé (ISO timestamptz). NULL = filtre absent.
      CASE WHEN n.filters ? 'open_at'
        THEN NULLIF(n.filters->>'open_at', '')::timestamptz
      END AS open_at,
      CASE WHEN n.filters ? 'sustainability_categories_any'
        THEN NULLIF(
          ARRAY(SELECT jsonb_array_elements_text(n.filters->'sustainability_categories_any')),
          ARRAY[]::text[]
        )
      END AS sustainability_categories_any,
      CASE WHEN n.filters ? 'sustainability_actions_any'
        THEN NULLIF(
          ARRAY(SELECT jsonb_array_elements_text(n.filters->'sustainability_actions_any')),
          ARRAY[]::text[]
        )
      END AS sustainability_actions_any,
      -- use_mv: TRUE → read from internal.mv_filtered_objects (hot path).
      -- The MV is built `WHERE o.status = 'published'` so any p_status that
      -- includes a non-public value (draft / archived / …) MUST bypass the MV
      -- and read the live `object` table — otherwise non-public rows are
      -- silently invisible to editors/admins. Order is irrelevant because we
      -- use the `<@` containment operator. NULL p_status means "no status
      -- filter" at this layer (the wrapper functions already default it to
      -- ['published']), so the MV stays safe.
      (NOT (
        n.filters ? 'amenities_all'
        OR n.filters ? 'amenity_families_any'
        OR n.filters ? 'accessibility_any'         -- §162: requires live join on object_classification (label not in cache)
        OR n.filters ? 'city_any'
        OR n.filters ? 'lieu_dit_any'
        OR n.filters ? 'pet_accepted'
        OR n.filters ? 'media_types_any'
        OR n.filters ? 'meeting_room'
        OR n.filters ? 'capacity_filters'
        OR n.filters ? 'tags_any'
        OR n.filters ? 'itinerary'
        OR n.filters ? 'label_scheme_ranked'  -- requires live joins for rank-1 evidence
        OR n.filters ? 'disability_types_any'      -- requires live join on ref_amenity.extra (not in cache)
        OR n.filters ? 'label_disability_types_any' -- requires live join on object_classification.subvalue_ids
        OR n.filters ? 'sustainability_any'
        OR n.filters ? 'sustainability_categories_any'
        OR n.filters ? 'sustainability_actions_any'
      ))
      AND (
        p_status IS NULL
        OR p_status <@ ARRAY['published']::object_status[]
      ) AS use_mv
    FROM normalized n
  ),
  -- §157 — « ouvert à … » : le moteur d'ouverture (internal.compute_open_status,
  -- le MÊME que le cache open_now) évalué UNE SEULE FOIS à l'instant demandé —
  -- jamais en LATERAL par ligne (leçon §37). Ensemble vide quand le filtre est
  -- absent (garde interne p_at IS NULL ⇒ RETURN). MATERIALIZED est OBLIGATOIRE :
  -- référencé une seule fois, le CTE serait inliné dans l'EXISTS par-ligne du
  -- WHERE ⇒ le moteur re-tournerait par ligne scannée (mesuré 1,96 s vs 120 ms).
  open_at_state AS MATERIALIZED (
    SELECT s.object_id, s.is_open
    FROM params
    CROSS JOIN LATERAL internal.compute_open_status(params.open_at) s
    WHERE params.open_at IS NOT NULL
  ),
  source_rows AS (
    SELECT
      m.id AS object_id,
      m.object_type,
      m.status,
      m.commercial_visibility,
      m.name_search_vector,
      m.city_search_vector,
      NULL::TEXT AS city_normalized,
      NULL::TEXT AS lieu_dit_normalized,
      m.geog2,
      m.cached_is_open_now,
      m.cached_amenity_codes,
      m.cached_payment_codes,
      m.cached_environment_tags,
      m.cached_language_codes,
      m.cached_classification_codes,
      m.cached_taxonomy_codes,
      m.search_document
    FROM internal.mv_filtered_objects m
    CROSS JOIN params
    WHERE params.use_mv

    UNION ALL

    SELECT
      o.id AS object_id,
      o.object_type,
      o.status,
      o.commercial_visibility,
      o.name_search_vector,
      ol.city_search_vector,
      immutable_unaccent(lower(ol.city)) AS city_normalized,
      immutable_unaccent(lower(ol.lieu_dit)) AS lieu_dit_normalized,
      ol.geog2,
      o.cached_is_open_now,
      o.cached_amenity_codes,
      o.cached_payment_codes,
      o.cached_environment_tags,
      o.cached_language_codes,
      o.cached_classification_codes,
      o.cached_taxonomy_codes,
      o.search_document
    FROM object o
    CROSS JOIN params
    LEFT JOIN LATERAL (
      SELECT ol2.city_search_vector, ol2.city, ol2.lieu_dit, ol2.geog2
      FROM object_location ol2
      WHERE ol2.object_id = o.id
        AND ol2.is_main_location IS TRUE
      ORDER BY ol2.created_at
      LIMIT 1
    ) ol ON TRUE
    WHERE NOT params.use_mv
  )
  SELECT
    src.object_id,
    -- label_rank: 0 = exact granted classification, 1 = equivalent evidence.
    -- Only meaningful when label_scheme_ranked filter is present; always 0 otherwise.
    CASE
      WHEN NOT (params.filters ? 'label_scheme_ranked') THEN 0
      WHEN exact_label.evidence_count > 0 THEN 0
      ELSE 1
    END AS label_rank,
    CASE
      WHEN NOT (params.filters ? 'label_scheme_ranked') THEN NULL::jsonb
      WHEN exact_label.evidence_count > 0 THEN jsonb_build_object(
        'scheme_code', params.filters->>'label_scheme_ranked',
        'rank', 0,
        'source', 'certified_label',
        'evidence_count', exact_label.evidence_count
      )
      WHEN accessibility_evidence.evidence_count > 0 THEN jsonb_build_object(
        'scheme_code', params.filters->>'label_scheme_ranked',
        'rank', 1,
        'source', 'accessibility_amenity',
        'evidence_count', accessibility_evidence.evidence_count
      )
      WHEN sustainability_evidence.evidence_count > 0 THEN jsonb_build_object(
        'scheme_code', params.filters->>'label_scheme_ranked',
        'rank', 1,
        'source', 'sustainability_action',
        'evidence_count', sustainability_evidence.evidence_count
      )
      ELSE NULL::jsonb
    END AS label_match,
    -- relevance (§109): weighted ts_rank over name/city (A) + the global search_document
    -- (B/C/D) when search_mode='global'. 0 when no search term ⇒ callers' ORDER BY relevance
    -- becomes a no-op tiebreaker and the legacy ordering is preserved.
    CASE
      WHEN p_search IS NULL THEN 0::real
      ELSE ts_rank(
        setweight(src.name_search_vector, 'A')
        || setweight(COALESCE(src.city_search_vector, ''::tsvector), 'A')
        || CASE WHEN (params.filters->>'search_mode') = 'global'
                THEN COALESCE(src.search_document, ''::tsvector)
                ELSE ''::tsvector END,
        plainto_tsquery('french', api.norm_search(p_search))
      )
    END AS relevance
  FROM source_rows src
  CROSS JOIN params
  LEFT JOIN LATERAL (
    SELECT COUNT(DISTINCT oc.id)::integer AS evidence_count
    FROM object_classification oc
    JOIN ref_classification_scheme cs ON cs.id = oc.scheme_id
    WHERE (params.filters ? 'label_scheme_ranked')
      AND oc.object_id = src.object_id
      AND cs.code = params.filters->>'label_scheme_ranked'
      AND oc.status = 'granted'
      AND (
        (params.filters->>'label_scheme_ranked') <> 'LBL_TOURISME_HANDICAP'
        OR COALESCE(params.label_disability_types_any, params.disability_types_any) IS NULL
        OR cardinality(COALESCE(params.label_disability_types_any, params.disability_types_any)) = 0
        OR EXISTS (
          SELECT 1
          FROM unnest(COALESCE(oc.subvalue_ids, ARRAY[]::uuid[])) AS sv(uid)
          JOIN ref_classification_value cv ON cv.id = sv.uid
          WHERE cv.metadata->>'disability_type' = ANY(COALESCE(params.label_disability_types_any, params.disability_types_any))
        )
      )
  ) exact_label ON TRUE
  LEFT JOIN LATERAL (
    SELECT COUNT(DISTINCT osa.action_id)::integer AS evidence_count
    FROM object_sustainability_action osa
    JOIN ref_sustainability_action rsa ON rsa.id = osa.action_id
    JOIN ref_classification_scheme cs ON cs.code = params.filters->>'label_scheme_ranked'
    WHERE (params.filters ? 'label_scheme_ranked')
      AND params.filters->>'label_scheme_ranked' <> 'LBL_TOURISME_HANDICAP'
      AND osa.object_id = src.object_id
      AND (
        EXISTS (
          SELECT 1
          FROM ref_classification_equivalent_action rcea
          WHERE rcea.scheme_id = cs.id
            AND rcea.action_id = osa.action_id
            AND rcea.match_scope IN ('search_expansion', 'both')
        )
        OR EXISTS (
          SELECT 1
          FROM ref_classification_equivalent_group rceg
          WHERE rceg.scheme_id = cs.id
            AND rceg.group_id = rsa.group_id
            AND rceg.match_scope IN ('search_expansion', 'both')
        )
        OR EXISTS (
          SELECT 1
          FROM object_sustainability_action_label osal
          JOIN object_classification oc2 ON oc2.id = osal.object_classification_id
          WHERE osal.object_sustainability_action_id = osa.id
            AND oc2.scheme_id = cs.id
        )
      )
  ) sustainability_evidence ON TRUE
  LEFT JOIN LATERAL (
    SELECT COUNT(DISTINCT oa.amenity_id)::integer AS evidence_count
    FROM object_amenity oa
    JOIN ref_amenity ra ON ra.id = oa.amenity_id
    JOIN ref_code_amenity_family fam ON fam.id = ra.family_id
    WHERE (params.filters ? 'label_scheme_ranked')
      AND params.filters->>'label_scheme_ranked' = 'LBL_TOURISME_HANDICAP'
      AND oa.object_id = src.object_id
      AND fam.code = 'accessibility'
      AND (
        COALESCE(params.disability_types_any, params.label_disability_types_any) IS NULL
        OR cardinality(COALESCE(params.disability_types_any, params.label_disability_types_any)) = 0
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(COALESCE(ra.extra->'disability_types', '[]'::jsonb)) AS dt(val)
          WHERE dt.val = ANY(COALESCE(params.disability_types_any, params.label_disability_types_any))
        )
      )
  ) accessibility_evidence ON TRUE
  WHERE (p_types IS NULL OR src.object_type = ANY(p_types))
    AND (p_status IS NULL OR src.status = ANY(p_status))
    AND (NOT (params.filters ? 'commercial_visibility') OR src.commercial_visibility = (params.filters->>'commercial_visibility'))
    AND (params.commercial_visibility_any IS NULL OR src.commercial_visibility = ANY(params.commercial_visibility_any))
    AND (
      p_search IS NULL OR
      src.name_search_vector @@ plainto_tsquery('french', api.norm_search(p_search)) OR
      (src.city_search_vector IS NOT NULL AND src.city_search_vector @@ plainto_tsquery('french', api.norm_search(p_search))) OR
      -- §109 global mode: also match the aggregated search_document (équipements, tags,
      -- environnement, taxonomie, labels, menus/plats/régimes/allergènes/cuisines, prose).
      (
        (params.filters->>'search_mode') = 'global'
        AND src.search_document IS NOT NULL
        AND src.search_document @@ plainto_tsquery('french', api.norm_search(p_search))
      )
    )
    AND (params.city_any IS NULL OR COALESCE(src.city_normalized, '') = ANY(params.city_any))
    AND (params.lieu_dit_any IS NULL OR COALESCE(src.lieu_dit_normalized, '') = ANY(params.lieu_dit_any))
    AND (params.amenities_any IS NULL OR COALESCE(src.cached_amenity_codes, ARRAY[]::TEXT[]) && params.amenities_any)
    AND (params.amenities_all IS NULL OR NOT EXISTS (
      SELECT 1
      FROM unnest(params.amenities_all) AS req(code)
      WHERE NOT EXISTS (
        SELECT 1
        FROM object_amenity oa
        JOIN ref_amenity ra ON ra.id = oa.amenity_id
        WHERE oa.object_id = src.object_id AND ra.code = req.code
      )
    ))
    AND (params.amenity_families_any IS NULL OR EXISTS (
      SELECT 1
      FROM object_amenity oa
      JOIN ref_amenity ra ON ra.id = oa.amenity_id
      JOIN ref_code_amenity_family fam ON fam.id = ra.family_id
      WHERE oa.object_id = src.object_id AND fam.code = ANY(params.amenity_families_any)
    ))
    -- accessibility_any (toggle PMR, §162) : équipement famille `accessibility` OU label
    -- Tourisme & Handicap `granted` — le label certifié suffit même sans équipement saisi
    -- (directive PO 2026-07-03). Clé DÉDIÉE : amenity_families_any reste équipement-pur
    -- (filtre transverse Services & équipements §159) et le toggle PMR ne peut plus être
    -- clobbé par lui côté payload. Bypasse le MV (labels non cachés).
    AND (NOT COALESCE((params.filters->>'accessibility_any')::boolean, FALSE) OR (
      EXISTS (
        SELECT 1
        FROM object_amenity oa
        JOIN ref_amenity ra ON ra.id = oa.amenity_id
        JOIN ref_code_amenity_family fam ON fam.id = ra.family_id
        WHERE oa.object_id = src.object_id AND fam.code = 'accessibility'
      )
      OR EXISTS (
        SELECT 1
        FROM object_classification oc
        JOIN ref_classification_scheme cs ON cs.id = oc.scheme_id
        WHERE oc.object_id = src.object_id
          AND cs.code = 'LBL_TOURISME_HANDICAP'
          AND oc.status = 'granted'
      )
    ))
    -- disability_types_any: retourne les objets avec ≥1 amenity acc_* dont extra.disability_types
    -- contient au moins une des valeurs demandées, OU (§162) un label T&H `granted` dont les
    -- subvalue_ids couvrent un type demandé — subvalue_ids vides = couverture inconnue (état de
    -- l'import) ⇒ le label seul matche n'importe quel type demandé (directive PO 2026-07-03 ;
    -- à affiner via la saisie éditeur §10 des types couverts). Tableau vide → aucun effet
    -- (cardinality guard). Bypasse le MV (use_mv = FALSE) car ref_amenity.extra n'est pas dans
    -- cached_amenity_codes (ni les labels).
    AND (
      params.disability_types_any IS NULL
      OR cardinality(params.disability_types_any) = 0
      OR params.filters->>'label_scheme_ranked' = 'LBL_TOURISME_HANDICAP'
      OR EXISTS (
        SELECT 1
        FROM object_amenity oa
        JOIN ref_amenity ra ON ra.id = oa.amenity_id
        CROSS JOIN LATERAL jsonb_array_elements_text(
          COALESCE(ra.extra->'disability_types', '[]'::jsonb)
        ) AS dt(val)
        WHERE oa.object_id = src.object_id
          AND ra.code LIKE 'acc_%'
          AND dt.val = ANY(params.disability_types_any)
      )
      OR EXISTS (
        SELECT 1
        FROM object_classification oc
        JOIN ref_classification_scheme cs ON cs.id = oc.scheme_id
        WHERE oc.object_id = src.object_id
          AND cs.code = 'LBL_TOURISME_HANDICAP'
          AND oc.status = 'granted'
          AND (
            COALESCE(cardinality(oc.subvalue_ids), 0) = 0
            OR EXISTS (
              SELECT 1
              FROM unnest(oc.subvalue_ids) AS sv(uid)
              JOIN ref_classification_value cv ON cv.id = sv.uid
              WHERE cv.metadata->>'disability_type' = ANY(params.disability_types_any)
            )
          )
      )
    )
    -- label_disability_types_any: retourne les objets avec un grant LBL_TOURISME_HANDICAP explicite
    -- dont les subvalue_ids contiennent ≥1 type demandé (via ref_classification_value.metadata->>'disability_type').
    -- Ne déduit pas depuis les amenities — requiert uniquement le label certifié avec subvalue_ids renseignés.
    -- Tableau vide → aucun effet. Bypasse le MV (use_mv = FALSE).
    AND (
      params.label_disability_types_any IS NULL
      OR cardinality(params.label_disability_types_any) = 0
      OR params.filters->>'label_scheme_ranked' = 'LBL_TOURISME_HANDICAP'
      OR EXISTS (
        SELECT 1
        FROM object_classification oc
        JOIN ref_classification_scheme cs ON cs.id = oc.scheme_id
        CROSS JOIN LATERAL unnest(oc.subvalue_ids) AS sv(uid)
        JOIN ref_classification_value cv ON cv.id = sv.uid
        WHERE oc.object_id = src.object_id
          AND cs.code = 'LBL_TOURISME_HANDICAP'
          AND oc.status = 'granted'
          AND cv.metadata->>'disability_type' = ANY(params.label_disability_types_any)
      )
    )
    AND (NOT COALESCE((params.filters->>'sustainability_any')::boolean, FALSE) OR (
      EXISTS (
        SELECT 1
        FROM object_sustainability_action osa
        WHERE osa.object_id = src.object_id
      )
      OR EXISTS (
        SELECT 1
        FROM object_classification oc
        JOIN ref_classification_scheme sc ON sc.id = oc.scheme_id
        WHERE oc.object_id = src.object_id
          AND oc.status = 'granted'
          AND sc.display_group = 'sustainability_labels'
      )
    ))
    AND (params.sustainability_categories_any IS NULL OR cardinality(params.sustainability_categories_any) = 0 OR EXISTS (
      SELECT 1
      FROM object_sustainability_action osa
      JOIN ref_sustainability_action rsa ON rsa.id = osa.action_id
      JOIN ref_sustainability_action_category rac ON rac.id = rsa.category_id
      WHERE osa.object_id = src.object_id
        AND rac.code = ANY(params.sustainability_categories_any)
    ))
    AND (params.sustainability_actions_any IS NULL OR cardinality(params.sustainability_actions_any) = 0 OR EXISTS (
      SELECT 1
      FROM object_sustainability_action osa
      JOIN ref_sustainability_action rsa ON rsa.id = osa.action_id
      WHERE osa.object_id = src.object_id
        AND rsa.code = ANY(params.sustainability_actions_any)
    ))
    AND (NOT (params.filters ? 'pet_accepted') OR EXISTS (
      SELECT 1 FROM object_pet_policy opp
      WHERE opp.object_id = src.object_id AND opp.accepted = ((params.filters->>'pet_accepted')::boolean)
    ))
    AND (params.payment_methods_any IS NULL OR COALESCE(src.cached_payment_codes, ARRAY[]::TEXT[]) && params.payment_methods_any)
    AND (params.environment_tags_any IS NULL OR COALESCE(src.cached_environment_tags, ARRAY[]::TEXT[]) && params.environment_tags_any)
    AND (params.languages_any IS NULL OR COALESCE(src.cached_language_codes, ARRAY[]::TEXT[]) && params.languages_any)
    AND (params.media_types_any IS NULL OR EXISTS (
      SELECT 1
      FROM media m
      JOIN ref_code_media_type mt ON mt.id = m.media_type_id
      WHERE m.object_id = src.object_id
        AND (NOT (params.filters ? 'media_published_only') OR m.is_published = TRUE)
        AND ((params.filters->>'media_must_have_main')::boolean IS DISTINCT FROM TRUE OR m.is_main = TRUE)
        AND mt.code = ANY(params.media_types_any)
    ))
    AND (NOT (params.filters ? 'meeting_room') OR (
      EXISTS (SELECT 1 FROM object_meeting_room r WHERE r.object_id = src.object_id)
      AND ( (params.filters->'meeting_room'->>'min_count') IS NULL
            OR (SELECT COUNT(*) FROM object_meeting_room r WHERE r.object_id = src.object_id) >= (params.filters->'meeting_room'->>'min_count')::int )
      AND ( (params.filters->'meeting_room'->>'min_area_m2') IS NULL
            OR EXISTS (SELECT 1 FROM object_meeting_room r WHERE r.object_id = src.object_id AND r.area_m2 >= (params.filters->'meeting_room'->>'min_area_m2')::numeric) )
      AND ( (params.filters->'meeting_room'->>'min_cap_theatre') IS NULL
            OR EXISTS (SELECT 1 FROM object_meeting_room r WHERE r.object_id = src.object_id AND r.cap_theatre >= (params.filters->'meeting_room'->>'min_cap_theatre')::int) )
      AND ( (params.filters->'meeting_room'->>'min_cap_u') IS NULL
            OR EXISTS (SELECT 1 FROM object_meeting_room r WHERE r.object_id = src.object_id AND r.cap_u >= (params.filters->'meeting_room'->>'min_cap_u')::int) )
      AND ( (params.filters->'meeting_room'->>'min_cap_classroom') IS NULL
            OR EXISTS (SELECT 1 FROM object_meeting_room r WHERE r.object_id = src.object_id AND r.cap_classroom >= (params.filters->'meeting_room'->>'min_cap_classroom')::int) )
      AND ( (params.filters->'meeting_room'->>'min_cap_boardroom') IS NULL
            OR EXISTS (SELECT 1 FROM object_meeting_room r WHERE r.object_id = src.object_id AND r.cap_boardroom >= (params.filters->'meeting_room'->>'min_cap_boardroom')::int) )
      AND ( params.meeting_equipment_any IS NULL
            OR EXISTS (
              SELECT 1
              FROM meeting_room_equipment me
              JOIN object_meeting_room r ON r.id = me.room_id AND r.object_id = src.object_id
              JOIN ref_code_meeting_equipment e ON e.id = me.equipment_id
              WHERE e.code = ANY(params.meeting_equipment_any)
            )
      )
      AND ( params.meeting_equipment_all IS NULL
            OR NOT EXISTS (
              SELECT 1
              FROM unnest(params.meeting_equipment_all) AS req(code)
              WHERE NOT EXISTS (
                SELECT 1
                FROM meeting_room_equipment me
                JOIN object_meeting_room r ON r.id = me.room_id AND r.object_id = src.object_id
                JOIN ref_code_meeting_equipment e ON e.id = me.equipment_id
                WHERE e.code = req.code
              )
            )
      )
    ))
    AND (NOT (params.filters ? 'capacity_filters') OR NOT EXISTS (
      SELECT 1
      FROM LATERAL jsonb_array_elements(params.filters->'capacity_filters') cf(j)
      LEFT JOIN ref_capacity_metric cm ON cm.code = (cf.j->>'code')
      WHERE cm.id IS NULL
         OR NOT EXISTS (
              SELECT 1
              FROM object_capacity oc
              WHERE oc.object_id = src.object_id
                AND oc.metric_id = cm.id
                AND ( (cf.j ? 'min') IS FALSE OR oc.value_integer >= (cf.j->>'min')::int )
                AND ( (cf.j ? 'max') IS FALSE OR oc.value_integer <= (cf.j->>'max')::int )
         )
    ))
    AND (params.classifications_any_codes IS NULL OR COALESCE(src.cached_classification_codes, ARRAY[]::TEXT[]) && params.classifications_any_codes)
    AND (params.taxonomy_any_codes IS NULL OR COALESCE(src.cached_taxonomy_codes, ARRAY[]::TEXT[]) && params.taxonomy_any_codes)
    AND (params.tags_any IS NULL OR EXISTS (
      SELECT 1
      FROM tag_link tl
      JOIN ref_tag t ON t.id = tl.tag_id
      WHERE tl.target_table = 'object'
        AND tl.target_pk = src.object_id
        AND t.slug = ANY(params.tags_any)
    ))
    AND (NOT (params.filters ? 'itinerary') OR EXISTS (
      SELECT 1
      FROM object_iti oi
      WHERE oi.object_id = src.object_id
        AND ( (params.filters->'itinerary'->>'is_loop') IS NULL OR oi.is_loop = (params.filters->'itinerary'->>'is_loop')::boolean )
        AND ( (params.filters->'itinerary'->>'difficulty_min') IS NULL OR oi.difficulty_level >= (params.filters->'itinerary'->>'difficulty_min')::int )
        AND ( (params.filters->'itinerary'->>'difficulty_max') IS NULL OR oi.difficulty_level <= (params.filters->'itinerary'->>'difficulty_max')::int )
        AND ( (params.filters->'itinerary'->>'distance_min_km') IS NULL OR oi.distance_km >= (params.filters->'itinerary'->>'distance_min_km')::numeric )
        AND ( (params.filters->'itinerary'->>'distance_max_km') IS NULL OR oi.distance_km <= (params.filters->'itinerary'->>'distance_max_km')::numeric )
        -- Public filter contract stays in HOURS (duration_min_h / duration_max_h); object_iti.duration_min is MINUTES, so convert (h * 60).
        AND ( (params.filters->'itinerary'->>'duration_min_h') IS NULL OR oi.duration_min >= (params.filters->'itinerary'->>'duration_min_h')::numeric * 60 )
        AND ( (params.filters->'itinerary'->>'duration_max_h') IS NULL OR oi.duration_min <= (params.filters->'itinerary'->>'duration_max_h')::numeric * 60 )
        AND (
          params.iti_practices_any IS NULL
          OR EXISTS (
              SELECT 1
              FROM object_iti_practice oip
              JOIN ref_code_iti_practice ip ON ip.id = oip.practice_id
              WHERE oip.object_id = src.object_id AND ip.code = ANY(params.iti_practices_any)
          )
        )
    ))
    AND (NOT (params.filters ? 'within_radius') OR (
      src.geog2 IS NOT NULL
      AND ST_DWithin(
            src.geog2,
            ST_SetSRID(ST_MakePoint(
              (params.filters->'within_radius'->>'lon')::float8,
              (params.filters->'within_radius'->>'lat')::float8
            ),4326)::geography,
            GREATEST(0,(params.filters->'within_radius'->>'radius_m')::int)
          )
    ))
    AND (NOT (params.filters ? 'bbox') OR (
      src.geog2 IS NOT NULL
      AND src.geog2::geometry && ST_MakeEnvelope(
        (params.filters->'bbox'->>0)::float8, (params.filters->'bbox'->>1)::float8,
        (params.filters->'bbox'->>2)::float8, (params.filters->'bbox'->>3)::float8, 4326
      )
      AND ST_Within(
        src.geog2::geometry,
        ST_MakeEnvelope(
          (params.filters->'bbox'->>0)::float8, (params.filters->'bbox'->>1)::float8,
          (params.filters->'bbox'->>2)::float8, (params.filters->'bbox'->>3)::float8, 4326
        )
      )
    ))
    AND (NOT (params.filters ? 'open_now') OR src.cached_is_open_now = TRUE)
    -- §157 — « ouvert à … » : match uniquement is_open = TRUE (le tri-état NULL
    -- « aucune donnée d'ouverture » n'est JAMAIS matché, invariant §133 — même
    -- sémantique que open_now sur le cache).
    AND (params.open_at IS NULL OR EXISTS (
      SELECT 1 FROM open_at_state oas
      WHERE oas.object_id = src.object_id AND oas.is_open = TRUE
    ))
    -- §157 — Événements : recouvrement de [event_start_date, COALESCE(end,start)]
    -- avec la plage demandée `event:{from,to}` (dates ISO). La récurrence
    -- (object_fma.recurrence_pattern, texte libre) n'est PAS évaluée — limite
    -- documentée, à structurer quand les données FMA arriveront.
    AND (NOT (params.filters ? 'event') OR EXISTS (
      SELECT 1
      FROM object_fma f
      WHERE f.object_id = src.object_id
        AND ( (params.filters->'event'->>'from') IS NULL
              OR COALESCE(f.event_end_date, f.event_start_date) >= (params.filters->'event'->>'from')::date )
        AND ( (params.filters->'event'->>'to') IS NULL
              OR f.event_start_date <= (params.filters->'event'->>'to')::date )
    ))
    -- label_scheme_ranked: admit rank-0 (exact granted classification) and rank-1 (equivalent evidence).
    -- rank-1a: sustainability actions/groups mapped through ref_classification_equivalent_*.
    -- rank-1b: accessibility amenity family evidence (LBL_TOURISME_HANDICAP only).
    AND (NOT (params.filters ? 'label_scheme_ranked') OR (
      exact_label.evidence_count > 0
      OR sustainability_evidence.evidence_count > 0
      OR accessibility_evidence.evidence_count > 0
    ));
$$;

COMMIT;
