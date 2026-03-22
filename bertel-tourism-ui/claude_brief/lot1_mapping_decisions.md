# Lot 1 — Canonical mapping decisions
# Berta 2.0 CSV → Bertel 3.0 unified model

**Version:** 1.1
**Date:** 2026-03-21
**Status:** Living document — updated as decisions are locked
**Last update:** 2026-03-21 — Prestations à proximité decisions locked; implementation-status table added
**Source file:** `Berta 2.0 - Berta 2.0 (1).csv` (834 rows, OTI du Sud scope)
**Target files:**
- `Base de donnée DLL et API/schema_unified.sql` — canonical schema
- `Base de donnée DLL et API/seeds_data.sql` — reference catalog
- `Base de donnée DLL et API/lot1_pilot_inserts.sql` — pilot INSERT statements
- `CLAUDE.md` — invariants and working rules
- `bertel-tourism-ui/claude_brief/lot_act_plan.md` — ACT type definition and ORG/ACTOR rules
- `bertel-tourism-ui/claude_brief/lot1_mapping_plan.md` — secondary_types, zone_touristique, distribution_channel, crm_demand_topic_oti rules

---

## Validated decisions snapshot

These decisions are locked. Do not revisit without an explicit change request.

- Active filter: `En ligne = oui` — only rows where this field is truthy are imported
- `Lot1_cross_type` is the canonical Lot 1 pilot set — 10 establishments, cross-type (see §2)
- `ACT_subpilot` exists separately and is not the main Lot 1 pilot (see §2.2)
- No ITI objects in the Lot 1 pilot — zero itinerary rows inserted
- All pilot objects inserted with `status = 'published'`
- `Accroche` → `object_description.description_chapo`
- `Descriptif` → `object_description.description`
- `Descriptif du plan d'accès` → `object_location.direction`
- No opening-hours insert for this pilot — field deliberately deferred
- `Mode de paiement` → `object_payment_method` (see §7)
- `Prestations sur place` must be pretreated token-by-token before insert (see §8)
- `Prestations à proximité` — decisions locked 2026-03-21: split into 3 destinations (see §9)
- `riviere` environment_tag code added to seeds 2026-03-21 — required for Prestations à proximité
- `salle de réunion - séminaire` → `object_meeting_room`, not object_amenity
- `jeux` (unqualified) → existing code `board_games` — no new seed
- `grand espace` → deferred, no clean schema target
- Pets and sustainability must use dedicated submodels — not forced into generic object_amenity
- 11 amenity_family codes were missing from seeds — patched 2026-03-21
- 12 new ref_amenity codes added to seeds — patched 2026-03-21
- `tickets_restaurant` added to ref_code_payment_method — patched 2026-03-21
- `site_object_id` does not exist in `object_act` — removed per lot_act_plan.md v1.3
- `object_location` → geography only; `object_relation` → object-to-object links (no exceptions)

---

## Implementation status

Three statuses apply to every decision in this document:
- **Validated** — decision is locked and agreed
- **Implemented** — the validated decision is reflected in the target file(s)
- **Pending** — validated but not yet written into the target file

| Decision group | Validated | In `seeds_data.sql` | In `lot1_pilot_inserts.sql` | Pending |
|---|---|---|---|---|
| Active filter `En ligne = oui` | ✓ | n/a | ✓ applied at row selection | — |
| Pilot set (10 objects, status=published) | ✓ | n/a | ✓ §1–2 | — |
| Descriptions (chapo, description) | ✓ | n/a | ✓ §9 | — |
| Location — direction field | ✓ | n/a | ✓ §2 | — |
| Capacity (8 rows) | ✓ | n/a | ✓ §10 | — |
| Classements + labels (10 rows) | ✓ | n/a | ✓ §11 | — |
| Amenity seeds fix (11 family codes) | ✓ | ✓ patched 2026-03-21 | n/a | — |
| 12 new ref_amenity codes | ✓ | ✓ patched 2026-03-21 | ✗ | `object_amenity` inserts not yet written |
| Mode de paiement (7-token mapping) | ✓ | ✓ (`tickets_restaurant` added) | ✗ | `object_payment_method` inserts not yet written |
| `salle de réunion - séminaire` → object_meeting_room | ✓ | n/a | ✗ | `object_meeting_room` insert not yet written |
| Prestations à proximité — env. tags (5 tokens, 5 objects) | ✓ | ✓ (`riviere` added 2026-03-21) | ✗ | `object_environment_tag` inserts not yet written |
| Prestations à proximité — nearby relations | ✓ deferred to Lot 2+ | n/a | n/a | Requires ITI/PNA/LOI target objects to exist first |
| Prestations à proximité — urban POI tokens | ✓ excluded | n/a | n/a | — |
| `ref_actor_role [operator]` seed | ✓ (CLAUDE.md + lot_act_plan.md §0) | ✗ missing | n/a | Seed line still missing in seeds_data.sql — must be added before ACT_subpilot inserts |
| i18n for 11 new amenity_family codes | ✗ not yet addressed | ✗ | n/a | Non-blocking for Lot 1; required before multilingual launch |
| i18n for 12 new ref_amenity codes | ✗ not yet addressed | ✗ | n/a | Same as above |
| Opening hours | ✓ deferred | n/a | n/a | Out of scope for this pilot |
| Sustainability V5 (9 labels, 9 cats, ~60 groups, ~240 actions, equivalences) | ✓ 2026-03-21 | ✓ sections A1–A7 in seeds_data.sql | n/a | — |
| Accessibility V5 (LBL_TOURISME_HANDICAP, famille accessibility, 32 équipements) | ✓ 2026-03-21 | ✓ section B in seeds_data.sql | n/a | — |
| migration_sustainability_v5.sql (DDL: groups, equivalence tables, views) | ✓ 2026-03-21 | ✓ Base de donnée DLL et API/migration_sustainability_v5.sql | n/a | Must be applied before seeds_data.sql V5 sections |

---

## Do not forget

These are the highest-risk invariants. Any drift here corrupts the model.

1. **ORG is not ACTOR.** `ORG` = institutional structure and SIT publication carrier (e.g., OTI du Sud). `ACTOR` = operational entity, guide, manager, commercial operator. Do not create an ORG for a commercial service provider.
2. **ACT is not PNA, not ITI, not FMA.** ACT = encadré + réservable + tarifé + durée définie. A canyoning site is PNA. A trail is ITI. A dated event is FMA. A guided paid activity is ACT.
3. **object_amenity is on-site only.** A nearby facility (tennis court down the road, public parking) must not go into object_amenity. Use object_relation [nearby] or object_environment_tag instead.
4. **Do not mix `Prestations sur place` and `Prestations à proximité`.** These are different source columns with different semantic destinations. Tokens must not be merged during preprocessing.
5. **Amenity tokens must be pretreated, never inserted raw.** The source value is a comma-separated string. Each token must be individually mapped before any INSERT.
6. **Payment method tokens must not include booking platforms.** Airbnb, Booking.com are distribution channels, not payment methods.
7. **`object_relation.distance_m` is the correct field for explicit proximity distances.** Do not use object_description.extra as a substitute proximity store.
8. **`site_object_id` does not exist.** One source of truth per concept. Geography → object_location. Object links → object_relation.
9. **`En ligne = oui` is the active filter.** Do not import offline records.
10. **`Eurocard` normalizes to `mastercard`.** Eurocard was merged into the Mastercard network — no separate code.

---

## 1. Architecture invariants

### 1.1 ORG vs ACTOR (canonical rule)

| Layer | Role | Examples |
|---|---|---|
| `ORG` (object_type) | Institutional structure. SIT publication carrier. Organizational anchor for objects. | OTI du Sud, CIVIS, Chambre de Commerce, fédération sportive |
| `ACTOR` (table `actor`) | Real operator, manager, guide, monitor, direct operational contact. Physical or legal commercial entity operating a service. | Gîte manager, canyon guide, parapente operator, hotel GM |

Source: `CLAUDE.md` §Business invariants, `lot_act_plan.md` §0.

**Attachment pattern for an ACT object:**
- `object_org_link [publisher]` → ORG (e.g., OTI du Sud) — institutional SIT portage
- `actor_object_role [operator]` → ACTOR — commercial operational entity
- `object_relation [based_at_site]` → PNA (optional) — where the activity takes place
- `object_relation [uses_itinerary]` → ITI (optional) — trail/route used
- `object_location` → GPS coordinates of the meeting/departure point

### 1.2 Object type semantics

| Type | Definition | Is NOT |
|---|---|---|
| `PNA` | Fixed nature/adventure site or spot (geography-anchored) | A commercial service |
| `ITI` | Structured geographic trail/route (LINESTRING geometry) | A guided paid outing |
| `FMA` | Dated event (concert, festival, manifestation) | A recurring on-demand activity |
| `ACT` | Encadré + réservable + tarifé + durée définie | A place, a trail, an event |
| `LOI` | Leisure center or activity center (free access or entry) | A guided commercial service |
| `ORG` | Institutional structure, SIT publisher | A commercial operator |

Source: `lot_act_plan.md` §0, §1.

### 1.3 Geography vs object-to-object links

- **`object_location`** — geography only (lat/lng, address, direction text, zone)
- **`object_relation`** — all object-to-object links (proximity, hierarchy, itinerary use, site anchor)
- `site_object_id` does not exist in `object_act` — removed. Use `object_relation [based_at_site]` instead.

---

## 2. Pilot selection

### 2.1 Lot1_cross_type (main pilot — 10 objects)

Active filter applied: `En ligne = oui`.

| ID | Name | object_type |
|---|---|---|
| recCSnhcZo4XxocjX | Canyon Aventure | ACT |
| recdw4lpGQlrscCXF | Ascendance Parapente | ACT |
| recSSTvKv6Jh4BYzZ | Maison du Curcuma | ACT |
| recN5bNxgghhfpEHE | La Kaz | RES |
| rec7uNHsQPt5wZPCY | Le Gadjak | RES |
| recr8fxU0od0bvvnh | Domaine Paille en Queue — Sud Sauvage | HLO |
| recr1yhoYV0cSykCz | Côté Volcan | HLO |
| d5c7c61d | Gîte Là-Haut | HLO |
| rec5vqdPwSdrFzsvs | Dimitile Hôtel | HOT |
| recmG8eVRN6kwvyRU | La Cité du Volcan | LOI |

### 2.2 ACT_subpilot

`ACT_subpilot` exists separately and is not the main Lot 1 pilot. It has not been executed yet. It should run after Lot1_cross_type is validated, because ACT objects depend on ORG, ACTOR, and seed prerequisites (`ref_actor_role [operator]`) that must be confirmed first.

### 2.3 No ITI in Lot 1

Zero itinerary objects are inserted in this pilot. The `uses_itinerary` and `based_at_site` relation types exist in the schema but are not populated in the pilot.

---

## 3. Object-level fields

### 3.1 `object.status`

All 10 pilot objects inserted with `status = 'published'`. Previous drafts used `'draft'` — corrected.

### 3.2 `object.org_object_id`

Set to the OTI du Sud object ID for all pilot objects (prerequisite: OTI du Sud object must exist before pilot inserts run).

---

## 4. Description and location fields

### 4.1 Field mapping

| Source column (Berta 2.0) | Target | Target column |
|---|---|---|
| `Accroche` | `object_description` | `description_chapo` |
| `Descriptif` | `object_description` | `description` |
| `Descriptif du plan d'accès` | `object_location` | `direction` |

`org_object_id` on `object_description` rows is set to OTI du Sud object ID.

Idempotence: all description inserts use `WHERE NOT EXISTS` guard.

### 4.2 Direction (plan d'accès) — null handling

La Cité du Volcan: source field empty → `direction = NULL`. All others populated from source.

---

## 5. Capacity

### 5.1 Mapping rules

| object_type | Source value | Target metric in object_capacity |
|---|---|---|
| ACT | Max group size / participants | `max_capacity` |
| RES | Number of covers | `seats` |
| HOT | Total bed/room capacity | `max_capacity` |
| HLO | Max guests | `max_capacity` |
| LOI | Contextual | (see below) |

### 5.2 Pilot capacity inserts (8 rows — 2 skipped)

| Object | Metric | Value | Notes |
|---|---|---|---|
| Canyon Aventure | max_capacity | 12 | ACT — group size |
| Ascendance Parapente | max_capacity | 4 | ACT — group size |
| La Kaz | seats | 60 | RES — covers |
| Le Gadjak | seats | 30 | RES — covers |
| Dimitile Hôtel | max_capacity | 87 | HOT — total guests |
| Côté Volcan | max_capacity | 6 | HLO |
| Gîte Là-Haut | max_capacity | 10 | HLO |
| Domaine Paille en Queue | max_capacity | 14 | HLO |
| Maison du Curcuma | — | — | Source empty — skipped |
| La Cité du Volcan | — | — | Source empty — skipped |

---

## 6. Classements and Labels

### 6.1 Classification inserts (4 rows)

| Object | scheme | value |
|---|---|---|
| Dimitile Hôtel | hot_stars | 4 |
| Domaine Paille en Queue | meuble_stars | 4 |
| Côté Volcan | gites_epics | 3 |
| Gîte Là-Haut | gites_epics | 3 |

### 6.2 Label inserts (6 rows)

| Object | scheme | value |
|---|---|---|
| Canyon Aventure | LBL_QUALITE_TOURISME | granted |
| Canyon Aventure | qualite_tourisme_reunion | granted |
| Dimitile Hôtel | LBL_QUALITE_TOURISME | granted |
| Dimitile Hôtel | qualite_tourisme_reunion | granted |
| La Cité du Volcan | LBL_QUALITE_TOURISME | granted |
| La Cité du Volcan | qualite_tourisme_reunion | granted |

### 6.3 Blocked labels (documented in SQL comments)

| Label | Reason blocked |
|---|---|
| `tourisme_handicap` | Retired — V5 canonical: `LBL_TOURISME_HANDICAP`. TST inserts left as-is (deferred — see §6.4). |
| `LBL_ECO_LABEL_UE` | No `granted` value defined in scheme — **resolved in V5 seeds** |
| Gîtes de France | No scheme defined in ref_classification_scheme |
| Certification clientèle indienne | No scheme defined |

### 6.4 V5 canonical code migration — status

The following old scheme codes have been **retired from the canonical seed path** in `seeds_data.sql` (2026-03-22). Their INSERT blocks and dependent UPDATE/value rows have been removed. V5 canonical codes are authoritative going forward.

| Old code (retired) | V5 canonical code | Seeded in |
|---|---|---|
| `green_key` | `LBL_CLEF_VERTE` | DÉVELOPPEMENT DURABLE V5 section |
| `eu_ecolabel` | `LBL_ECO_LABEL_UE` | DÉVELOPPEMENT DURABLE V5 section |
| `destination_excellence` | `LBL_DESTINATION_EXCELLENCE` | DÉVELOPPEMENT DURABLE V5 section |
| `qualite_tourisme` | `LBL_QUALITE_TOURISME` | DÉVELOPPEMENT DURABLE V5 section |
| `tourisme_handicap` | `LBL_TOURISME_HANDICAP` | ACCESSIBILITÉ V5 section |
| `qualite_tourisme_reunion` | *(no V5 equivalent — kept as-is)* | lot-1 schemes block |

**TST object_classification recoding — deferred.**
The TST test data inserts that reference old codes (`green_key`, `tourisme_handicap`) have been left untouched in this pass. Reasons:
1. **Execution order**: V5 scheme seeds (`LBL_CLEF_VERTE` at line ~5615, `LBL_TOURISME_HANDICAP` at line ~6964) are seeded after the TST inserts (~lines 1759–4852) in the same file. Recoding without moving the seed blocks would produce silent no-ops at the same lines.
2. **Already broken**: the `tourisme_handicap` TST inserts use wrong value codes (`auditif`/`moteur` vs seeded `auditive`/`motor`) and the `green_key` inserts reference a value (`green_key`) that was never seeded. Both are already no-ops.

TST recoding is deferred to a future cleanup pass when the full TST section is refactored or V5 scheme seeds are moved earlier.

---

## 7. Mode de paiement → object_payment_method

### 7.1 Mapping rules

| Source token | Target code | Notes |
|---|---|---|
| `Carte Bancaire` | `carte_bleue` | Existing code |
| `Chèque` | `cheque` | Existing code |
| `Espèces` | `cash` | Existing code |
| `Chèques Vacances` | `cheque_vacances` | Existing code |
| `Virement bancaire` | `virement` | Existing code |
| `Eurocard` | `mastercard` | Normalization: Eurocard merged into Mastercard network — no separate code |
| `Tickets restaurant` | `tickets_restaurant` | New code added to seeds 2026-03-21 |

**Hard rule:** Booking platforms (Airbnb, Booking.com) are distribution channels, not payment methods. Do not insert them into `object_payment_method`.

### 7.2 Seeds change

`tickets_restaurant` added to `ref_code_payment_method` in `seeds_data.sql` (2026-03-21):
- Code: `tickets_restaurant`
- Label: `Tickets restaurant`
- Description: `Titres-restaurant (Sodexo, Edenred, Up) acceptés`
- Distinct from `cheque_vacances` (ANCV).

---

## 8. Prestations sur place → object_amenity (and other submodels)

### 8.1 Preprocessing rule

The source value is a raw comma-separated string. It must be split and each token individually mapped before any INSERT. Raw string insertion is forbidden.

### 8.2 Seeds fix — 11 missing amenity_family codes

Before this pilot session, 11 amenity_family codes referenced in `ref_amenity` VALUES were absent from `ref_code_amenity_family`. This caused silent insertion failure for the majority of ref_amenity rows (only `services`, `outdoor`, `accessibility` families were seeding correctly). Fixed by adding the 11 codes to `seeds_data.sql` (2026-03-21).

Affected families: `general`, `climate_control`, `kitchen`, `kids`, `pets`, `bathroom`, `bedroom`, `entertainment`, `security`, `parking`, `sports`.

### 8.3 Amenity family consolidation — canonical code is `accessibility` (2026-03-22)

**Invariant (locked):** The canonical amenity family code for accessibility is `accessibility`. The intermediate V5 code `accessibilite` is retired. All accessibility amenities must use `acc_*` codes.

**History:**
- `accessibility` family: original pre-V5 code with 22 legacy amenity rows (wheelchair_access, accessible_bathroom, etc.).
- `accessibilite` family: added by V5 migration with 33 `acc_*` amenity rows (original B-4 block comment incorrectly said "32 items" — actual count was 33). Briefly set as canonical on 2026-03-22, then reversed the same day — `accessibility` was chosen as the long-term global canonical code for consistency.
- Normalization pass 2026-03-22: 22 legacy non-`acc_*` rows removed; 10 new canonical `acc_*` codes added; final catalog = 43 `acc_*` codes only.

**Final state after normalization pass (2026-03-22):**
1. `api_views_functions.sql` line ~1232: rank-1b filter uses `fam.code = 'accessibility'`.
2. `seeds_data.sql` line ~175: `accessibility` family seed active.
3. `seeds_data.sql` lines ~589–594: 22 legacy non-`acc_*` rows **removed** — replaced with redirect comment pointing to V5 section.
4. `seeds_data.sql` line ~1346: `accessibility` i18n row active.
5. `seeds_data.sql` B-3 block (~line 3450): V5 family seed inserts under code `'accessibility'`.
6. `seeds_data.sql` B-4 block (~line 3462): 43 `acc_*` amenity rows joined to `'accessibility'` family (33 original V5 + 10 new canonical codes added 2026-03-22).
7. `seeds_data.sql` migration DO block: migrates any pre-loaded `accessibilite` rows → `accessibility`, then deletes `accessibilite` if orphaned. Validates exactly one family remains.
8. `api_views_functions.sql` `get_filtered_object_ids()`: two new accessibility type filters added 2026-03-22 (`disability_types_any`, `label_disability_types_any`) — see §8.7.

**Note:** `schema_unified.sql:4696` contains `'accessibility'` as a `ref_legal_type` code — completely separate table, out of scope for this consolidation. Do not conflate.

### 8.4 Accessibility normalization pass (2026-03-22)

Full normalization applied to bring the accessibility catalog to a single canonical vocabulary.

#### 22 legacy non-`acc_*` codes removed

All removed from `seeds_data.sql` and from the DB cleanup DO block:

| Category | Removed codes |
|---|---|
| EXACT V5 duplicate | `tactile_flooring`, `audio_description`, `induction_loop`, `subtitles_available`, `easy_read`, `pictograms` |
| NEAR V5 equivalent | `accessible_parking`, `large_print`, `visual_alerts` |
| BROAD V5 equivalent | `wheelchair_access`, `accessible_bathroom`, `hearing_impaired` |
| NO-EQUIV — now replaced by new `acc_*` codes | `braille_signage`, `guide_dog_welcome`, `sign_language`, `written_communication`, `quiet_space`, `sensory_room`, `staff_trained_cognitive`, `staff_trained_mental`, `flexible_visit`, `low_stimulation` |

#### 10 new canonical `acc_*` codes added

Added to `seeds_data.sql` B-4 block, family `accessibility`, scope `object`, `accessibility_seed_v: "v5"`:

| New code | Name | Replaces legacy |
|---|---|---|
| `acc_braille_signage` | Signalétique braille | `braille_signage` |
| `acc_guide_dog_welcome` | Chien guide accepté | `guide_dog_welcome` |
| `acc_sign_language` | Personnel LSF | `sign_language` |
| `acc_written_communication` | Communication écrite disponible | `written_communication` |
| `acc_quiet_space` | Espace calme dédié | `quiet_space` |
| `acc_sensory_room` | Salle sensorielle | `sensory_room` |
| `acc_staff_cognitive_training` | Personnel formé — handicap cognitif | `staff_trained_cognitive` |
| `acc_staff_mental_training` | Personnel formé — santé mentale | `staff_trained_mental` |
| `acc_flexible_visit` | Visite flexible | `flexible_visit` |
| `acc_low_stimulation` | Option basse stimulation | `low_stimulation` |

**Final catalog state:** family `accessibility`, **43 `acc_*` codes** only (33 original V5 + 10 new). No non-`acc_*` code survives under this family.

#### Sustainability pre-V5 vocabulary removal (2026-03-22)

Pre-V5 sustainability seed blocks removed from `seeds_data.sql`. V5 vocabulary (`CAT_*`, `SA_*`, `MA_*`) is the sole canonical vocabulary.

**Pre-V5 categories removed** (5 codes): `energy`, `water`, `waste`, `mobility`, `biodiversity`
- Replaced by V5 `CAT_*` equivalents: `CAT_ENERGY`, `CAT_WATER`, `CAT_WASTE`, `CAT_MOBILITY`, `CAT_BIO`

**Pre-V5 actions removed** (16 codes): `led_lighting`, `smart_thermostats`, `solar_water_heating`, `renewable_electricity`, `low_flow_devices`, `rainwater_harvesting`, `greywater_reuse`, `sorting_points`, `composting`, `bulk_amenities`, `bike_parking`, `ev_charging`, `public_transport_info`, `native_plants`, `no_pesticides`, `wildlife_corridors`
- Each maps to one or more V5 `MA_*` actions under the corresponding `SA_*` group.

**DB cleanup DO block added** at the position of the removed INSERTs: idempotently DELETEs pre-V5 actions and categories from any DB instance seeded before this normalization pass.

**Pre-V5 category and action i18n UPDATE blocks removed** from the translations section (were no-ops after row removal).

**`tourisme_handicap` deferred no-op i18n rows removed** (lines ~1901–1907): these targeted classification values that no longer exist (`auditive`, `mental`, `motor`, `visual` under the retired scheme). No functional loss.

#### Two normalization resolution decisions (locked)

| Pre-V5 code | Canonical V5 resolution | Rationale |
|---|---|---|
| `solar_water_heating` | `MA_SOLAR_THERMAL` (already present in V5 at `SA_ONSITE_RENEWABLE_ENERGY`) | Solar thermal is on-site renewable energy production, not efficiency. `MA_SOLAR_THERMAL` was already seeded — no new row needed. |
| `wildlife_corridors` | `MA_WILDLIFE_CORRIDORS` (new, added 2026-03-22 under `SA_BIODIVERSITY_PROTECTION`, position 20215) | No existing MA_* covered corridor-specific land management. Concept preserved at correct precision level. |

### 8.5 Token mapping decisions

#### Exact existing destination (no new seed)

| Source token | Target | Code | Notes |
|---|---|---|---|
| `jeux` (unqualified, no "salle de jeux" context) | `object_amenity` | `board_games` | Dimitile Hôtel: token listed bare alongside pool/spa — no dedicated room indicated |
| `climatisation` | `object_amenity` | `air_conditioning` | |
| `chauffage` | `object_amenity` | `heating` | |
| `wifi` | `object_amenity` | `wifi` | |
| `piscine` / `piscine chauffée` | `object_amenity` | `swimming_pool` | Heated pool is a variant — same code |
| `parking` | `object_amenity` | `parking` | |
| `barbecue` | `object_amenity` | `bbq` | |
| `terrasse` | `object_amenity` | `common_terrace` | |
| `TV satellite` | `object_amenity` | `tv` | |
| `balcon` | `object_amenity` | `balcony` | |
| `articles de toilette` | `object_amenity` | `toiletries` | |
| `douche` | `object_amenity` | `shower` | |
| `baignoire` | `object_amenity` | `bathtub` | |
| `bar` | `object_amenity` | `bar` | |
| `SPA` / `espace spa - bien être` | `object_amenity` | `spa` | Spa center code, services family |
| `petit déjeuner` (any variant) | `object_amenity` | `breakfast` | |
| `Cafetière` | `object_amenity` | `coffee_machine` | |

#### Different submodel — not object_amenity

| Source token | Target | Reason |
|---|---|---|
| `salle de réunion - séminaire` | `object_meeting_room` | Structured space with cap_theatre / cap_u / cap_classroom fields. INSERT a presence row. |

#### Mapped via new ref_amenity seed (12 codes added 2026-03-21)

| Source token | New code | Family | Notes |
|---|---|---|---|
| `ventilateur` | `fan` | climate_control | Distinct from AC; common in Réunion |
| `téléphone` | `telephone` | general | In-room or common area phone |
| `linge de toilette` | `towels` | bathroom | Towels ≠ bathrobes (peignoirs) |
| `sanitaires privés` | `private_bathroom` | bathroom | En-suite bathroom — key HLO/gîte signal |
| `sanitaires communs` | `shared_bathroom` | bathroom | Shared sanitary block — opposing signal |
| `linge de maison` | `bed_linen` | bedroom | Bed linen (sheets, duvet) ≠ towels |
| `mobilier d'extérieur` | `outdoor_furniture` | outdoor | Terrace furniture ≠ sunbeds (beach-specific) |
| `pressing` | `pressing` | services | Dry-cleaning ≠ laundry (blanchisserie) |
| `boutique` | `boutique` | services | On-site shop |
| `réception` | `reception` | services | Front desk ≠ concierge (premium layer) |
| `Massages bien être` | `massage` | wellness | First code in wellness family; treatment ≠ spa center |
| `salle à manger` | `dining_room` | gastronomy | Shared dining room (non-commercial) ≠ restaurant |

#### Deferred — no clean schema target

| Source token | Reason |
|---|---|
| `grand espace` | Qualitative marketing descriptor; no discrete amenity semantics; already captured by description |
| `espace de restauration` / `restauration` | Ambiguous between `restaurant` and `dining_room`; needs context per establishment |
| `Cuisine de produits frais locaux` | Marketing text / process description — not an amenity |
| `sur réservation` | Booking condition — not an amenity |
| `vue montagne` | Environment tag domain (`montagne`) — not an amenity |
| `cuisine au bois` | Culinary technique — not an amenity |
| `matériel pour l'activité` | Activity equipment — ACT-specific, not a generic amenity |
| `visites pédagogiques` | Service offering — not an amenity |
| `parking autocar` | No bus-compatible parking code; could extend parking family in future |
| `bouilloire` | No code; could add `kettle` in kitchen family in future |

### 8.7 Accessibility API filter evolution (2026-03-22)

Two new filter parameters added to `api.get_filtered_object_ids()` in `api_views_functions.sql`. Additive — no existing filter changed.

#### `disability_types_any`

**Semantic:** returns objects with ≥1 `acc_*` amenity whose `ref_amenity.extra->'disability_types'` array contains at least one of the requested values.
**Source:** `object_amenity → ref_amenity.extra->'disability_types'`
**Empty array behavior:** no effect.
**MV bypass:** yes — `cached_amenity_codes` does not carry disability-type metadata.

#### `label_disability_types_any`

**Semantic:** returns objects with an explicit `LBL_TOURISME_HANDICAP` grant (`status = 'granted'`) whose `object_classification.subvalue_ids` contain ≥1 subvalue whose `ref_classification_value.metadata->>'disability_type'` matches a requested value.
**Source:** `object_classification.subvalue_ids → ref_classification_value.metadata`
**Important:** does not infer from amenities — certified label with typed subvalues only.
**Empty array behavior:** no effect.
**MV bypass:** yes — `subvalue_ids` is not in `mv_filtered_objects`.

#### Canonical vocabulary (locked)

`motor` · `hearing` · `visual` · `cognitive` — mirrors the 4 T&H disability-type subvalues.

#### Validation status

All 6 tests passed on `Dimitile Hôtel` in a transaction rollback (2026-03-22). See `api_views_functions_audit.md` Priority 5c for full validation record.

---

### 8.6 Pets and sustainability reclassification rule

- **Pet-related** source tokens: use `object_pet_policy` (accepted BOOLEAN, conditions TEXT) as the canonical destination. Only `pet_bowls` and `pet_bed` go to `object_amenity` (physical equipment). `pet_friendly` → `object_pet_policy.accepted = true`.
- **Sustainability-related** source tokens: use `object_sustainability_action → ref_sustainability_action` as the canonical destination. The `sustainable` amenity_family has zero codes by design — do not add sustainability concepts to ref_amenity.
- Note: `electric_charging` is a dual-presence code (`ref_amenity` parking family for guest amenity, `ref_sustainability_action` mobility category for sustainability commitment). Source context determines the correct destination.

None of the 10 Lot1_cross_type pilot objects have pet-related or sustainability-related tokens in their `Prestations sur place` field — this rule applies from Lot 2 onward.

---

## 9. Prestations à proximité

### 9.1 Status: decisions locked 2026-03-21

The field is split into 3 destinations. Seeds updated. Pilot inserts pending.

The schema had no fundamental gap. Existing targets: `object_environment_tag` (M:N junction, now 31 codes including `riviere`) and `object_relation [nearby]` with `distance_m` field. Urban POI tokens belong to an external data layer, not this SIT import.

### 9.2 Destination 1 — Import into `object_environment_tag` (validated + seeds implemented)

`riviere` seed added to `seeds_data.sql` 2026-03-21. All 5 codes are now available.

Raw token normalization required before INSERT:

| Raw source token | Target code | Normalization |
|---|---|---|
| `plage` | `plage` | Exact match |
| `forêt` | `foret` | Unaccent |
| `Centre - Ville` / `centre-ville` | `centre_ville` | Lowercase + strip separators |
| `point de vue panoramique` | `vue_panoramique` | Phrase match |
| `riviere` | `riviere` | Exact match (already unaccented in source) |

**5 pilot objects receive environment tags — pilot inserts not yet written:**

| Object | Tags to insert |
|---|---|
| Le Gadjak | `centre_ville` |
| Gîte Là-Haut | `vue_panoramique`, `foret` |
| Canyon Aventure | `riviere` |
| Maison du Curcuma | `vue_panoramique` |
| Dimitile Hôtel | `vue_panoramique`, `centre_ville` |

Note: Canyon Aventure's field also contains `Bassin de Manapany` — a named coastal natural site. This is not covered by the 5 import-now codes; defer to `object_relation [nearby]` → PNA when PNA objects exist.

**5 pilot objects receive nothing** from this field (empty field or only deferred/excluded tokens): La Kaz, Côté Volcan, Ascendance Parapente, Domaine Paille en Queue, La Cité du Volcan.

### 9.3 Destination 2 — Defer to `object_relation [nearby]` (validated, not yet implementable)

These tokens have a clean model target but require typed objects (ITI, PNA, LOI, PCU) to exist in the database before the relation can be inserted. Deferred to Lot 2+ when those objects are loaded.

| Token | Relation target type | Note |
|---|---|---|
| `sentier de randonnée` | ITI | Hiking trail |
| `sentier de grande randonnée` | ITI | Long-distance GR trail |
| `équitation` | LOI | Equestrian center |
| `VTT` | ITI or LOI | Mountain biking trail or facility |
| `pêche` | PNA or LOI | Fishing access point |
| `tennis` (when not on-site) | LOI | Nearby public court — must not use `object_amenity [tennis_court]` which is on-site only |
| `sites touristiques` | PCU, LOI (generic) | Too generic for a single relation; derive from explorer radius search |
| `site / lieu culturel` | PCU | Only when a real typed PCU target object exists. Do NOT fall back to `patrimoine` environment_tag automatically. |

### 9.4 Destination 3 — Excluded (external POI / geospatial layer)

These tokens describe public urban infrastructure. They do not belong in SIT import data. They are geospatially derivable from OSM or public transport data.

`commerce alimentaire`, `parking public`, `arrêt bus`, `poste / boîte aux lettres`, `station service`, `boulangerie`

### 9.5 Still deferred — ambiguous

`point chaud` — likely a nearby snack/hot-meal point → could link to RES via `object_relation [nearby]`, but the token is too ambiguous to import without normalization. Deferred.

---

## 10. Opening hours

Opening hours (`Horaires d'ouverture` or equivalent) are **not imported** in the Lot 1 pilot. The field is identified in the source but deliberately deferred. No `object_opening` rows are inserted for any pilot object.

---

## Pending implementation

Decisions validated but not yet written into target files:

1. **`object_amenity` inserts** — 12 new amenity codes are seeded; pilot INSERT rows for object_amenity are not yet in `lot1_pilot_inserts.sql`. Affects: Dimitile Hôtel (largest set), Le Gadjak, Côté Volcan, Gîte Là-Haut, Domaine Paille en Queue, Ascendance Parapente.
2. **`object_payment_method` inserts** — mapping validated (§7); INSERT rows not yet in `lot1_pilot_inserts.sql`. Affects: La Kaz, Le Gadjak, Domaine Paille en Queue.
3. **`object_meeting_room` insert** — Dimitile Hôtel has `salle de réunion - séminaire` in Prestations sur place; presence row not yet written.
4. **`object_environment_tag` inserts** — 5 pilot objects, 7 total tag assignments (§9.2); inserts not yet written.

## Pending investigation

Items not yet resolved or validated:

1. **`espace de restauration` / `restauration`** (Prestations sur place) — context-dependent: could be `restaurant` (on-site commercial) or `dining_room` (shared non-commercial). Needs disambiguation per establishment before INSERT.
2. **`parking autocar`** (Prestations sur place — Gîte Là-Haut) — no dedicated code; could extend parking family with `bus_parking` in a future seed pass; deferred.
3. **`bouilloire`** (Prestations sur place — Dimitile Hôtel) — no code; could add `kettle` in kitchen family in a future seed pass; deferred.
4. **`ref_actor_role code = 'operator'`** — **HIGH PRIORITY.** Model decision is already locked: `actor_object_role [operator]` is the canonical attachment for ACT objects, defined in `CLAUDE.md` §Standard ACT attachment pattern and `lot_act_plan.md` §0. `guide` is seeded; `operator` is absent from every `ref_actor_role` INSERT block in `seeds_data.sql`. Only the seed line is missing. Must be added before any ACT_subpilot inserts run.
5. **i18n for 11 new amenity_family codes** — the i18n UPDATE block in `seeds_data.sql` covers only the original 10 families. The 11 new families (`general`, `climate_control`, etc.) will have `name_i18n = NULL`. Non-blocking for Lot 1; must be addressed before multilingual launch.
6. **i18n for 12 new ref_amenity codes** — same gap: the new codes (`fan`, `telephone`, `towels`, etc.) have no `name_i18n` / `description_i18n` entries. Non-blocking for Lot 1; must be addressed before multilingual launch.
7. **LOI capacity for La Cité du Volcan** — source field empty; no capacity row inserted. Verify with data owner whether a capacity value exists elsewhere.
8. **Label gaps** — `LBL_ECO_LABEL_UE` gap **resolved in V5 seeds** (`granted` value now seeded). `tourisme_handicap` retired — canonical scheme is now `LBL_TOURISME_HANDICAP` with value `granted`; TST recoding deferred (see §6.4). Gîtes de France (no scheme) and Certification clientèle indienne (no scheme) still require catalog additions before import.
