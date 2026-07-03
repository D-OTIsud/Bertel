import { renderHook, waitFor } from '@testing-library/react';
import { AuthSessionMissingError } from '@supabase/supabase-js';
import { useBootstrapSession } from './useBootstrapSession';
import { getSupabaseClient } from '../lib/supabase';
import { useSessionStore } from '../store/session-store';

jest.mock('../lib/supabase', () => ({ getSupabaseClient: jest.fn(), getApiClient: jest.fn() }));
jest.mock('../services/user-profile', () => ({
  getOrCreateUserProfile: jest.fn(),
  readLangPrefsFromAuth: jest.fn(() => ['fr']),
}));

function makeAuthClient(getUserResult: unknown) {
  return {
    auth: {
      getUser: jest.fn().mockResolvedValue(getUserResult),
      onAuthStateChange: jest
        .fn()
        .mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } }),
    },
  } as unknown as ReturnType<typeof getSupabaseClient>;
}

describe('useBootstrapSession', () => {
  beforeEach(() => {
    useSessionStore.setState({ demoMode: false, status: 'booting', errorMessage: null });
  });

  it("visiteur sans session (AuthSessionMissingError) => statut 'guest', pas 'error' (redirection /login)", async () => {
    (getSupabaseClient as jest.Mock).mockReturnValue(
      makeAuthClient({ data: { user: null }, error: new AuthSessionMissingError() }),
    );

    renderHook(() => useBootstrapSession());

    await waitFor(() => expect(useSessionStore.getState().status).toBe('guest'));
  });

  it("vraie panne auth (erreur autre que session manquante) => statut 'error'", async () => {
    (getSupabaseClient as jest.Mock).mockReturnValue(
      makeAuthClient({ data: { user: null }, error: new Error('fetch failed') }),
    );

    renderHook(() => useBootstrapSession());

    await waitFor(() => expect(useSessionStore.getState().status).toBe('error'));
    expect(useSessionStore.getState().errorMessage).toContain('Impossible de recuperer la session');
  });
});
