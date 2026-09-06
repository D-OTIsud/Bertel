import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ResultsList } from './ResultsList';
import { useExplorerStore } from '../../store/explorer-store';
import { useUiStore } from '../../store/ui-store';
import type { ObjectCard } from '../../types/domain';
import { SELECTION_HYDRATION_LIMIT } from './selection-hydration';

// La liste réclame elle-même les cartes sélectionnées qui manquent à sa fenêtre
// paginée : on observe l'APPEL (quels ids sont demandés) autant que le rendu.
const selectionCardsSpy = jest.fn();
let selectionCardsResult: ObjectCard[] = [];

jest.mock('../../hooks/useExplorerQueries', () => ({
  usePrefetchObjectDetail: () => () => () => {},
  useExplorerSelectionCardsQuery: (ids: string[]) => {
    selectionCardsSpy(ids);
    return { data: selectionCardsResult, isFetching: false };
  },
}));

function makeCard(overrides: Partial<ObjectCard> = {}): ObjectCard {
  return {
    id: 'o1',
    type: 'HLO',
    name: 'A RaNd O',
    open_now: true,
    location: { city: 'Entre-Deux' },
    labels: [],
    tagChips: [],
    ...overrides,
  } as ObjectCard;
}

function renderResultsList(props: Partial<Parameters<typeof ResultsList>[0]> & { cards: ObjectCard[] }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ResultsList loading={false} {...props} />
    </QueryClientProvider>,
  );
}

describe('ResultsList — sélection hors de la fenêtre paginée', () => {
  // jsdom n'implémente pas scrollIntoView, que la liste appelle sur la fiche cliquée.
  beforeAll(() => {
    Element.prototype.scrollIntoView = jest.fn();
  });

  beforeEach(() => {
    selectionCardsSpy.mockClear();
    selectionCardsResult = [];
    useExplorerStore.setState({
      selectedObjectIds: [],
      selectedCardId: null,
      hoveredCardId: null,
      visibleObjectIds: [],
    });
    useUiStore.setState({ drawerObjectId: null });
  });

  it('réclame les cartes sélectionnées absentes de la fenêtre chargée et les remonte en tête', () => {
    // La carte « far » est dans le corpus filtré (elle est sur la carte) mais vit
    // au-delà des pages chargées : sans réclamation elle n'apparaîtrait jamais.
    useExplorerStore.setState({
      selectedObjectIds: ['far'],
      visibleObjectIds: ['a', 'b', 'far'],
    });
    selectionCardsResult = [makeCard({ id: 'far', name: 'Loin dans la liste' })];

    renderResultsList({ cards: [makeCard({ id: 'a' }), makeCard({ id: 'b' })] });

    expect(selectionCardsSpy).toHaveBeenCalledWith(['far']);

    const far = document.getElementById('result-card-far');
    const first = document.getElementById('result-card-a');
    expect(far).not.toBeNull();
    expect(first).not.toBeNull();
    // « far » précède la première carte chargée : la sélection flotte en tête.
    expect(far!.compareDocumentPosition(first!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('ne réclame pas les cartes sélectionnées déjà chargées', () => {
    useExplorerStore.setState({ selectedObjectIds: ['a'], visibleObjectIds: ['a', 'b'] });
    renderResultsList({ cards: [makeCard({ id: 'a' }), makeCard({ id: 'b' })] });
    expect(selectionCardsSpy).toHaveBeenCalledWith([]);
  });

  it('ignore une sélection qui ne fait plus partie du corpus filtré', () => {
    // D25 : la sélection SURVIT à un changement de filtre. Une fiche qui ne
    // correspond plus aux filtres ne doit pas être réinjectée dans les résultats.
    useExplorerStore.setState({ selectedObjectIds: ['stale'], visibleObjectIds: ['a', 'b'] });
    renderResultsList({ cards: [makeCard({ id: 'a' }), makeCard({ id: 'b' })] });
    expect(selectionCardsSpy).toHaveBeenCalledWith([]);
  });

  it('borne le nombre de cartes réclamées', () => {
    const many = Array.from({ length: SELECTION_HYDRATION_LIMIT + 25 }, (_, i) => `m${i}`);
    useExplorerStore.setState({ selectedObjectIds: many, visibleObjectIds: many });
    renderResultsList({ cards: [makeCard({ id: 'a' })] });

    const requested = selectionCardsSpy.mock.calls.at(-1)?.[0] as string[];
    expect(requested).toHaveLength(SELECTION_HYDRATION_LIMIT);
    expect(requested[0]).toBe('m0');
  });

  it('ne réclame rien quand la liste est groupée en sections (le flottement y est suspendu)', () => {
    useExplorerStore.setState({ selectedObjectIds: ['far'], visibleObjectIds: ['lab', 'eq', 'far'] });
    renderResultsList({
      cards: [
        makeCard({ id: 'lab', label_match: { scheme_code: 'LBL_CLEF_VERTE', rank: 0, source: 'certified_label', evidence_count: 1 } }),
        makeCard({ id: 'eq', label_match: { scheme_code: 'LBL_CLEF_VERTE', rank: 1, source: 'sustainability_action', evidence_count: 1 } }),
      ],
      labelRankCounts: { labelled: 1, equivalent: 1 },
    });
    expect(selectionCardsSpy).toHaveBeenCalledWith([]);
  });

  it('réclame aussi la fiche cliquée sur la carte quand elle est hors fenêtre', () => {
    // Clic sur un marqueur → selectCard(id). Sans réclamation, le scrollIntoView de
    // la liste ne trouve aucun élément et la fiche cliquée reste invisible.
    useExplorerStore.setState({ selectedCardId: 'pin', visibleObjectIds: ['a', 'pin'] });
    selectionCardsResult = [makeCard({ id: 'pin', name: 'Marqueur cliqué' })];

    renderResultsList({ cards: [makeCard({ id: 'a' })] });

    expect(selectionCardsSpy).toHaveBeenCalledWith(['pin']);
    expect(document.getElementById('result-card-pin')).not.toBeNull();
    expect(screen.getByText('Marqueur cliqué')).toBeInTheDocument();
  });
});
