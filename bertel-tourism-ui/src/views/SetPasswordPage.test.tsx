import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import SetPasswordPage from './SetPasswordPage';
import { getSupabaseClient } from '../lib/supabase';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn() }),
}));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('../store/theme-store', () => ({
  useThemeStore: (
    selector: (state: { theme: { brandName: string; logoUrl: string | null } }) => unknown,
  ) => selector({ theme: { brandName: 'OTI du Sud', logoUrl: null } }),
}));
jest.mock('../lib/supabase', () => ({
  getSupabaseClient: jest.fn(),
}));

type AuthCallback = (event: string, session: unknown) => void;

function mockSupabaseAuth() {
  let callback: AuthCallback = () => {};
  const updateUser = jest.fn().mockResolvedValue({ error: null });
  const client = {
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: jest.fn((cb: AuthCallback) => {
        callback = cb;
        return { data: { subscription: { unsubscribe: jest.fn() } } };
      }),
      updateUser,
    },
  };
  jest.mocked(getSupabaseClient).mockReturnValue(client as never);
  return {
    updateUser,
    fireAuthEvent: (event: string) => act(() => callback(event, { user: {} })),
  };
}

describe('SetPasswordPage — copie invitation vs réinitialisation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('accueil invitation par défaut (SIGNED_IN) : « Bienvenue dans l’équipe »', () => {
    const { fireAuthEvent } = mockSupabaseAuth();
    render(<SetPasswordPage />);

    fireAuthEvent('SIGNED_IN');

    expect(screen.getByRole('heading', { name: 'Bienvenue dans l’équipe' })).toBeInTheDocument();
    expect(
      screen.getByText('Choisissez votre mot de passe pour activer votre compte.'),
    ).toBeInTheDocument();
  });

  it('PASSWORD_RECOVERY : « Réinitialisez votre mot de passe » et sous-titre adapté', () => {
    const { fireAuthEvent } = mockSupabaseAuth();
    render(<SetPasswordPage />);

    // séquence réelle : les tokens du hash déclenchent SIGNED_IN puis PASSWORD_RECOVERY
    fireAuthEvent('SIGNED_IN');
    fireAuthEvent('PASSWORD_RECOVERY');

    expect(
      screen.getByRole('heading', { name: 'Réinitialisez votre mot de passe' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Choisissez un nouveau mot de passe pour votre compte.'),
    ).toBeInTheDocument();
  });

  it('lien invalide : copie neutre, valable pour une invitation comme une réinitialisation', () => {
    jest.mocked(getSupabaseClient).mockReturnValue(null as never);
    render(<SetPasswordPage />);

    expect(screen.getByText(/Ce lien est invalide ou a expiré/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Aller à la page de connexion' }),
    ).toBeInTheDocument();
  });

  it('en réinitialisation, le succès n’affiche pas la copie « bienvenue » de l’invitation', async () => {
    const { fireAuthEvent, updateUser } = mockSupabaseAuth();
    render(<SetPasswordPage />);

    fireAuthEvent('PASSWORD_RECOVERY');

    fireEvent.change(screen.getByLabelText('Nouveau mot de passe'), {
      target: { value: 'motdepasse-solide' },
    });
    fireEvent.change(screen.getByLabelText('Confirmer le mot de passe'), {
      target: { value: 'motdepasse-solide' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer/ }));

    await waitFor(() => expect(updateUser).toHaveBeenCalledWith({ password: 'motdepasse-solide' }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Mot de passe mis à jour.'));
  });
});
