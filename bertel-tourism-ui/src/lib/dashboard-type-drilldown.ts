import type { BackendObjectTypeCode, ExplorerBucketKey, ExplorerFilters } from '../types/domain';
import { EXPLORER_BUCKET_TYPE_MAP, getEffectiveBackendTypesForBucket } from '../utils/facets';
import type { useDashboardExplorerStore } from '../store/explorer-store';

type DashStore = typeof useDashboardExplorerStore;

/** Reverse EXPLORER_BUCKET_TYPE_MAP: which bucket family contains this object-type. */
export function bucketForBackendType(type: BackendObjectTypeCode): ExplorerBucketKey | null {
  for (const [bucket, types] of Object.entries(EXPLORER_BUCKET_TYPE_MAP) as [ExplorerBucketKey, BackendObjectTypeCode[]][]) {
    if (types.includes(type)) return bucket;
  }
  return null;
}

/** Assemble ExplorerFilters from the store state slices (same shape the mapper/FiltersPanel use). */
function filtersFromState(state: ReturnType<DashStore['getState']>): ExplorerFilters {
  return {
    selectedBuckets: state.selectedBuckets,
    common: state.common,
    hot: state.hot, iti: state.iti, res: state.res, evt: state.evt, vis: state.vis, srv: state.srv,
  } as ExplorerFilters;
}

/** Object-types the dashboard filter currently pins = union of effective types over selected buckets.
 *  Exactly the p_types the stats RPC receives, so it is the correct highlight source. Empty when no bucket selected. */
export function activeDrilldownTypes(state: ReturnType<DashStore['getState']>): BackendObjectTypeCode[] {
  const filters = filtersFromState(state);
  const out = new Set<BackendObjectTypeCode>();
  for (const bucket of state.selectedBuckets) {
    for (const t of getEffectiveBackendTypesForBucket(filters, bucket)) out.add(t);
  }
  return [...out];
}

/** Toggle one object-type in the dashboard filter, mapping it onto bucket + subtype. */
export function toggleDrilldownType(store: DashStore, type: BackendObjectTypeCode): void {
  const bucket = bucketForBackendType(type);
  if (!bucket) return;
  const state = store.getState();
  const isActive = activeDrilldownTypes(state).includes(type);

  if (bucket === 'HOT' || bucket === 'VIS' || bucket === 'SRV') {
    const setSubtypes = bucket === 'HOT' ? state.setHotSubtypes : bucket === 'VIS' ? state.setVisSubtypes : state.setSrvSubtypes;
    const filters = filtersFromState(state);
    const currentEffective = state.selectedBuckets.includes(bucket) ? getEffectiveBackendTypesForBucket(filters, bucket) : [];
    const next = isActive ? currentEffective.filter((t) => t !== type) : [...currentEffective, type];
    if (next.length === 0) {
      // removing the last type of the family → deselect the bucket + reset its subtypes to default
      if (state.selectedBuckets.includes(bucket)) state.toggleBucket(bucket);
      setSubtypes([]); // empty → default (clean state for a future re-select)
    } else {
      if (!state.selectedBuckets.includes(bucket)) state.toggleBucket(bucket); // ensure family selected
      setSubtypes(next);
    }
  } else {
    // RES/ITI/EVT/ACT — no subtypes; whole-family toggle.
    store.getState().toggleBucket(bucket);
  }
}
