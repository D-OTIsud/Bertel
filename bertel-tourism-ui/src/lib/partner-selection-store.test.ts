/** @jest-environment node */
jest.mock('server-only', () => ({}));
jest.mock('./supabase-server', () => ({ getServerSupabaseClient: jest.fn() }));
import { getServerSupabaseClient } from './supabase-server';
import { loadPartnerSelection } from './partner-selection-store';
const call = jest.fn();
const server = getServerSupabaseClient as jest.Mock;
const fixture = { id: '1006', name: 'Terroir', state: 'active', revision: 4,
  buckets: [{ types: ['PRD'], search: 'local' }], commune_insee: null };
beforeEach(() => { server.mockReturnValue({ schema: () => ({ rpc: call }) }); call.mockReset(); });
it('loads the persisted definition and its actual revision and nullable scope', async () => {
  call.mockResolvedValue({ data: fixture, error: null });
  await expect(loadPartnerSelection('1006')).resolves.toEqual({ id: '1006', name: 'Terroir', revision: 4,
    buckets: fixture.buckets, communeInsee: null });
  expect(call).toHaveBeenCalledWith('get_active_partner_selection_definition', { p_selection_id: '1006' });
});
it('does not fall back to the old beta definition when unknown or suspended', async () => {
  call.mockResolvedValue({ data: null, error: null });
  await expect(loadPartnerSelection('1006')).resolves.toBeUndefined();
});
it('fails closed on infrastructure failure instead of returning a beta definition', async () => {
  call.mockResolvedValue({ data: null, error: { code: 'XX000' } });
  await expect(loadPartnerSelection('1006')).rejects.toThrow('unavailable');
  server.mockReturnValue(null);
  await expect(loadPartnerSelection('1006')).rejects.toThrow('unavailable');
});
it.each([{ ...fixture, id: '1007' }, { ...fixture, state: 'suspended' }, { ...fixture, revision: 0 },
  { ...fixture, buckets: [{ types: [] }] }])('rejects malformed or mismatched persisted rows', async (data) => {
  call.mockResolvedValue({ data, error: null });
  await expect(loadPartnerSelection('1006')).rejects.toThrow('Invalid');
});
