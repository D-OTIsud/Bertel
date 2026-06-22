import { isInsideCorridor, metersToTrack, nearestOnTrack } from './corridor';

// An east-west trace near the equator-ish latitude -21 (0.001° lat ≈ 111 m).
const LINE: number[][] = [[55.50, -21, 100], [55.53, -21, 200]];

describe('metersToTrack', () => {
  it('is ~0 for a point on the trace', () => {
    expect(metersToTrack(55.515, -21, LINE)).toBeLessThan(1);
  });

  it('is ~111 m for a point 0.001° north of the trace', () => {
    const d = metersToTrack(55.515, -20.999, LINE);
    expect(d).toBeGreaterThan(100);
    expect(d).toBeLessThan(125);
  });

  it('returns Infinity for a degenerate (single-point) line', () => {
    expect(metersToTrack(55.5, -21, [[55.5, -21]])).toBe(Infinity);
  });
});

describe('isInsideCorridor', () => {
  it('rejects a point ~111 m away when the corridor is 50 m, accepts it at 150 m', () => {
    expect(isInsideCorridor(55.515, -20.999, LINE, 50)).toBe(false);
    expect(isInsideCorridor(55.515, -20.999, LINE, 150)).toBe(true);
  });

  it('accepts a point on the trace at any width', () => {
    expect(isInsideCorridor(55.515, -21, LINE, 50)).toBe(true);
  });
});

describe('nearestOnTrack', () => {
  it('snaps an off-trace point back onto the line (latitude ~-21)', () => {
    const [lng, lat] = nearestOnTrack(55.515, -20.999, LINE);
    expect(lng).toBeCloseTo(55.515, 2);
    expect(lat).toBeCloseTo(-21, 3);
  });
});
