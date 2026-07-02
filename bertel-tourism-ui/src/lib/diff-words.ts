/**
 * D6 — diff mot-à-mot pour la vue avant/après de la modération.
 * LCS sur les mots (espaces préservés comme tokens) → segments same/del/ins,
 * fusionnés par type pour un rendu <del>/<ins> lisible.
 * ponytail: O(n·m) — au-delà de MAX_CELLS (champs anormalement longs), repli
 * honnête « tout supprimé / tout inséré » plutôt qu'un gel du rendu.
 */

export interface DiffSegment {
  type: 'same' | 'del' | 'ins';
  text: string;
}

const MAX_CELLS = 40_000;

function tokenize(value: string): string[] {
  return value.split(/(\s+)/).filter((token) => token !== '');
}

export function diffWords(before: string, after: string): DiffSegment[] {
  if (before === after) {
    return before ? [{ type: 'same', text: before }] : [];
  }
  const a = tokenize(before);
  const b = tokenize(after);

  const segments: DiffSegment[] = [];
  const push = (type: DiffSegment['type'], text: string) => {
    const last = segments[segments.length - 1];
    if (last && last.type === type) {
      last.text += text;
    } else {
      segments.push({ type, text });
    }
  };

  if (a.length * b.length > MAX_CELLS) {
    if (before) push('del', before);
    if (after) push('ins', after);
    return segments;
  }

  // Table LCS (suffixes) puis relecture gloutonne.
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push('same', a[i]);
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      push('del', a[i]);
      i += 1;
    } else {
      push('ins', b[j]);
      j += 1;
    }
  }
  while (i < a.length) {
    push('del', a[i]);
    i += 1;
  }
  while (j < b.length) {
    push('ins', b[j]);
    j += 1;
  }
  return segments;
}
