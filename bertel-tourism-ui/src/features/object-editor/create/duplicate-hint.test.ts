import { normalizeName, splitDuplicateMatches } from './duplicate-hint';
import type { ObjectSearchResult } from '../useObjectSearch';

function res(partial: Partial<ObjectSearchResult> & { id: string; name: string }): ObjectSearchResult {
  return {
    type: 'LOI',
    status: 'published',
    city: '',
    code: partial.id,
    card: { id: partial.id, type: 'LOI', name: partial.name },
    ...partial,
  };
}

describe('normalizeName', () => {
  it('strips accents, case and collapses whitespace', () => {
    expect(normalizeName('  Hôtel   des  Cimes ')).toBe('hotel des cimes');
    expect(normalizeName('LA CITÉ du Volcan')).toBe('la cite du volcan');
  });
});

describe('splitDuplicateMatches', () => {
  it('flags exact (accent/case-insensitive) matches and sorts them first', () => {
    const out = splitDuplicateMatches('La Cité du Volcan', [
      res({ id: 'a', name: 'Cité du Volcan - parking' }),
      res({ id: 'b', name: 'la cite du volcan' }),
    ]);
    expect(out[0].id).toBe('b');
    expect(out[0].exact).toBe(true);
    expect(out[1].exact).toBe(false);
  });

  it('marks nothing exact for an empty/whitespace name', () => {
    const out = splitDuplicateMatches('   ', [res({ id: 'a', name: 'Anything' })]);
    expect(out.every((m) => !m.exact)).toBe(true);
  });
});
