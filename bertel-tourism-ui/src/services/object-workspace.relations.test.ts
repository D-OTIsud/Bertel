import { buildOrgLinksPayload, buildRelationsPayload } from './object-workspace';
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
    expect(payload).toEqual([{ org_object_id: 'ORG1', role_code: 'publisher', is_primary: true, note: 'n' }]);
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
