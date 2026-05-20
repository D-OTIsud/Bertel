import { formatOpeningTime, isOpeningPeriodAllYears } from '../features/object-drawer/utils';
import type { ObjectDetail } from '../types/domain';

interface GenericRecord {
  [key: string]: unknown;
}

export type WorkspaceModuleId = 'general-info' | 'taxonomy' | 'publication' | 'sync-identifiers' | 'location' | 'descriptions' | 'media' | 'contacts' | 'characteristics' | 'distinctions' | 'capacity-policies' | 'pricing' | 'rooms' | 'meeting-rooms' | 'menus' | 'activity' | 'event' | 'itinerary' | 'openings' | 'provider-follow-up' | 'relationships' | 'memberships' | 'legal' | 'tags' | 'sustainability' | 'distribution' | 'provider';

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

export interface ObjectWorkspaceTaxonomyPathNode {
  id: string;
  code: string;
  label: string;
  description: string;
  depth: number;
}

export interface ObjectWorkspaceTaxonomyNodeOption {
  id: string;
  code: string;
  label: string;
  description: string;
  parentId: string | null;
  parentCode: string | null;
  depth: number;
  isAssignable: boolean;
  position: number;
}

export interface ObjectWorkspaceTaxonomyAssignment {
  recordId: string | null;
  nodeId: string;
  code: string;
  label: string;
  description: string;
  depth: number;
  path: ObjectWorkspaceTaxonomyPathNode[];
  updatedAt: string;
  source: string;
}

export interface ObjectWorkspaceTaxonomyDomain {
  domain: string;
  label: string;
  description: string;
  objectType: string;
  nodes: ObjectWorkspaceTaxonomyNodeOption[];
  assignment: ObjectWorkspaceTaxonomyAssignment | null;
}

export interface ObjectWorkspaceTaxonomyModule {
  domains: ObjectWorkspaceTaxonomyDomain[];
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
  /** Canonical field key from pending_change payload/metadata (e.g. lieu_dit). */
  field: string;
  beforeValue: string;
  afterValue: string;
  /** Human label for who submitted the change (prestataire, import, …). */
  submittedByLabel: string;
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

export interface ObjectWorkspaceRoomTypeItem {
  recordId: string | null;
  code: string;
  name: string;
  nameTranslations: Record<string, string>;
  description: string;
  descriptionTranslations: Record<string, string>;
  capacityAdults: string;
  capacityChildren: string;
  capacityTotal: string;
  sizeSqm: string;
  bedConfig: string;
  bedConfigTranslations: Record<string, string>;
  quantity: string;
  floorLevel: string;
  viewTypeId: string;
  viewTypeCode: string;
  viewTypeLabel: string;
  basePrice: string;
  currency: string;
  accessible: boolean;
  published: boolean;
  position: string;
  amenityCodes: string[];
  mediaIds: string[];
}

export interface ObjectWorkspaceRoomsModule {
  viewTypeOptions: WorkspaceReferenceOption[];
  amenityOptions: WorkspaceReferenceOption[];
  mediaOptions: WorkspaceReferenceOption[];
  items: ObjectWorkspaceRoomTypeItem[];
  unavailableReason: string | null;
}

export interface ObjectWorkspaceMeetingRoomItem {
  recordId: string | null;
  name: string;
  nameTranslations: Record<string, string>;
  areaM2: string;
  capacityTheatre: string;
  capacityU: string;
  capacityClassroom: string;
  capacityBoardroom: string;
  equipmentCodes: string[];
}

export interface ObjectWorkspaceMeetingRoomsModule {
  equipmentOptions: WorkspaceReferenceOption[];
  items: ObjectWorkspaceMeetingRoomItem[];
  unavailableReason: string | null;
}

export interface ObjectWorkspaceMenuItem {
  recordId: string | null;
  name: string;
  description: string;
  price: string;
  currency: string;
  kindId: string;
  kindCode: string;
  kindLabel: string;
  unitId: string;
  unitCode: string;
  unitLabel: string;
  mediaIds: string[];
  available: boolean;
  position: string;
  dietaryTagCodes: string[];
  allergenCodes: string[];
  cuisineTypeCodes: string[];
}

export interface ObjectWorkspaceMenu {
  recordId: string | null;
  categoryId: string;
  categoryCode: string;
  categoryLabel: string;
  name: string;
  description: string;
  active: boolean;
  visibility: string;
  position: string;
  items: ObjectWorkspaceMenuItem[];
}

export interface ObjectWorkspaceMenusModule {
  categoryOptions: WorkspaceReferenceOption[];
  dietaryTagOptions: WorkspaceReferenceOption[];
  allergenOptions: WorkspaceReferenceOption[];
  cuisineTypeOptions: WorkspaceReferenceOption[];
  priceKindOptions: WorkspaceReferenceOption[];
  priceUnitOptions: WorkspaceReferenceOption[];
  mediaOptions: WorkspaceReferenceOption[];
  items: ObjectWorkspaceMenu[];
  unavailableReason: string | null;
}

export interface ObjectWorkspaceActivityModule {
  durationMin: string;
  minParticipants: string;
  maxParticipants: string;
  difficultyLevel: string;
  guideRequired: boolean;
  minAge: string;
  equipmentProvided: string;
  unavailableReason: string | null;
}

export interface ObjectWorkspaceEventOccurrence {
  recordId: string | null;
  startAt: string;
  endAt: string;
  state: string;
}

export interface ObjectWorkspaceEventModule {
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  recurring: boolean;
  recurrenceText: string;
  occurrences: ObjectWorkspaceEventOccurrence[];
  unavailableReason: string | null;
}

export interface ObjectWorkspaceItineraryStageSummary {
  recordId: string | null;
  name: string;
  description: string;
  position: string;
}

export interface ObjectWorkspaceItineraryModule {
  distanceKm: string;
  durationMin: string;
  difficultyLevel: string;
  elevationPositiveM: string;
  elevationNegativeM: string;
  loop: boolean;
  openStatus: string;
  statusNote: string;
  practiceOptions: WorkspaceReferenceOption[];
  practiceCodes: string[];
  stages: ObjectWorkspaceItineraryStageSummary[];
  sectionsCount: number;
  profilesCount: number;
  geometrySummary: string;
  traceEditable: boolean;
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
  allYears: boolean;
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

export type ObjectWorkspaceTagColorVariant = 'teal' | 'orange' | 'neutral' | 'outline' | 'green';

export type ObjectWorkspaceTagSource =
  | 'thematic'
  | 'audience'
  | 'ambience'
  | 'badges'
  | 'classification'
  | 'taxo';

export interface ObjectWorkspaceTagItem {
  tagId: string;
  slug: string;
  label: string;
  colorVariant: ObjectWorkspaceTagColorVariant;
  source: ObjectWorkspaceTagSource;
}

export interface ObjectWorkspaceTagsModule {
  displayed: ObjectWorkspaceTagItem[];
  derived: ObjectWorkspaceTagItem[];
  library: ObjectWorkspaceTagItem[];
}

export interface ObjectWorkspaceSustainabilityAction {
  id: string;
  code: string;
  label: string;
  selected: boolean;
  note: string;
  documentId: string;
}

export interface ObjectWorkspaceSustainabilityCategory {
  id: string;
  code: string;
  label: string;
  actions: ObjectWorkspaceSustainabilityAction[];
}

export interface ObjectWorkspaceSustainabilityLabel {
  code: string;
  label: string;
}

export interface ObjectWorkspaceSustainabilityModule {
  categories: ObjectWorkspaceSustainabilityCategory[];
  equivalentLabels: ObjectWorkspaceSustainabilityLabel[];
}

export interface ObjectWorkspaceDistributionChannel {
  id: string;
  code: string;
  name: string;
  url: string;
  syncStatus: string;
  syncTone: 'ok' | 'warn';
  group: 'booking' | 'social';
}

export interface ObjectWorkspaceDistributionModule {
  channels: ObjectWorkspaceDistributionChannel[];
  readonlyReason: string | null;
}

export interface ObjectWorkspaceProviderModule {
  siret: string;
  companyName: string;
  sireneVerified: boolean;
  legalForm: string;
  nafCode: string;
  consularChamber: string;
  cfeOrganization: string;
  directorFullName: string;
  directorEmail: string;
  directorPhone: string;
  address: string;
  incorporationDate: string;
  readonlyReason: string | null;
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
  rooms: ObjectWorkspaceRoomsModule;
  meetingRooms: ObjectWorkspaceMeetingRoomsModule;
  menus: ObjectWorkspaceMenusModule;
  activity: ObjectWorkspaceActivityModule;
  event: ObjectWorkspaceEventModule;
  itinerary: ObjectWorkspaceItineraryModule;
  openings: ObjectWorkspaceOpeningsModule;
  providerFollowUp: ObjectWorkspaceProviderFollowUpModule;
  relationships: ObjectWorkspaceRelationshipsModule;
  memberships: ObjectWorkspaceMembershipModule;
  legal: ObjectWorkspaceLegalModule;
  tags: ObjectWorkspaceTagsModule;
  sustainability: ObjectWorkspaceSustainabilityModule;
  distribution: ObjectWorkspaceDistributionModule;
  provider: ObjectWorkspaceProviderModule;
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
      name: readString(record.name, `Unite ${index + 1}`),
      nameTranslations: readTextMap(record.name_i18n),
      description: readString(record.description),
      descriptionTranslations: readTextMap(record.description_i18n),
      capacityAdults: readString(record.capacity_adults, readString(record.max_capacity)),
      capacityChildren: readString(record.capacity_children),
      capacityTotal: readString(record.capacity_total, readString(record.capacity)),
      sizeSqm: readString(record.size_sqm, readString(record.area_m2, readString(record.surface_m2))),
      bedConfig: readString(record.bed_config, readString(record.beds, readString(record.bed_config_summary))),
      bedConfigTranslations: readTextMap(record.bed_config_i18n),
      quantity: readString(record.total_rooms, readString(record.quantity, readString(record.inventory_count))),
      floorLevel: readString(record.floor_level),
      viewTypeId: readString(record.view_type_id, viewType.id),
      viewTypeCode: readString(record.view_type_code, viewType.code),
      viewTypeLabel: readString(record.view_type_label, viewType.label),
      basePrice: readString(record.base_price),
      currency: readString(record.currency, 'EUR'),
      accessible: readBoolean(record.is_accessible ?? record.accessible),
      published: record.is_published == null ? true : readBoolean(record.is_published),
      position: readString(record.position, String(index + 1)),
      amenityCodes: readReferenceCodes(record.amenities ?? record.room_type_amenities, 'amenity'),
      mediaIds: readArray(record.media ?? record.room_type_media).map((media) =>
        readString(media.media_id, readString(readRecord(media.media).id, readString(media.id))),
      ).filter(Boolean),
    };
  });

  return {
    viewTypeOptions: dedupeReferenceOptions(items.map((item) => ({
      id: item.viewTypeId || item.viewTypeCode,
      code: item.viewTypeCode,
      label: item.viewTypeLabel || item.viewTypeCode,
    }))),
    amenityOptions: dedupeReferenceOptions(
      roomRecords.flatMap((record) =>
        readArray(record.amenities ?? record.room_type_amenities).map((amenity) => readNamedReference(amenity.amenity ?? amenity)),
      ),
    ),
    mediaOptions: [],
    items,
    unavailableReason: null,
  };
}

function parseWorkspaceMeetingRoomsModule(raw: Record<string, unknown>): ObjectWorkspaceMeetingRoomsModule {
  const roomRecords = readArray(raw.meeting_rooms ?? raw.object_meeting_rooms);
  const items = roomRecords.map<ObjectWorkspaceMeetingRoomItem>((record, index) => ({
    recordId: readString(record.id) || null,
    name: readString(record.name, `Salle ${index + 1}`),
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
    unavailableReason: null,
  };
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
      name: readString(record.name, `Menu ${index + 1}`),
      description: readString(record.description),
      active: record.is_active == null ? true : readBoolean(record.is_active),
      visibility: readString(record.visibility, 'public'),
      position: readString(record.position, String(index + 1)),
      items: readArray(record.items ?? record.menu_items ?? record.object_menu_items).map<ObjectWorkspaceMenuItem>((item, itemIndex) => {
        const kind = readNamedReference(item.kind, readString(item.kind_code));
        const unit = readNamedReference(item.unit, readString(item.unit_code));

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
    equipmentProvided: readString(record.equipment_provided, readString(raw.equipment_provided)),
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

function parseWorkspaceItineraryModule(raw: Record<string, unknown>): ObjectWorkspaceItineraryModule {
  const itinerary = readRecord(raw.itinerary ?? raw.object_iti);
  const details = readRecord(raw.itinerary_details);
  const practiceRecords = [
    ...readArray(raw.practices ?? raw.object_practices),
    ...readArray(details.practices),
  ];
  const stages = readArray(details.stages ?? itinerary.stages ?? raw.stages).map((stage, index) => ({
    recordId: readString(stage.id) || null,
    name: readString(stage.name, `Etape ${index + 1}`),
    description: readString(stage.description),
    position: readString(stage.position, String(index + 1)),
  }));

  const geometrySummary = [
    readString(itinerary.track_format, readString(details.track_format)),
    readString(itinerary.track, readString(details.track)) ? 'trace presente' : '',
    readString(itinerary.geom, readString(raw.geom)) ? 'geometrie presente' : '',
  ].filter(Boolean).join(' · ');

  return {
    distanceKm: readString(itinerary.distance_km, readString(raw.distance_km, readString(raw.length_km, readString(raw.total_length_km)))),
    durationMin: readString(itinerary.duration_min, readString(raw.duration_min, readString(raw.total_duration_min))),
    difficultyLevel: readString(itinerary.difficulty_level, readString(raw.difficulty_level)),
    elevationPositiveM: readString(itinerary.elevation_positive_m, readString(itinerary.elevation_gain, readString(raw.elevation_gain_m))),
    elevationNegativeM: readString(itinerary.elevation_negative_m, readString(raw.elevation_negative_m)),
    loop: readBoolean(itinerary.is_loop ?? raw.is_loop),
    openStatus: readString(itinerary.open_status, 'open'),
    statusNote: readString(itinerary.status_note),
    practiceOptions: dedupeReferenceOptions(practiceRecords.map((practice) => readNamedReference(practice.practice ?? practice))),
    practiceCodes: readReferenceCodes(practiceRecords, 'practice'),
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

  const allYears = isOpeningPeriodAllYears(record);

  return {
    recordId: readString(record.id) || null,
    order: readString(record.order, String(index + 1)),
    bucket,
    label: readString(record.label, readString(record.name, `Periode ${index + 1}`)),
    startDate: readString(record.date_start, readString(record.start_date)),
    endDate: readString(record.date_end, readString(record.end_date)),
    allYears,
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
      allYears: isOpeningPeriodAllYears(record),
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

const TAG_COLOR_VARIANTS = new Set<ObjectWorkspaceTagColorVariant>(['teal', 'orange', 'neutral', 'outline', 'green']);

function normalizeTagColorVariant(value: string): ObjectWorkspaceTagColorVariant {
  const normalized = value.trim().toLowerCase();
  return TAG_COLOR_VARIANTS.has(normalized as ObjectWorkspaceTagColorVariant)
    ? normalized as ObjectWorkspaceTagColorVariant
    : 'teal';
}

function normalizeTagSource(value: string): ObjectWorkspaceTagSource {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'audience' || normalized === 'ambience' || normalized === 'badges' || normalized === 'classification' || normalized === 'taxo') {
    return normalized;
  }
  return 'thematic';
}

function readLegalRecordScalarValue(record: ObjectWorkspaceLegalRecord): string {
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
      return readString(map.value ?? map.label ?? map.name).trim();
    }
  } catch {
    return raw;
  }

  return raw;
}

function findLegalRecordValue(records: ObjectWorkspaceLegalRecord[], patterns: string[]): string {
  const record = records.find((item) => {
    const haystack = `${item.typeCode} ${item.typeLabel}`.toLowerCase();
    return patterns.some((pattern) => haystack.includes(pattern));
  });
  return record ? readLegalRecordScalarValue(record) : '';
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
    const extra = readRecord(record.extra);
    const slug = readString(record.slug);
    const label = readString(record.name, slug);
    return {
      tagId: readString(record.id, readString(record.tag_id)),
      slug,
      label,
      colorVariant: normalizeTagColorVariant(readString(record.color, readString(extra.color_variant, 'teal'))),
      source: normalizeTagSource(readString(extra.source, 'thematic')),
    };
  }).filter((item) => item.slug || item.label);

  return {
    displayed,
    derived: [],
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
        actions: [],
      });
    }

    categories.get(categoryId)?.actions.push({
      id: actionId,
      code: actionCode,
      label: readString(actionRecord.label, actionCode),
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
  const siret = findLegalRecordValue(records, ['siret', 'siren']);
  const companyName =
    findLegalRecordValue(records, ['raison', 'sociale', 'company', 'entreprise'])
    || readString(operator?.display_name);

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
  const legal = parseWorkspaceLegalModule(raw);
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
    rooms: parseWorkspaceRoomsModule(raw),
    meetingRooms: parseWorkspaceMeetingRoomsModule(raw),
    menus: parseWorkspaceMenusModule(raw),
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
