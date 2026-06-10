import { buildActorLinksPayload, buildOrgLinksPayload, buildRelationsPayload, buildRelationshipsRpcPayload } from './object-workspace';
import type {
  ObjectWorkspaceRelationshipsModule,
  ObjectWorkspaceRelatedObjectItem,
} from './object-workspace-parser';

// Pins the object_relation write contract: the editor persists OUTGOING relations via
// api.save_object_relations ({object_relations:[{target_object_id, relation_type_code, distance_m, note, position}]}).
// Incoming relations are owned by other objects and must never be written from here.
const rel = (over: Partial<ObjectWorkspaceRelatedObjectItem>): ObjectWorkspaceRelatedObjectItem => ({
  id: 'TGT1', name: 'Target', type: 'PNA', status: 'published',
  relationTypeId: '', relationTypeCode: 'based_at_site', relationTypeLabel: 'Situé sur le site',
  direction: 'out', note: '', distanceM: '', ...over,
});
const mod = (
  relatedObjects: ObjectWorkspaceRelatedObjectItem[],
  over: Partial<ObjectWorkspaceRelationshipsModule> = {},
): ObjectWorkspaceRelationshipsModule => ({
  organizationLinks: [], actors: [], relatedObjects,
  orgRoleOptions: [], orgOptions: [], actorRoleOptions: [],
  organizationLinkWriteUnavailableReason: null, actorWriteUnavailableReason: null,
  actorConsentUnavailableReason: null, relatedObjectWriteUnavailableReason: null,
  ...over,
});

// §48 — pins the org_links arm of api.save_object_relations
// ({org_links:[{org_object_id, role_code, is_primary, note}]}); the RPC deletes every
// object_org_link row for the object then re-inserts the payload (≤1 primary enforced).
const orgLink = (over: Partial<ObjectWorkspaceRelationshipsModule['organizationLinks'][number]>) => ({
  id: 'ORG1', source: 'org_link' as const, type: 'ORG', name: 'OTI du Sud', status: 'published',
  roleId: 'r-pub', roleCode: 'publisher', roleLabel: 'Publisher principal', isPrimary: false, note: '', contacts: [], ...over,
});

describe('buildRelationsPayload', () => {
  it('maps outgoing relations to the save_object_relations shape', () => {
    const payload = buildRelationsPayload(mod([
      rel({ id: 'TGT1', relationTypeCode: 'based_at_site', note: 'on site', distanceM: '' }),
      rel({ id: 'TGT2', relationTypeCode: 'near', note: '', distanceM: '500', direction: 'associated' }),
    ]));
    expect(payload).toEqual([
      { target_object_id: 'TGT1', relation_type_code: 'based_at_site', distance_m: '', note: 'on site', position: 0 },
      { target_object_id: 'TGT2', relation_type_code: 'near', distance_m: '500', note: '', position: 1 },
    ]);
  });

  it('excludes incoming relations (owned by other objects)', () => {
    const payload = buildRelationsPayload(mod([
      rel({ id: 'OUT', direction: 'out' }),
      rel({ id: 'IN', direction: 'in' }),
    ]));
    expect(payload.map((r) => r.target_object_id)).toEqual(['OUT']);
  });

  it('returns [] when there are no outgoing relations (clears them)', () => {
    expect(buildRelationsPayload(mod([rel({ direction: 'in' })]))).toEqual([]);
  });
});

describe('buildOrgLinksPayload', () => {
  it('maps org links to the save_object_relations org_links shape', () => {
    const payload = buildOrgLinksPayload(mod([], { organizationLinks: [orgLink({ isPrimary: true, note: 'n' })] }));
    expect(payload).toEqual([{ org_object_id: 'ORG1', role_id: 'r-pub', role_code: 'publisher', is_primary: true, note: 'n' }]);
  });

  it('passes role_id through for airtight RPC role resolution', () => {
    const value = mod([], { organizationLinks: [orgLink({ roleId: 'r-uuid-1' })] });
    expect(buildOrgLinksPayload(value)![0].role_id).toBe('r-uuid-1');
  });

  it('does not lose the primary flag when the primary row is a dropped duplicate', () => {
    const value = mod([], {
      organizationLinks: [orgLink({ isPrimary: false }), orgLink({ isPrimary: true })], // same (org, role)
    });
    const rows = buildOrgLinksPayload(value)!;
    expect(rows).toHaveLength(1);
    expect(rows[0].is_primary).toBe(true);
  });

  it('keeps only the first primary (the RPC raises on >1)', () => {
    const payload = buildOrgLinksPayload(
      mod([], { organizationLinks: [orgLink({ id: 'A', isPrimary: true }), orgLink({ id: 'B', isPrimary: true })] }),
    )!;
    expect(payload.map((row) => row.is_primary)).toEqual([true, false]);
  });

  it('dedupes identical (org, role) pairs and drops incomplete rows', () => {
    const payload = buildOrgLinksPayload(
      mod([], { organizationLinks: [orgLink({}), orgLink({}), orgLink({ id: '', roleCode: 'publisher' })] }),
    );
    expect(payload).toHaveLength(1);
  });

  it('returns null (omit the key — anti-clobber) when the load was unreliable', () => {
    const payload = buildOrgLinksPayload(mod([], { organizationLinkWriteUnavailableReason: 'load failed' }));
    expect(payload).toBeNull();
  });
});

// §48 — pins the actors arm of api.save_object_relations
// ({actors:[{actor_id, role_id, role_code, is_primary, visibility, valid_from, valid_to, note}]});
// the RPC deletes every actor_object_role row for the object then re-inserts the payload
// (≤1 primary per (object, role) enforced by uq_actor_object_role_primary).
const actorLink = (over: Partial<ObjectWorkspaceRelationshipsModule['actors'][number]> = {}) => ({
  id: 'a1', displayName: 'Marie Guide', firstName: 'Marie', lastName: 'Guide', gender: '',
  roleId: 'r-op', roleCode: 'operator', roleLabel: 'Exploitant', visibility: 'public',
  isPrimary: false, validFrom: '', validTo: '', note: '', contacts: [], ...over,
});

describe('buildActorLinksPayload', () => {
  it('maps actor links to the save_object_relations actors shape (incl. role_id passthrough)', () => {
    const value = mod([], { actors: [actorLink({ isPrimary: true, note: 'n' })] });
    expect(buildActorLinksPayload(value)).toEqual([
      { actor_id: 'a1', role_id: 'r-op', role_code: 'operator', is_primary: true, visibility: 'public', valid_from: '', valid_to: '', note: 'n' },
    ]);
  });

  it('defaults visibility to public when empty', () => {
    const value = mod([], { actors: [actorLink({ visibility: '' })] });
    expect(buildActorLinksPayload(value)![0].visibility).toBe('public');
  });

  it('keeps only the first primary PER ROLE (uq_actor_object_role_primary)', () => {
    const value = mod([], {
      actors: [
        actorLink({ id: 'a1', roleCode: 'operator', isPrimary: true }),
        actorLink({ id: 'a2', roleCode: 'operator', isPrimary: true }),
        actorLink({ id: 'a3', roleCode: 'guide', isPrimary: true }),
      ],
    });
    expect(buildActorLinksPayload(value)!.map((row) => row.is_primary)).toEqual([true, false, true]);
  });

  it('does not lose the primary flag when the primary row is a dropped duplicate', () => {
    const value = mod([], {
      actors: [actorLink({ isPrimary: false }), actorLink({ isPrimary: true })], // same (actor, role)
    });
    const rows = buildActorLinksPayload(value)!;
    expect(rows).toHaveLength(1);
    expect(rows[0].is_primary).toBe(true);
  });

  it('dedupes identical (actor, role) pairs and drops incomplete rows', () => {
    const value = mod([], {
      actors: [actorLink({}), actorLink({}), actorLink({ id: '', roleCode: 'operator' })],
    });
    expect(buildActorLinksPayload(value)).toHaveLength(1);
  });

  it('returns null (omit the key — anti-clobber) when actor links were not loaded reliably', () => {
    const value = mod([], { actorWriteUnavailableReason: 'pending 8r' });
    expect(buildActorLinksPayload(value)).toBeNull();
  });
});

describe('buildRelationshipsRpcPayload', () => {
  it('omits the org_links key entirely when the load was unreliable', () => {
    const payload = buildRelationshipsRpcPayload(mod([], { organizationLinkWriteUnavailableReason: 'load failed' }));
    expect(payload).toHaveProperty('object_relations');
    expect('org_links' in payload).toBe(false);
  });

  it('sends an empty org_links array when the list is reliably empty (clears links)', () => {
    const payload = buildRelationshipsRpcPayload(mod([]));
    expect(payload.org_links).toEqual([]);
  });

  it('omits the actors key entirely when the actor load was unreliable', () => {
    const payload = buildRelationshipsRpcPayload(mod([], { actorWriteUnavailableReason: 'load failed' }));
    expect(payload).toHaveProperty('object_relations');
    expect('actors' in payload).toBe(false);
  });

  it('sends an empty actors array when the list is reliably empty (clears actor roles)', () => {
    const payload = buildRelationshipsRpcPayload(mod([]));
    expect(payload.actors).toEqual([]);
  });
});
