import type { ObjectWorkspaceMediaItem, ObjectWorkspaceMediaModule } from './object-workspace-parser';
import { isUuid, toNullableInteger } from './object-workspace-payloads/input';

type Row = Record<string, unknown>;
export interface GalleryWriteBaseline {
  models: ObjectWorkspaceMediaItem[];
  rows: Row[];
  createdIds: Record<string, string>;
  readId: string;
}
const nullable = (value: string) => value.trim() || null;
const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

function values(item: ObjectWorkspaceMediaItem, input: ObjectWorkspaceMediaModule, creating = false, index = 0): Row {
  const type = input.typeOptions.find(option => option.code.toLowerCase() === item.typeCode.toLowerCase() || option.id === item.typeId);
  const typeId = type?.id ?? item.typeId;
  if (!isUuid(typeId)) throw new Error('Le type de média a changé. Rechargez la galerie.');
  return {
    media_type_id: typeId,
    title: nullable(item.title),
    title_i18n: Object.keys(item.titleTranslations).length ? item.titleTranslations : null,
    description: nullable(item.description),
    description_i18n: Object.keys(item.descriptionTranslations).length ? item.descriptionTranslations : null,
    credit: nullable(item.credit), url: item.url.trim(), is_main: item.isMain, is_published: item.isPublished,
    position: toNullableInteger(item.position) ?? index, rights_expires_at: nullable(item.rightsExpiresAt),
    visibility: nullable(item.visibility) ?? (creating ? 'public' : null),
    width: toNullableInteger(item.width), height: toNullableInteger(item.height), kind: nullable(item.kind),
  };
}

export function galleryBaseline(input: ObjectWorkspaceMediaModule, rows: Row[]): GalleryWriteBaseline {
  return { models: JSON.parse(JSON.stringify(input.objectItems)) as ObjectWorkspaceMediaItem[],
    rows: JSON.parse(JSON.stringify(rows)) as Row[], createdIds: {}, readId: crypto.randomUUID() };
}

/** Only fields changed in this editor are sent; off-screen and concurrent rows are never deleted. */
export function buildGalleryWritePayload(input: ObjectWorkspaceMediaModule) {
  const baseline = input.galleryWriteBaseline;
  if (!baseline) throw new Error('Rechargez la galerie avant d’enregistrer. Votre saisie est conservée.');
  const rows: Row[] = [];
  const currentIds = new Set<string>();
  const seen = new Set<string>();
  for (const [index, item] of input.objectItems.entries()) {
    if (item.scope !== 'object' || item.placeId !== null || item.portalUploadId) {
      throw new Error('Ce média ne fait pas partie de la galerie de l’office.');
    }
    const before = baseline.models.find(model => model.id === item.id);
    const id = isUuid(item.id) ? item.id : (baseline.createdIds[item.id] ??= crypto.randomUUID());
    if (seen.has(id)) throw new Error('Un média figure deux fois dans la galerie.');
    seen.add(id); currentIds.add(item.id);
    const desired = values(item, input, !before, index);
    const previous = before ? values(before, input, false, baseline.models.indexOf(before)) : undefined;
    const changes = Object.fromEntries(Object.entries(desired).filter(([key, value]) => !previous || !same(value, previous[key])));
    if (!before || Object.keys(changes).length) {
      const expected = baseline.rows.find(row => row.id === id) ?? null;
      if (before && !expected) throw new Error('Un média n’a pas été chargé complètement. Rechargez la galerie.');
      rows.push({ id, expected, changes });
    }
  }
  const deleted = baseline.models.filter(item => !currentIds.has(item.id)).map(item => {
    const expected = baseline.rows.find(row => row.id === item.id);
    if (!expected || !('updated_at' in expected)) throw new Error('Le média à retirer doit être rechargé.');
    return { id: item.id, expected };
  });
  return { write_contract: 'gallery-patch-v1', rows, deleted };
}

export function parseGalleryWriteSnapshot(value: unknown): Row[] {
  if (!Array.isArray(value) || value.some(row => !row || typeof row !== 'object' || typeof row.id !== 'string' || !isUuid(row.id))) {
    throw new Error('La galerie enregistrée n’a pas pu être confirmée. Rechargez avant de réessayer.');
  }
  return value as Row[];
}

/** Refresh only the confirmed root gallery; keep place media and untouched row metadata. */
export function withGalleryWriteSnapshot(input: ObjectWorkspaceMediaModule, rows: Row[]): ObjectWorkspaceMediaModule {
  const text = (value: unknown) => value == null ? '' : String(value);
  const map = (value: unknown) => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, string> : {};
  const objectItems = rows.map((row): ObjectWorkspaceMediaItem => {
    const type = input.typeOptions.find(option => option.id === row.media_type_id);
    const previous = input.objectItems.find(item => item.id === row.id)
      ?? input.galleryWriteBaseline?.models.find(item => item.id === row.id);
    return {
      id: text(row.id), scope: 'object', placeId: null, scopeLabel: 'Objet principal',
      typeId: text(row.media_type_id), typeCode: type?.code ?? '', typeLabel: type?.label ?? '',
      title: text(row.title), titleTranslations: map(row.title_i18n),
      description: text(row.description), descriptionTranslations: map(row.description_i18n),
      url: text(row.url), credit: text(row.credit), visibility: text(row.visibility),
      position: text(row.position), width: text(row.width), height: text(row.height),
      rightsExpiresAt: text(row.rights_expires_at), kind: text(row.kind),
      isMain: row.is_main === true, isPublished: row.is_published !== false, tags: previous?.tags ?? [],
    };
  });
  const next = { ...input, objectItems };
  return { ...next, galleryWriteBaseline: galleryBaseline(next, rows) };
}
