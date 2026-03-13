-- =====================================================
-- Staging V3: Exhaustive mirror tables for unified schema coverage
-- Auto-generated from schema_unified.sql for manual mapping completeness
-- Run AFTER staging_ingestor.sql and staging_v2_tables.sql
-- =====================================================

-- actor_consent -> staging.actor_consent_temp
CREATE TABLE IF NOT EXISTS staging.actor_consent_temp (
    import_row_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT,
    actor_id TEXT,
    channel TEXT,
    consent_given BOOLEAN,
    timestamp TIMESTAMPTZ,
    source TEXT,
    document_id TEXT,
    source_sheet TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_actor_consent_temp_batch ON staging.actor_consent_temp(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_actor_consent_temp_object_key ON staging.actor_consent_temp(staging_object_key);

-- audit.audit_log -> staging.audit_audit_log_temp
CREATE TABLE IF NOT EXISTS staging.audit_audit_log_temp (
    import_row_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT,
    table_name TEXT,
    operation TEXT,
    row_pk JSONB NOT NULL DEFAULT '{}'::jsonb,
    before_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    after_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    changed_at TIMESTAMPTZ,
    changed_by TEXT,
    source_sheet TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_audit_log_temp_batch ON staging.audit_audit_log_temp(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_audit_audit_log_temp_object_key ON staging.audit_audit_log_temp(staging_object_key);

-- audit_criteria -> staging.audit_criteria_temp
CREATE TABLE IF NOT EXISTS staging.audit_criteria_temp (
    import_row_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT,
    template_id TEXT,
    code TEXT,
    question TEXT,
    max_points INTEGER,
    is_mandatory BOOLEAN,
    position INTEGER,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by TEXT,
    updated_by TEXT,
    source_sheet TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_criteria_temp_batch ON staging.audit_criteria_temp(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_audit_criteria_temp_object_key ON staging.audit_criteria_temp(staging_object_key);

-- audit_result -> staging.audit_result_temp
CREATE TABLE IF NOT EXISTS staging.audit_result_temp (
    import_row_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT,
    session_id TEXT,
    criteria_id TEXT,
    points_awarded INTEGER,
    auditor_note TEXT,
    created_by TEXT,
    updated_by TEXT,
    source_sheet TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_result_temp_batch ON staging.audit_result_temp(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_audit_result_temp_object_key ON staging.audit_result_temp(staging_object_key);

-- audit_session -> staging.audit_session_temp
CREATE TABLE IF NOT EXISTS staging.audit_session_temp (
    import_row_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT,
    template_id TEXT,
    auditor_id TEXT,
    audit_date DATE,
    total_score INTEGER,
    status TEXT,
    certified_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by TEXT,
    updated_by TEXT,
    source_sheet TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_session_temp_batch ON staging.audit_session_temp(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_audit_session_temp_object_key ON staging.audit_session_temp(staging_object_key);

-- audit_template -> staging.audit_template_temp
CREATE TABLE IF NOT EXISTS staging.audit_template_temp (
    import_row_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT,
    scheme_id TEXT,
    classification_value_id TEXT,
    code TEXT,
    name TEXT,
    passing_score_required INTEGER,
    is_active BOOLEAN,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by TEXT,
    updated_by TEXT,
    source_sheet TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_template_temp_batch ON staging.audit_template_temp(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_audit_template_temp_object_key ON staging.audit_template_temp(staging_object_key);

-- i18n_translation -> staging.i18n_translation_temp
CREATE TABLE IF NOT EXISTS staging.i18n_translation_temp (
    import_row_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT,
    target_table TEXT,
    target_pk TEXT,
    target_column TEXT,
    language_id TEXT,
    value_text TEXT,
    value_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    source_sheet TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_i18n_translation_temp_batch ON staging.i18n_translation_temp(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_i18n_translation_temp_object_key ON staging.i18n_translation_temp(staging_object_key);

-- incident_report -> staging.incident_report_temp
CREATE TABLE IF NOT EXISTS staging.incident_report_temp (
    import_row_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT,
    category_id TEXT,
    geom TEXT,
    description TEXT,
    reporter_email TEXT,
    reporter_name TEXT,
    media_urls TEXT,
    severity TEXT,
    status TEXT,
    crm_task_id TEXT,
    crm_interaction_id TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by TEXT,
    updated_by TEXT,
    source_sheet TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_incident_report_temp_batch ON staging.incident_report_temp(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_incident_report_temp_object_key ON staging.incident_report_temp(staging_object_key);

-- media_tag -> staging.media_tag_temp
CREATE TABLE IF NOT EXISTS staging.media_tag_temp (
    import_row_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT,
    media_id TEXT,
    tag_id TEXT,
    source_sheet TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_media_tag_temp_batch ON staging.media_tag_temp(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_media_tag_temp_object_key ON staging.media_tag_temp(staging_object_key);

-- meeting_room_equipment -> staging.meeting_room_equipment_temp
CREATE TABLE IF NOT EXISTS staging.meeting_room_equipment_temp (
    import_row_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT,
    room_id TEXT,
    equipment_id TEXT,
    position INTEGER,
    note TEXT,
    source_sheet TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_meeting_room_equipment_temp_batch ON staging.meeting_room_equipment_temp(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_meeting_room_equipment_temp_object_key ON staging.meeting_room_equipment_temp(staging_object_key);

-- object_discount -> staging.object_discount_temp
CREATE TABLE IF NOT EXISTS staging.object_discount_temp (
    import_row_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT,
    conditions TEXT,
    discount_percent NUMERIC(5,2),
    discount_amount NUMERIC(12,2),
    currency TEXT,
    min_group_size INTEGER,
    max_group_size INTEGER,
    valid_from DATE,
    valid_to DATE,
    source TEXT,
    source_sheet TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_object_discount_temp_batch ON staging.object_discount_temp(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_object_discount_temp_object_key ON staging.object_discount_temp(staging_object_key);

-- object_fma_occurrence -> staging.object_fma_occurrence_temp
CREATE TABLE IF NOT EXISTS staging.object_fma_occurrence_temp (
    import_row_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT,
    start_at TIMESTAMPTZ,
    end_at TIMESTAMPTZ,
    state TEXT,
    note TEXT,
    source_sheet TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_object_fma_occurrence_temp_batch ON staging.object_fma_occurrence_temp(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_object_fma_occurrence_temp_object_key ON staging.object_fma_occurrence_temp(staging_object_key);

-- object_group_policy -> staging.object_group_policy_temp
CREATE TABLE IF NOT EXISTS staging.object_group_policy_temp (
    import_row_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT,
    min_size INTEGER,
    max_size INTEGER,
    group_only BOOLEAN,
    notes TEXT,
    source_sheet TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_object_group_policy_temp_batch ON staging.object_group_policy_temp(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_object_group_policy_temp_object_key ON staging.object_group_policy_temp(staging_object_key);

-- object_iti_associated_object -> staging.object_iti_associated_object_temp
CREATE TABLE IF NOT EXISTS staging.object_iti_associated_object_temp (
    import_row_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT,
    associated_object_id TEXT,
    role_id TEXT,
    note TEXT,
    source_sheet TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_object_iti_associated_object_temp_batch ON staging.object_iti_associated_object_temp(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_object_iti_associated_object_temp_object_key ON staging.object_iti_associated_object_temp(staging_object_key);

-- object_iti_info -> staging.object_iti_info_temp
CREATE TABLE IF NOT EXISTS staging.object_iti_info_temp (
    import_row_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT,
    access TEXT,
    ambiance TEXT,
    recommended_parking TEXT,
    required_equipment TEXT,
    info_places TEXT,
    is_child_friendly BOOLEAN,
    access_i18n JSONB NOT NULL DEFAULT '{}'::jsonb,
    ambiance_i18n JSONB NOT NULL DEFAULT '{}'::jsonb,
    recommended_parking_i18n JSONB NOT NULL DEFAULT '{}'::jsonb,
    required_equipment_i18n JSONB NOT NULL DEFAULT '{}'::jsonb,
    info_places_i18n JSONB NOT NULL DEFAULT '{}'::jsonb,
    source_sheet TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_object_iti_info_temp_batch ON staging.object_iti_info_temp(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_object_iti_info_temp_object_key ON staging.object_iti_info_temp(staging_object_key);

-- object_iti_practice -> staging.object_iti_practice_temp
CREATE TABLE IF NOT EXISTS staging.object_iti_practice_temp (
    import_row_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT,
    practice_id TEXT,
    source_sheet TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_object_iti_practice_temp_batch ON staging.object_iti_practice_temp(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_object_iti_practice_temp_object_key ON staging.object_iti_practice_temp(staging_object_key);

-- object_iti_profile -> staging.object_iti_profile_temp
CREATE TABLE IF NOT EXISTS staging.object_iti_profile_temp (
    import_row_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT,
    position_m NUMERIC(10,2),
    elevation_m NUMERIC(8,2),
    source_sheet TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_object_iti_profile_temp_batch ON staging.object_iti_profile_temp(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_object_iti_profile_temp_object_key ON staging.object_iti_profile_temp(staging_object_key);

-- object_iti_section -> staging.object_iti_section_temp
CREATE TABLE IF NOT EXISTS staging.object_iti_section_temp (
    import_row_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT,
    parent_object_id TEXT,
    name TEXT,
    position INTEGER,
    geom TEXT,
    source_sheet TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_object_iti_section_temp_batch ON staging.object_iti_section_temp(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_object_iti_section_temp_object_key ON staging.object_iti_section_temp(staging_object_key);

-- object_iti_stage -> staging.object_iti_stage_temp
CREATE TABLE IF NOT EXISTS staging.object_iti_stage_temp (
    import_row_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT,
    name TEXT,
    description TEXT,
    position INTEGER,
    geom TEXT,
    description_i18n JSONB NOT NULL DEFAULT '{}'::jsonb,
    source_sheet TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_object_iti_stage_temp_batch ON staging.object_iti_stage_temp(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_object_iti_stage_temp_object_key ON staging.object_iti_stage_temp(staging_object_key);

-- object_iti_stage_media -> staging.object_iti_stage_media_temp
CREATE TABLE IF NOT EXISTS staging.object_iti_stage_media_temp (
    import_row_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT,
    stage_id TEXT,
    media_id TEXT,
    position INTEGER,
    source_sheet TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_object_iti_stage_media_temp_batch ON staging.object_iti_stage_media_temp(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_object_iti_stage_media_temp_object_key ON staging.object_iti_stage_media_temp(staging_object_key);

-- object_meeting_room -> staging.object_meeting_room_temp
CREATE TABLE IF NOT EXISTS staging.object_meeting_room_temp (
    import_row_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT,
    name TEXT,
    area_m2 NUMERIC(8,2),
    cap_theatre INTEGER,
    cap_u INTEGER,
    cap_classroom INTEGER,
    cap_boardroom INTEGER,
    source_sheet TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_object_meeting_room_temp_batch ON staging.object_meeting_room_temp(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_object_meeting_room_temp_object_key ON staging.object_meeting_room_temp(staging_object_key);

-- object_menu -> staging.object_menu_temp
CREATE TABLE IF NOT EXISTS staging.object_menu_temp (
    import_row_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT,
    category_id TEXT,
    name TEXT,
    description TEXT,
    is_active BOOLEAN,
    visibility TEXT,
    position INTEGER,
    source_sheet TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_object_menu_temp_batch ON staging.object_menu_temp(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_object_menu_temp_object_key ON staging.object_menu_temp(staging_object_key);

-- object_menu_item -> staging.object_menu_item_temp
CREATE TABLE IF NOT EXISTS staging.object_menu_item_temp (
    import_row_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT,
    menu_id TEXT,
    name TEXT,
    description TEXT,
    price NUMERIC(12,2),
    currency TEXT,
    kind_id TEXT,
    unit_id TEXT,
    media_id TEXT,
    is_available BOOLEAN,
    position INTEGER,
    source_sheet TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_object_menu_item_temp_batch ON staging.object_menu_item_temp(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_object_menu_item_temp_object_key ON staging.object_menu_item_temp(staging_object_key);

-- object_menu_item_allergen -> staging.object_menu_item_allergen_temp
CREATE TABLE IF NOT EXISTS staging.object_menu_item_allergen_temp (
    import_row_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT,
    menu_item_id TEXT,
    allergen_id TEXT,
    source_sheet TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_object_menu_item_allergen_temp_batch ON staging.object_menu_item_allergen_temp(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_object_menu_item_allergen_temp_object_key ON staging.object_menu_item_allergen_temp(staging_object_key);

-- object_menu_item_cuisine_type -> staging.object_menu_item_cuisine_type_temp
CREATE TABLE IF NOT EXISTS staging.object_menu_item_cuisine_type_temp (
    import_row_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT,
    menu_item_id TEXT,
    cuisine_type_id TEXT,
    source_sheet TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_object_menu_item_cuisine_type_temp_batch ON staging.object_menu_item_cuisine_type_temp(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_object_menu_item_cuisine_type_temp_object_key ON staging.object_menu_item_cuisine_type_temp(staging_object_key);

-- object_menu_item_dietary_tag -> staging.object_menu_item_dietary_tag_temp
CREATE TABLE IF NOT EXISTS staging.object_menu_item_dietary_tag_temp (
    import_row_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT,
    menu_item_id TEXT,
    dietary_tag_id TEXT,
    source_sheet TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_object_menu_item_dietary_tag_temp_batch ON staging.object_menu_item_dietary_tag_temp(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_object_menu_item_dietary_tag_temp_object_key ON staging.object_menu_item_dietary_tag_temp(staging_object_key);

-- object_menu_item_media -> staging.object_menu_item_media_temp
CREATE TABLE IF NOT EXISTS staging.object_menu_item_media_temp (
    import_row_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT,
    menu_item_id TEXT,
    media_id TEXT,
    position INTEGER,
    source_sheet TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_object_menu_item_media_temp_batch ON staging.object_menu_item_media_temp(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_object_menu_item_media_temp_object_key ON staging.object_menu_item_media_temp(staging_object_key);

-- object_pet_policy -> staging.object_pet_policy_temp
CREATE TABLE IF NOT EXISTS staging.object_pet_policy_temp (
    import_row_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT,
    accepted BOOLEAN,
    conditions TEXT,
    source_sheet TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_object_pet_policy_temp_batch ON staging.object_pet_policy_temp(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_object_pet_policy_temp_object_key ON staging.object_pet_policy_temp(staging_object_key);

-- object_place -> staging.object_place_temp
CREATE TABLE IF NOT EXISTS staging.object_place_temp (
    import_row_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT,
    label TEXT,
    slug TEXT,
    is_primary BOOLEAN,
    position INTEGER,
    effective_from DATE,
    effective_to DATE,
    extra JSONB NOT NULL DEFAULT '{}'::jsonb,
    source_sheet TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_object_place_temp_batch ON staging.object_place_temp(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_object_place_temp_object_key ON staging.object_place_temp(staging_object_key);

-- object_place_description -> staging.object_place_description_temp
CREATE TABLE IF NOT EXISTS staging.object_place_description_temp (
    import_row_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT,
    place_id TEXT,
    description TEXT,
    description_chapo TEXT,
    description_mobile TEXT,
    description_edition TEXT,
    description_offre_hors_zone TEXT,
    sanitary_measures TEXT,
    description_adapted TEXT,
    visibility TEXT,
    position INTEGER,
    extra JSONB NOT NULL DEFAULT '{}'::jsonb,
    description_chapo_i18n JSONB NOT NULL DEFAULT '{}'::jsonb,
    description_mobile_i18n JSONB NOT NULL DEFAULT '{}'::jsonb,
    description_edition_i18n JSONB NOT NULL DEFAULT '{}'::jsonb,
    description_offre_hors_zone_i18n JSONB NOT NULL DEFAULT '{}'::jsonb,
    sanitary_measures_i18n JSONB NOT NULL DEFAULT '{}'::jsonb,
    description_adapted_i18n JSONB NOT NULL DEFAULT '{}'::jsonb,
    source_sheet TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_object_place_description_temp_batch ON staging.object_place_description_temp(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_object_place_description_temp_object_key ON staging.object_place_description_temp(staging_object_key);

-- object_price_period -> staging.object_price_period_temp
CREATE TABLE IF NOT EXISTS staging.object_price_period_temp (
    import_row_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT,
    price_id TEXT,
    start_date DATE,
    end_date DATE,
    start_time TIME,
    end_time TIME,
    note TEXT,
    source_sheet TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_object_price_period_temp_batch ON staging.object_price_period_temp(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_object_price_period_temp_object_key ON staging.object_price_period_temp(staging_object_key);

-- object_private_description -> staging.object_private_description_temp
CREATE TABLE IF NOT EXISTS staging.object_private_description_temp (
    import_row_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT,
    org_object_id TEXT,
    body TEXT,
    audience TEXT,
    language_id TEXT,
    source_sheet TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_object_private_description_temp_batch ON staging.object_private_description_temp(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_object_private_description_temp_object_key ON staging.object_private_description_temp(staging_object_key);

-- object_relation -> staging.object_relation_temp
CREATE TABLE IF NOT EXISTS staging.object_relation_temp (
    import_row_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT,
    source_object_id TEXT,
    target_object_id TEXT,
    relation_type_id TEXT,
    distance_m NUMERIC(10,2),
    note TEXT,
    position INTEGER,
    source_sheet TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_object_relation_temp_batch ON staging.object_relation_temp(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_object_relation_temp_object_key ON staging.object_relation_temp(staging_object_key);

-- object_room_type_amenity -> staging.object_room_type_amenity_temp
CREATE TABLE IF NOT EXISTS staging.object_room_type_amenity_temp (
    import_row_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT,
    room_type_id TEXT,
    amenity_id TEXT,
    source_sheet TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_object_room_type_amenity_temp_batch ON staging.object_room_type_amenity_temp(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_object_room_type_amenity_temp_object_key ON staging.object_room_type_amenity_temp(staging_object_key);

-- object_room_type_media -> staging.object_room_type_media_temp
CREATE TABLE IF NOT EXISTS staging.object_room_type_media_temp (
    import_row_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT,
    room_type_id TEXT,
    media_id TEXT,
    position INTEGER,
    source_sheet TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_object_room_type_media_temp_batch ON staging.object_room_type_media_temp(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_object_room_type_media_temp_object_key ON staging.object_room_type_media_temp(staging_object_key);

-- object_sustainability_action -> staging.object_sustainability_action_temp
CREATE TABLE IF NOT EXISTS staging.object_sustainability_action_temp (
    import_row_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT,
    action_id TEXT,
    document_id TEXT,
    note TEXT,
    source_sheet TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_object_sustainability_action_temp_batch ON staging.object_sustainability_action_temp(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_object_sustainability_action_temp_object_key ON staging.object_sustainability_action_temp(staging_object_key);

-- object_sustainability_action_label -> staging.object_sustainability_action_label_temp
CREATE TABLE IF NOT EXISTS staging.object_sustainability_action_label_temp (
    import_row_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT,
    object_sustainability_action_id TEXT,
    object_classification_id TEXT,
    source_sheet TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_object_sustainability_action_label_temp_batch ON staging.object_sustainability_action_label_temp(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_object_sustainability_action_label_temp_object_key ON staging.object_sustainability_action_label_temp(staging_object_key);

-- object_version -> staging.object_version_temp
CREATE TABLE IF NOT EXISTS staging.object_version_temp (
    import_row_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT,
    version_number INTEGER,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by TEXT,
    change_reason TEXT,
    change_type TEXT,
    source_sheet TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_object_version_temp_batch ON staging.object_version_temp(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_object_version_temp_object_key ON staging.object_version_temp(staging_object_key);

-- object_zone -> staging.object_zone_temp
CREATE TABLE IF NOT EXISTS staging.object_zone_temp (
    import_row_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT,
    insee_commune TEXT,
    position INTEGER,
    source_sheet TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_object_zone_temp_batch ON staging.object_zone_temp(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_object_zone_temp_object_key ON staging.object_zone_temp(staging_object_key);

-- opening_schedule -> staging.opening_schedule_temp
CREATE TABLE IF NOT EXISTS staging.opening_schedule_temp (
    import_row_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT,
    period_id TEXT,
    schedule_type_id TEXT,
    name TEXT,
    note TEXT,
    note_i18n JSONB NOT NULL DEFAULT '{}'::jsonb,
    source_sheet TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_opening_schedule_temp_batch ON staging.opening_schedule_temp(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_opening_schedule_temp_object_key ON staging.opening_schedule_temp(staging_object_key);

-- opening_time_frame -> staging.opening_time_frame_temp
CREATE TABLE IF NOT EXISTS staging.opening_time_frame_temp (
    import_row_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT,
    time_period_id TIME,
    start_time TIME,
    end_time TIME,
    recurrence TEXT,
    source_sheet TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_opening_time_frame_temp_batch ON staging.opening_time_frame_temp(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_opening_time_frame_temp_object_key ON staging.opening_time_frame_temp(staging_object_key);

-- opening_time_period -> staging.opening_time_period_temp
CREATE TABLE IF NOT EXISTS staging.opening_time_period_temp (
    import_row_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT,
    schedule_id TEXT,
    closed BOOLEAN,
    note TEXT,
    source_sheet TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_opening_time_period_temp_batch ON staging.opening_time_period_temp(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_opening_time_period_temp_object_key ON staging.opening_time_period_temp(staging_object_key);

-- opening_time_period_weekday -> staging.opening_time_period_weekday_temp
CREATE TABLE IF NOT EXISTS staging.opening_time_period_weekday_temp (
    import_row_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT,
    time_period_id TIME,
    weekday_id TEXT,
    source_sheet TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_opening_time_period_weekday_temp_batch ON staging.opening_time_period_weekday_temp(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_opening_time_period_weekday_temp_object_key ON staging.opening_time_period_weekday_temp(staging_object_key);

-- pending_change -> staging.pending_change_temp
CREATE TABLE IF NOT EXISTS staging.pending_change_temp (
    import_row_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT,
    target_table TEXT,
    target_pk TEXT,
    action TEXT,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    submitted_by TEXT,
    submitted_at TIMESTAMPTZ,
    status TEXT,
    reviewed_by TEXT,
    reviewed_at TIMESTAMPTZ,
    review_note TEXT,
    applied_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    source_sheet TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pending_change_temp_batch ON staging.pending_change_temp(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_pending_change_temp_object_key ON staging.pending_change_temp(staging_object_key);

-- promotion -> staging.promotion_temp
CREATE TABLE IF NOT EXISTS staging.promotion_temp (
    import_row_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT,
    code TEXT,
    name TEXT,
    name_i18n JSONB NOT NULL DEFAULT '{}'::jsonb,
    description TEXT,
    description_i18n JSONB NOT NULL DEFAULT '{}'::jsonb,
    type_id TEXT,
    discount_type TEXT,
    discount_value NUMERIC(12,2),
    currency TEXT,
    valid_from TIMESTAMPTZ,
    valid_to TIMESTAMPTZ,
    max_uses INTEGER,
    max_uses_per_user INTEGER,
    current_uses INTEGER,
    min_purchase_amount NUMERIC(12,2),
    applicable_object_types TEXT,
    season_id TEXT,
    partner_org_id TEXT,
    is_active BOOLEAN,
    is_public BOOLEAN,
    created_by TEXT,
    source_sheet TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_promotion_temp_batch ON staging.promotion_temp(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_promotion_temp_object_key ON staging.promotion_temp(staging_object_key);

-- promotion_object -> staging.promotion_object_temp
CREATE TABLE IF NOT EXISTS staging.promotion_object_temp (
    import_row_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT,
    promotion_id TEXT,
    source_sheet TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_promotion_object_temp_batch ON staging.promotion_object_temp(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_promotion_object_temp_object_key ON staging.promotion_object_temp(staging_object_key);

-- promotion_usage -> staging.promotion_usage_temp
CREATE TABLE IF NOT EXISTS staging.promotion_usage_temp (
    import_row_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT,
    promotion_id TEXT,
    user_id TEXT,
    used_at TIMESTAMPTZ,
    amount_saved NUMERIC(12,2),
    currency TEXT,
    source_sheet TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_promotion_usage_temp_batch ON staging.promotion_usage_temp(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_promotion_usage_temp_object_key ON staging.promotion_usage_temp(staging_object_key);

-- publication -> staging.publication_temp
CREATE TABLE IF NOT EXISTS staging.publication_temp (
    import_row_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT,
    code TEXT,
    name TEXT,
    target_audience TEXT,
    year INTEGER,
    status TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by TEXT,
    updated_by TEXT,
    source_sheet TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_publication_temp_batch ON staging.publication_temp(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_publication_temp_object_key ON staging.publication_temp(staging_object_key);

-- publication_object -> staging.publication_object_temp
CREATE TABLE IF NOT EXISTS staging.publication_object_temp (
    import_row_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT,
    publication_id TEXT,
    custom_print_text TEXT,
    workflow_status TEXT,
    page_number INTEGER,
    proof_sent_at TIMESTAMPTZ,
    validated_bat_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by TEXT,
    updated_by TEXT,
    source_sheet TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_publication_object_temp_batch ON staging.publication_object_temp(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_publication_object_temp_object_key ON staging.publication_object_temp(staging_object_key);

-- ref_actor_role -> staging.ref_actor_role_temp
CREATE TABLE IF NOT EXISTS staging.ref_actor_role_temp (
    import_row_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT,
    code TEXT,
    name TEXT,
    description TEXT,
    position INTEGER,
    source_sheet TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ref_actor_role_temp_batch ON staging.ref_actor_role_temp(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_ref_actor_role_temp_object_key ON staging.ref_actor_role_temp(staging_object_key);

-- ref_amenity -> staging.ref_amenity_temp
CREATE TABLE IF NOT EXISTS staging.ref_amenity_temp (
    import_row_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT,
    code TEXT,
    name TEXT,
    family_id TEXT,
    scope TEXT,
    description TEXT,
    icon_url TEXT,
    position INTEGER,
    name_i18n JSONB NOT NULL DEFAULT '{}'::jsonb,
    source_sheet TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ref_amenity_temp_batch ON staging.ref_amenity_temp(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_ref_amenity_temp_object_key ON staging.ref_amenity_temp(staging_object_key);

-- ref_capacity_applicability -> staging.ref_capacity_applicability_temp
CREATE TABLE IF NOT EXISTS staging.ref_capacity_applicability_temp (
    import_row_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT,
    metric_id TEXT,
    object_type TEXT,
    source_sheet TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ref_capacity_applicability_temp_batch ON staging.ref_capacity_applicability_temp(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_ref_capacity_applicability_temp_object_key ON staging.ref_capacity_applicability_temp(staging_object_key);

-- ref_capacity_metric -> staging.ref_capacity_metric_temp
CREATE TABLE IF NOT EXISTS staging.ref_capacity_metric_temp (
    import_row_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT,
    code TEXT,
    name TEXT,
    unit TEXT,
    icon_url TEXT,
    position INTEGER,
    description TEXT,
    source_sheet TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ref_capacity_metric_temp_batch ON staging.ref_capacity_metric_temp(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_ref_capacity_metric_temp_object_key ON staging.ref_capacity_metric_temp(staging_object_key);

-- ref_contact_role -> staging.ref_contact_role_temp
CREATE TABLE IF NOT EXISTS staging.ref_contact_role_temp (
    import_row_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT,
    code TEXT,
    name TEXT,
    description TEXT,
    position INTEGER,
    source_sheet TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ref_contact_role_temp_batch ON staging.ref_contact_role_temp(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_ref_contact_role_temp_object_key ON staging.ref_contact_role_temp(staging_object_key);

-- ref_document -> staging.ref_document_temp
CREATE TABLE IF NOT EXISTS staging.ref_document_temp (
    import_row_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT,
    url TEXT,
    title TEXT,
    issuer TEXT,
    description TEXT,
    icon_url TEXT,
    position INTEGER,
    valid_from DATE,
    valid_to DATE,
    issuer_i18n JSONB NOT NULL DEFAULT '{}'::jsonb,
    description_i18n JSONB NOT NULL DEFAULT '{}'::jsonb,
    source_sheet TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ref_document_temp_batch ON staging.ref_document_temp(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_ref_document_temp_object_key ON staging.ref_document_temp(staging_object_key);

-- ref_iti_assoc_role -> staging.ref_iti_assoc_role_temp
CREATE TABLE IF NOT EXISTS staging.ref_iti_assoc_role_temp (
    import_row_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT,
    code TEXT,
    name TEXT,
    description TEXT,
    position INTEGER,
    source_sheet TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ref_iti_assoc_role_temp_batch ON staging.ref_iti_assoc_role_temp(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_ref_iti_assoc_role_temp_object_key ON staging.ref_iti_assoc_role_temp(staging_object_key);

-- ref_language -> staging.ref_language_temp
CREATE TABLE IF NOT EXISTS staging.ref_language_temp (
    import_row_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT,
    code TEXT,
    name TEXT,
    native_name TEXT,
    icon_url TEXT,
    position INTEGER,
    source_sheet TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ref_language_temp_batch ON staging.ref_language_temp(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_ref_language_temp_object_key ON staging.ref_language_temp(staging_object_key);

-- ref_legal_type -> staging.ref_legal_type_temp
CREATE TABLE IF NOT EXISTS staging.ref_legal_type_temp (
    import_row_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT,
    code TEXT,
    name TEXT,
    description TEXT,
    category TEXT,
    is_required BOOLEAN,
    is_public BOOLEAN,
    review_interval_days INTEGER,
    source_sheet TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ref_legal_type_temp_batch ON staging.ref_legal_type_temp(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_ref_legal_type_temp_object_key ON staging.ref_legal_type_temp(staging_object_key);

-- ref_object_relation_type -> staging.ref_object_relation_type_temp
CREATE TABLE IF NOT EXISTS staging.ref_object_relation_type_temp (
    import_row_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT,
    code TEXT,
    name TEXT,
    description TEXT,
    position INTEGER,
    source_sheet TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ref_object_relation_type_temp_batch ON staging.ref_object_relation_type_temp(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_ref_object_relation_type_temp_object_key ON staging.ref_object_relation_type_temp(staging_object_key);

-- ref_org_role -> staging.ref_org_role_temp
CREATE TABLE IF NOT EXISTS staging.ref_org_role_temp (
    import_row_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT,
    code TEXT,
    name TEXT,
    description TEXT,
    position INTEGER,
    source_sheet TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ref_org_role_temp_batch ON staging.ref_org_role_temp(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_ref_org_role_temp_object_key ON staging.ref_org_role_temp(staging_object_key);

-- ref_review_source -> staging.ref_review_source_temp
CREATE TABLE IF NOT EXISTS staging.ref_review_source_temp (
    import_row_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT,
    code TEXT,
    name TEXT,
    icon_url TEXT,
    base_url TEXT,
    source_sheet TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ref_review_source_temp_batch ON staging.ref_review_source_temp(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_ref_review_source_temp_object_key ON staging.ref_review_source_temp(staging_object_key);

-- ref_sustainability_action -> staging.ref_sustainability_action_temp
CREATE TABLE IF NOT EXISTS staging.ref_sustainability_action_temp (
    import_row_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT,
    category_id TEXT,
    code TEXT,
    label TEXT,
    description TEXT,
    icon_url TEXT,
    position INTEGER,
    label_i18n JSONB NOT NULL DEFAULT '{}'::jsonb,
    description_i18n JSONB NOT NULL DEFAULT '{}'::jsonb,
    source_sheet TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ref_sustainability_action_temp_batch ON staging.ref_sustainability_action_temp(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_ref_sustainability_action_temp_object_key ON staging.ref_sustainability_action_temp(staging_object_key);

-- ref_sustainability_action_category -> staging.ref_sustainability_action_category_temp
CREATE TABLE IF NOT EXISTS staging.ref_sustainability_action_category_temp (
    import_row_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT,
    code TEXT,
    name TEXT,
    description TEXT,
    icon_url TEXT,
    position INTEGER,
    name_i18n JSONB NOT NULL DEFAULT '{}'::jsonb,
    source_sheet TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ref_sustainability_action_category_temp_batch ON staging.ref_sustainability_action_category_temp(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_ref_sustainability_action_category_temp_object_key ON staging.ref_sustainability_action_category_temp(staging_object_key);

-- ref_tag -> staging.ref_tag_temp
CREATE TABLE IF NOT EXISTS staging.ref_tag_temp (
    import_row_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT,
    slug TEXT,
    name TEXT,
    description TEXT,
    color TEXT,
    icon TEXT,
    icon_url TEXT,
    position INTEGER,
    created_by TEXT,
    updated_by TEXT,
    extra JSONB NOT NULL DEFAULT '{}'::jsonb,
    name_normalized TEXT,
    description_normalized TEXT,
    source_sheet TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ref_tag_temp_batch ON staging.ref_tag_temp(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_ref_tag_temp_object_key ON staging.ref_tag_temp(staging_object_key);

-- tag_link -> staging.tag_link_temp
CREATE TABLE IF NOT EXISTS staging.tag_link_temp (
    import_row_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id TEXT NOT NULL REFERENCES staging.import_batches(batch_id) ON DELETE CASCADE,
    staging_object_key TEXT,
    tag_id TEXT,
    target_table TEXT,
    target_pk TEXT,
    created_by TEXT,
    extra JSONB NOT NULL DEFAULT '{}'::jsonb,
    source_sheet TEXT,
    raw_source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status TEXT NOT NULL DEFAULT 'pending',
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tag_link_temp_batch ON staging.tag_link_temp(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_tag_link_temp_object_key ON staging.tag_link_temp(staging_object_key);

-- =====================================================
-- Staging V3 sync: columns mirrored from schema_unified.sql
-- Generated from schema_unified.sql to keep manual mapping complete
-- =====================================================

-- actor -> staging.actor_temp
ALTER TABLE IF EXISTS staging.actor_temp
  ADD COLUMN IF NOT EXISTS id TEXT,
  ADD COLUMN IF NOT EXISTS display_name_normalized TEXT,
  ADD COLUMN IF NOT EXISTS first_name_normalized TEXT,
  ADD COLUMN IF NOT EXISTS last_name_normalized TEXT,
  ADD COLUMN IF NOT EXISTS created_by TEXT,
  ADD COLUMN IF NOT EXISTS updated_by TEXT;

-- actor_channel -> staging.actor_channel_temp
ALTER TABLE IF EXISTS staging.actor_channel_temp
  ADD COLUMN IF NOT EXISTS id TEXT,
  ADD COLUMN IF NOT EXISTS actor_id TEXT,
  ADD COLUMN IF NOT EXISTS kind_id TEXT,
  ADD COLUMN IF NOT EXISTS role_id TEXT,
  ADD COLUMN IF NOT EXISTS position INTEGER,
  ADD COLUMN IF NOT EXISTS extra JSONB;

-- actor_object_role -> staging.actor_object_role_temp
ALTER TABLE IF EXISTS staging.actor_object_role_temp
  ADD COLUMN IF NOT EXISTS actor_id TEXT,
  ADD COLUMN IF NOT EXISTS object_id TEXT,
  ADD COLUMN IF NOT EXISTS role_id TEXT,
  ADD COLUMN IF NOT EXISTS valid_from DATE,
  ADD COLUMN IF NOT EXISTS valid_to DATE,
  ADD COLUMN IF NOT EXISTS visibility TEXT;

-- audit_criteria -> staging.audit_criteria_temp
ALTER TABLE IF EXISTS staging.audit_criteria_temp
  ADD COLUMN IF NOT EXISTS id TEXT;

-- audit_session -> staging.audit_session_temp
ALTER TABLE IF EXISTS staging.audit_session_temp
  ADD COLUMN IF NOT EXISTS id TEXT,
  ADD COLUMN IF NOT EXISTS object_id TEXT;

-- audit_template -> staging.audit_template_temp
ALTER TABLE IF EXISTS staging.audit_template_temp
  ADD COLUMN IF NOT EXISTS id TEXT;

-- audit.audit_log -> staging.audit_audit_log_temp
ALTER TABLE IF EXISTS staging.audit_audit_log_temp
  ADD COLUMN IF NOT EXISTS id TEXT;

-- contact_channel -> staging.contact_channel_temp
ALTER TABLE IF EXISTS staging.contact_channel_temp
  ADD COLUMN IF NOT EXISTS id TEXT,
  ADD COLUMN IF NOT EXISTS object_id TEXT,
  ADD COLUMN IF NOT EXISTS kind_id TEXT,
  ADD COLUMN IF NOT EXISTS role_id TEXT,
  ADD COLUMN IF NOT EXISTS position INTEGER;

-- crm_interaction -> staging.crm_interaction_temp
ALTER TABLE IF EXISTS staging.crm_interaction_temp
  ADD COLUMN IF NOT EXISTS id TEXT,
  ADD COLUMN IF NOT EXISTS object_id TEXT,
  ADD COLUMN IF NOT EXISTS actor_id TEXT,
  ADD COLUMN IF NOT EXISTS due_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS owner TEXT,
  ADD COLUMN IF NOT EXISTS handled_by_actor_id TEXT,
  ADD COLUMN IF NOT EXISTS demand_topic_id TEXT,
  ADD COLUMN IF NOT EXISTS demand_subtopic_id TEXT,
  ADD COLUMN IF NOT EXISTS request_mood_id TEXT,
  ADD COLUMN IF NOT EXISTS response_mood_id TEXT,
  ADD COLUMN IF NOT EXISTS is_actionable BOOLEAN,
  ADD COLUMN IF NOT EXISTS first_response_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS extra JSONB;

-- crm_task -> staging.crm_task_temp
ALTER TABLE IF EXISTS staging.crm_task_temp
  ADD COLUMN IF NOT EXISTS id TEXT,
  ADD COLUMN IF NOT EXISTS object_id TEXT,
  ADD COLUMN IF NOT EXISTS actor_id TEXT,
  ADD COLUMN IF NOT EXISTS owner TEXT,
  ADD COLUMN IF NOT EXISTS related_interaction_id TEXT,
  ADD COLUMN IF NOT EXISTS extra JSONB;

-- i18n_translation -> staging.i18n_translation_temp
ALTER TABLE IF EXISTS staging.i18n_translation_temp
  ADD COLUMN IF NOT EXISTS id TEXT;

-- incident_report -> staging.incident_report_temp
ALTER TABLE IF EXISTS staging.incident_report_temp
  ADD COLUMN IF NOT EXISTS id TEXT,
  ADD COLUMN IF NOT EXISTS object_id TEXT;

-- media -> staging.media_temp
ALTER TABLE IF EXISTS staging.media_temp
  ADD COLUMN IF NOT EXISTS id TEXT,
  ADD COLUMN IF NOT EXISTS object_id TEXT,
  ADD COLUMN IF NOT EXISTS media_type_id TEXT,
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS credit TEXT,
  ADD COLUMN IF NOT EXISTS url TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS analyse_data JSONB,
  ADD COLUMN IF NOT EXISTS width INTEGER,
  ADD COLUMN IF NOT EXISTS height INTEGER,
  ADD COLUMN IF NOT EXISTS is_main BOOLEAN,
  ADD COLUMN IF NOT EXISTS is_published BOOLEAN,
  ADD COLUMN IF NOT EXISTS rights_expires_at DATE,
  ADD COLUMN IF NOT EXISTS visibility TEXT,
  ADD COLUMN IF NOT EXISTS title_normalized TEXT,
  ADD COLUMN IF NOT EXISTS description_normalized TEXT,
  ADD COLUMN IF NOT EXISTS place_id TEXT,
  ADD COLUMN IF NOT EXISTS kind TEXT,
  ADD COLUMN IF NOT EXISTS title_i18n JSONB,
  ADD COLUMN IF NOT EXISTS description_i18n JSONB,
  ADD COLUMN IF NOT EXISTS org_object_id TEXT;

-- object -> staging.object_temp
ALTER TABLE IF EXISTS staging.object_temp
  ADD COLUMN IF NOT EXISTS id TEXT,
  ADD COLUMN IF NOT EXISTS business_timezone TEXT,
  ADD COLUMN IF NOT EXISTS commercial_visibility TEXT,
  ADD COLUMN IF NOT EXISTS region_code TEXT,
  ADD COLUMN IF NOT EXISTS updated_at_source TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS status TEXT,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_editing BOOLEAN,
  ADD COLUMN IF NOT EXISTS created_by TEXT,
  ADD COLUMN IF NOT EXISTS updated_by TEXT,
  ADD COLUMN IF NOT EXISTS name_normalized TEXT,
  ADD COLUMN IF NOT EXISTS name_search_vector TEXT,
  ADD COLUMN IF NOT EXISTS cached_min_price TEXT,
  ADD COLUMN IF NOT EXISTS cached_main_image_url TEXT,
  ADD COLUMN IF NOT EXISTS cached_rating TEXT,
  ADD COLUMN IF NOT EXISTS cached_review_count INTEGER,
  ADD COLUMN IF NOT EXISTS cached_is_open_now BOOLEAN,
  ADD COLUMN IF NOT EXISTS cached_amenity_codes TEXT,
  ADD COLUMN IF NOT EXISTS cached_payment_codes TEXT,
  ADD COLUMN IF NOT EXISTS cached_environment_tags TEXT,
  ADD COLUMN IF NOT EXISTS cached_language_codes TEXT,
  ADD COLUMN IF NOT EXISTS cached_classification_codes TEXT,
  ADD COLUMN IF NOT EXISTS current_version INTEGER,
  ADD COLUMN IF NOT EXISTS extra JSONB,
  ADD COLUMN IF NOT EXISTS name_i18n JSONB;

-- object_amenity -> staging.object_amenity_temp
ALTER TABLE IF EXISTS staging.object_amenity_temp
  ADD COLUMN IF NOT EXISTS object_id TEXT,
  ADD COLUMN IF NOT EXISTS amenity_id TEXT;

-- object_capacity -> staging.object_capacity_temp
ALTER TABLE IF EXISTS staging.object_capacity_temp
  ADD COLUMN IF NOT EXISTS id TEXT,
  ADD COLUMN IF NOT EXISTS object_id TEXT,
  ADD COLUMN IF NOT EXISTS metric_id TEXT;

-- object_classification -> staging.object_classification_temp
ALTER TABLE IF EXISTS staging.object_classification_temp
  ADD COLUMN IF NOT EXISTS id TEXT,
  ADD COLUMN IF NOT EXISTS object_id TEXT,
  ADD COLUMN IF NOT EXISTS scheme_id TEXT,
  ADD COLUMN IF NOT EXISTS value_id TEXT,
  ADD COLUMN IF NOT EXISTS subvalue_ids TEXT,
  ADD COLUMN IF NOT EXISTS document_id TEXT,
  ADD COLUMN IF NOT EXISTS requested_at DATE,
  ADD COLUMN IF NOT EXISTS awarded_at DATE,
  ADD COLUMN IF NOT EXISTS valid_until DATE,
  ADD COLUMN IF NOT EXISTS status TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT,
  ADD COLUMN IF NOT EXISTS note TEXT;

-- object_description -> staging.object_description_temp
ALTER TABLE IF EXISTS staging.object_description_temp
  ADD COLUMN IF NOT EXISTS id TEXT,
  ADD COLUMN IF NOT EXISTS object_id TEXT,
  ADD COLUMN IF NOT EXISTS description_normalized TEXT,
  ADD COLUMN IF NOT EXISTS description_chapo_normalized TEXT,
  ADD COLUMN IF NOT EXISTS description_chapo_i18n JSONB,
  ADD COLUMN IF NOT EXISTS description_mobile_i18n JSONB,
  ADD COLUMN IF NOT EXISTS description_edition_i18n JSONB,
  ADD COLUMN IF NOT EXISTS description_offre_hors_zone_i18n JSONB,
  ADD COLUMN IF NOT EXISTS sanitary_measures_i18n JSONB,
  ADD COLUMN IF NOT EXISTS description_adapted TEXT,
  ADD COLUMN IF NOT EXISTS description_adapted_i18n JSONB,
  ADD COLUMN IF NOT EXISTS extra JSONB;

-- object_discount -> staging.object_discount_temp
ALTER TABLE IF EXISTS staging.object_discount_temp
  ADD COLUMN IF NOT EXISTS id TEXT,
  ADD COLUMN IF NOT EXISTS object_id TEXT;

-- object_environment_tag -> staging.object_environment_tag_temp
ALTER TABLE IF EXISTS staging.object_environment_tag_temp
  ADD COLUMN IF NOT EXISTS object_id TEXT,
  ADD COLUMN IF NOT EXISTS environment_tag_id TEXT;

-- object_external_id -> staging.object_external_id_temp
ALTER TABLE IF EXISTS staging.object_external_id_temp
  ADD COLUMN IF NOT EXISTS id TEXT,
  ADD COLUMN IF NOT EXISTS object_id TEXT,
  ADD COLUMN IF NOT EXISTS source_system TEXT;

-- object_fma -> staging.object_fma_temp
ALTER TABLE IF EXISTS staging.object_fma_temp
  ADD COLUMN IF NOT EXISTS object_id TEXT;

-- object_fma_occurrence -> staging.object_fma_occurrence_temp
ALTER TABLE IF EXISTS staging.object_fma_occurrence_temp
  ADD COLUMN IF NOT EXISTS id TEXT,
  ADD COLUMN IF NOT EXISTS object_id TEXT;

-- object_group_policy -> staging.object_group_policy_temp
ALTER TABLE IF EXISTS staging.object_group_policy_temp
  ADD COLUMN IF NOT EXISTS object_id TEXT;

-- object_iti -> staging.object_iti_temp
ALTER TABLE IF EXISTS staging.object_iti_temp
  ADD COLUMN IF NOT EXISTS object_id TEXT,
  ADD COLUMN IF NOT EXISTS geom TEXT,
  ADD COLUMN IF NOT EXISTS cached_gpx TEXT,
  ADD COLUMN IF NOT EXISTS cached_kml TEXT,
  ADD COLUMN IF NOT EXISTS cached_gpx_generated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS open_status TEXT,
  ADD COLUMN IF NOT EXISTS status_note TEXT,
  ADD COLUMN IF NOT EXISTS status_document_id TEXT,
  ADD COLUMN IF NOT EXISTS status_updated_at TIMESTAMPTZ;

-- object_iti_associated_object -> staging.object_iti_associated_object_temp
ALTER TABLE IF EXISTS staging.object_iti_associated_object_temp
  ADD COLUMN IF NOT EXISTS object_id TEXT;

-- object_iti_info -> staging.object_iti_info_temp
ALTER TABLE IF EXISTS staging.object_iti_info_temp
  ADD COLUMN IF NOT EXISTS object_id TEXT;

-- object_iti_practice -> staging.object_iti_practice_temp
ALTER TABLE IF EXISTS staging.object_iti_practice_temp
  ADD COLUMN IF NOT EXISTS object_id TEXT;

-- object_iti_profile -> staging.object_iti_profile_temp
ALTER TABLE IF EXISTS staging.object_iti_profile_temp
  ADD COLUMN IF NOT EXISTS object_id TEXT,
  ADD COLUMN IF NOT EXISTS id TEXT;

-- object_iti_section -> staging.object_iti_section_temp
ALTER TABLE IF EXISTS staging.object_iti_section_temp
  ADD COLUMN IF NOT EXISTS id TEXT,
  ADD COLUMN IF NOT EXISTS name_i18n JSONB,
  ADD COLUMN IF NOT EXISTS extra JSONB;

-- object_iti_stage -> staging.object_iti_stage_temp
ALTER TABLE IF EXISTS staging.object_iti_stage_temp
  ADD COLUMN IF NOT EXISTS id TEXT,
  ADD COLUMN IF NOT EXISTS object_id TEXT,
  ADD COLUMN IF NOT EXISTS name_i18n JSONB,
  ADD COLUMN IF NOT EXISTS extra JSONB;

-- object_iti_stage_media -> staging.object_iti_stage_media_temp
ALTER TABLE IF EXISTS staging.object_iti_stage_media_temp
  ADD COLUMN IF NOT EXISTS id TEXT;

-- object_language -> staging.object_language_temp
ALTER TABLE IF EXISTS staging.object_language_temp
  ADD COLUMN IF NOT EXISTS object_id TEXT,
  ADD COLUMN IF NOT EXISTS language_id TEXT,
  ADD COLUMN IF NOT EXISTS level_id TEXT,
  ADD COLUMN IF NOT EXISTS extra JSONB;

-- object_legal -> staging.object_legal_temp
ALTER TABLE IF EXISTS staging.object_legal_temp
  ADD COLUMN IF NOT EXISTS id TEXT,
  ADD COLUMN IF NOT EXISTS object_id TEXT,
  ADD COLUMN IF NOT EXISTS type_id TEXT,
  ADD COLUMN IF NOT EXISTS document_id TEXT,
  ADD COLUMN IF NOT EXISTS validity_mode TEXT,
  ADD COLUMN IF NOT EXISTS document_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS document_delivered_at TIMESTAMPTZ;

-- object_location -> staging.object_location_temp
ALTER TABLE IF EXISTS staging.object_location_temp
  ADD COLUMN IF NOT EXISTS id TEXT,
  ADD COLUMN IF NOT EXISTS object_id TEXT,
  ADD COLUMN IF NOT EXISTS place_id TEXT,
  ADD COLUMN IF NOT EXISTS address1_suite TEXT,
  ADD COLUMN IF NOT EXISTS address2 TEXT,
  ADD COLUMN IF NOT EXISTS address3 TEXT,
  ADD COLUMN IF NOT EXISTS code_insee TEXT,
  ADD COLUMN IF NOT EXISTS lieu_dit TEXT,
  ADD COLUMN IF NOT EXISTS direction TEXT,
  ADD COLUMN IF NOT EXISTS altitude_m INTEGER,
  ADD COLUMN IF NOT EXISTS position INTEGER,
  ADD COLUMN IF NOT EXISTS geog2 TEXT,
  ADD COLUMN IF NOT EXISTS city_search_vector TEXT;

-- object_meeting_room -> staging.object_meeting_room_temp
ALTER TABLE IF EXISTS staging.object_meeting_room_temp
  ADD COLUMN IF NOT EXISTS id TEXT,
  ADD COLUMN IF NOT EXISTS object_id TEXT,
  ADD COLUMN IF NOT EXISTS name_i18n JSONB,
  ADD COLUMN IF NOT EXISTS extra JSONB;

-- object_membership -> staging.object_membership_temp
ALTER TABLE IF EXISTS staging.object_membership_temp
  ADD COLUMN IF NOT EXISTS id TEXT,
  ADD COLUMN IF NOT EXISTS org_object_id TEXT,
  ADD COLUMN IF NOT EXISTS object_id TEXT,
  ADD COLUMN IF NOT EXISTS campaign_id TEXT,
  ADD COLUMN IF NOT EXISTS tier_id TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB,
  ADD COLUMN IF NOT EXISTS created_by TEXT,
  ADD COLUMN IF NOT EXISTS updated_by TEXT;

-- object_menu -> staging.object_menu_temp
ALTER TABLE IF EXISTS staging.object_menu_temp
  ADD COLUMN IF NOT EXISTS id TEXT,
  ADD COLUMN IF NOT EXISTS object_id TEXT;

-- object_menu_item -> staging.object_menu_item_temp
ALTER TABLE IF EXISTS staging.object_menu_item_temp
  ADD COLUMN IF NOT EXISTS id TEXT;

-- object_org_link -> staging.object_org_link_temp
ALTER TABLE IF EXISTS staging.object_org_link_temp
  ADD COLUMN IF NOT EXISTS object_id TEXT,
  ADD COLUMN IF NOT EXISTS org_object_id TEXT,
  ADD COLUMN IF NOT EXISTS role_id TEXT;

-- object_origin -> staging.object_origin_temp
ALTER TABLE IF EXISTS staging.object_origin_temp
  ADD COLUMN IF NOT EXISTS object_id TEXT,
  ADD COLUMN IF NOT EXISTS first_imported_at TIMESTAMPTZ;

-- object_payment_method -> staging.object_payment_method_temp
ALTER TABLE IF EXISTS staging.object_payment_method_temp
  ADD COLUMN IF NOT EXISTS object_id TEXT,
  ADD COLUMN IF NOT EXISTS payment_method_id TEXT;

-- object_pet_policy -> staging.object_pet_policy_temp
ALTER TABLE IF EXISTS staging.object_pet_policy_temp
  ADD COLUMN IF NOT EXISTS object_id TEXT;

-- object_place -> staging.object_place_temp
ALTER TABLE IF EXISTS staging.object_place_temp
  ADD COLUMN IF NOT EXISTS id TEXT,
  ADD COLUMN IF NOT EXISTS object_id TEXT;

-- object_place_description -> staging.object_place_description_temp
ALTER TABLE IF EXISTS staging.object_place_description_temp
  ADD COLUMN IF NOT EXISTS id TEXT,
  ADD COLUMN IF NOT EXISTS description_i18n JSONB;

-- object_price -> staging.object_price_temp
ALTER TABLE IF EXISTS staging.object_price_temp
  ADD COLUMN IF NOT EXISTS id TEXT,
  ADD COLUMN IF NOT EXISTS object_id TEXT,
  ADD COLUMN IF NOT EXISTS kind_id TEXT,
  ADD COLUMN IF NOT EXISTS unit_id TEXT,
  ADD COLUMN IF NOT EXISTS season_code TEXT,
  ADD COLUMN IF NOT EXISTS indication_code TEXT,
  ADD COLUMN IF NOT EXISTS age_min_enfant SMALLINT,
  ADD COLUMN IF NOT EXISTS age_max_enfant SMALLINT,
  ADD COLUMN IF NOT EXISTS age_min_junior SMALLINT,
  ADD COLUMN IF NOT EXISTS age_max_junior SMALLINT,
  ADD COLUMN IF NOT EXISTS source TEXT;

-- object_price_period -> staging.object_price_period_temp
ALTER TABLE IF EXISTS staging.object_price_period_temp
  ADD COLUMN IF NOT EXISTS id TEXT;

-- object_private_description -> staging.object_private_description_temp
ALTER TABLE IF EXISTS staging.object_private_description_temp
  ADD COLUMN IF NOT EXISTS id TEXT,
  ADD COLUMN IF NOT EXISTS object_id TEXT;

-- object_relation -> staging.object_relation_temp
ALTER TABLE IF EXISTS staging.object_relation_temp
  ADD COLUMN IF NOT EXISTS id TEXT;

-- object_review -> staging.object_review_temp
ALTER TABLE IF EXISTS staging.object_review_temp
  ADD COLUMN IF NOT EXISTS id TEXT,
  ADD COLUMN IF NOT EXISTS object_id TEXT,
  ADD COLUMN IF NOT EXISTS source_id TEXT,
  ADD COLUMN IF NOT EXISTS author_avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS visit_date DATE,
  ADD COLUMN IF NOT EXISTS language_id TEXT,
  ADD COLUMN IF NOT EXISTS helpful_count INTEGER,
  ADD COLUMN IF NOT EXISTS response TEXT,
  ADD COLUMN IF NOT EXISTS response_date DATE,
  ADD COLUMN IF NOT EXISTS is_published BOOLEAN,
  ADD COLUMN IF NOT EXISTS imported_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS raw_data JSONB;

-- object_room_type -> staging.object_room_type_temp
ALTER TABLE IF EXISTS staging.object_room_type_temp
  ADD COLUMN IF NOT EXISTS id TEXT,
  ADD COLUMN IF NOT EXISTS object_id TEXT,
  ADD COLUMN IF NOT EXISTS name_i18n JSONB,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS description_i18n JSONB,
  ADD COLUMN IF NOT EXISTS bed_config_i18n JSONB,
  ADD COLUMN IF NOT EXISTS floor_level INTEGER,
  ADD COLUMN IF NOT EXISTS view_type_id TEXT,
  ADD COLUMN IF NOT EXISTS is_published BOOLEAN,
  ADD COLUMN IF NOT EXISTS position INTEGER,
  ADD COLUMN IF NOT EXISTS extra JSONB;

-- object_sustainability_action -> staging.object_sustainability_action_temp
ALTER TABLE IF EXISTS staging.object_sustainability_action_temp
  ADD COLUMN IF NOT EXISTS id TEXT,
  ADD COLUMN IF NOT EXISTS object_id TEXT;

-- object_version -> staging.object_version_temp
ALTER TABLE IF EXISTS staging.object_version_temp
  ADD COLUMN IF NOT EXISTS id TEXT,
  ADD COLUMN IF NOT EXISTS object_id TEXT;

-- object_zone -> staging.object_zone_temp
ALTER TABLE IF EXISTS staging.object_zone_temp
  ADD COLUMN IF NOT EXISTS id TEXT,
  ADD COLUMN IF NOT EXISTS object_id TEXT;

-- opening_period -> staging.opening_period_temp
ALTER TABLE IF EXISTS staging.opening_period_temp
  ADD COLUMN IF NOT EXISTS id TEXT,
  ADD COLUMN IF NOT EXISTS object_id TEXT,
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS source_period_id TEXT,
  ADD COLUMN IF NOT EXISTS all_years BOOLEAN,
  ADD COLUMN IF NOT EXISTS name_i18n JSONB,
  ADD COLUMN IF NOT EXISTS extra JSONB;

-- opening_schedule -> staging.opening_schedule_temp
ALTER TABLE IF EXISTS staging.opening_schedule_temp
  ADD COLUMN IF NOT EXISTS id TEXT,
  ADD COLUMN IF NOT EXISTS name_i18n JSONB,
  ADD COLUMN IF NOT EXISTS extra JSONB;

-- opening_time_frame -> staging.opening_time_frame_temp
ALTER TABLE IF EXISTS staging.opening_time_frame_temp
  ADD COLUMN IF NOT EXISTS id TEXT;

-- opening_time_period -> staging.opening_time_period_temp
ALTER TABLE IF EXISTS staging.opening_time_period_temp
  ADD COLUMN IF NOT EXISTS id TEXT;

-- pending_change -> staging.pending_change_temp
ALTER TABLE IF EXISTS staging.pending_change_temp
  ADD COLUMN IF NOT EXISTS id TEXT,
  ADD COLUMN IF NOT EXISTS object_id TEXT;

-- promotion -> staging.promotion_temp
ALTER TABLE IF EXISTS staging.promotion_temp
  ADD COLUMN IF NOT EXISTS id TEXT;

-- promotion_object -> staging.promotion_object_temp
ALTER TABLE IF EXISTS staging.promotion_object_temp
  ADD COLUMN IF NOT EXISTS object_id TEXT;

-- promotion_usage -> staging.promotion_usage_temp
ALTER TABLE IF EXISTS staging.promotion_usage_temp
  ADD COLUMN IF NOT EXISTS id TEXT,
  ADD COLUMN IF NOT EXISTS object_id TEXT;

-- publication -> staging.publication_temp
ALTER TABLE IF EXISTS staging.publication_temp
  ADD COLUMN IF NOT EXISTS id TEXT;

-- publication_object -> staging.publication_object_temp
ALTER TABLE IF EXISTS staging.publication_object_temp
  ADD COLUMN IF NOT EXISTS object_id TEXT;

-- ref_actor_role -> staging.ref_actor_role_temp
ALTER TABLE IF EXISTS staging.ref_actor_role_temp
  ADD COLUMN IF NOT EXISTS id TEXT;

-- ref_amenity -> staging.ref_amenity_temp
ALTER TABLE IF EXISTS staging.ref_amenity_temp
  ADD COLUMN IF NOT EXISTS id TEXT,
  ADD COLUMN IF NOT EXISTS description_i18n JSONB,
  ADD COLUMN IF NOT EXISTS extra JSONB;

-- ref_capacity_metric -> staging.ref_capacity_metric_temp
ALTER TABLE IF EXISTS staging.ref_capacity_metric_temp
  ADD COLUMN IF NOT EXISTS id TEXT;

-- ref_classification_scheme -> staging.ref_classification_scheme_temp
ALTER TABLE IF EXISTS staging.ref_classification_scheme_temp
  ADD COLUMN IF NOT EXISTS id TEXT,
  ADD COLUMN IF NOT EXISTS code TEXT,
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS icon_url TEXT,
  ADD COLUMN IF NOT EXISTS position INTEGER,
  ADD COLUMN IF NOT EXISTS name_i18n JSONB;

-- ref_classification_value -> staging.ref_classification_value_temp
ALTER TABLE IF EXISTS staging.ref_classification_value_temp
  ADD COLUMN IF NOT EXISTS id TEXT,
  ADD COLUMN IF NOT EXISTS scheme_id TEXT,
  ADD COLUMN IF NOT EXISTS code TEXT,
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS ordinal INTEGER,
  ADD COLUMN IF NOT EXISTS parent_id TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB,
  ADD COLUMN IF NOT EXISTS icon_url TEXT,
  ADD COLUMN IF NOT EXISTS position INTEGER,
  ADD COLUMN IF NOT EXISTS name_i18n JSONB;

-- ref_code -> staging.ref_code_temp
ALTER TABLE IF EXISTS staging.ref_code_temp
  ADD COLUMN IF NOT EXISTS id TEXT,
  ADD COLUMN IF NOT EXISTS position INTEGER,
  ADD COLUMN IF NOT EXISTS icon_url TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN,
  ADD COLUMN IF NOT EXISTS valid_from DATE,
  ADD COLUMN IF NOT EXISTS valid_to DATE,
  ADD COLUMN IF NOT EXISTS parent_id TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB,
  ADD COLUMN IF NOT EXISTS name_i18n JSONB,
  ADD COLUMN IF NOT EXISTS description_i18n JSONB,
  ADD COLUMN IF NOT EXISTS name_normalized TEXT,
  ADD COLUMN IF NOT EXISTS dow_number SMALLINT;

-- ref_contact_role -> staging.ref_contact_role_temp
ALTER TABLE IF EXISTS staging.ref_contact_role_temp
  ADD COLUMN IF NOT EXISTS id TEXT;

-- ref_document -> staging.ref_document_temp
ALTER TABLE IF EXISTS staging.ref_document_temp
  ADD COLUMN IF NOT EXISTS id TEXT,
  ADD COLUMN IF NOT EXISTS title_i18n JSONB,
  ADD COLUMN IF NOT EXISTS extra JSONB;

-- ref_iti_assoc_role -> staging.ref_iti_assoc_role_temp
ALTER TABLE IF EXISTS staging.ref_iti_assoc_role_temp
  ADD COLUMN IF NOT EXISTS id TEXT;

-- ref_language -> staging.ref_language_temp
ALTER TABLE IF EXISTS staging.ref_language_temp
  ADD COLUMN IF NOT EXISTS id TEXT;

-- ref_legal_type -> staging.ref_legal_type_temp
ALTER TABLE IF EXISTS staging.ref_legal_type_temp
  ADD COLUMN IF NOT EXISTS id TEXT;

-- ref_object_relation_type -> staging.ref_object_relation_type_temp
ALTER TABLE IF EXISTS staging.ref_object_relation_type_temp
  ADD COLUMN IF NOT EXISTS id TEXT;

-- ref_org_role -> staging.ref_org_role_temp
ALTER TABLE IF EXISTS staging.ref_org_role_temp
  ADD COLUMN IF NOT EXISTS id TEXT;

-- ref_review_source -> staging.ref_review_source_temp
ALTER TABLE IF EXISTS staging.ref_review_source_temp
  ADD COLUMN IF NOT EXISTS id TEXT;

-- ref_sustainability_action -> staging.ref_sustainability_action_temp
ALTER TABLE IF EXISTS staging.ref_sustainability_action_temp
  ADD COLUMN IF NOT EXISTS id TEXT,
  ADD COLUMN IF NOT EXISTS extra JSONB;

-- ref_sustainability_action_category -> staging.ref_sustainability_action_category_temp
ALTER TABLE IF EXISTS staging.ref_sustainability_action_category_temp
  ADD COLUMN IF NOT EXISTS id TEXT,
  ADD COLUMN IF NOT EXISTS description_i18n JSONB,
  ADD COLUMN IF NOT EXISTS extra JSONB;

-- ref_tag -> staging.ref_tag_temp
ALTER TABLE IF EXISTS staging.ref_tag_temp
  ADD COLUMN IF NOT EXISTS id TEXT;

-- tag_link -> staging.tag_link_temp
ALTER TABLE IF EXISTS staging.tag_link_temp
  ADD COLUMN IF NOT EXISTS id TEXT;


