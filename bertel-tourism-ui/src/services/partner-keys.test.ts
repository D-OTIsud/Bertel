import { listPartnerKeys, issuePartnerKey, revokePartnerKey } from './partner-keys';

const rpc = jest.fn();
jest.mock('../lib/supabase', () => ({
  getSupabaseClient: () => ({ schema: () => ({ rpc }) }),
}));

beforeEach(() => {
  rpc.mockReset();
});

describe('partner-keys service', () => {
  it('lists keys, maps snake_case → camelCase, and never exposes a hash', async () => {
    rpc.mockResolvedValue({
      data: [
        {
          id: 'k1', label: 'Portail régional', key_prefix: 'bk_live_ab12cd34', scopes: ['read'],
          is_active: true, expires_at: null, revoked_at: null, last_used_at: '2026-07-01T10:00:00Z',
          created_at: '2026-07-01T09:00:00Z',
        },
      ],
      error: null,
    });

    const list = await listPartnerKeys();
    expect(rpc).toHaveBeenCalledWith('list_partner_keys');
    expect(list[0]).toEqual({
      id: 'k1', label: 'Portail régional', keyPrefix: 'bk_live_ab12cd34', scopes: ['read'],
      isActive: true, expiresAt: null, revokedAt: null, lastUsedAt: '2026-07-01T10:00:00Z',
      createdAt: '2026-07-01T09:00:00Z',
    });
    expect(JSON.stringify(list[0])).not.toMatch(/hash|api_?key|bk_live_[0-9a-f]{48}/i);
  });

  it('issues a key with the RPC param names and returns the raw key once', async () => {
    rpc.mockResolvedValue({
      data: { id: 'k2', api_key: 'bk_live_' + 'a'.repeat(48), key_prefix: 'bk_live_aaaaaaaa', label: 'X', scopes: [] },
      error: null,
    });
    const issued = await issuePartnerKey('X');
    expect(rpc).toHaveBeenCalledWith('rpc_issue_partner_key', { p_label: 'X', p_scopes: [], p_expires_at: null });
    expect(issued).toEqual({ id: 'k2', apiKey: 'bk_live_' + 'a'.repeat(48), keyPrefix: 'bk_live_aaaaaaaa', label: 'X' });
  });

  it('revokes by id and returns the revoked flag', async () => {
    rpc.mockResolvedValue({ data: { revoked: true }, error: null });
    await expect(revokePartnerKey('k3')).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith('rpc_revoke_partner_key', { p_id: 'k3' });
  });

  it('throws the RPC error message (e.g. FORBIDDEN for a non-superuser)', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'FORBIDDEN' } });
    await expect(listPartnerKeys()).rejects.toThrow('FORBIDDEN');
  });
});
