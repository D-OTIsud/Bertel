# Unified List Pickers — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every "pick a value from a list" UI the same house picker design — a searchable single-select (`SearchSelect`) for long lists, matching the editor's existing `ChipMultiSelect` multi-select modal — starting with the CRM modals.

**Architecture:** Add one new shared primitive `SearchSelect` (a popover combobox: trigger → floating panel with a search field + house-styled option list, pick-and-close) under a neutral shared module `src/components/ui/pickers/`. Give it self-contained, scope-neutral `.picker-*` CSS in the global `styles.css` so it renders identically inside both `.crm-app` and `.object-editor`. Extract the diacritic-fold helper to share it. Then swap the long CRM `<select>`s (sujet, établissement, acteur) to `SearchSelect`; keep short selects (sentiment, civilité, assigné) as the existing house-styled `.crm-select`.

**Tech Stack:** React 18 + TypeScript (Next.js app router), Jest + @testing-library/react, plain CSS with design tokens in `src/styles.css`.

**Test commands:** `npm run test:run` (jest, single run) and `npm run typecheck` (tsc). `npm test` is watch-mode — do NOT use it in automation.

---

## File Structure

**New shared module — `src/components/ui/pickers/`:**
- `fold.ts` — diacritic-insensitive lowercase helper (extracted from `ChipMultiSelect.tsx`). One responsibility: text folding for search.
- `fold.test.ts` — unit tests for `fold`.
- `SearchSelect.tsx` — the new single-select searchable popover. One responsibility: pick one code from a flat option list.
- `SearchSelect.test.tsx` — behaviour + a11y tests.
- `index.ts` — re-exports `SearchSelect`, `SearchSelectOption`, `fold`.

**Modified:**
- `src/features/object-editor/primitives/ChipMultiSelect.tsx` — import `fold` from the shared module instead of its private copy (DRY). No behaviour change.
- `src/styles.css` — add the global `.picker-*` block (scope-neutral).
- `src/features/crm/CrmInteractionModal.tsx` — Sujet / Établissement / Acteur → `SearchSelect`.
- `src/features/crm/CrmTaskModal.tsx` — Établissement (both `picker` modes) → `SearchSelect`; drop the name→id text match.
- `src/features/crm/CrmInteractionModal.test.tsx`, `src/features/crm/CrmTaches.test.tsx`, `src/features/crm/CrmActorFiche.test.tsx` — drive the new combobox instead of `<select>`.

**Explicitly unchanged:** the ~9 editor `ChipMultiSelect` call-sites, `CrmActorModals.tsx` (civilité/canal stay `.crm-select`), Explorer/Dashboard filters, grouped multi-selects (sustainability/accessibility/permissions).

---

## Task 1: Extract the `fold` helper to the shared module

**Files:**
- Create: `src/components/ui/pickers/fold.ts`
- Create: `src/components/ui/pickers/fold.test.ts`
- Create: `src/components/ui/pickers/index.ts`
- Modify: `src/features/object-editor/primitives/ChipMultiSelect.tsx` (remove private `fold`, import shared)

- [ ] **Step 1: Write the failing test**

Create `src/components/ui/pickers/fold.test.ts`:

```ts
import { fold } from './fold';

describe('fold', () => {
  it('lowercases', () => {
    expect(fold('Montagne')).toBe('montagne');
  });
  it('strips diacritics so "foret" matches "Forêt"', () => {
    expect(fold('Forêt')).toBe('foret');
  });
  it('handles multiple accents', () => {
    expect(fold('Île à thé')).toBe('ile a the');
  });
  it('is idempotent on ASCII', () => {
    expect(fold('wifi')).toBe('wifi');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/components/ui/pickers/fold.test.ts`
Expected: FAIL — `Cannot find module './fold'`.

- [ ] **Step 3: Create the implementation**

Create `src/components/ui/pickers/fold.ts` (verbatim logic moved from `ChipMultiSelect.tsx:28-36`):

```ts
/** Diacritic-insensitive lowercase (Réunion names carry accents). Codepoint loop keeps
 *  the source ASCII-safe (no combining marks written literally in a regex). */
export function fold(value: string): string {
  let out = '';
  for (const ch of value.normalize('NFD')) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 0x300 && code <= 0x36f) continue; // U+0300–U+036F combining diacritical marks
    out += ch;
  }
  return out.toLowerCase();
}
```

Create `src/components/ui/pickers/index.ts`:

```ts
export { fold } from './fold';
export { SearchSelect, type SearchSelectOption } from './SearchSelect';
```

> Note: `index.ts` references `SearchSelect`, created in Task 2. Until then, importing the
> barrel would error — Task 1 only imports `./fold` directly (Step 5), so this is fine.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- src/components/ui/pickers/fold.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Point `ChipMultiSelect` at the shared helper (DRY)**

In `src/features/object-editor/primitives/ChipMultiSelect.tsx`:
- Delete the private `fold` function (lines 26-36, the comment block + function).
- Add an import near the top (after the existing imports):

```ts
import { fold } from '../../../components/ui/pickers/fold';
```

- [ ] **Step 6: Run the editor picker tests + typecheck to verify no regression**

Run: `npm run test:run -- src/features/object-editor/primitives/ChipMultiSelect.test.tsx`
Expected: PASS (existing 6 tests — the diacritic-search test at line 57 still passes).
Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/ui/pickers/fold.ts src/components/ui/pickers/fold.test.ts src/components/ui/pickers/index.ts src/features/object-editor/primitives/ChipMultiSelect.tsx
git commit -m "refactor(pickers): extract shared fold() helper into ui/pickers module"
```

---

## Task 2: Build the `SearchSelect` single-select popover (TDD)

**Files:**
- Create: `src/components/ui/pickers/SearchSelect.tsx`
- Create: `src/components/ui/pickers/SearchSelect.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/ui/pickers/SearchSelect.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { SearchSelect } from './SearchSelect';

const options = [
  { code: 'o1', label: 'Hôtel A' },
  { code: 'o2', label: 'Restaurant B' },
  { code: 'o3', label: 'Forêt des Makes' },
];

describe('SearchSelect', () => {
  it('shows the placeholder when nothing is selected', () => {
    render(<SearchSelect value="" options={options} onChange={jest.fn()} placeholder="— Choisir —" aria-label="Cible" />);
    expect(screen.getByRole('combobox', { name: 'Cible' })).toHaveTextContent('— Choisir —');
  });

  it('shows the selected option label on the trigger', () => {
    render(<SearchSelect value="o2" options={options} onChange={jest.fn()} aria-label="Cible" />);
    expect(screen.getByRole('combobox', { name: 'Cible' })).toHaveTextContent('Restaurant B');
  });

  it('opens on click, lists options, selects one and closes (single onChange)', () => {
    const onChange = jest.fn();
    render(<SearchSelect value="" options={options} onChange={onChange} aria-label="Cible" />);
    fireEvent.click(screen.getByRole('combobox', { name: 'Cible' }));
    fireEvent.click(screen.getByRole('option', { name: 'Restaurant B' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('o2');
    // panel closed → options gone
    expect(screen.queryByRole('option', { name: 'Restaurant B' })).toBeNull();
  });

  it('filters options diacritic-insensitively', () => {
    render(<SearchSelect value="" options={options} onChange={jest.fn()} aria-label="Cible" />);
    fireEvent.click(screen.getByRole('combobox', { name: 'Cible' }));
    fireEvent.change(screen.getByLabelText('Rechercher'), { target: { value: 'foret' } });
    expect(screen.getByRole('option', { name: 'Forêt des Makes' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Hôtel A' })).toBeNull();
  });

  it('keyboard: ArrowDown then Enter selects the first option', () => {
    const onChange = jest.fn();
    render(<SearchSelect value="" options={options} onChange={onChange} aria-label="Cible" />);
    fireEvent.click(screen.getByRole('combobox', { name: 'Cible' }));
    const search = screen.getByLabelText('Rechercher');
    fireEvent.keyDown(search, { key: 'Enter' }); // active row 0 by default
    expect(onChange).toHaveBeenCalledWith('o1');
  });

  it('Escape closes the popover WITHOUT bubbling to a host handler', () => {
    const hostEscape = jest.fn();
    render(
      <div onKeyDown={(e) => { if (e.key === 'Escape') hostEscape(); }}>
        <SearchSelect value="" options={options} onChange={jest.fn()} aria-label="Cible" />
      </div>,
    );
    fireEvent.click(screen.getByRole('combobox', { name: 'Cible' }));
    fireEvent.keyDown(screen.getByLabelText('Rechercher'), { key: 'Escape' });
    expect(screen.queryByRole('option', { name: 'Hôtel A' })).toBeNull(); // closed
    expect(hostEscape).not.toHaveBeenCalled(); // stopPropagation held
  });

  it('allowClear renders a clear row that emits the empty code', () => {
    const onChange = jest.fn();
    render(<SearchSelect value="o1" options={options} onChange={onChange} allowClear clearLabel="— Aucun —" aria-label="Cible" />);
    fireEvent.click(screen.getByRole('combobox', { name: 'Cible' }));
    fireEvent.click(screen.getByRole('option', { name: '— Aucun —' }));
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('renders a stale value (code absent from options) as its own trigger label', () => {
    render(<SearchSelect value="legacy_code" options={options} onChange={jest.fn()} aria-label="Cible" />);
    expect(screen.getByRole('combobox', { name: 'Cible' })).toHaveTextContent('legacy_code');
  });

  it('closes on outside mousedown', () => {
    render(<SearchSelect value="" options={options} onChange={jest.fn()} aria-label="Cible" />);
    fireEvent.click(screen.getByRole('combobox', { name: 'Cible' }));
    expect(screen.getByRole('option', { name: 'Hôtel A' })).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('option', { name: 'Hôtel A' })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/components/ui/pickers/SearchSelect.test.tsx`
Expected: FAIL — `Cannot find module './SearchSelect'`.

- [ ] **Step 3: Write the implementation**

Create `src/components/ui/pickers/SearchSelect.tsx`:

```tsx
'use client';

// Single-select searchable picker (house design — mirrors the editor's ChipMultiSelect
// modal visual language: search field + house-styled option list). Used for long lists
// where a native <select> is unwieldy (sujet, établissement, acteur…). Popover container
// (not a nested modal) so it can open inside an already-open modal without stacking.

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { fold } from './fold';

export interface SearchSelectOption {
  code: string;
  label: string;
}

interface SearchSelectProps {
  value: string;
  options: SearchSelectOption[];
  onChange: (code: string) => void;
  /** Trigger text when nothing is selected. */
  placeholder?: string;
  searchPlaceholder?: string;
  /** Adds a leading « clear » row that emits the empty code (for optional fields). */
  allowClear?: boolean;
  clearLabel?: string;
  'aria-label'?: string;
}

export function SearchSelect({
  value,
  options,
  onChange,
  placeholder = '— Choisir —',
  searchPlaceholder = 'Rechercher…',
  allowClear = false,
  clearLabel = '— Aucun —',
  'aria-label': ariaLabel,
}: SearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const selected = options.find((o) => o.code === value) ?? null;
  // Always render the current value: a code absent from options (stale/legacy) shows itself
  // rather than collapsing to the placeholder (mirrors ReferenceSelect).
  const triggerLabel = selected ? selected.label : value !== '' ? value : placeholder;

  const folded = fold(query.trim());
  const filtered = useMemo(
    () => options.filter((o) => folded === '' || fold(o.label).includes(folded)),
    [options, folded],
  );
  const rowCount = filtered.length + (allowClear ? 1 : 0);

  // Focus the search on open; reset the query when it closes.
  useEffect(() => {
    if (open) {
      setActive(0);
      searchRef.current?.focus();
    } else {
      setQuery('');
    }
  }, [open]);

  // Outside mousedown closes the popover.
  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [open]);

  function commit(code: string) {
    onChange(code);
    setOpen(false);
  }

  function onSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      // Close THIS popover only — a host modal (CrmModal) also closes on a bubbling Escape.
      event.stopPropagation();
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((a) => Math.min(a + 1, rowCount - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (allowClear && active === 0) {
        commit('');
        return;
      }
      const opt = filtered[allowClear ? active - 1 : active];
      if (opt) commit(opt.code);
    }
  }

  return (
    <div className="picker picker--single" ref={rootRef}>
      <button
        type="button"
        className={`picker__trigger${selected ? '' : ' is-empty'}`}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="picker__trigger-label">{triggerLabel}</span>
        <span className="picker__chevron" aria-hidden>▾</span>
      </button>

      {open && (
        <div className="picker__panel">
          <input
            ref={searchRef}
            className="picker__search"
            type="text"
            value={query}
            placeholder={searchPlaceholder}
            aria-label="Rechercher"
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={onSearchKeyDown}
          />
          <div className="picker__options" role="listbox" id={listId}>
            {allowClear && (
              <button
                type="button"
                role="option"
                aria-selected={value === ''}
                className={`picker__option${active === 0 ? ' is-active' : ''}${value === '' ? ' is-on' : ''}`}
                onClick={() => commit('')}
              >
                {clearLabel}
              </button>
            )}
            {filtered.map((option, i) => {
              const rowIndex = allowClear ? i + 1 : i;
              return (
                <button
                  key={option.code}
                  type="button"
                  role="option"
                  aria-selected={option.code === value}
                  className={`picker__option${rowIndex === active ? ' is-active' : ''}${option.code === value ? ' is-on' : ''}`}
                  onClick={() => commit(option.code)}
                >
                  {option.label}
                </button>
              );
            })}
            {filtered.length === 0 && <p className="picker__empty">Aucun résultat</p>}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- src/components/ui/pickers/SearchSelect.test.tsx`
Expected: PASS (9 tests). If the keyboard test fails because `active` starts at a non-zero row, confirm the `useEffect` resets `setActive(0)` on open.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors (the barrel `index.ts` now resolves `SearchSelect`).

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/pickers/SearchSelect.tsx src/components/ui/pickers/SearchSelect.test.tsx
git commit -m "feat(pickers): add SearchSelect single-select searchable popover"
```

---

## Task 3: Shared `.picker-*` CSS (scope-neutral, house design)

**Files:**
- Modify: `src/styles.css` (append a global block; tokens only)

- [ ] **Step 1: Add the picker styles**

Append to `src/styles.css` (end of file is fine — these are global, unscoped so they apply inside both `.crm-app` and `.object-editor`). Use existing tokens only; values mirror the chip/field vocabulary (`object-editor.css:448` chips, `--accent`, `--line`, `--surface`, `--ink-*`, `--r-md`):

```css
/* ------------------------------------------------------------------ *
 * Shared list pickers (SearchSelect — single-select popover).
 * Scope-neutral so the SAME picker renders identically in .crm-app and
 * .object-editor. Tokens only — no hard-coded hues. See
 * docs/superpowers/specs/2026-06-14-unified-list-pickers-design.md.
 * ------------------------------------------------------------------ */
.picker { position: relative; }
.picker__trigger {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  width: 100%; min-height: 34px; padding: 6px 10px;
  border: 1px solid var(--line); border-radius: var(--r-md);
  background: var(--surface); color: var(--ink);
  font-size: 13px; font-weight: 500; text-align: left; cursor: pointer;
}
.picker__trigger:hover { border-color: var(--line-strong); }
.picker__trigger:focus-visible { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-tint); }
.picker__trigger.is-empty .picker__trigger-label { color: var(--ink-4); }
.picker__trigger-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.picker__chevron { flex: none; font-size: 10px; color: var(--ink-4); }

.picker__panel {
  position: absolute; z-index: 50; top: calc(100% + 4px); left: 0; right: 0;
  display: flex; flex-direction: column; gap: 6px;
  max-height: 280px; padding: 8px;
  background: var(--surface); border: 1px solid var(--line);
  border-radius: var(--r-md); box-shadow: var(--shadow-m, 0 8px 24px rgba(0, 0, 0, 0.12));
}
.picker__search {
  width: 100%; height: 32px; padding: 0 10px;
  border: 1px solid var(--line); border-radius: var(--r-md);
  background: var(--bg-tint); color: var(--ink); font-size: 13px;
}
.picker__search:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-tint); }
.picker__options { display: flex; flex-direction: column; gap: 2px; overflow-y: auto; }
.picker__option {
  display: block; width: 100%; text-align: left;
  padding: 7px 10px; border: 0; border-radius: 8px;
  background: transparent; color: var(--ink-2);
  font-size: 13px; font-weight: 500; cursor: pointer;
}
.picker__option:hover,
.picker__option.is-active { background: var(--surface-2); color: var(--ink); }
.picker__option.is-on { background: var(--accent); color: #fff; }
.picker__empty { margin: 4px 2px; font-size: 12px; color: var(--ink-4); }
```

> If a referenced token is missing (e.g. `--accent-tint`, `--shadow-m`, `--surface-2`),
> grep `src/styles.css` for the `:root`/`.app` token block and substitute the nearest
> existing token. The fallback in `box-shadow` already guards `--shadow-m`.

- [ ] **Step 2: Verify tokens resolve (build the styles)**

Run: `npm run typecheck`
Expected: no errors (CSS isn't typechecked, but this confirms nothing else broke).
Run: `npm run test:run -- src/components/ui/pickers/SearchSelect.test.tsx`
Expected: still PASS (CSS doesn't affect jsdom logic).

- [ ] **Step 3: Commit**

```bash
git add src/styles.css
git commit -m "style(pickers): scope-neutral .picker-* styles for SearchSelect"
```

> Visual verification of this block happens in Task 6 (run the app) — CSS can't be unit-tested.

---

## Task 4: Adopt `SearchSelect` in `CrmInteractionModal` (Sujet / Établissement / Acteur)

**Files:**
- Modify: `src/features/crm/CrmInteractionModal.tsx`
- Modify: `src/features/crm/CrmInteractionModal.test.tsx`

- [ ] **Step 1: Update the tests first (they currently drive `<select>` via fireEvent.change)**

In `src/features/crm/CrmInteractionModal.test.tsx`, add a small helper near the top (after the imports) to drive the new combobox:

```tsx
function pickFromCombobox(name: string | RegExp, optionName: string | RegExp) {
  fireEvent.click(screen.getByRole('combobox', { name }));
  fireEvent.click(screen.getByRole('option', { name: optionName }));
}
```

Then replace these three `<select>` interactions:

- Line ~59 (établissement débloque): replace
  `fireEvent.change(screen.getByLabelText('Contexte'), { target: { value: 'o2' } });`
  with
  `pickFromCombobox('Contexte', 'Restaurant B');`

- Line ~96 (titre pré-rempli depuis le sujet): replace
  `fireEvent.change(screen.getByLabelText('Sujet normalisé'), { target: { value: 'demande_de_visite' } });`
  with
  `pickFromCombobox('Sujet normalisé', 'Demande de visite');`

- Line ~104 (acteur ancré): replace
  `fireEvent.change(screen.getByLabelText('Acteur'), { target: { value: 'a1' } });`
  with
  `pickFromCombobox('Acteur', 'Mme Hoarau');`

Leave everything else (the `getByLabelText('Attribuer à')` assignee `<select>`, the
`queryByRole('option', { name: /général/i })` at line ~45 which still finds nothing while
the picker is closed, the submit/anchor assertions) unchanged.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:run -- src/features/crm/CrmInteractionModal.test.tsx`
Expected: FAIL — `Unable to find role="combobox"` (the component still renders `<select>`).

- [ ] **Step 3: Swap the three selects to `SearchSelect`**

In `src/features/crm/CrmInteractionModal.tsx`:

Add the import (with the other imports near the top):

```ts
import { SearchSelect } from '../../components/ui/pickers';
```

Replace the **Établissement** select (the `else` branch at lines ~164-175) — keep the
`<label className="crm-field">` wrapper and the `fixedContext` `if` branch untouched:

```tsx
        <label className="crm-field">
          Établissement
          {/* §66 — plus de « Contexte : général » : un établissement est requis. */}
          <SearchSelect
            aria-label="Contexte"
            value={ctx}
            options={(contexts ?? []).map((object) => ({ code: object.objectId, label: object.objectName }))}
            onChange={setCtx}
            placeholder="— Établissement —"
            searchPlaceholder="Rechercher un établissement…"
          />
        </label>
```

Replace the **Acteur (optionnel)** select (lines ~181-193):

```tsx
          <SearchSelect
            aria-label="Acteur"
            value={pickedActor}
            options={(actorOptions ?? []).map((actor) => ({ code: actor.actorId, label: actor.displayName }))}
            onChange={setPickedActor}
            allowClear
            clearLabel="— Aucun acteur —"
            placeholder="— Aucun acteur —"
            searchPlaceholder="Rechercher un acteur…"
          />
```

Replace the **Sujet** select (lines ~200-212):

```tsx
          <SearchSelect
            aria-label="Sujet normalisé"
            value={topicCode}
            options={topics.map((topic) => ({ code: topic.code, label: topic.name }))}
            onChange={setTopicCode}
            allowClear
            clearLabel="— Aucun sujet —"
            placeholder="— Sujet —"
            searchPlaceholder="Rechercher un sujet…"
          />
```

Leave the **Sentiment** select (lines ~216-229) and the **Attribuer à** assignee select
(lines ~279-291) as `<select className="crm-select">` — short lists, no change.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:run -- src/features/crm/CrmInteractionModal.test.tsx`
Expected: PASS (all existing scenarios green via the combobox helper).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/features/crm/CrmInteractionModal.tsx src/features/crm/CrmInteractionModal.test.tsx
git commit -m "feat(crm): SearchSelect for sujet/établissement/acteur in the interaction modal"
```

---

## Task 5: Adopt `SearchSelect` in `CrmTaskModal` (Établissement, both modes)

**Files:**
- Modify: `src/features/crm/CrmTaskModal.tsx`
- Modify: `src/features/crm/CrmTaches.test.tsx`
- Modify: `src/features/crm/CrmActorFiche.test.tsx`

Context: `CrmTaskModal` has two entry modes via the `picker` prop. Today `'select'` renders
a `<select>` and `'datalist'` renders a free-text `<input>` + `<datalist>` resolved by
**exact name match** (`CrmTaskModal.tsx:56`, with an "introuvable" hint at `:142`). Both
modes get the full `objectOptions`. We render `SearchSelect` in **both** modes and resolve
by `objectId` directly — removing the name-match fragility and the hint. The `picker` prop
is kept only to gate the **auto-select-when-single** initial state (select mode pre-selects
a lone establishment; datalist/Tâches lists the whole directory and must start empty).

- [ ] **Step 1: Update `CrmTaskModal.tsx` implementation**

In `src/features/crm/CrmTaskModal.tsx`:

Add the import:

```ts
import { SearchSelect } from '../../components/ui/pickers';
```

Remove the now-unused name-resolution state and logic:
- Delete `const [objectName, setObjectName] = useState('');` (line ~46).
- Replace `resolvedObject` (lines ~53-56) with a single id-based lookup (both modes now hold an id):

```ts
  const resolvedObject = objectOptions.find((object) => object.objectId === objectId) ?? null;
```

Replace the entire Établissement `<label>` block (lines ~109-141) — both the `select` and
`datalist` branches and the trailing `picker === 'datalist'` hint at lines ~142-144 — with:

```tsx
      <label className="crm-field">
        Établissement
        <SearchSelect
          aria-label="Établissement"
          value={objectId}
          options={objectOptions.map((object) => ({ code: object.objectId, label: object.objectName }))}
          onChange={setObjectId}
          placeholder="— Choisir un établissement —"
          searchPlaceholder="Rechercher un établissement…"
        />
      </label>
```

> The `picker` prop is still consumed by the `useState` initializer at lines ~43-45
> (auto-select when `picker === 'select'` and exactly one option) — leave that initializer
> as-is. The prop stays in the component signature.

Leave the **Attribuer à** assignee select (lines ~156-167) unchanged.

- [ ] **Step 2: Update `CrmTaches.test.tsx` (datalist/Tâches-tab entry)**

In `src/features/crm/CrmTaches.test.tsx`, add the same helper near the top:

```tsx
function pickEstablishment(optionName: string | RegExp) {
  fireEvent.click(screen.getByRole('combobox', { name: 'Établissement' }));
  fireEvent.click(screen.getByRole('option', { name: optionName }));
}
```

- Lines ~209 and ~231: replace
  `fireEvent.change(screen.getByLabelText('Établissement'), { target: { value: 'Hotel Basalte & Lagon' } });`
  with
  `pickEstablishment('Hotel Basalte & Lagon');`

- The "introuvable" test (lines ~245-247) tests free-text resolution that no longer exists.
  Replace that whole `it(...)` with a required-field test:

```tsx
  it('établissement requis : « Créer » désactivé tant qu’aucun établissement n’est choisi', () => {
    // (reuse this test's existing render/setup for the Tâches tab — open the « Nouvelle tâche » modal)
    fireEvent.change(screen.getByLabelText('Titre de la tâche'), { target: { value: 'Rappeler' } });
    expect(screen.getByRole('button', { name: /créer/i })).toBeDisabled();
    pickEstablishment('Hotel Basalte & Lagon');
    expect(screen.getByRole('button', { name: /créer/i })).toBeEnabled();
  });
```

> Match the surrounding test's setup (how it opens the modal and the exact title-field
> label). Keep the existing "crée une tâche" happy-path assertions; only the selection
> mechanism changes.

- [ ] **Step 3: Update `CrmActorFiche.test.tsx` (fiche-acteur entry, `picker='select'`)**

In `src/features/crm/CrmActorFiche.test.tsx`, the `CrmTaskModal` (select mode) is driven at
lines ~347, ~370, ~389 via `within(dialog).getByLabelText('Établissement')`.

- Lines ~347 and ~370: replace
  `fireEvent.change(within(dialog).getByLabelText('Établissement'), { target: { value: 'obj-2' } });`
  (and `'obj-1'`) with an open+click on the combobox. First read this file's fixture to find
  the `objectName` for `obj-1` / `obj-2` (search the test setup for where `objectOptions` /
  the linked establishments are defined), then:

```tsx
  fireEvent.click(within(dialog).getByRole('combobox', { name: 'Établissement' }));
  fireEvent.click(within(dialog).getByRole('option', { name: '<objectName for obj-2>' }));
```

- Line ~389: `expect(within(dialog).getByLabelText('Établissement')).toHaveValue('obj-1');`
  (asserts the single-establishment auto-select). Replace with a trigger-label assertion:

```tsx
  expect(within(dialog).getByRole('combobox', { name: 'Établissement' })).toHaveTextContent('<objectName for obj-1>');
```

> The `CrmAssignObjectModal` "Établissement à affecter" datalist (lines ~700-742) is a
> DIFFERENT control and is OUT of scope for this pass — do NOT change it. Verify your edits
> only touch the `getByLabelText('Établissement')` (exact, not "à affecter") call-sites.

- [ ] **Step 4: Run the affected tests to verify they fail then pass**

Run (expect FAIL first if you run before the impl edit, then PASS after Step 1 is in place):
```
npm run test:run -- src/features/crm/CrmTaskModal src/features/crm/CrmTaches.test.tsx src/features/crm/CrmActorFiche.test.tsx
```
Expected after Step 1-3: PASS. If a test queries by an `objectName` you guessed wrong, fix
the option name to the real fixture value.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors (confirm no dangling references to the removed `objectName` state).

- [ ] **Step 6: Commit**

```bash
git add src/features/crm/CrmTaskModal.tsx src/features/crm/CrmTaches.test.tsx src/features/crm/CrmActorFiche.test.tsx
git commit -m "feat(crm): SearchSelect for établissement in the task modal (drops name-match)"
```

---

## Task 6: Full verification + manual visual proof

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

Run: `npm run test:run`
Expected: the whole suite green (the prior CRM count + the new `fold`/`SearchSelect` specs).
If anything unrelated to pickers fails, it predates this work — note it, do not fix here.

- [ ] **Step 2: Typecheck the whole app**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Run the app and verify the pickers visually**

Start the dev server (`npm run dev`) and, via the preview tooling:
- Open CRM → a fiche acteur → **Nouvelle interaction**. Confirm Sujet / Établissement /
  Acteur render as the house picker (trigger + chevron), open a search panel, filter, and
  pick-and-close. Confirm pressing **Escape inside the open picker** closes only the picker,
  NOT the CRM modal.
- Open **Nouvelle tâche** (both from the fiche acteur and the Tâches tab) — Établissement is
  the searchable picker; a lone establishment is pre-selected from the fiche.
- Open the object editor → a section with `ChipMultiSelect` (e.g. « Choisir un cadre /
  environnement ») — confirm it is **visually unchanged**.
Capture a screenshot of the interaction modal as proof.

- [ ] **Step 4: Commit any visual-fix tweaks**

If the manual pass surfaced CSS tweaks, make them in `src/styles.css` and:

```bash
git add src/styles.css
git commit -m "style(pickers): visual tweaks after manual verification"
```

---

## Task 7: Decision log + memory

**Files:**
- Modify: `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md`
- Modify: `CLAUDE.md` (propose the invariant)

- [ ] **Step 1: Append a decision-log entry**

Add a new numbered section to `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md`
recording: the shared `src/components/ui/pickers` module; `SearchSelect` (single-select
searchable popover) + the global scope-neutral `.picker-*` CSS; the CRM adoption
(CrmInteractionModal sujet/établissement/acteur, CrmTaskModal établissement — name-match
dropped); short selects (sentiment/civilité/assigné) kept as `.crm-select`; and the
out-of-scope boundary (Explorer/Dashboard filters, grouped multi-selects,
CrmAssignObjectModal datalist, CrmFilterBar topic filter — deferred). Note the deferred
follow-up: re-home `ChipMultiSelect` into `ui/pickers` and de-scope `.cms` from
`.object-editor` if/when a CRM multi-select consumer appears.

- [ ] **Step 2: Propose the CLAUDE.md invariant**

Add (or propose in the response) a one-line rule under the documentation/UI section:
*New list-selection UIs use the shared `src/components/ui/pickers` primitives — `SearchSelect`
(single) and `ChipMultiSelect` (multi). Do not hand-roll a third select/chip vocabulary;
short fixed lists may stay native-`<select>` styled to the house tokens.*

- [ ] **Step 3: Commit**

```bash
git add "bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md" CLAUDE.md
git commit -m "docs(pickers): log shared picker module + CRM adoption decision"
```

---

## Self-Review (completed by plan author)

- **Spec coverage:** §3.1 SearchSelect → Task 2; §3.3 shared module/CSS → Tasks 1-3; §4 CRM
  adoption table → Tasks 4-5 (sentiment/civilité/assigné "keep" honoured — left untouched);
  §5 out-of-scope → respected (no editor/filter/grouped changes); §6 testing → Tasks 1,2,4,5;
  §7 verification → Task 6; §8 decision-log/memory → Task 7.
- **Placeholder scan:** the only intentional "read the fixture" instructions are in Task 5
  Step 3 (the `obj-1`/`obj-2` → objectName mapping lives in that test's fixtures and must be
  read, not invented) — flagged explicitly, not a hidden TODO.
- **Type consistency:** `SearchSelectOption { code, label }`, `SearchSelect` props
  (`value/options/onChange/placeholder/searchPlaceholder/allowClear/clearLabel/aria-label`),
  and `fold` signature are identical across the barrel, the component, and every call-site.
- **Scope:** single coherent plan (one new primitive + CRM adoption); no subsystem split
  needed.
