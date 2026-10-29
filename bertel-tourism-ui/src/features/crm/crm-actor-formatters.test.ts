import type { GeocodeHit } from '../object-editor/widgets/geocode-address';
import {
  composeActorAddressValue,
  composeDisplayName,
  formatActorAddressFromHit,
  parseActorAddressValue,
} from './crm-actor-formatters';

describe('actor address field formatting', () => {
  it.each([
    ['', { address1: '', postcode: '', city: '' }],
    [' \t\n', { address1: '', postcode: '', city: '' }],
    [' 38\tChemin  Dijoux, 97414  Entre-Deux ', { address1: '38 Chemin Dijoux', postcode: '97414', city: 'Entre-Deux' }],
    ['38 Chemin 97414 Entre-Deux', { address1: '38 Chemin', postcode: '97414', city: 'Entre-Deux' }],
    ['38 Chemin, 97414 Entre-Deux, Réunion', { address1: '38 Chemin', postcode: '97414', city: 'Entre-Deux, Réunion' }],
    ['97410 Saint-Pierre', { address1: '97410 Saint-Pierre', postcode: '', city: '' }],
    ['38 Chemin, 97414', { address1: '38 Chemin, 97414', postcode: '', city: '' }],
    ['38 Chemin 9741 Entre-Deux', { address1: '38 Chemin 9741 Entre-Deux', postcode: '', city: '' }],
  ] as const)('preserves structured and unstructured parsing for %p', (value, expected) => {
    expect(parseActorAddressValue(value)).toEqual(expected);
    expect(Object.keys(parseActorAddressValue(value))).toEqual(['address1', 'postcode', 'city']);
  });

  it('collapses address whitespace without validating or completing missing components', () => {
    expect(composeActorAddressValue({ address1: ' 38\tChemin  Dijoux ', postcode: '97414', city: ' Entre-Deux ' }))
      .toBe('38 Chemin Dijoux, 97414 Entre-Deux');
    expect(composeActorAddressValue({ address1: '', postcode: '97414', city: 'Entre-Deux' })).toBe('97414 Entre-Deux');
    expect(composeActorAddressValue({ address1: 'Street', postcode: '9741', city: '' })).toBe('Street, 9741');
    expect(composeActorAddressValue({ address1: 'Street', postcode: '', city: '' })).toBe('Street');
    expect(composeActorAddressValue({ address1: ' ', postcode: '', city: ' \t' })).toBe('');
  });

  it('reads only BAN street/postcode/city, preserving getter order and leaving geocoding policy to the caller', () => {
    const reads: string[] = [];
    const values = { name: ' 38\tChemin Dijoux ', postcode: '97414', city: ' Entre-Deux ' };
    const hit = new Proxy(values, {
      get(target, key) {
        reads.push(String(key));
        if (!(key in target)) throw new Error('Coordinates, confidence and label are not formatter inputs');
        return target[key as keyof typeof target];
      },
    }) as GeocodeHit;
    expect(formatActorAddressFromHit(hit)).toBe('38 Chemin Dijoux, 97414 Entre-Deux');
    expect(reads).toEqual(['name', 'postcode', 'city']);
  });

  it('keeps compose-field read order rather than normalizing the source object in advance', () => {
    const reads: string[] = [];
    const address = new Proxy({ address1: 'Street', postcode: '97414', city: 'Town' }, {
      get(target, key) { reads.push(String(key)); return target[key as keyof typeof target]; },
    });
    expect(composeActorAddressValue(address)).toBe('Street, 97414 Town');
    expect(reads).toEqual(['address1', 'postcode', 'city']);
  });
});

describe('actor display name formatting', () => {
  it.each([
    [' Mme ', ' Jo  Anne ', ' Le   Bon ', 'Mme Jo  Anne Le   Bon'],
    ['', '', ' Association  du Sud ', 'Association  du Sud'],
    ['M.', '', ' Lebon ', 'M. Lebon'],
    ['\u00a0Mme\u00a0', '\tÉlise\n', 'Payet', 'Mme Élise Payet'],
    [' ', '\t', '\n', ''],
  ])('trims name boundaries while retaining internal spacing and text: %p/%p/%p', (gender, firstName, lastName, expected) => {
    expect(composeDisplayName(gender, firstName, lastName)).toBe(expected);
  });
});
