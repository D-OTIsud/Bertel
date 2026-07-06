import { toRankedLabelSchemeValues } from './explorer-reference';

describe('toRankedLabelSchemeValues', () => {
  it('groups grade values by scheme code, sorted ascending, numeric-aware', () => {
    const rows = [
      { code: '3', name: '3 étoiles', position: null, scheme: { code: 'hot_stars' } },
      { code: '1', name: '1 étoile', position: null, scheme: { code: 'hot_stars' } },
      { code: '5', name: '5 étoiles', position: null, scheme: { code: 'hot_stars' } },
      { code: 'granted', name: 'Obtenu', position: null, scheme: { code: 'LBL_CLEF_VERTE' } },
    ];
    const out = toRankedLabelSchemeValues(rows);
    expect(out.hot_stars.map((v) => v.code)).toEqual(['1', '3', '5']);
    expect(out.hot_stars[0]).toEqual({ code: '1', name: '1 étoile' });
    expect(out.LBL_CLEF_VERTE.map((v) => v.code)).toEqual(['granted']);
  });

  it('drops rows without a scheme code or value code', () => {
    const out = toRankedLabelSchemeValues([
      { code: '', name: 'x', position: null, scheme: { code: 'hot_stars' } },
      { code: '2', name: '2 étoiles', position: null, scheme: null },
    ]);
    expect(out).toEqual({});
  });
});
