jest.mock('../lib/supabase', () => ({ getApiClient: jest.fn(), getSupabaseClient: jest.fn() }));
jest.mock('../store/session-store', () => ({
  useSessionStore: { getState: jest.fn(() => ({ demoMode: false })) },
}));
jest.mock('../data/mock', () => ({
  mockObjectDetails: {},
  filterMockCards: jest.fn(),
  mockAuditQuestions: [],
  mockPublicationCards: [],
}));

import { getApiClient } from '../lib/supabase';
import { useSessionStore } from '../store/session-store';
import { mockObjectDetails } from '../data/mock';
import { getObjectItineraryGpx } from './rpc';

const mockGetApiClient = getApiClient as jest.Mock;
const mockGetState = useSessionStore.getState as jest.Mock;
const mockDetails = mockObjectDetails as Record<string, { raw: Record<string, unknown> }>;

describe('getObjectItineraryGpx (PLAN 4.5)', () => {
  const rpc = jest.fn();

  beforeEach(() => {
    rpc.mockReset();
    mockGetApiClient.mockReset();
    mockGetApiClient.mockReturnValue({ schema: () => ({ rpc }) });
    mockGetState.mockReturnValue({ demoMode: false });
    for (const key of Object.keys(mockDetails)) delete mockDetails[key];
  });

  it('appelle get_object_resource en gpx et renvoie la trace', async () => {
    rpc.mockResolvedValue({ data: { itinerary: { track: '<gpx>...</gpx>' } }, error: null });

    const track = await getObjectItineraryGpx('ITIRUN1', ['fr']);

    expect(track).toBe('<gpx>...</gpx>');
    expect(rpc).toHaveBeenCalledWith('get_object_resource', expect.objectContaining({
      p_object_id: 'ITIRUN1',
      p_lang_prefs: ['fr'],
      p_track_format: 'gpx',
      p_options: expect.objectContaining({
        fields: [],
        include_stages: true,
        render: false,
        include_private: true,
      }),
    }));
  });

  it('lève une erreur quand la trace est absente/vide', async () => {
    rpc.mockResolvedValue({ data: { itinerary: {} }, error: null });
    await expect(getObjectItineraryGpx('ITIRUN1', ['fr'])).rejects.toThrow(/indisponible/i);

    rpc.mockResolvedValue({ data: { itinerary: { track: '   ' } }, error: null });
    await expect(getObjectItineraryGpx('ITIRUN1', ['fr'])).rejects.toThrow(/indisponible/i);
  });

  it('propage une erreur RPC', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    await expect(getObjectItineraryGpx('ITIRUN1', ['fr'])).rejects.toBeTruthy();
  });

  it('mode démo : renvoie la trace mock si non vide', async () => {
    mockGetState.mockReturnValue({ demoMode: true });
    mockDetails['ITIRUN1'] = { raw: { itinerary: { track: 'MOCK_GPX' } } };
    await expect(getObjectItineraryGpx('ITIRUN1', ['fr'])).resolves.toBe('MOCK_GPX');
    expect(mockGetApiClient).not.toHaveBeenCalled();
  });

  it('mode démo : lève une erreur si aucune trace mock', async () => {
    mockGetState.mockReturnValue({ demoMode: true });
    await expect(getObjectItineraryGpx('ITIRUN1', ['fr'])).rejects.toThrow(/indisponible/i);
  });
});
