import {
  OPENING_CYCLIC_SENTINEL_YEAR,
  encodeCyclicDate, decodeCyclicMonthDay,
  periodRank,
  periodsPartialOverlap, findPeriodConflicts,
  type RecurrencePeriod,
} from './opening-recurrence';

const base = (o: Partial<RecurrencePeriod>): RecurrencePeriod => ({
  recurrence: 'cyclic', isClosure: false, startDate: '', endDate: '', label: '', ...o,
});

describe('cyclic sentinel encoding', () => {
  test('encodes month+day in sentinel year, no wrap', () => {
    expect(encodeCyclicDate(5, 1)).toBe('2000-05-01');
    expect(encodeCyclicDate(9, 30)).toBe('2000-09-30');
  });
  test('sentinel year constant is 2000', () => {
    expect(OPENING_CYCLIC_SENTINEL_YEAR).toBe(2000);
  });
  test('decodes month/day ignoring year', () => {
    expect(decodeCyclicMonthDay('2000-05-01')).toEqual({ month: 5, day: 1 });
    expect(decodeCyclicMonthDay('2001-02-15')).toEqual({ month: 2, day: 15 });
  });
});

describe('rank', () => {
  test('closure > fixed > cyclic > base', () => {
    expect(periodRank(base({ isClosure: true }))).toBe(4);
    expect(periodRank(base({ recurrence: 'fixed', startDate: '2025-01-01', endDate: '2025-02-01' }))).toBe(3);
    expect(periodRank(base({ recurrence: 'cyclic', startDate: '2000-05-01', endDate: '2000-09-30' }))).toBe(2);
    expect(periodRank(base({ recurrence: 'always' }))).toBe(1);
  });
});

describe('partial overlap (same layer)', () => {
  test('two cyclics crossing => true', () => {
    const a = base({ startDate: '2000-05-01', endDate: '2000-09-30' });
    const b = base({ startDate: '2000-08-01', endDate: '2000-10-31' });
    expect(periodsPartialOverlap(a, b)).toBe(true);
  });
  test('nested cyclic (containment) => false', () => {
    const a = base({ startDate: '2000-05-01', endDate: '2000-09-30' });
    const b = base({ startDate: '2000-08-01', endDate: '2000-08-15' });
    expect(periodsPartialOverlap(a, b)).toBe(false);
  });
  test('cyclic wrap dec->feb partially crossing feb->mar => true', () => {
    const a = base({ startDate: '2000-12-15', endDate: '2001-02-15' });
    const b = base({ startDate: '2000-02-01', endDate: '2000-03-31' });
    expect(periodsPartialOverlap(a, b)).toBe(true);
  });
  test('cyclic period fully inside a wrap window (containment) => false', () => {
    const a = base({ startDate: '2000-12-15', endDate: '2001-02-15' });
    const b = base({ startDate: '2000-01-01', endDate: '2000-01-31' });
    expect(periodsPartialOverlap(a, b)).toBe(false);
  });
  test('different rank never conflicts', () => {
    const a = base({ recurrence: 'fixed', startDate: '2025-06-01', endDate: '2025-08-01' });
    const b = base({ recurrence: 'cyclic', startDate: '2000-05-01', endDate: '2000-09-30' });
    expect(periodsPartialOverlap(a, b)).toBe(false);
  });
  test('fixed periods in different years never overlap', () => {
    const a = base({ recurrence: 'fixed', startDate: '2025-06-01', endDate: '2025-08-01' });
    const b = base({ recurrence: 'fixed', startDate: '2026-06-01', endDate: '2026-08-01' });
    expect(periodsPartialOverlap(a, b)).toBe(false);
  });
});

describe('findPeriodConflicts', () => {
  test('ignores closures and different ranks', () => {
    const candidate = base({ recurrence: 'fixed', startDate: '2025-06-01', endDate: '2025-08-01', label: 'Festival' });
    const existing = [
      base({ recurrence: 'cyclic', startDate: '2000-05-01', endDate: '2000-09-30', label: 'Haute' }),
      base({ isClosure: true, recurrence: 'fixed', startDate: '2025-06-10', endDate: '2025-06-12', label: 'Ferie' }),
    ];
    expect(findPeriodConflicts(candidate, existing)).toEqual([]);
  });
  test('flags same-rank partial overlap with the conflicting label', () => {
    const candidate = base({ recurrence: 'cyclic', startDate: '2000-08-01', endDate: '2000-10-31', label: 'Mi' });
    const existing = [base({ recurrence: 'cyclic', startDate: '2000-05-01', endDate: '2000-09-30', label: 'Haute' })];
    expect(findPeriodConflicts(candidate, existing).map((c) => c.label)).toEqual(['Haute']);
  });
});
