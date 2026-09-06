import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import LoginPage from './LoginPage';
import { requestPasswordReset } from '../services/auth';
import { GUEST_SIGN_IN_MESSAGE, GUEST_SIGNED_OUT_MESSAGE } from '../store/session-store';

// Query et état de session pilotables par test : le premier contact d'un partenaire
// se distingue justement par `?espace=1` / `?from=/espace...`.
const mockSearchParams = new Map<string, string>();
let mockSessionState: Record<string, unknown> = {};

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn() }),
  useSearchParams: () => ({ get: (key: string) => mockSearchParams.get(key) ?? null }),
}));
jest.mock('../store/session-store', () => ({
  // requireActual pour garder les VRAIES constantes de message : un test qui les
  // recopierait ne verrait pas un renommage désaccorder la page du bootstrap.
  ...jest.requireActual('../store/session-store'),
  useSessionStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector(mockSessionState),
}));
jest.mock('../store/theme-store', () => ({
  useThemeStore: (
    selector: (state: { theme: { brandName: string; logoUrl: string | null } }) => unknown,
  ) => selector({ theme: { brandName: 'OTI du Sud', logoUrl: null } }),
}));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('../services/auth', () => ({
  signInWithGoogle: jest.fn(),
  signInWithEmailPassword: jest.fn(),
  requestPasswordReset: jest.fn(),
}));

const requestPasswordResetMock = requestPasswordReset as jest.MockedFunction<
  typeof requestPasswordReset
>;

const NEUTRAL_MESSAGE = /Si un compte existe avec cette adresse/;

function openForgotPanel() {
  fireEvent.click(screen.getByRole('button', { name: 'Mot de passe oublié ?' }));
}

function resetMocks() {
  jest.clearAllMocks();
  mockSearchParams.clear();
  mockSessionState = {
    status: 'guest',
    role: null,
    demoMode: false,
    errorMessage: null,
    setGuest: jest.fn(),
  };
}

describe('LoginPage — mot de passe oublié', () => {
  beforeEach(() => {
    resetMocks();
    requestPasswordResetMock.mockResolvedValue(undefined);
  });

  it('affiche un lien discret « Mot de passe oublié ? » dans la carte de connexion', () => {
    render(<LoginPage />);

    expect(screen.getByRole('button', { name: 'Mot de passe oublié ?' })).toBeInTheDocument();
  });

  it('propose la découverte sans remplir les identifiants, par un lien discret vers ?test=true', () => {
    render(<LoginPage />);
    const link = screen.getByRole('link', { name: 'Essayer l’espace de test' });
    expect(link).toHaveAttribute('href', '/?test=true');
    expect(link).toHaveClass('auth-link');
    expect(screen.getByLabelText('Adresse e-mail')).toHaveValue('');
  });

  it('bascule sur le panneau de réinitialisation en réutilisant l’e-mail déjà saisi', () => {
    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText('Adresse e-mail'), {
      target: { value: 'user@example.com' },
    });
    openForgotPanel();

    expect(screen.getByRole('heading', { name: 'Mot de passe oublié' })).toBeInTheDocument();
    expect(screen.getByLabelText('Adresse e-mail')).toHaveValue('user@example.com');
  });

  it('envoie la demande via requestPasswordReset puis affiche le message neutre', async () => {
    render(<LoginPage />);

    openForgotPanel();
    fireEvent.change(screen.getByLabelText('Adresse e-mail'), {
      target: { value: 'user@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer le lien' }));

    await waitFor(() => expect(requestPasswordResetMock).toHaveBeenCalledWith('user@example.com'));
    expect(await screen.findByText(NEUTRAL_MESSAGE)).toBeInTheDocument();
  });

  it('reste neutre même quand la demande échoue (pas de fuite d’existence de compte)', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    requestPasswordResetMock.mockRejectedValue(new Error('Trop d’e-mails envoyés'));
    render(<LoginPage />);

    openForgotPanel();
    fireEvent.change(screen.getByLabelText('Adresse e-mail'), {
      target: { value: 'user@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer le lien' }));

    expect(await screen.findByText(NEUTRAL_MESSAGE)).toBeInTheDocument();
    expect(toast.error).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('n’appelle pas le service sans e-mail valide', async () => {
    render(<LoginPage />);

    openForgotPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer le lien' }));

    expect(await screen.findByText('Saisissez une adresse e-mail valide.')).toBeInTheDocument();
    expect(requestPasswordResetMock).not.toHaveBeenCalled();
  });

  it('« Retour à la connexion » revient au formulaire de connexion', () => {
    render(<LoginPage />);

    openForgotPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Retour à la connexion' }));

    expect(screen.getByRole('heading', { name: 'Connexion' })).toBeInTheDocument();
    expect(screen.getByLabelText('Mot de passe')).toBeInTheDocument();
  });
});

const GOOGLE_BUTTON = /Continuer avec Google/;
const STAFF_SUBTITLE = 'Accédez à votre espace de travail.';
const PARTNER_SUBTITLE = 'Connectez-vous pour mettre à jour votre fiche.';

describe('LoginPage — premier contact partenaire (Espace partenaire)', () => {
  beforeEach(resetMocks);

  it('sans signal portail : copie et bouton Google inchangés (contrôle négatif)', () => {
    render(<LoginPage />);

    expect(screen.getByText(STAFF_SUBTITLE)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: GOOGLE_BUTTON })).toBeInTheDocument();
  });

  it('?espace=1 : sous-titre partenaire, ni séparateur ni bouton Google', () => {
    mockSearchParams.set('espace', '1');
    render(<LoginPage />);

    expect(screen.getByText(PARTNER_SUBTITLE)).toBeInTheDocument();
    expect(screen.queryByText(STAFF_SUBTITLE)).not.toBeInTheDocument();
    // Un compte invité sans profil Google finit sur un écran de session sans issue :
    // le bouton ne doit même pas être proposé.
    expect(screen.queryByRole('button', { name: GOOGLE_BUTTON })).not.toBeInTheDocument();
    expect(screen.queryByText('ou')).not.toBeInTheDocument();
    // Le formulaire e-mail / mot de passe, lui, reste entier.
    expect(screen.getByLabelText('Adresse e-mail')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Se connecter' })).toBeInTheDocument();
  });

  it('?from= sous /espace : même traitement (retour depuis le portail)', () => {
    mockSearchParams.set('from', '/espace/fiches/HOT123');
    render(<LoginPage />);

    expect(screen.getByText(PARTNER_SUBTITLE)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: GOOGLE_BUTTON })).not.toBeInTheDocument();
  });

  it('?from= back-office : copie staff conservée (le signal ne déborde pas)', () => {
    mockSearchParams.set('from', '/crm');
    render(<LoginPage />);

    expect(screen.getByText(STAFF_SUBTITLE)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: GOOGLE_BUTTON })).toBeInTheDocument();
  });

  it('?from= qui commence par « /espace » sans y être : copie staff', () => {
    mockSearchParams.set('from', '/espaces-verts');
    render(<LoginPage />);

    expect(screen.getByText(STAFF_SUBTITLE)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: GOOGLE_BUTTON })).toBeInTheDocument();
  });
});

describe('LoginPage — toast de déconnexion', () => {
  beforeEach(resetMocks);

  it('signale la déconnexion à partir de la constante partagée, pas d’un mot deviné', () => {
    // Régression fermée : la page reconnaissait le message par `includes('deconnecte')`,
    // un fragment SANS accent. Réécrire le message en français correct l'aurait rendu
    // muet sans casser aucun test.
    mockSessionState = {
      ...mockSessionState,
      errorMessage: GUEST_SIGNED_OUT_MESSAGE,
    };
    render(<LoginPage />);

    expect(toast.error).toHaveBeenCalledWith(GUEST_SIGNED_OUT_MESSAGE);
  });

  it('ne toaste pas la simple invitation à se connecter', () => {
    mockSessionState = { ...mockSessionState, errorMessage: GUEST_SIGN_IN_MESSAGE };
    render(<LoginPage />);

    expect(toast.error).not.toHaveBeenCalled();
  });
});
