import type { ObjectWorkspaceOpeningPeriod } from '../../../../services/object-workspace-parser';
import type { ScheduleRow } from '../../primitives';

const WEEKDAY_META: Record<string, { shortLabel: string; label: string }> = {
  monday: { shortLabel: 'Lun', label: 'lundi' },
  tuesday: { shortLabel: 'Mar', label: 'mardi' },
  wednesday: { shortLabel: 'Mer', label: 'mercredi' },
  thursday: { shortLabel: 'Jeu', label: 'jeudi' },
  friday: { shortLabel: 'Ven', label: 'vendredi' },
  saturday: { shortLabel: 'Sam', label: 'samedi' },
  sunday: { shortLabel: 'Dim', label: 'dimanche' },
};

const WEEKDAY_CODES = Object.keys(WEEKDAY_META);

/** A note is attached to its original days, independently of their editable hours. */
export function openingPeriodNotes(period: ObjectWorkspaceOpeningPeriod): { days: string; note: string }[] {
  const groups = new Map<string, Set<string>>();
  const add = (code: string, note: string | null | undefined) => {
    if (!note) return;
    const days = groups.get(note) ?? new Set<string>();
    days.add(code);
    groups.set(note, days);
  };
  if (period.editingUnavailableReason && period.schedules) {
    // The simple grid cannot express every source (e.g. two differently noted
    // time periods on the same day), but the read-only detail must show them all.
    for (const schedule of period.schedules) {
      for (const timePeriod of schedule.time_periods) {
        for (const day of timePeriod.weekdays) add(day.weekday_code, timePeriod.note);
      }
    }
  } else {
    for (const [code, note] of Object.entries(period.weekdayNotes ?? {})) add(code, note);
  }
  return [...groups].map(([note, days]) => ({
    days: [...days].sort((a, b) => WEEKDAY_CODES.indexOf(a) - WEEKDAY_CODES.indexOf(b))
      .map((code) => WEEKDAY_META[code]?.shortLabel ?? code).join(', '),
    note,
  }));
}

/** Never let the two-column editor silently remove a third source time frame. */
export function openingPeriodEditingReason(period: ObjectWorkspaceOpeningPeriod): string | null {
  return period.editingUnavailableReason
    || (period.weekdays.some((day) => day.slots.length > 2)
      ? 'Cette période comporte plus de deux plages par jour. Ses horaires sont conservés ; cette grille ne permet pas de les modifier.'
      : null);
}

/**
 * Read-side helper: project a workspace opening period onto the 7-day ScheduleEditor row shape.
 * Keep every source frame for the read-only detail. The two-column editing grid is
 * guarded by openingPeriodEditingReason rather than silently truncating that source.
 */
export function scheduleRowsFromPeriod(period: ObjectWorkspaceOpeningPeriod | undefined): ScheduleRow[] {
  return WEEKDAY_CODES.map((code) => {
    const meta = WEEKDAY_META[code];
    const weekday = period?.weekdays.find((day) => day.code === code);
    return {
      code,
      shortLabel: meta.shortLabel,
      label: weekday?.label ?? meta.label,
      slots: weekday?.slots.length ? weekday.slots : [null, null],
    };
  });
}
