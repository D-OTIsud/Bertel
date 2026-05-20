# Edit Pages by Type — Plan 3: Cross-cutting Widgets — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the editor's intelligence layer — completion scoring, the publication validation gate, field provenance, the relation typeahead, and the four right-rail cards (completion ring, issues, presence, history).

**Architecture:** Two pure modules — `editor-completion.ts` (filled-vs-required ratio per section) and `editor-validation.ts` (blockers/warnings per archetype) — feed the shell. The right rail (`EditorRail`, a scaffold since Plan 1) gains four cards. The left nav gains per-section status dots and percentages. The topbar gains a validation summary. Widgets are presentational; all scoring is pure and unit-tested.

**Tech Stack:** Next.js 16, React 19, TypeScript, Jest + Testing Library; `usePresenceRoom` (existing) for live presence.

**Depends on:** Plans 1–2 (the shell and all 22 sections). **Reference:** prototype `edit-enhancements.jsx` (`Prov`, `ValBanner`, `SiretCard`, `RelationPicker`) and `edit-primitives.jsx` (`RailCompletion`, `RailIssues`, `RailPresence`, `RailHistory`) in `Bertel.zip`.

**Conventions:** pure scoring modules are TDD'd directly; widgets get render tests. Commit per task. Commands from `bertel-tourism-ui/`.

---

## File Structure

New files under `src/features/object-editor/`:

| File | Responsibility |
|---|---|
| `editor-completion.ts` | Pure: per-section completion % and overall %, from the draft modules. |
| `editor-validation.ts` | Pure: publication blockers + warnings, from draft + permissions + archetype. |
| `widgets/Provenance.tsx` | Field/section source badge (Apidae · INSEE · Prestataire · OTI · Manuel). |
| `widgets/ValidationBanner.tsx` | Publication-gate banner: blockers, warnings, publish CTA. |
| `widgets/CompletionRing.tsx` | SVG ring + per-section completion list. |
| `widgets/IssuesRail.tsx` | "À corriger" list, derived from validation. |
| `widgets/PresenceRail.tsx` | Live editors, via `usePresenceRoom`. |
| `widgets/HistoryRail.tsx` | Recent changes, from available audit/last-modified data. |
| `widgets/RelationPicker.tsx` | Object typeahead overlay for linking fiches. |
| `widgets/SiretCard.tsx` | Presentational INSEE/SIRENE verification card. |
| `useObjectSearch.ts` | Hook: typeahead object search, backed by the explorer list RPC. |

Modified: `ObjectEditPage.tsx` (compute completion/validation, feed shell), `shell/EditorRail.tsx` (host the four cards), `shell/EditorNav.tsx` (status dots + %), `shell/EditorTopbar.tsx` (validation summary), `sections/SectionRelations.tsx` (mount `RelationPicker`), `sections/SectionAttachments.tsx` (mount `SiretCard` if provider data present), `object-editor.css` (append `.prov`, `.val-banner*`, `.siret-card*`, `.rpick*`, `.edit-nav__ring*`, `.issue*`, `.peer*`, `.history-row*`).

---

## Task 1: `editor-completion.ts` — completion scoring

**Files:** Create `editor-completion.ts` + `editor-completion.test.ts`.

- [ ] **Step 1:** Failing test — `computeSectionCompletion(num, draft)` returns 0–100 for a given section; `computeOverallCompletion(draft)` averages the universal sections. Test: an empty `descriptions` module scores low; a fully filled one scores 100.
- [ ] **Step 2:** Run — fails.
- [ ] **Step 3:** Implement. Each section declares a set of "counted" fields (required + recommended); completion = filled / counted. Keep the rules in one `SECTION_COMPLETION_RULES` table keyed by section `num`. A section with no rule returns 100 (nothing to score).
- [ ] **Step 4:** Run — passes.
- [ ] **Step 5:** Commit — `feat(ui): add editor completion scoring`.

---

## Task 2: `editor-validation.ts` — publication gate

**Files:** Create `editor-validation.ts` + `editor-validation.test.ts`.

- [ ] **Step 1:** Failing test — `validateForPublication(draft, permissions, archetype)` returns `{ blockers: Issue[], warnings: Issue[] }`. Each `Issue` is `{ section: string; message: string; tone: 'req' | 'warn' }`. Test: missing object name → a blocker referencing section 01; thin descriptions → a warning referencing section 02.
- [ ] **Step 2:** Run — fails.
- [ ] **Step 3:** Implement. A `VALIDATION_RULES` list — each rule inspects the draft and yields an Issue or nothing. Required-field rules → blockers; recommended rules → warnings. Archetype-specific rules (e.g. ITI requires a GPX trace) gate on `archetype`.
- [ ] **Step 4:** Run — passes.
- [ ] **Step 5:** Commit — `feat(ui): add editor publication validation rules`.

---

## Task 3: `CompletionRing` widget

**Files:** Create `widgets/CompletionRing.tsx` + `CompletionRing.test.tsx`.

- [ ] **Step 1:** Failing test — renders the overall percentage and one row per scored section.
- [ ] **Step 2:** Run — fails.
- [ ] **Step 3:** Implement — SVG ring (port the prototype `RailCompletion` markup, `strokeDasharray` from the percentage) + per-section list with status dots. Props: `{ overall: number; sections: { label: string; pct: number; stat: 'ok'|'warn' }[] }`.
- [ ] **Step 4:** Run — passes.
- [ ] **Step 5:** Commit — `feat(ui): add completion ring widget`.

---

## Task 4: `IssuesRail` widget

**Files:** Create `widgets/IssuesRail.tsx` + `IssuesRail.test.tsx`.

- [ ] **Step 1–5:** TDD a card listing validation issues (`{ items: Issue[] }`); each row shows tone dot, message, and an "Aller ›" affordance that calls an `onGoToSection(num)` prop. Commit — `feat(ui): add issues rail widget`.

---

## Task 5: `PresenceRail` widget

**Files:** Create `widgets/PresenceRail.tsx` + `PresenceRail.test.tsx`.

- [ ] **Step 1–5:** TDD a card rendering the peers from `usePresenceRoom` (already used by `ObjectDrawerShell` — reuse the hook with `room:${objectId}`). Render avatars + names + "is editing" tags. Commit — `feat(ui): add presence rail widget`.

---

## Task 6: `HistoryRail` widget

**Files:** Create `widgets/HistoryRail.tsx` + `HistoryRail.test.tsx`.

- [ ] **Step 1–5:** TDD a card listing recent changes. Source: whatever audit/last-modified data the workspace resource exposes (`generalInfo.publishedAt`, module timestamps). If no per-change audit feed exists, render the available timestamps and a "Tout voir" link — **do not fabricate history**. Commit — `feat(ui): add history rail widget`.

---

## Task 7: `Provenance` badge + section wiring

**Files:** Create `widgets/Provenance.tsx` + `Provenance.test.tsx`; modify sections that have a known source.

- [ ] **Step 1–4:** TDD `Provenance` — props `{ source: 'Apidae'|'INSEE'|'Prestataire'|'OTI'|'Manuel'|'Importé'; who?: string; when?: string; locked?: string }`, renders the source badge line (port prototype `Prov`).
- [ ] **Step 5:** Wire it where the data supports it — e.g. section 01/03 show a section-level provenance line derived from `syncIdentifiers.originItems` (Apidae/DataTourisme import) when present. Field-level provenance is **not** fabricated; only render where a real source is known.
- [ ] **Step 6:** Commit — `feat(ui): add field provenance badges`.

---

## Task 8: `ValidationBanner` + topbar summary

**Files:** Create `widgets/ValidationBanner.tsx` + test; modify `ObjectEditPage.tsx`, `EditorTopbar.tsx`.

- [ ] **Step 1–4:** TDD `ValidationBanner` — three columns (blockers, warnings, publish gate); the publish button is disabled while `blockers.length > 0`. Props from `editor-validation`.
- [ ] **Step 5:** Render the banner at the top of `edit-main`; wire its publish CTA to the existing `usePublishObjectWorkspaceMutation`. Show the blocker count in `EditorTopbar`.
- [ ] **Step 6:** Commit — `feat(ui): add publication validation banner`.

---

## Task 9: `useObjectSearch` + `RelationPicker`

**Files:** Create `useObjectSearch.ts` + test, `widgets/RelationPicker.tsx` + test; modify `SectionRelations.tsx`.

- [ ] **Step 1:** Confirm the explorer list RPC signature (`src/services/rpc.ts` — `list_object_resources_filtered_page`); a lightweight name search reuses it.
- [ ] **Step 2–4:** TDD `useObjectSearch(query)` — debounced, returns `{ results, loading }`; and `RelationPicker` — typeahead overlay (port prototype `RelationPicker`), type filter chips, keyboard hints, `onPick(objectId)`.
- [ ] **Step 5:** Mount `RelationPicker` inside `SectionRelations`'s "lier vers une fiche" affordance; picking a result appends an outgoing relation.
- [ ] **Step 6:** Commit — `feat(ui): add relation typeahead picker`.

---

## Task 10: `SiretCard` (presentational)

**Files:** Create `widgets/SiretCard.tsx` + test; modify `SectionAttachments.tsx`.

- [ ] **Step 1–4:** TDD `SiretCard` — renders stored provider/legal-entity fields (SIRET, raison sociale, NAF, forme juridique) from props. "Re-vérifier" is disabled with a title explaining live INSEE lookup is out of scope.
- [ ] **Step 5:** Mount it in `SectionAttachments` when provider data is present on the resource.
- [ ] **Step 6:** Commit — `feat(ui): add presentational SIRET verification card`.

---

## Task 11: Wire completion into nav + rail; CSS; verify

**Files:** Modify `ObjectEditPage.tsx`, `EditorNav.tsx`, `EditorRail.tsx`, `object-editor.css`.

- [ ] **Step 1:** `ObjectEditPage` computes `editor-completion` + `editor-validation` from `editor.draft` (memoised) and passes results to nav, rail, banner, topbar.
- [ ] **Step 2:** `EditorNav` items show the per-section status dot (`ok`/`warn`/`req`) and `%`/hint — extend `SectionItem` consumption; the data comes from completion + validation, not hard-coded.
- [ ] **Step 3:** `EditorRail` renders `CompletionRing`, `IssuesRail`, `PresenceRail`, `HistoryRail`.
- [ ] **Step 4:** Append the widget CSS to `object-editor.css` (`.prov`, `.val-banner*`, `.siret-card*`, `.rpick*`, `.edit-nav__ring*`, `.issue*`, `.peer*`, `.history-row*`), scoped under `.object-editor`.
- [ ] **Step 5:** Run `npx jest src/features/object-editor`, `npm run typecheck`, `npm run build` — all green.
- [ ] **Step 6:** Commit — `feat(ui): wire completion and validation into the editor shell`.

---

## Self-Review

**Spec coverage:** provenance — Task 7 · validation banner / publish gate — Tasks 2, 8 · completion ring + per-section % — Tasks 1, 3, 11 · issues rail — Tasks 2, 4 · presence rail — Task 5 · history rail — Task 6 · relation typeahead — Task 9 · SIRET card — Task 10. ✓

**Placeholder scan:** Tasks 4–6 compress the TDD cycle to "Step 1–5" because they are simple presentational cards following the widget pattern established in Task 3 — each still names its props and data source. `HistoryRail` and `Provenance` explicitly forbid fabricated data — they degrade to real available data only.

**Type consistency:** `Issue` is defined once in `editor-validation.ts` and consumed by `IssuesRail` + `ValidationBanner`; completion shapes flow `editor-completion.ts` → `CompletionRing` + `EditorNav`; `usePresenceRoom` and `usePublishObjectWorkspaceMutation` are existing hooks reused unchanged.
