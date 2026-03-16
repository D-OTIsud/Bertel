import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env, hasSupabaseConfig } from './env';

let dbClient: SupabaseClient | null = null;
let apiClient: SupabaseClient | null = null;

// Client standard: schema par defaut `public` pour les tables et le storage
export function getSupabaseClient(): SupabaseClient | null {
  if (!hasSupabaseConfig || !env.supabaseUrl || !env.supabaseAnonKey) {
    return null;
  }

  if (!dbClient) {
    dbClient = createClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    });
  }

  return dbClient;
}

// Client API: dedie aux RPC sur le schema `api`
export function getApiClient(): SupabaseClient | null {
  if (!hasSupabaseConfig || !env.supabaseUrl || !env.supabaseAnonKey) {
    return null;
  }

  if (!apiClient) {
    apiClient = createClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
      db: {
        schema: 'api',
      },
    });
  }

  return apiClient;
}