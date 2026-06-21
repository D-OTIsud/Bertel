# Object Creation Flow — Design (B1)

**Date:** 2026-06-21
**Status:** Approved-by-delegation (PO instructed "build the full process, take all the necessary decisions, on your own; reuse the editor so there is one place to fix").
**Decision log target:** `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md` §107 (next free number).

---

## 1. Goal

Let an authorised user create a brand-new tourism object of **any** creatable type and immediately
author it in the **existing full-page editor** (`/objects/[objectId]/edit`). The editor is the single
authoring surface; the creation flow must **not** duplicate any editing UI or saver logic.

> PO maintainability requirement (verbatim intent): "use the edit as part of the creation process so we
> don't go over the same work twice and have only 1 place to fix."

---

## 2. Key finding — most of the backend already exists and is LIVE

Verified against the live database (2026-06-21):

| Piece | State | Evidence |
|---|---|---|
| `api.rpc_create_object(p_object_type text, p_name text, p_region_code text DEFAULT NULL)` | **deployed live** | `pg_get_functiondef`; source `rls_policies.sql:3174` |
| Auth + permission gate (`user_can_create_object`) | live | requires active ORG membership **AND** `create_object` permission |
| Forces `status='draft'`, `created_by/updated_by = auth.uid()`, id auto-generated | live | RPC body |
| Enum validation against `object_type` (all 19 values, message lists them) | live | RPC body (`pg_enum`) |
| `trg_auto_attach_object_to_creator_org` (AFTER INSERT) → `object_org_link [publisher]` for the creator's single active ORG | live | `schema_unified.sql:6015` |
| Editor loads any real object incl. near-empty drafts (loading/error/unsupported-type states; §42/§99 handle empties) | live | `ObjectEditPage.tsx:50` |

**Live enum (19 values):** `RES, PCU, PNA, ORG, ITI, VIL, HPA, ASC, COM, HOT, HLO, LOI, FMA, CAMP, PSV, RVA, ACT, SPU, PRD`.
Creatable types = **18** (enum minus `ORG`). `archetypes.ts → TYPE_ARCHETYPES` already maps exactly these 18 → 7 archetypes (HEB/RES/ASC/ITI/FMA/VIS/SRV); `ORG` is deliberately unmapped (managed via `/team`).

**Conclusion:** the gap is almost entirely **frontend**. No SQL deploy is required (the RPC is already live and folded into source). The work is: a creation entry point + a thin create dialog + a service wrapper + tests + a CI SQL test that pins the RPC contract.

---

## 3. Permission posture (verified) — and the one risk

- Single seeded user = `super_admin`, holds all 10 permission grants (incl. `create_object` **and**
  `edit_canonical_when_publisher`) and 1 active ORG membership. (The memory note "0 permission grants" is stale — SP-4 granted them.)
- Therefore today: `user_can_create_object()` = true, and post-create `user_can_write_object_canonical(new)` = true
  (via superuser **and** via the auto-attached publisher link + `edit_canonical_when_publisher`). **Create→edit works end to end.**
- **Risk (documented, not blocked):** a *future* user granted `create_object` **without** `edit_canonical_when_publisher`
  (and not superuser/admin) could create a stub then land in a read-only editor (the editor already gates
  canonical sections read-only per module). This is a **role-bundling/config** concern owned by SP-2/SP-4
  (`/team` should grant `create_object` + `edit_canonical_when_publisher` together), not a structural one.
  Mitigation in this scope: surface the server `FORBIDDEN` error clearly, and document the bundling rule.
  Edge case (also deferred, pre-existing class): a non-superuser with **>1** active ORG → auto-attach trigger
  skips → no publisher link → write-trap; covered by the existing SP-2 deferred item.

**Decision:** do **not** change the backend permission model in this pass (YAGNI; reversible later). Gate the
UI on the already-available `canEditObjects` and rely on the server RPC as the true gate.

---

## 4. Approaches considered

**A. Minimal stub + redirect (CHOSEN).** Create dialog collects the **two** fields the RPC strictly requires —
`object_type` + `name` — calls `rpc_create_object`, then `router.push('/objects/{newId}/edit')`. All other
authoring (sub-category/taxonomy, location, description, media, publisher refinement, …) happens in the editor.
*Pros:* zero duplication, one place to fix, smallest surface, the editor's completion ring guides the user to
fill the rest. *Cons:* the freshly-created object is intentionally sparse until the user fills §01+.

**B. Guided multi-step wizard** (type → name → sub-category → commune → description …). *Pros:* a more complete
initial object. *Cons:* **re-implements** editor sections (§01 taxonomy, §02 location, §04 descriptions) in a
parallel form — directly violates the "one place to fix" requirement. **Rejected.**

**C. Sentinel `/objects/new/edit` route** that creates on first save. *Pros:* no separate dialog. *Cons:* the
editor loader, savers, and permission gates all assume a real object id exists; would require invasive,
fragile editor changes (the exact opposite of reuse). **Rejected.**

Approach **A** is the only one that honours the maintainability requirement.

---

## 5. Architecture

```
Explorer toolbar                         (gated on canEditObjects)
   └─ "＋ Créer une fiche" button ──────────────────────────────┐
                                                                 ▼
                                                   CreateObjectDialog (EditorModal)
                                                   ├─ type picker  (grouped by 7 archetypes,
                                                   │                derived from TYPE_ARCHETYPES —
                                                   │                ORG excluded; no hardcoding)
                                                   ├─ name input   (required, trimmed, ≤200)
                                                   └─ on submit ──► createObject(type, name)  ─── service
                                                                         │  rpc_create_object (LIVE)
                                                                         ▼
                                                                   new objectId (text)
                                                                         │
                                                          router.push(`/objects/${id}/edit`)
                                                                         ▼
                                                   EXISTING full-page editor (unchanged)
```

### 5.1 New units (all small, single-purpose, testable in isolation)

| Unit | File | Responsibility | Test |
|---|---|---|---|
| `buildCreateTypeOptions()` | `features/object-editor/create/create-object-options.ts` | Pure. Derive grouped, sorted type options `{ archetype, archetypeLabel, types: [{code,label}] }[]` from `TYPE_ARCHETYPES` + `TYPE_LABEL` + `ARCHETYPE_META`. Covers exactly enum-minus-ORG. | unit: 18 types, 7 groups, ORG absent, stable order |
| `validateCreateObjectInput(input)` | same file | Pure. `{ ok, errors }` — type ∈ allowed set, name non-empty after trim, name ≤ 200. | unit: empty name, bad type, ok |
| `createObject({ type, name })` | `services/rpc.ts` (sibling of `createObjectPrivateNote`) | Calls `api.rpc_create_object` with `p_region_code = DEFAULT_REGION_CODE ('RUN')`; returns new id (string); maps RPC errors (FORBIDDEN/INVALID_OBJECT_TYPE/…) to friendly FR messages; respects `demoMode`. | unit: success returns id; 403 → friendly error; demo short-circuit |
| `CreateObjectDialog` | `features/object-editor/create/CreateObjectDialog.tsx` | Presentational + local state: type picker + name input, save disabled until valid, loading + error states, calls `onCreated(id)` on success. Reuses `EditorModal`, `Input`, `Field`. | RTL: disabled-until-valid, calls service, surfaces error, calls onCreated |
| `CreateObjectButton` | `features/object-editor/create/CreateObjectButton.tsx` | Owns dialog open state + navigation; gated on `canEditObjects`; renders nothing when not allowed. | RTL: hidden when !canEditObjects; navigates on created |

`DEFAULT_REGION_CODE = 'RUN'` lives next to `createObject` (Réunion-only platform; keeps new ids `XXXRUN…`
consistent with all existing data instead of the RPC's `GEN` fallback).

### 5.2 Touch points in existing files (minimal)

- **Explorer view** (`views/ExplorerPage` header/toolbar): render `<CreateObjectButton />`. One import + one line.
- **`services/rpc.ts`**: add `createObject` + `DEFAULT_REGION_CODE` (mirrors the existing `createObjectPrivateNote` shape, incl. `demoMode` + client-missing handling).

**No changes** to: the editor loader (`getObjectWorkspaceResource`), the section registry, any saver, the
editor state model, RLS, or any SQL function. That is the whole point.

---

## 6. Type picker UX

- Grouped by the 7 archetypes (HEB/RES/ASC/ITI/FMA/VIS/SRV), each group titled with its `codeName` +
  `family` (from `ARCHETYPE_META`), listing its member types by `TYPE_LABEL`.
- Selection granularity = **DB type code** (e.g. `HOT`, `HLO`, `RES`, `LOI`…), because the editor archetype
  + facet applicability are driven by the concrete type. The user picks the precise type once, at creation
  (type is effectively immutable afterwards — `trg_guard_object_type_change`).
- Derived entirely from `TYPE_ARCHETYPES`; a future enum value added there automatically appears here. No
  hardcoded type list anywhere in the create flow (mirrors the existing no-hardcode invariant).

---

## 7. Error handling

- Client: submit disabled until `validateCreateObjectInput` passes; name trimmed.
- Server (defense in depth): `rpc_create_object` enforces auth + `user_can_create_object` + enum + non-empty.
  `createObject` maps:
  - `NO_AUTH_CONTEXT` / not-authenticated → "Session expirée, reconnectez-vous."
  - `FORBIDDEN` → "Vous n'avez pas la permission de créer une fiche (membership ORG + permission create_object)."
  - `INVALID_OBJECT_TYPE` / `MISSING_REQUIRED_FIELD` → echo a friendly FR message.
  - other → generic fallback, original error logged.
- The dialog shows the mapped message inline and stays open so the user can retry.

---

## 8. Testing

- **SQL (CI):** `tests/test_object_create.sql` — pins the RPC contract: exists, `SECURITY DEFINER`, returns text,
  rejects null-auth (`NO_AUTH_CONTEXT`), rejects unknown type, rejects empty name, and (as service-role with a
  forged `request.jwt` / direct assertion) that a successful insert yields `status='draft'`, a generated id
  matching `^[A-Z]{3}[A-Z0-9]{3}[0-9A-Z]{10}$`, and (when membership=1) an auto-attached publisher link. Self-cleaning.
- **Jest (frontend):** unit specs for `buildCreateTypeOptions`, `validateCreateObjectInput`, `createObject`
  (mocked client, success + 403 + demo), and RTL specs for `CreateObjectDialog` + `CreateObjectButton`
  (gating, disabled-until-valid, success navigation, error surface).
- **Verify gate:** `tsc --noEmit` clean, full editor/front Jest suite green, `next build` exit 0.

---

## 9. Out of scope / deferred (documented)

- Picking sub-category/taxonomy, location, or description at creation time → **the editor owns these** (the
  whole reason for approach A). The completion ring drives the user there immediately.
- Backend permission-model change to make "can create" imply "can edit" → SP-2/SP-4 role bundling.
- Precise `canCreateObjects` session flag (vs coarse `canEditObjects`) → small bootstrap refinement; deferred.
- ORG creation → `/team` administration (unchanged).
- Duplicate-from-existing ("Dupliquer") → previously removed from the editor OUTILS as "= B1"; could layer on
  top of `createObject` later, its own pass.

---

## 10. Rollout

Frontend-only + a CI SQL test. The RPC is already live. Commit own hunks to `master` (PO pushes), per the
project's commit/push workflow. Update `lot1_mapping_decisions.md` §107 + memory at the end.
