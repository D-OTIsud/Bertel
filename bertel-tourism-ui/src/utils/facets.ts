import type {
  BackendObjectTypeCode,
  CapacityFilter,
  ClassificationRef,
  ExplorerBucketKey,
  ExplorerCommonFilters,
  ExplorerFilters,
  MeetingRoomFilter,
  ObjectCard,
  ObjectTypeCode,
} from '../types/domain';

export const EXPLORER_BUCKET_OPTIONS: Array<{ code: ExplorerBucketKey; label: string }> = [
  { code: 'HOT', label: 'Hebergements' },
  { code: 'RES', label: 'Restaurants' },
  { code: 'ITI', label: 'Itineraires' },
  { code: 'ACT', label: 'Activites' },
  { code: 'EVT', label: 'Evenements' },
  { code: 'VIS', label: 'Visites' },
  { code: 'SRV', label: 'Services' },
];

export const HOT_BUCKET_TYPES: BackendObjectTypeCode[] = ['HOT', 'HPA', 'HLO', 'CAMP', 'RVA'];
export const DEFAULT_HOT_SUBTYPES: BackendObjectTypeCode[] = [...HOT_BUCKET_TYPES];
export const HOT_CLASSIFICATION_SCHEME_CODES = ['type_hot', 'hot_stars', 'camp_stars', 'meuble_stars'] as const;

export const EXPLORER_BUCKET_TYPE_MAP: Record<ExplorerBucketKey, BackendObjectTypeCode[]> = {
  HOT: HOT_BUCKET_TYPES,
  RES: ['RES'],
  ITI: ['ITI'],
  EVT: ['FMA'],
  ACT: ['LOI'],
  VIS: ['PCU', 'PNA', 'VIL'],
  SRV: ['COM', 'PSV', 'ASC'],
};

export const DEFAULT_COMMON_FILTERS: ExplorerCommonFilters = {
  search: '',
  city: '',
  lieuDit: '',
  pmr: false,
  petsAccepted: false,
  openNow: false,
  labelsAny: [],
  bbox: null,
  polygon: null,
};

export const DEFAULT_EXPLORER_FILTERS: ExplorerFilters = {
  selectedBuckets: [],
  common: DEFAULT_COMMON_FILTERS,
  hot: {
    subtypes: [...DEFAULT_HOT_SUBTYPES],
    classifications: [],
    capacityFilters: [],
    meetingRoom: {},
  },
  res: {
    capacityFilters: [],
  },
  iti: {
    isLoop: null,
    practicesAny: [],
  },
  act: {
    environmentTagsAny: [],
  },
  vis: {},
  srv: {},
};

function cleanString(value: string | null | undefined): string {
  return String(value ?? '').trim();
}

function normalizeCapacityFilters(filters: CapacityFilter[]): CapacityFilter[] {
  return filters.filter((filter) => filter.code && (filter.min != null || filter.max != null));
}

function hasMeetingRoomFilter(filter: MeetingRoomFilter): boolean {
  return filter.minCount != null || filter.minAreaM2 != null || filter.minCapTheatre != null || filter.minCapClassroom != null;
}

export function getEffectiveSelectedBuckets(selectedBuckets: ExplorerBucketKey[]): ExplorerBucketKey[] {
  return selectedBuckets.length > 0 ? selectedBuckets : EXPLORER_BUCKET_OPTIONS.map((bucket) => bucket.code);
}

export function getBackendTypesForBucket(bucket: ExplorerBucketKey): BackendObjectTypeCode[] {
  return EXPLORER_BUCKET_TYPE_MAP[bucket];
}

export function normalizeExplorerObjectType(type: string): ObjectTypeCode {
  const upper = String(type ?? '').toUpperCase() as BackendObjectTypeCode;

  if (HOT_BUCKET_TYPES.includes(upper)) {
    return 'HOT';
  }

  switch (upper) {
    case 'RES':
      return 'RES';
    case 'ITI':
      return 'ITI';
    case 'FMA':
      return 'EVT';
    case 'LOI':
      return 'ACT';
    case 'PCU':
    case 'PNA':
    case 'VIL':
      return 'VIS';
    case 'COM':
    case 'PSV':
    case 'ASC':
      return 'SRV';
    default:
      return 'ACT';
  }
}

export function buildBucketRpcFilters(filters: ExplorerFilters, bucket: ExplorerBucketKey): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  const { common } = filters;

  if (common.openNow) {
    payload.open_now = true;
  }

  if (common.petsAccepted) {
    payload.pet_accepted = true;
  }

  if (common.pmr) {
    payload.amenities_any = ['wheelchair_access'];
  }

  if (common.bbox) {
    payload.bbox = common.bbox;
  }

  if (cleanString(common.city)) {
    payload.city_any = [cleanString(common.city)];
  }

  if (cleanString(common.lieuDit)) {
    payload.lieu_dit_any = [cleanString(common.lieuDit)];
  }

  if (bucket === 'HOT') {
    const classifications = filters.hot.classifications.map((item: ClassificationRef) => ({
      scheme_code: item.schemeCode,
      value_code: item.valueCode,
    }));
    const capacityFilters = normalizeCapacityFilters(filters.hot.capacityFilters);

    if (classifications.length > 0) {
      payload.classifications_any = classifications;
    }

    if (capacityFilters.length > 0) {
      payload.capacity_filters = capacityFilters;
    }

    if (hasMeetingRoomFilter(filters.hot.meetingRoom)) {
      payload.meeting_room = {
        ...(filters.hot.meetingRoom.minCount != null && { min_count: filters.hot.meetingRoom.minCount }),
        ...(filters.hot.meetingRoom.minAreaM2 != null && { min_area_m2: filters.hot.meetingRoom.minAreaM2 }),
        ...(filters.hot.meetingRoom.minCapTheatre != null && { min_cap_theatre: filters.hot.meetingRoom.minCapTheatre }),
        ...(filters.hot.meetingRoom.minCapClassroom != null && { min_cap_classroom: filters.hot.meetingRoom.minCapClassroom }),
      };
    }
  }

  if (bucket === 'RES') {
    const capacityFilters = normalizeCapacityFilters(filters.res.capacityFilters);
    if (capacityFilters.length > 0) {
      payload.capacity_filters = capacityFilters;
    }
  }

  if (bucket === 'ITI') {
    const itinerary = {
      ...(filters.iti.isLoop != null && { is_loop: filters.iti.isLoop }),
      ...(filters.iti.difficultyMin != null && { difficulty_min: filters.iti.difficultyMin }),
      ...(filters.iti.difficultyMax != null && { difficulty_max: filters.iti.difficultyMax }),
      ...(filters.iti.distanceMinKm != null && { distance_min_km: filters.iti.distanceMinKm }),
      ...(filters.iti.distanceMaxKm != null && { distance_max_km: filters.iti.distanceMaxKm }),
      ...(filters.iti.durationMinH != null && { duration_min_h: filters.iti.durationMinH }),
      ...(filters.iti.durationMaxH != null && { duration_max_h: filters.iti.durationMaxH }),
      ...(filters.iti.practicesAny.length > 0 && { practices_any: filters.iti.practicesAny }),
    };

    if (Object.keys(itinerary).length > 0) {
      payload.itinerary = itinerary;
    }
  }

  if (bucket === 'ACT' && filters.act.environmentTagsAny.length > 0) {
    payload.environment_tags_any = filters.act.environmentTagsAny;
  }

  return payload;
}

export function applyFrontendOnlyExplorerFilters(cards: ObjectCard[], filters: ExplorerFilters): ObjectCard[] {
  const effectiveHotSubtypes = filters.hot.subtypes.length > 0 ? filters.hot.subtypes : DEFAULT_HOT_SUBTYPES;
  const allowedHotSubtypes = new Set(effectiveHotSubtypes);
  const labelNeedles = filters.common.labelsAny.map((label) => String(label).toLowerCase()).filter(Boolean);
  const requireLabelMatch = labelNeedles.length > 0;
  return cards.filter((card) => {
    if (requireLabelMatch) {
      const hay = Array.isArray(card.labels) ? card.labels.map((label) => String(label).toLowerCase()) : [];
      const matches = labelNeedles.some((needle) => hay.includes(needle));
      if (!matches) {
        return false;
      }
    }
    if (normalizeExplorerObjectType(card.type) !== 'HOT') {
      return true;
    }
    return allowedHotSubtypes.has(String(card.type).toUpperCase() as BackendObjectTypeCode);
  });
}

export function dedupeExplorerCards(cards: ObjectCard[]): ObjectCard[] {
  const seen = new Map<string, ObjectCard>();
  for (const card of cards) {
    if (!seen.has(card.id)) {
      seen.set(card.id, card);
    }
  }
  return [...seen.values()];
}

export function sortExplorerCards(cards: ObjectCard[]): ObjectCard[] {
  return [...cards].sort((left, right) => {
    const nameCompare = left.name.localeCompare(right.name, 'fr', { sensitivity: 'base' });
    if (nameCompare !== 0) {
      return nameCompare;
    }
    return left.id.localeCompare(right.id, 'fr', { sensitivity: 'base' });
  });
}