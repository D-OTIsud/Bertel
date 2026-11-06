import { getSupabaseClient } from '../lib/supabase';

/**
 * Relais SMTP d'une organisation (18g). Les e-mails MÉTIER — envoi d'une liste, notifications
 * CRM et portail acteur — partent du fournisseur de CHAQUE ORG, réglé ici.
 *
 * Le mot de passe est en ÉCRITURE SEULE : il part une fois vers `upsert_org_smtp`, il n'est
 * JAMAIS relu. `hasPassword` dit seulement qu'il y en a un. Un `password` absent ou vide
 * CONSERVE celui déjà posé (c'est ce qui permet de modifier l'hôte sans ressaisir le secret) ;
 * `clearPassword` le retire, secret Vault compris.
 *
 * Les RPCs sont gatés serveur : superadmin plateforme, ou admin actif de rang ≥ 30 de CETTE ORG.
 */

export interface OrgSmtpSnapshot {
  orgObjectId: string;
  /** Une ligne existe pour cette ORG (même non activée). */
  configured: boolean;
  host: string | null;
  port: number | null;
  secure: boolean;
  fromEmail: string | null;
  fromName: string | null;
  username: string | null;
  hasPassword: boolean;
  isEnabled: boolean;
  lastTestAt: string | null;
  lastTestOk: boolean | null;
  lastTestError: string | null;
  /** Ce que porterait l'expéditeur si `fromName` reste vide (marque ORG, puis plateforme). */
  fromNameFallback: string | null;
}

export interface OrgSmtpInput {
  host: string;
  port: number;
  secure: boolean;
  fromEmail: string;
  fromName?: string | null;
  username?: string | null;
  /** Fourni SEULEMENT pour poser ou faire tourner le mot de passe ; jamais relu. */
  password?: string | null;
  isEnabled: boolean;
  clearPassword?: boolean;
}

/** Les quatre ports de soumission SMTP — la base refuse tout autre (CHECK chk_org_smtp_port). */
export const SMTP_PORTS = [587, 465, 25, 2525] as const;
export type SmtpPort = (typeof SMTP_PORTS)[number];

/**
 * 465 = TLS implicite, les trois autres = STARTTLS. La base impose `(port = 465) = secure` :
 * dériver ici évite de proposer une combinaison que l'enregistrement refuserait, et surtout un
 * échec de handshake opaque si elle passait.
 */
export function secureForPort(port: number): boolean {
  return port === 465;
}

function client() {
  const c = getSupabaseClient();
  if (!c) throw new Error('Connexion backend indisponible.');
  return c.schema('api');
}

const nstr = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);

function normalize(orgObjectId: string, data: unknown): OrgSmtpSnapshot {
  const raw = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  return {
    orgObjectId,
    configured: raw.configured === true,
    host: nstr(raw.host),
    port: typeof raw.port === 'number' ? raw.port : null,
    secure: raw.secure === true,
    fromEmail: nstr(raw.fromEmail),
    fromName: nstr(raw.fromName),
    username: nstr(raw.username),
    hasPassword: raw.hasPassword === true,
    isEnabled: raw.isEnabled === true,
    lastTestAt: nstr(raw.lastTestAt),
    lastTestOk: typeof raw.lastTestOk === 'boolean' ? raw.lastTestOk : null,
    lastTestError: nstr(raw.lastTestError),
    fromNameFallback: nstr(raw.fromNameFallback),
  };
}

export async function getOrgSmtp(orgObjectId: string): Promise<OrgSmtpSnapshot> {
  const { data, error } = await client().rpc('get_org_smtp', { p_org_object_id: orgObjectId });
  if (error) throw new Error(error.message);
  return normalize(orgObjectId, data);
}

export async function saveOrgSmtp(orgObjectId: string, input: OrgSmtpInput): Promise<OrgSmtpSnapshot> {
  const { data, error } = await client().rpc('upsert_org_smtp', {
    p_org_object_id: orgObjectId,
    p_host: input.host.trim(),
    p_port: input.port,
    p_secure: input.secure,
    p_from_email: input.fromEmail.trim(),
    p_from_name: nstr(input.fromName ?? null),
    p_username: nstr(input.username ?? null),
    // Vide ⇒ null ⇒ le mot de passe déjà posé est CONSERVÉ côté serveur.
    p_password: nstr(input.password ?? null),
    p_is_enabled: input.isEnabled,
    p_clear_password: input.clearPassword === true,
  });
  if (error) throw new Error(error.message);
  return normalize(orgObjectId, data);
}

export async function deleteOrgSmtp(orgObjectId: string): Promise<void> {
  const { error } = await client().rpc('delete_org_smtp', { p_org_object_id: orgObjectId });
  if (error) throw new Error(error.message);
}

/**
 * Demande au serveur d'ouvrir une session vers le relais ENREGISTRÉ. L'hôte n'est jamais envoyé
 * par le navigateur — la route le relit en base — sans quoi ce bouton deviendrait un moyen de
 * faire ouvrir au VPS une connexion vers une destination arbitraire.
 */
export async function testOrgSmtp(
  orgObjectId: string,
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: boolean; detail: string }> {
  const resp = await fetchImpl('/api/admin/org-smtp/test', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ orgObjectId }),
  });
  let payload: { ok?: boolean; detail?: string; error?: string } = {};
  try {
    payload = await resp.json();
  } catch {
    /* ignore */
  }
  if (resp.ok && payload.ok) return { ok: true, detail: payload.detail ?? 'Connexion réussie.' };
  return { ok: false, detail: payload.detail ?? payload.error ?? `Échec (${resp.status})` };
}
