# Object Creation Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an authorised user create a new object of any creatable type via a thin dialog, then hand off to the existing full-page editor — no duplicated authoring UI.

**Architecture:** `rpc_create_object` (already LIVE) is the only write. A `createObject` service wrapper calls it; a `CreateObjectDialog` (reusing `EditorModal`) collects type+name; a `CreateObjectButton` (gated on `canEditObjects`) owns dialog state and navigates to `/objects/{id}/edit`. Type options are derived from `TYPE_ARCHETYPES` (no hardcoding). Zero changes to the editor loader, sections, or savers.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Zustand session store, Supabase JS (PostgREST `api` schema), Jest + React Testing Library, SQL CI tests.

## Global Constraints

- Region code for new objects: `DEFAULT_REGION_CODE = 'RUN'` (Réunion-only platform).
- Creatable types = the `object_type` enum MINUS `ORG`; the type list MUST be derived from `TYPE_ARCHETYPES` (no hardcoded enum list anywhere).
- No backend/SQL/RLS change in this pass (the RPC is already live). One new CI SQL test only.
- Commit own hunks to `master` directly (PO pushes); no co-author trailer. Conventional commit messages.
- Verify gate before "done": `tsc --noEmit` clean, full front Jest suite green, `next build` exit 0.

---

### Task 1: SQL contract test for `rpc_create_object`

**Files:**
- Create: `tests/test_object_create.sql`

**Interfaces:**
- Produces: a CI assertion file pinning the live RPC contract (no app code depends on it).

- [ ] **Step 1: Write the test** — assertions that fail loudly if the contract drifts.

```sql
-- tests/test_object_create.sql
-- Pins the api.rpc_create_object contract (B1 object creation, §107).
-- Runs as the CI role (service_role-ish, no app JWT) → auth.uid() is NULL,
-- so the success path is asserted structurally, the guard paths behaviourally.
DO $$
DECLARE
  v_def text;
BEGIN
  -- 1. Function exists, SECURITY DEFINER, returns text.
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname='api' AND p.proname='rpc_create_object'
    AND pg_get_function_arguments(p.oid) = 'p_object_type text, p_name text, p_region_code text DEFAULT NULL::text';
  IF v_def IS NULL THEN RAISE EXCEPTION 'rpc_create_object missing or wrong signature'; END IF;
  IF position('SECURITY DEFINER' IN v_def) = 0 THEN RAISE EXCEPTION 'rpc_create_object must be SECURITY DEFINER'; END IF;

  -- 2. Null auth context is rejected (no app JWT in CI).
  BEGIN
    PERFORM api.rpc_create_object('HOT', 'CI test');
    RAISE EXCEPTION 'expected NO_AUTH_CONTEXT, none raised';
  EXCEPTION WHEN OTHERS THEN
    IF position('NO_AUTH_CONTEXT' IN SQLERRM) = 0 THEN
      RAISE EXCEPTION 'expected NO_AUTH_CONTEXT, got: %', SQLERRM;
    END IF;
  END;

  -- 3. Auto-attach trigger and id generator exist (the ownership + id wiring this RPC relies on).
  IF to_regclass('public.object') IS NULL THEN RAISE EXCEPTION 'object table missing'; END IF;
  PERFORM 1 FROM pg_trigger WHERE tgname='trg_auto_attach_object_to_creator_org';
  IF NOT FOUND THEN RAISE EXCEPTION 'trg_auto_attach_object_to_creator_org missing'; END IF;
  PERFORM 1 FROM pg_trigger WHERE tgname='trg_before_insert_object_generate_id';
  IF NOT FOUND THEN RAISE EXCEPTION 'trg_before_insert_object_generate_id missing'; END IF;

  -- 4. Every creatable type (enum minus ORG) is a valid arg → the picker can never offer an invalid type.
  PERFORM 1 FROM pg_enum WHERE enumtypid='object_type'::regtype AND enumlabel <> 'ORG';
  IF NOT FOUND THEN RAISE EXCEPTION 'object_type enum has no non-ORG values'; END IF;

  RAISE NOTICE 'test_object_create.sql: OK';
END $$;
```

- [ ] **Step 2: Verify behaviourally on live via Supabase MCP** — run the DO block; confirm `OK` notice and that a service-role insert with a set `created_by` yields `status='draft'` + a shape-valid id, then ROLLBACK. Expected: NOTICE `OK`; insert id matches `^[A-Z]{3}[A-Z0-9]{3}[0-9A-Z]{10}$`.

- [ ] **Step 3: Commit**

```bash
git add tests/test_object_create.sql
git commit -m "test(sql): pin api.rpc_create_object contract for object creation"
```

---

### Task 2: `createObject` service wrapper

**Files:**
- Modify: `bertel-tourism-ui/src/services/rpc.ts` (add near `createObjectPrivateNote`)
- Test: `bertel-tourism-ui/src/services/rpc.create-object.test.ts`

**Interfaces:**
- Produces:
  - `export const DEFAULT_REGION_CODE = 'RUN';`
  - `export async function createObject(input: { type: string; name: string }): Promise<string>` — returns the new object id; throws `Error` with a friendly FR message on failure.

- [ ] **Step 1: Write failing tests**

```ts
// rpc.create-object.test.ts
import { createObject } from './rpc';
import { useSessionStore } from '../store/session-store';

const rpc = jest.fn();
jest.mock('./supabase', () => ({
  getSupabaseClient: () => ({ schema: () => ({ rpc }) }),
}));

beforeEach(() => {
  rpc.mockReset();
  useSessionStore.setState({ demoMode: false } as never);
});

test('returns the new object id on success', async () => {
  rpc.mockResolvedValue({ data: 'HOTRUN0000000001', error: null });
  await expect(createObject({ type: 'HOT', name: 'Test' })).resolves.toBe('HOTRUN0000000001');
  expect(rpc).toHaveBeenCalledWith('rpc_create_object', { p_object_type: 'HOT', p_name: 'Test', p_region_code: 'RUN' });
});

test('maps a FORBIDDEN error to a friendly message', async () => {
  rpc.mockResolvedValue({ data: null, error: { message: 'FORBIDDEN: création refusée' } });
  await expect(createObject({ type: 'HOT', name: 'X' })).rejects.toThrow(/permission de créer/i);
});

test('demo mode returns a synthetic id without calling the backend', async () => {
  useSessionStore.setState({ demoMode: true } as never);
  await expect(createObject({ type: 'HOT', name: 'X' })).resolves.toMatch(/^DEMO/);
  expect(rpc).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run → fails** (`createObject` not exported). Run: `npx jest src/services/rpc.create-object.test.ts` (from `bertel-tourism-ui`). Expected: FAIL.

- [ ] **Step 3: Implement** (match the file's existing import style for `getSupabaseClient`, `useSessionStore`, error mapping):

```ts
export const DEFAULT_REGION_CODE = 'RUN';

function mapCreateObjectError(message: string): Error {
  if (/NO_AUTH_CONTEXT|not.*authenticat/i.test(message)) return new Error('Session expirée — reconnectez-vous pour créer une fiche.');
  if (/FORBIDDEN/i.test(message)) return new Error("Vous n'avez pas la permission de créer une fiche (membership ORG actif + permission « create_object » requis).");
  if (/INVALID_OBJECT_TYPE/i.test(message)) return new Error("Type d'objet invalide.");
  if (/MISSING_REQUIRED_FIELD/i.test(message)) return new Error('Le nom de la fiche est obligatoire.');
  return new Error("Impossible de créer la fiche pour le moment.");
}

export async function createObject(input: { type: string; name: string }): Promise<string> {
  const session = useSessionStore.getState();
  if (session.demoMode) return `DEMO-${input.type}-${Date.now()}`;

  const client = getSupabaseClient();
  if (!client) throw new Error('Connexion backend indisponible pour créer la fiche.');

  const { data, error } = await client.schema('api').rpc('rpc_create_object', {
    p_object_type: input.type,
    p_name: input.name,
    p_region_code: DEFAULT_REGION_CODE,
  });
  if (error) throw mapCreateObjectError(error.message ?? '');
  if (typeof data !== 'string' || data.length === 0) throw new Error('La création a échoué (aucun identifiant renvoyé).');
  return data;
}
```

- [ ] **Step 4: Run → passes.** Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add bertel-tourism-ui/src/services/rpc.ts bertel-tourism-ui/src/services/rpc.create-object.test.ts
git commit -m "feat(create): createObject service wrapper over rpc_create_object"
```

---

### Task 3: Pure option + validation helpers

**Files:**
- Create: `bertel-tourism-ui/src/features/object-editor/create/create-object-options.ts`
- Test: `bertel-tourism-ui/src/features/object-editor/create/create-object-options.test.ts`

**Interfaces:**
- Produces:
  - `interface CreateTypeOption { code: string; label: string; }`
  - `interface CreateTypeGroup { archetype: ArchetypeCode; codeName: string; family: string; types: CreateTypeOption[]; }`
  - `export function buildCreateTypeOptions(): CreateTypeGroup[]`
  - `export function validateCreateObjectInput(input: { type: string; name: string }): { ok: boolean; errors: { type?: string; name?: string } }`
  - `export const MAX_OBJECT_NAME_LENGTH = 200;`

- [ ] **Step 1: Write failing tests**

```ts
import { buildCreateTypeOptions, validateCreateObjectInput } from './create-object-options';
import { TYPE_ARCHETYPES } from '../archetypes';

test('covers exactly the creatable types (enum minus ORG) with no duplicates', () => {
  const groups = buildCreateTypeOptions();
  const codes = groups.flatMap((g) => g.types.map((t) => t.code)).sort();
  expect(codes).toEqual(Object.keys(TYPE_ARCHETYPES).sort());
  expect(codes).not.toContain('ORG');
  expect(new Set(codes).size).toBe(codes.length);
});

test('groups by the 7 archetypes', () => {
  expect(buildCreateTypeOptions().map((g) => g.archetype).sort())
    .toEqual(['ASC', 'FMA', 'HEB', 'ITI', 'RES', 'SRV', 'VIS']);
});

test('rejects empty name and unknown type, accepts a valid pair', () => {
  expect(validateCreateObjectInput({ type: 'HOT', name: '  ' }).ok).toBe(false);
  expect(validateCreateObjectInput({ type: 'ZZZ', name: 'X' }).errors.type).toBeTruthy();
  expect(validateCreateObjectInput({ type: 'HOT', name: 'Hôtel des Cimes' }).ok).toBe(true);
});
```

- [ ] **Step 2: Run → fails.** Run: `npx jest create-object-options`. Expected: FAIL.

- [ ] **Step 3: Implement** (derives from the single source of truth; sorts groups + types stably):

```ts
import { TYPE_ARCHETYPES, TYPE_LABEL, ARCHETYPE_META, type ArchetypeCode } from '../archetypes';

export const MAX_OBJECT_NAME_LENGTH = 200;

export interface CreateTypeOption { code: string; label: string; }
export interface CreateTypeGroup {
  archetype: ArchetypeCode; codeName: string; family: string; types: CreateTypeOption[];
}

export function buildCreateTypeOptions(): CreateTypeGroup[] {
  const byArchetype = new Map<ArchetypeCode, CreateTypeOption[]>();
  for (const [code, meta] of Object.entries(TYPE_ARCHETYPES)) {
    const list = byArchetype.get(meta.archetype) ?? [];
    list.push({ code, label: TYPE_LABEL[code] ?? code });
    byArchetype.set(meta.archetype, list);
  }
  return [...byArchetype.entries()]
    .map(([archetype, types]) => ({
      archetype,
      codeName: ARCHETYPE_META[archetype].codeName,
      family: ARCHETYPE_META[archetype].family,
      types: types.sort((a, b) => a.label.localeCompare(b.label, 'fr')),
    }))
    .sort((a, b) => a.codeName.localeCompare(b.codeName, 'fr'));
}

export function validateCreateObjectInput(input: { type: string; name: string }): {
  ok: boolean; errors: { type?: string; name?: string };
} {
  const errors: { type?: string; name?: string } = {};
  if (!input.type || !(input.type in TYPE_ARCHETYPES)) errors.type = 'Choisissez un type de fiche.';
  const name = input.name.trim();
  if (!name) errors.name = 'Le nom est obligatoire.';
  else if (name.length > MAX_OBJECT_NAME_LENGTH) errors.name = `Le nom ne peut pas dépasser ${MAX_OBJECT_NAME_LENGTH} caractères.`;
  return { ok: Object.keys(errors).length === 0, errors };
}
```

- [ ] **Step 4: Run → passes.** Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add bertel-tourism-ui/src/features/object-editor/create/create-object-options.ts bertel-tourism-ui/src/features/object-editor/create/create-object-options.test.ts
git commit -m "feat(create): pure type-option + validation helpers for object creation"
```

---

### Task 4: `CreateObjectDialog`

**Files:**
- Create: `bertel-tourism-ui/src/features/object-editor/create/CreateObjectDialog.tsx`
- Test: `bertel-tourism-ui/src/features/object-editor/create/CreateObjectDialog.test.tsx`

**Interfaces:**
- Consumes: `EditorModal` (primitives), `buildCreateTypeOptions`, `validateCreateObjectInput`, `createObject`.
- Produces: `export function CreateObjectDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }): JSX.Element`

- [ ] **Step 1: Write failing RTL tests**

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CreateObjectDialog } from './CreateObjectDialog';
import * as rpc from '../../../services/rpc';

jest.mock('../../../services/rpc');

test('create is disabled until a type and a non-empty name are chosen', () => {
  render(<CreateObjectDialog open onClose={() => {}} onCreated={() => {}} />);
  const create = screen.getByRole('button', { name: /créer/i });
  expect(create).toBeDisabled();
  fireEvent.click(screen.getByRole('radio', { name: /Hotel/i }));
  fireEvent.change(screen.getByLabelText(/nom/i), { target: { value: 'Hôtel des Cimes' } });
  expect(create).toBeEnabled();
});

test('calls createObject and onCreated with the new id', async () => {
  (rpc.createObject as jest.Mock).mockResolvedValue('HOTRUN0000000001');
  const onCreated = jest.fn();
  render(<CreateObjectDialog open onClose={() => {}} onCreated={onCreated} />);
  fireEvent.click(screen.getByRole('radio', { name: /Hotel/i }));
  fireEvent.change(screen.getByLabelText(/nom/i), { target: { value: 'Hôtel des Cimes' } });
  fireEvent.click(screen.getByRole('button', { name: /créer/i }));
  await waitFor(() => expect(onCreated).toHaveBeenCalledWith('HOTRUN0000000001'));
});

test('surfaces a backend error and stays open', async () => {
  (rpc.createObject as jest.Mock).mockRejectedValue(new Error('Pas la permission'));
  render(<CreateObjectDialog open onClose={() => {}} onCreated={() => {}} />);
  fireEvent.click(screen.getByRole('radio', { name: /Hotel/i }));
  fireEvent.change(screen.getByLabelText(/nom/i), { target: { value: 'X' } });
  fireEvent.click(screen.getByRole('button', { name: /créer/i }));
  expect(await screen.findByText(/Pas la permission/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run → fails.** Run: `npx jest CreateObjectDialog`. Expected: FAIL.

- [ ] **Step 3: Implement** (radio group per archetype; name input; submit → service; error inline; reuses `EditorModal` with `saveLabel="Créer la fiche"`):

```tsx
import { useMemo, useState } from 'react';
import { EditorModal } from '../primitives/EditorModal';
import { createObject } from '../../../services/rpc';
import { buildCreateTypeOptions, validateCreateObjectInput, MAX_OBJECT_NAME_LENGTH } from './create-object-options';

export function CreateObjectDialog({ open, onClose, onCreated }: {
  open: boolean; onClose: () => void; onCreated: (id: string) => void;
}) {
  const groups = useMemo(() => buildCreateTypeOptions(), []);
  const [type, setType] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validation = validateCreateObjectInput({ type, name });

  async function handleCreate() {
    if (!validation.ok || busy) return;
    setBusy(true); setError(null);
    try {
      const id = await createObject({ type, name: name.trim() });
      onCreated(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Création impossible.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <EditorModal
      open={open}
      title="Créer une fiche"
      onClose={onClose}
      onSave={handleCreate}
      saveLabel={busy ? 'Création…' : 'Créer la fiche'}
      saveDisabled={!validation.ok || busy}
      size="lg"
    >
      <div className="create-object">
        <fieldset className="create-object__types">
          <legend>Type de fiche</legend>
          {groups.map((g) => (
            <div key={g.archetype} className="create-object__group">
              <p className="create-object__group-title">{g.codeName}<span>{g.family}</span></p>
              <div className="create-object__chips" role="radiogroup" aria-label={g.codeName}>
                {g.types.map((t) => (
                  <label key={t.code} className={`create-object__chip${type === t.code ? ' is-selected' : ''}`}>
                    <input type="radio" name="object-type" value={t.code}
                      checked={type === t.code} onChange={() => setType(t.code)} aria-label={t.label} />
                    <span>{t.label}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </fieldset>
        <label className="create-object__name">
          <span>Nom de la fiche</span>
          <input type="text" value={name} maxLength={MAX_OBJECT_NAME_LENGTH}
            onChange={(e) => setName(e.target.value)}
            placeholder="ex. Hôtel des Cimes" aria-label="Nom de la fiche" />
        </label>
        {error && <p className="create-object__error" role="alert">{error}</p>}
      </div>
    </EditorModal>
  );
}
```

- [ ] **Step 4: Run → passes.** Expected: PASS (3 tests). Add minimal CSS for `.create-object*` in a new `create-object.css` imported by the dialog (chips/spacing; follows the editor token system — not load-bearing for tests).

- [ ] **Step 5: Commit**

```bash
git add bertel-tourism-ui/src/features/object-editor/create/CreateObjectDialog.tsx bertel-tourism-ui/src/features/object-editor/create/CreateObjectDialog.test.tsx bertel-tourism-ui/src/features/object-editor/create/create-object.css
git commit -m "feat(create): CreateObjectDialog (type picker + name) over createObject"
```

---

### Task 5: `CreateObjectButton` + Explorer wiring

**Files:**
- Create: `bertel-tourism-ui/src/features/object-editor/create/CreateObjectButton.tsx`
- Test: `bertel-tourism-ui/src/features/object-editor/create/CreateObjectButton.test.tsx`
- Modify: `bertel-tourism-ui/src/views/ExplorerPage.tsx` (render the button in the header/toolbar)

**Interfaces:**
- Consumes: `useSessionStore.canEditObjects`, `useRouter`, `CreateObjectDialog`.
- Produces: `export function CreateObjectButton(): JSX.Element | null`

- [ ] **Step 1: Write failing RTL tests**

```tsx
import { render, screen } from '@testing-library/react';
import { CreateObjectButton } from './CreateObjectButton';
import { useSessionStore } from '../../../store/session-store';

const push = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

test('renders nothing when the user cannot edit objects', () => {
  useSessionStore.setState({ canEditObjects: false } as never);
  const { container } = render(<CreateObjectButton />);
  expect(container).toBeEmptyDOMElement();
});

test('shows the create CTA when the user can edit objects', () => {
  useSessionStore.setState({ canEditObjects: true } as never);
  render(<CreateObjectButton />);
  expect(screen.getByRole('button', { name: /créer une fiche/i })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run → fails.** Run: `npx jest CreateObjectButton`. Expected: FAIL.

- [ ] **Step 3: Implement** (gate + dialog state + navigate on created):

```tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSessionStore } from '../../../store/session-store';
import { CreateObjectDialog } from './CreateObjectDialog';

export function CreateObjectButton() {
  const canEditObjects = useSessionStore((s) => s.canEditObjects);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  if (!canEditObjects) return null;
  return (
    <>
      <button type="button" className="btn primary" onClick={() => setOpen(true)}>
        ＋ Créer une fiche
      </button>
      <CreateObjectDialog
        open={open}
        onClose={() => setOpen(false)}
        onCreated={(id) => { setOpen(false); router.push(`/objects/${id}/edit`); }}
      />
    </>
  );
}
```

- [ ] **Step 4: Run → passes.** Expected: PASS.

- [ ] **Step 5: Wire into the Explorer header** — import `CreateObjectButton` in `ExplorerPage.tsx` and render it in the page header/toolbar row (next to the existing title/actions). One import + one JSX line. Re-run `npx jest CreateObjectButton` and the Explorer view's own test if any.

- [ ] **Step 6: Commit**

```bash
git add bertel-tourism-ui/src/features/object-editor/create/CreateObjectButton.tsx bertel-tourism-ui/src/features/object-editor/create/CreateObjectButton.test.tsx bertel-tourism-ui/src/views/ExplorerPage.tsx
git commit -m "feat(create): Explorer CTA to create a new object then open the editor"
```

---

### Task 6: Verify, document, remember

**Files:**
- Modify: `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md` (§107)
- Modify: memory (`MEMORY.md` + topic file)

- [ ] **Step 1: Full verify gate.** Run from `bertel-tourism-ui`: `npx tsc --noEmit` (clean), `npx jest src/features/object-editor/create src/services/rpc.create-object.test.ts` (green), then `npm run build` (exit 0). Paste evidence.
- [ ] **Step 2: Decision log §107** — record the create flow, the "reuse the editor / one place to fix" decision, the live RPC reuse, the permission posture + the documented write-trap risk + the auto-attach >1-org edge case (deferred), region='RUN'.
- [ ] **Step 3: Memory** — add a one-line `MEMORY.md` index entry + a topic file capturing: rpc_create_object is live, create=stub+redirect, files added, decision §107.
- [ ] **Step 4: Commit docs**

```bash
git add bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md
git commit -m "docs(create): log §107 object creation flow decision"
```

---

## Self-Review

**Spec coverage:** §2 live RPC → Task 1+2. §5 units → Tasks 2–5. §6 type picker (derived) → Task 3+4. §7 errors → Task 2 (map) + Task 4 (surface). §8 tests → every task TDD + Task 1 SQL + Task 6 gate. §3 permission risk → documented in Task 6. §10 rollout → Task 6. No gaps.

**Placeholder scan:** all steps carry real code/commands. The only "minimal CSS" note (Task 4 Step 4) is non-load-bearing and explicitly scoped. OK.

**Type consistency:** `createObject({type,name}):Promise<string>`, `buildCreateTypeOptions():CreateTypeGroup[]`, `validateCreateObjectInput(...)→{ok,errors}`, `CreateObjectDialog({open,onClose,onCreated})`, `CreateObjectButton()` — names/signatures consistent across Tasks 2→5. `DEFAULT_REGION_CODE='RUN'` and `MAX_OBJECT_NAME_LENGTH=200` single-defined. OK.
