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
