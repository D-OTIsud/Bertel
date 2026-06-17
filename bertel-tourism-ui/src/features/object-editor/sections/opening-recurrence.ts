export const OPENING_CYCLIC_SENTINEL_YEAR = 2000;

export type RecurrenceMode = 'always' | 'cyclic' | 'fixed';

export interface RecurrencePeriod {
  recurrence: RecurrenceMode;
  isClosure: boolean;
  startDate: string; // ISO YYYY-MM-DD ('' si aucune)
  endDate: string;
  label: string;
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** Encode un mois (1-12) + jour (1-31) en date ISO de l'année-sentinelle. */
export function encodeCyclicDate(month: number, day: number): string {
  return `${OPENING_CYCLIC_SENTINEL_YEAR}-${pad(month)}-${pad(day)}`;
}

/** Si la fin "wrap" (MM-JJ fin < MM-JJ début), place la fin sur l'année+1. */
export function encodeCyclicRange(
  startMonth: number, startDay: number, endMonth: number, endDay: number,
): { startDate: string; endDate: string } {
  const startDate = encodeCyclicDate(startMonth, startDay);
  const wraps = `${pad(endMonth)}${pad(endDay)}` < `${pad(startMonth)}${pad(startDay)}`;
  const endDate = wraps
    ? `${OPENING_CYCLIC_SENTINEL_YEAR + 1}-${pad(endMonth)}-${pad(endDay)}`
    : `${OPENING_CYCLIC_SENTINEL_YEAR}-${pad(endMonth)}-${pad(endDay)}`;
  return { startDate, endDate };
}

export function decodeCyclicMonthDay(iso: string): { month: number; day: number } {
  const [, m, d] = iso.split('-');
  return { month: Number(m), day: Number(d) };
}

export function periodRank(p: RecurrencePeriod): number {
  if (p.isClosure) return 4;
  if (p.recurrence === 'fixed' && (p.startDate || p.endDate)) return 3;
  if (p.recurrence === 'cyclic' && (p.startDate || p.endDate)) return 2;
  return 1;
}

/** Jour-de-l'an approximatif (mois*31+jour). */
function dayIndex(iso: string): number {
  const { month, day } = decodeCyclicMonthDay(iso);
  return (month - 1) * 31 + day;
}

export function periodWindowWidth(p: RecurrencePeriod): number {
  if (!p.startDate || !p.endDate) return 100000;
  if (p.recurrence === 'cyclic') {
    const lo = dayIndex(p.startDate);
    let hi = dayIndex(p.endDate);
    if (p.endDate.slice(5) < p.startDate.slice(5)) hi += 372; // wrap (compare MM-DD)
    return hi - lo;
  }
  return Math.round((Date.parse(p.endDate) - Date.parse(p.startDate)) / 86400000);
}

interface Interval { lo: number; hi: number; }

function intervalsOf(p: RecurrencePeriod): Interval[] {
  if (!p.startDate || !p.endDate) return [];
  if (p.recurrence === 'cyclic') {
    const lo = dayIndex(p.startDate);
    const hi = dayIndex(p.endDate) + (p.endDate.slice(5) < p.startDate.slice(5) ? 372 : 0);
    if (hi <= 372) return [{ lo, hi }];
    return [{ lo, hi: 372 }, { lo: 1, hi: hi - 372 }];
  }
  return [{ lo: Date.parse(p.startDate) / 86400000, hi: Date.parse(p.endDate) / 86400000 }];
}

/** Ensemble des jours couverts (axe entier ; cyclique 1..372 wrap déplié, fixe = jours epoch). */
function coveredDays(p: RecurrencePeriod): Set<number> {
  const days = new Set<number>();
  for (const { lo, hi } of intervalsOf(p)) {
    for (let d = Math.ceil(lo); d <= Math.floor(hi); d += 1) days.add(d);
  }
  return days;
}

/**
 * Vrai si deux périodes de même rang se croisent PARTIELLEMENT.
 * Imbrication/containment tolérée : si l'une est entièrement incluse dans l'autre, pas de conflit.
 */
export function periodsPartialOverlap(a: RecurrencePeriod, b: RecurrencePeriod): boolean {
  if (a.isClosure || b.isClosure) return false;
  if (periodRank(a) !== periodRank(b)) return false;
  const A = coveredDays(a);
  const B = coveredDays(b);
  if (A.size === 0 || B.size === 0) return false;
  let inter = 0;
  for (const d of B) if (A.has(d)) inter += 1;
  if (inter === 0) return false; // disjointes
  if (inter === A.size || inter === B.size) return false; // l'une contenue dans l'autre → tolérée
  return true; // croisement partiel
}

export interface PeriodConflict { label: string; }

/** Conflits de même couche entre une période candidate et l'existant (hors elle-même). */
export function findPeriodConflicts(
  candidate: RecurrencePeriod, existing: readonly RecurrencePeriod[],
): PeriodConflict[] {
  return existing
    .filter((other) => other !== candidate && periodsPartialOverlap(candidate, other))
    .map((other) => ({ label: other.label || 'période sans nom' }));
}
