/**
 * @jest-environment node
 */
jest.mock('server-only', () => ({}));
jest.mock('@/lib/partner-auth', () => ({ authenticatePartner: jest.fn(), logPartnerCall: jest.fn() }));
jest.mock('@/lib/public-api', () => ({
  callPublicRpc: jest.fn(),
  publicHeaders: () => ({ 'X-Bertel-Api-Version': '1.0.0' }),
  PUBLIC_API_CONTRACT_VERSION: '1.0.0',
}));
jest.mock('@/lib/supabase-server', () => ({ getServerSupabaseClient: jest.fn() }));

import { NextRequest } from 'next/server';
import { GET } from './route';
import { authenticatePartner } from '@/lib/partner-auth';
import { callPublicRpc } from '@/lib/public-api';
import { getServerSupabaseClient } from '@/lib/supabase-server';

const authMock = authenticatePartner as jest.Mock;
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
  rpcMock.mockReset();
  serverMock.mockReset();
  authMock.mockResolvedValue({ keyId: 'k1', label: 'P', scopes: [] }); // authenticated by default
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
});
