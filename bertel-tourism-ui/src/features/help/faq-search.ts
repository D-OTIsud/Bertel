/**
 * Recherche du centre d'aide — pure, côté client (spec 2026-07-03-faq-aide-design.md).
 * Exigences PO : simple et efficace — insensible aux accents, correspondance par PRÉFIXE
 * (« artis » → artisan/artisanat), et le vocabulaire métier (keywords) pèse plus lourd
 * que la question, elle-même plus lourde que le corps de la réponse. Multi-tokens = ET.
 * ponytail: scan linéaire à chaque frappe (~83 entrées) ; si le corpus dépasse ~500
 * entrées, précalculer les mots par entrée dans un Map module-level.
 */
import { FAQ_RUBRIQUES, type FaqEntry } from './content/types';

const SCORE_KEYWORD = 8;
const SCORE_QUESTION = 4;
const SCORE_ANSWER = 1;

/** Minuscules + diacritiques strippés (NFD) — appliqué aux deux côtés de la recherche. */
export function normalizeFaqText(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function toWords(value: string): string[] {
  return normalizeFaqText(value).split(/[^a-z0-9]+/).filter(Boolean);
}

/** Un token matche un champ s'il est préfixe d'un de ses mots. */
function fieldScore(fieldWords: readonly string[], token: string, weight: number): number {
  return fieldWords.some((word) => word.startsWith(token)) ? weight : 0;
}

const RUBRIQUE_ORDER = new Map(FAQ_RUBRIQUES.map((r, index) => [r.id, index]));

export function searchFaq(entries: readonly FaqEntry[], query: string): FaqEntry[] {
  const tokens = toWords(query);
  if (tokens.length === 0) return [];

  const scored: Array<{ entry: FaqEntry; score: number }> = [];
  for (const entry of entries) {
    const keywordWords = entry.keywords.flatMap(toWords)
      .concat((entry.types ?? []).map(normalizeFaqText));
    const questionWords = toWords(entry.question);
    const answerWords = toWords(entry.answer);

    let total = 0;
    let allTokensMatch = true;
    for (const token of tokens) {
      const score =
        fieldScore(keywordWords, token, SCORE_KEYWORD) +
        fieldScore(questionWords, token, SCORE_QUESTION) +
        fieldScore(answerWords, token, SCORE_ANSWER);
      if (score === 0) {
        allTokensMatch = false;
        break;
      }
      total += score;
    }
    if (allTokensMatch) scored.push({ entry, score: total });
  }

  return scored
    .sort(
      (a, b) =>
        b.score - a.score ||
        (RUBRIQUE_ORDER.get(a.entry.rubrique) ?? 0) - (RUBRIQUE_ORDER.get(b.entry.rubrique) ?? 0) ||
        a.entry.id.localeCompare(b.entry.id),
    )
    .map((item) => item.entry);
}
