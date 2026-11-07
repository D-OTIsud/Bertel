import type { NextRequest, NextResponse } from 'next/server';
import { isSmtpMigrationMissing, readAdminSmtpSettings, smtpSettingsInputSchema } from '@/lib/smtp-settings.server';
import { authorizeSmtpAdmin, smtpJson } from './_shared';

export const runtime = 'nodejs';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await authorizeSmtpAdmin(req);
  if (!auth.ok) return auth.response;
  try { return smtpJson(await readAdminSmtpSettings(auth.asCaller)); }
  catch { return smtpJson({ detail: 'Impossible de charger les paramètres SMTP.' }, 503); }
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
  const auth = await authorizeSmtpAdmin(req);
  if (!auth.ok) return auth.response;
  const body = await req.json().catch(() => null);
  const parsed = smtpSettingsInputSchema.safeParse(body);
  if (!parsed.success) return smtpJson({ detail: parsed.error.issues[0]?.message ?? 'Paramètres SMTP invalides.' }, 400);
  const input = parsed.data;
  try {
    const current = await readAdminSmtpSettings(auth.asCaller);
    if (!current.editable) return smtpJson({ detail: 'La mise à jour SMTP doit être installée sur la base de données.' }, 503);
    // Never carry an old credential to a different host/account implicitly.
    if (input.authMode === 'password' && !input.password?.trim()
      && (current.source !== 'database' || !current.hasPassword || current.host !== input.host || current.user !== input.user)) {
      return smtpJson({ detail: 'Saisissez le mot de passe pour ce serveur et cet identifiant SMTP.' }, 400);
    }
    const { error } = await auth.asCaller.schema('api').rpc('upsert_smtp_config', {
      p_enabled: input.enabled, p_host: input.host, p_port: input.port, p_secure: input.secure,
      p_from_email: input.fromEmail, p_from_name: input.fromName, p_auth_mode: input.authMode,
      p_username: input.authMode === 'password' ? input.user : null,
      p_password: input.authMode === 'password' && input.password?.trim() ? input.password : null,
    });
    if (error) {
      if (error.code === '22023') return smtpJson({ detail: 'Paramètres incomplets : vérifiez le serveur, l’expéditeur et les identifiants SMTP.' }, 400);
      return smtpJson({ detail: isSmtpMigrationMissing(error, 'upsert_smtp_config')
        ? 'La mise à jour SMTP doit être installée sur la base de données.'
        : 'Impossible d’enregistrer les paramètres SMTP.' }, 503);
    }
    return smtpJson(await readAdminSmtpSettings(auth.asCaller));
  } catch { return smtpJson({ detail: 'Impossible d’enregistrer les paramètres SMTP.' }, 503); }
}
