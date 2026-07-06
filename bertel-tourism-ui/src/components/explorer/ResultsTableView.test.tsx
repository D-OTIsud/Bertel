import { render, screen, fireEvent, within } from '@testing-library/react';
import { ResultsTableView } from './ResultsTableView';
import { useExplorerStore } from '../../store/explorer-store';
import { DEFAULT_TABLE_COLUMNS, useExplorerViewStore } from '../../store/explorer-view-store';
import { useUiStore } from '../../store/ui-store';
import type { ObjectCard } from '../../types/domain';

const CARDS: ObjectCard[] = [
  {
    id: 'obj-1',
    type: 'HOT',
    name: 'Auberge du Volcan',
    status: 'published',
    rating: 4.2,
    review_count: 12,
    location: { city: 'Le Tampon' },
    updated_at: '2026-06-01T08:00:00Z',
    labels: ['3 étoiles'],
  },
  {
    id: 'obj-2',
    type: 'RES',
    name: 'Zot Table',
    status: 'draft',
    rating: null,
    location: { city: 'Cilaos' },
    updated_at: null,
    labels: [],
  },
];

function renderTable(props: Partial<Parameters<typeof ResultsTableView>[0]> = {}) {
  return render(<ResultsTableView cards={CARDS} loading={false} {...props} />);
}

describe('ResultsTableView (D17 — table dense Explorer)', () => {
  beforeEach(() => {
    useExplorerStore.setState({ selectedObjectIds: [], visibleObjectIds: [] });
    useExplorerViewStore.setState({
      viewMode: 'table',
      tableColumns: [...DEFAULT_TABLE_COLUMNS],
      tableDensity: 'confort',
      tableSort: null,
    });
    useUiStore.setState({ drawerObjectId: null });
  });

  it('rend une ligne par carte avec les colonnes par défaut', () => {
    renderTable();
    expect(screen.getByRole('columnheader', { name: /Nom/ })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /Commune/ })).toBeInTheDocument();
    expect(screen.getByText('Le Tampon')).toBeInTheDocument();
    expect(screen.getByText('Publiée')).toBeInTheDocument();
    expect(screen.getByText('Brouillon')).toBeInTheDocument();
    // 1 ligne d'en-tête + 2 lignes de données
    expect(screen.getAllByRole('row')).toHaveLength(3);
  });

  it('affiche le total du corpus (totalCount) dans l’en-tête, pas seulement les lignes chargées', () => {
    renderTable({ totalCount: 137 });
    expect(screen.getByText('137 fiches')).toBeInTheDocument();
    expect(screen.queryByText('2 fiches')).toBeNull();
  });

  it('retombe sur le nombre de lignes chargées quand aucun totalCount n’est fourni', () => {
    renderTable();
    expect(screen.getByText('2 fiches')).toBeInTheDocument();
  });

  it('le clic sur l’en-tête Nom cycle asc → desc et réordonne les lignes', () => {
    renderTable();
    const sortByName = screen.getByRole('button', { name: 'Nom' });

    fireEvent.click(sortByName);
    let rows = screen.getAllByRole('row').slice(1);
    expect(within(rows[0]).getByText('Auberge du Volcan')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /Nom/ })).toHaveAttribute('aria-sort', 'ascending');

    fireEvent.click(sortByName);
    rows = screen.getAllByRole('row').slice(1);
    expect(within(rows[0]).getByText('Zot Table')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /Nom/ })).toHaveAttribute('aria-sort', 'descending');
  });

  it('la case d’une ligne ajoute/retire la fiche de la sélection partagée', () => {
    renderTable();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Ajouter Auberge du Volcan à la sélection' }));
    expect(useExplorerStore.getState().selectedObjectIds).toEqual(['obj-1']);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Retirer Auberge du Volcan de la sélection' }));
    expect(useExplorerStore.getState().selectedObjectIds).toEqual([]);
  });

  it('la case d’en-tête sélectionne toutes les fiches chargées puis vide', () => {
    renderTable();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Sélectionner les fiches chargées' }));
    expect(useExplorerStore.getState().selectedObjectIds).toEqual(['obj-1', 'obj-2']);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Désélectionner les fiches chargées' }));
    expect(useExplorerStore.getState().selectedObjectIds).toEqual([]);
  });

  it('le nom (bouton clavier) ouvre la fiche dans le drawer', () => {
    renderTable();
    fireEvent.click(screen.getByRole('button', { name: 'Auberge du Volcan' }));
    expect(useUiStore.getState().drawerObjectId).toBe('obj-1');
  });

  it('le gestionnaire de colonnes masque une colonne', () => {
    renderTable();
    fireEvent.click(screen.getByRole('button', { name: /Colonnes/ }));
    const manager = screen.getByRole('dialog', { name: 'Colonnes du tableau' });
    fireEvent.click(within(manager).getByRole('checkbox', { name: 'Commune' }));
    expect(screen.queryByRole('columnheader', { name: /Commune/ })).not.toBeInTheDocument();
  });

  it('exporte le CSV des colonnes visibles', () => {
    const createObjectURL = jest.fn(() => 'blob:mock');
    const revokeObjectURL = jest.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });

    renderTable();
    fireEvent.click(screen.getByRole('button', { name: /CSV/ }));
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock');
  });

  it('« Charger plus » appelle onLoadMore', () => {
    const onLoadMore = jest.fn();
    renderTable({ hasMore: true, onLoadMore });
    fireEvent.click(screen.getByRole('button', { name: 'Charger plus de résultats' }));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('affiche deux lignes de groupe quand le filtre Label mélange labellisés et actions compatibles', () => {
    const rankedCards: ObjectCard[] = [
      {
        id: 'obj-labelled',
        type: 'HOT',
        name: 'Auberge du Volcan',
        status: 'published',
        rating: 4.2,
        review_count: 12,
        location: { city: 'Le Tampon' },
        updated_at: '2026-06-01T08:00:00Z',
        labels: ['3 étoiles'],
        label_match: { scheme_code: 'CLEF_VERTE', rank: 0, source: 'certified_label', evidence_count: 1 },
      },
      {
        id: 'obj-equivalent',
        type: 'RES',
        name: 'Zot Table',
        status: 'published',
        rating: null,
        location: { city: 'Cilaos' },
        updated_at: null,
        labels: [],
        label_match: { scheme_code: 'CLEF_VERTE', rank: 1, source: 'sustainability_action', evidence_count: 2 },
      },
    ];

    renderTable({ cards: rankedCards, labelRankCounts: { labelled: 1, equivalent: 1 } });

    const groupRows = document.querySelectorAll('tr.results-table__group-row');
    expect(groupRows).toHaveLength(2);
    expect(screen.getByText('Établissements labellisés')).toBeInTheDocument();
    expect(screen.getByText(/Aussi pertinents/)).toBeInTheDocument();
  });

  it('affiche les niveaux de classement (5 étoiles en premier) et replie une section au clic quand gradeSection est fourni', () => {
    const gradedCards: ObjectCard[] = [
      {
        id: 'obj-3star',
        type: 'HOT',
        name: 'Trois Etoiles',
        status: 'published',
        rating: null,
        location: { city: 'Le Tampon' },
        updated_at: null,
        labels: [],
        badges: [{ code: 'meuble_stars:3' }],
      },
      {
        id: 'obj-5star',
        type: 'HOT',
        name: 'Cinq Etoiles',
        status: 'published',
        rating: null,
        location: { city: 'Cilaos' },
        updated_at: null,
        labels: [],
        badges: [{ code: 'meuble_stars:5' }],
      },
    ];

    renderTable({
      cards: gradedCards,
      gradeSection: {
        schemeCode: 'meuble_stars',
        values: [
          { code: '1', name: '1 étoile' },
          { code: '2', name: '2 étoiles' },
          { code: '3', name: '3 étoiles' },
          { code: '4', name: '4 étoiles' },
          { code: '5', name: '5 étoiles' },
        ],
      },
    });

    const groupRows = document.querySelectorAll('tr.results-table__group-row');
    expect(groupRows).toHaveLength(2);
    const fiveStarHeader = screen.getByText('5 étoiles');
    const threeStarHeader = screen.getByText('3 étoiles');
    expect(fiveStarHeader).toBeInTheDocument();
    expect(threeStarHeader).toBeInTheDocument();
    // 5 étoiles (niveau le plus haut) doit précéder 3 étoiles dans l'ordre du document.
    expect(fiveStarHeader.compareDocumentPosition(threeStarHeader) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    expect(screen.getByText('Cinq Etoiles')).toBeInTheDocument();
    expect(screen.getByText('Trois Etoiles')).toBeInTheDocument();

    // Clic sur l'en-tête « 5 étoiles » replie ses lignes.
    const fiveStarHeaderButton = fiveStarHeader.closest('button');
    expect(fiveStarHeaderButton).not.toBeNull();
    fireEvent.click(fiveStarHeaderButton as HTMLButtonElement);

    expect(screen.queryByText('Cinq Etoiles')).not.toBeInTheDocument();
    // L'autre section reste dépliée.
    expect(screen.getByText('Trois Etoiles')).toBeInTheDocument();
  });
});
