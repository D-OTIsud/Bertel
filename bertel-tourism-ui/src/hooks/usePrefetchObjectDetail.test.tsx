import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { usePrefetchObjectDetail } from './useExplorerQueries';
import { useSessionStore } from '../store/session-store';

const mockGetObjectResource = jest.fn();

jest.mock('../services/rpc', () => ({
  ...jest.requireActual('../services/rpc'),
  getObjectResource: (...args: unknown[]) => mockGetObjectResource(...args),
}));

function makeWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

// Le QueryClient de test declare EXPLICITEMENT le staleTime : le client de
// production le tient de app/query-client.ts, un client de test nu aurait
// staleTime=0 et rendrait la 3e assertion ininterpretable.
function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 5 * 60 * 1000 } },
  });
}

describe('usePrefetchObjectDetail', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockGetObjectResource.mockReset();
    mockGetObjectResource.mockResolvedValue({ id: 'X', name: 'X', raw: {} });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('precharge apres le delai d intention', async () => {
    const { result } = renderHook(() => usePrefetchObjectDetail(), { wrapper: makeWrapper(makeClient()) });

    const cancel = result.current('RESRUN0000000001');
    expect(mockGetObjectResource).not.toHaveBeenCalled(); // rien avant le delai

    await jest.advanceTimersByTimeAsync(200);

    expect(mockGetObjectResource).toHaveBeenCalledTimes(1);
    expect(mockGetObjectResource.mock.calls[0][0]).toBe('RESRUN0000000001');
    expect(typeof cancel).toBe('function');
  });

  test('un balayage de la liste ne precharge AUCUNE carte traversee', async () => {
    const { result } = renderHook(() => usePrefetchObjectDetail(), { wrapper: makeWrapper(makeClient()) });

    // 30 cartes survolees 50 ms chacune : sous le seuil d'intention de 200 ms.
    for (let i = 0; i < 30; i += 1) {
      const cancel = result.current(`RESRUN000000${String(i).padStart(4, '0')}`);
      await jest.advanceTimersByTimeAsync(50);
      cancel();
    }

    expect(mockGetObjectResource).not.toHaveBeenCalled();
  });

  test('ne repart pas si la fiche est deja fraiche en cache', async () => {
    const client = makeClient();
    // La cle inclut langPrefs : la lire DEPUIS le magasin, sinon on seede une
    // cle voisine et le test valide le contraire de ce qu'il annonce.
    const langPrefs = useSessionStore.getState().langPrefs;
    client.setQueryData(['object-detail', 'RESRUN0000000001', langPrefs], { id: 'X', name: 'X', raw: {} });
    const { result } = renderHook(() => usePrefetchObjectDetail(), { wrapper: makeWrapper(client) });

    result.current('RESRUN0000000001');
    await jest.advanceTimersByTimeAsync(200);

    expect(mockGetObjectResource).not.toHaveBeenCalled();
  });
});
