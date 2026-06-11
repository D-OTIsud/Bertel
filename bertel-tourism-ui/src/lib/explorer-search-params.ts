import type { ExplorerBucketKey, ExplorerFilters, ExplorerStatusFilter } from '@/types/domain';
import { DEFAULT_EXPLORER_FILTERS, EXPLORER_BUCKET_OPTIONS, normalizeExplorerFilters } from '@/utils/facets';

const EXPLORER_BUCKETS: ExplorerBucketKey[] = EXPLORER_BUCKET_OPTIONS.map((bucket) => bucket.code);
const EXPLORER_STATUS_VALUES: readonly ExplorerStatusFilter[] = ['published', 'draft'];

function parseCapacityFilters(value: string | null): Array<{ code: string; min?: number; max?: number }> | undefined {
  if (!value) {
    return undefined;
  }

  const filters = value
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean)
    .flatMap((item) => {
      const [code = '', minRaw = '', maxRaw = ''] = item.split(':');
      if (!code) {
        return [];
      }
      const min = parseOptionalNumber(minRaw);
      const max = parseOptionalNumber(maxRaw);
      return [{ code, min, max }];
    });

  return filters.length > 0 ? filters : undefined;
}

function serializeCapacityFilters(filters: Array<{ code: string; min?: number; max?: number }>): string | null {
  const encoded = filters
    .filter((filter) => filter.code && (filter.min != null || filter.max != null))
    .map((filter) => `${filter.code}:${filter.min ?? ''}:${filter.max ?? ''}`)
    .join(';');

  return encoded || null;
}

function normalizeHotTaxonomyDomain(domain: string): string {
  const normalized = domain.trim().toLowerCase();
  return normalized === 'type_hot' ? 'taxonomy_hot' : domain;
}

export function parseSearchParams(searchParams: URLSearchParams): Partial<ExplorerFilters> {
  const bucketsParam = searchParams.get('buckets');
  const selectedBuckets =
    bucketsParam !== null
      ? bucketsParam.split(',').filter((bucket): bucket is ExplorerBucketKey => EXPLORER_BUCKETS.includes(bucket as ExplorerBucketKey))
      : undefined;

  const labelsAny = searchParams.get('labels')?.split(',').map((item) => item.trim()).filter(Boolean) ?? undefined;
  const rankedLabelSchemeCode = searchParams.get('rankedLabel')?.trim() || undefined;
  const accessibilityDisabilityTypesAny =
    searchParams.get('accessibilityTypes')?.split(',').map((item) => item.trim()).filter(Boolean) as
      | ExplorerFilters['common']['accessibilityDisabilityTypesAny']
      | undefined;
  const accessibilityAmenityCodesAny = searchParams.get('accessibilityAmenities')?.split(',').map((item) => item.trim()).filter(Boolean) ?? undefined;
  const sustainabilityCategoryCodesAny = searchParams.get('sustainabilityCategories')?.split(',').map((item) => item.trim()).filter(Boolean) ?? undefined;
  const sustainabilityActionCodesAny = searchParams.get('sustainabilityActions')?.split(',').map((item) => item.trim()).filter(Boolean) ?? undefined;
  const statuses =
    searchParams
      .get('status')
      ?.split(',')
      .map((item) => item.trim().toLowerCase())
      .filter((item): item is ExplorerStatusFilter => (EXPLORER_STATUS_VALUES as readonly string[]).includes(item)) ?? undefined;
  const hotSubtypes = searchParams.get('hotSubtypes')?.split(',').filter(Boolean) ?? undefined;
  const hotTaxonomy = (searchParams.get('hotTaxonomy') ?? searchParams.get('hotClassifications'))?.split(',').filter(Boolean).flatMap((value) => {
    const [domain = '', code = ''] = value.split(':');
    if (!domain || !code) {
      return [];
    }
    return [{ domain: normalizeHotTaxonomyDomain(domain), code }];
  }) ?? undefined;

  const itiPractices = searchParams.get('itiPractices')?.split(',').filter(Boolean) ?? undefined;
  const commonPatch = {
    ...(searchParams.get('search') != null && { search: searchParams.get('search') ?? '' }),
    // Support both 'cities' (multi, new) and legacy 'city' (single, old bookmarks).
    ...(searchParams.get('cities') != null && {
      cities: (searchParams.get('cities') ?? '').split(',').filter(Boolean),
    }),
    ...(searchParams.get('city') != null && !searchParams.has('cities') && {
      cities: [searchParams.get('city') ?? ''].filter(Boolean),
    }),
    ...(searchParams.get('lieuDit') != null && { lieuDit: searchParams.get('lieuDit') ?? '' }),
    ...((searchParams.get('pmr') != null || accessibilityDisabilityTypesAny !== undefined || accessibilityAmenityCodesAny !== undefined) && {
      pmr:
        searchParams.get('pmr') === 'true' ||
        Boolean(accessibilityDisabilityTypesAny?.length) ||
        Boolean(accessibilityAmenityCodesAny?.length),
    }),
    ...(accessibilityDisabilityTypesAny !== undefined && { accessibilityDisabilityTypesAny }),
    ...(accessibilityAmenityCodesAny !== undefined && { accessibilityAmenityCodesAny }),
    ...((searchParams.get('sustainable') != null || sustainabilityCategoryCodesAny !== undefined || sustainabilityActionCodesAny !== undefined) && {
      sustainable:
        searchParams.get('sustainable') === 'true' ||
        Boolean(sustainabilityCategoryCodesAny?.length) ||
        Boolean(sustainabilityActionCodesAny?.length),
    }),
    ...(sustainabilityCategoryCodesAny !== undefined && { sustainabilityCategoryCodesAny }),
    ...(sustainabilityActionCodesAny !== undefined && { sustainabilityActionCodesAny }),
    ...(searchParams.get('pets') != null && { petsAccepted: searchParams.get('pets') === 'true' }),
    ...(searchParams.get('openNow') != null && { openNow: searchParams.get('openNow') === 'true' }),
    ...(labelsAny !== undefined && { labelsAny }),
    ...(rankedLabelSchemeCode !== undefined && { rankedLabelSchemeCode }),
    ...(statuses !== undefined && { statuses }),
  };

  const itiPatch = {
    ...(searchParams.get('itiIsLoop') != null && {
      isLoop: searchParams.get('itiIsLoop') === 'true' ? true : searchParams.get('itiIsLoop') === 'false' ? false : null,
    }),
    ...(parseOptionalNumber(searchParams.get('itiDifficultyMin')) !== undefined && {
      difficultyMin: parseOptionalNumber(searchParams.get('itiDifficultyMin')),
    }),
    ...(parseOptionalNumber(searchParams.get('itiDifficultyMax')) !== undefined && {
      difficultyMax: parseOptionalNumber(searchParams.get('itiDifficultyMax')),
    }),
    ...(parseOptionalNumber(searchParams.get('itiDistanceMinKm')) !== undefined && {
      distanceMinKm: parseOptionalNumber(searchParams.get('itiDistanceMinKm')),
    }),
    ...(parseOptionalNumber(searchParams.get('itiDistanceMaxKm')) !== undefined && {
      distanceMaxKm: parseOptionalNumber(searchParams.get('itiDistanceMaxKm')),
    }),
    ...(parseOptionalNumber(searchParams.get('itiDurationMinH')) !== undefined && {
      durationMinH: parseOptionalNumber(searchParams.get('itiDurationMinH')),
    }),
    ...(parseOptionalNumber(searchParams.get('itiDurationMaxH')) !== undefined && {
      durationMaxH: parseOptionalNumber(searchParams.get('itiDurationMaxH')),
    }),
    ...(itiPractices !== undefined && { practicesAny: itiPractices }),
  };

  return {
    ...(selectedBuckets !== undefined && selectedBuckets.length > 0 && { selectedBuckets }),
    ...(Object.keys(commonPatch).length > 0 && {
      common: {
        ...DEFAULT_EXPLORER_FILTERS.common,
        ...commonPatch,
      },
    }),
    ...(hotSubtypes !== undefined || hotTaxonomy !== undefined || parseCapacityFilters(searchParams.get('hotCapacity')) !== undefined
      ? {
          hot: {
            ...DEFAULT_EXPLORER_FILTERS.hot,
            ...(hotSubtypes !== undefined && { subtypes: hotSubtypes as ExplorerFilters['hot']['subtypes'] }),
            ...(hotTaxonomy !== undefined && { taxonomy: hotTaxonomy }),
            ...(parseCapacityFilters(searchParams.get('hotCapacity')) !== undefined && {
              capacityFilters: parseCapacityFilters(searchParams.get('hotCapacity')),
            }),
          },
        }
      : {}),
    ...(parseCapacityFilters(searchParams.get('resCapacity')) !== undefined
      ? {
          res: {
            ...DEFAULT_EXPLORER_FILTERS.res,
            capacityFilters: parseCapacityFilters(searchParams.get('resCapacity')) ?? DEFAULT_EXPLORER_FILTERS.res.capacityFilters,
          },
        }
      : {}),
    ...(Object.keys(itiPatch).length > 0 && {
      iti: {
        ...DEFAULT_EXPLORER_FILTERS.iti,
        ...itiPatch,
      },
    }),
  };
}

function parseOptionalNumber(s: string | null): number | undefined {
  if (s === null || s === '') return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

export function buildSearchParams(filters: ExplorerFilters): URLSearchParams {
  const normalizedFilters = normalizeExplorerFilters(filters);
  const p = new URLSearchParams();
  if (normalizedFilters.selectedBuckets.length > 0) {
    p.set('buckets', normalizedFilters.selectedBuckets.join(','));
  }
  if (normalizedFilters.common.labelsAny.length > 0) {
    p.set('labels', normalizedFilters.common.labelsAny.join(','));
  }
  if (normalizedFilters.common.rankedLabelSchemeCode) {
    p.set('rankedLabel', normalizedFilters.common.rankedLabelSchemeCode);
  }
  if (normalizedFilters.common.search) {
    p.set('search', normalizedFilters.common.search);
  }
  if (normalizedFilters.common.cities.length > 0) {
    p.set('cities', normalizedFilters.common.cities.join(','));
  }
  if (normalizedFilters.common.lieuDit) {
    p.set('lieuDit', normalizedFilters.common.lieuDit);
  }
  if (normalizedFilters.common.pmr) {
    p.set('pmr', 'true');
  }
  if (normalizedFilters.common.accessibilityDisabilityTypesAny.length > 0) {
    p.set('accessibilityTypes', normalizedFilters.common.accessibilityDisabilityTypesAny.join(','));
  }
  if (normalizedFilters.common.accessibilityAmenityCodesAny.length > 0) {
    p.set('accessibilityAmenities', normalizedFilters.common.accessibilityAmenityCodesAny.join(','));
  }
  if (normalizedFilters.common.sustainable) {
    p.set('sustainable', 'true');
  }
  if (normalizedFilters.common.sustainabilityCategoryCodesAny.length > 0) {
    p.set('sustainabilityCategories', normalizedFilters.common.sustainabilityCategoryCodesAny.join(','));
  }
  if (normalizedFilters.common.sustainabilityActionCodesAny.length > 0) {
    p.set('sustainabilityActions', normalizedFilters.common.sustainabilityActionCodesAny.join(','));
  }
  if (normalizedFilters.common.petsAccepted) {
    p.set('pets', 'true');
  }
  if (normalizedFilters.common.openNow) {
    p.set('openNow', 'true');
  }
  if (normalizedFilters.common.statuses.length > 0) {
    // Persist explicit status picks only. Empty array means "use the
    // session-aware default" (cf. resolveExplorerStatuses) and does NOT
    // belong in the URL — keeps shareable links shorter and survives a
    // role change between sessions.
    p.set('status', normalizedFilters.common.statuses.join(','));
  }
  if (normalizedFilters.hot.subtypes.length > 0) {
    p.set('hotSubtypes', normalizedFilters.hot.subtypes.join(','));
  }
  if (normalizedFilters.hot.taxonomy.length > 0) {
    p.set('hotTaxonomy', normalizedFilters.hot.taxonomy.map((item) => `${item.domain}:${item.code}`).join(','));
  }
  const hotCapacity = serializeCapacityFilters(normalizedFilters.hot.capacityFilters);
  if (hotCapacity) {
    p.set('hotCapacity', hotCapacity);
  }
  const resCapacity = serializeCapacityFilters(normalizedFilters.res.capacityFilters);
  if (resCapacity) {
    p.set('resCapacity', resCapacity);
  }
  if (normalizedFilters.iti.isLoop != null) {
    p.set('itiIsLoop', String(normalizedFilters.iti.isLoop));
  }
  if (normalizedFilters.iti.difficultyMin != null) {
    p.set('itiDifficultyMin', String(normalizedFilters.iti.difficultyMin));
  }
  if (normalizedFilters.iti.difficultyMax != null) {
    p.set('itiDifficultyMax', String(normalizedFilters.iti.difficultyMax));
  }
  if (normalizedFilters.iti.distanceMinKm != null) {
    p.set('itiDistanceMinKm', String(normalizedFilters.iti.distanceMinKm));
  }
  if (normalizedFilters.iti.distanceMaxKm != null) {
    p.set('itiDistanceMaxKm', String(normalizedFilters.iti.distanceMaxKm));
  }
  if (normalizedFilters.iti.durationMinH != null) {
    p.set('itiDurationMinH', String(normalizedFilters.iti.durationMinH));
  }
  if (normalizedFilters.iti.durationMaxH != null) {
    p.set('itiDurationMaxH', String(normalizedFilters.iti.durationMaxH));
  }
  if (normalizedFilters.iti.practicesAny.length > 0) {
    p.set('itiPractices', normalizedFilters.iti.practicesAny.join(','));
  }
  return p;
}
