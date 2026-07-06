import type { ObjectCard, ExplorerReferenceOption } from '../types/domain';

export interface LabelRankCounts {
  labelled: number;
  equivalent: number;
}

export interface ResultSectionGroup {
  group: string;
  label: string;
  count: number;
  cards: ObjectCard[];
}

export type ResultSections =
  | { grouped: false; cards: ObjectCard[] }
  | { grouped: true; groups: ResultSectionGroup[] };

const LABELLED_LABEL = 'Établissements labellisés';

/** For a single-scheme filter all rank-1 cards share the same evidence source. */
function equivalentLabel(equivalent: ObjectCard[]): string {
  const source = equivalent.find((c) => c.label_match?.rank === 1)?.label_match?.source;
  return source === 'accessibility_amenity'
    ? 'Aussi pertinents — équipements compatibles'
    : 'Aussi pertinents — actions compatibles';
}

/**
 * Partition Explorer result cards into the "labellisés" (rank-0) and "démarches
 * équivalentes" (rank-1) groups. Sections are emitted ONLY when the ranked-label filter
 * is active (cards carry `label_match`) AND both groups are non-empty. Header counts use
 * corpus-wide `counts` (meta.label_rank_counts) when provided, else the loaded lengths.
 */
export function buildResultSections(cards: ObjectCard[], counts?: LabelRankCounts | null): ResultSections {
  const labelled = cards.filter((c) => c.label_match?.rank === 0);
  const equivalent = cards.filter((c) => c.label_match?.rank === 1);
  if (labelled.length === 0 || equivalent.length === 0) {
    return { grouped: false, cards };
  }
  return {
    grouped: true,
    groups: [
      { group: 'labelled', label: LABELLED_LABEL, count: counts?.labelled ?? labelled.length, cards: labelled },
      { group: 'equivalent', label: equivalentLabel(equivalent), count: counts?.equivalent ?? equivalent.length, cards: equivalent },
    ],
  };
}

const NON_CLASSE = 'Non classé';

/**
 * §174 — groupe les cartes par NIVEAU de classement pour le scheme gradué actif.
 * Le niveau d'une carte = son badge dont le code est `<schemeCode>:<valueCode>`
 * (émis par get_object_cards_batch). Sections triées par grade DÉCROISSANT (5★ d'abord),
 * ordre/libellés depuis `values` (référence). Cartes sans badge du scheme → « Non classé » en fin.
 * Flat si AUCUNE carte ne porte le scheme (défensif — ne devrait pas arriver sous ce filtre).
 */
export function buildGradeSections(cards: ObjectCard[], schemeCode: string, values: ExplorerReferenceOption[]): ResultSections {
  const prefix = `${schemeCode}:`;
  const cardValue = (c: ObjectCard): string | null => {
    const badge = (c.badges ?? []).find((b) => typeof b?.code === 'string' && b.code.startsWith(prefix));
    return badge?.code ? badge.code.slice(prefix.length) : null;
  };
  const byValue = new Map<string, ObjectCard[]>();
  const unranked: ObjectCard[] = [];
  for (const card of cards) {
    const vc = cardValue(card);
    if (vc == null) { unranked.push(card); continue; }
    const arr = byValue.get(vc) ?? [];
    arr.push(card);
    byValue.set(vc, arr);
  }
  if (byValue.size === 0) return { grouped: false, cards };
  const groups: ResultSectionGroup[] = [];
  for (const value of [...values].reverse()) {           // highest grade first
    const group = byValue.get(value.code);
    if (group && group.length > 0) {
      groups.push({ group: `grade:${value.code}`, label: value.name, count: group.length, cards: group });
    }
  }
  if (unranked.length > 0) {
    groups.push({ group: 'grade:__none__', label: NON_CLASSE, count: unranked.length, cards: unranked });
  }
  return { grouped: true, groups };
}
