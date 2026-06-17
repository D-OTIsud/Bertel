import type { ObjectWorkspaceOpeningPeriod } from '../../../services/object-workspace-parser';

/**
 * Pure helpers for the §14 Périodes d'ouverture add/edit modal (parallel to
 * classification-edit.ts). The opening module stores one row per period; the
 * editor manipulates the period array via the modal and commits it back whole
 * (the atomic `save_object_openings` contract — see object-workspace.ts).
 */

/** Canonical weekday vocabulary used by the schedule + closed-days controls. */
export const OPENING_WEEKDAYS: readonly { code: string; label: string; short: string }[] = [
  { code: 'monday', label: 'Lundi', short: 'Lun' },
  { code: 'tuesday', label: 'Mardi', short: 'Mar' },
  { code: 'wednesday', label: 'Mercredi', short: 'Mer' },
  { code: 'thursday', label: 'Jeudi', short: 'Jeu' },
  { code: 'friday', label: 'Vendredi', short: 'Ven' },
  { code: 'saturday', label: 'Samedi', short: 'Sam' },
  { code: 'sunday', label: 'Dimanche', short: 'Dim' },
];

/** Bucket axis (temporal scope) — mirrors the legacy BUCKET_OPTIONS. */
export const OPENING_BUCKET_OPTIONS: readonly { v: string; l: string }[] = [
  { v: 'current', l: 'Courante' },
  { v: 'next-year', l: 'N+1' },
  { v: 'undated', l: 'Sans date' },
];

function labelOf(code: string): string {
  return OPENING_WEEKDAYS.find((day) => day.code === code)?.label ?? code;
}

// Weekday alias → canonical code. Mirrors normalizeOpeningWeekdayCode in
// object-workspace.ts (the save-path twin) so what the user adds in the modal
// matches what is persisted. Weekdays are a frozen vocabulary; the small
// duplication keeps this helper pure (no service-file import in unit tests).
const WEEKDAY_ALIAS: Record<string, string> = {};
for (const { code } of OPENING_WEEKDAYS) {
  const fr = labelOf(code).toLowerCase();
  WEEKDAY_ALIAS[code] = code; // monday
  WEEKDAY_ALIAS[code.slice(0, 3)] = code; // mon
  WEEKDAY_ALIAS[fr] = code; // lundi
  WEEKDAY_ALIAS[fr.slice(0, 3)] = code; // lun
}

/** A blank period draft for the "add" modal. */
export function createPeriodDraft(index = 0): ObjectWorkspaceOpeningPeriod {
  return {
    recordId: null,
    order: String(index + 1),
    bucket: 'current',
    label: '',
    seasonTypeCode: '',
    startDate: '',
    endDate: '',
    allYears: true,
    recurrence: 'cyclic',
    isClosure: false,
    closedDays: [],
    weekdays: OPENING_WEEKDAYS.map(({ code, label }) => ({ code, label: label.toLowerCase(), slots: [] })),
  };
}

export type ClosedDayEntry =
  | { kind: 'weekday'; code: string; label: string; raw: string }
  | { kind: 'date'; iso: string; label: string; raw: string }
  | { kind: 'unknown'; label: string; raw: string };

/** Strict YYYY-MM-DD with valid month (1-12) and day (1-31) ranges. */
export function isValidIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return false;
  }
  const month = Number(match[2]);
  const day = Number(match[3]);
  return month >= 1 && month <= 12 && day >= 1 && day <= 31;
}

/** Classify a stored closed-day token as a weekday, a calendar date, or unknown. */
export function classifyClosedDay(raw: string): ClosedDayEntry {
  const trimmed = raw.trim();
  const weekday = WEEKDAY_ALIAS[trimmed.toLowerCase()];
  if (weekday) {
    return { kind: 'weekday', code: weekday, label: labelOf(weekday), raw };
  }
  if (isValidIsoDate(trimmed)) {
    const [y, m, d] = trimmed.split('-');
    return { kind: 'date', iso: trimmed, label: `${d}/${m}/${y}`, raw };
  }
  return { kind: 'unknown', label: raw, raw };
}

export function classifyClosedDays(list: readonly string[]): ClosedDayEntry[] {
  return list.map(classifyClosedDay);
}

function canonicalClosedDay(raw: string): string {
  const trimmed = raw.trim();
  return WEEKDAY_ALIAS[trimmed.toLowerCase()] ?? trimmed;
}

/** Append a canonical weekday code; no-op when an alias of the same day is present. */
export function addClosedWeekday(closedDays: readonly string[], code: string): string[] {
  const canonical = canonicalClosedDay(code);
  const present = new Set(closedDays.map(canonicalClosedDay));
  return present.has(canonical) ? [...closedDays] : [...closedDays, canonical];
}

/** Append a valid ISO date; returns null when the date is malformed, no-op when already present. */
export function addClosedDate(closedDays: readonly string[], iso: string): string[] | null {
  const trimmed = iso.trim();
  if (!isValidIsoDate(trimmed)) {
    return null;
  }
  return closedDays.includes(trimmed) ? [...closedDays] : [...closedDays, trimmed];
}

export interface PeriodValidation {
  canSave: boolean;
  dateError: string | null;
}

/** Save gate for the modal: a typed period with coherent dates (when not all-year). The
 *  label is optional (the type names the period); the period TYPE is required. */
export function validatePeriodDraft(period: ObjectWorkspaceOpeningPeriod): PeriodValidation {
  const dateError = periodDateError(period);
  const canSave = period.seasonTypeCode.trim().length > 0 && dateError === null;
  return { canSave, dateError };
}

function periodDateError(period: ObjectWorkspaceOpeningPeriod): string | null {
  if (period.allYears) {
    return null;
  }
  const hasStart = period.startDate.trim().length > 0;
  const hasEnd = period.endDate.trim().length > 0;
  if (hasStart !== hasEnd) {
    return 'Renseignez les deux dates ou activez « Toute l’année ».';
  }
  if (hasStart && hasEnd && period.endDate < period.startDate) {
    return 'La date de fin doit être postérieure à la date de début.';
  }
  return null;
}
