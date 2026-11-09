import { buildBucketRpcFilters, DEFAULT_EXPLORER_FILTERS, normalizeExplorerFilters, canMergeExplorerBuckets } from './facets';
import { buildSearchParams, parseSearchParams } from '../lib/explorer-search-params';
import { createExplorerStore } from '../store/explorer-store';
import { buildExplorerActiveChips } from '../components/explorer/explorer-active-chips';

describe('restaurant cuisine criteria end to end', () => {
  it('round trips and scopes the structured codes to the RES branch', () => {
    const f = normalizeExplorerFilters({ ...DEFAULT_EXPLORER_FILTERS, selectedBuckets: ['RES', 'ACT'],
      res: { ...DEFAULT_EXPLORER_FILTERS.res, cuisineTypesAny: ['creole', 'indian', 'creole'] } });
    const restored = normalizeExplorerFilters({ ...f, ...parseSearchParams(buildSearchParams(f)) });
    expect(restored.res.cuisineTypesAny).toEqual(['creole', 'indian']);
    expect(buildBucketRpcFilters(restored, 'RES').cuisine_types_any).toEqual(['creole', 'indian']);
    expect(buildBucketRpcFilters(restored, 'ACT')).not.toHaveProperty('cuisine_types_any');
    expect(canMergeExplorerBuckets(restored)).toBe(false);
    expect(buildExplorerActiveChips(restored).some((c) => c.group === 'resCuisine')).toBe(true);
  });
  it('keeps independent editing stores and clears cuisine when deselecting Restaurants', () => {
    const a = createExplorerStore(); const b = createExplorerStore();
    a.getState().toggleBucket('RES');
    a.getState().setResCuisineTypes(['creole']);
    expect(b.getState().res.cuisineTypesAny).toEqual([]);
    a.getState().toggleBucket('RES');
    expect(a.getState().res.cuisineTypesAny).toEqual([]);
    expect(buildBucketRpcFilters(a.getState(), 'RES')).not.toHaveProperty('cuisine_types_any');
  });
  it('restores old saved states without introducing a cuisine constraint', () => {
    const f = normalizeExplorerFilters({ ...DEFAULT_EXPLORER_FILTERS, res: { capacityFilters: [] } });
    expect(f.res.cuisineTypesAny).toEqual([]);
    expect(buildBucketRpcFilters(f, 'RES')).not.toHaveProperty('cuisine_types_any');
  });
});
