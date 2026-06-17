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

/** Dernier jour réel du mois dans l'année-sentinelle (2000 = bissextile ⇒ février = 29). */
const lastDayOfMonth = (month: number): number => new Date(OPENING_CYCLIC_SENTINEL_YEAR, month, 0).getDate();

/**
 * Si la fin "wrap" (MM-JJ fin < MM-JJ début), place la fin sur l'année+1.
 * Les jours sont bornés au dernier jour réel du mois (un sélecteur peut soumettre
 * un 31 février — la date ISO invalide qui en résulterait planterait à la sauvegarde).
 */
export function encodeCyclicRange(
  startMonth: number, startDay: number, endMonth: number, endDay: number,
): { startDate: string; endDate: string } {
  const sDay = Math.min(Math.max(Math.trunc(startDay) || 1, 1), lastDayOfMonth(startMonth));
  const eDay = Math.min(Math.max(Math.trunc(endDay) || 1, 1), lastDayOfMonth(endMonth));
  const startDate = encodeCyclicDate(startMonth, sDay);
  const wraps = `${pad(endMonth)}${pad(eDay)}` < `${pad(startMonth)}${pad(sDay)}`;
  const endDate = wraps
    ? `${OPENING_CYCLIC_SENTINEL_YEAR + 1}-${pad(endMonth)}-${pad(eDay)}`
    : `${OPENING_CYCLIC_SENTINEL_YEAR}-${pad(endMonth)}-${pad(eDay)}`;
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
  // strict containment tolérée (la plus étroite gagne) ; fenêtres identiques = conflit
  if ((inter === A.size && A.size < B.size) || (inter === B.size && B.size < A.size)) return false;
  return true; // croisement partiel OU fenêtres identiques
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
