import type { ExplorerBucketKey, ExplorerFilters, ExplorerStatusFilter } from '@/types/domain';
import { DEFAULT_EXPLORER_FILTERS, EXPLORER_BUCKET_OPTIONS } from '@/utils/facets';

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
    ...(searchParams.get('pmr') != null && { pmr: searchParams.get('pmr') === 'true' }),
    ...(searchParams.get('pets') != null && { petsAccepted: searchParams.get('pets') === 'true' }),
    ...(searchParams.get('openNow') != null && { openNow: searchParams.get('openNow') === 'true' }),
    ...(labelsAny !== undefined && { labelsAny }),
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
  const p = new URLSearchParams();
  if (filters.selectedBuckets.length > 0) {
    p.set('buckets', filters.selectedBuckets.join(','));
  }
  if (filters.common.labelsAny.length > 0) {
    p.set('labels', filters.common.labelsAny.join(','));
  }
  if (filters.common.search) {
    p.set('search', filters.common.search);
  }
  if (filters.common.cities.length > 0) {
    p.set('cities', filters.common.cities.join(','));
  }
  if (filters.common.lieuDit) {
    p.set('lieuDit', filters.common.lieuDit);
  }
  if (filters.common.pmr) {
    p.set('pmr', 'true');
  }
  if (filters.common.petsAccepted) {
    p.set('pets', 'true');
  }
  if (filters.common.openNow) {
    p.set('openNow', 'true');
  }
  if (filters.common.statuses.length > 0) {
    // Persist explicit status picks only. Empty array means "use the
    // session-aware default" (cf. resolveExplorerStatuses) and does NOT
    // belong in the URL — keeps shareable links shorter and survives a
    // role change between sessions.
    p.set('status', filters.common.statuses.join(','));
  }
  if (filters.hot.subtypes.length > 0) {
    p.set('hotSubtypes', filters.hot.subtypes.join(','));
  }
  if (filters.hot.taxonomy.length > 0) {
    p.set('hotTaxonomy', filters.hot.taxonomy.map((item) => `${item.domain}:${item.code}`).join(','));
  }
  const hotCapacity = serializeCapacityFilters(filters.hot.capacityFilters);
  if (hotCapacity) {
    p.set('hotCapacity', hotCapacity);
  }
  const resCapacity = serializeCapacityFilters(filters.res.capacityFilters);
  if (resCapacity) {
    p.set('resCapacity', resCapacity);
  }
  if (filters.iti.isLoop != null) {
    p.set('itiIsLoop', String(filters.iti.isLoop));
  }
  if (filters.iti.difficultyMin != null) {
    p.set('itiDifficultyMin', String(filters.iti.difficultyMin));
  }
  if (filters.iti.difficultyMax != null) {
    p.set('itiDifficultyMax', String(filters.iti.difficultyMax));
  }
  if (filters.iti.distanceMinKm != null) {
    p.set('itiDistanceMinKm', String(filters.iti.distanceMinKm));
  }
  if (filters.iti.distanceMaxKm != null) {
    p.set('itiDistanceMaxKm', String(filters.iti.distanceMaxKm));
  }
  if (filters.iti.durationMinH != null) {
    p.set('itiDurationMinH', String(filters.iti.durationMinH));
  }
  if (filters.iti.durationMaxH != null) {
    p.set('itiDurationMaxH', String(filters.iti.durationMaxH));
  }
  if (filters.iti.practicesAny.length > 0) {
    p.set('itiPractices', filters.iti.practicesAny.join(','));
  }
  return p;
}
