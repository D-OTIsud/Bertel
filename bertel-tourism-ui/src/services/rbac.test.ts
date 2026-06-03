import { getApiClient } from '../lib/supabase';
import { listOrgMembers, setBusinessRole, friendlyRbacError } from './rbac';

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

  it('friendlyRbacError maps known SQLSTATE messages', () => {
    expect(friendlyRbacError({ message: 'SELF_ACTION_FORBIDDEN: ...' })).toMatch(/vous-même|propre/i);
    expect(friendlyRbacError({ message: 'INSUFFICIENT_RANK: ...' })).toMatch(/rang|autoris/i);
    expect(friendlyRbacError({ message: 'RANK_VIOLATION: ...' })).toMatch(/rang/i);
  });
});
