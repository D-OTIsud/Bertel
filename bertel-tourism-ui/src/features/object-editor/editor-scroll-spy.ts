/** Distance from the top of `.edit-main` used to pick the active nav section. */
export const EDITOR_SCROLL_SPY_OFFSET_PX = 120;

/**
 * Returns the last section (in DOM order) whose top edge has crossed the activation line.
 * This avoids flicker when a tall previous section (e.g. Contacts) still intersects the viewport.
 */
export function resolveActiveSectionNum(
  sectionNodes: readonly HTMLElement[],
  scrollRootTop: number,
  offsetPx = EDITOR_SCROLL_SPY_OFFSET_PX,
): string | null {
  const line = scrollRootTop + offsetPx;
  let active: string | null = null;

  for (const node of sectionNodes) {
    if (node.getBoundingClientRect().top <= line) {
      active = node.getAttribute('data-section');
    }
  }

  return active;
}
