import { dateInputOffset } from './crm-date-input';

describe('CRM local calendar date shortcuts', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it.each([
    [2026, 0, 31, 1, '2026-02-01'],
    [2024, 1, 28, 1, '2024-02-29'],
    [2024, 1, 28, 2, '2024-03-01'],
    [2026, 11, 31, 1, '2027-01-01'],
    [2026, 11, 28, 7, '2027-01-04'],
    [2026, 0, 1, -1, '2025-12-31'],
  ])('keeps local calendar rollover from %i/%i/%i with offset %i', (year, month, day, offset, expected) => {
    const now = new Date(year, month, day, 23, 45);
    jest.setSystemTime(now);
    expect(dateInputOffset(offset)).toBe(expected);
    expect(Date.now()).toBe(now.getTime());
  });

  it('reads the clock on each call and retains the current local day for zero offsets', () => {
    jest.setSystemTime(new Date(2026, 9, 29, 0, 15));
    expect(dateInputOffset(0)).toBe('2026-10-29');
    expect(dateInputOffset(-0)).toBe('2026-10-29');
    jest.setSystemTime(new Date(2026, 9, 30, 0, 15));
    expect(dateInputOffset(0)).toBe('2026-10-30');
  });

  it.each([NaN, Infinity, -Infinity])('preserves invalid-date text for non-finite offsets: %p', (offset) => {
    jest.setSystemTime(new Date(2026, 9, 29));
    expect(dateInputOffset(offset)).toBe('NaN-NaN-NaN');
  });
});
