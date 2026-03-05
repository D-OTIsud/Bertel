-- =====================================================
-- Staging V2: Additional staging tables for exhaustive mapping
-- Run AFTER staging_ingestor.sql
-- =====================================================

-- 1. object_description_temp  (→ object_description)
CREATE TABLE IF NOT EXISTS staging.object_description_temp (
    import_description_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT NOT NULL,
    description TEXT,
    description_chapo TEXT,
    description_mobile TEXT,
    description_edition TEXT,
    description_offre_hors_zone TEXT,
    sanitary_measures TEXT,
    org_object_id TEXT,
    visibility TEXT DEFAULT 'public',
    position INTEGER DEFAULT 0,
    description_i18n JSONB NOT NULL DEFAULT '{}'::jsonb,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    source_sheet TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_desc_temp_batch
    ON staging.object_description_temp(import_batch_id, staging_object_key);

-- 2. object_external_id_temp  (→ object_external_id)  CRITICAL for upsert
CREATE TABLE IF NOT EXISTS staging.object_external_id_temp (
    import_ext_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT NOT NULL,
    external_id TEXT NOT NULL,
    organization_object_id TEXT,
    last_synced_at TIMESTAMPTZ DEFAULT NOW(),
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    source_sheet TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (import_batch_id, staging_object_key, external_id)
);
CREATE INDEX IF NOT EXISTS idx_ext_id_temp_batch
    ON staging.object_external_id_temp(import_batch_id, staging_object_key);

-- 3. object_origin_temp  (→ object_origin)  source tracking
CREATE TABLE IF NOT EXISTS staging.object_origin_temp (
    import_origin_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT NOT NULL,
    source_system TEXT NOT NULL,
    source_object_id TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    source_sheet TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (import_batch_id, staging_object_key, source_system)
);

-- 4. actor_temp  (→ actor)
CREATE TABLE IF NOT EXISTS staging.actor_temp (
    import_actor_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_actor_key TEXT NOT NULL,
    staging_object_key TEXT,
    display_name TEXT,
    first_name TEXT,
    last_name TEXT,
    gender TEXT,
    extra JSONB NOT NULL DEFAULT '{}'::jsonb,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    matched_public_actor_id UUID,
    source_sheet TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (import_batch_id, staging_actor_key)
);
CREATE INDEX IF NOT EXISTS idx_actor_temp_batch
    ON staging.actor_temp(import_batch_id, staging_object_key);

-- 5. actor_channel_temp  (→ actor_channel)
CREATE TABLE IF NOT EXISTS staging.actor_channel_temp (
    import_actor_channel_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_actor_key TEXT NOT NULL,
    kind_code TEXT NOT NULL,
    value TEXT NOT NULL,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    source_sheet TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (import_batch_id, staging_actor_key, kind_code, value)
);

-- 6. actor_object_role_temp  (→ actor_object_role)
CREATE TABLE IF NOT EXISTS staging.actor_object_role_temp (
    import_actor_role_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_actor_key TEXT NOT NULL,
    staging_object_key TEXT NOT NULL,
    role_code TEXT NOT NULL,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    note TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    source_sheet TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (import_batch_id, staging_actor_key, staging_object_key, role_code)
);

-- 7. object_language_temp  (→ object_language)
CREATE TABLE IF NOT EXISTS staging.object_language_temp (
    import_language_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT NOT NULL,
    language_code TEXT NOT NULL,
    level_code TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    source_sheet TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (import_batch_id, staging_object_key, language_code)
);

-- 8. object_environment_tag_temp  (→ object_environment_tag)
CREATE TABLE IF NOT EXISTS staging.object_environment_tag_temp (
    import_env_tag_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT NOT NULL,
    environment_tag_code TEXT NOT NULL,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    source_sheet TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (import_batch_id, staging_object_key, environment_tag_code)
);

-- 9. object_legal_temp  (→ object_legal)
CREATE TABLE IF NOT EXISTS staging.object_legal_temp (
    import_legal_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT NOT NULL,
    type_code TEXT NOT NULL,
    value JSONB NOT NULL DEFAULT '{}'::jsonb,
    valid_from DATE,
    valid_to DATE,
    status TEXT DEFAULT 'valid',
    note TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    source_sheet TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. object_capacity_temp  (→ object_capacity)
CREATE TABLE IF NOT EXISTS staging.object_capacity_temp (
    import_capacity_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT NOT NULL,
    metric_code TEXT NOT NULL,
    value_integer INTEGER,
    unit VARCHAR(32),
    effective_from DATE,
    effective_to DATE,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    source_sheet TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. object_price_temp  (→ object_price)
CREATE TABLE IF NOT EXISTS staging.object_price_temp (
    import_price_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT NOT NULL,
    kind_code TEXT,
    unit_code TEXT,
    amount NUMERIC(12,2),
    amount_max NUMERIC(12,2),
    currency CHAR(3) DEFAULT 'EUR',
    conditions TEXT,
    valid_from DATE,
    valid_to DATE,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    source_sheet TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 12. object_fma_temp  (→ object_fma + object_fma_occurrence)  Events
CREATE TABLE IF NOT EXISTS staging.object_fma_temp (
    import_fma_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT NOT NULL,
    event_start_date DATE,
    event_end_date DATE,
    event_start_time TIME,
    event_end_time TIME,
    is_recurring BOOLEAN DEFAULT FALSE,
    recurrence_pattern TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    source_sheet TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (import_batch_id, staging_object_key)
);

-- 13. object_iti_temp  (→ object_iti)  Itineraries
CREATE TABLE IF NOT EXISTS staging.object_iti_temp (
    import_iti_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT NOT NULL,
    distance_km DECIMAL(8,2),
    duration_hours DECIMAL(6,2),
    difficulty_level INTEGER,
    elevation_gain INTEGER,
    is_loop BOOLEAN DEFAULT FALSE,
    gpx_data TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    source_sheet TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (import_batch_id, staging_object_key)
);

-- 14. object_room_type_temp  (→ object_room_type)  Accommodation
CREATE TABLE IF NOT EXISTS staging.object_room_type_temp (
    import_room_type_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT NOT NULL,
    code TEXT,
    name TEXT NOT NULL,
    capacity_adults INTEGER,
    capacity_children INTEGER,
    capacity_total INTEGER,
    size_sqm NUMERIC(8,2),
    bed_config TEXT,
    total_rooms INTEGER,
    base_price NUMERIC(12,2),
    currency TEXT DEFAULT 'EUR',
    is_accessible BOOLEAN DEFAULT FALSE,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    source_sheet TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 15. opening_period_temp  (→ opening_period + children)  Opening hours
CREATE TABLE IF NOT EXISTS staging.opening_period_temp (
    import_opening_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT NOT NULL,
    period_name TEXT,
    date_start DATE,
    date_end DATE,
    schedule_text TEXT,
    weekdays TEXT,
    start_time TIME,
    end_time TIME,
    is_closed BOOLEAN DEFAULT FALSE,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    source_sheet TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add updated_at triggers for all new tables
DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOR tbl IN
        SELECT unnest(ARRAY[
            'object_description_temp', 'object_external_id_temp', 'object_origin_temp',
            'actor_temp', 'actor_channel_temp', 'actor_object_role_temp',
            'object_language_temp', 'object_environment_tag_temp', 'object_legal_temp',
            'object_capacity_temp', 'object_price_temp', 'object_fma_temp',
            'object_iti_temp', 'object_room_type_temp', 'opening_period_temp'
        ])
    LOOP
        EXECUTE format(
            'DROP TRIGGER IF EXISTS trg_%s_updated_at ON staging.%I;
             CREATE TRIGGER trg_%s_updated_at
             BEFORE UPDATE ON staging.%I
             FOR EACH ROW EXECUTE FUNCTION staging.touch_updated_at();',
            tbl, tbl, tbl, tbl
        );
    END LOOP;
END;
$$;
