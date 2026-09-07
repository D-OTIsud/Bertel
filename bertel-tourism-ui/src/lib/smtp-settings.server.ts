import 'server-only';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SmtpSettings } from '@/services/smtp-settings';
import { readSmtpConfig, type SmtpConfig } from './env.server';
import { getServerSupabaseClient } from './supabase-server';

const line = z.string().trim().max(320).refine((v) => !/[\r\n\u0000]/.test(v), 'Valeur invalide.');
export const smtpSettingsInputSchema = z.object({
  enabled: z.boolean(),
  host: z.string().trim().min(1, 'Indiquez le serveur SMTP.').max(253)
    .regex(/^[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?$/, 'Utilisez un nom de serveur, sans https:// ni chemin.'),
  port: z.number().int().min(1).max(65535),
  secure: z.boolean(),
  fromEmail: line.pipe(z.string().email('Indiquez une adresse d’expédition valide.')),
  fromName: line.pipe(z.string().min(1, 'Indiquez le nom d’expédition.')),
  authMode: z.enum(['relay', 'password']),
  user: line,
  password: z.string().max(4096).optional(),
}).strict().superRefine((value, ctx) => {
  if (value.authMode === 'password' && !value.user) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['user'], message: 'Indiquez l’identifiant SMTP.' });
  }
});

type SmtpRow = {
  enabled: boolean; host: string; port: number; secure: boolean;
  from_email: string; from_name: string; auth_mode: 'relay' | 'password';
  username: string | null; has_password: boolean; updated_at: string;
  password?: string | null;
};

export class SmtpSettingsError extends Error {
  constructor(message = 'Les paramètres SMTP sont indisponibles. Réessayez dans quelques instants.') {
    super(message);
    this.name = 'SmtpSettingsError';
  }
}

export function isSmtpMigrationMissing(error: { code?: string; message?: string }, rpc: string): boolean {
  return (error.code === 'PGRST202' || error.code === '42883') && (error.message ?? '').includes(rpc);
}

function environmentSettings(editable: boolean): SmtpSettings {
  const cfg = readSmtpConfig();
  return {
    enabled: Boolean(cfg), host: cfg?.host ?? '', port: cfg?.port ?? 587, secure: cfg?.secure ?? false,
    fromEmail: cfg?.fromEmail ?? '', fromName: cfg?.fromName ?? 'Bertel',
    authMode: cfg?.user ? 'password' : 'relay', user: cfg?.user ?? '', hasPassword: Boolean(cfg?.pass),
    source: cfg ? 'environment' : 'none', configured: Boolean(cfg && (!cfg.user || cfg.pass)),
    editable, updatedAt: null,
  };
}

/** Deliberate whitelist: no Vault ID or password can enter the HTTP response. */
function publicSettings(row: SmtpRow): SmtpSettings {
  return {
    enabled: row.enabled, host: row.host, port: row.port, secure: row.secure,
    fromEmail: row.from_email, fromName: row.from_name, authMode: row.auth_mode,
    user: row.username ?? '', hasPassword: row.has_password,
    source: 'database', editable: true, updatedAt: row.updated_at,
    configured: row.enabled && (row.auth_mode === 'relay' || row.has_password),
  };
}

export async function readAdminSmtpSettings(asCaller: SupabaseClient): Promise<SmtpSettings> {
  const { data, error } = await asCaller.schema('api').rpc('get_smtp_config');
  if (error) {
    if (isSmtpMigrationMissing(error, 'get_smtp_config')) return environmentSettings(false);
    throw new SmtpSettingsError();
  }
  const row = (Array.isArray(data) ? data[0] : data) as SmtpRow | null | undefined;
  return row ? publicSettings(row) : environmentSettings(true);
}

/** Shared by every business-mail sender. A saved disabled setting never falls back to env. */
export async function resolveSmtpConfig(): Promise<SmtpConfig | null> {
  const server = getServerSupabaseClient();
  if (!server) return validatedEnvironment();
  const { data, error } = await server.schema('api').rpc('get_smtp_config_secret');
  if (error) {
    if (isSmtpMigrationMissing(error, 'get_smtp_config_secret')) return validatedEnvironment();
    // Do not switch relays silently when the database/Vault is unavailable.
    throw new SmtpSettingsError();
  }
  const row = (Array.isArray(data) ? data[0] : data) as SmtpRow | null | undefined;
  if (!row) return validatedEnvironment();
  if (!row.enabled) return null;
  if (row.auth_mode === 'password' && (!row.username || !row.password)) {
    throw new SmtpSettingsError('Les identifiants SMTP enregistrés sont incomplets.');
  }
  return {
    host: row.host, port: row.port, secure: row.secure,
    fromEmail: row.from_email, fromName: row.from_name,
    user: row.auth_mode === 'password' ? row.username : null,
    pass: row.auth_mode === 'password' ? row.password ?? null : null,
  };
}

function validatedEnvironment(): SmtpConfig | null {
  const cfg = readSmtpConfig();
  if (cfg?.user && !cfg.pass) throw new SmtpSettingsError('Les identifiants SMTP du serveur sont incomplets.');
  return cfg;
}
