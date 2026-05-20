import type {
  ObjectWorkspaceMediaItem,
  ObjectWorkspaceMediaModule,
} from '../../../services/object-workspace-parser';

function draftId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function createObjectMediaItem(media: ObjectWorkspaceMediaModule): ObjectWorkspaceMediaItem {
  const firstType = media.typeOptions[0];
  return {
    id: draftId('draft-media'),
    scope: 'object',
    placeId: null,
    scopeLabel: 'Objet',
    typeId: firstType?.id ?? '',
    typeCode: firstType?.code ?? 'image',
    typeLabel: firstType?.label ?? 'Image',
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
  return { ...media, objectItems: nextItems };
}
