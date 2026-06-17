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
