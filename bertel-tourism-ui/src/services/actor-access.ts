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
import { getApiClient, getSupabaseClient } from '../lib/supabase';

/** Même permission que la route serveur ; une panne garde le composant masqué. */
export async function canManageActorPortalAccess(): Promise<boolean> {
  try {
    const client = getApiClient();
    if (!client) return false;
    const { data, error } = await client.schema('api').rpc('current_user_can_manage_actor_portal');
    return !error && data === true;
  } catch {
    return false;
  }
}

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
  portal_access_forbidden: 'Vous n’avez pas la permission de gérer l’accès au portail prestataire.',
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
  // Pannes serveur. Le `detail` brut de GoTrue/PostgREST ne redescend PAS jusqu'ici (la route
  // ne l'émet plus) : ces phrases sont donc TOUT ce que l'agent lira, elles doivent dire quoi
  // faire. « Aucun compte n'a été créé » compte : sans cette précision, l'agent réessaie et
  // tombe sur un 409.
  profile_read_failed: 'Impossible de vérifier l’accès portail pour l’instant. Réessayez dans un instant.',
  create_failed: 'L’invitation n’a pas pu être envoyée. Aucun compte n’a été créé — réessayez.',
  profile_failed: 'L’invitation a échoué et le compte a été annulé. Réessayez ; si cela persiste, signalez-le.',
  // Le renvoi supprime l'ancien compte AVANT d'en créer un neuf. S'il échoue APRÈS cette
  // suppression, « aucun compte n'a été créé » serait vrai à la lettre et faux en pratique :
  // l'acteur n'a plus d'accès du tout. Deux moments, deux phrases.
  resend_failed: 'Le renvoi a échoué. L’accès existant n’a pas été modifié.',
  resend_lost_previous:
    'L’ancien accès a été fermé mais le nouveau n’a pas pu être créé — relancez l’invitation.',
  revoke_failed: 'La révocation a échoué. L’accès est toujours actif.',
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

/**
 * Résultat d'un geste qui a RÉUSSI.
 *
 * `traced` dit si la note CRM a bien été écrite. La route la rend honnêtement ; ne pas la
 * remonter jusqu'à l'écran déplacerait simplement d'un cran le silence que cette trace existe
 * pour fermer — l'agent croirait le geste journalisé alors qu'il ne l'est pas.
 *
 * Absent ⇒ considéré comme tracé : on ne crie au loup que si le serveur dit explicitement non.
 */
export interface PortalActionResult {
  traced: boolean;
}

async function actionResult(response: Response): Promise<PortalActionResult> {
  const payload = await unwrap<{ traced?: unknown }>(response);
  return { traced: payload.traced !== false };
}

export async function invitePortalAccess(actorId: string, email: string): Promise<PortalActionResult> {
  return actionResult(await callActorAccess({ action: 'invite', actorId, email }));
}

export async function resendPortalAccess(actorId: string, email: string): Promise<PortalActionResult> {
  return actionResult(await callActorAccess({ action: 'resend', actorId, email }));
}

export async function revokePortalAccess(actorId: string): Promise<PortalActionResult> {
  return actionResult(await callActorAccess({ action: 'revoke', actorId }));
}
