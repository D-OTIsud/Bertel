import { NextResponse, type NextRequest } from 'next/server';
import { engineErrorDetail } from '@/lib/db-error-message';
import { authorizeAdminRoute, sharesOrgIgnoringTargetActivity } from '../_authorize';

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

  // Garde périmètre ORG (revue finale, correctif bloquant) — sans elle, un admin d'ORG de rang 30
  // pouvait supprimer DÉFINITIVEMENT le compte d'une AUTRE organisation en connaissant son UUID.
  // `sharesOrgIgnoringTargetActivity` (pas `sharesActiveOrg`) : le parcours normal désactive
  // d'abord le membership de la cible (`rpc_deactivate_membership`) avant d'éventuellement purger
  // son compte — exiger l'activité des DEUX côtés casserait cet usage légitime (piège B).
  // L'appelant, lui, doit rester ACTIF : un admin dont le mandat a expiré ne garde aucun périmètre.
  if (!auth.isSuper && !(await sharesOrgIgnoringTargetActivity(server, auth.callerId, userId))) {
    return NextResponse.json({ error: 'out_of_scope' }, { status: 403 });
  }

  const { error: deleteErr } = await server.auth.admin.deleteUser(userId);
  if (deleteErr) {
    // Même piège que `actor-document` : `delete_failed` est allowlisté (api-error.ts), son `detail`
    // s'affiche VERBATIM. Celui-ci vient de GoTrue — anglais, et il nomme volontiers la table
    // interne en cause (« Database error deleting user »). GoTrue ne porte pas de SQLSTATE :
    // `engineErrorDetail` rend donc `undefined` et le client lit « La suppression a échoué. ».
    // Le brut, lui, part au journal du serveur.
    return NextResponse.json({ error: 'delete_failed', detail: engineErrorDetail(deleteErr, { operation: 'delete' }) }, { status: 500 });
  }

  return NextResponse.json({ deleted: true }, { status: 200 });
}
