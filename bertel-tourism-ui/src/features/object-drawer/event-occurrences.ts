/**
 * Projection d'AFFICHAGE des dates d'un événement (FMA) pour le drawer public.
 * Pure. Combine les dates canoniques (première ligne `object_fma` : start/end
 * date+time, récurrence) et les occurrences (`fma_occurrences`) en une vue
 * now-relative {next, upcoming, past, cancelled, canonical} — PLAN 3.1.
 *
 * Le formatage LOCALE reste dans la vue : ce module ne renvoie que des valeurs
 * ISO-like BRUTES. Une date-only (`YYYY-MM-DD`) n'est JAMAIS convertie en UTC —
 * la comparaison au « maintenant » se fait sur des composantes locales. Aucune
 * donnée fabriquée : une plage sans date valide est ignorée.
 */
export interface EventDateRange {
  key: string;
  /** Valeur ISO-like brute (`YYYY-MM-DD` ou `YYYY-MM-DDTHH:MM[:SS]`), '' si absente. */
  start: string;
  end: string;
  /** État normalisé (minuscule), '' si absent. */
  state: string;
  note: string;
  cancelled: boolean;
  source: 'occurrence' | 'canonical';
}

export interface EventDisplayData {
  next: EventDateRange | null;
  upcoming: EventDateRange[];
  past: EventDateRange[];
  cancelled: EventDateRange[];
  canonical: EventDateRange | null;
  recurring: boolean;
  recurrencePattern: string;
}

function str(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

function bool(value: unknown): boolean {
  return value === true || value === 'true' || value === 't';
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/;

/**
 * Epoch LOCAL d'une valeur ISO-like — sans décalage UTC pour une date-only.
 * `endOfDay` borne une date-only à 23:59:59.999 (« la journée entière est-elle
 * encore à venir »). Renvoie NaN si non parsable.
 */
function toEpoch(value: string, endOfDay: boolean): number {
  if (!value) return NaN;
  if (DATE_ONLY.test(value)) {
    const [y, m, d] = value.split('-').map(Number);
    return endOfDay
      ? new Date(y, m - 1, d, 23, 59, 59, 999).getTime()
      : new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
  }
  const match = DATE_TIME.exec(value);
  if (match) {
    const [, y, m, d, hh, mm, ss] = match;
    return new Date(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss ?? '0')).getTime();
  }
  const fallback = new Date(value).getTime();
  return Number.isNaN(fallback) ? NaN : fallback;
}

/** Epoch de tri : début (repli fin), début de journée si date-only. */
function startEpoch(range: EventDateRange): number {
  const s = toEpoch(range.start, false);
  return Number.isNaN(s) ? toEpoch(range.end, false) : s;
}

/** Borne « encore à venir » : fin (repli début), fin de journée si date-only. */
function endBoundaryEpoch(range: EventDateRange): number {
  const e = toEpoch(range.end, true);
  return Number.isNaN(e) ? toEpoch(range.start, true) : e;
}

function hasValidDate(range: EventDateRange): boolean {
  return !Number.isNaN(toEpoch(range.start, false)) || !Number.isNaN(toEpoch(range.end, true));
}

function buildCanonical(fmaRows: Array<Record<string, unknown>>): {
  canonical: EventDateRange | null;
  recurring: boolean;
  recurrencePattern: string;
} {
  const first = fmaRows.find((row) => typeof row === 'object' && row !== null);
  if (!first) return { canonical: null, recurring: false, recurrencePattern: '' };
  const startDate = str(first.event_start_date);
  const endDate = str(first.event_end_date);
  const startTime = str(first.event_start_time);
  const endTime = str(first.event_end_time);
  // Concatène date + heure SANS 'Z' — date-only conservée telle quelle (pas d'UTC).
  const start = startDate ? (startTime ? `${startDate}T${startTime}` : startDate) : '';
  const end = endDate ? (endTime ? `${endDate}T${endTime}` : endDate) : '';
  const canonical: EventDateRange | null = start || end
    ? { key: 'canonical', start, end, state: '', note: '', cancelled: false, source: 'canonical' }
    : null;
  return { canonical, recurring: bool(first.is_recurring), recurrencePattern: str(first.recurrence_pattern) };
}

/**
 * Vue now-relative des dates d'un événement. `now` injectable pour les tests.
 * - `upcoming` : occurrences non annulées dont la borne de fin ≥ now, triées ASC.
 * - `past`     : occurrences non annulées dont la borne de fin < now, triées DESC.
 * - `cancelled`: occurrences annulées, conservées à part.
 * - `next`     : première `upcoming`, sinon la date canonique si elle n'est pas passée.
 */
export function buildEventDisplayData(
  fmaRows: Array<Record<string, unknown>>,
  occurrences: Array<Record<string, unknown>>,
  now: Date = new Date(),
): EventDisplayData {
  const nowMs = now.getTime();
  const { canonical, recurring, recurrencePattern } = buildCanonical(Array.isArray(fmaRows) ? fmaRows : []);

  const ranges: EventDateRange[] = [];
  (Array.isArray(occurrences) ? occurrences : []).forEach((occ, index) => {
    if (typeof occ !== 'object' || occ === null) return;
    const state = str(occ.state).toLowerCase();
    const range: EventDateRange = {
      key: str(occ.id) || `occ-${index}`,
      start: str(occ.start_at) || str(occ.start),
      end: str(occ.end_at) || str(occ.end),
      state,
      note: str(occ.note),
      cancelled: state.includes('annul') || state.includes('cancel'),
      source: 'occurrence',
    };
    if (!hasValidDate(range)) return; // pas de plage sans date valide
    ranges.push(range);
  });

  const cancelled = ranges.filter((r) => r.cancelled);
  const active = ranges.filter((r) => !r.cancelled);

  const upcoming = active
    .filter((r) => { const b = endBoundaryEpoch(r); return !Number.isNaN(b) && b >= nowMs; })
    .sort((a, b) => startEpoch(a) - startEpoch(b));
  const past = active
    .filter((r) => { const b = endBoundaryEpoch(r); return Number.isNaN(b) || b < nowMs; })
    .sort((a, b) => startEpoch(b) - startEpoch(a));

  let next: EventDateRange | null = upcoming[0] ?? null;
  if (!next && canonical) {
    const b = endBoundaryEpoch(canonical);
    if (!Number.isNaN(b) && b >= nowMs) next = canonical;
  }

  return { next, upcoming, past, cancelled, canonical, recurring, recurrencePattern };
}
