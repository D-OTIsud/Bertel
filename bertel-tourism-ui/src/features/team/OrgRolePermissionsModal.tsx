'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Modal } from '@/components/common/Modal';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { setRolePermission, friendlyRbacError, type RefPermission, type RefRole } from '@/services/rbac';
import { businessRoleLabel } from '@/features/team/permission-presets';
import { groupByCategory } from '@/features/team/MemberPermissionsDrawer';
import { impactOfToggle, type MemberRef, type RoleMatrix } from '@/features/team/role-permission-matrix';

interface OrgRolePermissionsModalProps {
  open: boolean;
  orgId: string;
  catalog: RefPermission[];
  roles: RefRole[];
  matrix: RoleMatrix;
  /** Membres actifs de l'ORG — sert à NOMMER qui bascule avant d'écrire. */
  members: MemberRef[];
  onClose: () => void;
  onChanged: () => void;
}

interface PendingToggle {
  roleCode: string;
  permCode: string;
  permName: string;
  granted: boolean;
  affected: MemberRef[];
  retainedByException: MemberRef[];
}

function nameList(members: readonly MemberRef[]): string {
  return members.map((m) => m.displayName).join(', ');
}

/**
 * §227 — l'écran de réglage « permission × rôle métier », propre à une ORG.
 *
 * Il remplace le bloc « Permissions par défaut de l'organisation » qui vivait dans le tiroir
 * d'un membre nommé et accordait, en un clic sans confirmation, à toute l'équipe.
 *
 * Deux garde-fous portent la correction :
 *   1. l'écran est SÉPARÉ de la fiche d'un membre — la portée est lisible dans le titre ;
 *   2. toute bascule passe par une confirmation qui NOMME les membres dont l'accès change.
 */
export function OrgRolePermissionsModal({
  open, orgId, catalog, roles, matrix, members, onClose, onChanged,
}: OrgRolePermissionsModalProps) {
  const [pending, setPending] = useState<PendingToggle | null>(null);
  const [busy, setBusy] = useState(false);
  const groups = groupByCategory(catalog);

  function requestToggle(roleCode: string, perm: RefPermission, granted: boolean) {
    const { affected, retainedByException } = impactOfToggle(matrix, roleCode, perm.code, granted, members);
    setPending({
      roleCode, permCode: perm.code, permName: perm.name, granted, affected, retainedByException,
    });
  }

  async function confirmToggle() {
    if (!pending) return;
    setBusy(true);
    try {
      await setRolePermission(orgId, pending.roleCode, pending.permCode, pending.granted);
      setPending(null);
      onChanged();
    } catch (e) {
      toast.error(friendlyRbacError(e as { message?: string }));
    } finally {
      setBusy(false);
    }
  }

  const roleCount = (code: string) => members.filter((m) => m.businessRoleCode === code).length;

  return (
    <>
      <Modal title="Permissions par rôle métier" open={open} onOpenChange={(n) => { if (!n) onClose(); }}>
        <p className="perm-drawer__sub">
          Un membre reçoit les droits de son rôle. Changer son rôle change son accès immédiatement.
        </p>

        <table className="data-table role-matrix">
          <thead>
            <tr>
              <th scope="col">Permission</th>
              {roles.map((r) => (
                <th key={r.code} scope="col">
                  {businessRoleLabel(r.code)}
                  <span className="role-matrix__count">
                    {roleCount(r.code)} membre{roleCount(r.code) > 1 ? 's' : ''}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map(({ category, label, perms }) => (
              <>
                <tr key={`head-${category}`} className="role-matrix__group">
                  <th scope="colgroup" colSpan={roles.length + 1}>{label}</th>
                </tr>
                {perms.map((p) => (
                  <tr key={p.code}>
                    <td>{p.name}</td>
                    {roles.map((r) => {
                      const checked = (matrix[r.code] ?? []).includes(p.code);
                      return (
                        <td key={r.code} className="role-matrix__cell">
                          <input
                            type="checkbox"
                            className="perm-check"
                            checked={checked}
                            // Nom accessible complet : la même permission apparaît sur trois
                            // colonnes, « Publier une fiche » seul ne désignerait aucune case.
                            aria-label={`${p.name} — ${businessRoleLabel(r.code)}`}
                            onChange={() => requestToggle(r.code, p, !checked)}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </>
            ))}
          </tbody>
        </table>
      </Modal>

      <ConfirmDialog
        open={Boolean(pending)}
        tone={pending?.granted ? 'danger' : 'default'}
        title={
          pending?.granted
            ? `Accorder « ${pending?.permName} » aux ${businessRoleLabel(pending?.roleCode)}s ?`
            : `Retirer « ${pending?.permName} » aux ${businessRoleLabel(pending?.roleCode)}s ?`
        }
        confirmLabel={pending?.granted ? 'Accorder' : 'Retirer'}
        busy={busy}
        message={
          pending && (
            <>
              {pending.affected.length === 0 ? (
                <p>Aucun membre ne porte ce rôle aujourd’hui — le réglage s’appliquera aux futurs membres.</p>
              ) : (
                <p>
                  {pending.granted ? 'Gagnent' : 'Perdent'} ce droit immédiatement —{' '}
                  <strong>{pending.affected.length} membre{pending.affected.length > 1 ? 's' : ''}</strong> :{' '}
                  {nameList(pending.affected)}.
                </p>
              )}
              {pending.retainedByException.length > 0 && (
                <p className="inline-alert inline-alert--warn">
                  {nameList(pending.retainedByException)} garde
                  {pending.retainedByException.length > 1 ? 'nt' : ''} ce droit : il leur est accordé
                  en exception individuelle. Retirez-le depuis leur fiche pour le fermer vraiment.
                </p>
              )}
            </>
          )
        }
        onCancel={() => setPending(null)}
        onConfirm={() => void confirmToggle()}
      />
    </>
  );
}
