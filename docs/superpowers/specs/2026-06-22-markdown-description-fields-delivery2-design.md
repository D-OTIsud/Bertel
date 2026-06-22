# Markdown across all description fields — Delivery 2 (type-specific prose)

**Date:** 2026-06-22
**Status:** Design — awaiting review
**Predecessor:** [`2026-06-21-markdown-all-description-fields-design.md`](2026-06-21-markdown-all-description-fields-design.md) (Delivery 1 = `object_description` family, shipped §106)
**Decision log:** to be recorded as §107+ in `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md`

---

## 1. Problem

§106 (Delivery 1) made the `object_description` family Markdown-canonical: the editor authors Markdown via `MarkdownEditor`, the API serves a stripped plain value on the historic key plus a `*_md` sibling, and every flat reader is wrapped in `api.strip_markdown`. But it covered **only** the §04 description family.

The PO reports the visible symptom: the **Accroche** and **Descriptif** behave differently (one has a reduced toolbar), and the **Descriptif du plan d'accès** (§02) has no formatting at all — "it was supposed to be treated across the board for description-type data." The accroche/descriptif difference is intentional (teaser = inline subset; body = block subset) but was applied to only two fields. Five public-prose fields were explicitly deferred to "Delivery 2" (decision log §106, line 2758): `room_types / menus / places / iti_stage / location.direction`.

This spec delivers those five, in the **two-tier, applied-consistently** model the PO chose, with **public-facing prose only** (internal notes stay plain).

## 2. Goals / Non-goals

**Goals**
- Author Markdown in all five public description fields, with the same two-tier toolbar model as §04 (long bodies = block; short teasers = inline).
- Honor the §106 invariant for each: strip the flat key on every flat read path; emit a `*_md` sibling on every rich read path; never strip an editor-load leg.
- No raw-Markdown leaks into cards, exports (InDesign / GPX / KML / GeoJSON / selection-CSV), or full-text search.

**Non-goals (this delivery)**
- **No public drawer rendering.** None of these five fields is rendered in `ObjectDetailView` today; building those panels is a separate UI feature. We emit `*_md` (data-ready, per the invariant) but make **zero** changes to `object-detail-parser.ts` or `ObjectDetailView.tsx`.
- Internal notes (CRM, group/pet/tariff/legal) — stay plain `<Textarea>`.
- `strip_markdown_jsonb` — **not needed** (every flat reader resolves a single language or reads a plain text column; nothing strips all languages at once).
- `*_normalized` generated columns — **not needed** (none of the five tables carries one; the only `*_normalized` columns live on `object_description` / `media` / `ref_tag`).
- Stage **name** Markdown, `bed_config` Markdown, `object_place_description` operational notices (`description_offre_hors_zone`, `sanitary_measures`) — out of prose scope (parity with how the object-level family leaves them un-stripped).

## 3. Scope table

| # | Field | Table · column | i18n? | Tier | Editor surface |
|---|---|---|---|---|---|
| B | Plan d'accès | `object_location.direction` | no (plain `text`) | **block** | §02 section field — drop-in |
| C | Room description | `object_room_type.description` (+ `description_i18n`) | yes | **block** | `RoomEditModal` — drop-in (modal already) |
| D | Dish description | `object_menu_item.description` | no (plain `text`) | **inline** | `DishEditModal` — drop-in (modal already) |
| E | Sub-place description | `object_place_description.description` (+ `description_i18n`) | yes | **block** | §16 repeater row — **new modal cell** |
| F | ITI stage description | `object_iti_stage.description` | no (editor model is single `string`) | **inline** | `BlockITI` **and** §16 rows — **new modal cell** |

## 4. The §106 contract, applied per field

The reusable infrastructure (all confirmed present):
- `api.strip_markdown(text)` — scalar, `IMMUTABLE STRICT`, `api_views_functions.sql:429`. For an i18n column: `api.strip_markdown(api.i18n_pick(col_i18n, lang, 'fr'))` (or `COALESCE(i18n_pick(...), scalar_col)`).
- `MarkdownEditorLazy` with `variant: 'block' | 'inline'` — `src/components/markdown/MarkdownEditorLazy.tsx`.
- `AdaptedDescriptionField.tsx` — the modal-hosting-editor template to generalize for repeater rows.

**Load-bearing reason the strip is mandatory:** `selection-export.ts:33` writes `JSON.stringify(d.raw ?? {})` — the **entire** `get_object_resource.raw` payload — into a CSV cell. So the instant any of these fields stores Markdown, raw `**asterisks**` leak into that export unless the flat keys are stripped **at the SQL source**. Fixing `get_object_resource` also fixes `get_object_with_deep_data` (inherits the `object` block verbatim) and the selection CSV (consumes `.raw`).

### B — Plan d'accès (`object_location.direction`)
- **Type:** plain `text` (`schema_unified.sql:1066`); no i18n. Wrap form is `api.strip_markdown(ol.direction)` — **not** `i18n_pick`.
- **Emit sites (two, both rich):** `get_object_resource` address block (`api_views_functions.sql:~2735`, main object location) **and** places[].location block (`~3891`, sub-place location). Each: override flat `direction` with stripped value + add `direction_md` raw. Missing the sub-place site leaks for sub-places.
- **No flat/card/map/InDesign reader** selects `direction` today (verified: the `object_location` column subset everywhere else excludes it) — so the only fixes are the two resource sites. deep_data + selection-CSV inherit.
- **Editor round-trip constraint (§5):** the editor loads its base from the resource flat key → needs a raw leg. Since `direction` is non-i18n, the editor reads `direction_md` (raw) as its base; public reads stripped `direction`.
- **Frontend:** `SectionLocation.tsx:171` `<Textarea>` → `<MarkdownEditorLazy variant="block">`; editor parser `parseLocationRecord` reads `record.direction_md ?? record.direction`.

### C — Room description (`object_room_type.description` + `description_i18n`)
- **Type:** `description text` + `description_i18n jsonb` (`schema_unified.sql:2390-2391`).
- **Rich leak:** `get_object_resource` room_types block is `to_jsonb(rt) - 'object_id'` (`~3773`) → carries **both** raw `description` and raw `description_i18n`. Fix = `(to_jsonb(rt) - 'object_id' - 'description_i18n') || jsonb_build_object('description', api.strip_markdown(COALESCE(api.i18n_pick(rt.description_i18n,lang,'fr'), rt.description)), 'description_md', COALESCE(api.i18n_pick(rt.description_i18n,lang,'fr'), rt.description))`. Subtracting `description_i18n` is required or the raw per-language Markdown still leaks.
- **Standalone getter:** `get_object_room_types` (`~7340`, currently uncalled but PostgREST-executable) — same strip + `description_md`.
- **No editor collision:** the editor loads room types via a **separate direct PostgREST select** (`object-workspace.ts:2577`), not the resource — so the resource block is public-only and free to strip.
- **No card/export/search reader** touches room description.
- **Frontend:** `RoomEditModal.tsx:202` `<Textarea>` → `<MarkdownEditorLazy variant="block">`.

### D — Dish description (`object_menu_item.description`)
- **Type:** plain `text` (`schema_unified.sql:5524`); no i18n. Wrap is `api.strip_markdown(mi.description)`.
- **Rich leak:** `get_object_resource` menus[].items[] block is `to_jsonb(mi) - 'menu_id'` (`~4338`) → override flat + `description_md`.
- **Flat leak 1 — render line:** `api_views_functions.sql:~4980` `LEFT(mi.description,50)` → `LEFT(api.strip_markdown(mi.description),50)` (strip **before** `LEFT`, else a truncated `**bo` leaves a dangling marker).
- **Flat leak 2 — full-text search (TWO source copies):** `string_agg(DISTINCT mi.description)` feeds the tsvector while the adjacent `object_description` fields are already stripped — the asymmetry is the bug. Wrap in `schema_unified.sql:~4667` **and** `migration_global_search_document.sql:~143`. Requires a **one-time search-document recompute** for existing rows (trigger only fires on write).
- **No editor collision:** editor loads menus via a separate direct select (`object-workspace.ts:2980`).
- **Frontend:** `DishEditModal.tsx:56` `<Textarea>` → `<MarkdownEditorLazy variant="inline">`.

### E — Sub-place description (`object_place_description`)
- **Type:** description family with i18n siblings (`schema_unified.sql:1422-1446`): `description`, `description_chapo` (inline tier), `description_mobile`, `description_edition`, `description_adapted`. In-scope = these five prose fields. **Out:** `description_offre_hors_zone`, `sanitary_measures` (operational; un-stripped at object level too), `visibility`, `position`.
- **Single rich leak:** `get_object_resource` places block builds descriptions via `to_jsonb(pd) - 'place_id'` (`~3879`) → dumps every text column raw. Replace with an explicit per-field override: strip each flat key + add `*_md` sibling.
- **Editor collision (§5):** the **same** places block feeds the editor loader (`parseDescriptionScope`, reads `record.description` scalar **and** `record.description_i18n`) **and** the (unrendered) drawer parser **and** deep_data. The editor needs a raw base → keep `description_i18n` raw (editor map already reads it) and expose a raw base leg for the scalar; strip the public `description` + add `description_md`. Exact key naming resolved in the plan, gated by the round-trip test.
- **Frontend:** `SectionPlaces.tsx:141` `<Textarea>` in the repeater row → **`MarkdownCellField`** (block) — the compact-preview-+-modal pattern (only `description` is surfaced in §16; the other family fields are carried by the editor scope but not authored here).

### F — ITI stage description (`object_iti_stage.description`)
- **Type:** plain `text` editor-side (`ObjectWorkspaceItineraryStageSummary.description: string`); the DDL has a `description_i18n` jsonb the editor does not surface. Flat exporters read the **plain** column. Tier = inline; there is no second/longer prose field on the stage.
- **Rich leak:** `get_object_resource` itinerary stages block `to_jsonb(st) - 'object_id'` (`~4140`) → override flat `description` + `description_md` (resolve i18n before strip for the flat/_md pair; leave `name`/`name_i18n` untouched, out of scope).
- **Flat leaks — three exports** read the plain column directly: `build_iti_track` KML `<description>` (`~809`) and GPX `<desc>` (`~872`), `export_itinerary_gpx` waypoint `<desc>` (`~7641`), `get_itinerary_track_geojson` `properties.description` (`~7781`). Wrap each in `api.strip_markdown(...)`. `export_itineraries_gpx_batch` (`~7691`) delegates to `export_itinerary_gpx` → inherits, no own change. `build_iti_track` is also embedded in the resource `itinerary_details.track` → fixed once.
- **Editor:** loads via `parseItinerary` (resource) **then** a direct-select override (`object-workspace.ts:3154`, reads raw) — so stripping the resource stages block is safe (override re-supplies raw); the round-trip test confirms it.
- **Frontend:** edited in **two** surfaces — `BlockITI.tsx:126` (`<Input>`) and `SectionPlaces.tsx:39` (§16) — both migrate together to **`MarkdownCellField`** (inline).

## 5. Editor round-trip constraint (the one architectural subtlety)

`direction` and `place.descriptions[].description` load their editor round-trip base **from `get_object_resource`'s flat key** (`object-workspace-parser.ts:1325`, `toTranslatableField(record.description, record.description_i18n)`). Stripping that key would silently delete the author's Markdown on the next save. Mirror D1, which kept `canonical_description` / `org_description` raw beside the stripped public `description`:

- **`direction`** (non-i18n): editor reads `direction_md` (raw) as base; public reads stripped `direction`.
- **`place.descriptions[].description`**: keep `description_i18n` raw (editor map); expose a raw base leg; strip the public `description` + add `description_md`.

Room / menu editors load via **separate direct PostgREST selects**, so their resource blocks are public-only — no raw leg needed. ITI stage has a direct-select **override** that re-supplies raw after the (stripped) resource parse.

**Guard:** every phase ships a Jest round-trip test — author `**bold**` → save → reload → field still contains `**bold**` (raw) — and a SQL test asserting the public key is stripped and `*_md` carries raw.

## 6. New frontend primitive — `MarkdownCellField`

For compact repeater rows (sub-places, ITI stages) a full WYSIWYG toolbar does not fit a grid cell. Generalize `AdaptedDescriptionField` into a reusable cell:

- Props: `{ value: string; onChange: (md: string) => void; variant: 'block' | 'inline'; ariaLabel: string; disabled?: boolean; emptyLabel?: string }`.
- Renders a compact read-only preview (plain text, truncated) + a "Modifier" button → `EditorModal` hosting `MarkdownEditorLazy`. Save commits into the row's draft (the page save bar persists it).
- Lives in `src/features/object-editor/widgets/MarkdownCellField.tsx`; unit-tested in isolation.
- Sub-places: pass the translatable value via `readTranslatableField` / `updateTranslatableField` (already wired in `SectionPlaces`). ITI stages: plain string.

Drop-in fields (B/C/D) use `MarkdownEditorLazy` directly — no new primitive.

## 7. Phasing (each phase independently shippable, backend-before-frontend)

| Phase | Deliverable | Backend | Frontend | Tests |
|---|---|---|---|---|
| **A** | `MarkdownCellField` primitive | — | new widget | Jest unit |
| **B** | Plan d'accès | resource ×2 sites strip/`direction_md`; raw editor leg | `SectionLocation` swap (block); parser reads `direction_md` | SQL strip/_md; Jest round-trip |
| **C** | Room description | resource room_types block + `get_object_room_types` getter | `RoomEditModal` swap (block) | SQL; Jest round-trip |
| **D** | Dish description | resource menus block + render-line + search ×2 + **recompute backfill** | `DishEditModal` swap (inline) | SQL strip/_md + search-vector clean; Jest round-trip |
| **E** | Sub-places | resource places block strip/`*_md`/raw-leg | `SectionPlaces` → `MarkdownCellField` (block) | SQL; Jest round-trip |
| **F** | ITI stages | resource stages block + 3 flat exports | `BlockITI` + §16 → `MarkdownCellField` (inline) | SQL (incl. GPX/KML/GeoJSON clean); Jest round-trip |

Deploy order per phase: apply SQL to live (folded into `api_views_functions.sql` / `schema_unified.sql` + manifest entry + runbook) → `NOTIFY pgrst` → deploy frontend. Follows the §106 large-function deploy recipe (`.tmp_pgapply/apply_range.cjs`).

## 8. Testing strategy

- **SQL (per field):** a `test_markdown_<field>.sql` asserting (a) the public flat key returns text with no Markdown markers, (b) the `*_md` sibling returns the raw Markdown, (c) for `to_jsonb` blocks, the raw i18n column is **absent** from the emitted object. Siblings of `tests/test_strip_markdown.sql` / `test_markdown_descriptions_api.sql`.
- **Search (phase D):** assert the tsvector for a dish with `**bold**` indexes `bold`, not `**bold**`, after the recompute backfill.
- **Jest round-trip (per field):** author Markdown in the editor → serialize the save payload → re-parse a resource fixture carrying the raw value → field still raw. Plus a `MarkdownCellField` interaction test (open modal, edit, save → onChange called with Markdown).
- **Regression:** the full FE suite + `tsc` + `next build` green per phase; Supabase advisors clean (only the expected §36 DEFINER notices).

## 9. Risks & mitigations

| Risk | Mitigation |
|---|---|
| `to_jsonb(row)` blocks leak the raw flat key even after adding `*_md` | Always **subtract + override** the flat key and **subtract** the raw `*_i18n` column; SQL test asserts both. |
| Stripping the public key breaks the editor round-trip for `direction` / places | Raw editor leg (§5) + Jest round-trip test gate. |
| Menu search keeps indexing raw Markdown for existing rows | One-time recompute backfill in phase D; search test. |
| Two ITI stage editor surfaces drift | Migrate `BlockITI` + §16 together in phase F; shared `MarkdownCellField`. |
| A `get_object_resource` live/source shadow (the §36 `cards_batch` lesson) | Verify source==live for `get_object_resource` before assuming; deploy via the documented recipe. |
| Truncated Markdown leaves dangling markers in render line | Strip **before** `LEFT(...,50)`. |

## 10. Open implementation details (resolved in the plan, not blockers)
- Exact raw-leg key names for the places block (reuse `description_i18n` + a `*_raw`/canonical scalar vs. a new key).
- Whether to resolve i18n before strip for the ITI stage flat/_md pair, given exports currently read only the plain column (do **not** introduce `i18n_pick` where the reader never resolved language before — would change export behavior).
