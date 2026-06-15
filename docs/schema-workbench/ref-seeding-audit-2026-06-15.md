# Reference-data Seeding Audit — 2026-06-15

**Scope:** all reference vocabularies of the Bertel tourism CRM — ~70 ref units = 58 non-empty `ref_code` domains + 8 empty `ref_code` partitions + ~24 standalone `ref_*` tables (incl. the 19 `taxonomy_*` branches).
**Method:** three planes reconciled per unit — LIVE (Supabase MCP read-only SELECT), SOURCE (seed/DDL/migration SQL), DOC (`docs/api-db-reference.html`, generated from `db-graph-out`). Read-only diagnostic; **no fix is applied here** — every remediation is a proposal.
**Inputs:** 10 cluster slices (`docs/schema-workbench/audit-2026-06-15-cluster-{1..10}.json`), reconciled into the matrix and findings below. Controller-verified facts override any conflicting cluster claim.

---

## 1. Executive summary

Across ~70 reference units the **vocabulary counts are almost universally sound** — live, source, and doc agree on row counts for every non-taxonomy domain, FK integrity is clean across the classification/sustainability graph, and the `object_type` enum ↔ taxonomy-branch mapping is **verified 1:1 (19↔19, incl. the new SPU/PRD)**. The defects are concentrated in three places: (a) a small number of **seed/live drift** rows that will break a write or a fresh-apply, (b) a broad but low-severity **i18n gap** (en/es holes on specific domains; zh/el absent everywhere by design), and (c) **structural/maintainability** smells (default-partition routing, dead domains, a stale doc plane). Most "0 rows" findings are **forward-looking, not dead** — the imported pilot dataset simply has not exercised them yet.

Finding totals by severity (normalized 4-level scale, after dedup): **5 high · 12 medium · 19 low** (36 distinct findings; INFO folded into low, repeated global findings counted once).

Top findings:

- **[HIGH] `ref_iti_assoc_role` is completely unseeded** — 0 rows live AND 0 INSERT in any source file. `save_object_itinerary_nested` raises SQLSTATE `23503` ("Unknown itinerary association role") on the first ITI write that carries an associated object. Latent (0 ITI live), surfaces at first ITI authoring. [C3]
- **[HIGH] Accessibility V5 vocabulary only partially applied to live** — 21 `MA_*` actions + 7 `SA_*` groups present in source (`seeds_accessibility_v5.sql`) but absent live (239/76 vs 260/83), and `LBL_TOURISME_HANDICAP` has **0** equivalence-group/action rows → it can never be scored by `v_object_classification_coverage`, a dead-end for PMV-001 despite 4 objects already carrying that label. [C8]
- **[HIGH] `ref_legal_type.raison_sociale` is source-only** — present in `schema_unified.sql` (17 codes), absent live (16). Fresh DB ≠ live; an `object_legal` row keyed to `raison_sociale` would be rejected by the FK on live. Deploy-integrity violation. [C9]
- **[HIGH] 43 `acc_*` accessibility amenities are FR-only** — all 43 lack en/es, yet they render in the §10 Tourisme & Handicap badge/card UI. [C5]
- **[HIGH] `weekday.dow_number` is NULL for all 7 rows** — seeds wrote `position` into the wrong column; ISO day-of-week ordering is unavailable. [C6]
- **[MEDIUM] Zero-en/es i18n on `view_type` (13) and `media_tag` (23)** — neither domain ever received a translation UPDATE block. [C2/C4]
- **[MEDIUM] Seeded-ahead cohort (10 domains, no consumer wired — NOT deprecated)** — `transport_type/package_type/service_type/tourism_type/destination_type` + `booking_status/client_type/partnership_type/insurance_type/feedback_type`: fully seeded with complete en/es, but **no slot exists to fill them** (controller-verified: 0 consumer columns in `public`, 0 `object_taxonomy` rows). Unlike forward-looking domains that have a wired slot and self-populate as objects are authored, these need a feature built first → PO decision: roadmap or deactivate. Several may be superseded by a wired sibling (`feedback_type`↔`ref_review_source`, `insurance_type`↔`ref_legal_type`, `client_type`↔CRM vocab, `service_type`↔`taxonomy_psv`). [C3/C6]
- **[MEDIUM] Doc plane is stale** — `api-db-reference.html` (from `db-graph-out`) lacks the §61 CRM vocab and inflates taxonomy "valeurs" counts ~3× (it aggregates `ref_code` + closure rows). "Regenerate db-graph + doc" is itself a remediation item. [C6/C10]

---

## 2. Per-table matrix

> Every ref unit appears exactly once, grouped by cluster. `Live`/`Source`/`Doc` are row counts; `DB usage` is distinct codes actually referenced by live data.

### Cluster 1 — Menu / food vocabularies
| Unit | Live | Source | Doc | DB usage | Verdict |
|---|---|---|---|---|---|
| allergen | 14 | 14 | 14 | 0 | CLEAN — 3-plane match; forward-looking (no RES menus authored); en/es complete |
| cuisine_type | 29 | 29 | 29 | 0 | CLEAN — 3-plane match; forward-looking; en/es complete (note: `vegan` overlaps `dietary_tag:vegan` — D3/low) |
| dietary_tag | 12 | 12 | 12 | 0 | CLEAN — 3-plane match; forward-looking; en/es complete |
| menu_category | 10 | 10 | 10 | 0 | CLEAN — 3-plane match; forward-looking; en/es complete |

### Cluster 2 — Accommodation / capacity vocabularies
| Unit | Live | Source | Doc | DB usage | Verdict |
|---|---|---|---|---|---|
| accommodation_type | 10 | 10 | 10 | 0 | HEALTHY — match; en/es complete; forward-looking (taxonomy not yet assigned) |
| room_type | 10 | 10 | 10 | 0 | HEALTHY — match; en/es complete; 0 `object_room_type` rows |
| view_type | 13 | 13 | 13 | 0 | PARTIAL — counts match but **all 13 en/es missing** (D2/medium) |
| meeting_equipment | 11 | 11 | 11 | 0 | HEALTHY — match; en/es complete; all `position` NULL (D3/low) |
| season_type | 10 | 10 | 10 | 0 | HEALTHY — match; en/es complete; also feeds `object_price.season_code` (string FK) |
| ref_capacity_metric | 12 | 12 | 12 | 2 | HEALTHY — match; 2 active (max_capacity 566, seats 92); i18n via EAV `i18n_translation` (by design) |
| ref_capacity_applicability | 60 | 60 | 60 | n/a | HEALTHY — 60 rows; all 19 enum types covered by max_capacity; ACT max_capacity-only (D3/low) |

### Cluster 3 — Activity / ITI vocabularies
| Unit | Live | Source | Doc | DB usage | Verdict |
|---|---|---|---|---|---|
| activity_type | 10 | 10 | 10 | 0 | SEEDED — Explorer filter wired; forward-looking (ASC/ACT) |
| iti_practice | 16 | 16 | 16 | 0 | SEEDED — FE read/save wired; 0 ITI objects; forward-looking |
| transport_type | 10 | 10 | 10 | 0 | SEEDED-AHEAD — 0 consumer column, 0 object_taxonomy rows; **PO triage: roadmap or deactivate** |
| package_type | 10 | 10 | 10 | 0 | SEEDED-AHEAD — 0 consumer column, 0 object_taxonomy rows; **PO triage: roadmap or deactivate** |
| service_type | 10 | 10 | 10 | 0 | SEEDED-AHEAD — 0 consumer column, 0 object_taxonomy rows; **PO triage: roadmap or deactivate** |
| event_type | 10 | 10 | 10 | 0 | SEEDED — intended for FMA; forward-looking |
| mood | 10 | 10 | 10 | 0 | SEEDED-DISCONNECTED — CRM FK repointed to `crm_sentiment` (§61); now taxonomy-only, 0 rows |
| tourism_type | 10 | 10 | 10 | 0 | SEEDED-AHEAD — 0 consumer column, 0 object_taxonomy rows; **PO triage: roadmap or deactivate** |
| destination_type | 10 | 10 | 10 | 0 | SEEDED-AHEAD — 0 consumer column, 0 object_taxonomy rows; **PO triage: roadmap or deactivate** |
| ref_iti_assoc_role | **0** | **0** | **0** | 0 | **CRITICAL** — unseeded; `save_object_itinerary_nested` raises 23503 on first associated-object write |

### Cluster 4 — Contact / media / language vocabularies
| Unit | Live | Source | Doc | DB usage | Verdict |
|---|---|---|---|---|---|
| contact_kind | 14 | 14 | 14 | 4 | HEALTHY — en/es complete; 4 active (email/mobile/website/phone); 10 forward-looking |
| social_network | 11 | 11 | 11 | 0 | FORWARD-LOOKING — en/es complete; **no direct-FK consumer table** (D1/low) |
| media_type | 11 | 11 | 11 | 1 | PARTIAL-USE — en/es complete; only `photo` used (4014 rows) |
| media_tag | 23 | 23 | 23 | 0 | GAP — **all 23 en/es missing**; 0 link-table rows (D2/medium) |
| language_level | 7 | 7 | 7 | 0 | HEALTHY — en/es complete; `level_id` nullable, unused |
| ref_language | 20 | 20 | 20 | 9 | HEALTHY — `native_name` (no i18n col, N/A); 9 active |
| ref_contact_role | 6 | 6 | 6 | 0 | DEAD-VOCABULARY — `role_id` always NULL in both channel tables (D1/low) |
| ref_tag | 16 | 16 | 16 | 16 | HEALTHY — all 16 in active use (4539 `tag_link` rows); seed split across 2 files (D3/low) |

### Cluster 5 — Amenity / environment vocabularies
| Unit | Live | Source | Doc | DB usage | Verdict |
|---|---|---|---|---|---|
| amenity_family | 21 | 21 | 21 | 21 | MATCH — 11 of 21 missing en/es (2026-03-21 corrective codes) (D2/medium) |
| amenity_type | **0** | 0 | 0 | 0 | DEAD DOMAIN — vestigial partition; 0 rows, 0 consumers (D1/medium) |
| environment_tag | 30 | 30 | 30 | 18 | MATCH — en/es complete; 12 niche codes unused (forward-looking) |
| ref_amenity | 136 | 136 | 136 | 37 | MATCH on count — **43 `acc_*` FR-only + 14 non-acc FR-only**; 0 broken family FKs |

### Cluster 6 — CRM / ops / opening vocabularies
| Unit | Live | Source | Doc | DB usage | Verdict |
|---|---|---|---|---|---|
| demand_topic | 20 | 20 | 20 | 1344/3175 (42%) | ALIGNED — FK active; no en/es (internal OTI FR vocab, by design) |
| demand_subtopic | 0 | 0 | 0 | 0 | EMPTY — partition deliberately preserved for future (correct) |
| crm_sentiment | 6 | 6 | 6 | request 100% / response 0% | ALIGNED — `response_sentiment_id` always NULL (D1/low); no en/es (by design) |
| distribution_channel | 4 | 4 | 4 | parser only | ALIGNED values — **routes to DEFAULT partition** `ref_code_other` (D3/medium) |
| feedback_type | 10 | 10 | 10 | 0 | SEEDED-AHEAD — en/es complete; 0 consumer column/0 taxonomy rows; PO triage (D1/medium) |
| incident_category | 0 | 0 | 0 | 0 | EMPTY — FK exists (`incident_report`), module deferred; **4 RLS policies, 1 redundant** (D3/low) |
| booking_status | 10 | 10 | 10 | 0 | SEEDED-AHEAD — en/es complete; 0 consumer column/0 taxonomy rows; PO triage (D1/medium) |
| client_type | 10 | 10 | 10 | 0 | SEEDED-AHEAD — en/es complete; 0 consumer column/0 taxonomy rows; PO triage (D1/medium) |
| partnership_type | 10 | 10 | 10 | 0 | SEEDED-AHEAD — en/es complete; 0 consumer column/0 taxonomy rows; PO triage (D1/medium) |
| insurance_type | 10 | 10 | 10 | 0 | SEEDED-AHEAD — en/es complete; 0 consumer column/0 taxonomy rows; PO triage (D1/medium) |
| document_type | 0 | 0 | 0 | 0 | EMPTY — never seeded; forward-looking (doc upload by section, deferred) |
| domain_registry | 19 | 19 | 19 | fully consumed | SEPARATE TABLE — `ref_code_domain_registry`, not a `ref_code` partition; healthy |
| opening_schedule_type | 5 | 5 | 5 | active | ALIGNED — en/es complete; active consumer (`save_object_openings`) |
| weekday | 7 | 7 | 7 | active | ALIGNED values — **`dow_number` NULL for all 7** (D4/high) |

### Cluster 7 — Pricing / payment / membership vocabularies
| Unit | Live | Source | Doc | DB usage | Verdict |
|---|---|---|---|---|---|
| payment_method | 15 | 15 | 15 | 8 | WARN — `tickets_restaurant` missing en/es (**in use by 39 live rows**); 7 codes forward-looking |
| price_kind | 10 | 10 | 10 | 0 | OK — synced, en/es complete; `object_price` empty |
| price_unit | 10 | 10 | 10 | 0 | OK — synced, en/es complete; `object_price` empty |
| promotion_type | 14 | 14 | 14 | 0 | WARN — 4 codes (partner/weekend/long_stay/holiday) missing en/es |
| membership_campaign | **0** | 0 | 0 | 0 | EMPTY — never seeded; RLS+policies ready; forward-looking |
| membership_tier | **0** | 0 | 0 | 0 | EMPTY — never seeded; RLS+policies ready; forward-looking |
| assistance_type | 10 | 10 | 10 | 0 | OK — synced, en/es complete; no direct-FK consumer (taxonomy-only) |

### Cluster 8 — Classification / sustainability vocabularies
| Unit | Live | Source | Doc | DB usage | Verdict |
|---|---|---|---|---|---|
| ref_classification_scheme | 24 | 24 | 24 | 13 used | MATCH — V5 labels present, pre-V5 absent (guarded); 14/24 no name_i18n |
| ref_classification_value | 81 | 81 | 81 | 230 rows / 13 schemes | MATCH — FK clean; 46/81 no en/es; 0 zh/el |
| ref_classification_equivalent_group | 176 | 176 | 176 | 9 LBL schemes | MATCH — FK clean; i18n N/A (no name cols) |
| ref_classification_equivalent_action | 544 | 544 | 544 | 9 LBL schemes | MATCH — FK clean; i18n N/A (no name cols) |
| ref_sustainability_action | **239** | **260** | 239 | 11 used / 51 rows | **PARTIAL** — 21 accessibility `MA_*` source-only (D4/high); FR-only (D3/medium) |
| ref_sustainability_action_category | 9 | 9 | 9 | active | MATCH — pre-V5 absent (guarded); FR-only (D3/medium) |
| ref_sustainability_action_group | **76** | **83** | 76 | all 76 active | **PARTIAL** — 7 accessibility `SA_*` source-only (D4/high); FR-only |

### Cluster 9 — Governance / org / legal vocabularies
| Unit | Live | Source | Doc | DB usage | Verdict |
|---|---|---|---|---|---|
| ref_org_role | 3 | 3 | 3 | publisher 837 | CLEAN — contributor/reader forward-looking |
| ref_org_admin_role | 3 | 3 | 3 | org_admin 1 | CLEAN — manager/team_lead forward-looking |
| ref_org_business_role | 3 | 3 | 3 | editor 1 | CLEAN — viewer/contributor forward-looking |
| ref_actor_role | 5 | 5 | 5 | operator 799 | CLEAN — 4 roles forward-looking |
| ref_object_relation_type | 10 | 10 | 10 | 0 | CLEAN counts — split seed (9 in seeds + `sur_le_parcours_de` in 8y); forward-looking (D3/low) |
| ref_permission | 11 | 11 | 11 | 10×1 grant | MOSTLY CLEAN — `write_crm_notes` has **0 grants** (D2/medium) |
| ref_legal_type | **16** | **17** | 16 | siren 1, siret 1 | **GAP** — `raison_sociale` source-only (D4/high) |
| ref_document | 0 | 0 | 0 | 0 | CLEAN — intentional empty data table (5 FK consumers, 0 refs) |
| ref_review_source | 7 | 7 | 7 | 0 | CLEAN — review import not yet run; forward-looking |
| ref_commune | 24 | 24 | 24 | 0 | CLEAN — INSEE 97401-97424; `object_zone` empty; forward-looking |

### Cluster 10 — Taxonomy branches (19 `taxonomy_*` domains)
> `Doc` counts are **stale/inflated ~3×** (doc generator conflates `ref_code` + closure rows) — see D4. No live-only codes found in any branch.

| Unit | Live | Source | Doc | DB usage | Verdict |
|---|---|---|---|---|---|
| taxonomy_act | 13 | 13 | 39 | 9 | MATCH — 12 leaves+root; 3 forward-looking |
| taxonomy_asc | 7 | 7 | 21 | 0 | MATCH — 0 ASC objects; forward-looking |
| taxonomy_camp | 3 | 3 | 10 | 2 | MATCH — `camping` dual-role node (D3/low) |
| taxonomy_com | 9 | 9 | 27 | 2 | MATCH — low coverage (6 of 8 leaves unused; D1/low) |
| taxonomy_fma | 8 | 8 | 24 | 0 | MATCH — 0 FMA objects; forward-looking |
| taxonomy_hlo | 20 | 20 | 75 | 17 | MATCH — depth-3 tree; doc massively inflated |
| taxonomy_hot | 11 | 11 | 42 | 2 | MATCH — low coverage (2 of 10 leaves; D1/low) |
| taxonomy_hpa | 5 | 5 | 15 | 0 | MATCH — 0 HPA objects; forward-looking |
| taxonomy_iti | 7 | 7 | 21 | 0 | MATCH — 0 ITI objects; forward-looking |
| taxonomy_loi | 33 | 33 | 120 | 22 | MATCH w/ note — orphan-semantic `loi` node, 1 object (D3/low) |
| taxonomy_org | 8 | 8 | 29 | 0 | MATCH — architectural; ORG rare |
| taxonomy_pcu | 7 | 7 | 21 | 1 | MATCH — small type |
| taxonomy_pna | 10 | 10 | 30 | 0 | MATCH — 0 PNA objects; forward-looking |
| taxonomy_prd | 7 | 7 | 21 | 5 | MATCH — `apiculture` unused (1 import candidate) |
| taxonomy_psv | 13 | 13 | 46 | 6 | MATCH — depth-3; legitimately sparse |
| taxonomy_res | 26 | 26 | 99 | 23 | MATCH — highest usage (136 RES objects) |
| taxonomy_rva | 4 | 4 | 12 | 0 | MATCH — 0 RVA objects; forward-looking |
| taxonomy_spu | 15 | 15 | 45 | 1 | MATCH — very new (§57); 11 leaves FR-only (3 have en) |
| taxonomy_vil | 5 | 5 | 15 | 0 | MATCH — 0 VIL objects; forward-looking |

**Positive structural finding:** `object_type` enum ↔ `taxonomy_*` branch mapping is **VERIFIED CLEAN, 1:1 (19↔19**, incl. SPU/PRD). No orphan branch, no missing branch. [C10]

---

## 3. Findings by dimension

> Severity normalized to **blocker / high / medium / low** (cluster INFO → low; cluster WARN → medium unless live-data impact raises it). Global findings (zh/el gap, default-partition routing) are deduped to a single entry.

### D1 — Dead / orphan vocabulary

**[medium] Seeded-ahead cohort (10 domains, no consumer wired — NOT deprecated)** — `transport_type`, `package_type`, `service_type`, `tourism_type`, `destination_type` [C3] + `booking_status`, `client_type`, `partnership_type`, `insurance_type`, `feedback_type` [C6].
*Evidence (controller-verified live):* the `information_schema` column scan for these 10 stems returns **0 consumer columns** in `public` (no `object_*.<domain>_id`), and **0 `object_taxonomy` rows** reference them (`object_taxonomy` is itself scoped to the `taxonomy_*` branches via its own `domain` column). Each is fully seeded with complete en/es. **Distinction:** these are NOT "dead" (deprecated/replaced) and NOT "forward-looking-with-a-slot" — they are *seeded ahead of a feature that does not exist*. Unlike `iti_practice`/`accommodation_type`/`activity_type` (which have a wired slot and auto-populate as objects are authored), nothing today can fill these without first building a column or a tagging UI. Several may already be **superseded** by a wired sibling (`feedback_type`↔`ref_review_source`/object_review; `insurance_type`↔`ref_legal_type`/object_legal; `client_type`↔`demand_topic`/`crm_sentiment`; `service_type`↔`taxonomy_psv`) — to confirm per domain.
*Recommendation:* PO decision per domain — **roadmap** (open a spec; the vocabulary is then correctly forward-looking) **or deactivate** (`is_active=false`, document the decision in `lot1_mapping_decisions.md`). Do not delete (FK + partition removal requires a migration). No data risk in any state.

**[medium] `amenity_type` is a vestigial domain** — code `(domain) amenity_type`, unit `ref_code:amenity_type` [C5].
*Evidence:* partition `ref_code_amenity_type` exists in `schema_unified.sql` and is an `object_taxonomy` FK target, but 0 rows in `ref_code`, 0 in `object_taxonomy`, 0 in `ref_code_domain_registry`, 0 FE/API references. The amenity taxonomy is correctly modeled via `ref_amenity.family_id → amenity_family`, making this redundant. (Controller-confirmed: amenity_type domain = 0 rows, vestigial.)
*Recommendation:* classify vestigial; document as dead domain. No data action (empty partition is harmless). If ever cleaned: drop the `object_taxonomy` FK, then the partition. Never insert rows.

**[low] `ref_contact_role` is dead vocabulary** — unit `ref_contact_role`, code `ALL_6` [C4].
*Evidence:* `role_id` is NULL in 100% of `contact_channel` and `actor_channel` rows; never populated during the Berta 2.0 import. FK is nullable (safe).
*Recommendation:* no action — sound vocabulary, nullable FK. Will activate if the §63 actor-channel authoring adds a role picker. Document FORWARD-LOOKING.

**[low] `social_network` has no direct-FK consumer table** — unit `ref_code:social_network`, code `ALL_11` [C4].
*Evidence:* no `object_social_network`/`social_network_link` table exists; only consumers are `object_taxonomy` + closure (0 rows). Social links are not stored via this domain.
*Recommendation:* clarify the intended consumption model with PO (store object/actor social URLs vs. taxonomy-only tagging). Currently forward-looking, low risk.

**[low] `crm_interaction.response_sentiment_id` NULL for all 3175 rows** — unit `crm_sentiment`, code `RESP-SENTIMENT-NULL` [C6].
*Evidence:* FK to `ref_code_crm_sentiment` exists; `request_sentiment_id` 100% populated, `response_sentiment_id` 0%. Import/save path never writes it.
*Recommendation:* already tracked (§61/§63 deferred). Wire to the sentiment picker when the CRM interaction edit flow is built. (Cross-link §5.)

**[low] Low taxonomy coverage on populated types** — `taxonomy_com` (6 objects, 2 codes), `taxonomy_hot` (9 objects, 2 codes) [C10].
*Evidence:* populated types with few distinct taxonomy assignments; some objects may lack any assignment.
*Recommendation:* review during B1 enrichment — ensure each COM/HOT object carries a taxonomy assignment. Unused leaves are legitimately forward-looking.

**[low] High forward-looking idle rate (informational)** — `ref_amenity` 99/136 unused, `ref_sustainability_action` 228/239 unused, `environment_tag` 12/30 unused, 39 taxonomy leaves across 7 zero-object types, plus all `accommodation_type`/`room_type`/`iti_practice`/`activity_type`/`event_type`/`price_*`/`assistance_type`/`ref_review_source`/`ref_commune` codes [C2/C3/C5/C7/C8/C9/C10].
*Evidence:* idle reflects the pilot dataset scope, not seeding defects; consumers/FE are wired for nearly all.
*Recommendation:* no action — re-evaluate as B1 object creation and the deferred imports land. The `acc_*` amenities are deliberately persisted via `object_classification.subvalue_ids` (§10), **not** `object_amenity`.

### D2 — i18n / label

**[high] 43 `acc_*` accessibility amenities are FR-only** — unit `ref_amenity:accessibility_family`, code `REF_AMENITY_ACC_NO_I18N` [C5].
*Evidence:* (controller-confirmed) all 43 `acc_*` codes have `name_i18n = {"fr": …}` only — 0 en, 0 es. The B-4 CTE (`seeds_data.sql` ~3704-3749) writes only `fr`. These surface in §10 SectionAccessibility and in `api.get_object_badges_compact` / `api.get_object_resource` (multilingual badge/card rendering).
*Recommendation:* add en/es for all 43 via an idempotent `name_i18n ||` UPDATE (mirror the `ref_code_translations` pattern). FR strings already present, so the merge is safe.

**[medium] `view_type` — all 13 codes have no en/es** — unit `view_type`, code `ALL` [C2].
*Evidence:* (controller-confirmed 13/13 missing en) source never wrote an `UPDATE … SET name_i18n` block for `view_type`; the bulk translation block omitted it. Codes are plain geographic terms.
*Recommendation:* add an en/es UPDATE block for the 13 codes; apply live idempotently.

**[medium] `media_tag` — all 23 codes have no en/es** — unit `ref_code:media_tag`, code `ALL_23` [C4].
*Evidence:* (controller-confirmed 23/23 missing en) no `media_tag` block in the `seeds_data.sql §999` translation section. 0 link-table rows today, so latent.
*Recommendation:* add a `media_tag` en/es block; close before the tag-labelling UI ships (`api.get_media_for_web` `preferred_tags` will benefit).

**[medium] `amenity_family` — 11 of 21 codes missing en/es** — unit `ref_code:amenity_family`, code `AMENITY_FAMILY_PARTIAL_I18N` [C5].
*Evidence:* the 2026-03-21 corrective families (bathroom, bedroom, climate_control, entertainment, general, kids, kitchen, parking, pets, security, sports) were never added to the translation block. They show as family labels in the §11 picker + Explorer badges.
*Recommendation:* extend the `ref_code_translations` block with en/es for the 11 codes. (Cross-link §5 — already a logged deferred item.)

**[medium] `ref_amenity` — 14 non-`acc_` codes missing en/es** — unit `ref_amenity:non_acc_codes`, code `REF_AMENITY_NON_ACC_PARTIAL_I18N` [C5].
*Evidence:* 14 hospitality codes from the 2026-03-21 batch (private_bathroom, shared_bathroom, towels, bed_linen, fan, dining_room, telephone, outdoor_furniture, boutique, drinking_water, pressing, public_toilets, reception, massage) have no en/es.
*Recommendation:* add en/es; prioritize the ones in active `object_amenity` use (towels, private/shared_bathroom, fan, massage).

**[medium] `payment_method:tickets_restaurant` missing en/es — in use by live data** — unit `payment_method`, code `tickets_restaurant` [C7].
*Evidence:* **CONTROLLER CORRECTION — `tickets_restaurant` is referenced by 39 live `object_payment_method` rows** (cluster-7 mis-stated 1604, which is the table total). en/es are NULL; FR label correct.
*Recommendation:* add `en='Meal vouchers'`, `es='Tickets restaurante'` to the i18n block + live UPDATE. User-visible on real establishments now.

**[medium] `promotion_type` — 4 codes missing en/es** — unit `promotion_type`, code `partner,weekend,long_stay,holiday` [C7].
*Evidence:* base INSERT seeded all 14; the i18n block covered only the first 10. `promotion` table empty (no live impact yet) but codes are user-visible.
*Recommendation:* extend the i18n block with the 4 codes; apply live.

**[medium] `write_crm_notes` permission has 0 grants** — unit `ref_permission`, code `write_crm_notes` [C9].
*Evidence:* all other 10 permissions have 1 user grant (seed user); `write_crm_notes` has 0 user and 0 org grants. Added by §61 but the seed fixture was not updated.
*Recommendation:* either grant it to the test user, or document explicitly that it requires a real SP-2 grant (then it is intentionally absent). Forward-looking, but the fixture inconsistency is a seeding gap.

**[low] Classification/sustainability i18n holes** — units `ref_classification_scheme` (14/24 no name_i18n), `ref_classification_value` (46/81 no en/es), sustainability vocab entirely FR-only (239 actions, 76 groups, 9 categories) — codes `C8-D3-01`, `C8-D3-02` [C8].
*Evidence:* operational scheme names + LBL granted values + several sub-value categories carry FR only; the V5 inline i18n populated only `fr`.
*Recommendation:* one i18n pass — add en/es to scheme names + the 46 values + the 9 categories/76 groups (they surface in editor/Explorer). `MA_*` action labels are lower priority (internal). Consistent with FR-fallback launch policy.

**[low] Global zh/el gap — every `ref_code` domain** — unit `ALL`, code `zh,el` [C1-C10].
*Evidence:* `zh` and `el` keys are 100% absent across all `ref_code` `name_i18n` and all i18n-capable `ref_*` tables. Deliberate FR-primary launch posture; en/es are present where a translation block ran.
*Recommendation:* single post-MVP i18n task when the zh/el language targets are confirmed. Do not handle per-domain. (Counted once.)

**[low] CRM vocab has no en/es — by design** — units `demand_topic` (20), `crm_sentiment` (6), `distribution_channel` (4), code `CRM-VOCAB-NO-EN-ES` [C6].
*Evidence:* internal OTI back-office FR-only vocab (`seeds_data.sql:1389` explicitly documents the removal of generic en/es translations in §61).
*Recommendation:* no action; note once as "by-design" in the deferred list.

### D3 — Structure / maintainability

**[medium] Default-partition routing — `distribution_channel` + 19 `taxonomy_*`** — codes `DIST-CHAN-DEFAULT-PARTITION` [C6] + `D3-PARTITION-ROUTING-DEFAULT` [C10].
*Evidence:* `distribution_channel` (4 rows) and all 211 `taxonomy_*` rows live in the DEFAULT partition `ref_code_other` — no dedicated partition, no partition-level RLS/index isolation. For taxonomy this is architecturally deliberate (domains managed dynamically via `ref_code_domain_registry`, not DDL partitions). For `distribution_channel` it is an inconsistency vs. the other 45 partitioned domains.
*Recommendation:* (a) `distribution_channel` — create `ref_code_distribution_channel PARTITION OF ref_code` with the standard unique indexes + house RLS pair (PG14+ auto-routes on `UPDATE domain=domain`). (b) taxonomy — leave as-is; verify the composite `(domain, code)` index serves `ref_code_other` reads efficiently as branches grow; document the routing choice in `schema_unified.sql`. (Deduped to one finding.)

**[medium] Sustainability vocabulary is FR-only** — see D2 low entry `C8-D3-01` (cross-referenced; the structural angle is the inline-i18n population covering only `fr`).

**[low] `meeting_equipment` (and food domains) have `position` NULL** — codes `meeting_equipment ALL` [C2] + `(all 65 food codes)` [C1].
*Evidence:* `position` is NULL for all 11 `meeting_equipment` codes and all 65 food codes (allergen 14 + cuisine 29 + dietary 12 + menu_category 10). FE loaders call `.order('position')` → implementation-defined (non-deterministic) display order.
*Recommendation:* seed `position` per domain (idempotent `ON CONFLICT (domain, code) DO UPDATE`). Suggested orderings in the cluster files (EU-alpha for allergens, meal-flow for menu_category, etc.).

**[low] Split / inconsistent seed sources** — `ref_object_relation_type` (`sur_le_parcours_de` only in 8y) [C9]; `ref_tag` (14 in enrichment file + 2 in `seeds_data.sql`) [C4]; `social_network` `wechat`/`line` use a LEFT-JOIN guard vs. `ON CONFLICT` elsewhere [C4]; `object_menu`/`object_menu_item` FOR-ALL write policies still in source, superseded live by §47 [C1].
*Evidence:* fresh-apply via the CI manifest is correct, but standalone runs of `seeds_data.sql` would silently miss the 10th relation type / canonical tag set; the mixed idempotency patterns and stale source policies add maintenance friction.
*Recommendation:* backport `sur_le_parcours_de` into `seeds_data.sql` (or cross-reference comment); consolidate the 16 `ref_tag` rows into one canonical location; normalize `wechat`/`line` to `ON CONFLICT DO NOTHING`; annotate/replace the superseded FOR-ALL menu policies at next schema regen.

**[low] `incident_category` redundant RLS policy** — unit `incident_category`, code `INCIDENT-CAT-DUPLICATE-POLICY` [C6].
*Evidence:* carries both `admin_ref_code_write` (house family) and a duplicate `admin_incident_category_write` — both FOR ALL, identical predicate. Harmless but violates the one-write-family-per-table invariant.
*Recommendation:* `DROP POLICY admin_incident_category_write` (house pair suffices).

**[low] `ref_code_payment_method` / membership partitions carry redundant legacy RLS policies** — codes `POLICY_DUPLICATE` [C7].
*Evidence:* `ref_code_payment_method` has the house pair + 2 legacy French-named policies; `membership_campaign`/`tier` each have the house pair + a domain-specific pair. All permissive, functionally redundant. *Noted as RLS-adjacent — out of strict seeding scope.*
*Recommendation:* drop the redundant pairs at the next RLS cleanup; regenerate the doc (it shows "0 policies" — stale).

**[low] `taxonomy_loi` orphan-semantic node** — unit `taxonomy_loi`, code `D3-LOI-ORPHAN-SEMANTIC-NODE` [C10].
*Evidence:* `code='loi'` (name 'LOI', parent root, assignable) duplicates root semantics; 1 object ('Au temps pour vous') assigned. Not in any seed source — a pre-migration legacy node that survived the deletion guard (had 1 assignment).
*Recommendation:* re-assign the object to a meaningful `taxonomy_loi` leaf, then delete the orphan node.

**[low] `taxonomy_camp` dual-role node** — unit `taxonomy_camp`, code `D3-CAMP-DUAL-ROLE-NODE` [C10].
*Evidence:* `camping` is both a mid-level parent (child `camping_chez_l_habitant`) and directly assignable (2 objects). Intentional under the uniform-assignability rule.
*Recommendation:* INFO-level design note; no action.

**[low] `cuisine_type:vegan` vs `dietary_tag:vegan` label ambiguity** — unit `cuisine_type`, code `vegan` [C1].
*Evidence:* both carry identical FR/EN labels at different model levels (restaurant style vs. item suitability). Intentional, but undifferentiated labels risk import miscategorization.
*Recommendation:* no structural change — harden the FR descriptions to state the level.

**[low] `ref_amenity.scope` filter dead arm** — unit `ref_amenity:scope_column`, code `REF_AMENITY_SCOPE_STALE` [C5].
*Evidence:* FE filters `scope IN ('object','both')` but all 136 rows are `scope='object'`; the `'both'` arm is dead.
*Recommendation:* forward-compatible, no correctness issue; set `scope='both'` (or add `'room_type'`) only when room-type amenity authoring reuses these rows. Document the scope vocabulary.

**[low] `ref_sustainability_action.category_id` denormalization** — unit `ref_sustainability_action`, code `C8-D2-01` [C8].
*Evidence:* `category_id` duplicates the `group_id → group.category_id` path (239/239 populated).
*Recommendation:* document as an intentional denormalization in DDL; consider a consistency trigger. Low priority.

### D4 — Correctness / drift

**[high] `ref_iti_assoc_role` completely unseeded → 23503 on first ITI associated-object write** — unit `ref_iti_assoc_role`, code `MISSING_SEED_ENTIRE_TABLE` [C3].
*Evidence:* (CONTROLLER-CONFIRMED) 0 rows live AND 0 INSERT in any source file (the only repo-wide match is the audit JSON prose). `object_workspace_safe_write_rpcs.sql:944` resolves `role_id` by `SELECT id FROM ref_iti_assoc_role WHERE lower(code)=lower(role_code)` and raises EXCEPTION `23503` ('Unknown itinerary association role') when NULL; `object_iti_associated_object` FK is `ON DELETE RESTRICT`. Latent (0 ITI objects, 0 associated-object rows), surfaces at first ITI authoring with an associated object.
*Recommendation:* define the canonical ITI association-role vocabulary (consult the ITI/B1 spec — e.g. an analogue to `sur_le_parcours_de`), seed it in `seeds_data.sql` + a companion live migration, add to manifest/runbook. Block ITI authoring with associated objects until seeded.

**[high] Accessibility V5 partially applied — 21 `MA_*` + 7 `SA_*` source-only; `LBL_TOURISME_HANDICAP` 0 equivalence rows** — units `ref_sustainability_action` + `ref_sustainability_action_group`, codes `C8-D4-01` / `C8-D4-02` [C8].
*Evidence:* (CONTROLLER-CONFIRMED live-behind-source) live 239 actions / 76 groups / 9 categories vs source 260 / 83; the delta = the accessibility block embedded from `seeds_accessibility_v5.sql` (`SA_ACCESLIBRE`, `SA_ACCESSIBLE_*`, 21 `MA_ACCESS*`/`MA_PMR_*`/`MA_RGAA_AUDIT`…), never applied to live. Live is a clean subset (no live-only codes). Separately, `LBL_TOURISME_HANDICAP` has 0 rows in `ref_classification_equivalent_group`/`_action` → it is excluded from `v_object_classification_coverage` and `v_object_classification_or_equivalent_scheme`, even though **4 objects already carry that label**. PMV-001 dead-end.
*Recommendation:* apply the accessibility seed block to live (and fold into the manifest); then seed the `LBL_TOURISME_HANDICAP` equivalence-group/action links so coverage can score it. Pre-condition for the PMV-001 eligibility rail. (Cross-link §5 — `staging_d_durable` explains thin live sustainability usage but is separate from this gap.)

**[high] `ref_legal_type.raison_sociale` is source-only → fresh ≠ live, FK reject on live** — unit `ref_legal_type`, code `raison_sociale` [C9].
*Evidence:* (CONTROLLER-CONFIRMED) live 16 vs source 17; `schema_unified.sql` includes `('raison_sociale', …)` inline with `CREATE TABLE`, absent live. A fresh DB has it; live does not. An `object_legal` row keyed to `raison_sociale` would be rejected by the FK on live (currently only `siren=1`, `siret=1`). Deploy-integrity violation per CLAUDE.md §Deploy integrity.
*Recommendation:* targeted idempotent migration `INSERT … ('raison_sociale', …) ON CONFLICT (code) DO NOTHING`, added to manifest + runbook to close the fresh-vs-live drift.

**[high] `weekday.dow_number` NULL for all 7 rows → ISO ordering breakage** — unit `weekday`, code `WEEKDAY-DOW-NULL` [C6].
*Evidence:* (CONTROLLER-CONFIRMED NULL for all 7) seeds insert into `position` (col 4), not `dow_number`; the i18n block passes NULL for `dow_number`; no migration ever sets it.
*Recommendation:* idempotent `UPDATE ref_code SET dow_number = CASE code … END WHERE domain='weekday' AND dow_number IS NULL` (ISO Mon=1..Sun=7), as a standalone migration.

**[medium] Doc plane is STALE** — `docs/api-db-reference.html` / `db-graph-out` — codes `D4-DOC-STALE-COUNTS` [C10] + the §61 CRM-vocab omission [C6] + the `live-foreign-keys.csv` `crm_interaction.*_mood_id` staleness [C3] + stale policy counts [C7].
*Evidence:* doc taxonomy "valeurs" counts are ~3× live (e.g. `taxonomy_loi` doc=120 vs live=33, `taxonomy_res` doc=99 vs live=26) — the generator aggregates `ref_code` + `ref_code_taxonomy_closure`; the closure check below (482 closure / 211 nodes) confirms the conflation. The doc/CSV also predate §61 (CRM vocab missing; `live-foreign-keys.csv` still lists the removed `request_mood_id`/`response_mood_id`) and show stale "0 policies" rows.
*Recommendation:* regenerate the db-graph artifact (`graphify update .`) against the current post-cleanup, post-§61 schema, then regenerate `api-db-reference.html` and `live-foreign-keys.csv`. This is itself a remediation item (and removes a future-auditor trap). (Deduped to one finding.)

**[medium] `mood` domain disconnected after §61** — unit `mood`, code `STALE_FK_CSV_CRM_INTERACTION` [C3].
*Evidence:* §61 renamed `crm_interaction.request_mood_id`/`response_mood_id` → `*_sentiment_id` repointed to `ref_code_crm_sentiment`; `mood` now has only `object_taxonomy`+closure consumers (0 rows). The FK CSV is stale (covered by the doc-stale finding above).
*Recommendation:* in addition to regenerating the CSV, evaluate whether object-level `mood` tagging is still on the roadmap; if not, treat as a dead domain (see D1 cohort handling).

**[low] Pre-V5 codes absent — guard in place (positive)** — unit `ref_classification_scheme`/category, code `C8-D4-03` [C8].
*Evidence:* (CONTROLLER-aligned) 0 pre-V5 category rows (energy/water/waste/mobility/biodiversity) and 0 retired label codes (green_key/eu_ecolabel/tourisme_handicap/destination_excellence/qualite_tourisme) live; a `DO` block guard `RAISE`s if any reappear.
*Recommendation:* no action; the V5 label codes are canonical and the guard passes. The TST recoding hazard remains correctly deferred. (Cross-link §5.)

**[low] Empty partitions — correctly forward-looking (positive)** — `demand_subtopic`, `incident_category`, `document_type` [C6], `membership_campaign`, `membership_tier` [C7].
*Evidence:* 0 rows, no seed; FKs exist with 0 referencing data; deliberately preserved for future modules.
*Recommendation:* no action; document blockers (subtopic = CRM topic hierarchy; incident = module demandes/board; document_type = doc-upload-by-section; membership = membership authoring UI — seed with en/es from day one to avoid the `promotion_type` gap).

---

## 4. Prioritized remediation backlog

> Ordered by severity then effort. **Every row is a PROPOSAL — nothing was applied in this audit.**

| # | Fix | Dim | Sev | Effort | Risk | Unblocks |
|---|---|---|---|---|---|---|
| 1 | Seed `ref_iti_assoc_role` (define canonical role vocab + live migration + manifest) | D4 | high | M | low | ITI authoring with associated objects (blocks 23503) |
| 2 | ✅ **DONE 2026-06-15** — `ref_legal_type.raison_sociale` inserted on live + folded to manifest 14b (`migration_seed_drift_fix_legaltype_weekday.sql`) | D4 | high | XS | low | `object_legal` `raison_sociale` rows; fresh==live integrity |
| 3 | ✅ **DONE 2026-06-15** — `weekday.dow_number` backfilled ISO 1-7 on live + source fix (`seeds_data.sql` sets it at insert) + manifest 14b | D4 | high | XS | low | Deterministic ISO weekday ordering |
| 4 | Apply accessibility V5 block (21 `MA_*` + 7 `SA_*`) to live + manifest | D4 | high | M | low | Tourisme & Handicap coverage data |
| 5 | Seed `LBL_TOURISME_HANDICAP` equivalence-group/action links (after #4) | D4 | high | M | med | `v_object_classification_coverage` scoring; PMV-001 rail |
| 6 | Add en/es for 43 `acc_*` amenities (`name_i18n ||` UPDATE) | D2 | high | S | low | Multilingual §10 T&H badges/cards |
| 7 | Add en/es for `view_type` (13) | D2 | med | S | low | Multilingual view-type labels |
| 8 | Add en/es for `media_tag` (23) | D2 | med | S | low | Tag-labelling UI (pre-ship) |
| 9 | Add en/es for `amenity_family` (11) | D2 | med | S | low | Multilingual §11 family labels / badges |
| 10 | Add en/es for 14 non-`acc_` `ref_amenity` codes | D2 | med | S | low | Multilingual amenity labels |
| 11 | Add en/es for `payment_method:tickets_restaurant` (39 live rows) | D2 | med | XS | low | Multilingual payment label (in-use now) |
| 12 | Add en/es for 4 `promotion_type` codes | D2 | med | XS | low | Multilingual promotion labels |
| 13 | Grant or document `write_crm_notes` for the test user | D2 | med | XS | low | CRM-note authoring on the seed fixture |
| 14 | Regenerate db-graph + `api-db-reference.html` + `live-foreign-keys.csv` (post-§61, post-cleanup) | D4 | med | S | low | Trustworthy doc plane; removes mood/CSV/policy staleness |
| 15 | PO triage of 10 seeded-ahead domains (roadmap or deactivate — verified: no consumer wired) | D1 | med | S | low | Catalog clarity; removes speculative noise |
| 16 | Create `ref_code_distribution_channel` dedicated partition + house RLS pair | D3 | med | S | med | Partition consistency / isolation |
| 17 | Seed `position` for `meeting_equipment` (11) + food domains (65) | D3 | low | S | low | Deterministic FE chip/option ordering |
| 18 | Drop redundant RLS policies (`incident_category`, `payment_method`, membership ×2) | D3 | low | XS | low | One-write-family invariant; doc accuracy |
| 19 | Consolidate split seeds (`ref_tag`, `sur_le_parcours_de`) + normalize `wechat`/`line` idempotency | D3 | low | S | low | Safe standalone `seeds_data.sql` runs |
| 20 | Document `amenity_type` + `social_network` + `ref_contact_role` as dead/forward-looking | D1 | low | XS | low | Audit-trail clarity |
| 21 | Re-assign `taxonomy_loi:loi` object then delete the orphan node | D3 | low | S | med | Clean LOI taxonomy |
| 22 | en/es for classification/sustainability scheme names + 46 values + categories/groups | D2 | low | M | low | Multilingual coverage UI |
| 23 | Harden FR descriptions for `cuisine_type:vegan` vs `dietary_tag:vegan` | D3 | low | XS | low | Import disambiguation |
| 24 | Replace superseded FOR-ALL menu write policies in source at next regen | D3 | low | S | low | Source==live policy parity |
| — | Global zh/el i18n pass (post-MVP, all domains) | D2 | low | L | low | zh/el markets (deferred) |

---

## 5. Cross-links to already-logged deferred items

Remediation must not duplicate existing tracker entries:

- **#6, #9, #10 (amenity i18n)** ↔ `WORKFLOW.md` deferred item *"i18n for 11 amenity_family codes + 22 ref_amenity codes (12 original + 10 acc_* added 2026-03-22)"*. This audit refines the count to **43 `acc_*` + 14 non-`acc_` ref_amenity + 11 amenity_family**.
- **jsonb-vs-`i18n_translation` duplication** (`ref_code.name_i18n` jsonb vs `ref_capacity_metric` EAV `i18n_translation`, C2/`info`) ↔ **G-DESC-1** in `docs/schema-workbench/mapping-vs-live-schema-gaps.md`. By design today; flagged there as a uniformity concern.
- **#15, #18 (dead domains + redundant policies)** — follow the **§61 CRM dead-code cleanup precedent** (33 dead codes + 33 translations removed in `migration_crm_module.sql`): deactivate/remove with a documented guard, never silent-delete.
- **#22, C8-D4-03 (V5 labels)** ↔ CLAUDE.md V5 canonical label table (`green_key → LBL_CLEF_VERTE`, `tourisme_handicap → LBL_TOURISME_HANDICAP`, …). Cluster-8 **confirms pre-V5 codes are ABSENT live** with a `DO`-block guard; the **TST recoding** remains a separate deferred item (execution-order constraint in `WORKFLOW.md`).
- **#4 (accessibility seed) / thin sustainability usage** ↔ the deferred **`staging_d_durable` sustainability CSV import** (`WORKFLOW.md`). The import explains why only 11/239 actions are used live; it is **separate** from the source-only-vocabulary gap (#4) — applying the seed block is a pre-condition, the import is the data fill.
- **`response_sentiment_id` NULL** (C6/D1) ↔ **§61/§63 CRM deferred list** (`response_sentiment_id (source NULL)`). Already tracked; no new item.
- **ITI association role (#1)** ↔ the §28 ITI live-cutover deferred item — add role seeding as a named pre-condition.

---

## 6. Method & coverage note

**Three planes.**
- **LIVE** — Supabase MCP `execute_sql`, read-only SELECT/COUNT/anti-join (per cluster); the controller live-confirmed the override facts below.
- **SOURCE** — `Base de donnée DLL et API/seeds_data.sql`, `schema_unified.sql`, `migration_*.sql`, `old_data_enrichment_*`, `seeds_accessibility_v5.sql`.
- **DOC** — `docs/api-db-reference.html`, generated from `db-graph-out`.

**Coverage.** All ~70 ref units are accounted for exactly once across the 10 clusters: 58 non-empty `ref_code` domains + 8 empty partitions (`demand_subtopic`, `incident_category`, `document_type`, `membership_campaign`, `membership_tier`, `amenity_type`, `ref_iti_assoc_role` [standalone, empty], and `ref_document` [standalone data table, empty]) + the standalone `ref_*` tables (capacity ×2, language, contact_role, tag, classification ×4, sustainability ×3, org/admin/business roles, actor_role, object_relation_type, permission, legal_type, review_source, commune) + the 19 `taxonomy_*` branches. `domain_registry` is correctly reclassified as the standalone `ref_code_domain_registry` (not a vocabulary partition).

**Controller spot-verifications (override any conflicting cluster claim):**
- `ref_iti_assoc_role` — 0 rows live AND 0 INSERT in any source file. CONFIRMED.
- `ref_sustainability_action` live=239 (src 260), `_group` live=76 (src 83), category=9. CONFIRMED live-behind-source.
- `ref_legal_type` live=16, `raison_sociale` absent live but present in `schema_unified.sql`. CONFIRMED source-only drift.
- `weekday.dow_number` NULL for all 7. CONFIRMED.
- `ref_amenity` — 43 `acc_*` codes, all 43 missing en/es. CONFIRMED.
- `ref_code amenity_type` domain = 0 rows (vestigial). CONFIRMED.
- `view_type` 13/13 missing en; `media_tag` 23/23 missing en. CONFIRMED.
- `membership_campaign` / `membership_tier` `ref_code` domains = 0 rows each. CONFIRMED.
- **CORRECTION — `payment_method:tickets_restaurant` is used by 39 live `object_payment_method` rows, NOT 1604** (cluster-7 mis-stated the table total). Its en/es is NULL. 39 used throughout.

**Closure staleness check (live, this pass):**
```
SELECT (SELECT count(*) FROM public.ref_code_taxonomy_closure) AS closure_rows,
       (SELECT count(*) FROM public.ref_code WHERE domain LIKE 'taxonomy_%') AS taxonomy_nodes;
→ closure_rows = 482, taxonomy_nodes = 211
```
The closure is **plausibly consistent with the live node set**: 482 ≈ 211 self-rows + ~271 ancestor-path rows for the multi-depth trees (a transitive-closure table always exceeds the node count). **No refresh was run** (it mutates). The relevant signal is for the DOC plane: the doc's taxonomy "valeurs" counts (~3× live) closely match `ref_code` + closure rows aggregated (e.g. `taxonomy_act` doc=39 ≈ 13 nodes + 25 closure paths), confirming the doc generator **conflates nodes with closure rows** — which is exactly why the DOC plane reads inflated.

**DOC-plane caveat (load-bearing).** The DOC plane is **STALE**: it is generated from `db-graph-out`, which (a) lacks the §61 CRM vocabulary, (b) inflates the `taxonomy_*` "valeurs" counts ~3× by aggregating closure rows, and (c) carries stale "0 policies" rows and a stale `live-foreign-keys.csv` (still lists the removed `crm_interaction.*_mood_id`). DOC row counts were therefore treated as **untrusted** wherever they diverged from LIVE; LIVE was authoritative. **"Regenerate db-graph + `api-db-reference.html` + `live-foreign-keys.csv`" is itself a remediation item (backlog #14).**

**Uncertainty.** A handful of "no FE consumer" / "no direct-FK consumer" claims rest on the clusters' source grep rather than an independent re-grep this pass; they are consistent across clusters and with the live 0-row state, but the dead-domain deactivation (#15) should be confirmed with the PO before any `is_active=false` change.
