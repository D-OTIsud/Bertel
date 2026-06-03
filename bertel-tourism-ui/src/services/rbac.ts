import { getApiClient } from '../lib/supabase';
import { getSupabaseClient } from '../lib/supabase';

export interface OrgMember {
  membershipId: string;
  userId: string;
  email: string | null;
  displayName: string | null;
  isActive: boolean;
  businessRoleCode: string | null;
  adminRoleCode: string | null;
  permissionCodes: string[];
}
export interface RefRole { code: string; name: string; rank: number | null; position: number | null; }
export interface RefPermission { code: string; name: string; category: string; }
export interface InviteResult { userId: string; tempPassword: string; alreadyExisted: boolean; }

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
export const upsertMembership = (userId: string, orgObjectId: string, businessRoleCode: string) =>
  requireClient().schema('api').rpc('rpc_upsert_membership',
    { p_target_user_id: userId, p_org_object_id: orgObjectId, p_business_role_code: businessRoleCode });
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

/** Invite via the server route (service-role). Returns the temp password once. */
export async function inviteUser(input: { email: string; orgObjectId: string; businessRoleCode: string }): Promise<InviteResult> {
  const client = getSupabaseClient();
  const token = (await client?.auth.getSession())?.data.session?.access_token;
  const res = await fetch('/api/admin/invite', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: token ? `Bearer ${token}` : '' },
    body: JSON.stringify({ email: input.email, orgObjectId: input.orgObjectId }),
  });
  const body = await res.json();
  if (res.status === 409 && body?.userId) {
    return { userId: body.userId, tempPassword: '', alreadyExisted: true };
  }
  if (!res.ok) throw new Error(body?.detail || body?.error || 'invite_failed');
  return { userId: body.userId, tempPassword: body.tempPassword, alreadyExisted: false };
}

const FRIENDLY: Array<[string, string]> = [
  ['SELF_ACTION_FORBIDDEN', 'Un administrateur ne peut pas modifier son propre rôle ou ses permissions — demandez à un autre admin.'],
  ['INSUFFICIENT_RANK', "Vous n'avez pas un rang d'administration suffisant pour cette action."],
  ['RANK_VIOLATION', 'Action impossible sur un membre de rang égal ou supérieur au vôtre.'],
  ['INVARIANT_VIOLATION', "Un rôle admin exige d'abord un rôle métier actif."],
  ['INVALID_ORG', "Organisation cible invalide."],
];
export function friendlyRbacError(err: { message?: string } | null | undefined): string {
  const msg = err?.message ?? '';
  for (const [code, friendly] of FRIENDLY) if (msg.includes(code)) return friendly;
  return msg || 'Action impossible.';
}
