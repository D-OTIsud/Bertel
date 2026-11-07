import type {
  WorkspaceTranslatableField,
  ObjectWorkspaceTaxonomyPathNode,
  ObjectWorkspaceTaxonomyDomain,
  ObjectWorkspaceTaxonomyModule,
  ObjectWorkspaceLocationForm,
  ObjectWorkspaceDescriptionScope,
  ObjectWorkspacePlaceItem,
  ObjectWorkspacePlacesModule,
  ObjectWorkspaceExternalIdentifierItem,
  ObjectWorkspaceOriginItem,
  ObjectWorkspaceSyncIdentifiersModule,
  WorkspaceReferenceOption,
  ObjectWorkspaceAmenityOption,
  ObjectWorkspaceAmenityGroup,
  ObjectWorkspaceCharacteristicsModule,
  ObjectWorkspaceCapacityPoliciesModule,
  ObjectWorkspaceDistinctionsModule,
  ObjectWorkspacePricingModule,
  ObjectWorkspaceRoomTypeItem,
  ObjectWorkspaceRoomsModule,
  ObjectWorkspaceMeetingRoomItem,
  ObjectWorkspaceMeetingRoomsModule,
  ObjectWorkspaceMenuItem,
  ObjectWorkspaceMenu,
  ObjectWorkspaceMenusModule,
  ObjectWorkspaceCuisineModule,
  ObjectWorkspaceActivityModule,
  ObjectWorkspaceEventModule,
  ObjectWorkspaceItineraryModule,
  ObjectWorkspaceOpeningBucket,
  ObjectWorkspaceOpeningSlot,
  ObjectWorkspaceOpeningWeekday,
  ObjectWorkspaceOpeningSchedule,
  ObjectWorkspaceOpeningPeriod,
  ObjectWorkspaceOpeningsModule,
  ObjectWorkspaceFollowUpNote,
  ObjectWorkspaceProviderFollowUpModule,
  ObjectWorkspaceLinkedContactItem,
  ObjectWorkspaceOrganizationLinkItem,
  ObjectWorkspaceActorLinkItem,
  ObjectWorkspaceRelatedObjectItem,
  ObjectWorkspaceRelationshipsModule,
  ObjectWorkspaceMembershipScopeOption,
  ObjectWorkspaceMembershipItem,
  ObjectWorkspaceMembershipModule,
  ObjectWorkspaceLegalRecord,
  ObjectWorkspaceLegalComplianceSummary,
  ObjectWorkspaceLegalModule,
  ObjectWorkspaceMediaItem,
  ObjectWorkspaceContactItem,
  ObjectWorkspaceWebChannelItem,
  ObjectWorkspaceTagsModule,
  ObjectWorkspaceSustainabilityCategory,
  ObjectWorkspaceSustainabilityLabel,
  ObjectWorkspaceSustainabilityModule,
  ObjectWorkspaceDistributionChannel,
  ObjectWorkspaceDistributionModule,
  ObjectWorkspaceProviderModule,
  ObjectWorkspaceModules,
} from './object-workspace-types';

import { EMPTY_UNIT_TYPES, EMPTY_POSITIONINGS } from './object-workspace-types';

export type {
  WorkspaceModuleId,
  WorkspaceTranslatableField,
  ObjectWorkspaceGeneralInfo,
  ObjectWorkspaceTaxonomyPathNode,
  ObjectWorkspaceTaxonomyNodeOption,
  ObjectWorkspaceTaxonomyAssignment,
  ObjectWorkspaceTaxonomyDomain,
  ObjectWorkspaceUnitTypes,
  ObjectWorkspacePositionings,
  ObjectWorkspaceTaxonomyModule,
  ObjectWorkspaceLocationForm,
  ObjectWorkspacePlaceSummary,
  ObjectWorkspaceZoneOption,
  ObjectWorkspaceLocationModule,
  ObjectWorkspaceDescriptionScope,
  ObjectWorkspaceDescriptionsModule,
  ObjectWorkspacePlaceItem,
  ObjectWorkspacePlacesModule,
  ObjectWorkspaceModuleAvailability,
  ObjectWorkspaceModerationItem,
  ObjectWorkspacePublicationSelectionItem,
  ObjectWorkspacePublicationModule,
  ObjectWorkspaceExternalIdentifierItem,
  ObjectWorkspaceOriginItem,
  ObjectWorkspaceSyncIdentifiersModule,
  WorkspaceReferenceOption,
  WorkspaceMediaOption,
  ObjectWorkspaceAmenityOption,
  ObjectWorkspaceAmenityGroup,
  ObjectWorkspaceLanguageItem,
  ObjectWorkspaceCharacteristicsModule,
  ObjectWorkspaceCapacityItem,
  ObjectWorkspaceGroupPolicyForm,
  ObjectWorkspacePetPolicyForm,
  ObjectWorkspaceStayPolicyForm,
  ObjectWorkspaceCapacityPoliciesModule,
  ObjectWorkspaceDistinctionItem,
  ObjectWorkspaceDistinctionGroup,
  ObjectWorkspaceAccessibilityAmenityItem,
  ObjectWorkspaceDistinctionSchemeOption,
  ObjectWorkspaceDistinctionsModule,
  ObjectWorkspacePricePeriod,
  ObjectWorkspacePriceItem,
  ObjectWorkspaceDiscountItem,
  ObjectWorkspacePromotionSummary,
  ObjectWorkspacePricingModule,
  ObjectWorkspaceRoomBed,
  ObjectWorkspaceRoomTypeItem,
  ObjectWorkspaceRoomsModule,
  ObjectWorkspaceMeetingRoomItem,
  ObjectWorkspaceMeetingRoomsModule,
  ObjectWorkspaceMenuItem,
  ObjectWorkspaceMenu,
  ObjectWorkspaceMenusModule,
  ObjectWorkspaceCuisineModule,
  ObjectWorkspaceActivityModule,
  ObjectWorkspaceEventOccurrence,
  ObjectWorkspaceEventModule,
  ObjectWorkspaceItineraryStageSummary,
  ObjectWorkspaceItineraryAssocSummary,
  ObjectWorkspaceItineraryModule,
  ObjectWorkspaceOpeningBucket,
  ObjectWorkspaceOpeningSlot,
  ObjectWorkspaceOpeningWeekday,
  ObjectWorkspaceOpeningTimeFrame,
  ObjectWorkspaceOpeningTimePeriod,
  ObjectWorkspaceOpeningSchedule,
  ObjectWorkspaceOpeningPeriod,
  ObjectWorkspaceOpeningPeriodTypeOption,
  ObjectWorkspaceOpeningsModule,
  ObjectWorkspaceFollowUpNote,
  ObjectWorkspaceCrmInteractionItem,
  ObjectWorkspaceCrmTopicCount,
  ObjectWorkspaceProviderFollowUpModule,
  ObjectWorkspaceLinkedContactItem,
  ObjectWorkspaceOrganizationLinkItem,
  ObjectWorkspaceActorLinkItem,
  ObjectWorkspaceRelatedObjectItem,
  ObjectWorkspaceOrgOption,
  ObjectWorkspaceRelationshipsModule,
  ObjectWorkspaceMembershipScopeOption,
  ObjectWorkspaceMembershipItem,
  ObjectWorkspaceMembershipModule,
  ObjectWorkspaceLegalTypeOption,
  ObjectWorkspaceLegalRecord,
  ObjectWorkspaceLegalComplianceDetail,
  ObjectWorkspaceLegalComplianceSummary,
  ObjectWorkspaceLegalModule,
  ObjectWorkspaceMediaItem,
  ObjectWorkspaceMediaModule,
  ObjectWorkspaceContactItem,
  ObjectWorkspaceWebChannelItem,
  ObjectWorkspaceContactsModule,
  ObjectWorkspaceTagItem,
  ObjectWorkspaceTagsModule,
  ObjectWorkspaceSustainabilityAction,
  ObjectWorkspaceSustainabilityCategory,
  ObjectWorkspaceSustainabilityLabel,
  ObjectWorkspaceSustainabilityModule,
  ObjectWorkspaceDistributionChannel,
  ObjectWorkspaceDistributionModule,
  ObjectWorkspaceProviderModule,
  ObjectWorkspaceModules,
} from './object-workspace-types';

export { EMPTY_UNIT_TYPES, EMPTY_POSITIONINGS } from './object-workspace-types';

import { formatOpeningTime, parseItineraryTrackGeojson } from '../features/object-drawer/utils';
import type { ObjectDetail } from '../types/domain';
import {
  readCoercingString,
  readPermissiveBoolean as readBoolean,
  readTrimmedStringList as readStringList,
  isRecord,
  readRecord,
  readRecordArray as readArray,
} from '../lib/json-read';

interface GenericRecord {
  [key: string]: unknown;
}



export function readString(value: unknown, fallback = ''): string {
  return readCoercingString(value, fallback);
}

function pickFirstText(...values: unknown[]): string {
  for (const value of values) {
    const normalized = readString(value).trim();
    if (normalized) {
      return normalized;
    }
  }

  return '';
}

function readPosition(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? fallback : parsed;
  }

  return fallback;
}

function readTextMap(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    return {};
  }

  return Object.entries(value).reduce<Record<string, string>>((acc, [key, entryValue]) => {
    const normalized = readString(entryValue).trim();
    if (normalized) {
      acc[key] = normalized;
    }
    return acc;
  }, {});
}

function toTranslatableField(baseValue: unknown, translatedValue: unknown): WorkspaceTranslatableField {
  return {
    baseValue: readString(baseValue),
    values: readTextMap(translatedValue),
  };
}

function readTopLevelDescriptionSource(raw: Record<string, unknown>): GenericRecord {
  const source = {
    id: raw.description_id,
    visibility: raw.description_visibility ?? raw.visibility,
    description: raw.description,
    description_i18n: raw.description_i18n,
    description_chapo: raw.description_chapo,
    description_chapo_i18n: raw.description_chapo_i18n,
    description_adapted: raw.description_adapted,
    description_adapted_i18n: raw.description_adapted_i18n,
    description_mobile: raw.description_mobile,
    description_mobile_i18n: raw.description_mobile_i18n,
    description_edition: raw.description_edition,
    description_edition_i18n: raw.description_edition_i18n,
  };

  return Object.values(source).some((value) => readString(value).trim() || Object.keys(readRecord(value)).length > 0)
    ? source
    : {};
}

function pickDescriptionSource(raw: Record<string, unknown>): GenericRecord {
  const candidates = [
    readRecord(raw.object_description),
    ...readArray(raw.object_descriptions),
    readRecord(raw.descriptions),
    ...readArray(raw.descriptions),
    ...readArray(raw.descriptions_list),
    readTopLevelDescriptionSource(raw),
  ];

  return candidates.find((candidate) => Object.keys(candidate).length > 0) ?? {};
}

function parseLocationRecord(value: unknown): ObjectWorkspaceLocationForm {
  const record = readRecord(value);
  return {
    recordId: readString(record.id) || null,
    altitude: readString(record.altitude_m, readString(record.altitude)),
    address1: readString(record.address1, readString(record.address)),
    address1Suite: readString(record.address1_suite),
    address2: readString(record.address2),
    address3: readString(record.address3),
    postcode: readString(record.postcode),
    city: readString(record.city),
    codeInsee: readString(record.code_insee),
    lieuDit: readString(record.lieu_dit),
    // §110: public `direction` is now strip_markdown'd; the editor round-trips RAW, so prefer direction_md.
    direction: readString(record.direction_md, readString(record.direction)),
    latitude: readString(record.latitude, readString(record.lat)),
    longitude: readString(record.longitude, readString(record.lon)),
    zoneTouristique: readString(record.zone_touristique),
  };
}

export function parseMainLocation(raw: Record<string, unknown>): ObjectWorkspaceLocationForm {
  const addressRecord = readRecord(raw.address);
  const locationRecord = readRecord(raw.location);
  const candidates = [
    ...readArray(raw.object_locations),
    ...readArray(raw.object_location),
    ...readArray(raw.locations),
  ];
  if (isRecord(raw.object_location)) {
    candidates.unshift(raw.object_location);
  }
  const mainCandidate = candidates.find((candidate) => Object.keys(candidate).length > 0 && candidate.is_main_location !== false) ?? {};
  const mainLocationRecord = readRecord(mainCandidate);
  const parsed = parseLocationRecord(mainLocationRecord);
  const geometryRecord = readRecord(locationRecord.geometry ?? mainLocationRecord.geometry ?? raw.geometry);
  const coordinateSource = Array.isArray(locationRecord.coordinates)
    ? locationRecord.coordinates
    : Array.isArray(mainLocationRecord.coordinates)
      ? mainLocationRecord.coordinates
      : Array.isArray(geometryRecord.coordinates)
        ? geometryRecord.coordinates
        : [];

  return {
    ...parsed,
    address1: pickFirstText(
      parsed.address1,
      addressRecord.address1,
      addressRecord.street,
      mainLocationRecord.address1,
      mainLocationRecord.address,
      locationRecord.address,
      raw.address1,
      raw.address,
    ),
    postcode: pickFirstText(
      parsed.postcode,
      addressRecord.postcode,
      addressRecord.zipcode,
      mainLocationRecord.postcode,
      raw.postcode,
    ),
    city: pickFirstText(parsed.city, addressRecord.city, mainLocationRecord.city, locationRecord.city, raw.city),
    lieuDit: pickFirstText(parsed.lieuDit, addressRecord.lieu_dit, mainLocationRecord.lieu_dit, raw.lieu_dit),
    direction: pickFirstText(
      parsed.direction,
      readString(addressRecord.direction_md, readString(addressRecord.direction)),
      readString(mainLocationRecord.direction_md, readString(mainLocationRecord.direction)),
      readString(raw.direction_md, readString(raw.direction)),
    ),
    latitude: pickFirstText(
      parsed.latitude,
      locationRecord.latitude,
      locationRecord.lat,
      mainLocationRecord.latitude,
      mainLocationRecord.lat,
      coordinateSource[1],
      raw.latitude,
      raw.lat,
    ),
    longitude: pickFirstText(
      parsed.longitude,
      locationRecord.longitude,
      locationRecord.lon,
      mainLocationRecord.longitude,
      mainLocationRecord.lon,
      coordinateSource[0],
      raw.longitude,
      raw.lon,
    ),
  };
}

function normalizePlaceVisibilityCode(value: string): 'public' | 'private' | 'partners' {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'partner' || normalized === 'partners') return 'partners';
  if (normalized === 'internal' || normalized === 'private') return 'private';
  return 'public';
}

export function createEmptyPlaceItem(position = 0): ObjectWorkspacePlaceItem {
  return {
    recordId: crypto.randomUUID(),
    isNew: true,
    label: '',
    position,
    descriptionRecordId: crypto.randomUUID(),
    description: { baseValue: '', values: {} },
    visibility: 'public',
    location: {
      recordId: crypto.randomUUID(),
      address1: '',
      address1Suite: '',
      address2: '',
      address3: '',
      postcode: '',
      city: '',
      codeInsee: '',
      lieuDit: '',
      direction: '',
      latitude: '',
      longitude: '',
      zoneTouristique: '',
    },
  };
}

export function parseWorkspacePlacesModule(raw: Record<string, unknown>): ObjectWorkspacePlacesModule {
  const items = readArray(raw.places).map((place, index) => {
    const descriptions = readArray(place.descriptions);
    const source = descriptions[0] ?? readRecord(place.object_place_description);
    const locations = readArray(place.locations);
    const locationRecord = locations.find((row) => row.is_main_location === true)
      ?? locations[0] ?? readRecord(place.location ?? place.object_location);
    const descriptionScope = parseDescriptionScope({
      record: source,
      scope: 'place',
      placeId: readString(place.id, `place-${index}`),
      label: readString(place.name, readString(place.label)),
    });
    const location = parseLocationRecord(locationRecord);
    return {
      recordId: readString(place.id) || null,
      label: readString(place.name, readString(place.label)),
      rawName: typeof (place.name ?? place.label) === 'string' ? String(place.name ?? place.label) : null,
      rawPlace: place,
      rawLocations: readArray(place.locations).length ? readArray(place.locations) : Object.keys(locationRecord).length ? [locationRecord] : [],
      rawDescriptions: descriptions,
      position: readPosition(place.position, index),
      descriptionRecordId: readString(source.id) || null,
      description: descriptionScope.description,
      visibility: normalizePlaceVisibilityCode(readString(source.visibility, 'public')),
      rawVisibility: source.id ? (typeof source.visibility === 'string' ? source.visibility : null) : undefined,
      location: {
        ...location,
        raw: locationRecord,
        altitude: readString(locationRecord.altitude_m, readString(locationRecord.altitude)),
        recordId: readString(locationRecord.id) || null,
        direction: readString(locationRecord.direction_md, readString(locationRecord.direction)),
      },
    } satisfies ObjectWorkspacePlaceItem;
  });

  return { items, knownPlaceIds: items.map((item) => item.recordId).filter((id): id is string => Boolean(id)), unavailableReason: null };
}

function parseDescriptionScope(params: {
  record: GenericRecord;
  scope: 'object' | 'place';
  placeId?: string | null;
  label: string;
}): ObjectWorkspaceDescriptionScope {
  // §110 Markdown: for the PLACE scope the resource's flat prose keys are STRIPPED (plain text),
  // so the raw scalar base comes from the *_raw siblings get_object_resource now emits. The object/
  // org scopes (canonical_description / org_description) carry the raw scalar in the flat key (editor-
  // only keys, never stripped), so they keep reading the flat key.
  const base = (raw: unknown, flat: unknown) => (params.scope === 'place' ? (raw ?? flat) : flat);

  return {
    recordId: readString(params.record.id) || null,
    scope: params.scope,
    placeId: params.placeId ?? null,
    label: params.label,
    // No 'public' default -- keep a NULL DB visibility as '' so saves don't widen it
    // (the 8t read gate treats NULL as extended-scope-only). INSERTs default at the call site.
    visibility: readString(params.record.visibility),
    description: toTranslatableField(base(params.record.description_raw, params.record.description), params.record.description_i18n),
    chapo: toTranslatableField(base(params.record.description_chapo_raw, params.record.description_chapo), params.record.description_chapo_i18n),
    adaptedDescription: toTranslatableField(base(params.record.description_adapted_raw, params.record.description_adapted), params.record.description_adapted_i18n),
    mobileDescription: toTranslatableField(base(params.record.description_mobile_raw, params.record.description_mobile), params.record.description_mobile_i18n),
    editorialDescription: toTranslatableField(base(params.record.description_edition_raw, params.record.description_edition), params.record.description_edition_i18n),
  };
}

function collectLanguages(params: {
  langPrefs: string[];
  nameTranslations: Record<string, string>;
  objectScope: ObjectWorkspaceDescriptionScope;
  orgScope: ObjectWorkspaceDescriptionScope | null;
  placeScopes: ObjectWorkspaceDescriptionScope[];
}): string[] {
  const candidateSets = [
    params.langPrefs,
    Object.keys(params.nameTranslations),
    Object.keys(params.objectScope.description.values),
    Object.keys(params.objectScope.chapo.values),
    Object.keys(params.objectScope.adaptedDescription.values),
    Object.keys(params.objectScope.mobileDescription.values),
    Object.keys(params.objectScope.editorialDescription.values),
    ...(params.orgScope ? [
      Object.keys(params.orgScope.description.values),
      Object.keys(params.orgScope.chapo.values),
      Object.keys(params.orgScope.adaptedDescription.values),
    ] : []),
    ...params.placeScopes.flatMap((scope) => [
      Object.keys(scope.description.values),
      Object.keys(scope.chapo.values),
      Object.keys(scope.adaptedDescription.values),
      Object.keys(scope.mobileDescription.values),
      Object.keys(scope.editorialDescription.values),
    ]),
  ];

  const languages = candidateSets.flat().filter(Boolean);
  return Array.from(new Set(languages.length > 0 ? languages : ['fr']));
}

export function parseWorkspaceMediaItem(params: {
  record: GenericRecord;
  index: number;
  scope: 'object' | 'place';
  placeId?: string | null;
  scopeLabel: string;
}): ObjectWorkspaceMediaItem {
  const mediaType = readRecord(params.record.media_type);

  return {
    id: readString(params.record.id, `media-${params.scope}-${params.index}`),
    scope: params.scope,
    placeId: params.placeId ?? null,
    scopeLabel: params.scopeLabel,
    typeId: readString(params.record.media_type_id),
    typeCode: readString(params.record.type_code, readString(mediaType.code)),
    typeLabel: readString(params.record.type_name, readString(mediaType.name)),
    title: readString(params.record.title, readString(params.record.name, 'Media')),
    titleTranslations: readTextMap(params.record.title_i18n),
    description: readString(params.record.description),
    descriptionTranslations: readTextMap(params.record.description_i18n),
    url: readString(params.record.url, readString(params.record.secure_url)),
    credit: readString(params.record.credit, readString(params.record.author)),
    // No 'public' default — keep a NULL DB visibility as '' so saves don't widen it
    // (the 8t read gate treats NULL as extended-scope-only). INSERTs default at the call site.
    visibility: readString(params.record.visibility),
    position: readString(params.record.position),
    width: readString(params.record.width),
    height: readString(params.record.height),
    rightsExpiresAt: readString(params.record.rights_expires_at),
    kind: readString(params.record.kind),
    isMain: readBoolean(params.record.is_main ?? params.record.main ?? params.record.is_primary),
    isPublished: params.record.is_published == null ? true : readBoolean(params.record.is_published),
    tags: Array.isArray(params.record.tags)
      ? readStringList(params.record.tags)
      : readArray(params.record.media_tags)
          .map((tag) => readString(readRecord(tag.tag).code, readString(readRecord(tag.tag).name, readString(tag.code, readString(tag.name)))))
          .filter(Boolean),
  };
}

function parseWorkspaceContactItem(record: GenericRecord, index: number): ObjectWorkspaceContactItem | null {
  const value = readString(record.value).trim();
  if (!value) {
    return null;
  }

  const kindRecord = readRecord(record.kind);
  const roleRecord = readRecord(record.role);

  return {
    id: readString(record.id, `contact-${index}`),
    kindId: readString(record.kind_id),
    kindCode: readString(record.kind_code, readString(kindRecord.code)),
    kindLabel: readString(record.kind_name, readString(kindRecord.name, 'Contact')),
    roleId: readString(record.role_id),
    roleCode: readString(record.role, readString(roleRecord.code)),
    roleLabel: readString(record.role_name, readString(roleRecord.name)),
    value,
    isPublic: record.is_public == null ? true : readBoolean(record.is_public),
    isPrimary: readBoolean(record.is_primary),
    position: readString(record.position, String(index)),
  };
}

/**
 * §90 — parse one `object_web_channel` row (réseau social or distribution link).
 * Exported for tests. Accepts BOTH shapes: the `api.get_object_resource` `web_channels`
 * payload (kind_code / kind_name / kind_domain, no kind_id) and a direct PostgREST row.
 * Drops empty-value rows (mirrors parseWorkspaceContactItem). NULL is_public ⇒ public.
 */
export function parseWorkspaceWebChannelItem(record: GenericRecord, index: number): ObjectWorkspaceWebChannelItem | null {
  const value = readString(record.value).trim();
  if (!value) {
    return null;
  }
  const kindRecord = readRecord(record.kind);
  return {
    id: readString(record.id, `web-${index}`),
    kindId: readString(record.kind_id),
    kindCode: readString(record.kind_code, readString(kindRecord.code)),
    kindLabel: readString(record.kind_name, readString(kindRecord.name, readString(record.kind_code, 'Présence web'))),
    kindDomain: readString(record.kind_domain),
    value,
    isPublic: record.is_public == null ? true : readBoolean(record.is_public),
    position: readString(record.position, String(index)),
  };
}

function parseWorkspaceTaxonomyPathNode(record: GenericRecord, index: number): ObjectWorkspaceTaxonomyPathNode | null {
  const code = readString(record.code).trim();
  const label = readString(record.name, code).trim();

  if (!code || !label) {
    return null;
  }

  return {
    id: readString(record.id, `${code}-${index}`),
    code,
    label,
    description: readString(record.description),
    depth: readPosition(record.depth, index),
  };
}

function parseWorkspaceTaxonomyModule(raw: Record<string, unknown>): ObjectWorkspaceTaxonomyModule {
  const taxonomyRecord = readRecord(raw.taxonomy);
  const domains: ObjectWorkspaceTaxonomyDomain[] = [];

  for (const record of readArray(taxonomyRecord.domains)) {
    const domain = readString(record.domain).trim();
    const label = readString(record.domain_name, domain).trim();
    if (!domain || !label) {
      continue;
    }

    const assignedNode = readRecord(record.assigned_node);
    const assignedCode = readString(assignedNode.code).trim();
    const assignedLabel = readString(assignedNode.name, assignedCode).trim();
    const path = readArray(record.path)
      .map((pathNode, index) => parseWorkspaceTaxonomyPathNode(pathNode, index))
      .filter((item): item is ObjectWorkspaceTaxonomyPathNode => item !== null)
      .sort((left, right) => left.depth - right.depth || left.label.localeCompare(right.label, 'fr'));

    const assignment = assignedCode && assignedLabel
      ? {
          recordId: null,
          nodeId: readString(assignedNode.id, assignedCode),
          code: assignedCode,
          label: assignedLabel,
          description: readString(assignedNode.description),
          depth: readPosition(assignedNode.depth, Math.max(path.length - 1, 0)),
          path: path.length > 0
            ? path
            : [{
                id: readString(assignedNode.id, assignedCode),
                code: assignedCode,
                label: assignedLabel,
                description: readString(assignedNode.description),
                depth: readPosition(assignedNode.depth, 0),
              }],
          updatedAt: readString(record.updated_at),
          source: readString(record.source),
        }
      : null;

    domains.push({
      domain,
      label,
      description: readString(record.description),
      objectType: readString(record.object_type),
      nodes: [],
      assignment,
    });
  }

  return {
    domains: domains.sort((left, right) => left.label.localeCompare(right.label, 'fr')),
    // §201 — le catalogue et la sélection sont chargés par un select direct dans
    // l'étape d'enrichissement : `get_object_resource` ne les porte pas.
    unitTypes: EMPTY_UNIT_TYPES,
    positionings: EMPTY_POSITIONINGS,
    unavailableReason: null,
  };
}

function parseWorkspaceExternalIdentifier(record: GenericRecord, index: number): ObjectWorkspaceExternalIdentifierItem | null {
  const sourceSystem = readString(record.source_system, readString(record.source)).trim();
  const externalId = readString(record.external_id).trim();

  if (!sourceSystem && !externalId) {
    return null;
  }

  return {
    id: readString(record.id, `external-id-${index}`),
    organizationObjectId: readString(record.organization_object_id),
    sourceSystem: sourceSystem || 'Source',
    externalId: externalId || 'non renseigne',
    lastSyncedAt: readString(record.last_synced_at, readString(record.last_sync_at)),
    createdAt: readString(record.created_at),
    updatedAt: readString(record.updated_at),
  };
}

function parseWorkspaceOrigin(record: GenericRecord): ObjectWorkspaceOriginItem | null {
  const sourceSystem = readString(record.source_system).trim();
  const sourceObjectId = readString(record.source_object_id).trim();
  const importBatchId = readString(record.import_batch_id).trim();
  const firstImportedAt = readString(record.first_imported_at).trim();
  const createdAt = readString(record.created_at).trim();
  const updatedAt = readString(record.updated_at).trim();

  if (!sourceSystem && !sourceObjectId && !importBatchId && !firstImportedAt && !createdAt && !updatedAt) {
    return null;
  }

  return {
    sourceSystem,
    sourceObjectId,
    importBatchId,
    firstImportedAt,
    createdAt,
    updatedAt,
  };
}

function parseWorkspaceSyncIdentifiersModule(raw: Record<string, unknown>): ObjectWorkspaceSyncIdentifiersModule {
  const externalIdentifiers = readArray(raw.external_ids ?? raw.object_external_ids)
    .map((record, index) => parseWorkspaceExternalIdentifier(record, index))
    .filter((item): item is ObjectWorkspaceExternalIdentifierItem => item !== null)
    .sort((left, right) =>
      left.sourceSystem.localeCompare(right.sourceSystem, 'fr')
      || left.externalId.localeCompare(right.externalId, 'fr')
      || left.lastSyncedAt.localeCompare(right.lastSyncedAt, 'fr'),
    );

  const origins = [
    ...readArray(raw.origins).map((record) => parseWorkspaceOrigin(record)),
    ...((() => {
      const singular = parseWorkspaceOrigin(readRecord(raw.origin));
      return singular ? [singular] : [];
    })()),
  ].filter((item): item is ObjectWorkspaceOriginItem => item !== null);

  return {
    objectCreatedAt: readString(raw.created_at),
    objectUpdatedAt: readString(raw.updated_at),
    objectUpdatedAtSource: readString(raw.updated_at_source),
    externalIdentifiers,
    origins,
    externalIdentifiersVisibilityNote: null,
    originsVisibilityNote: null,
  };
}

function parseWorkspaceCharacteristicsModule(raw: Record<string, unknown>): ObjectWorkspaceCharacteristicsModule {
  const languageOptions = dedupeReferenceOptions(
    readArray(raw.languages).map((record) => ({
      id: readString(record.id, readString(record.code)),
      code: readString(record.code),
      label: readString(record.name, readString(record.code)),
    })),
  );

  const selectedLanguages = readArray(raw.languages)
    .map((record) => ({
      languageId: readString(record.id, readString(record.code)),
      code: readString(record.code),
      label: readString(record.name, readString(record.code)),
      // §101 : niveau de maîtrise exposé par get_object_resource (languages[].level = {code,name}|null).
      // levelId reste '' (résolu par l'enrichissement éditeur via languageLevelOptions, autoritaire).
      levelId: '',
      levelCode: readString((record.level as { code?: unknown } | undefined)?.code),
      levelLabel: readString((record.level as { name?: unknown } | undefined)?.name),
    }))
    .filter((item) => item.code && item.label);

  const paymentOptions = dedupeReferenceOptions(
    readArray(raw.payment_methods).map((record) => ({
      id: readString(record.id, readString(record.code)),
      code: readString(record.code),
      label: readString(record.name, readString(record.code)),
    })),
  );

  const environmentOptions = dedupeReferenceOptions(
    readArray(raw.environment_tags).map((record) => ({
      id: readString(record.id, readString(record.code)),
      code: readString(record.code),
      label: readString(record.name, readString(record.code)),
    })),
  );

  const amenityGroups = new Map<string, ObjectWorkspaceAmenityGroup>();
  for (const record of readArray(raw.amenities)) {
    const familyRecord = readRecord(record.family);
    const familyCode = readString(familyRecord.code, 'misc');
    const familyLabel = readString(familyRecord.name, 'Autres equipements');
    const extra = readRecord(record.extra);
    const option: ObjectWorkspaceAmenityOption = {
      id: readString(record.id, readString(record.code)),
      code: readString(record.code),
      label: readString(record.name, readString(record.code)),
      disabilityTypes: readStringList((extra as Record<string, unknown>)?.disability_types),
    };

    if (!option.code || !option.label) {
      continue;
    }

    const current = amenityGroups.get(familyCode) ?? {
      familyCode,
      familyLabel,
      options: [],
    };

    if (!current.options.some((candidate) => candidate.code === option.code)) {
      current.options.push(option);
    }

    amenityGroups.set(familyCode, current);
  }

  return {
    languageOptions,
    languageLevelOptions: [],
    selectedLanguages,
    paymentOptions,
    selectedPaymentCodes: paymentOptions.map((option) => option.code),
    environmentOptions,
    selectedEnvironmentCodes: environmentOptions.map((option) => option.code),
    amenityGroups: Array.from(amenityGroups.values()).map((group) => ({
      ...group,
      options: group.options.sort((left, right) => left.label.localeCompare(right.label, 'fr')),
    })),
    selectedAmenityCodes: Array.from(
      new Set(
        Array.from(amenityGroups.values()).flatMap((group) => group.options.map((option) => option.code)),
      ),
    ),
    unavailableReason: null,
  };
}

function parseWorkspaceCapacityPoliciesModule(raw: Record<string, unknown>): ObjectWorkspaceCapacityPoliciesModule {
  const capacityItems = readArray(raw.capacity)
    .map((record, index) => ({
      recordId: readString(record.id) || null,
      metricId: readString(record.metric_id, readString(record.metric_code)),
      metricCode: readString(record.metric_code),
      metricLabel: readString(record.metric_name, readString(record.metric_code, `Capacite ${index + 1}`)),
      unit: readString(record.unit),
      value: readString(record.value),
      effectiveFrom: readString(record.effective_from),
      effectiveTo: readString(record.effective_to),
    }))
    .filter((item) => item.metricCode || item.metricLabel);

  const groupPolicyRecord = readArray(raw.group_policies)[0] ?? {};
  const petPolicyRecord = readRecord(raw.pet_policy);
  // stay_policy is loaded by the capacity enrichment (direct object_stay_policy select), like
  // pet/group — base = empty (get_object_resource does not emit it). Times normalize to HH:MM.
  const stayPolicyRecord = readRecord(raw.stay_policy);
  const toHm = (value: string): string => (value.length >= 5 ? value.slice(0, 5) : value);

  return {
    metricOptions: dedupeReferenceOptions(
      capacityItems.map((item) => ({
        id: item.metricId || item.metricCode,
        code: item.metricCode,
        label: item.metricLabel,
      })),
    ),
    capacityItems,
    groupPolicy: {
      minSize: readString(groupPolicyRecord.min_size),
      maxSize: readString(groupPolicyRecord.max_size),
      groupOnly: readBoolean(groupPolicyRecord.group_only),
      notes: readString(groupPolicyRecord.notes),
    },
    petPolicy: {
      // No row (or no accepted key) = « non renseigné » — tri-state, never false.
      accepted: petPolicyRecord.accepted == null ? null : readBoolean(petPolicyRecord.accepted),
      conditions: readString(petPolicyRecord.conditions),
    },
    stayPolicy: {
      checkInFrom: toHm(readString(stayPolicyRecord.check_in_from)),
      checkInUntil: toHm(readString(stayPolicyRecord.check_in_until)),
      checkOutUntil: toHm(readString(stayPolicyRecord.check_out_until)),
      conditions: readString(stayPolicyRecord.conditions),
    },
    unavailableReason: null,
  };
}

function parseWorkspaceDistinctionsModule(raw: Record<string, unknown>): ObjectWorkspaceDistinctionsModule {
  // §101 : get_object_resource émet désormais accessibility_labels (forme ObjectWorkspaceDistinctionItem,
  // tous statuts). L'enrichissement éditeur reste autoritaire (overrider) ; ceci sert le drawer / le
  // fallback consommateur. schemeId/documentUrl/documentTitle restent résolus loader-side (le bloc
  // n'émet que document_id, comme §08).
  const accessibilityLabels = readArray(raw.accessibility_labels).map((record) => ({
    recordId: readString(record.id) || null,
    schemeId: '',
    schemeCode: readString(record.scheme),
    schemeLabel: readString(record.scheme_name),
    valueId: readString(record.value_id),
    valueCode: readString(record.value),
    valueLabel: readString(record.value_name),
    status: readString(record.status),
    awardedAt: readString(record.awarded_at),
    validUntil: readString(record.valid_until),
    disabilityTypesCovered: readArray(record.disability_types_covered).map((d) => readString(d)).filter(Boolean),
    documentId: readString(record.document_id),
    documentUrl: '',
    documentTitle: '',
  }));
  return {
    distinctionGroups: [],
    accessibilityLabels,
    accessibilityAmenityCoverage: [],
    schemeOptions: [],
    unavailableReason: null,
  };
}

function parseWorkspacePricingModule(raw: Record<string, unknown>): ObjectWorkspacePricingModule {
  const prices = readArray(raw.prices ?? raw.object_prices).map((record, index) => {
    const kind = readRecord(record.kind);
    const unit = readRecord(record.unit);

    return {
      recordId: readString(record.id) || null,
      kindId: readString(kind.id),
      kindCode: readString(kind.code),
      kindLabel: readString(kind.name, readString(kind.code, `Tarif ${index + 1}`)),
      unitId: readString(unit.id),
      unitCode: readString(unit.code),
      unitLabel: readString(unit.name, readString(unit.code)),
      amount: readString(record.amount),
      amountMax: readString(record.amount_max),
      currency: readString(record.currency, 'EUR'),
      seasonCode: readString(record.season_code),
      indicationCode: readString(record.indication_code),
      ageMinEnfant: readString(record.age_min_enfant),
      ageMaxEnfant: readString(record.age_max_enfant),
      ageMinJunior: readString(record.age_min_junior),
      ageMaxJunior: readString(record.age_max_junior),
      validFrom: readString(record.valid_from),
      validTo: readString(record.valid_to),
      conditions: readString(record.conditions),
      source: readString(record.source),
      periods: readArray(record.periods).map((period) => ({
        recordId: readString(period.id) || null,
        startDate: readString(period.start_date),
        endDate: readString(period.end_date),
        startTime: readString(period.start_time),
        endTime: readString(period.end_time),
        note: readString(period.note),
      })),
    };
  });

  const discounts = readArray(raw.discounts ?? raw.object_discounts).map((record) => ({
    recordId: readString(record.id) || null,
    conditions: readString(record.conditions),
    discountPercent: readString(record.discount_percent),
    discountAmount: readString(record.discount_amount),
    currency: readString(record.currency),
    minGroupSize: readString(record.min_group_size),
    maxGroupSize: readString(record.max_group_size),
    validFrom: readString(record.valid_from),
    validTo: readString(record.valid_to),
    source: readString(record.source),
  }));

  return {
    priceKindOptions: dedupeReferenceOptions(
      prices.map((price) => ({
        id: price.kindId || price.kindCode,
        code: price.kindCode,
        label: price.kindLabel,
      })),
    ),
    priceTypeOptions: dedupeReferenceOptions(
      prices
        .filter((price) => price.indicationCode)
        .map((price) => ({ id: price.indicationCode, code: price.indicationCode, label: price.indicationCode })),
    ),
    priceSeasonOptions: dedupeReferenceOptions(
      prices
        .filter((price) => price.seasonCode)
        .map((price) => ({ id: price.seasonCode, code: price.seasonCode, label: price.seasonCode })),
    ),
    priceUnitOptions: dedupeReferenceOptions(
      prices.map((price) => ({
        id: price.unitId || price.unitCode,
        code: price.unitCode,
        label: price.unitLabel || price.unitCode,
      })),
    ),
    prices,
    discounts,
    // §101 : promotions liées exposées par get_object_resource (junction {promotion_id, promotion}).
    // L'enrichissement éditeur reste autoritaire (même filtre RLS public+actif) ; ceci est le
    // chemin consommateur / fallback.
    promotions: readArray(raw.promotions).map((record) => {
      const p = readRecord(record.promotion);
      return {
        promotionId: readString(record.promotion_id, readString(p.id)),
        code: readString(p.code),
        name: readString(p.name),
        discountType: readString(p.discount_type),
        discountValue: readString(p.discount_value),
        currency: readString(p.currency),
        validFrom: readString(p.valid_from),
        validTo: readString(p.valid_to),
        isActive: p.is_active === true,
        isPublic: p.is_public === true,
      };
    }),
    promotionsUnavailableReason: null,
    unavailableReason: null,
  };
}

function readNamedReference(value: unknown, fallbackLabel = ''): WorkspaceReferenceOption {
  const record = readRecord(value);
  const code = readString(record.code, readString(value)).trim();
  const label = readString(record.name, readString(record.label, fallbackLabel || code)).trim();

  return {
    id: readString(record.id, code),
    code,
    label,
  };
}

function readReferenceCodes(value: unknown, nestedKey: string): string[] {
  return readArray(value)
    .map((record) => {
      const nested = readRecord(record[nestedKey]);
      return readString(record.code, readString(nested.code, readString(record.id, readString(nested.id)))).trim();
    })
    .filter(Boolean);
}

function readMediaIds(value: unknown): string[] {
  return readArray(value)
    .map((record) => {
      const nested = readRecord(record.media);
      return readString(record.media_id, readString(nested.id, readString(record.id))).trim();
    })
    .filter(Boolean);
}

function readMenuItemMediaIds(item: GenericRecord): string[] {
  return Array.from(new Set([
    readString(item.media_id),
    readString(readRecord(item.media).id),
    ...readMediaIds(item.media),
    ...readMediaIds(item.medias),
    ...readMediaIds(item.media_items),
    ...readMediaIds(item.menu_item_media),
    ...readMediaIds(item.menu_item_medias),
    ...readMediaIds(item.object_menu_item_media),
    ...readMediaIds(item.object_menu_item_medias),
  ].filter(Boolean)));
}

function parseWorkspaceRoomsModule(raw: Record<string, unknown>): ObjectWorkspaceRoomsModule {
  const roomRecords = readArray(raw.room_types ?? raw.object_room_types ?? raw.rooms);
  const items = roomRecords.map<ObjectWorkspaceRoomTypeItem>((record, index) => {
    const viewType = readNamedReference(record.view_type, readString(record.view_type_code));

    return {
      recordId: readString(record.id) || null,
      code: readString(record.code, `room-${index + 1}`),
      name: readString(record.name),
      rawName: typeof record.name === 'string' ? record.name : null,
    extra: record.extra !== null && typeof record.extra === 'object' && !Array.isArray(record.extra)
      ? record.extra as Record<string, unknown> : null,
      nameTranslations: readTextMap(record.name_i18n),
      description: readString(record.description),
      descriptionTranslations: readTextMap(record.description_i18n),
      capacityAdults: readString(record.capacity_adults, readString(record.max_capacity)),
      capacityChildren: readString(record.capacity_children),
      capacityTotal: readString(record.capacity_total, readString(record.capacity)),
      sizeSqm: readString(record.size_sqm, readString(record.area_m2, readString(record.surface_m2))),
      bedConfig: readString(record.bed_config, readString(record.bed_config_summary)),
      bedConfigTranslations: readTextMap(record.bed_config_i18n),
      quantity: readString(record.total_rooms, readString(record.quantity, readString(record.inventory_count))),
      floorLevel: readString(record.floor_level),
      viewTypeId: readString(record.view_type_id, viewType.id),
      viewTypeCode: readString(record.view_type_code, viewType.code),
      viewTypeLabel: readString(record.view_type_label, viewType.label),
      roomTypeId: readString(record.room_type_id),
      roomTypeCode: readString(record.room_type_code),
      roomTypeLabel: readString(record.room_type_label),
      basePrice: readString(record.base_price),
      currency: readString(record.currency),
      accessible: readBoolean(record.is_accessible ?? record.accessible),
      rawAccessible: record.is_accessible == null ? null : readBoolean(record.is_accessible),
      published: record.is_published == null ? true : readBoolean(record.is_published),
      rawPublished: record.is_published == null ? null : readBoolean(record.is_published),
      position: readString(record.position),
      amenityCodes: readReferenceCodes(record.amenities ?? record.room_type_amenities, 'amenity'),
      mediaIds: readArray(record.media ?? record.room_type_media).map((media) =>
        readString(media.media_id, readString(readRecord(media.media).id, readString(media.id))),
      ).filter(Boolean),
      // §72 structured bed list (get_object_resource emits `beds` as [{quantity, bed_type:{code,name}}]).
      beds: readArray(record.beds ?? record.room_type_beds).map((bed, bedIndex) => {
        const ref = readNamedReference(bed.bed_type ?? bed);
        return { bedTypeId: ref.id, bedTypeCode: ref.code, bedTypeLabel: ref.label, quantity: readString(bed.quantity, '1'), position: readPosition(bed.position, bedIndex) };
      }).filter((bed) => bed.bedTypeCode),
    };
  });

  return {
    viewTypeOptions: dedupeReferenceOptions(items.map((item) => ({
      id: item.viewTypeId || item.viewTypeCode,
      code: item.viewTypeCode,
      label: item.viewTypeLabel || item.viewTypeCode,
    }))),
    roomTypeOptions: dedupeReferenceOptions(items.map((item) => ({
      id: item.roomTypeId || item.roomTypeCode,
      code: item.roomTypeCode,
      label: item.roomTypeLabel || item.roomTypeCode,
    }))),
    amenityOptions: dedupeReferenceOptions(
      roomRecords.flatMap((record) =>
        readArray(record.amenities ?? record.room_type_amenities).map((amenity) => readNamedReference(amenity.amenity ?? amenity)),
      ),
    ),
    // Editor loader (object-workspace.ts) supplies the authoritative bed_type catalog + grouped
    // equipment via direct PostgREST.
    bedTypeOptions: [],
    amenityGroups: [],
    mediaOptions: [],
    items,
    knownRoomIds: items.map((item) => item.recordId).filter((id): id is string => Boolean(id)),
    unavailableReason: null,
  };
}

function parseWorkspaceMeetingRoomsModule(raw: Record<string, unknown>): ObjectWorkspaceMeetingRoomsModule {
  const roomRecords = readArray(raw.meeting_rooms ?? raw.object_meeting_rooms);
  const items = roomRecords.map<ObjectWorkspaceMeetingRoomItem>((record, index) => ({
    recordId: readString(record.id) || null,
    uid: readString(record.id, `meeting-room-${index + 1}`),
    name: readString(record.name),
    rawName: typeof record.name === 'string' ? record.name : null,
    extra: record.extra !== null && typeof record.extra === 'object' && !Array.isArray(record.extra)
      ? record.extra as Record<string, unknown> : null,
    nameTranslations: readTextMap(record.name_i18n),
    areaM2: readString(record.area_m2, readString(record.area_m2, readString(record.surface_m2))),
    capacityTheatre: readString(record.cap_theatre, readString(record.capacity_theatre, readString(record.capacity_seated))),
    capacityU: readString(record.cap_u, readString(record.capacity_u, readString(record.capacity_u_shape))),
    capacityClassroom: readString(record.cap_classroom, readString(record.capacity_classroom)),
    capacityBoardroom: readString(record.cap_boardroom, readString(record.capacity_boardroom)),
    equipmentCodes: readReferenceCodes(record.equipment ?? record.meeting_room_equipment, 'equipment'),
  }));

  return {
    equipmentOptions: dedupeReferenceOptions(
      roomRecords.flatMap((record) =>
        readArray(record.equipment ?? record.meeting_room_equipment).map((item) => readNamedReference(item.equipment ?? item)),
      ),
    ),
    items,
    knownRoomIds: items.map((item) => item.recordId).filter((id): id is string => Boolean(id)),
    unavailableReason: null,
  };
}

/**
 * §06 P1 — parse the object-level cuisine facet from `get_object_resource.cuisine_types`
 * (now sourced from `object_cuisine_type`, ordered by position). `codes` preserves that order
 * (1st = principale); `options` seeds the picker from the present rows (the full catalog is
 * loaded by the enrichment loader `getObjectWorkspaceCuisineModule`).
 */
function parseWorkspaceCuisineModule(raw: Record<string, unknown>): ObjectWorkspaceCuisineModule {
  const rows = readArray(raw.cuisine_types);
  const codes = rows.map((row) => readString(row.code)).filter(Boolean);
  const options = dedupeReferenceOptions(rows.map((row) => readNamedReference(row)));
  return { codes, options, unavailableReason: null };
}

function parseWorkspaceMenusModule(raw: Record<string, unknown>): ObjectWorkspaceMenusModule {
  const menuRecords = readArray(raw.menus ?? raw.object_menus);
  const items = menuRecords.map<ObjectWorkspaceMenu>((record, index) => {
    const category = readNamedReference(record.category, readString(record.category_code));

    return {
      recordId: readString(record.id) || null,
      categoryId: readString(record.category_id, category.id),
      categoryCode: readString(record.category_code, category.code),
      categoryLabel: readString(record.category_label, category.label),
      name: readString(record.name),
      rawName: typeof record.name === 'string' ? record.name : null,
      description: readString(record.description),
      active: record.is_active == null ? true : readBoolean(record.is_active),
      visibility: readString(record.visibility),
      rawVisibility: typeof record.visibility === 'string' ? record.visibility : null,
      position: readString(record.position, String(index + 1)),
      items: readArray(record.items ?? record.menu_items ?? record.object_menu_items).map<ObjectWorkspaceMenuItem>((item, itemIndex) => {
        const kind = readNamedReference(item.kind, readString(item.kind_code));
        const unit = readNamedReference(item.unit, readString(item.unit_code));
        const section = readNamedReference(item.section, readString(item.section_code));

        return {
          recordId: readString(item.id) || null,
          name: readString(item.name, `Ligne ${itemIndex + 1}`),
          description: readString(item.description),
          price: readString(item.price),
          currency: readString(item.currency, 'EUR'),
          kindId: readString(item.kind_id, kind.id),
          kindCode: readString(item.kind_code, kind.code),
          kindLabel: readString(item.kind_label, kind.label),
          unitId: readString(item.unit_id, unit.id),
          unitCode: readString(item.unit_code, unit.code),
          unitLabel: readString(item.unit_label, unit.label),
          mediaIds: readMenuItemMediaIds(item),
          available: item.is_available == null ? true : readBoolean(item.is_available),
          position: readString(item.position, String(itemIndex + 1)),
          dietaryTagCodes: readReferenceCodes(item.dietary_tags ?? item.menu_item_dietary_tags, 'dietary_tag'),
          allergenCodes: readReferenceCodes(item.allergens ?? item.menu_item_allergens, 'allergen'),
          cuisineTypeCodes: readReferenceCodes(item.cuisine_types ?? item.menu_item_cuisine_types, 'cuisine_type'),
          sectionCode: section.code,
          sectionId: readString(item.section_id, section.id),
          sectionLabel: section.label,
        };
      }),
    };
  });

  return {
    categoryOptions: dedupeReferenceOptions(items.map((item) => ({
      id: item.categoryId || item.categoryCode,
      code: item.categoryCode,
      label: item.categoryLabel || item.categoryCode,
    }))),
    dietaryTagOptions: dedupeReferenceOptions(
      menuRecords.flatMap((menu) =>
        readArray(menu.items ?? menu.menu_items ?? menu.object_menu_items)
          .flatMap((item) => readArray(item.dietary_tags ?? item.menu_item_dietary_tags))
          .map((tag) => readNamedReference(tag.dietary_tag ?? tag)),
      ),
    ),
    allergenOptions: dedupeReferenceOptions(
      menuRecords.flatMap((menu) =>
        readArray(menu.items ?? menu.menu_items ?? menu.object_menu_items)
          .flatMap((item) => readArray(item.allergens ?? item.menu_item_allergens))
          .map((allergen) => readNamedReference(allergen.allergen ?? allergen)),
      ),
    ),
    cuisineTypeOptions: dedupeReferenceOptions(
      menuRecords.flatMap((menu) =>
        readArray(menu.items ?? menu.menu_items ?? menu.object_menu_items)
          .flatMap((item) => readArray(item.cuisine_types ?? item.menu_item_cuisine_types))
          .map((cuisine) => readNamedReference(cuisine.cuisine_type ?? cuisine)),
      ),
    ),
    priceKindOptions: [],
    priceUnitOptions: [],
    mediaOptions: [],
    items,
    unavailableReason: null,
  };
}

function parseWorkspaceActivityModule(raw: Record<string, unknown>): ObjectWorkspaceActivityModule {
  const record = readRecord(raw.activity ?? raw.object_act ?? raw.act);

  return {
    durationMin: readString(record.duration_min, readString(raw.duration_min)),
    minParticipants: readString(record.min_participants, readString(raw.min_participants)),
    maxParticipants: readString(record.max_participants, readString(raw.max_participants)),
    difficultyLevel: readString(record.difficulty_level, readString(raw.difficulty_level)),
    guideRequired: readBoolean(record.guide_required ?? raw.guide_required),
    minAge: readString(record.min_age, readString(raw.min_age)),
    equipmentProvided: readBoolean(record.equipment_provided ?? raw.equipment_provided),
    equipmentProvidedDetails: readString(record.equipment_provided_details, readString(raw.equipment_provided_details)),
    difficultyOptions: [],
    unavailableReason: null,
  };
}

function parseWorkspaceEventModule(raw: Record<string, unknown>): ObjectWorkspaceEventModule {
  const record = readRecord(raw.fma ?? raw.event ?? raw.object_fma);

  return {
    startDate: readString(record.event_start_date, readString(record.start_date)),
    endDate: readString(record.event_end_date, readString(record.end_date)),
    startTime: readString(record.event_start_time, readString(record.start_time)),
    endTime: readString(record.event_end_time, readString(record.end_time)),
    recurring: readBoolean(record.is_recurring),
    recurrenceText: readString(record.recurrence_pattern, readString(record.recurrence_text)),
    occurrences: readArray(raw.fma_occurrences ?? record.occurrences).map((occurrence, index) => ({
      recordId: readString(occurrence.id) || null,
      startAt: readString(occurrence.start_at, readString(occurrence.start)),
      endAt: readString(occurrence.end_at, readString(occurrence.end)),
      state: readString(occurrence.state, index === 0 ? 'scheduled' : ''),
    })),
    unavailableReason: null,
  };
}

export function parseWorkspaceItineraryModule(raw: Record<string, unknown>): ObjectWorkspaceItineraryModule {
  const itinerary = readRecord(raw.itinerary ?? raw.object_iti);
  const details = readRecord(raw.itinerary_details);
  const practiceRecords = [
    ...readArray(raw.practices ?? raw.object_practices),
    ...readArray(details.practices),
  ];
  const stages = readArray(details.stages ?? itinerary.stages ?? raw.stages).map((stage, index) => {
    const extra = readRecord(stage.extra);
    return {
      recordId: readString(stage.id) || null,
      name: readString(stage.name),
      rawName: typeof stage.name === 'string' ? stage.name : null,
      nameTranslations: readTextMap(stage.name_i18n),
      description: readString(stage.description_md, readString(stage.description)),
      descriptionTranslations: readTextMap(stage.description_i18n),
      extra,
      position: readString(stage.position, String(index + 1)),
      kind: readString(extra.kind),
      lng: readString(stage.lng),
      lat: readString(stage.lat),
      mediaIds: readArray(stage.media).map((m) => readString(readRecord(m).media_id)).filter(Boolean),
    };
  });

  const associatedObjects = readArray(details.associated_objects).map((entry) => {
    const rec = readRecord(entry);
    const target = readRecord(rec.target);
    return {
      associatedObjectId: readString(rec.associated_object_id),
      roleId: readString(rec.role_id),
      note: readString(rec.note),
      targetName: readString(target.name),
      targetType: readString(target.type),
    };
  }).filter((entry) => entry.associatedObjectId !== '');

  const geometrySummary = [
    readString(itinerary.track_format, readString(details.track_format)),
    readString(itinerary.track, readString(details.track)) ? 'trace presente' : '',
    readString(itinerary.geom, readString(raw.geom)) ? 'geometrie presente' : '',
  ].filter(Boolean).join(' · ');

  const infoRecord = readRecord(details.info);
  const trackFormat = readString(itinerary.track_format, readString(raw.track_format, readString(details.track_format)));
  const trackGeojson = parseItineraryTrackGeojson(details.track_geojson)
    ?? (trackFormat.toLowerCase() === 'geojson'
      ? parseItineraryTrackGeojson(itinerary.track ?? raw.track ?? details.track)
      : null);

  return {
    distanceKm: readString(itinerary.distance_km, readString(raw.distance_km, readString(raw.length_km, readString(raw.total_length_km)))),
    durationMin: readString(itinerary.duration_min, readString(raw.duration_min, readString(raw.total_duration_min))),
    difficultyLevel: readString(itinerary.difficulty_level, readString(raw.difficulty_level)),
    elevationPositiveM: readString(itinerary.elevation_positive_m, readString(itinerary.elevation_gain, readString(raw.elevation_gain_m))),
    elevationNegativeM: readString(itinerary.elevation_loss, readString(itinerary.elevation_negative_m, readString(raw.elevation_negative_m))),
    loop: readBoolean(itinerary.is_loop ?? raw.is_loop),
    openStatus: readString(itinerary.open_status, 'open'),
    statusNote: readString(itinerary.status_note),
    practiceOptions: dedupeReferenceOptions(practiceRecords.map((practice) => readNamedReference(practice.practice ?? practice))),
    practiceCodes: readReferenceCodes(practiceRecords, 'practice'),
    difficultyOptions: [],
    openStatusOptions: [],
    stageKindOptions: [],
    assocRoleOptions: [],
    mediaOptions: [],
    associatedObjects,
    access: readString(infoRecord.access),
    ambiance: readString(infoRecord.ambiance),
    recommendedParking: readString(infoRecord.recommended_parking),
    requiredEquipment: readString(infoRecord.required_equipment),
    infoPlaces: readString(infoRecord.info_places),
    childFriendly: readBoolean(infoRecord.is_child_friendly),
    infoTranslations: Object.fromEntries(Object.entries(infoRecord).filter(([key]) => key.endsWith('_i18n'))),
    trackGeojson,
    stages,
    sectionsCount: readArray(details.sections).length,
    profilesCount: readArray(details.profiles).length,
    geometrySummary,
    traceEditable: false,
    unavailableReason: null,
  };
}

const WORKSPACE_WEEKDAY_LABELS: Record<string, string> = {
  monday: 'Lundi',
  tuesday: 'Mardi',
  wednesday: 'Mercredi',
  thursday: 'Jeudi',
  friday: 'Vendredi',
  saturday: 'Samedi',
  sunday: 'Dimanche',
};

const WORKSPACE_WEEKDAY_ALIASES: Record<string, string> = {
  monday: 'monday',
  mon: 'monday',
  lundi: 'monday',
  lun: 'monday',
  tuesday: 'tuesday',
  tue: 'tuesday',
  mardi: 'tuesday',
  mar: 'tuesday',
  wednesday: 'wednesday',
  wed: 'wednesday',
  mercredi: 'wednesday',
  mer: 'wednesday',
  thursday: 'thursday',
  thu: 'thursday',
  jeudi: 'thursday',
  jeu: 'thursday',
  friday: 'friday',
  fri: 'friday',
  vendredi: 'friday',
  ven: 'friday',
  saturday: 'saturday',
  sat: 'saturday',
  samedi: 'saturday',
  sam: 'saturday',
  sunday: 'sunday',
  sun: 'sunday',
  dimanche: 'sunday',
  dim: 'sunday',
};

const WORKSPACE_WEEKDAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

function normalizeWorkspaceWeekdayCode(value: string): string {
  const normalized = value.trim().toLowerCase();
  return WORKSPACE_WEEKDAY_ALIASES[normalized] ?? normalized;
}

function humanizeWorkspaceWeekday(value: string): string {
  const normalized = normalizeWorkspaceWeekdayCode(value);
  return WORKSPACE_WEEKDAY_LABELS[normalized] ?? value;
}

function rankWorkspaceWeekday(value: string): number {
  const normalized = normalizeWorkspaceWeekdayCode(value);
  const index = WORKSPACE_WEEKDAY_ORDER.indexOf(normalized);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function parseWorkspaceOpeningSlot(value: unknown): ObjectWorkspaceOpeningSlot | null {
  if (typeof value === 'string') {
    const normalized = value.trim();
    if (!normalized) {
      return null;
    }

    const parts = normalized.split(/\s*(?:->|-|–|—)\s*/).filter(Boolean);
    if (parts.length >= 2) {
      return {
        start: formatOpeningTime(parts[0] ?? ''),
        end: formatOpeningTime(parts[1] ?? ''),
      };
    }

    return {
      start: formatOpeningTime(normalized),
      end: '',
    };
  }

  const record = readRecord(value);
  const start = formatOpeningTime(record.start ?? record.start_time ?? record.time_start);
  const end = formatOpeningTime(record.end ?? record.end_time ?? record.time_end);

  if (!start && !end) {
    return null;
  }

  return {
    start,
    end,
  };
}

function sortWorkspaceOpeningWeekdays(weekdays: ObjectWorkspaceOpeningWeekday[]): ObjectWorkspaceOpeningWeekday[] {
  return [...weekdays].sort((left, right) =>
    rankWorkspaceWeekday(left.code) - rankWorkspaceWeekday(right.code)
    || left.label.localeCompare(right.label, 'fr'),
  );
}

function buildWorkspaceOpeningWeekdaysFromCanonical(value: unknown): ObjectWorkspaceOpeningWeekday[] {
  const weekdaySlots = readRecord(value);

  return sortWorkspaceOpeningWeekdays(
    Object.entries(weekdaySlots)
      .map(([weekdayCode, slots]) => {
        const normalizedCode = normalizeWorkspaceWeekdayCode(weekdayCode);
        const normalizedSlots = (Array.isArray(slots) ? slots : [slots])
          .map((slot) => parseWorkspaceOpeningSlot(slot))
          .filter((slot): slot is ObjectWorkspaceOpeningSlot => slot !== null);

        return {
          code: normalizedCode,
          label: humanizeWorkspaceWeekday(normalizedCode),
          // open-without-hours sentinel: one empty slot => the day reads as OPEN downstream
          // (api.get_opening_slots_by_day emits an open day with no frames as []). Closed days
          // are absent from weekday_slots, so we no longer drop slotless days here.
          slots: normalizedSlots.length > 0 ? normalizedSlots : [{ start: '', end: '' }],
        };
      }),
  );
}

function buildWorkspaceOpeningWeekdaysFromLegacySchedules(record: GenericRecord): ObjectWorkspaceOpeningWeekday[] {
  const weekdaysByCode = new Map<string, ObjectWorkspaceOpeningWeekday>();
  const schedules = readArray(record.schedules ?? record.opening_schedules ?? record.schedule_blocks);

  for (const schedule of schedules) {
    const timePeriods = readArray(schedule.time_periods ?? schedule.opening_time_periods);
    for (const timePeriod of timePeriods) {
      const slots = readArray(timePeriod.time_frames ?? timePeriod.frames ?? timePeriod.opening_time_frames)
        .map((frame) => parseWorkspaceOpeningSlot(frame))
        .filter((slot): slot is ObjectWorkspaceOpeningSlot => slot !== null);
      const weekdayEntries = readArray(timePeriod.weekdays ?? timePeriod.opening_time_period_weekdays);

      for (const weekdayEntry of weekdayEntries) {
        const weekdayRecord = readRecord(weekdayEntry.weekday);
        const code = normalizeWorkspaceWeekdayCode(
          readString(weekdayEntry.code, readString(weekdayRecord.code, readString(weekdayRecord.name, readString(weekdayEntry)))),
        );
        if (!code) {
          continue;
        }

        const current = weekdaysByCode.get(code) ?? {
          code,
          label: humanizeWorkspaceWeekday(code),
          slots: [],
        };

        for (const slot of slots) {
          if (!current.slots.some((existing) => existing.start === slot.start && existing.end === slot.end)) {
            current.slots.push(slot);
          }
        }

        weekdaysByCode.set(code, current);
      }
    }
  }

  return sortWorkspaceOpeningWeekdays(Array.from(weekdaysByCode.values()));
}

function openingJsonObject(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

/** Normalize only writer-supported fields; the weekly grid is a projection, never the source tree. */
function parseWorkspaceOpeningSchedules(value: unknown): ObjectWorkspaceOpeningSchedule[] {
  const text = (input: unknown) => typeof input === 'string' && input !== '' ? input : null;
  return readArray(value).map((schedule) => ({
    id: text(schedule.id),
    schedule_type_id: text(schedule.schedule_type_id),
    schedule_type_code: text(schedule.schedule_type_code),
    name: text(schedule.name),
    note: text(schedule.note),
    name_i18n: openingJsonObject(schedule.name_i18n),
    note_i18n: openingJsonObject(schedule.note_i18n),
    extra: openingJsonObject(schedule.extra) ?? {},
    time_periods: readArray(schedule.time_periods ?? schedule.opening_time_periods).map((timePeriod) => ({
      id: text(timePeriod.id),
      closed: readBoolean(timePeriod.closed),
      note: text(timePeriod.note),
      weekdays: readArray(timePeriod.weekdays ?? timePeriod.opening_time_period_weekdays).map((day) => ({
        weekday_code: normalizeWorkspaceWeekdayCode(readString(day.weekday_code,
          readString(day.code, readString(readRecord(day.weekday).code)))),
      })),
      time_frames: readArray(timePeriod.time_frames ?? timePeriod.frames ?? timePeriod.opening_time_frames).map((frame) => ({
        id: text(frame.id),
        start_time: text(frame.start_time ?? frame.start),
        end_time: text(frame.end_time ?? frame.end),
        recurrence: text(frame.recurrence),
      })),
    })),
  }));
}

export function projectWorkspaceOpeningSchedules(schedules: ObjectWorkspaceOpeningSchedule[]): {
  weekdays: ObjectWorkspaceOpeningWeekday[];
  closedDays: string[];
  weekdayNotes: Record<string, string | null>;
  editingUnavailableReason: string | null;
} {
  const days = new Map<string, ObjectWorkspaceOpeningWeekday>();
  const closedDays = new Set<string>();
  const weekdayNotes: Record<string, string | null> = {};
  const origins = new Map<string, string>();
  let reason: string | null = schedules.length > 1
    ? 'Cette période contient plusieurs horaires. Sa structure complète est conservée ; la grille simple ne permet pas de la modifier.' : null;
  for (const schedule of schedules) {
    if (schedule.note || Object.keys(schedule.note_i18n ?? {}).length > 0) {
      reason ??= 'Cette période contient une note d’horaire non prise en charge par la grille. Ses données sont conservées.';
    }
    for (const timePeriod of schedule.time_periods) {
      if (!timePeriod.weekdays.length) {
        reason ??= 'Un créneau ne comporte aucun jour. Sa structure complète est conservée ; la grille ne permet pas de le modifier.';
      }
      if (timePeriod.time_frames.some((frame) => frame.recurrence)) {
        reason ??= 'Cette période contient une récurrence de plage non prise en charge par la grille. Ses données sont conservées.';
      }
      const slots = timePeriod.time_frames.map((frame) => ({
        start: formatOpeningTime(frame.start_time), end: formatOpeningTime(frame.end_time),
      }));
      const signature = JSON.stringify([timePeriod.closed, timePeriod.note, slots]);
      for (const { weekday_code: code } of timePeriod.weekdays) {
        if (!code) continue;
        if (origins.has(code) && origins.get(code) !== signature) {
          reason ??= 'Un même jour comporte plusieurs créneaux distincts. La grille ne permet pas de les modifier sans ambiguïté ; leurs données sont conservées.';
        }
        origins.set(code, signature);
        weekdayNotes[code] ??= timePeriod.note;
        if (timePeriod.closed) {
          closedDays.add(code);
          continue;
        }
        const day = days.get(code) ?? { code, label: humanizeWorkspaceWeekday(code), slots: [] };
        for (const slot of slots.length ? slots : [{ start: '', end: '' }]) {
          if (!day.slots.some((current) => current.start === slot.start && current.end === slot.end)) day.slots.push({ ...slot });
        }
        if (day.slots.length > 2) {
          reason ??= 'Un jour comporte plus de deux plages. La grille simple ne permet pas de modifier cette période ; ses données sont conservées.';
        }
        days.set(code, day);
      }
    }
  }
  return {
    weekdays: sortWorkspaceOpeningWeekdays(Array.from(days.values())),
    closedDays: Array.from(closedDays), weekdayNotes, editingUnavailableReason: reason,
  };
}

/**
 * Dérive le mode de récurrence + l'effet "all years" d'un enregistrement de période.
 * - cyclic : `all_years=true` AVEC dates (stockées en année-sentinelle 2000 côté backend)
 * - fixed  : `all_years=false` AVEC dates (fenêtre calendaire absolue)
 * - always : pas de dates (ouvert toute l'année, sans bornes)
 * `allYears` ressort `true` pour `always`, sinon recopie le drapeau explicite.
 */
function deriveOpeningRecurrence(
  record: GenericRecord,
  startDate: string,
  endDate: string,
): { recurrence: ObjectWorkspaceOpeningPeriod['recurrence']; allYears: boolean } {
  const allYearsExplicit = record.all_years === true || record.all_years === 'true';
  const hasDates = Boolean(startDate || endDate);
  const recurrence: ObjectWorkspaceOpeningPeriod['recurrence'] =
    allYearsExplicit && hasDates ? 'cyclic' : !allYearsExplicit && hasDates ? 'fixed' : 'always';
  return { recurrence, allYears: recurrence === 'always' ? true : allYearsExplicit };
}

function parseWorkspaceOpeningPeriodRecord(
  record: GenericRecord,
  index: number,
  bucket: ObjectWorkspaceOpeningBucket,
): ObjectWorkspaceOpeningPeriod {
  const hasSchedules = Array.isArray(record.schedules ?? record.opening_schedules ?? record.schedule_blocks);
  const schedules = hasSchedules
    ? parseWorkspaceOpeningSchedules(record.schedules ?? record.opening_schedules ?? record.schedule_blocks) : undefined;
  const projected = schedules ? projectWorkspaceOpeningSchedules(schedules) : null;
  const weekdaySlots = buildWorkspaceOpeningWeekdaysFromCanonical(record.weekday_slots);
  const fallbackWeekdays =
    weekdaySlots.length > 0
      ? weekdaySlots
      : buildWorkspaceOpeningWeekdaysFromLegacySchedules(record);

  const isClosure = readBoolean(record.is_closure);
  const startDate = readString(record.date_start, readString(record.start_date));
  const endDate = readString(record.date_end, readString(record.end_date));
  const { recurrence, allYears } = deriveOpeningRecurrence(record, startDate, endDate);

  return {
    recordId: readString(record.id) || null,
    order: readString(record.order, readString(readRecord(record.extra).workspace_order, String(index + 1))),
    bucket,
    label: readString(record.label, readString(record.name, hasSchedules ? '' : `Periode ${index + 1}`)),
    seasonTypeCode: readString(record.period_type_code),
    startDate,
    endDate,
    allYears,
    recurrence,
    isClosure,
    closedDays: projected?.closedDays ?? readStringList(record.closed_days),
    weekdays: projected?.weekdays ?? fallbackWeekdays,
    sourcePeriodId: typeof record.source_period_id === 'string' ? record.source_period_id : null,
    periodTypeId: typeof record.period_type_id === 'string' ? record.period_type_id : null,
    originalSeasonTypeCode: readString(record.period_type_code),
    ...(hasSchedules ? { originalRecurrence: recurrence, originalAllYears: readBoolean(record.all_years) } : {}),
    nameI18n: openingJsonObject(record.name_i18n),
    extra: openingJsonObject(record.extra) ?? {},
    ...(schedules ? { schedules, weekdayNotes: projected!.weekdayNotes,
      editingUnavailableReason: projected!.editingUnavailableReason } : {}),
  };
}

/** The canonical editor read contains every period, not just the public current/next-year projection. */
export function parseWorkspaceOpeningPeriodRows(rows: Record<string, unknown>[]): ObjectWorkspaceOpeningPeriod[] {
  return rows.map((row, index) => parseWorkspaceOpeningPeriodRecord(row, index,
    row.bucket === 'current' || row.bucket === 'next-year' ? row.bucket : 'undated'));
}

function parseWorkspaceOpeningPeriodsFromRaw(raw: Record<string, unknown>): ObjectWorkspaceOpeningPeriod[] {
  const openingTimes = readRecord(raw.opening_times);
  const currentPeriods = readArray(
    openingTimes.periods_current ?? openingTimes.PeriodeOuvertures ?? openingTimes.current_periods,
  ).map((record, index) => parseWorkspaceOpeningPeriodRecord(record, index, 'current'));
  const nextYearPeriods = readArray(
    openingTimes.periods_next_year ?? openingTimes.PeriodeOuverturesAnneeSuivantes ?? openingTimes.next_year_periods,
  ).map((record, index) => parseWorkspaceOpeningPeriodRecord(record, index, 'next-year'));

  if (currentPeriods.length > 0 || nextYearPeriods.length > 0) {
    return [...currentPeriods, ...nextYearPeriods];
  }

  const flattenedOpeningTimes = readArray(raw.opening_times).map((record, index) => {
    const slots = readStringList(record.slots)
      .map((slot) => parseWorkspaceOpeningSlot(slot))
      .filter((slot): slot is ObjectWorkspaceOpeningSlot => slot !== null);
    const weekdays = Array.from(new Set(readStringList(record.weekdays).map(normalizeWorkspaceWeekdayCode)))
      .filter(Boolean)
      .map((weekdayCode) => ({
        code: weekdayCode,
        label: humanizeWorkspaceWeekday(weekdayCode),
        slots,
      }));

    const isClosure = readBoolean(record.is_closure);
    const startDate = readString(record.date_start, readString(record.start_date));
    const endDate = readString(record.date_end, readString(record.end_date));
    const { recurrence, allYears } = deriveOpeningRecurrence(record, startDate, endDate);

    return {
      recordId: readString(record.id) || null,
      order: String(index + 1),
      bucket: 'undated' as const,
      label: readString(record.label, `Horaire ${index + 1}`),
      seasonTypeCode: readString(record.period_type_code),
      startDate,
      endDate,
      allYears,
      recurrence,
      isClosure,
      closedDays: readStringList(record.closed_days),
      weekdays: sortWorkspaceOpeningWeekdays(weekdays),
    };
  });

  if (flattenedOpeningTimes.length > 0) {
    return flattenedOpeningTimes;
  }

  return readArray(raw.opening_periods ?? raw.openings)
    .map((record, index) => parseWorkspaceOpeningPeriodRecord(record, index, 'undated'))
    .filter((period) => period.label || period.startDate || period.endDate || period.weekdays.length > 0);
}

function parseWorkspaceOpeningsModule(raw: Record<string, unknown>): ObjectWorkspaceOpeningsModule {
  return {
    periods: parseWorkspaceOpeningPeriodsFromRaw(raw),
    // Catalog is loaded by the openings enrichment (direct ref_code select); base = empty.
    periodTypeOptions: [],
    unavailableReason: null,
  };
}

function normalizeWorkspaceNoteCategory(
  value: string,
): ObjectWorkspaceFollowUpNote['category'] {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'important' || normalized === 'urgent' || normalized === 'internal' || normalized === 'followup') {
    return normalized;
  }

  return 'general';
}

function parseWorkspaceFollowUpNote(record: GenericRecord, index: number): ObjectWorkspaceFollowUpNote | null {
  const body = readString(record.body, readString(record.description, readString(record.text, readString(record.value)))).trim();
  if (!body) {
    return null;
  }

  const createdBy = readRecord(record.created_by);
  return {
    id: readString(record.id, `follow-up-note-${index}`),
    body,
    audience: readString(record.audience, 'private'),
    category: normalizeWorkspaceNoteCategory(readString(record.category, 'general')),
    isPinned: readBoolean(record.is_pinned),
    isArchived: readBoolean(record.is_archived),
    canEdit: readBoolean(record.can_edit),
    canDelete: readBoolean(record.can_delete),
    language: readString(record.language, readString(record.lang)),
    createdAt: readString(record.created_at),
    updatedAt: readString(record.updated_at),
    createdById: readString(createdBy.id),
    createdByName: readString(createdBy.display_name, readString(createdBy.name, readString(createdBy.email, 'Equipe'))),
    createdByAvatarUrl: readString(createdBy.avatar_url),
  };
}

function parseWorkspaceProviderFollowUpModule(raw: Record<string, unknown>): ObjectWorkspaceProviderFollowUpModule {
  const notes: ObjectWorkspaceFollowUpNote[] = [];

  for (const [index, record] of readArray(raw.private_notes).entries()) {
    const parsed = parseWorkspaceFollowUpNote(record, index);
    if (parsed) {
      notes.push(parsed);
    }
  }

  const singularPrivateNote = readRecord(raw.private_note);
  if (Object.keys(singularPrivateNote).length > 0 && !Array.isArray(raw.private_note)) {
    const parsed = parseWorkspaceFollowUpNote(singularPrivateNote, notes.length);
    if (parsed && !notes.some((note) => note.id === parsed.id)) {
      notes.push(parsed);
    }
  }

  return {
    notes: [...notes].sort((left, right) =>
      Number(right.isPinned) - Number(left.isPinned)
      || right.createdAt.localeCompare(left.createdAt, 'fr')
      || right.updatedAt.localeCompare(left.updatedAt, 'fr'),
    ),
    // CRM interactions/topics are a post-parse enrichment (api.list_object_crm — same pattern as
    // the rooms module): the parser only sets the empty default + the "not loaded" reasons,
    // which the enrichment clears on success.
    interactions: [],
    topics: [],
    interactionsUnavailableReason: "Le live actuel n'expose pas encore les interactions CRM prestataire dans le workspace objet.",
    tasksUnavailableReason: "Le live actuel n'expose pas encore les taches CRM prestataire dans le workspace objet.",
  };
}

function parseWorkspaceLinkedContact(record: GenericRecord, index: number): ObjectWorkspaceLinkedContactItem | null {
  const value = readString(record.value).trim();
  if (!value) {
    return null;
  }

  const kindRecord = readRecord(record.kind);
  const roleRecord = readRecord(record.role);

  return {
    id: readString(record.id, `linked-contact-${index}`),
    kindCode: readString(record.kind_code, readString(kindRecord.code)).toLowerCase(),
    kindLabel: readString(record.kind_name, readString(kindRecord.name, 'Contact')),
    roleCode: readString(record.role_code, readString(roleRecord.code)).toLowerCase(),
    roleLabel: readString(record.role_name, readString(roleRecord.name)),
    value,
    isPublic: readBoolean(record.is_public) !== false,
    isPrimary: readBoolean(record.is_primary),
    position: readString(record.position),
  };
}

function sortWorkspaceLinkedContacts(items: ObjectWorkspaceLinkedContactItem[]): ObjectWorkspaceLinkedContactItem[] {
  return [...items].sort((left, right) =>
    Number(right.isPrimary) - Number(left.isPrimary)
    || readPosition(left.position, Number.MAX_SAFE_INTEGER) - readPosition(right.position, Number.MAX_SAFE_INTEGER)
    || left.kindLabel.localeCompare(right.kindLabel, 'fr')
    || left.value.localeCompare(right.value, 'fr'),
  );
}

function parseWorkspaceOrganizationLink(
  record: GenericRecord,
  index: number,
  source: 'organization' | 'org_link',
): ObjectWorkspaceOrganizationLinkItem | null {
  const name = readString(record.name, `Organisation ${index + 1}`).trim();
  if (!name) {
    return null;
  }

  const roleRecord = readRecord(record.role);
  const contacts = sortWorkspaceLinkedContacts(
    readArray(record.contacts)
      .map((contact, contactIndex) => parseWorkspaceLinkedContact(contact, contactIndex))
      .filter((contact): contact is ObjectWorkspaceLinkedContactItem => contact !== null),
  );

  return {
    id: readString(record.id, `${source}-${index}`),
    source,
    type: readString(record.type),
    name,
    status: readString(record.status),
    roleId: readString(record.role_id, readString(roleRecord.id)),
    roleCode: readString(record.role_code, readString(roleRecord.code)),
    roleLabel: readString(record.role_name, readString(roleRecord.name, 'Rattachement')),
    isPrimary: readBoolean(record.is_primary),
    note: readString(record.note),
    contacts,
  };
}

function parseWorkspaceActorLink(record: GenericRecord, index: number): ObjectWorkspaceActorLinkItem | null {
  const displayName = readString(record.display_name, readString(record.name)).trim();
  if (!displayName) {
    return null;
  }

  const roleRecord = readRecord(record.role);
  const contacts = sortWorkspaceLinkedContacts(
    readArray(record.contacts)
      .map((contact, contactIndex) => parseWorkspaceLinkedContact(contact, contactIndex))
      .filter((contact): contact is ObjectWorkspaceLinkedContactItem => contact !== null),
  );

  return {
    id: readString(record.id, `actor-${index}`),
    displayName,
    firstName: readString(record.first_name),
    lastName: readString(record.last_name),
    gender: readString(record.gender),
    roleId: readString(record.role_id, readString(roleRecord.id)),
    roleCode: readString(record.role_code, readString(roleRecord.code)),
    roleLabel: readString(record.role_name, readString(roleRecord.name, 'Role')),
    visibility: readString(record.visibility, 'public'),
    isPrimary: readBoolean(record.is_primary),
    validFrom: readString(record.valid_from),
    validTo: readString(record.valid_to),
    note: readString(record.note),
    contacts,
    contactsRestricted: readBoolean(record.contacts_restricted),
  };
}

function parseWorkspaceRelatedObject(
  record: GenericRecord,
  index: number,
  direction: ObjectWorkspaceRelatedObjectItem['direction'],
): ObjectWorkspaceRelatedObjectItem | null {
  const targetRecord =
    direction === 'in'
      ? readRecord(record.source ?? record.object ?? record.related_object)
      : readRecord(record.target ?? record.object ?? record.related_object);
  const relationTypeRecord = readRecord(record.relation_type);
  const name = readString(targetRecord.name, readString(record.name, readString(readRecord(record.basic_info).name))).trim();

  if (!name) {
    return null;
  }

  const relationTypeLabel = readString(
    relationTypeRecord.name,
    readString(record.relation_type_name, readString(record.link_type, direction === 'in' ? 'Entrant' : direction === 'out' ? 'Sortant' : 'Associe')),
  );

  return {
    id: readString(targetRecord.id, readString(record.id, `${direction}-${index}`)),
    name,
    type: readString(targetRecord.type, readString(record.type)),
    status: readString(targetRecord.status, readString(record.status)),
    relationTypeId: readString(record.relation_type_id, readString(relationTypeRecord.id)),
    relationTypeCode: readString(record.relation_type_code, readString(relationTypeRecord.code, relationTypeLabel)),
    relationTypeLabel,
    direction,
    note: readString(record.note),
    distanceM: readString(record.distance_m),
  };
}

/** Motif affiché quand le serveur A dit que les notes prestataire sont réservées à l'ORG éditrice. */
export const ACTOR_NOTE_RESTRICTED_REASON =
  "Réservé aux membres de l'organisation éditrice — non modifiable ici.";
/**
 * Motif affiché quand le payload ne porte AUCUN verdict (fiche sans aucun lien acteur) : le
 * serveur n'émet `contacts_restricted` que SUR les lignes, donc un tableau vide ne dit rien.
 */
export const ACTOR_NOTE_UNKNOWN_REASON =
  "Le serveur n'a pas encore indiqué si les notes de prestataire de cette fiche vous sont accessibles — "
  + "la note sera modifiable après enregistrement du rattachement.";

/**
 * §208 — verdict PAR FICHE (et par appelant) sur l'écriture de `actor_object_role.note`.
 *
 * Toutes les lignes reçues portent la MÊME valeur (un seul `api.can_read_actor_contacts` par
 * appel de `get_object_resource`) : on la résout ici, une fois, plutôt que de l'échantillonner
 * sur une ligne — un lien qu'on vient d'ajouter n'en a aucune à échantillonner.
 *
 * Fiche SANS aucun lien acteur ⇒ le payload ne porte aucun signal : FAIL-CLOSED, avec un motif
 * qui dit « inconnu », jamais « refusé ». Écrire la note quand même serait le write-trap que
 * §208/T13b a fermé côté serveur (la note d'un appelant restreint est REPORTÉE, donc NULL pour
 * un lien neuf) ; afficher le motif « réservé » à un éditeur légitime serait un mensonge.
 */
export function deriveActorNoteWriteUnavailableReason(
  actors: readonly ObjectWorkspaceActorLinkItem[],
): string | null {
  if (actors.length === 0) {
    return ACTOR_NOTE_UNKNOWN_REASON;
  }
  return actors.some((actor) => actor.contactsRestricted) ? ACTOR_NOTE_RESTRICTED_REASON : null;
}

function parseWorkspaceRelationshipsModule(raw: Record<string, unknown>): ObjectWorkspaceRelationshipsModule {
  const organizationLinks = [
    ...readArray(raw.organizations).map((record, index) => parseWorkspaceOrganizationLink(record, index, 'organization')),
    ...readArray(raw.org_links).map((record, index) => parseWorkspaceOrganizationLink(record, index, 'org_link')),
  ].filter((item): item is ObjectWorkspaceOrganizationLinkItem => item !== null);

  const dedupedOrganizationLinks = Array.from(
    new Map(
      organizationLinks.map((item) => [
        `${item.source}:${item.id}:${item.roleCode.toLowerCase()}:${item.name.toLowerCase()}`,
        item,
      ]),
    ).values(),
  ).sort((left, right) =>
    left.name.localeCompare(right.name, 'fr')
    || left.roleLabel.localeCompare(right.roleLabel, 'fr')
    || left.source.localeCompare(right.source, 'fr'),
  );

  const actors = readArray(raw.actors)
    .map((record, index) => parseWorkspaceActorLink(record, index))
    .filter((item): item is ObjectWorkspaceActorLinkItem => item !== null)
    .sort((left, right) =>
      Number(right.isPrimary) - Number(left.isPrimary)
      || left.displayName.localeCompare(right.displayName, 'fr')
      || left.roleLabel.localeCompare(right.roleLabel, 'fr'),
    );

  const relatedObjects = [
    ...readArray(raw.parent_objects).map((record, index) => parseWorkspaceRelatedObject(record, index, 'associated')),
    ...readArray(raw.outgoing_relations).map((record, index) => parseWorkspaceRelatedObject(record, index, 'out')),
    ...readArray(raw.incoming_relations).map((record, index) => parseWorkspaceRelatedObject(record, index, 'in')),
  ].filter((item): item is ObjectWorkspaceRelatedObjectItem => item !== null);

  const dedupedRelatedObjects = Array.from(
    new Map(
      relatedObjects.map((item) => [
        `${item.id}:${item.direction}:${item.relationTypeId || item.relationTypeCode || item.relationTypeLabel}`,
        item,
      ]),
    ).values(),
  ).sort((left, right) =>
    left.name.localeCompare(right.name, 'fr')
    || left.direction.localeCompare(right.direction, 'fr')
    || left.relationTypeLabel.localeCompare(right.relationTypeLabel, 'fr'),
  );

  return {
    organizationLinks: dedupedOrganizationLinks,
    actors,
    relatedObjects: dedupedRelatedObjects,
    orgRoleOptions: [],
    orgOptions: [],
    actorRoleOptions: [],
    organizationLinkWriteUnavailableReason: null,
    actorWriteUnavailableReason: null,
    actorConsentUnavailableReason: null,
    relatedObjectWriteUnavailableReason: null,
    actorNoteWriteUnavailableReason: deriveActorNoteWriteUnavailableReason(actors),
  };
}

function deriveMembershipVisibilityImpact(status: string): string {
  switch (status.trim().toLowerCase()) {
    case 'paid':
      return 'Visibilite active';
    case 'invoiced':
      return 'Activation conditionnee au paiement';
    case 'lapsed':
      return 'Visibilite commerciale lapsed';
    case 'canceled':
      return 'Aucun impact commercial actif';
    default:
      return 'Suivi commercial interne';
  }
}

function parseWorkspaceMembershipItem(record: GenericRecord, _index: number, detail: ObjectDetail): ObjectWorkspaceMembershipItem {
  const campaignRecord = readRecord(record.campaign);
  const tierRecord = readRecord(record.tier);
  const orgObjectId = readString(record.org_object_id);
  const objectId = readString(record.object_id);
  const scope = objectId ? 'object' as const : 'organization' as const;

  return {
    recordId: readString(record.id) || null,
    scope,
    orgObjectId,
    orgLabel: readString(record.org_label, orgObjectId === detail.id ? detail.name : 'Organisation'),
    campaignId: readString(record.campaign_id, readString(campaignRecord.id)),
    campaignCode: readString(record.campaign_code, readString(campaignRecord.code)),
    campaignLabel: readString(record.campaign_name, readString(campaignRecord.name, 'Adhesion')),
    tierId: readString(record.tier_id, readString(tierRecord.id)),
    tierCode: readString(record.tier_code, readString(tierRecord.code)),
    tierLabel: readString(record.tier_name, readString(tierRecord.name, 'Standard')),
    status: readString(record.status, 'prospect'),
    startsAt: readString(record.starts_at),
    endsAt: readString(record.ends_at),
    paymentDate: readString(record.payment_date),
    metadataJson: stringifyWorkspaceJsonValue(record.metadata),
    visibilityImpact: readString(record.visibility_impact, deriveMembershipVisibilityImpact(readString(record.status, 'prospect'))),
  };
}

function parseWorkspaceMembershipModule(raw: Record<string, unknown>, detail: ObjectDetail): ObjectWorkspaceMembershipModule {
  const rawMemberships = [
    ...readArray(raw.memberships),
    ...readArray(raw.object_memberships),
  ];
  const currentMembership = readRecord(raw.current_membership);
  const combinedMemberships = rawMemberships.length > 0
    ? rawMemberships
    : Object.keys(currentMembership).length > 0
      ? [currentMembership]
      : [];
  const items = combinedMemberships.map((record, index) => parseWorkspaceMembershipItem(record, index, detail));
  const scopeOptions = Array.from(
    new Map(
      items
        .filter((item) => item.orgObjectId)
        .map((item) => [item.orgObjectId, {
          orgObjectId: item.orgObjectId,
          label: item.orgLabel || 'Organisation',
          isPrimary: false,
        } satisfies ObjectWorkspaceMembershipScopeOption]),
    ).values(),
  ).sort((left, right) => left.label.localeCompare(right.label, 'fr'));

  return {
    campaignOptions: dedupeReferenceOptions(
      items.map((item) => ({
        id: item.campaignId || item.campaignCode,
        code: item.campaignCode,
        label: item.campaignLabel,
      })),
    ),
    tierOptions: dedupeReferenceOptions(
      items.map((item) => ({
        id: item.tierId || item.tierCode,
        code: item.tierCode,
        label: item.tierLabel,
      })),
    ),
    scopeOptions,
    items,
    unavailableReason: null,
  };
}

function stringifyWorkspaceJsonValue(value: unknown): string {
  if (value == null) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value) || isRecord(value)) {
    return JSON.stringify(value, null, 2);
  }

  return '';
}

function parseWorkspaceLegalRecord(record: GenericRecord, index: number): ObjectWorkspaceLegalRecord {
  const typeRecord = readRecord(record.type);
  const typeCode = readString(typeRecord.code, readString(record.type_code, `legal-${index + 1}`));
  const typeLabel = readString(typeRecord.name, readString(record.label, typeCode || `Document ${index + 1}`));

  return {
    recordId: readString(record.id) || null,
    typeId: readString(typeRecord.id),
    typeCode,
    typeLabel,
    category: readString(typeRecord.category),
    isPublic: readBoolean(typeRecord.is_public),
    isRequired: readBoolean(typeRecord.is_required),
    valueJson: stringifyWorkspaceJsonValue(record.value),
    documentId: readString(record.document_id),
    documentUrl: readString(readRecord(record.document).url, readString(record.document_url)),
    documentTitle: readString(readRecord(record.document).title, readString(record.document_title)),
    validFrom: readString(record.valid_from),
    validTo: readString(record.valid_to),
    validityMode: readString(record.validity_mode),
    status: readString(record.status, 'active'),
    documentRequestedAt: readString(record.document_requested_at),
    documentDeliveredAt: readString(record.document_delivered_at, readString(record.delivered_at)),
    note: readString(record.note),
    daysUntilExpiry: readString(record.days_until_expiry),
  };
}

function buildWorkspaceLegalBaseCompliance(records: ObjectWorkspaceLegalRecord[]): ObjectWorkspaceLegalComplianceSummary {
  const expiringCount = records.filter((record) => {
    const days = Number.parseInt(record.daysUntilExpiry, 10);
    return Number.isFinite(days) && days >= 0 && days <= 30;
  }).length;
  const validCount = records.filter((record) => record.status === 'active').length;
  const complianceStatus =
    records.length === 0 ? 'unknown' : expiringCount > 0 ? 'expiring' : 'compliant';

  return {
    complianceStatus,
    requiredCount: 0,
    validCount,
    expiringCount,
    missingCount: 0,
    compliancePercentage: 0,
    details: [],
  };
}

function parseWorkspaceLegalModule(raw: Record<string, unknown>): ObjectWorkspaceLegalModule {
  const records = readArray(raw.legal_records).map(parseWorkspaceLegalRecord);
  const typeOptions = dedupeReferenceOptions(
    records
      .filter((record) => record.typeCode && record.typeLabel)
      .map((record) => ({
        id: record.typeId || record.typeCode,
        code: record.typeCode,
        label: record.typeLabel,
      })),
  ).map((option) => {
    const source = records.find((record) => record.typeCode === option.code);
    return {
      id: source?.typeId || option.id,
      code: option.code,
      label: option.label,
      // Ce chemin dégradé reconstruit les types DEPUIS les lignes déjà saisies : une ligne ne porte
      // pas la description du catalogue, l'aide « quand demander » reste donc vide ici.
      description: '',
      category: source?.category ?? '',
      isPublic: source?.isPublic ?? false,
      isRequired: source?.isRequired ?? false,
    };
  });

  return {
    typeOptions,
    records,
    compliance: buildWorkspaceLegalBaseCompliance(records),
    unavailableReason: null,
  };
}

function dedupeReferenceOptions(options: WorkspaceReferenceOption[]): WorkspaceReferenceOption[] {
  const seen = new Set<string>();
  const normalized: WorkspaceReferenceOption[] = [];

  for (const option of options) {
    const key = option.code.toLowerCase();
    if (!option.code || !option.label || seen.has(key)) {
      continue;
    }
    seen.add(key);
    normalized.push(option);
  }

  return normalized.sort((left, right) => left.label.localeCompare(right.label, 'fr'));
}

const HEX_COLOR_RE = /^#[0-9a-f]{6}$/;

/** Neutral slate — the default tag color when none is set (mirrors api.create_tag). */
export const DEFAULT_TAG_COLOR = '#64748b';

/**
 * Normalize a tag's display color to a lowercase hex #rrggbb. ref_tag.color stores hex
 * (a designed palette; the old named-variant set was UI-fallback fiction). Color is GLOBAL
 * per tag — no per-object override. Anything invalid falls back to the neutral slate default.
 * Exported so object-workspace.ts can re-export it for tests and callers.
 */
export function normalizeTagColor(value: unknown, fallback: string = DEFAULT_TAG_COLOR): string {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return HEX_COLOR_RE.test(normalized) ? normalized : fallback;
}

/** Strip non-digits from INSEE identifiers. */
export function normalizeInseeDigits(value: string): string {
  return value.replace(/\D/g, '');
}

export function readLegalRecordScalarValue(record: ObjectWorkspaceLegalRecord): string {
  const raw = record.valueJson.trim();
  if (!raw) {
    return '';
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed === 'string' || typeof parsed === 'number') {
      return String(parsed).trim();
    }
    if (parsed && typeof parsed === 'object') {
      const map = parsed as Record<string, unknown>;
      const typeCode = record.typeCode?.toLowerCase() ?? '';
      const typedKey =
        typeCode && map[typeCode] != null ? readString(map[typeCode]) : '';
      return readString(
        typedKey || map.siret || map.siren || map.value || map.label || map.name,
      ).trim();
    }
  } catch {
    return raw;
  }

  return raw;
}

/**
 * Establishment SIRET (14 digits) from object_legal type `siret` only.
 * Legacy `siren` rows: use only when they hold a full 14-digit value (mis-typed SIRET).
 * Nine-digit SIREN alone does not populate the SIRET UI field.
 */
export function findEstablishmentSiretFromLegalRecords(
  records: ObjectWorkspaceLegalRecord[],
): string {
  const siretRow = records.find((item) => item.typeCode === 'siret');
  if (siretRow) {
    const digits = normalizeInseeDigits(readLegalRecordScalarValue(siretRow));
    if (digits.length === 14) {
      return digits;
    }
  }

  const sirenRow = records.find((item) => item.typeCode === 'siren');
  if (sirenRow) {
    const digits = normalizeInseeDigits(readLegalRecordScalarValue(sirenRow));
    if (digits.length === 14) {
      return digits;
    }
  }

  return '';
}

function findLegalRecordValue(records: ObjectWorkspaceLegalRecord[], patterns: string[]): string {
  const record = records.find((item) => {
    const haystack = `${item.typeCode} ${item.typeLabel}`.toLowerCase();
    return patterns.some((pattern) => haystack.includes(pattern));
  });
  return record ? readLegalRecordScalarValue(record) : '';
}

/**
 * Raison sociale from object_legal / ref_legal_type only (canonical type code `raison_sociale`).
 * Must not fall back to ACTOR.display_name — that is a person, not the legal entity name.
 */
export function findRaisonSocialeFromLegalRecords(records: ObjectWorkspaceLegalRecord[]): string {
  const typed = records.find((item) => item.typeCode === 'raison_sociale');
  if (typed) {
    return readLegalRecordScalarValue(typed);
  }
  return findLegalRecordValue(records, [
    'raison sociale',
    'raison_sociale',
    'denomination',
    'company name',
    'company_name',
  ]);
}

function pickOperatorActorRecord(raw: Record<string, unknown>): GenericRecord | null {
  const actors = readArray(raw.actors);
  const operator = actors.find((record) => readString(readRecord(record.role).code) === 'operator');
  if (operator) {
    return operator;
  }

  const primary = actors.find((record) => readBoolean(record.is_primary));
  return primary ?? actors[0] ?? null;
}

function isDistributionBookingKind(kindCode: string): boolean {
  const normalized = kindCode.trim().toLowerCase();
  return [
    'booking',
    'booking_engine',
    'airbnb',
    'abritel',
    'leboncoin',
    'vrbo',
    'expedia',
    'distribution_channel',
  ].some((token) => normalized === token || normalized.includes(token));
}

function isDistributionSocialKind(kindCode: string): boolean {
  const normalized = kindCode.trim().toLowerCase();
  return ['facebook', 'instagram', 'tripadvisor', 'tiktok', 'twitter', 'youtube', 'linkedin', 'social']
    .some((token) => normalized === token || normalized.includes(token));
}

function channelLogoCode(kindCode: string, kindName: string): string {
  const source = kindCode.trim() || kindName.trim();
  if (!source) {
    return '??';
  }
  const parts = source.split(/[^a-z0-9]+/i).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

function parseWorkspaceTagsModule(raw: Record<string, unknown>): ObjectWorkspaceTagsModule {
  const displayed = readArray(raw.tags).map((record) => {
    const slug = readString(record.slug);
    const label = readString(record.name, slug);
    return {
      tagId: readString(record.id, readString(record.tag_id)),
      slug,
      label,
      // Color is GLOBAL per tag (ref_tag.color, hex). No per-object override.
      color: normalizeTagColor(record.color),
    };
  }).filter((item) => item.slug || item.label);

  return {
    displayed,
    library: [],
  };
}

function parseWorkspaceSustainabilityModule(raw: Record<string, unknown>): ObjectWorkspaceSustainabilityModule {
  const categories = new Map<string, ObjectWorkspaceSustainabilityCategory>();
  const equivalentLabels = new Map<string, ObjectWorkspaceSustainabilityLabel>();

  for (const row of readArray(raw.sustainability_actions)) {
    const actionRecord = readRecord(row.action);
    const categoryRecord = readRecord(actionRecord.category);
    const categoryCode = readString(categoryRecord.code, 'uncategorized');
    const categoryId = readString(categoryRecord.id, categoryCode);
    const actionCode = readString(actionRecord.code);
    const actionId = readString(actionRecord.id, actionCode);

    if (!categories.has(categoryId)) {
      categories.set(categoryId, {
        id: categoryId,
        code: categoryCode,
        label: readString(categoryRecord.name, categoryCode),
        description: readString(categoryRecord.description),
        actions: [],
      });
    }

    categories.get(categoryId)?.actions.push({
      id: actionId,
      code: actionCode,
      label: readString(actionRecord.label, actionCode),
      description: readString(actionRecord.description),
      selected: true,
      note: readString(row.note),
      documentId: readString(row.document_id),
    });

    for (const labelRow of readArray(row.associated_labels)) {
      const labelRecord = readRecord(labelRow);
      const valueRecord = readRecord(labelRecord.label ?? labelRow);
      const code = readString(valueRecord.value_code, readString(labelRecord.value_code));
      const label = readString(valueRecord.value_name, readString(labelRecord.value_name, code));
      if (code || label) {
        equivalentLabels.set(`${code}:${label}`, { code, label });
      }
    }
  }

  return {
    categories: Array.from(categories.values()).sort((left, right) => left.label.localeCompare(right.label, 'fr')),
    equivalentLabels: Array.from(equivalentLabels.values()).sort((left, right) => left.label.localeCompare(right.label, 'fr')),
  };
}

function parseWorkspaceDistributionModule(raw: Record<string, unknown>): ObjectWorkspaceDistributionModule {
  const operator = pickOperatorActorRecord(raw);
  const channels: ObjectWorkspaceDistributionChannel[] = [];

  if (operator) {
    readArray(operator.contacts).forEach((contact, index) => {
      const kindRecord = readRecord(contact.kind);
      const kindCode = readString(kindRecord.code);
      const kindName = readString(kindRecord.name, kindCode);
      const group = isDistributionSocialKind(kindCode)
        ? 'social'
        : isDistributionBookingKind(kindCode)
          ? 'booking'
          : null;

      if (!group) {
        return;
      }

      const url = readString(contact.value).trim();
      const extra = readRecord(contact.extra);
      channels.push({
        id: readString(contact.id, `channel-${index}`),
        code: channelLogoCode(kindCode, kindName),
        name: kindName || kindCode,
        url: url || '—',
        syncStatus: readString(extra.sync_status, url ? 'Connecté' : 'Non connecté'),
        syncTone: url ? 'ok' : 'warn',
        group,
      });
    });
  }

  return {
    channels,
    readonlyReason:
      "Les canaux sont projetés depuis l'acteur opérateur — le contrat d'écriture actor_channel est différé.",
  };
}

function parseWorkspaceProviderModule(
  raw: Record<string, unknown>,
  legal: ObjectWorkspaceLegalModule,
): ObjectWorkspaceProviderModule {
  const operator = pickOperatorActorRecord(raw);
  const records = legal.records;
  const siret = findEstablishmentSiretFromLegalRecords(records);
  const companyName = findRaisonSocialeFromLegalRecords(records);

  const emailContact = operator
    ? readArray(operator.contacts).find((contact) => readString(readRecord(contact.kind).code).includes('email'))
    : null;
  const phoneContact = operator
    ? readArray(operator.contacts).find((contact) => {
        const kindCode = readString(readRecord(contact.kind).code).toLowerCase();
        return kindCode.includes('phone') || kindCode.includes('mobile') || kindCode.includes('tel');
      })
    : null;

  return {
    siret,
    companyName,
    sireneVerified: Boolean(siret),
    legalForm: findLegalRecordValue(records, ['forme', 'juridique', 'legal form']),
    nafCode: findLegalRecordValue(records, ['naf', 'ape']),
    consularChamber: findLegalRecordValue(records, ['chambre', 'consulaire', 'cci', 'cma']),
    cfeOrganization: findLegalRecordValue(records, ['cfe']),
    directorFullName: operator ? readString(operator.display_name) : findLegalRecordValue(records, ['dirigeant']),
    directorEmail: emailContact ? readString(emailContact.value) : findLegalRecordValue(records, ['email']),
    directorPhone: phoneContact ? readString(phoneContact.value) : findLegalRecordValue(records, ['phone', 'telephone']),
    address: findLegalRecordValue(records, ['adresse', 'address', 'siege']),
    incorporationDate: findLegalRecordValue(records, ['creation', 'immatriculation']),
    readonlyReason:
      "Compléments éditables via les modules Légal et Acteurs — branchement direct différé.",
  };
}

export function parseObjectWorkspace(detail: ObjectDetail, langPrefs: string[]): ObjectWorkspaceModules {
  const raw = (detail.raw ?? {}) as Record<string, unknown>;
  const nameTranslations = readTextMap(raw.name_i18n);
  const mainLocation = parseMainLocation(raw);
  const placesModule = parseWorkspacePlacesModule(raw);
  const canonicalRecord = readRecord(raw.canonical_description);
  const objectDescription = parseDescriptionScope({
    record: Object.keys(canonicalRecord).length > 0 ? canonicalRecord : pickDescriptionSource(raw),
    scope: 'object',
    label: 'Objet principal',
  });
  const orgRecord = readRecord(raw.org_description);
  const orgOverlay = Object.keys(orgRecord).length > 0
    ? parseDescriptionScope({ record: orgRecord, scope: 'object', label: 'Mon organisation' })
    : null;
  const placeDescriptions: ObjectWorkspaceDescriptionScope[] = [];
  const objectMedia = readArray(raw.media).map((item, index) =>
    parseWorkspaceMediaItem({
      record: item,
      index,
      scope: 'object',
      scopeLabel: 'Objet principal',
    }),
  );
  const objectContacts = readArray(raw.contacts)
    .map((item, index) => parseWorkspaceContactItem(item, index))
    .filter((item): item is ObjectWorkspaceContactItem => item !== null);
  const objectWebChannels = readArray(raw.web_channels)
    .map((item, index) => parseWorkspaceWebChannelItem(item, index))
    .filter((item): item is ObjectWorkspaceWebChannelItem => item !== null);
  const relatedActorContactsCount = readArray(raw.actors).reduce((count, actor) => count + readArray(actor.contacts).length, 0);
  const relatedOrganizationContactsCount = [
    ...readArray(raw.organizations),
    ...readArray(raw.org_links),
    ...readArray(raw.parent_objects),
  ].reduce((count, organization) => count + readArray(organization.contacts).length, 0);
  const legal = parseWorkspaceLegalModule(raw);
  const availableLanguages = collectLanguages({
    langPrefs,
    nameTranslations,
    objectScope: objectDescription,
    orgScope: orgOverlay,
    placeScopes: placeDescriptions,
  });
  const localLanguage = langPrefs[0] ?? availableLanguages[0] ?? 'fr';

  return {
    generalInfo: {
      name: readString(raw.name, detail.name),
      nameTranslations,
      businessTimezone: readString(raw.business_timezone, 'Indian/Reunion'),
      commercialVisibility: readString(raw.commercial_visibility, 'active'),
      regionCode: readString(raw.region_code),
      status: readString(raw.status, 'draft'),
      publishedAt: readString(raw.published_at),
      isEditing: readBoolean(raw.is_editing),
      secondaryTypes: readStringList(raw.secondary_types),
    },
    taxonomy: parseWorkspaceTaxonomyModule(raw),
    distinctions: parseWorkspaceDistinctionsModule(raw),
    publication: {
      status: readString(raw.status, 'draft'),
      publishedAt: readString(raw.published_at),
      isEditing: readBoolean(raw.is_editing),
      moderation: {
        availability: 'unavailable',
        pendingCount: 0,
        unavailableReason: null,
        items: [],
      },
      printPublications: {
        availability: 'unavailable',
        selectionCount: 0,
        unavailableReason: null,
        items: [],
      },
    },
    syncIdentifiers: parseWorkspaceSyncIdentifiersModule(raw),
    location: {
      main: mainLocation,
      places: [],
      zoneCodes: [
        ...readArray(raw.object_zones),
        ...readArray(raw.object_zone),
      ].map((zone) => readString(zone.insee_commune)).filter(Boolean),
      zoneOptions: [],
      zonesUnavailableReason: null,
    },
    places: placesModule,
    descriptions: {
      localLanguage,
      activeLanguage: localLanguage,
      availableLanguages,
      object: objectDescription,
      orgOverlay,
      places: placeDescriptions,
    },
    media: {
      typeOptions: [],
      tagOptions: [],
      objectItems: objectMedia,
      placeItems: [],
      placeScopeUnavailableReason: null,
      unavailableReason: null,
    },
    contacts: {
      kindOptions: [],
      roleOptions: [],
      objectItems: objectContacts,
      webItems: objectWebChannels,
      webKindOptions: [],
      relatedActorContactsCount,
      relatedOrganizationContactsCount,
    },
    characteristics: parseWorkspaceCharacteristicsModule(raw),
    capacityPolicies: parseWorkspaceCapacityPoliciesModule(raw),
    pricing: parseWorkspacePricingModule(raw),
    rooms: parseWorkspaceRoomsModule(raw),
    meetingRooms: parseWorkspaceMeetingRoomsModule(raw),
    menus: parseWorkspaceMenusModule(raw),
    cuisine: parseWorkspaceCuisineModule(raw),
    activity: parseWorkspaceActivityModule(raw),
    event: parseWorkspaceEventModule(raw),
    itinerary: parseWorkspaceItineraryModule(raw),
    openings: parseWorkspaceOpeningsModule(raw),
    providerFollowUp: parseWorkspaceProviderFollowUpModule(raw),
    relationships: parseWorkspaceRelationshipsModule(raw),
    memberships: parseWorkspaceMembershipModule(raw, detail),
    legal,
    tags: parseWorkspaceTagsModule(raw),
    sustainability: parseWorkspaceSustainabilityModule(raw),
    distribution: parseWorkspaceDistributionModule(raw),
    provider: parseWorkspaceProviderModule(raw, legal),
  };
}
