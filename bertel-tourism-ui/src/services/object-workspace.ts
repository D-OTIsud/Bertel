import { getApiClient, getSupabaseClient } from '../lib/supabase';
import { useSessionStore } from '../store/session-store';
import type { ObjectDetail } from '../types/domain';
import { mockPendingChanges, mockPublicationCards } from '../data/mock';
import { getObjectResource } from './rpc';
import {
  type ObjectWorkspaceCapacityItem,
  type ObjectWorkspaceCapacityPoliciesModule,
  type ObjectWorkspaceActivityModule,
  type ObjectWorkspaceAccessibilityAmenityItem,
  type ObjectWorkspaceAmenityGroup,
  type ObjectWorkspaceAmenityOption,
  type ObjectWorkspaceCharacteristicsModule,
  parseObjectWorkspace,
  type ObjectWorkspaceContactItem,
  type ObjectWorkspaceContactsModule,
  type ObjectWorkspaceDescriptionScope,
  type ObjectWorkspaceDescriptionsModule,
  type ObjectWorkspaceDistinctionGroup,
  type ObjectWorkspaceDistinctionItem,
  type ObjectWorkspaceDistinctionSchemeOption,
  type ObjectWorkspaceDistinctionsModule,
  type ObjectWorkspaceGeneralInfo,
  type ObjectWorkspaceLanguageItem,
  type ObjectWorkspaceLocationModule,
  type ObjectWorkspaceMediaItem,
  type ObjectWorkspaceMediaModule,
  type ObjectWorkspaceModerationItem,
  type ObjectWorkspaceModules,
  type ObjectWorkspacePublicationModule,
  type ObjectWorkspacePublicationSelectionItem,
  type ObjectWorkspacePricingModule,
  type ObjectWorkspaceOpeningsModule,
  type ObjectWorkspaceSyncIdentifiersModule,
  type ObjectWorkspaceMembershipItem,
  type ObjectWorkspaceMembershipModule,
  type ObjectWorkspaceMembershipScopeOption,
  type ObjectWorkspaceRelationshipsModule,
  type ObjectWorkspaceLegalComplianceDetail,
  type ObjectWorkspaceLegalComplianceSummary,
  type ObjectWorkspaceLegalModule,
  type ObjectWorkspaceLegalRecord,
  type ObjectWorkspaceLegalTypeOption,
  type ObjectWorkspaceMeetingRoomsModule,
  type ObjectWorkspaceMenuItem,
  type ObjectWorkspaceMenusModule,
  type ObjectWorkspaceSustainabilityModule,
  type ObjectWorkspaceTagsModule,
  type ObjectWorkspaceEventModule,
  type ObjectWorkspaceItineraryModule,
  type ObjectWorkspacePriceItem,
  type ObjectWorkspacePricePeriod,
  type ObjectWorkspacePromotionSummary,
  type ObjectWorkspaceDiscountItem,
  type ObjectWorkspaceRoomsModule,
  type ObjectWorkspaceTaxonomyAssignment,
  type ObjectWorkspaceTaxonomyDomain,
  type ObjectWorkspaceTaxonomyModule,
  type ObjectWorkspaceTaxonomyNodeOption,
  type ObjectWorkspaceTaxonomyPathNode,
  type WorkspaceReferenceOption,
  normalizeTagSource,
  resolveTagColor,
} from './object-workspace-parser';

// Re-export resolveTagColor so callers and tests that import from this entry point can reach it
// without importing from object-workspace-parser directly.
export { resolveTagColor } from './object-workspace-parser';

export type WorkspaceModuleId = 'general-info' | 'taxonomy' | 'publication' | 'sync-identifiers' | 'location' | 'descriptions' | 'media' | 'contacts' | 'characteristics' | 'distinctions' | 'capacity-policies' | 'pricing' | 'rooms' | 'meeting-rooms' | 'menus' | 'activity' | 'event' | 'itinerary' | 'openings' | 'provider-follow-up' | 'relationships' | 'memberships' | 'legal' | 'tags' | 'sustainability' | 'distribution' | 'provider';

export interface ObjectWorkspaceModuleAccess {
  canDirectWrite: boolean;
  canPrepareProposal: boolean;
  canSubmitProposal: boolean;
  disabledReason: string | null;
}

export interface ObjectWorkspacePermissions {
  generalInfo: ObjectWorkspaceModuleAccess;
  taxonomy: ObjectWorkspaceModuleAccess;
  publication: ObjectWorkspaceModuleAccess;
  syncIdentifiers: ObjectWorkspaceModuleAccess;
  location: ObjectWorkspaceModuleAccess & {
    canEditPlaces: boolean;
    canEditZones: boolean;
  };
  descriptions: ObjectWorkspaceModuleAccess & {
    canEditPlaceDescriptions: boolean;
    canEditCanonical: boolean;
    canEditOrgEnrichment: boolean;
  };
  media: ObjectWorkspaceModuleAccess & {
    canEditPlaceMedia: boolean;
  };
  contacts: ObjectWorkspaceModuleAccess;
  characteristics: ObjectWorkspaceModuleAccess;
  distinctions: ObjectWorkspaceModuleAccess;
  capacityPolicies: ObjectWorkspaceModuleAccess;
  pricing: ObjectWorkspaceModuleAccess;
  rooms: ObjectWorkspaceModuleAccess;
  meetingRooms: ObjectWorkspaceModuleAccess;
  menus: ObjectWorkspaceModuleAccess;
  activity: ObjectWorkspaceModuleAccess;
  event: ObjectWorkspaceModuleAccess;
  itinerary: ObjectWorkspaceModuleAccess;
  openings: ObjectWorkspaceModuleAccess;
  providerFollowUp: ObjectWorkspaceModuleAccess;
  relationships: ObjectWorkspaceModuleAccess;
  memberships: ObjectWorkspaceModuleAccess;
  legal: ObjectWorkspaceModuleAccess;
  tags: ObjectWorkspaceModuleAccess;
  sustainability: ObjectWorkspaceModuleAccess;
  distribution: ObjectWorkspaceModuleAccess;
  provider: ObjectWorkspaceModuleAccess;
}

export interface ObjectWorkspaceResource {
  id: string;
  name: string;
  type?: string;
  detail: ObjectDetail;
  modules: ObjectWorkspaceModules;
  permissions: ObjectWorkspacePermissions;
}

function readErrorMessage(error: unknown, fallback: string): Error {
  if (error instanceof Error) {
    return error;
  }

  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return new Error(error.message);
  }

  return new Error(fallback);
}

function mapMutationError(error: unknown, fallback: string): Error {
  const resolved = readErrorMessage(error, fallback);
  const normalized = resolved.message.toLowerCase();

  if (normalized.includes('row-level security') || normalized.includes('42501')) {
    return new Error("Cette action n'est pas autorisee avec vos droits actuels.");
  }

  return resolved;
}

function toNullableText(value: string): string | null {
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function toNullableNumber(value: string): number | null {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  const parsed = Number.parseFloat(normalized.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function toNullableInteger(value: string): number | null {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  const parsed = Number.parseInt(normalized, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function toRpcUuid(value: string | null | undefined): string | null {
  return value && isUuid(value) ? value : null;
}

const OPENING_WEEKDAY_ALIASES: Record<string, string> = {
  lundi: 'monday',
  lun: 'monday',
  monday: 'monday',
  mon: 'monday',
  mardi: 'tuesday',
  mar: 'tuesday',
  tuesday: 'tuesday',
  tue: 'tuesday',
  mercredi: 'wednesday',
  mer: 'wednesday',
  wednesday: 'wednesday',
  wed: 'wednesday',
  jeudi: 'thursday',
  jeu: 'thursday',
  thursday: 'thursday',
  thu: 'thursday',
  vendredi: 'friday',
  ven: 'friday',
  friday: 'friday',
  fri: 'friday',
  samedi: 'saturday',
  sam: 'saturday',
  saturday: 'saturday',
  sat: 'saturday',
  dimanche: 'sunday',
  dim: 'sunday',
  sunday: 'sunday',
  sun: 'sunday',
};

function normalizeOpeningWeekdayCode(value: string): string {
  const normalized = value.trim().toLowerCase();
  return OPENING_WEEKDAY_ALIASES[normalized] ?? normalized;
}

async function callObjectWorkspaceRpc(
  functionName: string,
  objectId: string,
  payload: Record<string, unknown>,
  fallback: string,
): Promise<Record<string, unknown>> {
  const apiClient = getApiClient();
  if (!apiClient) {
    throw new Error(fallback);
  }

  const { data, error } = await apiClient.schema('api').rpc(functionName, {
    p_object_id: objectId,
    p_payload: payload,
  });

  if (error) {
    throw mapMutationError(error, fallback);
  }

  const result = readRecord(data);
  if (result.success === false) {
    throw new Error(fallback);
  }

  return result;
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

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function readStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => readString(entry).trim())
    .filter(Boolean);
}

function readPendingChangeFieldValues(payload: unknown, metadata: unknown) {
  const metadataRecord = readRecord(metadata);
  const payloadRecord = readRecord(payload);
  const field = readString(metadataRecord.field, readString(payloadRecord.field));
  const beforeValue = readString(
    metadataRecord.before,
    readString(payloadRecord.before, readString(payloadRecord.old_value, readString(payloadRecord.old))),
  );
  const afterValue = readString(
    metadataRecord.after,
    readString(payloadRecord.after, readString(payloadRecord.new_value, readString(payloadRecord.new))),
  );
  const submittedByLabel = readString(
    metadataRecord.author,
    readString(metadataRecord.who, readString(payloadRecord.author, readString(payloadRecord.submitted_by_label))),
  );
  return { field, beforeValue, afterValue, submittedByLabel };
}

function normalizePendingChangeSummary(input: {
  targetTable: string;
  action: string;
  payload: unknown;
  metadata: unknown;
  field: string;
  beforeValue: string;
  afterValue: string;
}): string {
  const label = readString(readRecord(input.metadata).label, readString(readRecord(input.payload).label));

  if (label) {
    return label;
  }

  if (input.field && (input.beforeValue || input.afterValue)) {
    return `${input.field} · ${input.beforeValue} -> ${input.afterValue}`;
  }

  if (input.field) {
    return `${input.action} · ${input.field}`;
  }

  return `${input.action} · ${input.targetTable}`;
}

function normalizePendingChangeItem(row: Record<string, unknown>): ObjectWorkspaceModerationItem {
  const targetTable = readString(row.target_table);
  const action = readString(row.action);
  const { field, beforeValue, afterValue, submittedByLabel } = readPendingChangeFieldValues(row.payload, row.metadata);

  return {
    id: readString(row.id),
    targetTable,
    action,
    status: readString(row.status, 'pending'),
    submittedAt: readString(row.submitted_at),
    reviewedAt: readString(row.reviewed_at),
    appliedAt: readString(row.applied_at),
    reviewNote: readString(row.review_note),
    field,
    beforeValue,
    afterValue,
    submittedByLabel,
    summary: normalizePendingChangeSummary({
      targetTable,
      action,
      payload: row.payload,
      metadata: row.metadata,
      field,
      beforeValue,
      afterValue,
    }),
  };
}

async function getObjectWorkspaceSyncIdentifiersModule(
  _objectId: string,
  baseModule: ObjectWorkspaceSyncIdentifiersModule,
): Promise<ObjectWorkspaceSyncIdentifiersModule> {
  const session = useSessionStore.getState();

  return {
    ...baseModule,
    externalIdentifiersVisibilityNote:
      baseModule.externalIdentifiers.length > 0
        ? null
        : session.demoMode
          ? null
          : "Les identifiants externes sont soumis a une lecture restreinte cote backend; l'absence de ligne ici ne prouve pas l'absence en base.",
    originsVisibilityNote:
      baseModule.origins.length > 0
        ? null
        : 'Aucune provenance amont n est actuellement exposee pour cette fiche.',
  };
}

function normalizePublicationSelectionItem(row: Record<string, unknown>): ObjectWorkspacePublicationSelectionItem {
  const publication = readRecord(row.publication);

  return {
    publicationId: readString(row.publication_id),
    publicationCode: readString(publication.code),
    publicationName: readString(publication.name),
    publicationYear: readString(publication.year),
    publicationStatus: readString(publication.status),
    workflowStatus: readString(row.workflow_status, 'selected'),
    pageNumber: readString(row.page_number),
    customPrintText: readString(row.custom_print_text),
    proofSentAt: readString(row.proof_sent_at),
    validatedAt: readString(row.validated_bat_at),
  };
}

function buildDemoModerationItems(objectName: string, objectId: string): ObjectWorkspaceModerationItem[] {
  return mockPendingChanges
    .filter((item) => item.objectName === objectName || item.objectId === objectId)
    .map((item) => ({
      id: item.id,
      targetTable: 'object_location',
      action: 'update',
      status: 'pending',
      submittedAt: item.submittedAt,
      reviewedAt: '',
      appliedAt: '',
      reviewNote: '',
      field: item.field,
      beforeValue: item.before,
      afterValue: item.after,
      submittedByLabel: item.author,
      summary: `${item.field} · ${item.before} -> ${item.after}`,
    }));
}

function buildDemoPublicationItems(): ObjectWorkspacePublicationSelectionItem[] {
  return mockPublicationCards.map((item) => ({
    publicationId: item.id,
    publicationCode: item.id,
    publicationName: item.title,
    publicationYear: '',
    publicationStatus: item.lane === 'ready' ? 'published' : item.lane === 'layout' ? 'proofing' : 'planning',
    workflowStatus: item.lane === 'ready' ? 'validated_bat' : item.lane === 'layout' ? 'proof_sent' : 'selected',
    pageNumber: String(item.page),
    customPrintText: '',
    proofSentAt: '',
    validatedAt: '',
  }));
}

function normalizeReferenceOption(row: Record<string, unknown>): WorkspaceReferenceOption {
  return {
    id: readString(row.id),
    code: readString(row.code),
    label: readString(row.name, readString(row.code)),
  };
}

function sortReferenceOptions(options: WorkspaceReferenceOption[]): WorkspaceReferenceOption[] {
  return [...options].sort((left, right) => left.label.localeCompare(right.label, 'fr'));
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

  return sortReferenceOptions(normalized);
}

interface AmenityRef {
  id: string;
  code: string;
  label: string;
  familyId: string;
  familyCode: string;
  familyLabel: string;
  disabilityTypes: string[];
  position: number;
}

function normalizeAmenityRef(row: Record<string, unknown>): AmenityRef {
  const familyRecord = readRecord(row.family);
  const extra = readRecord(row.extra);
  return {
    id: readString(row.id),
    code: readString(row.code),
    label: readString(row.name, readString(row.code)),
    familyId: readString(row.family_id),
    familyCode: readString(familyRecord.code, 'misc'),
    familyLabel: readString(familyRecord.name, 'Autres equipements'),
    disabilityTypes: readStringList(extra.disability_types),
    position: toNullableInteger(readString(row.position)) ?? Number.MAX_SAFE_INTEGER,
  };
}

function normalizeLanguageSelection(params: {
  row: Record<string, unknown>;
  languageById: Map<string, WorkspaceReferenceOption>;
  levelById: Map<string, WorkspaceReferenceOption>;
}): ObjectWorkspaceLanguageItem | null {
  const languageId = readString(params.row.language_id);
  const levelId = readString(params.row.level_id);
  const languageRef = params.languageById.get(languageId);
  if (!languageRef) {
    return null;
  }

  const levelRef = params.levelById.get(levelId);
  return {
    languageId,
    code: languageRef.code,
    label: languageRef.label,
    levelId,
    levelCode: levelRef?.code ?? '',
    levelLabel: levelRef?.label ?? '',
  };
}

function buildAmenityGroups(amenities: AmenityRef[], selectedCodes: Set<string>): ObjectWorkspaceAmenityGroup[] {
  const groups = new Map<string, ObjectWorkspaceAmenityGroup>();

  for (const amenity of amenities) {
    const current = groups.get(amenity.familyCode) ?? {
      familyCode: amenity.familyCode,
      familyLabel: amenity.familyLabel,
      options: [],
    };

    const option: ObjectWorkspaceAmenityOption = {
      id: amenity.id,
      code: amenity.code,
      label: amenity.label,
      disabilityTypes: amenity.disabilityTypes,
    };
    current.options.push(option);

    groups.set(amenity.familyCode, current);
  }

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      options: [...group.options].sort((left, right) => left.label.localeCompare(right.label, 'fr')),
    }))
    .sort((left, right) => {
      const leftSelected = left.options.some((option) => selectedCodes.has(option.code));
      const rightSelected = right.options.some((option) => selectedCodes.has(option.code));
      if (leftSelected !== rightSelected) {
        return Number(rightSelected) - Number(leftSelected);
      }
      return left.familyLabel.localeCompare(right.familyLabel, 'fr');
    });
}

async function getObjectWorkspaceCharacteristicsModule(
  objectId: string,
  baseModule: ObjectWorkspaceCharacteristicsModule,
): Promise<ObjectWorkspaceCharacteristicsModule> {
  const session = useSessionStore.getState();
  if (session.demoMode) {
    return baseModule;
  }

  const client = getSupabaseClient();
  if (!client) {
    return {
      ...baseModule,
      unavailableReason: 'Connexion backend indisponible pour charger les caracteristiques.',
    };
  }

  const [
    languageRefsResult,
    languageLevelsResult,
    objectLanguagesResult,
    paymentRefsResult,
    objectPaymentsResult,
    environmentRefsResult,
    objectEnvironmentsResult,
    amenityRefsResult,
    objectAmenitiesResult,
  ] = await Promise.all([
    client.from('ref_language').select('id, code, name, position').order('position', { ascending: true }),
    client.from('ref_code').select('id, code, name, position').eq('domain', 'language_level').order('position', { ascending: true }),
    client.from('object_language').select('language_id, level_id').eq('object_id', objectId),
    client.from('ref_code').select('id, code, name, position').eq('domain', 'payment_method').order('position', { ascending: true }),
    client.from('object_payment_method').select('payment_method_id').eq('object_id', objectId),
    client.from('ref_code').select('id, code, name, position').eq('domain', 'environment_tag').order('position', { ascending: true }),
    client.from('object_environment_tag').select('environment_tag_id').eq('object_id', objectId),
    client.from('ref_amenity').select('id, code, name, extra, family_id, position, family:family_id(code, name)').in('scope', ['object', 'both']).order('position', { ascending: true }),
    client.from('object_amenity').select('amenity_id').eq('object_id', objectId),
  ]);

  if (
    languageRefsResult.error
    || languageLevelsResult.error
    || objectLanguagesResult.error
    || paymentRefsResult.error
    || objectPaymentsResult.error
    || environmentRefsResult.error
    || objectEnvironmentsResult.error
    || amenityRefsResult.error
    || objectAmenitiesResult.error
  ) {
    return {
      ...baseModule,
      unavailableReason: 'Le live actuel ne fournit pas encore un module C1 complet pour ce profil.',
    };
  }

  const languageOptions = dedupeReferenceOptions(
    (languageRefsResult.data ?? []).map((row) => normalizeReferenceOption(row as Record<string, unknown>)),
  );
  const languageLevelOptions = dedupeReferenceOptions(
    (languageLevelsResult.data ?? []).map((row) => normalizeReferenceOption(row as Record<string, unknown>)),
  );
  const languageById = new Map(languageOptions.map((option) => [option.id, option]));
  const levelById = new Map(languageLevelOptions.map((option) => [option.id, option]));
  const selectedLanguages = ((objectLanguagesResult.data ?? []) as Record<string, unknown>[])
    .map((row) => normalizeLanguageSelection({
      row,
      languageById,
      levelById,
    }))
    .filter((item): item is ObjectWorkspaceLanguageItem => item !== null)
    .sort((left, right) => left.label.localeCompare(right.label, 'fr'));

  const paymentOptions = dedupeReferenceOptions(
    (paymentRefsResult.data ?? []).map((row) => normalizeReferenceOption(row as Record<string, unknown>)),
  );
  const paymentById = new Map(paymentOptions.map((option) => [option.id, option.code]));
  const selectedPaymentCodes = Array.from(new Set(
    ((objectPaymentsResult.data ?? []) as Record<string, unknown>[])
      .map((row) => paymentById.get(readString(row.payment_method_id)) ?? '')
      .filter(Boolean),
  )).sort();

  const environmentOptions = dedupeReferenceOptions(
    (environmentRefsResult.data ?? []).map((row) => normalizeReferenceOption(row as Record<string, unknown>)),
  );
  const environmentById = new Map(environmentOptions.map((option) => [option.id, option.code]));
  const selectedEnvironmentCodes = Array.from(new Set(
    ((objectEnvironmentsResult.data ?? []) as Record<string, unknown>[])
      .map((row) => environmentById.get(readString(row.environment_tag_id)) ?? '')
      .filter(Boolean),
  )).sort();

  const amenityRefs = ((amenityRefsResult.data ?? []) as Record<string, unknown>[]).map(normalizeAmenityRef);
  const selectedAmenityCodes = new Set(
    ((objectAmenitiesResult.data ?? []) as Record<string, unknown>[])
      .map((row) => amenityRefs.find((amenity) => amenity.id === readString(row.amenity_id))?.code ?? '')
      .filter(Boolean),
  );

  return {
    languageOptions,
    languageLevelOptions,
    selectedLanguages,
    paymentOptions,
    selectedPaymentCodes,
    environmentOptions,
    selectedEnvironmentCodes,
    amenityGroups: buildAmenityGroups(amenityRefs, selectedAmenityCodes),
    selectedAmenityCodes: Array.from(selectedAmenityCodes).sort(),
    unavailableReason: null,
  };
}

function normalizeCapacityItem(params: {
  row: Record<string, unknown>;
  metricById: Map<string, WorkspaceReferenceOption>;
}): ObjectWorkspaceCapacityItem | null {
  const metricId = readString(params.row.metric_id);
  const metricRef = params.metricById.get(metricId);
  if (!metricRef) {
    return null;
  }

  return {
    recordId: readString(params.row.id) || null,
    metricId,
    metricCode: metricRef.code,
    metricLabel: metricRef.label,
    unit: readString(params.row.unit),
    value: readString(params.row.value_integer),
    effectiveFrom: readString(params.row.effective_from),
    effectiveTo: readString(params.row.effective_to),
  };
}

async function getObjectWorkspaceCapacityPoliciesModule(
  objectId: string,
  baseModule: ObjectWorkspaceCapacityPoliciesModule,
): Promise<ObjectWorkspaceCapacityPoliciesModule> {
  const session = useSessionStore.getState();
  if (session.demoMode) {
    return baseModule;
  }

  const client = getSupabaseClient();
  if (!client) {
    return {
      ...baseModule,
      unavailableReason: 'Connexion backend indisponible pour charger capacites et politiques.',
    };
  }

  const [metricRefsResult, capacitiesResult, groupPolicyResult, petPolicyResult] = await Promise.all([
    client.from('ref_capacity_metric').select('id, code, name, position').order('position', { ascending: true }),
    client.from('object_capacity').select('id, metric_id, value_integer, unit, effective_from, effective_to').eq('object_id', objectId),
    client.from('object_group_policy').select('min_size, max_size, group_only, notes').eq('object_id', objectId).maybeSingle(),
    client.from('object_pet_policy').select('accepted, conditions').eq('object_id', objectId).maybeSingle(),
  ]);

  if (metricRefsResult.error || capacitiesResult.error || groupPolicyResult.error || petPolicyResult.error) {
    return {
      ...baseModule,
      unavailableReason: 'Le live actuel ne fournit pas encore un module C4 complet pour ce profil.',
    };
  }

  const metricOptions = dedupeReferenceOptions(
    (metricRefsResult.data ?? []).map((row) => normalizeReferenceOption(row as Record<string, unknown>)),
  );
  const metricById = new Map(metricOptions.map((option) => [option.id, option]));
  const capacityItems = ((capacitiesResult.data ?? []) as Record<string, unknown>[])
    .map((row) => normalizeCapacityItem({
      row,
      metricById,
    }))
    .filter((item): item is ObjectWorkspaceCapacityItem => item !== null)
    .sort((left, right) => left.metricLabel.localeCompare(right.metricLabel, 'fr'));
  const groupPolicy = readRecord(groupPolicyResult.data);
  const petPolicy = readRecord(petPolicyResult.data);

  return {
    metricOptions,
    capacityItems,
    groupPolicy: {
      minSize: readString(groupPolicy.min_size),
      maxSize: readString(groupPolicy.max_size),
      groupOnly: readBoolean(groupPolicy.group_only),
      notes: readString(groupPolicy.notes),
    },
    petPolicy: {
      accepted: petPolicy.accepted == null ? false : readBoolean(petPolicy.accepted),
      conditions: readString(petPolicy.conditions),
    },
    unavailableReason: null,
  };
}

interface ClassificationSchemeRef {
  id: string;
  code: string;
  label: string;
  description: string;
  selectionMode: 'single' | 'multiple';
  displayGroup: string;
  position: number;
}

interface ClassificationValueRef {
  id: string;
  schemeId: string;
  code: string;
  label: string;
  ordinal: number;
  disabilityType: string | null;
}

function normalizeClassificationSchemeRef(row: Record<string, unknown>): ClassificationSchemeRef {
  const selection = readString(row.selection, 'single');
  return {
    id: readString(row.id),
    code: readString(row.code),
    label: readString(row.name, readString(row.code)),
    description: readString(row.description),
    selectionMode: selection === 'multiple' ? 'multiple' : 'single',
    displayGroup: readString(row.display_group),
    position: toNullableInteger(readString(row.position)) ?? Number.MAX_SAFE_INTEGER,
  };
}

function normalizeClassificationValueRef(row: Record<string, unknown>): ClassificationValueRef {
  const metadata = readRecord(row.metadata);
  return {
    id: readString(row.id),
    schemeId: readString(row.scheme_id),
    code: readString(row.code),
    label: readString(row.name, readString(row.code)),
    ordinal: toNullableInteger(readString(row.ordinal)) ?? Number.MAX_SAFE_INTEGER,
    disabilityType: readString(metadata.disability_type) || null,
  };
}

function isDistinctionClassificationScheme(row: Record<string, unknown>): boolean {
  const displayGroup = readString(row.display_group);
  return row.is_distinction === true && displayGroup !== 'accessibility_labels' && displayGroup !== 'sustainability_labels';
}

function isAccessibilityClassificationScheme(row: Record<string, unknown>): boolean {
  const displayGroup = readString(row.display_group);
  const code = readString(row.code);
  return displayGroup === 'accessibility_labels' || code === 'LBL_TOURISME_HANDICAP';
}

function readDisabilityTypesCovered(
  subvalueIds: unknown,
  valueById: Map<string, ClassificationValueRef>,
): string[] {
  if (!Array.isArray(subvalueIds)) {
    return [];
  }

  const types = subvalueIds
    .map((subvalueId) => valueById.get(readString(subvalueId))?.disabilityType ?? '')
    .filter(Boolean);

  return Array.from(new Set(types)).sort((left, right) => left.localeCompare(right, 'fr'));
}

/**
 * Write mirror of {@link readDisabilityTypesCovered}: resolve the covered disability-type codes
 * (motor/hearing/visual/cognitive) of a LBL_TOURISME_HANDICAP label to the UUIDs of the matching
 * `granted_*` sub-values, scoped to the label's scheme. The sub-values carry
 * `metadata.disability_type` (seeds_data.sql B-2b §3711-3754); we join by (scheme_id,
 * disability_type) so the result is the UUID[] for `object_classification.subvalue_ids` — never
 * hard-coded UUIDs. Codes with no matching sub-value are dropped, the array is de-duplicated, and an
 * empty input clears `subvalue_ids`. Used by {@link saveObjectWorkspaceDistinctions} to close the
 * §10 silent write-trap (CLAUDE.md "Editor — no silent write-traps").
 */
export function buildClassificationSubvalueIds(
  disabilityTypesCovered: readonly string[],
  schemeId: string,
  subvalueRefs: readonly { id: string; schemeId: string; disabilityType: string | null }[],
): string[] {
  const idByType = new Map<string, string>();
  for (const ref of subvalueRefs) {
    if (ref.schemeId === schemeId && ref.disabilityType) {
      idByType.set(ref.disabilityType, ref.id);
    }
  }

  const out: string[] = [];
  const seen = new Set<string>();
  for (const type of disabilityTypesCovered) {
    const id = idByType.get(type);
    if (id && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

function normalizeWorkspaceDistinctionItem(params: {
  row: Record<string, unknown>;
  schemeById: Map<string, ClassificationSchemeRef>;
  valueById: Map<string, ClassificationValueRef>;
}): ObjectWorkspaceDistinctionItem | null {
  const schemeId = readString(params.row.scheme_id);
  const valueId = readString(params.row.value_id);
  const schemeRef = params.schemeById.get(schemeId);
  const valueRef = params.valueById.get(valueId);

  if (!schemeRef || !valueRef) {
    return null;
  }

  return {
    recordId: readString(params.row.id) || null,
    schemeId,
    schemeCode: schemeRef.code,
    schemeLabel: schemeRef.label,
    valueId,
    valueCode: valueRef.code,
    valueLabel: valueRef.label,
    status: readString(params.row.status),
    awardedAt: readString(params.row.awarded_at),
    validUntil: readString(params.row.valid_until),
    disabilityTypesCovered: readDisabilityTypesCovered(params.row.subvalue_ids, params.valueById),
  };
}

function isAccessibilityAmenity(amenity: AmenityRef): boolean {
  return amenity.familyCode === 'accessibility' || amenity.code.startsWith('acc_') || amenity.disabilityTypes.length > 0;
}

interface TaxonomyDomainRef {
  domain: string;
  label: string;
  description: string;
  objectType: string;
  position: number;
}

interface TaxonomyNodeRef {
  id: string;
  domain: string;
  code: string;
  label: string;
  description: string;
  parentId: string | null;
  isAssignable: boolean;
  position: number;
}

function normalizeTaxonomyDomainRef(row: Record<string, unknown>): TaxonomyDomainRef {
  return {
    domain: readString(row.domain),
    label: readString(row.name, readString(row.domain)),
    description: readString(row.description),
    objectType: readString(row.object_type),
    position: toNullableInteger(readString(row.position)) ?? Number.MAX_SAFE_INTEGER,
  };
}

function normalizeTaxonomyNodeRef(row: Record<string, unknown>): TaxonomyNodeRef {
  return {
    id: readString(row.id),
    domain: readString(row.domain),
    code: readString(row.code),
    label: readString(row.name, readString(row.code)),
    description: readString(row.description),
    parentId: readString(row.parent_id) || null,
    isAssignable: row.is_assignable == null ? true : readBoolean(row.is_assignable),
    position: toNullableInteger(readString(row.position)) ?? Number.MAX_SAFE_INTEGER,
  };
}

function computeTaxonomyDepth(
  nodeId: string,
  nodeById: Map<string, TaxonomyNodeRef>,
  cache: Map<string, number>,
): number {
  const cached = cache.get(nodeId);
  if (cached != null) {
    return cached;
  }

  const current = nodeById.get(nodeId);
  if (!current || !current.parentId) {
    cache.set(nodeId, 0);
    return 0;
  }

  const depth = computeTaxonomyDepth(current.parentId, nodeById, cache) + 1;
  cache.set(nodeId, depth);
  return depth;
}

function buildTaxonomyPath(
  nodeId: string,
  nodeById: Map<string, TaxonomyNodeRef>,
): ObjectWorkspaceTaxonomyPathNode[] {
  const path: ObjectWorkspaceTaxonomyPathNode[] = [];
  let cursor = nodeById.get(nodeId) ?? null;

  while (cursor) {
    if (cursor.code !== 'root') {
      path.push({
        id: cursor.id,
        code: cursor.code,
        label: cursor.label,
        description: cursor.description,
        depth: 0,
      });
    }
    cursor = cursor.parentId ? (nodeById.get(cursor.parentId) ?? null) : null;
  }

  return path.reverse().map((node, index) => ({
    ...node,
    depth: index,
  }));
}

function buildTaxonomyNodeOptions(domainNodes: TaxonomyNodeRef[]): ObjectWorkspaceTaxonomyNodeOption[] {
  const nodeById = new Map(domainNodes.map((node) => [node.id, node]));
  const depthCache = new Map<string, number>();

  return domainNodes
    .filter((node) => node.code !== 'root')
    .map((node) => {
      const parent = node.parentId ? (nodeById.get(node.parentId) ?? null) : null;
      return {
        id: node.id,
        code: node.code,
        label: node.label,
        description: node.description,
        parentId: parent?.code === 'root' ? null : node.parentId,
        parentCode: parent && parent.code !== 'root' ? parent.code : null,
        depth: Math.max(0, computeTaxonomyDepth(node.id, nodeById, depthCache) - 1),
        isAssignable: node.isAssignable,
        position: node.position,
      };
    })
    .sort((left, right) => left.position - right.position || left.label.localeCompare(right.label, 'fr'));
}

function normalizeWorkspaceTaxonomyAssignment(params: {
  row: Record<string, unknown>;
  nodeById: Map<string, TaxonomyNodeRef>;
}): ObjectWorkspaceTaxonomyAssignment | null {
  const nodeId = readString(params.row.ref_code_id);
  const node = params.nodeById.get(nodeId);

  if (!node) {
    return null;
  }

  const path = buildTaxonomyPath(nodeId, params.nodeById);

  return {
    recordId: readString(params.row.id) || null,
    nodeId,
    code: node.code,
    label: node.label,
    description: node.description,
    depth: Math.max(0, path.length - 1),
    path,
    updatedAt: readString(params.row.updated_at),
    source: readString(params.row.source),
  };
}

function reconcileTaxonomyAssignment(params: {
  domain: ObjectWorkspaceTaxonomyDomain;
  row?: Record<string, unknown>;
}): ObjectWorkspaceTaxonomyDomain {
  const liveNodeRefs = params.domain.nodes.map((node) => ({
    id: node.id,
    domain: params.domain.domain,
    code: node.code,
    label: node.label,
    description: node.description,
    parentId: node.parentId,
    isAssignable: node.isAssignable,
    position: node.position,
  }));
  const nodeById = new Map(liveNodeRefs.map((node) => [node.id, node]));
  const nodeByCode = new Map(liveNodeRefs.map((node) => [node.code.toLowerCase(), node]));
  const liveAssignment = params.row
    ? normalizeWorkspaceTaxonomyAssignment({
        row: params.row,
        nodeById,
      })
    : null;

  if (liveAssignment) {
    return {
      ...params.domain,
      assignment: liveAssignment,
    };
  }

  const fallback = params.domain.assignment;
  if (!fallback) {
    return params.domain;
  }

  const liveNode = nodeById.get(fallback.nodeId) ?? nodeByCode.get(fallback.code.toLowerCase()) ?? null;
  if (!liveNode) {
    return params.domain;
  }

  const path = buildTaxonomyPath(liveNode.id, nodeById);
  return {
    ...params.domain,
    assignment: {
      ...fallback,
      nodeId: liveNode.id,
      code: liveNode.code,
      label: liveNode.label,
      description: liveNode.description,
      depth: Math.max(0, path.length - 1),
      path,
    },
  };
}

async function getObjectWorkspaceTaxonomyModule(
  objectId: string,
  baseModule: ObjectWorkspaceTaxonomyModule,
): Promise<ObjectWorkspaceTaxonomyModule> {
  const session = useSessionStore.getState();
  if (session.demoMode) {
    return baseModule;
  }

  const client = getSupabaseClient();
  if (!client) {
    return {
      ...baseModule,
      unavailableReason: 'Connexion backend indisponible pour charger la taxonomie structurante.',
    };
  }

  const objectResult = await client
    .from('object')
    .select('object_type')
    .eq('id', objectId)
    .maybeSingle();

  if (objectResult.error) {
    return {
      ...baseModule,
      unavailableReason: 'Le live actuel ne fournit pas encore une taxonomie structurante complete pour ce profil.',
    };
  }

  const objectType = readString((objectResult.data as Record<string, unknown> | null)?.object_type).trim();
  const fallbackByDomain = new Map(baseModule.domains.map((domain) => [domain.domain, domain]));
  const domainRefsResult = await client
    .from('ref_code_domain_registry')
    .select('domain, name, description, object_type, position, is_taxonomy, is_active')
    .eq('is_taxonomy', true)
    .eq('is_active', true)
    .order('position', { ascending: true });

  if (domainRefsResult.error) {
    return {
      ...baseModule,
      unavailableReason: 'Le live actuel ne fournit pas encore une taxonomie structurante complete pour ce profil.',
    };
  }

  const domainRefs = (domainRefsResult.data ?? [])
    .map((row) => row as Record<string, unknown>)
    .map(normalizeTaxonomyDomainRef)
    .filter((domain) => !domain.objectType || domain.objectType === objectType || fallbackByDomain.has(domain.domain))
    .sort((left, right) => left.position - right.position || left.label.localeCompare(right.label, 'fr'));

  const domainCodes = domainRefs.map((domain) => domain.domain);
  const [nodeRefsResult, assignmentsResult] = await Promise.all([
    domainCodes.length > 0
      ? client
          .from('ref_code')
          .select('id, domain, code, name, description, parent_id, is_assignable, position, is_active')
          .in('domain', domainCodes)
          .eq('is_active', true)
          .order('position', { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    client
      .from('object_taxonomy')
      .select('id, domain, ref_code_id, source, note, updated_at')
      .eq('object_id', objectId)
      .order('created_at', { ascending: true }),
  ]);

  if (nodeRefsResult.error || assignmentsResult.error) {
    return {
      ...baseModule,
      unavailableReason: 'Le live actuel ne fournit pas encore une taxonomie structurante complete pour ce profil.',
    };
  }

  const nodeRefs = ((nodeRefsResult.data ?? []) as Record<string, unknown>[]).map(normalizeTaxonomyNodeRef);
  const nodesByDomain = new Map<string, TaxonomyNodeRef[]>();
  for (const node of nodeRefs) {
    const current = nodesByDomain.get(node.domain) ?? [];
    current.push(node);
    nodesByDomain.set(node.domain, current);
  }

  const assignmentRowsByDomain = new Map(
    ((assignmentsResult.data ?? []) as Record<string, unknown>[])
      .map((row) => [readString(row.domain), row] as const),
  );

  return {
    domains: [
      ...domainRefs.map((domainRef) =>
        reconcileTaxonomyAssignment({
          row: assignmentRowsByDomain.get(domainRef.domain),
          domain: {
            domain: domainRef.domain,
            label: domainRef.label,
            description: domainRef.description,
            objectType: domainRef.objectType,
            nodes: buildTaxonomyNodeOptions(nodesByDomain.get(domainRef.domain) ?? []),
            assignment: fallbackByDomain.get(domainRef.domain)?.assignment ?? null,
          },
        })),
      ...baseModule.domains.filter((domain) => !domainCodes.includes(domain.domain)),
    ].sort((left, right) => left.label.localeCompare(right.label, 'fr')),
    unavailableReason: null,
  };
}

async function getObjectWorkspaceDistinctionsModule(
  objectId: string,
  baseModule: ObjectWorkspaceDistinctionsModule,
): Promise<ObjectWorkspaceDistinctionsModule> {
  const session = useSessionStore.getState();
  if (session.demoMode) {
    return baseModule;
  }

  const client = getSupabaseClient();
  if (!client) {
    return {
      ...baseModule,
      unavailableReason: 'Connexion backend indisponible pour charger distinctions et accessibilite.',
    };
  }

  const [
    schemeRefsResult,
    valueRefsResult,
    objectClassificationsResult,
    amenityRefsResult,
    objectAmenitiesResult,
  ] = await Promise.allSettled([
    client
      .from('ref_classification_scheme')
      .select('id, code, name, description, selection, position, display_group, is_distinction')
      .or('is_distinction.eq.true,display_group.eq.accessibility_labels')
      .order('position', { ascending: true }),
    client
      .from('ref_classification_value')
      .select('id, scheme_id, code, name, ordinal, metadata')
      .order('ordinal', { ascending: true }),
    client
      .from('object_classification')
      .select('id, scheme_id, value_id, status, awarded_at, valid_until, subvalue_ids')
      .eq('object_id', objectId)
      .order('created_at', { ascending: true }),
    client
      .from('ref_amenity')
      .select('id, code, name, extra, family_id, position, family:family_id(code, name)')
      .order('position', { ascending: true }),
    client
      .from('object_amenity')
      .select('amenity_id')
      .eq('object_id', objectId),
  ]);

  if (
    schemeRefsResult.status !== 'fulfilled'
    || valueRefsResult.status !== 'fulfilled'
    || objectClassificationsResult.status !== 'fulfilled'
    || schemeRefsResult.value.error
    || valueRefsResult.value.error
    || objectClassificationsResult.value.error
  ) {
    return {
      ...baseModule,
      unavailableReason: 'Le live actuel ne fournit pas encore un module C2 complet pour ce profil.',
    };
  }

  const schemeRows = (schemeRefsResult.value.data ?? []) as Record<string, unknown>[];
  const distinctionSchemes = schemeRows
    .filter(isDistinctionClassificationScheme)
    .map(normalizeClassificationSchemeRef)
    .sort((left, right) => left.position - right.position || left.label.localeCompare(right.label, 'fr'));
  const accessibilitySchemes = schemeRows
    .filter(isAccessibilityClassificationScheme)
    .map(normalizeClassificationSchemeRef)
    .sort((left, right) => left.position - right.position || left.label.localeCompare(right.label, 'fr'));
  const valueRefs = ((valueRefsResult.value.data ?? []) as Record<string, unknown>[])
    .map(normalizeClassificationValueRef);
  const valueById = new Map(valueRefs.map((value) => [value.id, value]));
  const distinctionSchemeById = new Map(distinctionSchemes.map((scheme) => [scheme.id, scheme]));
  const accessibilitySchemeById = new Map(accessibilitySchemes.map((scheme) => [scheme.id, scheme]));

  const distinctionItemsBySchemeId = new Map<string, ObjectWorkspaceDistinctionItem[]>();
  const accessibilityLabels: ObjectWorkspaceDistinctionItem[] = [];

  for (const row of (objectClassificationsResult.value.data ?? []) as Record<string, unknown>[]) {
    const schemeId = readString(row.scheme_id);

    if (distinctionSchemeById.has(schemeId)) {
      const item = normalizeWorkspaceDistinctionItem({
        row,
        schemeById: distinctionSchemeById,
        valueById,
      });
      if (!item) {
        continue;
      }

      const current = distinctionItemsBySchemeId.get(schemeId) ?? [];
      current.push(item);
      distinctionItemsBySchemeId.set(schemeId, current);
      continue;
    }

    if (accessibilitySchemeById.has(schemeId)) {
      const item = normalizeWorkspaceDistinctionItem({
        row,
        schemeById: accessibilitySchemeById,
        valueById,
      });
      if (item) {
        accessibilityLabels.push(item);
      }
    }
  }

  const distinctionGroups: ObjectWorkspaceDistinctionGroup[] = distinctionSchemes
    .map((scheme) => ({
      schemeCode: scheme.code,
      schemeLabel: scheme.label,
      items: (distinctionItemsBySchemeId.get(scheme.id) ?? []).sort((left, right) =>
        left.valueLabel.localeCompare(right.valueLabel, 'fr'),
      ),
    }))
    .filter((group) => group.items.length > 0);

  const allDistinctionSchemesForOptions = [...distinctionSchemes, ...accessibilitySchemes];
  const schemeOptions: ObjectWorkspaceDistinctionSchemeOption[] = allDistinctionSchemesForOptions.map((scheme) => ({
    id: scheme.id,
    code: scheme.code,
    label: scheme.label,
    selectionMode: scheme.selectionMode,
    isAccessibility: accessibilitySchemes.some((s) => s.id === scheme.id),
    valueOptions: valueRefs
      .filter((value) => value.schemeId === scheme.id)
      .sort((left, right) => left.ordinal - right.ordinal || left.label.localeCompare(right.label, 'fr'))
      .map((value) => ({ id: value.id, code: value.code, label: value.label })),
  }));

  let accessibilityAmenityCoverage: ObjectWorkspaceAccessibilityAmenityItem[] = [];
  let unavailableReason: string | null = null;

  if (
    amenityRefsResult.status === 'fulfilled'
    && objectAmenitiesResult.status === 'fulfilled'
    && amenityRefsResult.value.error == null
    && objectAmenitiesResult.value.error == null
  ) {
    const amenityRefs = ((amenityRefsResult.value.data ?? []) as Record<string, unknown>[])
      .map(normalizeAmenityRef);
    const amenityById = new Map(amenityRefs.map((amenity) => [amenity.id, amenity]));
    const selectedAmenities = ((objectAmenitiesResult.value.data ?? []) as Record<string, unknown>[])
      .map((row) => amenityById.get(readString(row.amenity_id)) ?? null)
      .filter((amenity): amenity is AmenityRef => amenity !== null)
      .filter(isAccessibilityAmenity);

    accessibilityAmenityCoverage = Array.from(
      new Map(
        selectedAmenities.map((amenity) => [amenity.code, {
          code: amenity.code,
          label: amenity.label,
          disabilityTypes: amenity.disabilityTypes,
        } satisfies ObjectWorkspaceAccessibilityAmenityItem]),
      ).values(),
    ).sort((left, right) => left.label.localeCompare(right.label, 'fr'));
  } else {
    unavailableReason = "La couverture accessibilite par equipements n'est pas encore lisible dans le live actuel.";
  }

  return {
    distinctionGroups,
    accessibilityLabels: accessibilityLabels.sort((left, right) =>
      left.schemeLabel.localeCompare(right.schemeLabel, 'fr')
      || left.valueLabel.localeCompare(right.valueLabel, 'fr'),
    ),
    accessibilityAmenityCoverage,
    schemeOptions,
    unavailableReason,
  };
}

function normalizeWorkspaceMediaItem(params: {
  row: Record<string, unknown>;
  typeById: Map<string, WorkspaceReferenceOption>;
  tagsByMediaId: Map<string, string[]>;
  placeLabelById: Map<string, string>;
}): ObjectWorkspaceMediaItem {
  const placeId = readString(params.row.place_id) || null;
  const typeId = readString(params.row.media_type_id);
  const typeRef = params.typeById.get(typeId);

  return {
    id: readString(params.row.id),
    scope: placeId ? 'place' : 'object',
    placeId,
    scopeLabel: placeId ? params.placeLabelById.get(placeId) ?? 'Sous-lieu' : 'Objet principal',
    typeId,
    typeCode: typeRef?.code ?? '',
    typeLabel: typeRef?.label ?? '',
    title: readString(params.row.title),
    titleTranslations: readRecord(params.row.title_i18n) as Record<string, string>,
    description: readString(params.row.description),
    descriptionTranslations: readRecord(params.row.description_i18n) as Record<string, string>,
    url: readString(params.row.url),
    credit: readString(params.row.credit),
    visibility: readString(params.row.visibility, 'public'),
    position: readString(params.row.position),
    width: readString(params.row.width),
    height: readString(params.row.height),
    rightsExpiresAt: readString(params.row.rights_expires_at),
    kind: readString(params.row.kind),
    isMain: params.row.is_main == null ? false : params.row.is_main === true,
    isPublished: params.row.is_published == null ? true : params.row.is_published === true,
    tags: params.tagsByMediaId.get(readString(params.row.id)) ?? [],
  };
}

async function getObjectWorkspaceMediaModule(
  objectId: string,
  baseModule: ObjectWorkspaceMediaModule,
  placeLabelById: Map<string, string>,
): Promise<ObjectWorkspaceMediaModule> {
  const session = useSessionStore.getState();
  if (session.demoMode) {
    return {
      ...baseModule,
      typeOptions: [
        { id: 'demo-photo', code: 'photo', label: 'Photo' },
        { id: 'demo-video', code: 'video', label: 'Video' },
      ],
      tagOptions: [
        { id: 'demo-prefere', code: 'prefere', label: 'Prefere' },
        { id: 'demo-hero', code: 'hero', label: 'Hero' },
      ],
    };
  }

  const client = getSupabaseClient();
  if (!client) {
    return {
      ...baseModule,
      placeScopeUnavailableReason: 'Connexion backend indisponible pour charger le module media.',
    };
  }

  const placeIds = Array.from(placeLabelById.keys());
  const [objectMediaResult, placeMediaResult, mediaTypeResult, tagRefResult] = await Promise.allSettled([
    client
      .from('media')
      .select('id, object_id, place_id, media_type_id, title, title_i18n, description, description_i18n, credit, url, is_main, is_published, position, rights_expires_at, visibility, width, height, kind')
      .eq('object_id', objectId)
      .order('is_main', { ascending: false })
      .order('position', { ascending: true }),
    placeIds.length > 0
      ? client
          .from('media')
          .select('id, object_id, place_id, media_type_id, title, title_i18n, description, description_i18n, credit, url, is_main, is_published, position, rights_expires_at, visibility, width, height, kind')
          .in('place_id', placeIds)
          .order('position', { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    client.from('ref_code').select('id, code, name').eq('domain', 'media_type').order('position', { ascending: true }),
    client.from('ref_code').select('id, code, name').eq('domain', 'media_tag').order('position', { ascending: true }),
  ]);

  const typeOptions =
    mediaTypeResult.status === 'fulfilled' && mediaTypeResult.value.error == null
      ? (mediaTypeResult.value.data ?? []).map((row) => normalizeReferenceOption(row as Record<string, unknown>))
      : baseModule.typeOptions;

  const tagOptions =
    tagRefResult.status === 'fulfilled' && tagRefResult.value.error == null
      ? (tagRefResult.value.data ?? []).map((row) => normalizeReferenceOption(row as Record<string, unknown>))
      : baseModule.tagOptions;

  const mediaRows = [
    ...(objectMediaResult.status === 'fulfilled' && objectMediaResult.value.error == null ? objectMediaResult.value.data ?? [] : []),
    ...(placeMediaResult.status === 'fulfilled' && placeMediaResult.value.error == null ? placeMediaResult.value.data ?? [] : []),
  ] as Record<string, unknown>[];

  const mediaIds = mediaRows.map((row) => readString(row.id)).filter(Boolean);
  const tagLinksResult = mediaIds.length > 0
    ? await client.from('media_tag').select('media_id, tag_id').in('media_id', mediaIds)
    : { data: [], error: null };

  const typeById = new Map(typeOptions.map((option) => [option.id, option]));
  const tagById = new Map(tagOptions.map((option) => [option.id, option]));
  const tagsByMediaId = new Map<string, string[]>();

  if (tagLinksResult.error == null) {
    for (const link of (tagLinksResult.data ?? []) as Record<string, unknown>[]) {
      const mediaId = readString(link.media_id);
      const tagId = readString(link.tag_id);
      const tagCode = tagById.get(tagId)?.code;
      if (!mediaId || !tagCode) {
        continue;
      }

      const current = tagsByMediaId.get(mediaId) ?? [];
      if (!current.includes(tagCode)) {
        current.push(tagCode);
      }
      tagsByMediaId.set(mediaId, current);
    }
  }

  const normalizedMedia = mediaRows.map((row) =>
    normalizeWorkspaceMediaItem({
      row,
      typeById,
      tagsByMediaId,
      placeLabelById,
    }),
  );

  const placeScopeUnavailableReason =
    placeMediaResult.status === 'fulfilled' && placeMediaResult.value.error == null
      ? null
      : 'Les medias de sous-lieu ne sont pas exposes completement par le live actuel.';

  return {
    ...baseModule,
    typeOptions,
    tagOptions,
    objectItems: normalizedMedia
      .filter((item) => item.scope === 'object')
      .sort((left, right) => Number(left.position || 0) - Number(right.position || 0)),
    placeItems: normalizedMedia
      .filter((item) => item.scope === 'place')
      .sort((left, right) => Number(left.position || 0) - Number(right.position || 0)),
    placeScopeUnavailableReason,
  };
}

function normalizeWorkspaceContactItem(params: {
  row: Record<string, unknown>;
  kindById: Map<string, WorkspaceReferenceOption>;
  roleById: Map<string, WorkspaceReferenceOption>;
}): ObjectWorkspaceContactItem {
  const kindId = readString(params.row.kind_id);
  const roleId = readString(params.row.role_id);
  const kindRef = params.kindById.get(kindId);
  const roleRef = params.roleById.get(roleId);

  return {
    id: readString(params.row.id),
    kindId,
    kindCode: kindRef?.code ?? '',
    kindLabel: kindRef?.label ?? 'Contact',
    roleId,
    roleCode: roleRef?.code ?? '',
    roleLabel: roleRef?.label ?? '',
    value: readString(params.row.value),
    isPublic: params.row.is_public == null ? true : params.row.is_public === true,
    isPrimary: params.row.is_primary === true,
    position: readString(params.row.position),
  };
}

async function getObjectWorkspaceContactsModule(
  objectId: string,
  baseModule: ObjectWorkspaceContactsModule,
): Promise<ObjectWorkspaceContactsModule> {
  const session = useSessionStore.getState();
  if (session.demoMode) {
    return {
      ...baseModule,
      kindOptions: [
        { id: 'demo-phone', code: 'phone', label: 'Telephone' },
        { id: 'demo-email', code: 'email', label: 'Email' },
        { id: 'demo-website', code: 'website', label: 'Site web' },
      ],
      roleOptions: [
        { id: 'demo-accueil', code: 'accueil', label: 'Accueil' },
      ],
    };
  }

  const client = getSupabaseClient();
  if (!client) {
    return baseModule;
  }

  const [contactsResult, kindRefsResult, roleRefsResult] = await Promise.all([
    client.from('contact_channel').select('id, kind_id, value, role_id, is_public, is_primary, position').eq('object_id', objectId).order('is_primary', { ascending: false }).order('position', { ascending: true }),
    client.from('ref_code').select('id, code, name').eq('domain', 'contact_kind').order('position', { ascending: true }),
    client.from('ref_contact_role').select('id, code, name').order('position', { ascending: true }),
  ]);

  if (contactsResult.error || kindRefsResult.error || roleRefsResult.error) {
    return baseModule;
  }

  const kindOptions = (kindRefsResult.data ?? []).map((row) => normalizeReferenceOption(row as Record<string, unknown>));
  const roleOptions = (roleRefsResult.data ?? []).map((row) => normalizeReferenceOption(row as Record<string, unknown>));
  const kindById = new Map(kindOptions.map((option) => [option.id, option]));
  const roleById = new Map(roleOptions.map((option) => [option.id, option]));

  return {
    ...baseModule,
    kindOptions,
    roleOptions,
    objectItems: (contactsResult.data ?? []).map((row) =>
      normalizeWorkspaceContactItem({
        row: row as Record<string, unknown>,
        kindById,
        roleById,
      }),
    ),
  };
}

async function getObjectWorkspaceRelationshipsModule(
  _objectId: string,
  baseModule: ObjectWorkspaceRelationshipsModule,
): Promise<ObjectWorkspaceRelationshipsModule> {
  const session = useSessionStore.getState();

  if (session.demoMode) {
    return {
      ...baseModule,
      organizationLinkWriteUnavailableReason: 'Le module D2 est visible dans le shell, mais son edition n est pas encore branchee sur un contrat workspace stable.',
      actorWriteUnavailableReason: 'Le module D2 reste non editable tant que la gestion acteur/contact n a pas de write-path workspace fiable.',
      actorConsentUnavailableReason: "Les consentements d'acteurs ne sont pas exposes dans le workspace objet actuel.",
      relatedObjectWriteUnavailableReason: null,
    };
  }

  return {
    ...baseModule,
    organizationLinkWriteUnavailableReason: "Les rattachements `object_org_link` restent en lecture seule: le live actuel n'expose pas de write-path workspace pour ce module.",
    actorWriteUnavailableReason: "Les roles acteur et leurs canaux restent en lecture seule: `actor_object_role` et `actor_channel` ne sont pas gerables proprement depuis le client workspace.",
    actorConsentUnavailableReason: "Les consentements `actor_consent` ne sont pas lisibles pour ce contexte de travail et restent hors du module D2.",
    relatedObjectWriteUnavailableReason: null,
  };
}

function normalizeWorkspacePricePeriod(row: Record<string, unknown>): ObjectWorkspacePricePeriod {
  return {
    recordId: readString(row.id) || null,
    startDate: readString(row.start_date),
    endDate: readString(row.end_date),
    startTime: readString(row.start_time),
    endTime: readString(row.end_time),
    note: readString(row.note),
  };
}

function normalizeWorkspacePriceItem(params: {
  row: Record<string, unknown>;
  kindById: Map<string, WorkspaceReferenceOption>;
  unitById: Map<string, WorkspaceReferenceOption>;
  periodsByPriceId: Map<string, ObjectWorkspacePricePeriod[]>;
}): ObjectWorkspacePriceItem {
  const kindId = readString(params.row.kind_id);
  const unitId = readString(params.row.unit_id);
  const kindRef = params.kindById.get(kindId);
  const unitRef = params.unitById.get(unitId);
  const recordId = readString(params.row.id);

  return {
    recordId: recordId || null,
    kindId,
    kindCode: kindRef?.code ?? '',
    kindLabel: kindRef?.label ?? 'Tarif',
    unitId,
    unitCode: unitRef?.code ?? '',
    unitLabel: unitRef?.label ?? '',
    amount: readString(params.row.amount),
    amountMax: readString(params.row.amount_max),
    currency: readString(params.row.currency, 'EUR'),
    seasonCode: readString(params.row.season_code),
    indicationCode: readString(params.row.indication_code),
    ageMinEnfant: readString(params.row.age_min_enfant),
    ageMaxEnfant: readString(params.row.age_max_enfant),
    ageMinJunior: readString(params.row.age_min_junior),
    ageMaxJunior: readString(params.row.age_max_junior),
    validFrom: readString(params.row.valid_from),
    validTo: readString(params.row.valid_to),
    conditions: readString(params.row.conditions),
    source: readString(params.row.source),
    periods: params.periodsByPriceId.get(recordId) ?? [],
  };
}

function normalizeWorkspaceDiscountItem(row: Record<string, unknown>): ObjectWorkspaceDiscountItem {
  return {
    recordId: readString(row.id) || null,
    conditions: readString(row.conditions),
    discountPercent: readString(row.discount_percent),
    discountAmount: readString(row.discount_amount),
    currency: readString(row.currency),
    minGroupSize: readString(row.min_group_size),
    maxGroupSize: readString(row.max_group_size),
    validFrom: readString(row.valid_from),
    validTo: readString(row.valid_to),
    source: readString(row.source),
  };
}

function normalizePromotionSummary(row: Record<string, unknown>): ObjectWorkspacePromotionSummary {
  const promotion = readRecord(row.promotion);

  return {
    promotionId: readString(row.promotion_id, readString(promotion.id)),
    code: readString(promotion.code),
    name: readString(promotion.name, readString(promotion.code, 'Promotion')),
    discountType: readString(promotion.discount_type),
    discountValue: readString(promotion.discount_value),
    currency: readString(promotion.currency),
    validFrom: readString(promotion.valid_from),
    validTo: readString(promotion.valid_to),
    isActive: promotion.is_active === true,
    isPublic: promotion.is_public == null ? true : promotion.is_public === true,
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
      return 'Adhesion arretee';
    default:
      return 'Suivi adhesion interne';
  }
}

function normalizeMembershipScopeOption(params: {
  orgObjectId: string;
  label: string;
  isPrimary: boolean;
}): ObjectWorkspaceMembershipScopeOption {
  return {
    orgObjectId: params.orgObjectId,
    label: params.label,
    isPrimary: params.isPrimary,
  };
}

function normalizeWorkspaceMembershipItem(params: {
  row: Record<string, unknown>;
  objectId: string;
  campaignById: Map<string, WorkspaceReferenceOption>;
  tierById: Map<string, WorkspaceReferenceOption>;
  orgLabelById: Map<string, string>;
}): ObjectWorkspaceMembershipItem {
  const campaignId = readString(params.row.campaign_id);
  const tierId = readString(params.row.tier_id);
  const campaignRef = params.campaignById.get(campaignId);
  const tierRef = params.tierById.get(tierId);
  const orgObjectId = readString(params.row.org_object_id);
  const objectId = readString(params.row.object_id);
  const status = readString(params.row.status, 'prospect');

  return {
    recordId: readString(params.row.id) || null,
    scope: objectId ? 'object' : 'organization',
    orgObjectId,
    orgLabel: params.orgLabelById.get(orgObjectId) ?? 'Organisation',
    campaignId,
    campaignCode: campaignRef?.code ?? '',
    campaignLabel: campaignRef?.label ?? 'Adhesion',
    tierId,
    tierCode: tierRef?.code ?? '',
    tierLabel: tierRef?.label ?? 'Standard',
    status,
    startsAt: readString(params.row.starts_at),
    endsAt: readString(params.row.ends_at),
    paymentDate: readString(params.row.payment_date),
    metadataJson: stringifyLegalValue(params.row.metadata),
    visibilityImpact: deriveMembershipVisibilityImpact(status),
  };
}

function membershipStatusRank(status: string): number {
  switch (status.trim().toLowerCase()) {
    case 'paid':
      return 0;
    case 'invoiced':
      return 1;
    case 'prospect':
      return 2;
    case 'lapsed':
      return 3;
    case 'canceled':
      return 4;
    default:
      return 5;
  }
}

function sortMembershipItems(items: ObjectWorkspaceMembershipItem[]): ObjectWorkspaceMembershipItem[] {
  return [...items].sort((left, right) =>
    membershipStatusRank(left.status) - membershipStatusRank(right.status)
    || Number(right.scope === 'object') - Number(left.scope === 'object')
    || right.endsAt.localeCompare(left.endsAt, 'fr')
    || right.startsAt.localeCompare(left.startsAt, 'fr')
    || left.campaignLabel.localeCompare(right.campaignLabel, 'fr'),
  );
}

async function getObjectWorkspaceMembershipModule(
  objectId: string,
  detail: ObjectDetail,
  baseModule: ObjectWorkspaceMembershipModule,
): Promise<ObjectWorkspaceMembershipModule> {
  const session = useSessionStore.getState();
  if (session.demoMode) {
    return baseModule;
  }

  const client = getSupabaseClient();
  if (!client) {
    return {
      ...baseModule,
      unavailableReason: 'Connexion backend indisponible pour charger les adhesions.',
    };
  }

  const linkedOrgResult = await client
    .from('object_org_link')
    .select('org_object_id, is_primary')
    .eq('object_id', objectId);

  if (linkedOrgResult.error) {
    return {
      ...baseModule,
      unavailableReason: 'Le live actuel ne fournit pas encore les rattachements ORG necessaires au module D3.',
    };
  }

  const linkedOrgRows = (linkedOrgResult.data ?? []) as Record<string, unknown>[];
  const linkedOrgIds = linkedOrgRows.map((row) => readString(row.org_object_id)).filter(Boolean);
  const scopeOrgIds = Array.from(new Set([
    ...(detail.type === 'ORG' ? [objectId] : []),
    ...linkedOrgIds,
  ]));

  const [campaignRefsResult, tierRefsResult, directMembershipsResult, orgMembershipsResult] = await Promise.all([
    client.from('ref_code').select('id, code, name').eq('domain', 'membership_campaign').order('name', { ascending: true }),
    client.from('ref_code').select('id, code, name').eq('domain', 'membership_tier').order('name', { ascending: true }),
    client
      .from('object_membership')
      .select('id, org_object_id, object_id, campaign_id, tier_id, status, starts_at, ends_at, payment_date, metadata')
      .eq('object_id', objectId)
      .order('starts_at', { ascending: false }),
    scopeOrgIds.length > 0
      ? client
          .from('object_membership')
          .select('id, org_object_id, object_id, campaign_id, tier_id, status, starts_at, ends_at, payment_date, metadata')
          .in('org_object_id', scopeOrgIds)
          .is('object_id', null)
          .order('starts_at', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (campaignRefsResult.error || tierRefsResult.error || directMembershipsResult.error || orgMembershipsResult.error) {
    return {
      ...baseModule,
      unavailableReason: 'Le live actuel ne fournit pas encore un module D3 complet pour ce profil.',
    };
  }

  const membershipRows = [
    ...((directMembershipsResult.data ?? []) as Record<string, unknown>[]),
    ...((orgMembershipsResult.data ?? []) as Record<string, unknown>[]),
  ];
  const orgIdsFromRows = membershipRows.map((row) => readString(row.org_object_id)).filter(Boolean);
  const allOrgIds = Array.from(new Set([...scopeOrgIds, ...orgIdsFromRows]));

  const orgObjectsResult = allOrgIds.length > 0
    ? await client.from('object').select('id, name').in('id', allOrgIds)
    : { data: [], error: null };

  if (orgObjectsResult.error) {
    return {
      ...baseModule,
      unavailableReason: "Les libelles d'organisation ne sont pas encore tous lisibles pour le module D3.",
    };
  }

  const campaignOptions = dedupeReferenceOptions(
    ((campaignRefsResult.data ?? []) as Record<string, unknown>[]).map((row) => normalizeReferenceOption(row)),
  );
  const tierOptions = dedupeReferenceOptions(
    ((tierRefsResult.data ?? []) as Record<string, unknown>[]).map((row) => normalizeReferenceOption(row)),
  );
  const campaignById = new Map(campaignOptions.map((option) => [option.id, option]));
  const tierById = new Map(tierOptions.map((option) => [option.id, option]));
  const orgLabelById = new Map(
    ((orgObjectsResult.data ?? []) as Record<string, unknown>[]).map((row) => [readString(row.id), readString(row.name, readString(row.id))]),
  );

  const primaryOrgIds = new Set(
    linkedOrgRows
      .filter((row) => row.is_primary === true)
      .map((row) => readString(row.org_object_id))
      .filter(Boolean),
  );

  const scopeOptions = allOrgIds
    .map((orgId) => normalizeMembershipScopeOption({
      orgObjectId: orgId,
      label: orgLabelById.get(orgId) ?? (orgId === objectId ? detail.name : orgId),
      isPrimary: primaryOrgIds.has(orgId) || (detail.type === 'ORG' && orgId === objectId),
    }))
    .sort((left, right) =>
      Number(right.isPrimary) - Number(left.isPrimary)
      || left.label.localeCompare(right.label, 'fr'),
    );

  return {
    campaignOptions,
    tierOptions,
    scopeOptions,
    items: sortMembershipItems(membershipRows.map((row) => normalizeWorkspaceMembershipItem({
      row,
      objectId,
      campaignById,
      tierById,
      orgLabelById,
    }))),
    unavailableReason: null,
  };
}

function stringifyLegalValue(value: unknown): string {
  if (value == null) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value) || (value && typeof value === 'object')) {
    return JSON.stringify(value, null, 2);
  }

  return '';
}

function normalizeLegalTypeOption(row: Record<string, unknown>): ObjectWorkspaceLegalTypeOption {
  return {
    id: readString(row.id),
    code: readString(row.code),
    label: readString(row.name, readString(row.code)),
    category: readString(row.category),
    isPublic: readBoolean(row.is_public),
    isRequired: readBoolean(row.is_required),
  };
}

function normalizeWorkspaceLegalRecord(
  row: Record<string, unknown>,
  typeByCode: Map<string, ObjectWorkspaceLegalTypeOption>,
): ObjectWorkspaceLegalRecord {
  const type = readRecord(row.type);
  const typeCode = readString(type.code, readString(row.type_code));
  const typeRef = typeByCode.get(typeCode.toLowerCase());

  return {
    recordId: readString(row.id) || null,
    typeId: typeRef?.id ?? readString(type.id),
    typeCode,
    typeLabel: typeRef?.label ?? readString(type.name, typeCode),
    category: typeRef?.category ?? readString(type.category),
    isPublic: typeRef?.isPublic ?? readBoolean(type.is_public),
    isRequired: typeRef?.isRequired ?? readBoolean(type.is_required),
    valueJson: stringifyLegalValue(row.value),
    documentId: readString(row.document_id),
    validFrom: readString(row.valid_from),
    validTo: readString(row.valid_to),
    validityMode: readString(row.validity_mode, 'fixed_end_date'),
    status: readString(row.status, 'active'),
    documentRequestedAt: readString(row.document_requested_at),
    documentDeliveredAt: readString(row.document_delivered_at),
    note: readString(row.note),
    daysUntilExpiry: readString(row.days_until_expiry),
  };
}

function normalizeWorkspaceLegalComplianceDetail(row: Record<string, unknown>): ObjectWorkspaceLegalComplianceDetail {
  return {
    typeCode: readString(row.type_code),
    typeLabel: readString(row.type_name, readString(row.type_code)),
    category: readString(row.category),
    isRequired: readBoolean(row.is_required),
    hasRecord: readBoolean(row.has_record),
    isValid: readBoolean(row.is_valid),
    status: readString(row.status, 'missing'),
    validTo: readString(row.valid_to),
    daysUntilExpiry: readString(row.days_until_expiry),
  };
}

function normalizeWorkspaceLegalComplianceSummary(value: unknown): ObjectWorkspaceLegalComplianceSummary {
  const record = readRecord(value);
  const summary = readRecord(record.summary);

  return {
    complianceStatus: readString(record.compliance_status, 'unknown'),
    requiredCount: toNullableInteger(readString(summary.required_count)) ?? 0,
    validCount: toNullableInteger(readString(summary.valid_count)) ?? 0,
    expiringCount: toNullableInteger(readString(summary.expiring_count)) ?? 0,
    missingCount: toNullableInteger(readString(summary.missing_count)) ?? 0,
    compliancePercentage: toNullableNumber(readString(summary.compliance_percentage)) ?? 0,
    details: Array.isArray(record.details)
      ? (record.details as unknown[]).map((entry) => normalizeWorkspaceLegalComplianceDetail(readRecord(entry)))
      : [],
  };
}

async function getObjectWorkspaceLegalModule(
  objectId: string,
  baseModule: ObjectWorkspaceLegalModule,
): Promise<ObjectWorkspaceLegalModule> {
  const session = useSessionStore.getState();
  if (session.demoMode) {
    return baseModule;
  }

  const client = getSupabaseClient();
  const apiClient = getApiClient();
  if (!client || !apiClient) {
    return {
      ...baseModule,
      unavailableReason: 'Connexion backend indisponible pour charger la conformite juridique.',
    };
  }

  const [typeRefsResult, legalDataResult, complianceResult] = await Promise.allSettled([
    client
      .from('ref_legal_type')
      .select('id, code, name, category, is_public, is_required')
      .order('is_required', { ascending: false })
      .order('category', { ascending: true })
      .order('name', { ascending: true }),
    apiClient.schema('api').rpc('get_object_legal_data', {
      p_object_id: objectId,
    }),
    apiClient.schema('api').rpc('get_object_legal_compliance', {
      p_object_id: objectId,
    }),
  ]);

  if (
    typeRefsResult.status !== 'fulfilled'
    || legalDataResult.status !== 'fulfilled'
    || typeRefsResult.value.error
    || legalDataResult.value.error
  ) {
    return {
      ...baseModule,
      unavailableReason: 'Le live actuel ne fournit pas encore un module D6 exploitable pour ce profil.',
    };
  }

  const typeOptions = dedupeReferenceOptions(
    (typeRefsResult.value.data ?? []).map((row) => normalizeReferenceOption(row as Record<string, unknown>)),
  ).map((option) => {
    const source = ((typeRefsResult.value.data ?? []) as Record<string, unknown>[])
      .map(normalizeLegalTypeOption)
      .find((item) => item.code === option.code);
    return source ?? {
      id: option.id,
      code: option.code,
      label: option.label,
      category: '',
      isPublic: false,
      isRequired: false,
    };
  });
  const typeByCode = new Map(typeOptions.map((option) => [option.code.toLowerCase(), option]));
  const records = Array.isArray(legalDataResult.value.data)
    ? (legalDataResult.value.data as unknown[]).map((entry) =>
        normalizeWorkspaceLegalRecord(readRecord(entry), typeByCode),
      )
    : [];

  const compliance =
    complianceResult.status === 'fulfilled' && complianceResult.value.error == null
      ? normalizeWorkspaceLegalComplianceSummary(complianceResult.value.data)
      : baseModule.compliance;

  return {
    typeOptions,
    records,
    compliance,
    unavailableReason:
      complianceResult.status === 'fulfilled' && complianceResult.value.error == null
        ? null
        : 'Le resume de conformite n est pas completement expose pour ce profil.',
  };
}

async function getObjectWorkspacePricingModule(
  objectId: string,
  baseModule: ObjectWorkspacePricingModule,
): Promise<ObjectWorkspacePricingModule> {
  const session = useSessionStore.getState();
  if (session.demoMode) {
    return baseModule;
  }

  const client = getSupabaseClient();
  if (!client) {
    return {
      ...baseModule,
      unavailableReason: 'Connexion backend indisponible pour charger les tarifs.',
      promotionsUnavailableReason: 'Connexion backend indisponible pour charger les promotions liees.',
    };
  }

  const [kindRefsResult, unitRefsResult, pricesResult, discountsResult, promotionsResult] = await Promise.allSettled([
    client.from('ref_code').select('id, code, name, position').eq('domain', 'price_kind').order('position', { ascending: true }),
    client.from('ref_code').select('id, code, name, position').eq('domain', 'price_unit').order('position', { ascending: true }),
    client
      .from('object_price')
      .select('id, kind_id, unit_id, amount, amount_max, currency, season_code, indication_code, age_min_enfant, age_max_enfant, age_min_junior, age_max_junior, valid_from, valid_to, conditions, source')
      .eq('object_id', objectId)
      .order('valid_from', { ascending: true }),
    client
      .from('object_discount')
      .select('id, conditions, discount_percent, discount_amount, currency, min_group_size, max_group_size, valid_from, valid_to, source')
      .eq('object_id', objectId)
      .order('valid_from', { ascending: true }),
    client
      .from('promotion_object')
      .select('promotion_id, promotion:promotion_id(id, code, name, discount_type, discount_value, currency, valid_from, valid_to, is_active, is_public)')
      .eq('object_id', objectId),
  ]);

  if (
    kindRefsResult.status !== 'fulfilled'
    || unitRefsResult.status !== 'fulfilled'
    || pricesResult.status !== 'fulfilled'
    || kindRefsResult.value.error
    || unitRefsResult.value.error
    || pricesResult.value.error
  ) {
    return {
      ...baseModule,
      unavailableReason: 'Le live actuel ne fournit pas encore un module C5 exploitable pour ce profil.',
    };
  }

  const priceRows = (pricesResult.value.data ?? []) as Record<string, unknown>[];
  const priceIds = priceRows.map((row) => readString(row.id)).filter(Boolean);
  const periodsResult = priceIds.length > 0
    ? await client
        .from('object_price_period')
        .select('id, price_id, start_date, end_date, start_time, end_time, note')
        .in('price_id', priceIds)
        .order('start_date', { ascending: true })
    : { data: [], error: null };

  const kindOptions = dedupeReferenceOptions(
    (kindRefsResult.value.data ?? []).map((row) => normalizeReferenceOption(row as Record<string, unknown>)),
  );
  const unitOptions = dedupeReferenceOptions(
    (unitRefsResult.value.data ?? []).map((row) => normalizeReferenceOption(row as Record<string, unknown>)),
  );
  const kindById = new Map(kindOptions.map((option) => [option.id, option]));
  const unitById = new Map(unitOptions.map((option) => [option.id, option]));
  const periodsByPriceId = new Map<string, ObjectWorkspacePricePeriod[]>();

  if (periodsResult.error == null) {
    for (const row of (periodsResult.data ?? []) as Record<string, unknown>[]) {
      const priceId = readString(row.price_id);
      const current = periodsByPriceId.get(priceId) ?? [];
      current.push(normalizeWorkspacePricePeriod(row));
      periodsByPriceId.set(priceId, current);
    }
  }

  const promotionsUnavailableReason =
    promotionsResult.status === 'fulfilled' && promotionsResult.value.error == null
      ? null
      : 'Les promotions liees restent en lecture seule ou non exposees pour ce profil.';
  const unavailableReason =
    discountsResult.status === 'fulfilled' && discountsResult.value.error == null
      ? periodsResult.error == null ? null : 'Les periodes tarifaires detaillees ne sont pas completement lisibles depuis le live.'
      : 'Les remises bornees ne sont pas completement lisibles depuis le live actuel.';

  return {
    priceKindOptions: kindOptions,
    priceUnitOptions: unitOptions,
    prices: priceRows.map((row) => normalizeWorkspacePriceItem({
      row,
      kindById,
      unitById,
      periodsByPriceId,
    })),
    discounts:
      discountsResult.status === 'fulfilled' && discountsResult.value.error == null
        ? ((discountsResult.value.data ?? []) as Record<string, unknown>[]).map(normalizeWorkspaceDiscountItem)
        : baseModule.discounts,
    promotions:
      promotionsResult.status === 'fulfilled' && promotionsResult.value.error == null
        ? ((promotionsResult.value.data ?? []) as Record<string, unknown>[]).map(normalizePromotionSummary)
        : [],
    promotionsUnavailableReason,
    unavailableReason,
  };
}

function optionMapById(options: WorkspaceReferenceOption[]): Map<string, WorkspaceReferenceOption> {
  return new Map(options.map((option) => [option.id, option]));
}

function normalizeMediaOption(row: Record<string, unknown>): WorkspaceReferenceOption {
  const id = readString(row.id);
  return {
    id,
    code: id,
    label: readString(row.title, readString(row.name, readString(row.url, id))),
  };
}

async function getObjectWorkspaceRoomsModule(
  objectId: string,
  baseModule: ObjectWorkspaceRoomsModule,
): Promise<ObjectWorkspaceRoomsModule> {
  const session = useSessionStore.getState();
  if (session.demoMode) {
    return baseModule;
  }

  const client = getSupabaseClient();
  if (!client) {
    return baseModule.items.length > 0
      ? baseModule
      : { ...baseModule, unavailableReason: 'Connexion backend indisponible pour charger les chambres et unites.' };
  }

  const [roomsResult, viewRefsResult, roomTypeRefsResult, amenityRefsResult, mediaResult] = await Promise.allSettled([
    client
      .from('object_room_type')
      .select('id, code, name, name_i18n, description, description_i18n, capacity_adults, capacity_children, capacity_total, size_sqm, bed_config, bed_config_i18n, total_rooms, floor_level, view_type_id, room_type_id, base_price, currency, is_accessible, is_published, position')
      .eq('object_id', objectId)
      .order('position', { ascending: true }),
    client.from('ref_code').select('id, code, name, position').eq('domain', 'view_type').order('position', { ascending: true }),
    client.from('ref_code').select('id, code, name, position').eq('domain', 'room_type').order('position', { ascending: true }),
    client.from('ref_amenity').select('id, code, name, position').order('position', { ascending: true }),
    client.from('media').select('id, title, url, position').eq('object_id', objectId).order('position', { ascending: true }),
  ]);

  if (roomsResult.status !== 'fulfilled' || roomsResult.value.error) {
    return {
      ...baseModule,
      unavailableReason: 'Le live actuel ne fournit pas encore les chambres et unites pour ce profil.',
    };
  }

  const rows = (roomsResult.value.data ?? []) as Record<string, unknown>[];
  const roomIds = rows.map((row) => readString(row.id)).filter(Boolean);
  const [amenityLinksResult, mediaLinksResult] = roomIds.length > 0
    ? await Promise.allSettled([
        client.from('object_room_type_amenity').select('room_type_id, amenity_id').in('room_type_id', roomIds),
        client.from('object_room_type_media').select('room_type_id, media_id').in('room_type_id', roomIds),
      ])
    : [
        { status: 'fulfilled' as const, value: { data: [], error: null } },
        { status: 'fulfilled' as const, value: { data: [], error: null } },
      ];

  const viewTypeOptions = viewRefsResult.status === 'fulfilled' && viewRefsResult.value.error == null
    ? dedupeReferenceOptions((viewRefsResult.value.data ?? []).map((row) => normalizeReferenceOption(row as Record<string, unknown>)))
    : baseModule.viewTypeOptions;
  const roomTypeOptions = roomTypeRefsResult.status === 'fulfilled' && roomTypeRefsResult.value.error == null
    ? dedupeReferenceOptions((roomTypeRefsResult.value.data ?? []).map((row) => normalizeReferenceOption(row as Record<string, unknown>)))
    : baseModule.roomTypeOptions;
  const amenityOptions = amenityRefsResult.status === 'fulfilled' && amenityRefsResult.value.error == null
    ? dedupeReferenceOptions((amenityRefsResult.value.data ?? []).map((row) => normalizeReferenceOption(row as Record<string, unknown>)))
    : baseModule.amenityOptions;
  const mediaOptions = mediaResult.status === 'fulfilled' && mediaResult.value.error == null
    ? sortReferenceOptions((mediaResult.value.data ?? []).map((row) => normalizeMediaOption(row as Record<string, unknown>)))
    : baseModule.mediaOptions;
  const viewTypeById = optionMapById(viewTypeOptions);
  const roomTypeById = optionMapById(roomTypeOptions);
  const amenityById = optionMapById(amenityOptions);
  const amenityCodesByRoom = new Map<string, string[]>();
  const mediaIdsByRoom = new Map<string, string[]>();

  if (amenityLinksResult.status === 'fulfilled' && amenityLinksResult.value.error == null) {
    for (const row of (amenityLinksResult.value.data ?? []) as Record<string, unknown>[]) {
      const roomId = readString(row.room_type_id);
      const option = amenityById.get(readString(row.amenity_id));
      if (!roomId || !option) {
        continue;
      }
      amenityCodesByRoom.set(roomId, [...(amenityCodesByRoom.get(roomId) ?? []), option.code]);
    }
  }

  if (mediaLinksResult.status === 'fulfilled' && mediaLinksResult.value.error == null) {
    for (const row of (mediaLinksResult.value.data ?? []) as Record<string, unknown>[]) {
      const roomId = readString(row.room_type_id);
      const mediaId = readString(row.media_id);
      if (!roomId || !mediaId) {
        continue;
      }
      mediaIdsByRoom.set(roomId, [...(mediaIdsByRoom.get(roomId) ?? []), mediaId]);
    }
  }

  return {
    viewTypeOptions,
    roomTypeOptions,
    amenityOptions,
    mediaOptions,
    items: rows.map((row, index) => {
      const viewType = viewTypeById.get(readString(row.view_type_id));
      const roomType = roomTypeById.get(readString(row.room_type_id));
      const roomId = readString(row.id);
      return {
        recordId: roomId || null,
        code: readString(row.code, `room-${index + 1}`),
        name: readString(row.name, `Unite ${index + 1}`),
        nameTranslations: readRecord(row.name_i18n) as Record<string, string>,
        description: readString(row.description),
        descriptionTranslations: readRecord(row.description_i18n) as Record<string, string>,
        capacityAdults: readString(row.capacity_adults),
        capacityChildren: readString(row.capacity_children),
        capacityTotal: readString(row.capacity_total),
        sizeSqm: readString(row.size_sqm),
        bedConfig: readString(row.bed_config),
        bedConfigTranslations: readRecord(row.bed_config_i18n) as Record<string, string>,
        quantity: readString(row.total_rooms),
        floorLevel: readString(row.floor_level),
        viewTypeId: readString(row.view_type_id),
        viewTypeCode: viewType?.code ?? '',
        viewTypeLabel: viewType?.label ?? '',
        roomTypeId: readString(row.room_type_id),
        roomTypeCode: roomType?.code ?? '',
        roomTypeLabel: roomType?.label ?? '',
        basePrice: readString(row.base_price),
        currency: readString(row.currency, 'EUR'),
        accessible: readBoolean(row.is_accessible),
        published: row.is_published == null ? true : readBoolean(row.is_published),
        position: readString(row.position, String(index + 1)),
        amenityCodes: amenityCodesByRoom.get(roomId) ?? [],
        mediaIds: mediaIdsByRoom.get(roomId) ?? [],
      };
    }),
    unavailableReason: null,
  };
}

async function getObjectWorkspaceMeetingRoomsModule(
  objectId: string,
  baseModule: ObjectWorkspaceMeetingRoomsModule,
): Promise<ObjectWorkspaceMeetingRoomsModule> {
  const session = useSessionStore.getState();
  if (session.demoMode) {
    return baseModule;
  }

  const client = getSupabaseClient();
  if (!client) {
    return baseModule.items.length > 0
      ? baseModule
      : { ...baseModule, unavailableReason: 'Connexion backend indisponible pour charger les salles MICE.' };
  }

  const [roomsResult, equipmentRefsResult] = await Promise.allSettled([
    client
      .from('object_meeting_room')
      .select('id, name, name_i18n, area_m2, cap_theatre, cap_u, cap_classroom, cap_boardroom')
      .eq('object_id', objectId)
      .order('name', { ascending: true }),
    client.from('ref_code').select('id, code, name, position').eq('domain', 'meeting_equipment').order('position', { ascending: true }),
  ]);

  if (roomsResult.status !== 'fulfilled' || roomsResult.value.error) {
    return {
      ...baseModule,
      unavailableReason: 'Le live actuel ne fournit pas encore les salles MICE pour ce profil.',
    };
  }

  const rows = (roomsResult.value.data ?? []) as Record<string, unknown>[];
  const roomIds = rows.map((row) => readString(row.id)).filter(Boolean);
  const linksResult = roomIds.length > 0
    ? await client.from('meeting_room_equipment').select('room_id, equipment_id').in('room_id', roomIds)
    : { data: [], error: null };
  const equipmentOptions = equipmentRefsResult.status === 'fulfilled' && equipmentRefsResult.value.error == null
    ? dedupeReferenceOptions((equipmentRefsResult.value.data ?? []).map((row) => normalizeReferenceOption(row as Record<string, unknown>)))
    : baseModule.equipmentOptions;
  const equipmentById = optionMapById(equipmentOptions);
  const equipmentCodesByRoom = new Map<string, string[]>();

  if (linksResult.error == null) {
    for (const row of (linksResult.data ?? []) as Record<string, unknown>[]) {
      const roomId = readString(row.room_id);
      const option = equipmentById.get(readString(row.equipment_id));
      if (roomId && option) {
        equipmentCodesByRoom.set(roomId, [...(equipmentCodesByRoom.get(roomId) ?? []), option.code]);
      }
    }
  }

  return {
    equipmentOptions,
    items: rows.map((row, index) => {
      const roomId = readString(row.id);
      return {
        recordId: roomId || null,
        name: readString(row.name, `Salle ${index + 1}`),
        nameTranslations: readRecord(row.name_i18n) as Record<string, string>,
        areaM2: readString(row.area_m2),
        capacityTheatre: readString(row.cap_theatre),
        capacityU: readString(row.cap_u),
        capacityClassroom: readString(row.cap_classroom),
        capacityBoardroom: readString(row.cap_boardroom),
        equipmentCodes: equipmentCodesByRoom.get(roomId) ?? [],
      };
    }),
    unavailableReason: null,
  };
}

async function getObjectWorkspaceMenusModule(
  objectId: string,
  baseModule: ObjectWorkspaceMenusModule,
): Promise<ObjectWorkspaceMenusModule> {
  const session = useSessionStore.getState();
  if (session.demoMode) {
    return baseModule;
  }

  const client = getSupabaseClient();
  if (!client) {
    return baseModule.items.length > 0
      ? baseModule
      : { ...baseModule, unavailableReason: 'Connexion backend indisponible pour charger les menus.' };
  }

  const [menusResult, categoryRefsResult, dietaryRefsResult, allergenRefsResult, cuisineRefsResult, kindRefsResult, unitRefsResult, mediaResult] = await Promise.allSettled([
    client.from('object_menu').select('id, category_id, name, description, is_active, visibility, position').eq('object_id', objectId).order('position', { ascending: true }),
    client.from('ref_code').select('id, code, name, position').eq('domain', 'menu_category').order('position', { ascending: true }),
    client.from('ref_code').select('id, code, name, position').eq('domain', 'dietary_tag').order('position', { ascending: true }),
    client.from('ref_code').select('id, code, name, position').eq('domain', 'allergen').order('position', { ascending: true }),
    client.from('ref_code').select('id, code, name, position').eq('domain', 'cuisine_type').order('position', { ascending: true }),
    client.from('ref_code').select('id, code, name, position').eq('domain', 'price_kind').order('position', { ascending: true }),
    client.from('ref_code').select('id, code, name, position').eq('domain', 'price_unit').order('position', { ascending: true }),
    client.from('media').select('id, title, url, position').eq('object_id', objectId).order('position', { ascending: true }),
  ]);

  if (menusResult.status !== 'fulfilled' || menusResult.value.error) {
    return {
      ...baseModule,
      unavailableReason: 'Le live actuel ne fournit pas encore les menus pour ce profil.',
    };
  }

  const menus = (menusResult.value.data ?? []) as Record<string, unknown>[];
  const menuIds = menus.map((row) => readString(row.id)).filter(Boolean);
  const itemRowsResult = menuIds.length > 0
    ? await client
        .from('object_menu_item')
        .select('id, menu_id, name, description, price, currency, kind_id, unit_id, media_id, is_available, position')
        .in('menu_id', menuIds)
        .order('position', { ascending: true })
    : { data: [], error: null };
  const itemRows = itemRowsResult.error == null
    ? (itemRowsResult.data ?? []) as Record<string, unknown>[]
    : [];
  const itemIds = itemRows.map((row) => readString(row.id)).filter(Boolean);
  const [mediaLinksResult, dietaryLinksResult, allergenLinksResult, cuisineLinksResult] = itemIds.length > 0
    ? await Promise.allSettled([
        client
          .from('object_menu_item_media')
          .select('menu_item_id, media_id, position')
          .in('menu_item_id', itemIds)
          .order('position', { ascending: true }),
        client.from('object_menu_item_dietary_tag').select('menu_item_id, dietary_tag_id').in('menu_item_id', itemIds),
        client.from('object_menu_item_allergen').select('menu_item_id, allergen_id').in('menu_item_id', itemIds),
        client.from('object_menu_item_cuisine_type').select('menu_item_id, cuisine_type_id').in('menu_item_id', itemIds),
      ])
    : [
        { status: 'fulfilled' as const, value: { data: [], error: null } },
        { status: 'fulfilled' as const, value: { data: [], error: null } },
        { status: 'fulfilled' as const, value: { data: [], error: null } },
        { status: 'fulfilled' as const, value: { data: [], error: null } },
      ];
  const categoryOptions = categoryRefsResult.status === 'fulfilled' && categoryRefsResult.value.error == null
    ? dedupeReferenceOptions((categoryRefsResult.value.data ?? []).map((row) => normalizeReferenceOption(row as Record<string, unknown>)))
    : baseModule.categoryOptions;
  const dietaryTagOptions = dietaryRefsResult.status === 'fulfilled' && dietaryRefsResult.value.error == null
    ? dedupeReferenceOptions((dietaryRefsResult.value.data ?? []).map((row) => normalizeReferenceOption(row as Record<string, unknown>)))
    : baseModule.dietaryTagOptions;
  const allergenOptions = allergenRefsResult.status === 'fulfilled' && allergenRefsResult.value.error == null
    ? dedupeReferenceOptions((allergenRefsResult.value.data ?? []).map((row) => normalizeReferenceOption(row as Record<string, unknown>)))
    : baseModule.allergenOptions;
  const cuisineTypeOptions = cuisineRefsResult.status === 'fulfilled' && cuisineRefsResult.value.error == null
    ? dedupeReferenceOptions((cuisineRefsResult.value.data ?? []).map((row) => normalizeReferenceOption(row as Record<string, unknown>)))
    : baseModule.cuisineTypeOptions;
  const priceKindOptions = kindRefsResult.status === 'fulfilled' && kindRefsResult.value.error == null
    ? dedupeReferenceOptions((kindRefsResult.value.data ?? []).map((row) => normalizeReferenceOption(row as Record<string, unknown>)))
    : baseModule.priceKindOptions;
  const priceUnitOptions = unitRefsResult.status === 'fulfilled' && unitRefsResult.value.error == null
    ? dedupeReferenceOptions((unitRefsResult.value.data ?? []).map((row) => normalizeReferenceOption(row as Record<string, unknown>)))
    : baseModule.priceUnitOptions;
  const mediaOptions = mediaResult.status === 'fulfilled' && mediaResult.value.error == null
    ? sortReferenceOptions((mediaResult.value.data ?? []).map((row) => normalizeMediaOption(row as Record<string, unknown>)))
    : baseModule.mediaOptions;
  const categoryById = optionMapById(categoryOptions);
  const kindById = optionMapById(priceKindOptions);
  const unitById = optionMapById(priceUnitOptions);
  const dietaryById = optionMapById(dietaryTagOptions);
  const allergenById = optionMapById(allergenOptions);
  const cuisineById = optionMapById(cuisineTypeOptions);
  const mediaIdsByItem = new Map<string, string[]>();
  const tagCodesByItem = new Map<string, string[]>();
  const allergenCodesByItem = new Map<string, string[]>();
  const cuisineCodesByItem = new Map<string, string[]>();

  if (mediaLinksResult.status === 'fulfilled' && mediaLinksResult.value.error == null) {
    for (const row of (mediaLinksResult.value.data ?? []) as Record<string, unknown>[]) {
      const itemId = readString(row.menu_item_id);
      const mediaId = readString(row.media_id);
      if (itemId && mediaId) {
        mediaIdsByItem.set(itemId, [...(mediaIdsByItem.get(itemId) ?? []), mediaId]);
      }
    }
  }
  if (dietaryLinksResult.status === 'fulfilled' && dietaryLinksResult.value.error == null) {
    for (const row of (dietaryLinksResult.value.data ?? []) as Record<string, unknown>[]) {
      const itemId = readString(row.menu_item_id);
      const option = dietaryById.get(readString(row.dietary_tag_id));
      if (itemId && option) {
        tagCodesByItem.set(itemId, [...(tagCodesByItem.get(itemId) ?? []), option.code]);
      }
    }
  }
  if (allergenLinksResult.status === 'fulfilled' && allergenLinksResult.value.error == null) {
    for (const row of (allergenLinksResult.value.data ?? []) as Record<string, unknown>[]) {
      const itemId = readString(row.menu_item_id);
      const option = allergenById.get(readString(row.allergen_id));
      if (itemId && option) {
        allergenCodesByItem.set(itemId, [...(allergenCodesByItem.get(itemId) ?? []), option.code]);
      }
    }
  }
  if (cuisineLinksResult.status === 'fulfilled' && cuisineLinksResult.value.error == null) {
    for (const row of (cuisineLinksResult.value.data ?? []) as Record<string, unknown>[]) {
      const itemId = readString(row.menu_item_id);
      const option = cuisineById.get(readString(row.cuisine_type_id));
      if (itemId && option) {
        cuisineCodesByItem.set(itemId, [...(cuisineCodesByItem.get(itemId) ?? []), option.code]);
      }
    }
  }

  const itemsByMenuId = new Map<string, ObjectWorkspaceMenuItem[]>();
  for (const row of itemRows) {
    const itemId = readString(row.id);
    const menuId = readString(row.menu_id);
    const kind = kindById.get(readString(row.kind_id));
    const unit = unitById.get(readString(row.unit_id));
    const legacyMediaId = readString(row.media_id);
    const item: ObjectWorkspaceMenuItem = {
      recordId: itemId || null,
      name: readString(row.name),
      description: readString(row.description),
      price: readString(row.price),
      currency: readString(row.currency, 'EUR'),
      kindId: readString(row.kind_id),
      kindCode: kind?.code ?? '',
      kindLabel: kind?.label ?? '',
      unitId: readString(row.unit_id),
      unitCode: unit?.code ?? '',
      unitLabel: unit?.label ?? '',
      mediaIds: Array.from(new Set([legacyMediaId, ...(mediaIdsByItem.get(itemId) ?? [])].filter(Boolean))),
      available: row.is_available == null ? true : readBoolean(row.is_available),
      position: readString(row.position),
      dietaryTagCodes: tagCodesByItem.get(itemId) ?? [],
      allergenCodes: allergenCodesByItem.get(itemId) ?? [],
      cuisineTypeCodes: cuisineCodesByItem.get(itemId) ?? [],
    };
    itemsByMenuId.set(menuId, [...(itemsByMenuId.get(menuId) ?? []), item]);
  }

  return {
    categoryOptions,
    dietaryTagOptions,
    allergenOptions,
    cuisineTypeOptions,
    priceKindOptions,
    priceUnitOptions,
    mediaOptions,
    items: menus.map((row, index) => {
      const menuId = readString(row.id);
      const category = categoryById.get(readString(row.category_id));
      return {
        recordId: menuId || null,
        categoryId: readString(row.category_id),
        categoryCode: category?.code ?? '',
        categoryLabel: category?.label ?? '',
        name: readString(row.name, `Menu ${index + 1}`),
        description: readString(row.description),
        active: row.is_active == null ? true : readBoolean(row.is_active),
        visibility: readString(row.visibility, 'public'),
        position: readString(row.position, String(index + 1)),
        items: itemsByMenuId.get(menuId) ?? [],
      };
    }),
    unavailableReason: null,
  };
}

async function getObjectWorkspaceActivityModule(
  objectId: string,
  baseModule: ObjectWorkspaceActivityModule,
): Promise<ObjectWorkspaceActivityModule> {
  const session = useSessionStore.getState();
  if (session.demoMode) {
    return baseModule;
  }

  const client = getSupabaseClient();
  if (!client) {
    return { ...baseModule, unavailableReason: 'Connexion backend indisponible pour charger le detail activite.' };
  }

  const { data, error } = await client
    .from('object_act')
    .select('duration_min, min_participants, max_participants, difficulty_level, guide_required, min_age, equipment_provided')
    .eq('object_id', objectId)
    .maybeSingle();

  if (error) {
    return {
      ...baseModule,
      unavailableReason: 'Le live actuel ne fournit pas encore le detail activite pour ce profil.',
    };
  }

  if (!data) {
    return baseModule;
  }

  const row = readRecord(data);
  return {
    durationMin: readString(row.duration_min),
    minParticipants: readString(row.min_participants),
    maxParticipants: readString(row.max_participants),
    difficultyLevel: readString(row.difficulty_level),
    guideRequired: readBoolean(row.guide_required),
    minAge: readString(row.min_age),
    equipmentProvided: readString(row.equipment_provided),
    unavailableReason: null,
  };
}

async function getObjectWorkspaceEventModule(
  objectId: string,
  baseModule: ObjectWorkspaceEventModule,
): Promise<ObjectWorkspaceEventModule> {
  const session = useSessionStore.getState();
  if (session.demoMode) {
    return baseModule;
  }

  const client = getSupabaseClient();
  if (!client) {
    return { ...baseModule, unavailableReason: 'Connexion backend indisponible pour charger la programmation.' };
  }

  const [eventResult, occurrencesResult] = await Promise.allSettled([
    client
      .from('object_fma')
      .select('event_start_date, event_end_date, event_start_time, event_end_time, is_recurring, recurrence_pattern')
      .eq('object_id', objectId)
      .maybeSingle(),
    client
      .from('object_fma_occurrence')
      .select('id, start_at, end_at, state')
      .eq('object_id', objectId)
      .order('start_at', { ascending: true }),
  ]);

  if (eventResult.status !== 'fulfilled' || eventResult.value.error) {
    return {
      ...baseModule,
      unavailableReason: 'Le live actuel ne fournit pas encore la programmation pour ce profil.',
    };
  }

  const eventRow = readRecord(eventResult.value.data);
  const occurrences = occurrencesResult.status === 'fulfilled' && occurrencesResult.value.error == null
    ? ((occurrencesResult.value.data ?? []) as Record<string, unknown>[]).map((row) => ({
        recordId: readString(row.id) || null,
        startAt: readString(row.start_at),
        endAt: readString(row.end_at),
        state: readString(row.state, 'scheduled'),
      }))
    : baseModule.occurrences;

  return {
    startDate: readString(eventRow.event_start_date, baseModule.startDate),
    endDate: readString(eventRow.event_end_date, baseModule.endDate),
    startTime: readString(eventRow.event_start_time, baseModule.startTime),
    endTime: readString(eventRow.event_end_time, baseModule.endTime),
    recurring: eventRow.is_recurring == null ? baseModule.recurring : readBoolean(eventRow.is_recurring),
    recurrenceText: readString(eventRow.recurrence_pattern, baseModule.recurrenceText),
    occurrences,
    unavailableReason: occurrencesResult.status === 'fulfilled' && occurrencesResult.value.error == null
      ? null
      : 'Les occurrences detaillees ne sont pas completement exposees pour ce profil.',
  };
}

async function getObjectWorkspaceItineraryModule(
  objectId: string,
  baseModule: ObjectWorkspaceItineraryModule,
): Promise<ObjectWorkspaceItineraryModule> {
  const session = useSessionStore.getState();
  if (session.demoMode) {
    return baseModule;
  }

  const client = getSupabaseClient();
  if (!client) {
    return { ...baseModule, unavailableReason: 'Connexion backend indisponible pour charger l itineraire.' };
  }

  const [itiResult, practiceRefsResult, practicesResult, stagesResult] = await Promise.allSettled([
    client
      .from('object_iti')
      .select('distance_km, duration_min, difficulty_level, elevation_gain, elevation_loss, is_loop, open_status, status_note, geom')
      .eq('object_id', objectId)
      .maybeSingle(),
    client.from('ref_code').select('id, code, name, position').eq('domain', 'iti_practice').order('position', { ascending: true }),
    client.from('object_iti_practice').select('practice_id').eq('object_id', objectId),
    client.from('object_iti_stage').select('id, name, description, position, geom').eq('object_id', objectId).order('position', { ascending: true }),
  ]);

  if (itiResult.status !== 'fulfilled' || itiResult.value.error) {
    return {
      ...baseModule,
      unavailableReason: 'Le live actuel ne fournit pas encore le detail itineraire pour ce profil.',
    };
  }

  const row = readRecord(itiResult.value.data);
  const practiceOptions = practiceRefsResult.status === 'fulfilled' && practiceRefsResult.value.error == null
    ? dedupeReferenceOptions((practiceRefsResult.value.data ?? []).map((entry) => normalizeReferenceOption(entry as Record<string, unknown>)))
    : baseModule.practiceOptions;
  const practiceById = optionMapById(practiceOptions);
  const practiceCodes = practicesResult.status === 'fulfilled' && practicesResult.value.error == null
    ? ((practicesResult.value.data ?? []) as Record<string, unknown>[])
        .map((entry) => practiceById.get(readString(entry.practice_id))?.code ?? '')
        .filter(Boolean)
    : baseModule.practiceCodes;
  const stages = stagesResult.status === 'fulfilled' && stagesResult.value.error == null
    ? ((stagesResult.value.data ?? []) as Record<string, unknown>[]).map((stage, index) => ({
        recordId: readString(stage.id) || null,
        name: readString(stage.name, `Etape ${index + 1}`),
        description: readString(stage.description),
        position: readString(stage.position, String(index + 1)),
      }))
    : baseModule.stages;

  // object_iti.duration_min is stored in minutes (greenfield retype from duration_hours); read it
  // directly — no hours->minutes round-trip. elevation_loss carries descent (was unavailable before).
  return {
    ...baseModule,
    distanceKm: readString(row.distance_km, baseModule.distanceKm),
    durationMin: readString(row.duration_min, baseModule.durationMin),
    difficultyLevel: readString(row.difficulty_level, baseModule.difficultyLevel),
    elevationPositiveM: readString(row.elevation_gain, baseModule.elevationPositiveM),
    elevationNegativeM: readString(row.elevation_loss, baseModule.elevationNegativeM),
    loop: row.is_loop == null ? baseModule.loop : readBoolean(row.is_loop),
    openStatus: readString(row.open_status, baseModule.openStatus || 'open'),
    statusNote: readString(row.status_note, baseModule.statusNote),
    practiceOptions,
    practiceCodes,
    stages,
    geometrySummary: row.geom ? 'geometrie presente' : baseModule.geometrySummary,
    traceEditable: false,
    unavailableReason: null,
  };
}

async function getObjectWorkspaceOpeningsModule(
  objectId: string,
  baseModule: ObjectWorkspaceOpeningsModule,
): Promise<ObjectWorkspaceOpeningsModule> {
  const session = useSessionStore.getState();
  if (session.demoMode) {
    return baseModule;
  }

  const client = getSupabaseClient();
  if (!client) {
    return baseModule.periods.length > 0
      ? baseModule
      : {
          ...baseModule,
          unavailableReason: 'Connexion backend indisponible pour charger les horaires et periodes.',
        };
  }

  const { count, error } = await client
    .from('opening_period')
    .select('id', { head: true, count: 'exact' })
    .eq('object_id', objectId);

  if (error) {
    return {
      ...baseModule,
      unavailableReason: 'Le live actuel ne fournit pas encore un module C6 complet pour ce profil.',
    };
  }

  if ((count ?? 0) > 0 && baseModule.periods.length === 0) {
    return {
      ...baseModule,
      unavailableReason: 'Des ouvertures existent en base mais ne remontent pas encore correctement dans le payload de travail.',
    };
  }

  return {
    ...baseModule,
    unavailableReason: null,
  };
}

async function getObjectWorkspacePublicationModule(
  objectId: string,
  detail: ObjectDetail,
  baseModule: ObjectWorkspacePublicationModule,
): Promise<ObjectWorkspacePublicationModule> {
  const session = useSessionStore.getState();

  if (session.demoMode) {
    const moderationItems = buildDemoModerationItems(detail.name, objectId);
    const publicationItems = buildDemoPublicationItems();

    return {
      ...baseModule,
      moderation: {
        availability: 'available',
        pendingCount: moderationItems.length,
        unavailableReason: null,
        items: moderationItems,
      },
      printPublications: {
        availability: 'available',
        selectionCount: publicationItems.length,
        unavailableReason: null,
        items: publicationItems,
      },
    };
  }

  const client = getSupabaseClient();
  if (!client) {
    return {
      ...baseModule,
      moderation: {
        availability: 'unavailable',
        pendingCount: 0,
        unavailableReason: 'Connexion backend indisponible pour charger la moderation.',
        items: [],
      },
      printPublications: {
        availability: 'unavailable',
        selectionCount: 0,
        unavailableReason: 'Connexion backend indisponible pour charger les publications.',
        items: [],
      },
    };
  }

  const [pendingResult, publicationResult] = await Promise.allSettled([
    client
      .from('pending_change')
      .select('id, target_table, target_pk, action, status, submitted_at, reviewed_at, review_note, applied_at, payload, metadata')
      .eq('object_id', objectId)
      .eq('status', 'pending')
      .order('submitted_at', { ascending: false })
      .limit(10),
    client
      .from('publication_object')
      .select('publication_id, workflow_status, page_number, custom_print_text, proof_sent_at, validated_bat_at, publication:publication_id(code, name, year, status)')
      .eq('object_id', objectId)
      .order('updated_at', { ascending: false }),
  ]);

  const moderation =
    pendingResult.status === 'fulfilled' && pendingResult.value.error == null
      ? {
          availability: 'available' as const,
          pendingCount: (pendingResult.value.data ?? []).length,
          unavailableReason: null,
          items: (pendingResult.value.data ?? []).map((row) => normalizePendingChangeItem(row as Record<string, unknown>)),
        }
      : {
          availability: 'unavailable' as const,
          pendingCount: 0,
          unavailableReason: 'La file de moderation n est pas lisible depuis ce contexte applicatif.',
          items: [] as ObjectWorkspaceModerationItem[],
        };

  const printPublications =
    publicationResult.status === 'fulfilled' && publicationResult.value.error == null
      ? {
          availability: 'available' as const,
          selectionCount: (publicationResult.value.data ?? []).length,
          unavailableReason: null,
          items: (publicationResult.value.data ?? []).map((row) =>
            normalizePublicationSelectionItem(row as Record<string, unknown>),
          ),
        }
      : {
          availability: 'unavailable' as const,
          selectionCount: 0,
          unavailableReason: 'Le workflow print n est pas encore expose a ce profil dans le live.',
          items: [] as ObjectWorkspacePublicationSelectionItem[],
        };

  return {
    ...baseModule,
    moderation,
    printPublications,
  };
}

async function getObjectWorkspaceSustainabilityModule(
  baseModule: ObjectWorkspaceSustainabilityModule,
): Promise<ObjectWorkspaceSustainabilityModule> {
  const session = useSessionStore.getState();
  if (session.demoMode) {
    return baseModule;
  }

  const client = getSupabaseClient();
  if (!client) {
    return baseModule;
  }

  const [categoriesResult, actionsResult] = await Promise.all([
    client
      .from('ref_sustainability_action_category')
      .select('id, code, name, description, position')
      .order('position', { ascending: true }),
    client
      .from('ref_sustainability_action')
      .select('id, code, label, description, category_id, position')
      .order('position', { ascending: true }),
  ]);

  if (categoriesResult.error || actionsResult.error) {
    return baseModule;
  }

  const selectedById = new Map<string, { note: string; documentId: string }>();
  for (const category of baseModule.categories) {
    for (const action of category.actions) {
      if (action.selected) {
        selectedById.set(action.id, { note: action.note, documentId: action.documentId });
      }
    }
  }

  const categories = ((categoriesResult.data ?? []) as Record<string, unknown>[]).map((row) => {
    const categoryId = readString(row.id);
    const categoryActions = ((actionsResult.data ?? []) as Record<string, unknown>[])
      .filter((action) => readString(action.category_id) === categoryId)
      .map((action) => {
        const actionId = readString(action.id);
        const selected = selectedById.get(actionId);
        return {
          id: actionId,
          code: readString(action.code),
          label: readString(action.label, readString(action.code)),
          description: readString(action.description),
          selected: Boolean(selected),
          note: selected?.note ?? '',
          documentId: selected?.documentId ?? '',
        };
      });

    return {
      id: categoryId,
      code: readString(row.code),
      label: readString(row.name, readString(row.code)),
      description: readString(row.description),
      actions: categoryActions,
    };
  }).filter((category) => category.actions.length > 0);

  return {
    categories: categories.length > 0 ? categories : baseModule.categories,
    equivalentLabels: baseModule.equivalentLabels,
  };
}

async function getObjectWorkspaceTagsModule(
  objectId: string,
  baseModule: ObjectWorkspaceTagsModule,
): Promise<ObjectWorkspaceTagsModule> {
  const session = useSessionStore.getState();
  if (session.demoMode) {
    return baseModule;
  }

  const client = getSupabaseClient();
  if (!client) {
    return baseModule;
  }

  // Fetch all ref_tag rows for the library picker (tags not yet displayed on this object).
  // Also fetch tag_link rows for this object ordered by position so the displayed list
  // reflects the drag-and-drop order saved by save_object_workspace_tags, and so the
  // per-object color override (tag_link.extra.color_variant) takes precedence over ref_tag.color.
  const [tagsResult, tagLinkResult] = await Promise.all([
    client
      .from('ref_tag')
      .select('id, slug, name, color, position')
      .order('position', { ascending: true }),
    client
      .from('tag_link')
      .select('tag_id, extra, position')
      .eq('target_table', 'object')
      .eq('target_pk', objectId)
      .order('position', { ascending: true }),
  ]);

  if (tagsResult.error) {
    return baseModule;
  }

  const refTagById = new Map(
    ((tagsResult.data ?? []) as Record<string, unknown>[]).map((row) => [readString(row.id), row]),
  );

  // Rebuild displayed list from tag_link (authoritative position + extra), joined with ref_tag for
  // slug/name/color. Fall back to baseModule.displayed if tag_link fetch fails (e.g. RLS).
  let displayed: ObjectWorkspaceTagsModule['displayed'];
  if (!tagLinkResult.error) {
    displayed = ((tagLinkResult.data ?? []) as Record<string, unknown>[])
      .map((link) => {
        const refTag = refTagById.get(readString(link.tag_id)) ?? {};
        const extra = readRecord(link.extra);
        const slug = readString((refTag as Record<string, unknown>).slug);
        const label = readString((refTag as Record<string, unknown>).name, slug);
        return {
          tagId: readString(link.tag_id),
          slug,
          label,
          colorVariant: resolveTagColor(refTag as { color?: unknown }, extra as { color_variant?: unknown }),
          source: normalizeTagSource(readString(extra.source, 'thematic')),
        };
      })
      .filter((item) => item.slug || item.label);
  } else {
    displayed = baseModule.displayed;
  }

  const displayedTagIds = new Set(displayed.map((tag) => tag.tagId));
  const library = ((tagsResult.data ?? []) as Record<string, unknown>[])
    .map((row) => ({
      tagId: readString(row.id),
      slug: readString(row.slug),
      label: readString(row.name, readString(row.slug)),
      colorVariant: resolveTagColor(row, {}),
      source: 'thematic' as const,
    }))
    .filter((tag) => tag.slug && !displayedTagIds.has(tag.tagId));

  return {
    ...baseModule,
    displayed,
    library,
  };
}

/** Pure: derive per-layer description edit rights from the resolved capability flags. */
export function describeDescriptionsAccess(flags: {
  directWrite: boolean;
  canonical: boolean;
  enrichment: boolean;
}): { canEditCanonical: boolean; canEditOrgEnrichment: boolean } {
  return {
    canEditCanonical: flags.directWrite || flags.canonical,
    canEditOrgEnrichment: flags.directWrite || flags.enrichment,
  };
}

/**
 * Pure (SP-3): can the user write canonical sections directly?
 * Mirrors the backend authorization established by SP-1 + SP-1b
 * (api.user_can_write_object_canonical = is_object_owner OR user_can_write_canonical):
 * platform superuser / demo (directWrite), legacy actor-owner (objectOwner), or a
 * publisher-ORG member holding edit_canonical_when_publisher (canonical).
 */
export function canWriteCanonicalDirect(flags: {
  directWrite: boolean;
  objectOwner: boolean;
  canonical: boolean;
}): boolean {
  return flags.directWrite || flags.objectOwner || flags.canonical;
}

async function getObjectWorkspacePermissions(objectId: string): Promise<ObjectWorkspacePermissions> {
  const session = useSessionStore.getState();
  const directWrite = session.demoMode || session.role === 'owner' || session.role === 'super_admin';
  const apiClient = getApiClient();

  let canPrepareProposal = directWrite;
  let canWriteSafeWorkspaceRpc = directWrite;
  let canPublishObject = directWrite || session.demoMode;
  let canWriteProviderFollowUp = session.demoMode;
  let canonical = false;
  let enrichment = false;
  let objectOwner = false;
  if (!session.demoMode && apiClient) {
    try {
      const [canonicalResult, enrichmentResult, publishResult, providerFollowUpResult, ownerResult] = await Promise.allSettled([
        apiClient.schema('api').rpc('user_can_write_canonical', { p_object_id: objectId }),
        apiClient.schema('api').rpc('user_can_write_enrichment', { p_object_id: objectId }),
        apiClient.schema('api').rpc('user_can_publish_object', { p_object_id: objectId }),
        apiClient.schema('api').rpc('can_write_object_private_notes', { p_object_id: objectId }),
        apiClient.schema('api').rpc('is_object_owner', { p_object_id: objectId }),
      ]);

      canonical =
        canonicalResult.status === 'fulfilled' && canonicalResult.value.error == null && canonicalResult.value.data === true;
      enrichment =
        enrichmentResult.status === 'fulfilled' && enrichmentResult.value.error == null && enrichmentResult.value.data === true;
      objectOwner =
        ownerResult.status === 'fulfilled' && ownerResult.value.error == null && ownerResult.value.data === true;
      canPublishObject =
        directWrite
        || (publishResult.status === 'fulfilled' && publishResult.value.error == null && publishResult.value.data === true);
      canWriteProviderFollowUp =
        providerFollowUpResult.status === 'fulfilled' && providerFollowUpResult.value.error == null && providerFollowUpResult.value.data === true;

      canPrepareProposal = directWrite || canonical || enrichment;
      canWriteSafeWorkspaceRpc = canWriteCanonicalDirect({ directWrite, objectOwner, canonical });
    } catch {
      canPrepareProposal = directWrite;
      canWriteSafeWorkspaceRpc = directWrite;
      canPublishObject = directWrite;
      canWriteProviderFollowUp = directWrite;
    }
  }

  const proposalUnavailableReason = canPrepareProposal
    ? "Le flux de proposition moderee n'est pas encore branche pour ce module."
    : "Vos droits actuels ne permettent pas cette modification.";

  // SP-3: canonical writers (publisher-ORG members with edit_canonical_when_publisher) and
  // legacy actor-owners can edit canonical sections directly, matching the backend (SP-1 + SP-1b).
  const canDirectCanonical = canWriteCanonicalDirect({ directWrite, objectOwner, canonical });
  const directOrBlocked = (canEditScope = true): ObjectWorkspaceModuleAccess => ({
    canDirectWrite: canDirectCanonical,
    canPrepareProposal,
    canSubmitProposal: false,
    disabledReason: canDirectCanonical && canEditScope ? null : proposalUnavailableReason,
  });

  return {
    generalInfo: directOrBlocked(),
    taxonomy: directOrBlocked(),
    publication: {
      canDirectWrite: canPublishObject,
      canPrepareProposal: false,
      canSubmitProposal: false,
      disabledReason: canPublishObject ? null : "Vos droits actuels ne permettent pas de publier ou de depublier cette fiche.",
    },
    syncIdentifiers: {
      canDirectWrite: false,
      canPrepareProposal: false,
      canSubmitProposal: false,
      disabledReason: "Le module A4 reste en lecture seule tant que l'administration des identifiants externes et des origines n'est pas branchee dans le workspace.",
    },
    location: {
      ...directOrBlocked(),
      canEditPlaces: false,
      // §41: zones (communes desservies) authoring — mirror canEditPlaceDescriptions (superuser/demo;
      // canonical-write enforced by object_zone RLS + save_object_places). Broaden to canonical later.
      canEditZones: session.demoMode || session.role === 'super_admin',
    },
    descriptions: {
      ...directOrBlocked(),
      canEditPlaceDescriptions: session.demoMode || session.role === 'super_admin',
      ...describeDescriptionsAccess({ directWrite, canonical, enrichment }),
    },
    media: {
      ...directOrBlocked(),
      canEditPlaceMedia: false,
    },
    contacts: directOrBlocked(),
    characteristics: {
      canDirectWrite: canWriteSafeWorkspaceRpc,
      canPrepareProposal: false,
      canSubmitProposal: false,
      disabledReason: canWriteSafeWorkspaceRpc ? null : "Vos droits actuels ne permettent pas d'utiliser le contrat d'ecriture commercial.",
    },
    distinctions: directOrBlocked(),
    capacityPolicies: {
      canDirectWrite: canWriteSafeWorkspaceRpc,
      canPrepareProposal: false,
      canSubmitProposal: false,
      disabledReason: canWriteSafeWorkspaceRpc ? null : "Vos droits actuels ne permettent pas d'utiliser le contrat d'ecriture commercial.",
    },
    pricing: {
      canDirectWrite: canWriteSafeWorkspaceRpc,
      canPrepareProposal: false,
      canSubmitProposal: false,
      disabledReason: canWriteSafeWorkspaceRpc ? null : "Vos droits actuels ne permettent pas d'utiliser le contrat d'ecriture commercial.",
    },
    rooms: directOrBlocked(),
    meetingRooms: directOrBlocked(),
    menus: directOrBlocked(),
    activity: directOrBlocked(),
    event: directOrBlocked(),
    itinerary: {
      ...directOrBlocked(),
      disabledReason: directWrite
        ? 'Les champs descriptifs sont enregistrables. La trace et la geometrie restent en lecture seule sans contrat d ecriture stable.'
        : proposalUnavailableReason,
    },
    openings: {
      canDirectWrite: canWriteSafeWorkspaceRpc,
      canPrepareProposal: false,
      canSubmitProposal: false,
      disabledReason: canWriteSafeWorkspaceRpc ? null : "Vos droits actuels ne permettent pas d'utiliser le contrat d'ecriture des horaires.",
    },
    providerFollowUp: {
      canDirectWrite: directWrite || canWriteProviderFollowUp,
      canPrepareProposal: false,
      canSubmitProposal: false,
      disabledReason:
        directWrite || canWriteProviderFollowUp
          ? null
          : "Vos droits actuels ne permettent pas de gerer le suivi relation prestataire sur cette fiche.",
    },
    relationships: {
      canDirectWrite: false,
      canPrepareProposal: false,
      canSubmitProposal: false,
      disabledReason: 'Le module D2 reste en lecture seule tant que les write-paths live des rattachements, acteurs et relations ne sont pas verrouilles.',
    },
    memberships: {
      canDirectWrite: directWrite,
      canPrepareProposal: false,
      canSubmitProposal: false,
      disabledReason: directWrite ? null : "Vos droits actuels ne permettent pas de gerer les adhesions de cette fiche.",
    },
    legal: {
      canDirectWrite: directWrite,
      canPrepareProposal: false,
      canSubmitProposal: false,
      disabledReason: directWrite ? null : "Vos droits actuels ne permettent pas de gerer la conformite juridique de cette fiche.",
    },
    tags: {
      canDirectWrite: canWriteSafeWorkspaceRpc,
      canPrepareProposal: false,
      canSubmitProposal: false,
      disabledReason: canWriteSafeWorkspaceRpc ? null : "Vos droits actuels ne permettent pas d'enregistrer les tags de cette fiche.",
    },
    sustainability: {
      canDirectWrite: canWriteSafeWorkspaceRpc,
      canPrepareProposal: false,
      canSubmitProposal: false,
      disabledReason: canWriteSafeWorkspaceRpc ? null : "Vos droits actuels ne permettent pas d'enregistrer la demarche durable.",
    },
    distribution: {
      canDirectWrite: false,
      canPrepareProposal: false,
      canSubmitProposal: false,
      disabledReason: "Les canaux de distribution restent en lecture seule tant que le contrat d'ecriture actor_channel n'est pas verrouille.",
    },
    provider: {
      canDirectWrite: false,
      canPrepareProposal: false,
      canSubmitProposal: false,
      disabledReason: "Le fournisseur reste en lecture seule — les complements passent par les modules Legal et Acteurs.",
    },
  };
}

// §46 — type→facet applicability (mirror of ref_facet_applicability + the DB triggers).
// A non-applicable module is disabled-with-reason (its saver skips persistence: same anti-clobber
// machinery as §28/§40/§41). Fail-open on fetch failure / missing rows — the DB trigger stays the
// hard gate, the UI gate is comfort. NOT a regression of §42 (that was an env flag hiding catalogs
// from everyone; this is per-type semantics sourced from the DB registry).
export interface FacetApplicabilityRow {
  facetTable: string;
  objectType: string;
}

export const TYPE_SPECIFIC_MODULE_FACETS = {
  rooms: 'object_room_type',
  meetingRooms: 'object_meeting_room',
  menus: 'object_menu',
  activity: 'object_act',
  event: 'object_fma',
  itinerary: 'object_iti',
} as const;

export function facetUnavailableReason(
  facetTable: string,
  objectType: string,
  rows: FacetApplicabilityRow[],
): string | null {
  if (!objectType) return null;
  const allowed = rows.filter((row) => row.facetTable === facetTable).map((row) => row.objectType);
  if (allowed.length === 0 || allowed.includes(objectType)) return null;
  return `Module non applicable au type ${objectType} (référentiel ref_facet_applicability).`;
}

async function getFacetApplicabilityRows(): Promise<FacetApplicabilityRow[]> {
  const session = useSessionStore.getState();
  if (session.demoMode) return [];
  const client = getSupabaseClient();
  if (!client) return [];
  const result = await client
    .from('ref_facet_applicability')
    .select('facet_table, object_type')
    .in('facet_table', Object.values(TYPE_SPECIFIC_MODULE_FACETS));
  if (result.error) return []; // fail open — see header comment
  return (result.data ?? []).map((row) => ({
    facetTable: readString((row as Record<string, unknown>).facet_table),
    objectType: readString((row as Record<string, unknown>).object_type),
  }));
}

export async function getObjectWorkspaceResource(objectId: string, langPrefs: string[]): Promise<ObjectWorkspaceResource> {
  const detail = await getObjectResource(objectId, langPrefs);
  const parsedModules = parseObjectWorkspace(detail, langPrefs);

  // The API workspace payload already carries the editable snapshot. Avoid probing
  // optional/type-specific REST tables on page load because many live schemas do
  // not expose those partitions through PostgREST.
  const [
    taxonomyModule,
    distinctionsModule,
    publicationModule,
    syncIdentifiersModule,
    openingsModule,
    relationshipsModule,
    legalModule,
    sustainabilityModule,
    tagsModule,
    contactsModule,
    characteristicsModule,
    locationModule,
    permissions,
  ] = await Promise.all([
    getObjectWorkspaceTaxonomyModule(objectId, parsedModules.taxonomy),
    getObjectWorkspaceDistinctionsModule(objectId, parsedModules.distinctions),
    getObjectWorkspacePublicationModule(objectId, detail, parsedModules.publication),
    getObjectWorkspaceSyncIdentifiersModule(objectId, parsedModules.syncIdentifiers),
    getObjectWorkspaceOpeningsModule(objectId, parsedModules.openings),
    getObjectWorkspaceRelationshipsModule(objectId, parsedModules.relationships),
    getObjectWorkspaceLegalModule(objectId, parsedModules.legal),
    getObjectWorkspaceSustainabilityModule(parsedModules.sustainability),
    getObjectWorkspaceTagsModule(objectId, parsedModules.tags),
    // Contacts kind/role reference data lives in ref_code (domain contact_kind) and
    // ref_contact_role — basic, all-object-type reference tables that the save path
    // (saveObjectWorkspaceContacts) already queries. Enriched unconditionally so the
    // editor's contact type/role dropdowns are populated, not behind the optional gate.
    getObjectWorkspaceContactsModule(objectId, parsedModules.contacts),
    // Amenity / payment / environment / language CATALOGS live in ref_amenity, ref_code and
    // ref_language — basic reference tables the save path already queries. Enriched unconditionally
    // (like contacts above) so the editor's selectors are populated with the full catalog from the
    // database, not just the object's existing values (which is all get_object_resource carries).
    // Without this, §10 accessibility equipment panels showed "0 / 0" and nothing was selectable.
    // See lot1_mapping_decisions §32.
    getObjectWorkspaceCharacteristicsModule(objectId, parsedModules.characteristics),
    // Zones (communes desservies): ref_commune catalog (public read) + the object's object_zone
    // (can_read_object). Enriched unconditionally like contacts/characteristics (§41).
    getObjectWorkspaceZonesModule(objectId, parsedModules.location),
    getObjectWorkspacePermissions(objectId),
  ]);

  const modules: ObjectWorkspaceModules = {
    ...parsedModules,
    location: locationModule,
    taxonomy: taxonomyModule,
    distinctions: distinctionsModule,
    publication: publicationModule,
    syncIdentifiers: syncIdentifiersModule,
    openings: openingsModule,
    relationships: relationshipsModule,
    legal: legalModule,
    sustainability: sustainabilityModule,
    tags: tagsModule,
    contacts: contactsModule,
    characteristics: characteristicsModule,
    distribution: parsedModules.distribution,
    provider: parsedModules.provider,
  };

  // §42: catalog enrichment for the type-specific / optional modules — moved OUT of the old
  // `ENABLE_OPTIONAL_WORKSPACE_REST_ENRICHMENT` gate so empty/new objects can ADD catalog values
  // (room types, price kinds/units, menu categories, capacity metrics, …), not just display
  // existing ones. Each fn degrades gracefully (base + `unavailableReason`, or Promise.allSettled
  // with per-result fallback) ⇒ a table not exposed via PostgREST shows "unavailable" for that
  // module, never breaks the load. Extends the §32 (characteristics) / §41 (zones) precedent.
  const placeLabelById = new Map(parsedModules.location.places.map((place) => [place.id, place.label]));
  const [
    mediaModule,
    capacityPoliciesModule,
    pricingModule,
    roomsModule,
    meetingRoomsModule,
    menusModule,
    activityModule,
    eventModule,
    itineraryModule,
    membershipsModule,
    facetRows,
  ] = await Promise.all([
    getObjectWorkspaceMediaModule(objectId, parsedModules.media, placeLabelById),
    getObjectWorkspaceCapacityPoliciesModule(objectId, parsedModules.capacityPolicies),
    getObjectWorkspacePricingModule(objectId, parsedModules.pricing),
    getObjectWorkspaceRoomsModule(objectId, parsedModules.rooms),
    getObjectWorkspaceMeetingRoomsModule(objectId, parsedModules.meetingRooms),
    getObjectWorkspaceMenusModule(objectId, parsedModules.menus),
    getObjectWorkspaceActivityModule(objectId, parsedModules.activity),
    getObjectWorkspaceEventModule(objectId, parsedModules.event),
    getObjectWorkspaceItineraryModule(objectId, parsedModules.itinerary),
    getObjectWorkspaceMembershipModule(objectId, detail, parsedModules.memberships),
    getFacetApplicabilityRows(),
  ]);

  Object.assign(modules, {
    media: mediaModule,
    capacityPolicies: capacityPoliciesModule,
    pricing: pricingModule,
    rooms: roomsModule,
    meetingRooms: meetingRoomsModule,
    menus: menusModule,
    activity: activityModule,
    event: eventModule,
    itinerary: itineraryModule,
    memberships: membershipsModule,
  });

  // §46: registry-driven type gating for the 6 type-specific modules. A non-applicable type
  // disables the module (its saver throws if invoked — defense-in-depth). Fail-open: empty
  // facetRows (fetch failed / unenrolled) ⇒ no gating; the DB trigger is the hard gate.
  const objectType = (detail.type ?? '').toUpperCase();
  for (const [moduleId, facetTable] of Object.entries(TYPE_SPECIFIC_MODULE_FACETS)) {
    const reason = facetUnavailableReason(facetTable, objectType, facetRows);
    if (!reason) continue;
    const current = modules[moduleId as keyof ObjectWorkspaceModules] as { unavailableReason?: string | null };
    if (current && typeof current === 'object') {
      current.unavailableReason = current.unavailableReason ?? reason;
    }
  }

  return {
    id: detail.id,
    name: detail.name,
    type: detail.type,
    detail,
    modules,
    permissions,
  };
}

export async function publishObjectWorkspace(objectId: string, publish: boolean): Promise<void> {
  const session = useSessionStore.getState();
  if (session.demoMode) {
    return;
  }

  const apiClient = getApiClient();
  if (!apiClient) {
    throw new Error('Connexion backend indisponible pour gerer la publication.');
  }

  const { error } = await apiClient.schema('api').rpc('rpc_publish_object', {
    p_object_id: objectId,
    p_publish: publish,
  });

  if (error) {
    throw mapMutationError(error, publish
      ? "Impossible de publier cette fiche."
      : "Impossible de retirer cette fiche de la publication.");
  }
}

export type ObjectLifecycleStatus = 'draft' | 'published' | 'hidden' | 'archived';

/** Maps rpc_set_object_status error codes to French UI messages. */
export function friendlyStatusError(error: { message?: string } | null | undefined): string {
  const msg = error?.message ?? '';
  if (msg.includes('FORBIDDEN')) return "Vos droits ne permettent pas de changer le statut de publication (permission publish_object requise).";
  if (msg.includes('INVALID_TRANSITION')) return "Ce changement de statut n'est pas autorisé depuis l'état actuel.";
  if (msg.includes('INVALID_STATUS')) return "Statut de publication inconnu.";
  if (msg.includes('NOT_FOUND')) return "Fiche introuvable.";
  if (msg.includes('NO_AUTH_CONTEXT')) return "Session expirée — reconnectez-vous.";
  return msg || "Changement de statut impossible.";
}

/** Sets object.status through the lifecycle RPC. Returns the resolved status. */
export async function setObjectStatus(objectId: string, status: ObjectLifecycleStatus): Promise<ObjectLifecycleStatus> {
  const session = useSessionStore.getState();
  if (session.demoMode) {
    return status;
  }
  const apiClient = getApiClient();
  if (!apiClient) {
    throw new Error('Connexion backend indisponible pour gerer le statut.');
  }
  const { data, error } = await apiClient.schema('api').rpc('rpc_set_object_status', {
    p_object_id: objectId,
    p_status: status,
  });
  if (error) {
    throw new Error(friendlyStatusError(error));
  }
  return (data as ObjectLifecycleStatus) ?? status;
}

export async function saveObjectWorkspaceGeneralInfo(objectId: string, input: ObjectWorkspaceGeneralInfo): Promise<void> {
  const session = useSessionStore.getState();
  if (session.demoMode) {
    return;
  }

  const client = getSupabaseClient();
  if (!client) {
    throw new Error('Connexion backend indisponible pour enregistrer les informations generales.');
  }

  const { error } = await client
    .from('object')
    .update({
      name: input.name,
      commercial_visibility: toNullableText(input.commercialVisibility) ?? 'active',
    })
    .eq('id', objectId);

  if (error) {
    throw mapMutationError(error, "Impossible d'enregistrer les informations generales.");
  }
}

export async function saveObjectWorkspaceTaxonomy(objectId: string, input: ObjectWorkspaceTaxonomyModule): Promise<void> {
  const session = useSessionStore.getState();
  if (session.demoMode) {
    return;
  }

  const client = getSupabaseClient();
  if (!client) {
    throw new Error('Connexion backend indisponible pour enregistrer la taxonomie structurante.');
  }

  const managedDomains = Array.from(new Set(
    input.domains
      .map((domain) => domain.domain.trim())
      .filter(Boolean),
  ));

  const [taxonomyNodesResult, existingAssignmentsResult] = await Promise.all([
    managedDomains.length > 0
      ? client
          .from('ref_code')
          .select('id, domain, code, is_assignable')
          .in('domain', managedDomains)
      : Promise.resolve({ data: [], error: null }),
    managedDomains.length > 0
      ? client
          .from('object_taxonomy')
          .select('id, domain, ref_code_id, source, note')
          .eq('object_id', objectId)
          .in('domain', managedDomains)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (taxonomyNodesResult.error) {
    throw mapMutationError(taxonomyNodesResult.error, 'Impossible de charger les noeuds de taxonomie.');
  }

  if (existingAssignmentsResult.error) {
    throw mapMutationError(existingAssignmentsResult.error, 'Impossible de charger les affectations de taxonomie.');
  }

  const nodeRows = ((taxonomyNodesResult.data ?? []) as Record<string, unknown>[])
    .map((row) => ({
      id: readString(row.id),
      domain: readString(row.domain),
      code: readString(row.code),
      isAssignable: row.is_assignable == null ? true : readBoolean(row.is_assignable),
    }));
  const nodeByDomainAndId = new Map(nodeRows.map((row) => [`${row.domain}:${row.id}`, row]));
  const nodeByDomainAndCode = new Map(nodeRows.map((row) => [`${row.domain}:${row.code.toLowerCase()}`, row]));
  const existingByDomain = new Map(
    ((existingAssignmentsResult.data ?? []) as Record<string, unknown>[])
      .map((row) => [readString(row.domain), row] as const),
  );

  const upsertRows: Array<Record<string, unknown>> = [];
  const keptDomains = new Set<string>();

  for (const domain of input.domains) {
    if (!domain.assignment) {
      continue;
    }

    const selectedNode =
      (domain.assignment.nodeId
        ? nodeByDomainAndId.get(`${domain.domain}:${domain.assignment.nodeId}`)
        : null)
      ?? nodeByDomainAndCode.get(`${domain.domain}:${domain.assignment.code.toLowerCase()}`)
      ?? null;

    if (!selectedNode) {
      throw new Error(`Noeud de taxonomie inconnu pour le domaine ${domain.label || domain.domain}.`);
    }

    if (!selectedNode.isAssignable) {
      throw new Error(`Le noeud ${domain.assignment.label || domain.assignment.code} ne peut pas etre assigne.`);
    }

    const existing = existingByDomain.get(domain.domain);
    upsertRows.push({
      object_id: objectId,
      domain: domain.domain,
      ref_code_id: selectedNode.id,
      source: 'workspace_taxonomy',
      note: existing ? existing.note ?? null : null,
    });
    keptDomains.add(domain.domain);
  }

  if (upsertRows.length > 0) {
    const { error } = await client
      .from('object_taxonomy')
      .upsert(upsertRows, { onConflict: 'object_id,domain' });

    if (error) {
      throw mapMutationError(error, "Impossible d'enregistrer la taxonomie structurante.");
    }
  }

  const domainsToDelete = managedDomains.filter((domain) => !keptDomains.has(domain));
  if (domainsToDelete.length > 0) {
    const { error } = await client
      .from('object_taxonomy')
      .delete()
      .eq('object_id', objectId)
      .in('domain', domainsToDelete);

    if (error) {
      throw mapMutationError(error, "Impossible de supprimer les affectations de taxonomie retirees.");
    }
  }
}

export async function saveObjectWorkspaceDistinctions(objectId: string, input: ObjectWorkspaceDistinctionsModule): Promise<void> {
  const session = useSessionStore.getState();
  if (session.demoMode) {
    return;
  }

  const client = getSupabaseClient();
  if (!client) {
    throw new Error('Connexion backend indisponible pour enregistrer les labels et distinctions.');
  }

  const [schemeRefsResult, valueRefsResult, existingClassificationsResult] = await Promise.all([
    client
      .from('ref_classification_scheme')
      .select('id, code, name, description, selection, position, display_group, is_distinction')
      .or('is_distinction.eq.true,display_group.eq.accessibility_labels')
      .order('position', { ascending: true }),
    client.from('ref_classification_value').select('id, scheme_id, code, name, ordinal, metadata'),
    client.from('object_classification').select('id, scheme_id, value_id').eq('object_id', objectId),
  ]);

  if (schemeRefsResult.error) {
    throw mapMutationError(schemeRefsResult.error, 'Impossible de charger les schemas de distinction.');
  }
  if (valueRefsResult.error) {
    throw mapMutationError(valueRefsResult.error, 'Impossible de charger les valeurs de distinction.');
  }
  if (existingClassificationsResult.error) {
    throw mapMutationError(existingClassificationsResult.error, 'Impossible de charger les labels existants.');
  }

  const schemeRows = (schemeRefsResult.data ?? []) as Record<string, unknown>[];
  const allSchemes = [
    ...schemeRows.filter(isDistinctionClassificationScheme).map(normalizeClassificationSchemeRef),
    ...schemeRows.filter(isAccessibilityClassificationScheme).map(normalizeClassificationSchemeRef),
  ];
  const schemeById = new Map(allSchemes.map((scheme) => [scheme.id, scheme]));
  const allowedSchemeIds = new Set(allSchemes.map((scheme) => scheme.id));

  const valueRefs = (valueRefsResult.data ?? [])
    .map((row) => row as Record<string, unknown>)
    .map(normalizeClassificationValueRef)
    .filter((value) => allowedSchemeIds.has(value.schemeId));
  const valueByCompositeKey = new Map(valueRefs.map((value) => [`${value.schemeId}:${value.code.toLowerCase()}`, value]));

  const existingRows = ((existingClassificationsResult.data ?? []) as Record<string, unknown>[])
    .filter((row) => allowedSchemeIds.has(readString(row.scheme_id)));
  const existingIds = new Set(existingRows.map((row) => readString(row.id)).filter(Boolean));
  const reusableRowsByKey = new Map(existingRows.map((row) => [`${readString(row.scheme_id)}:${readString(row.value_id)}`, readString(row.id)]));
  const keptIds = new Set<string>();

  const allItems: ObjectWorkspaceDistinctionItem[] = [
    ...input.distinctionGroups.flatMap((group) => group.items),
    ...input.accessibilityLabels,
  ];

  for (const item of allItems) {
    const normalizedSchemeId = item.schemeId || (allSchemes.find((s) => s.code === item.schemeCode)?.id ?? '');
    const schemeRef = schemeById.get(normalizedSchemeId);
    if (!schemeRef) {
      continue;
    }

    const normalizedValue = valueByCompositeKey.get(`${schemeRef.id}:${item.valueCode.toLowerCase()}`);
    if (!normalizedValue) {
      throw new Error(`Valeur de distinction inconnue: ${item.valueCode || 'vide'}.`);
    }

    const payload = {
      object_id: objectId,
      scheme_id: schemeRef.id,
      value_id: normalizedValue.id,
      status: toNullableText(item.status),
      awarded_at: toNullableText(item.awardedAt),
      valid_until: toNullableText(item.validUntil),
      // §10 T&H per-disability-type coverage: resolve the chip codes to granted_* sub-value UUIDs.
      // Empty for non-accessibility distinctions (their disabilityTypesCovered is always []).
      subvalue_ids: buildClassificationSubvalueIds(item.disabilityTypesCovered, schemeRef.id, valueRefs),
    };

    const existingId =
      (item.recordId && existingIds.has(item.recordId) ? item.recordId : null)
      ?? reusableRowsByKey.get(`${schemeRef.id}:${normalizedValue.id}`)
      ?? null;

    if (existingId) {
      const { error } = await client.from('object_classification').update(payload).eq('id', existingId);
      if (error) {
        throw mapMutationError(error, "Impossible d'enregistrer un label ou une distinction.");
      }
      keptIds.add(existingId);
    } else {
      const { data, error } = await client.from('object_classification').insert(payload).select('id').single();
      if (error) {
        throw mapMutationError(error, "Impossible de creer un label ou une distinction.");
      }
      keptIds.add(readString((data as Record<string, unknown>).id));
    }
  }

  const idsToDelete = Array.from(existingIds).filter((id) => !keptIds.has(id));
  if (idsToDelete.length > 0) {
    const { error } = await client.from('object_classification').delete().in('id', idsToDelete);
    if (error) {
      throw mapMutationError(error, "Impossible de supprimer les labels retires.");
    }
  }
}

export async function saveObjectWorkspaceCharacteristics(objectId: string, input: ObjectWorkspaceCharacteristicsModule): Promise<void> {
  const session = useSessionStore.getState();
  if (session.demoMode) {
    return;
  }

  await callObjectWorkspaceRpc('save_object_commercial', objectId, {
    languages: input.selectedLanguages.map((item) => ({
      language_id: toRpcUuid(item.languageId),
      language_code: item.code || null,
      level_id: toRpcUuid(item.levelId),
      level_code: item.levelCode || null,
    })),
    payment_methods: Array.from(new Set(input.selectedPaymentCodes)).map((code) => ({
      payment_method_code: code,
    })),
    environment_tags: Array.from(new Set(input.selectedEnvironmentCodes)).map((code) => ({
      environment_tag_code: code,
    })),
    amenities: Array.from(new Set(input.selectedAmenityCodes)).map((code) => ({
      amenity_code: code,
    })),
  }, 'Impossible d enregistrer les caracteristiques.');
}

export async function saveObjectWorkspaceCapacityPolicies(objectId: string, input: ObjectWorkspaceCapacityPoliciesModule): Promise<void> {
  const session = useSessionStore.getState();
  if (session.demoMode) {
    return;
  }

  await callObjectWorkspaceRpc('save_object_commercial', objectId, {
    capacities: input.capacityItems.map((item) => ({
      id: toRpcUuid(item.recordId),
      metric_id: toRpcUuid(item.metricId),
      metric_code: item.metricCode || null,
      value_integer: toNullableInteger(item.value),
      effective_from: toNullableText(item.effectiveFrom),
      effective_to: toNullableText(item.effectiveTo),
    })),
    group_policy: {
      min_size: toNullableInteger(input.groupPolicy.minSize),
      max_size: toNullableInteger(input.groupPolicy.maxSize),
      group_only: input.groupPolicy.groupOnly,
      notes: toNullableText(input.groupPolicy.notes),
    },
    pet_policy: {
      accepted: input.petPolicy.accepted,
      conditions: toNullableText(input.petPolicy.conditions),
    },
  }, 'Impossible d enregistrer capacites et politiques.');
}

export async function saveObjectWorkspacePricing(objectId: string, input: ObjectWorkspacePricingModule): Promise<void> {
  const session = useSessionStore.getState();
  if (session.demoMode) {
    return;
  }

  await callObjectWorkspaceRpc('save_object_commercial', objectId, {
    discounts: input.discounts.map((discount) => ({
      id: toRpcUuid(discount.recordId),
      conditions: toNullableText(discount.conditions),
      discount_percent: toNullableNumber(discount.discountPercent),
      discount_amount: toNullableNumber(discount.discountAmount),
      currency: toNullableText(discount.currency),
      min_group_size: toNullableInteger(discount.minGroupSize),
      max_group_size: toNullableInteger(discount.maxGroupSize),
      valid_from: toNullableText(discount.validFrom),
      valid_to: toNullableText(discount.validTo),
      source: toNullableText(discount.source),
    })),
    prices: input.prices.map((price) => ({
      id: toRpcUuid(price.recordId),
      kind_id: toRpcUuid(price.kindId),
      kind_code: price.kindCode || null,
      unit_id: toRpcUuid(price.unitId),
      unit_code: price.unitCode || null,
      amount: toNullableNumber(price.amount),
      amount_max: toNullableNumber(price.amountMax),
      currency: toNullableText(price.currency) ?? 'EUR',
      season_code: toNullableText(price.seasonCode),
      indication_code: toNullableText(price.indicationCode),
      age_min_enfant: toNullableInteger(price.ageMinEnfant),
      age_max_enfant: toNullableInteger(price.ageMaxEnfant),
      age_min_junior: toNullableInteger(price.ageMinJunior),
      age_max_junior: toNullableInteger(price.ageMaxJunior),
      valid_from: toNullableText(price.validFrom),
      valid_to: toNullableText(price.validTo),
      conditions: toNullableText(price.conditions),
      source: toNullableText(price.source),
      periods: price.periods.map((period) => ({
        id: toRpcUuid(period.recordId),
        start_date: toNullableText(period.startDate),
        end_date: toNullableText(period.endDate),
        start_time: toNullableText(period.startTime),
        end_time: toNullableText(period.endTime),
        note: toNullableText(period.note),
      })),
    })),
  }, 'Impossible d enregistrer les tarifs.');
}

export async function saveObjectWorkspaceOpenings(objectId: string, input: ObjectWorkspaceOpeningsModule): Promise<void> {
  const session = useSessionStore.getState();
  if (session.demoMode) {
    return;
  }

  await callObjectWorkspaceRpc('save_object_openings', objectId, {
    periods: input.periods.map((period, periodIndex) => {
      const openTimePeriods = period.weekdays
        .map((weekday) => {
          const frames = weekday.slots
            .map((slot) => ({
              start_time: toNullableText(slot.start),
              end_time: toNullableText(slot.end),
            }))
            .filter((slot) => slot.start_time || slot.end_time);

          return {
            closed: false,
            weekdays: [{ weekday_code: normalizeOpeningWeekdayCode(weekday.code) }],
            time_frames: frames,
          };
        })
        .filter((timePeriod) => timePeriod.weekdays[0]?.weekday_code);
      const openCodes = new Set(openTimePeriods.map((timePeriod) => timePeriod.weekdays[0]?.weekday_code));
      const closedTimePeriods = Array.from(new Set(period.closedDays.map(normalizeOpeningWeekdayCode)))
        .filter((weekdayCode) => weekdayCode && !openCodes.has(weekdayCode))
        .map((weekdayCode) => ({
          closed: true,
          weekdays: [{ weekday_code: weekdayCode }],
          time_frames: [],
        }));

      return {
        id: toRpcUuid(period.recordId),
        name: toNullableText(period.label),
        date_start: period.allYears ? null : toNullableText(period.startDate),
        date_end: period.allYears ? null : toNullableText(period.endDate),
        all_years: period.allYears,
        extra: {
          workspace_bucket: period.bucket,
          workspace_order: period.order || String(periodIndex + 1),
        },
        schedules: [
          {
            schedule_type_code: 'regular',
            name: 'Horaires',
            time_periods: [...openTimePeriods, ...closedTimePeriods],
          },
        ],
      };
    }),
  }, 'Impossible d enregistrer les horaires.');
}

export async function saveObjectWorkspaceSustainability(
  objectId: string,
  input: ObjectWorkspaceSustainabilityModule,
): Promise<void> {
  const session = useSessionStore.getState();
  if (session.demoMode) {
    return;
  }

  await callObjectWorkspaceRpc('save_object_workspace_sustainability', objectId, {
    actions: input.categories.flatMap((category) =>
      category.actions
        .filter((action) => action.selected)
        .map((action) => ({
          action_id: toRpcUuid(action.id),
          action_code: action.code,
          category_code: category.code,
          note: toNullableText(action.note),
          document_id: toRpcUuid(action.documentId),
        })),
    ),
  }, 'Impossible d enregistrer la demarche durable.');
}

export async function saveObjectWorkspaceTags(objectId: string, input: ObjectWorkspaceTagsModule): Promise<void> {
  const session = useSessionStore.getState();
  if (session.demoMode) {
    return;
  }

  await callObjectWorkspaceRpc('save_object_workspace_tags', objectId, {
    tags: input.displayed.map((tag) => ({
      tag_id: toRpcUuid(tag.tagId),
      slug: tag.slug,
      // Only color_variant and source go into tag_link.extra; label is read from ref_tag at load time
      // and must not be persisted per-object (it would diverge from ref_tag.name on renames).
      extra: {
        color_variant: tag.colorVariant,
        source: tag.source,
      },
    })),
  }, 'Impossible d enregistrer les tags.');
}

function buildCodeIdMap(rows: unknown[]): Map<string, string> {
  return new Map(
    rows.map((entry) => {
      const row = readRecord(entry);
      return [readString(row.code).toLowerCase(), readString(row.id)] as const;
    }).filter(([code, id]) => Boolean(code && id)),
  );
}

function ensureKnownCodes(codes: string[], idByCode: Map<string, string>, label: string): void {
  const unknown = codes.find((code) => code && !idByCode.has(code.toLowerCase()));
  if (unknown) {
    throw new Error(`${label} inconnu: ${unknown}.`);
  }
}

export async function saveObjectWorkspaceRooms(objectId: string, input: ObjectWorkspaceRoomsModule): Promise<void> {
  const session = useSessionStore.getState();
  if (session.demoMode) {
    return;
  }
  // §46: a type-gated module loads disabled and can't go dirty — this is unreachable in the normal
  // flow; throw (don't silently return) so a stray invocation routes to useEditorSave's `failed`
  // path with the reason visible, never a silent write-trap.
  if (input.unavailableReason) {
    throw new Error(input.unavailableReason);
  }

  const client = getSupabaseClient();
  if (!client) {
    throw new Error('Connexion backend indisponible pour enregistrer les chambres et unites.');
  }

  const [viewRefsResult, amenityRefsResult, existingRoomsResult] = await Promise.all([
    client.from('ref_code').select('id, code').eq('domain', 'view_type'),
    client.from('ref_amenity').select('id, code'),
    client.from('object_room_type').select('id').eq('object_id', objectId),
  ]);

  if (viewRefsResult.error) {
    throw mapMutationError(viewRefsResult.error, 'Impossible de charger les types de vue.');
  }
  if (amenityRefsResult.error) {
    throw mapMutationError(amenityRefsResult.error, 'Impossible de charger les equipements.');
  }
  if (existingRoomsResult.error) {
    throw mapMutationError(existingRoomsResult.error, 'Impossible de charger les chambres existantes.');
  }

  const viewIdByCode = buildCodeIdMap(viewRefsResult.data ?? []);
  const amenityIdByCode = buildCodeIdMap(amenityRefsResult.data ?? []);
  const viewCodes = input.items.map((item) => item.viewTypeCode).filter(Boolean);
  ensureKnownCodes(viewCodes, viewIdByCode, 'Type de vue');
  ensureKnownCodes(input.items.flatMap((item) => item.amenityCodes), amenityIdByCode, 'Equipement');

  const existingRoomIds = (existingRoomsResult.data ?? [])
    .map((row) => readString((row as Record<string, unknown>).id))
    .filter(Boolean);
  if (existingRoomIds.length > 0) {
    const [deleteAmenityLinks, deleteMediaLinks] = await Promise.all([
      client.from('object_room_type_amenity').delete().in('room_type_id', existingRoomIds),
      client.from('object_room_type_media').delete().in('room_type_id', existingRoomIds),
    ]);
    if (deleteAmenityLinks.error) {
      throw mapMutationError(deleteAmenityLinks.error, 'Impossible de reinitialiser les equipements de chambre.');
    }
    if (deleteMediaLinks.error) {
      throw mapMutationError(deleteMediaLinks.error, 'Impossible de reinitialiser les medias lies aux chambres.');
    }
  }

  const { error: deleteRoomsError } = await client.from('object_room_type').delete().eq('object_id', objectId);
  if (deleteRoomsError) {
    throw mapMutationError(deleteRoomsError, 'Impossible de reinitialiser les chambres.');
  }

  for (const item of input.items) {
    const payload = {
      object_id: objectId,
      code: toNullableText(item.code),
      name: toNullableText(item.name) ?? 'Unite',
      name_i18n: item.nameTranslations,
      description: toNullableText(item.description),
      description_i18n: item.descriptionTranslations,
      capacity_adults: toNullableInteger(item.capacityAdults),
      capacity_children: toNullableInteger(item.capacityChildren),
      capacity_total: toNullableInteger(item.capacityTotal),
      size_sqm: toNullableNumber(item.sizeSqm),
      bed_config: toNullableText(item.bedConfig),
      bed_config_i18n: item.bedConfigTranslations,
      total_rooms: toNullableInteger(item.quantity),
      floor_level: toNullableText(item.floorLevel),
      view_type_id: item.viewTypeCode ? viewIdByCode.get(item.viewTypeCode.toLowerCase()) ?? null : null,
      room_type_id: item.roomTypeId || null,
      base_price: toNullableNumber(item.basePrice),
      currency: toNullableText(item.currency) ?? 'EUR',
      is_accessible: item.accessible,
      is_published: item.published,
      position: toNullableInteger(item.position),
    };
    const { data, error } = await client.from('object_room_type').insert(payload).select('id').single();
    if (error) {
      throw mapMutationError(error, 'Impossible de sauvegarder une chambre ou unite.');
    }
    const roomId = readString((data as Record<string, unknown>).id);
    const amenityRows = Array.from(new Set(item.amenityCodes))
      .map((code) => ({
        room_type_id: roomId,
        amenity_id: amenityIdByCode.get(code.toLowerCase()) as string,
      }));
    if (amenityRows.length > 0) {
      const { error: amenityError } = await client.from('object_room_type_amenity').insert(amenityRows);
      if (amenityError) {
        throw mapMutationError(amenityError, 'Impossible de sauvegarder les equipements de chambre.');
      }
    }
    const mediaRows = Array.from(new Set(item.mediaIds))
      .filter((mediaId) => isUuid(mediaId))
      .map((mediaId) => ({ room_type_id: roomId, media_id: mediaId }));
    if (mediaRows.length > 0) {
      const { error: mediaError } = await client.from('object_room_type_media').insert(mediaRows);
      if (mediaError) {
        throw mapMutationError(mediaError, 'Impossible de sauvegarder les medias de chambre.');
      }
    }
  }
}

export async function saveObjectWorkspaceMeetingRooms(objectId: string, input: ObjectWorkspaceMeetingRoomsModule): Promise<void> {
  const session = useSessionStore.getState();
  if (session.demoMode) {
    return;
  }
  // §46: type-gated module — throw (not silent return) so a stray save routes to the failed path.
  if (input.unavailableReason) {
    throw new Error(input.unavailableReason);
  }

  const client = getSupabaseClient();
  if (!client) {
    throw new Error('Connexion backend indisponible pour enregistrer les salles MICE.');
  }

  const [equipmentRefsResult, existingRoomsResult] = await Promise.all([
    client.from('ref_code').select('id, code').eq('domain', 'meeting_equipment'),
    client.from('object_meeting_room').select('id').eq('object_id', objectId),
  ]);

  if (equipmentRefsResult.error) {
    throw mapMutationError(equipmentRefsResult.error, 'Impossible de charger les equipements MICE.');
  }
  if (existingRoomsResult.error) {
    throw mapMutationError(existingRoomsResult.error, 'Impossible de charger les salles MICE existantes.');
  }

  const equipmentIdByCode = buildCodeIdMap(equipmentRefsResult.data ?? []);
  ensureKnownCodes(input.items.flatMap((item) => item.equipmentCodes), equipmentIdByCode, 'Equipement MICE');
  const existingRoomIds = (existingRoomsResult.data ?? [])
    .map((row) => readString((row as Record<string, unknown>).id))
    .filter(Boolean);
  if (existingRoomIds.length > 0) {
    const { error } = await client.from('meeting_room_equipment').delete().in('room_id', existingRoomIds);
    if (error) {
      throw mapMutationError(error, 'Impossible de reinitialiser les equipements MICE.');
    }
  }
  const { error: deleteRoomsError } = await client.from('object_meeting_room').delete().eq('object_id', objectId);
  if (deleteRoomsError) {
    throw mapMutationError(deleteRoomsError, 'Impossible de reinitialiser les salles MICE.');
  }

  for (const item of input.items) {
    const payload = {
      object_id: objectId,
      name: toNullableText(item.name) ?? 'Salle',
      name_i18n: item.nameTranslations,
      area_m2: toNullableNumber(item.areaM2),
      cap_theatre: toNullableInteger(item.capacityTheatre),
      cap_u: toNullableInteger(item.capacityU),
      cap_classroom: toNullableInteger(item.capacityClassroom),
      cap_boardroom: toNullableInteger(item.capacityBoardroom),
    };
    const { data, error } = await client.from('object_meeting_room').insert(payload).select('id').single();
    if (error) {
      throw mapMutationError(error, 'Impossible de sauvegarder une salle MICE.');
    }
    const roomId = readString((data as Record<string, unknown>).id);
    const equipmentRows = Array.from(new Set(item.equipmentCodes))
      .map((code) => ({
        room_id: roomId,
        equipment_id: equipmentIdByCode.get(code.toLowerCase()) as string,
      }));
    if (equipmentRows.length > 0) {
      const { error: equipmentError } = await client.from('meeting_room_equipment').insert(equipmentRows);
      if (equipmentError) {
        throw mapMutationError(equipmentError, 'Impossible de sauvegarder les equipements MICE.');
      }
    }
  }
}

export async function saveObjectWorkspaceMenus(objectId: string, input: ObjectWorkspaceMenusModule): Promise<void> {
  const session = useSessionStore.getState();
  if (session.demoMode) {
    return;
  }
  // §46: type-gated module — throw (not silent return) so a stray save routes to the failed path.
  if (input.unavailableReason) {
    throw new Error(input.unavailableReason);
  }

  const client = getSupabaseClient();
  if (!client) {
    throw new Error('Connexion backend indisponible pour enregistrer les menus.');
  }

  const [
    categoryRefsResult,
    dietaryRefsResult,
    allergenRefsResult,
    cuisineRefsResult,
    kindRefsResult,
    unitRefsResult,
    existingMenusResult,
  ] = await Promise.all([
    client.from('ref_code').select('id, code').eq('domain', 'menu_category'),
    client.from('ref_code').select('id, code').eq('domain', 'dietary_tag'),
    client.from('ref_code').select('id, code').eq('domain', 'allergen'),
    client.from('ref_code').select('id, code').eq('domain', 'cuisine_type'),
    client.from('ref_code').select('id, code').eq('domain', 'price_kind'),
    client.from('ref_code').select('id, code').eq('domain', 'price_unit'),
    client.from('object_menu').select('id').eq('object_id', objectId),
  ]);

  if (categoryRefsResult.error) {
    throw mapMutationError(categoryRefsResult.error, 'Impossible de charger les categories de menu.');
  }
  if (dietaryRefsResult.error) {
    throw mapMutationError(dietaryRefsResult.error, 'Impossible de charger les tags alimentaires.');
  }
  if (allergenRefsResult.error) {
    throw mapMutationError(allergenRefsResult.error, 'Impossible de charger les allergenes.');
  }
  if (cuisineRefsResult.error) {
    throw mapMutationError(cuisineRefsResult.error, 'Impossible de charger les cuisines.');
  }
  if (kindRefsResult.error) {
    throw mapMutationError(kindRefsResult.error, 'Impossible de charger les types de prix.');
  }
  if (unitRefsResult.error) {
    throw mapMutationError(unitRefsResult.error, 'Impossible de charger les unites de prix.');
  }
  if (existingMenusResult.error) {
    throw mapMutationError(existingMenusResult.error, 'Impossible de charger les menus existants.');
  }

  const categoryIdByCode = buildCodeIdMap(categoryRefsResult.data ?? []);
  const dietaryIdByCode = buildCodeIdMap(dietaryRefsResult.data ?? []);
  const allergenIdByCode = buildCodeIdMap(allergenRefsResult.data ?? []);
  const cuisineIdByCode = buildCodeIdMap(cuisineRefsResult.data ?? []);
  const kindIdByCode = buildCodeIdMap(kindRefsResult.data ?? []);
  const unitIdByCode = buildCodeIdMap(unitRefsResult.data ?? []);
  ensureKnownCodes(input.items.map((menu) => menu.categoryCode).filter(Boolean), categoryIdByCode, 'Categorie de menu');
  ensureKnownCodes(input.items.flatMap((menu) => menu.items.map((item) => item.kindCode).filter(Boolean)), kindIdByCode, 'Type de prix');
  ensureKnownCodes(input.items.flatMap((menu) => menu.items.map((item) => item.unitCode).filter(Boolean)), unitIdByCode, 'Unite de prix');
  ensureKnownCodes(input.items.flatMap((menu) => menu.items.flatMap((item) => item.dietaryTagCodes)), dietaryIdByCode, 'Tag alimentaire');
  ensureKnownCodes(input.items.flatMap((menu) => menu.items.flatMap((item) => item.allergenCodes)), allergenIdByCode, 'Allergene');
  ensureKnownCodes(input.items.flatMap((menu) => menu.items.flatMap((item) => item.cuisineTypeCodes)), cuisineIdByCode, 'Cuisine');

  const existingMenuIds = (existingMenusResult.data ?? [])
    .map((row) => readString((row as Record<string, unknown>).id))
    .filter(Boolean);
  if (existingMenuIds.length > 0) {
    const existingItems = await client.from('object_menu_item').select('id').in('menu_id', existingMenuIds);
    if (existingItems.error) {
      throw mapMutationError(existingItems.error, 'Impossible de charger les lignes de menu existantes.');
    }
    const existingItemIds = (existingItems.data ?? [])
      .map((row) => readString((row as Record<string, unknown>).id))
      .filter(Boolean);
    if (existingItemIds.length > 0) {
      const [deleteMedia, deleteDietary, deleteAllergens, deleteCuisine] = await Promise.all([
        client.from('object_menu_item_media').delete().in('menu_item_id', existingItemIds),
        client.from('object_menu_item_dietary_tag').delete().in('menu_item_id', existingItemIds),
        client.from('object_menu_item_allergen').delete().in('menu_item_id', existingItemIds),
        client.from('object_menu_item_cuisine_type').delete().in('menu_item_id', existingItemIds),
      ]);
      if (deleteMedia.error) {
        throw mapMutationError(deleteMedia.error, 'Impossible de reinitialiser les medias de menu.');
      }
      if (deleteDietary.error) {
        throw mapMutationError(deleteDietary.error, 'Impossible de reinitialiser les tags alimentaires.');
      }
      if (deleteAllergens.error) {
        throw mapMutationError(deleteAllergens.error, 'Impossible de reinitialiser les allergenes.');
      }
      if (deleteCuisine.error) {
        throw mapMutationError(deleteCuisine.error, 'Impossible de reinitialiser les cuisines.');
      }
    }
    const { error: deleteItemsError } = await client.from('object_menu_item').delete().in('menu_id', existingMenuIds);
    if (deleteItemsError) {
      throw mapMutationError(deleteItemsError, 'Impossible de reinitialiser les lignes de menu.');
    }
  }
  const { error: deleteMenusError } = await client.from('object_menu').delete().eq('object_id', objectId);
  if (deleteMenusError) {
    throw mapMutationError(deleteMenusError, 'Impossible de reinitialiser les menus.');
  }

  for (const menu of input.items) {
    const menuPayload = {
      object_id: objectId,
      category_id: menu.categoryCode ? categoryIdByCode.get(menu.categoryCode.toLowerCase()) ?? null : null,
      name: toNullableText(menu.name) ?? 'Menu',
      description: toNullableText(menu.description),
      is_active: menu.active,
      visibility: toNullableText(menu.visibility) ?? 'public',
      position: toNullableInteger(menu.position),
    };
    const { data: menuData, error: menuError } = await client.from('object_menu').insert(menuPayload).select('id').single();
    if (menuError) {
      throw mapMutationError(menuError, 'Impossible de sauvegarder un menu.');
    }
    const menuId = readString((menuData as Record<string, unknown>).id);
    for (const item of menu.items) {
      const mediaIds = Array.from(new Set(item.mediaIds ?? [])).filter((mediaId) => isUuid(mediaId));
      const itemPayload = {
        menu_id: menuId,
        name: toNullableText(item.name) ?? 'Ligne',
        description: toNullableText(item.description),
        price: toNullableNumber(item.price),
        currency: toNullableText(item.currency) ?? 'EUR',
        kind_id: item.kindCode ? kindIdByCode.get(item.kindCode.toLowerCase()) ?? null : null,
        unit_id: item.unitCode ? unitIdByCode.get(item.unitCode.toLowerCase()) ?? null : null,
        media_id: mediaIds[0] ?? null,
        is_available: item.available,
        position: toNullableInteger(item.position),
      };
      const { data: itemData, error: itemError } = await client.from('object_menu_item').insert(itemPayload).select('id').single();
      if (itemError) {
        throw mapMutationError(itemError, 'Impossible de sauvegarder une ligne de menu.');
      }
      const itemId = readString((itemData as Record<string, unknown>).id);
      const dietaryRows = Array.from(new Set(item.dietaryTagCodes)).map((code) => ({
        menu_item_id: itemId,
        dietary_tag_id: dietaryIdByCode.get(code.toLowerCase()) as string,
      }));
      const allergenRows = Array.from(new Set(item.allergenCodes)).map((code) => ({
        menu_item_id: itemId,
        allergen_id: allergenIdByCode.get(code.toLowerCase()) as string,
      }));
      const cuisineRows = Array.from(new Set(item.cuisineTypeCodes)).map((code) => ({
        menu_item_id: itemId,
        cuisine_type_id: cuisineIdByCode.get(code.toLowerCase()) as string,
      }));
      const mediaRows = mediaIds.map((mediaId, mediaIndex) => ({
        menu_item_id: itemId,
        media_id: mediaId,
        position: mediaIndex + 1,
      }));
      if (mediaRows.length > 0) {
        const { error } = await client.from('object_menu_item_media').insert(mediaRows);
        if (error) {
          throw mapMutationError(error, 'Impossible de sauvegarder les medias de menu.');
        }
      }
      if (dietaryRows.length > 0) {
        const { error } = await client.from('object_menu_item_dietary_tag').insert(dietaryRows);
        if (error) {
          throw mapMutationError(error, 'Impossible de sauvegarder les tags alimentaires.');
        }
      }
      if (allergenRows.length > 0) {
        const { error } = await client.from('object_menu_item_allergen').insert(allergenRows);
        if (error) {
          throw mapMutationError(error, 'Impossible de sauvegarder les allergenes.');
        }
      }
      if (cuisineRows.length > 0) {
        const { error } = await client.from('object_menu_item_cuisine_type').insert(cuisineRows);
        if (error) {
          throw mapMutationError(error, 'Impossible de sauvegarder les cuisines.');
        }
      }
    }
  }
}

export async function saveObjectWorkspaceActivity(objectId: string, input: ObjectWorkspaceActivityModule): Promise<void> {
  const session = useSessionStore.getState();
  if (session.demoMode) {
    return;
  }
  // §46: type-gated module — throw (not silent return) so a stray save routes to the failed path.
  if (input.unavailableReason) {
    throw new Error(input.unavailableReason);
  }

  const client = getSupabaseClient();
  if (!client) {
    throw new Error('Connexion backend indisponible pour enregistrer le detail activite.');
  }

  const { error } = await client.from('object_act').upsert({
    object_id: objectId,
    duration_min: toNullableInteger(input.durationMin),
    min_participants: toNullableInteger(input.minParticipants),
    max_participants: toNullableInteger(input.maxParticipants),
    difficulty_level: toNullableText(input.difficultyLevel),
    guide_required: input.guideRequired,
    min_age: toNullableInteger(input.minAge),
    equipment_provided: toNullableText(input.equipmentProvided),
  }, { onConflict: 'object_id' });

  if (error) {
    throw mapMutationError(error, 'Impossible de sauvegarder le detail activite.');
  }
}

export async function saveObjectWorkspaceEvent(objectId: string, input: ObjectWorkspaceEventModule): Promise<void> {
  const session = useSessionStore.getState();
  if (session.demoMode) {
    return;
  }
  // §46: type-gated module — throw (not silent return) so a stray save routes to the failed path.
  // (event also deletes all object_fma_occurrence rows before reinserting — worst clobber risk.)
  if (input.unavailableReason) {
    throw new Error(input.unavailableReason);
  }

  const client = getSupabaseClient();
  if (!client) {
    throw new Error('Connexion backend indisponible pour enregistrer la programmation.');
  }

  const { error } = await client.from('object_fma').upsert({
    object_id: objectId,
    event_start_date: toNullableText(input.startDate),
    event_end_date: toNullableText(input.endDate),
    event_start_time: toNullableText(input.startTime),
    event_end_time: toNullableText(input.endTime),
    is_recurring: input.recurring,
    recurrence_pattern: toNullableText(input.recurrenceText),
  }, { onConflict: 'object_id' });

  if (error) {
    throw mapMutationError(error, 'Impossible de sauvegarder la programmation.');
  }

  const { error: deleteOccurrencesError } = await client.from('object_fma_occurrence').delete().eq('object_id', objectId);
  if (deleteOccurrencesError) {
    throw mapMutationError(deleteOccurrencesError, 'Impossible de reinitialiser les occurrences.');
  }

  const occurrenceRows = input.occurrences
    .filter((occurrence) => occurrence.startAt || occurrence.endAt)
    .map((occurrence) => ({
      object_id: objectId,
      start_at: toNullableText(occurrence.startAt),
      end_at: toNullableText(occurrence.endAt),
      state: toNullableText(occurrence.state) ?? 'scheduled',
    }));
  if (occurrenceRows.length > 0) {
    const { error: occurrencesError } = await client.from('object_fma_occurrence').insert(occurrenceRows);
    if (occurrencesError) {
      throw mapMutationError(occurrencesError, 'Impossible de sauvegarder les occurrences.');
    }
  }
}

/**
 * Pure builder for the object_iti upsert row. Maps editor fields to the REAL columns after the
 * greenfield retype (migration_iti_duration_elevation.sql): durationMin -> duration_min (minutes),
 * elevationPositiveM -> elevation_gain, elevationNegativeM -> elevation_loss. The previous inline
 * payload wrote elevation_positive_m / elevation_negative_m, which do NOT exist in object_iti — so
 * every itinerary save silently failed. geom / cached_gpx are intentionally NOT written here: trace
 * geometry stays read-only until a write/validation contract exists.
 */
export function buildItineraryUpsertPayload(objectId: string, input: ObjectWorkspaceItineraryModule) {
  return {
    object_id: objectId,
    distance_km: toNullableNumber(input.distanceKm),
    duration_min: toNullableInteger(input.durationMin),
    difficulty_level: toNullableText(input.difficultyLevel),
    elevation_gain: toNullableInteger(input.elevationPositiveM),
    elevation_loss: toNullableInteger(input.elevationNegativeM),
    is_loop: input.loop,
    open_status: toNullableText(input.openStatus) ?? 'open',
    status_note: toNullableText(input.statusNote),
  };
}

/**
 * Pure builder for the `stages` payload of api.save_object_itinerary_nested (Phase 1). Maps the
 * editor's managed stage rows (BlockITI / SectionPlaces add/edit/remove) to the RPC shape:
 * recordId -> id (existing stage, preserved); new rows omit id so the RPC generates one.
 * Returns null when the itinerary module did NOT load (unavailableReason set) — the RPC replaces
 * all stages (delete + reinsert), so a partial/failed load must not clobber the object's existing
 * stages. An empty array is intentional (user removed every stage) and correctly clears them.
 */
export function buildItineraryStagesPayload(
  input: ObjectWorkspaceItineraryModule,
): Array<{ id?: string; name: string; description: string; position: string }> | null {
  if (input.unavailableReason != null) {
    return null;
  }
  return input.stages.map((stage) => ({
    ...(stage.recordId ? { id: stage.recordId } : {}),
    name: stage.name,
    description: stage.description,
    position: stage.position,
  }));
}

export async function saveObjectWorkspaceItinerary(objectId: string, input: ObjectWorkspaceItineraryModule): Promise<void> {
  const session = useSessionStore.getState();
  if (session.demoMode) {
    return;
  }
  // §46: type-gated module — throw (not silent return) so a stray save routes to the failed path.
  // (the §28 stages guard only covers stages; this top guard also protects the object_iti upsert
  // and the object_iti_practice delete/reinsert.)
  if (input.unavailableReason) {
    throw new Error(input.unavailableReason);
  }

  const client = getSupabaseClient();
  if (!client) {
    throw new Error('Connexion backend indisponible pour enregistrer l itineraire.');
  }

  const practiceRefsResult = await client.from('ref_code').select('id, code').eq('domain', 'iti_practice');
  if (practiceRefsResult.error) {
    throw mapMutationError(practiceRefsResult.error, 'Impossible de charger les pratiques itineraire.');
  }
  const practiceIdByCode = buildCodeIdMap(practiceRefsResult.data ?? []);
  ensureKnownCodes(input.practiceCodes, practiceIdByCode, 'Pratique itineraire');

  const { error } = await client.from('object_iti')
    .upsert(buildItineraryUpsertPayload(objectId, input), { onConflict: 'object_id' });

  if (error) {
    throw mapMutationError(error, 'Impossible de sauvegarder l itineraire.');
  }

  const { error: deletePracticesError } = await client.from('object_iti_practice').delete().eq('object_id', objectId);
  if (deletePracticesError) {
    throw mapMutationError(deletePracticesError, 'Impossible de reinitialiser les pratiques itineraire.');
  }

  const practiceRows = Array.from(new Set(input.practiceCodes)).map((code) => ({
    object_id: objectId,
    practice_id: practiceIdByCode.get(code.toLowerCase()) as string,
  }));
  if (practiceRows.length > 0) {
    const { error: practicesError } = await client.from('object_iti_practice').insert(practiceRows);
    if (practicesError) {
      throw mapMutationError(practicesError, 'Impossible de sauvegarder les pratiques itineraire.');
    }
  }

  // Phase 1: persist itinerary stages (object_iti_stage) via api.save_object_itinerary_nested, which
  // replaces all stages (delete + reinsert). buildItineraryStagesPayload returns null when the module
  // did not load, so a partial/failed load cannot clobber existing stages. Only `stages` is sent —
  // sections / profiles / associated objects / geom are out of scope (Phase 1; geom stays read-only).
  const stagesPayload = buildItineraryStagesPayload(input);
  if (stagesPayload !== null) {
    await callObjectWorkspaceRpc(
      'save_object_itinerary_nested',
      objectId,
      { stages: stagesPayload },
      'Impossible de sauvegarder les etapes itineraire.',
    );
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
}

function parseLegalValueInput(value: string): unknown {
  const normalized = value.trim();
  if (!normalized) {
    return {};
  }

  try {
    return JSON.parse(normalized);
  } catch {
    return normalized;
  }
}

function parseMembershipMetadataInput(value: string): unknown {
  const normalized = value.trim();
  if (!normalized) {
    return {};
  }

  try {
    return JSON.parse(normalized);
  } catch {
    return normalized;
  }
}

export async function saveObjectWorkspaceLegal(objectId: string, input: ObjectWorkspaceLegalModule): Promise<void> {
  const session = useSessionStore.getState();
  if (session.demoMode) {
    return;
  }

  const client = getSupabaseClient();
  if (!client) {
    throw new Error('Connexion backend indisponible pour enregistrer la conformite juridique.');
  }

  const [typeRefsResult, existingRecordsResult] = await Promise.all([
    client.from('ref_legal_type').select('id, code'),
    client.from('object_legal').select('id').eq('object_id', objectId),
  ]);

  if (typeRefsResult.error) {
    throw mapMutationError(typeRefsResult.error, 'Impossible de charger les types juridiques.');
  }

  if (existingRecordsResult.error) {
    throw mapMutationError(existingRecordsResult.error, 'Impossible de charger les enregistrements juridiques existants.');
  }

  const typeIdByCode = new Map(
    (typeRefsResult.data ?? []).map((row) => [
      readString((row as Record<string, unknown>).code).toLowerCase(),
      readString((row as Record<string, unknown>).id),
    ]),
  );
  const existingIds = new Set(
    (existingRecordsResult.data ?? []).map((row) => readString((row as Record<string, unknown>).id)).filter(Boolean),
  );

  const unknownType = input.records.find((record) => !record.typeCode || !typeIdByCode.has(record.typeCode.toLowerCase()));
  if (unknownType) {
    throw new Error(`Type juridique inconnu: ${unknownType.typeCode || 'vide'}.`);
  }

  const invalidDocumentId = input.records.find((record) => record.documentId.trim() && !isUuid(record.documentId));
  if (invalidDocumentId) {
    throw new Error(`Identifiant de document invalide pour ${invalidDocumentId.typeLabel || invalidDocumentId.typeCode}.`);
  }

  for (const record of input.records) {
    if ((record.validityMode || 'fixed_end_date') === 'fixed_end_date' && !record.validTo.trim()) {
      throw new Error(`La date de fin est requise pour ${record.typeLabel || record.typeCode}.`);
    }
  }

  const existingRecordIds = input.records
    .map((record) => record.recordId)
    .filter((recordId): recordId is string => Boolean(recordId && existingIds.has(recordId)));
  const idsToDelete = Array.from(existingIds).filter((id) => !existingRecordIds.includes(id));

  if (idsToDelete.length > 0) {
    const { error } = await client.from('object_legal').delete().in('id', idsToDelete);
    if (error) {
      throw mapMutationError(error, 'Impossible de supprimer les enregistrements juridiques retires.');
    }
  }

  const today = new Date().toISOString().slice(0, 10);

  for (const record of input.records) {
    const validityMode = (record.validityMode || 'fixed_end_date').trim() || 'fixed_end_date';
    const payload = {
      object_id: objectId,
      type_id: typeIdByCode.get(record.typeCode.toLowerCase()) as string,
      value: parseLegalValueInput(record.valueJson),
      document_id: toNullableText(record.documentId),
      valid_from: toNullableText(record.validFrom) ?? today,
      valid_to: validityMode === 'forever' ? null : toNullableText(record.validTo),
      validity_mode: validityMode,
      status: toNullableText(record.status) ?? 'active',
      document_requested_at: toNullableText(record.documentRequestedAt),
      document_delivered_at: toNullableText(record.documentDeliveredAt),
      note: toNullableText(record.note),
    };

    if (record.recordId && existingIds.has(record.recordId)) {
      const { error } = await client.from('object_legal').update(payload).eq('id', record.recordId);
      if (error) {
        throw mapMutationError(error, "Impossible d'enregistrer un document juridique.");
      }
    } else {
      const { error } = await client.from('object_legal').insert(payload).select('id').single();
      if (error) {
        throw mapMutationError(error, "Impossible de creer un document juridique.");
      }
    }

  }
}

/**
 * Pure builder for the api.save_object_relations payload. Maps the editor's OUTGOING related-object
 * rows (direction !== 'in') to the RPC shape; INCOMING relations are owned by other objects and are
 * never written from here. The relation record id isn't tracked in the UI, so it's omitted and the
 * RPC regenerates it (it deletes every relation whose source is this object, then re-inserts the payload).
 */
export function buildRelationsPayload(
  input: ObjectWorkspaceRelationshipsModule,
): Array<{ target_object_id: string; relation_type_code: string; distance_m: string; note: string; position: number }> {
  return input.relatedObjects
    .filter((item) => item.direction !== 'in')
    .map((item, index) => ({
      target_object_id: item.id,
      relation_type_code: item.relationTypeCode,
      distance_m: item.distanceM,
      note: item.note,
      position: index,
    }));
}

export async function saveObjectWorkspaceRelationships(
  objectId: string,
  input: ObjectWorkspaceRelationshipsModule,
): Promise<void> {
  const session = useSessionStore.getState();
  if (session.demoMode) {
    return;
  }
  await callObjectWorkspaceRpc(
    'save_object_relations',
    objectId,
    { object_relations: buildRelationsPayload(input) },
    "Impossible de sauvegarder les liens vers d'autres fiches.",
  );
}

export async function saveObjectWorkspaceMemberships(objectId: string, input: ObjectWorkspaceMembershipModule): Promise<void> {
  const session = useSessionStore.getState();
  if (session.demoMode) {
    return;
  }

  const client = getSupabaseClient();
  if (!client) {
    throw new Error('Connexion backend indisponible pour enregistrer les adhesions.');
  }

  const [
    currentObjectResult,
    orgLinksResult,
    campaignRefsResult,
    tierRefsResult,
    objectMembershipsResult,
  ] = await Promise.all([
    client.from('object').select('id, object_type').eq('id', objectId).maybeSingle(),
    client.from('object_org_link').select('org_object_id').eq('object_id', objectId),
    client.from('ref_code').select('id, code').eq('domain', 'membership_campaign'),
    client.from('ref_code').select('id, code').eq('domain', 'membership_tier'),
    client.from('object_membership').select('id').eq('object_id', objectId),
  ]);

  if (currentObjectResult.error) {
    throw mapMutationError(currentObjectResult.error, "Impossible de charger l'objet courant pour les adhesions.");
  }
  if (orgLinksResult.error) {
    throw mapMutationError(orgLinksResult.error, 'Impossible de charger les organisations rattachees.');
  }
  if (campaignRefsResult.error) {
    throw mapMutationError(campaignRefsResult.error, 'Impossible de charger les campagnes d adhesion.');
  }
  if (tierRefsResult.error) {
    throw mapMutationError(tierRefsResult.error, "Impossible de charger les paliers d'adhesion.");
  }
  if (objectMembershipsResult.error) {
    throw mapMutationError(objectMembershipsResult.error, "Impossible de charger les adhesions objet existantes.");
  }

  const allowedOrgIds = new Set<string>(
    ((orgLinksResult.data ?? []) as Record<string, unknown>[])
      .map((row) => readString(row.org_object_id))
      .filter(Boolean),
  );
  const currentObjectType = readString(readRecord(currentObjectResult.data).object_type).toUpperCase();
  if (currentObjectType === 'ORG') {
    allowedOrgIds.add(objectId);
  }

  const campaignIdByCode = new Map(
    (campaignRefsResult.data ?? []).map((row) => [
      readString((row as Record<string, unknown>).code).toLowerCase(),
      readString((row as Record<string, unknown>).id),
    ]),
  );
  const tierIdByCode = new Map(
    (tierRefsResult.data ?? []).map((row) => [
      readString((row as Record<string, unknown>).code).toLowerCase(),
      readString((row as Record<string, unknown>).id),
    ]),
  );

  const unknownCampaign = input.items.find((item) => !item.campaignCode || !campaignIdByCode.has(item.campaignCode.toLowerCase()));
  if (unknownCampaign) {
    throw new Error(`Campagne d'adhesion inconnue: ${unknownCampaign.campaignCode || 'vide'}.`);
  }

  const unknownTier = input.items.find((item) => !item.tierCode || !tierIdByCode.has(item.tierCode.toLowerCase()));
  if (unknownTier) {
    throw new Error(`Palier d'adhesion inconnu: ${unknownTier.tierCode || 'vide'}.`);
  }

  const invalidScope = input.items.find((item) => !allowedOrgIds.has(item.orgObjectId));
  if (invalidScope) {
    throw new Error(`Organisation d'adhesion invalide: ${invalidScope.orgObjectId || 'vide'}.`);
  }

  const validStatuses = new Set(['prospect', 'invoiced', 'paid', 'canceled', 'lapsed']);
  const invalidStatus = input.items.find((item) => !validStatuses.has(item.status));
  if (invalidStatus) {
    throw new Error(`Statut d'adhesion invalide: ${invalidStatus.status || 'vide'}.`);
  }

  let organizationMembershipIds = new Set<string>();
  if (allowedOrgIds.size > 0) {
    const organizationMembershipsResult = await client
      .from('object_membership')
      .select('id')
      .is('object_id', null)
      .in('org_object_id', Array.from(allowedOrgIds));

    if (organizationMembershipsResult.error) {
      throw mapMutationError(organizationMembershipsResult.error, "Impossible de charger les adhesions organisationnelles existantes.");
    }

    organizationMembershipIds = new Set(
      (organizationMembershipsResult.data ?? []).map((row) => readString((row as Record<string, unknown>).id)).filter(Boolean),
    );
  }

  const existingIds = new Set([
    ...(objectMembershipsResult.data ?? []).map((row) => readString((row as Record<string, unknown>).id)).filter(Boolean),
    ...Array.from(organizationMembershipIds),
  ]);
  const keptIds = new Set<string>();

  for (const item of input.items) {
    const payload = {
      org_object_id: item.orgObjectId,
      object_id: item.scope === 'object' ? objectId : null,
      campaign_id: campaignIdByCode.get(item.campaignCode.toLowerCase()) as string,
      tier_id: tierIdByCode.get(item.tierCode.toLowerCase()) as string,
      status: item.status,
      starts_at: toNullableText(item.startsAt),
      ends_at: toNullableText(item.endsAt),
      payment_date: toNullableText(item.paymentDate),
      metadata: parseMembershipMetadataInput(item.metadataJson),
    };

    if (item.recordId && existingIds.has(item.recordId)) {
      const { error } = await client.from('object_membership').update(payload).eq('id', item.recordId);
      if (error) {
        throw mapMutationError(error, "Impossible d'enregistrer une adhesion.");
      }
      keptIds.add(item.recordId);
      continue;
    }

    const { data, error } = await client.from('object_membership').insert(payload).select('id').single();
    if (error) {
      throw mapMutationError(error, "Impossible de creer une adhesion.");
    }
    keptIds.add(readString((data as Record<string, unknown>).id));
  }

  const idsToDelete = Array.from(existingIds).filter((id) => !keptIds.has(id));
  if (idsToDelete.length > 0) {
    const { error } = await client.from('object_membership').delete().in('id', idsToDelete);
    if (error) {
      throw mapMutationError(error, "Impossible de supprimer les adhesions retirees.");
    }
  }
}

/**
 * Pure (§41): the zones-only payload for `api.save_object_places` — selected INSEE commune
 * codes → ordered `{insee_commune, position}`. Dedupes; drops blanks.
 */
export function buildZonesPayload(zoneCodes: string[]): { insee_commune: string; position: number }[] {
  const seen = new Set<string>();
  const rows: { insee_commune: string; position: number }[] = [];
  for (const code of zoneCodes) {
    const trimmed = code.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    rows.push({ insee_commune: trimmed, position: rows.length });
  }
  return rows;
}

/**
 * §41: enrich the location module with the commune catalog (`ref_commune`, public read) and the
 * object's selected zones (`object_zone`, gated by `can_read_object`). Mirrors the §32 characteristics
 * enrichment. On read failure sets `zonesUnavailableReason` ⇒ the saver skips zone persistence (no clobber).
 */
async function getObjectWorkspaceZonesModule(
  objectId: string,
  baseModule: ObjectWorkspaceLocationModule,
): Promise<ObjectWorkspaceLocationModule> {
  const session = useSessionStore.getState();
  if (session.demoMode) {
    return baseModule;
  }
  const client = getSupabaseClient();
  if (!client) {
    return { ...baseModule, zonesUnavailableReason: 'Connexion backend indisponible pour charger les communes.' };
  }
  const [communeRefs, objectZones] = await Promise.all([
    client.from('ref_commune').select('insee_code, name, position').eq('is_active', true).order('position', { ascending: true }),
    client.from('object_zone').select('insee_commune, position').eq('object_id', objectId).order('position', { ascending: true }),
  ]);
  if (communeRefs.error || objectZones.error) {
    return { ...baseModule, zonesUnavailableReason: 'Le live actuel ne fournit pas encore le référentiel des communes.' };
  }
  const zoneOptions = (communeRefs.data ?? [])
    .map((row) => ({
      code: readString((row as Record<string, unknown>).insee_code),
      label: readString((row as Record<string, unknown>).name),
    }))
    .filter((option) => option.code !== '');
  const zoneCodes = (objectZones.data ?? [])
    .map((row) => readString((row as Record<string, unknown>).insee_commune))
    .filter(Boolean);
  return { ...baseModule, zoneOptions, zoneCodes, zonesUnavailableReason: null };
}

export async function saveObjectWorkspaceLocation(objectId: string, input: ObjectWorkspaceLocationModule): Promise<void> {
  const session = useSessionStore.getState();
  if (session.demoMode) {
    return;
  }

  const client = getSupabaseClient();
  if (!client) {
    throw new Error('Connexion backend indisponible pour enregistrer la localisation.');
  }

  const payload = {
    object_id: objectId,
    is_main_location: true,
    address1: toNullableText(input.main.address1),
    address1_suite: toNullableText(input.main.address1Suite),
    address2: toNullableText(input.main.address2),
    address3: toNullableText(input.main.address3),
    postcode: toNullableText(input.main.postcode),
    city: toNullableText(input.main.city),
    code_insee: toNullableText(input.main.codeInsee),
    lieu_dit: toNullableText(input.main.lieuDit),
    direction: toNullableText(input.main.direction),
    latitude: toNullableNumber(input.main.latitude),
    longitude: toNullableNumber(input.main.longitude),
    zone_touristique: toNullableText(input.main.zoneTouristique),
  };

  const existingLocationId = input.main.recordId || await (async () => {
    const { data, error } = await client
      .from('object_location')
      .select('id')
      .eq('object_id', objectId)
      .eq('is_main_location', true)
      .maybeSingle();

    if (error) {
      throw mapMutationError(error, "Impossible de charger la localisation principale.");
    }

    return data?.id ?? null;
  })();

  if (existingLocationId) {
    const { error } = await client.from('object_location').update(payload).eq('id', existingLocationId);
    if (error) {
      throw mapMutationError(error, "Impossible d'enregistrer la localisation principale.");
    }
  } else {
    const { error } = await client.from('object_location').insert(payload);
    if (error) {
      throw mapMutationError(error, "Impossible de creer la localisation principale.");
    }
  }

  // §41: persist "communes desservies" (object_zone) via the zones-only save_object_places payload,
  // unless the commune catalog / object_zone read failed on load (guard against clobbering).
  if (!input.zonesUnavailableReason) {
    await callObjectWorkspaceRpc(
      'save_object_places',
      objectId,
      { zones: buildZonesPayload(input.zoneCodes) },
      "Impossible d'enregistrer les communes desservies.",
    );
  }
}

function normalizeTagCodes(tags: string[]): string[] {
  return Array.from(new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean)));
}

export async function saveObjectWorkspaceMedia(
  objectId: string,
  input: ObjectWorkspaceMediaModule,
  options: { canEditPlaceMedia: boolean },
): Promise<void> {
  const session = useSessionStore.getState();
  if (session.demoMode) {
    return;
  }

  const client = getSupabaseClient();
  if (!client) {
    throw new Error('Connexion backend indisponible pour enregistrer les medias.');
  }

  const normalizedObjectItems = input.objectItems.map((item, index) => ({
    ...item,
    position: item.position || String(index),
  }));

  const [typeRefsResult, tagRefsResult, existingMediaResult] = await Promise.all([
    client.from('ref_code').select('id, code, name').eq('domain', 'media_type'),
    client.from('ref_code').select('id, code, name').eq('domain', 'media_tag'),
    client.from('media').select('id').eq('object_id', objectId),
  ]);

  if (typeRefsResult.error) {
    throw mapMutationError(typeRefsResult.error, 'Impossible de charger les types de media.');
  }

  if (tagRefsResult.error) {
    throw mapMutationError(tagRefsResult.error, 'Impossible de charger les tags de media.');
  }

  if (existingMediaResult.error) {
    throw mapMutationError(existingMediaResult.error, 'Impossible de charger les medias existants.');
  }

  const typeByCode = new Map(
    (typeRefsResult.data ?? []).map((row) => [readString((row as Record<string, unknown>).code).toLowerCase(), readString((row as Record<string, unknown>).id)]),
  );
  const tagByCode = new Map(
    (tagRefsResult.data ?? []).map((row) => [readString((row as Record<string, unknown>).code).toLowerCase(), readString((row as Record<string, unknown>).id)]),
  );
  const existingIds = new Set((existingMediaResult.data ?? []).map((row) => readString((row as Record<string, unknown>).id)).filter(Boolean));

  const unknownType = normalizedObjectItems.find((item) => !typeByCode.has(item.typeCode.toLowerCase()));
  if (unknownType) {
    throw new Error(`Type de media inconnu: ${unknownType.typeCode || 'vide'}.`);
  }

  const unknownTag = normalizedObjectItems
    .flatMap((item) => normalizeTagCodes(item.tags))
    .find((tag) => !tagByCode.has(tag));
  if (unknownTag) {
    throw new Error(`Tag media inconnu: ${unknownTag}.`);
  }

  const { error: clearMainError } = await client.from('media').update({ is_main: false }).eq('object_id', objectId);
  if (clearMainError) {
    throw mapMutationError(clearMainError, 'Impossible de preparer le media principal.');
  }

  const keptIds = new Set<string>();

  for (const item of normalizedObjectItems) {
    const payload = {
      object_id: objectId,
      media_type_id: typeByCode.get(item.typeCode.toLowerCase()) ?? null,
      title: toNullableText(item.title),
      title_i18n: Object.keys(item.titleTranslations).length > 0 ? item.titleTranslations : null,
      description: toNullableText(item.description),
      description_i18n: Object.keys(item.descriptionTranslations).length > 0 ? item.descriptionTranslations : null,
      credit: toNullableText(item.credit),
      url: item.url.trim(),
      is_main: item.isMain,
      is_published: item.isPublished,
      position: toNullableInteger(item.position) ?? 0,
      rights_expires_at: toNullableText(item.rightsExpiresAt),
      visibility: toNullableText(item.visibility) ?? 'public',
      width: toNullableInteger(item.width),
      height: toNullableInteger(item.height),
      kind: toNullableText(item.kind),
    };

    let mediaId = item.id;
    if (existingIds.has(item.id)) {
      const { error } = await client.from('media').update(payload).eq('id', item.id);
      if (error) {
        throw mapMutationError(error, "Impossible d'enregistrer un media objet.");
      }
    } else {
      const { data, error } = await client.from('media').insert(payload).select('id').single();
      if (error) {
        throw mapMutationError(error, "Impossible de creer un media objet.");
      }
      mediaId = readString((data as Record<string, unknown>).id);
    }

    keptIds.add(mediaId);

    const { error: deleteTagsError } = await client.from('media_tag').delete().eq('media_id', mediaId);
    if (deleteTagsError) {
      throw mapMutationError(deleteTagsError, 'Impossible de synchroniser les tags media.');
    }

    const normalizedTags = normalizeTagCodes(item.tags)
      .map((tag) => tagByCode.get(tag))
      .filter(Boolean)
      .map((tagId) => ({ media_id: mediaId, tag_id: tagId as string }));

    if (normalizedTags.length > 0) {
      const { error: insertTagsError } = await client.from('media_tag').insert(normalizedTags);
      if (insertTagsError) {
        throw mapMutationError(insertTagsError, 'Impossible de sauvegarder les tags media.');
      }
    }
  }

  const idsToDelete = Array.from(existingIds).filter((id) => !keptIds.has(id));
  if (idsToDelete.length > 0) {
    const { error } = await client.from('media').delete().in('id', idsToDelete);
    if (error) {
      throw mapMutationError(error, "Impossible de supprimer les medias retires.");
    }
  }

  if (options.canEditPlaceMedia) {
    return;
  }
}

export async function saveObjectWorkspaceContacts(objectId: string, input: ObjectWorkspaceContactsModule): Promise<void> {
  const session = useSessionStore.getState();
  if (session.demoMode) {
    return;
  }

  const client = getSupabaseClient();
  if (!client) {
    throw new Error('Connexion backend indisponible pour enregistrer les contacts.');
  }

  const [kindRefsResult, roleRefsResult, existingContactsResult] = await Promise.all([
    client.from('ref_code').select('id, code').eq('domain', 'contact_kind'),
    client.from('ref_contact_role').select('id, code'),
    client.from('contact_channel').select('id').eq('object_id', objectId),
  ]);

  if (kindRefsResult.error) {
    throw mapMutationError(kindRefsResult.error, 'Impossible de charger les types de contact.');
  }

  if (roleRefsResult.error) {
    throw mapMutationError(roleRefsResult.error, 'Impossible de charger les roles de contact.');
  }

  if (existingContactsResult.error) {
    throw mapMutationError(existingContactsResult.error, 'Impossible de charger les contacts existants.');
  }

  const kindByCode = new Map(
    (kindRefsResult.data ?? []).map((row) => [readString((row as Record<string, unknown>).code).toLowerCase(), readString((row as Record<string, unknown>).id)]),
  );
  const roleByCode = new Map(
    (roleRefsResult.data ?? []).map((row) => [readString((row as Record<string, unknown>).code).toLowerCase(), readString((row as Record<string, unknown>).id)]),
  );
  const existingIds = new Set((existingContactsResult.data ?? []).map((row) => readString((row as Record<string, unknown>).id)).filter(Boolean));

  const unknownKind = input.objectItems.find((item) => !kindByCode.has(item.kindCode.toLowerCase()));
  if (unknownKind) {
    throw new Error(`Type de contact inconnu: ${unknownKind.kindCode || 'vide'}.`);
  }

  const primaryByKind = new Set<string>();
  const keptIds = new Set<string>();

  for (let index = 0; index < input.objectItems.length; index += 1) {
    const item = input.objectItems[index];
    const normalizedKindCode = item.kindCode.toLowerCase();
    const shouldBePrimary = item.isPrimary && !primaryByKind.has(normalizedKindCode);
    if (shouldBePrimary) {
      primaryByKind.add(normalizedKindCode);
    }

    const payload = {
      object_id: objectId,
      kind_id: kindByCode.get(normalizedKindCode) ?? null,
      value: item.value.trim(),
      role_id: item.roleCode ? roleByCode.get(item.roleCode.toLowerCase()) ?? null : null,
      is_public: item.isPublic,
      is_primary: shouldBePrimary,
      position: toNullableInteger(item.position) ?? index,
    };

    let contactId = item.id;
    if (existingIds.has(item.id)) {
      const { error } = await client.from('contact_channel').update(payload).eq('id', item.id);
      if (error) {
        throw mapMutationError(error, "Impossible d'enregistrer un contact objet.");
      }
    } else {
      const { data, error } = await client.from('contact_channel').insert(payload).select('id').single();
      if (error) {
        throw mapMutationError(error, "Impossible de creer un contact objet.");
      }
      contactId = readString((data as Record<string, unknown>).id);
    }

    keptIds.add(contactId);
  }

  const idsToDelete = Array.from(existingIds).filter((id) => !keptIds.has(id));
  if (idsToDelete.length > 0) {
    const { error } = await client.from('contact_channel').delete().in('id', idsToDelete);
    if (error) {
      throw mapMutationError(error, "Impossible de supprimer les contacts retires.");
    }
  }
}

function buildDescriptionPayload(scope: ObjectWorkspaceDescriptionsModule['object']) {
  return {
    description: toNullableText(scope.description.baseValue),
    description_i18n: Object.keys(scope.description.values).length > 0 ? scope.description.values : null,
    description_chapo: toNullableText(scope.chapo.baseValue),
    description_chapo_i18n: Object.keys(scope.chapo.values).length > 0 ? scope.chapo.values : null,
    description_adapted: toNullableText(scope.adaptedDescription.baseValue),
    description_adapted_i18n: Object.keys(scope.adaptedDescription.values).length > 0 ? scope.adaptedDescription.values : null,
    description_mobile: toNullableText(scope.mobileDescription.baseValue),
    description_mobile_i18n: Object.keys(scope.mobileDescription.values).length > 0 ? scope.mobileDescription.values : null,
    description_edition: toNullableText(scope.editorialDescription.baseValue),
    description_edition_i18n: Object.keys(scope.editorialDescription.values).length > 0 ? scope.editorialDescription.values : null,
    visibility: toNullableText(scope.visibility) ?? 'public',
  };
}

/** Pure: TRUE if an org overlay scope carries any text or translation worth persisting. */
export function orgOverlayHasContent(scope: ObjectWorkspaceDescriptionScope): boolean {
  const fields = [scope.chapo, scope.description, scope.adaptedDescription];
  return fields.some((f) => f.baseValue.trim() !== '' || Object.keys(f.values).length > 0);
}

/** Pure: the org-overlay write payload — the three enrichable fields only. */
export function buildOrgDescriptionPayload(scope: ObjectWorkspaceDescriptionScope) {
  return {
    description: toNullableText(scope.description.baseValue),
    description_i18n: Object.keys(scope.description.values).length > 0 ? scope.description.values : null,
    description_chapo: toNullableText(scope.chapo.baseValue),
    description_chapo_i18n: Object.keys(scope.chapo.values).length > 0 ? scope.chapo.values : null,
    description_adapted: toNullableText(scope.adaptedDescription.baseValue),
    description_adapted_i18n: Object.keys(scope.adaptedDescription.values).length > 0 ? scope.adaptedDescription.values : null,
  };
}

async function upsertObjectDescription(
  objectId: string,
  scope: ObjectWorkspaceDescriptionsModule['object'],
): Promise<void> {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error('Connexion backend indisponible pour enregistrer les descriptions.');
  }

  const payload = {
    object_id: objectId,
    org_object_id: null,
    ...buildDescriptionPayload(scope),
  };

  const existingId = scope.recordId || await (async () => {
    const { data, error } = await client
      .from('object_description')
      .select('id')
      .eq('object_id', objectId)
      .is('org_object_id', null)
      .maybeSingle();

    if (error) {
      throw mapMutationError(error, "Impossible de charger la description principale.");
    }

    return data?.id ?? null;
  })();

  if (existingId) {
    const { error } = await client.from('object_description').update(payload).eq('id', existingId);
    if (error) {
      throw mapMutationError(error, "Impossible d'enregistrer la description principale.");
    }
    return;
  }

  const { error } = await client.from('object_description').insert(payload);
  if (error) {
    throw mapMutationError(error, "Impossible de creer la description principale.");
  }
}

async function upsertPlaceDescription(scope: ObjectWorkspaceDescriptionsModule['places'][number]): Promise<void> {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error('Connexion backend indisponible pour enregistrer les descriptions de sous-lieu.');
  }

  if (!scope.placeId) {
    return;
  }

  const payload = {
    place_id: scope.placeId,
    ...buildDescriptionPayload(scope),
  };

  const existingId = scope.recordId || await (async () => {
    const { data, error } = await client
      .from('object_place_description')
      .select('id')
      .eq('place_id', scope.placeId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw mapMutationError(error, "Impossible de charger la description du sous-lieu.");
    }

    return data?.id ?? null;
  })();

  if (existingId) {
    const { error } = await client.from('object_place_description').update(payload).eq('id', existingId);
    if (error) {
      throw mapMutationError(error, "Impossible d'enregistrer la description du sous-lieu.");
    }
    return;
  }

  const { error } = await client.from('object_place_description').insert(payload);
  if (error) {
    throw mapMutationError(error, "Impossible de creer la description du sous-lieu.");
  }
}

async function writeOrgDescription(objectId: string, overlay: ObjectWorkspaceDescriptionScope | null): Promise<void> {
  const apiClient = getApiClient();
  if (!apiClient) {
    throw new Error('Connexion backend indisponible pour enregistrer la description ORG.');
  }
  // Empty overlay → send {} so the RPC deletes any existing row (fallback to canonical).
  const payload = overlay && orgOverlayHasContent(overlay) ? buildOrgDescriptionPayload(overlay) : {};
  const { error } = await apiClient.schema('api').rpc('rpc_write_org_description', {
    p_object_id: objectId,
    p_payload: payload,
  });
  if (error) {
    throw mapMutationError(error, "Impossible d'enregistrer la description propre à votre organisation.");
  }
}

export interface PlacesReconcilePlan {
  toInsert: ObjectWorkspaceDescriptionScope[];
  toUpdate: ObjectWorkspaceDescriptionScope[];
  toDelete: string[];
}

/**
 * Pure (T1b §40): turn the existing `object_place` id set + the draft place scopes into an
 * insert / update / delete plan. New places (null `placeId`) → insert; existing → update
 * (idempotent label + description); loaded-but-now-absent → delete. Non-destructive — only
 * places the editor removed are deleted (no `save_object_places` blanket replace, so a
 * place's locations/media authored elsewhere are never collaterally wiped).
 */
export function computePlacesReconcile(
  existingPlaceIds: string[],
  draftPlaces: ObjectWorkspaceDescriptionScope[],
): PlacesReconcilePlan {
  const toInsert = draftPlaces.filter((place) => !place.placeId);
  const toUpdate = draftPlaces.filter((place) => Boolean(place.placeId));
  const keptIds = new Set(toUpdate.map((place) => place.placeId as string));
  const toDelete = existingPlaceIds.filter((id) => !keptIds.has(id));
  return { toInsert, toUpdate, toDelete };
}

/**
 * Apply the §16 sub-place reconcile via direct PostgREST as the canonical writer (mirrors
 * `upsertPlaceDescription`). `object_place` / `object_place_description` are directly
 * writable under SP-1's `owner_write_place` (`FOR ALL USING user_can_write_object_canonical`).
 */
async function reconcilePlaces(objectId: string, places: ObjectWorkspaceDescriptionScope[]): Promise<void> {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error('Connexion backend indisponible pour enregistrer les sous-lieux.');
  }

  const { data: existing, error: fetchError } = await client
    .from('object_place')
    .select('id')
    .eq('object_id', objectId);
  if (fetchError) {
    throw mapMutationError(fetchError, 'Impossible de charger les sous-lieux existants.');
  }

  const plan = computePlacesReconcile((existing ?? []).map((row) => String(row.id)), places);

  if (plan.toDelete.length > 0) {
    const { error } = await client.from('object_place').delete().in('id', plan.toDelete);
    if (error) {
      throw mapMutationError(error, 'Impossible de supprimer un sous-lieu.');
    }
  }

  for (const place of plan.toUpdate) {
    const { error } = await client
      .from('object_place')
      .update({ label: toNullableText(place.label) })
      .eq('id', place.placeId as string);
    if (error) {
      throw mapMutationError(error, 'Impossible de renommer un sous-lieu.');
    }
    await upsertPlaceDescription(place);
  }

  let position = plan.toUpdate.length;
  for (const place of plan.toInsert) {
    const { data: created, error } = await client
      .from('object_place')
      .insert({ object_id: objectId, label: toNullableText(place.label), position })
      .select('id')
      .single();
    if (error || !created) {
      throw mapMutationError(error, 'Impossible de créer un sous-lieu.');
    }
    const { error: descError } = await client
      .from('object_place_description')
      .insert({ place_id: String(created.id), ...buildDescriptionPayload(place) });
    if (descError) {
      throw mapMutationError(descError, 'Impossible de créer la description du sous-lieu.');
    }
    position += 1;
  }
}

export async function saveObjectWorkspaceDescriptions(
  objectId: string,
  input: ObjectWorkspaceDescriptionsModule,
  options: { canEditCanonical: boolean; canEditOrgEnrichment: boolean; canEditPlaceDescriptions: boolean },
): Promise<void> {
  const session = useSessionStore.getState();
  if (session.demoMode) {
    return;
  }

  if (options.canEditCanonical) {
    await upsertObjectDescription(objectId, input.object);
  }

  if (options.canEditOrgEnrichment) {
    await writeOrgDescription(objectId, input.orgOverlay);
  }

  if (!options.canEditPlaceDescriptions) {
    return;
  }

  await reconcilePlaces(objectId, input.places);
}
