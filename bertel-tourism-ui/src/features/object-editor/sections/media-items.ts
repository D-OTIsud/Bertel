import type {
  ObjectWorkspaceMediaItem,
  ObjectWorkspaceMediaModule,
} from '../../../services/object-workspace-parser';

/**
 * Types a user can CREATE from §05 Médias (priority order — new items default to
 * the first available). Documents (brochure_pdf, plan, press_kit…) are uploaded
 * from their owning sections (menu → menus, certificats → labels…) and only
 * remain visible/metadata-editable here.
 */
export const AUTHORABLE_MEDIA_TYPE_CODES: readonly string[] = ['photo', 'video'];

function draftId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Rewrite `position` from the array order — the saver persists it verbatim. */
function reindexPositions(items: ObjectWorkspaceMediaItem[]): ObjectWorkspaceMediaItem[] {
  return items.map((item, index) => (
    item.position === String(index) ? item : { ...item, position: String(index) }
  ));
}

export function createObjectMediaItem(media: ObjectWorkspaceMediaModule): ObjectWorkspaceMediaItem {
  // Default by AUTHORABLE priority (photo first), not by catalog position.
  const firstType =
    AUTHORABLE_MEDIA_TYPE_CODES
      .map((code) => media.typeOptions.find((option) => option.code === code))
      .find(Boolean) ?? media.typeOptions[0];
  return {
    id: draftId('draft-media'),
    scope: 'object',
    placeId: null,
    scopeLabel: 'Objet',
    typeId: firstType?.id ?? '',
    typeCode: firstType?.code ?? 'photo',
    typeLabel: firstType?.label ?? 'Photo',
    title: '',
    titleTranslations: {},
    description: '',
    descriptionTranslations: {},
    url: '',
    credit: '',
    visibility: 'public',
    position: String(media.objectItems.length),
    width: '',
    height: '',
    rightsExpiresAt: '',
    kind: '',
    isMain: media.objectItems.length === 0,
    isPublished: true,
    tags: [],
  };
}

export function addObjectMediaItem(media: ObjectWorkspaceMediaModule): ObjectWorkspaceMediaModule {
  return { ...media, objectItems: [...media.objectItems, createObjectMediaItem(media)] };
}

export function patchObjectMediaItem(
  media: ObjectWorkspaceMediaModule,
  id: string,
  patch: Partial<ObjectWorkspaceMediaItem>,
): ObjectWorkspaceMediaModule {
  const selectedType = patch.typeCode
    ? media.typeOptions.find((option) => option.code === patch.typeCode)
    : null;
  const nextItems = media.objectItems.map((item) => {
    if (item.id !== id) {
      return patch.isMain ? { ...item, isMain: false } : item;
    }
    return {
      ...item,
      ...patch,
      typeId: selectedType?.id ?? patch.typeId ?? item.typeId,
      typeLabel: selectedType?.label ?? patch.typeLabel ?? item.typeLabel,
    };
  });
  return { ...media, objectItems: nextItems };
}

export function removeObjectMediaItem(media: ObjectWorkspaceMediaModule, id: string): ObjectWorkspaceMediaModule {
  const nextItems = media.objectItems.filter((item) => item.id !== id);
  if (nextItems.length > 0 && !nextItems.some((item) => item.isMain)) {
    nextItems[0] = { ...nextItems[0], isMain: true };
  }
  return { ...media, objectItems: reindexPositions(nextItems) };
}

/** Apply a drag reorder: the new array order becomes the persisted `position`. */
export function reorderObjectMediaItems(
  media: ObjectWorkspaceMediaModule,
  nextItems: ObjectWorkspaceMediaItem[],
): ObjectWorkspaceMediaModule {
  return { ...media, objectItems: reindexPositions(nextItems) };
}
