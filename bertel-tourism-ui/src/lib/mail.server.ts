import 'server-only';
import nodemailer from 'nodemailer';
import { readSmtpConfig } from './env.server';

export class MailNotConfiguredError extends Error {
  constructor() {
    super('SMTP non configuré (SMTP_HOST / SMTP_FROM_EMAIL manquants)');
    this.name = 'MailNotConfiguredError';
  }
}

/**
 * Envoi d'un e-mail métier via le relais Google (config env, cf. env.server.ts).
 * Relais par IP du VPS : pas d'auth par défaut (auth uniquement si SMTP_USER/SMTP_PASSWORD
 * sont fournis) ; STARTTLS obligatoire (requireTLS). Lève MailNotConfiguredError si non configuré
 * ⇒ l'appelant renvoie 503 sans jamais faire échouer le partage par lien / le PDF.
 */
export async function sendListEmail(opts: { to: string; subject: string; html: string }): Promise<void> {
  const cfg = readSmtpConfig();
  if (!cfg) throw new MailNotConfiguredError();

  const transport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure, // false pour 587 (STARTTLS), true pour 465
    requireTLS: true, // Google exige TLS sur le relais
    ...(cfg.user && cfg.pass ? { auth: { user: cfg.user, pass: cfg.pass } } : {}),
  });

  await transport.sendMail({
    from: `${cfg.fromName} <${cfg.fromEmail}>`,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
  });
}
