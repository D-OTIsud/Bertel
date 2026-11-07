import { NextResponse, type NextRequest } from 'next/server';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { authorizeAdminRoute, MIN_ADMIN_RANK, type AdminAuth } from '../../_authorize';
import { routeFailure } from '../../../_route-failure';
import { getCanonicalAppOrigin } from '@/lib/canonical-app-origin.server';
import { SANDBOX_EMAIL_DETAIL, SANDBOX_EXTERNAL_EFFECTS_ERROR } from '@/lib/sandbox-effects';

export const runtime = 'nodejs';
const AUTH_PAGE_SIZE = 1000;

type AccountLookup =
  | { kind: 'complete'; user: User | undefined }
  | { kind: 'ambiguous' | 'failed' };

async function lookupAccount(server: SupabaseClient, email: string): Promise<AccountLookup> {
  const seen = new Set<string>();
  let total: number | undefined;
  let user: User | undefined;
  for (let page = 1; ; page += 1) {
    const { data, error } = await server.auth.admin.listUsers({ page, perPage: AUTH_PAGE_SIZE });
    if (error || !data || !Array.isArray(data.users) || !Number.isSafeInteger(data.total) || data.total < 0) {
      return { kind: 'failed' };
    }
    total ??= data.total;
    if (data.total !== total || data.users.length !== Math.min(AUTH_PAGE_SIZE, total - seen.size)) {
      return { kind: 'failed' };
    }
    const hasMore = seen.size + data.users.length < total;
    // auth-js currently parses only the first digit of nextPage. Use its presence,
    // and advance our own verified page sequence.
    const hasNext = typeof data.nextPage === 'number' && Number.isSafeInteger(data.nextPage) && data.nextPage > 0;
    if (hasMore ? !hasNext : data.nextPage !== null) return { kind: 'failed' };
    for (const candidate of data.users) {
      if (typeof candidate?.id !== 'string' || !candidate.id || seen.has(candidate.id)) return { kind: 'failed' };
      seen.add(candidate.id);
      if (candidate.email?.toLowerCase() !== email) continue;
      if (user) return { kind: 'ambiguous' };
      user = candidate;
    }
    if (!hasMore) return { kind: 'complete', user };
  }
}

function outOfScope(): NextResponse {
  return NextResponse.json({ error: 'out_of_scope' }, { status: 403 });
}

function canSendExistingInvite(user: User): boolean {
  return !user.email_confirmed_at && !user.confirmed_at && !user.last_sign_in_at && !user.is_sso_user;
}

async function checkInviteScope(auth: Extract<AdminAuth, { ok: true }>, orgId: string): Promise<NextResponse | null> {
  const { asCaller } = auth;
  if (auth.isSuper) {
    const { data, error } = await asCaller.schema('api').rpc('is_platform_superuser');
    if (error) return routeFailure('admin/invite.POST', 'authorization_check_failed', { status: 503 });
    return data === true ? null : outOfScope();
  }

  const { data: membership, error } = await asCaller.from('user_org_membership')
    .select('user_org_admin_role(is_active, ref_org_admin_role(rank))')
    .eq('user_id', auth.callerId).eq('org_object_id', orgId).eq('is_active', true).maybeSingle();
  if (error) return routeFailure('admin/invite.POST', 'authorization_check_failed', { status: 503 });
  const roles = (membership as { user_org_admin_role?: unknown } | null)?.user_org_admin_role;
  const isOrgAdmin = Array.isArray(roles) && roles.some((role) => {
    const rank: unknown = role?.ref_org_admin_role?.rank;
    return role?.is_active === true && typeof rank === 'number'
      && Number.isFinite(rank) && rank >= MIN_ADMIN_RANK;
  });
  return isOrgAdmin ? null : outOfScope();
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await authorizeAdminRoute(req);
  if (!auth.ok) return auth.response;
  if (auth.isSandboxDiscovery) return NextResponse.json({ error: SANDBOX_EXTERNAL_EFFECTS_ERROR, detail: SANDBOX_EMAIL_DETAIL }, { status: 403 });
  const { server, asCaller } = auth;

  const body = await req.json().catch(() => null) as
    { email?: unknown; orgObjectId?: unknown; businessRoleCode?: unknown; resend?: unknown } | null;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ error: 'invalid_email' }, { status: 422 });
  const orgId = typeof body.orgObjectId === 'string' ? body.orgObjectId.trim() : '';
  const roleCode = typeof body.businessRoleCode === 'string' ? body.businessRoleCode.trim() : '';
  if (!orgId || !roleCode) return NextResponse.json({ error: 'missing_fields' }, { status: 422 });

  // Invitation e-mail (template Supabase « Invite user ») : l'invité clique le lien,
  // arrive authentifié sur /set-password et choisit son mot de passe. Le domaine de
  // redirection doit être dans l'allowlist Auth → URL Configuration du projet.
  const origin = getCanonicalAppOrigin();
  if (!origin) return NextResponse.json({ error: 'app_origin_unavailable' }, { status: 503 });
  const redirectTo = `${origin}/set-password`;

  const callerApi = asCaller.schema('api');
  const scopeFailure = await checkInviteScope(auth, orgId);
  if (scopeFailure) return scopeFailure;
  const [org, role] = await Promise.all([
    server.from('object').select('id').eq('id', orgId).eq('object_type', 'ORG').maybeSingle(),
    asCaller.from('ref_org_business_role').select('code').eq('code', roleCode).maybeSingle(),
  ]);
  if (org.error || role.error) return routeFailure('admin/invite.POST', 'authorization_check_failed', { status: 503 });
  if (!org.data || !role.data) return NextResponse.json({ error: 'invalid_fields' }, { status: 422 });

  // GoTrue can send an invitation again for an existing unconfirmed account. A partial
  // or ambiguous lookup must never be treated as an absent account.
  const lookup = await lookupAccount(server, email).catch(() => ({ kind: 'failed' } as const));
  if (lookup.kind !== 'complete') {
    return lookup.kind === 'ambiguous' ? outOfScope() : routeFailure('admin/invite.POST', 'create_failed');
  }
  const existing = lookup.user;
  if (existing?.id === auth.callerId) return outOfScope();

  if (body.resend === true) {
    if (!existing) return outOfScope();
    // The caller may administer more than one organisation. RLS on other members
    // follows the selected organisation, so resolve only this already authorized pair.
    const { data: membership, error } = await server.from('user_org_membership').select('id')
      .eq('user_id', existing.id).eq('org_object_id', orgId).eq('is_active', true).maybeSingle();
    if (error) return routeFailure('admin/invite.POST', 'authorization_check_failed', { status: 503 });
    if (!membership) return outOfScope();
    const resendScopeFailure = await checkInviteScope(auth, orgId);
    if (resendScopeFailure) return resendScopeFailure;
    if (!canSendExistingInvite(existing)) {
      return NextResponse.json({ error: 'already_active' }, { status: 409 });
    }
    const { data, error: inviteError } = await server.auth.admin.inviteUserByEmail(email, { redirectTo });
    if (inviteError || data.user?.id !== existing.id) return routeFailure('admin/invite.POST', 'resend_failed');
    return NextResponse.json({ userId: existing.id, membershipId: membership.id, alreadyExisted: false }, { status: 201 });
  }

  let userId = existing?.id;
  if (!userId) {
    const inviteScopeFailure = await checkInviteScope(auth, orgId);
    if (inviteScopeFailure) return inviteScopeFailure;
    // Keep GoTrue's initial invitation and Auth hooks. This send precedes the
    // separate membership transaction, so delivery can precede a refused attachment.
    const { data, error } = await server.auth.admin.inviteUserByEmail(email, { redirectTo });
    if (error || !data.user?.id) return routeFailure('admin/invite.POST', 'create_failed');
    userId = data.user.id;
  }

  const { data: activeMemberships, error: membershipError } = await server.from('user_org_membership')
    .select('org_object_id').eq('user_id', userId).eq('is_active', true);
  if (membershipError || !activeMemberships) return routeFailure('admin/invite.POST', 'authorization_check_failed', { status: 503 });
  const alreadyInOrg = activeMemberships.some((membership) => membership.org_object_id === orgId);
  if (!auth.isSuper && !alreadyInOrg) {
    if (activeMemberships.length > 0) return outOfScope();
    // Granting a shared membership also opens scoped profile and avatar operations.
    const { data: profile, error } = await server.from('app_user_profile').select('role').eq('id', userId).maybeSingle();
    if (error || (profile && profile.role !== null && profile.role !== 'tourism_agent')) return outOfScope();
  }

  // Commit the same caller-scoped attachment before returning any account identity.
  const attachScopeFailure = await checkInviteScope(auth, orgId);
  if (attachScopeFailure) return attachScopeFailure;
  const { data: membershipId, error } = await callerApi.rpc('rpc_upsert_membership', {
    p_target_user_id: userId, p_org_object_id: orgId, p_business_role_code: roleCode,
  });
  if (error || typeof membershipId !== 'string' || !membershipId) return outOfScope();
  if (existing) {
    if (canSendExistingInvite(existing)) {
      // An existing account can only receive this mail once attachment is confirmed.
      // Auth delivery is separate: failure leaves the committed membership in place.
      const deliveryScopeFailure = await checkInviteScope(auth, orgId);
      if (deliveryScopeFailure) return deliveryScopeFailure;
      const { data, error: inviteError } = await server.auth.admin.inviteUserByEmail(email, { redirectTo });
      if (inviteError || data.user?.id !== userId) return routeFailure('admin/invite.POST', 'resend_failed');
      return NextResponse.json({ userId, membershipId, alreadyExisted: false }, { status: 201 });
    }
    return NextResponse.json({ userId, membershipId, alreadyExisted: true }, { status: 409 });
  }

  // The Auth trigger creates the profile. A simultaneous invitation must not overwrite
  // any platform role assigned between the lookup and the invitation response.
  await server.from('app_user_profile').update({ role: 'tourism_agent' }).eq('id', userId).is('role', null);
  return NextResponse.json({ userId, membershipId, alreadyExisted: false }, { status: 201 });
}
