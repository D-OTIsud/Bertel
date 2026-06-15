import type { ObjectCard } from '../../../types/domain';
import type { ObjectEditorState } from '../useObjectEditorState';
import { normalizeExplorerCard } from '../../../utils/explorer-card';

/**
 * Build a faithful preview ObjectCard from the editor draft and run it through the REAL
 * `normalizeExplorerCard`, so the §09 preview shows EXACTLY what the live Explorer card renders —
 * including a granted classement winning the single neutral slot ahead of the §09 tags.
 *
 * Maps: §01 name/type, §02 city, §08 distinctions → classification badges, §09 tags → colored tags.
 * Pure + unit-tested (no store / network access).
 */
export function buildPreviewCardFromDraft(editor: ObjectEditorState, typeCode?: string): ObjectCard {
  const draft = editor.draft;
  const name = draft.generalInfo?.name?.trim() || 'Aperçu de la fiche';
  const city = draft.location?.main?.city?.trim() || null;

  const tags = (draft.tags?.displayed ?? []).map((tag) => ({
    slug: tag.slug,
    name: tag.label,
    color: tag.color,
  }));

  // §08 distinctions → classification badges (only granted/requested, matching the live card filter),
  // so a real classement occupies the neutral slot in the preview just like in production.
  const badges = (draft.distinctions?.distinctionGroups ?? []).flatMap((group) =>
    (group.items ?? [])
      .filter((item) => item.status === 'granted' || item.status === 'requested')
      .map((item) => ({
        kind: 'classification',
        code: `${item.schemeCode}:${item.valueCode}`,
        label: [group.schemeLabel || item.schemeLabel, item.valueLabel].filter(Boolean).join(' · '),
      })),
  );

  return normalizeExplorerCard({
    id: 'preview',
    type: typeCode || 'HOT',
    name,
    open_now: true,
    location: city ? { city } : undefined,
    tags,
    badges,
  });
}
