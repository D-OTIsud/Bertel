import { render, screen } from '@testing-library/react';
import { AuthShell } from './AuthShell';
import { defaultThemeSettings } from '../../lib/theme';
import { useThemeStore } from '../../store/theme-store';

describe('AuthShell', () => {
  beforeEach(() => {
    useThemeStore.setState({ theme: { ...defaultThemeSettings } });
  });

  it('affiche le logo et le nom de marque du thème + le contenu de la carte', () => {
    useThemeStore.setState({
      theme: { ...defaultThemeSettings, brandName: 'OTI du Sud', logoUrl: '/Logo/logo-email.png' },
    });
    const { container } = render(
      <AuthShell>
        <p>carte formulaire</p>
      </AuthShell>,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'OTI du Sud' })).toBeInTheDocument();
    expect(container.querySelector('.auth-hero__logo img')).toHaveAttribute(
      'src',
      '/Logo/logo-email.png',
    );
    expect(screen.getByText('carte formulaire')).toBeInTheDocument();
  });

  it('sans logo configuré, ne rend pas de chip logo', () => {
    useThemeStore.setState({ theme: { ...defaultThemeSettings, logoUrl: null } });
    const { container } = render(
      <AuthShell>
        <p>x</p>
      </AuthShell>,
    );

    expect(container.querySelector('.auth-hero__logo')).not.toBeInTheDocument();
  });
});
