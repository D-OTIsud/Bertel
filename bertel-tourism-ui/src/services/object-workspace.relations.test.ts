import { buildRelationsPayload } from './object-workspace';
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
const mod = (relatedObjects: ObjectWorkspaceRelatedObjectItem[]): ObjectWorkspaceRelationshipsModule => ({
  organizationLinks: [], actors: [], relatedObjects,
  organizationLinkWriteUnavailableReason: null, actorWriteUnavailableReason: null,
  actorConsentUnavailableReason: null, relatedObjectWriteUnavailableReason: null,
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
