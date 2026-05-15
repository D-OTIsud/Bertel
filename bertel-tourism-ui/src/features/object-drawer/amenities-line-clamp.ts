export type LineClampMeasure = {
  visibleCount: number;
  hasOverflow: boolean;
};

/** Count flex/grid children that sit on the first visual row (offsetTop within 1px). */
export function getFirstLineChildCount(container: HTMLElement | null): LineClampMeasure {
  if (!container) {
    return { visibleCount: 0, hasOverflow: false };
  }

  const children = Array.from(container.children) as HTMLElement[];
  if (children.length === 0) {
    return { visibleCount: 0, hasOverflow: false };
  }

  const firstTop = children[0]!.offsetTop;
  let visibleCount = 0;

  for (const child of children) {
    if (child.offsetTop > firstTop + 1) {
      break;
    }
    visibleCount += 1;
  }

  if (visibleCount === 0) {
    visibleCount = children.length;
  }

  return {
    visibleCount,
    hasOverflow: visibleCount < children.length,
  };
}

export type AmenitiesLineClampState = {
  featureVisibleCount: number;
  chipVisibleCount: number;
  showToggle: boolean;
};

export function measureAmenitiesLineClamp(
  featureContainer: HTMLElement | null,
  chipContainer: HTMLElement | null,
): AmenitiesLineClampState {
  const feature = getFirstLineChildCount(featureContainer);
  const chip = getFirstLineChildCount(chipContainer);

  return {
    featureVisibleCount: feature.visibleCount,
    chipVisibleCount: chip.visibleCount,
    showToggle: feature.hasOverflow || chip.hasOverflow,
  };
}
