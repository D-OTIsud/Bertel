# Room descriptive redesign — Phase 1 (frontend-only) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the §06 per-room editor (`RoomEditModal`) so capacities are numeric and locked, equipment is searchable with selected-first, units/tariff are clearly labelled, and the layout is grouped — with **zero database change**.

**Architecture:** Pure helpers for the couchages lock live in `rooms-utils.ts` (unit-tested, no React). `RoomEditModal.tsx` is rewritten to: use `type="number"` inputs with `m²` / `€ / nuit` suffixes, wire the couchages helpers, relabel "Unités" → "Nb. de chambres (de ce type)", switch equipment to `ChipMultiSelect`'s existing **modal mode** (search + Sélectionnés/Disponibles), and group fields into labelled sections with a promoted PMR toggle. The structured bed list stays a free-text placeholder this phase (Phase 2 replaces it).

**Tech Stack:** Next.js + React + TypeScript, Jest + React Testing Library. Spec: `docs/superpowers/specs/2026-06-15-room-descriptive-redesign-design.md` (§3 = Phase 1).

**Commands:** single-file test `npx jest <path>`; full suite `npm run test:run`; types `npm run typecheck`. Run from `bertel-tourism-ui/`.

---

## File structure

- **Modify** `src/features/object-editor/sections/blocks/rooms-utils.ts` — add 3 pure couchages-lock helpers.
- **Modify** `src/features/object-editor/sections/blocks/rooms-utils.test.ts` — tests for the helpers.
- **Modify** `src/features/object-editor/widgets/RoomEditModal.tsx` — full redesign (numeric inputs, lock wiring, equipment modal mode, grouped layout, PMR).
- **Modify** `src/features/object-editor/widgets/RoomEditModal.test.tsx` — rewrite assertions for the new behaviour.
- **No** change to `BlockHEB.tsx`, the parser, the saver, or any SQL.

---

## Task 1: Couchages-lock helpers (pure, TDD)

**Files:**
- Modify: `src/features/object-editor/sections/blocks/rooms-utils.ts`
- Test: `src/features/object-editor/sections/blocks/rooms-utils.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `rooms-utils.test.ts` (add the three names to the existing top `import { … } from './rooms-utils';`):

```ts
describe('couchages lock helpers', () => {
  it('applyCouchagesTotal pre-fills adults = total, children = 0', () => {
    expect(applyCouchagesTotal('4')).toEqual({ capacityTotal: '4', capacityAdults: '4', capacityChildren: '0' });
  });
  it('applyCouchagesTotal treats empty/invalid total as 0 adults', () => {
    expect(applyCouchagesTotal('')).toEqual({ capacityTotal: '', capacityAdults: '0', capacityChildren: '0' });
  });
  it('applyAdults rebalances children so adults + children = total', () => {
    expect(applyAdults('1', '4')).toEqual({ capacityAdults: '1', capacityChildren: '3' });
  });
  it('applyAdults clamps adults to [0, total]', () => {
    expect(applyAdults('9', '4')).toEqual({ capacityAdults: '4', capacityChildren: '0' });
    expect(applyAdults('-2', '4')).toEqual({ capacityAdults: '0', capacityChildren: '4' });
  });
  it('applyChildren rebalances adults so adults + children = total', () => {
    expect(applyChildren('1', '4')).toEqual({ capacityAdults: '3', capacityChildren: '1' });
  });
  it('applyChildren clamps children to [0, total]', () => {
    expect(applyChildren('9', '4')).toEqual({ capacityAdults: '0', capacityChildren: '4' });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest src/features/object-editor/sections/blocks/rooms-utils.test.ts`
Expected: FAIL — `applyCouchagesTotal is not defined` (etc.).

- [ ] **Step 3: Implement the helpers**

Append to `rooms-utils.ts`:

```ts
/** Parse a room capacity string to a non-negative int (empty/invalid/negative → 0). */
function toCapacityInt(value: string): number {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Couchages split — total is the anchor. Typing the total pre-fills adultes = total,
 * enfants = 0. `applyAdults`/`applyChildren` keep `adultes + enfants === total` after any
 * edit (clamped to [0, total]). All three are STRINGS to feed the controlled inputs.
 */
export function applyCouchagesTotal(total: string): {
  capacityTotal: string; capacityAdults: string; capacityChildren: string;
} {
  return { capacityTotal: total, capacityAdults: String(toCapacityInt(total)), capacityChildren: '0' };
}

export function applyAdults(adults: string, total: string): { capacityAdults: string; capacityChildren: string } {
  const t = toCapacityInt(total);
  const a = Math.min(Math.max(toCapacityInt(adults), 0), t);
  return { capacityAdults: String(a), capacityChildren: String(t - a) };
}

export function applyChildren(children: string, total: string): { capacityAdults: string; capacityChildren: string } {
  const t = toCapacityInt(total);
  const c = Math.min(Math.max(toCapacityInt(children), 0), t);
  return { capacityAdults: String(t - c), capacityChildren: String(c) };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest src/features/object-editor/sections/blocks/rooms-utils.test.ts`
Expected: PASS (existing + 6 new assertions green).

- [ ] **Step 5: Commit**

```bash
git add src/features/object-editor/sections/blocks/rooms-utils.ts src/features/object-editor/sections/blocks/rooms-utils.test.ts
git -c commit.gpgsign=false commit -m "feat(rooms): couchages lock helpers (total anchors adults+children)"
```

---

## Task 2: RoomEditModal redesign (TDD)

**Files:**
- Modify: `src/features/object-editor/widgets/RoomEditModal.tsx`
- Test: `src/features/object-editor/widgets/RoomEditModal.test.tsx`

- [ ] **Step 1: Rewrite the test file with the new expectations**

Replace the whole body of `RoomEditModal.test.tsx` with:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { RoomEditModal } from './RoomEditModal';
import type { ObjectWorkspaceRoomTypeItem, ObjectWorkspaceRoomsModule } from '../../../services/object-workspace-parser';

const room: ObjectWorkspaceRoomTypeItem = {
  recordId: 'r1', code: 'std', name: 'Chambre standard', nameTranslations: {},
  description: '', descriptionTranslations: {}, capacityAdults: '2', capacityChildren: '0',
  capacityTotal: '2', sizeSqm: '22', bedConfig: 'Double', bedConfigTranslations: {}, quantity: '12',
  floorLevel: '', viewTypeId: '', viewTypeCode: '', viewTypeLabel: '',
  roomTypeId: '', roomTypeCode: '', roomTypeLabel: '',
  basePrice: '165', currency: 'EUR', accessible: false, published: true, position: '1',
  amenityCodes: [], mediaIds: [],
};
const mod: Pick<ObjectWorkspaceRoomsModule, 'roomTypeOptions' | 'viewTypeOptions' | 'amenityOptions'> = {
  roomTypeOptions: [{ id: 'rt1', code: 'double', label: 'Chambre double' }],
  viewTypeOptions: [{ id: 'v1', code: 'sea', label: 'Vue mer' }],
  amenityOptions: [{ id: 'wifi', code: 'wifi', label: 'Wi-Fi' }],
};

describe('RoomEditModal', () => {
  it('edits the room type and returns the patched room on save', () => {
    const onSave = jest.fn();
    render(<RoomEditModal open room={room} module={mod} onClose={() => {}} onSave={onSave} />);
    fireEvent.change(screen.getByLabelText('Type de chambre'), { target: { value: 'double' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    const saved = onSave.mock.calls[0][0] as ObjectWorkspaceRoomTypeItem;
    expect(saved.roomTypeCode).toBe('double');
  });

  it('uses numeric inputs and unit suffixes', () => {
    render(<RoomEditModal open room={room} module={mod} onClose={() => {}} onSave={() => {}} />);
    expect(screen.getByLabelText('Couchages (total)').getAttribute('type')).toBe('number');
    expect(screen.getByLabelText('Surface').getAttribute('type')).toBe('number');
    expect(screen.getByLabelText('Tarif indicatif').getAttribute('type')).toBe('number');
    expect(screen.getByText('m²')).toBeInTheDocument();
    expect(screen.getByText('€ / nuit')).toBeInTheDocument();
  });

  it('relabels Unités to Nb. de chambres (de ce type)', () => {
    render(<RoomEditModal open room={room} module={mod} onClose={() => {}} onSave={() => {}} />);
    expect(screen.getByLabelText('Nb. de chambres (de ce type)')).toBeInTheDocument();
    expect(screen.queryByLabelText('Unités')).not.toBeInTheDocument();
  });

  it('locks adults + children to the total', () => {
    const onSave = jest.fn();
    render(<RoomEditModal open room={room} module={mod} onClose={() => {}} onSave={onSave} />);
    fireEvent.change(screen.getByLabelText('Couchages (total)'), { target: { value: '4' } });
    expect((screen.getByLabelText('Adultes') as HTMLInputElement).value).toBe('4');
    expect((screen.getByLabelText('Enfants') as HTMLInputElement).value).toBe('0');
    fireEvent.change(screen.getByLabelText('Adultes'), { target: { value: '1' } });
    expect((screen.getByLabelText('Enfants') as HTMLInputElement).value).toBe('3');
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    const saved = onSave.mock.calls[0][0] as ObjectWorkspaceRoomTypeItem;
    expect(saved).toMatchObject({ capacityTotal: '4', capacityAdults: '1', capacityChildren: '3' });
  });

  it('edits amenities through the searchable equipment modal', () => {
    const onSave = jest.fn();
    render(<RoomEditModal open room={room} module={mod} onClose={() => {}} onSave={onSave} />);
    fireEvent.click(screen.getByRole('button', { name: /Choisir/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Wi-Fi' }));
    fireEvent.click(screen.getByRole('button', { name: 'Valider' }));
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    const saved = onSave.mock.calls[0][0] as ObjectWorkspaceRoomTypeItem;
    expect(saved.amenityCodes).toEqual(['wifi']);
  });

  it('renders a PMR accessibility toggle', () => {
    render(<RoomEditModal open room={room} module={mod} onClose={() => {}} onSave={() => {}} />);
    expect(screen.getByRole('button', { name: 'Chambre accessible (PMR)' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest src/features/object-editor/widgets/RoomEditModal.test.tsx`
Expected: FAIL — e.g. `getByLabelText('Tarif indicatif')` not found / `getByText('m²')` not found (the component still uses the old flat layout).

- [ ] **Step 3: Rewrite the component**

Replace the whole contents of `RoomEditModal.tsx` with:

```tsx
import { useState, type ReactNode } from 'react';
import { EditorModal, ReferenceSelect, ChipMultiSelect, Field, Input, Textarea, Toggle } from '../primitives';
import type { ObjectWorkspaceRoomTypeItem, ObjectWorkspaceRoomsModule } from '../../../services/object-workspace-parser';
import { applyCouchagesTotal, applyAdults, applyChildren } from '../sections/blocks/rooms-utils';

interface RoomEditModalProps {
  open: boolean;
  room: ObjectWorkspaceRoomTypeItem;
  module: Pick<ObjectWorkspaceRoomsModule, 'roomTypeOptions' | 'viewTypeOptions' | 'amenityOptions'>;
  onClose: () => void;
  onSave: (room: ObjectWorkspaceRoomTypeItem) => void;
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <div className="chip-group__label" style={{ marginTop: 6 }}>{children}</div>;
}

/** Focused per-room editor. Edits a draft copy of one room type; onSave returns the patched item.
 *  Grouped sections + numeric capacities; couchages total anchors a locked adults/enfants split. */
export function RoomEditModal({ open, room, module, onClose, onSave }: RoomEditModalProps) {
  const [draft, setDraft] = useState(room);
  const set = (patch: Partial<ObjectWorkspaceRoomTypeItem>) => setDraft((d) => ({ ...d, ...patch }));
  const priceUnit = `${draft.currency === 'EUR' ? '€' : draft.currency} / nuit`;
  return (
    <EditorModal open={open} title={draft.name || 'Type de chambre'} onClose={onClose} onSave={() => onSave(draft)}>
      <SectionLabel>Identité</SectionLabel>
      <Field label="Type de chambre">
        <ReferenceSelect
          value={draft.roomTypeCode}
          options={module.roomTypeOptions}
          allowEmpty
          emptyLabel="— Type non défini —"
          aria-label="Type de chambre"
          onChange={(code, opt) => set({ roomTypeCode: code, roomTypeId: opt?.id ?? '', roomTypeLabel: opt?.label ?? '' })}
        />
      </Field>
      <Field label="Nom / libellé"><Input value={draft.name} onChange={(name) => set({ name })} /></Field>
      <Field label="Vue">
        <ReferenceSelect
          value={draft.viewTypeCode}
          options={module.viewTypeOptions}
          allowEmpty
          emptyLabel="— Aucune —"
          aria-label="Vue"
          onChange={(code, opt) => set({ viewTypeCode: code, viewTypeId: opt?.id ?? '', viewTypeLabel: opt?.label ?? '' })}
        />
      </Field>

      <SectionLabel>Couchages &amp; capacité</SectionLabel>
      {/* Total is the anchor — adults/children stay locked to it (applyAdults/applyChildren rebalance). */}
      <Field label="Couchages (total)">
        <Input type="number" value={draft.capacityTotal} mono aria-label="Couchages (total)" onChange={(v) => set(applyCouchagesTotal(v))} />
      </Field>
      <Field label="Adultes">
        <Input type="number" value={draft.capacityAdults} mono aria-label="Adultes" onChange={(v) => set(applyAdults(v, draft.capacityTotal))} />
      </Field>
      <Field label="Enfants">
        <Input type="number" value={draft.capacityChildren} mono aria-label="Enfants" onChange={(v) => set(applyChildren(v, draft.capacityTotal))} />
      </Field>
      <p className="muted" style={{ fontSize: 12, margin: '0 0 6px' }}>
        Adultes + enfants suivent toujours le total{draft.capacityTotal ? ` (${draft.capacityTotal})` : ''}.
      </p>

      <SectionLabel>Configuration des lits</SectionLabel>
      {/* Phase 1 placeholder — Phase 2 replaces this with the structured « quantité × type de lit » list. */}
      <Field label="Configuration lits"><Input value={draft.bedConfig} aria-label="Configuration lits" onChange={(bedConfig) => set({ bedConfig })} /></Field>

      <SectionLabel>Surface, quantité &amp; tarif</SectionLabel>
      <Field label="Surface">
        <Input type="number" value={draft.sizeSqm} mono suffix="m²" aria-label="Surface" onChange={(sizeSqm) => set({ sizeSqm })} />
      </Field>
      {/* `quantity` = object_room_type.total_rooms — « combien de chambres identiques de ce type ». */}
      <Field label="Nb. de chambres (de ce type)" hint="Nombre de chambres identiques de ce type.">
        <Input type="number" value={draft.quantity} mono aria-label="Nb. de chambres (de ce type)" onChange={(quantity) => set({ quantity })} />
      </Field>
      <Field label="Tarif indicatif">
        <Input type="number" value={draft.basePrice} mono suffix={priceUnit} aria-label="Tarif indicatif" onChange={(basePrice) => set({ basePrice })} />
      </Field>

      <SectionLabel>Description</SectionLabel>
      <Field label="Description"><Textarea value={draft.description} rows={3} onChange={(description) => set({ description })} /></Field>

      <SectionLabel>Équipements</SectionLabel>
      <ChipMultiSelect
        options={module.amenityOptions}
        selected={draft.amenityCodes}
        modalTitle="Équipements de la chambre"
        searchPlaceholder="Rechercher un équipement…"
        onChange={(amenityCodes) => set({ amenityCodes })}
      />

      <SectionLabel>Accessibilité &amp; publication</SectionLabel>
      <Toggle
        label="Chambre accessible (PMR)"
        sub="Aménagée pour les personnes à mobilité réduite."
        on={draft.accessible}
        onChange={(accessible) => set({ accessible })}
      />
      <Toggle label="Publiée" on={draft.published} onChange={(published) => set({ published })} />
    </EditorModal>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest src/features/object-editor/widgets/RoomEditModal.test.tsx`
Expected: PASS (all 6 specs).

> If the `edits amenities through the searchable equipment modal` spec is flaky on the nested
> Radix dialog (focus/portal), it is the one risk in this plan. Fallback: render the
> equipment search **inline** instead of modal mode (add a `searchable` inline branch to
> `ChipMultiSelect` reusing its `fold` + Sélectionnés/Disponibles internals) — same UX, no
> modal-over-modal. Only reach for this if the nested dialog genuinely misbehaves; the PO
> prefers the compact trigger+modal pattern, so try modal mode first.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: clean (no errors).

- [ ] **Step 6: Commit**

```bash
git add src/features/object-editor/widgets/RoomEditModal.tsx src/features/object-editor/widgets/RoomEditModal.test.tsx
git -c commit.gpgsign=false commit -m "feat(rooms): redesign §06 per-room editor (numeric capacities, searchable equipment, grouped layout)"
```

---

## Task 3: Verify in the running app + decision log

**Files:**
- Modify: `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md` (append next §)

- [ ] **Step 1: Full suite + types green**

Run: `npm run test:run` then `npm run typecheck`
Expected: full Jest suite green (no regressions in `BlockHEB.test.tsx`, `section-registry.test.tsx`, etc.); types clean.

- [ ] **Step 2: Verify the modal in the running app**

Start the dev server (`preview_start` / `npm run dev`), open an HEB object's full-page editor
(`/objects/[id]/edit`), expand §06, click **+ Ajouter un descriptif de chambre**. Confirm:
- Couchages/Surface/Nb. chambres/Tarif are numeric (spinners); Surface shows `m²`, Tarif `€ / nuit`.
- Typing the total sets adultes; editing adultes rebalances enfants; the hint shows the total.
- Équipements shows the compact trigger → opens the searchable modal (search + Sélectionnés/Disponibles); picking returns selected chips to the trigger; **Escape inside the equipment modal closes only that modal, not the room modal**.
- PMR toggle is in its own "Accessibilité & publication" group.
Capture a screenshot (`preview_screenshot`) as proof.

- [ ] **Step 3: Update the decision log**

Read the last `§NN` heading in `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md` and append
the next number documenting: the §06 per-room modal redesign (numeric+locked couchages via
`applyCouchagesTotal/applyAdults/applyChildren`; "Unités" → "Nb. de chambres (de ce type)" =
`total_rooms`; equipment switched to `ChipMultiSelect` modal mode; grouped layout; PMR promoted),
that it is **frontend-only** (no DB/parser/saver change), and that **Phase 2** (structured
`object_room_type_bed` list) is the follow-up — spec at
`docs/superpowers/specs/2026-06-15-room-descriptive-redesign-design.md`.

- [ ] **Step 4: Commit the decision log**

```bash
git add "bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md"
git -c commit.gpgsign=false commit -m "docs(rooms): log §06 per-room editor redesign (Phase 1)"
```

---

## Self-review notes

- **Spec coverage (§3):** number inputs (Task 2), `m²`/`€` suffixes (Task 2), couchages lock (Tasks 1+2), equipment modal mode (Task 2), "Unités" relabel (Task 2), grouped layout + PMR promotion (Task 2), Phase-1 tests (Tasks 1+2), verification (Task 3). The bed-list field is intentionally left as a free-text placeholder (spec §3.4) — Phase 2 replaces it.
- **No DB/parser/saver touch:** every edited field already persists today; only input `type`, labels, suffixes, the lock wiring, and the equipment picker mode change. `BlockHEB` is untouched.
- **Type consistency:** helper names (`applyCouchagesTotal`, `applyAdults`, `applyChildren`) and return shapes match between Task 1 (definition + tests) and Task 2 (call sites). `set()` accepts each helper's partial return.
- **Risk:** nested Radix dialog for equipment (documented fallback in Task 2 Step 4).
