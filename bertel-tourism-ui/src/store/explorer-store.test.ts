import { useExplorerStore } from './explorer-store';

/**
 * Tag click-to-filter store contract (mirror of toggleLabel/clearLabels).
 * `tagsAny` carries {slug,name,color} so the sidebar Tags rail can show the name
 * (and tag color) while the RPC filters by slug (`tags_any`).
 */
describe('explorer-store tag filter', () => {
  beforeEach(() => {
    useExplorerStore.getState().resetAll();
  });

  it('adds a tag, then toggles the same slug off', () => {
    useExplorerStore.getState().toggleTag({ slug: 'wellness', name: 'Bien-être', color: '#ec4899' });
    expect(useExplorerStore.getState().common.tagsAny).toEqual([{ slug: 'wellness', name: 'Bien-être', color: '#ec4899' }]);

    useExplorerStore.getState().toggleTag({ slug: 'wellness', name: 'Bien-être' });
    expect(useExplorerStore.getState().common.tagsAny).toEqual([]);
  });

  it('dedupes by slug (a second add of the same slug removes it, never duplicates)', () => {
    useExplorerStore.getState().toggleTag({ slug: 'panorama', name: 'Panorama' });
    useExplorerStore.getState().toggleTag({ slug: 'wellness', name: 'Bien-être' });
    expect(useExplorerStore.getState().common.tagsAny.map((t) => t.slug)).toEqual(['panorama', 'wellness']);
  });

  it('ignores a blank slug', () => {
    useExplorerStore.getState().toggleTag({ slug: '   ', name: 'x' });
    expect(useExplorerStore.getState().common.tagsAny).toEqual([]);
  });

  it('clearTags empties the list', () => {
    useExplorerStore.getState().toggleTag({ slug: 'a', name: 'A' });
    useExplorerStore.getState().toggleTag({ slug: 'b', name: 'B' });
    expect(useExplorerStore.getState().common.tagsAny).toHaveLength(2);
    useExplorerStore.getState().clearTags();
    expect(useExplorerStore.getState().common.tagsAny).toEqual([]);
  });

  it('resetAll clears active tags', () => {
    useExplorerStore.getState().toggleTag({ slug: 'a', name: 'A' });
    useExplorerStore.getState().resetAll();
    expect(useExplorerStore.getState().common.tagsAny).toEqual([]);
  });
});

describe('D23 — garde anti-combinaison invalide (cascade au retrait de bucket)', () => {
  it('désélectionner ITI remet ses facettes à zéro', () => {
    const s = useExplorerStore.getState();
    s.toggleBucket('ITI');
    s.setItiIsLoop(true);
    s.setItiDifficulty(2, 4);
    s.toggleItiPractice('walk');
    s.toggleBucket('ITI'); // retrait
    const iti = useExplorerStore.getState().iti;
    expect(iti.isLoop).toBeNull();
    expect(iti.practicesAny).toEqual([]);
    expect(iti.difficultyMin).toBeUndefined();
  });

  it('désélectionner HOT vide ses sous-catégories + capacités (subtypes par défaut)', () => {
    const s = useExplorerStore.getState();
    s.toggleBucket('HOT');
    s.toggleTaxonomy('taxonomy_hlo', 'gite_villa');
    s.setHotCapacityFilter('bedrooms', 2, undefined);
    s.toggleBucket('HOT');
    expect(useExplorerStore.getState().common.taxonomyAny).toEqual([]);
    expect(useExplorerStore.getState().hot.capacityFilters).toEqual([]);
  });

  it('désélectionner un bucket ne purge QUE ses sous-catégories (§155)', () => {
    const s = useExplorerStore.getState();
    s.toggleBucket('HOT');
    s.toggleBucket('RES');
    s.toggleTaxonomy('taxonomy_hlo', 'gite_villa');
    s.toggleTaxonomy('taxonomy_res', 'pizzeria');
    s.toggleBucket('HOT'); // retrait HOT
    expect(useExplorerStore.getState().common.taxonomyAny).toEqual([{ domain: 'taxonomy_res', code: 'pizzeria' }]);
    // Cette describe n'a pas de beforeEach : on rend l'état propre au suivant.
    useExplorerStore.getState().resetAll();
  });

  it('ajouter un bucket ne touche pas ses facettes', () => {
    const s = useExplorerStore.getState();
    s.setResCapacityFilter('seats', undefined, 60);
    s.toggleBucket('RES');
    expect(useExplorerStore.getState().res.capacityFilters).toHaveLength(1);
    useExplorerStore.getState().toggleBucket('RES');
    expect(useExplorerStore.getState().res.capacityFilters).toEqual([]);
  });
});
