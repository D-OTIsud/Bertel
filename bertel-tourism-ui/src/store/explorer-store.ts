import { create } from 'zustand';
import type { ExplorerFilters, GeoPolygon, ObjectTypeCode } from '../types/domain';

interface ExplorerState extends ExplorerFilters {
  toggleType: (type: ObjectTypeCode) => void;
  setSearch: (search: string) => void;
  setView: (view: 'card' | 'full') => void;
  toggleLabel: (label: string) => void;
  toggleAmenity: (amenity: string) => void;
  setOpenNow: (value: boolean) => void;
  setCapacityMetricCode: (value?: string) => void;
  setCapacityRange: (min?: number, max?: number) => void;
  setItineraryDifficulty: (min?: number, max?: number) => void;
  setElevationGainMin: (value?: number) => void;
  setPolygon: (polygon: GeoPolygon | null, bbox?: [number, number, number, number] | null) => void;
  resetSpatialFilter: () => void;
  resetAll: () => void;
  /** Apply partial filters from URL (e.g. after navigation) */
  setFiltersFromUrl: (partial: Partial<ExplorerFilters>) => void;
  /** Replace URL-controlled filters (missing keys fall back to defaults). */
  replaceFiltersFromUrl: (partial: Partial<ExplorerFilters>) => void;
}

const initialState: ExplorerFilters = {
  selectedTypes: ['HOT', 'RES', 'ITI'],
  search: '',
  labels: [],
  amenities: [],
  openNow: false,
  capacityMetricCode: 'beds',
  capacityMin: undefined,
  capacityMax: undefined,
  itineraryDifficultyMin: undefined,
  itineraryDifficultyMax: undefined,
  elevationGainMin: undefined,
  bbox: null,
  polygon: null,
  view: 'card',
};

export const useExplorerStore = create<ExplorerState>((set) => ({
  ...initialState,
  toggleType: (type) =>
    set((state) => ({
      selectedTypes: state.selectedTypes.includes(type)
        ? state.selectedTypes.filter((item) => item !== type)
        : [...state.selectedTypes, type],
    })),
  setSearch: (search) => set({ search }),
  setView: (view) => set({ view }),
  toggleLabel: (label) =>
    set((state) => ({
      labels: state.labels.includes(label)
        ? state.labels.filter((item) => item !== label)
        : [...state.labels, label],
    })),
  toggleAmenity: (amenity) =>
    set((state) => ({
      amenities: state.amenities.includes(amenity)
        ? state.amenities.filter((item) => item !== amenity)
        : [...state.amenities, amenity],
    })),
  setOpenNow: (value) => set({ openNow: value }),
  setCapacityMetricCode: (value) => set({ capacityMetricCode: value }),
  setCapacityRange: (min, max) => set({ capacityMin: min, capacityMax: max }),
  setItineraryDifficulty: (min, max) => set({ itineraryDifficultyMin: min, itineraryDifficultyMax: max }),
  setElevationGainMin: (value) => set({ elevationGainMin: value }),
  setPolygon: (polygon, bbox = null) => set({ polygon, bbox }),
  resetSpatialFilter: () => set({ polygon: null, bbox: null }),
  resetAll: () => set(initialState),
  setFiltersFromUrl: (partial) =>
    set((state) => ({
      ...state,
      ...(partial.selectedTypes !== undefined && { selectedTypes: partial.selectedTypes }),
      ...(partial.search !== undefined && { search: partial.search }),
      ...(partial.view !== undefined && { view: partial.view }),
      ...(partial.labels !== undefined && { labels: partial.labels }),
      ...(partial.amenities !== undefined && { amenities: partial.amenities }),
      ...(partial.openNow !== undefined && { openNow: partial.openNow }),
      ...(partial.capacityMetricCode !== undefined && { capacityMetricCode: partial.capacityMetricCode }),
      ...(partial.capacityMin !== undefined && { capacityMin: partial.capacityMin }),
      ...(partial.capacityMax !== undefined && { capacityMax: partial.capacityMax }),
      ...(partial.itineraryDifficultyMin !== undefined && { itineraryDifficultyMin: partial.itineraryDifficultyMin }),
      ...(partial.itineraryDifficultyMax !== undefined && { itineraryDifficultyMax: partial.itineraryDifficultyMax }),
      ...(partial.elevationGainMin !== undefined && { elevationGainMin: partial.elevationGainMin }),
    })),
  replaceFiltersFromUrl: (partial) =>
    set((state) => ({
      ...state,
      selectedTypes: partial.selectedTypes ?? initialState.selectedTypes,
      search: partial.search ?? initialState.search,
      view: partial.view ?? initialState.view,
      labels: partial.labels ?? initialState.labels,
      amenities: partial.amenities ?? initialState.amenities,
      openNow: partial.openNow ?? initialState.openNow,
      capacityMetricCode: partial.capacityMetricCode ?? initialState.capacityMetricCode,
      capacityMin: partial.capacityMin ?? initialState.capacityMin,
      capacityMax: partial.capacityMax ?? initialState.capacityMax,
      itineraryDifficultyMin: partial.itineraryDifficultyMin ?? initialState.itineraryDifficultyMin,
      itineraryDifficultyMax: partial.itineraryDifficultyMax ?? initialState.itineraryDifficultyMax,
      elevationGainMin: partial.elevationGainMin ?? initialState.elevationGainMin,
      // URL is the source of truth for filters; reset spatial-only state.
      polygon: initialState.polygon,
      bbox: initialState.bbox,
    })),
}));