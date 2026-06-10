import { fromReunionInputValue, toReunionInputValue } from './fma-datetime';

// §48 — Réunion wall-clock convention (fixed UTC+4): display and persistence are
// machine-timezone-independent because stored values always carry an explicit offset.
describe('fma-datetime (Réunion wall-clock, UTC+4)', () => {
  it('displays a stored UTC instant in Réunion local time', () => {
    expect(toReunionInputValue('2026-07-14T14:00:00+00:00')).toBe('2026-07-14T18:00');
  });

  it('round-trips an editor-entered local time', () => {
    const stored = fromReunionInputValue('2026-07-14T18:00');
    expect(stored).toBe('2026-07-14T18:00:00+04:00');
    expect(toReunionInputValue(stored)).toBe('2026-07-14T18:00');
  });

  it('passes empty values through', () => {
    expect(toReunionInputValue('')).toBe('');
    expect(fromReunionInputValue('')).toBe('');
  });
});
