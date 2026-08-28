import { NextResponse, type NextRequest } from 'next/server';
import { authorizeAdminRoute } from '../_authorize';

export const runtime = 'nodejs';

// Suppression DÉFINITIVE d'un compte utilisateur (auth.users). Les FK font le ménage :
// app_user_profile / user_org_membership (→ rôles) / user_permission sont ON DELETE CASCADE,
// toutes les traces d'auteur (created_by, granted_by…) sont ON DELETE SET NULL — vérifié live.
// Pour retirer l'accès en gardant le compte, utiliser rpc_deactivate_membership (soft).
export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await authorizeAdminRoute(req);
  if (!auth.ok) return auth.response;
  const { server } = auth;

  let body: { userId?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad_json' }, { status: 400 }); }
  const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
  if (!userId) return NextResponse.json({ error: 'invalid_user_id' }, { status: 422 });

  // Anti-self (même règle §2.6 que les RPCs d'équipe) : un admin ne se supprime pas lui-même.
  if (userId === auth.callerId) {
    return NextResponse.json({ error: 'self_delete_forbidden' }, { status: 403 });
  }

  const { error: deleteErr } = await server.auth.admin.deleteUser(userId);
  if (deleteErr) return NextResponse.json({ error: 'delete_failed', detail: deleteErr.message }, { status: 500 });

  return NextResponse.json({ deleted: true }, { status: 200 });
}
