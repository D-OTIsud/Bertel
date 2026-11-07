import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readServerEnv } from './env.server';

let serverClient: SupabaseClient | null = null;

/**
 * Server-only Supabase client keyed with the service-role secret.
 * MUST only be imported from server code (route handlers, server actions).
 * Importing from a client component will fail at build time via env.server's
 * `import 'server-only'` guard.
 */
export function getServerSupabaseClient(): SupabaseClient | null {
  if (serverClient) return serverClient;
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
  const { supabaseServiceRoleKey } = readServerEnv();
  if (!url || !supabaseServiceRoleKey) return null;
  serverClient = createClient(url, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return serverClient;
}

/** Test-only helper to clear the singleton between cases. */
export function __resetServerSupabaseClientForTests(): void {
  serverClient = null;
}
