import type { ExplorerFilters, ObjectTypeCode } from '../types/domain';

export type FacetKey =
  | 'labels'
  | 'amenities'
  | 'openNow'
  | 'capacity'
  | 'itineraryDifficulty'
  | 'elevationGain';

function includesAny(selectedTypes: ObjectTypeCode[], candidates: ObjectTypeCode[]): boolean {
  return selectedTypes.some((type) => candidates.includes(type));
}

export function getVisibleFacets(selectedTypes: ObjectTypeCode[]): FacetKey[] {
  if (selectedTypes.length === 0) {
    return ['labels', 'amenities', 'openNow', 'capacity', 'itineraryDifficulty'];
  }

  const facets: FacetKey[] = ['labels', 'amenities', 'openNow'];

  if (includesAny(selectedTypes, ['HOT'])) {
    facets.push('capacity');
  }

  if (includesAny(selectedTypes, ['ITI'])) {
    facets.push('itineraryDifficulty', 'elevationGain');
  }

  return facets;
}

export function buildRpcFilters(filters: ExplorerFilters): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  if (filters.openNow) {
    payload.open_now = true;
  }

  if (filters.labels.length > 0) {
    payload.classifications_any_codes = filters.labels;
  }

  if (filters.amenities.length > 0) {
    payload.amenities_any_codes = filters.amenities;
  }

  if (filters.capacityMetricCode && (filters.capacityMin != null || filters.capacityMax != null)) {
    payload.capacity_filters = [
      {
        code: filters.capacityMetricCode,
        min: filters.capacityMin,
        max: filters.capacityMax,
      },
    ];
  }

  if (filters.itineraryDifficultyMin != null || filters.itineraryDifficultyMax != null || filters.elevationGainMin != null) {
    payload.itinerary = {
      difficulty_min: filters.itineraryDifficultyMin,
      difficulty_max: filters.itineraryDifficultyMax,
      elevation_gain_min: filters.elevationGainMin,
    };
  }

  if (filters.bbox) {
    payload.bbox = filters.bbox;
  }

  if (filters.polygon) {
    payload.polygon_geojson = filters.polygon;
  }

  return payload;
}