import { renderHook, waitFor } from '@testing-library/react';
import { AuthSessionMissingError } from '@supabase/supabase-js';
import { useBootstrapSession } from './useBootstrapSession';
import { getApiClient, getSupabaseClient } from '../lib/supabase';
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

// --- Persona acteur (portail 18a) -------------------------------------------------

function makeSignedInClient(user: Record<string, unknown>) {
  return {
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user }, error: null }),
      onAuthStateChange: jest
        .fn()
        .mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } }),
    },
  } as unknown as ReturnType<typeof getSupabaseClient>;
}

describe('useBootstrapSession — persona actor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSessionStore.setState({ demoMode: false, status: 'booting', errorMessage: null });
  });

  it("hydrate l'acteur sans payer une seule sonde back-office", async () => {
    (getSupabaseClient as jest.Mock).mockReturnValue(
      makeSignedInClient({
        id: 'usr-actor-1',
        email: 'gite@example.com',
        app_metadata: { role: 'actor' },
        user_metadata: { full_name: 'Gite du Pic' },
      }),
    );

    renderHook(() => useBootstrapSession());

    await waitFor(() => expect(useSessionStore.getState().status).toBe('ready'));
    const state = useSessionStore.getState();
    expect(state.role).toBe('actor');
    expect(state.userName).toBe('Gite du Pic');
    // Valeurs neutres : l'acteur n'édite ni ne crée rien dans le back-office et
    // n'appartient à aucune ORG côté session.
    expect(state.canEditObjects).toBe(false);
    expect(state.canCreateObjects).toBe(false);
    expect(state.orgId).toBeNull();
    expect(state.orgName).toBeNull();
    expect(state.adminRank).toBeNull();
    expect(state.adminRoleCode).toBeNull();
    // Le court-circuit est la raison d'être du bloc : aucune des 5 RPC back-office
    // ne doit partir. Toutes passent par getApiClient — s'il n'est jamais appelé,
    // aucune n'a été tentée.
    expect(getApiClient).not.toHaveBeenCalled();
  });

  it("refuse toujours un rôle inconnu (la garde de normalizeRole n'a pas été élargie)", async () => {
    (getSupabaseClient as jest.Mock).mockReturnValue(
      makeSignedInClient({
        id: 'usr-x',
        email: 'x@example.com',
        app_metadata: { role: 'wizard' },
        user_metadata: {},
      }),
    );

    renderHook(() => useBootstrapSession());

    await waitFor(() => expect(useSessionStore.getState().status).toBe('error'));
    expect(useSessionStore.getState().errorMessage).toContain('role utilisateur est absent');
  });
});
