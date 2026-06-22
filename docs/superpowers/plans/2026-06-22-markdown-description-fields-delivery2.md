# Markdown across all description fields — Delivery 2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Author Markdown in the five remaining public-prose fields (plan d'accès, room, dish, sub-place, ITI-stage descriptions) with the §106 contract — strip the flat key on every flat read path, emit a `*_md` sibling on rich paths, never strip an editor-load leg.

**Architecture:** Each field becomes Markdown-canonical in its existing column. The backend changes are body-only `CREATE OR REPLACE` edits inside `api.get_object_resource` (SECURITY DEFINER) plus a handful of flat readers (room getter, dish render-line + full-text search, three ITI exports). The frontend swaps the field's `<Textarea>`/`<Input>` for the shared `MarkdownEditorLazy` (drop-in fields) or a new `MarkdownCellField` modal-cell (repeater-row fields). No public-drawer changes this delivery — `*_md` is emitted (data-ready) but nothing in `object-detail-parser.ts`/`ObjectDetailView.tsx` is touched.

**Tech Stack:** PostgreSQL (Supabase) · `api.strip_markdown` (scalar, IMMUTABLE) · `api.i18n_pick` · Next.js/React · TipTap via `MarkdownEditorLazy` · Jest · Supabase MCP / `.tmp_pgapply/apply_range.cjs` deploy recipe.

**Spec:** [`docs/superpowers/specs/2026-06-22-markdown-description-fields-delivery2-design.md`](../specs/2026-06-22-markdown-description-fields-delivery2-design.md)

## Global Constraints

- **Two-tier toolbar:** `variant="block"` = full toolbar (H2/H3, lists, quote, bold, italic, link); `variant="inline"` = bold/italic/link only. Block = plan d'accès, room, sub-place. Inline = dish, ITI stage.
- **§106 contract per field:** FLAT readers (cards, exports InDesign/GPX/KML/GeoJSON/selection-CSV, full-text search, render lines) wrap the value in `api.strip_markdown(...)`. RICH readers (`get_object_resource` blocks, standalone getters) ALSO emit a sibling key suffixed `_md` carrying the RAW resolved Markdown. EDITOR-load legs are NEVER stripped.
- **`to_jsonb(row)` blocks** leak the raw column: SUBTRACT the raw flat key AND the raw `*_i18n` column, then OVERRIDE via `jsonb_build_object('<field>', api.strip_markdown(...), '<field>_md', <raw resolved>)`.
- **i18n resolve form:** for an i18n column inside `get_object_resource` use `api.strip_markdown(COALESCE(api.i18n_pick(<col>_i18n, lang, 'fr'), <col>))`; the in-scope language variable is `lang` (declared `lang TEXT := api.pick_lang(p_lang_prefs)` at `api_views_functions.sql:2618`). The standalone `api.get_object_room_types` uses `v_lang` + `api.i18n_pick_strict`.
- **Strip BEFORE truncating** (`LEFT(api.strip_markdown(x),50)`, never `LEFT(x,50)` then strip).
- **No drawer changes:** do not edit `object-detail-parser.ts` or `ObjectDetailView.tsx` in any task.
- **Deploy integrity:** every SQL edit is folded into BOTH `Base de donnée DLL et API/api_views_functions.sql` and (for DDL/search) `schema_unified.sql`, AND given a manifest id + `docs/SQL_ROLLOUT_RUNBOOK.md` entry. A fresh DB built from the runbook must reproduce live. Deploy SQL to live BEFORE the matching frontend, then `NOTIFY pgrst, 'reload schema';`.
- **`get_object_resource` is SECURITY DEFINER (authorize-once)** — all edits are body-only `CREATE OR REPLACE`, signature unchanged. It is touched by Tasks B, C, D, E, F (different blocks); apply tasks in order, redeploying the whole function each time via `.tmp_pgapply/apply_range.cjs`.
- **Numbering:** before starting, read `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md` and claim the next free decision-log `§<N>` and the next free manifest ids (continue after `14x`). Replace the placeholder `§107`/`§106 Phase X` strings in the SQL comments below with the claimed `§<N>`.
- **Commits:** commit only your own hunks with an explicit pathspec (`git commit -m "…" -- <paths>`). The PO edits `api_views_functions.sql`/`schema_unified.sql`/editor files in parallel via Cursor — never `git add` a whole shared file, never a pathless commit. No co-author trailer (attribution disabled globally). The user pushes.

---

## File map

**Created**
- `bertel-tourism-ui/src/components/markdown/MarkdownCellField.tsx` — compact preview + edit-modal cell wrapping `MarkdownEditorLazy` (Task A).
- `bertel-tourism-ui/src/components/markdown/MarkdownCellField.test.tsx` — unit test (Task A).
- `Base de donnée DLL et API/tests/test_direction_markdown.sql`, `test_room_description_markdown.sql`, `test_dish_description_markdown.sql`, `test_place_description_markdown.sql`, `test_iti_stage_markdown.sql` (Tasks B–F).
- One migration file per SQL-bearing task under `Base de donnée DLL et API/` (manifest-listed), e.g. `migration_markdown_d2_<field>.sql`.

**Modified**
- `Base de donnée DLL et API/api_views_functions.sql` — `get_object_resource` blocks (B,C,D,E,F) + `get_object_room_types` (C) + render-line (D) + `build_iti_track`/`export_itinerary_gpx`/`get_itinerary_track_geojson` (F).
- `Base de donnée DLL et API/schema_unified.sql` — folded copies of the above + the search `doc_d` wrap (D).
- `Base de donnée DLL et API/migration_global_search_document.sql` — second `doc_d` copy + backfill (D).
- `bertel-tourism-ui/src/services/object-workspace-parser.ts` — `parseLocationRecord`/`parseMainLocation` (B), `parseDescriptionScope` (E).
- `bertel-tourism-ui/src/features/object-editor/sections/SectionLocation.tsx` (B), `widgets/RoomEditModal.tsx` (C), `widgets/DishEditModal.tsx` (D), `sections/SectionPlaces.tsx` (E + F), `sections/blocks/BlockITI.tsx` (F).

---

## Task A: `MarkdownCellField` primitive

**Files:**
- Create: `bertel-tourism-ui/src/components/markdown/MarkdownCellField.tsx`
- Test: `bertel-tourism-ui/src/components/markdown/MarkdownCellField.test.tsx`

**Interfaces:**
- Produces: `MarkdownCellField({ value: string; onChange: (md: string) => void; variant?: 'block' | 'inline'; ariaLabel: string; disabled?: boolean; emptyLabel?: string })` — a compact cell: shows a clamped `MarkdownContent` preview (or `emptyLabel` when empty) + a "Modifier"/"Ajouter" button that opens an `EditorModal` hosting `MarkdownEditorLazy`; commits `onChange(draft)` on save. Used by Tasks E and F.
- Consumes: `EditorModal` (`../../features/object-editor/primitives/EditorModal` — props `{ open, title, onClose, onSave, size, children }`), `MarkdownEditorLazy`, `MarkdownContent` (all in `src/components/markdown/`).

- [ ] **Step 1: Write the failing test**

Create `bertel-tourism-ui/src/components/markdown/MarkdownCellField.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { MarkdownCellField } from './MarkdownCellField';

// MarkdownEditorLazy is dynamic/SSR-false + TipTap — mock it to a plain textarea (same pattern as
// SectionAccessibility.test.tsx:7 which mocks MarkdownEditorLazy).
jest.mock('./MarkdownEditorLazy', () => ({
  MarkdownEditorLazy: ({ value, onChange, ariaLabel }: { value: string; onChange: (md: string) => void; ariaLabel: string }) => (
    <textarea aria-label={ariaLabel} value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

describe('MarkdownCellField', () => {
  it('shows the empty label and opens the modal to add content', () => {
    const onChange = jest.fn();
    render(<MarkdownCellField value="" onChange={onChange} ariaLabel="Description test" emptyLabel="Aucune description" />);
    expect(screen.getByText('Aucune description')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /ajouter/i }));
    const editor = screen.getByLabelText('Description test');
    fireEvent.change(editor, { target: { value: 'Texte **gras**' } });
    fireEvent.click(screen.getByRole('button', { name: /enregistrer/i }));
    expect(onChange).toHaveBeenCalledWith('Texte **gras**');
  });

  it('renders a preview when a value is present and edits it', () => {
    const onChange = jest.fn();
    render(<MarkdownCellField value="Déjà **là**" onChange={onChange} ariaLabel="Description test" />);
    expect(screen.getByRole('button', { name: /modifier/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /modifier/i }));
    expect(screen.getByLabelText('Description test')).toHaveValue('Déjà **là**');
  });

  it('does not show an edit affordance when disabled', () => {
    render(<MarkdownCellField value="x" onChange={jest.fn()} ariaLabel="Description test" disabled />);
    expect(screen.queryByRole('button', { name: /modifier/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd bertel-tourism-ui && npx jest src/components/markdown/MarkdownCellField.test.tsx`
Expected: FAIL — `Cannot find module './MarkdownCellField'`.

- [ ] **Step 3: Write the component**

Create `bertel-tourism-ui/src/components/markdown/MarkdownCellField.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { Plus, Pencil } from 'lucide-react';
import { EditorModal } from '../../features/object-editor/primitives/EditorModal';
import { MarkdownEditorLazy } from './MarkdownEditorLazy';
import { MarkdownContent } from './MarkdownContent';

type MarkdownCellFieldProps = {
  value: string;
  onChange: (markdown: string) => void;
  variant?: 'block' | 'inline';
  ariaLabel: string;
  disabled?: boolean;
  emptyLabel?: string;
};

/** Compact repeater-cell surface for a Markdown field: a clamped preview + a button that opens a
 *  modal hosting the WYSIWYG. A full toolbar will not fit a grid row, so authoring happens in the
 *  modal; the cell shows the rendered preview. Mirrors AdaptedDescriptionField, generalized to a
 *  single (already language-resolved) string value. */
export function MarkdownCellField({
  value, onChange, variant = 'block', ariaLabel, disabled, emptyLabel = 'Aucune description',
}: MarkdownCellFieldProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);

  function openModal() {
    setDraft(value);
    setOpen(true);
  }
  function save() {
    onChange(draft);
    setOpen(false);
  }

  const filled = value.trim() !== '';

  return (
    <div className="md-cell">
      {filled ? (
        <MarkdownContent markdown={value} className="md-cell__preview" />
      ) : (
        <span className="md-cell__empty muted">{emptyLabel}</span>
      )}
      {!disabled && (
        <button type="button" className="btn md-cell__btn" onClick={openModal}>
          {filled ? <><Pencil size={14} aria-hidden /> Modifier</> : <><Plus size={14} aria-hidden /> Ajouter</>}
        </button>
      )}

      <EditorModal open={open} title={ariaLabel} size="lg" onClose={() => setOpen(false)} onSave={save}>
        <MarkdownEditorLazy value={draft} onChange={setDraft} variant={variant} ariaLabel={ariaLabel} disabled={disabled} />
      </EditorModal>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd bertel-tourism-ui && npx jest src/components/markdown/MarkdownCellField.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Add the cell CSS**

Append to `bertel-tourism-ui/src/features/object-editor/object-editor.css` (near the existing `.adapted-desc` rules):

```css
.md-cell { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.md-cell__preview { font-size: .85rem; max-height: 4.5em; overflow: hidden; }
.md-cell__empty { font-size: .85rem; }
.md-cell__btn { align-self: flex-start; }
```

- [ ] **Step 6: Typecheck and commit**

Run: `cd bertel-tourism-ui && npx tsc --noEmit` → Expected: no new errors.

```bash
git commit -m "feat(editor): add MarkdownCellField repeater-cell editor (Markdown D2 phase A)" -- \
  "bertel-tourism-ui/src/components/markdown/MarkdownCellField.tsx" \
  "bertel-tourism-ui/src/components/markdown/MarkdownCellField.test.tsx" \
  "bertel-tourism-ui/src/features/object-editor/object-editor.css"
```

---

## Task B: Plan d'accès (`object_location.direction`, block)

**Files:**
- Modify: `Base de donnée DLL et API/api_views_functions.sql` (lines ~2735, ~3891) + folded in `schema_unified.sql`
- Modify: `bertel-tourism-ui/src/services/object-workspace-parser.ts` (lines 1218, 1275)
- Modify: `bertel-tourism-ui/src/features/object-editor/sections/SectionLocation.tsx` (import + line 171)
- Test: `Base de donnée DLL et API/tests/test_direction_markdown.sql`; `bertel-tourism-ui/src/services/object-workspace.location-markdown.test.ts`

**Interfaces:**
- Consumes: `api.strip_markdown` (`api_views_functions.sql:429`). `direction` is plain `text` (no i18n) — wrap is `api.strip_markdown(ol.direction)`.
- Produces: `get_object_resource` `address.direction` (stripped) + `address.direction_md` (raw); same pair under `places[].location`. Editor reads `direction_md ?? direction`.

- [ ] **Step 1: Write the failing SQL test**

Create `Base de donnée DLL et API/tests/test_direction_markdown.sql`:

```sql
DO $$
DECLARE
  v_obj  uuid;
  v_md   constant text := 'Prenez la **D3** puis suivez les *panneaux* vers le ## site';
  v_res  jsonb;
BEGIN
  SELECT id INTO v_obj FROM object WHERE object_type <> 'ORG' ORDER BY created_at LIMIT 1;
  UPDATE object_location SET direction = v_md WHERE object_id = v_obj AND is_main_location IS TRUE;

  v_res := api.get_object_resource(v_obj, ARRAY['fr'], NULL);

  ASSERT (v_res -> 'address' ->> 'direction') = api.strip_markdown(v_md),
    format('flat direction not stripped: %s', v_res -> 'address' ->> 'direction');
  ASSERT (v_res -> 'address' ->> 'direction') !~ '[*#]', 'flat direction still has markers';
  ASSERT (v_res -> 'address' ->> 'direction_md') = v_md,
    format('direction_md not raw: %s', v_res -> 'address' ->> 'direction_md');
  ASSERT NOT ((v_res -> 'address') ? 'direction_i18n'), 'direction_i18n must not exist (plain text)';

  RAISE EXCEPTION 'ROLLBACK_TEST';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'ROLLBACK_TEST' THEN RAISE; END IF;
END $$;
```

- [ ] **Step 2: Run the test against live to confirm it fails**

Run via Supabase MCP `execute_sql` (the file body). Expected: FAIL — `flat direction not stripped` (today `direction` is the raw value and `direction_md` is absent).

- [ ] **Step 3: Edit the main-location address block**

In `Base de donnée DLL et API/api_views_functions.sql:~2735`, replace the `'direction', ol.direction` line inside the address `jsonb_build_object`:

```sql
-- BEFORE
          'lieu_dit',       ol.lieu_dit,
          'direction',      ol.direction
        )
-- AFTER
          'lieu_dit',       ol.lieu_dit,
          -- §<N> Markdown contract: flat key stripped, raw Markdown in the _md sibling (plain text, no i18n).
          'direction',      api.strip_markdown(ol.direction),
          'direction_md',   ol.direction
        )
```

- [ ] **Step 4: Edit the sub-place location block**

In `Base de donnée DLL et API/api_views_functions.sql:~3891`, in the `places[].location` `jsonb_build_object`:

```sql
-- BEFORE
                     'city',       ol.city,
                     'direction',  ol.direction
                   )
-- AFTER
                     'city',       ol.city,
                     -- §<N> Markdown contract: same strip + _md sibling for place-keyed locations.
                     'direction',  api.strip_markdown(ol.direction),
                     'direction_md', ol.direction
                   )
```

- [ ] **Step 5: Fold both edits into `schema_unified.sql`**

Apply the identical two edits to the `get_object_resource` definition in `Base de donnée DLL et API/schema_unified.sql` (search for the same `'direction', ol.direction` lines). Create `Base de donnée DLL et API/migration_markdown_d2_direction.sql` containing the body-only `CREATE OR REPLACE FUNCTION api.get_object_resource(...)` with these edits, and add a manifest id + runbook entry per the deploy-integrity invariant.

- [ ] **Step 6: Deploy to live and re-run the SQL test**

Deploy the updated `get_object_resource` via `.tmp_pgapply/apply_range.cjs <start> <end>` (the line range of the function in `api_views_functions.sql`), then `NOTIFY pgrst, 'reload schema';`. Re-run the Step-1 test via MCP. Expected: PASS (no `ROLLBACK_TEST` surfaced as a real error; the assertions hold). Also run the sub-place variant (an object with a place-keyed `object_location`) asserting `v_res -> 'places' -> 0 -> 'location' ->> 'direction'` stripped and `... ->> 'direction_md'` raw.

- [ ] **Step 7: Write the failing Jest round-trip test**

Create `bertel-tourism-ui/src/services/object-workspace.location-markdown.test.ts`:

```ts
import { parseMainLocation } from './object-workspace-parser';

const RAW = 'Prenez la **D3** puis suivez les *panneaux*';

describe('§<N> direction Markdown round-trip', () => {
  it('loads RAW Markdown from direction_md, not the stripped flat key', () => {
    const raw = { address: { direction: 'Prenez la D3 puis suivez les panneaux', direction_md: RAW, is_main_location: true } };
    const main = parseMainLocation(raw as Record<string, unknown>);
    expect(main.direction).toBe(RAW);
  });

  it('falls back to direction when no _md sibling is present (legacy/plain rows)', () => {
    const main = parseMainLocation({ address: { direction: 'Plain text only', is_main_location: true } } as Record<string, unknown>);
    expect(main.direction).toBe('Plain text only');
  });
});
```

Run: `cd bertel-tourism-ui && npx jest src/services/object-workspace.location-markdown.test.ts` → Expected: FAIL (first case returns the stripped value).

- [ ] **Step 8: Edit the editor base leg in `object-workspace-parser.ts`**

At `bertel-tourism-ui/src/services/object-workspace-parser.ts:1218` (in `parseLocationRecord`):

```ts
// BEFORE
    direction: readString(record.direction),
// AFTER
    // §<N>: public `direction` is now strip_markdown'd; the editor round-trips RAW, so prefer direction_md.
    direction: readString(record.direction_md, readString(record.direction)),
```

And at `object-workspace-parser.ts:1275` (in `parseMainLocation`), harden the fallback merge:

```ts
// BEFORE
    direction: pickFirstText(parsed.direction, addressRecord.direction, mainLocationRecord.direction, raw.direction),
// AFTER
    direction: pickFirstText(
      parsed.direction,
      readString(addressRecord.direction_md, readString(addressRecord.direction)),
      readString(mainLocationRecord.direction_md, readString(mainLocationRecord.direction)),
      readString(raw.direction_md, readString(raw.direction)),
    ),
```

Run: `cd bertel-tourism-ui && npx jest src/services/object-workspace.location-markdown.test.ts` → Expected: PASS.

- [ ] **Step 9: Swap the editor field**

In `bertel-tourism-ui/src/features/object-editor/sections/SectionLocation.tsx`: add `import { MarkdownEditorLazy } from '../../../components/markdown/MarkdownEditorLazy';` (line 3 area), then replace the `<Textarea>` at line 171:

```tsx
// BEFORE
        <Textarea
          value={main.direction}
          onChange={(v) => patch({ direction: v })}
          rows={3}
          data-testid="direction-textarea"
        />
// AFTER
        <MarkdownEditorLazy
          value={main.direction}
          onChange={(md) => patch({ direction: md })}
          ariaLabel="Descriptif du plan d'accès"
          variant="block"
        />
```

If `Textarea` is now unused in this file, remove it from the line-3 import. If the `SectionLocation` test targeted `direction-textarea`, update it to query by `ariaLabel` (the `MarkdownEditorLazy` mock exposes `ariaLabel`, matching `SectionAccessibility.test.tsx`).

- [ ] **Step 10: Typecheck, build, commit**

Run: `cd bertel-tourism-ui && npx tsc --noEmit && npx jest src/services/object-workspace.location-markdown.test.ts src/features/object-editor/sections/SectionLocation.test.tsx`
Expected: PASS / no new type errors.

```bash
git commit -m "feat(editor): Markdown for plan d'accès (direction) — D2 phase B" -- \
  "Base de donnée DLL et API/api_views_functions.sql" \
  "Base de donnée DLL et API/schema_unified.sql" \
  "Base de donnée DLL et API/migration_markdown_d2_direction.sql" \
  "Base de donnée DLL et API/tests/test_direction_markdown.sql" \
  "bertel-tourism-ui/src/services/object-workspace-parser.ts" \
  "bertel-tourism-ui/src/services/object-workspace.location-markdown.test.ts" \
  "bertel-tourism-ui/src/features/object-editor/sections/SectionLocation.tsx"
```
(Stage only your hunks in the shared SQL files — the PO may have unrelated WIP there.)

---

## Task C: Room description (`object_room_type.description`, block)

**Files:**
- Modify: `Base de donnée DLL et API/api_views_functions.sql` (lines ~3773, ~7340) + folded in `schema_unified.sql`
- Modify: `bertel-tourism-ui/src/features/object-editor/widgets/RoomEditModal.tsx` (import + line 202)
- Test: `Base de donnée DLL et API/tests/test_room_description_markdown.sql`; `bertel-tourism-ui/src/services/object-workspace.rooms-markdown.test.ts`

**Interfaces:**
- Consumes: `api.strip_markdown`, `api.i18n_pick` (resource block, var `lang`), `api.i18n_pick_strict` (getter, var `v_lang`).
- Produces: `get_object_resource` room_types `description` (stripped) + `description_md` (raw), `description_i18n` removed; `get_object_room_types` same pair. Editor loads via direct select (`object-workspace.ts:2577`) — no raw leg.

- [ ] **Step 1: Write the failing SQL test**

Create `Base de donnée DLL et API/tests/test_room_description_markdown.sql`:

```sql
DO $$
DECLARE
  v_obj text; v_room uuid; v_res jsonb; v_rt jsonb;
  v_md text := E'## Suite\n\nVue **mer** avec _balcon_.';
  v_plain text := E'Suite\n\nVue mer avec balcon.';
BEGIN
  SELECT o.id INTO v_obj FROM object o WHERE o.object_type IN ('HLO','HEB') AND o.status='published' LIMIT 1;
  INSERT INTO object_room_type(object_id, code, name, description, description_i18n, is_published)
  VALUES (v_obj, 'ZZTEST', 'Test room', v_md, jsonb_build_object('fr', v_md), TRUE) RETURNING id INTO v_room;

  v_res := api.get_object_resource(v_obj, ARRAY['fr'], NULL);
  SELECT e INTO v_rt FROM jsonb_array_elements(v_res->'room_types') e WHERE e->>'code'='ZZTEST';
  ASSERT (v_rt->>'description') = v_plain, format('flat not stripped: %L', v_rt->>'description');
  ASSERT (v_rt->>'description_md') = v_md, format('description_md not raw: %L', v_rt->>'description_md');
  ASSERT NOT (v_rt ? 'description_i18n'), 'description_i18n leaked';

  SELECT e INTO v_rt FROM jsonb_array_elements(api.get_object_room_types(v_obj)) e WHERE e->>'code'='ZZTEST';
  ASSERT (v_rt->>'description') = v_plain, 'getter flat not stripped';
  ASSERT (v_rt->>'description_md') = v_md, 'getter description_md not raw';

  RAISE EXCEPTION 'ROLLBACK_TEST';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'ROLLBACK_TEST' THEN RAISE; END IF;
END $$;
```

Run via MCP. Expected: FAIL.

- [ ] **Step 2: Edit the resource room_types block**

`api_views_functions.sql:~3773` — change the `(to_jsonb(rt) - 'object_id')` head of the room jsonb:

```sql
-- BEFORE
      SELECT jsonb_agg(
               (to_jsonb(rt) - 'object_id')
               ||
               jsonb_build_object(
                 'amenities', COALESCE((
-- AFTER
      SELECT jsonb_agg(
               (to_jsonb(rt) - 'object_id' - 'description_i18n')
               ||
               jsonb_build_object(
                 -- §<N> Markdown: strip flat description, drop raw i18n, emit raw _md sibling.
                 'description',
                 api.strip_markdown(COALESCE(api.i18n_pick(rt.description_i18n, lang, 'fr'), rt.description)),
                 'description_md',
                 COALESCE(api.i18n_pick(rt.description_i18n, lang, 'fr'), rt.description),
                 'amenities', COALESCE((
```

- [ ] **Step 3: Edit the standalone getter**

`api_views_functions.sql:~7340` — in `api.get_object_room_types`:

```sql
-- BEFORE
        'description', COALESCE(api.i18n_pick_strict(rt.description_i18n, v_lang, 'fr'), rt.description),
-- AFTER
        'description', api.strip_markdown(COALESCE(api.i18n_pick_strict(rt.description_i18n, v_lang, 'fr'), rt.description)),
        'description_md', COALESCE(api.i18n_pick_strict(rt.description_i18n, v_lang, 'fr'), rt.description),
```

- [ ] **Step 4: Fold into `schema_unified.sql`, deploy, re-run test**

Apply the same two edits to `schema_unified.sql`; create `migration_markdown_d2_room.sql` (both `CREATE OR REPLACE` bodies) + manifest/runbook entry. Deploy both functions to live (apply_range for `get_object_resource`; the getter is small enough for MCP `execute_sql`), `NOTIFY pgrst`. Re-run the Step-1 test → Expected: PASS.

- [ ] **Step 5: Write the failing Jest round-trip test**

Create `bertel-tourism-ui/src/services/object-workspace.rooms-markdown.test.ts`:

```ts
import { readString } from './object-workspace-parser';

const MD = '## Suite\n\nVue **mer** avec _balcon_.';

describe('room description Markdown round-trip (D2 phase C)', () => {
  it('parser keeps raw Markdown from the direct PostgREST row', () => {
    const row = { id: 'r1', code: 'A', name: 'X', description: MD, description_i18n: { fr: MD } } as Record<string, unknown>;
    expect(readString(row.description)).toBe(MD);
  });
  it('save payload writes raw Markdown back to object_room_type', () => {
    const item = { description: MD, descriptionTranslations: { fr: MD } };
    const payload = { description: item.description, description_i18n: item.descriptionTranslations };
    expect(payload.description).toBe(MD);
    expect(payload.description_i18n.fr).toBe(MD);
  });
});
```

(`readString` is exported from `object-workspace-parser.ts`; if not, import the rooms loader/save helper the existing room tests use.) Run → it should pass immediately (load/save are already raw — this test guards against a future strip on the editor leg).

- [ ] **Step 6: Swap the editor field**

`bertel-tourism-ui/src/features/object-editor/widgets/RoomEditModal.tsx`: add `import { MarkdownEditorLazy } from '../../../components/markdown/MarkdownEditorLazy';` (after the primitives import at line 3), then at line 202:

```tsx
// BEFORE
      <Field label="Description"><Textarea value={draft.description} rows={3} onChange={(description) => set({ description })} /></Field>
// AFTER
      <Field label="Description">
        <MarkdownEditorLazy
          value={draft.description}
          onChange={(description) => set({ description })}
          ariaLabel="Description de la chambre"
          variant="block"
        />
      </Field>
```

Leave the `Textarea` import (used elsewhere in the modal).

- [ ] **Step 7: Typecheck, test, commit**

Run: `cd bertel-tourism-ui && npx tsc --noEmit && npx jest src/services/object-workspace.rooms-markdown.test.ts src/features/object-editor/widgets/RoomEditModal.test.tsx`
Expected: PASS.

```bash
git commit -m "feat(editor): Markdown for room descriptions — D2 phase C" -- \
  "Base de donnée DLL et API/api_views_functions.sql" \
  "Base de donnée DLL et API/schema_unified.sql" \
  "Base de donnée DLL et API/migration_markdown_d2_room.sql" \
  "Base de donnée DLL et API/tests/test_room_description_markdown.sql" \
  "bertel-tourism-ui/src/services/object-workspace.rooms-markdown.test.ts" \
  "bertel-tourism-ui/src/features/object-editor/widgets/RoomEditModal.tsx"
```

---

## Task D: Dish description (`object_menu_item.description`, inline)

**Files:**
- Modify: `Base de donnée DLL et API/api_views_functions.sql` (lines ~4338, ~4980) + folded in `schema_unified.sql`
- Modify: `Base de donnée DLL et API/schema_unified.sql` (line ~4667) + `migration_global_search_document.sql` (lines ~143, backfill ~251)
- Modify: `bertel-tourism-ui/src/features/object-editor/widgets/DishEditModal.tsx` (import + line 56)
- Test: `Base de donnée DLL et API/tests/test_dish_description_markdown.sql`; `bertel-tourism-ui/src/services/object-workspace.menu-items-markdown.test.ts`

**Interfaces:**
- Consumes: `api.strip_markdown` (plain text, no i18n). `api.refresh_object_filter_caches(p_object_id TEXT)` for the search backfill.
- Produces: resource `menus[].items[].description` (stripped) + `description_md` (raw); render-line stripped; search tsvector stripped.

- [ ] **Step 1: Write the failing SQL test**

Create `Base de donnée DLL et API/tests/test_dish_description_markdown.sql`:

```sql
DO $$
DECLARE
  v_obj text; v_menu uuid; v_item uuid; v_res jsonb; v_dish jsonb; v_doc tsvector;
  v_md text := 'Poulet **mariné** au [gingembre](https://x) et _combava_';
  v_plain text := 'Poulet mariné au gingembre et combava';
BEGIN
  SELECT id INTO v_obj FROM object WHERE object_type='RES' AND status='published' LIMIT 1;
  INSERT INTO object_menu(object_id, name, is_active) VALUES (v_obj, 'Carte test', TRUE) RETURNING id INTO v_menu;
  INSERT INTO object_menu_item(menu_id, name, description, is_available)
    VALUES (v_menu, 'Cari poulet', v_md, TRUE) RETURNING id INTO v_item;
  PERFORM api.refresh_object_filter_caches(v_obj);

  v_res := api.get_object_resource(v_obj, ARRAY['fr'], NULL);
  SELECT e INTO v_dish FROM jsonb_array_elements(v_res #> '{menus,0,items}') e WHERE e->>'id'=v_item::text;
  ASSERT v_dish->>'description' = v_plain, format('flat not stripped: %s', v_dish->>'description');
  ASSERT v_dish->>'description_md' = v_md, format('description_md not raw: %s', v_dish->>'description_md');
  ASSERT v_dish->>'description' NOT LIKE '%**%', 'flat still has markers';

  SELECT search_document INTO v_doc FROM object WHERE id = v_obj;
  ASSERT v_doc @@ to_tsquery('french', immutable_unaccent('marine')), 'search_document not indexing stripped dish';

  DELETE FROM object_menu WHERE id = v_menu;
  PERFORM api.refresh_object_filter_caches(v_obj);
  RAISE NOTICE 'Phase D PASS';
END $$;
```

Run via MCP. Expected: FAIL (flat not stripped, `description_md` absent, search indexes `**mariné**`). The DELETE cleanup at the end runs because there is no exception; if an ASSERT fails the row stays — re-run after dropping the `ZZ`/`Carte test` rows, or wrap in an explicit `BEGIN; … ROLLBACK;` at the psql layer.

- [ ] **Step 2: Edit the resource menus items block**

`api_views_functions.sql:~4338`:

```sql
-- BEFORE
                     SELECT jsonb_agg(
                              (
                                (to_jsonb(mi) - 'menu_id')
                              )
                              || jsonb_build_object(
                                   'category', (
-- AFTER
                     SELECT jsonb_agg(
                              (
                                (to_jsonb(mi) - 'menu_id' - 'description')
                              )
                              || jsonb_build_object(
                                   -- §<N> dish description is Markdown-canonical: stripped flat + raw _md sibling.
                                   'description', api.strip_markdown(mi.description),
                                   'description_md', mi.description,
                                   'category', (
```

- [ ] **Step 3: Edit the render line**

`api_views_functions.sql:~4980`:

```sql
-- BEFORE
          CASE WHEN mi.description IS NOT NULL THEN ' (' || LEFT(mi.description, 50) || '...)' ELSE '' END AS line_text,
-- AFTER
          -- §<N> strip Markdown BEFORE LEFT so markers don't eat the 50-char budget / leak.
          CASE WHEN mi.description IS NOT NULL THEN ' (' || LEFT(api.strip_markdown(mi.description), 50) || '...)' ELSE '' END AS line_text,
```

- [ ] **Step 4: Edit the search tsvector (both copies)**

`schema_unified.sql:~4667` AND `migration_global_search_document.sql:~143` — same edit in both:

```sql
-- BEFORE
        || ' ' || COALESCE((SELECT string_agg(DISTINCT mi.description, ' ')
-- AFTER
        || ' ' || COALESCE((SELECT string_agg(DISTINCT api.strip_markdown(mi.description), ' ')
```

- [ ] **Step 5: Fold + create migration + backfill**

Fold the two `api_views_functions.sql` edits into `schema_unified.sql`'s `get_object_resource`. Create `migration_markdown_d2_dish.sql` containing: the updated `get_object_resource` body, the updated `api.refresh_object_filter_caches` body (with the wrapped `string_agg`), and the one-time backfill:

```sql
-- Phase D backfill: re-index every object so dish descriptions are stripped in search_document.
-- Idempotent (IS DISTINCT FROM guard inside the function → only changed rows written).
SELECT api.refresh_object_filter_caches(o.id) FROM object o;
```

Add manifest id + runbook entry.

- [ ] **Step 6: Deploy and re-run the SQL test**

Deploy `get_object_resource` (apply_range) + `api.refresh_object_filter_caches` (MCP), run the backfill `SELECT`, `NOTIFY pgrst`. Re-run the Step-1 test. Expected: PASS.

- [ ] **Step 7: Write + run the Jest round-trip test**

Create `bertel-tourism-ui/src/services/object-workspace.menu-items-markdown.test.ts`:

```ts
import { readString } from './object-workspace-parser';

const RAW = 'Poulet **mariné** au [gingembre](https://x) et _combava_';

describe('dish description Markdown round-trip (D2 phase D)', () => {
  it('loader keeps raw Markdown (no strip on the editor leg)', () => {
    const row = { id: 'i1', menu_id: 'm1', name: 'Cari poulet', description: RAW, is_available: true };
    expect(readString(row.description)).toBe(RAW);
  });
});
```

Run: `cd bertel-tourism-ui && npx jest src/services/object-workspace.menu-items-markdown.test.ts` → PASS.

- [ ] **Step 8: Swap the editor field**

`bertel-tourism-ui/src/features/object-editor/widgets/DishEditModal.tsx`: drop `Textarea` from the primitives import (line 3, if unused elsewhere) and add `import { MarkdownEditorLazy } from '../../../components/markdown/MarkdownEditorLazy';`. At line 56:

```tsx
// BEFORE
      <Field label="Description / ingrédients">
        <Textarea value={draft.description} rows={3} onChange={(description) => set({ description })} />
      </Field>
// AFTER
      <Field label="Description / ingrédients">
        <MarkdownEditorLazy
          value={draft.description}
          onChange={(description) => set({ description })}
          ariaLabel="Description du plat"
          variant="inline"
        />
      </Field>
```

- [ ] **Step 9: Typecheck, test, commit**

Run: `cd bertel-tourism-ui && npx tsc --noEmit && npx jest src/services/object-workspace.menu-items-markdown.test.ts src/features/object-editor/widgets/DishEditModal.test.tsx` → PASS.

```bash
git commit -m "feat(editor): Markdown for dish descriptions + search strip — D2 phase D" -- \
  "Base de donnée DLL et API/api_views_functions.sql" \
  "Base de donnée DLL et API/schema_unified.sql" \
  "Base de donnée DLL et API/migration_global_search_document.sql" \
  "Base de donnée DLL et API/migration_markdown_d2_dish.sql" \
  "Base de donnée DLL et API/tests/test_dish_description_markdown.sql" \
  "bertel-tourism-ui/src/services/object-workspace.menu-items-markdown.test.ts" \
  "bertel-tourism-ui/src/features/object-editor/widgets/DishEditModal.tsx"
```

---

## Task E: Sub-place description (`object_place_description`, block)

**Files:**
- Modify: `Base de donnée DLL et API/api_views_functions.sql` (lines ~3862-3910) + folded in `schema_unified.sql`
- Modify: `bertel-tourism-ui/src/services/object-workspace-parser.ts` (`parseDescriptionScope`, lines 1311-1331)
- Modify: `bertel-tourism-ui/src/features/object-editor/sections/SectionPlaces.tsx` (import + lines 141-145)
- Test: `Base de donnée DLL et API/tests/test_place_description_markdown.sql`; `bertel-tourism-ui/src/services/object-workspace-parser.test.ts` (new case)

**Interfaces:**
- Consumes: `api.strip_markdown`, `api.i18n_pick` (var `lang`), `MarkdownCellField` (Task A).
- Produces: places `descriptions[].{description,description_chapo,description_mobile,description_edition,description_adapted}` (stripped) + `*_md` (raw) + `*_raw` (raw scalar editor base); all `*_i18n` columns removed from the block. `parseDescriptionScope` reads base from `*_raw` for the place scope.

- [ ] **Step 1: Write the failing SQL test**

Create `Base de donnée DLL et API/tests/test_place_description_markdown.sql`:

```sql
DO $$
DECLARE v_obj text; v_place uuid; v_res jsonb; v_desc jsonb;
BEGIN
  INSERT INTO object (id, object_type, status, name)
  VALUES ('TSTMDPLACE0001A', 'PCU', 'published', 'MD place test') RETURNING id INTO v_obj;
  INSERT INTO object_place (object_id, label, position) VALUES (v_obj, 'Point de RDV', 0) RETURNING id INTO v_place;
  INSERT INTO object_place_description (place_id, description, description_chapo, visibility)
  VALUES (v_place, 'Voir le **volcan** actif.', 'Accroche *vive*', 'public');

  v_res  := api.get_object_resource(v_obj, ARRAY['fr'], 'none', '{}'::jsonb);
  v_desc := v_res #> '{places,0,descriptions,0}';

  ASSERT v_desc->>'description' = 'Voir le volcan actif.', format('flat not stripped: %s', v_desc->>'description');
  ASSERT v_desc->>'description_md' = 'Voir le **volcan** actif.', 'description_md not raw';
  ASSERT v_desc->>'description_raw' = 'Voir le **volcan** actif.', 'description_raw not raw';
  ASSERT NOT (v_desc ? 'description_i18n'), 'description_i18n leaked';
  ASSERT NOT (v_desc ? 'description_chapo_i18n'), 'description_chapo_i18n leaked';
  ASSERT v_desc->>'description_chapo' = 'Accroche vive', 'chapo not stripped';
  ASSERT v_desc->>'description_chapo_md' = 'Accroche *vive*', 'chapo_md not raw';
  ASSERT v_desc->>'visibility' = 'public', 'visibility passthrough broken';

  RAISE EXCEPTION 'ROLLBACK_OK';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'ROLLBACK_OK' THEN RAISE; END IF;
END $$;
```

> Confirm the `get_object_resource` argument signature in this codebase (the 4-arg `(uuid, text[], text, jsonb)` form is used here); adjust the call if the deployed signature differs. Run via MCP → Expected: FAIL.

- [ ] **Step 2: Edit the places `descriptions` block**

`api_views_functions.sql:~3879` — replace the `jsonb_agg((to_jsonb(pd) - 'place_id') ORDER BY …)` with the explicit override (keep the existing `ORDER BY` and `WHERE` clauses):

```sql
-- BEFORE
                 'descriptions', COALESCE((
                   SELECT jsonb_agg((to_jsonb(pd) - 'place_id')
                            ORDER BY
                              NULLIF((to_jsonb(pd)->>'position'),'')::int NULLS LAST,
                              NULLIF((to_jsonb(pd)->>'language'),'') NULLS LAST,
                              NULLIF((to_jsonb(pd)->>'created_at'),'')::timestamptz NULLS LAST,
                              NULLIF((to_jsonb(pd)->>'id'),'') NULLS LAST,
                              pd.ctid)
                   FROM object_place_description pd
                   WHERE pd.place_id IS NOT DISTINCT FROM p.id
                     AND (v_can_read_extended OR pd.visibility IS NULL OR pd.visibility = 'public')
                 ), '[]'::jsonb),
-- AFTER
                 'descriptions', COALESCE((
                   SELECT jsonb_agg(
                            -- §<N> Markdown: strip flat prose keys, drop raw *_i18n, emit *_md (raw resolved)
                            -- + *_raw (raw scalar base for the editor loader, which round-trips raw Markdown).
                            (
                              to_jsonb(pd)
                              - 'place_id'
                              - 'description'         - 'description_i18n'
                              - 'description_chapo'   - 'description_chapo_i18n'
                              - 'description_mobile'  - 'description_mobile_i18n'
                              - 'description_edition' - 'description_edition_i18n'
                              - 'description_adapted' - 'description_adapted_i18n'
                            )
                            || jsonb_build_object(
                              'description',          api.strip_markdown(COALESCE(api.i18n_pick(pd.description_i18n, lang, 'fr'), pd.description)),
                              'description_md',       COALESCE(api.i18n_pick(pd.description_i18n, lang, 'fr'), pd.description),
                              'description_raw',      pd.description,
                              'description_chapo',    api.strip_markdown(COALESCE(api.i18n_pick(pd.description_chapo_i18n, lang, 'fr'), pd.description_chapo)),
                              'description_chapo_md', COALESCE(api.i18n_pick(pd.description_chapo_i18n, lang, 'fr'), pd.description_chapo),
                              'description_chapo_raw', pd.description_chapo,
                              'description_mobile',   api.strip_markdown(COALESCE(api.i18n_pick(pd.description_mobile_i18n, lang, 'fr'), pd.description_mobile)),
                              'description_mobile_md', COALESCE(api.i18n_pick(pd.description_mobile_i18n, lang, 'fr'), pd.description_mobile),
                              'description_mobile_raw', pd.description_mobile,
                              'description_edition',  api.strip_markdown(COALESCE(api.i18n_pick(pd.description_edition_i18n, lang, 'fr'), pd.description_edition)),
                              'description_edition_md', COALESCE(api.i18n_pick(pd.description_edition_i18n, lang, 'fr'), pd.description_edition),
                              'description_edition_raw', pd.description_edition,
                              'description_adapted',  api.strip_markdown(COALESCE(api.i18n_pick(pd.description_adapted_i18n, lang, 'fr'), pd.description_adapted)),
                              'description_adapted_md', COALESCE(api.i18n_pick(pd.description_adapted_i18n, lang, 'fr'), pd.description_adapted),
                              'description_adapted_raw', pd.description_adapted
                            )
                            ORDER BY
                              NULLIF((to_jsonb(pd)->>'position'),'')::int NULLS LAST,
                              NULLIF((to_jsonb(pd)->>'language'),'') NULLS LAST,
                              NULLIF((to_jsonb(pd)->>'created_at'),'')::timestamptz NULLS LAST,
                              NULLIF((to_jsonb(pd)->>'id'),'') NULLS LAST,
                              pd.ctid)
                   FROM object_place_description pd
                   WHERE pd.place_id IS NOT DISTINCT FROM p.id
                     AND (v_can_read_extended OR pd.visibility IS NULL OR pd.visibility = 'public')
                 ), '[]'::jsonb),
```

- [ ] **Step 3: Fold, deploy, re-run SQL test**

Fold into `schema_unified.sql`; create `migration_markdown_d2_place.sql` + manifest/runbook. Deploy `get_object_resource` (apply_range), `NOTIFY pgrst`. Re-run Step-1 test → PASS.

- [ ] **Step 4: Write the failing parser test**

Add to `bertel-tourism-ui/src/services/object-workspace-parser.test.ts`:

```ts
it('parses a place description base from description_raw (stripped flat key ignored)', () => {
  const detail = { raw: { places: [{ id: 'p1', name: 'Point de RDV', descriptions: [{
    id: 'd1', description: 'Voir le volcan actif.', description_raw: 'Voir le **volcan** actif.',
    description_md: 'Voir le **volcan** actif.', description_i18n: null, visibility: 'public',
  }] }] } } as unknown as import('./object-detail-parser').ObjectDetail;
  const modules = parseObjectWorkspace(detail, ['fr']);
  expect(modules.descriptions.places[0].description.baseValue).toBe('Voir le **volcan** actif.');
});
```

Run: `cd bertel-tourism-ui && npx jest src/services/object-workspace-parser.test.ts -t description_raw` → Expected: FAIL (base is the stripped value).

- [ ] **Step 5: Edit `parseDescriptionScope`**

`object-workspace-parser.ts:1311-1331` — add a place-scope raw-base helper and route the five prose fields through it:

```ts
// Inside parseDescriptionScope, before the return:
  // §<N> Markdown: for the PLACE scope the resource's flat prose keys are STRIPPED (plain text),
  // so the raw scalar base comes from the *_raw siblings get_object_resource now emits. The object/
  // org scopes (canonical_description / org_description) carry the raw scalar in the flat key (editor-
  // only keys, never stripped), so they keep reading the flat key.
  const base = (raw: unknown, flat: unknown) => (params.scope === 'place' ? (raw ?? flat) : flat);
```

Then change the five `toTranslatableField(...)` lines:

```ts
// BEFORE
    description: toTranslatableField(params.record.description, params.record.description_i18n),
    chapo: toTranslatableField(params.record.description_chapo, params.record.description_chapo_i18n),
    adaptedDescription: toTranslatableField(params.record.description_adapted, params.record.description_adapted_i18n),
    mobileDescription: toTranslatableField(params.record.description_mobile, params.record.description_mobile_i18n),
    editorialDescription: toTranslatableField(params.record.description_edition, params.record.description_edition_i18n),
// AFTER
    description: toTranslatableField(base(params.record.description_raw, params.record.description), params.record.description_i18n),
    chapo: toTranslatableField(base(params.record.description_chapo_raw, params.record.description_chapo), params.record.description_chapo_i18n),
    adaptedDescription: toTranslatableField(base(params.record.description_adapted_raw, params.record.description_adapted), params.record.description_adapted_i18n),
    mobileDescription: toTranslatableField(base(params.record.description_mobile_raw, params.record.description_mobile), params.record.description_mobile_i18n),
    editorialDescription: toTranslatableField(base(params.record.description_edition_raw, params.record.description_edition), params.record.description_edition_i18n),
```

Run the parser test → Expected: PASS. (The place call site at `object-workspace-parser.ts:3221-3230` needs no change — its `record` already carries `description_raw`.)

- [ ] **Step 6: Swap the editor field to `MarkdownCellField`**

`bertel-tourism-ui/src/features/object-editor/sections/SectionPlaces.tsx`: add `import { MarkdownCellField } from '../../../components/markdown/MarkdownCellField';`. At lines 141-145:

```tsx
// BEFORE
            <Textarea
              value={readTranslatableField(place.description, descriptions.activeLanguage, descriptions.localLanguage)}
              rows={2}
              onChange={(value) => updatePlace(index, { description: value })}
            />
// AFTER
            <MarkdownCellField
              variant="block"
              value={readTranslatableField(place.description, descriptions.activeLanguage, descriptions.localLanguage)}
              onChange={(value) => updatePlace(index, { description: value })}
              ariaLabel={`Description du sous-lieu — ${place.label || `lieu ${index + 1}`}`}
            />
```

(If `Textarea` becomes unused in `SectionPlaces.tsx`, remove it from the primitives import.)

- [ ] **Step 7: Typecheck, test, commit**

Run: `cd bertel-tourism-ui && npx tsc --noEmit && npx jest src/services/object-workspace-parser.test.ts src/features/object-editor/sections/SectionPlaces.test.tsx` → PASS.

```bash
git commit -m "feat(editor): Markdown for sub-place descriptions — D2 phase E" -- \
  "Base de donnée DLL et API/api_views_functions.sql" \
  "Base de donnée DLL et API/schema_unified.sql" \
  "Base de donnée DLL et API/migration_markdown_d2_place.sql" \
  "Base de donnée DLL et API/tests/test_place_description_markdown.sql" \
  "bertel-tourism-ui/src/services/object-workspace-parser.ts" \
  "bertel-tourism-ui/src/services/object-workspace-parser.test.ts" \
  "bertel-tourism-ui/src/features/object-editor/sections/SectionPlaces.tsx"
```

---

## Task F: ITI stage description (`object_iti_stage.description`, inline)

**Files:**
- Modify: `Base de donnée DLL et API/api_views_functions.sql` (lines ~4142, ~809, ~872, ~7641, ~7781) + folded in `schema_unified.sql`
- Modify: `bertel-tourism-ui/src/features/object-editor/sections/blocks/BlockITI.tsx` (import + line 126)
- Modify: `bertel-tourism-ui/src/features/object-editor/sections/SectionPlaces.tsx` (import already added in E; stage row line ~39)
- Test: `Base de donnée DLL et API/tests/test_iti_stage_markdown.sql`; `bertel-tourism-ui/src/services/object-workspace.itinerary.test.ts` (new case)

**Interfaces:**
- Consumes: `api.strip_markdown` (plain text). `MarkdownCellField` (Task A). Editor direct-select override at `object-workspace.ts:3197` re-supplies raw → no resource raw-leg.
- Produces: resource `itinerary_details.stages[].description` (stripped) + `description_md` (raw); KML/GPX/GeoJSON exports stripped.

- [ ] **Step 1: Write the failing SQL test**

Create `Base de donnée DLL et API/tests/test_iti_stage_markdown.sql`:

```sql
DO $$
DECLARE
  v_obj text; v_stage uuid; v_res jsonb; v_stage_j jsonb; v_kml text; v_gpx text; v_geo json;
  v_md text := '## Sommet **panoramique** au [refuge](https://ex.re)';
  v_plain text := 'Sommet panoramique au refuge';
BEGIN
  SELECT id INTO v_obj FROM object WHERE object_type='ITI' LIMIT 1;
  IF v_obj IS NULL THEN RAISE NOTICE 'no ITI object — skipping'; RETURN; END IF;
  INSERT INTO object_iti_stage(object_id, name, description, position, geom)
  VALUES (v_obj, 'Test stage', v_md, 9999, ST_SetSRID(ST_MakePoint(55.5,-21.1),4326)::geography)
  RETURNING id INTO v_stage;

  v_res := api.get_object_resource(v_obj, ARRAY['fr']);
  SELECT s INTO v_stage_j FROM jsonb_array_elements(v_res->'itinerary_details'->'stages') s WHERE s->>'name'='Test stage';
  ASSERT v_stage_j->>'description' = v_plain, format('resource flat not stripped: %s', v_stage_j->>'description');
  ASSERT v_stage_j->>'description_md' = v_md, 'resource description_md not raw';

  v_kml := api.build_iti_track(v_obj, 'kml', TRUE);
  ASSERT position(v_plain IN v_kml) > 0 AND position('**panoramique**' IN v_kml) = 0, 'KML leak';
  v_gpx := api.build_iti_track(v_obj, 'gpx', TRUE);
  ASSERT position('**panoramique**' IN v_gpx) = 0, 'GPX(build_iti_track) leak';
  v_gpx := api.export_itinerary_gpx(v_obj, TRUE, FALSE);
  ASSERT position('**panoramique**' IN v_gpx) = 0, 'GPX(export_itinerary_gpx) leak';
  v_geo := api.get_itinerary_track_geojson(v_obj, FALSE, 0.0001);
  ASSERT position('**panoramique**' IN v_geo::text) = 0, 'GeoJSON leak';

  DELETE FROM object_iti_stage WHERE id = v_stage;
  RAISE NOTICE 'Phase F PASS';
END $$;
```

> Confirm the exact argument lists of `build_iti_track`, `export_itinerary_gpx`, `get_itinerary_track_geojson` against the source before running. Run via MCP → Expected: FAIL.

- [ ] **Step 2: Edit the resource stages block**

`api_views_functions.sql:~4142`:

```sql
-- BEFORE
          SELECT jsonb_agg(
                   (to_jsonb(st) - 'object_id')
                   ||
                   jsonb_build_object(
                     'media', COALESCE((
-- AFTER
          SELECT jsonb_agg(
                   (to_jsonb(st) - 'object_id' - 'description')
                   ||
                   jsonb_build_object(
                     -- §<N> stage description Markdown-canonical (inline): stripped flat + raw _md.
                     'description', api.strip_markdown(st.description),
                     'description_md', st.description,
                     'media', COALESCE((
```

- [ ] **Step 3: Edit the three flat exports**

`build_iti_track` KML (`~809`) and GPX (`~872`) — both bind `stg.description AS desc_raw`:

```sql
-- BEFORE (both sites)
          stg.description AS desc_raw,
-- AFTER (both sites)
          api.strip_markdown(stg.description) AS desc_raw,  -- §<N> flat export
```

`export_itinerary_gpx` waypoint (`~7641`):

```sql
-- BEFORE
        replace(replace(COALESCE(description, ''), '&', '&amp;'), '<', '&lt;')
-- AFTER
        replace(replace(COALESCE(api.strip_markdown(description), ''), '&', '&amp;'), '<', '&lt;')
```

`get_itinerary_track_geojson` properties (`~7781`):

```sql
-- BEFORE
        'description', description,
-- AFTER
        'description', api.strip_markdown(description),
```

- [ ] **Step 4: Fold, deploy, re-run SQL test**

Fold all five edits into `schema_unified.sql`. Create `migration_markdown_d2_iti.sql` with the updated `get_object_resource`, `build_iti_track`, `export_itinerary_gpx`, `get_itinerary_track_geojson` bodies + manifest/runbook. Deploy (apply_range for `get_object_resource`; the export fns via MCP), `NOTIFY pgrst`. Re-run Step-1 test → PASS. (`export_itineraries_gpx_batch` delegates to `export_itinerary_gpx` — no own change; spot-check it is clean.)

- [ ] **Step 5: Write + run the Jest round-trip test**

Add to `bertel-tourism-ui/src/services/object-workspace.itinerary.test.ts`:

```ts
import { buildItineraryStagesPayload } from './object-workspace';

it('keeps raw Markdown in the stage save payload (D2 phase F)', () => {
  const RAW = '## Sommet **panoramique** au [refuge](https://ex.re)';
  const module = { unavailableReason: null,
    stages: [{ recordId: 'stg-1', name: 'Sommet', description: RAW, position: '1' }] } as Parameters<typeof buildItineraryStagesPayload>[0];
  const payload = buildItineraryStagesPayload(module);
  expect(payload![0].description).toBe(RAW);
});
```

Run: `cd bertel-tourism-ui && npx jest src/services/object-workspace.itinerary.test.ts` → PASS (save path is already raw; this guards the editor leg).

- [ ] **Step 6: Swap both editor surfaces to `MarkdownCellField`**

`bertel-tourism-ui/src/features/object-editor/sections/blocks/BlockITI.tsx` — add `import { MarkdownCellField } from '../../../../components/markdown/MarkdownCellField';` (depth: `sections/blocks/` → `../../../../components`). At line 126:

```tsx
// BEFORE
                <Input value={stage.description} onChange={(description) => updateStage(index, { description })} />
// AFTER
                <MarkdownCellField
                  variant="inline"
                  value={stage.description}
                  onChange={(description) => updateStage(index, { description })}
                  ariaLabel={`Description de l'étape ${index + 1}`}
                />
```

`bertel-tourism-ui/src/features/object-editor/sections/SectionPlaces.tsx` — the stage row at line ~39 (`MarkdownCellField` is already imported from Task E):

```tsx
// BEFORE
            <Input value={stage.description} onChange={(description) => updateStage(index, { description })} />
// AFTER
            <MarkdownCellField
              variant="inline"
              value={stage.description}
              onChange={(description) => updateStage(index, { description })}
              ariaLabel={`Description de l'étape ${index + 1}`}
            />
```

- [ ] **Step 7: Typecheck, full suite, build, commit**

Run: `cd bertel-tourism-ui && npx tsc --noEmit && npx jest src/services/object-workspace.itinerary.test.ts src/features/object-editor/sections/blocks/BlockITI.test.tsx && npx next build`
Expected: PASS / build exit 0.

```bash
git commit -m "feat(editor): Markdown for ITI stage descriptions + export strip — D2 phase F" -- \
  "Base de donnée DLL et API/api_views_functions.sql" \
  "Base de donnée DLL et API/schema_unified.sql" \
  "Base de donnée DLL et API/migration_markdown_d2_iti.sql" \
  "Base de donnée DLL et API/tests/test_iti_stage_markdown.sql" \
  "bertel-tourism-ui/src/services/object-workspace.itinerary.test.ts" \
  "bertel-tourism-ui/src/features/object-editor/sections/blocks/BlockITI.tsx" \
  "bertel-tourism-ui/src/features/object-editor/sections/SectionPlaces.tsx"
```

---

## Wrap-up (after all tasks)

- [ ] Run the full FE suite + `tsc` + `next build`; run all five `test_*_markdown.sql` via MCP.
- [ ] `mcp__supabase__get_advisors` — confirm only the expected §36 DEFINER notices.
- [ ] Record the work in `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md` under the claimed `§<N>` (scope, the five fields, the editor-raw-leg constraint, the search backfill, manifest ids) and update the `CLAUDE.md` "Descriptions — Markdown" invariant block to note Delivery 2 covers `direction`/room/menu/place/iti_stage.
- [ ] Refresh MCP memory + `db-graph` artifacts (new `*_md`/`*_raw` resource keys).

## Self-review notes (coverage)

- Spec §3 scope table → Tasks B–F (one per field). ✓
- Spec §4 per-field backend → B (2 resource sites), C (resource + getter), D (resource + render + 2 search copies + backfill), E (places block), F (resource + 3 exports). ✓
- Spec §5 editor round-trip constraint → B (`direction_md` leg + test), E (`*_raw` leg + parser test); C/D load via direct select (no leg); F has a direct-select override (no leg). ✓
- Spec §6 `MarkdownCellField` → Task A, consumed by E (block) and F (inline). ✓
- Spec §2 non-goal "no drawer rendering" → no task touches `object-detail-parser.ts`/`ObjectDetailView.tsx`. ✓
- Spec §8 testing → each task has a SQL contract test + a Jest round-trip test; D adds the search-vector assertion. ✓
- Open item (§10): the `*_raw` key naming for places is now concrete (`<col>_raw`); the ITI export i18n question is resolved (exports strip the plain column only, no `i18n_pick` introduced). ✓
