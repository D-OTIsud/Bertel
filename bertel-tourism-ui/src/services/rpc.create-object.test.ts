jest.mock('../lib/supabase', () => ({ getApiClient: jest.fn(), getSupabaseClient: jest.fn() }));
jest.mock('../store/session-store', () => ({
  useSessionStore: {
    getState: jest.fn(() => ({ demoMode: false })),
    subscribe: jest.fn(() => () => {}),
  },
}));

import { getApiClient } from '../lib/supabase';
import { useSessionStore } from '../store/session-store';
import { createObject, DEFAULT_REGION_CODE } from './rpc';

const mockGetApiClient = getApiClient as jest.Mock;
const mockGetState = useSessionStore.getState as jest.Mock;

describe('createObject', () => {
  const rpc = jest.fn();

  beforeEach(() => {
    rpc.mockReset();
    mockGetState.mockReturnValue({ demoMode: false });
    mockGetApiClient.mockReset();
    mockGetApiClient.mockReturnValue({ schema: () => ({ rpc }) });
  });

  it('returns the new object id and always passes region RUN', async () => {
    rpc.mockResolvedValue({ data: 'HOTRUN0000000001', error: null });
    await expect(createObject({ type: 'HOT', name: 'Hôtel des Cimes', city: 'Entre-Deux', postcode: ' 97414 ' })).resolves.toBe('HOTRUN0000000001');
    expect(rpc).toHaveBeenCalledWith('rpc_create_object', {
      p_object_type: 'HOT',
      p_name: 'Hôtel des Cimes',
      p_region_code: DEFAULT_REGION_CODE,
      p_city: 'Entre-Deux',
      p_postcode: '97414',
    });
    expect(DEFAULT_REGION_CODE).toBe('RUN');
  });

  it('maps a FORBIDDEN backend error to a friendly French message', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'FORBIDDEN: création refusée' } });
    await expect(createObject({ type: 'HOT', name: 'X', city: 'Entre-Deux', postcode: '97414' })).rejects.toThrow(/permission de créer/i);
  });

  it('throws when the backend returns no id', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await expect(createObject({ type: 'HOT', name: 'X', city: 'Entre-Deux', postcode: '97414' })).rejects.toThrow(/aucun identifiant/i);
  });

  it('demo mode returns a synthetic id without hitting the backend', async () => {
    mockGetState.mockReturnValue({ demoMode: true });
    await expect(createObject({ type: 'HOT', name: 'X', city: 'Entre-Deux', postcode: '97414' })).resolves.toMatch(/^DEMO/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('submits creation and main location through one RPC without a client-computed INSEE code', async () => {
    rpc.mockResolvedValue({ data: 'HOTRUN0000000001', error: null });
    await createObject({ type: 'HOT', name: 'Un seul enregistrement', city: 'Entre-Deux', postcode: '97414' });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][1]).not.toHaveProperty('p_code_insee');
  });

  it('explains a server-side commune/postcode conflict', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'INSEE_COMMUNE_CONFLICT' } });
    await expect(createObject({ type: 'HOT', name: 'X', city: 'Entre-Deux', postcode: '97480' }))
      .rejects.toThrow(/code postal.*commune/i);
  });

  it('distinguishes a missing location from a missing name in backend messages', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'MISSING_REQUIRED_FIELD: la commune et le code postal sont obligatoires dès la création' } });
    await expect(createObject({ type: 'HOT', name: 'X', city: '', postcode: '' }))
      .rejects.toThrow(/code postal.*commune/i);
  });
});
