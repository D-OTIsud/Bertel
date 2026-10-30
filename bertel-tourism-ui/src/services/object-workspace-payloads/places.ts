import { type ObjectWorkspacePlaceItem, type ObjectWorkspacePlacesModule } from '../object-workspace-parser';
import {
  toRpcUuid,
  toNullableText,
  toNullableNumber,
  toNullableInteger,
  workspaceNameForSave,
} from './input';
import { readCoercingString as readString, readPermissiveBoolean as readBoolean } from '../../lib/json-read';

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



export function assertPlaceCoordsPaired(items: ObjectWorkspacePlaceItem[]): void {
  for (const item of items) {
    const hasLat = Boolean(item.location.latitude.trim());
    const hasLng = Boolean(item.location.longitude.trim());
    if (hasLat !== hasLng) {
      throw new Error(`Coordonnées incomplètes pour le site « ${item.label || 'sans nom'} ».`);
    }
  }
}



/** Pure payload for api.save_object_places (secondary sites only — zones use buildZonesPayload). */
export function buildPlacesRpcPayload(input: ObjectWorkspacePlacesModule): Record<string, unknown> {
  assertPlaceCoordsPaired(input.items);
  const stableId = (value: string | null): string => {
    const id = toRpcUuid(value);
    if (!id) throw new Error('Un site, une adresse ou une description n’a pas d’identifiant stable. Rechargez la fiche avant de sauvegarder.');
    return id;
  };
  const currentIds = input.items.map((item) => item.recordId).filter((id): id is string => Boolean(id));
  if (new Set(currentIds).size !== currentIds.length) throw new Error('Un même site apparaît plusieurs fois. Rechargez la fiche avant de sauvegarder.');
  return {
    write_contract: 'places-reconcile-v1',
    deleted_ids: [...new Set(input.knownPlaceIds ?? [])].filter((id) => !currentIds.includes(id)),
    places: input.items.map((item, index) => {
      const rawPlace = item.rawPlace ?? {};
      const rawLocations = item.rawLocations ?? [];
      const locationIndex = rawLocations.findIndex((row) => readString(row.id) === item.location.recordId);
      const selectedLocationIndex = locationIndex >= 0
        ? locationIndex
        : Math.max(0, rawLocations.findIndex((row) => readBoolean(row.is_main_location ?? row.is_main)));
      const locationPayload = (raw: Record<string, unknown>, position: number) => ({
        ...raw,
        id: stableId(readString(raw.id) || (position === selectedLocationIndex ? item.location.recordId : null)),
        address1: position === selectedLocationIndex ? toNullableText(item.location.address1) : raw.address1 ?? null,
        address1_suite: position === selectedLocationIndex ? toNullableText(item.location.address1Suite) : raw.address1_suite ?? null,
        address2: position === selectedLocationIndex ? toNullableText(item.location.address2) : raw.address2 ?? null,
        address3: position === selectedLocationIndex ? toNullableText(item.location.address3) : raw.address3 ?? null,
        postcode: position === selectedLocationIndex ? toNullableText(item.location.postcode) : raw.postcode ?? null,
        city: position === selectedLocationIndex ? toNullableText(item.location.city) : raw.city ?? null,
        code_insee: position === selectedLocationIndex ? toNullableText(item.location.codeInsee) : raw.code_insee ?? null,
        lieu_dit: position === selectedLocationIndex ? toNullableText(item.location.lieuDit) : raw.lieu_dit ?? null,
        direction: position === selectedLocationIndex ? (item.location.direction || null) : raw.direction ?? null,
        latitude: position === selectedLocationIndex ? toNullableNumber(item.location.latitude) : raw.latitude ?? null,
        longitude: position === selectedLocationIndex ? toNullableNumber(item.location.longitude) : raw.longitude ?? null,
        altitude_m: position === selectedLocationIndex
          ? (item.location.altitude?.trim() ? toNullableInteger(item.location.altitude) : raw.altitude_m ?? null)
          : raw.altitude_m ?? null,
        is_main_location: raw.id ? (raw.is_main_location ?? raw.is_main ?? null) : position === selectedLocationIndex,
        ...(raw.position == null ? {} : { position: raw.position }),
      });
      const locations = rawLocations.length > 0
        ? rawLocations.map(locationPayload)
        : [locationPayload(item.location.raw ?? {}, 0)];

      const rawDescriptions = item.rawDescriptions ?? [];
      const descriptionIndex = rawDescriptions.findIndex((row) => readString(row.id) === item.descriptionRecordId);
      const selectedDescriptionIndex = descriptionIndex >= 0 ? descriptionIndex : 0;
      const descriptionPayload = (raw: Record<string, unknown>, position: number) => {
        if (position !== selectedDescriptionIndex) return raw;
        const { extra, ...rawWithoutExtra } = raw;
        return {
          ...rawWithoutExtra,
          ...(extra == null ? {} : { extra }),
          id: stableId(readString(raw.id) || item.descriptionRecordId),
          description: item.description.baseValue || null,
          description_i18n: Object.keys(item.description.values).length > 0 ? item.description.values : (raw.description_i18n ?? null),
          visibility: item.rawVisibility === null && !item.visibilityEdited && item.visibility === 'public' ? null : item.visibility,
          ...(raw.position == null ? {} : { position: raw.position }),
        };
      };
      const descriptions = rawDescriptions.length > 0
        ? rawDescriptions.map(descriptionPayload)
        : [descriptionPayload({}, 0)];

      const { extra, ...rawPlaceWithoutExtra } = rawPlace;
      return {
        ...rawPlaceWithoutExtra,
        id: stableId(item.recordId),
        label: workspaceNameForSave(item.label, item.rawName),
        position: Object.prototype.hasOwnProperty.call(rawPlace, 'position') ? rawPlace.position : item.position ?? index,
        ...(extra == null ? {} : { extra }),
        locations,
        descriptions,
      };
    }),
  };
}
