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

