import { stripCombiningMarks, stripDiacritics } from './text-fold';

describe('accent folding without changing the caller’s search policy', () => {
  it.each([
    ['Hôtel à La Réunion', 'Hotel a La Reunion'],
    ['e\u0301', 'e'],
    ['ÉCOLE', 'ECOLE'],
    [' \t Café\n', ' \t Cafe\n'],
    ["L’hôtel d’Œdipe — ﬀ ß 🌋", "L’hotel d’Œdipe — ﬀ ß 🌋"],
    ['', ''],
  ])('folds %p while preserving case, spacing and punctuation', (value, expected) => {
    expect(stripCombiningMarks(value)).toBe(expected);
    expect(stripDiacritics(value)).toBe(expected);
  });

  it('preserves the difference between the basic block and the Unicode diacritic policy', () => {
    const extendedMark = 'a\u1ab0';
    expect(stripCombiningMarks(extendedMark)).toBe(extendedMark);
    expect(stripDiacritics(extendedMark)).toBe('a');
  });
});
