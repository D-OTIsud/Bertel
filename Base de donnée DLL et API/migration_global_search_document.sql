-- migration_global_search_document.sql
-- §109 — Global Explorer search via object.search_document
-- ============================================================================
-- Adds an aggregated weighted full-text search document to `object`, maintained
-- by the existing api.refresh_object_filter_caches (extended) + new triggers on
-- the child tables that feed it. The Explorer search then matches name/city PLUS
-- this document when p_filters->>'search_mode' = 'global', ranked by ts_rank.
--
-- This file is the INCREMENTAL live-apply artifact. The two large query functions
-- changed by this feature — api.get_filtered_object_ids (new RETURNS column
-- `relevance` + global-mode search arm + source_rows.search_document) and its
-- caller api.list_object_resources_filtered_page (relevance threading + ORDER BY
-- relevance DESC) — are FOLDED into `api_views_functions.sql` (the fresh-apply
-- source of truth). On live they were re-applied from that file; a fresh DB
-- reproduces them from `api_views_functions.sql`. Everything below is folded into
-- `schema_unified.sql` (column, index, refresh fn, triggers, MV) ⇒ no-op on fresh.
--
-- Dependencies (apply order): step 1 `schema_unified.sql` (object / object_menu /
-- object_cuisine_type / object_description / tag_link / ref_* / mv_filtered_objects),
-- `api.strip_markdown` (folded in api_views_functions.sql, §106), then this file,
-- then `api_views_functions.sql` (the two query functions), then `rls_policies.sql`.
-- ============================================================================

-- 1) Column + GIN index ------------------------------------------------------
ALTER TABLE IF EXISTS object ADD COLUMN IF NOT EXISTS search_document tsvector;
CREATE INDEX IF NOT EXISTS idx_object_search_document_gin ON object USING GIN (search_document);

-- 2) Extend the cache-refresh function to also build search_document ---------
--    (full body — folded identically into schema_unified.sql)
CREATE OR REPLACE FUNCTION api.refresh_object_filter_caches(p_object_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, api, auth
AS $$
DECLARE
  v_cached_amenity_codes TEXT[];
  v_cached_payment_codes TEXT[];
  v_cached_environment_tags TEXT[];
  v_cached_language_codes TEXT[];
  v_cached_classification_codes TEXT[];
  v_cached_taxonomy_codes TEXT[];
  v_search_document tsvector;
BEGIN
  IF p_object_id IS NULL THEN
    RETURN;
  END IF;

  SELECT COALESCE((
    SELECT array_agg(DISTINCT ra.code ORDER BY ra.code)
    FROM object_amenity oa JOIN ref_amenity ra ON ra.id = oa.amenity_id
    WHERE oa.object_id = p_object_id
  ), ARRAY[]::TEXT[]) INTO v_cached_amenity_codes;

  SELECT COALESCE((
    SELECT array_agg(DISTINCT pm.code ORDER BY pm.code)
    FROM object_payment_method opm JOIN ref_code_payment_method pm ON pm.id = opm.payment_method_id
    WHERE opm.object_id = p_object_id
  ), ARRAY[]::TEXT[]) INTO v_cached_payment_codes;

  SELECT COALESCE((
    SELECT array_agg(DISTINCT et.code ORDER BY et.code)
    FROM object_environment_tag oet JOIN ref_code_environment_tag et ON et.id = oet.environment_tag_id
    WHERE oet.object_id = p_object_id
  ), ARRAY[]::TEXT[]) INTO v_cached_environment_tags;

  SELECT COALESCE((
    SELECT array_agg(DISTINCT rl.code ORDER BY rl.code)
    FROM object_language ol JOIN ref_language rl ON rl.id = ol.language_id
    WHERE ol.object_id = p_object_id
  ), ARRAY[]::TEXT[]) INTO v_cached_language_codes;

  SELECT COALESCE((
    SELECT array_agg(DISTINCT (s.code || ':' || v.code) ORDER BY (s.code || ':' || v.code))
    FROM object_classification oc
    JOIN ref_classification_scheme s ON s.id = oc.scheme_id
    JOIN ref_classification_value v ON v.id = oc.value_id
    WHERE oc.object_id = p_object_id AND oc.status = 'granted'
      AND (COALESCE(s.is_distinction, FALSE) OR COALESCE(s.display_group, '') IN ('sustainability_labels', 'accessibility_labels'))
  ), ARRAY[]::TEXT[]) INTO v_cached_classification_codes;

  SELECT COALESCE((
    SELECT array_agg(DISTINCT (ot.domain || ':' || anc.code) ORDER BY (ot.domain || ':' || anc.code))
    FROM object_taxonomy ot
    JOIN ref_code_taxonomy_closure cl ON cl.domain = ot.domain AND cl.descendant_id = ot.ref_code_id
    JOIN ref_code anc ON anc.id = cl.ancestor_id AND anc.domain = cl.domain
    WHERE ot.object_id = p_object_id AND anc.is_assignable = TRUE
  ), ARRAY[]::TEXT[]) INTO v_cached_taxonomy_codes;

  WITH doc AS (
    SELECT
      (
        COALESCE((SELECT string_agg(DISTINCT anc.name, ' ')
          FROM object_taxonomy ot
          JOIN ref_code_taxonomy_closure cl ON cl.domain = ot.domain AND cl.descendant_id = ot.ref_code_id
          JOIN ref_code anc ON anc.id = cl.ancestor_id AND anc.domain = cl.domain
          WHERE ot.object_id = p_object_id AND anc.is_assignable = TRUE), '')
        || ' ' ||
        COALESCE((SELECT string_agg(DISTINCT s.name || ' ' || v.name, ' ')
          FROM object_classification oc
          JOIN ref_classification_scheme s ON s.id = oc.scheme_id
          JOIN ref_classification_value v ON v.id = oc.value_id
          WHERE oc.object_id = p_object_id AND oc.status = 'granted'), '')
      ) AS doc_b,
      (
        COALESCE((SELECT string_agg(DISTINCT ra.name, ' ')
          FROM object_amenity oa JOIN ref_amenity ra ON ra.id = oa.amenity_id
          WHERE oa.object_id = p_object_id), '')
        || ' ' || COALESCE((SELECT string_agg(DISTINCT t.name, ' ')
          FROM tag_link tl JOIN ref_tag t ON t.id = tl.tag_id
          WHERE tl.target_table = 'object' AND tl.target_pk = p_object_id), '')
        || ' ' || COALESCE((SELECT string_agg(DISTINCT et.name, ' ')
          FROM object_environment_tag oet JOIN ref_code_environment_tag et ON et.id = oet.environment_tag_id
          WHERE oet.object_id = p_object_id), '')
        || ' ' || COALESCE((SELECT string_agg(DISTINCT ct.name, ' ')
          FROM object_cuisine_type oct JOIN ref_code_cuisine_type ct ON ct.id = oct.cuisine_type_id
          WHERE oct.object_id = p_object_id), '')
        || ' ' || COALESCE((SELECT string_agg(DISTINCT m.name || ' ' || COALESCE(mi.name, ''), ' ')
          FROM object_menu m LEFT JOIN object_menu_item mi ON mi.menu_id = m.id
          WHERE m.object_id = p_object_id AND m.is_active AND (m.visibility IS NULL OR m.visibility = 'public')), '')
        || ' ' || COALESCE((SELECT string_agg(DISTINCT dt.name, ' ')
          FROM object_menu m
          JOIN object_menu_item mi ON mi.menu_id = m.id
          JOIN object_menu_item_dietary_tag mid ON mid.menu_item_id = mi.id
          JOIN ref_code_dietary_tag dt ON dt.id = mid.dietary_tag_id
          WHERE m.object_id = p_object_id AND m.is_active AND (m.visibility IS NULL OR m.visibility = 'public')), '')
        || ' ' || COALESCE((SELECT string_agg(DISTINCT al.name, ' ')
          FROM object_menu m
          JOIN object_menu_item mi ON mi.menu_id = m.id
          JOIN object_menu_item_allergen mia ON mia.menu_item_id = mi.id
          JOIN ref_code_allergen al ON al.id = mia.allergen_id
          WHERE m.object_id = p_object_id AND m.is_active AND (m.visibility IS NULL OR m.visibility = 'public')), '')
      ) AS doc_c,
      (
        COALESCE((SELECT string_agg(DISTINCT
            COALESCE(api.strip_markdown(d.description), '') || ' '
            || COALESCE(api.strip_markdown(d.description_chapo), '') || ' '
            || COALESCE(api.strip_markdown(d.description_mobile), '') || ' '
            || COALESCE(api.strip_markdown(d.description_adapted), ''), ' ')
          FROM object_description d
          WHERE d.object_id = p_object_id AND d.org_object_id IS NULL
            AND (d.visibility IS NULL OR d.visibility = 'public')), '')
        || ' ' || COALESCE((SELECT string_agg(DISTINCT mi.description, ' ')
          FROM object_menu m JOIN object_menu_item mi ON mi.menu_id = m.id
          WHERE m.object_id = p_object_id AND m.is_active AND (m.visibility IS NULL OR m.visibility = 'public')
            AND mi.description IS NOT NULL), '')
      ) AS doc_d
  )
  SELECT
       setweight(to_tsvector('french', immutable_unaccent(lower(doc.doc_b))), 'B')
    || setweight(to_tsvector('french', immutable_unaccent(lower(doc.doc_c))), 'C')
    || setweight(to_tsvector('french', immutable_unaccent(lower(doc.doc_d))), 'D')
  INTO v_search_document
  FROM doc;

  UPDATE object o
  SET
    cached_amenity_codes = v_cached_amenity_codes,
    cached_payment_codes = v_cached_payment_codes,
    cached_environment_tags = v_cached_environment_tags,
    cached_language_codes = v_cached_language_codes,
    cached_classification_codes = v_cached_classification_codes,
    cached_taxonomy_codes = v_cached_taxonomy_codes,
    search_document = v_search_document
  WHERE o.id = p_object_id
    AND (
      o.cached_amenity_codes IS DISTINCT FROM v_cached_amenity_codes
      OR o.cached_payment_codes IS DISTINCT FROM v_cached_payment_codes
      OR o.cached_environment_tags IS DISTINCT FROM v_cached_environment_tags
      OR o.cached_language_codes IS DISTINCT FROM v_cached_language_codes
      OR o.cached_classification_codes IS DISTINCT FROM v_cached_classification_codes
      OR o.cached_taxonomy_codes IS DISTINCT FROM v_cached_taxonomy_codes
      OR o.search_document IS DISTINCT FROM v_search_document
    );
END;
$$;

-- 3) Trigger functions for child tables not covered by the generic (object_id-direct) trigger
CREATE OR REPLACE FUNCTION api.trg_refresh_caches_from_object_menu_item()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, api, auth AS $$
DECLARE v_new TEXT; v_old TEXT;
BEGIN
  IF TG_OP <> 'DELETE' THEN SELECT object_id INTO v_new FROM object_menu WHERE id = NEW.menu_id; END IF;
  IF TG_OP <> 'INSERT' THEN SELECT object_id INTO v_old FROM object_menu WHERE id = OLD.menu_id; END IF;
  IF v_old IS NOT NULL THEN PERFORM api.refresh_object_filter_caches(v_old); END IF;
  IF v_new IS NOT NULL AND v_new IS DISTINCT FROM v_old THEN PERFORM api.refresh_object_filter_caches(v_new); END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

CREATE OR REPLACE FUNCTION api.trg_refresh_caches_from_menu_item_link()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, api, auth AS $$
DECLARE v_obj TEXT;
BEGIN
  SELECT m.object_id INTO v_obj
  FROM object_menu m JOIN object_menu_item mi ON mi.menu_id = m.id
  WHERE mi.id = COALESCE(NEW.menu_item_id, OLD.menu_item_id);
  IF v_obj IS NOT NULL THEN PERFORM api.refresh_object_filter_caches(v_obj); END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

CREATE OR REPLACE FUNCTION api.trg_refresh_caches_from_tag_link()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, api, auth AS $$
BEGIN
  IF TG_OP <> 'INSERT' AND OLD.target_table = 'object' THEN
    PERFORM api.refresh_object_filter_caches(OLD.target_pk);
  END IF;
  IF TG_OP <> 'DELETE' AND NEW.target_table = 'object'
     AND NEW.target_pk IS DISTINCT FROM (CASE WHEN TG_OP = 'UPDATE' THEN OLD.target_pk END) THEN
    PERFORM api.refresh_object_filter_caches(NEW.target_pk);
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

-- 4) Triggers (object_id-direct reuse the generic child trigger; the rest resolve via parent)
DROP TRIGGER IF EXISTS trg_refresh_object_filter_caches_object_description ON object_description;
CREATE TRIGGER trg_refresh_object_filter_caches_object_description
AFTER INSERT OR UPDATE OR DELETE ON object_description
FOR EACH ROW EXECUTE FUNCTION api.trg_refresh_object_filter_caches_from_child();

DROP TRIGGER IF EXISTS trg_refresh_object_filter_caches_object_menu ON object_menu;
CREATE TRIGGER trg_refresh_object_filter_caches_object_menu
AFTER INSERT OR UPDATE OR DELETE ON object_menu
FOR EACH ROW EXECUTE FUNCTION api.trg_refresh_object_filter_caches_from_child();

DROP TRIGGER IF EXISTS trg_refresh_object_filter_caches_object_cuisine_type ON object_cuisine_type;
CREATE TRIGGER trg_refresh_object_filter_caches_object_cuisine_type
AFTER INSERT OR UPDATE OR DELETE ON object_cuisine_type
FOR EACH ROW EXECUTE FUNCTION api.trg_refresh_object_filter_caches_from_child();

DROP TRIGGER IF EXISTS trg_refresh_object_filter_caches_object_menu_item ON object_menu_item;
CREATE TRIGGER trg_refresh_object_filter_caches_object_menu_item
AFTER INSERT OR UPDATE OR DELETE ON object_menu_item
FOR EACH ROW EXECUTE FUNCTION api.trg_refresh_caches_from_object_menu_item();

DROP TRIGGER IF EXISTS trg_refresh_object_filter_caches_menu_item_dietary ON object_menu_item_dietary_tag;
CREATE TRIGGER trg_refresh_object_filter_caches_menu_item_dietary
AFTER INSERT OR UPDATE OR DELETE ON object_menu_item_dietary_tag
FOR EACH ROW EXECUTE FUNCTION api.trg_refresh_caches_from_menu_item_link();

DROP TRIGGER IF EXISTS trg_refresh_object_filter_caches_menu_item_allergen ON object_menu_item_allergen;
CREATE TRIGGER trg_refresh_object_filter_caches_menu_item_allergen
AFTER INSERT OR UPDATE OR DELETE ON object_menu_item_allergen
FOR EACH ROW EXECUTE FUNCTION api.trg_refresh_caches_from_menu_item_link();

DROP TRIGGER IF EXISTS trg_refresh_object_filter_caches_tag_link ON tag_link;
CREATE TRIGGER trg_refresh_object_filter_caches_tag_link
AFTER INSERT OR UPDATE OR DELETE ON tag_link
FOR EACH ROW EXECUTE FUNCTION api.trg_refresh_caches_from_tag_link();

-- 5) Backfill existing rows (idempotent via the IS DISTINCT FROM guard) -------
SELECT api.refresh_object_filter_caches(o.id) FROM object o;

-- 6) Rebuild the hot-path MV to carry search_document (DROP/CREATE: can't ALTER an MV's columns)
DROP MATERIALIZED VIEW IF EXISTS internal.mv_filtered_objects CASCADE;
CREATE MATERIALIZED VIEW internal.mv_filtered_objects AS
SELECT
  o.id, o.object_type, o.status, o.commercial_visibility, o.updated_at,
  o.name_normalized, o.name_search_vector, ol.city_search_vector,
  ol.latitude, ol.longitude, ol.geog2,
  o.cached_min_price, o.cached_main_image_url, o.cached_rating, o.cached_is_open_now,
  o.cached_amenity_codes, o.cached_payment_codes, o.cached_environment_tags,
  o.cached_language_codes, o.cached_classification_codes, o.cached_taxonomy_codes,
  o.search_document
FROM object o
LEFT JOIN object_location ol ON ol.object_id = o.id AND ol.is_main_location IS TRUE
WHERE o.status = 'published';

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_filtered_objects_id ON internal.mv_filtered_objects(id);
CREATE INDEX IF NOT EXISTS idx_mv_filtered_objects_name_search_gin ON internal.mv_filtered_objects USING GIN(name_search_vector);
CREATE INDEX IF NOT EXISTS idx_mv_filtered_objects_city_search_gin ON internal.mv_filtered_objects USING GIN(city_search_vector);
CREATE INDEX IF NOT EXISTS idx_mv_filtered_objects_search_doc_gin ON internal.mv_filtered_objects USING GIN(search_document);
CREATE INDEX IF NOT EXISTS idx_mv_filtered_objects_geog_gist ON internal.mv_filtered_objects USING GIST(geog2);
CREATE INDEX IF NOT EXISTS idx_mv_filtered_objects_amenity_codes_gin ON internal.mv_filtered_objects USING GIN(cached_amenity_codes);
CREATE INDEX IF NOT EXISTS idx_mv_filtered_objects_payment_codes_gin ON internal.mv_filtered_objects USING GIN(cached_payment_codes);
CREATE INDEX IF NOT EXISTS idx_mv_filtered_objects_environment_tags_gin ON internal.mv_filtered_objects USING GIN(cached_environment_tags);
CREATE INDEX IF NOT EXISTS idx_mv_filtered_objects_language_codes_gin ON internal.mv_filtered_objects USING GIN(cached_language_codes);
CREATE INDEX IF NOT EXISTS idx_mv_filtered_objects_classification_codes_gin ON internal.mv_filtered_objects USING GIN(cached_classification_codes);
CREATE INDEX IF NOT EXISTS idx_mv_filtered_objects_taxonomy_codes_gin ON internal.mv_filtered_objects USING GIN(cached_taxonomy_codes);
CREATE INDEX IF NOT EXISTS idx_mv_filtered_objects_updated_at_id ON internal.mv_filtered_objects(updated_at, id);

-- 7) api.get_filtered_object_ids (new RETURNS column `relevance` + global search arm)
--    and api.list_object_resources_filtered_page (relevance threading + ORDER BY relevance DESC)
--    are FOLDED into `api_views_functions.sql` — re-apply that file after this migration.
--    Grants for the new signature (same input args; RETURNS change required DROP+CREATE):
REVOKE EXECUTE ON FUNCTION api.get_filtered_object_ids(jsonb, object_type[], object_status[], text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.get_filtered_object_ids(jsonb, object_type[], object_status[], text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
