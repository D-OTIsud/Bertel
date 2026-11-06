import {
  projectWorkspaceOpeningSchedules,
  type ObjectWorkspaceOpeningSchedule,
  type ObjectWorkspaceOpeningsModule,
  type ObjectWorkspaceOpeningPeriod,
} from "../../services/object-workspace-parser";
import { buildOpeningSchedules } from "../../services/object-workspace-payloads/openings";
import { readWeekHours } from "./portal-bindings";
import type { ScheduleForm } from "./rubrics/ScheduleBlock";
import { isOpeningHoursException } from "../object-editor/sections/opening-exception";
import { createPeriodDraft } from "../object-editor/sections/opening-period-edit";

export interface PortalNamedSchedule {
  key: string;
  type: "reception" | "service";
  name: string;
  form: ScheduleForm;
  source: ObjectWorkspaceOpeningSchedule | null;
  readOnlyReason: string | null;
}
const isNamed = (s: ObjectWorkspaceOpeningSchedule) =>
  s.schedule_type_code === "reception" || s.schedule_type_code === "service";
const keyOf = (s: ObjectWorkspaceOpeningSchedule, index: number) =>
  s.id ?? `named-${index}`;
function mainPeriod(openings: ObjectWorkspaceOpeningsModule) {
  return openings.periods.find(
    (p) => !p.isClosure && !isOpeningHoursException(p),
  );
}
function periodFor(
  schedule: ObjectWorkspaceOpeningSchedule,
): ObjectWorkspaceOpeningPeriod {
  return {
    ...createPeriodDraft(0),
    schedules: [schedule],
    ...projectWorkspaceOpeningSchedules([schedule], true),
  };
}
export function readPortalNamedSchedules(
  openings: ObjectWorkspaceOpeningsModule,
): PortalNamedSchedule[] {
  const period = mainPeriod(openings);
  return (period?.schedules ?? []).flatMap((source, index) =>
    isNamed(source)
      ? [
          {
            key: keyOf(source, index),
            type: source.schedule_type_code as PortalNamedSchedule["type"],
            name: source.name ?? "",
            source,
            form: {
              hours: readWeekHours({
                ...openings,
                periods: [periodFor(source)],
              }).hours,
              individual: false,
              error: null,
            },
            readOnlyReason: periodFor(source).editingUnavailableReason ?? null,
          },
        ]
      : [],
  );
}
export function newPortalNamedSchedule(
  type: PortalNamedSchedule["type"],
  name: string,
  key: string,
): PortalNamedSchedule {
  return {
    key,
    type,
    name,
    source: null,
    readOnlyReason: null,
    form: {
      hours: readWeekHours({
        periods: [],
      } as unknown as ObjectWorkspaceOpeningsModule).hours,
      individual: false,
      error: null,
    },
  };
}
export function receptionByDefault(type: string) {
  return ["HOT", "HPA", "CAMP"].includes(type.toUpperCase());
}
export function setPortalNamedSchedules(
  openings: ObjectWorkspaceOpeningsModule,
  forms: PortalNamedSchedule[],
): ObjectWorkspaceOpeningsModule {
  const period = mainPeriod(openings);
  if (!period) return openings;
  const original = period.schedules ?? [];
  const meaningful = forms.filter(
    (entry) =>
      entry.source || Object.values(entry.form.hours).some((day) => day.open),
  );
  const comparable = (entries: PortalNamedSchedule[]) =>
    entries.map((entry) => [
      entry.key,
      entry.type,
      entry.name,
      entry.form.hours,
    ]);
  if (
    JSON.stringify(comparable(meaningful)) ===
    JSON.stringify(comparable(readPortalNamedSchedules(openings)))
  )
    return openings;
  const replacements = new Map<string, ObjectWorkspaceOpeningSchedule>();
  for (const entry of forms) {
    if (
      !entry.source &&
      !Object.values(entry.form.hours).some((day) => day.open)
    )
      continue;
    if (entry.readOnlyReason && entry.source) {
      replacements.set(entry.key, entry.source);
      continue;
    }
    const source = entry.source ?? {
      id: null,
      schedule_type_id: null,
      schedule_type_code: entry.type,
      name: entry.name,
      note: null,
      name_i18n: null,
      note_i18n: null,
      extra: {},
      time_periods: [],
    };
    const base = periodFor(source);
    const hours = entry.form.hours;
    const sourceHours = readWeekHours({ ...openings, periods: [base] }).hours;
    if (
      entry.source &&
      entry.name === source.name &&
      entry.type === source.schedule_type_code &&
      JSON.stringify(hours) === JSON.stringify(sourceHours)
    ) {
      replacements.set(entry.key, entry.source);
      continue;
    }
    const weekdays = Object.entries(hours)
      .filter(([, day]) => day.open)
      .map(([code, day]) => ({
        code,
        label: code,
        slots: day.fixedHours ? day.slots : [{ start: "", end: "" }],
      }));
    const closedDays = [
      ...new Set([
        ...base.closedDays,
        ...base.weekdays
          .filter((day) => day.slots.length && !hours[day.code]?.open)
          .map((day) => day.code),
      ]),
    ].filter((code) => !hours[code]?.open);
    const built = buildOpeningSchedules(
      { ...base, weekdays, closedDays },
      true,
    )[0];
    replacements.set(entry.key, {
      ...built,
      name: entry.name.trim(),
      schedule_type_code: entry.type,
      schedule_type_id:
        source.schedule_type_code === entry.type
          ? source.schedule_type_id
          : null,
    });
  }
  const source = buildOpeningSchedules(period);
  const schedules = source.flatMap((schedule) => {
    if (!isNamed(schedule)) return [schedule];
    const index = original.indexOf(schedule);
    const key = keyOf(schedule, index);
    const replacement = replacements.get(key);
    replacements.delete(key);
    return replacement ? [replacement] : [];
  });
  schedules.push(...replacements.values());
  if (JSON.stringify(schedules) === JSON.stringify(period.schedules ?? []))
    return openings;
  return {
    ...openings,
    periods: openings.periods.map((p) =>
      p === period ? { ...p, schedules } : p,
    ),
  };
}
