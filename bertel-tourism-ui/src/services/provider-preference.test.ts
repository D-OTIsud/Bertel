import { saveProviderPreference } from './provider-preference';
import { getApiClient } from '../lib/supabase';

jest.mock('../lib/env', () => ({ env: { demoMode: false } }));
jest.mock('../lib/supabase', () => ({ getApiClient: jest.fn() }));
const rpc = jest.fn();
beforeEach(() => {
  rpc.mockReset();
  jest.mocked(getApiClient).mockReturnValue({ schema: () => ({ rpc }) } as unknown as NonNullable<ReturnType<typeof getApiClient>>);
});

it.each([true, false])('vérifie la confirmation serveur, y compris false — %s', async enabled => {
  rpc.mockResolvedValue({ data: enabled, error: null });
  await saveProviderPreference(enabled);
  expect(rpc).toHaveBeenCalledWith('set_provider_only_preference', { p_enabled: enabled });
});

it('ne présente pas une réponse vide comme une préférence enregistrée', async () => {
  rpc.mockResolvedValue({ data: null, error: null });
  await expect(saveProviderPreference(true)).rejects.toThrow('pas été enregistrée');
});

it('propage les erreurs de mémorisation', async () => {
  rpc.mockResolvedValue({ data: null, error: new Error('offline') });
  await expect(saveProviderPreference(false)).rejects.toThrow('offline');
});
