import { NextResponse, type NextRequest } from 'next/server';
import { authorizeAdminRoute } from '../_authorize';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** CHECK app_user_profile.role (schema_unified.sql:2627) : NULL et 'tourism_agent' sont ordinaires. */
const KNOWN_ROLES = new Set(['owner', 'super_admin', 'tourism_agent']);

// Suppression DÉFINITIVE d'un compte utilisateur (auth.users). Les FK font le ménage :
// app_user_profile / user_org_membership (→ rôles) / user_permission sont ON DELETE CASCADE,
// toutes les traces d'auteur (created_by, granted_by…) sont ON DELETE SET NULL — vérifié live.
// Pour retirer l'accès en gardant le compte, utiliser rpc_deactivate_membership (soft).
//
// SEC-01 (audit sécurité 2026-09-05) : contrairement au PATCH profil (garde un rang D'ORG), cette
// route détruit une IDENTITÉ auth.users qui traverse toutes les organisations — c'est une capacité
// PLATEFORME, jamais une capacité d'ORG. Un admin local (rang ≥ 30, même sans statut superuser)
// n'a donc plus aucun chemin vers cette route, même sur sa propre organisation ou sur une
// adhésion qu'il vient de désactiver lui-même : il garde `rpc_deactivate_membership` pour retirer
// l'accès sans détruire le compte.
export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await authorizeAdminRoute(req);
  if (!auth.ok) return auth.response;
  const { server } = auth;

  let parsed: unknown;
  try { parsed = await req.json(); } catch { return NextResponse.json({ error: 'bad_json' }, { status: 400 }); }
  // `null` est un JSON valide (hors du catch) ; un tableau n'est pas l'objet à plat attendu.
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }
  const rawUserId = (parsed as { userId?: unknown }).userId;
  const userId = typeof rawUserId === 'string' ? rawUserId.trim() : '';
  if (!userId || !UUID_RE.test(userId)) {
    return NextResponse.json({ error: 'invalid_user_id' }, { status: 422 });
  }

  // Anti-self, insensible à la casse (PostgreSQL normalise les uuid ; même règle que le PATCH
  // profil) : un UUID propre envoyé en majuscules ne doit pas passer la garde.
  if (userId.toLowerCase() === auth.callerId.toLowerCase()) {
    return NextResponse.json({ error: 'self_delete_forbidden' }, { status: 403 });
  }

  // Capacité PLATEFORME uniquement (`is_platform_superuser` = owner OU super_admin, déjà évalué
  // CÔTÉ APPELANT par authorizeAdminRoute). Refuse TOUT admin d'ORG, même de rang 50, même
  // partageant l'ORG de la cible — voir le commentaire de tête.
  if (!auth.isSuper) {
    return NextResponse.json(
      {
        error: 'platform_superuser_required',
        detail: 'org_admin (rank ≥ 30) required by authorizeAdminRoute, but only a platform admin (owner or super_admin) may delete an account',
      },
      { status: 403 },
    );
  }

  // Rôle plateforme de la CIBLE, lu en service-role : une suppression de compte est IRRÉVERSIBLE,
  // contrairement au PATCH profil (qui tolère une ligne de profil absente pour un compte invité).
  // Ici, une erreur de lecture OU une ligne absente ne doivent JAMAIS se travestir en « cible
  // ordinaire » — fail-closed.
  const { data: targetProfile, error: profileErr } = await server
    .from('app_user_profile')
    .select('role')
    .eq('id', userId)
    .maybeSingle<{ role: string | null }>();
  if (profileErr || !targetProfile) {
    return NextResponse.json(
      {
        error: 'target_profile_check_failed',
        detail: profileErr?.message ?? 'app_user_profile introuvable pour la cible',
      },
      { status: 500 },
    );
  }
  const targetRole = targetProfile.role;
  if (targetRole !== null && !KNOWN_ROLES.has(targetRole)) {
    return NextResponse.json(
      { error: 'target_profile_check_failed', detail: 'rôle plateforme cible de forme inattendue' },
      { status: 500 },
    );
  }

  // Owner : jamais de suppression DIRECTE depuis cette route (dernier owner potentiel, prise de
  // contrôle définitive d'une plateforme sans owner). Une rétrogradation explicite et autorisée
  // doit avoir eu lieu EN AMONT ; pas de COUNT(*) racy sur les owners restants ici.
  if (targetRole === 'owner') {
    return NextResponse.json(
      {
        error: 'owner_delete_forbidden',
        detail: "La suppression directe du compte owner est interdite. Rétrogradez-le d'abord explicitement.",
      },
      { status: 403 },
    );
  }

  if (targetRole === 'super_admin') {
    // Seul un owner peut supprimer un super_admin — même sonde et même prédicat à trois valeurs
    // que le PATCH profil (`isOwner !== true` couvre `false` ET une erreur RPC : fail-closed).
    const { data: isOwner, error: ownerError } = await auth.asCaller.schema('api').rpc('is_platform_owner');
    if (ownerError || isOwner !== true) {
      return NextResponse.json(
        {
          error: 'owner_required_for_super_admin_delete',
          detail: 'Seul un owner de la plateforme peut supprimer un compte super administrateur.',
        },
        { status: 403 },
      );
    }
  }

  const { error: deleteErr } = await server.auth.admin.deleteUser(userId);
  if (deleteErr) return NextResponse.json({ error: 'delete_failed', detail: deleteErr.message }, { status: 500 });

  return NextResponse.json({ deleted: true }, { status: 200 });
}
