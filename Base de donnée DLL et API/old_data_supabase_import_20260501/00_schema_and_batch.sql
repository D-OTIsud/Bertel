-- ===========================================================================
-- Old_data import - Stage 1 staging load - Schema and batch row (file 00)
-- Batch id: old-data-berta2-all-20260501-01
--
-- Run this file first. It is idempotent (CREATE ... IF NOT EXISTS,
-- INSERT ... ON CONFLICT DO UPDATE) so re-running it is safe.
--
-- After this file has run, execute the per-table data files in numeric
-- order, then 18_review_mapped_supplements.sql, 19_finalize_batch_status.sql,
-- and finally 20_promotion.sql.
-- ===========================================================================

DO $$ BEGIN RAISE NOTICE 'Old_data import batch: old-data-berta2-all-20260501-01'; END $$;

-- =============================================================================
-- Staging table setup
-- =============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE SCHEMA IF NOT EXISTS staging;

CREATE TABLE IF NOT EXISTS staging.import_batches (
    batch_id TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'received',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS staging.object_temp (
    import_row_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT,
    source_sheet TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    object_type TEXT,
    name TEXT,
    external_id TEXT,
    source_org_object_id TEXT,
    region_code TEXT,
    status TEXT,
    commercial_visibility TEXT,
    extra JSONB,
    deduplication_status TEXT DEFAULT 'pending',
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    resolved_object_id TEXT,
    matched_public_object_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS staging.object_location_temp (
    import_location_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT NOT NULL,
    address1 TEXT,
    postcode TEXT,
    city TEXT,
    lieu_dit TEXT,
    direction TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    is_main_location BOOLEAN NOT NULL DEFAULT TRUE,
    source_sheet TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    object_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS staging.object_description_temp (
    import_description_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT NOT NULL,
    description TEXT,
    description_chapo TEXT,
    visibility TEXT,
    position INTEGER,
    source_sheet TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    object_id TEXT,
    extra JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS staging.object_origin_temp (
    import_origin_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT NOT NULL,
    source_system TEXT,
    source_object_id TEXT,
    source_sheet TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    object_id TEXT,
    first_imported_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS staging.object_capacity_temp (
    import_capacity_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT NOT NULL,
    metric_code TEXT NOT NULL,
    value_integer INTEGER,
    source_sheet TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    object_id TEXT,
    metric_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS staging.object_language_temp (
    import_language_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT NOT NULL,
    language_code TEXT NOT NULL,
    source_sheet TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    object_id TEXT,
    language_id TEXT,
    extra JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS staging.object_payment_method_temp (
    import_payment_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT NOT NULL,
    payment_code TEXT NOT NULL,
    source_sheet TEXT,
    source_column TEXT,
    raw_relation_token TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    object_id TEXT,
    payment_method_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS staging.contact_channel_temp (
    import_contact_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT NOT NULL,
    kind_code TEXT NOT NULL,
    value TEXT NOT NULL,
    is_public BOOLEAN NOT NULL DEFAULT TRUE,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    position INTEGER,
    source_sheet TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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
    source_sheet TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    matched_public_actor_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS staging.actor_channel_temp (
    import_actor_channel_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_actor_key TEXT NOT NULL,
    kind_code TEXT NOT NULL,
    value TEXT NOT NULL,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    source_sheet TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS staging.actor_object_role_temp (
    import_actor_role_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_actor_key TEXT NOT NULL,
    staging_object_key TEXT NOT NULL,
    role_code TEXT NOT NULL,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    note TEXT,
    source_sheet TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS staging.crm_interaction_temp (
    import_interaction_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT NOT NULL,
    staging_actor_key TEXT,
    interaction_type TEXT,
    direction TEXT,
    status TEXT DEFAULT 'done',
    subject TEXT,
    body TEXT,
    source TEXT,
    occurred_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    is_actionable BOOLEAN,
    demand_topic_code TEXT,
    id TEXT,
    object_id TEXT,
    actor_id TEXT,
    owner TEXT,
    extra JSONB,
    source_sheet TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS staging.crm_comment_temp (
    import_comment_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    id TEXT,
    parent_legacy_crm_id TEXT NOT NULL,
    user_email TEXT,
    body TEXT,
    occurred_at TIMESTAMPTZ,
    humeur_raw TEXT,
    original_comment_status TEXT,
    close_reqs BOOLEAN DEFAULT FALSE,
    modere BOOLEAN DEFAULT FALSE,
    object_id TEXT,
    actor_id TEXT,
    owner TEXT,
    resolved_parent_interaction_id TEXT,
    source_sheet TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    extra JSONB,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS staging.media_galerie_lot1_temp (
    import_media_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    legacy_img_id TEXT,
    legacy_formulaire TEXT,
    url_source TEXT,
    main_pic_source BOOLEAN,
    description_source TEXT,
    object_id TEXT,
    is_main_resolved BOOLEAN NOT NULL DEFAULT FALSE,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    extra JSONB,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS staging.object_price_temp (
    import_price_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT NOT NULL,
    kind_code TEXT,
    unit_code TEXT,
    amount NUMERIC(12,2),
    currency CHAR(3) DEFAULT 'EUR',
    conditions TEXT,
    source TEXT,
    source_sheet TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    object_id TEXT,
    kind_id TEXT,
    unit_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS staging.opening_period_temp (
    import_opening_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT NOT NULL,
    period_name TEXT,
    source_period_id TEXT,
    all_years BOOLEAN,
    weekdays TEXT,
    start_time TIME,
    end_time TIME,
    schedule_text TEXT,
    source_sheet TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    object_id TEXT,
    extra JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS staging.object_sustainability_action_temp (
    import_row_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT,
    action_id TEXT,
    note TEXT,
    source_sheet TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    object_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_old_data_object_temp_batch ON staging.object_temp(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_old_data_object_temp_external_id ON staging.object_temp(external_id);
CREATE INDEX IF NOT EXISTS idx_old_data_crm_temp_batch ON staging.crm_interaction_temp(import_batch_id, resolution_status);
CREATE INDEX IF NOT EXISTS idx_old_data_media_temp_batch ON staging.media_galerie_lot1_temp(import_batch_id, resolution_status);


-- Make sure the natural-key uniqueness on contact_channel_temp exists. This
-- mirrors the constraint that already lives in production databases from an
-- earlier staging schema and lets the per-row ON CONFLICT clauses below
-- silently dedupe duplicates between the main Berta 2.0 sheet and the
-- "Contacts sup" satellite sheet (the source data has 35 such duplicates).
DO $contact_channel_temp_uq$ BEGIN
  ALTER TABLE staging.contact_channel_temp
    ADD CONSTRAINT contact_channel_temp_uq_batch_object_kind_value
    UNIQUE (import_batch_id, staging_object_key, kind_code, value);
EXCEPTION
  WHEN duplicate_table THEN NULL;
  WHEN duplicate_object THEN NULL;
  WHEN unique_violation THEN NULL;
END $contact_channel_temp_uq$;

BEGIN;
INSERT INTO staging.import_batches (batch_id, status, metadata)
VALUES ('old-data-berta2-all-20260501-01', 'staging_loaded', '{"source":"Old_data","loader":"old_data_standalone_supabase_sql"}'::jsonb)
ON CONFLICT (batch_id) DO UPDATE
SET status = EXCLUDED.status, metadata = EXCLUDED.metadata, updated_at = NOW();
COMMIT;
