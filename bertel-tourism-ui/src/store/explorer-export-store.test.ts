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

  it('setColumns filtre les ids inconnus (renommage futur) et garde les ids valides restants', () => {
    useExplorerExportStore.getState().setColumns(['colonne_disparue', 'name']);
    expect(useExplorerExportStore.getState().columnIds).toEqual(['name']);
  });

  it('setColumns garde l\'état précédent si TOUS les ids proposés sont périmés (finding 2)', () => {
    useExplorerExportStore.getState().setColumns(['name', 'city']);
    useExplorerExportStore.getState().setColumns(['colonne_disparue', 'autre_disparue']);
    expect(useExplorerExportStore.getState().columnIds).toEqual(['name', 'city']);
  });

  it("applyPreset('custom') ne vide jamais la sélection en cours (finding 3)", () => {
    useExplorerExportStore.getState().setColumns(['name', 'city']);
    useExplorerExportStore.getState().applyPreset('custom', SESSION);
    expect(useExplorerExportStore.getState().columnIds).toEqual(['name', 'city']);
  });

  it('merge (rehydratation) retombe sur essentiel si le disque ne contient plus aucun id valide (finding 1)', () => {
    // simule une restauration corrompue : la SEULE colonne persistée a disparu du registre
    localStorage.setItem(
      'bertel-explorer-export',
      JSON.stringify({ state: { presetId: 'custom', columnIds: ['colonne_disparue'] }, version: 0 }),
    );
    useExplorerExportStore.persist.rehydrate();
    expect(useExplorerExportStore.getState().columnIds.length).toBeGreaterThan(0);
  });
});
