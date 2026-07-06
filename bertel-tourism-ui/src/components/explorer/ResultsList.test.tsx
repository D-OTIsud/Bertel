import { render, screen } from '@testing-library/react';
import { ResultsList } from './ResultsList';
import { useExplorerStore } from '../../store/explorer-store';
import { useUiStore } from '../../store/ui-store';
import type { ObjectCard } from '../../types/domain';

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

function renderResultsList(props: Partial<Parameters<typeof ResultsList>[0]> & { cards: ObjectCard[] }) {
  return render(<ResultsList loading={false} {...props} />);
}

describe('ResultsList', () => {
  beforeEach(() => {
    useExplorerStore.setState({ selectedObjectIds: [], selectedCardId: null, hoveredCardId: null });
    useUiStore.setState({ drawerObjectId: null });
  });

  it('renders one card per entry with no sections when no label rank data is present', () => {
    renderResultsList({ cards: [makeCard({ id: 'a' }), makeCard({ id: 'b' })] });
    expect(document.getElementById('result-card-a')).not.toBeNull();
    expect(document.getElementById('result-card-b')).not.toBeNull();
    expect(screen.queryByText(/Établissements labellisés/)).toBeNull();
  });

  it('renders labelled and equivalent section headers when the ranked-label filter surfaces both', () => {
    const cards = [
      makeCard({ id: 'lab', label_match: { scheme_code: 'LBL_CLEF_VERTE', rank: 0, source: 'certified_label', evidence_count: 1 } }),
      makeCard({ id: 'eq', label_match: { scheme_code: 'LBL_CLEF_VERTE', rank: 1, source: 'sustainability_action', evidence_count: 1 } }),
    ];
    renderResultsList({ cards, labelRankCounts: { labelled: 1, equivalent: 1 } });

    const labelled = screen.getByText(/Établissements labellisés/);
    const equivalent = screen.getByText(/Aussi pertinents — actions compatibles/);
    expect(labelled).toBeInTheDocument();
    expect(equivalent).toBeInTheDocument();
    // The "labellisés" header must precede the "equivalent" header in document order.
    expect(labelled.compareDocumentPosition(equivalent) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // Both cards still render under their respective section.
    expect(document.getElementById('result-card-lab')).not.toBeNull();
    expect(document.getElementById('result-card-eq')).not.toBeNull();
  });
});
