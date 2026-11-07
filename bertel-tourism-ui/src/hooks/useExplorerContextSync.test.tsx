import { renderHook, act, waitFor } from '@testing-library/react';
import { useExplorerContextSync } from './useExplorerContextSync';
import { useUiStore } from '../store/ui-store';

let mockSearch = new URLSearchParams();
jest.mock('next/navigation', () => ({
  useSearchParams: () => mockSearch,
}));

describe('useExplorerContextSync (D25 : ?fiche=<id>)', () => {
  beforeEach(() => {
    useUiStore.setState({ drawerObjectId: null });
    mockSearch = new URLSearchParams();
    window.history.replaceState(null, '', '/explorer');
  });

  it('ouvre le drawer depuis le deep-link au montage', () => {
    mockSearch = new URLSearchParams('fiche=HOT-42');
    renderHook(() => useExplorerContextSync());
    expect(useUiStore.getState().drawerObjectId).toBe('HOT-42');
  });

  it('écrit ?fiche à l’ouverture du drawer et le retire à la fermeture (replaceState natif)', async () => {
    renderHook(() => useExplorerContextSync());

    act(() => {
      useUiStore.getState().openDrawer('RES-7');
    });
    await waitFor(() => expect(window.location.search).toBe('?fiche=RES-7'));

    act(() => {
      useUiStore.getState().closeDrawer();
    });
    await waitFor(() => expect(window.location.search).toBe(''));
  });

  it('laisse Next intégrer les écritures et restaure un vrai changement de fiche dans l’URL', () => {
    window.history.replaceState({ __NA: true }, '', '/explorer');
    const replace = jest.spyOn(window.history, 'replaceState');
    try {
      const { rerender } = renderHook(() => useExplorerContextSync());
      act(() => useUiStore.getState().openDrawer('RES-7'));
      expect(replace).toHaveBeenLastCalledWith(null, '', '/explorer?fiche=RES-7');
      mockSearch = new URLSearchParams(window.location.search);
      rerender();

      act(() => useUiStore.getState().closeDrawer());
      expect(replace).toHaveBeenLastCalledWith(null, '', '/explorer');
      mockSearch = new URLSearchParams(window.location.search);
      rerender();

      window.history.replaceState({ __NA: true }, '', '/explorer?fiche=HOT-42');
      replace.mockClear();
      mockSearch = new URLSearchParams(window.location.search);
      rerender();
      expect(useUiStore.getState().drawerObjectId).toBe('HOT-42');
      expect(replace).not.toHaveBeenCalled();
    } finally {
      replace.mockRestore();
    }
  });

  it('préserve les autres clés de l’URL (filtres) en écrivant fiche', async () => {
    window.history.replaceState(null, '', '/explorer?buckets=HOT&q=cilaos');
    renderHook(() => useExplorerContextSync());

    act(() => {
      useUiStore.getState().openDrawer('HOT-1');
    });
    await waitFor(() => {
      const params = new URLSearchParams(window.location.search);
      expect(params.get('fiche')).toBe('HOT-1');
      expect(params.get('buckets')).toBe('HOT');
      expect(params.get('q')).toBe('cilaos');
    });
  });

  it('ne reboucle pas : la valeur déjà appliquée ne ré-écrit pas l’URL', () => {
    mockSearch = new URLSearchParams('fiche=HOT-42');
    const spy = jest.spyOn(window.history, 'replaceState');
    renderHook(() => useExplorerContextSync());
    // Le mount applique URL→store ; le subscriber store→URL ne doit PAS ré-écrire.
    expect(useUiStore.getState().drawerObjectId).toBe('HOT-42');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
