import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useNameMatchQuery } from './useNameMatchQuery';
import { searchObjectsByName, type NameMatch } from '../services/name-search';
import { useExplorerStore } from '../store/explorer-store';
import { useSessionStore } from '../store/session-store';

jest.mock('../services/name-search', () => ({
  ...jest.requireActual('../services/name-search'),
  searchObjectsByName: jest.fn(),
}));

const searchMock = searchObjectsByName as jest.MockedFunction<typeof searchObjectsByName>;
const initialExplorer = useExplorerStore.getState();
const initialSession = useSessionStore.getState();
const clients: QueryClient[] = [];
const MARGOUILLAT: NameMatch = {
  id: 'hidden', name: 'Le Margouillat', type: 'RES', status: 'hidden', city: 'Le Tampon', imageUrl: null,
};
const APPART: NameMatch = {
  ...MARGOUILLAT, id: 'draft', name: "ESCAL’RUN — Appart Margouillat", type: 'HLO', status: 'draft',
};

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  clients.push(client);
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  searchMock.mockReset();
  searchMock.mockResolvedValue([]);
  act(() => {
    useExplorerStore.getState().resetAll();
    useSessionStore.setState({ canEditObjects: true });
  });
});

afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  act(() => {
    useExplorerStore.setState(initialExplorer);
    useSessionStore.setState(initialSession);
  });
  jest.useRealTimers();
});

it('partage une requête entre les consommateurs du même terme et des mêmes statuts', async () => {
  searchMock.mockResolvedValue([MARGOUILLAT, APPART]);
  const { result } = renderHook(() => [useNameMatchQuery('margouillat'), useNameMatchQuery('margouillat')], {
    wrapper: wrapper(),
  });

  await waitFor(() => expect(result.current[0].data).toEqual([MARGOUILLAT, APPART]));
  expect(result.current[1].data).toEqual([MARGOUILLAT, APPART]);
  expect(searchMock).toHaveBeenCalledTimes(1);
  expect(searchMock).toHaveBeenCalledWith('margouillat', expect.any(AbortSignal), ['published', 'draft', 'hidden', 'archived']);
});

it('refait la requête à terme identique et retire les anciens statuts pendant le chargement', async () => {
  act(() => useExplorerStore.getState().setStatuses(['draft']));
  searchMock.mockResolvedValueOnce([APPART]);
  let resolveHidden!: (matches: NameMatch[]) => void;
  searchMock.mockImplementationOnce(() => new Promise((resolve) => { resolveHidden = resolve; }));
  const { result } = renderHook(() => useNameMatchQuery('margouillat'), { wrapper: wrapper() });
  await waitFor(() => expect(result.current.data).toEqual([APPART]));

  act(() => useExplorerStore.getState().setStatuses(['hidden']));

  expect(result.current.data).toEqual([]);
  await waitFor(() => expect(searchMock).toHaveBeenCalledTimes(2));
  expect(searchMock).toHaveBeenLastCalledWith('margouillat', expect.any(AbortSignal), ['hidden']);
  await act(async () => resolveHidden([MARGOUILLAT]));
  await waitFor(() => expect(result.current.data).toEqual([MARGOUILLAT]));
});

it('conserve les résultats précédents uniquement pour une autre frappe dans le même périmètre', async () => {
  searchMock.mockResolvedValueOnce([MARGOUILLAT]);
  let resolveNext!: (matches: NameMatch[]) => void;
  searchMock.mockImplementationOnce(() => new Promise((resolve) => { resolveNext = resolve; }));
  const { result, rerender } = renderHook(({ term }) => useNameMatchQuery(term), {
    initialProps: { term: 'marg' }, wrapper: wrapper(),
  });
  await waitFor(() => expect(result.current.data).toEqual([MARGOUILLAT]));
  rerender({ term: 'margouillat' });
  await waitFor(() => expect(searchMock).toHaveBeenCalledTimes(2));
  expect(result.current.data).toEqual([MARGOUILLAT]);
  await act(async () => resolveNext([]));
  await waitFor(() => expect(result.current.data).toEqual([]));
});

it('neutralise les statuts non publiés pour un lecteur, même lors d’un changement de permission', async () => {
  act(() => useExplorerStore.getState().setStatuses(['hidden']));
  searchMock.mockResolvedValueOnce([MARGOUILLAT]).mockResolvedValueOnce([]);
  const { result } = renderHook(() => useNameMatchQuery('margouillat'), { wrapper: wrapper() });
  await waitFor(() => expect(result.current.data).toEqual([MARGOUILLAT]));
  act(() => useSessionStore.setState({ canEditObjects: false }));
  expect(result.current.data).toEqual([]);
  await waitFor(() => expect(searchMock).toHaveBeenCalledTimes(2));
  expect(searchMock).toHaveBeenLastCalledWith('margouillat', expect.any(AbortSignal), ['published']);
});

it('garde la navigation globale indépendante du filtre de statut Explorer', async () => {
  act(() => useExplorerStore.getState().setStatuses(['hidden']));
  searchMock.mockResolvedValue([MARGOUILLAT, APPART]);
  const { result } = renderHook(() => useNameMatchQuery('margouillat', 'global'), { wrapper: wrapper() });
  await waitFor(() => expect(result.current.data).toEqual([MARGOUILLAT, APPART]));
  expect(searchMock).toHaveBeenLastCalledWith('margouillat', expect.any(AbortSignal), null);
});

it('temporise la saisie et garde le seuil commun au service', async () => {
  jest.useFakeTimers();
  const { rerender } = renderHook(({ term }) => useNameMatchQuery(term), {
    initialProps: { term: 'm' }, wrapper: wrapper(),
  });
  expect(searchMock).not.toHaveBeenCalled();
  rerender({ term: 'ma' });
  act(() => jest.advanceTimersByTime(149));
  expect(searchMock).not.toHaveBeenCalled();
  await act(async () => jest.advanceTimersByTime(1));
  expect(searchMock).toHaveBeenCalledTimes(1);
  expect(searchMock.mock.calls[0][0]).toBe('ma');
});
