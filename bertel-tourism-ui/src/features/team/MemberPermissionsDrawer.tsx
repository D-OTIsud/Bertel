'use client';

import { toast } from 'sonner';
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
import { presetPermissionsFor } from '@/features/team/permission-presets';

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

// Human-readable category labels (categories: content / crm / team / media).
const CATEGORY_LABELS: Record<string, string> = {
  content: 'Contenu',
  crm: 'CRM',
  team: 'Équipe',
  media: 'Médias',
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
  // Guard: nothing to render when no member is selected (the Modal mounts only when open).
  if (!member) {
    return null;
  }

  const groups = groupByCategory(catalog);
  const displayName = member.displayName ?? member.email ?? member.userId;

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
    <Modal variant="drawer" title={displayName} onClose={onClose}>
        <p className="text-sm text-muted-foreground">
          Permissions individuelles de ce membre.
          {member.businessRoleCode ? ` Rôle métier : ${member.businessRoleCode}.` : ''}
        </p>

        {/* Preset button */}
        <div className="mb-6">
          <button
            type="button"
            className="ghost-button"
            disabled={!member.businessRoleCode}
            onClick={() => void applyPreset()}
            title={!member.businessRoleCode ? 'Aucun rôle métier défini pour ce membre' : undefined}
          >
            Appliquer le préréglage {member.businessRoleCode ?? '(aucun rôle)'}
          </button>
          <p className="text-xs text-muted-foreground mt-1">
            Accorde les permissions standard pour ce rôle (additif — ne révoque rien).
          </p>
        </div>

        {/* Per-user permission toggles grouped by category */}
        <div className="space-y-5">
          {groups.map(({ category, label, perms }) => (
            <section key={category}>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                {label}
              </h3>
              <ul className="space-y-2">
                {perms.map((p) => {
                  const userHas = member.permissionCodes.includes(p.code);
                  const orgHas = orgPermissions.includes(p.code);
                  return (
                    <li key={p.code} className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        id={`perm-user-${p.code}`}
                        checked={userHas}
                        onChange={() => void toggleUserPermission(p.code, userHas)}
                        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-primary"
                      />
                      <label htmlFor={`perm-user-${p.code}`} className="cursor-pointer text-sm leading-snug">
                        {p.name}
                        {orgHas && (
                          <span className="ml-2 text-xs text-muted-foreground font-normal">
                            héritée de l&apos;ORG
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

        {/* Org-default permissions section — only for admins with sufficient rank */}
        {canManageOrgDefaults && (
          <div className="mt-8 pt-6 border-t border-border">
            <h2 className="text-sm font-semibold mb-1">Permissions par défaut de l&apos;organisation</h2>
            <p className="text-xs text-muted-foreground mb-4">
              Ces permissions sont héritées par tous les membres de l&apos;ORG.
            </p>
            <div className="space-y-5">
              {groups.map(({ category, label, perms }) => (
                <section key={`org-${category}`}>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    {label}
                  </h3>
                  <ul className="space-y-2">
                    {perms.map((p) => {
                      const orgHas = orgPermissions.includes(p.code);
                      return (
                        <li key={p.code} className="flex items-start gap-2">
                          <input
                            type="checkbox"
                            id={`perm-org-${p.code}`}
                            checked={orgHas}
                            onChange={() => void toggleOrgPermission(p.code, orgHas)}
                            className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-primary"
                          />
                          <label htmlFor={`perm-org-${p.code}`} className="cursor-pointer text-sm leading-snug">
                            {p.name}
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
