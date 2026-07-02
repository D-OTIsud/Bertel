import { buildClusterCompositionGradient } from './cluster-composition';
import { defaultMarkerStyles } from '../../config/map-markers';

const HOT = defaultMarkerStyles.HOT.color;
const RES = defaultMarkerStyles.RES.color;
const ITI = defaultMarkerStyles.ITI.color;

describe('buildClusterCompositionGradient', () => {
  test('returns null when there is no resolvable composition', () => {
    expect(buildClusterCompositionGradient({})).toBeNull();
    expect(buildClusterCompositionGradient({ HOT: 0 })).toBeNull();
  });

  test('mono-type cluster renders a single full-sweep stop (solid disc)', () => {
    expect(buildClusterCompositionGradient({ HOT: 5 })).toBe(`conic-gradient(${HOT} 0% 100%)`);
  });

  test('splits proportionally, always in legend order regardless of input order', () => {
    // HOT (legend-first) = 3/4 → 0–75 %, then RES = 1/4 → 75–100 %.
    expect(buildClusterCompositionGradient({ RES: 1, HOT: 3 })).toBe(
      `conic-gradient(${HOT} 0% 75%, ${RES} 75% 100%)`,
    );
  });

  test('three types sum to 100% with legend ordering (HOT, RES, ITI)', () => {
    // 2 HOT + 1 RES + 1 ITI over 4 → 50 / 25 / 25.
    expect(buildClusterCompositionGradient({ ITI: 1, RES: 1, HOT: 2 })).toBe(
      `conic-gradient(${HOT} 0% 50%, ${RES} 50% 75%, ${ITI} 75% 100%)`,
    );
  });

  test('ignores unknown and empty type keys', () => {
    expect(buildClusterCompositionGradient({ HOT: 1, '': 3, ZZ: 9 })).toBe(
      `conic-gradient(${HOT} 0% 100%)`,
    );
  });
});
