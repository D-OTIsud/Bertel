# Accessibility V6 Gap Analysis

Status: Step 1 discovery only. No SQL was written or applied, and no live Supabase MCP tooling was used. Revised after `accessibility-v6-review.md` to add the editor write-trap and narrow `CAT_ACCESS` materialization to optional search-expansion work.

Date: 2026-06-04

## Method

The project has `graphify-out/graph.json`, so I first attempted the required scoped graph query. The `graphify` executable was not available on PATH in this shell, and `graphify-out/wiki/index.md` is absent, so this analysis uses targeted repo reads with exact line ranges.

## Local Sources Inspected

| File | Relevant ranges | Why inspected |
|---|---:|---|
| `Base de donnée DLL et API/seeds_data.sql` | 2309-3663 | Sustainability V5 seed pattern: labels, singleton values, categories, groups, micro-actions, and label-equivalence rows. |
| `Base de donnée DLL et API/seeds_data.sql` | 3665-3920 | Section B Accessibilite V5 seed block. |
| `Base de donnée DLL et API/migration_sustainability_v5.sql` | 1-157 | DDL pattern for action groups, action external codes, equivalence tables, and search/coverage views. |
| `Base de donnée DLL et API/api_views_functions.sql` | 1206-1234 | Definitive API proof for amenity-derived and label-subvalue-derived accessibility filters. |
| `bertel-tourism-ui/src/services/object-workspace.ts` | 837, 1182, 3604-3611 | Frontend read/select coverage and the distinction save payload that omits `subvalue_ids`. |
| `bertel-tourism-ui/src/features/object-editor/sections/SectionAccessibility.tsx` | 176-192 | Editor chips that mutate covered disability families in draft state. |
| `docs/architecture/OBJECT_DATA_DICTIONARY.md` | 116-123, 415-434, 1472-1479, 1796-1803 | Current object classification/subvalue and accessibility discovery contract. |

## What Exists in `seeds_data.sql` Section B

| Existing item | Line range | Notes |
|---|---:|---|
| Section header | 3665-3669 | Section B is labelled "Accessibilite V5"; comments say it was extracted from `seeds_accessibility_v5.sql` and includes `LBL_TOURISME_HANDICAP`, the accessibility amenity family, and acc_* equipment. |
| `LBL_TOURISME_HANDICAP` scheme | 3671-3686 | Inserts/updates a `single` selection, `is_distinction = TRUE`, `display_group = 'accessibility_labels'` scheme. |
| `granted` value | 3688-3702 | Inserts/updates singleton value `granted` with metadata `{kind: label_status, label_code: LBL_TOURISME_HANDICAP}`. |
| T&H disability subvalues | 3704-3754 | Adds child values under `granted`: `granted_motor`, `granted_hearing`, `granted_visual`, `granted_cognitive`; metadata carries `disability_type` using `motor`, `hearing`, `visual`, `cognitive`. |
| Accessibility amenity family | 3756-3767 | Seeds canonical amenity family code `accessibility` through `ref_code`, with metadata `{seed: v5, source: CAT_ACCESS}`. |
| Accessibility amenities | 3769-3831 | Seeds 43 `acc_*` `ref_amenity` rows. The first mapped rows carry `source_action_external_code` and `source_group_code` in `extra`; the final 10 no-equivalent canonical rows only carry `accessibility_seed_v`. |
| Amenity disability typing | 3833-3905 | Updates all `acc_*` amenities with `extra.disability_types`, using the same four canonical values. |
| Validation | 3907-3920 | Raises if any `acc_*` row lacks `extra.disability_types`. |

Comment caveat: the Section-B header **previously said** "32 equipements acc_*" at `seeds_data.sql:3668` — **corrected to 43 on 2026-06-04** (33 mapped + 10 NO-EQUIV, `seeds_data.sql:3769-3817`). `lot1_mapping_decisions.md:350-353` records that the original comment was wrong.

The architecture dictionary also confirms the intended evidence model: `object_classification.subvalue_ids` stores optional sub-values for multidimensional schemes such as Tourisme & Handicap (`OBJECT_DATA_DICTIONARY.md:116-123`), and accessibility discovery can come from official label subvalues or amenity-derived disability coverage (`OBJECT_DATA_DICTIONARY.md:432-434`). The public filter contract names `disability_types_any` for amenity-derived coverage and `label_disability_types_any` for `LBL_TOURISME_HANDICAP` subvalues (`OBJECT_DATA_DICTIONARY.md:1796-1803`).

## Sustainability V5 Pattern to Compare Against

| Pattern element | Existing V5 source | Accessibility V5 parity |
|---|---:|---|
| Classification schemes and singleton `granted` values | Sustainability labels in `seeds_data.sql:2319-2367` | Present for `LBL_TOURISME_HANDICAP` in `seeds_data.sql:3671-3702`. |
| Categories `CAT_*` | Sustainability categories seeded in `seeds_data.sql:2369-2392`; comment explicitly says "excluding CAT_ACCESS". | Not materialized as `CAT_ACCESS` in `ref_sustainability_action_category`; only the amenity family has metadata source `CAT_ACCESS` at `seeds_data.sql:3756-3767`. |
| Groups `SA_*` | Sustainability action groups start at `seeds_data.sql:2394-2475`. | Not materialized. `SA_ACCESSIBLE_*` appears only as `ref_amenity.extra.source_group_code` on selected `acc_*` amenities at `seeds_data.sql:3774-3806`. |
| Micro-actions `MA_*` | Sustainability micro-actions are inserted into `ref_sustainability_action` in four blocks at `seeds_data.sql:2488-2818`. | Not materialized. `MA_*` appears only as `ref_amenity.extra.source_action_external_code` on selected `acc_*` amenities at `seeds_data.sql:3774-3806`. |
| Label equivalence tables | DDL creates `ref_classification_equivalent_group` and `ref_classification_equivalent_action` in `migration_sustainability_v5.sql:46-85`; seed rows are inserted in `seeds_data.sql:3021-3657`. | No `LBL_TOURISME_HANDICAP` equivalence rows in Section B. |
| Equivalence views | `v_object_classification_or_equivalent_scheme` and `v_object_classification_coverage` are defined in `migration_sustainability_v5.sql:87-155`. | Views can only consume rows in the equivalence tables; because accessibility has no materialized actions/equivalence rows, T&H cannot benefit from ranked equivalent evidence. |
| Subvalues | Sustainability labels use a singleton `granted` value only. | Accessibility is ahead here: four T&H disability subvalues already exist at `seeds_data.sql:3704-3754`. |

## Gaps

1. `CAT_ACCESS` is not materialized in `ref_sustainability_action_category`.
   Section A deliberately excludes it (`seeds_data.sql:2369`), while Section B only references `CAT_ACCESS` as metadata on the amenity family (`seeds_data.sql:3756-3767`). This prevents accessibility actions from joining the same category/group/action model as sustainability.

2. `SA_ACCESSIBLE_*` and `MA_*` are metadata only for accessibility.
   Existing `acc_*` amenities preserve source group/action codes in `extra`, but there are no corresponding `ref_sustainability_action_group` or `ref_sustainability_action` rows. That means `object_sustainability_action` cannot represent accessibility practices as first-class actions.

3. `LBL_TOURISME_HANDICAP` has no label-equivalence rows.
   Sustainability labels can be discovered through explicit label grants or equivalent action/group evidence. T&H has official label/subvalue evidence and amenity disability coverage, but not the V5 equivalent-action path.

4. Existing equivalence tables are scheme-level, not subvalue-level.
   The V5 tables key equivalence rows by `(scheme_id, group_id)` or `(scheme_id, action_id)` only (`migration_sustainability_v5.sql:46-80`). They cannot say that an equivalent action supports only `granted_motor` or `granted_hearing` without adding metadata conventions or DDL. This is important because T&H is awarded by disability family.

5. Section B has a stale comment risk.
   `seeds_data.sql:3710` says `api.get_filtered_object_ids` does not yet read `subvalue_ids`, but the code now proves the opposite: `label_disability_types_any` resolves `object_classification.subvalue_ids` through `ref_classification_value.metadata->>'disability_type'` at `api_views_functions.sql:1224-1234`. Step 2 should avoid relying on the old comment as a live API truth.

6. No duplicate `acc_*` gap is visible.
   Section B already has 43 canonical `acc_*` amenities and validates that all carry `disability_types`. V6 should avoid creating duplicate amenity codes unless a researched concept is genuinely missing and reviewed.

7. Editor write-trap: `object_classification.subvalue_ids` has no app writer.
   The editor renders editable "Types de handicap couverts" chips for accessibility labels (`SectionAccessibility.tsx:176-192`), and the read path hydrates `disabilityTypesCovered` from `subvalue_ids` (`object-workspace.ts:837`). However, `saveObjectWorkspaceDistinctions` writes only `object_id`, `scheme_id`, `value_id`, `status`, `awarded_at`, and `valid_until` (`object-workspace.ts:3604-3611`); repo-wide `subvalue_ids` matches show reads/selects but no write payload. Therefore the certified-label filter `label_disability_types_any` can work for directly imported/SQL-populated data, but app-authored objects cannot currently fill it. Seeds cannot fix this; a separate frontend/RPC save change is required and remains out of scope for this V6 seed package. **Update 2026-06-04:** that save change has since landed (`subvalue_ids` now persisted — `lot1_mapping_decisions.md` §30), and it surfaced a broader still-open blocker: the editor wrote label `status='active'` while all backend label reads/filters require `status='granted'` (verified live: 230/230 rows `granted`, 0 `active/pending/expired`), so app-authored labels stayed invisible regardless. **Both resolved 2026-06-04 (`lot1_mapping_decisions.md` §30 + §31): the editor's label-status vocabulary is aligned to canonical `granted`; app-authored labels are now visible end-to-end. Frontend-only, no seed change.**

## Recommendation

Default Step 2 recommendation: do not materialize `CAT_ACCESS`/`SA_ACCESSIBLE_*`/`MA_*` for V6 unless the product explicitly wants T&H rank-1 search expansion, coverage views, or accessibility action authoring. The two live disability-type filters already work without the sustainability action model: `disability_types_any` reads `ref_amenity.extra.disability_types`, and `label_disability_types_any` reads `object_classification.subvalue_ids`.

If those optional consumers are approved, prefer the existing `ref_sustainability_*` action model with a new `CAT_ACCESS` category over introducing new `ref_accessibility_*` tables.

Pros:

- No DDL is required if the V5 migration is already present; Step 3 can stay idempotent seed-only.
- It preserves parity with Sustainability V5: `CAT_ACCESS` -> `SA_ACCESSIBLE_*` -> `MA_*` -> `ref_classification_equivalent_*`.
- Existing ranked-label and coverage views can be reused for scheme-level search expansion once T&H equivalence rows are seeded.
- Section B already hints at this shape through `source: CAT_ACCESS`, `source_group_code`, and `source_action_external_code` metadata.

Cons:

- The table names are sustainability-specific, so accessibility actions would live in a semantically broad table family.
- Scheme-level equivalence cannot express per-disability-family certification coverage without an additional convention or future DDL.
- Product/API copy must be careful not to imply that amenity evidence is the same as certified Tourisme & Handicap subvalue coverage.
- Sustainability cross-contamination is the concrete risk: `object_sustainability_action` powers `sustainability_any`, `sustainability_categories_any`, `sustainability_actions_any`, and coverage views. If `CAT_ACCESS` actions are inserted there without explicit scoping, accessibility-only evidence can leak into sustainability discovery.
- A third source of truth would appear alongside existing amenity evidence and certified label subvalues. That is only acceptable if a concrete consumer justifies it and the scoping rules are documented.

New tables would be cleaner semantically and could model per-disability evidence explicitly, but they would add DDL, duplicate lookup/view logic, and require a larger API/read-model design. For V6's gated seed scope, the conservative path is no new table and no default `CAT_ACCESS` materialization. If optional action/equivalence materialization is approved later, use the existing V5 action/equivalence model and add no DDL unless Step 2 proves subvalue-aware equivalence is mandatory now.

## Step 2 Design Implications

The seed-design package should decide whether existing `acc_*` amenities need reusable `SA_ACCESSIBLE_*` groups and `MA_*` actions at all. The default should be "do not seed them" unless the review identifies a concrete rank-1, coverage, or authoring consumer and a sustainability-exclusion rule.

The design should keep official T&H disability subvalues as the certified label evidence path and use equivalent actions only for search expansion or coverage, not as automatic proof that a T&H disability subvalue has been awarded.

If `LBL_TOURISME_HANDICAP` equivalence rows are proposed, the review package should explicitly mark each row `obligatoire` or `recommandé` and explain whether the row supports only scheme-level discovery or a future subvalue-aware rule.

The design must explicitly record that label-subvalue definitions are already present but app-authored `subvalue_ids` are inert until a separate editor/RPC save change lands. This is not a seed blocker, but it is a live-value blocker for certified per-family filters.
