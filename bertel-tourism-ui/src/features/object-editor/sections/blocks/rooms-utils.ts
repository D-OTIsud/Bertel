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
 * Derived-unless-overridden sync of the §07 `capacity_total` metric with the rooms
 * cumul: the metric follows the rooms while it is empty or still equal to the
 * PREVIOUS cumul; a manually diverged value is never clobbered (no write-magic).
 * Returns the next capacityPolicies module, or null when nothing should change.
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

  const existing = capacity.capacityItems.find((item) => item.metricCode === 'capacity_total');
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

  const metric = capacity.metricOptions.find((option) => option.code === 'capacity_total');
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
        unit: 'pers.',
        value: String(nextSum),
        effectiveFrom: '',
        effectiveTo: '',
      },
    ],
  };
}
