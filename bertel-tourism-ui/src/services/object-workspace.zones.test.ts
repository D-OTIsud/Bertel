import { buildZonesPayload } from './object-workspace';

/**
 * §41 zones — the pure payload builder for api.save_object_places({zones}). Maps the
 * selected INSEE commune codes to ordered {insee_commune, position} rows; dedupes; drops blanks.
 */
describe('buildZonesPayload', () => {
  it('maps codes to ordered {insee_commune, position}', () => {
    expect(buildZonesPayload(['97422', '97412'])).toEqual([
      { insee_commune: '97422', position: 0 },
      { insee_commune: '97412', position: 1 },
    ]);
  });

  it('is empty for no selected communes', () => {
    expect(buildZonesPayload([])).toEqual([]);
  });

  it('dedupes repeated codes and drops blanks', () => {
    expect(buildZonesPayload(['97422', '97422', ' ', ''])).toEqual([
      { insee_commune: '97422', position: 0 },
    ]);
  });
});
