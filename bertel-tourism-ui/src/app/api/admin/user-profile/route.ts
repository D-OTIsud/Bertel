import { NextResponse, type NextRequest } from 'next/server';
import { authorizeAdminRoute, sharesActiveOrg } from '../_authorize';

export const runtime = 'nodejs';

// Identité d'un MEMBRE, éditée par un administrateur (panneau Équipe).
//
// Les 4 gardes vivent ici et NULLE PART ailleurs côté client : l'écran désactive des contrôles
// pour rendre l'état lisible, il ne garde rien. L'écriture ci-dessous tourne en service-role
// (bypass RLS), donc les sondes "en tant qu'appelant" SONT la frontière (même modèle que §59).

const PATCH_FIELDS = new Set(['userId', 'displayName', 'email', 'platformRole']);
const PLATFORM_ROLES = new Set(['tourism_agent', 'super_admin', 'owner']);
/** Rôles qu'en base SEUL un owner peut attribuer (trigger api.enforce_app_user_profile_role_change). */
const PRIVILEGED_ROLES = new Set(['super_admin', 'owner']);
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

interface TargetProfile { display_name: string | null; avatar_url: string | null; role: string | null }

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await authorizeAdminRoute(req);
  if (!auth.ok) return auth.response;
  const { server } = auth;

  const userId = (new URL(req.url).searchParams.get('userId') ?? '').trim();
  if (!userId) return NextResponse.json({ error: 'invalid_user_id' }, { status: 422 });

  if (!auth.isSuper && !(await sharesActiveOrg(server, auth.callerId, userId))) {
    return NextResponse.json({ error: 'out_of_scope' }, { status: 403 });
  }

  const { data: authUser, error: authErr } = await server.auth.admin.getUserById(userId);
  if (authErr || !authUser?.user) return NextResponse.json({ error: 'user_not_found' }, { status: 404 });

  const { data: profile } = await server
    .from('app_user_profile')
    .select('display_name, avatar_url, role')
    .eq('id', userId)
    .maybeSingle<TargetProfile>();

  return NextResponse.json({
    displayName: profile?.display_name ?? null,
    avatarUrl: profile?.avatar_url ?? null,
    email: authUser.user.email ?? null,
    platformRole: profile?.role ?? null,
    lastSignInAt: authUser.user.last_sign_in_at ?? null,
  });
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const auth = await authorizeAdminRoute(req);
  if (!auth.ok) return auth.response;
  const { server } = auth;

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ error: 'bad_json' }, { status: 400 }); }

  // Une clé inconnue FAIT ÉCHOUER l'appel : une valeur jetée en silence est un piège d'écriture.
  const unknown = Object.keys(body).find((k) => !PATCH_FIELDS.has(k));
  if (unknown) return NextResponse.json({ error: 'unknown_field', detail: unknown }, { status: 422 });

  const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
  if (!userId) return NextResponse.json({ error: 'invalid_user_id' }, { status: 422 });

  // Anti-self : un owner qui se rétrograde se verrouille dehors, et son identité a déjà sa
  // surface (Réglages → Mon compte).
  if (userId === auth.callerId) {
    return NextResponse.json({ error: 'self_edit_forbidden' }, { status: 403 });
  }
  if (!auth.isSuper && !(await sharesActiveOrg(server, auth.callerId, userId))) {
    return NextResponse.json({ error: 'out_of_scope' }, { status: 403 });
  }

  const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : undefined;
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : undefined;
  const platformRole = typeof body.platformRole === 'string' ? body.platformRole.trim() : undefined;

  if (email !== undefined && !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'invalid_email' }, { status: 422 });
  }
  if (platformRole !== undefined && !PLATFORM_ROLES.has(platformRole)) {
    return NextResponse.json({ error: 'invalid_platform_role' }, { status: 422 });
  }

  const { data: profile } = await server
    .from('app_user_profile')
    .select('display_name, avatar_url, role')
    .eq('id', userId)
    .maybeSingle<TargetProfile>();

  // Garde n° 4 — transcription littérale du trigger api.enforce_app_user_profile_role_change,
  // que l'écriture service-role ci-dessous NEUTRALISE (le trigger traite service_role comme un
  // owner et sort d'emblée sans JWT). Sans cette sonde, un super_admin ou un admin de rang 30
  // distribuerait le rang plateforme. Le sens compte dans les DEUX directions : retirer
  // 'owner'/'super_admin' à quelqu'un est aussi privilégié que le lui donner.
  if (platformRole !== undefined && platformRole !== (profile?.role ?? null)) {
    const touchesPrivileged =
      PRIVILEGED_ROLES.has(platformRole) || PRIVILEGED_ROLES.has(profile?.role ?? '');
    if (touchesPrivileged) {
      const { data: isOwner } = await auth.asCaller.schema('api').rpc('is_platform_owner');
      if (isOwner !== true) {
        return NextResponse.json(
          { error: 'owner_required', detail: 'Seul un owner peut attribuer ou retirer le rang plateforme.' },
          { status: 403 },
        );
      }
    }
  }

  if (email !== undefined) {
    // email_confirm: true ⇒ changement IMMÉDIAT, pas de courriel de confirmation. L'e-mail est
    // aussi ce que api.is_object_owner compare à actor_channel : changer l'adresse peut changer
    // les fiches que ce membre possède. La modale l'annonce à l'utilisateur.
    const { error: mailErr } = await server.auth.admin.updateUserById(userId, { email, email_confirm: true });
    if (mailErr) {
      return NextResponse.json({ error: 'email_update_failed', detail: mailErr.message }, { status: 500 });
    }
  }

  const patch: Record<string, unknown> = {};
  if (displayName !== undefined) patch.display_name = displayName;
  if (platformRole !== undefined) patch.role = platformRole;
  if (Object.keys(patch).length > 0) {
    // upsert : un compte invité peut ne pas encore avoir de ligne de profil applicatif.
    const { error: profErr } = await server
      .from('app_user_profile')
      .upsert({ id: userId, ...patch }, { onConflict: 'id' });
    if (profErr) {
      return NextResponse.json({ error: 'profile_update_failed', detail: profErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ updated: true }, { status: 200 });
}
