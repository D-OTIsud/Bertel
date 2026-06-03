import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getServerSupabaseClient } from '@/lib/supabase-server';

export const runtime = 'nodejs';

function genTempPassword(): string {
  // 18 url-safe chars from the Web Crypto API (available in the Node runtime).
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString('base64url');
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const server = getServerSupabaseClient();
  if (!server) return NextResponse.json({ error: 'server_misconfigured' }, { status: 500 });

  const authHeader = req.headers.get('authorization') ?? '';
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!jwt) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const { data: caller, error: callerErr } = await server.auth.getUser(jwt);
  if (callerErr || !caller?.user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  // Authorize AS THE CALLER (service-role bypasses RLS, so this gate is the boundary).
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
  const anon = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();
  const asCaller = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const [{ data: isSuper }, { data: rank }] = await Promise.all([
    asCaller.schema('api').rpc('is_platform_superuser'),
    asCaller.schema('api').rpc('current_user_admin_rank'),
  ]);
  const authorized = isSuper === true || (typeof rank === 'number' && rank >= 30);
  if (!authorized) return NextResponse.json({ error: 'forbidden', detail: 'org_admin (rank ≥ 30) or platform superuser required' }, { status: 403 });

  let body: { email?: unknown; orgObjectId?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad_json' }, { status: 400 }); }
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ error: 'invalid_email' }, { status: 422 });

  const tempPassword = genTempPassword();
  const { data: created, error: createErr } = await server.auth.admin.createUser({
    email, password: tempPassword, email_confirm: true,
  });
  if (createErr) {
    const { data: list } = await server.auth.admin.listUsers();
    const existing = list?.users?.find((u) => u.email?.toLowerCase() === email);
    if (existing) return NextResponse.json({ userId: existing.id, alreadyExisted: true }, { status: 409 });
    return NextResponse.json({ error: 'create_failed', detail: createErr.message }, { status: 500 });
  }
  const userId = created.user!.id;
  await server.from('app_user_profile').upsert({ id: userId, role: 'tourism_agent' }, { onConflict: 'id' });

  return NextResponse.json({ userId, tempPassword, alreadyExisted: false }, { status: 201 });
}
