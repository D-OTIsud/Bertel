jest.mock('@/lib/supabase', () => ({ getApiClient: jest.fn(), getSupabaseClient: jest.fn() }));
jest.mock('@/store/session-store', () => ({ useSessionStore: { getState: () => ({ demoMode: false, userId: 'synthetic-export-user' }), subscribe: jest.fn(() => () => {}) } }));
import { getApiClient } from '@/lib/supabase';
import { saveObjectWorkspaceMedia, saveObjectWorkspaceRooms, saveObjectWorkspacePlaces } from '@/services/object-workspace';
import { galleryBaseline, buildGalleryWritePayload } from '@/services/media-write-contract';
import { parseObjectWorkspace } from '@/services/object-workspace-parser';
import type { ObjectWorkspaceMediaItem, ObjectWorkspaceMediaModule, ObjectWorkspaceModules } from '@/services/object-workspace-parser';
import { serializeObjectJson, stripCatalogOptions, parseImportedObjectJson, restoreCatalogOptions } from '@/features/object-editor/io/object-io-serialize';

const OBJECT = 'HOT0000000000001';
const ID = '00000000-0000-4000-a000-00000000f701';
const TYPE = '00000000-0000-4000-a000-00000000f702';
const ADDED = '00000000-0000-4000-a000-00000000f703';
const CREATED = '00000000-0000-4000-a000-00000000f704';
const raw = (id = ID, title = 'B') => ({ id, object_id: OBJECT, place_id: null, media_type_id: TYPE, title,
  url: 'https://example.invalid/synthetic.jpg', visibility: null, is_main: false, is_published: true,
  position: 0, updated_at: '2026-11-06T00:00:00Z' });
const item = (id = ID, title = 'B'): ObjectWorkspaceMediaItem => ({ id, scope: 'object', placeId: null,
  scopeLabel: 'Objet principal', typeId: TYPE, typeCode: 'photo', typeLabel: 'Photo', title, titleTranslations: {},
  description: '', descriptionTranslations: {}, url: raw().url, credit: '', visibility: '', position: '0',
  width: '', height: '', rightsExpiresAt: '', kind: '', isMain: false, isPublished: true, tags: [] });
function media(): ObjectWorkspaceMediaModule {
  const value: ObjectWorkspaceMediaModule = { typeOptions: [{ id: TYPE, code: 'photo', label: 'Photo' }],
    tagOptions: [], objectItems: [item()], placeItems: [], unavailableReason: null, placeScopeUnavailableReason: null };
  value.galleryWriteBaseline = galleryBaseline(value, [raw()]);
  value.objectItems = [item(ID, 'C')];
  return value;
}
function roundTrip(value: ObjectWorkspaceModules): ObjectWorkspaceModules {
  const text = serializeObjectJson(stripCatalogOptions(value), { objectId: OBJECT, type: 'HOT', name: 'synthetic' });
  const parsed = parseImportedObjectJson(text);
  if (!parsed.ok) throw new Error(parsed.error);
  return Object.fromEntries(Object.entries(parsed.modules).map(([key, module]) =>
    [key, restoreCatalogOptions(module, value[key as keyof ObjectWorkspaceModules], key)])) as ObjectWorkspaceModules;
}
function full(value = media()) {
  return { ...parseObjectWorkspace({ id: OBJECT, name: 'Synthetic', raw: {} }, ['fr']), media: value };
}
function mockRpc(snapshot = [raw(ID, 'C'), raw(ADDED, 'Concurrent')]) {
  const rpc = jest.fn().mockResolvedValue({ data: { success: true, snapshot }, error: null });
  jest.mocked(getApiClient).mockReturnValue({ schema: () => ({ rpc }) } as never);
  return rpc;
}
beforeEach(() => { localStorage.clear(); jest.clearAllMocks(); });

test('format2 roundtrip retains frozen B expected/readId and typed C; real writer does not delete unseen concurrent row', async () => {
  const source = full();
  const imported = roundTrip(source);
  expect(imported.media.galleryWriteBaseline).toEqual(source.media.galleryWriteBaseline);
  expect(imported.media.objectItems[0].title).toBe('C');
  const rpc = mockRpc();
  const result = await saveObjectWorkspaceMedia(OBJECT, imported.media, { canEditPlaceMedia: false });
  const payload = rpc.mock.calls[0][1].p_payload;
  expect(payload.rows).toEqual([{ id: ID, expected: raw(), changes: { title: 'C' } }]);
  expect(payload.deleted).toEqual([]);
  expect(result).toMatchObject({ media: { objectItems: [{ id: ID, title: 'C' }, { id: ADDED, title: 'Concurrent' }] } });
  expect(Object.keys(payload)).not.toContain('readId');
});

test('definitive CAS rejection propagates through real service and keeps imported C; no fake acknowledgement', async () => {
  const imported = roundTrip(full()).media;
  const rpc = mockRpc();
  rpc.mockResolvedValueOnce({ data: null, error: { code: 'PT409', message: 'Synthetic stale expected' } });
  await expect(saveObjectWorkspaceMedia(OBJECT, imported, { canEditPlaceMedia: false })).rejects.toMatchObject({ code: 'PT409' });
  expect(rpc.mock.calls[0][1].p_payload.rows[0].expected).toEqual(raw());
  expect(imported.objectItems[0].title).toBe('C');
  expect(imported.galleryWriteBaseline?.rows[0]).toEqual(raw());
});

test('createdIds allocation survives export/import and keeps the same canonical UUID for an uncertain creation', async () => {
  const source = media(); source.objectItems = [];
  source.galleryWriteBaseline = galleryBaseline(source, []);
  source.objectItems = [item('temporary-photo', 'C')];
  source.galleryWriteBaseline.createdIds['temporary-photo'] = CREATED;
  const imported = roundTrip(full(source)).media;
  const rpc = mockRpc([raw(CREATED, 'C')]);
  await saveObjectWorkspaceMedia(OBJECT, imported, { canEditPlaceMedia: false });
  expect(rpc.mock.calls[0][1].p_payload.rows[0]).toMatchObject({ id: CREATED, expected: null, changes: { title: 'C' } });
  expect(imported.galleryWriteBaseline?.createdIds['temporary-photo']).toBe(CREATED);
});

test('frozen known children sets preserve explicit removals and never delete an unseen concurrent child', async () => {
  const source = full();
  source.rooms.items = []; source.rooms.knownRoomIds = [ID];
  source.places.items = []; source.places.knownPlaceIds = [ID];
  const imported = roundTrip(source);
  const rpc = mockRpc();
  await saveObjectWorkspaceRooms(OBJECT, imported.rooms);
  await saveObjectWorkspacePlaces(OBJECT, imported.places);
  expect(rpc.mock.calls).toHaveLength(2);
  for (const [, args] of rpc.mock.calls) {
    expect(args.p_payload.deleted_ids).toEqual([ID]);
    expect(args.p_payload.deleted_ids).not.toContain(ADDED);
  }
});

test('blind live rebind would delete unseen rows; stripping baseline alone blocks the real writer', async () => {
  const source = media();
  const live = media(); live.objectItems = [item(), item(ADDED, 'Concurrent')];
  live.galleryWriteBaseline = galleryBaseline(live, [raw(), raw(ADDED, 'Concurrent')]);
  expect(buildGalleryWritePayload({ ...source, galleryWriteBaseline: live.galleryWriteBaseline }).deleted)
    .toEqual([{ id: ADDED, expected: raw(ADDED, 'Concurrent') }]);
  const rpc = mockRpc();
  await expect(saveObjectWorkspaceMedia(OBJECT, { ...source, galleryWriteBaseline: undefined }, { canEditPlaceMedia: false }))
    .rejects.toThrow('Rechargez la galerie');
  expect(rpc).not.toHaveBeenCalled();
});

