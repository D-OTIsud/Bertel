jest.mock('./notification-delivery', () => ({ pingNotifyDrain: jest.fn() }));
jest.mock('../lib/supabase', () => ({ getApiClient: jest.fn(), getSupabaseClient: jest.fn() }));
jest.mock('../store/session-store', () => ({ useSessionStore: { getState: () => ({ demoMode: false }) } }));

import { getSupabaseClient } from '../lib/supabase';
import { buildOpeningsPayload, getObjectWorkspaceOpeningsModule, saveObjectWorkspaceOpenings } from './object-workspace';
import { parseWorkspaceOpeningPeriodRows } from './object-workspace-parser';
import type { ObjectWorkspaceOpeningPeriod } from './object-workspace-parser';
import type { ReferenceCatalogs } from './reference-catalogs';

const p = (o: Partial<ObjectWorkspaceOpeningPeriod>): ObjectWorkspaceOpeningPeriod => ({
  recordId: null, order: '1', bucket: 'current', label: '', seasonTypeCode: '',
  startDate: '', endDate: '', allYears: true, recurrence: 'always', isClosure: false,
  closedDays: [], weekdays: [], ...o,
});

const ids = {
  period: '11111111-1111-4111-8111-111111111111', schedule: '22222222-2222-4222-8222-222222222222',
  timePeriod: '33333333-3333-4333-8333-333333333333', closed: '44444444-4444-4444-8444-444444444444',
  frame: '55555555-5555-4555-8555-555555555555', type: '66666666-6666-4666-8666-666666666666',
};
const richRows = () => [{
  id: ids.period, label: 'Hiver', name: 'Hiver', source_period_id: 'apidae:2024',
  date_start: '2026-11-01', date_end: '2026-12-31', all_years: false,
  period_type_id: ids.type, period_type_code: 'winter', name_i18n: { en: 'Winter' },
  extra: { legacy: 'preserved', workspace_order: '7' },
  schedules: [{
    id: ids.schedule, schedule_type_id: ids.type, name: 'Horaires habituels', note: null as string | null,
    name_i18n: { en: 'Regular hours' }, extra: { imported: true }, time_periods: [{
      id: ids.timePeriod, closed: false, note: ' Sur réservation ',
      weekdays: [{ weekday_code: 'monday' }, { weekday_code: 'tuesday' }],
      time_frames: [{ id: ids.frame, start_time: '09:00:00', end_time: '12:00:00', recurrence: null as string | null }],
    }, {
      id: ids.closed, closed: true, note: 'Fermeture exceptionnelle',
      weekdays: [{ weekday_code: 'wednesday' }], time_frames: [],
    }],
  }],
}];
const richPeriod = () => parseWorkspaceOpeningPeriodRows(richRows())[0];

describe('opening tree preservation', () => {
  test('round-trip preserves provenance, names, translations, metadata, closed notes and unchanged IDs', () => {
    const period = richPeriod();
    expect(period.weekdayNotes).toEqual({ monday: ' Sur réservation ', tuesday: ' Sur réservation ', wednesday: 'Fermeture exceptionnelle' });
    expect(period.closedDays).toEqual(['wednesday']);
    expect(period.editingUnavailableReason).toBeNull();
    const output = buildOpeningsPayload([period])[0];
    expect(output).toMatchObject({ id: ids.period, source_period_id: 'apidae:2024', name: 'Hiver',
      name_i18n: { en: 'Winter' }, extra: { legacy: 'preserved', workspace_order: '7' } });
    expect(output.schedules[0]).toMatchObject({ id: ids.schedule, name: 'Horaires habituels',
      name_i18n: { en: 'Regular hours' }, extra: { imported: true } });
    expect(output.schedules[0].time_periods).toEqual(period.schedules![0].time_periods);
  });

  test('editing one day splits its source group and keeps the note on both days without duplicate IDs', () => {
    const period = richPeriod();
    period.weekdays[0].slots[0].start = '10:00';
    const groups = buildOpeningsPayload([period])[0].schedules[0].time_periods;
    expect(groups.filter((group) => !group.closed)).toHaveLength(2);
    expect(groups.filter((group) => !group.closed).map((group) => group.note)).toEqual([' Sur réservation ', ' Sur réservation ']);
    const retainedIds = groups.flatMap((group) => [group.id, ...group.time_frames.map((frame) => frame.id)]).filter(Boolean);
    expect(new Set(retainedIds).size).toBe(retainedIds.length);
  });

  test('same hours with different notes remain separate, even when the hours are copied', () => {
    const period = richPeriod();
    period.weekdayNotes!.tuesday = 'Autre condition';
    period.weekdays[1].slots = period.weekdays[0].slots.map((slot) => ({ ...slot }));
    const groups = buildOpeningsPayload([period])[0].schedules[0].time_periods.filter((group) => !group.closed);
    expect(groups).toHaveLength(2);
    expect(groups.map((group) => group.note)).toEqual([' Sur réservation ', 'Autre condition']);
  });

  test('closing and reopening a day retains its note, including open without fixed hours', () => {
    const period = richPeriod();
    period.weekdays[0].slots = [];
    const closed = buildOpeningsPayload([period])[0].schedules[0].time_periods
      .find((group) => group.weekdays.some((day) => day.weekday_code === 'monday'))!;
    expect(closed).toMatchObject({ closed: true, note: ' Sur réservation ', time_frames: [] });
    period.weekdays[0].slots = [{ start: '', end: '' }];
    const reopened = buildOpeningsPayload([period])[0].schedules[0].time_periods
      .find((group) => group.weekdays.some((day) => day.weekday_code === 'monday'))!;
    expect(reopened).toMatchObject({ closed: false, note: ' Sur réservation ', time_frames: [] });
  });

  test('changing or clearing a period type does not retain the old UUID over the new choice', () => {
    const period = richPeriod();
    period.seasonTypeCode = '';
    expect(buildOpeningsPayload([period])[0].period_type_id).toBeNull();
    period.seasonTypeCode = 'summer';
    expect(buildOpeningsPayload([period])[0]).toMatchObject({ period_type_id: null, period_type_code: 'summer' });
  });

  test.each([null, ''])('an unnamed canonical period (%s) does not persist a generated display name', (name) => {
    const rows: Record<string, unknown>[] = [{ ...richRows()[0], label: undefined, name }];
    const parsed = parseWorkspaceOpeningPeriodRows(rows)[0];
    expect(parsed.label).toBe('');
    expect(buildOpeningsPayload([parsed])[0].name).toBeNull();
  });

  test('a no-date period keeps its stored all_years flag unless recurrence changes', () => {
    const parsed = parseWorkspaceOpeningPeriodRows([{ ...richRows()[0], date_start: null, date_end: null, all_years: false }])[0];
    expect(parsed.recurrence).toBe('always');
    expect(buildOpeningsPayload([parsed])[0].all_years).toBe(false);
    parsed.recurrence = 'cyclic';
    parsed.startDate = '2000-01-01'; parsed.endDate = '2000-02-01';
    expect(buildOpeningsPayload([parsed])[0].all_years).toBe(true);
  });

  test.each(['schedule note', 'recurrence', 'multiple schedules', 'ambiguous notes'])('%s stays intact when untouched but cannot be flattened', (variant) => {
    const rows = richRows();
    const schedule = rows[0].schedules[0];
    if (variant === 'schedule note') schedule.note = 'Renseignements';
    if (variant === 'recurrence') schedule.time_periods[0].time_frames[0].recurrence = '7 days';
    if (variant === 'multiple schedules') rows[0].schedules.push({ ...schedule, id: ids.closed, time_periods: [] });
    if (variant === 'ambiguous notes') schedule.time_periods.push({ ...schedule.time_periods[0], id: ids.type, note: 'Autre note',
      time_frames: schedule.time_periods[0].time_frames.map((frame) => ({ ...frame, id: '77777777-7777-4777-8777-777777777777' })) });
    const period = parseWorkspaceOpeningPeriodRows(rows)[0];
    expect(period.editingUnavailableReason).toBeTruthy();
    expect(buildOpeningsPayload([period])[0].schedules).toEqual(period.schedules);
    period.weekdays[0].slots = [{ start: '11:00', end: '12:00' }];
    expect(() => buildOpeningsPayload([period])).toThrow();
  });

  test('saving a second period preserves the complex first period unchanged', () => {
    const rows = richRows();
    rows[0].schedules[0].note = 'Horaire spécial';
    const complex = parseWorkspaceOpeningPeriodRows(rows)[0];
    const result = buildOpeningsPayload([complex, p({ label: 'Nouvelle période' })]);
    expect(result[0].schedules).toEqual(complex.schedules);
    expect(result[1].name).toBe('Nouvelle période');
  });
});

type ReadResponse = { data: unknown; error: unknown; count?: number | null };
type ReadChain = {
  select: jest.Mock; eq: jest.Mock; in: jest.Mock; order: jest.Mock;
  then: (resolve: (value: ReadResponse) => unknown, reject: (reason: unknown) => unknown) => Promise<unknown>;
};
function openingReadClient(overrides: Record<string, ReadResponse | Error> = {}) {
  const row = richRows()[0];
  const fixture: Record<string, ReadResponse | Error> = {
    opening_period: { data: [row], error: null, count: 1 },
    opening_schedule: { data: row.schedules.map((schedule) => ({ ...schedule, period_id: ids.period })), error: null, count: 1 },
    opening_time_period: { data: row.schedules[0].time_periods.map((entry) => ({ ...entry, schedule_id: ids.schedule })), error: null, count: 2 },
    opening_time_period_weekday: { data: [
      { time_period_id: ids.timePeriod, weekday_id: 'monday-id' }, { time_period_id: ids.timePeriod, weekday_id: 'tuesday-id' },
      { time_period_id: ids.closed, weekday_id: 'wednesday-id' },
    ], error: null, count: 3 },
    opening_time_frame: { data: row.schedules[0].time_periods[0].time_frames.map((frame) => ({ ...frame, time_period_id: ids.timePeriod })), error: null, count: 1 },
    ...overrides,
  };
  const from = jest.fn((table: string) => {
    const chain: ReadChain = {
      select: jest.fn(() => chain), eq: jest.fn(() => chain), in: jest.fn(() => chain), order: jest.fn(() => chain),
      then(resolve: (value: ReadResponse) => unknown, reject: (reason: unknown) => unknown): Promise<unknown> {
        const result = fixture[table];
        return (result instanceof Error ? Promise.reject(result) : Promise.resolve(result)).then(resolve, reject);
      },
    };
    return chain;
  });
  (getSupabaseClient as jest.Mock).mockReturnValue({ from });
  return from;
}
const catalogs: ReferenceCatalogs = { refCodeByDomain: {
  weekday: ['monday', 'tuesday', 'wednesday'].map((code) => ({ id: `${code}-id`, code, domain: 'weekday', name: code, position: null })),
  opening_period_type: [{ id: ids.type, code: 'winter', name: 'Hiver', domain: 'opening_period_type', position: null }],
}, tables: {} };

describe('complete canonical opening read', () => {
  beforeEach(() => jest.clearAllMocks());

  test('loads the complete child tree instead of relying on the public weekly projection', async () => {
    const from = openingReadClient();
    const loaded = await getObjectWorkspaceOpeningsModule('object-1', { periods: [], periodTypeOptions: [], unavailableReason: null }, catalogs);
    expect(loaded.unavailableReason).toBeNull();
    expect(loaded.periods[0].weekdayNotes!.wednesday).toBe('Fermeture exceptionnelle');
    expect(loaded.periods[0].sourcePeriodId).toBe('apidae:2024');
    expect(buildOpeningsPayload(loaded.periods)[0].schedules[0].time_periods).toHaveLength(2);
    expect(from.mock.calls.map(([table]) => table)).toEqual([
      'opening_period', 'opening_schedule', 'opening_time_period', 'opening_time_period_weekday', 'opening_time_frame',
    ]);
  });

  test.each(['opening_period', 'opening_schedule', 'opening_time_period', 'opening_time_period_weekday', 'opening_time_frame'])('a failed %s read blocks saving and retains the known snapshot', async (table) => {
    openingReadClient({ [table]: { data: null, error: { message: 'Permission denied' } } });
    const initial = { periods: [richPeriod()], periodTypeOptions: [], unavailableReason: null };
    const loaded = await getObjectWorkspaceOpeningsModule('object-1', initial, catalogs);
    expect(loaded.periods).toBe(initial.periods);
    expect(loaded.unavailableReason).toBeTruthy();
    await expect(saveObjectWorkspaceOpenings('object-1', loaded)).rejects.toThrow();
  });

  test('a truncated child page or unknown weekday cannot become a complete empty/partial schedule', async () => {
    openingReadClient({ opening_time_frame: { data: [], error: null, count: 1 } });
    const base = { periods: [], periodTypeOptions: [], unavailableReason: null };
    expect((await getObjectWorkspaceOpeningsModule('object-1', base, catalogs)).unavailableReason).toBeTruthy();
    openingReadClient();
    expect((await getObjectWorkspaceOpeningsModule('object-1', base, { refCodeByDomain: {}, tables: {} })).unavailableReason).toBeTruthy();
  });

  test('an empty read does not discard a period already known from the resource', async () => {
    openingReadClient({ opening_period: { data: [], error: null, count: 0 } });
    const initial = { periods: [richPeriod()], periodTypeOptions: [], unavailableReason: null };
    expect((await getObjectWorkspaceOpeningsModule('object-1', initial, catalogs)).unavailableReason).toBeTruthy();
  });
});

describe('buildOpeningsPayload', () => {
  test('cyclic => all_years true + dates kept', () => {
    const out = buildOpeningsPayload([p({ recurrence: 'cyclic', allYears: true, startDate: '2000-05-01', endDate: '2000-09-30' })]);
    expect(out[0].all_years).toBe(true);
    expect(out[0].date_start).toBe('2000-05-01');
    expect(out[0].date_end).toBe('2000-09-30');
    expect(out[0].is_closure).toBe(false);
  });
  test('fixed => all_years false + dates kept', () => {
    const out = buildOpeningsPayload([p({ recurrence: 'fixed', allYears: false, startDate: '2025-01-15', endDate: '2025-12-15' })]);
    expect(out[0].all_years).toBe(false);
    expect(out[0].date_start).toBe('2025-01-15');
  });
  test('always => dates nulled', () => {
    const out = buildOpeningsPayload([p({ recurrence: 'always', allYears: true, startDate: '2000-01-01', endDate: '2000-12-31' })]);
    expect(out[0].date_start).toBeNull();
    expect(out[0].date_end).toBeNull();
  });
  test('closure carries is_closure + dates', () => {
    const out = buildOpeningsPayload([p({ isClosure: true, recurrence: 'fixed', allYears: false, startDate: '2025-12-25', endDate: '2025-12-25' })]);
    expect(out[0].is_closure).toBe(true);
    expect(out[0].date_start).toBe('2025-12-25');
  });
  test('no workspace_bucket in extra', () => {
    const out = buildOpeningsPayload([p({ recurrence: 'always' })]);
    expect((out[0].extra as Record<string, unknown>).workspace_bucket).toBeUndefined();
  });
});
