import { buildOpeningsPayload } from './object-workspace';
import { parseObjectWorkspace } from './object-workspace-parser';
import type { ObjectWorkspaceOpeningPeriod } from './object-workspace-parser';
import type { ObjectDetail } from '../types/domain';

// §14 "open without hours" round-trip (per-day): a day can be OPEN with no time range
// (hôtel / location). It persists as a closed:false time_period with zero frames and reads
// back as an open row. Closed days are simply absent.

const p = (o: Partial<ObjectWorkspaceOpeningPeriod>): ObjectWorkspaceOpeningPeriod => ({
  recordId: null, order: '1', bucket: 'current', label: '', seasonTypeCode: '',
  startDate: '', endDate: '', allYears: true, recurrence: 'always', isClosure: false,
  closedDays: [], weekdays: [], ...o,
});

type TimePeriod = { closed: boolean; weekdays: { weekday_code: string }[]; time_frames: unknown[] };
const timePeriodsOf = (out: ReturnType<typeof buildOpeningsPayload>): TimePeriod[] =>
  (out[0].schedules[0].time_periods as unknown as TimePeriod[]);

describe('buildOpeningsPayload — open without hours', () => {
  test('open-no-hours day => closed:false + empty time_frames; closed day omitted; timed day kept', () => {
    const out = buildOpeningsPayload([
      p({
        weekdays: [
          { code: 'monday', label: 'lundi', slots: [{ start: '', end: '' }] },                 // open, no hours
          { code: 'tuesday', label: 'mardi', slots: [] },                                       // closed → omitted
          { code: 'wednesday', label: 'mercredi', slots: [{ start: '09:00', end: '12:00' }] },  // open + hours
        ],
      }),
    ]);
    const tps = timePeriodsOf(out);
    const codes = tps.map((t) => t.weekdays[0].weekday_code);
    expect(codes).toContain('monday');
    expect(codes).toContain('wednesday');
    expect(codes).not.toContain('tuesday');

    const monday = tps.find((t) => t.weekdays[0].weekday_code === 'monday')!;
    expect(monday.closed).toBe(false);
    expect(monday.time_frames).toHaveLength(0);

    const wednesday = tps.find((t) => t.weekdays[0].weekday_code === 'wednesday')!;
    expect(wednesday.time_frames).toHaveLength(1);
  });
});

function openingsFor(periods: unknown[]) {
  const detail = {
    id: 'OBJ0001',
    name: 'Test',
    raw: { opening_times: { periods_current: periods, periods_next_year: [] } },
  } as unknown as ObjectDetail;
  return parseObjectWorkspace(detail, ['fr']).openings;
}

describe('parser — open without hours', () => {
  test('weekday_slots [] => open day kept (one empty slot); closed days absent; timed day kept', () => {
    const m = openingsFor([
      { id: 'p1', all_years: true, weekday_slots: { monday: [], friday: [{ start: '09:00:00', end: '12:00:00' }] } },
    ]);
    const wd = m.periods[0].weekdays;
    expect(wd.find((w) => w.code === 'monday')?.slots).toEqual([{ start: '', end: '' }]);
    expect(wd.find((w) => w.code === 'tuesday')).toBeUndefined();
    expect((wd.find((w) => w.code === 'friday')?.slots.length ?? 0)).toBeGreaterThan(0);
  });

  test('round-trip: parsed open-no-hours day re-emits as closed:false + empty time_frames', () => {
    const m = openingsFor([{ id: 'p2', all_years: true, weekday_slots: { monday: [] } }]);
    const out = buildOpeningsPayload(m.periods);
    const tps = timePeriodsOf(out);
    const monday = tps.find((t) => t.weekdays[0].weekday_code === 'monday')!;
    expect(monday.closed).toBe(false);
    expect(monday.time_frames).toHaveLength(0);
  });
});
