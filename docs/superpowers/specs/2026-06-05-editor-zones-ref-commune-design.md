# Editor §41 (T1b zones) — `object_zone` authoring: `ref_commune` + §16 INSEE multi-select (2026-06-05)

**Status:** design approved (d.philippe@otisud.com, 2026-06-05). Branch `feat/editor-zones` off `master`.
**Sits in:** §24 P1.2 / §25 P0 (stop write-traps); the **zones half** of T1b, split from §40 (sub-places). Closes the last §16 write-trap path. Decision log: **§41**.
**Risk class:** frontend **+ backend** (new table + seed + RLS + FK + read-path change) ⇒ full **deploy-integrity** (migration folded into `schema_unified.sql` + fresh-apply manifest + CI test + READMEs; applied to live via MCP, documented). Unlike §40, this is NOT frontend-only.

---

## 1. Goal

Make the §16 "communes desservies / zone d'intervention" authorable end-to-end: a real INSEE-commune multi-select that persists to `object_zone`, sourced from a seeded commune reference. (The static commune chips were removed from §05 in T1a; this restores the capability properly, in §16.)

## 2. Live baseline (verified 2026-06-05)

- `object_zone` = **0 rows** ⇒ adding a FK is greenfield-safe.
- `ref_commune` does **not** exist.
- `object_location.code_insee` is **unpopulated** (can't derive codes from data); `city` shows only Sud communes (Le Tampon, Saint-Joseph, Entre-Deux, Saint-Philippe) → seed needs the authoritative INSEE list, not the data.
- Parser already reads `location.zoneCodes` from `raw.object_zone[].insee_commune` (`object-workspace-parser.ts:2994`), but `get_object_resource` never emits `object_zone` ⇒ today it loads empty.

## 3. Backend

### 3.1 `migration_ref_commune.sql` (idempotent; folded into `schema_unified.sql`)
- **Table** `public.ref_commune`: `insee_code VARCHAR(5) PRIMARY KEY`, `name TEXT NOT NULL`, `region_code VARCHAR(3) NOT NULL DEFAULT 'RE'`, `position INTEGER NOT NULL DEFAULT 0`, `is_active BOOLEAN NOT NULL DEFAULT true`. (Generic enough to extend beyond Réunion; MVP seeds Réunion.)
- **Seed** the **24 Réunion communes** (INSEE COG, codes `97401`–`97424`), `ON CONFLICT (insee_code) DO UPDATE` (idempotent). Authoritative list (fr.wikipedia COG, cross-checked vs the platform's `city` values — Le Tampon=97422, Saint-Joseph=97412, Entre-Deux=97403, Saint-Philippe=97417): 97401 Les Avirons · 97402 Bras-Panon · 97403 Entre-Deux · 97404 L'Étang-Salé · 97405 Petite-Île · 97406 La Plaine-des-Palmistes · 97407 Le Port · 97408 La Possession · 97409 Saint-André · 97410 Saint-Benoît · 97411 Saint-Denis · 97412 Saint-Joseph · 97413 Saint-Leu · 97414 Saint-Louis · 97415 Saint-Paul · 97416 Saint-Pierre · 97417 Saint-Philippe · 97418 Sainte-Marie · 97419 Sainte-Rose · 97420 Sainte-Suzanne · 97421 Salazie · 97422 Le Tampon · 97423 Les Trois-Bassins · 97424 Cilaos. `position` = ascending by code; `is_active = true`.
- **RLS**: enable + the standard `ref_*` pub-read / admin-write pair (mirror `migration_rls_ref_and_bak_cleanup.sql`): `SELECT USING (true)` to `anon`/`authenticated`; write to platform admin only.
- **FK**: `ALTER TABLE object_zone ADD CONSTRAINT object_zone_insee_commune_fkey FOREIGN KEY (insee_commune) REFERENCES ref_commune(insee_code)` — safe (0 rows). `IF NOT EXISTS`-guarded (drop-if-exists then add, idempotent).

### 3.2 Deploy-integrity (CLAUDE.md: no PROD-only DDL)
Fold the DDL into `schema_unified.sql`; add `migration_ref_commune.sql` to `ci_fresh_apply.sql` + `.github/workflows/sql-fresh-apply.yml` (a `test_ref_commune.sql` step asserting: table exists, 24 active rows, FK present, RLS enabled) + `docs/SQL_ROLLOUT_RUNBOOK.md` + both READMEs. Apply to live via MCP `apply_migration` (documented here ⇒ not drift). Manifest slot: an `8x` ref step (after `rls_policies.sql`; ref tables have no object dependency) — exact number set at impl time against the current manifest.

### 3.3 `get_object_resource` (read-path; `api_views_functions.sql`)
Add to the resource JSON:
- `object_zone`: the object's zone rows (`insee_commune`, `position`) — so the parser's existing `location.zoneCodes` populates.
- `commune_options`: the active `ref_commune` catalog (`insee_code`, `name`, `position`) for the picker.
Apply to live + `NOTIFY pgrst, 'reload schema'`. Backward-compatible (additive keys).

## 4. Frontend (§16)

- **Parser** (`object-workspace-parser.ts`): add `location.zoneOptions: {code, label}[]` from `raw.commune_options`; `zoneCodes` already parsed. (Extend the `location` module type.)
- **UI** (`SectionPlaces.tsx`): a "Communes desservies" `ChipSet` multi-select rendering `location.zoneOptions`, marking selected those in `location.zoneCodes`; toggling updates `location.zoneCodes` via `editor.replaceModule('location', …)` (marks the **`location`** module dirty). Placed in §16 (per the approved split). Archetype-gated like the rest of §16 (render when relevant).
- **Persistence** (`object-workspace.ts`): the **location** saver gains a zones step — pure `buildZonesPayload(zoneCodes) → {zones:[{insee_commune, position}]}` then `save_object_places` (zones-only payload: the RPC's `zones` branch is a complete model — no nested data, so its DELETE-then-reinsert is safe here, unlike the places branch §40 avoided). Gated by `canEditZones` (already a location perm; set it true for the canonical writer, mirroring `canEditPlaceDescriptions`).

## 5. Testing (TDD)
- **SQL** `tests/test_ref_commune.sql` (CI gate): 24 active rows; FK present; RLS enabled; a sample code (97422 = Le Tampon) resolves.
- **Frontend**: pure `buildZonesPayload` specs (codes→payload, order, empty); `SectionPlaces.test.tsx` zone specs (options render; toggling a commune updates `location.zoneCodes` + marks `location` dirty). `tsc` + full suite green.
- **Live smoke**: after deploy, set 2 communes on one object → reload reflects them; `object_zone` rows present + FK-valid.

## 6. Risks
- **FK window**: add the FK while `object_zone` is empty (verified). If any non-seeded code is later written, the FK rejects it — which is correct (the picker only offers seeded codes).
- **Destructive zones replace**: `save_object_places({zones})` deletes+reinserts ALL `object_zone` for the object. Safe — zones carry no nested data and the UI round-trips the full set (`location.zoneCodes`). Sending `{zones:[]}` clears them (intended when the user deselects all).
- **`canEditZones`**: currently `false` for everyone; flip to the canonical-writer rule (as §40 reasoned for place writes) so the control isn't inert. Honest-controls: if a role lacks it, the multi-select must be disabled/absent, not silently dropped.

## 7. Out of scope
- Sub-place locations/media authoring (separate). Multi-region communes (seed Réunion only). Explorer zone facet (the filter exists server-side; UI facet is separate).

## 8. References
- §40 (`lot1_mapping_decisions.md`) — the sub-places half (this is the zones half).
- `api.save_object_places` zones branch (`object_workspace_safe_write_rpcs.sql:1215`).
- `migration_rls_ref_and_bak_cleanup.sql` — the ref-table RLS pattern to mirror.
- CLAUDE.md → "Editor — no silent write-traps" + "Deploy integrity (no PROD-only DDL)".
