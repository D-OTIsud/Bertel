jest.mock('./notification-delivery', () => ({ pingNotifyDrain: jest.fn() }));
jest.mock('../lib/supabase', () => ({ getApiClient: jest.fn(), getSupabaseClient: jest.fn() }));
jest.mock('../store/session-store', () => ({ useSessionStore: { getState: () => ({ demoMode: false }) } }));

import { getSupabaseClient } from '../lib/supabase';
import {
  buildMeetingRoomEquipmentReconcile,
  buildMeetingRoomDeletedIds,
  buildMeetingRoomSavePayload,
  buildRoomsRpcPayload,
  getObjectWorkspaceRoomsModule,
} from './object-workspace';
import type { ObjectWorkspaceMeetingRoomItem, ObjectWorkspaceRoomsModule } from './object-workspace-parser';
import { parseObjectWorkspace } from './object-workspace-parser';
import type { ReferenceCatalogs } from './reference-catalogs';

describe('rooms reconcile contract', () => {
  it('also preserves raw Markdown and NULL position through the canonical SQL loader', async () => {
    const markdown = '    code indenté\n\nTexte\n';
    const roomId = '33333333-3333-4333-8333-333333333333';
    const from = (table: string) => {
      const chain = {
        select: () => chain, eq: () => chain, in: () => chain, order: () => chain,
        then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
          return Promise.resolve({ data: table === 'object_room_type' ? [{ id: roomId, name: 'Chambre', description: markdown, position: null }] : [], error: null }).then(resolve, reject);
        },
      };
      return chain;
    };
    (getSupabaseClient as jest.Mock).mockReturnValue({ from });
    const baseline = parseObjectWorkspace({ id: 'o1', name: 'Test', raw: { room_types: [{ id: roomId, name: 'Chambre' }] } }, ['fr']).rooms;
    const loaded = await getObjectWorkspaceRoomsModule('o1', baseline, { refCodeByDomain: {}, tables: {} } as ReferenceCatalogs);
    expect(loaded.unavailableReason).toBeNull();
    expect(loaded.items[0].position).toBe('');
    const row = (buildRoomsRpcPayload(loaded) as { rooms: Record<string, unknown>[] }).rooms[0];
    expect(row.description).toBe(markdown);
    expect(row.position).toBeNull();
  });

  it('keeps Markdown indentation, trailing newline, and an unedited NULL position from a real read', () => {
    const markdown = '    code indenté\n\nTexte\n';
    const module = parseObjectWorkspace({ id: 'o1', name: 'Test', raw: {
      room_types: [{ id: '33333333-3333-4333-8333-333333333333', name: 'Chambre', description: markdown, position: null }],
    } }, ['fr']).rooms;
    expect(module.items[0].position).toBe('');
    const row = (buildRoomsRpcPayload(module) as { rooms: Record<string, unknown>[] }).rooms[0];
    expect(row.description).toBe(markdown);
    expect(row.position).toBeNull();
    module.items[0].position = '2';
    expect((buildRoomsRpcPayload(module) as { rooms: Record<string, unknown>[] }).rooms[0].position).toBe(2);
  });
  it('keeps a draft UUID across retry and removes it only after it becomes part of the viewed baseline', () => {
    const id = '33333333-3333-4333-8333-333333333333';
    const room = {
      recordId: id, code: 'unit-1', name: '', nameTranslations: {}, description: '', descriptionTranslations: {},
      capacityAdults: '', capacityChildren: '', capacityTotal: '', sizeSqm: '', bedConfig: '', bedConfigTranslations: {},
      quantity: '', floorLevel: '', viewTypeId: '', viewTypeCode: '', viewTypeLabel: '', roomTypeId: '', roomTypeCode: '',
      roomTypeLabel: '', basePrice: '', currency: 'EUR', accessible: false, published: true, position: '1',
      amenityCodes: [], mediaIds: [], beds: [],
    };
    const firstSave = buildRoomsRpcPayload({ items: [room], knownRoomIds: [], unavailableReason: null } as unknown as ObjectWorkspaceRoomsModule) as {
      write_contract: string; deleted_ids: string[]; rooms: Record<string, unknown>[];
    };
    const retry = buildRoomsRpcPayload({ items: [room], knownRoomIds: [], unavailableReason: null } as unknown as ObjectWorkspaceRoomsModule) as typeof firstSave;
    expect(firstSave.write_contract).toBe('rooms-reconcile-v1');
    expect(firstSave.rooms[0].id).toBe(id);
    expect(retry.rooms[0].id).toBe(id);
    expect(firstSave.deleted_ids).toEqual([]);

    const explicitRemoval = buildRoomsRpcPayload({ items: [], knownRoomIds: [id], unavailableReason: null } as unknown as ObjectWorkspaceRoomsModule) as typeof firstSave;
    expect(explicitRemoval.deleted_ids).toEqual([id]);
  });

  it('preserves nullable booleans, NULL quantity/currency, and bed positions', () => {
    const input = {
      knownRoomIds: [],
      unavailableReason: null,
      items: [{
        recordId: null, code: 'unit-1', name: '', rawName: null, nameTranslations: {}, description: '', descriptionTranslations: {},
        capacityAdults: '', capacityChildren: '', capacityTotal: '', sizeSqm: '', bedConfig: '', bedConfigTranslations: {},
        quantity: '', floorLevel: '', viewTypeId: '', viewTypeCode: '', viewTypeLabel: '', roomTypeId: '', roomTypeCode: '',
        roomTypeLabel: '', basePrice: '', currency: '', accessible: false, rawAccessible: null, published: true, rawPublished: null,
        position: '1', amenityCodes: [], mediaIds: [], beds: [{ bedTypeId: '', bedTypeCode: 'double', bedTypeLabel: 'Double', quantity: '1', position: 0 }],
      }],
    } as unknown as ObjectWorkspaceRoomsModule;
    const row = (buildRoomsRpcPayload(input) as { rooms: Record<string, unknown>[] }).rooms[0];
    expect(row).toMatchObject({ is_accessible: null, is_published: null, total_rooms: null, currency: null });
    expect(row.beds).toEqual([{ bed_type_code: 'double', quantity: 1, position: 0 }]);
  });
});

describe('meeting room reconciliation payloads', () => {
  const item: ObjectWorkspaceMeetingRoomItem = {
    recordId: null,
    uid: '66666666-6666-4666-8666-666666666666',
    name: 'Salle A',
    rawName: 'Salle A',
    extra: { externalCode: 'legacy-7' },
    nameTranslations: { en: 'Room A' },
    areaM2: '50',
    capacityTheatre: '40',
    capacityU: '',
    capacityClassroom: '',
    capacityBoardroom: '',
    equipmentCodes: ['screen', 'speaker'],
    equipmentDetails: [
      { equipmentId: 'screen-id', note: 'HDMI mural', position: 4 },
      { equipmentId: 'removed-id', note: 'À retirer', position: 8 },
    ],
  };

  it('uses the same client ID on retry and retains raw name, translations, and extra', () => {
    const first = buildMeetingRoomSavePayload('object-1', item);
    const retry = buildMeetingRoomSavePayload('object-1', item);
    expect(first.id).toBe(item.uid);
    expect(retry.id).toBe(first.id);
    expect(first).toMatchObject({ name: 'Salle A', name_i18n: { en: 'Room A' }, extra: { externalCode: 'legacy-7' } });
  });

  it('fails before writing when a new draft has no stable UUID', () => {
    expect(() => buildMeetingRoomSavePayload('object-1', { ...item, uid: undefined })).toThrow(/identifiant stable/);
  });

  it('does not delete a new room on retry, then allows explicit deletion after canonical commit', () => {
    const newId = item.uid!;
    expect(buildMeetingRoomDeletedIds([], [item])).toEqual([]);
    const committed = { ...item, recordId: newId };
    expect(buildMeetingRoomDeletedIds([newId], [committed])).toEqual([]);
    expect(buildMeetingRoomDeletedIds([newId], [])).toEqual([newId]);
  });

  it('keeps selected link notes and positions and deletes only an explicitly removed link', () => {
    const result = buildMeetingRoomEquipmentReconcile('room-id', item, new Map([
      ['screen', 'screen-id'], ['speaker', 'speaker-id'],
    ]));
    expect(result.upsertRows).toEqual([
      { room_id: 'room-id', equipment_id: 'screen-id', position: 4, note: 'HDMI mural' },
      { room_id: 'room-id', equipment_id: 'speaker-id', position: 2, note: null },
    ]);
    expect(result.removedIds).toEqual(['removed-id']);
  });

  it('keeps an existing equipment link position NULL instead of inventing an ordinal', () => {
    const result = buildMeetingRoomEquipmentReconcile('room-id', {
      ...item, equipmentCodes: ['screen'], equipmentDetails: [{ equipmentId: 'screen-id', note: 'Note conservée', position: null }],
    }, new Map([['screen', 'screen-id']]));
    expect(result.upsertRows).toEqual([{ room_id: 'room-id', equipment_id: 'screen-id', position: null, note: 'Note conservée' }]);
  });
});
