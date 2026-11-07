/** @jest-environment node */
import { getApiClient, getSupabaseClient } from '../lib/supabase';
import { inviteUser, listOrgMembers, setBusinessRole, upsertMembership, friendlyRbacError } from './rbac';

jest.mock('../lib/supabase', () => ({ getApiClient: jest.fn(), getSupabaseClient: jest.fn() }));
const mockedGetApiClient = jest.mocked(getApiClient);

function clientWithRpc(rpc: jest.Mock) {
  return { schema: jest.fn().mockReturnValue({ rpc }) } as never;
}

describe('rbac service', () => {
  beforeEach(() => mockedGetApiClient.mockReset());

  it('listOrgMembers maps RPC rows to OrgMember objects', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: [{ membership_id: 'm1', user_id: 'u1', email: 'a@b.c', display_name: 'A', is_active: true,
               business_role_code: 'contributor', admin_role_code: null, permission_codes: ['create_object'],
               last_seen_at: '2026-07-29T11:11:09.98Z' }],
      error: null,
    });
    mockedGetApiClient.mockReturnValue(clientWithRpc(rpc));
    const members = await listOrgMembers('ORG1');
    expect(rpc).toHaveBeenCalledWith('rpc_list_org_members', { p_org_object_id: 'ORG1' });
    // 17d — la ligne ci-dessus ne porte PAS les clés de provenance : le mappeur doit se comporter
    // comme avant (backend antérieur à la migration) plutôt que casser l'écran.
    expect(members[0]).toEqual({
      membershipId: 'm1', userId: 'u1', email: 'a@b.c', displayName: 'A', isActive: true,
      businessRoleCode: 'contributor', adminRoleCode: null, permissionCodes: ['create_object'],
      lastSeenAt: '2026-07-29T11:11:09.98Z',
      rolePermissionCodes: [], isPlatformSuperuser: false,
    });
  });

  // Chantier 2026-08-28 n°1, sous-lot 1c — l'écran /team n'agrégeait que `user_permission` :
  // l'héritage d'ORG et le statut superuser étaient invisibles, alors que c'est de là que
  // vient l'accès réel des Éditeurs en production.
  it('listOrgMembers rend la PROVENANCE de l’accès quand le backend la porte (17d)', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: [{ membership_id: 'm1', user_id: 'u1', email: 'a@b.c', display_name: 'A', is_active: true,
               business_role_code: 'editor', admin_role_code: 'team_lead',
               permission_codes: ['create_object'], last_seen_at: null,
               role_permission_codes: ['write_crm_notes'], is_platform_superuser: true }],
      error: null,
    });
    mockedGetApiClient.mockReturnValue(clientWithRpc(rpc));
    const members = await listOrgMembers('ORG1');
    expect(members[0].rolePermissionCodes).toEqual(['write_crm_notes']);
    expect(members[0].isPlatformSuperuser).toBe(true);
    // L'héritage reste SÉPARÉ des droits individuels : la case à cocher ne pilote que ceux-ci.
    expect(members[0].permissionCodes).toEqual(['create_object']);
  });

  it('listOrgMembers ne prend pas une valeur malformée pour un tableau ni pour un booléen', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: [{ membership_id: 'm1', user_id: 'u1', is_active: true,
               role_permission_codes: 'pas-un-tableau', is_platform_superuser: 'oui' }],
      error: null,
    });
    mockedGetApiClient.mockReturnValue(clientWithRpc(rpc));
    const members = await listOrgMembers('ORG1');
    expect(members[0].rolePermissionCodes).toEqual([]);
    // Fail-closed : une valeur inattendue ne doit pas décorer quelqu'un en superuser.
    expect(members[0].isPlatformSuperuser).toBe(false);
  });

  it('setBusinessRole calls the RPC with mapped params', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: null });
    mockedGetApiClient.mockReturnValue(clientWithRpc(rpc));
    await setBusinessRole('m1', 'editor');
    expect(rpc).toHaveBeenCalledWith('rpc_set_business_role', { p_membership_id: 'm1', p_role_code: 'editor' });
  });

  it('upsertMembership calls rpc_upsert_membership and returns the uuid', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: 'mem-uuid', error: null });
    mockedGetApiClient.mockReturnValue(clientWithRpc(rpc));
    const result = await upsertMembership('user-1', 'org-1', 'contributor');
    expect(rpc).toHaveBeenCalledWith('rpc_upsert_membership', {
      p_target_user_id: 'user-1',
      p_org_object_id: 'org-1',
      p_business_role_code: 'contributor',
    });
    expect(result).toBe('mem-uuid');
  });

  it('upsertMembership throws when the RPC returns an error', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: { message: 'boom' } });
    mockedGetApiClient.mockReturnValue(clientWithRpc(rpc));
    await expect(upsertMembership('user-1', 'org-1', 'contributor')).rejects.toMatchObject({ message: 'boom' });
  });

  it('inviteUser sends the chosen role and uses the committed membership from a scoped 409', async () => {
    const input = { email: 'a@b.c', orgObjectId: 'ORG1', businessRoleCode: 'editor' };
    const auth = { getSession: jest.fn().mockResolvedValue({ data: { session: { access_token: 'synthetic' } } }) };
    jest.mocked(getSupabaseClient).mockReturnValue({ auth } as never);
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      userId: 'u1', membershipId: 'm1', alreadyExisted: true,
    }), { status: 409 }));
    try {
      await expect(inviteUser(input)).resolves.toEqual({ userId: 'u1', membershipId: 'm1', alreadyExisted: true, neverSignedIn: false });
      expect(fetchMock).toHaveBeenCalledWith('/api/admin/invite/v2', expect.objectContaining({
        headers: { 'content-type': 'application/json', authorization: 'Bearer synthetic' },
        body: JSON.stringify({ ...input, resend: false }),
      }));
    } finally {
      fetchMock.mockRestore();
      jest.mocked(getSupabaseClient).mockReset();
    }
  });

  it('preserves the scoped already-active outcome without treating it as a sent invite', async () => {
    const auth = { getSession: jest.fn().mockResolvedValue({ data: { session: { access_token: 'synthetic' } } }) };
    jest.mocked(getSupabaseClient).mockReturnValue({ auth } as never);
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'already_active' }), { status: 409 }),
    );
    try {
      await expect(inviteUser({
        email: 'a@b.c', orgObjectId: 'ORG1', businessRoleCode: 'editor', resend: true,
      })).rejects.toMatchObject({ code: 'already_active', message: 'Ce compte est déjà actif.' });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      fetchMock.mockRestore();
      jest.mocked(getSupabaseClient).mockReset();
    }
  });

  it('asks to reload if the server does not offer invite v2 and never falls back to the legacy POST', async () => {
    const input = { email: 'a@b.c', orgObjectId: 'ORG1', businessRoleCode: 'editor' };
    const auth = { getSession: jest.fn().mockResolvedValue({ data: { session: { access_token: 'synthetic' } } }) };
    jest.mocked(getSupabaseClient).mockReturnValue({ auth } as never);
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('<html>Not Found</html>', { status: 404 }));
    try {
      await expect(inviteUser(input)).rejects.toThrow('Requête invalide. Rechargez la page et réessayez.');
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith('/api/admin/invite/v2', expect.objectContaining({ method: 'POST' }));
    } finally {
      fetchMock.mockRestore();
      jest.mocked(getSupabaseClient).mockReset();
    }
  });

  it('friendlyRbacError maps known SQLSTATE messages', () => {
    expect(friendlyRbacError({ message: 'SELF_ACTION_FORBIDDEN: ...' })).toMatch(/vous-même|propre/i);
    expect(friendlyRbacError({ message: 'INSUFFICIENT_RANK: ...' })).toMatch(/rang|autoris/i);
    expect(friendlyRbacError({ message: 'RANK_VIOLATION: ...' })).toMatch(/rang/i);
  });
});
