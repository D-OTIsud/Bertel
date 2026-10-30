import { createClient } from '@supabase/supabase-js';

/** A fresh caller-scoped client. Routes retain their own authentication and permission gates. */
export function createCallerClient(url: string, anonKey: string, jwt: string) {
  return createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
