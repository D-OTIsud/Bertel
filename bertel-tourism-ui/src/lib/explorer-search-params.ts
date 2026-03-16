import type { ExplorerFilters, ObjectTypeCode } from '@/types/domain';

const OBJECT_TYPES: ObjectTypeCode[] = ['HOT', 'RES', 'ACT', 'ITI', 'EVT'];

export function parseSearchParams(searchParams: URLSearchParams): Partial<ExplorerFilters> {
  const typesParam = searchParams.get('types');
  const selectedTypes =
    typesParam !== null
      ? typesParam.split(',').filter((t): t is ObjectTypeCode => OBJECT_TYPES.includes(t as ObjectTypeCode))
      : undefined;

  const search = searchParams.get('search') ?? undefined;
  const viewParam = searchParams.get('view');
  const view = viewParam === 'card' || viewParam === 'full' ? viewParam : undefined;

  const labelsParam = searchParams.get('labels');
  const labels = labelsParam ? labelsParam.split(',').filter(Boolean) : undefined;

  const amenitiesParam = searchParams.get('amenities');
  const amenities = amenitiesParam ? amenitiesParam.split(',').filter(Boolean) : undefined;

  const openNowParam = searchParams.get('openNow');
  const openNow =
    openNowParam === 'true' ? true : openNowParam === 'false' ? false : undefined;

  const capacityMetricCode = searchParams.get('capacityMetricCode') ?? undefined;
  const capacityMin = parseOptionalNumber(searchParams.get('capacityMin'));
  const capacityMax = parseOptionalNumber(searchParams.get('capacityMax'));
  const itineraryDifficultyMin = parseOptionalNumber(searchParams.get('itineraryDifficultyMin'));
  const itineraryDifficultyMax = parseOptionalNumber(searchParams.get('itineraryDifficultyMax'));
  const elevationGainMin = parseOptionalNumber(searchParams.get('elevationGainMin'));

  return {
    ...(selectedTypes !== undefined && selectedTypes.length > 0 && { selectedTypes }),
    ...(search !== undefined && { search }),
    ...(view !== undefined && { view }),
    ...(labels !== undefined && { labels }),
    ...(amenities !== undefined && { amenities }),
    ...(openNow !== undefined && { openNow }),
    ...(capacityMetricCode && { capacityMetricCode }),
    ...(capacityMin !== undefined && { capacityMin }),
    ...(capacityMax !== undefined && { capacityMax }),
    ...(itineraryDifficultyMin !== undefined && { itineraryDifficultyMin }),
    ...(itineraryDifficultyMax !== undefined && { itineraryDifficultyMax }),
    ...(elevationGainMin !== undefined && { elevationGainMin }),
  };
}

function parseOptionalNumber(s: string | null): number | undefined {
  if (s === null || s === '') return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

export function buildSearchParams(filters: ExplorerFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (filters.selectedTypes.length > 0) {
    p.set('types', filters.selectedTypes.join(','));
  }
  if (filters.search) {
    p.set('search', filters.search);
  }
  if (filters.view && filters.view !== 'card') {
    p.set('view', filters.view);
  }
  if (filters.labels.length > 0) {
    p.set('labels', filters.labels.join(','));
  }
  if (filters.amenities.length > 0) {
    p.set('amenities', filters.amenities.join(','));
  }
  if (filters.openNow) {
    p.set('openNow', 'true');
  }
  if (filters.capacityMetricCode) {
    p.set('capacityMetricCode', filters.capacityMetricCode);
  }
  if (filters.capacityMin != null) {
    p.set('capacityMin', String(filters.capacityMin));
  }
  if (filters.capacityMax != null) {
    p.set('capacityMax', String(filters.capacityMax));
  }
  if (filters.itineraryDifficultyMin != null) {
    p.set('itineraryDifficultyMin', String(filters.itineraryDifficultyMin));
  }
  if (filters.itineraryDifficultyMax != null) {
    p.set('itineraryDifficultyMax', String(filters.itineraryDifficultyMax));
  }
  if (filters.elevationGainMin != null) {
    p.set('elevationGainMin', String(filters.elevationGainMin));
  }
  return p;
}
