import type { ObjectWorkspaceOpeningPeriod } from '../../../../services/object-workspace-parser';
import { decodeCyclicMonthDay } from '../opening-recurrence';

export type OpeningPeriodKind = 'high' | 'low' | 'shut' | 'standard';

const MONTHS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];

// Full French month names for recurrence-aware (cyclic) range labels — these print a
// month, never the sentinel year (2000) that cyclic periods are stored under.
const MONTHS_FULL = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

export interface OpeningRibbonSegment {
  kind: OpeningPeriodKind;
  periodIndex: number;
  start: number;
  end: number;
  abbr: string;
}

export function periodKind(period: ObjectWorkspaceOpeningPeriod): OpeningPeriodKind {
  const label = period.label.toLowerCase();
  const openDays = period.weekdays.filter((day) => day.slots.length > 0).length;
  if (openDays === 0 || label.includes('ferm') || label.includes('clos')) {
    return 'shut';
  }
  if (label.includes('haute') || label.includes('high')) {
    return 'high';
  }
  if (label.includes('basse') || label.includes('low') || label.includes('hors')) {
    return 'low';
  }
  return 'standard';
}

export interface OpeningSeasonChip {
  label: string;
  /** Hex fed to tagChipStyle for the soft-chip background + readable text. */
  hex: string;
}

// Hex equivalents of the --op-* CSS vars, so the season chip (tagChipStyle needs a hex)
// matches the stripe/ribbon. high = teal, low/hors/mi = amber, shut = neutral grey.
const SEASON_HEX = { high: '#176b6a', low: '#c08a3e', shut: '#a8a39a' } as const;

function seasonHexFromLabel(label: string): string {
  const l = label.toLowerCase();
  if (l.includes('haute') || l.includes('high')) return SEASON_HEX.high;
  if (l.includes('ferm') || l.includes('clos')) return SEASON_HEX.shut;
  return SEASON_HEX.low; // basse / hors / mi / moyenne / default
}

/**
 * Season "étiquette" classification for the period row — driven by the explicit period TYPE
 * first, then the label keywords, and DELIBERATELY independent of opening hours. periodKind()
 * returns 'shut' for ANY hour-less period, which would grey out a "Haute saison" period that
 * simply has no fixed hours (see the §14 open-without-hours case); the coloured season chip
 * must survive that. Returns null when not classifiable (caller renders no chip).
 */
export function classifyOpeningSeason(
  period: ObjectWorkspaceOpeningPeriod,
  typeByCode: ReadonlyMap<string, { label: string; color: string }>,
): OpeningSeasonChip | null {
  const typed = typeByCode.get(period.seasonTypeCode);
  if (typed && typed.label) {
    return { label: typed.label, hex: typed.color || seasonHexFromLabel(typed.label) };
  }
  const l = period.label.toLowerCase();
  if (l.includes('haute') || l.includes('high')) return { label: period.label, hex: SEASON_HEX.high };
  if (l.includes('basse') || l.includes('low') || l.includes('hors') || l.includes('mi-') || l.includes('moyenne')) {
    return { label: period.label, hex: SEASON_HEX.low };
  }
  if (l.includes('ferm') || l.includes('clos')) return { label: period.label, hex: SEASON_HEX.shut };
  return null;
}

export function formatPeriodRange(period: ObjectWorkspaceOpeningPeriod): string {
  if (period.recurrence === 'always') {
    return 'Toute l’année';
  }
  if (period.recurrence === 'cyclic') {
    // Cyclic dates are stored in the sentinel year — render the month only, never the year.
    if (!period.startDate || !period.endDate) {
      return 'Dates non renseignées';
    }
    const s = decodeCyclicMonthDay(period.startDate);
    const e = decodeCyclicMonthDay(period.endDate);
    return `${MONTHS_FULL[s.month - 1]} → ${MONTHS_FULL[e.month - 1]}`;
  }
  // fixed: full calendar dates
  const start = formatShortDate(period.startDate);
  const end = formatShortDate(period.endDate);
  if (start && end) {
    return `${start} → ${end}`;
  }
  if (start) {
    return `À partir du ${start}`;
  }
  if (end) {
    return `Jusqu’au ${end}`;
  }
  return 'Dates non renseignées';
}

export function periodWeekSummary(period: ObjectWorkspaceOpeningPeriod): string {
  const kind = periodKind(period);
  if (kind === 'shut') {
    return 'Établissement fermé';
  }
  const openDays = period.weekdays.filter((day) => day.slots.length > 0).length;
  const hasSplit = period.weekdays.some((day) => day.slots.length > 1);
  return `${openDays}/7 j. · ${hasSplit ? 'avec coupure' : 'continu'}`;
}

function formatShortDate(iso: string): string {
  if (!iso) {
    return '';
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function monthFraction(iso: string): number | null {
  if (!iso) {
    return null;
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.getMonth() + (date.getDate() - 1) / 31;
}

export function buildRibbonSegments(periods: ObjectWorkspaceOpeningPeriod[]): OpeningRibbonSegment[] {
  if (periods.length === 0) {
    return [];
  }

  const dated = periods
    .map((period, periodIndex) => ({
      periodIndex,
      kind: periodKind(period),
      start: monthFraction(period.startDate),
      end: monthFraction(period.endDate),
      label: period.label || `Période ${periodIndex + 1}`,
    }))
    .filter((entry) => entry.start !== null || entry.end !== null);

  if (dated.length === 0) {
    const slice = 12 / periods.length;
    return periods.map((period, periodIndex) => ({
      kind: periodKind(period),
      periodIndex,
      start: periodIndex * slice,
      end: (periodIndex + 1) * slice,
      abbr: (period.label || `P${periodIndex + 1}`).slice(0, 8),
    }));
  }

  return dated.map((entry) => ({
    kind: entry.kind,
    periodIndex: entry.periodIndex,
    start: entry.start ?? 0,
    end: entry.end ?? 12,
    abbr: entry.label.slice(0, 10),
  }));
}

export function todayMonthFraction(): number {
  const now = new Date();
  return now.getMonth() + (now.getDate() - 1) / 31;
}

export function todayWeekdayIndex(): number {
  const day = new Date().getDay();
  return day === 0 ? 6 : day - 1;
}

export function currentPeriodIndex(periods: ObjectWorkspaceOpeningPeriod[]): number {
  // The "en cours" badge tracks the period whose bucket is active; fall back to the first
  // non-closure period, then 0, so an object without an active bucket still renders.
  const current = periods.findIndex((period) => !period.isClosure && period.bucket === 'current');
  if (current >= 0) return current;
  const firstOpen = periods.findIndex((period) => !period.isClosure);
  return firstOpen >= 0 ? firstOpen : 0;
}

export { MONTHS };
