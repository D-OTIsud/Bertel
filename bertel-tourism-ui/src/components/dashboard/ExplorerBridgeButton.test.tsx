import { render, screen, fireEvent, act } from '@testing-library/react';
import { ExplorerBridgeButton } from './ExplorerBridgeButton';
import { useDashboardExplorerStore } from '../../store/explorer-store';
import { parseSearchParams } from '../../lib/explorer-search-params';

const push = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

// URLSearchParams encode l'espace en « + » (application/x-www-form-urlencoded) ;
// decodeURIComponent seul ne le convertit pas en espace (il ne touche que les %XX).
function decodeQuery(url: string): string {
  return decodeURIComponent(url.replace(/\+/g, ' '));
}

describe('ExplorerBridgeButton', () => {
  beforeEach(() => {
    push.mockClear();
    act(() => useDashboardExplorerStore.getState().resetAll());
  });

  it('navigue vers l’Explorateur en emportant les filtres du dashboard', () => {
    act(() => useDashboardExplorerStore.getState().setCities(['Le Tampon']));
    render(<ExplorerBridgeButton />);

    fireEvent.click(screen.getByRole('button', { name: /Ouvrir dans l’Explorateur/ }));

    expect(push).toHaveBeenCalledTimes(1);
    const url = push.mock.calls[0][0] as string;
    expect(url.startsWith('/explorer?')).toBe(true);
    expect(decodeQuery(url)).toContain('Le Tampon');
  });

  it('navigue même sans aucun filtre actif', () => {
    render(<ExplorerBridgeButton />);
    fireEvent.click(screen.getByRole('button', { name: /Ouvrir dans l’Explorateur/ }));
    expect(push).toHaveBeenCalledTimes(1);
  });

  it('lit l’instance dashboard du store, pas le singleton Explorateur', () => {
    act(() => useDashboardExplorerStore.getState().setCities(['Entre-Deux']));
    render(<ExplorerBridgeButton />);
    fireEvent.click(screen.getByRole('button', { name: /Ouvrir dans l’Explorateur/ }));
    expect(decodeQuery(push.mock.calls[0][0] as string)).toContain('Entre-Deux');
  });

  it('explicite le statut effectif et exclut la capacité mémorisée en multi-type', () => {
    act(() => {
      useDashboardExplorerStore.getState().toggleBucket('HOT');
      useDashboardExplorerStore.getState().setHotCapacityFilter('beds', 20, 60);
      useDashboardExplorerStore.getState().toggleBucket('RES');
    });
    render(<ExplorerBridgeButton />);
    const button = screen.getByRole('button', { name: /Ouvrir dans l’Explorateur/ });
    expect(button).toHaveAccessibleDescription(/période et valeurs mémorisées non transmises/);
    fireEvent.click(button);
    const params = new URLSearchParams((push.mock.calls[0][0] as string).split('?')[1]);
    expect(params.get('status')).toBe('published');
    expect(params.has('hotCapacity')).toBe(false);
    expect(parseSearchParams(params).selectedBuckets).toEqual(['HOT', 'RES']);
    expect(useDashboardExplorerStore.getState().hot.capacityFilters).toEqual([{ code: 'beds', min: 20, max: 60 }]);
  });
});
