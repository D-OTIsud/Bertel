import {
  type ObjectWorkspaceOpeningPeriod,
  type ObjectWorkspaceOpeningTimePeriod,
  type ObjectWorkspaceOpeningSchedule,
  projectWorkspaceOpeningSchedules,
} from '../object-workspace-parser';
import { normalizeOpeningWeekdayCode, toNullableText, toRpcUuid } from './input';

export function openingProjectionKey(period: Pick<ObjectWorkspaceOpeningPeriod, 'weekdays' | 'closedDays' | 'weekdayNotes'>): string {
  return JSON.stringify([
    period.weekdays.map((day) => [normalizeOpeningWeekdayCode(day.code), day.slots.map((slot) => [slot.start, slot.end])])
      .sort((left, right) => String(left[0]).localeCompare(String(right[0]))),
    [...period.closedDays].sort(),
    Object.entries(period.weekdayNotes ?? {}).sort(([left], [right]) => left.localeCompare(right)),
  ]);
}



export function openingTimePeriodKey(timePeriod: Pick<ObjectWorkspaceOpeningTimePeriod, 'closed' | 'note' | 'time_frames'>): string {
  return JSON.stringify([timePeriod.closed, timePeriod.note || null, timePeriod.time_frames.map((frame) => [
    frame.start_time?.slice(0, 5) ?? null, frame.end_time?.slice(0, 5) ?? null, frame.recurrence,
  ])]);
}



export function buildOpeningSchedules(period: ObjectWorkspaceOpeningPeriod, includeNamed = false): ObjectWorkspaceOpeningSchedule[] {
  const source = period.schedules ?? [];
  if (!includeNamed && source.some(schedule => ['reception','service'].includes(schedule.schedule_type_code ?? ''))) {
    const isMain=(schedule:ObjectWorkspaceOpeningSchedule)=>!['reception','service'].includes(schedule.schedule_type_code ?? '');
    const main=source.filter(isMain);
    const built=buildOpeningSchedules({...period,schedules:main},true);
    let index=0;
    return [...source.map(schedule=>isMain(schedule)?built[index++]:schedule),...built.slice(index)];
  }
  const projected = projectWorkspaceOpeningSchedules(source,includeNamed);
  if (projected.editingUnavailableReason) {
    if (openingProjectionKey(period) !== openingProjectionKey(projected)) {
      throw new Error(projected.editingUnavailableReason);
    }
    // Saving another period must not flatten an untouched, more complex schedule.
    return source;
  }
  const notes = { ...projected.weekdayNotes, ...period.weekdayNotes };
  const groups = new Map<string, ObjectWorkspaceOpeningTimePeriod>();
  const openCodes = new Set<string>();
  const addDay = (code: string, closed: boolean, slots: ObjectWorkspaceOpeningPeriod['weekdays'][number]['slots']) => {
    if (!code) return;
    const timePeriod: ObjectWorkspaceOpeningTimePeriod = {
      id: null, closed, note: notes[code] || null, weekdays: [{ weekday_code: code }],
      time_frames: closed ? [] : slots.filter((slot) => slot.start || slot.end).map((slot) => ({
        id: null, start_time: toNullableText(slot.start), end_time: toNullableText(slot.end), recurrence: null,
      })),
    };
    const key = openingTimePeriodKey(timePeriod);
    const group = groups.get(key);
    if (group) group.weekdays.push({ weekday_code: code });
    else groups.set(key, timePeriod);
  };
  for (const day of period.weekdays) {
    if (!day.slots.length) continue;
    const code = normalizeOpeningWeekdayCode(day.code);
    if (openCodes.has(code)) throw new Error('Un jour apparaît plusieurs fois dans les horaires.');
    openCodes.add(code);
    addDay(code, false, day.slots);
  }
  // A source day that the user closes retains its note instead of silently disappearing.
  const closedCodes = new Set([...period.closedDays, ...Object.keys(projected.weekdayNotes)].map(normalizeOpeningWeekdayCode));
  for (const code of closedCodes) if (!openCodes.has(code)) addDay(code, true, []);
  const originalTimePeriods = source[0]?.time_periods ?? [];
  const timePeriods = Array.from(groups.values()).map((group) => {
    const daysKey = (days: { weekday_code: string }[]) => days.map((day) => day.weekday_code).sort().join(',');
    const unchanged = originalTimePeriods.find((original) => openingTimePeriodKey(original) === openingTimePeriodKey(group)
      && daysKey(original.weekdays) === daysKey(group.weekdays));
    return unchanged ? { ...unchanged, weekdays: [...unchanged.weekdays], time_frames: [...unchanged.time_frames] } : group;
  });
  if (period.schedules && source.length === 0 && timePeriods.length === 0) return [];
  return [{
    ...(source[0] ?? {
      id: null, schedule_type_id: null, schedule_type_code: 'regular', name: 'Horaires', note: null,
      name_i18n: null, note_i18n: null, extra: {},
    }),
    time_periods: timePeriods,
  }];
}



export function buildOpeningsPayload(periods: ObjectWorkspaceOpeningPeriod[]) {
  const output = periods.map((period, periodIndex) => {

    // recurrence → RPC mapping:
    //  - always: no dates, treated as all-year (date_start/date_end nulled)
    //  - cyclic: keep dates, repeats every year (all_years true)
    //  - fixed: keep dates, one-off span (all_years false)
    const hasDates = period.recurrence !== 'always';
    return {
      id: toRpcUuid(period.recordId),
      name: period.label === '' ? null : period.label,
      source_period_id: period.sourcePeriodId ?? null,
      name_i18n: period.nameI18n ?? null,
      period_type_id: period.originalSeasonTypeCode === undefined || period.seasonTypeCode === period.originalSeasonTypeCode
        ? toRpcUuid(period.periodTypeId) : null,
      period_type_code: toNullableText(period.seasonTypeCode),
      date_start: hasDates ? toNullableText(period.startDate) : null,
      date_end: hasDates ? toNullableText(period.endDate) : null,
      all_years: period.originalRecurrence === period.recurrence && period.originalAllYears !== undefined
        ? period.originalAllYears : period.recurrence !== 'fixed',
      is_closure: period.isClosure,
      extra: {
        ...period.extra,
        workspace_order: period.order || String(periodIndex + 1),
      },
      schedules: buildOpeningSchedules(period),
    };
  });
  const schedules = output.flatMap((period) => period.schedules);
  const timePeriods = schedules.flatMap((schedule) => schedule.time_periods);
  for (const ids of [output.map((period) => period.id), schedules.map((schedule) => schedule.id),
    timePeriods.map((period) => period.id), timePeriods.flatMap((period) => period.time_frames.map((frame) => frame.id))]) {
    const usedIds = new Set<string>();
    for (const id of ids) {
      if (!id) continue;
      if (usedIds.has(id)) throw new Error('Un identifiant est utilisé plusieurs fois dans les horaires. Rechargez la fiche.');
      usedIds.add(id);
    }
  }
  return output;
}
