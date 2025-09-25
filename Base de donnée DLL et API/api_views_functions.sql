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
    'ID', p_period_id::text,
    'Ordre', 1,
    'SyndicObjectId', p_object_id,
    'Datedebut', p_date_start,
    'Datefin', p_date_end,
    'Joursfermeture', '[]'::json,  -- No closed days in rich opening system
    'WeekdaySlots', COALESCE(v_weekday_slots, '{}'::jsonb)::json
  );
END;
$$;

-- =====================================================
-- API — Helpers, Curseurs, Ressource unifiée & Endpoints
-- =====================================================

CREATE SCHEMA IF NOT EXISTS api;

-- =====================================================
-- 1) Helpers : Base64URL & Curseur JSON & Langue & Search
-- =====================================================

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
  p_options      JSONB   DEFAULT '{}'::jsonb     -- { include_stages?:bool, stage_color?:text }
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
BEGIN
  SELECT o.* INTO obj
  FROM object o
  WHERE o.id = p_object_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Base
  js := jsonb_build_object(
    'id', obj.id,
    'type', obj.object_type::text,
    'status', obj.status::text,
    'is_editing', obj.is_editing,
    'name', obj.name,
    'region_code', obj.region_code,
    'created_at', obj.created_at,
    'updated_at', obj.updated_at,
    'updated_at_source', obj.updated_at_source,
    'published_at', obj.published_at
  );

  -- Address (from object_location main)
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

  -- Location (from object_location main)
  js := js || COALESCE((
    SELECT jsonb_build_object(
      'location',
      jsonb_build_object(
        'latitude',   ol.latitude,
        'longitude',  ol.longitude,
        'altitude_m', ol.altitude_m
      )
    )
    FROM object_location ol
    WHERE ol.object_id = obj.id
      AND ol.is_main_location IS TRUE
    ORDER BY ol.created_at
    LIMIT 1
  ), '{}'::jsonb);

  -- Descriptions (public)
  js := js || jsonb_build_object(
    'descriptions',
    COALESCE((
      SELECT jsonb_agg(to_jsonb(d) - 'object_id'
             ORDER BY
               NULLIF((to_jsonb(d)->>'position'),'')::int NULLS LAST,
               NULLIF((to_jsonb(d)->>'language'),'') NULLS LAST,
               NULLIF((to_jsonb(d)->>'kind'),'') NULLS LAST,
               NULLIF((to_jsonb(d)->>'created_at'),'')::timestamptz NULLS LAST,
               NULLIF((to_jsonb(d)->>'id'),'') NULLS LAST,
               d.ctid)
      FROM object_description d
      WHERE d.object_id = obj.id
    ), '[]'::jsonb)
  );


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

  -- Contacts (enriched)
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
                 'is_primary',c.is_primary,
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

  -- Media (enriched)
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
                 'value',       (SELECT code FROM ref_classification_value  v WHERE v.id = oc.value_id),
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
      SELECT jsonb_agg(to_jsonb(d) - 'object_id'
             ORDER BY
               NULLIF((to_jsonb(d)->>'created_at'),'')::timestamptz NULLS LAST,
               NULLIF((to_jsonb(d)->>'id'),'') NULLS LAST,
               d.ctid)
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
      SELECT jsonb_agg(to_jsonb(f) - 'object_id'
             ORDER BY
               NULLIF((to_jsonb(f)->>'start_at'),'')::timestamptz NULLS LAST,
               NULLIF((to_jsonb(f)->>'created_at'),'')::timestamptz NULLS LAST,
               NULLIF((to_jsonb(f)->>'id'),'') NULLS LAST,
               f.ctid)
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
    'relations', jsonb_build_object(
      'out', COALESCE((
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
      'in', COALESCE((
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
    )
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
                                to_jsonb(mi) - 'menu_id'
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
          JOIN object o_restaurant ON o_restaurant.id = r.target_object_id AND o_restaurant.object_type = 'RES'
          JOIN object_menu m ON m.object_id = o_restaurant.id AND m.is_active = TRUE
          JOIN object_menu_item mi ON mi.menu_id = m.id AND mi.is_available = TRUE
          JOIN object_menu_item_cuisine_type mct ON mct.menu_item_id = mi.id
          JOIN ref_code_cuisine_type ct ON ct.id = mct.cuisine_type_id
          WHERE r.source_object_id = obj.id
            AND r.relation_type = 'has_restaurant'  -- ou le type de relation approprié
        ) ct
      ), '[]'::jsonb)
    );
  END IF;

  -- Opening times: build as pure JSON (not JSONB) to preserve field order
  SELECT json_build_object(
           'PeriodeOuverturesAnneeSuivantes',
           COALESCE((
             SELECT json_agg(
                      api.build_opening_period_json(p.id, obj.id, p.date_start, p.date_end)
                      ORDER BY p.date_start NULLS FIRST, p.name, p.created_at
                    )
             FROM opening_period p
             WHERE p.object_id = obj.id
               AND p.date_start >= CURRENT_DATE + INTERVAL '1 year'
           ), '[]'::json),
           'PeriodeOuvertures',
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
    'meeting_rooms',        (js->'meeting_rooms')::json,
    'fma',                  (js->'fma')::json,
    'fma_occurrences',      (js->'fma_occurrences')::json,
    'places',               (js->'places')::json,
    'sustainability_action_labels', (js->'sustainability_action_labels')::json,
    'itinerary_details',    (js->'itinerary_details')::json,
    'relations',            (js->'relations')::json,
    'menus',                (js->'menus')::json,
    'opening_times',        v_opening_times
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
BEGIN
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
  END IF;

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
      'lang', to_jsonb(p_lang_prefs)
    ));
  END IF;

  RETURN json_build_object(
    'info', json_build_object(
      'kind','page',
      'language', lang,
      'language_fallbacks', p_lang_prefs,
      'page_size', v_limit,
      'offset', v_offset,
      'total', total_count,
      'cursor', api.cursor_pack(jsonb_build_object(
        'kind','page',
        'offset', v_offset,
        'page_size', v_limit,
        'types', CASE WHEN v_types IS NULL THEN NULL ELSE to_jsonb(v_types) END,
        'status', CASE WHEN v_status IS NULL THEN NULL ELSE to_jsonb(v_status) END,
        'search', v_search,
        'track_format', v_track,
        'include_stages', v_inc,
        'stage_color', v_color,
        'lang', to_jsonb(p_lang_prefs)
      )),
      'next_cursor', next_cursor
    ),
    'data', COALESCE((
      SELECT json_agg(
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
BEGIN
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
    IF cur ? 'since'        THEN p_since := (cur->>'since')::timestamptz; END IF;
    IF cur ? 'last_ts'      THEN last_ts := (cur->>'last_ts')::timestamptz; END IF;
    IF cur ? 'last_id'      THEN last_id := cur->>'last_id'; END IF;
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
      'lang', to_jsonb(p_lang_prefs)
    ));
  END IF;

  RETURN json_build_object(
    'info', json_build_object(
      'kind','since',
      'language', lang,
      'language_fallbacks', p_lang_prefs,
      'since', p_since,
      'use_source', v_use_source,
      'limit', v_limit,
      'cursor', api.cursor_pack(jsonb_build_object(
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
        'lang', to_jsonb(p_lang_prefs)
      )),
      'next_cursor', next_cursor
    ),
    'data', COALESCE((
      SELECT json_agg(
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
BEGIN
  -- Cursor (offset/page_size + options)
  IF p_cursor IS NOT NULL THEN
    v_cur := api.cursor_unpack(p_cursor);
    v_offset := COALESCE((v_cur->>'offset')::INT, 0);
    v_limit  := LEAST(GREATEST(COALESCE((v_cur->>'page_size')::INT, v_limit),1),200);
    IF v_cur ? 'track_format'   THEN v_track := lower(v_cur->>'track_format'); END IF;
    IF v_cur ? 'include_stages' THEN v_inc   := (v_cur->>'include_stages')::boolean; END IF;
    IF v_cur ? 'stage_color'    THEN v_color := v_cur->>'stage_color'; END IF;
  END IF;

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
         jsonb_build_object('include_stages', v_inc, 'stage_color', v_color)
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
    'stage_color', v_color
  );
  v_next := api.cursor_pack( jsonb_set(v_cursor,'{offset}', to_jsonb(v_offset + v_limit)) );

  RETURN json_build_object(
    'info', json_build_object(
      'kind','page',
      'language', COALESCE(p_lang_prefs[1],'fr'),
      'language_fallbacks', p_lang_prefs,
      'page_size', v_limit,
      'offset', v_offset,
      'total', v_total,
      'cursor', api.cursor_pack(v_cursor),
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
    'info', json_build_object(
      'kind','since',
      'language', v_lang,
      'language_fallbacks', p_lang_prefs,
      'since', p_since,
      'use_source', v_use_source,
      'limit', v_limit,
      'cursor', api.cursor_pack(v_cursor),
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
