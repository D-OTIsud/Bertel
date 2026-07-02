import { render, screen, fireEvent, act } from '@testing-library/react';
import { ExplorerActiveFilters } from './ExplorerActiveFilters';
import { useExplorerStore } from '../../store/explorer-store';
import { DEFAULT_EXPLORER_FILTERS } from '../../utils/facets';

// Le composant navigue vers la compose après « ★ Liste dynamique » (417397e).
const push = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

function resetStore() {
  act(() => useExplorerStore.getState().resetAll());
}

describe('ExplorerActiveFilters', () => {
  beforeEach(resetStore);

  it('ne rend rien sans filtre actif', () => {
    const { container } = render(<ExplorerActiveFilters />);
    expect(container.firstChild).toBeNull();
  });

  it('retire le terme de recherche au clic sur sa pastille', () => {
    act(() => useExplorerStore.getState().setSearch('tamarins'));
    render(<ExplorerActiveFilters />);
    fireEvent.click(screen.getByRole('button', { name: /Retirer le filtre.*tamarins/i }));
    expect(useExplorerStore.getState().common.search).toBe('');
  });

  it('retire une commune sans toucher les autres', () => {
    act(() => useExplorerStore.getState().setCities(['Saint-Paul', 'Salazie']));
    render(<ExplorerActiveFilters />);
    fireEvent.click(screen.getByRole('button', { name: /Retirer le filtre.*Saint-Paul/i }));
    expect(useExplorerStore.getState().common.cities).toEqual(['Salazie']);
  });

  it('« Tout effacer » remet le store à l’état par défaut', () => {
    act(() => {
      useExplorerStore.getState().setSearch('x');
      useExplorerStore.getState().setPmr(true);
    });
    render(<ExplorerActiveFilters />);
    fireEvent.click(screen.getByRole('button', { name: 'Tout effacer' }));
    expect(useExplorerStore.getState().common.search).toBe(DEFAULT_EXPLORER_FILTERS.common.search);
    expect(useExplorerStore.getState().common.pmr).toBe(false);
  });
});
