import { formatLocationAddress } from './crm';

describe('formatLocationAddress', () => {
  test('joins street, complement, lieu-dit and city line', () => {
    expect(
      formatLocationAddress({
        address1: '12 rue des Lataniers',
        address1_suite: 'Bât. B',
        address2: '',
        address3: 'Résidence Bel Air',
        postcode: '97410',
        city: 'Saint-Pierre',
        lieu_dit: 'Terre Rouge',
      }),
    ).toBe('12 rue des Lataniers Bât. B, Résidence Bel Air, Terre Rouge, 97410 Saint-Pierre');
  });

  test('omits empty parts and trims', () => {
    expect(
      formatLocationAddress({ address1: '  Plage de Grande Anse ', city: 'Petite-Île', postcode: null }),
    ).toBe('Plage de Grande Anse, Petite-Île');
  });

  test('returns empty string when nothing is set', () => {
    expect(formatLocationAddress({})).toBe('');
  });
});
