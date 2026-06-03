# SP‑2 Permission Activation (convention + behavioral test) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lock the role→permission convention in the decision log and add a behavioral test that proves SP‑1's canonical-write authorization + status guard + team-note access rule end-to-end against a seeded multi-user fixture.

**Architecture:** No schema, no DDL, no live grants (the model forbids a role→permission mechanism; an org-wide grant can't be walked back for a viewer). SP‑2 = (1) a documented convention admins apply per-user, (2) one transactional, self-rolling-back SQL test that seeds 3 synthetic non-superuser users (viewer/contributor/editor) and impersonates them via `request.jwt.claims` to assert the authorization booleans, the status guard, and the membership-based team-note rule. The test is added to the CI gate after the SP‑1 structural test.

**Tech Stack:** PostgreSQL/Supabase RLS, `psql`, Supabase CLI local DB. Spec: `docs/superpowers/specs/2026-06-02-sp2-permission-activation-design.md`. Depends on SP‑1 (`migration_permission_write_paths.sql`) being in the applied manifest.

**Execution prerequisite:** same as SP‑1 — a Supabase local DB with the full manifest (incl. the SP‑1 migration) applied; verification is CI-bound (no local Docker here). Local DB URL: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`.

---

## File structure

- **Modify** `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md` — add the SP‑2 convention (role→permission table + team-note rule + `write_crm_notes` disambiguation) under §24.
- **Create** `Base de donnée DLL et API/tests/test_sp2_permission_behavior.sql` — the behavioral test (fixture + impersonated assertions, self-rolling-back).
- **Modify** `.github/workflows/sql-fresh-apply.yml` — run the SP‑2 test after the SP‑1 test.

---

## Task 1: Record the convention in the decision log

**Files:**
- Modify: `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md`

- [ ] **Step 1: Append the SP‑2 convention under the SP‑2 bullet in §24**

Find the SP‑2 bullet (begins `- **SP‑2 — Permission activation (SQL/data).**`) and append this immediately after it:

```markdown
    - **SP‑2 DECIDED + DONE (convention + test) 2026-06-02.** No schema, no `org_permission` grants (org-wide can't be revoked per-viewer — no Level-3). Roles stay orthogonal to permissions (§2.4); the convention guides **per-user** grants (`rpc_grant_user_permission`) and SP‑4's pre-checked defaults.
      **Role→permission convention** (admin grants per user by business role):
      | Permission | viewer | contributor | editor |
      |---|:--:|:--:|:--:|
      | create_object, edit_canonical_when_publisher, edit_org_enrichment, edit_hours, edit_pricing, edit_gallery, attach_documents | | ✓ | ✓ |
      | publish_object, validate_changes, manage_team_messages | | | ✓ |

      Rationale: OTI is `publisher` of all objects, so editing OTI's catalog *is* canonical editing → contributor needs `edit_canonical_when_publisher`; the contributor/editor split (no-publish vs publish) is exactly SP‑1's status guard.
      **Team notes ("information équipe") = `object_private_description`** — already enforced, membership-based: create = any active org member incl. `viewer` (`can_write_object_private_notes` = active membership); edit/archive = author OR same-ORG admin-role superior OR platform superuser (`can_manage_object_private_note`). NOT a granted permission. So a `viewer` writes team notes + edits own, but no canonical.
      **Disambiguation:** `information équipe` = the membership-based `object_private_description` path. `write_crm_notes` / `manage_team_messages` gate the separate, not-yet-built CRM/team-messages module — they do NOT gate `object_private_description`.
      Behavioral proof: `Base de donnée DLL et API/tests/test_sp2_permission_behavior.sql` (in the CI gate). Spec: `docs/superpowers/specs/2026-06-02-sp2-permission-activation-design.md`. Real grants deferred to SP‑5.
```

- [ ] **Step 2: Commit** *(skip if leaving git to the user — working tree only)*

```bash
git add "bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md"
git commit -m "docs(access): SP-2 role→permission convention + team-note access rule"
```

---

## Task 2: Behavioral test

**Files:**
- Create: `Base de donnée DLL et API/tests/test_sp2_permission_behavior.sql`

- [ ] **Step 1: Write the test**

```sql
-- test_sp2_permission_behavior.sql
-- SP-2 behavioral test: proves SP-1 canonical-write authorization + status guard + the
-- membership-based team-note rule, end-to-end, against a seeded multi-user fixture.
-- Self-contained + transactional: everything is ROLLBACK'd, nothing persists.
-- Run AFTER the full manifest INCLUDING migration_permission_write_paths.sql (SP-1).
-- Against a DB without SP-1, it fails fast (api.user_can_write_object_canonical missing) — that is the red state.
--
-- WATCH-POINTS (may need a tweak on first CI run; the assertions' intent is stable):
--   * auth.users minimal insert (only id is NOT NULL/no-default on this DB);
--   * app_user_profile.role value 'tourism_agent' must be a non-superuser role;
--   * plpgsql SET LOCAL ROLE + subtransaction exception mechanics;
--   * object id format if a CHECK constraint exists (explicit test ids used).
\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_org         text := 'ORGRUN9999999991';
  v_obj         text := 'HOTRUN9999999991';
  v_pub_role    uuid;
  v_view_uid    uuid := '00000000-0000-4000-a000-0000000000a1';
  v_contrib_uid uuid := '00000000-0000-4000-a000-0000000000a2';
  v_editor_uid  uuid := '00000000-0000-4000-a000-0000000000a3';
  v_m_view uuid; v_m_contrib uuid; v_m_editor uuid;
  v_note_view uuid;
  v_rc integer;
BEGIN
  -- ---------- Fixture (as postgres; RLS bypassed for setup) ----------
  SELECT id INTO v_pub_role FROM ref_org_role WHERE code = 'publisher';

  INSERT INTO object (id, object_type, name) VALUES
    (v_org, 'ORG', 'SP2 Test Org'),
    (v_obj, 'HOT', 'SP2 Test Hotel');
  INSERT INTO object_org_link (object_id, org_object_id, role_id) VALUES (v_obj, v_org, v_pub_role);

  INSERT INTO auth.users (id) VALUES (v_view_uid), (v_contrib_uid), (v_editor_uid);
  INSERT INTO app_user_profile (id, role) VALUES
    (v_view_uid, 'tourism_agent'), (v_contrib_uid, 'tourism_agent'), (v_editor_uid, 'tourism_agent');

  INSERT INTO user_org_membership (user_id, org_object_id, is_active) VALUES (v_view_uid,    v_org, TRUE) RETURNING id INTO v_m_view;
  INSERT INTO user_org_membership (user_id, org_object_id, is_active) VALUES (v_contrib_uid, v_org, TRUE) RETURNING id INTO v_m_contrib;
  INSERT INTO user_org_membership (user_id, org_object_id, is_active) VALUES (v_editor_uid,  v_org, TRUE) RETURNING id INTO v_m_editor;

  INSERT INTO user_org_business_role (membership_id, role_id, is_active)
    SELECT v_m_view,    id, TRUE FROM ref_org_business_role WHERE code = 'viewer';
  INSERT INTO user_org_business_role (membership_id, role_id, is_active)
    SELECT v_m_contrib, id, TRUE FROM ref_org_business_role WHERE code = 'contributor';
  INSERT INTO user_org_business_role (membership_id, role_id, is_active)
    SELECT v_m_editor,  id, TRUE FROM ref_org_business_role WHERE code = 'editor';

  -- editor also holds an org_admin admin role (to edit/archive ANY team note)
  INSERT INTO user_org_admin_role (membership_id, role_id, is_active)
    SELECT v_m_editor, id, TRUE FROM ref_org_admin_role WHERE code = 'org_admin';

  -- per-convention user_permission grants (direct insert; bypasses the anti-self RPC checks)
  INSERT INTO user_permission (user_id, permission_id, is_active, granted_by, granted_at, created_at, updated_at)
    SELECT v_contrib_uid, id, TRUE, v_editor_uid, NOW(), NOW(), NOW()
    FROM ref_permission WHERE code IN
      ('create_object','edit_canonical_when_publisher','edit_org_enrichment','edit_hours','edit_pricing','edit_gallery','attach_documents');
  INSERT INTO user_permission (user_id, permission_id, is_active, granted_by, granted_at, created_at, updated_at)
    SELECT v_editor_uid, id, TRUE, v_editor_uid, NOW(), NOW(), NOW()
    FROM ref_permission WHERE code IN
      ('create_object','edit_canonical_when_publisher','edit_org_enrichment','edit_hours','edit_pricing','edit_gallery','attach_documents','publish_object','validate_changes','manage_team_messages');

  -- a note authored by the viewer (set up as postgres so we can test edit-by-others)
  INSERT INTO object_private_description (object_id, org_object_id, created_by_user_id, audience, body)
    VALUES (v_obj, v_org, v_view_uid, 'private', 'viewer note') RETURNING id INTO v_note_view;

  -- ---------- Assertions: authorization helpers (SECURITY DEFINER read auth.uid() from the GUC) ----------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_view_uid,    'role','authenticated')::text, true);
  ASSERT api.user_can_write_object_canonical(v_obj) = FALSE, 'viewer must NOT write canonical';

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_contrib_uid, 'role','authenticated')::text, true);
  ASSERT api.user_can_write_object_canonical(v_obj) = TRUE,  'contributor MUST write canonical';
  ASSERT api.user_can_publish_object(v_obj)        = FALSE,  'contributor must NOT publish';

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_editor_uid,  'role','authenticated')::text, true);
  ASSERT api.user_can_write_object_canonical(v_obj) = TRUE,  'editor MUST write canonical';
  ASSERT api.user_can_publish_object(v_obj)        = TRUE,   'editor MUST publish';

  -- ---------- Status guard: contributor (canonical, no publish) cannot change status ----------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_contrib_uid, 'role','authenticated')::text, true);
  BEGIN
    SET LOCAL ROLE authenticated;
    UPDATE object SET status = 'published' WHERE id = v_obj;
    RAISE EXCEPTION 'STATUS GUARD FAILED: contributor changed status without publish_object';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;  -- expected: SQLSTATE 42501 from trg_guard_object_status_change
  END;
  RESET ROLE;

  -- editor CAN publish (has publish_object): RLS allows + guard passes
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_editor_uid, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  UPDATE object SET status = 'published' WHERE id = v_obj;
  GET DIAGNOSTICS v_rc = ROW_COUNT;
  RESET ROLE;
  ASSERT v_rc = 1, 'editor MUST be able to publish (1 row)';

  -- ---------- Team notes: membership create, edit-own, admin-edit-any ----------
  -- viewer creates a note (membership) and edits OWN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_view_uid, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO object_private_description (object_id, org_object_id, created_by_user_id, audience, body)
    VALUES (v_obj, v_org, v_view_uid, 'private', 'viewer second note');
  UPDATE object_private_description SET body = 'viewer edited own' WHERE id = v_note_view;
  GET DIAGNOSTICS v_rc = ROW_COUNT;
  RESET ROLE;
  ASSERT v_rc = 1, 'viewer MUST edit own note';

  -- contributor cannot edit the viewer's note (not author, not admin) -> RLS denies (0 rows)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_contrib_uid, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  UPDATE object_private_description SET body = 'contrib tries' WHERE id = v_note_view;
  GET DIAGNOSTICS v_rc = ROW_COUNT;
  RESET ROLE;
  ASSERT v_rc = 0, 'contributor must NOT edit another members note';

  -- editor (org_admin) edits ANY note
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_editor_uid, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  UPDATE object_private_description SET body = 'admin edited' WHERE id = v_note_view;
  GET DIAGNOSTICS v_rc = ROW_COUNT;
  RESET ROLE;
  ASSERT v_rc = 1, 'org_admin editor MUST edit any note';

  RAISE NOTICE 'SP-2 behavioral assertions passed.';
END$$;

ROLLBACK;
```

- [ ] **Step 2: Run it against the full-manifest DB — expect PASS**

Run:
```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
  -f "Base de donnée DLL et API/tests/test_sp2_permission_behavior.sql"
```
Expected: `NOTICE: SP-2 behavioral assertions passed.`, exit 0. (Against a DB missing the SP‑1 migration it errors on `api.user_can_write_object_canonical` — the red state.) If a watch-point trips (auth.users columns, role value, role/exception mechanics), fix inline and re-run — the assertions stay; only the fixture/mechanics adjust.

- [ ] **Step 3: Commit** *(skip if leaving git to the user)*

```bash
git add "Base de donnée DLL et API/tests/test_sp2_permission_behavior.sql"
git commit -m "test(sql): SP-2 behavioral test — canonical-write auth, status guard, team-note rule"
```

---

## Task 3: Add the test to the CI gate

**Files:**
- Modify: `.github/workflows/sql-fresh-apply.yml`

- [ ] **Step 1: Add an SP‑2 step after the SP‑1 step**

Find the SP‑1 step and insert the SP‑2 step immediately after it (before "Stop Supabase"):

```yaml
      - name: SP-2 behavioral test (permission convention + status guard + team notes)
        env:
          DB_URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
        run: psql "$DB_URL" -v ON_ERROR_STOP=1 -f "Base de donnée DLL et API/tests/test_sp2_permission_behavior.sql"
```

- [ ] **Step 2: Validate the YAML**

Run:
```bash
node -e "const y=require('./bertel-tourism-ui/node_modules/js-yaml');const fs=require('fs');const d=y.load(fs.readFileSync('.github/workflows/sql-fresh-apply.yml','utf8'));console.log('OK steps:',d.jobs['fresh-apply'].steps.length)"
```
Expected: `OK steps: 9`.

- [ ] **Step 3: Commit** *(skip if leaving git to the user)*

```bash
git add ".github/workflows/sql-fresh-apply.yml"
git commit -m "ci(sql): run SP-2 behavioral test in the fresh-apply gate"
```

---

## Self-review (completed during planning)

- **Spec coverage:** convention table (spec §3) → Task 1; team-note rule + disambiguation (spec §4) → Task 1 + test assertions; behavioral test fixture + assertions (spec §5) → Task 2 (viewer/contributor/editor; helper booleans; status guard; note create/edit-own/admin-edit-any all asserted); CI verification (spec §6) → Task 3. No `org_permission` grant, no schema (spec §2) — honored (none present).
- **Placeholder scan:** none — full convention markdown and full test SQL provided; watch-points are flagged uncertainties about the *environment*, not unfinished plan content.
- **Type/name consistency:** permission codes, role codes (`viewer`/`contributor`/`editor`, `org_admin`, `publisher`), helper names (`user_can_write_object_canonical`, `user_can_publish_object`), and column names match SP‑1's migration and the verified schema (auth.users/app_user_profile/user_org_membership/user_org_business_role/user_org_admin_role/object/object_org_link/object_private_description required columns confirmed via information_schema).
- **Red state:** documented — the test errors on the missing helper if SP‑1 isn't applied; green once the full manifest (incl. SP‑1) is applied. It is an acceptance test for SP‑1's behavior, which SP‑1's spec deferred here.
