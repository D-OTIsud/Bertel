import { parseObjectWorkspace } from './object-workspace-parser';
import type { ObjectDetail } from '../types/domain';

function openingsFor(periods: unknown[]) {
  const detail: ObjectDetail = {
    id: 'OBJ0001',
    name: 'Test',
    raw: { opening_times: { periods_current: periods, periods_next_year: [] } },
  };
  return parseObjectWorkspace(detail, ['fr']).openings;
}

describe('openings recurrence parsing', () => {
  test('cyclic: all_years=true + dates => recurrence cyclic, not closure', () => {
    const m = openingsFor([
      { id: 'p1', all_years: true, is_closure: false, date_start: '2000-05-01', date_end: '2000-09-30', weekday_slots: {} },
    ]);
    expect(m.periods[0].recurrence).toBe('cyclic');
    expect(m.periods[0].isClosure).toBe(false);
  });

  test('fixed: all_years=false + dates => recurrence fixed', () => {
    const m = openingsFor([
      { id: 'p2', all_years: false, date_start: '2025-01-15', date_end: '2025-12-15', weekday_slots: {} },
    ]);
    expect(m.periods[0].recurrence).toBe('fixed');
  });

  test('always: all_years=true + no dates => recurrence always', () => {
    const m = openingsFor([{ id: 'p3', all_years: true, weekday_slots: {} }]);
    expect(m.periods[0].recurrence).toBe('always');
  });

  test('closure: is_closure=true => isClosure true', () => {
    const m = openingsFor([
      { id: 'p4', is_closure: true, all_years: false, date_start: '2025-12-25', date_end: '2025-12-25', weekday_slots: {} },
    ]);
    expect(m.periods[0].isClosure).toBe(true);
  });
});
