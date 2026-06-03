'use client';
import type { OrgMember } from '@/services/rbac';

export function MembersTable({ members, currentUserId, onManagePermissions, children }: {
  members: OrgMember[];
  currentUserId: string | null;
  onManagePermissions: (m: OrgMember) => void;
  children?: (m: OrgMember, isSelf: boolean) => React.ReactNode;
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
          return (
            <tr key={m.membershipId} className="border-t border-border">
              <td className="py-2">
                <div className="font-medium">{m.displayName ?? '—'}</div>
                <div className="text-xs text-muted-foreground">{m.email ?? m.userId}</div>
              </td>
              <td>{children ? children(m, isSelf) : m.businessRoleCode}</td>
              <td>{m.adminRoleCode ?? '—'}</td>
              <td>
                <button className="underline" onClick={() => onManagePermissions(m)} disabled={isSelf}
                  title={isSelf ? "Vous ne pouvez pas modifier vos propres permissions" : undefined}>
                  {m.permissionCodes.length} permission(s)
                </button>
              </td>
              <td>{/* deactivate action wired in Task 8 */}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
