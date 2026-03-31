import {
  parseActors,
  parseCapacities,
  parseExternalSyncs,
  parseItinerarySummary,
  parseLegal,
  parseMedia,
  parseMemberships,
  parseMeetingRooms,
  parseOpenings,
  parseOrganizations,
  parsePetPolicy,
  parsePrices,
  parseRelatedObjects,
  parseRoomTypes,
  parseTaxonomyGroups,
  readArray,
  readBoolean,
  readString,
  type ActorItem,
  type CapacityItem,
  type ContactItem,
  type ExternalSyncItem,
  type ItinerarySummary,
  type LegalItem,
  type MediaItem,
  type MembershipItem,
  type MeetingRoomItem,
  type OpeningItem,
  type OrganizationItem,
  type PetPolicyItem,
  type PriceItem,
  type RelatedObjectItem,
  type RoomTypeItem,
  type TaxonomyGroup,
} from '../features/object-drawer/utils';

interface GenericRecord {
  [key: string]: unknown;
}

type ContactSource = 'object' | 'actor' | 'organization';

export interface ParsedIdentity {
  id: string;
  name: string;
  type: string;
  status: string;
  commercialVisibility: string;
  isEditing: boolean | null;
  regionCode: string;
  createdAt: string;
  updatedAt: string;
  updatedAtSource: string;
  publishedAt: string;
}

export interface DescriptionEntry {
  id: string;
  language: string;
  position: number | null;
  description: string;
  chapo: string;
  adaptedDescription: string;
  mobileDescription: string;
  editorialDescription: string;
  visibility: string;
  audience: string;
  createdAt: string;
  updatedAt: string;
}

export interface PrivateNoteEntry {
  id: string;
  body: string;
  audience: string;
  category: 'general' | 'important' | 'urgent' | 'internal' | 'followup';
  isPinned: boolean;
  isArchived: boolean;
  canEdit: boolean;
  canDelete: boolean;
  language: string;
  createdAt: string;
  updatedAt: string;
  createdById: string;
  createdByName: string;
  createdByAvatarUrl: string;
}

export interface PlaceItem {
  id: string;
  name: string;
  type: string;
  descriptions: DescriptionEntry[];
  locationLabel: string;
}

export interface ParsedTextSection {
  description: string;
  chapo: string;
  adaptedDescription: string;
  mobileDescription: string;
  editorialDescription: string;
  descriptions: DescriptionEntry[];
  places: PlaceItem[];
  privateNote: PrivateNoteEntry | null;
  privateNotes: PrivateNoteEntry[];
}

export interface ParsedLocation {
  address: string;
  city: string;
  postcode: string;
  lieuDit: string;
  direction: string;
  label: string;
  coordinates: string;
  latitude: number | null;
  longitude: number | null;
  geometry: Record<string, unknown>;
  googleMapsUrl: string;
  directionsUrl: string;
}

export interface ParsedContactGroup {
  object: ContactItem[];
  actors: ContactItem[];
  organizations: ContactItem[];
  public: ContactItem[];
  all: ContactItem[];
}

export interface ParsedMediaSection {
  hero: MediaItem | null;
  items: MediaItem[];
  gallery: MediaItem[];
  tagCloud: string[];
}

export interface ParsedSustainabilitySection {
  labels: Array<{ id: string; label: string; meta: string }>;
  actions: Array<{ id: string; label: string; meta: string }>;
  actionLabels: Array<{ id: string; label: string; meta: string }>;
  merged: Array<{ id: string; label: string; meta: string }>;
}

export interface ParsedAmenityItem {
  id: string;
  label: string;
  iconUrl: string;
}

export interface ParsedTaxonomySection {
  groups: TaxonomyGroup[];
  amenities: string[];
  amenityItems: ParsedAmenityItem[];
  sustainability: ParsedSustainabilitySection;
}

export interface ParsedOperationsSection {
  capacities: CapacityItem[];
  roomTypes: RoomTypeItem[];
  meetingRooms: MeetingRoomItem[];
  prices: PriceItem[];
  openings: OpeningItem[];
  discounts: Array<Record<string, unknown>>;
  groupPolicies: Array<Record<string, unknown>>;
  petPolicy: PetPolicyItem | null;
}

export interface ParsedRelationsSection {
  associated: RelatedObjectItem[];
  incoming: RelatedObjectItem[];
  outgoing: RelatedObjectItem[];
  all: RelatedObjectItem[];
  organizations: OrganizationItem[];
  actors: ActorItem[];
  memberships: MembershipItem[];
  parentObjects: OrganizationItem[];
  orgLinks: OrganizationItem[];
}

export interface ParsedItinerarySection {
  summary: ItinerarySummary | null;
  details: Record<string, unknown>;
  fma: Array<Record<string, unknown>>;
  fmaOccurrences: Array<Record<string, unknown>>;
}

export interface ParsedInternalSection {
  legalRecords: LegalItem[];
  externalIds: ExternalSyncItem[];
  origins: Array<Record<string, unknown>>;
  privateNotes: PrivateNoteEntry[];
  render: Record<string, unknown>;
  transparentBlocks: Record<string, unknown>;
}

export interface ParsedCoverage {
  recognizedKeys: string[];
  normalizedSections: string[];
  unhandledKeys: string[];
}

export interface ParsedObjectDetail {
  raw: Record<string, unknown>;
  identity: ParsedIdentity;
  text: ParsedTextSection;
  location: ParsedLocation | null;
  contacts: ParsedContactGroup;
  media: ParsedMediaSection;
  taxonomy: ParsedTaxonomySection;
  operations: ParsedOperationsSection;
  relations: ParsedRelationsSection;
  itinerary: ParsedItinerarySection;
  internal: ParsedInternalSection;
  coverage: ParsedCoverage;
}

const KNOWN_TOP_LEVEL_KEYS = new Set([
  'id',
  'type',
  'status',
  'commercial_visibility',
  'is_editing',
  'name',
  'region_code',
  'created_at',
  'updated_at',
  'updated_at_source',
  'published_at',
  'current_membership',
  'address',
  'location',
  'opening_times',
  'opening_periods',
  'openings',
  'places',
  'description',
  'description_chapo',
  'description_adapted',
  'description_mobile',
  'description_edition',
  'descriptions',
  'object_description',
  'object_descriptions',
  'descriptions_list',
  'private_note',
  'private_notes',
  'external_ids',
  'object_external_ids',
  'contacts',
  'languages',
  'actors',
  'organizations',
  'parent_objects',
  'media',
  'meeting_rooms',
  'object_meeting_rooms',
  'capacity',
  'capacities',
  'object_capacities',
  'capacity_metrics',
  'amenities',
  'object_amenities',
  'features',
  'equipment',
  'equipments',
  'environment_tags',
  'payment_methods',
  'prices',
  'object_prices',
  'discounts',
  'group_policies',
  'classifications',
  'tags',
  'labels',
  'badges',
  'menus',
  'cuisine_types',
  'dietary_tags',
  'allergens',
  'associated_restaurants_cuisine_types',
  'legal_records',
  'pet_policy',
  'pet_accepted',
  'pets_accepted',
  'origins',
  'org_links',
  'itinerary_details',
  'itinerary',
  'outgoing_relations',
  'incoming_relations',
  'relations',
  'associated_objects',
  'memberships',
  'object_memberships',
  'room_types',
  'object_room_types',
  'practices',
  'object_practices',
  'fma',
  'fma_occurrences',
  'sustainability_labels',
  'sustainability_actions',
  'sustainability_action_labels',
  'render',
  'object_location',
  'object_locations',
  'locations',
  'deep_data',
]);

function isRecord(value: unknown): value is GenericRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function readList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim();
    if (!normalized) {
      return null;
    }

    const parsed = Number.parseInt(normalized, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }

  return null;
}

function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim();
    if (!normalized) {
      return null;
    }

    const parsed = Number.parseFloat(normalized);
    return Number.isNaN(parsed) ? null : parsed;
  }

  return null;
}

function readNamedValue(value: unknown, fallback = ''): string {
  if (typeof value === 'string' || typeof value === 'number') {
    return readString(value, fallback);
  }

  if (isRecord(value)) {
    return (
      readString(value.name) ||
      readString(value.label) ||
      readString(value.title) ||
      readString(value.display_name) ||
      readString(value.value_name) ||
      readString(value.scheme_name) ||
      readString(value.kind_name) ||
      readString(value.kind_label) ||
      readString(value.code) ||
      readString(value.slug) ||
      fallback
    );
  }

  return fallback;
}

function readRichText(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value);
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const candidate = readRichText(item);
      if (candidate) {
        return candidate;
      }
    }
    return '';
  }

  if (isRecord(value)) {
    const priorityKeys = ['fr', 'text', 'value', 'label', 'name', 'description', 'description_adapted', 'description_chapo', 'description_mobile', 'description_edition'];
    for (const key of priorityKeys) {
      const candidate = readRichText(value[key]);
      if (candidate) {
        return candidate;
      }
    }

    for (const candidate of Object.values(value)) {
      const text = readRichText(candidate);
      if (text) {
        return text;
      }
    }
  }

  return '';
}

function pickFirstText(...values: unknown[]): string {
  for (const value of values) {
    const text = readRichText(value).trim();
    if (text) {
      return text;
    }
  }

  return '';
}

function dedupeByKey<T>(items: T[], getKey: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = getKey(item);
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function dedupeLabels(labels: string[]): string[] {
  return dedupeByKey(labels, (label) => label.trim().toLowerCase());
}

function makeItemId(prefix: string, record: Record<string, unknown>, index: number, fallback = ''): string {
  return readString(record.id, readString(record.code, readString(record.slug, `${prefix}-${fallback || index}`)));
}

function formatDateRange(start: unknown, end: unknown, fallback: string): string {
  const startLabel = readString(start);
  const endLabel = readString(end);

  if (startLabel && endLabel) {
    return `${startLabel} -> ${endLabel}`;
  }
  if (startLabel) {
    return `A partir du ${startLabel}`;
  }
  if (endLabel) {
    return `Jusqu'au ${endLabel}`;
  }

  return fallback;
}

function normalizeUrlValue(value: string): string {
  const normalized = value.trim();
  if (!normalized) {
    return '';
  }

  if (/^https?:\/\//i.test(normalized) || /^[a-z]+:\/\//i.test(normalized)) {
    return normalized;
  }

  return `https://${normalized}`;
}

function normalizePhoneValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  if (trimmed.startsWith('+')) {
    return `+${trimmed.slice(1).replace(/[^\d]/g, '')}`;
  }

  return trimmed.replace(/[^\d]/g, '');
}

function buildContactHref(kindCode: string, value: string): string {
  const normalizedKind = kindCode.trim().toLowerCase();
  const normalizedValue = value.trim();

  if (!normalizedValue) {
    return '';
  }

  if (normalizedKind === 'email' || (!normalizedKind && normalizedValue.includes('@'))) {
    return `mailto:${normalizedValue}`;
  }

  if (['phone', 'mobile', 'fax'].includes(normalizedKind)) {
    const phone = normalizePhoneValue(normalizedValue);
    return phone ? `tel:${phone}` : '';
  }

  if (normalizedKind === 'whatsapp') {
    const phone = normalizePhoneValue(normalizedValue).replace(/^\+/, '');
    return phone ? `https://wa.me/${phone}` : '';
  }

  if (
    ['website', 'booking', 'facebook', 'instagram', 'linkedin', 'youtube', 'tiktok'].includes(normalizedKind) ||
    /^https?:\/\//i.test(normalizedValue) ||
    /^[\w.-]+\.[a-z]{2,}/i.test(normalizedValue)
  ) {
    return normalizeUrlValue(normalizedValue);
  }

  return '';
}

function parseDescriptionEntry(value: unknown, prefix: string, index: number): DescriptionEntry | null {
  const record = readRecord(value);
  const description = pickFirstText(record.description, record.text, record.value, record.body);
  const chapo = pickFirstText(record.description_chapo, record.chapo, record.summary);
  const adaptedDescription = pickFirstText(record.description_adapted);
  const mobileDescription = pickFirstText(record.description_mobile);
  const editorialDescription = pickFirstText(record.description_edition);

  if (!description && !chapo && !adaptedDescription && !mobileDescription && !editorialDescription) {
    return null;
  }

  return {
    id: makeItemId(prefix, record, index, readString(record.language, readString(record.lang, 'text'))),
    language: readString(record.language, readString(record.lang)),
    position: readInteger(record.position),
    description,
    chapo,
    adaptedDescription,
    mobileDescription,
    editorialDescription,
    visibility: readString(record.visibility),
    audience: readString(record.audience),
    createdAt: readString(record.created_at),
    updatedAt: readString(record.updated_at),
  };
}

function parseDescriptionEntries(value: unknown, prefix: string): DescriptionEntry[] {
  return readList(value)
    .map((item, index) => parseDescriptionEntry(item, prefix, index))
    .filter((item): item is DescriptionEntry => item !== null)
    .sort((left, right) => (left.position ?? Number.MAX_SAFE_INTEGER) - (right.position ?? Number.MAX_SAFE_INTEGER));
}

function parseDescriptionContainer(value: unknown, prefix: string): DescriptionEntry[] {
  if (Array.isArray(value)) {
    return parseDescriptionEntries(value, prefix);
  }

  if (!isRecord(value)) {
    return [];
  }

  const entry = parseDescriptionEntry(value, prefix, 0);
  return entry ? [entry] : [];
}

function normalizePrivateNoteCategory(value: string): PrivateNoteEntry['category'] {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'important' || normalized === 'urgent' || normalized === 'internal' || normalized === 'followup') {
    return normalized;
  }
  return 'general';
}

function parsePrivateNoteEntry(value: unknown, prefix: string, index: number): PrivateNoteEntry | null {
  const record = readRecord(value);
  const body = pickFirstText(record.body, record.description, record.text, record.value);

  if (!body) {
    return null;
  }

  const createdByRecord = readRecord(record.created_by);
  return {
    id: makeItemId(prefix, record, index, body),
    body,
    audience: readString(record.audience, 'private'),
    category: normalizePrivateNoteCategory(readString(record.category, 'general')),
    isPinned: readBoolean(record.is_pinned) ?? false,
    isArchived: readBoolean(record.is_archived) ?? false,
    canEdit: readBoolean(record.can_edit) ?? false,
    canDelete: readBoolean(record.can_delete) ?? false,
    language: readString(record.language, readString(record.lang)),
    createdAt: readString(record.created_at),
    updatedAt: readString(record.updated_at),
    createdById: readString(createdByRecord.id),
    createdByName: pickFirstText(createdByRecord.display_name, createdByRecord.name, createdByRecord.email),
    createdByAvatarUrl: readString(createdByRecord.avatar_url),
  };
}

function parsePrivateNoteEntries(value: unknown, prefix: string): PrivateNoteEntry[] {
  return readList(value)
    .map((item, index) => parsePrivateNoteEntry(item, prefix, index))
    .filter((item): item is PrivateNoteEntry => item !== null);
}

function parsePrivateNoteContainer(value: unknown, prefix: string): PrivateNoteEntry[] {
  if (Array.isArray(value)) {
    return parsePrivateNoteEntries(value, prefix);
  }

  if (!isRecord(value)) {
    return [];
  }

  const entry = parsePrivateNoteEntry(value, prefix, 0);
  return entry ? [entry] : [];
}

function parsePlaceItems(value: unknown): PlaceItem[] {
  return readArray(value)
    .map((place, index) => {
      const descriptions = parseDescriptionEntries(place.descriptions, `place-description-${index}`);
      const locationRecord = readRecord(place.location);
      const locationLabel = [
        readString(locationRecord.address1, readString(place.address1)),
        readString(locationRecord.city, readString(place.city)),
      ].filter(Boolean).join(' · ');

      if (!descriptions.length && !locationLabel && !readString(place.name)) {
        return null;
      }

      return {
        id: readString(place.id, `place-${index}`),
        name: readString(place.name, 'Lieu'),
        type: readNamedValue(place.type, readString(place.type_code)),
        descriptions,
        locationLabel,
      };
    })
    .filter((item): item is PlaceItem => item !== null);
}

function parseText(raw: Record<string, unknown>): ParsedTextSection {
  const descriptionsRecord = readRecord(raw.descriptions);
  const objectDescriptionRecord = readRecord(raw.object_description);
  const descriptionEntries = dedupeByKey(
    [
      ...parseDescriptionContainer(raw.descriptions, 'description'),
      ...parseDescriptionContainer(raw.object_descriptions, 'object-description'),
      ...parseDescriptionContainer(raw.object_description, 'object-description'),
      ...parseDescriptionContainer(raw.descriptions_list, 'descriptions-list'),
    ],
    (item) => `${item.language}-${item.position ?? ''}-${item.description}-${item.chapo}-${item.adaptedDescription}`,
  );
  const primaryEntry = descriptionEntries[0] ?? null;
  const render = readRecord(raw.render);
  const privateNotes = dedupeByKey(
    [
      ...parsePrivateNoteContainer(raw.private_note, 'private-note-primary'),
      ...parsePrivateNoteContainer(raw.private_notes, 'private-note'),
    ],
    (item) => `${item.id}-${item.body}-${item.createdAt}-${item.updatedAt}`,
  );

  return {
    description: pickFirstText(
      raw.description,
      descriptionsRecord.description,
      descriptionsRecord,
      objectDescriptionRecord.description,
      objectDescriptionRecord,
      primaryEntry?.description,
      render.description,
    ),
    chapo: pickFirstText(
      raw.description_chapo,
      descriptionsRecord.description_chapo,
      objectDescriptionRecord.description_chapo,
      primaryEntry?.chapo,
    ),
    adaptedDescription: pickFirstText(
      raw.description_adapted,
      descriptionsRecord.description_adapted,
      objectDescriptionRecord.description_adapted,
      primaryEntry?.adaptedDescription,
    ),
    mobileDescription: pickFirstText(
      raw.description_mobile,
      descriptionsRecord.description_mobile,
      objectDescriptionRecord.description_mobile,
      primaryEntry?.mobileDescription,
    ),
    editorialDescription: pickFirstText(
      raw.description_edition,
      descriptionsRecord.description_edition,
      objectDescriptionRecord.description_edition,
      primaryEntry?.editorialDescription,
    ),
    descriptions: descriptionEntries,
    places: parsePlaceItems(raw.places),
    privateNote: privateNotes[0] ?? null,
    privateNotes,
  };
}

function buildLocationLabel(params: { address: string; lieuDit: string; postcode: string; city: string }): string {
  const cityLine = [params.postcode, params.city].filter(Boolean).join(' ');
  return [params.address, params.lieuDit, cityLine].filter(Boolean).join(' · ');
}

function buildGoogleMapsSearchUrl(label: string, latitude: number | null, longitude: number | null): string {
  const query = latitude != null && longitude != null ? `${latitude},${longitude}` : label;
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : '';
}

function buildGoogleMapsDirectionsUrl(label: string, latitude: number | null, longitude: number | null): string {
  const destination = latitude != null && longitude != null ? `${latitude},${longitude}` : label;
  return destination ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}` : '';
}

function parseLocation(raw: Record<string, unknown>): ParsedLocation | null {
  const addressRecord = isRecord(raw.address) ? raw.address : {};
  const locationRecord = isRecord(raw.location) ? raw.location : {};
  const locationCandidates = [
    ...readList(raw.object_locations),
    ...readList(raw.object_location),
    ...readList(raw.locations),
  ];
  if (isRecord(raw.object_location)) {
    locationCandidates.unshift(raw.object_location);
  }
  const mainLocation = locationCandidates.find((item) => isRecord(item) && item.is_main_location !== false);
  const mainLocationRecord = isRecord(mainLocation) ? mainLocation : {};
  const geometryRecord = readRecord(locationRecord.geometry ?? mainLocationRecord.geometry ?? raw.geometry);
  const coordinateSource = Array.isArray(locationRecord.coordinates)
    ? locationRecord.coordinates
    : Array.isArray(mainLocationRecord.coordinates)
      ? mainLocationRecord.coordinates
      : Array.isArray(geometryRecord.coordinates)
        ? geometryRecord.coordinates
        : [];

  const buildStreetAddress = (record: Record<string, unknown>): string => {
    const firstLine = [
      readString(record.address1),
      readString(record.address1_suite),
      readString(record.address2, readString(record.street)),
    ].filter(Boolean).join(' ').trim();
    return [firstLine, readString(record.address3)].filter(Boolean).join(', ');
  };

  const address = pickFirstText(
    buildStreetAddress(addressRecord),
    buildStreetAddress(mainLocationRecord),
    buildStreetAddress(locationRecord),
    mainLocationRecord.address,
    locationRecord.address,
    raw.address1,
    raw.address,
  );
  const city = pickFirstText(addressRecord.city, mainLocationRecord.city, locationRecord.city, raw.city);
  const postcode = pickFirstText(addressRecord.postcode, addressRecord.zipcode, mainLocationRecord.postcode, raw.postcode);
  const lieuDit = pickFirstText(addressRecord.lieu_dit, mainLocationRecord.lieu_dit, raw.lieu_dit);
  const direction = pickFirstText(addressRecord.direction, mainLocationRecord.direction, raw.direction);
  const latitude = readNumber(
    locationRecord.latitude ?? locationRecord.lat ?? mainLocationRecord.latitude ?? mainLocationRecord.lat ?? coordinateSource[1] ?? raw.latitude ?? raw.lat,
  );
  const longitude = readNumber(
    locationRecord.longitude ?? locationRecord.lon ?? mainLocationRecord.longitude ?? mainLocationRecord.lon ?? coordinateSource[0] ?? raw.longitude ?? raw.lon,
  );
  const label = buildLocationLabel({ address, lieuDit, postcode, city });

  if (!label && latitude == null && longitude == null) {
    return null;
  }

  return {
    address,
    city,
    postcode,
    lieuDit,
    direction,
    label: label || [latitude, longitude].filter((value) => value != null).join(', '),
    coordinates: latitude != null && longitude != null ? `${latitude}, ${longitude}` : '',
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
    geometry: geometryRecord,
    googleMapsUrl: buildGoogleMapsSearchUrl(label, latitude, longitude),
    directionsUrl: buildGoogleMapsDirectionsUrl(label, latitude, longitude),
  };
}

function sortContacts(items: ContactItem[]): ContactItem[] {
  return items.slice().sort((left, right) => {
    if (left.isPrimary !== right.isPrimary) {
      return Number(right.isPrimary) - Number(left.isPrimary);
    }

    const leftPosition = left.position ?? Number.MAX_SAFE_INTEGER;
    const rightPosition = right.position ?? Number.MAX_SAFE_INTEGER;
    return leftPosition - rightPosition;
  });
}

function mapOwnerContacts(params: {
  value: unknown;
  source: ContactSource;
  sourceName: string;
  ownerVisibility?: string;
}): ContactItem[] {
  return readArray(params.value)
    .map((contact, index) => {
      const kindRecord = readRecord(contact.kind);
      const kindCode = readString(contact.kind_code, readString(kindRecord.code)).toLowerCase();
      const kindLabel = readString(contact.kind_name, readNamedValue(contact.kind, kindCode || 'contact'));
      const value = readString(contact.value);
      const isPublicFlag = readBoolean(contact.is_public);
      const ownerIsPublic = params.ownerVisibility ? params.ownerVisibility === 'public' : true;
      const isPublic = isPublicFlag !== false && ownerIsPublic;

      if (!value) {
        return null;
      }

      return {
        id: readString(contact.id, `${params.source}-contact-${index}`),
        label: readString(contact.label, readNamedValue(contact.role, kindLabel || 'Contact')),
        kind: kindLabel || 'Contact',
        kindCode,
        value,
        href: buildContactHref(kindCode, value),
        iconUrl: readString(contact.icon_url, readString(kindRecord.icon_url)),
        isPrimary: readBoolean(contact.is_primary) === true,
        isPublic,
        position: readInteger(contact.position),
        source: params.source,
        sourceName: params.sourceName,
        visibility: readString(contact.visibility, params.ownerVisibility ?? ''),
      };
    })
    .filter((item): item is ContactItem => item !== null);
}

function buildSustainabilityLabelItems(value: unknown): Array<{ id: string; label: string; meta: string }> {
  return readArray(value)
    .map((item, index) => {
      const scheme = readString(item.scheme_name, readNamedValue(item.scheme, 'Durabilite'));
      const valueName = readString(item.value_name, readNamedValue(item.value, ''));
      const label = [scheme, valueName].filter(Boolean).join(' · ') || scheme;

      if (!label) {
        return null;
      }

      return {
        id: readString(item.value_id, readString(item.id, `sustainability-label-${index}`)),
        label,
        meta: [readString(item.status), formatDateRange(item.awarded_at, item.valid_until, '')].filter(Boolean).join(' · '),
      };
    })
    .filter((item): item is { id: string; label: string; meta: string } => item !== null);
}

function buildSustainabilityActionItems(value: unknown): Array<{ id: string; label: string; meta: string }> {
  return readArray(value)
    .map((item, index) => {
      const actionRecord = readRecord(item.action);
      const categoryRecord = readRecord(actionRecord.category);
      const label = pickFirstText(actionRecord.label, actionRecord.name, item.label, item.name);

      if (!label) {
        return null;
      }

      return {
        id: readString(item.object_action_id, readString(item.id, `sustainability-action-${index}`)),
        label,
        meta: [
          readNamedValue(categoryRecord),
          readString(item.status),
          readString(item.note),
        ].filter(Boolean).join(' · '),
      };
    })
    .filter((item): item is { id: string; label: string; meta: string } => item !== null);
}

function buildSustainabilityActionLabelItems(value: unknown): Array<{ id: string; label: string; meta: string }> {
  return readArray(value)
    .map((item, index) => {
      const labelRecord = readRecord(item.label);
      const actionRecord = readRecord(item.action);
      const label = readString(labelRecord.value_name, readNamedValue(labelRecord, readNamedValue(actionRecord, 'Durabilite')));

      if (!label) {
        return null;
      }

      return {
        id: readString(item.object_action_id, readString(item.id, `sustainability-action-label-${index}`)),
        label,
        meta: [
          readString(labelRecord.scheme_name),
          readNamedValue(actionRecord),
          readString(labelRecord.status),
        ].filter(Boolean).join(' · '),
      };
    })
    .filter((item): item is { id: string; label: string; meta: string } => item !== null);
}

function formatOpeningSlots(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => formatOpeningSlots(item));
  }

  const record = readRecord(value);
  const start = readString(record.start, readString(record.start_time, readString(record.time_start)));
  const end = readString(record.end, readString(record.end_time, readString(record.time_end)));
  if (start || end) {
    return [`${start || '00:00'} -> ${end || '23:59'}`];
  }

  if (typeof value === 'string') {
    return [value];
  }

  return [];
}

function humanizeWeekday(value: string): string {
  const normalized = value.trim().toLowerCase();
  const map: Record<string, string> = {
    monday: 'Lundi',
    tuesday: 'Mardi',
    wednesday: 'Mercredi',
    thursday: 'Jeudi',
    friday: 'Vendredi',
    saturday: 'Samedi',
    sunday: 'Dimanche',
    mon: 'Lundi',
    tue: 'Mardi',
    wed: 'Mercredi',
    thu: 'Jeudi',
    fri: 'Vendredi',
    sat: 'Samedi',
    sun: 'Dimanche',
  };

  return map[normalized] ?? value;
}

function flattenCanonicalOpeningPeriod(period: Record<string, unknown>, season: string): OpeningItem {
  const weekdaySlots = readRecord(period.weekday_slots);
  const weekdayEntries = Object.entries(weekdaySlots).filter(([, slots]) => {
    if (Array.isArray(slots)) {
      return slots.length > 0;
    }
    if (isRecord(slots)) {
      return Object.keys(slots).length > 0;
    }
    return false;
  });
  const weekdays = weekdayEntries.map(([day]) => humanizeWeekday(day));
  const slots = weekdayEntries.flatMap(([, slotValue]) => formatOpeningSlots(slotValue));

  return {
    label: readString(period.label, formatDateRange(period.date_start, period.date_end, 'Periode')),
    slots,
    weekdays,
    details: [formatDateRange(period.date_start, period.date_end, ''), season].filter(Boolean),
    season,
  };
}

function normalizeCanonicalOpenings(raw: Record<string, unknown>): OpeningItem[] {
  const openingTimes = readRecord(raw.opening_times);
  const currentPeriods = readArray(
    openingTimes.periods_current ?? openingTimes.PeriodeOuvertures ?? openingTimes.current_periods,
  );
  const nextPeriods = readArray(
    openingTimes.periods_next_year ?? openingTimes.PeriodeOuverturesAnneeSuivantes ?? openingTimes.next_year_periods,
  );

  return [
    ...currentPeriods.map((period) => flattenCanonicalOpeningPeriod(period, 'Annee en cours')),
    ...nextPeriods.map((period) => flattenCanonicalOpeningPeriod(period, 'Annee suivante')),
  ];
}

function normalizeAggregatedContacts(raw: Record<string, unknown>, organizations: OrganizationItem[]): ParsedContactGroup {
  const objectContacts = sortContacts(
    mapOwnerContacts({
      value: raw.contacts,
      source: 'object',
      sourceName: readString(raw.name, 'Lieu'),
    }),
  );
  const actorContacts = sortContacts(
    readArray(raw.actors).flatMap((actor) =>
      mapOwnerContacts({
        value: actor.contacts,
        source: 'actor',
        sourceName: readString(actor.display_name, readString(actor.name, 'Acteur')),
        ownerVisibility: readString(actor.visibility, 'public'),
      }),
    ),
  );
  const organizationContacts = sortContacts(
    organizations.flatMap((organization) => {
      const sourceList =
        organization.source === 'organization'
          ? readArray(raw.organizations)
          : organization.source === 'parent_object'
            ? readArray(raw.parent_objects)
            : readArray(raw.org_links);
      const rawOrganization = sourceList.find((item) => readString(readRecord(item).id) === organization.id);

      return mapOwnerContacts({
        value: readRecord(rawOrganization).contacts,
        source: 'organization',
        sourceName: organization.name,
      });
    }),
  );
  const all = sortContacts(
    dedupeByKey([...objectContacts, ...actorContacts, ...organizationContacts], (item) => `${item.source}-${item.sourceName}-${item.kindCode}-${item.value}`),
  );

  return {
    object: objectContacts,
    actors: actorContacts,
    organizations: organizationContacts,
    public: all.filter((contact) => contact.isPublic),
    all,
  };
}

function extractAmenities(raw: Record<string, unknown>): ParsedAmenityItem[] {
  const sources = [
    raw.amenities,
    raw.object_amenities,
    raw.features,
    raw.equipment,
    raw.equipments,
  ];

  return dedupeByKey(
    sources.flatMap((source, sourceIndex) =>
      readList(source).map((item, itemIndex) => {
        if (typeof item === 'string' || typeof item === 'number') {
          return {
            id: `amenity-${sourceIndex}-${itemIndex}`,
            label: String(item),
            iconUrl: '',
          };
        }

        const record = readRecord(item);
        const owner = readRecord(record.amenity ?? record.feature ?? record.equipment ?? item);
        const label = readNamedValue(owner, readNamedValue(item));

        return {
          id: readString(owner.id, readString(record.id, `amenity-${sourceIndex}-${itemIndex}`)),
          label,
          iconUrl: readString(owner.icon_url, readString(record.icon_url)),
        };
      }),
    ).filter((item) => item.label),
    (item) => item.label.toLowerCase(),
  );
}

function buildTaxonomy(raw: Record<string, unknown>, groups: TaxonomyGroup[], amenityItems: ParsedAmenityItem[]): ParsedTaxonomySection {
  const sustainabilityLabels = buildSustainabilityLabelItems(raw.sustainability_labels);
  const sustainabilityActions = buildSustainabilityActionItems(raw.sustainability_actions);
  const sustainabilityActionLabels = buildSustainabilityActionLabelItems(raw.sustainability_action_labels);
  const sustainabilityMerged = dedupeByKey(
    [...sustainabilityLabels, ...sustainabilityActions, ...sustainabilityActionLabels],
    (item) => item.label.toLowerCase(),
  );

  const mergedGroups = groups.slice();
  const sustainabilityGroupIndex = mergedGroups.findIndex((group) => group.key === 'sustainability');
  if (sustainabilityMerged.length > 0 && sustainabilityGroupIndex >= 0) {
    mergedGroups[sustainabilityGroupIndex] = {
      ...mergedGroups[sustainabilityGroupIndex],
      items: sustainabilityMerged,
    };
  } else if (sustainabilityMerged.length > 0) {
    mergedGroups.push({
      key: 'sustainability',
      title: 'Durabilite',
      items: sustainabilityMerged,
    });
  }

  return {
    groups: mergedGroups,
    amenities: amenityItems.map((item) => item.label),
    amenityItems,
    sustainability: {
      labels: sustainabilityLabels,
      actions: sustainabilityActions,
      actionLabels: sustainabilityActionLabels,
      merged: sustainabilityMerged,
    },
  };
}

function buildOperations(raw: Record<string, unknown>): ParsedOperationsSection {
  const canonicalOpenings = normalizeCanonicalOpenings(raw);
  const openings = canonicalOpenings.length > 0 ? canonicalOpenings : parseOpenings(raw);

  return {
    capacities: parseCapacities(raw),
    roomTypes: parseRoomTypes(raw),
    meetingRooms: parseMeetingRooms(raw),
    prices: parsePrices(raw),
    openings,
    discounts: readArray(raw.discounts),
    groupPolicies: readArray(raw.group_policies),
    petPolicy: parsePetPolicy(raw),
  };
}

function buildRelations(raw: Record<string, unknown>, organizations: OrganizationItem[], actors: ActorItem[], memberships: MembershipItem[]): ParsedRelationsSection {
  const canonicalOutgoing = readArray(raw.outgoing_relations).map((entry) => readRecord(entry));
  const canonicalIncoming = readArray(raw.incoming_relations).map((entry) => readRecord(entry));
  const legacyRelations = readRecord(raw.relations);
  const associated = parseRelatedObjects(raw).filter((item) => item.direction === 'associated');
  const outgoing = dedupeByKey(
    [
      ...canonicalOutgoing.map((entry) => ({
        id: readString(readRecord(entry.target).id, readString(entry.id)),
        name: readString(readRecord(entry.target).name),
        type: readString(readRecord(entry.target).type),
        relationship: readNamedValue(entry.relation_type, readString(entry.relation_type_id, 'Sortant')),
        direction: 'out' as const,
        note: readString(entry.note),
        distanceM: readString(entry.distance_m),
      })),
      ...parseRelatedObjects({ relations: { out: legacyRelations.out } as Record<string, unknown> }).filter((item) => item.direction === 'out'),
    ].filter((item) => item.name),
    (item) => `${item.id}-${item.relationship}-${item.direction}`,
  );
  const incoming = dedupeByKey(
    [
      ...canonicalIncoming.map((entry) => ({
        id: readString(readRecord(entry.source).id, readString(entry.id)),
        name: readString(readRecord(entry.source).name),
        type: readString(readRecord(entry.source).type),
        relationship: readNamedValue(entry.relation_type, readString(entry.relation_type_id, 'Entrant')),
        direction: 'in' as const,
        note: readString(entry.note),
        distanceM: readString(entry.distance_m),
      })),
      ...parseRelatedObjects({ relations: { in: legacyRelations.in } as Record<string, unknown> }).filter((item) => item.direction === 'in'),
    ].filter((item) => item.name),
    (item) => `${item.id}-${item.relationship}-${item.direction}`,
  );

  return {
    associated,
    outgoing,
    incoming,
    all: dedupeByKey([...associated, ...outgoing, ...incoming], (item) => `${item.id}-${item.relationship}-${item.direction}`),
    organizations,
    actors,
    memberships,
    parentObjects: organizations.filter((organization) => organization.source === 'parent_object'),
    orgLinks: organizations.filter((organization) => organization.source === 'org_link'),
  };
}

function buildItinerary(raw: Record<string, unknown>): ParsedItinerarySection {
  return {
    summary: parseItinerarySummary(raw),
    details: readRecord(raw.itinerary_details),
    fma: readArray(raw.fma),
    fmaOccurrences: readArray(raw.fma_occurrences),
  };
}

function buildInternal(raw: Record<string, unknown>, privateNotes: PrivateNoteEntry[]): ParsedInternalSection {
  const transparentKeys = [
    'menus',
    'cuisine_types',
    'dietary_tags',
    'allergens',
    'associated_restaurants_cuisine_types',
    'discounts',
    'group_policies',
    'places',
    'sustainability_actions',
    'fma',
    'fma_occurrences',
  ];

  const transparentBlocks = transparentKeys.reduce<Record<string, unknown>>((acc, key) => {
    if (key in raw) {
      acc[key] = raw[key];
    }
    return acc;
  }, {});

  return {
    legalRecords: parseLegal(raw),
    externalIds: parseExternalSyncs(raw),
    origins: readArray(raw.origins),
    privateNotes,
    render: readRecord(raw.render),
    transparentBlocks,
  };
}

function buildCoverage(params: {
  raw: Record<string, unknown>;
  identity: ParsedIdentity;
  text: ParsedTextSection;
  location: ParsedLocation | null;
  contacts: ParsedContactGroup;
  media: ParsedMediaSection;
  taxonomy: ParsedTaxonomySection;
  operations: ParsedOperationsSection;
  relations: ParsedRelationsSection;
  itinerary: ParsedItinerarySection;
  internal: ParsedInternalSection;
}): ParsedCoverage {
  const presentKeys = Object.keys(params.raw);
  const recognizedKeys = presentKeys.filter((key) => KNOWN_TOP_LEVEL_KEYS.has(key)).sort();
  const unhandledKeys = presentKeys.filter((key) => !KNOWN_TOP_LEVEL_KEYS.has(key)).sort();
  const normalizedSections = [
    params.identity.id || params.identity.name ? 'identity' : '',
    params.text.description || params.text.chapo || params.text.descriptions.length || params.text.places.length ? 'text' : '',
    params.location ? 'location' : '',
    params.contacts.public.length || params.contacts.all.length ? 'contacts' : '',
    params.media.items.length ? 'media' : '',
    params.taxonomy.groups.length || params.taxonomy.amenities.length ? 'taxonomy' : '',
    params.operations.capacities.length || params.operations.roomTypes.length || params.operations.meetingRooms.length || params.operations.prices.length || params.operations.openings.length || params.operations.discounts.length || params.operations.groupPolicies.length || params.operations.petPolicy ? 'operations' : '',
    params.relations.all.length || params.relations.organizations.length || params.relations.actors.length || params.relations.memberships.length ? 'relations' : '',
    params.itinerary.summary || params.itinerary.fma.length || params.itinerary.fmaOccurrences.length ? 'itinerary' : '',
    params.internal.legalRecords.length || params.internal.externalIds.length || params.internal.origins.length || Object.keys(params.internal.render).length || Object.keys(params.internal.transparentBlocks).length ? 'internal' : '',
  ].filter(Boolean);

  return {
    recognizedKeys,
    normalizedSections,
    unhandledKeys,
  };
}

export function parseObjectDetail(raw: Record<string, unknown>): ParsedObjectDetail {
  const identity: ParsedIdentity = {
    id: readString(raw.id),
    name: readString(raw.name),
    type: readString(raw.type),
    status: readString(raw.status),
    commercialVisibility: readString(raw.commercial_visibility),
    isEditing: readBoolean(raw.is_editing),
    regionCode: readString(raw.region_code),
    createdAt: readString(raw.created_at),
    updatedAt: readString(raw.updated_at),
    updatedAtSource: readString(raw.updated_at_source),
    publishedAt: readString(raw.published_at),
  };
  const text = parseText(raw);
  const location = parseLocation(raw);
  const actorItems = parseActors(raw);
  const organizationItems = parseOrganizations(raw);
  const membershipItems = parseMemberships(raw);
  const contacts = normalizeAggregatedContacts(raw, organizationItems);
  const mediaItems = parseMedia(raw);
  const media: ParsedMediaSection = {
    hero: mediaItems[0] ?? null,
    items: mediaItems,
    gallery: mediaItems.slice(1),
    tagCloud: dedupeLabels(mediaItems.flatMap((item) => item.tags)),
  };
  const taxonomy = buildTaxonomy(raw, parseTaxonomyGroups(raw), extractAmenities(raw));
  const operations = buildOperations(raw);
  const relations = buildRelations(raw, organizationItems, actorItems, membershipItems);
  const itinerary = buildItinerary(raw);
  const internal = buildInternal(raw, text.privateNotes);
  const coverage = buildCoverage({
    raw,
    identity,
    text,
    location,
    contacts,
    media,
    taxonomy,
    operations,
    relations,
    itinerary,
    internal,
  });

  return {
    raw,
    identity,
    text,
    location,
    contacts,
    media,
    taxonomy,
    operations,
    relations,
    itinerary,
    internal,
    coverage,
  };
}
