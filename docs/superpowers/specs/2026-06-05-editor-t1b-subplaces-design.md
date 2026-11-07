# Editor T1b — Sub-places persistence (§16 `SectionPlaces`) — 2026-06-05

**Status:** IMPLEMENTED 2026-06-05 (branch `feat/editor-t1b-subplaces` off `master`; logged as §40 in `lot1_mapping_decisions.md`). TDD RED→GREEN; FE suite 372 green; `tsc` clean; commit/push/PR pending.
**Sits in:** §24 P1.2 (editor completion / B2) → §25 remediation **P0** (stop write-traps). Follows §26 (save/status), §29 (§15 relations), §30/§31 (§10), §34 (T1a field-level sweep). This is the **first half of T1b** (sub-places); **zones (`object_zone`) authoring is split into a separate, paired tranche** (see §10 below) because it needs a seeded commune reference + a read-path change (backend / deploy-integrity), a different risk class than this frontend-only work.
**Decision log:** to be recorded as **§40** (zones tranche → §41).

---

## 1. Goal & invariant

Close the remaining §16 sub-place write-traps per the CLAUDE.md invariant:

> Any editable control in the object editor MUST either persist on save or be visibly disabled/absent. Never render an enabled, editable field whose changes are silently discarded.

**Frontend-only.** No migration, no SQL, no CI-gate. `object_place` + `object_place_description` are directly writable via PostgREST by a canonical writer (`owner_write_place FOR ALL USING api.user_can_write_object_canonical(object_id)`, SP-1; the description child is already written today by `upsertPlaceDescription`). Ships with the next Coolify UI build.

## 2. Current state (verified against `master` this session)

§16 `SectionPlaces` edits sub-places via `editor.draft.descriptions.places[]` (an `ObjectWorkspaceDescriptionScope[]`, loaded by the parser at `object-workspace-parser.ts:2922` with `placeId`=`object_place.id`, `label`=`object_place.name`, `recordId`=`object_place_description.id`, plus visibility + description fields).

| Field / action | Persists today? | Mechanism |
|---|---|---|
| description + visibility (existing place) | ✅ yes | `saveObjectWorkspaceDescriptions` → `upsertPlaceDescription` → `object_place_description` |
| **label** | ❌ dropped | saver never writes `object_place.label` |
| **add a sub-place** | ❌ no-op | `upsertPlaceDescription` early-returns when `placeId` is null |
| **remove a sub-place** | ❌ orphaned | backend `object_place` row survives |
| sub-place **"kind" Select** (start/mid/…) | ⚠️ corrupts data | writes the kind code into `chapo`; `object_place` has **no kind column** |
| ITI **stage-kind Select** | ❌ inert | `onChange={()=>undefined}`; `object_iti_stage` has **no kind column** (name/desc/position persist via §28) |

## 3. Scope — IN (frontend-only)

1. **Remove the sub-place "kind" `Select`** (`PLACE_KIND_OPTIONS`) + the `kind`→`chapo` branch in `updatePlace`. Stops the `chapo` corruption; `object_place` has no kind concept. `chapo` for places is not otherwise surfaced in §16.
2. **Remove the ITI stage-kind `Select`** (`SectionPlaces.tsx` stage row, `onChange={()=>undefined}`). After 1+2, `PLACE_KIND_OPTIONS` + `placeKindFromIndex` are dead → delete them.
3. **Persist `label`** — `UPDATE object_place SET label` for existing places (idempotent: the draft scope carries the edited label, not the original, so the executor writes it unconditionally rather than diffing — cheap, last-write-wins).
4. **Persist add** — `INSERT object_place(object_id, label, position)` for draft places with `placeId === null`, then insert their `object_place_description`.
5. **Persist remove** — reconcile-delete: any `object_place` that was loaded but is no longer in the draft is `DELETE`d (cascades to its descriptions/locations/media).

## 4. Approach — per-row reconcile (pure plan + thin executor)

Extend `saveObjectWorkspaceDescriptions` (`object-workspace.ts`): after the object + org description writes, run a **places reconcile** instead of the current `for (place) upsertPlaceDescription` loop.

- **Pure** `computePlacesReconcile(existingPlaceIds: string[], draftPlaces): { toInsert, toUpdate, toDelete }`:
  - `toInsert` = draft places with `placeId === null`.
  - `toUpdate` = draft places with a `placeId` (label + description).
  - `toDelete` = `existingPlaceIds` minus the draft's non-null `placeId`s.
  - Unit-tested; no I/O.
- **Thin async executor** applies the plan via direct PostgREST (mirrors `upsertPlaceDescription`'s fetch-then-write pattern):
  1. fetch `object_place.id` where `object_id = objectId` (the existing set);
  2. `toDelete` → `delete object_place` (cascade);
  3. `toUpdate` → `update object_place.label` (idempotent) + `upsertPlaceDescription` (unchanged path);
  4. `toInsert` → `insert object_place` → use returned id → insert `object_place_description`.
- **Permission gate:** the entire §16 sub-place reconcile (label + add + remove + description) is gated by the **existing** `canEditPlaceDescriptions` — the gate the descriptions saver already receives and that already governs §16 sub-place editing (`true` for super_admin/demo today). This means **no dispatch/permission plumbing change** — the reconcile lives entirely inside `saveObjectWorkspaceDescriptions`. (The separate `canEditPlaces`/`canEditZones` permissions are *location*-scoped and currently `false` for everyone — reserved for a future location-based place/zone editor + the §41 zones tranche; gating on them would block this tranche entirely.)

`position` is assigned from array order on insert. `slug`/`is_primary`/`effective_*`/`extra`/nested `locations`/`media` are **not** touched (preserved on update; default/empty on insert) — so no `save_object_places` destructive replace, no nested-data loss.

## 5. Testing (TDD — RED → GREEN)

- **Pure `computePlacesReconcile` specs:** insert (null placeId) / update (existing) / delete (loaded-then-removed) / no-op (unchanged) / mixed.
- **`SectionPlaces.test.tsx` (new):** the sub-place kind Select and the ITI stage-kind Select no longer render; editing a label, adding a sub-place, and removing one each mark the `descriptions` module dirty and update `draft.descriptions.places`; the kept controls (description, visibility) still mark dirty.
- Full FE suite stays green + `tsc` clean. Frontend-only ⇒ no SQL/CI-gate.

## 6. Verification criteria

- `npm run typecheck` clean (catches the dead `PLACE_KIND_OPTIONS`/`placeKindFromIndex`/imports).
- `npm run test:run` green (≥ current baseline + the new specs).
- Manual smoke on the deployed build: in §16, rename a sub-place / add one / remove one → reload shows the change; no "kind" selects; ITI stage name/desc/position still persist (§28).

## 7. Risks & edge cases

- **Cascade on remove:** deleting an `object_place` cascades to its `object_location` / `object_place_description` / place-scoped `media`. Correct (the user removed the place) but the §16 UI does not display a place's locations/media, so a removal can delete data authored elsewhere. Acceptable + explicit ("Supprimer" button); noted. No blanket delete — only places the user removed.
- **Reconcile fetch:** the executor fetches the existing `object_place` id set per save (consistent with `upsertPlaceDescription`'s existing fetch). Cheap (few rows per object).
- **Concurrent edit:** last-write-wins per the existing editor model (unchanged).

## 8. Scope — OUT

- **Zones (`object_zone`)** → **§41** (next tranche): seeded `ref_commune` (24 Réunion communes) + RLS, `get_object_resource` emitting `object_zone`, an INSEE multi-select in §16, persistence, full deploy-integrity. Frontend + backend.
- **Sub-place locations / media authoring** (the rich `save_object_places` round-trip) — deferred; not modeled in §16's UI.
- **Visibility Select mislabel** — it is labeled "accessibility" (♿/◐/✕) but writes `object_place_description.visibility`; it persists correctly, so this is a separate cosmetic honesty fix, not bundled here.
- No backend, SQL, migration, or RPC.

## 9. References

- §25 editor shell audit (`docs/superpowers/specs/2026-06-03-editor-shell-audit.md`) — §16 graded BROKEN.
- §34 (`lot1_mapping_decisions.md`) — T1a field-level sweep (the prior tranche; this is its sequel).
- `api.save_object_places` (`object_workspace_safe_write_rpcs.sql:1071`) — the destructive full-fidelity writer this tranche deliberately does NOT use (kept for a future full editor / import + the §41 zones path).
- CLAUDE.md → "Editor — no silent write-traps".

## 10. Note on the split

T1b was scoped (user decision, 2026-06-05) as **sub-places now (this spec, §40, frontend-only) + zones next (§41, frontend+backend)**, with zones UI living in §16. The split keeps each spec reviewable and isolates the backend/deploy-integrity surface to the zones tranche.
