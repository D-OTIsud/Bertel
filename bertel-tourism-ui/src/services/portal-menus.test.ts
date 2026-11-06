jest.mock('../lib/supabase', () => ({ getApiClient: jest.fn() }));
jest.mock('../store/session-store', () => ({ useSessionStore: { getState: () => ({ userId: 'actor-one' }) } }));
import { getApiClient } from '../lib/supabase';
import { parseObjectWorkspace } from './object-workspace-parser';
import { getPortalMenus, publishPortalMenus } from './portal-menus';

const id = '00000000-0000-4000-a000-000000009101';
const empty = () => parseObjectWorkspace({ id: 'RES1', name: 'Restaurant', type: 'RES', raw: {} }, ['fr']).menus;
const snapshot = () => ({ menus: [{ id, object_id: 'RES1', name: 'Carte', category_id: null, description: null, is_active: true, visibility: 'public', position: 1, write_token: 'a'.repeat(64) }], items: [], media: [], dietary: [], allergens: [], cuisines: [] });
const rpc = jest.fn();
beforeEach(() => {
  jest.clearAllMocks();
  window.localStorage.clear();
  (getApiClient as jest.Mock).mockReturnValue({ schema: () => ({ rpc }) });
});

it('loads only the prepared actor snapshot and attaches its opaque baseline', async () => {
  rpc.mockResolvedValue({ data: snapshot(), error: null });
  const result = await getPortalMenus('RES1', empty());
  expect(rpc).toHaveBeenCalledWith('get_portal_menus_snapshot', { p_object_id: 'RES1' });
  expect(result.items[0].recordId).toBe(id);
  expect(result.mediaOptions).toEqual([]);
  expect(result.menuWriteBaseline?.snapshot.menus[0].write_token).toBe('a'.repeat(64));
});

it('publishes a narrow patch with a distinct intention UUID and optional extraction operation', async () => {
  rpc.mockResolvedValueOnce({ data: snapshot(), error: null });
  const input = await getPortalMenus('RES1', empty());
  input.items[0].name = 'Nouvelle carte';
  const confirmed = snapshot(); confirmed.menus[0].name = 'Nouvelle carte';
  rpc.mockResolvedValueOnce({ data: { success: true, snapshot: confirmed }, error: null });
  const result = await publishPortalMenus('RES1', input, '00000000-0000-4000-a000-000000009102', 0);
  expect(rpc).toHaveBeenLastCalledWith('publish_portal_menus', {
    p_object_id: 'RES1', p_extraction_operation_id: '00000000-0000-4000-a000-000000009102',
    p_payload: expect.objectContaining({ request_id: expect.stringMatching(/^[0-9a-f-]{36}$/), extraction_draft_version: 0,
      menus: [expect.objectContaining({ id, changes: { name: 'Nouvelle carte' } })] }),
  });
  expect(result.items[0].name).toBe('Nouvelle carte');
});

it('rejects private rows or a missing token before showing a usable module', async () => {
  const privateSnapshot = snapshot(); privateSnapshot.menus[0].visibility = 'private';
  rpc.mockResolvedValue({ data: privateSnapshot, error: null });
  await expect(getPortalMenus('RES1', empty())).rejects.toThrow(/vérifiés/);
});

it('retains a local patch and explains a concurrent office correction', async () => {
  rpc.mockResolvedValueOnce({ data: snapshot(), error: null });
  const input = await getPortalMenus('RES1', empty()); input.items[0].name = 'Saisie locale';
  rpc.mockResolvedValueOnce({ data: null, error: { code: 'PT409', message: 'stale' } });
  await expect(publishPortalMenus('RES1', input)).rejects.toThrow(/menus ont changé.*saisie est conservée/);
  expect(input.items[0].name).toBe('Saisie locale');
});

it('keeps zero distinct from an unspecified price', async () => {
  const item = { id: '00000000-0000-4000-a000-000000009103', menu_id: id, name: 'Cari', description: null, price: 18 as number | null,
    currency: 'EUR', kind_id: null, unit_id: null, media_id: null, is_available: true, position: 1, section_id: null, write_token: 'b'.repeat(64) };
  const data = { ...snapshot(), items: [item] };
  rpc.mockResolvedValueOnce({ data, error: null });
  let input = await getPortalMenus('RES1', empty());
  input.items[0].items[0].price = '0';
  rpc.mockResolvedValueOnce({ data: { success: true, snapshot: { ...data, items: [{ ...item, price: 0 }] } }, error: null });
  input = await publishPortalMenus('RES1', input);
  expect(rpc.mock.calls[1][1].p_payload.items[0].changes).toEqual({ price: 0 });
  input.items[0].items[0].price = '';
  rpc.mockResolvedValueOnce({ data: { success: true, snapshot: { ...data, items: [{ ...item, price: null }] } }, error: null });
  await publishPortalMenus('RES1', input);
  expect(rpc.mock.calls[2][1].p_payload.items[0].changes).toEqual({ price: null });
});

it('never turns an unnamed new dish into a placeholder publication', async () => {
  rpc.mockResolvedValueOnce({ data: snapshot(), error: null });
  const input = await getPortalMenus('RES1', empty());
  input.items[0].items = [{ recordId: '00000000-0000-4000-a000-000000009104', name: '' }] as typeof input.items[number]['items'];
  await expect(publishPortalMenus('RES1', input)).rejects.toThrow(/Nommez.*saisie est conservée/);
  expect(rpc).toHaveBeenCalledTimes(1);
});

it('requires the extraction draft version before any publication call', async () => {
  rpc.mockResolvedValueOnce({ data: snapshot(), error: null });
  const input = await getPortalMenus('RES1', empty());
  await expect(publishPortalMenus('RES1', input, '00000000-0000-4000-a000-000000009102')).rejects.toThrow(/Rechargez le brouillon/);
  expect(rpc).toHaveBeenCalledTimes(1);
});

it('reconciles a lost successful publication with its exact old version before a new intention', async () => {
  rpc.mockResolvedValueOnce({ data: snapshot(), error: null });
  const input = await getPortalMenus('RES1', empty()); input.items[0].name = 'From extraction';
  rpc.mockRejectedValueOnce(new Error('response lost'));
  const operation = '00000000-0000-4000-a000-000000009102';
  await expect(publishPortalMenus('RES1', input, operation, 1)).rejects.toThrow('response lost');
  const sent = rpc.mock.calls[1][1];
  rpc.mockResolvedValueOnce({ data: { success: true, replayed: true, snapshot: snapshot() }, error: null });
  await expect(publishPortalMenus('RES1', input, operation, 2)).rejects.toThrow(/confirmé.*Rechargez/);
  expect(rpc.mock.calls[2][1]).toEqual(sent);
  expect(rpc.mock.calls[2][1].p_payload.extraction_draft_version).toBe(1);
  expect(input.items[0].name).toBe('From extraction');
});
