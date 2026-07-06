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

  it('affiche la signification EXACTE de l’acronyme quand la marque est « Bertel »', () => {
    useThemeStore.setState({ theme: { ...defaultThemeSettings, brandName: 'Bertel' } });
    const { container } = render(
      <AuthShell>
        <p>x</p>
      </AuthShell>,
    );

    // Verbatim de l'infographie institutionnelle (docs/infographie-bertel.html).
    expect(container).toHaveTextContent(
      /Base d.Enregistrement et de Référentiel Touristique des Établissements et Lieux/,
    );
    // Les 6 initiales B-E-R-T-É-L sont mises en avant.
    expect(container.querySelectorAll('.auth-hero__acronym .ac')).toHaveLength(6);
  });

  it('masque l’acronyme pour toute autre marque (white-label §167)', () => {
    useThemeStore.setState({ theme: { ...defaultThemeSettings, brandName: 'Office de Tourisme XYZ' } });
    const { container } = render(
      <AuthShell>
        <p>x</p>
      </AuthShell>,
    );

    expect(container.querySelector('.auth-hero__acronym')).toBeNull();
  });

  it('affiche le pied légal (confidentialité + CGU) ouvert en nouvel onglet', () => {
    render(
      <AuthShell>
        <p>x</p>
      </AuthShell>,
    );

    const privacy = screen.getByRole('link', { name: 'Confidentialité' });
    expect(privacy).toHaveAttribute('href', '/legal/rgpd.html');
    expect(privacy).toHaveAttribute('target', '_blank');
    expect(privacy).toHaveAttribute('rel', 'noopener noreferrer');

    const terms = screen.getByRole('link', { name: /Conditions d.utilisation/ });
    expect(terms).toHaveAttribute('href', '/legal/cgu.html');
    expect(terms).toHaveAttribute('rel', 'noopener noreferrer');
  });
});
