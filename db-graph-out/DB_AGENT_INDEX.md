# Database knowledge graph — index

Generated locally with the existing `tools/db-graph` build/render modules and
tbls JSON datasource. See the design spec.

## Counts
- tables: 418 · views: 15 · functions: 626 · policies: 642 · triggers: 1432 · enums: 9 · edges: 6265

## Provenance du catalogue — ledger 192

Catalogue réel de production PostgreSQL 17.6, extrait par le connecteur Supabase
existant, uniquement avec des SELECT. Fenêtre de capture : **2026-11-06
20:23:04–20:31:56 UTC**. Les 18 pages ont été assemblées à partir de 83 chunks
contrôlés ; deux exports complémentaires totalisent 125 chunks. Longueurs en
caractères et octets UTF-8, MD5, SHA256, pagination, identités et comptes ont été
réconciliés avant le rendu local. Aucun ancien catalogue ou schéma de fixture
n'a servi d'entrée.

Le fingerprint logique du catalogue est identique avant/après :
`61e1c37d18d01e1ac30fee0bc8987968`, avec le même contexte de déparsing.
Il couvre les relations, dont les flags `rls` et `force_rls` des 433 identités,
ainsi que les colonnes, contraintes, index, triggers, fonctions, policies, enums,
schémas et héritages ; les statistiques physiques sont exclues.
Cette capture paginée **n'est pas un snapshot transactionnel unique**.

Le périmètre relationnel complet compte **433 relations, 5 516 colonnes,
1 829 contraintes, 884 FK, 1 422 index et 1 432 triggers**. Le JSON tbls contient
1 727 fonctions et 21 enums ; le supplément utilisé par le graphe conserve le
périmètre applicatif de l'outil : 626 fonctions, 642 policies et 9 enums.
Les contrôles ciblés avant/après trouvent **192 reçus de migration**, dont
`20261106200353`. Le postflight ciblé de **20:05 UTC** avait observé cette version
réelle ; son numéro ne constitue pas une mesure indépendante de l'heure d'application.
Le [DO appliqué exact](../supabase/migrations/20261106200353_distributed_ai_request_admission.sql)
reste distinct du
[source fraîche canonique](<../Base de donnée DLL et API/ai_request_admission.sql>).
Le reçu initial `20261106145451` est absent ; aucun SQL n'a été rejoué pour
ce rafraîchissement. [AI_REQUEST_ADMISSION.md](AI_REQUEST_ADMISSION.md) décrit les
métadonnées physiques et ACL observées, sans nouvelle qualification d'exécution.

Les valeurs documentées proviennent exclusivement de **3 174 lignes fraîches de
28 tables de références globales explicitement autorisées**, y compris les
tables réellement interrogées mais vides. Elles comprennent **246 documents
avec `access_scope = 'public'`**, sur 1 975 documents comptés sans exporter les
autres valeurs. Les valeurs `ref_tag`, de portée globale non établie, sont
omises ; aucune ligne `tag_link`, objet, liste, tâche ou quota n'est lue. Aucun
seed SQL ni ancien cache ne complète ce périmètre.

Deux normalisations locales sont explicites : les 23 couples
`object_type`/`facet_table` du mapping public frais alimentent `applicability`
dans une copie du supplément ; les flags RLS des **433 relations** proviennent
du catalogue physique, plutôt que d'une inférence par présence de policy.

Ce complément RLS a été capturé séparément à **20:38:35 UTC**, sous garde du
même fingerprint logique et du ledger 192 : **287 relations avec RLS activée,
aucune avec FORCE RLS**. Il ne redate pas le reste de la capture. L'overlay
corrige 129 faux négatifs de l'inférence précédente et aucun faux positif ;
`rls_enabled` et `rls_forced` sont renseignés pour les 433 identités exactes.
Il corrige la documentation, sans modifier la base ni inventer de policy.

Les exports bruts restent intacts. Les quatre entrées de rendu — schéma normalisé,
supplément normalisé, références fraîches et flags RLS physiques — sont liées
par chemin et SHA256 à la preuve d'assemblage et lues une seule fois pour
vérification et parsing avant rendu. L'extension RLS est elle-même liée au
manifest initial inchangé.

Ce rafraîchissement n'exécute aucune RPC d'admission, publication ou mutation
distante. Le relevé de génération dans [THESAURUS.md](THESAURUS.md) reste daté
de sa capture historique ; il n'a pas été relu ici. Le catalogue ne constitue
pas une nouvelle recette métier, HTTP, de quota ou de concurrence.

## Artifacts
- `dbdoc/` — per-table docs + ER (tbls)
- `db-graph-out/FUNCTIONS.md` · `POLICIES.md` · `TYPES.md` — the glue (functions/policies/enums)
- `db-graph-out/OBJECT_TYPES.md` — per object-type map (label · archetype · facet tables · common tables)
- `db-graph-out/FUNCTION_ACCESS.md` — per function: output · access path · object types served
- `db-graph-out/SURFACE_COVERAGE.md` — §101/§103 completeness (authorable table → consumer RPC)
- `db-graph-out/graph.json` — the unified model · `graph.html` — interactive force graph

## Tables by domain
- **actor-org**: `actor`, `actor_channel`, `actor_channel_temp`, `actor_consent`, `actor_consent_temp`, `actor_contact_export_log`, `actor_document`, `actor_object_role`, `actor_object_role_temp`, `actor_temp`, `object_membership`, `object_membership_temp`, `object_org_link`, `object_org_link_temp`, `org_actor_module_visibility`, `org_branding_settings`, `org_config`, `org_permission`, `org_role_permission`, `org_smtp_settings`, `org_temp`
- **audit**: `audit_log`, `audit_log_2026_03`, `audit_log_2026_04`, `audit_log_2026_05`, `audit_log_2026_06`, `audit_log_2026_07`, `audit_log_2026_08`, `audit_log_2026_09`, `audit_log_2026_10`, `audit_log_2026_11`, `audit_log_2026_12`, `audit_log_2027_01`, `audit_log_default`
- **media**: `media`, `media_galerie_lot1_temp`, `media_tag`, `media_tag_temp`, `media_temp`
- **object-core**: `object`, `object_accommodation_unit_type`, `object_amenity`, `object_amenity_temp`, `object_classification`, `object_classification_temp`, `object_cuisine_type`, `object_deletion_log`, `object_description`, `object_description_temp`, `object_document`, `object_environment_tag`, `object_environment_tag_temp`, `object_external_id`, `object_external_id_temp`, `object_group_policy`, `object_group_policy_temp`, `object_hotel_positioning`, `object_language`, `object_language_temp`, `object_legal`, `object_legal_temp`, `object_list`, `object_list_item`, `object_location`, `object_location_temp`, `object_origin`, `object_origin_temp`, `object_payment_method`, `object_payment_method_temp`, `object_pet_policy`, `object_pet_policy_temp`, `object_place`, `object_place_description`, `object_place_description_temp`, `object_place_temp`, `object_private_description`, `object_private_description_temp`, `object_relation`, `object_relation_temp`, `object_review`, `object_review_temp`, `object_stay_policy`, `object_taxonomy`, `object_temp`, `object_version`, `object_version_2026_03`, `object_version_2026_04`, `object_version_2026_05`, `object_version_2026_06`, `object_version_2026_07`, `object_version_2026_08`, `object_version_2026_09`, `object_version_2026_10`, `object_version_2026_11`, `object_version_2026_12`, `object_version_2027_01`, `object_version_default`, `object_version_temp`, `object_web_channel`, `object_zone`, `object_zone_temp`
- **object-facets**: `object_act`, `object_fma`, `object_fma_occurrence`, `object_fma_occurrence_temp`, `object_fma_temp`, `object_iti`, `object_iti_associated_object`, `object_iti_associated_object_temp`, `object_iti_info`, `object_iti_info_temp`, `object_iti_practice`, `object_iti_practice_temp`, `object_iti_profile`, `object_iti_profile_temp`, `object_iti_section`, `object_iti_section_temp`, `object_iti_stage`, `object_iti_stage_media`, `object_iti_stage_media_temp`, `object_iti_stage_temp`, `object_iti_temp`, `object_meeting_room`, `object_meeting_room_temp`, `object_menu`, `object_menu_item`, `object_menu_item_allergen`, `object_menu_item_allergen_temp`, `object_menu_item_cuisine_type`, `object_menu_item_cuisine_type_temp`, `object_menu_item_dietary_tag`, `object_menu_item_dietary_tag_temp`, `object_menu_item_media`, `object_menu_item_media_temp`, `object_menu_item_temp`, `object_menu_temp`, `object_room_type`, `object_room_type_amenity`, `object_room_type_amenity_temp`, `object_room_type_bed`, `object_room_type_media`, `object_room_type_media_temp`, `object_room_type_temp`
- **opening**: `opening_period`, `opening_period_temp`, `opening_schedule`, `opening_schedule_temp`, `opening_time_frame`, `opening_time_frame_temp`, `opening_time_period`, `opening_time_period_temp`, `opening_time_period_weekday`, `opening_time_period_weekday_temp`
- **other**: `ai_request_rate_state`, `app_ai_provider_config`, `app_branding_settings`, `app_notification`, `app_smtp_config`, `assignment_retention`, `audit_audit_log_temp`, `audit_criteria`, `audit_criteria_temp`, `audit_log_entries`, `audit_result`, `audit_result_temp`, `audit_session`, `audit_session_temp`, `audit_template`, `audit_template_temp`, `batch_commit_ledger`, `batch_commit_ledger_item`, `bucket_lifecycle_states`, `buckets`, `buckets_analytics`, `buckets_vectors`, `concept`, `contact_channel`, `contact_channel_temp`, `crm_comment_temp`, `crm_interaction`, `crm_interaction_status_event`, `crm_interaction_temp`, `crm_task`, `crm_task_assignee`, `crm_task_document`, `crm_task_temp`, `custom_oauth_providers`, `fiche_submission`, `flow_state`, `gallery_write_receipt`, `gdpr_erasure_log`, `i18n_translation`, `i18n_translation_temp`, `identities`, `import_batches`, `import_creation_policy`, `import_events`, `incident_report`, `incident_report_temp`, `instance`, `instances`, `job`, `job_run_details`, `label`, `lifecycle_abandoned_artifacts`, `localized_field`, `mapping`, `mapping_contract`, `mapping_contract_field`, `mapping_contract_sheet`, `mapping_relation_hypothesis`, `mapping_review_decision`, `meeting_room_equipment`, `meeting_room_equipment_temp`, `messages`, `messages_2026_11_03`, `messages_2026_11_04`, `messages_2026_11_05`, `messages_2026_11_06`, `messages_2026_11_07`, `messages_2026_11_08`, `messages_2026_11_09`, `metric_snapshot`, `mfa_amr_claims`, `mfa_challenges`, `mfa_factors`, `mfa_recovery_code_sets`, `mfa_recovery_codes`, `migrations`, `mutation_journal`, `note`, `oauth_authorizations`, `oauth_client_states`, `oauth_clients`, `oauth_consents`, `objects`, `one_time_tokens`, `outbox`, `ownership_retention`, `partner_api_call`, `partner_api_key`, `partner_rate_bucket`, `pending_change`, `pending_change_temp`, `portal_photo_analysis`, `portal_photo_analysis_settings`, `promotion`, `promotion_object`, `promotion_object_temp`, `promotion_temp`, `promotion_usage`, `promotion_usage_temp`, `publication`, `publication_object`, `publication_object_temp`, `publication_temp`, `refresh_tokens`, `relation`, `release`, `release_change`, `release_concept`, `revision`, `s3_multipart_uploads`, `s3_multipart_uploads_parts`, `saml_providers`, `saml_relay_states`, `sandbox_discovery_identity`, `schema_migrations`, `schema_migrations`, `schema_migrations`, `scim_tokens`, `scim_users`, `secrets`, `sessions`, `source_link`, `spatial_ref_sys`, `sso_domains`, `sso_providers`, `subscription`, `tag_link`, `tag_link_temp`, `trail`, `trail_commune`, `trail_geometry_version`, `trail_manager_link`, `trail_object_link`, `trail_source_record`, `trail_status_history`, `trail_status_override`, `trail_sync_run`, `users`, `vector_indexes`, `vocabulary`, `webauthn_challenges`, `webauthn_credentials`
- **pricing**: `object_capacity`, `object_capacity_temp`, `object_discount`, `object_discount_temp`, `object_price`, `object_price_period`, `object_price_period_temp`, `object_price_temp`
- **rbac**: `app_user_profile`, `user_org_admin_role`, `user_org_business_role`, `user_org_membership`, `user_permission`
- **ref-lookups**: `ref_actor_role`, `ref_actor_role_temp`, `ref_amenity`, `ref_amenity_temp`, `ref_capacity_applicability`, `ref_capacity_applicability_temp`, `ref_capacity_metric`, `ref_capacity_metric_temp`, `ref_catalog_registry`, `ref_classification_equivalent_action`, `ref_classification_equivalent_group`, `ref_classification_scheme`, `ref_classification_scheme_applicability`, `ref_classification_scheme_temp`, `ref_classification_value`, `ref_classification_value_temp`, `ref_code`, `ref_code_accommodation_type`, `ref_code_accommodation_unit_type`, `ref_code_activity_type`, `ref_code_allergen`, `ref_code_amenity_family`, `ref_code_amenity_type`, `ref_code_assistance_type`, `ref_code_bed_type`, `ref_code_booking_status`, `ref_code_client_type`, `ref_code_contact_kind`, `ref_code_crm_sentiment`, `ref_code_cuisine_type`, `ref_code_demand_subtopic`, `ref_code_demand_topic`, `ref_code_destination_type`, `ref_code_dietary_tag`, `ref_code_document_type`, `ref_code_domain_registry`, `ref_code_environment_tag`, `ref_code_event_type`, `ref_code_feedback_type`, `ref_code_incident_category`, `ref_code_insurance_type`, `ref_code_iti_difficulty`, `ref_code_iti_open_status`, `ref_code_iti_practice`, `ref_code_iti_stage_kind`, `ref_code_language_level`, `ref_code_media_tag`, `ref_code_media_type`, `ref_code_meeting_equipment`, `ref_code_membership_campaign`, `ref_code_membership_tier`, `ref_code_menu_category`, `ref_code_mood`, `ref_code_opening_period_type`, `ref_code_opening_schedule_type`, `ref_code_other`, `ref_code_package_type`, `ref_code_partnership_type`, `ref_code_payment_method`, `ref_code_price_kind`, `ref_code_price_type`, `ref_code_price_unit`, `ref_code_promotion_type`, `ref_code_room_type`, `ref_code_season_type`, `ref_code_service_type`, `ref_code_social_network`, `ref_code_taxonomy_closure`, `ref_code_temp`, `ref_code_tourism_type`, `ref_code_trail_link_role`, `ref_code_transport_type`, `ref_code_view_type`, `ref_code_weekday`, `ref_commune`, `ref_contact_role`, `ref_contact_role_temp`, `ref_document`, `ref_document_temp`, `ref_facet_applicability`, `ref_facet_registry`, `ref_interop_crosswalk`, `ref_iti_assoc_role`, `ref_iti_assoc_role_temp`, `ref_language`, `ref_language_temp`, `ref_legal_type`, `ref_legal_type_temp`, `ref_object_relation_type`, `ref_object_relation_type_temp`, `ref_org_admin_role`, `ref_org_business_role`, `ref_org_role`, `ref_org_role_temp`, `ref_permission`, `ref_review_source`, `ref_review_source_temp`, `ref_tag`, `ref_tag_temp`, `ref_trail_manager`, `ref_trail_source`
- **sustainability**: `object_sustainability_action`, `object_sustainability_action_label`, `object_sustainability_action_label_temp`, `object_sustainability_action_temp`, `ref_sustainability_action`, `ref_sustainability_action_category`, `ref_sustainability_action_category_temp`, `ref_sustainability_action_group`, `ref_sustainability_action_temp`