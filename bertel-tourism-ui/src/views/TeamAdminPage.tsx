'use client';
import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { useSessionStore } from '@/store/session-store';
import { canAdministerTeam } from '@/store/session-selectors';
import {
  listOrgMembers,
  listBusinessRoles,
  listAdminRoles,
  setBusinessRole,
  setAdminRole,
  revokeAdminRole,
  deactivateMembership,
  friendlyRbacError,
  type OrgMember,
  type RefRole,
} from '@/services/rbac';
import { MembersTable } from '@/features/team/MembersTable';
import { RoleSelect } from '@/features/team/RoleSelect';

export default function TeamAdminPage() {
  const role = useSessionStore((s) => s.role);
  const adminRank = useSessionStore((s) => s.adminRank);
  const orgId = useSessionStore((s) => s.orgId);
  const userId = useSessionStore((s) => s.userId);
  const allowed = canAdministerTeam({ role, adminRank });

  const [members, setMembers] = useState<OrgMember[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [bizRoles, setBizRoles] = useState<RefRole[]>([]);
  const [adminRoles, setAdminRoles] = useState<RefRole[]>([]);

  const reload = useCallback(async () => {
    if (!orgId) { setLoading(false); return; }
    setLoading(true);
    try { setMembers(await listOrgMembers(orgId)); setError(null); }
    catch (e) { setError(e instanceof Error ? e.message : 'Erreur de chargement'); }
    finally { setLoading(false); }
  }, [orgId]);

  useEffect(() => { if (allowed) void reload(); }, [allowed, reload]);

  // Load role catalogs once when allowed.
  useEffect(() => {
    if (!allowed) return;
    listBusinessRoles().then(setBizRoles).catch(() => {});
    listAdminRoles().then(setAdminRoles).catch(() => {});
  }, [allowed]);

  // Caller's effective admin rank (superuser/owner → Infinity so all ranks are assignable).
  const callerRank = (role === 'owner' || role === 'super_admin') ? Infinity : (adminRank ?? 0);

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
        {/* InviteMemberDialog mounted in Task 9 */}
      </header>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {loading ? <p className="text-sm text-muted-foreground">Chargement…</p>
        : (
          <MembersTable
            members={members}
            currentUserId={userId}
            onManagePermissions={() => { /* Task 10 */ }}
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
    </section>
  );
}
