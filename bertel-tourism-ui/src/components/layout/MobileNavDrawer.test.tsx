import { render, screen, fireEvent } from '@testing-library/react';
import { MobileNavDrawer } from './MobileNavDrawer';
import { useSessionStore } from '../../store/session-store';
import { useUiStore } from '../../store/ui-store';

jest.mock('next/navigation', () => ({
  usePathname: () => '/explorer',
}));

describe('MobileNavDrawer (D12)', () => {
  const onOpenProfile = jest.fn();
  const onOpenNotifications = jest.fn();

  beforeEach(() => {
    useSessionStore.setState({ role: 'tourism_agent', demoMode: true, canEditObjects: true });
    useUiStore.setState({ mobileNavOpen: false });
    onOpenProfile.mockClear();
    onOpenNotifications.mockClear();
  });

  function renderDrawer(unreadNotifications = 0) {
    return render(
      <MobileNavDrawer
        onOpenProfile={onOpenProfile}
        onOpenNotifications={onOpenNotifications}
        unreadNotifications={unreadNotifications}
      />,
    );
  }

  it('ne rend rien tant que le tiroir est fermé', () => {
    renderDrawer();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('liste les modules rôle-filtrés avec la page courante marquée', () => {
    useUiStore.setState({ mobileNavOpen: true });
    renderDrawer();
    expect(screen.getByRole('dialog', { name: 'Navigation' })).toBeInTheDocument();
    const explorer = screen.getByRole('link', { name: /Explorer/ });
    expect(explorer).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /Paramètres/ })).toBeInTheDocument();
  });

  it('cliquer un module ferme le tiroir', () => {
    useUiStore.setState({ mobileNavOpen: true });
    renderDrawer();
    fireEvent.click(screen.getByRole('link', { name: /Dashboard/ }));
    expect(useUiStore.getState().mobileNavOpen).toBe(false);
  });

  // UX-01 — Notifications et Profil doivent rester joignables une fois la Sidebar masquée.
  it('propose Notifications avec le compteur de non-lues et ferme le tiroir avant de l\'ouvrir', () => {
    useUiStore.setState({ mobileNavOpen: true });
    renderDrawer(3);
    fireEvent.click(screen.getByRole('button', { name: 'Notifications, 3 non lues' }));
    expect(useUiStore.getState().mobileNavOpen).toBe(false);
    expect(onOpenNotifications).toHaveBeenCalledTimes(1);
  });

  it('propose Profil et ferme le tiroir avant de l\'ouvrir', () => {
    useUiStore.setState({ mobileNavOpen: true });
    renderDrawer();
    fireEvent.click(screen.getByRole('button', { name: 'Profil' }));
    expect(useUiStore.getState().mobileNavOpen).toBe(false);
    expect(onOpenProfile).toHaveBeenCalledTimes(1);
  });
});
