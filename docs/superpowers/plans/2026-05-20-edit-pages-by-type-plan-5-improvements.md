# Edit Pages by Type — Plan 5: Improvements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the full-page editor actually work — fix the data wiring so every section shows its data, add the missing save paths (Distribution, Fournisseur), and close the UX-parity gaps against the prototype design.

**Context:** Plans 1–4 built the editor and it passes `typecheck`, 183 unit tests, and `npm run build`. But at runtime: (1) **sections show no data** — the workspace fetch does not feed the section drafts; (2) **Distribution & Fournisseur are read-only** — shipped that way deliberately (decision log §16–17); (3) the **UX is broadly under-built** vs the prototype — type blocks, rail widgets, individual sections, and interactions all need parity work.

**Architecture:** The editor fetches via `useObjectWorkspaceQuery` → `getObjectWorkspaceResource` (`src/services/object-workspace.ts`), which issues one `api` RPC plus ~30 direct `client.from('<table>')` queries — one cluster per module — assembled by `parseObjectWorkspace`. A section shows no data when its query cluster fails (RLS, schema drift, wrong column), returns empty, or the parser mismaps the result. This plan is **diagnostic-first**: each phase opens with an audit task that produces a concrete findings list, then fix tasks consume it.

**Tech Stack:** Next.js 16 / React 19 / TypeScript; Supabase (`api` schema RPCs, `public` tables); PostgreSQL for the write RPCs.

**Phasing — do A before B/C; A is the functional blocker:**
- **Phase A** — data wiring (sections show no data)
- **Phase B** — save wiring (Distribution + Fournisseur)
- **Phase C** — UX parity (type blocks, rail widgets, sections, interactions)

**Reference:** prototype `Bertel.zip` and the in-repo design copy `docs/Bertel_design_exemple/` (the parity target the implementers used — decision log §18). **CLAUDE.md compliance:** inspect schema before SQL; reversible/idempotent migrations; update `claude_brief/lot1_mapping_decisions.md` at the end.

**Conventions:** commands from `bertel-tourism-ui/`. Each fix gets a regression test where the bug is unit-testable (parser mapping, RPC arg shape). Commit per task.

---

## Phase A — Data wiring: "sections show no data"

### Task A1: Diagnose the empty-section root cause

Read-only investigation producing a per-module status table. **No fixes until this is done.**

- [ ] **Step 1:** Determine the test environment. Is the editor being opened in **demo mode** (`NEXT_PUBLIC_ENABLE_DEMO_MODE=true`)? The detail view has mocks in `src/data/mock.ts`; the **workspace resource has no demo mock** — so in demo mode `getObjectWorkspaceResource`'s real Supabase queries return nothing and *every* section is empty. Confirm whether the user sees this in demo mode, against real Supabase, or both.
- [ ] **Step 2:** For a real-Supabase object (one per archetype: HOT, RES, ASC, ITI, PCU, PSV), capture the assembled `ObjectWorkspaceResource` — log `data.modules` in `ObjectEditPage` or inspect via the browser. Classify each of the 22 modules: **data present** / **empty (data exists in DB)** / **query error**.
- [ ] **Step 3:** For every "empty / error" module, locate its fetch cluster in `object-workspace.ts` (the `client.from('<table>').select('<cols>')` calls) and the matching `parseWorkspace<X>Module` in `object-workspace-parser.ts`.
- [ ] **Step 4:** Write the findings into `claude_brief/lot1_mapping_decisions.md` — a table: module · environment where it fails · suspected cause (RLS / wrong table / wrong column / parser mismap / demo-mode). Commit — `docs: record the editor data-wiring diagnosis`.

### Task A2: Demo-mode workspace fixture (if Task A1 implicates demo mode)

- [ ] **Step 1:** If A1 found demo mode is a cause, add a `mockObjectWorkspace` fixture in `src/data/mock.ts` — a full `ObjectWorkspaceResource` for at least one mock object id per archetype.
- [ ] **Step 2:** Branch `getObjectWorkspaceResource` on the demo-mode flag (mirror how `getObjectResource` serves `mockObjectDetails`) to return the fixture.
- [ ] **Step 3:** Test — a parser/service unit test asserts demo mode yields a populated resource.
- [ ] **Step 4:** Commit — `feat(ui): serve a workspace resource fixture in demo mode`.

### Task A3: Repair the broken real-DB module queries

For each module A1 flagged as broken against real Supabase:

- [ ] **Step 1:** Cross-check the module's `client.from('<table>').select('<columns>')` against `Base de donnée DLL et API/schema_unified.sql` — confirm the table and every column name exist; confirm `rls_policies.sql` grants the editor's role read access.
- [ ] **Step 2:** Fix the mismatch — correct table/column names, add a needed join, or correct the RLS-dependent role path.
- [ ] **Step 3:** Confirm the parser keys match the corrected query result; add a parser unit test with a representative raw fixture for that module.
- [ ] **Step 4:** Repeat per broken module; commit per module — `fix(ui): wire the <module> workspace query to the live schema`.

### Task A4: Fix the openings read path

`parseObjectWorkspace` carries `unavailableReason: "Des ouvertures existent en base mais ne remontent pas encore correctement dans le payload de travail."` — the openings module is a known read gap.

- [ ] **Step 1:** Trace how openings are fetched (RPC payload vs direct query) and why the rows don't reach `parseWorkspaceOpeningsModule`.
- [ ] **Step 2:** Fix the fetch/parse so opening periods populate; remove the `unavailableReason` fallback.
- [ ] **Step 3:** Parser unit test for the openings module with a raw fixture.
- [ ] **Step 4:** Commit — `fix(ui): wire opening periods into the editor workspace payload`.

### Task A5: Verify Phase A

- [ ] **Step 1:** Open `/objects/<id>/edit` for one object per archetype; confirm every section renders its real data.
- [ ] **Step 2:** `npm run typecheck`, `npx jest src`, `npm run build` — all green.
- [ ] **Step 3:** Commit any test updates — `test(ui): cover the repaired workspace data wiring`.

---

## Phase B — Save wiring: Distribution & Fournisseur

### Task B1: Distribution write contract + RPC

Decision log §16 deferred this on the operator-actor selection problem. Resolve it.

- [ ] **Step 1:** Confirm the schema path: distribution channels are `actor_channel` rows on the actor linked to the object via `actor_object_role` with role `operator`. Read `schema_unified.sql` for `actor_channel`, `actor_object_role`.
- [ ] **Step 2:** Decide the contract — the RPC writes channels for the object's **operator actor**; if the object has no operator actor, the RPC returns a structured "no operator" result the UI surfaces (it does not invent an actor). Document the decision in `lot1_mapping_decisions.md`. **If multi-operator resolution is ambiguous, stop and confirm with the user.**
- [ ] **Step 3:** Add `api.save_object_workspace_distribution(text, jsonb)` to `object_workspace_gap_rpcs.sql` — gated by `internal.workspace_assert_can_write_object`, delete-then-insert `actor_channel` rows, idempotent and reversible. Mirror `save_object_workspace_tags`.
- [ ] **Step 4:** Commit — `feat: add save_object_workspace_distribution RPC`.

### Task B2: Wire SectionDistribution to save

- [ ] **Step 1:** Add the `distribution` variant to `SaveWorkspaceModuleInput` (`useExplorerQueries.ts`) + the mutation switch + a `saveObjectWorkspaceDistribution` service fn.
- [ ] **Step 2:** Make `SectionDistribution` editable (remove the read-only stance); ensure `distribution` is in `MODULE_KEY_MAP` and the `useEditorSave` arg builder.
- [ ] **Step 3:** Tests — `planSaveBatch`/arg-builder cover the `distribution` module; section render+edit test.
- [ ] **Step 4:** Commit — `feat(ui): make the Distribution section editable`.

### Task B3: Fournisseur write path

- [ ] **Step 1:** From the §16 finding, the provider complements (forme juridique, NAF, dirigeant) persist through the `legal` module and/or actor data. Confirm which existing RPC owns each field.
- [ ] **Step 2:** Make `SectionProvider`'s editable fields write through the owning module(s); keep the SIRET card presentational.
- [ ] **Step 3:** Section test; typecheck.
- [ ] **Step 4:** Commit — `feat(ui): make the Fournisseur section complements editable`.

### Task B4: Verify Phase B

- [ ] Edit + Publier a Distribution channel and a Fournisseur field; reload; confirm persistence. `typecheck` + `jest` + `build` green. Commit any test updates.

---

## Phase C — UX parity with the prototype

### Task C1: Parity audit

- [ ] **Step 1:** For each of the 22 sections, the 6 type blocks, and the rail widgets, compare the built component against `docs/Bertel_design_exemple/` (`edit-*.jsx`) and `Bertel.zip`. Record, per component: missing fields/repeaters/controls, layout deviations, missing interactions.
- [ ] **Step 2:** Write the gap list into `claude_brief/lot1_mapping_decisions.md` as a checklist grouped by component, severity-tagged (functional gap vs cosmetic).
- [ ] **Step 3:** Commit — `docs: record the editor UX-parity gap audit`.

### Task C2: Complete the type blocks (section 05)

- [ ] For each of `BlockHEB/RES/ASC/ITI/VIS/SRV`, close the C1 gaps — the rooms table + MICE (HEB), menus + service schedule (RES), formulas + season (ASC), GPX + waypoints (ITI), visit modes + tariffs (VIS), prestations + zone (SRV). One commit per block; render test per block.

### Task C3: Complete the rail widgets

- [ ] Close C1 gaps for `CompletionRing`, `IssuesRail`, `PresenceRail`, `HistoryRail`, `RelationPicker`, `SiretCard` — match the prototype's content and layout. Commit per widget.

### Task C4: Complete the under-built sections

- [ ] Work the C1 gap checklist for sections 01–22 — add the missing fields, repeaters, chip-sets, and sub-controls each section lacks vs the design reference. Commit per section or per small group; render test per fixed section.

### Task C5: Interactions & polish

- [ ] **Step 1:** Drag-reorder for repeater rows (media, contacts, pricing, waypoints, tags) where the prototype shows the drag handle.
- [ ] **Step 2:** Typeahead behaviour for `RelationPicker` and any taxonomy/reference autocompletes.
- [ ] **Step 3:** `ScheduleEditor` and `SeasonPicker` interactions (click-to-toggle, copy-to-week) per the prototype.
- [ ] **Step 4:** Accent styling per archetype, `Fs` rapide/complet folding, and the prototype's transitions/hover states.
- [ ] **Step 5:** Commit per coherent group.

### Task C6: Verify Phase C

- [ ] `npm run typecheck`, `npx jest src`, `npm run build` — green. Enable + run `tests/e2e/object-editor.spec.ts`. Manual: one object per archetype, every section reviewed against the design reference.

---

## Closeout

- [ ] Update `claude_brief/lot1_mapping_decisions.md` — resolve the §16/§17 deferrals (Distribution write now shipped), record the data-wiring fixes.
- [ ] Refresh MCP memory from the canonical log per the CLAUDE.md memory workflow.
- [ ] Commit — `docs: record the editor improvement pass`.

---

## Self-Review

**Coverage of the reported problems:** "sections show no data" → Phase A (A1 diagnosis → A2 demo fixture / A3 real-DB query repair / A4 openings). "Distribution/Fournisseur" gaps → Phase B. "Type blocks / rail widgets / sections / interactions missing" (all four flagged) → Phase C, C2–C5, scoped by the C1 audit. ✓

**Diagnostic-first is intentional:** the exact broken queries and UX gaps are not yet enumerated — A1 and C1 are audit tasks that produce the concrete lists the fix tasks consume. This is honest: the plan cannot pre-write fix code for bugs not yet localized. Each fix task names its file anchors and adds a regression test.

**Escalation points:** Task B1 Step 2 explicitly stops for user confirmation if operator-actor resolution is ambiguous — no improvised actor writes.

**Ordering:** Phase A is the blocker (the editor is unusable until sections show data) and must land first; B and C can follow in either order.
