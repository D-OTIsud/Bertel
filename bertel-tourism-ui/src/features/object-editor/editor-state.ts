/**
 * Pure editor-state helpers shared by the drawer editor and the full-page editor.
 *
 * An EditorSnapshot pairs the saved `baseline` with the in-progress `draft` of a
 * workspace's modules; the helpers below derive which modules have unsaved edits.
 */

import type {
  ObjectWorkspaceGeneralInfo,
  ObjectWorkspaceModules,
} from '../../services/object-workspace-parser';
import type { WorkspaceModuleId } from '../../services/object-workspace';

export interface EditorSnapshot {
  objectId: string;
  baseline: ObjectWorkspaceModules;
  draft: ObjectWorkspaceModules;
}

export function cloneModules(value: ObjectWorkspaceModules): ObjectWorkspaceModules {
  return JSON.parse(JSON.stringify(value)) as ObjectWorkspaceModules;
}

function serialize(value: unknown): string {
  return JSON.stringify(value);
}

/** General-info fields persisted outside the object record; ignored when diffing content. */
function stripGeneralInfoManagedOutsideObject(value: ObjectWorkspaceGeneralInfo) {
  const {
    commercialVisibility,
    businessTimezone,
    regionCode,
    ...rest
  } = value;
  return rest;
}

/** UI-navigation state carried inside the descriptions module; never persisted.
 *  Tolerates partial fixtures where the module is absent. */
function stripDescriptionsNavState(value: ObjectWorkspaceModules['descriptions'] | undefined) {
  if (!value) {
    return value;
  }
  const { activeLanguage, ...rest } = value;
  return rest;
}

export function isModuleDirty(snapshot: EditorSnapshot, key: keyof ObjectWorkspaceModules): boolean {
  if (key === 'descriptions') {
    // Switching the §04/§10 language tabs writes `activeLanguage` through replaceModule —
    // pure navigation must not light the save bar (nor trigger a no-op canonical rewrite).
    return serialize(stripDescriptionsNavState(snapshot.draft.descriptions))
      !== serialize(stripDescriptionsNavState(snapshot.baseline.descriptions));
  }
  return serialize(snapshot.draft[key]) !== serialize(snapshot.baseline[key]);
}

export function isGeneralInfoContentDirty(snapshot: EditorSnapshot): boolean {
  return serialize(stripGeneralInfoManagedOutsideObject(snapshot.draft.generalInfo))
    !== serialize(stripGeneralInfoManagedOutsideObject(snapshot.baseline.generalInfo));
}

export function isPublicationSettingsDirty(snapshot: EditorSnapshot): boolean {
  return snapshot.draft.generalInfo.commercialVisibility !== snapshot.baseline.generalInfo.commercialVisibility;
}

export const MODULE_KEY_MAP: Record<WorkspaceModuleId, keyof ObjectWorkspaceModules> = {
  'general-info': 'generalInfo',
  taxonomy: 'taxonomy',
  publication: 'publication',
  'sync-identifiers': 'syncIdentifiers',
  location: 'location',
  descriptions: 'descriptions',
  media: 'media',
  contacts: 'contacts',
  characteristics: 'characteristics',
  distinctions: 'distinctions',
  'capacity-policies': 'capacityPolicies',
  pricing: 'pricing',
  rooms: 'rooms',
  'meeting-rooms': 'meetingRooms',
  menus: 'menus',
  activity: 'activity',
  event: 'event',
  itinerary: 'itinerary',
  openings: 'openings',
  'provider-follow-up': 'providerFollowUp',
  relationships: 'relationships',
  memberships: 'memberships',
  legal: 'legal',
  tags: 'tags',
  sustainability: 'sustainability',
  distribution: 'distribution',
  provider: 'provider',
};

export const READONLY_MODULES = new Set<WorkspaceModuleId>([
  'sync-identifiers',
  'provider-follow-up',
  'distribution',
  'provider',
]);

export function getDirtySections(snapshot: EditorSnapshot | null): Partial<Record<WorkspaceModuleId, boolean>> {
  if (!snapshot) {
    return {};
  }

  const generalInfoDirty = isGeneralInfoContentDirty(snapshot);
  const publicationDirty = isPublicationSettingsDirty(snapshot);
  const dirty: Partial<Record<WorkspaceModuleId, boolean>> = {};
  for (const [moduleId, key] of Object.entries(MODULE_KEY_MAP) as [WorkspaceModuleId, keyof ObjectWorkspaceModules][]) {
    if (moduleId === 'general-info') {
      dirty[moduleId] = generalInfoDirty;
      continue;
    }

    if (moduleId === 'publication') {
      dirty[moduleId] = publicationDirty;
      continue;
    }

    if (READONLY_MODULES.has(moduleId)) {
      dirty[moduleId] = false;
    } else {
      dirty[moduleId] = isModuleDirty(snapshot, key);
    }
  }
  return dirty;
}
