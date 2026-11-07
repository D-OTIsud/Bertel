# Accessibility V6 — Step 2 (Seed Design) Adversarial Review

Status: Read-only review of `docs/research/accessibility-v6-seed-design.md`. No SQL applied, no MCP, no frontend changed.
Date: 2026-06-04
Reviewer: adversarial peer review; every repo claim cited `file:line` (underlying facts verified in the Step 1 review pass against the same files).

---

## 1. Executive verdict

**APPROVE → `proceed-step-3`. Confidence: HIGH.**

The seed-design doc is accurate, complete against the 15-item §7 gate from `accessibility-v6-review.md`, correctly absorbed that review, and reaches the right conclusion: the accessibility **reference/seed layer is already complete**, so the default V6 package seeds **nothing**, and the real gap (the editor `subvalue_ids` write-trap) is correctly deferred to a separate frontend task rather than papered over with seeds.

Decisive safety point: the default design performs **zero DB writes**. "Proceed to Step 3" is therefore close to the safest possible outcome — the scrutiny is not "is it safe" (it is) but "is *doing nothing* correct" (yes, for seeds) and "does the team understand the headline feature still needs the frontend fix" (the one caveat — see §5).

- **APPROVE — YES.** Verified accurate + complete; default = no writes.
- **REVISE — only cosmetic.** Three minor, non-blocking fixes (§4); none affect the proceed decision.
- **BLOCK — NO.** Nothing unsafe is proposed.

> **Concurrent update (§30):** the `subvalue_ids` write-trap that the Step 1 review flagged was fixed the same day — and that fix surfaced a larger blocker (editor label `status='active'` vs backend `'granted'`, verified live: 230/230 rows `granted`) — **also fixed 2026-06-04 (§31)**. Neither changed the seed verdict (both were frontend, not seeds). See §5.

---

## 2. Claims verified against the repo (all correct)

| Doc claim | Verdict | Evidence |
|---|:--:|---|
| Seed-nothing: both filters already work against seeded data | ✅ | `disability_types_any` → `ref_amenity.extra.disability_types` (43 amenities typed, [seeds_data.sql:3839-3905](Base%20de%20donnée%20DLL%20et%20API/seeds_data.sql)); `label_disability_types_any` → `object_classification.subvalue_ids` (4 subvalues seeded, [seeds_data.sql:3711-3754](Base%20de%20donnée%20DLL%20et%20API/seeds_data.sql)); both consumed at [api_views_functions.sql:1206-1234](Base%20de%20donnée%20DLL%20et%20API/api_views_functions.sql). Nothing missing at the reference level. |
| §2.1 MA/SA inventory is a faithful transcription (33 mapped) | ✅ | Spot-checked ~10 of 33 against [seeds_data.sql:3774-3806](Base%20de%20donnée%20DLL%20et%20API/seeds_data.sql): `MA_PMR_SPACES`/`acc_pmr_parking`, `MA_LIFT_DIMENSIONS`/`acc_accessible_lift`, the odd-but-real `acc_visual_audio_announce` under `SA_ACCESSIBLE_LIFT` (seed 3779), `acc_visit_device` under `SA_SUBTITLE_AUDIO_DESC` (3806). All match. 10 NO-EQUIV list (line 89) exact. |
| §4 `disability_types` values match the seed | ✅ | Multi-value rows checked: `acc_readable_height ["motor","visual"]` (3876), `acc_guide_dog_welcome ["visual","motor"]` (3889), `acc_flexible_visit ["cognitive","motor"]` (3896), `acc_visit_device ["visual","hearing"]` (3886). |
| §5 equivalence CHECK constraints quoted correctly | ✅ | Match [migration_sustainability_v5.sql:56-80](Base%20de%20donnée%20DLL%20et%20API/migration_sustainability_v5.sql) (requirement_type / match_scope / relation_type enums). |
| Cross-contamination risk is genuine | ✅ | `sustainability_any`/`_categories_any`/`_actions_any` read declared `object_sustainability_action` ([api_views_functions.sql:1063-1074](Base%20de%20donnée%20DLL%20et%20API/api_views_functions.sql), 1235+); accessibility `MA_*` there would leak in. "Don't materialize" correctly avoids it — not a manufactured risk. |
| Write-trap correctly recorded as constraint, not fixed here | ✅ | [object-workspace.ts:3604-3611](bertel-tourism-ui/src/services/object-workspace.ts) omits `subvalue_ids`; correctly scoped out of seed work. |
| Rule 1 subvalue resolution by `(scheme,code)`/`parent_id` | ✅ | Matches the seed's parent linkage ([seeds_data.sql:3734-3746](Base%20de%20donnée%20DLL%20et%20API/seeds_data.sql)); no hard-coded UUIDs. |

**Blast-radius note:** because the default design writes nothing, even a hypothetical transcription error in the §2.1 inventory would be informational, not load-bearing — it would only matter if the team later flips to "materialize," which is a separately-gated decision.

---

## 3. §7 checklist compliance

All 15 items from `accessibility-v6-review.md` §7 are answered and substantiated by the doc:

| # | Item | Doc answer | Substantiated? |
|---:|---|---|:--:|
| 1 | Records `subvalue_ids` write-trap | Yes | ✅ §1 (line 27), §8 (244) |
| 2 | Decides `CAT_ACCESS` materialization | No, by default | ✅ §1 (24), §2 |
| 3 | Sustainability-exclusion rule if seeded | N/A default; required if changed | ✅ §5 (171) |
| 4 | Exact `SA_*` groups | Yes (inventory) | ✅ §2 |
| 5 | Exact `MA_*` codes | Yes (33) | ✅ §2.1 |
| 6 | 10 NO-EQUIV treatment | Amenity-only | ✅ §2.1 (89) |
| 7 | Equivalence rows marked valid types | N/A (0 rows) | ✅ §5 |
| 8 | Equivalence never auto-imply subvalues | Yes | ✅ §5 (162), Rule 3 |
| 9 | Will-not-change list | Yes | ✅ §6 |
| 10 | Subvalue UUID resolution rules | Yes | ✅ §3, §7 Rule 1 |
| 11 | Future writes idempotent | Yes | ✅ §8 |
| 12 | No DDL | Yes | ✅ §1 (28), §6 (184) |
| 13 | UUID-generation concern | N/A (no generation) | ✅ correct for no-seed default |
| 14 | Validation queries | Yes | ✅ §8 |
| 15 | Smoke-test limits under P0 | Yes (direct SQL needed) | ✅ §9 (297) |

No "no" on the blocking items (#1/#2/#3/#8). Gate passed.

---

## 4. Findings — non-blocking corrections

1. **Broken cross-reference.** Lines 28 and 238 call it the "§2.1 DDL decision," but §2.1 is the *MA Inventory*; the DDL decision is the §1 table row itself. Fix the pointer (e.g. "§1 DDL decision").
2. **Imprecision (§1 line 25).** The V5 migration does not "provide categories" — `ref_sustainability_action_category` comes from `schema_unified.sql` (the migration's own PREREQUISITE note, [migration_sustainability_v5.sql:6-7](Base%20de%20donnée%20DLL%20et%20API/migration_sustainability_v5.sql)); the migration adds **groups**, action **external codes**, and the **equivalence** tables ([migration_sustainability_v5.sql:19-85](Base%20de%20donnée%20DLL%20et%20API/migration_sustainability_v5.sql)).
3. **Rule 4 (line 225) tolerates a legally-incomplete state.** Treating `granted` + empty `subvalue_ids` as a valid terminal state is operationally correct, but a real T&H grant always covers **≥2 of 4 families** (confirmed against the arrêté du 18 avril 2024). Flag it as a **data-quality warning**, not a permanent valid state. Until the write-trap fix, **every app-created T&H label lands in exactly this incomplete state** — so a future data-quality check should surface `granted`-with-empty-`subvalue_ids` rows.

---

## 5. The one caveat that matters — UPDATED (write-trap fixed; a bigger blocker found)

**Since the seed-design doc was written, the `subvalue_ids` write-trap was fixed** (frontend-only `buildClassificationSubvalueIds`; FE suite 349 green; live-verified; logged as `lot1_mapping_decisions.md` §30). The doc's "until the write-trap fix lands" framing is satisfied for that specific trap.

**But §30 surfaced a larger, still-open blocker that supersedes it:** the editor writes `status: 'active'` for new labels (Select offers `active/pending/expired`, [SectionAccessibility.tsx:165,198](bertel-tourism-ui/src/features/object-editor/sections/SectionAccessibility.tsx)), while every backend label read/filter gates on `status = 'granted'` — the filter ([api_views_functions.sql:1224-1234](Base%20de%20donnée%20DLL%20et%20API/api_views_functions.sql)), the public `accessibility_labels` read, and `label_scheme_ranked`/coverage. Verified live this turn: **230/230** `object_classification` rows use `'granted'` and **zero** use `active/pending/expired`. So an app-authored label — T&H **or any distinction** — is written with `'active'` and is invisible to every public label read/filter, **even now that `subvalue_ids` persists.**

**Net:** the certified per-family filter is **now functional end-to-end** — the `subvalue_ids` fix (§30) and the label-`status` vocabulary alignment (§31; editor now writes canonical `granted`) both landed 2026-06-04. The earlier status-mismatch blocker (which affected *all* editor-authored labels) is resolved. This was a **frontend** matter, **not a seed issue**, so the `proceed-step-3` verdict is unchanged. The amenity-derived path (`disability_types_any`) is unaffected and remains end-to-end functional (amenities save via `save_object_commercial`; amenity rows carry no status gate).

---

## 6. Step 3 guidance (on approval)

Consistent with the doc's §10:
1. Emit **no** accessibility materialization SQL. A `seeds_accessibility_v6.sql` file is likely unnecessary — accessibility seeds live consolidated in `seeds_data.sql` Section B (the old `seeds_accessibility_v5.sql` was already folded in); only add a commented no-op manifest if a repo convention demands one.
2. Update `lot1_mapping_decisions.md` with the locked choices (existing 43 `acc_*`, existing 4 subvalues, no default `CAT_ACCESS`, no T&H equivalence rows) **and** the out-of-scope write-trap (now logged as §30).
3. Optionally correct the stale `seeds_data.sql` comments ("32" → 43 at line 3668; "API ne lit pas encore subvalue_ids" at 3710) — repo-edit, only if approved.
4. Both frontend fixes have landed: `subvalue_ids` (§30) and the label-`status` vocabulary alignment (§31; editor now writes canonical `granted`, UI switched to `granted/requested/expired`). Certified-family filtering is functional end-to-end. No seed work involved.

---

## Summary for the user

The seed-design doc is solid — I verified its repo claims, confirmed it answers all 15 gate questions, and confirmed its "seed nothing" conclusion is correct (the reference layer is complete; the real blocker is the deferred frontend fix). Three cosmetic fixes (§4), one framing caveat (§5). **Clear to `proceed-step-3`.**
