import type { ObjectWorkspaceModuleAvailability, WorkspaceTranslatableField } from './common';

export type WorkspaceModuleId = 'general-info' | 'taxonomy' | 'publication' | 'sync-identifiers' | 'location' | 'descriptions' | 'media' | 'contacts' | 'characteristics' | 'distinctions' | 'capacity-policies' | 'pricing' | 'rooms' | 'meeting-rooms' | 'menus' | 'activity' | 'event' | 'itinerary' | 'openings' | 'provider-follow-up' | 'relationships' | 'memberships' | 'legal' | 'tags' | 'sustainability' | 'distribution' | 'provider' | 'places';

export interface ObjectWorkspaceGeneralInfo {
  name: string;
  nameTranslations: Record<string, string>;
  businessTimezone: string;
  commercialVisibility: string;
  regionCode: string;
  status: string;
  publishedAt: string;
  isEditing: boolean;
  /**
   * object.secondary_types — transitory, non-canonical, opt-in multi-family flag.
   * Never replaces object.object_type and is not an API filter; read-only here.
   */
  secondaryTypes: string[];
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
  axis?: 'famille' | 'nature' | 'sous_type' | 'type_unite' | 'positionnement' | null;
  family?: string | null;
  aliases?: string[];
  sourceRef?: string | null;
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

/**
 * §201 — axe « Type d'unité d'hébergement », MULTI-VALUÉ et distinct de la
 * NATURE. `object_taxonomy` n'accepte qu'une valeur par domaine : un
 * établissement qui propose une bulle ET un lodge ne peut pas s'y représenter.
 * Répond à « dans quoi le visiteur dort-il ? ».
 */
export interface ObjectWorkspaceUnitTypes {
  options: Array<{ code: string; label: string; description: string }>;
  selectedCodes: string[];
  /** Non nul = catalogue absent (taxo6 non appliquée) ⇒ contrôle désactivé AVEC motif. */
  unavailableReason: string | null;
}

/** Positionnements commerciaux d'un hôtel, multi-valués et indépendants de sa nature. */
export interface ObjectWorkspacePositionings {
  options: Array<{ code: string; label: string; description: string }>;
  selectedCodes: string[];
  unavailableReason: string | null;
}

export interface ObjectWorkspaceTaxonomyModule {
  domains: ObjectWorkspaceTaxonomyDomain[];
  unitTypes: ObjectWorkspaceUnitTypes;
  /** Optionnel pour préserver les brouillons/imports créés avant cet axe. */
  positionings?: ObjectWorkspacePositionings;
  unavailableReason: string | null;
}

export const EMPTY_UNIT_TYPES: ObjectWorkspaceUnitTypes = {
  options: [],
  selectedCodes: [],
  unavailableReason: null,
};

export const EMPTY_POSITIONINGS: ObjectWorkspacePositionings = {
  options: [],
  selectedCodes: [],
  unavailableReason: null,
};

export interface ObjectWorkspaceLocationForm {
  recordId: string | null;
  altitude?: string;
  raw?: Record<string, unknown>;
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

export interface ObjectWorkspaceZoneOption {
  /** INSEE commune code (5 digits). */
  code: string;
  /** Commune display name. */
  label: string;
}

export interface ObjectWorkspaceLocationModule {
  main: ObjectWorkspaceLocationForm;
  /** @deprecated Secondary sites live in the `places` module — kept empty at parse time. */
  places: ObjectWorkspacePlaceSummary[];
  /** Selected INSEE commune codes (object_zone). */
  zoneCodes: string[];
  /** Commune catalog for the §16 "communes desservies" multi-select (loaded from ref_commune; empty until enriched). */
  zoneOptions: ObjectWorkspaceZoneOption[];
  /** Non-null when the commune catalog / object_zone read failed — the saver then skips zone persistence (no clobber). */
  zonesUnavailableReason: string | null;
}

export interface ObjectWorkspacePlaceItem {
  recordId: string | null;
  isNew?: boolean;
  label: string;
  rawName?: string | null;
  rawPlace?: Record<string, unknown>;
  rawLocations?: Record<string, unknown>[];
  rawDescriptions?: Record<string, unknown>[];
  position: number;
  descriptionRecordId: string | null;
  description: WorkspaceTranslatableField;
  visibility: 'public' | 'private' | 'partners';
  rawVisibility?: string | null;
  visibilityEdited?: boolean;
  location: ObjectWorkspaceLocationForm;
}

export interface ObjectWorkspacePlacesModule {
  items: ObjectWorkspacePlaceItem[];
  knownPlaceIds?: string[];
  unavailableReason: string | null;
}

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
