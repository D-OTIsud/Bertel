import { addObjectMediaItem, patchObjectMediaItem, removeObjectMediaItem } from './media-items';
import { fullModulesFixture } from './section-fixture.test-utils';

describe('media item helpers', () => {
  it('adds, patches, and removes object media while preserving one cover', () => {
    const media = fullModulesFixture().media;
    const added = addObjectMediaItem(media);
    expect(added.objectItems).toHaveLength(2);

    const patched = patchObjectMediaItem(added, added.objectItems[1].id, { title: 'Plan PDF', typeCode: 'pdf', isMain: true });
    expect(patched.objectItems[1].typeLabel).toBe('PDF');
    expect(patched.objectItems.filter((item) => item.isMain)).toHaveLength(1);

    const removed = removeObjectMediaItem(patched, patched.objectItems[1].id);
    expect(removed.objectItems[0].isMain).toBe(true);
  });
});
