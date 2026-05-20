import type {
  ObjectWorkspaceOpeningPeriod,
  ObjectWorkspaceOpeningsModule,
} from '../../../../services/object-workspace-parser';
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

export function applyRowsToFirstPeriod(openings: ObjectWorkspaceOpeningsModule, rows: ScheduleRow[]): ObjectWorkspaceOpeningsModule {
  const first = openings.periods[0] ?? {
    recordId: null,
    order: '1',
    bucket: 'current',
    label: 'Période standard',
    startDate: '',
    endDate: '',
    allYears: true,
    closedDays: [],
    weekdays: [],
  };
  const nextFirst: ObjectWorkspaceOpeningPeriod = {
    ...first,
    weekdays: rows.map((row) => ({
      code: row.code,
      label: row.label,
      slots: row.slots.filter((slot): slot is NonNullable<typeof slot> => Boolean(slot)),
    })),
  };
  return { ...openings, periods: [nextFirst, ...openings.periods.slice(1)] };
}
