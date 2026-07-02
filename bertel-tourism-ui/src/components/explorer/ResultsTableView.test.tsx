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
});
