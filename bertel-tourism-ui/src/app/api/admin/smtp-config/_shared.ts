import { NextResponse, type NextRequest } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getServerSupabaseClient } from '@/lib/supabase-server';

export function smtpJson(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

/** Fail closed, using the verified caller and database role rather than JWT user metadata. */
export async function authorizeSmtpAdmin(req: NextRequest): Promise<
  { ok: true; asCaller: SupabaseClient } | { ok: false; response: NextResponse }
> {
  const jwt = (req.headers.get('authorization') ?? '').match(/^Bearer\s+(.+)$/)?.[1]?.trim();
  if (!jwt) return { ok: false, response: smtpJson({ detail: 'Connectez-vous pour accéder aux paramètres SMTP.' }, 401) };
  const server = getServerSupabaseClient();
  if (!server) return { ok: false, response: smtpJson({ detail: 'Le service de configuration est indisponible.' }, 503) };
  const { data, error } = await server.auth.getUser(jwt);
  if (error || !data.user) return { ok: false, response: smtpJson({ detail: 'Votre session a expiré.' }, 401) };
  const asCaller = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '', {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const probe = await asCaller.schema('api').rpc('is_platform_superuser');
  if (probe.error || probe.data !== true) {
    return { ok: false, response: smtpJson({ detail: 'Ces paramètres sont réservés aux administrateurs de la plateforme.' }, 403) };
  }
  return { ok: true, asCaller };
}
