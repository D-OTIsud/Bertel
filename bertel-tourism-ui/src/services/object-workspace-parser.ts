import type { ObjectDetail } from '../types/domain';

interface GenericRecord {
  [key: string]: unknown;
}

export type WorkspaceModuleId = 'general-info' | 'taxonomy' | 'publication' | 'sync-identifiers' | 'location' | 'descriptions' | 'media' | 'contacts' | 'characteristics' | 'distinctions' | 'capacity-policies' | 'pricing' | 'openings' | 'provider-follow-up' | 'relationships' | 'memberships' | 'legal';

export interface WorkspaceTranslatableField {
  baseValue: string;
  values: Record<string, string>;
}

export interface ObjectWorkspaceGeneralInfo {
  name: string;
  nameTranslations: Record<string, string>;
  businessTimezone: string;
  commercialVisibility: string;
  regionCode: string;
  status: string;
  publishedAt: string;
  isEditing: boolean;
}

export interface ObjectWorkspaceTaxonomyItem {
  recordId: string | null;
  schemeId: string;
  schemeCode: string;
  schemeLabel: string;
  valueId: string;
  valueCode: string;
  valueLabel: string;
  status: string;
  awardedAt: string;
  validUntil: string;
}

export interface ObjectWorkspaceTaxonomyScheme {
  id: string;
  code: string;
  label: string;
  description: string;
  selectionMode: 'single' | 'multiple';
  displayGroup: string;
  valueOptions: WorkspaceReferenceOption[];
  items: ObjectWorkspaceTaxonomyItem[];
}

export interface ObjectWorkspaceTaxonomyModule {
  schemes: ObjectWorkspaceTaxonomyScheme[];
  unavailableReason: string | null;
}

export interface ObjectWorkspaceLocationForm {
  recordId: string | null;
  address1: string;
  address1Suite: string;
  address2: string;
  address3: string;
  postcode: string;
  city: string;
  codeInsee: string;
  lieuDit: string;
  direction: string;
  latitude: string;
  longitude: string;
  zoneTouristique: string;
}

export interface ObjectWorkspacePlaceSummary {
  id: string;
  label: string;
  isPrimary: boolean;
  position: number;
  locationLabel: string;
}

export interface ObjectWorkspaceLocationModule {
  main: ObjectWorkspaceLocationForm;
  places: ObjectWorkspacePlaceSummary[];
  zoneCodes: string[];
}

export interface ObjectWorkspaceDescriptionScope {
  recordId: string | null;
  scope: 'object' | 'place';
  placeId: string | null;
  label: string;
  visibility: string;
  description: WorkspaceTranslatableField;
  chapo: WorkspaceTranslatableField;
  adaptedDescription: WorkspaceTranslatableField;
  mobileDescription: WorkspaceTranslatableField;
  editorialDescription: WorkspaceTranslatableField;
}

export interface ObjectWorkspaceDescriptionsModule {
  localLanguage: string;
  activeLanguage: string;
  availableLanguages: string[];
  object: ObjectWorkspaceDescriptionScope;
  places: ObjectWorkspaceDescriptionScope[];
}

export type ObjectWorkspaceModuleAvailability = 'available' | 'unavailable';

export interface ObjectWorkspaceModerationItem {
  id: string;
  targetTable: string;
  action: string;
  status: string;
  submittedAt: string;
  reviewedAt: string;
  appliedAt: string;
  reviewNote: string;
  summary: string;
}

export interface ObjectWorkspacePublicationSelectionItem {
  publicationId: string;
  publicationCode: string;
  publicationName: string;
  publicationYear: string;
  publicationStatus: string;
  workflowStatus: string;
  pageNumber: string;
  customPrintText: string;
  proofSentAt: string;
  validatedAt: string;
}

export interface ObjectWorkspacePublicationModule {
  status: string;
  publishedAt: string;
  isEditing: boolean;
  moderation: {
    availability: ObjectWorkspaceModuleAvailability;
    pendingCount: number;
    unavailableReason: string | null;
    items: ObjectWorkspaceModerationItem[];
  };
  printPublications: {
    availability: ObjectWorkspaceModuleAvailability;
    selectionCount: number;
    unavailableReason: string | null;
    items: ObjectWorkspacePublicationSelectionItem[];
  };
}

export interface ObjectWorkspaceExternalIdentifierItem {
  id: string;
  organizationObjectId: string;
  sourceSystem: string;
  externalId: string;
  lastSyncedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ObjectWorkspaceOriginItem {
  sourceSystem: string;
  sourceObjectId: string;
  importBatchId: string;
  firstImportedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ObjectWorkspaceSyncIdentifiersModule {
  objectCreatedAt: string;
  objectUpdatedAt: string;
  objectUpdatedAtSource: string;
  externalIdentifiers: ObjectWorkspaceExternalIdentifierItem[];
  origins: ObjectWorkspaceOriginItem[];
  externalIdentifiersVisibilityNote: string | null;
  originsVisibilityNote: string | null;
}

export interface WorkspaceReferenceOption {
  id: string;
  code: string;
  label: string;
}

export interface ObjectWorkspaceAmenityGroup {
  familyCode: string;
  familyLabel: string;
  options: WorkspaceReferenceOption[];
}

export interface ObjectWorkspaceLanguageItem {
  languageId: string;
  code: string;
  label: string;
  levelId: string;
  levelCode: string;
  levelLabel: string;
}

export interface ObjectWorkspaceCharacteristicsModule {
  languageOptions: WorkspaceReferenceOption[];
  languageLevelOptions: WorkspaceReferenceOption[];
  selectedLanguages: ObjectWorkspaceLanguageItem[];
  paymentOptions: WorkspaceReferenceOption[];
  selectedPaymentCodes: string[];
  environmentOptions: WorkspaceReferenceOption[];
  selectedEnvironmentCodes: string[];
  amenityGroups: ObjectWorkspaceAmenityGroup[];
  selectedAmenityCodes: string[];
  unavailableReason: string | null;
}

export interface ObjectWorkspaceCapacityItem {
  recordId: string | null;
  metricId: string;
  metricCode: string;
  metricLabel: string;
  unit: string;
  value: string;
  effectiveFrom: string;
  effectiveTo: string;
}

export interface ObjectWorkspaceGroupPolicyForm {
  minSize: string;
  maxSize: string;
  groupOnly: boolean;
  notes: string;
}

export interface ObjectWorkspacePetPolicyForm {
  hasPolicy: boolean;
  accepted: boolean;
  conditions: string;
}

export interface ObjectWorkspaceCapacityPoliciesModule {
  metricOptions: WorkspaceReferenceOption[];
  capacityItems: ObjectWorkspaceCapacityItem[];
  groupPolicy: ObjectWorkspaceGroupPolicyForm;
  petPolicy: ObjectWorkspacePetPolicyForm;
  unavailableReason: string | null;
}

export interface ObjectWorkspaceDistinctionItem {
  recordId: string | null;
  schemeId: string;
  schemeCode: string;
  schemeLabel: string;
  valueId: string;
  valueCode: string;
  valueLabel: string;
  status: string;
  awardedAt: string;
  validUntil: string;
  disabilityTypesCovered: string[];
}

export interface ObjectWorkspaceDistinctionGroup {
  schemeCode: string;
  schemeLabel: string;
  items: ObjectWorkspaceDistinctionItem[];
}

export interface ObjectWorkspaceAccessibilityAmenityItem {
  code: string;
  label: string;
  disabilityTypes: string[];
}

export interface ObjectWorkspaceDistinctionSchemeOption {
  id: string;
  code: string;
  label: string;
  selectionMode: 'single' | 'multiple';
  isAccessibility: boolean;
  valueOptions: WorkspaceReferenceOption[];
}

export interface ObjectWorkspaceDistinctionsModule {
  distinctionGroups: ObjectWorkspaceDistinctionGroup[];
  accessibilityLabels: ObjectWorkspaceDistinctionItem[];
  accessibilityAmenityCoverage: ObjectWorkspaceAccessibilityAmenityItem[];
  schemeOptions: ObjectWorkspaceDistinctionSchemeOption[];
  unavailableReason: string | null;
}

export interface ObjectWorkspacePricePeriod {
  recordId: string | null;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  note: string;
}

export interface ObjectWorkspacePriceItem {
  recordId: string | null;
  kindId: string;
  kindCode: string;
  kindLabel: string;
  unitId: string;
  unitCode: string;
  unitLabel: string;
  amount: string;
  amountMax: string;
  currency: string;
  seasonCode: string;
  indicationCode: string;
  ageMinEnfant: string;
  ageMaxEnfant: string;
  ageMinJunior: string;
  ageMaxJunior: string;
  validFrom: string;
  validTo: string;
  conditions: string;
  source: string;
  periods: ObjectWorkspacePricePeriod[];
}

export interface ObjectWorkspaceDiscountItem {
  recordId: string | null;
  conditions: string;
  discountPercent: string;
  discountAmount: string;
  currency: string;
  minGroupSize: string;
  maxGroupSize: string;
  validFrom: string;
  validTo: string;
  source: string;
}

export interface ObjectWorkspacePromotionSummary {
  promotionId: string;
  code: string;
  name: string;
  discountType: string;
  discountValue: string;
  currency: string;
  validFrom: string;
  validTo: string;
  isActive: boolean;
  isPublic: boolean;
}

export interface ObjectWorkspacePricingModule {
  priceKindOptions: WorkspaceReferenceOption[];
  priceUnitOptions: WorkspaceReferenceOption[];
  prices: ObjectWorkspacePriceItem[];
  discounts: ObjectWorkspaceDiscountItem[];
  promotions: ObjectWorkspacePromotionSummary[];
  promotionsUnavailableReason: string | null;
  unavailableReason: string | null;
}

export type ObjectWorkspaceOpeningBucket = 'current' | 'next-year' | 'undated';

export interface ObjectWorkspaceOpeningSlot {
  start: string;
  end: string;
}

export interface ObjectWorkspaceOpeningWeekday {
  code: string;
  label: string;
  slots: ObjectWorkspaceOpeningSlot[];
}

export interface ObjectWorkspaceOpeningPeriod {
  recordId: string | null;
  order: string;
  bucket: ObjectWorkspaceOpeningBucket;
  label: string;
  startDate: string;
  endDate: string;
  closedDays: string[];
  weekdays: ObjectWorkspaceOpeningWeekday[];
}

export interface ObjectWorkspaceOpeningsModule {
  periods: ObjectWorkspaceOpeningPeriod[];
  unavailableReason: string | null;
}

export interface ObjectWorkspaceFollowUpNote {
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

export interface ObjectWorkspaceProviderFollowUpModule {
  notes: ObjectWorkspaceFollowUpNote[];
  interactionsUnavailableReason: string | null;
  tasksUnavailableReason: string | null;
}

export interface ObjectWorkspaceLinkedContactItem {
  id: string;
  kindCode: string;
  kindLabel: string;
  roleCode: string;
  roleLabel: string;
  value: string;
  isPublic: boolean;
  isPrimary: boolean;
  position: string;
}

export interface ObjectWorkspaceOrganizationLinkItem {
  id: string;
  source: 'organization' | 'org_link';
  type: string;
  name: string;
  status: string;
  roleId: string;
  roleCode: string;
  roleLabel: string;
  note: string;
  contacts: ObjectWorkspaceLinkedContactItem[];
}

export interface ObjectWorkspaceActorLinkItem {
  id: string;
  displayName: string;
  firstName: string;
  lastName: string;
  gender: string;
  roleId: string;
  roleCode: string;
  roleLabel: string;
  visibility: string;
  isPrimary: boolean;
  validFrom: string;
  validTo: string;
  note: string;
  contacts: ObjectWorkspaceLinkedContactItem[];
}

export interface ObjectWorkspaceRelatedObjectItem {
  id: string;
  name: string;
  type: string;
  status: string;
  relationTypeId: string;
  relationTypeCode: string;
  relationTypeLabel: string;
  direction: 'out' | 'in' | 'associated';
  note: string;
  distanceM: string;
}

export interface ObjectWorkspaceRelationshipsModule {
  organizationLinks: ObjectWorkspaceOrganizationLinkItem[];
  actors: ObjectWorkspaceActorLinkItem[];
  relatedObjects: ObjectWorkspaceRelatedObjectItem[];
  organizationLinkWriteUnavailableReason: string | null;
  actorWriteUnavailableReason: string | null;
  actorConsentUnavailableReason: string | null;
  relatedObjectWriteUnavailableReason: string | null;
}

export interface ObjectWorkspaceMembershipScopeOption {
  orgObjectId: string;
  label: string;
  isPrimary: boolean;
}

export interface ObjectWorkspaceMembershipItem {
  recordId: string | null;
  scope: 'object' | 'organization';
  orgObjectId: string;
  orgLabel: string;
  campaignId: string;
  campaignCode: string;
  campaignLabel: string;
  tierId: string;
  tierCode: string;
  tierLabel: string;
  status: string;
  startsAt: string;
  endsAt: string;
  paymentDate: string;
  metadataJson: string;
  visibilityImpact: string;
}

export interface ObjectWorkspaceMembershipModule {
  campaignOptions: WorkspaceReferenceOption[];
  tierOptions: WorkspaceReferenceOption[];
  scopeOptions: ObjectWorkspaceMembershipScopeOption[];
  items: ObjectWorkspaceMembershipItem[];
  unavailableReason: string | null;
}

export interface ObjectWorkspaceLegalTypeOption {
  id: string;
  code: string;
  label: string;
  category: string;
  isPublic: boolean;
  isRequired: boolean;
}

export interface ObjectWorkspaceLegalRecord {
  recordId: string | null;
  typeId: string;
  typeCode: string;
  typeLabel: string;
  category: string;
  isPublic: boolean;
  isRequired: boolean;
  valueJson: string;
  documentId: string;
  validFrom: string;
  validTo: string;
  validityMode: string;
  status: string;
  documentRequestedAt: string;
  documentDeliveredAt: string;
  note: string;
  daysUntilExpiry: string;
}

export interface ObjectWorkspaceLegalComplianceDetail {
  typeCode: string;
  typeLabel: string;
  category: string;
  isRequired: boolean;
  hasRecord: boolean;
  isValid: boolean;
  status: string;
  validTo: string;
  daysUntilExpiry: string;
}

export interface ObjectWorkspaceLegalComplianceSummary {
  complianceStatus: string;
  requiredCount: number;
  validCount: number;
  expiringCount: number;
  missingCount: number;
  compliancePercentage: number;
  details: ObjectWorkspaceLegalComplianceDetail[];
}

export interface ObjectWorkspaceLegalModule {
  typeOptions: ObjectWorkspaceLegalTypeOption[];
  records: ObjectWorkspaceLegalRecord[];
  compliance: ObjectWorkspaceLegalComplianceSummary;
  unavailableReason: string | null;
}

export interface ObjectWorkspaceMediaItem {
  id: string;
  scope: 'object' | 'place';
  placeId: string | null;
  scopeLabel: string;
  typeId: string;
  typeCode: string;
  typeLabel: string;
  title: string;
  titleTranslations: Record<string, string>;
  description: string;
  descriptionTranslations: Record<string, string>;
  url: string;
  credit: string;
  visibility: string;
  position: string;
  width: string;
  height: string;
  rightsExpiresAt: string;
  kind: string;
  isMain: boolean;
  isPublished: boolean;
  tags: string[];
}

export interface ObjectWorkspaceMediaModule {
  typeOptions: WorkspaceReferenceOption[];
  tagOptions: WorkspaceReferenceOption[];
  objectItems: ObjectWorkspaceMediaItem[];
  placeItems: ObjectWorkspaceMediaItem[];
  placeScopeUnavailableReason: string | null;
}

export interface ObjectWorkspaceContactItem {
  id: string;
  kindId: string;
  kindCode: string;
  kindLabel: string;
  roleId: string;
  roleCode: string;
  roleLabel: string;
  value: string;
  isPublic: boolean;
  isPrimary: boolean;
  position: string;
}

export interface ObjectWorkspaceContactsModule {
  kindOptions: WorkspaceReferenceOption[];
  roleOptions: WorkspaceReferenceOption[];
  objectItems: ObjectWorkspaceContactItem[];
  relatedActorContactsCount: number;
  relatedOrganizationContactsCount: number;
}

export interface ObjectWorkspaceModules {
  generalInfo: ObjectWorkspaceGeneralInfo;
  taxonomy: ObjectWorkspaceTaxonomyModule;
  distinctions: ObjectWorkspaceDistinctionsModule;
  publication: ObjectWorkspacePublicationModule;
  syncIdentifiers: ObjectWorkspaceSyncIdentifiersModule;
  location: ObjectWorkspaceLocationModule;
  descriptions: ObjectWorkspaceDescriptionsModule;
  media: ObjectWorkspaceMediaModule;
  contacts: ObjectWorkspaceContactsModule;
  characteristics: ObjectWorkspaceCharacteristicsModule;
  capacityPolicies: ObjectWorkspaceCapacityPoliciesModule;
  pricing: ObjectWorkspacePricingModule;
  openings: ObjectWorkspaceOpeningsModule;
  providerFollowUp: ObjectWorkspaceProviderFollowUpModule;
  relationships: ObjectWorkspaceRelationshipsModule;
  memberships: ObjectWorkspaceMembershipModule;
  legal: ObjectWorkspaceLegalModule;
}

function isRecord(value: unknown): value is GenericRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readRecord(value: unknown): GenericRecord {
  return isRecord(value) ? value : {};
}

function readArray(value: unknown): GenericRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) as GenericRecord[] : [];
}

function readString(value: unknown, fallback = ''): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number') {
    return String(value);
  }
  return fallback;
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

function readBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return ['true', '1', 'yes', 'oui'].includes(value.trim().toLowerCase());
  }
  if (typeof value === 'number') {
    return value === 1;
  }
  return false;
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

function readStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => readString(entry).trim())
    .filter(Boolean);
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

function pickDescriptionSource(raw: Record<string, unknown>): GenericRecord {
  const candidates = [
    readRecord(raw.object_description),
    ...readArray(raw.object_descriptions),
    readRecord(raw.descriptions),
    ...readArray(raw.descriptions),
    ...readArray(raw.descriptions_list),
  ];

  return candidates.find((candidate) => Object.keys(candidate).length > 0) ?? {};
}

function parseLocationRecord(value: unknown): ObjectWorkspaceLocationForm {
  const record = readRecord(value);
  return {
    recordId: readString(record.id) || null,
    address1: readString(record.address1, readString(record.address)),
    address1Suite: readString(record.address1_suite),
    address2: readString(record.address2),
    address3: readString(record.address3),
    postcode: readString(record.postcode),
    city: readString(record.city),
    codeInsee: readString(record.code_insee),
    lieuDit: readString(record.lieu_dit),
    direction: readString(record.direction),
    latitude: readString(record.latitude, readString(record.lat)),
    longitude: readString(record.longitude, readString(record.lon)),
    zoneTouristique: readString(record.zone_touristique),
  };
}

function buildLocationLabel(location: ObjectWorkspaceLocationForm): string {
  const streetLine = [location.address1, location.address1Suite, location.address2].filter(Boolean).join(' ').trim();
  const cityLine = [location.postcode, location.city].filter(Boolean).join(' ');
  return [streetLine, location.address3, location.lieuDit, cityLine].filter(Boolean).join(' · ');
}

function parseMainLocation(raw: Record<string, unknown>): ObjectWorkspaceLocationForm {
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
    direction: pickFirstText(parsed.direction, addressRecord.direction, mainLocationRecord.direction, raw.direction),
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

function parsePlaceSummary(place: GenericRecord, index: number): ObjectWorkspacePlaceSummary {
  const location = parseLocationRecord(place.location ?? place.object_location);

  return {
    id: readString(place.id, `place-${index}`),
    label: readString(place.name, readString(place.label, `Sous-lieu ${index + 1}`)),
    isPrimary: readBoolean(place.is_primary),
    position: readPosition(place.position, index),
    locationLabel: buildLocationLabel(location),
  };
}

function parseDescriptionScope(params: {
  record: GenericRecord;
  scope: 'object' | 'place';
  placeId?: string | null;
  label: string;
}): ObjectWorkspaceDescriptionScope {
  return {
    recordId: readString(params.record.id) || null,
    scope: params.scope,
    placeId: params.placeId ?? null,
    label: params.label,
    visibility: readString(params.record.visibility, 'public'),
    description: toTranslatableField(params.record.description, params.record.description_i18n),
    chapo: toTranslatableField(params.record.description_chapo, params.record.description_chapo_i18n),
    adaptedDescription: toTranslatableField(params.record.description_adapted, params.record.description_adapted_i18n),
    mobileDescription: toTranslatableField(params.record.description_mobile, params.record.description_mobile_i18n),
    editorialDescription: toTranslatableField(params.record.description_edition, params.record.description_edition_i18n),
  };
}

function collectLanguages(params: {
  langPrefs: string[];
  nameTranslations: Record<string, string>;
  objectScope: ObjectWorkspaceDescriptionScope;
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

function parseWorkspaceMediaItem(params: {
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
    visibility: readString(params.record.visibility, 'public'),
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

function parseWorkspaceTaxonomyModule(raw: Record<string, unknown>): ObjectWorkspaceTaxonomyModule {
  const schemes = new Map<string, ObjectWorkspaceTaxonomyScheme>();

  for (const record of readArray(raw.classifications)) {
    const schemeCode = readString(record.scheme).trim();
    const valueCode = readString(record.value).trim();

    if (!schemeCode || !valueCode) {
      continue;
    }

    const schemeKey = schemeCode.toLowerCase();
    const schemeLabel = readString(record.scheme_name, schemeCode);
    const valueLabel = readString(record.value_name, valueCode);
    const existingScheme = schemes.get(schemeKey);
    const nextScheme = existingScheme ?? {
      id: schemeCode,
      code: schemeCode,
      label: schemeLabel,
      description: '',
      selectionMode: 'single' as const,
      displayGroup: '',
      valueOptions: [],
      items: [],
    };

    if (!nextScheme.valueOptions.some((option) => option.code === valueCode)) {
      nextScheme.valueOptions.push({
        id: `${schemeCode}:${valueCode}`,
        code: valueCode,
        label: valueLabel,
      });
    }

    nextScheme.items.push({
      recordId: readString(record.id) || null,
      schemeId: schemeCode,
      schemeCode,
      schemeLabel,
      valueId: valueCode,
      valueCode,
      valueLabel,
      status: readString(record.status),
      awardedAt: readString(record.awarded_at),
      validUntil: readString(record.valid_until),
    });

    schemes.set(schemeKey, nextScheme);
  }

  return {
    schemes: Array.from(schemes.values()).map((scheme) => ({
      ...scheme,
      items: scheme.items.sort((left, right) => left.valueLabel.localeCompare(right.valueLabel, 'fr')),
      valueOptions: scheme.valueOptions.sort((left, right) => left.label.localeCompare(right.label, 'fr')),
    })),
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
      levelId: '',
      levelCode: '',
      levelLabel: '',
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
    const option: WorkspaceReferenceOption = {
      id: readString(record.id, readString(record.code)),
      code: readString(record.code),
      label: readString(record.name, readString(record.code)),
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
      hasPolicy: Object.keys(petPolicyRecord).length > 0,
      accepted: petPolicyRecord.accepted == null ? false : readBoolean(petPolicyRecord.accepted),
      conditions: readString(petPolicyRecord.conditions),
    },
    unavailableReason: null,
  };
}

function parseWorkspaceDistinctionsModule(): ObjectWorkspaceDistinctionsModule {
  return {
    distinctionGroups: [],
    accessibilityLabels: [],
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
    priceUnitOptions: dedupeReferenceOptions(
      prices.map((price) => ({
        id: price.unitId || price.unitCode,
        code: price.unitCode,
        label: price.unitLabel || price.unitCode,
      })),
    ),
    prices,
    discounts,
    promotions: [],
    promotionsUnavailableReason: null,
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
        start: parts[0] ?? '',
        end: parts[1] ?? '',
      };
    }

    return {
      start: normalized,
      end: '',
    };
  }

  const record = readRecord(value);
  const start = readString(record.start, readString(record.start_time, readString(record.time_start)));
  const end = readString(record.end, readString(record.end_time, readString(record.time_end)));

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
          slots: normalizedSlots,
        };
      })
      .filter((weekday) => weekday.slots.length > 0),
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

function parseWorkspaceOpeningPeriodRecord(
  record: GenericRecord,
  index: number,
  bucket: ObjectWorkspaceOpeningBucket,
): ObjectWorkspaceOpeningPeriod {
  const weekdaySlots = buildWorkspaceOpeningWeekdaysFromCanonical(record.weekday_slots);
  const fallbackWeekdays =
    weekdaySlots.length > 0
      ? weekdaySlots
      : buildWorkspaceOpeningWeekdaysFromLegacySchedules(record);

  return {
    recordId: readString(record.id) || null,
    order: readString(record.order, String(index + 1)),
    bucket,
    label: readString(record.label, readString(record.name, `Periode ${index + 1}`)),
    startDate: readString(record.date_start, readString(record.start_date)),
    endDate: readString(record.date_end, readString(record.end_date)),
    closedDays: readStringList(record.closed_days),
    weekdays: fallbackWeekdays,
  };
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

    return {
      recordId: readString(record.id) || null,
      order: String(index + 1),
      bucket: 'undated' as const,
      label: readString(record.label, `Horaire ${index + 1}`),
      startDate: readString(record.date_start, readString(record.start_date)),
      endDate: readString(record.date_end, readString(record.end_date)),
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
    organizationLinkWriteUnavailableReason: null,
    actorWriteUnavailableReason: null,
    actorConsentUnavailableReason: null,
    relatedObjectWriteUnavailableReason: null,
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

export function parseObjectWorkspace(detail: ObjectDetail, langPrefs: string[]): ObjectWorkspaceModules {
  const raw = (detail.raw ?? {}) as Record<string, unknown>;
  const nameTranslations = readTextMap(raw.name_i18n);
  const mainLocation = parseMainLocation(raw);
  const places = readArray(raw.places).map(parsePlaceSummary);
  const objectDescription = parseDescriptionScope({
    record: pickDescriptionSource(raw),
    scope: 'object',
    label: 'Objet principal',
  });
  const placeDescriptions = readArray(raw.places).map((place, index) => {
    const descriptions = readArray(place.descriptions);
    const source = descriptions[0] ?? readRecord(place.object_place_description);
    return parseDescriptionScope({
      record: source,
      scope: 'place',
      placeId: readString(place.id, `place-${index}`),
      label: readString(place.name, readString(place.label, `Sous-lieu ${index + 1}`)),
    });
  });
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
  const relatedActorContactsCount = readArray(raw.actors).reduce((count, actor) => count + readArray(actor.contacts).length, 0);
  const relatedOrganizationContactsCount = [
    ...readArray(raw.organizations),
    ...readArray(raw.org_links),
    ...readArray(raw.parent_objects),
  ].reduce((count, organization) => count + readArray(organization.contacts).length, 0);
  const availableLanguages = collectLanguages({
    langPrefs,
    nameTranslations,
    objectScope: objectDescription,
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
    },
    taxonomy: parseWorkspaceTaxonomyModule(raw),
    distinctions: parseWorkspaceDistinctionsModule(),
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
      places,
      zoneCodes: [
        ...readArray(raw.object_zones),
        ...readArray(raw.object_zone),
      ].map((zone) => readString(zone.insee_commune)).filter(Boolean),
    },
    descriptions: {
      localLanguage,
      activeLanguage: localLanguage,
      availableLanguages,
      object: objectDescription,
      places: placeDescriptions,
    },
    media: {
      typeOptions: [],
      tagOptions: [],
      objectItems: objectMedia,
      placeItems: [],
      placeScopeUnavailableReason: null,
    },
    contacts: {
      kindOptions: [],
      roleOptions: [],
      objectItems: objectContacts,
      relatedActorContactsCount,
      relatedOrganizationContactsCount,
    },
    characteristics: parseWorkspaceCharacteristicsModule(raw),
    capacityPolicies: parseWorkspaceCapacityPoliciesModule(raw),
    pricing: parseWorkspacePricingModule(raw),
    openings: parseWorkspaceOpeningsModule(raw),
    providerFollowUp: parseWorkspaceProviderFollowUpModule(raw),
    relationships: parseWorkspaceRelationshipsModule(raw),
    memberships: parseWorkspaceMembershipModule(raw, detail),
    legal: parseWorkspaceLegalModule(raw),
  };
}
