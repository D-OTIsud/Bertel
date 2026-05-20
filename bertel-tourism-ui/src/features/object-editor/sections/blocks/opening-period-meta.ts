import type { ObjectWorkspaceOpeningPeriod } from '../../../../services/object-workspace-parser';

export type OpeningPeriodKind = 'high' | 'low' | 'shut' | 'standard';

const MONTHS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];

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

export function formatPeriodRange(period: ObjectWorkspaceOpeningPeriod): string {
  if (period.allYears && !period.startDate && !period.endDate) {
    return 'Toute l’année';
  }
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
  return period.bucket === 'next-year' ? 'Année suivante' : 'Dates non renseignées';
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
  const current = periods.findIndex((period) => period.bucket === 'current');
  return current >= 0 ? current : 0;
}

export { MONTHS };
