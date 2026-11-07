import {
  canCreateLocationReferenceValue,
  filterLocationReferenceOptions,
  resolveLocationReferenceCreateValue,
} from './location-reference-combobox-utils';

describe('location-reference-combobox-utils', () => {
  const options = ['Bras-Long', 'Centre Ville', 'La Plaine des Cafres'];

  it('filters options by normalized substring', () => {
    expect(filterLocationReferenceOptions(options, 'bras')).toEqual(['Bras-Long']);
    expect(filterLocationReferenceOptions(options, 'plaine')).toEqual(['La Plaine des Cafres']);
  });

  it('builds a title-cased create value', () => {
    expect(resolveLocationReferenceCreateValue('  chemin du bel air ')).toBe('Chemin du Bel Air');
  });

  it('allows create when normalized value is new', () => {
    expect(canCreateLocationReferenceValue(options, 'nouveau lieu')).toBe(true);
    expect(canCreateLocationReferenceValue(options, 'bras-long')).toBe(false);
  });
});
