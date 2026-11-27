import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { ResultsList } from './ResultsList';
import { useExplorerStore } from '../../store/explorer-store';
import { useExplorerMapPreviewStore } from '../../store/explorer-map-preview-store';
import { useUiStore } from '../../store/ui-store';
import type { ObjectCard } from '../../types/domain';

const noSelectionCards: ObjectCard[] = [];
jest.mock('../../hooks/useExplorerQueries', () => ({
  usePrefetchObjectDetail: () => () => () => {},
  useExplorerSelectionCardsQuery: () => ({ data: noSelectionCards, isFetching: false }),
}));
jest.mock('../../utils/fly-to-selection', () => ({ flyStarToSelection: jest.fn() }));

function card(id: string): ObjectCard {
  return {
    id,
    type: 'HLO',
    name: `Fiche ${id}`,
    open_now: true,
    location: { city: 'Entre-Deux', lat: -21.25, lon: 55.47 },
    labels: [],
    tagChips: [],
  } as ObjectCard;
}

function result(id: string): HTMLElement {
  const element = document.getElementById(`result-card-${id}`);
  if (!element) throw new Error(`Missing result ${id}`);
  return element;
}

function advance(ms: number) {
  act(() => jest.advanceTimersByTime(ms));
}

function preview() {
  return useExplorerMapPreviewStore.getState().preview;
}

describe('ResultsList — map preview intent', () => {
  const originalElementFromPoint = Object.getOwnPropertyDescriptor(document, 'elementFromPoint');

  beforeEach(() => {
    jest.useFakeTimers();
    sessionStorage.clear();
    useExplorerStore.setState({ selectedObjectIds: [], selectedCardId: null, hoveredCardId: null, visibleObjectIds: [] });
    useExplorerMapPreviewStore.setState({ preview: null });
    useUiStore.setState({ drawerObjectId: null });
  });

  afterEach(() => {
    cleanup();
    jest.clearAllTimers();
    jest.useRealTimers();
    if (originalElementFromPoint) Object.defineProperty(document, 'elementFromPoint', originalElementFromPoint);
    else delete (document as unknown as { elementFromPoint?: unknown }).elementFromPoint;
  });

  it('opens only after 1 second of sustained interest without changing the selected card', () => {
    render(<ResultsList cards={[card('a')]} loading={false} />);
    fireEvent.mouseEnter(result('a'));
    advance(999);
    expect(preview()).toBeNull();
    advance(1);
    expect(preview()).toMatchObject({ card: { id: 'a' }, source: 'hover' });
    expect(useExplorerStore.getState().selectedCardId).toBeNull();
    expect(useUiStore.getState().drawerObjectId).toBeNull();
  });

  it('cancels a brief pass and starts a fresh delay on the next result', () => {
    render(<ResultsList cards={[card('a'), card('b')]} loading={false} />);
    fireEvent.mouseEnter(result('a'));
    advance(800);
    fireEvent.mouseLeave(result('a'));
    advance(1000);
    expect(preview()).toBeNull();
    fireEvent.mouseEnter(result('a'));
    advance(600);
    fireEvent.mouseLeave(result('a'));
    fireEvent.mouseEnter(result('b'));
    advance(999);
    expect(preview()).toBeNull();
    advance(1);
    expect(preview()?.card.id).toBe('b');
  });

  it('waits a full second after the final scroll event', () => {
    render(<ResultsList cards={[card('a')]} loading={false} />);
    const root = result('a').parentElement!;
    fireEvent.mouseEnter(result('a'));
    advance(900);
    fireEvent.scroll(root);
    advance(600);
    fireEvent.scroll(root);
    advance(999);
    expect(preview()).toBeNull();
    advance(1);
    expect(preview()?.card.id).toBe('a');
    fireEvent.scroll(root);
    expect(preview()).toBeNull();
  });

  it('resolves the new result under an unmoving pointer after scrolling', () => {
    render(<ResultsList cards={[card('a'), card('b')]} loading={false} />);
    fireEvent.mouseEnter(result('a'));
    fireEvent.mouseMove(result('a'), { clientX: 120, clientY: 200 });
    advance(800);
    const hitTest = jest.fn(() => result('b').querySelector('strong') ?? result('b'));
    Object.defineProperty(document, 'elementFromPoint', { value: hitTest, configurable: true });
    fireEvent.scroll(result('a').parentElement!);
    advance(1000);
    expect(hitTest).toHaveBeenCalledWith(120, 200);
    expect(preview()?.card.id).toBe('b');
    fireEvent.mouseLeave(result('b'));
    expect(preview()).toBeNull();
  });

  it('keeps tracking the pointer when scrolling leaves a card before entering the next one', () => {
    render(<ResultsList cards={[card('a'), card('b')]} loading={false} />);
    const root = result('a').parentElement!;
    fireEvent.mouseEnter(result('a'));
    fireEvent.mouseMove(result('a'), { clientX: 120, clientY: 200 });
    advance(800);
    // The browser can emit leave(A) without an enter(B) while the pointer stays in the list.
    fireEvent.mouseLeave(result('a'), { relatedTarget: root });
    Object.defineProperty(document, 'elementFromPoint', {
      value: jest.fn(() => result('b')),
      configurable: true,
    });
    fireEvent.scroll(root);
    advance(999);
    expect(preview()).toBeNull();
    advance(1);
    expect(preview()?.card.id).toBe('b');
    fireEvent.mouseLeave(root, { relatedTarget: document.body });
    advance(1000);
    expect(preview()).toBeNull();
  });

  it('does not open for a result removed while its delay is pending', () => {
    const { rerender } = render(<ResultsList cards={[card('a'), card('b')]} loading={false} />);
    fireEvent.mouseEnter(result('a'));
    advance(900);
    rerender(<ResultsList cards={[card('b')]} loading={false} />);
    advance(1000);
    expect(preview()).toBeNull();
  });

  it('does not open for a card hidden by collapsing its result section', () => {
    const labelled = { ...card('a'), label_match: { scheme_code: 'LBL_CLEF_VERTE', rank: 0, source: 'certified_label', evidence_count: 1 } } as ObjectCard;
    const equivalent = { ...card('b'), label_match: { scheme_code: 'LBL_CLEF_VERTE', rank: 1, source: 'sustainability_action', evidence_count: 1 } } as ObjectCard;
    render(<ResultsList cards={[labelled, equivalent]} loading={false} labelRankCounts={{ labelled: 1, equivalent: 1 }} />);
    fireEvent.mouseEnter(result('a'));
    advance(900);
    fireEvent.click(screen.getByText(/Établissements labellisés/).closest('button')!);
    expect(document.getElementById('result-card-a')).toBeNull();
    advance(1000);
    expect(preview()).toBeNull();
  });

  it('also opens after keyboard focus and preserves interest across controls in the card', () => {
    render(<ResultsList cards={[card('a')]} loading={false} />);
    const root = result('a');
    fireEvent.focus(root);
    advance(300);
    const star = within(root).getByRole('button', { name: 'Ajouter a la selection' });
    fireEvent.blur(root, { relatedTarget: star });
    fireEvent.focus(star, { relatedTarget: root });
    advance(699);
    expect(preview()).toBeNull();
    advance(1);
    expect(preview()?.card.id).toBe('a');
    fireEvent.blur(star, { relatedTarget: document.body });
    expect(preview()).toBeNull();
  });

  it('previews an addition immediately and keeps nested keyboard activation out of the drawer', () => {
    render(<ResultsList cards={[card('a')]} loading={false} />);
    const root = result('a');
    const star = within(root).getByRole('button', { name: 'Ajouter a la selection' });
    fireEvent.keyDown(star, { key: 'Enter' });
    expect(useUiStore.getState().drawerObjectId).toBeNull();
    fireEvent.click(star);
    expect(preview()).toMatchObject({ card: { id: 'a' }, source: 'selection' });
    expect(useExplorerStore.getState().selectedObjectIds).toEqual(['a']);
    expect(useExplorerStore.getState().selectedCardId).toBeNull();
    expect(useUiStore.getState().drawerObjectId).toBeNull();
    fireEvent.mouseLeave(root);
    advance(1000);
    expect(preview()?.source).toBe('selection');
  });

  it('cancels a pending preview when the list unmounts', () => {
    const { unmount } = render(<ResultsList cards={[card('a')]} loading={false} />);
    fireEvent.mouseEnter(result('a'));
    advance(900);
    unmount();
    advance(1000);
    expect(preview()).toBeNull();
  });
});
