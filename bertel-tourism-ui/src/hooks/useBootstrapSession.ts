import { useEffect } from 'react';
import { AuthSessionMissingError } from '@supabase/supabase-js';
import type { AuthChangeEvent } from '@supabase/supabase-js';
import { getApiClient, getSupabaseClient } from '../lib/supabase';
import { getOrCreateUserProfile, readLangPrefsFromAuth } from '../services/user-profile';
import { GUEST_SIGN_IN_MESSAGE, GUEST_SIGNED_OUT_MESSAGE, useSessionStore } from '../store/session-store';
import type { UserRole } from '../types/domain';
import { isSandboxMode } from '../lib/sandbox-mode';
import { leaveSandbox } from '../services/sandbox';
import { clearServiceAvailabilityForSessionTransition } from '../services/service-availability';
import { sessionAvatarInitials as initialsFromName } from '../utils/avatar-initials';
import { useProviderScopeStore } from '../store/provider-scope-store';
import { readDemoProviderPreference } from '../services/provider-preference';

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

// Resolves the user's "can create a fiche" capability from `api.user_can_create_object()`
// (active ORG membership AND the `create_object` permission). Strictly narrower than
// canEditObjects. Returns false on any error so the "Créer une fiche" CTA stays hidden
// by default (fail-closed); the RPC re-checks server-side anyway.
async function fetchCanCreateObjects(): Promise<boolean> {
  const apiClient = getApiClient();
  if (!apiClient) {
    return false;
  }

  try {
    const { data, error } = await apiClient.schema('api').rpc('user_can_create_object');
    if (error) {
      console.warn('user_can_create_object unavailable, hiding create CTA.', error);
      return false;
    }
    return data === true;
  } catch (err) {
    console.warn('user_can_create_object threw, hiding create CTA.', err);
    return false;
  }
}

// Resolves the current user's active organisation (id + name) for UI labels.
// Returns nulls when unavailable — the label degrades to a generic string.
async function fetchActiveOrg(): Promise<{ orgId: string | null; orgName: string | null }> {
  const apiClient = getApiClient();
  if (!apiClient) {
    return { orgId: null, orgName: null };
  }
  try {
    const { data, error } = await apiClient.schema('api').rpc('current_user_active_org');
    if (error) {
      console.warn('current_user_active_org unavailable.', error);
      return { orgId: null, orgName: null };
    }
    const row = Array.isArray(data) ? data[0] : data;
    return { orgId: row?.org_id ?? null, orgName: row?.org_name ?? null };
  } catch (err) {
    console.warn('current_user_active_org threw.', err);
    return { orgId: null, orgName: null };
  }
}

// Resolves whether the current user belongs to a sandbox organisation, from
// `api.current_user_test_realm()` — la MEME feuille que la garde SQL. On ne
// re-transcrit surtout pas la regle en TypeScript : c'est ainsi qu'on cree une
// divergence front/serveur (§214, §17c). Purement indicatif — le cloisonnement
// est fait par le serveur, ce drapeau ne fait que l'AFFICHER.
// Faux par defaut : afficher a tort « bac a sable » sur la production ferait
// croire a un testeur qu'il peut casser des fiches reelles.
async function fetchTestRealm(): Promise<boolean> {
  const apiClient = getApiClient();
  if (!apiClient) return false;
  try {
    const { data, error } = await apiClient.schema('api').rpc('current_user_test_realm');
    if (error) {
      console.warn('current_user_test_realm unavailable, assuming production realm.', error);
      return false;
    }
    return data === true;
  } catch (err) {
    console.warn('current_user_test_realm threw, assuming production realm.', err);
    return false;
  }
}

// Resolves the current user's team-admin rank from `api.current_user_admin_rank()`.
// Returns null when the user has no admin role or the helper is unavailable.
async function fetchAdminRank(): Promise<number | null> {
  const apiClient = getApiClient();
  if (!apiClient) return null;
  try {
    const { data, error } = await apiClient.schema('api').rpc('current_user_admin_rank');
    if (error) { console.warn('current_user_admin_rank unavailable.', error); return null; }
    return typeof data === 'number' ? data : null;
  } catch (err) { console.warn('current_user_admin_rank threw.', err); return null; }
}

// Resolves the current user's team-admin role code from `api.current_user_admin_role_code()`.
// Returns null when the user has no admin role or the helper is unavailable.
async function fetchAdminRoleCode(): Promise<string | null> {
  const apiClient = getApiClient();
  if (!apiClient) return null;
  try {
    const { data, error } = await apiClient.schema('api').rpc('current_user_admin_role_code');
    if (error) { console.warn('current_user_admin_role_code unavailable.', error); return null; }
    return typeof data === 'string' ? data : null;
  } catch (err) { console.warn('current_user_admin_role_code threw.', err); return null; }
}

// Allowlist stricte, jamais un cast : un rôle inconnu doit rendre null pour tomber dans
// `setSessionError` plus bas. La persona `actor` (18a) doit donc y figurer explicitement,
// sans quoi un partenaire authentifié se retrouve bloqué sur l'écran de session.
function normalizeRole(value: unknown): UserRole | null {
  return value === 'super_admin' || value === 'tourism_agent' || value === 'owner' || value === 'actor'
    ? value
    : null;
}

export function useBootstrapSession() {
  const demoMode = useSessionStore((state) => state.demoMode);
  const setBooting = useSessionStore((state) => state.setBooting);
  const hydrateFromAuth = useSessionStore((state) => state.hydrateFromAuth);
  const setSessionError = useSessionStore((state) => state.setSessionError);
  const setGuest = useSessionStore((state) => state.setGuest);
  const observeAuthUser = useSessionStore((state) => state.observeAuthUser);

  useEffect(() => {
    if (demoMode) {
      useProviderScopeStore.getState().initialize(useSessionStore.getState().userId ?? 'demo', readDemoProviderPreference());
      return undefined;
    }

    const client = getSupabaseClient();
    if (!client) {
      setSessionError('Supabase n est pas configure. Renseignez NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY ou activez explicitement le mode demo.');
      return undefined;
    }

    const authClient = client;
    let cancelled = false;
    let generation = 0;
    let pendingSync: ReturnType<typeof setTimeout> | null = null;
    const isCurrent = (run: number) => !cancelled && run === generation;

    async function syncUser(
      activeClient: NonNullable<ReturnType<typeof getSupabaseClient>>,
      run: number,
      options: { preserveReadyState?: boolean; authEvent?: AuthChangeEvent } = {},
    ) {
      const currentStatus = useSessionStore.getState().status;
      if (!(options.preserveReadyState && currentStatus === 'ready')) {
        setBooting();
      }

      const { data, error } = await activeClient.auth.getUser();
      if (!isCurrent(run)) {
        return;
      }

      // supabase-js v2 : un visiteur sans session recoit AuthSessionMissingError
      // (et non user=null) — c'est l'etat invite normal, pas une panne. Le laisser
      // tomber dans setGuest ci-dessous declenche la redirection /login des layouts.
      if (error && !(error instanceof AuthSessionMissingError)) {
        setSessionError('Impossible de recuperer la session Supabase.');
        return;
      }

      if (!data.user) {
        if (isSandboxMode()) {
          leaveSandbox();
          window.location.replace('/login');
          return;
        }
        setGuest(
          options.authEvent === 'SIGNED_OUT' ? GUEST_SIGNED_OUT_MESSAGE : GUEST_SIGN_IN_MESSAGE,
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
      if (!isCurrent(run)) return;
      const role = profileRole ?? metadataRole;
      if (!role) {
        setSessionError('Le role utilisateur est absent (session Supabase et table app_user_profile).');
        return;
      }

      const userName = String(profile?.display_name ?? fallbackName);
      const langPrefs = Array.isArray(profile?.lang_prefs) && profile.lang_prefs.every((item) => typeof item === 'string')
        ? profile.lang_prefs
        : fallbackLangPrefs;

      // Persona partenaire (18a) : aucune des sondes back-office ne s'applique — on hydrate
      // directement avec les valeurs neutres au lieu de payer 5 allers-retours qui
      // rendraient tous false/null. Le portail fait ses propres lectures.
      if (role === 'actor') {
        const isTestRealm = await fetchTestRealm();
        if (!isCurrent(run)) return;
        useProviderScopeStore.getState().initialize(user.id, profile?.preferences?.provider_only === true);
        hydrateFromAuth({
          isTestRealm,
          role,
          userId: user.id,
          email: String(user.email ?? ''),
          userName,
          avatar: initialsFromName(userName),
          avatarUrl: typeof profile?.avatar_url === 'string' && profile.avatar_url.length > 0 ? profile.avatar_url : null,
          langPrefs,
          canEditObjects: false,
          canCreateObjects: false,
          orgId: null,
          orgName: null,
          adminRank: null,
          adminRoleCode: null,
        });
        return;
      }

      // These read-only probes depend on the authenticated user, not on each
      // other. Keep profile/persona resolution ahead of the batch and publish
      // only its complete result for the still-current auth generation.
      const [canEditObjects, canCreateObjects, activeOrg, adminRank, adminRoleCode, isTestRealm] = await Promise.all([
        fetchCanEditObjects(),
        fetchCanCreateObjects(),
        fetchActiveOrg(),
        fetchAdminRank(),
        fetchAdminRoleCode(),
        fetchTestRealm(),
      ]);
      if (!isCurrent(run)) {
        return;
      }
      if (isSandboxMode() && !isTestRealm) {
        setSessionError('Le cloisonnement de l’espace de test n’a pas pu être vérifié. Revenez à la connexion pour réessayer.');
        return;
      }

      useProviderScopeStore.getState().initialize(user.id, profile?.preferences?.provider_only === true);
      hydrateFromAuth({
        role,
        userId: user.id,
        email: String(user.email ?? ''),
        userName,
        avatar: initialsFromName(userName),
        avatarUrl: typeof profile?.avatar_url === 'string' && profile.avatar_url.length > 0 ? profile.avatar_url : null,
        langPrefs,
        canEditObjects,
        canCreateObjects,
        orgId: activeOrg.orgId,
        orgName: activeOrg.orgName,
        adminRank,
        adminRoleCode,
        isTestRealm,
      });
    }

    function scheduleSync(event?: AuthChangeEvent, authUserId: string | null = null) {
      if (cancelled) return;
      // Invalidate running work immediately, even while the auth callback holds
      // Supabase's lock. Only the newest generation may publish any state.
      const run = ++generation;
      // An SDK token can already belong to B while the visible profile remains
      // A. Revoke A's write authority synchronously, without changing its screen
      // or calling another Auth API under the notification lock.
      observeAuthUser(authUserId);
      if (pendingSync !== null) clearTimeout(pendingSync);
      pendingSync = null;
      // Do not leave a prior user's capability result visible while session bootstrap
      // resolves a sign-in/sign-out event (including a quick same-user reconnection).
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
        clearServiceAvailabilityForSessionTransition();
      }
      if (event === 'SIGNED_OUT') {
        setGuest(GUEST_SIGNED_OUT_MESSAGE);
        if (isSandboxMode()) {
          leaveSandbox();
          window.location.replace('/login');
        }
        return;
      }
      // Never call another Supabase API from inside onAuthStateChange: even a
      // non-awaited getUser() can wait on the lock held by that notification.
      // Coalesce the fallback bootstrap and INITIAL_SESSION if both are pending.
      pendingSync = setTimeout(() => {
        pendingSync = null;
        if (!isCurrent(run)) return;
        void syncUser(authClient, run, { preserveReadyState: event !== undefined, authEvent: event }).catch(() => {
          if (isCurrent(run)) setSessionError('Impossible de recuperer la session Supabase.');
        });
      }, 0);
    }

    const {
      data: { subscription },
    } = authClient.auth.onAuthStateChange((event, session) => { scheduleSync(event, session?.user.id ?? null); });
    // Some clients deliver INITIAL_SESSION synchronously while subscribing.
    // Do not supersede that event (especially SIGNED_OUT) with the fallback.
    if (generation === 0) scheduleSync();

    return () => {
      cancelled = true;
      generation += 1;
      if (pendingSync !== null) clearTimeout(pendingSync);
      subscription.unsubscribe();
    };
  }, [demoMode, hydrateFromAuth, observeAuthUser, setBooting, setGuest, setSessionError]);
}
