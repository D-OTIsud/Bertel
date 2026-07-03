import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getServerSupabaseClient } from '@/lib/supabase-server';

export const runtime = 'nodejs';

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

  // Intentionally consumes only `email` (+ `resend`); membership + roles + permissions are wired
  // client-side as the admin via the rank-gated RPCs (see InviteMemberDialog).
  let body: { email?: unknown; orgObjectId?: unknown; resend?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad_json' }, { status: 400 }); }
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ error: 'invalid_email' }, { status: 422 });

  // Invitation e-mail (template Supabase « Invite user ») : l'invité clique le lien,
  // arrive authentifié sur /set-password et choisit son mot de passe. Le domaine de
  // redirection doit être dans l'allowlist Auth → URL Configuration du projet.
  const origin = (req.headers.get('origin') ?? new URL(req.url).origin).replace(/\/$/, '');
  const redirectTo = `${origin}/set-password`;

  // Renvoi d'invitation : GoTrue refuse inviteUserByEmail sur un e-mail existant, donc on
  // supprime puis ré-invite — UNIQUEMENT si le compte ne s'est jamais connecté (rien à perdre :
  // le client re-crée membership + permissions ; les FK cascade nettoient l'ancien userId).
  if (body.resend === true) {
    const { data: list } = await server.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const existing = list?.users?.find((u) => u.email?.toLowerCase() === email);
    if (existing) {
      if (existing.last_sign_in_at) {
        return NextResponse.json({ error: 'already_active', detail: 'Ce compte s’est déjà connecté — rien à renvoyer.' }, { status: 409 });
      }
      const { error: delErr } = await server.auth.admin.deleteUser(existing.id);
      if (delErr) return NextResponse.json({ error: 'resend_failed', detail: delErr.message }, { status: 500 });
    }
    // Absent (ou vient d'être supprimé) → l'invitation fraîche ci-dessous fait foi.
  }

  const { data: created, error: createErr } = await server.auth.admin.inviteUserByEmail(email, {
    redirectTo,
  });
  if (createErr) {
    // perPage bound: fine at current scale; revisit with a getUserByEmail/paged scan if the user base grows past ~1000.
    const { data: list } = await server.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const existing = list?.users?.find((u) => u.email?.toLowerCase() === email);
    if (existing) {
      return NextResponse.json(
        { userId: existing.id, alreadyExisted: true, neverSignedIn: !existing.last_sign_in_at },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: 'create_failed', detail: createErr.message }, { status: 500 });
  }
  const userId = created.user!.id;
  await server.from('app_user_profile').upsert({ id: userId, role: 'tourism_agent' }, { onConflict: 'id' });

  return NextResponse.json({ userId, alreadyExisted: false }, { status: 201 });
}
