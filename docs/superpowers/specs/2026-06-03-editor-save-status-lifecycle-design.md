# Editor — Save + Status + Publish Lifecycle (design spec, 2026-06-03)

**Tranche.** First of the five editor-completion tranches from the §25 audit (B2 / §24 P1.2). Closes the two most severe editor findings: **save-only-on-publish** (no draft-save) and the **§21/§01 status write-trap** (selecting "Archivé/Hors-ligne" then the only button *publishes* the object).

**Branch.** `feat/editor-save-status-lifecycle` (off `origin/master`).

**Decisions locked (d.philippe@otisud.com, 2026-06-03):** activation via `/team` grant (no superuser bypass); status modeled by **one general `api.rpc_set_object_status`** with `rpc_publish_object` kept as a thin wrapper.

---

## 1. Goals & non-goals

**Goals**
1. A **draft-save** that persists editor content without publishing and without the publication-blocker gate — usable by a canonical writer (incl. the superuser via the owner path today), even with open blockers.
2. A coherent **status lifecycle** — Publier / Dépublier / Archiver / Restaurer — via one backend RPC, replacing the §21/§01 status `<select>` write-trap with a read-only status display + explicit, permission-gated actions.
3. Persist `object.status` only through the lifecycle RPC; never via a silently-dropped form control.

**Non-goals (other tranches / follow-ons)**
- The §15/§16 defined-but-unwired RPC wiring and the §18/§19/§05 inert-control sweep — **P0 write-trap tranche**. *This tranche fixes only the **status** write-trap; the others remain until that tranche.*
- Reference enrichment (P2), coverage gaps (P3), coherence/polish (P4).
- Explorer discoverability of `archived` objects (needed to *find* one for Restaurer) — **logged as a follow-on**, not built here.

---

## 2. Backend — `api.rpc_set_object_status`

New migration `Base de donnée DLL et API/migration_object_status_lifecycle.sql` (idempotent, transaction-wrapped).

### 2.1 Function contract
```
api.rpc_set_object_status(p_object_id text, p_status text) RETURNS text  -- returns the resolved status
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, api, auth
```
Logic:
1. **Auth context** — `auth.uid()` required (RAISE `NO_AUTH_CONTEXT` if null), mirroring `rpc_create_object`.
2. **Load** current `status` + `published_at` (RAISE `NOT_FOUND` if the object doesn't exist).
3. **Validate** `p_status ∈ {draft, published, hidden, archived}` (RAISE `INVALID_STATUS`).
4. **No-op** — if `p_status = current status`, return it unchanged (idempotent).
5. **Authorize** — `IF NOT api.user_can_publish_object(p_object_id) THEN RAISE FORBIDDEN`. Mirrors `rpc_publish_object` exactly — **no superuser bypass** (the superuser gets `publish_object` granted via `/team`; §2.6 intact). The guard trigger `trg_guard_object_status_change` remains as defense-in-depth and passes because `user_can_publish_object` is true.
6. **Validate transition** against the state machine (§2.2); RAISE `INVALID_TRANSITION` otherwise.
7. **UPDATE** `object SET status = <resolved>, updated_by = auth.uid(), updated_at = now()`. `published_at` is managed by the existing `trg_manage_object_published_at` (set on first publish, never reset).

### 2.2 State machine
"draft = pre-publication only" is preserved (no `published→draft`):

| From | Allowed → |
|------|-----------|
| `draft` | `published` (publish), `archived` (archive) |
| `published` | `hidden` (unpublish), `archived` |
| `hidden` | `published` (republish), `archived` |
| `archived` | `hidden` **if `published_at IS NOT NULL`**, else `draft` (restore to the correct pre-archive lane) |

All other transitions → `INVALID_TRANSITION`. The **UI computes the restore target** from `published_at` (it's in the resource) and the RPC enforces it.

### 2.3 `rpc_publish_object` becomes a wrapper
`CREATE OR REPLACE` the existing `api.rpc_publish_object(text, boolean)` (signature unchanged → grants + existing callers intact) to delegate: `p_publish=true → rpc_set_object_status(id,'published')`; `p_publish=false → rpc_set_object_status(id,'hidden')`. Behavior for its real use (publish a draft/hidden object; unpublish a published one) is unchanged.

### 2.4 Grants
`REVOKE … FROM PUBLIC, anon; GRANT EXECUTE … TO authenticated, service_role` for `rpc_set_object_status` (mirrors `rpc_publish_object`). Schema `api` USAGE already granted.

---

## 3. Half 1 — Draft-save (frontend, no backend dependency)

The save engine `useEditorSave.save` is already pure `(modules, permissions, draft) → {saved, failed, blocked}` and publish-independent; the coupling is entirely in `ObjectEditPage.handlePublish`.

- **Extract `handleSaveDraft`** in `ObjectEditPage.tsx`: the `save → commitModules → statusMessage` core of `persistDirtyModules` (`:158-183`), called **standalone** — no `publishObject.mutateAsync`, no `validation.blockers` gate. Keeps the engine's per-module permission routing + partial-success messages.
- **Refactor** `persistDirtyModules` so both `handlePublish` and `handleSaveDraft` reuse the same persist core (publish = persist-then-publish-with-blocker-gate; draft = persist-only).
- **Wire the buttons:** enable the dead Footer "Brouillon" (`EditorFooter.tsx:9`) with an `onSaveDraft` prop; add an "Enregistrer" button to `EditorTopbar.tsx` beside "Publier" (with its own `saving` state). `publishDisabled` keeps gating **Publier** only → WIP saves even with open blockers, and a non-publisher can finally persist.
- **Status leaves content-save:** the §01 (`SectionIdentity.tsx:351`) and §21 (`SectionPublication.tsx:52`) status `<select>` become a **read-only status chip**. `saveObjectWorkspaceGeneralInfo` already omits `status`, so no writer changes — the control simply stops pretending to be editable. (Fixes the §01/§21 write-trap.)
- **Validation:** draft-save skips publication blockers/warnings. Name integrity: draft-save still persists whatever is present (objects always have a name from `rpc_create_object`); no new gate.

---

## 4. Half 2 — §21 + topbar lifecycle actions

- **Service:** `setObjectStatus(objectId, status)` in `object-workspace.ts` → `client.schema('api').rpc('rpc_set_object_status', { p_object_id, p_status })`. FR error mapping (`FORBIDDEN`, `INVALID_STATUS`, `INVALID_TRANSITION`, `NOT_FOUND`, `NO_AUTH_CONTEXT`) following the `rbac.ts` `friendlyRbacError` pattern. Hook `useSetObjectStatusMutation(objectId)` (mirrors `usePublishObjectWorkspaceMutation`), invalidating the workspace query.
- **§21 SectionPublication redesign:** read-only status chip + **action buttons** computed from current status + `published_at`:
  - `draft`/`hidden` → **Publier**; `published` → **Dépublier**; any non-archived → **Archiver**; `archived` → **Restaurer** (target = `published_at ? 'hidden' : 'draft'`).
  - Buttons render only when `canPublishObject` is true (already surfaced via SP-3 / `resource.permissions`) and the transition is valid. Otherwise a "Lecture seule — publication" note (the honest disabled pattern from §20/§22).
  - **`commercial_visibility` stays editable** — it persists today via the general-info save and is *not* `status`; only the status `<select>` is removed in favor of the chip + actions.
  - The other currently-inert §21 controls (Aire d'adhésion select, Motif hors ligne textarea, the 3 workflow toggles — all `onChange={NOOP}` per the audit) are **removed or visibly disabled** as part of this redesign, so the rebuilt §21 introduces no new write-traps. (Wiring "Motif hors ligne" to a real offline-reason column is a deferred enhancement.)
- **Topbar:** "Enregistrer" (draft-save; canonical writers) + "Publier" (publish; publishers). Update the save-status label copy (drop "Publier pour enregistrer").

---

## 5. Permissions & activation

| Action | Gate | Superuser today |
|--------|------|-----------------|
| Draft-save (content) | canonical-write (`user_can_write_object_canonical`) | ✅ works (owner path) |
| Publish/Unpublish/Archive/Restore | `publish_object` (`user_can_publish_object`) | ❌ until granted |

**Activation:** grant `publish_object` (and the rest of the SP-2 "editor" set) to the OTI superuser via the live `/team` UI during verification — same operational-data approach as B1's `create_object` grant. No seed, no bypass.

---

## 6. Deploy-integrity

`migration_object_status_lifecycle.sql` MUST be folded into all four:
1. `Base de donnée DLL et API/ci_fresh_apply.sql` — after `migration_permission_write_paths_b.sql` (it depends on `user_can_publish_object` + `trg_guard_object_status_change`, both from SP-1).
2. `docs/SQL_ROLLOUT_RUNBOOK.md` — canonical apply order.
3. Root `README.md` + `Base de donnée DLL et API/README.md` quick-starts.
4. `tests/test_object_status_lifecycle.sql` — added as a CI-gate step.

**CI behavioral test** (fixture users, mirrors `test_sp2_permission_behavior.sql`): a `publish_object` holder runs `draft→published→hidden→published→archived→hidden` (asserting each); a canonical-only writer is **blocked** on any status change (42501 from guard / FORBIDDEN from RPC); a `published→draft` attempt → `INVALID_TRANSITION`; draft-save (a content `UPDATE` with no status change) succeeds for the canonical writer. Verify green on the CI fresh-apply gate, **then** apply to live via Supabase MCP, then read-back (`rpc_set_object_status` exists; grants correct; one live publish→unpublish cycle on a scratch object).

---

## 7. Testing (frontend)
- `handleSaveDraft` persists dirty modules without calling publish and without the blocker gate (unit/integration over the extracted core).
- §01/§21 status renders **read-only** (no `<select>` write path).
- §21 action buttons: correct set per `(status, published_at)`; hidden when `!canPublishObject`; restore-target computation.
- `setObjectStatus` service: success + error mapping.
- `npm run typecheck` + `npm run test:run` green.

---

## 8. Sequencing
1. **Half 1 (draft-save)** — self-contained frontend; ships first, immediately makes the editor savable.
2. **Half 2 (status RPC + §21 actions)** — backend migration → CI green → live apply + `/team` grant → §21 UI.

Both land under one spec/branch; Half 1 can merge independently if desired.

---

## 9. Acceptance criteria
- [ ] A canonical writer saves a draft's content (name, location, descriptions, etc.) **without** publishing and **with** open publication blockers; reload shows the data.
- [ ] The §01 and §21 status controls are read-only; no editable control silently drops `status`.
- [ ] `api.rpc_set_object_status` enforces the §2.2 state machine + `user_can_publish_object`; `rpc_publish_object` still works as a wrapper.
- [ ] §21 shows Publier/Dépublier/Archiver/Restaurer per state, only to publishers; each performs the transition.
- [ ] CI fresh-apply gate green incl. `test_object_status_lifecycle.sql`; applied to live; read-back verified.
- [ ] After a `/team` `publish_object` grant, the superuser runs the full lifecycle end-to-end.
- [ ] `typecheck` + Jest green.

## 10. Risks / open
- **`published_at` semantics** — restore-target relies on it being set on first publish and never reset; confirm `trg_manage_object_published_at` before coding (rpc_publish_object's comment asserts it).
- **Partial scope on write-traps** — this tranche restores the no-write-trap invariant *only for status*; §15/§16/§18/§19/§05 traps persist until the P0 sweep. Do not claim the invariant is fully restored.
- **Archived discoverability** — restoring requires reaching an archived object that's hidden from the Explorer; follow-on (Explorer "archived" filter for editors).
