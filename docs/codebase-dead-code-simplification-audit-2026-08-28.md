# Codebase dead-code and simplification audit

**Date:** 2026-08-28
**Scope:** entire tracked repository, with detailed static analysis of the Next.js/TypeScript application and targeted review of SQL, Python tooling, tests, documentation, and dependencies.
**Constraint:** report only; no production source, test, schema, or configuration file was changed.

## Executive summary

The repository is healthier than its size initially suggests: the current TypeScript build passes, Python tooling tests pass, and most production modules are reachable. The audit nevertheless found a concrete cleanup backlog:

- **9 high-confidence dead production modules totaling 488 lines**, plus a disconnected dashboard placeholder chain and 15 unused exported symbols.
- **Several inert or impossible branches**, including a visible “Ouvrir la fiche” button with no action, a CRM feature gate that cannot fire, and a dirty-state indicator whose store has no production writers.
- **Concentrated complexity rather than uniform complexity.** A handful of files carry a disproportionate maintenance burden: a 6,777-line workspace service, a 4,054-line object detail view, a 3,596-line parser, a 1,588-line filter panel, and a 13,606-line global stylesheet.
- **Known duplication remains unresolved** in parsing helpers, modal implementations, initials helpers, URL-storage parsing, feature-unavailable pages, and CSS overrides.
- **Comments are not broadly “useless,”** because many record business and security invariants. The problem is narrower: stale section names, completed follow-ups still described as pending, and hundreds of task/phase/review annotations that narrate implementation history instead of current behavior.
- **Repository and test hygiene issues** include large tracked media/reference artifacts, an explicitly obsolete Python script, and two root SQL tests that are not included in the documented CI SQL glob.

There is no reason for a sweeping rewrite. The best return is a staged cleanup: remove disconnected code first, fix misleading/inert behavior second, then split the largest files along existing module boundaries.

## Method and confidence

The audit combined:

1. Graphify queries and its generated architecture/wiki indexes.
2. A tracked-file inventory across TypeScript/TSX, SQL, Python, Markdown, styles, and repository artifacts.
3. Static import/re-export/dynamic-import reachability from Next.js route roots.
4. Export-reference searches, dependency import searches, duplicate-pattern searches, and approximate AST branch counts.
5. Focused reading of the largest and highest-branching files.
6. The database knowledge graph (`DB_AGENT_INDEX.md`, function/policy/type indexes, and table documentation).
7. Comparison with the two 2026-07-01 maintainability audits to identify unresolved findings rather than reporting old findings blindly.
8. Type checking and representative automated tests.

“High confidence” below means no production importer/caller was found, including re-exports and dynamic imports, or the condition can be proven from the current code. It still deserves a normal delete-and-test change rather than deletion directly from this report. “Needs confirmation” means runtime data, database catalog state, or product intent could change the verdict.

Generated outputs (`.next`, `graphify-out`, `db-graph-out`, generated `dbdoc`), dependency trees, build caches, and historical migrations were inventoried but are not treated as dead application code. Database migrations are intentionally cumulative and should not be deleted because a newer canonical definition exists.

## Priority findings

### P1 — remove disconnected production code

These files have no route-root production path. Test-only imports and barrel re-exports were not counted as real application consumers.

| Candidate | Lines | Evidence | Recommendation |
|---|---:|---|---|
| `bertel-tourism-ui/src/services/ref-codes.ts` | 129 | No inbound import; superseded by `ref-catalogs.ts`. | Delete after moving any still-useful tests; correct the stale template comment in `ref-catalogs.ts`. |
| `bertel-tourism-ui/src/components/ui/card.tsx` | 78 | No import. | Delete. |
| `bertel-tourism-ui/src/components/ui/select.tsx` | 33 | No import; the application uses the editor select primitive instead. | Delete. |
| `bertel-tourism-ui/src/components/ui/label.tsx` | 25 | No import. | Delete. |
| `bertel-tourism-ui/src/utils/format.ts` | 25 | Neither exported formatter is used. | Delete, or move a formatter only when an actual caller appears. |
| `bertel-tourism-ui/src/lib/schemas/object-general.ts` | 9 | Only re-exported by the schema barrel; no consumer. | Remove the file and barrel export. |
| `bertel-tourism-ui/src/lib/schemas/object-contact.ts` | 9 | Only re-exported by the schema barrel; no consumer. | Remove the file and barrel export. |
| `bertel-tourism-ui/src/features/object-editor/sections/SectionProvider.tsx` | 99 | Only its barrel and test reference it. Section 18 is registered to `SectionLegal`, not this component. | Delete the component, its test, and barrel export. |
| `bertel-tourism-ui/src/features/object-editor/widgets/SiretCard.tsx` | 81 | Only the dead `SectionProvider` and its own test reference it. | Delete with `SectionProvider`; remove only CSS selectors unique to the card. |
| **Total** | **488** | | |

The old provider section is especially misleading: its documentation and test still call section 18 “Fournisseur / Prestataire,” while the live section registry calls section 18 “Juridique.” Keeping it makes searches and future edits point at the wrong implementation.

#### Disconnected dashboard placeholder chain

`bertel-tourism-ui/src/services/dashboard-rpc.ts:144-183` exports four functions with no callers:

- `getDashboardCapacity`
- `getDashboardVelocity`
- `getDashboardContributors`
- `getDashboardSeasonality`

They return mock/null data and otherwise throw because the backend is not wired. Their `_PROVISIONAL` types in `src/types/dashboard.ts` are likewise unreferenced, and the corresponding fields in `src/data/mock-dashboard.ts` are permanently `null`. Remove this chain as a unit. Keep the rest of `mock-dashboard.ts`, which is dynamically imported by live dashboard code.

#### Unused exported symbols

The following production exports have no current consumers:

- `src/types/domain.ts:104` — `ClassificationRef`
- `src/utils/labels.ts:44` — `resolveArchetypeLabel`
- `src/services/object-workspace-parser.ts:8` — `WorkspaceModuleId` (a stale duplicate of the live type in `object-workspace.ts`)
- `src/features/object-drawer/utils.ts:355` — `readObjectRecord`
- `src/services/lists.ts:21` — `ListChannel`
- `src/lib/public-api.ts:41` — `publicEnvelope`
- `src/app/api/document/upload/process-document.ts:6` — `ALLOWED_DOCUMENT_MIME_TYPES`
- `src/features/team/permission-presets.ts:4` — `BusinessRoleCode`
- `src/services/object-workspace.ts:4681` — `buildEstablishmentAmenityPayload`
- `src/services/object-workspace.ts:5028` — `setWorkspaceTagColor`
- `src/features/object-editor/editor-completion.ts:23` — `SCORE_SECTION_NUMS`
- `src/features/crm/crm-primitives.tsx:169` — `KPI_ACCENTS`
- `src/features/object-editor/visibility-vocab.ts:18` — `isPlaceVisibility`
- `src/features/object-editor/sections/blocks/opening-period-meta.ts:179` — `todayWeekdayIndex`
- `src/features/object-editor/sections/opening-recurrence.ts:103` — `periodWindowWidth`

Delete these in small groups and let type checking expose any hidden coupling. Test-only helper exports were intentionally excluded from this list.

### P1 — remove impossible or inert behavior

#### A visible button has no action

`src/features/object-editor/sections/SectionRelations.tsx:130` renders an “Ouvrir la fiche” button without `onClick`, link semantics, or disabled explanation. It is an active, focusable dead affordance. Either wire navigation to the referenced object or render non-interactive text until navigation exists.

#### CRM contains a feature gate that cannot fire

`src/app/(main)/crm/page.tsx:9-43` defines `FeatureUnavailable`, reads `demoMode`, and checks `isDemoOnlyModule('/crm')`. The current `isDemoOnlyModule` implementation returns true only for `/audits` and `/publications`, so the CRM branch is impossible. Remove the branch, unused state/imports, and local component. The audits and publications pages duplicate the same component and should share one implementation if both gates remain.

#### The object-drawer dirty indicator is permanently clean

`src/store/object-drawer-store.ts` exposes `setObjectDirty`, `clearObjectState`, and `resetSection`, but none has a production caller. `src/components/layout/TopBar.tsx:61` is the sole production reader of `dirtyObjects`, so its “Modifications locales non enregistrees” path cannot currently be reached. Either reconnect the editor’s actual dirty state or remove this legacy store/indicator. Do not retain a warning UI that can never warn.

#### A results-list mode is not used

`src/components/explorer/ResultsList.tsx:27,255-267` accepts a `panel` variant whose output is the literal placeholder “Vue liste classique non utilisee.” Every production call uses or defaults to `column`. Remove the variant and branch unless a near-term design explicitly requires it.

#### Redundant location-reference branch

`src/features/object-editor/widgets/LocationReferenceCombobox.tsx:84-89` commits the same value and returns whether or not `locationReferenceValueExists(...)` succeeds. Collapse the branch to a single commit and remove that import from this file. The helper itself has other consumers and is not globally dead.

#### Unused top-bar publish switch

`src/features/object-editor/shell/EditorTopbar.tsx` defines and branches on optional `publishDisabled`, but its only caller never passes it. Remove the prop/branch or connect it to the actual permission state.

#### Small no-op tails and unreachable labels

- `src/services/object-workspace.ts:6472-6474`: the final `if (options.canEditPlaceMedia) return;` occurs at the end of the function and has no observable effect.
- `src/components/layout/TopBar.tsx:30`: the `login: 'Connexion'` breadcrumb label is unreachable because `TopBar` is mounted only under the authenticated `(main)` layout.
- `src/components/explorer/map-source.ts`: the rendered GeoJSON layer reads only `name`, while `id`, `type`, `address`, `city`, `price`, `rating`, and `markerIcon` are copied into feature properties but popup/marker rendering uses a separate cluster data structure. Reduce the feature payload to what the MapLibre layer consumes, unless planned style expressions need those properties.

### P1 — fix misleading code before cosmetic cleanup

These are not all dead code, but they make the current implementation say something different from what it does.

#### Duplicate fallback obscures the intended order

`src/services/object-workspace-parser.ts:2166` contains:

```ts
readString(record.area_m2, readString(record.area_m2, readString(record.surface_m2)))
```

The second `area_m2` read is redundant. It does not change the current output, but it obscures the intended ordered fallback and invites future mistakes. Simplify it to `area_m2` then `surface_m2` and add a focused parser test. This issue was already present in the July audit and remains unresolved.

#### “Score Bertel” is a client-side proxy

`src/features/object-editor/sections/SectionSustainability.tsx` runs three separate array scans/memos for simple counts and displays a calculated completion ratio as “Score Bertel.” The code itself acknowledges this is a stub pending a server score. Compute the summary in one pass and call it a completion measure, or hide it until the authoritative metric exists.

#### Stale section references leak into UI and tests

- `src/features/object-editor/sections/SectionContacts.tsx:266` tells users that providers are managed in section 18, but providers moved to section 19 and section 18 is now legal data.
- `src/features/object-editor/sections/SectionIdentity.tsx:400` and its test still say legal name is in “§18 Fournisseur.”
- The dead `SectionProvider` and its test preserve the superseded section-18 model.

Correct live user-facing copy and tests as part of deleting the obsolete section.

#### Menu extraction comment describes completed work as pending

`src/features/object-editor/widgets/MenuExtractModal.tsx:46-51` says browser PDF rasterization is a tracked follow-up, while the file imports and calls `rasterizePdfToImages` and has a test for it. Rewrite the comment to describe current behavior.

#### Other misleading comments

- `src/services/ref-catalogs.ts:5` calls dead `ref-codes.ts` the template.
- `src/features/crm/crm-primitives.tsx:172-174` claims views use `KPI_ACCENTS[i % 4]`; no code references the constant.
- `src/services/rpc.ts:986,992` says “wire backend” for live demo-placeholder functions. If placeholders are intentional, document their contract and exit condition instead of leaving an undated TODO.

### P2 — split the complexity hotspots

Approximate branch counts are static heuristics, not formal cyclomatic-complexity scores. They are useful for ranking review targets.

| File/component | Size | Approximate branching | Main issue | Recommended boundary |
|---|---:|---:|---|---|
| `src/services/object-workspace.ts` | 6,777 lines | spread across many exports | Reads, writes, permissions, validation, payload mapping, and every workspace module share one file. | Split into module-specific readers/writers plus shared mutation/error utilities and a permission service. Preserve the public facade during migration. |
| `src/features/object-drawer/ObjectDetailView.tsx` | 4,054 lines | many local render paths | One file owns tab composition, maps, contacts, notes, legal data, opening calculations, events, formatting, and parsing glue. | Extract one view module per detail section and move pure presentation mapping beside the canonical parser. |
| `src/services/object-workspace-parser.ts` | 3,596 lines | high fallback density | A single parser contains every domain shape and repeated permissive fallback logic. | Split by workspace module and share primitive readers explicitly. Add fixture-based contract tests before moving code. |
| `src/components/explorer/FiltersPanel.tsx` | 1,588 lines | ~194 branch-like nodes | Dozens of store selectors and repeated taxonomy/range/capacity UI coexist in one component. | Separate common filters from archetype-specific panels; render repeated groups from typed configuration. |
| `src/views/ListComposeView.tsx` | 668 lines | ~108 | Orchestration, validation, email composition, selection, and rendering are intertwined. | Extract state machine/hooks and focused recipient/content components. |
| `src/components/explorer/MapPanel.tsx` | ~1,000 lines | ~103 | Map setup, clustering, markers, popups, search-area state, and UI controls are coupled. | Isolate map data adapter, cluster rendering, popup, and search-area controls. |
| `src/app/(main)/settings/page.tsx` | 788 lines | ~87 | Navigation, authorization, section routing, and all settings rendering are centralized. | Route or map sections through a typed registry and lazy section components. |
| `src/styles.css` | 13,606 lines | n/a | Global cascade and distant overrides make ownership unclear. | Split by layout/feature, retain token layers, and consolidate overrides before deleting selectors. |
| `src/features/object-editor/object-editor.css` | 2,808 lines | n/a | A second large feature-wide cascade. | Co-locate stable section/widget styles or use feature substylesheets. |

The CSS scan found 2,850 rule occurrences and 2,253 unique selector strings in `styles.css`; 358 selector strings recur, with 597 extra occurrences. At-rule context means recurrence is not automatically duplication, but selectors such as `.filters-panel` and `.results-panel` are redefined many times across distant regions. In `object-editor.css`, 29 selectors recur. Consolidate deliberately with visual regression coverage; do not bulk-delete based only on selector text.

### P2 — consolidate duplicated implementations

#### Parser and normalization helpers

`src/features/object-drawer/utils.ts` and `src/services/object-detail-parser.ts` maintain parallel implementations of helpers including:

- `readRecord`
- `dedupeByKey`
- `formatDateRange`
- URL and phone normalization
- phone-kind/value detection
- contact-link construction

Move pure primitives to a dependency-neutral parser utility, then make both parsers consume it. Avoid importing UI code into services or creating a barrel cycle.

#### Modal implementations

`src/features/crm/CrmModal.tsx` duplicates the generic `src/components/common/Modal.tsx` but lacks the generic modal’s portal, scroll locking, focus restoration, and animation behavior. Adapt the generic component with a CRM class/variant rather than maintaining two accessibility behaviors.

#### Repeated initials logic

At least eight files implement initials extraction (`OtiTemplate`, CRM view utilities, `Sidebar`, `ProfileDrawer`, `SubjectResolver`, `session-store`, presence utilities, `ProviderCards`, and bootstrap-session code). There are two legitimate semantics—plain initials and legal-form-stripped organization initials. Make those two semantics explicit in a shared utility instead of keeping many slightly different implementations.

#### Other duplication

- `storagePathFromPublicUrl` is duplicated in object deletion and RGPD erasure services.
- `FeatureUnavailable` is copied across CRM, audits, and publications; the CRM copy is dead and the remaining two should share one component.
- Repeated filter blocks and capacity controls in `FiltersPanel` can be data-driven without creating a generic component framework.

### P2 — prune comments by rule, not by volume

The code contains approximately 1,334 section markers (`§NN`), 233 product-owner references, 69 “review” annotations, 52 phase markers, 21 task-number references, 22 dated specification references, and 28 plan references. The heaviest concentrations are in `object-workspace.ts`, `styles.css`, `object-workspace-parser.ts`, `FiltersPanel.tsx`, domain types, and CRM services.

Many are valuable because they explain data ownership, RLS boundaries, compatibility fallbacks, or why a field intentionally differs from the UI label. A blanket comment-removal pass would damage the codebase.

Use this rule:

- **Keep:** current invariants, security/permission reasoning, non-obvious data mappings, external constraints, and the reason behind surprising code.
- **Rewrite:** comments that mention an old section name, completed future work, or a plan/spec whose conclusion can be stated directly.
- **Delete:** task IDs, “phase N,” review history, implementation narration, and comments that merely repeat the following line.

Comment cleanup should happen while touching a module for functional work, except for the demonstrably stale comments listed above.

### P2 — dependency hygiene

No source/config import was found for these direct runtime dependencies:

- `@mapbox/mapbox-gl-draw`
- `@turf/buffer`
- `idb-keyval`

`@types/mapbox__mapbox-gl-draw` exists only to type the apparently unused Mapbox Draw package. Remove these packages in a dedicated dependency PR and run production build plus map/editor tests.

Three imports currently rely on transitive packages:

- Tests import `@testing-library/user-event`, but it is not declared directly.
- Map/track code imports GeoJSON types, but `@types/geojson` is not declared directly.
- `public/legal/_build_pdf.mjs` imports `playwright`, while only `@playwright/test` is declared directly.

Declare the packages directly, or import from the package the project already declares. Transitive availability is not a stable contract.

`supercluster` should not be removed casually: the application uses `use-supercluster`, its API types are referenced by that integration, and the explicit package may be intentional for version alignment even though direct runtime construction was not found.

### P2 — tests and repository artifacts

#### SQL tests outside the executed suite

`tests/test_object_create.sql` and `tests/test_opening_recurrence.sql` are tracked at the repository root, but the current database test workflow targets `Base de donnée DLL et API/tests/*.sql`. No CI reference to the root files was found. This creates false assurance: the files look like tests but are not part of the documented suite. Move them into the executed directory or explicitly add the root glob.

#### Obsolete one-off tool

`tools/db-graph/merge_delta_20260610.py` describes itself as obsolete and has no caller. Delete it or move it into a clearly labeled historical archive outside active tooling.

#### Large tracked reference artifacts

The repository still tracks large documentation/media outputs, including roughly:

- 32.35 MB `docs/media/Décryptage...mp4`
- 17.35 MB `docs/media/Chaos...mp4`
- 4.17 MB `docs/infographie-bertel.pdf`
- 1.74 MB `docs/api-db-reference.html`

There are also parallel RGPD deliverable trees (`livrables` and `livrables_mis_a_jour`) with similarly named DOCX files. These may be legitimate records, so this audit does not label them dead. Decide which are authoritative, move archival binaries to release/object storage if appropriate, and leave small source/index files in Git.

The ignored root `_berta_*`, temporary SQL, DuckDB, and log files are local workspace debris rather than tracked repository debt. They were not modified or counted as dead code.

### P3 — test-output noise and adjacent quality debt

The Jest run produced substantial expected-but-noisy console output:

- Radix dialog accessibility warnings about missing descriptions or `aria-describedby`.
- React `act(...)` warnings.
- Expected error-path logging from query and API tests.

Ten dialog-containing files appear not to provide a local `DialogDescription` or explicit `aria-describedby`: `BlockersModal`, `DeleteObjectModal`, `ProviderCards`, `EditorModal`, `ImportExportModal`, `ConfirmDialog`, `MembershipEditModal`, `OrgPicker`, `TagPickerModal`, and `VersionHistoryModal`. Some may receive description semantics through composition, so confirm per rendered dialog, then fix the warnings. Tests should fail on unexpected console output once the known cases are addressed; otherwise real regressions are easy to miss.

Two smaller correctness/readability issues should be handled when their components are next edited:

- `OpeningPeriodsEditor.tsx` initializes local index state from a prop but does not resynchronize when that prop changes.
- `CompletionRing.tsx` gives the wrapper an accessible label while marking the nested SVG both `role="img"` and `aria-hidden="true"`; choose one coherent accessibility model.

## Database observations

The database knowledge graph currently describes 370 tables, 13 views, 374 functions, 537 policies, 565 triggers, and 9 enums. At this scale, migrations, canonical schema files, tests, and generated catalog docs naturally repeat object names; string duplication is not evidence of dead SQL.

One catalog-level candidate deserves verification: the graph lists both a four-argument and a five-argument overload of `api.build_opening_period_json`. Current canonical SQL and repository call sites use the five-argument form with `p_order`; no current four-argument caller or explicit removal of the older overload was found. Query `pg_proc` in the target environments and, if the four-argument overload is truly unused, remove it through a migration. Do not edit generated database graph output by hand.

No full local Supabase fresh-apply/RLS suite was run for this report, so no other SQL function, policy, trigger, or table is declared dead solely from static references. Database routines can be called by external clients and scheduled jobs not visible to the TypeScript import graph.

## Verification snapshot

- `npm run typecheck`: **passed** on the final audit snapshot.
- Full Jest run: reached **392 passing suites / 3,175 passing tests** but reported six suites as failed while another task was actively rewriting `src/services/crm.ts` and related files. After that edit settled, all six affected suites were rerun together and **6/6 suites, 107/107 tests passed**. A completely clean full-suite rerun was not performed because it takes about 14 minutes and the worktree remained active.
- `pytest -q`: **40 passed**.
- SQL fresh-apply/RLS test suite: **not run**; it requires the local Supabase/database environment.

The worktree contained unrelated user/other-task changes during the audit. They were treated as external and left untouched. Before executing cleanup, rerun the relevant checks from a stable worktree.

## Recommended cleanup sequence

1. **Safe-removal change:** delete the nine disconnected modules, their dead tests/barrel exports, the provisional dashboard chain, and the unused symbols. Remove unique CSS and unused dependencies. Run typecheck, Jest, build, and a dead-export scan.
2. **Behavior-truthfulness change:** wire/remove the dead relations button, remove impossible branches, reconnect/remove drawer dirty state, fix the parser fallback, and correct stale section/UI text.
3. **Shared-utility change:** consolidate parser primitives, storage-path parsing, initials helpers, and the feature-unavailable component. Keep each consolidation small enough to review behavior equivalence.
4. **Modal/accessibility change:** migrate CRM dialogs to the shared modal and eliminate current dialog/`act` warning noise.
5. **Workspace-service decomposition:** split readers/writers by module behind the current exports, with fixture/contract tests before moving logic.
6. **Object-detail and filter decomposition:** extract section components and typed filter configuration without changing UI behavior.
7. **CSS ownership change:** split the two large stylesheets and consolidate repeated selectors with screenshot/Storybook coverage.
8. **Repository/database hygiene:** include the orphan SQL tests in CI, verify the legacy function overload, remove the obsolete graph tool, and decide an archive policy for large documentation binaries.

## Definition of done for the cleanup program

- No production module is reachable only from tests or an otherwise dead barrel.
- No exported runtime symbol is unreferenced without an explicit public-extension reason.
- Feature flags and disabled affordances have reachable, tested behavior.
- Current comments describe current contracts, not implementation chronology.
- The largest services/views have named, testable module boundaries.
- Unexpected console warnings fail tests.
- All tracked tests are exercised by an explicit CI job.
- Typecheck, Jest, production build, Python tests, and the Supabase fresh-apply/RLS suite pass from a clean worktree.
