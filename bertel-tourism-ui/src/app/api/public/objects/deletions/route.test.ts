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
  return new NextRequest(`http://localhost/api/public/objects/deletions${qs}`, {
    headers: { authorization: 'Bearer bk_live_' + 'a'.repeat(48) },
  });
}

beforeEach(() => {
  authMock.mockReset();
  checkMock.mockReset();
  rpcMock.mockReset();
  authMock.mockResolvedValue({ keyId: 'k1', label: 'P', scopes: [] });
  checkMock.mockResolvedValue({ allowed: true, retryAfter: 0, limit: 120, remaining: 119 });
  rpcMock.mockResolvedValue({
    ok: true,
    status: 200,
    body: { tombstones: [{ object_id: 'X', type: 'HOT', deleted_at: '2026-05-01T00:00:00Z' }], cursor: '2026-05-01T00:00:00Z', count: 1 },
  });
});

describe('GET /api/public/objects/deletions', () => {
  it('401 when unauthenticated (RPC not called)', async () => {
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

  it('400 on a malformed `since` (rejected at the boundary, RPC not called)', async () => {
    const res = await GET(req('?since=not-a-date'));
    expect(res.status).toBe(400);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('400 bad_request on a non-ISO but Date-parseable `since` (e.g. "July 3, 2026")', async () => {
    const res = await GET(req('?since=' + encodeURIComponent('July 3, 2026')));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('bad_request');
    expect(json.detail).toBe('since must be an ISO 8601 timestamp');
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('200 on a strict ISO 8601 date-time `since` (behavior unchanged)', async () => {
    const res = await GET(req('?since=2026-07-03T00:00:00Z'));
    expect(res.status).toBe(200);
    expect(rpcMock).toHaveBeenCalled();
    expect(rpcMock.mock.calls[0][1].p_since).toBe('2026-07-03T00:00:00.000Z');
  });

  it('passes a normalized ISO `since` and clamps `limit` to [1,1000]', async () => {
    await GET(req('?since=2026-05-01T12:00:00%2B02:00&limit=9999'));
    const [rpcName, params] = rpcMock.mock.calls[0];
    expect(rpcName).toBe('list_deleted_objects_since');
    expect(params.p_since).toBe('2026-05-01T10:00:00.000Z'); // +02:00 normalized to UTC
    expect(params.p_limit).toBe(1000);
  });

  it('defaults to full history (p_since null) and limit 500 when unspecified', async () => {
    await GET(req());
    const params = rpcMock.mock.calls[0][1];
    expect(params.p_since).toBeNull();
    expect(params.p_limit).toBe(500);
  });

  it('wraps the feed: cursor/count in meta, data = the tombstones array', async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.meta.contract_version).toBe('1.0.0');
    expect(json.meta.cursor).toBe('2026-05-01T00:00:00Z');
    expect(json.meta.count).toBe(1);
    expect(json.data).toEqual([{ object_id: 'X', type: 'HOT', deleted_at: '2026-05-01T00:00:00Z' }]);
  });
});
