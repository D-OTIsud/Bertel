'use client';
import { ShieldCheck } from 'lucide-react';
import type { OrgMember } from '@/services/rbac';
import { resolveRoleLabel } from '@/utils/labels';
import { formatLastSeen } from './format-last-seen';

/** Shape returned by the `children` render-prop — controls both role cells. */
export interface RoleCells { business: React.ReactNode; admin: React.ReactNode; }

export function MembersTable({ members, currentUserId, onManagePermissions, onEditProfile, onDeactivate, onDelete, children }: {
  members: OrgMember[];
  currentUserId: string | null;
  onManagePermissions: (m: OrgMember) => void;
  /** Called when the admin clicks "Modifier" (identity modal) on a non-self row. */
  onEditProfile?: (m: OrgMember) => void;
  /** Called when the admin clicks "Désactiver" on a non-self row. */
  onDeactivate?: (m: OrgMember) => void;
  /** Called when the admin clicks "Supprimer" (hard delete) on a non-self row. */
  onDelete?: (m: OrgMember) => void;
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
          <th scope="col">Dernière activité</th>
          <th scope="col" className="data-table__actions"></th>
        </tr>
      </thead>
      <tbody>
        {members.map((m) => {
          const isSelf = m.userId === currentUserId;
          const cells = children ? children(m, isSelf) : null;
          // D1 (2026-08-28) — le compteur ignorait l'héritage d'ORG : un membre pouvait afficher
          // « 0 permission » tout en en ayant. On compte l'UNION (un droit à la fois hérité et
          // accordé individuellement ne compte qu'une fois).
          const effectiveCodes = new Set([...m.permissionCodes, ...m.inheritedPermissionCodes]);
          const count = effectiveCodes.size;
          const inheritedCount = m.inheritedPermissionCodes.length;
          const lastSeen = formatLastSeen(m.lastSeenAt);
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
                {/* D4 (2026-08-28) — l'écran ne montrait pas l'accès qui compte le plus. Un rôle
                    d'administration d'ORG ouvre TOUTE l'écriture CRM et le statut superuser ouvre
                    tout, indépendamment des permissions : en production, les 6 Éditeurs tiennent
                    leurs droits CRM de leur rôle, pas de leurs cases à cocher. Le compteur pouvait
                    donc afficher un chiffre rassurant à côté d'un accès total. */}
                <div className="members-table__access">
                  {m.isPlatformSuperuser && (
                    <span
                      className="badge badge--warn badge--xs"
                      title="Superuser plateforme : accès total, indépendamment des permissions et du rôle d’ORG"
                    >
                      superuser
                    </span>
                  )}
                  {m.adminRoleCode && (
                    <span
                      className="badge badge--info badge--xs"
                      title="Un rôle d’administration d’ORG ouvre notamment toute l’écriture CRM, sans passer par les permissions"
                    >
                      + rôle admin
                    </span>
                  )}
                  {inheritedCount > 0 && (
                    <span
                      className="badge badge--xs"
                      title="Droits accordés à toute l’organisation — ils ne se retirent pas depuis cette fiche"
                    >
                      dont {inheritedCount} héritée{inheritedCount > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </td>
              <td>
                {lastSeen ? (
                  <>
                    <div className="members-table__seen">{lastSeen.absolute}</div>
                    <div className="members-table__mail">{lastSeen.relative}</div>
                  </>
                ) : (
                  <span className="muted" title="Ce compte ne s'est jamais connecté">Jamais</span>
                )}
              </td>
              <td className="data-table__actions">
                {!isSelf && onEditProfile && (
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => onEditProfile(m)}
                    title="Modifier le profil de ce membre"
                  >
                    Modifier
                  </button>
                )}
                {!isSelf && onDeactivate && (
                  <button type="button" className="ghost-button members-deactivate" onClick={() => onDeactivate(m)}>
                    Désactiver
                  </button>
                )}
                {!isSelf && onDelete && (
                  <button
                    type="button"
                    className="ghost-button members-delete"
                    onClick={() => onDelete(m)}
                    title="Supprimer définitivement le compte"
                  >
                    Supprimer
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
