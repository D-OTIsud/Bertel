# DB Audit Fixes — Type→Facet Applicability Registry + Write-Path Convergence

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the two issues the 2026-06-10 database audit flagged as worth investing in: (A) a single machine-readable type→facet applicability registry enforced by a DB trigger **and** consumed by the editor's section gating, and (B) convergence of the write-policy layer to one per-command policy family per table (the deferred `FOR ALL`→per-command restructuring), plus the set-based read gates it unblocks. Also fixes two gaps discovered while researching: `object_fma` has **no write policy at all** (its editor upsert is RLS-denied), and `ref_capacity_applicability` has **0 rows** (the Explorer filters capacity facets against an empty set).

**Architecture:** Phase A adds two `ref_*` tables (`ref_facet_registry` + `ref_facet_applicability`), one generic BEFORE-trigger attached to the 13 type-specific facet tables, a type-change guard on `object`, and a violations report function; the editor then (1) stops silently falling back to HEB for unmapped types (ACT/ORG) and (2) gates its 6 type-specific modules on the same registry via the existing `unavailableReason` machinery. Phase B replaces the 4 overlapping `FOR ALL` write-policy families (`owner_*`, `workspace_*`, `canonical_write_*`, legacy admin) with one per-command triple per table (`canonical_ins/upd/del_*`), which stops write predicates from polluting SELECT (the P0.3 gotcha) and unblocks the §38-form set-based read gates. Phase C documents everything per the project's memory workflow.

**Tech Stack:** PostgreSQL 17 (Supabase), plpgsql triggers, RLS; Next.js + TypeScript frontend (Jest); deploy via repo migration files + Supabase MCP (`apply_migration`) + the fresh-apply CI gate.

---

## Context primer (read this first — assume zero project context)

**Repo:** `C:\Users\dphil\Bertel3.0` (Windows; git branch `master`). Two halves:
- SQL: `Base de donnée DLL et API/` — **the folder name has spaces and accents; always quote paths.** Key files: `schema_unified.sql` (DDL, referred to as SU), `rls_policies.sql`, `api_views_functions.sql`, `seeds_data.sql`, `object_workspace_safe_write_rpcs.sql`, `object_workspace_gap_rpcs.sql`, `migration_*.sql` (one per manifest step), `tests/test_*.sql`, `ci_fresh_apply.sql`.
- Frontend: `bertel-tourism-ui/` (Next.js). Editor lives in `src/features/object-editor/`, data layer in `src/services/object-workspace.ts`.

**Non-negotiable project invariants (from CLAUDE.md — violations are incidents):**
1. **Deploy integrity:** no DDL may exist only on live. Every migration must be added to: (a) `docs/SQL_ROLLOUT_RUNBOOK.md` manifest, (b) `Base de donnée DLL et API/ci_fresh_apply.sql` (`\echo` + `\ir` pair), (c) a dedicated test step in `.github/workflows/sql-fresh-apply.yml`, (d) both READMEs (root `README.md` ~line 144 and `Base de donnée DLL et API/README.md` ~line 93 — they use their own numbering), (e) the decision log `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md`.
2. **Manifest numbering:** last used steps are `4c`, `8l`, `13b`. This plan allocates: **8m** (facet registry), **8n** (object_fma write policy), **8o** (per-command restructure), **8p** (set-based read gates), **13c** (capacity applicability seed — must run after `seeds_data.sql` because it joins `ref_capacity_metric`).
3. **Migration file header convention** (copy from `migration_ref_commune.sql:1-18`): description, `-- PREREQUISITES: … APPLY AFTER … — manifest step <n>`, `-- IDEMPOTENT: <mechanism>`, `-- REVERSIBLE: <exact rollback SQL>`, body wrapped in `BEGIN;`/`COMMIT;`.
4. **`gen_random_uuid()` only** in any function whose `SET search_path` omits `extensions` (decision log §29). No function in this plan generates UUIDs, but keep it in mind if you deviate.
5. **§39 initplan wrap:** in any RLS policy, write `(select auth.role())`, never bare `auth.role()`.
6. **P0.3 gotcha:** permissive policies are OR'd and a `FOR ALL` write policy also applies to SELECT — any role that may read the table must be able to EXECUTE the write predicate. Per-command policies (this plan's Phase B) make the gotcha structurally impossible for SELECT; do not remove the existing `GRANT EXECUTE … TO anon` (harmless, other surfaces may rely on it).
7. **No whole-catalog SRFs / per-row scalar user-scope predicates** in hot paths (§35/§37). New read policies must use the §38 split form (see Task 13).
8. **Live applies** go through `mcp__supabase__apply_migration` with a short snake_case name, and the decision log records: `**APPLIED TO LIVE PROD <date>** via Supabase MCP migration \`<name>\` (documented + gate-verified ⇒ NOT PROD-only drift; recorded here per the deploy-integrity invariant)` plus a read-back verification sentence.
9. **Frontend test commands** (run from `bertel-tourism-ui/`): `npm run test:run` (one-shot Jest), `npm run typecheck`. **Known pre-existing failure:** `src/features/object-editor/editor-validation.test.ts` is locally modified and failing in the user's working tree — **do not touch, commit, or revert that file**; treat its failure as baseline noise and exclude it from `git add`.
10. The user pushes manually if sandbox blocks push; try `git -C "C:\Users\dphil\Bertel3.0" push` after committing (it has worked from this environment).
11. SQL tests are transactional and self-contained: `\set ON_ERROR_STOP on` / `BEGIN;` / one `DO $$ … $$;` with `ASSERT`s / `ROLLBACK;`. Copy the structure of `Base de donnée DLL et API/tests/test_ref_commune.sql` (structural asserts → superuser fixtures → persona blocks via `set_config('request.jwt.claims', …)` + `SET LOCAL ROLE …` … `RESET ROLE`). Object ids must match `^[A-Z]{3}[A-Z0-9]{3}[0-9A-Z]{10}$` (16 chars, e.g. `FACETT9999999901`).
12. **Decision log:** next free section number is **§46** (file ends at §45; new headings use the `## §NN — <topic> (<YYYY-MM-DD>)` form).

**Research appendix:** detailed inventories backing every claim in this plan are in `docs/superpowers/plans/.research/*.md` (schemaInventory, editorRegistry, conventions, writePaths, decisionLog, enforcementToday). They are working notes — **do not commit the `.research/` folder**.

**Deliberately out of scope (the audit itself says "watch, not fix"):** `tag_link` polymorphism, `object_location`/`media` XOR columns, cached aggregates on `object`, `object.extra`/`secondary_types` escape hatches, the 5-table `opening_*` tree cost, and converting the `object_type` enum to a ref table. Also out of scope: unifying RPC-vs-direct-PostgREST as a single *transport* (product-level; Phase B converges the **policy layer**, which is what the deferred item actually specifies), the editor §07 capacity-metric filtering by applicability (deferred — Task 14 logs it), and nested EXISTS-chain read policies in Task 13 (flat-form only; remainder logged).

---

# Phase A — Type→facet applicability registry

## Task 1: Pre-flight live audit (read-only)

**Files:** none (MCP reads only). Output feeds the seed matrix in Task 3.

- [x] **Step 1: Observed types per enrolled facet table on live.** Run via `mcp__supabase__execute_sql`:
  > **DONE 2026-06-10:** only one facet row exists on live — `object_meeting_room`/`HOT` = 1 (Dimitile Hôtel). Already an allowed baseline pair; all other 12 tables empty.

```sql
SELECT 'object_iti' AS facet, o.object_type::text, count(*) FROM object_iti f JOIN object o ON o.id = f.object_id GROUP BY 1,2
UNION ALL SELECT 'object_iti_info', o.object_type::text, count(*) FROM object_iti_info f JOIN object o ON o.id = f.object_id GROUP BY 1,2
UNION ALL SELECT 'object_iti_practice', o.object_type::text, count(*) FROM object_iti_practice f JOIN object o ON o.id = f.object_id GROUP BY 1,2
UNION ALL SELECT 'object_iti_stage', o.object_type::text, count(*) FROM object_iti_stage f JOIN object o ON o.id = f.object_id GROUP BY 1,2
UNION ALL SELECT 'object_iti_profile', o.object_type::text, count(*) FROM object_iti_profile f JOIN object o ON o.id = f.object_id GROUP BY 1,2
UNION ALL SELECT 'object_iti_associated_object', o.object_type::text, count(*) FROM object_iti_associated_object f JOIN object o ON o.id = f.object_id GROUP BY 1,2
UNION ALL SELECT 'object_iti_section', o.object_type::text, count(*) FROM object_iti_section f JOIN object o ON o.id = f.parent_object_id GROUP BY 1,2
UNION ALL SELECT 'object_fma', o.object_type::text, count(*) FROM object_fma f JOIN object o ON o.id = f.object_id GROUP BY 1,2
UNION ALL SELECT 'object_fma_occurrence', o.object_type::text, count(*) FROM object_fma_occurrence f JOIN object o ON o.id = f.object_id GROUP BY 1,2
UNION ALL SELECT 'object_act', o.object_type::text, count(*) FROM object_act f JOIN object o ON o.id = f.object_id GROUP BY 1,2
UNION ALL SELECT 'object_room_type', o.object_type::text, count(*) FROM object_room_type f JOIN object o ON o.id = f.object_id GROUP BY 1,2
UNION ALL SELECT 'object_meeting_room', o.object_type::text, count(*) FROM object_meeting_room f JOIN object o ON o.id = f.object_id GROUP BY 1,2
UNION ALL SELECT 'object_menu', o.object_type::text, count(*) FROM object_menu f JOIN object o ON o.id = f.object_id GROUP BY 1,2
ORDER BY 1, 2;
```

- [x] **Step 2: Build the final seed matrix.** **DONE: final matrix = the plan baseline verbatim** (observed `{(object_meeting_room, HOT)}` ⊆ baseline; no extensions, no conceptually-wrong pairs, no exclusions to report). Final matrix = the **baseline** in Task 3 ∪ every `(facet, type)` pair observed in Step 1, **except** pairs that are conceptually wrong per the model (an `ORG` with `object_menu` rows, an `ORG`/`ITI` with `object_room_type` rows, etc. — judge against the type semantics in SU:2926-2936 and `docs/architecture/OBJECT_DATA_DICTIONARY.md` modules E4/E5/E6). Conceptually-wrong observed pairs are NOT seeded; the rows stay as reported violations (the trigger only guards NEW writes, existing rows keep working) and are listed verbatim in the final report for the user to clean. Record the chosen matrix and any exclusions — Task 14 copies them into the decision log.

- [x] **Step 3: Confirm the same audit on the fresh-apply path is covered.** No action — the test in Task 2 asserts `api.facet_applicability_violations()` returns 0 rows on a freshly-seeded CI database, which is what catches a seed file violating the matrix.

## Task 2: SQL test (TDD — red before the migration exists)

**Files:**
- Create: `Base de donnée DLL et API/tests/test_facet_applicability.sql`

- [x] **Step 1: Write the test** (full content below; if Task 1 extended the matrix, extend the seed asserts the same way — asserts use `>=` / `⊇` so baseline stays valid):
  > **DONE:** written as `tests/test_facet_applicability.sql` in the corrected 3-DO-block order (DO#1 structural+seeds+behavior+type-change, DO#2 zero-violations, DO#3 fail-closed+notice). Column assumptions verified: `object` requires (id,object_type,name); `object_iti`/`object_act` require only `object_id`.

```sql
-- test_facet_applicability.sql
-- Proves migration_facet_applicability.sql (§46): ref_facet_registry + ref_facet_applicability
-- (single machine-readable type→facet registry), the assert_facet_applicable trigger on the 13
-- type-specific facet tables, the object_type change guard, and the violations report fn.
-- Run AFTER the full manifest. Self-contained + transactional (ROLLBACK; nothing persists).
-- Against a DB WITHOUT the migration, every assertion goes red.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_ok boolean := false;
BEGIN
  -- ---------- Structural ----------
  ASSERT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='ref_facet_registry'),
         'ref_facet_registry missing';
  ASSERT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='ref_facet_applicability'),
         'ref_facet_applicability missing';
  ASSERT (SELECT relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='public' AND c.relname='ref_facet_registry'), 'ref_facet_registry RLS not enabled';
  ASSERT (SELECT relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='public' AND c.relname='ref_facet_applicability'), 'ref_facet_applicability RLS not enabled';
  ASSERT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ref_facet_registry' AND policyname='pub_ref_facet_registry_read' AND cmd='SELECT'),
         'pub_ref_facet_registry_read missing';
  ASSERT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ref_facet_applicability' AND policyname='pub_ref_facet_applicability_read' AND cmd='SELECT'),
         'pub_ref_facet_applicability_read missing';
  -- 13 enrolled tables, each carrying the trigger
  ASSERT (SELECT count(*) FROM ref_facet_registry) = 13, 'expected 13 enrolled facet tables';
  ASSERT (SELECT count(*) FROM pg_trigger WHERE tgname='trg_assert_facet_applicable' AND NOT tgisinternal) = 13,
         'expected trg_assert_facet_applicable on the 13 enrolled tables';
  ASSERT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_guard_object_type_change' AND NOT tgisinternal),
         'trg_guard_object_type_change missing on object';
  -- violations fn: exists, service-only
  ASSERT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                 WHERE n.nspname='api' AND p.proname='facet_applicability_violations'),
         'api.facet_applicability_violations missing';
  ASSERT NOT has_function_privilege('anon', 'api.facet_applicability_violations()', 'EXECUTE'),
         'anon must NOT execute the violations report';

  -- ---------- Seed matrix (superset asserts — observed-data extensions are allowed) ----------
  ASSERT EXISTS (SELECT 1 FROM ref_facet_applicability WHERE facet_table='object_iti' AND object_type='ITI'), 'object_iti must accept ITI';
  ASSERT EXISTS (SELECT 1 FROM ref_facet_applicability WHERE facet_table='object_act' AND object_type='ACT'), 'object_act must accept ACT';
  ASSERT EXISTS (SELECT 1 FROM ref_facet_applicability WHERE facet_table='object_fma' AND object_type='FMA'), 'object_fma must accept FMA';
  ASSERT (SELECT count(*) FROM ref_facet_applicability WHERE facet_table='object_room_type'
          AND object_type IN ('HOT','HPA','HLO','CAMP','RVA')) = 5, 'object_room_type must accept the HEB family';
  ASSERT EXISTS (SELECT 1 FROM ref_facet_applicability WHERE facet_table='object_menu' AND object_type='RES'), 'object_menu must accept RES';
  ASSERT NOT EXISTS (SELECT 1 FROM ref_facet_applicability WHERE facet_table='object_iti' AND object_type='HOT'),
         'object_iti must NOT accept HOT';
  ASSERT (SELECT object_id_column FROM ref_facet_registry WHERE facet_table='object_iti_section') = 'parent_object_id',
         'object_iti_section must be registered under parent_object_id';

  -- ---------- Behavior: wrong type rejected, right type accepted ----------
  INSERT INTO object (id, object_type, name, status) VALUES ('FACRES9999999901', 'RES', 'facet test RES', 'draft');
  INSERT INTO object (id, object_type, name, status) VALUES ('FACITI9999999902', 'ITI', 'facet test ITI', 'draft');
  v_ok := false;
  BEGIN
    INSERT INTO object_iti (object_id) VALUES ('FACRES9999999901');
    v_ok := true;  -- only reached if the trigger let it through
  EXCEPTION WHEN check_violation THEN NULL;  -- ERRCODE 23514 expected
  END;
  ASSERT NOT v_ok, 'object_iti accepted a RES object (trigger missing/inactive)';
  INSERT INTO object_iti (object_id) VALUES ('FACITI9999999902');
  ASSERT EXISTS (SELECT 1 FROM object_iti WHERE object_id='FACITI9999999902'), 'object_iti rejected a valid ITI insert';

  -- ---------- Behavior: type change blocked while disallowed facet rows exist ----------
  v_ok := false;
  BEGIN
    UPDATE object SET object_type = 'RES' WHERE id = 'FACITI9999999902';
    v_ok := true;
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  ASSERT NOT v_ok, 'object_type change to RES allowed despite existing object_iti rows';
  DELETE FROM object_iti WHERE object_id='FACITI9999999902';
  UPDATE object SET object_type = 'RES' WHERE id = 'FACITI9999999902';  -- now allowed
  ASSERT (SELECT object_type FROM object WHERE id='FACITI9999999902') = 'RES', 'type change failed after facet rows removed';

  -- ---------- Behavior: fail-closed on registry misconfiguration ----------
  DELETE FROM ref_facet_registry WHERE facet_table = 'object_act';  -- cascades applicability (txn-local)
  INSERT INTO object (id, object_type, name, status) VALUES ('FACACT9999999903', 'ACT', 'facet test ACT', 'draft');
  v_ok := false;
  BEGIN
    INSERT INTO object_act (object_id) VALUES ('FACACT9999999903');
    v_ok := true;
  EXCEPTION WHEN others THEN NULL;  -- 'no registry row' exception expected
  END;
  ASSERT NOT v_ok, 'enrolled table without a registry row must fail closed';

  -- ---------- Fresh-DB hygiene: seeds must not violate the matrix ----------
  -- (run while the registry still misses object_act? No — restore first for a faithful check)
  ROLLBACK TO SAVEPOINT none_doesnt_exist;  -- placeholder removed in Step 2 (see note)
END$$;
ROLLBACK;
```

  **Note on the last block:** plpgsql `DO` blocks cannot `ROLLBACK TO SAVEPOINT` like that — replace the last two lines of the DO body with a second, separate `DO $$ … $$;` block placed *after* the first one (still inside the outer `BEGIN;…ROLLBACK;`), containing only:

```sql
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM api.facet_applicability_violations()) = 0,
         'fresh-applied DB has facet applicability violations (a seed file inserts wrong-type facet rows)';
  RAISE NOTICE 'facet applicability assertions passed (structural + matrix + trigger + type-change guard + fail-closed + zero violations).';
END$$;
```

  Wait — the registry deletion in block 1 rolls back only at the outer `ROLLBACK;`. Both `DO` blocks run in the same transaction, so block 2 would see the deleted `object_act` row and report its rows as… no: `facet_applicability_violations()` iterates **registry** rows, and `object_act` is absent from the registry at that point, so it is simply skipped — the zero-violations assert stays valid for the other 12 tables. To get full 13-table coverage, **order block 2 BEFORE the fail-closed sub-block**: final file layout = `DO #1` (structural + seeds + behavior + type-change), `DO #2` (zero violations, full registry intact), `DO #3` (fail-closed misconfiguration + final `RAISE NOTICE`). Write it that way.

- [x] **Step 2: Run the test against live to verify it fails (red).** **DONE — RED CONFIRMED:** `ERROR: P0004: ref_facet_registry missing` at the first ASSERT. Concatenate the file body (without `\set`) and run via `mcp__supabase__execute_sql`. Expected: the very first `ASSERT` fails with `ref_facet_registry missing`. (The script ends in `ROLLBACK;` — nothing persists even on partial success.)

## Task 3: Migration `migration_facet_applicability.sql` (manifest 8m)

**Files:**
- Create: `Base de donnée DLL et API/migration_facet_applicability.sql`
- Modify: `Base de donnée DLL et API/rls_policies.sql` (≈3101–3110, `rpc_create_object` stale type list)

- [x] **Step 1: Write the migration.** **DONE** — `migration_facet_applicability.sql` written (baseline VALUES list; Task 1 found no extensions). Full content (extend the applicability VALUES list with Task 1 observed pairs):

```sql
-- migration_facet_applicability.sql
-- §46 — Single machine-readable type→facet applicability registry.
-- One source of truth for "which object_type may carry rows in which type-specific facet table",
-- consumed by (a) a generic BEFORE INSERT/UPDATE trigger on the 13 enrolled tables, (b) a guard on
-- object.object_type changes, (c) the editor's module gating (frontend reads ref_facet_applicability),
-- (d) api.facet_applicability_violations() for ops/CI reporting.
-- PREREQUISITES: schema_unified.sql (step 1: object + facet tables), rls_policies.sql (step 6:
--   api.is_platform_superuser). APPLY AFTER step 8l — manifest step 8m.
-- IDEMPOTENT: CREATE TABLE IF NOT EXISTS / ON CONFLICT DO UPDATE / CREATE OR REPLACE FUNCTION /
--   DROP TRIGGER IF EXISTS + CREATE TRIGGER.
-- REVERSIBLE: DROP TRIGGER trg_guard_object_type_change ON object; DROP TRIGGER
--   trg_assert_facet_applicable ON <each of the 13 tables>; DROP FUNCTION
--   api.assert_facet_applicable(), api.assert_object_type_change_consistent(),
--   api.facet_applicability_violations(); DROP TABLE ref_facet_applicability, ref_facet_registry;
-- ADMIN ESCAPE HATCH: bulk type-correction scripts (cf. old_data_enrichment) can disable triggers
--   for the session via SET session_replication_role = replica; (superuser only — use deliberately).
-- NOTE: object.id's first 3 letters conventionally mirror the type (api.generate_object_id) but
--   chk_object_id_shape is shape-only — nothing binds the prefix to object_type, so a type change
--   already desyncs the convention. Pre-existing, out of scope here — the guard below only
--   protects facet-table consistency.

BEGIN;

-- ── 1. Registry tables ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ref_facet_registry (
  facet_table       TEXT PRIMARY KEY,
  object_id_column  TEXT NOT NULL DEFAULT 'object_id',
  description       TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE ref_facet_registry IS
  '§46 — type-specific facet tables enrolled in applicability enforcement. Enrolled = row here + trg_assert_facet_applicable attached. Second-level children (menu items, room amenities, stage media…) inherit through their FK parent and are NOT enrolled.';

CREATE TABLE IF NOT EXISTS ref_facet_applicability (
  facet_table  TEXT NOT NULL REFERENCES ref_facet_registry(facet_table) ON DELETE CASCADE,
  object_type  object_type NOT NULL,
  PRIMARY KEY (facet_table, object_type)
);
COMMENT ON TABLE ref_facet_applicability IS
  '§46 — allowed (facet_table, object_type) pairs. Loosening = INSERT a row. The editor reads this to gate type-specific modules; api.assert_facet_applicable() enforces it on write.';

-- ── 2. Seeds (baseline matrix ∪ live-observed pairs — see plan Task 1) ──────
INSERT INTO ref_facet_registry (facet_table, object_id_column, description) VALUES
  ('object_iti',                   'object_id',        'Tracé ITI (1:1)'),
  ('object_iti_info',              'object_id',        'Infos pratiques ITI (1:1)'),
  ('object_iti_practice',          'object_id',        'Pratiques ITI (M:N)'),
  ('object_iti_stage',             'object_id',        'Étapes ITI'),
  ('object_iti_profile',           'object_id',        'Profil altimétrique ITI'),
  ('object_iti_associated_object', 'object_id',        'Objets associés ITI'),
  ('object_iti_section',           'parent_object_id', 'Sections ITI (clé parent_object_id)'),
  ('object_fma',                   'object_id',        'Extension FMA — événements (1:1)'),
  ('object_fma_occurrence',        'object_id',        'Occurrences FMA'),
  ('object_act',                   'object_id',        'Extension ACT — prestation encadrée (1:1)'),
  ('object_room_type',             'object_id',        'Types de chambre (famille HEB)'),
  ('object_meeting_room',          'object_id',        'Salles de réunion / MICE'),
  ('object_menu',                  'object_id',        'Menus restaurant')
ON CONFLICT (facet_table) DO UPDATE
  SET object_id_column = EXCLUDED.object_id_column,
      description      = EXCLUDED.description,
      updated_at       = NOW();

INSERT INTO ref_facet_applicability (facet_table, object_type)
SELECT v.facet_table, v.object_type::object_type
FROM (VALUES
  ('object_iti','ITI'), ('object_iti_info','ITI'), ('object_iti_practice','ITI'),
  ('object_iti_stage','ITI'), ('object_iti_profile','ITI'),
  ('object_iti_associated_object','ITI'), ('object_iti_section','ITI'),
  ('object_fma','FMA'), ('object_fma_occurrence','FMA'),
  ('object_act','ACT'),
  ('object_room_type','HOT'), ('object_room_type','HPA'), ('object_room_type','HLO'),
  ('object_room_type','CAMP'), ('object_room_type','RVA'),
  ('object_meeting_room','HOT'), ('object_meeting_room','HPA'), ('object_meeting_room','HLO'),
  ('object_meeting_room','CAMP'), ('object_meeting_room','RVA'),
  ('object_menu','RES')
  -- + Task 1 observed extensions go here, each with a comment citing the live count
) AS v(facet_table, object_type)
ON CONFLICT DO NOTHING;

-- ── 3. RLS: standard ref_* pub-read / admin-write pair (§39 form) ───────────
-- (FOR ALL is the house style for ref_* admin policies — the per-command rule of §47 targets
--  object-child tables; the USING(true) read policy short-circuits ahead of the admin predicate,
--  so no P0.3 EXECUTE grant is needed.)
ALTER TABLE ref_facet_registry ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pub_ref_facet_registry_read" ON ref_facet_registry;
CREATE POLICY "pub_ref_facet_registry_read" ON ref_facet_registry
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "admin_write_ref_facet_registry" ON ref_facet_registry;
CREATE POLICY "admin_write_ref_facet_registry" ON ref_facet_registry
  FOR ALL USING (
    (select auth.role()) = 'service_role'
    OR (select auth.role()) = 'admin'
    OR api.is_platform_superuser()
  );
ALTER TABLE ref_facet_applicability ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pub_ref_facet_applicability_read" ON ref_facet_applicability;
CREATE POLICY "pub_ref_facet_applicability_read" ON ref_facet_applicability
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "admin_write_ref_facet_applicability" ON ref_facet_applicability;
CREATE POLICY "admin_write_ref_facet_applicability" ON ref_facet_applicability
  FOR ALL USING (
    (select auth.role()) = 'service_role'
    OR (select auth.role()) = 'admin'
    OR api.is_platform_superuser()
  );

-- ── 4. Generic applicability trigger ─────────────────────────────────────────
-- Pattern B validator (cf. api.validate_object_taxonomy_assignment): SECURITY INVOKER,
-- house search_path. Cost per row: 2 PK probes + 1 two-key PK probe — hot-path safe (§37).
CREATE OR REPLACE FUNCTION api.assert_facet_applicable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $fn$
DECLARE
  v_col TEXT;
  v_object_id TEXT;
  v_type object_type;
BEGIN
  SELECT r.object_id_column INTO v_col
  FROM ref_facet_registry r WHERE r.facet_table = TG_TABLE_NAME;
  IF v_col IS NULL THEN
    -- Fail closed: an enrolled table (trigger attached) must have a registry row.
    RAISE EXCEPTION 'ref_facet_registry has no row for enrolled table % — seed the registry', TG_TABLE_NAME;
  END IF;
  v_object_id := to_jsonb(NEW)->>v_col;
  IF v_object_id IS NULL THEN
    RETURN NEW;  -- nullable key: NOT NULL / FK constraints own that case
  END IF;
  SELECT o.object_type INTO v_type FROM object o WHERE o.id = v_object_id;
  IF v_type IS NULL THEN
    RETURN NEW;  -- unknown object: the FK raises the canonical error
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM ref_facet_applicability a
    WHERE a.facet_table = TG_TABLE_NAME AND a.object_type = v_type
  ) THEN
    RAISE EXCEPTION 'facet table % does not accept object_type % (object %) — see ref_facet_applicability',
      TG_TABLE_NAME, v_type, v_object_id
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_assert_facet_applicable ON object_iti;
CREATE TRIGGER trg_assert_facet_applicable BEFORE INSERT OR UPDATE ON object_iti
  FOR EACH ROW EXECUTE FUNCTION api.assert_facet_applicable();
DROP TRIGGER IF EXISTS trg_assert_facet_applicable ON object_iti_info;
CREATE TRIGGER trg_assert_facet_applicable BEFORE INSERT OR UPDATE ON object_iti_info
  FOR EACH ROW EXECUTE FUNCTION api.assert_facet_applicable();
DROP TRIGGER IF EXISTS trg_assert_facet_applicable ON object_iti_practice;
CREATE TRIGGER trg_assert_facet_applicable BEFORE INSERT OR UPDATE ON object_iti_practice
  FOR EACH ROW EXECUTE FUNCTION api.assert_facet_applicable();
DROP TRIGGER IF EXISTS trg_assert_facet_applicable ON object_iti_stage;
CREATE TRIGGER trg_assert_facet_applicable BEFORE INSERT OR UPDATE ON object_iti_stage
  FOR EACH ROW EXECUTE FUNCTION api.assert_facet_applicable();
DROP TRIGGER IF EXISTS trg_assert_facet_applicable ON object_iti_profile;
CREATE TRIGGER trg_assert_facet_applicable BEFORE INSERT OR UPDATE ON object_iti_profile
  FOR EACH ROW EXECUTE FUNCTION api.assert_facet_applicable();
DROP TRIGGER IF EXISTS trg_assert_facet_applicable ON object_iti_associated_object;
CREATE TRIGGER trg_assert_facet_applicable BEFORE INSERT OR UPDATE ON object_iti_associated_object
  FOR EACH ROW EXECUTE FUNCTION api.assert_facet_applicable();
DROP TRIGGER IF EXISTS trg_assert_facet_applicable ON object_iti_section;
CREATE TRIGGER trg_assert_facet_applicable BEFORE INSERT OR UPDATE ON object_iti_section
  FOR EACH ROW EXECUTE FUNCTION api.assert_facet_applicable();
DROP TRIGGER IF EXISTS trg_assert_facet_applicable ON object_fma;
CREATE TRIGGER trg_assert_facet_applicable BEFORE INSERT OR UPDATE ON object_fma
  FOR EACH ROW EXECUTE FUNCTION api.assert_facet_applicable();
DROP TRIGGER IF EXISTS trg_assert_facet_applicable ON object_fma_occurrence;
CREATE TRIGGER trg_assert_facet_applicable BEFORE INSERT OR UPDATE ON object_fma_occurrence
  FOR EACH ROW EXECUTE FUNCTION api.assert_facet_applicable();
DROP TRIGGER IF EXISTS trg_assert_facet_applicable ON object_act;
CREATE TRIGGER trg_assert_facet_applicable BEFORE INSERT OR UPDATE ON object_act
  FOR EACH ROW EXECUTE FUNCTION api.assert_facet_applicable();
DROP TRIGGER IF EXISTS trg_assert_facet_applicable ON object_room_type;
CREATE TRIGGER trg_assert_facet_applicable BEFORE INSERT OR UPDATE ON object_room_type
  FOR EACH ROW EXECUTE FUNCTION api.assert_facet_applicable();
DROP TRIGGER IF EXISTS trg_assert_facet_applicable ON object_meeting_room;
CREATE TRIGGER trg_assert_facet_applicable BEFORE INSERT OR UPDATE ON object_meeting_room
  FOR EACH ROW EXECUTE FUNCTION api.assert_facet_applicable();
DROP TRIGGER IF EXISTS trg_assert_facet_applicable ON object_menu;
CREATE TRIGGER trg_assert_facet_applicable BEFORE INSERT OR UPDATE ON object_menu
  FOR EACH ROW EXECUTE FUNCTION api.assert_facet_applicable();

-- ── 5. Guard on object.object_type changes ──────────────────────────────────
CREATE OR REPLACE FUNCTION api.assert_object_type_change_consistent()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $fn$
DECLARE
  r RECORD;
  v_exists BOOLEAN;
BEGIN
  IF NEW.object_type IS NOT DISTINCT FROM OLD.object_type THEN
    RETURN NEW;
  END IF;
  FOR r IN
    SELECT reg.facet_table, reg.object_id_column
    FROM ref_facet_registry reg
    WHERE NOT EXISTS (
      SELECT 1 FROM ref_facet_applicability a
      WHERE a.facet_table = reg.facet_table AND a.object_type = NEW.object_type
    )
  LOOP
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I WHERE %I = $1)', r.facet_table, r.object_id_column)
      INTO v_exists USING NEW.id;
    IF v_exists THEN
      RAISE EXCEPTION 'cannot change object % to type %: rows exist in % which does not accept % — clean them first or extend ref_facet_applicability',
        NEW.id, NEW.object_type, r.facet_table, NEW.object_type
        USING ERRCODE = '23514';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_guard_object_type_change ON object;
CREATE TRIGGER trg_guard_object_type_change
  BEFORE UPDATE OF object_type ON object
  FOR EACH ROW EXECUTE FUNCTION api.assert_object_type_change_consistent();

-- ── 6. Violations report (ops/CI; legacy rows are NOT auto-deleted) ─────────
CREATE OR REPLACE FUNCTION api.facet_applicability_violations()
RETURNS TABLE (facet_table TEXT, object_id TEXT, object_type object_type)
LANGUAGE plpgsql STABLE
SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $fn$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT reg.facet_table, reg.object_id_column FROM ref_facet_registry reg LOOP
    RETURN QUERY EXECUTE format(
      'SELECT DISTINCT %L::text, f.%I::text, o.object_type
         FROM %I f JOIN object o ON o.id = f.%I
        WHERE NOT EXISTS (SELECT 1 FROM ref_facet_applicability a
                          WHERE a.facet_table = %L AND a.object_type = o.object_type)',
      r.facet_table, r.object_id_column, r.facet_table, r.object_id_column, r.facet_table);
  END LOOP;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION api.facet_applicability_violations() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION api.facet_applicability_violations() TO service_role;

COMMIT;
```

- [x] **Step 2: Fix the stale type list in `rpc_create_object`.** **DONE** — edited `rls_policies.sql` in place (added `v_valid_types`; dynamic `pg_enum` message); byte-identical function copied into the migration before `COMMIT` (accents/comments preserved → fresh==live). Open `Base de donnée DLL et API/rls_policies.sql` and find the enum-validity check (~3101–3110, message `INVALID_OBJECT_TYPE: type d'objet inconnu : %. Types valides : RES, PCU, …RVA` — it omits ACT). Edit **in place** so the message derives the list dynamically: add `v_valid_types TEXT;` to the function's DECLARE block, and replace the hardcoded-list RAISE with:

```sql
    SELECT string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder)
    INTO v_valid_types
    FROM pg_enum e
    WHERE e.enumtypid = 'object_type'::regtype;
    RAISE EXCEPTION 'INVALID_OBJECT_TYPE: type d''objet inconnu : %. Types valides : %',
      p_object_type, v_valid_types
      USING ERRCODE = 'P0001';
```

  (Keep the function's existing ERRCODE/USING form if it differs — only the message construction changes.) Then copy the **entire updated `CREATE OR REPLACE FUNCTION api.rpc_create_object…`** into `migration_facet_applicability.sql` just before `COMMIT;` with a comment `-- §46 side-fix: rpc_create_object now derives the valid-type list from pg_enum (was hardcoded pre-ACT)`. This keeps fresh (rls_policies.sql) and live (migration) identical.

- [x] **Step 3: Run the Task 2 test mentally against the migration** — **DONE: every ASSERT has a corresponding migration statement (cross-checked, no mismatches).** (no runnable local DB): re-read both files side by side and confirm every `ASSERT` has a corresponding statement. Fix mismatches now.

## Task 4: Deploy-integrity wiring + commit

**Files:**
- Modify: `docs/SQL_ROLLOUT_RUNBOOK.md` (manifest, after the 8l line)
- Modify: `Base de donnée DLL et API/ci_fresh_apply.sql` (after the 8l `\ir` pair)
- Modify: `.github/workflows/sql-fresh-apply.yml` (new test step after the `test_ref_commune.sql` step)
- Modify: `README.md` (~line 144 area) and `Base de donnée DLL et API/README.md` (~line 93 area)

- [x] **Step 1: Runbook manifest entry** (insert after 8l): **DONE** (8m entry added after 8l).

```markdown
8m. `migration_facet_applicability.sql` — **§46 type→facet applicability registry**: creates `ref_facet_registry` + `ref_facet_applicability` (single machine-readable source of truth for which object_type may carry which type-specific facet table), attaches `trg_assert_facet_applicable` to the 13 enrolled tables (object_iti family ×7, object_fma ×2, object_act, object_room_type, object_meeting_room, object_menu), guards `object.object_type` changes (`trg_guard_object_type_change`), adds the ops report `api.facet_applicability_violations()`, and side-fixes `rpc_create_object`'s hardcoded (pre-ACT) valid-type message. The editor consumes the same registry (module gating); legacy violating rows are reported, never auto-deleted. After step 6 (needs `api.is_platform_superuser`) and step 1 (facet tables). Idempotent; listed in the manifest (not folded into `schema_unified.sql`).
```

- [x] **Step 2: `ci_fresh_apply.sql`** — **DONE** (8m `\echo`/`\ir` pair added after the 8l pair). after the 8l pair add:

```
\echo '== 8m     migration_facet_applicability.sql  (type→facet registry + triggers + violations fn; needs facet tables + is_platform_superuser) =='
\ir migration_facet_applicability.sql
```

- [x] **Step 3: CI workflow test step.** **DONE** (4-line step with its own `env: DB_URL` added after the ref_commune step). The real step shape in `.github/workflows/sql-fresh-apply.yml` (see the `test_ref_commune.sql` step at lines ~154–157) is a 4-line block **with its own `env:` defining `DB_URL`** — omit it and the step runs `psql ""` and fails to connect. Append a sibling step after the ref_commune one:

```yaml
      - name: facet applicability registry test (§46 — registry + triggers + violations fn)
        env:
          DB_URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
        run: psql "$DB_URL" -v ON_ERROR_STOP=1 -f "Base de donnée DLL et API/tests/test_facet_applicability.sql"
```

  (Tasks 8/9/11/13 reuse this exact 4-line shape for their test steps.)

- [x] **Step 4: Both READMEs** — **DONE** (`5j` line added after `5i` in both READMEs, matching each file's accent style). add one line each in their lettered pre-seed migration lists (ref_commune is `5i` in both — `README.md:144-145`, `Base de donnée DLL et API/README.md:93-94`); 8m becomes **`5j`** (8n/8o/8p in later tasks become `5k`/`5l`/`5m`). The 13c entry (Task 8) does **NOT** go in this lettered list — see Task 8 Step 4.

- [x] **Step 5: Commit** — **DONE: `54beb50`** (9 files, +1711; `editor-validation.test.ts` unstaged, `.research/` untracked; co-author = Claude Opus 4.8 (1M context) per harness). NB: applied to live BEFORE this commit (verified-then-committed). (exclude `bertel-tourism-ui/src/features/object-editor/editor-validation.test.ts` and `docs/superpowers/plans/.research/`):

```bash
git -C "C:\Users\dphil\Bertel3.0" add "Base de donnée DLL et API/migration_facet_applicability.sql" "Base de donnée DLL et API/tests/test_facet_applicability.sql" "Base de donnée DLL et API/ci_fresh_apply.sql" "Base de donnée DLL et API/rls_policies.sql" docs/SQL_ROLLOUT_RUNBOOK.md .github/workflows/sql-fresh-apply.yml README.md "Base de donnée DLL et API/README.md" docs/superpowers/plans/2026-06-10-db-audit-fixes.md
git -C "C:\Users\dphil\Bertel3.0" commit -m "feat(db): §46 type→facet applicability registry + enforcement triggers (manifest 8m)" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

## Task 5: Apply 8m to live + verify

- [x] **Step 1:** **DONE — applied to live** via MCP migration `facet_applicability_registry` (`{success:true}`). `mcp__supabase__apply_migration` with name `facet_applicability_registry`, query = the full content of `migration_facet_applicability.sql` (strip nothing; `BEGIN;`/`COMMIT;` are fine).
- [ ] **Step 2: Read-back verification** via `execute_sql`:

```sql
SELECT (SELECT count(*) FROM ref_facet_registry) AS enrolled,
       (SELECT count(*) FROM ref_facet_applicability) AS pairs,
       (SELECT count(*) FROM pg_trigger WHERE tgname='trg_assert_facet_applicable' AND NOT tgisinternal) AS triggers,
       (SELECT count(*) FROM api.facet_applicability_violations()) AS violations;
```

  Expected: `enrolled=13`, `pairs≥21`, `triggers=13`, `violations=0` (or exactly the conceptually-wrong rows documented in Task 1 Step 2 — list them in the final report if non-zero).
  > **DONE — read-back: `enrolled=13, pairs=21, triggers=13, type_guard=1, violations=0`.** ✓
- [x] **Step 3: Run the Task 2 test body on live** via `execute_sql` — **DONE: green (ran clean to ROLLBACK, no ASSERT raised; no conceptually-wrong pairs so DO#2 zero-violations passed on live too).** (it self-rolls-back). Expected: `NOTICE … assertions passed` — **unless Task 1 Step 2 documented conceptually-wrong pairs that were deliberately left unseeded**, in which case DO #2's zero-violations assert fails on live with exactly those rows: verify the reported set matches the Task 1 exclusion list 1:1 (anything extra = investigate), note it, and rely on CI for the zero-violations guarantee (a fresh DB has no legacy rows). The other DO blocks must pass on live either way.
- [x] **Step 4:** `mcp__supabase__get_advisors` — **DONE: clean.** security = 0 findings on the 5 new objects; performance = only the expected `multiple_permissive_policies` WARN on the 2 `ref_facet_*` tables (standard ref_* pub-read + admin-FOR-ALL overlap, documented acceptable). No `function_search_path_mutable`, no `rls_disabled`, no security-definer flags.

## Task 6: Frontend — honest archetype mapping (kill the silent HEB fallback)

**Files:**
- Modify: `bertel-tourism-ui/src/features/object-editor/archetypes.ts`
- Modify: `bertel-tourism-ui/src/features/object-editor/ObjectEditPage.tsx` (wrapper at lines 32–41, `EditorReady` at 120–131)
- Modify: `bertel-tourism-ui/src/features/object-editor/sections/section-registry.tsx` (lines 32–35, `TypeBlockSection`)
- Test: `bertel-tourism-ui/src/features/object-editor/archetypes.test.ts` (update pinned keys)

Background: the DB enum has 17 values incl. `ACT` and `ORG`; `TYPE_ARCHETYPES` has 16 keys — **missing ACT and ORG, and containing a bogus `SRV` key** (`SRV` is an archetype name, not a DB type). `resolveArchetypeMeta` silently falls back to `HEB_ARCHETYPE`, so an ACT or ORG object renders as a Hébergement (teal accent, rooms UI, HEB publication validation). Decision: **ACT → SRV archetype** (the decision log §41 already groups "service-only (SRV/ACT) objects"); **ORG → deliberately unmapped** — the editor shows an explicit unsupported-type panel (ORGs are managed via `/team` administration, not the tourism-object editor).

- [x] **Step 1: Write the failing tests.** **DONE.** In `archetypes.test.ts`, update/add (adapt to the file's existing style — read it first; it currently pins 16 keys at lines ~23–25):

```ts
import { getArchetypeMeta, TYPE_ARCHETYPES, TYPE_LABEL } from './archetypes';

const DB_OBJECT_TYPES_MINUS_ORG = [
  'RES','PCU','PNA','ITI','VIL','HPA','ASC','COM','HOT','HLO','LOI','FMA','CAMP','PSV','RVA','ACT',
]; // = object_type enum (schema_unified.sql:174 + ALTER :1259) minus ORG (deliberately unmapped)

it('maps exactly the DB enum minus ORG — no phantom keys, no missing types', () => {
  expect(Object.keys(TYPE_ARCHETYPES).sort()).toEqual([...DB_OBJECT_TYPES_MINUS_ORG].sort());
});

it('routes ACT to the SRV archetype', () => {
  expect(getArchetypeMeta('ACT')?.archetype).toBe('SRV');
});

it('returns null for ORG and unknown codes (no silent HEB fallback)', () => {
  expect(getArchetypeMeta('ORG')).toBeNull();
  expect(getArchetypeMeta('XXX')).toBeNull();
});

it('labels ACT and ORG in the topbar vocabulary', () => {
  expect(TYPE_LABEL.ACT).toBeTruthy();
  expect(TYPE_LABEL.ORG).toBeTruthy();
  expect(TYPE_LABEL.SRV).toBeUndefined(); // SRV is not a DB type
});
```

- [x] **Step 2: Run to verify failure:** **DONE — RED: 3 failed (enum-minus-ORG keys, ACT→SRV, TYPE_LABEL), 4 retained tests passed.** `cd bertel-tourism-ui; npx jest src/features/object-editor/archetypes.test.ts` — expected FAIL (SRV key present, ACT missing, etc.). If other existing assertions in that file pin the old 16-key set, update them in the same spirit (the new source of truth is "DB enum minus ORG").

- [x] **Step 3: Edit `archetypes.ts`:** **DONE** (header comment, TYPE_LABEL −SRV +ACT/+ORG, SRV_ARCHETYPE family/covers, TYPE_ARCHETYPES −SRV +ACT + comment, deleted `resolveArchetypeMeta`).
  - `TYPE_LABEL`: remove the `SRV: 'Service',` entry; add `ACT: 'Activite encadree',` and `ORG: 'Organisation',` (file uses accent-free labels — keep that style).
  - `SRV_ARCHETYPE`: change `family` to `'OT · Commerce · Service · Activité encadrée'` and `covers` to `'PSV · VIL · COM · ACT'`.
  - `TYPE_ARCHETYPES`: remove the `SRV: SRV_ARCHETYPE,` entry; add `ACT: SRV_ARCHETYPE,`. Add a comment above the map: `// Keys = DB object_type enum minus ORG (ORG is deliberately unmapped: the editor renders an explicit unsupported-type panel; see ObjectEditPage). SRV/HEB/VIS are archetype names, NOT DB types.`
  - **Delete `resolveArchetypeMeta` entirely** (the silent-fallback function). Before deleting, grep for usages: `cd bertel-tourism-ui; npx rg -n "resolveArchetypeMeta" src/`. Expected: only `ObjectEditPage.tsx:131` (+ its import). If other call sites exist, convert each to `getArchetypeMeta` with an explicit null branch appropriate to that surface (view-only surfaces may keep a neutral default; the *editor* must not).

- [x] **Step 4: Edit `ObjectEditPage.tsx`.** **DONE** (import→getArchetypeMeta+ArchetypeMeta; wrapper guard renders unsupported panel for null meta; `meta` passed as prop; deleted line-131 resolveArchetypeMeta call). The guard must live in the wrapper (before `EditorReady`'s hooks), not inside `EditorReady` (early-returning between hooks violates the rules of hooks). Current wrapper (lines 32–41):

```tsx
export function ObjectEditPage({ objectId }: { objectId: string }) {
  const { data, isError, error } = useObjectWorkspaceQuery(objectId);

  if (isError) {
    return <div className="panel-card panel-card--warning">{(error as Error).message}</div>;
  }
  if (!data) {
    return <div className="panel-card">Chargement de l&apos;éditeur…</div>;
  }
  return <EditorReady resource={data} objectId={objectId} />;
}
```

  (Note the blank line after the `useObjectWorkspaceQuery` const — it is in the real file; include it in your Edit old_string. `ObjectWorkspaceResource.type` is an *optional* string (`type?: string`, `object-workspace.ts:121`) — `getArchetypeMeta` accepts `string | null | undefined`, so the code below compiles as-is.) It becomes:

```tsx
export function ObjectEditPage({ objectId }: { objectId: string }) {
  const { data, isError, error } = useObjectWorkspaceQuery(objectId);
  if (isError) {
    return <div className="panel-card panel-card--warning">{(error as Error).message}</div>;
  }
  if (!data) {
    return <div className="panel-card">Chargement de l&apos;éditeur…</div>;
  }
  // §46: no silent archetype fallback — an unmapped type (ORG, or future enum values not yet
  // wired) gets an explicit unsupported panel instead of rendering as a Hébergement.
  const meta = getArchetypeMeta(data.type);
  if (!meta) {
    return (
      <div className="panel-card panel-card--warning">
        Le type d&apos;objet «{data.type ?? '?'}» n&apos;est pas pris en charge par l&apos;éditeur de fiches.
        Les organisations (ORG) se gèrent via l&apos;administration d&apos;équipe.
      </div>
    );
  }
  return <EditorReady resource={data} objectId={objectId} meta={meta} />;
}
```

  Then in `EditorReady`: add `meta: ArchetypeMeta` to its props, delete line 131 (`const meta = resolveArchetypeMeta(resource.type);`), and fix imports (`getArchetypeMeta, type ArchetypeMeta` instead of `resolveArchetypeMeta`).

- [x] **Step 5: Edit `section-registry.tsx`** — **DONE** (`if (!props.archetype) return null;` replaces the `?? 'HEB'` fallback). — `TypeBlockSection` currently does `const Block = TYPE_BLOCKS[props.archetype ?? 'HEB'];`. The page-level guard means `archetype` is always set when sections render; replace the second silent fallback:

```tsx
function TypeBlockSection(props: SectionProps) {
  // §46: archetype is guaranteed by the ObjectEditPage guard; render nothing rather than
  // silently impersonating the HEB block if a future caller omits it.
  if (!props.archetype) return null;
  const Block = TYPE_BLOCKS[props.archetype];
  return <Block {...props} />;
}
```

- [x] **Step 6: Run tests + typecheck:** **DONE — GREEN:** object-editor suite = 60 passed / 1 failed (only the baseline `editor-validation.test.ts §02 commune`), 194 tests pass incl. new archetypes specs; `npm run typecheck` clean. No spec pinned the old fallback (no extra edits needed).

```bash
cd bertel-tourism-ui
npx jest src/features/object-editor/ --silent
npm run typecheck
```

  Expected: archetypes/section-registry/page suites PASS (the pre-existing `editor-validation.test.ts` failure is baseline — ignore it; everything else green). If `section-registry.test.tsx` or page specs pinned the old fallback behavior, update them to the new contract.

- [ ] **Step 7: Commit:**

```bash
git -C "C:\Users\dphil\Bertel3.0" add bertel-tourism-ui/src/features/object-editor/archetypes.ts bertel-tourism-ui/src/features/object-editor/archetypes.test.ts bertel-tourism-ui/src/features/object-editor/ObjectEditPage.tsx bertel-tourism-ui/src/features/object-editor/sections/section-registry.tsx
git -C "C:\Users\dphil\Bertel3.0" commit -m "fix(editor): honest archetype mapping — ACT→SRV, ORG guard panel, no silent HEB fallback (§46)" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

  (Plus any other spec files updated in Step 6.)

## Task 7: Frontend — registry-driven gating of the 6 type-specific modules

**Files:**
- Modify: `bertel-tourism-ui/src/services/object-workspace.ts` (the §42 block, ~lines 3338–3380)
- Test: `bertel-tourism-ui/src/services/object-workspace.facets.test.ts` (new)

Mapping (module key → enrolled facet table): `rooms→object_room_type`, `meetingRooms→object_meeting_room`, `menus→object_menu`, `activity→object_act`, `event→object_fma`, `itinerary→object_iti`. The other §42 modules (media, capacityPolicies, pricing, memberships) are universal — untouched.

Semantics: if the registry says the object's type is not applicable for a module's facet table, the module gets `unavailableReason` set, which (a) renders the section's disabled-with-reason state and (b) makes the saver skip persistence (existing §28/§40/§41 anti-clobber machinery). **Fail-open:** if the registry fetch fails or returns no rows for a facet table, no gating is applied — the DB trigger from Task 3 remains the hard gate, and a save attempt surfaces its error. This is NOT a regression of §42 (that was an env-flag hiding catalogs from everyone; this is per-type semantics from the DB).

- [ ] **Step 1: Write the failing spec** `src/services/object-workspace.facets.test.ts` (pure-helper tests, mirroring the project's exported-pure-helper convention from §28/§30):

```ts
import { facetUnavailableReason, TYPE_SPECIFIC_MODULE_FACETS } from './object-workspace';

const ROWS = [
  { facetTable: 'object_room_type', objectType: 'HOT' },
  { facetTable: 'object_room_type', objectType: 'HLO' },
  { facetTable: 'object_menu', objectType: 'RES' },
];

describe('facetUnavailableReason (§46 registry gating)', () => {
  it('returns null when the type is applicable', () => {
    expect(facetUnavailableReason('object_room_type', 'HOT', ROWS)).toBeNull();
  });
  it('returns a reason when the type is not applicable', () => {
    expect(facetUnavailableReason('object_menu', 'HOT', ROWS)).toMatch(/non applicable au type HOT/);
  });
  it('fails open when the registry has no rows for that facet (fetch failed / unenrolled)', () => {
    expect(facetUnavailableReason('object_iti', 'HOT', ROWS)).toBeNull();
    expect(facetUnavailableReason('object_menu', 'RES', [])).toBeNull();
  });
  it('fails open when the object type is unknown', () => {
    expect(facetUnavailableReason('object_menu', '', ROWS)).toBeNull();
  });
  it('covers exactly the 6 type-specific modules', () => {
    expect(Object.keys(TYPE_SPECIFIC_MODULE_FACETS).sort()).toEqual(
      ['activity', 'event', 'itinerary', 'meetingRooms', 'menus', 'rooms'].sort(),
    );
  });
});
```

- [ ] **Step 2: Run to verify failure:** `cd bertel-tourism-ui; npx jest src/services/object-workspace.facets.test.ts` — FAIL (exports missing).

- [ ] **Step 3: Implement in `object-workspace.ts`.** Add near the other §4x helpers:

```ts
// §46 — type→facet applicability (mirror of ref_facet_applicability + the DB triggers).
// A non-applicable module is disabled-with-reason (saver skips it: same anti-clobber
// machinery as §28/§40/§41). Fail-open on fetch failure / missing rows — the DB trigger
// stays the hard gate, the UI gate is comfort.
export interface FacetApplicabilityRow {
  facetTable: string;
  objectType: string;
}

export const TYPE_SPECIFIC_MODULE_FACETS = {
  rooms: 'object_room_type',
  meetingRooms: 'object_meeting_room',
  menus: 'object_menu',
  activity: 'object_act',
  event: 'object_fma',
  itinerary: 'object_iti',
} as const;

export function facetUnavailableReason(
  facetTable: string,
  objectType: string,
  rows: FacetApplicabilityRow[],
): string | null {
  if (!objectType) return null;
  const allowed = rows.filter((row) => row.facetTable === facetTable).map((row) => row.objectType);
  if (allowed.length === 0 || allowed.includes(objectType)) return null;
  return `Module non applicable au type ${objectType} (référentiel ref_facet_applicability).`;
}

async function getFacetApplicabilityRows(): Promise<FacetApplicabilityRow[]> {
  const session = useSessionStore.getState();
  if (session.demoMode) return [];
  const client = getSupabaseClient();
  if (!client) return [];
  const result = await client
    .from('ref_facet_applicability')
    .select('facet_table, object_type')
    .in('facet_table', Object.values(TYPE_SPECIFIC_MODULE_FACETS));
  if (result.error) return []; // fail open — see header comment
  return (result.data ?? []).map((row) => ({
    facetTable: readString((row as Record<string, unknown>).facet_table),
    objectType: readString((row as Record<string, unknown>).object_type),
  }));
}
```

  **`readString` signature is `readString(value: unknown, fallback = ''): string` (`object-workspace.ts:243-251`) — it takes the VALUE, not (row, key). `readString(row, 'facet_table')` would return the literal fallback string `'facet_table'` for every row, type-check fine, and silently disable all gating (fail-open forever). Use the keyed-access form above, exactly as `getObjectWorkspaceZonesModule` does at ~4793-4798.**

- [ ] **Step 4: Wire into `getObjectWorkspaceResource`.** In the §42 block (~3344): fetch applicability in the same `Promise.all` round as the 10 module loaders (add `getFacetApplicabilityRows()` as an 11th entry), and determine the object's type the same way the function's return value populates `ObjectWorkspaceResource.type` (read the end of the function to find the exact source — likely `detail` payload; reuse it). Then, after the `Object.assign(modules, { … })`, apply the gate:

```ts
  // §46: registry-driven type gating for the 6 type-specific modules.
  const objectType = (resourceType ?? '').toUpperCase(); // resourceType = same value returned as resource.type
  for (const [moduleId, facetTable] of Object.entries(TYPE_SPECIFIC_MODULE_FACETS)) {
    const reason = facetUnavailableReason(facetTable, objectType, facetRows);
    if (!reason) continue;
    const current = modules[moduleId as keyof typeof TYPE_SPECIFIC_MODULE_FACETS & keyof ObjectWorkspaceModules];
    modules[moduleId as keyof ObjectWorkspaceModules] = {
      ...(current as object),
      unavailableReason: (current as { unavailableReason?: string | null }).unavailableReason ?? reason,
    } as never;
  }
```

  Adapt the typing to the file's idiom (the cast gymnastics above are illustrative; if the module types make a cleaner per-module assignment easier, write six explicit lines instead — clarity beats cleverness).

- [ ] **Step 5: Add the saver guard to ALL 6 modules — none has one today.** Verified inventory (2026-06-10): `saveObjectWorkspaceRooms` (`object-workspace.ts:~3912`) — no guard; `saveObjectWorkspaceMeetingRooms` (~4018) — none; `saveObjectWorkspaceMenus` (~4087) — none; `saveObjectWorkspaceActivity` (~4271) — none; `saveObjectWorkspaceEvent` (~4298) — none, **and it deletes all `object_fma_occurrence` rows (~4323) before reinserting** (worst clobber risk); `saveObjectWorkspaceItinerary` (~4388) — the §28 guard covers **stages only** (`buildItineraryStagesPayload` returns null), while the `object_iti` upsert (~4406) and the `object_iti_practice` delete/reinsert (~4413) are unguarded — **itinerary needs the top guard too, do not judge it compliant.** Guard shape (top of each of the 6 functions): `if (input.unavailableReason) { throw new Error(input.unavailableReason); }` — **throw, don't silently return**: `useEditorSave` counts a returning saver as `saved` and the editor commits the module clean ("Brouillon enregistré"), which would be a CLAUDE.md-class silent write-trap; throwing routes it to the `failed` path with the reason visible. (The guard is unreachable-by-construction in the normal flow — a gated module loads disabled and can't go dirty — this is defense-in-depth.) Parser check: all 6 module types ALREADY declare `unavailableReason: string | null` (`object-workspace-parser.ts:441/459/504/515/533/559`) — **no parser change needed**.

- [ ] **Step 6: Run tests + typecheck:**

```bash
cd bertel-tourism-ui
npx jest src/services/ --silent
npm run typecheck
```

  Expected: new spec PASSES, no regressions in `object-workspace*.test.ts`.

- [ ] **Step 7: Commit:**

```bash
git -C "C:\Users\dphil\Bertel3.0" add bertel-tourism-ui/src/services/object-workspace.ts bertel-tourism-ui/src/services/object-workspace.facets.test.ts
git -C "C:\Users\dphil\Bertel3.0" commit -m "feat(editor): §46 registry-driven type gating for the 6 type-specific modules" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

  (`object-workspace-parser.ts` only if actually modified — per Step 5 it should not be.)

## Task 8: Seed `ref_capacity_applicability` (manifest 13c)

The table exists (SU:2228), has RLS + policies, is read by the Explorer (`explorer-reference.ts:343` → `bucketCapacityOptions`), and has **0 rows** — so Explorer capacity facets filter to nothing. Seeding it is the metric-granular complement of the §46 registry.

**Files:**
- Create: `Base de donnée DLL et API/migration_capacity_applicability_seed.sql`
- Create: `Base de donnée DLL et API/tests/test_capacity_applicability_seed.sql`
- Modify: runbook + `ci_fresh_apply.sql` + workflow + READMEs (same drill as Task 4, position **13c** — after `seeds_data.sql`, which seeds `ref_capacity_metric`)

- [ ] **Step 1: Read `bertel-tourism-ui/src/services/explorer-reference.ts`** around lines 176–186 and 421–422 (`bucketCapacityOptions`, `hotCapacityMetrics`, `resCapacityMetrics`) and note which metric codes each Explorer bucket expects, so the seed makes those buckets non-empty.

- [ ] **Step 2: Write the migration** (PROPOSED matrix — extend per Step 1 findings; loosening later = one INSERT):

```sql
-- migration_capacity_applicability_seed.sql
-- §46 (companion) — seeds ref_capacity_applicability (metric → object_type), which existed since
-- the base schema but had 0 rows: the Explorer's bucketCapacityOptions filtered capacity facets
-- against an empty set (dead facets), and the documented purpose of the table (data dictionary
-- §5.7) was unrealised. Editor §07 does NOT yet filter by this table (deferred — decision log).
-- PREREQUISITES: seeds_data.sql (step 11 — ref_capacity_metric rows). Manifest step 13c.
-- IDEMPOTENT: INSERT … ON CONFLICT DO NOTHING.
-- REVERSIBLE: DELETE FROM ref_capacity_applicability;
BEGIN;

-- max_capacity applies to every object type (cross join with the enum).
INSERT INTO ref_capacity_applicability (metric_id, object_type)
SELECT m.id, e.enumlabel::object_type
FROM ref_capacity_metric m
CROSS JOIN pg_enum e
WHERE m.code = 'max_capacity' AND e.enumtypid = 'object_type'::regtype
ON CONFLICT DO NOTHING;

INSERT INTO ref_capacity_applicability (metric_id, object_type)
SELECT m.id, v.object_type::object_type
FROM ref_capacity_metric m
JOIN (VALUES
  ('beds','HOT'),('beds','HPA'),('beds','HLO'),('beds','CAMP'),('beds','RVA'),
  ('bedrooms','HOT'),('bedrooms','HLO'),('bedrooms','RVA'),
  ('seats','RES'),('seats','LOI'),('seats','PCU'),('seats','FMA'),('seats','ASC'),
  ('standing_places','FMA'),('standing_places','LOI'),('standing_places','PCU'),
  ('pitches','HPA'),('pitches','CAMP'),
  ('campers','HPA'),('campers','CAMP'),
  ('tents','HPA'),('tents','CAMP'),
  ('vehicles','HPA'),('vehicles','CAMP'),('vehicles','PSV'),
  ('bikes','PSV'),('bikes','ITI'),('bikes','LOI'),
  ('meeting_rooms','HOT'),('meeting_rooms','HPA'),('meeting_rooms','HLO'),('meeting_rooms','CAMP'),('meeting_rooms','RVA'),
  ('floor_area_m2','HOT'),('floor_area_m2','COM'),('floor_area_m2','LOI')
) AS v(code, object_type) ON v.code = m.code
ON CONFLICT DO NOTHING;

COMMIT;
```

- [ ] **Step 3: Write the test** `tests/test_capacity_applicability_seed.sql` (same transactional template):

```sql
-- test_capacity_applicability_seed.sql
-- Proves migration_capacity_applicability_seed.sql (§46 companion): ref_capacity_applicability
-- is populated. Run AFTER the full manifest. Transactional (ROLLBACK).
\set ON_ERROR_STOP on
BEGIN;
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM ref_capacity_applicability) >= 30,
         'ref_capacity_applicability still (nearly) empty — seed missing';
  ASSERT EXISTS (SELECT 1 FROM ref_capacity_applicability a JOIN ref_capacity_metric m ON m.id=a.metric_id
                 WHERE m.code='beds' AND a.object_type='HOT'), 'beds must apply to HOT';
  ASSERT NOT EXISTS (SELECT 1 FROM ref_capacity_applicability a JOIN ref_capacity_metric m ON m.id=a.metric_id
                 WHERE m.code='beds' AND a.object_type='RES'), 'beds must NOT apply to RES';
  ASSERT (SELECT count(DISTINCT a.object_type) FROM ref_capacity_applicability a
          JOIN ref_capacity_metric m ON m.id=a.metric_id WHERE m.code='max_capacity') >= 17,
         'max_capacity must apply to every enum value';
  RAISE NOTICE 'capacity applicability seed assertions passed.';
END$$;
ROLLBACK;
```

- [ ] **Step 4: Wiring** — runbook entry `13c` (format as Task 4 Step 1; "After step 11 (needs ref_capacity_metric seeds)"); `ci_fresh_apply.sql` `\echo`/`\ir` pair **after the 13b `\ir` (~lines 85–86) and before the MV-refresh block (~line 91)**; workflow test step (4-line shape from Task 4 Step 3). **READMEs:** the 13c line goes under the post-seed data-fixups section ("# 9. Correctifs de données APRÈS seeds" — `README.md` ~156–158, `Base de donnée DLL et API/README.md` ~105–107), **NOT** in the lettered `5x` pre-seed list — the `5x` list runs before `seeds_data.sql`, where `ref_capacity_metric` is still empty and the seed would silently insert 0 rows.
- [ ] **Step 5: Apply to live** (`apply_migration` name `capacity_applicability_seed`), read back `SELECT count(*) FROM ref_capacity_applicability;` (expected ≥ 30 + 17), run the test body via `execute_sql`.
- [ ] **Step 6: Commit:** `feat(db): seed ref_capacity_applicability — Explorer capacity facets come alive (manifest 13c, §46)`.

---

# Phase B — Write-path convergence (one per-command write-policy family)

## Task 9: `object_fma` write policy (manifest 8n) — fixes a live editor bug

`object_fma` has RLS enabled with only SELECT policies (`pub_fma_published`, `ext_fma_org_actor` — `rls_policies.sql:1108-1116`); **no write policy in any file**, so the editor's direct upsert (`object-workspace.ts:4309`) is denied for every non-service role. Mirror of the `object_act` gap fixed by `migration_object_act_rls.sql` (8g) — but written **per-command** (the new §47 standard), which also means **no P0.3 EXECUTE grant is needed** (per-command write policies never apply to SELECT).

**Files:**
- Create: `Base de donnée DLL et API/migration_object_fma_write_policy.sql`
- Create: `Base de donnée DLL et API/tests/test_object_fma_rls.sql`
- Modify: runbook (8n) + `ci_fresh_apply.sql` + workflow + READMEs

- [ ] **Step 1: Migration:**

```sql
-- migration_object_fma_write_policy.sql
-- §47 — object_fma write policies (gap: RLS enabled since rls_policies.sql but ONLY SELECT
-- policies existed — the editor's direct PostgREST upsert was denied for every non-service role;
-- the analogous object_act gap was fixed by migration_object_act_rls.sql / 8g).
-- Written per-command (canonical_ins/upd/del) per the §47 convergence standard: write predicates
-- never pollute SELECT, so no P0.3 EXECUTE grant is required.
-- PREREQUISITES: rls_policies.sql (step 6), migration_permission_write_paths.sql (8b —
--   api.user_can_write_object_canonical). APPLY AFTER 8m — manifest step 8n.
-- IDEMPOTENT: DROP POLICY IF EXISTS + CREATE POLICY.
-- REVERSIBLE: DROP POLICY canonical_ins_object_fma, canonical_upd_object_fma,
--   canonical_del_object_fma ON object_fma;
BEGIN;

DROP POLICY IF EXISTS "canonical_ins_object_fma" ON object_fma;
CREATE POLICY "canonical_ins_object_fma" ON object_fma
  FOR INSERT WITH CHECK (api.user_can_write_object_canonical(object_id));

DROP POLICY IF EXISTS "canonical_upd_object_fma" ON object_fma;
CREATE POLICY "canonical_upd_object_fma" ON object_fma
  FOR UPDATE USING (api.user_can_write_object_canonical(object_id))
  WITH CHECK (api.user_can_write_object_canonical(object_id));

DROP POLICY IF EXISTS "canonical_del_object_fma" ON object_fma;
CREATE POLICY "canonical_del_object_fma" ON object_fma
  FOR DELETE USING (api.user_can_write_object_canonical(object_id));

COMMIT;
```

- [ ] **Step 2: Test** `tests/test_object_fma_rls.sql` — copy the *structure* (persona blocks, flag pattern) from `tests/test_object_act_rls.sql`, but **NOT its fixture for the owner persona — that file has only anon/stranger/service personas and no owner machinery.** `api.is_object_owner` is **actor-based, not `created_by`-based** (`rls_policies.sql:202-213`: primary `actor_object_role` resolved via `api.user_actor_ids()` = an `actor_channel` email-kind row matching `api.current_user_email()`, `rls_policies.sql:110-118`). The only existing owner-fixture recipe is in `tests/test_cards_published_fastpath.sql` — copy from there: insert `auth.users` + `app_user_profile`, an `actor`, an `actor_channel` (email kind, value = the same email), an `actor_object_role` with `is_primary = TRUE` on the fixture object, and put that **email claim in the persona JWT** (`set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role','authenticated', 'email', v_email)::text, true)`) so `api.current_user_email()` resolves it. Fixture object is **type FMA** (the 8m trigger now enforces it). Asserts: owner persona can INSERT/UPDATE/DELETE `object_fma`, stranger cannot, anon sees published-only via the existing read pair. Structural: the 3 per-command policies exist with `cmd IN ('INSERT','UPDATE','DELETE')` and **no** `cmd='ALL'` policy on `object_fma`.
- [ ] **Step 3: TDD red:** run the test body on live via `execute_sql` → expected failure at the structural assert. Then wiring (runbook 8n + ci_fresh_apply + workflow step + READMEs).
- [ ] **Step 4: Apply to live** (`apply_migration` name `object_fma_write_policy`), re-run test body → green; `get_advisors` clean.
- [ ] **Step 5: Commit:** `fix(db): object_fma per-command canonical write policies — editor FMA upsert was RLS-denied (manifest 8n, §47)`.

## Task 10: Per-command restructure migration (manifest 8o)

This is the deferred item itself: *"`FOR ALL`→per-command write-policy restructuring … so the write policies stop polluting SELECT"* + the SP-1b cleanup *"consolidate owner_*/workspace_* to one write policy per table"*. **93 `FOR ALL` policies across 57 tables collapse into one per-command triple per table** (30 workspace + 22 owner + 27 canonical SP-1b + 1 object_act + 13 legacy/admin incl. the two the first sweep missed: `object_external_id`, `promotion_object`).

**Files:**
- Create: `Base de donnée DLL et API/migration_write_policy_percommand.sql`
- Reference (read, do not modify): `migration_permission_write_paths.sql`, `migration_permission_write_paths_b.sql`, `object_workspace_safe_write_rpcs.sql:198-384`, `rls_policies.sql` (residual policies at 942–996, 1062–1068, 1097, 1186–1223, 1290, 1374–1482, 1495–1545, 1700), `migration_object_act_rls.sql`.

**The recipe (apply to every table in the matrix below):**
1. `DROP POLICY IF EXISTS` every existing write policy on the table (exact names in the matrix).
2. `CREATE POLICY "canonical_ins_<table>" … FOR INSERT WITH CHECK (<predicate>);`
3. `CREATE POLICY "canonical_upd_<table>" … FOR UPDATE USING (<predicate>) WITH CHECK (<predicate>);`
4. `CREATE POLICY "canonical_del_<table>" … FOR DELETE USING (<predicate>);`
5. No `TO` clause (applies to all roles — matches today's `owner_*`/`canonical_write_*` behavior; `service_role` bypasses RLS regardless; anon evaluates the canonical predicate to `false` and has EXECUTE on it since P0.3).
6. `(select auth.role())` wrapping wherever an `auth.*` call appears (§39).

**Predicate classes** (write each table's from its class; `CANON(x)` ≡ `api.user_can_write_object_canonical(x)`):

- **class D (direct):** `CANON(object_id)`
- **class S (source):** `CANON(source_object_id)` — object_relation
- **class P (parent col):** `CANON(parent_object_id)` — object_iti_section
- **class E(parent_table, fk, parent_key=id):** `EXISTS (SELECT 1 FROM <parent> pp WHERE pp.<parent_key> = <fk> AND api.user_can_write_object_canonical(pp.object_id))` — copy the exact join used by the table's current `canonical_write_*`/`owner_*` EXISTS policy (read it in the source file; for `opening_time_period`/`opening_time_period_weekday`/`opening_time_frame` copy the multi-hop joins from their `workspace_*` policies at `object_workspace_safe_write_rpcs.sql:217-267`).
- **class X (object XOR place):**
  ```sql
  (object_id IS NOT NULL AND api.user_can_write_object_canonical(object_id))
  OR (place_id IS NOT NULL AND EXISTS (
       SELECT 1 FROM object_place p
       WHERE p.id = place_id AND api.user_can_write_object_canonical(p.object_id)))
  ```
  — media, object_location. **This preserves the `workspace_*` place-path that a naive `CANON(object_id)` would silently drop (it would break §40 sub-place media/location writes).** Read the current `workspace_media_write` / `workspace_location_write` (safe_write_rpcs:357-381) and match their place-path join exactly (column names may differ — e.g. location's place FK).
- **class CARVE (description §20 carve-out — preserve verbatim):** `api.is_object_owner(object_id) OR (api.user_can_write_canonical(object_id) AND org_object_id IS NULL)` — object_description only.
- **class M (membership):** `(select auth.role()) IN ('service_role','admin') OR api.user_can_write_object_canonical(COALESCE(object_id, org_object_id))` — object_membership.
- **class T (tag_link polymorphic):** `(target_table = 'object' AND api.user_can_write_object_canonical(target_pk)) OR (select auth.role()) IN ('service_role','admin')` — the admin arm preserves today's `admin_tag_link_write` ability to manage non-object tags.
- **class A (admin-only):** `(select auth.role()) IN ('service_role','admin') OR api.is_platform_superuser()` — object_review, object_origin, object_external_id, promotion_object (no canonical write today; keep their semantics, just per-command). **Class A policies are named `admin_ins/upd/del_<table>`** (not `canonical_*` — they carry no canonical predicate); every other class uses `canonical_ins/upd/del_<table>`.
- **+CREATEDBY suffix:** OR-append the table's legacy `created_by` form from Task 10 Step 1 — object_room_type, object_room_type_amenity, object_room_type_media, media_tag.
- **+ADMIN suffix:** OR-append `(select auth.role()) IN ('service_role','admin') OR api.is_platform_superuser()` — for tables that today carry an extra admin `FOR ALL` policy (sustainability pair), so no role loses ability.

**The matrix** (table → class → policies to DROP; drop names verified against the research inventory — re-grep each name before writing to catch drift):

| # | Table | Class | DROP these policies |
|---|-------|-------|---------------------|
| 1 | opening_period | D | workspace_opening_period_write; canonical_write_opening_period |
| 2 | opening_schedule | E(opening_period, period_id) | workspace_opening_schedule_write; canonical_write_opening_schedule |
| 3 | opening_time_period | E(schedule→period) | workspace_opening_time_period_write *(no canonical existed — this CLOSES the SP-1b hole)* |
| 4 | opening_time_period_weekday | E(tp→schedule→period) | workspace_opening_weekday_write *(same hole)* |
| 5 | opening_time_frame | E(tp→schedule→period) | workspace_opening_frame_write; canonical_write_opening_time_frame |
| 6 | object_language | D | workspace_direct_object_language_write; canonical_write_object_language |
| 7 | object_payment_method | D | workspace_direct_object_payment_write; canonical_write_object_payment_method |
| 8 | object_environment_tag | D | workspace_direct_object_environment_write; canonical_write_object_environment_tag |
| 9 | object_amenity | D | workspace_direct_object_amenity_write; canonical_write_object_amenity |
| 10 | object_capacity | D | workspace_direct_object_capacity_write; canonical_write_object_capacity |
| 11 | object_group_policy | D | workspace_direct_group_policy_write; owner_write_group_policy |
| 12 | object_pet_policy | D | workspace_direct_pet_policy_write; owner_pet_policy_write |
| 13 | object_price | D | workspace_direct_price_write; owner_price_write |
| 14 | object_discount | D | workspace_direct_discount_write; owner_write_discount |
| 15 | object_price_period | E(object_price, price_id) | workspace_direct_price_period_write; owner_price_period_write |
| 16 | object_iti | D | workspace_iti_write; canonical_write_object_iti |
| 17 | object_iti_practice | D | workspace_iti_practice_write; canonical_write_object_iti_practice |
| 18 | object_iti_info | D | workspace_iti_info_write; canonical_write_object_iti_info |
| 19 | object_iti_stage | D | workspace_iti_stage_write; canonical_write_object_iti_stage |
| 20 | object_iti_section | P | workspace_iti_section_write; canonical_write_object_iti_section |
| 21 | object_iti_profile | D | workspace_iti_profile_write; canonical_write_object_iti_profile |
| 22 | object_iti_associated_object | D | workspace_iti_assoc_write; canonical_write_object_iti_associated_object |
| 23 | object_iti_stage_media | E(object_iti_stage, stage_id) | workspace_iti_stage_media_write; owner_iti_stage_media_write |
| 24 | object_relation | S | workspace_object_relation_write; canonical_write_object_relation; admin_relation_write |
| 25 | object_org_link | D | workspace_org_link_write; canonical_write_object_org_link |
| 26 | object_place | D | workspace_place_write; owner_write_place |
| 27 | object_zone | D | workspace_zone_write; canonical_write_object_zone |
| 28 | object_location | X | workspace_location_write; owner_write_location |
| 29 | object_place_description | E(object_place, place_id) | workspace_place_description_write; canonical_write_object_place_description; admin_place_description_write |
| 30 | media | X | workspace_media_write; owner_write_media |
| 31 | media_tag | E(media, media_id — media's X-path leaf) +CREATEDBY | "Écriture media_tag par propriétaire" |
| 32 | contact_channel | D | owner_write_contact |
| 33 | object_legal | D | owner_write_legal |
| 34 | object_menu | D | owner_menu_write |
| 35 | object_menu_item | E(object_menu, menu_id) | owner_menu_item_write |
| 36 | object_menu_item_dietary_tag | E(item→menu) | owner_menu_item_dietary_write |
| 37 | object_menu_item_allergen | E(item→menu) | owner_menu_item_allergen_write |
| 38 | object_menu_item_cuisine_type | E(item→menu) | owner_menu_item_cuisine_write |
| 39 | object_menu_item_media | E(item→menu) | owner_menu_item_media_write |
| 40 | object_meeting_room | D | owner_meeting_room_write |
| 41 | meeting_room_equipment | E(object_meeting_room, **room_id**) | owner_meeting_room_equipment_write |
| 42 | object_room_type | D +CREATEDBY | canonical_write_object_room_type; "Écriture types de chambre par propriétaire" |
| 43 | object_room_type_amenity | E(object_room_type, room_type_id) +CREATEDBY | canonical_write_object_room_type_amenity; "Écriture amenities chambre par propriétaire" *(grep rls_policies.sql:1204 for the exact name)* |
| 44 | object_room_type_media | E(object_room_type, room_type_id) +CREATEDBY | canonical_write_object_room_type_media; legacy room-type-media policy *(rls_policies.sql:1223 — exact name by grep)* |
| 45 | object_fma_occurrence | D | owner_fma_occurrence_write |
| 46 | object_membership | M | owner_object_membership_write |
| 47 | object_description | CARVE | owner_write_description |
| 48 | object_sustainability_action | D +ADMIN | canonical_write_object_sustainability_action; "Accès admin/service_role (object_sustainability_action)" *(rls_policies.sql:1062 — exact name by grep)* |
| 49 | object_sustainability_action_label | E(object_sustainability_action, **object_sustainability_action_id**) +ADMIN | canonical_write_object_sustainability_action_label; the :1068 admin policy *(exact name by grep)* |
| 50 | object_classification | D | canonical_write_object_classification |
| 51 | object_taxonomy | D | canonical_write_object_taxonomy |
| 52 | tag_link | T | canonical_write_tag_link; admin_tag_link_write |
| 53 | object_review | A | "Écriture admin des avis" *(rls_policies.sql:1097 — exact name by grep)* |
| 54 | object_origin | A | admin_origin_write |
| 55 | object_act | D | canonical_write_object_act |
| 56 | object_external_id | A | "Accès admin/service_role (object_external_id)" *(rls_policies.sql:1058 — exact name by grep; missed by the first sweep)* |
| 57 | promotion_object | A | "Écriture admin des liaisons promotions" *(rls_policies.sql:1245 — exact name by grep; missed by the first sweep)* |

- [ ] **Step 1: Verify the predicate baseline.** Confirm with greps that `api.user_can_write_object_canonical` = `is_object_owner(obj) OR user_can_write_canonical(obj)` (`migration_permission_write_paths.sql:18-25`), so dropping the `workspace_*`/`owner_*` `is_object_owner` policies loses nothing. **Already decided from evidence (do not re-litigate): `api.is_object_owner` is actor-link-based (`rls_policies.sql:202-213`), NOT `created_by`-based — so the four legacy `created_by` policies (`object_room_type` :1186, `object_room_type_amenity` :1204, `object_room_type_media` :1223, `media_tag` :1290) ARE materially different, and those four tables' new predicates MUST OR-in the legacy form (class suffix +CREATEDBY in the matrix):**

```sql
-- object_room_type:
OR EXISTS (SELECT 1 FROM object o WHERE o.id = object_id AND o.created_by = (select auth.uid()))
-- object_room_type_amenity / object_room_type_media (key room_type_id):
OR EXISTS (SELECT 1 FROM object_room_type rt JOIN object o ON o.id = rt.object_id
           WHERE rt.id = room_type_id AND o.created_by = (select auth.uid()))
-- media_tag (key media_id; media may be place-scoped — created_by leg covers the object leg only,
-- the canonical leg covers the rest via media's X-path):
OR EXISTS (SELECT 1 FROM media m JOIN object o ON o.id = m.object_id
           WHERE m.id = media_id AND o.created_by = (select auth.uid()))
```

  Record in the migration header that +CREATEDBY preserves the legacy union (CLAUDE.md: the additive principle exists because removing the legacy owner path would brick the only seeded user) and is a candidate for retirement once actor links / permission grants cover those users.
- [ ] **Step 2: Verify every DROP name.** `npx rg -n "CREATE POLICY" "Base de donnée DLL et API/object_workspace_safe_write_rpcs.sql" "Base de donnée DLL et API/migration_permission_write_paths.sql" "Base de donnée DLL et API/migration_permission_write_paths_b.sql" "Base de donnée DLL et API/migration_object_act_rls.sql" "Base de donnée DLL et API/rls_policies.sql"` and reconcile against the matrix. Also `SELECT tablename, policyname, cmd FROM pg_policies WHERE schemaname='public' ORDER BY 1,2;` on **live** — live is the operative truth; any live-only write policy name not in the matrix gets added to the DROP list (and reported).
- [ ] **Step 3: Write the migration** with the standard header (PREREQUISITES: 8b/8c/8g/8n; manifest step **8o**; IDEMPOTENT: DROP IF EXISTS + CREATE; REVERSIBLE: "re-run migration_permission_write_paths.sql + _b.sql + the workspace policy block of object_workspace_safe_write_rpcs.sql:198-384 + migration_object_act_rls.sql"), then the 55 table blocks expanded from the recipe + matrix. Three fully-expanded examples to copy the shape from (class D, E, X):

```sql
-- 1. opening_period (class D) ------------------------------------------------
DROP POLICY IF EXISTS "workspace_opening_period_write" ON opening_period;
DROP POLICY IF EXISTS "canonical_write_opening_period" ON opening_period;
DROP POLICY IF EXISTS "canonical_ins_opening_period" ON opening_period;
CREATE POLICY "canonical_ins_opening_period" ON opening_period
  FOR INSERT WITH CHECK (api.user_can_write_object_canonical(object_id));
DROP POLICY IF EXISTS "canonical_upd_opening_period" ON opening_period;
CREATE POLICY "canonical_upd_opening_period" ON opening_period
  FOR UPDATE USING (api.user_can_write_object_canonical(object_id))
  WITH CHECK (api.user_can_write_object_canonical(object_id));
DROP POLICY IF EXISTS "canonical_del_opening_period" ON opening_period;
CREATE POLICY "canonical_del_opening_period" ON opening_period
  FOR DELETE USING (api.user_can_write_object_canonical(object_id));

-- 2. opening_schedule (class E via opening_period) ----------------------------
DROP POLICY IF EXISTS "workspace_opening_schedule_write" ON opening_schedule;
DROP POLICY IF EXISTS "canonical_write_opening_schedule" ON opening_schedule;
DROP POLICY IF EXISTS "canonical_ins_opening_schedule" ON opening_schedule;
CREATE POLICY "canonical_ins_opening_schedule" ON opening_schedule
  FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM opening_period p
    WHERE p.id = period_id AND api.user_can_write_object_canonical(p.object_id)));
DROP POLICY IF EXISTS "canonical_upd_opening_schedule" ON opening_schedule;
CREATE POLICY "canonical_upd_opening_schedule" ON opening_schedule
  FOR UPDATE USING (EXISTS (
    SELECT 1 FROM opening_period p
    WHERE p.id = period_id AND api.user_can_write_object_canonical(p.object_id)))
  WITH CHECK (EXISTS (
    SELECT 1 FROM opening_period p
    WHERE p.id = period_id AND api.user_can_write_object_canonical(p.object_id)));
DROP POLICY IF EXISTS "canonical_del_opening_schedule" ON opening_schedule;
CREATE POLICY "canonical_del_opening_schedule" ON opening_schedule
  FOR DELETE USING (EXISTS (
    SELECT 1 FROM opening_period p
    WHERE p.id = period_id AND api.user_can_write_object_canonical(p.object_id)));

-- 30. media (class X — preserves the workspace place-path; §40 sub-place media) ----
DROP POLICY IF EXISTS "workspace_media_write" ON media;
DROP POLICY IF EXISTS "owner_write_media" ON media;
DROP POLICY IF EXISTS "canonical_ins_media" ON media;
CREATE POLICY "canonical_ins_media" ON media
  FOR INSERT WITH CHECK (
    (object_id IS NOT NULL AND api.user_can_write_object_canonical(object_id))
    OR (place_id IS NOT NULL AND EXISTS (
         SELECT 1 FROM object_place p
         WHERE p.id = place_id AND api.user_can_write_object_canonical(p.object_id))));
DROP POLICY IF EXISTS "canonical_upd_media" ON media;
CREATE POLICY "canonical_upd_media" ON media
  FOR UPDATE USING (
    (object_id IS NOT NULL AND api.user_can_write_object_canonical(object_id))
    OR (place_id IS NOT NULL AND EXISTS (
         SELECT 1 FROM object_place p
         WHERE p.id = place_id AND api.user_can_write_object_canonical(p.object_id))))
  WITH CHECK (
    (object_id IS NOT NULL AND api.user_can_write_object_canonical(object_id))
    OR (place_id IS NOT NULL AND EXISTS (
         SELECT 1 FROM object_place p
         WHERE p.id = place_id AND api.user_can_write_object_canonical(p.object_id))));
DROP POLICY IF EXISTS "canonical_del_media" ON media;
CREATE POLICY "canonical_del_media" ON media
  FOR DELETE USING (
    (object_id IS NOT NULL AND api.user_can_write_object_canonical(object_id))
    OR (place_id IS NOT NULL AND EXISTS (
         SELECT 1 FROM object_place p
         WHERE p.id = place_id AND api.user_can_write_object_canonical(p.object_id))));
```

  All other tables follow these three shapes with their class's predicate. **Column names in E-class joins must be read from the existing policies, not guessed** (`period_id`, `schedule_id`, `time_period_id`, `price_id`, `menu_id`, `menu_item_id`, `stage_id`, `room_type_id`, **`room_id`** (meeting_room_equipment — NOT `meeting_room_id`), `place_id`, `media_id`, **`object_sustainability_action_id`** (action_label — NOT `action_id`) — verify each against the source policy you are dropping).
- [ ] **Step 4: End-of-migration safety net.** Append a verification DO block inside the migration (fails the transaction if the restructure left a `FOR ALL` behind):

```sql
DO $$
DECLARE v_leftover text;
BEGIN
  SELECT string_agg(tablename || '.' || policyname, ', ')
  INTO v_leftover
  FROM pg_policies
  WHERE schemaname='public' AND cmd='ALL'
    AND tablename IN (
      'opening_period','opening_schedule','opening_time_period','opening_time_period_weekday',
      'opening_time_frame','object_language','object_payment_method','object_environment_tag',
      'object_amenity','object_capacity','object_group_policy','object_pet_policy','object_price',
      'object_discount','object_price_period','object_iti','object_iti_practice','object_iti_info',
      'object_iti_stage','object_iti_section','object_iti_profile','object_iti_associated_object',
      'object_iti_stage_media','object_relation','object_org_link','object_place','object_zone',
      'object_location','object_place_description','media','media_tag','contact_channel',
      'object_legal','object_menu','object_menu_item','object_menu_item_dietary_tag',
      'object_menu_item_allergen','object_menu_item_cuisine_type','object_menu_item_media',
      'object_meeting_room','meeting_room_equipment','object_room_type','object_room_type_amenity',
      'object_room_type_media','object_fma','object_fma_occurrence','object_membership',
      'object_description','object_sustainability_action','object_sustainability_action_label',
      'object_classification','object_taxonomy','tag_link','object_review','object_origin','object_act',
      'object_external_id','promotion_object');
  IF v_leftover IS NOT NULL THEN
    RAISE EXCEPTION '§47 restructure incomplete — FOR ALL policies remain: %', v_leftover;
  END IF;
END$$;
```

- [ ] **Step 5: Frontend impact check (CLAUDE.md rule):** none expected — effective permissions are unchanged (canonical ⊇ owner; admin arms preserved). State this explicitly in the migration header and the decision log. The RPC paths (`SECURITY INVOKER` + `workspace_assert_can_write_object`) now rely on the canonical per-command policies, same predicate as the gate itself — closing the latent failure where a permission-based (non-owner) canonical writer passed the RPC gate but died on a `workspace_*` `is_object_owner` policy (`opening_time_period`/`weekday`).

## Task 11: Structural + persona test for 8o

**Files:**
- Create: `Base de donnée DLL et API/tests/test_write_policy_percommand.sql`
- Modify: `Base de donnée DLL et API/tests/test_object_act_rls.sql` — **CI-blocker if skipped:** its structural assert (lines ~26–30) pins policy `canonical_write_object_act` with `cmd='ALL'`, which matrix row 55 drops (and the 8o safety-net DO block forbids leaving). Rewrite that assert to require the per-command triple instead: `canonical_ins_object_act` (`cmd='INSERT'`), `canonical_upd_object_act` (`cmd='UPDATE'`), `canonical_del_object_act` (`cmd='DELETE'`), and zero `cmd='ALL'` write policies on `object_act`. The behavioral persona blocks below it stay unchanged (they must still pass — that is the point).
- Modify: `Base de donnée DLL et API/tests/test_sp1_canonical_write_auth.sql` — **second CI-blocker if skipped:** lines ~52–57 hard-require a policy named `owner_write_description` with `qual LIKE '%user_can_write_canonical%'`, which matrix row 47 drops. Rewrite that assert to require the per-command `object_description` triple (`canonical_ins/upd/del_object_description`) whose `qual`/`with_check` contain **both** `user_can_write_canonical` and `org_object_id` (the §20 carve-out preserved). The legacy-name IN-list at lines ~35–50 becomes vacuously green after 8o (no rows match) — acceptable; add a one-line comment there saying so.
- Verify (no change expected): `Base de donnée DLL et API/tests/test_sp1b_canonical_coverage.sql` — its check is `cmd IN ('ALL','INSERT','UPDATE')`, so the per-command form keeps it green. Re-read to confirm; do not weaken it.

- [ ] **Step 1: Write the test.** Structure (full file, following the house template):
  1. `\set ON_ERROR_STOP on`, `BEGIN;`.
  2. **DO #1 — structural:** the same 58-table list as Task 10 Step 4 (matrix 57 + `object_fma` from 8n); assert (a) zero `cmd='ALL'` policies, (b) for each table: ≥1 INSERT policy named `canonical_ins_%` or `admin_ins_%` (class A tables — object_review/object_origin/object_external_id/promotion_object — use the `admin_*` family per the Task 10 recipe), ≥1 UPDATE, ≥1 DELETE (use a FOREACH loop accumulating missing entries like `test_sp1b_canonical_coverage.sql` does), (c) `has_function_privilege('anon','api.user_can_write_object_canonical(text)','EXECUTE')` still true (defense-in-depth, P0.3 heritage).
  3. **DO #2 — personas.** Owner fixture: **NOT `created_by` and NOT the `test_object_act_rls.sql` fixture** (it has no owner persona) — `api.is_object_owner` requires a primary actor link (`rls_policies.sql:202-213` via `api.user_actor_ids()`/`api.current_user_email()`, `:110-118`). Copy the owner recipe from `tests/test_cards_published_fastpath.sql`: `auth.users` + `app_user_profile` + `actor` + `actor_channel` (email kind, same email) + `actor_object_role(is_primary=TRUE)` on the fixture object, and include the `email` claim in the owner JWT. Then: create a draft HOT object owned (actor-linked) by the owner; as owner (`SET LOCAL ROLE authenticated` + owner JWT): INSERT an `opening_period`, UPDATE it, INSERT + UPDATE + DELETE a `contact_channel`, INSERT an `object_place` then a place-scoped `media` row (class X place path — **this is the regression test for §40 sub-place media**); as stranger (authenticated, no actor link, no grants): each of those INSERTs must raise `insufficient_privilege` (flag pattern); as anon: `SELECT count(*)` on `opening_period` for the draft object must be 0 (read gate unchanged), and on a published fixture object must succeed without error (**proves SELECT no longer needs the write predicates**).
  4. `ROLLBACK;`.
- [ ] **Step 2: Wiring:** workflow test step (4-line shape) + (the migration's `\ir` goes in `ci_fresh_apply.sql` at position 8o) + runbook entry 8o + READMEs (letter `5l`). **Also add a caveat line to the runbook's "Incremental Update Order" section** (`docs/SQL_ROLLOUT_RUNBOOK.md` ~lines 65–76): *"After re-applying `rls_policies.sql` or `object_workspace_safe_write_rpcs.sql` to a deployed DB, ALWAYS re-run `migration_write_policy_percommand.sql` (8o) — those source files still create the retired `FOR ALL` families, and the incremental order runs migrations before them, so skipping this silently resurrects ~90 FOR ALL policies on live (P0.3 gotcha returns; `test_write_policy_percommand.sql` would flag it as live-vs-fresh drift)."* (Fresh-apply is safe without this — all FOR ALL creators sit at steps 6/7/8b/8c/8g, before 8o.) Runbook entry text:

```markdown
8o. `migration_write_policy_percommand.sql` — **§47 write-path convergence**: collapses the 4 overlapping `FOR ALL` write-policy families (`owner_*` SP-1, `workspace_*`, `canonical_write_*` SP-1b, legacy admin) into ONE per-command triple per table (`canonical_ins/upd/del_<table>`; admin-only tables use `admin_ins/upd/del_<table>`; predicate `api.user_can_write_object_canonical` + documented carve-outs: §20 description, membership/tag_link admin arms, media/location object-XOR-place dual path, +CREATEDBY legacy legs on the room-type trio and media_tag) across 57 object-child tables. Per-command policies no longer apply to SELECT ⇒ ends the P0.3 write-predicate-pollutes-read gotcha class and unblocks set-based read gates (8p). Also closes the SP-1b holes (`opening_time_period`/`_weekday` had only `is_object_owner` workspace policies — permission-based canonical writers failed mid-RPC). Effective permissions unchanged (canonical ⊇ owner; admin arms preserved); live persona-probe verified. After 8b/8c/8g/8n. Idempotent; NOT folded (supersedes policy blocks across 5 source files — see header).
```

## Task 12: Apply 8o to live with before/after evidence

- [ ] **Step 1: Pre-snapshot** via `execute_sql`: `SELECT tablename, policyname, cmd FROM pg_policies WHERE schemaname='public' AND tablename IN (<the 58-table list from Task 10 Step 4>) ORDER BY 1,2;` — save the output in your working notes.
- [ ] **Step 2: Pre-probe.** Run a transactional persona probe (the DO #2 block of `test_write_policy_percommand.sql`, wrapped in `BEGIN;…ROLLBACK;`) via `execute_sql` against live **before** applying — it must PASS already (it tests behavior that must be invariant across the restructure). If it fails pre-apply, stop: the probe found a live-vs-repo drift; report instead of applying.
- [ ] **Step 3: Apply** `apply_migration` name `write_policy_percommand`. The end-of-migration DO block self-verifies zero leftover FOR ALL.
- [ ] **Step 4: Post-snapshot + post-probe** — same two scripts; diff snapshots (expect: only the matrix's DROP/CREATE deltas), probe still green.
- [ ] **Step 5:** `get_advisors` (both types). Expect the multiple-permissive-policies warnings to *shrink*; no new errors.
- [ ] **Step 6: Commit** SQL + wiring **including the updated `tests/test_object_act_rls.sql`** (Task 11 blocker fix — committing 8o without it breaks the CI gate): `refactor(db): §47 per-command write policies — one canonical family, FOR ALL retired across 55 object-child tables (manifest 8o)`.

## Task 13: Set-based read gates (manifest 8p)

With write policies out of SELECT, the P0.3 read policies can adopt the §38 split form. Scope: **only** the flat policies of the exact form `read_<t> … USING (api.can_read_object(<col>))` — **25 policies**: 24 from `migration_rls_read_gate_p03.sql` (object_place, object_price, object_capacity, object_zone, object_org_link, object_origin, object_fma_occurrence, object_pet_policy, object_menu, object_meeting_room, object_iti_practice, object_iti_stage, object_iti_info, object_iti_associated_object, object_iti_profile, opening_period, object_classification, object_amenity, object_environment_tag, object_language, object_payment_method, promotion_object — plus object_relation on `source_object_id` and object_iti_section on `parent_object_id`) **+ `read_object_act`** (same flat form, created later by `migration_object_act_rls.sql:42-46`). Rewriting `read_object_act` ALSO requires updating the read-policy qual assert in `tests/test_object_act_rls.sql` (lines ~22–25) to accept the §38 form — same file Task 11 already touches for the write triple; commit this edit with 8p. NOT in scope: `object_iti` (its read gate is the separate `pub_iti_published`/`ext_iti_org_actor` pair, `rls_policies.sql:1116-1121`) and the nested EXISTS-chain policies (menu items, opening sub-tree, media_tag, place_description, tag_link, location) — their leaf already probes through a parent; log as deferred-remainder.

**Files:**
- Create: `Base de donnée DLL et API/migration_child_read_gate_setbased.sql`
- Modify: `Base de donnée DLL et API/tests/test_write_policy_percommand.sql` (extend DO #1 with the read-form asserts). **Do NOT create a file named `test_read_gate_setbased.sql` — it already exists** (`tests/test_read_gate_setbased.sql` is the §35 *object*-policy test, CI-wired at `sql-fresh-apply.yml` ~129–132); overwriting it destroys §35 coverage. If a dedicated file is preferred over extending, name it `test_child_read_gate_setbased.sql`.
- Modify: `Base de donnée DLL et API/tests/test_p03_read_gate_coverage.sql` — **CI-blocker if skipped:** its assert #2 (lines ~31–41) requires every covered table's SELECT policy `qual` to be `ILIKE '%can_read_object%'` / `'%can_read_extended%'`; the §38 form contains neither string, so the gate goes red after this migration. Add `'%current_user_extended_object_ids%'` as an accepted qual form in that ILIKE check (keep the old forms accepted — the nested-EXISTS policies still use `can_read_object`). Commit it with 8p.

- [ ] **Step 1: Confirm prerequisites on live:** `SELECT has_function_privilege('anon','api.current_user_extended_object_ids()','EXECUTE') AS anon_ok, has_function_privilege('authenticated','api.current_user_extended_object_ids()','EXECUTE') AS auth_ok;` (verify the exact signature first with `\df`-equivalent: `SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='api' AND p.proname='current_user_extended_object_ids';`). If anon lacks EXECUTE, the migration must `GRANT EXECUTE … TO anon, authenticated` (it returns an empty set for anon — safe, same §35 logic as the `object` policy).
- [ ] **Step 2: Write the migration.** Header: PREREQUISITES 8d (p03) + 8o (write policies out of SELECT) — manifest step **8p**; IDEMPOTENT (DROP IF EXISTS + CREATE); REVERSIBLE ("re-create the p03 form: `CREATE POLICY "read_<t>" … USING (api.can_read_object(<col>))`"). Template (×24, substituting table + column):

```sql
-- §38-form read gate: published via a cheap correlated PK probe, the user's extended set via
-- ONE InitPlan (set-based, §35) — never a per-row can_read_object() scalar.
DROP POLICY IF EXISTS "read_object_amenity" ON object_amenity;
CREATE POLICY "read_object_amenity" ON object_amenity
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM object o WHERE o.id = object_id AND o.status = 'published')
    OR object_id IN (SELECT api.current_user_extended_object_ids())
  );
```

  (`object_relation` uses `source_object_id`; `object_iti_section` uses `parent_object_id`; ×25 including `read_object_act`.) Semantics are byte-identical to `can_read_object` = published OR extended (§36/§38 established the set-equivalence).
- [ ] **Step 3: Tests.** Extend the structural DO of Task 11's test (or the dedicated file): for each of the 25 tables, assert the read policy `qual` contains `current_user_extended_object_ids` and does NOT contain `can_read_object` (`SELECT qual FROM pg_policies WHERE policyname='read_<t>'…`). Persona reassert: anon sees published-only (already covered by Task 11 DO #2 — keep green). A NEW workflow test step is needed **only if** the dedicated `test_child_read_gate_setbased.sql` option was taken — if the asserts went into `test_write_policy_percommand.sql`, its existing step already covers them (do not add a duplicate).
- [ ] **Step 4: EXPLAIN evidence on live** (before/after, via `execute_sql`):

```sql
BEGIN;
SELECT set_config('request.jwt.claims', json_build_object('role','authenticated','sub','00000000-0000-0000-0000-000000000000')::text, true);
SET LOCAL ROLE authenticated;
EXPLAIN (COSTS OFF) SELECT count(*) FROM object_amenity;
ROLLBACK;
```

  Expected after: one `InitPlan` on `current_user_extended_object_ids` + an index/seq scan with the published EXISTS as a per-row PK probe — **no** per-row `can_read_object` function call in the plan.
- [ ] **Step 5: Wiring** (runbook 8p + ci_fresh_apply + READMEs — README letter `5m`; workflow step ONLY if the dedicated test file was created, per Step 3), **apply to live** (`apply_migration` name `child_read_gate_setbased` — distinct from the existing §35 `test_read_gate_setbased` concern), post-EXPLAIN + advisors, **commit** (including the updated `test_p03_read_gate_coverage.sql` AND the `test_object_act_rls.sql` read-qual edit): `perf(db): §47 set-based child read gates (§38 form) on 25 flat read policies (manifest 8p)`.

---

# Phase C — Documentation, memory, wrap-up

## Task 14: Documentation (do NOT defer — same session)

**Files:**
- Modify: `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md` (append §46 + §47)
- Modify: `CLAUDE.md` (two new invariant blocks)
- Modify: `.claude/WORKFLOW.md` (deferred tracker)
- Verify: both READMEs already updated by Tasks 4/8/9/11/13

- [ ] **Step 1: Decision log §46** — heading `## §46 — Type→facet applicability registry (2026-06-10)`. Content: the audit finding (type applicability enforced nowhere; UI invented its own archetype mapping and silently HEB-defaulted ACT/ORG); the design (2 ref tables, 13 enrolled tables, fail-closed trigger, type-change guard, violations fn, editor consumption via `unavailableReason`, fail-open UI / fail-closed DB); the seed matrix actually applied + any live violations found (Task 1/5 evidence verbatim); ACT→SRV + ORG-unmapped decisions; the `rpc_create_object` message side-fix; `ref_capacity_applicability` seeded (13c) with editor-§07 filtering deferred; APPLIED-TO-LIVE lines for `facet_applicability_registry` + `capacity_applicability_seed` with read-back numbers.
- [ ] **Step 2: Decision log §47** — heading `## §47 — Write-path convergence: per-command canonical write policies + set-based read gates (2026-06-10)`. Content: the deferred items closed (quote both tracker rows); object_fma gap fix (8n); the 55-table restructure (8o) with the predicate-class table; holes closed (opening_time_period/weekday); the §36 latent item (c) — anon draft-read fail-closed-on-EXECUTE — now structurally resolved (SELECT never evaluates write predicates); set-based read gates (8p) + EXPLAIN evidence; nested-EXISTS read policies logged as the deferred remainder; APPLIED-TO-LIVE lines for `object_fma_write_policy`, `write_policy_percommand`, `child_read_gate_setbased`.
- [ ] **Step 3: CLAUDE.md** — add two blocks under "Business invariants" / "Database and schema rules" respectively:

```markdown
### Type→facet applicability (single registry)
`ref_facet_registry` + `ref_facet_applicability` are the ONLY source of truth for which `object_type` may carry rows in which type-specific facet table (object_iti* / object_fma* / object_act / object_room_type / object_meeting_room / object_menu). Enforced by `trg_assert_facet_applicable` (BEFORE INSERT/UPDATE on the 13 enrolled tables, fail-closed) + `trg_guard_object_type_change` on `object`; reported by `api.facet_applicability_violations()` (service-only). The editor consumes the SAME registry (the 6 type-specific modules go disabled-with-reason for non-applicable types; UI is fail-open, the DB trigger is the hard gate) and `TYPE_ARCHETYPES` must cover exactly the enum minus ORG — no silent archetype fallback. Adding an object type = enum value + registry/applicability seeds + `TYPE_ARCHETYPES`/`TYPE_LABEL` + taxonomy domain. Adding a type-specific table = registry row + applicability rows + trigger + (if editor-surfaced) `TYPE_SPECIFIC_MODULE_FACETS`. Never hardcode type→facet logic in UI or RPCs. See decision log §46.

### Write policies are per-command (no FOR ALL on object-child tables)
Object-child tables carry exactly one write-policy family: `canonical_ins/upd/del_<table>` (per-command; predicate `api.user_can_write_object_canonical(<key path>)` + the documented carve-outs: §20 description, membership/tag_link admin arms, media/location object-XOR-place, +CREATEDBY legacy legs on the room-type trio and media_tag) — admin-only tables (object_review, object_origin, object_external_id, promotion_object) use `admin_ins/upd/del_<table>`. NEVER create a `FOR ALL` write policy on an object-child table — FOR ALL applies to SELECT and re-opens the P0.3 gotcha class. Documented exceptions: `ref_*` admin policies keep the house FOR ALL pair (their USING(true) read short-circuits), and `object_private_description`'s membership-based `org_insert/manage_update/manage_delete` family is already per-command (different naming, compliant). Read gates on flat-keyed child tables use the §38 split form (`EXISTS(published) OR <col> IN (SELECT api.current_user_extended_object_ids())`). Established by §47 (manifest 8n/8o/8p). When re-applying `rls_policies.sql` or `object_workspace_safe_write_rpcs.sql` to a live DB, re-run `migration_write_policy_percommand.sql` afterwards (those files still create the retired FOR ALL families — see the runbook incremental caveat).
```

- [ ] **Step 4: WORKFLOW.md tracker** — mark DONE (with date + §refs): the "Broad set-based child read policies + FOR ALL→per-command" row and the "RLS write-policy duplication owner_* vs workspace_*" row. Add new rows: editor §07 capacity-metric filtering by `ref_capacity_applicability` (deferred; unblocked by 13c seeds); nested-EXISTS read-policy set-based remainder (low value); `object_meeting_room`/`object_menu` applicability broadening when new business cases appear (seed-only INSERT); audit smells watchlist pointer (tag_link / XOR columns / cached aggregates / extra JSONB / opening tree — watch only, per the 2026-06-10 audit verdict, logged in §46).
- [ ] **Step 5:** Run `graphify update .` from the repo root (CLAUDE.md rule after code changes). If the command is unavailable in this environment, note it in the final report instead of failing.
- [ ] **Step 6: Commit:** `docs: §46/§47 decision log + CLAUDE.md invariants (applicability registry, per-command write policies)`.

## Task 15: Memory refresh + final verification sweep

- [ ] **Step 1: Full frontend suite:** `cd bertel-tourism-ui; npm run test:run; npm run typecheck`. Expected: everything green except the pre-existing `editor-validation.test.ts` local failure (baseline). Record exact counts.
- [ ] **Step 2: MCP memory** (per CLAUDE.md memory workflow — AFTER the decision log is updated): `mcp__memory__search_nodes` for the editor/DB entities, delete stale observations (e.g. "type applicability enforced nowhere", "owner/workspace duplication pending"), add observations referencing §46/§47. If the MCP memory server is unavailable, skip and note it.
- [ ] **Step 3: Push + CI:** `git -C "C:\Users\dphil\Bertel3.0" push` (if blocked, tell the user to push). After push, the fresh-apply gate must go green — it is the proof that fresh DB == live including 8m/8n/8o/8p/13c. If reachable, watch with `gh run watch` (or `gh run list --workflow=sql-fresh-apply.yml --limit 1`).
- [ ] **Step 4: Final report** (completion criteria from CLAUDE.md — state all five): what changed (5 migrations + 2 frontend commits + docs), where, why (audit issues #1/#2 + 2 discovered gaps), what was verified (live read-backs, persona probes, EXPLAIN, advisors, Jest, CI), what remains uncertain/deferred (editor §07 filtering, nested read policies, meeting-room/menu matrix breadth, any live violations found in Task 1, smells watchlist).

---

## Self-review notes (already applied)

- The Task 2 test file layout was corrected in-place to three `DO` blocks (plpgsql can't `ROLLBACK TO SAVEPOINT` across `DO` boundaries) — write it in the 3-block order described there.
- `test_sp1b_canonical_coverage.sql` survives 8o unmodified (`cmd IN ('ALL','INSERT','UPDATE')`) — verified against its source.
- The media/location X-class predicate is the load-bearing subtlety of Task 10: a naive `CANON(object_id)` silently kills §40 sub-place media. The persona test (Task 11 DO #2) covers it.
- 8m runs *before* `seeds_data.sql` (step 11) in the fresh manifest, so seeds are trigger-validated on every CI run — the zero-violations assert in `test_facet_applicability.sql` is the canary if a future seed violates the matrix.
- Names with French/quoted policy names in `rls_policies.sql` must be dropped with their exact quoted spelling — grep each before writing the DROP.

## Adversarial review corrections (2026-06-10, already folded into the tasks above)

- **CI-gate breakers found and fixed in-plan:** `tests/test_object_act_rls.sql` pins `canonical_write_object_act` `cmd='ALL'` (now updated by Task 11/12 alongside 8o) and `tests/test_p03_read_gate_coverage.sql` pins `can_read_object`/`can_read_extended` quals (now updated by Task 13 alongside 8p). If you add further policy-shape changes, grep `tests/*.sql` for structural asserts pinning the old shape FIRST.
- `tests/test_read_gate_setbased.sql` already exists (§35 object-policy test) — Task 13's migration/test names were de-conflicted to `migration_child_read_gate_setbased.sql` / `test_child_read_gate_setbased.sql` / MCP `child_read_gate_setbased`.
- Workflow test steps need their own `env: DB_URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres` block (4-line shape) — fixed in Task 4 Step 3; all later test steps copy it.
- **Verified safe (no action needed):** the 8b–8l block in `ci_fresh_apply.sql` (lines ~52–73) runs before `seeds_data.sql` (~line 79), so the 8m triggers validate seeding on every CI run; `seeds_data.sql` inserts **zero** rows into the 13 enrolled facet tables; `lot1_pilot_inserts.sql` is off-manifest (local-only) and its single facet insert (`object_meeting_room` for the HOT Dimitile) passes the baseline matrix; existing CI tests with facet fixtures use correctly-typed objects (`test_object_act_rls.sql` ACT, `test_iti_model.sql` ITI) and survive 8m; none of the five MCP migration names collides with the 16 live ledger names; manifest steps 8m/8n/8o/8p/13c are free; decision-log §46 is the next free section.

### Round 2 (SQL / frontend / completeness reviewers — also folded in)

- **Owner-persona fixtures (was a Phase-B false-halt):** `api.is_object_owner` is actor-link-based, NOT `created_by` — owner personas in Tasks 9/11 now seed `actor` + `actor_channel`(email) + `actor_object_role(is_primary)` per the `test_cards_published_fastpath.sql` recipe, with the `email` JWT claim.
- **Third CI breaker:** `test_sp1_canonical_write_auth.sql` pins `owner_write_description` — now updated by Task 11 alongside 8o.
- **FOR ALL resurrection on the live incremental path:** re-applying `rls_policies.sql`/`object_workspace_safe_write_rpcs.sql` to live recreates the retired families — runbook incremental caveat added (Task 11 Step 2) + CLAUDE.md invariant note (Task 14).
- **`created_by` legs preserved (+CREATEDBY):** room-type trio + media_tag would have silently lost their legacy `created_by` write path under plain canonical predicates — now OR'd in with exact SQL (Task 10 Step 1).
- **Column fixes:** `meeting_room_equipment.room_id` (not `meeting_room_id`); `object_sustainability_action_label.object_sustainability_action_id` (not `action_id`).
- **Two missed FOR ALL tables added to the matrix (class A):** `object_external_id`, `promotion_object` → totals now 93 policies / 57 tables (+`object_fma` = the 58-table verification list). Class A naming defined: `admin_ins/upd/del_<table>`.
- **Task 13 scope:** `read_object_act` added as the 25th flat policy (with its `test_object_act_rls.sql` qual-assert edit); `object_iti` confirmed out of scope (`pub_iti_published`/`ext_iti_org_actor` pair).
- **Frontend traps defused:** `readString` takes (value, fallback) — the keyed-access form is now the primary snippet (the (row, key) form silently disables all gating); **none** of the 6 savers has an unavailableReason guard today (itinerary guards stages only; event deletes all occurrences before reinsert) — all 6 get a top guard that **throws** the reason (a silent return would be counted `saved` by `useEditorSave` and committed clean); parser types already carry `unavailableReason` (no parser edit); ObjectEditPage wrapper quote corrected to byte-match (blank line at line 34).
- **Name consistency:** Task 14 records `child_read_gate_setbased` (not the §35-colliding `read_gate_setbased`); CLAUDE.md invariant scoped with documented exceptions (`ref_*` FOR ALL pair, `object_private_description`'s already-per-command family).
