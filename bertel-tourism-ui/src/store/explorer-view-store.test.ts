import { DEFAULT_TABLE_COLUMNS, useExplorerViewStore } from './explorer-view-store';

function resetStore() {
  useExplorerViewStore.setState({
    viewMode: 'split',
    tableColumns: [...DEFAULT_TABLE_COLUMNS],
    tableDensity: 'confort',
    tableSort: null,
  });
}

describe('explorer-view-store (D16/D17)', () => {
  beforeEach(resetStore);

  it('démarre en Split avec les colonnes par défaut', () => {
    const state = useExplorerViewStore.getState();
    expect(state.viewMode).toBe('split');
    expect(state.tableColumns).toEqual(['name', 'type', 'city', 'status', 'updated', 'rating', 'labels']);
    expect(state.tableSort).toBeNull();
  });

  it('setViewMode change le mode', () => {
    useExplorerViewStore.getState().setViewMode('table');
    expect(useExplorerViewStore.getState().viewMode).toBe('table');
  });

  it('toggleTableColumn masque puis ré-insère à la position canonique', () => {
    const { toggleTableColumn } = useExplorerViewStore.getState();
    toggleTableColumn('type');
    expect(useExplorerViewStore.getState().tableColumns).not.toContain('type');
    toggleTableColumn('type');
    // Ré-inséré entre name et city (ordre canonique), pas en fin de liste.
    expect(useExplorerViewStore.getState().tableColumns.slice(0, 3)).toEqual(['name', 'type', 'city']);
  });

  it('toggleTableColumn ajoute une colonne optionnelle (price) à sa place canonique', () => {
    useExplorerViewStore.getState().toggleTableColumn('price');
    const columns = useExplorerViewStore.getState().tableColumns;
    expect(columns).toContain('price');
    expect(columns.indexOf('price')).toBeGreaterThan(columns.indexOf('labels'));
  });

  it('refuse de masquer la dernière colonne visible', () => {
    useExplorerViewStore.setState({ tableColumns: ['name'] });
    useExplorerViewStore.getState().toggleTableColumn('name');
    expect(useExplorerViewStore.getState().tableColumns).toEqual(['name']);
  });

  it('masquer la colonne triée efface le tri', () => {
    useExplorerViewStore.setState({ tableSort: { columnId: 'city', dir: 'asc' } });
    useExplorerViewStore.getState().toggleTableColumn('city');
    expect(useExplorerViewStore.getState().tableSort).toBeNull();
  });

  it('moveTableColumn permute les voisines et ignore les bords', () => {
    const { moveTableColumn } = useExplorerViewStore.getState();
    moveTableColumn('type', -1);
    expect(useExplorerViewStore.getState().tableColumns.slice(0, 2)).toEqual(['type', 'name']);
    moveTableColumn('type', -1); // déjà premier → no-op
    expect(useExplorerViewStore.getState().tableColumns[0]).toBe('type');
  });

  it('cycleTableSort : asc → desc → aucun ; changer de colonne repart en asc', () => {
    const { cycleTableSort } = useExplorerViewStore.getState();
    cycleTableSort('name');
    expect(useExplorerViewStore.getState().tableSort).toEqual({ columnId: 'name', dir: 'asc' });
    cycleTableSort('name');
    expect(useExplorerViewStore.getState().tableSort).toEqual({ columnId: 'name', dir: 'desc' });
    cycleTableSort('name');
    expect(useExplorerViewStore.getState().tableSort).toBeNull();
    cycleTableSort('city');
    expect(useExplorerViewStore.getState().tableSort).toEqual({ columnId: 'city', dir: 'asc' });
  });
});
