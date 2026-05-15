import { getFirstLineChildCount, measureAmenitiesLineClamp } from './amenities-line-clamp';

function mockChild(offsetTop: number): HTMLElement {
  return { offsetTop } as HTMLElement;
}

function mockContainer(children: HTMLElement[]): HTMLElement {
  return { children } as unknown as HTMLElement;
}

describe('amenities-line-clamp', () => {
  it('returns full count when every child is on the first row', () => {
    const container = mockContainer([mockChild(0), mockChild(0), mockChild(0)]);
    expect(getFirstLineChildCount(container)).toEqual({
      visibleCount: 3,
      hasOverflow: false,
    });
  });

  it('detects overflow when a child wraps to a second row', () => {
    const container = mockContainer([mockChild(10), mockChild(10), mockChild(42)]);
    expect(getFirstLineChildCount(container)).toEqual({
      visibleCount: 2,
      hasOverflow: true,
    });
  });

  it('shows toggle when either featured cards or chips overflow', () => {
    const feature = mockContainer([mockChild(0), mockChild(40)]);
    const chip = mockContainer([mockChild(0), mockChild(0)]);

    expect(measureAmenitiesLineClamp(feature, chip)).toEqual({
      featureVisibleCount: 1,
      chipVisibleCount: 2,
      showToggle: true,
    });
  });
});
