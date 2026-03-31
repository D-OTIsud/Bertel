import { isAuthWeakPasswordError, type WeakPasswordReasons } from '@supabase/supabase-js';
import { getSupabaseClient } from '../lib/supabase';

const weakPasswordReasonLabels: Readonly<Record<WeakPasswordReasons, string>> = {
  length: 'longueur minimale non respectee',
  characters: 'caracteres obligatoires manquants',
  pwned: 'mot de passe deja divulgue dans une fuite de donnees',
};

export function toFriendlyAuthError(error: unknown): Error {
  if (isAuthWeakPasswordError(error)) {
    const reasons = [...new Set(error.reasons)]
      .map((reason) => weakPasswordReasonLabels[reason])
      .filter(Boolean)
      .join(', ');
    const detail = reasons ? ` (${reasons}).` : '.';

    return new Error(
      `Ce mot de passe n'est plus accepte par la politique de securite du projet${detail} Utilisez un mot de passe plus robuste ou demandez sa reinitialisation.`
    );
  }

  if (error instanceof Error) {
    return error;
  }

  return new Error('Une erreur d authentification est survenue.');
}

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
    throw toFriendlyAuthError(error);
  }
}

export async function signInWithEmailPassword(email: string, password: string) {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error('Supabase non configure.');
  }

  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw toFriendlyAuthError(error);
}

export async function signOut() {
  const client = getSupabaseClient();
  if (!client) {
    return;
  }

  const { error } = await client.auth.signOut();
  if (error) {
    throw toFriendlyAuthError(error);
  }
}
