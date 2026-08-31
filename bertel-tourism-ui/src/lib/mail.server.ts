import 'server-only';
import nodemailer, { type Transporter } from 'nodemailer';
import { readSmtpConfig, type SmtpConfig } from './env.server';

export class MailNotConfiguredError extends Error {
  constructor() {
    super('SMTP non configuré (SMTP_HOST / SMTP_FROM_EMAIL manquants)');
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
let cached: { config: SmtpConfig; transport: Transporter } | null = null;

function sameTransportConfig(a: SmtpConfig, b: SmtpConfig): boolean {
  return a.host === b.host && a.port === b.port && a.secure === b.secure
    && a.user === b.user && a.pass === b.pass;
}

function getTransport(cfg: SmtpConfig): Transporter {
  if (cached && sameTransportConfig(cached.config, cfg)) return cached.transport;
  // Une config qui change ferme l'ancien pool : le laisser vivre garderait des sockets
  // ouvertes vers un relais qu'on n'utilise plus, à la charge du VPS et du relais.
  cached?.transport.close();
  const transport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure, // false pour 587 (STARTTLS), true pour 465
    requireTLS: true, // Google exige TLS sur le relais
    pool: true,
    maxConnections: 2,
    maxMessages: 100,
    ...(cfg.user && cfg.pass ? { auth: { user: cfg.user, pass: cfg.pass } } : {}),
  });
  cached = { config: cfg, transport };
  return transport;
}

/**
 * Envoi d'un e-mail métier — listes, notifications CRM… — via le relais Google
 * (config env, cf. env.server.ts). Relais par IP du VPS : pas d'auth par défaut (auth
 * uniquement si SMTP_USER/SMTP_PASSWORD sont fournis) ; STARTTLS obligatoire (requireTLS).
 * Lève MailNotConfiguredError si non configuré ⇒ l'appelant renvoie 503 sans jamais faire
 * échouer le partage par lien / le PDF / le drain de l'outbox.
 */
export async function sendMail(opts: { to: string; subject: string; html: string }): Promise<void> {
  const cfg = readSmtpConfig();
  if (!cfg) throw new MailNotConfiguredError();

  await getTransport(cfg).sendMail({
    from: `${cfg.fromName} <${cfg.fromEmail}>`,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
  });
}

/** Alias historique (routes listes) — même fonction. */
export const sendListEmail = sendMail;
