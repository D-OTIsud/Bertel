# SP‑1 Canonical-write Authorization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Level‑2 canonical-write permission a valid path to write an object's canonical data — additively alongside the legacy owner path — across the editor's RLS write surface and the workspace gate, without regressing the existing superuser and without letting canonical-editors change publication status.

**Architecture:** One new helper `api.user_can_write_object_canonical(obj) = is_object_owner(obj) OR user_can_write_canonical(obj)` becomes the single predicate substituted into 23 write policies + the workspace gate. A `BEFORE UPDATE OF status` trigger keeps publish (`publish_object`) distinct from canonical edit. All shipped as one idempotent, reversible migration slotted into the deploy manifest after the workspace RPCs. SP‑1 is **inert on live today** (0 permission grants, 1 superuser) — it only opens the path; SP‑2 grants permissions and adds the behavioral tests.

**Tech Stack:** PostgreSQL/Supabase RLS, `psql`, Supabase CLI local DB (`supabase start`). Spec: `docs/superpowers/specs/2026-06-02-sp1-canonical-write-auth-design.md`.

**Execution prerequisite:** a running Supabase local DB with the full base manifest applied (`supabase start`, then `ci_fresh_apply.sql`). Requires Docker. The CI gate (`.github/workflows/sql-fresh-apply.yml`) provides the same environment. Local DB URL: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`.

---

## File structure

- **Create** `Base de donnée DLL et API/migration_permission_write_paths.sql` — all SP‑1 DDL (helper, gate, 23 policy substitutions, status trigger). One cohesive, idempotent, transaction-wrapped migration.
- **Create** `Base de donnée DLL et API/tests/test_sp1_canonical_write_auth.sql` — deterministic catalog assertions (helper/trigger exist; gate + all targeted policies reference the new helper). No user fixture (behavioral tests are SP‑2).
- **Modify** `Base de donnée DLL et API/ci_fresh_apply.sql` — apply the migration after `object_workspace_gap_rpcs.sql`.
- **Modify** `.github/workflows/sql-fresh-apply.yml` — run the catalog test after the manifest applies.
- **Modify** `docs/SQL_ROLLOUT_RUNBOOK.md`, `README.md`, `Base de donnée DLL et API/README.md` — add the migration to the ordered manifest (new step after `object_workspace_gap_rpcs.sql`).
- **Modify** `CLAUDE.md` — the "Write-path authorization (target — P0.2)" invariant becomes established (additively) by SP‑1.
- **Modify** `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md` §24 — mark SP‑1 done; note behavioral verification deferred to SP‑2.

---

## Task 1: Failing structural test

**Files:**
- Create: `Base de donnée DLL et API/tests/test_sp1_canonical_write_auth.sql`

- [ ] **Step 1: Write the test (deterministic catalog assertions)**

```sql
-- test_sp1_canonical_write_auth.sql
-- SP-1 structural assertions. Run AFTER the base manifest + migration_permission_write_paths.sql.
-- Deterministic (catalog-only): asserts the helper + status trigger exist, the workspace gate
-- is wired to the helper, and every targeted write policy now references the helper.
-- Behavioral (granted-contributor can write / cannot publish) tests are SP-2.
\set ON_ERROR_STOP on
DO $$
DECLARE
  v_missing text[] := ARRAY[]::text[];
  v_legacy  text[];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname='api' AND p.proname='user_can_write_object_canonical') THEN
    v_missing := v_missing || 'api.user_can_write_object_canonical';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                 WHERE tgname='trg_guard_object_status_change' AND NOT tgisinternal) THEN
    v_missing := v_missing || 'trg_guard_object_status_change';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname='internal' AND p.proname='workspace_assert_can_write_object'
                   AND pg_get_functiondef(p.oid) LIKE '%user_can_write_object_canonical%') THEN
    v_missing := v_missing || 'workspace gate not wired to helper';
  END IF;

  IF array_length(v_missing, 1) > 0 THEN
    RAISE EXCEPTION 'SP-1 objects missing: %', array_to_string(v_missing, ', ');
  END IF;

  -- Every targeted write policy must reference the helper in its USING (qual).
  -- object_description is intentionally excluded (carve-out keeps is_object_owner OR
  -- (user_can_write_canonical AND org_object_id IS NULL)).
  SELECT array_agg(policyname) INTO v_legacy
  FROM pg_policies
  WHERE schemaname='public'
    AND policyname IN (
      'owner_write_location','owner_write_place','owner_write_contact','owner_write_media',
      'owner_write_legal','owner_write_discount','owner_write_group_policy',
      'owner_price_write','owner_price_period_write','owner_menu_write','owner_menu_item_write',
      'owner_menu_item_dietary_write','owner_menu_item_allergen_write','owner_menu_item_cuisine_write',
      'owner_menu_item_media_write','owner_meeting_room_write','owner_meeting_room_equipment_write',
      'owner_pet_policy_write','owner_fma_occurrence_write','owner_iti_stage_media_write',
      'owner_object_membership_write','owner_update_object','owner_delete_object'
    )
    AND COALESCE(qual,'') NOT LIKE '%user_can_write_object_canonical%';
  IF v_legacy IS NOT NULL THEN
    RAISE EXCEPTION 'Policies still on legacy predicate (not wired to helper): %', array_to_string(v_legacy, ', ');
  END IF;

  -- object_description carve-out: must reference BOTH the canonical helper and the overlay guard.
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname='public' AND policyname='owner_write_description'
                   AND qual LIKE '%user_can_write_canonical%' AND qual LIKE '%org_object_id%') THEN
    RAISE EXCEPTION 'owner_write_description carve-out (canonical + org_object_id IS NULL) not in place';
  END IF;

  RAISE NOTICE 'SP-1 structural assertions passed.';
END$$;
```

- [ ] **Step 2: Run the test against the current DB (pre-migration) and confirm it FAILS**

Run (against a DB with the base manifest applied but NOT the SP‑1 migration):
```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
  -f "Base de donnée DLL et API/tests/test_sp1_canonical_write_auth.sql"
```
Expected: **FAIL** — `ERROR: SP-1 objects missing: api.user_can_write_object_canonical, trg_guard_object_status_change, workspace gate not wired to helper` (the helper/trigger don't exist yet). This proves the test is meaningful.

- [ ] **Step 3: Commit the test**

```bash
git add "Base de donnée DLL et API/tests/test_sp1_canonical_write_auth.sql"
git commit -m "test(sql): SP-1 structural assertions for canonical-write authorization"
```

---

## Task 2: Write the migration

**Files:**
- Create: `Base de donnée DLL et API/migration_permission_write_paths.sql`

- [ ] **Step 1: Create the migration file with this exact content**

```sql
-- migration_permission_write_paths.sql
-- SP-1 of P0.2 — canonical-write authorization wired into the editor write paths.
-- Substitutes the legacy `api.is_object_owner(...)` predicate with the ADDITIVE
-- `api.user_can_write_object_canonical(...)` (= is_object_owner OR user_can_write_canonical)
-- across the workspace gate + the 23 object/child-table write policies, and adds a
-- status-change guard so edit_canonical_when_publisher != publish_object.
--
-- PREREQUISITES: schema_unified.sql, rls_policies.sql (defines is_object_owner,
--   user_can_write_canonical, user_can_publish_object, is_platform_superuser),
--   object_workspace_safe_write_rpcs.sql (the gate). APPLY AFTER object_workspace_gap_rpcs.sql.
-- IDEMPOTENT: CREATE OR REPLACE + DROP POLICY/TRIGGER IF EXISTS. TRANSACTION-WRAPPED.
-- REVERSIBLE: see docs/superpowers/specs/2026-06-02-sp1-canonical-write-auth-design.md §7.
-- INERT until SP-2 grants permissions (0 grants on live today); additive => no regression.

BEGIN;

-- 1) Single source of truth for canonical-write authorization (additive OR).
CREATE OR REPLACE FUNCTION api.user_can_write_object_canonical(p_object_id text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, api, auth
AS $fn$
  SELECT api.is_object_owner(p_object_id)            -- legacy actor-owner + service_role/admin + platform superuser
      OR api.user_can_write_canonical(p_object_id);  -- publisher ORG member holding edit_canonical_when_publisher
$fn$;
REVOKE EXECUTE ON FUNCTION api.user_can_write_object_canonical(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.user_can_write_object_canonical(text) TO authenticated, service_role;

-- 2) Workspace gate (was: is_object_owner only).
CREATE OR REPLACE FUNCTION internal.workspace_assert_can_write_object(p_object_id text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, api, internal, auth
AS $fn$
BEGIN
  IF p_object_id IS NULL OR btrim(p_object_id) = '' THEN
    RAISE EXCEPTION 'object_id is required' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.object WHERE id = p_object_id) THEN
    RAISE EXCEPTION 'Unknown object_id: %', p_object_id USING ERRCODE = 'P0002';
  END IF;
  IF NOT api.user_can_write_object_canonical(p_object_id) THEN
    RAISE EXCEPTION 'Current user cannot write object %', p_object_id USING ERRCODE = '42501';
  END IF;
END;
$fn$;

-- 3) object UPDATE / DELETE: created_by OR canonical writer.
DROP POLICY IF EXISTS "owner_update_object" ON object;
CREATE POLICY "owner_update_object" ON object
  FOR UPDATE
  USING      (auth.uid() = created_by OR api.user_can_write_object_canonical(id))
  WITH CHECK (auth.uid() = created_by OR api.user_can_write_object_canonical(id));

DROP POLICY IF EXISTS "owner_delete_object" ON object;
CREATE POLICY "owner_delete_object" ON object
  FOR DELETE
  USING (auth.uid() = created_by OR api.user_can_write_object_canonical(id));

-- 4) Simple child-table write policies (FOR ALL USING object_id).
DROP POLICY IF EXISTS "owner_write_location" ON object_location;
CREATE POLICY "owner_write_location" ON object_location
  FOR ALL USING (api.user_can_write_object_canonical(object_id));

DROP POLICY IF EXISTS "owner_write_place" ON object_place;
CREATE POLICY "owner_write_place" ON object_place
  FOR ALL USING (api.user_can_write_object_canonical(object_id));

DROP POLICY IF EXISTS "owner_write_contact" ON contact_channel;
CREATE POLICY "owner_write_contact" ON contact_channel
  FOR ALL USING (api.user_can_write_object_canonical(object_id));

DROP POLICY IF EXISTS "owner_write_media" ON media;
CREATE POLICY "owner_write_media" ON media
  FOR ALL USING (api.user_can_write_object_canonical(object_id));

DROP POLICY IF EXISTS "owner_write_legal" ON object_legal;
CREATE POLICY "owner_write_legal" ON object_legal
  FOR ALL USING (api.user_can_write_object_canonical(object_id));

DROP POLICY IF EXISTS "owner_write_discount" ON object_discount;
CREATE POLICY "owner_write_discount" ON object_discount
  FOR ALL USING (api.user_can_write_object_canonical(object_id));

DROP POLICY IF EXISTS "owner_write_group_policy" ON object_group_policy;
CREATE POLICY "owner_write_group_policy" ON object_group_policy
  FOR ALL USING (api.user_can_write_object_canonical(object_id));

DROP POLICY IF EXISTS "owner_price_write" ON object_price;
CREATE POLICY "owner_price_write" ON object_price
  FOR ALL USING (api.user_can_write_object_canonical(object_id));

DROP POLICY IF EXISTS "owner_menu_write" ON object_menu;
CREATE POLICY "owner_menu_write" ON object_menu
  FOR ALL USING (api.user_can_write_object_canonical(object_id));

DROP POLICY IF EXISTS "owner_meeting_room_write" ON object_meeting_room;
CREATE POLICY "owner_meeting_room_write" ON object_meeting_room
  FOR ALL USING (api.user_can_write_object_canonical(object_id));

DROP POLICY IF EXISTS "owner_pet_policy_write" ON object_pet_policy;
CREATE POLICY "owner_pet_policy_write" ON object_pet_policy
  FOR ALL USING (api.user_can_write_object_canonical(object_id));

DROP POLICY IF EXISTS "owner_fma_occurrence_write" ON object_fma_occurrence;
CREATE POLICY "owner_fma_occurrence_write" ON object_fma_occurrence
  FOR ALL USING (api.user_can_write_object_canonical(object_id));

-- 5) object_description carve-out: new canonical path is restricted to canonical rows
--    (org_object_id IS NULL); per-org overlays stay the sole domain of rpc_write_org_description (§20).
DROP POLICY IF EXISTS "owner_write_description" ON object_description;
CREATE POLICY "owner_write_description" ON object_description
  FOR ALL USING (
    api.is_object_owner(object_id)
    OR (api.user_can_write_canonical(object_id) AND org_object_id IS NULL)
  );

-- 6) Nested child policies (EXISTS via parent — substitute the inner is_object_owner).
DROP POLICY IF EXISTS "owner_price_period_write" ON object_price_period;
CREATE POLICY "owner_price_period_write" ON object_price_period
  FOR ALL USING (
    EXISTS (SELECT 1 FROM object_price op
            WHERE op.id = object_price_period.price_id
              AND api.user_can_write_object_canonical(op.object_id))
  );

DROP POLICY IF EXISTS "owner_menu_item_write" ON object_menu_item;
CREATE POLICY "owner_menu_item_write" ON object_menu_item
  FOR ALL USING (
    EXISTS (SELECT 1 FROM object_menu om
            WHERE om.id = object_menu_item.menu_id
              AND api.user_can_write_object_canonical(om.object_id))
  );

DROP POLICY IF EXISTS "owner_menu_item_dietary_write" ON object_menu_item_dietary_tag;
CREATE POLICY "owner_menu_item_dietary_write" ON object_menu_item_dietary_tag
  FOR ALL USING (
    EXISTS (SELECT 1 FROM object_menu_item omi
            JOIN object_menu om ON om.id = omi.menu_id
            WHERE omi.id = object_menu_item_dietary_tag.menu_item_id
              AND api.user_can_write_object_canonical(om.object_id))
  );

DROP POLICY IF EXISTS "owner_menu_item_allergen_write" ON object_menu_item_allergen;
CREATE POLICY "owner_menu_item_allergen_write" ON object_menu_item_allergen
  FOR ALL USING (
    EXISTS (SELECT 1 FROM object_menu_item omi
            JOIN object_menu om ON om.id = omi.menu_id
            WHERE omi.id = object_menu_item_allergen.menu_item_id
              AND api.user_can_write_object_canonical(om.object_id))
  );

DROP POLICY IF EXISTS "owner_menu_item_cuisine_write" ON object_menu_item_cuisine_type;
CREATE POLICY "owner_menu_item_cuisine_write" ON object_menu_item_cuisine_type
  FOR ALL USING (
    EXISTS (SELECT 1 FROM object_menu_item omi
            JOIN object_menu om ON om.id = omi.menu_id
            WHERE omi.id = object_menu_item_cuisine_type.menu_item_id
              AND api.user_can_write_object_canonical(om.object_id))
  );

DROP POLICY IF EXISTS "owner_menu_item_media_write" ON object_menu_item_media;
CREATE POLICY "owner_menu_item_media_write" ON object_menu_item_media
  FOR ALL USING (
    EXISTS (SELECT 1 FROM object_menu_item omi
            JOIN object_menu om ON om.id = omi.menu_id
            WHERE omi.id = object_menu_item_media.menu_item_id
              AND api.user_can_write_object_canonical(om.object_id))
  );

DROP POLICY IF EXISTS "owner_meeting_room_equipment_write" ON meeting_room_equipment;
CREATE POLICY "owner_meeting_room_equipment_write" ON meeting_room_equipment
  FOR ALL USING (
    EXISTS (SELECT 1 FROM object_meeting_room omr
            WHERE omr.id = meeting_room_equipment.room_id
              AND api.user_can_write_object_canonical(omr.object_id))
  );

DROP POLICY IF EXISTS "owner_iti_stage_media_write" ON object_iti_stage_media;
CREATE POLICY "owner_iti_stage_media_write" ON object_iti_stage_media
  FOR ALL USING (
    EXISTS (SELECT 1 FROM object_iti_stage ois
            WHERE ois.id = object_iti_stage_media.stage_id
              AND api.user_can_write_object_canonical(ois.object_id))
  );

-- 7) object_membership (keeps the admin branch; COALESCE handles ORG-scoped memberships).
DROP POLICY IF EXISTS "owner_object_membership_write" ON object_membership;
CREATE POLICY "owner_object_membership_write" ON object_membership
  FOR ALL USING (
    auth.role() IN ('service_role','admin')
    OR api.user_can_write_object_canonical(COALESCE(object_id, org_object_id))
  );

-- 8) Status guard: status changes require publish_object (rpc_publish_object), not edit_canonical.
--    service_role/admin and platform superuser are exempt. rpc_publish_object verifies the
--    caller's publish right before its UPDATE, so the trigger re-check passes for it
--    (auth.uid() is preserved under SECURITY DEFINER). Fires only when `status` is in the SET list.
CREATE OR REPLACE FUNCTION api.guard_object_status_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, api, auth
AS $fn$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND auth.role() NOT IN ('service_role','admin')
     AND NOT api.is_platform_superuser()
     AND NOT api.user_can_publish_object(NEW.id)
  THEN
    RAISE EXCEPTION
      'Object status changes require the publish_object permission (use api.rpc_publish_object); edit_canonical_when_publisher does not grant publishing'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION api.guard_object_status_change() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_guard_object_status_change ON object;
CREATE TRIGGER trg_guard_object_status_change
  BEFORE UPDATE OF status ON object
  FOR EACH ROW EXECUTE FUNCTION api.guard_object_status_change();

COMMIT;
```

- [ ] **Step 2: Eyeball-review the file** — confirm every `owner_*_write` / `owner_write_*` / `owner_update_object` / `owner_delete_object` / `owner_object_membership_write` policy is present (23 total) and that `object_description` uses the carve-out, not the blanket helper.

---

## Task 3: Apply the migration and make the test pass

**Files:** (none changed; runs Task 1 + Task 2 artifacts)

- [ ] **Step 1: Apply the migration**

Run:
```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
  -f "Base de donnée DLL et API/migration_permission_write_paths.sql"
```
Expected: `COMMIT` with no error.

- [ ] **Step 2: Run the structural test — expect PASS**

Run:
```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
  -f "Base de donnée DLL et API/tests/test_sp1_canonical_write_auth.sql"
```
Expected: `NOTICE: SP-1 structural assertions passed.` and exit 0.

- [ ] **Step 3: No-regression spot check (superuser/service path still writes)**

Run:
```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -c \
"SELECT api.user_can_write_object_canonical(id) AS ok, count(*) OVER () FROM object LIMIT 1;"
```
Expected: a row with `ok = t` (the `postgres`/service connection resolves `is_object_owner` true via `auth.role()`), confirming the legacy path is intact.

- [ ] **Step 4: Commit**

```bash
git add "Base de donnée DLL et API/migration_permission_write_paths.sql"
git commit -m "feat(rls): SP-1 wire canonical-write permission into editor write paths (additive)"
```

---

## Task 4: Wire the migration into the deploy manifest + CI

**Files:**
- Modify: `Base de donnée DLL et API/ci_fresh_apply.sql`
- Modify: `.github/workflows/sql-fresh-apply.yml`
- Modify: `docs/SQL_ROLLOUT_RUNBOOK.md`
- Modify: `README.md`
- Modify: `Base de donnée DLL et API/README.md`

- [ ] **Step 1: Insert the migration into `ci_fresh_apply.sql` after `object_workspace_gap_rpcs.sql`**

Find this block and insert the new step (renumber the trailing steps; keep `\ir`):
```sql
\echo '== 8/13  object_workspace_gap_rpcs.sql =='
\ir object_workspace_gap_rpcs.sql
\echo '== 8b/14 migration_permission_write_paths.sql  (SP-1 canonical-write auth; after RLS + workspace RPCs) =='
\ir migration_permission_write_paths.sql
\echo '== 9/13  ui_whitelabel_branding.sql  (defines api.is_platform_admin) =='
\ir ui_whitelabel_branding.sql
```

- [ ] **Step 2: Add a CI test step in `.github/workflows/sql-fresh-apply.yml`** (after the "Smoke" step, before "Stop Supabase"):

```yaml
      - name: SP-1 structural assertions (canonical-write authorization)
        env:
          DB_URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
        run: psql "$DB_URL" -v ON_ERROR_STOP=1 -f "Base de donnée DLL et API/tests/test_sp1_canonical_write_auth.sql"
```

- [ ] **Step 3: Add the migration to the runbook manifest** — in `docs/SQL_ROLLOUT_RUNBOOK.md`, under "Fresh Database — Complete Ordered Manifest", insert after item 8:

```markdown
8b. `migration_permission_write_paths.sql` — **SP-1 canonical-write authorization** (additive `user_can_write_object_canonical` across the workspace gate + 23 write policies + `object.status` guard trigger). After the workspace RPCs (depends on `rls_policies.sql` helpers + the gate).
```

- [ ] **Step 4: Add the migration to both README quick-starts** — in `README.md` (after the `object_workspace_gap_rpcs.sql` line) and `Base de donnée DLL et API/README.md` (after its `object_workspace_gap_rpcs.sql` `\i` line):

`README.md`:
```bash
# 5b. SP-1 canonical-write authorization (après les RPC workspace)
psql -d votre_database -f "Base de donnée DLL et API/migration_permission_write_paths.sql"
```
`Base de donnée DLL et API/README.md`:
```sql
-- 5b) SP-1 autorisation d'écriture canonique (après les RPC workspace)
\i migration_permission_write_paths.sql
```

- [ ] **Step 5: Commit**

```bash
git add "Base de donnée DLL et API/ci_fresh_apply.sql" ".github/workflows/sql-fresh-apply.yml" "docs/SQL_ROLLOUT_RUNBOOK.md" "README.md" "Base de donnée DLL et API/README.md"
git commit -m "chore(sql): add SP-1 migration to the fresh-apply manifest + CI gate"
```

---

## Task 5: Update invariants and the decision log

**Files:**
- Modify: `CLAUDE.md`
- Modify: `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md`

- [ ] **Step 1: Update the CLAUDE.md "Write-path authorization" invariant**

Replace the existing block:
```markdown
### Write-path authorization (target — established by P0.2)
Object write paths must enforce the Level-2 permission catalog (`api.user_has_permission`, `edit_org_enrichment`, `edit_canonical_when_publisher`, `publish_object`), not the legacy `is_object_owner` / `created_by` check. This is **not yet true**: as of 2026-06-02 the 22-section save RPCs gate only through `internal.workspace_assert_can_write_object` → `is_object_owner`, and object UPDATE RLS uses `created_by`. Until P0.2 lands, do NOT add new write paths that entrench the legacy owner-only model; new writes should consult the permission catalog so the cutover stays clean. Tracked in `lot1_mapping_decisions.md` §24 (P0.2 / S5).
```
with:
```markdown
### Write-path authorization
Object canonical writes are authorized by `api.user_can_write_object_canonical(obj)` = `is_object_owner(obj) OR user_can_write_canonical(obj)` — the **single** predicate used by the workspace gate (`internal.workspace_assert_can_write_object`) and every canonical write policy (`object` UPDATE/DELETE + the `owner_*_write` child-table policies). It is **additive**: the legacy owner/superuser path is retained (removing it would brick the only seeded user — there are 0 permission grants yet). The permission path (`user_can_write_canonical` = publisher ORG + `edit_canonical_when_publisher`) becomes effective once SP-2 grants permissions. Publication status is NOT covered by canonical-write: `object.status` changes require `publish_object` via `api.rpc_publish_object`, enforced by `trg_guard_object_status_change`. Per-org `object_description` overlays remain the sole domain of `api.rpc_write_org_description` (§20). New write paths MUST consult `user_can_write_object_canonical` (or the appropriate `user_can_*` helper), never raw `is_object_owner`. Established by SP-1 (`migration_permission_write_paths.sql`); see `lot1_mapping_decisions.md` §24.
```

- [ ] **Step 2: Mark SP-1 done in §24** — under the SP‑1 bullet in `lot1_mapping_decisions.md` §24, append:
```markdown
    - **SP‑1 DONE (DDL written + CI-gated) 2026-06-02.** `migration_permission_write_paths.sql`: helper `api.user_can_write_object_canonical`, workspace gate rewired, 23 write policies substituted, `object_description` carve-out, `trg_guard_object_status_change` status guard. Additive → no live behavior change (0 grants). Structural test `tests/test_sp1_canonical_write_auth.sql` in the CI gate. **Behavioral positive/negative permission test deferred to SP‑2** (needs a grant + a second user).
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md "bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md"
git commit -m "docs: establish write-path authorization invariant (SP-1) + log update"
```

---

## Self-review (completed during planning)

- **Spec coverage:** helper (§3.1) → Task 2.1; full RLS surface (§3.2) → Task 2.1 (all 23 enumerated); `object_description` carve-out (§3.3) → Task 2.1 + test; status guard (§3.4) → Task 2.1 (realized as a `user_can_publish_object` check rather than a txn flag — simpler, no edit to `rpc_publish_object`; same intent); migration/manifest/CI (§3.5) → Tasks 3–4; verification (§5) → Tasks 1/3 structural + no-regression, behavioral deferred to SP‑2; invariant → Task 5.
- **Placeholder scan:** none — every policy is written out in full; no "similar to" references.
- **Type/name consistency:** policy names match `rls_policies.sql` exactly (verified against source lines 936–1480, 1031–1039, 1693); helper/trigger/function names consistent across migration, test, CI, and invariant text.
- **Refinement vs spec:** the status guard uses `NOT api.user_can_publish_object(NEW.id)` instead of a transaction-local flag — equivalent enforcement of "canonical-edit ≠ publish" with fewer moving parts and no change to `rpc_publish_object`. Noted in Task 2 comments.
