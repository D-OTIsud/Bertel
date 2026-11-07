import { renderHook, act, waitFor } from '@testing-library/react';
import { useExplorerUrlSync } from './useExplorerUrlSync';
import { useExplorerStore } from '../store/explorer-store';
import type { GeoPolygon } from '../types/domain';

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

  it('conserve la recherche et la zone en StrictMode pendant la restauration, puis accepte un retour vers une URL nue', () => {
    const polygon: GeoPolygon = { type: 'Polygon', coordinates: [[[55, -21], [56, -21], [56, -22], [55, -21]]] };
    const bbox: [number, number, number, number] = [55, -22, 56, -21];
    act(() => {
      useExplorerStore.getState().setSearch('jardin');
      useExplorerStore.getState().setPolygon(polygon, bbox);
    });

    const { rerender } = renderHook(() => useExplorerUrlSync(), { reactStrictMode: true });

    expect(useExplorerStore.getState().common.search).toBe('jardin');
    expect(useExplorerStore.getState().common.polygon).toEqual(polygon);
    expect(useExplorerStore.getState().common.bbox).toEqual(bbox);
    expect(replace).toHaveBeenCalledTimes(1);
    const restoredUrl = new URL(String(replace.mock.calls[0][0]), window.location.origin);
    expect(restoredUrl.searchParams.get('search')).toBe('jardin');
    rerender();
    expect(useExplorerStore.getState().common.search).toBe('jardin');
    expect(replace).toHaveBeenCalledTimes(1);

    // Le routeur confirme ensuite l'URL demandée, sans reparser et perdre la zone locale.
    mockSearch = restoredUrl.searchParams;
    rerender();
    expect(useExplorerStore.getState().common.search).toBe('jardin');
    expect(useExplorerStore.getState().common.polygon).toEqual(polygon);
    expect(useExplorerStore.getState().common.bbox).toEqual(bbox);

    // Un vrai Précédent après cette confirmation doit toujours appliquer l'URL nue.
    mockSearch = new URLSearchParams();
    rerender();
    expect(useExplorerStore.getState().common.search).toBe('');
    expect(useExplorerStore.getState().common.polygon).toBeNull();
    expect(useExplorerStore.getState().common.bbox).toBeNull();
  });

  it('accepte une réinitialisation explicite après confirmation de la restauration', () => {
    jest.useFakeTimers();
    try {
      act(() => useExplorerStore.getState().setSearch('jardin'));
      const { rerender, unmount } = renderHook(() => useExplorerUrlSync(), { reactStrictMode: true });
      const restoredUrl = new URL(String(replace.mock.calls[0][0]), window.location.origin);
      mockSearch = restoredUrl.searchParams;
      rerender();

      act(() => useExplorerStore.getState().resetAll());
      expect(useExplorerStore.getState().common.search).toBe('');
      act(() => jest.advanceTimersByTime(300));
      const resetUrl = new URL(String(replace.mock.calls.at(-1)?.[0]), window.location.origin);
      expect(resetUrl.searchParams.has('search')).toBe(false);
      mockSearch = new URLSearchParams();
      rerender();
      expect(useExplorerStore.getState().common.search).toBe('');
      unmount();
    } finally {
      jest.useRealTimers();
    }
  });
});
