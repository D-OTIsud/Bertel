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

  it('keeps non-password-policy auth errors unchanged', () => {
    const error = new AuthApiError('Invalid login credentials', 400, 'invalid_credentials');

    expect(toFriendlyAuthError(error)).toBe(error);
  });
});
