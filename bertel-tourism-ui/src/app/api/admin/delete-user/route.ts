import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getServerSupabaseClient } from '@/lib/supabase-server';

export const runtime = 'nodejs';

// Suppression DÉFINITIVE d'un compte utilisateur (auth.users). Les FK font le ménage :
// app_user_profile / user_org_membership (→ rôles) / user_permission sont ON DELETE CASCADE,
// toutes les traces d'auteur (created_by, granted_by…) sont ON DELETE SET NULL — vérifié live.
// Pour retirer l'accès en gardant le compte, utiliser rpc_deactivate_membership (soft).
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

  let body: { userId?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad_json' }, { status: 400 }); }
  const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
  if (!userId) return NextResponse.json({ error: 'invalid_user_id' }, { status: 422 });

  // Anti-self (même règle §2.6 que les RPCs d'équipe) : un admin ne se supprime pas lui-même.
  if (userId === caller.user.id) {
    return NextResponse.json({ error: 'self_delete_forbidden' }, { status: 403 });
  }

  const { error: deleteErr } = await server.auth.admin.deleteUser(userId);
  if (deleteErr) return NextResponse.json({ error: 'delete_failed', detail: deleteErr.message }, { status: 500 });

  return NextResponse.json({ deleted: true }, { status: 200 });
}
