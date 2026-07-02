import { AuthApiError, AuthWeakPasswordError } from '@supabase/supabase-js';
import { getSupabaseClient } from '../lib/supabase';
import { signInWithEmailPassword, toFriendlyAuthError } from './auth';

jest.mock('../lib/supabase', () => ({
  getSupabaseClient: jest.fn(),
}));

const mockedGetSupabaseClient = jest.mocked(getSupabaseClient);

describe('auth service', () => {
  beforeEach(() => {
    mockedGetSupabaseClient.mockReset();
  });

  it('translates leaked-password errors into a clear message', async () => {
    const signInWithPassword = jest
      .fn()
      .mockResolvedValue({ error: new AuthWeakPasswordError('Password is leaked', 400, ['pwned']) });

    mockedGetSupabaseClient.mockReturnValue({
      auth: {
        signInWithPassword,
      },
    } as never);

    await expect(signInWithEmailPassword('user@example.com', 'hunter2')).rejects.toThrow(
      "Ce mot de passe n'est plus accepte par la politique de securite du projet (mot de passe deja divulgue dans une fuite de donnees). Utilisez un mot de passe plus robuste ou demandez sa reinitialisation."
    );
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: 'user@example.com',
      password: 'hunter2',
    });
  });

  it('D14 : mappe les codes AuthApiError connus en FR (plus de chaîne EN au toast)', () => {
    const error = new AuthApiError('Invalid login credentials', 400, 'invalid_credentials');

    expect(toFriendlyAuthError(error).message).toBe(
      'Identifiants invalides — vérifiez l’e-mail et le mot de passe.',
    );
  });

  it('D14 : repli FR générique sur un code AuthApiError inconnu (brut en console)', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const error = new AuthApiError('Something exotic happened', 500, 'exotic_code');

    expect(toFriendlyAuthError(error).message).toBe(
      'Connexion impossible — réessayez ou contactez votre administrateur.',
    );
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('les erreurs non-auth (Error applicative) passent inchangées', () => {
    const error = new Error('Erreur métier déjà en français');
    expect(toFriendlyAuthError(error)).toBe(error);
  });
});
