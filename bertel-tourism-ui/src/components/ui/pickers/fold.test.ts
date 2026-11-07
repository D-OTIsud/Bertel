import { fold } from './fold';

describe('fold', () => {
  it('lowercases', () => {
    expect(fold('Montagne')).toBe('montagne');
  });
  it('strips diacritics so "foret" matches "Forêt"', () => {
    expect(fold('Forêt')).toBe('foret');
  });
  it('handles multiple accents', () => {
    expect(fold('Île à thé')).toBe('ile a the');
  });
  it('is idempotent on ASCII', () => {
    expect(fold('wifi')).toBe('wifi');
  });
});
