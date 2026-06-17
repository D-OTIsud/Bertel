import type {
  ObjectWorkspaceContactItem,
  ObjectWorkspaceWebChannelItem,
  WorkspaceReferenceOption,
} from '../../../services/object-workspace-parser';

/**
 * Fresh blank contact channel for the add modal. `isFirst` seeds is_primary so the
 * very first channel of a brand-new object is its primary — mirrors the behaviour of
 * the old inline add. `position` is left blank and materialised at commit time.
 */
export function createContactDraft(
  kindOptions: WorkspaceReferenceOption[],
  isFirst: boolean,
): ObjectWorkspaceContactItem {
  const first = kindOptions[0];
  return {
    id: `draft-contact-${Date.now()}`,
    kindId: first?.id ?? '',
    kindCode: first?.code ?? 'phone',
    kindLabel: first?.label ?? 'Téléphone',
    roleId: '',
    roleCode: '',
    roleLabel: '',
    value: '',
    isPublic: true,
    isPrimary: isFirst,
    position: '',
  };
}

/** Fresh blank web channel (réseau social / distribution) for the add modal. The
 *  domain defaults to social_network; the saver re-resolves it from the kind code. */
export function createWebChannelDraft(
  webKindOptions: WorkspaceReferenceOption[],
): ObjectWorkspaceWebChannelItem {
  const first = webKindOptions[0];
  return {
    id: `draft-web-${Date.now()}`,
    kindId: first?.id ?? '',
    kindCode: first?.code ?? '',
    kindLabel: first?.label ?? 'Présence web',
    kindDomain: 'social_network',
    value: '',
    isPublic: true,
    position: '',
  };
}

/**
 * Enforce one primary per contact kind: if the row identified by `targetId` is
 * primary, clear is_primary on every OTHER row of the same kind (case-insensitive,
 * mirroring the saver's per-kind dedupe in saveObjectWorkspaceContacts). A
 * non-primary target leaves the rest untouched. Returns a new array (no mutation).
 */
export function reconcileContactPrimary(
  items: ObjectWorkspaceContactItem[],
  targetId: string,
): ObjectWorkspaceContactItem[] {
  const target = items.find((item) => item.id === targetId);
  if (!target || !target.isPrimary) return items;
  const kind = target.kindCode.toLowerCase();
  return items.map((item) =>
    item.id !== targetId && item.isPrimary && item.kindCode.toLowerCase() === kind
      ? { ...item, isPrimary: false }
      : item,
  );
}
