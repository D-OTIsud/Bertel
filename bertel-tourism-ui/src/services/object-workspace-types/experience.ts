import type { WorkspaceMediaOption, WorkspaceReferenceOption } from './common';

export interface ObjectWorkspaceActivityModule {
  durationMin: string;
  minParticipants: string;
  maxParticipants: string;
  difficultyLevel: string;
  guideRequired: boolean;
  minAge: string;
  equipmentProvided: boolean;
  equipmentProvidedDetails: string;
  /** ref_code domain iti_difficulty (codes 1–5). */
  difficultyOptions: WorkspaceReferenceOption[];
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
  /** §111 C: client-only stable id for DnD keying of not-yet-saved stages (recordId is null). Not persisted. */
  uid?: string;
  name: string;
  rawName?: string | null;
  nameTranslations?: Record<string, string>;
  descriptionTranslations?: Record<string, string>;
  extra?: Record<string, unknown>;
  description: string;
  position: string;
  /** §111 C: stage type code (ref_code iti_stage_kind), stored in object_iti_stage.extra.kind. */
  kind: string;
  /** §111 C: stage GPS point (object_iti_stage.geom), surfaced as lng/lat strings. '' = no point. */
  lng: string;
  lat: string;
  /** §111 C: linked media ids (object_iti_stage_media) — preserved across the RPC delete+reinsert. */
  mediaIds: string[];
}

export interface ObjectWorkspaceItineraryAssocSummary {
  associatedObjectId: string;
  /** ref_iti_assoc_role id (UUID). */
  roleId: string;
  note: string;
  targetName: string;
  targetType: string;
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
  /** §111 ref_code domain iti_difficulty — labels for the 1-5 difficulty select. */
  difficultyOptions: WorkspaceReferenceOption[];
  /** §111 ref_code domain iti_open_status — labels for the open/partially_closed/warning/closed select. */
  openStatusOptions: WorkspaceReferenceOption[];
  /** §111 ref_code domain iti_stage_kind — labels for the stage type select (depart/etape/POI/…). */
  stageKindOptions: WorkspaceReferenceOption[];
  /** §111 C3 ref_iti_assoc_role — roles for the « objets liés » select (sur_le_parcours/a_proximite/…). */
  assocRoleOptions: WorkspaceReferenceOption[];
  /** §111 stage-photos closeout — the object's §05 media rows, curated per stage (object_iti_stage_media).
   *  Like RoomEditModal, stages LINK existing object media; files upload only in §05 (single-writer). */
  mediaOptions: WorkspaceMediaOption[];
  /** §111 C3 object_iti_associated_object — objets liés (existing tourism objects + a role). */
  associatedObjects: ObjectWorkspaceItineraryAssocSummary[];
  /** §111 object_iti_info — infos pratiques (grouped visually with the is_loop toggle in §06). */
  access: string;
  ambiance: string;
  recommendedParking: string;
  requiredEquipment: string;
  infoPlaces: string;
  childFriendly: boolean;
  infoTranslations?: Record<string, unknown>;
  /** §111 itinerary_details.track_geojson — the trace geometry for the editor MapLibre map (null = no trace yet). */
  trackGeojson: { type: string; coordinates: number[][] } | null;
  stages: ObjectWorkspaceItineraryStageSummary[];
  sectionsCount: number;
  profilesCount: number;
  geometrySummary: string;
  traceEditable: boolean;
  unavailableReason: string | null;
}
