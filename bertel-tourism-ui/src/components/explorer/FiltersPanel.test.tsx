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
    render(<FiltersPanel />);

    expect(screen.getByText("Type d'hébergement")).toBeInTheDocument();
    fireEvent.click(sectionToggle(/Section Hébergements/, true));
    expect(screen.queryByText("Type d'hébergement")).not.toBeInTheDocument();
    fireEvent.click(sectionToggle(/Section Hébergements/, false));
    expect(screen.getByText("Type d'hébergement")).toBeInTheDocument();
    // La chip de bucket homonyme garde son nom nu : pas de collision de noms.
    expect(screen.getByRole('button', { name: 'Hébergements' })).toBeInTheDocument();
  });

  it("l'en-tête Hébergements porte le compte des critères actifs (visible replié)", () => {
    act(() => {
      useExplorerStore.getState().toggleBucket('HOT');
      useExplorerStore.getState().toggleTaxonomy('taxonomy_hot', 'hotel');
    });
    render(<FiltersPanel />);

    const toggle = sectionToggle(/Section Hébergements/, true);
    expect(toggle).toHaveTextContent('1');
    fireEvent.click(toggle);
    // Replié, le badge reste — un filtre actif n'est jamais masqué par le pli.
    expect(sectionToggle(/Section Hébergements/, false)).toHaveTextContent('1');
  });

  it('la section Itinéraires est repliable et compte ses critères', () => {
    act(() => {
      useExplorerStore.getState().toggleBucket('ITI');
      useExplorerStore.getState().setItiIsLoop(true);
      useExplorerStore.getState().setItiDistance(5, undefined);
    });
    render(<FiltersPanel />);

    const toggle = sectionToggle(/Section Itinéraires/, true);
    expect(toggle).toHaveTextContent('2');
    fireEvent.click(toggle);
    expect(screen.queryByText('Type de parcours')).not.toBeInTheDocument();
  });

  it('les sections Site & visite et Services sont repliables', () => {
    act(() => {
      useExplorerStore.getState().toggleBucket('VIS');
      useExplorerStore.getState().toggleBucket('SRV');
    });
    render(<FiltersPanel />);

    fireEvent.click(sectionToggle(/Section Site & visite/, true));
    expect(screen.queryByText('Type de visite')).not.toBeInTheDocument();
    fireEvent.click(sectionToggle(/Section Services/, true));
    expect(screen.queryByText('Type de service')).not.toBeInTheDocument();
  });

  it('les groupes transverses restent non repliables', () => {
    render(<FiltersPanel />);
    expect(screen.queryByRole('button', { name: /Localisation/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Accessibilité et services/ })).not.toBeInTheDocument();
  });
});

describe('FiltersPanel — difficulté ITI en segments (§156)', () => {
  beforeEach(resetStore);

  it('sélectionne un segment (bornes posées) et le re-clic le retire', () => {
    act(() => useExplorerStore.getState().toggleBucket('ITI'));
    render(<FiltersPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Facile (1-2)' }));
    expect(useExplorerStore.getState().iti.difficultyMax).toBe(2);
    expect(useExplorerStore.getState().iti.difficultyMin).toBeUndefined();

    fireEvent.click(screen.getByRole('button', { name: 'Facile (1-2)' }));
    expect(useExplorerStore.getState().iti.difficultyMax).toBeUndefined();
  });
});

describe('explorer-store — garde min ≤ max (§156)', () => {
  beforeEach(resetStore);

  it('réordonne une plage inversée (distance)', () => {
    act(() => useExplorerStore.getState().setItiDistance(12, 5));
    expect(useExplorerStore.getState().iti.distanceMinKm).toBe(5);
    expect(useExplorerStore.getState().iti.distanceMaxKm).toBe(12);
  });

  it('réordonne une plage de capacité inversée', () => {
    act(() => useExplorerStore.getState().setResCapacityFilter('seats', 40, 10));
    expect(useExplorerStore.getState().res.capacityFilters).toEqual([{ code: 'seats', min: 10, max: 40 }]);
  });
});
