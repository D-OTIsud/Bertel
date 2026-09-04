import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PortalShell } from './PortalShell';
import { useSessionStore } from '../../store/session-store';
import { useThemeStore } from '../../store/theme-store';
import * as auth from '../../services/auth';

jest.mock('../../services/auth');
const mockedAuth = auth as jest.Mocked<typeof auth>;

const toastError = jest.fn();
jest.mock('../../hooks/useToast', () => ({
  useToast: () => ({ success: jest.fn(), error: toastError, info: jest.fn(), warning: jest.fn() }),
}));

const DRAFT_KEY = 'portal-draft:u1:HOT1';

beforeEach(() => {
  jest.clearAllMocks();
  window.localStorage.clear();
  useSessionStore.setState({
    status: 'ready',
    role: 'actor',
    userId: 'u1',
    userName: 'Marie Payet',
    demoMode: false,
  } as never);
  useThemeStore.setState({
    theme: { ...useThemeStore.getState().theme, brandName: 'Office de l’Ouest', logoUrl: null },
  } as never);
});

describe('PortalShell', () => {
  it('nomme l’espace « Espace partenaire », jamais « prestataire »', () => {
    render(<PortalShell>contenu</PortalShell>);

    expect(screen.getByText('Espace partenaire')).toBeInTheDocument();
    expect(document.body.textContent ?? '').not.toMatch(/prestataire/i);
  });

  it('pose la marque sur DEUX lignes : le nom de l’organisation, puis l’espace', () => {
    render(<PortalShell>contenu</PortalShell>);

    const name = screen.getByText('Office de l’Ouest');
    const eyebrow = screen.getByText('Espace partenaire');
    // Deux éléments distincts sous un même bloc : une seule rangée à plat (le nom
    // contenant l'espace) pousserait « Se déconnecter » hors écran sur un téléphone.
    expect(name).not.toContainElement(eyebrow);
    expect(eyebrow).not.toContainElement(name);
    expect(name.parentElement).toBe(eyebrow.parentElement);
  });

  it('offre un saut vers le contenu et un pied légal', () => {
    render(<PortalShell>contenu</PortalShell>);

    expect(screen.getByRole('link', { name: 'Aller au contenu' })).toHaveAttribute('href', '#portal-main');
    expect(screen.getByRole('main')).toHaveAttribute('id', 'portal-main');
    expect(screen.getByRole('link', { name: 'Confidentialité' })).toBeInTheDocument();
  });

  it('purge les modifications de l’appareil APRÈS une déconnexion réussie', async () => {
    window.localStorage.setItem(DRAFT_KEY, '{"note":null}');
    mockedAuth.signOut.mockResolvedValue(undefined);
    render(<PortalShell>contenu</PortalShell>);

    await userEvent.click(screen.getByRole('button', { name: /Se déconnecter/ }));

    await waitFor(() => expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull());
    expect(mockedAuth.signOut).toHaveBeenCalledTimes(1);
  });

  it('garde INTACTES les modifications quand la déconnexion échoue', async () => {
    // Le cas qui compte : une coupure réseau. Le partenaire reste connecté et doit
    // retrouver son travail non envoyé — purger avant `signOut()` le détruirait.
    window.localStorage.setItem(DRAFT_KEY, '{"note":null}');
    mockedAuth.signOut.mockRejectedValue(new Error('Réseau indisponible.'));
    render(<PortalShell>contenu</PortalShell>);

    await userEvent.click(screen.getByRole('button', { name: /Se déconnecter/ }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Réseau indisponible.'));
    expect(window.localStorage.getItem(DRAFT_KEY)).toBe('{"note":null}');
  });

  it('ne purge que le compte courant', async () => {
    window.localStorage.setItem(DRAFT_KEY, '{"note":null}');
    window.localStorage.setItem('portal-draft:u2:RES2', '{"note":null}');
    mockedAuth.signOut.mockResolvedValue(undefined);
    render(<PortalShell>contenu</PortalShell>);

    await userEvent.click(screen.getByRole('button', { name: /Se déconnecter/ }));

    await waitFor(() => expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull());
    expect(window.localStorage.getItem('portal-draft:u2:RES2')).toBe('{"note":null}');
  });
});
