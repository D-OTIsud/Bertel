import { getSupabaseClient } from '../lib/supabase';

export async function signInWithGoogle() {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error('Supabase non configure pour l authentification Google.');
  }

  const { error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin,
      queryParams: {
        access_type: 'offline',
        prompt: 'select_account',
      },
    },
  });

  if (error) {
    throw error;
  }
}

export async function signInWithEmailPassword(email: string, password: string) {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error('Supabase non configure.');
  }

  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signOut() {
  const client = getSupabaseClient();
  if (!client) {
    return;
  }

  const { error } = await client.auth.signOut();
  if (error) {
    throw error;
  }
}