'use client';
import { ShieldCheck } from 'lucide-react';
import type { OrgMember } from '@/services/rbac';
import { resolveRoleLabel } from '@/utils/labels';

/** Shape returned by the `children` render-prop — controls both role cells. */
export interface RoleCells { business: React.ReactNode; admin: React.ReactNode; }

export function MembersTable({ members, currentUserId, onManagePermissions, onDeactivate, children }: {
  members: OrgMember[];
  currentUserId: string | null;
  onManagePermissions: (m: OrgMember) => void;
  /** Called when the admin clicks "Désactiver" on a non-self row. */
  onDeactivate?: (m: OrgMember) => void;
  /** When provided, renders interactive role selects in the Rôle métier + Rôle admin cells. */
  children?: (m: OrgMember, isSelf: boolean) => RoleCells;
}) {
  if (members.length === 0) return <p className="muted">Aucun membre actif.</p>;
  return (
    <table className="data-table members-table">
      <thead>
        <tr>
          <th scope="col">Membre</th>
          <th scope="col">Rôle métier</th>
          <th scope="col">Rôle admin</th>
          <th scope="col">Permissions</th>
          <th scope="col" className="data-table__actions"></th>
        </tr>
      </thead>
      <tbody>
        {members.map((m) => {
          const isSelf = m.userId === currentUserId;
          const cells = children ? children(m, isSelf) : null;
          const count = m.permissionCodes.length;
          return (
            <tr key={m.membershipId}>
              <td>
                <div className="members-table__name">
                  <span>{m.displayName ?? '—'}</span>
                  {isSelf && <span className="badge badge--info badge--xs">vous-même</span>}
                </div>
                <div className="members-table__mail">{m.email ?? m.userId}</div>
              </td>
              <td>{cells ? cells.business : (m.businessRoleCode ? resolveRoleLabel(m.businessRoleCode) : '—')}</td>
              <td>{cells ? cells.admin : (m.adminRoleCode ? resolveRoleLabel(m.adminRoleCode) : '—')}</td>
              <td>
                {/* D10 : aria-disabled + raison reliée (un `disabled` natif rendait le motif
                    « vos propres permissions » injoignable au clavier et au lecteur d'écran). */}
                {isSelf && (
                  <span id={`perm-reason-${m.membershipId}`} className="sr-only">
                    Vous ne pouvez pas modifier vos propres permissions
                  </span>
                )}
                <button
                  type="button"
                  className={count > 0 ? 'ghost-button members-perm-btn' : 'ghost-button members-perm-btn is-muted'}
                  onClick={() => {
                    if (isSelf) return;
                    onManagePermissions(m);
                  }}
                  aria-disabled={isSelf || undefined}
                  aria-describedby={isSelf ? `perm-reason-${m.membershipId}` : undefined}
                  title={isSelf ? 'Vous ne pouvez pas modifier vos propres permissions' : undefined}
                >
                  <ShieldCheck size={13} aria-hidden /> {count} permission{count > 1 ? 's' : ''}
                </button>
              </td>
              <td className="data-table__actions">
                {!isSelf && onDeactivate && (
                  <button type="button" className="ghost-button members-deactivate" onClick={() => onDeactivate(m)}>
                    Désactiver
                  </button>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
