# Unified list-selection design (house picker everywhere)

**Date:** 2026-06-14
**Status:** Design approved (brainstorming) — pending implementation plan
**Scope owner:** d.philippe@otisud.com (PO)

---

## 1. Problem

The object editor already has a polished multi-select picker — a modal with a search
field, a **Sélectionnés (n)** section and a **Disponibles** section (e.g. *« Choisir un
cadre / environnement »*). It is implemented by `ChipMultiSelect` in modal mode
(`src/features/object-editor/primitives/ChipMultiSelect.tsx`).

The rest of the app does **not** share this design. The most visible gap is inside the
CRM modals, which use plain native `<select>` dropdowns (sujet, sentiment, établissement,
acteur, assigné…). The PO wants the same house picker design used **everywhere a value is
chosen from a list, especially inside modals**.

### Constraint discovered during exploration (drives the architecture)

There are **two parallel style vocabularies**:

- The picker visuals (`.cms`, `.cms__trigger`, `.chip-group__label`, and the picker
  `.chip`) are scoped under `.object-editor` in
  `src/features/object-editor/object-editor.css`.
- The CRM modals live under `.crm-app` and use a separate vocabulary
  (`.crm-select`, `.crm-field`, `.kind-chip`) defined in the global `src/styles.css`.

Consequence: dropping `ChipMultiSelect` into a CRM modal renders **unstyled** — its CSS is
locked to the editor scope. "Same design everywhere" therefore requires **lifting the
picker's visual language into a shared, token-based scope**, not merely reusing the
component. The chip styles already use global design tokens (`--accent`, `--line`,
`--surface`, `--ink-*`), so the values port cleanly; only the selector scope must change.

---

## 2. Decisions (locked with the PO)

| Question | Decision |
|---|---|
| Which spots? | CRM modals + the remaining multi-selects. **Explorer/Dashboard `FilterDropdown` filters stay as-is** (intentionally dense, different pattern). |
| Single-select treatment | **Searchable picker for long lists**; keep a compact, house-styled control for short lists (civilité 3, sentiment 6, assigné). |
| Single-select container | **Popover combobox** anchored to a trigger (approach A) — lighter than stacking a second modal over the already-open CRM modal; shares the search + house-styled-option visual language with the multi-select modal. |
| Grouped multi-selects | **Left untouched** (durabilité actions, accessibilité par type de handicap, permissions équipe) — they are grouped catalogs with categories/descriptions; flattening into one chip modal would lose structure. |

---

## 3. Components

### 3.1 `SearchSelect` — new single-select searchable picker (popover)

- **Location:** `src/components/ui/pickers/SearchSelect.tsx` (shared module — see §3.3).
- **Props:**
  - `value: string` — current code (`''` = none).
  - `options: { code: string; label: string }[]`.
  - `onChange: (code: string) => void`.
  - `placeholder?: string` — trigger text when `value === ''` (e.g. *« — Établissement — »*).
  - `searchPlaceholder?: string` — search input placeholder.
  - `allowClear?: boolean` — when true, the popover offers a *« — Aucun — »* / clear row
    (needed for the optional Acteur and any non-required field).
  - `aria-label?: string`.
- **Behaviour:**
  - Trigger button shows the selected option's label (or `placeholder`) + a chevron.
  - Clicking opens a floating panel anchored below the trigger containing a search `Input`
    at top and a scrollable, house-styled option list.
  - Picking an option calls `onChange(code)` and **closes immediately** (single-select; no
    "Valider" step).
  - A code present in `value` but absent from `options` (stale/legacy) still renders as the
    trigger label (mirror the `ReferenceSelect` "always render current value" rule).
- **Accessibility / behaviour inside `CrmModal`'s focus trap:**
  - Type-to-filter; `↑`/`↓` move the active option; `Enter` selects; `Escape` closes the
    **popover only** and **`stopPropagation()`** so the host `CrmModal` does not also close
    (CrmModal closes on bubbling `Escape` — see `CrmModal.tsx:36`).
  - Click-outside closes the popover.
  - `role="combobox"` on the trigger, `role="listbox"`/`role="option"` on the panel,
    `aria-expanded`, `aria-activedescendant`.
  - Diacritic-insensitive search — **reuse the existing `fold()` helper** (currently private
    in `ChipMultiSelect.tsx`; extract to a shared util — see §3.3).

### 3.2 `ChipMultiSelect` — multi-select modal (existing, unchanged behaviour)

Behaviour stays exactly as today (staged draft + Valider, `Sélectionnés`/`Disponibles`).
Only its **home and CSS scope** change so the same look is available outside the editor
(§3.3). No prop or interaction change.

### 3.3 Shared module + shared CSS (one source of truth)

- **New module:** `src/components/ui/pickers/`
  - `SearchSelect.tsx` (new)
  - `ChipMultiSelect.tsx` (re-homed from `object-editor/primitives/`)
  - `fold.ts` (extracted from `ChipMultiSelect.tsx`; shared by both pickers)
  - `index.ts` re-exporting both.
- **Backward-compatible re-export:** keep
  `src/features/object-editor/primitives/ChipMultiSelect.tsx` (and the
  `primitives/index.ts` export) as a thin re-export of the shared component so the ~9
  existing editor call-sites need no churn.
- **CSS:** move the picker rules (`.cms`, `.cms__trigger`, `.chip-group__label`, and a
  picker-local chip/pill + popover panel) out of the `.object-editor`-scoped block into a
  shared, **scope-neutral** class namespace (proposed prefix `.picker-*`, e.g.
  `.picker`, `.picker__panel`, `.picker__group-label`, `.picker__option`). Tokens only —
  no hard-coded hues. The editor's existing `.object-editor .chip` styling is reused where
  the picker renders inside the editor; the shared `.picker-*` rules carry the chrome the
  CRM scope currently lacks. Place the shared rules so both `.object-editor` and `.crm-app`
  trees inherit them (global `styles.css`, or a dedicated imported `pickers.css`).

> Note: this de-scoping is the crux of "same design everywhere". Verify visually that the
> ~9 existing editor pickers are byte-for-byte unchanged after the move (regression risk).

---

## 4. CRM adoption (the visible win)

By list length — **long → `SearchSelect`**, **short → keep compact house-styled `<select>`**:

| File | Control | Today | Target |
|---|---|---|---|
| `CrmInteractionModal.tsx:200` | Sujet (20 OTI topics) | `<select>` | **`SearchSelect`** |
| `CrmInteractionModal.tsx:167` | Établissement (required) | `<select>` | **`SearchSelect`** |
| `CrmInteractionModal.tsx:181` | Acteur (optionnel) | `<select>` | **`SearchSelect`** (`allowClear`) |
| `CrmInteractionModal.tsx:216` | Sentiment (6) | `<select>` | keep — harmonise style |
| `CrmInteractionModal.tsx:279` | Attribuer à | `<select>` | keep — harmonise style |
| `CrmTaskModal.tsx:112` | Établissement (`picker='select'`) | `<select>` | **`SearchSelect`** |
| `CrmTaskModal.tsx:127` | Établissement (`picker='datalist'`) | `<input>`+datalist | **`SearchSelect`** (replaces the fragile name→id text match at `:56`) |
| `CrmTaskModal.tsx:156` | Attribuer à | `<select>` | keep — harmonise style |
| `CrmActorModals.tsx` (~297/587) | Civilité (3) | `<select>` | keep — harmonise style |
| `CrmActorModals.tsx` (~362/692) | Canal (kind, per-row) | `<select>` | keep — harmonise style |

Notes:
- The `CrmTaskModal` `datalist` path resolves an establishment by **exact-name string match**
  (`CrmTaskModal.tsx:56`) — moving it to `SearchSelect` removes that fragility and the
  *« Établissement introuvable »* hint at `:142`. Both entry points then return a real
  `objectId`. Confirm the `picker` prop can be collapsed to a single code path or kept as
  a behavioural switch (auto-select-when-one vs no-auto-select).
- "Harmonise style" = the short `<select>`s adopt the shared field/control tokens so they
  read as the same family — **no search**, no behaviour change.

### CRM filter bar (borderline — confirm during planning)

`CrmFilterBar` topic filter (~20 options) is a CRM filter, not Explorer/Dashboard. Treat as
**optional** in this pass: convert its topic select to `SearchSelect` only if it reads
inconsistent next to the modals; otherwise defer. Segmented controls (`Seg`) stay.

---

## 5. Out of scope

- Explorer/Dashboard `FilterDropdown` and `FiltersPanel`/`DashboardFiltersPanel` filters.
- Grouped multi-selects: `SectionSustainability` actions, `SectionAccessibility` disability
  panels, `MemberPermissionsDrawer` permissions (grouped + descriptive — would lose
  structure if flattened).
- Small inline chip lists already matching the "Disponibles" look (`SectionPayLangs`
  payment modes, `BlockITI` practices) — fine as-is.
- Address/location typeaheads (`AddressBanCombobox`, `LocationReferenceCombobox`) — async,
  free-text, distinct concern.

---

## 6. Testing (TDD, match existing Jest patterns)

- **`SearchSelect.test.tsx`** (new): renders trigger label/placeholder; opens on click;
  filters diacritic-insensitively; `↑/↓/Enter` keyboard selection; select-and-close calls
  `onChange` once and closes; **`Escape` closes the popover without bubbling** (assert the
  host close handler is not called); `allowClear` clears; stale-code value still renders.
- **`fold.test.ts`** (new): keep/port the diacritic cases.
- **CRM modal specs:** update `CrmInteractionModal` / `CrmTaskModal` tests for the new
  control (query by `role="combobox"` + option text instead of `<select>`); keep the
  existing submit/anchor assertions (§66 establishment-required, etc.) green.
- **Regression:** full FE suite green; `tsc` clean; the ~9 editor `ChipMultiSelect`
  call-sites unchanged (re-export) and visually identical after the CSS de-scope.

---

## 7. Verification before "done"

- `npm test` green (new specs + existing suite).
- `tsc --noEmit` clean.
- Run the app: open *Nouvelle interaction* and *Nouvelle tâche* — Sujet / Établissement /
  Acteur render as the house searchable picker; pick-and-close works; Escape inside the
  picker does not close the CRM modal. Screenshot proof.
- Open an editor picker (e.g. *Choisir un cadre / environnement*) — visually unchanged.

---

## 8. Decision-log / memory follow-ups

- Add a short note to `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md` (next §)
  recording: the shared `ui/pickers` module, the `SearchSelect` single-select picker, the
  CSS de-scoping from `.object-editor` to `.picker-*`, the CRM adoption list, and the
  "grouped multi-selects + Explorer filters out of scope" boundary.
- Propose a one-line CLAUDE.md invariant if it generalises: *new list-selection UIs use the
  shared `ui/pickers` primitives (`SearchSelect` single, `ChipMultiSelect` multi); do not
  hand-roll a third select/chip vocabulary.*
