import { renderHook, act, waitFor } from '@testing-library/react';
import { useExplorerUrlSync } from './useExplorerUrlSync';
import { useExplorerStore } from '../store/explorer-store';

let mockSearch = new URLSearchParams();
const replace = jest.fn();
jest.mock('next/navigation', () => ({
  useSearchParams: () => mockSearch,
  useRouter: () => ({ replace: (...args: unknown[]) => replace(...args) }),
}));

describe('useExplorerUrlSync — persistance de la recherche entre les pages', () => {
  beforeEach(() => {
    replace.mockClear();
    mockSearch = new URLSearchParams();
    window.history.replaceState(null, '', '/explorer');
    act(() => useExplorerStore.getState().resetAll());
  });

  it("réécrit l'URL depuis le store quand on revient sur /explorer par la nav (URL nue)", async () => {
    // L'utilisateur a cherché, puis est parti éditer une fiche : le store (singleton
    // de module) porte encore la recherche, mais le lien de nav est `/explorer` nu.
    act(() => useExplorerStore.getState().setSearch('cilaos'));

    renderHook(() => useExplorerUrlSync());

    // La recherche survit ET l'URL est resynchronisée dessus.
    expect(useExplorerStore.getState().common.search).toBe('cilaos');
    await waitFor(() => expect(replace).toHaveBeenCalled());
    expect(String(replace.mock.calls[0][0])).toContain('cilaos');
  });

  it('applique normalement les filtres de l’URL quand elle en porte', () => {
    act(() => useExplorerStore.getState().setSearch('cilaos'));
    mockSearch = new URLSearchParams('search=saint-leu');

    renderHook(() => useExplorerUrlSync());

    expect(useExplorerStore.getState().common.search).toBe('saint-leu');
  });

  it('ne ressuscite rien quand le store est vide (URL nue = état par défaut)', () => {
    renderHook(() => useExplorerUrlSync());

    expect(useExplorerStore.getState().common.search).toBe('');
    expect(replace).not.toHaveBeenCalled();
  });
});
