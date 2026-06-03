# Editor — Save + Status + Publish Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the object editor a real draft-save (decoupled from publish) and a coherent status lifecycle (publish / unpublish / archive / restore) via one backend RPC, killing the §01/§21 status write-trap.

**Architecture:** Backend adds `api.rpc_set_object_status(id, status)` (full state machine, gated by `user_can_publish_object`); `rpc_publish_object` becomes a thin wrapper. Frontend extracts a publish-independent `handleSaveDraft`, wires the dead "Brouillon"/new "Enregistrer" buttons, turns the status `<select>` into a read-only chip, and adds permission-gated lifecycle buttons in §21 that call the RPC and reflect the new status via a surgical `editor.setSavedStatus`.

**Tech Stack:** PostgreSQL (Supabase, `api`/`internal` schemas, RLS), Next.js 16 + React, TanStack Query, Jest. Spec: `docs/superpowers/specs/2026-06-03-editor-save-status-lifecycle-design.md`.

---

## File structure

**Backend (deploy-integrity — all four must change together):**
- Create `Base de donnée DLL et API/migration_object_status_lifecycle.sql` — the RPC + wrapper.
- Create `Base de donnée DLL et API/tests/test_object_status_lifecycle.sql` — behavioral CI test.
- Modify `Base de donnée DLL et API/ci_fresh_apply.sql` — add step 8f.
- Modify `.github/workflows/sql-fresh-apply.yml` — add a test step.
- Modify `docs/SQL_ROLLOUT_RUNBOOK.md` + `README.md` + `Base de donnée DLL et API/README.md` — document the new step.

**Frontend:**
- Modify `bertel-tourism-ui/src/services/object-workspace.ts` — add `setObjectStatus` + `friendlyStatusError`.
- Modify `bertel-tourism-ui/src/hooks/useExplorerQueries.ts` — add `useSetObjectStatusMutation`.
- Modify `bertel-tourism-ui/src/features/object-editor/useObjectEditorState.ts` (+ `.test.tsx`) — add `setSavedStatus`.
- Modify `bertel-tourism-ui/src/features/object-editor/ObjectEditPage.tsx` — extract persist core, add `handleSaveDraft`, wire status reflection.
- Modify `bertel-tourism-ui/src/features/object-editor/shell/EditorTopbar.tsx` (+ `.test.tsx`) — "Enregistrer" button.
- Modify `bertel-tourism-ui/src/features/object-editor/shell/EditorFooter.tsx` — enable "Brouillon".
- Create `bertel-tourism-ui/src/features/object-editor/sections/status-actions.ts` (+ `.test.ts`) — pure action-list helper.
- Modify `bertel-tourism-ui/src/features/object-editor/sections/SectionPublication.tsx` — §21 redesign.
- Modify `bertel-tourism-ui/src/features/object-editor/sections/SectionIdentity.tsx` — §01 status → read-only.

---

## Task 1: Backend — `api.rpc_set_object_status` + `rpc_publish_object` wrapper

**Files:**
- Create: `Base de donnée DLL et API/migration_object_status_lifecycle.sql`

- [ ] **Step 1: Write the migration**

```sql
-- migration_object_status_lifecycle.sql
-- Editor "Save + status + publish lifecycle" tranche (B2 / §24 P1.2, §25 audit).
-- Adds api.rpc_set_object_status — ONE RPC for the whole object status state
-- machine — and rewrites api.rpc_publish_object as a thin wrapper over it.
-- Idempotent + transaction-wrapped. Depends on api.user_can_publish_object
-- (rls_policies.sql) + trg_guard_object_status_change (migration_permission_write_paths.sql).
-- Apply order: AFTER migration_permission_write_paths_b.sql (manifest step 8f).
\set ON_ERROR_STOP on
BEGIN;

CREATE OR REPLACE FUNCTION api.rpc_set_object_status(p_object_id text, p_status text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, api, auth
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_current   object_status;
  v_published timestamptz;
  v_target    object_status;
BEGIN
  -- 0. Auth context required (mirrors rpc_create_object / rpc_publish_object).
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'NO_AUTH_CONTEXT: rpc_set_object_status requires an authenticated user (auth.uid() is NULL)';
  END IF;

  -- 1. Validate the requested status against the enum.
  IF p_status NOT IN ('draft','published','hidden','archived') THEN
    RAISE EXCEPTION 'INVALID_STATUS: unknown status %, valid: draft, published, hidden, archived', p_status;
  END IF;
  v_target := p_status::object_status;

  -- 2. Load current state.
  SELECT status, published_at INTO v_current, v_published FROM object WHERE id = p_object_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: object % does not exist', p_object_id;
  END IF;

  -- 3. No-op (idempotent): same status -> return unchanged.
  IF v_target = v_current THEN
    RETURN v_current::text;
  END IF;

  -- 4. Authorize — same predicate as rpc_publish_object + the status guard trigger.
  --    No superuser bypass: the OTI superuser is granted publish_object via /team.
  IF NOT api.user_can_publish_object(p_object_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: status change requires the publish_object permission and an ORG that publishes this object';
  END IF;

  -- 5. Validate the transition. "draft = pre-publication only" (no published->draft).
  --    Restore from archived lands in the correct pre-archive lane via published_at.
  IF NOT (
       (v_current = 'draft'     AND v_target IN ('published','archived'))
    OR (v_current = 'published' AND v_target IN ('hidden','archived'))
    OR (v_current = 'hidden'    AND v_target IN ('published','archived'))
    OR (v_current = 'archived'  AND v_target = 'hidden' AND v_published IS NOT NULL)
    OR (v_current = 'archived'  AND v_target = 'draft'  AND v_published IS NULL)
  ) THEN
    RAISE EXCEPTION 'INVALID_TRANSITION: % -> % is not allowed', v_current, v_target;
  END IF;

  -- 6. Apply. trg_guard_object_status_change re-checks (passes via user_can_publish_object).
  --    published_at is managed by trg_manage_object_published_at on first publish.
  UPDATE object
     SET status = v_target, updated_by = v_caller_id, updated_at = NOW()
   WHERE id = p_object_id;

  RETURN v_target::text;
END;
$$;

REVOKE EXECUTE ON FUNCTION api.rpc_set_object_status(text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.rpc_set_object_status(text, text) TO   authenticated, service_role;

-- rpc_publish_object becomes a thin wrapper (signature unchanged -> existing grants/callers intact).
-- Behaviour change (intentional, more correct): publish(false) on a never-published draft now
-- raises INVALID_TRANSITION instead of forcing 'hidden' (unpublish only applies to published objects).
CREATE OR REPLACE FUNCTION api.rpc_publish_object(p_object_id text, p_publish boolean DEFAULT TRUE)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, api, auth
AS $$
BEGIN
  PERFORM api.rpc_set_object_status(p_object_id, CASE WHEN p_publish THEN 'published' ELSE 'hidden' END);
END;
$$;

REVOKE EXECUTE ON FUNCTION api.rpc_publish_object(text, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.rpc_publish_object(text, boolean) TO   authenticated, service_role;

COMMIT;
```

- [ ] **Step 2: Sanity-check the SQL parses** (no local DB needed — visual + the CI gate is the real check). Confirm: balanced `BEGIN/COMMIT`, the `$$` bodies close, enum literals match `object_status` (`draft/published/hidden/archived`).

- [ ] **Step 3: Commit**

```bash
git add "Base de donnée DLL et API/migration_object_status_lifecycle.sql"
git commit -m "feat(sql): rpc_set_object_status state machine + rpc_publish_object wrapper"
```

---

## Task 2: Backend — CI behavioral test

**Files:**
- Create: `Base de donnée DLL et API/tests/test_object_status_lifecycle.sql`

- [ ] **Step 1: Write the test** (fixture mirrors `tests/test_sp2_permission_behavior.sql`)

```sql
-- test_object_status_lifecycle.sql
-- Behavioral test for api.rpc_set_object_status + the rpc_publish_object wrapper.
-- Self-contained + transactional (ROLLBACK at end). Run AFTER the full manifest
-- INCLUDING migration_object_status_lifecycle.sql.
\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_org        text := 'ORGRUN9999999992';
  v_obj        text := 'HOTRUN9999999992';
  v_pub_role   uuid;
  v_contrib_uid uuid := '00000000-0000-4000-a000-0000000000b1';  -- canonical, NO publish
  v_editor_uid  uuid := '00000000-0000-4000-a000-0000000000b2';  -- has publish_object
  v_m_contrib uuid; v_m_editor uuid;
  v_result text;
  v_status object_status;
BEGIN
  -- ---------- Fixture (as postgres; RLS bypassed for setup) ----------
  SELECT id INTO v_pub_role FROM ref_org_role WHERE code = 'publisher';
  INSERT INTO object (id, object_type, name, status) VALUES
    (v_org, 'ORG', 'Lifecycle Test Org', 'published'),
    (v_obj, 'HOT', 'Lifecycle Test Hotel', 'draft');
  INSERT INTO object_org_link (object_id, org_object_id, role_id) VALUES (v_obj, v_org, v_pub_role);

  INSERT INTO auth.users (id, email) VALUES
    (v_contrib_uid, 'lifecycle_contrib@test.local'),
    (v_editor_uid,  'lifecycle_editor@test.local');
  INSERT INTO app_user_profile (id, role) VALUES
    (v_contrib_uid, 'tourism_agent'), (v_editor_uid, 'tourism_agent')
  ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;

  INSERT INTO user_org_membership (user_id, org_object_id, is_active) VALUES (v_contrib_uid, v_org, TRUE) RETURNING id INTO v_m_contrib;
  INSERT INTO user_org_membership (user_id, org_object_id, is_active) VALUES (v_editor_uid,  v_org, TRUE) RETURNING id INTO v_m_editor;
  INSERT INTO user_org_business_role (membership_id, role_id, is_active)
    SELECT v_m_contrib, id, TRUE FROM ref_org_business_role WHERE code = 'contributor';
  INSERT INTO user_org_business_role (membership_id, role_id, is_active)
    SELECT v_m_editor,  id, TRUE FROM ref_org_business_role WHERE code = 'editor';

  INSERT INTO user_permission (user_id, permission_id, is_active, granted_by, granted_at, created_at, updated_at)
    SELECT v_contrib_uid, id, TRUE, v_editor_uid, NOW(), NOW(), NOW()
    FROM ref_permission WHERE code = 'edit_canonical_when_publisher';
  INSERT INTO user_permission (user_id, permission_id, is_active, granted_by, granted_at, created_at, updated_at)
    SELECT v_editor_uid, id, TRUE, v_editor_uid, NOW(), NOW(), NOW()
    FROM ref_permission WHERE code IN ('edit_canonical_when_publisher','publish_object');

  -- ---------- Editor (publish_object) drives the full state machine ----------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_editor_uid, 'role','authenticated')::text, true);

  v_result := api.rpc_set_object_status(v_obj, 'published');  ASSERT v_result = 'published', 'draft->published';
  v_result := api.rpc_set_object_status(v_obj, 'hidden');     ASSERT v_result = 'hidden',    'published->hidden';
  v_result := api.rpc_set_object_status(v_obj, 'published');  ASSERT v_result = 'published', 'hidden->published';
  v_result := api.rpc_set_object_status(v_obj, 'archived');   ASSERT v_result = 'archived',  'published->archived';
  -- restore: object was published (published_at set) -> archived restores to 'hidden'
  v_result := api.rpc_set_object_status(v_obj, 'hidden');     ASSERT v_result = 'hidden',    'archived->hidden (ever-published)';
  SELECT status INTO v_status FROM object WHERE id = v_obj;   ASSERT v_status = 'hidden',    'row reflects hidden';

  -- wrapper still works
  PERFORM api.rpc_publish_object(v_obj, TRUE);
  SELECT status INTO v_status FROM object WHERE id = v_obj;   ASSERT v_status = 'published', 'rpc_publish_object(true) wrapper';

  -- invalid transition: published -> draft is rejected
  BEGIN
    v_result := api.rpc_set_object_status(v_obj, 'draft');
    RAISE EXCEPTION 'TRANSITION GUARD FAILED: published->draft allowed';
  EXCEPTION WHEN raise_exception THEN
    ASSERT POSITION('INVALID_TRANSITION' IN SQLERRM) > 0, 'expected INVALID_TRANSITION, got: ' || SQLERRM;
  END;

  -- ---------- Contributor (canonical, NO publish) is blocked on status ----------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_contrib_uid, 'role','authenticated')::text, true);
  BEGIN
    v_result := api.rpc_set_object_status(v_obj, 'archived');
    RAISE EXCEPTION 'AUTHZ GUARD FAILED: contributor changed status without publish_object';
  EXCEPTION WHEN raise_exception THEN
    ASSERT POSITION('FORBIDDEN' IN SQLERRM) > 0, 'expected FORBIDDEN, got: ' || SQLERRM;
  END;

  RAISE NOTICE 'Object status lifecycle assertions passed.';
END$$;

ROLLBACK;
```

- [ ] **Step 2: Commit**

```bash
git add "Base de donnée DLL et API/tests/test_object_status_lifecycle.sql"
git commit -m "test(sql): behavioral test for object status lifecycle RPC"
```

---

## Task 3: Backend — fold into the deploy manifest (deploy-integrity)

**Files:**
- Modify: `Base de donnée DLL et API/ci_fresh_apply.sql:55` (after step 8e)
- Modify: `.github/workflows/sql-fresh-apply.yml:105` (after the SP-4 step)
- Modify: `docs/SQL_ROLLOUT_RUNBOOK.md`, `README.md`, `Base de donnée DLL et API/README.md`

- [ ] **Step 1: Add the manifest step** in `ci_fresh_apply.sql` — insert these two lines immediately after line 55 (`\ir migration_sp4_list_org_members.sql`) and before `\echo '== 9/13  ui_whitelabel_branding.sql ...`:

```sql
\echo '== 8f     migration_object_status_lifecycle.sql  (status state-machine RPC; after SP-1 guard) =='
\ir migration_object_status_lifecycle.sql
```

- [ ] **Step 2: Add the CI test step** in `.github/workflows/sql-fresh-apply.yml` — insert after the SP-4 step (after line 105), before `- name: Stop Supabase`:

```yaml
      - name: Object status lifecycle test (rpc_set_object_status + wrapper)
        env:
          DB_URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
        run: psql "$DB_URL" -v ON_ERROR_STOP=1 -f "Base de donnée DLL et API/tests/test_object_status_lifecycle.sql"
```

- [ ] **Step 3: Document the new step** in `docs/SQL_ROLLOUT_RUNBOOK.md` (add `migration_object_status_lifecycle.sql` to the ordered manifest after `migration_permission_write_paths_b.sql` / the SP-4 RPC, matching the §24 P0.1 manifest ordering) and add a one-line mention in both READMEs' quick-start apply lists. (Grep each file for `migration_sp4_list_org_members` and add the new file right after it.)

- [ ] **Step 4: Commit**

```bash
git add "Base de donnée DLL et API/ci_fresh_apply.sql" ".github/workflows/sql-fresh-apply.yml" "docs/SQL_ROLLOUT_RUNBOOK.md" "README.md" "Base de donnée DLL et API/README.md"
git commit -m "ci(sql): fold object status lifecycle migration + test into fresh-apply gate"
```

- [ ] **Step 5: Push and watch the CI gate** — the SQL fresh-apply gate runs on push. Expected: green, including the new "Object status lifecycle test" step. **Do not proceed to live apply until green.** (Live apply + the `/team` `publish_object` grant + read-back are Task 11, gated on explicit user go-ahead.)

---

## Task 4: Frontend — `setObjectStatus` service + mutation hook

**Files:**
- Modify: `bertel-tourism-ui/src/services/object-workspace.ts` (after `publishObjectWorkspace`, ~line 3373)
- Modify: `bertel-tourism-ui/src/hooks/useExplorerQueries.ts` (after `usePublishObjectWorkspaceMutation`, line 359)

- [ ] **Step 1: Add `setObjectStatus` + `friendlyStatusError`** to `object-workspace.ts` (mirrors `publishObjectWorkspace` at :3350):

```ts
export type ObjectLifecycleStatus = 'draft' | 'published' | 'hidden' | 'archived';

/** Maps rpc_set_object_status error codes to French UI messages. */
export function friendlyStatusError(error: { message?: string } | null | undefined): string {
  const msg = error?.message ?? '';
  if (msg.includes('FORBIDDEN')) return "Vos droits ne permettent pas de changer le statut de publication (permission publish_object requise).";
  if (msg.includes('INVALID_TRANSITION')) return "Ce changement de statut n'est pas autorisé depuis l'état actuel.";
  if (msg.includes('INVALID_STATUS')) return "Statut de publication inconnu.";
  if (msg.includes('NOT_FOUND')) return "Fiche introuvable.";
  if (msg.includes('NO_AUTH_CONTEXT')) return "Session expirée — reconnectez-vous.";
  return msg || "Changement de statut impossible.";
}

/** Sets object.status through the lifecycle RPC. Returns the resolved status. */
export async function setObjectStatus(objectId: string, status: ObjectLifecycleStatus): Promise<ObjectLifecycleStatus> {
  const session = useSessionStore.getState();
  if (session.demoMode) {
    return status;
  }
  const apiClient = getApiClient();
  if (!apiClient) {
    throw new Error('Connexion backend indisponible pour gerer le statut.');
  }
  const { data, error } = await apiClient.schema('api').rpc('rpc_set_object_status', {
    p_object_id: objectId,
    p_status: status,
  });
  if (error) {
    throw new Error(friendlyStatusError(error));
  }
  return (data as ObjectLifecycleStatus) ?? status;
}
```

- [ ] **Step 2: Add `useSetObjectStatusMutation`** to `useExplorerQueries.ts` (mirrors `usePublishObjectWorkspaceMutation` at :337). First add `setObjectStatus`, `type ObjectLifecycleStatus` to the existing `from '../services/object-workspace'` import:

```ts
export function useSetObjectStatusMutation(objectId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (status: ObjectLifecycleStatus) => {
      if (!objectId) {
        throw new Error("Aucune fiche active pour gerer le statut.");
      }
      return setObjectStatus(objectId, status);
    },
    onSuccess: async () => {
      if (!objectId) {
        return;
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['object-workspace', objectId] }),
        queryClient.invalidateQueries({ queryKey: ['object-detail', objectId] }),
      ]);
    },
  });
}
```

- [ ] **Step 3: Typecheck**

Run: `cd bertel-tourism-ui && npm run typecheck`
Expected: PASS (no errors in the two modified files).

- [ ] **Step 4: Commit**

```bash
git add bertel-tourism-ui/src/services/object-workspace.ts bertel-tourism-ui/src/hooks/useExplorerQueries.ts
git commit -m "feat(editor): setObjectStatus service + useSetObjectStatusMutation"
```

---

## Task 5: Frontend — `editor.setSavedStatus` (surgical status reflection)

**Files:**
- Modify: `bertel-tourism-ui/src/features/object-editor/useObjectEditorState.ts`
- Test: `bertel-tourism-ui/src/features/object-editor/useObjectEditorState.test.tsx`

- [ ] **Step 1: Write the failing test** — append to `useObjectEditorState.test.tsx`:

```tsx
import { renderHook, act } from '@testing-library/react';
import { useObjectEditorState } from './useObjectEditorState';
// Reuse the test's existing module factory if present; otherwise build a minimal modules object.

it('setSavedStatus updates status in draft AND baseline without marking dirty', () => {
  const modules = makeTestModules(); // existing helper in this test file
  const { result } = renderHook(() => useObjectEditorState('HOTRUN1', modules));

  act(() => result.current.setSavedStatus('published'));

  expect(result.current.draft.generalInfo.status).toBe('published');
  expect(result.current.draft.publication.status).toBe('published');
  // It is the new clean truth — not a pending edit:
  expect(result.current.isDirty).toBe(false);
});
```
> If `makeTestModules` does not exist in the file, build `modules` from `cloneModules` of a minimal `ObjectWorkspaceModules` literal already used elsewhere in the test, ensuring `generalInfo` and `publication` slices exist.

- [ ] **Step 2: Run it to verify it fails**

Run: `cd bertel-tourism-ui && npm run test:run -- useObjectEditorState`
Expected: FAIL — `result.current.setSavedStatus is not a function`.

- [ ] **Step 3: Implement `setSavedStatus`** — in `useObjectEditorState.ts`, add to the `ObjectEditorState` interface (after `commitModules`, line 19):

```ts
  /** Sets object.status in BOTH draft and baseline (the new saved truth) without
   *  touching other fields — used after a successful status-lifecycle mutation so
   *  the UI reflects the change without a refetch (the snapshot is init-once). */
  setSavedStatus: (status: string) => void;
```

Then add the implementation (after `commitModules`, line 59) and include it in the returned object (line 64):

```ts
  const setSavedStatus = useCallback((status: string) => {
    setSnapshot((prev) => ({
      ...prev,
      baseline: {
        ...prev.baseline,
        generalInfo: { ...prev.baseline.generalInfo, status },
        publication: { ...prev.baseline.publication, status },
      },
      draft: {
        ...prev.draft,
        generalInfo: { ...prev.draft.generalInfo, status },
        publication: { ...prev.draft.publication, status },
      },
    }));
  }, []);
```

```ts
  return { draft: snapshot.draft, dirtySections, isDirty, patchModule, replaceModule, resetModule, commitModules, setSavedStatus };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd bertel-tourism-ui && npm run test:run -- useObjectEditorState`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add bertel-tourism-ui/src/features/object-editor/useObjectEditorState.ts bertel-tourism-ui/src/features/object-editor/useObjectEditorState.test.tsx
git commit -m "feat(editor): setSavedStatus for post-mutation status reflection"
```

---

## Task 6: Frontend — `ObjectEditPage` draft-save + status reflection

**Files:**
- Modify: `bertel-tourism-ui/src/features/object-editor/ObjectEditPage.tsx`

- [ ] **Step 1: Add a `savingDraft` state** — in `EditorReady`, after line 129 (`const [statusMessage, setStatusMessage] = useState<string | null>(null);`):

```tsx
  const [savingDraft, setSavingDraft] = useState(false);
```

- [ ] **Step 2: Add `handleSaveDraft`** — after `persistDirtyModules` (after line 183), reusing the existing persist core (no publish, no blocker gate):

```tsx
  /** Persist work-in-progress without publishing and without the blocker gate. */
  async function handleSaveDraft() {
    setStatusMessage(null);
    setSavingDraft(true);
    try {
      const ok = await persistDirtyModules();
      if (ok) {
        setStatusMessage('Brouillon enregistré.');
      }
    } finally {
      setSavingDraft(false);
    }
  }
```

- [ ] **Step 3: Reflect status after publish** — in `handlePublish`, after `await publishObject.mutateAsync(true);` (line 202), add:

```tsx
      editor.setSavedStatus('published');
```

- [ ] **Step 4: Pass the new props to the topbar** — in the `<EditorTopbar ... />` JSX (lines 228-245), add:

```tsx
        savingDraft={savingDraft}
        onSaveDraft={() => void handleSaveDraft()}
```

- [ ] **Step 5: Pass `onSaveDraft` to the footer** — change `<EditorFooter onPreview={openPreviewDrawer} />` (line 270) to:

```tsx
      <EditorFooter onPreview={openPreviewDrawer} onSaveDraft={() => void handleSaveDraft()} savingDraft={savingDraft} />
```

- [ ] **Step 6: Typecheck** (will fail until Tasks 7-8 add the props — expected; do those next)

Run: `cd bertel-tourism-ui && npm run typecheck`
Expected: errors only about `EditorTopbar`/`EditorFooter` missing the new props → resolved by Tasks 7-8.

- [ ] **Step 7: Commit** (after Tasks 7-8 typecheck clean — or commit together with them)

```bash
git add bertel-tourism-ui/src/features/object-editor/ObjectEditPage.tsx
git commit -m "feat(editor): handleSaveDraft + reflect status after publish"
```

---

## Task 7: Frontend — `EditorTopbar` "Enregistrer" button

**Files:**
- Modify: `bertel-tourism-ui/src/features/object-editor/shell/EditorTopbar.tsx`
- Test: `bertel-tourism-ui/src/features/object-editor/shell/EditorTopbar.test.tsx`

- [ ] **Step 1: Write the failing test** — add to `EditorTopbar.test.tsx`:

```tsx
it('renders an Enregistrer button that calls onSaveDraft and is disabled when nothing is dirty', () => {
  const onSaveDraft = jest.fn();
  render(<EditorTopbar {...baseProps} dirtyCount={2} onSaveDraft={onSaveDraft} />);
  const btn = screen.getByRole('button', { name: 'Enregistrer' });
  fireEvent.click(btn);
  expect(onSaveDraft).toHaveBeenCalledTimes(1);

  render(<EditorTopbar {...baseProps} dirtyCount={0} onSaveDraft={onSaveDraft} />);
  expect(screen.getAllByRole('button', { name: 'Enregistrer' }).at(-1)).toBeDisabled();
});
```
> `baseProps` = the existing valid prop object used by other tests in this file (add `onSaveDraft: () => {}` to it if it is shared).

- [ ] **Step 2: Run to verify it fails**

Run: `cd bertel-tourism-ui && npm run test:run -- EditorTopbar`
Expected: FAIL — no "Enregistrer" button / `onSaveDraft` not a prop.

- [ ] **Step 3: Add the props + button.** In `EditorTopbarProps` (after `saving?: boolean;`, line 17):

```tsx
  savingDraft?: boolean;
```
and (after `onPublish: () => void;`, line 23):
```tsx
  onSaveDraft?: () => void;
```
Destructure them (defaults): add `savingDraft = false,` and `onSaveDraft,` to the parameter list (lines 36/42). Then insert the button just before the "Publier" button (before line 102):

```tsx
        {onSaveDraft && (
          <button
            type="button"
            className="btn"
            disabled={savingDraft || saving || publishing || dirtyCount === 0}
            onClick={onSaveDraft}
          >
            {savingDraft ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        )}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd bertel-tourism-ui && npm run test:run -- EditorTopbar`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add bertel-tourism-ui/src/features/object-editor/shell/EditorTopbar.tsx bertel-tourism-ui/src/features/object-editor/shell/EditorTopbar.test.tsx
git commit -m "feat(editor): topbar Enregistrer (draft-save) button"
```

---

## Task 8: Frontend — enable the `EditorFooter` "Brouillon" button

**Files:**
- Modify: `bertel-tourism-ui/src/features/object-editor/shell/EditorFooter.tsx`

- [ ] **Step 1: Replace the component** with the wired version:

```tsx
/** Page footer: draft-save + preview shortcuts (publish lives in the top bar only). */
export function EditorFooter({
  onPreview,
  onSaveDraft,
  savingDraft = false,
}: {
  onPreview: () => void;
  onSaveDraft?: () => void;
  savingDraft?: boolean;
}) {
  return (
    <div className="edit-footer">
      <div className="edit-footer__hint">
        Enregistrez un brouillon à tout moment&nbsp;; la <span>Publication</span> (en haut à droite) met la fiche en ligne.
      </div>
      <div className="edit-footer__actions">
        <button type="button" className="btn" disabled={!onSaveDraft || savingDraft} onClick={onSaveDraft}>
          {savingDraft ? 'Enregistrement…' : 'Brouillon'}
        </button>
        <button type="button" className="btn" onClick={onPreview}>
          Aperçu fiche
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + run the editor shell tests**

Run: `cd bertel-tourism-ui && npm run typecheck && npm run test:run -- EditorFooter EditorTopbar`
Expected: PASS (Task 6's `ObjectEditPage` props now resolve).

- [ ] **Step 3: Commit**

```bash
git add bertel-tourism-ui/src/features/object-editor/shell/EditorFooter.tsx
git commit -m "feat(editor): enable footer Brouillon (draft-save) button"
```

---

## Task 9: Frontend — `SectionPublication` (§21) redesign

**Files:**
- Create: `bertel-tourism-ui/src/features/object-editor/sections/status-actions.ts`
- Test: `bertel-tourism-ui/src/features/object-editor/sections/status-actions.test.ts`
- Modify: `bertel-tourism-ui/src/features/object-editor/sections/SectionPublication.tsx`

- [ ] **Step 1: Write the failing test** for the pure action-list helper — `status-actions.test.ts`:

```ts
import { computeStatusActions } from './status-actions';

it('offers Publier + Archiver from draft', () => {
  expect(computeStatusActions('draft', null)).toEqual([
    { label: 'Publier', target: 'published' },
    { label: 'Archiver', target: 'archived' },
  ]);
});
it('offers Dépublier + Archiver from published', () => {
  expect(computeStatusActions('published', '2026-01-01')).toEqual([
    { label: 'Dépublier', target: 'hidden' },
    { label: 'Archiver', target: 'archived' },
  ]);
});
it('restores an ever-published archived object to hidden', () => {
  expect(computeStatusActions('archived', '2026-01-01')).toEqual([{ label: 'Restaurer', target: 'hidden' }]);
});
it('restores a never-published archived object to draft', () => {
  expect(computeStatusActions('archived', null)).toEqual([{ label: 'Restaurer', target: 'draft' }]);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd bertel-tourism-ui && npm run test:run -- status-actions`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helper** — `status-actions.ts`:

```ts
import type { ObjectLifecycleStatus } from '../../../services/object-workspace';

export interface StatusAction {
  label: string;
  target: ObjectLifecycleStatus;
}

/** The lifecycle actions valid from `status`, mirroring api.rpc_set_object_status's state machine. */
export function computeStatusActions(status: string, publishedAt: string | null | undefined): StatusAction[] {
  switch (status) {
    case 'draft':
      return [{ label: 'Publier', target: 'published' }, { label: 'Archiver', target: 'archived' }];
    case 'hidden':
      return [{ label: 'Publier', target: 'published' }, { label: 'Archiver', target: 'archived' }];
    case 'published':
      return [{ label: 'Dépublier', target: 'hidden' }, { label: 'Archiver', target: 'archived' }];
    case 'archived':
      return [{ label: 'Restaurer', target: publishedAt ? 'hidden' : 'draft' }];
    default:
      return [];
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd bertel-tourism-ui && npm run test:run -- status-actions`
Expected: PASS.

- [ ] **Step 5: Rewrite `SectionPublication.tsx`** — replace the whole file. Removes the status `<select>`, the inert "Aire d'adhésion" select, the inert "Motif hors ligne" textarea and the three inert toggles; keeps `commercial_visibility`; adds the read-only status chip + lifecycle buttons calling the mutation then `editor.setSavedStatus`:

```tsx
import { useState } from 'react';
import { Chip, ChipSet, Field, Fs, Input, Select } from '../primitives';
import type { SectionProps } from './section-types';
import { useSetObjectStatusMutation } from '../../../hooks/useExplorerQueries';
import { computeStatusActions } from './status-actions';

const VISIBILITY_OPTIONS = [
  { v: 'active', l: 'Complète' },
  { v: 'private', l: 'Privée' },
  { v: 'lapsed', l: 'En pause' },
  { v: 'suspended', l: 'Masquée' },
];

const STATUS_PILL: Record<string, { tone: 'ok' | 'warn'; label: string }> = {
  published: { tone: 'ok', label: 'Publié — en ligne' },
  draft: { tone: 'warn', label: 'Brouillon' },
  hidden: { tone: 'warn', label: 'Hors ligne' },
  archived: { tone: 'warn', label: 'Archivé' },
};

export function SectionPublication({ editor, permissions, objectId, folded }: SectionProps) {
  const publication = editor.draft.publication;
  const generalInfo = editor.draft.generalInfo;
  const memberships = editor.draft.memberships;
  const status = generalInfo.status || publication.status || 'draft';
  const publishedAt = publication.publishedAt || generalInfo.publishedAt || '';
  const pill = STATUS_PILL[status] ?? { tone: 'warn' as const, label: status };

  const canPublish = permissions.publication.canDirectWrite;
  const setStatus = useSetObjectStatusMutation(objectId ?? null);
  const [error, setError] = useState<string | null>(null);
  const actions = computeStatusActions(status, publishedAt);

  async function runAction(target: Parameters<typeof setStatus.mutateAsync>[0]) {
    setError(null);
    try {
      await setStatus.mutateAsync(target);
      editor.setSavedStatus(target);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Changement de statut impossible.');
    }
  }

  return (
    <Fs num="21" title="Publication & cycle de vie" sub="Statut, visibilité commerciale, dates clés" folded={folded} pill={pill}>
      <div className="grid-3" style={{ marginBottom: 12 }}>
        <Field label="Statut courant">
          <div className={`pill ${pill.tone}`} style={{ display: 'inline-flex' }}>{pill.label}</div>
        </Field>
        <Field label="Visibilité commerciale">
          <Select
            value={generalInfo.commercialVisibility}
            options={VISIBILITY_OPTIONS}
            onChange={(commercialVisibility) => editor.patchModule('generalInfo', { commercialVisibility })}
          />
        </Field>
        <Field label="Première publication">
          <Input value={publishedAt} mono readOnly placeholder="—" onChange={() => undefined} />
        </Field>
      </div>

      <div className="chip-group__label">Cycle de vie</div>
      {canPublish ? (
        <div className="edit-footer__actions" style={{ gap: 8 }}>
          {actions.map((a) => (
            <button
              key={a.target}
              type="button"
              className={a.target === 'published' ? 'btn primary' : 'btn'}
              disabled={setStatus.isPending}
              onClick={() => void runAction(a.target)}
            >
              {a.label}
            </button>
          ))}
        </div>
      ) : (
        <div className="panel-note">{permissions.publication.disabledReason ?? 'Lecture seule — publication.'}</div>
      )}
      {error && <div className="panel-card panel-card--warning" style={{ marginTop: 8 }}>{error}</div>}

      {publication.moderation.items.length > 0 || publication.printPublications.items.length > 0 ? (
        <div className="grid-2" style={{ marginTop: 14 }}>
          {publication.moderation.items.length > 0 && (
            <div>
              <div className="chip-group__label" style={{ marginTop: 0 }}>Modération</div>
              <div className="kv"><span className="k">En attente</span><span className="v">{publication.moderation.pendingCount}</span></div>
              {publication.moderation.items.map((item) => (
                <div key={item.id} className="kv"><span className="k">{item.status}</span><span className="v">{item.summary}</span></div>
              ))}
            </div>
          )}
          {publication.printPublications.items.length > 0 && (
            <div>
              <div className="chip-group__label" style={{ marginTop: 0 }}>Supports imprimés</div>
              <div className="kv"><span className="k">Sélections</span><span className="v">{publication.printPublications.selectionCount}</span></div>
              {publication.printPublications.items.map((item) => (
                <div key={`${item.publicationId}-${item.workflowStatus}`} className="kv"><span className="k">{item.workflowStatus}</span><span className="v">{item.publicationName || item.publicationCode}</span></div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      <div className="chip-group__label" style={{ marginTop: 14 }}>Résumé publication</div>
      <ChipSet>
        <Chip label={pill.label} on />
        {publishedAt && <Chip label={`Publié le ${publishedAt}`} on />}
        {memberships.items.length > 0 && <Chip label={`${memberships.items.length} adhésion(s)`} on />}
      </ChipSet>
    </Fs>
  );
}
```
> Note: keep the CSS class names (`pill`, `panel-note`, `edit-footer__actions`) — they already exist in `object-editor.css`. If `panel-note` does not exist, use `chip-group__label` styling or add a minimal rule; do not block on styling.

- [ ] **Step 6: Run tests + typecheck**

Run: `cd bertel-tourism-ui && npm run typecheck && npm run test:run -- status-actions SectionPublication`
Expected: PASS. (If a `SectionPublication.test.tsx` exists and asserts the old select, update it to assert the read-only chip + that lifecycle buttons appear only when `permissions.publication.canDirectWrite` is true.)

- [ ] **Step 7: Commit**

```bash
git add bertel-tourism-ui/src/features/object-editor/sections/status-actions.ts bertel-tourism-ui/src/features/object-editor/sections/status-actions.test.ts bertel-tourism-ui/src/features/object-editor/sections/SectionPublication.tsx
git commit -m "feat(editor): §21 read-only status chip + lifecycle actions"
```

---

## Task 10: Frontend — §01 status `<select>` → read-only chip

**Files:**
- Modify: `bertel-tourism-ui/src/features/object-editor/sections/SectionIdentity.tsx` (the status `<select>`, ~lines 343-355)

- [ ] **Step 1: Locate the status control.** Grep: `cd bertel-tourism-ui && grep -n "STATUS_OPTIONS\|patchModule('generalInfo', { status" src/features/object-editor/sections/SectionIdentity.tsx`

- [ ] **Step 2: Replace the status `<Select>`** (the one bound to `patchModule('generalInfo', { status })`) with a read-only chip, mirroring §21's `STATUS_PILL`. Replace the `<Field label="Statut publication"><Select .../></Field>` block with:

```tsx
        <Field label="Statut publication" hint="Le statut se gère dans la section Publication (§21)">
          <div className={`pill ${STATUS_PILL[statusValue]?.tone ?? 'warn'}`} style={{ display: 'inline-flex' }}>
            {STATUS_PILL[statusValue]?.label ?? statusValue}
          </div>
        </Field>
```
where `statusValue = info.status || 'draft'` (use the existing local that feeds the select; rename if needed) and add a local `STATUS_PILL` map identical to §21's, or import it if it has been extracted. Remove the now-unused `STATUS_OPTIONS` const if nothing else uses it.

- [ ] **Step 3: Typecheck + test**

Run: `cd bertel-tourism-ui && npm run typecheck && npm run test:run -- SectionIdentity`
Expected: PASS. (Update `SectionIdentity.test.tsx` if it asserted the editable status select.)

- [ ] **Step 4: Commit**

```bash
git add bertel-tourism-ui/src/features/object-editor/sections/SectionIdentity.tsx
git commit -m "fix(editor): §01 status is read-only (no write-trap); managed in §21"
```

---

## Task 11: Verify end-to-end (frontend green → CI gate → live apply, GATED)

- [ ] **Step 1: Full frontend gate**

Run: `cd bertel-tourism-ui && npm run typecheck && npm run test:run`
Expected: all suites green (incl. the new `status-actions`, `useObjectEditorState`, `EditorTopbar` cases).

- [ ] **Step 2: Confirm the SQL CI gate is green** on the pushed branch (Task 3 Step 5). The "Object status lifecycle test" step must pass on a fresh DB.

- [ ] **Step 3: Manual app verification** (run the app, log in as the OTI superuser): create/open a draft → edit a field → **Enregistrer** persists without publishing → reload shows the data. The §01 + §21 status are read-only chips. (Lifecycle buttons will be disabled until Step 4's grant.)

- [ ] **Step 4: GATED — live activation (only on explicit user go-ahead).** Mirror P0.3/SP-4 deployment: (a) apply `migration_object_status_lifecycle.sql` to live via Supabase MCP `apply_migration`; (b) read-back: `api.rpc_set_object_status` exists, `authenticated`+`service_role` hold EXECUTE, `anon` denied; (c) grant `publish_object` (+ the SP-2 "editor" set) to the OTI superuser via the `/team` UI; (d) in the app, run a full `draft→published→hidden→published→archived→restaurer` cycle on a scratch object and confirm each reflects.

- [ ] **Step 5: Update the decision log + open the PR.** Add a §26 entry to `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md` (what shipped, the wrapper behavior change, the live grant); refresh `.claude` memory; open the PR `feat/editor-save-status-lifecycle → master`.

---

## Self-review notes
- **Spec coverage:** draft-save (Tasks 6-8), status RPC + state machine (Task 1), §21 redesign incl. removing inert controls + keeping `commercial_visibility` (Task 9), §01 read-only (Task 10), activation via `/team` (Task 11 Step 4), deploy-integrity (Tasks 2-3), tests (Tasks 1-2, 5, 7, 9). All spec sections map to a task.
- **Out of scope (unchanged):** §15/§16 RPC wiring + §18/§19/§05 inert-control sweep (P0 tranche); reference enrichment (P2); Explorer "archived" filter (follow-on). This tranche restores the no-write-trap invariant **only for status**.
- **Type consistency:** `ObjectLifecycleStatus` (Task 4) is reused by `useSetObjectStatusMutation` (4), `computeStatusActions`/`StatusAction` (9). `setSavedStatus` (Task 5) signature matches its callers in Tasks 6 + 9. `onSaveDraft`/`savingDraft` props are defined in Task 7 (topbar) + Task 8 (footer) and passed in Task 6.
- **Known minor (noted, not blocking):** after a same-session publish, `published_at` stays stale in the editor (the snapshot is init-once; `setSavedStatus` syncs status only) — affects only an immediate archive→restore lane choice before reload; self-corrects on navigation.
