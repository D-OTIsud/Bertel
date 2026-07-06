import { render, screen, fireEvent } from '@testing-library/react';
import { MobileNavDrawer } from './MobileNavDrawer';
import { useSessionStore } from '../../store/session-store';
import { useUiStore } from '../../store/ui-store';

jest.mock('next/navigation', () => ({
  usePathname: () => '/explorer',
}));

describe('MobileNavDrawer (D12)', () => {
  beforeEach(() => {
    useSessionStore.setState({ role: 'tourism_agent', demoMode: true, canEditObjects: true });
    useUiStore.setState({ mobileNavOpen: false });
  });

  it('ne rend rien tant que le tiroir est fermé', () => {
    render(<MobileNavDrawer />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('liste les modules rôle-filtrés avec la page courante marquée', () => {
    useUiStore.setState({ mobileNavOpen: true });
    render(<MobileNavDrawer />);
    expect(screen.getByRole('dialog', { name: 'Navigation' })).toBeInTheDocument();
    const explorer = screen.getByRole('link', { name: /Explorer/ });
    expect(explorer).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /Paramètres/ })).toBeInTheDocument();
  });

  it('cliquer un module ferme le tiroir', () => {
    useUiStore.setState({ mobileNavOpen: true });
    render(<MobileNavDrawer />);
    fireEvent.click(screen.getByRole('link', { name: /Dashboard/ }));
    expect(useUiStore.getState().mobileNavOpen).toBe(false);
  });
});
