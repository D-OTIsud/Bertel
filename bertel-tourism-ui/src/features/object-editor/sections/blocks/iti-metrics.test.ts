import { formatDurationShort, stepMetric } from './iti-metrics';

describe('stepMetric', () => {
  it('increments a decimal field and keeps precision (no float artifacts)', () => {
    expect(stepMetric('8.5', 1, { step: 0.5, decimals: 1 })).toBe('9.0');
    expect(stepMetric('0.1', 1, { step: 0.2, decimals: 1 })).toBe('0.3');
  });

  it('decrements and clamps at the minimum (no negatives)', () => {
    expect(stepMetric('0.5', -1, { step: 0.5, decimals: 1 })).toBe('0.0');
    expect(stepMetric('0', -1, { step: 10 })).toBe('0');
    expect(stepMetric('5', -1, { step: 10 })).toBe('0');
  });

  it('steps integer fields (elevation, duration) without decimals', () => {
    expect(stepMetric('420', 1, { step: 10 })).toBe('430');
    expect(stepMetric('120', -1, { step: 15 })).toBe('105');
  });

  it('treats empty / non-numeric current values as the minimum', () => {
    expect(stepMetric('', 1, { step: 0.5, decimals: 1 })).toBe('0.5');
    expect(stepMetric(null, 1, { step: 10 })).toBe('10');
    expect(stepMetric('abc', 1, { step: 5 })).toBe('5');
  });

  it('accepts a comma decimal separator', () => {
    expect(stepMetric('8,5', 1, { step: 0.5, decimals: 1 })).toBe('9.0');
  });
});

describe('formatDurationShort', () => {
  it('formats hours and minutes', () => {
    expect(formatDurationShort(180)).toBe('3 h');
    expect(formatDurationShort(195)).toBe('3 h 15');
    expect(formatDurationShort(45)).toBe('45 min');
    expect(formatDurationShort('120')).toBe('2 h');
  });

  it('returns a dash for empty / zero / invalid', () => {
    expect(formatDurationShort(0)).toBe('—');
    expect(formatDurationShort(null)).toBe('—');
    expect(formatDurationShort('')).toBe('—');
  });
});
