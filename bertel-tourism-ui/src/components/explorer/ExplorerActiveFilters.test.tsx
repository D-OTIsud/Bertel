import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { ExplorerActiveFilters } from './ExplorerActiveFilters';
import { useExplorerStore, useDashboardExplorerStore } from '../../store/explorer-store';
import { useSessionStore } from '../../store/session-store';
import { DEFAULT_EXPLORER_FILTERS } from '../../utils/facets';
import { createDynamicList } from '@/services/lists';
import { queryClient } from '@/app/query-client';

// Le composant navigue vers la compose après « ★ Liste dynamique » (417397e).
const push = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
jest.mock('@/services/lists', () => ({
  ...jest.requireActual('@/services/lists'),
  createDynamicList: jest.fn(),
}));

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

  it('affiche une chip depuis le store passé en prop', () => {
    act(() => {
      useDashboardExplorerStore.getState().resetAll();
      useDashboardExplorerStore.getState().setCities(['Le Tampon']);
    });
    render(<ExplorerActiveFilters useStore={useDashboardExplorerStore} />);
    expect(screen.getByText(/Le Tampon/)).toBeInTheDocument();
  });
});

// Revue finale (§listes 2026-09-07) — « ★ Liste dynamique » n'avait ni garde d'organisation ni
// catch d'erreur : un échec restait une rejection non gérée, et l'action promettait un bouton
// qu'une session sans organisation active aurait fait échouer.
describe('ExplorerActiveFilters — création de liste dynamique (revue finale)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetStore();
    act(() => useExplorerStore.getState().toggleBucket('RES'));
    useSessionStore.setState({ orgId: 'org-1', userId: 'user-1' });
  });

  it('sans organisation active, le bouton n’apparaît pas', () => {
    useSessionStore.setState({ orgId: null });
    render(<ExplorerActiveFilters />);
    expect(screen.queryByRole('button', { name: /Liste dynamique/ })).not.toBeInTheDocument();
  });

  it('un échec de création affiche un message visible (toast), pas de crash silencieux', async () => {
    jest.mocked(createDynamicList).mockRejectedValue(new Error('réseau indisponible'));
    const errorSpy = jest.spyOn(toast, 'error').mockImplementation(() => '');
    render(<ExplorerActiveFilters />);

    await userEvent.click(screen.getByRole('button', { name: /Liste dynamique/ }));

    await waitFor(() => expect(errorSpy).toHaveBeenCalledWith('réseau indisponible'));
    expect(push).not.toHaveBeenCalled();
  });

  it('une création réussie invalide la grille « mes listes » avant de naviguer', async () => {
    jest.mocked(createDynamicList).mockResolvedValue('new-dyn-id');
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
    render(<ExplorerActiveFilters />);

    await userEvent.click(screen.getByRole('button', { name: /Liste dynamique/ }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/listes/new-dyn-id'));
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['my-lists', 'org-1', 'user-1'] }),
    );
    invalidateSpy.mockRestore();
  });
});
