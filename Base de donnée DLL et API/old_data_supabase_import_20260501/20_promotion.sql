-- ===========================================================================
-- Old_data import - Stage 2 of 2: PROMOTION + VALIDATION (file 20)
--
-- Run order:
--   1. Run every stage 1 file in this folder in numeric order:
--      00_schema_and_batch.sql, 01_object_temp__01.sql, ..., 19_finalize_batch_status.sql.
--   2. Then run this file (20_promotion.sql).
--
-- Batch id: old-data-berta2-all-20260501-01
--
-- Prerequisites:
-- - All stage 1 files have been executed and committed.
-- - schema_unified.sql and seeds_data.sql are installed.
-- - ORG "OTI du Sud" exists with region_code = 'RUN' (the script will
--   stamp the canonical old_data_import_context / oti-du-sud-run external
--   id on first run if it is not already present).
--
-- What this file does:
-- - Resolves and creates final-table rows from staging:
--     object, object_origin, object_external_id, object_org_link,
--     object_location, object_description, object_capacity, object_language,
--     object_payment_method, actor, actor_channel, actor_object_role,
--     contact_channel, object_price, opening_period, media,
--     crm_interaction (parents and comments), object_sustainability_action.
-- - Runs the assertion block. Any failure raises and rolls back the whole
--   promotion transaction; staging stays committed and inspectable.
-- - Emits a read-only validation summary at the end.
-- ===========================================================================

-- =============================================================================
-- Promotion and validation
-- =============================================================================

BEGIN;
-- Keep final-table promotion atomic; a later error rolls these writes back.

DO $old_data_org_prereq$
DECLARE
    v_org_id TEXT;
    n        INTEGER;
BEGIN
    SELECT COUNT(*), MIN(oei.object_id)
    INTO n, v_org_id
    FROM object_external_id oei
    JOIN object o ON o.id = oei.object_id
    WHERE oei.source_system = 'old_data_import_context'
      AND oei.external_id = 'oti-du-sud-run'
      AND oei.organization_object_id = oei.object_id
      AND o.object_type = 'ORG';

    IF n > 1 THEN
        RAISE EXCEPTION 'Old_data prerequisite failed: multiple old_data_import_context org rows for oti-du-sud-run';
    END IF;

    IF n = 0 THEN
        -- Look up by canonical name + region. We do NOT auto-create the ORG
        -- here: per the ORG-vs-ACTOR invariant the SIT publisher must exist
        -- as canonical seed data before any old_data is attached to it.
        SELECT id::text INTO v_org_id
        FROM object
        WHERE object_type = 'ORG'
          AND name = 'OTI du Sud'
          AND region_code = 'RUN';
        IF NOT FOUND THEN
            RAISE EXCEPTION USING
                ERRCODE = 'foreign_key_violation',
                MESSAGE = 'Old_data prerequisite failed: ORG "OTI du Sud" / RUN is missing.',
                DETAIL  = 'The promotion requires a single object row with object_type=''ORG'', '
                       || 'name=''OTI du Sud'', region_code=''RUN''. None was found.',
                HINT    = 'Run the OTI du Sud INSERT block from seeds_data.sql '
                       || '(or all of seeds_data.sql) before re-running 20_promotion.sql.';
        END IF;
    END IF;

    INSERT INTO object_external_id (
        object_id,
        organization_object_id,
        source_system,
        external_id,
        last_synced_at,
        created_at,
        updated_at
    )
    VALUES (
        v_org_id,
        v_org_id,
        'old_data_import_context',
        'oti-du-sud-run',
        NOW(),
        NOW(),
        NOW()
    )
    ON CONFLICT (organization_object_id, source_system, external_id)
    DO UPDATE SET
        object_id       = EXCLUDED.object_id,
        last_synced_at = NOW(),
        updated_at     = NOW();

    RAISE NOTICE 'Old_data org prerequisite resolved: %', v_org_id;
END
$old_data_org_prereq$;

-- Embedded block: old_data_01_promote_objects.sql
-- =============================================================================
-- Old_data 01  Promote core Berta v2 objects and direct object children



--
-- Staging rows are embedded earlier in this standalone SQL.
-- Writes final tables: object, object_origin, object_external_id,
-- object_org_link, object_location, object_description, object_capacity,
-- object_language, object_payment_method.
-- =============================================================================

DO $old_data_objects$
DECLARE
    v_batch_id TEXT := 'old-data-berta2-all-20260501-01';
    v_org_id   TEXT;
    v_role_id  UUID;
    n          INTEGER;
BEGIN
    SELECT oei.object_id INTO v_org_id
    FROM object_external_id oei
    JOIN object o ON o.id = oei.object_id
    WHERE oei.source_system = 'old_data_import_context'
      AND oei.external_id = 'oti-du-sud-run'
      AND oei.organization_object_id = oei.object_id
      AND o.object_type = 'ORG';
    IF NOT FOUND THEN
        RAISE EXCEPTION USING
            ERRCODE = 'foreign_key_violation',
            MESSAGE = 'Old_data prerequisite failed: oti-du-sud-run external id not stamped on any ORG.',
            HINT    = 'The previous DO $old_data_org_prereq$ block should have stamped it. '
                   || 'Re-run 20_promotion.sql from the start.';
    END IF;

    SELECT id INTO v_role_id
    FROM ref_org_role
    WHERE code = 'publisher';
    IF NOT FOUND THEN
        RAISE EXCEPTION USING
            ERRCODE = 'foreign_key_violation',
            MESSAGE = 'Old_data prerequisite failed: ref_org_role row "publisher" is missing.',
            HINT    = 'Apply seeds_data.sql so ref_org_role contains the canonical roles, '
                   || 'then re-run 20_promotion.sql.';
    END IF;

    RAISE NOTICE 'Old_data objects — batch %, org %', v_batch_id, v_org_id;

    -- Existing object resolution by canonical external id.
    UPDATE staging.object_temp t
    SET resolved_object_id = oei.object_id,
        resolution_status = 'resolved_existing',
        is_approved = TRUE
    FROM object_external_id oei
    WHERE t.import_batch_id = v_batch_id
      AND t.resolution_status = 'pending'
      AND oei.organization_object_id = v_org_id
      AND oei.source_system = 'berta_v2_csv_export'
      AND oei.external_id = t.external_id;
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '  Existing by object_external_id: %', n;

    -- Conservative fallback only when no legacy external id exists. Never attach
    -- a Berta external id to a name-matched object; that can silently merge rows.
    WITH unambiguous_name_matches AS (
        SELECT
            t.import_row_id,
            MIN(o.id) AS object_id,
            COUNT(*) AS match_count
        FROM staging.object_temp t
        JOIN object o
          ON o.object_type::text = t.object_type
         AND o.region_code = COALESCE(t.region_code, 'RUN')
         AND btrim(o.name) = btrim(t.name)
        WHERE t.import_batch_id = v_batch_id
          AND t.resolution_status = 'pending'
          AND NULLIF(t.external_id, '') IS NULL
        GROUP BY t.import_row_id
    )
    UPDATE staging.object_temp t
    SET resolved_object_id = m.object_id,
        resolution_status = 'resolved_existing_exact_name',
        is_approved = TRUE
    FROM unambiguous_name_matches m
    WHERE t.import_row_id = m.import_row_id
      AND m.match_count = 1;
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '  Existing by unambiguous name/type without external id: %', n;

    INSERT INTO object (
        object_type,
        name,
        region_code,
        status,
        commercial_visibility,
        extra,
        created_at,
        updated_at
    )
    SELECT
        t.object_type::object_type,
        t.name,
        COALESCE(t.region_code, 'RUN'),
        COALESCE(
            NULLIF(t.status, ''),
            CASE lower(COALESCE(t.raw_source_data->>'En ligne', ''))
                WHEN 'oui' THEN 'published'
                ELSE 'draft'
            END
        )::object_status,
        COALESCE(NULLIF(t.commercial_visibility, ''), 'active'),
        COALESCE(t.extra, '{}'::jsonb)
          || jsonb_build_object(
                'import_batch_id', v_batch_id,
                'legacy_object_id', t.external_id,
                'legacy_en_ligne', t.raw_source_data->>'En ligne',
                'source_system', 'berta_v2_csv_export'
              ),
        NOW(),
        NOW()
    FROM staging.object_temp t
    WHERE t.import_batch_id = v_batch_id
      AND t.resolution_status = 'pending'
      AND t.is_approved IS TRUE
      AND t.object_type IS NOT NULL
      AND t.name IS NOT NULL
      AND NOT EXISTS (
          SELECT 1
          FROM object_external_id oei
          WHERE oei.organization_object_id = v_org_id
            AND oei.source_system = 'berta_v2_csv_export'
            AND oei.external_id = t.external_id
      );
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '  Created objects: %', n;

    UPDATE staging.object_temp t
    SET resolved_object_id = o.id,
        resolution_status = 'created'
    FROM object o
    WHERE t.import_batch_id = v_batch_id
      AND t.resolved_object_id IS NULL
      AND o.extra->>'import_batch_id' = v_batch_id
      AND o.extra->>'legacy_object_id' = t.external_id;
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '  Created object ids resolved: %', n;

    UPDATE object o
    SET status = COALESCE(
            NULLIF(t.status, ''),
            CASE lower(COALESCE(t.raw_source_data->>'En ligne', ''))
                WHEN 'oui' THEN 'published'
                ELSE 'draft'
            END
        )::object_status,
        commercial_visibility = COALESCE(NULLIF(t.commercial_visibility, ''), 'active'),
        extra = COALESCE(o.extra, '{}'::jsonb)
             || jsonb_build_object(
                    'import_batch_id', v_batch_id,
                    'legacy_object_id', t.external_id,
                    'legacy_en_ligne', t.raw_source_data->>'En ligne',
                    'source_system', 'berta_v2_csv_export'
                ),
        updated_at = NOW()
    FROM staging.object_temp t
    WHERE t.import_batch_id = v_batch_id
      AND t.resolved_object_id = o.id
      AND t.is_approved IS TRUE;
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '  Object publication status synced from staging: %', n;

    INSERT INTO object_origin (
        object_id,
        source_system,
        source_object_id,
        first_imported_at,
        created_at,
        updated_at
    )
    SELECT
        t.resolved_object_id,
        'berta_v2_csv_export',
        t.external_id,
        NOW(),
        NOW(),
        NOW()
    FROM staging.object_temp t
    WHERE t.import_batch_id = v_batch_id
      AND t.resolved_object_id IS NOT NULL
      AND t.external_id IS NOT NULL
    ON CONFLICT (object_id) DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '  object_origin inserted: %', n;

    INSERT INTO object_external_id (
        object_id,
        organization_object_id,
        source_system,
        external_id,
        last_synced_at,
        created_at,
        updated_at
    )
    SELECT
        t.resolved_object_id,
        v_org_id,
        'berta_v2_csv_export',
        t.external_id,
        NOW(),
        NOW(),
        NOW()
    FROM staging.object_temp t
    WHERE t.import_batch_id = v_batch_id
      AND t.resolved_object_id IS NOT NULL
      AND t.external_id IS NOT NULL
    ON CONFLICT ON CONSTRAINT uq_object_external_id_by_source DO UPDATE
    SET object_id = EXCLUDED.object_id,
        last_synced_at = NOW(),
        updated_at = NOW();
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '  object_external_id upserted: %', n;

    INSERT INTO object_org_link (object_id, org_object_id, role_id, is_primary, note, created_at, updated_at)
    SELECT
        t.resolved_object_id,
        v_org_id,
        v_role_id,
        TRUE,
        'Publisher link from Berta v2 Old_data import',
        NOW(),
        NOW()
    FROM staging.object_temp t
    WHERE t.import_batch_id = v_batch_id
      AND t.resolved_object_id IS NOT NULL
      AND t.resolved_object_id <> v_org_id
    ON CONFLICT (object_id, org_object_id, role_id) DO UPDATE
    SET is_primary = EXCLUDED.is_primary,
        note = COALESCE(object_org_link.note, EXCLUDED.note),
        updated_at = NOW();
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '  object_org_link upserted: %', n;

    INSERT INTO object_location (
        object_id,
        address1,
        postcode,
        city,
        lieu_dit,
        direction,
        latitude,
        longitude,
        is_main_location,
        created_at,
        updated_at
    )
    SELECT
        o.resolved_object_id,
        l.address1,
        l.postcode,
        l.city,
        l.lieu_dit,
        l.direction,
        l.latitude,
        l.longitude,
        TRUE,
        NOW(),
        NOW()
    FROM staging.object_location_temp l
    JOIN staging.object_temp o
      ON o.import_batch_id = l.import_batch_id
     AND o.staging_object_key = l.staging_object_key
    WHERE l.import_batch_id = v_batch_id
      AND l.is_approved IS TRUE
      AND o.resolved_object_id IS NOT NULL
      AND NOT EXISTS (
          SELECT 1
          FROM object_location existing
          WHERE existing.object_id = o.resolved_object_id
            AND existing.is_main_location IS TRUE
      );
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '  object_location inserted: %', n;

    INSERT INTO object_description (
        object_id,
        org_object_id,
        description,
        description_chapo,
        visibility,
        position,
        created_at,
        updated_at
    )
    SELECT
        o.resolved_object_id,
        v_org_id,
        d.description,
        d.description_chapo,
        COALESCE(d.visibility, 'public'),
        COALESCE(d.position, 0),
        NOW(),
        NOW()
    FROM staging.object_description_temp d
    JOIN staging.object_temp o
      ON o.import_batch_id = d.import_batch_id
     AND o.staging_object_key = d.staging_object_key
    WHERE d.import_batch_id = v_batch_id
      AND d.is_approved IS TRUE
      AND o.resolved_object_id IS NOT NULL
      AND NOT EXISTS (
          SELECT 1
          FROM object_description existing
          WHERE existing.object_id = o.resolved_object_id
            AND existing.org_object_id = v_org_id
      );
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '  object_description inserted: %', n;

    INSERT INTO object_capacity (object_id, metric_id, value_integer, created_at, updated_at)
    SELECT
        o.resolved_object_id,
        m.id,
        c.value_integer,
        NOW(),
        NOW()
    FROM staging.object_capacity_temp c
    JOIN staging.object_temp o
      ON o.import_batch_id = c.import_batch_id
     AND o.staging_object_key = c.staging_object_key
    JOIN ref_capacity_metric m ON m.code = c.metric_code
    WHERE c.import_batch_id = v_batch_id
      AND c.is_approved IS TRUE
      AND o.resolved_object_id IS NOT NULL
      AND c.value_integer IS NOT NULL
    ON CONFLICT (object_id, metric_id) DO UPDATE
    SET value_integer = EXCLUDED.value_integer,
        updated_at = NOW();
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '  object_capacity upserted: %', n;

    INSERT INTO object_language (object_id, language_id, created_at)
    SELECT DISTINCT
        o.resolved_object_id,
        rl.id,
        NOW()
    FROM staging.object_language_temp l
    JOIN staging.object_temp o
      ON o.import_batch_id = l.import_batch_id
     AND o.staging_object_key = l.staging_object_key
    JOIN ref_language rl ON rl.code = l.language_code
    WHERE l.import_batch_id = v_batch_id
      AND l.is_approved IS TRUE
      AND o.resolved_object_id IS NOT NULL
    ON CONFLICT (object_id, language_id) DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '  object_language inserted: %', n;

    INSERT INTO object_payment_method (object_id, payment_method_id, created_at)
    SELECT DISTINCT
        o.resolved_object_id,
        pm.id,
        NOW()
    FROM staging.object_payment_method_temp p
    JOIN staging.object_temp o
      ON o.import_batch_id = p.import_batch_id
     AND o.staging_object_key = p.staging_object_key
    JOIN ref_code_payment_method pm ON pm.code = p.payment_code
    WHERE p.import_batch_id = v_batch_id
      AND p.is_approved IS TRUE
      AND o.resolved_object_id IS NOT NULL
    ON CONFLICT (object_id, payment_method_id) DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '  object_payment_method inserted: %', n;
END
$old_data_objects$;

-- Embedded block: old_data_02_promote_actors.sql
-- =============================================================================
-- Old_data 02  Promote Prestataires to actor / actor_channel / actor_object_role



-- =============================================================================

DO $old_data_actors$
DECLARE
    v_batch_id TEXT := 'old-data-berta2-all-20260501-01';
    v_org_id   TEXT;
    n          INTEGER;
BEGIN
    SELECT oei.object_id INTO STRICT v_org_id
    FROM object_external_id oei
    JOIN object o ON o.id = oei.object_id
    WHERE oei.source_system = 'old_data_import_context'
      AND oei.external_id = 'oti-du-sud-run'
      AND oei.organization_object_id = oei.object_id
      AND o.object_type = 'ORG';

    RAISE NOTICE 'Old_data actors — batch %, org %', v_batch_id, v_org_id;

    INSERT INTO actor (display_name, first_name, last_name, gender, extra, created_at, updated_at)
    SELECT
        t.display_name,
        t.first_name,
        t.last_name,
        t.gender,
        COALESCE(t.extra, '{}'::jsonb)
          || jsonb_build_object('legacy_presta_id', t.staging_actor_key, 'import_batch_id', v_batch_id),
        NOW(),
        NOW()
    FROM staging.actor_temp t
    WHERE t.import_batch_id = v_batch_id
      AND t.is_approved IS TRUE
      AND t.staging_actor_key IS NOT NULL
      AND NOT EXISTS (
          SELECT 1
          FROM actor a
          WHERE a.extra->>'legacy_presta_id' = t.staging_actor_key
      );
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '  actors inserted: %', n;

    UPDATE actor_channel existing
    SET is_primary = FALSE,
        updated_at = NOW()
    FROM (
        SELECT DISTINCT a.id AS actor_id, ck.id AS kind_id, c.value
        FROM staging.actor_channel_temp c
        JOIN actor a ON a.extra->>'legacy_presta_id' = c.staging_actor_key
        JOIN ref_code_contact_kind ck ON ck.code = c.kind_code
        WHERE c.import_batch_id = v_batch_id
          AND c.is_approved IS TRUE
          AND c.is_primary IS TRUE
          AND c.value IS NOT NULL
    ) incoming
    WHERE existing.actor_id = incoming.actor_id
      AND existing.kind_id = incoming.kind_id
      AND existing.value <> incoming.value
      AND existing.is_primary IS TRUE;
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '  actor_channel primary demoted: %', n;

    INSERT INTO actor_channel (actor_id, kind_id, value, is_primary, created_at, updated_at)
    SELECT DISTINCT
        a.id,
        ck.id,
        c.value,
        COALESCE(c.is_primary, FALSE),
        NOW(),
        NOW()
    FROM staging.actor_channel_temp c
    JOIN actor a ON a.extra->>'legacy_presta_id' = c.staging_actor_key
    JOIN ref_code_contact_kind ck ON ck.code = c.kind_code
    WHERE c.import_batch_id = v_batch_id
      AND c.is_approved IS TRUE
      AND c.value IS NOT NULL
    ON CONFLICT (actor_id, kind_id, value) DO UPDATE
    SET is_primary = EXCLUDED.is_primary,
        updated_at = NOW();
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '  actor_channel upserted: %', n;

    INSERT INTO actor_object_role (
        actor_id,
        object_id,
        role_id,
        is_primary,
        visibility,
        note,
        created_at,
        updated_at
    )
    SELECT DISTINCT
        a.id,
        oei.object_id,
        rr.id,
        COALESCE(r.is_primary, FALSE),
        'partners',
        r.note,
        NOW(),
        NOW()
    FROM staging.actor_object_role_temp r
    JOIN actor a ON a.extra->>'legacy_presta_id' = r.staging_actor_key
    JOIN object_external_id oei
      ON oei.organization_object_id = v_org_id
     AND oei.source_system = 'berta_v2_csv_export'
     AND oei.external_id = r.staging_object_key
    JOIN ref_actor_role rr ON rr.code = r.role_code
    WHERE r.import_batch_id = v_batch_id
      AND r.is_approved IS TRUE
    ON CONFLICT (actor_id, object_id, role_id) DO UPDATE
    SET is_primary = EXCLUDED.is_primary,
        note = COALESCE(EXCLUDED.note, actor_object_role.note),
        updated_at = NOW();
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '  actor_object_role upserted: %', n;
END
$old_data_actors$;

-- Embedded block: old_data_03_promote_contacts_prices_opening.sql
-- =============================================================================
-- Old_data 03  Promote supplemental contacts, prices, and structured hours



-- =============================================================================

DO $old_data_contact_price_opening$
DECLARE
    v_batch_id TEXT := 'old-data-berta2-all-20260501-01';
    v_org_id   TEXT;
    n          INTEGER;
BEGIN
    SELECT oei.object_id INTO STRICT v_org_id
    FROM object_external_id oei
    JOIN object o ON o.id = oei.object_id
    WHERE oei.source_system = 'old_data_import_context'
      AND oei.external_id = 'oti-du-sud-run'
      AND oei.organization_object_id = oei.object_id
      AND o.object_type = 'ORG';

    RAISE NOTICE 'Old_data contacts/prices/opening — batch %, org %', v_batch_id, v_org_id;

    UPDATE contact_channel existing
    SET is_primary = FALSE,
        updated_at = NOW()
    FROM (
        SELECT DISTINCT oei.object_id, ck.id AS kind_id, c.value
        FROM staging.contact_channel_temp c
        JOIN object_external_id oei
          ON oei.organization_object_id = v_org_id
         AND oei.source_system = 'berta_v2_csv_export'
         AND oei.external_id = c.staging_object_key
        JOIN ref_code_contact_kind ck ON ck.code = c.kind_code
        WHERE c.import_batch_id = v_batch_id
          AND c.is_approved IS TRUE
          AND c.is_primary IS TRUE
          AND c.value IS NOT NULL
    ) incoming
    WHERE existing.object_id = incoming.object_id
      AND existing.kind_id = incoming.kind_id
      AND existing.value <> incoming.value
      AND existing.is_primary IS TRUE;
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '  contact_channel primary demoted: %', n;

    INSERT INTO contact_channel (object_id, kind_id, value, is_public, is_primary, position, created_at, updated_at)
    SELECT DISTINCT
        oei.object_id,
        ck.id,
        c.value,
        COALESCE(c.is_public, TRUE),
        COALESCE(c.is_primary, FALSE),
        COALESCE(c.position, 0),
        NOW(),
        NOW()
    FROM staging.contact_channel_temp c
    JOIN object_external_id oei
      ON oei.organization_object_id = v_org_id
     AND oei.source_system = 'berta_v2_csv_export'
     AND oei.external_id = c.staging_object_key
    JOIN ref_code_contact_kind ck ON ck.code = c.kind_code
    WHERE c.import_batch_id = v_batch_id
      AND c.is_approved IS TRUE
      AND c.value IS NOT NULL
    ON CONFLICT (object_id, kind_id, value) DO UPDATE
    SET is_public = EXCLUDED.is_public,
        is_primary = EXCLUDED.is_primary,
        position = EXCLUDED.position,
        updated_at = NOW();
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '  contact_channel upserted: %', n;

    INSERT INTO object_price (
        object_id,
        kind_id,
        unit_id,
        amount,
        currency,
        conditions,
        source,
        created_at,
        updated_at
    )
    SELECT
        oei.object_id,
        pk.id,
        pu.id,
        p.amount,
        COALESCE(p.currency, 'EUR'),
        p.conditions,
        COALESCE(p.source, 'import_berta2_tarifs'),
        NOW(),
        NOW()
    FROM staging.object_price_temp p
    JOIN object_external_id oei
      ON oei.organization_object_id = v_org_id
     AND oei.source_system = 'berta_v2_csv_export'
     AND oei.external_id = p.staging_object_key
    JOIN ref_code_price_kind pk ON pk.code = COALESCE(NULLIF(p.kind_code, ''), 'adulte')
    LEFT JOIN ref_code_price_unit pu ON pu.code = p.unit_code
    WHERE p.import_batch_id = v_batch_id
      AND p.is_approved IS TRUE
      AND p.amount IS NOT NULL
      AND NOT EXISTS (
          SELECT 1
          FROM object_price existing
          WHERE existing.object_id = oei.object_id
            AND existing.amount IS NOT DISTINCT FROM p.amount
            AND existing.conditions IS NOT DISTINCT FROM p.conditions
            AND COALESCE(existing.source, '') = COALESCE(p.source, 'import_berta2_tarifs')
      );
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '  object_price inserted: %', n;

    INSERT INTO opening_period (
        object_id,
        name,
        source_period_id,
        all_years,
        extra,
        created_at,
        updated_at
    )
    SELECT
        oei.object_id,
        COALESCE(op.period_name, 'Berta v2 opening'),
        op.source_period_id,
        COALESCE(op.all_years, TRUE),
        jsonb_build_object('import_batch_id', v_batch_id, 'raw_source_data', op.raw_source_data),
        NOW(),
        NOW()
    FROM staging.opening_period_temp op
    JOIN object_external_id oei
      ON oei.organization_object_id = v_org_id
     AND oei.source_system = 'berta_v2_csv_export'
     AND oei.external_id = op.staging_object_key
    WHERE op.import_batch_id = v_batch_id
      AND op.is_approved IS TRUE
      AND op.start_time IS NOT NULL
      AND op.end_time IS NOT NULL
      AND NOT EXISTS (
          SELECT 1
          FROM opening_period existing
          WHERE existing.object_id = oei.object_id
            AND existing.source_period_id = op.source_period_id
      );
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '  opening_period inserted: %', n;

    INSERT INTO opening_schedule (
        period_id,
        schedule_type_id,
        name,
        created_at,
        updated_at
    )
    SELECT
        p.id,
        st.id,
        p.name,
        NOW(),
        NOW()
    FROM opening_period p
    JOIN staging.opening_period_temp op
      ON op.import_batch_id = v_batch_id
     AND op.source_period_id = p.source_period_id
    JOIN object_external_id oei
      ON oei.organization_object_id = v_org_id
     AND oei.source_system = 'berta_v2_csv_export'
     AND oei.external_id = op.staging_object_key
     AND oei.object_id = p.object_id
    JOIN ref_code_opening_schedule_type st
      ON st.code = COALESCE(NULLIF(op.schedule_text, ''), 'regular')
    WHERE NOT EXISTS (
        SELECT 1 FROM opening_schedule existing WHERE existing.period_id = p.id
    );
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '  opening_schedule inserted: %', n;

    INSERT INTO opening_time_period (schedule_id, closed, created_at, updated_at)
    SELECT
        s.id,
        FALSE,
        NOW(),
        NOW()
    FROM opening_schedule s
    JOIN opening_period p ON p.id = s.period_id
    JOIN staging.opening_period_temp op
      ON op.import_batch_id = v_batch_id
     AND op.source_period_id = p.source_period_id
    JOIN object_external_id oei
      ON oei.organization_object_id = v_org_id
     AND oei.source_system = 'berta_v2_csv_export'
     AND oei.external_id = op.staging_object_key
     AND oei.object_id = p.object_id
    WHERE NOT EXISTS (
        SELECT 1 FROM opening_time_period existing WHERE existing.schedule_id = s.id
    );
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '  opening_time_period inserted: %', n;

    INSERT INTO opening_time_period_weekday (time_period_id, weekday_id, created_at, updated_at)
    SELECT DISTINCT
        tp.id,
        wd.id,
        NOW(),
        NOW()
    FROM opening_time_period tp
    JOIN opening_schedule s ON s.id = tp.schedule_id
    JOIN opening_period p ON p.id = s.period_id
    JOIN staging.opening_period_temp op
      ON op.import_batch_id = v_batch_id
     AND op.source_period_id = p.source_period_id
    JOIN object_external_id oei
      ON oei.organization_object_id = v_org_id
     AND oei.source_system = 'berta_v2_csv_export'
     AND oei.external_id = op.staging_object_key
     AND oei.object_id = p.object_id
    CROSS JOIN LATERAL regexp_split_to_table(op.weekdays, E'\\|') AS weekday_code
    JOIN ref_code_weekday wd ON wd.code = weekday_code
    ON CONFLICT (time_period_id, weekday_id) DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '  opening weekdays inserted: %', n;

    INSERT INTO opening_time_frame (time_period_id, start_time, end_time, created_at, updated_at)
    SELECT
        tp.id,
        op.start_time,
        op.end_time,
        NOW(),
        NOW()
    FROM opening_time_period tp
    JOIN opening_schedule s ON s.id = tp.schedule_id
    JOIN opening_period p ON p.id = s.period_id
    JOIN staging.opening_period_temp op
      ON op.import_batch_id = v_batch_id
     AND op.source_period_id = p.source_period_id
    JOIN object_external_id oei
      ON oei.organization_object_id = v_org_id
     AND oei.source_system = 'berta_v2_csv_export'
     AND oei.external_id = op.staging_object_key
     AND oei.object_id = p.object_id
    WHERE NOT EXISTS (
        SELECT 1
        FROM opening_time_frame existing
        WHERE existing.time_period_id = tp.id
          AND existing.start_time IS NOT DISTINCT FROM op.start_time
          AND existing.end_time IS NOT DISTINCT FROM op.end_time
    );
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '  opening_time_frame inserted: %', n;
END
$old_data_contact_price_opening$;

-- Embedded block: crm_lot1_01_prereq.sql
-- =============================================================================
-- CRM Lot 1  -  01 : Prerequis object_external_id
-- Copie les IDs Airtable (rec*) depuis object_origin vers object_external_id
-- avec scope OTI du Sud, pour que la reconciliation CRM puisse resoudre
-- staging_object_key -> object.id.
-- Idempotent : ON CONFLICT DO NOTHING.
-- Executer une seule fois avant tout batch CRM.
-- =============================================================================

DO $prereq_crm$
DECLARE
    v_org_id TEXT;
    n        INTEGER;
BEGIN
    -- Resoudre l'org OTI une seule fois  -  leve une exception si absent ou ambigu
    SELECT oei.object_id INTO STRICT v_org_id
    FROM object_external_id oei
    JOIN object o ON o.id = oei.object_id
    WHERE oei.source_system = 'old_data_import_context'
      AND oei.external_id = 'oti-du-sud-run'
      AND oei.organization_object_id = oei.object_id
      AND o.object_type = 'ORG';

    RAISE NOTICE 'Prerequis CRM  -  org OTI resolu : %', v_org_id;

    INSERT INTO object_external_id (
        object_id,
        organization_object_id,
        source_system,
        external_id,
        last_synced_at,
        created_at,
        updated_at
    )
    SELECT
        oo.object_id,
        v_org_id,
        'berta_v2_csv_export',
        oo.source_object_id,
        NOW(),
        NOW(),
        NOW()
    FROM object_origin oo
    WHERE oo.source_system    = 'berta_v2_csv_export'
      AND oo.source_object_id IS NOT NULL
    ON CONFLICT ON CONSTRAINT uq_object_external_id_by_source DO NOTHING;

    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '  % entrees inserees dans object_external_id (ON CONFLICT DO NOTHING)', n;

    -- Verification immediate : doit etre 0 apres l'insert
    SELECT COUNT(*) INTO n
    FROM object_origin oo
    WHERE oo.source_system    = 'berta_v2_csv_export'
      AND oo.source_object_id IS NOT NULL
      AND NOT EXISTS (
          SELECT 1 FROM object_external_id oei
          WHERE oei.external_id            = oo.source_object_id
            AND oei.source_system          = 'berta_v2_csv_export'
            AND oei.organization_object_id = v_org_id
      );

    IF n > 0 THEN
        RAISE EXCEPTION 'Prerequis CRM echoue : % entree(s) manquante(s) dans object_external_id', n;
    END IF;

    RAISE NOTICE '  Verification OK : 0 manquant dans object_external_id';
END
$prereq_crm$;

-- Embedded block: crm_lot1_02a_reconcile_parents.sql
-- =============================================================================
-- CRM Lot 1  -  02a : Reconciliation des interactions CRM parent
--
-- Sequence obligatoire :
--   02a (ce fichier) -> 03a_promote_parents -> 02b_reconcile_comments -> 03b_promote_comments
--
-- NE PAS executer 02b avant que 03a ait tourne :
-- le bloc commentaires resout les parents depuis crm_interaction,
-- qui doit donc etre peuple au prealable.
-- =============================================================================

DO $recon_crm$
DECLARE
    v_batch_id TEXT := 'old-data-berta2-all-20260501-01';
    v_org_id   TEXT;
    n          INTEGER;
BEGIN
    -- Resoudre OTI org une seule fois
    SELECT oei.object_id INTO STRICT v_org_id
    FROM object_external_id oei
    JOIN object o ON o.id = oei.object_id
    WHERE oei.source_system = 'old_data_import_context'
      AND oei.external_id = 'oti-du-sud-run'
      AND oei.organization_object_id = oei.object_id
      AND o.object_type = 'ORG';

    RAISE NOTICE 'CRM parent reconciliation  -  batch: %, org: %', v_batch_id, v_org_id;

    -- Etape 1 : stamper id legacy + initialiser extra depuis raw_source_data
    UPDATE staging.crm_interaction_temp
    SET id    = raw_source_data->>'ID',
        extra = COALESCE(extra, '{}'::jsonb) || jsonb_build_object(
                    'legacy_crm_id',       raw_source_data->>'ID',
                    'humeur_raw',          NULLIF(raw_source_data->>'Humeur', ''),
                    'humeur_apres_raw',    NULLIF(raw_source_data->>'Humeur_apres', ''),
                    'sous_categorie',      NULLIF(raw_source_data->>'Sous-categorie', ''),
                    'interlocuteur_email', NULLIF(raw_source_data->>'Interlocuteur', '')
                )
    WHERE import_batch_id   = v_batch_id
      AND resolution_status = 'pending';
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '  Etape 1 (init extra) : % lignes', n;

    -- Etape 2 : staging_object_key -> object.id via object_external_id (scope OTI)
    UPDATE staging.crm_interaction_temp t
    SET object_id = oei.object_id
    FROM object_external_id oei
    WHERE oei.organization_object_id = v_org_id
      AND oei.source_system           = 'berta_v2_csv_export'
      AND oei.external_id             = t.staging_object_key
      AND t.import_batch_id           = v_batch_id
      AND t.resolution_status         = 'pending';
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '  Etape 2 (object_id) : % lignes resolues', n;

    -- Etape 3 : staging_actor_key -> actor.id via actor.extra->>'legacy_presta_id'
    UPDATE staging.crm_interaction_temp t
    SET actor_id = a.id::text
    FROM actor a
    WHERE a.extra->>'legacy_presta_id' = t.staging_actor_key
      AND t.staging_actor_key IS NOT NULL
      AND t.import_batch_id            = v_batch_id
      AND t.resolution_status          = 'pending';
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '  Etape 3 (actor_id) : % lignes resolues', n;

    -- Etape 4 : interlocuteur_email -> owner via auth.users.email
    UPDATE staging.crm_interaction_temp t
    SET owner = u.id::text
    FROM auth.users u
    WHERE u.email               = t.extra->>'interlocuteur_email'
      AND t.extra->>'interlocuteur_email' IS NOT NULL
      AND t.import_batch_id     = v_batch_id
      AND t.resolution_status   = 'pending';
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '  Etape 4 (owner) : % lignes resolues', n;

    -- Etape 5 : demand_topic_code -> UUID OTI dans extra uniquement
    -- demand_topic_id reste NULL (domain mismatch FK  -  voir lot1_crm_import_plan.md)
    UPDATE staging.crm_interaction_temp t
    SET extra = t.extra || jsonb_build_object(
                    'oti_demand_topic_id',   rc.id::text,
                    'oti_demand_topic_code', rc.code
                )
    FROM ref_code rc
    WHERE rc.domain             = 'crm_demand_topic_oti'
      AND rc.name               = t.demand_topic_code
      AND t.import_batch_id     = v_batch_id
      AND t.resolution_status   = 'pending';
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '  Etape 5 (demand_topic) : % lignes resolues', n;

    -- Etape 6 : approuver  -  object resolu + occurred_at present
    UPDATE staging.crm_interaction_temp
    SET resolution_status = 'approved',
        is_approved       = TRUE
    WHERE import_batch_id   = v_batch_id
      AND resolution_status = 'pending'
      AND object_id  IS NOT NULL
      AND occurred_at IS NOT NULL;
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '  Etape 6 (approved) : % lignes', n;

    -- Etape 7a : rejeter  -  object resolu mais occurred_at absent/invalide
    UPDATE staging.crm_interaction_temp
    SET resolution_status = 'rejected',
        extra             = COALESCE(extra, '{}'::jsonb)
                         || jsonb_build_object('rejection_reason', 'missing_or_invalid_occurred_at')
    WHERE import_batch_id   = v_batch_id
      AND resolution_status = 'pending'
      AND object_id  IS NOT NULL
      AND occurred_at IS NULL;
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '  Etape 7a (rejected missing occurred_at) : % lignes', n;

    -- Etape 7b : rejeter  -  object non resolu
    UPDATE staging.crm_interaction_temp
    SET resolution_status = 'rejected',
        extra             = COALESCE(extra, '{}'::jsonb)
                         || jsonb_build_object('rejection_reason', 'no_object_resolved')
    WHERE import_batch_id   = v_batch_id
      AND resolution_status = 'pending';
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '  Etape 7b (rejected no object) : % lignes', n;

END
$recon_crm$;

-- Embedded block: crm_lot1_03a_promote_parents.sql
-- =============================================================================
-- CRM Lot 1  -  03a : Promotion des interactions CRM parent -> crm_interaction
--
-- Sequence obligatoire :
--   02a_reconcile_parents -> 03a (ce fichier) -> 02b_reconcile_comments -> 03b_promote_comments
--
-- WARNING  CE SCRIPT ECRIT DANS LA TABLE FINALE crm_interaction
-- =============================================================================

DO $promote_crm$
DECLARE
    v_batch_id TEXT := 'old-data-berta2-all-20260501-01';
    n          INTEGER;
BEGIN
    RAISE NOTICE 'Promotion CRM parent  -  batch: %', v_batch_id;

    INSERT INTO crm_interaction (
        object_id,
        actor_id,
        interaction_type,
        direction,
        status,
        body,
        occurred_at,
        resolved_at,
        is_actionable,
        owner,
        demand_topic_id,     -- NULL : domain mismatch FK (UUID dans extra.oti_demand_topic_id)
        request_mood_id,     -- NULL : pas de seeds crm_mood
        response_mood_id,    -- NULL : pas de seeds crm_mood
        source,
        extra,
        created_at,
        updated_at
    )
    SELECT
        t.object_id,                               -- TEXT, type target est TEXT
        t.actor_id::uuid,                          -- TEXT -> UUID (nullable)
        t.interaction_type::crm_interaction_type,
        'internal'::crm_direction,
        t.status::crm_status,
        t.body,
        t.occurred_at,
        t.resolved_at,
        COALESCE(t.is_actionable, TRUE),
        t.owner::uuid,                             -- TEXT -> UUID (nullable)
        NULL,
        NULL,
        NULL,
        'import_berta2_crm',
        COALESCE(t.extra, '{}'::jsonb) || jsonb_build_object('import_batch_id', v_batch_id),
        NOW(),
        NOW()
    FROM staging.crm_interaction_temp t
    WHERE t.import_batch_id   = v_batch_id
      AND t.resolution_status = 'approved'
      AND t.is_approved       = TRUE;

    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '  % interactions CRM parent promues', n;
END
$promote_crm$;

-- Embedded block: crm_lot1_02b_reconcile_comments.sql
-- =============================================================================
-- CRM Lot 1  -  02b : Reconciliation des commentaires
--
-- Sequence obligatoire :
--   02a_reconcile_parents -> 03a_promote_parents -> 02b (ce fichier) -> 03b_promote_comments
--
-- PREREQUIS STRICT : 03a_promote_parents doit avoir tourne sur ce batch.
-- Ce script resout parent_legacy_crm_id -> crm_interaction.id,
-- ce qui necessite que les parents soient deja dans crm_interaction.
-- =============================================================================

DO $recon_comments$
DECLARE
    v_batch_id TEXT := 'old-data-berta2-all-20260501-01';
    n          INTEGER;
BEGIN
    RAISE NOTICE 'Commentaires reconciliation  -  batch: %', v_batch_id;

    -- Etape 1 : stamper id legacy dans la colonne id
    UPDATE staging.crm_comment_temp
    SET id = raw_source_data->>'ID'
    WHERE import_batch_id   = v_batch_id
      AND resolution_status = 'pending'
      AND id IS NULL;
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '  Etape 1 (id legacy) : % lignes', n;

    -- Etape 2 : parent_legacy_crm_id -> crm_interaction.id promu
    --           heriter object_id et actor_id du parent
    UPDATE staging.crm_comment_temp t
    SET resolved_parent_interaction_id = ci.id::text,
        object_id                      = ci.object_id,
        actor_id                       = ci.actor_id::text
    FROM crm_interaction ci
    WHERE ci.extra->>'legacy_crm_id' = t.parent_legacy_crm_id
      AND ci.source                  = 'import_berta2_crm'
      AND t.import_batch_id          = v_batch_id
      AND t.resolution_status        = 'pending';
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '  Etape 2 (parent + heritage object/actor) : % lignes resolues', n;

    -- Etape 3 : user_email -> owner via auth.users.email
    UPDATE staging.crm_comment_temp t
    SET owner = u.id::text
    FROM auth.users u
    WHERE u.email               = t.user_email
      AND t.user_email IS NOT NULL
      AND t.import_batch_id     = v_batch_id
      AND t.resolution_status   = 'pending';
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '  Etape 3 (owner) : % lignes resolues', n;

    -- Etape 4 : approuver  -  parent resolu + object_id + occurred_at
    UPDATE staging.crm_comment_temp
    SET resolution_status = 'approved',
        is_approved       = TRUE
    WHERE import_batch_id                = v_batch_id
      AND resolution_status              = 'pending'
      AND resolved_parent_interaction_id IS NOT NULL
      AND object_id                      IS NOT NULL
      AND occurred_at                    IS NOT NULL;
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '  Etape 4 (approved) : % lignes', n;

    -- Etape 5a : rejeter  -  parent resolu mais occurred_at absent/invalide
    UPDATE staging.crm_comment_temp
    SET resolution_status = 'rejected',
        extra             = COALESCE(extra, '{}'::jsonb)
                         || jsonb_build_object('rejection_reason', 'missing_or_invalid_occurred_at')
    WHERE import_batch_id                = v_batch_id
      AND resolution_status              = 'pending'
      AND resolved_parent_interaction_id IS NOT NULL
      AND object_id                      IS NOT NULL
      AND occurred_at                    IS NULL;
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '  Etape 5a (rejected missing occurred_at) : % lignes', n;

    -- Etape 5b : rejeter orphelins  -  parent non resolu
    UPDATE staging.crm_comment_temp
    SET resolution_status = 'rejected',
        extra             = COALESCE(extra, '{}'::jsonb)
                         || jsonb_build_object('rejection_reason', 'parent_not_found')
    WHERE import_batch_id   = v_batch_id
      AND resolution_status = 'pending';
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '  Etape 5b (rejected orphelins) : % lignes', n;

END
$recon_comments$;

-- Embedded block: crm_lot1_03b_promote_comments.sql
-- =============================================================================
-- CRM Lot 1  -  03b : Promotion des commentaires -> crm_interaction (type='note')
--
-- Sequence obligatoire :
--   02a_reconcile_parents -> 03a_promote_parents -> 02b_reconcile_comments -> 03b (ce fichier)
--
-- WARNING  CE SCRIPT ECRIT DANS LA TABLE FINALE crm_interaction
-- =============================================================================

DO $promote_comments$
DECLARE
    v_batch_id TEXT := 'old-data-berta2-all-20260501-01';
    n          INTEGER;
BEGIN
    RAISE NOTICE 'Promotion commentaires  -  batch: %', v_batch_id;

    INSERT INTO crm_interaction (
        object_id,
        actor_id,
        interaction_type,
        direction,
        status,
        body,
        occurred_at,
        owner,
        demand_topic_id,
        request_mood_id,
        response_mood_id,
        source,
        extra,
        created_at,
        updated_at
    )
    SELECT
        t.object_id,
        t.actor_id::uuid,                          -- herite du parent, nullable
        'note'::crm_interaction_type,
        'internal'::crm_direction,
        'done'::crm_status,                        -- toujours done, sans exception
        t.body,
        t.occurred_at,
        t.owner::uuid,                             -- nullable
        NULL,
        NULL,
        NULL,
        'import_berta2_commentaire',
        jsonb_build_object(
            'legacy_comment_id',               t.id,
            'parent_legacy_crm_id',            t.parent_legacy_crm_id,
            'promoted_parent_interaction_id',  t.resolved_parent_interaction_id,
            'original_comment_status',         t.original_comment_status,
            'close_reqs',                      t.close_reqs,
            'humeur_raw',                      t.humeur_raw,
            'modere',                          t.modere,
            'import_batch_id',                 v_batch_id
        ),
        NOW(),
        NOW()
    FROM staging.crm_comment_temp t
    WHERE t.import_batch_id   = v_batch_id
      AND t.resolution_status = 'approved'
      AND t.is_approved       = TRUE;

    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '  % commentaires promus', n;
END
$promote_comments$;

-- Embedded block: crm_lot1_04_validate.sql
-- =============================================================================
-- CRM Lot 1  -  04 : Validation ciblee
-- Toutes les requetes doivent retourner 0 ou les resultats attendus indiques.
-- =============================================================================

-- 1. Aucune ligne promue avec un object_id invalide (batch courant)
-- Attendu : 0
SELECT COUNT(*) AS interactions_object_fk_invalide
FROM crm_interaction ci
WHERE ci.source = 'import_berta2_crm'
  AND ci.extra->>'import_batch_id' = 'old-data-berta2-all-20260501-01'
  AND NOT EXISTS (SELECT 1 FROM object o WHERE o.id = ci.object_id);

-- 2. Aucune ligne pending restante apres reconciliation
-- Attendu : aucune ligne avec resolution_status = 'pending'
SELECT resolution_status, COUNT(*) AS nb
FROM staging.crm_interaction_temp
WHERE import_batch_id = 'old-data-berta2-all-20260501-01'
GROUP BY 1
ORDER BY 1;

SELECT resolution_status, COUNT(*) AS nb
FROM staging.crm_comment_temp
WHERE import_batch_id = 'old-data-berta2-all-20260501-01'
GROUP BY 1
ORDER BY 1;

-- 3. Couverture demand_topic : lignes approuvees sans topic resolu
-- Attendu : 0 (tous les 20 codes OTI doivent matcher)
SELECT demand_topic_code, COUNT(*) AS nb
FROM staging.crm_interaction_temp
WHERE import_batch_id   = 'old-data-berta2-all-20260501-01'
  AND resolution_status = 'approved'
  AND (extra->>'oti_demand_topic_id') IS NULL
GROUP BY 1;

-- 4. Commentaires orphelins rejetes
-- Attendu : taux d'orphelins < 1% du total commentaires du batch
SELECT
    COUNT(*) FILTER (WHERE resolution_status = 'rejected'
                       AND extra->>'rejection_reason' = 'parent_not_found') AS orphelins,
    COUNT(*)                                                                  AS total,
    ROUND(
        100.0 * COUNT(*) FILTER (WHERE resolution_status = 'rejected'
                                   AND extra->>'rejection_reason' = 'parent_not_found')
        / NULLIF(COUNT(*), 0), 2
    ) AS pct_orphelins
FROM staging.crm_comment_temp
WHERE import_batch_id = 'old-data-berta2-all-20260501-01';

-- 5. Coherence parents : staging approved = promus avec batch marker
-- Attendu : staging_approved = promus_avec_batch_id
SELECT
    (SELECT COUNT(*)
     FROM staging.crm_interaction_temp
     WHERE import_batch_id   = 'old-data-berta2-all-20260501-01'
       AND resolution_status = 'approved'
       AND is_approved        = TRUE)                           AS staging_approved,
    (SELECT COUNT(*)
     FROM crm_interaction
     WHERE source                    = 'import_berta2_crm'
       AND extra->>'import_batch_id' = 'old-data-berta2-all-20260501-01')            AS promus_avec_batch_id;

-- 6. Coherence commentaires : staging approved = promus avec batch marker
-- Attendu : staging_approved = promus_avec_batch_id
SELECT
    (SELECT COUNT(*)
     FROM staging.crm_comment_temp
     WHERE import_batch_id   = 'old-data-berta2-all-20260501-01'
       AND resolution_status = 'approved'
       AND is_approved        = TRUE)                           AS staging_approved,
    (SELECT COUNT(*)
     FROM crm_interaction
     WHERE source                    = 'import_berta2_commentaire'
       AND extra->>'import_batch_id' = 'old-data-berta2-all-20260501-01')            AS promus_avec_batch_id;

-- 7. Chaque commentaire promu du batch porte le parent_interaction_id dans extra
-- Attendu : 0
SELECT COUNT(*) AS commentaires_sans_parent_dans_extra
FROM crm_interaction
WHERE source                    = 'import_berta2_commentaire'
  AND extra->>'import_batch_id' = 'old-data-berta2-all-20260501-01'
  AND (extra->>'promoted_parent_interaction_id') IS NULL;

-- 8. Prerequis object_external_id satisfait (a executer avant tout batch)
-- Attendu : 0
WITH oti_org AS (
    SELECT oei.object_id AS org_id
    FROM object_external_id oei
    JOIN object o ON o.id = oei.object_id
    WHERE oei.source_system = 'old_data_import_context'
      AND oei.external_id = 'oti-du-sud-run'
      AND oei.organization_object_id = oei.object_id
      AND o.object_type = 'ORG'
)
SELECT COUNT(*) AS manquants
FROM object_origin oo
CROSS JOIN oti_org
WHERE oo.source_system = 'berta_v2_csv_export'
  AND oo.source_object_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM object_external_id oei
      WHERE oei.external_id            = oo.source_object_id
        AND oei.source_system          = 'berta_v2_csv_export'
        AND oei.organization_object_id = oti_org.org_id
  );

-- Embedded block: media_lot1_01_reconcile.sql
-- =============================================================================
-- Media Lot 1  -  01 : Reconciliation galerie
-- Prerequis : crm_lot1_01_prereq.sql doit avoir ete execute
--             (object_external_id peuple pour source_system='berta_v2_csv_export')
-- =============================================================================

DO $recon_media$
DECLARE
    v_batch_id TEXT := 'old-data-berta2-all-20260501-01';
    v_org_id   TEXT;
    n          INTEGER;
BEGIN
    -- Resoudre l'org OTI une seule fois  -  leve une exception si absent ou ambigu
    SELECT oei.object_id INTO STRICT v_org_id
    FROM object_external_id oei
    JOIN object o ON o.id = oei.object_id
    WHERE oei.source_system = 'old_data_import_context'
      AND oei.external_id = 'oti-du-sud-run'
      AND oei.organization_object_id = oei.object_id
      AND o.object_type = 'ORG';

    RAISE NOTICE 'Media reconciliation  -  batch: %, org: %', v_batch_id, v_org_id;

    -- Etape 1 : initialiser extra depuis raw_source_data (img_id + formulaire legacy)
    UPDATE staging.media_galerie_lot1_temp
    SET extra = COALESCE(extra, '{}'::jsonb) || jsonb_build_object(
                    'legacy_img_id',    raw_source_data->>'Img_id',
                    'legacy_formulaire', raw_source_data->>'formulaire'
                )
    WHERE import_batch_id   = v_batch_id
      AND resolution_status = 'pending';
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '  Etape 1 (init extra) : % lignes', n;

    -- Etape 2 : rejeter les lignes sans URL valide des maintenant
    UPDATE staging.media_galerie_lot1_temp
    SET resolution_status = 'rejected',
        extra             = COALESCE(extra, '{}'::jsonb)
                         || jsonb_build_object('rejection_reason', 'missing_or_invalid_url')
    WHERE import_batch_id   = v_batch_id
      AND resolution_status = 'pending'
      AND (url_source IS NULL OR TRIM(url_source) = '' OR url_source !~* '^https?://');
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '  Etape 2 (rejected invalid url) : % lignes', n;

    -- Etape 3 : legacy_formulaire -> object.id via object_external_id (scope OTI)
    UPDATE staging.media_galerie_lot1_temp t
    SET object_id = oei.object_id
    FROM object_external_id oei
    WHERE oei.organization_object_id = v_org_id
      AND oei.source_system           = 'berta_v2_csv_export'
      AND oei.external_id             = t.legacy_formulaire
      AND t.import_batch_id           = v_batch_id
      AND t.resolution_status         = 'pending';
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '  Etape 3 (object_id) : % lignes resolues', n;

    -- Etape 4 : resolution is_main_resolved  -  Option A
    UPDATE staging.media_galerie_lot1_temp t
    SET is_main_resolved = TRUE
    FROM (
        SELECT DISTINCT ON (import_batch_id, legacy_formulaire)
               import_media_id
        FROM   staging.media_galerie_lot1_temp
        WHERE  import_batch_id   = v_batch_id
          AND  resolution_status = 'pending'
          AND  main_pic_source   = TRUE
          AND  object_id         IS NOT NULL
        ORDER  BY import_batch_id, legacy_formulaire, legacy_img_id ASC
    ) winners
    WHERE t.import_media_id = winners.import_media_id;
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '  Etape 4 (is_main_resolved=TRUE) : % lignes', n;

    -- Etape 5 : approuver
    UPDATE staging.media_galerie_lot1_temp
    SET resolution_status = 'approved',
        is_approved       = TRUE
    WHERE import_batch_id   = v_batch_id
      AND resolution_status = 'pending'
      AND object_id  IS NOT NULL
      AND url_source IS NOT NULL;
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '  Etape 5 (approved) : % lignes', n;

    -- Etape 6 : rejeter  -  object non resolu
    UPDATE staging.media_galerie_lot1_temp
    SET resolution_status = 'rejected',
        extra             = COALESCE(extra, '{}'::jsonb)
                         || jsonb_build_object('rejection_reason', 'no_object_resolved')
    WHERE import_batch_id   = v_batch_id
      AND resolution_status = 'pending';
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '  Etape 6 (rejected no object) : % lignes', n;

END
$recon_media$;

-- Embedded block: media_lot1_02_promote.sql
-- =============================================================================
-- Media Lot 1  -  02 : Promotion galerie -> media
-- Prerequis : media_lot1_01_reconcile.sql doit avoir ete execute sur ce batch.
-- =============================================================================

DO $promote_media$
DECLARE
    v_batch_id       TEXT := 'old-data-berta2-all-20260501-01';
    v_org_id         TEXT;
    v_photo_type_id  UUID;
    n                INTEGER;
BEGIN
    -- Resoudre l'org OTI une seule fois
    SELECT oei.object_id INTO STRICT v_org_id
    FROM object_external_id oei
    JOIN object o ON o.id = oei.object_id
    WHERE oei.source_system = 'old_data_import_context'
      AND oei.external_id = 'oti-du-sud-run'
      AND oei.organization_object_id = oei.object_id
      AND o.object_type = 'ORG';

    -- Resoudre le type media 'photo' une seule fois.
    -- ref_code_media_type est la partition de ref_code pour domain='media_type';
    -- la seed canonique vit dans seeds_data.sql (INSERT INTO ref_code ...).
    SELECT id INTO v_photo_type_id
    FROM ref_code_media_type
    WHERE code = 'photo';
    IF NOT FOUND THEN
        RAISE EXCEPTION USING
            ERRCODE = 'foreign_key_violation',
            MESSAGE = 'Old_data prerequisite failed: ref_code_media_type row "photo" is missing.',
            DETAIL  = 'The promotion of media rows requires a ref_code row with '
                   || 'domain=''media_type'' and code=''photo''. None was found.',
            HINT    = 'Apply the media_type INSERT block from seeds_data.sql '
                   || '(INSERT INTO ref_code (domain, code, name, description) '
                   || 'VALUES (''media_type'',''photo'',...)), then re-run 20_promotion.sql.';
    END IF;

    RAISE NOTICE 'Promotion media  -  batch: %, org: %, photo_type: %',
        v_batch_id, v_org_id, v_photo_type_id;

    INSERT INTO media (
        object_id,
        media_type_id,
        url,
        description,
        is_main,
        is_published,
        org_object_id,
        extra,
        created_at,
        updated_at
    )
    SELECT
        t.object_id,
        v_photo_type_id,
        t.url_source,
        NULLIF(TRIM(t.description_source), ''),  -- description vide -> NULL
        t.is_main_resolved,                       -- Option A deja appliquee en reconciliation
        TRUE,                                     -- is_published par defaut
        v_org_id,
        jsonb_build_object(
            'legacy_img_id',    t.legacy_img_id,
            'legacy_formulaire', t.legacy_formulaire,
            'import_batch_id',  v_batch_id
        ),
        NOW(),
        NOW()
    FROM staging.media_galerie_lot1_temp t
    WHERE t.import_batch_id   = v_batch_id
      AND t.resolution_status = 'approved'
      AND t.is_approved        = TRUE;

    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '  % medias promus', n;
END
$promote_media$;

-- Embedded block: media_lot1_03_validate.sql
-- =============================================================================
-- Media Lot 1  -  03 : Validation ciblee galerie
-- Toutes les requetes doivent retourner 0 ou les resultats attendus indiques.
-- =============================================================================

-- 1. Aucune ligne promue avec un object_id invalide (batch courant)
-- Attendu : 0
SELECT COUNT(*) AS media_object_fk_invalide
FROM media m
WHERE m.extra->>'import_batch_id' = 'old-data-berta2-all-20260501-01'
  AND NOT EXISTS (SELECT 1 FROM object o WHERE o.id = m.object_id);

-- 2. Aucune ligne pending restante apres reconciliation
-- Attendu : aucune ligne avec resolution_status = 'pending'
SELECT resolution_status, COUNT(*) AS nb
FROM staging.media_galerie_lot1_temp
WHERE import_batch_id = 'old-data-berta2-all-20260501-01'
GROUP BY 1
ORDER BY 1;

-- 3. Distribution des motifs de rejet
-- Informationnel  -  verifie que les raisons sont uniquement 'no_object_resolved' ou 'missing_or_invalid_url'
SELECT extra->>'rejection_reason' AS rejection_reason, COUNT(*) AS nb
FROM staging.media_galerie_lot1_temp
WHERE import_batch_id   = 'old-data-berta2-all-20260501-01'
  AND resolution_status = 'rejected'
GROUP BY 1
ORDER BY 2 DESC;

-- 4. Coherence comptage : staging approved = promus avec import_batch_id
-- Attendu : staging_approved = promus_avec_batch_id
SELECT
    (SELECT COUNT(*)
     FROM staging.media_galerie_lot1_temp
     WHERE import_batch_id   = 'old-data-berta2-all-20260501-01'
       AND resolution_status = 'approved'
       AND is_approved        = TRUE)                      AS staging_approved,
    (SELECT COUNT(*)
     FROM media
     WHERE extra->>'import_batch_id' = 'old-data-berta2-all-20260501-01')        AS promus_avec_batch_id;

-- 5. Aucun etablissement avec plus d'un is_main=TRUE pour le type photo (batch courant)
-- Attendu : 0
SELECT COUNT(*) AS violations_is_main
FROM (
    SELECT object_id, COUNT(*) AS nb_main
    FROM media m
    JOIN ref_code_media_type rmt ON rmt.id = m.media_type_id
    WHERE m.extra->>'import_batch_id' = 'old-data-berta2-all-20260501-01'
      AND rmt.code                    = 'photo'
      AND m.is_main                   = TRUE
    GROUP BY object_id
    HAVING COUNT(*) > 1
) violations;

-- 6. Informationnel : repartition is_main dans le batch promu
SELECT is_main, COUNT(*) AS nb
FROM media
WHERE extra->>'import_batch_id' = 'old-data-berta2-all-20260501-01'
GROUP BY 1
ORDER BY 1;

-- Embedded block: old_data_assert_import.sql
-- =============================================================================
-- Old_data import assertions - aborts the promotion transaction on failed checks.
-- =============================================================================

DO $old_data_import_assertions$
DECLARE
    v_batch_id TEXT := 'old-data-berta2-all-20260501-01';
    n          INTEGER;
    a          INTEGER;
    b          INTEGER;
BEGIN
    SELECT COUNT(*) INTO n
    FROM staging.object_temp
    WHERE import_batch_id = v_batch_id
      AND resolution_status = 'pending';
    IF n <> 0 THEN
        RAISE EXCEPTION 'Old_data assertion failed: % object_temp row(s) still pending', n;
    END IF;

    SELECT COUNT(*) INTO n
    FROM staging.object_temp t
    WHERE t.import_batch_id = v_batch_id
      AND t.is_approved IS TRUE
      AND t.external_id IS NOT NULL
      AND NOT EXISTS (
          SELECT 1
          FROM object_external_id oei
          WHERE oei.source_system = 'berta_v2_csv_export'
            AND oei.external_id   = t.external_id
      );
    IF n <> 0 THEN
        RAISE EXCEPTION 'Old_data assertion failed: % approved object(s) missing object_external_id', n;
    END IF;

    SELECT COUNT(*) INTO n
    FROM staging.object_temp t
    JOIN object o ON o.id = t.resolved_object_id
    WHERE t.import_batch_id = v_batch_id
      AND t.is_approved IS TRUE
      AND (
          o.status IS DISTINCT FROM COALESCE(
              NULLIF(t.status, ''),
              CASE lower(COALESCE(t.raw_source_data->>'En ligne', ''))
                  WHEN 'oui' THEN 'published'
                  ELSE 'draft'
              END
          )::object_status
          OR o.commercial_visibility IS DISTINCT FROM COALESCE(NULLIF(t.commercial_visibility, ''), 'active')
      );
    IF n <> 0 THEN
        RAISE EXCEPTION 'Old_data assertion failed: % object(s) have incorrect publication/commercial status', n;
    END IF;

    SELECT COUNT(*) INTO n
    FROM staging.object_temp t
    JOIN object o ON o.id = t.resolved_object_id
    WHERE t.import_batch_id = v_batch_id
      AND t.raw_source_data->>'En ligne' = 'non'
      AND (o.status = 'archived'::object_status OR o.commercial_visibility = 'lapsed');
    IF n <> 0 THEN
        RAISE EXCEPTION 'Old_data assertion failed: % offline object(s) were archived or marked lapsed', n;
    END IF;

    SELECT COUNT(*) INTO n
    FROM staging.object_temp t
    JOIN object o ON o.id = t.resolved_object_id
    WHERE t.import_batch_id = v_batch_id
      AND t.raw_source_data->>'En ligne' = 'oui'
      AND o.status IS DISTINCT FROM 'published'::object_status;
    IF n <> 0 THEN
        RAISE EXCEPTION 'Old_data assertion failed: % online object(s) were not published', n;
    END IF;

    SELECT COUNT(*) INTO n
    FROM staging.object_temp t
    JOIN object o ON o.id = t.resolved_object_id
    WHERE t.import_batch_id = v_batch_id
      AND t.raw_source_data->>'En ligne' = 'non'
      AND o.status IS DISTINCT FROM 'draft'::object_status;
    IF n <> 0 THEN
        RAISE EXCEPTION 'Old_data assertion failed: % offline object(s) were not kept as draft', n;
    END IF;

    SELECT COUNT(*) INTO n
    FROM crm_interaction ci
    WHERE ci.source = 'import_berta2_crm'
      AND ci.extra->>'import_batch_id' = v_batch_id
      AND NOT EXISTS (SELECT 1 FROM object o WHERE o.id = ci.object_id);
    IF n <> 0 THEN
        RAISE EXCEPTION 'Old_data assertion failed: % CRM parent row(s) have invalid object_id', n;
    END IF;

    SELECT COUNT(*) INTO n
    FROM media m
    WHERE m.extra->>'import_batch_id' = v_batch_id
      AND NOT EXISTS (SELECT 1 FROM object o WHERE o.id = m.object_id);
    IF n <> 0 THEN
        RAISE EXCEPTION 'Old_data assertion failed: % media row(s) have invalid object_id', n;
    END IF;

    SELECT COUNT(*) INTO n
    FROM staging.crm_interaction_temp
    WHERE import_batch_id = v_batch_id
      AND resolution_status = 'pending';
    IF n <> 0 THEN
        RAISE EXCEPTION 'Old_data assertion failed: % CRM parent staging row(s) still pending', n;
    END IF;

    SELECT COUNT(*) INTO n
    FROM staging.crm_comment_temp
    WHERE import_batch_id = v_batch_id
      AND resolution_status = 'pending';
    IF n <> 0 THEN
        RAISE EXCEPTION 'Old_data assertion failed: % CRM comment staging row(s) still pending', n;
    END IF;

    SELECT COUNT(*) INTO n
    FROM staging.media_galerie_lot1_temp
    WHERE import_batch_id = v_batch_id
      AND resolution_status = 'pending';
    IF n <> 0 THEN
        RAISE EXCEPTION 'Old_data assertion failed: % media staging row(s) still pending', n;
    END IF;

    SELECT COUNT(*) INTO a
    FROM staging.crm_interaction_temp
    WHERE import_batch_id = v_batch_id
      AND resolution_status = 'approved'
      AND is_approved = TRUE;
    SELECT COUNT(*) INTO b
    FROM crm_interaction
    WHERE source = 'import_berta2_crm'
      AND extra->>'import_batch_id' = v_batch_id;
    IF a <> b THEN
        RAISE EXCEPTION 'Old_data assertion failed: CRM parent approved/promoted mismatch (% vs %)', a, b;
    END IF;

    SELECT COUNT(*) INTO a
    FROM staging.crm_comment_temp
    WHERE import_batch_id = v_batch_id
      AND resolution_status = 'approved'
      AND is_approved = TRUE;
    SELECT COUNT(*) INTO b
    FROM crm_interaction
    WHERE source = 'import_berta2_commentaire'
      AND extra->>'import_batch_id' = v_batch_id;
    IF a <> b THEN
        RAISE EXCEPTION 'Old_data assertion failed: CRM comment approved/promoted mismatch (% vs %)', a, b;
    END IF;

    SELECT COUNT(*) INTO a
    FROM staging.media_galerie_lot1_temp
    WHERE import_batch_id = v_batch_id
      AND resolution_status = 'approved'
      AND is_approved = TRUE;
    SELECT COUNT(*) INTO b
    FROM media
    WHERE extra->>'import_batch_id' = v_batch_id;
    IF a <> b THEN
        RAISE EXCEPTION 'Old_data assertion failed: media approved/promoted mismatch (% vs %)', a, b;
    END IF;

    SELECT COUNT(*) INTO n
    FROM (
        SELECT m.object_id, COUNT(*) AS nb_main
        FROM media m
        JOIN ref_code_media_type rmt ON rmt.id = m.media_type_id
        WHERE m.extra->>'import_batch_id' = v_batch_id
          AND rmt.code = 'photo'
          AND m.is_main = TRUE
        GROUP BY m.object_id
        HAVING COUNT(*) > 1
    ) violations;
    IF n <> 0 THEN
        RAISE EXCEPTION 'Old_data assertion failed: % object(s) have more than one main photo in imported batch', n;
    END IF;

    RAISE NOTICE 'Old_data import assertions passed for batch %', v_batch_id;
END
$old_data_import_assertions$;

COMMIT;

-- Embedded block: old_data_04_validate.sql
-- =============================================================================
-- Old_data 04  Read-only validation summary



-- =============================================================================

SELECT 'batch' AS check_name, batch_id, status, metadata
FROM staging.import_batches
WHERE batch_id = 'old-data-berta2-all-20260501-01';

SELECT 'staging_object_temp' AS check_name, resolution_status, COUNT(*) AS rows
FROM staging.object_temp
WHERE import_batch_id = 'old-data-berta2-all-20260501-01'
GROUP BY resolution_status
ORDER BY resolution_status;

SELECT 'object_external_id_resolved' AS check_name, COUNT(*) AS rows
FROM staging.object_temp t
JOIN object_external_id oei
  ON oei.source_system = 'berta_v2_csv_export'
 AND oei.external_id = t.external_id
WHERE t.import_batch_id = 'old-data-berta2-all-20260501-01';

SELECT 'crm_parent_staging' AS check_name, resolution_status, COUNT(*) AS rows
FROM staging.crm_interaction_temp
WHERE import_batch_id = 'old-data-berta2-all-20260501-01'
GROUP BY resolution_status
ORDER BY resolution_status;

SELECT 'crm_comment_staging' AS check_name, resolution_status, COUNT(*) AS rows
FROM staging.crm_comment_temp
WHERE import_batch_id = 'old-data-berta2-all-20260501-01'
GROUP BY resolution_status
ORDER BY resolution_status;

SELECT 'media_staging' AS check_name, resolution_status, COUNT(*) AS rows
FROM staging.media_galerie_lot1_temp
WHERE import_batch_id = 'old-data-berta2-all-20260501-01'
GROUP BY resolution_status
ORDER BY resolution_status;

SELECT 'prices_promoted' AS check_name, COUNT(*) AS rows
FROM object_price
WHERE source = 'import_berta2_tarifs';

SELECT 'dd_review_required' AS check_name, action_id, COUNT(*) AS rows
FROM staging.object_sustainability_action_temp
WHERE import_batch_id = 'old-data-berta2-all-20260501-01'
GROUP BY action_id
ORDER BY rows DESC, action_id;

SELECT
    'suspected_actor_duplicates' AS check_name,
    lower(btrim(a.last_name)) AS last_name_key,
    lower(btrim(a.first_name)) AS first_name_key,
    lower(btrim(ac.value)) AS primary_email,
    COUNT(*) AS actor_count,
    array_agg(a.id ORDER BY a.id) AS actor_ids,
    array_agg(a.extra->>'legacy_presta_id' ORDER BY a.id) AS legacy_presta_ids
FROM actor a
JOIN actor_channel ac
  ON ac.actor_id = a.id
 AND ac.is_primary IS TRUE
JOIN ref_code_contact_kind ck
  ON ck.id = ac.kind_id
 AND lower(ck.code) = 'email'
WHERE a.extra->>'import_batch_id' = 'old-data-berta2-all-20260501-01'
  AND a.extra ? 'legacy_presta_id'
GROUP BY 2, 3, 4
HAVING COUNT(*) > 1
ORDER BY actor_count DESC, last_name_key, first_name_key, primary_email;
