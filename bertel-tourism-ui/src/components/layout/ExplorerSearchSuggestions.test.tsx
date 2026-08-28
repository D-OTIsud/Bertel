// Menu de concordances directes sous la barre de recherche de l'Exploreur.
//
// Ce que les tests gardent réellement :
// - le menu n'existe QUE s'il a quelque chose à montrer (pas de coquille vide,
//   pas de « aucun résultat » sous la frappe) ;
// - le choix d'une ligne passe par `mousedown` AVEC `preventDefault()` — avec un
//   simple `onClick`, le `blur` de l'input fermerait le menu avant que le clic
//   n'aboutisse, et la ligne serait inerte. C'est exactement le genre de détail
//   qu'une passe de « nettoyage » retire, d'où l'assertion explicite ;
// - un menu fermé n'interroge PAS le serveur.
import { render, screen, fireEvent } from '@testing-library/react';
import { ExplorerSearchSuggestions, shouldShowSuggestions } from './ExplorerSearchSuggestions';
import { useNameMatchQuery } from '../../hooks/useNameMatchQuery';
import type { NameMatch } from '../../services/name-search';

jest.mock('../../hooks/useNameMatchQuery');
const mockUseNameMatchQuery = useNameMatchQuery as jest.MockedFunction<typeof useNameMatchQuery>;

const DIMITILE: NameMatch = {
  id: 'HOTRUN000000001A',
  name: 'Dimitile Hôtel',
  type: 'HOT',
  status: 'published',
  city: 'Entre-Deux',
  imageUrl: 'https://cdn.example/dimitile.jpg',
};

const GUILAINE: NameMatch = {
  id: 'RESRUN000000002B',
  name: 'Chez Guilaine',
  type: 'RES',
  status: 'draft',
  city: null,
  imageUrl: null,
};

function setMatches(matches: NameMatch[], isFetching = false) {
  mockUseNameMatchQuery.mockReturnValue({ data: matches, isFetching });
}

function renderSuggestions(over: Partial<React.ComponentProps<typeof ExplorerSearchSuggestions>> = {}) {
  const onPick = jest.fn();
  const utils = render(
    <ExplorerSearchSuggestions
      query="dimi"
      open
      activeIndex={-1}
      onPick={onPick}
      listboxId="explorer-suggestions"
      {...over}
    />,
  );
  return { onPick, ...utils };
}

beforeEach(() => {
  jest.clearAllMocks();
  setMatches([DIMITILE, GUILAINE]);
});

describe('ExplorerSearchSuggestions', () => {
  it('rend une option par concordance, avec son type et sa commune', () => {
    renderSuggestions();

    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveTextContent('Dimitile Hôtel');
    expect(options[0]).toHaveTextContent('Hôtel');
    expect(options[0]).toHaveTextContent('Entre-Deux');
    expect(options[1]).toHaveTextContent('Chez Guilaine');
  });

  it('expose la structure listbox/option attendue par le clavier de la TopBar', () => {
    renderSuggestions({ activeIndex: 1 });

    expect(screen.getByRole('listbox')).toHaveAttribute('id', 'explorer-suggestions');
    const options = screen.getAllByRole('option');
    // Les ids doivent suivre `${listboxId}-${index}` : c'est ce que l'input pointe
    // via aria-activedescendant. Un id qui dérive = un lecteur d'écran muet.
    expect(options[0]).toHaveAttribute('id', 'explorer-suggestions-0');
    expect(options[1]).toHaveAttribute('id', 'explorer-suggestions-1');
    expect(options[0]).toHaveAttribute('aria-selected', 'false');
    expect(options[1]).toHaveAttribute('aria-selected', 'true');
  });

  it('signale les brouillons, et seulement eux', () => {
    renderSuggestions();

    const options = screen.getAllByRole('option');
    expect(options[0]).not.toHaveTextContent('Brouillon');
    expect(options[1]).toHaveTextContent('Brouillon');
  });

  it('rappelle que Entrée hors sélection lance la recherche complète', () => {
    renderSuggestions();
    expect(screen.getByText(/lancer la recherche complète/i)).toBeInTheDocument();
  });

  it('choisit une concordance sur mousedown, en annulant le défaut (sinon le blur ferme le menu avant le clic)', () => {
    const { onPick } = renderSuggestions();

    const notCancelled = fireEvent.mouseDown(screen.getAllByRole('option')[1]);

    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith(GUILAINE);
    // dispatchEvent rend false quand preventDefault() a été appelé : c'est la
    // preuve que le focus de l'input est préservé pendant le choix.
    expect(notCancelled).toBe(false);
  });

  it('ne rend rien quand le menu est fermé, quand le terme est trop court, ou sans concordance', () => {
    const { unmount } = renderSuggestions({ open: false });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    unmount();

    const short = renderSuggestions({ query: 'd' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    short.unmount();

    setMatches([]);
    renderSuggestions();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it("n'interroge pas le serveur pour un menu fermé", () => {
    renderSuggestions({ open: false });
    // Terme vide ⇒ la requête est désactivée en amont (seuil de caractères).
    expect(mockUseNameMatchQuery).toHaveBeenCalledWith('');
    expect(mockUseNameMatchQuery).not.toHaveBeenCalledWith('dimi');
  });
});

describe('shouldShowSuggestions', () => {
  it('exige les trois conditions à la fois', () => {
    expect(shouldShowSuggestions(true, 'dimi', 2)).toBe(true);
    expect(shouldShowSuggestions(false, 'dimi', 2)).toBe(false);
    expect(shouldShowSuggestions(true, ' d ', 2)).toBe(false);
    expect(shouldShowSuggestions(true, 'dimi', 0)).toBe(false);
  });
});
