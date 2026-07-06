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
import { buildExplorerTypeFamilies } from './labels';

export const EXPLORER_BUCKET_OPTIONS: Array<{ code: ExplorerBucketKey; label: string }> = [
  { code: 'HOT', label: 'Hébergements' },
  { code: 'RES', label: 'Restaurants' },
  { code: 'ITI', label: 'Itinéraires' },
  { code: 'ACT', label: 'Activités' },
  { code: 'EVT', label: 'Événements' },
  { code: 'VIS', label: 'Visites' },
  { code: 'SRV', label: 'Services' },
];

/**
 * Familles de bucket de l'Explorer — DÉRIVÉES de la table canonique type→archétype
 * (`buildExplorerTypeFamilies`, cf. utils/labels.ts). Le bucket d'un type ==
 * son archétype éditeur, par construction : Explorer et éditeur ne peuvent plus
 * diverger (fin du défaut-racine §2a : LOI sous Visites, ASC sous Activités,
 * VIL sous Services).
 */
export const EXPLORER_TYPE_CODE_FAMILIES: Record<ObjectTypeCode, BackendObjectTypeCode[]> =
  buildExplorerTypeFamilies();

export const HOT_BUCKET_TYPES: BackendObjectTypeCode[] = [...EXPLORER_TYPE_CODE_FAMILIES.HOT];
export const DEFAULT_HOT_SUBTYPES: BackendObjectTypeCode[] = [...HOT_BUCKET_TYPES];
// 3.2 — sous-types des buckets fourre-tout VIS/SRV (défaut = tous les types du bucket).
export const DEFAULT_VIS_SUBTYPES: BackendObjectTypeCode[] = [...EXPLORER_TYPE_CODE_FAMILIES.VIS];
export const DEFAULT_SRV_SUBTYPES: BackendObjectTypeCode[] = [...EXPLORER_TYPE_CODE_FAMILIES.SRV];

export const ACCESSIBILITY_DISABILITY_TYPE_OPTIONS: Array<{ code: AccessibilityDisabilityTypeCode; label: string }> = [
  { code: 'motor', label: 'Moteur' },
  { code: 'hearing', label: 'Auditif' },
  { code: 'visual', label: 'Visuel' },
  { code: 'cognitive', label: 'Cognitif' },
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
  openAt: null,
  environmentTagsAny: [],
  amenityFamiliesAny: [],
  taxonomyAny: [],
  labelsAny: [],
  tagsAny: [],
  rankedLabelSchemeCode: null,
  rankedLabelIncludeEquivalents: true,
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
  evt: {
    eventFrom: null,
    eventTo: null,
  },
  vis: {
    subtypes: [...DEFAULT_VIS_SUBTYPES],
  },
  srv: {
    subtypes: [...DEFAULT_SRV_SUBTYPES],
  },
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
  const evt = { ...base.evt, ...filters.evt };

  return {
    selectedBuckets: filters.selectedBuckets ?? base.selectedBuckets,
    common: {
      ...common,
      cities: common.cities ?? [],
      accessibilityDisabilityTypesAny: common.accessibilityDisabilityTypesAny ?? [],
      accessibilityAmenityCodesAny: common.accessibilityAmenityCodesAny ?? [],
      sustainabilityCategoryCodesAny: common.sustainabilityCategoryCodesAny ?? [],
      sustainabilityActionCodesAny: common.sustainabilityActionCodesAny ?? [],
      openAt: common.openAt ?? null,
      environmentTagsAny: common.environmentTagsAny ?? [],
      amenityFamiliesAny: common.amenityFamiliesAny ?? [],
      taxonomyAny: common.taxonomyAny ?? [],
      labelsAny: common.labelsAny ?? [],
      tagsAny: common.tagsAny ?? [],
      rankedLabelSchemeCode: cleanString(common.rankedLabelSchemeCode) || null,
      rankedLabelIncludeEquivalents: common.rankedLabelIncludeEquivalents ?? true,
      statuses: common.statuses ?? [],
    },
    hot: {
      ...hot,
      subtypes: hot.subtypes ?? [...DEFAULT_HOT_SUBTYPES],
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
    evt: {
      ...evt,
      eventFrom: evt.eventFrom ?? null,
      eventTo: evt.eventTo ?? null,
    },
    vis: {
      ...base.vis,
      ...filters.vis,
      subtypes: filters.vis?.subtypes ?? base.vis.subtypes,
    },
    srv: {
      ...base.srv,
      ...filters.srv,
      subtypes: filters.srv?.subtypes ?? base.srv.subtypes,
    },
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
  const { common, hot, res, iti, evt } = normalizeExplorerFilters(filters);
  if (evt.eventFrom || evt.eventTo) {
    return true;
  }
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
  if (common.tagsAny.length > 0) {
    return true;
  }
  if (common.taxonomyAny.length > 0) {
    return true;
  }
  if (common.openAt) {
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
  if (common.environmentTagsAny.length > 0) {
    return true;
  }
  if (common.amenityFamiliesAny.length > 0) {
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

/**
 * §155 — bucket Explorer d'un domaine de sous-catégories (`taxonomy_res` → type
 * RES → bucket RES). `null` pour un domaine hors Explorer (taxonomy_org) : la
 * paire est ignorée partout. Ne PAS réutiliser normalizeExplorerObjectType ici
 * (son repli inconnu→ACT rangerait taxonomy_org sous Activités).
 */
export function bucketForTaxonomyDomain(domain: string): ExplorerBucketKey | null {
  const type = String(domain ?? '').replace(/^taxonomy_/, '').toUpperCase() as BackendObjectTypeCode;
  for (const [family, codes] of Object.entries(EXPLORER_TYPE_CODE_FAMILIES) as Array<[ObjectTypeCode, BackendObjectTypeCode[]]>) {
    if (codes.includes(type)) {
      return family as ExplorerBucketKey;
    }
  }
  return null;
}

/**
 * Server-side `p_types` for a bucket, narrowed to the user's selected subtypes (HOT/VIS/SRV).
 *
 * This is the server-side equivalent of the legacy client-only subtype filter
 * (applyFrontendOnlyExplorerFilters): instead of fetching every bucket type and filtering the
 * client cache down to the chosen subtypes, we push the narrowing into `p_types` so lazy server
 * pagination (and the markers RPC) return exactly the right rows.
 *
 * - Empty subtype selection ⇒ all bucket types (the UI default = "all checked", and the non-demo
 *   behaviour where useExplorerCardsQuery zeroes subtypes ⇒ no narrowing).
 * - A non-empty selection ⇒ intersection with the bucket's real types. An empty intersection
 *   (e.g. a stale subtype code like CHLO that is not a live object_type) returns [] — the caller
 *   skips that bucket, matching the old client behaviour where such a selection matched no cards.
 */
export function getEffectiveBackendTypesForBucket(
  filters: ExplorerFilters,
  bucket: ExplorerBucketKey,
): BackendObjectTypeCode[] {
  const all = EXPLORER_BUCKET_TYPE_MAP[bucket];
  const normalized = normalizeExplorerFilters(filters);
  let selected: BackendObjectTypeCode[] | null = null;
  if (bucket === 'HOT') {
    selected = normalized.hot.subtypes;
  } else if (bucket === 'VIS') {
    selected = normalized.vis.subtypes;
  } else if (bucket === 'SRV') {
    selected = normalized.srv.subtypes;
  }
  if (!selected || selected.length === 0) {
    return [...all];
  }
  const allowed = new Set<string>(all);
  return selected.filter((type) => allowed.has(type));
}

/**
 * Polygon (lasso/draw-area) refinement — the ONE Explorer filter with no server equivalent.
 * Everything else (types/subtypes, cities, search, openNow, bbox, accessibility, sustainability,
 * tags, taxonomy, capacity, meeting, itinerary, pets, label) is applied server-side by
 * get_filtered_object_ids, so with lazy server pagination we only refine the loaded cards by the
 * exact polygon (the server already pre-filtered by its bounding box, cf. setPolygon → bbox).
 * No polygon set ⇒ returns the cards unchanged.
 */
export function refineCardsByPolygon(cards: ObjectCard[], filters: ExplorerFilters): ObjectCard[] {
  const polygon = normalizeExplorerFilters(filters).common.polygon?.coordinates?.[0] ?? null;
  if (!polygon) {
    return cards;
  }
  return cards.filter((card) => isWithinPolygon(card, polygon));
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

  // §109 — broaden text search to the aggregated search_document by default (Explorer).
  // Editor object pickers pass searchScope='name' to keep name/city-only matching.
  if (cleanString(common.search) && common.searchScope !== 'name') {
    payload.search_mode = 'global';
  }

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
    // §173 — exact-only : restreint aux labellisés (rank-0). Émis UNIQUEMENT quand le
    // toggle est OFF ; défaut/true/undefined n'émet rien (payload inchangé vs aujourd'hui).
    if (common.rankedLabelIncludeEquivalents === false) {
      payload.label_scheme_ranked_exact_only = true;
    }
  }

  if (hasAccessibilityFilter) {
    if (accessibilityAmenityCodes.length > 0) {
      payload.amenities_any = accessibilityAmenityCodes;
    } else if (accessibilityDisabilityTypes.length === 0) {
      // §162 — clé dédiée : équipement famille accessibility OU label Tourisme & Handicap
      // granted (le label certifié suffit sans équipement saisi, directive PO 2026-07-03).
      // Plus amenity_families_any : cette clé est celle du filtre transverse Services &
      // équipements (§159) et l'écraserait plus bas.
      payload.accessibility_any = true;
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

  // §09 tag click-to-filter (common scope, all buckets). The live RPC matches ref_tag.slug ANY.
  const tagSlugs = common.tagsAny.map((tag) => cleanString(tag.slug)).filter(Boolean);
  if (tagSlugs.length > 0) {
    payload.tags_any = tagSlugs;
  }

  // §154 — cadre & environnement, transverse (le RPC matche cached_environment_tags
  // sur l'objet, tous types ; l'ancien gating au seul bucket ACT était un vestige).
  const environmentTags = common.environmentTagsAny.map(cleanString).filter(Boolean);
  if (environmentTags.length > 0) {
    payload.environment_tags_any = environmentTags;
  }

  // §155 — sous-catégories : partition par bucket (une sélection « Pizzeria »
  // contraint le bucket RES, jamais les autres — mêmes sémantiques que les
  // sous-types). Le RPC matche cached_taxonomy_codes, descendants inclus.
  const bucketTaxonomy = common.taxonomyAny.filter((item) => bucketForTaxonomyDomain(item.domain) === bucket);
  if (bucketTaxonomy.length > 0) {
    payload.taxonomy_any = bucketTaxonomy.map((item) => ({ domain: item.domain, code: item.code }));
  }

  // §159 — services & équipements (familles d'aménités), transverse.
  const amenityFamilies = common.amenityFamiliesAny.map(cleanString).filter(Boolean);
  if (amenityFamilies.length > 0) {
    payload.amenity_families_any = amenityFamilies;
  }

  // §157 — « ouvert à … » : datetime-local (heure Réunion) → timestamptz explicite.
  // +04:00 en dur : La Réunion n'a pas d'heure d'été, et c'est aussi le repli
  // timezone du moteur côté DB (Indian/Reunion). Garde de format : jamais un
  // cast 22007 serveur sur une URL trafiquée.
  if (common.openAt && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(common.openAt)) {
    payload.open_at = `${common.openAt}:00+04:00`;
  }

  // §157 — dates Événements : EVT uniquement (l'arm serveur est un EXISTS sur
  // object_fma — envoyé à un autre bucket, il viderait ses résultats).
  if (bucket === 'EVT') {
    const { eventFrom, eventTo } = normalizedFilters.evt;
    const isDate = (value: string | null): value is string => !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);
    const from = isDate(eventFrom) ? eventFrom : null;
    const to = isDate(eventTo) ? eventTo : null;
    if (from || to) {
      // Plage inversée réordonnée (même garde que §156 — jamais de plage vide muette).
      const ordered = from && to && from > to ? { from: to, to: from } : { from, to };
      payload.event = {
        ...(ordered.from ? { from: ordered.from } : {}),
        ...(ordered.to ? { to: ordered.to } : {}),
      };
    }
  }

  if (bucket === 'HOT') {
    const capacityFilters = normalizeCapacityFilters(normalizedFilters.hot.capacityFilters);

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

  return payload;
}

export function applyFrontendOnlyExplorerFilters(cards: ObjectCard[], filters: ExplorerFilters): ObjectCard[] {
  const normalizedFilters = normalizeExplorerFilters(filters);
  const effectiveHotSubtypes = normalizedFilters.hot.subtypes.length > 0 ? normalizedFilters.hot.subtypes : DEFAULT_HOT_SUBTYPES;
  const allowedHotSubtypes = new Set(effectiveHotSubtypes);
  const effectiveVisSubtypes = normalizedFilters.vis.subtypes.length > 0 ? normalizedFilters.vis.subtypes : DEFAULT_VIS_SUBTYPES;
  const allowedVisSubtypes = new Set(effectiveVisSubtypes);
  const effectiveSrvSubtypes = normalizedFilters.srv.subtypes.length > 0 ? normalizedFilters.srv.subtypes : DEFAULT_SRV_SUBTYPES;
  const allowedSrvSubtypes = new Set(effectiveSrvSubtypes);
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
    const bucket = normalizeExplorerObjectType(card.type);
    const upperType = String(card.type).toUpperCase() as BackendObjectTypeCode;
    if (bucket === 'HOT') {
      return allowedHotSubtypes.has(upperType);
    }
    if (bucket === 'VIS') {
      return allowedVisSubtypes.has(upperType);
    }
    if (bucket === 'SRV') {
      return allowedSrvSubtypes.has(upperType);
    }
    return true;
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
