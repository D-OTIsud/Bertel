import {
  type ObjectWorkspaceMeetingRoomItem,
  type ObjectWorkspaceRoomsModule,
} from '../object-workspace-parser';
import {
  isUuid,
  workspaceNameForSave,
  toNullableNumber,
  toNullableInteger,
  toRpcUuid,
  toNullableText,
} from './input';

export function buildMeetingRoomSavePayload(
  objectId: string,
  item: ObjectWorkspaceMeetingRoomItem,
): Record<string, unknown> {
  const id = item.recordId ?? (item.uid && isUuid(item.uid) ? item.uid : null);
  if (!id) throw new Error('Nouvelle salle MICE sans identifiant stable. Rechargez la fiche, puis recréez la salle.');
  return {
    id,
    object_id: objectId,
    name: workspaceNameForSave(item.name, item.rawName),
    name_i18n: item.nameTranslations,
    extra: item.extra ?? null,
    area_m2: toNullableNumber(item.areaM2),
    cap_theatre: toNullableInteger(item.capacityTheatre),
    cap_u: toNullableInteger(item.capacityU),
    cap_classroom: toNullableInteger(item.capacityClassroom),
    cap_boardroom: toNullableInteger(item.capacityBoardroom),
  };
}



export function buildMeetingRoomEquipmentReconcile(
  roomId: string,
  item: ObjectWorkspaceMeetingRoomItem,
  equipmentIdByCode: Map<string, string>,
): { upsertRows: Array<{ room_id: string; equipment_id: string; position: number | null; note: string | null }>; removedIds: string[] } {
  const selectedIds = Array.from(new Set(item.equipmentCodes))
    .map((code) => equipmentIdByCode.get(code.toLowerCase()) as string);
  const selected = new Set(selectedIds);
  const oldDetails = item.equipmentDetails ?? [];
  const oldById = new Map(oldDetails.map((detail) => [detail.equipmentId, detail]));
  return {
    removedIds: oldDetails.map((detail) => detail.equipmentId).filter((id) => !selected.has(id)),
    upsertRows: selectedIds.map((equipmentId, position) => {
      const old = oldById.get(equipmentId);
      return { room_id: roomId, equipment_id: equipmentId, position: old ? old.position : position + 1, note: old?.note ?? null };
    }),
  };
}



export function buildMeetingRoomDeletedIds(
  knownRoomIds: string[],
  items: ObjectWorkspaceMeetingRoomItem[],
): string[] {
  const currentIds = new Set(items.map((item) => item.recordId).filter((id): id is string => Boolean(id)));
  return [...new Set(knownRoomIds)].filter((id) => !currentIds.has(id));
}



/** Pure payload for api.save_object_rooms — one atomic reconcile per save. */
export function buildRoomsRpcPayload(input: ObjectWorkspaceRoomsModule): Record<string, unknown> {
  const knownIds = new Set(input.knownRoomIds ?? input.items.map((item) => item.recordId).filter((id): id is string => Boolean(id)));
  const currentIds = input.items.map((item) => item.recordId).filter((id): id is string => Boolean(id));
  if (new Set(currentIds).size !== currentIds.length) throw new Error('Une même chambre apparaît plusieurs fois. Rechargez la fiche avant de sauvegarder.');
  return {
    write_contract: 'rooms-reconcile-v1',
    deleted_ids: [...knownIds].filter((id) => !currentIds.includes(id)),
    rooms: input.items.map((item) => ({
      id: toRpcUuid(item.recordId),
      code: item.code,
      name: workspaceNameForSave(item.name, item.rawName) ?? '',
      name_i18n: Object.keys(item.nameTranslations).length > 0 ? item.nameTranslations : null,
      description: item.description || null,
      description_i18n: Object.keys(item.descriptionTranslations).length > 0 ? item.descriptionTranslations : null,
      extra: item.extra ?? null,
      room_type_code: item.roomTypeCode || null,
      view_type_code: item.viewTypeCode || null,
      capacity_adults: toNullableInteger(item.capacityAdults),
      capacity_children: toNullableInteger(item.capacityChildren),
      capacity_total: toNullableInteger(item.capacityTotal),
      size_sqm: toNullableNumber(item.sizeSqm),
      bed_config: toNullableText(item.bedConfig),
      bed_config_i18n: Object.keys(item.bedConfigTranslations).length > 0 ? item.bedConfigTranslations : null,
      total_rooms: toNullableInteger(item.quantity),
      floor_level: toNullableInteger(item.floorLevel),
      base_price: toNullableNumber(item.basePrice),
      currency: item.currency || null,
      is_accessible: item.rawAccessible === null && !item.accessible ? null : item.accessible,
      is_published: item.rawPublished === null && item.published ? null : item.published,
      position: toNullableInteger(item.position),
      amenity_codes: Array.from(new Set(item.amenityCodes)),
      media_ids: Array.from(new Set(item.mediaIds.filter((id) => isUuid(id)))),
      beds: item.beds.map((bed, bedIndex) => ({
        bed_type_code: bed.bedTypeCode,
        quantity: toNullableInteger(bed.quantity) ?? 1,
        position: bed.position ?? bedIndex + 1,
      })),
    })),
  };
}
