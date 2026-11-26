jest.mock('../lib/supabase', () => ({ getApiClient: jest.fn() }));
jest.mock('./notification-delivery', () => ({ pingNotifyDrain: jest.fn() }));
jest.mock('../store/session-store', () => ({ useSessionStore: { getState: () => ({ demoMode: false }) } }));

import { getApiClient } from '../lib/supabase';
import { setObjectStatus } from './object-workspace';

const rpc = jest.fn();
beforeEach(() => {
  rpc.mockReset().mockResolvedValue({ data: 'archived', error: null });
  jest.mocked(getApiClient).mockReturnValue({ schema: () => ({ rpc }) } as unknown as ReturnType<typeof getApiClient>);
});

it.each(['archived', 'hidden'] as const)('sends the %s reason to the lifecycle RPC, preserving line breaks', async (status) => {
  rpc.mockResolvedValue({ data: status, error: null });
  await expect(setObjectStatus('o1', status, ' En pause.\nRecontacter en janvier. ')).resolves.toBe(status);
  expect(rpc).toHaveBeenCalledWith('rpc_set_object_status', {
    p_object_id: 'o1', p_status: status, p_reason: 'En pause.\nRecontacter en janvier.',
  });
});

it.each(['archived', 'hidden'] as const)('rejects blank reasons before making a %s request', async (status) => {
  await expect(setObjectStatus('o1', status, ' \n\t ')).rejects.toThrow('Un motif est obligatoire');
  expect(rpc).not.toHaveBeenCalled();
});

it('preserves the legacy two-argument call for restoring to hidden', async () => {
  rpc.mockResolvedValue({ data: 'hidden', error: null });
  await expect(setObjectStatus('o1', 'hidden')).resolves.toBe('hidden');
  expect(rpc).toHaveBeenCalledWith('rpc_set_object_status', { p_object_id: 'o1', p_status: 'hidden' });
});

it('translates a server-side missing-reason rejection', async () => {
  rpc.mockResolvedValue({ data: null, error: { message: 'REASON_REQUIRED: a reason is required' } });
  await expect(setObjectStatus('o1', 'hidden')).rejects.toThrow('Un motif est obligatoire pour archiver ou dépublier une fiche.');
});
