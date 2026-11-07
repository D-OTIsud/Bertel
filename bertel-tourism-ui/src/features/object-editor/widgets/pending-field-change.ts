import type { ObjectWorkspaceModerationItem } from '../../../services/object-workspace-parser';
import type { ObjectEditorState } from '../useObjectEditorState';

/** Maps editor field keys to pending_change payload field names. */
export const PENDING_FIELD_ALIASES: Record<string, string[]> = {
  lieuDit: ['lieu_dit', 'lieuDit', 'location.lieu_dit', 'lieu-dit'],
};

function normalizeFieldToken(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, '');
}

export function findPendingFieldChange(
  items: ObjectWorkspaceModerationItem[],
  fieldKey: string,
): ObjectWorkspaceModerationItem | undefined {
  const aliases = PENDING_FIELD_ALIASES[fieldKey] ?? [fieldKey];
  const tokens = new Set(aliases.map(normalizeFieldToken));

  return items.find(
    (item) => item.status === 'pending' && item.field && tokens.has(normalizeFieldToken(item.field)),
  );
}

/** Removes a pending item from the editor queue after the proposed value is accepted. */
export function dismissPendingFieldChange(
  editor: ObjectEditorState,
  pending: ObjectWorkspaceModerationItem,
): void {
  const publication = editor.draft.publication;
  const nextItems = publication.moderation.items.filter((item) => item.id !== pending.id);
  const pendingCount = nextItems.filter((item) => item.status === 'pending').length;

  editor.replaceModule('publication', {
    ...publication,
    moderation: {
      ...publication.moderation,
      pendingCount,
      items: nextItems,
    },
  });
}
