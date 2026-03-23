import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env, hasSupabaseConfig } from './env';

// Single GoTrueClient singleton. Two createClient() calls with the same credentials
// produce two GoTrueClient instances sharing the same localStorage key, which triggers
// "Multiple GoTrueClient instances detected". Use one client for all schema access:
// call .schema('api') at the call site when targeting the api schema.
let dbClient: SupabaseClient | null = null;

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

// Alias: callers that target the api schema call .schema('api') themselves.
// This avoids a second createClient() call and its duplicate GoTrueClient.
export const getApiClient = getSupabaseClient;