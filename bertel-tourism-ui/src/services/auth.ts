import { isAuthApiError, isAuthWeakPasswordError, type WeakPasswordReasons } from '@supabase/supabase-js';
import { getSupabaseClient } from '../lib/supabase';

const weakPasswordReasonLabels: Readonly<Record<WeakPasswordReasons, string>> = {
  length: 'longueur minimale non respectee',
  characters: 'caracteres obligatoires manquants',
  pwned: 'mot de passe deja divulgue dans une fuite de donnees',
};

/** D14/D15 — codes AuthApiError (GoTrue v2) → messages FR actionnables. */
const AUTH_ERROR_LABELS: Readonly<Record<string, string>> = {
  invalid_credentials: 'Identifiants invalides — vérifiez l’e-mail et le mot de passe.',
  email_not_confirmed: 'E-mail non confirmé — ouvrez le lien reçu dans votre boîte de réception.',
  user_not_found: 'Aucun compte ne correspond à cet e-mail.',
  user_banned: 'Ce compte est suspendu — contactez votre administrateur.',
  over_request_rate_limit: 'Trop de tentatives — patientez quelques minutes puis réessayez.',
  over_email_send_rate_limit: 'Trop d’e-mails envoyés — patientez quelques minutes puis réessayez.',
  session_expired: 'Session expirée — reconnectez-vous.',
  refresh_token_not_found: 'Session expirée — reconnectez-vous.',
  same_password: 'Le nouveau mot de passe doit être différent de l’actuel.',
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

  // D14/D15 — plus aucune chaîne EN brute du backend ne remonte au toast :
  // code connu → FR dédié ; sinon repli FR générique (le brut part en console
  // pour le diagnostic).
  if (isAuthApiError(error)) {
    const label = error.code ? AUTH_ERROR_LABELS[error.code] : undefined;
    if (label) {
      return new Error(label);
    }
    console.warn('[auth] erreur non mappée', error.code, error.message);
    return new Error('Connexion impossible — réessayez ou contactez votre administrateur.');
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

// Envoie l'e-mail de réinitialisation ; le lien atterrit sur /set-password (même
// mécanique que l'invitation §164 : tokens dans le hash, consommés par supabase-js).
// L'appelant est responsable de la réponse neutre côté UI (ne pas révéler
// l'existence d'un compte) ; ici on propage l'erreur pour le diagnostic.
export async function requestPasswordReset(email: string) {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error('Supabase non configure.');
  }

  const { error } = await client.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/set-password`,
  });
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
