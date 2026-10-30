import { getApiClient } from '../lib/supabase';
import { env } from '../lib/env';

const DEMO_KEY = 'bertel-demo-provider-only';

export function readDemoProviderPreference(): boolean {
  try { return localStorage.getItem(DEMO_KEY) === 'true'; } catch { return false; }
}

export async function saveProviderPreference(enabled: boolean): Promise<void> {
  if (env.demoMode) {
    localStorage.setItem(DEMO_KEY, String(enabled));
    return;
  }
  const client = getApiClient();
  if (!client) throw new Error('Session utilisateur indisponible.');
  const { data, error } = await client.schema('api').rpc('set_provider_only_preference', { p_enabled: enabled });
  if (error) throw error;
  if (data !== enabled) throw new Error('La préférence n’a pas été enregistrée.');
}
