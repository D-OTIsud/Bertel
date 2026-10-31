import {
  projectWorkspaceOpeningSchedules,
  type ObjectWorkspaceOpeningPeriod,
  type ObjectWorkspaceOpeningSchedule,
} from "../../../services/object-workspace-parser";
import { buildOpeningSchedules } from "../../../services/object-workspace-payloads/openings";
import type { ScheduleRow } from "../primitives";
import { openingPeriodEditingReason } from "./blocks/opening-schedule";
import { formatScheduleTime } from "../primitives/schedule-time";
import { classifyClosedDays } from "./opening-period-edit";

export const OFFICE_SCHEDULE_TYPES = [
  { v: "regular", l: "Ouverture" },
  { v: "reception", l: "Accueil" },
  { v: "service", l: "Service" },
];

function sources(
  period: ObjectWorkspaceOpeningPeriod,
): ObjectWorkspaceOpeningSchedule[] {
  return period.schedules?.length
    ? period.schedules
    : buildOpeningSchedules({
        ...period,
        schedules: undefined,
        closedDays: [
          ...period.closedDays,
          ...Object.entries(period.weekdayNotes ?? {})
            .filter(([, note]) => Boolean(note))
            .map(([code]) => code),
        ],
      });
}
function withSchedules(
  period: ObjectWorkspaceOpeningPeriod,
  schedules: ObjectWorkspaceOpeningSchedule[],
): ObjectWorkspaceOpeningPeriod {
  const projection = projectWorkspaceOpeningSchedules(schedules);
  return {
    ...period,
    schedules,
    ...projection,
    weekdays: projection.weekdays.map((day) => ({
      ...day,
      label:
        period.weekdays.find((previous) => previous.code === day.code)?.label ??
        day.label.toLocaleLowerCase("fr"),
    })),
    weekdayNotes: Object.fromEntries(
      Object.entries(projection.weekdayNotes).filter(
        ([code, note]) =>
          note !== null ||
          Object.prototype.hasOwnProperty.call(period.weekdayNotes ?? {}, code),
      ),
    ),
    closedDays: [
      ...projection.closedDays,
      ...classifyClosedDays(period.closedDays)
        .filter((entry) => entry.kind !== "weekday")
        .map((entry) => entry.raw),
    ],
  };
}
export function officeOpeningSchedules(period: ObjectWorkspaceOpeningPeriod) {
  return sources(period).map((source, index) => {
    const projection = projectWorkspaceOpeningSchedules([source], true);
    const single = {
      ...period,
      ...projection,
      weekdays: projection.weekdays.map((day) => ({
        ...day,
        label:
          period.weekdays.find((previous) => previous.code === day.code)
            ?.label ?? day.label.toLocaleLowerCase("fr"),
      })),
      editingUnavailableReason: period.schedules?.length
        ? projection.editingUnavailableReason
        : (period.editingUnavailableReason ??
          projection.editingUnavailableReason),
      schedules: [source],
    };
    const type = source.schedule_type_code ?? "";
    const title =
      source.name?.trim() ||
      OFFICE_SCHEDULE_TYPES.find((option) => option.v === type)?.l ||
      "Ouverture";
    return {
      source,
      index,
      title,
      period: single,
      reason: openingPeriodEditingReason(single),
    };
  });
}
export function patchOfficeOpeningSchedule(
  period: ObjectWorkspaceOpeningPeriod,
  index: number,
  patch: Partial<
    Pick<ObjectWorkspaceOpeningSchedule, "name" | "schedule_type_code">
  >,
) {
  return withSchedules(
    period,
    sources(period).map((source, i) =>
      i === index
        ? {
            ...source,
            ...patch,
            ...(patch.schedule_type_code !== undefined &&
            patch.schedule_type_code !== source.schedule_type_code
              ? { schedule_type_id: null }
              : {}),
          }
        : source,
    ),
  );
}
export function patchOfficeOpeningRows(
  period: ObjectWorkspaceOpeningPeriod,
  index: number,
  rows: ScheduleRow[],
) {
  const views = officeOpeningSchedules(period),
    view = views[index];
  if (!view || view.reason) return period;
  const edited = {
    ...view.period,
    weekdays: rows.map((row) => ({
      code: row.code,
      label: row.label,
      slots: row.slots.filter((slot): slot is NonNullable<typeof slot> =>
        Boolean(slot),
      ),
    })),
  };
  const replacement = buildOpeningSchedules(edited, true)[0];
  return withSchedules(
    period,
    views.map((item, i) => (i === index ? replacement : item.source)),
  );
}
export function addOfficeOpeningSchedule(period: ObjectWorkspaceOpeningPeriod) {
  return withSchedules(period, [
    ...sources(period),
    {
      id: null,
      schedule_type_id: null,
      schedule_type_code: "service",
      name: "",
      note: null,
      name_i18n: null,
      note_i18n: null,
      extra: {},
      time_periods: [],
    },
  ]);
}
export function removeOfficeOpeningSchedule(
  period: ObjectWorkspaceOpeningPeriod,
  index: number,
) {
  return withSchedules(
    period,
    sources(period).filter((_, i) => i !== index),
  );
}
export function normalizeOfficeOpeningSchedules(
  period: ObjectWorkspaceOpeningPeriod,
) {
  if (period.schedules?.length === 0) return period;
  // Preserve original canonical times, including seconds. Only human shorthand
  // entered in this modal needs normalization before the writer receives it.
  const normalize = (value: string | null) =>
    value && !/^\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(value)
      ? (formatScheduleTime(value) ?? value)
      : value;
  if (!period.schedules)
    return {
      ...period,
      weekdays: period.weekdays.map((day) => ({
        ...day,
        slots: day.slots.map((slot) => ({
          start: normalize(slot.start) ?? "",
          end: normalize(slot.end) ?? "",
        })),
      })),
    };
  const schedules = sources(period).map((source) => ({
    ...source,
    time_periods: source.time_periods.map((tp) => ({
      ...tp,
      time_frames: tp.time_frames.map((frame) => ({
        ...frame,
        start_time: normalize(frame.start_time),
        end_time: normalize(frame.end_time),
      })),
    })),
  }));
  return withSchedules(period, schedules);
}
