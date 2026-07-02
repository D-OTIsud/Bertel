import { render, screen, fireEvent, act } from '@testing-library/react';
import { FiltersPanel } from './FiltersPanel';
import { useExplorerStore } from '../../store/explorer-store';

// Sections type-spécifiques repliables (décision §152) : l'en-tête disclosure
// porte un nom accessible distinct (« Section X », préfixe sr-only) pour ne pas
// collisionner avec la chip de bucket homonyme au comportement destructif.
function sectionToggle(name: RegExp, expanded: boolean) {
  return screen.getByRole('button', { name, expanded });
}

function resetStore() {
  act(() => useExplorerStore.getState().resetAll());
}

describe('FiltersPanel — sections type-spécifiques repliables', () => {
  beforeEach(resetStore);

  it('la section Hébergements se replie et se déplie', () => {
    act(() => useExplorerStore.getState().toggleBucket('HOT'));
    render(<FiltersPanel variant="column" />);

    expect(screen.getByText('Sous-types hebergement')).toBeInTheDocument();
    fireEvent.click(sectionToggle(/Section Hebergements/, true));
    expect(screen.queryByText('Sous-types hebergement')).not.toBeInTheDocument();
    fireEvent.click(sectionToggle(/Section Hebergements/, false));
    expect(screen.getByText('Sous-types hebergement')).toBeInTheDocument();
    // La chip de bucket homonyme garde son nom nu : pas de collision de noms.
    expect(screen.getByRole('button', { name: 'Hebergements' })).toBeInTheDocument();
  });

  it("l'en-tête Hébergements porte le compte des critères actifs (visible replié)", () => {
    act(() => {
      useExplorerStore.getState().toggleBucket('HOT');
      useExplorerStore.getState().toggleHotTaxonomy('taxonomy_hot', 'hotel');
    });
    render(<FiltersPanel variant="column" />);

    const toggle = sectionToggle(/Section Hebergements/, true);
    expect(toggle).toHaveTextContent('1');
    fireEvent.click(toggle);
    // Replié, le badge reste — un filtre actif n'est jamais masqué par le pli.
    expect(sectionToggle(/Section Hebergements/, false)).toHaveTextContent('1');
  });

  it('la section Itinéraires est repliable et compte ses critères', () => {
    act(() => {
      useExplorerStore.getState().toggleBucket('ITI');
      useExplorerStore.getState().setItiIsLoop(true);
      useExplorerStore.getState().setItiDistance(5, undefined);
    });
    render(<FiltersPanel variant="column" />);

    const toggle = sectionToggle(/Section Itineraires/, true);
    expect(toggle).toHaveTextContent('2');
    fireEvent.click(toggle);
    expect(screen.queryByText('Type de parcours')).not.toBeInTheDocument();
  });

  it('les sections Site & visite et Services sont repliables', () => {
    act(() => {
      useExplorerStore.getState().toggleBucket('VIS');
      useExplorerStore.getState().toggleBucket('SRV');
    });
    render(<FiltersPanel variant="column" />);

    fireEvent.click(sectionToggle(/Section Site & visite/, true));
    expect(screen.queryByText('Sous-types de site')).not.toBeInTheDocument();
    fireEvent.click(sectionToggle(/Section Services/, true));
    expect(screen.queryByText('Sous-types de service')).not.toBeInTheDocument();
  });

  it('les groupes transverses restent non repliables', () => {
    render(<FiltersPanel variant="column" />);
    expect(screen.queryByRole('button', { name: /Localisation/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Accessibilite et services/ })).not.toBeInTheDocument();
  });
});
