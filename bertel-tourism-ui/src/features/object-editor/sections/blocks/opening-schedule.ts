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

/**
 * Read-side helper: project a workspace opening period onto the 7-day ScheduleEditor row shape.
 * Sole remaining consumer is §14's OpeningPeriodsEditor (the single owner of hours since §48);
 * the write-path helpers (applyRowsToFirstPeriod & co) were removed with the §05 ScheduleEditors.
 */
export function scheduleRowsFromPeriod(period: ObjectWorkspaceOpeningPeriod | undefined): ScheduleRow[] {
  return WEEKDAY_CODES.map((code) => {
    const meta = WEEKDAY_META[code];
    const weekday = period?.weekdays.find((day) => day.code === code);
    return {
      code,
      shortLabel: meta.shortLabel,
      label: weekday?.label ?? meta.label,
      slots: [weekday?.slots[0] ?? null, weekday?.slots[1] ?? null],
    };
  });
}
