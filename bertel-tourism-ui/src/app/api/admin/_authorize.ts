import { NextResponse, type NextRequest } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getServerSupabaseClient } from '@/lib/supabase-server';

/** Rang d'administration d'ORG minimal pour les routes /api/admin/*. */
const MIN_ADMIN_RANK = 30;

export type AdminAuth =
  | { ok: true; server: SupabaseClient; asCaller: SupabaseClient; callerId: string; isSuper: boolean; rank: number }
  | { ok: false; response: NextResponse };

/**
 * Authorize a /api/admin/* call AS THE CALLER.
 *
 * The service-role client returned here bypasses RLS, so this probe IS the security boundary —
 * exactly like the media upload route (§59). It runs the caller's own JWT through an anon client
 * so the DB answers for the CALLER, never for the service key.
 *
 * Returns the service-role client (`server`) and the caller-scoped client (`asCaller`) so a route
 * can run further caller-scoped probes (e.g. `api.is_platform_owner`) without rebuilding one.
 */
export async function authorizeAdminRoute(req: NextRequest): Promise<AdminAuth> {
  const server = getServerSupabaseClient();
  if (!server) {
    return { ok: false, response: NextResponse.json({ error: 'server_misconfigured' }, { status: 500 }) };
  }

  const authHeader = req.headers.get('authorization') ?? '';
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!jwt) {
    return { ok: false, response: NextResponse.json({ error: 'unauthenticated' }, { status: 401 }) };
  }
  const { data: caller, error: callerErr } = await server.auth.getUser(jwt);
  if (callerErr || !caller?.user) {
    return { ok: false, response: NextResponse.json({ error: 'unauthenticated' }, { status: 401 }) };
  }

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
  const numericRank = typeof rank === 'number' ? rank : 0;
  if (isSuper !== true && numericRank < MIN_ADMIN_RANK) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'forbidden', detail: 'org_admin (rank ≥ 30) or platform superuser required' },
        { status: 403 },
      ),
    };
  }

  return { ok: true, server, asCaller, callerId: caller.user.id, isSuper: isSuper === true, rank: numericRank };
}

/**
 * True when both accounts share at least one ACTIVE org membership.
 *
 * Scope guard for non-superuser admins: without it, a rank-30 admin of ORG A could act on an
 * account of ORG B by knowing its userId. Read with the service-role client on purpose — the
 * caller cannot read another user's memberships under RLS, and the answer must not depend on that.
 */
export async function sharesActiveOrg(
  server: SupabaseClient,
  aUserId: string,
  bUserId: string,
): Promise<boolean> {
  const { data, error } = await server
    .from('user_org_membership')
    .select('user_id, org_object_id')
    .in('user_id', [aUserId, bUserId])
    .eq('is_active', true);
  if (error || !data) return false;
  const aOrgs = new Set(
    data.filter((r) => r.user_id === aUserId).map((r) => r.org_object_id as string),
  );
  return data.some((r) => r.user_id === bUserId && aOrgs.has(r.org_object_id as string));
}
