/**
 * Client de `/api/crm/actor-access` (18a/D1) — accès portail d'un acteur, piloté depuis la
 * fiche prestataire du CRM.
 *
 * Pourquoi une route Next et pas un RPC : le compte de connexion vit dans `auth.users`, hors
 * de portée du SQL — seule l'API Admin (clé service_role, donc serveur) sait l'inviter et le
 * supprimer. **Ne JAMAIS ajouter ici un `client.from(...)` sur `app_user_profile` ou une table
 * `crm_*`** : RLS les rendrait vides en silence, ce qui se lirait comme « cet acteur n'a pas de
 * compte » et non comme une panne. Le Bearer vient de la session Supabase — même mécanique que
 * `pingNotifyDrain` (services/crm.ts).
 *
 * VOCABULAIRE. Ces messages atteignent un AGENT D'OFFICE, pas le partenaire : le vocabulaire
 * métier (canal, portail, compte interne) y est légitime. La seule copie que lit le partenaire
 * est celle de `/set-password?espace=1`, posée par la route.
 */
import { getSupabaseClient } from '../lib/supabase';

export interface PortalAccount {
  userId: string;
  email: string | null;
  invitedAt: string | null;
  lastSignInAt: string | null;
}

export interface PortalAccessStatus {
  /** Le compte portail de cet acteur, ou null s'il n'en a pas. */
  account: PortalAccount | null;
  /**
   * Anomalie : un profil est bien rattaché à cet acteur, mais ce n'est pas un compte portail
   * (`role` autre que `actor`). L'index unique `uq_app_user_profile_actor_id` interdit d'en
   * créer un second — la carte doit donc désactiver l'invitation AVEC cette raison, au lieu
   * de proposer un bouton qui reviendrait en 409.
   */
  linkedToOtherAccount: boolean;
}

async function callActorAccess(body: Record<string, unknown>): Promise<Response> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Service indisponible : Supabase n’est pas configuré.');
  const { data } = await client.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Session expirée — reconnectez-vous.');
  return fetch('/api/crm/actor-access', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Traduction des refus de la route. Chaque code dit QUOI FAIRE, pas seulement ce qui a raté. */
const ERROR_MESSAGES: Record<string, string> = {
  email_not_actor_channel:
    "Cette adresse n’est pas dans les coordonnées de l’acteur — ajoutez-la d’abord à sa fiche.",
  email_taken_by_staff:
    'Cette adresse est déjà celle d’un compte interne — elle ne peut pas servir d’accès partenaire.',
  actor_already_linked:
    'Cet acteur est déjà rattaché à un compte interne. Contactez un administrateur avant d’ouvrir un accès.',
  already_invited: 'Un accès portail existe déjà pour cet acteur.',
  already_active: 'Cette personne s’est déjà connectée — il n’y a rien à renvoyer.',
  no_portal_account: 'Aucun accès portail à révoquer pour cet acteur.',
  forbidden: 'Vous n’avez pas le droit d’écriture CRM sur cet acteur.',
  unauthenticated: 'Session expirée — reconnectez-vous.',
  invalid_email: 'Cette adresse e-mail n’est pas valide.',
};

async function unwrap<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => ({}))) as { error?: string } & T;
  if (!response.ok) {
    throw new Error(ERROR_MESSAGES[payload.error ?? ''] ?? `Échec de l’opération (${response.status}).`);
  }
  return payload;
}

export async function getPortalAccessStatus(actorId: string): Promise<PortalAccessStatus> {
  const payload = await unwrap<PortalAccessStatus>(await callActorAccess({ action: 'status', actorId }));
  return { account: payload.account ?? null, linkedToOtherAccount: payload.linkedToOtherAccount === true };
}

export async function invitePortalAccess(actorId: string, email: string): Promise<void> {
  await unwrap(await callActorAccess({ action: 'invite', actorId, email }));
}

export async function resendPortalAccess(actorId: string, email: string): Promise<void> {
  await unwrap(await callActorAccess({ action: 'resend', actorId, email }));
}

export async function revokePortalAccess(actorId: string): Promise<void> {
  await unwrap(await callActorAccess({ action: 'revoke', actorId }));
}
