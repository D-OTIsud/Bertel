import 'server-only';
import nodemailer, { type Transporter } from 'nodemailer';
import { z } from 'zod';
import type { SmtpConfig } from './env.server';
import { resolveSmtpConfig } from './smtp-settings.server';

interface MailContent { to: string; subject: string; html: string }
/** Server-derived identity only: never take this from a notification request body. */
export interface MailSender { address: string; name: string }
const senderEmailSchema = z.string().email();

export class MailNotConfiguredError extends Error {
  constructor() {
    super('Envoi d’e-mails désactivé ou SMTP non configuré dans les paramètres.');
    this.name = 'MailNotConfiguredError';
  }
}

/**
 * Transport RÉUTILISÉ entre les appels, et POOLÉ.
 *
 * POURQUOI. `createTransport` était appelé À CHAQUE e-mail. C'était sans conséquence tant que
 * `sendMail` ne servait que l'envoi unique d'une liste ; le drain de l'outbox (17i) l'appelle
 * désormais DANS UNE BOUCLE — vingt lignes par ping, donc vingt ouvertures/fermetures de
 * connexion successives vers le relais Google. Or ce relais est autorisé par l'IP PUBLIQUE du
 * VPS : cette autorisation EST la capacité e-mail de tout le produit (listes, invitations,
 * notifications). Une rafale de connexions depuis une IP unique est exactement ce qu'un relais
 * limite ou blackliste, et la sanction ne tomberait pas sur le drain seul mais sur TOUS les
 * envois du produit.
 *
 * `pool: true` garde les sockets ouverts et sérialise les messages sur un petit nombre de
 * connexions ; `maxConnections: 2` reste volontairement bas (le drain envoie déjà en série,
 * la marge sert aux envois de listes concurrents). `maxMessages` fait renouveler la connexion
 * périodiquement — les relais ferment les sessions trop longues, et une socket morte réutilisée
 * ferait échouer l'envoi suivant.
 *
 * Le transport est mémorisé avec LA CONFIG QUI L'A CONSTRUIT : si l'environnement change
 * (rotation d'identifiants, bascule de relais), on en reconstruit un plutôt que de continuer
 * à parler à l'ancien hôte avec l'ancien secret. Comparaison champ à champ des seuls
 * paramètres de TRANSPORT — `fromName`/`fromEmail` sont des données de MESSAGE, relues à
 * chaque envoi : les inclure ferait jeter le pool pour un simple changement de libellé.
 */
type TransportEntry = { config: SmtpConfig; transport: Transporter; inFlight: number; retired: boolean };
let cached: TransportEntry | null = null;

function sameTransportConfig(a: SmtpConfig, b: SmtpConfig): boolean {
  return a.host === b.host && a.port === b.port && a.secure === b.secure
    && a.user === b.user && a.pass === b.pass;
}

function getTransport(cfg: SmtpConfig): TransportEntry {
  if (cached && sameTransportConfig(cached.config, cfg)) return cached;
  // Une config qui change ferme l'ancien pool : le laisser vivre garderait des sockets
  // ouvertes vers un relais qu'on n'utilise plus, à la charge du VPS et du relais.
  if (cached) {
    cached.retired = true;
    // A settings save can happen while messages are queued. Closing an occupied pool rejects
    // those messages; retire it now, then close it after its last send settles.
    if (cached.inFlight === 0) cached.transport.close();
    cached = null;
  }
  const transport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure, // false pour 587 (STARTTLS), true pour 465
    requireTLS: true, // Google exige TLS sur le relais
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
    pool: true,
    maxConnections: 2,
    maxMessages: 100,
    ...(cfg.user && cfg.pass ? { auth: { user: cfg.user, pass: cfg.pass } } : {}),
  });
  cached = { config: cfg, transport, inFlight: 0, retired: false };
  return cached;
}

/**
 * Envoi d'un e-mail métier — listes, notifications CRM… — via le relais Google
 * (Paramètres → E-mails & SMTP, avec repli env). Relais par IP du VPS : pas d'auth par défaut (auth
 * uniquement si SMTP_USER/SMTP_PASSWORD sont fournis) ; STARTTLS obligatoire (requireTLS).
 * Lève MailNotConfiguredError si non configuré ⇒ l'appelant renvoie 503 sans jamais faire
 * échouer le partage par lien / le PDF / le drain de l'outbox.
 */
export async function sendMail(opts: MailContent & { sender?: MailSender }): Promise<void> {
  const cfg = await resolveSmtpConfig();
  if (!cfg) throw new MailNotConfiguredError();

  // Sender belongs to the message, never to the cached SMTP transport. Task notifications
  // may use their creator's address while the next list keeps the configured address.
  const sender = opts.sender ? {
    address: opts.sender.address.trim(),
    name: opts.sender.name.replace(/[\r\n\u0000]+/g, ' ').trim(),
  } : { name: cfg.fromName, address: cfg.fromEmail };
  if (opts.sender && !senderEmailSchema.safeParse(sender.address).success) {
    throw new Error('L’adresse e-mail du créateur de la tâche est invalide.');
  }

  // Le pool est partagé avec les envois concurrents : le fermer dans un finally de message
  // les interromprait. Nodemailer gère les sockets en erreur ; les délais bornent chaque
  // connexion et getTransport ferme le pool lorsqu'on change de configuration.
  const entry = getTransport(cfg);
  entry.inFlight += 1;
  try {
    await entry.transport.sendMail({
      from: sender,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    });
  } catch (error) {
    // The list route displays this message and the outbox stores it. A SMTP server's raw
    // response can echo authentication data, so keep it out of both surfaces.
    throw new Error(safeSmtpError(error));
  } finally {
    entry.inFlight -= 1;
    if (entry.retired && entry.inFlight === 0) entry.transport.close();
  }
}

/** Lists always use the configured sender, even if an extra sender property is supplied. */
export function sendListEmail({ to, subject, html }: MailContent): Promise<void> {
  return sendMail({ to, subject, html });
}

/** Separate, unpooled connection: verification never sends mail or closes the shared send pool. */
export async function verifySmtpConnection(): Promise<{ ok: boolean; detail: string }> {
  const cfg = await resolveSmtpConfig();
  if (!cfg) return { ok: false, detail: 'Activez et enregistrez une configuration SMTP avant de tester la connexion.' };
  const transport = nodemailer.createTransport({
    host: cfg.host, port: cfg.port, secure: cfg.secure, requireTLS: true,
    connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 15_000,
    ...(cfg.user && cfg.pass ? { auth: { user: cfg.user, pass: cfg.pass } } : {}),
  });
  try {
    await transport.verify();
    return { ok: true, detail: 'Connexion SMTP réussie. Aucun e-mail n’a été envoyé. L’adresse d’expédition sera vérifiée lors d’un envoi.' };
  } catch (error) {
    // SMTP servers may echo credentials in their response: expose only known, safe diagnostics.
    return { ok: false, detail: safeSmtpError(error) };
  } finally { transport.close(); }
}

function safeSmtpError(error: unknown): string {
  const code = (error as { code?: string } | null)?.code;
  return code === 'EAUTH' ? 'Authentification refusée. Vérifiez l’identifiant et le mot de passe.'
    : code === 'EDNS' || code === 'ENOTFOUND' ? 'Serveur SMTP introuvable. Vérifiez son nom.'
      : code === 'ETIMEDOUT' || code === 'ECONNECTION' ? 'Le serveur SMTP ne répond pas. Vérifiez l’hôte, le port et les accès réseau.'
        : code === 'ESOCKET' ? 'Connexion sécurisée impossible. Vérifiez le port et le mode TLS.'
          : 'L’opération SMTP a échoué. Vérifiez les paramètres et l’accès au relais.';
}
