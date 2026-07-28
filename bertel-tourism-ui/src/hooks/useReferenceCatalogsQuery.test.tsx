import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  ensureReferenceCatalogs,
  useReferenceCatalogsQuery,
  REFERENCE_CATALOGS_QUERY_KEY,
} from './useReferenceCatalogsQuery';

const mockFetch = jest.fn();
jest.mock('../services/reference-catalogs', () => ({
  fetchReferenceCatalogs: () => mockFetch(),
}));

function makeWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe('useReferenceCatalogsQuery', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({ refCodeByDomain: { bed_type: [] }, tables: {} });
  });

  test('ne charge les catalogues qu une seule fois pour deux consommateurs', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = makeWrapper(client);

    const a = renderHook(() => useReferenceCatalogsQuery(), { wrapper });
    const b = renderHook(() => useReferenceCatalogsQuery(), { wrapper });

    await waitFor(() => expect(a.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(b.result.current.isSuccess).toBe(true));

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  test('est marquee persistable et garde une fraicheur d une heure', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useReferenceCatalogsQuery(), { wrapper: makeWrapper(client) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const entry = client.getQueryCache().find({ queryKey: [...REFERENCE_CATALOGS_QUERY_KEY] });
    expect(entry?.meta?.persist).toBe(true);
    // `staleTime` n'est pas expose sur le type QueryOptions du cache (il vit sur
    // les options d'observateur) ; on le lit tel quel, l'assertion reste exacte.
    expect((entry?.options as { staleTime?: number } | undefined)?.staleTime).toBe(60 * 60 * 1000);
  });
});

describe('ensureReferenceCatalogs — contrat de fraicheur', () => {
  // CE BLOC EST LA RAISON D'ETRE DE LA TACHE. Avec `ensureQueryData`, le second
  // test echoue : le cache est rendu tel quel meme vieux de 24 h (verifie dans
  // @tanstack/query-core 5.100.7 — `ensureQueryData` rend `cachedData` des que
  // `data !== undefined`, sans regarder staleTime). Avec `fetchQuery({staleTime})`
  // il passe. Neutraliser `staleTime` DOIT le faire tomber.
  beforeEach(() => {
    jest.useFakeTimers();
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({ refCodeByDomain: { bed_type: [] }, tables: {} });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('rend le cache sans requete tant qu il a moins d une heure', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    await ensureReferenceCatalogs(client);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(59 * 60 * 1000); // 59 minutes
    await ensureReferenceCatalogs(client);

    expect(mockFetch).toHaveBeenCalledTimes(1); // toujours 1 : servi du cache
  });

  test('refetch des que le cache depasse une heure', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    await ensureReferenceCatalogs(client);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(61 * 60 * 1000); // 61 minutes
    await ensureReferenceCatalogs(client);

    expect(mockFetch).toHaveBeenCalledTimes(2); // perime : recharge
  });
});
