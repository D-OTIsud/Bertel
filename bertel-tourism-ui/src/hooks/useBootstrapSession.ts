import { useEffect } from 'react';
import type { AuthChangeEvent, User } from '@supabase/supabase-js';
import { getSupabaseClient } from '../lib/supabase';
import { useSessionStore } from '../store/session-store';
import type { UserRole } from '../types/domain';

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

function readLangPrefs(user: User): string[] {
  const fromMetadata = user.user_metadata?.lang_prefs ?? user.user_metadata?.langPrefs;
  if (Array.isArray(fromMetadata) && fromMetadata.every((item) => typeof item === 'string')) {
    return fromMetadata;
  }
  return ['fr', 'en'];
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
      setSessionError('Supabase n est pas configure. Renseignez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY ou activez explicitement le mode demo.');
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
      const role = normalizeRole(user.app_metadata?.role ?? user.user_metadata?.role);
      if (!role) {
        setSessionError('Le role Supabase est absent de la session. Attendez un claim role dans app_metadata ou user_metadata.');
        return;
      }

      const userName = String(user.user_metadata?.full_name ?? user.email ?? user.id);
      hydrateFromAuth({
        role,
        userId: user.id,
        userName,
        avatar: initialsFromName(userName),
        langPrefs: readLangPrefs(user),
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