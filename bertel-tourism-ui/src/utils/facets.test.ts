import { EXPLORER_BUCKET_TYPE_MAP, EXPLORER_TYPE_CODE_FAMILIES, normalizeExplorerObjectType } from './facets';

describe('explorer type families', () => {
  it('keeps backend-to-family correspondence explicit', () => {
    expect(EXPLORER_TYPE_CODE_FAMILIES.HOT).toEqual(['HOT', 'HPA', 'HLO', 'CAMP', 'RVA']);
    expect(EXPLORER_TYPE_CODE_FAMILIES.ACT).toEqual(['ACT', 'LOI']);
    expect(EXPLORER_TYPE_CODE_FAMILIES.VIS).toEqual(['PCU', 'PNA', 'VIL']);
    expect(EXPLORER_TYPE_CODE_FAMILIES.SRV).toEqual(['COM', 'PSV', 'ASC']);
  });

  it('maps backend codes to the right explorer family', () => {
    expect(normalizeExplorerObjectType('HOT')).toBe('HOT');
    expect(normalizeExplorerObjectType('HLO')).toBe('HOT');
    expect(normalizeExplorerObjectType('ACT')).toBe('ACT');
    expect(normalizeExplorerObjectType('LOI')).toBe('ACT');
    expect(normalizeExplorerObjectType('FMA')).toBe('EVT');
    expect(normalizeExplorerObjectType('PCU')).toBe('VIS');
    expect(normalizeExplorerObjectType('ASC')).toBe('SRV');
  });

  it('keeps the explorer bucket map aligned with the backend type families', () => {
    expect(EXPLORER_BUCKET_TYPE_MAP.ACT).toEqual(EXPLORER_TYPE_CODE_FAMILIES.ACT);
    expect(EXPLORER_BUCKET_TYPE_MAP.HOT).toEqual(EXPLORER_TYPE_CODE_FAMILIES.HOT);
    expect(EXPLORER_BUCKET_TYPE_MAP.SRV).toEqual(EXPLORER_TYPE_CODE_FAMILIES.SRV);
  });
});
