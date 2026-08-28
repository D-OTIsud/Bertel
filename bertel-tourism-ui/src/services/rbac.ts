import { getApiClient } from '../lib/supabase';
import { getSupabaseClient } from '../lib/supabase';
import { readApiErrorMessage } from './api-error';

export interface OrgMember {
  membershipId: string;
  userId: string;
  email: string | null;
  displayName: string | null;
  isActive: boolean;
  businessRoleCode: string | null;
  adminRoleCode: string | null;
  /** Droits accordés INDIVIDUELLEMENT (`user_permission`) — ce que pilotent les cases à cocher. */
  permissionCodes: string[];
  /** Dernière activité (ISO) = dernière connexion OU dernier refresh de session, au plus récent. */
  lastSeenAt: string | null;
  /**
   * Droits venus de `org_permission`, hérités par TOUS les membres actifs de l'ORG (17d).
   *
   * Champ SÉPARÉ de `permissionCodes`, et c'est structurant : la case à cocher pilote
   * `user_permission` et ne doit jamais prétendre piloter l'héritage. Les fusionner rendrait la
   * case menteuse — la décocher ne retirerait pas le droit hérité.
   */
  inheritedPermissionCodes: string[];
  /**
   * Superuser plateforme (`app_user_profile.role`) — ouvre TOUT, indépendamment des permissions
   * et du rôle d'ORG (17d). Avec `adminRoleCode`, c'est l'accès que l'écran ne montrait pas :
   * en production, les 6 Éditeurs tiennent leurs droits CRM de leur rôle d'administration.
   */
  isPlatformSuperuser: boolean;
}
export interface RefRole { code: string; name: string; rank: number | null; position: number | null; }
export interface RefPermission { code: string; name: string; category: string; }
export interface InviteResult {
  userId: string;
  alreadyExisted: boolean;
  /** Set on the 409 arm only: true when the existing account never signed in (resend possible). */
  neverSignedIn?: boolean;
}

function requireClient() {
  const c = getApiClient();
  if (!c) throw new Error('Supabase non configuré.');
  return c;
}

/** Roster with identities (SECURITY DEFINER RPC — see migration_sp4_list_org_members.sql). */
export async function listOrgMembers(orgObjectId: string): Promise<OrgMember[]> {
  const { data, error } = await requireClient().schema('api').rpc('rpc_list_org_members', { p_org_object_id: orgObjectId });
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    membershipId: String(r.membership_id),
    userId: String(r.user_id),
    email: (r.email as string) ?? null,
    displayName: (r.display_name as string) ?? null,
    isActive: r.is_active === true,
    businessRoleCode: (r.business_role_code as string) ?? null,
    adminRoleCode: (r.admin_role_code as string) ?? null,
    permissionCodes: Array.isArray(r.permission_codes) ? (r.permission_codes as string[]) : [],
    lastSeenAt: (r.last_seen_at as string) ?? null,
    // 17d — tolérant : un backend antérieur à la migration ne porte pas ces clés, et l'écran
    // doit alors se comporter comme avant plutôt que casser.
    inheritedPermissionCodes: Array.isArray(r.inherited_permission_codes)
      ? (r.inherited_permission_codes as string[])
      : [],
    isPlatformSuperuser: r.is_platform_superuser === true,
  }));
}

/** Reference catalogs (public ref tables, direct reads). */
export async function listBusinessRoles(): Promise<RefRole[]> {
  const { data, error } = await getSupabaseClient()!.from('ref_org_business_role').select('code,name,position').order('position');
  if (error) throw error;
  return (data ?? []).map((r) => ({ code: r.code, name: r.name, rank: null, position: r.position }));
}
export async function listAdminRoles(): Promise<RefRole[]> {
  const { data, error } = await getSupabaseClient()!.from('ref_org_admin_role').select('code,name,rank').order('rank');
  if (error) throw error;
  return (data ?? []).map((r) => ({ code: r.code, name: r.name, rank: r.rank, position: null }));
}
export async function listPermissionCatalog(): Promise<RefPermission[]> {
  const { data, error } = await getSupabaseClient()!.from('ref_permission').select('code,name,category').eq('is_active', true).order('category');
  if (error) throw error;
  return data ?? [];
}
export async function listOrgPermissions(orgObjectId: string): Promise<string[]> {
  const { data, error } = await getSupabaseClient()!.from('org_permission')
    .select('ref_permission(code)').eq('org_object_id', orgObjectId).eq('is_active', true);
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => (r.ref_permission as { code: string })?.code).filter(Boolean);
}

// ---- Mutations (existing rank-gated RPCs; run as the logged-in admin) ----
async function rpc(name: string, params: Record<string, unknown>): Promise<void> {
  const { error } = await requireClient().schema('api').rpc(name, params);
  if (error) throw error;
}
export async function upsertMembership(userId: string, orgObjectId: string, businessRoleCode: string): Promise<string> {
  const { data, error } = await requireClient().schema('api').rpc('rpc_upsert_membership',
    { p_target_user_id: userId, p_org_object_id: orgObjectId, p_business_role_code: businessRoleCode });
  if (error) throw error;
  return data as string;
}
export const setBusinessRole = (membershipId: string, roleCode: string) =>
  rpc('rpc_set_business_role', { p_membership_id: membershipId, p_role_code: roleCode });
export const setAdminRole = (membershipId: string, roleCode: string) =>
  rpc('rpc_set_admin_role', { p_membership_id: membershipId, p_role_code: roleCode });
export const revokeAdminRole = (membershipId: string) =>
  rpc('rpc_revoke_admin_role', { p_membership_id: membershipId });
export const deactivateMembership = (membershipId: string) =>
  rpc('rpc_deactivate_membership', { p_membership_id: membershipId });
export const grantUserPermission = (userId: string, code: string) =>
  rpc('rpc_grant_user_permission', { p_target_user_id: userId, p_permission_code: code });
export const revokeUserPermission = (userId: string, code: string) =>
  rpc('rpc_revoke_user_permission', { p_target_user_id: userId, p_permission_code: code });
export const grantOrgPermission = (orgObjectId: string, code: string) =>
  rpc('rpc_grant_org_permission', { p_org_object_id: orgObjectId, p_permission_code: code });
export const revokeOrgPermission = (orgObjectId: string, code: string) =>
  rpc('rpc_revoke_org_permission', { p_org_object_id: orgObjectId, p_permission_code: code });

/** Invite via the server route (service-role) — envoie l'e-mail d'invitation Supabase.
 *  `resend: true` = renvoyer l'invitation à un compte jamais connecté (delete + re-invite serveur). */
export async function inviteUser(input: { email: string; orgObjectId: string; businessRoleCode: string; resend?: boolean }): Promise<InviteResult> {
  const client = getSupabaseClient();
  const token = (await client?.auth.getSession())?.data.session?.access_token;
  const res = await fetch('/api/admin/invite', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: token ? `Bearer ${token}` : '' },
    body: JSON.stringify({ email: input.email, orgObjectId: input.orgObjectId, resend: input.resend === true }),
  });
  const body = await res.json();
  if (res.status === 409 && body?.userId) {
    return { userId: body.userId, alreadyExisted: true, neverSignedIn: body.neverSignedIn === true };
  }
  if (!res.ok) throw rbacRouteError(body, res.status);
  return { userId: body.userId, alreadyExisted: false };
}

/** Suppression DÉFINITIVE du compte (auth + cascade profil/membership/permissions).
 *  Pour un retrait d'accès réversible, utiliser deactivateMembership. */
export async function deleteUserAccount(userId: string): Promise<void> {
  const client = getSupabaseClient();
  const token = (await client?.auth.getSession())?.data.session?.access_token;
  const res = await fetch('/api/admin/delete-user', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: token ? `Bearer ${token}` : '' },
    body: JSON.stringify({ userId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw rbacRouteError(body, res.status);
  }
}

/**
 * Erreur FR d'une route `/api/admin/*` (chantier 2026-08-28 n°4).
 *
 * Ces deux sites étaient les SEULS de tout `src/` dont le repli terminal n'était pas français mais
 * un code machine (`invite_failed`, `delete_failed`). Le correctif ne peut pas se contenter
 * d'appeler `readApiErrorMessage` : le `detail` de ces routes relaie souvent un `RAISE` de RPC
 * portant un code métier (`SELF_ACTION_FORBIDDEN`, `INSUFFICIENT_RANK`…) que la table `FRIENDLY`
 * ci-dessous traduit BEAUCOUP mieux. On la consulte donc d'abord, et on ne retombe sur la table
 * générique que si aucun code métier n'est reconnu.
 */
function rbacRouteError(body: { detail?: string; error?: string } | null | undefined, status: number): Error {
  const raw = typeof body?.detail === 'string' ? body.detail : '';
  for (const [code, friendly] of FRIENDLY) {
    if (raw.includes(code)) return new Error(friendly);
  }
  return new Error(readApiErrorMessage(body, status));
}

const FRIENDLY: Array<[string, string]> = [
  ['SELF_ACTION_FORBIDDEN', 'Un administrateur ne peut pas modifier son propre rôle ou ses permissions — demandez à un autre admin.'],
  ['INSUFFICIENT_RANK', "Vous n'avez pas un rang d'administration suffisant pour cette action."],
  ['RANK_VIOLATION', 'Action impossible sur un membre de rang égal ou supérieur au vôtre.'],
  ['INVARIANT_VIOLATION', "Un rôle admin exige d'abord un rôle métier actif."],
  ['INVALID_ORG', "Organisation cible invalide."],
  ['FORBIDDEN', "Action non autorisée pour votre rôle."],
  ['NOT_FOUND', "Élément introuvable (le membre ou l'objet n'existe pas / plus)."],
];
export function friendlyRbacError(err: { message?: string } | null | undefined): string {
  const msg = err?.message ?? '';
  for (const [code, friendly] of FRIENDLY) if (msg.includes(code)) return friendly;
  return msg || 'Action impossible.';
}
