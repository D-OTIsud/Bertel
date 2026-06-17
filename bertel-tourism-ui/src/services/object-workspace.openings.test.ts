import { buildOpeningsPayload } from './object-workspace';
import type { ObjectWorkspaceOpeningPeriod } from './object-workspace-parser';

const p = (o: Partial<ObjectWorkspaceOpeningPeriod>): ObjectWorkspaceOpeningPeriod => ({
  recordId: null, order: '1', bucket: 'current', label: '', seasonTypeCode: '',
  startDate: '', endDate: '', allYears: true, recurrence: 'always', isClosure: false,
  closedDays: [], weekdays: [], ...o,
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
