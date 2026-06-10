# Editor Audit Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every verified gap from the 2026-06-10 "Object editor vs database surface" audit: make `object_act` authorable (ASC+ACT), give FMA events a real date/occurrence editor, render the §46 disabled-with-reason gates, wire org-link & actor-role authoring (§17), discounts (§13), contact flags (§03), honest-disable the GPX dropzone, and collapse the four duplicated editing surfaces to one owner each.

**Architecture:** Two small SQL migrations (manifest steps **8q** and **8r**) extend the §46 applicability seed and converge `actor_object_role` to the §47 per-command policy family + an `actors` branch in `api.save_object_relations` + a gated `api.search_actors` picker RPC. Everything else is frontend: archetype remaps (ACT→ASC, FMA→new FMA archetype + BlockFMA), a shared `ModuleUnavailableNotice`, new repeaters in §13/§17, and single-owner cleanup in the §05 blocks. Every editable control either persists on save or is visibly disabled with a stated reason (CLAUDE.md "no silent write-traps").

**Tech Stack:** Next.js/React + TypeScript (`bertel-tourism-ui`), Jest + Testing Library, Supabase (PostgREST + SECURITY INVOKER workspace RPCs + RLS), psql CI gate (`ci_fresh_apply.sql` + `.github/workflows/sql-fresh-apply.yml`).

---

## Execution context (read first)

- **Working dirs:** frontend commands run from `bertel-tourism-ui/` (`npx jest <path>`, `npx tsc --noEmit`). SQL sources live in `Base de donnée DLL et API/`.
- **Live DB applies** go through the Supabase MCP (`mcp__supabase__apply_migration` with a snake_case name, then `mcp__supabase__get_advisors` for security lints). Never apply DDL only to live: every migration here is also added to `docs/SQL_ROLLOUT_RUNBOOK.md`, `Base de donnée DLL et API/ci_fresh_apply.sql`, and the CI workflow (deploy-integrity rule).
- **Git:** commit to `master` after each task. Do NOT push — the user pushes manually (sandbox blocks push).
- **⚠ Pre-existing local state:** `bertel-tourism-ui/src/features/object-editor/editor-validation.test.ts` has **uncommitted user changes** — two TDD-red tests for a §02 commune blocker that is not implemented yet. Do NOT touch, commit, or revert that file. Run **targeted** jest specs per task; a full-suite run is expected to show exactly those 2 failures until the user lands his rule. Never `git add -A` — stage files explicitly.
- **Research excerpts** (verbatim current code used to write this plan) are in `docs/superpowers/plans/.research/editor-audit-fixes/*.md` — consult them before editing an unfamiliar file.
- **Live facts (2026-06-10):** 848 objects (ACT 52, ORG 1, FMA 0, ASC 0); `object_act`/`object_discount`/`object_fma*` all 0 rows; `actor` 696 rows / `actor_object_role` 799 rows (all role `operator`); `ref_actor_role.operator` IS seeded (the WORKFLOW.md "seed missing" row is stale); `ref_org_role` = publisher/contributor/reader.

### Decisions locked by the user (2026-06-10)

1. **object_act:** remap ACT→ASC archetype **and** seed `('object_act','ASC')` — both types author activity data.
2. **§13 discounts:** build the UI (RPC + RLS already live).
3. **§17 actor roles:** build the write path now (per-command policies + RPC branch); `actor_channel`/`actor_consent` stay out of scope (link rows only).
4. **GPX dropzone:** disabled-with-reason now; the full parse→`object_iti.geom` pipeline is a separate future feature.

---

## Task 1: DB — extend `object_act` applicability to ASC (manifest 8q)

**Files:**
- Create: `Base de donnée DLL et API/migration_object_act_asc_applicability.sql`
- Modify: `Base de donnée DLL et API/tests/test_facet_applicability.sql` (~line 571)
- Modify: `Base de donnée DLL et API/ci_fresh_apply.sql` (after the 8p `\ir`)
- Modify: `docs/SQL_ROLLOUT_RUNBOOK.md` (new 8q entry)

- [ ] **Step 1: Write the migration**

```sql
-- migration_object_act_asc_applicability.sql
-- §48 — Extend object_act applicability to ASC (decision 2026-06-10).
-- The §46 baseline seeded ('object_act','ACT') only, which orphaned the activity editor:
-- ASC objects render BlockASC (the only object_act UI) but the §46 gate + trigger rejected
-- their saves, while ACT objects rendered BlockSRV (no activity controls) — object_act was
-- authorable by NO type (0 rows live despite 52 ACT objects). Decision: both ASC and ACT
-- legitimately carry object_act rows; the editor remap (ACT→ASC archetype) lands in the same pass.
-- PREREQUISITES: migration_facet_applicability.sql (8m). Manifest step 8q.
-- IDEMPOTENT: ON CONFLICT DO NOTHING.
-- REVERSIBLE: DELETE FROM ref_facet_applicability WHERE facet_table='object_act' AND object_type='ASC';
BEGIN;

INSERT INTO ref_facet_applicability (facet_table, object_type)
VALUES ('object_act', 'ASC'::object_type)
ON CONFLICT DO NOTHING;

COMMIT;
```

- [ ] **Step 2: Extend the CI test**

In `tests/test_facet_applicability.sql`, directly after the line
`ASSERT EXISTS (SELECT 1 FROM ref_facet_applicability WHERE facet_table='object_act' AND object_type='ACT'), 'object_act must accept ACT';`
add:

```sql
  ASSERT EXISTS (SELECT 1 FROM ref_facet_applicability WHERE facet_table='object_act' AND object_type='ASC'),
         'object_act must accept ASC (8q — decision log §48)';
```

- [ ] **Step 3: Wire the fresh-apply gate**

In `ci_fresh_apply.sql`, immediately after the `\ir migration_child_read_gate_setbased.sql` line (8p), insert:

```
\echo '== 8q     migration_object_act_asc_applicability.sql  (extend object_act applicability to ASC; after 8m) =='
\ir migration_object_act_asc_applicability.sql
```

- [ ] **Step 4: Runbook entry**

In `docs/SQL_ROLLOUT_RUNBOOK.md`, after the 8p entry, add:

```markdown
8q. `migration_object_act_asc_applicability.sql` — **§48 object_act↔ASC**: adds ('object_act','ASC') to `ref_facet_applicability`. The §46 baseline (ACT-only) had orphaned the activity editor — ASC rendered the UI but could not save; ACT could save but had no UI. Paired with the frontend ACT→ASC archetype remap. After 8m. Idempotent; covered by `test_facet_applicability.sql`.
```

- [ ] **Step 5: Apply to live + verify**

Apply via `mcp__supabase__apply_migration` (name: `object_act_asc_applicability`, query = the migration body without BEGIN/COMMIT — the MCP wraps it). Then verify with `mcp__supabase__execute_sql`:

```sql
SELECT facet_table, object_type FROM ref_facet_applicability WHERE facet_table = 'object_act' ORDER BY object_type;
```
Expected: 2 rows — `(object_act, ACT)`, `(object_act, ASC)`. Run `mcp__supabase__get_advisors` (security): no new findings.

- [ ] **Step 6: Commit**

```bash
git add "Base de donnée DLL et API/migration_object_act_asc_applicability.sql" "Base de donnée DLL et API/tests/test_facet_applicability.sql" "Base de donnée DLL et API/ci_fresh_apply.sql" docs/SQL_ROLLOUT_RUNBOOK.md
git commit -m "feat(db): §48 object_act applicability extended to ASC (manifest 8q)"
```

---

## Task 2: FE — remap ACT to the ASC archetype

**Files:**
- Modify: `bertel-tourism-ui/src/features/object-editor/archetypes.ts`
- Test: `bertel-tourism-ui/src/features/object-editor/archetypes.test.ts`

- [ ] **Step 1: Update the pinning test first (RED)**

In `archetypes.test.ts`, replace the ACT test:

```ts
  it('routes ACT to the ASC archetype (object_act is the shared activity facet — §48)', () => {
    expect(getArchetypeMeta('ACT')?.archetype).toBe('ASC');
    expect(getArchetypeMeta('ACT')?.covers).toContain('ACT');
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest src/features/object-editor/archetypes.test.ts`
Expected: FAIL — `Expected: "ASC", Received: "SRV"`.

- [ ] **Step 3: Implement the remap in `archetypes.ts`**

Three edits:

```ts
const ASC_ARCHETYPE: ArchetypeMeta = {
  archetype: 'ASC',
  accent: 'acc-blue',
  codeName: 'Activité sportive & culturelle',
  family: 'Activité encadrée · Stage · Initiation',
  covers: 'ASC · ACT',
};
```

```ts
const SRV_ARCHETYPE: ArchetypeMeta = {
  archetype: 'SRV',
  accent: 'acc-rust',
  codeName: 'Service & commerce',
  family: 'OT · Commerce · Service',
  covers: 'PSV · VIL · COM',
};
```

In `TYPE_ARCHETYPES`, change `ACT: SRV_ARCHETYPE,` to `ACT: ASC_ARCHETYPE,` and update the header comment block (lines 1–11) to note: "ACT maps to the ASC archetype (BlockASC is the object_act editor; applicability = ASC+ACT per §48)".

- [ ] **Step 4: Run tests + typecheck**

Run: `npx jest src/features/object-editor/archetypes.test.ts && npx tsc --noEmit`
Expected: PASS (12/12), tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/features/object-editor/archetypes.ts src/features/object-editor/archetypes.test.ts
git commit -m "feat(editor): §48 remap ACT to the ASC archetype (BlockASC reaches its facet table)"
```

---

## Task 3: FE — render the §46 disabled-with-reason gate in the type blocks

The 6 type-gated modules (`rooms`, `meetingRooms`, `menus`, `activity`, `event`, `itinerary`) carry `unavailableReason` (set by the §46 registry loop AND by loader fetch failures), and their savers throw on it — but **no component renders it**: users see enabled controls whose save fails as a generic "N section(s) en échec". This task makes the gate visible.

**Files:**
- Create: `bertel-tourism-ui/src/features/object-editor/sections/blocks/block-notes.tsx`
- Modify: `bertel-tourism-ui/src/features/object-editor/sections/blocks/BlockASC.tsx`
- Modify: `bertel-tourism-ui/src/features/object-editor/sections/blocks/BlockHEB.tsx`
- Modify: `bertel-tourism-ui/src/features/object-editor/sections/blocks/BlockRES.tsx`
- Modify: `bertel-tourism-ui/src/features/object-editor/sections/blocks/BlockITI.tsx`
- Test: extend `BlockASC.test.tsx`, `BlockHEB.test.tsx`, `BlockRES.test.tsx` (create if missing — `BlockHEB.test.tsx` exists; check `BlockRES`), new `BlockITI.test.tsx` assertions land in Task 10.

- [ ] **Step 1: Write failing specs (RED)**

Append to `BlockASC.test.tsx`:

```tsx
describe('BlockASC — §46 disabled-with-reason (activity module)', () => {
  it('renders the unavailable notice instead of activity controls when gated', () => {
    const modules = fullModulesFixture();
    modules.activity.unavailableReason = 'Module non applicable au type RES (référentiel ref_facet_applicability).';
    const { result } = renderHook(() => useObjectEditorState('o1', modules));
    render(<BlockASC editor={result.current} permissions={allowAll} />);

    expect(screen.getByText(/Module non applicable au type RES/)).toBeInTheDocument();
    expect(screen.queryByText('Durée minimale')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Encadrement obligatoire')).not.toBeInTheDocument();
  });
});
```

Mirror the same shape in `BlockHEB.test.tsx` (set `modules.rooms.unavailableReason` → expect notice + `screen.queryByText('Ajouter un type de chambre')` absent while `Politiques d'accueil` STAYS — capacityPolicies is not type-gated; and `modules.meetingRooms.unavailableReason` → `Ajouter une salle` absent) and in a `BlockRES.test.tsx` describe (set `modules.menus.unavailableReason` → expect notice + `Ajouter un menu / une carte` absent while the group-policy fields stay).

- [ ] **Step 2: Run to verify failure**

Run: `npx jest src/features/object-editor/sections/blocks`
Expected: new specs FAIL (notice not found).

- [ ] **Step 3: Create the shared notice component**

`sections/blocks/block-notes.tsx`:

```tsx
/**
 * §46 disabled-with-reason banner for the 6 type-gated workspace modules
 * (rooms / meetingRooms / menus / activity / event / itinerary).
 * Rendered INSTEAD of the module's editable controls when `unavailableReason`
 * is set — the saver throws on that reason, so showing it here surfaces the
 * gate BEFORE save instead of a generic "section en échec" afterwards.
 */
export function ModuleUnavailableNotice({ reason }: { reason: string }) {
  return (
    <p
      role="status"
      style={{
        fontSize: 12,
        color: 'var(--ink-4)',
        margin: '0 0 12px',
        padding: '8px 12px',
        borderRadius: 'var(--r-md)',
        background: 'var(--bg-tint)',
        border: '1px solid var(--line-soft)',
      }}
    >
      <strong style={{ color: 'var(--ink-3)' }}>Module désactivé.</strong> {reason}
    </p>
  );
}
```

- [ ] **Step 4: Wire it into the blocks**

Each block wraps ONLY its type-gated module's controls; modules that are not type-gated (pricing, characteristics, openings, capacityPolicies) stay rendered.

**BlockASC** — import `{ ModuleUnavailableNotice } from './block-notes';`. Wrap the activity-module areas (the "Caractéristiques métier" `chip-group__label` + `grid-4`, the two `Toggle`s `grid-2`, the conditional "Équipement & sécurité fournis" ChipSet, and the bottom `grid-3` Difficulté/Équipement/Durée) in:

```tsx
{activity.unavailableReason ? (
  <ModuleUnavailableNotice reason={activity.unavailableReason} />
) : (
  <>
    {/* …existing activity-module JSX, unchanged… */}
  </>
)}
```
The actors display block and the pricing "Formules & sessions" repeater stay OUTSIDE the wrap (pricing is removed in Task 11, not here).

**BlockHEB** — two independent wraps: the rooms area (label + `repHeader(ROOM_COLS,…)` + rooms `Repeater` + `RoomEditModal` conditional) behind `rooms.unavailableReason`, and the MICE area (label + `repHeader(MICE_COLS,…)` + meetingRooms `Repeater` + `MeetingRoomEditModal` conditional) behind `meetingRooms.unavailableReason`. "Politiques d'accueil" stays untouched.

**BlockRES** — wrap the menus-module areas (the "Cuisines proposées" Field — it edits `menus.items` —, the "Cartes & menus (PDF)" label + Repeater, and the PDF-dropzone/`Notes menu` `grid-2`) behind `menus.unavailableReason`. The group-policy `grid-3` and the ScheduleEditor stay untouched (Task 11 handles them).

**BlockITI** — wrap the ENTIRE `<Fs>` body (everything is the itinerary module) in `{itinerary.unavailableReason ? <ModuleUnavailableNotice reason={itinerary.unavailableReason} /> : (<>…</>)}`.

- [ ] **Step 5: Run tests + typecheck**

Run: `npx jest src/features/object-editor/sections/blocks && npx tsc --noEmit`
Expected: all block specs PASS, tsc clean.

- [ ] **Step 6: Commit**

```bash
git add src/features/object-editor/sections/blocks
git commit -m "feat(editor): §48 render the §46 unavailable-reason gate in the type blocks (no invisible save-traps)"
```

---

## Task 4: FE — FMA archetype + BlockFMA (event dates & occurrences)

Everything backend-side is ready: loader `getObjectWorkspaceEventModule` (object-workspace.ts:2639), saver `saveObjectWorkspaceEvent` (:4377, upsert `object_fma` + delete/reinsert `object_fma_occurrence`), dirty-tracking (`event` in MODULE_KEY_MAP, not READONLY), dispatch (useExplorerQueries.ts:294), and live RLS (`canonical_ins/upd/del_object_fma`, manifest 8n). Only the archetype + controls are missing.

**Files:**
- Modify: `bertel-tourism-ui/src/features/object-editor/archetypes.ts` (+ FMA archetype)
- Modify: `bertel-tourism-ui/src/features/object-editor/archetypes.test.ts`
- Modify: `bertel-tourism-ui/src/features/object-editor/section-config.ts` (TYPE_BLOCK_LABEL.FMA)
- Modify: `bertel-tourism-ui/src/features/object-editor/sections/blocks/index.ts` (TYPE_BLOCKS.FMA)
- Create: `bertel-tourism-ui/src/features/object-editor/sections/blocks/BlockFMA.tsx`
- Modify: `bertel-tourism-ui/src/features/object-editor/primitives/Input.tsx` (allow `type="datetime-local"`)
- Modify: `bertel-tourism-ui/src/features/object-editor/editor-validation.ts` (FMA publication rule)
- Create: `bertel-tourism-ui/src/features/object-editor/editor-validation.fma.test.ts` (do NOT touch `editor-validation.test.ts` — user WIP)
- Create: `bertel-tourism-ui/src/features/object-editor/sections/blocks/BlockFMA.test.tsx`

- [ ] **Step 1: Update archetype pins (RED)**

In `archetypes.test.ts`, replace the itinerary test and add an FMA test:

```ts
  it('maps the itinerary code to ITI (FMA has its own archetype since §48)', () => {
    expect(getArchetypeMeta('ITI')?.archetype).toBe('ITI');
  });

  it('routes FMA to the FMA archetype (object_fma dates editor, not the trail editor)', () => {
    expect(getArchetypeMeta('FMA')?.archetype).toBe('FMA');
  });
```

Run: `npx jest src/features/object-editor/archetypes.test.ts` — Expected: FAIL (`FMA` → `ITI`).

- [ ] **Step 2: Add the FMA archetype in `archetypes.ts`**

```ts
export type ArchetypeCode = 'HEB' | 'RES' | 'ASC' | 'ITI' | 'VIS' | 'SRV' | 'FMA';
```

```ts
const FMA_ARCHETYPE: ArchetypeMeta = {
  archetype: 'FMA',
  accent: 'acc-orange', // reuses the RES palette — no new CSS accent class required
  codeName: 'Fête & manifestation',
  family: 'Événement · Animation · Manifestation',
  covers: 'FMA',
};
```

Change `ITI_ARCHETYPE.covers` to `'ITI'`. In `TYPE_ARCHETYPES`, change `FMA: ITI_ARCHETYPE,` to `FMA: FMA_ARCHETYPE,`. In `TYPE_LABEL`, change `FMA: 'Itineraire',` to `FMA: 'Fete / manifestation',`. Add `FMA: FMA_ARCHETYPE,` to `ARCHETYPE_META` (the `Record<ArchetypeCode, …>` type now requires it — tsc enforces).

- [ ] **Step 3: Section config + block registry**

`section-config.ts` — add to `TYPE_BLOCK_LABEL` (tsc requires the new key):

```ts
  FMA: 'Dates & programmation',
```
(`hasPlaces` stays `ITI || VIS` — an FMA event loses §16, which previously leaked in via the ITI mapping; intended.)

`sections/blocks/index.ts`:

```ts
import { BlockFMA } from './BlockFMA';
// …
export const TYPE_BLOCKS: Record<ArchetypeCode, ComponentType<SectionProps>> = {
  HEB: BlockHEB,
  RES: BlockRES,
  ASC: BlockASC,
  ITI: BlockITI,
  VIS: BlockVIS,
  SRV: BlockSRV,
  FMA: BlockFMA,
};
export { BlockASC, BlockFMA, BlockHEB, BlockITI, BlockRES, BlockSRV, BlockVIS };
```

- [ ] **Step 4: Allow `datetime-local` on the Input primitive**

In `primitives/Input.tsx`, widen the type union:

```ts
  type?: 'text' | 'date' | 'time' | 'number' | 'datetime-local';
```

- [ ] **Step 5: Create `BlockFMA.tsx`**

```tsx
import { Field, Fs, Input, Repeater, Select, Toggle } from '../../primitives';
import type { SectionProps } from '../section-types';
import { ModuleUnavailableNotice } from './block-notes';

const OCCURRENCE_COLS = '14px 1fr 1fr 130px auto';
// object_fma_occurrence.state is free TEXT; the loader defaults to 'scheduled'.
const STATE_OPTIONS = [
  { v: 'scheduled', l: 'Programmée' },
  { v: 'confirmed', l: 'Confirmée' },
  { v: 'cancelled', l: 'Annulée' },
  { v: 'postponed', l: 'Reportée' },
];

/** ISO timestamptz → <input type="datetime-local"> value (minute precision). */
function toLocalInputValue(value: string): string {
  return value ? value.slice(0, 16) : '';
}

export function BlockFMA({ editor, folded }: SectionProps) {
  const event = editor.draft.event;

  function patch(patchValue: Partial<typeof event>) {
    editor.patchModule('event', patchValue);
  }

  function updateOccurrence(index: number, patchValue: Partial<(typeof event.occurrences)[number]>) {
    patch({
      occurrences: event.occurrences.map((occurrence, occurrenceIndex) =>
        occurrenceIndex === index ? { ...occurrence, ...patchValue } : occurrence,
      ),
    });
  }

  const pillLabel =
    event.occurrences.length > 0
      ? `${event.occurrences.length} occurrence(s)`
      : event.startDate
        ? 'Dates renseignées'
        : 'À programmer';

  return (
    <Fs
      num="05"
      title="Dates & programmation"
      sub="Période de l'événement, horaires, récurrence et occurrences détaillées"
      folded={folded}
      pill={{ tone: event.startDate || event.occurrences.length > 0 ? 'ok' : 'warn', label: pillLabel }}
    >
      {event.unavailableReason ? (
        <ModuleUnavailableNotice reason={event.unavailableReason} />
      ) : (
        <>
          <div className="grid-4" style={{ marginBottom: 10 }}>
            <Field label="Date de début">
              <Input type="date" aria-label="Date de début" value={event.startDate} onChange={(startDate) => patch({ startDate })} />
            </Field>
            <Field label="Date de fin">
              <Input type="date" aria-label="Date de fin" value={event.endDate} onChange={(endDate) => patch({ endDate })} />
            </Field>
            <Field label="Heure de début">
              <Input type="time" aria-label="Heure de début" value={event.startTime} onChange={(startTime) => patch({ startTime })} />
            </Field>
            <Field label="Heure de fin">
              <Input type="time" aria-label="Heure de fin" value={event.endTime} onChange={(endTime) => patch({ endTime })} />
            </Field>
          </div>
          <div className="grid-2" style={{ marginBottom: 14 }}>
            <Toggle
              label="Événement récurrent"
              sub="Se répète selon une règle"
              on={event.recurring}
              onChange={(recurring) => patch({ recurring })}
            />
            {event.recurring && (
              <Field label="Règle de récurrence" hint="Texte libre — ex. « tous les premiers dimanches du mois »">
                <Input value={event.recurrenceText} onChange={(recurrenceText) => patch({ recurrenceText })} />
              </Field>
            )}
          </div>

          <div className="chip-group__label">Occurrences détaillées</div>
          <Repeater
            items={event.occurrences}
            getKey={(occurrence, index) => `${occurrence.recordId ?? 'occ'}-${index}`}
            columns={OCCURRENCE_COLS}
            addLabel="Ajouter une occurrence"
            onAdd={() =>
              patch({
                occurrences: [...event.occurrences, { recordId: null, startAt: '', endAt: '', state: 'scheduled' }],
              })
            }
            renderRow={(occurrence, index) => (
              <>
                <span className="rep-row__handle" aria-hidden />
                <Input
                  type="datetime-local"
                  aria-label="Début de l'occurrence"
                  value={toLocalInputValue(occurrence.startAt)}
                  onChange={(startAt) => updateOccurrence(index, { startAt })}
                />
                <Input
                  type="datetime-local"
                  aria-label="Fin de l'occurrence"
                  value={toLocalInputValue(occurrence.endAt)}
                  onChange={(endAt) => updateOccurrence(index, { endAt })}
                />
                <Select
                  value={occurrence.state || 'scheduled'}
                  options={STATE_OPTIONS}
                  onChange={(state) => updateOccurrence(index, { state })}
                />
                <button
                  type="button"
                  className="del"
                  onClick={() => patch({ occurrences: event.occurrences.filter((_, i) => i !== index) })}
                >
                  ×
                </button>
              </>
            )}
          />
        </>
      )}
    </Fs>
  );
}
```

Note: the saver filters out occurrences with neither `startAt` nor `endAt`, so an added-but-empty row is dropped at save, not an error. `start_at` is `NOT NULL` in DB — `'YYYY-MM-DDTHH:mm'` from datetime-local parses fine as timestamptz.

- [ ] **Step 6: BlockFMA spec**

`sections/blocks/BlockFMA.test.tsx`:

```tsx
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { useObjectEditorState } from '../../useObjectEditorState';
import { BlockFMA } from './BlockFMA';
import { allowAll, fullModulesFixture } from '../section-fixture.test-utils';

/** §48 — FMA events get a real dates/occurrences editor (object_fma + object_fma_occurrence)
 *  instead of inheriting the ITI trail editor. */
describe('BlockFMA — event dates & occurrences', () => {
  it('edits the start date and marks the event module dirty', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    const view = render(<BlockFMA editor={result.current} permissions={allowAll} />);

    act(() => {
      fireEvent.change(screen.getByLabelText('Date de début'), { target: { value: '2026-07-14' } });
    });
    view.rerender(<BlockFMA editor={result.current} permissions={allowAll} />);

    expect(result.current.draft.event.startDate).toBe('2026-07-14');
    expect(result.current.dirtySections.event).toBe(true);
  });

  it('adds an occurrence with the scheduled default state', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    const view = render(<BlockFMA editor={result.current} permissions={allowAll} />);

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /Ajouter une occurrence/i }));
    });
    view.rerender(<BlockFMA editor={result.current} permissions={allowAll} />);

    expect(result.current.draft.event.occurrences).toHaveLength(1);
    expect(result.current.draft.event.occurrences[0].state).toBe('scheduled');
    expect(result.current.dirtySections.event).toBe(true);
  });

  it('shows the recurrence rule input only when recurring is on', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    const view = render(<BlockFMA editor={result.current} permissions={allowAll} />);

    expect(screen.queryByText('Règle de récurrence')).not.toBeInTheDocument();
    act(() => {
      fireEvent.click(screen.getByLabelText('Événement récurrent'));
    });
    view.rerender(<BlockFMA editor={result.current} permissions={allowAll} />);
    expect(screen.getByText('Règle de récurrence')).toBeInTheDocument();
  });

  it('renders the §46 notice instead of controls when the module is gated', () => {
    const modules = fullModulesFixture();
    modules.event.unavailableReason = 'Module non applicable au type HOT (référentiel ref_facet_applicability).';
    const { result } = renderHook(() => useObjectEditorState('o1', modules));
    render(<BlockFMA editor={result.current} permissions={allowAll} />);

    expect(screen.getByText(/Module non applicable au type HOT/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Date de début')).not.toBeInTheDocument();
  });
});
```

(If `Toggle` associates its label differently than `getByLabelText`, mirror the idiom used in `BlockASC.test.tsx` — `screen.getByLabelText('Encadrement obligatoire')` works there, so the same applies.)

- [ ] **Step 7: FMA publication rule**

In `editor-validation.ts`, append to `VALIDATION_RULES` (after the ITI rule):

```ts
  ({ archetype, draft }) =>
    archetype === 'FMA' && !hasText(draft.event.startDate) && draft.event.occurrences.length === 0
      ? { section: '05', message: 'Un événement doit avoir une date de début ou au moins une occurrence.', tone: 'req' }
      : null,
```

New file `editor-validation.fma.test.ts` (separate file — `editor-validation.test.ts` carries the user's uncommitted WIP):

```ts
import { validateForPublication } from './editor-validation';
import { allowAll, fullModulesFixture } from './sections/section-fixture.test-utils';

// §48 — FMA archetype: an event needs a start date or at least one occurrence to publish.
describe('editor publication validation — FMA', () => {
  it('blocks publication when an FMA event has no date and no occurrence', () => {
    const draft = fullModulesFixture();
    draft.event.startDate = '';
    draft.event.occurrences = [];

    const result = validateForPublication(draft, allowAll, 'FMA');

    expect(result.blockers).toContainEqual({
      section: '05',
      message: expect.stringContaining('événement'),
      tone: 'req',
    });
  });

  it('passes when a start date exists', () => {
    const draft = fullModulesFixture();
    draft.event.startDate = '2026-07-14';

    const result = validateForPublication(draft, allowAll, 'FMA');

    expect(result.blockers.some((issue) => issue.section === '05')).toBe(false);
  });

  it('does not apply the ITI trace blocker to FMA', () => {
    const draft = fullModulesFixture();
    draft.itinerary.geometrySummary = '';
    draft.event.startDate = '2026-07-14';

    const result = validateForPublication(draft, allowAll, 'FMA');

    expect(result.blockers).toHaveLength(0);
  });
});
```

- [ ] **Step 8: Drawer polish — stop classifying FMA as a trail**

In `bertel-tourism-ui/src/features/object-drawer/ObjectDetailView.tsx` (~line 83) the `ITINERARY_TYPES` constant includes `'FMA'` — remove it so the view-only drawer stops rendering trail panels for events. Verify with `npx tsc --noEmit` + the drawer test suite if one references it (`npx jest src/features/object-drawer`).

- [ ] **Step 9: Run the full editor suite + typecheck**

Run: `npx jest src/features/object-editor src/features/object-drawer && npx tsc --noEmit`
Expected: PASS everywhere except the 2 known-red §02 commune tests in `editor-validation.test.ts` (user WIP — leave them).

- [ ] **Step 10: Commit**

```bash
git add src/features/object-editor/archetypes.ts src/features/object-editor/archetypes.test.ts src/features/object-editor/section-config.ts src/features/object-editor/sections/blocks/index.ts src/features/object-editor/sections/blocks/BlockFMA.tsx src/features/object-editor/sections/blocks/BlockFMA.test.tsx src/features/object-editor/primitives/Input.tsx src/features/object-editor/editor-validation.ts src/features/object-editor/editor-validation.fma.test.ts src/features/object-drawer/ObjectDetailView.tsx
git commit -m "feat(editor): §48 FMA archetype + BlockFMA — events get dates/occurrences instead of the trail editor"
```

---

## Task 5: FE — fix the relationships permission gate + author `object_org_link` (§17)

Two bugs fixed together because they share the gate:
1. **Latent §15 regression:** `permissions.relationships.canDirectWrite` is hard-`false` (object-workspace.ts:3226-3231), so `planSaveBatch` routes every §15 relation edit to `blocked` — the §29 saver is wired but unreachable from the save bar. Flip the gate to `canWriteSafeWorkspaceRpc` (the same gate as the other `save_object_*` RPC modules — `api.save_object_relations` enforces `workspace_assert_can_write_object` server-side).
2. **§17 org links:** the RPC's `org_links` branch (object_workspace_safe_write_rpcs.sql:1019-1053) is fully implemented but no UI calls it. Author it from §17.

**Anti-clobber invariant (§28/§40 pattern):** the RPC branch is delete-all + re-insert. The saver must only include the `org_links` key when the org links were loaded reliably (no `organizationLinkWriteUnavailableReason`), otherwise a save would wipe rows the UI never saw.

**Files:**
- Modify: `bertel-tourism-ui/src/services/object-workspace-parser.ts` (module type + parser defaults)
- Modify: `bertel-tourism-ui/src/services/object-workspace.ts` (loader, permission map, payload builder, saver)
- Modify: `bertel-tourism-ui/src/features/object-editor/sections/SectionAttachments.tsx`
- Test: `bertel-tourism-ui/src/services/object-workspace.relations.test.ts` (extend)
- Test: `bertel-tourism-ui/src/features/object-editor/sections/SectionAttachments.test.tsx` (create if missing)
- Fixtures to update for the type change: `sections/section-fixture.test-utils.ts`, `src/components/editor/ObjectDrawer.test.tsx` (relationships fixture), plus any other compile error `tsc` reveals.

- [ ] **Step 1: Extend the module types**

In `object-workspace-parser.ts`:

```ts
export interface ObjectWorkspaceOrganizationLinkItem {
  id: string;
  source: 'organization' | 'org_link';
  type: string;
  name: string;
  status: string;
  roleId: string;
  roleCode: string;
  roleLabel: string;
  isPrimary: boolean;
  note: string;
  contacts: ObjectWorkspaceLinkedContactItem[];
}
```

```ts
export interface ObjectWorkspaceOrgOption {
  id: string;
  name: string;
}

export interface ObjectWorkspaceRelationshipsModule {
  organizationLinks: ObjectWorkspaceOrganizationLinkItem[];
  actors: ObjectWorkspaceActorLinkItem[];
  relatedObjects: ObjectWorkspaceRelatedObjectItem[];
  orgRoleOptions: WorkspaceReferenceOption[];
  orgOptions: ObjectWorkspaceOrgOption[];
  actorRoleOptions: WorkspaceReferenceOption[];
  organizationLinkWriteUnavailableReason: string | null;
  actorWriteUnavailableReason: string | null;
  actorConsentUnavailableReason: string | null;
  relatedObjectWriteUnavailableReason: string | null;
}
```

In `parseWorkspaceOrganizationLink`, add `isPrimary: readBoolean(record.is_primary),` to the returned object. In `parseWorkspaceRelationshipsModule`'s return, add `orgRoleOptions: [], orgOptions: [], actorRoleOptions: [],` (the loader fills them).

Run `npx tsc --noEmit` and fix every fixture the compiler flags (at minimum `section-fixture.test-utils.ts` relationships block — add `isPrimary: true` to the org link, `orgRoleOptions: [{ id: 'publisher', code: 'publisher', label: 'Publisher principal' }, { id: 'contributor', code: 'contributor', label: 'ORG contributrice' }], orgOptions: [{ id: 'ORG0000000000001', name: 'OTI du Sud' }], actorRoleOptions: [{ id: 'operator', code: 'operator', label: 'Exploitant' }],` — and the `ObjectDrawer.test.tsx` relationships fixture).

- [ ] **Step 2: Rewrite the relationships loader (direct PostgREST, §41 pattern)**

Replace `getObjectWorkspaceRelationshipsModule` (object-workspace.ts:1585-1608). The parser's org-link rows come from `get_object_resource` JSON which does NOT carry `is_primary` — a delete+reinsert save would silently clear primary flags. So load org links directly (RLS: `read_object_org_link` = published OR extended — editors qualify):

```ts
async function getObjectWorkspaceRelationshipsModule(
  objectId: string,
  baseModule: ObjectWorkspaceRelationshipsModule,
): Promise<ObjectWorkspaceRelationshipsModule> {
  const session = useSessionStore.getState();

  if (session.demoMode) {
    return {
      ...baseModule,
      organizationLinkWriteUnavailableReason: 'Mode démo — écriture désactivée.',
      actorWriteUnavailableReason: 'Mode démo — écriture désactivée.',
      actorConsentUnavailableReason: "Les consentements d'acteurs ne sont pas exposés dans le workspace objet actuel.",
      relatedObjectWriteUnavailableReason: null,
    };
  }

  const client = getSupabaseClient();
  if (!client) {
    return {
      ...baseModule,
      organizationLinkWriteUnavailableReason: 'Connexion backend indisponible pour charger les rattachements.',
      actorWriteUnavailableReason: 'Connexion backend indisponible pour charger les acteurs.',
      actorConsentUnavailableReason: "Les consentements `actor_consent` restent hors du module.",
      relatedObjectWriteUnavailableReason: null,
    };
  }

  const [orgRolesResult, orgLinksResult, orgObjectsResult, actorRolesResult] = await Promise.all([
    client.from('ref_org_role').select('id, code, name').order('position', { ascending: true }),
    client
      .from('object_org_link')
      .select('org_object_id, role_id, is_primary, note, org:org_object_id(id, name, object_type, status), role:role_id(id, code, name)')
      .eq('object_id', objectId)
      .order('is_primary', { ascending: false }),
    client.from('object').select('id, name').eq('object_type', 'ORG').order('name', { ascending: true }),
    client.from('ref_actor_role').select('id, code, name').order('position', { ascending: true }),
  ]);

  // Anti-clobber: when org links can't be read reliably, keep the parser rows AND a reason —
  // the saver omits the org_links key on a set reason, so existing rows can never be wiped blind.
  const orgLinksReadable = orgLinksResult.error == null;
  const organizationLinks = orgLinksReadable
    ? ((orgLinksResult.data ?? []) as Record<string, unknown>[]).map((row, index) => {
        const org = readRecord(row.org);
        const role = readRecord(row.role);
        return {
          id: readString(org.id, readString(row.org_object_id)),
          source: 'org_link' as const,
          type: readString(org.object_type, 'ORG'),
          name: readString(org.name, `Organisation ${index + 1}`),
          status: readString(org.status),
          roleId: readString(row.role_id),
          roleCode: readString(role.code),
          roleLabel: readString(role.name, 'Rattachement'),
          isPrimary: readBoolean(row.is_primary),
          note: readString(row.note),
          contacts: [],
        };
      })
    : baseModule.organizationLinks;

  return {
    ...baseModule,
    organizationLinks,
    orgRoleOptions: orgRolesResult.error == null
      ? (orgRolesResult.data ?? []).map((row) => normalizeReferenceOption(row as Record<string, unknown>))
      : [],
    orgOptions: orgObjectsResult.error == null
      ? ((orgObjectsResult.data ?? []) as Record<string, unknown>[]).map((row) => ({
          id: readString(row.id),
          name: readString(row.name),
        }))
      : [],
    actorRoleOptions: actorRolesResult.error == null
      ? (actorRolesResult.data ?? []).map((row) => normalizeReferenceOption(row as Record<string, unknown>))
      : [],
    organizationLinkWriteUnavailableReason: orgLinksReadable
      ? null
      : "Les rattachements n'ont pas pu être chargés — édition désactivée pour éviter toute perte.",
    // Actor authoring arrives with Task 7; until then keep the read-only reason accurate:
    actorWriteUnavailableReason: "Les rôles acteur seront éditables après le déploiement du write-path acteurs (migration 8r).",
    actorConsentUnavailableReason: "Les consentements `actor_consent` restent hors du module (contrat dédié).",
    relatedObjectWriteUnavailableReason: null,
  };
}
```

- [ ] **Step 3: Fix the permission gate**

Replace the `relationships` entry of the module-access map (object-workspace.ts:3226-3231):

```ts
    relationships: {
      canDirectWrite: canWriteSafeWorkspaceRpc,
      canPrepareProposal: false,
      canSubmitProposal: false,
      disabledReason: canWriteSafeWorkspaceRpc
        ? null
        : "Vos droits actuels ne permettent pas de modifier les liens et rattachements de cette fiche.",
    },
```

- [ ] **Step 4: Payload builder + saver (RED first)**

Append to `object-workspace.relations.test.ts`:

```ts
import { buildOrgLinksPayload } from './object-workspace';

const orgLink = (over: Partial<ObjectWorkspaceRelationshipsModule['organizationLinks'][number]>) => ({
  id: 'ORG1', source: 'org_link' as const, type: 'ORG', name: 'OTI du Sud', status: 'published',
  roleId: 'r-pub', roleCode: 'publisher', roleLabel: 'Publisher principal', isPrimary: false, note: '', contacts: [], ...over,
});

describe('buildOrgLinksPayload', () => {
  it('maps org links to the save_object_relations org_links shape', () => {
    const payload = buildOrgLinksPayload(mod([]) && { ...mod([]), organizationLinks: [orgLink({ isPrimary: true, note: 'n' })] });
    expect(payload).toEqual([{ org_object_id: 'ORG1', role_code: 'publisher', is_primary: true, note: 'n' }]);
  });

  it('keeps only the first primary (the RPC raises on >1)', () => {
    const value = { ...mod([]), organizationLinks: [orgLink({ id: 'A', isPrimary: true }), orgLink({ id: 'B', isPrimary: true })] };
    const payload = buildOrgLinksPayload(value)!;
    expect(payload.map((row) => row.is_primary)).toEqual([true, false]);
  });

  it('dedupes identical (org, role) pairs and drops incomplete rows', () => {
    const value = { ...mod([]), organizationLinks: [orgLink({}), orgLink({}), orgLink({ id: '', roleCode: 'publisher' })] };
    expect(buildOrgLinksPayload(value)).toHaveLength(1);
  });

  it('returns null (omit the key — anti-clobber) when the load was unreliable', () => {
    const value = { ...mod([]), organizationLinkWriteUnavailableReason: 'load failed' };
    expect(buildOrgLinksPayload(value)).toBeNull();
  });
});
```

(Adjust the first spec to plain object construction if the `&&` shorthand reads poorly — the `mod` helper already exists in this file; extend it to accept overrides.) Run the file — Expected: FAIL (`buildOrgLinksPayload` not exported).

Then implement in `object-workspace.ts` next to `buildRelationsPayload`:

```ts
/**
 * Pure builder for the org_links arm of api.save_object_relations. Returns null when the
 * org links could not be loaded reliably — the caller must then OMIT the key entirely so the
 * RPC's delete-all + re-insert branch never runs blind (anti-clobber, §28/§40 pattern).
 * The RPC raises on >1 primary, so only the first primary survives here.
 */
export function buildOrgLinksPayload(
  input: ObjectWorkspaceRelationshipsModule,
): Array<{ org_object_id: string; role_code: string; is_primary: boolean; note: string }> | null {
  if (input.organizationLinkWriteUnavailableReason) {
    return null;
  }
  const seen = new Set<string>();
  let primarySeen = false;
  const rows: Array<{ org_object_id: string; role_code: string; is_primary: boolean; note: string }> = [];
  for (const item of input.organizationLinks) {
    if (!item.id || !item.roleCode) continue;
    const key = `${item.id}:${item.roleCode.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const isPrimary = item.isPrimary && !primarySeen;
    if (isPrimary) primarySeen = true;
    rows.push({ org_object_id: item.id, role_code: item.roleCode, is_primary: isPrimary, note: item.note });
  }
  return rows;
}
```

And extend `saveObjectWorkspaceRelationships`:

```ts
export async function saveObjectWorkspaceRelationships(
  objectId: string,
  input: ObjectWorkspaceRelationshipsModule,
): Promise<void> {
  const session = useSessionStore.getState();
  if (session.demoMode) {
    return;
  }
  const payload: Record<string, unknown> = { object_relations: buildRelationsPayload(input) };
  const orgLinks = buildOrgLinksPayload(input);
  if (orgLinks !== null) {
    payload.org_links = orgLinks;
  }
  await callObjectWorkspaceRpc(
    'save_object_relations',
    objectId,
    payload,
    "Impossible de sauvegarder les liens vers d'autres fiches.",
  );
}
```

- [ ] **Step 5: §17 UI — editable org-links repeater**

In `SectionAttachments.tsx`, replace the read-only `grid-2` kv block (lines 138-147) with an editable repeater. Add these helpers inside the component:

```tsx
  function replaceLinks(organizationLinks: typeof relationships.organizationLinks) {
    editor.replaceModule('relationships', { ...relationships, organizationLinks });
  }

  function updateLink(index: number, patch: Partial<(typeof relationships.organizationLinks)[number]>) {
    replaceLinks(relationships.organizationLinks.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function setPrimaryLink(index: number) {
    replaceLinks(relationships.organizationLinks.map((item, i) => ({ ...item, isPrimary: i === index })));
  }
```

And the JSX (org options come from the loader; the single live ORG today is the OTI):

```tsx
      <div className="chip-group__label">Organisations liées — publisher & partenaires</div>
      {relationships.organizationLinkWriteUnavailableReason ? (
        <p style={{ fontSize: 12, color: 'var(--ink-4)', margin: '0 0 12px' }}>
          <strong style={{ color: 'var(--ink-3)' }}>Lecture seule.</strong>{' '}
          {relationships.organizationLinkWriteUnavailableReason}
        </p>
      ) : (
        <Repeater
          items={relationships.organizationLinks}
          getKey={(item, index) => `${item.id}-${item.roleCode}-${index}`}
          columns="14px 1.6fr 160px 90px 1fr auto"
          addLabel="Rattacher une organisation"
          onAdd={() => {
            const org = relationships.orgOptions[0];
            const role =
              relationships.orgRoleOptions.find((option) => option.code === 'publisher')
              ?? relationships.orgRoleOptions[0];
            if (!org || !role) return;
            replaceLinks([
              ...relationships.organizationLinks,
              {
                id: org.id, source: 'org_link', type: 'ORG', name: org.name, status: '',
                roleId: role.id, roleCode: role.code, roleLabel: role.label,
                isPrimary: relationships.organizationLinks.length === 0, note: '', contacts: [],
              },
            ]);
          }}
          renderRow={(item, index) => (
            <>
              <span className="rep-row__handle" aria-hidden />
              <Select
                value={item.id}
                options={relationships.orgOptions.map((option) => ({ v: option.id, l: option.name }))}
                onChange={(orgId) => {
                  const org = relationships.orgOptions.find((option) => option.id === orgId);
                  updateLink(index, { id: orgId, name: org?.name ?? item.name });
                }}
              />
              <Select
                value={item.roleCode}
                options={relationships.orgRoleOptions.map((option) => ({ v: option.code, l: option.label }))}
                onChange={(roleCode) => {
                  const role = relationships.orgRoleOptions.find((option) => option.code === roleCode);
                  updateLink(index, { roleCode, roleId: role?.id ?? '', roleLabel: role?.label ?? roleCode });
                }}
              />
              <button
                type="button"
                className="pill-mini"
                aria-pressed={item.isPrimary}
                title={item.isPrimary ? 'Organisation principale' : 'Définir comme principale'}
                onClick={() => setPrimaryLink(index)}
              >
                {item.isPrimary ? 'Principale' : '—'}
              </button>
              <Input value={item.note} placeholder="Note" onChange={(note) => updateLink(index, { note })} />
              <button
                type="button"
                className="del"
                onClick={() => replaceLinks(relationships.organizationLinks.filter((_, i) => i !== index))}
              >
                Supprimer
              </button>
            </>
          )}
        />
      )}
```

Keep the "Acteurs liés" kv display for now (Task 7 replaces it). The publisher StatCard keeps working (`roleCode === 'publisher'` lookup unchanged).

- [ ] **Step 6: Section spec**

Create or extend `SectionAttachments.test.tsx` (conventions: `renderHook(() => useObjectEditorState('o1', fullModulesFixture()))`, `allowAll`):

```tsx
describe('SectionAttachments — §17 org-link authoring (§48)', () => {
  it('changes an org-link role and marks relationships dirty', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    const view = render(<SectionAttachments editor={result.current} permissions={allowAll} />);

    act(() => {
      fireEvent.change(screen.getByDisplayValue('Publisher principal'), { target: { value: 'contributor' } });
    });
    view.rerender(<SectionAttachments editor={result.current} permissions={allowAll} />);

    expect(result.current.draft.relationships.organizationLinks[0].roleCode).toBe('contributor');
    expect(result.current.dirtySections.relationships).toBe(true);
  });

  it('adds an org link defaulting to publisher', () => {
    const modules = fullModulesFixture();
    modules.relationships.organizationLinks = [];
    const { result } = renderHook(() => useObjectEditorState('o1', modules));
    const view = render(<SectionAttachments editor={result.current} permissions={allowAll} />);

    act(() => { fireEvent.click(screen.getByRole('button', { name: /Rattacher une organisation/i })); });
    view.rerender(<SectionAttachments editor={result.current} permissions={allowAll} />);

    expect(result.current.draft.relationships.organizationLinks).toHaveLength(1);
    expect(result.current.draft.relationships.organizationLinks[0].roleCode).toBe('publisher');
    expect(result.current.draft.relationships.organizationLinks[0].isPrimary).toBe(true);
  });

  it('renders read-only when the org links could not be loaded', () => {
    const modules = fullModulesFixture();
    modules.relationships.organizationLinkWriteUnavailableReason = 'load failed';
    const { result } = renderHook(() => useObjectEditorState('o1', modules));
    render(<SectionAttachments editor={result.current} permissions={allowAll} />);

    expect(screen.getByText(/Lecture seule/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Rattacher une organisation/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 7: Run + typecheck + live verify**

Run: `npx jest src/services/object-workspace.relations.test.ts src/features/object-editor/sections/SectionAttachments.test.tsx && npx tsc --noEmit`
Expected: PASS, tsc clean. Live verify (after deploy of the UI or via direct RPC): `mcp__supabase__execute_sql` →
`SELECT object_id, org_object_id, is_primary FROM object_org_link WHERE object_id = '<a draft ACT id>'` after a test save in the running app — is_primary round-trips.

- [ ] **Step 8: Commit**

```bash
git add src/services/object-workspace.ts src/services/object-workspace-parser.ts src/services/object-workspace.relations.test.ts src/features/object-editor/sections/SectionAttachments.tsx src/features/object-editor/sections/SectionAttachments.test.tsx src/features/object-editor/sections/section-fixture.test-utils.ts src/components/editor/ObjectDrawer.test.tsx
git commit -m "feat(editor): §48 unblock the relationships save gate + §17 org_link authoring (publisher/partner repeater)"
```

---

## Task 6: DB — actor-link write path (manifest 8r)

`actor_object_role` still carries the **legacy admin FOR ALL** write policy + a per-row `can_read_extended` read policy (rls_policies.sql:1307-1340 — untouched by §47, which only covered the 57 object-child tables). Building the editor write path means converging it to the §47 per-command canonical family first (CLAUDE.md: NEVER FOR ALL on object-child tables), then giving `api.save_object_relations` a real `actors` branch, plus a gated picker RPC.

**Scope note (decision log §48):** only the LINK rows (`actor_object_role`) become editable. `actor_channel` / `actor_consent` writes stay out (PII/consent — own pass later). Creating new `actor` rows also stays out — the picker searches existing actors (696 live).

**Files:**
- Create: `Base de donnée DLL et API/migration_actor_links_editor.sql`
- Modify: `Base de donnée DLL et API/object_workspace_safe_write_rpcs.sql` (fold the same `save_object_relations` body — fresh == live)
- Create: `Base de donnée DLL et API/tests/test_actor_links_editor.sql`
- Modify: `Base de donnée DLL et API/ci_fresh_apply.sql`, `.github/workflows/sql-fresh-apply.yml`, `docs/SQL_ROLLOUT_RUNBOOK.md`

- [ ] **Step 1: Write the migration**

```sql
-- migration_actor_links_editor.sql
-- §48 — Editor write path for actor_object_role (operator/guide links) + actor search RPC.
-- (a) Converges actor_object_role writes to the §47 per-command canonical family and retires the
--     legacy admin FOR ALL (canonical SUBSUMES admin/superuser via is_object_owner — see 8o's
--     predicate note). Rewrites the read policy in the §38/§39 form (set-based extended scope,
--     wrapped auth fns, actor-self arm preserved). NO published-read arm is added — the
--     "read under-exposure" item stays deferred.
-- (b) api.save_object_relations gains a real `actors` branch (delete-all + re-insert; role by id or
--     ref_actor_role.code; visibility mirror of the table CHECK; ≤1 primary per role enforced by
--     uq_actor_object_role_primary). actor_channel / actor_consent stay OUT of the contract.
-- (c) api.search_actors(p_query): SECURITY DEFINER picker, gated on api.current_user_can_edit_objects()
--     so read-only members cannot enumerate actor PII. Advisor will flag the DEFINER — expected (§36 precedent).
-- PREREQUISITES: rls_policies.sql (step 6), object_workspace_safe_write_rpcs.sql (step 7 — helpers),
--   migration_permission_write_paths.sql (8b — user_can_write_object_canonical), sp4 (current_user_can_edit_objects).
--   Manifest step 8r.
-- IDEMPOTENT: DROP POLICY IF EXISTS + CREATE POLICY; CREATE OR REPLACE FUNCTION.
-- REVERSIBLE: re-create the legacy policies from rls_policies.sql:1307-1340; re-apply step 7's
--   save_object_relations; DROP FUNCTION api.search_actors(text).
-- ⚠ RE-APPLY CAVEAT: rls_policies.sql still creates admin_actor_object_role_write (FOR ALL) and
--   step 7 still ships the actors-skip RPC body — after re-applying either to a live DB, re-run THIS file.
BEGIN;

-- == 1. actor_object_role: §47 per-command canonical write family ==
DROP POLICY IF EXISTS "admin_actor_object_role_write" ON actor_object_role;
DROP POLICY IF EXISTS "canonical_ins_actor_object_role" ON actor_object_role;
CREATE POLICY "canonical_ins_actor_object_role" ON actor_object_role FOR INSERT WITH CHECK (api.user_can_write_object_canonical(object_id));
DROP POLICY IF EXISTS "canonical_upd_actor_object_role" ON actor_object_role;
CREATE POLICY "canonical_upd_actor_object_role" ON actor_object_role FOR UPDATE USING (api.user_can_write_object_canonical(object_id)) WITH CHECK (api.user_can_write_object_canonical(object_id));
DROP POLICY IF EXISTS "canonical_del_actor_object_role" ON actor_object_role;
CREATE POLICY "canonical_del_actor_object_role" ON actor_object_role FOR DELETE USING (api.user_can_write_object_canonical(object_id));

-- == 2. read policy: same semantics (admin OR self OR extended), §39-wrapped + §38 set form ==
DROP POLICY IF EXISTS "ext_actor_object_role_read" ON actor_object_role;
CREATE POLICY "ext_actor_object_role_read" ON actor_object_role FOR SELECT USING (
  (select auth.role()) IN ('service_role', 'admin')
  OR actor_id = (select auth.uid())
  OR object_id IN (SELECT api.current_user_extended_object_ids())
);

-- == 3. save_object_relations: real `actors` branch (replaces the skip) ==
-- Full CREATE OR REPLACE — body identical to step 7's current function except the actors arm.
-- (Copy the function from object_workspace_safe_write_rpcs.sql:965-1066 AFTER applying the same
--  edit there in this task's Step 2; both files must carry the identical body.)

-- == 4. picker RPC ==
CREATE OR REPLACE FUNCTION api.search_actors(p_query text)
RETURNS TABLE(id uuid, display_name text, first_name text, last_name text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, api
AS $fn$
BEGIN
  -- Editors only: read-only ORG members must not enumerate actor PII through this DEFINER.
  IF NOT api.current_user_can_edit_objects() THEN
    RAISE EXCEPTION 'Actor search requires editor rights' USING ERRCODE = '42501';
  END IF;
  IF p_query IS NULL OR length(btrim(p_query)) < 2 THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT a.id, a.display_name, a.first_name, a.last_name
  FROM public.actor a
  WHERE a.display_name_normalized LIKE '%' || immutable_unaccent(lower(btrim(p_query))) || '%'
     OR a.last_name_normalized    LIKE '%' || immutable_unaccent(lower(btrim(p_query))) || '%'
     OR a.first_name_normalized   LIKE '%' || immutable_unaccent(lower(btrim(p_query))) || '%'
  ORDER BY a.display_name
  LIMIT 20;
END;
$fn$;
REVOKE ALL ON FUNCTION api.search_actors(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.search_actors(text) TO authenticated, service_role;

COMMIT;
```

- [ ] **Step 2: Edit `save_object_relations` in `object_workspace_safe_write_rpcs.sql`**

In the function (lines 965-1066), replace the actors skip block:

```sql
  IF p_payload ? 'actors' THEN
    v_skipped := array_append(v_skipped, 'actors');
    v_warnings := array_append(v_warnings, 'Actor/contact consent writes require a separate audit contract.');
  END IF;
```

with the real branch (note: `v_deleted`/`v_inserted`/`v_id`/`v_row` are already declared):

```sql
  -- §48: actor links (actor_object_role only — actor_channel/actor_consent stay out of contract).
  IF p_payload ? 'actors' THEN
    DELETE FROM public.actor_object_role WHERE object_id = p_object_id;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    v_inserted := 0;
    FOR v_row IN SELECT value FROM jsonb_array_elements(internal.workspace_jsonb_array(p_payload->'actors')) AS t(value) LOOP
      IF internal.workspace_uuid(v_row->>'actor_id') IS NULL
         OR NOT EXISTS (SELECT 1 FROM public.actor WHERE id = internal.workspace_uuid(v_row->>'actor_id')) THEN
        RAISE EXCEPTION 'Unknown actor_id: %', v_row->>'actor_id' USING ERRCODE = '23503';
      END IF;
      v_id := internal.workspace_uuid(v_row->>'role_id');
      IF v_id IS NULL THEN
        SELECT ref.id INTO v_id FROM public.ref_actor_role ref WHERE lower(ref.code) = lower(v_row->>'role_code');
      END IF;
      IF v_id IS NULL THEN
        RAISE EXCEPTION 'Unknown actor role reference: %', v_row USING ERRCODE = '23503';
      END IF;
      IF COALESCE(NULLIF(v_row->>'visibility', ''), 'public') NOT IN ('public', 'private', 'partners') THEN
        RAISE EXCEPTION 'Invalid actor link visibility: %', v_row->>'visibility' USING ERRCODE = '22023';
      END IF;
      -- ≤1 primary per (object, role) is enforced by uq_actor_object_role_primary (unique partial index).
      INSERT INTO public.actor_object_role (actor_id, object_id, role_id, is_primary, valid_from, valid_to, visibility, note)
      VALUES (
        internal.workspace_uuid(v_row->>'actor_id'),
        p_object_id,
        v_id,
        COALESCE(NULLIF(v_row->>'is_primary', '')::boolean, false),
        NULLIF(v_row->>'valid_from', '')::date,
        NULLIF(v_row->>'valid_to', '')::date,
        COALESCE(NULLIF(v_row->>'visibility', ''), 'public'),
        NULLIF(v_row->>'note', '')
      );
      v_inserted := v_inserted + 1;
    END LOOP;
    v_counts := v_counts || jsonb_build_object('actor_object_role_deleted', v_deleted, 'actor_object_role_inserted', v_inserted);
  END IF;
```

Then copy the COMPLETE updated function body into the migration's `== 3 ==` placeholder so both files are byte-identical for that function.

- [ ] **Step 3: CI test**

`tests/test_actor_links_editor.sql` — before writing, open `tests/test_object_fma_rls.sql` and reuse its persona/claims fixture pattern verbatim for the RPC behavior block. Structural skeleton:

```sql
-- test_actor_links_editor.sql
-- Proves migration_actor_links_editor.sql (§48 / manifest 8r): per-command canonical write triple
-- on actor_object_role (legacy admin FOR ALL retired), §39-wrapped read policy, the
-- save_object_relations `actors` branch, and the gated api.search_actors picker.
\set ON_ERROR_STOP on
BEGIN;
DO $$
BEGIN
  ASSERT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='actor_object_role' AND policyname='canonical_ins_actor_object_role' AND cmd='INSERT'), 'canonical_ins missing';
  ASSERT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='actor_object_role' AND policyname='canonical_upd_actor_object_role' AND cmd='UPDATE'), 'canonical_upd missing';
  ASSERT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='actor_object_role' AND policyname='canonical_del_actor_object_role' AND cmd='DELETE'), 'canonical_del missing';
  ASSERT NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='actor_object_role' AND cmd='ALL'), 'FOR ALL must be retired on actor_object_role (P0.3 gotcha class)';
  ASSERT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='api' AND p.proname='search_actors'), 'api.search_actors missing';
  ASSERT NOT has_function_privilege('anon', 'api.search_actors(text)', 'EXECUTE'), 'anon must not execute search_actors';
END$$;

-- Behavior: actors branch round-trip (persona fixture per test_object_fma_rls.sql; service-role claims)
DO $$
DECLARE v_result jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO object (id, object_type, name, status) VALUES ('ACTRUN9999999801', 'ACT', 'actor link test', 'draft');
  INSERT INTO actor (id, display_name) VALUES ('aaaaaaaa-9999-4999-8999-aaaaaaaaaaaa', 'Test Operator');
  v_result := api.save_object_relations('ACTRUN9999999801', jsonb_build_object('actors', jsonb_build_array(
    jsonb_build_object('actor_id', 'aaaaaaaa-9999-4999-8999-aaaaaaaaaaaa', 'role_code', 'operator', 'is_primary', true, 'visibility', 'public', 'note', 't')
  )));
  ASSERT (SELECT count(*) FROM actor_object_role WHERE object_id = 'ACTRUN9999999801') = 1, 'actors branch did not insert';
  ASSERT (SELECT is_primary FROM actor_object_role WHERE object_id = 'ACTRUN9999999801'), 'is_primary lost';
  v_result := api.save_object_relations('ACTRUN9999999801', jsonb_build_object('actors', '[]'::jsonb));
  ASSERT (SELECT count(*) FROM actor_object_role WHERE object_id = 'ACTRUN9999999801') = 0, 'actors branch did not clear';
  RAISE NOTICE 'actor links editor assertions passed.';
END$$;
ROLLBACK;
```

- [ ] **Step 4: Wire the gate**

`ci_fresh_apply.sql` — after the 8q `\ir`:

```
\echo '== 8r     migration_actor_links_editor.sql  (actor_object_role per-command + actors branch + search_actors; after 8b/8q) =='
\ir migration_actor_links_editor.sql
```

`.github/workflows/sql-fresh-apply.yml` — append after the write-policy test step:

```yaml
      - name: actor links editor test (§48 8r — per-command actor_object_role + actors branch + search_actors)
        env:
          DB_URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
        run: psql "$DB_URL" -v ON_ERROR_STOP=1 -f "Base de donnée DLL et API/tests/test_actor_links_editor.sql"
```

`docs/SQL_ROLLOUT_RUNBOOK.md` — add the 8r entry (mirror the migration header: per-command convergence + actors branch + search_actors + re-apply caveat) and EXTEND the existing §47 incremental caveat line to also name `migration_actor_links_editor.sql` after re-applies of `rls_policies.sql` / `object_workspace_safe_write_rpcs.sql`.

- [ ] **Step 5: Apply to live + verify**

`mcp__supabase__apply_migration` (name: `actor_links_editor`). Then verify with `mcp__supabase__execute_sql`:

```sql
SELECT polname, polcmd FROM pg_policy WHERE polrelid = 'public.actor_object_role'::regclass ORDER BY polname;
```
Expected: `canonical_del/ins/upd_actor_object_role` (d/a/w) + `ext_actor_object_role_read` (r) — NO `*` row.
`SELECT count(*) FROM actor_object_role;` — still 799 (no data loss). Run `mcp__supabase__get_advisors`: the only NEW finding should be the expected `security_definer` flag on `api.search_actors` (document as accepted, §36 precedent).

- [ ] **Step 6: Commit**

```bash
git add "Base de donnée DLL et API/migration_actor_links_editor.sql" "Base de donnée DLL et API/object_workspace_safe_write_rpcs.sql" "Base de donnée DLL et API/tests/test_actor_links_editor.sql" "Base de donnée DLL et API/ci_fresh_apply.sql" .github/workflows/sql-fresh-apply.yml docs/SQL_ROLLOUT_RUNBOOK.md
git commit -m "feat(db): §48 actor_object_role per-command write family + save_object_relations actors branch + gated search_actors (manifest 8r)"
```

---

## Task 7: FE — §17 actor-role authoring

**Files:**
- Modify: `bertel-tourism-ui/src/services/object-workspace.ts` (clear actor reason, `searchActors`, `buildActorLinksPayload`, saver)
- Create: `bertel-tourism-ui/src/features/object-editor/widgets/ActorPicker.tsx`
- Modify: `bertel-tourism-ui/src/features/object-editor/sections/SectionAttachments.tsx`
- Test: extend `object-workspace.relations.test.ts` + `SectionAttachments.test.tsx`

- [ ] **Step 1: Builder spec (RED)**

Append to `object-workspace.relations.test.ts`:

```ts
import { buildActorLinksPayload } from './object-workspace';

const actorLink = (over: Partial<ObjectWorkspaceRelationshipsModule['actors'][number]>) => ({
  id: 'a1', displayName: 'Marie Guide', firstName: 'Marie', lastName: 'Guide', gender: '',
  roleId: 'r-op', roleCode: 'operator', roleLabel: 'Exploitant', visibility: 'public',
  isPrimary: false, validFrom: '', validTo: '', note: '', contacts: [], ...over,
});

describe('buildActorLinksPayload', () => {
  it('maps actor links to the save_object_relations actors shape', () => {
    const value = { ...mod([]), actorWriteUnavailableReason: null, actors: [actorLink({ isPrimary: true, note: 'n' })] };
    expect(buildActorLinksPayload(value)).toEqual([
      { actor_id: 'a1', role_code: 'operator', is_primary: true, visibility: 'public', valid_from: '', valid_to: '', note: 'n' },
    ]);
  });

  it('keeps only the first primary PER ROLE (uq_actor_object_role_primary)', () => {
    const value = {
      ...mod([]), actorWriteUnavailableReason: null,
      actors: [
        actorLink({ id: 'a1', roleCode: 'operator', isPrimary: true }),
        actorLink({ id: 'a2', roleCode: 'operator', isPrimary: true }),
        actorLink({ id: 'a3', roleCode: 'guide', isPrimary: true }),
      ],
    };
    expect(buildActorLinksPayload(value)!.map((row) => row.is_primary)).toEqual([true, false, true]);
  });

  it('returns null (omit the key) when actor links were not loaded reliably', () => {
    const value = { ...mod([]), actorWriteUnavailableReason: 'pending 8r' };
    expect(buildActorLinksPayload(value)).toBeNull();
  });
});
```

Run the file — Expected: FAIL (not exported).

- [ ] **Step 2: Implement service-side pieces**

In `object-workspace.ts`:

```ts
/** §48 — actors arm of api.save_object_relations. Null = omit the key (anti-clobber). */
export function buildActorLinksPayload(
  input: ObjectWorkspaceRelationshipsModule,
): Array<{ actor_id: string; role_code: string; is_primary: boolean; visibility: string; valid_from: string; valid_to: string; note: string }> | null {
  if (input.actorWriteUnavailableReason) {
    return null;
  }
  const seen = new Set<string>();
  const primaryByRole = new Set<string>();
  const rows: Array<{ actor_id: string; role_code: string; is_primary: boolean; visibility: string; valid_from: string; valid_to: string; note: string }> = [];
  for (const item of input.actors) {
    if (!item.id || !item.roleCode) continue;
    const key = `${item.id}:${item.roleCode.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const roleKey = item.roleCode.toLowerCase();
    const isPrimary = item.isPrimary && !primaryByRole.has(roleKey);
    if (isPrimary) primaryByRole.add(roleKey);
    rows.push({
      actor_id: item.id,
      role_code: item.roleCode,
      is_primary: isPrimary,
      visibility: item.visibility || 'public',
      valid_from: item.validFrom,
      valid_to: item.validTo,
      note: item.note,
    });
  }
  return rows;
}

export interface ActorSearchResult {
  id: string;
  displayName: string;
  firstName: string;
  lastName: string;
}

/** §48 — actor picker search via api.search_actors (DEFINER, editor-gated server-side). */
export async function searchActors(query: string): Promise<ActorSearchResult[]> {
  const client = getSupabaseClient();
  if (!client || query.trim().length < 2) {
    return [];
  }
  const { data, error } = await client.schema('api').rpc('search_actors', { p_query: query.trim() });
  if (error) {
    return [];
  }
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: readString(row.id),
    displayName: readString(row.display_name),
    firstName: readString(row.first_name),
    lastName: readString(row.last_name),
  }));
}
```

In `saveObjectWorkspaceRelationships`, after the org-links arm:

```ts
  const actors = buildActorLinksPayload(input);
  if (actors !== null) {
    payload.actors = actors;
  }
```

In the loader (Task 5's version), change the actor reason: load is reliable from the parser (the `get_object_resource` actors JSON carries role/visibility/is_primary/valid_from/valid_to/note — complete), so set `actorWriteUnavailableReason: null,` and delete the "migration 8r" placeholder string. Keep `actorConsentUnavailableReason` as is.

- [ ] **Step 3: ActorPicker widget**

Before writing, read `bertel-tourism-ui/src/features/object-editor/widgets/RelationPicker.tsx` and mirror its container/classNames so §15 and §17 pickers look identical. Functional reference implementation:

```tsx
import { useEffect, useState } from 'react';
import { searchActors, type ActorSearchResult } from '../../../services/object-workspace';

/** §48 — actor search picker for §17 (mirrors RelationPicker; api.search_actors is editor-gated). */
export function ActorPicker({ onPick }: { onPick: (actor: ActorSearchResult) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ActorSearchResult[]>([]);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const handle = setTimeout(() => {
      void searchActors(query).then(setResults);
    }, 300);
    return () => clearTimeout(handle);
  }, [query]);

  return (
    <div className="repeater" style={{ marginTop: 8 }}>
      <div className="rep-row" style={{ gridTemplateColumns: '1fr' }}>
        <input
          autoFocus
          placeholder="Rechercher un acteur (nom, prénom)…"
          aria-label="Rechercher un acteur"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      {results.map((actor) => (
        <div key={actor.id} className="rep-row" style={{ gridTemplateColumns: '1fr auto' }}>
          <span>{actor.displayName}</span>
          <button type="button" className="rep-add" style={{ marginTop: 0 }} onClick={() => onPick(actor)}>
            Lier
          </button>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: §17 actors repeater**

In `SectionAttachments.tsx`, replace the read-only "Acteurs liés" kv with (helpers mirror the org-link ones; `setPrimaryActor` clears primaries of the SAME roleCode only):

```tsx
      <div className="chip-group__label" style={{ marginTop: 14 }}>Acteurs liés — opérateurs & encadrants</div>
      {relationships.actorWriteUnavailableReason ? (
        <p style={{ fontSize: 12, color: 'var(--ink-4)', margin: '0 0 12px' }}>
          <strong style={{ color: 'var(--ink-3)' }}>Lecture seule.</strong> {relationships.actorWriteUnavailableReason}
        </p>
      ) : (
        <>
          <Repeater
            items={relationships.actors}
            getKey={(item, index) => `${item.id}-${item.roleCode}-${index}`}
            columns="14px 1.4fr 150px 110px 90px 1fr auto"
            addLabel="Lier un acteur…"
            onAdd={() => setActorPickerOpen(true)}
            renderRow={(item, index) => (
              <>
                <span className="rep-row__handle" aria-hidden />
                <Input value={item.displayName} readOnly onChange={() => undefined} />
                <Select
                  value={item.roleCode}
                  options={relationships.actorRoleOptions.map((option) => ({ v: option.code, l: option.label }))}
                  onChange={(roleCode) => {
                    const role = relationships.actorRoleOptions.find((option) => option.code === roleCode);
                    updateActor(index, { roleCode, roleId: role?.id ?? '', roleLabel: role?.label ?? roleCode });
                  }}
                />
                <Select
                  value={item.visibility || 'public'}
                  options={[{ v: 'public', l: 'Public' }, { v: 'private', l: 'Interne' }, { v: 'partners', l: 'Partenaires' }]}
                  onChange={(visibility) => updateActor(index, { visibility })}
                />
                <button
                  type="button"
                  className="pill-mini"
                  aria-pressed={item.isPrimary}
                  title={item.isPrimary ? 'Acteur principal pour ce rôle' : 'Définir comme principal'}
                  onClick={() => setPrimaryActor(index)}
                >
                  {item.isPrimary ? 'Principal' : '—'}
                </button>
                <Input value={item.note} placeholder="Note" onChange={(note) => updateActor(index, { note })} />
                <button type="button" className="del" onClick={() => replaceActors(relationships.actors.filter((_, i) => i !== index))}>
                  Supprimer
                </button>
              </>
            )}
          />
          {actorPickerOpen && (
            <ActorPicker
              onPick={(actor) => {
                const role = relationships.actorRoleOptions.find((option) => option.code === 'operator') ?? relationships.actorRoleOptions[0];
                replaceActors([
                  ...relationships.actors,
                  {
                    id: actor.id, displayName: actor.displayName, firstName: actor.firstName, lastName: actor.lastName,
                    gender: '', roleId: role?.id ?? '', roleCode: role?.code ?? 'operator', roleLabel: role?.label ?? 'Exploitant',
                    visibility: 'public', isPrimary: !relationships.actors.some((a) => a.roleCode === (role?.code ?? 'operator') && a.isPrimary),
                    validFrom: '', validTo: '', note: '', contacts: [],
                  },
                ]);
                setActorPickerOpen(false);
              }}
            />
          )}
        </>
      )}
```

with component-top helpers:

```tsx
  const [actorPickerOpen, setActorPickerOpen] = useState(false);

  function replaceActors(actors: typeof relationships.actors) {
    editor.replaceModule('relationships', { ...relationships, actors });
  }
  function updateActor(index: number, patch: Partial<(typeof relationships.actors)[number]>) {
    replaceActors(relationships.actors.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }
  function setPrimaryActor(index: number) {
    const role = relationships.actors[index]?.roleCode;
    replaceActors(relationships.actors.map((item, i) => (
      item.roleCode === role ? { ...item, isPrimary: i === index } : item
    )));
  }
```

(`useState` import + `ActorPicker` import at the top.)

- [ ] **Step 5: Section specs**

Extend `SectionAttachments.test.tsx`:

```tsx
describe('SectionAttachments — §17 actor authoring (§48)', () => {
  it('changes an actor role and marks relationships dirty', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    const view = render(<SectionAttachments editor={result.current} permissions={allowAll} />);

    act(() => { fireEvent.change(screen.getByDisplayValue('Exploitant'), { target: { value: 'operator' } }); });
    view.rerender(<SectionAttachments editor={result.current} permissions={allowAll} />);
    expect(result.current.dirtySections.relationships).toBe(true);
  });

  it('removes an actor link', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    const view = render(<SectionAttachments editor={result.current} permissions={allowAll} />);

    act(() => { fireEvent.click(screen.getAllByRole('button', { name: 'Supprimer' })[1]); });
    view.rerender(<SectionAttachments editor={result.current} permissions={allowAll} />);
    expect(result.current.draft.relationships.actors).toHaveLength(0);
  });
});
```

(Index `[1]` because the org-link repeater renders its own Supprimer first — adjust to a scoped query if flaky. The fixture must carry `roleLabel: 'Exploitant'` on the actor and `actorRoleOptions` with `operator` — set in Task 5 Step 1.)

- [ ] **Step 6: Run + typecheck + live round-trip**

Run: `npx jest src/services/object-workspace.relations.test.ts src/features/object-editor/sections/SectionAttachments.test.tsx && npx tsc --noEmit`
Expected: PASS, tsc clean. Live: in the running app, open a draft ACT object → §17 → change an operator note → save → `mcp__supabase__execute_sql`: `SELECT actor_id, role_id, is_primary, note FROM actor_object_role WHERE object_id = '<id>';` shows the edit; count unchanged for untouched objects.

- [ ] **Step 7: Commit**

```bash
git add src/services/object-workspace.ts src/services/object-workspace.relations.test.ts src/features/object-editor/widgets/ActorPicker.tsx src/features/object-editor/sections/SectionAttachments.tsx src/features/object-editor/sections/SectionAttachments.test.tsx
git commit -m "feat(editor): §48 §17 actor-role authoring (picker + repeater + actors RPC arm) — completes the standard ACT attachment pattern"
```

---

## Task 8: FE — §13 discounts UI

`save_object_commercial` already writes `object_discount` (delete + re-insert, RPC lines 555-580; per-command RLS live since 8o) and `saveObjectWorkspacePricing` already sends `discounts: input.discounts.map(…)` — loaded rows round-trip safely. Only the controls are missing. **DB constraints to honor:** `chk_discount_xor` (percent XOR amount — exactly one), `chk_discount_currency_amount` (amount ⇒ currency), `max_group_size >= min_group_size`.

**Files:**
- Create: `bertel-tourism-ui/src/features/object-editor/sections/discount-row.ts`
- Create: `bertel-tourism-ui/src/features/object-editor/sections/discount-row.test.ts`
- Modify: `bertel-tourism-ui/src/features/object-editor/sections/SectionPricing.tsx`

- [ ] **Step 1: Pure helpers spec (RED)**

`sections/discount-row.test.ts`:

```ts
import { addDiscountRow, removeDiscountRow, updateDiscountRow } from './discount-row';
import type { ObjectWorkspacePricingModule } from '../../../services/object-workspace-parser';

const base = (): ObjectWorkspacePricingModule => ({
  priceKindOptions: [], priceUnitOptions: [], prices: [],
  discounts: [{ recordId: 'd1', conditions: 'Groupes', discountPercent: '10', discountAmount: '', currency: '', minGroupSize: '8', maxGroupSize: '', validFrom: '', validTo: '', source: '' }],
  promotions: [], promotionsUnavailableReason: null, unavailableReason: null,
});

describe('discount-row helpers (§48 — object_discount XOR contract)', () => {
  it('adds an empty percent-mode row', () => {
    const next = addDiscountRow(base());
    expect(next.discounts).toHaveLength(2);
    expect(next.discounts[1].recordId).toBeNull();
  });

  it('typing a percent clears the amount and its currency (chk_discount_xor)', () => {
    const withAmount = updateDiscountRow(base(), 0, { discountAmount: '15', currency: 'EUR' });
    const next = updateDiscountRow(withAmount, 0, { discountPercent: '20' });
    expect(next.discounts[0]).toMatchObject({ discountPercent: '20', discountAmount: '', currency: '' });
  });

  it('typing an amount clears the percent and defaults currency to EUR (chk_discount_currency_amount)', () => {
    const next = updateDiscountRow(base(), 0, { discountAmount: '15' });
    expect(next.discounts[0]).toMatchObject({ discountPercent: '', discountAmount: '15', currency: 'EUR' });
  });

  it('removes a row', () => {
    expect(removeDiscountRow(base(), 0).discounts).toHaveLength(0);
  });
});
```

Run: `npx jest src/features/object-editor/sections/discount-row.test.ts` — Expected: FAIL (module missing).

- [ ] **Step 2: Implement `discount-row.ts`**

```ts
import type {
  ObjectWorkspaceDiscountItem,
  ObjectWorkspacePricingModule,
} from '../../../services/object-workspace-parser';

/**
 * §48 — pure helpers for the §13 discounts repeater (object_discount).
 * DB contract: discount_percent XOR discount_amount (chk_discount_xor) and
 * amount ⇒ currency (chk_discount_currency_amount) — enforced here at edit
 * time so the RPC never receives an invalid row.
 */
export function createDiscountRow(): ObjectWorkspaceDiscountItem {
  return {
    recordId: null,
    conditions: '',
    discountPercent: '',
    discountAmount: '',
    currency: '',
    minGroupSize: '',
    maxGroupSize: '',
    validFrom: '',
    validTo: '',
    source: '',
  };
}

export function addDiscountRow(pricing: ObjectWorkspacePricingModule): ObjectWorkspacePricingModule {
  return { ...pricing, discounts: [...pricing.discounts, createDiscountRow()] };
}

export function updateDiscountRow(
  pricing: ObjectWorkspacePricingModule,
  index: number,
  patch: Partial<ObjectWorkspaceDiscountItem>,
): ObjectWorkspacePricingModule {
  const discounts = pricing.discounts.map((discount, discountIndex) => {
    if (discountIndex !== index) {
      return discount;
    }
    const next = { ...discount, ...patch };
    if (patch.discountPercent !== undefined && patch.discountPercent !== '') {
      next.discountAmount = '';
      next.currency = '';
    }
    if (patch.discountAmount !== undefined && patch.discountAmount !== '') {
      next.discountPercent = '';
      if (!next.currency) {
        next.currency = 'EUR';
      }
    }
    return next;
  });
  return { ...pricing, discounts };
}

export function removeDiscountRow(pricing: ObjectWorkspacePricingModule, index: number): ObjectWorkspacePricingModule {
  return { ...pricing, discounts: pricing.discounts.filter((_, discountIndex) => discountIndex !== index) };
}
```

Run the spec — Expected: PASS.

- [ ] **Step 3: §13 repeater**

In `SectionPricing.tsx`, import the helpers and append after the "Politique & règles" block (before `</Fs>`):

```tsx
      <div className="chip-group__label" style={{ marginTop: 14 }}>
        Remises & réductions
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '14px 1.6fr 80px 80px 70px 70px 110px 110px auto',
          gap: 8, padding: '6px 12px', fontSize: 10, fontWeight: 700,
          color: 'var(--ink-4)', letterSpacing: '0.06em', textTransform: 'uppercase',
        }}
      >
        <span /><span>Conditions</span><span>%</span><span>Montant</span><span>Grp min</span><span>Grp max</span><span>Du</span><span>Au</span><span />
      </div>
      <Repeater
        items={pricing.discounts}
        getKey={(discount, index) => `${discount.recordId ?? 'discount'}-${index}`}
        columns="14px 1.6fr 80px 80px 70px 70px 110px 110px auto"
        addLabel="Ajouter une remise"
        onAdd={() => editor.replaceModule('pricing', addDiscountRow(pricing))}
        renderRow={(discount, index) => (
          <>
            <span className="rep-row__handle" aria-hidden />
            <Input
              value={discount.conditions}
              placeholder="Conditions (ex. groupes, scolaires…)"
              onChange={(conditions) => editor.replaceModule('pricing', updateDiscountRow(pricing, index, { conditions }))}
            />
            <Input
              value={discount.discountPercent}
              mono
              suffix="%"
              aria-label="Remise en pourcentage"
              onChange={(discountPercent) => editor.replaceModule('pricing', updateDiscountRow(pricing, index, { discountPercent }))}
            />
            <Input
              value={discount.discountAmount}
              mono
              suffix="€"
              aria-label="Remise en montant"
              onChange={(discountAmount) => editor.replaceModule('pricing', updateDiscountRow(pricing, index, { discountAmount }))}
            />
            <Input
              value={discount.minGroupSize}
              mono
              onChange={(minGroupSize) => editor.replaceModule('pricing', updateDiscountRow(pricing, index, { minGroupSize }))}
            />
            <Input
              value={discount.maxGroupSize}
              mono
              onChange={(maxGroupSize) => editor.replaceModule('pricing', updateDiscountRow(pricing, index, { maxGroupSize }))}
            />
            <Input
              type="date"
              value={discount.validFrom}
              onChange={(validFrom) => editor.replaceModule('pricing', updateDiscountRow(pricing, index, { validFrom }))}
            />
            <Input
              type="date"
              value={discount.validTo}
              onChange={(validTo) => editor.replaceModule('pricing', updateDiscountRow(pricing, index, { validTo }))}
            />
            <button type="button" className="del" onClick={() => editor.replaceModule('pricing', removeDiscountRow(pricing, index))}>
              Supprimer
            </button>
          </>
        )}
      />
```

Also update the section pill to include discounts: `pill={{ tone: 'ok', label: \`${pricing.prices.length} ligne(s) · ${pricing.discounts.length} remise(s)\` }}`.

- [ ] **Step 4: Run + typecheck**

Run: `npx jest src/features/object-editor/sections/discount-row.test.ts src/features/object-editor/sections/pricing-row.test.ts && npx tsc --noEmit`
Expected: PASS, tsc clean. (A SectionPricing render spec is optional — the pure helpers carry the contract; add one if SectionPricing has an existing spec file to extend.)

- [ ] **Step 5: Commit**

```bash
git add src/features/object-editor/sections/discount-row.ts src/features/object-editor/sections/discount-row.test.ts src/features/object-editor/sections/SectionPricing.tsx
git commit -m "feat(editor): §48 §13 discounts repeater (object_discount — XOR percent/amount honored at edit time)"
```

---

## Task 9: FE — §03 contact `is_public` / `is_primary` controls

`saveObjectWorkspaceContacts` already writes both flags on every save (object-workspace.ts:5154-5155) with per-kind primary dedupe — UI-only work.

**Files:**
- Modify: `bertel-tourism-ui/src/features/object-editor/sections/SectionContacts.tsx`
- Test: `bertel-tourism-ui/src/features/object-editor/sections/SectionContacts.test.tsx` (extend or create)

- [ ] **Step 1: Spec (RED)**

```tsx
describe('SectionContacts — §48 contact flags', () => {
  it('toggles is_public and marks contacts dirty', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    const view = render(<SectionContacts editor={result.current} permissions={allowAll} />);

    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Public' })); });
    view.rerender(<SectionContacts editor={result.current} permissions={allowAll} />);

    expect(result.current.draft.contacts.objectItems[0].isPublic).toBe(false);
    expect(screen.getByRole('button', { name: 'Interne' })).toBeInTheDocument();
    expect(result.current.dirtySections.contacts).toBe(true);
  });

  it('sets a row primary and clears other rows of the same kind', () => {
    const modules = fullModulesFixture();
    modules.contacts.objectItems = [
      { ...modules.contacts.objectItems[0], id: 'c1', isPrimary: true },
      { ...modules.contacts.objectItems[0], id: 'c2', value: '+262 111', isPrimary: false },
    ];
    const { result } = renderHook(() => useObjectEditorState('o1', modules));
    const view = render(<SectionContacts editor={result.current} permissions={allowAll} />);

    act(() => { fireEvent.click(screen.getAllByTitle('Définir comme canal principal')[0]); });
    view.rerender(<SectionContacts editor={result.current} permissions={allowAll} />);

    const items = result.current.draft.contacts.objectItems;
    expect(items.find((item) => item.id === 'c2')?.isPrimary).toBe(true);
    expect(items.find((item) => item.id === 'c1')?.isPrimary).toBe(false);
  });
});
```

Run — Expected: FAIL (pill is a `<span>`, no primary button).

- [ ] **Step 2: Implement**

In `SectionContacts.tsx` add a helper and replace the static pill (line ~114):

```tsx
  function setPrimary(id: string) {
    const target = contacts.objectItems.find((item) => item.id === id);
    if (!target) return;
    editor.replaceModule('contacts', {
      ...contacts,
      objectItems: contacts.objectItems.map((item) =>
        item.kindCode === target.kindCode ? { ...item, isPrimary: item.id === id } : item,
      ),
    });
  }
```

Row JSX — replace `<span className="pill-mini">{it.isPublic ? 'Public' : 'Interne'}</span>` with:

```tsx
              <button
                type="button"
                className="pill-mini"
                aria-pressed={it.isPublic}
                title={it.isPublic ? 'Visible publiquement — cliquer pour passer en interne' : 'Interne — cliquer pour rendre public'}
                onClick={() => updateItem(it.id, { isPublic: !it.isPublic })}
              >
                {it.isPublic ? 'Public' : 'Interne'}
              </button>
              <button
                type="button"
                className="pill-mini"
                aria-pressed={it.isPrimary}
                title={it.isPrimary ? 'Canal principal pour ce type' : 'Définir comme canal principal'}
                onClick={() => setPrimary(it.id)}
              >
                {it.isPrimary ? '★' : '☆'}
              </button>
```

and widen the Repeater `columns` from `"14px 130px 150px 1fr auto auto"` to `"14px 130px 150px 1fr auto auto auto"`.

- [ ] **Step 3: Run + typecheck + commit**

Run: `npx jest src/features/object-editor/sections/SectionContacts.test.tsx && npx tsc --noEmit` — PASS.

```bash
git add src/features/object-editor/sections/SectionContacts.tsx src/features/object-editor/sections/SectionContacts.test.tsx
git commit -m "feat(editor): §48 §03 is_public / is_primary contact controls (saver already round-trips both)"
```

---

## Task 10: FE — §05-ITI honesty: GPX dropzone disabled-with-reason + remove the TRAIL_SEASON mock

Decision: no GPX pipeline now. The dropzone is a bare `<div>` (no handler anywhere in src) and `object_iti.geom` has NO write path (the nested RPC's DML never touches `object_iti`; top-level `geom` goes to the skip/warn list) — so the control must be visibly disabled with the reason. Also: BlockITI still renders the hardcoded `TRAIL_SEASON` mock `SeasonPicker` (inert — no `onChange`), the same pattern §34 removed from ASC/VIS/SRV. *(Supersedes the pending background-task chip "Remove inert TRAIL_SEASON SeasonPicker from BlockITI" — it was dismissed in favor of this task.)*

**Files:**
- Modify: `bertel-tourism-ui/src/features/object-editor/sections/blocks/BlockITI.tsx`
- Create: `bertel-tourism-ui/src/features/object-editor/sections/blocks/BlockITI.test.tsx`

- [ ] **Step 1: Spec (RED)** — `BlockITI.test.tsx`:

```tsx
import { render, renderHook, screen } from '@testing-library/react';
import { useObjectEditorState } from '../../useObjectEditorState';
import { BlockITI } from './BlockITI';
import { allowAll, fullModulesFixture } from '../section-fixture.test-utils';

/**
 * §48 honesty sweep on the ITI block: the GPX dropzone has no upload pipeline and
 * object_iti.geom has no write path (the nested RPC skips geom) — it must read as
 * disabled-with-reason, not as an inviting drop target. The TRAIL_SEASON SeasonPicker
 * was a hardcoded mock (§34 pattern) — removed; the SeasonPicker primitive itself is
 * retained for the future seasonality feature.
 */
describe('BlockITI — honest controls (§48)', () => {
  it('renders the GPX zone as disabled-with-reason, not as a drop invitation', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<BlockITI editor={result.current} permissions={allowAll} />);

    expect(screen.queryByText('Déposer un fichier GPX ou KML')).not.toBeInTheDocument();
    expect(screen.getByText(/import de données/i)).toBeInTheDocument();
  });

  it('renders no inert seasonal-availability picker', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<BlockITI editor={result.current} permissions={allowAll} />);

    expect(screen.queryByText('Praticabilité saisonnière')).not.toBeInTheDocument();
    expect(screen.queryByText('JAN')).not.toBeInTheDocument();
  });

  it('renders the §46 notice instead of controls when the itinerary module is gated', () => {
    const modules = fullModulesFixture();
    modules.itinerary.unavailableReason = 'Module non applicable au type RES (référentiel ref_facet_applicability).';
    const { result } = renderHook(() => useObjectEditorState('o1', modules));
    render(<BlockITI editor={result.current} permissions={allowAll} />);

    expect(screen.getByText(/Module non applicable au type RES/)).toBeInTheDocument();
    expect(screen.queryByText("Étapes & points d'intérêt sur le parcours")).not.toBeInTheDocument();
  });
});
```

Run — Expected: FAIL.

- [ ] **Step 2: Implement in `BlockITI.tsx`**

1. Replace the dropzone block (lines 59-65) with:

```tsx
        <div className="dropzone" aria-disabled="true" style={{ opacity: 0.62, cursor: 'not-allowed' }}>
          <span className="ico">GPX</span>
          <strong>{itinerary.geometrySummary || 'Aucune trace importée'}</strong>
          <small>
            Import GPX/KML indisponible dans l&apos;éditeur — la géométrie est gérée par l&apos;import de données.
            {' '}{itinerary.sectionsCount} section(s) · {itinerary.profilesCount} profil(s)
          </small>
        </div>
```

2. Delete the `TRAIL_SEASON` const (line 4), the `SeasonPicker` import, and the "Praticabilité saisonnière" label + `<SeasonPicker value={[...TRAIL_SEASON]} />` (lines ~149-151). KEEP the `statusNote` Field ("Note de fermeture saisonnière") — it persists.
3. Confirm the Task 3 gating wrap covers the whole body (this spec's third case).

- [ ] **Step 3: Run + typecheck + commit**

Run: `npx jest src/features/object-editor/sections/blocks/BlockITI.test.tsx && npx tsc --noEmit` — PASS.

```bash
git add src/features/object-editor/sections/blocks/BlockITI.tsx src/features/object-editor/sections/blocks/BlockITI.test.tsx
git commit -m "fix(editor): §48 §05-ITI honesty — GPX dropzone disabled-with-reason; drop the TRAIL_SEASON mock (completes §34 for ITI)"
```

---

## Task 11: FE — duplicated surfaces: one owner per concept

Four concepts are editable from two sections against the same draft module (last-edit-wins on shared state — not racing DB writers, but a real UX trap). Owners per the audit: **§14** hours, **§13** prices, **§07** group policy, **§12** languages. The §05 copies become a short read-only pointer.

**Files:**
- Modify: `bertel-tourism-ui/src/features/object-editor/sections/blocks/block-notes.tsx` (add `OwnedElsewhereNote`)
- Modify: `BlockRES.tsx`, `BlockVIS.tsx`, `BlockSRV.tsx` (ScheduleEditor → pointer; SRV languages → pointer)
- Modify: `BlockASC.tsx`, `BlockVIS.tsx` (pricing repeaters → pointer)
- Modify: `BlockHEB.tsx`, `BlockRES.tsx` (group policy → pointer; HEB keeps petPolicy — not duplicated)
- Tests: extend `BlockASC.test.tsx`, `BlockHEB.test.tsx`, `BlockRES.test.tsx`, `BlockSRV.test.tsx`, `BlockVIS.test.tsx`

- [ ] **Step 1: Add the pointer component** (append to `block-notes.tsx`):

```tsx
/** §48 single-owner rule: a concept is editable in exactly ONE section; the §05 copy points there. */
export function OwnedElsewhereNote({ num, label, summary }: { num: string; label: string; summary?: string }) {
  return (
    <p style={{ fontSize: 12, color: 'var(--ink-4)', margin: '4px 0 12px' }}>
      {summary ? <>{summary} · </> : null}Géré dans la section {num} — {label}.
    </p>
  );
}
```

- [ ] **Step 2: Specs (RED)** — add to each block spec a describe of this shape (adjust the queried control per block):

```tsx
describe('BlockSRV — single-owner surfaces (§48)', () => {
  it('no longer edits opening hours in §05 (owned by §14)', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<BlockSRV editor={result.current} permissions={allowAll} />);
    expect(screen.queryByText('Copier')).not.toBeInTheDocument(); // ScheduleEditor header gone
    expect(screen.getByText(/Géré dans la section 14/)).toBeInTheDocument();
  });

  it('no longer edits languages in §05 (owned by §12)', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<BlockSRV editor={result.current} permissions={allowAll} />);
    expect(screen.queryByText('Langues parlées au comptoir')).not.toBeInTheDocument();
    expect(screen.getByText(/Géré dans la section 12/)).toBeInTheDocument();
  });
});
```

Equivalents: BlockRES/BlockVIS → `Copier` absent + `Géré dans la section 14`; BlockASC → `+ Ajouter une formule` absent + `Géré dans la section 13`; BlockVIS → `Ajouter une ligne tarifaire` absent + `Géré dans la section 13`; BlockHEB/BlockRES → `Capacité groupe min`/`Groupes — min` absent + `Géré dans la section 07` (BlockHEB: assert `Animaux acceptés` STAYS). Update any older assertion these changes break (e.g. BlockSRV's existing langue-chips test → delete; its prestations-chips test stays).

- [ ] **Step 3: Implement, block by block**

- **BlockRES:** remove the group-policy `grid-3` (lines 53-91 area) → `<OwnedElsewhereNote num="07" label="Capacité & cadre" summary={capacity.groupPolicy.minSize || capacity.groupPolicy.maxSize ? \`Groupes ${capacity.groupPolicy.minSize || '—'}–${capacity.groupPolicy.maxSize || '—'} pers.\` : undefined} />`; remove the "Horaires de service" label + ScheduleEditor → `<OwnedElsewhereNote num="14" label="Périodes d'ouverture" summary={\`${openings.periods.length} période(s)\`} />`. Drop the now-unused `applyRowsToFirstPeriod`/`scheduleRowsFromPeriod`/`ScheduleEditor` imports; keep `capacity` only if still referenced by the summary (it is).
- **BlockVIS:** remove the "Tarifs" Repeater → `<OwnedElsewhereNote num="13" label="Tarifs & extras" summary={\`${pricing.prices.length} ligne(s) tarifaire(s)\`} />`; remove the "Horaires haute saison" label + ScheduleEditor → pointer to §14 (same as RES). Drop unused pricing-row + opening-schedule imports.
- **BlockSRV:** remove the "Langues parlées au comptoir" label + ChipSet → `<OwnedElsewhereNote num="12" label="Paiements & langues" summary={\`${langCount} langue(s)\`} />`; remove the "Horaires d'accueil" label + ScheduleEditor → pointer to §14. The prestations ChipSet stays (sole owner). Keep the pill's `langCount` math.
- **BlockASC:** remove the "Formules & sessions" label + `repHeader(FORMULA_COLS, …)` + price repeater + add button → `<OwnedElsewhereNote num="13" label="Tarifs & extras" summary={\`${pricing.prices.length} formule(s)\`} />`. Drop unused pricing-row imports + `FORMULA_COLS`; the pill keeps `formulaCount` (display only).
- **BlockHEB:** under "Politiques d'accueil", remove the THREE group fields + the "Groupes uniquement" Toggle → `<OwnedElsewhereNote num="07" label="Capacité & cadre" />`; KEEP the "Animaux acceptés" Toggle + conditions Textarea (petPolicy is edited only here).

- [ ] **Step 4: Run + typecheck**

Run: `npx jest src/features/object-editor/sections/blocks && npx tsc --noEmit`
Expected: all block specs PASS (including Task 3/10 ones), tsc clean — no unused-import errors.

- [ ] **Step 5: Commit**

```bash
git add src/features/object-editor/sections/blocks
git commit -m "refactor(editor): §48 single-owner surfaces — hours→§14, prices→§13, group policy→§07, languages→§12 (§05 keeps read-only pointers)"
```

---

## Task 12: Docs, decision log, trackers, memory

**Files:**
- Modify: `CLAUDE.md` (§46 paragraph + editor write-trap tracker)
- Modify: `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md` (new §48; note: this path is gitignored/local-only)
- Modify: `.claude/WORKFLOW.md` (deferred tracker)
- MCP memory refresh (after the decision log)

- [ ] **Step 1: CLAUDE.md — make §46's wording true and record §48**

In the "Type→facet applicability (single registry)" section, replace
`(the 6 type-specific modules go disabled-with-reason for non-applicable types; UI is fail-open, the DB trigger is the hard gate)`
with
`(the 6 type-specific modules render a ModuleUnavailableNotice and hide their controls when unavailableReason is set — §46 gate or load failure; their savers still throw as defense-in-depth; UI is fail-open, the DB trigger is the hard gate)`.

In the same section, update the archetype sentence to: `TYPE_ARCHETYPES must cover exactly the enum minus ORG — no silent archetype fallback (ORG renders an explicit unsupported-type panel). Since §48: ACT→ASC archetype (object_act applicability = ASC+ACT), FMA→its own FMA archetype (BlockFMA edits object_fma).`

In the "Editor — no silent write-traps" tracker paragraph, append: `**§48 (this pass)** — BlockITI GPX dropzone + TRAIL_SEASON mock honest-disabled/removed; §05 duplicate surfaces single-ownered (§14/§13/§07/§12); §15 relationships save gate unblocked (permission map, not READONLY_MODULES, was the blocker); §17 org_link + actor_object_role authoring; §13 discounts; §03 contact flags.`

- [ ] **Step 2: Decision log §48**

Append a `## §48 — Editor audit fixes (2026-06-10)` section to `lot1_mapping_decisions.md` recording: (a) the audit-verification verdicts summary (stale type-model P0s fixed by §46 same-day; FMA/object_act/org-actor/geom/discount gaps real; object_act orphaned both ways — NEW finding); (b) decisions: ACT→ASC archetype + `('object_act','ASC')` seed (8q); FMA archetype + BlockFMA; §46 gate now RENDERED (ModuleUnavailableNotice); relationships permission gate was hard-false (latent §15 block) → `canWriteSafeWorkspaceRpc`; org_links + actors authored via `save_object_relations` (actors branch added, 8r; actor_channel/actor_consent OUT of scope — dedicated pass); `api.search_actors` DEFINER gated on `current_user_can_edit_objects` (advisor flag accepted, §36 precedent); discounts UI (XOR enforced at edit time); GPX = disabled-with-reason (full pipeline = future feature, needs server-side parse → geom + cache regen); single-owner matrix §14/§13/§07/§12; (c) the anti-clobber payload rule: builders return `null` ⇒ omit the RPC key.

- [ ] **Step 3: WORKFLOW.md tracker**

- Mark the first row (`ref_actor_role [operator] seed missing`) as stale/DONE: the seed exists in `seeds_data.sql:1000-1010` since 2026-03-21 and live since the pilot (verified 2026-06-10).
- Add deferred rows: `GPX/KML upload → object_iti.geom pipeline` (reason: needs server-side parse + geom write path + cached_gpx regen; unblocked by its own spec); `actor_channel / actor_consent authoring` (reason: PII/consent contract — deliberately out of §48); `§05 read-only summaries → deep links` (cosmetic; needs section anchor API).

- [ ] **Step 4: MCP memory refresh** — per the CLAUDE.md memory workflow: update the editor-completion + db-audit entities with §48 outcomes; delete observations made stale by this pass (ACT→SRV mapping, FMA→ITI mapping, "actors have no write path", "relationships saves work since §29").

- [ ] **Step 5: Final verification gate**

```bash
npx jest src/features/object-editor src/services && npx tsc --noEmit
```
Expected: green EXCEPT the 2 pre-existing §02 commune tests (user WIP) — if the user has landed his §02 rule by now, fully green. Then `npx jest` (full suite) for the record; report exact counts.

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md .claude/WORKFLOW.md
git commit -m "docs: §48 editor audit fixes — CLAUDE.md §46 wording now matches the rendered gate; trackers updated"
```

---

## Out of scope (decided / deferred — do NOT implement here)

- `object_external_id` linking flow (§22 stays read-only, import-owned — P2 decide later).
- `name_i18n` / `secondary_types` / `business_timezone` exposure (post-MVP translation decision).
- `object_private_description` write in the editor (drawer is the notes home — §43 LOCKED).
- Full GPX→geom pipeline; actor_channel/actor_consent authoring; ScheduleEditor quick-fill chips (inert — note: they live in the primitive, only §14's OpeningPeriodsEditor still uses it after Task 11; fix opportunistically there).
- Per-type section relevance matrix beyond what §46/§48 already gate (audit §4) — needs its own registry design pass.

## Self-review (done at plan-writing time)

- **Coverage:** every P0/P1 from the verified audit maps to a task (type model → 1/2/4; FMA → 4; gate rendering → 3; org/actor → 5/6/7; discounts → 8; contacts → 9; GPX → 10; duplicates → 11; docs/strings → 5 Step 2 + 12). P2s are explicitly out-of-scope with reasons.
- **Known risks for executors:** (a) `Select` option shape — both `{v,l}` arrays and plain string arrays appear in the codebase; match the existing usage in the file you edit. (b) `getByLabelText` on `Toggle`/`Input` — mirror the exact idiom of the neighboring spec if a query fails. (c) The Task 5 type change fans out — let `tsc` enumerate the fixture sites; do not hand-hunt. (d) Task 6's CI test persona — copy from `test_object_fma_rls.sql`, do not invent. (e) Never touch `editor-validation.test.ts` (user WIP).
- **Type consistency:** `buildOrgLinksPayload`/`buildActorLinksPayload` return `null` ⇒ caller omits the key (both savers follow it); `ObjectWorkspaceOrganizationLinkItem.isPrimary` introduced in Task 5 and used in 5/7; `ArchetypeCode` gains `'FMA'` in Task 4 and `Record<ArchetypeCode, …>` sites are compiler-enforced.

