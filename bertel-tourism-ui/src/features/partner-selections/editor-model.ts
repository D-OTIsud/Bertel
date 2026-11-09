import type { BackendObjectTypeCode, ExplorerBucketKey, ExplorerFilters } from '../../types/domain';
import type { PartnerSelectionAdmin, PartnerSelectionInput, SavedSelectionBucket } from '../../services/partner-selection-admin';
import { buildBucketRpcFilters, DEFAULT_EXPLORER_FILTERS, EXPLORER_BUCKET_TYPE_MAP, getEffectiveBackendTypesForBucket, normalizeExplorerFilters } from '../../utils/facets';

export const EDITOR_KIND = 'partner-selection-editor-v1';
export interface SelectionBranch {
  id: string;
  bucket: ExplorerBucketKey;
  filters: ExplorerFilters;
  types: BackendObjectTypeCode[];
  onlyWithoutPractices?: boolean;
}
export interface SelectionDraft {
  name: string;
  common: ExplorerFilters;
  branches: SelectionBranch[];
  communeInsee: string[] | null;
  original?: PartnerSelectionAdmin;
  filtersChanged: boolean;
  lockedReason?: string;
}
export const copy = <T,>(value: T): T => value === undefined ? value : JSON.parse(JSON.stringify(value)) as T;
const ordered = (value: unknown): unknown => Array.isArray(value) ? value.map(ordered) : value && typeof value === 'object'
  ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, ordered(item)])) : value;
export const sameDefinition = (a: unknown, b: unknown): boolean => JSON.stringify(ordered(a)) === JSON.stringify(ordered(b));
export function emptyFilters(buckets: ExplorerBucketKey[] = []): ExplorerFilters {
  return normalizeExplorerFilters({ ...copy(DEFAULT_EXPLORER_FILTERS), selectedBuckets: buckets });
}
export function newBranch(bucket: ExplorerBucketKey, id = crypto.randomUUID()): SelectionBranch {
  return { id, bucket, filters: emptyFilters([bucket]), types: [...EXPLORER_BUCKET_TYPE_MAP[bucket]] };
}
export function newSelectionDraft(): SelectionDraft {
  return { name: '', common: emptyFilters(), branches: [], communeInsee: null, filtersChanged: true };
}

/** A common criterion has one editing home. Its whole group replaces the local group. */
const COMMON_GROUPS = {
  search: ['search', 'searchScope'],
  city: ['cities'], lieuDit: ['lieuDit'],
  label: ['rankedLabelSchemeCode', 'rankedLabelIncludeEquivalents', 'rankedLabelValueCodes'],
  accessibility: ['pmr', 'accessibilityDisabilityTypesAny', 'accessibilityAmenityCodesAny'],
  sustainability: ['sustainable', 'sustainabilityCategoryCodesAny', 'sustainabilityActionCodesAny'],
  pets: ['petsAccepted'], opening: ['openNow', 'openAt'], environment: ['environmentTagsAny'],
  amenities: ['amenityFamiliesAny'], tags: ['tagsAny'],
} as const;
export type CommonGroup = keyof typeof COMMON_GROUPS;
export function activeCommonGroups(filters: ExplorerFilters): CommonGroup[] {
  const c = filters.common;
  return (Object.keys(COMMON_GROUPS) as CommonGroup[]).filter((group) => {
    if (group === 'label') return !!c.rankedLabelSchemeCode;
    if (group === 'search') return !!c.search.trim();
    return COMMON_GROUPS[group].some((key) => {
      const value = c[key];
      return Array.isArray(value) ? value.length > 0 : typeof value === 'string' ? value.trim().length > 0 : value === true;
    });
  });
}
export function mergedFilters(branch: SelectionBranch, common: ExplorerFilters): ExplorerFilters {
  const filters = copy(branch.filters);
  for (const group of activeCommonGroups(common)) {
    for (const key of COMMON_GROUPS[group]) Object.assign(filters.common, { [key]: copy(common.common[key]) });
  }
  filters.common.providerOnly = false;
  filters.common.statuses = [];
  filters.common.missingEssentialsAny = [];
  filters.common.missingEssentialsBuckets = [];
  filters.common.bbox = null;
  filters.common.polygon = null;
  return filters;
}
export function serializeBranches(draft: SelectionDraft): SavedSelectionBucket[] {
  return draft.branches.map((branch) => {
    const filters = mergedFilters(branch, draft.common);
    const types = effectiveBranchTypes(branch);
    return {
      types: [...types], filters: buildBucketRpcFilters(filters, branch.bucket),
      ...(filters.common.search.trim() ? { search: filters.common.search.trim() } : {}),
      ...(branch.onlyWithoutPractices ? { only_without_practices: true } : {}),
    };
  });
}
export function effectiveBranchTypes(branch: SelectionBranch): BackendObjectTypeCode[] {
  return ['HOT', 'VIS', 'SRV'].includes(branch.bucket) ? getEffectiveBackendTypesForBucket(branch.filters, branch.bucket) : branch.types;
}
export function selectionInput(draft: SelectionDraft, orgObjectId: string): PartnerSelectionInput {
  if (!draft.filtersChanged && draft.original) {
    return { name: draft.name.trim(), orgObjectId, buckets: copy(draft.original.buckets),
      explorerState: draft.original.explorerState, communeInsee: draft.original.communeInsee };
  }
  if (draft.lockedReason) throw new Error(draft.lockedReason);
  if (draft.branches.length === 0) throw new Error('Ajoutez au moins un bloc de fiches.');
  const buckets = serializeBranches(draft);
  if (buckets.some((bucket) => bucket.types.length === 0)) throw new Error('Choisissez au moins un type dans chaque bloc.');
  return { name: draft.name.trim(), orgObjectId, buckets, communeInsee: draft.communeInsee,
    explorerState: { kind: EDITOR_KIND, common: draft.common, branches: draft.branches } };
}

function hydrateBucket(source: SavedSelectionBucket, index: number): SelectionBranch {
  if (Object.keys(source).some((key) => !['types', 'filters', 'search', 'only_without_practices'].includes(key))) throw new Error('Critère de bloc inconnu.');
  const bucket = (Object.keys(EXPLORER_BUCKET_TYPE_MAP) as ExplorerBucketKey[]).find((key) => source.types.every((type) => EXPLORER_BUCKET_TYPE_MAP[key].includes(type as BackendObjectTypeCode)));
  if (!bucket) throw new Error('Ce bloc combine plusieurs familles techniques.');
  const branch = newBranch(bucket, `import-${index}`);
  branch.types = [...source.types] as BackendObjectTypeCode[];
  if (bucket === 'HOT') branch.filters.hot.subtypes = [...branch.types];
  if (bucket === 'VIS') branch.filters.vis.subtypes = [...branch.types];
  if (bucket === 'SRV') branch.filters.srv.subtypes = [...branch.types];
  branch.onlyWithoutPractices = source.only_without_practices;
  const f = source.filters ?? {};
  const c = branch.filters.common;
  c.search = source.search ?? '';
  c.searchScope = f.search_mode === 'global' ? 'global' : 'name';
  c.cities = copy(f.city_any as string[] ?? []);
  c.lieuDit = (f.lieu_dit_any as string[] | undefined)?.[0] ?? '';
  c.petsAccepted = f.pet_accepted === true;
  c.openNow = f.open_now === true;
  c.openAt = typeof f.open_at === 'string' && /:00\+04:00$/.test(f.open_at) ? f.open_at.slice(0, 16) : null;
  c.environmentTagsAny = copy(f.environment_tags_any as string[] ?? []);
  c.amenityFamiliesAny = copy(f.amenity_families_any as string[] ?? []);
  c.accommodationUnitTypesAny = copy(f.accommodation_unit_types_any as string[] ?? []);
  c.accommodationPositioningsAny = copy(f.accommodation_positionings_any as string[] ?? []);
  c.taxonomyAny = copy(f.taxonomy_any as typeof c.taxonomyAny ?? []);
  c.includeEquivalentPredecessors = f.include_equivalent_predecessors === true;
  c.tagsAny = (f.tags_any as string[] ?? []).map((slug) => ({ slug, name: slug }));
  c.rankedLabelSchemeCode = typeof f.label_scheme_ranked === 'string' ? f.label_scheme_ranked : null;
  c.rankedLabelIncludeEquivalents = f.label_scheme_ranked_exact_only !== true;
  c.rankedLabelValueCodes = (f.classifications_any as Array<{ value_code: string }> ?? []).map((v) => v.value_code);
  c.pmr = f.accessibility_any === true || Array.isArray(f.disability_types_any) || Array.isArray(f.amenities_any);
  c.accessibilityDisabilityTypesAny = copy(f.disability_types_any as typeof c.accessibilityDisabilityTypesAny ?? []);
  c.accessibilityAmenityCodesAny = copy(f.amenities_any as string[] ?? []);
  c.sustainable = f.sustainability_any === true || Array.isArray(f.sustainability_categories_any) || Array.isArray(f.sustainability_actions_any);
  c.sustainabilityCategoryCodesAny = copy(f.sustainability_categories_any as string[] ?? []);
  c.sustainabilityActionCodesAny = copy(f.sustainability_actions_any as string[] ?? []);
  if (bucket === 'HOT') {
    branch.filters.hot.capacityFilters = copy(f.capacity_filters as typeof branch.filters.hot.capacityFilters ?? []);
    const meeting = f.meeting_room as Record<string, number> | undefined;
    const keys = { minCount: 'min_count', minAreaM2: 'min_area_m2', minCapTheatre: 'min_cap_theatre', minCapClassroom: 'min_cap_classroom' };
    branch.filters.hot.meetingRoom = Object.fromEntries(Object.entries(keys).filter(([, key]) => meeting?.[key] != null).map(([key, sql]) => [key, meeting![sql]]));
  }
  if (bucket === 'RES') {
    branch.filters.res.capacityFilters = copy(f.capacity_filters as typeof branch.filters.res.capacityFilters ?? []);
    Object.assign(branch.filters.res, { cuisineTypesAny: copy(f.cuisine_types_any as string[] ?? []) });
  }
  if (bucket === 'ITI') {
    const iti = f.itinerary as Record<string, unknown> | undefined;
    const keys = { isLoop: 'is_loop', difficultyMin: 'difficulty_min', difficultyMax: 'difficulty_max', distanceMinKm: 'distance_min_km', distanceMaxKm: 'distance_max_km', durationMinH: 'duration_min_h', durationMaxH: 'duration_max_h', practicesAny: 'practices_any' };
    for (const [key, sql] of Object.entries(keys)) if (iti?.[sql] != null) Object.assign(branch.filters.iti, { [key]: copy(iti[sql]) });
  }
  if (bucket === 'EVT') {
    const event = f.event as { from?: string; to?: string } | undefined;
    branch.filters.evt = { eventFrom: event?.from ?? null, eventTo: event?.to ?? null };
  }
  return branch;
}

export function openSelectionDraft(selection: PartnerSelectionAdmin): SelectionDraft {
  const draft: SelectionDraft = { ...newSelectionDraft(), name: selection.name, original: copy(selection),
    communeInsee: copy(selection.communeInsee), filtersChanged: false };
  try {
    if (selection.buckets.some((source) => source.types.some((type) => !Object.values(EXPLORER_BUCKET_TYPE_MAP).some((types) => types.includes(type as BackendObjectTypeCode))))) throw new Error('Type inconnu.');
    const state = selection.explorerState;
    if (state?.kind === EDITOR_KIND && state.common && Array.isArray(state.branches)) {
      draft.common = normalizeExplorerFilters(state.common as ExplorerFilters);
      draft.branches = (state.branches as SelectionBranch[]).map((branch) => ({ ...copy(branch), filters: normalizeExplorerFilters(branch.filters) }));
    } else draft.branches = selection.buckets.flatMap((source) => (Object.keys(EXPLORER_BUCKET_TYPE_MAP) as ExplorerBucketKey[])
      .map((bucket) => ({ ...source, types: source.types.filter((type) => EXPLORER_BUCKET_TYPE_MAP[bucket].includes(type as BackendObjectTypeCode)) }))
      .filter((bucket) => bucket.types.length > 0)).map(hydrateBucket);
    const expected = selection.buckets.flatMap((source) => (Object.keys(EXPLORER_BUCKET_TYPE_MAP) as ExplorerBucketKey[])
      .map((key) => ({ ...source, types: source.types.filter((type) => EXPLORER_BUCKET_TYPE_MAP[key].includes(type as BackendObjectTypeCode)) }))
      .filter((bucket) => bucket.types.length > 0)).map((bucket) => ({ types: [...bucket.types], filters: bucket.filters ?? {},
      ...(bucket.search ? { search: bucket.search } : {}), ...(bucket.only_without_practices ? { only_without_practices: true } : {}) }));
    if (!sameDefinition(serializeBranches(draft), expected)) throw new Error('Critères avancés non représentables par cet éditeur.');
  } catch {
    draft.branches = [];
    draft.lockedReason = 'Cette sélection contient des critères avancés. Ils sont conservés intégralement ; le nom et l’état restent modifiables. La modification des critères nécessite une adaptation de l’éditeur.';
  }
  return draft;
}
