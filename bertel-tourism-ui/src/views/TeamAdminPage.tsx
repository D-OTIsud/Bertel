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
  deleteUserAccount,
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
import { ConfirmDialog } from '@/components/common/ConfirmDialog';

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
  // Membre en attente de confirmation de désactivation (null = aucune ; remplace window.confirm).
  const [confirmDeactivate, setConfirmDeactivate] = useState<OrgMember | null>(null);
  const [deactivateBusy, setDeactivateBusy] = useState(false);
  // Membre en attente de confirmation de suppression DÉFINITIVE (compte auth + cascade).
  const [confirmDelete, setConfirmDelete] = useState<OrgMember | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

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

  async function doDelete(m: OrgMember) {
    setDeleteBusy(true);
    try {
      await deleteUserAccount(m.userId);
      toast.success('Compte supprimé définitivement.');
      setConfirmDelete(null);
    } catch (e) {
      toast.error(friendlyRbacError(e as { message?: string }));
    } finally {
      setDeleteBusy(false);
    }
    await reload();
  }

  async function doDeactivate(m: OrgMember) {
    setDeactivateBusy(true);
    try {
      await deactivateMembership(m.membershipId);
      toast.success('Membre désactivé.');
      setConfirmDeactivate(null);
    } catch (e) {
      toast.error(friendlyRbacError(e as { message?: string }));
    } finally {
      setDeactivateBusy(false);
    }
    await reload();
  }

  if (!allowed) {
    return (
      <section className="settings-pane">
        <div className="notice notice--warn">Accès réservé aux administrateurs d’organisation.</div>
      </section>
    );
  }
  return (
    <section className="settings-pane">
      <div className="settings-pane__head">
        <div>
          <h2>Équipe</h2>
          <p>Membres de votre organisation, rôles et permissions.</p>
        </div>
        <div className="settings-pane__actions">
          {canManageOrgDefaults ? (
            effectiveOrgId && <InviteMemberDialog orgId={effectiveOrgId} onDone={reload} />
          ) : (
            <>
              <span className="badge badge--info badge--xs" title="Inviter un membre nécessite le rang ≥ 30">rang ≥ 30</span>
              <button type="button" className="primary-button" disabled title="Réservé aux administrateurs de rang ≥ 30">
                Inviter
              </button>
            </>
          )}
        </div>
      </div>

      {error && <div className="inline-alert inline-alert--danger" role="alert">{error}</div>}
      {loading ? <p className="muted">Chargement…</p>
        : (
          <MembersTable
            members={members}
            currentUserId={userId}
            onManagePermissions={(m) => setManagingId(m.membershipId)}
            onDeactivate={(m) => setConfirmDeactivate(m)}
            onDelete={canManageOrgDefaults ? (m) => setConfirmDelete(m) : undefined}
          >
            {(m, isSelf) => ({
              business: (
                <RoleSelect
                  value={m.businessRoleCode}
                  options={bizRoles}
                  callerRank={callerRank}
                  disabled={isSelf}
                  label={`Rôle métier de ${m.displayName ?? m.email ?? 'ce membre'}`}
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
                  label={`Rôle admin de ${m.displayName ?? m.email ?? 'ce membre'}`}
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

      <ConfirmDialog
        open={Boolean(confirmDeactivate)}
        tone="danger"
        title="Désactiver ce membre ?"
        confirmLabel="Désactiver"
        busy={deactivateBusy}
        message={
          confirmDeactivate
            ? `${confirmDeactivate.displayName ?? confirmDeactivate.email ?? 'Ce membre'} perdra l’accès à l’organisation. Son compte peut être réactivé ultérieurement.`
            : ''
        }
        onCancel={() => setConfirmDeactivate(null)}
        onConfirm={() => confirmDeactivate && void doDeactivate(confirmDeactivate)}
      />

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        tone="danger"
        title="Supprimer définitivement ce compte ?"
        confirmLabel="Supprimer définitivement"
        busy={deleteBusy}
        message={
          confirmDelete
            ? `Le compte de ${confirmDelete.displayName ?? confirmDelete.email ?? 'ce membre'} sera supprimé définitivement : accès, profil, rattachement à l’organisation et permissions. Cette action est irréversible — pour un retrait temporaire, utilisez « Désactiver ».`
            : ''
        }
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && void doDelete(confirmDelete)}
      />
    </section>
  );
}
