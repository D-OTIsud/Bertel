import type { ExplorerBucketKey, ExplorerFilters, ExplorerStatusFilter, MeetingRoomFilter } from '../types/domain';
import {
  buildBucketRpcFilters,
  DEFAULT_EXPLORER_FILTERS,
  getEffectiveBackendTypesForBucket,
  getEffectiveSelectedBuckets,
  normalizeExplorerFilters,
  resolveExplorerStatuses,
} from '../utils/facets';
import { dashboardStatsParams, type DashboardStatsParams } from './dashboard-stats-params';

/** Domain identities, independent from the component that supplies their labels. */
export type FilterCriterionGroup =
  | 'providerOnly' | 'search' | 'bucket' | 'city' | 'lieuDit' | 'pmr' | 'pets' | 'openNow'
  | 'sustainable' | 'tag' | 'status' | 'rankedLabel' | 'rankedLabelExact'
  | 'rankedLabelValues' | 'zone' | 'environment' | 'openAt' | 'evtDates'
  | 'amenityFamilies' | 'accommodationUnitTypes' | 'accommodationPositionings'
  | 'accessDisability' | 'accessAmenities' | 'sustCategories' | 'sustActions'
  | 'taxonomy' | 'hotSubtypes' | 'visSubtypes' | 'srvSubtypes' | 'meetingRoom'
  | 'hotCapacity' | 'resCapacity' | 'itiLoop' | 'itiDifficulty' | 'itiDistance'
  | 'itiDuration' | 'itiPractices' | 'missingEssentialsBuckets' | 'missingEssentialsAny';

export interface FilterCriterion {
  key: string;
  group: FilterCriterionGroup;
  value: string;
  label: string;
}

export interface ContextualFilterCriterion extends FilterCriterion {
  application: 'applied' | 'memorized' | 'partial';
  appliedValues: string[];
  memorizedValues: string[];
  reason?: string;
  removalScope: 'criterion' | 'group';
}

export interface ExplorerFilterContextOptions {
  page: 'explorer' | 'dashboard';
  canEditObjects: boolean;
}

export interface ExplorerFilterContext {
  /** Partial groups occur once here, and are counted once. */
  applied: ContextualFilterCriterion[];
  memorized: ContextualFilterCriterion[];
  partial: ContextualFilterCriterion[];
  effectiveStatuses: ExplorerStatusFilter[];
  transferableFilters: ExplorerFilters;
  dashboardParams?: DashboardStatsParams;
}

// Unlike a JSON roundtrip, this retains undefined, zero, false and optional keys.
function copy<T>(value: T): T {
  if (Array.isArray(value)) return value.map(copy) as T;
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copy(item)])) as T;
  }
  return value;
}

type Payload = Record<string, unknown>;
interface QueryContext {
  raw: ExplorerFilters;
  effective: ExplorerFilters;
  scopedBuckets: ExplorerBucketKey[];
}

const keysOf = (value: object): string[] => Object.entries(value).filter(([, item]) => item != null).map(([key]) => key);
const flag = (condition: unknown, value: string): string[] => condition ? [value] : [];
const strings = (values: string[]): string[] => values.map((value) => value.trim()).filter(Boolean);
const rangeKeys = (from: unknown, to: unknown): string[] => [...flag(from != null, 'min'), ...flag(to != null, 'max')];
const taxonomyValues = (filters: ExplorerFilters): string[] => filters.common.taxonomyAny.map(({ domain, code }) => `${domain}:${code}`);
const dateValues = (filters: ExplorerFilters): string[] => [...flag(filters.evt.eventFrom, 'from'), ...flag(filters.evt.eventTo, 'to')];

interface CriterionRule {
  values: (filters: ExplorerFilters, criterion: FilterCriterion) => string[];
  scope?: ExplorerBucketKey;
  removalScope?: 'group';
}

/** Exhaustive by construction: new native chip groups must acquire a rule. */
export const FILTER_CRITERION_RULES = {
  providerOnly: { values: (f) => flag(f.common.providerOnly, 'providerOnly') },
  search: { values: (f) => flag(f.common.search.trim(), 'search') },
  bucket: { values: (f, c) => f.selectedBuckets.filter((bucket) => bucket === c.value) },
  city: { values: (f, c) => strings(f.common.cities).filter((city) => city === c.value.trim()) },
  lieuDit: { values: (f) => flag(f.common.lieuDit.trim(), 'lieuDit') },
  pmr: { values: (f) => flag(f.common.pmr, 'pmr') },
  pets: { values: (f) => flag(f.common.petsAccepted, 'pets') },
  openNow: { values: (f) => flag(f.common.openNow, 'openNow') },
  sustainable: { values: (f) => flag(f.common.sustainable, 'sustainable') },
  tag: { values: (f, c) => strings(f.common.tagsAny.map((tag) => tag.slug)).filter((slug) => slug === c.value.trim()) },
  status: { values: (f, c) => f.common.statuses.filter((status) => status === c.value) },
  rankedLabel: { values: (f) => flag(f.common.rankedLabelSchemeCode, 'rankedLabel') },
  rankedLabelExact: { values: (f) => flag(f.common.rankedLabelSchemeCode && !f.common.rankedLabelIncludeEquivalents, 'exact') },
  rankedLabelValues: { values: (f) => f.common.rankedLabelSchemeCode ? strings(f.common.rankedLabelValueCodes) : [], removalScope: 'group' },
  zone: { values: (f) => [...flag(f.common.polygon, 'polygon'), ...flag(f.common.bbox, 'bbox')], removalScope: 'group' },
  environment: { values: (f) => strings(f.common.environmentTagsAny), removalScope: 'group' },
  openAt: { values: (f) => flag(f.common.openAt, 'openAt') },
  evtDates: { values: dateValues, removalScope: 'group' },
  amenityFamilies: { values: (f) => strings(f.common.amenityFamiliesAny), removalScope: 'group' },
  accommodationUnitTypes: { values: (f) => strings(f.common.accommodationUnitTypesAny), removalScope: 'group' },
  accommodationPositionings: { values: (f) => strings(f.common.accommodationPositioningsAny), removalScope: 'group' },
  accessDisability: { values: (f, c) => f.common.accessibilityDisabilityTypesAny.filter((value) => value === c.value) },
  accessAmenities: { values: (f) => strings(f.common.accessibilityAmenityCodesAny), removalScope: 'group' },
  sustCategories: { values: (f) => strings(f.common.sustainabilityCategoryCodesAny), removalScope: 'group' },
  sustActions: { values: (f) => strings(f.common.sustainabilityActionCodesAny), removalScope: 'group' },
  taxonomy: { values: taxonomyValues, removalScope: 'group' },
  hotSubtypes: { values: (f) => f.hot.subtypes, scope: 'HOT', removalScope: 'group' },
  visSubtypes: { values: (f) => f.vis.subtypes, scope: 'VIS', removalScope: 'group' },
  srvSubtypes: { values: (f) => f.srv.subtypes, scope: 'SRV', removalScope: 'group' },
  meetingRoom: { values: (f) => keysOf(f.hot.meetingRoom), removalScope: 'group' },
  hotCapacity: { values: (f, c) => f.hot.capacityFilters.filter((capacity) => capacity.code === c.value && (capacity.min != null || capacity.max != null)).map((capacity) => capacity.code) },
  resCapacity: { values: (f, c) => f.res.capacityFilters.filter((capacity) => capacity.code === c.value && (capacity.min != null || capacity.max != null)).map((capacity) => capacity.code) },
  itiLoop: { values: (f) => flag(f.iti.isLoop != null, 'isLoop') },
  itiDifficulty: { values: (f) => rangeKeys(f.iti.difficultyMin, f.iti.difficultyMax), removalScope: 'group' },
  itiDistance: { values: (f) => rangeKeys(f.iti.distanceMinKm, f.iti.distanceMaxKm), removalScope: 'group' },
  itiDuration: { values: (f) => rangeKeys(f.iti.durationMinH, f.iti.durationMaxH), removalScope: 'group' },
  itiPractices: { values: (f) => f.iti.practicesAny, removalScope: 'group' },
  missingEssentialsBuckets: { values: (f, c) => f.common.missingEssentialsBuckets.filter((value) => value === c.value) },
  missingEssentialsAny: { values: (f, c) => f.common.missingEssentialsAny.filter((value) => value === c.value) },
} satisfies Record<FilterCriterionGroup, CriterionRule>;

/** Reconstruct only supported contributions from the actual outgoing payloads. */
function effectiveSnapshot(raw: ExplorerFilters, options: ExplorerFilterContextOptions): QueryContext & { dashboardParams?: DashboardStatsParams } {
  const effective = copy(raw);
  const query = copy(raw);
  if (options.page === 'explorer') {
    query.common.statuses = resolveExplorerStatuses(raw.common.statuses, options.canEditObjects);
    if (!options.canEditObjects) {
      query.common.missingEssentialsBuckets = [];
      query.common.missingEssentialsAny = [];
    }
  }
  const dashboardParams = options.page === 'dashboard' ? dashboardStatsParams(query, {}) : undefined;
  const scopedBuckets = options.page === 'dashboard' ? raw.selectedBuckets : getEffectiveSelectedBuckets(raw.selectedBuckets);
  const bucketPayloads = getEffectiveSelectedBuckets(raw.selectedBuckets)
    .filter((bucket) => getEffectiveBackendTypesForBucket(query, bucket).length > 0)
    .map((bucket) => buildBucketRpcFilters(query, bucket));
  const payloads = dashboardParams ? [dashboardParams.p_filters] : bucketPayloads;
  const has = (key: string) => payloads.some((payload) => payload[key] != null);
  const first = <T,>(key: string) => payloads.find((payload) => payload[key] != null)?.[key] as T | undefined;
  const values = <T,>(key: string): T[] => {
    const collected = payloads.flatMap((payload) => Array.isArray(payload[key]) ? payload[key] as T[] : []);
    // A transverse key is repeated in each Explorer bucket payload, not chosen
    // repeatedly by the user. Union those observations without merging chips.
    return [...new Map(collected.map((value) => [JSON.stringify(value), value])).values()];
  };
  const common = effective.common;

  common.providerOnly = has('has_provider') && raw.common.providerOnly === true;
  common.statuses = dashboardParams ? dashboardParams.p_status as ExplorerStatusFilter[] : query.common.statuses;
  if (options.page === 'dashboard') common.search = '';
  common.cities = values<string>('city_any');
  common.lieuDit = first<string[]>('lieu_dit_any')?.[0] ?? '';
  common.petsAccepted = has('pet_accepted') && raw.common.petsAccepted;
  common.openNow = has('open_now') && raw.common.openNow;
  common.pmr = raw.common.pmr && ['accessibility_any', 'amenities_any', 'disability_types_any'].some(has);
  common.accessibilityDisabilityTypesAny = values<ExplorerFilters['common']['accessibilityDisabilityTypesAny'][number]>('disability_types_any');
  common.accessibilityAmenityCodesAny = values<string>('amenities_any');
  common.sustainable = raw.common.sustainable && ['sustainability_any', 'sustainability_categories_any', 'sustainability_actions_any'].some(has);
  common.sustainabilityCategoryCodesAny = values<string>('sustainability_categories_any');
  common.sustainabilityActionCodesAny = values<string>('sustainability_actions_any');
  common.environmentTagsAny = values<string>('environment_tags_any');
  common.accommodationUnitTypesAny = values<string>('accommodation_unit_types_any');
  common.accommodationPositioningsAny = values<string>('accommodation_positionings_any');
  common.amenityFamiliesAny = values<string>('amenity_families_any');
  common.taxonomyAny = values<ExplorerFilters['common']['taxonomyAny'][number]>('taxonomy_any');
  const tags = new Set(values<string>('tags_any'));
  common.tagsAny = raw.common.tagsAny.filter((tag) => tags.has(tag.slug.trim()));
  common.rankedLabelSchemeCode = first<string>('label_scheme_ranked') ?? null;
  common.rankedLabelIncludeEquivalents = !has('label_scheme_ranked_exact_only');
  common.rankedLabelValueCodes = values<{ value_code: string }>('classifications_any').map((value) => value.value_code);
  common.openAt = has('open_at') ? raw.common.openAt : null;
  common.bbox = has('bbox') ? copy(raw.common.bbox) : null;
  common.polygon = options.page === 'explorer' ? copy(raw.common.polygon) : null;
  common.missingEssentialsBuckets = values<ExplorerFilters['common']['missingEssentialsBuckets'][number]>('missing_essentials_buckets');
  common.missingEssentialsAny = values<ExplorerFilters['common']['missingEssentialsAny'][number]>('missing_essentials_any');

  // Payloads for HOT and RES use the same key; keep the producing bucket explicit.
  const specific = (bucket: ExplorerBucketKey): Payload => dashboardParams
    ? raw.selectedBuckets.length === 1 && raw.selectedBuckets[0] === bucket ? dashboardParams.p_filters : {}
    : scopedBuckets.includes(bucket) && getEffectiveBackendTypesForBucket(query, bucket).length > 0 ? buildBucketRpcFilters(query, bucket) : {};
  effective.hot.capacityFilters = copy(specific('HOT').capacity_filters as ExplorerFilters['hot']['capacityFilters'] ?? []);
  effective.res.capacityFilters = copy(specific('RES').capacity_filters as ExplorerFilters['res']['capacityFilters'] ?? []);
  const meeting = specific('HOT').meeting_room as Record<string, number> | undefined;
  const meetingKeys: Record<keyof MeetingRoomFilter, string> = { minCount: 'min_count', minAreaM2: 'min_area_m2', minCapTheatre: 'min_cap_theatre', minCapClassroom: 'min_cap_classroom' };
  effective.hot.meetingRoom = Object.fromEntries(Object.entries(meetingKeys).filter(([, key]) => meeting?.[key] != null).map(([key, rpcKey]) => [key, meeting![rpcKey]]));
  const itinerary = specific('ITI').itinerary as Record<string, unknown> | undefined;
  effective.iti = { ...copy(DEFAULT_EXPLORER_FILTERS.iti) };
  const itineraryKeys = { isLoop: 'is_loop', difficultyMin: 'difficulty_min', difficultyMax: 'difficulty_max', distanceMinKm: 'distance_min_km', distanceMaxKm: 'distance_max_km', durationMinH: 'duration_min_h', durationMaxH: 'duration_max_h', practicesAny: 'practices_any' } as const;
  for (const [key, rpcKey] of Object.entries(itineraryKeys)) {
    if (itinerary?.[rpcKey] != null) Object.assign(effective.iti, { [key]: copy(itinerary[rpcKey]) });
  }
  const event = specific('EVT').event as { from?: string; to?: string } | undefined;
  effective.evt = { eventFrom: event?.from ?? null, eventTo: event?.to ?? null };
  for (const [bucket, slice] of [['HOT', 'hot'], ['VIS', 'vis'], ['SRV', 'srv']] as const) {
    if (!scopedBuckets.includes(bucket)) effective[slice].subtypes = copy(DEFAULT_EXPLORER_FILTERS[slice].subtypes);
  }
  return { raw, effective, scopedBuckets, dashboardParams };
}

export function deriveExplorerFilterContext(
  filters: ExplorerFilters,
  options: ExplorerFilterContextOptions,
  criteria: readonly FilterCriterion[],
): ExplorerFilterContext {
  const raw = copy(normalizeExplorerFilters(filters));
  const context = effectiveSnapshot(raw, options);
  const { effective, scopedBuckets, dashboardParams } = context;
  const applied: ContextualFilterCriterion[] = [];
  const memorized: ContextualFilterCriterion[] = [];
  const partial: ContextualFilterCriterion[] = [];
  for (const criterion of criteria) {
    const rule: CriterionRule | undefined = FILTER_CRITERION_RULES[criterion.group];
    if (!rule) throw new Error(`Unknown filter criterion group: ${criterion.group}`);
    const originalValues = rule.values(raw, criterion);
    const usedValues = rule.scope && !scopedBuckets.includes(rule.scope) ? [] : rule.values(effective, criterion);
    const used = new Set(usedValues);
    const appliedValues = originalValues.filter((value) => used.has(value));
    // A malformed legacy value must remain visible and removable, even if its
    // native chip builder emits it without a usable RPC contribution.
    const memorizedValues = originalValues.length > 0 ? originalValues.filter((value) => !used.has(value)) : [criterion.value];
    const application = appliedValues.length === 0 ? 'memorized' : memorizedValues.length > 0 ? 'partial' : 'applied';
    const reason = application === 'applied' ? undefined
      : application === 'partial' ? `${appliedValues.length} valeur(s) appliquée(s), ${memorizedValues.length} mémorisée(s). Le retrait efface tout le groupe.`
        : criterion.group === 'search' && options.page === 'dashboard' ? 'La recherche texte ne filtre pas les indicateurs du Dashboard.'
          : criterion.group === 'status' ? 'Ce statut ne fait pas partie du périmètre effectif de cette page.'
            : 'Valeur conservée sans effet sur cette vue avec les catégories et droits actuels.';
    const item: ContextualFilterCriterion = { ...criterion, application, appliedValues, memorizedValues, reason, removalScope: rule.removalScope ?? 'criterion' };
    if (application === 'memorized') memorized.push(item);
    else applied.push(item);
    if (application === 'partial') partial.push(item);
  }
  // Detach the projection from both inputs and metadata. A consumer can pass it
  // to the existing codecs without changing a remembered value in either store.
  return { applied, memorized, partial, effectiveStatuses: [...effective.common.statuses], transferableFilters: copy(effective), dashboardParams };
}
