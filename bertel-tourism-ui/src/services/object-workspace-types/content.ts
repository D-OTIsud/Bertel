import type { WorkspaceReferenceOption, WorkspaceTranslatableField } from './common';

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
  /** Current user's organisation overlay (null when none / not enrichable). */
  orgOverlay: ObjectWorkspaceDescriptionScope | null;
  /** @deprecated Secondary sites live in the `places` module — kept empty at parse time. */
  places: ObjectWorkspaceDescriptionScope[];
}

export interface ObjectWorkspaceLegalTypeOption {
  id: string;
  code: string;
  label: string;
  /** `ref_legal_type.description` — dans quelle situation cette pièce est demandée (§209). */
  description: string;
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
  /**
   * The attached justificatif's URL/title, resolved from ref_document for display only
   * (by the loader for saved rows, or from the upload response for a just-attached file).
   * NOT persisted directly — the saver writes document_id; these are derived.
   */
  documentUrl: string;
  documentTitle: string;
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
  /** R1 no-clobber: set when the object-media load failed — the section renders a
   *  notice instead of an empty grid and the saver refuses to reconcile (a save
   *  against a failure-born empty list would delete every media row). */
  unavailableReason: string | null;
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

/**
 * §90 — object-scoped online presence: a réseau social (domain `social_network`)
 * OR a distribution/OTA link (domain `distribution_channel`). Backed by the
 * `object_web_channel` table (composite FK to `ref_code(id, domain)`); surfaced in
 * §03's second group. No role / no is_primary (unlike a contact channel).
 */
export interface ObjectWorkspaceWebChannelItem {
  id: string;
  kindId: string;
  kindCode: string;
  kindLabel: string;
  /** 'social_network' | 'distribution_channel' — drives the §03 UI grouping. */
  kindDomain: string;
  value: string;
  isPublic: boolean;
  position: string;
}

export interface ObjectWorkspaceContactsModule {
  kindOptions: WorkspaceReferenceOption[];
  roleOptions: WorkspaceReferenceOption[];
  objectItems: ObjectWorkspaceContactItem[];
  /** §90 réseaux sociaux + distribution (object_web_channel). */
  webItems: ObjectWorkspaceWebChannelItem[];
  /** §90 kind catalog for web channels (ref_code social_network + distribution_channel). */
  webKindOptions: WorkspaceReferenceOption[];
  relatedActorContactsCount: number;
  relatedOrganizationContactsCount: number;
}
