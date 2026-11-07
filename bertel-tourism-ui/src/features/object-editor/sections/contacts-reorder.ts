import type { ObjectWorkspaceContactItem } from '../../../services/object-workspace-parser';

/**
 * Rewrite `position` from the new array order after a drag — the saver persists
 * `position` verbatim (`toNullableInteger(item.position) ?? index`), so the index
 * must be materialized for the new order to survive a reload.
 */
export function reindexContactPositions(items: ObjectWorkspaceContactItem[]): ObjectWorkspaceContactItem[] {
  return items.map((item, index) => (
    item.position === String(index) ? item : { ...item, position: String(index) }
  ));
}
