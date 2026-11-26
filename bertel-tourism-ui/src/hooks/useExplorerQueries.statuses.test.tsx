import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useExplorerCardsQuery, useExplorerMarkersQuery } from './useExplorerQueries';
import { useExplorerStore } from '../store/explorer-store';
import { useSessionStore } from '../store/session-store';
import * as rpc from '../services/rpc';

jest.mock('../services/rpc', () => ({
  ...jest.requireActual('../services/rpc'),
  fetchExplorerCardsPage: jest.fn(),
  listObjectMarkers: jest.fn(),
}));

const fetchExplorerCardsPage = rpc.fetchExplorerCardsPage as jest.MockedFunction<
  typeof rpc.fetchExplorerCardsPage
>;
const listObjectMarkers = rpc.listObjectMarkers as jest.MockedFunction<typeof rpc.listObjectMarkers>;
const initialExplorerState = useExplorerStore.getState();
const initialCanEditObjects = useSessionStore.getState().canEditObjects;
const clients: QueryClient[] = [];

function renderQueries() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  clients.push(client);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return {
    client,
    ...renderHook(() => ({ cards: useExplorerCardsQuery(), markers: useExplorerMarkersQuery() }), { wrapper }),
  };
}

function expectOutgoingStatuses(statuses: string[]) {
  expect(fetchExplorerCardsPage.mock.calls.at(-1)?.[0].common.statuses).toEqual(statuses);
  expect(listObjectMarkers.mock.calls.at(-1)?.[0].common.statuses).toEqual(statuses);
}

describe('statuts Exploreur — cartes et marqueurs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    act(() => {
      useExplorerStore.getState().resetAll();
      useSessionStore.setState({ canEditObjects: true });
    });
    fetchExplorerCardsPage.mockResolvedValue({
      cards: [],
      cursors: {},
      labelRankCounts: { labelled: 0, equivalent: 0 },
      totalCount: 0,
    });
    listObjectMarkers.mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
    clients.splice(0).forEach((client) => client.clear());
    act(() => {
      useExplorerStore.setState(initialExplorerState);
      useSessionStore.setState({ canEditObjects: initialCanEditObjects });
    });
  });

  it('demande tous les statuts pour un éditeur sans sélection explicite', async () => {
    const { result } = renderQueries();

    await waitFor(() => {
      expect(result.current.cards.isSuccess).toBe(true);
      expect(result.current.markers.isSuccess).toBe(true);
    });

    expectOutgoingStatuses(['published', 'draft', 'hidden', 'archived']);
    expect(useExplorerStore.getState().common.statuses).toEqual([]);
  });

  it('transmet la sélection explicite Hors ligne aux cartes et à la carte géographique', async () => {
    act(() => useExplorerStore.getState().setStatuses(['hidden']));
    const { result } = renderQueries();

    await waitFor(() => {
      expect(result.current.cards.isSuccess).toBe(true);
      expect(result.current.markers.isSuccess).toBe(true);
    });

    expectOutgoingStatuses(['hidden']);
  });

  it('force les deux requêtes à Publié pour un lecteur malgré les statuts mémorisés', async () => {
    act(() => {
      useExplorerStore.getState().setStatuses(['hidden', 'archived']);
      useSessionStore.setState({ canEditObjects: false });
    });
    const { result } = renderQueries();

    await waitFor(() => {
      expect(result.current.cards.isSuccess).toBe(true);
      expect(result.current.markers.isSuccess).toBe(true);
    });

    expectOutgoingStatuses(['published']);
  });

  it('sépare les caches et recalcule les deux payloads lors d’un changement de rôle', async () => {
    const { client, result } = renderQueries();
    await waitFor(() => {
      expect(result.current.cards.isSuccess).toBe(true);
      expect(result.current.markers.isSuccess).toBe(true);
    });
    expectOutgoingStatuses(['published', 'draft', 'hidden', 'archived']);

    act(() => useSessionStore.setState({ canEditObjects: false }));

    await waitFor(() => {
      expect(fetchExplorerCardsPage).toHaveBeenCalledTimes(2);
      expect(listObjectMarkers).toHaveBeenCalledTimes(2);
      expect(result.current.cards.isFetching).toBe(false);
      expect(result.current.markers.isFetching).toBe(false);
    });
    expectOutgoingStatuses(['published']);

    for (const prefix of ['explorer-cards', 'explorer-markers']) {
      const queries = client.getQueryCache().findAll({ queryKey: [prefix] });
      expect(queries).toHaveLength(2);
      expect(queries.map((query) => query.queryKey[1])).toEqual(expect.arrayContaining([
        expect.objectContaining({ common: expect.objectContaining({ statuses: ['published', 'draft', 'hidden', 'archived'] }) }),
        expect.objectContaining({ common: expect.objectContaining({ statuses: ['published'] }) }),
      ]));
    }

    act(() => useSessionStore.setState({ canEditObjects: true }));
    await waitFor(() => {
      expect(result.current.cards.isPlaceholderData).toBe(false);
      expect(result.current.markers.isPlaceholderData).toBe(false);
      expect(result.current.cards.isFetching).toBe(false);
      expect(result.current.markers.isFetching).toBe(false);
    });
    expect(fetchExplorerCardsPage).toHaveBeenCalledTimes(2);
    expect(listObjectMarkers).toHaveBeenCalledTimes(2);
  });
});
