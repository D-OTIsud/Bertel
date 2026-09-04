# Surface coverage — every authorable table vs. a consumer RPC

_The §101/§103 invariant: any **authorable** object-attached table MUST be emitted by a consumer RPC (a getter), not reachable only by direct PostgREST. This checks each object-attached table for a detected `reads` edge from an api/internal/public function. `object_version_*` partitions are rolled up to `object_version`; system ledgers (promotion/publication/audit/org/CRM-workflow rows written by their own subsystem, not authored per-object in the editor) are reported separately._

> ⚠️ **Reads are regex-inferred — false negatives exist** (e.g. `save_object_places` writes `object_zone` but the edge wasn't detected). A table flagged ‘no consumer detected’ is a **candidate** gap to verify in the function body or live, not a proven one. Confirmed exposure gaps belong in the decision log (§101/§103).

## Summary
- authorable object-attached tables: **67** — emitted by a detected consumer read: **65** — candidate gaps: **2**
- system-ledger object-attached tables (out of §101 scope): **9** (`audit_session`, `incident_report`, `org_config`, `org_permission`, `pending_change`, `promotion_object`, `promotion_usage`, `publication_object`, `user_org_membership`)

## Candidate authorable gaps (verify before trusting)

- **object-core**: `object_hotel_positioning`
- **other**: `trail_object_link`

## Covered authorable tables

- `actor_object_role` ← `current_user_crm_actor_ids`, `current_user_extended_object_ids`, `export_actor_capabilities`, `export_actor_contacts`, `get_actor_data`, `get_object_resource` …
- `contact_channel` ← `get_object_jsonld`, `get_object_resource`, `get_object_resource_adapted`, `get_objects_with_deep_data`, `get_organization_data`, `interop_object_core` …
- `crm_interaction` ← `capture_metric_snapshots`, `current_user_crm_actor_ids`, `delete_crm_interaction`, `get_dashboard_crm_activity`, `get_dashboard_crm_open`, `list_actor_crm` …
- `crm_task` ← `claim_unmailed_notifications`, `crm_backfill_assignees_from_owner`, `get_dashboard_crm_open`, `list_crm_tasks`, `list_my_notifications`, `list_object_crm` …
- `media` ← `commit_staging_to_public`, `export_publication_indesign`, `get_filtered_object_ids`, `get_media_for_web`, `get_object_resource`, `get_object_room_types` …
- `meeting_room_equipment` ← `get_filtered_object_ids`, `get_object_resource`
- `object_accommodation_unit_type` ← `get_filtered_object_ids`
- `object_act` ← `get_object_resource`, `seed_test_facets`
- `object_amenity` ← `capture_metric_snapshots`, `get_filtered_object_ids`, `get_object_badges_compact`, `get_object_cards_batch`, `get_object_resource`, `get_object_resource_adapted` …
- `object_capacity` ← `get_filtered_object_ids`, `get_object_resource`, `save_object_commercial`
- `object_classification` ← `capture_metric_snapshots`, `commit_staging_to_public`, `enforce_classification_single_selection`, `get_dashboard_distinction_overview`, `get_dashboard_scorecards`, `get_filtered_object_ids` …
- `object_cuisine_type` ← `get_object_resource`, `refresh_object_filter_caches`
- `object_description` ← `export_itinerary_gpx`, `export_publication_indesign`, `get_object_card`, `get_object_cards_batch`, `get_object_i18n_all`, `get_object_jsonld` …
- `object_discount` ← `get_object_resource`, `save_object_commercial`
- `object_document` ← `get_object_resource`, `rpc_delete_object`
- `object_environment_tag` ← `get_object_cards_batch`, `get_object_environment_tags_compact`, `get_object_resource`, `refresh_object_filter_caches`, `save_object_commercial`
- `object_external_id` ← `get_object_resource`, `rpc_delete_object_external_id`
- `object_fma` ← `get_filtered_object_ids`, `get_object_resource`, `seed_test_facets`
- `object_fma_occurrence` ← `get_object_resource`, `seed_test_facets`
- `object_group_policy` ← `get_object_resource`, `save_object_commercial`
- `object_iti` ← `build_iti_track`, `export_itinerary_gpx`, `get_filtered_object_ids`, `get_itinerary_track_geojson`, `get_itinerary_track_simplified`, `get_object_resource` …
- `object_iti_associated_object` ← `get_object_resource`, `save_object_itinerary_nested`
- `object_iti_info` ← `get_object_resource`, `save_object_itinerary_nested`, `seed_test_facets`
- `object_iti_practice` ← `get_filtered_object_ids`, `get_object_resource`, `seed_test_facets`
- `object_iti_profile` ← `get_object_resource`, `save_object_itinerary_nested`, `seed_test_facets`, `set_itinerary_track`
- `object_iti_section` ← `get_object_resource`, `save_object_itinerary_nested`
- `object_iti_stage` ← `build_iti_track`, `export_itinerary_gpx`, `get_itinerary_track_geojson`, `get_object_resource`, `save_object_itinerary_nested`, `seed_test_facets`
- `object_iti_stage_media` ← `get_object_resource`
- `object_language` ← `get_object_resource`, `refresh_object_filter_caches`, `save_object_commercial`
- `object_legal` ← `audit_legal_compliance`, `check_object_legal_compliance`, `get_expiring_legal_records`, `get_object_legal_compliance`, `get_object_legal_data`, `get_object_legal_records` …
- `object_list` ← `delete_list`, `get_list`, `get_public_list_by_token`, `list_effective_object_ids`, `list_my_lists`, `list_selection_emails` …
- `object_list_item` ← `list_effective_object_ids`, `list_selection_emails`, `set_list_items`
- `object_location` ← `capture_metric_snapshots`, `export_publication_indesign`, `get_dashboard_city_distribution`, `get_dashboard_city_options`, `get_dashboard_filter_options`, `get_dashboard_lieu_dit_options` …
- `object_meeting_room` ← `get_filtered_object_ids`, `get_object_resource`, `seed_test_facets`
- `object_membership` ← `get_object_resource`, `handle_membership_status_transition`
- `object_menu` ← `get_object_resource`, `refresh_object_filter_caches`, `search_events_by_restaurant_cuisine`, `search_restaurants_by_cuisine`, `seed_test_facets`, `trg_refresh_caches_from_menu_item_link` …
- `object_menu_item` ← `get_object_resource`, `refresh_object_filter_caches`, `search_events_by_restaurant_cuisine`, `search_restaurants_by_cuisine`, `seed_test_facets`, `trg_refresh_caches_from_menu_item_link`
- `object_menu_item_allergen` ← `get_object_resource`, `refresh_object_filter_caches`
- `object_menu_item_cuisine_type` ← `get_object_resource`, `search_events_by_restaurant_cuisine`, `search_restaurants_by_cuisine`
- `object_menu_item_dietary_tag` ← `get_object_resource`, `refresh_object_filter_caches`
- `object_menu_item_media` ← `get_object_resource`
- `object_org_link` ← `auto_attach_object_to_creator_org`, `current_user_crm_object_ids`, `current_user_extended_object_ids`, `export_actor_contacts`, `get_object_i18n_all`, `get_object_resource` …
- `object_origin` ← `get_object_resource`
- `object_payment_method` ← `get_object_resource`, `refresh_object_filter_caches`, `save_object_commercial`
- `object_pet_policy` ← `get_filtered_object_ids`, `get_object_resource`, `save_object_commercial`
- `object_place` ← `get_object_resource`, `rpc_delete_object`, `save_object_itinerary_nested`, `save_object_places`
- `object_place_description` ← `get_object_resource`
- `object_price` ← `get_object_resource`, `save_object_commercial`, `seed_test_corpus`, `update_object_cached_min_price`
- `object_private_description` ← `can_delete_object_private_note`, `can_manage_object_private_note`, `get_object_resource`, `object_private_note_author_admin_rank`
- `object_relation` ← `get_object_resource`, `get_objects_with_deep_data`, `get_parent_object_data`, `save_object_relations`, `search_events_by_restaurant_cuisine`
- `object_review` ← `get_object_reviews`, `rpc_gdpr_erase_subject`, `update_object_cached_rating_metrics`
- `object_room_type` ← `get_object_resource`, `get_object_room_types`, `seed_test_facets`
- `object_room_type_amenity` ← `get_object_resource`, `get_object_room_types`
- `object_room_type_bed` ← `get_object_resource`
- `object_room_type_media` ← `get_object_resource`, `get_object_room_types`
- `object_stay_policy` ← `get_object_resource`
- `object_sustainability_action` ← `capture_metric_snapshots`, `get_filtered_object_ids`, `get_object_badges_compact`, `get_object_cards_batch`, `get_object_resource`, `rpc_delete_object` …
- `object_taxonomy` ← `get_object_cards_batch`, `get_object_interop`, `get_object_resource`, `get_object_taxonomy_compact`, `refresh_object_filter_caches`, `refresh_object_taxonomy_cache_for_domain`
- `object_version` ← `get_dashboard_team_activity`, `get_object_version_snapshot`, `get_object_versions`, `rpc_restore_object_version`
- `object_web_channel` ← `get_object_jsonld`, `get_object_resource`, `interop_object_core`
- `object_zone` ← `get_object_resource`, `save_object_places`
- `opening_period` ← `build_opening_period_json`, `compute_open_status`, `get_object_resource`, `is_object_open_now`, `save_object_openings`, `seed_test_corpus`
- `org_branding_settings` ← `get_app_branding`, `get_org_branding`, `upsert_org_branding`
- `promotion` ← `get_object_resource`, `validate_promotion_code`
- `ref_trail_manager` ← `get_public_trail`, `get_trail`, `list_public_trails`, `list_trails`, `trail_sync_apply`
