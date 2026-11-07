/** @jest-environment node */
jest.mock('server-only', () => ({}));
import { POST as legacyPOST } from './route';
import { POST } from './v2/route';

jest.mock('@/lib/supabase-server', () => ({ getServerSupabaseClient: jest.fn() }));
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));
import { getServerSupabaseClient } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import { readApiErrorMessage } from '@/services/api-error';

const mockedServer = jest.mocked(getServerSupabaseClient);
const mockedCreate = jest.mocked(createClient);
const target = { email: 'x@y.z', orgObjectId: 'ORG1', businessRoleCode: 'editor' };
const candidate = { id: 'target', email: target.email, last_sign_in_at: null };
const headers = { authorization: 'Bearer t' };
type SyntheticUser = { id: string; email: string; last_sign_in_at?: string | null; email_confirmed_at?: string; is_sso_user?: boolean };
type DirectoryPage = { users: SyntheticUser[]; nextPage: number | null; total: number };

function directoryUsers(page: number): SyntheticUser[] {
  return Array.from({ length: 1000 }, (_, index) => ({
    id: `directory-${page}-${index}`, email: `directory-${page}-${index}@example.test`,
  }));
}

function req(body: unknown, requestHeaders: Record<string, string> = headers): never {
  return { headers: new Headers(requestHeaders), json: async () => body } as never;
}

function fixture(options: {
  platform?: boolean;
  rank?: number;
  callerOrg?: string;
  callerOrgRanks?: Record<string, number | null>;
  users?: SyntheticUser[];
  pages?: DirectoryPage[];
  orgExists?: boolean;
  roleExists?: boolean;
  activeOrgs?: string[];
  membershipInOrg?: boolean;
  nextPage?: number;
  attachError?: boolean;
  attachUnknown?: boolean;
  providerError?: boolean;
  returnedUserId?: string;
  profileRole?: string | null;
  profileError?: boolean;
} = {}) {
  const users = options.users ?? [];
  const pages = options.pages ?? [{ users, nextPage: options.nextPage ?? null, total: users.length }];
  const listUsers = jest.fn(async ({ page }: { page: number }) => ({ data: pages[page - 1], error: null }));
  const inviteUserByEmail = jest.fn().mockResolvedValue(options.providerError
    ? { data: { user: null }, error: { message: 'synthetic GoTrue error INVITE_SENTINEL' } }
    : { data: { user: { id: options.returnedUserId ?? 'new-user' } }, error: null });
  const deleteUser = jest.fn().mockResolvedValue({ error: null });
  const rpc = jest.fn(async (name: string) => {
    if (name === 'is_platform_superuser') return { data: options.platform === true, error: null };
    if (name === 'current_user_admin_rank') return { data: options.rank ?? 30, error: null };
    if (name === 'current_user_org_id') return { data: options.callerOrg ?? 'ORG1', error: null };
    if (name === 'rpc_upsert_membership') {
      if (options.attachError) return { data: null, error: { message: 'synthetic private membership failure' } };
      return { data: options.attachUnknown ? null : 'membership-1', error: null };
    }
    throw new Error(`Unexpected RPC ${name}`);
  });
  function single(data: object | null, error: object | null = null) {
    const eq = jest.fn();
    const chain = { eq, maybeSingle: jest.fn().mockResolvedValue({ data, error }) };
    eq.mockReturnValue(chain);
    return { select: jest.fn(() => chain), eq };
  }
  const membership = single(options.membershipInOrg ? { id: 'membership-1' } : null);
  const callerRanks = options.callerOrgRanks ?? { [options.callerOrg ?? 'ORG1']: options.rank ?? 30 };
  const callerFilters = new Map<string, unknown>();
  const callerMembership = {
    eq(column: string, value: unknown) {
      callerFilters.set(column, value);
      return callerMembership;
    },
    async maybeSingle() {
      const orgId = callerFilters.get('org_object_id');
      const visible = callerFilters.get('user_id') === 'admin' && callerFilters.get('is_active') === true
        && typeof orgId === 'string' && Object.hasOwn(callerRanks, orgId);
      const rank = typeof orgId === 'string' ? callerRanks[orgId] : null;
      return {
        data: visible ? {
          user_org_admin_role: rank == null ? [] : [{ is_active: true, ref_org_admin_role: { rank } }],
        } : null,
        error: null,
      };
    },
  };
  const businessRole = single(options.roleExists === false ? null : { code: 'editor' });
  const callerFrom = jest.fn((table: string) => {
    if (table === 'user_org_membership') return {
      select: (columns: string) => columns === 'id' ? membership.select() : callerMembership,
    };
    if (table === 'ref_org_business_role') return businessRole;
    throw new Error(`Unexpected caller table ${table}`);
  });
  const is = jest.fn().mockResolvedValue({ error: null });
  const update = jest.fn(() => ({ eq: jest.fn(() => ({ is })) }));
  const serverFrom = jest.fn((table: string) => {
    if (table === 'object') return single(options.orgExists === false ? null : { id: 'ORG1' });
    if (table === 'user_org_membership') {
      return { select: () => ({ eq: () => ({
        eq: () => Promise.resolve({ data: (options.activeOrgs ?? []).map((org_object_id) => ({ org_object_id })), error: null }),
      }) }) };
    }
    if (table === 'app_user_profile') return {
      update,
      ...single({ role: options.profileRole ?? null }, options.profileError ? { message: 'synthetic profile failure' } : null),
    };
    throw new Error(`Unexpected service table ${table}`);
  });
  mockedServer.mockReturnValue({
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'admin' } }, error: null }),
      admin: { listUsers, inviteUserByEmail, deleteUser },
    },
    from: serverFrom,
  } as never);
  mockedCreate.mockReturnValue({ schema: () => ({ rpc }), from: callerFrom } as never);
  return { rpc, listUsers, inviteUserByEmail, deleteUser, membership, businessRole, update, is };
}

describe('POST /api/admin/invite (legacy)', () => {
  it('asks old clients to reload before any authentication or invite work', async () => {
    mockedServer.mockClear();
    mockedCreate.mockClear();
    const res = legacyPOST();
    expect(res.status).toBe(426);
    const payload = await res.json();
    expect(payload).toEqual({ error: 'bad_request' });
    expect(readApiErrorMessage(payload, res.status)).toBe('Requête invalide. Rechargez la page et réessayez.');
    expect(mockedServer).not.toHaveBeenCalled();
    expect(mockedCreate).not.toHaveBeenCalled();
  });
});

describe('POST /api/admin/invite/v2', () => {
  beforeEach(() => {
    mockedServer.mockReset();
    mockedCreate.mockReset();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';
    process.env.NEXT_PUBLIC_APP_URL = 'https://bertel.otisud.re';
  });

  it('401 without a bearer token', async () => {
    const { listUsers } = fixture();
    expect((await POST(req(target, {}))).status).toBe(401);
    expect(listUsers).not.toHaveBeenCalled();
  });

  it('403 before lookup when caller rank is below 30', async () => {
    const { listUsers, inviteUserByEmail } = fixture({ rank: 20 });
    expect((await POST(req(target))).status).toBe(403);
    expect(listUsers).not.toHaveBeenCalled();
    expect(inviteUserByEmail).not.toHaveBeenCalled();
  });

  it.each([null, 20])('403 before lookup when rank 30 is held only in another organisation (local rank %s)', async (localRank) => {
    const { listUsers, inviteUserByEmail, rpc } = fixture({
      rank: 30, callerOrg: 'ORG1', callerOrgRanks: { ORG1: localRank, ORG2: 30 },
      users: [candidate], membershipInOrg: true, returnedUserId: 'target',
    });
    for (const resend of [false, true]) {
      const response = await POST(req({ ...target, resend }));
      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({ error: 'out_of_scope' });
    }
    expect(listUsers).not.toHaveBeenCalled();
    expect(inviteUserByEmail).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalledWith('rpc_upsert_membership', expect.anything());
  });

  it.each([
    [{ callerOrg: 'ORG2' }, 'editor', 403],
    [{ orgExists: false }, 'editor', 422],
    [{ roleExists: false }, 'owner', 422],
  ] as const)('validates target scope and role before a directory lookup (%j)', async (options, roleCode, status) => {
    const { listUsers, inviteUserByEmail, rpc, update, businessRole } = fixture(options);
    expect((await POST(req({ ...target, businessRoleCode: roleCode }))).status).toBe(status);
    if (roleCode === 'owner') expect(businessRole.eq).toHaveBeenCalledWith('code', 'owner');
    expect(listUsers).not.toHaveBeenCalled();
    expect(inviteUserByEmail).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalledWith('rpc_upsert_membership', expect.anything());
    expect(update).not.toHaveBeenCalled();
  });

  it.each([false, true])('invites and attaches a new account with a canonical redirect (platform=%s)', async (platform) => {
    const { listUsers, inviteUserByEmail, rpc, update, is } = fixture({ platform, callerOrg: platform ? 'ORG2' : 'ORG1', rank: platform ? 0 : 30 });
    const res = await POST(req(target, { ...headers, origin: 'https://outside.example', host: 'outside.example', forwarded: 'host=outside.example;proto=https' }));
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({ userId: 'new-user', membershipId: 'membership-1', alreadyExisted: false });
    expect(listUsers).toHaveBeenCalledWith({ page: 1, perPage: 1000 });
    expect(inviteUserByEmail).toHaveBeenCalledWith('x@y.z', { redirectTo: 'https://bertel.otisud.re/set-password' });
    expect(rpc).toHaveBeenCalledWith('rpc_upsert_membership', {
      p_target_user_id: 'new-user', p_org_object_id: 'ORG1', p_business_role_code: 'editor',
    });
    expect(update).toHaveBeenCalledWith({ role: 'tourism_agent' });
    expect(is).toHaveBeenCalledWith('role', null);
  });

  it('503 when the app origin is missing, before any account lookup or invitation', async () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    const { listUsers, inviteUserByEmail } = fixture();
    const res = await POST(req({ ...target, resend: true }));
    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({ error: 'app_origin_unavailable' });
    expect(listUsers).not.toHaveBeenCalled();
    expect(inviteUserByEmail).not.toHaveBeenCalled();
  });

  it.each([
    {},
    { last_sign_in_at: '2026-07-01T00:00:00Z', email_confirmed_at: '2026-06-30T00:00:00Z' },
  ])('same refusal for an unconfirmed or confirmed foreign account (%j)', async (state) => {
    const { inviteUserByEmail, deleteUser, rpc, update } = fixture({
      users: [{ ...candidate, ...state }], activeOrgs: ['ORG2'],
    });
    for (const resend of [false, true]) {
      const res = await POST(req({ ...target, resend }));
      expect(res.status).toBe(403);
      await expect(res.json()).resolves.toEqual({ error: 'out_of_scope' });
    }
    expect(rpc).not.toHaveBeenCalledWith('rpc_upsert_membership', expect.anything());
    expect(inviteUserByEmail).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('resend returns the same refusal for a missing or inactive membership', async () => {
    for (const users of [[], [candidate]]) {
      const { inviteUserByEmail } = fixture({ users });
      const res = await POST(req({ ...target, resend: true }));
      expect(res.status).toBe(403);
      await expect(res.json()).resolves.toEqual({ error: 'out_of_scope' });
      expect(inviteUserByEmail).not.toHaveBeenCalled();
    }
  });

  it.each([false, true])('attaches an eligible confirmed account without exposing prior activity (platform=%s)', async (platform) => {
    const { rpc, inviteUserByEmail, update } = fixture({
      users: [{ ...candidate, email_confirmed_at: '2026-07-01T00:00:00Z' }],
      platform, activeOrgs: platform ? ['ORG2'] : [], profileRole: platform ? 'owner' : 'tourism_agent',
    });
    const res = await POST(req(target));
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ userId: 'target', membershipId: 'membership-1', alreadyExisted: true });
    expect(rpc).toHaveBeenCalledWith('rpc_upsert_membership', {
      p_target_user_id: 'target', p_org_object_id: 'ORG1', p_business_role_code: 'editor',
    });
    expect(inviteUserByEmail).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it.each([
    { profileRole: 'owner' },
    { profileRole: 'super_admin' },
    { profileError: true },
  ])('does not attach an unscoped privileged or unverified target for a local admin (%j)', async (options) => {
    const { rpc, inviteUserByEmail, update, deleteUser } = fixture({ users: [candidate], ...options });
    const res = await POST(req(target));
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: 'out_of_scope' });
    expect(rpc).not.toHaveBeenCalledWith('rpc_upsert_membership', expect.anything());
    expect(inviteUserByEmail).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('does not offer resend for a confirmed scoped account that has never signed in', async () => {
    fixture({ users: [{ ...candidate, email_confirmed_at: '2026-07-01T00:00:00Z' }], activeOrgs: ['ORG1'] });
    const res = await POST(req(target));
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ userId: 'target', membershipId: 'membership-1', alreadyExisted: true });
  });

  it.each([{ attachError: true }, { attachUnknown: true }])('no disclosure or email without an acknowledged attachment (%j)', async (outcome) => {
    const { inviteUserByEmail, rpc, deleteUser, update } = fixture({ users: [candidate], platform: true, ...outcome });
    const res = await POST(req(target));
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: 'out_of_scope' });
    expect(rpc).toHaveBeenCalledWith('rpc_upsert_membership', {
      p_target_user_id: 'target', p_org_object_id: 'ORG1', p_business_role_code: 'editor',
    });
    expect(inviteUserByEmail).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('invites an existing unconfirmed account only after attachment, preserving its UUID', async () => {
    const { rpc, inviteUserByEmail, deleteUser, update } = fixture({ users: [candidate], returnedUserId: 'target' });
    const res = await POST(req(target));
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({ userId: 'target', membershipId: 'membership-1', alreadyExisted: false });
    expect(rpc).toHaveBeenLastCalledWith('rpc_upsert_membership', {
      p_target_user_id: 'target', p_org_object_id: 'ORG1', p_business_role_code: 'editor',
    });
    expect(inviteUserByEmail).toHaveBeenCalledTimes(1);
    expect(inviteUserByEmail.mock.invocationCallOrder[0]).toBeGreaterThan(rpc.mock.invocationCallOrder.at(-1)!);
    expect(deleteUser).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('reports delivery failure after attachment without retrying or undoing the membership', async () => {
    const { rpc, inviteUserByEmail, deleteUser, update } = fixture({ users: [candidate], providerError: true });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const res = await POST(req(target));
      expect(res.status).toBe(500);
      await expect(res.json()).resolves.toEqual({ error: 'resend_failed' });
      expect(inviteUserByEmail).toHaveBeenCalledTimes(1);
      expect(rpc.mock.calls.filter(([name]) => name === 'rpc_upsert_membership')).toHaveLength(1);
      expect(inviteUserByEmail.mock.invocationCallOrder[0]).toBeGreaterThan(rpc.mock.invocationCallOrder.at(-1)!);
      expect(deleteUser).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('does not disclose or update the profile of a foreign user returned after the directory lookup', async () => {
    const { inviteUserByEmail, rpc, update } = fixture({ activeOrgs: ['ORG2'], returnedUserId: 'foreign' });
    const res = await POST(req(target));
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: 'out_of_scope' });
    expect(inviteUserByEmail).toHaveBeenCalledTimes(1);
    expect(rpc).not.toHaveBeenCalledWith('rpc_upsert_membership', expect.anything());
    expect(update).not.toHaveBeenCalled();
  });

  it('resends on the same scoped, unconfirmed account without changing the account or membership', async () => {
    const { deleteUser, inviteUserByEmail, membership, rpc, update } = fixture({
      users: [candidate], membershipInOrg: true, returnedUserId: 'target',
    });
    const res = await POST(req({ ...target, resend: true }));
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({ userId: 'target', membershipId: 'membership-1', alreadyExisted: false });
    expect(membership.eq.mock.calls).toEqual([['user_id', 'target'], ['org_object_id', 'ORG1'], ['is_active', true]]);
    expect(inviteUserByEmail).toHaveBeenCalledTimes(1);
    expect(deleteUser).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalledWith('rpc_upsert_membership', expect.anything());
  });

  it.each([
    { last_sign_in_at: '2026-07-01T00:00:00Z' },
    { email_confirmed_at: '2026-07-01T00:00:00Z' },
  ])('409 for a scoped signed-in or confirmed account, without email or deletion (%j)', async (state) => {
    const { inviteUserByEmail, deleteUser } = fixture({ users: [{ ...candidate, ...state }], membershipInOrg: true });
    const res = await POST(req({ ...target, resend: true }));
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ error: 'already_active' });
    expect(inviteUserByEmail).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('does not treat an incomplete directory page as absence', async () => {
    const { inviteUserByEmail } = fixture({ nextPage: 2 });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect((await POST(req(target))).status).toBe(500);
      expect(inviteUserByEmail).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('invites a new address only after a complete large lookup, even when nextPage is truncated', async () => {
    const total = 9_001;
    const pages = Array.from({ length: 9 }, (_, index) => ({
      users: directoryUsers(index + 1), total, nextPage: index === 8 ? 1 : index + 2,
    }));
    const { listUsers, inviteUserByEmail } = fixture({
      pages: [...pages, { users: directoryUsers(10).slice(0, 1), total, nextPage: null }],
    });
    const res = await POST(req(target));
    expect(res.status).toBe(201);
    expect(listUsers.mock.calls).toEqual(Array.from({ length: 10 }, (_, index) => [{ page: index + 1, perPage: 1000 }]));
    expect(inviteUserByEmail).toHaveBeenCalledTimes(1);
    expect(inviteUserByEmail.mock.invocationCallOrder[0]).toBeGreaterThan(listUsers.mock.invocationCallOrder.at(-1)!);
  });

  it('attaches the exact known address on page 2 instead of inviting a new account', async () => {
    const { listUsers, inviteUserByEmail, rpc } = fixture({
      pages: [
        { users: directoryUsers(1), total: 1001, nextPage: 2 },
        { users: [{ ...candidate, email: 'X@Y.Z', email_confirmed_at: '2026-07-01T00:00:00Z' }], total: 1001, nextPage: null },
      ],
    });
    const res = await POST(req(target));
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ userId: 'target', membershipId: 'membership-1', alreadyExisted: true });
    expect(listUsers).toHaveBeenLastCalledWith({ page: 2, perPage: 1000 });
    expect(rpc).toHaveBeenCalledWith('rpc_upsert_membership', {
      p_target_user_id: 'target', p_org_object_id: 'ORG1', p_business_role_code: 'editor',
    });
    expect(inviteUserByEmail).not.toHaveBeenCalled();
  });

  it.each([
    { user: { id: 'directory-1-0', email: 'other@example.test' }, total: 1001 },
    { user: { id: 'directory-2-0', email: 'other@example.test' }, total: 1000 },
  ])('refuses an inconsistent directory before any invitation or attachment (%j)', async ({ user, total }) => {
    const { inviteUserByEmail, rpc } = fixture({
      pages: [
        { users: directoryUsers(1), total: 1001, nextPage: 2 },
        { users: [user], total, nextPage: null },
      ],
    });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const res = await POST(req(target));
      expect(res.status).toBe(500);
      await expect(res.json()).resolves.toEqual({ error: 'create_failed' });
      expect(inviteUserByEmail).not.toHaveBeenCalled();
      expect(rpc).not.toHaveBeenCalledWith('rpc_upsert_membership', expect.anything());
    } finally {
      warn.mockRestore();
    }
  });

  it('refuses ambiguous email across pages, including an SSO account', async () => {
    const { inviteUserByEmail, rpc } = fixture({
      pages: [
        { users: [candidate, ...directoryUsers(1).slice(1)], total: 1001, nextPage: 2 },
        { users: [{ ...candidate, id: 'sso-target', is_sso_user: true }], total: 1001, nextPage: null },
      ],
    });
    const res = await POST(req(target));
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: 'out_of_scope' });
    expect(inviteUserByEmail).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalledWith('rpc_upsert_membership', expect.anything());
  });

  it('500 keeps the invitation fallback without exposing a GoTrue error or logging the email', async () => {
    fixture({ providerError: true });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const res = await POST(req(target));
      const payload = await res.json();
      expect(res.status).toBe(500);
      expect(payload).toEqual({ error: 'create_failed' });
      expect(readApiErrorMessage(payload, res.status)).toBe('La création a échoué.');
      const requestId = res.headers.get('x-request-id');
      expect(requestId).toMatch(/^[a-f0-9-]{36}$/);
      expect(warn.mock.calls).toEqual([['[route-error]', { route: 'admin/invite.POST', code: 'create_failed', requestId }]]);
    } finally {
      warn.mockRestore();
    }
  });
});
