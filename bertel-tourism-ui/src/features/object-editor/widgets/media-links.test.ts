import {
  addMediaLink,
  removeMediaLink,
  resolveMediaLinks,
  availableMediaLinks,
  isImageUrl,
  isVideoUrl,
} from './media-links';
import type { WorkspaceMediaOption } from '../../../services/object-workspace-parser';

const opts: WorkspaceMediaOption[] = [
  { id: 'a', code: 'a', label: 'Photo A', url: 'https://cdn/a.jpg' },
  { id: 'b', code: 'b', label: 'Photo B', url: 'https://cdn/b.jpg' },
  { id: 'c', code: 'c', label: 'Photo C', url: 'https://cdn/c.jpg' },
];

describe('media-links helpers', () => {
  it('addMediaLink appends once, preserving order', () => {
    expect(addMediaLink(['a'], 'b')).toEqual(['a', 'b']);
    expect(addMediaLink(['a', 'b'], 'a')).toEqual(['a', 'b']); // no duplicate
  });

  it('removeMediaLink drops the id and is a no-op for an absent id', () => {
    expect(removeMediaLink(['a', 'b', 'c'], 'b')).toEqual(['a', 'c']);
    expect(removeMediaLink(['a'], 'x')).toEqual(['a']);
  });

  it('resolveMediaLinks returns linked options in link order, skipping stale ids', () => {
    expect(resolveMediaLinks(['c', 'a'], opts).map((o) => o.id)).toEqual(['c', 'a']);
    expect(resolveMediaLinks(['a', 'gone'], opts).map((o) => o.id)).toEqual(['a']); // stale link dropped
  });

  it('availableMediaLinks returns object media not yet linked', () => {
    expect(availableMediaLinks(['b'], opts).map((o) => o.id)).toEqual(['a', 'c']);
    expect(availableMediaLinks(['a', 'b', 'c'], opts)).toEqual([]); // all linked
  });

  it('isImageUrl / isVideoUrl classify by extension, tolerating query/hash suffixes', () => {
    expect(isImageUrl('https://cdn/x.JPG?v=2')).toBe(true);
    expect(isImageUrl('https://cdn/x.webp')).toBe(true);
    expect(isImageUrl('https://cdn/x.mp4')).toBe(false);
    expect(isVideoUrl('https://cdn/x.mov#t=1')).toBe(true);
    expect(isVideoUrl('https://cdn/x.jpg')).toBe(false);
  });
});
