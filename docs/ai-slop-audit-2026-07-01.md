# AI Slop Audit — 2026-07-01

**Scope:** whole repo. **Mode:** scan-and-catalog only — *nothing was removed or edited.*
**Method:** 7 parallel read-only scanners (scratch/tooling, frontend logic, services, features,
components+views, SQL, docs) + direct git cross-checks (tracked-vs-ignored, blob-hash dedup, byte totals).

## Definitions
`SCRATCH` one-off/temp/dump committed by accident · `DEAD` unused/superseded code · `DUPLICATE`
copy-paste that should be shared · `REDUNDANT-COMMENT` comment restates code · `DECORATIVE`
emoji/banner/marketing filler · `DOC-BLOAT` generic filler prose · `TYPE-SLOP` empty interface / `as any`
· `OVER-ENGINEERED` single-use abstraction · `BOILERPLATE-DOC` JSDoc that restates the signature.

## Headline
The codebase is **unusually clean** for AI-authored work: **0** `console.log`, **0** `as any`/`@ts-ignore`,
**0** `React.FC`, **0** stray `TODO` in frontend *source*, no marketing prose, no commented-out code blocks.
Comments are overwhelmingly load-bearing business documentation (`§NN` decision-log refs). The genuine
committed slop is modest and clusters into four buckets: **dead code**, **copy-paste duplication**,
**committed generated/duplicate doc artifacts (~58 MB, mostly two videos)**, and **minor comment/decoration nits**.
The large mass of slop-*looking* material at the repo root (the `_berta_*` import-experiment family, the
`crm_*.tmp.sql` deploy scratch, the DuckDB dump) is **already `.gitignore`d / untracked** — working-tree cruft, not in the repo.

---

## A. Committed slop — CODE (highest value)

### A1 — Dead / superseded code
| File | Line | Cat | Why it's slop | Conf |
|---|---|---|---|---|
| `bertel-tourism-ui/src/features/object-editor/sections/SectionProvider.tsx` | 1–99 | DEAD | §18 superseded by `SectionLegal`/ProviderCards (§89); never rendered. *Verified: only the barrel + its own test reference it; section '18' is wired to `SectionLegal` in index.ts:20.* | high |
| ↳ same file | 58–67 | DEAD (write-trap) | Two enabled `<Select onChange={NOOP}>` silently discard edits — violates the "no silent write-traps" invariant (moot: whole file is dead). | high |
| `…/sections/index.ts` | 19 | DEAD | Barrel re-export keeps the dead `SectionProvider` reachable/alive-looking. | high |
| `bertel-tourism-ui/src/components/ui/card.tsx` | 1–78 | DEAD | Entire shadcn primitive module never imported anywhere in `src`. | high |
| `bertel-tourism-ui/src/components/ui/sheet.tsx` | 11,13,74,79 | DEAD | `SheetTrigger/SheetClose/SheetHeader/SheetFooter` exported but no consumer imports them. | high |
| `bertel-tourism-ui/src/components/ui/dialog.tsx` | 10,14 | DEAD | `DialogTrigger`/`DialogClose` exported, never imported outside the file. | high |
| `bertel-tourism-ui/src/utils/labels.ts` | 43–46 | DEAD | `resolveArchetypeLabel` exported, referenced nowhere (near-dup of `resolveTypeLabel`). | high |
| `bertel-tourism-ui/src/services/dashboard-rpc.ts` | 230–268 | DEAD | `getDashboardCapacity/Velocity/Contributors/Seasonality` all `throw '…à brancher sur le backend'`, never called. | high |
| `bertel-tourism-ui/src/features/object-drawer/utils.ts` | 1007 | DEAD | `parseContacts` unused near-dup (project's own §23 flags it); only its test refs it. | high |
| `bertel-tourism-ui/src/services/object-workspace.ts` | 6111–6113 | DEAD | Trailing `if (options.canEditPlaceMedia) { return; }` guards nothing (no branch after; option passed `false` at 3665). | med |
| `bertel-tourism-ui/src/services/object-workspace-parser.ts` | 2040 | DEAD | `readString(record.area_m2, readString(record.area_m2, …))` — first fallback re-reads the same key = unreachable no-op (copy-paste slip). | high |
| `tools/db-graph/merge_delta_20260610.py` | 1 | SCRATCH | Self-declared obsolete one-shot migration script ("…this script is then obsolete"), still tracked. | high |
| `tests/test_object_create.sql` | 1 | DEAD | Stray top-level `tests/` — CI only runs `Base de donnée DLL et API/tests/*.sql`; never executes. | med |
| `tests/test_opening_recurrence.sql` | 1 | DEAD | Same stray dir; comment claims it gates CI but no workflow runs it. | med |

### A2 — Copy-paste duplication
| File | Line | Cat | Why | Conf |
|---|---|---|---|---|
| `src/app/(main)/{moderation,audits,publications,crm}/page.tsx` | 9–22 (each) | DUPLICATE | The identical 14-line `FeatureUnavailable` component is pasted verbatim into 4 page files instead of one shared component. | high |
| `src/services/dashboard-rpc.ts` | 230–268 | DUPLICATE | The 4 dead stub bodies are near-identical (differ only in mock-key + error string). | high |
| `src/hooks/useBootstrapSession.ts` | 102–114 | DUPLICATE | `initialsFromName` re-implements the exported+tested `initials()` from `lib/presence.ts`; the "initials" helper exists in ~6 divergent copies across the app. | med |

### A3 — Minor comment / type / decoration nits
| File | Line | Cat | Why | Conf |
|---|---|---|---|---|
| `src/components/ui/input.tsx` | 4 | TYPE-SLOP | `interface InputProps extends React.InputHTMLAttributes<…> {}` — empty extending interface (shadcn idiom, still noise). | med |
| `src/components/ui/select.tsx` | 5 | TYPE-SLOP | Same empty extending interface pattern. | med |
| `src/components/dashboard/DistinctionOverview.tsx` | 24 | REDUNDANT-COMMENT | Restates the `grouped` map loop directly beneath it. | med |
| `src/components/dashboard/CommuneDistribution.tsx` | 18 | REDUNDANT-COMMENT | "Indexer les données reçues par commune" restates the loop. | low |
| `src/features/object-editor/widgets/media-links.ts` | 38–39 | DECORATIVE | "…robust without a per-row media-type column" — "robust" is filler. | low |
| `src/services/rpc.ts` | 604, 610 | DEBUG | `// TODO: wire to real backend RPC` ×2 on demo-only stubs. | low |
| `src/services/object-workspace-parser.ts` | 3084–3088 | OVER-ENGINEERED | `findLegalRecordValue` single-use wrapper; an inline `.find()` would be clearer. | low |

---

## B. Committed slop — SQL
The SQL corpus (92 files) is genuinely clean — dense but real invariant docs, `-- ====` = titled section
dividers (not spam), `RAISE NOTICE` = test-pass assertions (not debug), ~40 functions redefined across files
= the legit *migration → folded-into-canonical* pattern. Only nits:

| File | Line | Cat | Why | Conf |
|---|---|---|---|---|
| `Base de donnée DLL et API/seeds_data.sql` | 1048, 1051 | REDUNDANT-COMMENT | Comments merely restate the `SELECT COUNT(*)` beneath them. | high |
| `Base de donnée DLL et API/seeds_data.sql` | 1054, 1058 | DECORATIVE | `RAISE NOTICE '=== … COMPLÈTES ==='` + `'✓ … réussi'` success-cheerleading banner. | med |
| `Base de donnée DLL et API/ui_whitelabel_branding.sql` | 313–330 | DEAD-SQL | 18-line commented-out `INSERT … ON CONFLICT` block (borderline — has an "uncomment and adapt" preamble). | low |

---

## C. Committed slop — DOCS & generated artifacts (~58 MB of flagged blobs)
| File / dir | Cat | Why | Conf |
|---|---|---|---|
| `docs/media/*.mp4` (2 files) | SCRATCH-DOC | ~52 MB of AI-narrator explainer videos ("Chaos_à_Clarté…", "Décryptage_Technique…") committed as binaries. | med |
| `docs/infographie-bertel.pdf` | SCRATCH-DOC | 4.4 MB rendered PDF export of `infographie-bertel.html` (generated artifact). | med |
| `docs/api-db-reference.html` | SCRATCH-DOC | 1.5 MB generated single-page dump committed to source. | med |
| `docs/doc_api_bertel_v3.html` | DUPLICATE-DOC | Stale 83 KB earlier build of the API-docs page, superseded by `index.html` (294 KB, same `<title>`). | high |
| `docs/conformite-rgpd/livrables/` vs `…/livrables_mis_a_jour/` | DUPLICATE-DOC | Two parallel generated `.docx` sets (6 files each) of the same RGPD deliverables. *Blob hashes differ → superseded, not identical; both kept.* The `.md` sources + `build_pack.py` also live alongside. | high |
| `docs/schema-workbench/` | SCRATCH-DOC | Dated one-off audit run frozen in docs: `audit-2026-06-15-cluster-{1..10}.json`, `_audit_diff.js`, `live-columns.csv` (256 KB), `live-indexes.csv` (170 KB). | med |
| `docs/README.md` | 42–52 · DECORATIVE | "`## ✨ Fonctionnalités`" with generic UI bullets (dark mode, responsive) — no project-specific info. | med |
| `docs/DOCS_CORRECTNESS_MATRIX.md` | 49–53 · DOC-BLOAT | "Obsolete files have been removed…" — vague self-referential boilerplate naming nothing. | med |
| `docs/superpowers/` (+ `bertel-tourism-ui/docs/superpowers/`) | (vendored) | Third-party plugin docs committed in **two** locations — vendored bloat (out of audit scope, noted). | high |

---

## D. Working-tree only — gitignored / untracked (NOT in the repo; cleanup optional)
These are AI scratch on disk but **already excluded** by `.gitignore` (`/_*`, `*.tmp.*`, `*.duckdb`, `*.log`).
There are **zero tracked `*.tmp.*` files anywhere** in the repo.

- **`_berta_*` import-experiment family (~26 files):** `_berta_parse.py`, `_berta_csv.py`, `_berta_backup_extract.py`,
  `_berta_compare.py`, `_berta_followup.py`, `_berta_gen_sql.py`, `_berta_plan.py`, `_berta_report_md.py` (copy-paste
  siblings, each hardcoding a `.claude/…/tool-results/…` temp path) + their data dumps `_berta.csv` (1.3 MB),
  `_berta_objects.json` (629 KB), `_berta_import_plan.json`, `_berta_compare_result.json`, `_berta_compare_report.txt`,
  `_db_berta_ids.txt`.
- **Deploy/import scratch:** `_import.sql`, `_updates.sql`, `_gor_deploy.sql` (97 KB), `_fold_decisions.py`,
  `_bedlist_decision_72.tmp.md` (already folded into the decision log), `_memhooks.txt`.
- **CRM deploy scratch (root + SQL dir):** `crm_apply_body.tmp.sql`, `crm_body_deploy.tmp.sql`, `crm_test_body.tmp.sql`,
  `crm_test_run.tmp.sql` (byte-copies of `migration_crm_module.sql` / `tests/test_crm_module.sql`).
- **Misc:** `old-data-profile.duckdb` (274 KB DuckDB profiling dump), `debug-910fb7.log` (hypothesis-probe JSONL),
  `docs/conformite-rgpd/_corrections_internes.tmp.diff` (126 KB git-diff dump), `docs/.infographie-server.err.log` (74 KB).

---

## E. Checked and deliberately NOT flagged (false-positive guard)
- **`db-graph-out/`** (9 files incl. `graph.json`) — the DB knowledge-graph **intentionally** committed for agent
  navigation per the graphify/db-graph workflow (CLAUDE.md). Generated, but by design. **Not slop.**
- **`CLAUDE.md`, `lot1_mapping_decisions.md`, WORKFLOW.md, `.claude/**`** — curated, high-value; explicitly excluded.
- `RAISE NOTICE` lines = test assertions / migration progress, not debug. `-- ====` / `// ──` = section dividers.
- `data/mock.ts`, `data/mock-dashboard.ts`, `mockPresence` — real demo fixtures gated behind `demoMode`, intentional.
- `eslint-disable @next/next/no-img-element` (×12, `ObjectDetailView.tsx`) — legit (Supabase Storage URLs, not `next/image`).
- CRM JSDoc (`crm-primitives.tsx`, `CrmActorModals.tsx`) documents real invariants (XOR keys, idempotency) — high-value.
- The 4 media-upload routes share auth/`processImage` boilerplate but with genuinely different per-route authorization
  predicates — not worth consolidating.
- `docs/api-audit/*`, `docs/ux-review/*`, `docs/research/*`, `OBJECT_DATA_DICTIONARY.md`, RGPD `.md` sources,
  `SQL_ROLLOUT_RUNBOOK.md` — long but densely specific; the thorough docs the team values. Not slop.

---

## F. Verified static-analysis pass (follow-up, same day)
The scan above was **pattern-sweep (100 % of files) + targeted deep-reads (sampled subset)** — exhaustive for
mechanical signatures, *sampled* for semantic slop. To cover the two categories where sampling is weakest
(dead code + duplication) **deterministically and whole-repo**, I then ran real static tooling.
Reproduce from `bertel-tourism-ui/`:
```
npx ts-prune -p tsconfig.app.json            # unused exports (whole graph)
npx jscpd src --min-lines 8 --min-tokens 60 --ignore "**/*.test.*,**/*.spec.*"
```

### F1 — Dead exports (`ts-prune`): 95 raw → 68 after removing Next.js `default`/`metadata`/`dynamic` →
**~22 genuinely-unimported individual exports** (after also dropping route-handler `POST`/`GET`/`maxDuration`
false-positives; a further ~35 are barrel `index.ts` re-exports = "unused public surface", judge per-item).
The clear ones (tool-verified as never imported — a superset of the manual A1 list):
- `services/dashboard-rpc.ts` → `getDashboardCapacity/Velocity/Contributors/Seasonality` (confirms A1)
- `types/dashboard.ts` → `CapacityKPIs_PROVISIONAL`, `VelocityWeek_PROVISIONAL`, `ContributorRow_PROVISIONAL`,
  `SeasonalityMonth_PROVISIONAL`, `DistinctionPool_PROVISIONAL` (the `_PROVISIONAL` types for the dead stubs)
- `utils/format.ts` → `formatObjectPrice`, `formatObjectRating`
- `utils/labels.ts` → `resolveArchetypeLabel` (confirms A1)
- `services/object-workspace.ts` → `setWorkspaceTagColor`; `object-workspace-parser.ts` → `WorkspaceModuleId`
- `features/object-drawer/utils.ts` → `readObjectRecord`; `features/crm/crm-primitives.tsx` → `KPI_ACCENTS`
- `features/object-editor/editor-completion.ts` → `SCORE_SECTION_NUMS`; `sections/opening-recurrence.ts` → `periodWindowWidth`
- `sections/blocks/opening-period-meta.ts` → `todayWeekdayIndex`; `hooks/useExplorerQueries.ts` → `useObjectDetailQuery`
- `lib/public-api.ts` → `publicEnvelope`; `types/domain.ts` → `ClassificationRef`; `features/team/permission-presets.ts` → `BusinessRoleCode`
- `app/api/document/upload/process-document.ts` → `ALLOWED_DOCUMENT_MIME_TYPES`

*Caveats:* ts-prune can't see `import()`/reflection/framework-convention usage, so treat as candidates, not verdicts.

### F2 — Copy-paste (`jscpd`): **102 exact clones, 1 634 lines (2.02 %)** — a healthy ratio; **63 are cross-file.**
Biggest clusters (surfaced by the tool, beyond the sampled A2 list):
- **`features/object-drawer/utils.ts` ⇄ `services/object-detail-parser.ts`** — 4 clone blocks (75L + 30L + 22L + 18L ≈ **145 lines**): the drawer's parsing logic is largely a paste of the services parser. *Biggest single dedup opportunity; my sample only caught the `parseContacts` corner of it.*
- **Upload routes** — `document/upload` ⇄ `media/upload` (59L) and `actor-photo/upload` ⇄ `document/upload` (34L): the auth/validation scaffold is copy-pasted across 3 routes (my logic agent judged this "not worth consolidating" — jscpd quantifies it as ~93 duplicated lines).
- **Modals** — `components/common/Modal.tsx` ⇄ `features/crm/CrmModal.tsx` (34L + 20L ≈ 54L); `ClassificationEditModal.tsx` ⇄ `LegalDocumentEditModal.tsx` (34L).
- **`FeatureUnavailable` pages** — audits ⇄ crm/moderation/publications (18L ×3): confirms A2.
- **`services/object-workspace-parser.ts` ⇄ `object-workspace.ts`** (17L ×2) internal parser duplication.

### F3 — Honest coverage statement
Even this tooling is *textual/graph-based*: it nails dead exports and copy-paste, but neither `ts-prune` nor
`jscpd` detects the **semantic** slop classes (stale/contradictory comments, over-engineered single-use
abstractions, non-textual near-duplicates, doc-bloat). Those remain **sampled, not exhaustive** — a definitive
pass there would need per-file reading of the ~610 non-test source files, which was **not** done. This catalog is a
well-founded floor, not a proven ceiling.

## Suggested cleanup order (when you decide to act — not done here)
1. **Free ~58 MB** — drop/relocate `docs/media/*.mp4`, `infographie-bertel.pdf`, `api-db-reference.html`, and the
   stale `doc_api_bertel_v3.html`; pick one RGPD `livrables*` set (or generate `.docx` on demand from the `.md` + `build_pack.py`).
2. **Delete dead code** — `SectionProvider.tsx` (+ barrel line 19 + its test), `components/ui/card.tsx`, the unused
   `sheet.tsx`/`dialog.tsx` exports, `resolveArchetypeLabel`, `parseContacts`, the 4 `dashboard-rpc.ts` stubs.
3. **De-dup** — extract one shared `FeatureUnavailable`; import `lib/presence.initials` instead of re-implementing.
4. **Fix the copy-paste no-op** — `object-workspace-parser.ts:2040` `area_m2`/`surface_m2` fallback.
5. **Housekeeping** — remove `tools/db-graph/merge_delta_20260610.py`, the stray top-level `tests/*.sql`, and the
   minor SQL/comment nits.
