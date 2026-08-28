// NameMatchBand — le bandeau de concordances directes (spec 2026-08-26).
//
// L'enjeu du test : cliquer une concordance est de la NAVIGATION. Ça ouvre la fiche
// et ça ne doit RIEN changer aux filtres — sinon l'utilisateur perdrait la recherche
// en cours en cliquant sur le raccourci censé l'aider.
import { render, screen, fireEvent } from '@testing-library/react';
import { NameMatchBand } from './NameMatchBand';
import { useExplorerStore } from '../../store/explorer-store';
import { useUiStore } from '../../store/ui-store';
import { useNameMatchQuery } from '../../hooks/useNameMatchQuery';
import type { NameMatch } from '../../services/name-search';

jest.mock('../../hooks/useNameMatchQuery', () => ({ useNameMatchQuery: jest.fn() }));

const useNameMatchQueryMock = useNameMatchQuery as jest.MockedFunction<typeof useNameMatchQuery>;

const HLO: NameMatch = {
  id: 'HLORUN00000001CA',
  name: 'Le Jardin Créole',
  type: 'HLO',
  status: 'published',
  city: 'Saint-Joseph',
  imageUrl: null,
};
const DRAFT: NameMatch = {
  id: 'LOIRUN00000000VI',
  name: 'Le Jardin Créole',
  type: 'LOI',
  status: 'draft',
  city: 'Le Tampon',
  imageUrl: null,
};

function setMatches(matches: NameMatch[]) {
  useNameMatchQueryMock.mockReturnValue({ data: matches, isFetching: false });
}

beforeEach(() => {
  jest.clearAllMocks();
  useExplorerStore.getState().setSearch('le jardin');
  useUiStore.getState().closeDrawer();
  setMatches([HLO, DRAFT]);
});

describe('NameMatchBand', () => {
  it('annonce le nombre de concordances et rend chacune avec son type et sa commune', () => {
    render(<NameMatchBand />);

    expect(screen.getByText('Concordances directes (2)')).toBeInTheDocument();
    expect(screen.getAllByText('Le Jardin Créole')).toHaveLength(2);
    expect(screen.getByText(/Saint-Joseph/)).toBeInTheDocument();
    expect(screen.getByText(/Le Tampon/)).toBeInTheDocument();
  });

  it('ouvre la fiche au clic SANS toucher au terme de recherche', () => {
    render(<NameMatchBand />);

    fireEvent.click(screen.getAllByRole('button')[0]);

    expect(useUiStore.getState().drawerObjectId).toBe('HLORUN00000001CA');
    expect(useExplorerStore.getState().common.search).toBe('le jardin');
  });

  it('signale les brouillons, et seulement eux', () => {
    render(<NameMatchBand />);
    expect(screen.getAllByText('Brouillon')).toHaveLength(1);
  });

  it('ne rend rien sans terme actif', () => {
    useExplorerStore.getState().setSearch('');
    const { container } = render(<NameMatchBand />);
    expect(container).toBeEmptyDOMElement();
  });

  it('ne rend rien sous le seuil de caractères', () => {
    useExplorerStore.getState().setSearch(' l ');
    const { container } = render(<NameMatchBand />);
    expect(container).toBeEmptyDOMElement();
  });

  it('ne rend rien quand aucune fiche ne porte ce nom', () => {
    setMatches([]);
    const { container } = render(<NameMatchBand />);
    expect(container).toBeEmptyDOMElement();
  });
});
