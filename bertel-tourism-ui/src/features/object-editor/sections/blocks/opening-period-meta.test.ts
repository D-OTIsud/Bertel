import { formatPeriodRange } from './opening-period-meta';
import type { ObjectWorkspaceOpeningPeriod } from '../../../../services/object-workspace-parser';

const p = (o: Partial<ObjectWorkspaceOpeningPeriod>): ObjectWorkspaceOpeningPeriod => ({
  recordId: null, order: '1', bucket: 'current', label: '', seasonTypeCode: '',
  startDate: '', endDate: '', allYears: true, recurrence: 'always', isClosure: false,
  closedDays: [], weekdays: [], ...o,
});

describe('formatPeriodRange', () => {
  test('always => Toute l’année', () => {
    expect(formatPeriodRange(p({ recurrence: 'always' }))).toBe('Toute l’année');
  });
  test('cyclic => month range WITHOUT a year', () => {
    const label = formatPeriodRange(p({ recurrence: 'cyclic', allYears: true, startDate: '2000-05-01', endDate: '2000-09-30' }));
    expect(label).toMatch(/mai/i);
    expect(label).toMatch(/septembre/i);
    expect(label).not.toMatch(/2000/);
  });
  test('fixed => full date range', () => {
    const label = formatPeriodRange(p({ recurrence: 'fixed', allYears: false, startDate: '2025-01-15', endDate: '2025-12-15' }));
    expect(label).toMatch(/→/);
  });
});
