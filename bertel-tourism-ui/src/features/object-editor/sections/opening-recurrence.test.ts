import {
  OPENING_CYCLIC_SENTINEL_YEAR,
  encodeCyclicDate, encodeCyclicRange, decodeCyclicMonthDay,
  decodeCyclicFields, encodeCyclicFields, EMPTY_CYCLIC_FIELDS,
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
  test('encodeCyclicRange clamps an impossible day to the month last day', () => {
    expect(encodeCyclicRange(2, 31, 2, 31).startDate).toBe('2000-02-29'); // 2000 is leap
    expect(encodeCyclicRange(2, 31, 2, 31).endDate).toBe('2000-02-29');
  });
});

describe('cyclic picker fields (modal state)', () => {
  test('a lone start month encodes nothing yet, but the pick is preserved as fields', () => {
    const fields = { ...EMPTY_CYCLIC_FIELDS, startMonth: '5' };
    expect(encodeCyclicFields(fields)).toEqual({ startDate: '', endDate: '' });
    expect(fields.startMonth).toBe('5'); // the field state itself keeps the chosen month
  });
  test('both months default the days (start→1, end→last real day)', () => {
    expect(encodeCyclicFields({ startMonth: '5', startDay: '', endMonth: '9', endDay: '' }))
      .toEqual({ startDate: '2000-05-01', endDate: '2000-09-30' });
    expect(encodeCyclicFields({ startMonth: '2', startDay: '', endMonth: '2', endDay: '' }))
      .toEqual({ startDate: '2000-02-01', endDate: '2000-02-29' }); // 2000 is leap
  });
  test('explicit days are honoured and clamped', () => {
    expect(encodeCyclicFields({ startMonth: '6', startDay: '10', endMonth: '8', endDay: '20' }))
      .toEqual({ startDate: '2000-06-10', endDate: '2000-08-20' });
  });
  test('decode round-trips an encoded range back to picker strings', () => {
    expect(decodeCyclicFields('2000-05-01', '2000-09-30'))
      .toEqual({ startMonth: '5', startDay: '1', endMonth: '9', endDay: '30' });
    expect(decodeCyclicFields('', '')).toEqual(EMPTY_CYCLIC_FIELDS);
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
  test('two identical cyclic windows => conflict (true)', () => {
    const a = base({ startDate: '2000-05-01', endDate: '2000-09-30' });
    const b = base({ startDate: '2000-05-01', endDate: '2000-09-30' });
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
