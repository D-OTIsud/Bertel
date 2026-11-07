# Accessibility V6 — Step 1 Adversarial Review

Status: Read-only peer review of the two Step 1 deliverables. No SQL written, no MCP applied, no frontend changed.

Date: 2026-06-04
Reviewer scope: validate accuracy, completeness, and whether Step 2 (seed-design) can safely proceed.
Method note: `graphify` was not used (the Step 1 gap-analysis already established the CLI is not on PATH). For an adversarial, citation-grade review, direct source reads are the correct higher-fidelity approach anyway. Every factual claim below cites `file:line`. Legal facts spot-checked against 2 live URLs (Atout France + Légifrance).

---

## 1. Executive verdict

**Verdict: REVISE Step 1, then Step 2 may proceed with corrected scope.**

- **APPROVE Step 2 as-is — NO.** The docs are accurate on the *seed* layer, but they miss the one issue that actually decides the feature's value: the editor never writes `object_classification.subvalue_ids`, so the certified-label per-family filter (`label_disability_types_any`) is inert end-to-end. Designing a seed package without recording that would produce partly-inert seeds.
- **REVISE Step 1 — YES (recommended).** Add the write-trap finding, reframe the "V5 action/equivalence" work as *optional search-expansion* (not a core gap), and fix a few factual imprecisions. Small, surgical edits; the research is otherwise sound.
- **BLOCK Step 2 — NO.** Nothing is structurally broken in the existing seeds. The 43 `acc_*` amenities and the 4 T&H subvalues are correct and live-safe; Step 2 can design on top of them once scope is corrected.

**Confidence: HIGH** on every repo fact (all verified in source). **MEDIUM** on the product-direction recommendation (it depends on whether the team actually wants T&H "search-expansion / coverage", which is a product call, not a code fact).

**The single most important sentence for the French product team:** *Per-disability-family accessibility filtering already works in the API today via two independent paths — but only the amenity path is writable from the editor; the certified-label path can be read and filtered but can never be filled in through the app.*

---

## 2. Research doc review (`docs/research/accessibility-v6-research.md`)

| Subsection | Score | Evidence |
|---|:--:|---|
| Source quality & recency (2024 law, 2026 guide) | **5/5** | Cites the arrêté du 18 avril 2024, the March 2026 Atout France guide, Service-Public, DGE reform page. Spot-check confirms the legal substance: "au moins deux des quatre familles", 75% confort d'usage, validity 5 ans, Atout France operational management since 1 May 2024 — all accurate ([Atout France](https://www.atout-france.fr/fr/tourisme-et-handicap/procedure-de-labellisation); [Légifrance JORFTEXT000049446167](https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000049446167)). |
| Four-family mapping vs official T&H wording (mental vs cognitive) | **4/5** | Families auditif/mental/moteur/visuel correct ([research:27](docs/research/accessibility-v6-research.md)). The `cognitive ⇄ mental` mapping ([research:51](docs/research/accessibility-v6-research.md), [research:55](docs/research/accessibility-v6-research.md)) matches the repo (`SectionAccessibility.tsx:16` labels `cognitive` as "Mental"). Loses a point because the doc does not flag that `cognitive` is a **superset bucket**: the seeds put both `acc_staff_cognitive_training` (cognitif) *and* `acc_staff_mental_training` (psychique) under `["cognitive"]` ([seeds_data.sql:3894-3895](Base%20de%20donnée%20DLL%20et%20API/seeds_data.sql)). T&H itself uses one "mental" family, so the compression is defensible — but it should be named explicitly so seed design doesn't try to split it later. |
| Action/amenity tables: `acc_*` mappings reasonable or overclaimed? | **4/5** | The mappings are reasonable and largely match the seeded `disability_types` typing ([seeds_data.sql:3839-3905](Base%20de%20donnée%20DLL%20et%20API/seeds_data.sql)). Caveat: the table presents `acc_*` codes as if to be designed, but **all 43 already exist and are typed** ([seeds_data.sql:3774-3817](Base%20de%20donnée%20DLL%20et%20API/seeds_data.sql)). The doc lists some codes the gap-analysis correctly says must not be re-created. Minor mismatch: `acc_visit_device` is seeded `["visual","hearing"]` ([seeds_data.sql:3886](Base%20de%20donnée%20DLL%20et%20API/seeds_data.sql)) but appears under both visual and (implicitly) the device list — fine, but the research table is an *aspiration list*, not a reflection of current seed state, and never says so. |
| Adjacent labels (Destination pour tous, Acceslibre, Destination d'excellence) — correct separation? | **5/5** | Clean separation. Destination pour tous = territory-level, keep separate ([research:40](docs/research/accessibility-v6-research.md), [research:59](docs/research/accessibility-v6-research.md)); Acceslibre = data source not a label ([research:41](docs/research/accessibility-v6-research.md)); Destination d'excellence = quality/eco label, not accessibility ([research:42](docs/research/accessibility-v6-research.md)). Repo agrees: `LBL_DESTINATION_EXCELLENCE` lives under `sustainability_labels` ([seeds_data.sql:2324](Base%20de%20donnée%20DLL%20et%20API/seeds_data.sql)), `LBL_TOURISME_HANDICAP` under `accessibility_labels` ([seeds_data.sql:3674](Base%20de%20donnée%20DLL%20et%20API/seeds_data.sql)). |
| Missing topics before seed design (filières, 75%, "2 of 4", prestation scope) | **3/5** | The "2 of 4 families" and 75% threshold are present in prose ([research:31](docs/research/accessibility-v6-research.md)) and now verified. But the doc never connects them to a **data-model consequence**: a real T&H grant implies ≥2 covered families, so an object with `LBL_TOURISME_HANDICAP=granted` and **zero** `subvalue_ids` is semantically incomplete — which is exactly the state the editor produces today (see §3/§5). That is the most decision-relevant "missing topic" and it is absent. "Filières" (activity referentials) is explicitly scoped out ([research:9](docs/research/accessibility-v6-research.md)) — acceptable for V6. |

### Factual errors / unsupported claims / hand-waves (research doc)
- **Citation imprecision (minor):** [research:17](docs/research/accessibility-v6-research.md) titles the arrêté "relatif au label Tourisme & Handicap" and cites `LEGISCTA000049449348`. The official title is "*relatif aux conditions d'attribution et de retrait du label « Tourisme & Handicap »*" and the top-level text is `JORFTEXT000049446167`; `LEGISCTA…348` is a *section* id inside it, not the act. Substance is correct; tighten the citation.
- **Aspiration vs reality not labelled (medium):** the Disability Family Mapping table ([research:46-51](docs/research/accessibility-v6-research.md)) reads like a design proposal but is ~the current seeded catalog. Without a "these already exist" banner, a reader could think Step 2 must create them — directly contradicting gap-analysis G6. Add one sentence.
- **No write-path reality check (the big one):** the research concludes V6 should "keep both evidence paths: official label subvalues … and accessibility amenities/actions" ([research:57](docs/research/accessibility-v6-research.md)) without noting that one of those two paths (label subvalues) **cannot be authored** in the product today. Not wrong, but incomplete in a way that matters.

---

## 3. Gap analysis review (`docs/research/accessibility-v6-gap-analysis.md`)

Every claimed gap was checked against source. **G1–G6 are all essentially correct.** Details:

| Gap | Verdict | Evidence |
|---|:--:|---|
| **G1** — `CAT_ACCESS` not materialized in `ref_sustainability_action_category` | ✅ Correct | Categories block seeds 9 codes, none `CAT_ACCESS`; comment "excluding CAT_ACCESS" at [seeds_data.sql:2369](Base%20de%20donnée%20DLL%20et%20API/seeds_data.sql). `CAT_ACCESS` appears only as amenity-family metadata at [seeds_data.sql:3762](Base%20de%20donnée%20DLL%20et%20API/seeds_data.sql). |
| **G2** — `SA_*`/`MA_*` are metadata-only for accessibility | ✅ Correct | 33 mapped `acc_*` carry `source_group_code` + `source_action_external_code` ([seeds_data.sql:3774-3806](Base%20de%20donnée%20DLL%20et%20API/seeds_data.sql)); the final **10** "NO-EQUIV" rows carry only `accessibility_seed_v` ([seeds_data.sql:3807-3817](Base%20de%20donnée%20DLL%20et%20API/seeds_data.sql)). No matching rows exist in `ref_sustainability_action_group` / `ref_sustainability_action`. Count of 10 is exact. |
| **G3** — `LBL_TOURISME_HANDICAP` has no label-equivalence rows | ✅ Correct | Repo-wide grep: `LBL_TOURISME_HANDICAP` never appears inside any `ref_classification_equivalent_*` INSERT (those start at [seeds_data.sql:3021](Base%20de%20donnée%20DLL%20et%20API/seeds_data.sql), 3219, 3356, 3503, 3653 — all sustainability schemes, e.g. `LBL_QUALITE_TOURISME`/`LBL_ATR` at [seeds_data.sql:3016-3019](Base%20de%20donnée%20DLL%20et%20API/seeds_data.sql), 3039+). T&H appears only in comments and its own Section-B definitions. |
| **G4** — equivalence tables are scheme-level, not subvalue-level | ⚠️ Correct but **over-weighted** | DDL PKs are `(scheme_id, group_id)` and `(scheme_id, action_id)` with no disability dimension ([migration_sustainability_v5.sql:46-80](Base%20de%20donnée%20DLL%20et%20API/migration_sustainability_v5.sql)). True. **But** per-family certification does **not** flow through these tables at all — it flows through `object_classification.subvalue_ids` directly (see G5/§4). So this "blocker" only limits an *optional* equivalent-evidence path, not the primary certified path. The doc frames it as fundamental ("important because T&H is awarded by disability family", [gap:59](docs/research/accessibility-v6-gap-analysis.md)); it is real but not on the critical path. |
| **G5** — stale comment at `seeds_data.sql:3710` | ✅ Correct, and **understated** | The comment says the API "ne lit pas encore `subvalue_ids`" ([seeds_data.sql:3710](Base%20de%20donnée%20DLL%20et%20API/seeds_data.sql)). The gap-analysis rebuts it with the *dictionary*. Stronger proof exists in **code**: `label_disability_types_any` reads `oc.subvalue_ids → ref_classification_value.metadata->>'disability_type'` at [api_views_functions.sql:1224-1234](Base%20de%20donnée%20DLL%20et%20API/api_views_functions.sql); two read RPCs resolve it at [api_views_functions.sql:2919-2938](Base%20de%20donnée%20DLL%20et%20API/api_views_functions.sql) and [8189-8198](Base%20de%20donnée%20DLL%20et%20API/api_views_functions.sql); decision log §8.7 documents both filters ([lot1_mapping_decisions.md:497-503](bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md)). The API *does* read `subvalue_ids`. Cite the function, not just the doc. |
| **G6** — no duplicate `acc_*` | ✅ Correct | All 43 codes in the B-4 block are distinct ([seeds_data.sql:3774-3817](Base%20de%20donnée%20DLL%20et%20API/seeds_data.sql)); a `DO` block hard-fails if any `acc_*` lacks `disability_types` ([seeds_data.sql:3907-3920](Base%20de%20donnée%20DLL%20et%20API/seeds_data.sql)). |

**Gap the gap-analysis missed (stale-comment inventory):** it inventoried the Section-B header ([gap:24](docs/research/accessibility-v6-gap-analysis.md)) but did not flag that the header says "**32 équipements acc_***" ([seeds_data.sql:3668](Base%20de%20donnée%20DLL%20et%20API/seeds_data.sql)) while there are **43** — a known-wrong comment, already noted in the decision log ("original B-4 block comment incorrectly said '32 items'", [lot1_mapping_decisions.md:352](bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md)). Since G5 is precisely a "watch the stale comments" gap, this omission belongs in the list.

### Challenge: "reuse `ref_sustainability_*` + `CAT_ACCESS`" (gap recommendation, [gap:67-84](docs/research/accessibility-v6-gap-analysis.md))

**Is DDL truly unnecessary?** *Technically yes* for the action/equivalence path — the V5 migration already created the four tables and the extra `ref_sustainability_action` columns ([migration_sustainability_v5.sql:19-85](Base%20de%20donnée%20DLL%20et%20API/migration_sustainability_v5.sql)), so `CAT_ACCESS`/`SA_ACCESSIBLE_*`/`MA_*`/equivalence rows are insert-only. The "no DDL, idempotent seed-only" claim is accurate **as stated**.

**But is the work even necessary?** *Largely no.* The two live accessibility filters do **not** use the sustainability action model:
- `disability_types_any` reads `object_amenity → ref_amenity.extra->'disability_types'` ([api_views_functions.sql:1206-1219](Base%20de%20donnée%20DLL%20et%20API/api_views_functions.sql)) — already seeded, already filterable.
- `label_disability_types_any` reads `object_classification.subvalue_ids` ([api_views_functions.sql:1224-1234](Base%20de%20donnée%20DLL%20et%20API/api_views_functions.sql)) — subvalue *definitions* already seeded.

So `CAT_ACCESS`/`SA_*`/`MA_*`/equivalence rows are needed **only** if the product wants one of: (a) T&H `label_scheme_ranked` rank-1 "equivalent evidence" admission ([api_views_functions.sql:1164-1174](Base%20de%20donnée%20DLL%20et%20API/api_views_functions.sql)); (b) T&H rows in `v_object_classification_coverage` ([migration_sustainability_v5.sql:107-155](Base%20de%20donnée%20DLL%20et%20API/migration_sustainability_v5.sql)); or (c) authoring accessibility as `object_sustainability_action`. None is required for the disability-type filters.

**Hidden dependencies the gap-analysis under-states:**
1. **Sustainability cross-contamination.** Putting accessibility `MA_*` into `ref_sustainability_action` makes them declarable as `object_sustainability_action`, which is read by `sustainability_any`, `sustainability_categories_any`, `sustainability_actions_any` ([api_views_functions.sql:1063-1074](Base%20de%20donnée%20DLL%20et%20API/api_views_functions.sql), 1235+) and by the coverage view. Unless **every** sustainability consumer is scoped to exclude `CAT_ACCESS`, an accessibility-only object would start matching "durable" filters. The doc flags only vague "product confusion" ([gap:82](docs/research/accessibility-v6-gap-analysis.md)); the concrete filter/view leakage is the real risk.
2. **Third source of truth.** Accessibility evidence would then live in **three** places — amenity `disability_types`, label `subvalue_ids`, *and* `object_sustainability_action` — violating CLAUDE.md core principle #3 ("one clear source of truth"). The amenity path and the action path would describe the same real-world fact.

**Can `object_sustainability_action` represent accessibility without product confusion?** Only with disciplined scoping of all sustainability read paths + editor §11. That is non-trivial and multi-consumer; treat it as a feature, not a seed.

**Is subvalue-level equivalence really blocked? Workarounds?** The "block" is largely illusory for the primary path:
- *Just use `subvalue_ids`* — already works, no equivalence needed.
- *Metadata on equivalence rows* (e.g. a `disability_type` note) — inert unless the two views are taught to read it ⇒ that's view/DDL work, defeating "no DDL".
- *One scheme per family* (`LBL_TH_MOTOR`…) — breaks the single-scheme + subvalue design already in place; reject.

**Net:** the recommendation is *feasible* but *mis-prioritized*. It positions optional search-expansion as the headline gap while the actual end-to-end blocker (no `subvalue_ids` writer) and the cross-contamination risk are not surfaced.

---

## 4. Cross-doc consistency

- **Research implications vs gap findings — mostly aligned.** Both keep the certified label path (subvalues) separate from amenity evidence, and both keep Destination pour tous out of T&H. Good.
- **Contradiction on "design vs already-exists".** Research presents `acc_*` as a mapping to define ([research:46-51](docs/research/accessibility-v6-research.md)); gap correctly says they already exist and must not be duplicated ([gap:64-65](docs/research/accessibility-v6-gap-analysis.md), [gap:88](docs/research/accessibility-v6-gap-analysis.md)). Not a hard contradiction, but the research table needs an "already seeded" banner to avoid Step 2 re-creating rows.
- **API subvalue filter — consistent and correct in both**, and confirmed live ([api_views_functions.sql:1224-1234](Base%20de%20donnée%20DLL%20et%20API/api_views_functions.sql)). Neither doc, however, checked the **write** side — so both implicitly assume `subvalue_ids` can be populated. They cannot, via the app (see §5 P0).
- **cognitive vs mental — consistent** between docs and with the repo's `cognitive`-labelled-as-"Mental" choice ([SectionAccessibility.tsx:12-17](bertel-tourism-ui/src/features/object-editor/sections/SectionAccessibility.tsx)). Neither doc flags the cognitive/mental/psychique compression; low-severity.

---

## 5. Risks Step 2 must address (ranked)

### P0 — Certified-label disability filter is write-trapped (neither doc caught this)

> **UPDATE 2026-06-04 (post-review):** This trap was FIXED the same day — `subvalue_ids` now persists via `buildClassificationSubvalueIds` (`lot1_mapping_decisions.md` §30; FE suite 349 green, live-verified). ⚠️ The fix surfaced a **larger, still-open blocker**: the editor writes label `status='active'` but every backend label read/filter requires `status='granted'` (verified live: 230/230 rows `granted`), so app-authored labels — T&H **and all other labels** — remain invisible end-to-end. The analysis below describes the original (now-fixed) trap; the status-vocabulary mismatch was then also fixed (§31 — editor now writes canonical `granted`), so certified per-family filtering is now functional end-to-end.

The §10 editor renders an **enabled, dirty-tracked** "Types de handicap couverts" `ChipMultiSelect` bound to `disabilityTypesCovered` ([SectionAccessibility.tsx:182-192](bertel-tourism-ui/src/features/object-editor/sections/SectionAccessibility.tsx)); `distinctions` is **not** in `READONLY_MODULES` ([editor-state.ts:82-87](bertel-tourism-ui/src/features/object-editor/editor-state.ts)); the saver is dispatched ([useExplorerQueries.ts:249](bertel-tourism-ui/src/hooks/useExplorerQueries.ts)). **But** `saveObjectWorkspaceDistinctions` writes only `object_id, scheme_id, value_id, status, awarded_at, valid_until` — **`subvalue_ids` is omitted** ([object-workspace.ts:3604-3611](bertel-tourism-ui/src/services/object-workspace.ts)). Repo-wide grep confirms **no writer of `subvalue_ids` exists** anywhere — not in the frontend (only reads at [object-workspace.ts:797-810](bertel-tourism-ui/src/services/object-workspace.ts), 837, and the `.select` at 1182) and not in any `save_object_*` RPC. The read machinery ([api_views_functions.sql:2919-2938](Base%20de%20donnée%20DLL%20et%20API/api_views_functions.sql), 8189-8198) and the filter ([api_views_functions.sql:1224-1234](Base%20de%20donnée%20DLL%20et%20API/api_views_functions.sql)) will therefore always see empty `subvalue_ids` for app-authored objects.

This violates CLAUDE.md's **"Editor — no silent write-traps"** invariant. It is masked by a unit test that asserts only the *draft* mutates, never the persisted payload ([SectionAccessibility.test.tsx:21-22](bertel-tourism-ui/src/features/object-editor/sections/SectionAccessibility.test.tsx)) — the classic reason a write-trap survives CI. **Consequence for Step 2:** any seed work targeting `label_disability_types_any` is inert until either (a) the editor saves `subvalue_ids`, or (b) a data import populates them. Step 2 must state this explicitly and route the fix as a parallel frontend task (out of seed scope, but a hard precondition for the certified-label feature).

### P1 — Sustainability cross-contamination if `CAT_ACCESS`/`MA_*` are materialized
See §3. Seeding accessibility into `ref_sustainability_action` leaks into `sustainability_*` filters and the coverage view unless all are scoped to exclude `CAT_ACCESS` ([api_views_functions.sql:1063-1074](Base%20de%20donnée%20DLL%20et%20API/api_views_functions.sql), [migration_sustainability_v5.sql:107-155](Base%20de%20donnée%20DLL%20et%20API/migration_sustainability_v5.sql)). Step 2 must define the scoping rule (or decline the action model).

### P1 — Certifying vs amenity evidence conflation
Two evidence paths exist by design ([OBJECT_DATA_DICTIONARY.md:432-434](docs/architecture/OBJECT_DATA_DICTIONARY.md)). Amenity coverage (`disability_types_any`) is *declarative/observed*; label subvalues (`label_disability_types_any`) are *certified*. Step 2 must keep them distinct and must **not** seed equivalence rows that let amenities auto-imply a certified subvalue (the doc says this at [gap:90](docs/research/accessibility-v6-gap-analysis.md) — keep it as a hard rule).

### P1 — The 10 NO-EQUIV amenities have no `SA_*`/`MA_*` anchor
If Step 2 builds the action model from existing metadata, the 10 codes at [seeds_data.sql:3807-3817](Base%20de%20donnée%20DLL%20et%20API/seeds_data.sql) (e.g. `acc_sensory_room`, `acc_sign_language`, `acc_low_stimulation`) have no `source_group_code`/`source_action_external_code` and would be orphaned from `CAT_ACCESS → SA_* → MA_*`, creating an asymmetric model. Decide: leave them amenity-only, or mint new `SA_*`/`MA_*`.

### P2 — `ENABLE_OPTIONAL_WORKSPACE_REST_ENRICHMENT = false` is a red herring (document so nobody chases it)
This flag ([object-workspace.ts:127](bertel-tourism-ui/src/services/object-workspace.ts)) gates only **read-side** module enrichment ([object-workspace.ts:3290-3312](bertel-tourism-ui/src/services/object-workspace.ts)). It does **not** gate any save and does **not** explain the P0 trap (the distinctions saver runs unconditionally). It does mean accessibility read data must be fully present in `get_object_resource`; relevant only if Step 2 later relies on REST-enriched accessibility reads. **Update (§32, 2026-06-04): this materialized.** The disabled enrichment suppressed the amenity *catalog* read, so the §10 equipment selectors showed `0 / 0` (no `acc_*` options to pick). The "red herring" label was correct only for the write-trap (§30 was the cause there); for catalogs the flag was a real read bug. Fixed by enriching `characteristics` unconditionally, mirroring `contacts`.

### P2 — Pilot data state
Not blocking for seeds, but Step 2 should note: with **0** objects carrying `subvalue_ids` (P0) the certified filter has no live data to validate against; validation must use the amenity path or a hand-seeded test object via direct SQL.

---

## 6. Required corrections to Step 1 docs (for the author/Codex to apply)

- **`accessibility-v6-gap-analysis.md` — add a 7th gap (P0):** *"G7 — Editor write-trap: `object_classification.subvalue_ids` has no writer. The §10 editor edits `disabilityTypesCovered` ([SectionAccessibility.tsx:182-192]) and the read path hydrates it ([object-workspace.ts:837]), but `saveObjectWorkspaceDistinctions` omits `subvalue_ids` ([object-workspace.ts:3604-3611]) and no RPC writes it. Therefore `label_disability_types_any` ([api_views_functions.sql:1224-1234]) is inert end-to-end. Seeds cannot fix this; a frontend/RPC change is required."*
- **`accessibility-v6-gap-analysis.md` §G5:** add the code citation `api_views_functions.sql:1224-1234` (not only the dictionary) as definitive proof the API reads `subvalue_ids`.
- **`accessibility-v6-gap-analysis.md` §"What Exists"/header inventory:** note the stale "**32 équipements**" header at `seeds_data.sql:3668` (actual 43; see `lot1_mapping_decisions.md:352`). Recommend correcting the comment to 43.
- **`accessibility-v6-gap-analysis.md` Recommendation:** reframe as *optional search-expansion*, not a core gap. Add the cross-contamination caveat (P1) and the single-source-of-truth caveat explicitly; state that the disability-type filters already work without `CAT_ACCESS`.
- **`accessibility-v6-research.md` Disability Family Mapping table:** add a one-line banner — *"The 43 `acc_*` codes and their `disability_types` already exist and are seeded ([seeds_data.sql:3774-3905]); this table documents intent, it is not a creation list."*
- **`accessibility-v6-research.md` §17 citation:** correct the arrêté title to "*… relatif aux conditions d'attribution et de retrait du label « Tourisme & Handicap »*" and reference `JORFTEXT000049446167`.
- **`accessibility-v6-research.md`:** add one sentence noting `cognitive` is a superset bucket (cognitif + mental + psychique), consistent with the repo's single "Mental"-labelled type.

---

## 7. Step 2 seed-design checklist (must be answered before any live MCP)

1. Does the seed-design explicitly record the **P0 write-trap** (`subvalue_ids` unwritable) and mark `label_disability_types_any`-dependent seeds as inert-until-frontend-fix? (yes/no)
2. Is the decision **made** on whether to materialize `CAT_ACCESS` at all, with a written rationale tied to a concrete consumer (rank-1 / coverage / action authoring)? (yes/no)
3. If `CAT_ACCESS` is seeded, is there an **explicit scoping rule** excluding it from `sustainability_any` / `sustainability_categories_any` / `sustainability_actions_any` / `v_object_classification_coverage`? (yes/no)
4. Does it list the exact `SA_ACCESSIBLE_*` group codes to seed (and their `CAT_ACCESS` parent), or state that none will be? (yes/no)
5. Does it list the exact `MA_*` action external codes to seed, derived from the 33 mapped `acc_*` metadata, with no invented codes? (yes/no)
6. Does it state the treatment of the **10 NO-EQUIV** amenities (orphan vs new `SA_*`/`MA_*`)? (yes/no)
7. For any proposed `LBL_TOURISME_HANDICAP` equivalence row, is each marked `obligatoire`/`recommandé`/`confort`/`points` and `match_scope` (`search_expansion`/`coverage`/`both`) per the CHECK constraints ([migration_sustainability_v5.sql:56-80](Base%20de%20donnée%20DLL%20et%20API/migration_sustainability_v5.sql))? (yes/no)
8. Does it confirm equivalence rows are **search-expansion only** and never auto-imply a certified subvalue? (yes/no)
9. Does it provide the **will-not-change** list (the 43 `acc_*` codes + the 4 subvalues are immutable; no re-creation, no recode)? (yes/no)
10. Does it give the **subvalue UUID resolution method** (resolve `granted_motor`/`hearing`/`visual`/`cognitive` by `(scheme_id, code)` join, not hard-coded UUIDs)? (yes/no)
11. Is every write planned as **idempotent** (`ON CONFLICT … DO UPDATE` / guarded `NOT EXISTS`), matching the Section-A/B pattern? (yes/no)
12. Does it confirm **no DDL** is emitted, or if DDL is unavoidable, is it added to `schema_unified.sql` + the rollout runbook (deploy-integrity invariant)? (yes/no)
13. Does it state any RPC that must `SET search_path` use `gen_random_uuid()` (never `uuid_generate_v4()`) if it generates UUIDs? (yes/no)
14. Does it define a **validation query** proving the seed (e.g. all `MA_*` resolve to a `SA_*` under `CAT_ACCESS`; T&H equivalence rows resolve)? (yes/no)
15. Does it identify a **smoke-test object** path (direct-SQL `subvalue_ids` insert) to prove `label_disability_types_any` returns it, given P0? (yes/no)

A "no" on #1, #2, #3, or #8 should block live MCP.

---

## 8. What NOT to do yet

- **Do NOT wire the editor `subvalue_ids` save in this seed pass.** It is the real fix for P0, but it is a frontend/RPC change with its own TDD; keep Step 2 seed-only. Flag it, hand it off, do not bundle.
- **Do NOT run live Supabase MCP / `apply_migration`** from Step 2. Seed design is a document; application is a later gated step after user approval and after the checklist passes.
- **Do NOT create new `ref_accessibility_*` tables.** This review found no requirement for them — the existing `ref_amenity` + `object_classification.subvalue_ids` + (optional) `ref_sustainability_*` cover every live consumer. New tables would add DDL, duplicate views, and a fourth source of truth.
- **Do NOT seed `CAT_ACCESS` / `SA_*` / `MA_*` / T&H equivalence rows by default.** Only if checklist #2/#3 justify it with a concrete consumer and a scoping rule. Default to *not* materializing them for V6.
- **Do NOT re-create or recode any `acc_*` amenity or any `granted_*` subvalue.** They are locked ([seeds_data.sql:3711-3754](Base%20de%20donnée%20DLL%20et%20API/seeds_data.sql), 3774-3817).
- **Do NOT disable the §10 disability-type chips ("T1a-style") as a fix.** They are a genuine feature whose data model is correct (T&H *is* per-family — confirmed by the arrêté). The correct fix is to **persist** them, not to remove them. Removing would discard the only UI for certified per-family coverage.
- **Do NOT fold Destination pour tous / Acceslibre into T&H.** Both docs are right to keep them separate; keep it that way.

---

## Short summary for the user

The two Step 1 docs are **accurate where they look** — I verified all six gaps (G1–G6) against source and confirmed the legal facts (2-of-4 families, 75% confort, 5-year validity, Atout France 2024) against Atout France + Légifrance. The seeds layer is in good shape: 43 `acc_*` amenities + 4 T&H subvalues already exist and are correctly typed, and **both** API accessibility filters already work.

But the docs share one blind spot and one bias:

1. **Blind spot (P0):** they never checked the editor write path. The §10 "Types de handicap couverts" chips are editable but **`subvalue_ids` is never saved** ([object-workspace.ts:3604-3611](bertel-tourism-ui/src/services/object-workspace.ts)) — no writer exists anywhere. So the certified-label filter (`label_disability_types_any`) can read and filter but can never be filled via the app. That's a CLAUDE.md write-trap, hidden by a draft-only unit test.
2. **Bias:** they frame "materialize `CAT_ACCESS` + `SA_*`/`MA_*` + equivalence rows" as the central gap. It is **optional** (the live filters don't use it) and carries a real risk of leaking accessibility into the sustainability filters/views, plus a third source of truth.

**Recommendation: REVISE Step 1** (add the write-trap as G7, reframe the recommendation as optional search-expansion, fix the small citation/`32`-vs-`43` nits), **then Step 2 can proceed** with the narrowed scope and the checklist in §7. Default Step 2 to *not* materializing `CAT_ACCESS` unless a concrete consumer justifies it. Confidence: high on the code facts, medium on the product direction.
