# Object Editor — Per-Organisation Description Enrichment

- **Date:** 2026-06-01
- **Status:** Design — awaiting review
- **Scope:** `bertel-tourism-ui` object editor §04 Descriptions (`/objects/[objectId]/edit`), plus a read-payload enrichment, one new write RPC, and one session bootstrap addition.
- **Related:**
  - `CLAUDE.md` § "ORG vs ACTOR invariant" and the `edit_org_enrichment` permission model
  - `Base de donnée DLL et API/rls_policies.sql` (helper `api.user_can_write_enrichment`, "Phase 6" note line ~2921)
  - `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md` (to be updated on completion)

---

## 1. Context & problem

In the §04 Descriptions section of the object editor, the canonical **Accroche** (`description_chapo`),
**Descriptif** (`description`) and **Descriptif du plan d'accès** (`description_adapted`) are fine. But
the section also shows two fields labelled **"Accroche OTI"** and **"Descriptif OTI"** that are wrong on
two counts:

1. **They are the same field rendered twice.** Both bind to `objectScope.editorialDescription` and both
   call `patchEditorial` ([SectionDescriptions.tsx:84-101](../../../bertel-tourism-ui/src/features/object-editor/sections/SectionDescriptions.tsx)),
   i.e. they read and overwrite the single column `description_edition`.
2. **They are mislabelled.** `description_edition` is a **canonical** single-value column described as a
   print/brochure text ([OBJECT_DATA_DICTIONARY.md:305](../../architecture/OBJECT_DATA_DICTIONARY.md)). It
   is neither per-organisation nor specific to the OTI. The "OTI" label hardcodes one organisation.

The real requirement: **any organisation with the right permission must be able to write its own version
of the editorial texts for an object**, switchable in the editor much like the FR/EN language tabs —
"its own organisation" meaning the organisation of the user currently editing.

**Key finding — most of this already exists.** The per-organisation description overlay is already modelled
in the schema and already implemented (with fallback) on the consumer read API. The gap is purely that the
editor never exposed it; it improvised the two "OTI" boxes against the wrong column instead.

## 2. Goals / non-goals

**Goals**
- Replace the two broken "OTI" boxes with a **scope switch** (`Canonique` / `Mon organisation · <name>`) at
  the head of §04, above the existing language tabs.
- Let a user edit a **per-organisation overlay** of Accroche + Descriptif + Plan d'accès for their active
  organisation, multilingual, gated by `edit_org_enrichment`.
- Apply **overlay + fallback** semantics: an empty overlay field falls back to canonical at render.
- Keep the existing architecture, the per-module save model, and the language-tab UX untouched.

**Non-goals**
- No new storage table (the schema already supports it — see §4).
- No editing of **other** organisations' overlays; the editor writes the active user's org row only.
- No multi-org editing surface for platform super-admins (they edit canonical).
- No repurposing or removal of the `description_edition` column — it is simply unbound from §04 and left as
  canonical data (reversible).
- No change to `description_mobile`, nor to the unrelated FALC/accessibility label discrepancy flagged in §9.
- No change to publication validation: the required "Descriptif" check stays on **canonical** only; an org
  overlay is always optional.

## 3. Locked decisions

| # | Decision | Choice |
|---|----------|--------|
| D1 | Overlay semantics | **Overlay + fallback.** Canonical is the shared base; an org's row replaces it on that org's channels; empty → canonical. Matches the existing `edit_org_enrichment` intent "enrich without touching canonical". |
| D2 | Fields carrying an org overlay | **Accroche + Descriptif + Plan d'accès** (`description_chapo`, `description`, `description_adapted`, with their `*_i18n`). |
| D3 | Scope-selector layout | **Scope switch at the head**, then language tabs, then the 3 fields (scope × language matrix). |
| D4 | Write contract | **W2 — dedicated SECURITY DEFINER RPC** `api.rpc_write_org_description`. The server sets `org_object_id = api.current_user_org_id()`; the client cannot choose which org it writes for. Matches the documented "RPC d'enrichissement ORG — Phase 6" intent. |
| D5 | Empty overlay handling | An overlay field left empty persists as `NULL` (fallback applies). If the **entire** overlay is empty, **no org row is persisted** (existing row is deleted). No "publishing emptiness". |
| D6 | "OTI" boxes | **Removed.** `description_edition` stays as a canonical column but is no longer surfaced in §04. |

## 4. Schema findings (verified — `schema_unified.sql` + API + frontend)

**Nothing to create.** `object_description` is already a per-(object, org) table:

| Element | Location | Meaning |
|---------|----------|---------|
| `org_object_id TEXT REFERENCES object(id)` | [schema_unified.sql:1354](../../../Base%20de%20donnée%20DLL%20et%20API/schema_unified.sql) | Org context of the row |
| `uq_object_description_canonical_one` | schema_unified.sql:1396 | Exactly **one** canonical row per object (`org_object_id IS NULL`) |
| `uq_object_description_per_org` | schema_unified.sql:1401 | **At most one** row per organisation per object (`org_object_id IS NOT NULL`) |
| Fields | schema_unified.sql:1336-1370 | `description_chapo`, `description`, `description_adapted` (+ `*_i18n`) all present |

**Permission layer already exists and already does what the user described:**

| Element | Location | Behaviour |
|---------|----------|-----------|
| Permission `edit_org_enrichment` | [seeds_data.sql:4034](../../../Base%20de%20donnée%20DLL%20et%20API/seeds_data.sql) | "modify the org's own enrichment layer, without touching canonical data" |
| Helper `api.user_can_write_enrichment(object_id)` | [rls_policies.sql:2989](../../../Base%20de%20donnée%20DLL%20et%20API/rls_policies.sql) | TRUE iff permission held **and** the active org has an `object_org_link` with role `publisher`/`contributor` (not `reader`) |

**Consumer read API already implements overlay + fallback** — there is reference code to mirror:

```sql
-- api_views_functions.sql:2463-2543 — "Primary description (by preferred organization with fallback)"
WITH org_desc AS (        -- row where org_object_id = v_prefer_org
  ...
), canonical_desc AS (    -- row where org_object_id IS NULL
  ...
)
SELECT ... FROM ( SELECT * FROM org_desc
                  UNION ALL
                  SELECT * FROM canonical_desc WHERE NOT EXISTS (SELECT 1 FROM org_desc) ) d
LIMIT 1
```

**Frontend already knows the enrichment capability** but discards the distinction:
`getObjectWorkspacePermissions` calls `user_can_write_enrichment` ([object-workspace.ts:3049](../../../bertel-tourism-ui/src/services/object-workspace.ts))
and then flattens it into a generic `canPrepareProposal = directWrite || canonical || enrichment` (line 3067).

**The canonical write already targets `org_object_id IS NULL` explicitly** — the org dimension is already in
the write code, just hardcoded to `null`:
`upsertObjectDescription` builds `{ object_id, org_object_id: null, ... }` and looks up the existing row with
`.is('org_object_id', null)` ([object-workspace.ts:4849-4891](../../../bertel-tourism-ui/src/services/object-workspace.ts)).

**Gap:** the active organisation identity is **not** in the client session
([session-store.ts](../../../bertel-tourism-ui/src/store/session-store.ts) has `role`, `userId`, …, but no org).
Needed only for the **label** of the scope switch; the server stays authoritative for which row is read/written.

## 5. UX design — §04 Descriptions

```
┌ 04 · Descriptions ───────────────────────────────────────────┐
│  [ Canonique ]  [ Mon organisation · OTI du Sud ]   ← scope    │
│  ── FR · EN · Créole ───────────────────────────── ← languages │
│                                                                │
│  Accroche            [count ≤160]                              │
│  Descriptif          [rich, count ≤2000]                       │
│  Descriptif du plan d'accès                                    │
└────────────────────────────────────────────────────────────────┘
```

- **Scope switch** is a 2-state segmented control at the head: `Canonique` and `Mon organisation · <org name>`.
  Below it, the existing `LangTabs` unchanged, then the 3 fields. The two "OTI" boxes are removed.
- **Fallback preview:** in `Mon organisation` scope, a field with no overlay value shows the **canonical text
  greyed as a placeholder** with the hint "Hérité du canonique — saisir pour personnaliser", so the editor
  sees exactly what they are overriding.
- **Gating & default scope:**

  | User capability for this object | Default scope | `Canonique` tab | `Mon organisation` tab |
  |---|---|---|---|
  | Canonical write (publisher / super-admin / owner / demo) | `Canonique` | editable | editable **if** also has `edit_org_enrichment` |
  | Enrichment only (contributor, no canonical write) | `Mon organisation` | **read-only** (sees shared base) | editable |
  | Neither | `Canonique` | read-only | hidden |

  The `Mon organisation` tab is **hidden** when the user has no enrichment capability (reader, or no org link).
- The section completion **pill** reflects the **active scope**'s fill state.

## 6. Technical design

### 6.1 Database — new write RPC (W2)

`api.rpc_write_org_description(p_object_id text, p_payload jsonb)` — `SECURITY DEFINER`, `search_path` pinned.

- Reject unless `api.user_can_write_enrichment(p_object_id)` is TRUE.
- `v_org := api.current_user_org_id()` (server-derived; client value, if any, ignored).
- If `p_payload` has any non-empty text/i18n field → `INSERT ... ON CONFLICT (object_id, org_object_id) DO UPDATE`
  on `object_description`, with `org_object_id = v_org`, `visibility = 'public'` (default), writing only the
  overlay fields: `description_chapo(_i18n)`, `description(_i18n)`, `description_adapted(_i18n)`.
- If `p_payload` is entirely empty → `DELETE FROM object_description WHERE object_id = p_object_id AND
  org_object_id = v_org` (enforces D5).
- Grants: `authenticated`, `service_role`; revoke `PUBLIC`, `anon`.

No other writer touches org-scoped description rows. The existing canonical writer (`upsertObjectDescription`,
`org_object_id IS NULL`) is untouched.

### 6.2 API read — expose both layers to the editor

The editor workspace payload must expose **both** the canonical row (`org_object_id IS NULL`) **and** the
active user's org row (`org_object_id = api.current_user_org_id()`) as **distinct** records — not the collapsed
consumer fallback. RLS already lets a user read their own org-linked rows.

- *Planning verification:* confirm whether the workspace read currently returns all `object_description` rows
  or filters to canonical. If it filters, lift the filter (or add the org row to the payload). Mechanism
  (extend the workspace read function vs. direct table select) is a planning choice; the requirement is that
  both rows reach the parser.

### 6.3 Frontend

- **Parser** (`object-workspace-parser.ts`): `pickDescriptionSource` currently grabs "the first non-empty row"
  (line ~1036). Split rows by `org_object_id`: the canonical row → `descriptions.object` (unchanged shape),
  the active-org row → a new `descriptions.orgOverlay` (same `{ chapo, description, adaptedDescription }`
  translatable-field shape; `null` when no org row exists).
- **Editor state** (`descriptions` module): add `activeScope: 'canonical' | 'org'`, `orgOverlay`,
  `orgName: string | null`, and `canEditOrgEnrichment: boolean`.
- **Permissions** (`getObjectWorkspacePermissions`): stop flattening — surface `canEditOrgEnrichment =
  directWrite || enrichment` on the `descriptions` module access, alongside the existing canonical flags.
- **Section** (`SectionDescriptions.tsx`): render the scope switch; bind the 3 fields to `object` or
  `orgOverlay` per `activeScope`; remove the two "OTI" fields; implement the fallback placeholder; apply the
  gating table from §5.
- **Save** (`object-workspace.ts`): when the org scope is dirty, call `api.rpc_write_org_description`; canonical
  scope keeps using `upsertObjectDescription`. Empty overlay → RPC deletes the row (D5).

### 6.4 Session — active organisation identity (label only)

- New `api.current_user_active_org()` → `{ org_id, org_name }` (joins `current_user_org_id()` to `object.name`).
- `useBootstrapSession` fetches it alongside `current_user_can_edit_objects`; `session-store` gains
  `orgId` / `orgName`; `hydrateFromAuth` carries them. Demo mode stubs a name.
- If unavailable, the scope switch falls back to the plain label "Mon organisation".

## 7. Data flow

```
Read:   workspace read → {canonical row, active-org row} → parser splits → descriptions.{object, orgOverlay}
Edit:   scope switch picks object | orgOverlay → fields bind to the chosen scope × active language
Save:   canonical dirty → upsertObjectDescription (org_object_id NULL)
        org dirty       → api.rpc_write_org_description (server sets org_object_id; deletes if all-empty)
Render: consumer API already does org overlay → fallback canonical (api_views_functions.sql:2463)
```

## 8. Testing

- **RPC:** enrichment-permitted contributor writes/updates/clears their org row; the all-empty case deletes it;
  a user without `edit_org_enrichment` is rejected; the written `org_object_id` always equals the caller's org
  regardless of payload.
- **Parser:** canonical-only object → `orgOverlay` is `null`; object with both rows → two populated scopes,
  correctly separated; i18n maps preserved per scope.
- **Section:** scope switch toggles bindings; "OTI" fields gone; fallback placeholder shows canonical text only
  in org scope on empty fields; gating/default-scope matrix (§5) holds for each capability profile.
- **Save:** canonical edits hit the canonical path unchanged; org edits route to the RPC; clearing all overlay
  fields removes the row.

## 9. Out of scope / flagged for later

- **`description_adapted` label discrepancy:** §04 labels it "Descriptif du plan d'accès"; the data dictionary
  describes `description_adapted` as accessible/FALC text. This spec keeps the **current UI mapping** and only
  flags the discrepancy for a separate documentation/labelling decision.
- **Viewing other orgs' overlays** (read-side comparison) — separate feature.
- **`description_edition`** future use as a genuine print/brochure surface — not handled here.

## 10. Documentation impact (on completion)

- **Propose a new `CLAUDE.md` invariant** (Descriptions enrichment): *Per-organisation description enrichment is
  stored as `object_description` rows scoped by `org_object_id` (canonical = `NULL`, one row per org). Reads use
  overlay → canonical fallback; an empty overlay field falls back to canonical. The **only** writer of org-scoped
  rows is `api.rpc_write_org_description`, gated by `edit_org_enrichment` + `user_can_write_enrichment`; it
  server-derives `org_object_id` from `current_user_org_id()`.*
- **Update `lot1_mapping_decisions.md`** with decisions D1–D6 and the "schema already supported it" finding.
- Update the deferred-items tracker: the "Phase 6 — ORG enrichment RPC" item is delivered by this work for the
  description domain.
```
