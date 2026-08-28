'use client';

import { toast } from 'sonner';
import { Wand2 } from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import {
  grantUserPermission,
  revokeUserPermission,
  grantOrgPermission,
  revokeOrgPermission,
  friendlyRbacError,
  type OrgMember,
  type RefPermission,
} from '@/services/rbac';
import { businessRoleLabel, presetPermissionsFor } from '@/features/team/permission-presets';

interface MemberPermissionsDrawerProps {
  member: OrgMember | null;
  orgId: string;
  catalog: RefPermission[];
  /** Permission codes granted org-wide (inherited by all members). */
  orgPermissions: string[];
  /** True when the caller can manage org-wide defaults (org_admin rank >= 30, owner, superuser). */
  canManageOrgDefaults: boolean;
  onClose: () => void;
  /** Re-load the roster + org permissions to keep state in sync after mutations. */
  onChanged: () => void;
}

// Libellés humains des catégories de `ref_permission`.
// `legal` a été ajoutée par `migration_unblock_team_legal_access.sql` (§193) sans être traduite
// ici : le titre de groupe s'affichait en code brut « legal » (D2, corrigé le 2026-08-28).
// Le CHECK de `ref_permission.category` est la source — toute nouvelle catégorie doit atterrir ici.
const CATEGORY_LABELS: Record<string, string> = {
  content: 'Contenu',
  crm: 'CRM',
  team: 'Équipe',
  media: 'Médias',
  legal: 'Juridique',
};

function groupByCategory(permissions: RefPermission[]): Array<{ category: string; label: string; perms: RefPermission[] }> {
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

export function MemberPermissionsDrawer({
  member,
  orgId,
  catalog,
  orgPermissions,
  canManageOrgDefaults,
  onClose,
  onChanged,
}: MemberPermissionsDrawerProps) {
  const groups = groupByCategory(catalog);
  // `member` can be null while the Modal is still mounted and animating out (open=false but
  // usePresence keeps it rendered) — every member-dependent read below stays guarded.
  const displayName = member?.displayName ?? member?.email ?? member?.userId ?? '';
  const roleLabel = businessRoleLabel(member?.businessRoleCode);

  async function applyPreset() {
    if (!member) return;
    const codes = presetPermissionsFor(member.businessRoleCode ?? '');
    await Promise.all(
      codes.map(async (code) => {
        try {
          await grantUserPermission(member.userId, code);
        } catch (e) {
          console.warn('preset grant failed for', code, e);
        }
      }),
    );
    toast.success('Préréglage appliqué.');
    onChanged();
  }

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

  async function toggleOrgPermission(code: string, currentlyGranted: boolean) {
    try {
      if (currentlyGranted) {
        await revokeOrgPermission(orgId, code);
      } else {
        await grantOrgPermission(orgId, code);
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
            Permissions individuelles de ce membre. Rôle métier : <strong>{roleLabel}</strong>.
          </p>

          <div className="perm-drawer__preset">
            <button
              type="button"
              className="ghost-button"
              disabled={!member.businessRoleCode}
              onClick={() => void applyPreset()}
              title={!member.businessRoleCode ? 'Aucun rôle métier défini pour ce membre' : undefined}
            >
              <Wand2 size={14} aria-hidden /> Appliquer le préréglage {roleLabel}
            </button>
            <p className="pref__hint">Accorde les permissions standard pour ce rôle (additif — ne révoque rien).</p>
          </div>

          <div className="perm-groups">
            {groups.map(({ category, label, perms }) => (
              <section key={category} className="perm-group">
                <h3 className="perm-group__head">{label}</h3>
                <ul className="perm-list">
                  {perms.map((p) => {
                    const userHas = member.permissionCodes.includes(p.code);
                    const orgHas = orgPermissions.includes(p.code);
                    // D1 (2026-08-28) — une case DÉCOCHÉE sous un badge « héritée de l'ORG » se
                    // lisait comme « ce droit manque » : un admin la cochait « pour réparer » et
                    // créait un DOUBLON (un droit individuel redondant que plus rien ne
                    // distinguera de l'héritage). L'état indéterminé dit la vérité : le droit
                    // est ACQUIS, mais pas par cette case — qui, elle, ne pilote que
                    // `user_permission` et ne peut pas retirer l'héritage.
                    const inheritedOnly = orgHas && !userHas;
                    return (
                      <li key={p.code} className="perm-row">
                        <input
                          type="checkbox"
                          id={`perm-user-${p.code}`}
                          checked={userHas}
                          ref={(el) => {
                            if (el) el.indeterminate = inheritedOnly;
                          }}
                          aria-describedby={orgHas ? `perm-inherit-${p.code}` : undefined}
                          onChange={() => void toggleUserPermission(p.code, userHas)}
                          className="perm-check"
                        />
                        <label htmlFor={`perm-user-${p.code}`} className="perm-row__label">
                          {p.name}
                          {orgHas && (
                            <span id={`perm-inherit-${p.code}`} className="perm-inherit">
                              {inheritedOnly
                                ? 'déjà acquise via l’ORG — inutile de la cocher'
                                : 'héritée de l’ORG (l’octroi individuel fait doublon)'}
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

          {canManageOrgDefaults && (
            <div className="perm-drawer__org">
              <div className="perm-drawer__org-head">
                <h2>Permissions par défaut de l’organisation</h2>
                <span className="badge badge--info badge--xs" title="Réservé aux administrateurs de rang ≥ 30">rang ≥ 30</span>
              </div>
              <p className="pref__hint">Ces permissions sont héritées par tous les membres de l’ORG.</p>
              <div className="perm-groups">
                {groups.map(({ category, label, perms }) => (
                  <section key={`org-${category}`} className="perm-group">
                    <h3 className="perm-group__head">{label}</h3>
                    <ul className="perm-list">
                      {perms.map((p) => {
                        const orgHas = orgPermissions.includes(p.code);
                        return (
                          <li key={p.code} className="perm-row">
                            <input
                              type="checkbox"
                              id={`perm-org-${p.code}`}
                              checked={orgHas}
                              onChange={() => void toggleOrgPermission(p.code, orgHas)}
                              className="perm-check"
                            />
                            <label htmlFor={`perm-org-${p.code}`} className="perm-row__label">{p.name}</label>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
