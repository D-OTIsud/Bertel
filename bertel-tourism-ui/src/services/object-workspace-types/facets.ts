import type { WorkspaceReferenceOption } from './common';

export interface ObjectWorkspaceAmenityOption extends WorkspaceReferenceOption {
  /** Disability types covered by this amenity (e.g. 'motor', 'hearing', 'visual', 'cognitive').
   *  Empty array for non-accessibility families. */
  disabilityTypes: string[];
}

export interface ObjectWorkspaceAmenityGroup {
  familyCode: string;
  familyLabel: string;
  options: ObjectWorkspaceAmenityOption[];
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
  /** Tri-state: null = « non renseigné » (no DB row) — an absent statement must
   *  never silently become a public « Animaux non acceptés » (accepted=false). */
  accepted: boolean | null;
  conditions: string;
}

/** Heure d'arrivée / départ (HEB) — check-in window + check-out deadline. Times are 'HH:MM' or ''. */
export interface ObjectWorkspaceStayPolicyForm {
  checkInFrom: string;
  checkInUntil: string;
  checkOutUntil: string;
  conditions: string;
}

export interface ObjectWorkspaceCapacityPoliciesModule {
  metricOptions: WorkspaceReferenceOption[];
  capacityItems: ObjectWorkspaceCapacityItem[];
  groupPolicy: ObjectWorkspaceGroupPolicyForm;
  petPolicy: ObjectWorkspacePetPolicyForm;
  stayPolicy: ObjectWorkspaceStayPolicyForm;
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
  /** Justificatif (ref_document) attached to this classification — §71 C. */
  documentId: string;
  documentUrl: string;
  documentTitle: string;
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
  /** ref_classification_scheme.display_group — groups the §08 add-picker (official_classification / graded_label / quality_label). */
  displayGroup: string;
  valueOptions: WorkspaceReferenceOption[];
}

export interface ObjectWorkspaceDistinctionsModule {
  distinctionGroups: ObjectWorkspaceDistinctionGroup[];
  accessibilityLabels: ObjectWorkspaceDistinctionItem[];
  accessibilityAmenityCoverage: ObjectWorkspaceAccessibilityAmenityItem[];
  schemeOptions: ObjectWorkspaceDistinctionSchemeOption[];
  unavailableReason: string | null;
}

export interface ObjectWorkspaceTagItem {
  tagId: string;
  slug: string;
  label: string;
  /** Global display color (ref_tag.color) as a lowercase hex #rrggbb. */
  color: string;
}

export interface ObjectWorkspaceTagsModule {
  displayed: ObjectWorkspaceTagItem[];
  library: ObjectWorkspaceTagItem[];
}

export interface ObjectWorkspaceSustainabilityAction {
  id: string;
  code: string;
  label: string;
  description: string;
  selected: boolean;
  note: string;
  documentId: string;
}

export interface ObjectWorkspaceSustainabilityCategory {
  id: string;
  code: string;
  label: string;
  description: string;
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
