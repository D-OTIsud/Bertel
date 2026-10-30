import { type ObjectWorkspaceItineraryModule } from '../object-workspace-parser';
import { toNullableNumber, toNullableInteger, toNullableText, workspaceNameForSave } from './input';

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
): Array<{
  id?: string;
  name: string;
  description: string;
  position: string;
  extra: Record<string, unknown>;
  name_i18n: Record<string, string> | null;
  description_i18n: Record<string, string> | null;
  lng?: string;
  lat?: string;
  media: Array<{ media_id: string; position: number }>;
}> | null {
  if (input.unavailableReason != null) {
    return null;
  }
  // §111 C: also carry kind (extra.kind), the GPS point (lng/lat), and the linked media so the
  // RPC delete+reinsert preserves them — sending only name/description would wipe stage geom + photos.
  return input.stages.map((stage) => ({
    ...(stage.recordId ? { id: stage.recordId } : {}),
    name: workspaceNameForSave(stage.name, stage.rawName) ?? '',
    description: stage.description,
    position: stage.position,
    extra: { ...Object.fromEntries(Object.entries(stage.extra ?? {}).filter(([key]) => key !== 'kind')), ...(stage.kind ? { kind: stage.kind } : {}) },
    name_i18n: stage.nameTranslations && Object.keys(stage.nameTranslations).length > 0 ? stage.nameTranslations : null,
    description_i18n: stage.descriptionTranslations && Object.keys(stage.descriptionTranslations).length > 0 ? stage.descriptionTranslations : null,
    ...(stage.lng && stage.lat ? { lng: stage.lng, lat: stage.lat } : {}),
    media: stage.mediaIds.map((mediaId, mediaIndex) => ({ media_id: mediaId, position: mediaIndex })),
  }));
}



/**
 * §111 Pure builder for the `info` payload of api.save_object_itinerary_nested (object_iti_info —
 * the §06 « Infos pratiques » block). Maps the editor fields to the RPC columns. Returns null when
 * the module did not load (unavailableReason) so a failed load cannot delete/clobber existing info.
 * Empty strings become NULL server-side (NULLIF in the RPC); the row is upserted, never partial.
 */
export function buildItineraryInfoPayload(
  input: ObjectWorkspaceItineraryModule,
): {
  access: string;
  ambiance: string;
  recommended_parking: string;
  required_equipment: string;
  info_places: string;
  is_child_friendly: boolean;
} | null {
  if (input.unavailableReason != null) {
    return null;
  }
  return {
    access: input.access,
    ambiance: input.ambiance,
    recommended_parking: input.recommendedParking,
    required_equipment: input.requiredEquipment,
    info_places: input.infoPlaces,
    is_child_friendly: input.childFriendly,
    ...(input.infoTranslations ?? {}),
  };
}



/**
 * §111 C3 Pure builder for the `associated_objects` payload of api.save_object_itinerary_nested
 * (object_iti_associated_object — objets liés). null when the module did not load (the RPC
 * delete+reinserts, so a failed load must not wipe existing links). An empty array intentionally
 * clears all links. role_id is the ref_iti_assoc_role UUID (from the loaded data or the role select).
 */
export function buildItineraryAssociatedObjectsPayload(
  input: ObjectWorkspaceItineraryModule,
): Array<{ associated_object_id: string; role_id: string; note: string }> | null {
  if (input.unavailableReason != null) {
    return null;
  }
  return input.associatedObjects.map((entry) => ({
    associated_object_id: entry.associatedObjectId,
    role_id: entry.roleId,
    note: entry.note,
  }));
}
