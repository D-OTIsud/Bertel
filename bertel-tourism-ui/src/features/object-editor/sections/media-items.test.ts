import type { ObjectWorkspaceMediaItem, ObjectWorkspaceMediaModule } from '../../../services/object-workspace-parser';
import {
  AUTHORABLE_MEDIA_TYPE_CODES,
  addObjectMediaItem,
  createObjectMediaItem,
  patchObjectMediaItem,
  removeObjectMediaItem,
  reorderObjectMediaItems,
} from './media-items';
import { fullModulesFixture } from './section-fixture.test-utils';

function item(over: Partial<ObjectWorkspaceMediaItem> = {}): ObjectWorkspaceMediaItem {
  return {
    id: 'm1',
    scope: 'object',
    placeId: null,
    scopeLabel: 'Objet',
    typeId: 'mt-photo',
    typeCode: 'photo',
    typeLabel: 'Photo',
    title: 'Façade',
    titleTranslations: {},
    description: '',
    descriptionTranslations: {},
    url: 'https://cdn.example/a.jpg',
    credit: '',
    visibility: 'public',
    position: '0',
    width: '',
    height: '',
    rightsExpiresAt: '',
    kind: '',
    isMain: true,
    isPublished: true,
    tags: [],
    ...over,
  };
}

function moduleWith(items: ObjectWorkspaceMediaItem[]): ObjectWorkspaceMediaModule {
  return {
    // Document type deliberately FIRST: a new §05 item must still default to an
    // authorable type (documents are uploaded from their owning sections).
    typeOptions: [
      { id: 'mt-doc', code: 'brochure_pdf', label: 'Brochure PDF' },
      { id: 'mt-photo', code: 'photo', label: 'Photo' },
    ],
    tagOptions: [],
    objectItems: items,
    placeItems: [],
    placeScopeUnavailableReason: null,
    unavailableReason: null,
  };
}

describe('media item helpers', () => {
  it('adds, patches, and removes object media while preserving one cover', () => {
    const media = fullModulesFixture().media;
    const added = addObjectMediaItem(media);
    expect(added.objectItems).toHaveLength(2);

    const patched = patchObjectMediaItem(added, added.objectItems[1].id, { title: 'Plan PDF', typeCode: 'brochure_pdf', isMain: true });
    expect(patched.objectItems[1].typeLabel).toBe('Brochure PDF');
    expect(patched.objectItems.filter((item) => item.isMain)).toHaveLength(1);

    const removed = removeObjectMediaItem(patched, patched.objectItems[1].id);
    expect(removed.objectItems[0].isMain).toBe(true);
  });
});

describe('createObjectMediaItem', () => {
  it('defaults the new item to the first AUTHORABLE type, not the first catalog entry', () => {
    const created = createObjectMediaItem(moduleWith([]));
    expect(created.typeCode).toBe('photo');
    expect(created.typeId).toBe('mt-photo');
    expect(AUTHORABLE_MEDIA_TYPE_CODES).toContain('photo');
  });
});

describe('removeObjectMediaItem', () => {
  it('reindexes positions after a delete (no stale/duplicate positions)', () => {
    const module = moduleWith([
      item({ id: 'a', position: '0' }),
      item({ id: 'b', position: '1', isMain: false }),
      item({ id: 'c', position: '2', isMain: false }),
    ]);
    const next = removeObjectMediaItem(module, 'b');
    expect(next.objectItems.map((m) => m.id)).toEqual(['a', 'c']);
    expect(next.objectItems.map((m) => m.position)).toEqual(['0', '1']);
  });
});

describe('reorderObjectMediaItems', () => {
  it('materializes the new order into position (the saver persists it verbatim)', () => {
    const a = item({ id: 'a', position: '0' });
    const b = item({ id: 'b', position: '1', isMain: false });
    const c = item({ id: 'c', position: '2', isMain: false });
    const module = moduleWith([a, b, c]);
    const next = reorderObjectMediaItems(module, [c, a, b]);
    expect(next.objectItems.map((m) => m.id)).toEqual(['c', 'a', 'b']);
    expect(next.objectItems.map((m) => m.position)).toEqual(['0', '1', '2']);
  });

  it('does not touch the cover flag on reorder (order ≠ cover)', () => {
    const a = item({ id: 'a', isMain: true });
    const b = item({ id: 'b', isMain: false });
    const next = reorderObjectMediaItems(moduleWith([a, b]), [b, a]);
    expect(next.objectItems.find((m) => m.id === 'a')?.isMain).toBe(true);
    expect(next.objectItems.find((m) => m.id === 'b')?.isMain).toBe(false);
  });
});
