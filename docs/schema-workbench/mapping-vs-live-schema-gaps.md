# Mapping UI/éditeur ↔ schéma live — gaps

**Source mapping** : [`docs/architecture/bertel-object-workspace-canonical-map.md`](../architecture/bertel-object-workspace-canonical-map.md)
**Source live** : SchemaSpy / psql sur le DB Supabase (voir `live-*.csv`)
**Date** : 2026-05-19

> **Note** : la CSV `docs/mapping-workbench/object-workspace-surface-map.csv` mentionnée dans le contexte n'existe pas dans le dépôt. Le seul document de mapping canonique trouvé est le markdown ci-dessus. Cette analyse l'utilise comme source unique de vérité. Voir gap **G-MAP-1**.

---

## Légende

- **Confidence** : `high` (table/fonction trouvée et adaptée), `medium` (existe, scope incertain), `low` (à investiguer)
- **Gap type** :
  - `OK` — couverture complète
  - `missing DB surface` — table/colonne attendue absente
  - `missing API surface` — table existe, RPC dédié manquant
  - `unclear mapping` — plusieurs candidats, mapping à trancher
  - `old-data issue` — table existe mais 0 donnée ou très peu (fixtures requises)
  - `duplicate-risk` — deux mécanismes coexistent, source de vérité ambiguë
  - `needs fixture` — fixture éditeur requise pour exercer l'UI

---

## Couche A — Identité et cadrage

| ID | Onglet | Live likely | Confidence | Gap | Action recommandée |
|---|---|---|---|---|---|
| **A1** | Infos générales | `object` (31 col), `rpc_create_object`, `rpc_publish_object`, RLS via `user_can_write_canonical` | high | OK | Confirmer que `commercial_visibility`, `region_code`, `business_timezone` sont tous éditables via PostgREST + RLS. |
| **A2** | Taxonomie structurante | `object_classification` (230), `ref_classification_scheme`, `ref_classification_value`, `v_object_classification_coverage` | high | OK | Documenter quels `is_distinction` sont structurants (non-distinction) *vs.* distinction (C2). |
| **A3** | Publication et modération | `object.status`, `object.published_at`, `pending_change`, `publication`, `publication_object`, `rpc_publish_object`, `manage_object_published_at`, `set_publication_workflow_timestamps` | high | OK | Surface RPC de modération (approuver/rejeter `pending_change`) à exposer côté API. |
| **A4** | Synchronisation et identifiants | `object_external_id` (838), `object_origin` (847) | high | OK | Couverture 90 % — investiguer les 8–9 % manquants. |

---

## Couche B — Contenu public et éditorial

| ID | Onglet | Live likely | Confidence | Gap | Action recommandée |
|---|---|---|---|---|---|
| **B1** | Localisation | `object_location` (847), `object_place`, `object_zone` | high | OK (couverture 91 %) | Vérifier scope sous-lieu (`object_place`) — combien d'objets en ont. |
| **B2** | Descriptions et langues | `object_description` (815), `object_place_description`, `object_private_description`, `ref_language` + `media.title_i18n`, `media.description_i18n`, `i18n_translation` | medium | **duplicate-risk** (G-DESC-1) | Trancher : `*_i18n` jsonb local *vs.* `i18n_translation` central. Documenter règle par champ. |
| **B3** | Médias | `media` (4 014), `media_tag`, `ref_code_media_type`, `ref_code_media_tag`, `object_room_type_media`, `object_iti_stage_media`, `object_menu_item_media`, `get_media_for_web` | high | OK | Médias très bien modélisés ; vérifier que la portée `place_id` est exposée côté UI. |
| **B4** | Contacts publics et web | `contact_channel` (1 901), `ref_code_contact_kind`, `ref_contact_role`, `enforce_contact_email_shape` | high | OK | Vérifier qu'aucun PII de contact privé ne fuit via `contact_channel` (séparation acteur/objet). |
| **B5** | Publications print | `publication`, `publication_object`, `export_publication_indesign`, `log_publication_proof_interaction` | high | OK | Workflow BAT (`log_publication_proof_interaction`) à exposer dans l'UI. |

---

## Couche C — Offre, exploitation et contenu structurant

| ID | Onglet | Live likely | Confidence | Gap | Action recommandée |
|---|---|---|---|---|---|
| **C1** | Caractéristiques | `object_amenity` (6 207), `object_language`, `object_payment_method`, `object_environment_tag` (3 484), `ref_amenity`, `ref_code_amenity_family`, `ref_code_amenity_type`, `ref_language`, `ref_code_payment_method`, `ref_code_environment_tag`, `get_object_amenity_codes_compact`, `get_object_environment_tags_compact`, `get_object_tags_compact` | high | OK | Surface mature. Vérifier alignement entre familles amenity et UX de regroupement. |
| **C2** | Distinctions et accessibilité | `object_classification`, `ref_classification_scheme` (is_distinction=true), `ref_classification_value`, `ref_document`, `v_object_classification_or_equivalent_scheme`, `sync_classification_from_audit_session` | medium | **missing DB surface (G-A11Y-1)** | Accessibilité fragmentée : pas de bloc unifié. `object_iti_info.access`, `object_room_type.is_accessible`, `ref_code_assistance_type` cohabitent sans pivot. À trancher : créer un bloc `object_accessibility` ou modéliser via distinctions ? |
| **C3** | Éco-responsabilité | `object_sustainability_action`, `object_sustainability_action_label`, `ref_sustainability_action`, `ref_sustainability_action_category`, `ref_sustainability_action_group` | high | OK | Vérifier que `object_classification` est utilisé pour les labels d'éco-certification. |
| **C4** | Capacités et politiques | `object_capacity`, `ref_capacity_metric`, `object_group_policy`, `object_pet_policy`, `ref_capacity_applicability` | high | OK | Vérifier matrice type d'objet × métriques applicables. |
| **C5** | Tarifs et promotions | `object_price` (19 col), `object_price_period`, `object_discount`, `promotion`, `promotion_object`, `ref_code_price_kind`, `ref_code_price_unit`, `ref_code_promotion_type`, `validate_promotion_code`, `render_format_currency`, `resource_block_pricing` | high | OK | Vérifier qu'il existe une RPC ou pattern d'écriture pour `object_price_period` + `object_discount` (UI complexe). |
| **C6** | Horaires et périodes | `opening_period` (257 — **toutes cassées**), `opening_schedule`, `opening_time_period`, `opening_time_period_weekday` (1 051), `opening_time_frame`, `ref_code_opening_schedule_type`, `ref_code_weekday`, `build_opening_period_json`, `get_opening_time_slots`, `get_all_opening_time_slots`, `get_opening_slots_by_day`, `is_object_open_now`, `is_opening_period_active_today`, `is_opening_period_active_on_date`, `get_local_now_for_timezone`, `get_object_local_now` | high | **BLOCKER — G-OPENING-1** | 100 % des périodes ont nom placeholder + 0 date + éclatement AM/PM. 53 % du parc (HLO/HOT/CAMP) sans aucune période. Voir [`opening-periods-migration-diagnostic.md`](opening-periods-migration-diagnostic.md). |
| **C7** | Documents métier visibles | `ref_document`, `media` | medium | unclear mapping | À clarifier : `ref_document` modélise quoi exactement ? Pivot `object_document` apparemment absent. Voir gap **G-DOC-1**. |

---

## Couche D — Suivi relation, back-office et conformité

| ID | Onglet | Live likely | Confidence | Gap | Action recommandée |
|---|---|---|---|---|---|
| **D1** | Suivi relation prestataires | `object_private_description`, `crm_interaction` (3 175), `crm_task`, `actor`, `actor_object_role`, `auto_populate_interaction_subject`, `can_read_object_private_notes`, `can_write_object_private_notes` | high | OK | Volume `crm_interaction` (3 175) montre que la donnée existe. Vérifier que l'UI n'utilise pas vocabulaire commercial (pipeline, lead, ...). |
| **D2** | Relations et rattachements | `object_org_link`, `actor_object_role` (799), `object_relation`, `ref_org_role`, `ref_actor_role`, `ref_object_relation_type`, `actor` (696), `actor_channel`, `actor_consent`, `ref_document`, `prevent_duplicate_actor_email`, `enforce_actor_channel_email_shape`, `get_actor_data`, `get_parent_object_data` | high | OK | Vérifier que la modale Acteur inclut consentements RGPD (`actor_consent`). |
| **D3** | Adhésions | `object_membership`, `ref_code_membership_campaign`, `ref_code_membership_tier`, `handle_membership_status_transition`, `enforce_single_active_org_membership`, `check_membership_org_type` | high | OK | Vérifier impact `commercial_visibility` lié à l'adhésion. |
| **D4** | Avis clients | `object_review`, `ref_review_source`, `get_object_reviews` | high | OK | Donnée importée — pas de RPC d'écriture (cohérent). |
| **D5** | Qualité et signalements | `audit_template`, `audit_criteria`, `audit_session`, `audit_result`, `incident_report`, `recompute_audit_session_score`, `validate_audit_result_points`, `sync_classification_from_audit_session`, `create_crm_artifacts_from_incident` | medium | needs fixture | Tables dans `public` (pas dans `audit` comme la carte canonique l'indique). Toutes à `reltuples=-1` → peu ou pas de données. Fixtures requises. |
| **D6** | Juridique et conformité | `object_legal`, `ref_legal_type`, `ref_document`, 17 fonctions `api.*_legal_*`, `v_active_legal_records`, `v_expiring_legal_records` | high | OK | Surface très complète côté API. |
| **D7** | Gouvernance et accès | `user_org_membership`, `user_org_business_role`, `user_org_admin_role`, `org_config`, `app_user_profile`, `org_permission`, `user_permission`, `ref_permission`, `ref_org_admin_role`, `ref_org_business_role`, 8 RPC `rpc_*_permission` / `rpc_*_role` / `rpc_*_membership` | high | OK | Backend complet. V3 selon priorisation canonique. |
| **D8** | Historique et versions | `object_version` + partitions `2026_03/04/05/default`, `audit.audit_log` (6 partitions) | high | OK | Vérifier RPC ou vue de présentation d'un diff entre versions. |
| **D9** | Opportunités commerciales | **AUCUN** (`crm_pipeline`, `crm_stage`, `crm_deal` MISSING) | high | **missing DB surface** | Cohérent avec la décision V3 backlog. Mais le schéma `crm` est vide — confirmer que tout reste à `public.crm_*`. Voir gap **G-CRM-1**. |

---

## Couche E — Modules conditionnels par type

| ID | Type | Live likely | Confidence | Gap | Action recommandée |
|---|---|---|---|---|---|
| **E1** | ITI | `object_iti`, `object_iti_stage`, `object_iti_stage_media`, `object_iti_section`, `object_iti_info`, `object_iti_profile`, `object_iti_practice`, `object_iti_associated_object`, `ref_code_iti_practice`, `ref_iti_assoc_role`, 5 fonctions `api.*_iti_*` / `*_itinerary_*` | high | **old-data issue** + needs fixture | 0 objet de type ITI en base. Fixtures synthétiques obligatoires. |
| **E2** | ACT | `object_act` (10 col), `ref_code_activity_type` | medium | OK (52 objets) | Vérifier que `object_act` est unique par objet (1:1). |
| **E3** | FMA | `object_fma`, `object_fma_occurrence`, `ref_code_event_type` | medium | **old-data issue** + needs fixture | 0 objet de type FMA en base. |
| **E4** | RES | `object_menu`, `object_menu_item` (13 col), `object_menu_item_allergen`, `object_menu_item_cuisine_type`, `object_menu_item_dietary_tag`, `object_menu_item_media`, `ref_code_menu_category`, `ref_code_dietary_tag`, `ref_code_allergen`, `ref_code_cuisine_type`, `search_restaurants_by_cuisine`, `search_events_by_restaurant_cuisine` | high | OK (137 RES) | Vérifier que `object_menu_item` a un `position` pour tri UI. |
| **E5** | HOT/HPA/HLO/CAMP | `object_room_type` (24 col), `object_room_type_amenity`, `object_room_type_media`, `ref_code_view_type`, `ref_code_room_type`, `ref_code_accommodation_type`, `get_object_room_types` | high | partial OK | 485 HLO + 9 HOT + 3 CAMP + 0 HPA. Fixtures synthétiques pour HOT/CAMP/HPA. |
| **E6** | MICE | `object_meeting_room` (12 col), `meeting_room_equipment`, `ref_code_meeting_equipment` | medium | needs fixture | Volumétrie inconnue (reltuples = -1). À ne pas dépendre que de `object_type=HOT` (carte canonique le précise). |
| **E7** | ORG | `object` (`object_type=ORG`), `contact_channel`, `object_org_link`, `org_config`, `user_org_membership`, `get_organization_data`, `check_org_config_org_type`, `check_org_permission_org_type`, `auto_attach_object_to_creator_org` | high | needs fixture (1 ORG en base) | Variante d'édition institutionnelle à designer ; fixtures synthétiques d'ORG complète + utilisateurs rattachés. |

---

## Gaps globaux et transverses

### G-MAP-1 — CSV de mapping absent (sévérité : moyenne)
Le fichier `docs/mapping-workbench/object-workspace-surface-map.csv` mentionné dans la consigne n'existe pas. Seul `docs/architecture/bertel-object-workspace-canonical-map.md` est disponible.
- **Action** : Soit transcrire le markdown en CSV pour automatisation (gap analyse, génération de fixtures), soit considérer le MD comme source de vérité unique.

### G-DESC-1 — Stratégie i18n hétérogène (sévérité : haute)
Deux mécanismes i18n coexistent :
- **Colonnes `*_i18n` jsonb locales** (ex. `media.title_i18n`, `media.description_i18n`, `object_iti_info.access_i18n`, `access_i18n` dans staging) — fonctions `api.i18n_pick`, `api.i18n_pick_strict`
- **Table centrale `i18n_translation`** — fonctions `api.i18n_get_text`, `api.i18n_get_text_strict`
- **Action** : Trancher par bloc lequel est canonique. La carte canonique 6.1 indique que `*_i18n` est primaire et `i18n_translation` secondaire — vérifier qu'on respecte ça côté UI et écriture.

### G-A11Y-1 — Bloc accessibilité non unifié (sévérité : haute)
Pas de `object_accessibility` ni de pivot transverse. Distribution actuelle :
- ITI : `object_iti_info.access` (text + i18n)
- Chambres : `object_room_type.is_accessible` (bool)
- Référentiel : `ref_code_assistance_type`
- Label certifié : `object_classification` + `ref_classification_scheme.is_distinction`
- **Action** : Choisir entre (a) créer un pivot transverse, (b) consolider via `object_amenity` + famille « accessibilité », (c) garder le modèle éclaté mais documenter explicitement.

### G-API-1 — Surface d'écriture API limitée (sévérité : moyenne)
189 fonctions dans `api.*`, mais quasi exclusivement lecture, permissions, formatage, et 11 RPC d'administration. Aucune `api.upsert_object_description`, `api.upsert_contact_channel`, `api.upsert_opening_period`, etc.
- **Action** : Confirmer la stratégie d'écriture (PostgREST direct sur tables avec RLS *vs.* RPCs dédiées). Si PostgREST direct, valider la couverture RLS sur les ~155 tables RLS-enabled.

### G-DOC-1 — Documents métier mal pivoté (sévérité : basse)
La carte canonique C7 et D6 réfèrent `ref_document` pour gérer des documents métier, mais aucun pivot `object_document` n'existe. Les documents sont probablement gérés via `object_legal.document_id` et `media`.
- **Action** : Documenter dans la carte canonique que C7 doit absorber dans Médias (option déjà mentionnée).

### G-CRM-1 — Schéma `crm` vide, tables `crm_*` dans `public` (sévérité : basse)
Le schéma `crm` est créé mais vide. Les tables `crm_interaction`, `crm_task` vivent dans `public`.
- **Action** : Soit migrer les tables dans `crm`, soit supprimer le schéma vide. Faible priorité.

### G-RLS-1 — 4 tables `public` sans RLS (sévérité : moyenne)
Sur 159 tables de base dans `public`, 4 n'ont pas RLS activé.
- **Action** : Identifier précisément (croiser `live-tables.csv` colonnes `rls_enabled=false`) et décider : activer RLS ou documenter explicitement pourquoi non.

### G-STAGING-1 — Staging sans RLS (sévérité : basse, attendue)
Les 108 tables `staging` n'ont pas de RLS. Conforme à un usage import opérateur uniquement.
- **Action** : Vérifier que `staging` n'est jamais accédé depuis l'app utilisateur final.

### G-OLDDATA-1 — Volumétrie nulle pour 9 types d'objet (sévérité : moyenne)
Types `HPA`, `ITI`, `VIL`, `ASC`, `FMA`, `PCU`, `PNA`, `RVA` (et marginalement `CAMP`/`HOT`/`ORG`) n'ont aucune (ou très peu de) donnée. L'UI d'édition pour ces types ne peut être validée sans fixtures.
- **Action** : Voir `editor-detail-fixtures-plan.md`.

### G-OPENING-1 — Horaires : migration cassée + couverture massive manquante (sévérité : **bloquante**)

**Statut** : *blocker actuel* — toute autre tâche éditeur / accessibilité / fixtures détail est gelée tant que la phase 1 n'est pas exécutée.

**Constat** :
- 257 lignes `opening_period` existent, **toutes** structurellement cassées :
  - 100 % ont un nom placeholder (`Berta v2 AM` / `Berta v2 PM`)
  - 100 % ont `date_start = NULL` et `date_end = NULL`
  - 100 % sont issues d'un éclatement 1 source row = 1 chaîne complète (AM et PM séparés au lieu d'être groupés sous une période unique)
- Seulement **131 objets** (sur 935 actifs, soit ~14 %) ont au moins une période.
- **Zéro** objet `HLO` (485 objets), `HOT` (9), `CAMP` (3) n'a d'horaires — toute la couche hébergement (497 objets, 53 % du parc) est vide.
- Le seul `source_sheet` qui a alimenté la migration est `form_j_h` ; les hébergements n'ont jamais été dans cette source.
- Aucun fichier `.sql` du repo ne contient la transformation `staging.opening_period_temp → public.opening_period` — elle a été faite par un script ad-hoc hors versionning.

**Détails et causes racines** : voir [`opening-periods-migration-diagnostic.md`](opening-periods-migration-diagnostic.md).

**Action immédiate** :
1. Valider le diagnostic (produit + tech).
2. Exécuter sur staging le SQL draft [`opening-periods-repair-draft.sql`](opening-periods-repair-draft.sql) (**marqué NON EXÉCUTÉ**, finit par `ROLLBACK`) selon le plan [`opening-periods-repair-plan.md`](opening-periods-repair-plan.md).
3. Re-générer les CSV d'inventaire et confirmer 191 périodes canoniques + 257 time_periods + 1 051 weekday associations.
4. Ouvrir un ticket pour **phase 2** : comblement du segment hébergement (HLO/HOT/CAMP).

---

## Top 10 gaps (priorisés)

| # | Gap | Sévérité | Type | Action immédiate |
|---|---|---|---|---|
| **1** | **G-OPENING-1** Migration horaires cassée + 53 % du parc sans horaires | **bloquante** | old-data + missing DB surface | **Exécuter repair phase 1 sur staging** (voir [`opening-periods-repair-plan.md`](opening-periods-repair-plan.md)) |
| 2 | **G-A11Y-1** Bloc accessibilité fragmenté | haute | missing DB surface | Décision produit avant V1 : unifier ou non (gelé tant que G-OPENING-1 pas résolu) |
| 3 | **G-DESC-1** Double mécanisme i18n | haute | duplicate-risk | Documenter règle canonique par bloc |
| 4 | **G-API-1** Pas d'API d'écriture par bloc | moyenne | missing API surface | Stratégie PostgREST *vs.* RPCs ; auditer RLS |
| 5 | **G-OLDDATA-1** 9 types d'objet vides | moyenne | needs fixture | Fixtures synthétiques par type (voir fixtures plan) |
| 6 | **G-MAP-1** CSV mapping inexistant | moyenne | tooling | Transcrire MD → CSV ou abandonner CSV |
| 7 | **G-RLS-1** 4 tables `public` sans RLS | moyenne | sécurité | Auditer et trancher |
| 8 | **G-CRM-1** Schéma `crm` vide non utilisé | basse | dette | Supprimer ou migrer |
| 9 | **G-DOC-1** Pas de pivot `object_document` | basse | clarification | Documenter usage actuel (legal + media) |
| 10 | **G-STAGING-1** Staging accessible | basse | sécurité | Confirmer isolement |

### Ordre de travail recommandé après G-OPENING-1 résolu (phase 1)

1. Phase 2 horaires (coverage hébergement HLO/HOT/CAMP) — projet produit séparé.
2. G-A11Y-1 (décision modèle accessibilité).
3. G-DESC-1 + G-API-1 (stratégies écriture et i18n).
4. Reprise de [`editor-detail-fixtures-plan.md`](editor-detail-fixtures-plan.md) avec F-07 mis à jour (period incomplet) puisque les périodes vivantes seront enfin canoniques.
