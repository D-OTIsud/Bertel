/**
 * Room-list helpers for §05 BlockHEB.
 *
 * `object_room_type` has UNIQUE(object_id, code) and the saver is a full
 * delete-reinsert — a code collision aborts the save MID-REWRITE. The old
 * `unit-${items.length + 1}` scheme collided after a delete+add; the next
 * code must skip every existing unit-N suffix.
 */

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

type RoomCapacitySlice = { capacityTotal: string; quantity: string };

/** Object-level accommodation capacity = Σ couchages × unités (empty quantity counts as 1 unit). */
export function computeRoomsCapacitySum(items: RoomCapacitySlice[]): number {
  return items.reduce((sum, item) => {
    const couchages = Number.parseInt(item.capacityTotal, 10) || 0;
    const unites = Number.parseInt(item.quantity, 10) || 1;
    return sum + couchages * unites;
  }, 0);
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
