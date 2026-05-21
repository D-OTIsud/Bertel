import { normalizeTagColorVariant } from './object-workspace-parser';

// Pins the color-precedence contract: a per-object override in tag_link.extra
// must win over the global ref_tag.color.
describe('tag color precedence', () => {
  it('prefers tag_link.extra.color_variant over ref_tag.color', () => {
    // resolveTagColor is the helper extracted in Step 3.
    const { resolveTagColor } = require('./object-workspace');
    expect(resolveTagColor({ color: 'teal' }, { color_variant: 'orange' })).toBe('orange');
    expect(resolveTagColor({ color: 'teal' }, {})).toBe('teal');
    expect(resolveTagColor({}, {})).toBe('neutral');
    // normalizeTagColorVariant is exported from the parser (contract assertion).
    expect(normalizeTagColorVariant('orange')).toBe('orange');
  });
});
