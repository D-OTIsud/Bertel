import { useExplorerExportStore } from './explorer-export-store';

const SESSION = { orgId: 'ORG', canEditObjects: true, role: 'super_admin' };

describe('explorer-export-store (§208) — même mécanique que explorer-view-store', () => {
  beforeEach(() => {
    localStorage.clear();
    useExplorerExportStore.setState({ presetId: 'essentiel', columnIds: [] });
    useExplorerExportStore.getState().applyPreset('essentiel', SESSION);
  });

  it('applyPreset remplit les colonnes ; toggle bascule en custom', () => {
    const state = useExplorerExportStore.getState();
    expect(state.columnIds).toContain('name');
    state.toggleColumn('latitude');
    expect(useExplorerExportStore.getState().presetId).toBe('custom');
    expect(useExplorerExportStore.getState().columnIds).toContain('latitude');
  });

  it('garde « jamais 0 colonne » : décocher la dernière est refusé', () => {
    useExplorerExportStore.getState().setColumns(['name']);
    useExplorerExportStore.getState().toggleColumn('name');
    expect(useExplorerExportStore.getState().columnIds).toEqual(['name']);
  });

  it('merge filtre les ids inconnus (renommage futur) et retombe sur essentiel si vide', () => {
    // simule une restauration corrompue
    useExplorerExportStore.getState().setColumns(['colonne_disparue', 'name']);
    expect(useExplorerExportStore.getState().columnIds).toEqual(['name']);
  });
});
