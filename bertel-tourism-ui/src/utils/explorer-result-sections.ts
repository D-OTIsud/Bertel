import type { ObjectCard } from '../types/domain';

export interface LabelRankCounts {
  labelled: number;
  equivalent: number;
}

export interface ResultSectionGroup {
  group: 'labelled' | 'equivalent';
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
