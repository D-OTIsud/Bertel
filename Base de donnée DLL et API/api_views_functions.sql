-- =====================================================
-- Helper: check if an object is currently open using rich opening system
-- =====================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'api'
      AND p.proname = 'can_read_extended'
      AND pg_get_function_identity_arguments(p.oid) = 'p_object_id text'
  ) THEN
    EXECUTE $f$
      CREATE FUNCTION api.can_read_extended(p_object_id text)
      RETURNS boolean
      LANGUAGE sql
      STABLE
      SECURITY DEFINER
      SET search_path = public, api, auth
      AS $body$ SELECT FALSE; $body$;
    $f$;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION api.is_object_open_now(p_object_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
  -- Locale-independent weekday check via ISO day-of-week (1=Mon..7=Sun).
  SELECT EXISTS (
    SELECT 1
    FROM opening_period p
    JOIN opening_schedule s ON s.period_id = p.id
    JOIN opening_time_period tp ON tp.schedule_id = s.id
    JOIN opening_time_period_weekday tpw ON tpw.time_period_id = tp.id
    JOIN opening_time_frame tf ON tf.time_period_id = tp.id
    JOIN ref_code_weekday wd ON wd.id = tpw.weekday_id
    CROSS JOIN LATERAL api.get_object_local_now(p_object_id) ln
    WHERE p.object_id = p_object_id
      AND tp.closed = FALSE
      AND api.is_opening_period_active_on_date(p.all_years, p.date_start, p.date_end, ln.local_date)
      AND COALESCE(
        wd.dow_number,
        CASE wd.code
          WHEN 'monday' THEN 1
          WHEN 'tuesday' THEN 2
          WHEN 'wednesday' THEN 3
          WHEN 'thursday' THEN 4
          WHEN 'friday' THEN 5
          WHEN 'saturday' THEN 6
          WHEN 'sunday' THEN 7
          ELSE NULL
        END
      ) = ln.local_isodow
      AND (tf.start_time IS NULL OR tf.start_time <= ln.local_time)
      AND (tf.end_time IS NULL OR tf.end_time > ln.local_time)
  )
  -- Also check for 24/7 periods (no time frames means always open)
  OR EXISTS (
    SELECT 1
    FROM opening_period p
    JOIN opening_schedule s ON s.period_id = p.id
    JOIN opening_time_period tp ON tp.schedule_id = s.id
    JOIN opening_time_period_weekday tpw ON tpw.time_period_id = tp.id
    JOIN ref_code_weekday wd ON wd.id = tpw.weekday_id
    CROSS JOIN LATERAL api.get_object_local_now(p_object_id) ln
    WHERE p.object_id = p_object_id
      AND tp.closed = FALSE
      AND api.is_opening_period_active_on_date(p.all_years, p.date_start, p.date_end, ln.local_date)
      AND COALESCE(
        wd.dow_number,
        CASE wd.code
          WHEN 'monday' THEN 1
          WHEN 'tuesday' THEN 2
          WHEN 'wednesday' THEN 3
          WHEN 'thursday' THEN 4
          WHEN 'friday' THEN 5
          WHEN 'saturday' THEN 6
          WHEN 'sunday' THEN 7
          ELSE NULL
        END
      ) = ln.local_isodow
      AND NOT EXISTS (SELECT 1 FROM opening_time_frame tf WHERE tf.time_period_id = tp.id)
  );
$$;

-- =====================================================
-- Helper: build a single opening period JSON (pure JSON, ordered)
-- =====================================================
CREATE OR REPLACE FUNCTION api.build_opening_period_json(
  p_period_id UUID,
  p_object_id TEXT,
  p_date_start DATE,
  p_date_end DATE,
  p_order INTEGER DEFAULT 1
)
RETURNS JSON
LANGUAGE plpgsql
STABLE

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
DECLARE
  v_weekday_slots JSONB;
BEGIN
  -- Unlimited slots per weekday (normalized model)
  v_weekday_slots := api.get_opening_slots_by_day(p_period_id);

  -- Build the complete JSON in one go
  RETURN json_build_object(
    'id', p_period_id::text,
    'order', p_order,
    'object_id', p_object_id,
    'date_start', p_date_start,
    'date_end', p_date_end,
    'closed_days', '[]'::json,  -- No closed days in rich opening system
    'weekday_slots', COALESCE(v_weekday_slots, '{}'::jsonb)::json
  );
END;
$$;

-- =====================================================
-- Rendering helpers (currency, percent, dates, datetimes)
-- =====================================================
CREATE OR REPLACE FUNCTION api.render_format_currency(p_amount NUMERIC, p_currency TEXT, p_locale TEXT)
RETURNS TEXT
LANGUAGE plpgsql
STABLE

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
DECLARE
  v_symbol TEXT := COALESCE(p_currency, '');
  v_formatted TEXT;
BEGIN
  IF p_amount IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_symbol = 'EUR' THEN
    v_symbol := '€';
  END IF;

  v_formatted := to_char(p_amount, 'FM999G999G999D00');

  IF p_locale = 'fr-FR' THEN
    v_formatted := replace(v_formatted, ',', ' ');
    v_formatted := replace(v_formatted, '.', ',');
    RETURN trim(both ' ' FROM v_formatted) || ' ' || v_symbol;
  ELSE
    RETURN v_symbol || ' ' || v_formatted;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION api.render_format_percent(p_percent NUMERIC, p_locale TEXT)
RETURNS TEXT
LANGUAGE plpgsql
STABLE

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
DECLARE
  v_value TEXT;
BEGIN
  IF p_percent IS NULL THEN
    RETURN NULL;
  END IF;

  v_value := to_char(p_percent, 'FM999G999D00');

  IF p_locale = 'fr-FR' THEN
    v_value := replace(v_value, ',', ' ');
    v_value := replace(v_value, '.', ',');
    RETURN trim(both ' ' FROM v_value) || ' %';
  ELSE
    RETURN v_value || '%';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION api.render_format_date(p_date DATE, p_locale TEXT)
RETURNS TEXT
LANGUAGE plpgsql
STABLE

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
DECLARE
  v_month_names_fr TEXT[] := ARRAY['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
BEGIN
  IF p_date IS NULL THEN
    RETURN NULL;
  END IF;

  IF p_locale = 'fr-FR' THEN
    RETURN to_char(p_date, 'FMDD') || ' ' || v_month_names_fr[EXTRACT(MONTH FROM p_date)::INT] || ' ' || to_char(p_date, 'YYYY');
  ELSE
    RETURN to_char(p_date, 'YYYY-MM-DD');
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION api.render_format_time(p_time TIME, p_locale TEXT)
RETURNS TEXT
LANGUAGE plpgsql
STABLE

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
BEGIN
  IF p_time IS NULL THEN
    RETURN NULL;
  END IF;

  IF p_locale = 'fr-FR' THEN
    RETURN to_char(p_time, 'HH24:MI');
  ELSE
    RETURN to_char(p_time, 'HH12:MI AM');
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION api.render_format_date_range(p_start DATE, p_end DATE, p_locale TEXT)
RETURNS TEXT
LANGUAGE plpgsql
STABLE

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
DECLARE
  v_start TEXT;
  v_end   TEXT;
BEGIN
  v_start := api.render_format_date(p_start, p_locale);
  v_end   := api.render_format_date(p_end, p_locale);

  IF p_start IS NULL AND p_end IS NULL THEN
    RETURN NULL;
  ELSIF p_start IS NOT NULL AND p_end IS NULL THEN
    IF p_locale = 'fr-FR' THEN
      RETURN 'à partir du ' || v_start;
    ELSE
      RETURN 'from ' || v_start;
    END IF;
  ELSIF p_start IS NULL AND p_end IS NOT NULL THEN
    IF p_locale = 'fr-FR' THEN
      RETURN 'jusqu''au ' || v_end;
    ELSE
      RETURN 'until ' || v_end;
    END IF;
  ELSE
    IF p_locale = 'fr-FR' THEN
      RETURN 'du ' || v_start || ' au ' || v_end;
    ELSE
      RETURN v_start || ' to ' || v_end;
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION api.render_format_datetime_range(
  p_start TIMESTAMPTZ,
  p_end   TIMESTAMPTZ,
  p_locale TEXT,
  p_timezone TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
DECLARE
  v_start_local TIMESTAMP;
  v_end_local   TIMESTAMP;
  v_start_date TEXT;
  v_end_date   TEXT;
  v_start_time TEXT;
  v_end_time   TEXT;
BEGIN
  IF p_start IS NULL AND p_end IS NULL THEN
    RETURN NULL;
  END IF;

  v_start_local := CASE WHEN p_start IS NOT NULL THEN p_start AT TIME ZONE COALESCE(p_timezone, 'UTC') ELSE NULL END;
  v_end_local   := CASE WHEN p_end IS NOT NULL THEN p_end AT TIME ZONE COALESCE(p_timezone, 'UTC') ELSE NULL END;

  v_start_date := api.render_format_date(CASE WHEN v_start_local IS NOT NULL THEN v_start_local::date ELSE NULL END, p_locale);
  v_end_date   := api.render_format_date(CASE WHEN v_end_local   IS NOT NULL THEN v_end_local::date   ELSE NULL END, p_locale);
  v_start_time := api.render_format_time(CASE WHEN v_start_local IS NOT NULL THEN v_start_local::time ELSE NULL END, p_locale);
  v_end_time   := api.render_format_time(CASE WHEN v_end_local   IS NOT NULL THEN v_end_local::time   ELSE NULL END, p_locale);

  IF v_start_date IS NOT NULL AND v_end_date IS NOT NULL AND v_start_date = v_end_date THEN
    IF v_start_time IS NOT NULL AND v_end_time IS NOT NULL THEN
      RETURN v_start_date || ', ' || v_start_time || ' - ' || v_end_time;
    ELSE
      RETURN v_start_date;
    END IF;
  ELSE
    IF v_start_date IS NOT NULL AND v_end_date IS NOT NULL THEN
      RETURN v_start_date || ' - ' || v_end_date ||
             CASE WHEN v_start_time IS NOT NULL AND v_end_time IS NOT NULL THEN ', ' || v_start_time || ' - ' || v_end_time ELSE '' END;
    ELSE
      RETURN COALESCE(v_start_date, v_end_date);
    END IF;
  END IF;
END;
$$;

-- =====================================================
-- API — Helpers, Curseurs, Ressource unifiée & Endpoints
-- =====================================================

CREATE SCHEMA IF NOT EXISTS api;

-- =====================================================
-- 1) Helpers : Base64URL & Curseur JSON & Langue & Search & I18N
-- =====================================================

-- I18N Helper: Pick translation from JSONB with fallback
-- Usage: api.i18n_pick('{"fr": "Bonjour", "en": "Hello"}', 'en', 'fr')
-- Returns: "Hello" (or "Bonjour" if 'en' not found, or any available language as last resort)
-- Language codes are normalized to lowercase following project conventions
CREATE OR REPLACE FUNCTION api.i18n_pick(
  p_i18n_data JSONB,
  p_lang_code TEXT DEFAULT 'fr',
  p_fallback_lang TEXT DEFAULT 'fr'
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
DECLARE
  v_result TEXT;
  v_normalized_lang TEXT := lower(trim(p_lang_code));
  v_normalized_fallback TEXT := lower(trim(p_fallback_lang));
BEGIN
  -- Return NULL if no i18n data provided
  IF p_i18n_data IS NULL OR p_i18n_data = '{}'::jsonb THEN
    RETURN NULL;
  END IF;

  -- Try requested language first
  IF p_i18n_data ? v_normalized_lang THEN
    v_result := p_i18n_data ->> v_normalized_lang;
    IF v_result IS NOT NULL AND trim(v_result) != '' THEN
      RETURN v_result;
    END IF;
  END IF;

  -- Try fallback language
  IF v_normalized_fallback != v_normalized_lang AND p_i18n_data ? v_normalized_fallback THEN
    v_result := p_i18n_data ->> v_normalized_fallback;
    IF v_result IS NOT NULL AND trim(v_result) != '' THEN
      RETURN v_result;
    END IF;
  END IF;

  -- Try any available language as last resort
  SELECT value INTO v_result
  FROM jsonb_each_text(p_i18n_data)
  WHERE value IS NOT NULL AND trim(value) != ''
  LIMIT 1;

  RETURN v_result;
END;
$$;

-- I18N Helper (strict): Pick translation from JSONB without "any language" fallback
-- Returns NULL if both requested and fallback are missing/empty
CREATE OR REPLACE FUNCTION api.i18n_pick_strict(
  p_i18n_data JSONB,
  p_lang_code TEXT DEFAULT 'fr',
  p_fallback_lang TEXT DEFAULT 'fr'
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
DECLARE
  v_result TEXT;
  v_normalized_lang TEXT := lower(trim(p_lang_code));
  v_normalized_fallback TEXT := lower(trim(p_fallback_lang));
BEGIN
  IF p_i18n_data IS NULL OR p_i18n_data = '{}'::jsonb THEN
    RETURN NULL;
  END IF;

  IF p_i18n_data ? v_normalized_lang THEN
    v_result := p_i18n_data ->> v_normalized_lang;
    IF v_result IS NOT NULL AND trim(v_result) != '' THEN
      RETURN v_result;
    END IF;
  END IF;

  IF v_normalized_fallback != v_normalized_lang AND p_i18n_data ? v_normalized_fallback THEN
    v_result := p_i18n_data ->> v_normalized_fallback;
    IF v_result IS NOT NULL AND trim(v_result) != '' THEN
      RETURN v_result;
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

-- I18N Helper: Get translation from EAV i18n_translation table with fallback
-- Usage: api.i18n_get_text('object_description', 'desc-uuid-123', 'description', 'en', 'fr')
-- Returns: Translated text from i18n_translation table with fallback support
-- Used for advanced cases where JSONB columns are not available
CREATE OR REPLACE FUNCTION api.i18n_get_text(
  p_target_table TEXT,
  p_target_pk TEXT,
  p_target_column TEXT,
  p_lang_code TEXT DEFAULT 'fr',
  p_fallback_lang TEXT DEFAULT 'fr'
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
DECLARE
  v_result TEXT;
  v_normalized_lang TEXT := lower(trim(p_lang_code));
  v_normalized_fallback TEXT := lower(trim(p_fallback_lang));
BEGIN
  -- Try requested language first
  SELECT it.value_text INTO v_result
  FROM i18n_translation it
  JOIN ref_language rl ON rl.id = it.language_id
  WHERE it.target_table = p_target_table
    AND it.target_pk = p_target_pk
    AND it.target_column = p_target_column
    AND lower(rl.code) = v_normalized_lang
    AND it.value_text IS NOT NULL
    AND trim(it.value_text) != ''
  LIMIT 1;

  -- If found, return it
  IF v_result IS NOT NULL THEN
    RETURN v_result;
  END IF;

  -- Try fallback language
  IF v_normalized_fallback != v_normalized_lang THEN
    SELECT it.value_text INTO v_result
    FROM i18n_translation it
    JOIN ref_language rl ON rl.id = it.language_id
    WHERE it.target_table = p_target_table
      AND it.target_pk = p_target_pk
      AND it.target_column = p_target_column
      AND lower(rl.code) = v_normalized_fallback
      AND it.value_text IS NOT NULL
      AND trim(it.value_text) != ''
    LIMIT 1;

    IF v_result IS NOT NULL THEN
      RETURN v_result;
    END IF;
  END IF;

  -- Try any available language as last resort
  SELECT it.value_text INTO v_result
  FROM i18n_translation it
  WHERE it.target_table = p_target_table
    AND it.target_pk = p_target_pk
    AND it.target_column = p_target_column
    AND it.value_text IS NOT NULL
    AND trim(it.value_text) != ''
  LIMIT 1;

  RETURN v_result;
END;
$$;

-- I18N Helper (strict): EAV i18n without "any language" fallback
CREATE OR REPLACE FUNCTION api.i18n_get_text_strict(
  p_target_table TEXT,
  p_target_pk TEXT,
  p_target_column TEXT,
  p_lang_code TEXT DEFAULT 'fr',
  p_fallback_lang TEXT DEFAULT 'fr'
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
DECLARE
  v_result TEXT;
  v_normalized_lang TEXT := lower(trim(p_lang_code));
  v_normalized_fallback TEXT := lower(trim(p_fallback_lang));
BEGIN
  SELECT it.value_text INTO v_result
  FROM i18n_translation it
  JOIN ref_language rl ON rl.id = it.language_id
  WHERE it.target_table = p_target_table
    AND it.target_pk = p_target_pk
    AND it.target_column = p_target_column
    AND lower(rl.code) = v_normalized_lang
    AND it.value_text IS NOT NULL
    AND trim(it.value_text) != ''
  LIMIT 1;
  IF v_result IS NOT NULL THEN RETURN v_result; END IF;

  IF v_normalized_fallback != v_normalized_lang THEN
    SELECT it.value_text INTO v_result
    FROM i18n_translation it
    JOIN ref_language rl ON rl.id = it.language_id
    WHERE it.target_table = p_target_table
      AND it.target_pk = p_target_pk
      AND it.target_column = p_target_column
      AND lower(rl.code) = v_normalized_fallback
      AND it.value_text IS NOT NULL
      AND trim(it.value_text) != ''
    LIMIT 1;
    IF v_result IS NOT NULL THEN RETURN v_result; END IF;
  END IF;
  RETURN NULL;
END;
$$;

-- =====================================================
-- JSON Helper: Prune empty top-level keys (arrays/objects)
-- =====================================================
CREATE OR REPLACE FUNCTION api.jsonb_prune_empty_top(p JSONB)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
  SELECT COALESCE(jsonb_object_agg(k, v), '{}'::jsonb)
  FROM (
    SELECT key AS k, value AS v
    FROM jsonb_each(p)
    WHERE NOT (
      (jsonb_typeof(value) = 'array'  AND jsonb_array_length(value) = 0)
      OR (jsonb_typeof(value) = 'object' AND value = '{}'::jsonb)
      OR value IS NULL
    )
  ) s;
$$;

-- Encodage base64url (sans "=") pour un bytea -> text
DROP FUNCTION IF EXISTS api.b64url_encode(bytea);
CREATE OR REPLACE FUNCTION api.b64url_encode(p bytea)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
  SELECT regexp_replace(
           replace(
             replace(
               replace(
                 replace(encode(p, 'base64'), E'\n', ''),
               E'\r', ''),
             '+', '-'),
           '/', '_'),
           '=+$',''
         );
$$;

-- Décodage base64url (text -> bytea)
DROP FUNCTION IF EXISTS api.b64url_decode(text);
CREATE OR REPLACE FUNCTION api.b64url_decode(p TEXT)
RETURNS bytea
LANGUAGE plpgsql
IMMUTABLE

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
DECLARE
  s TEXT := replace(replace(p, '-', '+'), '_', '/');
  pad_needed INT;
BEGIN
  pad_needed := (4 - length(s) % 4) % 4;
  IF pad_needed > 0 THEN
    s := s || repeat('=', pad_needed);
  END IF;
  RETURN decode(s, 'base64');
END;
$$;

-- Pack JSONB -> cursor (text)
DROP FUNCTION IF EXISTS api.cursor_pack(jsonb);
CREATE OR REPLACE FUNCTION api.cursor_pack(p jsonb)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
  SELECT api.b64url_encode(convert_to(p::text, 'UTF8'));
$$;

-- Unpack cursor (text) -> JSONB
DROP FUNCTION IF EXISTS api.cursor_unpack(text);
CREATE OR REPLACE FUNCTION api.cursor_unpack(p TEXT)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
  SELECT convert_from(api.b64url_decode(p), 'UTF8')::jsonb;
$$;

-- Clean JSON by removing newlines and extra whitespace
CREATE OR REPLACE FUNCTION api.json_clean(p jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
  SELECT COALESCE(p, '{}'::jsonb);
$$;

-- Langue préférée (première en minuscules)
DROP FUNCTION IF EXISTS api.pick_lang(text[]);
CREATE OR REPLACE FUNCTION api.pick_lang(p_lang_prefs TEXT[] DEFAULT ARRAY['fr']::text[])
RETURNS TEXT
LANGUAGE sql
STABLE

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
  SELECT lower(COALESCE(p_lang_prefs[1], 'fr'));
$$;

-- Normalisation simple pour recherche (sans index expr. côté client)
DROP FUNCTION IF EXISTS api.norm_search(text);
CREATE OR REPLACE FUNCTION api.norm_search(p TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
  SELECT public.immutable_unaccent(lower(COALESCE(p,'')));
$$;



-- =====================================================
-- 2) Export ITI : KML / GPX (robuste geometry/geography & SRID)
--    + Options de placemarks d'étapes (optionnelles)
--    Correction: KML stage style now contains <Icon/> so an icon is always rendered
-- =====================================================
DROP FUNCTION IF EXISTS api.build_iti_track(text, text, boolean, text);
CREATE OR REPLACE FUNCTION api.build_iti_track(
  p_object_id      TEXT,
  p_format         TEXT DEFAULT 'kml',
  p_include_stages BOOLEAN DEFAULT TRUE,
  p_stage_color    TEXT DEFAULT 'red'
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
DECLARE
  v_fmt              TEXT := lower(coalesce(p_format, 'kml'));
  v_name             TEXT;
  v_geom4326         geometry;
  v_kml_line         TEXT;
  v_kml_stages       TEXT;
  v_gpx_trk          TEXT;
  v_gpx_wpts         TEXT;
  v_stage_color_kml  TEXT := 'ff0000ff'; -- KML AABBGGRR (opaque rouge)
  s                  TEXT;
BEGIN
  IF v_fmt NOT IN ('kml','gpx') THEN
    v_fmt := 'kml';
  END IF;

  -- Résolution couleur placemarks KML (AABBGGRR)
  IF p_stage_color IS NOT NULL THEN
    s := trim(p_stage_color);
    IF    lower(s) = 'red'      THEN v_stage_color_kml := 'ff0000ff';
    ELSIF lower(s) = 'blue'     THEN v_stage_color_kml := 'ffff0000';
    ELSIF lower(s) = 'green'    THEN v_stage_color_kml := 'ff00ff00';
    ELSIF lower(s) = 'yellow'   THEN v_stage_color_kml := 'ff00ffff';
    ELSIF lower(s) = 'orange'   THEN v_stage_color_kml := 'ff00a5ff';
    ELSIF lower(s) = 'purple'   THEN v_stage_color_kml := 'ffff00ff';
    ELSIF lower(s) = 'black'    THEN v_stage_color_kml := 'ff000000';
    ELSIF lower(s) = 'white'    THEN v_stage_color_kml := 'ffffffff';
    ELSIF lower(s) = 'cyan'     THEN v_stage_color_kml := 'ffffff00';
    ELSIF lower(s) = 'magenta'  THEN v_stage_color_kml := 'ffff00ff';
    ELSIF lower(s) IN ('gray','grey') THEN v_stage_color_kml := 'ff808080';
    ELSIF s ~* '^[0-9A-F]{8}$' THEN
      v_stage_color_kml := lower(s);
    ELSIF s ~* '^#?[0-9A-F]{6}$' THEN
      s := replace(s,'#','');
      v_stage_color_kml := 'ff' || substr(s,5,2) || substr(s,3,2) || substr(s,1,2);
    END IF;
  END IF;

  -- Nom (facultatif)
  SELECT o.name INTO v_name
  FROM object o
  WHERE o.id = p_object_id;

  -- Normalise en EPSG:4326
  SELECT CASE
           WHEN ST_SRID(oi.geom::geometry) = 0
             THEN ST_SetSRID(oi.geom::geometry, 4326)
           WHEN ST_SRID(oi.geom::geometry) <> 4326
             THEN ST_Transform(oi.geom::geometry, 4326)
           ELSE oi.geom::geometry
         END
  INTO v_geom4326
  FROM object_iti oi
  WHERE oi.object_id = p_object_id
    AND oi.geom IS NOT NULL
  LIMIT 1;

  IF v_geom4326 IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_fmt = 'kml' THEN
    -- 1) Ligne
    WITH dump AS (
      SELECT
        ST_X(dp.geom)::numeric(12,6) AS lon,
        ST_Y(dp.geom)::numeric(12,6) AS lat,
        CASE WHEN ST_CoordDim(dp.geom) >= 3 THEN ST_Z(dp.geom)::numeric(10,2) END AS ele,
        dp.path
      FROM ST_DumpPoints(v_geom4326) AS dp
    )
    SELECT string_agg(
             CASE WHEN ele IS NULL
                  THEN lon::text || ',' || lat::text
                  ELSE lon::text || ',' || lat::text || ',' || ele::text
             END,
             ' ' ORDER BY path
           )
      INTO v_kml_line
      FROM dump;

    -- 2) Étapes (optionnelles)
    IF COALESCE(p_include_stages, TRUE) THEN
      WITH s AS (
        SELECT
          COALESCE(
            replace(replace(replace(stg.name,'&','&amp;'),'<','&lt;'),'>','&gt;'),
            'Étape ' || stg.position::text
          ) AS nm,
          stg.description AS desc_raw,
          (CASE WHEN ST_SRID(stg.geom::geometry) = 0
                THEN ST_SetSRID(stg.geom::geometry,4326)
                ELSE stg.geom::geometry
           END) AS g,
          stg.position
        FROM object_iti_stage stg
        WHERE stg.object_id = p_object_id
          AND stg.geom IS NOT NULL
      ),
      dump AS (
        SELECT
          nm,
          desc_raw,
          ST_X(g)::numeric(12,6) AS lon,
          ST_Y(g)::numeric(12,6) AS lat,
          CASE WHEN ST_CoordDim(g) >= 3 THEN ST_Z(g)::numeric(10,2) END AS ele,
          position
        FROM s
      )
      SELECT string_agg(
        '<Placemark>'
          || '<name>' || nm || '</name>'
          || COALESCE('<description><![CDATA[' || desc_raw || ']]></description>','')
          || '<styleUrl>#stageStyle</styleUrl>'
          || '<Point><coordinates>'
          || lon::text || ',' || lat::text || COALESCE(',' || ele::text,'')
          || '</coordinates></Point>'
        || '</Placemark>',
        '' ORDER BY position
      )
      INTO v_kml_stages
      FROM dump;
    END IF;

    RETURN '<?xml version="1.0" encoding="UTF-8"?>'
        || '<kml xmlns="http://www.opengis.net/kml/2.2"><Document>'
        || '<name>' || COALESCE(replace(replace(replace(v_name,'&','&amp;'),'<','&lt;'),'>','&gt;'), 'Itinéraire') || '</name>'
        || CASE WHEN COALESCE(p_include_stages, TRUE) THEN
             '<Style id="stageStyle">'
               || '<IconStyle>'
                 || '<color>' || v_stage_color_kml || '</color>'
                 || '<scale>1.2</scale>'
                 || '<Icon/>'              -- Correction: ensure an icon node exists (use viewer default)
               || '</IconStyle>'
               || '<LabelStyle><scale>0.9</scale></LabelStyle>'
             || '</Style>'
           ELSE '' END
        || '<Placemark><name>Tracé</name>'
        || '<LineString><coordinates>' || COALESCE(v_kml_line, '') || '</coordinates></LineString>'
        || '</Placemark>'
        || COALESCE(v_kml_stages,'')
        || '</Document></kml>';

  ELSE
    -- GPX : waypoints (étapes) optionnels + track
    IF COALESCE(p_include_stages, TRUE) THEN
      WITH s AS (
        SELECT
          COALESCE(
            replace(replace(replace(stg.name,'&','&amp;'),'<','&lt;'),'>','&gt;'),
            'Étape ' || stg.position::text
          ) AS nm,
          stg.description AS desc_raw,
          (CASE WHEN ST_SRID(stg.geom::geometry) = 0
                THEN ST_SetSRID(stg.geom::geometry,4326)
                ELSE stg.geom::geometry
           END) AS g,
          stg.position
        FROM object_iti_stage stg
        WHERE stg.object_id = p_object_id
          AND stg.geom IS NOT NULL
      ),
      dump AS (
        SELECT
          nm,
          desc_raw,
          ST_X(g)::numeric(12,6) AS lon,
          ST_Y(g)::numeric(12,6) AS lat,
          CASE WHEN ST_CoordDim(g) >= 3 THEN ST_Z(g)::numeric(10,2) END AS ele,
          position
        FROM s
      )
      SELECT string_agg(
               '<wpt lat="' || lat::text || '" lon="' || lon::text || '">'
               || COALESCE('<ele>' || ele::text || '</ele>', '')
               || '<name>' || nm || '</name>'
               || COALESCE('<desc><![CDATA[' || desc_raw || ']]></desc>','')
               || '<sym>Flag, Red</sym>'
               || '</wpt>',
               '' ORDER BY position
             )
        INTO v_gpx_wpts
        FROM dump;
    END IF;

    WITH dump AS (
      SELECT
        ST_X(dp.geom)::numeric(12,6) AS lon,
        ST_Y(dp.geom)::numeric(12,6) AS lat,
        CASE WHEN ST_CoordDim(dp.geom) >= 3 THEN ST_Z(dp.geom)::numeric(10,2) END AS ele,
        dp.path
      FROM ST_DumpPoints(v_geom4326) AS dp
    )
    SELECT string_agg(
             '<trkpt lat="' || lat::text || '" lon="' || lon::text || '">'
             || COALESCE('<ele>' || ele::text || '</ele>', '')
             || '</trkpt>',
             '' ORDER BY path
           )
      INTO v_gpx_trk
      FROM dump;

    RETURN '<?xml version="1.0" encoding="UTF-8"?>'
         || '<gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1" creator="Unified API">'
         || COALESCE(v_gpx_wpts,'')
         || '<trk><name>' || COALESCE(replace(replace(replace(v_name,'&','&amp;'),'<','&lt;'),'>','&gt;'), 'Itinéraire') || '</name><trkseg>'
         || COALESCE(v_gpx_trk, '')
         || '</trkseg></trk></gpx>';
  END IF;
END;
$$;


-- =====================================================
-- Shared filter function: Returns object IDs matching filter criteria
-- Used by list_object_resources_filtered_page, list_object_resources_filtered_since_fast, list_objects_map_view
-- Returns label_rank alongside object_id:
--   0 = exact granted classification match on label_scheme_ranked scheme
--   1 = equivalent evidence (sustainability action link or accessibility amenity)
--   Always 0 when label_scheme_ranked filter is absent.
-- =====================================================
DROP FUNCTION IF EXISTS api.get_filtered_object_ids(jsonb, object_type[], object_status[], text);
CREATE OR REPLACE FUNCTION api.get_filtered_object_ids(
  p_filters JSONB,
  p_types object_type[],
  p_status object_status[],
  p_search TEXT DEFAULT NULL
)
RETURNS TABLE(object_id TEXT, label_rank INTEGER)
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
    SELECT
      n.filters,
      CASE WHEN n.filters ? 'commercial_visibility_any'
        THEN ARRAY(SELECT jsonb_array_elements_text(n.filters->'commercial_visibility_any'))
      END AS commercial_visibility_any,
      CASE WHEN n.filters ? 'amenities_any'
        THEN ARRAY(SELECT jsonb_array_elements_text(n.filters->'amenities_any'))
      END AS amenities_any,
      CASE WHEN n.filters ? 'amenities_all'
        THEN ARRAY(SELECT jsonb_array_elements_text(n.filters->'amenities_all'))
      END AS amenities_all,
      CASE WHEN n.filters ? 'amenity_families_any'
        THEN ARRAY(SELECT jsonb_array_elements_text(n.filters->'amenity_families_any'))
      END AS amenity_families_any,
      CASE WHEN n.filters ? 'payment_methods_any'
        THEN ARRAY(SELECT jsonb_array_elements_text(n.filters->'payment_methods_any'))
      END AS payment_methods_any,
      CASE WHEN n.filters ? 'environment_tags_any'
        THEN ARRAY(SELECT jsonb_array_elements_text(n.filters->'environment_tags_any'))
      END AS environment_tags_any,
      CASE WHEN n.filters ? 'languages_any'
        THEN ARRAY(SELECT jsonb_array_elements_text(n.filters->'languages_any'))
      END AS languages_any,
      CASE WHEN n.filters ? 'city_any'
        THEN ARRAY(
          SELECT immutable_unaccent(lower(jsonb_array_elements_text(n.filters->'city_any')))
        )
      END AS city_any,
      CASE WHEN n.filters ? 'lieu_dit_any'
        THEN ARRAY(
          SELECT immutable_unaccent(lower(jsonb_array_elements_text(n.filters->'lieu_dit_any')))
        )
      END AS lieu_dit_any,
      CASE WHEN n.filters ? 'media_types_any'
        THEN ARRAY(SELECT jsonb_array_elements_text(n.filters->'media_types_any'))
      END AS media_types_any,
      CASE WHEN n.filters->'meeting_room' ? 'equipment_any'
        THEN ARRAY(SELECT jsonb_array_elements_text(n.filters->'meeting_room'->'equipment_any'))
      END AS meeting_equipment_any,
      CASE WHEN n.filters->'meeting_room' ? 'equipment_all'
        THEN ARRAY(SELECT jsonb_array_elements_text(n.filters->'meeting_room'->'equipment_all'))
      END AS meeting_equipment_all,
      CASE WHEN n.filters ? 'tags_any'
        THEN ARRAY(SELECT jsonb_array_elements_text(n.filters->'tags_any'))
      END AS tags_any,
      CASE WHEN n.filters->'itinerary' ? 'practices_any'
        THEN ARRAY(SELECT jsonb_array_elements_text(n.filters->'itinerary'->'practices_any'))
      END AS iti_practices_any,
      CASE WHEN n.filters ? 'classifications_any'
        THEN ARRAY(
          SELECT ((j->>'scheme_code') || ':' || (j->>'value_code'))
          FROM jsonb_array_elements(n.filters->'classifications_any') AS j
          WHERE COALESCE(j->>'scheme_code', '') <> ''
            AND COALESCE(j->>'value_code', '') <> ''
        )
      END AS classifications_any_codes,
      -- accessibility type filters (2026-03-22)
      -- disability_types_any: TEXT[] of canonical disability types (motor/hearing/visual/cognitive).
      -- label_disability_types_any: TEXT[] of canonical disability types matched against LBL_TOURISME_HANDICAP subvalue_ids.
      CASE WHEN n.filters ? 'disability_types_any'
        THEN ARRAY(SELECT jsonb_array_elements_text(n.filters->'disability_types_any'))
      END AS disability_types_any,
      CASE WHEN n.filters ? 'label_disability_types_any'
        THEN ARRAY(SELECT jsonb_array_elements_text(n.filters->'label_disability_types_any'))
      END AS label_disability_types_any,
      NOT (
        n.filters ? 'amenities_all'
        OR n.filters ? 'amenity_families_any'
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
      ) AS use_mv
    FROM normalized n
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
      m.cached_classification_codes
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
      o.cached_classification_codes
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
      WHEN EXISTS (
        SELECT 1 FROM object_classification oc
        JOIN ref_classification_scheme cs ON cs.id = oc.scheme_id
        WHERE oc.object_id = src.object_id
          AND cs.code = params.filters->>'label_scheme_ranked'
          AND oc.status = 'granted'
      ) THEN 0
      ELSE 1
    END AS label_rank
  FROM source_rows src
  CROSS JOIN params
  WHERE (p_types IS NULL OR src.object_type = ANY(p_types))
    AND (p_status IS NULL OR src.status = ANY(p_status))
    AND (NOT (params.filters ? 'commercial_visibility') OR src.commercial_visibility = (params.filters->>'commercial_visibility'))
    AND (params.commercial_visibility_any IS NULL OR src.commercial_visibility = ANY(params.commercial_visibility_any))
    AND (
      p_search IS NULL OR
      src.name_search_vector @@ plainto_tsquery('french', api.norm_search(p_search)) OR
      (src.city_search_vector IS NOT NULL AND src.city_search_vector @@ plainto_tsquery('french', api.norm_search(p_search)))
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
    -- disability_types_any: retourne les objets avec ≥1 amenity acc_* dont extra.disability_types
    -- contient au moins une des valeurs demandées. Tableau vide → aucun effet (cardinality guard).
    -- Bypasse le MV (use_mv = FALSE) car ref_amenity.extra n'est pas dans cached_amenity_codes.
    AND (params.disability_types_any IS NULL OR cardinality(params.disability_types_any) = 0 OR EXISTS (
      SELECT 1
      FROM object_amenity oa
      JOIN ref_amenity ra ON ra.id = oa.amenity_id
      CROSS JOIN LATERAL jsonb_array_elements_text(
        COALESCE(ra.extra->'disability_types', '[]'::jsonb)
      ) AS dt(val)
      WHERE oa.object_id = src.object_id
        AND ra.code LIKE 'acc_%'
        AND dt.val = ANY(params.disability_types_any)
    ))
    -- label_disability_types_any: retourne les objets avec un grant LBL_TOURISME_HANDICAP explicite
    -- dont les subvalue_ids contiennent ≥1 type demandé (via ref_classification_value.metadata->>'disability_type').
    -- Ne déduit pas depuis les amenities — requiert uniquement le label certifié avec subvalue_ids renseignés.
    -- Tableau vide → aucun effet. Bypasse le MV (use_mv = FALSE).
    AND (params.label_disability_types_any IS NULL OR cardinality(params.label_disability_types_any) = 0 OR EXISTS (
      SELECT 1
      FROM object_classification oc
      JOIN ref_classification_scheme cs ON cs.id = oc.scheme_id
      CROSS JOIN LATERAL unnest(oc.subvalue_ids) AS sv(uid)
      JOIN ref_classification_value cv ON cv.id = sv.uid
      WHERE oc.object_id = src.object_id
        AND cs.code = 'LBL_TOURISME_HANDICAP'
        AND oc.status = 'granted'
        AND cv.metadata->>'disability_type' = ANY(params.label_disability_types_any)
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
        AND ( (params.filters->'itinerary'->>'duration_min_h') IS NULL OR oi.duration_hours >= (params.filters->'itinerary'->>'duration_min_h')::numeric )
        AND ( (params.filters->'itinerary'->>'duration_max_h') IS NULL OR oi.duration_hours <= (params.filters->'itinerary'->>'duration_max_h')::numeric )
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
    -- label_scheme_ranked: admit rank-0 (exact granted classification) and rank-1 (equivalent evidence).
    -- rank-1a: any sustainability action whose label bridges to the requested scheme.
    -- rank-1b: accessibility amenity family evidence (LBL_TOURISME_HANDICAP only).
    AND (NOT (params.filters ? 'label_scheme_ranked') OR (
      EXISTS (
        SELECT 1 FROM object_classification oc
        JOIN ref_classification_scheme cs ON cs.id = oc.scheme_id
        WHERE oc.object_id = src.object_id
          AND cs.code = params.filters->>'label_scheme_ranked'
          AND oc.status = 'granted'
      )
      OR EXISTS (
        SELECT 1 FROM object_sustainability_action osa
        JOIN object_sustainability_action_label osal ON osal.object_sustainability_action_id = osa.id
        JOIN object_classification oc2 ON oc2.id = osal.object_classification_id
        JOIN ref_classification_scheme cs2 ON cs2.id = oc2.scheme_id
        WHERE osa.object_id = src.object_id
          AND cs2.code = params.filters->>'label_scheme_ranked'
      )
      OR (
        (params.filters->>'label_scheme_ranked') = 'LBL_TOURISME_HANDICAP'
        AND EXISTS (
          SELECT 1 FROM object_amenity oa
          JOIN ref_amenity ra ON ra.id = oa.amenity_id
          JOIN ref_code_amenity_family fam ON fam.id = ra.family_id
          WHERE oa.object_id = src.object_id AND fam.code = 'accessibility' -- canonical amenity family code
        )
      )
    ));
$$;

-- =====================================================
-- Batch wrapper for get_object_resource (performance optimization)
-- Fetches resources for multiple objects while preserving order
-- =====================================================
CREATE OR REPLACE FUNCTION api.get_object_resources_batch(
  p_ids TEXT[],
  p_lang_prefs TEXT[] DEFAULT ARRAY['fr']::text[],
  p_track_format TEXT DEFAULT 'none',
  p_options JSONB DEFAULT '{}'::jsonb
)
RETURNS JSON
LANGUAGE plpgsql
STABLE

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
DECLARE
  v_result JSON;
BEGIN
  -- Keep set-based execution but defer function resolution to runtime
  -- so this wrapper can be created before get_object_resource in this file.
  EXECUTE $sql$
    WITH input_ids AS (
      SELECT t.id, t.ord
      FROM unnest(COALESCE($1, ARRAY[]::text[])) WITH ORDINALITY AS t(id, ord)
      WHERE t.id IS NOT NULL
    ),
    distinct_ids AS (
      SELECT DISTINCT i.id
      FROM input_ids i
    ),
    resources AS (
      SELECT
        d.id,
        api.get_object_resource(
          d.id,
          $2,
          $3,
          $4
        ) AS resource
      FROM distinct_ids d
    )
    SELECT COALESCE(
      json_agg(
        r.resource
        ORDER BY i.ord
      ),
      '[]'::json
    )
    FROM input_ids i
    JOIN resources r ON r.id = i.id
  $sql$
  INTO v_result
  USING p_ids, p_lang_prefs, p_track_format, p_options;

  RETURN COALESCE(v_result, '[]'::json);
END;
$$;

-- =====================================================
-- Lightweight card read model (single + batch)
-- =====================================================
CREATE OR REPLACE FUNCTION api.get_object_card(
  p_object_id TEXT,
  p_lang_prefs TEXT[] DEFAULT ARRAY['fr']::text[]
)
RETURNS JSONB
LANGUAGE sql
STABLE

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
  SELECT jsonb_build_object(
    'id',           o.id,
    'type',         o.object_type::text,
    'name',         o.name,
    'status',       o.status::text,
    'commercial_visibility', o.commercial_visibility,
    'image',        o.cached_main_image_url,
    'rating',       o.cached_rating,
    'review_count', o.cached_review_count,
    'min_price',    o.cached_min_price,
    'open_now',     o.cached_is_open_now,
    'location',     jsonb_build_object(
      'lat',      ol.latitude,
      'lon',      ol.longitude,
      'city',     ol.city,
      'postcode', ol.postcode,
      'lieu_dit', ol.lieu_dit,
      'address',  CONCAT_WS(', ',
        NULLIF(ol.address1, ''),
        NULLIF(ol.lieu_dit, ''),
        NULLIF(ol.postcode, ''),
        NULLIF(ol.city, '')
      )
    ),
    'description',  LEFT(COALESCE(
      api.i18n_pick(d.description_chapo_i18n, api.pick_lang(p_lang_prefs), 'fr'),
      d.description_chapo,
      LEFT(d.description, 200)
    ), 200),
    'updated_at',   o.updated_at
  )
  FROM object o
  LEFT JOIN object_location ol
    ON ol.object_id = o.id
   AND ol.is_main_location IS TRUE
  LEFT JOIN object_description d
    ON d.object_id = o.id
   AND d.org_object_id IS NULL
  WHERE o.id = p_object_id;
$$;

CREATE OR REPLACE FUNCTION api.get_object_cards_batch(
  p_ids TEXT[],
  p_lang_prefs TEXT[] DEFAULT ARRAY['fr']::text[]
)
RETURNS JSON
LANGUAGE sql
STABLE

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
  SELECT COALESCE(
    json_agg(api.get_object_card(t.id, p_lang_prefs) ORDER BY t.ord),
    '[]'::json
  )
  FROM unnest(COALESCE(p_ids, ARRAY[]::text[])) WITH ORDINALITY AS t(id, ord)
  WHERE t.id IS NOT NULL;
$$;

-- =====================================================
-- Object resource block helpers (decomposition layer)
-- =====================================================
CREATE OR REPLACE FUNCTION api.jsonb_pick_keys(p_payload JSONB, p_keys TEXT[])
RETURNS JSONB
LANGUAGE sql
IMMUTABLE

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
  SELECT COALESCE(
    (
      SELECT jsonb_object_agg(k, p_payload -> k)
      FROM unnest(COALESCE(p_keys, ARRAY[]::TEXT[])) AS t(k)
      WHERE p_payload ? k
    ),
    '{}'::jsonb
  );
$$;

CREATE OR REPLACE FUNCTION api.resource_block_base(p_payload JSONB)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
  SELECT api.jsonb_pick_keys(p_payload, ARRAY[
    'id','type','status','is_editing','name','region_code',
    'created_at','updated_at','updated_at_source','published_at','commercial_visibility','current_membership'
  ]);
$$;

CREATE OR REPLACE FUNCTION api.resource_block_location(p_payload JSONB)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
  SELECT api.jsonb_pick_keys(p_payload, ARRAY['address','location','opening_times','places']);
$$;

CREATE OR REPLACE FUNCTION api.resource_block_descriptions(p_payload JSONB)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
  SELECT api.jsonb_pick_keys(p_payload, ARRAY['description','descriptions','private_note','private_notes']);
$$;

CREATE OR REPLACE FUNCTION api.resource_block_contacts(p_payload JSONB)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
  SELECT api.jsonb_pick_keys(p_payload, ARRAY['external_ids','contacts','languages','actors']);
$$;

CREATE OR REPLACE FUNCTION api.resource_block_media(p_payload JSONB)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
  SELECT api.jsonb_pick_keys(p_payload, ARRAY['media','meeting_rooms']);
$$;

CREATE OR REPLACE FUNCTION api.resource_block_pricing(p_payload JSONB)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
  SELECT api.jsonb_pick_keys(p_payload, ARRAY[
    'capacity','amenities','environment_tags','payment_methods',
    'prices','discounts','group_policies','classifications','tags',
    'menus','cuisine_types','dietary_tags','allergens','associated_restaurants_cuisine_types'
  ]);
$$;

CREATE OR REPLACE FUNCTION api.resource_block_legal(p_payload JSONB)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
  SELECT api.jsonb_pick_keys(p_payload, ARRAY['legal_records','pet_policy','origins','org_links']);
$$;

CREATE OR REPLACE FUNCTION api.resource_block_itinerary(p_payload JSONB)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
  SELECT api.jsonb_pick_keys(p_payload, ARRAY[
    'itinerary_details','itinerary','outgoing_relations','incoming_relations',
    'fma','fma_occurrences','sustainability_labels','sustainability_actions','sustainability_action_labels'
  ]);
$$;

CREATE OR REPLACE FUNCTION api.resource_block_render(p_payload JSONB)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
  SELECT api.jsonb_pick_keys(p_payload, ARRAY['render']);
$$;

CREATE OR REPLACE FUNCTION api.resource_block_misc(p_payload JSONB)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
  SELECT p_payload - ARRAY[
    'id','type','status','is_editing','name','region_code',
    'created_at','updated_at','updated_at_source','published_at','current_membership',
    'address','location','opening_times','places',
    'description','descriptions','private_note','private_notes',
    'external_ids','contacts','languages','actors',
    'media','meeting_rooms',
    'capacity','amenities','environment_tags','payment_methods',
    'prices','discounts','group_policies','classifications','tags',
    'menus','cuisine_types','dietary_tags','allergens','associated_restaurants_cuisine_types',
    'legal_records','pet_policy','origins','org_links',
    'itinerary_details','itinerary','outgoing_relations','incoming_relations',
    'fma','fma_occurrences','sustainability_labels','sustainability_actions','sustainability_action_labels',
    'render'
  ];
$$;

CREATE OR REPLACE FUNCTION api.compose_object_resource_blocks(p_payload JSONB)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
  SELECT
    api.resource_block_base(p_payload)
    || api.resource_block_location(p_payload)
    || api.resource_block_descriptions(p_payload)
    || api.resource_block_contacts(p_payload)
    || api.resource_block_media(p_payload)
    || api.resource_block_pricing(p_payload)
    || api.resource_block_legal(p_payload)
    || api.resource_block_itinerary(p_payload)
    || api.resource_block_render(p_payload)
    || api.resource_block_misc(p_payload);
$$;

-- =====================================================
-- 3) Ressource unifiée (toutes typologies) + icônes étendues
--     Améliorations: ORDRES plus logiques et stables dans les tableaux
--     - Priorité aux flags (ex: is_primary), puis position si dispo,
--       puis tri alphabétique, puis created_at / fallback column-safe
--     - Tri "column-safe" via to_jsonb(row)->>'col' pour éviter les erreurs
--       et ctid comme dernier recours si besoin
-- =====================================================
DROP FUNCTION IF EXISTS api.get_object_resource(text, text[], text, jsonb);
DROP FUNCTION IF EXISTS api.get_object_resource(text, text[], text, boolean, text);
CREATE OR REPLACE FUNCTION api.get_object_resource(
  p_object_id    TEXT,
  p_lang_prefs   TEXT[]  DEFAULT ARRAY['fr']::text[],
  p_track_format TEXT    DEFAULT 'none',         -- 'kml' | 'gpx' | 'none'
  p_options      JSONB   DEFAULT '{}'::jsonb     -- { include_stages?:bool, stage_color?:text, fields?:string[], include?:string[] }
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, api, auth
AS $$
DECLARE
  lang    TEXT := api.pick_lang(p_lang_prefs);
  obj     RECORD;
  js      JSONB := '{}'::jsonb;
  v_fmt   TEXT := lower(coalesce(p_track_format,'none'));
  v_inc   BOOLEAN := COALESCE((p_options->>'include_stages')::boolean, TRUE);
  v_color TEXT := COALESCE(p_options->>'stage_color','red');
  v_opening_times JSON;
  v_prefer_org TEXT;
  v_inc_private BOOLEAN := COALESCE((p_options->>'include_private')::boolean, FALSE);
  v_fields TEXT[] := CASE WHEN p_options ? 'fields' THEN ARRAY(SELECT jsonb_array_elements_text(p_options->'fields')) ELSE NULL END;
  v_include TEXT[] := CASE WHEN p_options ? 'include' THEN ARRAY(SELECT jsonb_array_elements_text(p_options->'include')) ELSE NULL END;
  v_render_enabled BOOLEAN := COALESCE((p_options->>'render')::boolean, TRUE);
  v_render_locale TEXT := NULLIF(p_options->>'render_locale','');
  v_render_tz TEXT := COALESCE(NULLIF(p_options->>'render_tz',''), 'UTC');
  v_render_version TEXT := COALESCE(NULLIF(p_options->>'render_version',''), '1.0');
  v_render JSONB := '{}'::jsonb;
  v_tmp_json JSONB;
  v_omit_empty BOOLEAN := COALESCE((p_options->>'omit_empty')::boolean, FALSE);
  v_can_read_extended BOOLEAN := FALSE;
BEGIN
  v_can_read_extended := api.can_read_extended(p_object_id);

  -- Check if user can access this object (RLS-aware)
  -- First check if object exists and user has access
  SELECT o.* INTO obj
  FROM object o
  WHERE o.id = p_object_id
    AND (
      -- Public access: published objects
      o.status = 'published' 
      OR 
      -- Extended access: user is actor for this object or parent org
      v_can_read_extended
    );

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  -- Preferred organization for descriptions: explicit option overrides primary org link
  SELECT COALESCE(NULLIF(p_options->>'org_object_id',''), (
           SELECT ool.org_object_id
           FROM object_org_link ool
           WHERE ool.object_id = obj.id AND ool.is_primary IS TRUE
           ORDER BY ool.updated_at DESC
           LIMIT 1
         ))
  INTO v_prefer_org;

  IF v_render_locale IS NULL OR v_render_locale = '' THEN
    v_render_locale := CASE
      WHEN lang IS NOT NULL AND position('-' IN lang) > 0 THEN lang
      WHEN lang IS NOT NULL AND char_length(lang) = 2 THEN lower(lang) || '-' || upper(lang)
      ELSE 'fr-FR'
    END;
  END IF;

  v_render_locale := lower(split_part(v_render_locale, '-', 1)) || '-' ||
                     upper(CASE WHEN position('-' IN v_render_locale) > 0 THEN split_part(v_render_locale, '-', 2)
                                ELSE split_part(v_render_locale, '-', 1) END);

  IF v_include IS NOT NULL AND 'render' = ANY(v_include) THEN
    v_render_enabled := TRUE;
  END IF;


  -- Base fields
  IF v_fields IS NULL OR 'id' = ANY(v_fields) THEN
    js := js || jsonb_build_object('id', obj.id);
  END IF;
  IF v_fields IS NULL OR 'type' = ANY(v_fields) THEN
    js := js || jsonb_build_object('type', obj.object_type::text);
  END IF;
  IF v_fields IS NULL OR 'status' = ANY(v_fields) THEN
    js := js || jsonb_build_object('status', obj.status::text);
  END IF;
  IF v_fields IS NULL OR 'commercial_visibility' = ANY(v_fields) THEN
    js := js || jsonb_build_object('commercial_visibility', obj.commercial_visibility);
  END IF;
  IF v_fields IS NULL OR 'is_editing' = ANY(v_fields) THEN
    js := js || jsonb_build_object('is_editing', obj.is_editing);
  END IF;
  IF v_fields IS NULL OR 'name' = ANY(v_fields) THEN
    js := js || jsonb_build_object('name', obj.name);
  END IF;
  IF v_fields IS NULL OR 'region_code' = ANY(v_fields) THEN
    js := js || jsonb_build_object('region_code', obj.region_code);
  END IF;
  IF v_fields IS NULL OR 'created_at' = ANY(v_fields) THEN
    js := js || jsonb_build_object('created_at', obj.created_at);
  END IF;
  IF v_fields IS NULL OR 'updated_at' = ANY(v_fields) THEN
    js := js || jsonb_build_object('updated_at', obj.updated_at);
  END IF;
  IF v_fields IS NULL OR 'updated_at_source' = ANY(v_fields) THEN
    js := js || jsonb_build_object('updated_at_source', obj.updated_at_source);
  END IF;
  IF v_fields IS NULL OR 'published_at' = ANY(v_fields) THEN
    js := js || jsonb_build_object('published_at', obj.published_at);
  END IF;

  -- Address (from object_location main)
  IF v_fields IS NULL OR 'address' = ANY(v_fields) THEN
    js := js || COALESCE((
      SELECT jsonb_build_object(
        'address',
        jsonb_build_object(
          'address1',       ol.address1,
          'address1_suite', ol.address1_suite,
          'address2',       ol.address2,
          'address3',       ol.address3,
          'postcode',       ol.postcode,
          'city',           ol.city,
          'code_insee',     ol.code_insee,
          'lieu_dit',       ol.lieu_dit,
          'direction',      ol.direction
        )
      )
      FROM object_location ol
      WHERE ol.object_id = obj.id
        AND ol.is_main_location IS TRUE
      ORDER BY ol.created_at
      LIMIT 1
    ), '{}'::jsonb);
  END IF;

  -- Private notes (by preferred organization, optional)
  IF v_inc_private AND v_can_read_extended THEN
    -- Primary private note
    js := js || COALESCE((
      SELECT jsonb_build_object('private_note', (to_jsonb(pn) - 'object_id' - 'language_id') || jsonb_build_object('lang', rl.code))
      FROM object_private_description pn
      LEFT JOIN ref_language rl ON rl.id = pn.language_id
      WHERE pn.object_id = obj.id
        AND pn.audience = 'private'
        AND (
          (v_prefer_org IS NOT NULL AND pn.org_object_id IS NOT DISTINCT FROM v_prefer_org)
          OR (v_prefer_org IS NULL AND pn.org_object_id IS NULL)
        )
      ORDER BY pn.created_at DESC, pn.id
      LIMIT 1
    ), '{}'::jsonb);

    -- All private notes
    js := js || jsonb_build_object(
      'private_notes',
      COALESCE((
        SELECT jsonb_agg(
          (to_jsonb(pn) - 'object_id' - 'language_id') || jsonb_build_object('lang', rl.code)
               ORDER BY
                 NULLIF((to_jsonb(pn)->>'created_at'),'')::timestamptz NULLS LAST,
                 NULLIF((to_jsonb(pn)->>'id'),'') NULLS LAST,
                 pn.ctid)
        FROM object_private_description pn
        LEFT JOIN ref_language rl ON rl.id = pn.language_id
        WHERE pn.object_id = obj.id
          AND pn.audience = 'private'
      ), '[]'::jsonb)
    );
  END IF;

  -- Location (from object_location main)
  IF v_fields IS NULL OR 'location' = ANY(v_fields) THEN
    js := js || COALESCE((
      SELECT jsonb_build_object(
        'location',
        jsonb_build_object(
          'latitude',   ol.latitude,
          'longitude',  ol.longitude,
          'altitude_m', ol.altitude_m,
          'geometry', CASE 
            WHEN ol.latitude IS NOT NULL AND ol.longitude IS NOT NULL THEN
              jsonb_build_object(
                'type', 'Point',
                'coordinates', jsonb_build_array(ol.longitude, ol.latitude)
              )
            ELSE NULL
          END
        )
      )
      FROM object_location ol
      WHERE ol.object_id = obj.id
        AND ol.is_main_location IS TRUE
      ORDER BY ol.created_at
      LIMIT 1
    ), '{}'::jsonb);
  END IF;

  -- Primary description (by preferred organization with fallback to canonical)
  -- Now supports i18n translations with fallback to plain text columns
  -- Uses api.i18n_pick() to extract translations from JSONB columns
  -- Fallback logic: if org-specific description exists, use it; otherwise use canonical
  IF v_fields IS NULL OR 'description' = ANY(v_fields) THEN
    js := js || COALESCE((
      WITH org_desc AS (
        SELECT d.*
        FROM object_description d
        WHERE d.object_id = obj.id
          AND v_prefer_org IS NOT NULL
          AND d.org_object_id IS NOT DISTINCT FROM v_prefer_org
          AND (v_can_read_extended OR d.visibility IS NULL OR d.visibility = 'public')
        ORDER BY d.created_at DESC, d.id
        LIMIT 1
      ),
      canonical_desc AS (
        SELECT d.*
        FROM object_description d
        WHERE d.object_id = obj.id
          AND d.org_object_id IS NULL
          AND (v_can_read_extended OR d.visibility IS NULL OR d.visibility = 'public')
        ORDER BY d.created_at DESC, d.id
        LIMIT 1
      )
      SELECT jsonb_build_object(
        'description', 
        CASE 
          WHEN api.i18n_pick(d.description_i18n, lang, 'fr') IS NOT NULL 
          THEN api.i18n_pick(d.description_i18n, lang, 'fr')
          ELSE d.description
        END,
        'description_chapo',
        CASE 
          WHEN api.i18n_pick(d.description_chapo_i18n, lang, 'fr') IS NOT NULL 
          THEN api.i18n_pick(d.description_chapo_i18n, lang, 'fr')
          ELSE d.description_chapo
        END,
        'description_mobile',
        CASE 
          WHEN api.i18n_pick(d.description_mobile_i18n, lang, 'fr') IS NOT NULL 
          THEN api.i18n_pick(d.description_mobile_i18n, lang, 'fr')
          ELSE d.description_mobile
        END,
        'description_edition',
        CASE 
          WHEN api.i18n_pick(d.description_edition_i18n, lang, 'fr') IS NOT NULL 
          THEN api.i18n_pick(d.description_edition_i18n, lang, 'fr')
          ELSE d.description_edition
        END,
        'description_offre_hors_zone',
        CASE 
          WHEN api.i18n_pick(d.description_offre_hors_zone_i18n, lang, 'fr') IS NOT NULL 
          THEN api.i18n_pick(d.description_offre_hors_zone_i18n, lang, 'fr')
          ELSE d.description_offre_hors_zone
        END,
        'sanitary_measures',
        CASE 
          WHEN api.i18n_pick(d.sanitary_measures_i18n, lang, 'fr') IS NOT NULL 
          THEN api.i18n_pick(d.sanitary_measures_i18n, lang, 'fr')
          ELSE d.sanitary_measures
        END,
        'description_adapted',
        CASE 
          WHEN api.i18n_pick(d.description_adapted_i18n, lang, 'fr') IS NOT NULL 
          THEN api.i18n_pick(d.description_adapted_i18n, lang, 'fr')
          ELSE d.description_adapted
        END,
        'visibility', d.visibility,
        'position', d.position,
        'created_at', d.created_at,
        'updated_at', d.updated_at
      )
      FROM (
        SELECT * FROM org_desc
        UNION ALL
        SELECT * FROM canonical_desc
        WHERE NOT EXISTS (SELECT 1 FROM org_desc)
      ) d
      LIMIT 1
    ), '{}'::jsonb);
  END IF;

  -- All descriptions (public)
  IF v_fields IS NULL OR 'descriptions' = ANY(v_fields) THEN
    js := js || jsonb_build_object(
      'descriptions',
      COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', d.id,
            'description', 
            CASE 
              WHEN api.i18n_pick(d.description_i18n, lang, 'fr') IS NOT NULL 
              THEN api.i18n_pick(d.description_i18n, lang, 'fr')
              ELSE d.description
            END,
            'description_chapo',
            CASE 
              WHEN api.i18n_pick(d.description_chapo_i18n, lang, 'fr') IS NOT NULL 
              THEN api.i18n_pick(d.description_chapo_i18n, lang, 'fr')
              ELSE d.description_chapo
            END,
            'description_mobile',
            CASE 
              WHEN api.i18n_pick(d.description_mobile_i18n, lang, 'fr') IS NOT NULL 
              THEN api.i18n_pick(d.description_mobile_i18n, lang, 'fr')
              ELSE d.description_mobile
            END,
            'description_edition',
            CASE 
              WHEN api.i18n_pick(d.description_edition_i18n, lang, 'fr') IS NOT NULL 
              THEN api.i18n_pick(d.description_edition_i18n, lang, 'fr')
              ELSE d.description_edition
            END,
            'description_offre_hors_zone',
            CASE 
              WHEN api.i18n_pick(d.description_offre_hors_zone_i18n, lang, 'fr') IS NOT NULL 
              THEN api.i18n_pick(d.description_offre_hors_zone_i18n, lang, 'fr')
              ELSE d.description_offre_hors_zone
            END,
            'sanitary_measures',
            CASE 
              WHEN api.i18n_pick(d.sanitary_measures_i18n, lang, 'fr') IS NOT NULL 
              THEN api.i18n_pick(d.sanitary_measures_i18n, lang, 'fr')
              ELSE d.sanitary_measures
            END,
            'description_adapted',
            CASE 
              WHEN api.i18n_pick(d.description_adapted_i18n, lang, 'fr') IS NOT NULL 
              THEN api.i18n_pick(d.description_adapted_i18n, lang, 'fr')
              ELSE d.description_adapted
            END,
            'visibility', d.visibility,
            'position', d.position,
            'created_at', d.created_at,
            'updated_at', d.updated_at
          )
          ORDER BY
            NULLIF(d.position, 0) NULLS LAST,
            NULLIF(d.visibility, '') NULLS LAST,
            d.created_at NULLS LAST,
            d.id NULLS LAST,
            d.ctid
        )
        FROM object_description d
        WHERE d.object_id = obj.id
          AND (v_can_read_extended OR d.visibility IS NULL OR d.visibility = 'public')
      ), '[]'::jsonb)
    );
  END IF;


  -- External IDs
  IF v_fields IS NULL OR 'external_ids' = ANY(v_fields) THEN
    js := js || jsonb_build_object(
      'external_ids',
      COALESCE((
        SELECT jsonb_agg(to_jsonb(e) - 'object_id'
               ORDER BY
                 NULLIF((to_jsonb(e)->>'system'),'') NULLS LAST,
                 NULLIF((to_jsonb(e)->>'value'),'')  NULLS LAST,
                 NULLIF((to_jsonb(e)->>'created_at'),'')::timestamptz NULLS LAST,
                 NULLIF((to_jsonb(e)->>'id'),'') NULLS LAST,
                 e.ctid)
        FROM object_external_id e
        WHERE e.object_id = obj.id
      ), '[]'::jsonb)
    );
  END IF;

  -- Contacts (enriched) - ensure only one is marked as primary
  IF v_fields IS NULL OR 'contacts' = ANY(v_fields) THEN
    js := js || jsonb_build_object(
      'contacts',
      COALESCE((
      SELECT jsonb_agg(
              jsonb_build_object(
                'kind_code', rc.code,
                'kind_name', COALESCE(api.i18n_pick_strict(rc.name_i18n, lang, 'fr'), rc.name),
                'kind_description', COALESCE(api.i18n_pick_strict(rc.description_i18n, lang, 'fr'), rc.description),
                'icon_url',  rc.icon_url,
                 'value',     c.value,
                 'is_public', c.is_public,
                 'is_primary', c.is_primary,
                 'role',      (SELECT rcr.code FROM ref_contact_role rcr WHERE rcr.id = c.role_id),
                 'position',  c.position
               )
               ORDER BY c.is_primary DESC,
                        c.position NULLS LAST,
                        c.created_at,
                        NULLIF((to_jsonb(c)->>'id'),'') NULLS LAST,
                        c.ctid
             )
      FROM contact_channel c
      JOIN ref_code_contact_kind rc ON rc.id = c.kind_id
      WHERE c.object_id = obj.id
        AND (v_can_read_extended OR c.is_public = TRUE)
    ), '[]'::jsonb)
    );
  END IF;

  -- Languages (enriched)
  IF v_fields IS NULL OR 'languages' = ANY(v_fields) THEN
    js := js || jsonb_build_object(
      'languages',
      COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object('code', rl.code, 'name', rl.name)
               ORDER BY rl.name, rl.code
             )
      FROM object_language ol
      JOIN ref_language rl ON rl.id = ol.language_id
      WHERE ol.object_id = obj.id
      ), '[]'::jsonb)
    );
  END IF;

  -- Media (enriched) - with org-specific fallback to canonical
  -- Optimized: Use DISTINCT ON instead of CTEs for better performance
  IF v_fields IS NULL OR 'media' = ANY(v_fields) THEN
    js := js || jsonb_build_object(
      'media',
      COALESCE((
      SELECT jsonb_agg(
              jsonb_build_object(
                 'id',        m.id,
                'type_code', mt.code,
                'type_name', COALESCE(api.i18n_pick_strict(mt.name_i18n, lang, 'fr'), mt.name),
                'type_description', COALESCE(api.i18n_pick_strict(mt.description_i18n, lang, 'fr'), mt.description),
                 'icon_url',  mt.icon_url,
                 'title',     COALESCE(api.i18n_pick_strict(m.title_i18n, lang, 'fr'), m.title),
                 'credit',    m.credit,
                 'url',       m.url,
                 'is_main',   m.is_main,
                 'visibility',m.visibility,
                 'position',  m.position,
                 'width',     m.width,
                 'height',    m.height,
                 'tags',      COALESCE((
                   SELECT jsonb_agg(rmt.code ORDER BY rmt.position NULLS LAST, rmt.name)
                   FROM media_tag mt2
                   JOIN ref_code_media_tag rmt ON rmt.id = mt2.tag_id
                   WHERE mt2.media_id = m.id
                 ), '[]'::jsonb)
               )
               ORDER BY m.is_main DESC,
                        m.position NULLS LAST,
                        m.created_at
             )
      FROM (
        SELECT DISTINCT ON (m.id)
          m.id, m.media_type_id, m.title, m.title_i18n, m.credit, m.url,
          m.is_main, m.visibility, m.position, m.width, m.height, m.created_at
        FROM media m
        WHERE m.object_id = obj.id
          AND m.is_published = TRUE
          AND (v_can_read_extended OR m.visibility IS NULL OR m.visibility = 'public')
          AND (m.org_object_id = v_prefer_org OR m.org_object_id IS NULL)
        ORDER BY 
          m.id,
          CASE WHEN m.org_object_id = v_prefer_org THEN 0 ELSE 1 END,
          m.is_main DESC,
          m.position NULLS LAST
      ) m
      JOIN ref_code_media_type mt ON mt.id = m.media_type_id
      ), '[]'::jsonb)
    );
  END IF;

  -- Capacity (enriched)
  IF v_fields IS NULL OR 'capacity' = ANY(v_fields) THEN
    js := js || jsonb_build_object(
      'capacity',
      COALESCE((
      SELECT jsonb_agg(
              jsonb_build_object(
                'metric_code', rm.code,
                'metric_name', COALESCE(api.i18n_get_text_strict('ref_capacity_metric', rm.id::text, 'name', lang, 'fr'), rm.name),
                'metric_description', COALESCE(api.i18n_get_text_strict('ref_capacity_metric', rm.id::text, 'description', lang, 'fr'), rm.description),
                'icon_url',    rm.icon_url,
                'value',       oc.value_integer,
                'unit',        oc.unit
              )
               ORDER BY rm.position NULLS LAST, rm.name, rm.code
             )
      FROM object_capacity oc
      JOIN ref_capacity_metric rm ON rm.id = oc.metric_id
      WHERE oc.object_id = obj.id
      ), '[]'::jsonb)
    );
  END IF;

  -- Amenities (enriched)
  -- disability_types: sourced from ref_amenity.extra->'disability_types' (acc_* codes only).
  -- Null for non-accessibility amenities — intentional; consumers treat absence as "not typed".
  IF v_fields IS NULL OR 'amenities' = ANY(v_fields) THEN
    js := js || jsonb_build_object(
      'amenities',
      COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'code',             ra.code,
                 'name',             COALESCE(api.i18n_pick_strict(ra.name_i18n, lang, 'fr'), ra.name),
                 'icon_url',         ra.icon_url,
                 'disability_types', ra.extra->'disability_types',
                 'family', jsonb_build_object(
                   'code',     rf.code,
                   'name',     COALESCE(api.i18n_pick_strict(rf.name_i18n, lang, 'fr'), rf.name),
                   'icon_url', rf.icon_url
                 )
               )
               ORDER BY rf.name, rf.code, ra.name, ra.code
             )
      FROM object_amenity oa
      JOIN ref_amenity ra ON ra.id = oa.amenity_id
      JOIN ref_code_amenity_family rf ON rf.id = ra.family_id
      WHERE oa.object_id = obj.id
      ), '[]'::jsonb)
    );
  END IF;

  -- Environment tags (enriched)
  IF v_fields IS NULL OR 'environment_tags' = ANY(v_fields) THEN
    js := js || jsonb_build_object(
      'environment_tags',
      COALESCE((
      SELECT jsonb_agg(
             jsonb_build_object(
               'code', et.code,
               'name', COALESCE(api.i18n_pick_strict(et.name_i18n, lang, 'fr'), et.name),
               'description', COALESCE(api.i18n_pick_strict(et.description_i18n, lang, 'fr'), et.description),
               'icon_url', et.icon_url
             )
               ORDER BY et.name, et.code
             )
      FROM object_environment_tag oet
      JOIN ref_code_environment_tag et ON et.id = oet.environment_tag_id
      WHERE oet.object_id = obj.id
      ), '[]'::jsonb)
    );
  END IF;

  -- Payment methods (enriched)
  IF v_fields IS NULL OR 'payment_methods' = ANY(v_fields) THEN
    js := js || jsonb_build_object(
      'payment_methods',
      COALESCE((
      SELECT jsonb_agg(
             jsonb_build_object(
               'code', pm.code,
               'name', COALESCE(api.i18n_pick_strict(pm.name_i18n, lang, 'fr'), pm.name),
               'description', COALESCE(api.i18n_pick_strict(pm.description_i18n, lang, 'fr'), pm.description),
               'icon_url', pm.icon_url
             )
               ORDER BY pm.name, pm.code
             )
      FROM object_payment_method opm
      JOIN ref_code_payment_method pm ON pm.id = opm.payment_method_id
      WHERE opm.object_id = obj.id
      ), '[]'::jsonb)
    );
  END IF;

  -- Pet policy (single)
  IF v_fields IS NULL OR 'pet_policy' = ANY(v_fields) THEN
    js := js || COALESCE((
      SELECT jsonb_build_object('pet_policy', to_jsonb(pp) - 'object_id')
      FROM object_pet_policy pp
      WHERE pp.object_id = obj.id
    ), '{}'::jsonb);
  END IF;

  -- Prices (enriched) + nested periods as JSON array
  IF v_fields IS NULL OR 'prices' = ANY(v_fields) THEN
    js := js || jsonb_build_object(
      'prices',
      COALESCE((
      SELECT jsonb_agg(
        (
          jsonb_build_object(
            'kind',       (SELECT jsonb_build_object('id', k.id, 'code', k.code, 'name', COALESCE(api.i18n_pick_strict(k.name_i18n, lang, 'fr'), k.name), 'description', COALESCE(api.i18n_pick_strict(k.description_i18n, lang, 'fr'), k.description), 'position', k.position, 'icon_url', k.icon_url) FROM ref_code_price_kind k WHERE k.id = p.kind_id),
            'unit',       (SELECT jsonb_build_object('id', u.id, 'code', u.code, 'name', COALESCE(api.i18n_pick_strict(u.name_i18n, lang, 'fr'), u.name), 'description', COALESCE(api.i18n_pick_strict(u.description_i18n, lang, 'fr'), u.description), 'position', u.position, 'icon_url', u.icon_url) FROM ref_code_price_unit u WHERE u.id = p.unit_id),
            'amount',     p.amount,
            'amount_max', p.amount_max,
            'currency',   p.currency,
            'valid_from', p.valid_from,
            'valid_to',   p.valid_to,
            'conditions', p.conditions
          )
          ||
          jsonb_build_object(
            'periods',
            COALESCE((
              SELECT jsonb_agg((to_jsonb(ppd) - 'price_id')
                       ORDER BY
                         ppd.start_date,
                         ppd.end_date,
                         NULLIF((to_jsonb(ppd)->>'id'),'') NULLS LAST,
                         ppd.ctid)
              FROM object_price_period ppd
              WHERE ppd.price_id IS NOT DISTINCT FROM p.id
            ), '[]'::jsonb)
          )
        )
        ORDER BY
          (SELECT code FROM ref_code_price_kind WHERE id = p.kind_id),
          (SELECT code FROM ref_code_price_unit WHERE id = p.unit_id),
          p.amount NULLS FIRST,
          p.valid_from NULLS FIRST,
          p.created_at,
          NULLIF((to_jsonb(p)->>'id'),'') NULLS LAST,
          p.ctid
      )
      FROM object_price p
      WHERE p.object_id = obj.id
      ), '[]'::jsonb)
    );
  END IF;

  -- Classifications (enriched)
  -- disability_types_covered: for LBL_TOURISME_HANDICAP rows only, resolves object_classification.subvalue_ids
  -- to disability type strings via ref_classification_value.metadata->>'disability_type'.
  -- Returns '[]' for all other schemes and for LBL_TOURISME_HANDICAP rows with no subvalue_ids populated.
  IF v_fields IS NULL OR 'classifications' = ANY(v_fields) THEN
    js := js || jsonb_build_object(
      'classifications',
      COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'scheme',                  (SELECT code FROM ref_classification_scheme s WHERE s.id = oc.scheme_id),
                 'scheme_name',             (SELECT name FROM ref_classification_scheme s WHERE s.id = oc.scheme_id),
                 'value',                   (SELECT code FROM ref_classification_value  v WHERE v.id = oc.value_id),
                 'value_name',              (SELECT name FROM ref_classification_value  v WHERE v.id = oc.value_id),
                 'awarded_at',              oc.awarded_at,
                 'valid_until',             oc.valid_until,
                 'status',                  oc.status,
                 'disability_types_covered', COALESCE((
                   SELECT jsonb_agg(cv2.metadata->>'disability_type' ORDER BY cv2.position NULLS LAST)
                   FROM ref_classification_scheme s2
                   CROSS JOIN unnest(oc.subvalue_ids) AS sv(uid)
                   JOIN ref_classification_value cv2 ON cv2.id = sv.uid
                   WHERE s2.id = oc.scheme_id
                     AND s2.code = 'LBL_TOURISME_HANDICAP'
                     AND cv2.metadata->>'disability_type' IS NOT NULL
                 ), '[]'::jsonb)
               )
               ORDER BY
                 (SELECT code FROM ref_classification_scheme s WHERE s.id = oc.scheme_id),
                 (SELECT code FROM ref_classification_value  v WHERE v.id = oc.value_id),
                 oc.awarded_at DESC NULLS LAST,
                 oc.created_at,
                 NULLIF((to_jsonb(oc)->>'id'),'') NULLS LAST,
                 oc.ctid
             )
      FROM object_classification oc
      WHERE oc.object_id = obj.id
      ), '[]'::jsonb)
    );
  END IF;

  -- Tags (enriched)
  IF v_fields IS NULL OR 'tags' = ANY(v_fields) THEN
    js := js || jsonb_build_object(
      'tags',
      COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object('slug', t.slug, 'name', t.name, 'color', t.color, 'icon', t.icon, 'icon_url', t.icon_url)
               ORDER BY t.name, t.slug
             )
      FROM tag_link tl
      JOIN ref_tag t ON t.id = tl.tag_id
      WHERE tl.target_table = 'object' AND tl.target_pk = obj.id
      ), '[]'::jsonb)
    );
  END IF;

  -- Discounts
  IF v_fields IS NULL OR 'discounts' = ANY(v_fields) THEN
    js := js || jsonb_build_object(
      'discounts',
      COALESCE((
      SELECT jsonb_agg(
        (to_jsonb(d) - 'object_id')
             ORDER BY
               NULLIF((to_jsonb(d)->>'created_at'),'')::timestamptz NULLS LAST,
               NULLIF((to_jsonb(d)->>'id'),'') NULLS LAST,
               d.ctid
      )
      FROM object_discount d
      WHERE d.object_id = obj.id
      ), '[]'::jsonb)
    );
  END IF;

  -- Group policies
  IF v_fields IS NULL OR 'group_policies' = ANY(v_fields) THEN
    js := js || jsonb_build_object(
      'group_policies',
      COALESCE((
      SELECT jsonb_agg(to_jsonb(gp) - 'object_id'
             ORDER BY
               NULLIF((to_jsonb(gp)->>'created_at'),'')::timestamptz NULLS LAST,
               gp.ctid)
      FROM object_group_policy gp
      WHERE gp.object_id = obj.id
      ), '[]'::jsonb)
    );
  END IF;

  -- Origins
  IF v_fields IS NULL OR 'origins' = ANY(v_fields) THEN
    js := js || jsonb_build_object(
      'origins',
      COALESCE((
      SELECT jsonb_agg(to_jsonb(og) - 'object_id'
             ORDER BY
               NULLIF((to_jsonb(og)->>'created_at'),'')::timestamptz NULLS LAST,
               NULLIF((to_jsonb(og)->>'id'),'') NULLS LAST,
               og.ctid)
      FROM object_origin og
      WHERE og.object_id = obj.id
      ), '[]'::jsonb)
    );
  END IF;

  -- Organization links
  IF v_fields IS NULL OR 'org_links' = ANY(v_fields) THEN
    js := js || jsonb_build_object(
      'org_links',
      COALESCE((
      SELECT jsonb_agg(to_jsonb(ol) - 'object_id'
             ORDER BY
               NULLIF((to_jsonb(ol)->>'role'),'') NULLS LAST,
               NULLIF((to_jsonb(ol)->>'name'),'') NULLS LAST,
               NULLIF((to_jsonb(ol)->>'created_at'),'')::timestamptz NULLS LAST,
               NULLIF((to_jsonb(ol)->>'id'),'') NULLS LAST,
               ol.ctid)
      FROM object_org_link ol
      WHERE ol.object_id = obj.id
      ), '[]'::jsonb)
    );
  END IF;

  -- Current membership snapshot (organization-level or object-level)
  IF v_fields IS NULL OR 'current_membership' = ANY(v_fields) THEN
    js := js || jsonb_build_object(
      'current_membership',
      (
        WITH linked_orgs AS (
          SELECT l.org_object_id
          FROM object_org_link l
          WHERE l.object_id = obj.id
        ),
        ranked_membership AS (
          SELECT
            m.id,
            m.org_object_id,
            m.object_id,
            m.campaign_id,
            camp.code AS campaign_code,
            camp.name AS campaign_name,
            m.tier_id,
            tier.code AS tier_code,
            tier.name AS tier_name,
            m.status,
            m.starts_at,
            m.ends_at,
            m.payment_date,
            m.metadata,
            m.updated_at
          FROM object_membership m
          LEFT JOIN ref_code_membership_campaign camp ON camp.id = m.campaign_id
          LEFT JOIN ref_code_membership_tier tier ON tier.id = m.tier_id
          WHERE (
              m.object_id = obj.id
              OR (m.object_id IS NULL AND m.org_object_id IN (SELECT org_object_id FROM linked_orgs))
            )
            AND m.status IN ('invoiced', 'paid')
            AND (m.starts_at IS NULL OR m.starts_at <= CURRENT_DATE)
            AND (m.ends_at IS NULL OR m.ends_at >= CURRENT_DATE)
          ORDER BY
            CASE m.status WHEN 'paid' THEN 0 ELSE 1 END,
            m.object_id NULLS LAST,
            m.ends_at DESC NULLS LAST,
            m.updated_at DESC
          LIMIT 1
        )
        SELECT to_jsonb(ranked_membership)
        FROM ranked_membership
      )
    );
  END IF;

  -- Actors (enriched with contacts)
  IF v_fields IS NULL OR 'actors' = ANY(v_fields) THEN
    js := js || jsonb_build_object(
      'actors',
      COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', a.id,
          'display_name', a.display_name,
          'first_name', a.first_name,
          'last_name', a.last_name,
          'gender', a.gender,
          'role', jsonb_build_object(
            'id', aor.role_id,
            'code', rar.code,
            'name', rar.name
          ),
          'is_primary', aor.is_primary,
          'valid_from', aor.valid_from,
          'valid_to', aor.valid_to,
          'visibility', aor.visibility,
          'note', aor.note,
          'contacts', COALESCE((
            SELECT jsonb_agg(
              jsonb_build_object(
                'id', ac.id,
                'kind', jsonb_build_object(
                  'code', rck.code,
                  'name', rck.name,
                  'description', rck.description,
                  'icon_url', rck.icon_url
                ),
                'value', ac.value,
                'is_primary', ac.is_primary,
                'role', jsonb_build_object(
                  'code', rcr.code,
                  'name', rcr.name
                ),
                'position', ac.position,
                'extra', ac.extra
              )
              ORDER BY ac.is_primary DESC, ac.position NULLS LAST, ac.created_at
            )
            FROM actor_channel ac
            JOIN ref_code_contact_kind rck ON rck.id = ac.kind_id
            LEFT JOIN ref_contact_role rcr ON rcr.id = ac.role_id
            WHERE ac.actor_id = a.id
          ), '[]'::jsonb)
        )
        ORDER BY aor.is_primary DESC, aor.valid_from DESC, a.display_name
      )
      FROM actor a
      JOIN actor_object_role aor ON aor.actor_id = a.id
      LEFT JOIN ref_actor_role rar ON rar.id = aor.role_id
      WHERE aor.object_id = obj.id
        AND (v_can_read_extended OR aor.visibility = 'public')
    ), '[]'::jsonb)
    );
  END IF;

  -- Legal records (enriched)
  IF v_fields IS NULL OR 'legal_records' = ANY(v_fields) THEN
    js := js || jsonb_build_object(
      'legal_records',
      COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', ol.id,
          'type', jsonb_build_object(
            'code', rlt.code,
            'name', rlt.name,
            'category', rlt.category,
            'is_public', rlt.is_public,
            'is_required', rlt.is_required
          ),
          'value', ol.value,
          'document_id', ol.document_id,
          'valid_from', ol.valid_from,
          'valid_to', ol.valid_to,
          'validity_mode', ol.validity_mode::text,
          'status', ol.status,
          'document_requested_at', ol.document_requested_at,
          'document_delivered_at', ol.document_delivered_at,
          'note', ol.note,
          'days_until_expiry', CASE 
            WHEN ol.valid_to IS NOT NULL THEN (ol.valid_to - CURRENT_DATE)::INTEGER
            ELSE NULL
          END
        )
        ORDER BY rlt.category, rlt.name, ol.valid_from DESC
      )
      FROM object_legal ol
      JOIN ref_legal_type rlt ON rlt.id = ol.type_id
      WHERE ol.object_id = obj.id
        AND (v_can_read_extended OR rlt.is_public = TRUE)
    ), '[]'::jsonb)
    );
  END IF;

  -- Meeting rooms (+ equipment)
  IF v_fields IS NULL OR 'meeting_rooms' = ANY(v_fields) THEN
    js := js || jsonb_build_object(
      'meeting_rooms',
      COALESCE((
      SELECT jsonb_agg(
               (to_jsonb(r) - 'object_id')
               ||
               jsonb_build_object(
                 'equipment', COALESCE((
                   SELECT jsonb_agg(
                            jsonb_build_object('code', e.code, 'name', e.name, 'icon_url', e.icon_url)
                            ORDER BY e.name, e.code
                          )
                   FROM meeting_room_equipment me
                   JOIN ref_code_meeting_equipment e ON e.id = me.equipment_id
                   WHERE me.room_id = r.id
                 ), '[]'::jsonb)
               )
               ORDER BY
                 NULLIF((to_jsonb(r)->>'position'),'')::int NULLS LAST,
                 NULLIF((to_jsonb(r)->>'name'),'') NULLS LAST,
                 NULLIF((to_jsonb(r)->>'created_at'),'')::timestamptz NULLS LAST,
                 NULLIF((to_jsonb(r)->>'id'),'') NULLS LAST,
                 r.ctid
             )
      FROM object_meeting_room r
      WHERE r.object_id = obj.id
      ), '[]'::jsonb)
    );
  END IF;

  -- FMA & occurrences
  IF v_fields IS NULL OR 'fma' = ANY(v_fields) THEN
    js := js || jsonb_build_object(
      'fma',
      COALESCE((
      SELECT jsonb_agg(
        (to_jsonb(f) - 'object_id')
             ORDER BY
               f.event_start_date NULLS LAST,
               f.event_start_time NULLS LAST,
               f.created_at,
               f.object_id)
      FROM object_fma f
      WHERE f.object_id = obj.id
      ), '[]'::jsonb)
    );
  END IF;

  IF v_fields IS NULL OR 'fma_occurrences' = ANY(v_fields) THEN
    js := js || jsonb_build_object(
      'fma_occurrences',
      COALESCE((
      SELECT jsonb_agg(to_jsonb(fo) - 'object_id'
             ORDER BY
               NULLIF((to_jsonb(fo)->>'start_at'),'')::timestamptz NULLS LAST,
               NULLIF((to_jsonb(fo)->>'created_at'),'')::timestamptz NULLS LAST,
               NULLIF((to_jsonb(fo)->>'id'),'') NULLS LAST,
               fo.ctid)
      FROM object_fma_occurrence fo
      WHERE fo.object_id = obj.id
      ), '[]'::jsonb)
    );
  END IF;

  -- Places + nested place_descriptions
  IF v_fields IS NULL OR 'places' = ANY(v_fields) THEN
    js := js || jsonb_build_object(
      'places',
      COALESCE((
      SELECT jsonb_agg(
               (to_jsonb(p) - 'object_id')
               ||
               jsonb_build_object(
                 'descriptions', COALESCE((
                   SELECT jsonb_agg((to_jsonb(pd) - 'place_id')
                            ORDER BY
                              NULLIF((to_jsonb(pd)->>'position'),'')::int NULLS LAST,
                              NULLIF((to_jsonb(pd)->>'language'),'') NULLS LAST,
                              NULLIF((to_jsonb(pd)->>'created_at'),'')::timestamptz NULLS LAST,
                              NULLIF((to_jsonb(pd)->>'id'),'') NULLS LAST,
                              pd.ctid)
                   FROM object_place_description pd
                   WHERE pd.place_id IS NOT DISTINCT FROM p.id
                     AND (v_can_read_extended OR pd.visibility IS NULL OR pd.visibility = 'public')
                 ), '[]'::jsonb),
                 'location', (
                   SELECT jsonb_build_object(
                     'latitude',   ol.latitude,
                     'longitude',  ol.longitude,
                     'altitude_m', ol.altitude_m,
                     'address1',   ol.address1,
                     'postcode',   ol.postcode,
                     'city',       ol.city,
                     'direction',  ol.direction
                   )
                   FROM object_location ol
                   WHERE ol.place_id = p.id
                   ORDER BY ol.created_at
                   LIMIT 1
                 )
               )
               ORDER BY
                 NULLIF((to_jsonb(p)->>'position'),'')::int NULLS LAST,
                 NULLIF((to_jsonb(p)->>'name'),'') NULLS LAST,
                 NULLIF((to_jsonb(p)->>'created_at'),'')::timestamptz NULLS LAST,
                 NULLIF((to_jsonb(p)->>'id'),'') NULLS LAST,
                 p.ctid
             )
      FROM object_place p
      WHERE p.object_id = obj.id
      ), '[]'::jsonb)
    );
  END IF;

  -- Sustainability: Full labels, actions, and their associations
  -- First, get all full labels the object has
  IF v_fields IS NULL OR 'sustainability_labels' = ANY(v_fields) THEN
    js := js || jsonb_build_object(
      'sustainability_labels',
      COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'scheme_code', sc.code,
                 'scheme_name', COALESCE(api.i18n_pick_strict(sc.name_i18n, lang, 'fr'), sc.name),
                 'value_code',  cv.code,
                 'value_name',  COALESCE(api.i18n_pick_strict(cv.name_i18n, lang, 'fr'), cv.name),
                 'value_id',    cv.id,
                 'parent_id',  cv.parent_id,
                 'awarded_at',  oc.awarded_at,
                 'valid_until', oc.valid_until,
                 'status',      oc.status,
                 'document_id', oc.document_id
               )
               ORDER BY sc.position NULLS LAST, cv.position NULLS LAST, cv.code
             )
      FROM object_classification oc
      JOIN ref_classification_scheme sc ON sc.id = oc.scheme_id
      JOIN ref_classification_value cv ON cv.id = oc.value_id
      WHERE oc.object_id = obj.id
      ), '[]'::jsonb)
    );
  END IF;

  -- Then, get all sustainability actions with their associated labels (if any)
  IF v_fields IS NULL OR 'sustainability_actions' = ANY(v_fields) THEN
    js := js || jsonb_build_object(
      'sustainability_actions',
      COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'object_action_id', sa.id,
                 'action', jsonb_build_object(
                   'code',       rsa.code,
                   'label',      COALESCE(api.i18n_pick_strict(rsa.label_i18n, lang, 'fr'), rsa.label),
                   'description',COALESCE(api.i18n_pick_strict(rsa.description_i18n, lang, 'fr'), rsa.description),
                   'icon_url',   rsa.icon_url,
                   'category', jsonb_build_object(
                     'code',       rac.code,
                     'name',       COALESCE(api.i18n_pick_strict(rac.name_i18n, lang, 'fr'), rac.name),
                     'description',COALESCE(api.i18n_pick_strict(rac.description_i18n, lang, 'fr'), rac.description),
                     'icon_url',   rac.icon_url,
                     'position',   rac.position
                   ),
                   'position',   rsa.position
                 ),
                 'associated_labels', COALESCE(
                   (SELECT jsonb_agg(
                     jsonb_build_object(
                       'scheme_code', sc2.code,
                       'scheme_name', COALESCE(api.i18n_pick_strict(sc2.name_i18n, lang, 'fr'), sc2.name),
                       'value_code',  cv2.code,
                       'value_name',  COALESCE(api.i18n_pick_strict(cv2.name_i18n, lang, 'fr'), cv2.name),
                       'value_id',    cv2.id,
                       'awarded_at',  oc2.awarded_at,
                       'valid_until', oc2.valid_until,
                       'status',      oc2.status
                     )
                     ORDER BY sc2.position NULLS LAST, cv2.position NULLS LAST
                   )
                   FROM object_sustainability_action_label sal2
                   JOIN object_classification oc2 ON oc2.id = sal2.object_classification_id
                   JOIN ref_classification_scheme sc2 ON sc2.id = oc2.scheme_id
                   JOIN ref_classification_value cv2 ON cv2.id = oc2.value_id
                   WHERE sal2.object_sustainability_action_id = sa.id),
                   '[]'::jsonb
                 ),
                 'note', sa.note,
                 'document_id', sa.document_id
               )
               ORDER BY rac.position NULLS LAST,
                        rsa.position NULLS LAST,
                        rsa.label
             )
      FROM object_sustainability_action sa
      JOIN ref_sustainability_action rsa ON rsa.id = sa.action_id
      JOIN ref_sustainability_action_category rac ON rac.id = rsa.category_id
      WHERE sa.object_id = obj.id
      ), '[]'::jsonb)
    );
  END IF;

  -- Legacy field for backward compatibility (actions linked to labels)
  IF v_fields IS NULL OR 'sustainability_action_labels' = ANY(v_fields) THEN
    js := js || jsonb_build_object(
      'sustainability_action_labels',
      COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'object_action_id', sa.id,
                 'action', jsonb_build_object(
                   'code',       rsa.code,
                   'label',      COALESCE(api.i18n_pick_strict(rsa.label_i18n, lang, 'fr'), rsa.label),
                   'description',COALESCE(api.i18n_pick_strict(rsa.description_i18n, lang, 'fr'), rsa.description),
                   'icon_url',   rsa.icon_url,
                   'category', jsonb_build_object(
                     'code',       rac.code,
                     'name',       COALESCE(api.i18n_pick_strict(rac.name_i18n, lang, 'fr'), rac.name),
                     'description',COALESCE(api.i18n_pick_strict(rac.description_i18n, lang, 'fr'), rac.description),
                     'icon_url',   rac.icon_url,
                     'position',   rac.position
                   ),
                   'position',   rsa.position
                 ),
                 'label', jsonb_build_object(
                   'scheme_code', sc.code,
                   'scheme_name', COALESCE(api.i18n_pick_strict(sc.name_i18n, lang, 'fr'), sc.name),
                   'value_code',  cv.code,
                   'value_name',  COALESCE(api.i18n_pick_strict(cv.name_i18n, lang, 'fr'), cv.name),
                   'awarded_at',  oc.awarded_at,
                   'valid_until', oc.valid_until,
                   'status',      oc.status
                 )
               )
               ORDER BY rac.position NULLS LAST,
                        rsa.position NULLS LAST,
                        rsa.label,
                        sc.code, cv.code
             )
      FROM object_sustainability_action_label sal
      JOIN object_sustainability_action sa
        ON sa.id = sal.object_sustainability_action_id
      JOIN ref_sustainability_action rsa
        ON rsa.id = sa.action_id
      JOIN ref_sustainability_action_category rac
        ON rac.id = rsa.category_id
      JOIN object_classification oc
        ON oc.id = sal.object_classification_id
      JOIN ref_classification_scheme sc
        ON sc.id = oc.scheme_id
      JOIN ref_classification_value  cv
        ON cv.id = oc.value_id
      WHERE sa.object_id = obj.id
      ), '[]'::jsonb)
    );
  END IF;

  -- ITI: details (info, profiles, practices, sections, stages(+media), associated objects)
  IF obj.object_type = 'ITI' THEN
    js := js ||
      jsonb_build_object('itinerary_details', jsonb_build_object(
        'info', COALESCE((
          SELECT to_jsonb(ii) - 'object_id'
          FROM object_iti_info ii
          WHERE ii.object_id = obj.id
        ), '{}'::jsonb),
        'profiles', COALESCE((
          SELECT jsonb_agg(to_jsonb(ip) - 'object_id'
                 ORDER BY
                   NULLIF((to_jsonb(ip)->>'position'),'')::int NULLS LAST,
                   NULLIF((to_jsonb(ip)->>'name'),'') NULLS LAST,
                   NULLIF((to_jsonb(ip)->>'created_at'),'')::timestamptz NULLS LAST,
                   NULLIF((to_jsonb(ip)->>'id'),'') NULLS LAST,
                   ip.ctid)
          FROM object_iti_profile ip
          WHERE ip.object_id = obj.id
        ), '[]'::jsonb),
        'practices', COALESCE((
          SELECT jsonb_agg(
                   jsonb_build_object('code', p.code, 'name', p.name, 'description', p.description, 'icon_url', p.icon_url)
                   ORDER BY p.name, p.code
                 )
          FROM object_iti_practice oip
          JOIN ref_code_iti_practice p ON p.id = oip.practice_id
          WHERE oip.object_id = obj.id
        ), '[]'::jsonb),
        'sections', COALESCE((
          SELECT jsonb_agg(to_jsonb(isec) - 'parent_object_id'
                 ORDER BY
                   NULLIF((to_jsonb(isec)->>'position'),'')::int NULLS LAST,
                   NULLIF((to_jsonb(isec)->>'name'),'') NULLS LAST,
                   NULLIF((to_jsonb(isec)->>'created_at'),'')::timestamptz NULLS LAST,
                   NULLIF((to_jsonb(isec)->>'id'),'') NULLS LAST,
                   isec.ctid)
          FROM object_iti_section isec
          WHERE isec.parent_object_id = obj.id
        ), '[]'::jsonb),
        'stages', COALESCE((
          SELECT jsonb_agg(
                   (to_jsonb(st) - 'object_id')
                   ||
                   jsonb_build_object(
                     'media', COALESCE((
                       SELECT jsonb_agg((to_jsonb(sm) - 'stage_id')
                                ORDER BY
                                  NULLIF((to_jsonb(sm)->>'position'),'')::int NULLS LAST,
                                  NULLIF((to_jsonb(sm)->>'created_at'),'')::timestamptz NULLS LAST,
                                  NULLIF((to_jsonb(sm)->>'id'),'') NULLS LAST,
                                  sm.ctid)
                       FROM object_iti_stage_media sm
                       WHERE sm.stage_id = st.id
                     ), '[]'::jsonb)
                   )
                   ORDER BY
                     NULLIF((to_jsonb(st)->>'position'),'')::int NULLS LAST,
                     NULLIF((to_jsonb(st)->>'name'),'') NULLS LAST,
                     NULLIF((to_jsonb(st)->>'created_at'),'')::timestamptz NULLS LAST,
                     NULLIF((to_jsonb(st)->>'id'),'') NULLS LAST,
                     st.ctid
                 )
          FROM object_iti_stage st
          WHERE st.object_id = obj.id
        ), '[]'::jsonb),
        'associated_objects', COALESCE((
          SELECT jsonb_agg(
                   (to_jsonb(ia) - 'object_id')
                   ||
                   jsonb_build_object(
                     'target', COALESCE((
                       SELECT jsonb_build_object('id', o2.id, 'type', o2.object_type::text, 'name', o2.name)
                       FROM object o2
                       WHERE o2.id = ia.associated_object_id
                     ), NULL)
                   )
                   ORDER BY
                     (SELECT o2.name FROM object o2 WHERE o2.id = ia.associated_object_id) NULLS LAST,
                     ia.created_at,
                     NULLIF((to_jsonb(ia)->>'id'),'') NULLS LAST,
                     ia.ctid
                 )
          FROM object_iti_associated_object ia
          WHERE ia.object_id = obj.id
        ), '[]'::jsonb)
      ));
  END IF;

  -- Relations (enriched)
  js := js || jsonb_build_object(
    'outgoing_relations', COALESCE((
        SELECT jsonb_agg(
                 (to_jsonb(r) - 'source_object_id')
                 ||
                 jsonb_build_object(
                   'target', COALESCE((
                     SELECT jsonb_build_object('id', o2.id, 'type', o2.object_type::text, 'name', o2.name)
                     FROM object o2 WHERE o2.id = r.target_object_id
                   ), NULL)
                 )
                 ORDER BY
                   (SELECT o2.name FROM object o2 WHERE o2.id = r.target_object_id) NULLS LAST,
                   r.created_at,
                   NULLIF((to_jsonb(r)->>'id'),'') NULLS LAST,
                   r.ctid
               )
        FROM object_relation r
        WHERE r.source_object_id = obj.id
      ), '[]'::jsonb),
    'incoming_relations', COALESCE((
        SELECT jsonb_agg(
                 (to_jsonb(r) - 'target_object_id')
                 ||
                 jsonb_build_object(
                   'source', COALESCE((
                     SELECT jsonb_build_object('id', o1.id, 'type', o1.object_type::text, 'name', o1.name)
                     FROM object o1 WHERE o1.id = r.source_object_id
                   ), NULL)
                 )
                 ORDER BY
                   (SELECT o1.name FROM object o1 WHERE o1.id = r.source_object_id) NULLS LAST,
                   r.created_at,
                   NULLIF((to_jsonb(r)->>'id'),'') NULLS LAST,
                   r.ctid
               )
        FROM object_relation r
        WHERE r.target_object_id = obj.id
      ), '[]'::jsonb)
  );

  -- ITI summary + optional track + status
  IF obj.object_type = 'ITI' THEN
    js := js || COALESCE((
      SELECT jsonb_build_object(
        'itinerary',
        jsonb_build_object(
          'distance_km',      i.distance_km,
          'duration_hours',   i.duration_hours,
          'difficulty_level', i.difficulty_level,
          'elevation_gain',   i.elevation_gain,
          'is_loop',          i.is_loop,
          'open_status',      i.open_status,
          'status_note',      i.status_note,
          'status_updated_at', i.status_updated_at,
          'status_document',  CASE 
            WHEN i.status_document_id IS NOT NULL THEN
              (SELECT jsonb_build_object(
                'id', d.id,
                'url', d.url,
                'title', COALESCE(api.i18n_pick_strict(d.title_i18n, lang, 'fr'), d.title),
                'issuer', COALESCE(api.i18n_pick_strict(d.issuer_i18n, lang, 'fr'), d.issuer),
                'valid_from', d.valid_from,
                'valid_to', d.valid_to
              )
              FROM ref_document d
              WHERE d.id = i.status_document_id)
            ELSE NULL
          END,
          'track',
            CASE WHEN v_fmt IN ('kml','gpx')
                 THEN CASE
                        WHEN v_inc = FALSE THEN
                          COALESCE(
                            CASE
                              WHEN v_fmt = 'gpx' THEN i.cached_gpx
                              WHEN v_fmt = 'kml' THEN i.cached_kml
                              ELSE NULL
                            END,
                            api.build_iti_track(obj.id, v_fmt, v_inc, v_color)
                          )
                        ELSE
                          api.build_iti_track(obj.id, v_fmt, v_inc, v_color)
                      END
                 ELSE NULL
            END,
          'track_format',
            CASE WHEN v_fmt IN ('kml','gpx') THEN v_fmt ELSE NULL END
        )
      )
      FROM object_iti i
      WHERE i.object_id = obj.id
    ), '{}'::jsonb);
  END IF;

  -- Menus (for RES and FMA)
  IF obj.object_type IN ('RES','FMA') THEN
    js := js || jsonb_build_object(
      'menus', COALESCE((
        SELECT jsonb_agg(
                 (
                   to_jsonb(m) - 'object_id'
                 )
                 ||
                 jsonb_build_object(
                   'cuisine_types', COALESCE((
                     SELECT jsonb_agg(
                       jsonb_build_object('id', ct.id, 'code', ct.code, 'name', ct.name, 'description', ct.description, 'position', ct.position)
                       ORDER BY ct.position, ct.name, ct.code
                     )
                     FROM (
                       SELECT DISTINCT ct.id, ct.code, ct.name, ct.description, ct.position
                       FROM object_menu_item mi2
                       JOIN object_menu_item_cuisine_type mct2 ON mct2.menu_item_id = mi2.id
                       JOIN ref_code_cuisine_type ct ON ct.id = mct2.cuisine_type_id
                       WHERE mi2.menu_id = m.id AND mi2.is_available = TRUE
                     ) ct
                   ), '[]'::jsonb),
                   'dietary_tags', COALESCE((
                     SELECT jsonb_agg(
                       jsonb_build_object('id', dt.id, 'code', dt.code, 'name', dt.name, 'description', dt.description, 'icon_url', dt.icon_url)
                       ORDER BY dt.name, dt.code
                     )
                     FROM (
                       SELECT DISTINCT dt.id, dt.code, dt.name, dt.description, dt.icon_url
                       FROM object_menu_item mi2
                       JOIN object_menu_item_dietary_tag mdt2 ON mdt2.menu_item_id = mi2.id
                       JOIN ref_code_dietary_tag dt ON dt.id = mdt2.dietary_tag_id
                       WHERE mi2.menu_id = m.id AND mi2.is_available = TRUE
                     ) dt
                   ), '[]'::jsonb),
                   'allergens', COALESCE((
                     SELECT jsonb_agg(
                       jsonb_build_object('id', al.id, 'code', al.code, 'name', al.name, 'description', al.description, 'icon_url', al.icon_url)
                       ORDER BY al.name, al.code
                     )
                     FROM (
                       SELECT DISTINCT al.id, al.code, al.name, al.description, al.icon_url
                       FROM object_menu_item mi2
                       JOIN object_menu_item_allergen mia2 ON mia2.menu_item_id = mi2.id
                       JOIN ref_code_allergen al ON al.id = mia2.allergen_id
                       WHERE mi2.menu_id = m.id AND mi2.is_available = TRUE
                     ) al
                   ), '[]'::jsonb),
                   'items', COALESCE((
                     SELECT jsonb_agg(
                              (
                                (to_jsonb(mi) - 'menu_id')
                              )
                              || jsonb_build_object(
                                   'category', (
                                     SELECT jsonb_build_object('id', c.id, 'code', c.code, 'name', c.name, 'description', c.description, 'position', c.position, 'icon_url', c.icon_url)
                                     FROM ref_code_menu_category c WHERE c.id = m.category_id
                                   ),
                                   'unit', (
                                     SELECT jsonb_build_object('id', u.id, 'code', u.code, 'name', u.name, 'position', u.position, 'icon_url', u.icon_url)
                                     FROM ref_code_price_unit u WHERE u.id = mi.unit_id
                                   ),
                                   'dietary_tags', COALESCE((
                                     SELECT jsonb_agg(jsonb_build_object('id', dt.id, 'code', dt.code, 'name', dt.name, 'description', dt.description, 'icon_url', dt.icon_url)
                                                      ORDER BY dt.name, dt.code)
                                     FROM object_menu_item_dietary_tag mdt
                                     JOIN ref_code_dietary_tag dt ON dt.id = mdt.dietary_tag_id
                                     WHERE mdt.menu_item_id = mi.id
                                   ), '[]'::jsonb),
                                   'allergens', COALESCE((
                                     SELECT jsonb_agg(jsonb_build_object('id', al.id, 'code', al.code, 'name', al.name, 'description', al.description, 'icon_url', al.icon_url)
                                                      ORDER BY al.name, al.code)
                                     FROM object_menu_item_allergen mia
                                     JOIN ref_code_allergen al ON al.id = mia.allergen_id
                                     WHERE mia.menu_item_id = mi.id
                                   ), '[]'::jsonb),
                                   'cuisine_types', COALESCE((
                                     SELECT jsonb_agg(jsonb_build_object('id', ct.id, 'code', ct.code, 'name', ct.name, 'description', ct.description, 'position', ct.position)
                                                      ORDER BY ct.position, ct.name, ct.code)
                                     FROM object_menu_item_cuisine_type mct
                                     JOIN ref_code_cuisine_type ct ON ct.id = mct.cuisine_type_id
                                     WHERE mct.menu_item_id = mi.id
                                   ), '[]'::jsonb),
                                   'media', COALESCE((
                                     SELECT jsonb_agg(
                                       jsonb_build_object(
                                         'id', m.id,
                                         'title', m.title,
                                         'description', m.description,
                                         'url', m.url,
                                         'credit', m.credit,
                                         'width', m.width,
                                         'height', m.height,
                                         'is_main', m.is_main,
                                         'is_published', m.is_published,
                                         'media_type', jsonb_build_object(
                                           'id', mt.id,
                                           'code', mt.code,
                                           'name', mt.name
                                         ),
                                         'position', mim.position
                                       )
                                       ORDER BY mim.position, m.position, m.created_at
                                     )
                                     FROM object_menu_item_media mim
                                     JOIN media m ON m.id = mim.media_id
                                     JOIN ref_code_media_type mt ON mt.id = m.media_type_id
                                     WHERE mim.menu_item_id = mi.id
                                       AND m.is_published = TRUE
                                      AND (v_can_read_extended OR m.visibility IS NULL OR m.visibility = 'public')
                                   ), '[]'::jsonb)
                              )
                              ORDER BY
                                mi.is_available DESC,
                                NULLIF((to_jsonb(mi)->>'position'),'')::int NULLS LAST,
                                (SELECT c2.position FROM ref_code_menu_category c2 WHERE c2.id = m.category_id) NULLS LAST,
                                NULLIF((to_jsonb(mi)->>'name'),'') NULLS LAST,
                                NULLIF((to_jsonb(mi)->>'created_at'),'')::timestamptz NULLS LAST,
                                NULLIF((to_jsonb(mi)->>'id'),'') NULLS LAST,
                                mi.ctid
                           )
                     FROM object_menu_item mi
                     WHERE mi.menu_id = m.id
                   ), '[]'::jsonb)
                 )
                 ORDER BY
                   m.is_active DESC,
                   NULLIF((to_jsonb(m)->>'position'),'')::int NULLS LAST,
                   NULLIF((to_jsonb(m)->>'name'),'') NULLS LAST,
                   NULLIF((to_jsonb(m)->>'created_at'),'')::timestamptz NULLS LAST,
                   NULLIF((to_jsonb(m)->>'id'),'') NULLS LAST,
                   m.ctid
               )
        FROM object_menu m
        WHERE m.object_id = obj.id
          AND (v_can_read_extended OR m.visibility IS NULL OR m.visibility = 'public')
      ), '[]'::jsonb)
    );

    -- Types de cuisine au niveau de l'objet (tous les menus de cet objet)
    js := js || jsonb_build_object(
      'cuisine_types', COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object('id', ct.id, 'code', ct.code, 'name', ct.name, 'description', ct.description, 'position', ct.position)
          ORDER BY ct.position, ct.name, ct.code
        )
        FROM (
          SELECT DISTINCT ct.id, ct.code, ct.name, ct.description, ct.position
          FROM object_menu m2
          JOIN object_menu_item mi2 ON mi2.menu_id = m2.id AND mi2.is_available = TRUE
          JOIN object_menu_item_cuisine_type mct2 ON mct2.menu_item_id = mi2.id
          JOIN ref_code_cuisine_type ct ON ct.id = mct2.cuisine_type_id
          WHERE m2.object_id = obj.id
            AND m2.is_active = TRUE
            AND (v_can_read_extended OR m2.visibility IS NULL OR m2.visibility = 'public')
        ) ct
      ), '[]'::jsonb),
      'dietary_tags', COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object('id', dt.id, 'code', dt.code, 'name', dt.name, 'description', dt.description, 'icon_url', dt.icon_url)
          ORDER BY dt.name, dt.code
        )
        FROM (
          SELECT DISTINCT dt.id, dt.code, dt.name, dt.description, dt.icon_url
          FROM object_menu m2
          JOIN object_menu_item mi2 ON mi2.menu_id = m2.id AND mi2.is_available = TRUE
          JOIN object_menu_item_dietary_tag mdt2 ON mdt2.menu_item_id = mi2.id
          JOIN ref_code_dietary_tag dt ON dt.id = mdt2.dietary_tag_id
          WHERE m2.object_id = obj.id
            AND m2.is_active = TRUE
            AND (v_can_read_extended OR m2.visibility IS NULL OR m2.visibility = 'public')
        ) dt
      ), '[]'::jsonb),
      'allergens', COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object('id', al.id, 'code', al.code, 'name', al.name, 'description', al.description, 'icon_url', al.icon_url)
          ORDER BY al.name, al.code
        )
        FROM (
          SELECT DISTINCT al.id, al.code, al.name, al.description, al.icon_url
          FROM object_menu m2
          JOIN object_menu_item mi2 ON mi2.menu_id = m2.id AND mi2.is_available = TRUE
          JOIN object_menu_item_allergen mia2 ON mia2.menu_item_id = mi2.id
          JOIN ref_code_allergen al ON al.id = mia2.allergen_id
          WHERE m2.object_id = obj.id
            AND m2.is_active = TRUE
            AND (v_can_read_extended OR m2.visibility IS NULL OR m2.visibility = 'public')
        ) al
      ), '[]'::jsonb)
    );
  END IF;

  -- Pour les événements (FMA), ajouter les types de cuisine des restaurants associés
  IF obj.object_type = 'FMA' THEN
    js := js || jsonb_build_object(
      'associated_restaurants_cuisine_types', COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object('id', ct.id, 'code', ct.code, 'name', ct.name, 'description', ct.description, 'position', ct.position)
          ORDER BY ct.position, ct.name, ct.code
        )
        FROM (
          SELECT DISTINCT ct.id, ct.code, ct.name, ct.description, ct.position
          FROM object_relation r
          JOIN ref_object_relation_type rt ON rt.id = r.relation_type_id
          JOIN object o_restaurant ON o_restaurant.id = r.target_object_id AND o_restaurant.object_type = 'RES'
          JOIN object_menu m ON m.object_id = o_restaurant.id
                             AND m.is_active = TRUE
                             AND (v_can_read_extended OR m.visibility IS NULL OR m.visibility = 'public')
          JOIN object_menu_item mi ON mi.menu_id = m.id AND mi.is_available = TRUE
          JOIN object_menu_item_cuisine_type mct ON mct.menu_item_id = mi.id
          JOIN ref_code_cuisine_type ct ON ct.id = mct.cuisine_type_id
          WHERE r.source_object_id = obj.id
            AND rt.code = 'partner_of'  -- restaurants partenaires
        ) ct
      ), '[]'::jsonb)
    );
  END IF;

  -- Opening times: build as pure JSON (not JSONB) to preserve field order
  SELECT json_build_object(
           'periods_next_year',
           COALESCE((
             SELECT json_agg(
                      api.build_opening_period_json(p.id, obj.id, p.date_start, p.date_end, p.period_order)
                      ORDER BY p.date_start NULLS FIRST, p.name, p.created_at
                    )
             FROM (
               SELECT
                 op.id,
                 op.date_start,
                 op.date_end,
                 op.name,
                 op.created_at,
                 ROW_NUMBER() OVER (ORDER BY op.date_start NULLS FIRST, op.name, op.created_at)::INT AS period_order
               FROM opening_period op
               WHERE op.object_id = obj.id
                 AND op.date_start >= CURRENT_DATE + INTERVAL '1 year'
             ) p
           ), '[]'::json),
           'periods_current',
           COALESCE((
             SELECT json_agg(
                      api.build_opening_period_json(p.id, obj.id, p.date_start, p.date_end, p.period_order)
                      ORDER BY p.date_start NULLS FIRST, p.name, p.created_at
                    )
             FROM (
               SELECT
                 op.id,
                 op.date_start,
                 op.date_end,
                 op.name,
                 op.created_at,
                 ROW_NUMBER() OVER (ORDER BY op.date_start NULLS FIRST, op.name, op.created_at)::INT AS period_order
               FROM opening_period op
               WHERE op.object_id = obj.id
                 AND (op.date_start < CURRENT_DATE + INTERVAL '1 year' OR op.date_start IS NULL)
             ) p
           ), '[]'::json)
         )
  INTO v_opening_times;

  IF v_render_enabled THEN
    v_render := jsonb_build_object(
      'lang', lower(split_part(v_render_locale, '-', 1)),
      'locale', v_render_locale,
      'timezone', v_render_tz,
      'version', v_render_version
    );

    -- Contacts
    IF v_fields IS NULL OR 'contacts' = ANY(v_fields) THEN
      SELECT jsonb_agg(to_jsonb(line_text) ORDER BY is_primary DESC, position NULLS LAST, created_at, ctid)
      INTO v_tmp_json
      FROM (
        SELECT 
          CASE WHEN rcr.code IS NOT NULL THEN COALESCE(api.i18n_pick(rc.name_i18n, lang, 'fr'), rc.name) || ' : ' || c.value || ' (' || rcr.code || ')'
               ELSE COALESCE(api.i18n_pick(rc.name_i18n, lang, 'fr'), rc.name) || ' : ' || c.value
          END AS line_text,
          c.is_primary,
          c.position,
          c.created_at,
          c.ctid
        FROM contact_channel c
        JOIN ref_code_contact_kind rc ON rc.id = c.kind_id
        LEFT JOIN ref_contact_role rcr ON rcr.id = c.role_id
        WHERE c.object_id = obj.id
      ) lines;
      v_render := v_render || jsonb_build_object('contact_lines', COALESCE(v_tmp_json, '[]'::jsonb));
    END IF;

    -- Media
    IF v_fields IS NULL OR 'media' = ANY(v_fields) THEN
      SELECT jsonb_agg(to_jsonb(line_text) ORDER BY is_main DESC, position NULLS LAST, created_at, ctid)
      INTO v_tmp_json
      FROM (
        SELECT 
          CASE 
            WHEN m.width IS NOT NULL AND m.height IS NOT NULL THEN
              COALESCE(api.i18n_pick(m.title_i18n, lang, 'fr'), m.title, COALESCE(api.i18n_pick(mt.name_i18n, lang, 'fr'), mt.name)) ||
              CASE WHEN m.credit IS NOT NULL THEN ' (' || m.credit || ')' ELSE '' END ||
              ' - ' || m.width || 'x' || m.height
            ELSE
              COALESCE(api.i18n_pick(m.title_i18n, lang, 'fr'), m.title, COALESCE(api.i18n_pick(mt.name_i18n, lang, 'fr'), mt.name)) ||
              CASE WHEN m.credit IS NOT NULL THEN ' (' || m.credit || ')' ELSE '' END
          END AS line_text,
          m.is_main,
          m.position,
          m.created_at,
          m.ctid
        FROM media m
        JOIN ref_code_media_type mt ON mt.id = m.media_type_id
        WHERE m.object_id = obj.id
          AND m.is_published = TRUE
          AND (v_can_read_extended OR m.visibility IS NULL OR m.visibility = 'public')
      ) lines;
      v_render := v_render || jsonb_build_object('media_lines', COALESCE(v_tmp_json, '[]'::jsonb));
    END IF;

    -- Capacity
    IF v_fields IS NULL OR 'capacity' = ANY(v_fields) THEN
      SELECT jsonb_agg(to_jsonb(line_text) ORDER BY rm_position NULLS LAST, metric_name, metric_code)
      INTO v_tmp_json
      FROM (
        SELECT 
          CASE 
            WHEN oc.value_integer IS NOT NULL THEN
              trim(
                BOTH ' '
                FROM COALESCE(oc.value_integer::text, '')
                  || ' '
                  || COALESCE(NULLIF(oc.unit, ''), '')
                  || CASE
                       WHEN COALESCE(NULLIF(oc.unit, ''), '') <> '' AND COALESCE(COALESCE(api.i18n_get_text('ref_capacity_metric', rm.id::text, 'name', lang, 'fr'), rm.name), '') <> '' THEN ' '
                       ELSE ''
                     END
                  || COALESCE(api.i18n_get_text('ref_capacity_metric', rm.id::text, 'name', lang, 'fr'), rm.name, '')
              )
            ELSE COALESCE(api.i18n_get_text('ref_capacity_metric', rm.id::text, 'name', lang, 'fr'), rm.name, '')
          END AS line_text,
          rm.position AS rm_position,
          COALESCE(api.i18n_get_text('ref_capacity_metric', rm.id::text, 'name', lang, 'fr'), rm.name) AS metric_name,
          rm.code AS metric_code
        FROM object_capacity oc
        JOIN ref_capacity_metric rm ON rm.id = oc.metric_id
        WHERE oc.object_id = obj.id
      ) lines;
      IF v_tmp_json IS NOT NULL THEN
        v_render := v_render || jsonb_build_object('capacity_lines', v_tmp_json);
      ELSE
        v_render := v_render || jsonb_build_object('capacity_lines', '[]'::jsonb);
      END IF;
    END IF;

    -- Amenities
    IF v_fields IS NULL OR 'amenities' = ANY(v_fields) THEN
      SELECT jsonb_agg(to_jsonb(line_text) ORDER BY family_name, family_code, amenity_name, amenity_code)
      INTO v_tmp_json
      FROM (
        SELECT 
          COALESCE(api.i18n_pick(ra.name_i18n, lang, 'fr'), ra.name) || ' (' || COALESCE(api.i18n_pick(rf.name_i18n, lang, 'fr'), rf.name) || ')' AS line_text,
          COALESCE(api.i18n_pick(rf.name_i18n, lang, 'fr'), rf.name) AS family_name,
          rf.code AS family_code,
          COALESCE(api.i18n_pick(ra.name_i18n, lang, 'fr'), ra.name) AS amenity_name,
          ra.code AS amenity_code
        FROM object_amenity oa
        JOIN ref_amenity ra ON ra.id = oa.amenity_id
        JOIN ref_code_amenity_family rf ON rf.id = ra.family_id
        WHERE oa.object_id = obj.id
      ) lines;
      v_render := v_render || jsonb_build_object('amenity_lines', COALESCE(v_tmp_json, '[]'::jsonb));
    END IF;

    -- Prices
    IF v_fields IS NULL OR 'prices' = ANY(v_fields) THEN
      SELECT jsonb_agg(to_jsonb(line_text) ORDER BY order_kind, order_unit, amount NULLS FIRST, valid_from NULLS FIRST, created_at, ctid)
      INTO v_tmp_json
      FROM (
        SELECT
          COALESCE(COALESCE(api.i18n_pick(k.name_i18n, lang, 'fr'), k.name), k.code, 'Tarif') || ' - ' ||
          COALESCE(
            CASE WHEN p.amount_max IS NOT NULL THEN
              api.render_format_currency(p.amount, p.currency, v_render_locale) || ' - ' ||
              api.render_format_currency(p.amount_max, p.currency, v_render_locale)
            ELSE
              api.render_format_currency(p.amount, p.currency, v_render_locale)
            END,
            ''
          ) ||
          CASE WHEN COALESCE(api.i18n_pick(u.name_i18n, lang, 'fr'), u.name) IS NOT NULL AND trim(COALESCE(api.i18n_pick(u.name_i18n, lang, 'fr'), u.name)) <> '' THEN ' ' || lower(COALESCE(api.i18n_pick(u.name_i18n, lang, 'fr'), u.name)) ELSE '' END ||
          CASE WHEN period_text IS NOT NULL THEN ' (' || period_text || ')' ELSE '' END ||
          CASE WHEN p.conditions IS NOT NULL THEN ' - ' || p.conditions ELSE '' END AS line_text,
          COALESCE(k.code, '') AS order_kind,
          COALESCE(u.code, '') AS order_unit,
          p.amount,
          p.valid_from,
          p.created_at,
          p.ctid,
          period_text
        FROM object_price p
        LEFT JOIN ref_code_price_kind k ON k.id = p.kind_id
        LEFT JOIN ref_code_price_unit u ON u.id = p.unit_id
        LEFT JOIN LATERAL (
          SELECT CASE WHEN COUNT(*) = 0 THEN NULL
                      ELSE 'valable ' || string_agg(api.render_format_date_range(ppd.start_date, ppd.end_date, v_render_locale), ' ; ')
                 END AS period_text
          FROM object_price_period ppd
          WHERE ppd.price_id IS NOT DISTINCT FROM p.id
        ) period ON TRUE
        WHERE p.object_id = obj.id
      ) lines;
      v_render := v_render || jsonb_build_object('price_lines', COALESCE(v_tmp_json, '[]'::jsonb));
    END IF;

    -- Classifications
    IF v_fields IS NULL OR 'classifications' = ANY(v_fields) THEN
      SELECT jsonb_agg(to_jsonb(line_text) ORDER BY scheme_code, value_code, awarded_at DESC NULLS LAST, created_at)
      INTO v_tmp_json
      FROM (
        SELECT
          COALESCE(sc.name, sc.code) || ' : ' || COALESCE(cv.name, cv.code) ||
          CASE WHEN oc.status IS NOT NULL THEN ' (' || oc.status || ')' ELSE '' END AS line_text,
          sc.code AS scheme_code,
          cv.code AS value_code,
          oc.awarded_at,
          oc.created_at
        FROM object_classification oc
        JOIN ref_classification_scheme sc ON sc.id = oc.scheme_id
        JOIN ref_classification_value cv ON cv.id = oc.value_id
        WHERE oc.object_id = obj.id
      ) lines;
      v_render := v_render || jsonb_build_object('classification_lines', COALESCE(v_tmp_json, '[]'::jsonb));
    END IF;

    -- Discounts
    IF v_fields IS NULL OR 'discounts' = ANY(v_fields) THEN
      SELECT jsonb_agg(to_jsonb(line_text) ORDER BY created_at, ctid)
      INTO v_tmp_json
      FROM (
        SELECT
          CASE 
            WHEN d.discount_percent IS NOT NULL THEN
              api.render_format_percent(d.discount_percent, v_render_locale) || ' de réduction' ||
              CASE WHEN d.conditions IS NOT NULL THEN ' (' || d.conditions || ')' ELSE '' END
            WHEN d.discount_amount IS NOT NULL THEN
              api.render_format_currency(d.discount_amount, d.currency, v_render_locale) || ' de réduction' ||
              CASE WHEN d.conditions IS NOT NULL THEN ' (' || d.conditions || ')' ELSE '' END
            ELSE COALESCE(d.conditions, 'Réduction disponible')
          END AS line_text,
          d.created_at,
          d.ctid
        FROM object_discount d
        WHERE d.object_id = obj.id
      ) lines;
      v_render := v_render || jsonb_build_object('discount_lines', COALESCE(v_tmp_json, '[]'::jsonb));
    END IF;

    -- Actors
    IF v_fields IS NULL OR 'actors' = ANY(v_fields) THEN
      SELECT jsonb_agg(to_jsonb(line_text) ORDER BY is_primary DESC, valid_from DESC, display_name)
      INTO v_tmp_json
      FROM (
        SELECT
          COALESCE(a.display_name, btrim(COALESCE(a.first_name, '') || ' ' || COALESCE(a.last_name, ''))) ||
          CASE WHEN rar.name IS NOT NULL THEN ' (' || rar.name || ')' ELSE '' END AS line_text,
          aor.is_primary,
          aor.valid_from,
          COALESCE(a.display_name, btrim(COALESCE(a.first_name, '') || ' ' || COALESCE(a.last_name, ''))) AS display_name
        FROM actor a
        JOIN actor_object_role aor ON aor.actor_id = a.id
        LEFT JOIN ref_actor_role rar ON rar.id = aor.role_id
        WHERE aor.object_id = obj.id
      ) lines;
      v_render := v_render || jsonb_build_object('actor_lines', COALESCE(v_tmp_json, '[]'::jsonb));
    END IF;

    -- Legal records
    IF v_fields IS NULL OR 'legal_records' = ANY(v_fields) THEN
      SELECT jsonb_agg(to_jsonb(line_text) ORDER BY category_name, type_name, valid_from DESC NULLS LAST)
      INTO v_tmp_json
      FROM (
        SELECT
          rlt.name ||
          CASE WHEN ol.value IS NOT NULL THEN ': ' ||
            CASE WHEN jsonb_typeof(ol.value) = 'string' THEN trim(both '"' from ol.value::text)
                 ELSE ol.value::text END
          ELSE '' END ||
          CASE WHEN ol.status IS NOT NULL THEN ' (' || ol.status || ')' ELSE '' END AS line_text,
          rlt.category AS category_name,
          rlt.name AS type_name,
          ol.valid_from
        FROM object_legal ol
        JOIN ref_legal_type rlt ON rlt.id = ol.type_id
        WHERE ol.object_id = obj.id
      ) lines;
      v_render := v_render || jsonb_build_object('legal_lines', COALESCE(v_tmp_json, '[]'::jsonb));
    END IF;

    -- Meeting rooms
    IF v_fields IS NULL OR 'meeting_rooms' = ANY(v_fields) THEN
      SELECT jsonb_agg(to_jsonb(line_text) ORDER BY position_order NULLS LAST, name_order, created_at, ctid)
      INTO v_tmp_json
      FROM (
        SELECT
          r.name ||
          CASE WHEN (r.cap_theatre IS NOT NULL OR r.cap_u IS NOT NULL OR r.cap_classroom IS NOT NULL OR r.cap_boardroom IS NOT NULL) THEN
            ' (' || array_to_string(
              array_remove(ARRAY[
                CASE WHEN r.cap_theatre   IS NOT NULL THEN 'Théâtre '   || r.cap_theatre::text END,
                CASE WHEN r.cap_u         IS NOT NULL THEN 'En U '       || r.cap_u::text END,
                CASE WHEN r.cap_classroom IS NOT NULL THEN 'Classe '     || r.cap_classroom::text END,
                CASE WHEN r.cap_boardroom IS NOT NULL THEN 'Boardroom '  || r.cap_boardroom::text END
              ], NULL), ', '
            ) || ')'
          ELSE '' END ||
          CASE WHEN EXISTS(SELECT 1 FROM meeting_room_equipment me WHERE me.room_id = r.id) THEN
            ' - Équipements: ' || (
              SELECT string_agg(e.name, ', ')
              FROM meeting_room_equipment me
              JOIN ref_code_meeting_equipment e ON e.id = me.equipment_id
              WHERE me.room_id = r.id
            )
          ELSE '' END AS line_text,
          NULLIF((to_jsonb(r)->>'position'),'')::int AS position_order,
          NULLIF((to_jsonb(r)->>'name'),'') AS name_order,
          NULLIF((to_jsonb(r)->>'created_at'),'')::timestamptz AS created_at,
          r.ctid
        FROM object_meeting_room r
        WHERE r.object_id = obj.id
      ) lines;
      v_render := v_render || jsonb_build_object('meeting_room_lines', COALESCE(v_tmp_json, '[]'::jsonb));
    END IF;

    -- FMA events
    IF v_fields IS NULL OR 'fma' = ANY(v_fields) THEN
      SELECT jsonb_agg(to_jsonb(line_text) ORDER BY start_date NULLS LAST, start_time NULLS LAST, created_at, object_id)
      INTO v_tmp_json
      FROM (
        SELECT
          'Événement : ' ||
          COALESCE(
            CASE 
              WHEN f.event_start_date IS NOT NULL AND f.event_end_date IS NOT NULL THEN
                api.render_format_date_range(f.event_start_date, f.event_end_date, v_render_locale)
              WHEN f.event_start_date IS NOT NULL THEN
                'à partir du ' || api.render_format_date(f.event_start_date, v_render_locale)
              WHEN f.event_end_date IS NOT NULL THEN
                'jusqu''au ' || api.render_format_date(f.event_end_date, v_render_locale)
              ELSE NULL
            END,
            ''
          ) ||
          CASE WHEN f.event_start_time IS NOT NULL AND f.event_end_time IS NOT NULL THEN
            ', ' || api.render_format_time(f.event_start_time, v_render_locale) || ' - ' || api.render_format_time(f.event_end_time, v_render_locale)
          WHEN f.event_start_time IS NOT NULL THEN
            ', ' || api.render_format_time(f.event_start_time, v_render_locale)
          WHEN f.event_end_time IS NOT NULL THEN
            ', ' || api.render_format_time(f.event_end_time, v_render_locale)
          ELSE '' END ||
          CASE WHEN f.is_recurring THEN ' (récurrent)' ELSE '' END ||
          CASE WHEN f.recurrence_pattern IS NOT NULL THEN ' [' || f.recurrence_pattern || ']' ELSE '' END AS line_text,
          f.event_start_date AS start_date,
          f.event_start_time AS start_time,
          f.created_at,
          f.object_id
        FROM object_fma f
        WHERE f.object_id = obj.id
      ) lines;
      v_render := v_render || jsonb_build_object('event_lines', COALESCE(v_tmp_json, '[]'::jsonb));
    END IF;

    -- FMA occurrences
    IF v_fields IS NULL OR 'fma_occurrences' = ANY(v_fields) THEN
      SELECT jsonb_agg(to_jsonb(line_text) ORDER BY start_at, end_at, ctid)
      INTO v_tmp_json
      FROM (
        SELECT
          api.render_format_datetime_range(fo.start_at, fo.end_at, v_render_locale, v_render_tz) AS line_text,
          fo.start_at,
          fo.end_at,
          fo.ctid
        FROM object_fma_occurrence fo
        WHERE fo.object_id = obj.id
      ) lines
      WHERE line_text IS NOT NULL;
      v_render := v_render || jsonb_build_object('event_occurrence_lines', COALESCE(v_tmp_json, '[]'::jsonb));
    END IF;

    -- Sustainability labels
    IF v_fields IS NULL OR 'sustainability_action_labels' = ANY(v_fields) THEN
      SELECT jsonb_agg(to_jsonb(line_text) ORDER BY category_pos NULLS LAST, action_pos NULLS LAST, action_label, scheme_code, value_code)
      INTO v_tmp_json
      FROM (
        SELECT
          rsa.label || ' - ' || cv.name || ' (' || sc.name || ')' ||
          CASE WHEN oc.status IS NOT NULL THEN ' - ' || oc.status ELSE '' END AS line_text,
          rac.position AS category_pos,
          rsa.position AS action_pos,
          rsa.label AS action_label,
          sc.code AS scheme_code,
          cv.code AS value_code
        FROM object_sustainability_action_label sal
        JOIN object_sustainability_action sa ON sa.id = sal.object_sustainability_action_id
        JOIN ref_sustainability_action rsa ON rsa.id = sa.action_id
        JOIN ref_sustainability_action_category rac ON rac.id = rsa.category_id
        JOIN object_classification oc ON oc.id = sal.object_classification_id
        JOIN ref_classification_scheme sc ON sc.id = oc.scheme_id
        JOIN ref_classification_value cv ON cv.id = oc.value_id
        WHERE sa.object_id = obj.id
      ) lines;
      v_render := v_render || jsonb_build_object('sustainability_lines', COALESCE(v_tmp_json, '[]'::jsonb));
    END IF;

    -- Menu items
    IF v_fields IS NULL OR 'menus' = ANY(v_fields) THEN
      SELECT jsonb_agg(to_jsonb(line_text) ORDER BY is_available DESC, position_order NULLS LAST, category_position NULLS LAST, name_order, created_at, ctid)
      INTO v_tmp_json
      FROM (
        SELECT
          mi.name ||
          CASE WHEN mi.price IS NOT NULL THEN
            ' - ' || api.render_format_currency(mi.price, mi.currency, v_render_locale) ||
            CASE WHEN u.name IS NOT NULL AND trim(u.name) <> '' THEN ' ' || lower(u.name) ELSE '' END
          ELSE '' END ||
          CASE WHEN mi.description IS NOT NULL THEN ' (' || LEFT(mi.description, 50) || '...)' ELSE '' END AS line_text,
          mi.is_available,
          NULLIF((to_jsonb(mi)->>'position'),'')::int AS position_order,
          (SELECT c2.position FROM ref_code_menu_category c2 WHERE c2.id = m.category_id) AS category_position,
          NULLIF((to_jsonb(mi)->>'name'),'') AS name_order,
          NULLIF((to_jsonb(mi)->>'created_at'),'')::timestamptz AS created_at,
          mi.ctid
        FROM object_menu m
        JOIN object_menu_item mi ON mi.menu_id = m.id
        LEFT JOIN ref_code_price_unit u ON u.id = mi.unit_id
        WHERE m.object_id = obj.id
          AND mi.is_available = TRUE
          AND (v_can_read_extended OR m.visibility IS NULL OR m.visibility = 'public')
      ) lines;
      v_render := v_render || jsonb_build_object('menu_item_lines', COALESCE(v_tmp_json, '[]'::jsonb));
    END IF;

    js := js || jsonb_build_object('render', v_render);
  END IF;

  -- Remove null values to shrink payload
  js := (
    SELECT jsonb_object_agg(key, value)
    FROM jsonb_each(js)
    WHERE value IS NOT NULL AND value != 'null'::jsonb
  );

  js := js || jsonb_build_object('opening_times', to_jsonb(v_opening_times));

  IF v_omit_empty THEN
    js := api.jsonb_prune_empty_top(js);
  END IF;

  -- Keep get_object_resource as orchestrator over specialized payload blocks.
  js := api.compose_object_resource_blocks(js);

  RETURN js::json;
END;
$$;

-- =====================================================
-- Publication export for print workflows (InDesign-ready)
-- =====================================================
CREATE OR REPLACE FUNCTION api.export_publication_indesign(
  p_publication_id UUID,
  p_min_width INTEGER DEFAULT 1600,
  p_min_height INTEGER DEFAULT 1200
)
RETURNS JSON
LANGUAGE sql
STABLE

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
  WITH rows AS (
    SELECT
      p.id AS publication_id,
      p.code AS publication_code,
      p.name AS publication_name,
      p.year AS publication_year,
      po.object_id,
      o.object_type::text AS object_type,
      o.name AS object_name,
      po.page_number,
      po.workflow_status,
      COALESCE(po.custom_print_text, od.description_edition, od.description) AS print_text,
      ol.address1,
      ol.postcode,
      ol.city,
      ol.latitude,
      ol.longitude,
      m.id AS media_id,
      m.url AS media_url,
      m.width AS media_width,
      m.height AS media_height,
      m.credit AS media_credit,
      m.title AS media_title
    FROM publication p
    JOIN publication_object po ON po.publication_id = p.id
    JOIN object o ON o.id = po.object_id
    LEFT JOIN LATERAL (
      SELECT d.*
      FROM object_description d
      WHERE d.object_id = o.id
      ORDER BY d.created_at DESC
      LIMIT 1
    ) od ON TRUE
    LEFT JOIN LATERAL (
      SELECT l.*
      FROM object_location l
      WHERE l.object_id = o.id
        AND l.is_main_location IS TRUE
      ORDER BY l.created_at ASC
      LIMIT 1
    ) ol ON TRUE
    LEFT JOIN LATERAL (
      SELECT m1.*
      FROM media m1
      WHERE m1.object_id = o.id
        AND m1.kind = 'asset'
        AND m1.is_published = TRUE
        AND COALESCE(m1.width, 0) >= GREATEST(p_min_width, 1)
        AND COALESCE(m1.height, 0) >= GREATEST(p_min_height, 1)
      ORDER BY m1.is_main DESC, m1.position NULLS LAST, m1.created_at DESC
      LIMIT 1
    ) m ON TRUE
    WHERE p.id = p_publication_id
  )
  SELECT COALESCE(
    json_agg(
      json_build_object(
        'publication_id', publication_id,
        'publication_code', publication_code,
        'publication_name', publication_name,
        'publication_year', publication_year,
        'object_id', object_id,
        'object_type', object_type,
        'object_name', object_name,
        'page_number', page_number,
        'workflow_status', workflow_status,
        'print_text', print_text,
        'address', json_build_object(
          'address1', address1,
          'postcode', postcode,
          'city', city
        ),
        'location', json_build_object(
          'latitude', latitude,
          'longitude', longitude
        ),
        'media', json_build_object(
          'id', media_id,
          'url', media_url,
          'width', media_width,
          'height', media_height,
          'credit', media_credit,
          'title', media_title
        )
      )
      ORDER BY page_number NULLS LAST, object_name
    ),
    '[]'::json
  )
  FROM rows;
$$;

-- =====================================================
-- Helper function to extract opening time slots for a specific day (legacy)
-- =====================================================
CREATE OR REPLACE FUNCTION api.get_opening_time_slots(
  p_period_id UUID,
  p_weekday_code TEXT,
  p_slot_number INTEGER DEFAULT 1
)
RETURNS JSONB
LANGUAGE sql
STABLE

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
  SELECT COALESCE(
    jsonb_build_object(
      'start', tf.start_time::text,
      'end', tf.end_time::text
    ),
    jsonb_build_object('start', NULL, 'end', NULL)
  )
  FROM opening_schedule s
  JOIN opening_time_period tp ON tp.schedule_id = s.id
  JOIN opening_time_period_weekday tpw ON tpw.time_period_id = tp.id
  JOIN ref_code_weekday wd ON wd.id = tpw.weekday_id
  JOIN opening_time_frame tf ON tf.time_period_id = tp.id
  WHERE s.period_id = p_period_id 
    AND wd.code = p_weekday_code 
    AND tf.start_time IS NOT NULL
  ORDER BY tf.start_time
  OFFSET (p_slot_number - 1) LIMIT 1;
$$;

-- =====================================================
-- Optimized function to get all opening time slots for a period
-- =====================================================
CREATE OR REPLACE FUNCTION api.get_all_opening_time_slots(p_period_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
  SELECT COALESCE(
    jsonb_object_agg(
      weekdays.code,
      COALESCE(
        jsonb_build_object(
          'slot1', jsonb_build_object(
            'start', slot1.start_time::text,
            'end', slot1.end_time::text
          ),
          'slot2', jsonb_build_object(
            'start', slot2.start_time::text,
            'end', slot2.end_time::text
          )
        ),
        jsonb_build_object(
          'slot1', jsonb_build_object('start', NULL, 'end', NULL),
          'slot2', jsonb_build_object('start', NULL, 'end', NULL)
        )
      )
    ),
    '{}'::jsonb
  )
  FROM (
    SELECT DISTINCT wd.code
    FROM opening_schedule s
    JOIN opening_time_period tp ON tp.schedule_id = s.id
    JOIN opening_time_period_weekday tpw ON tpw.time_period_id = tp.id
    JOIN ref_code_weekday wd ON wd.id = tpw.weekday_id
    WHERE s.period_id = p_period_id
  ) weekdays
  LEFT JOIN LATERAL (
    SELECT tf.start_time, tf.end_time
    FROM opening_schedule s
    JOIN opening_time_period tp ON tp.schedule_id = s.id
    JOIN opening_time_period_weekday tpw ON tpw.time_period_id = tp.id
    JOIN ref_code_weekday wd2 ON wd2.id = tpw.weekday_id
    JOIN opening_time_frame tf ON tf.time_period_id = tp.id
    WHERE s.period_id = p_period_id 
      AND wd2.code = weekdays.code
      AND tf.start_time IS NOT NULL
    ORDER BY tf.start_time
    LIMIT 1
  ) slot1 ON true
  LEFT JOIN LATERAL (
    SELECT tf.start_time, tf.end_time
    FROM opening_schedule s
    JOIN opening_time_period tp ON tp.schedule_id = s.id
    JOIN opening_time_period_weekday tpw ON tpw.time_period_id = tp.id
    JOIN ref_code_weekday wd2 ON wd2.id = tpw.weekday_id
    JOIN opening_time_frame tf ON tf.time_period_id = tp.id
    WHERE s.period_id = p_period_id 
      AND wd2.code = weekdays.code
      AND tf.start_time IS NOT NULL
    ORDER BY tf.start_time
    OFFSET 1 LIMIT 1
  ) slot2 ON true;
$$;

-- =====================================================
-- Optimized: get ALL opening time frames per weekday as arrays (unbounded)
-- =====================================================
CREATE OR REPLACE FUNCTION api.get_opening_slots_by_day(p_period_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
  WITH weekdays AS (
    SELECT id, code, position
    FROM ref_code_weekday
  )
  SELECT COALESCE(
    jsonb_object_agg(w.code, COALESCE(frames.slots, '[]'::jsonb) ORDER BY w.position),
    '{}'::jsonb
  )
  FROM weekdays w
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(
             jsonb_build_object(
               'start', tf.start_time::text,
               'end',   tf.end_time::text
             )
             ORDER BY tf.start_time
           ) AS slots
    FROM opening_schedule s
    JOIN opening_time_period tp          ON tp.schedule_id = s.id
    JOIN opening_time_period_weekday tpw ON tpw.time_period_id = tp.id
    JOIN opening_time_frame tf           ON tf.time_period_id = tp.id
    WHERE s.period_id = p_period_id
      AND tpw.weekday_id = w.id
      AND tf.start_time IS NOT NULL
  ) frames ON true;
$$;

-- =====================================================
-- 4) Endpoint : list_object_resources_page (curseur unifié)
--      - Listes : pas de track par défaut ('none')
--      - Options propagées via curseur (inchangé)
-- =====================================================
DROP FUNCTION IF EXISTS api.list_object_resources_page(TEXT, TEXT[], INTEGER, object_type[], object_status[], TEXT, TEXT, BOOLEAN, TEXT, BOOLEAN) CASCADE;
DROP FUNCTION IF EXISTS api.list_object_resources_page(TEXT, TEXT[], INTEGER, object_type[], object_status[], TEXT, TEXT, BOOLEAN, TEXT, BOOLEAN, TEXT) CASCADE;

CREATE OR REPLACE FUNCTION api.list_object_resources_page(
  p_cursor         TEXT DEFAULT NULL,
  p_lang_prefs     TEXT[] DEFAULT ARRAY['fr']::text[],
  p_page_size      INTEGER DEFAULT 50,
  p_types          object_type[] DEFAULT NULL,
  p_status         object_status[] DEFAULT ARRAY['published']::object_status[],
  p_search         TEXT DEFAULT NULL,
  p_track_format   TEXT DEFAULT 'none',
  p_include_stages BOOLEAN DEFAULT NULL,
  p_stage_color    TEXT DEFAULT NULL,
  p_omit_empty     BOOLEAN DEFAULT NULL,
  p_view           TEXT DEFAULT 'card'
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY INVOKER

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
DECLARE
  lang TEXT := api.pick_lang(p_lang_prefs);
  cur  JSONB;
  v_offset INTEGER := 0;
  v_limit  INTEGER := LEAST(GREATEST(COALESCE(p_page_size,50), 1), 200);
  v_types  object_type[] := p_types;
  v_status object_status[] := p_status;
  v_search TEXT := p_search;
  v_track  TEXT := lower(COALESCE(p_track_format,'none'));
  v_inc    BOOLEAN := p_include_stages;
  v_color  TEXT    := p_stage_color;
  total_count BIGINT;
  ids TEXT[];
  next_offset INTEGER;
  next_cursor TEXT;
  v_render_enabled BOOLEAN := TRUE;
  v_render_locale TEXT;
  v_render_tz TEXT := 'UTC';
  v_render_version TEXT := '1.0';
  v_omit_empty BOOLEAN := COALESCE(p_omit_empty, FALSE);
  v_view TEXT := lower(COALESCE(p_view, 'card'));
  v_current_cursor TEXT;
BEGIN
  v_render_locale := CASE
    WHEN lang IS NOT NULL AND position('-' IN lang) > 0 THEN lang
    WHEN lang IS NOT NULL AND char_length(lang) = 2 THEN lower(lang) || '-' || upper(lang)
    ELSE 'fr-FR'
  END;

  -- Lire le curseur si fourni (et surcharger les params)
  IF p_cursor IS NOT NULL THEN
    cur := api.cursor_unpack(p_cursor);
    IF cur ? 'offset' THEN v_offset := (cur->>'offset')::INT; END IF;
    IF cur ? 'page_size' THEN v_limit := (cur->>'page_size')::INT; END IF;
    IF cur ? 'types' THEN
      IF (cur->'types') IS NULL OR jsonb_typeof(cur->'types') <> 'array' THEN
        v_types := NULL;
      ELSE
        v_types := ARRAY(SELECT jsonb_array_elements_text(cur->'types'))::object_type[];
      END IF;
    END IF;
    IF cur ? 'status' THEN
      IF (cur->'status') IS NULL OR jsonb_typeof(cur->'status') <> 'array' THEN
        v_status := NULL;
      ELSE
        v_status := ARRAY(SELECT jsonb_array_elements_text(cur->'status'))::object_status[];
      END IF;
    END IF;
    IF cur ? 'search' THEN v_search := cur->>'search'; END IF;
    IF cur ? 'track_format' THEN v_track := lower(cur->>'track_format'); END IF;
    IF cur ? 'include_stages' THEN v_inc := (cur->>'include_stages')::boolean; END IF;
    IF cur ? 'stage_color' THEN v_color := cur->>'stage_color'; END IF;
    IF cur ? 'lang' THEN p_lang_prefs := ARRAY(SELECT jsonb_array_elements_text(cur->'lang')); lang := api.pick_lang(p_lang_prefs); END IF;
    IF cur ? 'render' THEN v_render_enabled := (cur->>'render')::boolean; END IF;
    IF cur ? 'render_locale' THEN v_render_locale := cur->>'render_locale'; END IF;
    IF cur ? 'render_tz' THEN v_render_tz := cur->>'render_tz'; END IF;
    IF cur ? 'render_version' THEN v_render_version := cur->>'render_version'; END IF;
    IF cur ? 'omit_empty' THEN v_omit_empty := (cur->>'omit_empty')::boolean; END IF;
    IF cur ? 'view' THEN v_view := lower(cur->>'view'); END IF;
  END IF;

  IF v_status IS NULL THEN
    v_status := ARRAY['published']::object_status[];
  END IF;

  IF v_view NOT IN ('card', 'full') THEN
    v_view := 'card';
  END IF;

  IF v_render_locale IS NULL OR v_render_locale = '' THEN
    v_render_locale := CASE
      WHEN lang IS NOT NULL AND position('-' IN lang) > 0 THEN lang
      WHEN lang IS NOT NULL AND char_length(lang) = 2 THEN lower(lang) || '-' || upper(lang)
      ELSE 'fr-FR'
    END;
  END IF;

  v_render_locale := lower(split_part(v_render_locale, '-', 1)) || '-' ||
                     upper(CASE WHEN position('-' IN v_render_locale) > 0 THEN split_part(v_render_locale, '-', 2)
                                ELSE split_part(v_render_locale, '-', 1) END);

  -- Total
  SELECT COUNT(*) INTO total_count
  FROM object o
  WHERE (v_types IS NULL OR o.object_type = ANY(v_types))
    AND (v_status IS NULL OR o.status = ANY(v_status))
    AND (v_search IS NULL OR o.name_search_vector @@ plainto_tsquery('french', api.norm_search(v_search)));

  -- Page d'ids
  SELECT ARRAY(
    SELECT o.id
    FROM object o
    WHERE (v_types IS NULL OR o.object_type = ANY(v_types))
      AND (v_status IS NULL OR o.status = ANY(v_status))
      AND (v_search IS NULL OR o.name_search_vector @@ plainto_tsquery('french', api.norm_search(v_search)))
    ORDER BY o.id
    OFFSET v_offset
    LIMIT v_limit
  ) INTO ids;

  -- Next cursor si on a rempli la page
  IF array_length(ids,1) = v_limit THEN
    next_offset := v_offset + v_limit;
    next_cursor := api.cursor_pack(api.json_clean(jsonb_strip_nulls(jsonb_build_object(
      'kind','page',
      'offset', next_offset,
      'page_size', v_limit,
      'types', CASE WHEN v_types IS NULL THEN NULL ELSE to_jsonb(v_types) END,
      'status', CASE WHEN v_status IS NULL THEN NULL ELSE to_jsonb(v_status) END,
      'search', v_search,
      'track_format', v_track,
      'include_stages', v_inc,
      'stage_color', v_color,
      'omit_empty', v_omit_empty,
      'view', v_view,
      'lang', to_jsonb(p_lang_prefs),
      'render', v_render_enabled,
      'render_locale', v_render_locale,
      'render_tz', v_render_tz,
      'render_version', v_render_version
    ))));
  END IF;

  v_current_cursor := api.cursor_pack(api.json_clean(jsonb_strip_nulls(jsonb_build_object(
    'kind','page',
    'offset', v_offset,
    'page_size', v_limit,
    'types', CASE WHEN v_types IS NULL THEN NULL ELSE to_jsonb(v_types) END,
    'status', CASE WHEN v_status IS NULL THEN NULL ELSE to_jsonb(v_status) END,
    'search', v_search,
    'track_format', v_track,
    'include_stages', v_inc,
    'stage_color', v_color,
    'omit_empty', v_omit_empty,
    'view', v_view,
    'lang', to_jsonb(p_lang_prefs),
    'render', v_render_enabled,
    'render_locale', v_render_locale,
    'render_tz', v_render_tz,
    'render_version', v_render_version
  ))));

  RETURN json_build_object(
    'meta', json_build_object(
      'kind','page',
      'language', lang,
      'language_fallbacks', p_lang_prefs,
      'page_size', v_limit,
      'offset', v_offset,
      'total', total_count,
      'schema_version', '3.0',
      'render_locale', v_render_locale,
      'render_tz', v_render_tz,
      'render_version', v_render_version,
      'cursor', v_current_cursor,
      'next_cursor', next_cursor
    ),
    'data', CASE
      WHEN v_view = 'full' THEN
        api.get_object_resources_batch(
          ids,
          p_lang_prefs,
          v_track,
          jsonb_build_object(
            'include_stages', v_inc,
            'stage_color', v_color,
            'render', v_render_enabled,
            'render_locale', v_render_locale,
            'render_tz', v_render_tz,
            'render_version', v_render_version,
            'omit_empty', v_omit_empty
          )
        )
      ELSE
        api.get_object_cards_batch(ids, p_lang_prefs)
    END
  );
END;
$$;



-- Convenience alias: accept TEXT[] for p_types/p_status (page)
DROP FUNCTION IF EXISTS api.list_object_resources_page_text(TEXT, TEXT[], INTEGER, TEXT[], TEXT[], TEXT, TEXT, BOOLEAN, TEXT, BOOLEAN) CASCADE;
DROP FUNCTION IF EXISTS api.list_object_resources_page_text(TEXT, TEXT[], INTEGER, TEXT[], TEXT[], TEXT, TEXT, BOOLEAN, TEXT, BOOLEAN, TEXT) CASCADE;
CREATE OR REPLACE FUNCTION api.list_object_resources_page_text(
  p_cursor         TEXT DEFAULT NULL,
  p_lang_prefs     TEXT[] DEFAULT ARRAY['fr']::text[],
  p_page_size      INTEGER DEFAULT 50,
  p_types          TEXT[] DEFAULT NULL,
  p_status         TEXT[] DEFAULT ARRAY['published']::text[],
  p_search         TEXT DEFAULT NULL,
  p_track_format   TEXT DEFAULT 'none',
  p_include_stages BOOLEAN DEFAULT NULL,
  p_stage_color    TEXT DEFAULT NULL,
  p_omit_empty     BOOLEAN DEFAULT NULL,
  p_view           TEXT DEFAULT 'card'
)
RETURNS JSON
LANGUAGE plpgsql
STABLE

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
BEGIN
  RETURN api.list_object_resources_page(
    p_cursor,
    p_lang_prefs,
    p_page_size,
    CASE WHEN p_types IS NULL THEN NULL ELSE ARRAY(SELECT t::object_type FROM unnest(p_types) AS t) END,
    CASE WHEN p_status IS NULL THEN NULL ELSE ARRAY(SELECT s::object_status FROM unnest(p_status) AS s) END,
    p_search,
    p_track_format,
    p_include_stages,
    p_stage_color,
    p_omit_empty,
    p_view
  );
END;
$$;

-- =====================================================
-- 5) Endpoint : list_object_resources_since_fast (keyset)
--      - Listes : pas de track par défaut ('none')
--      - Options propagées via curseur (inchangé)
-- =====================================================
DROP FUNCTION IF EXISTS api.list_object_resources_since_fast(timestamptz, TEXT, boolean, TEXT[], integer, object_type[], object_status[], TEXT, TEXT, BOOLEAN, TEXT) CASCADE;
DROP FUNCTION IF EXISTS api.list_object_resources_since_fast(timestamptz, TEXT, boolean, TEXT[], integer, object_type[], object_status[], TEXT, TEXT, BOOLEAN, TEXT, TEXT) CASCADE;

CREATE OR REPLACE FUNCTION api.list_object_resources_since_fast(
  p_since          TIMESTAMPTZ,
  p_cursor         TEXT DEFAULT NULL,
  p_use_source     BOOLEAN DEFAULT FALSE,
  p_lang_prefs     TEXT[] DEFAULT ARRAY['fr']::text[],
  p_limit          INTEGER DEFAULT 50,
  p_types          object_type[] DEFAULT NULL,
  p_status         object_status[] DEFAULT ARRAY['published']::object_status[],
  p_search         TEXT DEFAULT NULL,
  p_track_format   TEXT DEFAULT 'none',
  p_include_stages BOOLEAN DEFAULT NULL,
  p_stage_color    TEXT DEFAULT NULL,
  p_view           TEXT DEFAULT 'card'
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY INVOKER

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
DECLARE
  lang TEXT := api.pick_lang(p_lang_prefs);
  cur  JSONB;
  v_use_source BOOLEAN := COALESCE(p_use_source, FALSE);
  v_limit  INTEGER := LEAST(GREATEST(COALESCE(p_limit,50), 1), 200);
  v_types  object_type[] := p_types;
  v_status object_status[] := p_status;
  v_search TEXT := p_search;
  v_track  TEXT := lower(COALESCE(p_track_format,'none'));
  v_inc    BOOLEAN := p_include_stages;
  v_color  TEXT    := p_stage_color;
  last_ts TIMESTAMPTZ := NULL;
  last_id TEXT := NULL;
  ids TEXT[];
  next_cursor TEXT;
  v_render_enabled BOOLEAN := TRUE;
  v_render_locale TEXT := NULL;
  v_render_tz TEXT := 'UTC';
  v_render_version TEXT := '1.0';
  v_view TEXT := lower(COALESCE(p_view, 'card'));
  v_current_cursor TEXT;
BEGIN
  v_render_locale := CASE
    WHEN lang IS NOT NULL AND position('-' IN lang) > 0 THEN lang
    WHEN lang IS NOT NULL AND char_length(lang) = 2 THEN lower(lang) || '-' || upper(lang)
    ELSE 'fr-FR'
  END;

  v_render_locale := lower(split_part(v_render_locale, '-', 1)) || '-' ||
                     upper(CASE WHEN position('-' IN v_render_locale) > 0 THEN split_part(v_render_locale, '-', 2)
                                ELSE split_part(v_render_locale, '-', 1) END);

  IF p_cursor IS NOT NULL THEN
    cur := api.cursor_unpack(p_cursor);
    IF cur ? 'use_source'   THEN v_use_source := (cur->>'use_source')::boolean; END IF;
    IF cur ? 'limit'        THEN v_limit := (cur->>'limit')::int; END IF;
    IF cur ? 'types'        THEN
      IF (cur->'types') IS NULL OR jsonb_typeof(cur->'types') <> 'array' THEN
        v_types := NULL;
      ELSE
        v_types := ARRAY(SELECT jsonb_array_elements_text(cur->'types'))::object_type[];
      END IF;
    END IF;
    IF cur ? 'status'       THEN
      IF (cur->'status') IS NULL OR jsonb_typeof(cur->'status') <> 'array' THEN
        v_status := NULL;
      ELSE
        v_status := ARRAY(SELECT jsonb_array_elements_text(cur->'status'))::object_status[];
      END IF;
    END IF;
    IF cur ? 'search'       THEN v_search := cur->>'search'; END IF;
    IF cur ? 'track_format' THEN v_track := lower(cur->>'track_format'); END IF;
    IF cur ? 'include_stages' THEN v_inc := (cur->>'include_stages')::boolean; END IF;
    IF cur ? 'stage_color' THEN v_color := cur->>'stage_color'; END IF;
    IF cur ? 'lang'         THEN p_lang_prefs := ARRAY(SELECT jsonb_array_elements_text(cur->'lang')); lang := api.pick_lang(p_lang_prefs); END IF;
    IF cur ? 'render'       THEN v_render_enabled := (cur->>'render')::boolean; END IF;
    IF cur ? 'render_locale' THEN v_render_locale := cur->>'render_locale'; END IF;
    IF cur ? 'render_tz'    THEN v_render_tz := cur->>'render_tz'; END IF;
    IF cur ? 'render_version' THEN v_render_version := cur->>'render_version'; END IF;
    IF cur ? 'since'        THEN p_since := (cur->>'since')::timestamptz; END IF;
    IF cur ? 'last_ts'      THEN last_ts := (cur->>'last_ts')::timestamptz; END IF;
    IF cur ? 'last_id'      THEN last_id := cur->>'last_id'; END IF;
    IF cur ? 'view'         THEN v_view := lower(cur->>'view'); END IF;
  END IF;

  IF v_status IS NULL THEN
    v_status := ARRAY['published']::object_status[];
  END IF;

  IF v_view NOT IN ('card', 'full') THEN
    v_view := 'card';
  END IF;

  IF v_render_locale IS NULL OR v_render_locale = '' THEN
    v_render_locale := CASE
      WHEN lang IS NOT NULL AND position('-' IN lang) > 0 THEN lang
      WHEN lang IS NOT NULL AND char_length(lang) = 2 THEN lower(lang) || '-' || upper(lang)
      ELSE 'fr-FR'
    END;
    v_render_locale := lower(split_part(v_render_locale, '-', 1)) || '-' ||
                       upper(CASE WHEN position('-' IN v_render_locale) > 0 THEN split_part(v_render_locale, '-', 2)
                                  ELSE split_part(v_render_locale, '-', 1) END);
  END IF;

  IF v_use_source THEN
    SELECT ARRAY(
      SELECT o.id
      FROM object o
      WHERE (v_types IS NULL OR o.object_type = ANY(v_types))
        AND (v_status IS NULL OR o.status = ANY(v_status))
        AND (v_search IS NULL OR o.name_search_vector @@ plainto_tsquery('french', api.norm_search(v_search)))
        AND o.updated_at_source >= p_since
        AND (last_ts IS NULL OR (o.updated_at_source, o.id) > (last_ts, last_id))
      ORDER BY o.updated_at_source ASC, o.id ASC
      LIMIT v_limit
    ) INTO ids;
  ELSE
    SELECT ARRAY(
      SELECT o.id
      FROM object o
      WHERE (v_types IS NULL OR o.object_type = ANY(v_types))
        AND (v_status IS NULL OR o.status = ANY(v_status))
        AND (v_search IS NULL OR o.name_search_vector @@ plainto_tsquery('french', api.norm_search(v_search)))
        AND o.updated_at >= p_since
        AND (last_ts IS NULL OR (o.updated_at, o.id) > (last_ts, last_id))
      ORDER BY o.updated_at ASC, o.id ASC
      LIMIT v_limit
    ) INTO ids;
  END IF;

  -- Next cursor si page pleine
  IF array_length(ids,1) = v_limit THEN
    IF v_use_source THEN
      SELECT o.updated_at_source, o.id INTO last_ts, last_id
      FROM object o WHERE o.id = ids[v_limit];
    ELSE
      SELECT o.updated_at, o.id INTO last_ts, last_id
      FROM object o WHERE o.id = ids[v_limit];
    END IF;

    next_cursor := api.cursor_pack(api.json_clean(jsonb_strip_nulls(jsonb_build_object(
      'kind','since',
      'since', to_char(p_since AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'use_source', v_use_source,
      'last_ts', to_char(last_ts AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'last_id', last_id,
      'limit', v_limit,
      'types', CASE WHEN v_types IS NULL THEN NULL ELSE to_jsonb(v_types) END,
      'status', CASE WHEN v_status IS NULL THEN NULL ELSE to_jsonb(v_status) END,
      'search', v_search,
      'track_format', v_track,
      'include_stages', v_inc,
      'stage_color', v_color,
      'view', v_view,
      'lang', to_jsonb(p_lang_prefs),
      'render', v_render_enabled,
      'render_locale', v_render_locale,
      'render_tz', v_render_tz,
      'render_version', v_render_version
    ))));
  END IF;

  v_current_cursor := api.cursor_pack(api.json_clean(jsonb_strip_nulls(jsonb_build_object(
    'kind','since',
    'since', to_char(p_since AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'use_source', v_use_source,
    'last_ts', CASE WHEN last_ts IS NULL THEN NULL ELSE to_char(last_ts AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') END,
    'last_id', last_id,
    'limit', v_limit,
    'types', CASE WHEN v_types IS NULL THEN NULL ELSE to_jsonb(v_types) END,
    'status', CASE WHEN v_status IS NULL THEN NULL ELSE to_jsonb(v_status) END,
    'search', v_search,
    'track_format', v_track,
    'include_stages', v_inc,
    'stage_color', v_color,
    'view', v_view,
    'lang', to_jsonb(p_lang_prefs),
    'render', v_render_enabled,
    'render_locale', v_render_locale,
    'render_tz', v_render_tz,
    'render_version', v_render_version
  ))));

  RETURN json_build_object(
    'meta', json_build_object(
      'kind','since',
      'language', lang,
      'language_fallbacks', p_lang_prefs,
      'since', p_since,
      'use_source', v_use_source,
      'limit', v_limit,
      'count', array_length(ids,1),
      'schema_version', '3.0',
      'render_locale', v_render_locale,
      'render_tz', v_render_tz,
      'render_version', v_render_version,
      'cursor', v_current_cursor,
      'next_cursor', next_cursor
    ),
    'data', CASE
      WHEN v_view = 'full' THEN
        api.get_object_resources_batch(
          ids,
          p_lang_prefs,
          v_track,
          jsonb_build_object(
            'include_stages', v_inc,
            'stage_color', v_color,
            'render', v_render_enabled,
            'render_locale', v_render_locale,
            'render_tz', v_render_tz,
            'render_version', v_render_version
          )
        )
      ELSE
        api.get_object_cards_batch(ids, p_lang_prefs)
    END
  );
END;
$$;



-- Convenience alias: accept TEXT[] for p_types/p_status (since)
DROP FUNCTION IF EXISTS api.list_object_resources_since_fast_text(timestamptz, TEXT, boolean, TEXT[], integer, TEXT[], TEXT[], TEXT, TEXT, BOOLEAN, TEXT) CASCADE;
DROP FUNCTION IF EXISTS api.list_object_resources_since_fast_text(timestamptz, TEXT, boolean, TEXT[], integer, TEXT[], TEXT[], TEXT, TEXT, BOOLEAN, TEXT, TEXT) CASCADE;
CREATE OR REPLACE FUNCTION api.list_object_resources_since_fast_text(
  p_since          TIMESTAMPTZ,
  p_cursor         TEXT DEFAULT NULL,
  p_use_source     BOOLEAN DEFAULT FALSE,
  p_lang_prefs     TEXT[] DEFAULT ARRAY['fr']::text[],
  p_limit          INTEGER DEFAULT 50,
  p_types          TEXT[] DEFAULT NULL,
  p_status         TEXT[] DEFAULT ARRAY['published']::text[],
  p_search         TEXT DEFAULT NULL,
  p_track_format   TEXT DEFAULT 'none',
  p_include_stages BOOLEAN DEFAULT NULL,
  p_stage_color    TEXT DEFAULT NULL,
  p_view           TEXT DEFAULT 'card'
)
RETURNS JSON
LANGUAGE plpgsql
STABLE

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
BEGIN
  RETURN api.list_object_resources_since_fast(
    p_since,
    p_cursor,
    p_use_source,
    p_lang_prefs,
    p_limit,
    CASE WHEN p_types IS NULL THEN NULL ELSE ARRAY(SELECT t::object_type FROM unnest(p_types) AS t) END,
    CASE WHEN p_status IS NULL THEN NULL ELSE ARRAY(SELECT s::object_status FROM unnest(p_status) AS s) END,
    p_search,
    p_track_format,
    p_include_stages,
    p_stage_color,
    p_view
  );
END;
$$;

-- =====================================================
-- 6) Endpoints filtrés (p_filters JSONB) — page-based
--      - Listes : pas de track par défaut ('none')
--      - Options propagées via curseur (inchangé)
-- =====================================================
DROP FUNCTION IF EXISTS api.list_object_resources_filtered_page(TEXT, TEXT[], INTEGER, JSONB, object_type[], object_status[], TEXT, TEXT, BOOLEAN, TEXT) CASCADE;
DROP FUNCTION IF EXISTS api.list_object_resources_filtered_page(TEXT, TEXT[], INTEGER, JSONB, object_type[], object_status[], TEXT, TEXT, BOOLEAN, TEXT, TEXT) CASCADE;
CREATE OR REPLACE FUNCTION api.list_object_resources_filtered_page(
  p_cursor         TEXT DEFAULT NULL,
  p_lang_prefs     TEXT[] DEFAULT ARRAY['fr']::text[],
  p_page_size      INTEGER DEFAULT 50,
  p_filters        JSONB DEFAULT '{}'::jsonb,
  p_types          object_type[] DEFAULT NULL,
  p_status         object_status[] DEFAULT ARRAY['published']::object_status[],
  p_search         TEXT DEFAULT NULL,
  p_track_format   TEXT DEFAULT 'none',
  p_include_stages BOOLEAN DEFAULT NULL,
  p_stage_color    TEXT DEFAULT NULL,
  p_view           TEXT DEFAULT 'card'
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY INVOKER

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
DECLARE
  v_cur JSONB;
  v_offset INTEGER := 0;
  v_limit  INTEGER := LEAST(GREATEST(COALESCE(p_page_size,50),1), 200);
  v_filters JSONB := COALESCE(p_filters, '{}'::jsonb);
  v_types object_type[] := p_types;
  v_status object_status[] := p_status;
  v_search TEXT := p_search;
  v_lang_prefs TEXT[] := p_lang_prefs;
  v_total BIGINT;
  v_cursor JSONB;
  v_next TEXT;
  v_data JSONB;
  v_track TEXT := lower(coalesce(p_track_format,'none'));
  v_inc   BOOLEAN := p_include_stages;
  v_color TEXT    := p_stage_color;
  v_render_enabled BOOLEAN := TRUE;
  v_render_locale TEXT := NULL;
  v_render_tz TEXT := 'UTC';
  v_render_version TEXT := '1.0';
  v_view TEXT := lower(COALESCE(p_view, 'card'));
  v_current_cursor TEXT;
BEGIN
  v_render_locale := CASE
    WHEN array_length(p_lang_prefs,1) >= 1 AND position('-' IN p_lang_prefs[1]) > 0 THEN p_lang_prefs[1]
    WHEN array_length(p_lang_prefs,1) >= 1 AND char_length(p_lang_prefs[1]) = 2 THEN lower(p_lang_prefs[1]) || '-' || upper(p_lang_prefs[1])
    ELSE 'fr-FR'
  END;
  v_render_locale := lower(split_part(v_render_locale, '-', 1)) || '-' ||
                     upper(CASE WHEN position('-' IN v_render_locale) > 0 THEN split_part(v_render_locale, '-', 2)
                                ELSE split_part(v_render_locale, '-', 1) END);

  -- Cursor (offset/page_size + options)
  IF p_cursor IS NOT NULL THEN
    v_cur := api.cursor_unpack(p_cursor);
    v_offset := COALESCE((v_cur->>'offset')::INT, 0);
    v_limit  := LEAST(GREATEST(COALESCE((v_cur->>'page_size')::INT, v_limit),1),200);
    IF v_cur ? 'filters'      THEN v_filters := v_cur->'filters'; END IF;
    IF v_cur ? 'types'        THEN v_types := ARRAY(SELECT jsonb_array_elements_text(v_cur->'types'))::object_type[]; END IF;
    IF v_cur ? 'status' THEN
      IF (v_cur->'status') IS NULL OR jsonb_typeof(v_cur->'status') <> 'array' THEN
        v_status := NULL;
      ELSE
        v_status := ARRAY(SELECT jsonb_array_elements_text(v_cur->'status'))::object_status[];
      END IF;
    END IF;
    IF v_cur ? 'search'       THEN v_search := v_cur->>'search'; END IF;
    IF v_cur ? 'lang'         THEN v_lang_prefs := ARRAY(SELECT jsonb_array_elements_text(v_cur->'lang')); END IF;
    IF v_cur ? 'track_format'   THEN v_track := lower(v_cur->>'track_format'); END IF;
    IF v_cur ? 'include_stages' THEN v_inc   := (v_cur->>'include_stages')::boolean; END IF;
    IF v_cur ? 'stage_color'    THEN v_color := v_cur->>'stage_color'; END IF;
    IF v_cur ? 'render'         THEN v_render_enabled := (v_cur->>'render')::boolean; END IF;
    IF v_cur ? 'render_locale'  THEN v_render_locale := v_cur->>'render_locale'; END IF;
    IF v_cur ? 'render_tz'      THEN v_render_tz := v_cur->>'render_tz'; END IF;
    IF v_cur ? 'render_version' THEN v_render_version := v_cur->>'render_version'; END IF;
    IF v_cur ? 'view'           THEN v_view := lower(v_cur->>'view'); END IF;
  END IF;

  IF v_status IS NULL THEN
    v_status := ARRAY['published']::object_status[];
  END IF;

  IF v_view NOT IN ('card', 'full') THEN
    v_view := 'card';
  END IF;

  IF v_render_locale IS NULL OR v_render_locale = '' THEN
    v_render_locale := 'fr-FR';
  END IF;
  v_render_locale := lower(split_part(v_render_locale, '-', 1)) || '-' ||
                     upper(CASE WHEN position('-' IN v_render_locale) > 0 THEN split_part(v_render_locale, '-', 2)
                                ELSE split_part(v_render_locale, '-', 1) END);

  WITH filt AS (
    SELECT
      o.id,
      o.name_normalized,
      o.updated_at,
      o.updated_at_source,
      -- label_rank: 0 = exact label, 1 = equivalent evidence; always 0 when no label_scheme_ranked filter
      fids.label_rank
    FROM api.get_filtered_object_ids(v_filters, v_types, v_status, v_search) fids
    JOIN object o ON o.id = fids.object_id
  ),
  paged AS (
    SELECT f.*, ROW_NUMBER() OVER (ORDER BY f.label_rank, f.name_normalized NULLS LAST, f.id) AS ord
    FROM filt f
    ORDER BY f.label_rank, f.name_normalized NULLS LAST, f.id
    OFFSET v_offset LIMIT v_limit
  )
  SELECT
    (SELECT COUNT(*) FROM filt) AS total,
    CASE
      WHEN v_view = 'full' THEN
        api.get_object_resources_batch(
          (SELECT ARRAY_AGG(p.id ORDER BY p.ord) FROM paged p),
          v_lang_prefs,
          v_track,
          jsonb_build_object(
            'include_stages', v_inc,
            'stage_color', v_color,
            'render', v_render_enabled,
            'render_locale', v_render_locale,
            'render_tz', v_render_tz,
            'render_version', v_render_version
          )
        )
      ELSE
        api.get_object_cards_batch(
          (SELECT ARRAY_AGG(p.id ORDER BY p.ord) FROM paged p),
          v_lang_prefs
        )
    END AS data
  INTO v_total, v_data;

  v_cursor := jsonb_build_object(
    'kind','page',
    'offset', v_offset,
    'page_size', v_limit,
    'filters', v_filters,
    'types', CASE WHEN v_types IS NULL THEN NULL ELSE to_jsonb(v_types) END,
    'status', CASE WHEN v_status IS NULL THEN NULL ELSE to_jsonb(v_status) END,
    'search', v_search,
    'lang', to_jsonb(v_lang_prefs),
    'track_format', v_track,
    'include_stages', v_inc,
    'stage_color', v_color,
    'view', v_view,
    'render', v_render_enabled,
    'render_locale', v_render_locale,
    'render_tz', v_render_tz,
    'render_version', v_render_version
  );
  v_current_cursor := api.cursor_pack(api.json_clean(v_cursor));
  v_next := api.cursor_pack(api.json_clean(jsonb_set(v_cursor,'{offset}', to_jsonb(v_offset + v_limit))));

  RETURN json_build_object(
    'meta', json_build_object(
      'kind','page',
      'language', COALESCE(v_lang_prefs[1],'fr'),
      'language_fallbacks', v_lang_prefs,
      'page_size', v_limit,
      'offset', v_offset,
      'total', v_total,
      'schema_version', '3.0',
      'render_locale', v_render_locale,
      'render_tz', v_render_tz,
      'render_version', v_render_version,
      'cursor', v_current_cursor,
      'next_cursor', CASE WHEN v_offset + v_limit < v_total THEN v_next ELSE NULL END
    ),
    'data', v_data
  );
END;
$$;



-- =====================================================
-- 7) Endpoints filtrés (p_filters JSONB) — since + keyset (corrected)
--      - Listes : pas de track par défaut ('none')
--      - Toutes les options (filters/types/status/search/lang/track) propagées via curseur
-- =====================================================
DROP FUNCTION IF EXISTS api.list_object_resources_filtered_since_fast(timestamptz, TEXT, boolean, TEXT[], integer, JSONB, object_type[], object_status[], TEXT, TEXT, BOOLEAN, TEXT) CASCADE;
DROP FUNCTION IF EXISTS api.list_object_resources_filtered_since_fast(timestamptz, TEXT, boolean, TEXT[], integer, JSONB, object_type[], object_status[], TEXT, TEXT, BOOLEAN, TEXT, TEXT) CASCADE;

CREATE OR REPLACE FUNCTION api.list_object_resources_filtered_since_fast(
  p_since          TIMESTAMPTZ,
  p_cursor         TEXT DEFAULT NULL,
  p_use_source     BOOLEAN DEFAULT FALSE,
  p_lang_prefs     TEXT[] DEFAULT ARRAY['fr']::text[],
  p_limit          INTEGER DEFAULT 50,
  p_filters        JSONB DEFAULT '{}'::jsonb,
  p_types          object_type[] DEFAULT NULL,
  p_status         object_status[] DEFAULT ARRAY['published']::object_status[],
  p_search         TEXT DEFAULT NULL,
  p_track_format   TEXT DEFAULT 'none',
  p_include_stages BOOLEAN DEFAULT NULL,
  p_stage_color    TEXT DEFAULT NULL,
  p_view           TEXT DEFAULT 'card'
)
RETURNS JSON
LANGUAGE plpgsql
STABLE

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
DECLARE
  v_cur        JSONB;
  v_use_source BOOLEAN := COALESCE(p_use_source, FALSE);
  v_limit      INTEGER := LEAST(GREATEST(COALESCE(p_limit,50),1), 200);
  v_filters    JSONB   := COALESCE(p_filters, '{}'::jsonb);
  v_types      object_type[]   := p_types;
  v_status     object_status[] := p_status;
  v_search     TEXT    := p_search;
  v_track      TEXT    := lower(coalesce(p_track_format,'none'));
  v_inc        BOOLEAN := p_include_stages;
  v_color      TEXT    := p_stage_color;
  v_last_ts    TIMESTAMPTZ := NULL;
  v_last_id    TEXT := NULL;
  v_ids        TEXT[];
  v_data       JSONB;
  v_cursor     JSONB;
  v_next       TEXT;
  v_lang       TEXT := api.pick_lang(p_lang_prefs);
  v_render_enabled BOOLEAN := TRUE;
  v_render_locale TEXT := NULL;
  v_render_tz TEXT := 'UTC';
  v_render_version TEXT := '1.0';
  v_view TEXT := lower(COALESCE(p_view, 'card'));
BEGIN
  IF p_since IS NULL THEN
    RAISE EXCEPTION 'p_since is required';
  END IF;

  -- Lire/surcharger via curseur
  IF p_cursor IS NOT NULL THEN
    v_cur := api.cursor_unpack(p_cursor);
    IF v_cur ? 'since'        THEN p_since     := (v_cur->>'since')::timestamptz; END IF;
    IF v_cur ? 'use_source'   THEN v_use_source:= (v_cur->>'use_source')::boolean; END IF;
    IF v_cur ? 'limit'        THEN v_limit     := LEAST(GREATEST((v_cur->>'limit')::INT,1),200); END IF;
    IF v_cur ? 'filters'      THEN v_filters   := v_cur->'filters'; END IF;
    IF v_cur ? 'types'        THEN v_types     := ARRAY(SELECT jsonb_array_elements_text(v_cur->'types'))::object_type[]; END IF;
    IF v_cur ? 'status'       THEN v_status    := ARRAY(SELECT jsonb_array_elements_text(v_cur->'status'))::object_status[]; END IF;
    IF v_cur ? 'search'       THEN v_search    := v_cur->>'search'; END IF;
    IF v_cur ? 'track_format' THEN v_track     := lower(v_cur->>'track_format'); END IF;
    IF v_cur ? 'include_stages'THEN v_inc      := (v_cur->>'include_stages')::boolean; END IF;
    IF v_cur ? 'stage_color'  THEN v_color     := v_cur->>'stage_color'; END IF;
    IF v_cur ? 'render'       THEN v_render_enabled := (v_cur->>'render')::boolean; END IF;
    IF v_cur ? 'render_locale'THEN v_render_locale := v_cur->>'render_locale'; END IF;
    IF v_cur ? 'render_tz'    THEN v_render_tz := v_cur->>'render_tz'; END IF;
    IF v_cur ? 'render_version' THEN v_render_version := v_cur->>'render_version'; END IF;
    IF v_cur ? 'last_ts'      THEN v_last_ts   := (v_cur->>'last_ts')::timestamptz; END IF;
    IF v_cur ? 'last_id'      THEN v_last_id   := v_cur->>'last_id'; END IF;
    IF v_cur ? 'lang'         THEN p_lang_prefs:= ARRAY(SELECT jsonb_array_elements_text(v_cur->'lang')); v_lang := api.pick_lang(p_lang_prefs); END IF;
    IF v_cur ? 'view'         THEN v_view := lower(v_cur->>'view'); END IF;
  END IF;

  IF v_view NOT IN ('card', 'full') THEN
    v_view := 'card';
  END IF;

  IF v_render_locale IS NULL OR v_render_locale = '' THEN
    v_render_locale := CASE
      WHEN v_lang IS NOT NULL AND position('-' IN v_lang) > 0 THEN v_lang
      WHEN v_lang IS NOT NULL AND char_length(v_lang) = 2 THEN lower(v_lang) || '-' || upper(v_lang)
      ELSE 'fr-FR'
    END;
  END IF;
  v_render_locale := lower(split_part(v_render_locale, '-', 1)) || '-' ||
                     upper(CASE WHEN position('-' IN v_render_locale) > 0 THEN split_part(v_render_locale, '-', 2)
                                ELSE split_part(v_render_locale, '-', 1) END);

  -- Page keyset: ids + ts + last cursor tokens
  WITH filt AS (
    SELECT
      o.id,
      (CASE WHEN v_use_source THEN o.updated_at_source ELSE o.updated_at END) AS ts,
      o.name_normalized
    FROM api.get_filtered_object_ids(v_filters, v_types, v_status, v_search) fids
    JOIN object o ON o.id = fids.object_id
    WHERE (
      (v_use_source = FALSE AND o.updated_at        >= p_since) OR
      (v_use_source = TRUE  AND o.updated_at_source >= p_since)
    )
  ),
  page AS (
    SELECT f.*
    FROM filt f
    WHERE (v_last_ts IS NULL) OR (f.ts, f.id) > (v_last_ts, COALESCE(v_last_id,''))
    ORDER BY f.ts, f.id
    LIMIT v_limit
  )
  SELECT
    ARRAY(SELECT p.id FROM page p ORDER BY p.ts, p.id),
    MAX(p.ts),
    (SELECT p2.id FROM page p2 ORDER BY p2.ts DESC, p2.id DESC LIMIT 1)
  INTO v_ids, v_last_ts, v_last_id
  FROM page p;

  -- Charger les ressources (sans track par défaut)
  v_data := CASE
    WHEN v_view = 'full' THEN
      api.get_object_resources_batch(
        v_ids,
        p_lang_prefs,
        v_track,
        jsonb_build_object(
          'include_stages', v_inc,
          'stage_color', v_color,
          'render', v_render_enabled,
          'render_locale', v_render_locale,
          'render_tz', v_render_tz,
          'render_version', v_render_version
        )
      )::jsonb
    ELSE
      api.get_object_cards_batch(v_ids, p_lang_prefs)::jsonb
  END;

  -- Construire le curseur + next_cursor (propagation complète)
  v_cursor := jsonb_build_object(
    'kind','since',
    'since', to_char(p_since AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'use_source', v_use_source,
    'limit', v_limit,
    'last_ts', CASE WHEN v_last_ts IS NULL THEN NULL ELSE to_char(v_last_ts AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') END,
    'last_id', v_last_id,
    'filters', v_filters,
    'types', CASE WHEN v_types IS NULL THEN NULL ELSE to_jsonb(v_types) END,
    'status', CASE WHEN v_status IS NULL THEN NULL ELSE to_jsonb(v_status) END,
    'search', v_search,
    'track_format', v_track,
    'include_stages', v_inc,
    'stage_color', v_color,
    'view', v_view,
    'render', v_render_enabled,
    'render_locale', v_render_locale,
    'render_tz', v_render_tz,
    'render_version', v_render_version,
    'lang', to_jsonb(p_lang_prefs)
  );

  v_next := CASE WHEN v_last_ts IS NULL THEN NULL ELSE api.cursor_pack(v_cursor) END;

  RETURN json_build_object(
    'meta', json_build_object(
      'kind','since',
      'language', v_lang,
      'language_fallbacks', p_lang_prefs,
      'since', p_since,
      'use_source', v_use_source,
      'limit', v_limit,
      'count', array_length(v_ids,1),
      'schema_version', '3.0',
      'render_locale', v_render_locale,
      'render_tz', v_render_tz,
      'render_version', v_render_version,
      'cursor', api.cursor_pack(api.json_clean(v_cursor)),
      'next_cursor', v_next
    ),
    'data', v_data
  );
END;
$$;

-- =====================================================
-- Recherche de restaurants par type de cuisine
-- =====================================================

CREATE OR REPLACE FUNCTION api.search_restaurants_by_cuisine(
  p_cuisine_types TEXT[],
  p_lang_prefs TEXT[] DEFAULT ARRAY['fr'],
  p_limit INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY INVOKER

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
DECLARE
  v_data JSON;
  v_total INTEGER;
BEGIN
  -- Rechercher les restaurants qui proposent les types de cuisine demandés
  WITH restaurant_cuisine AS (
    SELECT DISTINCT 
      o.id,
      o.name,
      o.object_type,
      o.status,
      o.region_code,
      o.created_at,
      o.updated_at,
      o.published_at,
      o.is_editing,
      -- Informations de localisation
      ol.address1,
      ol.city,
      ol.latitude,
      ol.longitude,
      -- Types de cuisine proposés par ce restaurant
      jsonb_agg(
        jsonb_build_object(
          'id', ct.id,
          'code', ct.code,
          'name', ct.name,
          'description', ct.description
        ) ORDER BY ct.position, ct.name
      ) as cuisine_types,
      -- Nombre de plats par type de cuisine
      jsonb_object_agg(ct.code, item_counts.count) as cuisine_counts
    FROM object o
    JOIN object_location ol ON ol.object_id = o.id AND ol.is_main_location = TRUE
    JOIN object_menu m ON m.object_id = o.id AND m.is_active = TRUE
    JOIN object_menu_item mi ON mi.menu_id = m.id AND mi.is_available = TRUE
    JOIN object_menu_item_cuisine_type mct ON mct.menu_item_id = mi.id
    JOIN ref_code_cuisine_type ct ON ct.id = mct.cuisine_type_id
    LEFT JOIN LATERAL (
      SELECT COUNT(*) as count
      FROM object_menu_item mi2
      JOIN object_menu_item_cuisine_type mct2 ON mct2.menu_item_id = mi2.id
      WHERE mi2.menu_id = m.id 
        AND mct2.cuisine_type_id = ct.id
        AND mi2.is_available = TRUE
    ) item_counts ON TRUE
    WHERE o.object_type = 'RES'
      AND o.status = 'published'
      AND ct.code = ANY(p_cuisine_types)
    GROUP BY o.id, o.name, o.object_type, o.status, o.region_code, 
             o.created_at, o.updated_at, o.published_at, o.is_editing,
             ol.address1, ol.city, ol.latitude, ol.longitude
  ),
  paginated AS (
    SELECT rc.*,
           ROW_NUMBER() OVER (ORDER BY rc.name) as row_num
    FROM restaurant_cuisine rc
    ORDER BY rc.name
    LIMIT p_limit OFFSET p_offset
  )
  SELECT 
    json_build_object(
      'total', (SELECT COUNT(*) FROM restaurant_cuisine),
      'restaurants', json_agg(
        json_build_object(
          'id', p.id,
          'name', p.name,
          'type', p.object_type,
          'status', p.status,
          'region_code', p.region_code,
          'created_at', p.created_at,
          'updated_at', p.updated_at,
          'published_at', p.published_at,
          'is_editing', p.is_editing,
          'address', json_build_object(
            'address1', p.address1,
            'city', p.city,
            'latitude', p.latitude,
            'longitude', p.longitude
          ),
          'cuisine_types', p.cuisine_types,
          'cuisine_counts', p.cuisine_counts,
          'menu_summary', json_build_object(
            'total_menus', (SELECT COUNT(*) FROM object_menu WHERE object_id = p.id AND is_active = TRUE),
            'total_items', (SELECT COUNT(*) FROM object_menu m JOIN object_menu_item mi ON mi.menu_id = m.id WHERE m.object_id = p.id AND m.is_active = TRUE AND mi.is_available = TRUE)
          )
        ) ORDER BY p.name
      )
    )
  INTO v_data
  FROM paginated p;

  RETURN COALESCE(v_data, json_build_object('total', 0, 'restaurants', '[]'::json));
END;
$$;

-- =====================================================
-- Recherche d'événements par types de cuisine des restaurants associés
-- =====================================================

CREATE OR REPLACE FUNCTION api.search_events_by_restaurant_cuisine(
  p_cuisine_types TEXT[],
  p_lang_prefs TEXT[] DEFAULT ARRAY['fr'],
  p_limit INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY INVOKER

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
DECLARE
  v_data JSON;
BEGIN
  -- Rechercher les événements qui ont des restaurants proposant les types de cuisine demandés
  WITH event_cuisine AS (
    SELECT DISTINCT 
      o.id,
      o.name,
      o.object_type,
      o.status,
      o.region_code,
      o.created_at,
      o.updated_at,
      o.published_at,
      o.is_editing,
      -- Informations de localisation
      ol.address1,
      ol.city,
      ol.latitude,
      ol.longitude,
      -- Types de cuisine des restaurants associés
      jsonb_agg(
        jsonb_build_object(
          'id', ct.id,
          'code', ct.code,
          'name', ct.name,
          'description', ct.description,
          'restaurant_name', o_restaurant.name,
          'restaurant_id', o_restaurant.id
        ) ORDER BY ct.position, ct.name
      ) as cuisine_types,
      -- Nombre de restaurants par type de cuisine
      jsonb_object_agg(ct.code, restaurant_counts.count) as cuisine_counts,
      -- Liste des restaurants associés
      jsonb_agg(
        DISTINCT jsonb_build_object(
          'id', o_restaurant.id,
          'name', o_restaurant.name,
          'cuisine_types', restaurant_cuisines.cuisine_types
        )
      ) as associated_restaurants
    FROM object o
    JOIN object_location ol ON ol.object_id = o.id AND ol.is_main_location = TRUE
    JOIN object_relation r ON r.source_object_id = o.id
    JOIN object o_restaurant ON o_restaurant.id = r.target_object_id AND o_restaurant.object_type = 'RES'
    JOIN object_menu m ON m.object_id = o_restaurant.id AND m.is_active = TRUE
    JOIN object_menu_item mi ON mi.menu_id = m.id AND mi.is_available = TRUE
    JOIN object_menu_item_cuisine_type mct ON mct.menu_item_id = mi.id
    JOIN ref_code_cuisine_type ct ON ct.id = mct.cuisine_type_id
    LEFT JOIN LATERAL (
      SELECT COUNT(DISTINCT o_restaurant2.id) as count
      FROM object_relation r2
      JOIN object o_restaurant2 ON o_restaurant2.id = r2.target_object_id AND o_restaurant2.object_type = 'RES'
      JOIN object_menu m2 ON m2.object_id = o_restaurant2.id AND m2.is_active = TRUE
      JOIN object_menu_item mi2 ON mi2.menu_id = m2.id AND mi2.is_available = TRUE
      JOIN object_menu_item_cuisine_type mct2 ON mct2.menu_item_id = mi2.id
      WHERE r2.source_object_id = o.id 
        AND mct2.cuisine_type_id = ct.id
    ) restaurant_counts ON TRUE
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(
        jsonb_build_object('id', ct2.id, 'code', ct2.code, 'name', ct2.name)
        ORDER BY ct2.position, ct2.name
      ) as cuisine_types
      FROM object_menu m3
      JOIN object_menu_item mi3 ON mi3.menu_id = m3.id AND mi3.is_available = TRUE
      JOIN object_menu_item_cuisine_type mct3 ON mct3.menu_item_id = mi3.id
      JOIN ref_code_cuisine_type ct2 ON ct2.id = mct3.cuisine_type_id
      WHERE m3.object_id = o_restaurant.id AND m3.is_active = TRUE
    ) restaurant_cuisines ON TRUE
    WHERE o.object_type = 'FMA'
      AND o.status = 'published'
      AND ct.code = ANY(p_cuisine_types)
    GROUP BY o.id, o.name, o.object_type, o.status, o.region_code, 
             o.created_at, o.updated_at, o.published_at, o.is_editing,
             ol.address1, ol.city, ol.latitude, ol.longitude
  ),
  paginated AS (
    SELECT ec.*,
           ROW_NUMBER() OVER (ORDER BY ec.name) as row_num
    FROM event_cuisine ec
    ORDER BY ec.name
    LIMIT p_limit OFFSET p_offset
  )
  SELECT 
    json_build_object(
      'total', (SELECT COUNT(*) FROM event_cuisine),
      'events', json_agg(
        json_build_object(
          'id', p.id,
          'name', p.name,
          'type', p.object_type,
          'status', p.status,
          'region_code', p.region_code,
          'created_at', p.created_at,
          'updated_at', p.updated_at,
          'published_at', p.published_at,
          'is_editing', p.is_editing,
          'address', json_build_object(
            'address1', p.address1,
            'city', p.city,
            'latitude', p.latitude,
            'longitude', p.longitude
          ),
          'cuisine_types', p.cuisine_types,
          'cuisine_counts', p.cuisine_counts,
          'associated_restaurants', p.associated_restaurants
        ) ORDER BY p.name
      )
    )
  INTO v_data
  FROM paginated p;

  RETURN COALESCE(v_data, json_build_object('total', 0, 'events', '[]'::json));
END;
$$;

-- =====================================================
-- API EXTENSIONS: Deep data inclusion for parent objects, actors, and contacts
-- =====================================================

-- =====================================================
-- Helper: Get enriched parent object data
-- =====================================================
CREATE OR REPLACE FUNCTION api.get_parent_object_data(p_object_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
DECLARE
  v_parent_data JSONB;
BEGIN
  -- Optimized: Use single query with jsonb_agg instead of loop
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', r.target_object_id,
      'type', o.object_type::text,
      'name', o.name,
      'status', o.status::text,
      'relation_type', jsonb_build_object(
        'id', r.relation_type_id,
        'name', rt.name
      ),
      'distance_m', r.distance_m,
      'note', r.note,
      'basic_info', jsonb_build_object(
        'id', r.target_object_id,
        'type', o.object_type::text,
        'name', o.name,
        'status', o.status::text
      )
    )
    ORDER BY r.position, r.created_at
  ), '[]'::jsonb)
  INTO v_parent_data
  FROM object_relation r
  JOIN object o ON o.id = r.target_object_id
  LEFT JOIN ref_object_relation_type rt ON rt.id = r.relation_type_id
  WHERE r.source_object_id = p_object_id;

  RETURN v_parent_data;
END;
$$;

-- =====================================================
-- Helper: Get enriched actor data with contacts
-- =====================================================
CREATE OR REPLACE FUNCTION api.get_actor_data(p_object_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
DECLARE
  v_actor_data JSONB;
BEGIN
  -- Optimized: Use CTEs and jsonb_agg to eliminate nested loops
  WITH actors_with_contacts AS (
    SELECT 
      a.id,
      a.display_name,
      a.first_name,
      a.last_name,
      a.gender,
      aor.role_id,
      rar.name as role_name,
      rar.code as role_code,
      aor.is_primary,
      aor.valid_from,
      aor.valid_to,
      aor.visibility,
      aor.note,
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'id', ac.id,
            'kind', jsonb_build_object(
              'code', rck.code,
              'name', rck.name,
              'description', rck.description,
              'icon_url', rck.icon_url
            ),
            'value', ac.value,
            'is_primary', ac.is_primary,
            'role', jsonb_build_object(
              'code', rcr.code,
              'name', rcr.name
            ),
            'position', ac.position,
            'extra', ac.extra
          )
          ORDER BY ac.is_primary DESC, ac.position NULLS LAST, ac.created_at
        ) FILTER (WHERE ac.id IS NOT NULL),
        '[]'::jsonb
      ) as contacts
    FROM actor a
    JOIN actor_object_role aor ON aor.actor_id = a.id
    LEFT JOIN ref_actor_role rar ON rar.id = aor.role_id
    LEFT JOIN actor_channel ac ON ac.actor_id = a.id
    LEFT JOIN ref_code_contact_kind rck ON rck.id = ac.kind_id
    LEFT JOIN ref_contact_role rcr ON rcr.id = ac.role_id
    WHERE aor.object_id = p_object_id
    GROUP BY a.id, a.display_name, a.first_name, a.last_name, a.gender,
             aor.role_id, rar.name, rar.code, aor.is_primary,
             aor.valid_from, aor.valid_to, aor.visibility, aor.note, aor.created_at
    ORDER BY aor.is_primary DESC, aor.created_at
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', id,
      'display_name', display_name,
      'first_name', first_name,
      'last_name', last_name,
      'gender', gender,
      'role', jsonb_build_object(
        'id', role_id,
        'code', role_code,
        'name', role_name
      ),
      'is_primary', is_primary,
      'valid_from', valid_from,
      'valid_to', valid_to,
      'visibility', visibility,
      'note', note,
      'contacts', contacts
    )
  ), '[]'::jsonb)
  INTO v_actor_data
  FROM actors_with_contacts;

  RETURN v_actor_data;
END;
$$;

-- =====================================================
-- Helper: Get enriched organization data
-- =====================================================
CREATE OR REPLACE FUNCTION api.get_organization_data(p_object_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
DECLARE
  v_org_data JSONB;
BEGIN
  -- Optimized: Use CTEs and jsonb_agg to eliminate nested loops
  WITH orgs_with_contacts AS (
    SELECT 
      o.id,
      o.object_type,
      o.name,
      o.status,
      ool.role_id,
      ror.name as role_name,
      ror.code as role_code,
      ool.note,
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'id', cc.id,
            'kind', jsonb_build_object(
              'code', rck.code,
              'name', rck.name,
              'description', rck.description,
              'icon_url', rck.icon_url
            ),
            'value', cc.value,
            'is_public', cc.is_public,
            'is_primary', cc.is_primary,
            'role', jsonb_build_object(
              'code', rcr.code,
              'name', rcr.name
            ),
            'position', cc.position
          )
          ORDER BY cc.is_primary DESC, cc.position NULLS LAST, cc.created_at
        ) FILTER (WHERE cc.id IS NOT NULL),
        '[]'::jsonb
      ) as contacts
    FROM object_org_link ool
    JOIN object o ON o.id = ool.org_object_id
    LEFT JOIN ref_org_role ror ON ror.id = ool.role_id
    LEFT JOIN contact_channel cc ON cc.object_id = o.id
    LEFT JOIN ref_code_contact_kind rck ON rck.id = cc.kind_id
    LEFT JOIN ref_contact_role rcr ON rcr.id = cc.role_id
    WHERE ool.object_id = p_object_id
    GROUP BY o.id, o.object_type, o.name, o.status,
             ool.role_id, ror.name, ror.code, ool.note, ool.is_primary, ool.created_at
    ORDER BY ool.is_primary DESC, ool.created_at
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', id,
      'type', object_type::text,
      'name', name,
      'status', status::text,
      'role', jsonb_build_object(
        'id', role_id,
        'code', role_code,
        'name', role_name
      ),
      'note', note,
      'contacts', contacts
    )
  ), '[]'::jsonb)
  INTO v_org_data
  FROM orgs_with_contacts;

  RETURN v_org_data;
END;
$$;

-- =====================================================
-- Enhanced API function: Get object with deep parent, actor, and organization data
-- Delegates to batch version for efficiency
-- =====================================================
CREATE OR REPLACE FUNCTION api.get_object_with_deep_data(
  p_object_id TEXT,
  p_languages TEXT[] DEFAULT ARRAY['fr']
)
RETURNS JSON
LANGUAGE plpgsql
STABLE

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
DECLARE
  v_result JSON;
BEGIN
  -- Defer function lookup to runtime so this wrapper can be declared
  -- before api.get_objects_with_deep_data in this script.
  EXECUTE $sql$
    SELECT COALESCE(
      (SELECT json_array_elements(
         api.get_objects_with_deep_data(ARRAY[$1], $2)::json
      )),
      NULL
    )
  $sql$
  INTO v_result
  USING p_object_id, p_languages;

  RETURN v_result;
END;
$$;

-- =====================================================
-- Enhanced API function: Get multiple objects with deep data
-- =====================================================
CREATE OR REPLACE FUNCTION api.get_objects_with_deep_data(
  p_object_ids TEXT[],
  p_languages TEXT[] DEFAULT ARRAY['fr'],
  p_include_media TEXT DEFAULT 'none',
  p_filters JSONB DEFAULT '{}'::jsonb
)
RETURNS JSON
LANGUAGE sql
STABLE

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
  -- Fully optimized: Single query with LATERAL joins instead of function calls per object
  SELECT COALESCE(json_agg(
    json_build_object(
      'object', api.get_object_resource(o.id, p_languages, p_include_media, p_filters),
      'parent_objects', COALESCE(parents.data, '[]'::jsonb),
      'actors', COALESCE(actors.data, '[]'::jsonb),
      'organizations', COALESCE(orgs.data, '[]'::jsonb)
    )
    ORDER BY array_position(p_object_ids, o.id)
  ), '[]'::json)
  FROM object o
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', r.target_object_id,
        'type', o2.object_type::text,
        'name', o2.name,
        'status', o2.status::text,
        'relation_type', jsonb_build_object(
          'id', r.relation_type_id,
          'name', rt.name
        ),
        'distance_m', r.distance_m,
        'note', r.note
      )
      ORDER BY r.position, r.created_at
    ) as data
    FROM object_relation r
    JOIN object o2 ON o2.id = r.target_object_id
    LEFT JOIN ref_object_relation_type rt ON rt.id = r.relation_type_id
    WHERE r.source_object_id = o.id
  ) parents ON TRUE
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', a.id,
        'display_name', a.display_name,
        'first_name', a.first_name,
        'last_name', a.last_name,
        'gender', a.gender,
        'role', jsonb_build_object(
          'id', aor.role_id,
          'code', rar.code,
          'name', rar.name
        ),
        'is_primary', aor.is_primary,
        'valid_from', aor.valid_from,
        'valid_to', aor.valid_to,
        'visibility', aor.visibility,
        'note', aor.note,
        'contacts', COALESCE(actor_contacts.contacts, '[]'::jsonb)
      )
      ORDER BY aor.is_primary DESC, aor.created_at
    ) as data
    FROM actor_object_role aor
    JOIN actor a ON a.id = aor.actor_id
    LEFT JOIN ref_actor_role rar ON rar.id = aor.role_id
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', ac.id,
          'kind', jsonb_build_object(
            'code', rck.code,
            'name', rck.name,
            'description', rck.description,
            'icon_url', rck.icon_url
          ),
          'value', ac.value,
          'is_primary', ac.is_primary,
          'role', jsonb_build_object(
            'code', rcr.code,
            'name', rcr.name
          ),
          'position', ac.position,
          'extra', ac.extra
        )
        ORDER BY ac.is_primary DESC, ac.position NULLS LAST, ac.created_at
      ) as contacts
      FROM actor_channel ac
      JOIN ref_code_contact_kind rck ON rck.id = ac.kind_id
      LEFT JOIN ref_contact_role rcr ON rcr.id = ac.role_id
      WHERE ac.actor_id = a.id
    ) actor_contacts ON TRUE
    WHERE aor.object_id = o.id
  ) actors ON TRUE
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', org.id,
        'type', org.object_type::text,
        'name', org.name,
        'status', org.status::text,
        'role', jsonb_build_object(
          'id', ool.role_id,
          'code', ror.code,
          'name', ror.name
        ),
        'note', ool.note,
        'contacts', COALESCE(org_contacts.contacts, '[]'::jsonb)
      )
      ORDER BY ool.is_primary DESC, ool.created_at
    ) as data
    FROM object_org_link ool
    JOIN object org ON org.id = ool.org_object_id
    LEFT JOIN ref_org_role ror ON ror.id = ool.role_id
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', cc.id,
          'kind', jsonb_build_object(
            'code', rck.code,
            'name', rck.name,
            'description', rck.description,
            'icon_url', rck.icon_url
          ),
          'value', cc.value,
          'is_public', cc.is_public,
          'is_primary', cc.is_primary,
          'role', jsonb_build_object(
            'code', rcr.code,
            'name', rcr.name
          ),
          'position', cc.position
        )
        ORDER BY cc.is_primary DESC, cc.position NULLS LAST, cc.created_at
      ) as contacts
      FROM contact_channel cc
      JOIN ref_code_contact_kind rck ON rck.id = cc.kind_id
      LEFT JOIN ref_contact_role rcr ON rcr.id = cc.role_id
      WHERE cc.object_id = org.id
    ) org_contacts ON TRUE
    WHERE ool.object_id = o.id
  ) orgs ON TRUE
  WHERE o.id = ANY(p_object_ids);
$$;

-- =====================================================
-- Enhanced API function: Get objects by type with deep data
-- =====================================================
CREATE OR REPLACE FUNCTION api.get_objects_by_type_with_deep_data(
  p_object_type TEXT,
  p_languages TEXT[] DEFAULT ARRAY['fr'],
  p_include_media TEXT DEFAULT 'none',
  p_filters JSONB DEFAULT '{}'::jsonb,
  p_limit INTEGER DEFAULT 100,
  p_offset INTEGER DEFAULT 0
)
RETURNS JSON
LANGUAGE plpgsql
STABLE

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
DECLARE
  v_object_ids TEXT[];
  v_result JSON;
BEGIN
  -- Get object IDs by type
  SELECT ARRAY_AGG(sub.id ORDER BY sub.name)
  INTO v_object_ids
  FROM (
    SELECT id, name
    FROM object
    WHERE object_type::text = p_object_type
      AND status = 'published'
    ORDER BY name
    LIMIT p_limit
    OFFSET p_offset
  ) sub;
  
  -- Get deep data for all objects
  SELECT api.get_objects_with_deep_data(v_object_ids, p_languages, p_include_media, p_filters)
  INTO v_result;
  
  RETURN v_result;
END;
$$;

-- =====================================================
-- Enhanced API function: Search objects with deep data
-- =====================================================
CREATE OR REPLACE FUNCTION api.search_objects_with_deep_data(
  p_search_term TEXT,
  p_object_types TEXT[] DEFAULT NULL,
  p_languages TEXT[] DEFAULT ARRAY['fr'],
  p_include_media TEXT DEFAULT 'none',
  p_filters JSONB DEFAULT '{}'::jsonb,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS JSON
LANGUAGE plpgsql
STABLE

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
DECLARE
  v_object_ids TEXT[];
  v_result JSON;
BEGIN
  -- Search for objects
  SELECT ARRAY_AGG(sub.id ORDER BY sub.name)
  INTO v_object_ids
  FROM (
    SELECT o.id, o.name
    FROM object o
    WHERE o.status = 'published'
      AND (p_object_types IS NULL OR o.object_type::text = ANY(p_object_types))
      AND (
        o.name_search_vector @@ plainto_tsquery('french', api.norm_search(p_search_term))
        OR EXISTS (
          SELECT 1 FROM object_location ol
          WHERE ol.object_id = o.id
            AND ol.is_main_location = TRUE
            AND (ol.city_search_vector @@ plainto_tsquery('french', api.norm_search(p_search_term))
                 OR ol.address1 ILIKE '%' || replace(replace(replace(p_search_term, '\', '\\'), '%', '\%'), '_', '\_') || '%')
        )
      )
    ORDER BY o.name
    LIMIT p_limit
    OFFSET p_offset
  ) sub;
  
  -- Get deep data for found objects
  SELECT api.get_objects_with_deep_data(v_object_ids, p_languages, p_include_media, p_filters)
  INTO v_result;
  
  RETURN v_result;
END;
$$;

-- =====================================================
-- Lightweight map view API - returns minimal object data
-- =====================================================
CREATE OR REPLACE FUNCTION api.get_object_map_item(
  p_object_id TEXT,
  p_lang_prefs TEXT[] DEFAULT ARRAY['fr']::text[]
)
RETURNS JSONB
LANGUAGE sql
STABLE

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
  SELECT jsonb_build_object(
    'id', o.id,
    'name', o.name,
    'type', o.object_type::text,
    'location', jsonb_build_object(
      'lat', ol.latitude,
      'lon', ol.longitude,
      'address', CONCAT_WS(', ',
        NULLIF(ol.address1, ''),
        NULLIF(ol.postcode, ''),
        NULLIF(ol.city, '')
      )
    ),
    'description', LEFT(COALESCE(
      api.i18n_pick(d.description_chapo_i18n, api.pick_lang(p_lang_prefs), 'fr'),
      d.description_chapo,
      LEFT(d.description, 200)
    ), 200),
    'rating', o.cached_rating,
    'price', CASE
      WHEN o.cached_min_price IS NOT NULL THEN jsonb_build_object('amount', o.cached_min_price, 'currency', 'EUR')
      ELSE NULL
    END,
    'image', o.cached_main_image_url
  )
  FROM object o
  LEFT JOIN object_location ol
    ON ol.object_id = o.id
   AND ol.is_main_location IS TRUE
  LEFT JOIN object_description d
    ON d.object_id = o.id
   AND d.org_object_id IS NULL
  WHERE o.id = p_object_id
    AND ol.latitude IS NOT NULL
    AND ol.longitude IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION api.list_objects_map_view(
  p_types TEXT[] DEFAULT NULL,
  p_status TEXT[] DEFAULT ARRAY['published'],
  p_filters JSONB DEFAULT '{}'::jsonb,
  p_lang_prefs TEXT[] DEFAULT ARRAY['fr'],
  p_limit INTEGER DEFAULT 500,
  p_offset INTEGER DEFAULT 0
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY INVOKER

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
DECLARE
  v_data JSON;
  v_total INTEGER;
BEGIN
  WITH filtered_objects AS (
    SELECT o.id
    FROM api.get_filtered_object_ids(p_filters, p_types::object_type[], p_status::object_status[], NULL) fids
    JOIN object o ON o.id = fids.object_id
    JOIN object_location ol ON ol.object_id = o.id AND ol.is_main_location = TRUE
    WHERE ol.latitude IS NOT NULL
      AND ol.longitude IS NOT NULL
  ),
  paginated AS (
    SELECT f.id
    FROM filtered_objects f
    ORDER BY f.id
    LIMIT p_limit OFFSET p_offset
  )
  SELECT
    json_build_object(
      'total', (SELECT COUNT(*) FROM filtered_objects),
      'objects', COALESCE(
        json_agg(api.get_object_map_item(p.id, p_lang_prefs) ORDER BY p.id),
        '[]'::json
      )
    ),
    (SELECT COUNT(*) FROM filtered_objects)
  INTO v_data, v_total
  FROM paginated p;

  RETURN COALESCE(v_data, json_build_object('total', 0, 'objects', '[]'::json));
END;
$$;

-- =====================================================
-- Get filtered media for web display (excludes internal/sensitive)
-- =====================================================
CREATE OR REPLACE FUNCTION api.get_media_for_web(
  p_object_id TEXT,
  p_preferred_tags TEXT[] DEFAULT ARRAY['facade', 'interieur', 'cuisine', 'paysage'],
  p_lang_prefs TEXT[] DEFAULT ARRAY['fr'],
  p_limit INTEGER DEFAULT 20
)
RETURNS JSON
LANGUAGE plpgsql
STABLE

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
DECLARE
  v_lang TEXT;
  v_exclusion_tags TEXT[] := ARRAY['interne', 'personnel', 'document', 'archive', 'brouillon'];
BEGIN
  v_lang := api.pick_lang(p_lang_prefs);

  RETURN COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', m.id,
        'url', m.url,
        'title', COALESCE(api.i18n_pick_strict(m.title_i18n, v_lang, 'fr'), m.title),
        'credit', m.credit,
        'type_code', mt.code,
        'is_main', m.is_main,
        'tags', m.tags,
        'width', m.width,
        'height', m.height
      )
      ORDER BY m.priority, m.position NULLS LAST
    )
    FROM (
      SELECT *
      FROM (
      SELECT DISTINCT ON (m.id)
        m.id,
        m.url,
        m.title,
        m.title_i18n,
        m.credit,
        m.media_type_id,
        m.is_main,
        m.position,
        m.width,
        m.height,
        COALESCE(
          (SELECT jsonb_agg(rmt.code ORDER BY rmt.position)
           FROM media_tag mt2
           JOIN ref_code_media_tag rmt ON rmt.id = mt2.tag_id
           WHERE mt2.media_id = m.id),
          '[]'::jsonb
        ) as tags,
        -- Priority scoring for ordering
        (CASE 
          WHEN EXISTS (
            SELECT 1 FROM media_tag mt2
            JOIN ref_code_media_tag rmt ON rmt.id = mt2.tag_id
            WHERE mt2.media_id = m.id AND rmt.code = 'prefere'
          ) THEN 0
          WHEN EXISTS (
            SELECT 1 FROM media_tag mt2
            JOIN ref_code_media_tag rmt ON rmt.id = mt2.tag_id
            WHERE mt2.media_id = m.id AND rmt.code = ANY(p_preferred_tags)
          ) THEN 1
          WHEN m.is_main = TRUE THEN 2
          ELSE 3
        END) as priority
      FROM media m
      WHERE m.object_id = p_object_id
        AND m.is_published = TRUE
        AND (m.visibility IS NULL OR m.visibility = 'public')
        -- Exclude sensitive/internal tags
        AND NOT EXISTS (
          SELECT 1 FROM media_tag mt2
          JOIN ref_code_media_tag rmt ON rmt.id = mt2.tag_id
          WHERE mt2.media_id = m.id AND rmt.code = ANY(v_exclusion_tags)
        )
      ORDER BY m.id
    ) base_media
      ORDER BY base_media.priority, base_media.position NULLS LAST
      LIMIT p_limit
    ) m
    JOIN ref_code_media_type mt ON mt.id = m.media_type_id
  ), '[]'::json);
END;
$$;

-- =====================================================
-- Get object reviews with aggregates (external imports)
-- =====================================================
CREATE OR REPLACE FUNCTION api.get_object_reviews(
  p_object_id TEXT,
  p_limit INTEGER DEFAULT 10,
  p_offset INTEGER DEFAULT 0,
  p_lang_prefs TEXT[] DEFAULT ARRAY['fr']
)
RETURNS JSON
LANGUAGE plpgsql
STABLE

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
DECLARE
  v_lang TEXT;
BEGIN
  v_lang := api.pick_lang(p_lang_prefs);

  RETURN json_build_object(
    'summary', json_build_object(
      'avg_rating', (
        SELECT ROUND(AVG(r.rating)::numeric, 2)
        FROM object_review r
        WHERE r.object_id = p_object_id AND r.is_published = TRUE
      ),
      'review_count', (
        SELECT COUNT(*)
        FROM object_review r
        WHERE r.object_id = p_object_id AND r.is_published = TRUE
      ),
      'by_source', COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'source', rs.code,
            'count', COUNT(*),
            'avg_rating', ROUND(AVG(r.rating)::numeric, 2)
          )
          ORDER BY rs.code
        )
        FROM object_review r
        JOIN ref_review_source rs ON rs.id = r.source_id
        WHERE r.object_id = p_object_id AND r.is_published = TRUE
        GROUP BY rs.code
      ), '[]'::jsonb)
    ),
    'reviews', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', r.id,
          'source', rs.code,
          'rating', r.rating,
          'rating_max', r.rating_max,
          'title', r.title,
          'content', r.content,
          'author_name', r.author_name,
          'author_avatar_url', r.author_avatar_url,
          'review_date', r.review_date,
          'visit_date', r.visit_date,
          'traveler_type', r.traveler_type,
          'language_id', r.language_id,
          'helpful_count', r.helpful_count,
          'response', r.response,
          'response_date', r.response_date
        )
        ORDER BY r.review_date DESC NULLS LAST, r.imported_at DESC
      )
      FROM object_review r
      JOIN ref_review_source rs ON rs.id = r.source_id
      WHERE r.object_id = p_object_id AND r.is_published = TRUE
      LIMIT p_limit OFFSET p_offset
    ), '[]'::jsonb)
  );
END;
$$;

-- =====================================================
-- Get room types for accommodations
-- =====================================================
CREATE OR REPLACE FUNCTION api.get_object_room_types(
  p_object_id TEXT,
  p_lang_prefs TEXT[] DEFAULT ARRAY['fr']
)
RETURNS JSON
LANGUAGE plpgsql
STABLE

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
DECLARE
  v_lang TEXT;
BEGIN
  v_lang := api.pick_lang(p_lang_prefs);

  RETURN COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', rt.id,
        'code', rt.code,
        'name', COALESCE(api.i18n_pick_strict(rt.name_i18n, v_lang, 'fr'), rt.name),
        'description', COALESCE(api.i18n_pick_strict(rt.description_i18n, v_lang, 'fr'), rt.description),
        'capacity_adults', rt.capacity_adults,
        'capacity_children', rt.capacity_children,
        'capacity_total', rt.capacity_total,
        'size_sqm', rt.size_sqm,
        'bed_config', COALESCE(api.i18n_pick_strict(rt.bed_config_i18n, v_lang, 'fr'), rt.bed_config),
        'total_rooms', rt.total_rooms,
        'floor_level', rt.floor_level,
        'view_type', CASE
          WHEN vt.id IS NOT NULL THEN jsonb_build_object(
            'code', vt.code,
            'name', vt.name
          )
          ELSE NULL
        END,
        'base_price', rt.base_price,
        'currency', rt.currency,
        'is_accessible', rt.is_accessible,
        'is_published', rt.is_published,
        'amenities', COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object(
              'code', a.code,
              'name', a.name,
              'description', a.description
            )
            ORDER BY a.name
          )
          FROM object_room_type_amenity rta
          JOIN ref_amenity a ON a.id = rta.amenity_id
          WHERE rta.room_type_id = rt.id
        ), '[]'::jsonb),
        'media', COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', m.id,
              'url', m.url,
              'title', COALESCE(api.i18n_pick_strict(m.title_i18n, v_lang, 'fr'), m.title),
              'credit', m.credit,
              'is_main', m.is_main,
              'position', rtm.position
            )
            ORDER BY rtm.position NULLS LAST
          )
          FROM object_room_type_media rtm
          JOIN media m ON m.id = rtm.media_id
          WHERE rtm.room_type_id = rt.id AND m.is_published = TRUE
        ), '[]'::jsonb)
      )
      ORDER BY rt.position NULLS LAST, rt.name
    )
    FROM object_room_type rt
    LEFT JOIN ref_code_view_type vt ON vt.id = rt.view_type_id
    WHERE rt.object_id = p_object_id AND rt.is_published = TRUE
  ), '[]'::jsonb);
END;
$$;

-- =====================================================
-- Validate promotion code for an object
-- =====================================================
CREATE OR REPLACE FUNCTION api.validate_promotion_code(
  p_code TEXT,
  p_object_id TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
STABLE

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
DECLARE
  v_promo JSON;
BEGIN
  IF p_code IS NULL OR LENGTH(TRIM(p_code)) = 0 THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'id', p.id,
    'code', p.code,
    'name', p.name,
    'description', p.description,
    'type_id', p.type_id,
    'discount_type', p.discount_type,
    'discount_value', p.discount_value,
    'currency', p.currency,
    'valid_from', p.valid_from,
    'valid_to', p.valid_to,
    'max_uses', p.max_uses,
    'max_uses_per_user', p.max_uses_per_user,
    'current_uses', p.current_uses,
    'min_purchase_amount', p.min_purchase_amount,
    'applicable_object_types', p.applicable_object_types,
    'season_id', p.season_id,
    'partner_org_id', p.partner_org_id,
    'is_public', p.is_public
  )
  INTO v_promo
  FROM promotion p
  LEFT JOIN object o ON o.id = p_object_id
  WHERE lower(p.code) = lower(trim(p_code))
    AND p.is_active = TRUE
    AND (p.valid_from IS NULL OR p.valid_from <= NOW())
    AND (p.valid_to IS NULL OR p.valid_to >= NOW())
    AND (p.max_uses IS NULL OR p.current_uses < p.max_uses)
    AND (
      p_object_id IS NULL
      OR EXISTS (
        SELECT 1 FROM promotion_object po
        WHERE po.promotion_id = p.id AND po.object_id = p_object_id
      )
      OR (p.applicable_object_types IS NOT NULL AND o.object_type::text = ANY(p.applicable_object_types))
    );

  RETURN v_promo;
END;
$$;

-- =====================================================
-- Search objects by label with partial action matches
-- =====================================================
CREATE OR REPLACE FUNCTION api.search_objects_by_label(
  p_label_value_id UUID,
  p_include_partial BOOLEAN DEFAULT TRUE,
  p_lang_prefs TEXT[] DEFAULT ARRAY['fr'],
  p_limit INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY INVOKER

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
DECLARE
  v_data JSON;
  v_total INTEGER;
  v_lang TEXT;
BEGIN
  v_lang := api.pick_lang(p_lang_prefs);

  WITH RECURSIVE label_hierarchy AS (
    -- Get the label and all its children
    SELECT id, parent_id, code, name, scheme_id
    FROM ref_classification_value
    WHERE id = p_label_value_id
    UNION ALL
    SELECT cv.id, cv.parent_id, cv.code, cv.name, cv.scheme_id
    FROM ref_classification_value cv
    JOIN label_hierarchy lh ON cv.parent_id = lh.id
  ),
  label_actions AS (
    -- Get all actions linked to this label hierarchy
    -- derived dynamically from existing object links as requested
    SELECT DISTINCT sal.object_sustainability_action_id as action_id
    FROM object_sustainability_action_label sal
    JOIN object_classification oc ON oc.id = sal.object_classification_id
    WHERE oc.value_id IN (SELECT id FROM label_hierarchy)
  ),
  full_label_objects AS (
    -- Objects with the full label
    SELECT o.id, TRUE as has_full_label, NULL::bigint as action_count
    FROM object o
    JOIN object_classification oc ON oc.object_id = o.id
    WHERE oc.value_id = p_label_value_id 
      AND o.status = 'published'
  ),
  partial_label_objects AS (
    -- Objects with some actions from the label
    SELECT o.id, FALSE as has_full_label, COUNT(DISTINCT osa.action_id) as action_count
    FROM object o
    JOIN object_sustainability_action osa ON osa.object_id = o.id
    WHERE osa.action_id IN (SELECT action_id FROM label_actions)
      AND o.id NOT IN (SELECT id FROM full_label_objects)
      AND o.status = 'published'
    GROUP BY o.id
  ),
  combined_objects AS (
    SELECT id, has_full_label, action_count FROM full_label_objects
    UNION ALL
    SELECT id, has_full_label, action_count FROM partial_label_objects
    WHERE p_include_partial = TRUE
  ),
  paginated AS (
    SELECT co.*,
           ROW_NUMBER() OVER (ORDER BY co.has_full_label DESC, co.action_count DESC NULLS LAST) as row_num
    FROM combined_objects co
    ORDER BY co.has_full_label DESC, co.action_count DESC NULLS LAST
    LIMIT p_limit OFFSET p_offset
  )
  SELECT 
    json_build_object(
      'total', (SELECT COUNT(*) FROM combined_objects),
      'objects', json_agg(
        api.get_object_resource(
          p.id,
          p_lang_prefs,
          'none',
          '{}'::jsonb
        )
        ORDER BY p.has_full_label DESC, p.action_count DESC NULLS LAST
      )
    ),
    (SELECT COUNT(*) FROM combined_objects)
  INTO v_data, v_total
  FROM paginated p;

  RETURN COALESCE(v_data, json_build_object('total', 0, 'objects', '[]'::json));
END;
$$;

-- =====================================================
-- GPX/Track Export Functions (optimized with caching)
-- =====================================================

-- Export full GPX with metadata and stages
CREATE OR REPLACE FUNCTION api.export_itinerary_gpx(
  p_object_id TEXT,
  p_include_stages BOOLEAN DEFAULT TRUE,
  p_include_metadata BOOLEAN DEFAULT TRUE
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
DECLARE
  v_gpx TEXT;
  v_metadata TEXT := '';
  v_waypoints TEXT := '';
  v_name TEXT;
  v_description TEXT;
BEGIN
  -- Get itinerary basic info
  SELECT o.name, od.description
  INTO v_name, v_description
  FROM object o
  LEFT JOIN object_description od ON od.object_id = o.id AND od.org_object_id IS NULL
  WHERE o.id = p_object_id AND o.object_type = 'ITI';

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Build GPX header with metadata
  IF p_include_metadata THEN
    v_metadata := format(
      '<metadata>
  <name>%s</name>
  <desc>%s</desc>
  <author><name>Bertel API</name></author>
  <time>%s</time>
</metadata>',
      replace(replace(v_name, '&', '&amp;'), '<', '&lt;'),
      replace(replace(COALESCE(LEFT(v_description, 500), ''), '&', '&amp;'), '<', '&lt;'),
      to_char(NOW(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    );
  END IF;

  -- Get cached track (trkpts already formatted)
  SELECT cached_gpx INTO v_gpx
  FROM object_iti
  WHERE object_id = p_object_id;

  -- Add stages as waypoints
  IF p_include_stages THEN
    SELECT string_agg(
      format(
        '<wpt lat="%s" lon="%s">
  <name>%s</name>
  <desc>%s</desc>
  <type>stage</type>
</wpt>',
        ST_Y(geom::geometry),
        ST_X(geom::geometry),
        replace(replace(COALESCE(name, 'Stage ' || position), '&', '&amp;'), '<', '&lt;'),
        replace(replace(COALESCE(description, ''), '&', '&amp;'), '<', '&lt;')
      ),
      E'\n'
      ORDER BY position
    )
    INTO v_waypoints
    FROM object_iti_stage
    WHERE object_id = p_object_id AND geom IS NOT NULL;
  END IF;

  -- Assemble complete GPX
  RETURN format(
    '<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Bertel API" xmlns="http://www.topografix.com/GPX/1/1">
%s
%s
  <trk>
    <name>%s</name>
    <trkseg>
%s
    </trkseg>
  </trk>
</gpx>',
    COALESCE(v_metadata, ''),
    COALESCE(v_waypoints, ''),
    replace(replace(v_name, '&', '&amp;'), '<', '&lt;'),
    COALESCE(v_gpx, '')
  );
END;
$$;

-- Batch GPX export for multiple itineraries
CREATE OR REPLACE FUNCTION api.export_itineraries_gpx_batch(
  p_object_ids TEXT[],
  p_include_stages BOOLEAN DEFAULT TRUE
)
RETURNS TABLE(
  object_id TEXT,
  name TEXT,
  gpx_data TEXT,
  file_size INTEGER
)
LANGUAGE sql
STABLE

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
  SELECT 
    o.id,
    o.name,
    api.export_itinerary_gpx(o.id, p_include_stages, TRUE),
    LENGTH(api.export_itinerary_gpx(o.id, p_include_stages, TRUE))
  FROM object o
  WHERE o.id = ANY(p_object_ids)
    AND o.object_type = 'ITI'
  ORDER BY o.name;
$$;

-- Simplified track for map display (lightweight GeoJSON)
CREATE OR REPLACE FUNCTION api.get_itinerary_track_simplified(
  p_object_id TEXT,
  p_tolerance FLOAT DEFAULT 0.0001  -- ~10m simplification tolerance
)
RETURNS JSON
LANGUAGE sql
STABLE

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
  SELECT json_build_object(
    'type', 'LineString',
    'coordinates', 
    (ST_AsGeoJSON(
      ST_Simplify(geom::geometry, p_tolerance),
      6  -- 6 decimal places (~0.1m precision)
    )::json)->'coordinates'
  )
  FROM object_iti
  WHERE object_id = p_object_id;
$$;

-- Get track with stages as GeoJSON FeatureCollection
CREATE OR REPLACE FUNCTION api.get_itinerary_track_geojson(
  p_object_id TEXT,
  p_simplify BOOLEAN DEFAULT FALSE,
  p_tolerance FLOAT DEFAULT 0.0001
)
RETURNS JSON
LANGUAGE plpgsql
STABLE

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
DECLARE
  v_track JSON;
  v_stages JSON;
BEGIN
  -- Get main track
  SELECT json_build_object(
    'type', 'Feature',
    'geometry', json_build_object(
      'type', 'LineString',
      'coordinates', 
      (ST_AsGeoJSON(
        CASE 
          WHEN p_simplify THEN ST_Simplify(geom::geometry, p_tolerance)
          ELSE geom::geometry
        END,
        6
      )::json)->'coordinates'
    ),
    'properties', json_build_object(
      'object_id', object_id,
      'type', 'track',
      'distance_km', distance_km,
      'duration_hours', duration_hours,
      'difficulty_level', difficulty_level,
      'elevation_gain', elevation_gain,
      'is_loop', is_loop
    )
  )
  INTO v_track
  FROM object_iti
  WHERE object_id = p_object_id;

  -- Get stages as points
  SELECT COALESCE(json_agg(
    json_build_object(
      'type', 'Feature',
      'geometry', json_build_object(
        'type', 'Point',
        'coordinates', json_build_array(
          ST_X(geom::geometry),
          ST_Y(geom::geometry)
        )
      ),
      'properties', json_build_object(
        'stage_id', id,
        'name', name,
        'description', description,
        'position', position
      )
    )
    ORDER BY position
  ), '[]'::json)
  INTO v_stages
  FROM object_iti_stage
  WHERE object_id = p_object_id AND geom IS NOT NULL;

  -- Return as FeatureCollection
  RETURN json_build_object(
    'type', 'FeatureCollection',
    'features', json_build_array(v_track)::jsonb || v_stages::jsonb
  );
END;
$$;

-- =====================================================
-- UNIFIED LEGAL SYSTEM API FUNCTIONS
-- =====================================================

-- =====================================================
-- Function to get expiring legal records
-- =====================================================
CREATE OR REPLACE FUNCTION api.get_expiring_legal_records(
  p_days_ahead INTEGER DEFAULT 30,
  p_object_id TEXT DEFAULT NULL,
  p_type_codes TEXT[] DEFAULT NULL
)
RETURNS TABLE(
  legal_id UUID,
  object_id TEXT,
  object_name TEXT,
  object_type TEXT,
  legal_type_code TEXT,
  legal_type_name TEXT,
  value JSONB,
  valid_to DATE,
  days_until_expiry INTEGER,
  status TEXT
)
LANGUAGE plpgsql
STABLE

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ol.id,
    ol.object_id,
    o.name,
    o.object_type::TEXT,
    rlt.code,
    rlt.name,
    ol.value,
    ol.valid_to,
    (ol.valid_to - CURRENT_DATE)::INTEGER,
    ol.status
  FROM object_legal ol
  JOIN object o ON o.id = ol.object_id
  JOIN ref_legal_type rlt ON rlt.id = ol.type_id
  WHERE ol.valid_to IS NOT NULL
    AND ol.valid_to BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '1 day' * p_days_ahead
    AND ol.status = 'active'
    AND (p_object_id IS NULL OR ol.object_id = p_object_id)
    AND (p_type_codes IS NULL OR rlt.code = ANY(p_type_codes))
  ORDER BY ol.valid_to ASC, o.name;
END;
$$;

-- =====================================================
-- Function to get all legal records for an object
-- =====================================================
CREATE OR REPLACE FUNCTION api.get_object_legal_records(p_object_id TEXT)
RETURNS TABLE(
  legal_id UUID,
  type_code TEXT,
  type_name TEXT,
  type_category TEXT,
  type_is_public BOOLEAN,
  value JSONB,
  document_id UUID,
  valid_from DATE,
  valid_to DATE,
  validity_mode TEXT,
  status TEXT,
  document_requested_at TIMESTAMPTZ,
  document_delivered_at TIMESTAMPTZ,
  note TEXT,
  days_until_expiry INTEGER
)
LANGUAGE plpgsql
STABLE

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ol.id,
    rlt.code,
    rlt.name,
    rlt.category,
    rlt.is_public,
    ol.value,
    ol.document_id,
    ol.valid_from,
    ol.valid_to,
    ol.validity_mode::TEXT,
    ol.status,
    ol.document_requested_at,
    ol.document_delivered_at,
    ol.note,
    CASE 
      WHEN ol.valid_to IS NOT NULL THEN (ol.valid_to - CURRENT_DATE)::INTEGER
      ELSE NULL
    END
  FROM object_legal ol
  JOIN ref_legal_type rlt ON rlt.id = ol.type_id
  WHERE ol.object_id = p_object_id
  ORDER BY rlt.category, rlt.name, ol.valid_from DESC;
END;
$$;

-- =====================================================
-- Function to check if an object has all required legal records
-- =====================================================
CREATE OR REPLACE FUNCTION api.check_object_legal_compliance(p_object_id TEXT)
RETURNS TABLE(
  type_code TEXT,
  type_name TEXT,
  is_required BOOLEAN,
  has_record BOOLEAN,
  is_valid BOOLEAN,
  status TEXT,
  valid_to DATE,
  days_until_expiry INTEGER
)
LANGUAGE plpgsql
STABLE

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    rlt.code,
    rlt.name,
    rlt.is_required,
    (ol.id IS NOT NULL) as has_record,
    (ol.id IS NOT NULL AND ol.status = 'active' AND 
     (ol.valid_to IS NULL OR ol.valid_to >= CURRENT_DATE)) as is_valid,
    COALESCE(ol.status, 'missing'),
    ol.valid_to,
    CASE 
      WHEN ol.valid_to IS NOT NULL THEN (ol.valid_to - CURRENT_DATE)::INTEGER
      ELSE NULL
    END
  FROM ref_legal_type rlt
  LEFT JOIN object_legal ol ON ol.object_id = p_object_id 
    AND ol.type_id = rlt.id 
    AND ol.status = 'active'
  ORDER BY rlt.is_required DESC, rlt.category, rlt.name;
END;
$$;

-- =====================================================
-- Function to add a legal record
-- =====================================================
CREATE OR REPLACE FUNCTION api.add_legal_record(
  p_object_id TEXT,
  p_type_code TEXT,
  p_value JSONB,
  p_document_id UUID DEFAULT NULL,
  p_valid_from DATE DEFAULT CURRENT_DATE,
  p_valid_to DATE DEFAULT NULL,
  p_validity_mode legal_validity_mode DEFAULT 'fixed_end_date',
  p_status TEXT DEFAULT 'active',
  p_document_requested_at TIMESTAMPTZ DEFAULT NULL,
  p_document_delivered_at TIMESTAMPTZ DEFAULT NULL,
  p_note TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
DECLARE
  v_type_id UUID;
  v_legal_id UUID;
BEGIN
  -- Get type_id from code
  SELECT id INTO v_type_id 
  FROM ref_legal_type 
  WHERE code = p_type_code;
  
  IF v_type_id IS NULL THEN
    RAISE EXCEPTION 'Legal type with code % not found', p_type_code;
  END IF;
  
  -- Validate constraints
  IF p_validity_mode = 'forever' AND p_valid_to IS NOT NULL THEN
    RAISE EXCEPTION 'validity_mode forever requires valid_to to be NULL';
  END IF;
  
  IF p_validity_mode = 'fixed_end_date' AND p_valid_to IS NULL THEN
    RAISE EXCEPTION 'validity_mode fixed_end_date requires valid_to to be NOT NULL';
  END IF;
  
  IF p_valid_to IS NOT NULL AND p_valid_to < p_valid_from THEN
    RAISE EXCEPTION 'valid_to cannot be before valid_from';
  END IF;
  
  IF p_status = 'requested' AND p_document_requested_at IS NULL THEN
    RAISE EXCEPTION 'status requested requires document_requested_at to be NOT NULL';
  END IF;
  
  IF p_document_delivered_at IS NOT NULL AND p_document_requested_at IS NOT NULL AND p_document_delivered_at < p_document_requested_at THEN
    RAISE EXCEPTION 'document_delivered_at cannot be before document_requested_at';
  END IF;
  
  -- Insert the legal record
  INSERT INTO object_legal (
    object_id, type_id, value, document_id, 
    valid_from, valid_to, validity_mode, status,
    document_requested_at, document_delivered_at, note
  ) VALUES (
    p_object_id, v_type_id, p_value, p_document_id,
    p_valid_from, p_valid_to, p_validity_mode, p_status,
    p_document_requested_at, p_document_delivered_at, p_note
  ) RETURNING id INTO v_legal_id;
  
  RETURN v_legal_id;
END;
$$;

-- =====================================================
-- Function to update a legal record
-- =====================================================
CREATE OR REPLACE FUNCTION api.update_legal_record(
  p_legal_id UUID,
  p_value JSONB DEFAULT NULL,
  p_document_id UUID DEFAULT NULL,
  p_valid_from DATE DEFAULT NULL,
  p_valid_to DATE DEFAULT NULL,
  p_validity_mode legal_validity_mode DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_document_requested_at TIMESTAMPTZ DEFAULT NULL,
  p_document_delivered_at TIMESTAMPTZ DEFAULT NULL,
  p_note TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
DECLARE
  v_updated BOOLEAN := FALSE;
BEGIN
  -- Validate constraints
  IF p_validity_mode = 'forever' AND p_valid_to IS NOT NULL THEN
    RAISE EXCEPTION 'validity_mode forever requires valid_to to be NULL';
  END IF;
  
  IF p_validity_mode = 'fixed_end_date' AND p_valid_to IS NULL THEN
    RAISE EXCEPTION 'validity_mode fixed_end_date requires valid_to to be NOT NULL';
  END IF;
  
  IF p_status = 'requested' AND p_document_requested_at IS NULL THEN
    RAISE EXCEPTION 'status requested requires document_requested_at to be NOT NULL';
  END IF;
  
  IF p_document_delivered_at IS NOT NULL AND p_document_requested_at IS NOT NULL AND p_document_delivered_at < p_document_requested_at THEN
    RAISE EXCEPTION 'document_delivered_at cannot be before document_requested_at';
  END IF;
  
  -- Update the legal record
  UPDATE object_legal SET
    value = COALESCE(p_value, value),
    document_id = COALESCE(p_document_id, document_id),
    valid_from = COALESCE(p_valid_from, valid_from),
    valid_to = COALESCE(p_valid_to, valid_to),
    validity_mode = COALESCE(p_validity_mode, validity_mode),
    status = COALESCE(p_status, status),
    document_requested_at = COALESCE(p_document_requested_at, document_requested_at),
    document_delivered_at = COALESCE(p_document_delivered_at, document_delivered_at),
    note = COALESCE(p_note, note),
    updated_at = NOW()
  WHERE id = p_legal_id;
  
  v_updated := FOUND;
  RETURN v_updated;
END;
$$;

-- =====================================================
-- Function to get legal data in API format
-- =====================================================
CREATE OR REPLACE FUNCTION api.get_object_legal_data(p_object_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
DECLARE
  v_legal_data JSONB := '[]'::jsonb;
  v_legal_record RECORD;
BEGIN
  -- Get all legal records for the object
  FOR v_legal_record IN
    SELECT 
      ol.id,
      rlt.code as type_code,
      rlt.name as type_name,
      rlt.category,
      rlt.is_public as type_is_public,
      ol.value,
      ol.document_id,
      ol.valid_from,
      ol.valid_to,
      ol.validity_mode::text,
      ol.status,
      ol.document_requested_at,
      ol.document_delivered_at,
      ol.note,
      CASE 
        WHEN ol.valid_to IS NOT NULL THEN (ol.valid_to - CURRENT_DATE)::INTEGER
        ELSE NULL
      END as days_until_expiry
    FROM object_legal ol
    JOIN ref_legal_type rlt ON rlt.id = ol.type_id
    WHERE ol.object_id = p_object_id
    ORDER BY rlt.category, rlt.name, ol.valid_from DESC
  LOOP
    v_legal_data := v_legal_data || jsonb_build_object(
      'id', v_legal_record.id,
      'type', jsonb_build_object(
        'code', v_legal_record.type_code,
        'name', v_legal_record.type_name,
        'category', v_legal_record.category,
        'is_public', v_legal_record.type_is_public
      ),
      'value', v_legal_record.value,
      'document_id', v_legal_record.document_id,
      'valid_from', v_legal_record.valid_from,
      'valid_to', v_legal_record.valid_to,
      'validity_mode', v_legal_record.validity_mode,
      'status', v_legal_record.status,
      'document_requested_at', v_legal_record.document_requested_at,
      'document_delivered_at', v_legal_record.document_delivered_at,
      'note', v_legal_record.note,
      'days_until_expiry', v_legal_record.days_until_expiry
    );
  END LOOP;

  RETURN v_legal_data;
END;
$$;

-- =====================================================
-- Function to get legal compliance in API format
-- =====================================================
CREATE OR REPLACE FUNCTION api.get_object_legal_compliance(p_object_id TEXT)
RETURNS JSON
LANGUAGE plpgsql
STABLE

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
DECLARE
  v_compliance_data JSONB;
  v_required_count INTEGER;
  v_valid_count INTEGER;
  v_expiring_count INTEGER;
  v_missing_count INTEGER;
BEGIN
  -- Get compliance data
  SELECT 
    COUNT(*) FILTER (WHERE rlt.is_required = true) as required_count,
    COUNT(*) FILTER (WHERE rlt.is_required = true AND ol.status = 'active' AND 
                     (ol.valid_to IS NULL OR ol.valid_to >= CURRENT_DATE)) as valid_count,
    COUNT(*) FILTER (WHERE rlt.is_required = true AND ol.status = 'active' AND 
                     ol.valid_to IS NOT NULL AND ol.valid_to BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days') as expiring_count,
    COUNT(*) FILTER (WHERE rlt.is_required = true AND ol.id IS NULL) as missing_count
  INTO v_required_count, v_valid_count, v_expiring_count, v_missing_count
  FROM ref_legal_type rlt
  LEFT JOIN object_legal ol ON ol.object_id = p_object_id 
    AND ol.type_id = rlt.id 
    AND ol.status = 'active'
  WHERE rlt.is_required = true;

  -- Build compliance summary
  v_compliance_data := jsonb_build_object(
    'object_id', p_object_id,
    'compliance_status', CASE 
      WHEN v_missing_count = 0 AND v_expiring_count = 0 THEN 'compliant'
      WHEN v_missing_count = 0 AND v_expiring_count > 0 THEN 'expiring'
      WHEN v_missing_count > 0 THEN 'non_compliant'
      ELSE 'unknown'
    END,
    'summary', jsonb_build_object(
      'required_count', v_required_count,
      'valid_count', v_valid_count,
      'expiring_count', v_expiring_count,
      'missing_count', v_missing_count,
      'compliance_percentage', CASE 
        WHEN v_required_count > 0 THEN ROUND((v_valid_count::DECIMAL / v_required_count) * 100, 2)
        ELSE 0
      END
    ),
    'details', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'type_code', rlt.code,
          'type_name', rlt.name,
          'is_required', rlt.is_required,
          'has_record', (ol.id IS NOT NULL),
          'is_valid', (ol.id IS NOT NULL AND ol.status = 'active' AND 
                      (ol.valid_to IS NULL OR ol.valid_to >= CURRENT_DATE)),
          'status', COALESCE(ol.status, 'missing'),
          'valid_to', ol.valid_to,
          'days_until_expiry', CASE 
            WHEN ol.valid_to IS NOT NULL THEN (ol.valid_to - CURRENT_DATE)::INTEGER
            ELSE NULL
          END
        )
        ORDER BY rlt.is_required DESC, rlt.category, rlt.name
      )
      FROM ref_legal_type rlt
      LEFT JOIN object_legal ol ON ol.object_id = p_object_id 
        AND ol.type_id = rlt.id 
        AND ol.status = 'active'
    )
  );

  RETURN v_compliance_data::json;
END;
$$;

-- =====================================================
-- Function to get expiring legal records in API format
-- =====================================================
CREATE OR REPLACE FUNCTION api.get_expiring_legal_records_api(
  p_days_ahead INTEGER DEFAULT 30,
  p_object_types TEXT[] DEFAULT NULL,
  p_legal_types TEXT[] DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
STABLE

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_agg(
    jsonb_build_object(
      'legal_id', legal_id,
      'object_id', object_id,
      'object_name', object_name,
      'object_type', object_type,
      'legal_type_code', legal_type_code,
      'legal_type_name', legal_type_name,
      'value', value,
      'valid_to', valid_to,
      'days_until_expiry', days_until_expiry,
      'status', status
    )
    ORDER BY valid_to ASC, object_name
  )
  INTO v_result
  FROM api.get_expiring_legal_records(p_days_ahead, NULL, p_legal_types) er
  JOIN object o ON o.id = er.object_id
  WHERE p_object_types IS NULL OR o.object_type::text = ANY(p_object_types);

  RETURN COALESCE(v_result, '[]'::jsonb)::json;
END;
$$;

-- =====================================================
-- Function to generate legal expiry notifications
-- =====================================================
CREATE OR REPLACE FUNCTION api.generate_legal_expiry_notifications(
  p_days_ahead INTEGER DEFAULT 30,
  p_object_types TEXT[] DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
STABLE

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
DECLARE
  v_notifications JSONB;
BEGIN
  SELECT jsonb_agg(
    jsonb_build_object(
      'notification_type', 'legal_expiry',
      'priority', CASE 
        WHEN days_until_expiry <= 7 THEN 'high'
        WHEN days_until_expiry <= 14 THEN 'medium'
        ELSE 'low'
      END,
      'object_id', object_id,
      'object_name', object_name,
      'object_type', object_type,
      'legal_type', legal_type_name,
      'expiry_date', valid_to,
      'days_until_expiry', days_until_expiry,
      'action_required', 'Renew or update legal record',
      'created_at', NOW()
    )
    ORDER BY days_until_expiry ASC, object_name
  )
  INTO v_notifications
  FROM api.get_expiring_legal_records(p_days_ahead, NULL, NULL) er
  JOIN object o ON o.id = er.object_id
  WHERE p_object_types IS NULL OR o.object_type::text = ANY(p_object_types);

  RETURN COALESCE(v_notifications, '[]'::jsonb)::json;
END;
$$;

-- =====================================================
-- Function to audit legal compliance across all objects
-- =====================================================
CREATE OR REPLACE FUNCTION api.audit_legal_compliance(
  p_object_types TEXT[] DEFAULT NULL,
  p_include_expired BOOLEAN DEFAULT FALSE
)
RETURNS JSON
LANGUAGE plpgsql
STABLE

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
DECLARE
  v_audit_data JSONB;
  v_total_objects INTEGER;
  v_compliant_objects INTEGER;
  v_non_compliant_objects INTEGER;
  v_expiring_objects INTEGER;
BEGIN
  -- Get object counts
  SELECT 
    COUNT(DISTINCT o.id) as total,
    COUNT(DISTINCT o.id) FILTER (WHERE compliance_status = 'compliant') as compliant,
    COUNT(DISTINCT o.id) FILTER (WHERE compliance_status = 'non_compliant') as non_compliant,
    COUNT(DISTINCT o.id) FILTER (WHERE compliance_status = 'expiring') as expiring
  INTO v_total_objects, v_compliant_objects, v_non_compliant_objects, v_expiring_objects
  FROM object o
  LEFT JOIN LATERAL (
    SELECT 
      CASE 
        WHEN COUNT(*) FILTER (WHERE rlt.is_required = true AND ol.id IS NULL) > 0 THEN 'non_compliant'
        WHEN COUNT(*) FILTER (WHERE rlt.is_required = true AND ol.status = 'active' AND 
                              ol.valid_to IS NOT NULL AND ol.valid_to BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days') > 0 THEN 'expiring'
        WHEN COUNT(*) FILTER (WHERE rlt.is_required = true AND ol.status = 'active' AND 
                              (ol.valid_to IS NULL OR ol.valid_to >= CURRENT_DATE)) = 
             COUNT(*) FILTER (WHERE rlt.is_required = true) THEN 'compliant'
        ELSE 'unknown'
      END as compliance_status
    FROM ref_legal_type rlt
    LEFT JOIN object_legal ol ON ol.object_id = o.id 
      AND ol.type_id = rlt.id 
      AND (p_include_expired OR ol.status = 'active')
    WHERE rlt.is_required = true
  ) compliance ON true
  WHERE o.status = 'published'
    AND (p_object_types IS NULL OR o.object_type::text = ANY(p_object_types));

  -- Build audit summary
  v_audit_data := jsonb_build_object(
    'audit_date', CURRENT_DATE,
    'summary', jsonb_build_object(
      'total_objects', v_total_objects,
      'compliant_objects', v_compliant_objects,
      'non_compliant_objects', v_non_compliant_objects,
      'expiring_objects', v_expiring_objects,
      'compliance_rate', CASE 
        WHEN v_total_objects > 0 THEN ROUND((v_compliant_objects::DECIMAL / v_total_objects) * 100, 2)
        ELSE 0
      END
    ),
    'object_types', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'object_type', ot.object_type,
          'total_count', ot.total_count,
          'compliant_count', ot.compliant_count,
          'non_compliant_count', ot.non_compliant_count,
          'expiring_count', ot.expiring_count,
          'compliance_rate', CASE 
            WHEN ot.total_count > 0 THEN ROUND((ot.compliant_count::DECIMAL / ot.total_count) * 100, 2)
            ELSE 0
          END
        )
        ORDER BY ot.object_type
      )
      FROM (
        SELECT 
          o.object_type::text as object_type,
          COUNT(DISTINCT o.id) as total_count,
          COUNT(DISTINCT o.id) FILTER (WHERE compliance_status = 'compliant') as compliant_count,
          COUNT(DISTINCT o.id) FILTER (WHERE compliance_status = 'non_compliant') as non_compliant_count,
          COUNT(DISTINCT o.id) FILTER (WHERE compliance_status = 'expiring') as expiring_count
        FROM object o
        LEFT JOIN LATERAL (
          SELECT 
            CASE 
              WHEN COUNT(*) FILTER (WHERE rlt.is_required = true AND ol.id IS NULL) > 0 THEN 'non_compliant'
              WHEN COUNT(*) FILTER (WHERE rlt.is_required = true AND ol.status = 'active' AND 
                                    ol.valid_to IS NOT NULL AND ol.valid_to BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days') > 0 THEN 'expiring'
              WHEN COUNT(*) FILTER (WHERE rlt.is_required = true AND ol.status = 'active' AND 
                                    (ol.valid_to IS NULL OR ol.valid_to >= CURRENT_DATE)) = 
                   COUNT(*) FILTER (WHERE rlt.is_required = true) THEN 'compliant'
              ELSE 'unknown'
            END as compliance_status
          FROM ref_legal_type rlt
          LEFT JOIN object_legal ol ON ol.object_id = o.id 
            AND ol.type_id = rlt.id 
            AND (p_include_expired OR ol.status = 'active')
          WHERE rlt.is_required = true
        ) compliance ON true
        WHERE o.status = 'published'
          AND (p_object_types IS NULL OR o.object_type::text = ANY(p_object_types))
        GROUP BY o.object_type
      ) ot
    )
  );

  RETURN v_audit_data::json;
END;
$$;

-- =====================================================
-- Function to request a document for a legal record
-- =====================================================
CREATE OR REPLACE FUNCTION api.request_legal_document(
  p_legal_id UUID,
  p_requested_at TIMESTAMPTZ DEFAULT NOW()
)
RETURNS BOOLEAN
LANGUAGE plpgsql

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
DECLARE
  v_updated BOOLEAN := FALSE;
BEGIN
  -- Update the legal record to requested status
  UPDATE object_legal SET
    status = 'requested',
    document_requested_at = p_requested_at,
    document_delivered_at = NULL, -- Clear delivery date when requesting
    updated_at = NOW()
  WHERE id = p_legal_id;
  
  v_updated := FOUND;
  RETURN v_updated;
END;
$$;

-- =====================================================
-- Function to mark a document as delivered
-- =====================================================
CREATE OR REPLACE FUNCTION api.deliver_legal_document(
  p_legal_id UUID,
  p_document_id UUID,
  p_delivered_at TIMESTAMPTZ DEFAULT NOW(),
  p_new_status TEXT DEFAULT 'active'
)
RETURNS BOOLEAN
LANGUAGE plpgsql

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
DECLARE
  v_updated BOOLEAN := FALSE;
BEGIN
  -- Validate new status
  IF p_new_status NOT IN ('active', 'expired', 'suspended', 'revoked') THEN
    RAISE EXCEPTION 'Invalid status: %. Must be one of: active, expired, suspended, revoked', p_new_status;
  END IF;
  
  -- Update the legal record to mark document as delivered
  UPDATE object_legal SET
    status = p_new_status,
    document_id = p_document_id,
    document_delivered_at = p_delivered_at,
    updated_at = NOW()
  WHERE id = p_legal_id;
  
  v_updated := FOUND;
  RETURN v_updated;
END;
$$;

-- =====================================================
-- Function to get pending document requests
-- =====================================================
CREATE OR REPLACE FUNCTION api.get_pending_document_requests(
  p_object_id TEXT DEFAULT NULL,
  p_type_codes TEXT[] DEFAULT NULL
)
RETURNS TABLE(
  legal_id UUID,
  object_id TEXT,
  object_name TEXT,
  object_type TEXT,
  legal_type_code TEXT,
  legal_type_name TEXT,
  value JSONB,
  document_requested_at TIMESTAMPTZ,
  days_since_requested INTEGER,
  note TEXT
)
LANGUAGE plpgsql
STABLE

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ol.id,
    ol.object_id,
    o.name,
    o.object_type::TEXT,
    rlt.code,
    rlt.name,
    ol.value,
    ol.document_requested_at,
    (CURRENT_DATE - ol.document_requested_at::DATE)::INTEGER,
    ol.note
  FROM object_legal ol
  JOIN object o ON o.id = ol.object_id
  JOIN ref_legal_type rlt ON rlt.id = ol.type_id
  WHERE ol.status = 'requested'
    AND (p_object_id IS NULL OR ol.object_id = p_object_id)
    AND (p_type_codes IS NULL OR rlt.code = ANY(p_type_codes))
  ORDER BY ol.document_requested_at ASC, o.name;
END;
$$;

-- =====================================================
-- Function to get pending document requests in API format
-- =====================================================
CREATE OR REPLACE FUNCTION api.get_pending_document_requests_api(
  p_object_id TEXT DEFAULT NULL,
  p_type_codes TEXT[] DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
STABLE

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_agg(
    jsonb_build_object(
      'legal_id', legal_id,
      'object_id', object_id,
      'object_name', object_name,
      'object_type', object_type,
      'legal_type_code', legal_type_code,
      'legal_type_name', legal_type_name,
      'value', value,
      'document_requested_at', document_requested_at,
      'days_since_requested', days_since_requested,
      'note', note
    )
    ORDER BY document_requested_at ASC, object_name
  )
  INTO v_result
  FROM api.get_pending_document_requests(p_object_id, p_type_codes);

  RETURN COALESCE(v_result, '[]'::jsonb)::json;
END;
$$;

-- =====================================================
-- Function to get legal records filtered by visibility
-- =====================================================
CREATE OR REPLACE FUNCTION api.get_object_legal_records_by_visibility(
  p_object_id TEXT,
  p_is_public BOOLEAN DEFAULT NULL
)
RETURNS TABLE(
  legal_id UUID,
  type_code TEXT,
  type_name TEXT,
  type_category TEXT,
  type_is_public BOOLEAN,
  value JSONB,
  document_id UUID,
  valid_from DATE,
  valid_to DATE,
  validity_mode TEXT,
  status TEXT,
  document_requested_at TIMESTAMPTZ,
  document_delivered_at TIMESTAMPTZ,
  note TEXT,
  days_until_expiry INTEGER
)
LANGUAGE plpgsql
STABLE

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ol.id,
    rlt.code,
    rlt.name,
    rlt.category,
    rlt.is_public,
    ol.value,
    ol.document_id,
    ol.valid_from,
    ol.valid_to,
    ol.validity_mode::TEXT,
    ol.status,
    ol.document_requested_at,
    ol.document_delivered_at,
    ol.note,
    CASE 
      WHEN ol.valid_to IS NOT NULL THEN (ol.valid_to - CURRENT_DATE)::INTEGER
      ELSE NULL
    END
  FROM object_legal ol
  JOIN ref_legal_type rlt ON rlt.id = ol.type_id
  WHERE ol.object_id = p_object_id
    AND (p_is_public IS NULL OR rlt.is_public = p_is_public)
  ORDER BY rlt.category, rlt.name, ol.valid_from DESC;
END;
$$;

-- =====================================================
-- Function to get public legal records only
-- =====================================================
CREATE OR REPLACE FUNCTION api.get_object_public_legal_records(p_object_id TEXT)
RETURNS JSON
LANGUAGE plpgsql
STABLE

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
DECLARE
  v_legal_data JSONB := '[]'::jsonb;
  v_legal_record RECORD;
BEGIN
  -- Get only public legal records for the object
  FOR v_legal_record IN
    SELECT 
      ol.id,
      rlt.code as type_code,
      rlt.name as type_name,
      rlt.category,
      rlt.is_public as type_is_public,
      ol.value,
      ol.document_id,
      ol.valid_from,
      ol.valid_to,
      ol.validity_mode::text,
      ol.status,
      ol.document_requested_at,
      ol.document_delivered_at,
      ol.note,
      CASE 
        WHEN ol.valid_to IS NOT NULL THEN (ol.valid_to - CURRENT_DATE)::INTEGER
        ELSE NULL
      END as days_until_expiry
    FROM object_legal ol
    JOIN ref_legal_type rlt ON rlt.id = ol.type_id
    WHERE ol.object_id = p_object_id
      AND rlt.is_public = true
    ORDER BY rlt.category, rlt.name, ol.valid_from DESC
  LOOP
    v_legal_data := v_legal_data || jsonb_build_object(
      'id', v_legal_record.id,
      'type', jsonb_build_object(
        'code', v_legal_record.type_code,
        'name', v_legal_record.type_name,
        'category', v_legal_record.category,
        'is_public', v_legal_record.type_is_public
      ),
      'value', v_legal_record.value,
      'document_id', v_legal_record.document_id,
      'valid_from', v_legal_record.valid_from,
      'valid_to', v_legal_record.valid_to,
      'validity_mode', v_legal_record.validity_mode,
      'status', v_legal_record.status,
      'document_requested_at', v_legal_record.document_requested_at,
      'document_delivered_at', v_legal_record.document_delivered_at,
      'note', v_legal_record.note,
      'days_until_expiry', v_legal_record.days_until_expiry
    );
  END LOOP;

  RETURN v_legal_data::json;
END;
$$;

-- =====================================================
-- Function to get private legal records only (for parent org)
-- =====================================================
CREATE OR REPLACE FUNCTION api.get_object_private_legal_records(p_object_id TEXT)
RETURNS JSON
LANGUAGE plpgsql
STABLE

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
DECLARE
  v_legal_data JSONB := '[]'::jsonb;
  v_legal_record RECORD;
BEGIN
  -- Get only private legal records for the object
  FOR v_legal_record IN
    SELECT 
      ol.id,
      rlt.code as type_code,
      rlt.name as type_name,
      rlt.category,
      rlt.is_public as type_is_public,
      ol.value,
      ol.document_id,
      ol.valid_from,
      ol.valid_to,
      ol.validity_mode::text,
      ol.status,
      ol.document_requested_at,
      ol.document_delivered_at,
      ol.note,
      CASE 
        WHEN ol.valid_to IS NOT NULL THEN (ol.valid_to - CURRENT_DATE)::INTEGER
        ELSE NULL
      END as days_until_expiry
    FROM object_legal ol
    JOIN ref_legal_type rlt ON rlt.id = ol.type_id
    WHERE ol.object_id = p_object_id
      AND rlt.is_public = false
    ORDER BY rlt.category, rlt.name, ol.valid_from DESC
  LOOP
    v_legal_data := v_legal_data || jsonb_build_object(
      'id', v_legal_record.id,
      'type', jsonb_build_object(
        'code', v_legal_record.type_code,
        'name', v_legal_record.type_name,
        'category', v_legal_record.category,
        'is_public', v_legal_record.type_is_public
      ),
      'value', v_legal_record.value,
      'document_id', v_legal_record.document_id,
      'valid_from', v_legal_record.valid_from,
      'valid_to', v_legal_record.valid_to,
      'validity_mode', v_legal_record.validity_mode,
      'status', v_legal_record.status,
      'document_requested_at', v_legal_record.document_requested_at,
      'document_delivered_at', v_legal_record.document_delivered_at,
      'note', v_legal_record.note,
      'days_until_expiry', v_legal_record.days_until_expiry
    );
  END LOOP;

  RETURN v_legal_data::json;
END;
$$;

-- =====================================================
-- List objects with validated modifications since date
-- Returns object IDs that have had approved or applied changes
-- =====================================================
CREATE OR REPLACE FUNCTION api.list_objects_with_validated_changes_since(
  p_since TIMESTAMPTZ
)
RETURNS JSON
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, api, auth
AS $$
  SELECT COALESCE(
    json_agg(DISTINCT object_id ORDER BY object_id),
    '[]'::json
  )
  FROM pending_change
  WHERE object_id IS NOT NULL
    AND auth.role() IN ('service_role', 'admin')
    AND status IN ('approved', 'applied')
    AND COALESCE(applied_at, reviewed_at) >= p_since;
$$;

COMMENT ON FUNCTION api.list_objects_with_validated_changes_since IS 
'Returns a JSON array of object IDs that have had validated modifications (approved or applied) since the specified date. Uses applied_at timestamp if available, otherwise reviewed_at.';

-- =====================================================
-- Adapted / FALC resource (simplified, accessibility-friendly)
-- Returns essential fields with description_adapted preferred
-- over regular description (fallback when adapted is NULL).
-- =====================================================
DROP FUNCTION IF EXISTS api.get_object_resource_adapted(text, text[]);
CREATE OR REPLACE FUNCTION api.get_object_resource_adapted(
  p_object_id  TEXT,
  p_lang_prefs TEXT[] DEFAULT ARRAY['fr']::text[]
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, api, auth
AS $$
DECLARE
  lang TEXT := api.pick_lang(p_lang_prefs);
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'id',    o.id,
    'type',  o.object_type::text,
    'name',  o.name,
    'status', o.status::text,
    'image', o.cached_main_image_url,
    'open_now', o.cached_is_open_now,

    -- Prefer description_adapted, fallback to description
    'description', COALESCE(
      api.i18n_pick(d.description_adapted_i18n, lang, 'fr'),
      d.description_adapted,
      api.i18n_pick(d.description_i18n, lang, 'fr'),
      d.description
    ),

    -- Prefer description_adapted (short) for chapo, fallback to description_chapo
    'description_chapo', COALESCE(
      api.i18n_pick(d.description_adapted_i18n, lang, 'fr'),
      d.description_adapted,
      api.i18n_pick(d.description_chapo_i18n, lang, 'fr'),
      d.description_chapo
    ),

    -- Simplified location
    'location', jsonb_build_object(
      'city',     ol.city,
      'postcode', ol.postcode,
      'latitude', ol.latitude,
      'longitude', ol.longitude,
      'address1', ol.address1
    ),

    -- Primary phone + email only
    'contact', jsonb_build_object(
      'phone', (
        SELECT c.value
        FROM contact_channel c
        JOIN ref_code_contact_kind ck ON ck.id = c.kind_id
        WHERE c.object_id = o.id
          AND lower(ck.code) = 'phone'
          AND c.is_public = TRUE
        ORDER BY c.is_primary DESC, c.position NULLS LAST
        LIMIT 1
      ),
      'email', (
        SELECT c.value
        FROM contact_channel c
        JOIN ref_code_contact_kind ck ON ck.id = c.kind_id
        WHERE c.object_id = o.id
          AND lower(ck.code) = 'email'
          AND c.is_public = TRUE
        ORDER BY c.is_primary DESC, c.position NULLS LAST
        LIMIT 1
      )
    ),

    -- Accessibility labels (tourisme & handicap classifications)
    -- disability_types: resolves subvalue_ids to disability type strings (motor/hearing/visual/cognitive).
    -- Returns [] if the grant has no subvalue_ids (label awarded without per-type breakdown).
    'accessibility_labels', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'code',             cv.code,
          'label',            COALESCE(api.i18n_pick_strict(cv.name_i18n, lang, 'fr'), cv.name),
          'disability_types', COALESCE((
            SELECT jsonb_agg(cv2.metadata->>'disability_type' ORDER BY cv2.position NULLS LAST)
            FROM unnest(oc.subvalue_ids) AS sv(uid)
            JOIN ref_classification_value cv2 ON cv2.id = sv.uid
            WHERE cv2.metadata->>'disability_type' IS NOT NULL
          ), '[]'::jsonb)
        )
        ORDER BY cv.position NULLS LAST, cv.code
      )
      FROM object_classification oc
      JOIN ref_classification_scheme cs ON cs.id = oc.scheme_id
      JOIN ref_classification_value  cv ON cv.id = oc.value_id
      WHERE oc.object_id = o.id
        AND cs.code = 'LBL_TOURISME_HANDICAP'
        AND oc.status = 'granted'
    ), '[]'::jsonb),

    -- Accessibility amenity coverage: distinct disability types inferred from acc_* amenities present
    -- on the object. Populated from ref_amenity.extra->'disability_types' for each acc_* code.
    -- Non-empty even without a T&H label — useful for discovery and partial-accessibility display.
    'accessibility_amenity_coverage', COALESCE((
      SELECT jsonb_agg(dt_val ORDER BY dt_val)
      FROM (
        SELECT DISTINCT jsonb_array_elements_text(
          COALESCE(ra2.extra->'disability_types', '[]'::jsonb)
        ) AS dt_val
        FROM object_amenity oa2
        JOIN ref_amenity ra2 ON ra2.id = oa2.amenity_id
        WHERE oa2.object_id = o.id
          AND ra2.code LIKE 'acc_%'
      ) AS coverage
    ), '[]'::jsonb),

    'updated_at', o.updated_at
  )
  INTO v_result
  FROM object o
  LEFT JOIN object_location ol
    ON ol.object_id = o.id
   AND ol.is_main_location IS TRUE
  LEFT JOIN object_description d
    ON d.object_id = o.id
   AND d.org_object_id IS NULL
  WHERE o.id = p_object_id
    AND o.status = 'published';

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION api.get_object_resource_adapted IS
'FALC/Accessibility-friendly resource read model. Returns a simplified JSON with
description_adapted preferred over regular description, essential location,
primary phone/email contacts, main image, and LBL_TOURISME_HANDICAP accessibility labels (V5 canonical code).';

-- Batch wrapper
DROP FUNCTION IF EXISTS api.get_object_cards_adapted_batch(text[], text[]);
CREATE OR REPLACE FUNCTION api.get_object_cards_adapted_batch(
  p_ids        TEXT[],
  p_lang_prefs TEXT[] DEFAULT ARRAY['fr']::text[]
)
RETURNS JSON
LANGUAGE sql
STABLE

SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
  SELECT COALESCE(
    json_agg(api.get_object_resource_adapted(t.id, p_lang_prefs) ORDER BY t.ord),
    '[]'::json
  )
  FROM unnest(COALESCE(p_ids, ARRAY[]::text[])) WITH ORDINALITY AS t(id, ord)
  WHERE t.id IS NOT NULL;
$$;

COMMENT ON FUNCTION api.get_object_cards_adapted_batch IS
'Batch wrapper for get_object_resource_adapted. Returns adapted/FALC resources for multiple objects, preserving input order.';

-- =====================================================
-- DASHBOARD PHASE 2A — KPI FUNCTIONS
-- Conventions:
--   • ORG objects are excluded from every aggregation.
--   • p_updated_at_from / p_updated_at_to are inclusive DATE boundaries
--     cast to TIMESTAMPTZ at midnight UTC; to_date adds 1 day for exclusivity.
--   • pending_change is always scoped to the same filtered object pool.
--   • p_status defaults to published-only.
-- =====================================================

-- ─────────────────────────────────────────────────────
-- §1  Hero Scorecards
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION api.get_dashboard_scorecards(
  p_types           object_type[]   DEFAULT NULL,
  p_status          object_status[] DEFAULT ARRAY['published']::object_status[],
  p_filters         JSONB           DEFAULT '{}'::jsonb,
  p_updated_at_from DATE            DEFAULT NULL,
  p_updated_at_to   DATE            DEFAULT NULL
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
  WITH filtered_ids AS (
    SELECT object_id
    FROM api.get_filtered_object_ids(
      p_filters,
      COALESCE(p_types, ARRAY(
        SELECT t
        FROM   unnest(enum_range(null::object_type)) AS t
        WHERE  t <> 'ORG'
      )),
      COALESCE(p_status, ARRAY['published']::object_status[])
    )
  ),
  scoped AS (
    SELECT o.status, o.created_at
    FROM   object o
    JOIN   filtered_ids f ON f.object_id = o.id
    WHERE  o.object_type <> 'ORG'
      AND  (p_updated_at_from IS NULL OR o.updated_at >= p_updated_at_from::timestamptz)
      AND  (p_updated_at_to   IS NULL OR o.updated_at <  (p_updated_at_to + 1)::timestamptz)
  ),
  metrics AS (
    SELECT
      COUNT(*)                                                           AS total,
      COUNT(*) FILTER (WHERE status = 'published')                      AS published,
      COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')  AS delta_30d,
      COUNT(*) FILTER (
        WHERE created_at >= NOW() - INTERVAL '60 days'
          AND created_at <  NOW() - INTERVAL '30 days'
      )                                                                  AS prior_30d
    FROM scoped
  ),
  pending AS (
    SELECT
      COUNT(*) FILTER (WHERE pc.status = 'pending')                               AS cnt,
      ROUND(
        (AVG(
          EXTRACT(EPOCH FROM (COALESCE(pc.applied_at, pc.reviewed_at) - pc.submitted_at))
          / 86400.0
        ) FILTER (
          WHERE pc.status IN ('approved', 'rejected', 'applied')
            AND COALESCE(pc.applied_at, pc.reviewed_at) IS NOT NULL
        ))::numeric,
        1
      )                                                                            AS avg_days
    FROM pending_change pc
    WHERE pc.object_id IN (SELECT object_id FROM filtered_ids)
  )
  SELECT jsonb_build_object(
    'total',                m.total,
    'published',            m.published,
    'published_pct',        COALESCE(ROUND(m.published * 100.0 / NULLIF(m.total, 0), 1), 0.0),
    'avg_completeness',     NULL::numeric,
    'pending_changes',      p.cnt,
    'delta_30d',            m.delta_30d,
    'delta_pct',            CASE
                              WHEN COALESCE(m.prior_30d, 0) = 0 THEN NULL
                              ELSE ROUND((m.delta_30d::numeric / m.prior_30d - 1) * 100, 1)
                            END,
    'avg_processing_days',  p.avg_days
  )
  FROM metrics m, pending p;
$$;

COMMENT ON FUNCTION api.get_dashboard_scorecards IS
'Dashboard §1: hero scorecard aggregates for the filtered object pool.
Returns total/published counts, pending_change count (scoped to same pool),
30-day creation delta vs the prior 30 days, and average processing delay
(COALESCE(applied_at, reviewed_at) - submitted_at) for resolved pending_changes.
avg_completeness is always NULL in Phase 2A; it will be populated in Phase 2C.
ORG objects excluded. p_updated_at_from/to are inclusive DATE boundaries.';

-- ─────────────────────────────────────────────────────
-- §2a  Object Distribution — by Type
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION api.get_dashboard_type_breakdown(
  p_types           object_type[]   DEFAULT NULL,
  p_status          object_status[] DEFAULT ARRAY['published']::object_status[],
  p_filters         JSONB           DEFAULT '{}'::jsonb,
  p_updated_at_from DATE            DEFAULT NULL,
  p_updated_at_to   DATE            DEFAULT NULL
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
  WITH filtered_ids AS (
    SELECT object_id
    FROM api.get_filtered_object_ids(
      p_filters,
      COALESCE(p_types, ARRAY(
        SELECT t
        FROM   unnest(enum_range(null::object_type)) AS t
        WHERE  t <> 'ORG'
      )),
      COALESCE(p_status, ARRAY['published']::object_status[])
    )
  ),
  scoped AS (
    SELECT o.object_type, o.status
    FROM   object o
    JOIN   filtered_ids f ON f.object_id = o.id
    WHERE  o.object_type <> 'ORG'
      AND  (p_updated_at_from IS NULL OR o.updated_at >= p_updated_at_from::timestamptz)
      AND  (p_updated_at_to   IS NULL OR o.updated_at <  (p_updated_at_to + 1)::timestamptz)
  ),
  breakdown AS (
    SELECT
      object_type::TEXT                                                   AS type,
      COUNT(*)                                                            AS cnt,
      COUNT(*) FILTER (WHERE status = 'published')                       AS published,
      COUNT(*) FILTER (WHERE status = 'draft')                           AS draft,
      COUNT(*) FILTER (WHERE status = 'archived')                        AS archived,
      SUM(COUNT(*)) OVER ()                                               AS grand_total
    FROM scoped
    GROUP BY object_type
  )
  SELECT jsonb_build_object(
    'total', COALESCE(MAX(grand_total), 0),
    'rows',  COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'type',         type,
          'count',        cnt,
          'published',    published,
          'draft',        draft,
          'archived',     archived,
          'pct_of_total', ROUND(cnt * 100.0 / NULLIF(grand_total, 0), 1)
        )
        ORDER BY cnt DESC
      ),
      '[]'::jsonb
    )
  )
  FROM breakdown;
$$;

COMMENT ON FUNCTION api.get_dashboard_type_breakdown IS
'Dashboard §2a: object count broken down by object_type within the filtered pool.
Each row includes per-status counts and the type''s share of the total.
ORG objects excluded. p_updated_at_from/to are inclusive DATE boundaries.';

-- ─────────────────────────────────────────────────────
-- §2b  Object Distribution — by City
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION api.get_dashboard_city_distribution(
  p_types           object_type[]   DEFAULT NULL,
  p_status          object_status[] DEFAULT ARRAY['published']::object_status[],
  p_filters         JSONB           DEFAULT '{}'::jsonb,
  p_updated_at_from DATE            DEFAULT NULL,
  p_updated_at_to   DATE            DEFAULT NULL,
  p_limit           INT             DEFAULT 20
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
  WITH filtered_ids AS (
    SELECT object_id
    FROM api.get_filtered_object_ids(
      p_filters,
      COALESCE(p_types, ARRAY(
        SELECT t
        FROM   unnest(enum_range(null::object_type)) AS t
        WHERE  t <> 'ORG'
      )),
      COALESCE(p_status, ARRAY['published']::object_status[])
    )
  ),
  scoped AS (
    SELECT o.id, o.created_at
    FROM   object o
    JOIN   filtered_ids f ON f.object_id = o.id
    WHERE  o.object_type <> 'ORG'
      AND  (p_updated_at_from IS NULL OR o.updated_at >= p_updated_at_from::timestamptz)
      AND  (p_updated_at_to   IS NULL OR o.updated_at <  (p_updated_at_to + 1)::timestamptz)
  ),
  city_counts AS (
    SELECT
      loc.city,
      COUNT(DISTINCT s.id)                                                AS cnt,
      COUNT(DISTINCT s.id) FILTER (
        WHERE s.created_at >= NOW() - INTERVAL '30 days'
      )                                                                   AS delta_30d
    FROM   scoped s
    JOIN   object_location loc
      ON   loc.object_id        = s.id
      AND  loc.is_main_location = TRUE
      AND  loc.city             IS NOT NULL
      AND  loc.city             <> ''
    GROUP BY loc.city
    ORDER BY cnt DESC
    LIMIT p_limit
  )
  SELECT jsonb_build_object(
    'rows', COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'city',      city,
          'count',     cnt,
          'delta_30d', delta_30d
        )
        ORDER BY cnt DESC
      ),
      '[]'::jsonb
    )
  )
  FROM city_counts;
$$;

COMMENT ON FUNCTION api.get_dashboard_city_distribution IS
'Dashboard §2b: top cities by object count within the filtered pool.
Reads is_main_location=true from object_location; excludes null/empty cities.
delta_30d counts objects created (not updated) in that city in the last 30 days.
ORG objects excluded. p_updated_at_from/to are inclusive DATE boundaries.';

-- ─────────────────────────────────────────────────────
-- §10  Actualisation Rate
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION api.get_dashboard_actualisation(
  p_types           object_type[]   DEFAULT NULL,
  p_status          object_status[] DEFAULT ARRAY['published']::object_status[],
  p_filters         JSONB           DEFAULT '{}'::jsonb,
  p_updated_at_from DATE            DEFAULT NULL,
  p_updated_at_to   DATE            DEFAULT NULL,
  p_threshold_days  INT             DEFAULT 90
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
  WITH filtered_ids AS (
    SELECT object_id
    FROM api.get_filtered_object_ids(
      p_filters,
      COALESCE(p_types, ARRAY(
        SELECT t
        FROM   unnest(enum_range(null::object_type)) AS t
        WHERE  t <> 'ORG'
      )),
      COALESCE(p_status, ARRAY['published']::object_status[])
    )
  ),
  scoped AS (
    SELECT o.object_type, o.updated_at
    FROM   object o
    JOIN   filtered_ids f ON f.object_id = o.id
    WHERE  o.object_type <> 'ORG'
      AND  (p_updated_at_from IS NULL OR o.updated_at >= p_updated_at_from::timestamptz)
      AND  (p_updated_at_to   IS NULL OR o.updated_at <  (p_updated_at_to + 1)::timestamptz)
  ),
  by_type AS (
    SELECT
      object_type::TEXT                                                   AS type,
      COUNT(*)                                                            AS total,
      COUNT(*) FILTER (
        WHERE updated_at >= NOW() - make_interval(days => p_threshold_days)
      )                                                                   AS up_to_date,
      COUNT(*) FILTER (
        WHERE updated_at <  NOW() - make_interval(days => p_threshold_days)
          AND updated_at >= NOW() - make_interval(days => p_threshold_days * 2)
      )                                                                   AS to_review,
      COUNT(*) FILTER (
        WHERE updated_at <  NOW() - make_interval(days => p_threshold_days * 2)
      )                                                                   AS stale
    FROM scoped
    GROUP BY object_type
  )
  SELECT jsonb_build_object(
    'threshold_days', p_threshold_days,
    'rows', COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'type',         type,
          'total',        total,
          'up_to_date',   up_to_date,
          'to_review',    to_review,
          'stale',        stale,
          'rate',         ROUND(up_to_date * 100.0 / NULLIF(total, 0), 1),
          'weekly_rates', NULL::jsonb
        )
        ORDER BY type
      ),
      '[]'::jsonb
    )
  )
  FROM by_type;
$$;

COMMENT ON FUNCTION api.get_dashboard_actualisation IS
'Dashboard §10: per-type freshness breakdown against a configurable threshold.
Tiers: up_to_date (< p_threshold_days old), to_review (threshold..2x threshold),
stale (> 2x threshold). rate = percentage up_to_date.
weekly_rates is NULL until Phase 2B adds the object_version time-series join.
updated_at reflects meaningful business edits only (cache-only changes are excluded
by the update_object_updated_at_business trigger).
ORG objects excluded. p_updated_at_from/to scope the object pool (inclusive DATE boundaries).';
-- ─────────────────────────────────────────────────────
-- §5  Distinction Overview — qualifications, classements, labels
-- ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION api.get_dashboard_distinction_overview(
  p_types           object_type[]   DEFAULT NULL,
  p_status          object_status[] DEFAULT ARRAY['published']::object_status[],
  p_filters         JSONB           DEFAULT '{}'::jsonb,
  p_updated_at_from DATE            DEFAULT NULL,
  p_updated_at_to   DATE            DEFAULT NULL
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
  WITH filtered_ids AS (
    SELECT object_id
    FROM   api.get_filtered_object_ids(
      p_filters,
      COALESCE(p_types, ARRAY(
        SELECT t FROM unnest(enum_range(null::object_type)) AS t WHERE t <> 'ORG'
      )),
      COALESCE(p_status, ARRAY['published']::object_status[])
    )
  ),
  scoped AS (
    SELECT o.id
    FROM   object o
    JOIN   filtered_ids f ON f.object_id = o.id
    WHERE  o.object_type <> 'ORG'
      AND  (p_updated_at_from IS NULL OR o.updated_at >= p_updated_at_from::timestamptz)
      AND  (p_updated_at_to   IS NULL OR o.updated_at <  (p_updated_at_to + 1)::timestamptz)
  ),
  -- Schemes flagged is_distinction = TRUE in ref_classification_scheme.
  -- New labels are picked up automatically when seeded with that flag set;
  -- no SQL change required here.
  distinctions AS (
    SELECT oc.object_id, s.code AS scheme_code, s.name AS scheme_name, s.display_group
    FROM   object_classification oc
    JOIN   ref_classification_scheme s ON s.id = oc.scheme_id
    WHERE  oc.status = 'granted'
      AND  s.is_distinction = TRUE
      AND  oc.object_id IN (SELECT id FROM scoped)
  ),
  by_scheme AS (
    SELECT scheme_code, scheme_name, display_group, COUNT(DISTINCT object_id) AS cnt
    FROM   distinctions
    GROUP  BY scheme_code, scheme_name, display_group
  ),
  totals AS (
    SELECT COUNT(*) AS total_scoped FROM scoped
  ),
  with_dist AS (
    SELECT COUNT(DISTINCT object_id) AS cnt FROM distinctions
  )
  SELECT jsonb_build_object(
    'total_scoped',        t.total_scoped,
    'with_distinction',    d.cnt,
    'without_distinction', t.total_scoped - d.cnt,
    'distinction_pct',     COALESCE(ROUND(d.cnt * 100.0 / NULLIF(t.total_scoped, 0), 1), 0.0),
    'by_scheme',           COALESCE(
                             (SELECT jsonb_agg(
                                jsonb_build_object(
                                  'scheme_code',   bs.scheme_code,
                                  'scheme_name',   bs.scheme_name,
                                  'display_group', bs.display_group,
                                  'count',         bs.cnt
                                ) ORDER BY bs.cnt DESC
                              )
                              FROM by_scheme bs
                             ),
                             '[]'::jsonb
                           )
  )
  FROM totals t, with_dist d;
$$;

COMMENT ON FUNCTION api.get_dashboard_distinction_overview IS
'Dashboard §5: overview of objects carrying at least one granted qualification,
classification, or label. Scope is driven by ref_classification_scheme.is_distinction = TRUE —
no hardcoded list. To add a new label, seed its scheme with is_distinction = TRUE; this
function picks it up automatically. Typological schemes (type_hot, retail_category) keep
is_distinction = FALSE and are excluded. Returns global rate + per-scheme breakdown sorted
by count DESC. ORG objects excluded. p_updated_at_from/to are inclusive DATE boundaries.';

-- ─────────────────────────────────────────────────────
-- City options for dashboard filter dropdown
-- ─────────────────────────────────────────────────────
-- Returns the full corpus city domain: distinct non-null, non-empty cities from
-- object_location (is_main_location=true) across ALL non-ORG objects, any status.
-- No filter parameters — caller receives the same list regardless of active dashboard
-- filters. Used exclusively to populate the city <select> on the dashboard sidebar.
CREATE OR REPLACE FUNCTION api.get_dashboard_city_options()
RETURNS TEXT[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
  SELECT ARRAY(
    SELECT DISTINCT btrim(ol.city)
    FROM   object_location ol
    JOIN   object o ON o.id = ol.object_id
    WHERE  ol.is_main_location = TRUE
      AND  btrim(ol.city) <> ''
      AND  o.object_type <> 'ORG'
    ORDER BY btrim(ol.city) ASC
  );
$$;

COMMENT ON FUNCTION api.get_dashboard_city_options IS
'Returns a sorted TEXT[] of distinct cities present in object_location
(is_main_location=true, non-null/non-empty) for all non-ORG objects, any status.
No filter parameters. Used to populate the dashboard city filter dropdown.
Represents the full corpus city domain, not the current filtered slice.';

-- ─────────────────────────────────────────────────────
-- Lieu-dit options for dashboard filter dropdown
-- ─────────────────────────────────────────────────────
-- Returns the full corpus lieu-dit domain: distinct non-null, non-empty, btrim-cleaned
-- lieux-dits from object_location (is_main_location=true) across ALL non-ORG objects,
-- any status. No filter parameters. Used exclusively to populate the lieu-dit dropdown
-- on the dashboard sidebar.
CREATE OR REPLACE FUNCTION api.get_dashboard_lieu_dit_options()
RETURNS TEXT[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
  SELECT ARRAY(
    SELECT DISTINCT btrim(ol.lieu_dit)
    FROM   object_location ol
    JOIN   object o ON o.id = ol.object_id
    WHERE  ol.is_main_location = true
      AND  ol.lieu_dit IS NOT NULL
      AND  btrim(ol.lieu_dit) <> ''
      AND  o.object_type <> 'ORG'
    ORDER BY btrim(ol.lieu_dit) ASC
  );
$$;

COMMENT ON FUNCTION api.get_dashboard_lieu_dit_options IS
'Returns a sorted TEXT[] of distinct lieux-dits (btrim-cleaned, non-null/non-empty)
from object_location (is_main_location=true) for all non-ORG objects, any status.
No filter parameters. Used to populate the dashboard lieu-dit filter dropdown.
Represents the full corpus lieu-dit domain, not the current filtered slice.';

REVOKE EXECUTE ON FUNCTION api.get_dashboard_lieu_dit_options() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.get_dashboard_lieu_dit_options() TO   authenticated, service_role;

-- ─────────────────────────────────────────────────────
-- Combined filter options — cities + lieux-dits in one round trip
-- ─────────────────────────────────────────────────────
-- Returns both dropdown option sets as a single jsonb object so the dashboard
-- panel can be initialised with one RPC call instead of two.
-- Both datasets share the same base table, JOIN, and filter conditions;
-- merging them removes an unnecessary network round trip.
-- Supersedes get_dashboard_city_options + get_dashboard_lieu_dit_options
-- (those remain deployed; this is the preferred entry point going forward).
CREATE OR REPLACE FUNCTION api.get_dashboard_filter_options()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
  SELECT jsonb_build_object(
    'cities', COALESCE(
      (
        SELECT jsonb_agg(city ORDER BY city)
        FROM (
          SELECT DISTINCT btrim(ol.city) AS city
          FROM   object_location ol
          JOIN   object o ON o.id = ol.object_id
          WHERE  ol.is_main_location = TRUE
            AND  btrim(ol.city) <> ''
            AND  o.object_type <> 'ORG'
        ) c
      ),
      '[]'::jsonb
    ),
    'lieu_dits', COALESCE(
      (
        SELECT jsonb_agg(lieu_dit ORDER BY lieu_dit)
        FROM (
          SELECT DISTINCT btrim(ol.lieu_dit) AS lieu_dit
          FROM   object_location ol
          JOIN   object o ON o.id = ol.object_id
          WHERE  ol.is_main_location = TRUE
            AND  ol.lieu_dit IS NOT NULL
            AND  btrim(ol.lieu_dit) <> ''
            AND  o.object_type <> 'ORG'
        ) l
      ),
      '[]'::jsonb
    )
  );
$$;

COMMENT ON FUNCTION api.get_dashboard_filter_options IS
'Returns { cities: text[], lieu_dits: text[] } as jsonb — sorted, btrim-cleaned,
distinct values from object_location (is_main_location=true) for all non-ORG objects,
any status. Both arrays represent the full corpus domain (not the current filtered slice).
Used to populate the city and lieu-dit filter dropdowns on the dashboard sidebar in one call.';

REVOKE EXECUTE ON FUNCTION api.get_dashboard_filter_options() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.get_dashboard_filter_options() TO   authenticated, service_role;
