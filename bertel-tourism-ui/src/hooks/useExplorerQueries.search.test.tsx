/**
 * Garde d'incident (2026-08-07) — la frappe dans la recherche de l'Exploreur ne doit PAS
 * atteindre le serveur lettre par lettre.
 *
 * Ce qui s'est passé : `common.search` fait partie de la queryKey de `explorer-cards` ET de
 * `explorer-markers`, et chacune de ces requêtes émet UNE RPC PAR BUCKET (7 buckets quand
 * aucun n'est sélectionné). Sans temporisation, taper « initiation » lançait ~140 requêtes
 * en deux secondes, aucune annulée. Les préfixes intermédiaires (« in », « ini », « init »…)
 * ne trouvent rien en plein texte et arment donc le repli flou (§197/§199), le chemin cher.
 * L'instance a été affamée en CPU ~40 s et TOUTES les RPC — y compris `get_object_resource`,
 * sans rapport avec la recherche — sont tombées en `statement timeout` (8 s), soit 500 côté
 * PostgREST.
 *
 * La garde est NON VACANTE : retirer `useDebouncedValue` de `useExplorerQueryFilters` fait
 * tomber le premier test, retirer le passage du `signal` fait tomber le second.
 */
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useExplorerCardsQuery, useExplorerMarkersQuery } from './useExplorerQueries';
import { useExplorerStore } from '../store/explorer-store';
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

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

/** Frappe « initiation » caractère par caractère, comme un utilisateur réel. */
function typeSearch(term: string) {
  for (let i = 1; i <= term.length; i += 1) {
    act(() => {
      useExplorerStore.getState().setSearch(term.slice(0, i));
    });
  }
}

describe('recherche Exploreur — temporisation et annulation', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    act(() => {
      useExplorerStore.getState().setSearch('');
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
    jest.useRealTimers();
  });

  it('n interroge le serveur qu une fois pour dix frappes, avec le terme final', async () => {
    const wrapper = makeWrapper();
    renderHook(() => ({ cards: useExplorerCardsQuery(), markers: useExplorerMarkersQuery() }), {
      wrapper,
    });

    // Le montage paie une requête par hook (recherche vide) : c'est la ligne de base.
    const baselineCards = fetchExplorerCardsPage.mock.calls.length;
    const baselineMarkers = listObjectMarkers.mock.calls.length;

    typeSearch('initiation');

    // Avant la pause, la frappe ne doit avoir déclenché AUCUNE requête supplémentaire.
    expect(fetchExplorerCardsPage.mock.calls.length).toBe(baselineCards);
    expect(listObjectMarkers.mock.calls.length).toBe(baselineMarkers);

    act(() => {
      jest.advanceTimersByTime(400);
    });

    await waitFor(() => {
      expect(listObjectMarkers.mock.calls.length).toBe(baselineMarkers + 1);
    });
    expect(fetchExplorerCardsPage.mock.calls.length).toBe(baselineCards + 1);

    // …et c'est bien le terme COMPLET qui part, pas un préfixe.
    const lastMarkerFilters = listObjectMarkers.mock.calls.at(-1)?.[0];
    expect(lastMarkerFilters?.common.search).toBe('initiation');
  });

  it('transmet un AbortSignal aux deux requêtes, pour que la requête dépassée s arrête', async () => {
    const wrapper = makeWrapper();
    renderHook(() => ({ cards: useExplorerCardsQuery(), markers: useExplorerMarkersQuery() }), {
      wrapper,
    });

    await waitFor(() => {
      expect(listObjectMarkers).toHaveBeenCalled();
    });

    expect(listObjectMarkers.mock.calls.at(-1)?.[1]).toBeInstanceOf(AbortSignal);
    expect(fetchExplorerCardsPage.mock.calls.at(-1)?.[3]).toBeInstanceOf(AbortSignal);
  });
});
