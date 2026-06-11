import { buildDescriptionPayload } from './object-workspace';
import { parseObjectWorkspace } from './object-workspace-parser';

const field = (base = '') => ({ baseValue: base, values: {} as Record<string, string> });

function scope(visibility: string) {
  return {
    recordId: 'd1',
    scope: 'object' as const,
    placeId: null,
    label: 'Objet',
    visibility,
    description: field('Texte'),
    chapo: field(),
    adaptedDescription: field(),
    mobileDescription: field(),
    editorialDescription: field(),
  };
}

describe('buildDescriptionPayload — visibility honesty', () => {
  it('passes an explicit visibility through', () => {
    expect(buildDescriptionPayload(scope('partners')).visibility).toBe('partners');
  });

  it('keeps an unset visibility NULL instead of coercing it to public', () => {
    // A NULL-visibility row is extended-scope-only under the 8t read gate; a blind
    // 'public' default on save would silently widen it to anon once published.
    expect(buildDescriptionPayload(scope('')).visibility).toBeNull();
  });
});

describe('parseObjectWorkspace — description visibility', () => {
  it('does not default a missing canonical visibility to public', () => {
    const modules = parseObjectWorkspace(
      {
        id: 'o1',
        name: 'Objet test',
        raw: { canonical_description: { id: 'd1', description: 'Texte', visibility: null } },
      } as never,
      ['fr'],
    );
    expect(modules.descriptions.object.visibility).toBe('');
  });

  it('keeps an explicit visibility', () => {
    const modules = parseObjectWorkspace(
      {
        id: 'o1',
        name: 'Objet test',
        raw: { canonical_description: { id: 'd1', description: 'Texte', visibility: 'public' } },
      } as never,
      ['fr'],
    );
    expect(modules.descriptions.object.visibility).toBe('public');
  });
});
