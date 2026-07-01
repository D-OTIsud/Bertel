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

import { NextRequest } from 'next/server';
import { GET } from './route';
import { authenticatePartner, checkPartnerRate } from '@/lib/partner-auth';
import { callPublicRpc } from '@/lib/public-api';

const authMock = authenticatePartner as jest.Mock;
const checkMock = checkPartnerRate as jest.Mock;
const rpcMock = callPublicRpc as jest.Mock;

function req(qs = '') {
  return new NextRequest(`http://localhost/api/public/objects${qs}`, {
    headers: { authorization: 'Bearer bk_live_' + 'a'.repeat(48) },
  });
}

beforeEach(() => {
  authMock.mockReset();
  checkMock.mockReset();
  rpcMock.mockReset();
  authMock.mockResolvedValue({ keyId: 'k1', label: 'P', scopes: [] });
  checkMock.mockResolvedValue({ allowed: true, retryAfter: 0 });
  rpcMock.mockResolvedValue({ ok: true, status: 200, body: { info: { next_cursor: 'c2' }, data: [{ id: 'X' }] } });
});

describe('GET /api/public/objects', () => {
  it('401 when unauthenticated', async () => {
    authMock.mockResolvedValue(null);
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('429 with Retry-After when the partner is rate-limited (RPC not called)', async () => {
    checkMock.mockResolvedValue({ allowed: false, retryAfter: 42 });
    const res = await GET(req());
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('42');
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('SECURITY: status is always FORCED to published (a partner can never request drafts)', async () => {
    await GET(req('?types=HOT,RES&page_size=10'));
    const [rpcName, params] = rpcMock.mock.calls[0];
    expect(rpcName).toBe('list_object_resources_page_text');
    expect(params.p_status).toEqual(['published']);
    expect(params.p_types).toEqual(['HOT', 'RES']);
    expect(params.p_page_size).toBe(10);
  });

  it('clamps page_size into [1,200]', async () => {
    await GET(req('?page_size=9999'));
    expect(rpcMock.mock.calls[0][1].p_page_size).toBe(200);
  });

  it('wraps the RPC result under the contract envelope (pagination info in meta)', async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.meta.contract_version).toBe('1.0.0');
    expect(json.meta.next_cursor).toBe('c2');
    expect(json.data).toEqual([{ id: 'X' }]);
  });
});
