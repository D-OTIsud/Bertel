import { render } from '@testing-library/react';
import type { ObjectCard } from '../../types/domain';
import { ResultCardView } from './ResultCardView';

/**
 * Regression guard for the "expanded card spills onto the next card" bug.
 *
 * The card is a flex child of the Explorer results scroll list
 * (`ResultsList.tsx` -> `flex flex-col gap-2 overflow-y-auto`). When that list
 * overflows (the common case), flexbox distributes negative free space across
 * its children. Setting an explicit `min-h-[116px]` on the expanded card
 * OVERRIDES the flex default `min-height: auto`, which would otherwise hold the
 * item at its content size — so flexbox is free to shrink the card BELOW its
 * wrapped-chip content, and the overflowing chips paint over the next card.
 *
 * Proven in an isolated browser repro: without `shrink-0` the expanded card box
 * measured 138px while its content needed 169px (31px spill); with `shrink-0`
 * the box grew to 191px and fully contained the content.
 *
 * jsdom does no layout (all element widths are 0, so the fit/"+N" measurement
 * can't run), hence this asserts the structural contract — the card must never
 * be shrinkable by its flex parent — rather than the rendered geometry.
 */

function makeCard(overrides: Partial<ObjectCard> = {}): ObjectCard {
  return {
    id: 'o1',
    type: 'HLO',
    name: 'A RaNd O',
    open_now: true,
    location: { city: 'Entre-Deux' },
    labels: [],
    tagChips: [],
    ...overrides,
  } as ObjectCard;
}

describe('ResultCardView', () => {
  it('never lets the flex scroll list shrink the card below its content (shrink-0 on the root)', () => {
    render(<ResultCardView card={makeCard()} domId="card-shrink" onOpen={() => {}} />);
    const root = document.getElementById('card-shrink');
    expect(root).not.toBeNull();
    expect(root?.classList.contains('shrink-0')).toBe(true);
  });

  it('keeps the shrink-0 contract for the inert §09 preview card too', () => {
    render(<ResultCardView card={makeCard()} domId="card-inert" interactive={false} />);
    const root = document.getElementById('card-inert');
    expect(root?.classList.contains('shrink-0')).toBe(true);
  });
});
