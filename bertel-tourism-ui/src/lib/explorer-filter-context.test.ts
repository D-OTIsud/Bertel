import { buildExplorerActiveChips, type ActiveChipGroup } from '../components/explorer/explorer-active-chips';
import type { ExplorerBucketKey, ExplorerFilters } from '../types/domain';
import { buildSearchParams, parseSearchParams } from './explorer-search-params';
import { DEFAULT_EXPLORER_FILTERS, DEFAULT_HOT_SUBTYPES, DEFAULT_VIS_SUBTYPES, DEFAULT_SRV_SUBTYPES, buildBucketRpcFilters, normalizeExplorerFilters } from '../utils/facets';
import { dashboardStatsParams } from './dashboard-stats-params';
import {
  deriveExplorerFilterContext,
  FILTER_CRITERION_RULES,
  type FilterCriterionGroup,
  type FilterCriterion,
  type ExplorerFilterContextOptions,
} from './explorer-filter-context';

// Compile-time equality too: a new native group cannot silently escape this registry.
const nativeGroupsCovered: Exclude<ActiveChipGroup, FilterCriterionGroup> extends never ? true : false = true;
const noInventedGroups: Exclude<FilterCriterionGroup, ActiveChipGroup> extends never ? true : false = true;

function fresh(): ExplorerFilters {
  return JSON.parse(JSON.stringify(DEFAULT_EXPLORER_FILTERS)) as ExplorerFilters;
}

function full(): ExplorerFilters {
  const f = fresh();
  f.selectedBuckets = ['HOT', 'RES', 'ACT', 'EVT', 'ITI', 'VIS', 'SRV'];
  Object.assign(f.common, {
    search: 'chambre', cities: ['Le Tampon'], lieuDit: 'Bourg-Murat',
    pmr: true, petsAccepted: true, openNow: true, sustainable: true,
    accessibilityDisabilityTypesAny: ['motor'], accessibilityAmenityCodesAny: ['ramp'],
    sustainabilityCategoryCodesAny: ['energy'], sustainabilityActionCodesAny: ['solar'],
    environmentTagsAny: ['mountain'], accommodationUnitTypesAny: ['cabin'],
    accommodationPositioningsAny: ['boutique'], amenityFamiliesAny: ['pool'],
    taxonomyAny: [{ domain: 'taxonomy_hot', code: 'hotel' }, { domain: 'taxonomy_res', code: 'pizzeria' }],
    tagsAny: [{ slug: 'famille', name: 'Famille' }], rankedLabelSchemeCode: 'LBL_HOTEL',
    rankedLabelIncludeEquivalents: false, rankedLabelValueCodes: ['3'],
    statuses: ['published', 'draft', 'archived'], missingEssentialsBuckets: ['few'], missingEssentialsAny: ['name'],
    openAt: '2026-10-28T12:30', bbox: [55, -22, 56, -20],
    polygon: { type: 'Polygon', coordinates: [[[55, -22], [56, -22], [56, -20], [55, -22]]] },
  });
  f.hot = { subtypes: [DEFAULT_HOT_SUBTYPES[0]], capacityFilters: [{ code: 'beds', min: 0, max: 60 }], meetingRoom: { minCount: 0, minAreaM2: 20 } };
  f.res.capacityFilters = [{ code: 'seats', min: 0, max: 60 }];
  f.vis.subtypes = [DEFAULT_VIS_SUBTYPES[0]];
  f.srv.subtypes = [DEFAULT_SRV_SUBTYPES[0]];
  f.iti = { isLoop: false, difficultyMin: 0, difficultyMax: 2, distanceMinKm: 0, distanceMaxKm: 10, durationMinH: 0, durationMaxH: 3, practicesAny: ['walk'] };
  f.evt = { eventFrom: '2026-11-10', eventTo: '2026-11-01' };
  return f;
}

function derive(filters: ExplorerFilters, page: ExplorerFilterContextOptions['page'] = 'dashboard', canEditObjects = true) {
  return deriveExplorerFilterContext(filters, { page, canEditObjects }, buildExplorerActiveChips(filters));
}

function applications(context: ReturnType<typeof derive>): Record<string, string> {
  return Object.fromEntries([...context.applied, ...context.memorized].map((criterion) => [criterion.key, criterion.application]));
}

it('covers every native chip identity exactly once without depending on its display label', () => {
  expect(nativeGroupsCovered && noInventedGroups).toBe(true);
  const filters = full();
  const chips = buildExplorerActiveChips(filters).map((chip) => ({ ...chip, label: 'Même libellé' }));
  expect(new Set(chips.map((chip) => chip.group))).toEqual(new Set(Object.keys(FILTER_CRITERION_RULES)));
  const context = deriveExplorerFilterContext(filters, { page: 'explorer', canEditObjects: true }, chips);
  expect(context.memorized).toEqual([]);
  expect(context.partial).toEqual([]);
  expect(context.applied.map((chip) => chip.key)).toEqual(chips.map((chip) => chip.key));
  expect(new Set(context.applied.map((chip) => chip.key)).size).toBe(chips.length);
});

it('rejects an unregistered future criterion instead of silently dropping it', () => {
  const unknown = { key: 'unknown', group: 'future', value: '*', label: 'Unknown' } as unknown as FilterCriterion;
  expect(() => deriveExplorerFilterContext(fresh(), { page: 'explorer', canEditObjects: true }, [unknown])).toThrow('Unknown filter criterion group');
});

it('distinguishes applied HOT capacity, memorized multi-type capacity and restored mono-type capacity', () => {
  const filters = full();
  filters.selectedBuckets = ['HOT'];
  expect(applications(derive(filters))['hotCapacity:beds']).toBe('applied');
  filters.selectedBuckets = ['HOT', 'RES'];
  const multi = derive(filters);
  expect(applications(multi)['hotCapacity:beds']).toBe('memorized');
  expect(applications(multi)['resCapacity:seats']).toBe('memorized');
  expect(applications(multi).hotSubtypes).toBe('applied');
  expect(multi.transferableFilters.hot.capacityFilters).toEqual([]);
  expect(multi.transferableFilters.hot.subtypes).toEqual(filters.hot.subtypes);
  expect(filters.hot.capacityFilters).toEqual([{ code: 'beds', min: 0, max: 60 }]);
  filters.selectedBuckets = ['HOT'];
  expect(applications(derive(filters))['hotCapacity:beds']).toBe('applied');
});

it.each<ExplorerBucketKey>(['HOT', 'RES', 'ACT', 'EVT', 'ITI', 'VIS', 'SRV'])('follows the actual mono-bucket Dashboard payload for %s', (bucket) => {
  const filters = full();
  filters.selectedBuckets = [bucket];
  const context = derive(filters);
  expect(context.dashboardParams).toEqual(dashboardStatsParams(filters, {}));
  const state = applications(context);
  expect(state['hotCapacity:beds']).toBe(bucket === 'HOT' ? 'applied' : 'memorized');
  expect(state['resCapacity:seats']).toBe(bucket === 'RES' ? 'applied' : 'memorized');
  expect(state.meetingRoom).toBe(bucket === 'HOT' ? 'applied' : 'memorized');
  expect(state.evtDates).toBe(bucket === 'EVT' ? 'applied' : 'memorized');
  expect(state.itiLoop).toBe(bucket === 'ITI' ? 'applied' : 'memorized');
  expect(state.accommodationPositionings).toBe(bucket === 'HOT' ? 'applied' : 'memorized');
});

it('retains the different zero-category semantics of Dashboard and Explorer', () => {
  const filters = full();
  filters.selectedBuckets = [];
  const dashboard = derive(filters);
  expect(dashboard.dashboardParams?.p_types).toBeNull();
  const states = applications(dashboard);
  for (const key of ['hotSubtypes', 'visSubtypes', 'srvSubtypes', 'hotCapacity:beds', 'resCapacity:seats', 'evtDates', 'itiLoop']) {
    expect(states[key]).toBe('memorized');
  }
  expect(states.taxonomy).toBe('applied');
  const explorer = derive(filters, 'explorer');
  expect(explorer.memorized).toEqual([]);
});

it('qualifies a mixed taxonomy group once and keeps its native all-group removal scope', () => {
  const filters = full();
  filters.selectedBuckets = ['HOT'];
  const context = derive(filters);
  const taxonomy = context.applied.find((chip) => chip.group === 'taxonomy');
  expect(taxonomy).toMatchObject({
    application: 'partial', appliedValues: ['taxonomy_hot:hotel'],
    memorizedValues: ['taxonomy_res:pizzeria'], removalScope: 'group',
  });
  expect(context.partial).toContain(taxonomy);
  expect(context.memorized.some((chip) => chip.group === 'taxonomy')).toBe(false);
  expect(context.transferableFilters.common.taxonomyAny).toEqual([{ domain: 'taxonomy_hot', code: 'hotel' }]);
});

it('keeps Dashboard taxonomies transverse in multi-type while keeping subtypes scoped', () => {
  const filters = full();
  filters.selectedBuckets = ['HOT', 'RES'];
  const context = derive(filters);
  expect(context.dashboardParams?.p_filters.taxonomy_any).toEqual(filters.common.taxonomyAny);
  expect(applications(context).taxonomy).toBe('applied');
  expect(applications(context).hotSubtypes).toBe('applied');
  expect(applications(context).visSubtypes).toBe('memorized');
});

it('preserves actual role guards on Explorer without inventing a Dashboard query policy', () => {
  const filters = full();
  const explorer = derive(filters, 'explorer', false);
  expect(explorer.effectiveStatuses).toEqual(['published']);
  expect(applications(explorer)['status:draft']).toBe('memorized');
  expect(applications(explorer)['status:archived']).toBe('memorized');
  expect(applications(explorer)['remplissage:few']).toBe('memorized');
  expect(applications(explorer)['manque:name']).toBe('memorized');
  const dashboard = derive(filters, 'dashboard', false);
  expect(dashboard.effectiveStatuses).toEqual(['published', 'draft']);
  expect(dashboard.dashboardParams).toEqual(dashboardStatsParams(filters, {}));
});

it('represents effective defaults separately from removable raw status picks', () => {
  const filters = fresh();
  const dashboard = derive(filters);
  expect(dashboard.effectiveStatuses).toEqual(['published']);
  expect(dashboard.applied).toEqual([]);
  expect(dashboard.transferableFilters.common.statuses).toEqual(['published']);
  expect(derive(filters, 'explorer').effectiveStatuses).toEqual(['published', 'draft']);
  filters.common.statuses = ['published', 'draft'];
  expect(derive(filters).effectiveStatuses).toEqual(['published', 'draft']);
  filters.common.statuses = ['draft'];
  expect(derive(filters).effectiveStatuses).toEqual(['draft']);
  filters.common.statuses = ['archived'];
  expect(derive(filters).effectiveStatuses).toEqual(['published']);
  expect(applications(derive(filters))['status:archived']).toBe('memorized');
});

it('does not carry the Dashboard text search into Explorer as an applied criterion', () => {
  const filters = full();
  const context = derive(filters);
  expect(applications(context).search).toBe('memorized');
  expect(context.transferableFilters.common.search).toBe('');
  expect(derive(filters, 'explorer').transferableFilters.common.search).toBe('chambre');
});

it('keeps zero and false, normalizes event dates via the existing constructor and excludes malformed legacy values', () => {
  const filters = full();
  filters.selectedBuckets = ['ITI'];
  const itinerary = derive(filters).transferableFilters.iti;
  expect(itinerary).toMatchObject({ isLoop: false, difficultyMin: 0, distanceMinKm: 0, durationMinH: 0 });
  filters.selectedBuckets = ['HOT'];
  expect(derive(filters).transferableFilters.hot).toMatchObject({ capacityFilters: [{ code: 'beds', min: 0, max: 60 }], meetingRoom: { minCount: 0 } });
  filters.selectedBuckets = ['EVT'];
  expect(derive(filters).transferableFilters.evt).toEqual({ eventFrom: '2026-11-01', eventTo: '2026-11-10' });
  filters.evt.eventFrom = 'not-a-date';
  expect(derive(filters).partial.find((chip) => chip.group === 'evtDates')).toMatchObject({ appliedValues: ['to'], memorizedValues: ['from'] });
  filters.common.openAt = 'invalid';
  expect(applications(derive(filters)).openAt).toBe('memorized');
});

it('preserves undefined optional bounds and a fresh independent projection', () => {
  const filters = fresh();
  filters.selectedBuckets = ['ITI'];
  filters.iti.difficultyMin = undefined;
  filters.iti.difficultyMax = 0;
  const before = JSON.stringify(filters);
  const context = derive(filters);
  expect(context.transferableFilters.iti.difficultyMax).toBe(0);
  expect(context.transferableFilters.iti.difficultyMin).toBeUndefined();
  expect(Object.hasOwn(filters.iti, 'difficultyMin')).toBe(true);
  context.transferableFilters.common.cities.push('Saint-Pierre');
  context.transferableFilters.iti.practicesAny.push('bike');
  expect(JSON.stringify(filters)).toBe(before);
  expect(DEFAULT_EXPLORER_FILTERS.common.cities).toEqual([]);
});

it('accepts a deeply frozen source and never aliases either nested input or metadata', () => {
  const filters = full();
  const freeze = (value: unknown): void => {
    if (value && typeof value === 'object') {
      for (const child of Object.values(value)) freeze(child);
      Object.freeze(value);
    }
  };
  const before = JSON.stringify(filters);
  freeze(filters);
  const explorer = derive(filters, 'explorer');
  const dashboard = derive(filters);
  explorer.transferableFilters.common.polygon!.coordinates[0][0][0] = 0;
  explorer.transferableFilters.hot.capacityFilters[0].min = 50;
  dashboard.transferableFilters.common.taxonomyAny[0].code = 'changed';
  expect(JSON.stringify(filters)).toBe(before);
  expect(dashboard.dashboardParams?.p_filters.taxonomy_any).toEqual(filters.common.taxonomyAny);
});

it('does not multiply transverse selected values by the number of Explorer requests', () => {
  const filters = full();
  const context = derive(filters, 'explorer');
  expect(context.transferableFilters.common.cities).toEqual(['Le Tampon']);
  expect(context.transferableFilters.common.environmentTagsAny).toEqual(['mountain']);
  expect(context.transferableFilters.common.taxonomyAny).toEqual(filters.common.taxonomyAny);
});

it('uses the existing URL codec on a single supported snapshot, with an explicit effective status', () => {
  const filters = full();
  filters.selectedBuckets = ['HOT', 'RES'];
  filters.common.statuses = [];
  const snapshot = derive(filters).transferableFilters;
  const parsed = normalizeExplorerFilters(parseSearchParams(buildSearchParams(snapshot)));
  expect(parsed.common.statuses).toEqual(['published']);
  expect(parsed.hot.capacityFilters).toEqual([]);
  expect(parsed.res.capacityFilters).toEqual([]);
  expect(parsed.hot.subtypes).toEqual(filters.hot.subtypes);
  expect(parsed.common.search).toBe('');
  expect(filters.hot.capacityFilters).toHaveLength(1);
  expect(filters.common.statuses).toEqual([]);
  expect(buildBucketRpcFilters(filters, 'HOT')).toHaveProperty('capacity_filters');
});
