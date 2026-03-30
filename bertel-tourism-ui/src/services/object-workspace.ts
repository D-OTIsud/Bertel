import { getApiClient, getSupabaseClient } from '../lib/supabase';
import { useSessionStore } from '../store/session-store';
import type { ObjectDetail } from '../types/domain';
import { mockPendingChanges, mockPublicationCards } from '../data/mock';
import { getObjectResource } from './rpc';
import {
  type ObjectWorkspaceCapacityItem,
  type ObjectWorkspaceCapacityPoliciesModule,
  type ObjectWorkspaceAccessibilityAmenityItem,
  type ObjectWorkspaceAmenityGroup,
  type ObjectWorkspaceCharacteristicsModule,
  parseObjectWorkspace,
  type ObjectWorkspaceContactItem,
  type ObjectWorkspaceContactsModule,
  type ObjectWorkspaceDescriptionsModule,
  type ObjectWorkspaceDistinctionGroup,
  type ObjectWorkspaceDistinctionItem,
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
  type ObjectWorkspaceMembershipItem,
  type ObjectWorkspaceMembershipModule,
  type ObjectWorkspaceMembershipScopeOption,
  type ObjectWorkspaceRelationshipsModule,
  type ObjectWorkspaceLegalComplianceDetail,
  type ObjectWorkspaceLegalComplianceSummary,
  type ObjectWorkspaceLegalModule,
  type ObjectWorkspaceLegalRecord,
  type ObjectWorkspaceLegalTypeOption,
  type ObjectWorkspacePriceItem,
  type ObjectWorkspacePricePeriod,
  type ObjectWorkspacePromotionSummary,
  type ObjectWorkspaceDiscountItem,
  type ObjectWorkspaceTaxonomyItem,
  type ObjectWorkspaceTaxonomyModule,
  type WorkspaceReferenceOption,
} from './object-workspace-parser';

export type WorkspaceModuleId = 'general-info' | 'taxonomy' | 'publication' | 'location' | 'descriptions' | 'media' | 'contacts' | 'characteristics' | 'distinctions' | 'capacity-policies' | 'pricing' | 'openings' | 'provider-follow-up' | 'relationships' | 'memberships' | 'legal';

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
  location: ObjectWorkspaceModuleAccess & {
    canEditPlaces: boolean;
    canEditZones: boolean;
  };
  descriptions: ObjectWorkspaceModuleAccess & {
    canEditPlaceDescriptions: boolean;
  };
  media: ObjectWorkspaceModuleAccess & {
    canEditPlaceMedia: boolean;
  };
  contacts: ObjectWorkspaceModuleAccess;
  characteristics: ObjectWorkspaceModuleAccess;
  distinctions: ObjectWorkspaceModuleAccess;
  capacityPolicies: ObjectWorkspaceModuleAccess;
  pricing: ObjectWorkspaceModuleAccess;
  openings: ObjectWorkspaceModuleAccess;
  providerFollowUp: ObjectWorkspaceModuleAccess;
  relationships: ObjectWorkspaceModuleAccess;
  memberships: ObjectWorkspaceModuleAccess;
  legal: ObjectWorkspaceModuleAccess;
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

function normalizePendingChangeSummary(input: {
  targetTable: string;
  action: string;
  payload: unknown;
  metadata: unknown;
}): string {
  const metadata = readRecord(input.metadata);
  const payload = readRecord(input.payload);
  const field = readString(metadata.field, readString(payload.field));
  const label = readString(metadata.label, readString(payload.label));

  if (label) {
    return label;
  }

  if (field) {
    return `${input.action} · ${field}`;
  }

  return `${input.action} · ${input.targetTable}`;
}

function normalizePendingChangeItem(row: Record<string, unknown>): ObjectWorkspaceModerationItem {
  const targetTable = readString(row.target_table);
  const action = readString(row.action);

  return {
    id: readString(row.id),
    targetTable,
    action,
    status: readString(row.status, 'pending'),
    submittedAt: readString(row.submitted_at),
    reviewedAt: readString(row.reviewed_at),
    appliedAt: readString(row.applied_at),
    reviewNote: readString(row.review_note),
    summary: normalizePendingChangeSummary({
      targetTable,
      action,
      payload: row.payload,
      metadata: row.metadata,
    }),
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

function buildDemoModerationItems(objectName: string): ObjectWorkspaceModerationItem[] {
  return mockPendingChanges
    .filter((item) => item.objectName === objectName)
    .map((item) => ({
      id: item.id,
      targetTable: 'object',
      action: 'update',
      status: 'pending',
      submittedAt: item.submittedAt,
      reviewedAt: '',
      appliedAt: '',
      reviewNote: '',
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

    current.options.push({
      id: amenity.id,
      code: amenity.code,
      label: amenity.label,
    });

    groups.set(amenity.familyCode, current);
  }

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      options: sortReferenceOptions(group.options),
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
    client.from('ref_code_language_level').select('id, code, name, position').order('position', { ascending: true }),
    client.from('object_language').select('language_id, level_id').eq('object_id', objectId),
    client.from('ref_code_payment_method').select('id, code, name, position').order('position', { ascending: true }),
    client.from('object_payment_method').select('payment_method_id').eq('object_id', objectId),
    client.from('ref_code_environment_tag').select('id, code, name, position').order('position', { ascending: true }),
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
      hasPolicy: Object.keys(petPolicy).length > 0,
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

const NON_STRUCTURING_CLASSIFICATION_GROUPS = new Set(['sustainability_labels', 'accessibility_labels']);

function isStructuringClassificationScheme(row: Record<string, unknown>): boolean {
  return row.is_distinction !== true && !NON_STRUCTURING_CLASSIFICATION_GROUPS.has(readString(row.display_group));
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

function normalizeWorkspaceTaxonomyItem(params: {
  row: Record<string, unknown>;
  schemeById: Map<string, ClassificationSchemeRef>;
  valueById: Map<string, ClassificationValueRef>;
}): ObjectWorkspaceTaxonomyItem | null {
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

  const [schemeRefsResult, valueRefsResult, objectClassificationsResult] = await Promise.all([
    client
      .from('ref_classification_scheme')
      .select('id, code, name, description, selection, position, display_group, is_distinction')
      .eq('is_distinction', false)
      .order('position', { ascending: true }),
    client
      .from('ref_classification_value')
      .select('id, scheme_id, code, name, ordinal, metadata')
      .order('ordinal', { ascending: true }),
    client
      .from('object_classification')
      .select('id, scheme_id, value_id, status, awarded_at, valid_until')
      .eq('object_id', objectId)
      .order('created_at', { ascending: true }),
  ]);

  if (schemeRefsResult.error || valueRefsResult.error || objectClassificationsResult.error) {
    return {
      ...baseModule,
      unavailableReason: 'Le live actuel ne fournit pas encore une taxonomie structurante complete pour ce profil.',
    };
  }

  const schemes = (schemeRefsResult.data ?? [])
    .map((row) => row as Record<string, unknown>)
    .filter(isStructuringClassificationScheme)
    .map(normalizeClassificationSchemeRef)
    .sort((left, right) => left.position - right.position || left.label.localeCompare(right.label, 'fr'));
  const allowedSchemeIds = new Set(schemes.map((scheme) => scheme.id));
  const values = (valueRefsResult.data ?? [])
    .map((row) => row as Record<string, unknown>)
    .map(normalizeClassificationValueRef)
    .filter((value) => allowedSchemeIds.has(value.schemeId))
    .sort((left, right) => left.ordinal - right.ordinal || left.label.localeCompare(right.label, 'fr'));

  const schemeById = new Map(schemes.map((scheme) => [scheme.id, scheme]));
  const valueById = new Map(values.map((value) => [value.id, value]));
  const valuesBySchemeId = new Map<string, WorkspaceReferenceOption[]>();

  for (const value of values) {
    const current = valuesBySchemeId.get(value.schemeId) ?? [];
    current.push({
      id: value.id,
      code: value.code,
      label: value.label,
    });
    valuesBySchemeId.set(value.schemeId, current);
  }

  const itemsBySchemeId = new Map<string, ObjectWorkspaceTaxonomyItem[]>();
  for (const row of (objectClassificationsResult.data ?? []) as Record<string, unknown>[]) {
    const item = normalizeWorkspaceTaxonomyItem({
      row,
      schemeById,
      valueById,
    });
    if (!item) {
      continue;
    }

    const current = itemsBySchemeId.get(item.schemeId) ?? [];
    current.push(item);
    itemsBySchemeId.set(item.schemeId, current);
  }

  return {
    schemes: schemes.map((scheme) => ({
      id: scheme.id,
      code: scheme.code,
      label: scheme.label,
      description: scheme.description,
      selectionMode: scheme.selectionMode,
      displayGroup: scheme.displayGroup,
      valueOptions: valuesBySchemeId.get(scheme.id) ?? [],
      items: (itemsBySchemeId.get(scheme.id) ?? []).sort((left, right) =>
        left.valueLabel.localeCompare(right.valueLabel, 'fr'),
      ),
    })),
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
    client.from('ref_code_media_type').select('id, code, name').order('position', { ascending: true }),
    client.from('ref_code_media_tag').select('id, code, name').order('position', { ascending: true }),
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
    client.from('ref_code_contact_kind').select('id, code, name').order('position', { ascending: true }),
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
      relatedObjectWriteUnavailableReason: 'Les relations objet restent non editables depuis le workspace tant que leur write-path n est pas verrouille.',
    };
  }

  return {
    ...baseModule,
    organizationLinkWriteUnavailableReason: "Les rattachements `object_org_link` restent en lecture seule: le live actuel n'expose pas de write-path workspace pour ce module.",
    actorWriteUnavailableReason: "Les roles acteur et leurs canaux restent en lecture seule: `actor_object_role` et `actor_channel` ne sont pas gerables proprement depuis le client workspace.",
    actorConsentUnavailableReason: "Les consentements `actor_consent` ne sont pas lisibles pour ce contexte de travail et restent hors du module D2.",
    relatedObjectWriteUnavailableReason: "Les relations `object_relation` restent en lecture seule tant que leur write-path live reste reserve a l'administration.",
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
    client.from('ref_code_membership_campaign').select('id, code, name').order('name', { ascending: true }),
    client.from('ref_code_membership_tier').select('id, code, name').order('name', { ascending: true }),
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
    client.from('ref_code_price_kind').select('id, code, name, position').order('position', { ascending: true }),
    client.from('ref_code_price_unit').select('id, code, name, position').order('position', { ascending: true }),
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
    const moderationItems = buildDemoModerationItems(detail.name);
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

async function getObjectWorkspacePermissions(objectId: string): Promise<ObjectWorkspacePermissions> {
  const session = useSessionStore.getState();
  const directWrite = session.demoMode || session.role === 'owner' || session.role === 'super_admin';
  const apiClient = getApiClient();

  let canPrepareProposal = directWrite;
  let canPublishObject = session.demoMode;
  let canWriteProviderFollowUp = session.demoMode;
  if (!session.demoMode && apiClient) {
    try {
      const [canonicalResult, enrichmentResult, publishResult, providerFollowUpResult] = await Promise.allSettled([
        apiClient.schema('api').rpc('user_can_write_canonical', { p_object_id: objectId }),
        apiClient.schema('api').rpc('user_can_write_enrichment', { p_object_id: objectId }),
        apiClient.schema('api').rpc('user_can_publish_object', { p_object_id: objectId }),
        apiClient.schema('api').rpc('can_write_object_private_notes', { p_object_id: objectId }),
      ]);

      const canonical =
        canonicalResult.status === 'fulfilled' && canonicalResult.value.error == null && canonicalResult.value.data === true;
      const enrichment =
        enrichmentResult.status === 'fulfilled' && enrichmentResult.value.error == null && enrichmentResult.value.data === true;
      canPublishObject =
        publishResult.status === 'fulfilled' && publishResult.value.error == null && publishResult.value.data === true;
      canWriteProviderFollowUp =
        providerFollowUpResult.status === 'fulfilled' && providerFollowUpResult.value.error == null && providerFollowUpResult.value.data === true;

      canPrepareProposal = directWrite || canonical || enrichment;
    } catch {
      canPrepareProposal = directWrite;
      canPublishObject = false;
      canWriteProviderFollowUp = directWrite;
    }
  }

  const proposalUnavailableReason = canPrepareProposal
    ? "Le flux de proposition moderee n'est pas encore branche pour ce module."
    : "Vos droits actuels ne permettent pas cette modification.";

  const directOrBlocked = (canEditScope = true): ObjectWorkspaceModuleAccess => ({
    canDirectWrite: directWrite,
    canPrepareProposal,
    canSubmitProposal: false,
    disabledReason: directWrite && canEditScope ? null : proposalUnavailableReason,
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
    location: {
      ...directOrBlocked(),
      canEditPlaces: false,
      canEditZones: false,
    },
    descriptions: {
      ...directOrBlocked(),
      canEditPlaceDescriptions: session.demoMode || session.role === 'super_admin',
    },
    media: {
      ...directOrBlocked(),
      canEditPlaceMedia: false,
    },
    contacts: directOrBlocked(),
    characteristics: {
      canDirectWrite: session.demoMode,
      canPrepareProposal: false,
      canSubmitProposal: false,
      disabledReason: session.demoMode ? null : "Le live actuel n'expose pas encore l'ecriture du module C1.",
    },
    distinctions: {
      canDirectWrite: false,
      canPrepareProposal: false,
      canSubmitProposal: false,
      disabledReason: 'Le module C2 reste en lecture seule tant que le write-path live des distinctions et labels n est pas verrouille.',
    },
    capacityPolicies: {
      canDirectWrite: session.demoMode,
      canPrepareProposal: false,
      canSubmitProposal: false,
      disabledReason: session.demoMode ? null : "Le live actuel n'expose pas encore une sauvegarde complete du module C4.",
    },
    pricing: {
      canDirectWrite: session.demoMode,
      canPrepareProposal: false,
      canSubmitProposal: false,
      disabledReason: session.demoMode ? null : "Le live actuel n'expose pas encore une sauvegarde transactionnelle du module C5.",
    },
    openings: {
      canDirectWrite: false,
      canPrepareProposal: false,
      canSubmitProposal: false,
      disabledReason: "Le live actuel n'expose pas encore l'ecriture du module C6.",
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
  };
}

export async function getObjectWorkspaceResource(objectId: string, langPrefs: string[]): Promise<ObjectWorkspaceResource> {
  const detail = await getObjectResource(objectId, langPrefs);
  const parsedModules = parseObjectWorkspace(detail, langPrefs);
  const placeLabelById = new Map(parsedModules.location.places.map((place) => [place.id, place.label]));
  const [taxonomyModule, distinctionsModule, publicationModule, mediaModule, contactsModule, characteristicsModule, capacityPoliciesModule, pricingModule, openingsModule, relationshipsModule, membershipsModule, legalModule, permissions] = await Promise.all([
    getObjectWorkspaceTaxonomyModule(objectId, parsedModules.taxonomy),
    getObjectWorkspaceDistinctionsModule(objectId, parsedModules.distinctions),
    getObjectWorkspacePublicationModule(objectId, detail, parsedModules.publication),
    getObjectWorkspaceMediaModule(objectId, parsedModules.media, placeLabelById),
    getObjectWorkspaceContactsModule(objectId, parsedModules.contacts),
    getObjectWorkspaceCharacteristicsModule(objectId, parsedModules.characteristics),
    getObjectWorkspaceCapacityPoliciesModule(objectId, parsedModules.capacityPolicies),
    getObjectWorkspacePricingModule(objectId, parsedModules.pricing),
    getObjectWorkspaceOpeningsModule(objectId, parsedModules.openings),
    getObjectWorkspaceRelationshipsModule(objectId, parsedModules.relationships),
    getObjectWorkspaceMembershipModule(objectId, detail, parsedModules.memberships),
    getObjectWorkspaceLegalModule(objectId, parsedModules.legal),
    getObjectWorkspacePermissions(objectId),
  ]);

  const modules: ObjectWorkspaceModules = {
    ...parsedModules,
    taxonomy: taxonomyModule,
    distinctions: distinctionsModule,
    publication: publicationModule,
    media: mediaModule,
    contacts: contactsModule,
    characteristics: characteristicsModule,
    capacityPolicies: capacityPoliciesModule,
    pricing: pricingModule,
    openings: openingsModule,
    relationships: relationshipsModule,
    memberships: membershipsModule,
    legal: legalModule,
  };

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
      business_timezone: toNullableText(input.businessTimezone) ?? 'Indian/Reunion',
      region_code: toNullableText(input.regionCode),
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

  const [schemeRefsResult, valueRefsResult, existingClassificationsResult] = await Promise.all([
    client
      .from('ref_classification_scheme')
      .select('id, code, name, description, selection, position, display_group, is_distinction')
      .eq('is_distinction', false)
      .order('position', { ascending: true }),
    client.from('ref_classification_value').select('id, scheme_id, code, name, ordinal, metadata'),
    client.from('object_classification').select('id, scheme_id, value_id').eq('object_id', objectId),
  ]);

  if (schemeRefsResult.error) {
    throw mapMutationError(schemeRefsResult.error, 'Impossible de charger les schemas de classification.');
  }

  if (valueRefsResult.error) {
    throw mapMutationError(valueRefsResult.error, 'Impossible de charger les valeurs de classification.');
  }

  if (existingClassificationsResult.error) {
    throw mapMutationError(existingClassificationsResult.error, 'Impossible de charger les classifications existantes.');
  }

  const schemes = (schemeRefsResult.data ?? [])
    .map((row) => row as Record<string, unknown>)
    .filter(isStructuringClassificationScheme)
    .map(normalizeClassificationSchemeRef);
  const schemeById = new Map(schemes.map((scheme) => [scheme.id, scheme]));
  const valueRefs = (valueRefsResult.data ?? [])
    .map((row) => row as Record<string, unknown>)
    .map(normalizeClassificationValueRef)
    .filter((value) => schemeById.has(value.schemeId));
  const valueByCompositeKey = new Map(valueRefs.map((value) => [`${value.schemeId}:${value.code.toLowerCase()}`, value]));
  const allowedSchemeIds = new Set(schemes.map((scheme) => scheme.id));
  const existingRows = ((existingClassificationsResult.data ?? []) as Record<string, unknown>[])
    .filter((row) => allowedSchemeIds.has(readString(row.scheme_id)));
  const existingIds = new Set(existingRows.map((row) => readString(row.id)).filter(Boolean));
  const reusableRowsByKey = new Map(existingRows.map((row) => [`${readString(row.scheme_id)}:${readString(row.value_id)}`, readString(row.id)]));
  const keptIds = new Set<string>();

  for (const scheme of input.schemes) {
    const normalizedSchemeId = scheme.id || (schemes.find((candidate) => candidate.code === scheme.code)?.id ?? '');
    const schemeRef = schemeById.get(normalizedSchemeId);
    if (!schemeRef) {
      continue;
    }

    if (schemeRef.selectionMode === 'single' && scheme.items.length > 1) {
      throw new Error(`Le schema ${scheme.label || scheme.code} n'accepte qu'une seule valeur.`);
    }

    for (const item of scheme.items) {
      const normalizedValue = valueByCompositeKey.get(`${schemeRef.id}:${item.valueCode.toLowerCase()}`);
      if (!normalizedValue) {
        throw new Error(`Valeur de classification inconnue: ${item.valueCode || 'vide'}.`);
      }

      const payload = {
        object_id: objectId,
        scheme_id: schemeRef.id,
        value_id: normalizedValue.id,
        status: toNullableText(item.status),
        awarded_at: toNullableText(item.awardedAt),
        valid_until: toNullableText(item.validUntil),
      };

      const existingId =
        (item.recordId && existingIds.has(item.recordId) ? item.recordId : null)
        ?? reusableRowsByKey.get(`${schemeRef.id}:${normalizedValue.id}`)
        ?? null;

      if (existingId) {
        const { error } = await client.from('object_classification').update(payload).eq('id', existingId);
        if (error) {
          throw mapMutationError(error, "Impossible d'enregistrer une classification structurante.");
        }
        keptIds.add(existingId);
      } else {
        const { data, error } = await client.from('object_classification').insert(payload).select('id').single();
        if (error) {
          throw mapMutationError(error, "Impossible de creer une classification structurante.");
        }
        keptIds.add(readString((data as Record<string, unknown>).id));
      }
    }
  }

  const idsToDelete = Array.from(existingIds).filter((id) => !keptIds.has(id));
  if (idsToDelete.length > 0) {
    const { error } = await client.from('object_classification').delete().in('id', idsToDelete);
    if (error) {
      throw mapMutationError(error, "Impossible de supprimer les classifications retirees.");
    }
  }
}

export async function saveObjectWorkspaceCharacteristics(objectId: string, input: ObjectWorkspaceCharacteristicsModule): Promise<void> {
  const session = useSessionStore.getState();
  if (session.demoMode) {
    return;
  }

  const client = getSupabaseClient();
  if (!client) {
    throw new Error('Connexion backend indisponible pour enregistrer les caracteristiques.');
  }

  const [
    languageRefsResult,
    languageLevelsResult,
    paymentRefsResult,
    environmentRefsResult,
    amenityRefsResult,
  ] = await Promise.all([
    client.from('ref_language').select('id, code'),
    client.from('ref_code_language_level').select('id, code'),
    client.from('ref_code_payment_method').select('id, code'),
    client.from('ref_code_environment_tag').select('id, code'),
    client.from('ref_amenity').select('id, code'),
  ]);

  if (languageRefsResult.error) {
    throw mapMutationError(languageRefsResult.error, 'Impossible de charger les langues.');
  }
  if (languageLevelsResult.error) {
    throw mapMutationError(languageLevelsResult.error, 'Impossible de charger les niveaux de langue.');
  }
  if (paymentRefsResult.error) {
    throw mapMutationError(paymentRefsResult.error, 'Impossible de charger les moyens de paiement.');
  }
  if (environmentRefsResult.error) {
    throw mapMutationError(environmentRefsResult.error, 'Impossible de charger les tags environnement.');
  }
  if (amenityRefsResult.error) {
    throw mapMutationError(amenityRefsResult.error, 'Impossible de charger les equipements.');
  }

  const languageIdByCode = new Map(
    (languageRefsResult.data ?? []).map((row) => [readString((row as Record<string, unknown>).code).toLowerCase(), readString((row as Record<string, unknown>).id)]),
  );
  const levelIdByCode = new Map(
    (languageLevelsResult.data ?? []).map((row) => [readString((row as Record<string, unknown>).code).toLowerCase(), readString((row as Record<string, unknown>).id)]),
  );
  const paymentIdByCode = new Map(
    (paymentRefsResult.data ?? []).map((row) => [readString((row as Record<string, unknown>).code).toLowerCase(), readString((row as Record<string, unknown>).id)]),
  );
  const environmentIdByCode = new Map(
    (environmentRefsResult.data ?? []).map((row) => [readString((row as Record<string, unknown>).code).toLowerCase(), readString((row as Record<string, unknown>).id)]),
  );
  const amenityIdByCode = new Map(
    (amenityRefsResult.data ?? []).map((row) => [readString((row as Record<string, unknown>).code).toLowerCase(), readString((row as Record<string, unknown>).id)]),
  );

  const unknownLanguage = input.selectedLanguages.find((item) => !languageIdByCode.has(item.code.toLowerCase()));
  if (unknownLanguage) {
    throw new Error(`Langue inconnue: ${unknownLanguage.code || 'vide'}.`);
  }

  const unknownLevel = input.selectedLanguages.find((item) => item.levelCode && !levelIdByCode.has(item.levelCode.toLowerCase()));
  if (unknownLevel) {
    throw new Error(`Niveau de langue inconnu: ${unknownLevel.levelCode}.`);
  }

  const unknownPayment = input.selectedPaymentCodes.find((code) => !paymentIdByCode.has(code.toLowerCase()));
  if (unknownPayment) {
    throw new Error(`Moyen de paiement inconnu: ${unknownPayment}.`);
  }

  const unknownEnvironment = input.selectedEnvironmentCodes.find((code) => !environmentIdByCode.has(code.toLowerCase()));
  if (unknownEnvironment) {
    throw new Error(`Tag environnement inconnu: ${unknownEnvironment}.`);
  }

  const unknownAmenity = input.selectedAmenityCodes.find((code) => !amenityIdByCode.has(code.toLowerCase()));
  if (unknownAmenity) {
    throw new Error(`Equipement inconnu: ${unknownAmenity}.`);
  }

  const languageRows = input.selectedLanguages.map((item) => ({
    object_id: objectId,
    language_id: languageIdByCode.get(item.code.toLowerCase()) as string,
    level_id: item.levelCode ? levelIdByCode.get(item.levelCode.toLowerCase()) ?? null : null,
  }));
  const paymentRows = Array.from(new Set(input.selectedPaymentCodes.map((code) => code.toLowerCase())))
    .map((code) => ({
      object_id: objectId,
      payment_method_id: paymentIdByCode.get(code) as string,
    }));
  const environmentRows = Array.from(new Set(input.selectedEnvironmentCodes.map((code) => code.toLowerCase())))
    .map((code) => ({
      object_id: objectId,
      environment_tag_id: environmentIdByCode.get(code) as string,
    }));
  const amenityRows = Array.from(new Set(input.selectedAmenityCodes.map((code) => code.toLowerCase())))
    .map((code) => ({
      object_id: objectId,
      amenity_id: amenityIdByCode.get(code) as string,
    }));

  const [deleteLanguages, deletePayments, deleteEnvironments, deleteAmenities] = await Promise.all([
    client.from('object_language').delete().eq('object_id', objectId),
    client.from('object_payment_method').delete().eq('object_id', objectId),
    client.from('object_environment_tag').delete().eq('object_id', objectId),
    client.from('object_amenity').delete().eq('object_id', objectId),
  ]);

  if (deleteLanguages.error) {
    throw mapMutationError(deleteLanguages.error, 'Impossible de reinitialiser les langues.');
  }
  if (deletePayments.error) {
    throw mapMutationError(deletePayments.error, 'Impossible de reinitialiser les moyens de paiement.');
  }
  if (deleteEnvironments.error) {
    throw mapMutationError(deleteEnvironments.error, 'Impossible de reinitialiser les tags environnement.');
  }
  if (deleteAmenities.error) {
    throw mapMutationError(deleteAmenities.error, 'Impossible de reinitialiser les equipements.');
  }

  if (languageRows.length > 0) {
    const { error } = await client.from('object_language').insert(languageRows);
    if (error) {
      throw mapMutationError(error, 'Impossible de sauvegarder les langues.');
    }
  }
  if (paymentRows.length > 0) {
    const { error } = await client.from('object_payment_method').insert(paymentRows);
    if (error) {
      throw mapMutationError(error, 'Impossible de sauvegarder les moyens de paiement.');
    }
  }
  if (environmentRows.length > 0) {
    const { error } = await client.from('object_environment_tag').insert(environmentRows);
    if (error) {
      throw mapMutationError(error, 'Impossible de sauvegarder les tags environnement.');
    }
  }
  if (amenityRows.length > 0) {
    const { error } = await client.from('object_amenity').insert(amenityRows);
    if (error) {
      throw mapMutationError(error, 'Impossible de sauvegarder les equipements.');
    }
  }
}

export async function saveObjectWorkspaceCapacityPolicies(objectId: string, input: ObjectWorkspaceCapacityPoliciesModule): Promise<void> {
  const session = useSessionStore.getState();
  if (session.demoMode) {
    return;
  }

  const client = getSupabaseClient();
  if (!client) {
    throw new Error('Connexion backend indisponible pour enregistrer capacites et politiques.');
  }

  const { data: metricRefs, error: metricRefsError } = await client.from('ref_capacity_metric').select('id, code');
  if (metricRefsError) {
    throw mapMutationError(metricRefsError, 'Impossible de charger les metriques de capacite.');
  }

  const metricIdByCode = new Map(
    (metricRefs ?? []).map((row) => [readString((row as Record<string, unknown>).code).toLowerCase(), readString((row as Record<string, unknown>).id)]),
  );

  const unknownMetric = input.capacityItems.find((item) => !metricIdByCode.has(item.metricCode.toLowerCase()));
  if (unknownMetric) {
    throw new Error(`Metrique de capacite inconnue: ${unknownMetric.metricCode || 'vide'}.`);
  }

  const capacityRows = input.capacityItems.map((item) => ({
    object_id: objectId,
    metric_id: metricIdByCode.get(item.metricCode.toLowerCase()) as string,
    value_integer: toNullableInteger(item.value),
    effective_from: toNullableText(item.effectiveFrom),
    effective_to: toNullableText(item.effectiveTo),
  }));

  const { error: deleteCapacitiesError } = await client.from('object_capacity').delete().eq('object_id', objectId);
  if (deleteCapacitiesError) {
    throw mapMutationError(deleteCapacitiesError, 'Impossible de reinitialiser les capacites.');
  }

  if (capacityRows.length > 0) {
    const { error } = await client.from('object_capacity').insert(capacityRows);
    if (error) {
      throw mapMutationError(error, 'Impossible de sauvegarder les capacites.');
    }
  }

  const groupPolicyPayload = {
    object_id: objectId,
    min_size: toNullableInteger(input.groupPolicy.minSize),
    max_size: toNullableInteger(input.groupPolicy.maxSize),
    group_only: input.groupPolicy.groupOnly,
    notes: toNullableText(input.groupPolicy.notes),
  };
  const { error: groupPolicyError } = await client.from('object_group_policy').upsert(groupPolicyPayload, { onConflict: 'object_id' });
  if (groupPolicyError) {
    throw mapMutationError(groupPolicyError, 'Impossible de sauvegarder la politique de groupe.');
  }

  if (input.petPolicy.hasPolicy) {
    const petPolicyPayload = {
      object_id: objectId,
      accepted: input.petPolicy.accepted,
      conditions: toNullableText(input.petPolicy.conditions),
    };
    const { error: petPolicyError } = await client.from('object_pet_policy').upsert(petPolicyPayload, { onConflict: 'object_id' });
    if (petPolicyError) {
      throw mapMutationError(petPolicyError, 'Impossible de sauvegarder la politique animaux.');
    }
  } else {
    const { error: deletePetPolicyError } = await client.from('object_pet_policy').delete().eq('object_id', objectId);
    if (deletePetPolicyError) {
      throw mapMutationError(deletePetPolicyError, 'Impossible de supprimer la politique animaux.');
    }
  }
}

export async function saveObjectWorkspacePricing(objectId: string, input: ObjectWorkspacePricingModule): Promise<void> {
  const session = useSessionStore.getState();
  if (session.demoMode) {
    return;
  }

  const client = getSupabaseClient();
  if (!client) {
    throw new Error('Connexion backend indisponible pour enregistrer les tarifs.');
  }

  const [priceKindRefsResult, priceUnitRefsResult] = await Promise.all([
    client.from('ref_code_price_kind').select('id, code'),
    client.from('ref_code_price_unit').select('id, code'),
  ]);

  if (priceKindRefsResult.error) {
    throw mapMutationError(priceKindRefsResult.error, 'Impossible de charger les types de tarifs.');
  }
  if (priceUnitRefsResult.error) {
    throw mapMutationError(priceUnitRefsResult.error, 'Impossible de charger les unites tarifaires.');
  }

  const priceKindIdByCode = new Map(
    (priceKindRefsResult.data ?? []).map((row) => [readString((row as Record<string, unknown>).code).toLowerCase(), readString((row as Record<string, unknown>).id)]),
  );
  const priceUnitIdByCode = new Map(
    (priceUnitRefsResult.data ?? []).map((row) => [readString((row as Record<string, unknown>).code).toLowerCase(), readString((row as Record<string, unknown>).id)]),
  );

  const unknownKind = input.prices.find((price) => !priceKindIdByCode.has(price.kindCode.toLowerCase()));
  if (unknownKind) {
    throw new Error(`Type de tarif inconnu: ${unknownKind.kindCode || 'vide'}.`);
  }

  const unknownUnit = input.prices.find((price) => price.unitCode && !priceUnitIdByCode.has(price.unitCode.toLowerCase()));
  if (unknownUnit) {
    throw new Error(`Unite tarifaire inconnue: ${unknownUnit.unitCode}.`);
  }

  const { error: deleteDiscountsError } = await client.from('object_discount').delete().eq('object_id', objectId);
  if (deleteDiscountsError) {
    throw mapMutationError(deleteDiscountsError, 'Impossible de reinitialiser les remises.');
  }

  const { error: deletePricesError } = await client.from('object_price').delete().eq('object_id', objectId);
  if (deletePricesError) {
    throw mapMutationError(deletePricesError, 'Impossible de reinitialiser les tarifs.');
  }

  for (const discount of input.discounts) {
    const payload = {
      object_id: objectId,
      conditions: toNullableText(discount.conditions),
      discount_percent: toNullableNumber(discount.discountPercent),
      discount_amount: toNullableNumber(discount.discountAmount),
      currency: toNullableText(discount.currency),
      min_group_size: toNullableInteger(discount.minGroupSize),
      max_group_size: toNullableInteger(discount.maxGroupSize),
      valid_from: toNullableText(discount.validFrom),
      valid_to: toNullableText(discount.validTo),
      source: toNullableText(discount.source),
    };

    const { error } = await client.from('object_discount').insert(payload);
    if (error) {
      throw mapMutationError(error, 'Impossible de sauvegarder une remise.');
    }
  }

  for (const price of input.prices) {
    const payload = {
      object_id: objectId,
      kind_id: priceKindIdByCode.get(price.kindCode.toLowerCase()) as string,
      unit_id: price.unitCode ? priceUnitIdByCode.get(price.unitCode.toLowerCase()) ?? null : null,
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
    };

    const { data, error } = await client.from('object_price').insert(payload).select('id').single();
    if (error) {
      throw mapMutationError(error, 'Impossible de sauvegarder un tarif.');
    }

    const priceId = readString((data as Record<string, unknown>).id);
    if (!priceId || price.periods.length === 0) {
      continue;
    }

    const periodPayloads = price.periods.map((period) => ({
      price_id: priceId,
      start_date: toNullableText(period.startDate),
      end_date: toNullableText(period.endDate),
      start_time: toNullableText(period.startTime),
      end_time: toNullableText(period.endTime),
      note: toNullableText(period.note),
    }));

    const { error: periodError } = await client.from('object_price_period').insert(periodPayloads);
    if (periodError) {
      throw mapMutationError(periodError, 'Impossible de sauvegarder les periodes tarifaires.');
    }
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
    client.from('ref_code_membership_campaign').select('id, code'),
    client.from('ref_code_membership_tier').select('id, code'),
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
    return;
  }

  const { error } = await client.from('object_location').insert(payload);
  if (error) {
    throw mapMutationError(error, "Impossible de creer la localisation principale.");
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
    client.from('ref_code_media_type').select('id, code, name'),
    client.from('ref_code_media_tag').select('id, code, name'),
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
    client.from('ref_code_contact_kind').select('id, code'),
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

export async function saveObjectWorkspaceDescriptions(
  objectId: string,
  input: ObjectWorkspaceDescriptionsModule,
  options: { canEditPlaceDescriptions: boolean },
): Promise<void> {
  const session = useSessionStore.getState();
  if (session.demoMode) {
    return;
  }

  await upsertObjectDescription(objectId, input.object);

  if (!options.canEditPlaceDescriptions) {
    return;
  }

  for (const placeScope of input.places) {
    await upsertPlaceDescription(placeScope);
  }
}
