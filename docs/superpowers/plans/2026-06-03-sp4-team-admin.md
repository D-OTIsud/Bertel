# SP-4 — Team Administration (RBAC + invite) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `/team` "Équipe" admin surface where a platform superuser or org admin can invite a person (admin-create + temp password) and manage members' business role, admin role, and permissions — wiring the existing rank-gated RBAC RPCs.

**Architecture:** One new `SECURITY DEFINER` read RPC for the roster-with-identities (`rpc_list_org_members`); all other reads are direct RLS `.from()`; all mutations are the existing RPCs; invite is a server-only route (service-role) behind caller-authz; the page is shadcn/Radix UI. Session gains `adminRank`/`adminRoleCode`.

**Tech Stack:** Next.js App Router, `@supabase/supabase-js`, Zustand session store, shadcn/ui (Radix Dialog/Sheet/Select) + `sonner`, Jest. PostgreSQL (one migration through the SQL fresh-apply CI gate).

**Branch:** `feat/sp4-team-admin` (off P0.3-merged master; spec + CLAUDE.md invariant already committed).

**Verification model:** Task 1 is SQL → verified by the GitHub **SQL fresh-apply gate** on push (no local Docker), like P0.3. Tasks 2-11 are frontend/route → verified **locally** with `npm run test:run` (Jest) and `npm run typecheck` from `bertel-tourism-ui/`. Spec: [2026-06-03-sp4-team-admin-design.md](../specs/2026-06-03-sp4-team-admin-design.md).

---

## File Structure
- **Create (SQL):** `Base de donnée DLL et API/migration_sp4_list_org_members.sql`; `Base de donnée DLL et API/tests/test_sp4_list_org_members.sql`.
- **Create (frontend):** `src/features/team/permission-presets.ts` (+ `.test.ts`); `src/services/rbac.ts` (+ `.test.ts`); `src/app/api/admin/invite/route.ts` (+ `route.test.ts`); `src/app/(main)/team/page.tsx`; `src/views/TeamAdminPage.tsx`; `src/features/team/{MembersTable,RoleSelect,InviteMemberDialog,MemberPermissionsDrawer}.tsx`; `src/store/session-selectors.ts` (+ `.test.ts`) for `canAdministerTeam`.
- **Modify:** `Base de donnée DLL et API/ci_fresh_apply.sql`, `docs/SQL_ROLLOUT_RUNBOOK.md`, `README.md`, `Base de donnée DLL et API/README.md` (manifest step 8e); `src/store/session-store.ts` + `src/hooks/useBootstrapSession.ts` (admin rank/code); `src/components/layout/Sidebar.tsx` (nav item); `.github/workflows/sql-fresh-apply.yml` (test step).
- Paths under `bertel-tourism-ui/` unless in `Base de donnée DLL et API/`.

---

## Task 1: `rpc_list_org_members` read RPC (+ CI gate wiring)

**Files:**
- Create: `Base de donnée DLL et API/migration_sp4_list_org_members.sql`
- Create: `Base de donnée DLL et API/tests/test_sp4_list_org_members.sql`
- Modify: `Base de donnée DLL et API/ci_fresh_apply.sql`, `.github/workflows/sql-fresh-apply.yml`, `docs/SQL_ROLLOUT_RUNBOOK.md`, `README.md`, `Base de donnée DLL et API/README.md`

- [ ] **Step 1: Write the migration**

`Base de donnée DLL et API/migration_sp4_list_org_members.sql`:
```sql
-- migration_sp4_list_org_members.sql
-- SP-4 — roster read with member IDENTITIES (email in auth.users is not client-readable;
-- app_user_profile.display_name is own-or-owner). One SECURITY DEFINER read RPC returns the
-- full team roster for an ORG, gated to platform superuser OR an active admin (any rank) of that ORG.
-- PREREQUISITES: schema_unified.sql, rls_policies.sql (is_platform_superuser). APPLY after rls_policies.sql.
-- IDEMPOTENT: CREATE OR REPLACE. REVERSIBLE: DROP FUNCTION api.rpc_list_org_members(text).
BEGIN;

CREATE OR REPLACE FUNCTION api.rpc_list_org_members(p_org_object_id text)
RETURNS TABLE(
  membership_id uuid,
  user_id uuid,
  email text,
  display_name text,
  is_active boolean,
  business_role_code text,
  admin_role_code text,
  permission_codes text[]
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, api, auth
AS $fn$
BEGIN
  IF NOT (
    api.is_platform_superuser()
    OR EXISTS (
      SELECT 1 FROM user_org_membership m
      JOIN user_org_admin_role uar ON uar.membership_id = m.id AND uar.is_active = TRUE
      WHERE m.user_id = auth.uid() AND m.is_active = TRUE AND m.org_object_id = p_org_object_id
    )
  ) THEN
    RAISE EXCEPTION 'INSUFFICIENT_RANK: an active admin role in this org is required to list its members'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    m.id, m.user_id, u.email::text, p.display_name, m.is_active,
    br.code, ar.code,
    COALESCE((
      SELECT array_agg(rp.code ORDER BY rp.code)
      FROM user_permission up JOIN ref_permission rp ON rp.id = up.permission_id
      WHERE up.user_id = m.user_id AND up.is_active = TRUE
    ), ARRAY[]::text[])
  FROM user_org_membership m
  LEFT JOIN auth.users u                ON u.id = m.user_id
  LEFT JOIN app_user_profile p          ON p.id = m.user_id
  LEFT JOIN user_org_business_role ubr  ON ubr.membership_id = m.id AND ubr.is_active = TRUE
  LEFT JOIN ref_org_business_role br    ON br.id = ubr.role_id
  LEFT JOIN user_org_admin_role uar2    ON uar2.membership_id = m.id AND uar2.is_active = TRUE
  LEFT JOIN ref_org_admin_role ar       ON ar.id = uar2.role_id
  WHERE m.org_object_id = p_org_object_id AND m.is_active = TRUE
  ORDER BY p.display_name NULLS LAST, u.email;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION api.rpc_list_org_members(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.rpc_list_org_members(text) TO authenticated, service_role;

COMMIT;
```

- [ ] **Step 2: Write the CI test**

`Base de donnée DLL et API/tests/test_sp4_list_org_members.sql`:
```sql
-- test_sp4_list_org_members.sql — SP-4 roster RPC. Run AFTER the full manifest (+ this migration + seeds).
-- Self-contained + transactional. Asserts: function exists; an org-admin sees their org's members with
-- email; a non-admin/other-ORG user is rejected (42501).
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_org   text := 'ORGRUN9999999951';
  v_admin uuid := '00000000-0000-4000-a000-0000000000c1';
  v_member uuid := '00000000-0000-4000-a000-0000000000c2';
  v_outsider uuid := '00000000-0000-4000-a000-0000000000c3';
  v_pub_role uuid; v_admin_role uuid;
  v_m_admin uuid; v_m_member uuid;
  v_rc integer;
BEGIN
  SELECT id INTO v_pub_role   FROM ref_org_business_role WHERE code='editor';
  SELECT id INTO v_admin_role FROM ref_org_admin_role    WHERE code='org_admin';

  INSERT INTO object (id, object_type, name, status) VALUES (v_org, 'ORG', 'SP4 Org', 'published');
  INSERT INTO auth.users (id, email) VALUES
    (v_admin, 'sp4_admin@test.local'), (v_member, 'sp4_member@test.local'), (v_outsider, 'sp4_out@test.local');
  INSERT INTO app_user_profile (id, role, display_name) VALUES
    (v_admin,'tourism_agent','SP4 Admin'), (v_member,'tourism_agent','SP4 Member'), (v_outsider,'tourism_agent','SP4 Out')
    ON CONFLICT (id) DO UPDATE SET role=EXCLUDED.role, display_name=EXCLUDED.display_name;

  INSERT INTO user_org_membership (user_id, org_object_id, is_active) VALUES (v_admin, v_org, TRUE) RETURNING id INTO v_m_admin;
  INSERT INTO user_org_membership (user_id, org_object_id, is_active) VALUES (v_member, v_org, TRUE) RETURNING id INTO v_m_member;
  INSERT INTO user_org_business_role (membership_id, role_id, is_active) VALUES (v_m_admin, v_pub_role, TRUE), (v_m_member, v_pub_role, TRUE);
  INSERT INTO user_org_admin_role (membership_id, role_id, is_active) VALUES (v_m_admin, v_admin_role, TRUE);

  -- admin sees both members (with email)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    SELECT count(*) INTO v_rc FROM api.rpc_list_org_members(v_org);
    ASSERT v_rc = 2, 'admin must see 2 members';
    ASSERT (SELECT bool_and(email IS NOT NULL) FROM api.rpc_list_org_members(v_org)), 'roster must include emails';
  RESET ROLE;

  -- outsider (no membership) is rejected
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_outsider, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    BEGIN
      PERFORM count(*) FROM api.rpc_list_org_members(v_org);
      RAISE EXCEPTION 'SP4 GUARD FAILED: outsider listed members';
    EXCEPTION WHEN insufficient_privilege THEN NULL;  -- expected 42501
    END;
  RESET ROLE;

  RAISE NOTICE 'SP-4 rpc_list_org_members test passed.';
END$$;
ROLLBACK;
```

- [ ] **Step 3: Wire into the manifest + workflow + docs**

In `ci_fresh_apply.sql`, after the `8d` block (`migration_rls_read_gate_p03.sql`):
```sql
\echo '== 8e     migration_sp4_list_org_members.sql  (SP-4 roster read RPC) =='
\ir migration_sp4_list_org_members.sql
```
In `.github/workflows/sql-fresh-apply.yml`, after the "P0.3 behavioral test" step:
```yaml
      - name: SP-4 roster RPC test (rpc_list_org_members auth + shape)
        env:
          DB_URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
        run: psql "$DB_URL" -v ON_ERROR_STOP=1 -f "Base de donnée DLL et API/tests/test_sp4_list_org_members.sql"
```
In `docs/SQL_ROLLOUT_RUNBOOK.md`, `README.md`, `Base de donnée DLL et API/README.md`: add a `migration_sp4_list_org_members.sql` entry immediately after the `migration_rls_read_gate_p03.sql` (8d) entry, mirroring each file's format (desc: "SP-4 — roster read RPC `api.rpc_list_org_members` (member identities for the Team admin page)").

- [ ] **Step 4: Commit**
```bash
git -C "C:\Users\dphil\Bertel3.0" add "Base de donnée DLL et API/migration_sp4_list_org_members.sql" "Base de donnée DLL et API/tests/test_sp4_list_org_members.sql" "Base de donnée DLL et API/ci_fresh_apply.sql" ".github/workflows/sql-fresh-apply.yml" "docs/SQL_ROLLOUT_RUNBOOK.md" "README.md" "Base de donnée DLL et API/README.md"
git -C "C:\Users\dphil\Bertel3.0" commit -m "feat(sp4): rpc_list_org_members roster RPC + CI test/manifest wiring" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```
(CI verification happens on push in Task 11; no local Docker.)

---

## Task 2: Permission presets (SP-2 convention)

**Files:** Create `src/features/team/permission-presets.ts` + `src/features/team/permission-presets.test.ts`

- [ ] **Step 1: Write the failing test**

`src/features/team/permission-presets.test.ts`:
```typescript
import { presetPermissionsFor, BUSINESS_ROLE_CODES } from './permission-presets';

describe('presetPermissionsFor', () => {
  it('viewer gets no permissions', () => {
    expect(presetPermissionsFor('viewer')).toEqual([]);
  });
  it('contributor gets the 7 content/media editing permissions', () => {
    expect(presetPermissionsFor('contributor').sort()).toEqual([
      'attach_documents','create_object','edit_canonical_when_publisher',
      'edit_gallery','edit_hours','edit_org_enrichment','edit_pricing',
    ]);
  });
  it('editor gets contributor set plus publish/validate/team', () => {
    const editor = presetPermissionsFor('editor');
    expect(editor).toEqual(expect.arrayContaining(presetPermissionsFor('contributor')));
    expect(editor).toEqual(expect.arrayContaining(['publish_object','validate_changes','manage_team_messages']));
    expect(editor).toHaveLength(10);
  });
  it('unknown role → empty', () => {
    expect(presetPermissionsFor('nope')).toEqual([]);
  });
  it('exposes the three business-role codes in rank order', () => {
    expect(BUSINESS_ROLE_CODES).toEqual(['viewer','contributor','editor']);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run (from `bertel-tourism-ui/`): `npm run test:run -- permission-presets`
Expected: FAIL — `Cannot find module './permission-presets'`.

- [ ] **Step 3: Implement**

`src/features/team/permission-presets.ts`:
```typescript
// SP-2 role→permission convention (lot1_mapping_decisions.md §24 SP-2). Used to one-click
// apply a business role's standard permission set; individual toggles handle exceptions.
export const BUSINESS_ROLE_CODES = ['viewer', 'contributor', 'editor'] as const;
export type BusinessRoleCode = (typeof BUSINESS_ROLE_CODES)[number];

const CONTRIBUTOR_PERMISSIONS = [
  'create_object', 'edit_canonical_when_publisher', 'edit_org_enrichment',
  'edit_hours', 'edit_pricing', 'edit_gallery', 'attach_documents',
] as const;

const EDITOR_EXTRA = ['publish_object', 'validate_changes', 'manage_team_messages'] as const;

const PRESETS: Record<string, string[]> = {
  viewer: [],
  contributor: [...CONTRIBUTOR_PERMISSIONS],
  editor: [...CONTRIBUTOR_PERMISSIONS, ...EDITOR_EXTRA],
};

/** The SP-2 default permission codes for a business role; [] for viewer/unknown. */
export function presetPermissionsFor(roleCode: string): string[] {
  return PRESETS[roleCode] ?? [];
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `npm run test:run -- permission-presets`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**
```bash
git -C "C:\Users\dphil\Bertel3.0" add "bertel-tourism-ui/src/features/team/permission-presets.ts" "bertel-tourism-ui/src/features/team/permission-presets.test.ts"
git -C "C:\Users\dphil\Bertel3.0" commit -m "feat(sp4): SP-2 permission-preset helper" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: RBAC service (reads + RPC wrappers + invite + error mapping)

**Files:** Create `src/services/rbac.ts` + `src/services/rbac.test.ts`

- [ ] **Step 1: Write the failing test**

`src/services/rbac.test.ts`:
```typescript
import { getApiClient } from '../lib/supabase';
import { listOrgMembers, setBusinessRole, friendlyRbacError } from './rbac';

jest.mock('../lib/supabase', () => ({ getApiClient: jest.fn() }));
const mockedGetApiClient = jest.mocked(getApiClient);

function clientWithRpc(rpc: jest.Mock) {
  return { schema: jest.fn().mockReturnValue({ rpc }) } as never;
}

describe('rbac service', () => {
  beforeEach(() => mockedGetApiClient.mockReset());

  it('listOrgMembers maps RPC rows to OrgMember objects', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: [{ membership_id: 'm1', user_id: 'u1', email: 'a@b.c', display_name: 'A', is_active: true,
               business_role_code: 'contributor', admin_role_code: null, permission_codes: ['create_object'] }],
      error: null,
    });
    mockedGetApiClient.mockReturnValue(clientWithRpc(rpc));
    const members = await listOrgMembers('ORG1');
    expect(rpc).toHaveBeenCalledWith('rpc_list_org_members', { p_org_object_id: 'ORG1' });
    expect(members[0]).toEqual({
      membershipId: 'm1', userId: 'u1', email: 'a@b.c', displayName: 'A', isActive: true,
      businessRoleCode: 'contributor', adminRoleCode: null, permissionCodes: ['create_object'],
    });
  });

  it('setBusinessRole calls the RPC with mapped params', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: null });
    mockedGetApiClient.mockReturnValue(clientWithRpc(rpc));
    await setBusinessRole('m1', 'editor');
    expect(rpc).toHaveBeenCalledWith('rpc_set_business_role', { p_membership_id: 'm1', p_role_code: 'editor' });
  });

  it('friendlyRbacError maps known SQLSTATE messages', () => {
    expect(friendlyRbacError({ message: 'SELF_ACTION_FORBIDDEN: ...' })).toMatch(/vous-même|propre/i);
    expect(friendlyRbacError({ message: 'INSUFFICIENT_RANK: ...' })).toMatch(/rang|autoris/i);
    expect(friendlyRbacError({ message: 'RANK_VIOLATION: ...' })).toMatch(/rang/i);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npm run test:run -- rbac`
Expected: FAIL — `Cannot find module './rbac'`.

- [ ] **Step 3: Implement**

`src/services/rbac.ts`:
```typescript
import { getApiClient } from '../lib/supabase';
import { getSupabaseClient } from '../lib/supabase';

export interface OrgMember {
  membershipId: string;
  userId: string;
  email: string | null;
  displayName: string | null;
  isActive: boolean;
  businessRoleCode: string | null;
  adminRoleCode: string | null;
  permissionCodes: string[];
}
export interface RefRole { code: string; name: string; rank: number | null; position: number | null; }
export interface RefPermission { code: string; name: string; category: string; }
export interface InviteResult { userId: string; tempPassword: string; alreadyExisted: boolean; }

function requireClient() {
  const c = getApiClient();
  if (!c) throw new Error('Supabase non configuré.');
  return c;
}

/** Roster with identities (SECURITY DEFINER RPC — see migration_sp4_list_org_members.sql). */
export async function listOrgMembers(orgObjectId: string): Promise<OrgMember[]> {
  const { data, error } = await requireClient().schema('api').rpc('rpc_list_org_members', { p_org_object_id: orgObjectId });
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    membershipId: String(r.membership_id),
    userId: String(r.user_id),
    email: (r.email as string) ?? null,
    displayName: (r.display_name as string) ?? null,
    isActive: r.is_active === true,
    businessRoleCode: (r.business_role_code as string) ?? null,
    adminRoleCode: (r.admin_role_code as string) ?? null,
    permissionCodes: Array.isArray(r.permission_codes) ? (r.permission_codes as string[]) : [],
  }));
}

/** Reference catalogs (public ref tables, direct reads). */
export async function listBusinessRoles(): Promise<RefRole[]> {
  const { data, error } = await getSupabaseClient()!.from('ref_org_business_role').select('code,name,position').order('position');
  if (error) throw error;
  return (data ?? []).map((r) => ({ code: r.code, name: r.name, rank: null, position: r.position }));
}
export async function listAdminRoles(): Promise<RefRole[]> {
  const { data, error } = await getSupabaseClient()!.from('ref_org_admin_role').select('code,name,rank').order('rank');
  if (error) throw error;
  return (data ?? []).map((r) => ({ code: r.code, name: r.name, rank: r.rank, position: null }));
}
export async function listPermissionCatalog(): Promise<RefPermission[]> {
  const { data, error } = await getSupabaseClient()!.from('ref_permission').select('code,name,category').eq('is_active', true).order('category');
  if (error) throw error;
  return data ?? [];
}
export async function listOrgPermissions(orgObjectId: string): Promise<string[]> {
  const { data, error } = await getSupabaseClient()!.from('org_permission')
    .select('ref_permission(code)').eq('org_object_id', orgObjectId).eq('is_active', true);
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => (r.ref_permission as { code: string })?.code).filter(Boolean);
}

// ---- Mutations (existing rank-gated RPCs; run as the logged-in admin) ----
async function rpc(name: string, params: Record<string, unknown>): Promise<void> {
  const { error } = await requireClient().schema('api').rpc(name, params);
  if (error) throw error;
}
export const upsertMembership = (userId: string, orgObjectId: string, businessRoleCode: string) =>
  requireClient().schema('api').rpc('rpc_upsert_membership',
    { p_target_user_id: userId, p_org_object_id: orgObjectId, p_business_role_code: businessRoleCode });
export const setBusinessRole = (membershipId: string, roleCode: string) =>
  rpc('rpc_set_business_role', { p_membership_id: membershipId, p_role_code: roleCode });
export const setAdminRole = (membershipId: string, roleCode: string) =>
  rpc('rpc_set_admin_role', { p_membership_id: membershipId, p_role_code: roleCode });
export const revokeAdminRole = (membershipId: string) =>
  rpc('rpc_revoke_admin_role', { p_membership_id: membershipId });
export const deactivateMembership = (membershipId: string) =>
  rpc('rpc_deactivate_membership', { p_membership_id: membershipId });
export const grantUserPermission = (userId: string, code: string) =>
  rpc('rpc_grant_user_permission', { p_target_user_id: userId, p_permission_code: code });
export const revokeUserPermission = (userId: string, code: string) =>
  rpc('rpc_revoke_user_permission', { p_target_user_id: userId, p_permission_code: code });
export const grantOrgPermission = (orgObjectId: string, code: string) =>
  rpc('rpc_grant_org_permission', { p_org_object_id: orgObjectId, p_permission_code: code });
export const revokeOrgPermission = (orgObjectId: string, code: string) =>
  rpc('rpc_revoke_org_permission', { p_org_object_id: orgObjectId, p_permission_code: code });

/** Invite via the server route (service-role). Returns the temp password once. */
export async function inviteUser(input: { email: string; orgObjectId: string; businessRoleCode: string }): Promise<InviteResult> {
  const client = getSupabaseClient();
  const token = (await client?.auth.getSession())?.data.session?.access_token;
  const res = await fetch('/api/admin/invite', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: token ? `Bearer ${token}` : '' },
    body: JSON.stringify({ email: input.email, orgObjectId: input.orgObjectId }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.detail || body?.error || 'invite_failed');
  return { userId: body.userId, tempPassword: body.tempPassword, alreadyExisted: !!body.alreadyExisted };
}

const FRIENDLY: Array<[string, string]> = [
  ['SELF_ACTION_FORBIDDEN', 'Un administrateur ne peut pas modifier son propre rôle ou ses permissions — demandez à un autre admin.'],
  ['INSUFFICIENT_RANK', "Vous n'avez pas un rang d'administration suffisant pour cette action."],
  ['RANK_VIOLATION', 'Action impossible sur un membre de rang égal ou supérieur au vôtre.'],
  ['INVARIANT_VIOLATION', "Un rôle admin exige d'abord un rôle métier actif."],
  ['INVALID_ORG', "Organisation cible invalide."],
];
export function friendlyRbacError(err: { message?: string } | null | undefined): string {
  const msg = err?.message ?? '';
  for (const [code, friendly] of FRIENDLY) if (msg.includes(code)) return friendly;
  return msg || 'Action impossible.';
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `npm run test:run -- rbac`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**
```bash
git -C "C:\Users\dphil\Bertel3.0" add "bertel-tourism-ui/src/services/rbac.ts" "bertel-tourism-ui/src/services/rbac.test.ts"
git -C "C:\Users\dphil\Bertel3.0" commit -m "feat(sp4): rbac service (roster read + RPC wrappers + invite + error map)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Session hydration (admin rank/code + canAdministerTeam)

**Files:** Modify `src/store/session-store.ts`, `src/hooks/useBootstrapSession.ts`; Create `src/store/session-selectors.ts` + `.test.ts`

- [ ] **Step 1: Write the failing test** (`src/store/session-selectors.test.ts`):
```typescript
import { canAdministerTeam } from './session-selectors';

describe('canAdministerTeam', () => {
  it('true for platform owner/super_admin regardless of admin rank', () => {
    expect(canAdministerTeam({ role: 'owner', adminRank: null })).toBe(true);
    expect(canAdministerTeam({ role: 'super_admin', adminRank: null })).toBe(true);
  });
  it('true for tourism_agent with an admin rank >= 10', () => {
    expect(canAdministerTeam({ role: 'tourism_agent', adminRank: 10 })).toBe(true);
    expect(canAdministerTeam({ role: 'tourism_agent', adminRank: 30 })).toBe(true);
  });
  it('false for tourism_agent without an admin role', () => {
    expect(canAdministerTeam({ role: 'tourism_agent', adminRank: null })).toBe(false);
  });
  it('false when role is null', () => {
    expect(canAdministerTeam({ role: null, adminRank: null })).toBe(false);
  });
});
```

- [ ] **Step 2: Run it, verify it fails** — `npm run test:run -- session-selectors` → FAIL (module missing).

- [ ] **Step 3a: Implement the selector** (`src/store/session-selectors.ts`):
```typescript
import type { UserRole } from './session-store';

/** Whether the session may SEE the Team admin page. Individual actions are still RPC-rank-gated. */
export function canAdministerTeam(s: { role: UserRole | null; adminRank: number | null }): boolean {
  if (s.role === 'owner' || s.role === 'super_admin') return true;
  return s.role != null && (s.adminRank ?? 0) >= 10;
}
```

- [ ] **Step 3b: Extend the session store.** In `src/store/session-store.ts`, add to the `SessionState` interface: `adminRank: number | null;` and `adminRoleCode: string | null;`. Add them to the `hydrateFromAuth` payload type and the `set({...})` body (default both to the payload values). Add to the initial state (`adminRank: null, adminRoleCode: null`) and reset them to `null` in `setGuest`/`setBooting` where other fields reset. (Mirror exactly how `orgId`/`orgName` are threaded.)

- [ ] **Step 3c: Hydrate in bootstrap.** In `src/hooks/useBootstrapSession.ts`, add two helpers mirroring `fetchActiveOrg`:
```typescript
async function fetchAdminRank(): Promise<number | null> {
  const apiClient = getApiClient();
  if (!apiClient) return null;
  try {
    const { data, error } = await apiClient.schema('api').rpc('current_user_admin_rank');
    if (error) { console.warn('current_user_admin_rank unavailable.', error); return null; }
    return typeof data === 'number' ? data : null;
  } catch (err) { console.warn('current_user_admin_rank threw.', err); return null; }
}
async function fetchAdminRoleCode(): Promise<string | null> {
  const apiClient = getApiClient();
  if (!apiClient) return null;
  try {
    const { data, error } = await apiClient.schema('api').rpc('current_user_admin_role_code');
    if (error) { console.warn('current_user_admin_role_code unavailable.', error); return null; }
    return typeof data === 'string' ? data : null;
  } catch (err) { console.warn('current_user_admin_role_code threw.', err); return null; }
}
```
Then, after the `const activeOrg = await fetchActiveOrg();` block (and its `if (cancelled) return;`), add:
```typescript
const adminRank = await fetchAdminRank();
if (cancelled) return;
const adminRoleCode = await fetchAdminRoleCode();
if (cancelled) return;
```
and add `adminRank, adminRoleCode,` to the `hydrateFromAuth({...})` call.

- [ ] **Step 4: Run it, verify it passes + typecheck.**
Run: `npm run test:run -- session-selectors` → PASS (4). Then `npm run typecheck` → clean (confirms the store interface/usage line up).

- [ ] **Step 5: Commit**
```bash
git -C "C:\Users\dphil\Bertel3.0" add "bertel-tourism-ui/src/store/session-store.ts" "bertel-tourism-ui/src/store/session-selectors.ts" "bertel-tourism-ui/src/store/session-selectors.test.ts" "bertel-tourism-ui/src/hooks/useBootstrapSession.ts"
git -C "C:\Users\dphil\Bertel3.0" commit -m "feat(sp4): hydrate admin rank/code + canAdministerTeam selector" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Invite API route (service-role, caller-authz)

**Files:** Create `src/app/api/admin/invite/route.ts` + `src/app/api/admin/invite/route.test.ts`

- [ ] **Step 1: Write the failing test** (`route.test.ts`):
```typescript
/** @jest-environment node */
import { POST } from './route';

jest.mock('@/lib/supabase-server', () => ({ getServerSupabaseClient: jest.fn() }));
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));
import { getServerSupabaseClient } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

const mockedServer = jest.mocked(getServerSupabaseClient);
const mockedCreate = jest.mocked(createClient);

function req(headers: Record<string, string>, body: unknown): never {
  return { headers: new Headers(headers), json: async () => body } as never;
}

describe('POST /api/admin/invite', () => {
  beforeEach(() => { mockedServer.mockReset(); mockedCreate.mockReset(); process.env.NEXT_PUBLIC_SUPABASE_URL='https://x.supabase.co'; process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='anon'; });

  it('401 when no bearer token', async () => {
    mockedServer.mockReturnValue({ auth: {} } as never);
    const res = await POST(req({}, {}));
    expect(res.status).toBe(401);
  });

  it('403 when caller is neither superuser nor org_admin', async () => {
    mockedServer.mockReturnValue({ auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) } } as never);
    // caller-scoped client: not superuser, rank null
    const rpc = jest.fn()
      .mockResolvedValueOnce({ data: false, error: null })  // is_platform_superuser
      .mockResolvedValueOnce({ data: null, error: null });   // current_user_admin_rank
    mockedCreate.mockReturnValue({ schema: () => ({ rpc }) } as never);
    const res = await POST(req({ authorization: 'Bearer t' }, { email: 'x@y.z', orgObjectId: 'ORG1' }));
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run it, verify it fails** — `npm run test:run -- admin/invite` → FAIL (module missing).

- [ ] **Step 3: Implement** (`src/app/api/admin/invite/route.ts`):
```typescript
import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getServerSupabaseClient } from '@/lib/supabase-server';

export const runtime = 'nodejs';

function genTempPassword(): string {
  // 18 url-safe chars from the Web Crypto API (available in the Node runtime).
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString('base64url');
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const server = getServerSupabaseClient();
  if (!server) return NextResponse.json({ error: 'server_misconfigured' }, { status: 500 });

  const authHeader = req.headers.get('authorization') ?? '';
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!jwt) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const { data: caller, error: callerErr } = await server.auth.getUser(jwt);
  if (callerErr || !caller?.user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  // Authorize AS THE CALLER (service-role bypasses RLS, so this gate is the boundary).
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
  const anon = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();
  const asCaller = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const [{ data: isSuper }, { data: rank }] = await Promise.all([
    asCaller.schema('api').rpc('is_platform_superuser'),
    asCaller.schema('api').rpc('current_user_admin_rank'),
  ]);
  const authorized = isSuper === true || (typeof rank === 'number' && rank >= 30);
  if (!authorized) return NextResponse.json({ error: 'forbidden', detail: 'org_admin (rank ≥ 30) or platform superuser required' }, { status: 403 });

  let body: { email?: unknown; orgObjectId?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad_json' }, { status: 400 }); }
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ error: 'invalid_email' }, { status: 422 });

  const tempPassword = genTempPassword();
  const { data: created, error: createErr } = await server.auth.admin.createUser({
    email, password: tempPassword, email_confirm: true,
  });
  if (createErr) {
    // already-exists → return the existing user id so the admin can just attach a membership.
    const { data: list } = await server.auth.admin.listUsers();
    const existing = list?.users?.find((u) => u.email?.toLowerCase() === email);
    if (existing) return NextResponse.json({ userId: existing.id, alreadyExisted: true }, { status: 409 });
    return NextResponse.json({ error: 'create_failed', detail: createErr.message }, { status: 500 });
  }
  const userId = created.user!.id;
  // Ensure a non-NULL platform role so the invitee can bootstrap a session.
  await server.from('app_user_profile').upsert({ id: userId, role: 'tourism_agent' }, { onConflict: 'id' });

  return NextResponse.json({ userId, tempPassword, alreadyExisted: false }, { status: 201 });
}
```

- [ ] **Step 4: Run it, verify it passes** — `npm run test:run -- admin/invite` → PASS (2).

- [ ] **Step 5: Commit**
```bash
git -C "C:\Users\dphil\Bertel3.0" add "bertel-tourism-ui/src/app/api/admin/invite/route.ts" "bertel-tourism-ui/src/app/api/admin/invite/route.test.ts"
git -C "C:\Users\dphil\Bertel3.0" commit -m "feat(sp4): invite API route (service-role, caller-authz, temp password)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Sidebar nav item (gated)

**Files:** Modify `src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Add the import + nav item + gating.** Add `UsersRound` to the `lucide-react` import. In the `allItems` array, add after the `/publications` entry:
```typescript
  { to: '/team', label: 'Équipe', caption: 'Membres et permissions', roles: ['owner', 'super_admin', 'tourism_agent'], icon: UsersRound },
```
Then gate it by `canAdministerTeam` (the `roles` filter is necessary-but-not-sufficient): read `adminRank` from the store and filter:
```typescript
import { canAdministerTeam } from '@/store/session-selectors';
// ...inside the component, where `role`/`demoMode` are read:
const adminRank = useSessionStore((s) => s.adminRank);
// after computing `items`:
const teamVisible = canAdministerTeam({ role, adminRank });
const navItems = items
  .filter((item) => item.to !== '/settings')
  .filter((item) => item.to !== '/team' || teamVisible);
```

- [ ] **Step 2: Verify typecheck + existing Sidebar test (if any).**
Run: `npm run typecheck` → clean. Run: `npm run test:run -- Sidebar` → PASS or "no tests" (don't add a snapshot test; visibility is covered by the `canAdministerTeam` unit test).

- [ ] **Step 3: Commit**
```bash
git -C "C:\Users\dphil\Bertel3.0" add "bertel-tourism-ui/src/components/layout/Sidebar.tsx"
git -C "C:\Users\dphil\Bertel3.0" commit -m "feat(sp4): gated Équipe nav item" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Team page + roster table (read-only first)

**Files:** Create `src/app/(main)/team/page.tsx`, `src/views/TeamAdminPage.tsx`, `src/features/team/MembersTable.tsx`

- [ ] **Step 1: Route file** (`src/app/(main)/team/page.tsx`):
```typescript
import TeamAdminPage from '@/views/TeamAdminPage';
export default function Page() { return <TeamAdminPage />; }
```

- [ ] **Step 2: MembersTable** (`src/features/team/MembersTable.tsx`) — presentational, takes members + callbacks:
```typescript
'use client';
import type { OrgMember } from '@/services/rbac';

export function MembersTable({ members, currentUserId, onManagePermissions, children }: {
  members: OrgMember[];
  currentUserId: string | null;
  onManagePermissions: (m: OrgMember) => void;
  children?: (m: OrgMember, isSelf: boolean) => React.ReactNode; // role controls slot
}) {
  if (members.length === 0) return <p className="text-sm text-muted-foreground">Aucun membre actif.</p>;
  return (
    <table className="w-full text-sm">
      <thead><tr className="text-left text-muted-foreground">
        <th className="py-2">Membre</th><th>Rôle métier</th><th>Rôle admin</th><th>Permissions</th><th></th>
      </tr></thead>
      <tbody>
        {members.map((m) => {
          const isSelf = m.userId === currentUserId;
          return (
            <tr key={m.membershipId} className="border-t border-border">
              <td className="py-2">
                <div className="font-medium">{m.displayName ?? '—'}</div>
                <div className="text-xs text-muted-foreground">{m.email ?? m.userId}</div>
              </td>
              <td>{children ? children(m, isSelf) : m.businessRoleCode}</td>
              <td>{m.adminRoleCode ?? '—'}</td>
              <td>
                <button className="underline" onClick={() => onManagePermissions(m)} disabled={isSelf}
                  title={isSelf ? "Vous ne pouvez pas modifier vos propres permissions" : undefined}>
                  {m.permissionCodes.length} permission(s)
                </button>
              </td>
              <td>{/* deactivate action wired in Task 8 */}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 3: TeamAdminPage** (`src/views/TeamAdminPage.tsx`) — loads roster, gates access:
```typescript
'use client';
import { useEffect, useState, useCallback } from 'react';
import { useSessionStore } from '@/store/session-store';
import { canAdministerTeam } from '@/store/session-selectors';
import { listOrgMembers, type OrgMember } from '@/services/rbac';
import { MembersTable } from '@/features/team/MembersTable';

export default function TeamAdminPage() {
  const role = useSessionStore((s) => s.role);
  const adminRank = useSessionStore((s) => s.adminRank);
  const orgId = useSessionStore((s) => s.orgId);
  const userId = useSessionStore((s) => s.userId);
  const allowed = canAdministerTeam({ role, adminRank });

  const [members, setMembers] = useState<OrgMember[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!orgId) { setLoading(false); return; }
    setLoading(true);
    try { setMembers(await listOrgMembers(orgId)); setError(null); }
    catch (e) { setError(e instanceof Error ? e.message : 'Erreur de chargement'); }
    finally { setLoading(false); }
  }, [orgId]);

  useEffect(() => { if (allowed) void reload(); }, [allowed, reload]);

  if (!allowed) return <section className="p-6"><p>Accès réservé aux administrateurs.</p></section>;
  return (
    <section className="p-6 space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Équipe</h1>
        {/* InviteMemberDialog mounted in Task 9 */}
      </header>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {loading ? <p className="text-sm text-muted-foreground">Chargement…</p>
        : <MembersTable members={members} currentUserId={userId} onManagePermissions={() => { /* Task 10 */ }} />}
    </section>
  );
}
```

- [ ] **Step 4: Verify** — `npm run typecheck` → clean. (No new unit test here; logic is in the service/selector already tested.)

- [ ] **Step 5: Commit**
```bash
git -C "C:\Users\dphil\Bertel3.0" add "bertel-tourism-ui/src/app/(main)/team/page.tsx" "bertel-tourism-ui/src/views/TeamAdminPage.tsx" "bertel-tourism-ui/src/features/team/MembersTable.tsx"
git -C "C:\Users\dphil\Bertel3.0" commit -m "feat(sp4): /team page + read-only roster table" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Role controls (business + admin) + deactivate

**Files:** Create `src/features/team/RoleSelect.tsx`; Modify `src/views/TeamAdminPage.tsx`, `src/features/team/MembersTable.tsx`

- [ ] **Step 1: RoleSelect** (`src/features/team/RoleSelect.tsx`) — a `<Select>` whose options are filtered to ranks the caller may assign; calls back on change:
```typescript
'use client';
import { Select } from '@/components/ui/select';
import type { RefRole } from '@/services/rbac';

export function RoleSelect({ value, options, callerRank, disabled, includeNone, onChange }: {
  value: string | null;
  options: RefRole[];               // business roles (rank null) OR admin roles (rank set)
  callerRank: number;               // caller's admin rank (superuser → pass Infinity)
  disabled?: boolean;
  includeNone?: boolean;            // admin role can be "none"
  onChange: (code: string | null) => void;
}) {
  // Admin roles: only ranks strictly below the caller's are assignable.
  const assignable = options.filter((o) => o.rank == null || o.rank < callerRank);
  return (
    <Select value={value ?? ''} disabled={disabled} onChange={(e) => onChange(e.target.value || null)}>
      {includeNone && <option value="">— aucun —</option>}
      {assignable.map((o) => <option key={o.code} value={o.code}>{o.name}</option>)}
    </Select>
  );
}
```

- [ ] **Step 2: Wire into the page.** In `TeamAdminPage`, load role catalogs once (`listBusinessRoles`/`listAdminRoles`), compute `callerRank = (role==='owner'||role==='super_admin') ? Infinity : (adminRank ?? 0)`, and pass a `children` render-prop to `MembersTable` that renders a business-role `RoleSelect` (calls `setBusinessRole(m.membershipId, code)` then `reload()`), plus an admin-role `RoleSelect` (calls `setAdminRole`/`revokeAdminRole` then `reload()`). Disable when `isSelf`. On any RPC error, `toast.error(friendlyRbacError(e))` (import `toast` from `sonner`). Add a "Désactiver" button per row (not self) → confirm via `window.confirm` → `deactivateMembership(m.membershipId)` → `reload()`.

```typescript
// in TeamAdminPage, example handler:
import { toast } from 'sonner';
import { setBusinessRole, friendlyRbacError } from '@/services/rbac';
async function changeBusinessRole(m: OrgMember, code: string) {
  try { await setBusinessRole(m.membershipId, code); toast.success('Rôle mis à jour.'); await reload(); }
  catch (e) { toast.error(friendlyRbacError(e as { message?: string })); }
}
```

- [ ] **Step 3: Verify** — `npm run typecheck` → clean; `npm run test:run` → all green.

- [ ] **Step 4: Commit**
```bash
git -C "C:\Users\dphil\Bertel3.0" add "bertel-tourism-ui/src/features/team/RoleSelect.tsx" "bertel-tourism-ui/src/views/TeamAdminPage.tsx" "bertel-tourism-ui/src/features/team/MembersTable.tsx"
git -C "C:\Users\dphil\Bertel3.0" commit -m "feat(sp4): business/admin role controls + deactivate" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Invite dialog (invite + temp-password reveal)

**Files:** Create `src/features/team/InviteMemberDialog.tsx`; Modify `src/views/TeamAdminPage.tsx`

- [ ] **Step 1: InviteMemberDialog** (`src/features/team/InviteMemberDialog.tsx`) — uses shadcn `Dialog`; on submit: `inviteUser({email, orgObjectId, businessRoleCode})` → on success `upsertMembership(userId, orgId, businessRoleCode)` → apply the SP-2 preset via `grantUserPermission` per `presetPermissionsFor(businessRoleCode)` → show temp password once with a copy button → `onDone()` (which triggers `reload()`):
```typescript
'use client';
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { inviteUser, upsertMembership, grantUserPermission, friendlyRbacError } from '@/services/rbac';
import { presetPermissionsFor, BUSINESS_ROLE_CODES } from './permission-presets';

export function InviteMemberDialog({ orgId, onDone }: { orgId: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [roleCode, setRoleCode] = useState<string>('contributor');
  const [busy, setBusy] = useState(false);
  const [temp, setTemp] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    try {
      const { userId } = await inviteUser({ email: email.trim().toLowerCase(), orgObjectId: orgId, businessRoleCode: roleCode });
      await upsertMembership(userId, orgId, roleCode);
      for (const code of presetPermissionsFor(roleCode)) {
        try { await grantUserPermission(userId, code); } catch (e) { console.warn('grant failed', code, e); }
      }
      // temp password from the invite response:
      const res = await inviteAndCapture(email, orgId, roleCode); // see note
      setTemp(res);
      toast.success('Invitation créée.');
      onDone();
    } catch (e) { toast.error(friendlyRbacError(e as { message?: string })); }
    finally { setBusy(false); }
  }
  // ...JSX: trigger button "Inviter", form (email input + role Select), submit; once `temp` set,
  // render the temp password read-only with a "Copier" button (navigator.clipboard.writeText).
  return (/* Dialog with the above */) as never;
}
```
> Implementation note for the engineer: call `inviteUser` **once** and keep its `{ userId, tempPassword }` in local state — do NOT call it twice (the placeholder `inviteAndCapture` above is illustrative). Correct flow: `const invited = await inviteUser(...)` → `upsertMembership(invited.userId, ...)` → preset grants → `setTemp(invited.tempPassword)`. Handle `alreadyExisted` (HTTP 409) by skipping create and just attaching membership (no temp password to show — toast "Utilisateur déjà existant, rattaché à l'organisation").

- [ ] **Step 2: Mount it** in `TeamAdminPage` header: `{orgId && <InviteMemberDialog orgId={orgId} onDone={reload} />}`.

- [ ] **Step 3: Verify** — `npm run typecheck` → clean; `npm run test:run` → green. Manually reason through the single-invite flow (no double call).

- [ ] **Step 4: Commit**
```bash
git -C "C:\Users\dphil\Bertel3.0" add "bertel-tourism-ui/src/features/team/InviteMemberDialog.tsx" "bertel-tourism-ui/src/views/TeamAdminPage.tsx"
git -C "C:\Users\dphil\Bertel3.0" commit -m "feat(sp4): invite dialog with temp-password reveal + preset grants" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Permissions drawer (presets + toggles + org defaults)

**Files:** Create `src/features/team/MemberPermissionsDrawer.tsx`; Modify `src/views/TeamAdminPage.tsx`

- [ ] **Step 1: MemberPermissionsDrawer** (`src/features/team/MemberPermissionsDrawer.tsx`) — shadcn `Sheet` (side right). Props: `member: OrgMember | null`, `orgId`, `catalog: RefPermission[]`, `orgPermissions: string[]`, `onClose`, `onChanged`. Renders permission catalog grouped by `category`; each row a checkbox reflecting `member.permissionCodes.includes(code)` (or inherited from `orgPermissions` shown as a disabled "héritée de l'ORG" badge). Toggling calls `grantUserPermission`/`revokeUserPermission(member.userId, code)` then `onChanged()`. A header button "Appliquer le préréglage {businessRole}" grants `presetPermissionsFor(member.businessRoleCode)` (revoking the rest is out of scope — preset is additive; document that). On any error `toast.error(friendlyRbacError(e))`. (Org-defaults panel — grant/revoke `org_permission` — shown only when `canAdministerTeam` rank ≥ 30; reuse `grantOrgPermission`/`revokeOrgPermission`.)

- [ ] **Step 2: Wire into the page** — store `managing: OrgMember | null` state; `onManagePermissions={setManaging}`; render the drawer; `onChanged={reload}`.

- [ ] **Step 3: Verify** — `npm run typecheck` → clean; `npm run test:run` → green.

- [ ] **Step 4: Commit**
```bash
git -C "C:\Users\dphil\Bertel3.0" add "bertel-tourism-ui/src/features/team/MemberPermissionsDrawer.tsx" "bertel-tourism-ui/src/views/TeamAdminPage.tsx"
git -C "C:\Users\dphil\Bertel3.0" commit -m "feat(sp4): per-member permissions drawer (presets + toggles + org defaults)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Final verification, push, PR

- [ ] **Step 1: Full local verification** (from `bertel-tourism-ui/`):
Run: `npm run typecheck` → clean. Run: `npm run test:run` → all suites green (incl. the 4 new ones: permission-presets, rbac, session-selectors, admin/invite). Run: `npm run lint` if present → clean.

- [ ] **Step 2: Push**
```bash
git -C "C:\Users\dphil\Bertel3.0" push -u origin feat/sp4-team-admin
```

- [ ] **Step 3: Watch the SQL fresh-apply gate** (Task 1's migration + test):
```bash
gh run watch --repo D-OTIsud/Bertel $(gh run list --repo D-OTIsud/Bertel --workflow "SQL fresh-apply gate" --branch feat/sp4-team-admin --limit 1 --json databaseId --jq '.[0].databaseId') --exit-status
```
Expected: green, incl. "SP-4 rpc_list_org_members test passed." If red, read the failing step, fix the SQL, re-push.

- [ ] **Step 4: Open the PR** (base `master`):
```bash
gh pr create --repo D-OTIsud/Bertel --base master --head feat/sp4-team-admin \
  --title "SP-4: Team Administration (RBAC admin UI + invite)" \
  --body "Adds /team: invite (admin-create + temp password, server-only route w/ caller-authz) + manage business/admin roles + permissions (existing rank-gated RPCs). New SECURITY DEFINER rpc_list_org_members for the roster (member emails). Session hydrates admin rank/code. Spec: docs/superpowers/specs/2026-06-03-sp4-team-admin-design.md."
```

- [ ] **Step 5: STOP — gate live apply.** The `rpc_list_org_members` migration is the only PROD-affecting piece. Do NOT apply to live or merge until the user approves (mirror P0.3's gated deploy). Live apply via Supabase MCP `apply_migration` (name `sp4_list_org_members`), read-back verify, then merge + update §24/memory.

---

## Self-Review

**Spec coverage:** §4.1 invite route → Task 5; §4.2 session → Task 4; §4.3 service+page+components → Tasks 3,7,8,9,10; the corrected roster RPC → Task 1; §5 UX (table/invite/roles/permissions/anti-self) → Tasks 7-10; §6 security (caller-authz) → Task 5 + its test; §8 testing → per-task + Task 11. All covered.

**Placeholder scan:** the only intentional prose-step is the doc-list update (Task 1 Step 3, "mirror each file's format") and the InviteDialog JSX (Task 9, full logic given + an explicit single-call correction note). The component styling follows the verbatim shadcn patterns from the spec's source report. No "TBD"/"add error handling" left.

**Type consistency:** `OrgMember` (camelCase fields) defined in Task 3, used in Tasks 7-10; `RefRole`/`RefPermission` consistent; RPC param names (`p_membership_id`, `p_target_user_id`, `p_role_code`, `p_permission_code`, `p_org_object_id`) match the verified RPC signatures; `canAdministerTeam({role, adminRank})` signature consistent across selector/page/sidebar; store fields `adminRank`/`adminRoleCode` consistent Task 4 ↔ 6/7.
