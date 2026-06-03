# SP‑2 — Permission activation: convention + behavioral test (design spec)

- **Date:** 2026-06-02
- **Status:** approved (design), pending spec review
- **Part of:** P0.2 "full multi-role enablement" (see `lot1_mapping_decisions.md` §24). Depends on SP‑1 (`migration_permission_write_paths.sql`). Precedes SP‑3/SP‑4/SP‑5.
- **Scope:** documentation (a role→permission convention) + one behavioral test. **No schema, no DDL, no production grants.**

---

## 1. Context & problem

SP‑1 wired the canonical-write permission path additively but it is **inert**: `org_permission` and `user_permission` are empty, and only the OTI superuser exists. SP‑2 "activates" the model — but the activation is constrained by locked decisions:

- **Roles confer no permissions (master plan §2.4, §D1).** Business roles `viewer`(10)/`contributor`(20)/`editor`(30) are orthogonal to permissions. A role→permission mapping must NOT be built. Permissions come only from `org_permission` (all members) or `user_permission` (one user).
- **No Level‑3 revoke exists.** An `org_permission` grant cannot be selectively walked back for a `viewer`. So org-wide content-edit grants would give every member edit rights, breaking role differentiation. → **Content-edit permissions are granted per-user, never org-wide.**
- **Only the superuser exists today.** There is no one to grant to yet; real per-user grants happen at onboarding (SP‑5).

Therefore SP‑2 cannot meaningfully "grant OTI permissions" now. What it CAN do: lock the **convention** that admins will apply per-user (and that the SP‑4 admin UI will pre-check as suggested defaults), and build the **behavioral test** that proves SP‑1 + the grant path work end-to-end.

## 2. Goals / non-goals

**Goals**
- Lock a documented role→permission convention (which permissions an admin grants for each business role).
- Document the **"information équipe" (team notes)** access rule and confirm it is already enforced by the existing `object_private_description` RLS.
- Build a behavioral test proving: granted users can write canonical; `contributor` (canonical but no publish) is blocked from status changes by SP‑1's guard; `editor` can publish; `viewer` writes no canonical but CAN create team notes and edit only their own.

**Non-goals (other sub-projects / unchanged)**
- Real production permission grants → **SP‑5** (needs real users).
- The admin UI that applies the convention → **SP‑4**.
- The CRM / team-messages module (`write_crm_notes`, `manage_team_messages`) → P2.
- Any schema change, any `org_permission` grant, any role→permission mechanism (forbidden by §2.4).

## 3. The role→permission convention (authoritative)

Permissions an admin grants **per user** (`user_permission`) based on the user's business role. This is a CONVENTION, not an enforced mechanism — `user_has_permission` still resolves only explicit grants; the convention guides admins and pre-fills the SP‑4 UI.

| Permission (`ref_permission.code`) | `viewer` | `contributor` | `editor` |
|---|:--:|:--:|:--:|
| `create_object` | | ✓ | ✓ |
| `edit_canonical_when_publisher` | | ✓ | ✓ |
| `edit_org_enrichment` | | ✓ | ✓ |
| `edit_hours` | | ✓ | ✓ |
| `edit_pricing` | | ✓ | ✓ |
| `edit_gallery` | | ✓ | ✓ |
| `attach_documents` | | ✓ | ✓ |
| `publish_object` | | | ✓ |
| `validate_changes` | | | ✓ |
| `manage_team_messages` | | | ✓ |
| `write_crm_notes` | | (see §4) | (see §4) |

**Rationale for `contributor` holding `edit_canonical_when_publisher`:** OTI du Sud is the `publisher` of all 837 objects, so editing OTI's own catalog *is* canonical editing (`edit_canonical_when_publisher` is publisher-gated). Without it, a contributor could not edit OTI's catalog at all. `edit_org_enrichment` is included for the future case where OTI enriches another org's published object (none today). The `contributor`/`editor` split is precisely "can write canonical, cannot publish" vs "can also publish/validate" — which exercises SP‑1's status guard.

This convention is recorded in `lot1_mapping_decisions.md` (SP‑2 section) and is the source of truth for SP‑4's pre-checked defaults.

## 4. "Information équipe" (team notes) — access rule (already enforced)

Team notes are the per-object internal notes stored in `object_private_description`. The required rule — **create = any active org member (incl. `viewer`); edit/archive = author, or an admin-role superior in the same ORG, or platform superuser** — is **already enforced** by existing RLS, no change needed:

- INSERT `org_insert_private_description` (rls:953): `can_write_object_private_notes(object_id)` (= `current_user_org_id() IS NOT NULL`, i.e. any active member) AND `org_object_id = current_user_org_id()` AND `created_by_user_id = auth.uid()` AND `audience = 'private'`.
- UPDATE/DELETE `manage_update/delete_private_description` (rls:968–981): `can_manage_object_private_note` / `can_delete_object_private_note` = author OR same-ORG hierarchical superior (admin role) OR platform superuser.

**Consequences for SP‑2:**
- The convention treats team-note create/edit as **membership + author + admin-role based**, NOT a granted permission. A `viewer` therefore CAN create team notes and edit their own — `viewer` is "no catalog write," not "no write at all."
- **Disambiguation (documented, not changed here):** "information équipe" = the membership-based `object_private_description` path. The `write_crm_notes` permission and `manage_team_messages` permission gate the separate, not-yet-built CRM / team-messages module — they do NOT gate `object_private_description`. SP‑2 records this so the two paths aren't conflated later.

## 5. Behavioral test

A new transactional, self-rolling-back test `Base de donnée DLL et API/tests/test_sp2_permission_behavior.sql`, added to the CI gate after the SP‑1 structural test. It seeds a self-contained fixture and impersonates each user via `request.jwt.claims` (`set local role authenticated; set local request.jwt.claims = '{"sub":"…","role":"authenticated"}'`), then `ROLLBACK`s.

**Fixture (all inside the test transaction):**
- 1 test ORG object (`object_type='ORG'`) and 1 test object published by it (`object_org_link` role `publisher`).
- 3 synthetic users in `auth.users` + `app_user_profile` with role **`tourism_agent`** (NOT superuser — so `is_object_owner` does not short-circuit and the permission path is what's exercised), each with an active `user_org_membership` to the test ORG and a `user_org_business_role`:
  - **U_view** (`viewer`): no `user_permission` grants.
  - **U_contrib** (`contributor`): granted `edit_canonical_when_publisher` (+ the rest of the contributor set), NOT `publish_object`.
  - **U_editor** (`editor`): granted `edit_canonical_when_publisher` + `publish_object` (+ editor set); also given an `org_admin` admin role to exercise admin-edits-any-note.

**Assertions (impersonated):**
| As | `user_can_write_object_canonical(obj)` | `user_can_publish_object(obj)` | direct `UPDATE object SET status` | create private note | edit own note | edit another's note |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| U_view | FALSE | FALSE | n/a (RLS denies) | ✓ | ✓ | ✗ |
| U_contrib | TRUE | FALSE | **rejected (status guard)** | ✓ | ✓ | ✗ |
| U_editor | TRUE | TRUE | allowed | ✓ | ✓ | ✓ (admin role) |

- Boolean helper checks are asserted directly (deterministic).
- The status-guard rejection is asserted inside a `BEGIN … EXCEPTION WHEN OTHERS` sub-block (expecting SQLSTATE 42501) so the failure is caught and asserted, not fatal.
- Note: an RLS-denied UPDATE affects 0 rows rather than raising; the note/status assertions account for this (check `ROW_COUNT` / catch the trigger exception as appropriate).

This closes SP‑1's deferred behavioral verification.

## 6. Verification

- CI gate runs `test_sp2_permission_behavior.sql` against the fresh Supabase DB after the manifest + SP‑1 test.
- No live change: SP‑2 adds documentation + a test only; it grants nothing on live.

## 7. Risks & mitigations

- **Fixture correctness** (seeding `auth.users`, profiles, memberships, roles, grants with valid FKs/constraints; the object-id generation trigger) — highest risk; mitigated by the self-rolling-back transaction and the CI red→green loop (first run may need a tweak, like SP‑1's test).
- **Convention drift:** the convention is documentation; nothing enforces that admins follow it. Mitigated by SP‑4 pre-checking these defaults in the grant UI. Acceptable — the model intentionally keeps roles and permissions decoupled.
- **`write_crm_notes` ambiguity:** flagged and documented (§4); not resolved here (belongs to the CRM/team-messages module build).

## 8. Out of scope / deferred

Real per-user grants (SP‑5); the admin grant UI (SP‑4); the CRM/team-messages module; any `org_permission` grant; any schema or role→permission mechanism.
