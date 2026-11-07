# Bertel object surface — live schema report

**Source** : live Supabase Postgres (read-only psql via `.env.schemaspy`), server version 17.6
**Date** : 2026-05-19
**Scope** : schémas `public`, `api`, `audit`, `crm`, `internal`, `ref`, `staging`

---

## 0. Schémas et volumétrie

| Schéma | Tables | Vues / MV | Fonctions | Enums | Politiques RLS |
|---|---:|---:|---:|---:|---:|
| `public`  | 161 | 4 vues | 20 | 9 | 304 |
| `api`     | 0   | 0 | **189** | 0 | 0 |
| `audit`   | 7 (toutes partitions de `audit_log`) | 0 | 7 | 0 | 14 |
| `crm`     | 0 | 0 | 0 | 0 | 0 (schéma déclaré, tables CRM vivent dans `public`) |
| `internal`| 0 | 2 MV | 0 | 0 | 0 |
| `ref`     | 0 | 0 | 0 | 0 | 0 (schéma déclaré, tables `ref_*` vivent dans `public`) |
| `staging` | 108 | 0 | 8 | 0 | 0 (aire d'import, hors RLS) |

Volumétrie `public`: **155 / 159 tables de base ont RLS activé** (4 sans RLS — à expliciter). Aucune table sans clé primaire détectée dans les schémas applicatifs.

---

## 1. Objets et types

### 1.1 Table `object` (cœur, 935 lignes)
31 colonnes. Identité, type, région, statut publication, visibilité commerciale, timezone, métadonnées de cycle de vie.

### 1.2 Enum `object_type` (17 valeurs)
| Code | Volumétrie | Notes |
|---|---:|---|
| `HLO` | 485 | Hébergement locatif — type dominant |
| `LOI` | 142 | Loisirs |
| `RES` | 137 | Restaurants |
| `ACT` | 52  | Activités |
| `PSV` | 18  | Prestataires de services |
| `HOT` | 9   | Hôtels — sous-représenté |
| `CAMP`| 3   | Campings — quasi inexistants |
| `ORG` | 1   | Organisations |
| `COM` | 1   | Commerces |
| `HPA`, `ITI`, `VIL`, `ASC`, `FMA`, `PCU`, `PNA`, `RVA` | 0 | **enum déclaré, aucune donnée live** |

> **Implication** : la majorité des fixtures réalistes viendra de HLO, LOI, RES, ACT. Les types CAMP / HOT / ORG / COM / ITI / FMA / HPA nécessiteront des fixtures synthétiques pour exercer l'UI.

### 1.3 Enum `object_status` (4 valeurs)
`draft` (474), `published` (374), `archived`, `hidden`. Total 848 sur 935 objets — ~87 lignes hors des deux statuts comptés (à investiguer).

### 1.4 Versioning et partitions
- `object_version` + 3 partitions mensuelles (`object_version_2026_03/04/05`) + `object_version_default`.
- Schéma `audit` : `audit_log` partitionné mensuellement (`audit_log_2026_03..07` + `audit_log_default`).

---

## 2. Descriptions

| Table | Volumétrie | Rôle |
|---|---:|---|
| `object_description` | 815 | Description publique canonique (1:1 par objet, ~87 % de couverture) |
| `object_place_description` | n/a | Description par sous-lieu (`object_place.id`) |
| `object_private_description` | n/a | Notes internes prestataire (lecture restreinte, RLS) |
| `i18n_translation` | n/a | Mécanisme i18n secondaire / legacy |

Champs i18n dédiés : repérés sur `media.title_i18n`, `media.description_i18n`, `object_iti_info.access_i18n` — modèle hétérogène (`*_i18n jsonb` *vs.* `i18n_translation` central). Voir gap **G-DESC-1**.

---

## 3. Médias

| Table | Volumétrie | Notes |
|---|---:|---|
| `media` | **4 014** | Galerie objet, 25 colonnes : URL, dimensions, droits (`rights_expires_at`), visibilité, `is_main`, `position`, `kind`, `extra jsonb`, scope sous-lieu via `place_id`, scope org via `org_object_id` |
| `media_tag` | n/a | Tags appliqués aux médias |
| `ref_code_media_type` | n/a | Référentiel types (photo, vidéo, ...) |
| `ref_code_media_tag`  | n/a | Référentiel tags |
| `object_room_type_media` | n/a | Médias scopés au type de chambre |
| `object_iti_stage_media` | n/a | Médias scopés à l'étape ITI |
| `object_menu_item_media` | n/a | Médias scopés à un item de menu |

> **Note** : la portée média est largement modélisée (objet global, sous-lieu via `place_id`, chambre, étape ITI, item de menu). Bonne base pour la règle 6.4 du document canonique.

---

## 4. Contacts publics et acteurs

| Table | Volumétrie | Notes |
|---|---:|---|
| `contact_channel` | **1 901** | Canaux publics de l'objet (email, tél, web, social) |
| `actor` | 696 | Personnes physiques liées aux objets |
| `actor_channel` | n/a | Canaux des acteurs |
| `actor_consent` | n/a | Consentements RGPD acteur |
| `actor_object_role` | **799** | Rattachement acteur ↔ objet ↔ rôle |
| `ref_code_contact_kind` | n/a | Types canal |
| `ref_contact_role` | n/a | Rôles canal |
| `ref_actor_role` | n/a | Rôles acteur |

---

## 5. Adresses, localisation, sous-lieux

| Table | Volumétrie | Notes |
|---|---:|---|
| `object_location` | **847** | Point GPS, adresse structurée — 22 colonnes, couverture ~91 % |
| `object_place` | n/a | Sous-lieux rattachés à un objet (multi) |
| `object_zone` | n/a | Zonage (probable géopolygone) |

---

## 6. Périodes d'ouverture / horaires

| Table | Volumétrie | Notes |
|---|---:|---|
| `opening_period` | **257** | Période d'ouverture (~27 % des objets ont au moins une période) |
| `opening_schedule` | 257 | Aligné 1:1 avec `opening_period` |
| `opening_time_period` | 257 | Tranches |
| `opening_time_period_weekday` | **1 051** | Jours par tranche |
| `opening_time_frame` | n/a | Cadre / saison |
| `ref_code_opening_schedule_type` | n/a | Types planning |
| `ref_code_weekday` | n/a | Référentiel jours |

> **Note** : ~73 % des objets n'ont pas d'horaires — soit normal (ex. itinéraires), soit lacune massive à investiguer pour les types commerciaux.

---

## 7. Prix et promotions

| Table | Notes |
|---|---|
| `object_price` | 19 colonnes — prix unitaires |
| `object_price_period` | 9 colonnes — variations saisonnières |
| `object_discount` | 13 colonnes — remises |
| `promotion` | Existe (référencé par canonical map) |
| `promotion_object` | Existe — pivot |
| `ref_code_price_kind` | Types de prix |
| `ref_code_price_unit` | Unités |
| `ref_code_promotion_type` | Types promo |

---

## 8. Classifications, taxonomies, distinctions

70 tables `ref_*` dans `public`. Familles principales :
- **Distinctions** : `ref_classification_scheme`, `ref_classification_value`, `ref_classification_equivalent_group`, `ref_classification_equivalent_action`
- **Liaison objet** : `object_classification` (230 lignes)
- **Vues** : `v_object_classification_coverage`, `v_object_classification_or_equivalent_scheme`
- **Taxonomie fermée** : `ref_code_taxonomy_closure` (utilisé par `api.refresh_ref_code_taxonomy_closure(p_domain text)`)
- **Catalogue référentiel** : `ref_code_amenity_family`, `ref_code_amenity_type`, `ref_code_cuisine_type`, `ref_code_dietary_tag`, `ref_code_allergen`, `ref_code_event_type`, `ref_code_iti_practice`, `ref_code_menu_category`, `ref_code_room_type`, `ref_code_view_type`, `ref_code_tourism_type`, `ref_code_destination_type`, `ref_code_mood`, ...

---

## 9. Aménagements et caractéristiques

| Table | Volumétrie | Notes |
|---|---:|---|
| `object_amenity` | **6 207** | Le plus gros pivot objet — moyenne ~7 amenities par objet |
| `object_environment_tag` | **3 484** | Tags d'environnement (montagne, plage, ...) |
| `object_language` | n/a | Langues parlées sur place |
| `object_payment_method` | n/a | Moyens de paiement acceptés |
| `ref_amenity` | n/a | Catalogue principal |
| `ref_code_amenity_family` / `ref_code_amenity_type` | n/a | Taxonomie de regroupement |

---

## 10. Accessibilité — **DOMAINE FRAGMENTÉ**

**Il n'y a pas de table générique `object_accessibility` ni de table `access`.** L'accessibilité est éclatée :

| Surface | Localisation live |
|---|---|
| ITI : description d'accès | `object_iti_info.access` (text) + `object_iti_info.access_i18n` (jsonb) |
| Chambres accessibles | `object_room_type.is_accessible` (boolean) |
| Types d'assistance | `ref_code_assistance_type` (référentiel) |
| Label « Tourisme & Handicap » | via `object_classification` + `ref_classification_scheme` (schéma de distinction) |

> **Gap structurel majeur** : il n'existe pas de bloc transverse « accessibilité » modélisé dans le schéma. La canonical map place l'accessibilité dans **C2 Distinctions et accessibilité** (via classifications), ce qui est cohérent pour le label certifié, mais ne couvre pas les attributs détaillés (accès PMR, équipements spécifiques, étapes ITI accessibles). Voir gap **G-A11Y-1**.

---

## 11. Itinéraires (ITI)

| Table | Notes |
|---|---|
| `object_iti` | 16 col — distance, dénivelé, durée, type de boucle, sens, statut parcours |
| `object_iti_info` | 14 col — accès, parking, recommandations, équipement, sécurité, eau, restauration |
| `object_iti_stage` | 11 col — étapes ordonnées |
| `object_iti_stage_media` | médias par étape |
| `object_iti_section` | 9 col — sections (ascendance, descente, plat) |
| `object_iti_profile` | profil altimétrique |
| `object_iti_practice` | pratiques (rando, VTT, équestre, ...) |
| `object_iti_associated_object` | rattachement à d'autres objets (refuges, points d'eau, ...) |
| `ref_code_iti_practice` | référentiel pratiques |
| `ref_iti_assoc_role` | rôles d'association |

**Aucun objet de type `ITI` actuellement en base.** Le modèle est complet mais inutilisé en données — **besoin de fixtures synthétiques pour exercer l'UI**.

API ITI dédiée : `api.build_iti_track`, `api.get_itinerary_track_geojson`, `api.get_itinerary_track_simplified`, `api.export_itinerary_gpx`, `api.export_itineraries_gpx_batch`.

---

## 12. Restaurants (RES) — 137 objets

| Table | Notes |
|---|---|
| `object_menu` | 10 col — carte |
| `object_menu_item` | 13 col — plat |
| `object_menu_item_allergen` | pivot allergènes |
| `object_menu_item_cuisine_type` | pivot type cuisine |
| `object_menu_item_dietary_tag` | pivot tags alimentaires (végé, vegan, ...) |
| `object_menu_item_media` | médias plat |
| `ref_code_menu_category` / `ref_code_dietary_tag` / `ref_code_allergen` / `ref_code_cuisine_type` | référentiels |

API dédiée : `api.search_restaurants_by_cuisine`, `api.search_events_by_restaurant_cuisine`.

---

## 13. Hôtellerie / hébergement (HOT, HLO, HPA, CAMP)

| Table | Notes |
|---|---|
| `object_room_type` | **24 colonnes** — type de chambre / unité, capacité, surface, vue, accessibilité, prix de base |
| `object_room_type_amenity` | pivot amenities chambre |
| `object_room_type_media` | médias chambre |
| `object_meeting_room` | 12 col — salles MICE |
| `meeting_room_equipment` | équipements salle |
| `ref_code_room_type` / `ref_code_accommodation_type` / `ref_code_view_type` / `ref_code_meeting_equipment` | référentiels |

API dédiée : `api.get_object_room_types(p_object_id, p_lang_prefs)`.

> **Note volumétrie** : 485 HLO + 9 HOT + 3 CAMP + 0 HPA = 497 objets d'hébergement. HOT/CAMP sont rares — risque de manquer de fixtures réelles pour ces types.

---

## 14. Activités (ACT) — 52 objets

| Table | Notes |
|---|---|
| `object_act` | 10 col — durée, jauges, difficulté, guide, âge minimum, équipement fourni |
| `ref_code_activity_type` | référentiel types activité |

---

## 15. Manifestations / agenda (FMA)

| Table | Notes |
|---|---|
| `object_fma` | 9 col — programmation |
| `object_fma_occurrence` | occurrences datées |
| `ref_code_event_type` | référentiel types événement |

**Aucun objet `FMA` en base** — fixtures à construire.

---

## 16. Acteurs et organisations

### 16.1 Acteurs (rattachés à un objet ou autonomes)
`actor` (696), `actor_channel`, `actor_consent`, `actor_object_role` (799), `ref_actor_role`.

### 16.2 Organisations et gouvernance (8 tables)
| Table | Rôle |
|---|---|
| `object` (avec `object_type = ORG`) | 1 ORG actuellement |
| `object_org_link` | rattachement objet ↔ org |
| `org_config` | configuration org (incl. `access_scope`) |
| `org_permission` | permissions accordées à l'org |
| `user_org_membership` | adhésion utilisateur ↔ org |
| `user_org_business_role` | rôle métier utilisateur dans l'org |
| `user_org_admin_role` | rôle admin utilisateur dans l'org |
| `user_permission` | permissions utilisateur |
| `app_user_profile` | profil applicatif |
| `ref_org_role`, `ref_org_admin_role`, `ref_org_business_role`, `ref_permission`, `ref_code_membership_campaign`, `ref_code_membership_tier` | référentiels |

API gouvernance : `api.rpc_grant_org_permission`, `api.rpc_revoke_org_permission`, `api.rpc_grant_user_permission`, `api.rpc_revoke_user_permission`, `api.rpc_set_admin_role`, `api.rpc_set_business_role`, `api.rpc_upsert_membership`, `api.rpc_deactivate_membership`.

---

## 17. Schéma `api` — surface RPC (189 fonctions)

### 17.1 Groupes fonctionnels

| Groupe | Fonctions clés |
|---|---|
| **Lecture objet** | `get_object_card`, `get_object_cards_batch`, `get_object_cards_adapted_batch`, `get_object_resource`, `get_object_resource_adapted`, `get_object_resources_batch`, `get_object_with_deep_data`, `get_objects_with_deep_data`, `get_objects_by_type_with_deep_data` |
| **Recherche** | `search_objects_with_deep_data`, `search_objects_by_label`, `search_restaurants_by_cuisine`, `search_events_by_restaurant_cuisine`, `list_objects_map_view`, `list_object_resources_page`, `list_object_resources_page_text`, `list_object_resources_filtered_page`, `list_object_resources_since_fast`, `list_object_resources_filtered_since_fast`, `list_objects_with_validated_changes_since` |
| **Bloc resource** | `compose_object_resource_blocks`, `resource_block_base`, `resource_block_contacts`, `resource_block_descriptions`, `resource_block_itinerary`, `resource_block_legal`, `resource_block_location`, `resource_block_media`, `resource_block_misc`, `resource_block_pricing`, `resource_block_render` |
| **Compact getters** | `get_object_amenity_codes_compact`, `get_object_badges_compact`, `get_object_environment_tags_compact`, `get_object_tags_compact`, `get_object_taxonomy_compact`, `get_object_map_item` |
| **Données spécifiques** | `get_object_room_types`, `get_object_reviews`, `get_actor_data`, `get_organization_data`, `get_parent_object_data`, `get_media_for_web` |
| **Horaires** | `build_opening_period_json`, `get_opening_time_slots`, `get_opening_slots_by_day`, `get_all_opening_time_slots`, `is_object_open_now`, `is_opening_period_active_today`, `is_opening_period_active_on_date`, `get_local_now_for_timezone`, `get_object_local_now` |
| **Itinéraire** | `build_iti_track`, `get_itinerary_track_geojson`, `get_itinerary_track_simplified`, `export_itinerary_gpx`, `export_itineraries_gpx_batch` |
| **Juridique** | `add_legal_record`, `update_legal_record`, `request_legal_document`, `deliver_legal_document`, `check_object_legal_compliance`, `audit_legal_compliance`, `get_object_legal_data`, `get_object_legal_compliance`, `get_object_legal_records`, `get_object_legal_records_by_visibility`, `get_object_private_legal_records`, `get_object_public_legal_records`, `get_expiring_legal_records`, `get_expiring_legal_records_api`, `generate_legal_expiry_notifications`, `get_pending_document_requests`, `get_pending_document_requests_api` |
| **Permissions / qui peut quoi** | `can_read_extended`, `can_read_object_private_notes`, `can_write_object_private_notes`, `can_manage_object_private_note`, `can_delete_object_private_note`, `current_user_admin_rank`, `current_user_admin_role_code`, `current_user_business_role_code`, `current_user_can_edit_objects`, `current_user_email`, `current_user_org_id`, `is_object_owner`, `is_platform_admin`, `is_platform_owner`, `is_platform_superuser`, `user_actor_ids`, `user_can_create_object`, `user_can_publish_object`, `user_can_write_canonical`, `user_can_write_enrichment`, `user_has_permission` |
| **Dashboard** | `get_dashboard_actualisation`, `get_dashboard_city_distribution`, `get_dashboard_city_options`, `get_dashboard_distinction_overview`, `get_dashboard_filter_options`, `get_dashboard_lieu_dit_options`, `get_dashboard_scorecards`, `get_dashboard_type_breakdown` |
| **i18n & rendu** | `i18n_get_text`, `i18n_get_text_strict`, `i18n_pick`, `i18n_pick_strict`, `pick_lang`, `render_format_currency`, `render_format_date`, `render_format_date_range`, `render_format_datetime_range`, `render_format_percent`, `render_format_time` |
| **RPC édition** | `rpc_create_object`, `rpc_publish_object`, `rpc_grant_org_permission`, `rpc_revoke_org_permission`, `rpc_grant_user_permission`, `rpc_revoke_user_permission`, `rpc_set_admin_role`, `rpc_set_business_role`, `rpc_revoke_admin_role`, `rpc_upsert_membership`, `rpc_deactivate_membership` |
| **Staging / import** | `commit_staging_to_public`, `purge_staging_batch`, `purge_expired_staging_batches`, `rollback_staging_batch_compensate`, `assert_staging_batch_integrity`, `run_staging_dedup`, `resolve_staging_dependencies`, `watchdog_mark_stale_batches` |
| **Branding** | `get_app_branding`, `get_public_branding`, `upsert_app_branding` |
| **Triggers internes** | `auto_attach_object_to_creator_org`, `auto_populate_interaction_subject`, `before_insert_object_generate_id`, `create_crm_artifacts_from_incident`, `enforce_*`, `lock_*`, `manage_object_published_at`, `prevent_duplicate_actor_email`, `recompute_audit_session_score`, `refresh_*`, `set_publication_workflow_timestamps`, `sync_*`, `trg_*`, `validate_*` |
| **Utilitaires** | `b64url_encode`, `b64url_decode`, `cursor_pack`, `cursor_unpack`, `to_base36`, `norm_search`, `json_clean`, `jsonb_pick_keys`, `jsonb_prune_empty_top`, `generate_object_id`, `validate_promotion_code` |

### 17.2 Surface manquante ou incohérente
Aucune fonction `api.update_object_*` ou `api.upsert_object_*` exposée pour l'édition de blocs (description, contacts, médias, prix, ...). L'**écriture** semble passer par :
- `api.rpc_create_object`, `api.rpc_publish_object` (création / publication)
- direct DB write avec RLS sur les tables (`object_description`, `object_amenity`, ...) côté Supabase REST/PostgREST
- modération via `pending_change`

> Voir gap **G-API-1**.

---

## 18. Vues publiques (4 vues + 2 MV)

| Vue | Schéma | Rôle |
|---|---|---|
| `v_active_legal_records` | public | Pièces juridiques actives |
| `v_expiring_legal_records` | public | Pièces juridiques à échéance |
| `v_object_classification_coverage` | public | Couverture des classifications par objet |
| `v_object_classification_or_equivalent_scheme` | public | Pivot distinctions + équivalences |
| 2 matériel views | internal | (à inventorier précisément si besoin) |

---

## 19. Vue d'ensemble — domaines couverts

| Domaine demandé | Statut | Notes |
|---|---|---|
| Objets | ✅ Couvert | 935 objets, partitions, versions |
| Types d'objet | ✅ Couvert (17 codes) | 8 types sur 17 ont de la donnée live |
| Descriptions | ✅ Couvert | Modèle hétérogène i18n (jsonb local *vs.* `i18n_translation`) |
| Médias | ✅ Couvert | 4 014 médias, scoping fin (sous-lieu, chambre, ITI, plat) |
| Contacts | ✅ Couvert | 1 901 canaux + acteurs séparés (RGPD-aware) |
| Adresses | ✅ Couvert | 847 / 935 (~91 %) |
| Périodes d'ouverture | ⚠ Partiel | 257 périodes (~27 % objets) — sous-couverture |
| Prix | ⚠ Structure OK | Volumétrie non analysée (reltuples = -1) |
| Classifications | ✅ Couvert | 230 classifications, schémas équivalence + couverture |
| Aménagements | ✅ Couvert | 6 207 lignes — plus gros pivot objet |
| **Accessibilité** | ❌ **Fragmenté** | Pas de bloc unifié, voir §10 et G-A11Y-1 |
| Itinéraires | ⚠ Structure complète, **0 donnée** | Fixtures synthétiques requises |
| Restaurants | ✅ Couvert | 137 objets RES, modèle menu complet |
| Hôtels / accommodation | ⚠ Modèle complet, **HOT=9, CAMP=3, HPA=0** | Fixtures réelles trop rares pour certaines combinaisons |
| Activités | ✅ Couvert | 52 ACT |
| Acteurs | ✅ Couvert | 696 acteurs, 799 rattachements |
| Organisations | ⚠ **1 ORG** en base | Fixtures synthétiques requises pour le module ORG |
| API `api.*` | ✅ Couvert | 189 fonctions, surface lecture mature, écriture limitée |

---

## 20. Suite recommandée

1. Lire `mapping-vs-live-schema-gaps.md` pour les écarts par onglet canonique.
2. Lire `editor-detail-fixtures-plan.md` pour la stratégie de jeux d'essai.
3. Décider quels types (CAMP, HPA, FMA, ITI, ORG, VIL, PCU, PNA, ASC, RVA) nécessitent fixtures synthétiques avant V1.
4. Trancher la question du bloc accessibilité unifié (G-A11Y-1).
5. Trancher la stratégie d'écriture côté API (G-API-1) : PostgREST direct *vs.* fonctions `rpc_update_*` dédiées.
