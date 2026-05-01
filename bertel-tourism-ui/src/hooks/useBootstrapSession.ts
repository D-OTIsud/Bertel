import { useEffect } from 'react';
import type { AuthChangeEvent } from '@supabase/supabase-js';
import { getApiClient, getSupabaseClient } from '../lib/supabase';
import { getOrCreateUserProfile, readLangPrefsFromAuth } from '../services/user-profile';
import { useSessionStore } from '../store/session-store';
import type { UserRole } from '../types/domain';

// Resolves the user's "can edit any object" capability from the SQL helper
// `api.current_user_can_edit_objects()`. Returns false if the helper is
// unavailable or fails — keeps the Explorer's published-only default safe.
async function fetchCanEditObjects(): Promise<boolean> {
  const apiClient = getApiClient();
  if (!apiClient) {
    return false;
  }

  try {
    const { data, error } = await apiClient.schema('api').rpc('current_user_can_edit_objects');
    if (error) {
      console.warn('current_user_can_edit_objects unavailable, defaulting to read-only.', error);
      return false;
    }
    return data === true;
  } catch (err) {
    console.warn('current_user_can_edit_objects threw, defaulting to read-only.', err);
    return false;
  }
}

function normalizeRole(value: unknown): UserRole | null {
  return value === 'super_admin' || value === 'tourism_agent' || value === 'owner' ? value : null;
}

function initialsFromName(name: string): string {
  const parts = name
    .split(' ')
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) {
    return '--';
  }

  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('');
}

export function useBootstrapSession() {
  const demoMode = useSessionStore((state) => state.demoMode);
  const setBooting = useSessionStore((state) => state.setBooting);
  const hydrateFromAuth = useSessionStore((state) => state.hydrateFromAuth);
  const setSessionError = useSessionStore((state) => state.setSessionError);
  const setGuest = useSessionStore((state) => state.setGuest);

  useEffect(() => {
    if (demoMode) {
      return undefined;
    }

    const client = getSupabaseClient();
    if (!client) {
      setSessionError('Supabase n est pas configure. Renseignez NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY ou activez explicitement le mode demo.');
      return undefined;
    }

    let cancelled = false;

    async function syncUser(
      activeClient: NonNullable<ReturnType<typeof getSupabaseClient>>,
      options: { preserveReadyState?: boolean; authEvent?: AuthChangeEvent } = {},
    ) {
      const currentStatus = useSessionStore.getState().status;
      if (!(options.preserveReadyState && currentStatus === 'ready')) {
        setBooting();
      }

      const { data, error } = await activeClient.auth.getUser();
      if (cancelled) {
        return;
      }

      if (error) {
        setSessionError('Impossible de recuperer la session Supabase.');
        return;
      }

      if (!data.user) {
        setGuest(
          options.authEvent === 'SIGNED_OUT'
            ? 'Vous avez ete deconnecte. Reconnectez-vous avec Google.'
            : 'Connectez-vous avec Google pour acceder a la plateforme.',
        );
        return;
      }

      const user = data.user;
      const metadataRole = normalizeRole(user.app_metadata?.role ?? user.user_metadata?.role);
      const fallbackName = String(user.user_metadata?.full_name ?? user.email ?? user.id);
      const fallbackLangPrefs = readLangPrefsFromAuth(user);
      const profile = await getOrCreateUserProfile(user, {
        role: metadataRole,
        displayName: fallbackName,
        langPrefs: fallbackLangPrefs,
      });
      const profileRole = normalizeRole(profile?.role);
      const role = profileRole ?? metadataRole;
      if (!role) {
        setSessionError('Le role utilisateur est absent (session Supabase et table app_user_profile).');
        return;
      }

      const userName = String(profile?.display_name ?? fallbackName);
      const langPrefs = Array.isArray(profile?.lang_prefs) && profile.lang_prefs.every((item) => typeof item === 'string')
        ? profile.lang_prefs
        : fallbackLangPrefs;

      const canEditObjects = await fetchCanEditObjects();
      if (cancelled) {
        return;
      }

      hydrateFromAuth({
        role,
        userId: user.id,
        email: String(user.email ?? ''),
        userName,
        avatar: initialsFromName(userName),
        langPrefs,
        canEditObjects,
      });
    }

    void syncUser(client);
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((event) => {
      void syncUser(client, { preserveReadyState: true, authEvent: event });
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [demoMode, hydrateFromAuth, setBooting, setGuest, setSessionError]);
}
