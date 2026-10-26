jest.mock('./notification-delivery', () => ({ pingNotifyDrain: jest.fn() }));
jest.mock('../lib/supabase', () => ({ getApiClient: jest.fn(), getSupabaseClient: jest.fn() }));
jest.mock('../store/session-store', () => ({ useSessionStore: { getState: () => ({ demoMode: false }) } }));

import { getApiClient, getSupabaseClient } from '../lib/supabase';
import { parseObjectWorkspace } from './object-workspace-parser';
import type { ReferenceCatalogs } from './reference-catalogs';
import {
  getObjectWorkspaceRoomsModule, getObjectWorkspaceMeetingRoomsModule, getObjectWorkspaceMenusModule, getObjectWorkspaceLegalModule,
  saveObjectWorkspaceRooms, saveObjectWorkspaceMeetingRooms, saveObjectWorkspaceMenus,
  saveObjectWorkspaceOpenings, saveObjectWorkspacePricing, saveObjectWorkspaceLegal, saveObjectWorkspaceMemberships,
} from './object-workspace';
import { LEGAL_SUMMARY_UNAVAILABLE, workspaceSaveBlockedReason } from './object-workspace-safety';
import { saveWorkspaceModule } from '../hooks/useExplorerQueries';

const catalogs = { refCodeByDomain: {}, tables: {} } as ReferenceCatalogs;
const mockClient = getSupabaseClient as jest.Mock;
const mockApi = getApiClient as jest.Mock;
const base = () => parseObjectWorkspace({ id: 'o1', name: 'Test', type: 'HOT', raw: {
  room_types: [{ id: 'r1', name: 'Chambre conservée' }],
  meeting_rooms: [{ id: 's1', name: 'Salle conservée' }],
  menus: [{ id: 'm1', name: 'Menu conservé', items: [{ id: 'i1', name: 'Plat conservé' }] }],
} }, ['fr']);
const empty = () => parseObjectWorkspace({ id: 'o1', name: 'Test', raw: {} }, ['fr']);

type Response = { data: unknown; error: unknown };
type ReadChain = {
  select: jest.Mock; eq: jest.Mock; in: jest.Mock; order: jest.Mock;
  then: (resolve: (value: Response) => unknown, reject: (reason: unknown) => unknown) => Promise<unknown>;
};
function clientWith(overrides: Record<string, Response | Error> = {}) {
  const rows: Record<string, Response | Error> = {
    object_room_type: { data: [{ id: 'r1', name: 'Chambre' }], error: null },
    object_meeting_room: { data: [{ id: 's1', name: 'Salle' }], error: null },
    object_menu: { data: [{ id: 'm1', name: 'Menu' }], error: null },
    object_menu_item: { data: [{ id: 'i1', menu_id: 'm1', name: 'Plat' }], error: null },
    ...overrides,
  };
  const from = jest.fn((table: string) => {
    const chain: ReadChain = {
      select: jest.fn(() => chain), eq: jest.fn(() => chain), in: jest.fn(() => chain), order: jest.fn(() => chain),
      then(resolve: (value: Response) => unknown, reject: (reason: unknown) => unknown) {
        const response = rows[table] ?? { data: [], error: null };
        return (response instanceof Error ? Promise.reject(response) : Promise.resolve(response)).then(resolve, reject);
      },
    };
    return chain;
  });
  mockClient.mockReturnValue({ from });
  return from;
}

beforeEach(() => jest.resetAllMocks());

describe('legal records must load completely before allowing a missing compliance summary', () => {
  const row = { id: 'legal-1', type: { code: 'insurance', name: 'Assurance' }, validity_mode: 'forever', value: 'assuré', note: 'À conserver' };
  const input = () => parseObjectWorkspace({ id: 'o1', name: 'Test', raw: { legal_records: [row] } }, ['fr']).legal;
  function legalApi(data: unknown) {
    mockApi.mockReturnValue({ schema: () => ({ rpc: jest.fn((name: string) => Promise.resolve(
      name === 'get_object_legal_data' ? { data, error: null } : { data: null, error: { message: 'summary unavailable' } },
    )) }) });
    clientWith();
  }

  it.each([null, {}, [null], ['malformed'], [{}], [{ id: 'legal-1' }], [row, row]])('blocks malformed records response %p before any save', async (data) => {
    legalApi(data);
    const baseline = input();
    const loaded = await getObjectWorkspaceLegalModule('o1', baseline, catalogs);
    expect(loaded.unavailableReason).toBeTruthy();
    expect(loaded.unavailableReason).not.toBe(LEGAL_SUMMARY_UNAVAILABLE);
    expect(loaded.records).toBe(baseline.records);
    mockClient.mockClear();
    mockApi.mockClear();
    await expect(saveObjectWorkspaceLegal('o1', loaded)).rejects.toThrow(loaded.unavailableReason!);
    expect(mockClient).not.toHaveBeenCalled();
    expect(mockApi).not.toHaveBeenCalled();
  });

  it('blocks a successful empty read when a record was already known', async () => {
    legalApi([]);
    const loaded = await getObjectWorkspaceLegalModule('o1', input(), catalogs);
    expect(workspaceSaveBlockedReason('legal', loaded)).toBeTruthy();
    mockClient.mockClear();
    await expect(saveObjectWorkspaceLegal('o1', loaded)).rejects.toThrow(loaded.unavailableReason!);
    expect(mockClient).not.toHaveBeenCalled();
  });

  it('allows real legal rows to be saved when only the compliance summary fails', async () => {
    legalApi([row]);
    const loaded = await getObjectWorkspaceLegalModule('o1', input(), catalogs);
    expect(loaded.unavailableReason).toBe(LEGAL_SUMMARY_UNAVAILABLE);
    expect(workspaceSaveBlockedReason('legal', loaded)).toBeNull();
    const update = jest.fn(() => ({ eq: jest.fn().mockResolvedValue({ error: null }) }));
    const remove = jest.fn();
    mockClient.mockReturnValue({ from: (table: string) => table === 'ref_legal_type'
      ? { select: () => Promise.resolve({ data: [{ id: 'type-1', code: 'insurance' }], error: null }) }
      : { select: () => ({ eq: () => Promise.resolve({ data: [{ id: 'legal-1' }], error: null }) }), update, delete: remove },
    });
    await saveObjectWorkspaceLegal('o1', loaded);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ type_id: 'type-1', note: 'À conserver', value: 'assuré' }));
    expect(remove).not.toHaveBeenCalled();
  });
});

describe('workspace loaders preserve the baseline on an incomplete child read', () => {
  it.each(['object_room_type_amenity', 'object_room_type_media', 'object_room_type_bed'])('blocks rooms when %s reports an error', async (table) => {
    clientWith({ [table]: { data: null, error: { message: 'denied' } } });
    const input = base().rooms;
    const loaded = await getObjectWorkspaceRoomsModule('o1', input, catalogs);
    expect(loaded.unavailableReason).toBeTruthy();
    expect(loaded.items).toBe(input.items);
    mockClient.mockClear();
    await expect(saveObjectWorkspaceRooms('o1', loaded)).rejects.toThrow(loaded.unavailableReason!);
    expect(mockClient).not.toHaveBeenCalled();
    expect(mockApi).not.toHaveBeenCalled();
  });

  it('blocks rooms on a rejected child request', async () => {
    clientWith({ object_room_type_bed: new Error('network') });
    expect((await getObjectWorkspaceRoomsModule('o1', base().rooms, catalogs)).unavailableReason).toBeTruthy();
  });

  it.each([{ data: null, error: { message: 'denied' } }, new Error('network')])('blocks meeting-room equipment failure %p', async (failure) => {
    clientWith({ meeting_room_equipment: failure });
    const input = base().meetingRooms;
    const loaded = await getObjectWorkspaceMeetingRoomsModule('o1', input, catalogs);
    expect(loaded.unavailableReason).toBeTruthy();
    expect(loaded.items).toBe(input.items);
    mockClient.mockClear();
    await expect(saveObjectWorkspaceMeetingRooms('o1', loaded)).rejects.toThrow(loaded.unavailableReason!);
    expect(mockClient).not.toHaveBeenCalled();
  });

  it.each(['object_menu_item', 'object_menu_item_media', 'object_menu_item_dietary_tag', 'object_menu_item_allergen', 'object_menu_item_cuisine_type'])('blocks menus when %s reports an error', async (table) => {
    clientWith({ [table]: { data: null, error: { message: 'denied' } } });
    const input = base().menus;
    const loaded = await getObjectWorkspaceMenusModule('o1', input, catalogs);
    expect(loaded.unavailableReason).toBeTruthy();
    expect(loaded.items).toBe(input.items);
    mockClient.mockClear();
    await expect(saveObjectWorkspaceMenus('o1', loaded)).rejects.toThrow(loaded.unavailableReason!);
    expect(mockClient).not.toHaveBeenCalled();
  });

  it('blocks menus on a rejected item request', async () => {
    clientWith({ object_menu_item: new Error('network') });
    expect((await getObjectWorkspaceMenusModule('o1', base().menus, catalogs)).unavailableReason).toBeTruthy();
  });

  it('blocks successful responses with malformed child data', async () => {
    clientWith({ object_room_type_bed: { data: null, error: null } });
    expect((await getObjectWorkspaceRoomsModule('o1', base().rooms, catalogs)).unavailableReason).toBeTruthy();
  });

  it('keeps complete modules available when the child collections really are empty', async () => {
    clientWith();
    expect((await getObjectWorkspaceRoomsModule('o1', base().rooms, catalogs)).unavailableReason).toBeNull();
    expect((await getObjectWorkspaceMeetingRoomsModule('o1', base().meetingRooms, catalogs)).unavailableReason).toBeNull();
    expect((await getObjectWorkspaceMenusModule('o1', base().menus, catalogs)).unavailableReason).toBeNull();
  });

  it('does not confuse a failed media-picker catalog with failed media links', async () => {
    clientWith({ media: { data: null, error: { message: 'picker unavailable' } },
      object_room_type_media: { data: [{ room_type_id: 'r1', media_id: 'photo' }], error: null } });
    const loaded = await getObjectWorkspaceRoomsModule('o1', base().rooms, catalogs);
    expect(loaded.unavailableReason).toBeNull();
    expect(loaded.items[0].mediaIds).toEqual(['photo']);
  });
});

describe('workspace read coverage checks', () => {
  it('blocks a room missing from the direct read but present in the resource snapshot', async () => {
    clientWith({ object_room_type: { data: [], error: null } });
    expect((await getObjectWorkspaceRoomsModule('o1', base().rooms, catalogs)).unavailableReason).toBeTruthy();
  });
  it('blocks a meeting room missing from the direct read', async () => {
    clientWith({ object_meeting_room: { data: [], error: null } });
    expect((await getObjectWorkspaceMeetingRoomsModule('o1', base().meetingRooms, catalogs)).unavailableReason).toBeTruthy();
  });
  it.each(['object_menu', 'object_menu_item'])('blocks a known menu or dish missing from %s', async (table) => {
    clientWith({ [table]: { data: [], error: null } });
    expect((await getObjectWorkspaceMenusModule('o1', base().menus, catalogs)).unavailableReason).toBeTruthy();
  });
  it('allows an empty object with a genuinely empty successful read', async () => {
    clientWith({ object_room_type: { data: [], error: null } });
    const loaded = await getObjectWorkspaceRoomsModule('o1', empty().rooms, catalogs);
    expect(loaded.unavailableReason).toBeNull();
    expect(loaded.items).toEqual([]);
  });
  it('rejects unresolved equipment references instead of dropping them', async () => {
    clientWith({ meeting_room_equipment: { data: [{ room_id: 's1', equipment_id: 'unknown' }], error: null } });
    expect((await getObjectWorkspaceMeetingRoomsModule('o1', base().meetingRooms, catalogs)).unavailableReason).toBeTruthy();
  });
  it('rejects unresolved room-type references instead of saving null', async () => {
    clientWith({ object_room_type: { data: [{ id: 'r1', room_type_id: 'unknown' }], error: null } });
    expect((await getObjectWorkspaceRoomsModule('o1', base().rooms, catalogs)).unavailableReason).toBeTruthy();
  });
  it('rejects unresolved dish allergen references instead of dropping them', async () => {
    clientWith({ object_menu_item_allergen: { data: [{ menu_item_id: 'i1', allergen_id: 'unknown' }], error: null } });
    expect((await getObjectWorkspaceMenusModule('o1', base().menus, catalogs)).unavailableReason).toBeTruthy();
  });
  it('blocks known room media omitted by an otherwise successful child read', async () => {
    clientWith();
    const input = base().rooms;
    input.items[0].mediaIds = ['known-photo'];
    expect((await getObjectWorkspaceRoomsModule('o1', input, catalogs)).unavailableReason).toBeTruthy();
  });
  it('blocks known room beds omitted by an otherwise successful child read', async () => {
    clientWith();
    const input = base().rooms;
    input.items[0].beds = [{ bedTypeId: 'bed-1', bedTypeCode: 'double', bedTypeLabel: 'Double', quantity: '1' }];
    expect((await getObjectWorkspaceRoomsModule('o1', input, catalogs)).unavailableReason).toBeTruthy();
  });
  it('matches a getter bed reference containing only code/name to the real catalog UUID', async () => {
    const bedId = '11111111-1111-4111-8111-111111111111';
    const input = parseObjectWorkspace({ id: 'o1', name: 'Test', raw: { room_types: [{
      id: 'r1', beds: [{ quantity: 2, bed_type: { code: 'double', name: 'Double' } }],
    }] } }, ['fr']).rooms;
    expect(input.items[0].beds[0].bedTypeId).toBe('double');
    clientWith({ object_room_type_bed: { data: [{ room_type_id: 'r1', bed_type_id: bedId, quantity: 2, position: 0 }], error: null } });
    const refs: ReferenceCatalogs = { ...catalogs, refCodeByDomain: {
      bed_type: [{ id: bedId, code: 'double', name: 'Double', domain: 'bed_type', position: 0 }],
    } };
    const loaded = await getObjectWorkspaceRoomsModule('o1', input, refs);
    expect(loaded.unavailableReason).toBeNull();
    expect(loaded.items[0].beds).toEqual([{ bedTypeId: bedId, bedTypeCode: 'double', bedTypeLabel: 'Double', quantity: '2', position: 0 }]);
  });
  it('still checks actual baseline bed UUIDs even if the replacement has the same code', async () => {
    const oldId = '11111111-1111-4111-8111-111111111111';
    const newId = '22222222-2222-4222-8222-222222222222';
    const input = parseObjectWorkspace({ id: 'o1', name: 'Test', raw: { room_types: [{
      id: 'r1', beds: [{ quantity: 2, bed_type: { id: oldId, code: 'double', name: 'Double' } }],
    }] } }, ['fr']).rooms;
    clientWith({ object_room_type_bed: { data: [{ room_type_id: 'r1', bed_type_id: newId, quantity: 2, position: 0 }], error: null } });
    const refs: ReferenceCatalogs = { ...catalogs, refCodeByDomain: {
      bed_type: [{ id: newId, code: 'double', name: 'Double', domain: 'bed_type', position: 0 }],
    } };
    expect((await getObjectWorkspaceRoomsModule('o1', input, refs)).unavailableReason).toBeTruthy();
  });
  it('blocks known meeting equipment omitted by an otherwise successful child read', async () => {
    clientWith();
    const input = base().meetingRooms;
    input.items[0].equipmentCodes = ['projector'];
    expect((await getObjectWorkspaceMeetingRoomsModule('o1', input, catalogs)).unavailableReason).toBeTruthy();
  });
  it('blocks known dish allergens omitted by an otherwise successful child read', async () => {
    clientWith();
    const input = base().menus;
    input.items[0].items[0].allergenCodes = ['gluten'];
    expect((await getObjectWorkspaceMenusModule('o1', input, catalogs)).unavailableReason).toBeTruthy();
  });
  it('keeps resolved equipment and beds when the child read is complete', async () => {
    clientWith({
      object_room_type_bed: { data: [{ room_type_id: 'r1', bed_type_id: 'bed-1', quantity: 2, position: 0 }], error: null },
      meeting_room_equipment: { data: [{ room_id: 's1', equipment_id: 'equipment-1' }], error: null },
      object_menu_item_allergen: { data: [{ menu_item_id: 'i1', allergen_id: 'allergen-1' }], error: null },
    });
    const refs: ReferenceCatalogs = { ...catalogs, refCodeByDomain: {
      bed_type: [{ id: 'bed-1', code: 'double', name: 'Double', domain: 'bed_type', position: 0 }],
      meeting_equipment: [{ id: 'equipment-1', code: 'projector', name: 'Projecteur', domain: 'meeting_equipment', position: 0 }],
      allergen: [{ id: 'allergen-1', code: 'gluten', name: 'Gluten', domain: 'allergen', position: 0 }],
    } };
    const rooms = await getObjectWorkspaceRoomsModule('o1', base().rooms, refs);
    const meeting = await getObjectWorkspaceMeetingRoomsModule('o1', base().meetingRooms, refs);
    const menus = await getObjectWorkspaceMenusModule('o1', base().menus, refs);
    expect(rooms.unavailableReason).toBeNull();
    expect(rooms.items[0].beds).toEqual([{ bedTypeId: 'bed-1', bedTypeCode: 'double', bedTypeLabel: 'Double', quantity: '2', position: 0 }]);
    expect(meeting.unavailableReason).toBeNull();
    expect(meeting.items[0].equipmentCodes).toEqual(['projector']);
    expect(menus.unavailableReason).toBeNull();
    expect(menus.items[0].items[0].allergenCodes).toEqual(['gluten']);
  });
  it('keeps populated fallback modules unavailable when the client is absent', async () => {
    mockClient.mockReturnValue(null);
    expect((await getObjectWorkspaceRoomsModule('o1', base().rooms, catalogs)).unavailableReason).toBeTruthy();
    expect((await getObjectWorkspaceMeetingRoomsModule('o1', base().meetingRooms, catalogs)).unavailableReason).toBeTruthy();
    expect((await getObjectWorkspaceMenusModule('o1', base().menus, catalogs)).unavailableReason).toBeTruthy();
  });
});

describe('write boundaries block unavailable snapshots before any backend call', () => {
  it('blocks direct opening and pricing service calls', async () => {
    await expect(saveObjectWorkspaceOpenings('o1', { ...empty().openings, unavailableReason: 'lecture incomplète' })).rejects.toThrow('lecture incomplète');
    await expect(saveObjectWorkspacePricing('o1', { ...empty().pricing, unavailableReason: 'lecture incomplète' })).rejects.toThrow('lecture incomplète');
    expect(mockApi).not.toHaveBeenCalled();
  });
  it('blocks direct legal and membership calls when their records failed to load', async () => {
    await expect(saveObjectWorkspaceLegal('o1', { ...empty().legal, unavailableReason: 'lecture juridique en erreur' })).rejects.toThrow('lecture juridique en erreur');
    await expect(saveObjectWorkspaceMemberships('o1', { ...empty().memberships, unavailableReason: 'lecture en erreur' })).rejects.toThrow('lecture en erreur');
    expect(mockClient).not.toHaveBeenCalled();
  });
  it('does not block legal records merely because the compliance summary is unavailable', () => {
    expect(workspaceSaveBlockedReason('legal', { ...empty().legal, unavailableReason: LEGAL_SUMMARY_UNAVAILABLE })).toBeNull();
  });
  it('blocks direct dispatcher calls without going through the editor planner', async () => {
    await expect(saveWorkspaceModule('o1', { moduleId: 'openings', value: { ...empty().openings, unavailableReason: 'ne pas écrire' } })).rejects.toThrow('ne pas écrire');
    expect(mockApi).not.toHaveBeenCalled();
    expect(mockClient).not.toHaveBeenCalled();
  });
  it('fails closed at the direct dispatcher before any database writer when the app protocol is too new', async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ minimumClientVersion: 2, writeContractVersion: 2 }),
    } as unknown as Response);
    try {
      await expect(saveWorkspaceModule('o1', { moduleId: 'openings', value: empty().openings }))
        .rejects.toThrow(/ne peut pas écrire sur le serveur actuel/);
      expect(global.fetch).toHaveBeenCalledWith('/api/app-version', expect.objectContaining({ cache: 'no-store', signal: expect.anything() }));
      expect(mockApi).not.toHaveBeenCalled();
      expect(mockClient).not.toHaveBeenCalled();
    } finally {
      global.fetch = originalFetch;
    }
  });
  it('blocks malformed room children rather than treating them as empty', async () => {
    const input = base().rooms;
    input.items[0].beds = null as unknown as typeof input.items[0]['beds'];
    await expect(saveObjectWorkspaceRooms('o1', input)).rejects.toThrow(/incomplètes/);
    expect(mockApi).not.toHaveBeenCalled();
  });
});
