/**
 * Pure reducers for §17 organisation links (object_org_link). Persisted by
 * saveObjectWorkspaceRelationships (api.save_object_relations, org_links arm). Constraints mirrored:
 *  - exactly one primary per object: uq_object_primary_org;
 *  - the same org may hold several roles, but not the same role twice.
 *
 * Mirrors actor-links.ts (the §19 prestataire reducers); kept separate because the primary rule differs
 * (org = one primary per object; actor = one primary per (object, role)).
 */
import type {
  ObjectWorkspaceOrganizationLinkItem,
  ObjectWorkspaceOrgOption,
  WorkspaceReferenceOption,
} from '../../../services/object-workspace-parser';

/** Append a picked org, defaulting to the `publisher` role (or the first available). No-op when the
 *  org already holds that role, or when no role catalog is available (never fabricate a role). */
export function addOrgLink(
  links: ObjectWorkspaceOrganizationLinkItem[],
  picked: ObjectWorkspaceOrgOption,
  roleOptions: WorkspaceReferenceOption[],
): ObjectWorkspaceOrganizationLinkItem[] {
  const role = roleOptions.find((option) => option.code === 'publisher') ?? roleOptions[0];
  if (!role) {
    return links;
  }
  if (links.some((link) => link.id === picked.id && link.roleCode === role.code)) {
    return links;
  }
  return [
    ...links,
    {
      id: picked.id,
      source: 'org_link',
      type: 'ORG',
      name: picked.name,
      status: '',
      roleId: role.id,
      roleCode: role.code,
      roleLabel: role.label,
      isPrimary: links.length === 0,
      note: '',
      contacts: [],
    },
  ];
}

export function updateOrgLink(
  links: ObjectWorkspaceOrganizationLinkItem[],
  index: number,
  patch: Partial<ObjectWorkspaceOrganizationLinkItem>,
): ObjectWorkspaceOrganizationLinkItem[] {
  return links.map((link, position) => (position === index ? { ...link, ...patch } : link));
}

/** Rewrite an org link's role from the catalog (id/code/label stay consistent). */
export function setOrgRole(
  links: ObjectWorkspaceOrganizationLinkItem[],
  index: number,
  roleCode: string,
  roleOptions: WorkspaceReferenceOption[],
): ObjectWorkspaceOrganizationLinkItem[] {
  const role = roleOptions.find((option) => option.code === roleCode);
  return updateOrgLink(links, index, {
    roleCode,
    roleId: role?.id ?? '',
    roleLabel: role?.label ?? roleCode,
  });
}

/** Exactly one primary per object (uq_object_primary_org): set the index primary, clear all others. */
export function setPrimaryOrgLink(
  links: ObjectWorkspaceOrganizationLinkItem[],
  index: number,
): ObjectWorkspaceOrganizationLinkItem[] {
  return links.map((link, position) => ({ ...link, isPrimary: position === index }));
}

export function removeOrgLink(
  links: ObjectWorkspaceOrganizationLinkItem[],
  index: number,
): ObjectWorkspaceOrganizationLinkItem[] {
  return links.filter((_, position) => position !== index);
}
