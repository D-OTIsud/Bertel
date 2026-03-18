import { create } from 'zustand';
import type { BackendObjectTypeCode, CapacityFilter, ExplorerFilters, ExplorerBucketKey, GeoPolygon, MeetingRoomFilter } from '../types/domain';
import { DEFAULT_EXPLORER_FILTERS, DEFAULT_HOT_SUBTYPES } from '../utils/facets';

interface ExplorerState extends ExplorerFilters {
  selectedObjectIds: string[];
  visibleObjectIds: string[];

  toggleBucket: (bucket: ExplorerBucketKey) => void;
  setSearch: (search: string) => void;
  setCity: (city: string) => void;
  setLieuDit: (lieuDit: string) => void;
  setPmr: (value: boolean) => void;
  setPetsAccepted: (value: boolean) => void;
  setOpenNow: (value: boolean) => void;
  toggleLabel: (label: string) => void;
  clearLabels: () => void;
  toggleSelectedObject: (objectId: string) => void;
  clearSelection: () => void;
  setVisibleObjectIds: (objectIds: string[]) => void;
  selectAllVisible: () => void;

  toggleHotSubtype: (type: BackendObjectTypeCode) => void;
  toggleHotClassification: (schemeCode: string, valueCode: string) => void;
  setHotCapacityFilter: (code: string, min?: number, max?: number) => void;
  setResCapacityFilter: (code: string, min?: number, max?: number) => void;
  setHotMeetingRoom: (patch: Partial<MeetingRoomFilter>) => void;
  setItiIsLoop: (value: boolean | null) => void;
  setItiDifficulty: (min?: number, max?: number) => void;
  setItiDistance: (min?: number, max?: number) => void;
  setItiDuration: (min?: number, max?: number) => void;
  toggleItiPractice: (code: string) => void;
  setPolygon: (polygon: GeoPolygon | null, bbox?: [number, number, number, number] | null) => void;
  resetSpatialFilter: () => void;
  resetAll: () => void;
  setFiltersFromUrl: (partial: Partial<ExplorerFilters>) => void;
  replaceFiltersFromUrl: (partial: Partial<ExplorerFilters>) => void;
}

function upsertCapacityFilter(filters: CapacityFilter[], code: string, min?: number, max?: number): CapacityFilter[] {
  const next = filters.filter((filter) => filter.code !== code);
  if (min == null && max == null) {
    return next;
  }
  return [...next, { code, min, max }];
}

function mergeFilters(current: ExplorerFilters, partial: Partial<ExplorerFilters>, replace = false): ExplorerFilters {
  const fallback = DEFAULT_EXPLORER_FILTERS;
  const currentBase = replace ? fallback : current;

  return {
    selectedBuckets: partial.selectedBuckets ?? currentBase.selectedBuckets,
    common: {
      ...currentBase.common,
      ...partial.common,
      ...(replace ? { polygon: fallback.common.polygon, bbox: fallback.common.bbox } : {}),
    },
    hot: {
      ...currentBase.hot,
      ...partial.hot,
      classifications: partial.hot?.classifications ?? currentBase.hot.classifications,
      capacityFilters: partial.hot?.capacityFilters ?? currentBase.hot.capacityFilters,
      meetingRoom: {
        ...currentBase.hot.meetingRoom,
        ...partial.hot?.meetingRoom,
      },
    },
    res: {
      ...currentBase.res,
      ...partial.res,
      capacityFilters: partial.res?.capacityFilters ?? currentBase.res.capacityFilters,
    },
    iti: {
      ...currentBase.iti,
      ...partial.iti,
      practicesAny: partial.iti?.practicesAny ?? currentBase.iti.practicesAny,
    },
    act: {
      ...currentBase.act,
      ...partial.act,
      environmentTagsAny: partial.act?.environmentTagsAny ?? currentBase.act.environmentTagsAny,
    },
    vis: currentBase.vis,
    srv: currentBase.srv,
  };
}

export const useExplorerStore = create<ExplorerState>((set) => ({
  ...DEFAULT_EXPLORER_FILTERS,
  selectedObjectIds: [],
  visibleObjectIds: [],

  toggleBucket: (bucket) =>
    set((state) => ({
      selectedBuckets: state.selectedBuckets.includes(bucket)
        ? state.selectedBuckets.filter((item) => item !== bucket)
        : [...state.selectedBuckets, bucket],
    })),
  setSearch: (search) => set((state) => ({ common: { ...state.common, search } })),
  setCity: (city) => set((state) => ({ common: { ...state.common, city, ...(city ? {} : { lieuDit: '' }) } })),
  setLieuDit: (lieuDit) => set((state) => ({ common: { ...state.common, lieuDit } })),
  setPmr: (value) => set((state) => ({ common: { ...state.common, pmr: value } })),
  setPetsAccepted: (value) => set((state) => ({ common: { ...state.common, petsAccepted: value } })),
  setOpenNow: (value) => set((state) => ({ common: { ...state.common, openNow: value } })),
  toggleLabel: (label) =>
    set((state) => {
      const needle = String(label).trim();
      if (!needle) return state;
      const exists = state.common.labelsAny.includes(needle);
      return {
        common: {
          ...state.common,
          labelsAny: exists ? state.common.labelsAny.filter((item) => item !== needle) : [...state.common.labelsAny, needle],
        },
      };
    }),
  clearLabels: () => set((state) => ({ common: { ...state.common, labelsAny: [] } })),
  toggleSelectedObject: (objectId) =>
    set((state) => {
      const needle = String(objectId).trim();
      if (!needle) return state;
      const exists = state.selectedObjectIds.includes(needle);

      return {
        ...state,
        selectedObjectIds: exists ? state.selectedObjectIds.filter((id) => id !== needle) : [...state.selectedObjectIds, needle],
      };
    }),
  clearSelection: () => set((state) => ({ ...state, selectedObjectIds: [] })),
  setVisibleObjectIds: (objectIds) =>
    set((state) => ({
      ...state,
      visibleObjectIds: [...new Set(objectIds.map((id) => String(id).trim()).filter(Boolean))],
    })),
  selectAllVisible: () =>
    set((state) => ({
      ...state,
      selectedObjectIds: state.visibleObjectIds.length > 0 ? [...state.visibleObjectIds] : [],
    })),

  toggleHotSubtype: (type) =>
    set((state) => {
      const nextSubtypes = state.hot.subtypes.includes(type)
        ? state.hot.subtypes.filter((item) => item !== type)
        : [...state.hot.subtypes, type];

      return {
        hot: {
          ...state.hot,
          subtypes: nextSubtypes.length > 0 ? nextSubtypes : [...DEFAULT_HOT_SUBTYPES],
        },
      };
    }),
  toggleHotClassification: (schemeCode, valueCode) =>
    set((state) => {
      const exists = state.hot.classifications.some((item) => item.schemeCode === schemeCode && item.valueCode === valueCode);
      return {
        hot: {
          ...state.hot,
          classifications: exists
            ? state.hot.classifications.filter((item) => !(item.schemeCode === schemeCode && item.valueCode === valueCode))
            : [...state.hot.classifications, { schemeCode, valueCode }],
        },
      };
    }),
  setHotCapacityFilter: (code, min, max) =>
    set((state) => ({
      hot: {
        ...state.hot,
        capacityFilters: upsertCapacityFilter(state.hot.capacityFilters, code, min, max),
      },
    })),
  setResCapacityFilter: (code, min, max) =>
    set((state) => ({
      res: {
        ...state.res,
        capacityFilters: upsertCapacityFilter(state.res.capacityFilters, code, min, max),
      },
    })),
  setHotMeetingRoom: (patch) =>
    set((state) => ({
      hot: {
        ...state.hot,
        meetingRoom: {
          ...state.hot.meetingRoom,
          ...patch,
        },
      },
    })),
  setItiIsLoop: (value) => set((state) => ({ iti: { ...state.iti, isLoop: value } })),
  setItiDifficulty: (min, max) => set((state) => ({ iti: { ...state.iti, difficultyMin: min, difficultyMax: max } })),
  setItiDistance: (min, max) => set((state) => ({ iti: { ...state.iti, distanceMinKm: min, distanceMaxKm: max } })),
  setItiDuration: (min, max) => set((state) => ({ iti: { ...state.iti, durationMinH: min, durationMaxH: max } })),
  toggleItiPractice: (code) =>
    set((state) => ({
      iti: {
        ...state.iti,
        practicesAny: state.iti.practicesAny.includes(code)
          ? state.iti.practicesAny.filter((item) => item !== code)
          : [...state.iti.practicesAny, code],
      },
    })),
  setPolygon: (polygon, bbox = null) => set((state) => ({ common: { ...state.common, polygon, bbox } })),
  resetSpatialFilter: () => set((state) => ({ common: { ...state.common, polygon: null, bbox: null } })),
  resetAll: () => set(DEFAULT_EXPLORER_FILTERS),
  setFiltersFromUrl: (partial) => set((state) => mergeFilters(state, partial, false)),
  replaceFiltersFromUrl: (partial) => set((state) => mergeFilters(state, partial, true)),
}));