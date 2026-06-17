import {
  addClosedWeekday,
  classifyClosedDay,
  createPeriodDraft,
  isValidIsoDate,
  OPENING_WEEKDAYS,
  validatePeriodDraft,
} from './opening-period-edit';
import type { ObjectWorkspaceOpeningPeriod } from '../../../services/object-workspace-parser';

function draft(patch: Partial<ObjectWorkspaceOpeningPeriod> = {}): ObjectWorkspaceOpeningPeriod {
  return { ...createPeriodDraft(0), ...patch };
}

describe('createPeriodDraft', () => {
  it('returns a blank current-bucket all-year period with 7 empty weekdays', () => {
    const period = createPeriodDraft(2);
    expect(period.recordId).toBeNull();
    expect(period.order).toBe('3');
    expect(period.bucket).toBe('current');
    expect(period.label).toBe('');
    expect(period.seasonTypeCode).toBe('');
    expect(period.allYears).toBe(true);
    expect(period.startDate).toBe('');
    expect(period.endDate).toBe('');
    expect(period.closedDays).toEqual([]);
    expect(period.weekdays).toHaveLength(7);
    expect(period.weekdays.map((w) => w.code)).toEqual(OPENING_WEEKDAYS.map((w) => w.code));
    expect(period.weekdays.every((w) => w.slots.length === 0)).toBe(true);
  });
});

describe('classifyClosedDay', () => {
  it('canonicalizes a French weekday alias to its code + French label', () => {
    expect(classifyClosedDay('lun')).toEqual({ kind: 'weekday', code: 'monday', label: 'Lundi', raw: 'lun' });
  });

  it('recognizes a canonical English weekday code', () => {
    expect(classifyClosedDay('monday')).toEqual({ kind: 'weekday', code: 'monday', label: 'Lundi', raw: 'monday' });
  });

  it('classifies an ISO date with a French display label', () => {
    expect(classifyClosedDay('2026-12-25')).toEqual({
      kind: 'date',
      iso: '2026-12-25',
      label: '25/12/2026',
      raw: '2026-12-25',
    });
  });

  it('flags an unrecognized token as unknown', () => {
    expect(classifyClosedDay('xyz')).toEqual({ kind: 'unknown', label: 'xyz', raw: 'xyz' });
  });
});

describe('addClosedWeekday', () => {
  it('appends the canonical weekday code', () => {
    expect(addClosedWeekday([], 'monday')).toEqual(['monday']);
  });

  it('dedupes against an existing alias of the same day', () => {
    // 'lun' already present canonicalizes to monday → adding monday is a no-op
    expect(addClosedWeekday(['lun'], 'monday')).toEqual(['lun']);
  });
});

describe('isValidIsoDate', () => {
  it.each([
    ['2026-12-25', true],
    ['2026-01-01', true],
    ['2026-13-01', false],
    ['2026-12-40', false],
    ['2026-2-3', false],
    ['25/12/2026', false],
    ['', false],
  ])('isValidIsoDate(%s) === %s', (value, expected) => {
    expect(isValidIsoDate(value as string)).toBe(expected);
  });
});

describe('validatePeriodDraft', () => {
  // The period TYPE is no longer required for saving — the Récurrence mode drives the gate.
  it('allows save for an always-year period (no type, no dates)', () => {
    const result = validatePeriodDraft(draft({ seasonTypeCode: '', recurrence: 'always' }));
    expect(result.canSave).toBe(true);
    expect(result.dateError).toBeNull();
  });

  it('allows save for a typeless dated period (type optional)', () => {
    const result = validatePeriodDraft(
      draft({ seasonTypeCode: '', recurrence: 'fixed', startDate: '2026-06-01', endDate: '2026-09-01' }),
    );
    expect(result.canSave).toBe(true);
    expect(result.dateError).toBeNull();
  });

  it('requires both dates for a cyclic period', () => {
    const result = validatePeriodDraft(
      draft({ recurrence: 'cyclic', startDate: '2000-06-01', endDate: '' }),
    );
    expect(result.canSave).toBe(false);
    expect(result.dateError).toMatch(/début et la fin/i);
  });

  it('requires both dates for a fixed period', () => {
    const result = validatePeriodDraft(
      draft({ recurrence: 'fixed', startDate: '2026-06-01', endDate: '' }),
    );
    expect(result.canSave).toBe(false);
    expect(result.dateError).toMatch(/début et la fin/i);
  });

  it('rejects a fixed end date before the start date', () => {
    const result = validatePeriodDraft(
      draft({ recurrence: 'fixed', startDate: '2026-09-01', endDate: '2026-06-01' }),
    );
    expect(result.canSave).toBe(false);
    expect(result.dateError).toMatch(/postérieure/i);
  });

  it('allows a cyclic range that wraps the year (end month-day before start)', () => {
    // Cyclic ranges legitimately wrap (e.g. Nov→Feb); chronological order is NOT enforced.
    const result = validatePeriodDraft(
      draft({ recurrence: 'cyclic', startDate: '2000-11-01', endDate: '2000-02-28' }),
    );
    expect(result.canSave).toBe(true);
    expect(result.dateError).toBeNull();
  });

  it('allows a coherent fixed dated period', () => {
    const result = validatePeriodDraft(
      draft({ recurrence: 'fixed', startDate: '2026-06-01', endDate: '2026-09-01' }),
    );
    expect(result.canSave).toBe(true);
    expect(result.dateError).toBeNull();
  });
});
