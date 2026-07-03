import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import LoginPage from './LoginPage';
import { requestPasswordReset } from '../services/auth';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn() }),
  useSearchParams: () => ({ get: () => null }),
}));
jest.mock('../store/session-store', () => ({
  useSessionStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      status: 'guest',
      role: null,
      demoMode: false,
      errorMessage: null,
      setGuest: jest.fn(),
    }),
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

describe('LoginPage — mot de passe oublié', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requestPasswordResetMock.mockResolvedValue(undefined);
  });

  it('affiche un lien discret « Mot de passe oublié ? » dans la carte de connexion', () => {
    render(<LoginPage />);

    expect(screen.getByRole('button', { name: 'Mot de passe oublié ?' })).toBeInTheDocument();
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
