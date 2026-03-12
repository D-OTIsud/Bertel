import { create } from 'zustand';
import type { ExplorerFilters, GeoPolygon, ObjectTypeCode } from '../types/domain';

interface ExplorerState extends ExplorerFilters {
  toggleType: (type: ObjectTypeCode) => void;
  setSearch: (search: string) => void;
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
}));