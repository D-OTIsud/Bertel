# Edit Pages by Type — Plan 4: Backend Extensions & Cutover — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Back the 4 remaining sections (09 Tags, 11 Démarche durable, 18 Fournisseur, 20 Distribution) with workspace parser + safe-write RPCs, then cut the editor over — the explorer's "Modifier" opens the full-page editor and the drawer's edit mode + legacy panels are retired.

**Architecture:** The read API (`api_views_functions.sql`) already surfaces sustainability, channels and tags; the gap is a workspace **parser surface** + a **safe-write RPC** per domain, following the existing `internal.workspace_*` helpers and the `workspace_assert_can_write_object` gate in `object_workspace_safe_write_rpcs.sql`. No new DB tables — `object_sustainability_action` and `actor_channel` already exist. After the 4 sections are wired, the drawer becomes view-only and the 23 `ObjectWorkspace*Panel.tsx` files plus `ObjectDrawerNav` are deleted.

**Tech Stack:** PostgreSQL / Supabase RPC (schema `api`, `internal` helpers), Next.js 16, React 19, TypeScript.

**Depends on:** Plans 1–3. **CLAUDE.md compliance is mandatory here:** inspect existing tables/views/functions/enums before any SQL; no direct `site_object_id` FK; one source of truth per concept; reversible, idempotent migrations; keep business rules close to the schema. Update `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md` before closing the task.

**Conventions:** SQL changes go in new, idempotent migration files under `Base de donnée DLL et API/`; each is reviewed against `schema_unified.sql` before applying. Parser + UI follow Plans 1–2 patterns with tests. Commit per task. Frontend commands from `bertel-tourism-ui/`.

---

## File Structure

| File | Change |
|---|---|
| `Base de donnée DLL et API/object_workspace_gap_rpcs.sql` | New — safe-write RPCs: `save_object_workspace_sustainability`, `save_object_workspace_distribution`, `save_object_workspace_tags`. |
| `bertel-tourism-ui/src/services/object-workspace-parser.ts` | Add `ObjectWorkspaceSustainabilityModule`, `…DistributionModule`, `…TagsModule`, `…ProviderModule`; extend `ObjectWorkspaceModules`; parse them in `parseObjectWorkspace`. |
| `bertel-tourism-ui/src/services/object-workspace.ts` | Add the 4 modules to `ObjectWorkspacePermissions`; add `save*` service functions. |
| `bertel-tourism-ui/src/hooks/useExplorerQueries.ts` | Add the 4 module variants to `SaveWorkspaceModuleInput` + the mutation switch. |
| `bertel-tourism-ui/src/features/object-editor/editor-state.ts` | Add the 4 entries to `MODULE_KEY_MAP`. |
| `bertel-tourism-ui/src/services/object-workspace.ts` (`WorkspaceModuleId`) & parser | Add `'sustainability' \| 'distribution' \| 'tags' \| 'provider'` to `WorkspaceModuleId`. |
| `bertel-tourism-ui/src/features/object-editor/sections/SectionTags.tsx` | New — section 09. |
| `…/sections/SectionSustainability.tsx` | New — section 11. |
| `…/sections/SectionProvider.tsx` | New — section 18 (hosts the Plan 3 `SiretCard`). |
| `…/sections/SectionDistribution.tsx` | New — section 20. |
| `…/sections/section-registry.tsx` | Register the 4 new sections. |
| `bertel-tourism-ui/src/features/object-drawer/*` | Cutover — delete edit mode, `ObjectDrawerNav`, the 23 `ObjectWorkspace*Panel.tsx`, edit parts of `object-drawer-sections.ts`. |
| `bertel-tourism-ui/src/app/(main)/explorer/*` / `ObjectDrawerShell.tsx` | "Modifier" → `router.push('/objects/<id>/edit')`. |
| `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md`, `CLAUDE.md` | Decision log + architectural rule. |

---

## Task 1: Inspect the backend — pin the exact gap

Read-only investigation. **No SQL is written until this task documents the precise gap.**

- [ ] **Step 1:** In `Base de donnée DLL et API/`, read how `get_object_resource` (the workspace fetch RPC) builds its payload — does it already return sustainability actions, actor channels, and tags? Grep `api_views_functions.sql` and `schema_unified.sql`.
- [ ] **Step 2:** Confirm table shapes: `object_sustainability_action` (V5 `CAT_*`/`SA_*`/`MA_*` vocabulary — cross-check `migration_sustainability_v5.sql`), `actor_channel`, and the tag tables (the 37 tag hits already in `object_workspace_safe_write_rpcs.sql` — determine whether a tag write path already exists).
- [ ] **Step 3:** Write the findings into `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md` — for each of the 4 domains: does the read API already expose it, does a write RPC already exist, what is the canonical table/vocabulary. This decides whether Tasks 2–5 add a read path or only a write path.
- [ ] **Step 4:** Commit — `docs: record the editor backend-gap inspection for the 4 sections`.

> The remaining tasks assume the common case (read API present, write RPC absent). If Step 3 finds a read path also missing for a domain, that domain's task gains a read-view step against `api_views_functions.sql` — **stop and flag this to the user** if a read view needs structural change.

---

## Task 2: Sustainability — RPC, parser, section

**Files:** `object_workspace_gap_rpcs.sql`, `object-workspace-parser.ts`, `object-workspace.ts`, `useExplorerQueries.ts`, `editor-state.ts`, `sections/SectionSustainability.tsx`.

- [ ] **Step 1:** Add `save_object_workspace_sustainability(object_id, payload jsonb)` to `object_workspace_gap_rpcs.sql` — uses `internal.workspace_assert_can_write_object`, replaces the object's `object_sustainability_action` rows from the payload (delete-then-insert within a transaction, V5 vocabulary only). Idempotent, reversible. Mirror an existing safe-write RPC for structure.
- [ ] **Step 2:** Add `ObjectWorkspaceSustainabilityModule` to the parser (categories → groups → actions, `selected` flags) and parse it in `parseObjectWorkspace`; extend `ObjectWorkspaceModules` + `WorkspaceModuleId` + `ObjectWorkspacePermissions` + `MODULE_KEY_MAP`.
- [ ] **Step 3:** Add the `sustainability` variant to `SaveWorkspaceModuleInput` and the mutation switch (`saveObjectWorkspaceSustainability` service fn calling the RPC).
- [ ] **Step 4:** Build `SectionSustainability` (`Fs num="11"`) — category groups with action chip-sets, per the Plan 2 section pattern; parser + section render tests.
- [ ] **Step 5:** `npm run typecheck`, `npx jest`, run the SQL against a scratch DB / review against `schema_unified.sql`.
- [ ] **Step 6:** Commit — `feat: add sustainability workspace module, RPC and editor section`.

---

## Task 3: Distribution — RPC, parser, section

Same shape as Task 2, for the `actor_channel`-backed distribution domain.

- [ ] **Step 1:** `save_object_workspace_distribution` RPC over `actor_channel` (booking channels + social links).
- [ ] **Step 2:** `ObjectWorkspaceDistributionModule` parser + module/permission/key-map wiring.
- [ ] **Step 3:** `SaveWorkspaceModuleInput` variant + mutation switch.
- [ ] **Step 4:** `SectionDistribution` (`Fs num="20"`) — channel rows (logo, name, URL, sync status) per the prototype `SectionDistribution`.
- [ ] **Step 5:** typecheck + jest + SQL review.
- [ ] **Step 6:** Commit — `feat: add distribution workspace module, RPC and editor section`.

---

## Task 4: Tags — RPC, parser, section

- [ ] **Step 1:** If Task 1 found a tag write path already exists, reuse it; otherwise add `save_object_workspace_tags`. Tags are the colored display layer (code, color variant, priority) — distinct from taxonomy and classifications.
- [ ] **Step 2:** `ObjectWorkspaceTagsModule` parser (displayed tags + the pickable library) + module/permission/key-map wiring.
- [ ] **Step 3:** `SaveWorkspaceModuleInput` variant + mutation switch.
- [ ] **Step 4:** `SectionTags` (`Fs num="09"`) — priority-ordered tag rows + colour-variant Select + the tag library chip-sets + the Explorer-card preview, per the prototype `SectionTags`.
- [ ] **Step 5:** typecheck + jest + SQL review.
- [ ] **Step 6:** Commit — `feat: add tags workspace module, RPC and editor section`.

---

## Task 5: Fournisseur section

The provider/legal-entity section. Per the spec, no new write path beyond existing `legal`/actor data; the SIRET card (built in Plan 3) is presentational.

- [ ] **Step 1:** Decide the data source from Task 1's findings — provider company fields come from the actor / `legal` data already on the resource. If a `provider` parser slice is warranted, add `ObjectWorkspaceProviderModule` (read-only) + wiring; otherwise `SectionProvider` reads from existing modules.
- [ ] **Step 2:** Build `SectionProvider` (`Fs num="18"`) — hosts `SiretCard` (Plan 3) + editable complements (forme juridique, NAF, dirigeant contact) bound to whatever module owns them.
- [ ] **Step 3:** Section render test.
- [ ] **Step 4:** typecheck + jest.
- [ ] **Step 5:** Commit — `feat(ui): add Fournisseur editor section`.

---

## Task 6: Register the 4 sections — full 22 live

**Files:** `sections/section-registry.tsx`, `sections/index.ts`.

- [ ] **Step 1:** Failing test — the registry resolves all 22 section numbers (21 for non-ITI/VIS) including 09, 11, 18, 20.
- [ ] **Step 2:** Register the 4 new sections.
- [ ] **Step 3:** Run `npx jest src/features/object-editor`, `npm run typecheck`, `npm run build` — the full 22-section editor renders and saves.
- [ ] **Step 4:** Commit — `feat(ui): complete the 22-section editor with the four backed sections`.

---

## Task 7: Cutover — point "Modifier" at the editor

**Files:** `ObjectDrawerShell.tsx` and/or the explorer detail "Modifier" control.

- [ ] **Step 1:** Find every "Modifier" affordance that calls `setMode('edit')` (drawer detail header, explorer).
- [ ] **Step 2:** Change it to `router.push('/objects/<objectId>/edit')`.
- [ ] **Step 3:** Verify the drawer still opens in view mode and "Modifier" now navigates to the full-page editor; run the existing `ObjectDrawer.test.tsx`.
- [ ] **Step 4:** Commit — `feat(ui): open the full-page editor from the explorer Modifier action`.

---

## Task 8: Retire the drawer edit mode and legacy panels

Only after Task 7 — the editor now fully covers what the drawer's edit mode did.

- [ ] **Step 1:** Delete the 23 `src/features/object-drawer/ObjectWorkspace*Panel.tsx` files and `ObjectDrawerNav.tsx`, `ObjectWorkspaceUnsavedDialog.tsx`.
- [ ] **Step 2:** In `ObjectDrawerShell.tsx`, remove the `mode === 'edit'` branch, the editor snapshot state, the per-section save handlers and patch functions — the drawer becomes a view-only wrapper around `ObjectDetailView`. Simplify `object-drawer-store.ts` (drop `mode`/`setMode` or fix it to `'view'`).
- [ ] **Step 2b:** Trim `object-drawer-sections.ts` — remove the edit-section list if nothing else consumes it.
- [ ] **Step 3:** Remove now-dead exports (`useSaveObjectWorkspaceModuleMutation` stays — the editor uses it; check each removed import).
- [ ] **Step 4:** Run `npx jest src`, `npm run typecheck`, `npm run build` — all green; no dead imports.
- [ ] **Step 5:** Commit — `refactor(ui): retire the drawer edit mode in favour of the full-page editor`.

---

## Task 9: Documentation & memory

- [ ] **Step 1:** Update `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md` — the editor architecture, the 4 new workspace modules, the gap-RPC decisions, and the drawer-retirement.
- [ ] **Step 2:** Propose the architectural rule in `CLAUDE.md`: object editing happens on the full-page `/objects/[id]/edit` route with a global save bar; the drawer is view-only.
- [ ] **Step 3:** Refresh MCP memory from the canonical log per the CLAUDE.md memory workflow.
- [ ] **Step 4:** Commit — `docs: record the full-page editor architecture and drawer retirement`.

---

## Task 10: Final verification

- [ ] **Step 1:** `npm run typecheck` — clean.
- [ ] **Step 2:** `npx jest` (full) — all suites pass.
- [ ] **Step 3:** `npm run build` — succeeds.
- [ ] **Step 4:** Manual: open `/objects/<id>/edit` for one object per archetype; edit a field in each of the 22 sections; save; confirm persistence and the validation gate. Confirm the explorer "Modifier" navigates correctly and the drawer is view-only.
- [ ] **Step 5:** Enable the `tests/e2e/object-editor.spec.ts` smoke test now that the editor is reachable through the normal flow.

---

## Self-Review

**Spec coverage:** sustainability module + RPC + section — Task 2 · distribution — Task 3 · tags — Task 4 · Fournisseur section — Task 5 · all 22 sections live — Task 6 · cutover ("Modifier" → editor, drawer view-only, panels deleted) — Tasks 7–8 · docs/memory — Task 9 · verification — Task 10. ✓

**Placeholder scan:** Task 1 is deliberately an inspection task — it produces the facts the SQL tasks depend on, per CLAUDE.md's "inspect before changing schema". Tasks 2–4 share a structure; each names its table, RPC and section. The one genuine unknown — whether a read view also needs extending — is called out with an explicit "stop and flag to the user" instruction rather than guessed.

**Type consistency:** the 4 new modules are added consistently to `WorkspaceModuleId`, `ObjectWorkspaceModules`, `ObjectWorkspacePermissions`, `MODULE_KEY_MAP`, and `SaveWorkspaceModuleInput` — the same five touch-points, in every task. `SiretCard` (Plan 3) is consumed by `SectionProvider`. The section registry (Plan 2) gains 4 entries.

**Risk note:** this plan touches the database. Every SQL task ends with a review against `schema_unified.sql` and a scratch-DB run before commit. If Task 1 reveals a domain needs a structural read-view change, that is escalated to the user, not improvised.
