/**
 * Pure helpers for editing the actor_object_role links (§19 "Suivi prestataire" cards).
 *
 * These were previously inlined in §17 (SectionAttachments); they now live in §19, the single home
 * for prestataires attached to the object. The links are persisted by `saveObjectWorkspaceRelationships`
 * (api.save_object_relations, actors arm — delete-all + re-insert). Constraints mirrored here:
 *  - one primary per (object, role): uq_actor_object_role_primary;
 *  - PK (actor_id, object_id, role_id): the same actor may hold several roles, but not the same role twice.
 */

import type { ObjectWorkspaceActorLinkItem, WorkspaceReferenceOption } from '../../../services/object-workspace-parser';
import type { ActorSearchResult } from '../../../services/object-workspace';

/** actor_object_role.visibility vocabulary — shared by the §19 cards (read-only badge) and edit modal. */
export const ACTOR_VISIBILITY_OPTIONS = [
  { v: 'public', l: 'Public' },
  { v: 'private', l: 'Interne' },
  { v: 'partners', l: 'Partenaires' },
] as const;

export function actorVisibilityLabel(value: string): string {
  return ACTOR_VISIBILITY_OPTIONS.find((option) => option.v === value)?.l ?? value;
}

/**
 * Append a picked actor as a new link, defaulting to the `operator` role (or the first available).
 * Primary only when that role has no primary yet. No-op when the actor already holds that role
 * (would collide with the PK on re-insert) or when no role catalog is available (never fabricate a role).
 */
export function addActorLink(
  actors: ObjectWorkspaceActorLinkItem[],
  picked: ActorSearchResult,
  roleOptions: WorkspaceReferenceOption[],
): ObjectWorkspaceActorLinkItem[] {
  const role = roleOptions.find((option) => option.code === 'operator') ?? roleOptions[0];
  if (!role) {
    return actors;
  }
  if (actors.some((actor) => actor.id === picked.id && actor.roleCode === role.code)) {
    return actors;
  }
  return [
    ...actors,
    {
      id: picked.id,
      displayName: picked.displayName,
      firstName: picked.firstName,
      lastName: picked.lastName,
      gender: '',
      roleId: role.id,
      roleCode: role.code,
      roleLabel: role.label,
      visibility: 'public',
      isPrimary: !actors.some((actor) => actor.roleCode === role.code && actor.isPrimary),
      validFrom: '',
      validTo: '',
      note: '',
      contacts: [],
    },
  ];
}

export function updateActorLink(
  actors: ObjectWorkspaceActorLinkItem[],
  index: number,
  patch: Partial<ObjectWorkspaceActorLinkItem>,
): ObjectWorkspaceActorLinkItem[] {
  return actors.map((actor, position) => (position === index ? { ...actor, ...patch } : actor));
}

/** Rewrite an actor link's role from the catalog (id/code/label stay consistent). */
export function setActorRole(
  actors: ObjectWorkspaceActorLinkItem[],
  index: number,
  roleCode: string,
  roleOptions: WorkspaceReferenceOption[],
): ObjectWorkspaceActorLinkItem[] {
  const role = roleOptions.find((option) => option.code === roleCode);
  return updateActorLink(actors, index, {
    roleCode,
    roleId: role?.id ?? '',
    roleLabel: role?.label ?? roleCode,
  });
}

/** ≤1 primary per (object, role): set the index as primary and clear ONLY same-role siblings. */
export function setPrimaryActorLink(
  actors: ObjectWorkspaceActorLinkItem[],
  index: number,
): ObjectWorkspaceActorLinkItem[] {
  const role = actors[index]?.roleCode;
  return actors.map((actor, position) =>
    actor.roleCode === role ? { ...actor, isPrimary: position === index } : actor,
  );
}

/**
 * Replace the link at `index` with an edited version (from ProviderEditModal) and re-enforce
 * ≤1 primary per (object, role): if the edited link is primary, clear the flag on same-role
 * siblings. Role may have changed in the edit, so reconciliation uses the edited role.
 */
export function commitActorEdit(
  actors: ObjectWorkspaceActorLinkItem[],
  index: number,
  patched: ObjectWorkspaceActorLinkItem,
): ObjectWorkspaceActorLinkItem[] {
  return actors.map((actor, position) => {
    if (position === index) {
      return patched;
    }
    if (patched.isPrimary && actor.roleCode === patched.roleCode) {
      return { ...actor, isPrimary: false };
    }
    return actor;
  });
}

export function removeActorLink(
  actors: ObjectWorkspaceActorLinkItem[],
  index: number,
): ObjectWorkspaceActorLinkItem[] {
  return actors.filter((_, position) => position !== index);
}
