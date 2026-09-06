import { render, screen, fireEvent, act } from '@testing-library/react';
import { ExplorerBridgeButton } from './ExplorerBridgeButton';
import { useDashboardExplorerStore } from '../../store/explorer-store';

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
});
