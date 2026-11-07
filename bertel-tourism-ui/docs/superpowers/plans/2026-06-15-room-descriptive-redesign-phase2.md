# Room descriptive redesign — Phase 2 (structured bed list) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the free-text "Configuration lits" with a structured `quantity × bed type` list, backed by a normalized `object_room_type_bed` link table and a seeded `bed_type` vocabulary, surfaced in the §06 room editor and the public/drawer read path.

**Architecture:** Mirror the existing `object_room_type_amenity` sibling exactly (composite-PK link table, §38 split read gate, per-command canonical write, all outer columns table-qualified per §55) plus a `quantity` payload. `bed_type` is a real FK-target `ref_code` partition (`ref_code_bed_type` + `UNIQUE(id)`/`UNIQUE(code)` + the ref RLS pair). One self-contained idempotent `migration_room_type_bed.sql` is the live vehicle; each piece is also folded into `schema_unified.sql` / `rls_policies.sql` / `seeds_data.sql` so a fresh DB reproduces it (the migration is then a no-op on fresh). Frontend: `bedTypeOptions` + a `beds[]` field on the room item, loaded/saved via direct PostgREST like amenity/media links, and a row-repeater editor.

**Tech Stack:** Supabase Postgres (RLS, partitioned `ref_code`), Next.js + React + TypeScript, Jest + RTL. SQL CI gate: `Base de donnée DLL et API/ci_fresh_apply.sql` + `.github/workflows/sql-fresh-apply.yml`. Spec: `docs/superpowers/specs/2026-06-15-room-descriptive-redesign-design.md` §4.

**Working dirs:** SQL files under `Base de donnée DLL et API/`; frontend under `bertel-tourism-ui/`. Frontend commands: `npx jest <path>`, `npm run test:run`, `npm run typecheck`.

**Live-apply policy:** the SQL is validated transiently first (apply + `ROLLBACK` via Supabase MCP `execute_sql` in a transaction, or against a local `supabase start`), then applied to live via `mcp__supabase__apply_migration`, then verified with `get_advisors` + a persona read/write probe. No live DDL without that verification.

---

## File map

**SQL (create/modify):**
- Create `Base de donnée DLL et API/migration_room_type_bed.sql` — self-contained idempotent migration (partition + seed + i18n + table + RLS).
- Create `Base de donnée DLL et API/tests/test_room_type_bed.sql` — fresh-apply gate test.
- Modify `schema_unified.sql` — add `ref_code_bed_type` partition + uniques (with the other partitions ~L341/436/481) and `object_room_type_bed` table + index (after `object_room_type_amenity` ~L2408).
- Modify `rls_policies.sql` — add the read + per-command write policies for `object_room_type_bed` (after the `object_room_type_amenity` block ~L1276) and the `ENABLE ROW LEVEL SECURITY` + ref-partition RLS pair.
- Modify `seeds_data.sql` — add the `bed_type` INSERT (after the `room_type` block ~L890) + i18n rows (in the `ref_code_translations` CTE ~L1457+).
- Modify `ci_fresh_apply.sql` — add step `14c` after L126.
- Modify `docs/SQL_ROLLOUT_RUNBOOK.md` — add the `14c` manifest row after `14b`.
- Modify `.github/workflows/sql-fresh-apply.yml` — add a `test_room_type_bed.sql` step after the seed-drift test step.

**Frontend (modify):**
- `src/services/object-workspace-parser.ts` — `ObjectWorkspaceRoomBed` type, `beds` on the item, `bedTypeOptions` on the module, parse defaults.
- `src/services/object-workspace.ts` — loader bed-link query + `bedTypeOptions` ref load; saver bed reconcile.
- `src/features/object-editor/sections/blocks/rooms-utils.ts` — pure bed-row helpers + `buildBedRows`.
- `src/features/object-editor/widgets/RoomEditModal.tsx` — bed-list editor (replaces the free-text placeholder).
- `src/features/object-editor/sections/blocks/BlockHEB.tsx` — `createRoom` default `beds: []`.
- Read consumer: `api_views_functions.sql` `get_object_resource` room_types JSON + the drawer parser/panel (final task).

---

## Task 1: `migration_room_type_bed.sql` + fresh-apply test (write the SQL, TDD via the gate)

**Files:**
- Create: `Base de donnée DLL et API/migration_room_type_bed.sql`
- Create: `Base de donnée DLL et API/tests/test_room_type_bed.sql`

- [ ] **Step 1: Write the migration**

Create `migration_room_type_bed.sql`:

```sql
-- migration_room_type_bed.sql
-- §70 (Phase 2 — room descriptive): structured bed list per room type.
-- Adds: (1) ref_code 'bed_type' FK-target partition (+ uniques + house RLS pair), (2) ~10
-- seeded bed-type codes + en/es i18n, (3) object_room_type_bed (room → bed type + quantity)
-- with the §38 split read gate + per-command canonical write (outer columns qualified, §55).
-- IDEMPOTENT (IF NOT EXISTS / ON CONFLICT DO NOTHING / DROP POLICY IF EXISTS). Folded into
-- schema_unified.sql / rls_policies.sql / seeds_data.sql ⇒ NO-OP on a fresh DB.
-- PREREQUISITE: schema_unified.sql (object_room_type, ref_code) + rls_policies.sql
--   (api.current_user_extended_object_ids, api.user_can_write_object_canonical).

BEGIN;

-- 1. ref_code 'bed_type' FK-target partition (mirror ref_code_room_type: partition + id/code uniques + house RLS pair).
CREATE TABLE IF NOT EXISTS ref_code_bed_type PARTITION OF ref_code FOR VALUES IN ('bed_type');
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_bed_type_id   ON ref_code_bed_type (id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_bed_type_code ON ref_code_bed_type (code);
ALTER TABLE ref_code_bed_type ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pub_ref_code_read"   ON ref_code_bed_type;
CREATE POLICY "pub_ref_code_read"   ON ref_code_bed_type FOR SELECT USING (true);
DROP POLICY IF EXISTS "admin_ref_code_write" ON ref_code_bed_type;
CREATE POLICY "admin_ref_code_write" ON ref_code_bed_type FOR ALL USING (auth.role() IN ('service_role','admin'));

-- 2. Seed bed_type vocabulary (FR canonical) — deduped by uq_ref_code_bed_type_code.
INSERT INTO ref_code (domain, code, name, description, position) VALUES
  ('bed_type','single','Lit simple (90 cm)','Lit une place', 1),
  ('bed_type','double','Lit double (140 cm)','Lit deux places standard', 2),
  ('bed_type','queen','Lit queen (160 cm)','Grand lit deux places', 3),
  ('bed_type','king','Lit king (180 cm)','Très grand lit deux places', 4),
  ('bed_type','twin_singles','Lits jumeaux (2 × 90 cm)','Deux lits simples séparables', 5),
  ('bed_type','bunk','Lits superposés','Lits superposés', 6),
  ('bed_type','sofa_bed','Canapé-lit','Canapé convertible', 7),
  ('bed_type','extra_bed','Lit d''appoint','Lit d''appoint sur demande', 8),
  ('bed_type','baby_cot','Lit bébé / berceau','Lit bébé ou berceau', 9),
  ('bed_type','mezzanine','Lit mezzanine','Lit en mezzanine', 10)
ON CONFLICT DO NOTHING;

WITH bed_type_translations(code, name_en, name_es) AS (
  VALUES
    ('single','Single bed (90 cm)','Cama individual (90 cm)'),
    ('double','Double bed (140 cm)','Cama doble (140 cm)'),
    ('queen','Queen bed (160 cm)','Cama queen (160 cm)'),
    ('king','King bed (180 cm)','Cama king (180 cm)'),
    ('twin_singles','Twin beds (2 × 90 cm)','Camas gemelas (2 × 90 cm)'),
    ('bunk','Bunk beds','Literas'),
    ('sofa_bed','Sofa bed','Sofá cama'),
    ('extra_bed','Extra bed','Cama supletoria'),
    ('baby_cot','Baby cot','Cuna'),
    ('mezzanine','Mezzanine bed','Cama en altillo')
)
UPDATE ref_code rc
SET name_i18n = COALESCE(rc.name_i18n, '{}'::jsonb) || jsonb_build_object('en', btt.name_en, 'es', btt.name_es)
FROM bed_type_translations btt
WHERE rc.domain = 'bed_type' AND rc.code = btt.code;

-- 3. object_room_type_bed link table (mirror object_room_type_amenity + quantity/position payload).
CREATE TABLE IF NOT EXISTS object_room_type_bed (
  room_type_id UUID NOT NULL REFERENCES object_room_type(id) ON DELETE CASCADE,
  bed_type_id  UUID NOT NULL REFERENCES ref_code_bed_type(id) ON DELETE CASCADE,
  quantity     INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  position     INTEGER NOT NULL DEFAULT 1,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (room_type_id, bed_type_id)
);
CREATE INDEX IF NOT EXISTS idx_room_type_bed_bed_type_id ON object_room_type_bed(bed_type_id);

ALTER TABLE object_room_type_bed ENABLE ROW LEVEL SECURITY;

-- §38 split read gate (mirror read_object_room_type_amenity); outer column table-qualified (§55).
DROP POLICY IF EXISTS "read_object_room_type_bed" ON object_room_type_bed;
CREATE POLICY "read_object_room_type_bed" ON object_room_type_bed
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM object_room_type rt
      JOIN object o ON o.id = rt.object_id
      WHERE rt.id = object_room_type_bed.room_type_id
        AND rt.is_published IS TRUE AND o.status = 'published')
    OR room_type_id IN (
      SELECT rt.id FROM object_room_type rt
      WHERE rt.object_id IN (SELECT api.current_user_extended_object_ids()))
  );

-- Per-command canonical write (mirror canonical_*_object_room_type_amenity): canonical-write OR legacy CREATEDBY leg; outer columns qualified (§55). NEVER FOR ALL.
DROP POLICY IF EXISTS "canonical_ins_object_room_type_bed" ON object_room_type_bed;
CREATE POLICY "canonical_ins_object_room_type_bed" ON object_room_type_bed FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM object_room_type rt WHERE rt.id = object_room_type_bed.room_type_id AND api.user_can_write_object_canonical(rt.object_id))
  OR EXISTS (SELECT 1 FROM object_room_type rt JOIN object o ON o.id = rt.object_id WHERE rt.id = object_room_type_bed.room_type_id AND o.created_by = (select auth.uid())));
DROP POLICY IF EXISTS "canonical_upd_object_room_type_bed" ON object_room_type_bed;
CREATE POLICY "canonical_upd_object_room_type_bed" ON object_room_type_bed FOR UPDATE USING (
  EXISTS (SELECT 1 FROM object_room_type rt WHERE rt.id = object_room_type_bed.room_type_id AND api.user_can_write_object_canonical(rt.object_id))
  OR EXISTS (SELECT 1 FROM object_room_type rt JOIN object o ON o.id = rt.object_id WHERE rt.id = object_room_type_bed.room_type_id AND o.created_by = (select auth.uid()))) WITH CHECK (
  EXISTS (SELECT 1 FROM object_room_type rt WHERE rt.id = object_room_type_bed.room_type_id AND api.user_can_write_object_canonical(rt.object_id))
  OR EXISTS (SELECT 1 FROM object_room_type rt JOIN object o ON o.id = rt.object_id WHERE rt.id = object_room_type_bed.room_type_id AND o.created_by = (select auth.uid())));
DROP POLICY IF EXISTS "canonical_del_object_room_type_bed" ON object_room_type_bed;
CREATE POLICY "canonical_del_object_room_type_bed" ON object_room_type_bed FOR DELETE USING (
  EXISTS (SELECT 1 FROM object_room_type rt WHERE rt.id = object_room_type_bed.room_type_id AND api.user_can_write_object_canonical(rt.object_id))
  OR EXISTS (SELECT 1 FROM object_room_type rt JOIN object o ON o.id = rt.object_id WHERE rt.id = object_room_type_bed.room_type_id AND o.created_by = (select auth.uid())));

COMMIT;
```

- [ ] **Step 2: Write the fresh-apply gate test**

Create `tests/test_room_type_bed.sql` (read-only DO block, RAISE on failure — mirror `test_seed_drift_fix.sql`):

```sql
-- test_room_type_bed.sql — §70 structured bed list (Phase 2).
-- Asserts post-state after schema_unified + rls_policies + seeds_data + migration_room_type_bed.
-- Read-only; raises on any failure, emits PASS otherwise.
DO $$
DECLARE
  v_codes   int;
  v_i18n    int;
  v_relrls  boolean;
  v_forall  int;
  v_read    int;
BEGIN
  -- (1) bed_type vocabulary seeded (10 canonical codes).
  SELECT count(*) INTO v_codes FROM public.ref_code WHERE domain = 'bed_type';
  IF v_codes < 10 THEN
    RAISE EXCEPTION 'FAIL: bed_type vocabulary incomplete (expected >=10, got %)', v_codes;
  END IF;

  -- (2) en/es i18n present on every bed_type code.
  SELECT count(*) INTO v_i18n FROM public.ref_code
    WHERE domain = 'bed_type' AND (name_i18n ? 'en') AND (name_i18n ? 'es');
  IF v_i18n <> v_codes THEN
    RAISE EXCEPTION 'FAIL: bed_type i18n incomplete (% of % codes have en+es)', v_i18n, v_codes;
  END IF;

  -- (3) object_room_type_bed has RLS enabled.
  SELECT relrowsecurity INTO v_relrls FROM pg_class WHERE relname = 'object_room_type_bed';
  IF v_relrls IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL: object_room_type_bed RLS not enabled';
  END IF;

  -- (4) NO FOR ALL write policy on the child table (per-command only — CLAUDE.md invariant).
  SELECT count(*) INTO v_forall FROM pg_policies
    WHERE tablename = 'object_room_type_bed' AND cmd = 'ALL';
  IF v_forall <> 0 THEN
    RAISE EXCEPTION 'FAIL: object_room_type_bed has % FOR ALL write policy(ies) (expected 0)', v_forall;
  END IF;

  -- (5) the read policy exists and qualifies the outer column (§55 — guards the deparse, not the source).
  SELECT count(*) INTO v_read FROM pg_policies
    WHERE tablename = 'object_room_type_bed' AND policyname = 'read_object_room_type_bed'
      AND qual LIKE '%object_room_type_bed.room_type_id%';
  IF v_read <> 1 THEN
    RAISE EXCEPTION 'FAIL: read_object_room_type_bed missing or outer column not qualified (§55)';
  END IF;

  RAISE NOTICE 'PASS: bed_type vocab + i18n seeded; object_room_type_bed RLS per-command + qualified.';
END $$;
```

- [ ] **Step 3: Validate the migration transiently (no commit to live)**

Use Supabase MCP `execute_sql` to run, inside a single transaction, the migration body **then `ROLLBACK`**, confirming it applies with no error against the live schema. (Recipe per memory `ranked-label-search-2026-06`: transient apply + ROLLBACK.) Expected: no error.

- [ ] **Step 4: Commit the SQL files**

```bash
git -c commit.gpgsign=false commit -m "feat(rooms): migration_room_type_bed — bed_type vocab + object_room_type_bed link table + RLS" -- "Base de donnée DLL et API/migration_room_type_bed.sql" "Base de donnée DLL et API/tests/test_room_type_bed.sql"
```

---

## Task 2: Fold into the canonical files (fresh == live)

**Files:** Modify `schema_unified.sql`, `rls_policies.sql`, `seeds_data.sql`.

- [ ] **Step 1: `schema_unified.sql` — partition + uniques + table.**
  - After `CREATE TABLE IF NOT EXISTS ref_code_room_type PARTITION OF ref_code FOR VALUES IN ('room_type');` (L341) add `CREATE TABLE IF NOT EXISTS ref_code_bed_type PARTITION OF ref_code FOR VALUES IN ('bed_type');`.
  - After `uq_ref_code_room_type_id` (L436) add `CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_bed_type_id ON ref_code_bed_type (id);`.
  - After `uq_ref_code_room_type_code` (L481) add `CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_bed_type_code ON ref_code_bed_type(code);`.
  - After the `CREATE TABLE ... object_room_type_amenity (...)` block (ends ~L2408) add the full `CREATE TABLE IF NOT EXISTS object_room_type_bed (...)` (composite PK, FKs, quantity/position/created_at) and `CREATE INDEX IF NOT EXISTS idx_room_type_bed_bed_type_id ...` — verbatim from Task 1 §3 (the CREATE TABLE + index lines only; NOT the policies).

- [ ] **Step 2: `rls_policies.sql` — enable RLS + ref pair + table policies.**
  - Add `ALTER TABLE object_room_type_bed ENABLE ROW LEVEL SECURITY;` next to the other room-type `ENABLE ROW LEVEL SECURITY` lines (~L68).
  - Add the `ref_code_bed_type` RLS pair (the two `CREATE POLICY` from Task 1 §1) next to the other ref_code partition pairs (search `pub_ref_code_read` ~L793).
  - After the `object_room_type_amenity` policy block (~L1276) add the `read_object_room_type_bed` + the three `canonical_ins/upd/del_object_room_type_bed` policies — verbatim from Task 1 §3.

- [ ] **Step 3: `seeds_data.sql` — vocabulary + i18n.**
  - After the `room_type` `INSERT INTO ref_code ... ON CONFLICT DO NOTHING;` block (~L890) add the `bed_type` INSERT from Task 1 §2.
  - In the `ref_code_translations` CTE VALUES (~L1457+, where `room_type` rows live) add the 10 `('bed_type', code, name_en, name_es, name_en, name_es)` rows so the shared UPDATE applies them. (Match the CTE's 6-column shape `(domain, code, name_en, name_es, description_en, description_es)`.)

- [ ] **Step 4: Commit the folds**

```bash
git -c commit.gpgsign=false commit -m "feat(rooms): fold bed_type partition/table/RLS/seed into schema_unified/rls_policies/seeds_data" -- "Base de donnée DLL et API/schema_unified.sql" "Base de donnée DLL et API/rls_policies.sql" "Base de donnée DLL et API/seeds_data.sql"
```

---

## Task 3: Register in the deploy manifest + CI gate

**Files:** Modify `ci_fresh_apply.sql`, `docs/SQL_ROLLOUT_RUNBOOK.md`, `.github/workflows/sql-fresh-apply.yml`.

- [ ] **Step 1: `ci_fresh_apply.sql`** — after the `14b` block (L126) add:

```
\echo '== 14c    migration_room_type_bed.sql  (bed_type ref partition + seed/i18n + object_room_type_bed link table + §38 read / per-command write; folded into schema_unified/rls_policies/seeds_data, no-op fresh) =='
\ir migration_room_type_bed.sql
```

- [ ] **Step 2: `docs/SQL_ROLLOUT_RUNBOOK.md`** — after the `14b` manifest row add a `14c.` row describing `migration_room_type_bed.sql` (bed_type partition + vocab + i18n + object_room_type_bed link table + RLS; after step 11 `seeds_data.sql`; idempotent, no-op fresh).

- [ ] **Step 3: `.github/workflows/sql-fresh-apply.yml`** — after the `seed-drift fix test` step add:

```yaml
- name: room-type bed test (§70 — bed_type vocab + object_room_type_bed RLS per-command)
  env:
    DB_URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
  run: psql "$DB_URL" -v ON_ERROR_STOP=1 -f "Base de donnée DLL et API/tests/test_room_type_bed.sql"
```

- [ ] **Step 4: Commit the manifest/CI changes**

```bash
git -c commit.gpgsign=false commit -m "ci(rooms): register migration_room_type_bed (manifest 14c + fresh-apply test)" -- "Base de donnée DLL et API/ci_fresh_apply.sql" "docs/SQL_ROLLOUT_RUNBOOK.md" ".github/workflows/sql-fresh-apply.yml"
```

---

## Task 4: Apply to live + verify

- [ ] **Step 1:** Apply via `mcp__supabase__apply_migration` (name `room_type_bed_structured`), body = `migration_room_type_bed.sql`.
- [ ] **Step 2:** `mcp__supabase__execute_sql` — assert `SELECT count(*) FROM ref_code WHERE domain='bed_type'` = 10; `SELECT count(*) FROM pg_policies WHERE tablename='object_room_type_bed'` = 4 (1 read + 3 per-command); `SELECT count(*) FROM pg_policies WHERE tablename='object_room_type_bed' AND cmd='ALL'` = 0.
- [ ] **Step 3:** `mcp__supabase__get_advisors` (security + performance) — confirm no NEW error on `object_room_type_bed` beyond the expected (the FK-index/RLS shape matches the amenity sibling). The `0028/0029 security_definer` flags do NOT apply here (no new DEFINER fn).
- [ ] **Step 4:** Persona probe (set role anon vs an org member): anon cannot read a bed row of a draft object; an org member can read its own draft object's beds. (Run the §38 read query under each role via `execute_sql` with `SET LOCAL ROLE`.) Document the result.
- [ ] **Step 5:** If a local `supabase start` is available, run `psql -f "Base de donnée DLL et API/ci_fresh_apply.sql"` then the new test; otherwise rely on the CI gate (push triggers it). Note which was used (no silent skip).

---

## Task 5: Parser + types (TDD, pure)

**Files:**
- Modify: `src/services/object-workspace-parser.ts`
- Test: `src/services/object-detail-parser.test.ts` (or the nearest parser test) — assert beds default to `[]`.

- [ ] **Step 1: Write the failing test** — render `parseWorkspaceModules` (or the rooms-module path) on a fixture room WITHOUT beds and assert `item.beds` is `[]` and `module.bedTypeOptions` is `[]`. (Match the existing parser test harness in that file.)
- [ ] **Step 2: Run → fail** (`beds` not on the type).
- [ ] **Step 3: Implement.** In `object-workspace-parser.ts`:

```ts
export interface ObjectWorkspaceRoomBed {
  bedTypeId: string;
  bedTypeCode: string;
  bedTypeLabel: string;
  quantity: string;
}
```

Add `beds: ObjectWorkspaceRoomBed[];` to `ObjectWorkspaceRoomTypeItem` (after `mediaIds`) and `bedTypeOptions: WorkspaceReferenceOption[];` to `ObjectWorkspaceRoomsModule` (after `amenityOptions`). In `parseWorkspaceRoomsModule`, add to each item:

```ts
      beds: readArray(record.beds ?? record.room_type_beds).map((bed) => {
        const ref = readNamedReference(bed.bed_type ?? bed);
        return { bedTypeId: ref.id, bedTypeCode: ref.code, bedTypeLabel: ref.label, quantity: readString(bed.quantity, '1') };
      }),
```

and `bedTypeOptions: []` in the returned module (the editor loader is the authoritative catalog; the parser path leaves it empty like `mediaOptions`).

- [ ] **Step 4: Run → pass.**
- [ ] **Step 5: Commit** — `feat(rooms): ObjectWorkspaceRoomBed type + beds parsing`.

---

## Task 6: Bed-row helpers (TDD, pure)

**Files:**
- Modify: `src/features/object-editor/sections/blocks/rooms-utils.ts`
- Test: `src/features/object-editor/sections/blocks/rooms-utils.test.ts`

- [ ] **Step 1: Write failing tests** for: `addBedRow(beds, option)` (appends `{quantity:'1', position:String(len+1)}`), `removeBedRow(beds, index)` (drops + reindexes positions), `updateBedQuantity(beds, index, qty)` (clamps to ≥1), and `buildBedRows(item, bedTypeIdByCode)` (maps to DB rows `{bed_type_id, quantity, position}`, skips unknown codes, dedupes by bed_type_id).

```ts
import { addBedRow, removeBedRow, updateBedQuantity, buildBedRows } from './rooms-utils';
import type { ObjectWorkspaceRoomBed } from '../../../../services/object-workspace-parser';

const bed = (code: string, q = '1', pos = '1'): ObjectWorkspaceRoomBed =>
  ({ bedTypeId: `id-${code}`, bedTypeCode: code, bedTypeLabel: code, quantity: q });

describe('bed-row helpers', () => {
  it('addBedRow appends a row with quantity 1', () => {
    expect(addBedRow([], { id: 'id-double', code: 'double', label: 'Lit double' })).toEqual([
      { bedTypeId: 'id-double', bedTypeCode: 'double', bedTypeLabel: 'Lit double', quantity: '1' },
    ]);
  });
  it('updateBedQuantity clamps to at least 1', () => {
    expect(updateBedQuantity([bed('double')], 0, '0')[0].quantity).toBe('1');
    expect(updateBedQuantity([bed('double')], 0, '3')[0].quantity).toBe('3');
  });
  it('removeBedRow drops the row', () => {
    expect(removeBedRow([bed('double'), bed('single')], 0)).toEqual([bed('single')]);
  });
  it('buildBedRows maps to DB rows and skips unknown codes', () => {
    const map = new Map([['double', 'uuid-d']]);
    expect(buildBedRows([bed('double', '2'), bed('unknown')], map)).toEqual([
      { bed_type_id: 'uuid-d', quantity: 2, position: 1 },
    ]);
  });
});
```

- [ ] **Step 2: Run → fail.**
- [ ] **Step 3: Implement** in `rooms-utils.ts`:

```ts
import type { ObjectWorkspaceRoomBed } from '../../../../services/object-workspace-parser';
type RefOption = { id: string; code: string; label: string };

export function addBedRow(beds: ObjectWorkspaceRoomBed[], option: RefOption): ObjectWorkspaceRoomBed[] {
  return [...beds, { bedTypeId: option.id, bedTypeCode: option.code, bedTypeLabel: option.label, quantity: '1' }];
}
export function removeBedRow(beds: ObjectWorkspaceRoomBed[], index: number): ObjectWorkspaceRoomBed[] {
  return beds.filter((_, i) => i !== index);
}
export function updateBedQuantity(beds: ObjectWorkspaceRoomBed[], index: number, quantity: string): ObjectWorkspaceRoomBed[] {
  const n = Number.parseInt(quantity, 10);
  const q = Number.isFinite(n) && n > 0 ? n : 1;
  return beds.map((b, i) => (i === index ? { ...b, quantity: String(q) } : b));
}
/** DB rows for object_room_type_bed; resolves code→id, skips unknown, dedupes by bed_type_id, 1-based position. */
export function buildBedRows(beds: ObjectWorkspaceRoomBed[], idByCode: Map<string, string>): { bed_type_id: string; quantity: number; position: number }[] {
  const seen = new Set<string>();
  const rows: { bed_type_id: string; quantity: number; position: number }[] = [];
  for (const b of beds) {
    const id = idByCode.get(b.bedTypeCode.toLowerCase());
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const n = Number.parseInt(b.quantity, 10);
    rows.push({ bed_type_id: id, quantity: Number.isFinite(n) && n > 0 ? n : 1, position: rows.length + 1 });
  }
  return rows;
}
```

- [ ] **Step 4: Run → pass.**
- [ ] **Step 5: Commit** — `feat(rooms): pure bed-row helpers (add/remove/quantity/buildBedRows)`.

---

## Task 7: Loader + saver wiring (object-workspace.ts)

**Files:** Modify `src/services/object-workspace.ts`. (Network-bound; verified by Task 11 live round-trip — keep the pure logic in Task 6's helpers.)

- [ ] **Step 1: Loader** in `getObjectWorkspaceRoomsModule` (~L2358):
  - Add to the parallel `Promise.allSettled` ref loads: `client.from('ref_code').select('id, code, name, position').eq('domain', 'bed_type').order('position', { ascending: true })` → build `bedTypeOptions` (mirror `roomTypeOptions` at L2381/2407) + a `bedTypeById` map.
  - Add to the link-table `Promise.allSettled` (~L2395): `client.from('object_room_type_bed').select('room_type_id, bed_type_id, quantity, position').in('room_type_id', roomIds)`.
  - Build `bedsByRoom = new Map<string, ObjectWorkspaceRoomBed[]>()` (mirror `amenityCodesByRoom` ~L2420): resolve `bed_type_id` → `bedTypeById` option, push `{bedTypeId, bedTypeCode, bedTypeLabel, quantity:String(quantity)}` ordered by `position`.
  - Return `bedTypeOptions` on the module and `beds: bedsByRoom.get(roomId) ?? []` on each item.

- [ ] **Step 2: Saver** in `saveObjectWorkspaceRooms` (~L4174):
  - Add `client.from('ref_code').select('id, code').eq('domain', 'bed_type')` to the opening `Promise.all`; build `bedTypeIdByCode` (mirror `amenityIdByCode`).
  - In the pre-delete `Promise.all` (~L4216) add `client.from('object_room_type_bed').delete().in('room_type_id', existingRoomIds)` (belt-and-suspenders alongside the room CASCADE).
  - After inserting each room and getting `roomId`, add (mirror the amenity reconcile ~L4263): `const bedRows = buildBedRows(item.beds, bedTypeIdByCode).map((r) => ({ ...r, room_type_id: roomId }));` then `if (bedRows.length > 0) { const { error } = await client.from('object_room_type_bed').insert(bedRows); if (error) throw mapMutationError(error, 'Impossible de sauvegarder la configuration des lits.'); }`.

- [ ] **Step 3: Typecheck** `npm run typecheck` (rooms files clean).
- [ ] **Step 4: Commit** — `feat(rooms): load/save object_room_type_bed (beds + bedTypeOptions)`.

---

## Task 8: Bed-list editor in RoomEditModal (TDD)

**Files:**
- Modify: `src/features/object-editor/widgets/RoomEditModal.tsx`
- Modify: `src/features/object-editor/sections/blocks/BlockHEB.tsx` (`createRoom` default `beds: []`)
- Test: `src/features/object-editor/widgets/RoomEditModal.test.tsx`

- [ ] **Step 1: `createRoom` default.** In `BlockHEB.tsx` `createRoom`, add `beds: [],` (after `mediaIds: []`). Add `beds: []` to the `RoomEditModal.test.tsx` fixture room and `bedTypeOptions` to the `mod` fixture.

- [ ] **Step 2: Write the failing test** in `RoomEditModal.test.tsx`:

```ts
it('adds and edits a structured bed row', () => {
  const onSave = jest.fn();
  render(<RoomEditModal open room={room} module={mod} onClose={() => {}} onSave={onSave} />);
  fireEvent.click(screen.getByRole('button', { name: /Ajouter un lit/i }));
  fireEvent.change(screen.getByLabelText('Type de lit 1'), { target: { value: 'double' } });
  fireEvent.change(screen.getByLabelText('Nombre de lits 1'), { target: { value: '2' } });
  fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
  const saved = onSave.mock.calls[0][0] as ObjectWorkspaceRoomTypeItem;
  expect(saved.beds).toEqual([{ bedTypeId: 'bt-double', bedTypeCode: 'double', bedTypeLabel: 'Lit double', quantity: '2' }]);
});
```

(Set `mod.bedTypeOptions = [{ id: 'bt-double', code: 'double', label: 'Lit double' }]`. The "Ajouter un lit" button adds an empty row; the bed-type `ReferenceSelect` has `aria-label="Type de lit N"`; the quantity `Input` `aria-label="Nombre de lits N"`.)

- [ ] **Step 3: Run → fail.**
- [ ] **Step 4: Implement** the "Configuration des lits" section in `RoomEditModal.tsx` — replace the free-text placeholder `<Field label="Configuration lits">…</Field>` with a row repeater driven by `addBedRow`/`removeBedRow`/`updateBedQuantity` (import from `../sections/blocks/rooms-utils`) over `draft.beds`, plus a `+ Ajouter un lit` button. Each row: a quantity `Input type="number"` (`aria-label={\`Nombre de lits ${i+1}\`}`), a bed-type `ReferenceSelect` (`options={module.bedTypeOptions}`, `aria-label={\`Type de lit ${i+1}\`}`, writes `bedTypeId/Code/Label` on change), and a remove button. Extend the `module` prop type to include `bedTypeOptions`. (Layout per the approved mockup: `64px × 1fr × remove` grid.)

- [ ] **Step 5: Run → pass** (`npx jest RoomEditModal.test.tsx`).
- [ ] **Step 6: Typecheck.**
- [ ] **Step 7: Commit** — `feat(rooms): structured bed-list editor replaces free-text bed config`.

---

## Task 9: Read consumer — emit beds in `get_object_resource` + drawer

**Files:** Modify `api_views_functions.sql` (`get_object_resource` room_types JSON), the drawer parser/panel (`src/features/object-drawer/utils.ts` / `object-detail-parser.ts` / `ObjectRoomsPanel.tsx`).

- [ ] **Step 1:** In `get_object_resource`, where each `room_types` element is built (the §54 field-gated `v_can_read_extended OR is_published` block), add a `beds` array per room: a correlated subquery over `object_room_type_bed b JOIN ref_code_bed_type bt ON bt.id = b.bed_type_id` → `jsonb_agg(jsonb_build_object('quantity', b.quantity, 'bed_type', jsonb_build_object('code', bt.code, 'name', bt.name)) ORDER BY b.position)`. Deploy to live (`api_views_functions.sql` is manifest step 5) + `NOTIFY pgrst, 'reload schema'`. (Mirror exactly how `room_types` is already assembled — find it via the §54 room_types emit.)
- [ ] **Step 2:** Drawer render: in the room panel, render the structured beds (`item.beds` → e.g. `2 × Lit double, 1 × Lit simple`) instead of `bedConfig`. Keep `bedConfig` as a fallback only if `beds` is empty (legacy/none).
- [ ] **Step 3:** Remove the free-text `bed_config` write from the editor saver path is already done (Task 8 dropped the field; `item.bedConfig` stays `''`). Decision recorded: `bed_config` column retained nullable (0 live rows); structured beds are the source of truth. (Dropping the column is a deferred cleanup.)
- [ ] **Step 4:** Tests: drawer parser spec asserts beds render; FE suite green; `tsc` clean.
- [ ] **Step 5: Commit** — `feat(rooms): surface structured beds in get_object_resource + drawer`.

---

## Task 10: Full verification + decision log

- [ ] **Step 1:** `npm run test:run` (full Jest suite green) + `npm run typecheck` (rooms files clean; the pre-existing §08 `Classification*` TS errors are out of scope — confirm no NEW errors).
- [ ] **Step 2:** Live round-trip: in the running editor, add a room with `2 × Lit double` + `1 × Lit simple`, save, reload — confirm beds round-trip; confirm the drawer/card shows them. Screenshot proof. (Needs the authenticated editor session.)
- [ ] **Step 3:** SQL CI gate: confirm `.github/workflows/sql-fresh-apply.yml` is green on push (fresh DB reproduces the table + vocab + RLS; the new test passes).
- [ ] **Step 4:** Update `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md` (§70, gitignored/local) documenting the structured bed model, the partition/RLS pattern reused, the `bed_config` retention decision, and the live-apply verification. Update the editor-progress memory.

---

## Self-review notes

- **Spec coverage (§4):** vocabulary (Task 1/2), normalized table + RLS §38/§47/§55 (Task 1/2), fresh-apply/manifest/CI (Task 1/3), live apply + verify (Task 4), loader/saver/parser (Tasks 5/7), editor list (Task 8), read-consumer alignment + `bed_config` fate (Task 9). The §4.5 open sub-decision is resolved to **retain `bed_config` nullable, structured = source of truth** (0 live rows; column drop deferred).
- **Mirrors verbatim patterns:** table = `object_room_type_amenity` + quantity (composite PK, FK cascade, created_at, only a `bed_type_id` index); RLS = `read_object_room_type_amenity` (§38 split) + `canonical_*_object_room_type_amenity` (per-command, qualified columns §55); partition = `ref_code_room_type` (+ id/code uniques + house RLS pair); seed/i18n = the `room_type` block; manifest/test = the `14b`/`test_seed_drift_fix.sql` pattern.
- **Type consistency:** `ObjectWorkspaceRoomBed` (Task 5) is used identically in Tasks 6/7/8; `buildBedRows` signature matches its saver call site; `bedTypeOptions` added to the module in Tasks 5 (type) + 7 (loader) + 8 (editor prop).
- **No FOR ALL on the child table** (per-command only) — asserted by the gate test (Task 1 §4). Read role does not need the write predicate (per-command writes don't apply to SELECT).
- **Risk:** the live migration creates a new partition + table; additive and isolated from the parallel §08 work. The `get_object_resource` change (Task 9) is the one live read-RPC edit — deploy + `NOTIFY pgrst` + verify byte-shape like §54/§59.
