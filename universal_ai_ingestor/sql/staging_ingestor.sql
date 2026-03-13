-- Universal AI Data Ingestor - Phase 1/2 staging objects
-- Execute with service/admin role.

CREATE SCHEMA IF NOT EXISTS staging;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS staging.import_batches (
    batch_id TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'received'
        CHECK (status IN (
            'received',
            'discovering',
            'discovery_ready',
            'mapping_review_required',
            'mapping_approved',
            'profiling',
            'mapping',
            'transforming',
            'staging_loaded',
            'deduplicated',
            'committed',
            'failed',
            'failed_permanent'
        )),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    mapping_rules JSONB,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE staging.import_batches
    ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
    ADD COLUMN IF NOT EXISTS payload_sha256 TEXT,
    ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS committed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS retention_until TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS is_immutable BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS error_class TEXT;

ALTER TABLE staging.import_batches
    DROP CONSTRAINT IF EXISTS import_batches_status_check;
ALTER TABLE staging.import_batches
    ADD CONSTRAINT import_batches_status_check
    CHECK (status IN (
        'received',
        'discovering',
        'discovery_ready',
        'mapping_review_required',
        'mapping_approved',
        'profiling',
        'mapping',
        'transforming',
        'staging_loaded',
        'deduplicated',
        'committed',
        'failed',
        'failed_permanent'
    ));
CREATE UNIQUE INDEX IF NOT EXISTS uq_import_batches_idempotency_key
    ON staging.import_batches(idempotency_key)
    WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_import_batches_status
    ON staging.import_batches(status);
CREATE INDEX IF NOT EXISTS idx_import_batches_updated_at
    ON staging.import_batches(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_import_batches_retention_until
    ON staging.import_batches(retention_until);

CREATE TABLE IF NOT EXISTS staging.mapping_contract (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    contract_version INTEGER NOT NULL DEFAULT 1,
    source_format TEXT,
    overall_confidence NUMERIC(5,4) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'review_required', 'approved', 'rejected')),
    approved_at TIMESTAMPTZ,
    approved_by TEXT,
    is_immutable BOOLEAN NOT NULL DEFAULT FALSE,
    assumptions JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (import_batch_id, contract_version)
);

CREATE TABLE IF NOT EXISTS staging.mapping_contract_sheet (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contract_id UUID NOT NULL REFERENCES staging.mapping_contract(id) ON DELETE CASCADE,
    sheet_name TEXT NOT NULL,
    inferred_entity_type TEXT,
    confidence NUMERIC(5,4) NOT NULL DEFAULT 0,
    profile JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (contract_id, sheet_name)
);

CREATE TABLE IF NOT EXISTS staging.mapping_contract_field (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contract_id UUID NOT NULL REFERENCES staging.mapping_contract(id) ON DELETE CASCADE,
    sheet_name TEXT NOT NULL,
    source_column TEXT NOT NULL,
    target_table TEXT,
    target_column TEXT,
    transform TEXT NOT NULL DEFAULT 'identity',
    confidence NUMERIC(5,4) NOT NULL DEFAULT 0,
    rationale TEXT,
    status TEXT NOT NULL DEFAULT 'proposed'
        CHECK (status IN ('proposed', 'approved', 'rejected')),
    reviewed_at TIMESTAMPTZ,
    reviewed_by TEXT,
    review_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (contract_id, sheet_name, source_column, target_table, target_column)
);

CREATE TABLE IF NOT EXISTS staging.mapping_relation_hypothesis (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contract_id UUID NOT NULL REFERENCES staging.mapping_contract(id) ON DELETE CASCADE,
    from_sheet TEXT NOT NULL,
    from_column TEXT NOT NULL,
    to_sheet TEXT NOT NULL DEFAULT '',
    to_column TEXT NOT NULL DEFAULT '',
    relation_type TEXT NOT NULL DEFAULT 'foreign_key_candidate',
    separator TEXT NOT NULL DEFAULT ',',
    is_join_table BOOLEAN NOT NULL DEFAULT FALSE,
    target_staging_table TEXT NOT NULL DEFAULT '',
    target_entity_type TEXT NOT NULL DEFAULT '',
    confidence NUMERIC(5,4) NOT NULL DEFAULT 0,
    rationale TEXT,
    status TEXT NOT NULL DEFAULT 'proposed'
        CHECK (status IN ('proposed', 'approved', 'rejected')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS staging.mapping_review_decision (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contract_id UUID NOT NULL REFERENCES staging.mapping_contract(id) ON DELETE CASCADE,
    decision_scope TEXT NOT NULL CHECK (decision_scope IN ('field', 'relation', 'contract')),
    target_id UUID,
    decision TEXT NOT NULL CHECK (decision IN ('approve', 'reject')),
    reason TEXT,
    decided_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mapping_contract_batch_status
    ON staging.mapping_contract(import_batch_id, status, contract_version DESC);
CREATE INDEX IF NOT EXISTS idx_mapping_field_review_queue
    ON staging.mapping_contract_field(contract_id, status, confidence);
CREATE INDEX IF NOT EXISTS idx_mapping_relation_review_queue
    ON staging.mapping_relation_hypothesis(contract_id, status, confidence);

CREATE TABLE IF NOT EXISTS staging.import_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    phase TEXT NOT NULL,
    level TEXT NOT NULL DEFAULT 'info',
    message TEXT,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_import_events_batch_created
    ON staging.import_events(import_batch_id, created_at DESC);

CREATE TABLE IF NOT EXISTS staging.object_temp (
    import_row_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Business fields mirrored from public.object only.
    object_type TEXT,
    name TEXT,
    external_id TEXT,
    source_org_object_id TEXT,

    -- Dedup workflow metadata
    deduplication_status VARCHAR(32) NOT NULL DEFAULT 'pending'
        CHECK (deduplication_status IN ('pending', 'new', 'exact_update', 'ai_conflict', 'resolved')),
    matched_public_object_id TEXT,
    ai_merge_proposal JSONB,
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_object_temp_batch
    ON staging.object_temp(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_object_temp_dedup_status
    ON staging.object_temp(deduplication_status);
CREATE INDEX IF NOT EXISTS idx_object_temp_is_approved
    ON staging.object_temp(is_approved);
CREATE INDEX IF NOT EXISTS idx_object_temp_external_id
    ON staging.object_temp(external_id);

CREATE OR REPLACE FUNCTION staging.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION api.rollback_staging_batch_compensate(
    p_batch_id TEXT,
    p_force BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, api, staging, auth
AS $$
DECLARE v_ledger_id UUID;
DECLARE v_rollback_status TEXT;
DECLARE v_import_status TEXT;
DECLARE v_deleted_media INTEGER := 0;
DECLARE v_deleted_object INTEGER := 0;
BEGIN
    SELECT id, rollback_status
      INTO v_ledger_id, v_rollback_status
    FROM staging.batch_commit_ledger
    WHERE batch_id = p_batch_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'No commit ledger found for batch %', p_batch_id;
    END IF;
    IF v_rollback_status = 'rolled_back' THEN
        RETURN jsonb_build_object('batch_id', p_batch_id, 'already_rolled_back', TRUE);
    END IF;

    SELECT status INTO v_import_status
    FROM staging.import_batches
    WHERE batch_id = p_batch_id
    FOR UPDATE;
    IF v_import_status IS DISTINCT FROM 'committed' AND NOT p_force THEN
        RAISE EXCEPTION 'Rollback only allowed for committed batches (force=true to bypass)';
    END IF;

    DELETE FROM media m
    WHERE m.id::TEXT IN (
        SELECT entity_id
        FROM staging.batch_commit_ledger_item
        WHERE ledger_id = v_ledger_id
          AND entity_type = 'media'
    );
    GET DIAGNOSTICS v_deleted_media = ROW_COUNT;

    DELETE FROM object o
    WHERE o.id IN (
        SELECT entity_id
        FROM staging.batch_commit_ledger_item
        WHERE ledger_id = v_ledger_id
          AND entity_type = 'object'
    )
      AND o.extra->>'import_batch_id' = p_batch_id;
    GET DIAGNOSTICS v_deleted_object = ROW_COUNT;

    UPDATE staging.import_batches
    SET status = 'staging_loaded',
        is_immutable = FALSE
    WHERE batch_id = p_batch_id;

    UPDATE staging.batch_commit_ledger
    SET rollback_status = 'rolled_back',
        rollback_at = NOW(),
        rollback_error = NULL
    WHERE id = v_ledger_id;

    PERFORM staging.log_import_event(
        p_batch_id,
        'rollback',
        'warning',
        'Compensating rollback executed',
        jsonb_build_object(
            'deleted_media', v_deleted_media,
            'deleted_object', v_deleted_object
        )
    );

    RETURN jsonb_build_object(
        'batch_id', p_batch_id,
        'rolled_back', TRUE,
        'deleted_media', v_deleted_media,
        'deleted_object', v_deleted_object
    );
EXCEPTION WHEN OTHERS THEN
    UPDATE staging.batch_commit_ledger
    SET rollback_status = 'rollback_failed',
        rollback_error = SQLERRM,
        rollback_at = NOW()
    WHERE batch_id = p_batch_id;
    RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION api.retry_failed_media_downloads(
    p_limit INTEGER DEFAULT 200
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, api, staging, auth
AS $$
DECLARE v_rows INTEGER := 0;
BEGIN
    UPDATE staging.media_temp
    SET processing_status = 'pending_download',
        error_message = NULL
    WHERE import_media_id IN (
        SELECT import_media_id
        FROM staging.media_temp
        WHERE processing_status = 'download_failed'
        ORDER BY updated_at ASC
        LIMIT p_limit
    );
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RETURN jsonb_build_object('reset_to_pending_download', v_rows, 'limit', p_limit);
END;
$$;

CREATE OR REPLACE FUNCTION api.watchdog_mark_stale_batches(
    p_stale_minutes INTEGER DEFAULT 30,
    p_limit INTEGER DEFAULT 200
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, api, staging, auth
AS $$
DECLARE v_rows INTEGER := 0;
BEGIN
    UPDATE staging.import_batches
    SET status = 'failed_permanent',
        error_message = COALESCE(error_message, 'watchdog_stale_timeout'),
        error_class = COALESCE(error_class, 'watchdog')
    WHERE batch_id IN (
        SELECT batch_id
        FROM staging.import_batches
        WHERE status IN ('received', 'profiling', 'mapping', 'transforming')
          AND updated_at < NOW() - make_interval(mins => p_stale_minutes)
        ORDER BY updated_at ASC
        LIMIT p_limit
    );
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RETURN jsonb_build_object('stale_marked_failed_permanent', v_rows, 'stale_minutes', p_stale_minutes);
END;
$$;

DROP TRIGGER IF EXISTS trg_import_batches_updated_at ON staging.import_batches;
CREATE TRIGGER trg_import_batches_updated_at
BEFORE UPDATE ON staging.import_batches
FOR EACH ROW EXECUTE FUNCTION staging.touch_updated_at();

DROP TRIGGER IF EXISTS trg_object_temp_updated_at ON staging.object_temp;
CREATE TRIGGER trg_object_temp_updated_at
BEFORE UPDATE ON staging.object_temp
FOR EACH ROW EXECUTE FUNCTION staging.touch_updated_at();

DROP TRIGGER IF EXISTS trg_import_events_updated_at ON staging.import_events;
CREATE TRIGGER trg_import_events_updated_at
BEFORE UPDATE ON staging.import_events
FOR EACH ROW EXECUTE FUNCTION staging.touch_updated_at();

CREATE OR REPLACE FUNCTION staging.log_import_event(
    p_batch_id TEXT,
    p_phase TEXT,
    p_level TEXT,
    p_message TEXT,
    p_payload JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID
LANGUAGE sql
AS $$
    INSERT INTO staging.import_events(import_batch_id, phase, level, message, payload)
    VALUES (p_batch_id, p_phase, p_level, p_message, COALESCE(p_payload, '{}'::jsonb));
$$;

CREATE OR REPLACE FUNCTION staging.normalize_phone(p_value TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE
        WHEN p_value IS NULL THEN NULL
        ELSE regexp_replace(lower(p_value), '[^0-9+]', '', 'g')
    END;
$$;

CREATE OR REPLACE FUNCTION staging.safe_object_type(p_text TEXT)
RETURNS object_type
LANGUAGE plpgsql
AS $$
DECLARE out_type object_type;
BEGIN
    IF p_text IS NULL OR btrim(p_text) = '' THEN
        RETURN 'ORG'::object_type;
    END IF;
    BEGIN
        out_type := upper(btrim(p_text))::object_type;
    EXCEPTION WHEN others THEN
        out_type := 'ORG'::object_type;
    END;
    RETURN out_type;
END;
$$;

CREATE OR REPLACE FUNCTION staging.run_dedup_for_batch(
    p_batch_id TEXT,
    p_distance_meters INTEGER DEFAULT 50,
    p_name_similarity REAL DEFAULT 0.45
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE v_exact_count INTEGER := 0;
DECLARE v_conflict_count INTEGER := 0;
DECLARE v_new_count INTEGER := 0;
BEGIN
    UPDATE staging.object_temp
    SET deduplication_status = 'pending',
        matched_public_object_id = NULL,
        ai_merge_proposal = NULL
    WHERE import_batch_id = p_batch_id
      AND deduplication_status IN ('pending', 'new', 'exact_update', 'ai_conflict');

    WITH staging_contact_values AS (
        SELECT
            o.import_row_id,
            MAX(CASE WHEN lower(c.kind_code) = 'email' THEN lower(c.value) END) AS email_value,
            MAX(CASE WHEN lower(c.kind_code) IN ('phone', 'telephone', 'mobile') THEN staging.normalize_phone(c.value) END) AS phone_value
        FROM staging.object_temp o
        LEFT JOIN staging.contact_channel_temp c
          ON c.import_batch_id = o.import_batch_id
         AND c.staging_object_key = o.staging_object_key
        WHERE o.import_batch_id = p_batch_id
        GROUP BY o.import_row_id
    ), exact_candidates AS (
        SELECT
            s.import_row_id,
            COALESCE(
                (
                    SELECT oei.object_id
                    FROM object_external_id oei
                    WHERE s.external_id IS NOT NULL
                      AND s.source_org_object_id IS NOT NULL
                      AND oei.organization_object_id = s.source_org_object_id
                      AND oei.external_id = s.external_id
                    LIMIT 1
                ),
                (
                    SELECT cc.object_id
                    FROM contact_channel cc
                    JOIN ref_code_contact_kind k ON k.id = cc.kind_id
                    WHERE sc.email_value IS NOT NULL
                      AND lower(k.code) = 'email'
                      AND lower(cc.value) = sc.email_value
                    LIMIT 1
                ),
                (
                    SELECT cc2.object_id
                    FROM contact_channel cc2
                    JOIN ref_code_contact_kind k2 ON k2.id = cc2.kind_id
                    WHERE sc.phone_value IS NOT NULL
                      AND lower(k2.code) IN ('phone', 'telephone', 'mobile')
                      AND staging.normalize_phone(cc2.value) = sc.phone_value
                    LIMIT 1
                )
            ) AS matched_id
        FROM staging.object_temp s
        LEFT JOIN staging_contact_values sc ON sc.import_row_id = s.import_row_id
        WHERE s.import_batch_id = p_batch_id
    )
    UPDATE staging.object_temp s
    SET deduplication_status = 'exact_update',
        matched_public_object_id = e.matched_id
    FROM exact_candidates e
    WHERE s.import_row_id = e.import_row_id
      AND e.matched_id IS NOT NULL;

    GET DIAGNOSTICS v_exact_count = ROW_COUNT;

    WITH staging_main_location AS (
        SELECT DISTINCT ON (o.import_row_id)
            o.import_row_id,
            l.latitude,
            l.longitude
        FROM staging.object_temp o
        JOIN staging.object_location_temp l
          ON l.import_batch_id = o.import_batch_id
         AND l.staging_object_key = o.staging_object_key
        WHERE o.import_batch_id = p_batch_id
          AND l.latitude IS NOT NULL
          AND l.longitude IS NOT NULL
        ORDER BY o.import_row_id, l.is_main_location DESC, l.updated_at DESC, l.created_at DESC
    ), fuzzy_candidates AS (
        SELECT
            s.import_row_id,
            o.id AS candidate_id,
            similarity(o.name_normalized, immutable_unaccent(lower(COALESCE(s.name, '')))) AS name_sim,
            ST_Distance(
                ol.geog2,
                ST_SetSRID(ST_MakePoint(loc.longitude, loc.latitude), 4326)::geography
            ) AS distance_m,
            ROW_NUMBER() OVER (
                PARTITION BY s.import_row_id
                ORDER BY
                    similarity(o.name_normalized, immutable_unaccent(lower(COALESCE(s.name, '')))) DESC,
                    ST_Distance(ol.geog2, ST_SetSRID(ST_MakePoint(loc.longitude, loc.latitude), 4326)::geography) ASC
            ) AS rn
        FROM staging.object_temp s
        JOIN staging_main_location loc ON loc.import_row_id = s.import_row_id
        JOIN object o ON TRUE
        JOIN object_location ol
          ON ol.object_id = o.id
         AND ol.is_main_location IS TRUE
        WHERE s.import_batch_id = p_batch_id
          AND s.deduplication_status = 'pending'
          AND s.name IS NOT NULL
          AND ol.geog2 IS NOT NULL
          AND ST_DWithin(
              ol.geog2,
              ST_SetSRID(ST_MakePoint(loc.longitude, loc.latitude), 4326)::geography,
              p_distance_meters
          )
          AND similarity(o.name_normalized, immutable_unaccent(lower(COALESCE(s.name, '')))) >= p_name_similarity
    )
    UPDATE staging.object_temp s
    SET deduplication_status = 'ai_conflict',
        matched_public_object_id = f.candidate_id,
        ai_merge_proposal = jsonb_build_object(
            'reason', 'fuzzy_name_plus_distance',
            'candidate_id', f.candidate_id,
            'name_similarity', round(f.name_sim::numeric, 4),
            'distance_meters', round(f.distance_m::numeric, 2),
            'proposed_action', 'review_merge'
        )
    FROM fuzzy_candidates f
    WHERE s.import_row_id = f.import_row_id
      AND f.rn = 1;

    GET DIAGNOSTICS v_conflict_count = ROW_COUNT;

    UPDATE staging.object_temp
    SET deduplication_status = 'new'
    WHERE import_batch_id = p_batch_id
      AND deduplication_status = 'pending';
    GET DIAGNOSTICS v_new_count = ROW_COUNT;

    UPDATE staging.import_batches
    SET status = 'deduplicated'
    WHERE batch_id = p_batch_id;

    RETURN jsonb_build_object(
        'batch_id', p_batch_id,
        'exact_update', v_exact_count,
        'ai_conflict', v_conflict_count,
        'new', v_new_count
    );
END;
$$;

CREATE SCHEMA IF NOT EXISTS api;

CREATE OR REPLACE FUNCTION staging.assert_batch_integrity(
    p_batch_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE v_missing_dependency INTEGER := 0;
DECLARE v_orphan_location INTEGER := 0;
DECLARE v_orphan_contact INTEGER := 0;
BEGIN
    SELECT COUNT(*) INTO v_missing_dependency
    FROM staging.object_temp
    WHERE import_batch_id = p_batch_id
      AND resolution_status = 'blocked_missing_dependency';

    SELECT COUNT(*) INTO v_orphan_location
    FROM staging.object_location_temp l
    WHERE l.import_batch_id = p_batch_id
      AND NOT EXISTS (
          SELECT 1
          FROM staging.object_temp o
          WHERE o.import_batch_id = p_batch_id
            AND o.staging_object_key = l.staging_object_key
      );

    SELECT COUNT(*) INTO v_orphan_contact
    FROM staging.contact_channel_temp c
    WHERE c.import_batch_id = p_batch_id
      AND NOT EXISTS (
          SELECT 1
          FROM staging.object_temp o
          WHERE o.import_batch_id = p_batch_id
            AND o.staging_object_key = c.staging_object_key
      );

    RETURN jsonb_build_object(
        'batch_id', p_batch_id,
        'ok', (v_missing_dependency = 0 AND v_orphan_location = 0 AND v_orphan_contact = 0),
        'missing_dependency', v_missing_dependency,
        'orphan_location', v_orphan_location,
        'orphan_contact', v_orphan_contact
    );
END;
$$;

CREATE OR REPLACE FUNCTION api.run_staging_dedup(
    p_batch_id TEXT,
    p_distance_meters INTEGER DEFAULT 50,
    p_name_similarity REAL DEFAULT 0.45
)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, api, staging, auth
AS $$
    SELECT staging.run_dedup_for_batch(p_batch_id, p_distance_meters, p_name_similarity);
$$;

-- =====================================================
-- Deterministic dependency-first import extensions
-- =====================================================

ALTER TABLE staging.object_temp
    ADD COLUMN IF NOT EXISTS staging_object_key TEXT,
    ADD COLUMN IF NOT EXISTS staging_org_key TEXT,
    ADD COLUMN IF NOT EXISTS source_sheet TEXT,
    ADD COLUMN IF NOT EXISTS org_name TEXT,
    ADD COLUMN IF NOT EXISTS resolved_object_id TEXT,
    ADD COLUMN IF NOT EXISTS resolved_org_object_id TEXT,
    ADD COLUMN IF NOT EXISTS resolution_status TEXT NOT NULL DEFAULT 'pending';

CREATE INDEX IF NOT EXISTS idx_object_temp_batch_object_key
    ON staging.object_temp(import_batch_id, staging_object_key);
CREATE INDEX IF NOT EXISTS idx_object_temp_batch_org_key
    ON staging.object_temp(import_batch_id, staging_org_key);
CREATE INDEX IF NOT EXISTS idx_object_temp_resolution_status
    ON staging.object_temp(resolution_status);
CREATE INDEX IF NOT EXISTS idx_object_temp_source_sheet
    ON staging.object_temp(source_sheet);

CREATE TABLE IF NOT EXISTS staging.import_creation_policy (
    entity_type TEXT NOT NULL,
    domain_key TEXT,
    action TEXT NOT NULL CHECK (action IN ('allow_auto', 'require_review', 'deny_auto')),
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (entity_type, domain_key)
);

CREATE TABLE IF NOT EXISTS staging.ref_code_temp (
    import_ref_code_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    domain TEXT NOT NULL,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    policy_action TEXT,
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    public_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (import_batch_id, domain, code)
);

CREATE TABLE IF NOT EXISTS staging.ref_classification_scheme_temp (
    import_scheme_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    scheme_code TEXT NOT NULL,
    scheme_name TEXT NOT NULL,
    description TEXT,
    selection TEXT DEFAULT 'single',
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    policy_action TEXT,
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    public_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (import_batch_id, scheme_code)
);

CREATE TABLE IF NOT EXISTS staging.ref_classification_value_temp (
    import_value_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    scheme_code TEXT NOT NULL,
    value_code TEXT NOT NULL,
    value_name TEXT NOT NULL,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    policy_action TEXT,
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    public_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (import_batch_id, scheme_code, value_code)
);

CREATE TABLE IF NOT EXISTS staging.org_temp (
    import_org_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_org_key TEXT NOT NULL,
    name TEXT NOT NULL,
    source_org_object_id TEXT,
    external_id TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    policy_action TEXT,
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    matched_public_object_id TEXT,
    public_object_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (import_batch_id, staging_org_key)
);

CREATE TABLE IF NOT EXISTS staging.object_location_temp (
    import_location_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT NOT NULL,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    address1 TEXT,
    city TEXT,
    postcode TEXT,
    is_main_location BOOLEAN NOT NULL DEFAULT TRUE,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_object_location_temp_batch_object_key
    ON staging.object_location_temp(import_batch_id, staging_object_key);

CREATE TABLE IF NOT EXISTS staging.contact_channel_temp (
    import_contact_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT NOT NULL,
    kind_code TEXT NOT NULL,
    value TEXT NOT NULL,
    is_public BOOLEAN NOT NULL DEFAULT TRUE,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (import_batch_id, staging_object_key, kind_code, value)
);

CREATE TABLE IF NOT EXISTS staging.object_org_link_temp (
    import_link_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT NOT NULL,
    staging_org_key TEXT NOT NULL,
    role_code TEXT NOT NULL,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    note TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (import_batch_id, staging_object_key, staging_org_key, role_code)
);

CREATE TABLE IF NOT EXISTS staging.object_classification_temp (
    import_classification_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT NOT NULL,
    scheme_code TEXT NOT NULL,
    value_code TEXT NOT NULL,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (import_batch_id, staging_object_key, scheme_code, value_code)
);

CREATE TABLE IF NOT EXISTS staging.object_amenity_temp (
    import_amenity_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT NOT NULL,
    amenity_code TEXT NOT NULL,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (import_batch_id, staging_object_key, amenity_code)
);

CREATE TABLE IF NOT EXISTS staging.object_payment_method_temp (
    import_payment_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT NOT NULL,
    payment_code TEXT NOT NULL,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (import_batch_id, staging_object_key, payment_code)
);

ALTER TABLE staging.org_temp
    ADD COLUMN IF NOT EXISTS source_sheet TEXT;
ALTER TABLE staging.object_location_temp
    ADD COLUMN IF NOT EXISTS source_sheet TEXT;
ALTER TABLE staging.contact_channel_temp
    ADD COLUMN IF NOT EXISTS source_sheet TEXT;
ALTER TABLE staging.object_org_link_temp
    ADD COLUMN IF NOT EXISTS source_sheet TEXT,
    ADD COLUMN IF NOT EXISTS source_column TEXT,
    ADD COLUMN IF NOT EXISTS raw_relation_token TEXT;
ALTER TABLE staging.ref_classification_scheme_temp
    ADD COLUMN IF NOT EXISTS source_sheet TEXT;
ALTER TABLE staging.ref_classification_value_temp
    ADD COLUMN IF NOT EXISTS source_sheet TEXT;
ALTER TABLE staging.object_classification_temp
    ADD COLUMN IF NOT EXISTS source_sheet TEXT;
ALTER TABLE staging.object_amenity_temp
    ADD COLUMN IF NOT EXISTS source_sheet TEXT,
    ADD COLUMN IF NOT EXISTS source_column TEXT,
    ADD COLUMN IF NOT EXISTS raw_relation_token TEXT;
ALTER TABLE staging.object_payment_method_temp
    ADD COLUMN IF NOT EXISTS source_sheet TEXT,
    ADD COLUMN IF NOT EXISTS source_column TEXT,
    ADD COLUMN IF NOT EXISTS raw_relation_token TEXT;

CREATE INDEX IF NOT EXISTS idx_org_link_temp_batch_sheet
    ON staging.object_org_link_temp(import_batch_id, source_sheet);
CREATE INDEX IF NOT EXISTS idx_org_link_temp_raw_token
    ON staging.object_org_link_temp(import_batch_id, raw_relation_token);
CREATE INDEX IF NOT EXISTS idx_object_amenity_temp_batch_sheet
    ON staging.object_amenity_temp(import_batch_id, source_sheet);
CREATE INDEX IF NOT EXISTS idx_object_payment_temp_batch_sheet
    ON staging.object_payment_method_temp(import_batch_id, source_sheet);

CREATE TABLE IF NOT EXISTS staging.media_temp (
    import_media_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT NOT NULL,
    resolved_object_id TEXT,
    source_sheet TEXT,
    source_column TEXT,
    source_url TEXT NOT NULL,
    url_token TEXT,
    source_external_object_token TEXT,
    bucket_path TEXT,
    media_sha256 TEXT,
    mime_type TEXT,
    position INTEGER DEFAULT 0,
    processing_status TEXT NOT NULL DEFAULT 'pending_download'
        CHECK (processing_status IN ('pending_download', 'download_failed', 'review_required', 'ready_for_commit', 'blocked_low_confidence', 'committed')),
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    ai_confidence NUMERIC(5,4),
    ai_decision TEXT,
    ai_model TEXT,
    ai_prompt_version TEXT,
    ai_schema_version TEXT,
    ai_features JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    reviewed_at TIMESTAMPTZ,
    reviewed_by TEXT,
    review_reason TEXT,
    error_message TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (import_batch_id, staging_object_key, source_url)
);

CREATE INDEX IF NOT EXISTS idx_media_temp_batch_status
    ON staging.media_temp(import_batch_id, processing_status);
CREATE INDEX IF NOT EXISTS idx_media_temp_review_queue
    ON staging.media_temp(processing_status, ai_confidence);
CREATE INDEX IF NOT EXISTS idx_media_temp_batch_object
    ON staging.media_temp(import_batch_id, staging_object_key);

CREATE TABLE IF NOT EXISTS staging.batch_commit_ledger (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    batch_id TEXT NOT NULL UNIQUE REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    committed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    rollback_status TEXT NOT NULL DEFAULT 'not_rolled_back'
        CHECK (rollback_status IN ('not_rolled_back', 'rolled_back', 'rollback_failed')),
    rollback_at TIMESTAMPTZ,
    rollback_error TEXT,
    summary JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS staging.batch_commit_ledger_item (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ledger_id UUID NOT NULL REFERENCES staging.batch_commit_ledger(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (ledger_id, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_batch_commit_ledger_item_ledger
    ON staging.batch_commit_ledger_item(ledger_id, entity_type);

DROP TRIGGER IF EXISTS trg_ref_code_temp_updated_at ON staging.ref_code_temp;
CREATE TRIGGER trg_ref_code_temp_updated_at
BEFORE UPDATE ON staging.ref_code_temp
FOR EACH ROW EXECUTE FUNCTION staging.touch_updated_at();

DROP TRIGGER IF EXISTS trg_ref_scheme_temp_updated_at ON staging.ref_classification_scheme_temp;
CREATE TRIGGER trg_ref_scheme_temp_updated_at
BEFORE UPDATE ON staging.ref_classification_scheme_temp
FOR EACH ROW EXECUTE FUNCTION staging.touch_updated_at();

DROP TRIGGER IF EXISTS trg_ref_value_temp_updated_at ON staging.ref_classification_value_temp;
CREATE TRIGGER trg_ref_value_temp_updated_at
BEFORE UPDATE ON staging.ref_classification_value_temp
FOR EACH ROW EXECUTE FUNCTION staging.touch_updated_at();

DROP TRIGGER IF EXISTS trg_org_temp_updated_at ON staging.org_temp;
CREATE TRIGGER trg_org_temp_updated_at
BEFORE UPDATE ON staging.org_temp
FOR EACH ROW EXECUTE FUNCTION staging.touch_updated_at();

DROP TRIGGER IF EXISTS trg_object_location_temp_updated_at ON staging.object_location_temp;
CREATE TRIGGER trg_object_location_temp_updated_at
BEFORE UPDATE ON staging.object_location_temp
FOR EACH ROW EXECUTE FUNCTION staging.touch_updated_at();

DROP TRIGGER IF EXISTS trg_contact_channel_temp_updated_at ON staging.contact_channel_temp;
CREATE TRIGGER trg_contact_channel_temp_updated_at
BEFORE UPDATE ON staging.contact_channel_temp
FOR EACH ROW EXECUTE FUNCTION staging.touch_updated_at();

DROP TRIGGER IF EXISTS trg_object_org_link_temp_updated_at ON staging.object_org_link_temp;
CREATE TRIGGER trg_object_org_link_temp_updated_at
BEFORE UPDATE ON staging.object_org_link_temp
FOR EACH ROW EXECUTE FUNCTION staging.touch_updated_at();

DROP TRIGGER IF EXISTS trg_object_classification_temp_updated_at ON staging.object_classification_temp;
CREATE TRIGGER trg_object_classification_temp_updated_at
BEFORE UPDATE ON staging.object_classification_temp
FOR EACH ROW EXECUTE FUNCTION staging.touch_updated_at();

DROP TRIGGER IF EXISTS trg_object_amenity_temp_updated_at ON staging.object_amenity_temp;
CREATE TRIGGER trg_object_amenity_temp_updated_at
BEFORE UPDATE ON staging.object_amenity_temp
FOR EACH ROW EXECUTE FUNCTION staging.touch_updated_at();

DROP TRIGGER IF EXISTS trg_object_payment_temp_updated_at ON staging.object_payment_method_temp;
CREATE TRIGGER trg_object_payment_temp_updated_at
BEFORE UPDATE ON staging.object_payment_method_temp
FOR EACH ROW EXECUTE FUNCTION staging.touch_updated_at();

DROP TRIGGER IF EXISTS trg_media_temp_updated_at ON staging.media_temp;
CREATE TRIGGER trg_media_temp_updated_at
BEFORE UPDATE ON staging.media_temp
FOR EACH ROW EXECUTE FUNCTION staging.touch_updated_at();

DROP TRIGGER IF EXISTS trg_batch_commit_ledger_updated_at ON staging.batch_commit_ledger;
CREATE TRIGGER trg_batch_commit_ledger_updated_at
BEFORE UPDATE ON staging.batch_commit_ledger
FOR EACH ROW EXECUTE FUNCTION staging.touch_updated_at();

DROP TRIGGER IF EXISTS trg_mapping_contract_updated_at ON staging.mapping_contract;
CREATE TRIGGER trg_mapping_contract_updated_at
BEFORE UPDATE ON staging.mapping_contract
FOR EACH ROW EXECUTE FUNCTION staging.touch_updated_at();

DROP TRIGGER IF EXISTS trg_mapping_contract_sheet_updated_at ON staging.mapping_contract_sheet;
CREATE TRIGGER trg_mapping_contract_sheet_updated_at
BEFORE UPDATE ON staging.mapping_contract_sheet
FOR EACH ROW EXECUTE FUNCTION staging.touch_updated_at();

DROP TRIGGER IF EXISTS trg_mapping_contract_field_updated_at ON staging.mapping_contract_field;
CREATE TRIGGER trg_mapping_contract_field_updated_at
BEFORE UPDATE ON staging.mapping_contract_field
FOR EACH ROW EXECUTE FUNCTION staging.touch_updated_at();

DROP TRIGGER IF EXISTS trg_mapping_relation_hypothesis_updated_at ON staging.mapping_relation_hypothesis;
CREATE TRIGGER trg_mapping_relation_hypothesis_updated_at
BEFORE UPDATE ON staging.mapping_relation_hypothesis
FOR EACH ROW EXECUTE FUNCTION staging.touch_updated_at();

INSERT INTO staging.import_creation_policy(entity_type, domain_key, action, reason)
VALUES
    ('ref_code', '', 'allow_auto', 'Default allow for known ref_code domains'),
    ('ref_tag', '', 'allow_auto', 'Default allow for tags'),
    ('org', '', 'allow_auto', 'Allow org auto-create when clearly identified'),
    ('object_external_id', '', 'allow_auto', 'Allow external id sync'),
    ('classification_scheme', '', 'require_review', 'Structural taxonomy requires review'),
    ('classification_value', '', 'require_review', 'Taxonomy values require review'),
    ('business_object', '', 'require_review', 'Low confidence object create must be reviewed'),
    ('relation', '', 'require_review', 'Ambiguous relations require review')
ON CONFLICT (entity_type, domain_key) DO NOTHING;

CREATE OR REPLACE FUNCTION staging.get_policy_action(
    p_entity_type TEXT,
    p_domain_key TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
    SELECT COALESCE(
        (
            SELECT p.action
            FROM staging.import_creation_policy p
            WHERE p.entity_type = p_entity_type
              AND p.domain_key = COALESCE(p_domain_key, '')
            LIMIT 1
        ),
        (
            SELECT p.action
            FROM staging.import_creation_policy p
            WHERE p.entity_type = p_entity_type
              AND p.domain_key = ''
            LIMIT 1
        ),
        'require_review'
    );
$$;

CREATE OR REPLACE FUNCTION staging.resolve_batch_dependencies(
    p_batch_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE v_resolved INTEGER := 0;
DECLARE v_blocked INTEGER := 0;
DECLARE v_review INTEGER := 0;
BEGIN
    -- Prepare deterministic object/org technical keys.
    UPDATE staging.object_temp
    SET staging_object_key = COALESCE(
            NULLIF(staging_object_key, ''),
            'obj::' || md5(import_row_id::TEXT)
        ),
        staging_org_key = COALESCE(
            NULLIF(staging_org_key, ''),
            CASE
                WHEN source_org_object_id IS NOT NULL THEN 'org::source::' || source_org_object_id
                WHEN org_name IS NOT NULL THEN 'org::name::' || md5(lower(org_name))
                ELSE NULL
            END
        )
    WHERE import_batch_id = p_batch_id;

    -- Seed organizations from object rows if missing.
    INSERT INTO staging.org_temp (
        import_batch_id,
        staging_org_key,
        name,
        source_org_object_id,
        raw_source_data,
        policy_action,
        resolution_status,
        is_approved
    )
    SELECT DISTINCT
        o.import_batch_id,
        o.staging_org_key,
        COALESCE(NULLIF(o.org_name, ''), 'Imported organization'),
        o.source_org_object_id,
        o.raw_source_data,
        staging.get_policy_action('org', NULL),
        'pending',
        TRUE
    FROM staging.object_temp o
    WHERE o.import_batch_id = p_batch_id
      AND o.staging_org_key IS NOT NULL
    ON CONFLICT (import_batch_id, staging_org_key) DO NOTHING;

    -- Contact kind dependencies from contact staging.
    INSERT INTO staging.ref_code_temp (
        import_batch_id, domain, code, name, raw_source_data, policy_action, resolution_status, is_approved
    )
    SELECT DISTINCT
        c.import_batch_id,
        'contact_kind',
        lower(c.kind_code),
        initcap(lower(c.kind_code)),
        c.raw_source_data,
        staging.get_policy_action('ref_code', 'contact_kind'),
        'pending',
        TRUE
    FROM staging.contact_channel_temp c
    WHERE c.import_batch_id = p_batch_id
      AND c.kind_code IS NOT NULL
    ON CONFLICT (import_batch_id, domain, code) DO NOTHING;

    -- Org role dependencies.
    INSERT INTO staging.ref_code_temp (
        import_batch_id, domain, code, name, raw_source_data, policy_action, resolution_status, is_approved
    )
    SELECT DISTINCT
        l.import_batch_id,
        'org_role',
        lower(l.role_code),
        initcap(replace(lower(l.role_code), '_', ' ')),
        l.raw_source_data,
        staging.get_policy_action('ref_code', 'org_role'),
        'pending',
        TRUE
    FROM staging.object_org_link_temp l
    WHERE l.import_batch_id = p_batch_id
      AND l.role_code IS NOT NULL
    ON CONFLICT (import_batch_id, domain, code) DO NOTHING;

    -- Classification dependency placeholders.
    UPDATE staging.ref_classification_scheme_temp s
    SET policy_action = staging.get_policy_action('classification_scheme', NULL)
    WHERE s.import_batch_id = p_batch_id
      AND s.policy_action IS NULL;

    UPDATE staging.ref_classification_value_temp v
    SET policy_action = staging.get_policy_action('classification_value', NULL)
    WHERE v.import_batch_id = p_batch_id
      AND v.policy_action IS NULL;

    -- Resolve ref_code rows by public existence + policy.
    UPDATE staging.ref_code_temp r
    SET public_id = rc.id,
        resolution_status = 'resolved_existing'
    FROM ref_code rc
    WHERE r.import_batch_id = p_batch_id
      AND rc.domain = r.domain
      AND rc.code = r.code;

    UPDATE staging.ref_code_temp r
    SET policy_action = COALESCE(r.policy_action, staging.get_policy_action('ref_code', r.domain))
    WHERE r.import_batch_id = p_batch_id
      AND r.public_id IS NULL;

    UPDATE staging.ref_code_temp r
    SET resolution_status = CASE
            WHEN r.policy_action = 'allow_auto' THEN 'create_ready'
            WHEN r.policy_action = 'require_review' THEN 'review_required'
            ELSE 'blocked_policy'
        END
    WHERE r.import_batch_id = p_batch_id
      AND r.public_id IS NULL;

    -- Resolve organizations by direct id when available.
    UPDATE staging.org_temp o
    SET public_object_id = obj.id,
        matched_public_object_id = obj.id,
        resolution_status = 'resolved_existing'
    FROM object obj
    WHERE o.import_batch_id = p_batch_id
      AND o.source_org_object_id IS NOT NULL
      AND obj.id = o.source_org_object_id;

    -- Natural-key org resolution by normalized name when source id absent.
    UPDATE staging.org_temp o
    SET public_object_id = obj.id,
        matched_public_object_id = obj.id,
        resolution_status = 'resolved_existing'
    FROM object obj
    WHERE o.import_batch_id = p_batch_id
      AND o.public_object_id IS NULL
      AND o.source_org_object_id IS NULL
      AND obj.object_type = 'ORG'
      AND immutable_unaccent(lower(obj.name)) = immutable_unaccent(lower(o.name));

    UPDATE staging.org_temp o
    SET policy_action = COALESCE(o.policy_action, staging.get_policy_action('org', NULL))
    WHERE o.import_batch_id = p_batch_id
      AND o.public_object_id IS NULL;

    UPDATE staging.org_temp o
    SET resolution_status = CASE
            WHEN o.policy_action = 'allow_auto' THEN 'create_ready'
            WHEN o.policy_action = 'require_review' THEN 'review_required'
            ELSE 'blocked_policy'
        END
    WHERE o.import_batch_id = p_batch_id
      AND o.public_object_id IS NULL;

    -- Resolve object rows depending on orgs.
    UPDATE staging.object_temp o
    SET resolved_org_object_id = org.public_object_id,
        resolution_status = CASE
            WHEN org.public_object_id IS NOT NULL OR o.staging_org_key IS NULL THEN 'dependency_resolved'
            WHEN org.resolution_status = 'create_ready' THEN 'awaiting_org_create'
            WHEN org.resolution_status = 'review_required' THEN 'blocked_missing_dependency'
            ELSE 'blocked_missing_dependency'
        END
    FROM staging.org_temp org
    WHERE o.import_batch_id = p_batch_id
      AND org.import_batch_id = p_batch_id
      AND o.staging_org_key = org.staging_org_key;

    UPDATE staging.object_temp
    SET resolution_status = 'dependency_resolved'
    WHERE import_batch_id = p_batch_id
      AND staging_org_key IS NULL
      AND resolution_status = 'pending';

    SELECT COUNT(*) INTO v_resolved
    FROM staging.object_temp
    WHERE import_batch_id = p_batch_id
      AND resolution_status IN ('dependency_resolved', 'awaiting_org_create');

    SELECT COUNT(*) INTO v_review
    FROM staging.ref_code_temp
    WHERE import_batch_id = p_batch_id
      AND resolution_status = 'review_required';
    v_review := v_review + (
        SELECT COUNT(*)
        FROM staging.org_temp
        WHERE import_batch_id = p_batch_id
          AND resolution_status = 'review_required'
    );

    SELECT COUNT(*) INTO v_blocked
    FROM staging.ref_code_temp
    WHERE import_batch_id = p_batch_id
      AND resolution_status = 'blocked_policy';
    v_blocked := v_blocked + (
        SELECT COUNT(*)
        FROM staging.org_temp
        WHERE import_batch_id = p_batch_id
          AND resolution_status = 'blocked_policy'
    );
    v_blocked := v_blocked + (
        SELECT COUNT(*)
        FROM staging.object_temp
        WHERE import_batch_id = p_batch_id
          AND resolution_status = 'blocked_missing_dependency'
    );

    RETURN jsonb_build_object(
        'batch_id', p_batch_id,
        'resolved', v_resolved,
        'requires_review', v_review,
        'blocked', v_blocked
    );
END;
$$;

CREATE OR REPLACE FUNCTION api.resolve_staging_dependencies(
    p_batch_id TEXT
)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, api, staging, auth
AS $$
    SELECT staging.resolve_batch_dependencies(p_batch_id);
$$;

CREATE OR REPLACE FUNCTION api.assert_staging_batch_integrity(
    p_batch_id TEXT
)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, api, staging, auth
AS $$
    SELECT staging.assert_batch_integrity(p_batch_id);
$$;

CREATE OR REPLACE FUNCTION api.commit_staging_to_public(
    p_batch_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, api, staging, auth
AS $$
DECLARE v_created_org INTEGER := 0;
DECLARE v_created_obj INTEGER := 0;
DECLARE v_updated_obj INTEGER := 0;
DECLARE v_links INTEGER := 0;
DECLARE v_created_media INTEGER := 0;
DECLARE v_locked BOOLEAN := FALSE;
DECLARE v_integrity JSONB;
DECLARE v_batch_status TEXT;
DECLARE v_batch_immutable BOOLEAN := FALSE;
DECLARE v_media_type_id UUID;
DECLARE v_ledger_id UUID;
BEGIN
    -- Serialize commit per batch.
    SELECT pg_try_advisory_xact_lock(hashtext('staging_commit_' || p_batch_id)) INTO v_locked;
    IF NOT v_locked THEN
        RAISE EXCEPTION 'Cannot commit batch %: another commit is in progress', p_batch_id;
    END IF;

    SELECT status, COALESCE(is_immutable, FALSE)
      INTO v_batch_status, v_batch_immutable
    FROM staging.import_batches
    WHERE batch_id = p_batch_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Cannot commit batch %: unknown batch id', p_batch_id;
    END IF;
    IF v_batch_status = 'committed' OR v_batch_immutable THEN
        RAISE EXCEPTION 'Cannot commit batch %: already committed/immutable', p_batch_id;
    END IF;

    SELECT staging.assert_batch_integrity(p_batch_id) INTO v_integrity;
    IF COALESCE((v_integrity->>'ok')::BOOLEAN, FALSE) IS FALSE THEN
        RAISE EXCEPTION 'Cannot commit batch %: integrity assertion failed (%).', p_batch_id, v_integrity::TEXT;
    END IF;

    -- Hard stop on blocked dependencies.
    IF EXISTS (
        SELECT 1
        FROM staging.object_temp
        WHERE import_batch_id = p_batch_id
          AND resolution_status = 'blocked_missing_dependency'
    ) THEN
        RAISE EXCEPTION 'Cannot commit batch %: unresolved dependencies', p_batch_id;
    END IF;
    IF EXISTS (
        SELECT 1
        FROM staging.ref_code_temp
        WHERE import_batch_id = p_batch_id
          AND resolution_status IN ('blocked_policy', 'review_required')
          AND COALESCE(is_approved, FALSE) IS FALSE
    ) THEN
        RAISE EXCEPTION 'Cannot commit batch %: ref_code dependencies still blocked/review.', p_batch_id;
    END IF;
    IF EXISTS (
        SELECT 1
        FROM staging.org_temp
        WHERE import_batch_id = p_batch_id
          AND resolution_status IN ('blocked_policy', 'review_required')
          AND COALESCE(is_approved, FALSE) IS FALSE
    ) THEN
        RAISE EXCEPTION 'Cannot commit batch %: organization dependencies still blocked/review.', p_batch_id;
    END IF;

    -- Phase 1: upsert allowed ref_code rows.
    INSERT INTO ref_code(domain, code, name, description, is_active)
    SELECT
        r.domain,
        r.code,
        r.name,
        r.description,
        TRUE
    FROM staging.ref_code_temp r
    WHERE r.import_batch_id = p_batch_id
      AND r.resolution_status = 'create_ready'
      AND (r.is_approved OR r.policy_action = 'allow_auto')
    ON CONFLICT (domain, code) DO UPDATE
        SET name = EXCLUDED.name,
            description = COALESCE(EXCLUDED.description, ref_code.description);

    UPDATE staging.ref_code_temp r
    SET public_id = rc.id,
        resolution_status = 'resolved_existing'
    FROM ref_code rc
    WHERE r.import_batch_id = p_batch_id
      AND rc.domain = r.domain
      AND rc.code = r.code;

    -- Phase 1b: classification scheme/value only when explicitly approved.
    INSERT INTO ref_classification_scheme(code, name, description, selection)
    SELECT
        s.scheme_code,
        s.scheme_name,
        s.description,
        COALESCE(NULLIF(s.selection, ''), 'single')
    FROM staging.ref_classification_scheme_temp s
    WHERE s.import_batch_id = p_batch_id
      AND s.is_approved IS TRUE
    ON CONFLICT (code) DO UPDATE
        SET name = EXCLUDED.name,
            description = COALESCE(EXCLUDED.description, ref_classification_scheme.description);

    UPDATE staging.ref_classification_scheme_temp s
    SET public_id = pcs.id,
        resolution_status = 'resolved_existing'
    FROM ref_classification_scheme pcs
    WHERE s.import_batch_id = p_batch_id
      AND pcs.code = s.scheme_code;

    INSERT INTO ref_classification_value(scheme_id, code, name)
    SELECT
        s.public_id,
        v.value_code,
        v.value_name
    FROM staging.ref_classification_value_temp v
    JOIN staging.ref_classification_scheme_temp s
      ON s.import_batch_id = v.import_batch_id
     AND s.scheme_code = v.scheme_code
    WHERE v.import_batch_id = p_batch_id
      AND v.is_approved IS TRUE
      AND s.public_id IS NOT NULL
    ON CONFLICT (scheme_id, code) DO UPDATE
        SET name = EXCLUDED.name;

    UPDATE staging.ref_classification_value_temp v
    SET public_id = pcv.id,
        resolution_status = 'resolved_existing'
    FROM staging.ref_classification_scheme_temp s,
         ref_classification_value pcv
    WHERE v.import_batch_id = p_batch_id
      AND s.import_batch_id = p_batch_id
      AND s.scheme_code = v.scheme_code
      AND pcv.scheme_id = s.public_id
      AND pcv.code = v.value_code;

    -- Phase 2: create organizations.
    INSERT INTO object(object_type, name, status, extra)
    SELECT
        'ORG'::object_type,
        o.name,
        'draft',
        jsonb_build_object('import_batch_id', p_batch_id, 'staging_org_key', o.staging_org_key)
    FROM staging.org_temp o
    WHERE o.import_batch_id = p_batch_id
      AND o.public_object_id IS NULL
      AND o.resolution_status = 'create_ready'
      AND (o.is_approved OR o.policy_action = 'allow_auto')
    ;
    GET DIAGNOSTICS v_created_org = ROW_COUNT;

    UPDATE staging.org_temp o
    SET public_object_id = obj.id,
        resolution_status = 'resolved_existing'
    FROM object obj
    WHERE o.import_batch_id = p_batch_id
      AND o.public_object_id IS NULL
      AND obj.extra ? 'staging_org_key'
      AND obj.extra->>'staging_org_key' = o.staging_org_key
      AND obj.extra->>'import_batch_id' = p_batch_id;

    -- Resolve org ids on objects after org creation.
    UPDATE staging.object_temp o
    SET resolved_org_object_id = org.public_object_id,
        resolution_status = 'dependency_resolved'
    FROM staging.org_temp org
    WHERE o.import_batch_id = p_batch_id
      AND org.import_batch_id = p_batch_id
      AND o.staging_org_key = org.staging_org_key
      AND org.public_object_id IS NOT NULL;

    -- Phase 3: update matched objects.
    UPDATE object obj
    SET
        name = COALESCE(NULLIF(s.name, ''), obj.name),
        object_type = COALESCE(staging.safe_object_type(s.object_type), obj.object_type),
        updated_at = NOW(),
        extra = COALESCE(obj.extra, '{}'::jsonb) || jsonb_build_object('last_import_batch_id', p_batch_id)
    FROM staging.object_temp s
    WHERE s.import_batch_id = p_batch_id
      AND s.is_approved IS TRUE
      AND s.matched_public_object_id IS NOT NULL
      AND obj.id = s.matched_public_object_id;

    GET DIAGNOSTICS v_updated_obj = ROW_COUNT;

    UPDATE staging.object_temp
    SET resolved_object_id = matched_public_object_id
    WHERE import_batch_id = p_batch_id
      AND matched_public_object_id IS NOT NULL
      AND is_approved IS TRUE;

    -- Phase 3b: create new business objects.
    INSERT INTO object(object_type, name, status, extra)
    SELECT
        staging.safe_object_type(o.object_type),
        COALESCE(NULLIF(o.name, ''), 'Imported object'),
        'draft',
        jsonb_build_object('import_batch_id', p_batch_id, 'staging_object_key', o.staging_object_key)
    FROM staging.object_temp o
    WHERE o.import_batch_id = p_batch_id
      AND o.is_approved IS TRUE
      AND o.resolved_object_id IS NULL
      AND o.resolution_status IN ('dependency_resolved', 'awaiting_org_create');

    UPDATE staging.object_temp o
    SET resolved_object_id = obj.id
    FROM object obj
    WHERE o.import_batch_id = p_batch_id
      AND o.resolved_object_id IS NULL
      AND obj.extra ? 'staging_object_key'
      AND obj.extra->>'staging_object_key' = o.staging_object_key
      AND obj.extra->>'import_batch_id' = p_batch_id;

    SELECT COUNT(*) INTO v_created_obj
    FROM staging.object_temp
    WHERE import_batch_id = p_batch_id
      AND is_approved IS TRUE
      AND matched_public_object_id IS NULL
      AND resolved_object_id IS NOT NULL;

    -- object_external_id idempotent sync.
    INSERT INTO object_external_id(object_id, organization_object_id, external_id)
    SELECT
        o.resolved_object_id,
        COALESCE(o.resolved_org_object_id, o.source_org_object_id),
        o.external_id
    FROM staging.object_temp o
    WHERE o.import_batch_id = p_batch_id
      AND o.is_approved IS TRUE
      AND o.external_id IS NOT NULL
      AND COALESCE(o.resolved_org_object_id, o.source_org_object_id) IS NOT NULL
      AND o.resolved_object_id IS NOT NULL
    ON CONFLICT (organization_object_id, external_id) DO UPDATE
        SET object_id = EXCLUDED.object_id,
            updated_at = NOW();

    -- Phase 4: child tables in deterministic order.
    INSERT INTO object_location(object_id, latitude, longitude, address1, city, postcode, is_main_location)
    SELECT
        o.resolved_object_id,
        l.latitude,
        l.longitude,
        l.address1,
        l.city,
        l.postcode,
        l.is_main_location
    FROM staging.object_location_temp l
    JOIN staging.object_temp o
      ON o.import_batch_id = l.import_batch_id
     AND o.staging_object_key = l.staging_object_key
    WHERE l.import_batch_id = p_batch_id
      AND l.is_approved IS TRUE
      AND o.resolved_object_id IS NOT NULL
      AND l.is_main_location IS TRUE
    ON CONFLICT ON CONSTRAINT uq_object_location_main DO UPDATE
        SET latitude = EXCLUDED.latitude,
            longitude = EXCLUDED.longitude,
            address1 = COALESCE(EXCLUDED.address1, object_location.address1),
            city = COALESCE(EXCLUDED.city, object_location.city),
            postcode = COALESCE(EXCLUDED.postcode, object_location.postcode),
            updated_at = NOW();

    INSERT INTO contact_channel(object_id, kind_id, value, is_public, is_primary)
    SELECT
        o.resolved_object_id,
        k.id,
        c.value,
        c.is_public,
        c.is_primary
    FROM staging.contact_channel_temp c
    JOIN staging.object_temp o
      ON o.import_batch_id = c.import_batch_id
     AND o.staging_object_key = c.staging_object_key
    JOIN ref_code_contact_kind k
      ON lower(k.code) = lower(c.kind_code)
    WHERE c.import_batch_id = p_batch_id
      AND c.is_approved IS TRUE
      AND o.resolved_object_id IS NOT NULL
    ON CONFLICT (object_id, kind_id, value) DO UPDATE
        SET is_public = EXCLUDED.is_public,
            is_primary = EXCLUDED.is_primary,
            updated_at = NOW();

    -- Ensure org roles exist from staged role codes (if allowed).
    INSERT INTO ref_org_role(code, name)
    SELECT DISTINCT
        lower(r.code),
        initcap(replace(lower(r.code), '_', ' '))
    FROM staging.ref_code_temp r
    WHERE r.import_batch_id = p_batch_id
      AND r.domain = 'org_role'
      AND r.resolution_status IN ('create_ready', 'resolved_existing')
      AND (r.is_approved OR r.policy_action = 'allow_auto')
    ON CONFLICT (code) DO NOTHING;

    INSERT INTO object_org_link(object_id, org_object_id, role_id, is_primary, note)
    SELECT
        o.resolved_object_id,
        org.public_object_id,
        rr.id,
        l.is_primary,
        l.note
    FROM staging.object_org_link_temp l
    JOIN staging.object_temp o
      ON o.import_batch_id = l.import_batch_id
     AND o.staging_object_key = l.staging_object_key
    JOIN staging.org_temp org
      ON org.import_batch_id = l.import_batch_id
     AND org.staging_org_key = l.staging_org_key
    JOIN ref_org_role rr
      ON rr.code = lower(l.role_code)
    WHERE l.import_batch_id = p_batch_id
      AND l.is_approved IS TRUE
      AND o.resolved_object_id IS NOT NULL
      AND org.public_object_id IS NOT NULL
    ON CONFLICT (object_id, org_object_id, role_id) DO UPDATE
        SET is_primary = EXCLUDED.is_primary,
            note = COALESCE(EXCLUDED.note, object_org_link.note),
            updated_at = NOW();

    GET DIAGNOSTICS v_links = ROW_COUNT;

    -- Phase 5: classification and enrichment joins.
    INSERT INTO object_classification(object_id, scheme_id, value_id, status, source)
    SELECT
        o.resolved_object_id,
        s.public_id,
        v.public_id,
        'granted',
        'import'
    FROM staging.object_classification_temp c
    JOIN staging.object_temp o
      ON o.import_batch_id = c.import_batch_id
     AND o.staging_object_key = c.staging_object_key
    JOIN staging.ref_classification_scheme_temp s
      ON s.import_batch_id = c.import_batch_id
     AND s.scheme_code = c.scheme_code
    JOIN staging.ref_classification_value_temp v
      ON v.import_batch_id = c.import_batch_id
     AND v.scheme_code = c.scheme_code
     AND v.value_code = c.value_code
    WHERE c.import_batch_id = p_batch_id
      AND c.is_approved IS TRUE
      AND o.resolved_object_id IS NOT NULL
      AND s.public_id IS NOT NULL
      AND v.public_id IS NOT NULL
      AND NOT EXISTS (
          SELECT 1
          FROM object_classification oc
          WHERE oc.object_id = o.resolved_object_id
            AND oc.scheme_id = s.public_id
            AND oc.value_id = v.public_id
      );

    INSERT INTO object_amenity(object_id, amenity_id)
    SELECT
        o.resolved_object_id,
        a.id
    FROM staging.object_amenity_temp t
    JOIN staging.object_temp o
      ON o.import_batch_id = t.import_batch_id
     AND o.staging_object_key = t.staging_object_key
    JOIN ref_amenity a
      ON a.code = t.amenity_code
    WHERE t.import_batch_id = p_batch_id
      AND t.is_approved IS TRUE
      AND o.resolved_object_id IS NOT NULL
    ON CONFLICT (object_id, amenity_id) DO NOTHING;

    INSERT INTO object_payment_method(object_id, payment_method_id)
    SELECT
        o.resolved_object_id,
        p.id
    FROM staging.object_payment_method_temp t
    JOIN staging.object_temp o
      ON o.import_batch_id = t.import_batch_id
     AND o.staging_object_key = t.staging_object_key
    JOIN ref_code_payment_method p
      ON p.code = t.payment_code
    WHERE t.import_batch_id = p_batch_id
      AND t.is_approved IS TRUE
      AND o.resolved_object_id IS NOT NULL
    ON CONFLICT (object_id, payment_method_id) DO NOTHING;

    -- Phase 6: media URL rows that passed semi-auto governance.
    SELECT id INTO v_media_type_id
    FROM ref_code_media_type
    WHERE code = 'photo'
    LIMIT 1;

    IF v_media_type_id IS NOT NULL THEN
        INSERT INTO media(
            object_id,
            media_type_id,
            url,
            title,
            description,
            analyse_data,
            position,
            is_main,
            is_published,
            kind
        )
        SELECT
            COALESCE(m.resolved_object_id, o.resolved_object_id, o.matched_public_object_id),
            v_media_type_id,
            m.source_url,
            NULL,
            NULL,
            jsonb_build_object(
                'ingestor',
                jsonb_build_object(
                    'import_batch_id', p_batch_id,
                    'bucket_path', m.bucket_path,
                    'media_sha256', m.media_sha256,
                    'source_url', m.source_url,
                    'ai_confidence', m.ai_confidence,
                    'ai_decision', m.ai_decision
                )
            ),
            COALESCE(m.position, 0),
            (COALESCE(m.position, 0) = 0),
            TRUE,
            'illustration'
        FROM staging.media_temp m
        LEFT JOIN staging.object_temp o
          ON o.import_batch_id = m.import_batch_id
         AND o.staging_object_key = m.staging_object_key
        WHERE m.import_batch_id = p_batch_id
          AND m.processing_status = 'ready_for_commit'
          AND m.is_approved IS TRUE
          AND COALESCE(m.resolved_object_id, o.resolved_object_id, o.matched_public_object_id) IS NOT NULL
          AND NOT EXISTS (
              SELECT 1
              FROM media existing_m
              WHERE existing_m.object_id = COALESCE(m.resolved_object_id, o.resolved_object_id, o.matched_public_object_id)
                AND existing_m.analyse_data->'ingestor'->>'media_sha256' = m.media_sha256
          );
        GET DIAGNOSTICS v_created_media = ROW_COUNT;

        UPDATE staging.media_temp m
        SET processing_status = 'committed',
            resolution_status = 'resolved'
        WHERE m.import_batch_id = p_batch_id
          AND m.processing_status = 'ready_for_commit'
          AND m.is_approved IS TRUE;
    END IF;

    UPDATE staging.import_batches
    SET status = 'committed',
        committed_at = NOW(),
        is_immutable = TRUE,
        retention_until = NOW() + INTERVAL '30 days'
    WHERE batch_id = p_batch_id;

    PERFORM staging.log_import_event(
        p_batch_id,
        'commit',
        'info',
        'Batch committed successfully',
        jsonb_build_object(
            'created_org', v_created_org,
            'created_object', v_created_obj,
            'updated_object', v_updated_obj,
            'org_links', v_links,
            'created_media', v_created_media
        )
    );

    INSERT INTO staging.batch_commit_ledger(
        batch_id,
        committed_at,
        rollback_status,
        summary
    )
    VALUES (
        p_batch_id,
        NOW(),
        'not_rolled_back',
        jsonb_build_object(
            'created_org', v_created_org,
            'created_object', v_created_obj,
            'updated_object', v_updated_obj,
            'org_links', v_links,
            'created_media', v_created_media
        )
    )
    ON CONFLICT (batch_id) DO UPDATE
    SET committed_at = EXCLUDED.committed_at,
        rollback_status = 'not_rolled_back',
        rollback_at = NULL,
        rollback_error = NULL,
        summary = EXCLUDED.summary
    RETURNING id INTO v_ledger_id;

    INSERT INTO staging.batch_commit_ledger_item(ledger_id, entity_type, entity_id, payload)
    SELECT
        v_ledger_id,
        'object',
        obj.id,
        jsonb_build_object('name', obj.name, 'object_type', obj.object_type)
    FROM object obj
    WHERE obj.extra->>'import_batch_id' = p_batch_id
    ON CONFLICT (ledger_id, entity_type, entity_id) DO NOTHING;

    INSERT INTO staging.batch_commit_ledger_item(ledger_id, entity_type, entity_id, payload)
    SELECT
        v_ledger_id,
        'media',
        m.id::TEXT,
        jsonb_build_object('object_id', m.object_id, 'url', m.url)
    FROM media m
    WHERE m.analyse_data->'ingestor'->>'import_batch_id' = p_batch_id
    ON CONFLICT (ledger_id, entity_type, entity_id) DO NOTHING;

    RETURN jsonb_build_object(
        'batch_id', p_batch_id,
        'created_org', v_created_org,
        'created_object', v_created_obj,
        'updated_object', v_updated_obj,
        'org_links', v_links,
        'created_media', v_created_media
    );
END;
$$;

CREATE OR REPLACE FUNCTION api.purge_staging_batch(
    p_batch_id TEXT,
    p_force BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, api, staging, auth
AS $$
DECLARE v_can_purge BOOLEAN := FALSE;
DECLARE v_rows_deleted INTEGER := 0;
BEGIN
    SELECT (
      status IN ('committed', 'failed_permanent')
      OR p_force
    ) INTO v_can_purge
    FROM staging.import_batches
    WHERE batch_id = p_batch_id;

    IF NOT COALESCE(v_can_purge, FALSE) THEN
        RAISE EXCEPTION 'Batch % cannot be purged before terminal state (or force=true).', p_batch_id;
    END IF;

    DELETE FROM staging.import_batches
    WHERE batch_id = p_batch_id;
    GET DIAGNOSTICS v_rows_deleted = ROW_COUNT;

    RETURN jsonb_build_object(
        'batch_id', p_batch_id,
        'purged', (v_rows_deleted > 0)
    );
END;
$$;

CREATE OR REPLACE FUNCTION api.purge_expired_staging_batches(
    p_limit INTEGER DEFAULT 500
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, api, staging, auth
AS $$
DECLARE v_deleted INTEGER := 0;
BEGIN
    IF COALESCE(p_limit, 0) <= 0 THEN
        RAISE EXCEPTION 'p_limit must be > 0';
    END IF;

    WITH candidate AS (
        SELECT batch_id
        FROM staging.import_batches
        WHERE status IN ('committed', 'failed_permanent')
          AND retention_until IS NOT NULL
          AND retention_until < NOW()
        ORDER BY retention_until ASC
        LIMIT p_limit
    ),
    deleted AS (
        DELETE FROM staging.import_batches b
        USING candidate c
        WHERE b.batch_id = c.batch_id
        RETURNING b.batch_id
    )
    SELECT COUNT(*) INTO v_deleted
    FROM deleted;

    RETURN jsonb_build_object(
        'purged_count', v_deleted,
        'limit', p_limit,
        'executed_at', NOW()
    );
END;
$$;

CREATE OR REPLACE FUNCTION api.get_ingestor_metrics()
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, api, staging, auth
AS $$
WITH by_status AS (
    SELECT status, COUNT(*) AS cnt
    FROM staging.import_batches
    GROUP BY status
),
events_24h AS (
    SELECT
        COUNT(*) FILTER (WHERE level = 'error') AS errors_24h,
        COUNT(*) AS events_24h
    FROM staging.import_events
    WHERE created_at >= NOW() - INTERVAL '24 hours'
),
media_status AS (
    SELECT processing_status, COUNT(*) AS cnt
    FROM staging.media_temp
    GROUP BY processing_status
),
media_sla AS (
    SELECT
        COUNT(*) FILTER (WHERE processing_status = 'download_failed') AS media_download_failures,
        COUNT(*) FILTER (WHERE processing_status = 'review_required') AS media_review_backlog,
        COUNT(*) FILTER (WHERE raw_relation_token IS NOT NULL AND resolution_status IN ('blocked_policy', 'review_required')) AS relation_ambiguity_backlog
    FROM (
        SELECT raw_relation_token, resolution_status, NULL::TEXT AS processing_status
        FROM staging.object_org_link_temp
        UNION ALL
        SELECT raw_relation_token, resolution_status, NULL::TEXT AS processing_status
        FROM staging.object_amenity_temp
        UNION ALL
        SELECT raw_relation_token, resolution_status, NULL::TEXT AS processing_status
        FROM staging.object_payment_method_temp
        UNION ALL
        SELECT NULL::TEXT AS raw_relation_token, resolution_status, processing_status
        FROM staging.media_temp
    ) x
),
governance AS (
    SELECT
        COUNT(*) FILTER (WHERE ai_decision = 'auto_ready') AS ai_auto_ready,
        COUNT(*) FILTER (WHERE ai_decision = 'review_required') AS ai_review_required,
        COUNT(*) FILTER (WHERE ai_decision = 'blocked_low_confidence') AS ai_blocked_low_confidence
    FROM staging.media_temp
),
discovery AS (
    SELECT
        COUNT(*) FILTER (WHERE status = 'review_required') AS discovery_review_backlog,
        COUNT(*) FILTER (WHERE status = 'approved') AS discovery_approved_contracts,
        COUNT(*) FILTER (WHERE status = 'rejected') AS discovery_rejected_contracts,
        AVG(EXTRACT(EPOCH FROM (approved_at - created_at)))
            FILTER (WHERE status = 'approved' AND approved_at IS NOT NULL) AS discovery_approval_latency_s
    FROM staging.mapping_contract
)
SELECT jsonb_build_object(
    'batches_by_status', COALESCE((SELECT jsonb_object_agg(status, cnt) FROM by_status), '{}'::jsonb),
    'events_24h', COALESCE((SELECT events_24h FROM events_24h), 0),
    'errors_24h', COALESCE((SELECT errors_24h FROM events_24h), 0),
    'media_by_status', COALESCE((SELECT jsonb_object_agg(processing_status, cnt) FROM media_status), '{}'::jsonb),
    'media_download_failures', COALESCE((SELECT media_download_failures FROM media_sla), 0),
    'media_review_backlog', COALESCE((SELECT media_review_backlog FROM media_sla), 0),
    'relation_ambiguity_backlog', COALESCE((SELECT relation_ambiguity_backlog FROM media_sla), 0),
    'ai_governance', COALESCE(
        (SELECT jsonb_build_object(
            'auto_ready', ai_auto_ready,
            'review_required', ai_review_required,
            'blocked_low_confidence', ai_blocked_low_confidence
        ) FROM governance),
        '{}'::jsonb
    ),
    'discovery_review_backlog', COALESCE((SELECT discovery_review_backlog FROM discovery), 0),
    'discovery_approved_contracts', COALESCE((SELECT discovery_approved_contracts FROM discovery), 0),
    'discovery_rejected_contracts', COALESCE((SELECT discovery_rejected_contracts FROM discovery), 0),
    'discovery_approval_latency_s', COALESCE((SELECT discovery_approval_latency_s FROM discovery), 0)
);
$$;

CREATE OR REPLACE FUNCTION api.get_ingestor_scheduler_health()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, api, staging, auth
AS $$
DECLARE v_has_pg_cron BOOLEAN := FALSE;
DECLARE v_job_count INTEGER := 0;
DECLARE v_last_run TIMESTAMPTZ;
BEGIN
    SELECT EXISTS (
        SELECT 1
        FROM information_schema.schemata
        WHERE schema_name = 'cron'
    ) INTO v_has_pg_cron;

    IF v_has_pg_cron THEN
        SELECT COUNT(*) INTO v_job_count FROM cron.job;
        SELECT MAX(end_time) INTO v_last_run FROM cron.job_run_details;
    END IF;

    RETURN jsonb_build_object(
        'pg_cron_available', v_has_pg_cron,
        'job_count', v_job_count,
        'last_run_at', v_last_run
    );
END;
$$;

-- Least-privilege staging and RPC exposure.
REVOKE ALL ON SCHEMA staging FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA staging FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA staging FROM PUBLIC, anon, authenticated;

GRANT USAGE ON SCHEMA staging TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA staging TO service_role;

REVOKE EXECUTE ON FUNCTION api.run_staging_dedup(TEXT, INTEGER, REAL) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION api.resolve_staging_dependencies(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION api.assert_staging_batch_integrity(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION api.commit_staging_to_public(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION api.rollback_staging_batch_compensate(TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION api.purge_staging_batch(TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION api.purge_expired_staging_batches(INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION api.retry_failed_media_downloads(INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION api.watchdog_mark_stale_batches(INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION api.get_ingestor_metrics() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION api.get_ingestor_scheduler_health() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION api.run_staging_dedup(TEXT, INTEGER, REAL) TO service_role;
GRANT EXECUTE ON FUNCTION api.resolve_staging_dependencies(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION api.assert_staging_batch_integrity(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION api.commit_staging_to_public(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION api.rollback_staging_batch_compensate(TEXT, BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION api.purge_staging_batch(TEXT, BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION api.purge_expired_staging_batches(INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION api.retry_failed_media_downloads(INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION api.watchdog_mark_stale_batches(INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION api.get_ingestor_metrics() TO service_role;
GRANT EXECUTE ON FUNCTION api.get_ingestor_scheduler_health() TO service_role;

