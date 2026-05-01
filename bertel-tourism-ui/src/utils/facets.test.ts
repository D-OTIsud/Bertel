import type { ExplorerFilters, ObjectCard } from '../types/domain';
import {
  applyClientPreviewFilters,
  DEFAULT_EXPLORER_FILTERS,
  EXPLORER_BUCKET_TYPE_MAP,
  EXPLORER_TYPE_CODE_FAMILIES,
  normalizeExplorerObjectType,
} from './facets';

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

function buildFilters(overrides: Partial<ExplorerFilters> = {}): ExplorerFilters {
  return {
    ...DEFAULT_EXPLORER_FILTERS,
    common: {
      ...DEFAULT_EXPLORER_FILTERS.common,
      ...overrides.common,
    },
    hot: {
      ...DEFAULT_EXPLORER_FILTERS.hot,
      ...overrides.hot,
    },
    res: {
      ...DEFAULT_EXPLORER_FILTERS.res,
      ...overrides.res,
    },
    iti: {
      ...DEFAULT_EXPLORER_FILTERS.iti,
      ...overrides.iti,
    },
    act: {
      ...DEFAULT_EXPLORER_FILTERS.act,
      ...overrides.act,
    },
    selectedBuckets: overrides.selectedBuckets ?? DEFAULT_EXPLORER_FILTERS.selectedBuckets,
    vis: overrides.vis ?? DEFAULT_EXPLORER_FILTERS.vis,
    srv: overrides.srv ?? DEFAULT_EXPLORER_FILTERS.srv,
  };
}

function makeCard(input: Partial<ObjectCard> & Pick<ObjectCard, 'id' | 'type' | 'name'>): ObjectCard {
  return {
    status: 'published',
    labels: [],
    open_now: true,
    location: { lat: 45.0, lon: 6.0, city: 'Annecy', lieu_dit: 'Centre', address: 'Rue du Lac' },
    ...input,
  };
}

describe('applyClientPreviewFilters', () => {
  it('filters by selected bucket', () => {
    const cards = [
      makeCard({ id: 'hot-1', type: 'HOT', name: 'Hotel' }),
      makeCard({ id: 'res-1', type: 'RES', name: 'Restaurant' }),
    ];
    const filters = buildFilters({ selectedBuckets: ['RES'] });

    const result = applyClientPreviewFilters(cards, filters);
    expect(result.map((card) => card.id)).toEqual(['res-1']);
  });

  it('matches search text accent-insensitively', () => {
    const cards = [makeCard({ id: 'evt-1', type: 'FMA', name: 'Evenement musical' })];
    const filters = buildFilters({ common: { ...DEFAULT_EXPLORER_FILTERS.common, search: 'événement' } });

    const result = applyClientPreviewFilters(cards, filters);
    expect(result).toHaveLength(1);
  });

  it('filters cities case-insensitively', () => {
    const cards = [
      makeCard({ id: 'a', type: 'HOT', name: 'A', location: { city: 'Annecy' } }),
      makeCard({ id: 'b', type: 'HOT', name: 'B', location: { city: 'Lyon' } }),
    ];
    const filters = buildFilters({ common: { ...DEFAULT_EXPLORER_FILTERS.common, cities: ['annecy'] } });

    const result = applyClientPreviewFilters(cards, filters);
    expect(result.map((card) => card.id)).toEqual(['a']);
  });

  it('keeps only open cards when openNow is enabled', () => {
    const cards = [
      makeCard({ id: 'open', type: 'HOT', name: 'Open', open_now: true }),
      makeCard({ id: 'closed', type: 'HOT', name: 'Closed', open_now: false }),
    ];
    const filters = buildFilters({ common: { ...DEFAULT_EXPLORER_FILTERS.common, openNow: true } });

    const result = applyClientPreviewFilters(cards, filters);
    expect(result.map((card) => card.id)).toEqual(['open']);
  });

  it('excludes cards without coordinates when bbox is active', () => {
    const cards = [
      makeCard({ id: 'in', type: 'HOT', name: 'In bounds', location: { lat: 45.1, lon: 6.1 } }),
      makeCard({ id: 'missing', type: 'HOT', name: 'No coords', location: { city: 'Annecy' } }),
    ];
    const filters = buildFilters({ common: { ...DEFAULT_EXPLORER_FILTERS.common, bbox: [5.9, 45.0, 6.2, 45.2] } });

    const result = applyClientPreviewFilters(cards, filters);
    expect(result.map((card) => card.id)).toEqual(['in']);
  });

  it('filters using polygon membership', () => {
    const cards = [
      makeCard({ id: 'inside', type: 'HOT', name: 'Inside', location: { lat: 45.05, lon: 6.05 } }),
      makeCard({ id: 'outside', type: 'HOT', name: 'Outside', location: { lat: 45.3, lon: 6.3 } }),
    ];
    const filters = buildFilters({
      common: {
        ...DEFAULT_EXPLORER_FILTERS.common,
        polygon: {
          type: 'Polygon',
          coordinates: [
            [
              [6.0, 45.0],
              [6.2, 45.0],
              [6.2, 45.2],
              [6.0, 45.2],
              [6.0, 45.0],
            ],
          ],
        },
      },
    });

    const result = applyClientPreviewFilters(cards, filters);
    expect(result.map((card) => card.id)).toEqual(['inside']);
  });

  it('keeps server-only filters as no-op in preview', () => {
    const cards = [makeCard({ id: 'one', type: 'HOT', name: 'One' })];
    const filters = buildFilters({
      common: { ...DEFAULT_EXPLORER_FILTERS.common, pmr: true },
      hot: { ...DEFAULT_EXPLORER_FILTERS.hot, capacityFilters: [{ code: 'beds', min: 2 }] },
      iti: { ...DEFAULT_EXPLORER_FILTERS.iti, distanceMinKm: 5 },
    });

    const result = applyClientPreviewFilters(cards, filters);
    expect(result.map((card) => card.id)).toEqual(['one']);
  });
});
