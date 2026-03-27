import {
  parseObjectDetail,
  type ParsedObjectDetail,
  type PlaceItem,
} from './object-detail-parser';
import type { ObjectDetail } from '../types/domain';
import {
  parseCapacities,
  parseExternalSyncs,
  parseLegal,
  parseMedia,
  parseMeetingRooms,
  parseMemberships,
  parseOpenings,
  parsePrices,
  parseRoomTypes,
  parseTaxonomyGroups,
  readArray,
  readBoolean,
  readString,
  type CapacityItem,
  type ExternalSyncItem,
  type LegalItem,
  type MediaItem,
  type MembershipItem,
  type MeetingRoomItem,
  type OpeningItem,
  type PriceItem,
  type RoomTypeItem,
  type TaxonomyGroup,
} from '../features/object-drawer/utils';

interface GenericRecord {
  [key: string]: unknown;
}

export interface ModifierMediaAsset {
  id: string;
  url: string;
  title: string;
  credit: string;
  tags: string[];
  context: 'object' | 'place' | 'room' | 'stage' | 'menu-item';
  contextLabel: string;
  detail: string;
}

export interface ModifierMenuItem {
  id: string;
  name: string;
  description: string;
  price: string;
  dietaryTags: string[];
  allergens: string[];
  cuisines: string[];
  media: ModifierMediaAsset[];
}

export interface ModifierMenu {
  id: string;
  name: string;
  description: string;
  items: ModifierMenuItem[];
}

export interface ModifierReviewItem {
  id: string;
  source: string;
  title: string;
  rating: string;
  body: string;
  author: string;
  date: string;
  response: string;
}

export interface ModifierCrmInteractionItem {
  id: string;
  type: string;
  subject: string;
  body: string;
  status: string;
  occurredAt: string;
  dueAt: string;
}

export interface ModifierCrmTaskItem {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  dueAt: string;
}

export interface ModifierConsentItem {
  actorId: string;
  actorName: string;
  channel: string;
  consent: string;
  timestamp: string;
  source: string;
}

export interface ModifierPlaceItem {
  id: string;
  label: string;
  type: string;
  summary: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  isPrimary: boolean;
}

export interface ModifierPayload {
  raw: Record<string, unknown>;
  parsed: ParsedObjectDetail;
  typeCode: string;
  typeLabel: string;
  identity: {
    id: string;
    name: string;
    status: string;
    commercialVisibility: string;
    businessTimezone: string;
    secondaryTypes: string[];
    currentVersion: string;
  };
  overview: {
    descriptionsCount: number;
    summaryText: string;
    languages: string[];
  };
  location: {
    mainLabel: string;
    coordinatesLabel: string;
    places: ModifierPlaceItem[];
    zones: string[];
    mainLocationRecord: Record<string, unknown>;
  };
  contacts: {
    memberships: MembershipItem[];
  };
  distinctions: {
    groups: TaxonomyGroup[];
    highlightCount: number;
  };
  media: {
    objectMedia: MediaItem[];
    assets: ModifierMediaAsset[];
  };
  offer: {
    prices: PriceItem[];
    openings: OpeningItem[];
    paymentMethods: string[];
    environmentTags: string[];
    groupPolicies: Array<Record<string, unknown>>;
    promotions: Array<Record<string, unknown>>;
  };
  typeDetails: {
    capacities: CapacityItem[];
    roomTypes: RoomTypeItem[];
    meetingRooms: MeetingRoomItem[];
    menus: ModifierMenu[];
    itineraryStages: Array<Record<string, unknown>>;
    itinerarySections: Array<Record<string, unknown>>;
    itineraryProfiles: Array<Record<string, unknown>>;
    itineraryInfos: Array<Record<string, unknown>>;
    activity: Record<string, unknown> | null;
    events: Array<Record<string, unknown>>;
    eventOccurrences: Array<Record<string, unknown>>;
  };
  crm: {
    reviews: ModifierReviewItem[];
    reviewSummary: Record<string, unknown>;
    interactions: ModifierCrmInteractionItem[];
    tasks: ModifierCrmTaskItem[];
    consents: ModifierConsentItem[];
  };
  legalSync: {
    legalRecords: LegalItem[];
    externalSyncs: ExternalSyncItem[];
    origins: Array<Record<string, unknown>>;
    publications: Array<Record<string, unknown>>;
    cachedDiagnostics: Array<{ label: string; value: string; detail: string }>;
  };
  navCounts: Record<string, number>;
}

export const OBJECT_TYPE_LABELS: Record<string, string> = {
  RES: 'Restaurant',
  PCU: 'PCU',
  PNA: 'Site nature',
  ORG: 'Organisation',
  ITI: 'Itineraire',
  VIL: 'Village',
  HPA: 'Hebergement plein air',
  ASC: 'ASC',
  COM: 'Commerce',
  HOT: 'Hotel',
  HLO: 'Hebergement loisir',
  LOI: 'Loisir',
  FMA: 'Evenement',
  CAMP: 'Camping',
  PSV: 'Prestataire',
  RVA: 'Residence vacances',
  ACT: 'Activite',
};

function isRecord(value: unknown): value is GenericRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function countNestedMedia(items: ModifierMediaAsset[], context: ModifierMediaAsset['context']): number {
  return items.filter((item) => item.context === context).length;
}

function normalizePlaceItem(rawPlace: Record<string, unknown>, parsedPlace: PlaceItem | undefined): ModifierPlaceItem {
  const location = readRecord(rawPlace.location);
  const latitude = typeof location.latitude === 'number' ? location.latitude : null;
  const longitude = typeof location.longitude === 'number' ? location.longitude : null;

  return {
    id: readString(rawPlace.id, parsedPlace?.id ?? 'place'),
    label: readString(rawPlace.label, parsedPlace?.name ?? 'Lieu'),
    type: readString(readRecord(rawPlace.type).name, parsedPlace?.type ?? ''),
    summary:
      parsedPlace?.descriptions[0]?.description
      || parsedPlace?.descriptions[0]?.chapo
      || readString(rawPlace.description),
    address: [
      readString(location.address1),
      readString(location.lieu_dit),
      readString(location.postcode),
      readString(location.city),
    ].filter(Boolean).join(', '),
    latitude,
    longitude,
    isPrimary: readBoolean(rawPlace.is_primary) === true,
  };
}

function extractPlaceMedia(raw: Record<string, unknown>, places: ModifierPlaceItem[]): ModifierMediaAsset[] {
  return readArray(raw.place_media).map((item, index) => ({
    id: readString(item.id, `place-media-${index}`),
    url: readString(item.url),
    title: readString(item.title, 'Media lieu'),
    credit: readString(item.credit),
    tags: [],
    context: 'place' as const,
    contextLabel: 'Lieu',
    detail: places.find((place) => place.id === readString(item.place_id))?.label ?? 'Lieu',
  })).filter((item) => item.url);
}

function extractRoomMedia(raw: Record<string, unknown>): ModifierMediaAsset[] {
  return readArray(raw.room_types ?? raw.object_room_types).flatMap((room, roomIndex) =>
    readArray(room.media).map((item, mediaIndex) => ({
      id: readString(item.id, `room-media-${roomIndex}-${mediaIndex}`),
      url: readString(item.url),
      title: readString(item.title, readString(room.name, 'Media chambre')),
      credit: readString(item.credit),
      tags: [],
      context: 'room' as const,
      contextLabel: 'Chambre',
      detail: readString(room.name, 'Type de chambre'),
    })),
  ).filter((item) => item.url);
}

function extractStageMedia(raw: Record<string, unknown>): ModifierMediaAsset[] {
  const itineraryDetails = readRecord(raw.itinerary_details);
  const stages = readArray(raw.itinerary_stages).length > 0
    ? readArray(raw.itinerary_stages)
    : readArray(itineraryDetails.stages);

  return stages.flatMap((stage, stageIndex) =>
    readArray(stage.media).map((item, mediaIndex) => ({
      id: readString(item.id, `stage-media-${stageIndex}-${mediaIndex}`),
      url: readString(item.url),
      title: readString(item.title, readString(stage.name, 'Media etape')),
      credit: readString(item.credit),
      tags: [],
      context: 'stage' as const,
      contextLabel: 'Etape',
      detail: readString(stage.name, `Etape ${stageIndex + 1}`),
    })),
  ).filter((item) => item.url);
}

function buildMenuItem(item: Record<string, unknown>, menuName: string, menuIndex: number, itemIndex: number): ModifierMenuItem {
  const media = readArray(item.media ?? item.menu_item_media).map((mediaItem, mediaIndex) => ({
    id: readString(mediaItem.id, `menu-item-media-${menuIndex}-${itemIndex}-${mediaIndex}`),
    url: readString(mediaItem.url),
    title: readString(mediaItem.title, readString(item.name, 'Media menu')),
    credit: readString(mediaItem.credit),
    tags: [],
    context: 'menu-item' as const,
    contextLabel: 'Menu',
    detail: menuName,
  })).filter((mediaItem) => mediaItem.url);

  return {
    id: readString(item.id, `menu-item-${menuIndex}-${itemIndex}`),
    name: readString(item.name, readString(item.label, `Element ${itemIndex + 1}`)),
    description: readString(item.description),
    price: [readString(item.price), readString(item.currency)].filter(Boolean).join(' '),
    dietaryTags: readArray(item.dietary_tags ?? item.object_menu_item_dietary_tags).map((tag) => readString(tag.name, readString(tag.code))).filter(Boolean),
    allergens: readArray(item.allergens ?? item.object_menu_item_allergens).map((allergen) => readString(allergen.name, readString(allergen.code))).filter(Boolean),
    cuisines: readArray(item.cuisine_types ?? item.object_menu_item_cuisine_types).map((cuisine) => readString(cuisine.name, readString(cuisine.code))).filter(Boolean),
    media,
  };
}

function buildMenus(raw: Record<string, unknown>): ModifierMenu[] {
  return readArray(raw.menus).map((menu, menuIndex) => {
    const menuName = readString(menu.name, `Menu ${menuIndex + 1}`);
    const items = readArray(menu.items ?? menu.menu_items).map((item, itemIndex) =>
      buildMenuItem(readRecord(item), menuName, menuIndex, itemIndex),
    );

    return {
      id: readString(menu.id, `menu-${menuIndex}`),
      name: menuName,
      description: readString(menu.description),
      items,
    };
  });
}

function buildReviewItems(raw: Record<string, unknown>): ModifierReviewItem[] {
  return readArray(raw.reviews).map((review, index) => ({
    id: readString(review.id, `review-${index}`),
    source: readString(review.source, 'Source'),
    title: readString(review.title, 'Avis'),
    rating: [readString(review.rating), readString(review.rating_max)].filter(Boolean).join('/'),
    body: readString(review.content),
    author: readString(review.author_name),
    date: readString(review.review_date),
    response: readString(review.response),
  }));
}

function buildInteractionItems(raw: Record<string, unknown>): ModifierCrmInteractionItem[] {
  return readArray(raw.crm_interactions).map((item, index) => ({
    id: readString(item.id, `interaction-${index}`),
    type: readString(item.interaction_type, 'note'),
    subject: readString(item.subject, 'Interaction'),
    body: readString(item.body),
    status: readString(item.status, 'done'),
    occurredAt: readString(item.occurred_at),
    dueAt: readString(item.due_at),
  }));
}

function buildTaskItems(raw: Record<string, unknown>): ModifierCrmTaskItem[] {
  return readArray(raw.crm_tasks).map((item, index) => ({
    id: readString(item.id, `task-${index}`),
    title: readString(item.title, `Tache ${index + 1}`),
    description: readString(item.description),
    status: readString(item.status, 'todo'),
    priority: readString(item.priority, 'medium'),
    dueAt: readString(item.due_at),
  }));
}

function buildConsentItems(raw: Record<string, unknown>): ModifierConsentItem[] {
  return readArray(raw.actor_consents).map((item, index) => ({
    actorId: readString(item.actor_id, `actor-${index}`),
    actorName: readString(item.actor_name, 'Acteur'),
    channel: readString(item.channel, 'channel'),
    consent: readBoolean(item.consent_given) === true ? 'Accord' : 'Refus',
    timestamp: readString(item.timestamp),
    source: readString(item.source),
  }));
}

function buildCachedDiagnostics(raw: Record<string, unknown>): Array<{ label: string; value: string; detail: string }> {
  const definitions: Array<{ key: string; label: string; detail: string }> = [
    {
      key: 'current_version',
      label: 'Version',
      detail: 'Version materalisee de la fiche.',
    },
    {
      key: 'cached_min_price',
      label: 'Prix min cache',
      detail: 'Valeur derivee depuis les lignes tarifaires.',
    },
    {
      key: 'cached_rating',
      label: 'Note cachee',
      detail: 'Moyenne derivee depuis les avis importes.',
    },
    {
      key: 'cached_review_count',
      label: 'Nb avis',
      detail: 'Compteur derive depuis les avis importes.',
    },
    {
      key: 'cached_is_open_now',
      label: 'Ouvert maintenant',
      detail: 'Etat calcule depuis les periodes d ouverture.',
    },
    {
      key: 'cached_language_codes',
      label: 'Codes langues',
      detail: 'Resume derive des langues liees.',
    },
    {
      key: 'cached_classification_codes',
      label: 'Codes classements',
      detail: 'Resume derive des classements.',
    },
    {
      key: 'cached_payment_codes',
      label: 'Codes paiement',
      detail: 'Resume derive des moyens de paiement.',
    },
  ];

  return definitions
    .map((definition) => {
      const value = raw[definition.key];
      if (value == null) {
        return null;
      }

      return {
        label: definition.label,
        value: Array.isArray(value) ? value.join(', ') : String(value),
        detail: definition.detail,
      };
    })
    .filter((item): item is { label: string; value: string; detail: string } => item !== null);
}

function readZones(raw: Record<string, unknown>): string[] {
  return readArray(raw.object_zones ?? raw.zones)
    .map((zone) => readString(zone.insee_commune, readString(zone.label)))
    .filter(Boolean);
}

function readPaymentMethods(groups: TaxonomyGroup[]): string[] {
  return groups.find((group) => group.key === 'payments')?.items.map((item) => item.label) ?? [];
}

function readEnvironmentTags(groups: TaxonomyGroup[]): string[] {
  return groups.find((group) => group.key === 'environment')?.items.map((item) => item.label) ?? [];
}

export function buildModifierDraftFields(payload: ModifierPayload): Record<string, string> {
  const description = payload.parsed.text.descriptions[0];
  const mainLocation = payload.location.mainLocationRecord;
  const rawDescriptions = readArray(payload.raw.descriptions);

  return {
    'overview.shortDescription': description?.chapo ?? '',
    'overview.adaptedDescription': description?.adaptedDescription ?? '',
    'overview.mobileDescription': description?.mobileDescription ?? '',
    'overview.editorialDescription': description?.editorialDescription ?? '',
    'overview.sanitaryMeasures': readString(readRecord(rawDescriptions[0]).sanitary_measures, ''),
    'overview.secondaryTypes': payload.identity.secondaryTypes.join(', '),
    'overview.businessTimezone': payload.identity.businessTimezone,
    'overview.commercialVisibility': payload.identity.commercialVisibility,
    'location.address1': readString(mainLocation.address1),
    'location.postcode': readString(mainLocation.postcode),
    'location.city': readString(mainLocation.city),
    'location.lieuDit': readString(mainLocation.lieu_dit),
    'location.direction': readString(mainLocation.direction),
    'location.latitude': readString(mainLocation.latitude, payload.parsed.location?.latitude != null ? String(payload.parsed.location.latitude) : ''),
    'location.longitude': readString(mainLocation.longitude, payload.parsed.location?.longitude != null ? String(payload.parsed.location.longitude) : ''),
  };
}

export function buildModifierPayload(detail: ObjectDetail): ModifierPayload {
  const raw = (detail.raw ?? {}) as Record<string, unknown>;
  const parsed = parseObjectDetail(raw);
  const typeCode = String(detail.type ?? parsed.identity.type ?? '').toUpperCase();
  const typeLabel = (OBJECT_TYPE_LABELS[typeCode] ?? typeCode) || 'Objet';
  const taxonomyGroups = parseTaxonomyGroups(raw);
  const objectMedia = parseMedia(raw);
  const menus = buildMenus(raw);
  const places = (() => {
    const rawPlaces = readArray(raw.object_places).length > 0
      ? readArray(raw.object_places)
      : readArray(raw.places);
    const parsedPlacesById = new Map(parsed.text.places.map((place) => [place.id, place]));

    return rawPlaces.map((place) =>
      normalizePlaceItem(readRecord(place), parsedPlacesById.get(readString(readRecord(place).id))),
    );
  })();
  const roomMedia = extractRoomMedia(raw);
  const stageMedia = extractStageMedia(raw);
  const placeMedia = extractPlaceMedia(raw, places);
  const menuMedia = menus.flatMap((menu) => menu.items.flatMap((item) => item.media));
  const mediaAssets: ModifierMediaAsset[] = [
    ...objectMedia.map((item) => ({
      id: item.id,
      url: item.url,
      title: item.title,
      credit: item.credit,
      tags: item.tags,
      context: 'object' as const,
      contextLabel: 'Objet',
      detail: item.typeLabel || 'Media',
    })),
    ...placeMedia,
    ...roomMedia,
    ...stageMedia,
    ...menuMedia,
  ];
  const prices = parsePrices(raw);
  const openings = parseOpenings(raw);
  const capacities = parseCapacities(raw);
  const roomTypes = parseRoomTypes(raw);
  const meetingRooms = parseMeetingRooms(raw);
  const memberships = parseMemberships(raw);
  const legalRecords = parseLegal(raw);
  const externalSyncs = parseExternalSyncs(raw);
  const interactions = buildInteractionItems(raw);
  const tasks = buildTaskItems(raw);
  const consents = buildConsentItems(raw);
  const reviews = buildReviewItems(raw);
  const itineraryDetails = readRecord(raw.itinerary_details);
  const highlightGroups = taxonomyGroups.filter((group) =>
    ['classifications', 'labels', 'badges', 'sustainability'].includes(group.key),
  );
  const paymentMethods = readPaymentMethods(taxonomyGroups);
  const environmentTags = readEnvironmentTags(taxonomyGroups);
  const mainLocationRecord = readArray(raw.object_locations).find((location) => readBoolean(location.is_main_location) === true)
    ?? readRecord(raw.location);

  const navCounts = {
    overview: Math.max(1, parsed.text.descriptions.length),
    location: Math.max(1, places.length + readZones(raw).length),
    contacts: parsed.contacts.public.length + parsed.relations.actors.length + parsed.relations.organizations.length + memberships.length,
    media: mediaAssets.length,
    distinctions: highlightGroups.reduce((total, group) => total + group.items.length, 0),
    offer: prices.length + openings.length + paymentMethods.length + readArray(raw.promotions).length,
    'type-details': capacities.length + roomTypes.length + meetingRooms.length + menus.length + readArray(raw.fma_occurrences).length,
    crm: parsed.text.privateNotes.length + reviews.length + interactions.length + tasks.length,
    'legal-sync': legalRecords.length + externalSyncs.length + readArray(raw.origins).length + readArray(raw.publications).length,
  };

  return {
    raw,
    parsed,
    typeCode,
    typeLabel,
    identity: {
      id: detail.id,
      name: detail.name,
      status: parsed.identity.status,
      commercialVisibility: readString(raw.commercial_visibility, parsed.identity.commercialVisibility || 'active'),
      businessTimezone: readString(raw.business_timezone, 'Indian/Reunion'),
      secondaryTypes: Array.isArray(raw.secondary_types) ? raw.secondary_types.map((value) => String(value)).filter(Boolean) : [],
      currentVersion: readString(raw.current_version),
    },
    overview: {
      descriptionsCount: parsed.text.descriptions.length,
      summaryText: parsed.text.chapo || parsed.text.description || parsed.text.mobileDescription || '',
      languages: taxonomyGroups.find((group) => group.key === 'languages')?.items.map((item) => item.label) ?? [],
    },
    location: {
      mainLabel: parsed.location?.label ?? '',
      coordinatesLabel:
        parsed.location?.latitude != null && parsed.location.longitude != null
          ? `${parsed.location.latitude}, ${parsed.location.longitude}`
          : '',
      places,
      zones: readZones(raw),
      mainLocationRecord: readRecord(mainLocationRecord),
    },
    contacts: {
      memberships,
    },
    distinctions: {
      groups: highlightGroups,
      highlightCount: highlightGroups.reduce((total, group) => total + group.items.length, 0),
    },
    media: {
      objectMedia,
      assets: mediaAssets,
    },
    offer: {
      prices,
      openings,
      paymentMethods,
      environmentTags,
      groupPolicies: readArray(raw.group_policies),
      promotions: readArray(raw.promotions),
    },
    typeDetails: {
      capacities,
      roomTypes,
      meetingRooms,
      menus,
      itineraryStages: readArray(raw.itinerary_stages).length > 0 ? readArray(raw.itinerary_stages) : readArray(itineraryDetails.stages),
      itinerarySections: readArray(raw.itinerary_sections).length > 0 ? readArray(raw.itinerary_sections) : readArray(itineraryDetails.sections),
      itineraryProfiles: readArray(raw.itinerary_profiles).length > 0 ? readArray(raw.itinerary_profiles) : readArray(itineraryDetails.profiles),
      itineraryInfos: readArray(raw.itinerary_infos).length > 0 ? readArray(raw.itinerary_infos) : [readRecord(itineraryDetails.info)].filter((item) => Object.keys(item).length > 0),
      activity: isRecord(raw.object_act) ? readRecord(raw.object_act) : isRecord(raw.activity) ? readRecord(raw.activity) : null,
      events: readArray(raw.fma),
      eventOccurrences: readArray(raw.fma_occurrences),
    },
    crm: {
      reviews,
      reviewSummary: readRecord(raw.review_summary),
      interactions,
      tasks,
      consents,
    },
    legalSync: {
      legalRecords,
      externalSyncs,
      origins: readArray(raw.origins),
      publications: readArray(raw.publications),
      cachedDiagnostics: buildCachedDiagnostics(raw),
    },
    navCounts: {
      ...navCounts,
      media_object: objectMedia.length,
      media_place: countNestedMedia(mediaAssets, 'place'),
      media_room: countNestedMedia(mediaAssets, 'room'),
      media_stage: countNestedMedia(mediaAssets, 'stage'),
      media_menu: countNestedMedia(mediaAssets, 'menu-item'),
    },
  };
}
