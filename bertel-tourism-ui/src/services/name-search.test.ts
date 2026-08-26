jest.mock('../lib/supabase', () => ({ getApiClient: jest.fn(), getSupabaseClient: jest.fn() }));
jest.mock('../store/session-store', () => ({
  useSessionStore: { getState: jest.fn(() => ({ demoMode: false })) },
}));

import { getApiClient } from '../lib/supabase';
import { useSessionStore } from '../store/session-store';
import { NAME_MATCH_MIN_CHARS, searchObjectsByName } from './name-search';

const mockGetApiClient = getApiClient as jest.Mock;
const mockGetState = useSessionStore.getState as jest.Mock;

describe('searchObjectsByName (recherche par nom — navigation)', () => {
  const rpc = jest.fn();

  beforeEach(() => {
    rpc.mockReset();
    mockGetState.mockReset();
    mockGetState.mockReturnValue({ demoMode: false });
    mockGetApiClient.mockReset();
    mockGetApiClient.mockReturnValue({ schema: () => ({ rpc }) });
  });

  it('appelle search_objects_by_name avec le terme trime et mappe la reponse vers NameMatch', async () => {
    rpc.mockResolvedValue({
      data: [
        {
          id: 'RESRUN1',
          name: 'Le Longanis',
          object_type: 'RES',
          status: 'published',
          city: 'Saint-Pierre',
          image_url: 'https://cdn/x.jpg',
        },
      ],
      error: null,
    });

    const matches = await searchObjectsByName('  longanis  ');

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('search_objects_by_name', { p_term: 'longanis', p_limit: 8 });
    expect(matches).toEqual([
      {
        id: 'RESRUN1',
        name: 'Le Longanis',
        type: 'RES',
        status: 'published',
        city: 'Saint-Pierre',
        imageUrl: 'https://cdn/x.jpg',
      },
    ]);
  });

  it('rend city et imageUrl a null quand le serveur ne les porte pas', async () => {
    rpc.mockResolvedValue({
      data: [{ id: 'PNARUN9', name: 'Cap Jaune', object_type: 'PNA', status: 'draft' }],
      error: null,
    });

    await expect(searchObjectsByName('cap')).resolves.toEqual([
      { id: 'PNARUN9', name: 'Cap Jaune', type: 'PNA', status: 'draft', city: null, imageUrl: null },
    ]);
  });

  it('rend [] SANS aucun appel reseau sous le minimum de caracteres (apres trim)', async () => {
    expect(NAME_MATCH_MIN_CHARS).toBe(2);

    await expect(searchObjectsByName('')).resolves.toEqual([]);
    await expect(searchObjectsByName('a')).resolves.toEqual([]);
    await expect(searchObjectsByName('  b  ')).resolves.toEqual([]);

    expect(rpc).not.toHaveBeenCalled();
  });

  it('rend [] sans appel en mode demo (aucun corpus a interroger)', async () => {
    mockGetState.mockReturnValue({ demoMode: true });

    await expect(searchObjectsByName('longanis')).resolves.toEqual([]);

    expect(rpc).not.toHaveBeenCalled();
  });

  it('ne plante pas quand data n est pas un tableau', async () => {
    rpc.mockResolvedValue({ data: { unexpected: true }, error: null });

    await expect(searchObjectsByName('longanis')).resolves.toEqual([]);
  });

  it('ignore une ligne sans id plutot que de planter', async () => {
    rpc.mockResolvedValue({
      data: [
        { name: 'Sans identifiant', object_type: 'RES', status: 'published' },
        null,
        { id: 'RESRUN2', name: 'Valide', object_type: 'RES', status: 'published', city: null, image_url: null },
      ],
      error: null,
    });

    const matches = await searchObjectsByName('valide');

    expect(matches.map((m) => m.id)).toEqual(['RESRUN2']);
  });

  it('propage une erreur PostgREST (le hook la traitera)', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });

    await expect(searchObjectsByName('longanis')).rejects.toBeDefined();
  });

  it('branche le AbortSignal sur le builder PostgREST quand il en accepte un', async () => {
    const controller = new AbortController();
    const abortSignal = jest.fn(() => Promise.resolve({ data: [], error: null }));
    rpc.mockReturnValue({ abortSignal, then: () => undefined });

    await searchObjectsByName('longanis', controller.signal);

    expect(abortSignal).toHaveBeenCalledWith(controller.signal);
  });
});
