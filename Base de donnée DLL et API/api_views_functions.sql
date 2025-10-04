-- =====================================================
-- Helper: check if an object is currently open using rich opening system
-- =====================================================
CREATE OR REPLACE FUNCTION api.is_object_open_now(p_object_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  -- Check if there's any current opening period that indicates the object is open
  SELECT EXISTS (
    SELECT 1
    FROM opening_period p
    JOIN opening_schedule s ON s.period_id = p.id
    JOIN opening_time_period tp ON tp.schedule_id = s.id
    JOIN opening_time_period_weekday tpw ON tpw.time_period_id = tp.id
    JOIN opening_time_frame tf ON tf.time_period_id = tp.id
    JOIN ref_code_weekday wd ON wd.id = tpw.weekday_id
    WHERE p.object_id = p_object_id
      AND tp.closed = FALSE
      AND (p.date_start IS NULL OR p.date_start <= CURRENT_DATE)
      AND (p.date_end IS NULL OR p.date_end >= CURRENT_DATE)
      AND wd.code = lower(to_char(CURRENT_TIMESTAMP, 'day'))
      AND (tf.start_time IS NULL OR tf.start_time <= LOCALTIME)
      AND (tf.end_time IS NULL OR tf.end_time > LOCALTIME)
  )
  -- Also check for 24/7 periods (no time frames means always open)
  OR EXISTS (
    SELECT 1
    FROM opening_period p
    JOIN opening_schedule s ON s.period_id = p.id
    JOIN opening_time_period tp ON tp.schedule_id = s.id
    JOIN opening_time_period_weekday tpw ON tpw.time_period_id = tp.id
    JOIN ref_code_weekday wd ON wd.id = tpw.weekday_id
    WHERE p.object_id = p_object_id
      AND tp.closed = FALSE
      AND (p.date_start IS NULL OR p.date_start <= CURRENT_DATE)
      AND (p.date_end IS NULL OR p.date_end >= CURRENT_DATE)
      AND wd.code = lower(to_char(CURRENT_TIMESTAMP, 'day'))
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
  p_date_end DATE
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_weekday_slots JSONB;
BEGIN
  -- Unlimited slots per weekday (normalized model)
  v_weekday_slots := api.get_opening_slots_by_day(p_period_id);

  -- Build the complete JSON in one go
  RETURN json_build_object(
    'id', p_period_id::text,
    'order', 1,
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
AS $$
DECLARE
  v_start_local TIMESTAMPTZ;
  v_end_local   TIMESTAMPTZ;
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

-- Encodage base64url (sans "=") pour un bytea -> text
DROP FUNCTION IF EXISTS api.b64url_encode(bytea);
CREATE OR REPLACE FUNCTION api.b64url_encode(p bytea)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    regexp_replace(
      replace(replace(encode(p, 'base64'), '+', '-'), '/', '_'),
      '='||'+$',''
    );
$$;

-- Décodage base64url (text -> bytea)
DROP FUNCTION IF EXISTS api.b64url_decode(text);
CREATE OR REPLACE FUNCTION api.b64url_decode(p TEXT)
RETURNS bytea
LANGUAGE plpgsql
IMMUTABLE
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
AS $$
  SELECT api.b64url_encode(convert_to(p::text, 'UTF8'));
$$;

-- Unpack cursor (text) -> JSONB
DROP FUNCTION IF EXISTS api.cursor_unpack(text);
CREATE OR REPLACE FUNCTION api.cursor_unpack(p TEXT)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT convert_from(api.b64url_decode(p), 'UTF8')::jsonb;
$$;

-- Langue préférée (première en minuscules)
DROP FUNCTION IF EXISTS api.pick_lang(text[]);
CREATE OR REPLACE FUNCTION api.pick_lang(p_lang_prefs TEXT[] DEFAULT ARRAY['fr']::text[])
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT lower(COALESCE(p_lang_prefs[1], 'fr'));
$$;

-- Normalisation simple pour recherche (sans index expr. côté client)
DROP FUNCTION IF EXISTS api.norm_search(text);
CREATE OR REPLACE FUNCTION api.norm_search(p TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
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
-- 3) Ressource unifiée (toutes typologies) + icônes étendues
--     Améliorations: ORDRES plus logiques et stables dans les tableaux
--     - Priorité aux flags (ex: is_primary), puis position si dispo,
--       puis tri alphabétique, puis created_at / fallback column-safe
--     - Tri "column-safe" via to_jsonb(row)->>'col' pour éviter les erreurs
--       et ctid comme dernier recours si besoin
-- =====================================================
DROP FUNCTION IF EXISTS api.get_object_resource(text, text[], text, jsonb);
CREATE OR REPLACE FUNCTION api.get_object_resource(
  p_object_id    TEXT,
  p_lang_prefs   TEXT[]  DEFAULT ARRAY['fr']::text[],
  p_track_format TEXT    DEFAULT 'none',         -- 'kml' | 'gpx' | 'none'
  p_options      JSONB   DEFAULT '{}'::jsonb     -- { include_stages?:bool, stage_color?:text, fields?:string[], include?:string[] }
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
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
BEGIN
  SELECT o.* INTO obj
  FROM object o
  WHERE o.id = p_object_id;

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
  IF v_inc_private THEN
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

  -- Primary description (by preferred organization or canonical)
  -- Now supports i18n translations with fallback to plain text columns
  -- Uses api.i18n_pick() to extract translations from JSONB columns
  IF v_fields IS NULL OR 'description' = ANY(v_fields) THEN
    js := js || COALESCE((
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
        'visibility', d.visibility,
        'position', d.position,
        'created_at', d.created_at,
        'updated_at', d.updated_at
      )
      FROM object_description d
      WHERE d.object_id = obj.id
        AND (
          (v_prefer_org IS NOT NULL AND d.org_object_id IS NOT DISTINCT FROM v_prefer_org)
          OR (v_prefer_org IS NULL AND d.org_object_id IS NULL)
        )
      ORDER BY d.created_at DESC, d.id
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
      ), '[]'::jsonb)
    );
  END IF;


  -- External IDs
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

  -- Contacts (enriched) - ensure only one is marked as primary
  js := js || jsonb_build_object(
    'contacts',
    COALESCE((
      SELECT jsonb_agg(
              jsonb_build_object(
                'kind_code', rc.code,
                'kind_name', rc.name,
                'kind_description', rc.description,
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
    ), '[]'::jsonb)
  );

  -- Languages (enriched)
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

  -- Media (enriched) - ensure only one is marked as main
  js := js || jsonb_build_object(
    'media',
    COALESCE((
      SELECT jsonb_agg(
              jsonb_build_object(
                 'id',        m.id,
                'type_code', mt.code,
                'type_name', mt.name,
                'type_description', mt.description,
                 'icon_url',  mt.icon_url,
                 'title',     m.title,
                 'credit',    m.credit,
                 'url',       m.url,
                 'is_main',   m.is_main,
                 'visibility',m.visibility,
                 'position',  m.position,
                 'width',     m.width,
                 'height',    m.height
               )
               ORDER BY m.is_main DESC,
                        m.position NULLS LAST,
                        m.created_at,
                        NULLIF((to_jsonb(m)->>'id'),'') NULLS LAST,
                        m.ctid
             )
      FROM media m
      JOIN ref_code_media_type mt ON mt.id = m.media_type_id
      WHERE m.object_id = obj.id
        AND m.is_published = TRUE
    ), '[]'::jsonb)
  );

  -- Capacity (enriched)
  js := js || jsonb_build_object(
    'capacity',
    COALESCE((
      SELECT jsonb_agg(
              jsonb_build_object(
                'metric_code', rm.code,
                'metric_name', rm.name,
                'metric_description', rm.description,
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

  -- Amenities (enriched)
  js := js || jsonb_build_object(
    'amenities',
    COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'code',     ra.code,
                 'name',     ra.name,
                 'icon_url', ra.icon_url,
                 'family', jsonb_build_object(
                   'code',     rf.code,
                   'name',     rf.name,
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

  -- Environment tags (enriched)
  js := js || jsonb_build_object(
    'environment_tags',
    COALESCE((
      SELECT jsonb_agg(
              jsonb_build_object('code', et.code, 'name', et.name, 'description', et.description, 'icon_url', et.icon_url)
               ORDER BY et.name, et.code
             )
      FROM object_environment_tag oet
      JOIN ref_code_environment_tag et ON et.id = oet.environment_tag_id
      WHERE oet.object_id = obj.id
    ), '[]'::jsonb)
  );

  -- Payment methods (enriched)
  js := js || jsonb_build_object(
    'payment_methods',
    COALESCE((
      SELECT jsonb_agg(
              jsonb_build_object('code', pm.code, 'name', pm.name, 'description', pm.description, 'icon_url', pm.icon_url)
               ORDER BY pm.name, pm.code
             )
      FROM object_payment_method opm
      JOIN ref_code_payment_method pm ON pm.id = opm.payment_method_id
      WHERE opm.object_id = obj.id
    ), '[]'::jsonb)
  );

  -- Pet policy (single)
  js := js || COALESCE((
    SELECT jsonb_build_object('pet_policy', to_jsonb(pp) - 'object_id')
    FROM object_pet_policy pp
    WHERE pp.object_id = obj.id
  ), '{}'::jsonb);

  -- Prices (enriched) + nested periods as JSON array
  js := js || jsonb_build_object(
    'prices',
    COALESCE((
      SELECT jsonb_agg(
        (
          jsonb_build_object(
            'kind',       (SELECT jsonb_build_object('id', k.id, 'code', k.code, 'name', k.name, 'description', k.description, 'position', k.position, 'icon_url', k.icon_url) FROM ref_code_price_kind k WHERE k.id = p.kind_id),
            'unit',       (SELECT jsonb_build_object('id', u.id, 'code', u.code, 'name', u.name, 'description', u.description, 'position', u.position, 'icon_url', u.icon_url) FROM ref_code_price_unit u WHERE u.id = p.unit_id),
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

  -- Classifications (enriched)
  js := js || jsonb_build_object(
    'classifications',
    COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'scheme',      (SELECT code FROM ref_classification_scheme s WHERE s.id = oc.scheme_id),
                 'scheme_name', (SELECT name FROM ref_classification_scheme s WHERE s.id = oc.scheme_id),
                 'value',       (SELECT code FROM ref_classification_value  v WHERE v.id = oc.value_id),
                 'value_name',  (SELECT name FROM ref_classification_value  v WHERE v.id = oc.value_id),
                 'awarded_at',  oc.awarded_at,
                 'valid_until', oc.valid_until,
                 'status',      oc.status
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

  -- Tags (enriched)
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

  -- Discounts
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

  -- Group policies
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

  -- Origins
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

  -- Organization links
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

  -- Actors (enriched with contacts)
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
    ), '[]'::jsonb)
  );

  -- Legal records (enriched)
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
    ), '[]'::jsonb)
  );

  -- Meeting rooms (+ equipment)
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

  -- FMA & occurrences
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

  -- Places + nested place_descriptions
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

  -- Sustainability (actions + labels)
  js := js || jsonb_build_object(
    'sustainability_action_labels',
    COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'object_action_id', sa.id,
                 'action', jsonb_build_object(
                   'code',       rsa.code,
                   'label',      rsa.label,
                   'description',rsa.description,
                   'icon_url',   rsa.icon_url,
                   'category', jsonb_build_object(
                     'code',       rac.code,
                     'name',       rac.name,
                     'description',rac.description,
                     'icon_url',   rac.icon_url,
                     'position',   rac.position
                   ),
                   'position',   rsa.position
                 ),
                 'label', jsonb_build_object(
                   'scheme_code', sc.code,
                   'scheme_name', sc.name,
                   'value_code',  cv.code,
                   'value_name',  cv.name,
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

  -- ITI summary + optional track
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
          'track',
            CASE WHEN v_fmt IN ('kml','gpx')
                 THEN api.build_iti_track(obj.id, v_fmt, v_inc, v_color)
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
          WHERE m2.object_id = obj.id AND m2.is_active = TRUE
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
          WHERE m2.object_id = obj.id AND m2.is_active = TRUE
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
          WHERE m2.object_id = obj.id AND m2.is_active = TRUE
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
          JOIN object_menu m ON m.object_id = o_restaurant.id AND m.is_active = TRUE
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
                      api.build_opening_period_json(p.id, obj.id, p.date_start, p.date_end)
                      ORDER BY p.date_start NULLS FIRST, p.name, p.created_at
                    )
             FROM opening_period p
             WHERE p.object_id = obj.id
               AND p.date_start >= CURRENT_DATE + INTERVAL '1 year'
           ), '[]'::json),
           'periods_current',
           COALESCE((
             SELECT json_agg(
                      api.build_opening_period_json(p.id, obj.id, p.date_start, p.date_end)
                      ORDER BY p.date_start NULLS FIRST, p.name, p.created_at
                    )
             FROM opening_period p
             WHERE p.object_id = obj.id
               AND (p.date_start < CURRENT_DATE + INTERVAL '1 year' OR p.date_start IS NULL)
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
          CASE WHEN rcr.code IS NOT NULL THEN rc.name || ' : ' || c.value || ' (' || rcr.code || ')'
               ELSE rc.name || ' : ' || c.value
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
              COALESCE(m.title, mt.name) ||
              CASE WHEN m.credit IS NOT NULL THEN ' (' || m.credit || ')' ELSE '' END ||
              ' - ' || m.width || 'x' || m.height
            ELSE
              COALESCE(m.title, mt.name) ||
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
                       WHEN COALESCE(NULLIF(oc.unit, ''), '') <> '' AND COALESCE(rm.name, '') <> '' THEN ' '
                       ELSE ''
                     END
                  || COALESCE(rm.name, '')
              )
            ELSE COALESCE(rm.name, '')
          END AS line_text,
          rm.position AS rm_position,
          rm.name AS metric_name,
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
          ra.name || ' (' || rf.name || ')' AS line_text,
          rf.name AS family_name,
          rf.code AS family_code,
          ra.name AS amenity_name,
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
          COALESCE(k.name, k.code, 'Tarif') || ' - ' ||
          COALESCE(
            CASE WHEN p.amount_max IS NOT NULL THEN
              api.render_format_currency(p.amount, p.currency, v_render_locale) || ' - ' ||
              api.render_format_currency(p.amount_max, p.currency, v_render_locale)
            ELSE
              api.render_format_currency(p.amount, p.currency, v_render_locale)
            END,
            ''
          ) ||
          CASE WHEN u.name IS NOT NULL AND trim(u.name) <> '' THEN ' ' || lower(u.name) ELSE '' END ||
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
        WHERE m.object_id = obj.id AND mi.is_available = TRUE
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
  
  RETURN json_build_object(
    'id',                   (js->'id')::json,
    'type',                 (js->'type')::json,
    'status',               (js->'status')::json,
    'is_editing',           (js->'is_editing')::json,
    'name',                 (js->'name')::json,
    'region_code',          (js->'region_code')::json,
    'created_at',           (js->'created_at')::json,
    'updated_at',           (js->'updated_at')::json,
    'updated_at_source',    (js->'updated_at_source')::json,
    'published_at',         (js->'published_at')::json,
    'address',              (js->'address')::json,
    'location',             (js->'location')::json,
    'descriptions',         (js->'descriptions')::json,
    'external_ids',         (js->'external_ids')::json,
    'contacts',             (js->'contacts')::json,
    'languages',            (js->'languages')::json,
    'media',                (js->'media')::json,
    'capacity',             (js->'capacity')::json,
    'amenities',            (js->'amenities')::json,
    'payment_methods',      (js->'payment_methods')::json,
    'pet_policy',           (js->'pet_policy')::json,
    'prices',               (js->'prices')::json,
    'classifications',      (js->'classifications')::json,
    'tags',                 (js->'tags')::json,
    'discounts',            (js->'discounts')::json,
    'group_policies',       (js->'group_policies')::json,
    'origins',              (js->'origins')::json,
    'org_links',            (js->'org_links')::json,
    'actors',               (js->'actors')::json,
    'legal_records',        (js->'legal_records')::json, -- NEWLY ADDED
    'meeting_rooms',        (js->'meeting_rooms')::json,
    'fma',                  (js->'fma')::json,
    'fma_occurrences',      (js->'fma_occurrences')::json,
    'places',               (js->'places')::json,
    'sustainability_action_labels', (js->'sustainability_action_labels')::json,
    'itinerary_details',    (js->'itinerary_details')::json,
    'incoming_relations',   (js->'incoming_relations')::json,
    'outgoing_relations',   (js->'outgoing_relations')::json,
    'menus',                (js->'menus')::json,
    'opening_times',        v_opening_times,
    'render',               (js->'render')::json
  );
END;
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
DROP FUNCTION IF EXISTS api.list_object_resources_page(TEXT, TEXT[], INTEGER, object_type[], object_status[], TEXT, TEXT, BOOLEAN, TEXT) CASCADE;

CREATE OR REPLACE FUNCTION api.list_object_resources_page(
  p_cursor         TEXT DEFAULT NULL,
  p_lang_prefs     TEXT[] DEFAULT ARRAY['fr']::text[],
  p_page_size      INTEGER DEFAULT 50,
  p_types          object_type[] DEFAULT NULL,
  p_status         object_status[] DEFAULT ARRAY['published']::object_status[],
  p_search         TEXT DEFAULT NULL,
  p_track_format   TEXT DEFAULT 'none',
  p_include_stages BOOLEAN DEFAULT NULL,
  p_stage_color    TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
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
    IF cur ? 'types' THEN v_types := ARRAY(SELECT jsonb_array_elements_text(cur->'types'))::object_type[]; END IF;
    IF cur ? 'status' THEN v_status := ARRAY(SELECT jsonb_array_elements_text(cur->'status'))::object_status[]; END IF;
    IF cur ? 'search' THEN v_search := cur->>'search'; END IF;
    IF cur ? 'track_format' THEN v_track := lower(cur->>'track_format'); END IF;
    IF cur ? 'include_stages' THEN v_inc := (cur->>'include_stages')::boolean; END IF;
    IF cur ? 'stage_color' THEN v_color := cur->>'stage_color'; END IF;
    IF cur ? 'lang' THEN p_lang_prefs := ARRAY(SELECT jsonb_array_elements_text(cur->'lang')); lang := api.pick_lang(p_lang_prefs); END IF;
    IF cur ? 'render' THEN v_render_enabled := (cur->>'render')::boolean; END IF;
    IF cur ? 'render_locale' THEN v_render_locale := cur->>'render_locale'; END IF;
    IF cur ? 'render_tz' THEN v_render_tz := cur->>'render_tz'; END IF;
    IF cur ? 'render_version' THEN v_render_version := cur->>'render_version'; END IF;
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
    AND (v_search IS NULL OR o.name_normalized ILIKE '%'||api.norm_search(v_search)||'%');

  -- Page d'ids
  SELECT ARRAY(
    SELECT o.id
    FROM object o
    WHERE (v_types IS NULL OR o.object_type = ANY(v_types))
      AND (v_status IS NULL OR o.status = ANY(v_status))
      AND (v_search IS NULL OR o.name_normalized ILIKE '%'||api.norm_search(v_search)||'%')
    ORDER BY o.id
    OFFSET v_offset
    LIMIT v_limit
  ) INTO ids;

  -- Next cursor si on a rempli la page
  IF array_length(ids,1) = v_limit THEN
    next_offset := v_offset + v_limit;
    next_cursor := api.cursor_pack(jsonb_build_object(
      'kind','page',
      'offset', next_offset,
      'page_size', v_limit,
      'types', CASE WHEN v_types IS NULL THEN NULL ELSE to_jsonb(v_types) END,
      'status', CASE WHEN v_status IS NULL THEN NULL ELSE to_jsonb(v_status) END,
      'search', v_search,
      'track_format', v_track,
      'include_stages', v_inc,
      'stage_color', v_color,
      'lang', to_jsonb(p_lang_prefs),
      'render', v_render_enabled,
      'render_locale', v_render_locale,
      'render_tz', v_render_tz,
      'render_version', v_render_version
    ));
  END IF;

  v_current_cursor := api.cursor_pack(jsonb_build_object(
    'kind','page',
    'offset', v_offset,
    'page_size', v_limit,
    'types', CASE WHEN v_types IS NULL THEN NULL ELSE to_jsonb(v_types) END,
    'status', CASE WHEN v_status IS NULL THEN NULL ELSE to_jsonb(v_status) END,
    'search', v_search,
    'track_format', v_track,
    'include_stages', v_inc,
    'stage_color', v_color,
    'lang', to_jsonb(p_lang_prefs),
    'render', v_render_enabled,
    'render_locale', v_render_locale,
    'render_tz', v_render_tz,
    'render_version', v_render_version
  ));

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
    'links', json_build_object(
      'self', '?cursor=' || v_current_cursor,
      'next', CASE WHEN next_cursor IS NOT NULL THEN '?cursor=' || next_cursor ELSE NULL END
    ),
    'data', COALESCE((
      SELECT json_agg(
               api.get_object_resource(
                 id,
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
               ORDER BY ord
             )
      FROM unnest(ids) WITH ORDINALITY AS t(id, ord)
    ), '[]'::json)
  );
END;
$$;



-- =====================================================
-- 5) Endpoint : list_object_resources_since_fast (keyset)
--      - Listes : pas de track par défaut ('none')
--      - Options propagées via curseur (inchangé)
-- =====================================================
DROP FUNCTION IF EXISTS api.list_object_resources_since_fast(timestamptz, TEXT, boolean, TEXT[], integer, object_type[], object_status[], TEXT, TEXT, BOOLEAN, TEXT) CASCADE;

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
  p_stage_color    TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
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
    IF cur ? 'types'        THEN v_types := ARRAY(SELECT jsonb_array_elements_text(cur->'types'))::object_type[]; END IF;
    IF cur ? 'status'       THEN v_status := ARRAY(SELECT jsonb_array_elements_text(cur->'status'))::object_status[]; END IF;
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
        AND (v_search IS NULL OR o.name_normalized ILIKE '%'||api.norm_search(v_search)||'%')
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
        AND (v_search IS NULL OR o.name_normalized ILIKE '%'||api.norm_search(v_search)||'%')
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

    next_cursor := api.cursor_pack(jsonb_build_object(
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
      'lang', to_jsonb(p_lang_prefs),
      'render', v_render_enabled,
      'render_locale', v_render_locale,
      'render_tz', v_render_tz,
      'render_version', v_render_version
    ));
  END IF;

  v_current_cursor := api.cursor_pack(jsonb_build_object(
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
    'lang', to_jsonb(p_lang_prefs),
    'render', v_render_enabled,
    'render_locale', v_render_locale,
    'render_tz', v_render_tz,
    'render_version', v_render_version
  ));

  RETURN json_build_object(
    'meta', json_build_object(
      'kind','since',
      'language', lang,
      'language_fallbacks', p_lang_prefs,
      'since', p_since,
      'use_source', v_use_source,
      'limit', v_limit,
      'schema_version', '3.0',
      'render_locale', v_render_locale,
      'render_tz', v_render_tz,
      'render_version', v_render_version,
      'cursor', v_current_cursor,
      'next_cursor', next_cursor
    ),
    'links', json_build_object(
      'self', '?cursor=' || v_current_cursor,
      'next', CASE WHEN next_cursor IS NOT NULL THEN '?cursor=' || next_cursor ELSE NULL END
    ),
    'data', COALESCE((
      SELECT json_agg(
               api.get_object_resource(
                 id,
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
               ORDER BY ord
             )
      FROM unnest(ids) WITH ORDINALITY AS t(id, ord)
    ), '[]'::json)
  );
END;
$$;



-- =====================================================
-- 6) Endpoints filtrés (p_filters JSONB) — page-based
--      - Listes : pas de track par défaut ('none')
--      - Options propagées via curseur (inchangé)
-- =====================================================
DROP FUNCTION IF EXISTS api.list_object_resources_filtered_page(TEXT, TEXT[], INTEGER, JSONB, object_type[], object_status[], TEXT, TEXT, BOOLEAN, TEXT) CASCADE;
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
  p_stage_color    TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_cur JSONB;
  v_offset INTEGER := 0;
  v_limit  INTEGER := LEAST(GREATEST(COALESCE(p_page_size,50),1), 200);
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
    IF v_cur ? 'track_format'   THEN v_track := lower(v_cur->>'track_format'); END IF;
    IF v_cur ? 'include_stages' THEN v_inc   := (v_cur->>'include_stages')::boolean; END IF;
    IF v_cur ? 'stage_color'    THEN v_color := v_cur->>'stage_color'; END IF;
    IF v_cur ? 'render'         THEN v_render_enabled := (v_cur->>'render')::boolean; END IF;
    IF v_cur ? 'render_locale'  THEN v_render_locale := v_cur->>'render_locale'; END IF;
    IF v_cur ? 'render_tz'      THEN v_render_tz := v_cur->>'render_tz'; END IF;
    IF v_cur ? 'render_version' THEN v_render_version := v_cur->>'render_version'; END IF;
  END IF;

  IF v_render_locale IS NULL OR v_render_locale = '' THEN
    v_render_locale := 'fr-FR';
  END IF;
  v_render_locale := lower(split_part(v_render_locale, '-', 1)) || '-' ||
                     upper(CASE WHEN position('-' IN v_render_locale) > 0 THEN split_part(v_render_locale, '-', 2)
                                ELSE split_part(v_render_locale, '-', 1) END);

  WITH params AS (
    SELECT p_filters AS f
  ),
  base AS (
    SELECT o.id, o.name_normalized, o.updated_at, o.updated_at_source
    FROM object o
    LEFT JOIN LATERAL (
      SELECT ol.*
      FROM object_location ol
      WHERE ol.object_id = o.id AND ol.is_main_location IS TRUE
      ORDER BY ol.created_at
      LIMIT 1
    ) ol ON TRUE
    WHERE (p_types  IS NULL OR o.object_type = ANY(p_types))
      AND (p_status IS NULL OR o.status = ANY(p_status))
      AND (
        p_search IS NULL OR
        o.name_normalized ILIKE '%'||api.norm_search(p_search)||'%' OR
        (ol.city IS NOT NULL AND immutable_unaccent(lower(ol.city)) ILIKE '%'||api.norm_search(p_search)||'%')
      )
  ),
  filt AS (
    SELECT b.*
    FROM base b
    JOIN params p ON TRUE
    WHERE
      -- (mêmes filtres riches)
      (NOT (p.f ? 'amenities_any') OR EXISTS (
        SELECT 1
        FROM object_amenity oa
        JOIN ref_amenity ra ON ra.id = oa.amenity_id
        JOIN LATERAL jsonb_array_elements_text(p.f->'amenities_any') j(code) ON TRUE
        WHERE oa.object_id = b.id AND ra.code = j.code
      ))
      AND (NOT (p.f ? 'amenities_all') OR NOT EXISTS (
        SELECT 1
        FROM LATERAL jsonb_array_elements_text(p.f->'amenities_all') j(code)
        WHERE NOT EXISTS (
          SELECT 1
          FROM object_amenity oa
          JOIN ref_amenity ra ON ra.id = oa.amenity_id
          WHERE oa.object_id = b.id AND ra.code = j.code
        )
      ))
      AND (NOT (p.f ? 'amenity_families_any') OR EXISTS (
        SELECT 1
        FROM object_amenity oa
        JOIN ref_amenity ra ON ra.id = oa.amenity_id
        JOIN ref_code_amenity_family fam ON fam.id = ra.family_id
        JOIN LATERAL jsonb_array_elements_text(p.f->'amenity_families_any') j(code) ON TRUE
        WHERE oa.object_id = b.id AND fam.code = j.code
      ))
      AND (NOT (p.f ? 'pet_accepted') OR EXISTS (
        SELECT 1 FROM object_pet_policy opp
        WHERE opp.object_id = b.id AND opp.accepted = ((p.f->>'pet_accepted')::boolean)
      ))
      AND (NOT (p.f ? 'payment_methods_any') OR EXISTS (
        SELECT 1
        FROM object_payment_method opm
        JOIN ref_code_payment_method pm ON pm.id = opm.payment_method_id
        JOIN LATERAL jsonb_array_elements_text(p.f->'payment_methods_any') j(code) ON TRUE
        WHERE opm.object_id = b.id AND pm.code = j.code
      ))
      AND (NOT (p.f ? 'environment_tags_any') OR EXISTS (
        SELECT 1
        FROM object_environment_tag oet
        JOIN ref_code_environment_tag et ON et.id = oet.environment_tag_id
        JOIN LATERAL jsonb_array_elements_text(p.f->'environment_tags_any') j(code) ON TRUE
        WHERE oet.object_id = b.id AND et.code = j.code
      ))
      AND (NOT (p.f ? 'languages_any') OR EXISTS (
        SELECT 1
        FROM object_language ol
        JOIN ref_language rl ON rl.id = ol.language_id
        JOIN LATERAL jsonb_array_elements_text(p.f->'languages_any') j(code) ON TRUE
        WHERE ol.object_id = b.id AND rl.code = j.code
      ))
      AND (NOT (p.f ? 'media_types_any') OR EXISTS (
        SELECT 1
        FROM media m
        JOIN ref_code_media_type mt ON mt.id = m.media_type_id
        JOIN LATERAL jsonb_array_elements_text(p.f->'media_types_any') j(code) ON TRUE
        WHERE m.object_id = b.id
          AND (NOT (p.f ? 'media_published_only') OR m.is_published = TRUE)
          AND ((p.f->>'media_must_have_main')::boolean IS DISTINCT FROM TRUE OR m.is_main = TRUE)
          AND mt.code = j.code
      ))
      AND (NOT (p.f ? 'meeting_room') OR (
        EXISTS (SELECT 1 FROM object_meeting_room r WHERE r.object_id = b.id)
        AND ( (p.f->'meeting_room'->>'min_count') IS NULL
              OR (SELECT COUNT(*) FROM object_meeting_room r WHERE r.object_id = b.id) >= (p.f->'meeting_room'->>'min_count')::int )
        AND ( (p.f->'meeting_room'->>'min_area_m2') IS NULL
              OR EXISTS (SELECT 1 FROM object_meeting_room r WHERE r.object_id = b.id AND r.area_m2 >= (p.f->'meeting_room'->>'min_area_m2')::numeric) )
        AND ( (p.f->'meeting_room'->>'min_cap_theatre') IS NULL
              OR EXISTS (SELECT 1 FROM object_meeting_room r WHERE r.object_id = b.id AND r.cap_theatre >= (p.f->'meeting_room'->>'min_cap_theatre')::int) )
        AND ( (p.f->'meeting_room'->>'min_cap_u') IS NULL
              OR EXISTS (SELECT 1 FROM object_meeting_room r WHERE r.object_id = b.id AND r.cap_u >= (p.f->'meeting_room'->>'min_cap_u')::int) )
        AND ( (p.f->'meeting_room'->>'min_cap_classroom') IS NULL
              OR EXISTS (SELECT 1 FROM object_meeting_room r WHERE r.object_id = b.id AND r.cap_classroom >= (p.f->'meeting_room'->>'min_cap_classroom')::int) )
        AND ( (p.f->'meeting_room'->>'min_cap_boardroom') IS NULL
              OR EXISTS (SELECT 1 FROM object_meeting_room r WHERE r.object_id = b.id AND r.cap_boardroom >= (p.f->'meeting_room'->>'min_cap_boardroom')::int) )
        AND ( NOT (p.f->'meeting_room' ? 'equipment_any')
              OR EXISTS (
                SELECT 1
                FROM meeting_room_equipment me
                JOIN object_meeting_room r ON r.id = me.room_id AND r.object_id = b.id
                JOIN ref_code_meeting_equipment e ON e.id = me.equipment_id
                JOIN LATERAL jsonb_array_elements_text(p.f->'meeting_room'->'equipment_any') j(code) ON TRUE
                WHERE e.code = j.code
              )
        )
        AND ( NOT (p.f->'meeting_room' ? 'equipment_all')
              OR NOT EXISTS (
                SELECT 1
                FROM LATERAL jsonb_array_elements_text(p.f->'meeting_room'->'equipment_all') j(code)
                WHERE NOT EXISTS (
                  SELECT 1
                  FROM meeting_room_equipment me
                  JOIN object_meeting_room r ON r.id = me.room_id AND r.object_id = b.id
                  JOIN ref_code_meeting_equipment e ON e.id = me.equipment_id
                  WHERE e.code = j.code
                )
              )
        )
      ))
      AND (NOT (p.f ? 'capacity_filters') OR NOT EXISTS (
        SELECT 1
        FROM LATERAL jsonb_array_elements(p.f->'capacity_filters') cf(j)
        LEFT JOIN ref_capacity_metric cm ON cm.code = (cf.j->>'code')
        WHERE cm.id IS NULL
           OR NOT EXISTS (
                SELECT 1
                FROM object_capacity oc
                WHERE oc.object_id = b.id
                  AND oc.metric_id = cm.id
                  AND ( (cf.j ? 'min') IS FALSE OR oc.value_integer >= (cf.j->>'min')::int )
                  AND ( (cf.j ? 'max') IS FALSE OR oc.value_integer <= (cf.j->>'max')::int )
           )
      ))
      AND (NOT (p.f ? 'classifications_any') OR EXISTS (
        SELECT 1
        FROM LATERAL jsonb_array_elements(p.f->'classifications_any') cv(j)
        JOIN ref_classification_scheme s ON s.code = (cv.j->>'scheme_code')
        JOIN ref_classification_value  v ON v.scheme_id = s.id AND v.code = (cv.j->>'value_code')
        JOIN object_classification oc  ON oc.object_id = b.id AND oc.scheme_id = s.id AND oc.value_id = v.id
      ))
      AND (NOT (p.f ? 'tags_any') OR EXISTS (
        SELECT 1
        FROM tag_link tl
        JOIN ref_tag t ON t.id = tl.tag_id
        JOIN LATERAL jsonb_array_elements_text(p.f->'tags_any') j(slug) ON TRUE
        WHERE tl.target_table = 'object'
          AND tl.target_pk = b.id
          AND t.slug = j.slug
      ))
      AND (NOT (p.f ? 'itinerary') OR EXISTS (
        SELECT 1
        FROM object_iti oi
        WHERE oi.object_id = b.id
          AND ( (p.f->'itinerary'->>'is_loop') IS NULL OR oi.is_loop = (p.f->'itinerary'->>'is_loop')::boolean )
          AND ( (p.f->'itinerary'->>'difficulty_min') IS NULL OR oi.difficulty_level >= (p.f->'itinerary'->>'difficulty_min')::int )
          AND ( (p.f->'itinerary'->>'difficulty_max') IS NULL OR oi.difficulty_level <= (p.f->'itinerary'->>'difficulty_max')::int )
          AND ( (p.f->'itinerary'->>'distance_min_km') IS NULL OR oi.distance_km >= (p.f->'itinerary'->>'distance_min_km')::numeric )
          AND ( (p.f->'itinerary'->>'distance_max_km') IS NULL OR oi.distance_km <= (p.f->'itinerary'->>'distance_max_km')::numeric )
          AND ( (p.f->'itinerary'->>'duration_min_h') IS NULL OR oi.duration_hours >= (p.f->'itinerary'->>'duration_min_h')::numeric )
          AND ( (p.f->'itinerary'->>'duration_max_h') IS NULL OR oi.duration_hours <= (p.f->'itinerary'->>'duration_max_h')::numeric )
          AND (
            NOT (p.f->'itinerary' ? 'practices_any')
            OR EXISTS (
                SELECT 1
                FROM object_iti_practice oip
                JOIN ref_code_iti_practice ip ON ip.id = oip.practice_id
                JOIN LATERAL jsonb_array_elements_text(p.f->'itinerary'->'practices_any') j(code) ON TRUE
                WHERE oip.object_id = b.id AND ip.code = j.code
            )
          )
      ))
      AND (NOT (p.f ? 'within_radius') OR EXISTS (
        SELECT 1
        FROM object_location ol
        WHERE ol.object_id = b.id
          AND ol.is_main_location IS TRUE
          AND ol.geog2 IS NOT NULL
          AND ST_DWithin(
                ol.geog2,
                ST_SetSRID(ST_MakePoint(
                  (p.f->'within_radius'->>'lon')::float8,
                  (p.f->'within_radius'->>'lat')::float8
                ),4326)::geography,
                GREATEST(0,(p.f->'within_radius'->>'radius_m')::int)
              )
      ))
      AND (NOT (p.f ? 'bbox') OR EXISTS (
        SELECT 1
        FROM object_location ol
        WHERE ol.object_id = b.id
          AND ol.is_main_location IS TRUE
          AND ol.geog2 IS NOT NULL
          AND ST_Within(
            ol.geog2::geometry,
            ST_MakeEnvelope(
              (p.f->'bbox'->>0)::float8, (p.f->'bbox'->>1)::float8,
              (p.f->'bbox'->>2)::float8, (p.f->'bbox'->>3)::float8, 4326
            )
          )
      ))
      AND (NOT (p.f ? 'open_now') OR api.is_object_open_now(b.id))
  ),
  paged AS (
    SELECT f.*, ROW_NUMBER() OVER (ORDER BY f.name_normalized NULLS LAST, f.id) AS ord
    FROM filt f
    ORDER BY f.name_normalized NULLS LAST, f.id
    OFFSET v_offset LIMIT v_limit
  )
  SELECT
    (SELECT COUNT(*) FROM filt) AS total,
    (SELECT COALESCE(json_agg(
       api.get_object_resource(
         p.id, p_lang_prefs, v_track,
         jsonb_build_object(
           'include_stages', v_inc,
           'stage_color', v_color,
           'render', v_render_enabled,
           'render_locale', v_render_locale,
           'render_tz', v_render_tz,
           'render_version', v_render_version
         )
       )
       ORDER BY p.ord
     ), '[]'::json) FROM paged p) AS data
  INTO v_total, v_data;

  v_cursor := jsonb_build_object(
    'kind','page',
    'offset', v_offset,
    'page_size', v_limit,
    'track_format', v_track,
    'include_stages', v_inc,
    'stage_color', v_color,
    'render', v_render_enabled,
    'render_locale', v_render_locale,
    'render_tz', v_render_tz,
    'render_version', v_render_version
  );
  v_current_cursor := api.cursor_pack(v_cursor);
  v_next := api.cursor_pack( jsonb_set(v_cursor,'{offset}', to_jsonb(v_offset + v_limit)) );

  RETURN json_build_object(
    'meta', json_build_object(
      'kind','page',
      'language', COALESCE(p_lang_prefs[1],'fr'),
      'language_fallbacks', p_lang_prefs,
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
    'links', json_build_object(
      'self', '?cursor=' || v_current_cursor,
      'next', CASE WHEN v_offset + v_limit < v_total THEN '?cursor=' || v_next ELSE NULL END
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
  p_stage_color    TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
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
    IF v_cur ? 'last_ts'      THEN v_last_ts   := (v_cur->>'last_ts')::timestamptz; END IF;
    IF v_cur ? 'last_id'      THEN v_last_id   := v_cur->>'last_id'; END IF;
    IF v_cur ? 'lang'         THEN p_lang_prefs:= ARRAY(SELECT jsonb_array_elements_text(v_cur->'lang')); v_lang := api.pick_lang(p_lang_prefs); END IF;
  END IF;

  -- Page keyset: ids + ts + last cursor tokens
  WITH params AS ( SELECT v_filters AS f ),
  cand AS (
    SELECT
      o.id,
      (CASE WHEN v_use_source THEN o.updated_at_source ELSE o.updated_at END) AS ts,
      o.name_normalized
    FROM object o
    LEFT JOIN LATERAL (
      SELECT ol.*
      FROM object_location ol
      WHERE ol.object_id = o.id AND ol.is_main_location IS TRUE
      ORDER BY ol.created_at
      LIMIT 1
    ) ol ON TRUE
    WHERE (v_types  IS NULL OR o.object_type = ANY(v_types))
      AND (v_status IS NULL OR o.status      = ANY(v_status))
      AND (
        v_search IS NULL
        OR o.name_normalized ILIKE '%'||api.norm_search(v_search)||'%'
        OR (ol.city IS NOT NULL AND immutable_unaccent(lower(ol.city)) ILIKE '%'||api.norm_search(v_search)||'%')
      )
      AND (
        (v_use_source = FALSE AND o.updated_at        >= p_since) OR
        (v_use_source = TRUE  AND o.updated_at_source >= p_since)
      )
  ),
  filt AS (
    SELECT c.*
    FROM cand c
    JOIN params p ON TRUE
    WHERE
      (NOT (p.f ? 'amenities_any') OR EXISTS (
        SELECT 1 FROM object_amenity oa
        JOIN ref_amenity ra ON ra.id = oa.amenity_id
        JOIN LATERAL jsonb_array_elements_text(p.f->'amenities_any') j(code) ON TRUE
        WHERE oa.object_id = c.id AND ra.code = j.code
      ))
      AND (NOT (p.f ? 'amenities_all') OR NOT EXISTS (
        SELECT 1 FROM LATERAL jsonb_array_elements_text(p.f->'amenities_all') j(code)
        WHERE NOT EXISTS (
          SELECT 1 FROM object_amenity oa
          JOIN ref_amenity ra ON ra.id = oa.amenity_id
          WHERE oa.object_id = c.id AND ra.code = j.code
        )
      ))
      AND (NOT (p.f ? 'amenity_families_any') OR EXISTS (
        SELECT 1 FROM object_amenity oa
        JOIN ref_amenity ra ON ra.id = oa.amenity_id
        JOIN ref_code_amenity_family fam ON fam.id = ra.family_id
        JOIN LATERAL jsonb_array_elements_text(p.f->'amenity_families_any') j(code) ON TRUE
        WHERE oa.object_id = c.id AND fam.code = j.code
      ))
      AND (NOT (p.f ? 'pet_accepted') OR EXISTS (
        SELECT 1 FROM object_pet_policy opp
        WHERE opp.object_id = c.id AND opp.accepted = ((p.f->>'pet_accepted')::boolean)
      ))
      AND (NOT (p.f ? 'payment_methods_any') OR EXISTS (
        SELECT 1 FROM object_payment_method opm
        JOIN ref_code_payment_method pm ON pm.id = opm.payment_method_id
        JOIN LATERAL jsonb_array_elements_text(p.f->'payment_methods_any') j(code) ON TRUE
        WHERE opm.object_id = c.id AND pm.code = j.code
      ))
      AND (NOT (p.f ? 'environment_tags_any') OR EXISTS (
        SELECT 1 FROM object_environment_tag oet
        JOIN ref_code_environment_tag et ON et.id = oet.environment_tag_id
        JOIN LATERAL jsonb_array_elements_text(p.f->'environment_tags_any') j(code) ON TRUE
        WHERE oet.object_id = c.id AND et.code = j.code
      ))
      AND (NOT (p.f ? 'languages_any') OR EXISTS (
        SELECT 1 FROM object_language ol
        JOIN ref_language rl ON rl.id = ol.language_id
        JOIN LATERAL jsonb_array_elements_text(p.f->'languages_any') j(code) ON TRUE
        WHERE ol.object_id = c.id AND rl.code = j.code
      ))
      AND (NOT (p.f ? 'media_types_any') OR EXISTS (
        SELECT 1 FROM media m
        JOIN ref_code_media_type mt ON mt.id = m.media_type_id
        JOIN LATERAL jsonb_array_elements_text(p.f->'media_types_any') j(code) ON TRUE
        WHERE m.object_id = c.id
          AND (NOT (p.f ? 'media_published_only') OR m.is_published = TRUE)
          AND ((p.f->>'media_must_have_main')::boolean IS DISTINCT FROM TRUE OR m.is_main = TRUE)
          AND mt.code = j.code
      ))
      AND (NOT (p.f ? 'meeting_room') OR (
        EXISTS (SELECT 1 FROM object_meeting_room r WHERE r.object_id = c.id)
        AND ( (p.f->'meeting_room'->>'min_count') IS NULL
              OR (SELECT COUNT(*) FROM object_meeting_room r WHERE r.object_id = c.id) >= (p.f->'meeting_room'->>'min_count')::int )
        AND ( (p.f->'meeting_room'->>'min_area_m2') IS NULL
              OR EXISTS (SELECT 1 FROM object_meeting_room r WHERE r.object_id = c.id AND r.area_m2 >= (p.f->'meeting_room'->>'min_area_m2')::numeric) )
        AND ( (p.f->'meeting_room'->>'min_cap_theatre') IS NULL
              OR EXISTS (SELECT 1 FROM object_meeting_room r WHERE r.object_id = c.id AND r.cap_theatre >= (p.f->'meeting_room'->>'min_cap_theatre')::int) )
        AND ( (p.f->'meeting_room'->>'min_cap_u') IS NULL
              OR EXISTS (SELECT 1 FROM object_meeting_room r WHERE r.object_id = c.id AND r.cap_u >= (p.f->'meeting_room'->>'min_cap_u')::int) )
        AND ( (p.f->'meeting_room'->>'min_cap_classroom') IS NULL
              OR EXISTS (SELECT 1 FROM object_meeting_room r WHERE r.object_id = c.id AND r.cap_classroom >= (p.f->'meeting_room'->>'min_cap_classroom')::int) )
        AND ( (p.f->'meeting_room'->>'min_cap_boardroom') IS NULL
              OR EXISTS (SELECT 1 FROM object_meeting_room r WHERE r.object_id = c.id AND r.cap_boardroom >= (p.f->'meeting_room'->>'min_cap_boardroom')::int) )
        AND ( NOT (p.f->'meeting_room' ? 'equipment_any')
              OR EXISTS (
                SELECT 1
                FROM meeting_room_equipment me
                JOIN object_meeting_room r ON r.id = me.room_id AND r.object_id = c.id
                JOIN ref_code_meeting_equipment e ON e.id = me.equipment_id
                JOIN LATERAL jsonb_array_elements_text(p.f->'meeting_room'->'equipment_any') j(code) ON TRUE
                WHERE e.code = j.code
              )
        )
        AND ( NOT (p.f->'meeting_room' ? 'equipment_all')
              OR NOT EXISTS (
                SELECT 1
                FROM LATERAL jsonb_array_elements_text(p.f->'meeting_room'->'equipment_all') j(code)
                WHERE NOT EXISTS (
                  SELECT 1
                  FROM meeting_room_equipment me
                  JOIN object_meeting_room r ON r.id = me.room_id AND r.object_id = c.id
                  JOIN ref_code_meeting_equipment e ON e.id = me.equipment_id
                  WHERE e.code = j.code
                )
              )
        )
      ))
      AND (NOT (p.f ? 'capacity_filters') OR NOT EXISTS (
        SELECT 1
        FROM LATERAL jsonb_array_elements(p.f->'capacity_filters') cf(j)
        LEFT JOIN ref_capacity_metric cm ON cm.code = (cf.j->>'code')
        WHERE cm.id IS NULL
           OR NOT EXISTS (
                SELECT 1
                FROM object_capacity oc
                WHERE oc.object_id = c.id
                  AND oc.metric_id = cm.id
                  AND ( (cf.j ? 'min') IS FALSE OR oc.value_integer >= (cf.j->>'min')::int )
                  AND ( (cf.j ? 'max') IS FALSE OR oc.value_integer <= (cf.j->>'max')::int )
           )
      ))
      AND (NOT (p.f ? 'classifications_any') OR EXISTS (
        SELECT 1
        FROM LATERAL jsonb_array_elements(p.f->'classifications_any') cv(j)
        JOIN ref_classification_scheme s ON s.code = (cv.j->>'scheme_code')
        JOIN ref_classification_value  v ON v.scheme_id = s.id AND v.code = (cv.j->>'value_code')
        JOIN object_classification oc  ON oc.object_id = c.id AND oc.scheme_id = s.id AND oc.value_id = v.id
      ))
      AND (NOT (p.f ? 'tags_any') OR EXISTS (
        SELECT 1
        FROM tag_link tl
        JOIN ref_tag t ON t.id = tl.tag_id
        JOIN LATERAL jsonb_array_elements_text(p.f->'tags_any') j(slug) ON TRUE
        WHERE tl.target_table = 'object'
          AND tl.target_pk = c.id
          AND t.slug = j.slug
      ))
      AND (NOT (p.f ? 'itinerary') OR EXISTS (
        SELECT 1
        FROM object_iti oi
        WHERE oi.object_id = c.id
          AND ( (p.f->'itinerary'->>'is_loop') IS NULL OR oi.is_loop = (p.f->'itinerary'->>'is_loop')::boolean )
          AND ( (p.f->'itinerary'->>'difficulty_min') IS NULL OR oi.difficulty_level >= (p.f->'itinerary'->>'difficulty_min')::int )
          AND ( (p.f->'itinerary'->>'difficulty_max') IS NULL OR oi.difficulty_level <= (p.f->'itinerary'->>'difficulty_max')::int )
          AND ( (p.f->'itinerary'->>'distance_min_km') IS NULL OR oi.distance_km >= (p.f->'itinerary'->>'distance_min_km')::numeric )
          AND ( (p.f->'itinerary'->>'distance_max_km') IS NULL OR oi.distance_km <= (p.f->'itinerary'->>'distance_max_km')::numeric )
          AND ( (p.f->'itinerary'->>'duration_min_h') IS NULL OR oi.duration_hours >= (p.f->'itinerary'->>'duration_min_h')::numeric )
          AND ( (p.f->'itinerary'->>'duration_max_h') IS NULL OR oi.duration_hours <= (p.f->'itinerary'->>'duration_max_h')::numeric )
          AND (
            NOT (p.f->'itinerary' ? 'practices_any')
            OR EXISTS (
                SELECT 1
                FROM object_iti_practice oip
                JOIN ref_code_iti_practice ip ON ip.id = oip.practice_id
                JOIN LATERAL jsonb_array_elements_text(p.f->'itinerary'->'practices_any') j(code) ON TRUE
                WHERE oip.object_id = c.id AND ip.code = j.code
            )
          )
      ))
      AND (NOT (p.f ? 'within_radius') OR EXISTS (
        SELECT 1
        FROM object_location ol
        WHERE ol.object_id = c.id
          AND ol.is_main_location IS TRUE
          AND ol.geog2 IS NOT NULL
          AND ST_DWithin(
                ol.geog2,
                ST_SetSRID(ST_MakePoint(
                  (p.f->'within_radius'->>'lon')::float8,
                  (p.f->'within_radius'->>'lat')::float8
                ),4326)::geography,
                GREATEST(0,(p.f->'within_radius'->>'radius_m')::int)
              )
      ))
      AND (NOT (p.f ? 'bbox') OR EXISTS (
        SELECT 1
        FROM object_location ol
        WHERE ol.object_id = c.id
          AND ol.is_main_location IS TRUE
          AND ol.geog2 IS NOT NULL
          AND ST_Within(
            ol.geog2::geometry,
            ST_MakeEnvelope(
              (p.f->'bbox'->>0)::float8, (p.f->'bbox'->>1)::float8,
              (p.f->'bbox'->>2)::float8, (p.f->'bbox'->>3)::float8, 4326
            )
          )
      ))
      AND (NOT (p.f ? 'open_now') OR api.is_object_open_now(c.id))
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
  SELECT COALESCE(json_agg(
           api.get_object_resource(
             id,
             p_lang_prefs,
             v_track,
             jsonb_build_object(
               'include_stages', v_inc,
               'stage_color', v_color
             )
           )
           ORDER BY ord
         ), '[]'::json)
  INTO v_data
  FROM unnest(v_ids) WITH ORDINALITY AS t(id, ord);

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
      'schema_version', '3.0',
      'cursor', api.cursor_pack(v_cursor),
      'next_cursor', v_next
    ),
    'links', json_build_object(
      'next', CASE WHEN v_next IS NOT NULL THEN '?cursor=' || v_next ELSE NULL END
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
SECURITY DEFINER
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
SECURITY DEFINER
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
AS $$
DECLARE
  v_parent_data JSONB := '[]'::jsonb;
  v_relation RECORD;
BEGIN
  -- Get parent objects through relations
  FOR v_relation IN
    SELECT 
      r.target_object_id,
      o.object_type,
      o.name,
      o.status,
      r.relation_type_id,
      rt.name as relation_type_name,
      r.distance_m,
      r.note
    FROM object_relation r
    JOIN object o ON o.id = r.target_object_id
    LEFT JOIN ref_object_relation_type rt ON rt.id = r.relation_type_id
    WHERE r.source_object_id = p_object_id
  LOOP
    v_parent_data := v_parent_data || jsonb_build_object(
      'id', v_relation.target_object_id,
      'type', v_relation.object_type::text,
      'name', v_relation.name,
      'status', v_relation.status::text,
      'relation_type', jsonb_build_object(
        'id', v_relation.relation_type_id,
        'name', v_relation.relation_type_name
      ),
      'distance_m', v_relation.distance_m,
      'note', v_relation.note,
      'basic_info', jsonb_build_object(
        'id', v_relation.target_object_id,
        'type', v_relation.object_type::text,
        'name', v_relation.name,
        'status', v_relation.status::text
      )
    );
  END LOOP;

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
AS $$
DECLARE
  v_actor_data JSONB := '[]'::jsonb;
  v_actor RECORD;
  v_actor_contacts JSONB;
  v_contact RECORD;
BEGIN
  -- Get actors associated with the object
  FOR v_actor IN
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
      aor.note
    FROM actor a
    JOIN actor_object_role aor ON aor.actor_id = a.id
    LEFT JOIN ref_actor_role rar ON rar.id = aor.role_id
    WHERE aor.object_id = p_object_id
  LOOP
    -- Get actor contacts
    v_actor_contacts := '[]'::jsonb;
    FOR v_contact IN
      SELECT 
        ac.id,
        rck.code as kind_code,
        rck.name as kind_name,
        rck.description as kind_description,
        rck.icon_url as kind_icon_url,
        ac.value,
        ac.is_primary,
        rcr.code as role_code,
        rcr.name as role_name,
        ac.position,
        ac.extra
      FROM actor_channel ac
      JOIN ref_code_contact_kind rck ON rck.id = ac.kind_id
      LEFT JOIN ref_contact_role rcr ON rcr.id = ac.role_id
      WHERE ac.actor_id = v_actor.id
      ORDER BY ac.is_primary DESC, ac.position NULLS LAST, ac.created_at
    LOOP
      v_actor_contacts := v_actor_contacts || jsonb_build_object(
        'id', v_contact.id,
        'kind', jsonb_build_object(
          'code', v_contact.kind_code,
          'name', v_contact.kind_name,
          'description', v_contact.kind_description,
          'icon_url', v_contact.kind_icon_url
        ),
        'value', v_contact.value,
        'is_primary', v_contact.is_primary,
        'role', jsonb_build_object(
          'code', v_contact.role_code,
          'name', v_contact.role_name
        ),
        'position', v_contact.position,
        'extra', v_contact.extra
      );
    END LOOP;

    v_actor_data := v_actor_data || jsonb_build_object(
      'id', v_actor.id,
      'display_name', v_actor.display_name,
      'first_name', v_actor.first_name,
      'last_name', v_actor.last_name,
      'gender', v_actor.gender,
      'role', jsonb_build_object(
        'id', v_actor.role_id,
        'code', v_actor.role_code,
        'name', v_actor.role_name
      ),
      'is_primary', v_actor.is_primary,
      'valid_from', v_actor.valid_from,
      'valid_to', v_actor.valid_to,
      'visibility', v_actor.visibility,
      'note', v_actor.note,
      'contacts', v_actor_contacts
    );
  END LOOP;

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
AS $$
DECLARE
  v_org_data JSONB := '[]'::jsonb;
  v_org RECORD;
  v_org_contacts JSONB;
  v_contact RECORD;
BEGIN
  -- Get organizations linked to the object
  FOR v_org IN
    SELECT 
      o.id,
      o.object_type,
      o.name,
      o.status,
      ool.role_id,
      ror.name as role_name,
      ror.code as role_code,
      ool.note
    FROM object_org_link ool
    JOIN object o ON o.id = ool.org_object_id
    LEFT JOIN ref_org_role ror ON ror.id = ool.role_id
    WHERE ool.object_id = p_object_id
  LOOP
    -- Get organization contacts
    v_org_contacts := '[]'::jsonb;
    FOR v_contact IN
      SELECT 
        cc.id,
        rck.code as kind_code,
        rck.name as kind_name,
        rck.description as kind_description,
        rck.icon_url as kind_icon_url,
        cc.value,
        cc.is_public,
        cc.is_primary,
        rcr.code as role_code,
        rcr.name as role_name,
        cc.position
      FROM contact_channel cc
      JOIN ref_code_contact_kind rck ON rck.id = cc.kind_id
      LEFT JOIN ref_contact_role rcr ON rcr.id = cc.role_id
      WHERE cc.object_id = v_org.id
      ORDER BY cc.is_primary DESC, cc.position NULLS LAST, cc.created_at
    LOOP
      v_org_contacts := v_org_contacts || jsonb_build_object(
        'id', v_contact.id,
        'kind', jsonb_build_object(
          'code', v_contact.kind_code,
          'name', v_contact.kind_name,
          'description', v_contact.kind_description,
          'icon_url', v_contact.kind_icon_url
        ),
        'value', v_contact.value,
        'is_public', v_contact.is_public,
        'is_primary', v_contact.is_primary,
        'role', jsonb_build_object(
          'code', v_contact.role_code,
          'name', v_contact.role_name
        ),
        'position', v_contact.position
      );
    END LOOP;

    v_org_data := v_org_data || jsonb_build_object(
      'id', v_org.id,
      'type', v_org.object_type::text,
      'name', v_org.name,
      'status', v_org.status::text,
      'role', jsonb_build_object(
        'id', v_org.role_id,
        'code', v_org.role_code,
        'name', v_org.role_name
      ),
      'note', v_org.note,
      'contacts', v_org_contacts
    );
  END LOOP;

  RETURN v_org_data;
END;
$$;

-- =====================================================
-- Enhanced API function: Get object with deep parent, actor, and organization data
-- =====================================================
CREATE OR REPLACE FUNCTION api.get_object_with_deep_data(p_object_id TEXT)
RETURNS JSON
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_object_data JSONB;
  v_parent_objects JSONB;
  v_actors JSONB;
  v_organizations JSONB;
  v_result JSON;
BEGIN
  -- Get basic object data using existing function
  SELECT api.get_object_resource(p_object_id, ARRAY['fr'], 'none', '{}'::jsonb)::jsonb INTO v_object_data;
  
  -- Get parent objects data
  SELECT api.get_parent_object_data(p_object_id) INTO v_parent_objects;
  
  -- Get actors data
  SELECT api.get_actor_data(p_object_id) INTO v_actors;
  
  -- Get organizations data
  SELECT api.get_organization_data(p_object_id) INTO v_organizations;
  
  -- Build enhanced result
  v_result := json_build_object(
    'object', v_object_data,
    'parent_objects', v_parent_objects,
    'actors', v_actors,
    'organizations', v_organizations
  );
  
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
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_result JSONB := '[]'::jsonb;
  v_object_id TEXT;
  v_object_data JSONB;
BEGIN
  -- Process each object ID
  FOREACH v_object_id IN ARRAY p_object_ids
  LOOP
    -- Get deep data for each object
    SELECT api.get_object_with_deep_data(v_object_id)::jsonb INTO v_object_data;
    v_result := v_result || v_object_data;
  END LOOP;
  
  RETURN v_result::json;
END;
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
AS $$
DECLARE
  v_object_ids TEXT[];
  v_result JSON;
BEGIN
  -- Get object IDs by type
  SELECT ARRAY_AGG(id ORDER BY name)
  INTO v_object_ids
  FROM object
  WHERE object_type::text = p_object_type
    AND status = 'published'
  LIMIT p_limit
  OFFSET p_offset;
  
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
AS $$
DECLARE
  v_object_ids TEXT[];
  v_result JSON;
BEGIN
  -- Search for objects
  SELECT ARRAY_AGG(o.id ORDER BY o.name)
  INTO v_object_ids
  FROM object o
  WHERE o.status = 'published'
    AND (p_object_types IS NULL OR o.object_type::text = ANY(p_object_types))
    AND (
      o.name ILIKE '%' || p_search_term || '%'
      OR EXISTS (
        SELECT 1 FROM object_location ol
        WHERE ol.object_id = o.id
          AND ol.is_main_location = TRUE
          AND (ol.city ILIKE '%' || p_search_term || '%'
               OR ol.address1 ILIKE '%' || p_search_term || '%')
      )
    )
  LIMIT p_limit
  OFFSET p_offset;
  
  -- Get deep data for found objects
  SELECT api.get_objects_with_deep_data(v_object_ids, p_languages, p_include_media, p_filters)
  INTO v_result;
  
  RETURN v_result;
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