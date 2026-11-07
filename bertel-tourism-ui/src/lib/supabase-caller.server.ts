import { createClient } from '@supabase/supabase-js';
import { supabaseServerFetch } from './supabase-fetch.server';

/** A fresh caller-scoped client. Routes retain their own authentication and permission gates. */
export function createCallerClient(url: string, anonKey: string, jwt: string) {
  return createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` }, fetch: supabaseServerFetch },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
