# §09 « Tags & étiquettes » — Editor redesign (design spec)

**Date:** 2026-06-15
**Status:** design approved (PO decisions locked below) — pending spec review → implementation plan
**Author:** design council (4 proposals × 4 adversarial judges + synthesis) + independent verification against live source
**Scope:** object-editor section §09, the tag Add/Create modal, the shared Explorer result card, map hover, and two gated SQL RPCs. **Out of scope:** the fiche/detail header (deferred), tag catalog merge/rename/retire admin tooling (deferred), tag-name i18n (FR-only for MVP).

> **⚠ Ground-truth corrections (2026-06-15, after backend deploy — these OVERRIDE the body below):**
> 1. **Color is a HEX `#rrggbb`, not a 5-named-variant set.** Live verification found 16/16 `ref_tag.color` rows are hex (a designed palette: `#8b5cf6`, `#f97316`, …); the `teal/orange/neutral/outline/green` variants existed only in the frontend parser's *fallback*. So: `create_tag`/`set_tag_color` validate `^#[0-9a-f]{6}$` (create defaults `#64748b`); the parser's `colorVariant` becomes a `color` **hex string** (`resolveTagColor`/`normalizeTagColorVariant` repurposed to validate hex); the modal picker offers **preset hex swatches** (+ keep the tag's current hex selected); the card/map chip renders `background: <hex>` inline with a contrast-computed text color (NOT `tagChipClasses(variant)` → theme tokens). One `tagChipStyle(hex)` helper feeds section chip + swatches + `ResultCardView` + `MapPanel`.
> 2. **Manifest id is 14h** (14e–14g were already taken). The 3-site order change is live; a **4th** site (`get_object_resource`) was found and is fixed in source but deploy-deferred (pending beds change).
> 3. **Backend is DONE + deployed + verified** (transient + behavioral + advisors) as of this date. Remaining: CI SQL test files, then the frontend phases (2–4).

---

## 1. Problem

§09 is the colored *display-tag layer* meant to appear on Explorer cards and the fiche header. Today it is chunky **and** largely fictional:

- The 5-column table (chip · color `<Select>` · source `<Select>` · ✕) and its hardcoded mock preview reference CSS classes (`.tag`, `.tag.<variant>`, `.tag-preview`) that **do not exist in the live `bertel-tourism-ui/src/styles.css`** (only in `docs/Bertel_design_exemple/`). In production the chips render as unstyled, colorless, run-together text — exactly the user's screenshot.
- **Reordering is a silent no-op on the card.** §09 saves `tag_link.position` (per-object), but every card path orders tags by the *global* `ref_tag.position`.
- **Per-tag color is inert on every Explorer surface.** The result card renders label chips neutral (`border + surface2`); the map hover renders them uniform teal. Neither reads the chosen color.
- **`source` is dead metadata** — saved to `tag_link.extra.source`, read by nothing.
- The card shows only **one** label chip + `+N`, drawn from a deduped blend in which **classification labels precede §09 tags**, so the curated tag layer usually doesn't appear at all.
- **There is no way to create a tag.** `ref_tag` is a global catalog with `admin_tag_write FOR ALL` RLS; no create RPC exists.

## 2. Locked decisions (product owner)

| # | Decision |
|---|----------|
| D1 | **Dedup-guarded tag creation.** An editor with write access to the object may create a new **global** `ref_tag` from the modal when no existing tag matches. Insert-or-return-existing on the normalized name. |
| D2 | **Make order + color real** on the Explorer result card **and** the map hover. |
| D3 | **Color is global per tag** — one color stored on `ref_tag.color`, consistent on every Explorer surface. *Not* per-object. Recoloring a tag changes it everywhere (gated). |
| D4 | **Card budget = category tag + ≤1 colored §09 tag + ≤1 neutral classification + `+N`.** |
| D5 | **Defer the fiche header** to a follow-up (reuse the same color helper). |
| D6 | **Remove `source`** end-to-end (inert). FR-only tag names accepted for MVP. Catalog merge/rename tooling deferred. |

## 3. Verified ground truth (load-bearing facts checked against live source this session)

- The tag aggregate is inlined as a `tags` CTE in **three** live sites, all ordering by `COALESCE(t.position, 999999)` and emitting `'color', t.color`:
  1. `api.get_object_tags_compact` — `api_views_functions.sql` ~L1635 (feeds `get_object_resource` + map fn)
  2. `get_object_cards_batch` baseline CTE — `api_views_functions.sql` ~L1995
  3. `get_object_cards_batch` **live DEFINER override** — `migration_cards_batch_authorize_definer.sql` ~L238 (manifest 8j; the §36 authorize-once body that actually serves the Explorer grid)
  A one-site edit silently leaves the main results grid unfixed.
- Because **D3 (global color)** keeps color on `ref_tag.color`, which all three CTEs **already emit** as `t.color`, the SQL change for D2 reduces to a single clause at each site: `ORDER BY COALESCE(t.position…)` → `ORDER BY COALESCE(tl.position…)`. No SQL color change is needed; "color real on the card" is purely a **frontend render** change.
- `ref_tag.name_normalized` is a `STORED GENERATED` column = `immutable_unaccent(lower(name))` (`schema_unified.sql:664`). `idx_ref_tag_slug_ci` is a **non-unique** index (`:4043`), and `ref_tag.slug` UNIQUE is case-sensitive. Dedup (D1) must therefore key on `name_normalized`, **not** `ON CONFLICT(slug)`.
- `api.slugify` does **not** exist — derive the slug inline.
- `ref_tag` RLS = `pub_tag_read USING(true)` + `admin_tag_write FOR ALL` (admin/service_role only); `anon`/`authenticated` hold SELECT grants only. Creating/recoloring a tag therefore requires a new `SECURITY DEFINER` gated RPC.
- The existing saver `save_object_workspace_tags` already writes `tag_link` rows + `position` from array order (label deliberately not persisted; must stay `== ref_tag.name`).
- Mirror modal: `features/object-editor/widgets/ClassificationEditModal.tsx` (open/mode/draft/onClose/onSave + searchable picker; the house pattern).

## 4. Design

### 4.1 Compact tag list (the section)
Rewrite `SectionTags.tsx` as a single-line-per-tag draggable list (reuse `SortableList`, `getId = tagId || slug`):

```
[ ⠿ grip │ «Label» colored chip │ Couleur ▾ │ ✕ ]
```

- **Reorder** = drag only (array order → `tag_link.position`, already wired in the saver). Header pill keeps `${displayed.length} affichée(s)`.
- **Color** is shown read-only on the chip and edited via the `Couleur` button → modal (`mode='color'`). Because color is global (D3), the modal states clearly that the change applies to the tag **everywhere**.
- **Removed:** the inline color `<Select>`, the `source` `<Select>` and the whole `source` concept, the `derived[]` block (parser always returns `[]`), and the fake `TagPreviewCard`.
- One honest helper line under the title: *« Les classements certifiés (étoiles, labels) priment sur ces tags dans l'espace limité de la carte. »*
- **Permissions:** when `tags` is not writable (`disabledReason`), the list renders read-only (chips + order visible; add/recolor/remove hidden) with the stated reason — never an enabled-but-discarded control.

### 4.2 Add / Create / Edit-color modal (`TagPickerModal`)
One widget mirroring `ClassificationEditModal`, opened by **« Ajouter un tag »** (`mode='add'`) and the per-row `Couleur` button (`mode='color'`, opens straight on the swatches):

- **Search existing** — input filters `module.library` by `normalizeForCompare`(name/slug); matches render as selectable colored chips; already-displayed tags hidden.
- **Create (D1)** — a *« Créer « X » »* affordance appears only when the trimmed query has **no normalized match**. Calls `createWorkspaceTag(objectId, name, colorVariant)` → `api.create_tag` → returns canonical `{tagId, slug, name, color}` (insert-or-return-existing on `name_normalized`). Appended to `library` + `displayed`. If a case/accent near-duplicate exists, the modal surfaces the **existing canonical name** so the editor consciously picks it.
- **Pick color** — 5 fixed swatches (teal/orange/neutral/outline/green) rendered as the real chips. On create it seeds `ref_tag.color`; in `mode='color'` it calls `setWorkspaceTagColor(objectId, tagId, color)` → `api.set_tag_color` (**immediate, global**) and optimistically updates the item.
- **Errors surface inline.** `demoMode` short-circuits create/recolor to a local optimistic update with a visible *« non persisté (démo) »* note.
- **id reconciliation:** the canonical `tagId` from create is merged into `editor.draft.tags` so a later reorder/save never re-sends an empty `tagId`.

> **Write-path split (clean separation):** *global* mutations (create tag, set tag color) are **immediate gated RPC calls**; the *per-object* mutation (which tags are displayed + their order) is the existing **deferred section save** (`tag_link` rows). A created-but-unsaved tag is an orphan in the catalog — acceptable (dedup prevents spam; catalog GC deferred, same posture as media orphans).

### 4.3 Live real-card preview (single source of truth)
Extract a pure presentational **`ResultCardView`** from `ResultsList.tsx` (the 116px body: image, open dot, title, city·taxonomy·capacity line, chip row). `ResultsList` keeps store/selection/drawer wiring; the §09 preview renders the same component with `interactive={false}`.

The preview builds a draft `ObjectCard` via a pure, tested `buildPreviewCardFromDraft(editor.draft)`:
- `name`/`type` ← §01, `location.city` ← §02
- `tags` ← `module.displayed` mapped to `ObjectCardTag[]` (`color = colorVariant`)
- `badges` + `taxonomy` ← §08 classifications, mapped into the **exact** `ObjectCardBadge{kind:'classification'|'ranking'}` / `ObjectCardTaxonomy` shapes `normalizeExplorerCard` consumes (mandatory — this is what makes the preview show a classification winning the neutral slot).

It runs that draft through the **real `normalizeExplorerCard`** and renders `ResultCardView` at the **same width context** as a live card so truncation/`+N` collapse match production. Zero drift is structural.

### 4.4 Card + map: render color & honor order (D2/D3/D4)
- **Types:** keep `card.labels: string[]` **unchanged**; add additive optional `card.tagChips: {label, color, slug}[]` to `ObjectCard` (`ObjectCardTag.color` already exists — no widening). Blast radius minimized.
- **`normalizeExplorerCard`:** remove `...readLabels(card.tags)` from the `labels` blend (so a §09 tag never double-renders as colored chip **and** neutral label, nor inflates `+N`); compute `tagChips` from `card.tags` (color + `tag_link` order, deduped by normalized label) and **cross-dedupe against the surviving `labels`**.
- **`ResultCardView` chip row (D4):** `[category/bucket tag] → [≤1 colored §09 tagChip, first] → [≤1 neutral classification/label] → [+N counting both]`, inside the fixed 116px `flex-nowrap` row. The category tag and the neutral classification slot keep priority on truncation.
- **CSS:** define one `tagChipClasses(variant)` helper over the existing Tailwind soft tokens already proven by `categoryTagClasses` (`bg-teal-soft text-teal-2`, `bg-orange-soft text-orange-2`, `bg-surface2 text-ink-2`, `border border-line` for outline; verify `green-soft` or fall back). Consumed by the section chip, modal swatches, `ResultCardView`, **and** `MapPanel` — one vocabulary, no resurrected fiction CSS. `cssVariantFromColor()` runs every RPC-emitted color through `normalizeTagColorVariant` so an unknown value never breaks render.
- **Map hover (`MapPanel`):** thread a colored structure into `hoverPopupState` (today it snapshots `card.labels.slice(0,2)` into an intermediate object — not a 1-line prop); render `tagChips` first then fill from `labels`, deduped, with per-variant backgrounds replacing the hardcoded `--teal-soft`. List and map tell the same color story.

### 4.5 Backend (RPCs + the 3-site order change)

**`api.create_tag` (NEW, `SECURITY DEFINER`):**
```
api.create_tag(p_anchor_object_id text, p_name text, p_color text DEFAULT 'neutral') RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public, api, internal, extensions
```
- Gate **first**, fail-closed: `IF NOT api.user_can_write_object_canonical(p_anchor_object_id) THEN RAISE insufficient_privilege` (42501). Same per-object canonical-write predicate as every other write path.
- `REVOKE ALL FROM PUBLIC, anon; GRANT EXECUTE TO authenticated, service_role`. Self-trust only `p_name`/`p_color`; never a caller-supplied id.
- Inline slug: `v_norm := immutable_unaccent(lower(btrim(p_name)))`; `v_slug := trim('-' from regexp_replace(v_norm, '[^a-z0-9]+', '-', 'g'))`. `RAISE 22023` on empty name/slug.
- **Dedup on `name_normalized`:** `SELECT … FROM ref_tag WHERE name_normalized = v_norm LIMIT 1` → return if found. Else `INSERT … VALUES (gen_random_uuid(), v_slug, btrim(p_name), p_color, created_by = (select auth.uid()), …)`; on `unique_violation` re-SELECT by `name_normalized` and return (idempotent under concurrency).
- `gen_random_uuid()` (restricted-search_path invariant); set `created_by` explicitly (DEFINER runs as owner).

**`api.set_tag_color` (NEW, `SECURITY DEFINER`):**
```
api.set_tag_color(p_anchor_object_id text, p_tag_id uuid, p_color text) RETURNS jsonb
```
- Same gate + grants. Validates `p_color ∈ {teal,orange,neutral,outline,green}` (else 22023). `UPDATE ref_tag SET color = p_color, updated_by = (select auth.uid()) WHERE id = p_tag_id` → returns the row. Global write (D3).

**Order change (D2) — three sites in lockstep:** at each of the three `tags` CTEs, change `ORDER BY COALESCE(t.position, 999999), t.name, t.slug` → `ORDER BY COALESCE(tl.position, 999999), t.name, t.slug`. Color already emitted as `t.color`. Pure column reads on an already-joined set; `STABLE` preserved; anon/hot-path safe.

**Deploy integrity:** fold both RPCs into `api_views_functions.sql`; edit the three CTEs in place; author `migration_tags_create_and_order.sql` listed in `docs/SQL_ROLLOUT_RUNBOOK.md` at the next free manifest id (**14e**). Apply live via MCP + `NOTIFY pgrst`; verify the fresh-apply gate green (incl. the `get_object_cards_batch` DEFINER override). The `0028/0029` advisor flag on the new DEFINER RPCs is expected (§36 precedent).

### 4.6 Data-model / contract diffs
- `ObjectWorkspaceTagItem`: drop `source`; `ObjectWorkspaceTagSource` + `normalizeTagSource` deleted. `colorVariant` now mirrors `ref_tag.color` (global). `resolveTagColor` simplifies to `normalizeTagColorVariant(refTag.color)` (drop the `tag_link.extra` override path).
- `ObjectWorkspaceTagsModule`: drop `derived`.
- Loader: color from `ref_tag.color`; `library` + `displayed` unchanged otherwise.
- Saver `save_object_workspace_tags` payload: `[{ tag_id, slug }]` in display order (no `extra` color/source). Existing `tag_link.extra.{color_variant,source}` rows are ignored going forward (harmless, rewritten/empty on next save; no migration).
- `domain.ts`: `ObjectCard.tagChips?: {label, color, slug}[]` (additive). `card.labels` untouched → `ResultsList` neutral path, dashboard counts, all label tests keep passing.
- New services: `createWorkspaceTag(objectId, name, colorVariant)`, `setWorkspaceTagColor(objectId, tagId, color)` (both with `demoMode` short-circuit).

## 5. Testing (TDD, RED → GREEN)
- **SQL `test_create_tag.sql`:** dedup returns existing on case/accent variant (via `name_normalized`); concurrent same-name → one row; denied persona / anon / read-only → 42501; empty name → 22023; `created_by` set.
- **SQL `test_set_tag_color.sql`:** updates `ref_tag.color` globally; denied persona → 42501; invalid color → 22023.
- **SQL `test_object_tags_compact.sql`:** asserts `get_object_cards_batch` (the DEFINER body, not only the per-card fn) emits `tl.position` order — a single-site edit fails RED.
- **Jest/RTL:** parser/saver drop `source`; `normalizeExplorerCard` emits `tagChips`, a §09 tag is not double-rendered, a classification still wins the neutral slot; `ResultCardView` colored-chip-before-neutral + overflow at real width; `MapPanel` color reaches the hover, deduped; section reorder persists order; swatch → `set_tag_color`; create appends + reconciles id + surfaces near-dup name; `buildPreviewCardFromDraft` reproduces the classification-wins-slot outcome; permissions disable-with-reason.
- **Verify:** full FE suite + `tsc` clean; SQL green in fresh-apply; live smoke (create → reorder → recolor → confirm Explorer grid + map hover reflect order+color for an anon read); advisor clean.

## 6. Build phases (ordered, TDD)
0. **RED (SQL):** write `test_create_tag.sql`, `test_set_tag_color.sql`, `test_object_tags_compact.sql`. Run → fail.
1. **GREEN (backend):** add `api.create_tag` + `api.set_tag_color`; change the `ORDER BY` at all three `tags` CTEs in lockstep. Fold into `api_views_functions.sql`; author `migration_tags_create_and_order.sql` at manifest **14e**; apply live + `NOTIFY pgrst`; fresh-apply gate + SQL tests green.
2. **RED→GREEN (types/service):** drop `source`/`derived`; simplify `resolveTagColor`; add `createWorkspaceTag` + `setWorkspaceTagColor` (+ demoMode + id reconciliation). Jest.
3. **RED→GREEN (card/map color):** add `tagChipClasses()`/`cssVariantFromColor()`; add `ObjectCard.tagChips`; in `normalizeExplorerCard` remove `readLabels(card.tags)` from the blend, compute + cross-dedupe `tagChips`; extract `ResultCardView` and refactor `ResultsList` to delegate; render ≤1 colored tag first + ≤1 neutral classification + `+N`; thread colored chips into `MapPanel`, deduped. Update explorer-card unit tests' expected labels.
4. **RED→GREEN (section + modal + preview):** rewrite `SectionTags` (compact `SortableList`, swatch, no inline selects/source/derived); build `TagPickerModal` (search + dedup-guarded create + color swatches + "changes everywhere" note); add `buildPreviewCardFromDraft` → real `normalizeExplorerCard` → `ResultCardView` at live width. RTL.
5. **Verify:** full FE suite + `tsc`; SQL green in fresh-apply; live smoke; advisor clean. Update `lot1_mapping_decisions.md` (new §: create_tag/set_tag_color gating, three-site `tl.position`, `tagChips` type, `name_normalized` dedup, global-color model) + deferred tracker; propose a CLAUDE.md note for the "tag aggregate inlined in 3 sites — change in lockstep" invariant.

## 7. Risks & mitigations
- **Deploy-integrity (highest):** the `ORDER BY` change must land in all three sites in lockstep → asserted by `test_object_tags_compact.sql` at the `get_object_cards_batch` level.
- **Dedup correctness (D1):** must key on `name_normalized` (case-sensitive slug UNIQUE + non-unique CI index won't dedup variants). Client "no match → create" compare uses the same normalized form.
- **Catalog pollution:** any object editor can grow the global `ref_tag` list feeding Explorer facets; dedup stops exact normalized repeats, not semantic variants ('plage'/'plages'); new tags default `neutral`. No merge/retire UI (deferred).
- **Global recolor side-effect (D3):** recoloring from object A changes the tag on every object; modal copy states this; gated on per-object canonical write.
- **DEFINER RPCs are PostgREST-callable out-of-band:** gates must be bulletproof + asserted by denied-persona SQL tests.
- **Preview fidelity:** `buildPreviewCardFromDraft` must map §08 into the real `badges`/`taxonomy` shapes and render at live width, or the "honest preview" re-lies.
- **Orphan tags:** create-then-not-save leaves an unlinked `ref_tag` (deduped, harmless; catalog GC deferred).

## 8. Deferred (logged, with PO sign-off)
- Fiche/detail header color (reuse `tagChipClasses`).
- Admin tag merge/rename/retire tooling + orphan GC.
- Tag-name i18n (`name_i18n`); FR-only for MVP.
