'use client';

import { toast } from 'sonner';
import { Eye, ShieldCheck } from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import {
  grantUserPermission,
  revokeUserPermission,
  friendlyRbacError,
  type OrgMember,
  type RefPermission,
} from '@/services/rbac';
import { businessRoleLabel } from '@/features/team/permission-presets';
import type { RoleMatrix } from '@/features/team/role-permission-matrix';

interface MemberPermissionsDrawerProps {
  member: OrgMember | null;
  catalog: RefPermission[];
  /** Matrice rôle → permissions de l'ORG, pour dire ce que le rôle du membre lui confère. */
  roleMatrix: RoleMatrix;
  /** Ouvre l'écran de réglage des rôles ; absent si l'appelant n'a pas le rang requis. */
  onOpenRoleMatrix?: () => void;
  onClose: () => void;
  /** Re-charge le roster pour garder l'état en phase après mutation. */
  onChanged: () => void;
}

// Libellés humains des catégories de `ref_permission`. Le CHECK de `ref_permission.category`
// est la source — toute nouvelle catégorie doit atterrir ici, sinon le titre de groupe
// s'affiche en code brut (défaut D2 corrigé le 2026-08-28 pour `legal`).
export const CATEGORY_LABELS: Record<string, string> = {
  content: 'Contenu',
  crm: 'CRM',
  team: 'Équipe',
  media: 'Médias',
  legal: 'Juridique',
};

export function groupByCategory(
  permissions: RefPermission[],
): Array<{ category: string; label: string; perms: RefPermission[] }> {
  const map = new Map<string, RefPermission[]>();
  for (const p of permissions) {
    const list = map.get(p.category) ?? [];
    list.push(p);
    map.set(p.category, list);
  }
  return Array.from(map.entries()).map(([category, perms]) => ({
    category,
    label: CATEGORY_LABELS[category] ?? category,
    perms,
  }));
}

/**
 * §227 — ce tiroir ne parle QUE du membre nommé dans son titre.
 *
 * Il portait auparavant, sous les cases du membre, un bloc « Permissions par défaut de
 * l'organisation » aux cases visuellement identiques : un clic y accordait le droit à TOUTE
 * l'équipe, sans confirmation. C'est par là que les 12 permissions ont atterri sur les Lecteurs
 * le 2026-08-31. Un contrôle de portée ORG n'a rien à faire dans la fiche d'une personne — il
 * vit désormais dans son propre écran (`OrgRolePermissionsModal`).
 */
export function MemberPermissionsDrawer({
  member,
  catalog,
  roleMatrix,
  onOpenRoleMatrix,
  onClose,
  onChanged,
}: MemberPermissionsDrawerProps) {
  const groups = groupByCategory(catalog);
  // `member` peut être null pendant que la Modal s'anime en fermeture (open=false mais encore
  // montée) — toute lecture dépendant du membre reste gardée.
  const displayName = member?.displayName ?? member?.email ?? member?.userId ?? '';
  const roleLabel = businessRoleLabel(member?.businessRoleCode);
  const roleCodes = member?.businessRoleCode ? (roleMatrix[member.businessRoleCode] ?? []) : [];
  const roleNames = catalog.filter((p) => roleCodes.includes(p.code)).map((p) => p.name);

  async function toggleUserPermission(code: string, currentlyGranted: boolean) {
    if (!member) return;
    try {
      if (currentlyGranted) {
        await revokeUserPermission(member.userId, code);
      } else {
        await grantUserPermission(member.userId, code);
      }
      onChanged();
    } catch (e) {
      toast.error(friendlyRbacError(e as { message?: string }));
    }
  }

  return (
    <Modal
      variant="drawer"
      title={displayName}
      open={!!member}
      onOpenChange={(next) => { if (!next) onClose(); }}
    >
      {member && (
        <div className="perm-drawer">
          <p className="perm-drawer__sub">
            Rôle métier : <strong>{roleLabel}</strong>.
          </p>

          <section className="perm-drawer__role">
            <h3 className="perm-group__head">Droits du rôle {roleLabel}</h3>
            {roleNames.length === 0 ? (
              <p className="perm-drawer__role-empty">
                <Eye size={14} aria-hidden /> Lecture seule. Aucun droit d’écriture.
              </p>
            ) : (
              <ul className="perm-drawer__role-list">
                {roleNames.map((name) => (
                  <li key={name}>
                    <ShieldCheck size={13} aria-hidden /> {name}
                  </li>
                ))}
              </ul>
            )}
            <p className="pref__hint">
              Conférés par le rôle, identiques pour tous les membres qui le portent.{' '}
              {onOpenRoleMatrix ? (
                <button type="button" className="link-button" onClick={onOpenRoleMatrix}>
                  Régler les permissions par rôle
                </button>
              ) : (
                'Leur réglage est réservé aux administrateurs de rang ≥ 30.'
              )}
            </p>
          </section>

          <div className="perm-drawer__exceptions">
            <h2>Exceptions individuelles</h2>
            <p className="pref__hint">
              Droits accordés à cette personne seule, en plus de son rôle.
            </p>
          </div>

          <div className="perm-groups">
            {groups.map(({ category, label, perms }) => (
              <section key={category} className="perm-group">
                <h3 className="perm-group__head">{label}</h3>
                <ul className="perm-list">
                  {perms.map((p) => {
                    const userHas = member.permissionCodes.includes(p.code);
                    const fromRole = roleCodes.includes(p.code);
                    // Une case DÉCOCHÉE sous un droit déjà conféré par le rôle se lirait comme
                    // « ce droit manque » : un admin la cocherait « pour réparer » et créerait un
                    // doublon. L'état indéterminé dit la vérité — le droit est ACQUIS, mais pas
                    // par cette case, qui ne pilote que `user_permission`.
                    const roleOnly = fromRole && !userHas;
                    return (
                      <li key={p.code} className="perm-row">
                        <input
                          type="checkbox"
                          id={`perm-user-${p.code}`}
                          checked={userHas}
                          ref={(el) => {
                            if (el) el.indeterminate = roleOnly;
                          }}
                          aria-describedby={fromRole ? `perm-role-${p.code}` : undefined}
                          onChange={() => void toggleUserPermission(p.code, userHas)}
                          className="perm-check"
                        />
                        <label htmlFor={`perm-user-${p.code}`} className="perm-row__label">
                          {p.name}
                          {fromRole && (
                            <span id={`perm-role-${p.code}`} className="perm-inherit">
                              {roleOnly
                                ? `déjà acquise via le rôle ${roleLabel} — inutile de la cocher`
                                : `conférée par le rôle ${roleLabel} (l’exception fait doublon)`}
                            </span>
                          )}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}
