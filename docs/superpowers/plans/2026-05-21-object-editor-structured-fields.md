# Object Editor — Structured Fields Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align seven object-editor sections (contacts, rooms/equipment, media, pet policy, tags, classifications, tourism accessibility) with the existing database model — replacing blank/missing selectors, free-text inputs, and redundant toggles with reference-backed controls and focused UX.

**Architecture:** In-place section fixes built on a small set of new shared editor primitives. Two additive DB migrations (`object_room_type.room_type_id`, `tag_link.position`) applied first, then workspace read/save wiring, then primitives, then per-domain UI. No editor redesign; the existing 22-section registry, per-module save paths, and visual direction are preserved.

**Tech Stack:** Next.js + React + TypeScript; Jest + `@testing-library/react`; Supabase Postgres (reference tables, `api.*` RPCs); Radix UI (`@radix-ui/react-dialog`); `@dnd-kit` (new).

**Source spec:** `docs/superpowers/specs/2026-05-21-object-editor-structured-fields-design.md`

> **§10 "Accessibilité" = tourism accessibility data** — Tourisme & Handicap labels, disability-type
> coverage, accessible amenities, adapted multilingual descriptions. NOT HTML/ARIA/WCAG editor-UI
> accessibility. Every §10 task below edits *tourism accessibility data*, reference-backed, no free text.

---

## Conventions

- **Frontend root:** `bertel-tourism-ui/`. Run all `npx`/`npm` commands from there.
- **Test command:** `cd bertel-tourism-ui && npx jest <path>` — single file: append `-t '<name>'`.
- **Type check:** `cd bertel-tourism-ui && npx tsc -p tsconfig.app.json --noEmit`.
- **SQL files:** `Base de donnée DLL et API/`. Migrations applied to the live DB via the Supabase MCP
  `apply_migration` tool; verified via `execute_sql`.
- **Editor test pattern (established):** `renderHook(() => useObjectEditorState('o1', modules))` →
  `render(<Section editor={result.current} permissions={allowAll} />)`; assert on
  `result.current.draft.<module>` and `result.current.dirtySections.<module>`; `view.rerender(...)`
  after an `act()` interaction. Fixtures: `allowAll` + `fullModulesFixture()` from
  `src/features/object-editor/sections/section-fixture.test-utils.ts`.
- **Commit cadence:** one commit per task (after its tests pass). Conventional-commit prefixes
  (`feat(ui):`, `fix(ui):`, `feat(db):`, `chore:`), matching repo history.

## File Structure

**New files**
| File | Responsibility |
|------|----------------|
| `Base de donnée DLL et API/migration_room_type_ref.sql` | M1 — `object_room_type.room_type_id` |
| `Base de donnée DLL et API/migration_tag_link_position.sql` | M2 — `tag_link.position` |
| `src/features/object-editor/primitives/ReferenceSelect.tsx` | `<select>` bound to `WorkspaceReferenceOption[]`, stale-value-safe |
| `src/features/object-editor/primitives/ChipMultiSelect.tsx` | chip-toggle multiselect from options + selected codes |
| `src/features/object-editor/primitives/SortableList.tsx` | `@dnd-kit` drag-and-drop list wrapper |
| `src/features/object-editor/primitives/EditorModal.tsx` | Radix-Dialog wrapper for focused add/edit forms |
| `src/features/object-editor/widgets/RoomEditModal.tsx` | per-room edit form (type, view, capacities, amenities) |
| `src/features/object-editor/widgets/MeetingRoomEditModal.tsx` | per-meeting-room edit form (capacities, equipment) |
| `src/features/object-editor/widgets/MediaEditModal.tsx` | media add/edit form (type, title, description, credit…) |
| `+ co-located `*.test.tsx`/`*.test.ts` for each` | unit tests |

**Modified files**
| File | Change |
|------|--------|
| `bertel-tourism-ui/package.json` | add `@dnd-kit/*` |
| `Base de donnée DLL et API/object_workspace_gap_rpcs.sql` | `save_object_workspace_tags` writes `position` |
| `src/services/object-workspace-parser.ts` | types: `roomTypeOptions`, amenity-option `disabilityTypes`; drop `petPolicy.hasPolicy` |
| `src/services/object-workspace.ts` | rooms/tags/accessibility read + save serializers |
| `src/features/object-editor/primitives/index.ts` | export new primitives |
| `src/features/object-editor/sections/section-fixture.test-utils.ts` | fixture updates for new fields |
| `src/features/object-editor/sections/SectionContacts.tsx` | role selector |
| `src/features/object-editor/sections/blocks/BlockHEB.tsx` | room/meeting-room modals; pet policy (one toggle) |
| `src/features/object-editor/sections/blocks/BlockVIS.tsx` | remove dead "Animaux" control |
| `src/features/object-editor/sections/SectionCapacity.tsx` | remove pet-policy field |
| `src/features/object-editor/sections/SectionMedia.tsx` | compact grid + modal |
| `src/features/object-editor/sections/media-items.ts` | modal-friendly helpers |
| `src/features/object-editor/sections/SectionTags.tsx` | add-from-library + DnD |
| `src/features/object-editor/sections/SectionClassification.tsx` | value picker (§08) |
| `src/features/object-editor/sections/SectionAccessibility.tsx` | structured §10 rework |

---

# Phase 0 — Foundations (migrations, payload wiring, primitives)

Phase 0 must complete before any later phase. It ships nothing user-visible but is independently testable.

### Migration safety protocol (Tasks 0.2 and 0.3)

M1 and M2 are additive, idempotent, reversible DDL — but they alter the **live** Supabase project
`ryycrdhlkmzpxwwwwupy`. Every migration task MUST follow this protocol. A subagent MUST NOT apply live
DDL on its own initiative.

1. **Pre-flight schema check** — run a read-only `execute_sql` confirming the target table exists and
   the new column does *not* already exist. The migration is idempotent, but a surprise (column already
   present, table missing) means the schema has drifted from this plan — **stop and reconcile** before
   proceeding. For M1, also confirm `ref_code_room_type` exists and the `room_type` domain is populated.
2. **Restore point** — confirm a recent backup / PITR restore point exists (Supabase dashboard →
   Database → Backups). Record its timestamp in the execution log. Do not proceed without one.
3. **Non-production first** — if a staging Supabase project or a local stack (`supabase start`) is
   available, apply and validate the migration there first. If none exists, record explicitly in the
   execution log that no non-production environment is available and the migration goes straight to live.
4. **Explicit approval gate** — applying to the live project is a STOP point. Surface the exact DDL and
   the pre-flight result to the user and obtain explicit approval before the live `apply_migration` call.
5. **Apply + verify** — apply via the Supabase MCP `apply_migration` tool, then run the post-migration
   verification query.
6. **Rollback** — each migration file documents its `DROP COLUMN IF EXISTS` rollback; for M2 also revert
   the RPC to its previous body.

### Task 0.1: Add `@dnd-kit` dependency

**Files:** Modify `bertel-tourism-ui/package.json` (+ `package-lock.json`)

- [ ] **Step 1: Install**

```bash
cd bertel-tourism-ui && npm install @dnd-kit/core@^6 @dnd-kit/sortable@^8 @dnd-kit/utilities@^3
```

- [ ] **Step 2: Verify**

Run: `cd bertel-tourism-ui && npm ls @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities`
Expected: all three resolve with no `UNMET DEPENDENCY`.

- [ ] **Step 3: Commit**

```bash
git add bertel-tourism-ui/package.json bertel-tourism-ui/package-lock.json
git commit -m "chore(ui): add @dnd-kit for tag drag-and-drop"
```

### Task 0.2: Migration M1 — `object_room_type.room_type_id`

**Files:** Create `Base de donnée DLL et API/migration_room_type_ref.sql`

> **Reference source (verified against the live DB).** Room types are `ref_code` rows with
> `domain = 'room_type'` — 10 rows: single, double, twin, triple, family, suite, presidential,
> junior_suite, accessible, connecting — physically stored in the `ref_code_room_type` partition.
> The M1 foreign key targets the partition `ref_code_room_type(id)`: this mirrors the existing
> `object_room_type.view_type_id → ref_code_view_type(id)` FK on the same table, and `ref_code_room_type`
> carries a unique index on `id` (`uq_ref_code_room_type_id`) that makes it a valid FK target. The
> frontend (Task 0.8) reads options via `from('ref_code').eq('domain','room_type')` — the same
> parent-table + domain-filter pattern every other reference list uses in `object-workspace.ts`. The FK
> target and the frontend read resolve to identical rows; they are each the canonical pattern for their
> layer (FK → partition; PostgREST read → parent + domain filter).

- [ ] **Step 1: Write the migration file**

```sql
-- migration_room_type_ref.sql
-- Adds object_room_type.room_type_id, a nullable FK to ref_code_room_type, so the
-- object editor can offer a DB-backed room-type selector. Mirrors the existing
-- object_room_type.view_type_id -> ref_code_view_type pattern on the same table.
--
-- PREREQUISITE: schema_unified.sql applied (object_room_type, ref_code_room_type exist).
-- IDEMPOTENT: ADD COLUMN IF NOT EXISTS.
-- REVERSIBLE: ALTER TABLE object_room_type DROP COLUMN IF EXISTS room_type_id;
-- BACKFILL: none — existing rows keep room_type_id NULL; the free `name` is retained.

BEGIN;

ALTER TABLE IF EXISTS object_room_type
  ADD COLUMN IF NOT EXISTS room_type_id UUID REFERENCES ref_code_room_type(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_object_room_type_room_type_id
  ON object_room_type(room_type_id);

COMMIT;
```

- [ ] **Step 2: Pre-flight schema check** (Migration safety protocol §1)

`execute_sql`:
```sql
SELECT
  to_regclass('public.object_room_type')   IS NOT NULL AS object_room_type_exists,
  to_regclass('public.ref_code_room_type') IS NOT NULL AS ref_code_room_type_exists,
  EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_name='object_room_type' AND column_name='room_type_id') AS column_already_exists,
  (SELECT count(*) FROM ref_code WHERE domain='room_type') AS room_type_ref_count;
```
Expected: `t, t, f, 10`. If `column_already_exists` is `t`, or a table is missing — **stop and reconcile**.

- [ ] **Step 3: Restore point + non-production first** (protocol §2-3)

Confirm a Supabase backup / PITR restore point exists; record its timestamp in the execution log. If a
staging or local Supabase instance is available, apply `migration_room_type_ref.sql` and re-run the
Step 2 check there first; otherwise record that no non-production environment is available.

- [ ] **Step 4: Approval gate — apply to the live database** (protocol §4-5)

Surface the M1 DDL and the Step 2 pre-flight result to the user; obtain explicit approval. Then apply
via the Supabase MCP `apply_migration` tool: name `room_type_ref`, query = the `ALTER TABLE` +
`CREATE INDEX` statements (`apply_migration` manages its own transaction — omit `BEGIN;`/`COMMIT;`).

- [ ] **Step 5: Verify the column exists**

`execute_sql`:
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'object_room_type' AND column_name = 'room_type_id';
```
Expected: one row — `room_type_id | uuid | YES`.

- [ ] **Step 6: Commit**

```bash
git add "Base de donnée DLL et API/migration_room_type_ref.sql"
git commit -m "feat(db): add object_room_type.room_type_id FK to ref_code_room_type"
```

### Task 0.3: Migration M2 — `tag_link.position` + RPC update

**Files:** Create `Base de donnée DLL et API/migration_tag_link_position.sql`; Modify
`Base de donnée DLL et API/object_workspace_gap_rpcs.sql` (function `api.save_object_workspace_tags`)

> **Why this persists order.** `save_object_workspace_tags` does **delete-then-insert**: its first
> statement `DELETE`s every `tag_link` row for the object, then the loop re-inserts them. So `position`
> (and `extra`) are always written fresh on each save — there is no stale row to update. `ON CONFLICT
> (tag_id, target_table, target_pk) DO NOTHING` is purely a dedup guard for a tag listed twice in one
> payload; after the `DELETE` no conflicting row exists, so it never blocks a `position` write. Step 5
> below replaces the **whole function** so the delete-then-insert flow is explicit and unambiguous.

- [ ] **Step 1: Write the migration file**

```sql
-- migration_tag_link_position.sql
-- Adds tag_link.position so per-object tag display order survives reload (drag-and-drop
-- ordering in the editor §09). tag_link previously had no order column.
--
-- PREREQUISITE: schema_unified.sql applied (tag_link exists).
-- IDEMPOTENT: ADD COLUMN IF NOT EXISTS.
-- REVERSIBLE: ALTER TABLE tag_link DROP COLUMN IF EXISTS position;
-- BACKFILL: existing rows default to 0; order normalises on the next per-object tag save.

BEGIN;

ALTER TABLE IF EXISTS tag_link
  ADD COLUMN IF NOT EXISTS position INTEGER NOT NULL DEFAULT 0;

COMMIT;
```

- [ ] **Step 2: Pre-flight schema check** (Migration safety protocol §1)

`execute_sql`:
```sql
SELECT
  to_regclass('public.tag_link') IS NOT NULL AS tag_link_exists,
  EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_name='tag_link' AND column_name='position') AS column_already_exists;
```
Expected: `t, f`. If `column_already_exists` is `t` — **stop and reconcile**.

- [ ] **Step 3: Restore point + non-production first** (protocol §2-3)

Confirm a backup / PITR restore point and record its timestamp. Apply to staging/local first if
available; otherwise record that no non-production environment is available.

- [ ] **Step 4: Approval gate — apply the migration** (protocol §4-5)

Surface the M2 DDL + the Step 2 result; obtain explicit approval. Apply via Supabase MCP
`apply_migration`: name `tag_link_position`, query = the `ALTER TABLE` statement.

- [ ] **Step 5: Rewrite `save_object_workspace_tags` in the SQL file**

In `object_workspace_gap_rpcs.sql`, replace the **entire** `api.save_object_workspace_tags` function
with the version below. It adds `v_ordinality` to `DECLARE`, iterates the payload `WITH ORDINALITY`, and
writes the array index (0-based) to `position`. The leading `DELETE` (delete-then-insert) is unchanged
and is what makes order persist:

```sql
CREATE OR REPLACE FUNCTION api.save_object_workspace_tags(p_object_id text, p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, api, internal
AS $$
DECLARE
  v_counts jsonb := '{}'::jsonb;
  v_warnings text[] := ARRAY[]::text[];
  v_skipped text[] := ARRAY[]::text[];
  v_row jsonb;
  v_ordinality bigint;
  v_tag_id uuid;
  v_slug text;
  v_count integer;
  v_inserted integer := 0;
BEGIN
  PERFORM internal.workspace_assert_can_write_object(p_object_id);
  p_payload := COALESCE(p_payload, '{}'::jsonb);

  IF NOT (p_payload ? 'tags') THEN
    RAISE EXCEPTION 'Payload is missing required key "tags"' USING ERRCODE = '22023';
  END IF;

  -- Delete-then-insert: each save fully rewrites this object's tag_link rows, so
  -- `position` and `extra` are always written fresh. After this DELETE there are no
  -- pre-existing rows for the object, so ON CONFLICT DO NOTHING below only dedups a
  -- tag listed twice in one payload (the earliest/leftmost position wins).
  DELETE FROM public.tag_link
   WHERE target_table = 'object'
     AND target_pk = p_object_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('tag_link_deleted', v_count);

  FOR v_row, v_ordinality IN
    SELECT value, ordinality
    FROM jsonb_array_elements(internal.workspace_jsonb_array(p_payload->'tags'))
      WITH ORDINALITY AS t(value, ordinality)
  LOOP
    v_tag_id := internal.workspace_uuid(v_row->>'tag_id');
    v_slug := NULLIF(v_row->>'slug', '');

    IF v_tag_id IS NULL AND v_slug IS NOT NULL THEN
      SELECT id INTO v_tag_id FROM public.ref_tag WHERE lower(slug) = lower(v_slug) LIMIT 1;
    END IF;

    IF v_tag_id IS NULL THEN
      RAISE EXCEPTION 'Unknown tag reference (tag_id="%", slug="%")', v_row->>'tag_id', v_slug
        USING ERRCODE = '23503';
    END IF;

    INSERT INTO public.tag_link (tag_id, target_table, target_pk, position, extra)
    VALUES (
      v_tag_id,
      'object',
      p_object_id,
      (v_ordinality - 1)::integer,
      internal.workspace_jsonb_object(v_row->'extra')
    )
    ON CONFLICT (tag_id, target_table, target_pk) DO NOTHING;
    v_inserted := v_inserted + 1;
  END LOOP;

  v_counts := v_counts || jsonb_build_object('tag_link_inserted', v_inserted);

  RETURN internal.workspace_result(true, v_counts, v_skipped, v_warnings);
END;
$$;

REVOKE ALL ON FUNCTION api.save_object_workspace_tags(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.save_object_workspace_tags(text, jsonb) TO authenticated, service_role;
```

- [ ] **Step 6: Approval gate — apply the updated function** (protocol §4)

Surface the new function body; obtain explicit approval. Apply the full `CREATE OR REPLACE FUNCTION …`
(including the `REVOKE`/`GRANT` lines) to the live DB via Supabase MCP `apply_migration` (name
`save_object_workspace_tags_position`).

- [ ] **Step 7: Verify column + function**

`execute_sql`:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'tag_link' AND column_name = 'position';
```
Expected: one row `position`.

- [ ] **Step 8: Commit**

```bash
git add "Base de donnée DLL et API/migration_tag_link_position.sql" "Base de donnée DLL et API/object_workspace_gap_rpcs.sql"
git commit -m "feat(db): persist per-object tag order via tag_link.position"
```

### Task 0.4: `ReferenceSelect` primitive

**Files:**
- Create: `src/features/object-editor/primitives/ReferenceSelect.tsx`
- Create: `src/features/object-editor/primitives/ReferenceSelect.test.tsx`
- Modify: `src/features/object-editor/primitives/index.ts`

- [ ] **Step 1: Write the failing test**

`ReferenceSelect.test.tsx`:
```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { ReferenceSelect } from './ReferenceSelect';

const options = [
  { id: 'k1', code: 'phone', label: 'Téléphone' },
  { id: 'k2', code: 'email', label: 'E-mail' },
];

describe('ReferenceSelect', () => {
  it('renders options and reports the picked code', () => {
    const onChange = jest.fn();
    render(<ReferenceSelect value="phone" options={options} onChange={onChange} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'email' } });
    expect(onChange).toHaveBeenCalledWith('email', options[1]);
  });

  it('shows a stale value that is not in the options instead of rendering blank', () => {
    render(<ReferenceSelect value="legacy_code" options={options} onChange={() => {}} />);
    expect(screen.getByRole('combobox')).toHaveValue('legacy_code');
    expect(screen.getByText('legacy_code')).toBeInTheDocument();
  });

  it('prepends an empty entry when allowEmpty is set', () => {
    render(<ReferenceSelect value="" options={options} onChange={() => {}} allowEmpty emptyLabel="— Aucun —" />);
    expect(screen.getByRole('option', { name: '— Aucun —' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd bertel-tourism-ui && npx jest src/features/object-editor/primitives/ReferenceSelect.test.tsx`
Expected: FAIL — `Cannot find module './ReferenceSelect'`.

- [ ] **Step 3: Write the implementation**

`ReferenceSelect.tsx`:
```tsx
import type { WorkspaceReferenceOption } from '../../../services/object-workspace-parser';

interface ReferenceSelectProps {
  value: string;
  options: WorkspaceReferenceOption[];
  onChange: (code: string, option: WorkspaceReferenceOption | null) => void;
  allowEmpty?: boolean;
  emptyLabel?: string;
  placeholder?: string;
}

/**
 * <select> bound to workspace reference data. Always renders the current value —
 * a code absent from `options` (stale/legacy data) is shown as its own entry
 * rather than collapsing the control to a blank selection.
 */
export function ReferenceSelect({
  value,
  options,
  onChange,
  allowEmpty = false,
  emptyLabel = '—',
  placeholder,
}: ReferenceSelectProps) {
  const known = options.some((o) => o.code === value);
  return (
    <select
      className="ed-select"
      value={value}
      onChange={(e) => {
        const next = e.target.value;
        onChange(next, options.find((o) => o.code === next) ?? null);
      }}
    >
      {allowEmpty && <option value="">{emptyLabel}</option>}
      {!allowEmpty && value === '' && placeholder && (
        <option value="" disabled>{placeholder}</option>
      )}
      {options.map((o) => (
        <option key={o.id || o.code} value={o.code}>{o.label}</option>
      ))}
      {!known && value !== '' && <option value={value}>{value}</option>}
    </select>
  );
}
```

- [ ] **Step 4: Export from the primitives barrel**

In `primitives/index.ts`, add: `export { ReferenceSelect } from './ReferenceSelect';`

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd bertel-tourism-ui && npx jest src/features/object-editor/primitives/ReferenceSelect.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/features/object-editor/primitives/ReferenceSelect.tsx src/features/object-editor/primitives/ReferenceSelect.test.tsx src/features/object-editor/primitives/index.ts
git commit -m "feat(ui): add ReferenceSelect primitive for reference-backed selects"
```

### Task 0.5: `ChipMultiSelect` primitive

**Files:**
- Create: `src/features/object-editor/primitives/ChipMultiSelect.tsx`, `ChipMultiSelect.test.tsx`
- Modify: `src/features/object-editor/primitives/index.ts`

- [ ] **Step 1: Write the failing test**

`ChipMultiSelect.test.tsx`:
```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { ChipMultiSelect } from './ChipMultiSelect';

const options = [
  { code: 'wifi', label: 'Wi-Fi' },
  { code: 'pool', label: 'Piscine' },
];

describe('ChipMultiSelect', () => {
  it('marks selected options and toggles on click', () => {
    const onToggle = jest.fn();
    render(<ChipMultiSelect options={options} selected={['wifi']} onToggle={onToggle} />);
    expect(screen.getByRole('button', { name: 'Wi-Fi' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Piscine' })).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Piscine' }));
    expect(onToggle).toHaveBeenCalledWith('pool');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd bertel-tourism-ui && npx jest src/features/object-editor/primitives/ChipMultiSelect.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`ChipMultiSelect.tsx`:
```tsx
import { Chip, ChipSet } from './index';

interface ChipMultiSelectProps {
  options: { code: string; label: string }[];
  selected: string[];
  onToggle: (code: string) => void;
  sm?: boolean;
}

/** Chip-toggle multiselect over a flat option list. Selected ⇄ codes array. */
export function ChipMultiSelect({ options, selected, onToggle, sm }: ChipMultiSelectProps) {
  return (
    <ChipSet>
      {options.map((option) => (
        <Chip
          key={option.code}
          label={option.label}
          on={selected.includes(option.code)}
          onClick={() => onToggle(option.code)}
          sm={sm}
        />
      ))}
    </ChipSet>
  );
}
```

> Note: confirm `Chip` renders `aria-pressed` from its `on` prop. If it does not, add
> `aria-pressed={Boolean(on)}` to the `<button>` in `primitives/Chip.tsx` as part of this task
> (and keep that change in the same commit).

- [ ] **Step 4: Export from the barrel**

In `primitives/index.ts`, add: `export { ChipMultiSelect } from './ChipMultiSelect';`

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd bertel-tourism-ui && npx jest src/features/object-editor/primitives/ChipMultiSelect.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/object-editor/primitives/ChipMultiSelect.tsx src/features/object-editor/primitives/ChipMultiSelect.test.tsx src/features/object-editor/primitives/index.ts src/features/object-editor/primitives/Chip.tsx
git commit -m "feat(ui): add ChipMultiSelect primitive"
```

### Task 0.6: `SortableList` primitive

**Files:**
- Create: `src/features/object-editor/primitives/SortableList.tsx`, `SortableList.test.tsx`
- Modify: `src/features/object-editor/primitives/index.ts`

- [ ] **Step 1: Write the failing test**

`SortableList.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { SortableList } from './SortableList';

describe('SortableList', () => {
  it('renders each item with a drag handle in order', () => {
    render(
      <SortableList
        items={[{ id: 'a' }, { id: 'b' }]}
        getId={(it) => it.id}
        onReorder={() => {}}
        renderItem={(it) => <span>{it.id}</span>}
      />,
    );
    expect(screen.getAllByRole('button', { name: /déplacer/i })).toHaveLength(2);
    expect(screen.getByText('a')).toBeInTheDocument();
    expect(screen.getByText('b')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd bertel-tourism-ui && npx jest src/features/object-editor/primitives/SortableList.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`SortableList.tsx`:
```tsx
import type { ReactNode } from 'react';
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, sortableKeyboardCoordinates, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface SortableListProps<T> {
  items: T[];
  getId: (item: T) => string;
  onReorder: (next: T[]) => void;
  renderItem: (item: T, index: number) => ReactNode;
}

function SortableRow({ id, children }: { id: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      className="rep-row"
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 }}
    >
      <button type="button" className="rep-row__handle" aria-label="Déplacer" {...attributes} {...listeners} />
      {children}
    </div>
  );
}

/** Vertical drag-and-drop list. Keyboard accessible (dnd-kit KeyboardSensor). */
export function SortableList<T>({ items, getId, onReorder, renderItem }: SortableListProps<T>) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = items.findIndex((it) => getId(it) === active.id);
    const to = items.findIndex((it) => getId(it) === over.id);
    if (from === -1 || to === -1) return;
    onReorder(arrayMove(items, from, to));
  }
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map(getId)} strategy={verticalListSortingStrategy}>
        <div className="repeater">
          {items.map((item, index) => (
            <SortableRow key={getId(item)} id={getId(item)}>
              {renderItem(item, index)}
            </SortableRow>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
```

- [ ] **Step 4: Export from the barrel**

In `primitives/index.ts`, add: `export { SortableList } from './SortableList';`

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd bertel-tourism-ui && npx jest src/features/object-editor/primitives/SortableList.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/object-editor/primitives/SortableList.tsx src/features/object-editor/primitives/SortableList.test.tsx src/features/object-editor/primitives/index.ts
git commit -m "feat(ui): add SortableList drag-and-drop primitive"
```

### Task 0.7: `EditorModal` primitive

**Files:**
- Create: `src/features/object-editor/primitives/EditorModal.tsx`, `EditorModal.test.tsx`
- Modify: `src/features/object-editor/primitives/index.ts`

- [ ] **Step 1: Write the failing test**

`EditorModal.test.tsx`:
```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { EditorModal } from './EditorModal';

describe('EditorModal', () => {
  it('renders title + children when open and fires save/cancel', () => {
    const onSave = jest.fn();
    const onClose = jest.fn();
    render(
      <EditorModal open title="Modifier le média" onClose={onClose} onSave={onSave}>
        <p>Corps</p>
      </EditorModal>,
    );
    expect(screen.getByText('Modifier le média')).toBeInTheDocument();
    expect(screen.getByText('Corps')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(onSave).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('renders nothing when closed', () => {
    render(<EditorModal open={false} title="X" onClose={() => {}} onSave={() => {}}><p>Corps</p></EditorModal>);
    expect(screen.queryByText('Corps')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd bertel-tourism-ui && npx jest src/features/object-editor/primitives/EditorModal.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`EditorModal.tsx` — wrap the existing Radix dialog in `src/components/ui/dialog.tsx`. Inspect that file
first for its exported component names; the implementation below assumes the standard shadcn export set
(`Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogFooter`). Adjust import names to match.

```tsx
import type { ReactNode } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../../components/ui/dialog';

interface EditorModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  onSave: () => void;
  saveLabel?: string;
  children: ReactNode;
}

/** Focused add/edit modal for editor sub-records (media, rooms). Save/Cancel footer. */
export function EditorModal({ open, title, onClose, onSave, saveLabel = 'Enregistrer', children }: EditorModalProps) {
  return (
    <Dialog open={open} onOpenChange={(next: boolean) => { if (!next) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="ed-modal__body">{children}</div>
        <DialogFooter>
          <button type="button" className="btn btn--ghost" onClick={onClose}>Annuler</button>
          <button type="button" className="btn btn--primary" onClick={onSave}>{saveLabel}</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Export from the barrel**

In `primitives/index.ts`, add: `export { EditorModal } from './EditorModal';`

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd bertel-tourism-ui && npx jest src/features/object-editor/primitives/EditorModal.test.tsx`
Expected: PASS (2 tests). If Radix export names differ, fix the imports and re-run.

- [ ] **Step 6: Commit**

```bash
git add src/features/object-editor/primitives/EditorModal.tsx src/features/object-editor/primitives/EditorModal.test.tsx src/features/object-editor/primitives/index.ts
git commit -m "feat(ui): add EditorModal primitive over Radix dialog"
```

### Task 0.8: Workspace wiring — rooms `room_type_id`

**Files:**
- Modify: `src/services/object-workspace-parser.ts` (`ObjectWorkspaceRoomTypeItem`, `ObjectWorkspaceRoomsModule`)
- Modify: `src/services/object-workspace.ts` (rooms read query `.select(...)`, room row → item mapping, rooms save serializer)
- Modify: `src/features/object-editor/sections/section-fixture.test-utils.ts` (rooms fixture)
- Modify: `src/features/object-editor/sections/blocks/BlockHEB.tsx` (the `createRoom` factory literal)

- [ ] **Step 1: Extend the types**

In `object-workspace-parser.ts`:
- `ObjectWorkspaceRoomTypeItem` — add `roomTypeId: string;`, `roomTypeCode: string;`, `roomTypeLabel: string;`
- `ObjectWorkspaceRoomsModule` — add `roomTypeOptions: WorkspaceReferenceOption[];`

- [ ] **Step 2: Update the fixture (failing compile is the signal)**

In `section-fixture.test-utils.ts`, the `rooms` object: add `roomTypeOptions: [{ id: 'rt1', code: 'double', label: 'Chambre double' }]`, and on the room item add `roomTypeId: 'rt1', roomTypeCode: 'double', roomTypeLabel: 'Chambre double'`.

- [ ] **Step 3: Run the type check to verify it fails**

Run: `cd bertel-tourism-ui && npx tsc -p tsconfig.app.json --noEmit`
Expected: errors in `object-workspace.ts` (rooms read mapping + serializer) **and** in `BlockHEB.tsx`
(`createRoom` builds an `ObjectWorkspaceRoomTypeItem` literal now missing the three new fields).

- [ ] **Step 4: Wire the read + save, and fix `createRoom`**

In `object-workspace.ts`: locate the rooms read query (the `.select('id, code, name, … view_type_id,
base_price, …')` for `object_room_type`, near line 2178) and add `room_type_id` to the select list. In
the row→item mapping (near line 2268) add:
```ts
roomTypeId: readString(row.room_type_id),
roomTypeCode: '',   // resolved from roomTypeOptions below
roomTypeLabel: '',
```
After options are loaded, resolve `roomTypeCode`/`roomTypeLabel` from `roomTypeOptions` by id (mirror how
`viewType*` is resolved). Load `roomTypeOptions` via the parent table + domain filter — the established
pattern for every reference list in this file:
```ts
client.from('ref_code').select('id, code, name').eq('domain', 'room_type').order('position', { ascending: true })
```
In the rooms save serializer (the room write near line 3810, where `is_accessible: item.accessible` is
set) add `room_type_id: item.roomTypeId || null`.

In `BlockHEB.tsx`, update the `createRoom` factory to initialise the three new fields —
`roomTypeId: '', roomTypeCode: '', roomTypeLabel: ''` — otherwise the file does not compile.

- [ ] **Step 5: Run the type check to verify it passes**

Run: `cd bertel-tourism-ui && npx tsc -p tsconfig.app.json --noEmit`
Expected: no errors — `object-workspace.ts` and `BlockHEB.tsx` both compile.

- [ ] **Step 6: Round-trip verification (live DB)**

Pick a test object id, save a room with a `room_type_id`, then `execute_sql`:
```sql
SELECT id, name, room_type_id FROM object_room_type WHERE object_id = '<test-object-id>';
```
Expected: the saved room row shows the chosen `room_type_id`.

- [ ] **Step 7: Commit**

```bash
git add src/services/object-workspace-parser.ts src/services/object-workspace.ts src/features/object-editor/sections/section-fixture.test-utils.ts src/features/object-editor/sections/blocks/BlockHEB.tsx
git commit -m "feat(ui): wire room_type_id through the rooms workspace module"
```

### Task 0.9: Workspace wiring — tag order + color precedence

**Files:** Modify `src/services/object-workspace.ts` (tag read query + tag save serializer)

- [ ] **Step 1: Write the failing test**

Create `src/services/object-workspace.tags.test.ts`:
```ts
import { normalizeTagColorVariant } from './object-workspace-parser';

// Pins the color-precedence contract: a per-object override in tag_link.extra
// must win over the global ref_tag.color.
describe('tag color precedence', () => {
  it('prefers tag_link.extra.color_variant over ref_tag.color', () => {
    // resolveTagColor is the helper extracted in Step 3.
    const { resolveTagColor } = require('./object-workspace');
    expect(resolveTagColor({ color: 'teal' }, { color_variant: 'orange' })).toBe('orange');
    expect(resolveTagColor({ color: 'teal' }, {})).toBe('teal');
    expect(resolveTagColor({}, {})).toBe('neutral');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd bertel-tourism-ui && npx jest src/services/object-workspace.tags.test.ts`
Expected: FAIL — `resolveTagColor` is not exported.

- [ ] **Step 3: Implement `resolveTagColor` + flip precedence**

In `object-workspace.ts`, add and export:
```ts
export function resolveTagColor(
  refTag: { color?: unknown },
  linkExtra: { color_variant?: unknown },
): string {
  return (
    normalizeTagColorVariant(
      readString(linkExtra?.color_variant, readString(refTag?.color, 'neutral')),
    )
  );
}
```
Replace the existing tag-color read (parser line ~2668 `colorVariant: normalizeTagColorVariant(readString(record.color, readString(extra.color_variant, 'teal')))`) so the precedence is `extra.color_variant` first, then `record.color`, default `'neutral'` — i.e. call `resolveTagColor`. In the tag read query, add `position` to the `tag_link` select and `ORDER BY position ASC`. In the tag save serializer, for each displayed tag set `extra: { color_variant: tag.colorVariant, source: tag.source }` (array index → `position` is handled by the RPC from Task 0.3).

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd bertel-tourism-ui && npx jest src/services/object-workspace.tags.test.ts`
Expected: PASS.

- [ ] **Step 5: Type check**

Run: `cd bertel-tourism-ui && npx tsc -p tsconfig.app.json --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/services/object-workspace.ts src/services/object-workspace-parser.ts src/services/object-workspace.tags.test.ts
git commit -m "feat(ui): order workspace tags by position and prefer per-object color"
```

### Task 0.10: Workspace wiring — accessibility amenity disability types

**Files:**
- Modify: `src/services/object-workspace-parser.ts` (amenity option type)
- Modify: `src/services/object-workspace.ts` (amenity-group read)
- Modify: `src/features/object-editor/sections/section-fixture.test-utils.ts`

- [ ] **Step 1: Extend the amenity-option type**

In `object-workspace-parser.ts`, change `ObjectWorkspaceAmenityGroup.options` from
`WorkspaceReferenceOption[]` to `ObjectWorkspaceAmenityOption[]`, where:
```ts
export interface ObjectWorkspaceAmenityOption extends WorkspaceReferenceOption {
  disabilityTypes: string[];
}
```

- [ ] **Step 2: Update the fixture**

In `section-fixture.test-utils.ts`, `characteristics.amenityGroups`: give the `accessibility` family
option `disabilityTypes: ['motor']`, and the `services` family option `disabilityTypes: []`.

- [ ] **Step 3: Run the type check to verify it fails**

Run: `cd bertel-tourism-ui && npx tsc -p tsconfig.app.json --noEmit`
Expected: errors where `amenityGroups` options are built in `object-workspace.ts`.

- [ ] **Step 4: Wire the read**

In `object-workspace.ts`, where `ref_amenity` rows are loaded for `amenityGroups`, add `extra` to the
`.select(...)`, and map `disabilityTypes: readStringList((row.extra as Record<string, unknown>)?.disability_types)`
for every amenity option. (For non-accessibility families this is `[]`.)

- [ ] **Step 5: Run the type check to verify it passes**

Run: `cd bertel-tourism-ui && npx tsc -p tsconfig.app.json --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/services/object-workspace-parser.ts src/services/object-workspace.ts src/features/object-editor/sections/section-fixture.test-utils.ts
git commit -m "feat(ui): expose disability types on accessibility amenity options"
```

---

# Phase 1 — Contacts + Pet policy

### Task 1.1: Contacts §04 — add the role selector

**Files:** Modify `src/features/object-editor/sections/SectionContacts.tsx`, `SectionContacts.test.tsx`

- [ ] **Step 1: Write the failing test**

Append to `SectionContacts.test.tsx` (and add `roleOptions` to `modulesWithOneContact()`:
`roleOptions: [{ id: 'r1', code: 'reservation', label: 'Réservation' }]`):
```tsx
it('lets the user pick a contact role from reference data', () => {
  const modules = modulesWithOneContact();
  modules.contacts.roleOptions = [{ id: 'r1', code: 'reservation', label: 'Réservation' }];
  const { result } = renderHook(() => useObjectEditorState('o1', modules));
  const view = render(<SectionContacts editor={result.current} permissions={allowAll} />);
  const selects = screen.getAllByRole('combobox');
  // [0] = kind, [1] = role
  act(() => { fireEvent.change(selects[1], { target: { value: 'reservation' } }); });
  view.rerender(<SectionContacts editor={result.current} permissions={allowAll} />);
  expect(result.current.draft.contacts.objectItems[0].roleCode).toBe('reservation');
  expect(result.current.dirtySections.contacts).toBe(true);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd bertel-tourism-ui && npx jest src/features/object-editor/sections/SectionContacts.test.tsx`
Expected: FAIL — only one combobox (no role select).

- [ ] **Step 3: Add the role selector**

In `SectionContacts.tsx`: import `ReferenceSelect`. Change the `Repeater` `columns` prop to add a column
(e.g. `'14px 120px 130px 1fr auto auto'`). In `renderRow`, after the kind `<Select>`, insert:
```tsx
<ReferenceSelect
  value={it.roleCode}
  options={contacts.roleOptions}
  allowEmpty
  emptyLabel="— Aucun rôle —"
  onChange={(code, opt) =>
    updateItem(it.id, { roleCode: code, roleId: opt?.id ?? '', roleLabel: opt?.label ?? '' })
  }
/>
```
Leave `addItem` as-is (empty role is valid — `contact_channel.role_id` is nullable).

- [ ] **Step 4: Run to verify it passes**

Run: `cd bertel-tourism-ui && npx jest src/features/object-editor/sections/SectionContacts.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Verify the save serializer keeps `role_id`**

Inspect `saveObjectWorkspaceContacts` in `object-workspace.ts`: confirm the contact insert/update writes
`role_id: item.roleId || null`. If it omits `role_id`, add it. Re-run the test.

- [ ] **Step 6: Commit**

```bash
git add src/features/object-editor/sections/SectionContacts.tsx src/features/object-editor/sections/SectionContacts.test.tsx src/services/object-workspace.ts
git commit -m "feat(ui): add contact role selector backed by ref_contact_role"
```

> **Phase 1 ordering (every commit compiles).** The `hasPolicy` field is a frontend fabrication with no
> DB column. Removing it from the type breaks its two consumers (`BlockHEB`, `SectionCapacity`), so the
> tasks are ordered **consumers first, type-removal last**: 1.2 rewrites `BlockHEB` to stop using
> `hasPolicy`, 1.3 removes the pet field from `SectionCapacity`, and only then 1.4 deletes the field
> from the type/parser/fixture. After every task in this phase the repo type-checks cleanly.

### Task 1.2: Pet policy — BlockHEB one toggle + conditional textarea

**Files:** Modify `src/features/object-editor/sections/blocks/BlockHEB.tsx`; Create `BlockHEB.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/features/object-editor/sections/blocks/BlockHEB.test.tsx`. The test **mutates** individual
`petPolicy` fields rather than reassigning the whole object — `hasPolicy` still exists on the type at
this point (it is removed in Task 1.4), so a full `{ accepted, conditions }` literal would not compile:
```tsx
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { useObjectEditorState } from '../../useObjectEditorState';
import { BlockHEB } from './BlockHEB';
import { allowAll, fullModulesFixture } from '../section-fixture.test-utils';

describe('BlockHEB pet policy', () => {
  it('hides the conditions textarea until pets are accepted', () => {
    const modules = fullModulesFixture();
    modules.capacityPolicies.petPolicy.accepted = false;
    modules.capacityPolicies.petPolicy.conditions = '';
    const { result } = renderHook(() => useObjectEditorState('o1', modules));
    const view = render(<BlockHEB editor={result.current} permissions={allowAll} archetype="HEB" />);

    expect(screen.queryByLabelText("Conditions d'accueil des animaux")).not.toBeInTheDocument();

    act(() => { fireEvent.click(screen.getByLabelText('Animaux acceptés')); });
    view.rerender(<BlockHEB editor={result.current} permissions={allowAll} archetype="HEB" />);

    expect(result.current.draft.capacityPolicies.petPolicy.accepted).toBe(true);
    expect(screen.getByLabelText("Conditions d'accueil des animaux")).toBeInTheDocument();
  });

  it('renders no "Politique animaux renseignée" toggle', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<BlockHEB editor={result.current} permissions={allowAll} archetype="HEB" />);
    expect(screen.queryByText(/Politique animaux renseignée/i)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd bertel-tourism-ui && npx jest src/features/object-editor/sections/blocks/BlockHEB.test.tsx`
Expected: FAIL — the "Politique animaux renseignée" toggle still exists; conditions textarea logic absent.

- [ ] **Step 3: Rewrite the pet-policy block in `BlockHEB.tsx`**

Replace the third `<Toggle>` in the `grid-3` "Politiques d'accueil" block (the `petPolicy.hasPolicy`
toggle, lines ~278-287) — delete it. Replace the "Animaux acceptés" toggle (lines ~256-266) with a
toggle + conditional textarea. The toggle's `onChange` sets only `accepted` — it does **not** set
`hasPolicy`; the `{ ...capacity.petPolicy, accepted }` spread harmlessly carries the still-present
`hasPolicy` field until Task 1.4 removes it:
```tsx
<div>
  <Toggle
    label="Animaux acceptés"
    on={capacity.petPolicy.accepted}
    onChange={(accepted) =>
      editor.replaceModule('capacityPolicies', {
        ...capacity,
        petPolicy: { ...capacity.petPolicy, accepted },
      })
    }
  />
  {capacity.petPolicy.accepted && (
    <Field label="Conditions d'accueil des animaux">
      <Textarea
        value={capacity.petPolicy.conditions}
        rows={3}
        onChange={(conditions) =>
          editor.replaceModule('capacityPolicies', {
            ...capacity,
            petPolicy: { ...capacity.petPolicy, conditions },
          })
        }
      />
    </Field>
  )}
</div>
```
Ensure `Field` and `Textarea` are imported. The `Toggle`'s `label` must be the accessible name for
`getByLabelText` — if `Toggle` does not associate its label, wrap with `<label>` or pass an `id`/`htmlFor`.

- [ ] **Step 4: Run to verify it passes and the repo compiles**

Run: `cd bertel-tourism-ui && npx jest src/features/object-editor/sections/blocks/BlockHEB.test.tsx`
Run: `cd bertel-tourism-ui && npx tsc -p tsconfig.app.json --noEmit`
Expected: tests PASS (2); type check clean — `hasPolicy` still exists on the type and `SectionCapacity.tsx`
is untouched, so both still compile.

- [ ] **Step 5: Commit**

```bash
git add src/features/object-editor/sections/blocks/BlockHEB.tsx src/features/object-editor/sections/blocks/BlockHEB.test.tsx
git commit -m "feat(ui): consolidate pet policy to one toggle + conditional details in BlockHEB"
```

### Task 1.3: Pet policy — remove the field from SectionCapacity §07

**Files:** Modify `src/features/object-editor/sections/SectionCapacity.tsx`; Create `SectionCapacity.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/features/object-editor/sections/SectionCapacity.test.tsx`:
```tsx
import { render, renderHook, screen } from '@testing-library/react';
import { useObjectEditorState } from '../useObjectEditorState';
import { SectionCapacity } from './SectionCapacity';
import { allowAll, fullModulesFixture } from './section-fixture.test-utils';

describe('SectionCapacity', () => {
  it('no longer renders the pet-policy field (moved to BlockHEB)', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<SectionCapacity editor={result.current} permissions={allowAll} />);
    expect(screen.queryByText('Animaux')).not.toBeInTheDocument();
    // Group policy stays in §07.
    expect(screen.getByText('Groupes')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd bertel-tourism-ui && npx jest src/features/object-editor/sections/SectionCapacity.test.tsx`
Expected: FAIL — the "Animaux" `<Field>` still renders.

- [ ] **Step 3: Remove the pet-policy field**

In `SectionCapacity.tsx`, delete the entire `<Field label="Animaux">…</Field>` block (lines ~202-233).
After removal `SectionCapacity` no longer references `capacity.petPolicy` at all. The `grid-2` wrapper
that held Groupes + Animaux now has a single child — remove the `grid-2` wrapper so Groupes is a plain
full-width `Field`.

- [ ] **Step 4: Run to verify it passes and the repo compiles**

Run: `cd bertel-tourism-ui && npx jest src/features/object-editor/sections/SectionCapacity.test.tsx`
Run: `cd bertel-tourism-ui && npx tsc -p tsconfig.app.json --noEmit`
Expected: test PASS; type check clean — `hasPolicy` still exists on the type, but no file references it
now (`BlockHEB` cleaned in Task 1.2, `SectionCapacity` here), so the repo still compiles.

- [ ] **Step 5: Commit**

```bash
git add src/features/object-editor/sections/SectionCapacity.tsx src/features/object-editor/sections/SectionCapacity.test.tsx
git commit -m "refactor(ui): remove duplicate pet-policy field from SectionCapacity"
```

### Task 1.4: Pet policy — remove the fabricated `hasPolicy` flag

**Files:** Modify `src/services/object-workspace-parser.ts`, `src/features/object-editor/sections/section-fixture.test-utils.ts`

This is a **refactor** — `hasPolicy` has no DB column and, after Tasks 1.2-1.3, no consumer. The change
is type-level (TS types are erased at runtime), so it has no new failing test; verification is a clean
type check plus the existing suite staying green.

- [ ] **Step 1: Remove `hasPolicy`**

In `object-workspace-parser.ts`: in `ObjectWorkspacePetPolicyForm`, delete the `hasPolicy: boolean;`
line; in the parser body (near line 1511) delete the `hasPolicy: Object.keys(petPolicyRecord).length > 0,`
line. In `section-fixture.test-utils.ts`, change `capacityPolicies.petPolicy` to
`{ accepted: false, conditions: 'Petits animaux' }` (drop `hasPolicy`).

- [ ] **Step 2: Verify the repo compiles**

Run: `cd bertel-tourism-ui && npx tsc -p tsconfig.app.json --noEmit`
Expected: no errors. If a file still references `hasPolicy`, a consumer was missed — fix it before
committing (a commit must never leave the repo non-compiling).

- [ ] **Step 3: Confirm the save serializer + run the suite**

Inspect `saveObjectWorkspaceCapacityPolicies` in `object-workspace.ts`: confirm the `object_pet_policy`
write uses only `accepted` + `conditions`. Then run the editor + service suites:
Run: `cd bertel-tourism-ui && npx jest src/features/object-editor src/services/object-workspace`
Expected: green — no test asserts on `hasPolicy` (if one does, update it here).

- [ ] **Step 4: Commit**

```bash
git add src/services/object-workspace-parser.ts src/features/object-editor/sections/section-fixture.test-utils.ts
git commit -m "refactor(ui): drop fabricated petPolicy.hasPolicy flag (no DB column)"
```

### Task 1.5: Pet policy — remove the dead control from BlockVIS

**Files:** Modify `src/features/object-editor/sections/blocks/BlockVIS.tsx`

- [ ] **Step 1: Locate and remove**

In `BlockVIS.tsx` (line ~150) remove the dead `<TriState label="Animaux" value="no" onChange={() => undefined} />`
— it is a no-op control bound to nothing. Remove the now-unused `TriState` import if it has no other use in the file.

- [ ] **Step 2: Type check + existing tests**

Run: `cd bertel-tourism-ui && npx tsc -p tsconfig.app.json --noEmit`
Run: `cd bertel-tourism-ui && npx jest src/features/object-editor/sections/blocks`
Expected: no type errors; block tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/features/object-editor/sections/blocks/BlockVIS.tsx
git commit -m "refactor(ui): remove dead no-op Animaux control from BlockVIS"
```

---

# Phase 2 — Rooms

### Task 2.1: `RoomEditModal` widget

**Files:** Create `src/features/object-editor/widgets/RoomEditModal.tsx`, `RoomEditModal.test.tsx`

- [ ] **Step 1: Write the failing test**

`RoomEditModal.test.tsx`:
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
  it('edits room type + amenities and returns the patched room on save', () => {
    const onSave = jest.fn();
    render(<RoomEditModal open room={room} module={mod} onClose={() => {}} onSave={onSave} />);
    fireEvent.change(screen.getByLabelText('Type de chambre'), { target: { value: 'double' } });
    fireEvent.click(screen.getByRole('button', { name: 'Wi-Fi' }));
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    const saved = onSave.mock.calls[0][0] as ObjectWorkspaceRoomTypeItem;
    expect(saved.roomTypeCode).toBe('double');
    expect(saved.amenityCodes).toEqual(['wifi']);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd bertel-tourism-ui && npx jest src/features/object-editor/widgets/RoomEditModal.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`RoomEditModal.tsx` — a draft-copy editor over `EditorModal`, using `ReferenceSelect` for type & view,
`ChipMultiSelect` for amenities, and `Input`/`Textarea` for the scalar fields. Skeleton:
```tsx
import { useState } from 'react';
import { EditorModal, ReferenceSelect, ChipMultiSelect, Field, Input, Textarea, Toggle } from '../primitives';
import type { ObjectWorkspaceRoomTypeItem, ObjectWorkspaceRoomsModule } from '../../../services/object-workspace-parser';

interface RoomEditModalProps {
  open: boolean;
  room: ObjectWorkspaceRoomTypeItem;
  module: Pick<ObjectWorkspaceRoomsModule, 'roomTypeOptions' | 'viewTypeOptions' | 'amenityOptions'>;
  onClose: () => void;
  onSave: (room: ObjectWorkspaceRoomTypeItem) => void;
}

export function RoomEditModal({ open, room, module, onClose, onSave }: RoomEditModalProps) {
  const [draft, setDraft] = useState(room);
  const set = (patch: Partial<ObjectWorkspaceRoomTypeItem>) => setDraft((d) => ({ ...d, ...patch }));
  return (
    <EditorModal open={open} title={draft.name || 'Type de chambre'} onClose={onClose} onSave={() => onSave(draft)}>
      <Field label="Type de chambre">
        <ReferenceSelect
          value={draft.roomTypeCode}
          options={module.roomTypeOptions}
          allowEmpty emptyLabel="— Type non défini —"
          onChange={(code, opt) => set({ roomTypeCode: code, roomTypeId: opt?.id ?? '', roomTypeLabel: opt?.label ?? '' })}
        />
      </Field>
      <Field label="Nom / libellé"><Input value={draft.name} onChange={(name) => set({ name })} /></Field>
      <Field label="Vue">
        <ReferenceSelect
          value={draft.viewTypeCode}
          options={module.viewTypeOptions}
          allowEmpty emptyLabel="— Aucune —"
          onChange={(code, opt) => set({ viewTypeCode: code, viewTypeId: opt?.id ?? '', viewTypeLabel: opt?.label ?? '' })}
        />
      </Field>
      <Field label="Couchages"><Input value={draft.capacityTotal} mono onChange={(capacityTotal) => set({ capacityTotal })} /></Field>
      <Field label="Surface (m²)"><Input value={draft.sizeSqm} mono onChange={(sizeSqm) => set({ sizeSqm })} /></Field>
      <Field label="Configuration lits"><Input value={draft.bedConfig} onChange={(bedConfig) => set({ bedConfig })} /></Field>
      <Field label="Unités"><Input value={draft.quantity} mono onChange={(quantity) => set({ quantity })} /></Field>
      <Field label="Tarif"><Input value={draft.basePrice} mono onChange={(basePrice) => set({ basePrice })} /></Field>
      <Field label="Description"><Textarea value={draft.description} rows={3} onChange={(description) => set({ description })} /></Field>
      <Field label="Équipements">
        <ChipMultiSelect
          options={module.amenityOptions}
          selected={draft.amenityCodes}
          onToggle={(code) => set({
            amenityCodes: draft.amenityCodes.includes(code)
              ? draft.amenityCodes.filter((c) => c !== code)
              : [...draft.amenityCodes, code],
          })}
        />
      </Field>
      <Toggle label="Chambre accessible (PMR)" on={draft.accessible} onChange={(accessible) => set({ accessible })} />
      <Toggle label="Publiée" on={draft.published} onChange={(published) => set({ published })} />
    </EditorModal>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd bertel-tourism-ui && npx jest src/features/object-editor/widgets/RoomEditModal.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/object-editor/widgets/RoomEditModal.tsx src/features/object-editor/widgets/RoomEditModal.test.tsx
git commit -m "feat(ui): add RoomEditModal for per-room type/view/amenity editing"
```

### Task 2.2: BlockHEB rooms — compact rows + modal

**Files:** Modify `src/features/object-editor/sections/blocks/BlockHEB.tsx`, `BlockHEB.test.tsx`

- [ ] **Step 1: Write the failing test**

Append to `BlockHEB.test.tsx`:
```tsx
it('opens the room edit modal and persists per-room amenity changes', () => {
  const modules = fullModulesFixture();
  modules.rooms.amenityOptions = [{ id: 'wifi', code: 'wifi', label: 'Wi-Fi' }, { id: 'ac', code: 'ac', label: 'Clim' }];
  const { result } = renderHook(() => useObjectEditorState('o1', modules));
  const view = render(<BlockHEB editor={result.current} permissions={allowAll} archetype="HEB" />);
  act(() => { fireEvent.click(screen.getByRole('button', { name: /Modifier la chambre/i })); });
  act(() => { fireEvent.click(screen.getByRole('button', { name: 'Clim' })); });
  act(() => { fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' })); });
  view.rerender(<BlockHEB editor={result.current} permissions={allowAll} archetype="HEB" />);
  expect(result.current.draft.rooms.items[0].amenityCodes).toContain('ac');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd bertel-tourism-ui && npx jest src/features/object-editor/sections/blocks/BlockHEB.test.tsx -t 'room edit modal'`
Expected: FAIL — no "Modifier la chambre" button.

- [ ] **Step 3: Wire the modal into BlockHEB**

In `BlockHEB.tsx`: add `const [editingRoom, setEditingRoom] = useState<number | null>(null);`. In the room
`Repeater` `renderRow`, replace the inline name/description/amenity editing with read-only summary cells
plus a `<button … aria-label={`Modifier la chambre ${item.name}`} onClick={() => setEditingRoom(index)}>`.
Delete the `renderAmenityGroup` helper and the `rooms.items[0]`-only amenity block (lines ~100-103, ~202-211).
After the `Repeater`, render the modal:
```tsx
{editingRoom !== null && rooms.items[editingRoom] && (
  <RoomEditModal
    open
    room={rooms.items[editingRoom]}
    module={rooms}
    onClose={() => setEditingRoom(null)}
    onSave={(updated) => {
      updateRoom(editingRoom, updated);
      setEditingRoom(null);
    }}
  />
)}
```
`updateRoom(index, patch)` already exists — it spreads the patch; passing the full `updated` room works.

- [ ] **Step 4: Run to verify it passes**

Run: `cd bertel-tourism-ui && npx jest src/features/object-editor/sections/blocks/BlockHEB.test.tsx`
Expected: PASS (all BlockHEB tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/object-editor/sections/blocks/BlockHEB.tsx src/features/object-editor/sections/blocks/BlockHEB.test.tsx
git commit -m "feat(ui): edit rooms via per-room modal, fixing multi-room amenity editing"
```

### Task 2.3: Meeting rooms — modal + equipment selector

**Files:** Create `src/features/object-editor/widgets/MeetingRoomEditModal.tsx`, `MeetingRoomEditModal.test.tsx`; Modify `BlockHEB.tsx`, `BlockHEB.test.tsx`

- [ ] **Step 1: Write the failing test (modal)**

`MeetingRoomEditModal.test.tsx`:
```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { MeetingRoomEditModal } from './MeetingRoomEditModal';
import type { ObjectWorkspaceMeetingRoomItem } from '../../../services/object-workspace-parser';

const mr: ObjectWorkspaceMeetingRoomItem = {
  recordId: 'mr1', name: 'Salle A', nameTranslations: {}, areaM2: '50',
  capacityTheatre: '40', capacityU: '20', capacityClassroom: '24', capacityBoardroom: '16', equipmentCodes: [],
};

describe('MeetingRoomEditModal', () => {
  it('toggles equipment and returns the patched room on save', () => {
    const onSave = jest.fn();
    render(
      <MeetingRoomEditModal
        open room={mr}
        equipmentOptions={[{ id: 'e1', code: 'projector', label: 'Vidéoprojecteur' }]}
        onClose={() => {}} onSave={onSave}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Vidéoprojecteur' }));
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect((onSave.mock.calls[0][0] as ObjectWorkspaceMeetingRoomItem).equipmentCodes).toEqual(['projector']);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd bertel-tourism-ui && npx jest src/features/object-editor/widgets/MeetingRoomEditModal.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `MeetingRoomEditModal.tsx`**

```tsx
import { useState } from 'react';
import { EditorModal, ChipMultiSelect, Field, Input } from '../primitives';
import type { ObjectWorkspaceMeetingRoomItem, WorkspaceReferenceOption } from '../../../services/object-workspace-parser';

interface Props {
  open: boolean;
  room: ObjectWorkspaceMeetingRoomItem;
  equipmentOptions: WorkspaceReferenceOption[];
  onClose: () => void;
  onSave: (room: ObjectWorkspaceMeetingRoomItem) => void;
}

export function MeetingRoomEditModal({ open, room, equipmentOptions, onClose, onSave }: Props) {
  const [draft, setDraft] = useState(room);
  const set = (patch: Partial<ObjectWorkspaceMeetingRoomItem>) => setDraft((d) => ({ ...d, ...patch }));
  return (
    <EditorModal open={open} title={draft.name || 'Salle de séminaire'} onClose={onClose} onSave={() => onSave(draft)}>
      <Field label="Nom de la salle"><Input value={draft.name} onChange={(name) => set({ name })} /></Field>
      <Field label="Surface (m²)"><Input value={draft.areaM2} mono onChange={(areaM2) => set({ areaM2 })} /></Field>
      <Field label="Capacité théâtre"><Input value={draft.capacityTheatre} mono onChange={(v) => set({ capacityTheatre: v })} /></Field>
      <Field label="Capacité classe"><Input value={draft.capacityClassroom} mono onChange={(v) => set({ capacityClassroom: v })} /></Field>
      <Field label="Capacité banquet"><Input value={draft.capacityBoardroom} mono onChange={(v) => set({ capacityBoardroom: v })} /></Field>
      <Field label="Équipements">
        <ChipMultiSelect
          options={equipmentOptions}
          selected={draft.equipmentCodes}
          onToggle={(code) => set({
            equipmentCodes: draft.equipmentCodes.includes(code)
              ? draft.equipmentCodes.filter((c) => c !== code)
              : [...draft.equipmentCodes, code],
          })}
        />
      </Field>
    </EditorModal>
  );
}
```

- [ ] **Step 4: Run to verify the modal test passes**

Run: `cd bertel-tourism-ui && npx jest src/features/object-editor/widgets/MeetingRoomEditModal.test.tsx`
Expected: PASS.

- [ ] **Step 5: Wire into BlockHEB**

Same pattern as Task 2.2: `const [editingMeeting, setEditingMeeting] = useState<number | null>(null);`,
add a "Modifier la salle" button to each meeting-room row, render `<MeetingRoomEditModal … />` with
`equipmentOptions={meetingRooms.equipmentOptions}` and `onSave` calling `updateMeetingRoom(index, updated)`.

- [ ] **Step 6: Commit**

```bash
git add src/features/object-editor/widgets/MeetingRoomEditModal.tsx src/features/object-editor/widgets/MeetingRoomEditModal.test.tsx src/features/object-editor/sections/blocks/BlockHEB.tsx
git commit -m "feat(ui): add meeting-room modal with equipment selector"
```

---

# Phase 3 — Media

### Task 3.1: `MediaEditModal` widget

**Files:** Create `src/features/object-editor/widgets/MediaEditModal.tsx`, `MediaEditModal.test.tsx`

The modal edits a draft copy of one media item, **including FR/EN/CRE translations** for title and
description (spec §7.3 — `media.title_i18n` / `description_i18n`; in scope, not deferred). The primary
language (`languages[0]`) edits the base `title`/`description`; other languages edit
`titleTranslations[lang]` / `descriptionTranslations[lang]`.

- [ ] **Step 1: Write the failing test**

`MediaEditModal.test.tsx`:
```tsx
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MediaEditModal } from './MediaEditModal';
import type { ObjectWorkspaceMediaItem } from '../../../services/object-workspace-parser';

const media: ObjectWorkspaceMediaItem = {
  id: 'm1', scope: 'object', placeId: null, scopeLabel: 'Objet',
  typeId: 'mt1', typeCode: 'image', typeLabel: 'Image',
  title: 'Façade', titleTranslations: {}, description: '', descriptionTranslations: {},
  url: 'https://x/y.jpg', credit: '', visibility: 'public', position: '0',
  width: '', height: '', rightsExpiresAt: '', kind: 'image', isMain: true, isPublished: true, tags: [],
};

describe('MediaEditModal', () => {
  it('edits base metadata and returns the patched media on save', () => {
    const onSave = jest.fn();
    render(
      <MediaEditModal
        open media={media} languages={['fr', 'en', 'cre']}
        typeOptions={[{ id: 'mt1', code: 'image', label: 'Image' }, { id: 'mt2', code: 'pdf', label: 'PDF' }]}
        onClose={() => {}} onSave={onSave}
      />,
    );
    fireEvent.change(screen.getByLabelText('Titre'), { target: { value: 'Nouvelle façade' } });
    fireEvent.change(screen.getByLabelText('Crédit / auteur'), { target: { value: 'OTI Sud' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    const saved = onSave.mock.calls[0][0] as ObjectWorkspaceMediaItem;
    expect(saved.title).toBe('Nouvelle façade');
    expect(saved.credit).toBe('OTI Sud');
  });

  it('edits a non-primary-language title into titleTranslations', () => {
    const onSave = jest.fn();
    render(
      <MediaEditModal
        open media={media} languages={['fr', 'en', 'cre']}
        typeOptions={[{ id: 'mt1', code: 'image', label: 'Image' }]}
        onClose={() => {}} onSave={onSave}
      />,
    );
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'EN' })); });
    fireEvent.change(screen.getByLabelText('Titre'), { target: { value: 'Front view' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    const saved = onSave.mock.calls[0][0] as ObjectWorkspaceMediaItem;
    expect(saved.title).toBe('Façade');                  // base FR untouched
    expect(saved.titleTranslations.en).toBe('Front view');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd bertel-tourism-ui && npx jest src/features/object-editor/widgets/MediaEditModal.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `MediaEditModal.tsx`**

```tsx
import { useState } from 'react';
import { EditorModal, ReferenceSelect, Field, Input, Textarea, Toggle, Select, LangTabs } from '../primitives';
import type { ObjectWorkspaceMediaItem, WorkspaceReferenceOption } from '../../../services/object-workspace-parser';

interface Props {
  open: boolean;
  media: ObjectWorkspaceMediaItem;
  typeOptions: WorkspaceReferenceOption[];
  languages: string[];
  onClose: () => void;
  onSave: (media: ObjectWorkspaceMediaItem) => void;
}

const VISIBILITY = [
  { v: 'public', l: 'Public' },
  { v: 'private', l: 'Privé' },
  { v: 'partners', l: 'Partenaires' },
];
const LANG_LABELS: Record<string, string> = { fr: 'FR', en: 'EN', cre: 'CRE' };

/** Focused add/edit form for one media item, with per-language title/description. */
export function MediaEditModal({ open, media, typeOptions, languages, onClose, onSave }: Props) {
  const [draft, setDraft] = useState(media);
  const primary = languages[0] ?? 'fr';
  const [lang, setLang] = useState(primary);
  const set = (patch: Partial<ObjectWorkspaceMediaItem>) => setDraft((d) => ({ ...d, ...patch }));

  const isPrimary = lang === primary;
  const titleValue = isPrimary ? draft.title : (draft.titleTranslations[lang] ?? '');
  const descValue = isPrimary ? draft.description : (draft.descriptionTranslations[lang] ?? '');
  const setTitle = (v: string) =>
    isPrimary ? set({ title: v }) : set({ titleTranslations: { ...draft.titleTranslations, [lang]: v } });
  const setDesc = (v: string) =>
    isPrimary ? set({ description: v }) : set({ descriptionTranslations: { ...draft.descriptionTranslations, [lang]: v } });

  return (
    <EditorModal open={open} title={draft.title || 'Média'} onClose={onClose} onSave={() => onSave(draft)}>
      {draft.url && <img className="ed-modal__preview" src={draft.url} alt={draft.description || draft.title || 'Aperçu'} />}
      <Field label="Type de média">
        <ReferenceSelect
          value={draft.typeCode}
          options={typeOptions}
          onChange={(code, opt) => set({ typeCode: code, typeId: opt?.id ?? '', typeLabel: opt?.label ?? '' })}
        />
      </Field>
      <Field label="URL du fichier"><Input value={draft.url} onChange={(url) => set({ url })} /></Field>
      {languages.length > 1 && (
        <LangTabs
          tabs={languages.map((code) => ({
            code,
            label: LANG_LABELS[code] ?? code.toUpperCase(),
            filled: code === primary
              ? Boolean(draft.title.trim())
              : Boolean((draft.titleTranslations[code] ?? '').trim()),
          }))}
          active={lang}
          onSelect={setLang}
        />
      )}
      <Field label="Titre"><Input value={titleValue} onChange={setTitle} /></Field>
      <Field label="Description (texte alternatif)">
        <Textarea value={descValue} rows={3} onChange={setDesc} />
      </Field>
      <Field label="Crédit / auteur"><Input value={draft.credit} onChange={(credit) => set({ credit })} /></Field>
      <Field label="Visibilité">
        <Select value={draft.visibility} options={VISIBILITY} onChange={(visibility) => set({ visibility })} />
      </Field>
      <Toggle label="Photo de couverture" on={draft.isMain} onChange={(isMain) => set({ isMain })} />
      <Toggle label="Publié" on={draft.isPublished} onChange={(isPublished) => set({ isPublished })} />
    </EditorModal>
  );
}
```

> `LangTabs` is the existing primitive (`SectionAccessibility` imports it from `../primitives`). Its
> `tabs` items are `{ code, label, filled }`; `onSelect` receives the language code. Confirm the barrel
> still exports it before relying on the import.

- [ ] **Step 4: Run to verify it passes**

Run: `cd bertel-tourism-ui && npx jest src/features/object-editor/widgets/MediaEditModal.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/object-editor/widgets/MediaEditModal.tsx src/features/object-editor/widgets/MediaEditModal.test.tsx
git commit -m "feat(ui): add MediaEditModal with per-language title/description"
```

### Task 3.2: SectionMedia — compact grid + modal wiring

**Files:** Modify `src/features/object-editor/sections/SectionMedia.tsx`; Create `SectionMedia.test.tsx`

- [ ] **Step 1: Write the failing test**

`SectionMedia.test.tsx`:
```tsx
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { useObjectEditorState } from '../useObjectEditorState';
import { SectionMedia } from './SectionMedia';
import { allowAll, fullModulesFixture } from './section-fixture.test-utils';

describe('SectionMedia', () => {
  it('opens the edit modal for an existing media and saves metadata changes', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    const view = render(<SectionMedia editor={result.current} permissions={allowAll} />);
    act(() => { fireEvent.click(screen.getByRole('button', { name: /Modifier le média/i })); });
    act(() => { fireEvent.change(screen.getByLabelText('Crédit / auteur'), { target: { value: 'OTI' } }); });
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' })); });
    view.rerender(<SectionMedia editor={result.current} permissions={allowAll} />);
    expect(result.current.draft.media.objectItems[0].credit).toBe('OTI');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd bertel-tourism-ui && npx jest src/features/object-editor/sections/SectionMedia.test.tsx`
Expected: FAIL — no "Modifier le média" trigger.

- [ ] **Step 3: Rewrite SectionMedia as a compact grid + modal**

Replace the three parallel renderings (photo grid, documents repeater, "Tous les médias" repeater) with a
single compact grid. Each tile: thumbnail (or a type badge — reuse `mediaBadge`), `typeLabel`, title or
URL filename, a cover star, an edit button `aria-label={`Modifier le média ${title}`}`, a delete button.
Add `const [editing, setEditing] = useState<string | null>(null)` and an "Ajouter un média" button that
appends a blank item (`addObjectMediaItem`) and immediately opens the modal on it. Render:
```tsx
{editing && media.objectItems.find((m) => m.id === editing) && (
  <MediaEditModal
    open
    media={media.objectItems.find((m) => m.id === editing)!}
    typeOptions={media.typeOptions}
    languages={editor.draft.descriptions.availableLanguages}
    onClose={() => setEditing(null)}
    onSave={(updated) => { editor.replaceModule('media', patchObjectMediaItem(media, updated.id, updated)); setEditing(null); }}
  />
)}
```
Keep `addObjectMediaItem`/`patchObjectMediaItem`/`removeObjectMediaItem` from `media-items.ts`. The
`languages` prop feeds `MediaEditModal`'s FR/EN/CRE translation tabs (Task 3.1).

- [ ] **Step 4: Run to verify it passes**

Run: `cd bertel-tourism-ui && npx jest src/features/object-editor/sections/SectionMedia.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/object-editor/sections/SectionMedia.tsx src/features/object-editor/sections/SectionMedia.test.tsx
git commit -m "feat(ui): rebuild media section as a compact grid with an edit modal"
```

---

# Phase 4 — Tags

### Task 4.1: SectionTags — add-from-library button

**Files:** Modify `src/features/object-editor/sections/SectionTags.tsx`, `SectionTags.test.tsx`

- [ ] **Step 1: Write the failing test**

Append to `SectionTags.test.tsx` (use a fixture variant with a non-empty `library`):
```tsx
it('adds a tag from the library via the Ajouter un tag button', () => {
  const modules = fullModulesFixture();
  modules.tags.library = [{ tagId: 't9', slug: 'famille', label: 'Famille', colorVariant: 'neutral', source: 'audience' }];
  const { result } = renderHook(() => useObjectEditorState('o1', modules));
  const view = render(<SectionTags editor={result.current} permissions={allowAll} />);
  act(() => { fireEvent.click(screen.getByRole('button', { name: /Ajouter un tag/i })); });
  act(() => { fireEvent.click(screen.getByRole('button', { name: 'Famille' })); });
  view.rerender(<SectionTags editor={result.current} permissions={allowAll} />);
  expect(result.current.draft.tags.displayed.some((t) => t.slug === 'famille')).toBe(true);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd bertel-tourism-ui && npx jest src/features/object-editor/sections/SectionTags.test.tsx -t 'Ajouter un tag'`
Expected: FAIL — no add button.

- [ ] **Step 3: Add the library picker**

In `SectionTags.tsx`: add `const [picking, setPicking] = useState(false)`. Render an "Ajouter un tag"
button. When `picking`, render the `module.library` tags not already in `displayed` as clickable chips;
clicking one appends it to `displayed` and closes the picker:
```tsx
function addFromLibrary(tag: ObjectWorkspaceTagItem) {
  editor.replaceModule('tags', { ...module, displayed: [...displayed, tag] });
  setPicking(false);
}
```
If `module.library` is empty, show "Aucun tag disponible dans la bibliothèque."

- [ ] **Step 4: Run to verify it passes**

Run: `cd bertel-tourism-ui && npx jest src/features/object-editor/sections/SectionTags.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/object-editor/sections/SectionTags.tsx src/features/object-editor/sections/SectionTags.test.tsx
git commit -m "feat(ui): add explicit add-from-library control to the tags section"
```

### Task 4.2: SectionTags — drag-and-drop reordering

**Files:** Modify `src/features/object-editor/sections/SectionTags.tsx`, `SectionTags.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
it('reorders displayed tags and marks the module dirty', () => {
  const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
  const view = render(<SectionTags editor={result.current} permissions={allowAll} />);
  // Simulate the SortableList onReorder contract directly: no arrow buttons remain.
  expect(screen.queryByRole('button', { name: 'Monter' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Descendre' })).not.toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: /Déplacer/i }).length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd bertel-tourism-ui && npx jest src/features/object-editor/sections/SectionTags.test.tsx -t 'reorders'`
Expected: FAIL — ▲▼ buttons still present.

- [ ] **Step 3: Replace ▲▼ with `SortableList`**

In `SectionTags.tsx`: remove the `move(index, direction)` helper and the ▲▼ buttons. Wrap the displayed
rows in `<SortableList items={displayed} getId={(t) => t.tagId || t.slug} onReorder={(next) => editor.replaceModule('tags', { ...module, displayed: next })} renderItem={(tag, index) => (/* existing row cells: color select, source select, delete */)} />`.
The `SortableList` supplies the drag handle; drop the standalone `rep-row__handle` span from the row body.

- [ ] **Step 4: Run to verify it passes**

Run: `cd bertel-tourism-ui && npx jest src/features/object-editor/sections/SectionTags.test.tsx`
Expected: PASS (all tag tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/object-editor/sections/SectionTags.tsx src/features/object-editor/sections/SectionTags.test.tsx
git commit -m "feat(ui): drag-and-drop tag reordering, replacing arrow buttons"
```

### Task 4.3: Tag order persistence — integration verification

**Files:** none (verification only; M2 + RPC + workspace wiring landed in Tasks 0.3 / 0.9)

- [ ] **Step 1: Manual round-trip on a test object**

In the running app, open a test object's §09, reorder tags by drag, save via the global save bar, reload.
Then `execute_sql`:
```sql
SELECT t.slug, l.position
FROM tag_link l JOIN ref_tag t ON t.id = l.tag_id
WHERE l.target_table = 'object' AND l.target_pk = '<test-object-id>'
ORDER BY l.position;
```
Expected: `position` values 0,1,2,… reflecting the dragged order; the reloaded editor shows that order.

- [ ] **Step 2: Record the result**

Note the outcome in the execution log / PR description. No commit (no file change).

---

# Phase 5 — Classifications §08 + Accessibility §10

### Task 5.1: §08 SectionClassification — value picker

**Files:** Modify `src/features/object-editor/sections/SectionClassification.tsx`, `SectionClassification.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `SectionClassification.test.tsx`. Use a fixture variant whose `distinctions.schemeOptions` has a
non-accessibility scheme with `valueOptions`:
```tsx
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { useObjectEditorState } from '../useObjectEditorState';
import { SectionClassification } from './SectionClassification';
import { allowAll, fullModulesFixture } from './section-fixture.test-utils';

function modulesWithStarsScheme() {
  const m = fullModulesFixture();
  m.distinctions.schemeOptions = [{
    id: 'stars', code: 'stars', label: 'Étoiles', selectionMode: 'single', isAccessibility: false,
    valueOptions: [{ id: '3', code: '3', label: '3 étoiles' }, { id: '4', code: '4', label: '4 étoiles' }],
  }];
  return m;
}

describe('SectionClassification', () => {
  it('edits a distinction value via a reference selector, not free text', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', modulesWithStarsScheme()));
    const view = render(<SectionClassification editor={result.current} permissions={allowAll} />);
    const valueSelect = screen.getByLabelText(/Valeur attribuée/i);
    expect(valueSelect.tagName).toBe('SELECT');
    act(() => { fireEvent.change(valueSelect, { target: { value: '3' } }); });
    view.rerender(<SectionClassification editor={result.current} permissions={allowAll} />);
    expect(result.current.draft.distinctions.distinctionGroups[0].items[0].valueCode).toBe('3');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd bertel-tourism-ui && npx jest src/features/object-editor/sections/SectionClassification.test.tsx`
Expected: FAIL — `valueLabel` is rendered as a text `<input>`, not a `<select>`.

- [ ] **Step 3: Replace the free-text value input with `ReferenceSelect`**

In `SectionClassification.tsx`, replace `<Input value={item.valueLabel} onChange={…} />` (line ~112) with a
`ReferenceSelect` bound to the matching scheme's `valueOptions` (look up `distinctions.schemeOptions` by
`group.schemeCode`). On change, set `valueId`/`valueCode`/`valueLabel` from the picked option. Give the
control an accessible name "Valeur attribuée" (the column already has that header — associate via `aria-label`).
Drop the vestigial "Handicap" (`disabilityTypesCovered`) column from §08 — non-accessibility schemes do
not use it; adjust `CLASS_COLS` accordingly.

- [ ] **Step 4: Run to verify it passes**

Run: `cd bertel-tourism-ui && npx jest src/features/object-editor/sections/SectionClassification.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/object-editor/sections/SectionClassification.tsx src/features/object-editor/sections/SectionClassification.test.tsx
git commit -m "feat(ui): pick classification values from reference data, not free text"
```

### Task 5.2: §10 Accessibility — Tourisme & Handicap label block

**Files:** Modify `src/features/object-editor/sections/SectionAccessibility.tsx`, `SectionAccessibility.test.tsx`

Context: scheme `LBL_TOURISME_HANDICAP` (`selection='single'`), value `granted`, sub-values
`granted_motor/_hearing/_visual/_cognitive` (disability types). An `object_classification` row carries
`value_id=granted`, `subvalue_ids[]` = covered disability types. The `distinctions` module exposes
`accessibilityLabels: ObjectWorkspaceDistinctionItem[]` (with `disabilityTypesCovered: string[]`).

- [ ] **Step 1: Write the failing test**

Create `SectionAccessibility.test.tsx`:
```tsx
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { useObjectEditorState } from '../useObjectEditorState';
import { SectionAccessibility } from './SectionAccessibility';
import { allowAll, fullModulesFixture } from './section-fixture.test-utils';

describe('SectionAccessibility — Tourisme & Handicap label', () => {
  it('shows disability-type toggles for a held label, no free-text value input', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<SectionAccessibility editor={result.current} permissions={allowAll} />);
    // The fixture's accessibilityLabels has one item covering 'moteur'.
    expect(screen.getByRole('button', { name: 'Moteur' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Auditif' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByDisplayValue('Tourisme Handicap')).not.toBeInTheDocument(); // no free-text value Input
  });

  it('toggles a covered disability type and marks the module dirty', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    const view = render(<SectionAccessibility editor={result.current} permissions={allowAll} />);
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Auditif' })); });
    view.rerender(<SectionAccessibility editor={result.current} permissions={allowAll} />);
    expect(result.current.dirtySections.distinctions).toBe(true);
    expect(result.current.draft.distinctions.accessibilityLabels[0].disabilityTypesCovered).toContain('hearing');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd bertel-tourism-ui && npx jest src/features/object-editor/sections/SectionAccessibility.test.tsx`
Expected: FAIL — current §10 renders `valueLabel` as a free `Input` and disability types as a comma input.

- [ ] **Step 3: Build the T&H label block**

In `SectionAccessibility.tsx`, replace the "Labels accessibilité" repeater (lines ~96-124) with a
structured block. The four disability types are a fixed, canonical set:
```tsx
const DISABILITY_TYPES = [
  { code: 'motor', label: 'Moteur' },
  { code: 'hearing', label: 'Auditif' },
  { code: 'visual', label: 'Visuel' },
  { code: 'cognitive', label: 'Mental' },
];
```
For the (single) accessibility label item in `distinctions.accessibilityLabels`, render: a `ChipMultiSelect`
over `DISABILITY_TYPES` bound to `item.disabilityTypesCovered` (toggle updates the item via the existing
`updateLabel` helper), plus `statut` (`ReferenceSelect`/`Select`), `awardedAt`, `validUntil` date inputs,
and a `note` input. No free-text `valueLabel` input. If `accessibilityLabels` is empty, render a toggle
"Établissement labellisé Tourisme & Handicap" that, when enabled, pushes a new label item (scheme/value
codes from `distinctions.schemeOptions` where `isAccessibility` is true).

- [ ] **Step 4: Run to verify it passes**

Run: `cd bertel-tourism-ui && npx jest src/features/object-editor/sections/SectionAccessibility.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/object-editor/sections/SectionAccessibility.tsx src/features/object-editor/sections/SectionAccessibility.test.tsx
git commit -m "feat(ui): structured Tourisme & Handicap label editor in section 10"
```

### Task 5.3: §10 Accessibility — accessible-equipment panels

**Files:** Modify `src/features/object-editor/sections/SectionAccessibility.tsx`, `SectionAccessibility.test.tsx`

- [ ] **Step 1: Write the failing test**

Append to `SectionAccessibility.test.tsx` (the fixture's `accessibility` amenity family option
`pmr_access` has `disabilityTypes: ['motor']` after Task 0.10):
```tsx
it('groups accessible amenities into disability-type panels and toggles selection', () => {
  const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
  const view = render(<SectionAccessibility editor={result.current} permissions={allowAll} />);
  // 'Moteur' panel header is present; expand it and toggle the amenity.
  act(() => { fireEvent.click(screen.getByRole('button', { name: /Moteur/i })); });
  act(() => { fireEvent.click(screen.getByRole('button', { name: 'Accès PMR' })); });
  view.rerender(<SectionAccessibility editor={result.current} permissions={allowAll} />);
  expect(result.current.draft.characteristics.selectedAmenityCodes).toContain('pmr_access');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd bertel-tourism-ui && npx jest src/features/object-editor/sections/SectionAccessibility.test.tsx -t 'disability-type panels'`
Expected: FAIL — current §10 uses the `isAccessibilityFamily` heuristic and flat chip sets, no disability-type panels.

- [ ] **Step 3: Build the equipment panels**

Replace the heuristic family rendering. Take the `accessibility` family group from
`characteristics.amenityGroups` (match `familyCode === 'accessibility'` exactly — drop `isAccessibilityFamily`).
For each of the 4 `DISABILITY_TYPES`, render a collapsible panel (reuse the §11 `sust-cat` markup pattern)
containing the family options whose `disabilityTypes` include that type, as a `ChipMultiSelect` bound to
`characteristics.selectedAmenityCodes`. Toggling calls `editor.replaceModule('characteristics', …)` with
the code added/removed from `selectedAmenityCodes`. Per-panel count = selected / total in that panel.

- [ ] **Step 4: Run to verify it passes**

Run: `cd bertel-tourism-ui && npx jest src/features/object-editor/sections/SectionAccessibility.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/object-editor/sections/SectionAccessibility.tsx src/features/object-editor/sections/SectionAccessibility.test.tsx
git commit -m "feat(ui): group accessible amenities into disability-type panels"
```

### Task 5.4: §10 Accessibility — stat header, adapted description, heuristic cleanup

**Files:** Modify `src/features/object-editor/sections/SectionAccessibility.tsx`, `SectionAccessibility.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
it('shows a §11-style stat header and keeps the adapted multilingual description', () => {
  const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
  render(<SectionAccessibility editor={result.current} permissions={allowAll} />);
  expect(screen.getByText(/Label T&H/i)).toBeInTheDocument();
  expect(screen.getByText(/Description adapt/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd bertel-tourism-ui && npx jest src/features/object-editor/sections/SectionAccessibility.test.tsx -t 'stat header'`
Expected: FAIL — no stat header.

- [ ] **Step 3: Add the stat header + confirm cleanup**

Add a stat row (reuse `StatCard` as in §11): "Label T&H" (✓/✗), "Équipements accessibles" (count),
"Couverture" (which of the 4 disability types are covered). Keep the existing adapted-description
multilingual `LangTabs`+`Textarea` block (`description_adapted`) unchanged. Confirm the
`isAccessibilityFamily` helper is deleted and unused after Task 5.3.

- [ ] **Step 4: Run to verify it passes**

Run: `cd bertel-tourism-ui && npx jest src/features/object-editor/sections/SectionAccessibility.test.tsx`
Expected: PASS (all §10 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/object-editor/sections/SectionAccessibility.tsx src/features/object-editor/sections/SectionAccessibility.test.tsx
git commit -m "feat(ui): add accessibility stat header; finish section 10 rework"
```

### Task 5.5: Regression — §11 Sustainability + classifications + full suite

**Files:** none (verification)

- [ ] **Step 1: Run the editor section + service test suites**

Run: `cd bertel-tourism-ui && npx jest src/features/object-editor src/services/object-workspace`
Expected: all PASS — in particular `SectionSustainability.test.tsx` and `SectionDistribution.test.tsx`
unchanged and green (§11 not regressed).

- [ ] **Step 2: Full type check + build**

Run: `cd bertel-tourism-ui && npx tsc -p tsconfig.app.json --noEmit`
Run: `cd bertel-tourism-ui && npm run build`
Expected: no type errors; build succeeds.

- [ ] **Step 3: Full test run**

Run: `cd bertel-tourism-ui && npx jest`
Expected: green suite. Investigate and fix any failure before closing the phase.

- [ ] **Step 4: Documentation follow-up**

Update `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md` with: migrations M1/M2, the
pet-policy canonical-location decision (D2) and `hasPolicy` removal, the tag color/order persistence
model, and the accessibility §10 data-model notes. Refresh MCP memory from that log per CLAUDE.md.
Commit:
```bash
git add bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md
git commit -m "docs: record object-editor structured-fields decisions"
```

---

## Self-Review

**Spec coverage** — every spec section maps to tasks: Contacts §7.1 → T1.1; Rooms §7.2 → T0.2, T0.8,
T2.1-2.3; Room equipment §7.3 → T2.1, T2.3; Media §7.3 → T3.1-3.2; Pet policy §7.4 → T1.2-1.5; Tags §7.5
→ T0.1, T0.3, T0.6, T0.9, T4.1-4.3; Classifications §08 / Accessibility §10 §7.6 → T0.10, T5.1-5.5;
shared primitives §6 → T0.4-0.7; migrations §5 → T0.2-0.3. No gaps.

**Placeholder scan** — no `TBD`/`TODO`/"add error handling"/"similar to Task N". **No task leaves the
repo non-compiling at its commit.** Phase 1 is ordered consumers-first (1.2 BlockHEB → 1.3 SectionCapacity
→ 1.4 remove the `hasPolicy` type field), and Task 0.8 updates `BlockHEB.tsx`'s `createRoom` literal in
the same task that extends the room type — so each commit type-checks. Mid-task TDD "red" states (a
failing test, or a fixture edit that breaks `tsc` before the matching fix) are intra-task only; the
commit step always follows a green check. Migration tasks (0.2, 0.3) gate live DDL behind an explicit
approval step (Migration safety protocol).

**Type consistency** — `ObjectWorkspaceRoomTypeItem` gains `roomTypeId/roomTypeCode/roomTypeLabel`
(T0.8) and they are used consistently in T2.1's fixture and modal. `resolveTagColor` (T0.9) signature is
fixed and used only there. `disabilityTypes` added to amenity options (T0.10) and consumed in T5.3.
`DISABILITY_TYPES` (codes `motor/hearing/visual/cognitive`) is defined in T5.2 and reused in T5.3.

**Known soft spots for the executor** — workspace-service tasks (T0.8-0.10, T1.1 Step 5) give exact field
names and approximate line anchors; the executing agent must read the current function bodies of the
42k/77k-token `object-workspace*.ts` files before editing. The `EditorModal` (T0.7) and `Toggle`
label-association assumptions must be checked against the actual primitives and adjusted in-task.
