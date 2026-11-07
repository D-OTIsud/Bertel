# SP‑1 — Canonical-write authorization (design spec)

- **Date:** 2026-06-02
- **Status:** approved (design), pending spec review
- **Part of:** P0.2 "full multi-role enablement" (see `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md` §24). SP‑1 is the backend foundation; SP‑2..SP‑5 follow.
- **Scope:** backend SQL only (RLS policies, helper function, one trigger, one migration file). No frontend, no grants, no UI.

---

## 1. Context & problem

The 22-section object editor authorizes writes two ways, both keyed on the **legacy** `api.is_object_owner(object_id)`:
- the safe-write RPCs gate through `internal.workspace_assert_can_write_object` (owner-only);
- the many direct PostgREST table writes are governed by `owner_write_*` RLS policies (owner-only) and the `object` UPDATE/DELETE policies (`auth.uid() = created_by`).

The Level‑2 permission model is **defined** (`api.user_has_permission`, `api.user_can_write_canonical`, `api.user_can_write_enrichment`, `api.user_can_publish_object`) but is **not** the enforcement path for editor writes. Multi-role ORG contributors therefore cannot edit.

**Live-state finding (2026-06-02, verified read-only):** the catalog is fully seeded (`ref_org_role` = publisher/contributor/reader; all 5 content permissions; helpers defined), but `org_permission` and `user_permission` are **empty (0 grants)** and there is **1 user** (the OTI du Sud platform superuser; all 837 `object_org_link` rows are `publisher`). Consequently `api.user_has_permission(...)` returns FALSE for everyone today, and editing works **only** because `is_object_owner` returns TRUE for the superuser via `is_platform_superuser()`.

**Hard constraint:** the change must be **additive** (`is_object_owner OR user_can_write_canonical`). Replacing `is_object_owner` would lock out the only user — §2.6 of the access-control master plan forbids any admin/superuser bypass of `user_has_permission`, so with zero grants a permission-only rule authorizes no one.

## 2. Goals / non-goals

**Goals**
- Make the Level‑2 canonical-write permission a *valid path* to write an object's canonical data, alongside the legacy owner path, everywhere editor writes are authorized (workspace gate + RLS).
- Zero regression: the existing superuser keeps full write access; read-only ORG members and `contributor`-role ORGs still cannot write canonical.
- Preserve the publish boundary: holding `edit_canonical_when_publisher` must NOT confer the ability to change publication status (that needs `publish_object`).
- Preserve the §20 invariant: `rpc_write_org_description` remains the sole writer of per-org `object_description` overlay rows.

**Non-goals (other sub-projects / unchanged)**
- Granting any permission to any ORG/user → **SP‑2**.
- Frontend `canDirectWrite` relaxation → **SP‑3**.
- Admin UI / user onboarding → **SP‑4 / SP‑5**.
- The org-enrichment write path (`rpc_write_org_description`, gated by `user_can_write_enrichment`) — unchanged.
- The publish path (`rpc_publish_object`, gated by `user_can_publish_object`) — unchanged except for the status-guard flag (below).

## 3. Design

### 3.1 One authorization helper (single source of truth)

```sql
CREATE OR REPLACE FUNCTION api.user_can_write_object_canonical(p_object_id text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, api, auth
AS $$
  SELECT api.is_object_owner(p_object_id)          -- legacy actor-owner + service_role/admin + platform superuser
      OR api.user_can_write_canonical(p_object_id); -- publisher ORG member holding edit_canonical_when_publisher
$$;
-- REVOKE FROM PUBLIC, anon; GRANT TO authenticated, service_role;
```

`api.user_can_write_canonical` already encodes "Level‑2 `edit_canonical_when_publisher` AND the active ORG is `publisher` on the object". `is_object_owner` already folds in `service_role`/`admin` and `is_platform_superuser`. The OR is the whole rule.

### 3.2 Apply the helper across the canonical write surface

Substitute `api.is_object_owner(<id>)` → `api.user_can_write_object_canonical(<id>)` in every **write** policy currently keyed on `is_object_owner`, and in the workspace gate. The complete surface (enumerated from `rls_policies.sql`, exact lines pinned in the implementation plan):

- **Workspace gate:** `internal.workspace_assert_can_write_object` (`object_workspace_safe_write_rpcs.sql:77`).
- **`object` table:** `owner_update_object` (UPDATE) and `owner_delete_object` (DELETE) — currently `auth.uid() = created_by`; becomes `created_by OR user_can_write_object_canonical(id)`. (INSERT stays on `user_can_create_object()`, unchanged.)
- **`owner_write_*` child-table policies (`FOR ALL USING`):** `object_location`, `object_place`, `contact_channel`, `media`, `object_legal`, `object_discount`, `object_group_policy`, `object_price` (+ `object_price_period` via parent), `object_menu` (+ `object_menu_item`, `_dietary_tag`, `_allergen`, `_cuisine_type`, `_media` via parents), `object_meeting_room` (+ `meeting_room_equipment`), `object_pet_policy`, `object_fma_occurrence`, `object_iti_stage_media` (via stage).
- **`owner_object_membership_write`** on `object_membership` (`rls_policies.sql:1693`, the §17 "Rattachements" write path): `auth.role() IN ('service_role','admin') OR is_object_owner(COALESCE(object_id, org_object_id))` — substitute the `is_object_owner` term, preserving the `auth.role()` branch and the `COALESCE` (the COALESCE handles ORG-scoped memberships, where the canonical check then applies to the ORG object itself).

Scope confirmation (checked `rls_policies.sql`): the substitution touches canonical object tables only. The adjacent `incident_report` / `publication` / `audit_*` write policies are `service_role`/`admin`-only and are NOT keyed on `is_object_owner`, so SP‑1 does not touch the CRM / moderation / audit / publication surface.

Notes:
- These are `FOR ALL USING (...)` policies, so the substitution broadens **read and write** alike for canonical writers. That is acceptable and desirable — a canonical writer should also read the rows it edits. Public reads still flow through each table's existing `FOR SELECT` policy (public `USING (true)` on most child tables; visibility-gated on `object_description`); SP‑1 adds only canonical-writer read/write and exposes nothing new to `anon`.
- **Do NOT** change: the `api.is_object_owner` function definition itself, the read-only/`FOR SELECT` policies, the admin/service_role `FOR ALL` policies, or the `GRANT`s.

### 3.3 `object_description` — special case (preserve §20)

`object_description` holds canonical rows (`org_object_id IS NULL`) and per-org overlay rows, and `rpc_write_org_description` (SECURITY DEFINER) is the sole legitimate overlay writer. To add canonical writers **without** letting them touch other orgs' overlays via RLS:

```sql
-- owner_write_description becomes:
USING (
  api.is_object_owner(object_id)                                   -- legacy owner: unchanged (full)
  OR (api.user_can_write_canonical(object_id) AND org_object_id IS NULL) -- new path: canonical rows only
)
```
The new canonical path is constrained to `org_object_id IS NULL`; overlays remain the RPC's domain.

### 3.4 Protect `object.status` (canonical-edit ≠ publish)

Broadening the `object` UPDATE policy would otherwise let an `edit_canonical_when_publisher`-only user change `status` directly (PostgREST UPDATE), bypassing the `publish_object` permission. Guard it:

```sql
CREATE OR REPLACE FUNCTION api.guard_object_status_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, api, auth AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND auth.role() NOT IN ('service_role','admin')
     AND NOT api.is_platform_superuser()
     AND COALESCE(current_setting('app.allow_status_change', true), '') <> '1'
  THEN
    RAISE EXCEPTION 'Object status changes must go through rpc_publish_object (publish_object permission required)'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_object_status_change
  BEFORE UPDATE OF status ON object
  FOR EACH ROW EXECUTE FUNCTION api.guard_object_status_change();
```

`rpc_publish_object` (the only legitimate status path) sets the flag before its UPDATE:
```sql
PERFORM set_config('app.allow_status_change', '1', true);  -- true = transaction-local
```
`service_role`/`admin`/platform-superuser remain exempt (platform ops, migrations, the existing admin `FOR ALL` policy). This also hardens the pre-existing publish path against accidental direct status edits.

### 3.5 Migration, manifest, verification

- New idempotent file **`Base de donnée DLL et API/migration_permission_write_paths.sql`** (`CREATE OR REPLACE` for the helper/trigger fn; `DROP POLICY IF EXISTS` + `CREATE POLICY` for each policy; `DROP TRIGGER IF EXISTS` + `CREATE TRIGGER`; transaction-wrapped). Reversible: a documented down-migration restores the `is_object_owner` predicates and drops the trigger/helper.
- **Apply order:** after `rls_policies.sql` (depends on the permission helpers) and after `object_workspace_safe_write_rpcs.sql` (the gate). Add it to the manifest in `docs/SQL_ROLLOUT_RUNBOOK.md`, the two README quick-starts, and `ci_fresh_apply.sql` (step between RLS/RPCs and branding) — so the CI fresh-apply gate covers it.
- `rpc_publish_object` edit lives in `api_views_functions.sql` (its current home) so the manifest ordering is unaffected.

## 4. Authorization semantics after SP‑1 (before any SP‑2 grant)

| Caller | Canonical write (name, location, media, pricing, …) | `object.status` change |
|---|---|---|
| Platform superuser / service_role | ✅ (via `is_object_owner`) | ✅ (trigger-exempt) |
| Actor-owner (`actor_object_role.is_primary`) | ✅ (via `is_object_owner`) | ❌ (must use publish RPC) |
| Publisher-ORG member with `edit_canonical_when_publisher` | ✅ (via `user_can_write_canonical`) — **inert until SP‑2 grants it** | ❌ unless also `publish_object` (via RPC) |
| Contributor-ORG member / read-only member | ❌ | ❌ |

Net behavior change on live **today**: none (0 grants, 1 superuser) — SP‑1 only opens the path.

## 5. Verification

- **CI fresh-apply gate** proves the migration applies clean in dependency order on a blank Supabase DB.
- **No-regression:** confirm the superuser still writes (read-only probe of policy presence + a scratch/branch write test).
- **Positive/negative permission test (lands with SP‑2, once a grant + a second user exist):** a publisher-ORG user *with* `edit_canonical_when_publisher` can write canonical and cannot change status; a user *without* it cannot write.
- **Status guard:** a direct PostgREST `UPDATE object SET status=...` by a non-superuser is rejected; `rpc_publish_object` still succeeds.

## 6. Risks & mitigations

- **Lock-out risk** → mitigated by the additive OR and `is_object_owner` retaining the superuser path; verified no-regression.
- **Status self-publish** → mitigated by the `BEFORE UPDATE OF status` trigger + RPC flag.
- **Overlay clobber (§20)** → mitigated by the `org_object_id IS NULL` predicate on `object_description`.
- **Performance:** the helper runs per affected row on writes (low volume) and on reads of the broadened `FOR ALL` tables; predicates are the same membership/`object_org_link` lookups already used by `can_read_extended`. Acceptable; revisit only if a hot read path on these child tables regresses.
- **Missed policy:** the implementation plan must enumerate every `is_object_owner` write usage from `rls_policies.sql` and confirm none is left on the legacy predicate (except the function definition and intentional read/admin policies).

## 7. Rollback

Re-run the prior `rls_policies.sql` definitions (restore `is_object_owner` predicates), `DROP TRIGGER trg_guard_object_status_change`, `DROP FUNCTION api.guard_object_status_change`, `DROP FUNCTION api.user_can_write_object_canonical`, and revert the `rpc_publish_object` flag line. No data changes, so rollback is pure DDL.
