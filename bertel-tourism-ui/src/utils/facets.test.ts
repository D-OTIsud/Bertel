import type { ExplorerFilters, ObjectCard } from '../types/domain';
import {
  applyClientPreviewFilters,
  buildBucketRpcFilters,
  DEFAULT_EXPLORER_FILTERS,
  EXPLORER_BUCKET_TYPE_MAP,
  EXPLORER_TYPE_CODE_FAMILIES,
  hasServerOnlyFilters,
  normalizeExplorerObjectType,
  normalizeExplorerFilters,
  sortExplorerCards,
} from './facets';

describe('normalizeExplorerFilters', () => {
  it('fills missing accessibility and sustainability arrays from legacy snapshots', () => {
    const normalized = normalizeExplorerFilters({
      common: {
        search: 'hotel',
        cities: ['Saint-Pierre'],
      } as ExplorerFilters['common'],
    });

    expect(normalized.common.accessibilityDisabilityTypesAny).toEqual([]);
    expect(normalized.common.accessibilityAmenityCodesAny).toEqual([]);
    expect(normalized.common.sustainabilityCategoryCodesAny).toEqual([]);
    expect(normalized.common.sustainabilityActionCodesAny).toEqual([]);
    expect(normalized.common.rankedLabelSchemeCode).toBeNull();
  });
});

describe('explorer type families', () => {
  it('keeps backend-to-family correspondence explicit', () => {
    expect(EXPLORER_TYPE_CODE_FAMILIES.HOT).toEqual(['HOT', 'HPA', 'HLO', 'CAMP', 'RVA']);
    expect(EXPLORER_TYPE_CODE_FAMILIES.ACT).toEqual(['ACT', 'LOI']);
    expect(EXPLORER_TYPE_CODE_FAMILIES.VIS).toEqual(['PCU', 'PNA', 'VIL', 'PRD']);
    expect(EXPLORER_TYPE_CODE_FAMILIES.SRV).toEqual(['COM', 'PSV', 'ASC', 'SPU']);
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

describe('hasServerOnlyFilters', () => {
  it('is false for default explorer filters', () => {
    expect(hasServerOnlyFilters(DEFAULT_EXPLORER_FILTERS)).toBe(false);
  });

  it('detects pmr and pets', () => {
    expect(hasServerOnlyFilters(buildFilters({ common: { ...DEFAULT_EXPLORER_FILTERS.common, pmr: true } }))).toBe(true);
    expect(hasServerOnlyFilters(buildFilters({ common: { ...DEFAULT_EXPLORER_FILTERS.common, petsAccepted: true } }))).toBe(
      true,
    );
  });

  it('detects accessibility detail and sustainability filters', () => {
    expect(
      hasServerOnlyFilters(
        buildFilters({
          common: {
            ...DEFAULT_EXPLORER_FILTERS.common,
            accessibilityDisabilityTypesAny: ['motor'],
          },
        }),
      ),
    ).toBe(true);
    expect(
      hasServerOnlyFilters(
        buildFilters({
          common: {
            ...DEFAULT_EXPLORER_FILTERS.common,
            sustainable: true,
          },
        }),
      ),
    ).toBe(true);
    expect(
      hasServerOnlyFilters(
        buildFilters({
          common: {
            ...DEFAULT_EXPLORER_FILTERS.common,
            sustainabilityActionCodesAny: ['MA_SORTING_BINS'],
          },
        }),
      ),
    ).toBe(true);
  });

  it('detects ranked label search', () => {
    expect(
      hasServerOnlyFilters(
        buildFilters({
          common: {
            ...DEFAULT_EXPLORER_FILTERS.common,
            rankedLabelSchemeCode: 'LBL_CLEF_VERTE',
          },
        }),
      ),
    ).toBe(true);
  });

  it('detects HOT taxonomy, capacity, and meeting room', () => {
    expect(
      hasServerOnlyFilters(
        buildFilters({
          hot: {
            ...DEFAULT_EXPLORER_FILTERS.hot,
            taxonomy: [{ domain: 'taxonomy_hot', code: 'X' }],
          },
        }),
      ),
    ).toBe(true);
    expect(
      hasServerOnlyFilters(
        buildFilters({
          hot: { ...DEFAULT_EXPLORER_FILTERS.hot, capacityFilters: [{ code: 'beds', min: 1 }] },
        }),
      ),
    ).toBe(true);
    expect(
      hasServerOnlyFilters(
        buildFilters({
          hot: { ...DEFAULT_EXPLORER_FILTERS.hot, meetingRoom: { minCount: 1 } },
        }),
      ),
    ).toBe(true);
  });

  it('detects RES capacity filters', () => {
    expect(
      hasServerOnlyFilters(
        buildFilters({
          res: { capacityFilters: [{ code: 'covers', min: 10 }] },
        }),
      ),
    ).toBe(true);
  });

  it('detects ITI filters', () => {
    expect(hasServerOnlyFilters(buildFilters({ iti: { ...DEFAULT_EXPLORER_FILTERS.iti, isLoop: true } }))).toBe(true);
    expect(
      hasServerOnlyFilters(buildFilters({ iti: { ...DEFAULT_EXPLORER_FILTERS.iti, difficultyMin: 1 } })),
    ).toBe(true);
    expect(
      hasServerOnlyFilters(buildFilters({ iti: { ...DEFAULT_EXPLORER_FILTERS.iti, distanceMinKm: 1 } })),
    ).toBe(true);
    expect(
      hasServerOnlyFilters(buildFilters({ iti: { ...DEFAULT_EXPLORER_FILTERS.iti, durationMaxH: 2 } })),
    ).toBe(true);
    expect(
      hasServerOnlyFilters(buildFilters({ iti: { ...DEFAULT_EXPLORER_FILTERS.iti, practicesAny: ['trail'] } })),
    ).toBe(true);
  });

  it('detects ACT environment tags', () => {
    expect(
      hasServerOnlyFilters(
        buildFilters({
          act: { environmentTagsAny: ['forest'] },
        }),
      ),
    ).toBe(true);
  });

  it('detects tag filters', () => {
    expect(
      hasServerOnlyFilters(
        buildFilters({
          common: { ...DEFAULT_EXPLORER_FILTERS.common, tagsAny: [{ slug: 'wellness', name: 'Bien-être' }] },
        }),
      ),
    ).toBe(true);
  });
});

describe('buildBucketRpcFilters', () => {
  it('emits search_mode=global by default when a search term is present (Explorer)', () => {
    const filters = buildFilters({
      common: { ...DEFAULT_EXPLORER_FILTERS.common, search: 'jacuzzi' },
    });
    expect(buildBucketRpcFilters(filters, 'all').search_mode).toBe('global');
  });

  it('does NOT broaden when searchScope=name (editor object pickers)', () => {
    const filters = buildFilters({
      common: { ...DEFAULT_EXPLORER_FILTERS.common, search: 'jacuzzi', searchScope: 'name' },
    });
    expect(buildBucketRpcFilters(filters, 'all')).not.toHaveProperty('search_mode');
  });

  it('does not emit search_mode when there is no search term', () => {
    const filters = buildFilters({
      common: { ...DEFAULT_EXPLORER_FILTERS.common, search: '   ' },
    });
    expect(buildBucketRpcFilters(filters, 'all')).not.toHaveProperty('search_mode');
  });

  it('uses the canonical accessibility family for broad PMR filtering', () => {
    const filters = buildFilters({
      common: { ...DEFAULT_EXPLORER_FILTERS.common, pmr: true },
    });

    expect(buildBucketRpcFilters(filters, 'HOT')).toMatchObject({
      amenity_families_any: ['accessibility'],
    });
    expect(buildBucketRpcFilters(filters, 'HOT')).not.toHaveProperty('amenities_any', ['wheelchair_access']);
  });

  it('adds disability types and precise amenities when selected', () => {
    const filters = buildFilters({
      common: {
        ...DEFAULT_EXPLORER_FILTERS.common,
        pmr: true,
        accessibilityDisabilityTypesAny: ['motor', 'hearing'],
        accessibilityAmenityCodesAny: ['acc_step_removal'],
      },
    });

    expect(buildBucketRpcFilters(filters, 'HOT')).toMatchObject({
      disability_types_any: ['motor', 'hearing'],
      amenities_any: ['acc_step_removal'],
    });
  });

  it('adds broad and detailed sustainability filters', () => {
    expect(
      buildBucketRpcFilters(
        buildFilters({
          common: { ...DEFAULT_EXPLORER_FILTERS.common, sustainable: true },
        }),
        'ACT',
      ),
    ).toMatchObject({ sustainability_any: true });

    expect(
      buildBucketRpcFilters(
        buildFilters({
          common: {
            ...DEFAULT_EXPLORER_FILTERS.common,
            sustainable: true,
            sustainabilityCategoryCodesAny: ['CAT_WASTE'],
            sustainabilityActionCodesAny: ['MA_SORTING_BINS'],
          },
        }),
        'ACT',
      ),
    ).toMatchObject({
      sustainability_categories_any: ['CAT_WASTE'],
      sustainability_actions_any: ['MA_SORTING_BINS'],
    });
  });

  it('sends ranked label scheme searches to the Explorer RPC', () => {
    const filters = buildFilters({
      common: {
        ...DEFAULT_EXPLORER_FILTERS.common,
        rankedLabelSchemeCode: 'LBL_CLEF_VERTE',
      },
    });

    expect(buildBucketRpcFilters(filters, 'HOT')).toMatchObject({
      label_scheme_ranked: 'LBL_CLEF_VERTE',
    });
  });

  it('sends selected tag slugs as tags_any for every bucket', () => {
    const filters = buildFilters({
      common: {
        ...DEFAULT_EXPLORER_FILTERS.common,
        tagsAny: [
          { slug: 'wellness', name: 'Bien-être' },
          { slug: 'panorama', name: 'Panorama' },
        ],
      },
    });

    expect(buildBucketRpcFilters(filters, 'HOT')).toMatchObject({ tags_any: ['wellness', 'panorama'] });
    expect(buildBucketRpcFilters(filters, 'ACT')).toMatchObject({ tags_any: ['wellness', 'panorama'] });
  });

  it('omits tags_any when no tags are selected', () => {
    expect(buildBucketRpcFilters(DEFAULT_EXPLORER_FILTERS, 'HOT')).not.toHaveProperty('tags_any');
  });

  it('sends both certified and equipment family filters for ranked Tourisme & Handicap', () => {
    const filters = buildFilters({
      common: {
        ...DEFAULT_EXPLORER_FILTERS.common,
        pmr: true,
        rankedLabelSchemeCode: 'LBL_TOURISME_HANDICAP',
        accessibilityDisabilityTypesAny: ['motor', 'visual'],
      },
    });

    expect(buildBucketRpcFilters(filters, 'HOT')).toMatchObject({
      label_scheme_ranked: 'LBL_TOURISME_HANDICAP',
      label_disability_types_any: ['motor', 'visual'],
      disability_types_any: ['motor', 'visual'],
    });
  });
});

describe('sortExplorerCards', () => {
  it('keeps certified ranked label results ahead of evidence-only results', () => {
    const cards = [
      makeCard({
        id: 'evidence',
        type: 'HOT',
        name: 'A evidence',
        label_match: { scheme_code: 'LBL_CLEF_VERTE', rank: 1, source: 'sustainability_action', evidence_count: 2 },
      }),
      makeCard({
        id: 'certified',
        type: 'HOT',
        name: 'Z certified',
        label_match: { scheme_code: 'LBL_CLEF_VERTE', rank: 0, source: 'certified_label', evidence_count: 1 },
      }),
    ];

    expect(sortExplorerCards(cards).map((card) => card.id)).toEqual(['certified', 'evidence']);
  });
});
