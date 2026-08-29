import { NextResponse, type NextRequest } from 'next/server';
import { authorizeAdminRoute, sharesActiveOrg } from '../_authorize';

export const runtime = 'nodejs';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await authorizeAdminRoute(req);
  if (!auth.ok) return auth.response;
  const { server } = auth;

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
      // Garde périmètre ORG (revue finale, correctif bloquant) — SEULEMENT sur cette branche
      // `resend`, et APRÈS résolution du compte existant : une adresse jamais invitée n'a aucun
      // membership, donc `sharesActiveOrg` y rendrait toujours faux et bloquerait en 403 toute
      // invitation d'un membre réellement nouveau (piège A). Sans cette garde ICI, un admin d'ORG
      // de rang 30 pouvait détruire un compte jamais connecté d'une AUTRE organisation en
      // connaissant son e-mail (`resend: true` supprime avant de ré-inviter = suppression pure).
      // `sharesActiveOrg` (pas la variante « cible désactivée » de delete-user) convient : un
      // compte encore ré-invitable a déjà été rattaché par le flux d'invitation normal, donc son
      // membership est actif.
      if (!auth.isSuper && !(await sharesActiveOrg(server, auth.callerId, existing.id))) {
        return NextResponse.json({ error: 'out_of_scope' }, { status: 403 });
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
