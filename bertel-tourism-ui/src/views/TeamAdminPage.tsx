'use client';
import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { useSessionStore } from '@/store/session-store';
import { canAdministerTeam } from '@/store/session-selectors';
import {
  listOrgMembers,
  listBusinessRoles,
  listAdminRoles,
  listPermissionCatalog,
  listOrgPermissions,
  setBusinessRole,
  setAdminRole,
  revokeAdminRole,
  deactivateMembership,
  friendlyRbacError,
  getDefaultOrgId,
  type OrgMember,
  type RefRole,
  type RefPermission,
} from '@/services/rbac';
import { MembersTable } from '@/features/team/MembersTable';
import { RoleSelect } from '@/features/team/RoleSelect';
import { InviteMemberDialog } from '@/features/team/InviteMemberDialog';
import { MemberPermissionsDrawer } from '@/features/team/MemberPermissionsDrawer';

export default function TeamAdminPage() {
  const role = useSessionStore((s) => s.role);
  const adminRank = useSessionStore((s) => s.adminRank);
  const orgId = useSessionStore((s) => s.orgId);
  const userId = useSessionStore((s) => s.userId);
  const allowed = canAdministerTeam({ role, adminRank });

  // effectiveOrgId: use the session org when available; fall back to the default ORG for
  // superusers/owners who have no active membership (e.g. platform admin with no org assignment).
  const [effectiveOrgId, setEffectiveOrgId] = useState<string | null>(null);

  useEffect(() => {
    if (orgId) {
      setEffectiveOrgId(orgId);
    } else if (allowed && (role === 'owner' || role === 'super_admin')) {
      getDefaultOrgId().then(setEffectiveOrgId).catch(() => {});
    }
  }, [orgId, role, allowed]);

  const [members, setMembers] = useState<OrgMember[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [bizRoles, setBizRoles] = useState<RefRole[]>([]);
  const [adminRoles, setAdminRoles] = useState<RefRole[]>([]);
  const [catalog, setCatalog] = useState<RefPermission[]>([]);
  const [orgPerms, setOrgPerms] = useState<string[]>([]);
  // ID of the membership whose permissions drawer is open (null = closed).
  const [managingId, setManagingId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!effectiveOrgId) { setLoading(false); return; }
    setLoading(true);
    try { setMembers(await listOrgMembers(effectiveOrgId)); setError(null); }
    catch (e) { setError(e instanceof Error ? e.message : 'Erreur de chargement'); }
    finally { setLoading(false); }
    // Refresh org-wide permission grants so the drawer reflects latest state.
    listOrgPermissions(effectiveOrgId).then(setOrgPerms).catch(() => {});
  }, [effectiveOrgId]);

  useEffect(() => { if (allowed) void reload(); }, [allowed, reload]);

  // Load role catalogs + permission catalog once when allowed.
  useEffect(() => {
    if (!allowed) return;
    listBusinessRoles().then(setBizRoles).catch(() => {});
    listAdminRoles().then(setAdminRoles).catch(() => {});
    listPermissionCatalog().then(setCatalog).catch(() => {});
    if (effectiveOrgId) listOrgPermissions(effectiveOrgId).then(setOrgPerms).catch(() => {});
  }, [allowed, effectiveOrgId]);

  // Caller's effective admin rank (superuser/owner → Infinity so all ranks are assignable).
  const callerRank = (role === 'owner' || role === 'super_admin') ? Infinity : (adminRank ?? 0);

  // Derive the live member object from managingId so the drawer reflects freshly reloaded data.
  const managing = members.find((m) => m.membershipId === managingId) ?? null;

  // Org-defaults section visible only to org_admin rank >= 30, owner, or superuser.
  const canManageOrgDefaults = role === 'owner' || role === 'super_admin' || (adminRank ?? 0) >= 30;

  async function changeBusinessRole(m: OrgMember, code: string) {
    try {
      await setBusinessRole(m.membershipId, code);
      toast.success('Rôle métier mis à jour.');
    } catch (e) {
      toast.error(friendlyRbacError(e as { message?: string }));
    }
    await reload();
  }

  async function changeAdminRole(m: OrgMember, code: string | null) {
    try {
      if (code === null) {
        await revokeAdminRole(m.membershipId);
      } else {
        await setAdminRole(m.membershipId, code);
      }
      toast.success('Rôle admin mis à jour.');
    } catch (e) {
      toast.error(friendlyRbacError(e as { message?: string }));
    }
    await reload();
  }

  async function handleDeactivate(m: OrgMember) {
    if (!window.confirm('Désactiver ce membre ?')) return;
    try {
      await deactivateMembership(m.membershipId);
      toast.success('Membre désactivé.');
    } catch (e) {
      toast.error(friendlyRbacError(e as { message?: string }));
    }
    await reload();
  }

  if (!allowed) return <section className="p-6"><p>Accès réservé aux administrateurs.</p></section>;
  return (
    <section className="p-6 space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Équipe</h1>
        {effectiveOrgId && <InviteMemberDialog orgId={effectiveOrgId} onDone={reload} />}
      </header>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {loading ? <p className="text-sm text-muted-foreground">Chargement…</p>
        : (
          <MembersTable
            members={members}
            currentUserId={userId}
            onManagePermissions={(m) => setManagingId(m.membershipId)}
            onDeactivate={handleDeactivate}
          >
            {(m, isSelf) => ({
              business: (
                <RoleSelect
                  value={m.businessRoleCode}
                  options={bizRoles}
                  callerRank={callerRank}
                  disabled={isSelf}
                  onChange={(c) => { if (c) void changeBusinessRole(m, c); }}
                />
              ),
              admin: (
                <RoleSelect
                  value={m.adminRoleCode}
                  options={adminRoles}
                  callerRank={callerRank}
                  includeNone
                  disabled={isSelf}
                  onChange={(c) => void changeAdminRole(m, c)}
                />
              ),
            })}
          </MembersTable>
        )}
      <MemberPermissionsDrawer
        member={managing}
        orgId={effectiveOrgId ?? ''}
        catalog={catalog}
        orgPermissions={orgPerms}
        canManageOrgDefaults={canManageOrgDefaults}
        onClose={() => setManagingId(null)}
        onChanged={reload}
      />
    </section>
  );
}
