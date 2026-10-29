import type { ListPatch, ListTemplate, ObjectListDetail, ObjectListItem } from '../../../services/lists';

/** Editable name/intro for the list's CURRENT composition language (A11Y-07 — name_en support). */
export function currentListName(detail: ObjectListDetail): string {
  return detail.lang === 'en' ? (detail.nameEn ?? '') : detail.name;
}
export function currentListIntro(detail: ObjectListDetail): string {
  return detail.lang === 'en' ? (detail.introEn ?? '') : (detail.introFr ?? '');
}

export function listItemDraftSignature(items: ObjectListItem[]): string {
  return JSON.stringify(items.map((i) => [i.objectId, i.noteFr, i.noteEn]));
}

export function listItemsDiffer(a: ObjectListItem[], b: ObjectListItem[]): boolean {
  return listItemDraftSignature(a) !== listItemDraftSignature(b);
}

/** Preserve the outgoing language's edits before switching; template is not part of this patch. */
export function buildLanguageSwitchPatch(
  outgoing: ObjectListDetail,
  l: 'fr' | 'en',
  snapshotName: string,
  snapshotIntro: string,
  snapshotRecipient: string,
): ListPatch {
  const patch: ListPatch = { lang: l };
  const outgoingName = currentListName(outgoing);
  const outgoingIntro = currentListIntro(outgoing);
  if (snapshotName !== outgoingName) patch[outgoing.lang === 'en' ? 'name_en' : 'name'] = snapshotName;
  if (snapshotIntro !== outgoingIntro) patch[outgoing.lang === 'en' ? 'intro_en' : 'intro_fr'] = snapshotIntro;
  if (snapshotRecipient !== (outgoing.recipientLabel ?? '')) patch.recipient_label = snapshotRecipient;
  return patch;
}

/** Baseline text is read by the caller before its rights check, not reread here. */
export function buildDraftMetaPatch(
  base: ObjectListDetail,
  baseName: string,
  baseIntro: string,
  snapshotName: string,
  snapshotRecipient: string,
  snapshotIntro: string,
  snapshotTemplate: ListTemplate,
): ListPatch {
  const metaPatch: ListPatch = {};
  if (snapshotName !== baseName) metaPatch[base.lang === 'en' ? 'name_en' : 'name'] = snapshotName;
  if (snapshotRecipient !== (base.recipientLabel ?? '')) metaPatch.recipient_label = snapshotRecipient;
  if (snapshotIntro !== baseIntro) metaPatch[base.lang === 'en' ? 'intro_en' : 'intro_fr'] = snapshotIntro;
  if (snapshotTemplate !== base.template) metaPatch.template = snapshotTemplate;
  return metaPatch;
}
