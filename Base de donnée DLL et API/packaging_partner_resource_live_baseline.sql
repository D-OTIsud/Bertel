-- Explicit fresh-install packaging, not a production feature migration.
-- Apply AFTER historical tests, BEFORE R1 and BEFORE upgrade fixture capture.
-- The current live reader (523b18...) is already aligned: this script is a no-op there.
-- Exact provenance: api_views_functions body 4b2470de32eaa68bb4d6ea1581d672e3,
-- Whitespace inside the dollar-quoted anchors is intentionally verbatim: trimming
-- historical SELECT/CASE lines would invalidate exact matching and the recorded hash.
-- plus TWO actor-realm substitutions => CI fresh 4a695fba4869dd45a3881e4804808c2c.
-- Missing packaging comprises already-live render reuse and legal/raw-description gates.
-- Reviewed source/target body diff: docs/schema-workbench/contracts/partner-resource-fresh-live-alignment.diff
-- Align fresh SQL to the ALREADY-LIVE public contract, including its confidentiality gates.
-- No table data, grants, RLS, signature or runtime setting is changed.
BEGIN;
SET LOCAL lock_timeout='500ms';
SET LOCAL statement_timeout='10s';
SET LOCAL idle_in_transaction_session_timeout='15s';
DO $baseline_packaging$
DECLARE
 v_function regprocedure:='api.get_object_resource(text,text[],text,jsonb)'::regprocedure;
 v_md5 text; v_definition text; v_metadata jsonb; v_before text; v_after text;
BEGIN
 SELECT md5(replace(p.prosrc,E'\r\n',E'\n')),pg_get_functiondef(p.oid),jsonb_build_object('owner',p.proowner,'acl',to_jsonb(p.proacl),'config',to_jsonb(p.proconfig),'definer',p.prosecdef,'strict',p.proisstrict,'volatility',p.provolatile,'parallel',p.proparallel,'returns',p.prorettype,'set',p.proretset,'args',p.proargtypes::text,'cost',p.procost,'rows',p.prorows)
 INTO v_md5,v_definition,v_metadata FROM pg_proc p WHERE p.oid=v_function;
 IF v_md5='523b18abc402528c494e25f3895f2912' THEN RETURN; END IF;
 IF v_md5 IS DISTINCT FROM '4a695fba4869dd45a3881e4804808c2c' THEN
  RAISE EXCEPTION 'reader baseline packaging: unreviewed source %, compare before applying',v_md5;
 END IF;
 v_definition:=replace(v_definition,E'\r\n',E'\n');

 -- Reviewed source hunk 1: fresh lines 18-23, live lines 18-28.
 v_before:=$baseline_before_1$  v_render_version TEXT := COALESCE(NULLIF(p_options->>'render_version',''), '1.0');
  v_render JSONB := '{}'::jsonb;
  v_tmp_json JSONB;
  v_omit_empty BOOLEAN := COALESCE((p_options->>'omit_empty')::boolean, FALSE);
  v_can_read_extended BOOLEAN := FALSE;
  -- §208 (migration_actor_contacts_org_gate.sql) : sonde PARESSEUSE des coordonnées
$baseline_before_1$;
 v_after:=$baseline_after_1$  v_render_version TEXT := COALESCE(NULLIF(p_options->>'render_version',''), '1.0');
  v_render JSONB := '{}'::jsonb;
  v_tmp_json JSONB;
  -- Per-call render reuse; strict structured labels remain independent.
  v_capacity_lines JSONB;
  v_amenity_lines JSONB;
  v_contact_lines JSONB;
  v_media_lines JSONB;
  v_omit_empty BOOLEAN := COALESCE((p_options->>'omit_empty')::boolean, FALSE);
  v_can_read_extended BOOLEAN := FALSE;
  -- §208 (migration_actor_contacts_org_gate.sql) : sonde PARESSEUSE des coordonnées
$baseline_after_1$;
 IF (length(v_definition)-length(replace(v_definition,v_before,'')))/length(v_before)<>1 THEN
  RAISE EXCEPTION 'reader baseline packaging: expected exactly one reviewed anchor 1';
 END IF;
 v_definition:=replace(v_definition,v_before,v_after);

 -- Reviewed source hunk 2: fresh lines 367-373, live lines 372-378.
 v_before:=$baseline_before_2$  -- Editor-only raw description layers (full i18n maps) so the workspace can edit
  -- canonical and the current user's org overlay per language. Additive keys: no
  -- existing consumer reads them. Spec 2026-06-01-org-description-enrichment.
  IF v_fields IS NULL OR 'canonical_description' = ANY(v_fields) THEN
    js := js || jsonb_build_object(
      'canonical_description',
      (SELECT to_jsonb(d) FROM object_description d
$baseline_before_2$;
 v_after:=$baseline_after_2$  -- Editor-only raw description layers (full i18n maps) so the workspace can edit
  -- canonical and the current user's org overlay per language. Additive keys: no
  -- existing consumer reads them. Spec 2026-06-01-org-description-enrichment.
  IF COALESCE(v_can_read_extended, FALSE) AND (v_fields IS NULL OR 'canonical_description' = ANY(v_fields)) THEN
    js := js || jsonb_build_object(
      'canonical_description',
      (SELECT to_jsonb(d) FROM object_description d
$baseline_after_2$;
 IF (length(v_definition)-length(replace(v_definition,v_before,'')))/length(v_before)<>1 THEN
  RAISE EXCEPTION 'reader baseline packaging: expected exactly one reviewed anchor 2';
 END IF;
 v_definition:=replace(v_definition,v_before,v_after);

 -- Reviewed source hunk 3: fresh lines 376-382, live lines 381-387.
 v_before:=$baseline_before_3$        LIMIT 1)
    );
  END IF;
  IF v_fields IS NULL OR 'org_description' = ANY(v_fields) THEN
    js := js || jsonb_build_object(
      'org_description',
      CASE WHEN v_user_org IS NULL THEN NULL ELSE (
$baseline_before_3$;
 v_after:=$baseline_after_3$        LIMIT 1)
    );
  END IF;
  IF COALESCE(v_can_read_extended, FALSE) AND (v_fields IS NULL OR 'org_description' = ANY(v_fields)) THEN
    js := js || jsonb_build_object(
      'org_description',
      CASE WHEN v_user_org IS NULL THEN NULL ELSE (
$baseline_after_3$;
 IF (length(v_definition)-length(replace(v_definition,v_before,'')))/length(v_before)<>1 THEN
  RAISE EXCEPTION 'reader baseline packaging: expected exactly one reviewed anchor 3';
 END IF;
 v_definition:=replace(v_definition,v_before,v_after);

 -- Reviewed source hunk 4: fresh lines 408-440, live lines 413-459.
 v_before:=$baseline_before_4$
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

  -- Web channels (réseaux sociaux + distribution) — object-scoped online presence (§90)
$baseline_before_4$;
 v_after:=$baseline_after_4$
  -- Contacts (enriched) - ensure only one is marked as primary
  IF v_fields IS NULL OR 'contacts' = ANY(v_fields) THEN
    WITH shared_contacts AS MATERIALIZED (
      SELECT c.*, c.ctid::tid AS contact_ctid, NULLIF((to_jsonb(c)->>'id'),'') AS contact_sort_id,
             rc AS kind_row, rcr.code AS role_code,
             CASE WHEN v_render_enabled THEN COALESCE(api.i18n_pick(rc.name_i18n, lang, 'fr'), rc.name) END AS render_kind_name
      FROM contact_channel c
      JOIN ref_code_contact_kind rc ON rc.id = c.kind_id
      LEFT JOIN ref_contact_role rcr ON rcr.id = c.role_id
      -- §208 : composer le drapeau de champ AVEC l'arm publié (§49), exactement comme
      -- le leg structuré `contacts` plus haut. Ce sous-select n'avait aucune garde et
      -- rendait les canaux is_public = FALSE (ligne directe, portable du gérant…) à tout
      -- appelant, y compris anon.
      WHERE c.object_id = obj.id
        AND (v_can_read_extended OR c.is_public = TRUE)
    )
    SELECT COALESCE(jsonb_agg(
              jsonb_build_object(
                'kind_code', (c.kind_row).code,
                'kind_name', COALESCE(api.i18n_pick_strict((c.kind_row).name_i18n, lang, 'fr'), (c.kind_row).name),
                'kind_description', COALESCE(api.i18n_pick_strict((c.kind_row).description_i18n, lang, 'fr'), (c.kind_row).description),
                'icon_url',  (c.kind_row).icon_url,
                 'value',     c.value,
                 'is_public', c.is_public,
                 'is_primary', c.is_primary,
                 'role',      c.role_code,
                 'position',  c.position
               )
               ORDER BY c.is_primary DESC,
                        c.position NULLS LAST,
                        c.created_at,
                        c.contact_sort_id NULLS LAST,
                        c.contact_ctid
             ), '[]'::jsonb),
           CASE WHEN v_render_enabled THEN COALESCE(
             jsonb_agg(to_jsonb(CASE WHEN c.role_code IS NOT NULL
               THEN c.render_kind_name || ' : ' || c.value || ' (' || c.role_code || ')'
               ELSE c.render_kind_name || ' : ' || c.value END)
               ORDER BY c.is_primary DESC, c.position NULLS LAST, c.created_at, c.contact_ctid)
               FILTER (WHERE v_render_enabled), '[]'::jsonb) END
    INTO v_tmp_json, v_contact_lines
    FROM shared_contacts c;
    js := js || jsonb_build_object('contacts', v_tmp_json);
  END IF;

  -- Web channels (réseaux sociaux + distribution) — object-scoped online presence (§90)
$baseline_after_4$;
 IF (length(v_definition)-length(replace(v_definition,v_before,'')))/length(v_before)<>1 THEN
  RAISE EXCEPTION 'reader baseline packaging: expected exactly one reviewed anchor 4';
 END IF;
 v_definition:=replace(v_definition,v_before,v_after);

 -- Reviewed source hunk 5: fresh lines 488-499, live lines 507-522.
 v_before:=$baseline_before_5$    );
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
$baseline_before_5$;
 v_after:=$baseline_after_5$    );
  END IF;

  -- Media (enriched) - raw rows shared; organization selection remains structured-only.
  IF v_fields IS NULL OR 'media' = ANY(v_fields) THEN
    WITH shared_media AS MATERIALIZED (
      SELECT m.*, m.ctid::tid AS media_ctid
      FROM media m
      WHERE m.object_id = obj.id
        AND m.is_published = TRUE
        AND (v_can_read_extended OR m.visibility IS NULL OR m.visibility = 'public')
    )
    SELECT COALESCE((
      SELECT jsonb_agg(
              jsonb_build_object(
                 'id',        m.id,
$baseline_after_5$;
 IF (length(v_definition)-length(replace(v_definition,v_before,'')))/length(v_before)<>1 THEN
  RAISE EXCEPTION 'reader baseline packaging: expected exactly one reviewed anchor 5';
 END IF;
 v_definition:=replace(v_definition,v_before,v_after);

 -- Reviewed source hunk 6: fresh lines 527-536, live lines 550-557.
 v_before:=$baseline_before_6$        SELECT DISTINCT ON (m.id)
          m.id, m.media_type_id, m.title, m.title_i18n, m.description, m.description_i18n, m.credit, m.url,
          m.is_main, m.visibility, m.position, m.width, m.height, m.created_at
        FROM media m
        WHERE m.object_id = obj.id
          AND m.is_published = TRUE
          AND (v_can_read_extended OR m.visibility IS NULL OR m.visibility = 'public')
          -- When v_prefer_org is NULL (no org link on this object), return all media.
          -- When v_prefer_org is set, return that org's media and unattributed media only.
          AND (v_prefer_org IS NULL OR m.org_object_id = v_prefer_org OR m.org_object_id IS NULL)
$baseline_before_6$;
 v_after:=$baseline_after_6$        SELECT DISTINCT ON (m.id)
          m.id, m.media_type_id, m.title, m.title_i18n, m.description, m.description_i18n, m.credit, m.url,
          m.is_main, m.visibility, m.position, m.width, m.height, m.created_at
        FROM shared_media m
        WHERE TRUE
          -- When v_prefer_org is NULL (no org link on this object), return all media.
          -- When v_prefer_org is set, return that org's media and unattributed media only.
          AND (v_prefer_org IS NULL OR m.org_object_id = v_prefer_org OR m.org_object_id IS NULL)
$baseline_after_6$;
 IF (length(v_definition)-length(replace(v_definition,v_before,'')))/length(v_before)<>1 THEN
  RAISE EXCEPTION 'reader baseline packaging: expected exactly one reviewed anchor 6';
 END IF;
 v_definition:=replace(v_definition,v_before,v_after);

 -- Reviewed source hunk 7: fresh lines 541-600, live lines 562-661.
 v_before:=$baseline_before_7$          m.position NULLS LAST
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
$baseline_before_7$;
 v_after:=$baseline_after_7$          m.position NULLS LAST
      ) m
      JOIN ref_code_media_type mt ON mt.id = m.media_type_id

    ), '[]'::jsonb),
    CASE WHEN v_render_enabled THEN COALESCE((
      SELECT jsonb_agg(to_jsonb(line_text) ORDER BY is_main DESC, position NULLS LAST, created_at, media_ctid) FILTER (WHERE v_render_enabled)
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
          m.media_ctid
        FROM shared_media m
        JOIN ref_code_media_type mt ON mt.id = m.media_type_id
        WHERE v_render_enabled
      ) lines
    ), '[]'::jsonb) END
    INTO v_tmp_json, v_media_lines;
    js := js || jsonb_build_object('media', v_tmp_json);
  END IF;

  -- Capacity (enriched)
  IF v_fields IS NULL OR 'capacity' = ANY(v_fields) THEN
    -- One joined rowset, two independent labels and orderings. Render work stays lazy.
    WITH shared_rows AS MATERIALIZED (
      SELECT oc AS capacity_row, rm AS metric_row,
             CASE WHEN v_render_enabled THEN COALESCE(api.i18n_get_text('ref_capacity_metric', rm.id::text, 'name', lang, 'fr'), rm.name) END AS render_name
      FROM object_capacity oc
      JOIN ref_capacity_metric rm ON rm.id = oc.metric_id
      WHERE oc.object_id = obj.id
    )
    SELECT COALESCE(jsonb_agg(
              jsonb_build_object(
                'metric_code', (metric_row).code,
                'metric_name', COALESCE(api.i18n_get_text_strict('ref_capacity_metric', (metric_row).id::text, 'name', lang, 'fr'), (metric_row).name),
                'metric_description', COALESCE(api.i18n_get_text_strict('ref_capacity_metric', (metric_row).id::text, 'description', lang, 'fr'), (metric_row).description),
                'icon_url',    (metric_row).icon_url,
                'value',       (capacity_row).value_integer,
                'unit',        (capacity_row).unit
              )
               ORDER BY (metric_row).position NULLS LAST, (metric_row).name, (metric_row).code
             ), '[]'::jsonb),
           CASE WHEN v_render_enabled THEN COALESCE(
             jsonb_agg(to_jsonb(CASE WHEN (capacity_row).value_integer IS NOT NULL THEN
              trim(BOTH ' ' FROM COALESCE((capacity_row).value_integer::text, '')
                || ' ' || COALESCE(NULLIF((capacity_row).unit, ''), '')
                || CASE WHEN COALESCE(NULLIF((capacity_row).unit, ''), '') <> '' AND COALESCE(render_name, '') <> '' THEN ' ' ELSE '' END
                || COALESCE(render_name, ''))
            ELSE COALESCE(render_name, '') END) ORDER BY (metric_row).position NULLS LAST, render_name, (metric_row).code) FILTER (WHERE v_render_enabled), '[]'::jsonb) END
    INTO v_tmp_json, v_capacity_lines
    FROM shared_rows;
    js := js || jsonb_build_object('capacity', v_tmp_json);
  END IF;

  -- Amenities (enriched)
  -- disability_types: sourced from ref_amenity.extra->'disability_types' (acc_* codes only).
  -- Null for non-accessibility amenities — intentional; consumers treat absence as "not typed".
  IF v_fields IS NULL OR 'amenities' = ANY(v_fields) THEN
    -- One joined rowset, two independent labels and orderings. Render work stays lazy.
    WITH shared_rows AS MATERIALIZED (
      SELECT ra AS amenity_row, rf AS family_row,
             CASE WHEN v_render_enabled THEN COALESCE(api.i18n_pick(ra.name_i18n, lang, 'fr'), ra.name) END AS render_amenity_name,
             CASE WHEN v_render_enabled THEN COALESCE(api.i18n_pick(rf.name_i18n, lang, 'fr'), rf.name) END AS render_family_name
      FROM object_amenity oa
      JOIN ref_amenity ra ON ra.id = oa.amenity_id
      JOIN ref_code_amenity_family rf ON rf.id = ra.family_id
      WHERE oa.object_id = obj.id
    )
    SELECT COALESCE(jsonb_agg(
               jsonb_build_object(
                 'code',             (amenity_row).code,
                 'name',             COALESCE(api.i18n_pick_strict((amenity_row).name_i18n, lang, 'fr'), (amenity_row).name),
                 'icon_url',         (amenity_row).icon_url,
                 'disability_types', (amenity_row).extra->'disability_types',
                 'family', jsonb_build_object(
                   'code',     (family_row).code,
                   'name',     COALESCE(api.i18n_pick_strict((family_row).name_i18n, lang, 'fr'), (family_row).name),
                   'icon_url', (family_row).icon_url
                 )
               )
               ORDER BY (family_row).name, (family_row).code, (amenity_row).name, (amenity_row).code
             ), '[]'::jsonb),
           CASE WHEN v_render_enabled THEN COALESCE(
             jsonb_agg(to_jsonb(render_amenity_name || ' (' || render_family_name || ')') ORDER BY render_family_name, (family_row).code, render_amenity_name, (amenity_row).code) FILTER (WHERE v_render_enabled), '[]'::jsonb) END
    INTO v_tmp_json, v_amenity_lines
    FROM shared_rows;
    js := js || jsonb_build_object('amenities', v_tmp_json);
  END IF;

  -- Environment tags (enriched)
$baseline_after_7$;
 IF (length(v_definition)-length(replace(v_definition,v_before,'')))/length(v_before)<>1 THEN
  RAISE EXCEPTION 'reader baseline packaging: expected exactly one reviewed anchor 7';
 END IF;
 v_definition:=replace(v_definition,v_before,v_after);

 -- Reviewed source hunk 8: fresh lines 2056-2167, live lines 2117-2140.
 v_before:=$baseline_before_8$      'version', v_render_version
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
        -- §208 : composer le drapeau de champ AVEC l'arm publié (§49), exactement comme
        -- le leg structuré `contacts` plus haut. Ce sous-select n'avait aucune garde et
        -- rendait les canaux is_public = FALSE (ligne directe, portable du gérant…) à tout
        -- appelant, y compris anon.
        WHERE c.object_id = obj.id
          AND (v_can_read_extended OR c.is_public IS TRUE)
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
$baseline_before_8$;
 v_after:=$baseline_after_8$      'version', v_render_version
    );

    -- Contacts (already aggregated from the same raw rows)
    IF v_fields IS NULL OR 'contacts' = ANY(v_fields) THEN
      v_render := v_render || jsonb_build_object('contact_lines', COALESCE(v_contact_lines, '[]'::jsonb));
    END IF;

    -- Media (already aggregated from the same raw rows)
    IF v_fields IS NULL OR 'media' = ANY(v_fields) THEN
      v_render := v_render || jsonb_build_object('media_lines', COALESCE(v_media_lines, '[]'::jsonb));
    END IF;

    -- Capacity (already aggregated from the same raw rows)
    IF v_fields IS NULL OR 'capacity' = ANY(v_fields) THEN
      v_render := v_render || jsonb_build_object('capacity_lines', COALESCE(v_capacity_lines, '[]'::jsonb));
    END IF;

    -- Amenities (already aggregated from the same raw rows)
    IF v_fields IS NULL OR 'amenities' = ANY(v_fields) THEN
      v_render := v_render || jsonb_build_object('amenity_lines', COALESCE(v_amenity_lines, '[]'::jsonb));
    END IF;

    -- Prices
$baseline_after_8$;
 IF (length(v_definition)-length(replace(v_definition,v_before,'')))/length(v_before)<>1 THEN
  RAISE EXCEPTION 'reader baseline packaging: expected exactly one reviewed anchor 8';
 END IF;
 v_definition:=replace(v_definition,v_before,v_after);

 -- Reviewed source hunk 9: fresh lines 2337-2342, live lines 2310-2316.
 v_before:=$baseline_before_9$        FROM object_legal ol
        JOIN ref_legal_type rlt ON rlt.id = ol.type_id
        WHERE ol.object_id = obj.id
      ) lines;
      v_render := v_render || jsonb_build_object('legal_lines', COALESCE(v_tmp_json, '[]'::jsonb));
    END IF;
$baseline_before_9$;
 v_after:=$baseline_after_9$        FROM object_legal ol
        JOIN ref_legal_type rlt ON rlt.id = ol.type_id
        WHERE ol.object_id = obj.id
          AND (v_can_read_extended OR rlt.is_public = TRUE)
      ) lines;
      v_render := v_render || jsonb_build_object('legal_lines', COALESCE(v_tmp_json, '[]'::jsonb));
    END IF;
$baseline_after_9$;
 IF (length(v_definition)-length(replace(v_definition,v_before,'')))/length(v_before)<>1 THEN
  RAISE EXCEPTION 'reader baseline packaging: expected exactly one reviewed anchor 9';
 END IF;
 v_definition:=replace(v_definition,v_before,v_after);

 EXECUTE v_definition;
 IF (SELECT md5(replace(prosrc,E'\r\n',E'\n')) FROM pg_proc WHERE oid=v_function)
    IS DISTINCT FROM '523b18abc402528c494e25f3895f2912' THEN
  RAISE EXCEPTION 'reader baseline packaging: target must exactly equal the reviewed live body';
 END IF;
 IF (SELECT jsonb_build_object('owner',p.proowner,'acl',to_jsonb(p.proacl),'config',to_jsonb(p.proconfig),'definer',p.prosecdef,'strict',p.proisstrict,'volatility',p.provolatile,'parallel',p.proparallel,'returns',p.prorettype,'set',p.proretset,'args',p.proargtypes::text,'cost',p.procost,'rows',p.prorows) FROM pg_proc p WHERE p.oid=v_function) IS DISTINCT FROM v_metadata THEN
  RAISE EXCEPTION 'reader baseline packaging: signature/owner/ACL/attributes changed';
 END IF;
END;
$baseline_packaging$;
COMMIT;
