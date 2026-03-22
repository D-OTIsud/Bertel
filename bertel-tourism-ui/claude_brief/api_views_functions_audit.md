# API Views & Functions Audit
**Date:** 2026-03-22
**Source file:** `api_views_functions.sql`
**Auditor:** api-audit-reconciler subagent
**Scope:** All 93 RPC objects (functions/views) in the unified API layer
**Patch applied:** 2026-03-22 — all 4 ERRORs patched in `api_views_functions.sql`
**Patch applied:** 2026-03-22 — stale-code scan completed (0 additional hits); label-ranking implemented in `get_filtered_object_ids` and `list_object_resources_filtered_page`

---

## 1. Executive Summary

| Metric | Count |
|--------|-------|
| Total objects audited | 93 |
| ERRORs found | 4 |
| ERRORs patched (2026-03-22) | 4 |
| ERRORs remaining | 0 |
| WARNINGs (maintenance risk or edge-case failure) | 3 |
| CLEAN (no findings) | 86 |

### Critical risks — all patched 2026-03-22

- **E1 / E2 — SQL grouping violations** in `get_actor_data` and `get_organization_data`: ~~both functions will fail at runtime~~ **PATCHED** — `aor.created_at` added to GROUP BY in E1; `ool.is_primary, ool.created_at` added to GROUP BY in E2.
- **E3 — Type coercion error** in `get_itinerary_track_geojson`: ~~JSON/JSONB mixed concatenation~~ **PATCHED** — `json_build_array(v_track)` cast to `jsonb` before `||` operator.
- **E4 — Retired label code** in `get_object_resource_adapted`: ~~hardcoded `'tourisme_handicap'`~~ **PATCHED** — replaced with V5 canonical `'LBL_TOURISME_HANDICAP'` at line 7167; COMMENT updated.

No CLEAN objects showed any structural concern. The 86 clean objects include all utility/render/i18n leaf functions, the full pagination stack, and the majority of the legal records subsystem.

---

## 2. Full Inventory Table

All 93 objects. Status: `CLEAN` / `ERROR` / `WARNING`.

### Batch 1 — Utility functions (lines 26–780)

| Object | Line Range (approx.) | Status |
|--------|----------------------|--------|
| is_object_open_now | 26 | CLEAN |
| build_opening_period_json | ~60 | CLEAN |
| render_format_currency | ~120 | CLEAN |
| render_format_percent | ~150 | CLEAN |
| render_format_date | ~180 | CLEAN |
| render_format_time | ~210 | CLEAN |
| render_format_date_range | ~240 | CLEAN |
| render_format_datetime_range | ~280 | CLEAN |
| i18n_pick | ~320 | CLEAN |
| i18n_pick_strict | ~360 | CLEAN |
| i18n_get_text | ~400 | CLEAN |
| i18n_get_text_strict | ~440 | CLEAN |
| jsonb_prune_empty_top | ~480 | CLEAN |
| b64url_encode | ~520 | CLEAN |
| b64url_decode | ~550 | CLEAN |
| cursor_pack | ~580 | CLEAN |
| cursor_unpack | ~620 | CLEAN |
| json_clean | ~660 | CLEAN |
| pick_lang | ~700 | CLEAN |
| norm_search | ~730 | CLEAN |
| build_iti_track | ~760 | CLEAN |

### Batch 2 — Core object retrieval (lines 894–1493)

| Object | Line Range (approx.) | Status |
|--------|----------------------|--------|
| get_filtered_object_ids | 894 | CLEAN |
| get_object_resources_batch | ~950 | CLEAN |
| get_object_card | ~1020 | CLEAN |
| get_object_cards_batch | ~1080 | CLEAN |
| jsonb_pick_keys | ~1120 | CLEAN |
| resource_block_base | ~1150 | CLEAN |
| resource_block_location | ~1200 | CLEAN |
| resource_block_descriptions | ~1250 | CLEAN |
| resource_block_contacts | ~1300 | CLEAN |
| resource_block_media | ~1350 | CLEAN |
| resource_block_pricing | ~1390 | CLEAN |
| resource_block_legal | ~1420 | CLEAN |
| resource_block_itinerary | ~1450 | CLEAN |
| resource_block_render | ~1470 | CLEAN |
| resource_block_misc | ~1485 | CLEAN |
| compose_object_resource_blocks | ~1490 | CLEAN |
| get_object_resource | 1493 | CLEAN |

### Batch 3 — Publication / opening / pagination (lines 3482–4619)

| Object | Line Range (approx.) | Status |
|--------|----------------------|--------|
| export_publication_indesign | 3482 | CLEAN |
| get_opening_time_slots | ~3600 | CLEAN |
| get_all_opening_time_slots | ~3680 | CLEAN |
| get_opening_slots_by_day | ~3760 | CLEAN |
| list_object_resources_page | ~3840 | CLEAN |
| list_object_resources_page_text | ~3950 | CLEAN |
| list_object_resources_since_fast | ~4050 | CLEAN |
| list_object_resources_since_fast_text | ~4150 | CLEAN |
| list_object_resources_filtered_page | ~4300 | CLEAN |
| list_object_resources_filtered_since_fast | ~4480 | CLEAN |
| search_restaurants_by_cuisine | 4619 | CLEAN |

### Batch 4 — Deep data / map (lines 4733–5413)

| Object | Line Range (approx.) | Status |
|--------|----------------------|--------|
| search_events_by_restaurant_cuisine | 4733 | CLEAN |
| get_parent_object_data | ~4820 | CLEAN |
| get_actor_data | ~4900 | **PATCHED (E1)** |
| get_organization_data | ~5000 | **PATCHED (E2)** |
| get_object_with_deep_data | ~5100 | CLEAN |
| get_objects_with_deep_data | ~5160 | CLEAN |
| get_objects_by_type_with_deep_data | ~5250 | CLEAN |
| search_objects_with_deep_data | ~5330 | CLEAN |
| get_object_map_item | ~5380 | CLEAN |
| list_objects_map_view | 5413 | CLEAN |

### Batch 5 — Media / reviews / rooms / itinerary (lines 5465–6016)

| Object | Line Range (approx.) | Status |
|--------|----------------------|--------|
| get_media_for_web | 5465 | CLEAN |
| get_object_reviews | ~5540 | CLEAN |
| get_object_room_types | ~5610 | CLEAN |
| validate_promotion_code | ~5680 | CLEAN |
| search_objects_by_label | ~5740 | CLEAN |
| export_itinerary_gpx | ~5820 | CLEAN |
| export_itineraries_gpx_batch | ~5900 | CLEAN |
| get_itinerary_track_simplified | ~5960 | CLEAN |
| get_itinerary_track_geojson | ~6021 | **PATCHED (E3)** + WARNING (W1) |

### Batch 6 — Legal records (lines 6098–6987)

| Object | Line Range (approx.) | Status |
|--------|----------------------|--------|
| get_expiring_legal_records | 6098 | CLEAN |
| get_object_legal_records | ~6180 | CLEAN |
| check_object_legal_compliance | ~6260 | CLEAN |
| add_legal_record | ~6330 | CLEAN |
| update_legal_record | ~6400 | CLEAN |
| get_object_legal_data | ~6480 | CLEAN |
| get_object_legal_compliance | ~6540 | CLEAN |
| get_expiring_legal_records_api | ~6570 | CLEAN |
| generate_legal_expiry_notifications | ~6580 | CLEAN |
| audit_legal_compliance | 6603 | **WARNING (W2)** |
| request_legal_document | ~6700 | CLEAN |
| deliver_legal_document | ~6750 | CLEAN |
| get_pending_document_requests | ~6780 | **WARNING (W3)** |
| get_pending_document_requests_api | ~6860 | CLEAN |
| get_object_legal_records_by_visibility | ~6900 | CLEAN |
| get_object_public_legal_records | ~6940 | CLEAN |
| get_object_private_legal_records | 6987 | CLEAN |

### Batch 7 — Validation / adapted / dashboard (lines 7054–7548)

| Object | Line Range (approx.) | Status |
|--------|----------------------|--------|
| list_objects_with_validated_changes_since | 7054 | CLEAN |
| get_object_resource_adapted | ~7100 | **PATCHED (E4)** |
| get_object_cards_adapted_batch | ~7250 | CLEAN |
| get_dashboard_scorecards | ~7340 | CLEAN |
| get_dashboard_type_breakdown | ~7400 | CLEAN |
| get_dashboard_city_distribution | ~7440 | CLEAN |
| get_dashboard_actualisation | ~7490 | CLEAN |
| get_dashboard_distinction_overview | 7548 | CLEAN |

---

## 3. Dependency Map

### Core resource retrieval chain

```
list_object_resources_page
  └── get_object_resources_batch
        └── compose_object_resource_blocks
              ├── resource_block_base
              ├── resource_block_location
              ├── resource_block_descriptions
              ├── resource_block_contacts
              ├── resource_block_media
              ├── resource_block_pricing
              ├── resource_block_legal
              ├── resource_block_itinerary
              ├── resource_block_render
              └── resource_block_misc

list_object_resources_page_text      → list_object_resources_page (text wrapper)
list_object_resources_since_fast     → get_object_resources_batch
list_object_resources_filtered_page  → get_filtered_object_ids + get_object_resources_batch
list_object_resources_filtered_since_fast → get_filtered_object_ids + get_object_resources_batch

get_object_resource → compose_object_resource_blocks → resource_block_*
get_object_resource_adapted [PATCHED E4] → get_object_resource (wraps and extends)
```

### Adapted / cards chain

```
get_object_card
  └── (direct query)

get_object_cards_batch → get_object_card
get_object_cards_adapted_batch → get_object_cards_batch (wraps and extends)
```

### Deep data chain (partially broken — E1, E2)

```
get_object_with_deep_data          → get_objects_with_deep_data
get_objects_by_type_with_deep_data → get_objects_with_deep_data
search_objects_with_deep_data      → get_objects_with_deep_data

get_objects_with_deep_data internally calls:
  ├── get_parent_object_data   (CLEAN)
  ├── get_actor_data           [PATCHED E1 — aor.created_at added to GROUP BY]
  └── get_organization_data    [PATCHED E2 — ool.is_primary, ool.created_at added to GROUP BY]
```

### Itinerary chain (partially broken — E3)

```
export_itineraries_gpx_batch → export_itinerary_gpx
get_itinerary_track_simplified (CLEAN)
get_itinerary_track_geojson    [PATCHED E3 — json_build_array cast to jsonb; WARNING W1 — missing i18n remains]
```

### Legal records chain

```
get_expiring_legal_records_api        → get_expiring_legal_records
get_pending_document_requests_api     → get_pending_document_requests [WARNING W3]
generate_legal_expiry_notifications   → get_expiring_legal_records
audit_legal_compliance                → ref_legal_type lateral [WARNING W2]
```

### Pagination / search utilities (leaf functions, all CLEAN)

```
All paginated list functions → cursor_pack / cursor_unpack
All paginated list functions → norm_search, pick_lang
All i18n consumers           → i18n_pick, i18n_pick_strict, i18n_get_text, i18n_get_text_strict
render_format_*              → leaf (no API function dependencies)
```

---

## 4. Mismatch Table — ERRORs

All 4 ERRORs patched 2026-03-22.

| ID | Object | File | Line | Finding | Fix Applied |
|----|--------|------|------|---------|-------------|
| E1 ✓ | `get_actor_data` | `api_views_functions.sql` | 4973 | `ORDER BY aor.created_at` not in `GROUP BY` — SQL grouping violation, runtime failure. | Added `aor.created_at` to `GROUP BY` at line 4973. |
| E2 ✓ | `get_organization_data` | `api_views_functions.sql` | 5058 | `ORDER BY ool.is_primary DESC, ool.created_at` not in `GROUP BY` — SQL grouping violation, runtime failure. | Added `ool.is_primary, ool.created_at` to `GROUP BY` at line 5058. |
| E3 ✓ | `get_itinerary_track_geojson` | `api_views_functions.sql` | 6086 | `json_build_array(v_track) \|\| v_stages::jsonb` mixed JSON/JSONB — type error at runtime for itineraries with stages. | Cast: `json_build_array(v_track)::jsonb \|\| v_stages::jsonb` at line 6086. |
| E4 ✓ | `get_object_resource_adapted` | `api_views_functions.sql` | 7167 | Hardcoded retired scheme code `'tourisme_handicap'` — `ref_classification_scheme` has no such row; `accessibility_labels` silently empty for all objects. | Replaced with V5 canonical `'LBL_TOURISME_HANDICAP'` at line 7167; COMMENT updated. |

---

## 5. Runtime-Risk Table

Ranked by runtime impact: **DEFINITE FAIL** > **LIKELY FAIL** > **SILENT DEGRADATION** > **EDGE CASE**.

| Rank | ID | Object | Risk Level | Impact |
|------|----|--------|------------|--------|
| 1 | E1 ✓ | `get_actor_data` | ~~DEFINITE FAIL~~ **PATCHED** | Was: SQL grouping error on all deep-data calls with actors. Fix: `aor.created_at` added to GROUP BY. |
| 2 | E2 ✓ | `get_organization_data` | ~~DEFINITE FAIL~~ **PATCHED** | Was: SQL grouping error on all deep-data calls with orgs. Fix: `ool.is_primary, ool.created_at` added to GROUP BY. |
| 3 | E3 ✓ | `get_itinerary_track_geojson` | ~~LIKELY FAIL~~ **PATCHED** | Was: type error for itineraries with stages. Fix: uniform JSONB concatenation. |
| 4 | E4 ✓ | `get_object_resource_adapted` | ~~SILENT DEGRADATION~~ **PATCHED** | Was: empty `accessibility_labels` for all objects. Fix: retired code replaced with `LBL_TOURISME_HANDICAP`. |
| 5 | W3 | `get_pending_document_requests` | **EDGE CASE** | Negative `days_since_requested` value if `document_requested_at` is in the future. Unlikely in production but possible if data is migrated or clock-skewed. Propagates to `get_pending_document_requests_api`. |
| 6 | W2 | `audit_legal_compliance` | **MAINTENANCE RISK** | Duplicated compliance CASE logic. Not a runtime failure today, but a future logic update touching only one copy will silently produce inconsistent compliance statuses. |
| 7 | W1 | `get_itinerary_track_geojson` | **SILENT DEGRADATION** | Stage names/descriptions returned in default language only; multilingual consumers receive no language selection. Already an issue on current data; will become more visible as multilingual content grows. |

---

## 6. Stale-Code Table

### Primary stale-code issue (E4)

| Object | File | Line | Retired Code | V5 Canonical Code | Effect |
|--------|------|------|--------------|-------------------|--------|
| `get_object_resource_adapted` | `api_views_functions.sql` | 7167 | `tourisme_handicap` | `LBL_TOURISME_HANDICAP` | ~~Accessibility labels always empty~~ **PATCHED 2026-03-22** |

### Pattern risk — other potentially retired codes

**Stale-code scan completed 2026-03-22.** Full-text grep for all 5 retired codes across `api_views_functions.sql` returned **0 matches**. The file is clean.

| Retired code | V5 canonical | Scan result |
|--------------|-------------|-------------|
| `green_key` | `LBL_CLEF_VERTE` | ✓ Not found |
| `eu_ecolabel` | `LBL_ECO_LABEL_UE` | ✓ Not found |
| `tourisme_handicap` | `LBL_TOURISME_HANDICAP` | ✓ Not found (patched E4) |
| `destination_excellence` | `LBL_DESTINATION_EXCELLENCE` | ✓ Not found |
| `qualite_tourisme` | `LBL_QUALITE_TOURISME` | ✓ Not found |

No further stale-code action required on `api_views_functions.sql`.

**Amenity family consolidation + normalization (2026-03-22):** Canonical amenity family code is `accessibility`. The intermediate V5 code `accessibilite` is retired. Rank-1b filter in `get_filtered_object_ids` uses `fam.code = 'accessibility'`.

Normalization pass applied to `seeds_data.sql` (2026-03-22):
- **22 legacy non-`acc_*` accessibility rows removed** from the seed creation path (wheelchair_access, accessible_bathroom, accessible_parking, hearing_impaired, braille_signage, tactile_flooring, audio_description, large_print, guide_dog_welcome, induction_loop, sign_language, visual_alerts, subtitles_available, written_communication, easy_read, pictograms, quiet_space, sensory_room, staff_trained_cognitive, staff_trained_mental, flexible_visit, low_stimulation).
- **10 new canonical `acc_*` codes added** for previously no-equiv concepts (acc_braille_signage, acc_guide_dog_welcome, acc_sign_language, acc_written_communication, acc_quiet_space, acc_sensory_room, acc_staff_cognitive_training, acc_staff_mental_training, acc_flexible_visit, acc_low_stimulation).
- **Final accessibility catalog: 42 `acc_*` codes only** under family `accessibility` (32 original V5 + 10 new). No non-`acc_*` code remains.
- Migration DO block migrates any pre-loaded `accessibilite` rows to `accessibility` and deletes the retired family entry.

### Label-ranking implementation (2026-03-22)

New filter key: `label_scheme_ranked` (string — a scheme code, e.g. `"LBL_CLEF_VERTE"`).

**Functions patched:**
- `get_filtered_object_ids` — return type extended to `TABLE(object_id TEXT, label_rank INTEGER)`. Admits both rank-0 and rank-1 objects. MV fast-path disabled when `label_scheme_ranked` is present (live joins required).
- `list_object_resources_filtered_page` — `filt` CTE pulls `fids.label_rank`; `paged` ORDER BY prepended with `f.label_rank` so rank-0 objects sort first. No other callers changed.

**Ranking logic:**

| Rank | Condition | Applies to |
|------|-----------|-----------|
| 0 | Exact `object_classification` row: `scheme.code = requested AND status = 'granted'` | All label schemes |
| 1a | `object_sustainability_action` linked via `object_sustainability_action_label` to an `object_classification` of the requested scheme | All sustainability label schemes |
| 1b | `object_amenity` in `ref_code_amenity_family.code = 'accessibility'` *(canonical — patched 2026-03-22)* | `LBL_TOURISME_HANDICAP` only |

Objects with neither rank-0 nor rank-1 evidence are excluded from the result set. Existing ordering (`name_normalized`, `id`) is preserved as tiebreaker within each rank.

---

## 7. Patch Plan

Ordered by priority. All patches are in `api_views_functions.sql`. No other file should be modified.

---

### Priority 1 — Fix E1: `get_actor_data` GROUP BY violation ✓ DONE
**Status:** Patched 2026-03-22.
**Change:** Added `aor.created_at` to `GROUP BY` at line 4973. No signature change.

---

### Priority 2 — Fix E2: `get_organization_data` GROUP BY violation ✓ DONE
**Status:** Patched 2026-03-22.
**Change:** Added `ool.is_primary, ool.created_at` to `GROUP BY` at line 5058. No signature change.

---

### Priority 3 — Fix E3: `get_itinerary_track_geojson` type coercion ✓ DONE
**Status:** Patched 2026-03-22.
**Change:** `json_build_array(v_track)::jsonb || v_stages::jsonb` at line 6086. Both operands are now JSONB; result is implicitly accepted by `json_build_object`. No signature change.
Note: W1 (missing i18n on stage names) is a separate remaining item — see Priority 6.

---

### Priority 4 — Fix E4: `get_object_resource_adapted` retired label code ✓ DONE
**Status:** Patched 2026-03-22.
**Change:** `'tourisme_handicap'` → `'LBL_TOURISME_HANDICAP'` at line 7167. COMMENT updated. No signature change.
**Next action:** Run stale-code scan for remaining retired codes per §6.

---

### Priority 5b — Accessibility model response enrichment ✓ DONE (2026-03-22)
**Status:** Patched 2026-03-22. Additive only — no signature change, no filter change, no behavioral regression.

**Context:** Seeds now carry 43 `acc_*` amenities with `extra->'disability_types'` (motor/hearing/visual/cognitive) and `LBL_TOURISME_HANDICAP` has 4 subvalues (`granted_motor`, `granted_hearing`, `granted_visual`, `granted_cognitive`) stored in `ref_classification_value` with `parent_id` → `granted`. `object_classification.subvalue_ids UUID[]` records which types apply per grant.

**Changes applied to `api_views_functions.sql`:**

| Function | New key | Source | Lines (approx.) |
|----------|---------|--------|-----------------|
| `get_object_resource` | `amenities[*].disability_types` | `ref_amenity.extra->'disability_types'` | ~2048 |
| `get_object_resource` | `classifications[*].disability_types_covered` | `object_classification.subvalue_ids` → `ref_classification_value.metadata->>'disability_type'` | ~2180 |
| `get_object_resource_adapted` | `accessibility_labels[*].disability_types` | `object_classification.subvalue_ids` → `ref_classification_value.metadata->>'disability_type'` | ~7228 |
| `get_object_resource_adapted` | `accessibility_amenity_coverage` | distinct union of `ref_amenity.extra->'disability_types'` across all `acc_*` amenities on the object | ~7248 |

**Behavior:**
- `disability_types` on amenity items: `null` for non-`acc_*` amenities; JSONB array (e.g. `["hearing"]`) for typed amenities.
- `disability_types_covered` on classification items: `[]` for non-LBL_TOURISME_HANDICAP schemes; `[]` for grants with no `subvalue_ids`; array of type strings when populated.
- `accessibility_amenity_coverage`: always `[]` or a sorted distinct array; never null. Empty until pilot objects are inserted with `acc_*` amenities.
- All new keys are additive — existing consumers that do not read these keys are unaffected.

---

### Priority 5c — Accessibility filter extension on `get_filtered_object_ids` ✓ DONE (2026-03-22)
**Status:** Patched 2026-03-22. Additive only — no signature change, no existing filter modified, no behavioral regression.

**Context:** Seeds carry 43 `acc_*` amenities each tagged with `ref_amenity.extra->'disability_types'` (vocabulary: `motor` / `hearing` / `visual` / `cognitive`). `LBL_TOURISME_HANDICAP` has 4 subvalue rows (`granted_motor`, `granted_hearing`, `granted_visual`, `granted_cognitive`) in `ref_classification_value`; `object_classification.subvalue_ids UUID[]` records which types apply per grant.

**Changes applied to `api_views_functions.sql` — `api.get_filtered_object_ids()` only:**

| Zone | Change |
|------|--------|
| `params` CTE (~lines 975–980) | Two new `CASE WHEN n.filters ? '...' THEN ARRAY(...)` declarations extract `disability_types_any` and `label_disability_types_any` as `TEXT[]`; `NULL` when key absent, `'{}'` when key present but empty. |
| `use_mv` flag (~lines 993–994) | Two new `OR n.filters ? '...'` clauses force `use_mv = FALSE` when either filter is present — required because `cached_amenity_codes` does not carry disability-type data and `subvalue_ids` is not in `mv_filtered_objects`. |
| `WHERE` clause (~lines 1098–1123) | Two new `AND (... IS NULL OR cardinality(...) = 0 OR EXISTS (...))` conditions. |

**`disability_types_any` filter logic:**
```sql
AND (params.disability_types_any IS NULL OR cardinality(params.disability_types_any) = 0 OR EXISTS (
  SELECT 1
  FROM object_amenity oa
  JOIN ref_amenity ra ON ra.id = oa.amenity_id
  CROSS JOIN LATERAL jsonb_array_elements_text(
    COALESCE(ra.extra->'disability_types', '[]'::jsonb)
  ) AS dt(val)
  WHERE oa.object_id = src.object_id
    AND ra.code LIKE 'acc_%'
    AND dt.val = ANY(params.disability_types_any)
))
```
Returns objects with ≥1 `acc_*` amenity whose `extra.disability_types` overlaps the requested set. Empty array → no effect (`cardinality` guard).

**`label_disability_types_any` filter logic:**
```sql
AND (params.label_disability_types_any IS NULL OR cardinality(params.label_disability_types_any) = 0 OR EXISTS (
  SELECT 1
  FROM object_classification oc
  JOIN ref_classification_scheme cs ON cs.id = oc.scheme_id
  CROSS JOIN LATERAL unnest(oc.subvalue_ids) AS sv(uid)
  JOIN ref_classification_value cv ON cv.id = sv.uid
  WHERE oc.object_id = src.object_id
    AND cs.code = 'LBL_TOURISME_HANDICAP'
    AND oc.status = 'granted'
    AND cv.metadata->>'disability_type' = ANY(params.label_disability_types_any)
))
```
Returns objects with an explicit `LBL_TOURISME_HANDICAP` granted classification whose `subvalue_ids` contain ≥1 of the requested types. Does **not** infer from amenities — certification only. Empty array → no effect.

**Validation performed (2026-03-22) — transaction rollback on `Dimitile Hôtel` (existing pilot object):**

| Test | Filter | Amenities / grant inserted | Expected | Result |
|------|--------|---------------------------|----------|--------|
| 1 | `disability_types_any = ["motor"]` | `acc_pmr_parking` (motor) | match | ✓ OK |
| 2 | `disability_types_any = ["visual"]` | `acc_braille_signage` (visual) | match | ✓ OK |
| 3 | `disability_types_any = ["cognitive"]` | none for cognitive | no match | ✓ OK |
| 4 | `label_disability_types_any = ["motor"]` | T&H grant, subvalue_ids = [motor, hearing] | match | ✓ OK |
| 5 | `label_disability_types_any = ["hearing"]` | T&H grant, subvalue_ids = [motor, hearing] | match | ✓ OK |
| 6 | `label_disability_types_any = ["visual"]` | T&H grant, subvalue_ids = [motor, hearing] only | no match | ✓ OK |

All inserts rolled back. Live data unchanged.

**Remaining open step (not in this patch):** performance cache — if `disability_types_any` becomes a hot-path filter, a `cached_disability_types TEXT[]` column on `object` + GIN index would allow MV-based fast filtering. Deferred until usage volume justifies the DDL cost.

---

### Priority 5 — Fix W3: `get_pending_document_requests` negative days guard
**Urgency:** Low — edge case, not currently triggered in normal data.
**File:** `api_views_functions.sql`
**Line:** ~6809

**Fix:**
```sql
-- Replace:
(CURRENT_DATE - ol.document_requested_at::DATE)::INTEGER
-- With:
GREATEST((CURRENT_DATE - ol.document_requested_at::DATE)::INTEGER, 0)
```
This fix propagates correctly to `get_pending_document_requests_api` which wraps this function.

---

### Priority 6 — Fix W1: `get_itinerary_track_geojson` missing i18n on stage names
**Urgency:** Low — silent language fallback, not a crash.
**File:** `api_views_functions.sql`
**Lines:** 6072–6073

**Fix:** Replace plain `name` / `description` column references with `i18n_pick_strict(name_i18n, p_lang)` (or `i18n_pick` if graceful fallback is preferred), matching the multilingual pattern used elsewhere in the function layer. Confirm that `object_iti_stage` has `name_i18n` and `description_i18n` columns before applying.

Apply in the same pass as E3 (Priority 3).

---

### Priority 7 — Address W2: `audit_legal_compliance` duplicated CASE logic
**Urgency:** Low — no immediate runtime impact.
**File:** `api_views_functions.sql`
**Lines:** 6616–6625 and 6660–6669

**Fix:** Extract the compliance status CASE expression into a shared CTE or a dedicated helper function (e.g., `classify_legal_compliance_status`) and reference it from both locations. This eliminates the dual-maintenance risk. This is a refactor, not a hotfix; schedule for a non-urgent cleanup pass.

---

## 8. Clean / Validated / Likely-Issue Distinction

### CLEAN — confirmed no findings (86 objects)

These objects passed all schema checks with no structural, grouping, type, or stale-code findings. Includes:
- All 21 utility functions (batch 1): render, i18n, cursor, JSON helpers
- All 17 core resource retrieval functions (batch 2): resource_block_*, compose, get_object_resource
- All 11 publication/opening/pagination functions (batch 3)
- 8 of 10 deep-data/map functions (batch 4): excludes get_actor_data, get_organization_data
- 7 of 9 media/reviews/rooms/itinerary functions (batch 5): excludes get_itinerary_track_geojson
- 15 of 17 legal records functions (batch 6): excludes audit_legal_compliance, get_pending_document_requests
- 7 of 8 validation/adapted/dashboard functions (batch 7): excludes get_object_resource_adapted

CLEAN status means: no SQL structural error, no retired code reference, no type mismatch was found. It does **not** mean the function has been executed and validated against live data.

### VALIDATED (functionally exercised) — not determined by this audit

This audit is a static schema inspection. No function was executed against a live or test database. Functional validation (correct output, correct joins, correct pagination behavior) is out of scope and remains the responsibility of the integration test suite and staging verification.

### LIKELY-ISSUE — objects with known non-ERROR concerns

Beyond the 7 flagged objects, the following warrant attention in the next review pass:
- Any function referencing `ref_classification_scheme` by code string should be checked against the V5 canonical code list (§6) after a full-text scan.
- `get_object_cards_adapted_batch` wraps `get_object_cards_batch` and may inherit any data-quality issues from the adapted layer. Review once E4 is patched.
- `generate_legal_expiry_notifications` wraps `get_expiring_legal_records`. CLEAN today; re-verify if `get_expiring_legal_records` is ever modified.

---

## 9. Impact on Immediate API Verification

### What will fail in the current state

All 4 previously blocking defects are patched. No ERRORs remain.

| Scenario | Status |
|----------|--------|
| Deep-data endpoints with linked actors | ✓ PATCHED — E1 resolved |
| Deep-data endpoints with linked organisations | ✓ PATCHED — E2 resolved |
| Itinerary GeoJSON for itineraries with stages | ✓ PATCHED — E3 resolved |
| Adapted resource endpoint accessibility labels | ✓ PATCHED — E4 resolved |

### What is safe to verify now (no blocking issue)

- All utility, render, i18n, cursor functions — no findings, safe to call.
- All pagination endpoints (`list_object_resources_*`) — no findings.
- All opening/time-slot functions — no findings.
- All legal records endpoints except `audit_legal_compliance` (W2 only, no crash) and `get_pending_document_requests` (W3 only, edge case).
- Map endpoints (`get_object_map_item`, `list_objects_map_view`) — no findings.
- GPX export functions — no findings.
- Dashboard endpoints — no findings.
- `get_object_resource` (non-adapted) — no findings.
- `get_object_card` / `get_object_cards_batch` — no findings.

### Pre-verification patch sequence — status

1. ✓ E1 (`get_actor_data`) — patched 2026-03-22
2. ✓ E2 (`get_organization_data`) — patched 2026-03-22
3. ✓ E3 (`get_itinerary_track_geojson`) — patched 2026-03-22
4. ✓ E4 (`get_object_resource_adapted`) — patched 2026-03-22
5. ✓ Run stale-code scan for other retired scheme codes across `api_views_functions.sql` — completed 2026-03-22, 0 additional hits
6. ☐ Apply W3, W1, W2 fixes in a separate non-blocking cleanup commit — pending

All 93 objects are now structurally sound for verification. Steps 5–6 close the remaining maintenance risks.

---

*Audit produced by api-audit-reconciler subagent. Canonical mapping decisions referenced from `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md`. Do not duplicate mapping decisions in this file; update that log for any new decisions arising from patch work.*
