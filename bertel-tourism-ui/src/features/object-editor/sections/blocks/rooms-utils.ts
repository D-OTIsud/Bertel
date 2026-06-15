/**
 * Room-list helpers for §05 BlockHEB.
 *
 * `object_room_type` has UNIQUE(object_id, code) and the saver is a full
 * delete-reinsert — a code collision aborts the save MID-REWRITE. The old
 * `unit-${items.length + 1}` scheme collided after a delete+add; the next
 * code must skip every existing unit-N suffix.
 */

import type { ObjectWorkspaceRoomBed } from '../../../../services/object-workspace-parser';

/** Curated « most common in rooms » amenity codes, in display order (§74). Surfaced flat above
 *  the collapsible category groups so the universal room amenities (Wi-Fi, clim, sèche-cheveux,
 *  linge…) are one click away. The amenity catalog is entirely object-scoped (no room flag), so
 *  this list is the room-relevance signal — adjust it to change what « Les plus courants » shows. */
export const ROOM_COMMON_AMENITY_CODES = [
  'wifi', 'tv', 'kitchenette', 'refrigerator', 'air_conditioning', 'private_bathroom',
  'shower', 'towels', 'bed_linen', 'coffee_machine', 'microwave', 'heating',
  'hairdryer', 'safe', 'balcony', 'desk',
];

type AmenityOpt = { id: string; code: string; label: string };
type AmenityGroup = { familyCode: string; familyLabel: string; options: AmenityOpt[] };

/**
 * Split the room equipment catalog into a flat « courants » list (the curated common codes, in
 * curated order) + the remaining category groups (with the common codes removed, so nothing is
 * shown twice). `isAvailable` is the editor's live filter (unselected AND matching the search).
 * Pure — the editor owns selection + query state.
 */
export function splitRoomAmenities(
  groups: AmenityGroup[],
  isAvailable: (option: AmenityOpt) => boolean,
): { common: AmenityOpt[]; categories: AmenityGroup[] } {
  const byCode = new Map<string, AmenityOpt>();
  for (const group of groups) for (const option of group.options) byCode.set(option.code, option);
  const commonSet = new Set(ROOM_COMMON_AMENITY_CODES);
  const common = ROOM_COMMON_AMENITY_CODES
    .map((code) => byCode.get(code))
    .filter((option): option is AmenityOpt => Boolean(option) && isAvailable(option as AmenityOpt));
  const categories = groups
    .map((group) => ({ ...group, options: group.options.filter((option) => !commonSet.has(option.code) && isAvailable(option)) }))
    .filter((group) => group.options.length > 0);
  return { common, categories };
}

const UNIT_CODE = /^unit-(\d+)$/;

export function nextRoomCode(items: { code: string }[]): string {
  const maxSuffix = items.reduce((max, item) => {
    const match = UNIT_CODE.exec(item.code);
    return match ? Math.max(max, Number.parseInt(match[1], 10)) : max;
  }, 0);
  return `unit-${maxSuffix + 1}`;
}

/** Rewrite 1-based `position` from the new array order after a drag (the saver persists it). */
export function reindexRoomPositions<T extends { position: string }>(items: T[]): T[] {
  return items.map((item, index) => (
    item.position === String(index + 1) ? item : { ...item, position: String(index + 1) }
  ));
}

type RoomCouchagesSlice = { capacityTotal: string; capacityAdults?: string; capacityChildren?: string };
type RoomCapacitySlice = RoomCouchagesSlice & { quantity: string };

/**
 * Couchages effectifs d'une unité — `capacity_total` s'il est saisi, sinon repli sur
 * adultes + enfants. DOIT rester aligné avec la colonne « Couchages » affichée (sinon
 * le total calculé diverge de ce que l'utilisateur voit ligne par ligne).
 */
export function roomCouchages(item: RoomCouchagesSlice): number {
  const total = Number.parseInt(item.capacityTotal, 10);
  if (Number.isFinite(total) && total > 0) {
    return total;
  }
  const adults = Number.parseInt(item.capacityAdults ?? '', 10) || 0;
  const children = Number.parseInt(item.capacityChildren ?? '', 10) || 0;
  return adults + children;
}

/** Object-level accommodation capacity = Σ couchages × unités (empty quantity counts as 1 unit). */
export function computeRoomsCapacitySum(items: RoomCapacitySlice[]): number {
  return items.reduce((sum, item) => sum + roomCouchages(item) * (Number.parseInt(item.quantity, 10) || 1), 0);
}

type CapacityModuleSlice = {
  metricOptions: { id: string; code: string; label: string }[];
  capacityItems: {
    recordId: string | null;
    metricId: string;
    metricCode: string;
    metricLabel: string;
    unit: string;
    value: string;
    effectiveFrom: string;
    effectiveTo: string;
  }[];
};

/**
 * Derived-unless-overridden sync of the §07 `max_capacity` metric with the rooms
 * cumul: the metric follows the rooms while it is empty or still equal to the
 * PREVIOUS cumul; a manually diverged value is never clobbered (no write-magic).
 * Returns the next capacityPolicies module, or null when nothing should change.
 *
 * Target metric (§07 review, 2026-06-11): `max_capacity` — the REAL
 * ref_capacity_metric code (unit pax). The original §54 target `capacity_total`
 * never existed in the catalog, so the sync was a silent no-op on live (the
 * fixtures invented the code and kept the tests green).
 */
export function syncCapacityWithRooms<M extends CapacityModuleSlice>(
  capacity: M,
  prevItems: RoomCapacitySlice[],
  nextItems: RoomCapacitySlice[],
): M | null {
  const prevSum = computeRoomsCapacitySum(prevItems);
  const nextSum = computeRoomsCapacitySum(nextItems);
  if (prevSum === nextSum) {
    return null;
  }

  const existing = capacity.capacityItems.find((item) => item.metricCode === 'max_capacity');
  if (existing) {
    const tracking = existing.value.trim() === '' || existing.value.trim() === String(prevSum);
    if (!tracking) {
      return null;
    }
    return {
      ...capacity,
      capacityItems: capacity.capacityItems.map((item) => (
        item === existing ? { ...item, value: String(nextSum) } : item
      )),
    };
  }

  const metric = capacity.metricOptions.find((option) => option.code === 'max_capacity');
  if (!metric || nextSum <= 0) {
    return null;
  }
  return {
    ...capacity,
    capacityItems: [
      ...capacity.capacityItems,
      {
        recordId: null,
        metricId: metric.id,
        metricCode: metric.code,
        metricLabel: metric.label,
        // Display-only until save — the DB trigger fills the real ref unit on persist.
        unit: 'pax',
        value: String(nextSum),
        effectiveFrom: '',
        effectiveTo: '',
      },
    ],
  };
}

type RoomUnitSlice = { quantity: string };

/** Σ unités (quantity vide = 1 unité) — base de la métrique bedrooms/pitches dérivée. */
export function computeUnitCount(items: RoomUnitSlice[]): number {
  return items.reduce((sum, item) => sum + (Number.parseInt(item.quantity, 10) || 1), 0);
}

/**
 * Métrique de comptage d'unités selon le sous-type HEB. Pas de défaut « bedrooms » :
 * HPA/CAMP utilisent `pitches` (bedrooms n'y est pas applicable → injection gardée-out).
 */
export function unitCountMetricCode(typeCode: string): 'bedrooms' | 'pitches' {
  const t = (typeCode ?? '').toUpperCase();
  return t === 'HPA' || t === 'CAMP' ? 'pitches' : 'bedrooms';
}

/**
 * Crée OU met à jour en place la ligne max_capacity (préserve recordId/metricId).
 * No-op si max_capacity n'est pas applicable au type (absent de metricOptions).
 * Source unique du champ « Capacité max » de §06 (HEB) — y compris la création
 * from-scratch sur un objet sans capacité (sinon write-trap silencieux).
 */
export function upsertMaxCapacity<M extends CapacityModuleSlice>(capacity: M, value: string): M {
  const existing = capacity.capacityItems.find((item) => item.metricCode === 'max_capacity');
  if (existing) {
    return {
      ...capacity,
      capacityItems: capacity.capacityItems.map((item) => (item === existing ? { ...item, value } : item)),
    };
  }
  const metric = capacity.metricOptions.find((option) => option.code === 'max_capacity');
  if (!metric) {
    return capacity;
  }
  return {
    ...capacity,
    capacityItems: [
      ...capacity.capacityItems,
      {
        recordId: null,
        metricId: metric.id,
        metricCode: 'max_capacity',
        metricLabel: metric.label,
        unit: 'pax',
        value,
        effectiveFrom: '',
        effectiveTo: '',
      },
    ],
  };
}

/** Upsert (count>0) ou retrait (count<=0) d'une ligne dérivée lecture seule. Gardé par metricOptions. */
function upsertDerivedRow<M extends CapacityModuleSlice>(capacity: M, code: string, count: number): M {
  if (count <= 0) {
    if (!capacity.capacityItems.some((item) => item.metricCode === code)) {
      return capacity;
    }
    return { ...capacity, capacityItems: capacity.capacityItems.filter((item) => item.metricCode !== code) };
  }
  const metric = capacity.metricOptions.find((option) => option.code === code);
  if (!metric) {
    return capacity;
  }
  const value = String(count);
  const existing = capacity.capacityItems.find((item) => item.metricCode === code);
  if (existing) {
    return {
      ...capacity,
      capacityItems: capacity.capacityItems.map((item) => (item === existing ? { ...item, value } : item)),
    };
  }
  return {
    ...capacity,
    capacityItems: [
      ...capacity.capacityItems,
      { recordId: null, metricId: metric.id, metricCode: code, metricLabel: metric.label, unit: '', value, effectiveFrom: '', effectiveTo: '' },
    ],
  };
}

/**
 * Recalcule les métriques structurelles dérivées (bedrooms|pitches + meeting_rooms) depuis le §06.
 * Lecture seule (pas d'override). N'agit que sur les métriques applicables au type ; ne touche
 * jamais la ligne max_capacity chargée.
 */
export function syncDerivedStructural<M extends CapacityModuleSlice>(
  capacity: M,
  rooms: RoomUnitSlice[],
  meetingRoomsCount: number,
  typeCode: string,
): M {
  let next = upsertDerivedRow(capacity, unitCountMetricCode(typeCode), computeUnitCount(rooms));
  next = upsertDerivedRow(next, 'meeting_rooms', meetingRoomsCount);
  return next;
}

/** Parse a room capacity string to a non-negative int (empty/invalid/negative → 0). */
function toCapacityInt(value: string): number {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Couchages split — le total est l'ancre. Saisir le total pré-remplit adultes = total,
 * enfants = 0. `applyAdults`/`applyChildren` maintiennent `adultes + enfants === total`
 * après chaque édition (clamp à [0, total]). Les trois sont des STRINGS (inputs contrôlés).
 */
export function applyCouchagesTotal(total: string): {
  capacityTotal: string; capacityAdults: string; capacityChildren: string;
} {
  return { capacityTotal: total, capacityAdults: String(toCapacityInt(total)), capacityChildren: '0' };
}

export function applyAdults(adults: string, total: string): { capacityAdults: string; capacityChildren: string } {
  const t = toCapacityInt(total);
  const a = Math.min(Math.max(toCapacityInt(adults), 0), t);
  return { capacityAdults: String(a), capacityChildren: String(t - a) };
}

export function applyChildren(children: string, total: string): { capacityAdults: string; capacityChildren: string } {
  const t = toCapacityInt(total);
  const c = Math.min(Math.max(toCapacityInt(children), 0), t);
  return { capacityAdults: String(t - c), capacityChildren: String(c) };
}

/* §72 — structured bed list (quantité × type de lit) row helpers. Pure; the editor drives the
 * draft list and `buildBedRows` projects it to object_room_type_bed rows at save time. */
type BedRefOption = { id: string; code: string; label: string };

/** Append a blank row (quantity 1, no bed type yet) — the row's select then sets the type. */
export function addBedRow(beds: ObjectWorkspaceRoomBed[]): ObjectWorkspaceRoomBed[] {
  return [...beds, { bedTypeId: '', bedTypeCode: '', bedTypeLabel: '', quantity: '1' }];
}

/** Set the bed type of one row (from the row's reference select). */
export function setBedType(beds: ObjectWorkspaceRoomBed[], index: number, option: BedRefOption): ObjectWorkspaceRoomBed[] {
  return beds.map((bed, i) => (
    i === index ? { ...bed, bedTypeId: option.id, bedTypeCode: option.code, bedTypeLabel: option.label } : bed
  ));
}

export function removeBedRow(beds: ObjectWorkspaceRoomBed[], index: number): ObjectWorkspaceRoomBed[] {
  return beds.filter((_, i) => i !== index);
}

export function updateBedQuantity(beds: ObjectWorkspaceRoomBed[], index: number, quantity: string): ObjectWorkspaceRoomBed[] {
  const n = Number.parseInt(quantity, 10);
  const q = Number.isFinite(n) && n > 0 ? n : 1;
  return beds.map((b, i) => (i === index ? { ...b, quantity: String(q) } : b));
}

/** DB rows for object_room_type_bed: resolve code→id, skip unknown, dedupe by bed_type_id, 1-based position. */
export function buildBedRows(
  beds: ObjectWorkspaceRoomBed[],
  idByCode: Map<string, string>,
): { bed_type_id: string; quantity: number; position: number }[] {
  const seen = new Set<string>();
  const rows: { bed_type_id: string; quantity: number; position: number }[] = [];
  for (const b of beds) {
    const id = idByCode.get(b.bedTypeCode.toLowerCase());
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    const n = Number.parseInt(b.quantity, 10);
    rows.push({ bed_type_id: id, quantity: Number.isFinite(n) && n > 0 ? n : 1, position: rows.length + 1 });
  }
  return rows;
}
