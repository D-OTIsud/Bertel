'use client';
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
  if (members.length === 0) return <p className="text-sm text-muted-foreground">Aucun membre actif.</p>;
  return (
    <table className="w-full text-sm">
      <thead><tr className="text-left text-muted-foreground">
        <th className="py-2">Membre</th><th>Rôle métier</th><th>Rôle admin</th><th>Permissions</th><th></th>
      </tr></thead>
      <tbody>
        {members.map((m) => {
          const isSelf = m.userId === currentUserId;
          const cells = children ? children(m, isSelf) : null;
          return (
            <tr key={m.membershipId} className="border-t border-border">
              <td className="py-2">
                <div className="font-medium">{m.displayName ?? '—'}</div>
                <div className="text-xs text-muted-foreground">{m.email ?? m.userId}</div>
              </td>
              <td>{cells ? cells.business : (m.businessRoleCode ? resolveRoleLabel(m.businessRoleCode) : '—')}</td>
              <td>{cells ? cells.admin : (m.adminRoleCode ? resolveRoleLabel(m.adminRoleCode) : '—')}</td>
              <td>
                <button className="underline" onClick={() => onManagePermissions(m)} disabled={isSelf}
                  title={isSelf ? "Vous ne pouvez pas modifier vos propres permissions" : undefined}>
                  {m.permissionCodes.length} permission(s)
                </button>
              </td>
              <td>
                {!isSelf && onDeactivate && (
                  <button
                    className="text-destructive text-xs underline"
                    onClick={() => onDeactivate(m)}
                  >
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
