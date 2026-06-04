# Accessibility V6 Seed Design

Status: Step 2 design package only. No SQL was applied, no seed SQL file was created, no Supabase MCP tooling was used, and no frontend wiring was changed.

Date: 2026-06-04

Inputs:

- `docs/research/accessibility-v6-research.md`
- `docs/research/accessibility-v6-gap-analysis.md`
- `docs/research/accessibility-v6-review.md`
- `Base de donnée DLL et API/seeds_data.sql` Section B (`3665-3920`)
- `Base de donnée DLL et API/migration_sustainability_v5.sql` (`1-157`)
- `Base de donnée DLL et API/api_views_functions.sql` accessibility filters (`1206-1234`)

## 1. Design Decisions

| Decision | Why |
|---|---|
| Keep `LBL_TOURISME_HANDICAP` as the single certified accessibility label scheme. | Official sources define Tourisme & Handicap as an establishment/prestation label evaluated across four disability families. Existing Section B already seeds `LBL_TOURISME_HANDICAP` with `display_group = 'accessibility_labels'` (`seeds_data.sql:3671-3686`). |
| Keep the four existing T&H subvalues under `granted`: `granted_motor`, `granted_hearing`, `granted_visual`, `granted_cognitive`. | Official sources use moteur/auditif/visuel/mental. Section B already maps those to canonical repo values `motor`, `hearing`, `visual`, `cognitive` (`seeds_data.sql:3704-3754`). |
| Treat `cognitive` as the repo bucket for T&H `mental` plus adjacent cognitive/psychic support concepts. | Section B already maps `granted_cognitive` to display name "mental"; amenity typing also puts cognitive and mental-training concepts under `["cognitive"]` (`seeds_data.sql:3728-3732`, `3894-3895`). Splitting it now would break the locked vocabulary. |
| Do not create, recode, or duplicate any `acc_*` amenity in V6. | The catalog already has 43 canonical `acc_*` rows and a validation block that fails if any lacks `extra.disability_types` (`seeds_data.sql:3769-3920`). |
| Default V6 design does not materialize `CAT_ACCESS`, `SA_ACCESSIBLE_*`, or `MA_*` into `ref_sustainability_*`. | The live accessibility filters do not require them: `disability_types_any` reads `ref_amenity.extra.disability_types`, and `label_disability_types_any` reads `object_classification.subvalue_ids` (`api_views_functions.sql:1206-1234`). Materializing accessibility into `object_sustainability_action` risks sustainability-filter leakage. |
| If a later product decision wants accessibility rank-1 search expansion or coverage views, reuse the existing V5 `ref_sustainability_*` action/equivalence model rather than creating new `ref_accessibility_*` tables. | `migration_sustainability_v5.sql:19-85` already provides action groups, action external codes, and the equivalent group/action tables (the `ref_sustainability_action_category` table itself comes from `schema_unified.sql`, the migration's prerequisite). Reuse would be seed-only and avoids duplicate lookup/view systems. |
| Do not seed `LBL_TOURISME_HANDICAP` equivalence rows in the default V6 package. | Scheme-level equivalence rows cannot certify a specific disability family. They would only support optional search expansion/coverage and could conflate amenity evidence with certified label evidence. |
| Record the editor write-trap as a seed-design constraint, not a seed fix. | The API reads `subvalue_ids`, and the editor displays disability chips, but `saveObjectWorkspaceDistinctions` omits `subvalue_ids` (`object-workspace.ts:3604-3611`). Frontend/RPC save work is explicitly out of scope for this seed package. |
| DDL decision (recorded here in §1): no DDL is justified for Step 3 seeds. | Existing schema already supports label subvalues, amenity disability typing, and optional V5 action/equivalence reuse. Any future subvalue-aware equivalence would require separate API/view design and should not be smuggled into seed work. |

## 2. Code Inventory: CAT/SA/MA

Default design: inventory only. No `CAT_ACCESS`, `SA_ACCESSIBLE_*`, or `MA_*` rows should be inserted in Step 3 unless the user explicitly changes this design.

| Code | Current state | V6 default action | Why |
|---|---|---|---|
| `CAT_ACCESS` | Exists only as amenity-family metadata source: `{"seed": "v5", "source": "CAT_ACCESS"}` (`seeds_data.sql:3756-3767`). Not present in `ref_sustainability_action_category`. | Do not materialize. | Existing filters do not need it; materialization risks sustainability cross-contamination. |
| `SA_ACCESSIBLE_DOCUMENTS` | Already in `ref_amenity.extra.source_group_code` for mapped amenities. | Keep amenity.extra only. | Optional action group only if rank-1/coverage/action-authoring is approved. |
| `SA_ACCESSIBLE_LIFT` | Already in amenity.extra only. | Keep amenity.extra only. | Same. |
| `SA_ACCESSIBLE_MENUS` | Already in amenity.extra only. | Keep amenity.extra only. | Same. |
| `SA_ACCESSIBLE_PARKING` | Already in amenity.extra only. | Keep amenity.extra only. | Same. |
| `SA_ACCESSIBLE_PATHWAYS` | Already in amenity.extra only. | Keep amenity.extra only. | Same. |
| `SA_ACCESSIBLE_RECEPTION` | Already in amenity.extra only. | Keep amenity.extra only. | Same. |
| `SA_ACCESSIBLE_ROOMS` | Already in amenity.extra only. | Keep amenity.extra only. | Same. |
| `SA_ACCESSIBLE_SANITARY` | Already in amenity.extra only. | Keep amenity.extra only. | Same. |
| `SA_ACCESSIBLE_SHOWER` | Already in amenity.extra only. | Keep amenity.extra only. | Same. |
| `SA_ACCESSIBLE_SIGNAGE` | Already in amenity.extra only. | Keep amenity.extra only. | Same. |
| `SA_HEARING_ASSISTANCE` | Already in amenity.extra only. | Keep amenity.extra only. | Same. |
| `SA_MULTISENSORY_SAFETY` | Already in amenity.extra only. | Keep amenity.extra only. | Same. |
| `SA_SUBTITLE_AUDIO_DESC` | Already in amenity.extra only. | Keep amenity.extra only. | Same. |

### 2.1 MA Inventory

| Group | MA code | Amenity code | Current state | V6 default action |
|---|---|---|---|---|
| `SA_ACCESSIBLE_DOCUMENTS` | `MA_BRAILLE_OR_AUDIO` | `acc_braille_or_audio_docs` | Already in amenity.extra only | Keep |
| `SA_ACCESSIBLE_DOCUMENTS` | `MA_FALC_DOCS` | `acc_falc_docs` | Already in amenity.extra only | Keep |
| `SA_ACCESSIBLE_DOCUMENTS` | `MA_LARGE_PRINT_DOCS` | `acc_large_print_docs` | Already in amenity.extra only | Keep |
| `SA_ACCESSIBLE_LIFT` | `MA_BRAILLE_BUTTONS` | `acc_braille_buttons` | Already in amenity.extra only | Keep |
| `SA_ACCESSIBLE_LIFT` | `MA_LIFT_DIMENSIONS` | `acc_accessible_lift` | Already in amenity.extra only | Keep |
| `SA_ACCESSIBLE_LIFT` | `MA_VISUAL_AUDIO_ANNOUNCE` | `acc_visual_audio_announce` | Already in amenity.extra only | Keep |
| `SA_ACCESSIBLE_MENUS` | `MA_CONTRAST_MENU` | `acc_contrast_menu` | Already in amenity.extra only | Keep |
| `SA_ACCESSIBLE_MENUS` | `MA_LARGE_PRINT_MENU` | `acc_large_print_menu` | Already in amenity.extra only | Keep |
| `SA_ACCESSIBLE_MENUS` | `MA_SIMPLIFIED_MENU` | `acc_simplified_menu` | Already in amenity.extra only | Keep |
| `SA_ACCESSIBLE_PARKING` | `MA_PMR_SIGNAGE` | `acc_pmr_signage` | Already in amenity.extra only | Keep |
| `SA_ACCESSIBLE_PARKING` | `MA_PMR_SPACES` | `acc_pmr_parking` | Already in amenity.extra only | Keep |
| `SA_ACCESSIBLE_PATHWAYS` | `MA_STEP_REMOVAL` | `acc_step_removal` | Already in amenity.extra only | Keep |
| `SA_ACCESSIBLE_PATHWAYS` | `MA_TACTILE_GUIDANCE` | `acc_tactile_guidance` | Already in amenity.extra only | Keep |
| `SA_ACCESSIBLE_PATHWAYS` | `MA_WIDTH_120CM` | `acc_width_120cm` | Already in amenity.extra only | Keep |
| `SA_ACCESSIBLE_RECEPTION` | `MA_LOWERED_COUNTER` | `acc_lowered_counter` | Already in amenity.extra only | Keep |
| `SA_ACCESSIBLE_ROOMS` | `MA_ADAPTED_BED_HEIGHT` | `acc_adapted_bed_height` | Already in amenity.extra only | Keep |
| `SA_ACCESSIBLE_ROOMS` | `MA_ROOM_CLEARANCE` | `acc_room_clearance` | Already in amenity.extra only | Keep |
| `SA_ACCESSIBLE_SANITARY` | `MA_ADAPTED_TOILET_HEIGHT` | `acc_adapted_toilet_height` | Already in amenity.extra only | Keep |
| `SA_ACCESSIBLE_SANITARY` | `MA_GRAB_BARS` | `acc_grab_bars` | Already in amenity.extra only | Keep |
| `SA_ACCESSIBLE_SANITARY` | `MA_TURNING_SPACE` | `acc_turning_space` | Already in amenity.extra only | Keep |
| `SA_ACCESSIBLE_SHOWER` | `MA_GRAB_BAR_SHOWER` | `acc_grab_bar_shower` | Already in amenity.extra only | Keep |
| `SA_ACCESSIBLE_SHOWER` | `MA_SHOWER_SEAT` | `acc_shower_seat` | Already in amenity.extra only | Keep |
| `SA_ACCESSIBLE_SHOWER` | `MA_WALK_IN_SHOWER` | `acc_walk_in_shower` | Already in amenity.extra only | Keep |
| `SA_ACCESSIBLE_SIGNAGE` | `MA_CONTRAST_SIGNAGE` | `acc_contrast_signage` | Already in amenity.extra only | Keep |
| `SA_ACCESSIBLE_SIGNAGE` | `MA_PICTOGRAMS_USED` | `acc_pictograms_used` | Already in amenity.extra only | Keep |
| `SA_ACCESSIBLE_SIGNAGE` | `MA_READABLE_HEIGHT` | `acc_readable_height` | Already in amenity.extra only | Keep |
| `SA_HEARING_ASSISTANCE` | `MA_HEARING_SIGNAGE` | `acc_hearing_signage` | Already in amenity.extra only | Keep |
| `SA_HEARING_ASSISTANCE` | `MA_MAGNETIC_LOOP` | `acc_magnetic_loop` | Already in amenity.extra only | Keep |
| `SA_MULTISENSORY_SAFETY` | `MA_FLASH_ALARMS` | `acc_flash_alarms` | Already in amenity.extra only | Keep |
| `SA_MULTISENSORY_SAFETY` | `MA_VIBRATING_ALARMS` | `acc_vibrating_alarms` | Already in amenity.extra only | Keep |
| `SA_SUBTITLE_AUDIO_DESC` | `MA_AUDIO_DESCRIPTION` | `acc_audio_description` | Already in amenity.extra only | Keep |
| `SA_SUBTITLE_AUDIO_DESC` | `MA_SUBTITLES` | `acc_subtitles` | Already in amenity.extra only | Keep |
| `SA_SUBTITLE_AUDIO_DESC` | `MA_VISIT_DEVICE` | `acc_visit_device` | Already in amenity.extra only | Keep |

The 10 NO-EQUIV amenities (`acc_braille_signage`, `acc_guide_dog_welcome`, `acc_sign_language`, `acc_written_communication`, `acc_quiet_space`, `acc_sensory_room`, `acc_staff_cognitive_training`, `acc_staff_mental_training`, `acc_flexible_visit`, `acc_low_stimulation`) remain amenity-only in this design. No new `SA_*`/`MA_*` codes are minted for them in V6.

## 3. Code Inventory: T&H Subvalues

| Scheme | Value code | Parent resolution | `metadata.disability_type` | Current state | V6 action |
|---|---|---|---|---|---|
| `LBL_TOURISME_HANDICAP` | `granted` | `NULL` | `NULL` | Existing singleton label value | Unchanged |
| `LBL_TOURISME_HANDICAP` | `granted_motor` | Parent is `ref_classification_value.id` for same scheme and `code = 'granted'` | `motor` | Existing child value | Unchanged |
| `LBL_TOURISME_HANDICAP` | `granted_hearing` | Same | `hearing` | Existing child value | Unchanged |
| `LBL_TOURISME_HANDICAP` | `granted_visual` | Same | `visual` | Existing child value | Unchanged |
| `LBL_TOURISME_HANDICAP` | `granted_cognitive` | Same | `cognitive` | Existing child value | Unchanged |

No UUID is hard-coded. Parent/child IDs must always be resolved by `(scheme_id, code)`.

## 4. Code Inventory: `acc_*` Changes

All 43 rows are `unchanged`. No new rows, no recodes, no description updates, and no `disability_types` edits are proposed in V6.

| Amenity code | Change | `disability_types` |
|---|---|---|
| `acc_braille_or_audio_docs` | unchanged | `["visual"]` |
| `acc_falc_docs` | unchanged | `["cognitive"]` |
| `acc_large_print_docs` | unchanged | `["visual"]` |
| `acc_braille_buttons` | unchanged | `["visual"]` |
| `acc_accessible_lift` | unchanged | `["motor"]` |
| `acc_visual_audio_announce` | unchanged | `["hearing", "visual"]` |
| `acc_contrast_menu` | unchanged | `["visual"]` |
| `acc_large_print_menu` | unchanged | `["visual"]` |
| `acc_simplified_menu` | unchanged | `["cognitive"]` |
| `acc_pmr_signage` | unchanged | `["motor"]` |
| `acc_pmr_parking` | unchanged | `["motor"]` |
| `acc_step_removal` | unchanged | `["motor"]` |
| `acc_tactile_guidance` | unchanged | `["visual"]` |
| `acc_width_120cm` | unchanged | `["motor"]` |
| `acc_lowered_counter` | unchanged | `["motor"]` |
| `acc_adapted_bed_height` | unchanged | `["motor"]` |
| `acc_room_clearance` | unchanged | `["motor"]` |
| `acc_adapted_toilet_height` | unchanged | `["motor"]` |
| `acc_grab_bars` | unchanged | `["motor"]` |
| `acc_turning_space` | unchanged | `["motor"]` |
| `acc_grab_bar_shower` | unchanged | `["motor"]` |
| `acc_shower_seat` | unchanged | `["motor"]` |
| `acc_walk_in_shower` | unchanged | `["motor"]` |
| `acc_contrast_signage` | unchanged | `["visual"]` |
| `acc_pictograms_used` | unchanged | `["cognitive"]` |
| `acc_readable_height` | unchanged | `["motor", "visual"]` |
| `acc_hearing_signage` | unchanged | `["hearing"]` |
| `acc_magnetic_loop` | unchanged | `["hearing"]` |
| `acc_flash_alarms` | unchanged | `["hearing"]` |
| `acc_vibrating_alarms` | unchanged | `["hearing"]` |
| `acc_audio_description` | unchanged | `["visual"]` |
| `acc_subtitles` | unchanged | `["hearing"]` |
| `acc_visit_device` | unchanged | `["visual", "hearing"]` |
| `acc_braille_signage` | unchanged | `["visual"]` |
| `acc_guide_dog_welcome` | unchanged | `["visual", "motor"]` |
| `acc_sign_language` | unchanged | `["hearing"]` |
| `acc_written_communication` | unchanged | `["hearing"]` |
| `acc_quiet_space` | unchanged | `["cognitive"]` |
| `acc_sensory_room` | unchanged | `["cognitive"]` |
| `acc_staff_cognitive_training` | unchanged | `["cognitive"]` |
| `acc_staff_mental_training` | unchanged | `["cognitive"]` |
| `acc_flexible_visit` | unchanged | `["cognitive", "motor"]` |
| `acc_low_stimulation` | unchanged | `["cognitive"]` |

## 5. Code Inventory: Classification Equivalence Rows

Default V6 proposes no rows in either equivalence table.

| Label | Table | Proposed rows | Requirement type | Match scope | Decision |
|---|---|---:|---|---|---|
| `LBL_TOURISME_HANDICAP` | `ref_classification_equivalent_group` | 0 | N/A | N/A | Do not seed by default. |
| `LBL_TOURISME_HANDICAP` | `ref_classification_equivalent_action` | 0 | N/A | N/A | Do not seed by default. |

Rationale: the certified T&H per-family path is `object_classification.subvalue_ids`, not equivalent sustainability/action evidence. Equivalence rows would only be optional search-expansion or coverage rows. They must not auto-imply `granted_motor`, `granted_hearing`, `granted_visual`, or `granted_cognitive`.

If a future review approves equivalence rows, each row must satisfy the V5 constraints:

- `requirement_type IN ('obligatoire','confort','points','recommandé')`
- `match_scope IN ('search_expansion','coverage','both')`
- group relation `IN ('macro_group','equivalent_group')`
- action relation `IN ('equivalent_action','direct_action')`

That future design must also state how `CAT_ACCESS` is excluded from sustainability filters and coverage reporting.

## 6. Will Not Change

- Will not create duplicate `acc_*` amenities.
- Will not rename `accessibility` amenity family or reintroduce retired `accessibilite`.
- Will not recode `motor`, `hearing`, `visual`, or `cognitive`.
- Will not split `cognitive` into separate cognitive/mental/psychic canonical values.
- Will not change `LBL_TOURISME_HANDICAP`, `granted`, or the four `granted_*` subvalue codes.
- Will not seed `Destination pour tous` or `Acceslibre` as T&H equivalents.
- Will not materialize `CAT_ACCESS`, `SA_ACCESSIBLE_*`, `MA_*`, or T&H equivalence rows in the default Step 3 seed.
- Will not write frontend save wiring for `subvalue_ids`.
- Will not disable the existing editor disability chips.
- Will not add DDL or modify live DB objects in Step 2.

## 7. Mapping Rules for Future Editor Wire

These are documentation-only mapping rules for a later frontend/RPC task.

Rule 1: resolve subvalue UUIDs by scheme and code, never by hard-coded UUID.

```sql
SELECT
  child.code,
  child.id,
  child.metadata->>'disability_type' AS disability_type
FROM ref_classification_scheme scheme
JOIN ref_classification_value parent
  ON parent.scheme_id = scheme.id
 AND parent.code = 'granted'
JOIN ref_classification_value child
  ON child.scheme_id = scheme.id
 AND child.parent_id = parent.id
WHERE scheme.code = 'LBL_TOURISME_HANDICAP'
  AND child.code IN (
    'granted_motor',
    'granted_hearing',
    'granted_visual',
    'granted_cognitive'
  )
ORDER BY child.position;
```

Rule 2: for an editor selection of canonical disability types, map:

| Editor code | Subvalue code | Official FR label |
|---|---|---|
| `motor` | `granted_motor` | Moteur |
| `hearing` | `granted_hearing` | Auditif |
| `visual` | `granted_visual` | Visuel |
| `cognitive` | `granted_cognitive` | Mental |

Rule 3: only save these IDs on an `object_classification` row whose scheme is `LBL_TOURISME_HANDICAP`, value is `granted`, and status is `granted`. Do not infer certified subvalues from `acc_*` amenities.

Rule 4: a certified T&H row with `value_id = granted` and empty `subvalue_ids` should be treated as label-present but family-unknown. It can satisfy `classifications_any`/badge display, but not `label_disability_types_any`. Note: per the arrêté du 18 avril 2024 a real T&H grant always covers ≥2 of the 4 families, so `granted` with empty `subvalue_ids` is a *data-quality gap* (label recorded without its family breakdown), not a valid terminal state — surface it in a future data-quality check rather than treating it as complete.

## 8. Risk and Rollback

Step 2 has no database rollback because it writes only this Markdown design file.

For Step 3, if the user approves the default design, no seed SQL is needed for `CAT_ACCESS`, `SA_*`, `MA_*`, equivalence rows, `acc_*`, or T&H subvalues. The only likely repo seed action would be documentation/runbook alignment, unless the user changes the design decision.

If a later approved design introduces seed rows, the SQL must be idempotent:

- reference data inserts use `ON CONFLICT (...) DO UPDATE`;
- guarded inserts use `WHERE NOT EXISTS` only when matching existing local pattern;
- no hard-coded UUIDs;
- no DDL unless separately justified in §1 (Design Decisions) and reflected in `schema_unified.sql` plus rollout docs.

Risks to carry forward:

| Risk | Impact | Mitigation |
|---|---|---|
| `subvalue_ids` write-trap | Certified per-family filters are inert for app-authored rows. | **RESOLVED 2026-06-04 (`lot1_mapping_decisions.md` §30)** — the editor saver now persists `subvalue_ids`. |
| Sustainability cross-contamination | Accessibility actions could make objects match sustainability filters. | Do not materialize `CAT_ACCESS` by default; require scoping if approved later. |
| Certification conflation | Amenities could be mistaken for T&H certification. | Keep amenity-derived `disability_types_any` separate from label-derived `label_disability_types_any`. |
| Stale comments | Section B comments said "32" and "API does not read subvalue_ids". | **CORRECTED 2026-06-04** in `seeds_data.sql` (32→43; the subvalue_ids comment now points to `label_disability_types_any`). |

Suggested validation SELECTs for a later approved Step 3/4:

```sql
-- T&H subvalues resolve and carry the locked disability types.
SELECT child.code, child.metadata->>'disability_type' AS disability_type
FROM ref_classification_scheme s
JOIN ref_classification_value parent
  ON parent.scheme_id = s.id AND parent.code = 'granted'
JOIN ref_classification_value child
  ON child.scheme_id = s.id AND child.parent_id = parent.id
WHERE s.code = 'LBL_TOURISME_HANDICAP'
ORDER BY child.position;

-- All canonical acc_* amenities are typed.
SELECT COUNT(*) AS missing_disability_types
FROM ref_amenity
WHERE code LIKE 'acc_%'
  AND NOT (extra ? 'disability_types');

-- Default V6 should not introduce T&H equivalence rows.
SELECT COUNT(*) AS th_equivalence_rows
FROM ref_classification_scheme s
LEFT JOIN ref_classification_equivalent_group eg ON eg.scheme_id = s.id
LEFT JOIN ref_classification_equivalent_action ea ON ea.scheme_id = s.id
WHERE s.code = 'LBL_TOURISME_HANDICAP'
  AND (eg.scheme_id IS NOT NULL OR ea.scheme_id IS NOT NULL);
```

## 9. Review Checklist

Answer yes/no before Step 3 repo seed work:

| # | Review item | Default answer in this design |
|---:|---|---|
| 1 | Does the design explicitly record the `subvalue_ids` write-trap? | Yes |
| 2 | Does the design decide whether to materialize `CAT_ACCESS`? | Yes: no by default. |
| 3 | If `CAT_ACCESS` is seeded, is there a sustainability-exclusion rule? | N/A for default; required if changed. |
| 4 | Does it list exact `SA_ACCESSIBLE_*` groups? | Yes, inventory only. |
| 5 | Does it list exact `MA_*` codes derived from amenity metadata? | Yes, inventory only. |
| 6 | Does it state treatment of the 10 NO-EQUIV amenities? | Yes: remain amenity-only. |
| 7 | Are proposed T&H equivalence rows marked with valid requirement/match types? | N/A: no rows proposed. |
| 8 | Does it confirm equivalence rows never auto-imply certified subvalues? | Yes. |
| 9 | Does it provide a will-not-change list? | Yes. |
| 10 | Does it give subvalue UUID resolution rules? | Yes. |
| 11 | Are future writes required to be idempotent? | Yes. |
| 12 | Does it confirm no DDL? | Yes. |
| 13 | Does it avoid UUID-generation concerns? | Yes: no UUID generation and no DDL/RPC. |
| 14 | Does it define validation queries? | Yes. |
| 15 | Does it identify smoke-test limits under P0? | Yes: direct SQL/import data is needed until editor save wiring exists. |

Blocking answers before live apply:

- No on #1 blocks live.
- Changing #2 to "yes, materialize" requires a yes on #3.
- Any proposed equivalence rows require yes on #7 and #8.

## 10. Step 3 Recommendation

If this design is approved as-is, Step 3 should not create accessibility materialization SQL. It should instead:

1. Create no `seeds_accessibility_v6.sql` content beyond an explicit no-op/commented manifest if the repo convention requires a file.
2. Update the relevant decision log with locked choices: existing 43 `acc_*`, existing 4 subvalues, no default `CAT_ACCESS` materialization, no T&H equivalence rows, and the out-of-scope editor write-trap.
3. Correct stale comments in `seeds_data.sql` only if the user approves repo edits in Step 3.

Review `accessibility-v6-seed-design.md`; reply `proceed-step-3` when approved.
