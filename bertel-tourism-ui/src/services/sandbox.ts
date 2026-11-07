import { createClient } from '@supabase/supabase-js';
import { env, hasSupabaseConfig } from '@/lib/env';
import { SANDBOX_AUTH_KEY, SANDBOX_MODE_KEY } from '@/lib/sandbox-mode';

let opening: Promise<void> | null = null;

async function openDiscoverySession(): Promise<void> {
  if (!hasSupabaseConfig || !env.supabaseUrl || !env.supabaseAnonKey) {
    throw new Error('L’espace de test est indisponible pour le moment.');
  }
  const response = await fetch('/api/sandbox/session', { method: 'POST', cache: 'no-store' });
  if (!response.ok) throw new Error(response.status === 429
    ? 'Trop de tentatives. Patientez une minute puis réessayez.'
    : 'L’espace de test est indisponible pour le moment. Réessayez dans un instant.');
  const tokens = await response.json() as { access_token?: string; refresh_token?: string };
  if (!tokens.access_token || !tokens.refresh_token) throw new Error('La session de test n’a pas pu être ouverte.');
  // Stockage distinct et limité à l’onglet : aucun token de travail n’est remplacé.
  const client = createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: { storageKey: SANDBOX_AUTH_KEY, storage: window.sessionStorage, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await client.auth.setSession({ access_token: tokens.access_token, refresh_token: tokens.refresh_token });
  if (error || data.user?.app_metadata?.sandbox_discovery !== true) {
    window.sessionStorage.removeItem(SANDBOX_AUTH_KEY);
    throw new Error('La session de test n’a pas pu être vérifiée.');
  }
  const realm = await client.schema('api').rpc('current_user_test_realm');
  if (realm.error || realm.data !== true) {
    window.sessionStorage.removeItem(SANDBOX_AUTH_KEY);
    throw new Error('L’espace de test n’est pas encore prêt.');
  }
  window.sessionStorage.setItem(SANDBOX_MODE_KEY, 'true');
}

/** Une seule ouverture même sous le double montage React StrictMode. */
export function enterSandbox(): Promise<void> {
  if (!opening) opening = openDiscoverySession().finally(() => { opening = null; });
  return opening;
}

export function leaveSandbox(): void {
  window.sessionStorage.removeItem(SANDBOX_MODE_KEY);
  window.sessionStorage.removeItem(SANDBOX_AUTH_KEY);
  window.sessionStorage.removeItem('bertel-test-rq-cache');
}
