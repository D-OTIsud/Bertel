import 'server-only';
import { getServerSupabaseClient } from './supabase-server';

/**
 * Relais SMTP D'UNE ORGANISATION (18g). Les invitations du portail utilisent ce
 * fournisseur explicitement. Les autres appelants de sendMail gardent leur contrat
 * tant que leur bascule par organisation n'a pas été livrée.
 *
 * La lecture passe par `api.get_org_smtp_secret`, qui rend le mot de passe DÉCHIFFRÉ et n'est
 * `GRANT`é qu'à `service_role` : ce grant EST la frontière de confiance — aucun utilisateur
 * connecté ne peut l'exécuter, seules les routes serveur le peuvent. Le RPC ne rend RIEN tant
 * que le relais n'est pas activé (`is_enabled`), et il n'y a PAS de repli sur un relais
 * plateforme (arbitrage PO) : pas de relais actif ⇒ pas d'envoi.
 *
 * La route d'invitation génère le lien Auth puis envoie son propre gabarit via ce
 * relais. Les réinitialisations de mot de passe restent expédiées par Supabase Auth.
 */

export interface OrgSmtpConfig {
  orgId: string;
  host: string;
  port: number;
  secure: boolean;
  fromEmail: string;
  fromName: string;
  user: string | null;
  pass: string | null;
}

/**
 * TTL de mémorisation. Le drain de l'outbox traite jusqu'à vingt notifications par ping et
 * appelle cette lecture UNE FOIS PAR MESSAGE : sans mémorisation, un ping = vingt allers-retours
 * RPC pour, presque toujours, la même poignée d'ORG. Une minute est courte devant le rythme des
 * changements de relais (une saisie de formulaire, quelques fois par an) et longue devant la
 * durée d'un drain.
 */
const TTL_MS = 60_000;

type Entry = { at: number; config: OrgSmtpConfig | null };
const cache = new Map<string, Entry>();

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const nstr = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s.length > 0 ? s : null;
};

/**
 * Config du relais de cette ORG, ou `null` si elle n'en a pas d'ACTIF. Le `null` est mémorisé
 * comme un résultat : sans cela, une ORG non configurée ferait un aller-retour RPC par message,
 * c'est-à-dire précisément le cas où la mémorisation sert le plus.
 */
export async function readOrgSmtpConfig(orgId: string | null | undefined): Promise<OrgSmtpConfig | null> {
  const id = nstr(orgId);
  if (!id) return null;

  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.config;

  const server = getServerSupabaseClient();
  if (!server) return null; // service-role absente : l'appelant rend déjà 500 server_misconfigured

  const { data, error } = await server.schema('api').rpc('get_org_smtp_secret', { p_org_object_id: id });
  if (error) {
    // Le message SQL brut n'a pas à sortir de ce process — il nomme des tables et de la
    // configuration. Journalisé pour rester diagnosticable, jamais renvoyé à l'appelant.
    console.error('[org-smtp] get_org_smtp_secret failed', error.message);
    // PAS de mise en cache d'un échec : une panne transitoire ne doit pas éteindre le relais
    // d'une ORG pendant une minute entière.
    return null;
  }

  const row = Array.isArray(data) ? (data[0] as Record<string, unknown> | undefined) : null;
  const host = nstr(row?.host);
  const fromEmail = nstr(row?.from_email);
  const config: OrgSmtpConfig | null =
    row && host && fromEmail
      ? {
          orgId: id,
          host,
          port: Number(row.port) || 587,
          secure: row.secure === true,
          fromEmail,
          // Le RPC a déjà replié sur la marque de l'ORG puis sur celle de la plateforme ; ce
          // dernier repli ne sert que si les deux marques sont vides en base.
          fromName: str(row.from_name) || 'Bertel',
          user: nstr(row.username),
          pass: nstr(row.password),
        }
      : null;

  cache.set(id, { at: Date.now(), config });
  return config;
}

/** Oublie la config mémorisée d'une ORG (ou de toutes) — après un enregistrement ou un test. */
export function invalidateOrgSmtpConfig(orgId?: string | null): void {
  if (orgId) cache.delete(orgId);
  else cache.clear();
}
