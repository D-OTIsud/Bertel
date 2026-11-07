import { formatCoordString, parseCoordString } from './location-coords';

describe('location-coords', () => {
  it('parses comma and dot decimals', () => {
    expect(parseCoordString('-21,130568')).toBeCloseTo(-21.130568);
    expect(parseCoordString('55.536384')).toBeCloseTo(55.536384);
  });

  it('formats to six decimals', () => {
    expect(formatCoordString(-21.13)).toBe('-21.130000');
  });
});
