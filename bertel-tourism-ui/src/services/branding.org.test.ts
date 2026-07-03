import { getOrgBranding, saveOrgBranding } from './branding';
import { getApiClient, getSupabaseClient } from '../lib/supabase';

jest.mock('../lib/supabase', () => ({ getApiClient: jest.fn(), getSupabaseClient: jest.fn() }));
jest.mock('../store/session-store', () => ({ useSessionStore: { getState: () => ({ demoMode: false }) } }));

function mockApiRpc(result: { data?: unknown; error?: unknown }) {
  const rpc = jest.fn().mockResolvedValue(result);
  (getApiClient as jest.Mock).mockReturnValue({ schema: () => ({ rpc }) });
  return rpc;
}

beforeEach(() => {
  (getSupabaseClient as jest.Mock).mockReturnValue({ auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }) } });
});

test('getOrgBranding appelle get_org_branding et normalise {raw, resolved}', async () => {
  const rpc = mockApiRpc({ data: { orgObjectId: 'ORG1', raw: { brandName: 'A', primaryColor: null }, resolved: { brandName: 'A', primaryColor: '#000000' } }, error: null });
  const snap = await getOrgBranding('ORG1');
  expect(rpc).toHaveBeenCalledWith('get_org_branding', { p_org_object_id: 'ORG1' });
  expect(snap.orgObjectId).toBe('ORG1');
  expect(snap.raw.brandName).toBe('A');
  expect(snap.raw.primaryColor).toBeNull();
  expect(snap.raw.accentColor).toBeNull(); // champ absent -> null
  expect(snap.resolved.primaryColor).toBe('#000000');
});

test('saveOrgBranding sans logo envoie les 9 champs raw + p_reset:false', async () => {
  const rpc = mockApiRpc({ data: { orgObjectId: 'ORG1', raw: {}, resolved: {} }, error: null });
  const raw = { brandName: 'A', logoStoragePath: null, logoPublicUrl: null, logoMimeType: null, primaryColor: '#112233', accentColor: null, textColor: null, backgroundColor: null, surfaceColor: null };
  await saveOrgBranding('ORG1', { raw });
  expect(rpc).toHaveBeenCalledWith('upsert_org_branding', expect.objectContaining({
    p_org_object_id: 'ORG1', p_brand_name: 'A', p_primary_color: '#112233',
    p_logo_public_url: null, p_reset: false,
  }));
});

test('saveOrgBranding avec logoFile uploade avec orgObjectId puis upsert le trio logo', async () => {
  const rpc = mockApiRpc({ data: { orgObjectId: 'ORG1', raw: {}, resolved: {} }, error: null });
  const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ logoStoragePath: 'org/ORG1/x.png', logoPublicUrl: 'https://cdn/org/ORG1/x.png', logoMimeType: 'image/png' }) });
  global.fetch = fetchMock as never;
  const raw = { brandName: null, logoStoragePath: null, logoPublicUrl: null, logoMimeType: null, primaryColor: null, accentColor: null, textColor: null, backgroundColor: null, surfaceColor: null };
  await saveOrgBranding('ORG1', { raw, logoFile: new File([new Uint8Array([1])], 'l.png', { type: 'image/png' }) });
  expect(fetchMock).toHaveBeenCalledWith('/api/branding/logo/upload', expect.objectContaining({ method: 'POST' }));
  // le FormData envoyé contient orgObjectId
  const body = fetchMock.mock.calls[0][1].body as FormData;
  expect(body.get('orgObjectId')).toBe('ORG1');
  expect(rpc).toHaveBeenCalledWith('upsert_org_branding', expect.objectContaining({ p_logo_public_url: 'https://cdn/org/ORG1/x.png', p_reset: false }));
});

test('saveOrgBranding reset envoie p_reset:true sans upload', async () => {
  const rpc = mockApiRpc({ data: { orgObjectId: 'ORG1', raw: {}, resolved: {} }, error: null });
  const raw = { brandName: null, logoStoragePath: null, logoPublicUrl: null, logoMimeType: null, primaryColor: null, accentColor: null, textColor: null, backgroundColor: null, surfaceColor: null };
  await saveOrgBranding('ORG1', { raw, reset: true });
  expect(rpc).toHaveBeenCalledWith('upsert_org_branding', expect.objectContaining({ p_reset: true }));
});
