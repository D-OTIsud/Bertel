import { shapeDistinctionValues, dedupeAmenityFamilies } from './dashboard-reference';

describe('dashboard-reference — mise en forme', () => {
  it('ne garde que les valeurs des schemes is_distinction et aplatit', () => {
    const rows = [
      { code: '4', name: '4 étoiles', scheme: { code: 'hot_stars', name: 'Étoiles hôtel', is_distinction: true } },
      { code: 'x', name: 'Interne', scheme: { code: 'internal', name: 'Interne', is_distinction: false } },
      { code: 'y', name: 'Orphelin', scheme: null },
    ];
    expect(shapeDistinctionValues(rows)).toEqual([
      { schemeCode: 'hot_stars', schemeName: 'Étoiles hôtel', valueCode: '4', valueName: '4 étoiles' },
    ]);
  });

  it('dédoublonne les familles et trie par nom', () => {
    const rows = [
      { family: { code: 'wellness', name: 'Bien-être' } },
      { family: { code: 'wellness', name: 'Bien-être' } },
      { family: { code: 'access', name: 'Accessibilité' } },
      { family: null },
    ];
    expect(dedupeAmenityFamilies(rows)).toEqual([
      { code: 'access', label: 'Accessibilité' },
      { code: 'wellness', label: 'Bien-être' },
    ]);
  });
});
