# Edit Pages by Type — Plan 1: Foundation & Shell — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the full-page object editor's foundation — a new route, the shell chrome (topbar / type ribbon / left nav / right rail scaffold / footer / save bar), a reusable primitives kit, the editor-state hook, and the global save loop — then prove the end-to-end pattern with 4 fully wired sections.

**Architecture:** A new `src/features/object-editor/` feature module. It reuses the existing workspace data layer unchanged (`useObjectWorkspaceQuery`, `saveObjectWorkspaceModule`, `ObjectWorkspaceResource`). Editor mutable state (`{ baseline, draft }` of `ObjectWorkspaceModules`) lives in a `useObjectEditorState` hook lifted from the logic currently embedded in `ObjectDrawerShell`. Sections are isolated components that read one `draft.<module>` slice and write through a typed updater. The drawer is left untouched in this plan — the new editor is reachable by URL only; cutover happens in Plan 4.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind + plain CSS, Zustand, TanStack Query, Jest + Testing Library (unit), Playwright (e2e).

**Reference design:** the `Edit Pages by Type.html` prototype and its `edit-*.jsx` files in the user-provided `Bertel.zip`. The design spec is `docs/superpowers/specs/2026-05-20-edit-pages-by-type-design.md`.

**Conventions:** test files are co-located `*.test.ts(x)`. Run a single test with `npx jest <path> -t "<name>"`. All commands run from `bertel-tourism-ui/`.

---

## File Structure

All new files under `bertel-tourism-ui/src/features/object-editor/` unless noted.

| File | Responsibility |
|---|---|
| `archetypes.ts` | 16-code → 6-archetype mapping, accent classes, archetype metadata. Shared with `ObjectDetailView`. |
| `editor-state.ts` | Pure helpers: `cloneModules`, `getDirtySections`, `isModuleDirty`, `MODULE_KEY_MAP`, `READONLY_MODULES`. Extracted from `ObjectDrawerShell`. |
| `useObjectEditorState.ts` | Hook owning `{ baseline, draft }`; exposes `draft`, `dirtySections`, `patchModule`, `replaceModule`, `resetModule`, `commitModules`. |
| `useEditorSave.ts` | Hook: batched save over dirty modules with per-module permission routing + partial-failure handling. |
| `section-config.ts` | The 22-section nav definition, groups, numbers, `makeSections(archetype)`. |
| `primitives/*` | `Field`, `Input`, `Textarea`, `Select`, `Chip`, `ChipSet`, `Toggle`, `StatCard`, `Fs`, `Repeater`, `LangTabs`, `index.ts`. Controlled, typed. |
| `shell/EditorTopbar.tsx` | Breadcrumb, title, type code, mode toggle, save status, action buttons. |
| `shell/TypeRibbon.tsx` | Accent band: codeName · family · covers. |
| `shell/EditorNav.tsx` | Grouped section nav with status dots + scroll-spy. |
| `shell/EditorRail.tsx` | Right-rail container (widget content lands in Plan 3). |
| `shell/EditorFooter.tsx` | Shortcut hints + footer actions. |
| `shell/SaveBar.tsx` | Sticky dirty-count + Enregistrer control. |
| `sections/SectionIdentity.tsx` | Section 01, wired to `generalInfo` + `taxonomy`. |
| `sections/SectionDescriptions.tsx` | Section 02, wired to `descriptions`. |
| `sections/SectionLocation.tsx` | Section 03, wired to `location`. |
| `sections/SectionContacts.tsx` | Section 04, wired to `contacts`. |
| `ObjectEditPage.tsx` | Orchestrator: fetch + state + shell + section slots. |
| `object-editor.css` | Layout + token CSS ported from the prototype's `edit-types.css`. |
| `src/app/(main)/objects/[objectId]/edit/page.tsx` | The route. |

---

## Task 1: Extract archetype identity into a shared module

The 16-code→archetype mapping currently lives inline in `ObjectDetailView.tsx:80-195`. Move it so both detail and editor share one source of truth.

**Files:**
- Create: `src/features/object-editor/archetypes.ts`
- Create: `src/features/object-editor/archetypes.test.ts`
- Modify: `src/features/object-drawer/ObjectDetailView.tsx` (lines 80-195 region — remove the local copy, import instead)

- [ ] **Step 1: Write the failing test**

```ts
// src/features/object-editor/archetypes.test.ts
import { getArchetypeMeta, TYPE_ARCHETYPES } from './archetypes';

describe('getArchetypeMeta', () => {
  it('maps accommodation codes to the HEB archetype with the teal accent', () => {
    expect(getArchetypeMeta('HOT')?.archetype).toBe('HEB');
    expect(getArchetypeMeta('CAMP')?.accent).toBe('acc-teal');
  });

  it('maps every itinerary code to ITI', () => {
    expect(getArchetypeMeta('ITI')?.archetype).toBe('ITI');
    expect(getArchetypeMeta('FMA')?.archetype).toBe('ITI');
  });

  it('is case-insensitive', () => {
    expect(getArchetypeMeta('hot')?.archetype).toBe('HEB');
  });

  it('returns null for an unknown code', () => {
    expect(getArchetypeMeta('ZZZ')).toBeNull();
    expect(getArchetypeMeta('')).toBeNull();
  });

  it('covers all 16 known codes', () => {
    expect(Object.keys(TYPE_ARCHETYPES)).toHaveLength(16);
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npx jest src/features/object-editor/archetypes.test.ts`
Expected: FAIL — `Cannot find module './archetypes'`.

- [ ] **Step 3: Create `archetypes.ts`**

Move the block from `ObjectDetailView.tsx` verbatim. Final content:

```ts
// src/features/object-editor/archetypes.ts

export type ArchetypeCode = 'HEB' | 'RES' | 'ASC' | 'ITI' | 'VIS' | 'SRV';

export type DetailAccentClass =
  | 'acc-teal' | 'acc-orange' | 'acc-blue' | 'acc-green' | 'acc-plum' | 'acc-rust';

export interface ArchetypeMeta {
  archetype: ArchetypeCode;
  accent: DetailAccentClass;
  codeName: string;
  family: string;
  covers: string;
}

export const TYPE_LABEL: Record<string, string> = {
  HOT: 'Hotel', HPA: 'Hebergement plein air', HLO: 'Hebergement loisir',
  CAMP: 'Camping', RVA: 'Residence vacances', RES: 'Restaurant',
  ITI: 'Itineraire', FMA: 'Itineraire', ASC: 'Activite', LOI: 'Loisir',
  PCU: 'Patrimoine', PNA: 'Site naturel', PSV: 'Prestataire', SRV: 'Service',
  VIL: 'Ville', COM: 'Commerce',
};

const HEB_ARCHETYPE: ArchetypeMeta = {
  archetype: 'HEB', accent: 'acc-teal', codeName: 'Hébergement marchand',
  family: 'Hôtel · Hébergement loisir · Camping · Résidence',
  covers: 'HOT · HPA · HLO · CAMP · RVA',
};
const RES_ARCHETYPE: ArchetypeMeta = {
  archetype: 'RES', accent: 'acc-orange', codeName: 'Restaurant',
  family: 'Restauration · Bar · Snack', covers: 'RES',
};
const ASC_ARCHETYPE: ArchetypeMeta = {
  archetype: 'ASC', accent: 'acc-blue', codeName: 'Activité sportive & culturelle',
  family: 'Activité encadrée · Stage · Initiation', covers: 'ASC',
};
const ITI_ARCHETYPE: ArchetypeMeta = {
  archetype: 'ITI', accent: 'acc-green', codeName: 'Itinéraire',
  family: 'Randonnée · Trail · VTT · Boucle', covers: 'ITI · FMA',
};
const VIS_ARCHETYPE: ArchetypeMeta = {
  archetype: 'VIS', accent: 'acc-plum', codeName: 'Site & visite',
  family: 'Patrimoine · Loisir · Site naturel', covers: 'LOI · PCU · PNA',
};
const SRV_ARCHETYPE: ArchetypeMeta = {
  archetype: 'SRV', accent: 'acc-rust', codeName: 'Service & commerce',
  family: 'OT · Commerce · Service · Ville', covers: 'PSV · SRV · COM · VIL',
};

export const TYPE_ARCHETYPES: Record<string, ArchetypeMeta> = {
  HOT: HEB_ARCHETYPE, HPA: HEB_ARCHETYPE, HLO: HEB_ARCHETYPE,
  CAMP: HEB_ARCHETYPE, RVA: HEB_ARCHETYPE,
  RES: RES_ARCHETYPE, ASC: ASC_ARCHETYPE,
  ITI: ITI_ARCHETYPE, FMA: ITI_ARCHETYPE,
  LOI: VIS_ARCHETYPE, PCU: VIS_ARCHETYPE, PNA: VIS_ARCHETYPE,
  PSV: SRV_ARCHETYPE, SRV: SRV_ARCHETYPE, VIL: SRV_ARCHETYPE, COM: SRV_ARCHETYPE,
};

export function getArchetypeMeta(typeCode: string | null | undefined): ArchetypeMeta | null {
  if (!typeCode) return null;
  return TYPE_ARCHETYPES[typeCode.toUpperCase()] ?? null;
}
```

- [ ] **Step 4: Refactor `ObjectDetailView.tsx` to import from the shared module**

In `ObjectDetailView.tsx`, delete the local declarations of `TYPE_LABEL`, `DetailAccentClass`, `ArchetypeMeta`, the six `*_ARCHETYPE` consts, `TYPE_ARCHETYPES`, and `getArchetypeMeta` (lines ~88-195). Add at the top with the other imports:

```ts
import { getArchetypeMeta, TYPE_LABEL, type ArchetypeMeta, type DetailAccentClass } from '../object-editor/archetypes';
```

Keep the `ACCOMMODATION_TYPES`/`RESTAURANT_TYPES`/etc. `Set`s — they are still used locally by detail-only logic.

- [ ] **Step 5: Run tests + type-check, verify pass**

Run: `npx jest src/features/object-editor/archetypes.test.ts && npx tsc --noEmit -p tsconfig.json`
Expected: test suite PASS; `tsc` reports no errors.

- [ ] **Step 6: Commit**

```bash
git add src/features/object-editor/archetypes.ts src/features/object-editor/archetypes.test.ts src/features/object-drawer/ObjectDetailView.tsx
git commit -m "refactor(ui): extract archetype mapping into shared object-editor module"
```

---

## Task 2: Extract editor-state helpers

Move the pure snapshot/dirty helpers out of `ObjectDrawerShell.tsx` so both the drawer and the new editor share them.

**Files:**
- Create: `src/features/object-editor/editor-state.ts`
- Create: `src/features/object-editor/editor-state.test.ts`
- Modify: `src/features/object-drawer/ObjectDrawerShell.tsx` (remove local copies, import instead)

- [ ] **Step 1: Write the failing test**

```ts
// src/features/object-editor/editor-state.test.ts
import { cloneModules, isModuleDirty, getDirtySections } from './editor-state';
import type { ObjectWorkspaceModules } from '../../services/object-workspace-parser';

function fixtureModules(): ObjectWorkspaceModules {
  // Minimal: only the fields the helpers read. Cast through unknown — the helpers
  // serialize generically and never inspect module shape.
  return {
    generalInfo: { name: 'A', commercialVisibility: 'full' },
    taxonomy: { assignments: [] },
    contacts: { objectItems: [] },
  } as unknown as ObjectWorkspaceModules;
}

describe('editor-state helpers', () => {
  it('cloneModules produces a deep, independent copy', () => {
    const base = fixtureModules();
    const copy = cloneModules(base);
    expect(copy).toEqual(base);
    expect(copy).not.toBe(base);
    expect(copy.contacts).not.toBe(base.contacts);
  });

  it('isModuleDirty is false for equal modules, true after a change', () => {
    const baseline = fixtureModules();
    const draft = cloneModules(baseline);
    const snapshot = { objectId: 'o1', baseline, draft };
    expect(isModuleDirty(snapshot, 'contacts')).toBe(false);
    (draft.contacts as { objectItems: unknown[] }).objectItems.push({});
    expect(isModuleDirty(snapshot, 'contacts')).toBe(true);
  });

  it('getDirtySections flags exactly the changed modules', () => {
    const baseline = fixtureModules();
    const draft = cloneModules(baseline);
    (draft.contacts as { objectItems: unknown[] }).objectItems.push({});
    const dirty = getDirtySections({ objectId: 'o1', baseline, draft });
    expect(dirty.contacts).toBe(true);
    expect(dirty.location).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npx jest src/features/object-editor/editor-state.test.ts`
Expected: FAIL — `Cannot find module './editor-state'`.

- [ ] **Step 3: Create `editor-state.ts`**

Move these from `ObjectDrawerShell.tsx` verbatim: `EditorSnapshot` interface, `MODULE_KEY_MAP`, `READONLY_MODULES`, `cloneModules`, `serialize`, `stripGeneralInfoManagedOutsideObject`, `isModuleDirty`, `isGeneralInfoContentDirty`, `isPublicationSettingsDirty`, `getDirtySections`. Export each. The file imports `ObjectWorkspaceModules`, `ObjectWorkspaceGeneralInfo` from `../../services/object-workspace-parser` and `WorkspaceModuleId` from `../../services/object-workspace`. Keep the implementations exactly as they currently are in `ObjectDrawerShell.tsx` — this is a move, not a rewrite.

- [ ] **Step 4: Refactor `ObjectDrawerShell.tsx` to import from `editor-state.ts`**

Delete the moved declarations from `ObjectDrawerShell.tsx`. Add:

```ts
import {
  type EditorSnapshot, MODULE_KEY_MAP, READONLY_MODULES, cloneModules,
  isModuleDirty, isGeneralInfoContentDirty, isPublicationSettingsDirty, getDirtySections,
} from '../object-editor/editor-state';
```

Leave all other `ObjectDrawerShell` logic untouched.

- [ ] **Step 5: Run tests + type-check + the existing drawer test, verify pass**

Run: `npx jest src/features/object-editor/editor-state.test.ts src/components/editor/ObjectDrawer.test.tsx && npx tsc --noEmit -p tsconfig.json`
Expected: both suites PASS; `tsc` clean. (The drawer test confirms the move did not break the drawer.)

- [ ] **Step 6: Commit**

```bash
git add src/features/object-editor/editor-state.ts src/features/object-editor/editor-state.test.ts src/features/object-drawer/ObjectDrawerShell.tsx
git commit -m "refactor(ui): extract editor-state helpers shared by drawer and editor"
```

---

## Task 3: `useObjectEditorState` hook

Owns the mutable `{ baseline, draft }` snapshot for the editor page.

**Files:**
- Create: `src/features/object-editor/useObjectEditorState.ts`
- Create: `src/features/object-editor/useObjectEditorState.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/features/object-editor/useObjectEditorState.test.tsx
import { renderHook, act } from '@testing-library/react';
import { useObjectEditorState } from './useObjectEditorState';
import type { ObjectWorkspaceModules } from '../../services/object-workspace-parser';

function fixtureModules(): ObjectWorkspaceModules {
  return {
    contacts: { objectItems: [] },
    location: { main: { addressLine1: 'x' } },
  } as unknown as ObjectWorkspaceModules;
}

describe('useObjectEditorState', () => {
  it('starts clean with draft equal to baseline', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fixtureModules()));
    expect(result.current.isDirty).toBe(false);
    expect(result.current.dirtySections.contacts).toBe(false);
  });

  it('replaceModule marks that module dirty', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fixtureModules()));
    act(() => {
      result.current.replaceModule('contacts', { objectItems: [{ id: 'c1' }] } as never);
    });
    expect(result.current.dirtySections.contacts).toBe(true);
    expect(result.current.isDirty).toBe(true);
  });

  it('resetModule reverts the draft slice to baseline', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fixtureModules()));
    act(() => result.current.replaceModule('contacts', { objectItems: [{ id: 'c1' }] } as never));
    act(() => result.current.resetModule('contacts'));
    expect(result.current.dirtySections.contacts).toBe(false);
  });

  it('commitModules folds the draft into the baseline so it reads clean', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fixtureModules()));
    act(() => result.current.replaceModule('contacts', { objectItems: [{ id: 'c1' }] } as never));
    act(() => result.current.commitModules(['contacts']));
    expect(result.current.dirtySections.contacts).toBe(false);
    expect(result.current.draft.contacts).toEqual({ objectItems: [{ id: 'c1' }] });
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npx jest src/features/object-editor/useObjectEditorState.test.tsx`
Expected: FAIL — `Cannot find module './useObjectEditorState'`.

- [ ] **Step 3: Implement the hook**

```ts
// src/features/object-editor/useObjectEditorState.ts
import { useCallback, useMemo, useState } from 'react';
import type { ObjectWorkspaceModules } from '../../services/object-workspace-parser';
import type { WorkspaceModuleId } from '../../services/object-workspace';
import { cloneModules, getDirtySections, MODULE_KEY_MAP, type EditorSnapshot } from './editor-state';

export interface ObjectEditorState {
  draft: ObjectWorkspaceModules;
  dirtySections: Partial<Record<WorkspaceModuleId, boolean>>;
  isDirty: boolean;
  patchModule: <K extends keyof ObjectWorkspaceModules>(key: K, patch: Partial<ObjectWorkspaceModules[K]>) => void;
  replaceModule: <K extends keyof ObjectWorkspaceModules>(key: K, value: ObjectWorkspaceModules[K]) => void;
  resetModule: (key: keyof ObjectWorkspaceModules) => void;
  commitModules: (keys: (keyof ObjectWorkspaceModules)[]) => void;
}

export function useObjectEditorState(objectId: string, modules: ObjectWorkspaceModules): ObjectEditorState {
  const [snapshot, setSnapshot] = useState<EditorSnapshot>(() => ({
    objectId,
    baseline: cloneModules(modules),
    draft: cloneModules(modules),
  }));

  const replaceModule = useCallback(<K extends keyof ObjectWorkspaceModules>(key: K, value: ObjectWorkspaceModules[K]) => {
    setSnapshot((prev) => ({ ...prev, draft: { ...prev.draft, [key]: value } }));
  }, []);

  const patchModule = useCallback(<K extends keyof ObjectWorkspaceModules>(key: K, patch: Partial<ObjectWorkspaceModules[K]>) => {
    setSnapshot((prev) => ({ ...prev, draft: { ...prev.draft, [key]: { ...prev.draft[key], ...patch } } }));
  }, []);

  const resetModule = useCallback((key: keyof ObjectWorkspaceModules) => {
    setSnapshot((prev) => ({ ...prev, draft: { ...prev.draft, [key]: cloneModules(prev.baseline)[key] } }));
  }, []);

  const commitModules = useCallback((keys: (keyof ObjectWorkspaceModules)[]) => {
    setSnapshot((prev) => {
      const baseline = { ...prev.baseline };
      const draftClone = cloneModules(prev.draft);
      for (const key of keys) baseline[key] = draftClone[key];
      return { ...prev, baseline };
    });
  }, []);

  const dirtySections = useMemo(() => getDirtySections(snapshot), [snapshot]);
  const isDirty = useMemo(() => Object.values(dirtySections).some(Boolean), [dirtySections]);

  return { draft: snapshot.draft, dirtySections, isDirty, patchModule, replaceModule, resetModule, commitModules };
}
```

Note for the implementer: `MODULE_KEY_MAP` is imported only to keep the dependency explicit for later tasks; if lint flags it as unused, remove the import — Plan 2 reintroduces it.

- [ ] **Step 4: Run the test, verify it passes**

Run: `npx jest src/features/object-editor/useObjectEditorState.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/object-editor/useObjectEditorState.ts src/features/object-editor/useObjectEditorState.test.tsx
git commit -m "feat(ui): add useObjectEditorState hook for the full-page editor"
```

---

## Task 4: Primitives kit

The controlled, typed form primitives every section uses. Port from the prototype's `edit-primitives.jsx` (`Field`, `Input`, `Textarea`, `Select`, `Chip`, `ChipSet`, `Toggle`, `StatCard`, `Fs`) plus a `Repeater` (the prototype's repeated `.rep-row` pattern) and `LangTabs` (the prototype's `.lang-tabs`). **Transformation rule:** every prototype input is uncontrolled (`defaultValue`); each TS primitive is **controlled** — `value` + `onChange`. Class names are preserved (`.input`, `.field`, `.chip`, `.fs`, etc.) so the ported CSS in Task 5 applies.

**Files:**
- Create: `src/features/object-editor/primitives/Field.tsx`, `Input.tsx`, `Textarea.tsx`, `Select.tsx`, `Chip.tsx`, `Toggle.tsx`, `StatCard.tsx`, `Fs.tsx`, `Repeater.tsx`, `LangTabs.tsx`, `index.ts`
- Create: `src/features/object-editor/primitives/primitives.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/features/object-editor/primitives/primitives.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { Input, Textarea, Toggle, Chip, Fs } from './index';

describe('editor primitives', () => {
  it('Input is controlled — fires onChange with the new value', () => {
    const onChange = jest.fn();
    render(<Input value="hi" onChange={onChange} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'hello' } });
    expect(onChange).toHaveBeenCalledWith('hello');
  });

  it('Textarea reports a character count when count is provided', () => {
    render(<Textarea value="abc" onChange={() => {}} count max={160} />);
    expect(screen.getByText(/3 \/ 160/)).toBeInTheDocument();
  });

  it('Toggle fires onChange with the negated value when clicked', () => {
    const onChange = jest.fn();
    render(<Toggle label="Animaux" on={false} onChange={onChange} />);
    fireEvent.click(screen.getByText('Animaux'));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('Chip applies the is-on class when selected', () => {
    const { container } = render(<Chip label="CB" on />);
    expect(container.querySelector('.chip.is-on')).not.toBeNull();
  });

  it('Fs collapses its body when folded', () => {
    render(<Fs num="01" title="Identité" folded><p>body</p></Fs>);
    expect(screen.queryByText('body')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npx jest src/features/object-editor/primitives/primitives.test.tsx`
Expected: FAIL — `Cannot find module './index'`.

- [ ] **Step 3: Implement the primitives**

Each file is a small controlled component. Implement all of them; representative full code:

```tsx
// src/features/object-editor/primitives/Input.tsx
interface InputProps {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  mono?: boolean;
  lg?: boolean;
  readOnly?: boolean;
}
export function Input({ value, onChange, placeholder, prefix, suffix, mono, lg, readOnly }: InputProps) {
  const cls = `input${mono ? ' mono' : ''}${lg ? ' lg' : ''}${prefix ? ' has-prefix' : ''}${suffix ? ' has-suffix' : ''}`;
  const field = (
    <input className={cls} value={value} placeholder={placeholder} readOnly={readOnly}
           onChange={(e) => onChange(e.target.value)} />
  );
  if (!prefix && !suffix) return field;
  return (
    <div className="input-wrap">
      {prefix && <span className="prefix">{prefix}</span>}
      {field}
      {suffix && <span className="suffix">{suffix}</span>}
    </div>
  );
}
```

```tsx
// src/features/object-editor/primitives/Textarea.tsx
interface TextareaProps {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  rows?: number;
  rich?: boolean;
  count?: boolean;
  max?: number;
}
export function Textarea({ value, onChange, placeholder, rows, rich, count, max = 300 }: TextareaProps) {
  const len = value?.length ?? 0;
  return (
    <>
      <textarea className={`textarea${rich ? ' rich' : ''}`} value={value} placeholder={placeholder}
                style={rows ? { minHeight: rows * 18 } : undefined}
                onChange={(e) => onChange(e.target.value)} />
      {count && <div className={`char-count${len > max ? ' over' : ''}`}>{len} / {max} caractères</div>}
    </>
  );
}
```

```tsx
// src/features/object-editor/primitives/Toggle.tsx
interface ToggleProps {
  label: string;
  sub?: string;
  on: boolean;
  onChange: (next: boolean) => void;
}
export function Toggle({ label, sub, on, onChange }: ToggleProps) {
  return (
    <button type="button" className={`tog${on ? ' is-on' : ''}`} onClick={() => onChange(!on)}>
      <div>{label}{sub && <small>{sub}</small>}</div>
      <span className="tog__sw" />
    </button>
  );
}
```

```tsx
// src/features/object-editor/primitives/Field.tsx
interface FieldProps {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}
export function Field({ label, hint, required, children }: FieldProps) {
  return (
    <div className="field">
      <div className="field__label">
        <span>{label}{required && <span className="req"> *</span>}</span>
        {hint && <span className="help" title={hint}>?</span>}
      </div>
      {children}
    </div>
  );
}
```

```tsx
// src/features/object-editor/primitives/Select.tsx
export interface SelectOption { v: string; l: string; }
interface SelectProps {
  value: string;
  options: (string | SelectOption)[];
  onChange: (next: string) => void;
}
export function Select({ value, options, onChange }: SelectProps) {
  return (
    <select className="select" value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o, i) => {
        const v = typeof o === 'string' ? o : o.v;
        const l = typeof o === 'string' ? o : o.l;
        return <option key={i} value={v}>{l}</option>;
      })}
    </select>
  );
}
```

```tsx
// src/features/object-editor/primitives/Chip.tsx
interface ChipProps {
  label: string;
  on?: boolean;
  sm?: boolean;
  onClick?: () => void;
}
export function Chip({ label, on, sm, onClick }: ChipProps) {
  return (
    <button type="button" className={`chip${on ? ' is-on' : ''}${sm ? ' size-sm' : ''}`}
            onClick={onClick} disabled={!onClick}>
      {label}
    </button>
  );
}

interface ChipSetProps { children: React.ReactNode; }
export function ChipSet({ children }: ChipSetProps) {
  return <div className="chip-set">{children}</div>;
}
```

```tsx
// src/features/object-editor/primitives/StatCard.tsx
interface StatCardProps {
  label: string;
  value: string;
  suffix?: string;
}
export function StatCard({ label, value, suffix }: StatCardProps) {
  return (
    <div className="stat-card">
      <div className="stat-card__label">{label}</div>
      <div className="stat-card__row">
        <span className="stat-card__value">{value}{suffix && <small className="stat-card__suffix"> {suffix}</small>}</span>
      </div>
    </div>
  );
}
```

```tsx
// src/features/object-editor/primitives/Fs.tsx
import { useState } from 'react';
interface FsProps {
  num: string;
  title: string;
  sub?: string;
  pill?: { tone?: 'ok' | 'warn' | 'req'; label: string };
  folded?: boolean;
  children: React.ReactNode;
}
export function Fs({ num, title, sub, pill, folded = false, children }: FsProps) {
  const [open, setOpen] = useState(!folded);
  return (
    <section className="fs" id={`section-${num}`} data-section={num}>
      <div className="fs__head" onClick={() => setOpen((v) => !v)}>
        <span className="fs__num">{num}</span>
        <h3>{title}{sub && <small>{sub}</small>}</h3>
        <div className="meta">
          {pill && <span className={`fs-pill ${pill.tone ?? 'ok'}`}>{pill.label}</span>}
        </div>
      </div>
      {open && <div className="fs__body">{children}</div>}
    </section>
  );
}
```

```tsx
// src/features/object-editor/primitives/Repeater.tsx
interface RepeaterProps<T> {
  items: T[];
  getKey: (item: T, index: number) => string;
  columns: string;
  renderRow: (item: T, index: number) => React.ReactNode;
  addLabel: string;
  onAdd: () => void;
}
export function Repeater<T>({ items, getKey, columns, renderRow, addLabel, onAdd }: RepeaterProps<T>) {
  return (
    <>
      <div className="repeater">
        {items.map((item, i) => (
          <div key={getKey(item, i)} className="rep-row" style={{ gridTemplateColumns: columns }}>
            {renderRow(item, i)}
          </div>
        ))}
      </div>
      <button type="button" className="rep-add" onClick={onAdd}>+ {addLabel}</button>
    </>
  );
}
```

```tsx
// src/features/object-editor/primitives/LangTabs.tsx
export interface LangTabDef { code: string; label: string; filled: boolean; }
interface LangTabsProps {
  tabs: LangTabDef[];
  active: string;
  onSelect: (code: string) => void;
}
export function LangTabs({ tabs, active, onSelect }: LangTabsProps) {
  return (
    <div className="lang-tabs">
      {tabs.map((t) => (
        <button key={t.code} type="button" className={active === t.code ? 'is-on' : ''}
                onClick={() => onSelect(t.code)}>
          {t.code.slice(0, 2).toUpperCase()}
          <span className={t.filled ? 'ok' : 'miss'}>{t.filled ? '●' : '○'}</span>
        </button>
      ))}
    </div>
  );
}
```

```ts
// src/features/object-editor/primitives/index.ts
export { Field } from './Field';
export { Input } from './Input';
export { Textarea } from './Textarea';
export { Select, type SelectOption } from './Select';
export { Chip, ChipSet } from './Chip';
export { Toggle } from './Toggle';
export { StatCard } from './StatCard';
export { Fs } from './Fs';
export { Repeater } from './Repeater';
export { LangTabs, type LangTabDef } from './LangTabs';
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npx jest src/features/object-editor/primitives/primitives.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/object-editor/primitives
git commit -m "feat(ui): add controlled primitives kit for the full-page editor"
```

---

## Task 5: `object-editor.css` foundation

Port the layout, token, and primitive CSS from the prototype's `edit-types.css` into the app. Reuse the accent variables already defined by the `acc-*` classes in `styles.css` (the detail-pages port). This task has no unit test — it is verified visually by the smoke test in Task 12 and by `next build`.

**Files:**
- Create: `src/features/object-editor/object-editor.css`
- Modify: `src/app/(main)/objects/[objectId]/edit/page.tsx` — created in Task 11, which imports this CSS. (No edit here; the import is added in Task 11.)

- [ ] **Step 1: Create `object-editor.css`**

Port from `edit-types.css` the rules for: `.edit-flat`, `.edit-top`, `.type-ribbon`, `.edit-body`, `.edit-nav`, `.edit-main`, `.edit-side`, `.edit-footer`, `.fs`, `.fs__head`, `.fs__num`, `.fs__body`, `.fs-pill`, `.field`, `.field__label`, `.input`, `.input-wrap`, `.textarea`, `.select`, `.chip`, `.chip-set`, `.tog`, `.tog__sw`, `.stat-card`, `.repeater`, `.rep-row`, `.rep-add`, `.lang-tabs`, `.char-count`, `.grid-2`, `.grid-3`, `.grid-4`, `.grid-2-1`, `.grid-1-2`. Scope every selector under a root class `.object-editor` to avoid leaking into the rest of the app (e.g. `.object-editor .fs { ... }`). Keep the prototype's CSS-variable names (`--accent`, `--ink`, etc.) but map them, at the top of the file, to the app's existing tokens where equivalents exist; declare the rest under `.object-editor`.

- [ ] **Step 2: Verify it parses**

Run: `npx stylelint src/features/object-editor/object-editor.css` if stylelint is configured; otherwise skip — it is exercised by `next build` in Task 12.
Expected: no syntax errors.

- [ ] **Step 3: Commit**

```bash
git add src/features/object-editor/object-editor.css
git commit -m "feat(ui): add object-editor css foundation ported from the prototype"
```

---

## Task 6: Section nav configuration

The 22-section definition driving the left nav and the main column order. Port from `edit-types.jsx` `makeSections` (its `TYPE_BLOCK_LABEL` + the grouped list).

**Files:**
- Create: `src/features/object-editor/section-config.ts`
- Create: `src/features/object-editor/section-config.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/features/object-editor/section-config.test.ts
import { makeSections } from './section-config';

describe('makeSections', () => {
  it('produces 22 sections for ITI (includes section 16 Lieux & étapes)', () => {
    const flat = makeSections('ITI').flatMap((g) => g.items);
    expect(flat).toHaveLength(22);
    expect(flat.some((s) => s.num === '16')).toBe(true);
  });

  it('omits section 16 for HEB', () => {
    const flat = makeSections('HEB').flatMap((g) => g.items);
    expect(flat).toHaveLength(21);
    expect(flat.some((s) => s.num === '16')).toBe(false);
  });

  it('labels section 05 per archetype', () => {
    const heb = makeSections('HEB').flatMap((g) => g.items).find((s) => s.num === '05');
    const res = makeSections('RES').flatMap((g) => g.items).find((s) => s.num === '05');
    expect(heb?.label).toBe('Chambres & séminaire');
    expect(res?.label).toBe('Cuisine & service');
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npx jest src/features/object-editor/section-config.test.ts`
Expected: FAIL — `Cannot find module './section-config'`.

- [ ] **Step 3: Implement `section-config.ts`**

```ts
// src/features/object-editor/section-config.ts
import type { ArchetypeCode } from './archetypes';

export interface SectionItem {
  num: string;
  label: string;
}
export interface SectionGroup {
  group: string;
  items: SectionItem[];
}

const TYPE_BLOCK_LABEL: Record<ArchetypeCode, string> = {
  HEB: 'Chambres & séminaire',
  RES: 'Cuisine & service',
  ASC: 'Formules & saison',
  ITI: 'Tracé & étapes',
  VIS: 'Visite & médiation',
  SRV: 'Prestations & zone',
};

export function makeSections(archetype: ArchetypeCode): SectionGroup[] {
  const hasPlaces = archetype === 'ITI' || archetype === 'VIS';
  return [
    { group: 'Identité', items: [
      { num: '01', label: 'Identité & taxonomie' },
      { num: '02', label: 'Descriptions' },
      { num: '03', label: 'Localisation' },
      { num: '04', label: 'Contacts' },
    ]},
    { group: 'Caractéristiques', items: [
      { num: '05', label: TYPE_BLOCK_LABEL[archetype] },
      { num: '06', label: 'Médias' },
      { num: '07', label: 'Capacité & cadre' },
      { num: '08', label: 'Classifications' },
      { num: '09', label: 'Tags & étiquettes' },
      { num: '10', label: 'Accessibilité' },
      { num: '11', label: 'Démarche durable' },
      { num: '12', label: 'Paiements & langues' },
    ]},
    { group: 'Tarifs & ouverture', items: [
      { num: '13', label: 'Tarifs & extras' },
      { num: '14', label: "Périodes d'ouverture" },
    ]},
    { group: 'Liens & territoire', items: [
      { num: '15', label: 'Liens vers fiches' },
      ...(hasPlaces ? [{ num: '16', label: archetype === 'ITI' ? 'Lieux & étapes' : 'Sous-lieux' }] : []),
      { num: '17', label: 'Rattachements' },
    ]},
    { group: 'Gestion', items: [
      { num: '18', label: 'Fournisseur' },
      { num: '19', label: 'Suivi prestataire' },
      { num: '20', label: 'Distribution' },
      { num: '21', label: 'Publication' },
      { num: '22', label: 'Identifiants externes' },
    ]},
  ];
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npx jest src/features/object-editor/section-config.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/object-editor/section-config.ts src/features/object-editor/section-config.test.ts
git commit -m "feat(ui): add editor section nav configuration"
```

---

## Task 7: Shell — `TypeRibbon` and `EditorTopbar`

**Files:**
- Create: `src/features/object-editor/shell/TypeRibbon.tsx`
- Create: `src/features/object-editor/shell/EditorTopbar.tsx`
- Create: `src/features/object-editor/shell/EditorTopbar.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/features/object-editor/shell/EditorTopbar.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { EditorTopbar } from './EditorTopbar';

const baseProps = {
  objectName: 'Domaine du Bel Air',
  typeCode: 'HOT',
  archetypeCodeName: 'Hébergement marchand',
  mode: 'complet' as const,
  dirtyCount: 0,
  onModeChange: jest.fn(),
  onPreview: jest.fn(),
  onCancel: jest.fn(),
  onPublish: jest.fn(),
};

describe('EditorTopbar', () => {
  it('renders the object name and type code', () => {
    render(<EditorTopbar {...baseProps} />);
    expect(screen.getByText('Domaine du Bel Air')).toBeInTheDocument();
    expect(screen.getByText('HOT')).toBeInTheDocument();
  });

  it('fires onModeChange when the other mode is clicked', () => {
    const onModeChange = jest.fn();
    render(<EditorTopbar {...baseProps} onModeChange={onModeChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Rapide/ }));
    expect(onModeChange).toHaveBeenCalledWith('rapide');
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npx jest src/features/object-editor/shell/EditorTopbar.test.tsx`
Expected: FAIL — `Cannot find module './EditorTopbar'`.

- [ ] **Step 3: Implement `TypeRibbon.tsx`**

```tsx
// src/features/object-editor/shell/TypeRibbon.tsx
import type { ArchetypeMeta } from '../archetypes';
export function TypeRibbon({ meta }: { meta: ArchetypeMeta }) {
  return (
    <div className={`type-ribbon ${meta.accent}`}>
      <span className="blob" />
      <span><strong>{meta.codeName}</strong> · {meta.family}</span>
      <span className="meta">{meta.covers}</span>
    </div>
  );
}
```

- [ ] **Step 4: Implement `EditorTopbar.tsx`**

```tsx
// src/features/object-editor/shell/EditorTopbar.tsx
export type EditorMode = 'rapide' | 'complet';

interface EditorTopbarProps {
  objectName: string;
  typeCode: string;
  archetypeCodeName: string;
  mode: EditorMode;
  dirtyCount: number;
  onModeChange: (mode: EditorMode) => void;
  onPreview: () => void;
  onCancel: () => void;
  onPublish: () => void;
}

export function EditorTopbar({
  objectName, typeCode, archetypeCodeName, mode, dirtyCount,
  onModeChange, onPreview, onCancel, onPublish,
}: EditorTopbarProps) {
  return (
    <div className="edit-top">
      <div className="edit-top__left">
        <div>
          <div className="edit-top__crumbs">
            Explorer <span className="sep">›</span>
            <strong>{archetypeCodeName}</strong> <span className="sep">›</span>
            {objectName} <span className="sep">›</span>
            <strong>Modifier</strong>
          </div>
          <div className="edit-top__title">
            {objectName}
            <span className="edit-top__code">{typeCode}</span>
          </div>
        </div>
      </div>
      <div className="edit-top__right">
        <div className="mode-tog">
          <button type="button" className={mode === 'rapide' ? 'is-on' : ''}
                  onClick={() => onModeChange('rapide')}>Rapide</button>
          <button type="button" className={mode === 'complet' ? 'is-on' : ''}
                  onClick={() => onModeChange('complet')}>Complet</button>
        </div>
        <span className="edit-top__save">
          {dirtyCount > 0 ? `${dirtyCount} modification${dirtyCount > 1 ? 's' : ''} non enregistrée${dirtyCount > 1 ? 's' : ''}` : 'À jour'}
        </span>
        <button type="button" className="btn sm" onClick={onPreview}>Aperçu fiche</button>
        <button type="button" className="btn" onClick={onCancel}>Annuler</button>
        <button type="button" className="btn primary" onClick={onPublish}>Publier les modifs</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run the test, verify it passes**

Run: `npx jest src/features/object-editor/shell/EditorTopbar.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add src/features/object-editor/shell/TypeRibbon.tsx src/features/object-editor/shell/EditorTopbar.tsx src/features/object-editor/shell/EditorTopbar.test.tsx
git commit -m "feat(ui): add editor topbar and type ribbon shell components"
```

---

## Task 8: Shell — `EditorNav` with scroll-spy

**Files:**
- Create: `src/features/object-editor/shell/EditorNav.tsx`
- Create: `src/features/object-editor/shell/EditorNav.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/features/object-editor/shell/EditorNav.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { EditorNav } from './EditorNav';
import { makeSections } from '../section-config';

describe('EditorNav', () => {
  it('renders every section group heading', () => {
    render(<EditorNav groups={makeSections('HEB')} activeNum="01" onSelect={() => {}} />);
    expect(screen.getByText('Identité')).toBeInTheDocument();
    expect(screen.getByText('Gestion')).toBeInTheDocument();
  });

  it('fires onSelect with the section number when an item is clicked', () => {
    const onSelect = jest.fn();
    render(<EditorNav groups={makeSections('HEB')} activeNum="01" onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Médias'));
    expect(onSelect).toHaveBeenCalledWith('06');
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npx jest src/features/object-editor/shell/EditorNav.test.tsx`
Expected: FAIL — `Cannot find module './EditorNav'`.

- [ ] **Step 3: Implement `EditorNav.tsx`**

```tsx
// src/features/object-editor/shell/EditorNav.tsx
import type { SectionGroup } from '../section-config';

interface EditorNavProps {
  groups: SectionGroup[];
  activeNum: string;
  onSelect: (num: string) => void;
}

export function EditorNav({ groups, activeNum, onSelect }: EditorNavProps) {
  return (
    <nav className="edit-nav">
      {groups.map((g) => (
        <div key={g.group} className="edit-nav__group">
          <div className="edit-nav__title">{g.group}</div>
          {g.items.map((it) => (
            <button
              type="button"
              key={it.num}
              className={`edit-nav__item${activeNum === it.num ? ' is-on' : ''}`}
              onClick={() => onSelect(it.num)}
            >
              <span className="edit-nav__dot" />
              <span className="label">
                <span className="edit-nav__num">{it.num}</span>{it.label}
              </span>
            </button>
          ))}
        </div>
      ))}
    </nav>
  );
}
```

Scroll-spy lives in `ObjectEditPage` (Task 10): it owns `activeNum` and updates it from an `IntersectionObserver` over the `#section-NN` anchors. `onSelect` there scrolls the matching anchor into view. `EditorNav` stays presentational.

- [ ] **Step 4: Run the test, verify it passes**

Run: `npx jest src/features/object-editor/shell/EditorNav.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/object-editor/shell/EditorNav.tsx src/features/object-editor/shell/EditorNav.test.tsx
git commit -m "feat(ui): add editor section nav component"
```

---

## Task 9: Shell — `EditorRail`, `EditorFooter`, `SaveBar`

`EditorRail` is a scaffold only (its widgets land in Plan 3). `SaveBar` carries the global save action.

**Files:**
- Create: `src/features/object-editor/shell/EditorRail.tsx`
- Create: `src/features/object-editor/shell/EditorFooter.tsx`
- Create: `src/features/object-editor/shell/SaveBar.tsx`
- Create: `src/features/object-editor/shell/SaveBar.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/features/object-editor/shell/SaveBar.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { SaveBar } from './SaveBar';

describe('SaveBar', () => {
  it('disables Enregistrer when there are no dirty sections', () => {
    render(<SaveBar dirtyCount={0} saving={false} onSave={() => {}} />);
    expect(screen.getByRole('button', { name: /Enregistrer/ })).toBeDisabled();
  });

  it('enables Enregistrer and reports the dirty count when dirty', () => {
    render(<SaveBar dirtyCount={3} saving={false} onSave={() => {}} />);
    expect(screen.getByText(/3 modifications/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Enregistrer/ })).toBeEnabled();
  });

  it('fires onSave when Enregistrer is clicked', () => {
    const onSave = jest.fn();
    render(<SaveBar dirtyCount={1} saving={false} onSave={onSave} />);
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer/ }));
    expect(onSave).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npx jest src/features/object-editor/shell/SaveBar.test.tsx`
Expected: FAIL — `Cannot find module './SaveBar'`.

- [ ] **Step 3: Implement the three components**

```tsx
// src/features/object-editor/shell/SaveBar.tsx
interface SaveBarProps {
  dirtyCount: number;
  saving: boolean;
  onSave: () => void;
  statusMessage?: string | null;
}
export function SaveBar({ dirtyCount, saving, onSave, statusMessage }: SaveBarProps) {
  return (
    <div className="savebar">
      <p className="savebar__msg">
        {dirtyCount > 0
          ? `${dirtyCount} modification${dirtyCount > 1 ? 's' : ''} non enregistrée${dirtyCount > 1 ? 's' : ''}`
          : 'Aucune modification en attente'}
      </p>
      <div className="savebar__actions">
        {statusMessage && <span className="savebar__status">{statusMessage}</span>}
        <button type="button" className="btn primary" disabled={dirtyCount === 0 || saving} onClick={onSave}>
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </div>
  );
}
```

```tsx
// src/features/object-editor/shell/EditorFooter.tsx
export function EditorFooter({ onPublish }: { onPublish: () => void }) {
  return (
    <div className="edit-footer">
      <div className="edit-footer__hint">
        <span>Raccourcis :</span>
        <code>⌘+S</code> enregistrer <code>⌘+⇧+P</code> publier <code>Esc</code> quitter
      </div>
      <button type="button" className="btn primary" onClick={onPublish}>Publier les modifs</button>
    </div>
  );
}
```

```tsx
// src/features/object-editor/shell/EditorRail.tsx
// Scaffold only — completion ring / issues / presence / history widgets land in Plan 3.
export function EditorRail({ children }: { children?: React.ReactNode }) {
  return <aside className="edit-side">{children}</aside>;
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npx jest src/features/object-editor/shell/SaveBar.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/object-editor/shell/EditorRail.tsx src/features/object-editor/shell/EditorFooter.tsx src/features/object-editor/shell/SaveBar.tsx src/features/object-editor/shell/SaveBar.test.tsx
git commit -m "feat(ui): add editor rail scaffold, footer, and save bar"
```

---

## Task 10: `useEditorSave` — the global save loop

Batched save over dirty modules. Reuses the existing `useSaveObjectWorkspaceModuleMutation`. Per-module permission routing: `canDirectWrite` → save; only `canPrepareProposal` → still calls the mutation (the RPC routes it to the proposal flow server-side); neither → skipped and reported as blocked.

**Files:**
- Create: `src/features/object-editor/useEditorSave.ts`
- Create: `src/features/object-editor/useEditorSave.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/features/object-editor/useEditorSave.test.tsx
import { renderHook, act } from '@testing-library/react';
import { planSaveBatch } from './useEditorSave';
import type { ObjectWorkspacePermissions } from '../../services/object-workspace';

function perm(canDirectWrite: boolean, canPrepareProposal = false) {
  return { canDirectWrite, canPrepareProposal, canSubmitProposal: false, disabledReason: canDirectWrite ? null : 'Lecture seule' };
}

describe('planSaveBatch', () => {
  it('partitions dirty modules into writable and blocked', () => {
    const permissions = {
      contacts: perm(true),
      location: perm(false),
      media: perm(false, true),
    } as unknown as ObjectWorkspacePermissions;
    const plan = planSaveBatch(['contacts', 'location', 'media'], permissions);
    expect(plan.writable).toEqual(['contacts', 'media']);
    expect(plan.blocked).toEqual([{ module: 'location', reason: 'Lecture seule' }]);
  });

  it('returns an empty plan when nothing is dirty', () => {
    const plan = planSaveBatch([], {} as ObjectWorkspacePermissions);
    expect(plan.writable).toEqual([]);
    expect(plan.blocked).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npx jest src/features/object-editor/useEditorSave.test.tsx`
Expected: FAIL — `Cannot find module './useEditorSave'`.

- [ ] **Step 3: Implement `useEditorSave.ts`**

```ts
// src/features/object-editor/useEditorSave.ts
import { useCallback, useState } from 'react';
import { useSaveObjectWorkspaceModuleMutation } from '../../hooks/useExplorerQueries';
import type { ObjectWorkspacePermissions, WorkspaceModuleId } from '../../services/object-workspace';
import type { ObjectWorkspaceModules } from '../../services/object-workspace-parser';
import { MODULE_KEY_MAP } from './editor-state';

export interface SaveBatchPlan {
  writable: WorkspaceModuleId[];
  blocked: { module: WorkspaceModuleId; reason: string }[];
}

/** Pure: split dirty modules into those that can be sent and those blocked by permissions. */
export function planSaveBatch(
  dirtyModules: WorkspaceModuleId[],
  permissions: ObjectWorkspacePermissions,
): SaveBatchPlan {
  const writable: WorkspaceModuleId[] = [];
  const blocked: { module: WorkspaceModuleId; reason: string }[] = [];
  for (const module of dirtyModules) {
    const key = MODULE_KEY_MAP[module];
    const access = permissions[key];
    if (access?.canDirectWrite || access?.canPrepareProposal) {
      writable.push(module);
    } else {
      blocked.push({ module, reason: access?.disabledReason ?? 'Lecture seule' });
    }
  }
  return { writable, blocked };
}

export interface EditorSaveResult {
  saved: WorkspaceModuleId[];
  failed: { module: WorkspaceModuleId; message: string }[];
  blocked: { module: WorkspaceModuleId; reason: string }[];
}

export function useEditorSave(objectId: string) {
  const mutation = useSaveObjectWorkspaceModuleMutation(objectId);
  const [saving, setSaving] = useState(false);

  const save = useCallback(
    async (
      dirtyModules: WorkspaceModuleId[],
      permissions: ObjectWorkspacePermissions,
      draft: ObjectWorkspaceModules,
    ): Promise<EditorSaveResult> => {
      const plan = planSaveBatch(dirtyModules, permissions);
      const saved: WorkspaceModuleId[] = [];
      const failed: { module: WorkspaceModuleId; message: string }[] = [];
      setSaving(true);
      try {
        for (const module of plan.writable) {
          try {
            await mutation.mutateAsync({ moduleId: module, value: draft[MODULE_KEY_MAP[module]] });
            saved.push(module);
          } catch (err) {
            failed.push({ module, message: err instanceof Error ? err.message : 'Échec de sauvegarde.' });
          }
        }
      } finally {
        setSaving(false);
      }
      return { saved, failed, blocked: plan.blocked };
    },
    [mutation],
  );

  return { save, saving };
}
```

Implementer note: confirm the `useSaveObjectWorkspaceModuleMutation` argument shape in `src/hooks/useExplorerQueries.ts` (the drawer calls it with `{ moduleId, value, ... }`). If `general-info`/`publication` need the special `taxonomyValue` argument, mirror what `ObjectDrawerShell.handleSaveSection` does — but in this plan only `contacts`, `descriptions`, `location` (and `general-info` content) sections exist; handle `general-info` per the drawer's pattern.

- [ ] **Step 4: Run the test, verify it passes**

Run: `npx jest src/features/object-editor/useEditorSave.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/object-editor/useEditorSave.ts src/features/object-editor/useEditorSave.test.tsx
git commit -m "feat(ui): add batched global save loop for the full-page editor"
```

---

## Task 11: `ObjectEditPage` orchestrator + the route

**Files:**
- Create: `src/features/object-editor/ObjectEditPage.tsx`
- Create: `src/app/(main)/objects/[objectId]/edit/page.tsx`

- [ ] **Step 1: Implement `ObjectEditPage.tsx`**

```tsx
// src/features/object-editor/ObjectEditPage.tsx
'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useObjectWorkspaceQuery } from '../../hooks/useExplorerQueries';
import { getArchetypeMeta } from './archetypes';
import { useObjectEditorState } from './useObjectEditorState';
import { useEditorSave } from './useEditorSave';
import { makeSections } from './section-config';
import { EditorTopbar, type EditorMode } from './shell/EditorTopbar';
import { TypeRibbon } from './shell/TypeRibbon';
import { EditorNav } from './shell/EditorNav';
import { EditorRail } from './shell/EditorRail';
import { EditorFooter } from './shell/EditorFooter';
import { SaveBar } from './shell/SaveBar';
import { SectionIdentity } from './sections/SectionIdentity';
import { SectionDescriptions } from './sections/SectionDescriptions';
import { SectionLocation } from './sections/SectionLocation';
import { SectionContacts } from './sections/SectionContacts';
import { MODULE_KEY_MAP } from './editor-state';
import type { WorkspaceModuleId } from '../../services/object-workspace';
import './object-editor.css';

export function ObjectEditPage({ objectId }: { objectId: string }) {
  const router = useRouter();
  const { data, isError, error } = useObjectWorkspaceQuery(objectId);
  const [mode, setMode] = useState<EditorMode>('complet');
  const [activeNum, setActiveNum] = useState('01');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  if (isError) {
    return <div className="panel-card panel-card--warning">{(error as Error).message}</div>;
  }
  if (!data) {
    return <div className="panel-card">Chargement de l'éditeur…</div>;
  }
  return <EditorReady
    data={data} objectId={objectId} mode={mode} setMode={setMode}
    activeNum={activeNum} setActiveNum={setActiveNum}
    statusMessage={statusMessage} setStatusMessage={setStatusMessage}
    onExit={() => router.push('/explorer')}
  />;
}

// Inner component so hooks below run only once data is present.
function EditorReady({ data, objectId, mode, setMode, activeNum, setActiveNum, statusMessage, setStatusMessage, onExit }: {
  data: NonNullable<ReturnType<typeof useObjectWorkspaceQuery>['data']>;
  objectId: string;
  mode: EditorMode;
  setMode: (m: EditorMode) => void;
  activeNum: string;
  setActiveNum: (n: string) => void;
  statusMessage: string | null;
  setStatusMessage: (m: string | null) => void;
  onExit: () => void;
}) {
  const editor = useObjectEditorState(objectId, data.modules);
  const { save, saving } = useEditorSave(objectId);
  const meta = getArchetypeMeta(data.type) ?? getArchetypeMeta('HOT')!;
  const groups = useMemo(() => makeSections(meta.archetype), [meta.archetype]);
  const dirtyCount = Object.values(editor.dirtySections).filter(Boolean).length;

  async function handleSave() {
    const dirty = (Object.keys(editor.dirtySections) as WorkspaceModuleId[])
      .filter((m) => editor.dirtySections[m]);
    const result = await save(dirty, data.permissions, editor.draft);
    editor.commitModules(result.saved.map((m) => MODULE_KEY_MAP[m]));
    setStatusMessage(
      result.failed.length > 0
        ? `${result.failed.length} section(s) en échec.`
        : result.blocked.length > 0
          ? `${result.saved.length} enregistrée(s), ${result.blocked.length} bloquée(s).`
          : 'Modifications enregistrées.',
    );
  }

  function scrollToSection(num: string) {
    setActiveNum(num);
    document.getElementById(`section-${num}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div className={`object-editor edit-flat ${meta.accent}`}>
      <EditorTopbar
        objectName={data.name} typeCode={data.type ?? ''} archetypeCodeName={meta.codeName}
        mode={mode} dirtyCount={dirtyCount} onModeChange={setMode}
        onPreview={onExit} onCancel={onExit} onPublish={() => void handleSave()}
      />
      <TypeRibbon meta={meta} />
      <div className="edit-body">
        <EditorNav groups={groups} activeNum={activeNum} onSelect={scrollToSection} />
        <main className="edit-main">
          <SectionIdentity editor={editor} permissions={data.permissions} />
          <SectionDescriptions editor={editor} permissions={data.permissions} />
          <SectionLocation editor={editor} permissions={data.permissions} />
          <SectionContacts editor={editor} permissions={data.permissions} />
        </main>
        <EditorRail />
      </div>
      <SaveBar dirtyCount={dirtyCount} saving={saving} onSave={() => void handleSave()} statusMessage={statusMessage} />
      <EditorFooter onPublish={() => void handleSave()} />
    </div>
  );
}
```

Implementer note: the four `Section*` components are created in Task 12; until then this file will not type-check. Either implement Task 12 first or temporarily stub the four imports with `const SectionIdentity = () => null;` etc. — TDD order: do Task 12 Step 1–4 before this file's verification.

- [ ] **Step 2: Implement the route**

```tsx
// src/app/(main)/objects/[objectId]/edit/page.tsx
'use client';
import { use } from 'react';
import { ObjectEditPage } from '@/features/object-editor/ObjectEditPage';

export default function ObjectEditRoute({ params }: { params: Promise<{ objectId: string }> }) {
  const { objectId } = use(params);
  return <ObjectEditPage objectId={objectId} />;
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: clean — but only after Task 12 is implemented (the `Section*` imports). If running this task first, expect the four "cannot find module './sections/...'" errors and resolve them by completing Task 12.

- [ ] **Step 4: Commit**

```bash
git add src/features/object-editor/ObjectEditPage.tsx "src/app/(main)/objects/[objectId]/edit/page.tsx"
git commit -m "feat(ui): add full-page object editor route and orchestrator"
```

---

## Task 12: Four proof sections — Identity, Descriptions, Location, Contacts

Each section is a component receiving `{ editor, permissions }`, rendering one `Fs` card, reading its `editor.draft.<module>` slice, and writing through `editor.replaceModule` / `editor.patchModule`. These four prove the wiring pattern end to end. They port the prototype's `SectionIdentity`, `SectionDescriptions`, `SectionLocation`, `SectionContacts` (from `edit-primitives.jsx`) but bind to real workspace module shapes — consult `src/services/object-workspace-parser.ts` for `ObjectWorkspaceGeneralInfo`, `ObjectWorkspaceDescriptionsModule`, `ObjectWorkspaceLocationModule`, `ObjectWorkspaceContactsModule`.

**Files:**
- Create: `src/features/object-editor/sections/SectionContacts.tsx` (+ `.test.tsx`)
- Create: `src/features/object-editor/sections/SectionIdentity.tsx`
- Create: `src/features/object-editor/sections/SectionDescriptions.tsx`
- Create: `src/features/object-editor/sections/SectionLocation.tsx`
- Create: `src/features/object-editor/sections/section-types.ts` (shared props type)

- [ ] **Step 1: Write the shared props type and the failing test**

```ts
// src/features/object-editor/sections/section-types.ts
import type { ObjectEditorState } from '../useObjectEditorState';
import type { ObjectWorkspacePermissions } from '../../../services/object-workspace';

export interface SectionProps {
  editor: ObjectEditorState;
  permissions: ObjectWorkspacePermissions;
}
```

```tsx
// src/features/object-editor/sections/SectionContacts.test.tsx
import { render, screen, fireEvent, renderHook, act } from '@testing-library/react';
import { useObjectEditorState } from '../useObjectEditorState';
import { SectionContacts } from './SectionContacts';
import type { ObjectWorkspaceModules } from '../../../services/object-workspace-parser';
import type { ObjectWorkspacePermissions } from '../../../services/object-workspace';

function modulesWithOneContact(): ObjectWorkspaceModules {
  return {
    contacts: {
      objectItems: [{
        id: 'c1', kindId: 'k', kindCode: 'phone', kindLabel: 'Téléphone',
        roleId: '', roleCode: '', roleLabel: '', value: '+262 000', isPublic: true,
        isPrimary: true, position: '0',
      }],
      kindOptions: [{ id: 'k', code: 'phone', label: 'Téléphone' }],
      roleOptions: [],
    },
  } as unknown as ObjectWorkspaceModules;
}
const allowAll = new Proxy({}, { get: () => ({ canDirectWrite: true, canPrepareProposal: true, canSubmitProposal: true, disabledReason: null }) }) as ObjectWorkspacePermissions;

describe('SectionContacts', () => {
  it('renders existing contact values and marks the module dirty on edit', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', modulesWithOneContact()));
    const view = render(<SectionContacts editor={result.current} permissions={allowAll} />);
    const input = screen.getByDisplayValue('+262 000');
    act(() => { fireEvent.change(input, { target: { value: '+262 999' } }); });
    view.rerender(<SectionContacts editor={result.current} permissions={allowAll} />);
    expect(result.current.dirtySections.contacts).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npx jest src/features/object-editor/sections/SectionContacts.test.tsx`
Expected: FAIL — `Cannot find module './SectionContacts'`.

- [ ] **Step 3: Implement `SectionContacts.tsx`**

```tsx
// src/features/object-editor/sections/SectionContacts.tsx
import { Fs, Repeater, Input, Select } from '../primitives';
import type { SectionProps } from './section-types';
import type { ObjectWorkspaceContactItem } from '../../../services/object-workspace-parser';

export function SectionContacts({ editor }: SectionProps) {
  const contacts = editor.draft.contacts;

  function updateItem(id: string, patch: Partial<ObjectWorkspaceContactItem>) {
    editor.replaceModule('contacts', {
      ...contacts,
      objectItems: contacts.objectItems.map((it) => (it.id === id ? { ...it, ...patch } : it)),
    });
  }
  function addItem() {
    const first = contacts.kindOptions[0];
    editor.replaceModule('contacts', {
      ...contacts,
      objectItems: [...contacts.objectItems, {
        id: `draft-contact-${Date.now()}`,
        kindId: first?.id ?? '', kindCode: first?.code ?? 'phone', kindLabel: first?.label ?? 'Téléphone',
        roleId: '', roleCode: '', roleLabel: '', value: '', isPublic: true,
        isPrimary: contacts.objectItems.length === 0, position: String(contacts.objectItems.length),
      }],
    });
  }
  function removeItem(id: string) {
    editor.replaceModule('contacts', {
      ...contacts,
      objectItems: contacts.objectItems.filter((it) => it.id !== id),
    });
  }

  return (
    <Fs num="04" title="Contacts" sub="Téléphones, e-mail, web">
      <Repeater
        items={contacts.objectItems}
        getKey={(it) => it.id}
        columns="120px 1fr auto"
        addLabel="Ajouter un canal de contact"
        onAdd={addItem}
        renderRow={(it) => (
          <>
            <Select
              value={it.kindCode}
              options={contacts.kindOptions.map((o) => ({ v: o.code, l: o.label }))}
              onChange={(code) => {
                const opt = contacts.kindOptions.find((o) => o.code === code);
                updateItem(it.id, { kindCode: code, kindId: opt?.id ?? it.kindId, kindLabel: opt?.label ?? it.kindLabel });
              }}
            />
            <Input value={it.value} onChange={(v) => updateItem(it.id, { value: v })} />
            <button type="button" className="del" onClick={() => removeItem(it.id)}>Supprimer</button>
          </>
        )}
      />
    </Fs>
  );
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npx jest src/features/object-editor/sections/SectionContacts.test.tsx`
Expected: PASS.

- [ ] **Step 5: Implement `SectionIdentity`, `SectionDescriptions`, `SectionLocation`**

Follow the exact pattern from `SectionContacts`:
- `SectionIdentity` — `Fs num="01"`. Reads `editor.draft.generalInfo` (name, legalName, status) and `editor.draft.taxonomy`. Use `Field` + `Input` for name/legal, `Select` for status; `patchModule('generalInfo', { ... })`. For taxonomy, render the assigned path read-only for now (full taxonomy picker is Plan 2).
- `SectionDescriptions` — `Fs num="02"`. Reads `editor.draft.descriptions`. Use `LangTabs` bound to `descriptions.activeLanguage` (write via `replaceModule('descriptions', { ...descriptions, activeLanguage })`), and `Textarea` for `object.chapo` / `object.description` for the active language. Mirror `ObjectDrawerShell.patchDescriptionField`'s `updateTranslatableField` logic — copy that helper into a local `descriptions-field.ts` and unit-test it (one test: writing the active language updates `values[lang]`).
- `SectionLocation` — `Fs num="03"`. Reads `editor.draft.location.main`. `Field` + `Input` for address lines, postal code, `Select` for commune; write via `replaceModule('location', { ...location, main: { ...location.main, ...patch } })`.

Consult `object-workspace-parser.ts` for exact field names: `ObjectWorkspaceGeneralInfo` (15-25), `ObjectWorkspaceDescriptionsModule` (115-122), `ObjectWorkspaceLocationModule` / `ObjectWorkspaceLocationForm` (72-101). Add a one-line render test per section asserting it mounts with fixture data.

- [ ] **Step 6: Run all section tests + type-check**

Run: `npx jest src/features/object-editor/sections && npx tsc --noEmit -p tsconfig.json`
Expected: all section suites PASS; `tsc` clean (this resolves the Task 11 imports).

- [ ] **Step 7: Commit**

```bash
git add src/features/object-editor/sections
git commit -m "feat(ui): add four wired proof sections for the full-page editor"
```

---

## Task 13: Smoke test + full verification

**Files:**
- Create: `tests/object-editor.spec.ts` (Playwright)

- [ ] **Step 1: Write the Playwright smoke test**

```ts
// tests/object-editor.spec.ts
import { test, expect } from '@playwright/test';

// Uses demo mode (NEXT_PUBLIC_ENABLE_DEMO_MODE=true) so a known mock object id resolves.
// Replace DEMO_OBJECT_ID with a mock id from src/data/mock.ts.
const DEMO_OBJECT_ID = 'REPLACE_WITH_MOCK_ID';

test('full-page editor renders shell and proof sections', async ({ page }) => {
  await page.goto(`/objects/${DEMO_OBJECT_ID}/edit`);
  await expect(page.locator('.object-editor')).toBeVisible();
  await expect(page.locator('.type-ribbon')).toBeVisible();
  await expect(page.locator('.edit-nav')).toBeVisible();
  await expect(page.locator('#section-01')).toBeVisible();
  await expect(page.locator('#section-04')).toBeVisible();
});
```

- [ ] **Step 2: Resolve the demo object id**

Open `src/data/mock.ts`, find a mock object with a type code present in `TYPE_ARCHETYPES`, and set `DEMO_OBJECT_ID`. If demo mode cannot resolve a single object for the workspace query, instead mark the test `test.skip` with a comment and rely on manual verification — note this in the commit message.

- [ ] **Step 3: Run the smoke test**

Run: `npx playwright test tests/object-editor.spec.ts`
Expected: PASS (or documented skip).

- [ ] **Step 4: Full verification gate**

Run, in order:
```bash
npx tsc --noEmit -p tsconfig.json
npm run lint
npx jest src/features/object-editor
npm run build
```
Expected: `tsc` clean · lint clean · all `object-editor` Jest suites PASS · `next build` succeeds.

- [ ] **Step 5: Manual UX check**

Run `npm run dev`, open `/objects/<id>/edit` for a real or demo object. Confirm: topbar + ribbon + nav render with the archetype accent; clicking a nav item scrolls to its section; editing a contact field flips the save bar to "1 modification non enregistrée"; "Enregistrer" persists (check network call to the save RPC). Note anything off — the user reviews UX before Plan 2.

- [ ] **Step 6: Commit**

```bash
git add tests/object-editor.spec.ts
git commit -m "test(ui): add smoke test for the full-page object editor"
```

---

## Self-Review

**Spec coverage (Plan 1 portion of the spec):**
- Route `objects/[objectId]/edit` — Task 11. ✓
- Reuse existing data layer (`useObjectWorkspaceQuery`) — Tasks 10, 11. ✓
- `useObjectEditorState` lifted from `ObjectDrawerShell` — Tasks 2, 3. ✓
- Archetype identity extracted to a shared module — Task 1. ✓
- Shell (topbar, ribbon, nav, rail scaffold, footer, save bar) — Tasks 7, 8, 9. ✓
- Global save bar with per-module permission routing — Task 10. ✓
- Primitives kit — Task 4. ✓
- CSS foundation — Task 5. ✓
- Section nav config / groups — Task 6. ✓
- Proof sections (4) — Task 12. ✓
- Testing & verification — every task + Task 13. ✓
- Drawer left intact, cutover deferred — confirmed in Architecture; no task rewires "Modifier". ✓
- Out of Plan 1 scope (correctly deferred to later plans): the other 18 sections, type-block 05, cross-cutting widgets, backend extensions, drawer retirement.

**Placeholder scan:** `DEMO_OBJECT_ID = 'REPLACE_WITH_MOCK_ID'` is an explicit, instructed resolution step (Task 13 Step 2), not a hidden placeholder. Task 12 Step 5 specifies three sections by pattern rather than full code — acceptable: the full pattern is given in Step 3 and the exact field sources are cited. No other placeholders.

**Type consistency:** `ObjectEditorState` (Task 3) is consumed by `SectionProps` (Task 12) and `useEditorSave` consumes `WorkspaceModuleId` + `ObjectWorkspacePermissions` (existing types). `MODULE_KEY_MAP` is exported from `editor-state.ts` (Task 2) and used in Tasks 10, 11. `EditorMode` defined in `EditorTopbar.tsx` (Task 7), consumed in `ObjectEditPage` (Task 11). `SectionGroup`/`SectionItem` defined in Task 6, consumed in Task 8. Consistent.
