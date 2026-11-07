# Object Editor — Structured Fields Alignment & UX Fix

- **Date:** 2026-05-21
- **Status:** Design — awaiting review
- **Scope:** `bertel-tourism-ui` object editor (`/objects/[objectId]/edit`, 22-section registry)
- **Related:** `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md` (§17 full-page editor)

---

## 1. Context & problem

The full-page object editor (`src/features/object-editor/`) has several sections where structured,
reference-backed data is presented incorrectly: blank/missing selectors, free-text inputs where the
database holds reference values, redundant toggles for non-existent columns, and pet-policy editing
duplicated across sections. The **database model is sound** — the gap is in the editor UI wiring and,
in two cases, a missing storage column.

This work aligns seven editor areas with the existing data model and improves their UX. It does **not**
redesign the editor.

> **Terminology:** "§10 Accessibility" means the **tourism accessibility data editor** — Tourisme &
> Handicap labels, disability-type coverage, accessible equipment, adapted descriptions for visitors
> with disabilities. It is **not** HTML/ARIA/WCAG/RGAA editor-UI accessibility, which is out of scope.

## 2. Goals / non-goals

**Goals**
- Replace free inputs and blank/missing selectors with selectors bound to existing reference data.
- Replace incorrectly-modelled toggles with the correct control.
- Consolidate pet-policy editing into one canonical place.
- Give media a focused add/edit modal over a compact grid.
- Give tags an explicit "add" action and drag-and-drop ordering with persisted order.
- Rework §10 Accessibility into a structured, categorized editor mirroring §11 Sustainability's logic.
- Keep the existing architecture, visual direction, and per-module save behaviour.

**Non-goals**
- No editor redesign; no new editor framework; no changes to the other 14 sections.
- No change to the workspace read/save contract beyond the two approved migrations and one payload enrichment.
- No data entry (e.g. populating accessibility amenities) — this work only makes that data editable.
- HTML/ARIA/WCAG editor-UI accessibility.

## 3. Locked decisions

| # | Decision | Choice |
|---|----------|--------|
| D1 | Room type storage | **Migrate** — add `object_room_type.room_type_id → ref_code_room_type` |
| D2 | Pet policy canonical home | **§05 type block** (`BlockHEB`) — removed from §07 and §VIS |
| D3 | Tag display order | **Migrate** — add `tag_link.position` |
| D4 | Tag drag-and-drop mechanism | **`@dnd-kit`** (`@dnd-kit/core` + `@dnd-kit/sortable`) |
| D5 | §08 Classifications free-text bug | **In scope** — fixed in the same pass as §10 |
| D6 | Multi-room editing surface | **Per-room edit modal** (consistent with the new media modal) |

## 4. Schema findings (verified — `schema_unified.sql` + live DB)

| Domain | Storage | Reference source | Migration |
|--------|---------|------------------|-----------|
| Contacts | `contact_channel(kind_id, role_id, value, is_public, is_primary, position)` | `ref_code_contact_kind`, `ref_contact_role` | none |
| Rooms | `object_room_type(code, name, …, view_type_id)` | `ref_code_room_type` (unlinked), `ref_code_view_type` | **M1** |
| Room equipment | `object_room_type_amenity`, `meeting_room_equipment` | `ref_amenity` (scope `object`/`both`), `ref_code_meeting_equipment` | none |
| Media | `media(media_type_id, title, credit, description, visibility, kind, is_main, position, *_i18n)` | `ref_code_media_type` | none |
| Pet policy | `object_pet_policy(object_id PK, accepted BOOLEAN NOT NULL, conditions TEXT)` | — | none |
| Tags | `ref_tag(slug, name, color, position, extra)`, `tag_link(tag_id, target_*, extra)` | `ref_tag` library | **M2** |
| Classifications / Accessibility | `object_classification(scheme_id, value_id, subvalue_ids[], status, awarded_at, valid_until, note)` | `ref_classification_scheme`, `ref_classification_value` | none |

**Pet policy** — the DB has only `accepted` + `conditions`. The frontend's `petPolicy.hasPolicy` is a
parser-fabricated flag (`Object.keys(record).length > 0`) with **no DB column** behind it.

**Tags** — `ref_tag.color` exists (DB-backed color). `tag_link` has **no `position`** column, so
per-object display order is not currently persisted (the save RPC does delete-then-insert with no order).

**Accessibility (live DB)** — one scheme `LBL_TOURISME_HANDICAP` (`display_group='accessibility_labels'`,
`selection='single'`). Values: `granted` (the label) + 4 children `granted_motor/_hearing/_visual/_cognitive`
(`metadata.kind='disability_type_subvalue'`). Disability types = canonical set of **4: motor, hearing,
visual, cognitive**. Accessible equipment = **43 `acc_*` amenities** in the `accessibility` family, each
with `extra.disability_types[]`. Adapted description = `object_description.description_adapted(_i18n)`.

## 5. Migrations

Two migrations, each in its own file under `Base de donnée DLL et API/`, with a header block stating
purpose + rollback. Both idempotent (`ADD COLUMN IF NOT EXISTS`), nullable/defaulted so existing rows
are unaffected.

### M1 — `object_room_type.room_type_id`

```sql
ALTER TABLE IF EXISTS object_room_type
  ADD COLUMN IF NOT EXISTS room_type_id UUID REFERENCES ref_code_room_type(id) ON DELETE SET NULL;
```

- **Why:** enables a DB-backed room-type selector. Follows the exact pattern of the existing
  `object_room_type.view_type_id → ref_code_view_type(id)` column on the same table.
- **Rollback:** `ALTER TABLE object_room_type DROP COLUMN IF EXISTS room_type_id;`
- **Existing rows:** `room_type_id = NULL` → modal shows "type non défini"; the free `name` is retained.
- **Paired changes:** rooms parser exposes `roomTypeOptions` (ref domain `room_type`) and room-item
  `roomTypeId/roomTypeCode/roomTypeLabel`; rooms save serializer writes `room_type_id`.

### M2 — `tag_link.position`

```sql
ALTER TABLE IF EXISTS tag_link
  ADD COLUMN IF NOT EXISTS position INTEGER NOT NULL DEFAULT 0;
```

- **Why:** persist per-object tag display order so drag-and-drop ordering survives reload.
- **Rollback:** `ALTER TABLE tag_link DROP COLUMN IF EXISTS position;`
- **Existing rows:** `position = 0` → first load falls back to insertion order; first save assigns positions.
- **Paired changes:** `api.save_object_workspace_tags` writes `position` from the payload array index
  (`jsonb_array_elements(…) WITH ORDINALITY`); the workspace tag read orders by `position`.

## 6. Shared primitives

Extend the existing `src/features/object-editor/primitives/` vocabulary — minimal additions, no refactor:

- **`ReferenceSelect`** — wraps `primitives/Select` for `WorkspaceReferenceOption[]`; always renders the
  current value even if stale (no blank), optional placeholder and "— none —" entry.
- **`ChipMultiSelect`** — extracts the existing chip-toggle-from-options pattern (selected codes ⇄ options).
- **`SortableList`** — `@dnd-kit/sortable` wrapper reusing the existing `.rep-row__handle` drag affordance.
- **`EditorModal`** — thin wrapper over `src/components/ui/dialog.tsx` (Radix Dialog) for the media and
  room/meeting-room modals; works on a draft copy with Save/Cancel.

## 7. Per-domain design

### 7.1 Contacts §04 — `SectionContacts.tsx`
- Add the missing **role selector**: a `ReferenceSelect` bound to `contacts.roleOptions` (`ref_contact_role`),
  with a nullable "— Aucun rôle —" entry. Wire `roleId/roleCode/roleLabel` on change.
- Keep the **kind selector**; make it render a stale `kindCode` instead of blank; add a placeholder.
- Repeater columns: handle · kind · role · value · public/internal · delete.
- Verify `saveObjectWorkspaceContacts` serializes `role_id` (nullable); fix if it drops it.
- **No migration.**

### 7.2 Rooms §05 — `BlockHEB.tsx` (+ room equipment)
- **Compact room rows:** name, type chip, capacity, units, base price, PMR badge, edit, delete.
- **RoomEditModal** (opens on row click) — all per-room fields, fixing the "room #0 only" amenity bug:
  - **Type** — `ReferenceSelect` on `roomTypeOptions` (`ref_code_room_type`, via **M1**).
  - **Nom / libellé** — free `Input` (kept — the property's own label, e.g. "Chambre Vue Lagon"; `name` is `NOT NULL`).
  - **Vue** — `ReferenceSelect` on `viewTypeOptions` (`ref_code_view_type`; column already exists, selector was missing).
  - Capacities, surface, bed config (+ translations), description (+ translations), base price, accessible toggle, published toggle.
  - **Équipements** — `ChipMultiSelect` on `rooms.amenityOptions` (`ref_amenity`), edited **per room** (replaces the broken index-sliced "thirds").
- **Meeting rooms** — compact rows + a **MeetingRoomEditModal**: name, surface, capacities, and the missing
  **Équipements** `ChipMultiSelect` on `meetingRooms.equipmentOptions` (`ref_code_meeting_equipment`).
- **Migration:** M1 only (room type). Room view + all equipment need none.

### 7.3 Media §06 — `SectionMedia.tsx`, `media-items.ts`, new `MediaEditModal`
- Replace the three parallel renderings (photo grid / documents repeater / "detailed" repeater) with **one
  compact grid**: thumbnail (or type badge for non-visual), media type, title-or-filename, cover star, edit, delete.
- **Add** → `MediaEditModal` (create); **click existing media** → `MediaEditModal` (edit) with a larger preview.
- Modal fields, friendly labels (no raw column names): media **type** `ReferenceSelect` (`ref_code_media_type`),
  URL/file, title (+ FR/EN/CRE translations), description = alt text (+ translations), credit, visibility
  (`public`/`private`/`partners`), cover toggle, published toggle. Width/height are trigger-controlled — hidden.
- Modal edits a draft copy; Save commits via `replaceModule('media', …)`, Cancel discards; the global save bar persists.
- **No migration.**

### 7.4 Pet policy — canonical home §05 `BlockHEB.tsx`
- In `BlockHEB` "Politiques d'accueil": **one** toggle **"Animaux acceptés"** (`petPolicy.accepted`); when on,
  a **conditional** textarea **"Conditions d'accueil des animaux"** (`petPolicy.conditions`).
- **Remove** the `hasPolicy` toggle ("Politique animaux renseignée") — no DB column backs it.
- **Remove** the entire "Animaux" field from §07 `SectionCapacity.tsx` (group policy stays in §07).
- **Remove** the dead no-op "Animaux" `TriState` from `BlockVIS.tsx`.
- Drop `hasPolicy` from `ObjectWorkspacePetPolicyForm` and the parser; `capacity-policies` save writes only
  `accepted` + `conditions` to `object_pet_policy`.
- **Trade-off (accepted):** pet policy is then editable only on objects that render `BlockHEB` (accommodation
  archetype). Existing `object_pet_policy` rows on non-accommodation objects keep their data but have no editor surface.
- **No migration.**

### 7.5 Tags §09 — `SectionTags.tsx`
- Add an explicit **"Ajouter un tag"** button opening a **library picker** (popover) listing `tags.library`
  (`ref_tag` rows) not already displayed. The editor never creates `ref_tag` rows — picker references existing tags only.
- Replace the ▲▼ arrows with **drag-and-drop** (`@dnd-kit` `SortableList`) on the `displayed` list.
- **Persist order** via **M2** — array index → `tag_link.position`; `save_object_workspace_tags` and the read updated.
- **Color** — keep the per-row color control, but persist the per-object `colorVariant` to `tag_link.extra.color_variant`
  (not the global `ref_tag.color`), so editing one object's tag does not mutate every other object using that tag.
  This requires flipping the parser read precedence to `tag_link.extra.color_variant` first, then `ref_tag.color`
  as fallback (today `ref_tag.color` wins, which would mask the per-object value).
- `derived` tags stay read-only. Light chip-style polish.

### 7.6 Classifications §08 + Accessibility §10

Both consume the `distinctions` workspace module and share one bug: distinction **values are edited as free text**.

**§08 `SectionClassification.tsx`** — replace the free-text `valueLabel` `Input` with a `ReferenceSelect`
over the scheme's `valueOptions` (`ref_classification_value` for that `scheme_id`). "Add" = pick scheme → pick value.
Keep status + dates. Drop the vestigial disability column (non-accessibility schemes don't use it).

**§10 `SectionAccessibility.tsx`** — rework into a structured editor mirroring §11 Sustainability's logic,
adapted to the real model. A §11-style stat header plus three stacked blocks:

1. **Label Tourisme & Handicap** — a structured record (not a free-text repeater): toggle/select the label
   (single-selection scheme `LBL_TOURISME_HANDICAP`, value `granted`). When held: a **4-way disability-type
   multiselect** (Moteur / Auditif / Visuel / Mental → `object_classification.subvalue_ids`), **statut**,
   **date d'obtention**, **valable jusqu'au**, **note**. All values from reference data.
2. **Équipements & services accessibles** — the direct §11 analogue: the 43 `acc_*` amenities in **4 collapsible
   panels grouped by disability type**, each amenity a chip-toggle with per-panel counts. An amenity serving
   several disability types (e.g. `acc_guide_dog_welcome` — visual + motor) appears under each relevant panel;
   it is one underlying `object_amenity` row, so toggling it in any panel selects/deselects it everywhere.
   Writes `object_amenity` via the existing `characteristics` save path.
3. **Description adaptée** — keep the existing multilingual textarea (`object_description.description_adapted`).

- Replace the fragile `isAccessibilityFamily()` string heuristic with the real `accessibility` family code.
- **Payload enrichment (not a migration):** expose `ref_amenity.extra.disability_types` on accessibility-family
  amenity options so block 2 can group by disability type.
- **No migration.** Label uses the `distinctions` save path; equipment uses the `characteristics` save path.

## 8. Data flow & save

Every touched module already has a save path via `useSaveObjectWorkspaceModuleMutation` →
`saveObjectWorkspace*` (`object-workspace.ts`). This work changes input controls and, for tags/rooms,
extends the serializers and one RPC (`save_object_workspace_tags`). The global save bar and per-module
dirty tracking are unchanged. The drawer stays view-only (per `lot1_mapping_decisions.md` §17).

## 9. Sequencing (phases)

- **Phase 0 — Foundations:** add `@dnd-kit`; build shared primitives; apply M1 + M2; wire workspace
  read/save for `room_type_id`, `tag_link.position`, and accessibility-amenity `disability_types`.
- **Phase 1 — Contacts §04 + Pet policy** (§05/§07/§VIS consolidation).
- **Phase 2 — Rooms §05** — room + meeting-room edit modals, equipment selectors.
- **Phase 3 — Media §06** — compact grid + `MediaEditModal`.
- **Phase 4 — Tags §09** — add button, DnD, order persistence.
- **Phase 5 — Classifications §08 + Accessibility §10.**

Each phase: TDD; update affected `*.test.tsx`; regression-check §11 Sustainability.

## 10. Verification checklist (from the brief)

- [ ] Existing object with contacts loads kind + role correctly; new contact saves both.
- [ ] Existing room loads type (post-M1) + view; room equipment selectable per room from reference data.
- [ ] Meeting-room equipment selectable from reference data.
- [ ] Pet policy appears in exactly one place (§05); details textarea only when "accepté"; §07/§VIS cleaned.
- [ ] Media: existing media opens in the edit modal; new media added with type/title/description; metadata updates persist.
- [ ] Tags: add-from-library works; drag-and-drop reorders; order persists across reload (M2).
- [ ] Accessibility: T&H label + disability types + equipment render from structured data and save/reload correctly.
- [ ] §08 distinction values selected from reference data, not free text.
- [ ] No §11 Sustainability regression; no TypeScript errors; no console errors from missing reference data; no broken RPC calls.

## 11. Risks & backward compatibility

- **M1:** existing rooms get `room_type_id = NULL` → "type non défini"; `name` preserved. No data loss.
- **M2:** existing `tag_link` rows get `position = 0`; order normalised on first save.
- **Removing `hasPolicy`:** zero DB impact (never had a column).
- **Pet policy** now has an accommodation-only editor surface (D2) — documented trade-off.
- **§08/§10:** input-control change only; the `object_classification` write contract is unchanged.
- **`@dnd-kit`:** one new dependency; small bundle cost.

## 12. Out of scope / future

- The other 14 editor sections; any editor redesign.
- Populating accessibility amenity data (data entry — this work only enables it).
- New i18n strings beyond labels on touched controls (tracked separately if needed).
- HTML/ARIA/WCAG editor-UI accessibility.

## 13. Documentation follow-up

On completion, record in `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md`: the two migrations
(M1, M2), the pet-policy canonical-location decision (D2), the `hasPolicy` removal, and the tag
color/order persistence model. Propose a CLAUDE.md note if the pet-policy "accommodation-only surface"
becomes a recurring invariant.
