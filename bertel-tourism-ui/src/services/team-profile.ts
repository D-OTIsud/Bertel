// Identité d'un MEMBRE vue par un administrateur (panneau Équipe).
//
// Deux natures d'appels, délibérément séparées :
//  · l'identité passe par /api/admin/user-profile (service-role gardé serveur) ;
//  · les deux envois de lien passent en DIRECT par GoTrue, parce que resetPasswordForEmail et
//    signInWithOtp sont des endpoints PUBLICS : les router côté serveur avec la service key
//    n'ajouterait aucune barrière, seulement une surface d'attaque. La session de l'appelant
//    n'est pas affectée — le lien n'authentifie que le navigateur qui le clique.

import { getSupabaseClient } from '../lib/supabase';
import { rbacRouteError } from './rbac';

export interface MemberProfile {
  displayName: string | null;
  avatarUrl: string | null;
  email: string | null;
  platformRole: string | null;
  lastSignInAt: string | null;
}

async function authHeader(): Promise<Record<string, string>> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase non configuré.');
  const token = (await client.auth.getSession()).data.session?.access_token;
  if (!token) throw new Error('Session expirée — reconnectez-vous.');
  return { authorization: `Bearer ${token}` };
}

export async function getMemberProfile(userId: string): Promise<MemberProfile> {
  const res = await fetch(`/api/admin/user-profile?userId=${encodeURIComponent(userId)}`, {
    headers: await authHeader(),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw rbacRouteError(body, res.status);
  return body as MemberProfile;
}

export async function updateMemberProfile(input: {
  userId: string;
  displayName?: string;
  email?: string;
  platformRole?: string;
}): Promise<void> {
  // On n'émet QUE les champs fournis : la route refuse les clés inconnues, et un `undefined`
  // sérialisé disparaîtrait silencieusement — mieux vaut ne rien envoyer explicitement.
  const payload: Record<string, string> = { userId: input.userId };
  if (input.displayName !== undefined) payload.displayName = input.displayName;
  if (input.email !== undefined) payload.email = input.email;
  if (input.platformRole !== undefined) payload.platformRole = input.platformRole;

  const res = await fetch('/api/admin/user-profile', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw rbacRouteError(await res.json().catch(() => ({})), res.status);
}

/** Pose la photo de profil d'un AUTRE membre (même pipeline que la sienne : ≤ 512 px, EXIF strippé). */
export async function uploadMemberAvatar(userId: string, file: File): Promise<string> {
  const body = new FormData();
  body.append('file', file);
  body.append('targetUserId', userId);
  const res = await fetch('/api/avatar/upload', { method: 'POST', headers: await authHeader(), body });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 415) throw new Error("Format d'image non supporté (JPEG, PNG ou WebP, ≤ 5 Mo).");
    throw rbacRouteError(json, res.status);
  }
  const url = (json as { url?: string }).url;
  if (!url) throw new Error("Réponse invalide du serveur d'avatar.");
  return url;
}

/**
 * Envoie le lien « définir mon mot de passe » (atterrissage /set-password, page qui gère déjà
 * l'invitation et la récupération). C'est AUSSI ce qu'on envoie à un compte jamais connecté :
 * inviteUserByEmail refuse une adresse existante, et le contournement (supprimer puis ré-inviter)
 * détruirait les permissions individuelles du membre.
 */
export async function sendMemberSignInLink(email: string): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase non configuré.');
  const { error } = await client.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/set-password`,
  });
  if (error) throw new Error(error.message);
}

/** Lien de connexion à usage unique. shouldCreateUser: false — sinon une faute de frappe dans
 *  l'adresse créerait un compte fantôme au lieu d'échouer. */
export async function sendMemberMagicLink(email: string): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase non configuré.');
  const { error } = await client.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/` },
  });
  if (error) throw new Error(error.message);
}
