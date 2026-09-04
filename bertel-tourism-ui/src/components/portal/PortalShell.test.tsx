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
const FORM_KEY = 'portal-form:u1:HOT1';

/** Le bouton de la barre haute. Le libellé de confirmation est VOLONTAIREMENT différent
 *  (« Effacer et me déconnecter »), sans quoi les deux se confondraient ici. */
const signOutButton = () => screen.getByRole('button', { name: /Se déconnecter/ });

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

    await userEvent.click(signOutButton());
    await userEvent.click(await screen.findByRole('button', { name: 'Effacer et me déconnecter' }));

    await waitFor(() => expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull());
    expect(mockedAuth.signOut).toHaveBeenCalledTimes(1);
  });

  it('garde INTACTES les modifications quand la déconnexion échoue', async () => {
    // Le cas qui compte : une coupure réseau. Le partenaire reste connecté et doit
    // retrouver son travail non envoyé — purger avant `signOut()` le détruirait.
    window.localStorage.setItem(DRAFT_KEY, '{"note":null}');
    mockedAuth.signOut.mockRejectedValue(new Error('Réseau indisponible.'));
    render(<PortalShell>contenu</PortalShell>);

    await userEvent.click(signOutButton());
    await userEvent.click(await screen.findByRole('button', { name: 'Effacer et me déconnecter' }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Réseau indisponible.'));
    expect(window.localStorage.getItem(DRAFT_KEY)).toBe('{"note":null}');
  });

  it('ne purge que le compte courant', async () => {
    window.localStorage.setItem(DRAFT_KEY, '{"note":null}');
    window.localStorage.setItem('portal-draft:u2:RES2', '{"note":null}');
    mockedAuth.signOut.mockResolvedValue(undefined);
    render(<PortalShell>contenu</PortalShell>);

    await userEvent.click(signOutButton());
    await userEvent.click(await screen.findByRole('button', { name: 'Effacer et me déconnecter' }));

    await waitFor(() => expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull());
    expect(window.localStorage.getItem('portal-draft:u2:RES2')).toBe('{"note":null}');
  });
});

/**
 * La déconnexion DÉTRUIT — trois familles de clés, toutes les fiches du compte — et c'est
 * le seul geste destructif de l'espace qui ne demandait rien. « Annuler mes modifications »,
 * lui, a toujours eu sa fenêtre (PortalSendBar). L'asymétrie n'avait jamais été discutée :
 * les trois tests ci-dessus vérifiaient QUE la purge a lieu, jamais si elle devrait prévenir.
 */
describe('PortalShell — la déconnexion prévient avant de détruire', () => {
  it('une saisie non envoyée : le premier clic DEMANDE, il ne déconnecte pas et n’efface rien', async () => {
    // `portal-form:` — la saisie en cours, celle qui n'a même pas été validée. C'est la
    // plus fragile des trois familles, et `hasPortalDraft` ne la voyait pas.
    window.localStorage.setItem(FORM_KEY, '{"fingerprint":"f","forms":{"contacts":{}}}');
    mockedAuth.signOut.mockResolvedValue(undefined);
    render(<PortalShell>contenu</PortalShell>);

    await userEvent.click(signOutButton());

    expect(
      await screen.findByText(/Tout ce que vous avez saisi sur cet appareil sera perdu/),
    ).toBeInTheDocument();
    expect(mockedAuth.signOut).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(FORM_KEY)).not.toBeNull();
  });

  it('« Rester connecté » ne déconnecte pas et garde tout', async () => {
    window.localStorage.setItem(FORM_KEY, '{"fingerprint":"f","forms":{"contacts":{}}}');
    mockedAuth.signOut.mockResolvedValue(undefined);
    render(<PortalShell>contenu</PortalShell>);

    await userEvent.click(signOutButton());
    await userEvent.click(await screen.findByRole('button', { name: 'Rester connecté' }));

    expect(mockedAuth.signOut).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(FORM_KEY)).not.toBeNull();
  });

  it('rien à perdre : la déconnexion reste UN seul geste', async () => {
    // Une question posée à vide serait un obstacle de plus pour quelqu'un qui vient
    // seulement de consulter sa fiche.
    mockedAuth.signOut.mockResolvedValue(undefined);
    render(<PortalShell>contenu</PortalShell>);

    await userEvent.click(signOutButton());

    await waitFor(() => expect(mockedAuth.signOut).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/sera perdu/)).not.toBeInTheDocument();
  });

  it('le travail d’un AUTRE compte ne déclenche pas la question', async () => {
    // La purge est cloisonnée par compte : la question doit l'être aussi, sinon un
    // appareil d'office ferait poser une fenêtre à quelqu'un qui n'a rien saisi.
    window.localStorage.setItem('portal-draft:u2:RES2', '{"note":null}');
    window.localStorage.setItem('portal-form:u2:RES2', '{"fingerprint":"f","forms":{}}');
    mockedAuth.signOut.mockResolvedValue(undefined);
    render(<PortalShell>contenu</PortalShell>);

    await userEvent.click(signOutButton());

    await waitFor(() => expect(mockedAuth.signOut).toHaveBeenCalledTimes(1));
    expect(window.localStorage.getItem('portal-draft:u2:RES2')).toBe('{"note":null}');
  });

  it('un instantané d’ENVOI seul ne retient personne — il décrit ce qui est DÉJÀ parti', async () => {
    window.localStorage.setItem('portal-sent:u1:HOT1', '{"submittedAt":"2026-09-01T08:00:00.000Z","lines":{}}');
    mockedAuth.signOut.mockResolvedValue(undefined);
    render(<PortalShell>contenu</PortalShell>);

    await userEvent.click(signOutButton());

    await waitFor(() => expect(mockedAuth.signOut).toHaveBeenCalledTimes(1));
    // La purge l'emporte quand même : sur un appareil partagé, il porte le téléphone et
    // les tarifs du partenaire précédent.
    await waitFor(() => expect(window.localStorage.getItem('portal-sent:u1:HOT1')).toBeNull());
  });
});
