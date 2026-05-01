import { create } from 'zustand';
import type {
  BackendObjectTypeCode,
  CapacityFilter,
  ExplorerFilters,
  ExplorerBucketKey,
  ExplorerStatusFilter,
  GeoPolygon,
  MeetingRoomFilter,
} from '../types/domain';
import { mergeSelectedObjectIds } from '../utils/explorer-selection';
import { DEFAULT_EXPLORER_FILTERS, DEFAULT_HOT_SUBTYPES } from '../utils/facets';

interface ExplorerState extends ExplorerFilters {
  selectedObjectIds: string[];
  visibleObjectIds: string[];
  selectedCardId: string | null;

  toggleBucket: (bucket: ExplorerBucketKey) => void;
  setSearch: (search: string) => void;
  setCities: (cities: string[]) => void;
  setLieuDit: (lieuDit: string) => void;
  setPmr: (value: boolean) => void;
  setPetsAccepted: (value: boolean) => void;
  setOpenNow: (value: boolean) => void;
  toggleLabel: (label: string) => void;
  clearLabels: () => void;
  /**
   * Toggle a publication-status entry in the Explorer filter set.
   * Empty array = "let the server use its default (published)".
   * The FiltersPanel only renders this control for users that have
   * `canEditObjects = true`; for everyone else the array stays empty.
   */
  toggleStatus: (status: ExplorerStatusFilter) => void;
  setStatuses: (statuses: ExplorerStatusFilter[]) => void;
  toggleSelectedObject: (objectId: string) => void;
  addSelectedObjects: (objectIds: string[]) => void;
  clearSelection: () => void;
  setVisibleObjectIds: (objectIds: string[]) => void;
  selectAllVisible: () => void;
  selectCard: (id: string) => void;
  clearSelectedCard: () => void;

  toggleHotSubtype: (type: BackendObjectTypeCode) => void;
  toggleHotTaxonomy: (domain: string, code: string) => void;
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
      statuses: partial.common?.statuses ?? currentBase.common.statuses,
      ...(replace ? { polygon: fallback.common.polygon, bbox: fallback.common.bbox } : {}),
    },
    hot: {
      ...currentBase.hot,
      ...partial.hot,
      taxonomy: partial.hot?.taxonomy ?? currentBase.hot.taxonomy,
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
  selectedCardId: null,

  toggleBucket: (bucket) =>
    set((state) => ({
      selectedBuckets: state.selectedBuckets.includes(bucket)
        ? state.selectedBuckets.filter((item) => item !== bucket)
        : [...state.selectedBuckets, bucket],
    })),
  setSearch: (search) => set((state) => ({ common: { ...state.common, search } })),
  setCities: (cities) => set((state) => ({ common: { ...state.common, cities } })),
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
  toggleStatus: (status) =>
    set((state) => {
      const exists = state.common.statuses.includes(status);
      const next = exists
        ? state.common.statuses.filter((entry) => entry !== status)
        : [...state.common.statuses, status];
      return { common: { ...state.common, statuses: next } };
    }),
  setStatuses: (statuses) =>
    set((state) => ({
      common: { ...state.common, statuses: [...new Set(statuses)] },
    })),
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
  addSelectedObjects: (objectIds) =>
    set((state) => {
      const selectedObjectIds = mergeSelectedObjectIds(state.selectedObjectIds, objectIds);
      return selectedObjectIds.length === state.selectedObjectIds.length ? state : { ...state, selectedObjectIds };
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
  selectCard: (id) => set({ selectedCardId: id }),
  clearSelectedCard: () => set({ selectedCardId: null }),

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
  toggleHotTaxonomy: (domain, code) =>
    set((state) => {
      const exists = state.hot.taxonomy.some((item) => item.domain === domain && item.code === code);
      return {
        hot: {
          ...state.hot,
          taxonomy: exists
            ? state.hot.taxonomy.filter((item) => !(item.domain === domain && item.code === code))
            : [...state.hot.taxonomy, { domain, code }],
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
