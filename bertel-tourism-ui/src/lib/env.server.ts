import 'server-only';

// Server-only env. Reads process.env directly (never the runtime window config).
// The `server-only` import above makes this module a build-time error if it ends
// up in a client bundle, turning a silent runtime miss into a loud compile failure.
// Returns null if not set — callers must handle that case explicitly.
export function readServerEnv(): { supabaseServiceRoleKey: string | null } {
  if (typeof process === 'undefined' || !process.env) {
    return { supabaseServiceRoleKey: null };
  }
  const raw = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  return { supabaseServiceRoleKey: raw.length > 0 ? raw : null };
}

// SMTP des e-mails MÉTIER de Bertel (envoi des listes, invitations, notifications) via le
// relais Google `smtp-relay.gmail.com`. Architecture PO (2026-07-01) : autorisation par l'IP
// PUBLIQUE FIXE du VPS ⇒ PAS de SMTP_USER/SMTP_PASSWORD (auth par IP + TLS obligatoire).
// user/pass restent optionnels (repli auth explicite hors VPS / dev). Les e-mails Supabase Auth
// (magic links, resets) NE passent PAS par ici : ils partent de Supabase Cloud (Dashboard →
// Authentication → SMTP, compte technique bertel-auth@ + smtp.gmail.com). Renvoie null si non configuré.
export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  fromEmail: string;
  fromName: string;
  user: string | null;
  pass: string | null;
}

export function readSmtpConfig(): SmtpConfig | null {
  if (typeof process === 'undefined' || !process.env) return null;
  const host = (process.env.SMTP_HOST ?? '').trim();
  const fromEmail = (process.env.SMTP_FROM_EMAIL ?? '').trim();
  if (!host || !fromEmail) return null; // non configuré → l'appelant renvoie une erreur claire
  const port = Number.parseInt((process.env.SMTP_PORT ?? '587').trim(), 10) || 587;
  const secure = (process.env.SMTP_SECURE ?? 'false').trim().toLowerCase() === 'true';
  const fromName = (process.env.SMTP_FROM_NAME ?? 'Bertel — OTI du Sud').trim();
  const user = (process.env.SMTP_USER ?? '').trim() || null;
  const pass = (process.env.SMTP_PASSWORD ?? '').trim() || null;
  return { host, port, secure, fromEmail, fromName, user, pass };
}
