-- ===========================================================================
-- API/LCP payload update for enriched Old_data objects
-- Generated: 2026-05-12
--
-- Adds compact payload helpers and updates card/map APIs so the UI can display
-- taxonomy, tags, amenities, environment tags, classifications, accessibility,
-- and sustainability badges without fetching the full detail resource.
--
-- Canonical home: Base de donnée DLL et API/api_views_functions.sql
-- This file is the standalone migration/copy-paste version for an existing DB.
-- ===========================================================================

BEGIN;

-- Hotfix: never read auth.users from runtime RLS policies.
-- Supabase client roles cannot SELECT auth.users, and permissive FOR ALL
-- policies can still be considered while evaluating read queries.
CREATE OR REPLACE FUNCTION api.is_platform_superuser()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, api, auth
AS $$
  SELECT
    auth.role() IN ('service_role', 'admin')
    OR EXISTS (
      SELECT 1
      FROM app_user_profile p
      WHERE p.id = auth.uid()
        AND p.role IN ('owner', 'super_admin')
    );
$$;

CREATE OR REPLACE FUNCTION api.is_platform_owner()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, api, auth
AS $$
  SELECT
    auth.role() IN ('service_role', 'admin')
    OR EXISTS (
      SELECT 1
      FROM app_user_profile p
      WHERE p.id = auth.uid()
        AND p.role = 'owner'
    );
$$;

CREATE OR REPLACE FUNCTION api.is_object_owner(p_object_id text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, api, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM actor_object_role aor
    WHERE aor.actor_id IN (SELECT * FROM api.user_actor_ids())
      AND aor.object_id = p_object_id
      AND aor.is_primary = TRUE
  )
  OR auth.role() IN ('service_role','admin')
  OR api.is_platform_superuser();
$$;

GRANT EXECUTE ON FUNCTION api.is_platform_superuser() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION api.is_platform_owner() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION api.is_object_owner(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION api.current_user_email() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION api.user_actor_ids() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION api.can_read_extended(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION api.current_user_org_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION api.current_user_business_role_code() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION api.current_user_admin_role_code() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION api.current_user_admin_rank() TO authenticated, service_role;

DO $api_auth_users_policy_hotfix$
DECLARE
  p record;
BEGIN
  FOR p IN
    SELECT *
    FROM (VALUES
      ('ref_language'::regclass, 'Écriture admin des langues'),
      ('ref_code_payment_method'::regclass, 'Écriture admin des moyens de paiement'),
      ('ref_code_environment_tag'::regclass, 'Écriture admin des tags d''environnement'),
      ('ref_amenity'::regclass, 'Écriture admin des équipements'),
      ('ref_classification_scheme'::regclass, 'Écriture admin des schémas de classification'),
      ('ref_classification_value'::regclass, 'Écriture admin des valeurs de classification'),
      ('ref_capacity_metric'::regclass, 'Écriture admin des métriques de capacité'),
      ('ref_capacity_applicability'::regclass, 'Écriture admin des applicabilités de capacité'),
      ('ref_document'::regclass, 'Écriture admin des documents de référence'),
      ('ref_sustainability_action_category'::regclass, 'Écriture admin des catégories DD'),
      ('ref_sustainability_action'::regclass, 'Écriture admin des actions DD'),
      ('i18n_translation'::regclass, 'Écriture admin des traductions'),
      ('ref_review_source'::regclass, 'Écriture admin des sources d''avis'),
      ('ref_code_view_type'::regclass, 'Écriture admin des types de vue'),
      ('object_sustainability_action'::regclass, 'Accès admin/service_role (object_sustainability_action)'),
      ('object_sustainability_action_label'::regclass, 'Accès admin/service_role (object_sustainability_action_label)'),
      ('object_review'::regclass, 'Écriture admin des avis'),
      ('promotion'::regclass, 'Écriture admin des promotions'),
      ('promotion_object'::regclass, 'Écriture admin des liaisons promotions'),
      ('promotion_usage'::regclass, 'Écriture admin des usages promotions')
    ) AS v(rel, policy_name)
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %s', p.policy_name, p.rel);
    EXECUTE format(
      'CREATE POLICY %I ON %s FOR ALL USING (auth.role() IN (''service_role'',''admin'') OR api.is_platform_superuser())',
      p.policy_name,
      p.rel
    );
  END LOOP;
END $api_auth_users_policy_hotfix$;

DROP POLICY IF EXISTS "Lecture admin des usages promotions" ON promotion_usage;
CREATE POLICY "Lecture admin des usages promotions" ON promotion_usage
  FOR SELECT USING (
    auth.role() IN ('service_role','admin') OR api.is_platform_superuser()
  );

DROP POLICY IF EXISTS "Lecture audit (admin/service_role)" ON audit.audit_log;
CREATE POLICY "Lecture audit (admin/service_role)" ON audit.audit_log
  FOR SELECT USING (
    auth.role() IN ('service_role','admin') OR api.is_platform_superuser()
  );

DO $api_audit_partition_policy_hotfix$
DECLARE
  p record;
BEGIN
  FOR p IN
    SELECT ns.nspname AS schema_name, c.relname AS table_name
    FROM pg_inherits i
    JOIN pg_class c ON c.oid = i.inhrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
    JOIN pg_class parent ON parent.oid = i.inhparent
    JOIN pg_namespace parent_ns ON parent_ns.oid = parent.relnamespace
    WHERE parent_ns.nspname = 'audit'
      AND parent.relname = 'audit_log'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Lecture audit (admin/service_role)" ON %I.%I', p.schema_name, p.table_name);
    EXECUTE format(
      'CREATE POLICY "Lecture audit (admin/service_role)" ON %I.%I FOR SELECT USING (auth.role() IN (''service_role'',''admin'') OR api.is_platform_superuser())',
      p.schema_name,
      p.table_name
    );
  END LOOP;
END $api_audit_partition_policy_hotfix$;

DROP POLICY IF EXISTS "pub_object_sustainability_action_read" ON object_sustainability_action;
CREATE POLICY "pub_object_sustainability_action_read" ON object_sustainability_action
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM object o
      WHERE o.id = object_sustainability_action.object_id
    )
  );

DROP POLICY IF EXISTS "pub_object_sustainability_action_label_read" ON object_sustainability_action_label;
CREATE POLICY "pub_object_sustainability_action_label_read" ON object_sustainability_action_label
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM object_sustainability_action osa
      JOIN object o ON o.id = osa.object_id
      WHERE osa.id = object_sustainability_action_label.object_sustainability_action_id
    )
  );

-- Security/read surface for enriched card/map payloads.
-- The page RPC is SECURITY INVOKER and calls get_object_card, so authenticated
-- users need read access to the new taxonomy tables used by the compact helpers.
ALTER TABLE object_taxonomy ENABLE ROW LEVEL SECURITY;
ALTER TABLE ref_code_domain_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE ref_code_taxonomy_closure ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pub_object_taxonomy_read" ON object_taxonomy;
CREATE POLICY "pub_object_taxonomy_read" ON object_taxonomy
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM object o
      WHERE o.id = object_taxonomy.object_id
    )
  );

DROP POLICY IF EXISTS "Lecture publique du registre ref_code" ON ref_code_domain_registry;
CREATE POLICY "Lecture publique du registre ref_code" ON ref_code_domain_registry
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Lecture publique de la clôture taxonomique" ON ref_code_taxonomy_closure;
CREATE POLICY "Lecture publique de la clôture taxonomique" ON ref_code_taxonomy_closure
  FOR SELECT USING (true);

GRANT SELECT ON TABLE object_taxonomy TO anon, authenticated, service_role;
GRANT SELECT ON TABLE ref_code_domain_registry TO anon, authenticated, service_role;
GRANT SELECT ON TABLE ref_code_taxonomy_closure TO anon, authenticated, service_role;
GRANT SELECT ON TABLE ref_code, ref_code_amenity_family, ref_tag, tag_link, ref_amenity, object_amenity,
  ref_code_environment_tag, object_environment_tag, ref_classification_scheme,
  ref_classification_value, object_classification, ref_sustainability_action,
  object_sustainability_action TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION api.get_object_taxonomy_compact(
  p_object_id TEXT,
  p_lang_prefs TEXT[] DEFAULT ARRAY['fr']::text[]
)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
  WITH lang AS (
    SELECT api.pick_lang(p_lang_prefs) AS code
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'domain', ot.domain,
        'code', assigned.code,
        'name', COALESCE(api.i18n_pick_strict(assigned.name_i18n, lang.code, 'fr'), assigned.name),
        'path', COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object(
              'code', path_item.code,
              'name', path_item.name
            )
            ORDER BY path_item.public_depth
          )
          FROM (
            SELECT
              anc.code,
              COALESCE(api.i18n_pick_strict(anc.name_i18n, lang.code, 'fr'), anc.name) AS name,
              row_number() OVER (ORDER BY cl.depth DESC) - 1 AS public_depth
            FROM ref_code_taxonomy_closure cl
            JOIN ref_code anc
              ON anc.id = cl.ancestor_id
             AND anc.domain = cl.domain
            WHERE cl.domain = ot.domain
              AND cl.descendant_id = assigned.id
              AND anc.is_assignable IS TRUE
          ) path_item
        ), '[]'::jsonb)
      )
      ORDER BY COALESCE(reg.position, 999999), assigned.name, assigned.code
    ),
    '[]'::jsonb
  )
  FROM object_taxonomy ot
  JOIN ref_code_domain_registry reg ON reg.domain = ot.domain
  JOIN ref_code assigned ON assigned.id = ot.ref_code_id AND assigned.domain = ot.domain
  CROSS JOIN lang
  WHERE ot.object_id = p_object_id;
$$;

COMMENT ON FUNCTION api.get_object_taxonomy_compact(TEXT, TEXT[]) IS
'Compact taxonomy payload for cards, maps and other LCP/list payloads.';

CREATE OR REPLACE FUNCTION api.get_object_tags_compact(
  p_object_id TEXT,
  p_lang_prefs TEXT[] DEFAULT ARRAY['fr']::text[]
)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'slug', t.slug,
        'name', t.name,
        'color', t.color,
        'icon', t.icon,
        'icon_url', t.icon_url
      )
      ORDER BY COALESCE(t.position, 999999), t.name, t.slug
    ),
    '[]'::jsonb
  )
  FROM tag_link tl
  JOIN ref_tag t ON t.id = tl.tag_id
  WHERE tl.target_table = 'object'
    AND tl.target_pk = p_object_id;
$$;

COMMENT ON FUNCTION api.get_object_tags_compact(TEXT, TEXT[]) IS
'Compact object tag payload for cards, maps and LCP/list payloads.';

CREATE OR REPLACE FUNCTION api.get_object_amenity_codes_compact(
  p_object_id TEXT
)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
  SELECT COALESCE(to_jsonb(o.cached_amenity_codes), '[]'::jsonb)
  FROM object o
  WHERE o.id = p_object_id;
$$;

COMMENT ON FUNCTION api.get_object_amenity_codes_compact(TEXT) IS
'Compact amenity code array for cards, maps and LCP/list payloads. Uses canonical cached_amenity_codes, never legacy wheelchair_access.';

CREATE OR REPLACE FUNCTION api.get_object_environment_tags_compact(
  p_object_id TEXT,
  p_lang_prefs TEXT[] DEFAULT ARRAY['fr']::text[]
)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
  WITH lang AS (
    SELECT api.pick_lang(p_lang_prefs) AS code
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'code', et.code,
        'name', COALESCE(api.i18n_pick_strict(et.name_i18n, lang.code, 'fr'), et.name)
      )
      ORDER BY COALESCE(et.position, 999999), et.name, et.code
    ),
    '[]'::jsonb
  )
  FROM object_environment_tag oet
  JOIN ref_code_environment_tag et ON et.id = oet.environment_tag_id
  CROSS JOIN lang
  WHERE oet.object_id = p_object_id;
$$;

COMMENT ON FUNCTION api.get_object_environment_tags_compact(TEXT, TEXT[]) IS
'Compact environment tag payload for cards, maps and LCP/list payloads.';

CREATE OR REPLACE FUNCTION api.get_object_badges_compact(
  p_object_id TEXT,
  p_lang_prefs TEXT[] DEFAULT ARRAY['fr']::text[]
)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
  WITH lang AS (
    SELECT api.pick_lang(p_lang_prefs) AS code
  ), classification_badges AS (
    SELECT
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
    JOIN ref_classification_scheme s ON s.id = oc.scheme_id
    JOIN ref_classification_value v ON v.id = oc.value_id
    CROSS JOIN lang
    WHERE oc.object_id = p_object_id
      AND COALESCE(s.is_distinction, FALSE) IS TRUE
      AND COALESCE(oc.status, 'granted') IN ('granted','requested')
  ), sustainability_badges AS (
    SELECT
      'sustainability_action' AS kind,
      a.code::text AS code,
      COALESCE(api.i18n_pick_strict(a.label_i18n, lang.code, 'fr'), a.label) AS label,
      COALESCE(a.position, 999999) AS position
    FROM object_sustainability_action osa
    JOIN ref_sustainability_action a ON a.id = osa.action_id
    CROSS JOIN lang
    WHERE osa.object_id = p_object_id
  ), accessibility_badges AS (
    SELECT
      'accessibility_amenity' AS kind,
      ra.code::text AS code,
      COALESCE(api.i18n_pick_strict(ra.name_i18n, lang.code, 'fr'), ra.name) AS label,
      COALESCE(ra.position, 999999) AS position
    FROM object_amenity oa
    JOIN ref_amenity ra ON ra.id = oa.amenity_id
    LEFT JOIN ref_code_amenity_family fam ON fam.id = ra.family_id
    CROSS JOIN lang
    WHERE oa.object_id = p_object_id
      AND (ra.code LIKE 'acc_%' OR fam.code = 'accessibility')
  ), all_badges AS (
    SELECT * FROM classification_badges
    UNION ALL
    SELECT * FROM sustainability_badges
    UNION ALL
    SELECT * FROM accessibility_badges
  ), deduped_badges AS (
    SELECT DISTINCT ON (kind, code)
      kind,
      code,
      label,
      position
    FROM all_badges
    ORDER BY kind, code, position, label
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'kind', kind,
        'code', code,
        'label', label
      )
      ORDER BY kind, position, label, code
    ),
    '[]'::jsonb
  )
  FROM deduped_badges;
$$;

COMMENT ON FUNCTION api.get_object_badges_compact(TEXT, TEXT[]) IS
'Compact badges from official classifications, sustainability actions and canonical acc_* accessibility amenities.';

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
    'taxonomy', api.get_object_taxonomy_compact(o.id, p_lang_prefs),
    'tags', api.get_object_tags_compact(o.id, p_lang_prefs),
    'amenity_codes', api.get_object_amenity_codes_compact(o.id),
    'environment_tags', api.get_object_environment_tags_compact(o.id, p_lang_prefs),
    'badges', api.get_object_badges_compact(o.id, p_lang_prefs),
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
  WITH lang AS (
    SELECT api.pick_lang(p_lang_prefs) AS code
  ), input_ids AS (
    SELECT t.id, t.ord
    FROM unnest(COALESCE(p_ids, ARRAY[]::text[])) WITH ORDINALITY AS t(id, ord)
    WHERE t.id IS NOT NULL
  ), distinct_ids AS (
    SELECT DISTINCT id
    FROM input_ids
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
  ), taxonomy_items AS (
    SELECT
      ot.object_id,
      ot.domain,
      assigned.code,
      COALESCE(api.i18n_pick_strict(assigned.name_i18n, lang.code, 'fr'), assigned.name) AS name,
      COALESCE(reg.position, 999999) AS domain_position,
      COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'code', path_item.code,
            'name', path_item.name
          )
          ORDER BY path_item.public_depth
        )
        FROM (
          SELECT
            anc.code,
            COALESCE(api.i18n_pick_strict(anc.name_i18n, lang.code, 'fr'), anc.name) AS name,
            row_number() OVER (ORDER BY cl.depth DESC) - 1 AS public_depth
          FROM ref_code_taxonomy_closure cl
          JOIN ref_code anc
            ON anc.id = cl.ancestor_id
           AND anc.domain = cl.domain
          WHERE cl.domain = ot.domain
            AND cl.descendant_id = assigned.id
            AND anc.is_assignable IS TRUE
        ) path_item
      ), '[]'::jsonb) AS path
    FROM object_taxonomy ot
    JOIN distinct_ids di ON di.id = ot.object_id
    JOIN ref_code_domain_registry reg ON reg.domain = ot.domain
    JOIN ref_code assigned ON assigned.id = ot.ref_code_id AND assigned.domain = ot.domain
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
    'image', o.cached_main_image_url,
    'taxonomy', api.get_object_taxonomy_compact(o.id, p_lang_prefs),
    'tags', api.get_object_tags_compact(o.id, p_lang_prefs),
    'amenity_codes', api.get_object_amenity_codes_compact(o.id),
    'environment_tags', api.get_object_environment_tags_compact(o.id, p_lang_prefs),
    'badges', api.get_object_badges_compact(o.id, p_lang_prefs)
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

GRANT EXECUTE ON FUNCTION api.get_object_taxonomy_compact(TEXT, TEXT[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION api.get_object_tags_compact(TEXT, TEXT[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION api.get_object_amenity_codes_compact(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION api.get_object_environment_tags_compact(TEXT, TEXT[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION api.get_object_badges_compact(TEXT, TEXT[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION api.get_object_card(TEXT, TEXT[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION api.get_object_cards_batch(TEXT[], TEXT[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION api.get_object_map_item(TEXT, TEXT[]) TO authenticated, service_role;

DO $api_enrichment_validation$
DECLARE
  n integer;
  auth_users_policy_count integer;
BEGIN
  SELECT COUNT(*) INTO n
  FROM pg_proc p
  JOIN pg_namespace ns ON ns.oid = p.pronamespace
  WHERE ns.nspname = 'api'
    AND p.proname IN (
      'get_object_resource',
      'get_filtered_object_ids',
      'get_object_card',
      'get_object_map_item',
      'get_object_taxonomy_compact',
      'get_object_tags_compact',
      'get_object_amenity_codes_compact',
      'get_object_environment_tags_compact',
      'get_object_badges_compact'
    );

  IF n < 9 THEN
    RAISE EXCEPTION 'API enrichment validation failed: expected at least 9 API functions, found %', n;
  END IF;

  IF EXISTS (SELECT 1 FROM ref_amenity WHERE code = 'wheelchair_access') THEN
    RAISE WARNING 'Legacy ref_amenity wheelchair_access exists; enriched API helpers use cached canonical amenity codes and acc_* accessibility badges.';
  END IF;

  SELECT COUNT(*) INTO auth_users_policy_count
  FROM pg_policies
  WHERE COALESCE(qual, '') LIKE '%auth.users%'
     OR COALESCE(with_check, '') LIKE '%auth.users%';

  IF auth_users_policy_count > 0 THEN
    RAISE WARNING 'Security validation: % policy definition(s) still reference auth.users and may fail for authenticated clients.', auth_users_policy_count;
  END IF;
END $api_enrichment_validation$;

COMMIT;

NOTIFY pgrst, 'reload schema';
