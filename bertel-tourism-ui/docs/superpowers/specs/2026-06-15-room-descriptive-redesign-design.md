# Room descriptive redesign (§06 per-room editor)

**Date:** 2026-06-15
**Status:** Design approved (brainstorming) — pending implementation plan
**Scope owner:** d.philippe@otisud.com (PO)

---

## 1. Problem

The per-room editor (`RoomEditModal.tsx`, opened from §06 `BlockHEB`) is a flat stack of
generic text fields. Concrete defects the PO called out:

1. **Équipements** uses the dumb *inline* `ChipMultiSelect` mode — the full catalog renders
   as one long chip wall with **no search**, and selected chips **stay in place** instead of
   floating to the top.
2. **Couchages / Adultes / Enfants / Surface / Unités / Tarif** are **free-text** inputs —
   you can type letters where a number belongs.
3. **Adultes / Enfants** are unrelated free fields — no relationship to the total.
4. **Surface** "doesn't look right" — bare field, no unit.
5. **Configuration lits** is a free-text box — *"people don't know what to write in there."*
6. **Unités** is opaque — it is literally the `object_room_type.total_rooms` column ("how
   many identical rooms of this type") but the label gives no hint.
7. **Tarif** is free-text with no currency.
8. **PMR** accessibility exists (a toggle) but is buried at the bottom.
9. Overall: no grouping, no hierarchy.

Key finding during exploration: **most of this is already solvable with existing
primitives.** `ChipMultiSelect` already has a search + *Sélectionnés/Disponibles* modal mode
(`modalTitle` + `onChange`); `Input` already supports `type="number"` + `prefix`/`suffix`.
Only the **structured bed list** is genuinely new and touches the database.

---

## 2. Decisions (locked with the PO)

| Question | Decision |
|---|---|
| Bed configuration model | **Structured bed list** — rows of `quantity × bed type`, from a real seeded vocabulary. Replaces the free-text field. |
| Bed-list storage | **Normalized link table**, following the existing DB design — a third sibling to `object_room_type_amenity` / `object_room_type_media`. Not JSONB. |
| Adultes / Enfants | **Locked to the total**: total is the anchor; `adultes + enfants` always equals `couchages (total)`. Typing the total pre-fills adultes; editing one rebalances the other. |
| Sequencing | **Two phases.** Phase 1 = frontend polish (no DB). Phase 2 = structured bed list (vocabulary + table + RLS + editor). |

---

## 3. Phase 1 — frontend-only modal redesign (no DB change)

All in `RoomEditModal.tsx` + a few pure helpers in `rooms-utils.ts` (+ tests). No backend,
no parser/saver change — every field below already persists today.

### 3.1 Number inputs + units

Switch these `Input`s to `type="number"` and add suffixes where they carry a unit:

| Field | Column | Treatment |
|---|---|---|
| Couchages (total) | `capacity_total` | `type="number"`, anchors the split (§3.2) |
| Adultes | `capacity_adults` | `type="number"`, locked (§3.2) |
| Enfants | `capacity_children` | `type="number"`, locked (§3.2) |
| Surface | `size_sqm` | `type="number"`, `suffix="m²"` |
| Nb. de chambres (de ce type) | `total_rooms` | `type="number"`, help "chambres identiques" — **relabel of "Unités"** |
| Tarif indicatif | `base_price` | `type="number"`, `suffix="€ / nuit"` (currency from `currency`, default EUR) |

No data-model change — only the input `type`, label, and suffix.

### 3.2 Couchages split — locked to total

New **pure** helpers in `rooms-utils.ts` (unit-tested, no React):

- `applyCouchagesTotal(total)` → `{ capacityTotal, capacityAdults: total, capacityChildren: '0' }`
  (typing the total sets adultes = total, enfants = 0).
- `applyAdults(adults, total)` → clamps `adults` to `[0, total]`, `children = total - adults`.
- `applyChildren(children, total)` → clamps `children` to `[0, total]`, `adults = total - children`.

Invariant: `capacityAdults + capacityChildren === capacityTotal` after any edit. A small
hint reads *« Adultes + enfants suivent toujours le total (n). »* `roomCouchages()` semantics
are unchanged (total is authoritative), so `computeRoomsCapacitySum` and the §07 capacity
sync keep working untouched.

### 3.3 Équipements — switch to the searchable modal mode

Replace the inline `ChipMultiSelect` (lines 49–61) with its **modal mode**:
`modalTitle="Équipements de la chambre"`, `searchPlaceholder`, and `onChange={(next) => set({ amenityCodes: next })}`.
This gives the search box + *Sélectionnés (n)* / *Disponibles* split for free — the exact
component the PO already likes elsewhere. No new component.

### 3.4 Layout — grouped sections

Replace the flat field stack with grouped sections (see the approved mockup):
**Identité** (type · vue · nom) · **Couchages & capacité** · **Configuration des lits**
(Phase 1: keep the existing free-text field here as a placeholder, replaced in Phase 2) ·
**Surface, quantité & tarif** · **Équipements** · **Accessibilité & publication** (PMR
toggle promoted with an icon, next to Publiée).

### 3.5 Phase 1 tests

- `rooms-utils.test.ts`: the three couchages helpers (pre-fill, clamp, rebalance, sum
  invariant, total = 0 edge).
- `RoomEditModal.test.tsx`: number inputs reject non-numeric; surface/tarif suffix present;
  editing adultes rebalances enfants; équipements opens the search modal and replaces the
  selection; PMR toggle present.
- Full FE suite + `tsc` green.

---

## 4. Phase 2 — structured bed list (DB + editor)

### 4.1 Data model — new normalized link table

Mirror `object_room_type_amenity` exactly, plus a `quantity` payload:

```
object_room_type_bed
  id            uuid PK default gen_random_uuid()
  room_type_id  uuid NOT NULL FK → object_room_type(id) ON DELETE CASCADE
  bed_type_id   uuid NOT NULL FK → ref_code(id)   -- domain 'bed_type'
  quantity      int  NOT NULL DEFAULT 1 CHECK (quantity > 0)
  position      int  NOT NULL DEFAULT 1
  -- index on room_type_id (FK hygiene, mirrors amenity link)
```

New `ref_code` domain **`bed_type`** seeded (FR; i18n deferred consistent with other recent
ref codes). Proposed starter vocabulary (final list confirmed in the plan):

| code | label |
|---|---|
| `single` | Lit simple (90 cm) |
| `double` | Lit double (140 cm) |
| `queen` | Lit queen (160 cm) |
| `king` | Lit king (180 cm) |
| `twin_singles` | Lits jumeaux (2 × 90, séparables) |
| `bunk` | Lits superposés |
| `sofa_bed` | Canapé-lit |
| `extra_bed` | Lit d'appoint |
| `baby_cot` | Lit bébé / berceau |
| `mezzanine` | Lit mezzanine |

### 4.2 RLS — follow the room-type-trio invariants (CLAUDE.md)

The new table is an `object_room_type` child, so it inherits the same rules the §55 work
established for `object_room_type_amenity`/`_media`:

- **Read gate** via the parent room, §38 split form:
  `EXISTS(published parent room's object) OR <room's object> IN (SELECT api.current_user_extended_object_ids())`.
- **Per-command write policies** (`canonical_ins/upd/del_object_room_type_bed`) with the
  documented CREATEDBY legacy legs — **never `FOR ALL`**.
- **Qualify outer columns in every policy subquery** (§55 silent-rebinding gotcha — the bug
  that made the link write policies deny-all). Table-qualify `object_room_type_bed.room_type_id`
  in the parent `EXISTS`.
- Read role must be able to **execute** any write predicate (P0.3 gotcha).
- `bed_type` is a new `ref_code` partition target → add the house `ref_*` RLS pair + the
  `(id)`/`(code)` uniques (CLAUDE.md CRM/ref rule).

### 4.3 Deploy integrity (CLAUDE.md "no PROD-only DDL")

`migration_room_type_bed.sql`: table + indexes + RLS + the `bed_type` seed. Fold the DDL
into `schema_unified.sql`, add the seed to `seeds_data.sql`, register the step in
`docs/SQL_ROLLOUT_RUNBOOK.md` + the manifest (next free id — 8-series is full per the live
audit, so a `14x`/`13x` id per the current scheme), and add a CI gate test
`tests/test_room_type_bed_rls.sql` (anon cannot read beds of a draft object; org member can;
write policies are per-command, not FOR ALL). Apply to live via MCP + verify advisors clean.

### 4.4 Read / write / parse wiring

- **Loader** (`object-workspace.ts` `getObjectWorkspaceRoomsModule`, ~2357): add a
  `.from('object_room_type_bed').select('room_type_id, bed_type_id, quantity, position').in('room_type_id', roomIds)`
  query alongside the existing amenity/media link loads; group by `room_type_id`; add a
  `bedTypeOptions` ref load (`ref_code` domain `bed_type`).
- **Saver** (the rooms saver — locate the `object_room_type` writer near the loader):
  reconcile bed rows like the amenity/media links (the rooms saver is a delete-reinsert per
  `rooms-utils` header; beds CASCADE on the parent delete, so reinsert the bed rows after the
  room rows — confirm ordering in the plan).
- **Types/parser** (`object-workspace-parser.ts`): add `beds: { bedTypeId; bedTypeCode; bedTypeLabel; quantity }[]`
  to `ObjectWorkspaceRoomTypeItem` and `bedTypeOptions` to `ObjectWorkspaceRoomsModule`;
  parse them in `parseWorkspaceRoomsModule`; default `[]` in `createRoom`.

### 4.5 `bed_config` free-text column — fate

`object_room_type` has **0 live rows** (§64 audit), so there is no data migration risk.
**Recommendation:** structured `object_room_type_bed` becomes the source of truth; drop
`bed_config` / `bed_config_i18n` editing from the modal and render the structured beds in the
read consumers (drawer `ObjectRoomsPanel`; any public room rendering). Open sub-decision for
the plan: **drop the columns** (clean, 0 rows) vs **keep as an optional one-line "précision
lits" note** (e.g. *« lit bébé sur demande »*) vs **derive a display summary on save**. Drop +
render-structured is the recommended default. Whatever is chosen, **keep the read consumers
aligned** (CLAUDE.md) — the drawer and any card that shows `bedConfig` must switch to the
structured list.

### 4.6 Bed-list editor (frontend)

In the **Configuration des lits** section, replace the free-text field with a row repeater:
`[quantity number] × [bed type select] [remove]` + *« Ajouter un lit »*. The bed-type cell is
a compact house select (`ReferenceSelect`; `SearchSelect` only if the vocabulary grows). New
pure helper to add/remove/reindex bed rows (unit-tested), mirroring the room-row helpers.

### 4.7 Phase 2 tests

- SQL: `test_room_type_bed_rls.sql` (read gate + per-command write, persona-probed).
- FE: bed-row helper specs; `RoomEditModal` bed-list add/remove/edit; parser round-trips
  beds; saver reconcile spec.
- Full FE suite + `tsc` + fresh-apply gate green; live advisor clean.

---

## 5. Out of scope

- §07 capacity metrics, group/pet policy, environment chips (unchanged — they live in §06
  but outside the per-room modal).
- Meeting-room (MICE) modal — untouched this pass.
- Object-level seasonality / audience (separate deferred features).
- `bed_type` i18n beyond FR (deferred, consistent with other new ref codes).
- Explorer **filtering by bed type** — the normalized model enables it later, but no filter
  UI is built in this pass.

---

## 6. Verification before "done"

- **Phase 1:** `npm test` + `tsc` green; run the app, open a room — number fields reject
  letters, adultes/enfants rebalance to the total, équipements opens the searchable picker,
  PMR is prominent. Screenshot proof.
- **Phase 2:** fresh-apply gate green; live RLS persona-verified (anon cannot read beds of a
  draft object); add a room with `2 × lit simple, 1 × lit double`, save, reload, confirm the
  beds round-trip and surface in the drawer. Advisor clean.

---

## 7. Decision-log / memory follow-ups

- `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md` (next §): the room-modal
  redesign, the locked couchages split, the `object_room_type_bed` table + `bed_type`
  vocabulary, the RLS pattern reused, and the `bed_config` retirement decision.
- Update the SQL manifest/runbook + READMEs for the new migration (deploy-integrity rule).
- Refresh `db-graph-out` after the migration (new table/policies/RPC surface).
