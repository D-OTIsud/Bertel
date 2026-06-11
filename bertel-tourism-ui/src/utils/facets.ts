import type {
  AccessibilityDisabilityTypeCode,
  BackendObjectTypeCode,
  CapacityFilter,
  ExplorerBucketKey,
  ExplorerCommonFilters,
  ExplorerFilters,
  ExplorerStatusFilter,
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

export const EXPLORER_TYPE_CODE_FAMILIES: Record<ObjectTypeCode, BackendObjectTypeCode[]> = {
  HOT: ['HOT', 'HPA', 'HLO', 'CAMP', 'RVA'],
  RES: ['RES'],
  ACT: ['ACT', 'LOI'],
  ITI: ['ITI'],
  EVT: ['FMA'],
  VIS: ['PCU', 'PNA', 'VIL', 'PRD'],
  SRV: ['COM', 'PSV', 'ASC', 'SPU'],
};

export const HOT_BUCKET_TYPES: BackendObjectTypeCode[] = [...EXPLORER_TYPE_CODE_FAMILIES.HOT];
export const DEFAULT_HOT_SUBTYPES: BackendObjectTypeCode[] = [...HOT_BUCKET_TYPES];

export const ACCESSIBILITY_DISABILITY_TYPE_OPTIONS: Array<{ code: AccessibilityDisabilityTypeCode; label: string }> = [
  { code: 'motor', label: 'Moteur' },
  { code: 'hearing', label: 'Auditif' },
  { code: 'visual', label: 'Visuel' },
  { code: 'cognitive', label: 'Mental / cognitif' },
];

export const EXPLORER_BUCKET_TYPE_MAP: Record<ExplorerBucketKey, BackendObjectTypeCode[]> = {
  HOT: [...EXPLORER_TYPE_CODE_FAMILIES.HOT],
  RES: [...EXPLORER_TYPE_CODE_FAMILIES.RES],
  ITI: [...EXPLORER_TYPE_CODE_FAMILIES.ITI],
  EVT: [...EXPLORER_TYPE_CODE_FAMILIES.EVT],
  ACT: [...EXPLORER_TYPE_CODE_FAMILIES.ACT],
  VIS: [...EXPLORER_TYPE_CODE_FAMILIES.VIS],
  SRV: [...EXPLORER_TYPE_CODE_FAMILIES.SRV],
};

export const DEFAULT_COMMON_FILTERS: ExplorerCommonFilters = {
  search: '',
  cities: [],
  lieuDit: '',
  pmr: false,
  accessibilityDisabilityTypesAny: [],
  accessibilityAmenityCodesAny: [],
  sustainable: false,
  sustainabilityCategoryCodesAny: [],
  sustainabilityActionCodesAny: [],
  petsAccepted: false,
  openNow: false,
  labelsAny: [],
  rankedLabelSchemeCode: null,
  // Empty = "use the server default" (published only). Editors get the default
  // broadened in `useExplorerFilters` once their canEditObjects flag is known.
  statuses: [],
  bbox: null,
  polygon: null,
};

export const DEFAULT_EXPLORER_FILTERS: ExplorerFilters = {
  selectedBuckets: [],
  common: DEFAULT_COMMON_FILTERS,
  hot: {
    subtypes: [...DEFAULT_HOT_SUBTYPES],
    taxonomy: [],
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

/**
 * Ensures every filter array exists — needed after schema upgrades, partial URL
 * hydration, or hot-reload keeping an older Zustand snapshot in memory.
 */
export function normalizeExplorerFilters(
  filters: Partial<ExplorerFilters> | ExplorerFilters,
): ExplorerFilters {
  const base = DEFAULT_EXPLORER_FILTERS;
  const common = { ...base.common, ...filters.common };
  const hot = { ...base.hot, ...filters.hot };
  const res = { ...base.res, ...filters.res };
  const iti = { ...base.iti, ...filters.iti };
  const act = { ...base.act, ...filters.act };

  return {
    selectedBuckets: filters.selectedBuckets ?? base.selectedBuckets,
    common: {
      ...common,
      cities: common.cities ?? [],
      accessibilityDisabilityTypesAny: common.accessibilityDisabilityTypesAny ?? [],
      accessibilityAmenityCodesAny: common.accessibilityAmenityCodesAny ?? [],
      sustainabilityCategoryCodesAny: common.sustainabilityCategoryCodesAny ?? [],
      sustainabilityActionCodesAny: common.sustainabilityActionCodesAny ?? [],
      labelsAny: common.labelsAny ?? [],
      rankedLabelSchemeCode: cleanString(common.rankedLabelSchemeCode) || null,
      statuses: common.statuses ?? [],
    },
    hot: {
      ...hot,
      subtypes: hot.subtypes ?? [...DEFAULT_HOT_SUBTYPES],
      taxonomy: hot.taxonomy ?? [],
      capacityFilters: hot.capacityFilters ?? [],
      meetingRoom: hot.meetingRoom ?? {},
    },
    res: {
      ...res,
      capacityFilters: res.capacityFilters ?? [],
    },
    iti: {
      ...iti,
      practicesAny: iti.practicesAny ?? [],
    },
    act: {
      ...act,
      environmentTagsAny: act.environmentTagsAny ?? [],
    },
    vis: { ...base.vis, ...filters.vis },
    srv: { ...base.srv, ...filters.srv },
  };
}

function cleanString(value: string | null | undefined): string {
  return String(value ?? '').trim();
}

function normalizeNeedle(value: string | null | undefined): string {
  return cleanString(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function isWithinBbox(
  card: ObjectCard,
  bbox: [number, number, number, number],
): boolean {
  const lat = card.location?.lat;
  const lon = card.location?.lon;
  if (typeof lat !== 'number' || typeof lon !== 'number') {
    return false;
  }
  const [minLon, minLat, maxLon, maxLat] = bbox;
  return lon >= minLon && lon <= maxLon && lat >= minLat && lat <= maxLat;
}

function isWithinPolygon(card: ObjectCard, coordinates: number[][]): boolean {
  const lat = card.location?.lat;
  const lon = card.location?.lon;
  if (typeof lat !== 'number' || typeof lon !== 'number' || coordinates.length < 3) {
    return false;
  }

  let inside = false;
  for (let i = 0, j = coordinates.length - 1; i < coordinates.length; j = i, i += 1) {
    const [xi, yi] = coordinates[i];
    const [xj, yj] = coordinates[j];
    const intersects = yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi || Number.EPSILON) + xi;
    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
}

function normalizeCapacityFilters(filters: CapacityFilter[]): CapacityFilter[] {
  return filters.filter((filter) => filter.code && (filter.min != null || filter.max != null));
}

function hasMeetingRoomFilter(filter: MeetingRoomFilter): boolean {
  return filter.minCount != null || filter.minAreaM2 != null || filter.minCapTheatre != null || filter.minCapClassroom != null;
}

/**
 * True when at least one Explorer constraint is evaluated only by the RPC /
 * `ObjectCard` payload cannot express it. Used to intersect the local IndexedDB
 * view with API ids once the filtered query returns.
 */
export function hasServerOnlyFilters(filters: ExplorerFilters): boolean {
  const { common, hot, res, iti, act } = normalizeExplorerFilters(filters);
  const hasAccessibilityFilter =
    common.pmr ||
    common.accessibilityDisabilityTypesAny.length > 0 ||
    common.accessibilityAmenityCodesAny.length > 0;
  const hasSustainabilityFilter =
    common.sustainable ||
    common.sustainabilityCategoryCodesAny.length > 0 ||
    common.sustainabilityActionCodesAny.length > 0;
  if (hasAccessibilityFilter || hasSustainabilityFilter || common.petsAccepted || Boolean(common.rankedLabelSchemeCode)) {
    return true;
  }
  if (hot.taxonomy.length > 0) {
    return true;
  }
  if (normalizeCapacityFilters(hot.capacityFilters).length > 0) {
    return true;
  }
  if (hasMeetingRoomFilter(hot.meetingRoom)) {
    return true;
  }
  if (normalizeCapacityFilters(res.capacityFilters).length > 0) {
    return true;
  }
  if (iti.isLoop != null) {
    return true;
  }
  if (iti.difficultyMin != null || iti.difficultyMax != null) {
    return true;
  }
  if (iti.distanceMinKm != null || iti.distanceMaxKm != null) {
    return true;
  }
  if (iti.durationMinH != null || iti.durationMaxH != null) {
    return true;
  }
  if (iti.practicesAny.length > 0) {
    return true;
  }
  if (act.environmentTagsAny.length > 0) {
    return true;
  }
  return false;
}

export function getEffectiveSelectedBuckets(selectedBuckets: ExplorerBucketKey[]): ExplorerBucketKey[] {
  return selectedBuckets.length > 0 ? selectedBuckets : EXPLORER_BUCKET_OPTIONS.map((bucket) => bucket.code);
}

/**
 * Resolves the publication-status set the Explorer should query for.
 *
 * Rules:
 *   - Explicit user/UI selection wins (any non-empty `configured`).
 *   - Editors (admin role or one of create/edit/publish permissions) default
 *     to ['published', 'draft'] so the Explorer surfaces drafts of their ORG.
 *     RLS still limits drafts to their own scope (cf. api.can_read_extended).
 *   - Read-only personas stay on ['published'] only.
 */
export function resolveExplorerStatuses(
  configured: ExplorerStatusFilter[],
  canEditObjects: boolean,
): ExplorerStatusFilter[] {
  if (configured.length > 0) {
    return [...new Set(configured)];
  }
  return canEditObjects ? ['published', 'draft'] : ['published'];
}

export function getBackendTypesForBucket(bucket: ExplorerBucketKey): BackendObjectTypeCode[] {
  return EXPLORER_BUCKET_TYPE_MAP[bucket];
}

export function normalizeExplorerObjectType(type: string): ObjectTypeCode {
  const upper = String(type ?? '').toUpperCase() as BackendObjectTypeCode;

  for (const [family, codes] of Object.entries(EXPLORER_TYPE_CODE_FAMILIES) as Array<[ObjectTypeCode, BackendObjectTypeCode[]]>) {
    if (codes.includes(upper)) {
      return family;
    }
  }

  return upper in EXPLORER_TYPE_CODE_FAMILIES ? (upper as ObjectTypeCode) : 'ACT';
}

export function buildBucketRpcFilters(filters: ExplorerFilters, bucket: ExplorerBucketKey): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  const normalizedFilters = normalizeExplorerFilters(filters);
  const { common } = normalizedFilters;

  if (common.openNow) {
    payload.open_now = true;
  }

  if (common.petsAccepted) {
    payload.pet_accepted = true;
  }

  const accessibilityAmenityCodes = common.accessibilityAmenityCodesAny.map(cleanString).filter(Boolean);
  const accessibilityDisabilityTypes = common.accessibilityDisabilityTypesAny.map(cleanString).filter(Boolean);
  const hasAccessibilityFilter = common.pmr || accessibilityAmenityCodes.length > 0 || accessibilityDisabilityTypes.length > 0;
  const rankedLabelSchemeCode = cleanString(common.rankedLabelSchemeCode);

  if (rankedLabelSchemeCode) {
    payload.label_scheme_ranked = rankedLabelSchemeCode;
  }

  if (hasAccessibilityFilter) {
    if (accessibilityAmenityCodes.length > 0) {
      payload.amenities_any = accessibilityAmenityCodes;
    } else if (accessibilityDisabilityTypes.length === 0) {
      payload.amenity_families_any = ['accessibility'];
    }

    if (accessibilityDisabilityTypes.length > 0) {
      payload.disability_types_any = accessibilityDisabilityTypes;
    }
  }

  if (rankedLabelSchemeCode === 'LBL_TOURISME_HANDICAP' && accessibilityDisabilityTypes.length > 0) {
    payload.disability_types_any = accessibilityDisabilityTypes;
    payload.label_disability_types_any = accessibilityDisabilityTypes;
  }

  const sustainabilityCategoryCodes = common.sustainabilityCategoryCodesAny.map(cleanString).filter(Boolean);
  const sustainabilityActionCodes = common.sustainabilityActionCodesAny.map(cleanString).filter(Boolean);
  const hasSustainabilityFilter = common.sustainable || sustainabilityCategoryCodes.length > 0 || sustainabilityActionCodes.length > 0;

  if (hasSustainabilityFilter) {
    if (sustainabilityCategoryCodes.length > 0) {
      payload.sustainability_categories_any = sustainabilityCategoryCodes;
    }
    if (sustainabilityActionCodes.length > 0) {
      payload.sustainability_actions_any = sustainabilityActionCodes;
    }
    if (sustainabilityCategoryCodes.length === 0 && sustainabilityActionCodes.length === 0) {
      payload.sustainability_any = true;
    }
  }

  if (common.bbox) {
    payload.bbox = common.bbox;
  }

  const cleanCities = common.cities.map(cleanString).filter(Boolean);
  if (cleanCities.length > 0) {
    payload.city_any = cleanCities;
  }

  if (cleanString(common.lieuDit)) {
    payload.lieu_dit_any = [cleanString(common.lieuDit)];
  }

  if (bucket === 'HOT') {
    const taxonomy = normalizedFilters.hot.taxonomy.map((item) => ({
      domain: item.domain,
      code: item.code,
    }));
    const capacityFilters = normalizeCapacityFilters(normalizedFilters.hot.capacityFilters);

    if (taxonomy.length > 0) {
      payload.taxonomy_any = taxonomy;
    }

    if (capacityFilters.length > 0) {
      payload.capacity_filters = capacityFilters;
    }

    if (hasMeetingRoomFilter(normalizedFilters.hot.meetingRoom)) {
      payload.meeting_room = {
        ...(normalizedFilters.hot.meetingRoom.minCount != null && { min_count: normalizedFilters.hot.meetingRoom.minCount }),
        ...(normalizedFilters.hot.meetingRoom.minAreaM2 != null && { min_area_m2: normalizedFilters.hot.meetingRoom.minAreaM2 }),
        ...(normalizedFilters.hot.meetingRoom.minCapTheatre != null && { min_cap_theatre: normalizedFilters.hot.meetingRoom.minCapTheatre }),
        ...(normalizedFilters.hot.meetingRoom.minCapClassroom != null && { min_cap_classroom: normalizedFilters.hot.meetingRoom.minCapClassroom }),
      };
    }
  }

  if (bucket === 'RES') {
    const capacityFilters = normalizeCapacityFilters(normalizedFilters.res.capacityFilters);
    if (capacityFilters.length > 0) {
      payload.capacity_filters = capacityFilters;
    }
  }

  if (bucket === 'ITI') {
    const itinerary = {
      ...(normalizedFilters.iti.isLoop != null && { is_loop: normalizedFilters.iti.isLoop }),
      ...(normalizedFilters.iti.difficultyMin != null && { difficulty_min: normalizedFilters.iti.difficultyMin }),
      ...(normalizedFilters.iti.difficultyMax != null && { difficulty_max: normalizedFilters.iti.difficultyMax }),
      ...(normalizedFilters.iti.distanceMinKm != null && { distance_min_km: normalizedFilters.iti.distanceMinKm }),
      ...(normalizedFilters.iti.distanceMaxKm != null && { distance_max_km: normalizedFilters.iti.distanceMaxKm }),
      ...(normalizedFilters.iti.durationMinH != null && { duration_min_h: normalizedFilters.iti.durationMinH }),
      ...(normalizedFilters.iti.durationMaxH != null && { duration_max_h: normalizedFilters.iti.durationMaxH }),
      ...(normalizedFilters.iti.practicesAny.length > 0 && { practices_any: normalizedFilters.iti.practicesAny }),
    };

    if (Object.keys(itinerary).length > 0) {
      payload.itinerary = itinerary;
    }
  }

  if (bucket === 'ACT' && normalizedFilters.act.environmentTagsAny.length > 0) {
    payload.environment_tags_any = normalizedFilters.act.environmentTagsAny;
  }

  return payload;
}

export function applyFrontendOnlyExplorerFilters(cards: ObjectCard[], filters: ExplorerFilters): ObjectCard[] {
  const normalizedFilters = normalizeExplorerFilters(filters);
  const effectiveHotSubtypes = normalizedFilters.hot.subtypes.length > 0 ? normalizedFilters.hot.subtypes : DEFAULT_HOT_SUBTYPES;
  const allowedHotSubtypes = new Set(effectiveHotSubtypes);
  const labelNeedles = normalizedFilters.common.labelsAny.map((label) => String(label).toLowerCase()).filter(Boolean);
  const requireLabelMatch = labelNeedles.length > 0;
  // When the caller resolves statuses (cf. resolveExplorerStatuses) the array
  // is non-empty and we apply it here too. Empty array = "no client-side
  // filter": we defer to whatever the backend already filtered.
  const statuses = normalizedFilters.common.statuses;
  const allowedStatuses = statuses.length > 0 ? new Set<string>(statuses) : null;
  return cards.filter((card) => {
    if (allowedStatuses && card.status && !allowedStatuses.has(card.status)) {
      return false;
    }
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

export function applyClientPreviewFilters(cards: ObjectCard[], filters: ExplorerFilters): ObjectCard[] {
  const normalizedFilters = normalizeExplorerFilters(filters);
  const selectedBuckets = new Set(getEffectiveSelectedBuckets(normalizedFilters.selectedBuckets));
  const allowedCities = new Set(normalizedFilters.common.cities.map((city) => normalizeNeedle(city)).filter(Boolean));
  const lieuDitNeedle = normalizeNeedle(normalizedFilters.common.lieuDit);
  const searchNeedle = normalizeNeedle(normalizedFilters.common.search);
  const polygonCoordinates = normalizedFilters.common.polygon?.coordinates?.[0] ?? null;

  const narrowed = cards.filter((card) => {
    if (!selectedBuckets.has(normalizeExplorerObjectType(card.type))) {
      return false;
    }

    if (allowedCities.size > 0) {
      const city = normalizeNeedle(card.location?.city);
      if (!allowedCities.has(city)) {
        return false;
      }
    }

    if (lieuDitNeedle) {
      const lieuDit = normalizeNeedle(card.location?.lieu_dit);
      if (!lieuDit.includes(lieuDitNeedle)) {
        return false;
      }
    }

    if (normalizedFilters.common.openNow && card.open_now !== true) {
      return false;
    }

    if (searchNeedle) {
      const haystack = [
        card.name,
        card.description,
        card.location?.city,
        card.location?.address,
      ]
        .map((part) => normalizeNeedle(part))
        .join(' ');
      if (!haystack.includes(searchNeedle)) {
        return false;
      }
    }

    if (normalizedFilters.common.bbox && !isWithinBbox(card, normalizedFilters.common.bbox)) {
      return false;
    }

    if (polygonCoordinates && !isWithinPolygon(card, polygonCoordinates)) {
      return false;
    }

    return true;
  });

  return applyFrontendOnlyExplorerFilters(narrowed, normalizedFilters);
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
    if (left.label_match || right.label_match) {
      const leftRank = typeof left.label_match?.rank === 'number' ? left.label_match.rank : Number.MAX_SAFE_INTEGER;
      const rightRank = typeof right.label_match?.rank === 'number' ? right.label_match.rank : Number.MAX_SAFE_INTEGER;
      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }
    }
    const nameCompare = left.name.localeCompare(right.name, 'fr', { sensitivity: 'base' });
    if (nameCompare !== 0) {
      return nameCompare;
    }
    return left.id.localeCompare(right.id, 'fr', { sensitivity: 'base' });
  });
}
