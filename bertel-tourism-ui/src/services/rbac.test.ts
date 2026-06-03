import { getApiClient } from '../lib/supabase';
import { listOrgMembers, setBusinessRole, upsertMembership, friendlyRbacError } from './rbac';

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

  it('friendlyRbacError maps known SQLSTATE messages', () => {
    expect(friendlyRbacError({ message: 'SELF_ACTION_FORBIDDEN: ...' })).toMatch(/vous-même|propre/i);
    expect(friendlyRbacError({ message: 'INSUFFICIENT_RANK: ...' })).toMatch(/rang|autoris/i);
    expect(friendlyRbacError({ message: 'RANK_VIOLATION: ...' })).toMatch(/rang/i);
  });
});
