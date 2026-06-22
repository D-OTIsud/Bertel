import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getServerSupabaseClient } from '@/lib/supabase-server';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * Super-admin « Tester la connexion » for the active AI provider. Authorizes the caller as a platform
 * super-admin, reads the active provider + decrypted key service-role (the key never reaches the
 * client), and does a tiny round-trip. Returns { ok, detail }. Spec §4.4.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const server = getServerSupabaseClient();
  if (!server) {
    return NextResponse.json({ ok: false, error: 'server_misconfigured' }, { status: 500 });
  }

  const authHeader = req.headers.get('authorization') ?? '';
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : '';
  if (!jwt) return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 });
  const { data: userData, error: userErr } = await server.auth.getUser(jwt);
  if (userErr || !userData?.user) return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 });

  // Super-admin gate, evaluated AS THE CALLER.
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
  const anon = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();
  const asCaller = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: isSu, error: suErr } = await asCaller.schema('api').rpc('is_platform_superuser');
  if (suErr || isSu !== true) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }

  // Active provider + decrypted key (service-role only).
  const { data, error } = await server.schema('api').rpc('get_active_ai_provider_secret');
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  const row = (Array.isArray(data) ? data[0] : data) as
    | { api_kind: string; base_url: string; model: string; api_key: string | null }
    | undefined;
  if (!row) return NextResponse.json({ ok: false, detail: 'Aucun fournisseur IA actif.' }, { status: 200 });
  if (row.api_kind !== 'openai_compatible') {
    return NextResponse.json({ ok: false, detail: `Type « ${row.api_kind} » non testable.` }, { status: 200 });
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (row.api_key && row.api_key.trim()) headers['Authorization'] = `Bearer ${row.api_key.trim()}`;
  const endpoint = `${row.base_url.replace(/\/+$/, '')}/chat/completions`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: row.model, max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] }),
      signal: controller.signal,
    });
    if (!resp.ok) {
      const body = (await resp.text().catch(() => '')).slice(0, 300);
      return NextResponse.json({ ok: false, detail: `Le fournisseur a répondu ${resp.status}: ${body}` }, { status: 200 });
    }
    return NextResponse.json({ ok: true, detail: `Connexion OK (${row.model}).` }, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      { ok: false, detail: `Connexion impossible: ${err instanceof Error ? err.message : 'inconnu'}` },
      { status: 200 },
    );
  } finally {
    clearTimeout(timeout);
  }
}
