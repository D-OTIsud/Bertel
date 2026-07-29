import { QueryClient } from '@tanstack/react-query';
import { loadObjectWorkspace } from './useExplorerQueries';
import { useSessionStore } from '../store/session-store';

const mockGetObjectResource = jest.fn();
const mockGetWorkspaceResource = jest.fn();
const mockFetchCatalogs = jest.fn();

jest.mock('../services/rpc', () => ({
  ...jest.requireActual('../services/rpc'),
  getObjectResource: (...args: unknown[]) => mockGetObjectResource(...args),
}));

jest.mock('../services/object-workspace', () => ({
  ...jest.requireActual('../services/object-workspace'),
  getObjectWorkspaceResource: (...args: unknown[]) => mockGetWorkspaceResource(...args),
}));

jest.mock('../services/reference-catalogs', () => ({
  fetchReferenceCatalogs: () => mockFetchCatalogs(),
}));

const DETAIL = { id: 'o1', name: 'Chez Testeur', type: 'RES', raw: {} };

describe('loadObjectWorkspace', () => {
  const langPrefs = useSessionStore.getState().langPrefs;

  beforeEach(() => {
    mockGetObjectResource.mockReset().mockResolvedValue(DETAIL);
    mockGetWorkspaceResource.mockReset().mockResolvedValue({ id: 'o1', name: 'x', type: 'RES', detail: DETAIL, modules: {}, permissions: {} });
    mockFetchCatalogs.mockReset().mockResolvedValue({ refCodeByDomain: {}, tables: {} });
  });

  function makeClient() {
    return new QueryClient({ defaultOptions: { queries: { retry: false } } });
  }

  test('reutilise la fiche deja en cache : aucun second appel au gros RPC', async () => {
    const client = makeClient();
    // Le tiroir vient de la charger sous CETTE cle exacte.
    client.setQueryData(['object-detail', 'o1', langPrefs], DETAIL);

    await loadObjectWorkspace(client, 'o1', langPrefs);

    expect(mockGetObjectResource).not.toHaveBeenCalled();
    expect(mockGetWorkspaceResource).toHaveBeenCalledTimes(1);
  });

  test('deduplique une requete fiche ENCORE EN VOL (drawer + editeur simultanes)', async () => {
    const client = makeClient();
    let release: (value: unknown) => void = () => {};
    mockGetObjectResource.mockImplementation(() => new Promise((resolve) => { release = resolve; }));

    // Le tiroir demarre sa requete, l editeur precharge dans la foulee.
    const drawerFetch = client.fetchQuery({
      queryKey: ['object-detail', 'o1', langPrefs],
      queryFn: () => mockGetObjectResource('o1', langPrefs),
    });
    const workspaceLoad = loadObjectWorkspace(client, 'o1', langPrefs);

    release(DETAIL);
    await Promise.all([drawerFetch, workspaceLoad]);

    // UNE seule execution du RPC pour les deux consommateurs.
    expect(mockGetObjectResource).toHaveBeenCalledTimes(1);
  });

  test('passe la fiche resolue au chargeur au lieu de le laisser la recharger', async () => {
    const client = makeClient();
    client.setQueryData(['object-detail', 'o1', langPrefs], DETAIL);

    await loadObjectWorkspace(client, 'o1', langPrefs);

    const [, , , detailArg] = mockGetWorkspaceResource.mock.calls[0];
    expect(detailArg).toBe(DETAIL);
  });

  test('resout fiche et catalogues EN PARALLELE, pas en serie', async () => {
    const client = makeClient();
    const order: string[] = [];
    mockGetObjectResource.mockImplementation(async () => { order.push('detail:start'); return DETAIL; });
    mockFetchCatalogs.mockImplementation(async () => { order.push('catalogs:start'); return { refCodeByDomain: {}, tables: {} }; });

    await loadObjectWorkspace(client, 'o1', langPrefs);

    // En serie, le second ne demarrerait qu apres resolution du premier ; ici les
    // deux demarrages precedent toute resolution, donc ils sont bien concurrents.
    expect(order).toHaveLength(2);
    expect(new Set(order)).toEqual(new Set(['detail:start', 'catalogs:start']));
  });
});
