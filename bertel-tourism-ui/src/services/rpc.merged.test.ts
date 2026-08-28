// B2 (spec 2026-08-26) — fusion des appels par bucket.
//
// L'Exploreur émettait 14 allers-retours par frappe validée (7 cartes + 7 marqueurs),
// à ~250 ms de serveur + ~250 ms de réseau chacun. Quand les payloads de filtres sont
// identiques — le cas par défaut — un seul appel avec l'union des types suffit.
//
// Ce que ce fichier garde :
//   * la fusion est ARMÉE par défaut, et ne fait qu'UN appel (cartes, puis marqueurs) ;
//   * elle est DÉSARMÉE dès qu'une facette propre à un bucket diverge, et le chemin
//     par-bucket historique (§125) reprend à l'identique ;
//   * la pagination fusionnée termine (le curseur synthétique décide seul).
//
// Le point sensible : les marqueurs alimentent `visibleObjectIds`, donc « Tout
// sélectionner ». Un ensemble rendu différent casserait silencieusement Export Excel,
// Copier les e-mails et Créer une liste — d'où l'assertion sur les ids rendus, et pas
// seulement sur le nombre d'appels.
import {
  EXPLORER_BUCKET_CURSOR_DONE,
  EXPLORER_MERGED_CURSOR_KEY,
  explorerCardsHasNextPage,
  fetchExplorerCardsPage,
  listObjectMarkers,
} from './rpc';
import { DEFAULT_EXPLORER_FILTERS, EXPLORER_BUCKET_TYPE_MAP, getEffectiveSelectedBuckets } from '../utils/facets';
import { getApiClient } from '../lib/supabase';
import { useSessionStore } from '../store/session-store';
import type { ExplorerFilters } from '../types/domain';

jest.mock('../lib/supabase', () => ({
  getApiClient: jest.fn(),
  getSupabaseClient: jest.fn(),
}));

const rpcMock = jest.fn();

function mockClient() {
  (getApiClient as jest.Mock).mockReturnValue({ schema: () => ({ rpc: rpcMock }) });
}

/** Réponse minimale d'une page de cartes : une fiche, plus de page suivante. */
function cardsPage(ids: string[], nextCursor: string | null = null) {
  return {
    data: {
      meta: { next_cursor: nextCursor, total: ids.length, label_rank_counts: { labelled: 0, equivalent: 0 } },
      data: ids.map((id) => ({ id, type: 'HLO', name: id })),
    },
    error: null,
  };
}

function markersRows(ids: string[]) {
  return {
    data: ids.map((id) => ({ id, type: 'HLO', name: id, location: { lat: -21, lon: 55, city: 'Le Tampon' } })),
    error: null,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState({ demoMode: false });
  mockClient();
});

describe('B2 — cartes', () => {
  it('par défaut : UN SEUL appel, avec l’union des types de tous les buckets', async () => {
    rpcMock.mockResolvedValue(cardsPage(['A', 'B']));

    const page = await fetchExplorerCardsPage(DEFAULT_EXPLORER_FILTERS, ['fr'], {});

    expect(rpcMock).toHaveBeenCalledTimes(1);
    const [fnName, args] = rpcMock.mock.calls[0];
    expect(fnName).toBe('list_object_resources_filtered_page');

    const expectedTypes = new Set(
      getEffectiveSelectedBuckets(DEFAULT_EXPLORER_FILTERS.selectedBuckets).flatMap(
        (bucket) => EXPLORER_BUCKET_TYPE_MAP[bucket],
      ),
    );
    expect(new Set(args.p_types)).toEqual(expectedTypes);
    expect(page.cards.map((card) => card.id)).toEqual(['A', 'B']);
    expect(page.cursors).toHaveProperty(EXPLORER_MERGED_CURSOR_KEY, EXPLORER_BUCKET_CURSOR_DONE);
  });

  it('DÉSARMÉE : une facette propre à un bucket ⇒ un appel PAR bucket (chemin §125 intact)', async () => {
    const filters: ExplorerFilters = {
      ...DEFAULT_EXPLORER_FILTERS,
      iti: { ...DEFAULT_EXPLORER_FILTERS.iti, isLoop: true },
    };
    rpcMock.mockResolvedValue(cardsPage(['A']));

    await fetchExplorerCardsPage(filters, ['fr'], {});

    const bucketCount = getEffectiveSelectedBuckets(filters.selectedBuckets).length;
    expect(rpcMock).toHaveBeenCalledTimes(bucketCount);
  });

  it('la pagination fusionnée avance puis TERMINE', async () => {
    rpcMock.mockResolvedValue(cardsPage(['A'], 'cur-2'));
    const first = await fetchExplorerCardsPage(DEFAULT_EXPLORER_FILTERS, ['fr'], {});
    expect(first.cursors[EXPLORER_MERGED_CURSOR_KEY]).toBe('cur-2');
    expect(explorerCardsHasNextPage(DEFAULT_EXPLORER_FILTERS, first.cursors)).toBe(true);

    rpcMock.mockResolvedValue(cardsPage(['B']));
    const second = await fetchExplorerCardsPage(DEFAULT_EXPLORER_FILTERS, ['fr'], first.cursors);
    expect(rpcMock.mock.calls[1][1].p_cursor).toBe('cur-2');
    expect(explorerCardsHasNextPage(DEFAULT_EXPLORER_FILTERS, second.cursors)).toBe(false);
  });

  it('un curseur fusionné épuisé ne relance AUCUN appel', async () => {
    const page = await fetchExplorerCardsPage(DEFAULT_EXPLORER_FILTERS, ['fr'], {
      [EXPLORER_MERGED_CURSOR_KEY]: EXPLORER_BUCKET_CURSOR_DONE,
    });
    expect(rpcMock).not.toHaveBeenCalled();
    expect(page.cards).toEqual([]);
  });
});

describe('B2 — marqueurs (source de « Tout sélectionner »)', () => {
  it('par défaut : UN SEUL appel, et l’ensemble rendu est celui du serveur', async () => {
    rpcMock.mockResolvedValue(markersRows(['A', 'B', 'C']));

    const markers = await listObjectMarkers(DEFAULT_EXPLORER_FILTERS);

    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock.mock.calls[0][0]).toBe('list_object_markers');
    // L'ensemble complet est préservé : c'est lui qui alimente la sélection.
    expect(markers.map((marker) => marker.id)).toEqual(['A', 'B', 'C']);
  });

  it('DÉSARMÉE : un appel PAR bucket, et les ensembles sont concaténés puis dédupliqués', async () => {
    const filters: ExplorerFilters = {
      ...DEFAULT_EXPLORER_FILTERS,
      iti: { ...DEFAULT_EXPLORER_FILTERS.iti, isLoop: true },
    };
    rpcMock.mockResolvedValue(markersRows(['A']));

    const markers = await listObjectMarkers(filters);

    expect(rpcMock).toHaveBeenCalledTimes(getEffectiveSelectedBuckets(filters.selectedBuckets).length);
    // Même id rendu par chaque bucket ⇒ une seule carte après dédoublonnage.
    expect(markers.map((marker) => marker.id)).toEqual(['A']);
  });
});
