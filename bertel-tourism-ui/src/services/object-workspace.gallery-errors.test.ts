import { getApiClient, getSupabaseClient } from '../lib/supabase';
import { useSessionStore } from '../store/session-store';
import { galleryBaseline } from './media-write-contract';
import { saveObjectWorkspaceMedia } from './object-workspace';
import type { ObjectWorkspaceMediaItem, ObjectWorkspaceMediaModule } from './object-workspace-parser';

jest.mock('../lib/supabase', () => ({ getApiClient: jest.fn(), getSupabaseClient: jest.fn() }));

const USER = 'gallery-error-test-user';
const OBJECT = 'HOT0000000000001';
const MEDIA = '00000000-0000-4000-a000-00000000f101';
const TYPE = '00000000-0000-4000-a000-00000000f102';
const KEY = `workspace-gallery-request:${USER}:${OBJECT}`;
const originalSession = useSessionStore.getState();

function raw(title = 'Original') {
  return { id: MEDIA, object_id: OBJECT, place_id: null, media_type_id: TYPE,
    title, url: 'https://example.test/photo.jpg', visibility: null, is_main: true,
    is_published: true, position: 0, updated_at: '2026-11-06T00:00:00Z' };
}

function input(): ObjectWorkspaceMediaModule {
  const photo: ObjectWorkspaceMediaItem = {
    id: MEDIA, scope: 'object', placeId: null, scopeLabel: 'Objet principal', typeId: TYPE,
    typeCode: 'photo', typeLabel: 'Photo', title: 'Original', titleTranslations: {},
    description: '', descriptionTranslations: {}, url: raw().url, credit: '', visibility: '',
    position: '0', width: '', height: '', rightsExpiresAt: '', kind: '', isMain: true,
    isPublished: true, tags: [],
  };
  const module: ObjectWorkspaceMediaModule = { typeOptions: [{ id: TYPE, code: 'photo', label: 'Photo' }],
    tagOptions: [], objectItems: [photo], placeItems: [], placeScopeUnavailableReason: null, unavailableReason: null };
  module.galleryWriteBaseline = galleryBaseline(module, [raw()]);
  module.objectItems = [{ ...photo, title: 'First intention' }];
  return module;
}

function client() {
  const rpc = jest.fn();
  jest.mocked(getApiClient).mockReturnValue({ schema: jest.fn(() => ({ rpc })) } as never);
  return rpc;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  localStorage.clear();
  useSessionStore.setState({ demoMode: false, userId: USER });
});

afterEach(() => {
  expect(getSupabaseClient).not.toHaveBeenCalled();
  useSessionStore.setState(originalSession);
  localStorage.clear();
  jest.restoreAllMocks();
});

test.each([
  ['22023', 'Le titre ne respecte pas la règle métier.', /règle métier/],
  ['PT409', 'Internal synthetic conflict detail', /vérification est déjà en cours/],
  ['23505', 'Internal synthetic unique constraint detail', /doublon/],
])('a definitive %s refusal releases the rejected intention and sends the corrected input with a new UUID', async (code, message, translated) => {
  const rpc = client();
  rpc.mockResolvedValueOnce({ data: null, error: { code, message } })
    .mockResolvedValueOnce({ data: { success: true, snapshot: [raw('Corrected intention')] }, error: null });
  const module = input();

  await expect(saveObjectWorkspaceMedia(OBJECT, module, { canEditPlaceMedia: false }))
    .rejects.toMatchObject({ code, message: expect.stringMatching(translated) });
  expect(localStorage.getItem(KEY)).toBeNull();

  module.objectItems = [{ ...module.objectItems[0], title: 'Corrected intention' }];
  const result = await saveObjectWorkspaceMedia(OBJECT, module, { canEditPlaceMedia: false });
  const first = rpc.mock.calls[0][1].p_payload;
  const second = rpc.mock.calls[1][1].p_payload;
  expect(first.rows[0].changes.title).toBe('First intention');
  expect(second.rows[0].changes.title).toBe('Corrected intention');
  expect(second.request_id).not.toBe(first.request_id);
  expect(result).toMatchObject({ media: { objectItems: [{ title: 'Corrected intention' }] } });
  expect(localStorage.getItem(KEY)).toBeNull();
});

test('a database timeout keeps the exact request and UUID for an uncertain retry', async () => {
  const rpc = client().mockResolvedValue({ data: null, error: { code: '57014', message: 'canceling statement' } });
  const module = input();
  await expect(saveObjectWorkspaceMedia(OBJECT, module, { canEditPlaceMedia: false }))
    .rejects.toMatchObject({ code: '57014', message: expect.stringMatching(/trop de temps/) });
  const pending = localStorage.getItem(KEY);
  expect(pending).not.toBeNull();
  module.objectItems = [{ ...module.objectItems[0], title: 'Later typing' }];
  await expect(saveObjectWorkspaceMedia(OBJECT, module, { canEditPlaceMedia: false })).rejects.toMatchObject({ code: '57014' });
  expect(rpc.mock.calls[1][1].p_payload).toEqual(rpc.mock.calls[0][1].p_payload);
  expect(localStorage.getItem(KEY)).toBe(pending);
});

test('a transport failure with no database response keeps the exact request and UUID', async () => {
  const rpc = client().mockRejectedValue(new Error('Synthetic connection interrupted'));
  const module = input();
  await expect(saveObjectWorkspaceMedia(OBJECT, module, { canEditPlaceMedia: false })).rejects.toThrow('Synthetic connection interrupted');
  const pending = localStorage.getItem(KEY);
  expect(pending).not.toBeNull();
  module.objectItems = [{ ...module.objectItems[0], title: 'Later typing' }];
  await expect(saveObjectWorkspaceMedia(OBJECT, module, { canEditPlaceMedia: false })).rejects.toThrow('Synthetic connection interrupted');
  expect(rpc.mock.calls[1][1].p_payload).toEqual(rpc.mock.calls[0][1].p_payload);
  expect(localStorage.getItem(KEY)).toBe(pending);
});
