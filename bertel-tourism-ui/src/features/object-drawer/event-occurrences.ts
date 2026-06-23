/**
 * Projection d'AFFICHAGE des occurrences d'un événement (FMA) pour le drawer
 * public (impl. 4.1). Pure. Lit les champs réels du payload `fma_occurrences`
 * (mêmes noms que le parser éditeur : `start_at`/`end_at`/`state`/`id`, avec
 * repli `start`/`end`). Aucune donnée fabriquée : une occurrence sans date est
 * ignorée.
 */
export interface EventOccurrenceRow {
  key: string;
  label: string;
  cancelled: boolean;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function formatOne(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  const hasTime = /T\d\d:\d\d/.test(iso) && !/T00:00(:00)?/.test(iso);
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    ...(hasTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(date);
}

function sameDay(a: string, b: string): boolean {
  return a.slice(0, 10) === b.slice(0, 10);
}

export function buildEventOccurrenceRows(
  occurrences: Array<Record<string, unknown>>,
): EventOccurrenceRow[] {
  const rows: EventOccurrenceRow[] = [];
  occurrences.forEach((occ, index) => {
    const start = str(occ.start_at) || str(occ.start);
    const end = str(occ.end_at) || str(occ.end);
    if (!start && !end) {
      return;
    }
    const state = (str(occ.state)).toLowerCase();
    const cancelled = state.includes('annul') || state.includes('cancel');
    let label: string;
    if (start && end && !sameDay(start, end)) {
      label = `Du ${formatOne(start)} au ${formatOne(end)}`;
    } else {
      label = formatOne(start || end);
    }
    rows.push({ key: str(occ.id) || `occ-${index}`, label, cancelled });
  });
  return rows;
}
