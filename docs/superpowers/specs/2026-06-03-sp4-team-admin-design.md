# SP-4 — Team Administration (RBAC admin UI + user invite) — Design

**Date:** 2026-06-03
**Author:** d.philippe@otisud.com (with Claude)
**Status:** design — approved
**Roadmap:** `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md` §24 (P0.2 SP‑4; **scope expanded to absorb SP‑5's invite** by user decision 2026-06-03).
**Builds on:** SP‑1/SP‑1b/SP‑2/SP‑3 (permission model live), P0.3 (RLS read gate). The mutate RPCs already exist; this wires them + adds invite + session hydration.

---

## 1. Goal / Non-goals

**Goal.** A single **Team Administration** surface (`/team`) where a platform superuser or an org admin can: **invite** a person (creates the auth user + attaches them to an ORG), and **manage** existing members' business role, admin role, and permissions — turning the live-but-inert P0.2 permission model into something real users exercise.

**Non-goals (deferred, logged).**
- Email/SMTP invites (`inviteUserByEmail`) and an accept-invite/set-password page — chosen mechanism is admin-create + temp password (no SMTP).
- A self-service "change your password" page (temp password persists until the invitee changes it via a future page).
- A multi-org switcher for the platform superuser (only 1 ORG today — defaults to OTI).
- CRM/audit history of who-changed-what (the `granted_by`/`assigned_by` columns exist; no UI).
- Bulk operations (one RPC call per change).

## 2. Decisions locked (this session)
- **Invite is in scope** (SP‑4 absorbs SP‑5's onboarding).
- **Invite mechanism = admin-create + temp password.** A server route creates the user with `email_confirm:true` and a generated temp password returned **once** to the admin to share out-of-band; the invitee signs in at the existing email+password `/login`. No SMTP, no new auth page.
- **Page, not a Settings tab:** new top-level `/team` ("Équipe").
- **Permission editor = per-user, with a business-role preset** (applies the SP‑2 convention), not a global users×permissions matrix.

## 3. Backend findings that shape the design (verified)
- **Mutate RPCs all exist** (`rls_policies.sql`), `SECURITY DEFINER`, rank-gated (admin ranks `team_lead`=10/`org_manager`=20/`org_admin`=30) + anti-self:
  - `rpc_upsert_membership(p_target_user_id uuid, p_org_object_id text, p_business_role_code text)→uuid` (≥20)
  - `rpc_deactivate_membership(p_membership_id uuid)` (≥30, no lateral)
  - `rpc_set_business_role(p_membership_id uuid, p_role_code text)` (≥20)
  - `rpc_set_admin_role(p_membership_id uuid, p_role_code text)` (rank<caller; target needs active business role §2.5; anti-self)
  - `rpc_revoke_admin_role(p_membership_id uuid)` (rank<caller)
  - `rpc_grant_user_permission(p_target_user_id uuid, p_permission_code text)` (≥30, anti-self)
  - `rpc_revoke_user_permission(...)` (≥30, anti-self)
  - `rpc_grant_org_permission(p_org_object_id text, p_permission_code text)` (≥30)
  - `rpc_revoke_org_permission(...)` (≥30)
- **Reads are mostly direct RLS** — an active member can `SELECT` their own ORG's rows (superuser sees all): `user_org_membership` (`is_active AND (user_id=auth.uid() OR org_object_id=api.current_user_org_id())`), `user_org_business_role`/`user_org_admin_role` (active role on active same-ORG membership), `org_permission` (active + member of org), `user_permission` (own, or same-ORG target + caller has active admin role).
- **CORRECTION (found during planning): one new read RPC IS needed — for member *identities*.** The membership/role/permission *rows* are directly readable, but the roster must show *who* each member is, and **email lives in `auth.users`** (never exposed to `authenticated`) while `app_user_profile.display_name` SELECT is **own-row-or-platform-owner** (an org-admin can't read teammates' profiles). So SP‑4 adds **one** `SECURITY DEFINER` read RPC `api.rpc_list_org_members(p_org_object_id text)` → `(user_id, email, display_name, business_role_code, admin_role_code, permission_codes[])`, gated to platform superuser OR active admin (rank ≥ 10) of that ORG. This is the single backend addition (SQL migration + manifest + CI test); ref catalogs (`ref_*`) and `org_permission` stay direct reads, and all mutations stay the existing RPCs.
- **Session gap:** `current_user_admin_rank()`/`current_user_admin_role_code()` exist but aren't hydrated. Session store has `role/userId/orgId/canEditObjects`, not admin rank.
- **User-lookup gap:** `app_user_profile` SELECT is own-row-or-platform-owner → a non-owner can't browse other users. The invite route (service-role) sidesteps this by creating the user directly; we do **not** need a user-search.
- **Reference catalogs** (`ref_org_business_role`, `ref_org_admin_role`, `ref_permission`) are publicly readable ref tables.
- **Service-role server pattern exists**: `getServerSupabaseClient()` (`src/lib/supabase-server.ts`, guarded by `import 'server-only'` via `env.server.ts`, `SUPABASE_SERVICE_ROLE_KEY`) — same pattern as `POST /api/media/upload`.
- **Auth today:** email+password (`signInWithEmailPassword`) + Google (`signInWithGoogle`); `/login` exists; no auth-callback/set-password page.

## 4. Architecture — three units

### 4.1 Invite route — `POST /api/admin/invite` (server-only)
Request `{ email, orgObjectId, businessRoleCode, adminRoleCode? }`. Steps:
1. **Authenticate the caller** from their Supabase session (cookies/bearer, per the app's SSR auth — pin in plan against the media route).
2. **Authorize the caller** *as themselves* (user-scoped client): require `api.is_platform_superuser()` OR `api.current_user_admin_rank() >= 30`. **Reject otherwise (403)** — the route uses service-role next, which bypasses RLS, so this gate is the only thing protecting user-creation.
3. **Create the auth user** with `getServerSupabaseClient()` (service-role): `auth.admin.createUser({ email, password: <cryptoRandom>, email_confirm: true })`. Handle "already exists" → 409 with the existing `user_id` so the admin can just attach.
4. **Ensure `app_user_profile.role='tourism_agent'`** for the new user (the `on_auth_user_created` trigger creates the profile; set/confirm the role so the invitee can bootstrap a session — a NULL role breaks `useBootstrapSession`).
5. Return `{ userId, tempPassword, alreadyExisted }` — `tempPassword` shown once.

Membership + role + permission wiring is **not** done in the route — the client does it via the rank-gated RPCs **as the admin** (so the existing guards apply uniformly). The route's only privileged act is user creation.

### 4.2 Session hydration
Extend `useBootstrapSession` to also fetch `api.current_user_admin_rank()` + `api.current_user_admin_role_code()`; store `adminRank:number|null`, `adminRoleCode:string|null` in `session-store`. A derived `canAdministerTeam = role==='owner'||role==='super_admin'|| (adminRank ?? 0) >= 10` gates the nav item + route **visibility**. **Per-rank capability** (the UI disables controls beyond the caller's reach; the RPCs enforce it regardless): `team_lead`(10) → read-only roster; `org_manager`(20) → + invite, set business roles, set/revoke admin roles strictly below own rank; `org_admin`(30)/superuser → + user & org permission grants and deactivate. So a team_lead sees the roster but cannot mutate — visibility ≥10, actions gated per RPC.

### 4.3 RBAC service + page
- **`src/services/rbac.ts`** — pure-ish data layer: `listOrgMembers(orgId)` (RLS-direct joined read → typed `OrgMember[]`), `listPermissionCatalog()`, `listMemberPermissions(userId)`/`listOrgPermissions(orgId)`, `listRoleCatalogs()`, and thin wrappers `upsertMembership`/`setBusinessRole`/`setAdminRole`/`revokeAdminRole`/`deactivateMembership`/`grant|revokeUserPermission`/`grant|revokeOrgPermission` (each `apiClient.schema('api').rpc(...)`), plus `inviteUser()` (POST the route). Maps RPC error SQLSTATE/messages → typed errors.
- **Business-role → permission preset** (the SP‑2 convention) lives as a pure constant + helper `presetPermissionsFor(roleCode)`; unit-tested.
- **`TeamAdminPage`** (view) + small components: `MembersTable`, `InviteMemberDialog`, `MemberPermissionsDrawer`, `RoleSelect`. Reads on mount (scoped to `orgId`; superuser → OTI default), re-reads affected rows after each mutation.

## 5. UX
Members table: name/email · business role · admin role · #permissions · active. Actions:
- **Invite** → dialog (email + business role + optional admin role) → `inviteUser()` route, then `upsertMembership` + `setBusinessRole` (+ `setAdminRole`) + preset permission grants → success panel showing the **temp password once** (copy button) + the invitee's email.
- **Business/admin role** → inline `RoleSelect` (options filtered to ranks strictly below the caller's; admin-role change disabled if target lacks an active business role, per §2.5).
- **Permissions** → `MemberPermissionsDrawer`: category groups (content/crm/team/media), an **"Apply [role] preset"** button (SP‑2 set), then per-permission toggles for exceptions. Superuser/org_admin also see an **"Org defaults"** panel for `org_permission` grants.
- **Anti-self**: a caller's own row's mutating controls are disabled with a tooltip ("admins can't change their own roles/permissions — ask another admin"); RPCs enforce it regardless.
- **Deactivate member** → confirm dialog → `deactivateMembership`.

## 6. Security model
- The **only** privileged server action is user-creation, behind the route's explicit caller-authz (superuser/≥30). Everything else is a normal authenticated RPC whose `SECURITY DEFINER` body re-checks rank/anti-self — the UI's gating is convenience, not the security boundary.
- Service-role key stays server-only (`getServerSupabaseClient()` + `import 'server-only'`); never shipped to the client.
- Generated temp password: cryptographically random, returned once, never logged.

## 7. Error handling
RPC errors carry stable prefixes — map to friendly FR toasts:
`SELF_ACTION_FORBIDDEN`, `INSUFFICIENT_RANK`, `RANK_VIOLATION`, `INVARIANT_VIOLATION` (admin role needs active business role), `INVALID_ORG`. Route errors: 401 (no session), 403 (not admin), 409 (email exists → offer "attach existing"), 422 (bad email), 500.

## 8. Testing
- **Jest unit** (`npm run test:run`): `presetPermissionsFor` (SP‑2 convention), `canAdministerTeam` gating helper, role-option filtering by caller rank, RPC-error→toast mapping, and `rbac.ts` param mapping (mock supabase client). Pattern mirrors SP‑3's `canWriteCanonicalDirect` tests.
- **Invite route**: a server test asserting it 403s a non-admin caller and 401s no session (mock the user-scoped client returning `is_platform_superuser=false`/rank<30) — the security-critical path.
- **Typecheck** clean. Frontend + route only ⇒ no SQL fresh-apply-gate impact.
- Manual/behavioral validation uses the SP‑2-style seeded fixture (a second user) since live still has 1 user; document the manual check (invite a test user → assign contributor → confirm they can edit, can't publish).

## 9. File structure
- Create: `src/app/api/admin/invite/route.ts`; `src/app/(main)/team/page.tsx`; `src/views/TeamAdminPage.tsx`; `src/features/team/{MembersTable,InviteMemberDialog,MemberPermissionsDrawer,RoleSelect}.tsx`; `src/services/rbac.ts` (+ `rbac.test.ts`); `src/features/team/permission-presets.ts` (+ test).
- Modify: `src/hooks/useBootstrapSession.ts`, `src/store/session-store.ts` (admin rank/role + `canAdministerTeam`); `src/components/layout/Sidebar.tsx` (nav item, gated).
- Follow existing patterns (services call `apiClient.schema('api').rpc`; views under `src/views`; feature components under `src/features`).

## 10. Risks
- **Route caller-authz** is the security lynchpin — must verify against the *caller's* session, not service-role. Mitigation: explicit server test; pin the SSR-auth token mechanism from the media route in the plan.
- **New user's profile role** must be non-NULL or the invitee can't bootstrap — handled in route step 4; verify the `on_auth_user_created` trigger's default.
- **Temp password persistence** (no change-password page yet) — accepted for v1; deferred item logged.
- **`current_user_org_id()` for the superuser** may be NULL (no membership) — the page must let the superuser target OTI explicitly; pin behavior in the plan (default to the single ORG).
