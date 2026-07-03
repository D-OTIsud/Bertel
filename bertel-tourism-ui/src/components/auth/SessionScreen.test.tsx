import { render, screen } from '@testing-library/react';
import { SessionScreen } from './SessionScreen';
import { defaultThemeSettings } from '../../lib/theme';
import { useSessionStore } from '../../store/session-store';
import { useThemeStore } from '../../store/theme-store';

describe('SessionScreen', () => {
  beforeEach(() => {
    useThemeStore.setState({
      theme: { ...defaultThemeSettings, brandName: 'OTI du Sud', logoUrl: '/Logo/logo-email.png' },
    });
  });

  it("booting : splash de marque (logo + nom) avec message d'attente, sans actions", () => {
    useSessionStore.setState({ status: 'booting', errorMessage: null });
    const { container } = render(<SessionScreen />);

    expect(screen.getByRole('heading', { level: 1, name: 'OTI du Sud' })).toBeInTheDocument();
    expect(screen.getByText('Chargement de votre espace…')).toBeInTheDocument();
    expect(container.querySelector('.session-screen__logo--pulse')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Réessayer' })).not.toBeInTheDocument();
  });

  it('erreur : message du store + sorties Réessayer / Aller à la connexion', () => {
    useSessionStore.setState({ status: 'error', errorMessage: 'Impossible de recuperer la session Supabase.' });
    render(<SessionScreen />);

    expect(screen.getByText('Impossible de recuperer la session Supabase.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Aller à la connexion' })).toHaveAttribute(
      'href',
      '/login',
    );
  });
});
