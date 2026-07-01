import { fireEvent, render, screen } from '@testing-library/react';
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

  it('renders a colored tag as a filter button and toggles the tag without opening the card', () => {
    const onToggleTag = jest.fn();
    const onOpen = jest.fn();
    // One tag, no neutral labels → the row never overflows (single chip stays visible in jsdom).
    render(
      <ResultCardView
        card={makeCard({ labels: [], tagChips: [{ label: 'Bien-être', color: '#ec4899', slug: 'wellness' }] })}
        onOpen={onOpen}
        onToggleTag={onToggleTag}
      />,
    );

    const btn = screen.getByRole('button', { name: 'Filtrer par le tag Bien-être' });
    fireEvent.click(btn);

    expect(onToggleTag).toHaveBeenCalledWith({ slug: 'wellness', name: 'Bien-être', color: '#ec4899' });
    // The tag click must not bubble to the card's open handler.
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('renders the type as inline text with the map-legend picto, not a colored pill', () => {
    render(<ResultCardView card={makeCard({ type: 'RES', name: 'Resto Test' })} domId="card-type" onOpen={() => {}} />);

    // The type label sits on a span carrying its own title (used as the tooltip).
    const typeSpan = screen.getByTitle('Restaurant');
    expect(typeSpan.textContent).toContain('Restaurant');

    // The old design wrapped the type in a `.type-pill` blob — the new one drops it.
    expect(typeSpan.classList.contains('type-pill')).toBe(false);

    // It carries the type picto (the same glyph as MapLegend), shown inline like the commune icon.
    expect(typeSpan.querySelector('svg')).not.toBeNull();
  });

  it('keeps tags inert (no filter button) in the non-interactive §09 preview', () => {
    render(
      <ResultCardView
        card={makeCard({ labels: [], tagChips: [{ label: 'Bien-être', color: '#ec4899', slug: 'wellness' }] })}
        interactive={false}
        onToggleTag={() => {}}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Filtrer par le tag Bien-être' })).toBeNull();
  });

  // Pastille « ouvert/fermé » — tri-état piloté par open_now (§128), pour TOUS les types.
  describe('open/closed pill (open_now tri-state)', () => {
    it('shows "Ouvert" when open_now === true', () => {
      render(<ResultCardView card={makeCard({ open_now: true })} domId="pill-open" onOpen={() => {}} />);
      expect(screen.getByTitle('Ouvert')).toBeInTheDocument();
      expect(screen.queryByTitle('Fermé')).toBeNull();
    });

    it('shows "Fermé" when open_now === false', () => {
      render(<ResultCardView card={makeCard({ open_now: false })} domId="pill-closed" onOpen={() => {}} />);
      expect(screen.getByTitle('Fermé')).toBeInTheDocument();
      expect(screen.queryByTitle('Ouvert')).toBeNull();
    });

    it('shows NO pill when open_now is null (no opening data)', () => {
      render(<ResultCardView card={makeCard({ open_now: null })} domId="pill-null" onOpen={() => {}} />);
      expect(screen.queryByTitle('Ouvert')).toBeNull();
      expect(screen.queryByTitle('Fermé')).toBeNull();
    });

    it('shows NO pill when open_now is undefined (absent)', () => {
      const card = makeCard();
      delete (card as { open_now?: unknown }).open_now;
      render(<ResultCardView card={card} domId="pill-undef" onOpen={() => {}} />);
      expect(screen.queryByTitle('Ouvert')).toBeNull();
      expect(screen.queryByTitle('Fermé')).toBeNull();
    });

    it('drives the pill by data for ALL types — a VIS/PNA object with open_now shows "Ouvert"', () => {
      render(<ResultCardView card={makeCard({ type: 'PNA', open_now: true })} domId="pill-alltypes" onOpen={() => {}} />);
      expect(screen.getByTitle('Ouvert')).toBeInTheDocument();
    });
  });
});
