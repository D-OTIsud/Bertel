import { type ObjectWorkspaceRelationshipsModule } from '../object-workspace-parser';

/**
 * Pure builder for the api.save_object_relations payload. Maps the editor's OUTGOING related-object
 * rows (direction !== 'in') to the RPC shape; INCOMING relations are owned by other objects and are
 * never written from here. The relation record id isn't tracked in the UI, so it's omitted and the
 * RPC regenerates it (it deletes every relation whose source is this object, then re-inserts the payload).
 */
export function buildRelationsPayload(
  input: ObjectWorkspaceRelationshipsModule,
): Array<{ target_object_id: string; relation_type_code: string; distance_m: string; note: string; position: number }> {
  return input.relatedObjects
    .filter((item) => item.direction !== 'in')
    .map((item, index) => ({
      target_object_id: item.id,
      relation_type_code: item.relationTypeCode,
      distance_m: item.distanceM,
      note: item.note,
      position: index,
    }));
}



/**
 * Pure builder for the org_links arm of api.save_object_relations. Returns null when the
 * org links could not be loaded reliably — the caller must then OMIT the key entirely so the
 * RPC's delete-all + re-insert branch never runs blind (anti-clobber, §28/§40 pattern).
 * `role_id` is sent alongside `role_code` (the RPC resolves role_id first, role_code as
 * fallback — airtight role resolution). The RPC raises on >1 primary, so only the first
 * primary survives here; when a dropped duplicate (same org, role) carried the primary flag,
 * the KEPT row is promoted instead so the flag is never silently lost.
 */
export function buildOrgLinksPayload(
  input: ObjectWorkspaceRelationshipsModule,
): Array<{ org_object_id: string; role_id: string; role_code: string; is_primary: boolean; note: string }> | null {
  if (input.organizationLinkWriteUnavailableReason) {
    return null;
  }
  let primarySeen = false;
  const kept = new Map<string, { org_object_id: string; role_id: string; role_code: string; is_primary: boolean; note: string }>();
  for (const item of input.organizationLinks) {
    if (!item.id || !item.roleCode) continue;
    const key = `${item.id}:${item.roleCode.toLowerCase()}`;
    const existing = kept.get(key);
    if (existing) {
      // Duplicate (org, role) pair: the row is dropped, but its primary flag must not be.
      if (item.isPrimary && !primarySeen) {
        existing.is_primary = true;
        primarySeen = true;
      }
      continue;
    }
    const isPrimary = item.isPrimary && !primarySeen;
    if (isPrimary) primarySeen = true;
    kept.set(key, {
      org_object_id: item.id,
      role_id: item.roleId,
      role_code: item.roleCode,
      is_primary: isPrimary,
      note: item.note,
    });
  }
  return Array.from(kept.values());
}



/**
 * §48 — pure builder for the actors arm of api.save_object_relations (actor_object_role).
 * Mirrors buildOrgLinksPayload: returns null when the actor links could not be loaded
 * reliably — the caller must then OMIT the key entirely so the RPC's delete-all + re-insert
 * branch never runs blind (anti-clobber). `role_id` is sent alongside `role_code` (the RPC
 * resolves role_id first, role_code as fallback). The DB enforces ≤1 primary PER (object, role)
 * (uq_actor_object_role_primary), so first-primary-wins is tracked per role here; when a
 * dropped duplicate (same actor, role) carried the primary flag, the KEPT row is promoted.
 */
export function buildActorLinksPayload(
  input: ObjectWorkspaceRelationshipsModule,
): Array<{ actor_id: string; role_id: string; role_code: string; is_primary: boolean; visibility: string; valid_from: string; valid_to: string; note: string }> | null {
  if (input.actorWriteUnavailableReason) {
    return null;
  }
  const primaryByRole = new Set<string>();
  const kept = new Map<string, { actor_id: string; role_id: string; role_code: string; is_primary: boolean; visibility: string; valid_from: string; valid_to: string; note: string }>();
  for (const item of input.actors) {
    if (!item.id || !item.roleCode) continue;
    const roleKey = item.roleCode.toLowerCase();
    const key = `${item.id}:${roleKey}`;
    const existing = kept.get(key);
    if (existing) {
      // Duplicate (actor, role) pair: the row is dropped, but its primary flag must not be.
      if (item.isPrimary && !primaryByRole.has(roleKey)) {
        existing.is_primary = true;
        primaryByRole.add(roleKey);
      }
      continue;
    }
    const isPrimary = item.isPrimary && !primaryByRole.has(roleKey);
    if (isPrimary) primaryByRole.add(roleKey);
    kept.set(key, {
      actor_id: item.id,
      role_id: item.roleId,
      role_code: item.roleCode,
      is_primary: isPrimary,
      visibility: item.visibility || 'public',
      valid_from: item.validFrom,
      valid_to: item.validTo,
      note: item.note,
    });
  }
  return Array.from(kept.values());
}



/** §48 — pure assembly of the api.save_object_relations payload. org_links / actors are
 *  each OMITTED (not sent) when their builder returns null (unreliable load — anti-clobber). */
export function buildRelationshipsRpcPayload(input: ObjectWorkspaceRelationshipsModule): Record<string, unknown> {
  const payload: Record<string, unknown> = { object_relations: buildRelationsPayload(input) };
  const orgLinks = buildOrgLinksPayload(input);
  if (orgLinks !== null) {
    payload.org_links = orgLinks;
  }
  const actors = buildActorLinksPayload(input);
  if (actors !== null) {
    payload.actors = actors;
  }
  return payload;
}
