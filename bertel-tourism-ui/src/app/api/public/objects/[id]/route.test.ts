/**
 * @jest-environment node
 */
jest.mock('server-only', () => ({}));
jest.mock('@/lib/partner-auth', () => ({ authenticatePartner: jest.fn(), checkPartnerRate: jest.fn(), logPartnerCall: jest.fn() }));
jest.mock('@/lib/public-api', () => ({
  callPublicRpc: jest.fn(),
  publicHeaders: () => ({ 'X-Bertel-Api-Version': '1.0.0' }),
  PUBLIC_API_CONTRACT_VERSION: '1.0.0',
}));
jest.mock('@/lib/supabase-server', () => ({ getServerSupabaseClient: jest.fn() }));

import { NextRequest } from 'next/server';
import { GET } from './route';
import { authenticatePartner, checkPartnerRate } from '@/lib/partner-auth';
import { callPublicRpc } from '@/lib/public-api';
import { getServerSupabaseClient } from '@/lib/supabase-server';

const authMock = authenticatePartner as jest.Mock;
const checkMock = checkPartnerRate as jest.Mock;
const rpcMock = callPublicRpc as jest.Mock;
const serverMock = getServerSupabaseClient as jest.Mock;

const VALID_ID = 'HOTRUN0000000001';

function req(id = VALID_ID) {
  return new NextRequest(`http://localhost/api/public/objects/${id}?lang=fr`, {
    headers: { authorization: 'Bearer bk_live_' + 'a'.repeat(48) },
  });
}
function ctx(id = VALID_ID) {
  return { params: Promise.resolve({ id }) };
}
/** Mock the service-role status-guard query: `.from('object').select('status').eq('id',id).maybeSingle()`. */
function mockStatus(row: { status: string } | null, error: unknown = null) {
  serverMock.mockReturnValue({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: row, error }) }) }) }),
  });
}

beforeEach(() => {
  authMock.mockReset();
  checkMock.mockReset();
  rpcMock.mockReset();
  serverMock.mockReset();
  authMock.mockResolvedValue({ keyId: 'k1', label: 'P', scopes: [] }); // authenticated + under rate by default
  checkMock.mockResolvedValue({ allowed: true, retryAfter: 0 });
});

describe('GET /api/public/objects/[id]', () => {
  it('401 when the partner key is missing/invalid', async () => {
    authMock.mockResolvedValue(null);
    const res = await GET(req(), ctx());
    expect(res.status).toBe(401);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('400 on a malformed object id (never reaches the DB)', async () => {
    const res = await GET(req('not-an-id'), ctx('not-an-id'));
    expect(res.status).toBe(400);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('SECURITY: a DRAFT object is 404 and get_object_resource is NEVER called (no draft leak)', async () => {
    mockStatus({ status: 'draft' });
    const res = await GET(req(), ctx());
    expect(res.status).toBe(404);
    expect(rpcMock).not.toHaveBeenCalled(); // the published-gate blocks before the resource fetch
  });

  it('SECURITY: an unknown id is 404 (indistinguishable from a draft)', async () => {
    mockStatus(null);
    const res = await GET(req(), ctx());
    expect(res.status).toBe(404);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('200 for a PUBLISHED object — fetches the resource and wraps it with the contract version', async () => {
    mockStatus({ status: 'published' });
    rpcMock.mockResolvedValue({ ok: true, status: 200, body: { id: VALID_ID, name: 'Hôtel' } });
    const res = await GET(req(), ctx());
    expect(res.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith('get_object_resource', expect.objectContaining({ p_object_id: VALID_ID }));
    const json = await res.json();
    expect(json.meta.contract_version).toBe('1.0.0');
    expect(json.data).toEqual({ id: VALID_ID, name: 'Hôtel' });
  });

  it('trims editor-only raw-i18n legs (canonical_description/org_description) from the partner payload', async () => {
    mockStatus({ status: 'published' });
    rpcMock.mockResolvedValue({
      ok: true, status: 200,
      body: { id: VALID_ID, name: 'Hôtel', canonical_description: { fr: 'raw' }, org_description: { fr: 'raw' } },
    });
    const res = await GET(req(), ctx());
    const json = await res.json();
    expect(json.data.canonical_description).toBeUndefined();
    expect(json.data.org_description).toBeUndefined();
    expect(json.data.i18n).toBeUndefined(); // no i18n block unless ?lang=all
  });

  it('?lang=all — resolves base keys in FR and merges the multi-language i18n block', async () => {
    mockStatus({ status: 'published' });
    rpcMock.mockImplementation((name: string) =>
      name === 'get_object_i18n_all'
        ? Promise.resolve({ ok: true, status: 200, body: { description: { fr: 'Bonjour', en: 'Hello' } } })
        : Promise.resolve({ ok: true, status: 200, body: { id: VALID_ID, name: 'Hôtel' } }),
    );
    const reqAll = new NextRequest(`http://localhost/api/public/objects/${VALID_ID}?lang=all`, {
      headers: { authorization: 'Bearer bk_live_' + 'a'.repeat(48) },
    });
    const res = await GET(reqAll, ctx());
    expect(res.status).toBe(200);
    // base resource resolved in FR (not "all")
    expect(rpcMock).toHaveBeenCalledWith('get_object_resource', expect.objectContaining({ p_lang_prefs: ['fr'] }));
    expect(rpcMock).toHaveBeenCalledWith('get_object_i18n_all', { p_object_id: VALID_ID });
    const json = await res.json();
    expect(json.data.i18n).toEqual({ description: { fr: 'Bonjour', en: 'Hello' } });
  });

  it('?lang=all — degrades to the base resource if the i18n block fetch fails (fail-open)', async () => {
    mockStatus({ status: 'published' });
    rpcMock.mockImplementation((name: string) =>
      name === 'get_object_i18n_all'
        ? Promise.resolve({ ok: false, status: 502, body: { error: 'upstream_error' } })
        : Promise.resolve({ ok: true, status: 200, body: { id: VALID_ID, name: 'Hôtel' } }),
    );
    const reqAll = new NextRequest(`http://localhost/api/public/objects/${VALID_ID}?lang=all`, {
      headers: { authorization: 'Bearer bk_live_' + 'a'.repeat(48) },
    });
    const res = await GET(reqAll, ctx());
    expect(res.status).toBe(200); // still 200 — the object is fully returned
    const json = await res.json();
    expect(json.data.id).toBe(VALID_ID);
    expect(json.data.i18n).toBeUndefined(); // block omitted on failure, not an error
  });

  it('?format=jsonld — merges the additive schema.org jsonld block, base keys untouched (I4)', async () => {
    mockStatus({ status: 'published' });
    const doc = { '@context': 'https://schema.org', '@type': 'Hotel', name: 'Hôtel' };
    rpcMock.mockImplementation((name: string) =>
      name === 'get_object_jsonld'
        ? Promise.resolve({ ok: true, status: 200, body: doc })
        : Promise.resolve({ ok: true, status: 200, body: { id: VALID_ID, name: 'Hôtel' } }),
    );
    const reqJl = new NextRequest(`http://localhost/api/public/objects/${VALID_ID}?format=jsonld`, {
      headers: { authorization: 'Bearer bk_live_' + 'a'.repeat(48) },
    });
    const res = await GET(reqJl, ctx());
    expect(res.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith('get_object_jsonld', { p_object_id: VALID_ID });
    const json = await res.json();
    expect(json.data.id).toBe(VALID_ID); // base keys untouched
    expect(json.data.jsonld).toEqual(doc);
  });

  it('?format=jsonld — degrades to the base resource if the jsonld block fetch fails (fail-open)', async () => {
    mockStatus({ status: 'published' });
    rpcMock.mockImplementation((name: string) =>
      name === 'get_object_jsonld'
        ? Promise.resolve({ ok: false, status: 502, body: { error: 'upstream_error' } })
        : Promise.resolve({ ok: true, status: 200, body: { id: VALID_ID, name: 'Hôtel' } }),
    );
    const reqJl = new NextRequest(`http://localhost/api/public/objects/${VALID_ID}?format=jsonld`, {
      headers: { authorization: 'Bearer bk_live_' + 'a'.repeat(48) },
    });
    const res = await GET(reqJl, ctx());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.id).toBe(VALID_ID);
    expect(json.data.jsonld).toBeUndefined(); // block omitted on failure, not an error
  });

  it('?format=jsonld — omits the block when the RPC returns null (unmapped type / unpublished)', async () => {
    mockStatus({ status: 'published' });
    rpcMock.mockImplementation((name: string) =>
      name === 'get_object_jsonld'
        ? Promise.resolve({ ok: true, status: 200, body: null })
        : Promise.resolve({ ok: true, status: 200, body: { id: VALID_ID, name: 'Hôtel' } }),
    );
    const reqJl = new NextRequest(`http://localhost/api/public/objects/${VALID_ID}?format=jsonld`, {
      headers: { authorization: 'Bearer bk_live_' + 'a'.repeat(48) },
    });
    const res = await GET(reqJl, ctx());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.jsonld).toBeUndefined(); // null body => no jsonld key (not `null`)
  });
});
