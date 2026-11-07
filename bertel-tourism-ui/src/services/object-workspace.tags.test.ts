import { normalizeTagColor, DEFAULT_TAG_COLOR } from './object-workspace-parser';

// Color is GLOBAL per tag (ref_tag.color, a hex #rrggbb). There is NO per-object override:
// normalizeTagColor validates the hex and falls back to the neutral slate default. The old
// named-variant set ('teal'/'orange'/…) was UI-fallback fiction — 100% of live ref_tag.color is hex.
describe('tag color (hex, global per tag)', () => {
  it('normalizes a valid hex (trimmed + lowercased) and falls back to the slate default otherwise', () => {
    expect(normalizeTagColor('#14B8A6')).toBe('#14b8a6');
    expect(normalizeTagColor('#0ea5e9')).toBe('#0ea5e9');
    expect(normalizeTagColor('  #ABCDEF ')).toBe('#abcdef');
    expect(normalizeTagColor('teal')).toBe(DEFAULT_TAG_COLOR); // named-variant fiction -> default
    expect(normalizeTagColor('#123')).toBe(DEFAULT_TAG_COLOR); // short hex -> default
    expect(normalizeTagColor(undefined)).toBe(DEFAULT_TAG_COLOR);
    expect(normalizeTagColor(null)).toBe(DEFAULT_TAG_COLOR);
    expect(DEFAULT_TAG_COLOR).toBe('#64748b');
  });

  it('is re-exported from the object-workspace entry point', () => {
    const { normalizeTagColor: reexported } = require('./object-workspace');
    expect(reexported('#14b8a6')).toBe('#14b8a6');
  });
});
