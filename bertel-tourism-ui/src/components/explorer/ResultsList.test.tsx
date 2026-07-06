import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  it('renders grade sections highest-first and collapses a section on header click when gradeSection is set', async () => {
    const user = userEvent.setup();
    const cards = [
      makeCard({ id: 'three-star', name: 'Trois Etoiles', badges: [{ code: 'meuble_stars:3' }] }),
      makeCard({ id: 'five-star', name: 'Cinq Etoiles', badges: [{ code: 'meuble_stars:5' }] }),
    ];
    renderResultsList({
      cards,
      gradeSection: {
        schemeCode: 'meuble_stars',
        values: [
          { code: '1', name: '1 etoile' },
          { code: '2', name: '2 etoiles' },
          { code: '3', name: '3 etoiles' },
          { code: '4', name: '4 etoiles' },
          { code: '5', name: '5 etoiles' },
        ],
      },
    });

    const fiveStarHeader = screen.getByText('5 etoiles');
    const threeStarHeader = screen.getByText('3 etoiles');
    expect(fiveStarHeader).toBeInTheDocument();
    expect(threeStarHeader).toBeInTheDocument();
    // 5 etoiles (highest grade) must precede 3 etoiles in document order.
    expect(fiveStarHeader.compareDocumentPosition(threeStarHeader) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    expect(document.getElementById('result-card-five-star')).not.toBeNull();
    expect(document.getElementById('result-card-three-star')).not.toBeNull();

    // Clicking the "5 etoiles" section header collapses its cards.
    const fiveStarHeaderButton = fiveStarHeader.closest('button');
    expect(fiveStarHeaderButton).not.toBeNull();
    await user.click(fiveStarHeaderButton as HTMLButtonElement);

    expect(document.getElementById('result-card-five-star')).toBeNull();
    // The other section stays expanded.
    expect(document.getElementById('result-card-three-star')).not.toBeNull();
  });
});
